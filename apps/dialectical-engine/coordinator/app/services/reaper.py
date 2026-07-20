"""W5b lifespan deadline reaper.

Before this module, expired claims were reaped only inside
``claim_pending_job`` -- with zero polling workers an expired claim sat
forever. The reaper sweeps them on a config interval
(``DIALECTICAL_REAPER_INTERVAL_S``, default 60) through the SAME W1-bounded
requeue/terminalize path (``requeue_or_terminalize_timed_out_job``), so the
attempt budget, node degradation, and terminal-event shapes stay identical to
the claim-path reaper.

Concurrency: each expired job is first "staked" with a conditional UPDATE
(``WHERE status AND deadline unchanged`` -- optimistic concurrency, not a new
lock). A worker claim, another sweep, or a second coordinator instance that
touched the row since our read makes the stake miss (rowcount 0) and the job
is skipped -- no double-requeue, no double budget burn.

Contract: the sweep commits BEFORE its terminal events are published (W1
commit-then-publish); the async loop publishes after ``run_reaper_sweep``
returns, and every sweep is wrapped so a failure can never crash the app.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import float_env
from app.core.db import SessionLocal
from app.core.write_lock import commit_write
from app.models.entities import Job, now_utc
from app.services.events import event_bus
from app.services.orchestrator import requeue_or_terminalize_timed_out_job

LOGGER = logging.getLogger(__name__)

REAPER_INTERVAL_ENV = "DIALECTICAL_REAPER_INTERVAL_S"
DEFAULT_REAPER_INTERVAL_S = 60.0
# Floor keeps tests fast; ceiling keeps a typo from disabling the reaper.
MIN_REAPER_INTERVAL_S = 0.05
MAX_REAPER_INTERVAL_S = 3600.0
REAPER_TIMEOUT_REASON = "Job deadline expired"


def reaper_interval_s() -> float:
    """Sweep interval (env-tunable, read per wait so tests can shrink it)."""
    return float_env(
        REAPER_INTERVAL_ENV,
        DEFAULT_REAPER_INTERVAL_S,
        MIN_REAPER_INTERVAL_S,
        MAX_REAPER_INTERVAL_S,
    )


def _stake_expired_job(db: Session, job: Job, now: Any) -> bool:
    """Optimistic-concurrency stake on one expired row.

    The conditional UPDATE succeeds only when status AND deadline are still
    exactly what this sweep read -- any concurrent claim (fresh deadline),
    concurrent requeue (status pending), or second-instance sweep (deadline
    already restaked) makes it miss, and the job is skipped this round.
    """
    result = db.execute(
        update(Job)
        .where(Job.id == job.id, Job.status == job.status, Job.deadline == job.deadline)
        .values(deadline=now)
        .execution_options(synchronize_session=False)
    )
    # Post-stake state is reloaded on next attribute access either way.
    db.expire(job)
    return result.rowcount == 1


def sweep_expired_claims(db: Session) -> list[tuple[str, str, dict[str, Any]]]:
    """One reaper pass. Returns terminal events to publish (already committed).

    ``score_debate`` is excluded exactly like the claim-path reaper (W1):
    scoring expiry stays owned by ``_expire_stale_scoring_jobs`` -- reaping it
    here would resurrect background scoring jobs and flip complete debates
    back to "generating".
    """
    now = now_utc()
    expired = db.scalars(
        select(Job).where(
            Job.status.in_(["claimed", "running"]),
            Job.deadline < now,
            Job.job_type != "score_debate",
        )
    ).all()
    terminal_events: list[tuple[str, str, dict[str, Any]]] = []
    staked_any = False
    for job in expired:
        if not _stake_expired_job(db, job, now):
            continue
        staked_any = True
        terminal_events.extend(
            requeue_or_terminalize_timed_out_job(db, job, REAPER_TIMEOUT_REASON)
        )
    if staked_any:
        # Commit BEFORE the caller publishes (W1 terminal-event contract).
        commit_write(db)
    return terminal_events


def run_reaper_sweep() -> list[tuple[str, str, dict[str, Any]]]:
    with SessionLocal() as db:
        return sweep_expired_claims(db)


async def reaper_loop(stop: asyncio.Event) -> None:
    """Lifespan background loop: sweep immediately (restart recovery), then
    every interval. Each sweep is individually guarded -- a sweep failure is
    logged and the loop keeps running; only `stop` ends it."""
    while True:
        try:
            terminal_events = await asyncio.to_thread(run_reaper_sweep)
            for debate_id, event, payload in terminal_events:
                await event_bus.publish(debate_id, event, payload)
        except Exception:
            LOGGER.exception("reaper sweep failed (non-fatal)")
        if stop.is_set():
            return
        try:
            await asyncio.wait_for(stop.wait(), timeout=reaper_interval_s())
        except (asyncio.TimeoutError, TimeoutError):
            continue
        return
