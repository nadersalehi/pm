from fastapi.testclient import TestClient

from tests.helpers import first_board


def labels(client: TestClient) -> list[dict]:
    return first_board(client)["labels"]


def test_demo_board_has_labels_and_a_labelled_card(client: TestClient) -> None:
    board = first_board(client)
    names = [label["name"] for label in board["labels"]]
    assert names == ["Design", "Research", "Strategy"]
    strategy = next(label for label in board["labels"] if label["name"] == "Strategy")
    assert board["columns"][0]["cards"][0]["label_ids"] == [strategy["id"]]


def test_create_label(client: TestClient) -> None:
    board_id = first_board(client)["id"]
    response = client.post(
        f"/api/boards/{board_id}/labels", json={"name": " Bug ", "color": "navy"}
    )
    assert response.status_code == 201
    label = response.json()
    assert label["name"] == "Bug"
    assert label["color"] == "navy"
    assert label in labels(client)


def test_label_validation_and_duplicates(client: TestClient) -> None:
    board_id = first_board(client)["id"]
    url = f"/api/boards/{board_id}/labels"
    assert client.post(url, json={"name": "", "color": "blue"}).status_code == 422
    assert client.post(url, json={"name": "x" * 41, "color": "blue"}).status_code == 422
    assert client.post(url, json={"name": "Bug", "color": "red"}).status_code == 422
    assert client.post(url, json={"name": "strategy", "color": "blue"}).status_code == 409


def test_same_label_name_is_allowed_on_another_board(client: TestClient) -> None:
    other = client.post("/api/boards", json={"name": "Other"}).json()
    response = client.post(
        f"/api/boards/{other['id']}/labels", json={"name": "Strategy", "color": "gray"}
    )
    assert response.status_code == 201


def test_update_label(client: TestClient) -> None:
    label = labels(client)[0]
    response = client.patch(f"/api/labels/{label['id']}", json={"color": "gray"})
    assert response.json() == {**label, "color": "gray"}
    response = client.patch(f"/api/labels/{label['id']}", json={"name": "UX"})
    assert response.json() == {**label, "color": "gray", "name": "UX"}


def test_rename_label_to_existing_name_conflicts(client: TestClient) -> None:
    design, research, _ = labels(client)
    response = client.patch(f"/api/labels/{design['id']}", json={"name": research["name"]})
    assert response.status_code == 409


def test_delete_label_unassigns_it(client: TestClient) -> None:
    strategy = next(label for label in labels(client) if label["name"] == "Strategy")
    assert client.delete(f"/api/labels/{strategy['id']}").status_code == 204
    board = first_board(client)
    assert strategy not in board["labels"]
    assert board["columns"][0]["cards"][0]["label_ids"] == []
    assert client.delete(f"/api/labels/{strategy['id']}").status_code == 404


def test_assign_labels_to_a_card(client: TestClient) -> None:
    board = first_board(client)
    design, research, _ = board["labels"]
    card = board["columns"][1]["cards"][0]

    response = client.patch(
        f"/api/cards/{card['id']}", json={"label_ids": [research["id"], design["id"]]}
    )
    assert response.status_code == 200
    assert sorted(response.json()["label_ids"]) == sorted([design["id"], research["id"]])

    response = client.patch(f"/api/cards/{card['id']}", json={"title": "Keeps labels"})
    assert len(response.json()["label_ids"]) == 2

    response = client.patch(f"/api/cards/{card['id']}", json={"label_ids": []})
    assert response.json()["label_ids"] == []


def test_create_card_with_labels(client: TestClient) -> None:
    board = first_board(client)
    design = board["labels"][0]
    response = client.post(
        f"/api/columns/{board['columns'][0]['id']}/cards",
        json={"title": "Labelled", "label_ids": [design["id"], design["id"]]},
    )
    assert response.status_code == 201
    assert response.json()["label_ids"] == [design["id"]]


def test_labels_from_another_board_are_rejected_atomically(client: TestClient) -> None:
    board = first_board(client)
    other = client.post("/api/boards", json={"name": "Other"}).json()
    foreign = client.post(
        f"/api/boards/{other['id']}/labels", json={"name": "Foreign", "color": "blue"}
    ).json()
    card = board["columns"][0]["cards"][0]

    response = client.patch(
        f"/api/cards/{card['id']}", json={"title": "Changed", "label_ids": [foreign["id"]]}
    )
    assert response.status_code == 400
    assert first_board(client)["columns"][0]["cards"][0] == card

    response = client.post(
        f"/api/columns/{board['columns'][0]['id']}/cards",
        json={"title": "Should not exist", "label_ids": [foreign["id"]]},
    )
    assert response.status_code == 400
    assert first_board(client) == board


def test_deleting_a_board_removes_its_labels(client: TestClient, db) -> None:
    board_id = first_board(client)["id"]
    client.delete(f"/api/boards/{board_id}")
    assert db.execute("SELECT COUNT(*) FROM labels").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM card_labels").fetchone()[0] == 0
