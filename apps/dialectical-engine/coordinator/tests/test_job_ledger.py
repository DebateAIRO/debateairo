"""W5b: job transition ledger + structured hot-path logs.

Every job state change (create/claim/complete/fail/requeue/terminalize and
the scoring channels) leaves an additive JobTransition row written at the
existing transition points, best-effort (a ledger failure never fails the
transition), and emits one parseable JSON log line.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import inspect, select

from app.core.auth import hash_token
from app.main import app  # noqa: F401 - warm up the import graph
from app.models.entities import Debate, Job, JobTransition, Worker, now_utc
from app.scoring.jobs import wake_pending_internal_scoring_job
from app.scoring.service import STALE_SCORING_JOB_ERROR, get_debate_scoring
from app.services.job_ledger import record_job_transition
from app.services.orchestrator import (
    claim_pending_job,
    complete_job,
    create_debate,
    fail_job,
    requeue_or_terminalize_timed_out_job,
)


def _worker(db, *, name: str = "mac-mini", capabilities: list[str] | None = None) -> Worker:
    worker = Worker(
        name=name,
        token_hash=hash_token(f"{name}-token"),
        capabilities=capabilities or ["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def _transitions(db, job_id: str) -> list[JobTransition]:
    return list(
        db.scalars(
            select(JobTransition)
            .where(JobTransition.job_id == job_id)
            .order_by(JobTransition.created_at.asc(), JobTransition.id.asc())
        ).all()
    )


def _decompose_result() -> dict:
    return {
        "root_claim": "Should cities ban cars?",
        "argument": "The root has been decomposed.",
        "children": [
            {"node_type": "PRO", "claim": "Cleaner air."},
            {"node_type": "CON", "claim": "Mobility loss."},
        ],
    }


def test_create_claim_fail_requeue_terminal_leaves_full_trail(db, monkeypatch) -> None:
    """Acceptance: create -> claim -> fail -> requeue -> terminal, all audited."""
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "2")
    worker = _worker(db)
    create_debate(db, "Should cities ban cars?")

    job = claim_pending_job(db, worker)
    assert job is not None and job.job_type == "decompose"

    # Worker-reported retryable failure -> requeue (budget not yet exhausted).
    asyncio.run(fail_job(db, job, "provider unavailable", retryable=True))
    assert job.status == "pending"

    # Second claim, then a timeout-class requeue (half-weight budget).
    worker.status = "online"
    db.commit()
    assert claim_pending_job(db, worker) is job
    events = requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    assert events == [] and job.status == "pending"

    # Third claim burns the last budget; the next failure is terminal.
    worker.status = "online"
    worker.current_job_id = None
    db.commit()
    assert claim_pending_job(db, worker) is job
    asyncio.run(fail_job(db, job, "provider unavailable", retryable=True))
    assert job.status == "failed"

    trail = [(row.from_status, row.to_status, row.channel) for row in _transitions(db, job.id)]
    assert trail == [
        (None, "pending", "create"),
        ("pending", "running", "claim"),
        ("running", "pending", "worker_fail"),
        ("pending", "running", "claim"),
        ("running", "pending", "timeout_requeue"),
        ("pending", "running", "claim"),
        ("running", "failed", "terminalize"),
    ]
    rows = _transitions(db, job.id)
    assert all(row.debate_id == job.debate_id for row in rows)
    assert all(row.job_type == "decompose" for row in rows)
    assert rows[-1].reason and "provider unavailable" in rows[-1].reason


def test_completed_job_records_complete_transition(db) -> None:
    worker = _worker(db)
    create_debate(db, "Should cities ban cars?")
    job = claim_pending_job(db, worker)
    assert job is not None

    asyncio.run(complete_job(db, job, _decompose_result(), {"latency_ms": 5}))

    trail = [(row.from_status, row.to_status, row.channel) for row in _transitions(db, job.id)]
    assert trail == [
        (None, "pending", "create"),
        ("pending", "running", "claim"),
        ("running", "complete", "complete"),
    ]


def test_scoring_wake_and_stale_expiry_are_audited(db) -> None:
    from tests.test_failure_lifecycle import _RecordingBackgroundTasks, _scoring_registry_factory

    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.flush()
    stale = Job(
        debate_id=debate.id,
        job_type="score_debate",
        required_role="judge",
        required_model="mock-judge",
        status="pending",
        deadline=now_utc() - timedelta(minutes=5),
    )
    db.add(stale)
    db.commit()

    job = wake_pending_internal_scoring_job(
        db,
        debate,
        _RecordingBackgroundTasks(),
        registry_factory=_scoring_registry_factory(),
        background_runner=lambda *_: None,
    )

    assert job is not None and job.status == "claimed"
    stale_trail = [(row.to_status, row.channel) for row in _transitions(db, stale.id)]
    assert ("failed", "scoring_stale") in stale_trail
    assert stale.error == STALE_SCORING_JOB_ERROR
    wake_trail = [(row.from_status, row.to_status, row.channel) for row in _transitions(db, job.id)]
    assert wake_trail[-1] == ("pending", "claimed", "scoring_wake")


def test_expire_stale_scoring_jobs_records_scoring_stale_transition(db) -> None:
    """The _expire_stale_scoring_jobs choke point (app/scoring/service.py),
    reached via the debate-scoring read path, must leave the same
    scoring_stale ledger trail as its wake-loop and status-poll siblings.
    """
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.flush()
    stale = Job(
        debate_id=debate.id,
        job_type="score_debate",
        required_role="judge",
        required_model="mock-judge",
        status="running",
        deadline=now_utc() - timedelta(minutes=5),
    )
    db.add(stale)
    db.commit()

    payload = get_debate_scoring(db, debate.id)

    assert payload is not None
    assert stale.status == "failed"
    assert stale.error == STALE_SCORING_JOB_ERROR
    trail = [(row.job_id, row.from_status, row.to_status, row.channel, row.reason) for row in _transitions(db, stale.id)]
    assert trail == [(stale.id, "running", "failed", "scoring_stale", STALE_SCORING_JOB_ERROR)]


def test_record_job_transition_sanitizes_and_bounds_reason(db) -> None:
    """The choke point sanitizes reason the same way job.error is sanitized
    elsewhere (terminalize_job_failure, fail_job): whitespace collapsed and
    bounded to MAX_REASON_CHARS, so every ledger row carries the same
    curated string class regardless of which call site's reason was raw.
    """
    debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    db.add(debate)
    db.flush()
    job = Job(
        debate_id=debate.id,
        job_type="score_debate",
        required_role="judge",
        required_model="mock-judge",
        status="running",
        deadline=now_utc(),
    )
    db.add(job)
    db.flush()

    dirty_reason = "line one\n\n\twith\ttabs   and   spaces " + ("x" * 3000)
    record_job_transition(
        db, job, from_status="running", to_status="failed", channel="scoring_fail", reason=dirty_reason
    )
    db.commit()

    row = _transitions(db, job.id)[-1]
    assert row.reason is not None
    assert "\n" not in row.reason
    assert "\t" not in row.reason
    assert "  " not in row.reason
    assert len(row.reason) <= 2_000


def test_hot_path_transitions_emit_parseable_json_log_lines(db, caplog) -> None:
    worker = _worker(db)
    with caplog.at_level(logging.INFO, logger="app.services.job_ledger"):
        create_debate(db, "Should cities ban cars?")
        job = claim_pending_job(db, worker)
        assert job is not None
        asyncio.run(complete_job(db, job, _decompose_result(), {"latency_ms": 5}))

    ledger_records = [record for record in caplog.records if record.name == "app.services.job_ledger"]
    assert ledger_records, "hot paths must emit structured log lines"
    payloads = [json.loads(record.getMessage()) for record in ledger_records]
    events = [payload["event"] for payload in payloads]
    assert "job.create" in events
    assert "job.claim" in events
    assert "job.complete" in events
    for payload in payloads:
        assert payload["job_id"]
        assert payload["outcome"]
    completes = [payload for payload in payloads if payload["event"] == "job.complete"]
    assert completes and isinstance(completes[0].get("duration_ms"), int)


def test_ledger_failure_never_fails_the_transition(db, monkeypatch) -> None:
    def _boom(*args, **kwargs):
        raise RuntimeError("ledger unavailable")

    monkeypatch.setattr("app.services.job_ledger.JobTransition", _boom)
    worker = _worker(db)
    create_debate(db, "Should cities ban cars?")

    job = claim_pending_job(db, worker)

    assert job is not None and job.status == "running", (
        "a ledger write failure must never fail the real transition"
    )
    assert _transitions(db, job.id) == []


def test_job_transitions_migration_applies_cleanly_to_empty_database(tmp_path, monkeypatch) -> None:
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine

    db_path = tmp_path / "migration-job-transitions.sqlite3"
    coordinator_dir = Path(__file__).resolve().parents[1]
    monkeypatch.setenv("DIALECTICAL_HOME", str(tmp_path))
    monkeypatch.setenv("DIALECTICAL_DATABASE_URL", f"sqlite:///{db_path}")

    config = Config(str(coordinator_dir / "alembic.ini"))
    config.set_main_option("script_location", str(coordinator_dir / "migrations"))
    command.upgrade(config, "head")

    migrated_engine = create_engine(f"sqlite:///{db_path}", future=True)
    try:
        inspector = inspect(migrated_engine)
        assert "job_transitions" in set(inspector.get_table_names())
        columns = {column["name"] for column in inspector.get_columns("job_transitions")}
        assert {
            "id",
            "job_id",
            "debate_id",
            "job_type",
            "from_status",
            "to_status",
            "reason",
            "channel",
            "created_at",
        } <= columns
        indexes = {index["name"] for index in inspector.get_indexes("job_transitions")}
        assert {
            "ix_job_transitions_job_id",
            "ix_job_transitions_debate_id",
            "ix_job_transitions_created_at",
        } <= indexes
    finally:
        migrated_engine.dispose()
