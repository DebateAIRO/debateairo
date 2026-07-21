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
