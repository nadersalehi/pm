from fastapi.testclient import TestClient

from tests.helpers import first_board


def column_card_titles(client: TestClient, index: int) -> list[str]:
    return [card["title"] for card in first_board(client)["columns"][index]["cards"]]


def test_add_card(client: TestClient) -> None:
    column_id = first_board(client)["columns"][0]["id"]
    response = client.post(
        f"/api/columns/{column_id}/cards",
        json={"title": "New card", "details": "Notes", "priority": "high", "due_date": "2026-10-01"},
    )
    assert response.status_code == 201
    card = response.json()
    assert card["id"].startswith("card-")
    assert card == {
        "id": card["id"],
        "title": "New card",
        "details": "Notes",
        "priority": "high",
        "due_date": "2026-10-01",
        "label_ids": [],
        "checklist": [],
    }
    assert column_card_titles(client, 0)[-1] == "New card"


def test_add_card_defaults(client: TestClient) -> None:
    column_id = first_board(client)["columns"][1]["id"]
    card = client.post(f"/api/columns/{column_id}/cards", json={"title": "Bare"}).json()
    assert card["details"] == ""
    assert card["priority"] == "none"
    assert card["due_date"] is None


def test_add_card_validation(client: TestClient) -> None:
    column_id = first_board(client)["columns"][0]["id"]
    for payload in (
        {"title": ""},
        {"title": "x" * 201},
        {"title": "ok", "priority": "urgent"},
        {"title": "ok", "due_date": "not-a-date"},
    ):
        assert client.post(f"/api/columns/{column_id}/cards", json=payload).status_code == 422


def test_add_card_to_nonexistent_column_returns_404(client: TestClient) -> None:
    assert client.post("/api/columns/col-9999/cards", json={"title": "X"}).status_code == 404


def test_update_card_changes_only_given_fields(client: TestClient) -> None:
    card = first_board(client)["columns"][0]["cards"][0]
    response = client.patch(f"/api/cards/{card['id']}", json={"title": "Updated"})
    assert response.status_code == 200
    assert response.json() == {**card, "title": "Updated"}

    response = client.patch(
        f"/api/cards/{card['id']}",
        json={"details": "New details", "priority": "low", "due_date": "2026-12-24"},
    )
    assert response.json() == {
        **card,
        "title": "Updated",
        "details": "New details",
        "priority": "low",
        "due_date": "2026-12-24",
    }
    assert first_board(client)["columns"][0]["cards"][0] == response.json()


def test_update_card_clears_due_date_with_null(client: TestClient) -> None:
    card = first_board(client)["columns"][0]["cards"][0]
    client.patch(f"/api/cards/{card['id']}", json={"due_date": "2026-12-24"})
    response = client.patch(f"/api/cards/{card['id']}", json={"due_date": None})
    assert response.json()["due_date"] is None


def test_update_card_ignores_null_for_required_fields(client: TestClient) -> None:
    card = first_board(client)["columns"][0]["cards"][0]
    response = client.patch(
        f"/api/cards/{card['id']}", json={"title": None, "details": None, "priority": None}
    )
    assert response.status_code == 200
    assert response.json() == card


def test_delete_card(client: TestClient) -> None:
    card = first_board(client)["columns"][0]["cards"][0]
    assert client.delete(f"/api/cards/{card['id']}").status_code == 204
    assert card["title"] not in column_card_titles(client, 0)
    assert client.delete(f"/api/cards/{card['id']}").status_code == 404


def test_move_card_within_same_column_reorders(client: TestClient) -> None:
    column = first_board(client)["columns"][0]
    first, second = column["cards"]
    response = client.post(
        f"/api/cards/{second['id']}/move", json={"column_id": column["id"], "index": 0}
    )
    assert response.status_code == 200
    assert column_card_titles(client, 0) == [second["title"], first["title"]]


def test_move_card_to_another_column(client: TestClient) -> None:
    board = first_board(client)
    card = board["columns"][0]["cards"][0]
    target = board["columns"][1]
    response = client.post(
        f"/api/cards/{card['id']}/move", json={"column_id": target["id"], "index": 0}
    )
    assert response.status_code == 200
    assert column_card_titles(client, 0) == ["Gather customer signals"]
    assert column_card_titles(client, 1) == [card["title"], "Prototype analytics view"]


def test_move_card_without_index_appends(client: TestClient) -> None:
    board = first_board(client)
    card = board["columns"][0]["cards"][0]
    client.post(f"/api/cards/{card['id']}/move", json={"column_id": board["columns"][2]["id"]})
    assert column_card_titles(client, 2)[-1] == card["title"]


def test_move_card_clamps_large_index(client: TestClient) -> None:
    board = first_board(client)
    card = board["columns"][0]["cards"][0]
    client.post(
        f"/api/cards/{card['id']}/move",
        json={"column_id": board["columns"][4]["id"], "index": 50},
    )
    assert column_card_titles(client, 4)[-1] == card["title"]


def test_move_card_to_nonexistent_column_returns_404(client: TestClient) -> None:
    card = first_board(client)["columns"][0]["cards"][0]
    response = client.post(f"/api/cards/{card['id']}/move", json={"column_id": "col-9999"})
    assert response.status_code == 404


def test_move_card_to_other_board_is_rejected(client: TestClient) -> None:
    card = first_board(client)["columns"][0]["cards"][0]
    other = client.post("/api/boards", json={"name": "Other"}).json()
    response = client.post(
        f"/api/cards/{card['id']}/move", json={"column_id": other["columns"][0]["id"]}
    )
    assert response.status_code == 400
    assert column_card_titles(client, 0)[0] == card["title"]
