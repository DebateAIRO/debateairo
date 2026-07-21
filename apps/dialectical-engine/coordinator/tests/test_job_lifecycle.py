"""Uniform job-lifecycle liveness: any authenticated worker contact (poll,
heartbeat, stream) proves the worker is alive and slides the lease of every
job it holds. The deadline sweep then only fires for genuinely silent
workers; the hard stuck cap (Task 3) bounds total time per assignment."""
from __future__ import annotations

from datetime import timedelta, timezone

from app.models.entities import Debate, Job, Node, Worker, now_utc


def worker(db, name: str, capabilities: list[str]) -> Worker:
    row = Worker(
        name=name,
        token_hash="test-token",
        capabilities=capabilities,
        last_seen=now_utc(),
        status="online",
    )
    db.add(row)
    db.commit()
    return row


def make_debate_with_job(db, model: str = "gpt-5.6sol-medium") -> tuple[Debate, Job]:
    from app.services.orchestrator import make_deadline

    debate = Debate(topic="Liveness semantics for slow workers", status="generating", config={})
    db.add(debate)
    db.flush()
    node = Node(
        debate_id=debate.id,
        node_type="SCIENTIFIC_POV",
        depth=1,
        position=0,
        claim="Test POV",
        status="pending",
        materialized_path="0",
    )
    db.add(node)
    db.flush()
    job = Job(
        debate_id=debate.id,
        node_id=node.id,
        job_type="v2_pov",
        required_role="Test POV",
        required_model=model,
        status="pending",
        deadline=make_deadline(),
        idempotency_key=f"test-{debate.id}",
        stream_buffer="",
        attempts=0,
    )
    db.add(job)
    db.commit()
    return debate, job


def test_refresh_worker_job_leases_slides_held_job_deadlines(db):
    from app.services.orchestrator import claim_pending_job, refresh_worker_job_leases

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claimed = claim_pending_job(db, w)
    assert claimed is not None and claimed.id == job.id
    stale_deadline = now_utc() - timedelta(seconds=5)
    job.deadline = stale_deadline
    db.commit()
    refresh_worker_job_leases(db, w)
    db.commit()
    db.expire_all()
    refreshed = db.get(Job, job.id)
    # The deadline should have been updated to be in the future (wall-clock now).
    # SQLite returns datetimes as naive, so normalize for comparison.
    deadline = refreshed.deadline if refreshed.deadline.tzinfo else refreshed.deadline.replace(tzinfo=timezone.utc)
    assert deadline > now_utc()


def test_refresh_ignores_jobs_held_by_other_workers(db):
    from app.services.orchestrator import claim_pending_job, refresh_worker_job_leases

    w1 = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    w2 = worker(db, "loop-2", ["gpt-5.6sol-medium"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w1)
    stale = now_utc() - timedelta(seconds=5)
    job.deadline = stale
    db.commit()
    refresh_worker_job_leases(db, w2)
    db.commit()
    db.expire_all()
    refreshed = db.get(Job, job.id)
    # deadline should not have changed since w2 doesn't hold the job
    # Compare as naive datetimes for consistency with SQLite storage
    stale_naive = stale.replace(tzinfo=None)
    refreshed_naive = refreshed.deadline
    assert refreshed_naive == stale_naive


def test_poll_while_busy_returns_none_and_keeps_the_job(db):
    """A loop harness polls on a timer while its CLI is still thinking.
    That poll must NOT tear the in-flight job away (the old behavior
    requeued it as 'Worker restarted while job was active')."""
    from app.services.orchestrator import claim_pending_job

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    first = claim_pending_job(db, w)
    assert first is not None
    second = claim_pending_job(db, w)  # worker polls again mid-run
    assert second is None
    db.refresh(job)
    assert job.status == "running"
    assert job.worker_id == w.id
    assert (job.timeout_attempts or 0) == 0


def test_expired_held_job_is_still_requeued_on_poll(db):
    from app.services.orchestrator import claim_pending_job

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w)
    job.deadline = now_utc() - timedelta(seconds=5)
    db.commit()
    # Bypass the Task 1 refresh (which would resurrect the lease) by
    # expiring the job and having a DIFFERENT worker trigger the sweep.
    other = worker(db, "sweeper", ["gpt-5.6sol-medium"])
    claim_pending_job(db, other)
    db.refresh(job)
    assert job.status == "pending"
    assert (job.timeout_attempts or 0) == 1


def test_stuck_job_is_requeued_even_with_a_fresh_lease(db, monkeypatch):
    """A wedged worker that keeps heartbeating must not hold a node hostage:
    after DIALECTICAL_JOB_STUCK_SECONDS with no completion the assignment is
    taken back regardless of lease freshness."""
    from app.services.orchestrator import claim_pending_job

    monkeypatch.setenv("DIALECTICAL_JOB_STUCK_SECONDS", "60")
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w)
    job.claimed_at = now_utc() - timedelta(seconds=120)
    job.deadline = now_utc() + timedelta(seconds=60)  # lease is fresh
    db.commit()
    other = worker(db, "sweeper", ["gpt-5.6sol-medium"])
    claim_pending_job(db, other)
    db.refresh(job)
    assert job.status == "pending"
    assert job.error == "No answer within the stuck window"


def test_job_past_both_thresholds_is_charged_once(db, monkeypatch):
    """A job whose lease expired AND whose claimed_at is past the stuck
    cutoff must be requeued exactly once per sweep pass, not once per
    matching query (autoflush=False keeps the first sweep's mutations
    invisible to the second query)."""
    from app.services.orchestrator import claim_pending_job

    monkeypatch.setenv("DIALECTICAL_JOB_STUCK_SECONDS", "60")
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w)
    job.claimed_at = now_utc() - timedelta(seconds=120)
    job.deadline = now_utc() - timedelta(seconds=5)  # BOTH thresholds crossed
    db.commit()
    other = worker(db, "sweeper", ["gpt-5.6sol-medium"])
    claim_pending_job(db, other)
    db.refresh(job)
    assert job.status == "pending"
    assert (job.timeout_attempts or 0) == 1  # exactly one charge


def test_last_claimant_readopts_a_requeued_job(db):
    """The doom-loop's cruelest step: grok finished its answer, but the
    claim had been requeued, so posting got 403/400 and the finished work
    was discarded. The last claimant must be able to re-adopt a pending
    job and complete it without burning attempt budget."""
    from app.api.jobs import require_job_for_worker
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    _, job = make_debate_with_job(db, "grok-4.5-high-loop")
    claim_pending_job(db, w)
    attempts_before = job.attempts
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "pending" and job.worker_id is None
    resolved = require_job_for_worker(job.id, w, db)
    assert resolved.id == job.id
    db.refresh(job)
    assert job.status == "running"
    assert job.worker_id == w.id
    assert job.attempts == attempts_before  # readoption is free


def test_other_workers_cannot_adopt_a_released_job(db):
    import pytest
    from fastapi import HTTPException

    from app.api.jobs import require_job_for_worker
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    intruder = worker(db, "other", ["grok-4.5-high-loop"])
    _, job = make_debate_with_job(db, "grok-4.5-high-loop")
    claim_pending_job(db, w)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    with pytest.raises(HTTPException):
        require_job_for_worker(job.id, intruder, db)


def test_readoption_never_clobbers_a_newer_claim(db):
    """Single-slot workers: if the last claimant of job A has since claimed a
    different job B, a late completion for job A must not be able to
    silently steal the worker's current_job_id tracking away from B. The
    403 must stand and job A must stay pending."""
    from app.api.jobs import require_job_for_worker
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job, try_claim_pending_job

    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    _, job_a = make_debate_with_job(db, "grok-4.5-high-loop")
    claim_pending_job(db, w)
    requeue_or_terminalize_timed_out_job(db, job_a, "Job deadline expired")
    db.commit()
    db.refresh(job_a)
    assert job_a.status == "pending" and job_a.worker_id is None

    # Claim job B directly (rather than via claim_pending_job's oldest-first
    # queue scan) so the test deterministically models "the worker has since
    # claimed a different job" without depending on scheduler ordering
    # between two now-pending jobs (job_a is pending again too).
    _, job_b = make_debate_with_job(db, "grok-4.5-high-loop")
    assert try_claim_pending_job(db, job_b, w, now_utc())
    db.refresh(w)
    assert w.current_job_id == job_b.id

    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        require_job_for_worker(job_a.id, w, db)
    db.refresh(job_a)
    db.refresh(w)
    assert job_a.status == "pending"
    assert w.current_job_id == job_b.id


def test_readoption_cas_refuses_a_row_a_concurrent_worker_already_claimed(db):
    """readopt_job_claim's own pre-checks (status/last_worker_id reads on the
    in-memory Job) are NOT enough to close the concurrency window: another
    worker can win the row via try_claim_pending_job's atomic UPDATE between
    those reads and this function's write. The actual takeover must be a
    guarded compare-and-swap, or a late re-adoption can silently clobber a
    live concurrent claim.

    This test simulates exactly that interleaving within a single session: a
    raw UPDATE (bypassing the ORM) flips the row to "claimed by an intruder"
    WITHOUT going through db.commit()/db.refresh(), so the in-memory `job`
    object's cached .status attribute stays "pending" -- genuinely stale,
    the same way it would look to readopt_job_claim's caller-visible object
    if another worker's claim landed in the gap. If readopt_job_claim only
    trusted that stale read it would proceed; the CAS's WHERE clause must
    still see the real (updated) row and refuse."""
    from sqlalchemy import update as sa_update

    from app.services.orchestrator import (
        claim_pending_job,
        readopt_job_claim,
        requeue_or_terminalize_timed_out_job,
    )

    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    intruder = worker(db, "intruder", ["grok-4.5-high-loop"])
    _, job = make_debate_with_job(db, "grok-4.5-high-loop")
    claim_pending_job(db, w)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "pending"
    assert job.last_worker_id == w.id

    # Simulate a concurrent claim landing in the gap between readopt's
    # pre-checks and its CAS: a raw UPDATE against the row, deliberately not
    # committed/refreshed so `job`'s cached Python attributes remain "pending"
    # (read-your-own-writes keeps this visible to a NEW query in the same
    # transaction -- e.g. readopt_job_claim's own CAS -- without touching the
    # already-loaded ORM instance's attributes). synchronize_session=False is
    # required here: SQLAlchemy's default "auto" sync strategy would otherwise
    # eagerly patch this same-session `job` object's .status in Python the
    # moment the UPDATE executes, which a REAL concurrent writer (a separate
    # process/session with no shared identity map) could never do -- that
    # eager sync would mask exactly the staleness this test needs to prove
    # the CAS (not the pre-checks) is what closes the race.
    db.execute(
        sa_update(Job)
        .where(Job.id == job.id)
        .values(status="running", worker_id=intruder.id)
        .execution_options(synchronize_session=False)
    )
    assert job.status == "pending"  # confirmed stale: caller-visible object unchanged

    assert readopt_job_claim(db, job, w) is False

    db.refresh(job)
    db.refresh(w)
    assert job.status == "running"
    assert job.worker_id == intruder.id  # intruder's claim survives untouched
    assert w.current_job_id is None  # w never got a slot it doesn't hold
