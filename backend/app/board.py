import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_username
from app.db import get_db

router = APIRouter(prefix="/api", dependencies=[Depends(get_current_username)])


def column_ref(column_id: int) -> str:
    return f"col-{column_id}"


def card_ref(card_id: int) -> str:
    return f"card-{card_id}"


def parse_ref(ref: str, prefix: str) -> int:
    if not ref.startswith(f"{prefix}-"):
        raise HTTPException(status_code=404, detail=f"Invalid {prefix} id")
    try:
        return int(ref[len(prefix) + 1 :])
    except ValueError:
        raise HTTPException(status_code=404, detail=f"Invalid {prefix} id")


class CardOut(BaseModel):
    id: str
    title: str
    details: str


class ColumnOut(BaseModel):
    id: str
    title: str
    cards: list[CardOut]


class BoardOut(BaseModel):
    columns: list[ColumnOut]


class RenameColumnRequest(BaseModel):
    title: str


class CreateCardRequest(BaseModel):
    title: str
    details: str = ""


class UpdateCardRequest(BaseModel):
    title: str | None = None
    details: str | None = None


class MoveCardRequest(BaseModel):
    column_id: str
    index: int | None = None


def get_or_create_board_id(conn: sqlite3.Connection, username: str) -> int:
    user_row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")
    board_row = conn.execute(
        "SELECT id FROM boards WHERE user_id = ? ORDER BY id LIMIT 1",
        (user_row["id"],),
    ).fetchone()
    if board_row is not None:
        return board_row["id"]
    cursor = conn.execute("INSERT INTO boards (user_id) VALUES (?)", (user_row["id"],))
    return cursor.lastrowid


def get_column(conn: sqlite3.Connection, ref: str) -> sqlite3.Row:
    column_id = parse_ref(ref, "col")
    row = conn.execute("SELECT * FROM columns WHERE id = ?", (column_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return row


def get_card(conn: sqlite3.Connection, ref: str) -> sqlite3.Row:
    card_id = parse_ref(ref, "card")
    row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return row


def _cards_out(conn: sqlite3.Connection, column_id: int) -> list[CardOut]:
    rows = conn.execute(
        "SELECT * FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
    ).fetchall()
    return [CardOut(id=card_ref(r["id"]), title=r["title"], details=r["details"]) for r in rows]


def _renumber(
    conn: sqlite3.Connection, card_ids: list[int], column_id: int | None = None
) -> None:
    for position, card_id in enumerate(card_ids):
        if column_id is None:
            conn.execute(
                "UPDATE cards SET position = ? WHERE id = ?", (position, card_id)
            )
        else:
            conn.execute(
                "UPDATE cards SET position = ?, column_id = ? WHERE id = ?",
                (position, column_id, card_id),
            )


@router.get("/board", response_model=BoardOut)
def get_board(
    username: str = Depends(get_current_username),
    conn: sqlite3.Connection = Depends(get_db),
) -> BoardOut:
    board_id = get_or_create_board_id(conn, username)
    columns = conn.execute(
        "SELECT * FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    return BoardOut(
        columns=[
            ColumnOut(
                id=column_ref(column["id"]),
                title=column["title"],
                cards=_cards_out(conn, column["id"]),
            )
            for column in columns
        ]
    )


@router.patch("/columns/{column_id}", response_model=ColumnOut)
def rename_column(
    column_id: str,
    payload: RenameColumnRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> ColumnOut:
    column = get_column(conn, column_id)
    conn.execute(
        "UPDATE columns SET title = ? WHERE id = ?", (payload.title, column["id"])
    )
    return ColumnOut(
        id=column_ref(column["id"]),
        title=payload.title,
        cards=_cards_out(conn, column["id"]),
    )


@router.post("/columns/{column_id}/cards", response_model=CardOut, status_code=201)
def add_card(
    column_id: str,
    payload: CreateCardRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> CardOut:
    column = get_column(conn, column_id)
    max_position = conn.execute(
        "SELECT COALESCE(MAX(position), -1) AS max_position FROM cards "
        "WHERE column_id = ?",
        (column["id"],),
    ).fetchone()["max_position"]
    cursor = conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (column["id"], payload.title, payload.details, max_position + 1),
    )
    return CardOut(
        id=card_ref(cursor.lastrowid), title=payload.title, details=payload.details
    )


@router.patch("/cards/{card_id}", response_model=CardOut)
def update_card(
    card_id: str,
    payload: UpdateCardRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> CardOut:
    card = get_card(conn, card_id)
    title = payload.title if payload.title is not None else card["title"]
    details = payload.details if payload.details is not None else card["details"]
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?",
        (title, details, card["id"]),
    )
    return CardOut(id=card_ref(card["id"]), title=title, details=details)


@router.delete("/cards/{card_id}", status_code=204)
def delete_card(card_id: str, conn: sqlite3.Connection = Depends(get_db)) -> None:
    card = get_card(conn, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card["id"],))


@router.post("/cards/{card_id}/move", response_model=CardOut)
def move_card(
    card_id: str,
    payload: MoveCardRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> CardOut:
    card = get_card(conn, card_id)
    target_column = get_column(conn, payload.column_id)
    source_column_id = card["column_id"]

    if target_column["id"] == source_column_id:
        ordered = conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
            (source_column_id,),
        ).fetchall()
        ids = [row["id"] for row in ordered if row["id"] != card["id"]]
    else:
        remaining = conn.execute(
            "SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position",
            (source_column_id, card["id"]),
        ).fetchall()
        _renumber(conn, [row["id"] for row in remaining])

        destination = conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
            (target_column["id"],),
        ).fetchall()
        ids = [row["id"] for row in destination]

    index = (
        len(ids) if payload.index is None else max(0, min(payload.index, len(ids)))
    )
    ids.insert(index, card["id"])
    _renumber(conn, ids, column_id=target_column["id"])

    updated = conn.execute(
        "SELECT * FROM cards WHERE id = ?", (card["id"],)
    ).fetchone()
    return CardOut(
        id=card_ref(updated["id"]), title=updated["title"], details=updated["details"]
    )
