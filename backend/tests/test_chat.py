import pytest
from fastapi.testclient import TestClient

from app.ai import ChatReply, Operation
from app.db import DB_PATH, init_db
from app.main import app


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


def test_chat_requires_auth() -> None:
    response = TestClient(app).post("/api/chat", json={"message": "hi"})
    assert response.status_code == 401


def test_chat_reply_only_does_not_change_board(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.chat.chat_completion",
        lambda board, history, message: ChatReply(
            reply="The Backlog column has 2 cards.", operations=[]
        ),
    )
    before = client.get("/api/board").json()

    response = client.post("/api/chat", json={"message": "how many cards in Backlog?"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "The Backlog column has 2 cards."
    assert body["board"] == before


def test_chat_with_operation_mutates_board(client: TestClient, monkeypatch) -> None:
    board = client.get("/api/board").json()
    backlog_id = board["columns"][0]["id"]

    monkeypatch.setattr(
        "app.chat.chat_completion",
        lambda board, history, message: ChatReply(
            reply="Added it.",
            operations=[
                Operation(
                    op="add_card",
                    column_id=backlog_id,
                    title="Test AI Card",
                    details="",
                )
            ],
        ),
    )

    response = client.post(
        "/api/chat", json={"message": "add a card called Test AI Card to Backlog"}
    )
    assert response.status_code == 200
    titles = [card["title"] for card in response.json()["board"]["columns"][0]["cards"]]
    assert "Test AI Card" in titles

    board = client.get("/api/board").json()
    titles = [card["title"] for card in board["columns"][0]["cards"]]
    assert "Test AI Card" in titles


def test_chat_malformed_operation_does_not_crash(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.chat.chat_completion",
        lambda board, history, message: ChatReply(
            reply="Done.",
            operations=[Operation(op="add_card", column_id="col-9999", title="X")],
        ),
    )
    before = client.get("/api/board").json()

    response = client.post("/api/chat", json={"message": "add a card to a fake column"})
    assert response.status_code == 200
    assert response.json()["reply"] == "Done."
    assert response.json()["board"] == before


def test_chat_live_add_card_to_backlog(client: TestClient) -> None:
    # Live call against OpenRouter - proves the full structured-output path
    # (LLM call -> parsed operations -> DB mutation) works end to end.
    # Not mocked, requires network.
    response = client.post(
        "/api/chat",
        json={"message": "Add a card called 'Test AI Card' to the Backlog column."},
    )
    assert response.status_code == 200
    board = response.json()["board"]
    backlog = board["columns"][0]
    assert backlog["title"] == "Backlog"
    assert any(card["title"] == "Test AI Card" for card in backlog["cards"])
