"""Lane 1 regression tests: worker crash-loop recovery.

Covers the three confirmed root causes of the worker crash-loop that left
V's debate stuck at "generating" with no artifacts:

  a. A 403 on a worker-identity endpoint (register / heartbeat / poll) must be
     treated as identity desync (re-register), not propagate as a fatal error.
  b. client.fail() must never send an empty reason (coordinator FailRequest
     requires min_length=1); an empty exception message must be substituted
     with a non-empty default before the request is sent.
  c. Transient network errors on /complete must be retried a bounded number of
     times before falling back to fail(); and if /fail itself errors, the
     worker loop must survive (a reporting failure is coordinator-side
     recoverable and must never kill the process).
"""
from __future__ import annotations

import httpx
import pytest

import app.main as main
from app.client import CoordinatorClient
from app.config import WorkerConfig
from app.main import handle_job, handle_job_with_heartbeats, identity_desync_error


def _http_status_error(status: int, url: str) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", url)
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


# ---------------------------------------------------------------------------
# Lane 1a: 403 on worker-identity endpoints is identity desync
# ---------------------------------------------------------------------------


def test_403_on_worker_endpoints_is_identity_desync() -> None:
    assert identity_desync_error(_http_status_error(403, "http://c/api/workers/w1/heartbeat")) is True
    assert identity_desync_error(_http_status_error(403, "http://c/api/workers/register")) is True
    assert identity_desync_error(_http_status_error(403, "http://c/api/workers/w1/poll")) is True


def test_403_on_job_endpoints_is_not_identity_desync() -> None:
    # Job-endpoint 403 is a stale-job signal handled by
    # stale_job_coordinator_error, NOT an identity desync.
    assert identity_desync_error(_http_status_error(403, "http://c/api/jobs/j1/fail")) is False
    assert identity_desync_error(_http_status_error(403, "http://c/api/jobs/j1/complete")) is False


def test_identity_desync_preserves_existing_401_404_500_behavior() -> None:
    assert identity_desync_error(_http_status_error(401, "http://c/api/workers/w1/heartbeat")) is True
    assert identity_desync_error(_http_status_error(404, "http://c/api/jobs/j1/complete")) is True
    assert identity_desync_error(_http_status_error(500, "http://c/api/workers/w1/heartbeat")) is False
    assert identity_desync_error(ValueError("x")) is False


# ---------------------------------------------------------------------------
# Lane 1b: client.fail never sends an empty reason
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fail_sends_nonempty_reason_when_message_empty(monkeypatch) -> None:
    sent: dict[str, object] = {}

    async def fake_post(self, url, **kwargs):
        sent["json"] = kwargs.get("json")
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request, json={"status": "failed"})

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    client = CoordinatorClient(WorkerConfig(worker_id="w1", worker_token="t1", name="w"))
    # str(httpx.ReadError()) == "" -> empty reason reaches the client.
    await client.fail("job-1", "")

    reason = sent["json"]["reason"]  # type: ignore[index]
    assert isinstance(reason, str)
    assert reason.strip() != ""


# ---------------------------------------------------------------------------
# Test harness (minimal, mirrors test_adapters.py's RecordingClient family)
# ---------------------------------------------------------------------------


class RecordingClient:
    def __init__(self) -> None:
        self.completed: dict[str, object] | None = None
        self.complete_attempts = 0
        self.failure: dict[str, object] | None = None

    async def stream_chunks(self, job_id, chunks) -> None:
        self.job_id = job_id
        self.streamed = "".join([chunk async for chunk in chunks])

    async def complete(self, job_id, result, started_at, tokens_in, tokens_out) -> None:
        self.complete_attempts += 1
        self.completed = {"job_id": job_id, "result": result}

    async def fail(self, job_id, reason, retryable=True) -> None:
        raise AssertionError(f"unexpected failure for {job_id}: {reason!r}")

    async def heartbeat(self, capabilities) -> None:  # pragma: no cover - not exercised
        pass


class TinyAdapter:
    async def stream(self, system: str, user: str, max_tokens: int):
        del system, user, max_tokens
        yield "hello "
        yield "world"


class FailingAdapter:
    async def stream(self, system: str, user: str, max_tokens: int):
        del system, user, max_tokens
        raise RuntimeError("adapter failed")
        yield ""  # pragma: no cover - keeps this an async generator


def _argue_job(model: str = "tiny") -> dict[str, object]:
    return {
        "id": "job-1",
        "job_type": "argue",
        "required_model": model,
        "prompt": {"system": "system prompt", "user": "user prompt", "max_tokens": 20},
    }


# ---------------------------------------------------------------------------
# Lane 1c-i: transient network error on /complete is retried
# ---------------------------------------------------------------------------


class TransientCompleteClient(RecordingClient):
    def __init__(self, fail_times: int) -> None:
        super().__init__()
        self._fail_times = fail_times

    async def complete(self, job_id, result, started_at, tokens_in, tokens_out) -> None:
        self.complete_attempts += 1
        if self.complete_attempts <= self._fail_times:
            raise httpx.ReadError("")  # str() == "" -> also exercises empty-reason path
        self.completed = {"job_id": job_id, "result": result}


@pytest.mark.asyncio
async def test_complete_retries_transient_network_error_then_succeeds(monkeypatch) -> None:
    monkeypatch.setattr(main, "COMPLETE_RETRY_BACKOFF_SECONDS", 0)
    client = TransientCompleteClient(fail_times=2)

    # fail() raising AssertionError guards that we never fell back to fail().
    await handle_job(client, {"tiny": TinyAdapter()}, _argue_job())

    assert client.complete_attempts == 3
    assert client.completed is not None


class AlwaysTransientCompleteClient(RecordingClient):
    async def complete(self, job_id, result, started_at, tokens_in, tokens_out) -> None:
        self.complete_attempts += 1
        raise httpx.ReadError("")

    async def fail(self, job_id, reason, retryable=True) -> None:
        self.failure = {"job_id": job_id, "reason": reason, "retryable": retryable}


@pytest.mark.asyncio
async def test_complete_exhausts_retries_then_fails_with_nonempty_reason(monkeypatch) -> None:
    monkeypatch.setattr(main, "COMPLETE_RETRY_BACKOFF_SECONDS", 0)
    client = AlwaysTransientCompleteClient()

    await handle_job(client, {"tiny": TinyAdapter()}, _argue_job())

    assert client.complete_attempts == main.COMPLETE_RETRY_ATTEMPTS
    assert client.failure is not None
    assert str(client.failure["reason"]).strip() != ""
    # A transient network error is retryable so the coordinator can re-queue.
    assert client.failure["retryable"] is True


# ---------------------------------------------------------------------------
# Lane 1c-ii: a /fail error must not kill the worker loop
# ---------------------------------------------------------------------------


class Fail422Client(RecordingClient):
    async def fail(self, job_id, reason, retryable=True) -> None:
        request = httpx.Request("POST", f"http://c/api/jobs/{job_id}/fail")
        response = httpx.Response(422, request=request, json={"detail": "reason too short"})
        raise httpx.HTTPStatusError("422 Unprocessable Entity", request=request, response=response)


@pytest.mark.asyncio
async def test_fail_returning_422_does_not_kill_worker() -> None:
    client = Fail422Client()
    # FailingAdapter raises during generation -> except branch -> fail() -> 422.
    # handle_job must return cleanly rather than propagating the 422.
    await handle_job(client, {"failing": FailingAdapter()}, _argue_job("failing"))
