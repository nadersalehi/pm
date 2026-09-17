import time

import httpx
import pytest

from app.ai import DeadlineTransport


class TrickleStream(httpx.SyncByteStream):
    """Mimics OpenRouter's keep-alive padding: small chunks spaced out in time."""

    def __init__(self, chunks: int, gap: float):
        self.chunks, self.gap = chunks, gap

    def __iter__(self):
        for _ in range(self.chunks):
            time.sleep(self.gap)
            yield b"\n "


def client_for(stream: httpx.SyncByteStream, deadline: float) -> httpx.Client:
    inner = httpx.MockTransport(lambda request: httpx.Response(200, stream=stream))
    return httpx.Client(transport=DeadlineTransport(inner, deadline))


def test_trickling_response_is_cut_off_at_the_deadline() -> None:
    client = client_for(TrickleStream(chunks=50, gap=0.02), deadline=0.1)
    started = time.monotonic()
    with pytest.raises(httpx.ReadTimeout, match="deadline"):
        client.get("https://example.test/")
    assert time.monotonic() - started < 0.5


def test_fast_response_passes_through() -> None:
    client = client_for(TrickleStream(chunks=3, gap=0.0), deadline=5)
    response = client.get("https://example.test/")
    assert response.content == b"\n \n \n "
