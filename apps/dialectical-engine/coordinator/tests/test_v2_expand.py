"""W3: the v2_expand single-node expansion primitive + whole-tree quiescence.

Design under test:
  - queue_v2_expand_job is the ONLY expansion spawn path: it creates a pending
    placeholder child (depth = parent + 1, node_type = polarity) plus ONE
    v2_expand job targeting the placeholder, never the parent.
  - The job travels the REAL worker path (claim -> rendered prompt ->
    complete -> materialization) and completes the placeholder in place with
    evidence extraction; the parent node stays byte-identical.
  - Completion is idempotent (job state machine rejects replays; no second
    child can ever be minted).
  - Whole-tree quiescence: an outstanding v2_expand blocks v2_synthesize at
    BOTH gate sites; a completed or terminally failed expand unblocks it.
  - Terminal failure flows through W1's node-scoped handling: only the child
    path is marked failed, the debate is never failed.
"""
from __future__ import annotations

import asyncio

import pytest
from sqlalchemy import select

from app.main import app  # noqa: F401 - warm up the import graph (import-cycle guard)
from app.models.entities import Debate, Generation, Job, Node, Worker, now_utc
from app.services import dialectical_v2 as service
from app.services.dialectical_v2 import (
    pending_generation_nodes,
    queue_v2_expand_job,
    render_v2_job_prompt,
)
from app.services.orchestrator import (
    StaleJobMutationError,
    claim_pending_job,
    complete_job,
    fail_job,
)


def codex_worker(db) -> Worker:
    worker = Worker(
        name="codex-worker",
        token_hash="test-token",
        capabilities=["gpt-5.6sol-medium"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def generic_pov_output(worker: Worker, job_id: str, pov: str) -> dict:
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {pov} assessment based on the strongest available reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {pov} pro relies on the clearest relevant evidence.",
            "pro": {"title": f"{pov} pro support", "content": f"Detail strengthening the {pov} pro."},
            "con": {"title": f"{pov} pro limitation", "content": f"Detail limiting the {pov} pro."},
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": f"The strongest {pov} con identifies the most important risk.",
            "pro": {"title": f"{pov} con support", "content": f"Detail strengthening the {pov} con."},
            "con": {"title": f"{pov} con limitation", "content": f"Detail limiting the {pov} con."},
        },
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def synthesis_output(worker: Worker, job_id: str) -> dict:
    return {
        "title": "Synthesis",
        "content": "The debate turns on whether safeguards make the expected benefit credible.",
        "tensions": ["Benefit versus transition risk."],
        "agreements": ["Implementation quality matters."],
        "evidence_gaps": ["Context-specific cost evidence."],
        "key_takeaways": ["A phased approach addresses both sides."],
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def expand_worker_result(worker: Worker, job_id: str) -> dict:
    # Shape the real worker produces: parse_result's {title, content} plus
    # enrich_v2_result's generic runtime provenance stamp.
    return {
        "title": "Additional supporting consideration",
        "content": "A further supporting line of reasoning grounded in the requested lens.",
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def complete_pending_pov_jobs(db, worker: Worker, debate: Debate, limit: int | None = None) -> int:
    completed = 0
    while limit is None or completed < limit:
        has_pending_pov = (
            db.scalar(
                select(Job.id)
                .where(Job.debate_id == debate.id, Job.job_type == "v2_pov", Job.status == "pending")
                .limit(1)
            )
            is not None
        )
        if not has_pending_pov:
            break
        job = claim_pending_job(db, worker)
        assert job is not None and job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, generic_pov_output(worker, job.id, job.required_role), {"latency_ms": 5}))
        completed += 1
    return completed


def make_v2_debate(db, worker: Worker, *, complete_povs: int | None = None) -> Debate:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    if complete_povs is None or complete_povs > 0:
        complete_pending_pov_jobs(db, worker, debate, complete_povs)
    return debate


def first_pov_pro(db, debate: Debate) -> Node:
    """The strongest-PRO node (depth 2) under the first POV container."""
    container = db.scalar(
        select(Node).where(
            Node.debate_id == debate.id,
            Node.parent_id == debate.root_node_id,
            Node.position == 0,
        )
    )
    assert container is not None and container.status == "complete"
    pro = db.scalar(
        select(Node).where(Node.parent_id == container.id, Node.node_type == "PRO", Node.position == 0)
    )
    assert pro is not None
    return pro


def node_snapshot(db, node_id: str) -> dict:
    node = db.get(Node, node_id)
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    generation_count = len(list(db.scalars(select(Generation.id).where(Generation.node_id == node_id)).all()))
    return {
        "claim": node.claim,
        "node_type": node.node_type,
        "status": node.status,
        "depth": node.depth,
        "position": node.position,
        "materialized_path": node.materialized_path,
        "active_generation_id": node.active_generation_id,
        "path_status": node.path_status,
        "stopping_status": node.stopping_status,
        "stopping_reason": node.stopping_reason,
        "argument": generation.argument if generation else None,
        "generation_count": generation_count,
    }


def argument_children(db, parent_id: str) -> list[Node]:
    return list(
        db.scalars(
            select(Node)
            .where(Node.parent_id == parent_id, Node.node_type != "EVIDENCE")
            .order_by(Node.position)
        ).all()
    )


def synthesize_jobs(db, debate_id: str) -> list[Job]:
    return list(db.scalars(select(Job).where(Job.debate_id == debate_id, Job.job_type == "v2_synthesize")).all())


# ---------------------------------------------------------------------------
# Queue helper
# ---------------------------------------------------------------------------


def test_queue_v2_expand_job_creates_placeholder_child_and_payload(db) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    container = db.get(Node, parent.parent_id)

    job = queue_v2_expand_job(db, debate, parent, "CON", "Judge scoring flagged shallow challenge coverage.")

    assert job.job_type == "v2_expand"
    assert job.required_role == "v2_expander"
    assert job.required_model == "gpt-5.6sol-medium"
    assert job.status == "pending"
    child = db.get(Node, job.node_id)
    assert child is not None
    assert child.parent_id == parent.id
    assert child.node_type == "CON"
    assert child.depth == parent.depth + 1
    assert child.status == "pending"
    assert child.claim == "Additional challenging argument"
    # Next free argument slot after the materialized nested PRO/CON pair.
    existing = argument_children(db, parent.id)
    assert child.position == max(sibling.position for sibling in existing if sibling.id != child.id) + 1
    assert child.materialized_path == f"{parent.materialized_path}/{child.position}"
    assert job.payload == {
        "parent_node_id": parent.id,
        "polarity": "CON",
        "lens_label": container.claim,
        "reason": "Judge scoring flagged shallow challenge coverage.",
    }


def test_queue_v2_expand_job_validates_inputs(db) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    root = db.get(Node, debate.root_node_id)

    with pytest.raises(ValueError, match="polarity"):
        queue_v2_expand_job(db, debate, parent, "MAYBE", "reason")
    with pytest.raises(ValueError, match="reason"):
        queue_v2_expand_job(db, debate, parent, "PRO", "   ")
    with pytest.raises(ValueError, match="argument node below the root"):
        queue_v2_expand_job(db, debate, root, "PRO", "reason")
    pending_sibling = Node(
        debate_id=debate.id,
        parent_id=parent.parent_id,
        node_type="CON",
        depth=parent.depth,
        position=90,
        claim="Still generating.",
        status="pending",
        materialized_path=f"{db.get(Node, parent.parent_id).materialized_path}/90",
    )
    db.add(pending_sibling)
    db.commit()
    with pytest.raises(ValueError, match="completed argument node"):
        queue_v2_expand_job(db, debate, pending_sibling, "PRO", "reason")


def test_queue_v2_expand_job_rejects_v1_debates(db) -> None:
    from app.services.orchestrator import create_debate

    worker = Worker(
        name="mock-worker",
        token_hash="test-token",
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    debate = create_debate(db, "Should cities ban cars?", {"max_depth": 1})
    root = db.get(Node, debate.root_node_id)
    root.status = "complete"
    generation = Generation(
        node_id=root.id,
        model_id="mock-local",
        role="decomposer",
        argument="Root decomposition.",
        prompt_version="v1",
        prompt_rendered="prompt",
        latency_ms=1,
        is_active=True,
        worker_id=worker.id,
    )
    db.add(generation)
    db.flush()
    root.active_generation_id = generation.id
    child = Node(
        debate_id=debate.id,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Cleaner air.",
        status="complete",
        materialized_path="/0/0",
    )
    db.add(child)
    db.flush()
    child_generation = Generation(
        node_id=child.id,
        model_id="mock-local",
        role="proposer",
        argument="Cleaner air improves health.",
        prompt_version="v1",
        prompt_rendered="prompt",
        latency_ms=1,
        is_active=True,
        worker_id=worker.id,
    )
    db.add(child_generation)
    db.flush()
    child.active_generation_id = child_generation.id
    db.commit()

    with pytest.raises(ValueError, match="v2-pipeline"):
        queue_v2_expand_job(db, debate, child, "CON", "reason")
    assert db.scalars(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_expand")).all() == []


def test_no_expansion_queued_on_default_path(db) -> None:
    # Exactly one spawn path and nothing calls it yet: a full default-path v2
    # debate (creation -> POVs -> synthesis) never queues a v2_expand job.
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    synthesis_job = claim_pending_job(db, worker)
    assert synthesis_job is not None and synthesis_job.job_type == "v2_synthesize"
    asyncio.run(complete_job(db, synthesis_job, synthesis_output(worker, synthesis_job.id), {"latency_ms": 5}))

    db.refresh(debate)
    assert debate.status == "complete"
    assert db.scalars(select(Job).where(Job.debate_id == debate.id, Job.job_type == "v2_expand")).all() == []


# ---------------------------------------------------------------------------
# Real worker path: claim -> prompt -> complete -> materialization
# ---------------------------------------------------------------------------


def test_v2_expand_travels_real_worker_path_and_adds_exactly_one_child(db, monkeypatch) -> None:
    worker = codex_worker(db)
    # Hold the last POV back so synthesis is not yet queued when the
    # expansion is requested.
    debate = make_v2_debate(db, worker, complete_povs=3)
    parent = first_pov_pro(db, debate)
    job = queue_v2_expand_job(db, debate, parent, "PRO", "Judge scoring flagged shallow support here.")
    before_children = {node.id for node in argument_children(db, parent.id)}
    child_id = job.node_id
    assert child_id in before_children

    # Completing the LAST POV must NOT queue synthesis: the outstanding
    # v2_expand blocks the whole-tree quiescence gate (queue site).
    assert complete_pending_pov_jobs(db, worker, debate, 1) == 1
    assert synthesize_jobs(db, debate.id) == []

    parent_before = node_snapshot(db, parent.id)

    # Real worker path: claim the expand job, render its real prompt, and
    # complete it with the worker-shaped {title, content, provenance} result.
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id and claimed.job_type == "v2_expand"
    system_prompt, user_prompt = render_v2_job_prompt(db, claimed)
    assert "expansion worker" in system_prompt
    assert parent_before["claim"] in user_prompt
    assert parent_before["argument"].split("\n")[0] in user_prompt
    assert "Scientific POV" in user_prompt
    assert "Judge scoring flagged shallow support here." in user_prompt
    # Codex schema-selection guard: the expand prompt must never contain the
    # POV/planner/synthesis trigger tokens (wrong strict schema otherwise).
    assert '"strongest_pro"' not in user_prompt
    assert '"evidence_gaps"' not in user_prompt

    extraction_calls: list[str] = []
    real_extraction = service.extract_and_persist_evidence_for_completed_node

    def recording_extraction(db_arg, debate_arg, node_arg):
        extraction_calls.append(node_arg.id)
        return real_extraction(db_arg, debate_arg, node_arg)

    monkeypatch.setattr(service, "extract_and_persist_evidence_for_completed_node", recording_extraction)

    asyncio.run(complete_job(db, claimed, expand_worker_result(worker, claimed.id), {"latency_ms": 5}))

    # Exactly one child was added -- the placeholder, completed in place.
    after = argument_children(db, parent.id)
    assert {node.id for node in after} == before_children
    child = db.get(Node, child_id)
    assert child.status == "complete"
    assert child.node_type == "PRO"
    assert child.depth == parent_before["depth"] + 1
    assert child.claim == "Additional supporting consideration"
    generation = db.get(Generation, child.active_generation_id)
    assert generation is not None
    # create_generation sanitizes whitespace (same as every v2 node).
    assert generation.argument == (
        "Additional supporting consideration "
        "A further supporting line of reasoning grounded in the requested lens."
    )
    assert generation.model_id == "gpt-5.6sol-medium"
    assert generation.worker_id == worker.id
    assert generation.role == "PRO"
    # Best-effort evidence extraction ran for the completed child.
    assert extraction_calls == [child.id]
    # The parent node is byte-identical (the corruption class W0 closed).
    assert node_snapshot(db, parent.id) == parent_before
    # The expansion was the last outstanding generation: synthesis now queues.
    queued_synthesis = synthesize_jobs(db, debate.id)
    assert len(queued_synthesis) == 1 and queued_synthesis[0].status == "pending"


def test_replayed_expand_completion_cannot_mint_a_second_child(db) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=3)
    parent = first_pov_pro(db, debate)
    job = queue_v2_expand_job(db, debate, parent, "CON", "Challenge coverage is thin.")
    complete_pending_pov_jobs(db, worker, debate, 1)
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id
    asyncio.run(complete_job(db, claimed, expand_worker_result(worker, claimed.id), {"latency_ms": 5}))
    children_after_first = [node.id for node in argument_children(db, parent.id)]

    # Replaying the completed job is rejected by the job state machine and
    # cannot create a second child.
    with pytest.raises(StaleJobMutationError):
        asyncio.run(complete_job(db, claimed, expand_worker_result(worker, claimed.id), {"latency_ms": 5}))
    db.rollback()

    assert [node.id for node in argument_children(db, parent.id)] == children_after_first
    assert len(synthesize_jobs(db, debate.id)) == 1


# ---------------------------------------------------------------------------
# Whole-tree quiescence gate
# ---------------------------------------------------------------------------


def test_pending_generation_nodes_tracks_outstanding_expand_jobs(db) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    assert pending_generation_nodes(db, debate.id, debate.root_node_id) == []

    parent = first_pov_pro(db, debate)
    job = queue_v2_expand_job(db, debate, parent, "PRO", "Support coverage is thin.")
    pending = pending_generation_nodes(db, debate.id, debate.root_node_id)
    assert [node.id for node in pending] == [job.node_id]

    # A terminally failed expand job no longer blocks (W1 semantics).
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id
    asyncio.run(fail_job(db, claimed, "poisoned output", False))
    assert pending_generation_nodes(db, debate.id, debate.root_node_id) == []


def test_pending_expand_blocks_synthesis_at_persist_time(db) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    parent = first_pov_pro(db, debate)
    # The full-quartet completion already queued a v2_synthesize; queueing the
    # expansion supersedes it (regen precedent) so it cannot race the gate.
    assert len(synthesize_jobs(db, debate.id)) == 1
    queue_v2_expand_job(db, debate, parent, "PRO", "Support coverage is thin.")
    superseded = synthesize_jobs(db, debate.id)
    assert [job.status for job in superseded] == ["failed"]
    assert superseded[0].error == "Expansion superseded synthesis"

    # A synthesis job racing the expansion (created before the expand was
    # queued, completed after) must be rejected by the persist-time re-check.
    stale_synthesis = Job(
        debate_id=debate.id,
        job_type="v2_synthesize",
        required_role="v2_synthesizer",
        required_model="gpt-5.6sol-medium",
        status="running",
        worker_id=worker.id,
        deadline=now_utc(),
    )
    db.add(stale_synthesis)
    worker.current_job_id = stale_synthesis.id
    db.commit()

    with pytest.raises(ValueError, match="Cannot synthesize until"):
        asyncio.run(complete_job(db, stale_synthesis, synthesis_output(worker, stale_synthesis.id), {"latency_ms": 5}))
    db.rollback()
    db.refresh(debate)
    assert debate.synthesis_id is None
    assert debate.status == "generating"


# ---------------------------------------------------------------------------
# W1 bounded failure: terminal expand failure degrades only the child path
# ---------------------------------------------------------------------------


def test_terminal_expand_failure_marks_only_child_path_failed_and_unblocks_synthesis(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_MAX_JOB_ATTEMPTS", "1")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=3)
    parent = first_pov_pro(db, debate)
    job = queue_v2_expand_job(db, debate, parent, "CON", "Challenge coverage is thin.")
    complete_pending_pov_jobs(db, worker, debate, 1)
    assert synthesize_jobs(db, debate.id) == []
    parent_before = node_snapshot(db, parent.id)

    # One claim consumes the whole budget; the retryable failure lands
    # terminal through W1's node-scoped handling.
    claimed = claim_pending_job(db, worker)
    assert claimed is not None and claimed.id == job.id
    asyncio.run(fail_job(db, claimed, "poisoned output", True))

    db.refresh(job)
    assert job.status == "failed"
    child = db.get(Node, job.node_id)
    assert child.status == "failed"
    assert child.stopping_status == "stop"
    assert child.stopping_reason == "generation_exhausted"
    assert child.path_status == "abandoned"
    # The parent and the debate are untouched: node-scoped degradation only.
    assert node_snapshot(db, parent.id) == parent_before
    db.refresh(debate)
    assert debate.status != "failed"
    # The poisoned expand no longer blocks: synthesis proceeds over the
    # complete branches (count-agnostic, duplicate-guarded).
    queued_synthesis = synthesize_jobs(db, debate.id)
    assert len(queued_synthesis) == 1 and queued_synthesis[0].status == "pending"
    # The retryable /fail marked the worker degraded; its next heartbeat
    # restores it before it polls again.
    worker.status = "online"
    worker.last_seen = now_utc()
    db.commit()
    synthesis_job = claim_pending_job(db, worker)
    assert synthesis_job is not None and synthesis_job.job_type == "v2_synthesize"
    asyncio.run(complete_job(db, synthesis_job, synthesis_output(worker, synthesis_job.id), {"latency_ms": 5}))
    db.refresh(debate)
    assert debate.status == "complete"
    assert debate.synthesis_id is not None
