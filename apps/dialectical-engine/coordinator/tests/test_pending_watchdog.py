"""C-1 (2026-07-27 full pass): pending-job liveness watchdog.

On 2026-07-26, 16 jobs sat `pending` for 14-18 h with zero alerts: the only
worker advertising their required models was wedged on a hung subprocess, but
its heartbeat thread kept `last_seen` fresh so the fleet read 4/4 online.
`pending` is the reaper's OUTPUT, not its input -- nothing ever looked at
those jobs again, and debate 0f688d87 burned its entire growth budget waiting.

The watchdog closes that gap: a lifespan sweep alarms (WARNING + structured
ops event) on every pending job that has sat past its deadline by more than a
configurable age while NO live worker serves its required model. "Live" means
work-loop liveness -- a fresh poll/claim contact (`Worker.last_poll_at`,
stamped only by mark_worker_seen) or a currently-held live job -- NOT
heartbeats and NOT `Worker.status`, both of which stayed green through the
entire incident. Optional (default-OFF) failover ladders a stranded job to a
live-served pool model, never to an excluded transport-limited model
(gemini-3.5-flash-loop's CLI ignores piped stdin and blows ARG_MAX).
"""
from __future__ import annotations

import json
import logging
import time
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.workers import HeartbeatRequest, heartbeat
from app.core.db import SessionLocal
from app.main import app
from app.models.entities import Job, JobTransition, Worker, now_utc
from app.services.orchestrator import mark_worker_seen
from app.services.pending_watchdog import (
    DEFAULT_ALERT_COOLDOWN_S,
    DEFAULT_STRANDED_AGE_S,
    STRANDED_EVENT,
    _LAST_ALERT_MONOTONIC,
    _stake_pending_job,
    alert_cooldown_s,
    pending_watchdog_interval_s,
    stranded_pending_age_s,
    sweep_stranded_pending_jobs,
)

from tests.test_job_lifecycle import make_debate_with_job

WATCHDOG_LOGGER = "app.services.pending_watchdog"


def _worker(
    db,
    name: str,
    capabilities: list[str],
    *,
    last_seen_offset_s: float = 0.0,
    last_poll_offset_s: float | None = None,
    status: str = "online",
) -> Worker:
    """Worker row with independently tunable heartbeat vs work-loop liveness.

    `last_poll_offset_s=None` models a worker that has NEVER polled (legacy
    row / wedged since before the column existed).
    """
    now = now_utc()
    row = Worker(
        name=name,
        token_hash="test-token",
        capabilities=capabilities,
        last_seen=now - timedelta(seconds=last_seen_offset_s),
        status=status,
    )
    if last_poll_offset_s is not None:
        row.last_poll_at = now - timedelta(seconds=last_poll_offset_s)
    db.add(row)
    db.commit()
    return row


def _stranded_job(db, model: str = "gpt-5.6sol-medium", *, overdue_s: float = 700.0) -> Job:
    """Pending job whose deadline passed `overdue_s` ago (default: past the
    600 s stranded-age threshold)."""
    _, job = make_debate_with_job(db, model)
    job.deadline = now_utc() - timedelta(seconds=overdue_s)
    db.commit()
    return job


def _stranded_events(caplog) -> list[dict]:
    events = []
    for record in caplog.records:
        message = record.getMessage()
        if not message.startswith("{"):
            continue
        try:
            payload = json.loads(message)
        except ValueError:
            continue
        if payload.get("event") == STRANDED_EVENT:
            events.append(payload)
    return events


def _warning_records(caplog) -> list[logging.LogRecord]:
    return [
        record
        for record in caplog.records
        if record.name == WATCHDOG_LOGGER and record.levelno == logging.WARNING
    ]


# ---------------------------------------------------------------------------
# Sweep semantics: who counts as a live capable worker
# ---------------------------------------------------------------------------


def test_alarm_when_only_capable_worker_heartbeats_but_never_polls(db, caplog) -> None:
    """THE incident: heartbeats fresh, work loop dead, capabilities 'online'."""
    _worker(db, "mac-mini", ["gpt-5.6sol-medium"], last_seen_offset_s=5.0, last_poll_offset_s=900.0)
    job = _stranded_job(db)

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        events = sweep_stranded_pending_jobs(db)

    assert events == [], "alarm-only sweep publishes nothing (failover is off by default)"
    assert _warning_records(caplog), "a stranded pending job must emit a WARNING"
    stranded = _stranded_events(caplog)
    assert len(stranded) == 1
    payload = stranded[0]
    assert payload["job_id"] == job.id
    assert payload["debate_id"] == job.debate_id
    assert payload["job_type"] == "v2_pov"
    assert payload["required_model"] == "gpt-5.6sol-medium"
    assert payload["age_s"] >= 0
    assert payload["overdue_s"] >= 700 - 60
    assert payload["live_models"] == []
    assert "gpt-5.6sol-medium" in payload["stale_advertised_models"], (
        "the wedge fingerprint: the model is advertised by an online-looking "
        "worker whose work loop shows no life"
    )
    assert payload["failover"] == "off"
    db.refresh(job)
    assert job.required_model == "gpt-5.6sol-medium", "alarm must not retarget the job by default"


def test_no_alarm_when_a_polling_worker_serves_the_model(db, caplog) -> None:
    _worker(db, "codex", ["gpt-5.6sol-medium"], last_poll_offset_s=5.0)
    _stranded_job(db)

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        sweep_stranded_pending_jobs(db)

    assert _warning_records(caplog) == []
    assert _stranded_events(caplog) == []


def test_no_alarm_before_the_stranded_age_threshold(db, caplog) -> None:
    """Overdue-by-deadline alone is routine (workers claim on their own
    cadence); the alarm needs deadline + stranded age."""
    _stranded_job(db, overdue_s=100.0)  # < 600 s default threshold, zero workers

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        sweep_stranded_pending_jobs(db)

    assert _warning_records(caplog) == []
    assert _stranded_events(caplog) == []


def test_worker_busy_on_a_live_held_job_counts_as_live(db, caplog) -> None:
    """Sequential single-slot workers stop polling while a job runs; a live
    held claim is work-loop liveness (the job's own sweeps bound it)."""
    worker = _worker(db, "codex", ["gpt-5.6sol-medium"], last_poll_offset_s=400.0)
    _, held = make_debate_with_job(db, "gpt-5.6sol-medium")
    held.status = "running"
    held.worker_id = worker.id
    held.claimed_at = now_utc()
    held.deadline = now_utc() + timedelta(seconds=300)
    worker.current_job_id = held.id
    db.commit()
    _stranded_job(db)

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        sweep_stranded_pending_jobs(db)

    assert _warning_records(caplog) == []
    assert _stranded_events(caplog) == []


def test_online_status_alone_is_not_liveness(db, caplog) -> None:
    """C-2: the ONLY offline sweep lives in an HTTP handler, so a dead
    worker's row reads status='online' forever. The watchdog must not
    believe it."""
    _worker(
        db,
        "mac-mini",
        ["gpt-5.6sol-medium"],
        last_seen_offset_s=4000.0,
        last_poll_offset_s=4000.0,
        status="online",
    )
    _stranded_job(db)

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        sweep_stranded_pending_jobs(db)

    assert _warning_records(caplog), "a dead-but-never-swept worker must not suppress the alarm"


def test_score_debate_jobs_are_exempt(db, caplog) -> None:
    """score_debate is never worker-routed (in-process judge); same exemption
    as the reaper."""
    job = _stranded_job(db)
    job.job_type = "score_debate"
    db.commit()

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        sweep_stranded_pending_jobs(db)

    assert _warning_records(caplog) == []
    assert _stranded_events(caplog) == []


def test_repeated_stranded_alerts_are_rate_limited(db, monkeypatch, caplog) -> None:
    """A persistent outage must not emit one warning/event per job per minute."""
    _LAST_ALERT_MONOTONIC.clear()
    job = _stranded_job(db)
    ticks = iter([100.0, 100.1, 3700.1])
    monkeypatch.setattr("app.services.pending_watchdog.time.monotonic", lambda: next(ticks))

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        sweep_stranded_pending_jobs(db)
        assert len(_stranded_events(caplog)) == 1
        caplog.clear()

        sweep_stranded_pending_jobs(db)
        assert _warning_records(caplog) == []
        assert _stranded_events(caplog) == []
        caplog.clear()

        sweep_stranded_pending_jobs(db)
        assert len(_warning_records(caplog)) == 1
        assert _stranded_events(caplog)[0]["job_id"] == job.id


# ---------------------------------------------------------------------------
# Work-loop liveness stamping: polls yes, heartbeats no
# ---------------------------------------------------------------------------


def test_mark_worker_seen_stamps_poll_liveness(db) -> None:
    worker = _worker(db, "codex", ["gpt-5.6sol-medium"])
    assert worker.last_poll_at is None
    now = now_utc()

    mark_worker_seen(worker, now)

    assert worker.last_poll_at == now


def test_heartbeat_does_not_stamp_poll_liveness(db) -> None:
    """The incident's exact lie: an independent heartbeat thread kept
    last_seen fresh for 18 h while the work loop was wedged. Heartbeats must
    never count as poll liveness."""
    worker = _worker(db, "mac-mini", ["gpt-5.6sol-medium"], last_seen_offset_s=600.0)
    stale_last_seen = worker.last_seen

    heartbeat(worker=worker, payload=HeartbeatRequest(), db=db)

    db.refresh(worker)
    assert worker.last_seen != stale_last_seen, "heartbeat still proves process liveness"
    assert worker.last_poll_at is None, "heartbeat must NOT prove work-loop liveness"


# ---------------------------------------------------------------------------
# Optional failover: dormant by default, live-target only, exclusions honored
# ---------------------------------------------------------------------------


def test_stranded_failover_is_dormant_by_default(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    _worker(db, "claude-loop", ["claude-sonnet-5-high-loop"], last_poll_offset_s=5.0)
    job = _stranded_job(db, "gpt-5.6sol-medium")

    events = sweep_stranded_pending_jobs(db)

    assert events == []
    db.refresh(job)
    assert job.required_model == "gpt-5.6sol-medium"


def test_stranded_failover_ladders_to_a_live_served_model_when_enabled(db, monkeypatch, caplog) -> None:
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_FAILOVER", "true")
    _worker(db, "claude-loop", ["claude-sonnet-5-high-loop"], last_poll_offset_s=5.0)
    job = _stranded_job(db, "gpt-5.6sol-medium")

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        events = sweep_stranded_pending_jobs(db)

    assert any(name == "node_retrying" for _, name, _ in events), (
        "a watchdog reassignment publishes the same retry event as any failover"
    )
    db.refresh(job)
    assert job.required_model == "claude-sonnet-5-high-loop"
    assert job.status == "pending"
    assert job.attempts == 0 and (job.timeout_attempts or 0) == 0
    assert "gpt-5.6sol-medium" in (job.payload or {}).get("tried_models", [])
    trail = [
        (row.to_status, row.channel)
        for row in db.scalars(select(JobTransition).where(JobTransition.job_id == job.id)).all()
    ]
    assert ("pending", "failover") in trail
    payload = _stranded_events(caplog)[0]
    assert payload["failover"] == "reassigned"
    assert payload["failover_model"] == "claude-sonnet-5-high-loop"


def test_stranded_failover_refuses_excluded_transport_limited_model(db, monkeypatch, caplog) -> None:
    """gemini-3.5-flash-loop's CLI passes prompts on argv (ignores stdin) and
    blows ARG_MAX on large trees -- laddering a stranded job onto it recreates
    the bf6dd224 silent retry loop. Excluded by default."""
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_FAILOVER", "true")
    _worker(db, "gemini-antigravity-loop", ["gemini-3.5-flash-loop"], last_poll_offset_s=5.0)
    job = _stranded_job(db, "gpt-5.6sol-medium")

    with caplog.at_level(logging.INFO, logger=WATCHDOG_LOGGER):
        events = sweep_stranded_pending_jobs(db)

    assert events == []
    db.refresh(job)
    assert job.required_model == "gpt-5.6sol-medium", "must not target the excluded model"
    payload = _stranded_events(caplog)[0]
    assert payload["failover"] == "no_live_candidate"


def test_stake_guard_refuses_concurrently_claimed_job(db) -> None:
    """The reaper's optimistic-concurrency contract, watchdog edition: a
    worker claim landing between the sweep's read and its failover write
    makes the stake miss -- a live claim is never clobbered."""
    job = _stranded_job(db, "gpt-5.6sol-medium")
    assert job.status == "pending"  # load pre-claim state into this session

    with SessionLocal() as concurrent:
        claimed = concurrent.get(Job, job.id)
        claimed.status = "running"
        claimed.deadline = now_utc() + timedelta(seconds=300)
        concurrent.commit()

    assert _stake_pending_job(db, job) is False
    db.rollback()
    with SessionLocal() as fresh:
        persisted = fresh.get(Job, job.id)
        assert persisted.status == "running", "the concurrently claimed job is untouched"
        assert persisted.required_model == "gpt-5.6sol-medium"


# ---------------------------------------------------------------------------
# Lifespan wiring
# ---------------------------------------------------------------------------


def test_watchdog_env_knobs(monkeypatch) -> None:
    assert pending_watchdog_interval_s() == 60.0
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_INTERVAL_S", "0")
    assert pending_watchdog_interval_s() == 0.05, "clamped to the floor"
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_INTERVAL_S", "999999")
    assert pending_watchdog_interval_s() == 3600.0, "clamped to the ceiling"

    assert stranded_pending_age_s() == DEFAULT_STRANDED_AGE_S == 600.0
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_AGE_S", "0")
    assert stranded_pending_age_s() == 0.05, "clamped to the floor"
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_AGE_S", "99999999")
    assert stranded_pending_age_s() == 86400.0, "clamped to the ceiling"

    assert alert_cooldown_s() == DEFAULT_ALERT_COOLDOWN_S == 3600.0
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_ALERT_COOLDOWN_S", "0")
    assert alert_cooldown_s() == 0.05, "clamped to the floor"
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_ALERT_COOLDOWN_S", "99999999")
    assert alert_cooldown_s() == 86400.0, "clamped to the ceiling"


def test_lifespan_starts_and_stops_watchdog_without_leaked_tasks(db) -> None:
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        task = app.state.pending_watchdog_task
        assert task is not None and not task.done()
    assert task.done(), "shutdown must stop the watchdog task (no leaked tasks)"
    assert task.cancelled() is False, "the loop exits cooperatively via the stop event"
    assert task.exception() is None


def test_stranded_job_is_reassigned_within_one_interval_e2e(db, monkeypatch) -> None:
    """Acceptance: zero capable workers for the stranded model, lifespan-driven
    watchdog with failover enabled retargets it to the live-served model."""
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_INTERVAL_S", "0.05")
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_AGE_S", "0.05")
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_FAILOVER", "true")
    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    _worker(db, "claude-loop", ["claude-sonnet-5-high-loop"], last_poll_offset_s=1.0)
    job = _stranded_job(db, "gpt-5.6sol-medium", overdue_s=30.0)
    job_id = job.id
    db.expire_all()

    with TestClient(app):
        deadline = time.monotonic() + 5.0
        reassigned = False
        while time.monotonic() < deadline:
            with SessionLocal() as fresh:
                required_model = fresh.get(Job, job_id).required_model
            if required_model == "claude-sonnet-5-high-loop":
                reassigned = True
                break
            time.sleep(0.02)
    assert reassigned, "the watchdog must ladder a stranded job to a live-served model"


def test_watchdog_sweep_failure_never_crashes_the_app(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_PENDING_WATCHDOG_INTERVAL_S", "0.05")

    def _boom() -> list:
        raise RuntimeError("watchdog sweep exploded")

    monkeypatch.setattr("app.services.pending_watchdog.run_pending_watchdog_sweep", _boom)
    with TestClient(app) as client:
        time.sleep(0.2)  # let several sweeps fail
        assert client.get("/healthz").json() == {"status": "ok"}
        task = app.state.pending_watchdog_task
        assert not task.done(), "a failing sweep must not kill the loop"
    assert task.done() and task.exception() is None
