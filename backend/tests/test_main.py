import pytest
from fastapi.testclient import TestClient

from app.main import STATIC_DIR, app

client = TestClient(app)


def test_hello_api() -> None:
    response = client.get("/api/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello from the API"}


def test_root_serves_static_site() -> None:
    if not (STATIC_DIR / "index.html").exists():
        pytest.skip("frontend not built into app/static; see backend/AGENTS.md")
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
