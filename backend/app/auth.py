import os
import secrets
import sqlite3
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

from app.db import create_user, get_db
from app.security import hash_password, verify_password

SESSION_SECRET_KEY = os.environ.get("SESSION_SECRET") or secrets.token_hex(32)

_DUMMY_HASH = hash_password(secrets.token_hex(16))

Username = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_.-]{3,32}$")
]
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128)]

router = APIRouter(prefix="/api")


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: Username
    password: NewPassword


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: NewPassword


class DeleteAccountRequest(BaseModel):
    password: str


class UserOut(BaseModel):
    username: str


def get_current_user(
    request: Request, conn: sqlite3.Connection = Depends(get_db)
) -> CurrentUser:
    user_id = request.session.get("user_id")
    row = (
        conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
        if user_id is not None
        else None
    )
    if row is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated")
    return CurrentUser(id=row["id"], username=row["username"])


def _check_password(conn: sqlite3.Connection, user_id: int, password: str) -> None:
    row = conn.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if not verify_password(password, row["password_hash"]):
        raise HTTPException(status_code=403, detail="Password is incorrect")


@router.post("/register", response_model=UserOut, status_code=201)
def register(
    payload: RegisterRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
) -> UserOut:
    try:
        user_id = create_user(conn, payload.username, payload.password)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username is already taken") from None
    request.session["user_id"] = user_id
    return UserOut(username=payload.username)


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
) -> UserOut:
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (payload.username.strip(),),
    ).fetchone()
    valid = verify_password(
        payload.password, row["password_hash"] if row else _DUMMY_HASH
    )
    if row is None or not valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    request.session["user_id"] = row["id"]
    return UserOut(username=row["username"])


@router.post("/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser = Depends(get_current_user)) -> UserOut:
    return UserOut(username=user.username)


@router.post("/me/password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    _check_password(conn, user.id, payload.current_password)
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hash_password(payload.new_password), user.id),
    )
    return Response(status_code=204)


@router.post("/me/delete", status_code=204)
def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    _check_password(conn, user.id, payload.password)
    conn.execute("DELETE FROM users WHERE id = ?", (user.id,))
    request.session.clear()
    return Response(status_code=204)
