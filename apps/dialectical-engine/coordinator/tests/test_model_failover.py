"""Cross-model failover: when one model's retry budget dies (or it is
repeatedly stuck), the SAME job is re-queued under the next untried model
from the generation pool. Terminal branch failure now means "every capable
model tried and none delivered" -- exactly the promise the product makes."""
from __future__ import annotations

from tests.test_job_lifecycle import make_debate_with_job, worker


def exhaust_budget(db, job) -> None:
    job.attempts = 8
    job.timeout_attempts = 8
    db.commit()


def test_exhausted_job_fails_over_to_next_pool_model(db, monkeypatch):
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    exhaust_budget(db, job)
    events = requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "pending"
    assert job.required_model == "gpt-5.6sol-medium"
    assert job.attempts == 0 and (job.timeout_attempts or 0) == 0
    assert (job.payload or {}).get("tried_models") == ["claude-sonnet-5-high-loop"]
    assert any(name == "node_retrying" for _, name, _ in events)


def test_pool_exhaustion_is_finally_terminal(db, monkeypatch):
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    payload = dict(job.payload or {})
    payload["tried_models"] = ["gpt-5.6sol-medium"]  # everyone else already tried
    job.payload = payload
    exhaust_budget(db, job)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "failed"


def test_failover_disabled_keeps_terminal_behavior(db, monkeypatch):
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    monkeypatch.setenv("DIALECTICAL_MODEL_FAILOVER", "false")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    exhaust_budget(db, job)
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.status == "failed"


def test_failed_over_job_refuses_readoption_by_the_old_worker(db, monkeypatch):
    """A late post from the abandoned model's worker must not cancel a
    failover: last_worker_id is cleared when the job is retargeted."""
    import pytest
    from fastapi import HTTPException

    from app.api.jobs import require_job_for_worker
    from app.services.orchestrator import claim_pending_job, requeue_or_terminalize_timed_out_job

    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    w_claude = worker(db, "claude-loop", ["claude-sonnet-5-high-loop"])
    _, job = make_debate_with_job(db, "claude-sonnet-5-high-loop")
    claim_pending_job(db, w_claude)
    job.attempts = 8
    job.timeout_attempts = 8
    db.commit()
    requeue_or_terminalize_timed_out_job(db, job, "Job deadline expired")
    db.commit()
    db.refresh(job)
    assert job.required_model == "gpt-5.6sol-medium"  # failover happened
    with pytest.raises(HTTPException):
        require_job_for_worker(job.id, w_claude, db)
    db.refresh(job)
    assert job.status == "pending"
    assert job.required_model == "gpt-5.6sol-medium"


def test_transport_incompatible_prompt_reroutes_before_claim(db, monkeypatch):
    from app.services import orchestrator

    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    worker(db, "codex", ["gpt-5.6sol-medium"])
    gemini = worker(db, "gemini", ["gemini-3.5-flash-loop"])
    _, job = make_debate_with_job(db, "gemini-3.5-flash-loop")
    monkeypatch.setattr(
        orchestrator,
        "render_job_payload",
        lambda _db, candidate: {
            "id": candidate.id,
            "prompt": {"system": "x" * 100, "user": "y" * 100},
        },
    )

    assert orchestrator.claim_pending_job(db, gemini, max_prompt_bytes=50) is None
    db.refresh(job)
    assert job.status == "pending"
    assert job.required_model == "gpt-5.6sol-medium"
    assert job.worker_id is None
    assert (job.payload or {})["tried_models"] == ["gemini-3.5-flash-loop"]


def test_repeated_permanent_signature_opens_provider_circuit(db, monkeypatch):
    from app.services import orchestrator

    monkeypatch.setenv("DIALECTICAL_MULTI_MODEL_GENERATION", "true")
    orchestrator._FAILURE_CIRCUITS.clear()
    worker(db, "codex", ["gpt-5.6sol-medium"])
    gemini = worker(db, "gemini", ["gemini-3.5-flash-loop"])
    _, failed = make_debate_with_job(db, "gemini-3.5-flash-loop")
    failed.worker_id = gemini.id
    db.commit()
    reason = "422 Unprocessable result contract for job 12345"
    orchestrator._record_permanent_failure_circuit(failed, reason)
    orchestrator._record_permanent_failure_circuit(failed, reason)
    failed.status = "failed"
    db.commit()

    _, next_job = make_debate_with_job(db, "gemini-3.5-flash-loop")
    assert orchestrator.claim_pending_job(db, gemini) is None
    db.refresh(next_job)
    assert next_job.required_model == "gpt-5.6sol-medium"
    assert "Provider circuit open" in (next_job.error or "")
    orchestrator._FAILURE_CIRCUITS.clear()


def test_terminal_adaptive_stop_cannot_reopen_completed_debate(db):
    from app.exploration.expansion_dispatch import (
        STOPPED_WALL_CLOCK,
        record_adaptive_stop,
    )
    from app.services.orchestrator import (
        requeue_or_terminalize_timed_out_job,
        reset_job_target_for_retry,
    )

    debate, job = make_debate_with_job(db, "gpt-5.6sol-medium")
    job.job_type = "v2_expand"
    debate.status = "complete"
    debate.synthesis_id = "existing-synthesis"
    debate.completed_at = debate.created_at
    record_adaptive_stop(db, debate, STOPPED_WALL_CLOCK)
    db.commit()

    reset_job_target_for_retry(db, job)
    db.commit()
    assert debate.status == "complete"

    events = requeue_or_terminalize_timed_out_job(db, job, "deadline")
    db.commit()
    db.refresh(job)
    db.refresh(debate)
    assert job.status == "failed"
    assert debate.status == "complete"
    assert any(event == "adaptive_expansion_cancelled" for _, event, _ in events)
