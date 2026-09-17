import os

import pytest
from fastapi.testclient import TestClient

import app.ai  # noqa: F401  loads .env so the skip check below sees the key

requires_openrouter = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"),
    reason="OPENROUTER_API_KEY not set; live OpenRouter test skipped",
)


def first_board(c: TestClient) -> dict:
    board_id = c.get("/api/boards").json()[0]["id"]
    return c.get(f"/api/boards/{board_id}").json()
