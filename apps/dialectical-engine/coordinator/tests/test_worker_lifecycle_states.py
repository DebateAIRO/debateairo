from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.auth import hash_token
from app.main import app
from app.models.entities import Worker, now_utc
from app.services.orchestrator import capable_online_workers

LIFECYCLE_STATUSES = ("starting", "recovering_identity", "blocked_auth", "degraded", "online")


def make_worker(db, *, capabilities: list[str], name: str, status: str = "online") -> Worker:
    worker = Worker(
        name=name,
        token_hash=hash_token(f"{name}-token"),
        capabilities=capabilities,
        last_seen=now_utc(),
        status=status,
    )
    db.add(worker)
    db.commit()
    return worker


def test_heartbeat_accepts_lifecycle_states(db) -> None:
    worker = make_worker(db, capabilities=["mock-local"], name="lifecycle-worker")
    client = TestClient(app)
    headers = {"Authorization": f"Bearer lifecycle-worker-token"}

    for status in LIFECYCLE_STATUSES:
        response = client.post(
            f"/api/workers/{worker.id}/heartbeat",
            headers=headers,
            json={"capabilities": ["mock-local"], "status": status},
        )
        assert response.status_code == 200, (status, response.text)
        assert response.json()["status"] == status


def test_non_online_workers_do_not_satisfy_capability_readiness(db) -> None:
    for status in ("starting", "recovering_identity", "blocked_auth", "degraded", "offline"):
        make_worker(db, capabilities=["codex-gpt-5.5"], name=f"w-{status}", status=status)
    make_worker(db, capabilities=["codex-gpt-5.5"], name="w-online", status="online")

    result = capable_online_workers(db, "codex-gpt-5.5")

    assert [w.name for w in result] == ["w-online"]
