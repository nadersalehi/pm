from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.db import DB_PATH, get_connection, init_db
from app.main import app


@pytest.fixture(autouse=True)
def reset_db():
    DB_PATH.unlink(missing_ok=True)
    init_db()
    yield


@pytest.fixture
def anon() -> TestClient:
    return TestClient(app)


@pytest.fixture
def client() -> TestClient:
    c = TestClient(app)
    response = c.post("/api/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    return c


@pytest.fixture
def make_user() -> Callable[..., TestClient]:
    def _make(username: str = "alice", password: str = "alice-password") -> TestClient:
        c = TestClient(app)
        response = c.post(
            "/api/register", json={"username": username, "password": password}
        )
        assert response.status_code == 201, response.text
        return c

    return _make


@pytest.fixture
def db():
    conn = get_connection()
    yield conn
    conn.close()

