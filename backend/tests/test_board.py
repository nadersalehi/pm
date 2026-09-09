import pytest
from fastapi.testclient import TestClient

from app.db import DB_PATH, init_db
from app.main import app

SEED_COLUMN_TITLES = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


@pytest.fixture(autouse=True)
def reset_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()
    yield


@pytest.fixture
def client() -> TestClient:
    c = TestClient(app)
    response = c.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert response.status_code == 200
    return c


def test_board_requires_auth() -> None:
    response = TestClient(app).get("/api/board")
    assert response.status_code == 401


def test_missing_db_file_is_created_and_seeded(client: TestClient) -> None:
    assert DB_PATH.exists()
    response = client.get("/api/board")
    assert response.status_code == 200
    board = response.json()
    assert [column["title"] for column in board["columns"]] == SEED_COLUMN_TITLES
    assert [card["title"] for card in board["columns"][0]["cards"]] == [
        "Align roadmap themes",
        "Gather customer signals",
    ]


def test_rename_column(client: TestClient) -> None:
    board = client.get("/api/board").json()
    column_id = board["columns"][0]["id"]

    response = client.patch(f"/api/columns/{column_id}", json={"title": "Ideas"})
    assert response.status_code == 200
    assert response.json()["title"] == "Ideas"

    board = client.get("/api/board").json()
    assert board["columns"][0]["title"] == "Ideas"


def test_rename_nonexistent_column_returns_404(client: TestClient) -> None:
    response = client.patch("/api/columns/col-9999", json={"title": "Ideas"})
    assert response.status_code == 404


def test_add_card(client: TestClient) -> None:
    board = client.get("/api/board").json()
    column_id = board["columns"][0]["id"]

    response = client.post(
        f"/api/columns/{column_id}/cards",
        json={"title": "New card", "details": "Some notes"},
    )
    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "New card"

    board = client.get("/api/board").json()
    titles = [card["title"] for card in board["columns"][0]["cards"]]
    assert titles[-1] == "New card"


def test_add_card_to_nonexistent_column_returns_404(client: TestClient) -> None:
    response = client.post(
        "/api/columns/col-9999/cards", json={"title": "New card"}
    )
    assert response.status_code == 404


def test_update_card(client: TestClient) -> None:
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cards"][0]["id"]

    response = client.patch(f"/api/cards/{card_id}", json={"title": "Updated title"})
    assert response.status_code == 200
    assert response.json()["title"] == "Updated title"
    assert response.json()["details"] != ""


def test_delete_card(client: TestClient) -> None:
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cards"][0]["id"]

    response = client.delete(f"/api/cards/{card_id}")
    assert response.status_code == 204

    board = client.get("/api/board").json()
    remaining_ids = [card["id"] for card in board["columns"][0]["cards"]]
    assert card_id not in remaining_ids


def test_delete_card_twice_returns_404_on_second_attempt(client: TestClient) -> None:
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cards"][0]["id"]

    assert client.delete(f"/api/cards/{card_id}").status_code == 204
    assert client.delete(f"/api/cards/{card_id}").status_code == 404


def test_move_card_within_same_column_reorders(client: TestClient) -> None:
    board = client.get("/api/board").json()
    first_column = board["columns"][0]
    column_id = first_column["id"]
    first_card_id = first_column["cards"][0]["id"]

    response = client.post(
        f"/api/cards/{first_card_id}/move",
        json={"column_id": column_id, "index": 1},
    )
    assert response.status_code == 200

    board = client.get("/api/board").json()
    ids = [card["id"] for card in board["columns"][0]["cards"]]
    assert ids[1] == first_card_id


def test_move_card_to_another_column(client: TestClient) -> None:
    board = client.get("/api/board").json()
    source_column = board["columns"][0]
    destination_column = board["columns"][1]
    card_id = source_column["cards"][0]["id"]

    response = client.post(
        f"/api/cards/{card_id}/move",
        json={"column_id": destination_column["id"], "index": 0},
    )
    assert response.status_code == 200

    board = client.get("/api/board").json()
    source_ids = [card["id"] for card in board["columns"][0]["cards"]]
    destination_ids = [card["id"] for card in board["columns"][1]["cards"]]
    assert card_id not in source_ids
    assert destination_ids[0] == card_id


def test_move_card_to_nonexistent_column_returns_404(client: TestClient) -> None:
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cards"][0]["id"]

    response = client.post(
        f"/api/cards/{card_id}/move", json={"column_id": "col-9999"}
    )
    assert response.status_code == 404
