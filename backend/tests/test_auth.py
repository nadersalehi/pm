import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_me_requires_auth(client: TestClient) -> None:
    response = client.get("/api/me")
    assert response.status_code == 401


def test_login_rejects_wrong_credentials(client: TestClient) -> None:
    response = client.post(
        "/api/login", json={"username": "user", "password": "wrong"}
    )
    assert response.status_code == 401
    assert client.get("/api/me").status_code == 401


def test_login_logout_flow(client: TestClient) -> None:
    login_response = client.post(
        "/api/login", json={"username": "user", "password": "password"}
    )
    assert login_response.status_code == 200
    assert login_response.json() == {"username": "user"}
    assert client.get("/api/me").json() == {"username": "user"}

    logout_response = client.post("/api/logout")
    assert logout_response.status_code == 200
    assert client.get("/api/me").status_code == 401
