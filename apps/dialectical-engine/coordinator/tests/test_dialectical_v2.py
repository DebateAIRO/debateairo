from __future__ import annotations

import asyncio
import json
import logging
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import entities
from app.main import app
from app.models.entities import Debate, Worker, now_utc
from app.services.orchestrator import claim_pending_job, complete_job
from app.services.events import event_bus
from app.services.serialization import debate_to_dict


USER_HEADERS = {"Authorization": "Bearer user_test_token"}


def v2_models():
    return {
        "AgentCapability": getattr(entities, "AgentCapability"),
        "AgentDefinition": getattr(entities, "AgentDefinition"),
        "AgentOutput": getattr(entities, "AgentOutput"),
        "AgentRun": getattr(entities, "AgentRun"),
        "AnalyzerRun": getattr(entities, "AnalyzerRun"),
        "CapabilityMatch": getattr(entities, "CapabilityMatch"),
        "DebateBranch": getattr(entities, "DebateBranch"),
        "ProvenanceRecord": getattr(entities, "ProvenanceRecord"),
        "SkillCapability": getattr(entities, "SkillCapability"),
        "SkillDefinition": getattr(entities, "SkillDefinition"),
    }


def v2_service():
    from app.services import dialectical_v2

    return dialectical_v2


def persisted_skill_json(debate_id: str) -> dict:
    return {
        "kind": "skill",
        "name": "Urban Mobility Policy Debate Skill",
        "version": 1,
        "status": "active",
        "description": "Structures mobility policy questions into evidence, risk, and implementation tradeoffs.",
        "trigger": {
            "question_types": ["policy", "urban mobility"],
            "domain_tags": ["transport", "policy"],
            "activation_rules": ["Use for city transport policy tradeoffs."],
        },
        "workflow": {
            "context_to_inspect": [
                "question",
                "classification",
                "statistical_analyzer_output",
                "scientific_analyzer_output",
                "psychological_analyzer_output",
            ],
            "steps": [
                "Identify required perspectives",
                "Search for matching Agents",
                "Create missing Agents",
                "Invoke Agents",
                "Enforce 5 pros and 5 cons per Agent",
            ],
        },
        "constraints": {
            "must_use_default_analyzers": True,
            "must_preserve_provenance": True,
            "must_require_exactly_5_pros_5_cons": True,
        },
        "output_contract": {
            "format": "structured_json",
            "sections": ["selected_agents", "agent_outputs", "skill_findings"],
        },
        "quality": {"created_by": "system", "creation_reason": "Seeded reusable policy skill.", "reuse_count": 0},
        "provenance": {
            "created_in_debate_id": debate_id,
            "created_by_model": "gpt-5.6sol-medium",
            "created_by_worker_id": "worker-real-1",
            "creation_prompt_id": "prompt-skill-1",
            "job_id": "job-skill-1",
        },
    }


def persisted_agent_json(debate_id: str) -> dict:
    return {
        "kind": "agent",
        "name": "Scientific Skeptic",
        "version": 1,
        "status": "active",
        "description": "Evaluates claims through empirical evidence and methodological rigor.",
        "domain_tags": ["science", "evidence", "transport"],
        "role": "Debate participant",
        "purpose": "Challenge weak empirical claims and surface evidence quality.",
        "instructions": {
            "operating_principles": ["Prefer measured evidence over slogans."],
            "reasoning_style": "methodical, evidence-weighted, skeptical",
            "boundaries": ["Do not invent statistics."],
            "allowed_tools": ["default_analyzers"],
            "allowed_skills": ["Urban Mobility Policy Debate Skill"],
        },
        "input_contract": {"required": ["question", "analyzer_outputs"], "optional": ["skill_context"]},
        "output_contract": {"pros_count": 5, "cons_count": 5, "requires_summary": True, "requires_confidence": True},
        "quality": {"created_by": "system", "creation_reason": "Seeded reusable scientific agent.", "reuse_count": 0},
        "provenance": {
            "created_in_debate_id": debate_id,
            "created_by_model": "gpt-5.6sol-medium",
            "created_by_worker_id": "worker-real-1",
            "creation_prompt_id": "prompt-agent-1",
            "job_id": "job-agent-1",
        },
    }


def real_codex_worker(db, *, name: str = "codex-worker") -> Worker:
    worker = Worker(
        name=name,
        token_hash="test-token",
        capabilities=["gpt-5.6sol-medium"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def mock_worker(db) -> Worker:
    worker = Worker(
        name="mock-worker",
        token_hash="test-token",
        capabilities=["mock-local"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()
    return worker


def claim_for_worker(db, worker: Worker):
    job = claim_pending_job(db, worker)
    assert job is not None
    return job


def worker_agent_output(worker: Worker, job_id: str) -> dict:
    return {
        "pros": [f"Substantive pro argument {index} about downtown car restrictions." for index in range(1, 6)],
        "cons": [f"Substantive con argument {index} about downtown car restrictions." for index in range(1, 6)],
        "summary": "The policy has measurable upside but depends on evidence, exemptions, and implementation quality.",
        "confidence": 0.72,
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def worker_synthesis(worker: Worker, job_id: str) -> dict:
    return {
        "strongest_pro": "Reduced downtown car traffic can improve safety, air quality, and street reliability.",
        "strongest_con": "Restrictions can burden access, deliveries, and people with limited mobility options.",
        "verdict": "Treat the proposal as a design-sensitive tradeoff rather than a direct yes/no answer.",
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def worker_plan() -> dict:
    return {
        "agents": [
            {
                "name": "Scientific Skeptic",
                "description": "Evaluates claims through empirical evidence and methodological rigor.",
                "lens": "scientific evidence",
                "domain": "urban mobility",
                "default_prompt": "Challenge weak empirical claims and surface evidence quality.",
                "skill_names": ["Evidence Weighing"],
            },
            {
                "name": "Access Advocate",
                "description": "Evaluates access, equity, disability, and delivery tradeoffs.",
                "lens": "access and equity",
                "domain": "urban mobility",
                "default_prompt": "Identify who benefits, who loses access, and what mitigations matter.",
                "skill_names": ["Equity Impact Framing"],
            },
        ],
        "skills": [
            {
                "name": "Evidence Weighing",
                "type": "prompt",
                "description": "Separate measured evidence from assumptions.",
                "body": "State evidence quality, uncertainty, and missing causal links before arguing.",
                "tags": ["transport", "evidence", "policy"],
            },
            {
                "name": "Equity Impact Framing",
                "type": "prompt",
                "description": "Frame access and equity tradeoffs.",
                "body": "Identify affected groups, burdens, mitigations, and implementation risks.",
                "tags": ["transport", "equity", "policy"],
            },
        ],
    }


def worker_agent_run_output(worker: Worker, job_id: str) -> dict:
    payload = worker_agent_output(worker, job_id)
    payload["contribution_summary"] = "This run adds a distinct lens to the final synthesis."
    return payload


def worker_pov_output(worker: Worker, job_id: str, pov: str) -> dict:
    prefixes = {
        "Scientific POV": "scientific",
        "Statistical POV": "statistical",
        "Ethical POV": "ethical",
        "Practical POV": "practical",
    }
    prefix = prefixes[pov]
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {prefix} assessment of the question based on the strongest available reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {prefix} pro relies on the clearest relevant evidence.",
            "pro": {
                "title": f"{pov} pro support",
                "content": f"Supporting detail that strengthens the {prefix} pro without padding.",
            },
            "con": {
                "title": f"{pov} pro limitation",
                "content": f"Counter-detail that limits the {prefix} pro and identifies uncertainty.",
            },
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": f"The strongest {prefix} con identifies the most important risk or weakness.",
            "pro": {
                "title": f"{pov} con support",
                "content": f"Supporting detail that strengthens the {prefix} con without padding.",
            },
            "con": {
                "title": f"{pov} con limitation",
                "content": f"Counter-detail that limits the {prefix} con and identifies uncertainty.",
            },
        },
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def worker_non_adjudicating_synthesis(worker: Worker, job_id: str) -> dict:
    return {
        "title": "Synthesis",
        "content": "Both perspectives agree evidence quality matters, disagree on what uncertainty implies, and leave gaps for local baseline data.",
        "tensions": ["Measured effects may not transfer cleanly to every setting."],
        "agreements": ["Both branches need transparent assumptions and scoped evidence."],
        "evidence_gaps": ["Baseline rates, population exposure, and implementation details remain under-specified."],
        "key_takeaways": ["Treat the question as evidence-sensitive rather than settled."],
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def complete_worker_v2_plan_pipeline(db, debate: Debate, worker: Worker) -> None:
    for _ in range(4):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))
    synthesis = claim_for_worker(db, worker)
    assert synthesis.job_type == "v2_synthesize"
    asyncio.run(complete_job(db, synthesis, worker_non_adjudicating_synthesis(worker, synthesis.id), {"latency_ms": 13}))


def complete_worker_v2_pipeline(db, debate: Debate, worker: Worker) -> None:
    complete_worker_v2_plan_pipeline(db, debate, worker)


def test_create_debate_queues_planner_before_agent_execution(db) -> None:
    service = v2_service()
    real_codex_worker(db)

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {"max_depth": 1})
    jobs = db.scalars(select(entities.Job).where(entities.Job.debate_id == debate.id).order_by(entities.Job.created_at)).all()

    assert [job.job_type for job in jobs if job.job_type.startswith("v2_")] == ["v2_pov", "v2_pov", "v2_pov", "v2_pov"]
    assert [job.required_role for job in jobs if job.job_type == "v2_pov"] == [
        "Scientific POV",
        "Statistical POV",
        "Ethical POV",
        "Practical POV",
    ]
    assert {job.required_model for job in jobs if job.job_type == "v2_pov"} == {"gpt-5.6sol-medium"}
    assert all(job.required_model != "mock-local" for job in jobs)
    assert db.scalar(select(entities.AgentRun).where(entities.AgentRun.debate_id == debate.id)) is None


def test_create_debate_creates_visible_top_level_pov_branches(db) -> None:
    service = v2_service()
    real_codex_worker(db)

    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {"max_depth": 2})
    detail = debate_to_dict(db, debate)

    assert detail["tree"]["node_type"] == "ROOT_CLAIM"
    assert [child["node_type"] for child in detail["tree"]["children"]] == [
        "SCIENTIFIC_POV",
        "STATISTICAL_POV",
        "ETHICAL_POV",
        "PRACTICAL_POV",
    ]
    assert [child["claim"] for child in detail["tree"]["children"]] == [
        "Scientific POV",
        "Statistical POV",
        "Ethical POV",
        "Practical POV",
    ]
    assert [child["status"] for child in detail["tree"]["children"]] == ["pending", "pending", "pending", "pending"]
    assert detail["models"] == []


def test_claimed_v2_planner_does_not_render_as_root_node_generation(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should mosquitoes be exterminated?", {})
    job = claim_for_worker(db, worker)

    assert job.job_type == "v2_pov"
    assert job.node_id != debate.root_node_id
    job.stream_buffer = '{"error":"missing_requested_shape"}'
    detail = debate_to_dict(db, debate)

    assert detail["tree"]["status"] == "complete"
    assert detail["tree"]["active_generation"] is None
    streaming_branch = next(child for child in detail["tree"]["children"] if child["id"] == job.node_id)
    assert streaming_branch["status"] == "generating"
    assert streaming_branch["active_generation"]["model_id"] == "gpt-5.6sol-medium"


def test_planner_completion_persists_definitions_and_real_agent_runs_before_queueing_agents(db) -> None:
    models = v2_models()
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    job = claim_for_worker(db, worker)

    asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 9}))

    assert db.scalar(select(models["SkillDefinition"])) is None
    assert db.scalar(select(models["AgentDefinition"])) is None
    runs = db.scalars(select(models["AgentRun"]).where(models["AgentRun"].debate_id == debate.id)).all()
    assert runs == []
    agent_jobs = db.scalars(
        select(entities.Job).where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_agent_run")
    ).all()
    assert agent_jobs == []


def test_pov_completion_materializes_title_content_and_nested_pro_con_cards(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    first_job = claim_for_worker(db, worker)
    assert first_job.job_type == "v2_pov"
    assert first_job.required_role in {"Scientific POV", "Statistical POV", "Ethical POV", "Practical POV"}
    asyncio.run(complete_job(db, first_job, worker_pov_output(worker, first_job.id, first_job.required_role), {"latency_ms": 12}))

    detail = debate_to_dict(db, debate)
    completed_branch = next(child for child in detail["tree"]["children"] if child["claim"] == first_job.required_role)

    assert completed_branch["status"] == "complete"
    assert completed_branch["active_generation"]["model_id"] == "gpt-5.6sol-medium"
    assert completed_branch["active_generation"]["role"] == first_job.required_role
    assert completed_branch["active_generation"]["argument"].startswith(f"{first_job.required_role} assessment")
    assert [child["node_type"] for child in completed_branch["children"]] == ["PRO", "CON"]
    assert [child["claim"] for child in completed_branch["children"]] == [
        f"{first_job.required_role} strongest pro",
        f"{first_job.required_role} strongest con",
    ]
    for stance in completed_branch["children"]:
        assert stance["status"] == "complete"
        assert stance["active_generation"]["model_id"] == "gpt-5.6sol-medium"
        assert [child["node_type"] for child in stance["children"]] == ["PRO", "CON"]
        assert all(child["status"] == "complete" for child in stance["children"])


def worker_pov_output_with_extractable_evidence(worker: Worker, job_id: str, pov: str) -> dict:
    """Same shape as worker_pov_output, but the pro/con content prose
    contains extractable-evidence sentences (statistical pattern) so that
    extract_and_persist_evidence_for_completed_node actually persists
    EVIDENCE child nodes under pro_node/con_node during materialize_pov_branch
    (Hermes ticket 1 regression coverage: real end-to-end flow through
    materialize_pov_branch, not just the extraction unit)."""
    prefixes = {
        "Scientific POV": "scientific",
        "Statistical POV": "statistical",
        "Ethical POV": "ethical",
        "Practical POV": "practical",
    }
    prefix = prefixes[pov]
    evidence_sentence = "A 2023 study found that 55% of respondents reported measurable improvement."
    return {
        "title": f"{pov} assessment",
        "content": f"A concise {prefix} assessment of the question based on the strongest available reasoning.",
        "strongest_pro": {
            "title": f"{pov} strongest pro",
            "content": f"The strongest {prefix} pro relies on the clearest relevant evidence. {evidence_sentence}",
            "pro": {
                "title": f"{pov} pro support",
                "content": f"Supporting detail that strengthens the {prefix} pro without padding. {evidence_sentence}",
            },
            "con": {
                "title": f"{pov} pro limitation",
                "content": f"Counter-detail that limits the {prefix} pro and identifies uncertainty. {evidence_sentence}",
            },
        },
        "strongest_con": {
            "title": f"{pov} strongest con",
            "content": f"The strongest {prefix} con identifies the most important risk or weakness. {evidence_sentence}",
            "pro": {
                "title": f"{pov} con support",
                "content": f"Supporting detail that strengthens the {prefix} con without padding. {evidence_sentence}",
            },
            "con": {
                "title": f"{pov} con limitation",
                "content": f"Counter-detail that limits the {prefix} con and identifies uncertainty. {evidence_sentence}",
            },
        },
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": worker.id,
            "prompt_id": f"prompt-{job_id}",
            "job_id": job_id,
        },
    }


def test_pov_completion_evidence_and_nested_pro_con_children_never_collide(db) -> None:
    """Regression for Hermes ticket 1: materialize_pov_branch calls
    extract_and_persist_evidence_for_completed_node(pro_node) /
    (con_node) BEFORE it creates each stance's nested PRO/CON children at
    positions 0/1. When the generated prose contains extractable evidence,
    this used to make an EVIDENCE node and a nested PRO child both claim
    sibling position 0 with an identical materialized_path. Drive this
    through the REAL end-to-end flow (create_dialectical_debate ->
    complete_job -> materialize_pov_branch) and assert every claim node's
    children end up with unique (position, materialized_path) pairs,
    EVIDENCE and nested PRO/CON coexisting.
    """
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    first_job = claim_for_worker(db, worker)
    assert first_job.job_type == "v2_pov"
    payload = worker_pov_output_with_extractable_evidence(worker, first_job.id, first_job.required_role)
    asyncio.run(complete_job(db, first_job, payload, {"latency_ms": 12}))

    all_nodes = db.scalars(select(entities.Node).where(entities.Node.debate_id == debate.id)).all()
    assert any(node.node_type == "EVIDENCE" for node in all_nodes), (
        "test fixture did not actually produce any EVIDENCE nodes -- "
        "strengthen the evidence-bearing prose fixture"
    )

    children_by_parent: dict[str, list] = {}
    for node in all_nodes:
        if node.parent_id is not None:
            children_by_parent.setdefault(node.parent_id, []).append(node)

    for parent_id, children in children_by_parent.items():
        positions = [child.position for child in children]
        paths = [child.materialized_path for child in children]
        assert len(positions) == len(set(positions)), (
            f"duplicate sibling position under parent {parent_id}: {[(c.node_type, c.position) for c in children]}"
        )
        assert len(paths) == len(set(paths)), (
            f"duplicate sibling materialized_path under parent {parent_id}: "
            f"{[(c.node_type, c.materialized_path) for c in children]}"
        )


def test_pov_completion_does_not_invoke_default_debate_scoring_before_synthesis(db, monkeypatch: pytest.MonkeyPatch) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    scored_nodes: list[tuple[str, str, str, str]] = []

    def record_scoring(scoring_db, scored_debate, node):
        assert scoring_db is db
        assert scored_debate.id == debate.id
        assert node.status == "complete"
        scored_nodes.append((scored_debate.id, node.id, node.node_type, node.claim))
        return {
            "status": "unavailable",
            "items": [],
            "errors": [{"node_id": node.id, "status": "unavailable", "reason": "No scoring provider is configured."}],
        }

    monkeypatch.setattr(service, "ensure_default_scoring_for_completed_v2_node", record_scoring)

    first_job = claim_for_worker(db, worker)
    assert first_job.job_type == "v2_pov"
    asyncio.run(complete_job(db, first_job, worker_pov_output(worker, first_job.id, first_job.required_role), {"latency_ms": 12}))

    assert scored_nodes == []
    assert db.scalars(select(entities.NodeScoringResult).where(entities.NodeScoringResult.debate_id == debate.id)).all() == []


def test_synthesis_queues_only_after_all_pov_branches_complete(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    first_job = claim_for_worker(db, worker)
    asyncio.run(complete_job(db, first_job, worker_pov_output(worker, first_job.id, first_job.required_role), {"latency_ms": 12}))
    assert db.scalar(select(entities.Job).where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_synthesize")) is None

    for _ in range(3):
        next_job = claim_for_worker(db, worker)
        assert next_job.job_type == "v2_pov"
        asyncio.run(complete_job(db, next_job, worker_pov_output(worker, next_job.id, next_job.required_role), {"latency_ms": 12}))

    synthesis_job = db.scalar(select(entities.Job).where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_synthesize"))
    assert synthesis_job is not None
    assert synthesis_job.required_model == "gpt-5.6sol-medium"


@pytest.mark.parametrize("branch_status", ["pending", "stale"])
def test_synthesis_queue_gate_blocks_on_incomplete_non_pov_branch_node(db, branch_status: str) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    for _ in range(3):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))

    root = db.get(entities.Node, debate.root_node_id)
    assert root is not None
    # LENS is a synthetic dynamic-container stand-in for this test only; it is
    # deliberately not production vocabulary or a template branch type.
    db.add(
        entities.Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type="LENS",
            depth=1,
            position=4,
            claim="Synthetic dynamic branch container",
            status=branch_status,
            materialized_path=f"{root.materialized_path}/4",
        )
    )
    db.commit()

    final_pov = claim_for_worker(db, worker)
    assert final_pov.job_type == "v2_pov"
    asyncio.run(complete_job(db, final_pov, worker_pov_output(worker, final_pov.id, final_pov.required_role), {"latency_ms": 12}))

    synthesis_jobs = db.scalars(
        select(entities.Job).where(
            entities.Job.debate_id == debate.id,
            entities.Job.job_type == "v2_synthesize",
        )
    ).all()
    assert synthesis_jobs == []


def test_persist_synthesis_hard_guard_blocks_on_incomplete_non_pov_branch_node(db) -> None:
    service = v2_service()
    models = v2_models()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    for _ in range(4):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))

    synthesis_job = claim_for_worker(db, worker)
    assert synthesis_job.job_type == "v2_synthesize"
    branch = db.scalar(select(models["DebateBranch"]).where(models["DebateBranch"].debate_id == debate.id))
    assert branch is not None
    root = db.get(entities.Node, debate.root_node_id)
    assert root is not None
    # LENS is a synthetic dynamic-container stand-in for this test only.
    db.add(
        entities.Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type="LENS",
            depth=1,
            position=4,
            claim="Synthetic dynamic branch container",
            status="pending",
            materialized_path=f"{root.materialized_path}/4",
        )
    )
    db.commit()
    payload = service.validate_synthesis_contract(worker_non_adjudicating_synthesis(worker, synthesis_job.id))

    with pytest.raises(ValueError, match="Cannot synthesize until"):
        service.persist_v2_synthesis(db, debate, branch, synthesis_job, worker, payload)


def test_synthesis_gate_equivalent_for_standard_pov_trees(db) -> None:
    service = v2_service()
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    pov_types = [node_type for node_type, _label in service.POV_BRANCHES]
    pov_nodes = db.scalars(
        select(entities.Node).where(
            entities.Node.debate_id == debate.id,
            entities.Node.node_type.in_(pov_types),
        )
    ).all()

    def frozen_pov_pending_ids() -> set[str]:
        return set(
            db.scalars(
                select(entities.Node.id).where(
                    entities.Node.debate_id == debate.id,
                    entities.Node.node_type.in_(pov_types),
                    entities.Node.status != "complete",
                )
            ).all()
        )

    def structural_pending_ids() -> set[str]:
        return {
            node.id
            for node in service.pending_branch_containers(
                db,
                debate.id,
                debate.root_node_id,
            )
        }

    assert frozen_pov_pending_ids() == structural_pending_ids() == {node.id for node in pov_nodes}

    for node in pov_nodes:
        node.status = "complete"
    db.flush()
    assert frozen_pov_pending_ids() == structural_pending_ids() == set()

    pov_nodes[0].status = "stale"
    db.flush()
    assert frozen_pov_pending_ids() == structural_pending_ids() == {pov_nodes[0].id}


@pytest.mark.parametrize("evidence_status", ["completed", "pending"])
def test_evidence_child_of_root_never_blocks_synthesis(db, evidence_status: str) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    root = db.get(entities.Node, debate.root_node_id)
    assert root is not None
    db.add(
        entities.Node(
            debate_id=debate.id,
            parent_id=root.id,
            node_type="EVIDENCE",
            depth=1,
            position=4,
            claim="Direct root evidence must not participate in the branch-completeness gate.",
            status=evidence_status,
            materialized_path=f"{root.materialized_path}/4",
        )
    )
    db.commit()

    for _ in range(4):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))

    synthesis_job = claim_for_worker(db, worker)
    assert synthesis_job.job_type == "v2_synthesize"
    asyncio.run(
        complete_job(
            db,
            synthesis_job,
            worker_non_adjudicating_synthesis(worker, synthesis_job.id),
            {"latency_ms": 13},
        )
    )

    assert db.get(Debate, debate.id).status == "complete"


def test_failed_stale_synthesis_job_does_not_block_required_v2_synthesis_queue(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    for _ in range(3):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))

    stale_synthesis = entities.Job(
        debate_id=debate.id,
        job_type="v2_synthesize",
        required_role="v2_synthesizer",
        required_model="gpt-5.6sol-medium",
        status="failed",
        error="previous synthesis failed",
    )
    db.add(stale_synthesis)
    db.commit()

    final_pov = claim_for_worker(db, worker)
    assert final_pov.job_type == "v2_pov"
    asyncio.run(complete_job(db, final_pov, worker_pov_output(worker, final_pov.id, final_pov.required_role), {"latency_ms": 12}))

    synthesis_jobs = db.scalars(
        select(entities.Job)
        .where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_synthesize")
        .order_by(entities.Job.created_at)
    ).all()
    assert [job.status for job in synthesis_jobs] == ["failed", "pending"]


def test_non_adjudicating_synthesis_completes_without_declaring_winner(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    for _ in range(4):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))

    synthesis_job = claim_for_worker(db, worker)
    assert synthesis_job.job_type == "v2_synthesize"
    asyncio.run(
        complete_job(
            db,
            synthesis_job,
            worker_non_adjudicating_synthesis(worker, synthesis_job.id),
            {"latency_ms": 13},
        )
    )

    detail = TestClient(app).get(f"/api/debates/{debate.id}").json()

    assert detail["status"] == "complete"
    assert detail["synthesis"]["strongest_pro"] == "Synthesis"
    assert "Both perspectives agree" in detail["synthesis"]["verdict"]
    assert "winner" not in detail["synthesis"]["verdict"].lower()
    assert detail["synthesis"]["provenance"]["tensions"]
    assert detail["synthesis"]["model_id"] == "gpt-5.6sol-medium"


def test_planner_rejects_invalid_json_and_executable_skills(db) -> None:
    service = v2_service()
    valid = worker_plan()
    assert service.validate_planner_contract(valid)["agents"][0]["name"] == "Scientific Skeptic"

    with pytest.raises(ValueError, match="Planner output"):
        service.validate_planner_contract({"agents": [], "skills": []})

    invalid_skill_type = json.loads(json.dumps(valid))
    invalid_skill_type["skills"][0]["type"] = "executable"
    with pytest.raises(ValueError, match="Only prompt skills"):
        service.validate_planner_contract(invalid_skill_type)

    missing_body = json.loads(json.dumps(valid))
    missing_body["skills"][0]["body"] = ""
    with pytest.raises(ValueError, match="body"):
        service.validate_planner_contract(missing_body)


def test_synthesis_waits_until_all_pov_branches_complete(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    first_pov_job = claim_for_worker(db, worker)
    assert first_pov_job.job_type == "v2_pov"
    asyncio.run(complete_job(db, first_pov_job, worker_pov_output(worker, first_pov_job.id, first_pov_job.required_role), {"latency_ms": 12}))

    queued_synthesis = db.scalar(select(entities.Job).where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_synthesize"))
    assert queued_synthesis is None
    incomplete_pov = db.scalars(
        select(entities.Node).where(
            entities.Node.debate_id == debate.id,
            entities.Node.node_type.in_(["SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"]),
            entities.Node.status != "complete",
        )
    ).all()
    assert len(incomplete_pov) == 3


def test_pov_pipeline_completes_from_real_jobs_and_returns_breakdown(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {"max_depth": 1})

    complete_worker_v2_plan_pipeline(db, debate, worker)
    detail = TestClient(app).get(f"/api/debates/{debate.id}").json()

    assert detail["status"] == "complete"
    assert [child["claim"] for child in detail["tree"]["children"]] == [
        "Scientific POV",
        "Statistical POV",
        "Ethical POV",
        "Practical POV",
    ]
    assert all(child["status"] == "complete" for child in detail["tree"]["children"])
    assert detail["selected_agents"] == []
    assert detail["selected_skills"] == []
    assert detail["agent_runs"] == []
    assert detail["synthesis"]["provenance"]["model_id"] == "gpt-5.6sol-medium"


def test_agent_and_skill_json_contracts_persist_and_retrieve(db) -> None:
    models = v2_models()
    debate = Debate(topic="Should cities ban cars downtown?", status="generating", config={})
    db.add(debate)
    db.flush()
    skill = models["SkillCapability"](definition=persisted_skill_json(debate.id), status="active", quality_score=0.91)
    agent = models["AgentCapability"](definition=persisted_agent_json(debate.id), status="active", quality_score=0.94)
    db.add_all([skill, agent])
    db.commit()

    saved_skill = db.get(models["SkillCapability"], skill.id)
    saved_agent = db.get(models["AgentCapability"], agent.id)

    assert saved_skill.definition["trigger"]["activation_rules"] == ["Use for city transport policy tradeoffs."]
    assert saved_skill.definition["workflow"]["steps"][3] == "Invoke Agents"
    assert saved_skill.definition["constraints"]["must_preserve_provenance"] is True
    assert saved_agent.definition["role"] == "Debate participant"
    assert saved_agent.definition["purpose"].startswith("Challenge weak empirical claims")
    assert saved_agent.definition["instructions"]["reasoning_style"] == "methodical, evidence-weighted, skeptical"
    assert saved_agent.definition["instructions"]["allowed_tools"] == ["default_analyzers"]
    assert saved_agent.definition["output_contract"]["pros_count"] == 5
    assert saved_agent.definition["provenance"]["created_in_debate_id"] == debate.id


def test_select_reusable_agent_returns_none_when_no_real_agent_matches(db) -> None:
    models = v2_models()
    service = v2_service()
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    branch = db.scalar(select(models["DebateBranch"]).where(models["DebateBranch"].debate_id == debate.id))
    skill = models["SkillDefinition"](definition=persisted_skill_json(debate.id), status="active", quality_score=0.9)
    db.add(skill)
    db.commit()

    selected = service.select_reusable_agent(
        db,
        debate,
        branch,
        skill,
        {"domain_tags": ["transport", "policy"]},
    )

    assert selected is None


def test_publish_event_logs_async_task_failures(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    service = v2_service()
    logger = logging.getLogger(service.__name__)
    previous_disabled = logger.disabled
    previous_propagate = logger.propagate
    previous_global_disable = logging.root.manager.disable

    async def fail_publish(_debate_id: str, _event: str, _data: dict) -> None:
        raise RuntimeError("event bus unavailable")

    async def publish_inside_running_loop() -> None:
        monkeypatch.setattr(service.event_bus, "publish", fail_publish)
        with caplog.at_level(logging.ERROR, logger=service.__name__):
            service.publish_event("debate-1", "event_failed", {"debate_id": "debate-1"})
            for _ in range(10):
                if "Failed to publish dialectical v2 event" in caplog.text:
                    break
                await asyncio.sleep(0)

    logger.disabled = False
    logger.propagate = True
    logging.disable(logging.NOTSET)
    try:
        asyncio.run(publish_inside_running_loop())
    finally:
        logger.disabled = previous_disabled
        logger.propagate = previous_propagate
        logging.disable(previous_global_disable)

    assert "Failed to publish dialectical v2 event" in caplog.text
    assert "event bus unavailable" in caplog.text


def test_empty_database_question_creates_full_pipeline_without_direct_answer(db) -> None:
    models = v2_models()
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {"max_depth": 1})
    complete_worker_v2_pipeline(db, debate, worker)
    detail = TestClient(app).get(f"/api/debates/{debate.id}").json()

    assert detail["topic"] == "Should cities ban cars downtown?"
    assert detail["direct_answer"] is None
    assert detail["status"] == "complete"
    assert detail["branch_lineage"][0]["parent_branch_id"] is None
    # V2 never runs the legacy V1-style DEFAULT_ANALYZERS stage; the only
    # AnalyzerRun this pipeline produces is Phase 5b's best-effort
    # protocol_analysis run persisted during synthesis (cross-exam +
    # verification), which is expected here, not a leftover V1 artifact.
    assert [run["analyzer_type"] for run in detail["analyzer_runs"]] == ["protocol_analysis"]
    assert detail["selected_skills"] == []
    assert detail["selected_agents"] == []
    assert detail["agent_outputs"] == []
    assert detail["synthesis"]["upstream_agent_output_ids"] == []
    assert detail["synthesis"]["analyzer_findings"] == {}
    assert detail["synthesis"]["provenance"]["model_id"] == "gpt-5.6sol-medium"
    assert detail["synthesis"]["provenance"]["worker_id"] == worker.id
    assert {child["node_type"] for child in detail["tree"]["children"]} == {
        "SCIENTIFIC_POV",
        "STATISTICAL_POV",
        "ETHICAL_POV",
        "PRACTICAL_POV",
    }

    db.expire_all()
    assert db.scalar(select(models["DebateBranch"]).where(models["DebateBranch"].debate_id == debate.id)) is not None
    assert [
        run.analyzer_type
        for run in db.scalars(select(models["AnalyzerRun"]).where(models["AnalyzerRun"].debate_id == debate.id)).all()
    ] == ["protocol_analysis"]
    assert db.scalar(select(models["CapabilityMatch"]).where(models["CapabilityMatch"].debate_id == debate.id)) is None
    assert db.scalar(select(models["AgentOutput"]).where(models["AgentOutput"].debate_id == debate.id)) is None
    assert db.scalar(select(models["ProvenanceRecord"]).where(models["ProvenanceRecord"].debate_id == debate.id)) is not None


def test_second_similar_question_does_not_reuse_local_skill_or_agent(db) -> None:
    models = v2_models()
    service = v2_service()
    worker = real_codex_worker(db)
    first = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_pipeline(db, first, worker)
    created_skill = db.scalar(select(models["SkillCapability"]))
    created_agent = db.scalar(select(models["AgentCapability"]))
    assert created_skill is None
    assert created_agent is None

    second = service.create_dialectical_debate(db, "Should a city restrict downtown car traffic?", {})
    complete_worker_v2_pipeline(db, second, worker)
    db.expire_all()

    assert first.id != second.id
    assert db.scalars(select(models["CapabilityMatch"]).where(models["CapabilityMatch"].debate_id == second.id)).all() == []


def test_low_quality_or_rejected_capabilities_are_not_selected(db) -> None:
    models = v2_models()
    service = v2_service()
    debate = Debate(topic="Should cities ban cars downtown?", status="draft", config={})
    db.add(debate)
    db.flush()
    rejected_skill = models["SkillCapability"](
        definition=persisted_skill_json(debate.id),
        status="rejected",
        quality_score=0.99,
    )
    poor_agent = models["AgentCapability"](
        definition=persisted_agent_json(debate.id),
        status="active",
        quality_score=0.1,
    )
    db.add_all([rejected_skill, poor_agent])
    db.commit()
    real_codex_worker(db)

    created = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_pipeline(db, created, db.scalar(select(Worker).where(Worker.name == "codex-worker")))
    matches = db.scalars(select(models["CapabilityMatch"]).where(models["CapabilityMatch"].debate_id == created.id)).all()

    assert matches == []


def test_deterministic_capabilities_are_not_reused_for_product_v2(db) -> None:
    models = v2_models()
    service = v2_service()
    debate = Debate(topic="Should cities ban cars downtown?", status="draft", config={})
    db.add(debate)
    db.flush()
    deterministic_skill = persisted_skill_json(debate.id)
    deterministic_skill["provenance"] = {
        "created_in_debate_id": debate.id,
        "created_by_model": "coordinator-deterministic-v2",
        "created_by_worker_id": "coordinator",
        "creation_prompt_id": "old-skill",
    }
    deterministic_agent = persisted_agent_json(debate.id)
    deterministic_agent["provenance"] = {
        "created_in_debate_id": debate.id,
        "created_by_model": "coordinator-deterministic-v2",
        "created_by_worker_id": "coordinator",
        "creation_prompt_id": "old-agent",
    }
    old_skill = models["SkillCapability"](definition=deterministic_skill, status="active", quality_score=0.99)
    old_agent = models["AgentCapability"](definition=deterministic_agent, status="active", quality_score=0.99)
    db.add_all([old_skill, old_agent])
    db.commit()
    real_codex_worker(db)

    created = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    jobs = db.scalars(select(entities.Job).where(entities.Job.debate_id == created.id)).all()

    assert [job.job_type for job in jobs if job.job_type.startswith("v2_")] == ["v2_pov", "v2_pov", "v2_pov", "v2_pov"]
    assert not db.scalars(
        select(models["CapabilityMatch"]).where(
            models["CapabilityMatch"].debate_id == created.id,
            models["CapabilityMatch"].capability_id.in_([old_skill.id, old_agent.id]),
        )
    ).all()


def test_agent_output_contract_requires_exactly_five_pros_cons_and_provenance(db) -> None:
    service = v2_service()
    valid = {
        "pros": [f"Substantive pro argument {index}" for index in range(1, 6)],
        "cons": [f"Substantive con argument {index}" for index in range(1, 6)],
        "summary": "The tradeoff depends on implementation details.",
        "confidence": 0.72,
        "provenance": {
            "model_id": "gpt-5.6sol-medium",
            "worker_id": "worker-real-1",
            "prompt_id": "prompt-1",
            "job_id": "job-1",
        },
    }

    assert service.validate_agent_output_contract(valid)["pros"] == valid["pros"]

    for mutation in ("short_pros", "long_cons", "missing_provenance"):
        invalid = json.loads(json.dumps(valid))
        if mutation == "short_pros":
            invalid["pros"] = invalid["pros"][:4]
        elif mutation == "long_cons":
            invalid["cons"].append("A sixth con should fail.")
        else:
            invalid.pop("provenance")
        with pytest.raises(ValueError):
            service.validate_agent_output_contract(invalid)


def test_sse_replays_v2_pipeline_events_after_debate_creation(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_pipeline(db, debate, worker)
    stream = event_bus.subscribe(debate.id, replay_history=True)

    async def collect_events() -> list[str]:
        try:
            events = []
            while True:
                try:
                    events.append(await asyncio.wait_for(stream.__anext__(), timeout=0.1))
                except TimeoutError:
                    return events
            return events
        finally:
            await stream.aclose()

    names = [event.split("\n", 1)[0].replace("event: ", "") for event in asyncio.run(collect_events())]

    assert "v2_pov_queued" in names
    assert "pov_completed" in names
    assert "synthesis_completed" in names


def test_post_debate_runs_v2_pipeline_and_detail_api_returns_contract(db) -> None:
    real_codex_worker(db)
    client = TestClient(app)

    response = client.post(
        "/api/debates",
        headers=USER_HEADERS,
        json={"topic": "Should cities ban cars downtown?", "config": {"max_depth": 1}},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["config"].get("mode") != "single_shot"
    assert payload["status"] == "generating"
    assert payload["analyzer_runs"] == []
    assert payload["selected_skills"] == []
    assert payload["selected_agents"] == []
    assert payload["agent_outputs"] == []
    assert payload["branch_lineage"][0]["debate_id"] == payload["id"]
    assert [child["claim"] for child in payload["tree"]["children"]] == [
        "Scientific POV",
        "Statistical POV",
        "Ethical POV",
        "Practical POV",
    ]
    jobs = db.scalars(select(entities.Job).where(entities.Job.debate_id == payload["id"])).all()
    assert [job.job_type for job in jobs if job.job_type.startswith("v2_")] == ["v2_pov", "v2_pov", "v2_pov", "v2_pov"]


def test_v2_rejects_mock_only_workers(db) -> None:
    service = v2_service()
    mock_worker(db)

    with pytest.raises(RuntimeError, match="No real Codex worker online"):
        service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})


def test_v2_requires_real_codex_capable_worker_even_if_deterministic_worker_exists(db) -> None:
    service = v2_service()
    worker = Worker(
        name="coordinator-v2",
        token_hash="internal",
        capabilities=["coordinator-deterministic-v2"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()

    with pytest.raises(RuntimeError, match="No real Codex worker online"):
        service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})


def test_v2_rejects_mock_worker_alias_advertising_protected_codex_model(db) -> None:
    service = v2_service()
    worker = Worker(
        name="mock-worker-codex-alias",
        token_hash="internal",
        capabilities=["gpt-5.6sol-medium"],
        last_seen=now_utc(),
        status="online",
    )
    db.add(worker)
    db.commit()

    with pytest.raises(RuntimeError, match="No real Codex worker online"):
        service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})


@pytest.mark.parametrize(
    ("worker_name", "capabilities", "status", "last_seen_offset", "expected_reason_code"),
    [
        (None, [], "online", None, "no_workers"),
        ("stale-codex", ["gpt-5.6sol-medium"], "online", timedelta(hours=-2), "stale_real_worker"),
        ("offline-codex", ["gpt-5.6sol-medium"], "offline", timedelta(seconds=0), "offline_real_worker"),
        ("mock-worker-codex-alias", ["gpt-5.6sol-medium"], "online", timedelta(seconds=0), "mock_or_deterministic_only"),
    ],
)
def test_v2_generation_readiness_reports_canonical_reason_codes(
    db,
    worker_name: str | None,
    capabilities: list[str],
    status: str,
    last_seen_offset: timedelta | None,
    expected_reason_code: str,
) -> None:
    service = v2_service()
    if worker_name is not None:
        db.add(
            Worker(
                name=worker_name,
                token_hash="internal",
                capabilities=capabilities,
                last_seen=now_utc() + (last_seen_offset or timedelta(seconds=0)),
                status=status,
            )
        )
        db.commit()

    readiness = service.v2_generation_readiness(db)

    assert readiness.ready is False
    assert readiness.required_model == "gpt-5.6sol-medium"
    assert readiness.reason_code == expected_reason_code
    assert readiness.reason
    assert "token" not in readiness.reason.lower()
    assert "secret" not in readiness.reason.lower()


def test_v2_generation_readiness_accepts_only_real_online_codex_worker(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db, name="VLADWORKS")

    readiness = service.v2_generation_readiness(db)

    assert readiness.ready is True
    assert readiness.required_model == "gpt-5.6sol-medium"
    assert readiness.reason_code == "ready"
    assert readiness.online_worker_names == [worker.name]
    assert readiness.known_worker_names == [worker.name]


def test_v2_creates_worker_jobs_for_pov_branches_and_synthesis(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    first_jobs = db.scalars(select(entities.Job).where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_pov")).all()
    assert len(first_jobs) == 4
    assert {job.required_model for job in first_jobs} == {"gpt-5.6sol-medium"}
    complete_worker_v2_pipeline(db, debate, worker)

    job_types = [
        job.job_type
        for job in db.scalars(select(entities.Job).where(entities.Job.debate_id == debate.id).order_by(entities.Job.created_at)).all()
    ]
    assert job_types.count("v2_pov") == 4
    assert "v2_agent_run" not in job_types
    assert "v2_synthesize" in job_types


def test_v2_pov_prompt_rejects_status_wrapper_and_includes_schema(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    job = claim_for_worker(db, worker)

    system, user = service.render_v2_job_prompt(db, job)

    assert "strict JSON object" in system
    assert "Do not include markdown or status wrappers" in system
    assert '"strongest_pro"' in user
    assert '"strongest_con"' in user
    assert '"title"' in user
    assert job.required_role in user


def test_v2_pov_prompts_include_ethical_and_practical_lens_descriptions(db) -> None:
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    jobs = db.scalars(
        select(entities.Job)
        .where(entities.Job.debate_id == debate.id, entities.Job.job_type == "v2_pov")
        .order_by(entities.Job.created_at)
    ).all()

    prompts = {job.required_role: service.render_v2_job_prompt(db, job)[1] for job in jobs}

    assert "fairness, harm, dignity, rights, responsibility, and group tradeoffs" in prompts["Ethical POV"]
    assert "whether the action should be done even if it works" in prompts["Ethical POV"]
    assert "feasibility, operational complexity, costs, maintainability, failure modes, rollout risks, and edge cases" in prompts["Practical POV"]
    assert "whether the action can realistically be done" in prompts["Practical POV"]


def test_v2_persists_pov_tree_and_synthesis_from_worker_completed_json(db) -> None:
    models = v2_models()
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_pipeline(db, debate, worker)

    skill = db.scalar(select(models["SkillCapability"]))
    agent = db.scalar(select(models["AgentCapability"]))
    output = db.scalar(select(models["AgentOutput"]).where(models["AgentOutput"].debate_id == debate.id))
    provenance_records = db.scalars(select(models["ProvenanceRecord"]).where(models["ProvenanceRecord"].debate_id == debate.id)).all()

    assert skill is None
    assert agent is None
    assert output is None
    detail = debate_to_dict(db, db.get(Debate, debate.id))
    assert detail["models"] == ["gpt-5.6sol-medium"]
    assert all(child["active_generation"]["model_id"] == "gpt-5.6sol-medium" for child in detail["tree"]["children"])
    assert {record.artifact_kind for record in provenance_records} >= {"pov_branch", "synthesis"}


def test_post_debate_returns_clear_error_when_no_real_codex_worker_online(db) -> None:
    mock_worker(db)
    client = TestClient(app)

    response = client.post(
        "/api/debates",
        headers=USER_HEADERS,
        json={"topic": "Should cities ban cars downtown?", "config": {"max_depth": 1}},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "No real Codex worker online for Dialectical V2 artifact generation"


def test_new_page_starts_orchestration_mode_not_single_shot() -> None:
    source = Path(__file__).resolve().parents[2] / "web" / "app" / "new" / "page.tsx"
    text = source.read_text(encoding="utf-8")

    assert '{ mode: "single_shot" }' not in text
    # Orchestration mode is signalled by sending tree-shaping config (depth/branching),
    # which the single-shot path never does.
    assert "max_depth" in text
    assert "branching" in text


def test_completion_tail_survives_scoring_bootstrap_failure(db, monkeypatch) -> None:
    """Completion resilience: a scoring-bootstrap failure during synthesis
    persistence must not swallow the synthesis_completed/debate_complete
    events or the internal scoring trigger.

    Regression: with the judge model absent from the enabled_models routing
    allowlist, ensure_default_scoring_for_completed_v2_node raised out of
    persist_v2_synthesis AFTER run_protocol_analysis had already committed --
    the debate landed complete in the database, but no completion events were
    published (open SSE tabs stayed on "generating" forever) and the
    submitting worker got a 400 for a job that had actually succeeded.
    """
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    for _ in range(4):
        job = claim_for_worker(db, worker)
        assert job.job_type == "v2_pov"
        asyncio.run(complete_job(db, job, worker_pov_output(worker, job.id, job.required_role), {"latency_ms": 12}))
    synthesis_job = claim_for_worker(db, worker)
    assert synthesis_job.job_type == "v2_synthesize"

    def _boom(db, debate, node):
        raise RuntimeError("scoring bootstrap exploded")

    monkeypatch.setattr(service, "ensure_default_scoring_for_completed_v2_node", _boom)
    events: list[str] = []
    monkeypatch.setattr(service, "publish_event", lambda debate_id, event, data: events.append(event))
    triggered: list[str] = []
    monkeypatch.setattr(
        service, "trigger_internal_scoring_after_completion", lambda debate_id: triggered.append(debate_id)
    )

    asyncio.run(
        complete_job(
            db,
            synthesis_job,
            worker_non_adjudicating_synthesis(worker, synthesis_job.id),
            {"latency_ms": 12},
        )
    )

    db.expire_all()
    assert db.get(Debate, debate.id).status == "complete"
    assert "synthesis_completed" in events
    assert "debate_complete" in events
    assert triggered == [debate.id]


def test_scoring_job_queueing_ignores_worker_routing_allowlist(db) -> None:
    """score_debate jobs are internal bookkeeping for in-process judge runs --
    workers never claim them (claim/reaper/serialization all exclude them), so
    the enabled_models worker-routing allowlist must not apply. Generation job
    types keep enforcing the allowlist unchanged.

    Regression: the judge model missing from enabled_models made create_job
    raise "Model ... is not currently allowed", so judge scoring could never
    be queued on deployments with a routing allowlist configured.
    """
    from app.core.config import RUNTIME_SETTINGS_KEY
    from app.scoring.service import queue_scoring_job
    from app.services.orchestrator import create_job

    service = v2_service()
    real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})

    # Allowlist deliberately excludes the judge model (mirrors the production
    # incident where the judge's model id was not an enabled worker model).
    db.add(entities.Setting(key=RUNTIME_SETTINGS_KEY, value={"enabled_models": ["claude-sonnet-5-high-loop"]}))
    db.commit()

    job = queue_scoring_job(db, debate, model_id="gpt-5.6sol-medium")
    assert job.job_type == "score_debate"
    assert job.required_model == "gpt-5.6sol-medium"
    assert job.status == "pending"

    # Worker-routed job types still enforce the allowlist.
    with pytest.raises(ValueError, match="not currently allowed"):
        create_job(db, debate.id, "v2_pov", "v2_generator", None, required_model="gpt-5.6sol-medium")


def _v2_debate_with_n_outstanding_expand_jobs(db, n: int) -> tuple[Debate, entities.Node, list[entities.Node]]:
    """P1 Task 2 fixture: a v2 debate with `n` outstanding v2_expand jobs.

    Mirrors complete_worker_v2_plan_pipeline's real POV completion (four
    materialized POV branches, each with nested PRO/CON stance cards under
    every stance node), then fans a single-node expansion out across `n`
    distinct completed argument nodes via queue_v2_expand_job -- the only
    expansion spawn path -- so each expand job targets its own fresh
    placeholder child (never the same parent twice, matching production
    fan-out). Returns (debate, root, placeholder_nodes): placeholder_nodes
    are the `n` still-pending children the outstanding jobs target, i.e.
    exactly what pending_generation_nodes is expected to surface.
    """
    service = v2_service()
    worker = real_codex_worker(db)
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    complete_worker_v2_plan_pipeline(db, debate, worker)

    # Depth >= 2 (stance cards and their nested PRO/CON children) keeps this
    # to node types already proven as valid expansion sources elsewhere in
    # this file (see first_pov_pro in test_v2_expand.py); 24 are available
    # for the standard fixed-quartet tree, comfortably above n.
    source_nodes = db.scalars(
        select(entities.Node)
        .where(
            entities.Node.debate_id == debate.id,
            entities.Node.status == "complete",
            entities.Node.depth >= 2,
            entities.Node.node_type.notin_(["ROOT_CLAIM", "EVIDENCE"]),
        )
        .order_by(entities.Node.depth, entities.Node.position, entities.Node.id)
    ).all()
    assert len(source_nodes) >= n, (
        f"fixture needs {n} distinct completed argument nodes to expand from, "
        f"only found {len(source_nodes)}"
    )

    placeholders: list[entities.Node] = []
    for index, source in enumerate(source_nodes[:n]):
        polarity = "PRO" if index % 2 == 0 else "CON"
        job = service.queue_v2_expand_job(db, debate, source, polarity, f"Coverage gap {index}.")
        placeholder = db.get(entities.Node, job.node_id)
        assert placeholder is not None
        placeholders.append(placeholder)

    root = db.get(entities.Node, debate.root_node_id)
    assert root is not None
    return debate, root, placeholders


def test_pending_generation_nodes_uses_bounded_query_count(db, monkeypatch) -> None:
    """P1 Task 2: quiescence must not issue one query per outstanding node.

    Runs on every POV/expand completion; at 150 expansions the per-node
    db.get loop competes with the judge panel for SQLite's single writer.
    """
    from sqlalchemy import event

    from app.services.dialectical_v2 import pending_generation_nodes

    debate, root, nodes = _v2_debate_with_n_outstanding_expand_jobs(db, n=12)
    # Capture plain ids before attaching the listener: debate/root/nodes were
    # all last touched several commits ago, so touching an expired ORM
    # attribute inside the instrumented window would add a stray refresh
    # SELECT and corrupt the statement count this test asserts on.
    debate_id = debate.id
    root_id = root.id
    expected_ids = {node.id for node in nodes}
    # Every placeholder node was created (db.add + flush) through THIS same
    # session a moment ago, so it is already warm in the identity map;
    # db.get() would return it straight from memory with no SQL at all,
    # masking the very per-node query storm this test exists to catch.
    # Evicting the identity map (not just expiring it -- db.get() still
    # short-circuits on a merely-expired-but-present instance) forces a
    # genuinely cold lookup, matching production: the session handling one
    # completion never already holds the other outstanding nodes in memory.
    db.expunge_all()

    statements: list[str] = []

    def _count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db.bind, "before_cursor_execute", _count)
    try:
        pending = pending_generation_nodes(db, debate_id, root_id)
    finally:
        event.remove(db.bind, "before_cursor_execute", _count)

    assert {node.id for node in pending} >= expected_ids
    # Bounded: container query + outstanding-ids query + one bulk node
    # query. Must not scale with n=12 (the old per-node db.get loop hit 14+).
    assert len(statements) <= 4, f"expected <=4 statements, got {len(statements)}: {statements}"
