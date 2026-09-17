import pytest
from fastapi.testclient import TestClient

from app.main import STATIC_DIR


def test_health(anon: TestClient) -> None:
    response = anon.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_root_serves_static_site(anon: TestClient) -> None:
    if not (STATIC_DIR / "index.html").exists():
        pytest.skip("frontend not built into app/static; see backend/AGENTS.md")
    response = anon.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
