"""C-1 pending-job liveness watchdog (2026-07-27 full pass, Mandate A).

On 2026-07-26, 16 jobs sat `pending` for 14-18 h with zero alerts. The only
worker advertising their required models had wedged on a hung subprocess, but
its heartbeat thread runs independently of its job loop, so `last_seen`
stayed fresh and the fleet read 4/4 online. `pending` is the reaper's OUTPUT,
not its input: once a job is pending with no capable live worker, nothing
ever looks at it again (`try_failover_job` is reachable only from failure/
timeout paths). Debate 0f688d87 burned its entire 22 317 s growth budget
waiting on jobs that could never be claimed.

This sweep alarms on every `pending` job that has sat more than a
configurable age past its deadline while no live worker serves its
`required_model`. Liveness is WORK-LOOP liveness, not process liveness:

* a fresh `Worker.last_poll_at` (stamped only by the poll/claim path via
  ``mark_worker_seen``; heartbeats never touch it), or
* a currently-held claimed/running job (sequential single-slot workers stop
  polling mid-generation; the job's own deadline/stuck sweeps bound how long
  that state can honestly persist).

`Worker.status` is deliberately NOT trusted as a liveness signal: the only
code that sets a worker offline is the `GET /api/backends/status` HTTP
handler (C-2), so a dead worker reads `online` forever unless a client polls
that endpoint. `status == "online"` is still required, because
``claim_pending_job`` refuses to hand jobs to non-online workers -- a
degraded-but-polling worker genuinely cannot claim.

Alarm shape: one WARNING log line plus one structured ops event, rate-limited
per job (one hour by default; configurable through
``DIALECTICAL_PENDING_WATCHDOG_ALERT_COOLDOWN_S``).
``watchdog.pending_job_stranded`` identifies the job, its debate, type,
required model, age, and the live/stale-advertised model sets -- a
stale-advertised model is the wedge fingerprint (capability online on paper,
work loop dead).

Optional failover (``DIALECTICAL_PENDING_WATCHDOG_FAILOVER``, default OFF --
deploy-dormant, operator flips): ladder the stranded job to the next untried
pool model that a LIVE worker serves, via the same ``try_failover_job``
bookkeeping as every other failover. Models in
``DIALECTICAL_PENDING_WATCHDOG_FAILOVER_EXCLUDE`` (default
``gemini-3.5-flash-loop``) are never targeted: that CLI ignores piped stdin
and blows ARG_MAX on large prompts (the bf6dd224 silent retry loop), so it
must not be treated as a universal target.

Contract: the sweep commits BEFORE its retry events are published (W1
commit-then-publish); the async loop publishes after ``run_pending_watchdog_
sweep`` returns, and every sweep is wrapped so a failure can never crash the
app. The loop waits one interval before its first sweep so live workers get
one poll cycle to stamp `last_poll_at` after a coordinator restart.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import bool_env, float_env, load_settings
from app.core.db import SessionLocal
from app.core.oplog import log_event
from app.core.write_lock import commit_write
from app.models.entities import Job, Worker, now_utc
from app.services.events import event_bus
from app.services.orchestrator import try_failover_job, worker_capability_set

LOGGER = logging.getLogger(__name__)

WATCHDOG_INTERVAL_ENV = "DIALECTICAL_PENDING_WATCHDOG_INTERVAL_S"
DEFAULT_WATCHDOG_INTERVAL_S = 60.0
# Same clamps as the reaper: floor keeps tests fast; ceiling keeps a typo
# from disabling the watchdog.
MIN_WATCHDOG_INTERVAL_S = 0.05
MAX_WATCHDOG_INTERVAL_S = 3600.0

STRANDED_AGE_ENV = "DIALECTICAL_PENDING_WATCHDOG_AGE_S"
DEFAULT_STRANDED_AGE_S = 600.0
MIN_STRANDED_AGE_S = 0.05
MAX_STRANDED_AGE_S = 86400.0

ALERT_COOLDOWN_ENV = "DIALECTICAL_PENDING_WATCHDOG_ALERT_COOLDOWN_S"
DEFAULT_ALERT_COOLDOWN_S = 3600.0
MIN_ALERT_COOLDOWN_S = 0.05
MAX_ALERT_COOLDOWN_S = 86400.0

WATCHDOG_FAILOVER_ENV = "DIALECTICAL_PENDING_WATCHDOG_FAILOVER"
FAILOVER_EXCLUDE_ENV = "DIALECTICAL_PENDING_WATCHDOG_FAILOVER_EXCLUDE"
DEFAULT_FAILOVER_EXCLUDE = "gemini-3.5-flash-loop"

STRANDED_EVENT = "watchdog.pending_job_stranded"
WATCHDOG_FAILOVER_REASON = "No live worker serves the required model"

# Process-local alert memory. A coordinator restart may emit one fresh alert,
# which is useful; within a process, a persistent stranded job must not produce
# one warning and structured event every minute forever.
_LAST_ALERT_MONOTONIC: dict[str, float] = {}


def pending_watchdog_interval_s() -> float:
    """Sweep interval (env-tunable, read per wait so tests can shrink it)."""
    return float_env(
        WATCHDOG_INTERVAL_ENV,
        DEFAULT_WATCHDOG_INTERVAL_S,
        MIN_WATCHDOG_INTERVAL_S,
        MAX_WATCHDOG_INTERVAL_S,
    )


def stranded_pending_age_s() -> float:
    """How long past its deadline a pending job may sit before it counts as
    stranded. Overdue-by-deadline alone is routine (workers claim on their
    own cadence and legitimate backlogs queue); stranded is deadline + age."""
    return float_env(
        STRANDED_AGE_ENV,
        DEFAULT_STRANDED_AGE_S,
        MIN_STRANDED_AGE_S,
        MAX_STRANDED_AGE_S,
    )


def alert_cooldown_s() -> float:
    """Minimum delay between repeated alerts for the same stranded job."""
    return float_env(
        ALERT_COOLDOWN_ENV,
        DEFAULT_ALERT_COOLDOWN_S,
        MIN_ALERT_COOLDOWN_S,
        MAX_ALERT_COOLDOWN_S,
    )


def _should_emit_alert(job_id: str, now_monotonic: float, cooldown_s: float) -> bool:
    """Rate-limit repeated alerts and prune expired cache entries.

    The cache is deliberately process-local: it prevents a persistent outage
    from flooding logs while still emitting a fresh signal after coordinator
    restart. Entries older than the cooldown are removed so completed jobs do
    not accumulate forever.
    """
    expired_before = now_monotonic - cooldown_s
    for cached_job_id, last_alert in list(_LAST_ALERT_MONOTONIC.items()):
        if last_alert <= expired_before:
            _LAST_ALERT_MONOTONIC.pop(cached_job_id, None)
    if job_id in _LAST_ALERT_MONOTONIC:
        return False
    _LAST_ALERT_MONOTONIC[job_id] = now_monotonic
    return True


def watchdog_failover_enabled() -> bool:
    return bool_env(WATCHDOG_FAILOVER_ENV, False)


def failover_excluded_models() -> set[str]:
    """Models the watchdog must never ladder a stranded job onto. CSV env;
    an explicitly empty value clears the exclusion list."""
    raw = os.environ.get(FAILOVER_EXCLUDE_ENV)
    if raw is None:
        raw = DEFAULT_FAILOVER_EXCLUDE
    return {model.strip() for model in raw.split(",") if model.strip()}


def _as_utc(value: datetime) -> datetime:
    # SQLite hands back naive UTC datetimes on reload; normalize before
    # arithmetic against aware now_utc() values.
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def live_served_models(db: Session, now: datetime) -> tuple[set[str], set[str]]:
    """(live, stale_advertised) capability sets.

    ``live``: models advertised by a worker whose work loop shows life -- a
    poll/claim contact within ``worker_offline_seconds``, or a currently-held
    live job. ``stale_advertised``: models advertised only by workers that
    look online (status/heartbeat) but show no work-loop life -- the
    2026-07-26 wedge fingerprint, surfaced for the ops event.
    """
    settings = load_settings()
    poll_cutoff = now - timedelta(seconds=settings.worker_offline_seconds)
    workers = db.scalars(select(Worker).where(Worker.status == "online")).all()
    held_ids = [worker.current_job_id for worker in workers if worker.current_job_id]
    live_held: dict[str, str] = {}
    if held_ids:
        held_jobs = db.scalars(
            select(Job).where(Job.id.in_(held_ids), Job.status.in_(["claimed", "running"]))
        ).all()
        live_held = {job.id: job.worker_id for job in held_jobs if job.worker_id}
    live: set[str] = set()
    stale_advertised: set[str] = set()
    for worker in workers:
        polled_recently = (
            worker.last_poll_at is not None and _as_utc(worker.last_poll_at) >= poll_cutoff
        )
        busy_on_live_job = (
            worker.current_job_id is not None
            and live_held.get(worker.current_job_id) == worker.id
        )
        if polled_recently or busy_on_live_job:
            live.update(worker_capability_set(worker))
        else:
            stale_advertised.update(worker_capability_set(worker))
    return live, stale_advertised - live


def _stake_pending_job(db: Session, job: Job) -> bool:
    """Optimistic-concurrency stake before a watchdog failover (the reaper's
    stake pattern): the conditional UPDATE misses if a worker claimed the job
    (status/deadline changed) between this sweep's read and its write, and
    the job is skipped this round -- a live claim is never clobbered."""
    result = db.execute(
        update(Job)
        .where(Job.id == job.id, Job.status == "pending", Job.deadline == job.deadline)
        .values(deadline=job.deadline)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.expire(job)
        return False
    return True


def sweep_stranded_pending_jobs(db: Session) -> list[tuple[str, str, dict[str, Any]]]:
    """One watchdog pass. Returns retry events to publish (already committed).

    ``score_debate`` is excluded exactly like the reaper (W1): scoring jobs
    are never worker-routed -- they belong to the in-process judge provider
    and its own expiry handling.
    """
    now = now_utc()
    stranded_cutoff = now - timedelta(seconds=stranded_pending_age_s())
    overdue = db.scalars(
        select(Job)
        .where(
            Job.status == "pending",
            Job.deadline < stranded_cutoff,
            Job.job_type != "score_debate",
        )
        .order_by(Job.created_at.asc())
    ).all()
    if not overdue:
        return []
    live_models, stale_advertised = live_served_models(db, now)
    failover_on = watchdog_failover_enabled()
    failover_candidates = live_models - failover_excluded_models()
    retry_events: list[tuple[str, str, dict[str, Any]]] = []
    reassigned_any = False
    stake_attempted = False
    alert_now = time.monotonic()
    cooldown_s = alert_cooldown_s()
    for job in overdue:
        if job.required_model in live_models:
            continue
        stranded_model = job.required_model
        age_s = int((now - _as_utc(job.created_at)).total_seconds())
        overdue_s = int((now - _as_utc(job.deadline)).total_seconds())
        failover_outcome = "off"
        failover_model: str | None = None
        if failover_on:
            stake_attempted = True
            if not _stake_pending_job(db, job):
                # Claimed between read and stake: no longer stranded.
                continue
            events = try_failover_job(db, job, WATCHDOG_FAILOVER_REASON, failover_candidates)
            if events:
                reassigned_any = True
                retry_events.extend(events)
                failover_outcome = "reassigned"
                failover_model = job.required_model
            else:
                failover_outcome = "no_live_candidate"
        should_alert = _should_emit_alert(job.id, alert_now, cooldown_s)
        # A successful reassignment is a new operational outcome and must be
        # visible even if an earlier alarm-only sweep started the cooldown.
        if should_alert or failover_outcome == "reassigned":
            LOGGER.warning(
                "pending job %s (%s, model %s, debate %s) has had no live capable worker for %ss "
                "(pending %ss past deadline); live models: %s; advertised by workers with dead "
                "work loops: %s; failover: %s",
                job.id,
                job.job_type,
                stranded_model,
                job.debate_id,
                age_s,
                overdue_s,
                sorted(live_models),
                sorted(stale_advertised),
                failover_model or failover_outcome,
            )
            log_event(
                LOGGER,
                STRANDED_EVENT,
                job_id=job.id,
                debate_id=job.debate_id,
                job_type=job.job_type,
                required_role=job.required_role,
                required_model=stranded_model,
                age_s=age_s,
                overdue_s=overdue_s,
                live_models=sorted(live_models),
                stale_advertised_models=sorted(stale_advertised),
                required_model_stale_advertised=stranded_model in stale_advertised,
                failover=failover_outcome,
                failover_model=failover_model,
            )
    if reassigned_any:
        # Commit BEFORE the caller publishes (W1 commit-then-publish).
        commit_write(db)
    elif stake_attempted:
        # Even a missed or candidate-less stake executed an UPDATE and holds
        # SQLite's write transaction; release it rather than relying on the
        # session's close-time rollback.
        db.rollback()
    return retry_events


def run_pending_watchdog_sweep() -> list[tuple[str, str, dict[str, Any]]]:
    with SessionLocal() as db:
        return sweep_stranded_pending_jobs(db)


async def pending_watchdog_loop(stop: asyncio.Event) -> None:
    """Lifespan background loop: wait one interval (a restart grace so live
    workers can stamp poll liveness), then sweep every interval. Each sweep
    is individually guarded -- a failure is logged and the loop keeps
    running; only `stop` ends it."""
    while True:
        try:
            await asyncio.wait_for(stop.wait(), timeout=pending_watchdog_interval_s())
        except (asyncio.TimeoutError, TimeoutError):
            pass
        if stop.is_set():
            return
        try:
            retry_events = await asyncio.to_thread(run_pending_watchdog_sweep)
            for debate_id, event, payload in retry_events:
                await event_bus.publish(debate_id, event, payload)
        except Exception:
            LOGGER.exception("pending watchdog sweep failed (non-fatal)")
