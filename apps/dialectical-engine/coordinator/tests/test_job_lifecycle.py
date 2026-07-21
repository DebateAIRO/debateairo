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
