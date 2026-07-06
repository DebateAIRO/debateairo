from __future__ import annotations

from datetime import timedelta

from app.core.auth import hash_token
from app.models.entities import Debate, Job, Worker, now_utc
from app.services.orchestrator import claim_pending_job


def _make_worker(db, *, name: str = "mac-mini", capabilities: list[str] | None = None) -> Worker:
    worker = Worker(
        name=name,
        token_hash=hash_token(f"{name}-token"),
        capabilities=capabilities or ["model-a"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.flush()
    return worker


def _make_job(db, *, required_model: str, status: str, worker: Worker) -> Job:
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 1, "branching": 2})
    db.add(debate)
    db.flush()
    job = Job(
        debate_id=debate.id,
        node_id=None,
        job_type="argue",
        required_role="proposer",
        required_model=required_model,
        status=status,
        worker_id=worker.id,
        deadline=now_utc() + timedelta(minutes=5),
    )
    db.add(job)
    db.flush()
    return job


def test_polling_worker_with_orphaned_running_job_requeues_it_first(db) -> None:
    worker = _make_worker(db, capabilities=["model-a"])
    job = _make_job(db, required_model="model-a", status="running", worker=worker)
    worker.current_job_id = job.id
    db.flush()

    claimed = claim_pending_job(db, worker)

    db.refresh(job)
    # The orphaned job was released; the worker may then re-claim it (fine) —
    # what must never happen is the job staying claimed/running for a worker
    # that is polling for new work.
    assert job.error == "Worker restarted while job was active"
    assert (claimed is None and job.status == "pending" and job.worker_id is None) or (
        claimed is not None and claimed.id == job.id and job.claimed_at is not None
    )


def test_polling_worker_does_not_touch_other_workers_jobs(db) -> None:
    worker_a = _make_worker(db, capabilities=["model-a"], name="a")
    worker_b = _make_worker(db, capabilities=["model-b"], name="b")
    job_b = _make_job(db, required_model="model-b", status="running", worker=worker_b)
    worker_b.current_job_id = job_b.id
    db.flush()

    claim_pending_job(db, worker_a)

    db.refresh(job_b)
    assert job_b.status == "running"
    assert job_b.worker_id == worker_b.id
