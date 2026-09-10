import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.ai import Operation, chat_completion
from app.auth import get_current_username
from app.board import (
    BoardOut,
    CreateCardRequest,
    MoveCardRequest,
    RenameColumnRequest,
    UpdateCardRequest,
    add_card,
    delete_card,
    get_board,
    move_card,
    rename_column,
    update_card,
)
from app.db import get_db

router = APIRouter(prefix="/api", dependencies=[Depends(get_current_username)])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatOut(BaseModel):
    reply: str
    board: BoardOut


def _apply_operation(conn: sqlite3.Connection, op: Operation) -> None:
    try:
        if op.op == "rename_column" and op.column_id and op.title is not None:
            rename_column(op.column_id, RenameColumnRequest(title=op.title), conn)
        elif op.op == "add_card" and op.column_id and op.title:
            add_card(
                op.column_id,
                CreateCardRequest(title=op.title, details=op.details or ""),
                conn,
            )
        elif op.op == "edit_card" and op.card_id:
            update_card(
                op.card_id, UpdateCardRequest(title=op.title, details=op.details), conn
            )
        elif op.op == "move_card" and op.card_id and op.column_id:
            move_card(
                op.card_id, MoveCardRequest(column_id=op.column_id, index=op.index), conn
            )
        elif op.op == "delete_card" and op.card_id:
            delete_card(op.card_id, conn)
    except HTTPException:
        pass


@router.post("/chat", response_model=ChatOut)
def chat(
    payload: ChatRequest,
    username: str = Depends(get_current_username),
    conn: sqlite3.Connection = Depends(get_db),
) -> ChatOut:
    board = get_board(username, conn)
    history = [message.model_dump() for message in payload.history]
    reply = chat_completion(board.model_dump(), history, payload.message)

    for op in reply.operations:
        _apply_operation(conn, op)

    return ChatOut(reply=reply.reply, board=get_board(username, conn))
