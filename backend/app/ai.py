import json
import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODEL = "openai/gpt-oss-120b"

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    timeout=30,
)


def ask_ai(prompt: str) -> str:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""


class Operation(BaseModel):
    op: Literal["rename_column", "add_card", "edit_card", "move_card", "delete_card"]
    column_id: str | None = None
    card_id: str | None = None
    title: str | None = None
    details: str | None = None
    index: int | None = None


class ChatReply(BaseModel):
    reply: str
    operations: list[Operation]


SYSTEM_PROMPT = """You are an assistant embedded in a Kanban board app. You \
chat with the user and, when they ask for a change, propose it via operations.

Column and card ids come from the board JSON below (e.g. "col-1", "card-3"). \
Only reference ids that actually appear there.

Available operations:
- rename_column: column_id, title
- add_card: column_id, title, details (details may be left empty)
- edit_card: card_id, and title and/or details (only the fields to change)
- move_card: card_id, column_id (destination column), index (position within \
that column, omit for the end)
- delete_card: card_id

Only return operations for changes the user actually asked for. If the \
message is just a question or comment, return an empty operations list."""


def chat_completion(
    board: dict, history: list[dict[str, str]], message: str
) -> ChatReply:
    messages = [
        {
            "role": "system",
            "content": f"{SYSTEM_PROMPT}\n\nCurrent board:\n{json.dumps(board)}",
        },
        *history,
        {"role": "user", "content": message},
    ]
    completion = client.chat.completions.parse(
        model=MODEL,
        messages=messages,
        response_format=ChatReply,
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        return ChatReply(reply="Sorry, I couldn't process that.", operations=[])
    return parsed
