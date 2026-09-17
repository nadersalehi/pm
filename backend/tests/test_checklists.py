from fastapi.testclient import TestClient

from tests.helpers import first_board


def first_card(client: TestClient) -> dict:
    return first_board(client)["columns"][0]["cards"][0]


def test_demo_card_has_a_checklist(client: TestClient) -> None:
    checklist = first_card(client)["checklist"]
    assert [(item["text"], item["done"]) for item in checklist] == [
        ("Collect last quarter's metrics", True),
        ("Draft three themes", False),
    ]


def test_add_items_in_order(client: TestClient) -> None:
    card = first_card(client)
    for text in ("Third", "Fourth"):
        response = client.post(f"/api/cards/{card['id']}/checklist", json={"text": text})
        assert response.status_code == 201
        assert response.json()["done"] is False
    assert [item["text"] for item in first_card(client)["checklist"]][-2:] == ["Third", "Fourth"]


def test_item_validation(client: TestClient) -> None:
    url = f"/api/cards/{first_card(client)['id']}/checklist"
    assert client.post(url, json={"text": "  "}).status_code == 422
    assert client.post(url, json={"text": "x" * 301}).status_code == 422
    assert client.post("/api/cards/card-9999/checklist", json={"text": "x"}).status_code == 404


def test_toggle_and_rename_item(client: TestClient) -> None:
    item = first_card(client)["checklist"][1]
    response = client.patch(f"/api/checklist/{item['id']}", json={"done": True})
    assert response.json() == {**item, "done": True}
    response = client.patch(f"/api/checklist/{item['id']}", json={"text": "Draft four themes"})
    assert response.json() == {**item, "done": True, "text": "Draft four themes"}
    assert first_card(client)["checklist"][1] == response.json()


def test_delete_item(client: TestClient) -> None:
    item = first_card(client)["checklist"][0]
    assert client.delete(f"/api/checklist/{item['id']}").status_code == 204
    assert item not in first_card(client)["checklist"]
    assert client.patch(f"/api/checklist/{item['id']}", json={"done": True}).status_code == 404


def test_deleting_a_card_removes_its_checklist(client: TestClient, db) -> None:
    client.delete(f"/api/cards/{first_card(client)['id']}")
    assert db.execute("SELECT COUNT(*) FROM checklist_items").fetchone()[0] == 0


def test_checklist_moves_with_the_card(client: TestClient) -> None:
    board = first_board(client)
    card = board["columns"][0]["cards"][0]
    response = client.post(
        f"/api/cards/{card['id']}/move", json={"column_id": board["columns"][3]["id"]}
    )
    assert response.json()["checklist"] == card["checklist"]
