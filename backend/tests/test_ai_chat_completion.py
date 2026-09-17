import pytest
from pydantic import BaseModel, ValidationError

from app import ai
from app.ai import UNPROCESSABLE_REPLY, ChatReply, chat_completion


class _Message:
    def __init__(self, parsed):
        self.parsed = parsed


class _Choice:
    def __init__(self, parsed):
        self.message = _Message(parsed)


class _FakeCompletions:
    def __init__(self, outcome):
        self.outcome = outcome
        self.calls: list[dict] = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return type("Completion", (), {"choices": [_Choice(self.outcome)]})()


def install(monkeypatch, outcome) -> _FakeCompletions:
    completions = _FakeCompletions(outcome)
    client = type("Client", (), {"chat": type("Chat", (), {"completions": completions})()})()
    monkeypatch.setattr(ai, "_get_client", lambda: client)
    return completions


def invalid_json_error() -> ValidationError:
    class Strict(BaseModel):
        value: int

    with pytest.raises(ValidationError) as caught:
        Strict.model_validate_json("<|start|>assistant")
    return caught.value


def test_sends_prompt_board_history_and_message(monkeypatch) -> None:
    reply = ChatReply(reply="Hi", operations=[])
    completions = install(monkeypatch, reply)
    history = [{"role": "user", "content": "earlier"}]

    assert chat_completion({"id": "board-1"}, history, "now") is reply
    messages = completions.calls[0]["messages"]
    assert messages[0]["role"] == "system"
    assert "Today's date: " in messages[0]["content"]
    assert '{"id": "board-1"}' in messages[0]["content"]
    assert messages[1:] == [*history, {"role": "user", "content": "now"}]
    assert completions.calls[0]["response_format"] is ChatReply


def test_unparsed_reply_falls_back_to_a_polite_message(monkeypatch) -> None:
    install(monkeypatch, None)
    assert chat_completion({}, [], "hi") == ChatReply(reply=UNPROCESSABLE_REPLY, operations=[])


def test_malformed_model_output_falls_back_instead_of_failing(monkeypatch) -> None:
    install(monkeypatch, invalid_json_error())
    assert chat_completion({}, [], "hi") == ChatReply(reply=UNPROCESSABLE_REPLY, operations=[])


def test_missing_api_key_is_a_clear_error(monkeypatch) -> None:
    monkeypatch.setattr(ai, "_client", None)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        ai._get_client()
