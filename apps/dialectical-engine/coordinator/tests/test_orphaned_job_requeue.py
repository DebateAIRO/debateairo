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


def test_fresh_start_registration_requeues_held_job(db) -> None:
    """A worker process that restarted while a job was in flight declares
    itself via fresh_start=True on registration -- one of two triggers
    (registration, heartbeat -- see below) that release a job the worker
    still appears to hold. (Bare polling while busy is covered by
    test_job_lifecycle.py::test_poll_while_busy_returns_none_and_keeps_the_job;
    it must NOT requeue the job, so it is not duplicated here.)"""
    from app.api.workers import RegisterRequest, register_worker
    from app.core.auth import AuthContext

    worker = _make_worker(db, capabilities=["model-a"])
    job = _make_job(db, required_model="model-a", status="running", worker=worker)
    worker.current_job_id = job.id
    db.flush()

    register_worker(
        RegisterRequest(name=worker.name, capabilities=worker.capabilities, fresh_start=True),
        db,
        AuthContext(token="user_test_token"),
    )

    db.refresh(job)
    db.refresh(worker)
    assert job.error == "Worker restarted while job was active"
    assert job.status == "pending"
    assert job.worker_id is None
    assert worker.current_job_id is None


def test_registration_without_fresh_start_leaves_held_job_alone(db) -> None:
    """A loop harness re-registers on a plain schedule (fresh_start defaults
    to False); that must not disturb a job it is still actively holding --
    only an explicit fresh_start=True announces a genuine restart."""
    from app.api.workers import RegisterRequest, register_worker
    from app.core.auth import AuthContext

    worker = _make_worker(db, capabilities=["model-a"])
    job = _make_job(db, required_model="model-a", status="running", worker=worker)
    worker.current_job_id = job.id
    db.flush()

    register_worker(
        RegisterRequest(name=worker.name, capabilities=worker.capabilities),
        db,
        AuthContext(token="user_test_token"),
    )

    db.refresh(job)
    db.refresh(worker)
    assert job.error is None
    assert job.status == "running"
    assert job.worker_id == worker.id
    assert worker.current_job_id == job.id


def test_fresh_start_heartbeat_requeues_held_job(db) -> None:
    """The codex worker persists its identity, so on a real process restart
    register() early-returns without ever POSTing -- fresh_start=True on
    registration never reaches the coordinator. The heartbeat channel
    always authenticates and always fires regardless, so it carries the
    same restart signal and must release a job the worker still appears to
    hold, exactly like fresh_start=True registration does."""
    from app.api.workers import HeartbeatRequest, heartbeat

    worker = _make_worker(db, capabilities=["model-a"])
    job = _make_job(db, required_model="model-a", status="running", worker=worker)
    worker.current_job_id = job.id
    db.flush()

    heartbeat(worker, HeartbeatRequest(fresh_start=True), db)

    db.refresh(job)
    db.refresh(worker)
    assert job.error == "Worker restarted while job was active"
    assert job.status == "pending"
    assert job.worker_id is None
    assert worker.current_job_id is None


def test_heartbeat_without_fresh_start_leaves_held_job_alone(db) -> None:
    """A plain heartbeat (fresh_start defaults to False) is the common case
    for every heartbeat sent mid-job -- it must not disturb a job the
    worker is still actively holding."""
    from app.api.workers import HeartbeatRequest, heartbeat

    worker = _make_worker(db, capabilities=["model-a"])
    job = _make_job(db, required_model="model-a", status="running", worker=worker)
    worker.current_job_id = job.id
    db.flush()

    heartbeat(worker, HeartbeatRequest(), db)

    db.refresh(job)
    db.refresh(worker)
    assert job.error is None
    assert job.status == "running"
    assert job.worker_id == worker.id
    assert worker.current_job_id == job.id


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
