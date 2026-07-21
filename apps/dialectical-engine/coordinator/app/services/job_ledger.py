"""W5b job transition ledger + structured hot-path logs.

record_job_transition is called at every existing job state-change point
(create/claim/complete/fail/requeue/terminalize plus the scoring lifecycle
channels). It does two things per transition:

1. appends an additive JobTransition row (joins the caller's transaction --
   the ledger row commits or rolls back WITH the transition it describes);
2. emits one structured JSON log line (app.core.oplog) named
   ``job.<channel>``.

Both are strictly best-effort: any failure is swallowed and logged at debug
level -- the ledger must never fail or delay the real transition. Reasons are
truncated and come from the same public/curated strings the job rows already
persist; LLM text bodies never reach this module.

Channel vocabulary (also the log event suffix):
    create           create_job (new pending job)
    claim            try_claim_pending_job (worker claimed; pending -> running)
    complete         complete_job (worker delivered a result)
    worker_fail      fail_job's retryable requeue (-> pending)
    timeout_requeue  requeue_or_terminalize_timed_out_job's requeue branch
                     (deadline reaper / worker re-register / orphan release)
    readopt          readopt_job_claim's late-completion rescue (pending ->
                     running, free of attempt budget, most recent claimant only)
    terminalize      terminalize_job_failure (terminal failed, any channel)
    cancel           cancel_active_jobs_for_nodes / cancel_active_synthesis_jobs
    archive          archive_debate's job cancellation
    scoring_stale    stale pending score_debate expiry (waker + status poll)
    scoring_wake     wake_pending_internal_scoring_job's claim (-> claimed)
    scoring_run      run_scoring_job_background start (-> running)
    scoring_complete run_scoring_job_background success (-> complete)
    scoring_fail     run_scoring_job_background failure paths (-> failed)
    scoring_unavailable  fail_unavailable_scoring_job (no provider)
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.oplog import log_event
from app.models.entities import JobTransition, now_utc, uuid_str

if TYPE_CHECKING:  # pragma: no cover - typing only
    from sqlalchemy.orm import Session

    from app.models.entities import Job

LOGGER = logging.getLogger(__name__)

MAX_REASON_CHARS = 2_000


def _duration_ms(job: "Job") -> int | None:
    """Claim-to-now duration for terminal transitions; None when unknowable."""
    claimed_at = job.claimed_at
    if claimed_at is None:
        return None
    now = now_utc()
    if claimed_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    return max(0, int((now - claimed_at).total_seconds() * 1000))


def record_job_transition(
    db: "Session",
    job: "Job",
    *,
    from_status: str | None,
    to_status: str,
    channel: str,
    reason: str | None = None,
) -> None:
    """Append one ledger row + one structured log line for a job transition.

    Best-effort by contract: never raises. The row joins the caller's open
    transaction (no commit here) so ledger and transition land atomically.
    """
    try:
        if job.id is None:
            # create_job records before its caller's flush; pinning the
            # Python-side uuid default early keeps the ledger row linkable
            # and is exactly what the flush would have assigned.
            job.id = uuid_str()
        # Local import: app.services.orchestrator imports this module at
        # top level (record_job_transition is called from every transition
        # site), so a module-level import here would be circular. Routing
        # through the same sanitize_text as job.error keeps every ledger
        # row in the same curated string class as the job rows themselves,
        # instead of the raw/sanitized mix the call sites otherwise produce.
        from app.services.orchestrator import sanitize_text

        clean_reason = sanitize_text(reason or "", MAX_REASON_CHARS) or None
        db.add(
            JobTransition(
                job_id=job.id,
                debate_id=job.debate_id,
                job_type=job.job_type,
                from_status=from_status,
                to_status=to_status,
                reason=clean_reason,
                channel=channel,
            )
        )
        duration_ms = (
            _duration_ms(job) if to_status in {"complete", "failed"} else None
        )
        log_event(
            LOGGER,
            f"job.{channel}",
            job_id=job.id,
            debate_id=job.debate_id,
            job_type=job.job_type,
            from_status=from_status,
            outcome=to_status,
            reason=clean_reason,
            duration_ms=duration_ms,
        )
    except Exception:  # pragma: no cover - the ledger never fails a transition
        LOGGER.debug("job transition ledger write failed", exc_info=True)
