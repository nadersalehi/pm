from app.ai import ask_ai


def test_ask_ai_answers_2_plus_2() -> None:
    # Live call against OpenRouter - proves the API key, model name, and
    # request/response handling work end to end. Not mocked, requires network.
    response = ask_ai("What is 2+2? Answer with only the number.")
    assert "4" in response
