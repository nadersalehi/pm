from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from app.auth import SESSION_SECRET_KEY, get_current_username, verify_credentials
from app.board import router as board_router
from app.chat import router as chat_router
from app.db import init_db

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET_KEY)

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

init_db()


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    username: str


@app.get("/api/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from the API"}


@app.post("/api/login", response_model=UserResponse)
def login(payload: LoginRequest, request: Request) -> UserResponse:
    if not verify_credentials(payload.username, payload.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    request.session["username"] = payload.username
    return UserResponse(username=payload.username)


@app.post("/api/logout")
def logout(request: Request) -> dict[str, str]:
    request.session.clear()
    return {"message": "logged out"}


@app.get("/api/me", response_model=UserResponse)
def me(username: str = Depends(get_current_username)) -> UserResponse:
    return UserResponse(username=username)


app.include_router(board_router)
app.include_router(chat_router)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
