import httpx
import pytest

from app.client import CoordinatorClient
from app.config import WorkerConfig
from app.main import identity_desync_error


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
