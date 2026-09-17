import pytest
from fastapi.testclient import TestClient


def test_me_requires_auth(anon: TestClient) -> None:
    assert anon.get("/api/me").status_code == 401


def test_login_rejects_wrong_password(anon: TestClient) -> None:
    response = anon.post("/api/login", json={"username": "user", "password": "wrong"})
    assert response.status_code == 401
    assert anon.get("/api/me").status_code == 401


def test_login_rejects_unknown_user(anon: TestClient) -> None:
    response = anon.post("/api/login", json={"username": "nobody", "password": "password"})
    assert response.status_code == 401


def test_login_logout_flow(anon: TestClient) -> None:
    response = anon.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert anon.get("/api/me").json() == {"username": "user"}

    assert anon.post("/api/logout").status_code == 204
    assert anon.get("/api/me").status_code == 401


def test_login_username_is_case_insensitive(anon: TestClient) -> None:
    response = anon.post("/api/login", json={"username": "USER", "password": "password"})
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_register_logs_in_and_creates_starter_board(anon: TestClient) -> None:
    response = anon.post(
        "/api/register", json={"username": "alice", "password": "alice-password"}
    )
    assert response.status_code == 201
    assert anon.get("/api/me").json() == {"username": "alice"}
    boards = anon.get("/api/boards").json()
    assert [board["name"] for board in boards] == ["My First Board"]


def test_registered_user_can_log_in_again(make_user, anon: TestClient) -> None:
    make_user("bob", "bob-password")
    response = anon.post("/api/login", json={"username": "bob", "password": "bob-password"})
    assert response.status_code == 200


def test_register_rejects_duplicate_username_case_insensitively(
    make_user, anon: TestClient
) -> None:
    make_user("alice")
    response = anon.post(
        "/api/register", json={"username": "ALICE", "password": "another-password"}
    )
    assert response.status_code == 409
    assert anon.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {"username": "al", "password": "long-enough"},
        {"username": "has space", "password": "long-enough"},
        {"username": "a" * 33, "password": "long-enough"},
        {"username": "alice", "password": "short"},
    ],
)
def test_register_validates_input(anon: TestClient, payload: dict) -> None:
    assert anon.post("/api/register", json=payload).status_code == 422


def test_change_password(client: TestClient, anon: TestClient) -> None:
    wrong = client.post(
        "/api/me/password",
        json={"current_password": "nope", "new_password": "new-password"},
    )
    assert wrong.status_code == 403

    response = client.post(
        "/api/me/password",
        json={"current_password": "password", "new_password": "new-password"},
    )
    assert response.status_code == 204
    old = anon.post("/api/login", json={"username": "user", "password": "password"})
    assert old.status_code == 401
    new = anon.post("/api/login", json={"username": "user", "password": "new-password"})
    assert new.status_code == 200


def test_change_password_validates_new_password(client: TestClient) -> None:
    response = client.post(
        "/api/me/password", json={"current_password": "password", "new_password": "short"}
    )
    assert response.status_code == 422


def test_delete_account_requires_password(client: TestClient) -> None:
    assert client.post("/api/me/delete", json={"password": "nope"}).status_code == 403
    assert client.get("/api/me").status_code == 200


def test_delete_account_removes_user_and_data(client: TestClient, anon: TestClient, db) -> None:
    response = client.post("/api/me/delete", json={"password": "password"})
    assert response.status_code == 204
    assert client.get("/api/me").status_code == 401
    login = anon.post("/api/login", json={"username": "user", "password": "password"})
    assert login.status_code == 401
    for table in ("users", "boards", "columns", "cards"):
        assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0


def test_session_of_deleted_user_is_rejected(make_user) -> None:
    alice = make_user("alice", "alice-password")
    stale_cookies = dict(alice.cookies)
    assert alice.post("/api/me/delete", json={"password": "alice-password"}).status_code == 204

    alice.cookies.update(stale_cookies)
    assert alice.get("/api/me").status_code == 401
    assert alice.get("/api/boards").status_code == 401
