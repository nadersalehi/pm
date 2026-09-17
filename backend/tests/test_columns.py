from fastapi.testclient import TestClient

from tests.helpers import first_board


def column_titles(client: TestClient) -> list[str]:
    return [column["title"] for column in first_board(client)["columns"]]


def test_rename_column(client: TestClient) -> None:
    column_id = first_board(client)["columns"][0]["id"]
    response = client.patch(f"/api/columns/{column_id}", json={"title": "Ideas"})
    assert response.status_code == 204
    assert column_titles(client)[0] == "Ideas"


def test_rename_column_rejects_blank_title(client: TestClient) -> None:
    column_id = first_board(client)["columns"][0]["id"]
    assert client.patch(f"/api/columns/{column_id}", json={"title": ""}).status_code == 422


def test_rename_nonexistent_column_returns_404(client: TestClient) -> None:
    assert client.patch("/api/columns/col-9999", json={"title": "Ideas"}).status_code == 404


def test_add_column_appends(client: TestClient) -> None:
    board_id = first_board(client)["id"]
    response = client.post(f"/api/boards/{board_id}/columns", json={"title": "Blocked"})
    assert response.status_code == 201
    assert response.json()["title"] == "Blocked"
    assert response.json()["cards"] == []
    assert column_titles(client)[-1] == "Blocked"


def test_delete_column_removes_its_cards(client: TestClient, db) -> None:
    board = first_board(client)
    backlog = board["columns"][0]
    assert client.delete(f"/api/columns/{backlog['id']}").status_code == 204
    assert column_titles(client) == ["Discovery", "In Progress", "Review", "Done"]
    card_ids = [int(card["id"].removeprefix("card-")) for card in backlog["cards"]]
    rows = db.execute(
        f"SELECT COUNT(*) FROM cards WHERE id IN ({','.join('?' * len(card_ids))})", card_ids
    ).fetchone()[0]
    assert rows == 0


def test_delete_column_keeps_positions_contiguous(client: TestClient) -> None:
    board = first_board(client)
    client.delete(f"/api/columns/{board['columns'][1]['id']}")
    added = client.post(f"/api/boards/{board['id']}/columns", json={"title": "Last"})
    assert added.status_code == 201
    assert column_titles(client) == ["Backlog", "In Progress", "Review", "Done", "Last"]


def test_move_column(client: TestClient) -> None:
    done = first_board(client)["columns"][4]["id"]
    assert client.post(f"/api/columns/{done}/move", json={"index": 0}).status_code == 204
    assert column_titles(client) == ["Done", "Backlog", "Discovery", "In Progress", "Review"]

    assert client.post(f"/api/columns/{done}/move", json={"index": 99}).status_code == 204
    assert column_titles(client)[-1] == "Done"


def test_move_column_rejects_negative_index(client: TestClient) -> None:
    column_id = first_board(client)["columns"][0]["id"]
    assert client.post(f"/api/columns/{column_id}/move", json={"index": -1}).status_code == 422
