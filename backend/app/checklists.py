import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, StringConstraints

from app.auth import CurrentUser, get_current_user
from app.board import ChecklistItemOut, get_card_row, item_ref, parse_ref
from app.db import get_db

router = APIRouter(prefix="/api")

ItemText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class CreateItemRequest(BaseModel):
    text: ItemText


class UpdateItemRequest(BaseModel):
    text: ItemText | None = None
    done: bool | None = None


def get_item_row(conn: sqlite3.Connection, user_id: int, ref: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT checklist_items.* FROM checklist_items "
        "JOIN cards ON cards.id = checklist_items.card_id "
        "JOIN columns ON columns.id = cards.column_id "
        "JOIN boards ON boards.id = columns.board_id "
        "WHERE checklist_items.id = ? AND boards.user_id = ?",
        (parse_ref(ref, "item"), user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    return row


def _item_out(row: sqlite3.Row) -> ChecklistItemOut:
    return ChecklistItemOut(id=item_ref(row["id"]), text=row["text"], done=row["done"])


def add_checklist_item(conn: sqlite3.Connection, card: sqlite3.Row, text: str) -> ChecklistItemOut:
    cursor = conn.execute(
        "INSERT INTO checklist_items (card_id, text, position) VALUES (?, ?, "
        "(SELECT COALESCE(MAX(position), -1) + 1 FROM checklist_items WHERE card_id = ?))",
        (card["id"], text, card["id"]),
    )
    return _item_out(
        conn.execute("SELECT * FROM checklist_items WHERE id = ?", (cursor.lastrowid,)).fetchone()
    )


@router.post("/cards/{card_id}/checklist", response_model=ChecklistItemOut, status_code=201)
def create_item(
    card_id: str,
    payload: CreateItemRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> ChecklistItemOut:
    return add_checklist_item(conn, get_card_row(conn, user.id, card_id), payload.text)


@router.patch("/checklist/{item_id}", response_model=ChecklistItemOut)
def update_item(
    item_id: str,
    payload: UpdateItemRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> ChecklistItemOut:
    item = get_item_row(conn, user.id, item_id)
    updates = payload.model_dump(exclude_none=True)
    if updates:
        assignments = ", ".join(f"{key} = ?" for key in updates)
        conn.execute(
            f"UPDATE checklist_items SET {assignments} WHERE id = ?",
            (*updates.values(), item["id"]),
        )
    return _item_out(get_item_row(conn, user.id, item_id))


@router.delete("/checklist/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    item = get_item_row(conn, user.id, item_id)
    conn.execute("DELETE FROM checklist_items WHERE id = ?", (item["id"],))
    return Response(status_code=204)
