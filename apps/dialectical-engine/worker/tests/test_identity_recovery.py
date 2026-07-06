import asyncio

import httpx
import pytest

from app.client import CoordinatorClient
from app.config import WorkerConfig
from app.main import identity_desync_error, worker_loop


def _http_status_error(status: int, url: str = "http://localhost:8000/api/workers/w1/heartbeat") -> httpx.HTTPStatusError:
    request = httpx.Request("POST", url)
    response = httpx.Response(status, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


def test_identity_desync_detects_401_and_404() -> None:
    assert identity_desync_error(_http_status_error(401)) is True
    assert identity_desync_error(_http_status_error(404)) is True
    assert identity_desync_error(_http_status_error(500)) is False
    assert identity_desync_error(ValueError("x")) is False


@pytest.mark.asyncio
async def test_register_name_collision_auto_rotates(monkeypatch, tmp_path) -> None:
    """Coordinator preserving an existing name's token must trigger one
    automatic rotate_token retry instead of a fatal RuntimeError."""
    calls: list[dict] = []

    async def fake_post(self, url, **kwargs):
        payload = kwargs.get("json") or {}
        calls.append(payload)
        request = httpx.Request("POST", url)
        if payload.get("rotate_token"):
            return httpx.Response(
                200,
                request=request,
                json={"worker_id": "w-new", "worker_token": "tok-new", "name": "mac-mini", "capabilities": ["m"]},
            )
        return httpx.Response(
            200,
            request=request,
            json={"worker_id": "w-old", "worker_token": None, "name": "mac-mini", "capabilities": ["m"]},
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    config = WorkerConfig(user_token="user-tok", name="mac-mini")
    client = CoordinatorClient(config)
    await client.register(["m"], persist=True, save_path=tmp_path / "config.toml")
    assert config.worker_id == "w-new"
    assert config.worker_token == "tok-new"
    assert [c.get("rotate_token", False) for c in calls] == [False, True]


@pytest.mark.asyncio
async def test_worker_loop_survives_auth_blocked_identity_recovery(monkeypatch, tmp_path) -> None:
    """If a 401 triggers identity recovery and re-registration is ALSO
    rejected with 401 (genuinely bad user_token), the worker must not crash.
    It should print a blocked_auth message, wait, and return cleanly on
    run_once instead of raising or looping forever."""

    def _http_401(url: str) -> httpx.HTTPStatusError:
        request = httpx.Request("POST", url)
        response = httpx.Response(401, request=request)
        return httpx.HTTPStatusError("unauthorized", request=request, response=response)

    async def fake_poll(self):
        raise _http_401(f"http://localhost:8000/api/workers/{self.config.worker_id}/poll")

    heartbeat_calls = {"count": 0}
    # Startup does two successful heartbeats before the poll loop is reached:
    # one inside register_with_backoff's "starting" call, one for "online"
    # right after. Let both pass so the test exercises the 401 raised by
    # client.poll() inside the loop (the identity-desync recovery path).
    STARTUP_HEARTBEATS = 2

    async def fake_heartbeat(self, capabilities, status="online"):
        heartbeat_calls["count"] += 1
        if heartbeat_calls["count"] <= STARTUP_HEARTBEATS:
            return
        raise _http_401(f"http://localhost:8000/api/workers/{self.config.worker_id}/heartbeat")

    async def fake_register(self, capabilities, *, persist=True, save_path=None, rotate_token=False):
        if not rotate_token:
            # Startup path: worker is already "registered" per config, so the
            # real client.register() short-circuits without a network call.
            return
        # Recovery path (rotate_token=True): the user_token is genuinely bad.
        raise _http_401("http://localhost:8000/api/workers/register")

    class FakeAdapter:
        model_id = "fake-a"
        role_pool = {"proposer"}

    async def fake_detect_adapters(config):
        return {"fake-a": FakeAdapter()}

    def fake_load_config(path=None):
        return WorkerConfig(
            worker_id="w1",
            worker_token="t1",
            user_token="bad-user-token",
            last_capabilities=["fake-a"],
        )

    wait_calls: list[float] = []

    async def fake_wait_or_stop(stop, seconds):
        wait_calls.append(seconds)

    monkeypatch.setattr(CoordinatorClient, "poll", fake_poll)
    monkeypatch.setattr(CoordinatorClient, "heartbeat", fake_heartbeat)
    monkeypatch.setattr(CoordinatorClient, "register", fake_register)
    monkeypatch.setattr("app.main.detect_adapters", fake_detect_adapters)
    monkeypatch.setattr("app.main.load_config", fake_load_config)
    monkeypatch.setattr("app.main.wait_or_stop", fake_wait_or_stop)

    await asyncio.wait_for(worker_loop(run_once=True), timeout=10)

    assert 30 in wait_calls
