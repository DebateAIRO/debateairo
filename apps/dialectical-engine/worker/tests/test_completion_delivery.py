from __future__ import annotations

import httpx
import pytest

from app.main import (
    COMPLETE_RETRY_ATTEMPTS,
    CompletionDeliveryUncertain,
    complete_with_retry,
)


class _TimedOutCompletionClient:
    def __init__(self) -> None:
        self.calls = 0

    async def complete(self, *_args, **_kwargs):
        self.calls += 1
        request = httpx.Request("POST", "http://coordinator/api/jobs/job-1/complete")
        raise httpx.ReadTimeout("reply lost", request=request)


@pytest.mark.asyncio
async def test_read_timeout_retries_then_reports_ambiguous_delivery(monkeypatch) -> None:
    client = _TimedOutCompletionClient()

    async def no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.main.asyncio.sleep", no_sleep)
    with pytest.raises(CompletionDeliveryUncertain):
        await complete_with_retry(client, "job-1", {"ok": True}, 0.0, 1, 1)

    assert client.calls == COMPLETE_RETRY_ATTEMPTS
