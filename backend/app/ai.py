import json
import logging
import os
import time
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, ValidationError

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODEL = "openai/gpt-oss-120b"

UNPROCESSABLE_REPLY = "Sorry, I couldn't process that. Please try rephrasing."

logger = logging.getLogger(__name__)

READ_TIMEOUT_SECONDS = 30
REQUEST_DEADLINE_SECONDS = 45


class _DeadlineStream(httpx.SyncByteStream):
    def __init__(self, stream: httpx.SyncByteStream, request: httpx.Request, deadline: float):
        self._stream, self._request, self._deadline = stream, request, deadline

    def __iter__(self) -> Iterator[bytes]:
        for chunk in self._stream:
            if time.monotonic() > self._deadline:
                raise httpx.ReadTimeout("Request deadline exceeded", request=self._request)
            yield chunk

    def close(self) -> None:
        self._stream.close()


class DeadlineTransport(httpx.BaseTransport):
    """Caps a whole request's duration.

    OpenRouter sends whitespace keep-alive bytes while a generation is slow, which
    keeps resetting httpx's per-read timeout, so without this a call can run for
    many minutes.
    """

    def __init__(self, inner: httpx.BaseTransport, seconds: float):
        self._inner, self._seconds = inner, seconds

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        deadline = time.monotonic() + self._seconds
        response = self._inner.handle_request(request)
        response.stream = _DeadlineStream(response.stream, request, deadline)
        return response

    def close(self) -> None:
        self._inner.close()


_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError(
                "OPENROUTER_API_KEY is not set - required for AI chat features."
            )
        _client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            max_retries=1,
            http_client=httpx.Client(
                timeout=READ_TIMEOUT_SECONDS,
                transport=DeadlineTransport(
                    httpx.HTTPTransport(), REQUEST_DEADLINE_SECONDS
                ),
            ),
        )
    return _client


def ask_ai(prompt: str) -> str:
    response = _get_client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""


class Operation(BaseModel):
    op: Literal[
        "rename_column",
        "add_card",
        "edit_card",
        "move_card",
        "delete_card",
        "add_checklist_item",
        "complete_checklist_item",
    ]
    column_id: str | None = None
    card_id: str | None = None
    item_id: str | None = None
    label_ids: list[str] | None = None
    title: str | None = None
    details: str | None = None
    priority: Literal["none", "low", "medium", "high"] | None = None
    due_date: str | None = None
    index: int | None = None


class ChatReply(BaseModel):
    reply: str
    operations: list[Operation]


SYSTEM_PROMPT = """You are an assistant embedded in a Kanban board app. You \
chat with the user and, when they ask for a change, propose it via operations.

Column, card, label and checklist item ids come from the board JSON below \
(e.g. "col-1", "card-3", "label-2", "item-5"). Only reference ids that \
actually appear there.

Available operations:
- rename_column: column_id, title
- add_card: column_id, title, and optionally details, priority, due_date,
  label_ids
- edit_card: card_id, and only the fields to change among title, details,
  priority, due_date, label_ids (label_ids replaces the card's labels)
- move_card: card_id, column_id (destination column), index (position within \
that column, omit for the end)
- delete_card: card_id
- add_checklist_item: card_id, title (the item's text)
- complete_checklist_item: item_id

priority is one of "none", "low", "medium", "high". due_date is an ISO date \
(YYYY-MM-DD); resolve relative dates like "next Friday" against today's date.

Only return operations for changes the user actually asked for. If the \
message is just a question or comment, return an empty operations list."""


def chat_completion(
    board: dict, history: list[dict[str, str]], message: str
) -> ChatReply:
    messages = [
        {
            "role": "system",
            "content": (
                f"{SYSTEM_PROMPT}\n\nToday's date: {date.today().isoformat()}\n\n"
                f"Current board:\n{json.dumps(board)}"
            ),
        },
        *history,
        {"role": "user", "content": message},
    ]
    try:
        completion = _get_client().chat.completions.parse(
            model=MODEL,
            messages=messages,
            response_format=ChatReply,
        )
    except ValidationError as error:
        # The model occasionally emits its raw chat-format tokens instead of JSON.
        logger.warning("Model returned output that isn't a valid ChatReply: %s", error)
        return ChatReply(reply=UNPROCESSABLE_REPLY, operations=[])
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        return ChatReply(reply=UNPROCESSABLE_REPLY, operations=[])
    return parsed
