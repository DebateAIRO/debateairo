"""Task 1 (P0.2): generation-class jobs get a 300s base deadline floor
instead of sharing every other job type's 60s silence tolerance. LLM CLI
calls for generation work can legitimately run 51-500s+ (2026-07-22 audit);
the old shared 60s deadline reaped them mid-flight. Bookkeeping job types
(decompose, score_debate, ...) are unaffected. The 600s stuck cap and the
lease-slide interplay (refresh_worker_job_leases) are unchanged -- a
generation job's larger base floor must still be clamped at
claimed_at + job_stuck_seconds()."""
from __future__ import annotations

import asyncio
from datetime import timedelta, timezone

from sqlalchemy import select

from app.models.entities import Debate, Job, now_utc

from tests.test_job_lifecycle import make_debate_with_job, worker


def _as_utc(dt):
    """SQLite hands back naive datetimes on reload; normalize to UTC so
    arithmetic against tz-aware now_utc()-based values is safe."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def test_generation_job_types_is_the_five_generation_job_types():
    from app.services.orchestrator import GENERATION_JOB_TYPES

    assert GENERATION_JOB_TYPES == {"argue", "synthesize", "v2_pov", "v2_expand", "v2_synthesize"}


# --- generation_job_fallback_seconds(): env-tunable, clamped [60, 3600] -----


def test_generation_job_fallback_seconds_default_is_300(monkeypatch):
    from app.services.orchestrator import generation_job_fallback_seconds

    monkeypatch.delenv("DIALECTICAL_GENERATION_JOB_FALLBACK_SECONDS", raising=False)
    assert generation_job_fallback_seconds() == 300


def test_generation_job_fallback_seconds_env_override(monkeypatch):
    from app.services.orchestrator import generation_job_fallback_seconds

    monkeypatch.setenv("DIALECTICAL_GENERATION_JOB_FALLBACK_SECONDS", "450")
    assert generation_job_fallback_seconds() == 450


def test_generation_job_fallback_seconds_clamps_below_60(monkeypatch):
    from app.services.orchestrator import generation_job_fallback_seconds

    monkeypatch.setenv("DIALECTICAL_GENERATION_JOB_FALLBACK_SECONDS", "10")
    assert generation_job_fallback_seconds() == 60


def test_generation_job_fallback_seconds_clamps_above_3600(monkeypatch):
    from app.services.orchestrator import generation_job_fallback_seconds

    monkeypatch.setenv("DIALECTICAL_GENERATION_JOB_FALLBACK_SECONDS", "9999")
    assert generation_job_fallback_seconds() == 3600


# --- make_deadline(job_type): the branch itself -----------------------------


def test_make_deadline_generation_job_type_gets_300s_floor(monkeypatch):
    from app.services.orchestrator import make_deadline

    monkeypatch.delenv("DIALECTICAL_GENERATION_JOB_FALLBACK_SECONDS", raising=False)
    before = now_utc()
    deadline = make_deadline("v2_pov")
    remaining = (deadline - before).total_seconds()
    assert remaining >= 290  # ~300s floor, generous slack to dodge clock skew
    assert remaining <= 320  # still catches a gross units/multiplier bug


def test_make_deadline_non_generation_job_type_keeps_60s(monkeypatch):
    from app.services.orchestrator import make_deadline

    monkeypatch.delenv("DIALECTICAL_GENERATION_JOB_FALLBACK_SECONDS", raising=False)
    before = now_utc()
    deadline = make_deadline("decompose")
    remaining = (deadline - before).total_seconds()
    assert 55 <= remaining <= 65  # unchanged default -- NOT the generation floor


# --- create_job (orchestrator.py ~281): the primary creation call site ------


def test_create_job_generation_type_gets_generation_floor(db):
    from app.services.orchestrator import create_job

    debate = Debate(topic="Should cities ban cars?", status="generating", config={})
    db.add(debate)
    db.commit()

    before = now_utc()
    job = create_job(db, debate.id, "v2_pov", "v2_generator", None, required_model="mock-local")
    db.commit()
    db.expire_all()
    refreshed = db.get(Job, job.id)

    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


def test_create_job_non_generation_type_keeps_default_floor(db):
    """create_debate's root job is job_type="decompose" -- the most common
    non-generation job type actually created via create_job in production."""
    from app.services.orchestrator import create_debate

    before = now_utc()
    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})

    job = db.scalar(select(Job).where(Job.debate_id == debate.id))
    assert job.job_type == "decompose"
    remaining = (_as_utc(job.deadline) - before).total_seconds()
    assert 55 <= remaining <= 65


# --- readopt_job_claim (orchestrator.py ~847) --------------------------------


def test_readopt_job_claim_uses_generation_floor(db):
    """A late completion that re-adopts a released generation job must get
    the same 300s floor as a fresh claim -- not the short default."""
    from app.services.orchestrator import (
        claim_pending_job,
        readopt_job_claim,
        requeue_or_terminalize_timed_out_job,
    )

    w = worker(db, "grok-loop", ["grok-4.5-high-loop"])
    _, job = make_debate_with_job(db, "grok-4.5-high-loop")  # v2_pov: generation type
    claim_pending_job(db, w)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "pending" and job.last_worker_id == w.id

    before = now_utc()
    assert readopt_job_claim(db, job, w) is True

    db.expire_all()
    refreshed = db.get(Job, job.id)
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


# --- refresh_worker_job_leases (orchestrator.py ~887): interplay with the ---
# --- stuck cap (requirement 4: do NOT change this) --------------------------


def test_lease_slide_on_generation_job_still_capped_at_stuck_horizon(db, monkeypatch):
    """A generation job's larger 300s base floor must still not let
    refresh_worker_job_leases push the deadline past
    claimed_at + job_stuck_seconds(). Use a stuck cap (120s) BELOW the 300s
    generation floor so the clamp is actually exercised: with the 600s
    default (or the old flat 60s floor), "deadline <= stuck_horizon" holds
    trivially either way and proves nothing about this fix specifically, so
    this also asserts the slide reaches (not falls short of) the horizon --
    that only happens when the uncapped floor genuinely exceeds it."""
    from app.services.orchestrator import claim_pending_job, job_stuck_seconds, refresh_worker_job_leases

    monkeypatch.setenv("DIALECTICAL_JOB_STUCK_SECONDS", "120")
    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")  # v2_pov
    claim_pending_job(db, w)
    job.claimed_at = now_utc() - timedelta(seconds=10)
    db.commit()

    refresh_worker_job_leases(db, w)
    db.commit()
    db.expire_all()

    refreshed = db.get(Job, job.id)
    claimed_at = _as_utc(refreshed.claimed_at)
    deadline = _as_utc(refreshed.deadline)
    stuck_horizon = claimed_at + timedelta(seconds=job_stuck_seconds())

    assert deadline <= stuck_horizon  # requirement 4: the hard cap is never exceeded
    # The slide must land AT the stuck horizon (not the old ~60s-from-now
    # mark, which would be claimed_at + ~70s here): only a generation floor
    # that genuinely exceeds 120s gets clamped down to exactly this ceiling.
    assert deadline >= claimed_at + timedelta(seconds=115)


# --- try_failover_job (orchestrator.py ~971): NOT in the brief's call-site --
# --- list, but a real make_deadline() call site gated on FAILOVER_JOB_TYPES-


def test_try_failover_job_rearms_with_generation_deadline(db, monkeypatch):
    """try_failover_job is a make_deadline() call site the brief's inventory
    did not name. FAILOVER_JOB_TYPES is generation-only, so this path can
    never legitimately hand back the short 60s deadline."""
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")  # v2_pov
    claim_pending_job(db, w_claude)
    job.attempts = 8
    job.timeout_attempts = 8  # exhausts the retry budget -> forces failover
    db.commit()

    before = now_utc()
    events = requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()

    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.required_model == "gpt-5.6sol-medium"  # failover happened
    assert refreshed.status == "pending"
    assert any(name == "node_retrying" for _, name, _ in events)
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


# --- reroute_unavailable_pending_jobs (orchestrator.py ~1053) ---------------


def test_reroute_unavailable_pending_job_keeps_generation_floor(db):
    """A pending generation job whose current model has gone offline gets
    rerouted onto a different online model; the fresh deadline must still be
    the generation floor, not the short default."""
    from app.services.orchestrator import reroute_unavailable_pending_jobs

    worker(db, "backup-loop", ["gpt-5.6sol-medium"])  # online capacity to reroute onto
    debate = Debate(topic="Should cities ban cars?", status="generating", config={})
    db.add(debate)
    db.flush()
    job = Job(
        debate_id=debate.id,
        node_id=None,
        job_type="argue",
        required_role="proposer",
        required_model="claude-sonnet-5-high-loop",  # nobody online has this capability
        status="pending",
        deadline=now_utc() - timedelta(seconds=1),  # expired -> eligible for reroute
        idempotency_key=f"test-{debate.id}",
        stream_buffer="",
        attempts=0,
    )
    db.add(job)
    db.commit()

    before = now_utc()
    reroute_unavailable_pending_jobs(db, now_utc())
    db.commit()
    db.expire_all()
    refreshed = db.get(Job, job.id)

    assert refreshed.required_model == "gpt-5.6sol-medium"  # confirms a reroute happened
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


# --- try_claim_pending_job (orchestrator.py ~1086), via claim_pending_job ---


def test_claim_pending_job_extends_generation_job_to_floor(db):
    from app.services.orchestrator import claim_pending_job

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")  # v2_pov

    before = now_utc()
    claimed = claim_pending_job(db, w)
    assert claimed is not None and claimed.id == job.id

    db.expire_all()
    refreshed = db.get(Job, job.id)
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


# --- append_stream_delta (orchestrator.py ~1312) ----------------------------


def test_append_stream_delta_extends_generation_job_to_floor(db):
    from app.services.orchestrator import append_stream_delta, claim_pending_job

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")  # v2_pov
    claim_pending_job(db, w)

    before = now_utc()
    asyncio.run(append_stream_delta(db, job, "partial output", offset=0))

    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.stream_buffer == "partial output"
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


# --- requeue_or_terminalize_timed_out_job (orchestrator.py ~1644) ----------


def test_requeue_rearms_generation_job_with_generation_deadline(db):
    """The requeue/timeout path must re-arm a generation job with the 300s
    floor -- not the short 60s default -- or a slow LLM call falls straight
    back into a reap-retry loop even with Task 1's per-type floor in place."""
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")  # v2_pov
    claim_pending_job(db, w)

    before = now_utc()
    events = requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    assert events == []  # requeued with fresh budget, not terminalized

    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.status == "pending"
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290


# --- fail_job (orchestrator.py ~1668) ---------------------------------------


def test_fail_job_retry_uses_generation_floor(db):
    from app.services.orchestrator import claim_pending_job, fail_job

    w = worker(db, "loop-1", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")  # v2_pov
    claim_pending_job(db, w)

    before = now_utc()
    asyncio.run(fail_job(db, job, "CLI crashed once", retryable=True))

    db.expire_all()
    refreshed = db.get(Job, job.id)
    assert refreshed.status == "pending"
    remaining = (_as_utc(refreshed.deadline) - before).total_seconds()
    assert remaining >= 290
