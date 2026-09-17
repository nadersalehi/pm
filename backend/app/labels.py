import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, StringConstraints

from app.auth import CurrentUser, get_current_user
from app.board import LabelColor, LabelOut, get_board_row, label_ref, parse_ref
from app.db import get_db

router = APIRouter(prefix="/api")

LabelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class CreateLabelRequest(BaseModel):
    name: LabelName
    color: LabelColor


class UpdateLabelRequest(BaseModel):
    name: LabelName | None = None
    color: LabelColor | None = None


def get_label_row(conn: sqlite3.Connection, user_id: int, ref: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT labels.* FROM labels JOIN boards ON boards.id = labels.board_id "
        "WHERE labels.id = ? AND boards.user_id = ?",
        (parse_ref(ref, "label"), user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Label not found")
    return row


def _label_out(row: sqlite3.Row) -> LabelOut:
    return LabelOut(id=label_ref(row["id"]), name=row["name"], color=row["color"])


def _duplicate() -> HTTPException:
    return HTTPException(status_code=409, detail="A label with that name already exists")


@router.post("/boards/{board_id}/labels", response_model=LabelOut, status_code=201)
def create_label(
    board_id: str,
    payload: CreateLabelRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> LabelOut:
    board = get_board_row(conn, user.id, board_id)
    try:
        cursor = conn.execute(
            "INSERT INTO labels (board_id, name, color) VALUES (?, ?, ?)",
            (board["id"], payload.name, payload.color),
        )
    except sqlite3.IntegrityError:
        raise _duplicate() from None
    return _label_out(
        conn.execute("SELECT * FROM labels WHERE id = ?", (cursor.lastrowid,)).fetchone()
    )


@router.patch("/labels/{label_id}", response_model=LabelOut)
def update_label(
    label_id: str,
    payload: UpdateLabelRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> LabelOut:
    label = get_label_row(conn, user.id, label_id)
    updates = payload.model_dump(exclude_none=True)
    if updates:
        assignments = ", ".join(f"{key} = ?" for key in updates)
        try:
            conn.execute(
                f"UPDATE labels SET {assignments} WHERE id = ?",
                (*updates.values(), label["id"]),
            )
        except sqlite3.IntegrityError:
            raise _duplicate() from None
    return _label_out(get_label_row(conn, user.id, label_id))


@router.delete("/labels/{label_id}", status_code=204)
def delete_label(
    label_id: str,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    label = get_label_row(conn, user.id, label_id)
    conn.execute("DELETE FROM labels WHERE id = ?", (label["id"],))
    return Response(status_code=204)
