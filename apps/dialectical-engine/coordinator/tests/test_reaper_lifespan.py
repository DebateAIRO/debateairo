"""W5b: lifespan deadline reaper.

With zero polling workers an expired claim used to sit forever (the claim-path
reaper only runs when a worker polls). The lifespan reaper sweeps expired
claims through the SAME W1-bounded requeue/terminalize path on a config
interval, stakes each row with a conditional UPDATE (optimistic concurrency)
so a concurrent claim or second instance can never double-requeue, and starts/
stops cleanly with the app.
"""
from __future__ import annotations

import time
from datetime import timedelta

from fastapi.testclient import TestClient

from app.core.auth import hash_token
from app.core.db import SessionLocal
from app.main import app
from app.models.entities import Debate, Job, JobTransition, Node, Worker, now_utc
from app.services.reaper import (
    _stake_expired_job,
    reaper_interval_s,
    sweep_expired_claims,
)
from sqlalchemy import select


def _seed_claimed_job(
    db,
    *,
    job_type: str = "argue",
    attempts: int = 1,
    timeout_attempts: int = 0,
    deadline_offset_s: float = -120.0,
) -> tuple[Debate, Node, Job, Worker]:
    worker = Worker(
        name=f"reaper-worker-{now_utc().timestamp()}",
        token_hash=hash_token("reaper-token"),
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    debate = Debate(topic="Should cities ban cars?", status="generating", config={"max_depth": 2})
    db.add_all([worker, debate])
    db.flush()
    node = Node(
        debate_id=debate.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Cleaner air.",
        status="generating",
        materialized_path="/0/0",
    )
    db.add(node)
    db.flush()
    debate.root_node_id = node.id
    job = Job(
        debate_id=debate.id,
        node_id=node.id,
        job_type=job_type,
        required_role="proposer",
        required_model="mock-local",
        status="running",
        worker_id=worker.id,
        claimed_at=now_utc(),
        deadline=now_utc() + timedelta(seconds=deadline_offset_s),
        attempts=attempts,
        timeout_attempts=timeout_attempts,
    )
    db.add(job)
    worker.current_job_id = job.id
    db.commit()
    return debate, node, job, worker


# ---------------------------------------------------------------------------
# Sweep semantics (session-level)
# ---------------------------------------------------------------------------


def test_sweep_requeues_expired_claim_through_w1_path(db) -> None:
    _, _, job, worker = _seed_claimed_job(db)

    events = sweep_expired_claims(db)

    assert events == [], "a within-budget expiry requeues without terminal events"
    db.refresh(job)
    db.refresh(worker)
    assert job.status == "pending"
    assert job.timeout_attempts == 1, "reaper expiry burns half-weight budget (W1)"
    assert job.worker_id is None and worker.current_job_id is None
    # SQLite returns naive UTC datetimes on refresh; compare naive-to-naive.
    assert job.deadline.replace(tzinfo=None) > now_utc().replace(tzinfo=None), (
        "requeued with a fresh deadline"
    )
    trail = [
        (row.to_status, row.channel)
        for row in db.scalars(
            select(JobTransition).where(JobTransition.job_id == job.id)
        ).all()
    ]
    assert ("pending", "timeout_requeue") in trail


def test_sweep_terminalizes_at_budget_and_returns_events_after_commit(db) -> None:
    debate, node, job, _ = _seed_claimed_job(db, attempts=8, timeout_attempts=7)

    events = sweep_expired_claims(db)

    assert [(event_debate, name) for event_debate, name, _ in events] == [
        (debate.id, "node_failed")
    ]
    payload = events[0][2]
    assert payload["terminal"] is True and payload["node_id"] == node.id
    # Terminal state is COMMITTED before the caller publishes (fresh session).
    with SessionLocal() as fresh:
        persisted = fresh.get(Job, job.id)
        assert persisted.status == "failed"
        failed_node = fresh.get(Node, node.id)
        assert failed_node.status == "failed"
        assert failed_node.stopping_reason == "generation_exhausted"
        assert fresh.get(Debate, debate.id).status != "failed"


def test_sweep_leaves_score_debate_jobs_alone(db) -> None:
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.flush()
    scoring_job = Job(
        debate_id=debate.id,
        job_type="score_debate",
        required_role="judge",
        required_model="mock-judge",
        status="claimed",
        deadline=now_utc() - timedelta(minutes=10),
    )
    db.add(scoring_job)
    db.commit()

    events = sweep_expired_claims(db)

    db.refresh(scoring_job)
    assert events == []
    assert scoring_job.status == "claimed", "scoring expiry stays owned by its own state machine"


def test_stake_guard_refuses_concurrently_reclaimed_job(db) -> None:
    """Optimistic concurrency: a claim that lands between the sweep's read and
    its conditional UPDATE makes the stake miss -- no double-requeue."""
    _, _, job, _ = _seed_claimed_job(db)
    assert job.status == "running"  # load pre-claim state into this session

    fresh_deadline = now_utc() + timedelta(seconds=90)
    with SessionLocal() as concurrent:
        reclaimed = concurrent.get(Job, job.id)
        reclaimed.deadline = fresh_deadline  # concurrent worker claim refreshed it
        concurrent.commit()

    assert _stake_expired_job(db, job, now_utc()) is False
    db.rollback()
    with SessionLocal() as fresh:
        persisted = fresh.get(Job, job.id)
        assert persisted.status == "running", "the concurrently reclaimed job is untouched"
        assert (persisted.timeout_attempts or 0) == 0, "no budget burned on a lost stake"


def test_stake_succeeds_on_unchanged_row(db) -> None:
    _, _, job, _ = _seed_claimed_job(db)
    assert job.status == "running"

    assert _stake_expired_job(db, job, now_utc()) is True


# ---------------------------------------------------------------------------
# Lifespan wiring
# ---------------------------------------------------------------------------


def test_reaper_interval_env_knob(monkeypatch) -> None:
    assert reaper_interval_s() == 60.0
    monkeypatch.setenv("DIALECTICAL_REAPER_INTERVAL_S", "0.2")
    assert reaper_interval_s() == 0.2
    monkeypatch.setenv("DIALECTICAL_REAPER_INTERVAL_S", "0")
    assert reaper_interval_s() == 0.05, "clamped to the floor"
    monkeypatch.setenv("DIALECTICAL_REAPER_INTERVAL_S", "999999")
    assert reaper_interval_s() == 3600.0, "clamped to the ceiling"


def test_lifespan_starts_and_stops_reaper_without_leaked_tasks(db) -> None:
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        task = app.state.reaper_task
        assert task is not None and not task.done()
    assert task.done(), "shutdown must stop the reaper task (no leaked tasks)"
    assert task.cancelled() is False, "the loop exits cooperatively via the stop event"
    assert task.exception() is None


def test_expired_claim_requeues_within_one_interval_with_zero_workers(db, monkeypatch) -> None:
    """Acceptance: zero polling workers, lifespan-driven, short interval."""
    monkeypatch.setenv("DIALECTICAL_REAPER_INTERVAL_S", "0.05")
    _, _, job, _ = _seed_claimed_job(db)
    job_id = job.id
    db.expire_all()

    with TestClient(app):
        deadline = time.monotonic() + 5.0
        requeued = False
        while time.monotonic() < deadline:
            with SessionLocal() as fresh:
                status = fresh.get(Job, job_id).status
            if status == "pending":
                requeued = True
                break
            time.sleep(0.02)
    assert requeued, "the reaper must requeue an expired claim with no worker polling"
    with SessionLocal() as fresh:
        persisted = fresh.get(Job, job_id)
        assert persisted.timeout_attempts == 1
        assert persisted.worker_id is None


def test_reaper_sweep_failure_never_crashes_the_app(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_REAPER_INTERVAL_S", "0.05")

    def _boom() -> list:
        raise RuntimeError("sweep exploded")

    monkeypatch.setattr("app.services.reaper.run_reaper_sweep", _boom)
    with TestClient(app) as client:
        time.sleep(0.2)  # let several sweeps fail
        assert client.get("/healthz").json() == {"status": "ok"}
        task = app.state.reaper_task
        assert not task.done(), "a failing sweep must not kill the loop"
    assert task.done() and task.exception() is None
