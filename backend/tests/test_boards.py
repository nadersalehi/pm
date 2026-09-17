from fastapi.testclient import TestClient

from app.db import DEFAULT_COLUMNS, DB_PATH
from tests.helpers import first_board


def test_boards_require_auth(anon: TestClient) -> None:
    assert anon.get("/api/boards").status_code == 401
    assert anon.post("/api/boards", json={"name": "x"}).status_code == 401


def test_missing_db_file_is_created_and_seeded(client: TestClient) -> None:
    assert DB_PATH.exists()
    boards = client.get("/api/boards").json()
    assert boards == [
        {"id": boards[0]["id"], "name": "Product Roadmap", "description": "", "card_count": 8}
    ]
    board = first_board(client)
    assert [column["title"] for column in board["columns"]] == DEFAULT_COLUMNS
    assert [card["title"] for card in board["columns"][0]["cards"]] == [
        "Align roadmap themes",
        "Gather customer signals",
    ]
    assert board["columns"][0]["cards"][0]["priority"] == "high"


def test_create_board_has_default_empty_columns(client: TestClient) -> None:
    response = client.post(
        "/api/boards", json={"name": "  Launch plan  ", "description": "Q4 launch"}
    )
    assert response.status_code == 201
    board = response.json()
    assert board["name"] == "Launch plan"
    assert board["description"] == "Q4 launch"
    assert [column["title"] for column in board["columns"]] == DEFAULT_COLUMNS
    assert all(column["cards"] == [] for column in board["columns"])

    names = [summary["name"] for summary in client.get("/api/boards").json()]
    assert names == ["Product Roadmap", "Launch plan"]
    assert client.get(f"/api/boards/{board['id']}").json() == board


def test_create_board_rejects_blank_name(client: TestClient) -> None:
    assert client.post("/api/boards", json={"name": "   "}).status_code == 422


def test_update_board(client: TestClient) -> None:
    board_id = first_board(client)["id"]
    response = client.patch(f"/api/boards/{board_id}", json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["description"] == ""

    response = client.patch(f"/api/boards/{board_id}", json={"description": "Notes"})
    assert response.json()["name"] == "Renamed"
    assert response.json()["description"] == "Notes"


def test_delete_board_cascades(client: TestClient, db) -> None:
    board_id = first_board(client)["id"]
    assert client.delete(f"/api/boards/{board_id}").status_code == 204
    assert client.get(f"/api/boards/{board_id}").status_code == 404
    assert client.get("/api/boards").json() == []
    assert db.execute("SELECT COUNT(*) FROM columns").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 0


def test_malformed_board_ids_return_404(client: TestClient) -> None:
    for ref in ("board-999", "col-1", "board-abc", "board-", "nonsense"):
        assert client.get(f"/api/boards/{ref}").status_code == 404


def test_card_count_tracks_cards(client: TestClient) -> None:
    board = first_board(client)
    column_id = board["columns"][0]["id"]
    client.post(f"/api/columns/{column_id}/cards", json={"title": "Extra"})
    assert client.get("/api/boards").json()[0]["card_count"] == 9
