import sqlite3
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints

from app.auth import CurrentUser, get_current_user
from app.db import create_board, get_db

router = APIRouter(prefix="/api")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text = Annotated[str, StringConstraints(max_length=5000)]
Priority = Literal["none", "low", "medium", "high"]
LabelColor = Literal["yellow", "blue", "purple", "navy", "gray"]


def board_ref(board_id: int) -> str:
    return f"board-{board_id}"


def column_ref(column_id: int) -> str:
    return f"col-{column_id}"


def card_ref(card_id: int) -> str:
    return f"card-{card_id}"


def label_ref(label_id: int) -> str:
    return f"label-{label_id}"


def item_ref(item_id: int) -> str:
    return f"item-{item_id}"


def parse_ref(ref: str, prefix: str) -> int:
    head, _, number = ref.partition("-")
    if head != prefix or not number.isdigit():
        raise HTTPException(status_code=404, detail=f"Invalid {prefix} id")
    return int(number)


class LabelOut(BaseModel):
    id: str
    name: str
    color: LabelColor


class ChecklistItemOut(BaseModel):
    id: str
    text: str
    done: bool


class CardOut(BaseModel):
    id: str
    title: str
    details: str
    priority: Priority
    due_date: date | None
    label_ids: list[str]
    checklist: list[ChecklistItemOut]


class ColumnOut(BaseModel):
    id: str
    title: str
    cards: list[CardOut]


class BoardSummary(BaseModel):
    id: str
    name: str
    description: str
    card_count: int


class BoardOut(BaseModel):
    id: str
    name: str
    description: str
    labels: list[LabelOut]
    columns: list[ColumnOut]


class CreateBoardRequest(BaseModel):
    name: Title
    description: Text = ""


class UpdateBoardRequest(BaseModel):
    name: Title | None = None
    description: Text | None = None


class ColumnRequest(BaseModel):
    title: Title


class MoveColumnRequest(BaseModel):
    index: int = Field(ge=0)


class CreateCardRequest(BaseModel):
    title: Title
    details: Text = ""
    priority: Priority = "none"
    due_date: date | None = None
    label_ids: list[str] = []


class UpdateCardRequest(BaseModel):
    title: Title | None = None
    details: Text | None = None
    priority: Priority | None = None
    due_date: date | None = None
    label_ids: list[str] | None = None


class MoveCardRequest(BaseModel):
    column_id: str
    index: int | None = Field(default=None, ge=0)


# Lookups: every one is scoped to the owning user, so another user's ids 404.


def get_board_row(conn: sqlite3.Connection, user_id: int, ref: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM boards WHERE id = ? AND user_id = ?",
        (parse_ref(ref, "board"), user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return row


def get_column_row(conn: sqlite3.Connection, user_id: int, ref: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT columns.* FROM columns JOIN boards ON boards.id = columns.board_id "
        "WHERE columns.id = ? AND boards.user_id = ?",
        (parse_ref(ref, "col"), user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Column not found")
    return row


def get_card_row(conn: sqlite3.Connection, user_id: int, ref: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT cards.*, columns.board_id FROM cards "
        "JOIN columns ON columns.id = cards.column_id "
        "JOIN boards ON boards.id = columns.board_id "
        "WHERE cards.id = ? AND boards.user_id = ?",
        (parse_ref(ref, "card"), user_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return row


# Operations shared by the HTTP routes and the AI chat.


def _cards_out(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[CardOut]:
    """Builds cards with their labels and checklists in two queries, not two per card."""
    ids = [row["id"] for row in rows]
    placeholders = ",".join("?" * len(ids))
    labels: dict[int, list[str]] = {card_id: [] for card_id in ids}
    checklists: dict[int, list[ChecklistItemOut]] = {card_id: [] for card_id in ids}
    if ids:
        for link in conn.execute(
            f"SELECT card_id, label_id FROM card_labels WHERE card_id IN ({placeholders}) "
            "ORDER BY label_id",
            ids,
        ):
            labels[link["card_id"]].append(label_ref(link["label_id"]))
        for item in conn.execute(
            f"SELECT * FROM checklist_items WHERE card_id IN ({placeholders}) "
            "ORDER BY position",
            ids,
        ):
            checklists[item["card_id"]].append(
                ChecklistItemOut(id=item_ref(item["id"]), text=item["text"], done=item["done"])
            )
    return [
        CardOut(
            id=card_ref(row["id"]),
            title=row["title"],
            details=row["details"],
            priority=row["priority"],
            due_date=row["due_date"],
            label_ids=labels[row["id"]],
            checklist=checklists[row["id"]],
        )
        for row in rows
    ]


def load_card(conn: sqlite3.Connection, card_id: int) -> CardOut:
    row = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    return _cards_out(conn, [row])[0]


def build_board(conn: sqlite3.Connection, board: sqlite3.Row) -> BoardOut:
    columns = conn.execute(
        "SELECT * FROM columns WHERE board_id = ? ORDER BY position", (board["id"],)
    ).fetchall()
    cards = conn.execute(
        "SELECT cards.* FROM cards JOIN columns ON columns.id = cards.column_id "
        "WHERE columns.board_id = ? ORDER BY cards.position",
        (board["id"],),
    ).fetchall()
    labels = conn.execute(
        "SELECT * FROM labels WHERE board_id = ? ORDER BY name", (board["id"],)
    ).fetchall()
    cards_by_column: dict[int, list[CardOut]] = {column["id"]: [] for column in columns}
    for row, card in zip(cards, _cards_out(conn, cards)):
        cards_by_column[row["column_id"]].append(card)
    return BoardOut(
        id=board_ref(board["id"]),
        name=board["name"],
        description=board["description"],
        labels=[
            LabelOut(id=label_ref(label["id"]), name=label["name"], color=label["color"])
            for label in labels
        ],
        columns=[
            ColumnOut(
                id=column_ref(column["id"]),
                title=column["title"],
                cards=cards_by_column[column["id"]],
            )
            for column in columns
        ],
    )


def _iso(value: Any) -> Any:
    return value.isoformat() if isinstance(value, date) else value


def _ordered_ids(conn: sqlite3.Connection, sql: str, param: int) -> list[int]:
    return [row["id"] for row in conn.execute(sql, (param,)).fetchall()]


def _renumber(conn: sqlite3.Connection, table: str, ids: list[int], **extra: int) -> None:
    assignments = "".join(f", {key} = ?" for key in extra)
    conn.executemany(
        f"UPDATE {table} SET position = ?{assignments} WHERE id = ?",
        [(position, *extra.values(), row_id) for position, row_id in enumerate(ids)],
    )


def rename_column(conn: sqlite3.Connection, column: sqlite3.Row, title: str) -> None:
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column["id"]))


def set_card_labels(
    conn: sqlite3.Connection, board_id: int, card_id: int, refs: list[str]
) -> None:
    label_ids = {parse_ref(ref, "label") for ref in refs}
    if label_ids:
        found = conn.execute(
            f"SELECT COUNT(*) FROM labels WHERE board_id = ? "
            f"AND id IN ({','.join('?' * len(label_ids))})",
            (board_id, *label_ids),
        ).fetchone()[0]
        if found != len(label_ids):
            raise HTTPException(status_code=400, detail="Labels must belong to the card's board")
    conn.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
    conn.executemany(
        "INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)",
        [(card_id, label_id) for label_id in sorted(label_ids)],
    )


def add_card(
    conn: sqlite3.Connection,
    column: sqlite3.Row,
    title: str,
    details: str = "",
    priority: str = "none",
    due_date: date | None = None,
    label_ids: list[str] | None = None,
) -> CardOut:
    cursor = conn.execute(
        "INSERT INTO cards (column_id, title, details, priority, due_date, position) "
        "VALUES (?, ?, ?, ?, ?, "
        "(SELECT COALESCE(MAX(position), -1) + 1 FROM cards WHERE column_id = ?))",
        (column["id"], title, details, priority, _iso(due_date), column["id"]),
    )
    if label_ids:
        set_card_labels(conn, column["board_id"], cursor.lastrowid, label_ids)
    return load_card(conn, cursor.lastrowid)


def update_card(
    conn: sqlite3.Connection, card: sqlite3.Row, updates: dict[str, Any]
) -> CardOut:
    updates = dict(updates)
    label_ids = updates.pop("label_ids", None)
    if label_ids is not None:
        set_card_labels(conn, card["board_id"], card["id"], label_ids)
    if updates:
        assignments = ", ".join(f"{key} = ?" for key in updates)
        conn.execute(
            f"UPDATE cards SET {assignments} WHERE id = ?",
            (*(_iso(value) for value in updates.values()), card["id"]),
        )
    return load_card(conn, card["id"])


def delete_card(conn: sqlite3.Connection, card: sqlite3.Row) -> None:
    conn.execute("DELETE FROM cards WHERE id = ?", (card["id"],))


def move_card(
    conn: sqlite3.Connection,
    card: sqlite3.Row,
    target_column: sqlite3.Row,
    index: int | None,
) -> CardOut:
    if target_column["board_id"] != card["board_id"]:
        raise HTTPException(status_code=400, detail="Cards can only move within a board")
    source_column_id = card["column_id"]
    by_position = "SELECT id FROM cards WHERE column_id = ? ORDER BY position"
    if target_column["id"] != source_column_id:
        remaining = [
            i for i in _ordered_ids(conn, by_position, source_column_id) if i != card["id"]
        ]
        _renumber(conn, "cards", remaining)
    ids = [
        i for i in _ordered_ids(conn, by_position, target_column["id"]) if i != card["id"]
    ]
    ids.insert(len(ids) if index is None else min(index, len(ids)), card["id"])
    _renumber(conn, "cards", ids, column_id=target_column["id"])
    return load_card(conn, card["id"])


# Routes


@router.get("/boards", response_model=list[BoardSummary])
def list_boards(
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> list[BoardSummary]:
    rows = conn.execute(
        "SELECT boards.*, COUNT(cards.id) AS card_count FROM boards "
        "LEFT JOIN columns ON columns.board_id = boards.id "
        "LEFT JOIN cards ON cards.column_id = columns.id "
        "WHERE boards.user_id = ? GROUP BY boards.id ORDER BY boards.id",
        (user.id,),
    ).fetchall()
    return [
        BoardSummary(
            id=board_ref(row["id"]),
            name=row["name"],
            description=row["description"],
            card_count=row["card_count"],
        )
        for row in rows
    ]


@router.post("/boards", response_model=BoardOut, status_code=201)
def create_board_route(
    payload: CreateBoardRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> BoardOut:
    board_id = create_board(conn, user.id, payload.name, payload.description)
    return build_board(conn, get_board_row(conn, user.id, board_ref(board_id)))


@router.get("/boards/{board_id}", response_model=BoardOut)
def get_board(
    board_id: str,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> BoardOut:
    return build_board(conn, get_board_row(conn, user.id, board_id))


@router.patch("/boards/{board_id}", response_model=BoardOut)
def update_board(
    board_id: str,
    payload: UpdateBoardRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> BoardOut:
    board = get_board_row(conn, user.id, board_id)
    updates = payload.model_dump(exclude_none=True)
    if updates:
        assignments = ", ".join(f"{key} = ?" for key in updates)
        conn.execute(
            f"UPDATE boards SET {assignments} WHERE id = ?",
            (*updates.values(), board["id"]),
        )
    return build_board(conn, get_board_row(conn, user.id, board_id))


@router.delete("/boards/{board_id}", status_code=204)
def delete_board(
    board_id: str,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    board = get_board_row(conn, user.id, board_id)
    conn.execute("DELETE FROM boards WHERE id = ?", (board["id"],))
    return Response(status_code=204)


@router.post("/boards/{board_id}/columns", response_model=ColumnOut, status_code=201)
def add_column(
    board_id: str,
    payload: ColumnRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> ColumnOut:
    board = get_board_row(conn, user.id, board_id)
    cursor = conn.execute(
        "INSERT INTO columns (board_id, title, position) VALUES (?, ?, "
        "(SELECT COALESCE(MAX(position), -1) + 1 FROM columns WHERE board_id = ?))",
        (board["id"], payload.title, board["id"]),
    )
    return ColumnOut(id=column_ref(cursor.lastrowid), title=payload.title, cards=[])


@router.patch("/columns/{column_id}", status_code=204)
def rename_column_route(
    column_id: str,
    payload: ColumnRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    rename_column(conn, get_column_row(conn, user.id, column_id), payload.title)
    return Response(status_code=204)


@router.delete("/columns/{column_id}", status_code=204)
def delete_column(
    column_id: str,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    column = get_column_row(conn, user.id, column_id)
    conn.execute("DELETE FROM columns WHERE id = ?", (column["id"],))
    _renumber(
        conn,
        "columns",
        _ordered_ids(
            conn,
            "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
            column["board_id"],
        ),
    )
    return Response(status_code=204)


@router.post("/columns/{column_id}/move", status_code=204)
def move_column(
    column_id: str,
    payload: MoveColumnRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    column = get_column_row(conn, user.id, column_id)
    ids = [
        i
        for i in _ordered_ids(
            conn,
            "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
            column["board_id"],
        )
        if i != column["id"]
    ]
    ids.insert(min(payload.index, len(ids)), column["id"])
    _renumber(conn, "columns", ids)
    return Response(status_code=204)


@router.post("/columns/{column_id}/cards", response_model=CardOut, status_code=201)
def add_card_route(
    column_id: str,
    payload: CreateCardRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> CardOut:
    column = get_column_row(conn, user.id, column_id)
    return add_card(conn, column, **payload.model_dump())


@router.patch("/cards/{card_id}", response_model=CardOut)
def update_card_route(
    card_id: str,
    payload: UpdateCardRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> CardOut:
    card = get_card_row(conn, user.id, card_id)
    updates = payload.model_dump(exclude_unset=True)
    for required in ("title", "details", "priority", "label_ids"):
        if updates.get(required, "") is None:
            del updates[required]
    return update_card(conn, card, updates)


@router.delete("/cards/{card_id}", status_code=204)
def delete_card_route(
    card_id: str,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    delete_card(conn, get_card_row(conn, user.id, card_id))
    return Response(status_code=204)


@router.post("/cards/{card_id}/move", response_model=CardOut)
def move_card_route(
    card_id: str,
    payload: MoveCardRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> CardOut:
    card = get_card_row(conn, user.id, card_id)
    target = get_column_row(conn, user.id, payload.column_id)
    return move_card(conn, card, target, payload.index)
