from app.ai import ask_ai
from tests.helpers import requires_openrouter


@requires_openrouter
def test_ask_ai_answers_2_plus_2() -> None:
    # Live call against OpenRouter: proves key, model name and request handling.
    response = ask_ai("What is 2+2? Answer with only the number.")
    assert "4" in response
