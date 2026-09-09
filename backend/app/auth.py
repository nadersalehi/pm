import secrets

from fastapi import HTTPException, Request

USERNAME = "user"
PASSWORD = "password"

SESSION_SECRET_KEY = secrets.token_hex(32)


def verify_credentials(username: str, password: str) -> bool:
    return secrets.compare_digest(username, USERNAME) and secrets.compare_digest(
        password, PASSWORD
    )


def get_current_username(request: Request) -> str:
    username = request.session.get("username")
    if username is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username
