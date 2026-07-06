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
