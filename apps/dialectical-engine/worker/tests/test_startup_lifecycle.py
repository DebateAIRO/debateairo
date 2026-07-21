from __future__ import annotations

import asyncio

import pytest

from app.capabilities import detect_adapters
from app.config import WorkerConfig, load_config, save_config


def test_worker_config_persists_last_capabilities(tmp_path) -> None:
    path = tmp_path / "config.toml"
    config = WorkerConfig(worker_id="w1", worker_token="t1", last_capabilities=["model-a", "model-b"])
    save_config(config, path)
    loaded = load_config(path)
    assert loaded.last_capabilities == ["model-a", "model-b"]


@pytest.mark.asyncio
async def test_startup_sends_exactly_one_fresh_start_heartbeat(monkeypatch) -> None:
    """The codex worker registers once per process start, but register()
    itself short-circuits without a network call once worker_id/worker_token
    are already persisted -- it can't be trusted to carry the restart
    signal. Startup must announce the restart over the heartbeat channel
    instead, which always authenticates and always fires: exactly one
    fresh_start=True heartbeat, regardless of how the process was
    registered."""
    from app.client import CoordinatorClient
    from app.config import WorkerConfig
    from app.main import worker_loop

    heartbeat_calls: list[dict] = []

    async def fake_register(self, capabilities, *, persist=True, save_path=None, rotate_token=False):
        return None

    async def fake_heartbeat(self, capabilities, status="online", fresh_start=False):
        heartbeat_calls.append({"capabilities": list(capabilities), "status": status, "fresh_start": fresh_start})

    async def fake_poll(self):
        return None

    class FakeAdapter:
        model_id = "fake-a"
        role_pool = {"proposer"}

    async def fake_detect_adapters(config):
        return {"fake-a": FakeAdapter()}

    def fake_load_config(path=None):
        # No persisted worker_id/worker_token: the common "first contact"
        # shape for register_with_backoff's non-early-registered branch.
        return WorkerConfig(user_token="user-tok", name="fresh-start-worker")

    monkeypatch.setattr(CoordinatorClient, "register", fake_register)
    monkeypatch.setattr(CoordinatorClient, "heartbeat", fake_heartbeat)
    monkeypatch.setattr(CoordinatorClient, "poll", fake_poll)
    monkeypatch.setattr("app.main.detect_adapters", fake_detect_adapters)
    monkeypatch.setattr("app.main.load_config", fake_load_config)

    await asyncio.wait_for(worker_loop(run_once=True), timeout=10)

    fresh_start_calls = [call for call in heartbeat_calls if call["fresh_start"]]
    assert len(fresh_start_calls) == 1
    assert fresh_start_calls[0]["capabilities"] == ["fake-a"]
    # And the ordinary "online" heartbeat from register_with_backoff is
    # still there, unaffected -- fresh_start is additive, not a replacement.
    assert any(call["status"] == "online" and not call["fresh_start"] for call in heartbeat_calls)


@pytest.mark.asyncio
async def test_detect_adapters_probes_health_concurrently(monkeypatch) -> None:
    """Two fake adapters each wait for the other to start; only concurrent
    probing completes before the timeout."""
    started_a = asyncio.Event()
    started_b = asyncio.Event()

    class FakeAdapter:
        def __init__(self, model_id, my_event, other_event):
            self.model_id = model_id
            self.role_pool = {"proposer"}
            self._my = my_event
            self._other = other_event

        async def health_check(self) -> bool:
            self._my.set()
            await asyncio.wait_for(self._other.wait(), timeout=5)
            return True

    fake_a = FakeAdapter("fake-a", started_a, started_b)
    fake_b = FakeAdapter("fake-b", started_b, started_a)
    monkeypatch.setattr(
        "app.capabilities.candidate_adapters",
        lambda config: [fake_a, fake_b],
    )
    config = WorkerConfig(enable_mock=False, enable_real_adapters=True)
    adapters = await asyncio.wait_for(detect_adapters(config), timeout=10)
    assert set(adapters) == {"fake-a", "fake-b"}
