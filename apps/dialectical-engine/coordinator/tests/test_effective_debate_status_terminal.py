"""Lane 2 regression tests: honest terminal-failure debate status.

A debate whose jobs terminally failed (a failed job remains and no
pending/claimed/running job can advance generation) must not report
"generating" forever -- the FE would spin indefinitely. effective_debate_status
must surface "failed" for that state while leaving every existing
complete/generating semantic untouched (additive only).
"""
from __future__ import annotations

from app.core.auth import hash_token
from app.main import app  # noqa: F401 - warm up the import graph (breaks a serialization<->orchestrator import cycle)
from app.models.entities import Debate, Job, Node, Synthesis, Worker, now_utc
from app.services.serialization import debate_to_dict, effective_debate_status


def _debate(db, status: str = "generating") -> Debate:
    debate = Debate(topic="Should cities ban cars downtown?", status=status, config={})
    db.add(debate)
    db.flush()
    return debate


def _job(db, debate: Debate, *, status: str, job_type: str = "v2_pov") -> Job:
    job = Job(
        debate_id=debate.id,
        job_type=job_type,
        required_role="Scientific POV",
        required_model="codex-gpt-5.5",
        status=status,
    )
    db.add(job)
    db.flush()
    return job


def test_stuck_failed_debate_reports_failed(db) -> None:
    debate = _debate(db)
    _job(db, debate, status="failed")
    db.commit()

    assert effective_debate_status(db, debate) == "failed"


def test_generating_with_active_job_stays_generating(db) -> None:
    debate = _debate(db)
    # One failed job but another still pending -> generation can still progress.
    _job(db, debate, status="failed")
    _job(db, debate, status="pending")
    db.commit()

    assert effective_debate_status(db, debate) == "generating"


def test_generating_with_running_job_stays_generating(db) -> None:
    debate = _debate(db)
    _job(db, debate, status="running")
    db.commit()

    assert effective_debate_status(db, debate) == "generating"


def test_generating_without_any_failed_job_stays_generating(db) -> None:
    debate = _debate(db)
    # No failed job at all -> not a terminal failure, even with no active jobs.
    db.commit()

    assert effective_debate_status(db, debate) == "generating"


def test_failed_score_debate_job_alone_does_not_flip_status(db) -> None:
    debate = _debate(db)
    # Scoring is a separate lifecycle: a failed score_debate job must not mark
    # the generation itself failed.
    _job(db, debate, status="failed", job_type="score_debate")
    db.commit()

    assert effective_debate_status(db, debate) == "generating"


def test_active_score_debate_job_does_not_mask_generation_failure(db) -> None:
    debate = _debate(db)
    _job(db, debate, status="failed")  # generation job terminally failed
    _job(db, debate, status="running", job_type="score_debate")  # scoring still running
    db.commit()

    assert effective_debate_status(db, debate) == "failed"


def test_complete_upgrade_preserved_when_synthesis_present(db) -> None:
    # A debate that synthesized (synthesis_id + completed_at) but is still
    # marked "generating" must upgrade to "complete", not "failed", even if a
    # stray job failed. Complete-upgrade semantics stay untouched.
    debate = _debate(db)
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    worker = Worker(name="mac-mini", token_hash=hash_token("worker-token"), capabilities=["codex-gpt-5.5"], status="online")
    db.add(worker)
    db.flush()
    synthesis = Synthesis(
        debate_id=debate.id,
        strongest_pro="p",
        strongest_con="c",
        verdict="v",
        model_id="codex-gpt-5.5",
        worker_id=worker.id,
    )
    db.add(synthesis)
    db.flush()
    debate.synthesis_id = synthesis.id
    debate.completed_at = now_utc()
    _job(db, debate, status="failed")
    db.commit()

    assert effective_debate_status(db, debate) == "complete"


def test_non_generating_status_returned_as_is(db) -> None:
    debate = _debate(db, status="complete")
    _job(db, debate, status="failed")
    db.commit()

    assert effective_debate_status(db, debate) == "complete"


def test_debate_to_dict_surfaces_failed_for_stuck_debate(db) -> None:
    debate = _debate(db)
    root = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim=debate.topic,
        status="complete",
        materialized_path="/0",
    )
    db.add(root)
    db.flush()
    debate.root_node_id = root.id
    _job(db, debate, status="failed")
    db.commit()

    detail = debate_to_dict(db, db.get(Debate, debate.id))
    assert detail["status"] == "failed"
