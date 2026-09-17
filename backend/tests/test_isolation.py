"""Every board, column and card endpoint must refuse another user's ids."""

import pytest
from fastapi.testclient import TestClient

from tests.helpers import first_board

ATTACKS = [
    ("get", "/api/boards/{board}", None),
    ("patch", "/api/boards/{board}", {"name": "pwned"}),
    ("delete", "/api/boards/{board}", None),
    ("post", "/api/boards/{board}/columns", {"title": "pwned"}),
    ("post", "/api/boards/{board}/chat", {"message": "hi"}),
    ("patch", "/api/columns/{column}", {"title": "pwned"}),
    ("delete", "/api/columns/{column}", None),
    ("post", "/api/columns/{column}/move", {"index": 0}),
    ("post", "/api/columns/{column}/cards", {"title": "pwned"}),
    ("patch", "/api/cards/{card}", {"title": "pwned"}),
    ("delete", "/api/cards/{card}", None),
    ("post", "/api/cards/{card}/move", {"column_id": "{column}"}),
    ("post", "/api/cards/{mallory_card}/move", {"column_id": "{column}"}),
    ("post", "/api/cards/{card}/checklist", {"text": "pwned"}),
    ("post", "/api/boards/{board}/labels", {"name": "pwned", "color": "blue"}),
    ("patch", "/api/labels/{label}", {"name": "pwned"}),
    ("delete", "/api/labels/{label}", None),
    ("patch", "/api/checklist/{item}", {"done": False}),
    ("delete", "/api/checklist/{item}", None),
]

# Attaching someone else's label to your own card is a bad request, not a lookup miss.
FOREIGN_LABEL = ("patch", "/api/cards/{mallory_card}", {"label_ids": ["{label}"]})


@pytest.mark.parametrize(
    "method,path,body,status",
    [(*attack, 404) for attack in ATTACKS] + [(*FOREIGN_LABEL, 400)],
)


def test_other_users_resources_are_refused(
    client: TestClient,
    make_user,
    monkeypatch,
    method: str,
    path: str,
    body: dict | None,
    status: int,
) -> None:
    monkeypatch.setattr(
        "app.chat.chat_completion", lambda *args: pytest.fail("chat must not run")
    )
    victim_before = first_board(client)
    ids = {
        "board": victim_before["id"],
        "column": victim_before["columns"][0]["id"],
        "card": victim_before["columns"][0]["cards"][0]["id"],
        "label": victim_before["labels"][0]["id"],
        "item": victim_before["columns"][0]["cards"][0]["checklist"][0]["id"],
    }
    mallory = make_user("mallory", "mallory-password")
    ids["mallory_card"] = mallory.post(
        f"/api/columns/{first_board(mallory)['columns'][0]['id']}/cards",
        json={"title": "mine"},
    ).json()["id"]

    def fill(value):
        if isinstance(value, str):
            return value.format(**ids)
        if isinstance(value, list):
            return [fill(item) for item in value]
        return value

    kwargs = {"json": {k: fill(v) for k, v in body.items()}} if body else {}
    response = mallory.request(method.upper(), fill(path), **kwargs)

    assert response.status_code == status
    assert first_board(client) == victim_before
