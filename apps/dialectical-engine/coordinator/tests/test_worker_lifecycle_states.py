from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.auth import hash_token
from app.main import app
from app.models.entities import Debate, Job, Worker, now_utc
from app.services.orchestrator import capable_online_workers, claim_pending_job

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


def test_online_lone_worker_can_claim_pending_job(db) -> None:
    worker = make_worker(db, capabilities=["codex-gpt-5.5"], name="claim-online", status="online")
    debate = Debate(topic="Can an online lone worker claim?", status="generating")
    db.add(debate)
    db.flush()
    job = Job(
        debate_id=debate.id,
        job_type="argue",
        required_role="proposer",
        required_model="codex-gpt-5.5",
        status="pending",
    )
    db.add(job)
    db.commit()

    claimed = claim_pending_job(db, worker)

    assert claimed is not None
    assert claimed.id == job.id
    db.expire_all()
    refreshed_worker = db.get(Worker, worker.id)
    assert refreshed_worker is not None
    assert refreshed_worker.status == "online"
    assert refreshed_worker.current_job_id == job.id


def test_non_online_poll_updates_liveness_without_promoting_status(db) -> None:
    worker = make_worker(db, capabilities=["codex-gpt-5.5"], name="liveness-starting", status="starting")
    stale_moment = now_utc()
    worker.last_seen = stale_moment
    db.commit()

    claimed = claim_pending_job(db, worker)

    assert claimed is None
    db.expire_all()
    refreshed = db.get(Worker, worker.id)
    assert refreshed is not None
    # Liveness advanced (poll observed) but lifecycle state NOT silently promoted.
    # SQLite returns naive datetimes; normalize both sides to naive UTC before comparing.
    refreshed_last_seen = refreshed.last_seen.replace(tzinfo=None)
    assert refreshed_last_seen >= stale_moment.replace(tzinfo=None)
    assert refreshed.status == "starting"


def test_non_online_lone_worker_cannot_claim_pending_job(db) -> None:
    for status in ("starting", "recovering_identity", "blocked_auth", "degraded", "offline"):
        worker = make_worker(db, capabilities=["codex-gpt-5.5"], name=f"claim-{status}", status=status)
        debate = Debate(topic=f"Can a {status} worker claim?", status="generating")
        db.add(debate)
        db.flush()
        job = Job(
            debate_id=debate.id,
            job_type="argue",
            required_role="proposer",
            required_model="codex-gpt-5.5",
            status="pending",
        )
        db.add(job)
        db.commit()

        claimed = claim_pending_job(db, worker)

        db.expire_all()
        refreshed_job = db.get(Job, job.id)
        refreshed_worker = db.get(Worker, worker.id)
        assert claimed is None
        assert refreshed_job is not None
        assert refreshed_job.status == "pending"
        assert refreshed_job.worker_id is None
        assert refreshed_worker is not None
        assert refreshed_worker.current_job_id is None
        assert refreshed_worker.status == status
