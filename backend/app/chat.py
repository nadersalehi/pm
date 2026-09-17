import logging
import sqlite3
from typing import Annotated, Literal

import openai
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StringConstraints, ValidationError

from app.ai import Operation, chat_completion
from app.auth import CurrentUser, get_current_user
from app.board import (
    BoardOut,
    card_ref,
    ColumnRequest,
    CreateCardRequest,
    MoveCardRequest,
    UpdateCardRequest,
    add_card,
    build_board,
    delete_card,
    get_board_row,
    get_card_row,
    get_column_row,
    move_card,
    rename_column,
    update_card,
)
from app.checklists import CreateItemRequest, add_checklist_item, get_item_row
from app.db import get_db

MAX_HISTORY_MESSAGES = 40

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(max_length=8000)]


class ChatRequest(BaseModel):
    message: Annotated[str, StringConstraints(min_length=1, max_length=4000)]
    history: Annotated[list[ChatMessage], Field(max_length=200)] = []


class ChatOut(BaseModel):
    reply: str
    board: BoardOut


class _BoardScope:
    """Resolves ids for one user and rejects anything outside the chat's board."""

    def __init__(self, conn: sqlite3.Connection, user_id: int, board_id: int):
        self.conn, self.user_id, self.board_id = conn, user_id, board_id

    def column(self, ref: str | None) -> sqlite3.Row:
        row = get_column_row(self.conn, self.user_id, ref or "")
        if row["board_id"] != self.board_id:
            raise HTTPException(status_code=404, detail="Column not on this board")
        return row

    def card(self, ref: str | None) -> sqlite3.Row:
        row = get_card_row(self.conn, self.user_id, ref or "")
        if row["board_id"] != self.board_id:
            raise HTTPException(status_code=404, detail="Card not on this board")
        return row

    def item(self, ref: str | None) -> sqlite3.Row:
        row = get_item_row(self.conn, self.user_id, ref or "")
        self.card(card_ref(row["card_id"]))
        return row


def _apply_operation(scope: _BoardScope, op: Operation) -> bool:
    """Applies one operation atomically; an invalid one is rolled back and skipped."""
    conn = scope.conn
    conn.execute("SAVEPOINT operation")
    try:
        _run_operation(scope, op)
        conn.execute("RELEASE operation")
        return True
    except (HTTPException, ValidationError) as error:
        conn.execute("ROLLBACK TO operation")
        conn.execute("RELEASE operation")
        logger.warning("Skipped AI operation %s: %s", op.model_dump(exclude_none=True), error)
        return False


def _run_operation(scope: _BoardScope, op: Operation) -> None:
    conn = scope.conn
    if op.op == "rename_column":
        rename_column(conn, scope.column(op.column_id), ColumnRequest(title=op.title).title)
    elif op.op == "add_card":
        request = CreateCardRequest(
            title=op.title,
            details=op.details or "",
            priority=op.priority or "none",
            due_date=op.due_date or None,
            label_ids=op.label_ids or [],
        )
        add_card(conn, scope.column(op.column_id), **request.model_dump())
    elif op.op == "edit_card":
        fields = op.model_dump(
            include={"title", "details", "priority", "due_date", "label_ids"},
            exclude_none=True,
        )
        request = UpdateCardRequest(**fields)
        update_card(conn, scope.card(op.card_id), request.model_dump(exclude_unset=True))
    elif op.op == "move_card":
        request = MoveCardRequest(column_id=op.column_id or "", index=op.index)
        move_card(
            conn, scope.card(op.card_id), scope.column(request.column_id), request.index
        )
    elif op.op == "delete_card":
        delete_card(conn, scope.card(op.card_id))
    elif op.op == "add_checklist_item":
        request = CreateItemRequest(text=op.title)
        add_checklist_item(conn, scope.card(op.card_id), request.text)
    elif op.op == "complete_checklist_item":
        conn.execute(
            "UPDATE checklist_items SET done = 1 WHERE id = ?", (scope.item(op.item_id)["id"],)
        )


@router.post("/boards/{board_id}/chat", response_model=ChatOut)
def chat(
    board_id: str,
    payload: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
) -> ChatOut:
    board = get_board_row(conn, user.id, board_id)
    history = [
        message.model_dump() for message in payload.history[-MAX_HISTORY_MESSAGES:]
    ]
    try:
        reply = chat_completion(
            build_board(conn, board).model_dump(mode="json"), history, payload.message
        )
    except openai.APITimeoutError:
        raise HTTPException(
            status_code=504, detail="The assistant took too long to respond."
        ) from None
    except openai.APIError:
        raise HTTPException(
            status_code=502, detail="The assistant is unavailable right now."
        ) from None

    scope = _BoardScope(conn, user.id, board["id"])
    skipped = sum(not _apply_operation(scope, op) for op in reply.operations)
    text = reply.reply
    if skipped:
        changes = "change" if skipped == 1 else "changes"
        text = f"{text}\n\n({skipped} requested {changes} couldn't be applied.)"

    return ChatOut(reply=text, board=build_board(conn, board))
