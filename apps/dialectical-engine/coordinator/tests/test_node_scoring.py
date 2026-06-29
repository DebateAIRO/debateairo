from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from pathlib import Path
from typing import get_type_hints

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.main import app
from app.core.auth import hash_token
from app.core.db import SessionLocal
from app.core.write_lock import commit_write
from app.models.entities import AnalyzerRun, Debate, DebateBranch, Generation, Job, Node, NodeScoringResult, ProvenanceRecord, Worker, now_utc
from app.api import scoring as scoring_api
from app.providers import AgentConfig, FakeProvider, ProviderError, ProviderRegistry
from app.scoring.caps import apply_score_caps
from app.scoring.normalizer import normalize_claim
from app.scoring.models import (
    EvidenceSupportStatus,
    ManualInvestigationRequest,
    ManualInvestigationResponse,
    NodeScoringPayload,
    ScoreLabels,
    ScoreRationale,
    ScoringDebug,
)
from app.scoring import (
    AdaptiveDepthPolicy,
    adaptive_depth_dry_run,
    ClaimAssessment,
    ClaimTypeModel,
    ConsistencyAssessment,
    ContextAssessment,
    CriticAssessment,
    DebateScoringResponse,
    EvidenceAssessment,
    FallacyAssessment,
    FatalFlag,
    JudgeAssessment,
    JudgeDisagreement,
    JudgeStrategy,
    NormalizedClaim,
    NodeScores,
    NodeScoringError,
    SCORING_CACHE_ANALYZER_TYPE,
    SCORING_CACHE_SOURCE,
    ScoringModelMetadata,
    ScoringJobStatusModel,
    ScoringProvider,
    ScoringProviderRequest,
    ScoringProviderResult,
    RecommendedInvestigation,
    ScoreCap,
    ScoringStatusModel,
    ScoringHole,
    SteelmanAssessment,
    detect_disagreements,
    debate_scoring_payload,
    get_debate_scoring,
    lookup_scoring_cache,
    node_scoring_input_hash,
    parse_judge_json,
    queue_scoring_job,
    reduce_assessments,
    record_approved_adaptive_expansion,
    render_single_node_judge_prompt,
    score_debate_with_provider_registry,
    score_node_with_provider,
    score_nodes_with_provider,
    score_one_node_with_provider,
    select_depth_pressure,
    scoring_result_payload,
)


USER_HEADERS = {"Authorization": "Bearer user_test_token"}


def base_claim(**overrides) -> NormalizedClaim:
    data = {
        "node_id": "node-1",
        "raw_text": "Remote work improves productivity",
        "core_claim": "Remote work improves productivity",
        "claim_type": "empirical",
        "scope": {},
        "implied_assumptions": ["productivity is measurable"],
        "evidence_refs": [],
        "ambiguity_flags": ["missing evidence"],
        "key_terms": ["Remote work", "productivity"],
    }
    data.update(overrides)
    return NormalizedClaim(**data)


def base_assessment(**overrides) -> ClaimAssessment:
    data = {
        "steelman": SteelmanAssessment(charitable_strength=0.8, confidence=0.65),
        "critic": CriticAssessment(
            logical_validity=0.75,
            assumption_risk=0.4,
            counterargument_strength=0.3,
        ),
        "evidence": EvidenceAssessment(
            evidence_quality=0.2,
            evidence_relevance=0.35,
            evidence_sufficiency=0.2,
            source_reliability=0.2,
            freshness=0.2,
            missing_evidence=["No retrieval-backed source was provided."],
            fatal_flags=[],
        ),
        "context": ContextAssessment(relevance=0.8, impact=0.7, dependency_weight=0.5),
        "fallacy": FallacyAssessment(logical_consistency=0.8),
    }
    data.update(overrides)
    return ClaimAssessment(**data)


def explicit_depth_pressure_payload(
    *,
    node_id: str = "node-1",
    holes: list[ScoringHole] | None = None,
    impact: float = 0.25,
    uncertainty: float = 0.2,
    recommended_investigations: list[RecommendedInvestigation] | None = None,
) -> NodeScoringPayload:
    return NodeScoringPayload(
        node_id=node_id,
        claim=base_claim(node_id=node_id),
        scores=NodeScores(
            strength=0.6,
            uncertainty=uncertainty,
            impact=impact,
            evidence_quality=0.7,
            relevance=0.7,
            logical_validity=0.7,
            assumption_risk=0.2,
            counter_resilience=0.8,
        ),
        labels=ScoreLabels(strength_label="mixed", uncertainty_label="low", impact_label="low"),
        holes=holes or [],
        fatal_flags=[],
        score_caps=[],
        judge_disagreements=[],
        recommended_investigations=recommended_investigations or [],
        rationale=ScoreRationale(
            short="Explicit fixture for depth pressure selection.",
            why_not_higher="Fixture controls pressure signals directly.",
            why_not_lower="Fixture controls pressure signals directly.",
            weakest_link="Fixture controls pressure signals directly.",
        ),
        debug=ScoringDebug(
            reducer_version="node-scoring-reducer-v1",
            rubric_version="debateai-rubric-v1",
        ),
    )


def test_adaptive_depth_policy_accepts_only_declared_modes() -> None:
    for mode in ("fixed", "manual", "recommended", "adaptive"):
        policy = AdaptiveDepthPolicy(mode=mode)
        assert policy.mode == mode

    with pytest.raises(ValueError):
        AdaptiveDepthPolicy(mode="automatic")


def test_manual_investigation_contract_targets_specific_scored_hole_without_fake_job() -> None:
    hole = ScoringHole(
        type="missing_evidence",
        severity="high",
        description="No retrieval-backed source was provided.",
        source="evidence_auditor",
    )

    request = ManualInvestigationRequest(
        debate_id="debate-1",
        node_id="node-1",
        action="find_evidence",
        hole=hole,
        reason="User wants DebateAI to investigate this evidence gap.",
    )
    response = ManualInvestigationResponse(
        debate_id=request.debate_id,
        node_id=request.node_id,
        action=request.action,
        status="unavailable",
        reason="Manual investigation orchestration is not wired.",
    )

    assert request.model_dump(mode="json") == {
        "debate_id": "debate-1",
        "node_id": "node-1",
        "action": "find_evidence",
        "hole": {
            "type": "missing_evidence",
            "severity": "high",
            "description": "No retrieval-backed source was provided.",
            "source": "evidence_auditor",
        },
        "reason": "User wants DebateAI to investigate this evidence gap.",
    }
    assert response.model_dump(mode="json") == {
        "debate_id": "debate-1",
        "node_id": "node-1",
        "action": "find_evidence",
        "status": "unavailable",
        "job_id": None,
        "reason": "Manual investigation orchestration is not wired.",
    }

    with pytest.raises(ValueError):
        ManualInvestigationResponse(
            debate_id="debate-1",
            node_id="node-1",
            action="find_evidence",
            status="running",
        )


def test_manual_investigation_api_queues_real_node_regeneration_for_scored_hole(db) -> None:
    hole = ScoringHole(
        type="missing_evidence",
        severity="high",
        description="No retrieval-backed source was provided.",
        source="evidence_auditor",
    )
    worker = Worker(
        name="mac-mini",
        token_hash=hash_token("worker-token"),
        capabilities=["mock-local"],
        status="online",
    )
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={"max_depth": 1})
    db.add_all([worker, debate])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    node = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="PRO",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/0",
    )
    db.add(node)
    db.flush()
    debate.root_node_id = node.id
    scoring_item = explicit_depth_pressure_payload(node_id=node.id, holes=[hole]).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            status="complete",
            output={"status": "available", "items": [scoring_item]},
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/manual-investigations",
        headers=USER_HEADERS,
        json={
            "debate_id": debate.id,
            "node_id": node.id,
            "action": "find_evidence",
            "hole": hole.model_dump(mode="json"),
            "reason": "User wants DebateAI to investigate this evidence gap.",
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["debate_id"] == debate.id
    assert body["node_id"] == node.id
    assert body["action"] == "find_evidence"
    assert body["status"] == "queued"
    assert body["reason"] is None
    db.expire_all()
    job = db.get(Job, body["job_id"])
    assert job is not None
    assert job.debate_id == debate.id
    assert job.node_id == node.id
    assert job.job_type == "argue"
    assert job.required_role == "proposer"
    assert job.required_model == "mock-local"
    assert job.status == "pending"


def test_manual_investigation_api_does_not_queue_when_hole_is_not_in_scoring_payload(db) -> None:
    scored_hole = ScoringHole(
        type="missing_evidence",
        severity="high",
        description="No retrieval-backed source was provided.",
        source="evidence_auditor",
    )
    requested_hole = ScoringHole(
        type="missing_evidence",
        severity="high",
        description="A different gap.",
        source="evidence_auditor",
    )
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    node = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="PRO",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/0",
    )
    db.add(node)
    db.flush()
    debate.root_node_id = node.id
    scoring_item = explicit_depth_pressure_payload(node_id=node.id, holes=[scored_hole]).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            status="complete",
            output={"status": "available", "items": [scoring_item]},
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/manual-investigations",
        headers=USER_HEADERS,
        json={
            "debate_id": debate.id,
            "node_id": node.id,
            "action": "find_evidence",
            "hole": requested_hole.model_dump(mode="json"),
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "debate_id": debate.id,
        "node_id": node.id,
        "action": "find_evidence",
        "status": "unavailable",
        "job_id": None,
        "reason": "Requested scoring hole is not available for this node.",
    }
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []


def test_manual_investigation_api_does_not_fake_ask_user_orchestration(db) -> None:
    hole = ScoringHole(
        type="missing_evidence",
        severity="high",
        description="No retrieval-backed source was provided.",
        source="evidence_auditor",
    )
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    node = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="PRO",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/0",
    )
    db.add(node)
    db.flush()
    debate.root_node_id = node.id
    db.commit()

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/manual-investigations",
        headers=USER_HEADERS,
        json={
            "debate_id": debate.id,
            "node_id": node.id,
            "action": "ask_user",
            "hole": hole.model_dump(mode="json"),
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "debate_id": debate.id,
        "node_id": node.id,
        "action": "ask_user",
        "status": "unavailable",
        "job_id": None,
        "reason": "No existing backend orchestration path is wired for ask_user.",
    }
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []


def test_reducer_caps_empirical_strength_when_evidence_is_unverified() -> None:
    payload = reduce_assessments(base_claim(), base_assessment())

    assert payload.node_id == "node-1"
    assert payload.scores.strength <= 0.45
    assert payload.scores.evidence_quality == 0.2
    assert payload.scores.uncertainty > 0
    assert payload.judge_disagreements[0].description == "Strong charitable reading but weak evidence support."
    assert {
        "score": "strength",
        "cap_value": 0.45,
        "reason": "Empirical or causal claims with weak or unverified evidence cannot score as strong.",
        "triggered_by": "weak_evidence",
    } in [cap.model_dump() for cap in payload.score_caps]
    assert payload.labels.strength_label == "mixed"
    assert any(hole.type == "missing_evidence" for hole in payload.holes)


def test_score_caps_limit_causal_weak_evidence_strength() -> None:
    strength, impact, caps = apply_score_caps(
        claim=base_claim(claim_type="causal"),
        assessment=base_assessment(),
        strength=0.9,
        impact=0.7,
    )

    assert strength == 0.45
    assert impact == 0.7
    assert [cap.model_dump() for cap in caps] == [
        {
            "score": "strength",
            "cap_value": 0.45,
            "reason": "Empirical or causal claims with weak or unverified evidence cannot score as strong.",
            "triggered_by": "weak_evidence",
        }
    ]


def test_score_caps_limit_fatal_contradiction_strength() -> None:
    strength, impact, caps = apply_score_caps(
        claim=base_claim(),
        assessment=base_assessment(
            fallacy=FallacyAssessment(
                logical_consistency=0.2,
                fatal_flags=[
                    {
                        "type": "contradiction",
                        "severity": "high",
                        "description": "Internal contradiction.",
                    }
                ],
            )
        ),
        strength=0.9,
        impact=0.7,
    )

    assert strength == 0.25
    assert impact == 0.7
    assert {
        "score": "strength",
        "cap_value": 0.25,
        "reason": "Fatal contradiction prevents high claim strength.",
        "triggered_by": "fatal_contradiction",
    } in [cap.model_dump() for cap in caps]


def test_score_caps_limit_low_relevance_impact() -> None:
    strength, impact, caps = apply_score_caps(
        claim=base_claim(claim_type="normative"),
        assessment=base_assessment(
            context=ContextAssessment(relevance=0.2, impact=0.9, dependency_weight=0.5)
        ),
        strength=0.7,
        impact=0.9,
    )

    assert strength == 0.7
    assert impact == 0.25
    assert {
        "score": "impact",
        "cap_value": 0.25,
        "reason": "Low relevance to the root question limits impact.",
        "triggered_by": "low_relevance",
    } in [cap.model_dump() for cap in caps]


def test_reducer_payload_exposes_applied_cap_reasons() -> None:
    payload = reduce_assessments(
        base_claim(claim_type="causal"),
        base_assessment(
            context=ContextAssessment(relevance=0.2, impact=0.9, dependency_weight=0.5),
            fallacy=FallacyAssessment(
                logical_consistency=0.2,
                fatal_flags=[
                    {
                        "type": "contradiction",
                        "severity": "high",
                        "description": "Internal contradiction.",
                    }
                ],
            ),
        ),
    )

    assert payload.model_dump(mode="json")["score_caps"] == [
        {
            "score": "strength",
            "cap_value": 0.45,
            "reason": "Empirical or causal claims with weak or unverified evidence cannot score as strong.",
            "triggered_by": "weak_evidence",
        },
        {
            "score": "strength",
            "cap_value": 0.25,
            "reason": "Fatal contradiction prevents high claim strength.",
            "triggered_by": "fatal_contradiction",
        },
        {
            "score": "impact",
            "cap_value": 0.25,
            "reason": "Low relevance to the root question limits impact.",
            "triggered_by": "low_relevance",
        },
    ]


def test_reducer_applies_fatal_contradiction_cap() -> None:
    payload = reduce_assessments(
        base_claim(),
        base_assessment(
            fallacy=FallacyAssessment(
                logical_consistency=0.2,
                contradiction_flags=["The claim contradicts its own premise."],
                fatal_flags=[
                    {
                        "type": "contradiction",
                        "severity": "high",
                        "description": "Internal contradiction.",
                    }
                ],
            )
        ),
    )

    assert payload.scores.strength <= 0.25
    assert any(cap.score == "strength" and cap.cap_value == 0.25 for cap in payload.score_caps)
    assert [flag.model_dump() for flag in payload.fatal_flags] == [
        {"type": "contradiction", "severity": "high", "description": "Internal contradiction."}
    ]


def test_reducer_recommends_challenge_for_fatal_contradiction_flag() -> None:
    payload = reduce_assessments(
        base_claim(ambiguity_flags=[], evidence_refs=["stored-judge-output"]),
        base_assessment(
            evidence=EvidenceAssessment(
                evidence_quality=0.75,
                evidence_relevance=0.75,
                evidence_sufficiency=0.75,
                source_reliability=0.75,
                freshness=0.75,
            ),
            fallacy=FallacyAssessment(
                logical_consistency=0.2,
                fatal_flags=[
                    {
                        "type": "contradiction",
                        "severity": "high",
                        "description": "Internal contradiction.",
                    }
                ],
            ),
        ),
    )

    assert [item.model_dump() for item in payload.recommended_investigations] == [
        {
            "action": "challenge",
            "reason": "Fatal contradiction should be challenged before relying on the claim.",
            "priority": 1,
            "target_node_id": "node-1",
        }
    ]


def test_reducer_prioritizes_recommendations_from_risk_signals() -> None:
    payload = reduce_assessments(
        base_claim(
            ambiguity_flags=["scope is vague", "timeframe is unclear", "population is unclear"],
            evidence_refs=[],
        ),
        base_assessment(
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.8,
                counterargument_strength=0.75,
            ),
            evidence=EvidenceAssessment(
                evidence_quality=0.75,
                evidence_relevance=0.75,
                evidence_sufficiency=0.75,
                source_reliability=0.75,
                freshness=0.75,
            ),
            context=ContextAssessment(
                relevance=0.85,
                impact=0.9,
                dependency_weight=0.5,
                relation_to_root="attacks",
            ),
        ),
    )

    assert [item.model_dump() for item in payload.recommended_investigations] == [
        {
            "action": "challenge",
            "reason": "Judges disagree on the claim's strength, impact, or support.",
            "priority": 1,
            "target_node_id": "node-1",
        },
        {
            "action": "ask_user",
            "reason": "The claim needs a narrower scope before it can be judged confidently.",
            "priority": 2,
            "target_node_id": "node-1",
        },
    ]


def test_reducer_sorts_recommendations_by_priority_then_action() -> None:
    payload = reduce_assessments(
        base_claim(
            ambiguity_flags=["scope is vague"],
            evidence_refs=[],
        ),
        base_assessment(
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.8,
                counterargument_strength=0.75,
            ),
            evidence=EvidenceAssessment(
                evidence_quality=0.75,
                evidence_relevance=0.75,
                evidence_sufficiency=0.75,
                source_reliability=0.75,
                freshness=0.75,
                missing_evidence=["No retrieval-backed source was provided."],
            ),
            context=ContextAssessment(
                relevance=0.85,
                impact=0.9,
                dependency_weight=0.5,
                relation_to_root="attacks",
            ),
        ),
    )

    assert [
        (item.priority, item.action, item.reason)
        for item in payload.recommended_investigations
    ] == [
        (1, "challenge", "Judges disagree on the claim's strength, impact, or support."),
        (2, "find_evidence", "Evidence support is weak or unverified."),
        (3, "ask_user", "The claim needs a narrower scope before it can be judged confidently."),
    ]


def test_depth_pressure_selector_combines_holes_impact_uncertainty_and_unanswered_attacks() -> None:
    high_pressure_payload = reduce_assessments(
        base_claim(
            ambiguity_flags=["scope is vague", "timeframe is unclear"],
            evidence_refs=[],
        ),
        base_assessment(
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.8,
                counterargument_strength=0.75,
            ),
            context=ContextAssessment(
                relevance=0.85,
                impact=0.9,
                dependency_weight=0.5,
                relation_to_root="attacks",
            ),
        ),
    )
    low_pressure_payload = reduce_assessments(
        base_claim(ambiguity_flags=[], evidence_refs=["stored-judge-output"]),
        base_assessment(
            critic=CriticAssessment(
                logical_validity=0.85,
                assumption_risk=0.1,
                counterargument_strength=0.2,
            ),
            evidence=EvidenceAssessment(
                evidence_quality=0.75,
                evidence_relevance=0.75,
                evidence_sufficiency=0.75,
                source_reliability=0.75,
                freshness=0.75,
            ),
            context=ContextAssessment(relevance=0.75, impact=0.35, dependency_weight=0.5),
        ),
    )

    high_pressure = select_depth_pressure(high_pressure_payload)
    low_pressure = select_depth_pressure(low_pressure_payload)

    assert high_pressure.model_dump(mode="json") == {
        "node_id": "node-1",
        "pressure": "high",
        "score": 1.0,
        "reasons": [
            "high_severity_holes",
            "high_impact",
            "high_uncertainty",
            "unanswered_attack",
        ],
    }
    assert low_pressure.model_dump(mode="json") == {
        "node_id": "node-1",
        "pressure": "low",
        "score": 0.0,
        "reasons": [],
    }


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (
            explicit_depth_pressure_payload(node_id="low-node"),
            {
                "node_id": "low-node",
                "pressure": "low",
                "score": 0.0,
                "reasons": [],
            },
        ),
        (
            explicit_depth_pressure_payload(
                node_id="medium-node",
                holes=[
                    ScoringHole(
                        type="missing_evidence",
                        severity="high",
                        description="No source verifies the core premise.",
                        source="evidence_auditor",
                    )
                ],
                impact=0.75,
            ),
            {
                "node_id": "medium-node",
                "pressure": "medium",
                "score": 0.5,
                "reasons": ["high_severity_holes", "high_impact"],
            },
        ),
        (
            explicit_depth_pressure_payload(
                node_id="high-node",
                holes=[
                    ScoringHole(
                        type="assumption_risk",
                        severity="high",
                        description="The argument depends on an unstated adoption assumption.",
                        source="critic",
                    )
                ],
                impact=0.75,
                uncertainty=0.5,
            ),
            {
                "node_id": "high-node",
                "pressure": "high",
                "score": 0.75,
                "reasons": ["high_severity_holes", "high_impact", "high_uncertainty"],
            },
        ),
    ],
)
def test_depth_pressure_selector_labels_explicit_fixture_pressure_levels(
    payload: NodeScoringPayload,
    expected: dict,
) -> None:
    assert select_depth_pressure(payload).model_dump(mode="json") == expected


def test_depth_pressure_selector_uses_stable_reason_order_from_explicit_fixture() -> None:
    payload = explicit_depth_pressure_payload(
        node_id="ordered-node",
        holes=[
            ScoringHole(
                type="ambiguity",
                severity="medium",
                description="Medium holes do not count as high severity pressure.",
                source="claim_normalizer",
            )
        ],
        impact=0.75,
        uncertainty=0.5,
        recommended_investigations=[
            RecommendedInvestigation(
                action="find_evidence",
                reason="Finding evidence alone is not an unanswered attack.",
                priority=1,
                target_node_id="ordered-node",
            ),
            RecommendedInvestigation(
                action="challenge",
                reason="A priority-one challenge marks an unanswered attack.",
                priority=1,
                target_node_id="ordered-node",
            ),
        ],
    )

    first = select_depth_pressure(payload)
    second = select_depth_pressure(payload)

    assert first.model_dump(mode="json") == {
        "node_id": "ordered-node",
        "pressure": "high",
        "score": 0.75,
        "reasons": ["high_impact", "high_uncertainty", "unanswered_attack"],
    }
    assert second.model_dump(mode="json") == first.model_dump(mode="json")


def test_adaptive_depth_dry_run_plans_expansions_from_scoring_payloads_without_generation() -> None:
    low_payload = explicit_depth_pressure_payload(node_id="low-node")
    medium_payload = explicit_depth_pressure_payload(
        node_id="medium-node",
        holes=[
            ScoringHole(
                type="missing_evidence",
                severity="high",
                description="No source verifies the core premise.",
                source="evidence_auditor",
            )
        ],
        impact=0.75,
        recommended_investigations=[
            RecommendedInvestigation(
                action="find_evidence",
                reason="Evidence support is weak or unverified.",
                priority=2,
                target_node_id="medium-node",
            )
        ],
    )
    high_payload = explicit_depth_pressure_payload(
        node_id="high-node",
        holes=[
            ScoringHole(
                type="assumption_risk",
                severity="high",
                description="The argument depends on an unstated adoption assumption.",
                source="critic",
            )
        ],
        impact=0.75,
        uncertainty=0.5,
        recommended_investigations=[
            RecommendedInvestigation(
                action="challenge",
                reason="A priority-one challenge marks an unanswered attack.",
                priority=1,
                target_node_id="high-node",
            )
        ],
    )

    plan = adaptive_depth_dry_run(
        [low_payload, medium_payload, high_payload],
        policy=AdaptiveDepthPolicy(mode="adaptive"),
    )

    assert plan.model_dump(mode="json") == {
        "policy": {"mode": "adaptive", "target_depth": None, "reason": None},
        "candidate_count": 3,
        "expansion_count": 2,
        "items": [
            {
                "node_id": "high-node",
                "pressure": "high",
                "score": 1.0,
                "recommended_action": "challenge",
                "expansion_hint": "expand",
                "reasons": [
                    "high_severity_holes",
                    "high_impact",
                    "high_uncertainty",
                    "unanswered_attack",
                ],
                "hole_count": 1,
                "recommended_investigation_count": 1,
            },
            {
                "node_id": "medium-node",
                "pressure": "medium",
                "score": 0.5,
                "recommended_action": "find_evidence",
                "expansion_hint": "review_for_expansion",
                "reasons": ["high_severity_holes", "high_impact"],
                "hole_count": 1,
                "recommended_investigation_count": 1,
            },
        ],
    }


def test_record_approved_adaptive_expansion_writes_audit_without_runtime_expansion(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    contested = Node(
        id="contested-node",
        debate=debate,
        parent=root,
        node_type="attack",
        depth=1,
        position=0,
        claim="Remote work weakens collaboration.",
        status="complete",
        materialized_path="/0001",
    )
    evidence_gap = Node(
        id="evidence-gap-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=1,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0002",
    )
    db.add_all([debate, root, contested, evidence_gap])
    db.commit()
    selected_items = [
        explicit_depth_pressure_payload(
            node_id=contested.id,
            holes=[
                ScoringHole(
                    type="assumption_risk",
                    severity="high",
                    description="The argument depends on an unstated adoption assumption.",
                    source="critic",
                )
            ],
            impact=0.75,
            uncertainty=0.5,
            recommended_investigations=[
                RecommendedInvestigation(
                    action="challenge",
                    reason="A priority-one challenge marks an unanswered attack.",
                    priority=1,
                    target_node_id=contested.id,
                )
            ],
        ),
        explicit_depth_pressure_payload(
            node_id=evidence_gap.id,
            holes=[
                ScoringHole(
                    type="missing_evidence",
                    severity="high",
                    description="No source verifies the core premise.",
                    source="evidence_auditor",
                )
            ],
            impact=0.75,
            recommended_investigations=[
                RecommendedInvestigation(
                    action="find_evidence",
                    reason="Evidence support is weak or unverified.",
                    priority=2,
                    target_node_id=evidence_gap.id,
                )
            ],
        ),
    ]
    plan = adaptive_depth_dry_run(selected_items, policy=AdaptiveDepthPolicy(mode="adaptive"))

    record = record_approved_adaptive_expansion(
        db,
        debate,
        plan.items,
        approval_reason="Reviewer approved adaptive expansion from dry-run diagnostics.",
    )

    records = db.scalars(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.debate_id == debate.id, ProvenanceRecord.artifact_kind == "adaptive_expansion")
        .order_by(ProvenanceRecord.created_at.asc(), ProvenanceRecord.id.asc())
    ).all()
    assert records == [record]
    assert record.branch_id is None
    assert record.model_id == ""
    assert record.worker_id == ""
    assert record.prompt_id == ""
    assert record.job_id is None
    assert record.metadata_json == {
        "event": "approved",
        "status": "approved",
        "source": "adaptive_depth",
        "approval_reason": "Reviewer approved adaptive expansion from dry-run diagnostics.",
        "selected_node_ids": [contested.id, evidence_gap.id],
        "selected_node_count": 2,
        "reason_summaries": [
            {
                "node_id": contested.id,
                "pressure": "high",
                "score": 1.0,
                "recommended_action": "challenge",
                "expansion_hint": "expand",
                "reasons": [
                    "high_severity_holes",
                    "high_impact",
                    "high_uncertainty",
                    "unanswered_attack",
                ],
                "hole_count": 1,
                "recommended_investigation_count": 1,
            },
            {
                "node_id": evidence_gap.id,
                "pressure": "medium",
                "score": 0.5,
                "recommended_action": "find_evidence",
                "expansion_hint": "review_for_expansion",
                "reasons": ["high_severity_holes", "high_impact"],
                "hole_count": 1,
                "recommended_investigation_count": 1,
            },
        ],
    }
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []
    assert [
        node.id
        for node in db.scalars(select(Node).where(Node.debate_id == debate.id).order_by(Node.id.asc())).all()
    ] == [
        contested.id,
        evidence_gap.id,
        root.id,
    ]


def test_reducer_applies_low_relevance_impact_cap_and_precise_uncertainty() -> None:
    payload = reduce_assessments(
        base_claim(ambiguity_flags=["scope is vague"]),
        base_assessment(context=ContextAssessment(relevance=0.2, impact=0.9, dependency_weight=0.5)),
    )

    assert payload.scores.impact == 0.25
    assert payload.scores.uncertainty == pytest.approx(0.64)
    assert any(cap.score == "impact" and cap.cap_value == 0.25 for cap in payload.score_caps)


def test_reducer_payload_surfaces_disagreements_not_averaged_away() -> None:
    payload = reduce_assessments(
        base_claim(),
        base_assessment(
            steelman=SteelmanAssessment(charitable_strength=0.9, confidence=0.8),
            evidence=EvidenceAssessment(
                evidence_quality=0.2,
                evidence_relevance=0.25,
                evidence_sufficiency=0.2,
                source_reliability=0.2,
                freshness=0.2,
            ),
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.8,
                counterargument_strength=0.7,
            ),
            context=ContextAssessment(relevance=0.85, impact=0.85, dependency_weight=0.6),
        ),
    )

    assert payload.model_dump(mode="json")["judge_disagreements"] == [
        {
            "judges": ["steelman", "evidence_auditor"],
            "type": "steelman_evidence_tension",
            "severity": "high",
            "description": "Strong charitable reading but weak evidence support.",
        },
        {
            "judges": ["context_judge", "critic"],
            "type": "impact_assumption_tension",
            "severity": "high",
            "description": "High impact claim carries high assumption risk.",
        },
    ]
    assert payload.scores.uncertainty > 0


def test_reducer_composes_minimal_scores_deterministically() -> None:
    claim = base_claim(
        claim_type="normative",
        ambiguity_flags=[],
        evidence_refs=["stored-judge-output"],
    )
    assessment = base_assessment(
        critic=CriticAssessment(
            logical_validity=0.8,
            assumption_risk=0.1,
            counterargument_strength=0.2,
        ),
        evidence=EvidenceAssessment(
            evidence_quality=0.6,
            evidence_relevance=0.6,
            evidence_sufficiency=0.6,
            source_reliability=0.6,
            freshness=0.6,
        ),
        context=ContextAssessment(relevance=0.7, impact=0.65, dependency_weight=0.5),
    )

    first = reduce_assessments(claim, assessment)
    second = reduce_assessments(claim, assessment)

    assert first.model_dump(mode="json") == second.model_dump(mode="json")
    assert first.scores.model_dump() == {
        "strength": 0.745,
        "uncertainty": 0.2,
        "impact": 0.65,
        "evidence_quality": 0.6,
        "relevance": 0.7,
        "logical_validity": 0.8,
        "assumption_risk": 0.1,
        "counter_resilience": 0.8,
    }
    assert first.score_caps == []
    assert first.judge_disagreements == []
    assert first.model_dump(mode="json")["score_provenance"] == {
        "raw_judge_output_kind": "claim_assessment",
        "raw_judge_output_included": False,
        "final_score_source": "deterministic_reducer",
        "reducer_version": "node-scoring-reducer-v1",
        "rubric_version": "debateai-rubric-v1",
    }


def test_reducer_increases_uncertainty_when_evidence_refs_are_missing() -> None:
    assessment = base_assessment(
        critic=CriticAssessment(
            logical_validity=0.8,
            assumption_risk=0.1,
            counterargument_strength=0.2,
        ),
        evidence=EvidenceAssessment(
            evidence_quality=0.6,
            evidence_relevance=0.6,
            evidence_sufficiency=0.6,
            source_reliability=0.6,
            freshness=0.6,
        ),
        context=ContextAssessment(relevance=0.7, impact=0.65, dependency_weight=0.5),
    )

    supported = reduce_assessments(
        base_claim(
            claim_type="normative",
            ambiguity_flags=[],
            evidence_refs=["stored-judge-output"],
        ),
        assessment,
    )
    missing = reduce_assessments(
        base_claim(
            claim_type="normative",
            ambiguity_flags=[],
            evidence_refs=[],
        ),
        assessment,
    )

    assert supported.scores.uncertainty == pytest.approx(0.2)
    assert missing.scores.uncertainty == pytest.approx(0.3)
    assert missing.scores.uncertainty > supported.scores.uncertainty
    assert missing.score_caps == []
    assert missing.judge_disagreements == []


def test_reducer_increases_uncertainty_for_vague_scope_flags() -> None:
    assessment = base_assessment(
        critic=CriticAssessment(
            logical_validity=0.8,
            assumption_risk=0.1,
            counterargument_strength=0.2,
        ),
        evidence=EvidenceAssessment(
            evidence_quality=0.6,
            evidence_relevance=0.6,
            evidence_sufficiency=0.6,
            source_reliability=0.6,
            freshness=0.6,
        ),
        context=ContextAssessment(relevance=0.7, impact=0.65, dependency_weight=0.5),
    )

    precise = reduce_assessments(
        base_claim(
            claim_type="normative",
            ambiguity_flags=[],
            evidence_refs=["stored-judge-output"],
        ),
        assessment,
    )
    vague = reduce_assessments(
        base_claim(
            claim_type="normative",
            ambiguity_flags=["scope is vague", "timeframe is unspecified"],
            evidence_refs=["stored-judge-output"],
        ),
        assessment,
    )

    assert precise.scores.uncertainty == pytest.approx(0.2)
    assert vague.scores.uncertainty == pytest.approx(0.36)
    assert vague.scores.uncertainty > precise.scores.uncertainty
    assert [hole.type for hole in vague.holes] == ["ambiguity", "ambiguity"]
    assert vague.score_caps == []
    assert vague.judge_disagreements == []


def test_reducer_public_rationale_does_not_expose_mock_language() -> None:
    payload = reduce_assessments(
        base_claim(ambiguity_flags=[], evidence_refs=["stored-judge-output"]),
        base_assessment(
            evidence=EvidenceAssessment(
                evidence_quality=0.75,
                evidence_relevance=0.75,
                evidence_sufficiency=0.75,
                source_reliability=0.75,
                freshness=0.75,
            )
        ),
    )

    assert "mock" not in payload.rationale.weakest_link.lower()
    assert "mock" not in payload.rationale.why_not_higher.lower()


def test_disagreement_detection_surfaces_high_steelman_weak_evidence_tension() -> None:
    disagreements = detect_disagreements(
        base_assessment(
            steelman=SteelmanAssessment(charitable_strength=0.9, confidence=0.8),
            evidence=EvidenceAssessment(
                evidence_quality=0.2,
                evidence_relevance=0.25,
                evidence_sufficiency=0.2,
                source_reliability=0.2,
                freshness=0.2,
            ),
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.2,
                counterargument_strength=0.3,
            ),
            context=ContextAssessment(relevance=0.85, impact=0.4, dependency_weight=0.6),
        )
    )

    assert [item.model_dump() for item in disagreements] == [
        {
            "judges": ["steelman", "evidence_auditor"],
            "type": "steelman_evidence_tension",
            "severity": "high",
            "description": "Strong charitable reading but weak evidence support.",
        }
    ]


def test_disagreement_detection_surfaces_high_impact_assumption_risk_tension() -> None:
    disagreements = detect_disagreements(
        base_assessment(
            steelman=SteelmanAssessment(charitable_strength=0.6, confidence=0.8),
            evidence=EvidenceAssessment(
                evidence_quality=0.6,
                evidence_relevance=0.6,
                evidence_sufficiency=0.6,
                source_reliability=0.6,
                freshness=0.6,
            ),
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.8,
                counterargument_strength=0.7,
            ),
            context=ContextAssessment(relevance=0.85, impact=0.85, dependency_weight=0.6),
        )
    )

    assert [item.model_dump() for item in disagreements] == [
        {
            "judges": ["context_judge", "critic"],
            "type": "impact_assumption_tension",
            "severity": "high",
            "description": "High impact claim carries high assumption risk.",
        }
    ]


def test_disagreement_detection_surfaces_tensions_between_judges() -> None:
    disagreements = detect_disagreements(
        base_assessment(
            steelman=SteelmanAssessment(charitable_strength=0.9, confidence=0.8),
            evidence=EvidenceAssessment(
                evidence_quality=0.2,
                evidence_relevance=0.25,
                evidence_sufficiency=0.2,
                source_reliability=0.2,
                freshness=0.2,
            ),
            critic=CriticAssessment(
                logical_validity=0.7,
                assumption_risk=0.8,
                counterargument_strength=0.7,
            ),
            context=ContextAssessment(relevance=0.85, impact=0.85, dependency_weight=0.6),
        )
    )

    assert [item.description for item in disagreements] == [
        "Strong charitable reading but weak evidence support.",
        "High impact claim carries high assumption risk.",
    ]
    assert all(item.severity == "high" for item in disagreements)


def test_disagreement_detection_surfaces_strong_evidence_low_relevance_tension() -> None:
    disagreements = detect_disagreements(
        base_assessment(
            evidence=EvidenceAssessment(
                evidence_quality=0.8,
                evidence_relevance=0.8,
                evidence_sufficiency=0.8,
                source_reliability=0.8,
                freshness=0.8,
            ),
            context=ContextAssessment(relevance=0.25, impact=0.4, dependency_weight=0.5),
        )
    )

    assert [item.model_dump() for item in disagreements] == [
        {
            "judges": ["evidence_auditor", "context_judge"],
            "type": "evidence_context_tension",
            "severity": "medium",
            "description": "Evidence appears strong but relevance to the debate is low.",
        }
    ]


def test_scoring_status_model_accepts_only_public_status_values() -> None:
    for status in ("available", "partial", "unavailable"):
        assert ScoringStatusModel(status=status).status == status

    with pytest.raises(ValueError):
        ScoringStatusModel(status="complete")


def test_scoring_job_status_model_accepts_only_run_status_values() -> None:
    for status in ("queued", "running", "complete", "failed"):
        assert ScoringJobStatusModel(status=status).status == status

    for invalid_status in ("available", "partial", "unavailable", "pending"):
        with pytest.raises(ValueError):
            ScoringJobStatusModel(status=invalid_status)


def test_queue_scoring_job_uses_existing_background_job_system(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    db.add(debate)
    db.flush()

    job = queue_scoring_job(db, debate, model_id="codex-gpt-5.5")

    persisted = db.get(Job, job.id)
    assert persisted is not None
    assert persisted.job_type == "score_debate"
    assert persisted.required_role == "judge"
    assert persisted.required_model == "codex-gpt-5.5"
    assert persisted.debate_id == debate.id
    assert persisted.node_id is None
    assert persisted.status == "pending"
    assert persisted.deadline is not None
    assert db.scalars(select(AnalyzerRun).where(AnalyzerRun.debate_id == debate.id)).all() == []
    assert db.scalars(select(NodeScoringResult).where(NodeScoringResult.debate_id == debate.id)).all() == []
    assert get_debate_scoring(db, debate.id)["status"] == "unavailable"


def test_claim_type_model_accepts_unknown_claim_type() -> None:
    assert ClaimTypeModel(claim_type="unknown").claim_type == "unknown"
    assert base_claim(claim_type="unknown").claim_type == "unknown"


def test_scoring_hole_model_round_trips_source() -> None:
    hole = ScoringHole(
        type="missing_evidence",
        severity="high",
        description="No retrieval-backed source was provided.",
        source="evidence_auditor",
    )

    assert hole.model_dump() == {
        "type": "missing_evidence",
        "severity": "high",
        "description": "No retrieval-backed source was provided.",
        "source": "evidence_auditor",
    }


def test_fatal_flag_model_round_trips_type_severity_description() -> None:
    flag = FatalFlag(
        type="contradiction",
        severity="high",
        description="Internal contradiction.",
    )

    assert flag.model_dump() == {
        "type": "contradiction",
        "severity": "high",
        "description": "Internal contradiction.",
    }


def test_recommended_investigation_model_round_trips_target_node_id() -> None:
    recommendation = RecommendedInvestigation(
        action="find_evidence",
        reason="Evidence support is weak or unverified.",
        priority=1,
        target_node_id="node-1",
    )

    assert recommendation.model_dump() == {
        "action": "find_evidence",
        "reason": "Evidence support is weak or unverified.",
        "priority": 1,
        "target_node_id": "node-1",
    }


def test_score_cap_model_round_trips_cap_value_and_trigger() -> None:
    cap = ScoreCap(
        score="strength",
        cap_value=0.45,
        reason="Empirical or causal claims with weak or unverified evidence cannot score as strong.",
        triggered_by="weak_evidence",
    )

    assert cap.model_dump() == {
        "score": "strength",
        "cap_value": 0.45,
        "reason": "Empirical or causal claims with weak or unverified evidence cannot score as strong.",
        "triggered_by": "weak_evidence",
    }


def test_judge_disagreement_model_round_trips_type_and_description() -> None:
    disagreement = JudgeDisagreement(
        judges=["steelman", "evidence_auditor"],
        type="steelman_evidence_tension",
        severity="high",
        description="Strong charitable reading but weak evidence support.",
    )

    assert disagreement.model_dump() == {
        "judges": ["steelman", "evidence_auditor"],
        "type": "steelman_evidence_tension",
        "severity": "high",
        "description": "Strong charitable reading but weak evidence support.",
    }


def test_node_scores_model_round_trips_all_score_fields() -> None:
    scores = NodeScores(
        strength=0.45,
        uncertainty=0.64,
        impact=0.25,
        evidence_quality=0.2,
        relevance=0.8,
        logical_validity=0.75,
        assumption_risk=0.4,
        counter_resilience=0.7,
    )

    assert scores.model_dump() == {
        "strength": 0.45,
        "uncertainty": 0.64,
        "impact": 0.25,
        "evidence_quality": 0.2,
        "relevance": 0.8,
        "logical_validity": 0.75,
        "assumption_risk": 0.4,
        "counter_resilience": 0.7,
    }


def test_debate_scoring_response_model_serializes_json_contract() -> None:
    response = DebateScoringResponse(
        debate_id="debate-1",
        status="unavailable",
        generated_at=None,
        node_ids=["node-1"],
        items=[],
        reason="No scoring judge outputs are available for this debate.",
        model_metadata=ScoringModelMetadata(
            provider="codex",
            model="gpt-5.4",
            checked_at="2026-06-18T10:15:30+00:00",
            status="unavailable",
        ),
    )

    assert response.model_dump(mode="json") == {
        "debate_id": "debate-1",
        "status": "unavailable",
        "generated_at": None,
        "node_ids": ["node-1"],
        "items": [],
        "errors": None,
        "max_nodes": None,
        "scored_node_count": None,
        "skipped_node_count": None,
        "truncated": None,
        "reason": "No scoring judge outputs are available for this debate.",
        "producer": None,
        "model_metadata": {
            "provider": "codex",
            "model": "gpt-5.4",
            "checked_at": "2026-06-18T10:15:30+00:00",
            "status": "unavailable",
        },
        "cache": None,
        "active_scoring_job_id": None,
        "active_scoring_job_status": None,
    }


def test_debate_scoring_response_model_serializes_partial_errors() -> None:
    response = DebateScoringResponse(
        debate_id="debate-1",
        status="partial",
        node_ids=["node-1", "node-2"],
        items=[],
        errors=[
            NodeScoringError(
                node_id="node-2",
                status="unavailable",
                reason="Scoring judge call timed out.",
            )
        ],
    )

    assert response.model_dump(mode="json") == {
        "debate_id": "debate-1",
        "status": "partial",
        "node_ids": ["node-1", "node-2"],
        "items": [],
        "errors": [
            {
                "node_id": "node-2",
                "status": "unavailable",
                "reason": "Scoring judge call timed out.",
            }
        ],
        "max_nodes": None,
        "scored_node_count": None,
        "skipped_node_count": None,
        "truncated": None,
        "generated_at": None,
        "reason": None,
        "producer": None,
        "model_metadata": None,
        "cache": None,
        "active_scoring_job_id": None,
        "active_scoring_job_status": None,
    }


def test_judge_strategy_protocol_exports_assessment_contract() -> None:
    hints = get_type_hints(JudgeStrategy.assess)

    assert hints["claim"] is NormalizedClaim
    assert "return" in hints


def test_scoring_provider_protocol_exports_raw_judge_contract() -> None:
    hints = get_type_hints(ScoringProvider.judge_node)

    assert hints["request"] is ScoringProviderRequest
    assert hints["return"] is ScoringProviderResult


def test_scoring_provider_result_cannot_pretend_to_be_node_score() -> None:
    request = ScoringProviderRequest(
        claim=base_claim(node_id="node-1"),
        argument_text="Detailed generated argument text.",
        judge_role="critic",
    )
    result = ScoringProviderResult(
        provider="codex",
        model="gpt-5.4",
        raw_output='{"score": 0.7}',
        latency_ms=120,
        checked_at="2026-06-18T10:15:30+00:00",
    )

    assert request.model_dump(mode="json") == {
        "claim": base_claim(node_id="node-1").model_dump(mode="json"),
        "argument_text": "Detailed generated argument text.",
        "judge_role": "critic",
        "prompt_version": "scoring-provider-v1",
        "timeout_seconds": 30,
        "metadata": {},
    }
    assert result.model_dump(mode="json") == {
        "provider": "codex",
        "model": "gpt-5.4",
        "raw_output": '{"score": 0.7}',
        "latency_ms": 120,
        "checked_at": "2026-06-18T10:15:30+00:00",
        "metadata": {},
    }
    assert "scores" not in result.model_dump()
    assert "items" not in result.model_dump()


def test_single_node_judge_prompt_uses_real_node_input_and_no_fake_evidence() -> None:
    request = ScoringProviderRequest(
        claim=base_claim(
            node_id="node-1",
            raw_text="Remote work improves retention.",
            core_claim="Remote work improves employee retention.",
            evidence_refs=["internal-survey-2026"],
        ),
        argument_text="Employees are less likely to leave when commutes are removed.",
        judge_role="evidence_auditor",
    )

    messages = render_single_node_judge_prompt(request)

    assert [message["role"] for message in messages] == ["system", "user"]
    assert "Return only valid JSON" in messages[0]["content"]
    assert "Never invent evidence" in messages[0]["content"]
    assert "NodeScoringPayload" not in messages[0]["content"]
    assert "node-1" in messages[1]["content"]
    assert "Remote work improves employee retention." in messages[1]["content"]
    assert "Employees are less likely to leave" in messages[1]["content"]
    assert "internal-survey-2026" in messages[1]["content"]
    assert '"judge_role": "evidence_auditor"' in messages[1]["content"]


def test_single_node_judge_prompt_contract_includes_json_schema_expectations() -> None:
    messages = render_single_node_judge_prompt(
        ScoringProviderRequest(
            claim=base_claim(node_id="node-1", evidence_refs=[]),
            argument_text=None,
            judge_role="critic",
        )
    )

    payload = json.loads(messages[1]["content"])

    assert payload["instructions"]["output"] == "structured judge assessment JSON only"
    assert payload["instructions"]["schema"] == ClaimAssessment.model_json_schema()
    assert "score" not in payload["instructions"]["schema"]["properties"]
    assert set(payload["instructions"]["schema"]["properties"]) == {
        "steelman",
        "critic",
        "evidence",
        "context",
        "fallacy",
    }
    assert "Never invent evidence" in messages[0]["content"]


def test_parse_judge_json_returns_assessment_for_valid_structured_output() -> None:
    result = parse_judge_json(json.dumps(base_assessment().model_dump(mode="json")))

    assert result.status == "available"
    assert result.assessment == base_assessment()
    assert result.reason is None


def test_parse_judge_json_returns_unavailable_for_invalid_json() -> None:
    result = parse_judge_json("not json")

    assert result.status == "unavailable"
    assert result.assessment is None
    assert result.reason == "Judge output was not valid JSON."


def test_parse_judge_json_returns_unavailable_for_malformed_schema() -> None:
    result = parse_judge_json(json.dumps({"score": "high", "findings": "unsupported"}))

    assert result.status == "unavailable"
    assert result.assessment is None
    assert result.reason == "Judge output did not match the scoring schema."


def test_judge_assessment_base_model_serializes_common_fields() -> None:
    assessment = JudgeAssessment(
        score=0.7,
        confidence=0.6,
        findings=["The claim is plausible but underspecified."],
        fatal_flags=[
            {
                "type": "contradiction",
                "severity": "high",
                "description": "Internal contradiction.",
            }
        ],
        recommended_investigations=["Find direct evidence."],
    )

    assert assessment.model_dump() == {
        "score": 0.7,
        "confidence": 0.6,
        "findings": ["The claim is plausible but underspecified."],
        "fatal_flags": [
            {
                "type": "contradiction",
                "severity": "high",
                "description": "Internal contradiction.",
            }
        ],
        "recommended_investigations": ["Find direct evidence."],
    }


def test_evidence_assessment_model_serializes_missing_support_status() -> None:
    assessment = EvidenceAssessment(
        evidence_quality=0.0,
        evidence_relevance=0.0,
        evidence_sufficiency=0.0,
        source_reliability=0.0,
        freshness=0.0,
        support_status="missing",
        missing_evidence=["No retrieval-backed source was provided."],
        fatal_flags=[],
        recommended_investigations=["Find retrieval-backed evidence."],
    )

    assert assessment.model_dump() == {
        "evidence_quality": 0.0,
        "evidence_relevance": 0.0,
        "evidence_sufficiency": 0.0,
        "source_reliability": 0.0,
        "freshness": 0.0,
        "support_status": "missing",
        "missing_evidence": ["No retrieval-backed source was provided."],
        "fatal_flags": [],
        "recommended_investigations": ["Find retrieval-backed evidence."],
    }


def test_evidence_support_status_contract_uses_explicit_domain_states() -> None:
    assert EvidenceSupportStatus.__args__ == (
        "grounded",
        "missing",
        "unavailable",
        "refuted",
        "contradicted",
        "retracted",
        "no_info",
    )


def test_consistency_assessment_model_serializes_fallacy_fields() -> None:
    assessment = ConsistencyAssessment(
        logical_consistency=0.75,
        detected_fallacies=["equivocation"],
        contradiction_flags=["Term meaning shifts between premises."],
        fatal_flags=[
            {
                "type": "contradiction",
                "severity": "high",
                "description": "Internal contradiction.",
            }
        ],
    )

    assert assessment.model_dump() == {
        "logical_consistency": 0.75,
        "detected_fallacies": ["equivocation"],
        "contradiction_flags": ["Term meaning shifts between premises."],
        "fatal_flags": [
            {
                "type": "contradiction",
                "severity": "high",
                "description": "Internal contradiction.",
            }
        ],
    }


def test_all_judge_output_models_serialize_contracts() -> None:
    outputs = {
        "steelman": SteelmanAssessment(
            charitable_strength=0.8,
            confidence=0.7,
            improved_claim="Remote work can improve productivity with clear coordination practices.",
            strongest_points=["Reduced commute time."],
            required_assumptions=["Productivity is measured consistently."],
            recommended_investigations=["Compare longitudinal productivity studies."],
        ),
        "critic": CriticAssessment(
            logical_validity=0.75,
            assumption_risk=0.4,
            counterargument_strength=0.3,
            findings=["Scope is broad."],
            fatal_flags=[],
            recommended_investigations=["Probe hidden assumptions."],
        ),
        "evidence": EvidenceAssessment(
            evidence_quality=0.0,
            evidence_relevance=0.0,
            evidence_sufficiency=0.0,
            source_reliability=0.0,
            freshness=0.0,
            support_status="missing",
            missing_evidence=["No retrieval-backed source was provided."],
            fatal_flags=[],
            recommended_investigations=["Find retrieval-backed evidence."],
        ),
        "context": ContextAssessment(
            relevance=0.8,
            impact=0.7,
            dependency_weight=0.5,
            relation_to_root="supports",
            why_it_matters="It affects the root claim.",
        ),
        "consistency": ConsistencyAssessment(
            logical_consistency=0.75,
            detected_fallacies=["equivocation"],
            contradiction_flags=[],
            fatal_flags=[],
        ),
    }

    assert {name: output.model_dump(mode="json") for name, output in outputs.items()} == {
        "steelman": {
            "charitable_strength": 0.8,
            "confidence": 0.7,
            "improved_claim": "Remote work can improve productivity with clear coordination practices.",
            "strongest_points": ["Reduced commute time."],
            "required_assumptions": ["Productivity is measured consistently."],
            "recommended_investigations": ["Compare longitudinal productivity studies."],
        },
        "critic": {
            "logical_validity": 0.75,
            "assumption_risk": 0.4,
            "counterargument_strength": 0.3,
            "findings": ["Scope is broad."],
            "fatal_flags": [],
            "recommended_investigations": ["Probe hidden assumptions."],
        },
        "evidence": {
            "evidence_quality": 0.0,
            "evidence_relevance": 0.0,
            "evidence_sufficiency": 0.0,
            "source_reliability": 0.0,
            "freshness": 0.0,
            "support_status": "missing",
            "missing_evidence": ["No retrieval-backed source was provided."],
            "fatal_flags": [],
            "recommended_investigations": ["Find retrieval-backed evidence."],
        },
        "context": {
            "relevance": 0.8,
            "impact": 0.7,
            "dependency_weight": 0.5,
            "relation_to_root": "supports",
            "why_it_matters": "It affects the root claim.",
        },
        "consistency": {
            "logical_consistency": 0.75,
            "detected_fallacies": ["equivocation"],
            "contradiction_flags": [],
            "fatal_flags": [],
        },
    }


def test_claim_normalizer_preserves_actual_text_as_core_claim() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="  Remote work improves productivity.  ")

    assert claim.node_id == "node-1"
    assert claim.raw_text == "  Remote work improves productivity.  "
    assert claim.core_claim == "Remote work improves productivity."


def test_claim_normalizer_defaults_vague_text_to_unknown_claim_type() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Maybe this matters somehow.")

    assert claim.claim_type == "unknown"


def test_claim_normalizer_does_not_invent_assumptions_or_evidence() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work might help some teams.")

    assert claim.implied_assumptions == []
    assert claim.evidence_refs == []
    assert claim.ambiguity_flags == []
    assert claim.key_terms == []


def test_scoring_service_exports_get_debate_scoring_signature() -> None:
    assert callable(get_debate_scoring)


def test_scoring_service_handles_missing_debate_without_fake_data(db) -> None:
    assert get_debate_scoring(db, "missing-debate") is None


def test_scoring_service_loads_existing_debate_by_id(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, root])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    payload = get_debate_scoring(db, debate.id)

    assert payload == debate_scoring_payload(db, debate)
    assert payload["debate_id"] == debate.id
    assert payload["status"] == "unavailable"
    assert payload["items"] == []


def test_score_one_node_with_provider_uses_real_first_node_and_generation_text(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requests = []

        def judge_node(self, request):
            self.requests.append(request)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment().model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id="worker-a",
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.commit()
    provider = CapturingProvider()

    payload = score_one_node_with_provider(db, debate, provider)

    assert payload["debate_id"] == debate.id
    assert payload["status"] == "available"
    assert payload["producer"] == "test-provider"
    assert payload["model_metadata"] == {
        "provider": "test-provider",
        "model": "test-model",
        "checked_at": "2026-06-18T10:15:30+00:00",
        "status": "available",
    }
    assert payload["node_ids"] == [node.id]
    assert len(payload["items"]) == 1
    assert payload["items"][0]["node_id"] == node.id
    assert len(provider.requests) == 1
    assert provider.requests[0].claim.raw_text == node.claim
    assert provider.requests[0].argument_text == generation.argument
    assert provider.requests[0].judge_role == "judge"


def test_score_node_with_provider_returns_matching_cache_without_model_call(db) -> None:
    class FailingProvider:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            raise AssertionError("provider should not be called when fresh scoring cache exists")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    cached_payload = {
        "debate_id": debate.id,
        "status": "available",
        "node_ids": [node.id],
        "items": [{"node_id": node.id, "status": "available"}],
        "model_metadata": {
            "provider": "test-provider",
            "model": "test-model",
            "checked_at": "2026-06-18T10:15:30+00:00",
            "status": "available",
        },
    }
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=node_scoring_input_hash(claim=claim, argument_text=generation.argument),
            judge_role="judge",
            provider="test-provider",
            model="test-model",
            provider_metadata={"provider": "test-provider", "model": "test-model", "status": "available"},
            status="available",
            result=cached_payload,
        )
    )
    db.commit()

    payload = score_node_with_provider(db, debate, node.id, FailingProvider())

    assert payload == {
        **cached_payload,
        "cache": {"hit": True},
    }
    assert payload["model_metadata"]["status"] == "available"


def test_score_node_with_provider_force_refresh_bypasses_cache(db) -> None:
    class FreshProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.calls = 0

        def judge_node(self, request):
            self.calls += 1
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    cached_payload = {
        "debate_id": debate.id,
        "status": "available",
        "node_ids": [node.id],
        "items": [{"node_id": node.id, "status": "available"}],
        "model_metadata": {
            "provider": "test-provider",
            "model": "test-model",
            "checked_at": "2026-06-18T09:00:00+00:00",
            "status": "available",
        },
    }
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=node_scoring_input_hash(claim=claim, argument_text=generation.argument),
            judge_role="judge",
            provider="test-provider",
            model="test-model",
            provider_metadata={"provider": "test-provider", "model": "test-model", "status": "available"},
            status="available",
            result=cached_payload,
        )
    )
    db.commit()
    provider = FreshProvider()

    payload = score_node_with_provider(db, debate, node.id, provider, force_refresh=True)

    assert provider.calls == 1
    assert payload["cache"] == {"hit": False}
    assert payload["status"] == "available"
    assert payload["items"][0]["node_id"] == node.id
    assert payload["model_metadata"]["checked_at"] == "2026-06-18T10:15:30+00:00"


def test_score_node_with_provider_marks_prior_hash_mismatch_as_stale(db) -> None:
    class FreshProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.calls = 0

        def judge_node(self, request):
            self.calls += 1
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    old_claim = normalize_claim(node_id=node.id, raw_text="Remote work improves productivity.")
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=node_scoring_input_hash(claim=old_claim, argument_text=generation.argument),
            judge_role="judge",
            provider="test-provider",
            model="test-model",
            provider_metadata={"provider": "test-provider", "model": "test-model", "status": "available"},
            status="available",
            result={
                "debate_id": debate.id,
                "status": "available",
                "node_ids": [node.id],
                "items": [{"node_id": node.id, "status": "available"}],
            },
        )
    )
    db.commit()
    provider = FreshProvider()

    payload = score_node_with_provider(db, debate, node.id, provider)

    assert provider.calls == 1
    assert payload["cache"] == {
        "hit": False,
        "stale": {
            "reason": "input_hash_mismatch",
            "refresh_available": True,
        },
    }
    assert payload["status"] == "available"
    assert payload["items"][0]["node_id"] == node.id


def test_score_node_with_provider_writes_successful_result_to_cache(db) -> None:
    class SuccessfulProvider:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.commit()
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)

    payload = score_node_with_provider(db, debate, node.id, SuccessfulProvider())

    assert payload["cache"] == {"hit": False}
    cached = db.query(NodeScoringResult).filter_by(
        debate_id=debate.id,
        node_id=node.id,
        input_hash=node_scoring_input_hash(claim=claim, argument_text=generation.argument),
        judge_role="judge",
        provider="test-provider",
        model="test-model",
    ).one()
    assert cached.status == "available"
    assert cached.provider_metadata == payload["model_metadata"]
    assert cached.result == {key: value for key, value in payload.items() if key != "cache"}


def test_score_node_with_provider_does_not_invent_evidence_refs(db) -> None:
    class OptimisticEvidenceProvider:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(
                    base_assessment(
                        node_id=request.claim.node_id,
                        evidence=EvidenceAssessment(
                            evidence_quality=0.9,
                            evidence_relevance=0.9,
                            evidence_sufficiency=0.9,
                            source_reliability=0.9,
                            freshness=0.9,
                            support_status="grounded",
                        ),
                    ).model_dump(mode="json")
                ),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.commit()

    payload = score_node_with_provider(db, debate, node.id, OptimisticEvidenceProvider())

    assert payload["status"] == "available"
    assert payload["items"][0]["claim"]["evidence_refs"] == []
    assert payload["items"][0]["scores"]["evidence_quality"] == 0.9
    assert "stored-judge-output" not in payload["items"][0]["claim"]["evidence_refs"]


def test_score_node_with_provider_scores_requested_current_node(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requests = []

        def judge_node(self, request):
            self.requests.append(request)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        id="child-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    generation = Generation(
        id="generation-1",
        node=child,
        model_id="model-a",
        role="pro",
        argument="Hiring no longer depends on the office commute radius.",
        worker_id="worker-a",
    )
    child.active_generation_id = generation.id
    db.add_all([debate, worker, root, child, generation])
    db.commit()
    provider = CapturingProvider()

    payload = score_node_with_provider(db, debate, child.id, provider, judge_role="critic")

    assert payload["debate_id"] == debate.id
    assert payload["status"] == "available"
    assert payload["node_ids"] == [root.id, child.id]
    assert len(payload["items"]) == 1
    assert payload["items"][0]["node_id"] == child.id
    assert provider.requests[0].claim.node_id == child.id
    assert provider.requests[0].claim.raw_text == child.claim
    assert provider.requests[0].argument_text == generation.argument
    assert provider.requests[0].judge_role == "critic"


def test_score_node_with_provider_rejects_non_current_node(db) -> None:
    class UnexpectedProvider:
        def judge_node(self, request):
            raise AssertionError("provider should not be called")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    current_node = Node(
        id="current-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    stale_node = Node(
        id="stale-node",
        debate=debate,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work improves hiring.",
        status="stale",
        materialized_path="/0001",
    )
    db.add_all([debate, current_node, stale_node])
    db.commit()

    payload = score_node_with_provider(db, debate, stale_node.id, UnexpectedProvider())

    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "Requested scoring node is not current in this debate.",
        "node_ids": [current_node.id],
        "items": [],
    }


def test_scoring_result_payload_returns_partial_with_node_errors() -> None:
    scored_item = reduce_assessments(base_claim(node_id="node-1"), base_assessment()).model_dump(mode="json")

    payload = scoring_result_payload(
        debate_id="debate-1",
        node_ids=["node-1", "node-2"],
        items=[scored_item],
        errors=[
            NodeScoringError(
                node_id="node-2",
                status="unavailable",
                reason="Scoring judge call timed out.",
            )
        ],
    )

    assert payload == {
        "debate_id": "debate-1",
        "status": "partial",
        "reason": "Some scoring checks were unavailable.",
        "node_ids": ["node-1", "node-2"],
        "items": [scored_item],
        "errors": [
            {
                "node_id": "node-2",
                "status": "unavailable",
                "reason": "Scoring judge call timed out.",
            }
        ],
    }
    assert payload["items"][0]["node_id"] == "node-1"
    assert all(item["node_id"] != "node-2" for item in payload["items"])


def test_scoring_result_payload_returns_honest_unavailable_reason_from_node_errors() -> None:
    payload = scoring_result_payload(
        debate_id="debate-1",
        node_ids=["node-1", "node-2"],
        items=[],
        errors=[
            NodeScoringError(
                node_id="node-2",
                status="unavailable",
                reason="Scoring node limit reached.",
            ),
            NodeScoringError(
                node_id="node-1",
                status="unavailable",
                reason="Scoring judge call failed: Codex command failed to start: [WinError 5] Access is denied",
            ),
        ],
    )

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert (
        payload["reason"]
        == "Scoring judge call failed: Codex command failed to start: [WinError 5] Access is denied"
    )
    assert len(payload["errors"]) == 2


def test_controlled_provider_mixed_success_failure_returns_partial_without_fake_scores(db) -> None:
    class SuccessfulProvider:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    class TimeoutProvider:
        def judge_node(self, request):
            raise TimeoutError("judge call timed out")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    first = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    second = Node(
        id="node-2",
        debate=debate,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, first, second])
    db.commit()

    success = score_node_with_provider(db, debate, first.id, SuccessfulProvider())
    failure = score_node_with_provider(db, debate, second.id, TimeoutProvider())
    payload = scoring_result_payload(
        debate_id=debate.id,
        node_ids=success["node_ids"],
        items=success["items"],
        errors=[
            NodeScoringError(
                node_id=second.id,
                status="unavailable",
                reason=failure["reason"],
            )
        ],
    )

    assert payload["status"] == "partial"
    assert payload["items"] == success["items"]
    assert payload["items"][0]["node_id"] == first.id
    assert all(item["node_id"] != second.id for item in payload["items"])
    assert payload["errors"] == [
        {
            "node_id": second.id,
            "status": "unavailable",
            "reason": "Scoring judge call timed out.",
        }
    ]


def test_score_nodes_with_provider_scores_multiple_current_nodes_in_loop(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        id="child-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, root, child])
    db.commit()
    provider = CapturingProvider()

    payload = score_nodes_with_provider(db, debate, provider)

    assert payload["debate_id"] == debate.id
    assert payload["status"] == "available"
    assert payload["node_ids"] == [root.id, child.id]
    assert [item["node_id"] for item in payload["items"]] == [root.id, child.id]
    assert provider.requested_node_ids == [root.id, child.id]
    assert "errors" not in payload


def test_score_nodes_with_provider_records_sanitized_started_and_completed_audit_entries(db) -> None:
    class SecretMetadataProvider:
        provider = "test-provider --api-key secret-token"
        model = "test-model"

        def __init__(self) -> None:
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            latency_by_node_id = {
                "root-node": 15,
                "child-node": 25,
            }
            return ScoringProviderResult(
                provider="test-provider --api-key secret-token",
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=latency_by_node_id[request.claim.node_id],
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        id="child-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, root, child])
    db.commit()
    provider = SecretMetadataProvider()

    payload = score_nodes_with_provider(db, debate, provider, judge_role="judge")

    records = db.scalars(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.debate_id == debate.id, ProvenanceRecord.artifact_kind == "scoring_run")
        .order_by(ProvenanceRecord.created_at.asc(), ProvenanceRecord.id.asc())
    ).all()
    assert payload["status"] == "available"
    assert provider.requested_node_ids == [root.id, child.id]
    records_by_event = {record.metadata_json["event"]: record for record in records}
    assert set(records_by_event) == {"started", "completed"}
    assert records_by_event["started"].artifact_id == records_by_event["completed"].artifact_id
    assert records_by_event["started"].model_id == "test-model"
    assert records_by_event["started"].metadata_json == {
        "event": "started",
        "status": "running",
        "provider": None,
        "model": "test-model",
        "judge_role": "judge",
        "requested_node_count": 2,
        "max_nodes": 12,
        "model_call_count": 0,
    }
    assert records_by_event["completed"].metadata_json == {
        "event": "completed",
        "status": "available",
        "provider": None,
        "model": "test-model",
        "judge_role": "judge",
        "requested_node_count": 2,
        "scored_node_count": 2,
        "failed_node_count": 0,
        "skipped_node_count": 0,
        "max_nodes": 12,
        "truncated": False,
        "model_call_count": 2,
        "provider_call_latencies_ms": [15, 25],
        "provider_latency_ms": 40,
        "latency_ms": records_by_event["completed"].metadata_json["latency_ms"],
    }
    assert isinstance(records_by_event["completed"].metadata_json["latency_ms"], int)
    assert 0 <= records_by_event["completed"].metadata_json["latency_ms"] <= 5000
    assert "secret-token" not in str([record.metadata_json for record in records])


def test_score_nodes_with_provider_records_failed_audit_entry_when_no_node_scores(db) -> None:
    class FailingProvider:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            raise ProviderError("judge failed")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        id="child-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, root, child])
    db.commit()

    payload = score_nodes_with_provider(db, debate, FailingProvider())

    records = db.scalars(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.debate_id == debate.id, ProvenanceRecord.artifact_kind == "scoring_run")
        .order_by(ProvenanceRecord.created_at.asc(), ProvenanceRecord.id.asc())
    ).all()
    assert payload["status"] == "unavailable"
    records_by_event = {record.metadata_json["event"]: record for record in records}
    assert set(records_by_event) == {"started", "failed"}
    assert records_by_event["started"].artifact_id == records_by_event["failed"].artifact_id
    assert records_by_event["failed"].metadata_json == {
        "event": "failed",
        "status": "unavailable",
        "provider": "test-provider",
        "model": "test-model",
        "judge_role": "judge",
        "requested_node_count": 2,
        "scored_node_count": 0,
        "failed_node_count": 2,
        "skipped_node_count": 0,
        "max_nodes": 12,
        "truncated": False,
        "model_call_count": 2,
        "latency_ms": records_by_event["failed"].metadata_json["latency_ms"],
    }
    assert isinstance(records_by_event["failed"].metadata_json["latency_ms"], int)
    assert 0 <= records_by_event["failed"].metadata_json["latency_ms"] <= 5000


def test_score_debate_with_provider_registry_reports_unavailable_for_missing_registered_provider(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.commit()
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="missing", model="missing-model", temperature=0.0)},
        providers={"fake": FakeProvider()},
    )

    payload = score_debate_with_provider_registry(db, debate, registry, force_refresh=True)

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["reason"] == "Configured judge provider is not registered: missing."


def test_score_debate_with_provider_registry_reports_unavailable_for_invalid_provider_output(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-root",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    root.active_generation_id = generation.id
    db.add_all([debate, worker, root, generation])
    db.flush()
    debate.root_node_id = root.id
    db.commit()
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="fake", model="fake-model", temperature=0.0)},
        providers={"fake": FakeProvider({"judge": "not json"})},
    )

    payload = score_debate_with_provider_registry(db, debate, registry, force_refresh=True)

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["reason"] == "Judge output was not valid JSON."
    assert payload["errors"][0]["status"] == "unavailable"
    assert payload["errors"][0]["reason"] == "Judge output was not valid JSON."


def test_score_nodes_with_provider_releases_sqlite_write_lock_before_each_provider_call(db) -> None:
    class WriterProbeProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.calls = 0

        def judge_node(self, request):
            self.calls += 1
            with SessionLocal() as probe_db:
                probe_db.execute(text("PRAGMA busy_timeout=50"))
                probe_db.add(
                    Worker(
                        name=f"probe-writer-{self.calls}",
                        token_hash="hash",
                        capabilities=["probe"],
                        status="online",
                    )
                )
                try:
                    commit_write(probe_db)
                except OperationalError as exc:
                    raise AssertionError("scoring provider call ran while a SQLite write lock was held") from exc
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                checked_at="2026-06-18T10:15:30+00:00",
                metadata={},
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="root-node",
        debate=debate,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/0",
    )
    child = Node(
        id="child-node",
        debate=debate,
        parent_id=root.id,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Remote work removes commutes.",
        status="complete",
        materialized_path="/0/0",
    )
    root_generation = Generation(
        id="generation-root",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    child_generation = Generation(
        id="generation-child",
        node=child,
        model_id="model-a",
        role="pro",
        argument="Commute time can be spent on focused work or rest.",
        worker_id=worker.id,
    )
    root.active_generation_id = root_generation.id
    child.active_generation_id = child_generation.id
    db.add_all([debate, worker, root, child, root_generation, child_generation])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    provider = WriterProbeProvider()

    payload = score_nodes_with_provider(db, debate, provider, force_refresh=True)

    assert provider.calls == 2
    assert payload["status"] == "available"
    assert db.scalars(select(Worker).where(Worker.name.like("probe-writer-%"))).all()


def test_score_nodes_with_provider_audit_counts_only_model_calls_made(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    cached_node = Node(
        id="cached-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    fresh_node = Node(
        id="fresh-node",
        debate=debate,
        parent=cached_node,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, cached_node, fresh_node])
    db.flush()
    cached_claim = normalize_claim(node_id=cached_node.id, raw_text=cached_node.claim)
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=cached_node.id,
            input_hash=node_scoring_input_hash(claim=cached_claim, argument_text=None),
            judge_role="judge",
            provider="test-provider",
            model="test-model",
            provider_metadata={"provider": "test-provider", "model": "test-model", "status": "available"},
            status="available",
            result={
                "debate_id": debate.id,
                "status": "available",
                "node_ids": [cached_node.id, fresh_node.id],
                "items": [{"node_id": cached_node.id, "status": "available"}],
            },
        )
    )
    db.commit()
    provider = CapturingProvider()

    payload = score_nodes_with_provider(db, debate, provider)

    records = db.scalars(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.debate_id == debate.id, ProvenanceRecord.artifact_kind == "scoring_run")
        .order_by(ProvenanceRecord.created_at.asc(), ProvenanceRecord.id.asc())
    ).all()
    assert payload["status"] == "available"
    assert provider.requested_node_ids == [fresh_node.id]
    records_by_event = {record.metadata_json["event"]: record for record in records}
    assert records_by_event["started"].metadata_json["model_call_count"] == 0
    assert records_by_event["completed"].metadata_json["model_call_count"] == 1


def test_score_nodes_with_provider_enforces_max_nodes_limit(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self, model: str = "test-model") -> None:
            self.model = model
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    first_child = Node(
        id="child-a",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    second_child = Node(
        id="child-b",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=1,
        claim="Remote work lowers office costs.",
        status="complete",
        materialized_path="/0002",
    )
    db.add_all([debate, root, first_child, second_child])
    db.commit()
    provider = CapturingProvider()

    payload = score_nodes_with_provider(db, debate, provider, max_nodes=2)

    assert provider.requested_node_ids == [root.id, first_child.id]
    assert payload["status"] == "partial"
    assert payload["node_ids"] == [root.id, first_child.id, second_child.id]
    assert [item["node_id"] for item in payload["items"]] == [root.id, first_child.id]
    assert payload["max_nodes"] == 2
    assert payload["scored_node_count"] == 2
    assert payload["skipped_node_count"] == 1
    assert payload["truncated"] is True
    assert payload["errors"] == [
        {
            "node_id": second_child.id,
            "status": "unavailable",
            "reason": "Scoring node limit reached.",
        }
    ]


def test_score_nodes_with_provider_builds_requests_in_stable_order(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self, model: str = "test-model") -> None:
            self.model = model
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    later_child = Node(
        id="z-later",
        debate=debate,
        node_type="support",
        depth=1,
        position=1,
        claim="Remote work lowers office costs.",
        status="complete",
        materialized_path="/0002",
    )
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    earlier_child = Node(
        id="a-earlier",
        debate=debate,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([later_child, root, earlier_child])
    db.commit()

    first_provider = CapturingProvider()
    first_payload = score_nodes_with_provider(db, debate, first_provider)
    second_provider = CapturingProvider(model="test-model-2")
    second_payload = score_nodes_with_provider(db, debate, second_provider)

    expected_order = [root.id, earlier_child.id, later_child.id]
    assert first_provider.requested_node_ids == expected_order
    assert second_provider.requested_node_ids == expected_order
    assert [item["node_id"] for item in first_payload["items"]] == expected_order
    assert [item["node_id"] for item in second_payload["items"]] == expected_order


def test_score_nodes_with_provider_force_refresh_rechecks_cached_nodes(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        id="child-node",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, root, child])
    db.flush()
    for node in (root, child):
        claim = normalize_claim(node_id=node.id, raw_text=node.claim)
        db.add(
            NodeScoringResult(
                debate_id=debate.id,
                node_id=node.id,
                input_hash=node_scoring_input_hash(claim=claim, argument_text=None),
                judge_role="judge",
                provider="test-provider",
                model="test-model",
                provider_metadata={"provider": "test-provider", "model": "test-model", "status": "available"},
                status="available",
                result={
                    "debate_id": debate.id,
                    "status": "available",
                    "node_ids": [root.id, child.id],
                    "items": [{"node_id": node.id, "status": "available"}],
                },
            )
        )
    db.commit()
    provider = CapturingProvider()

    payload = score_nodes_with_provider(db, debate, provider, force_refresh=True)

    assert provider.requested_node_ids == [root.id, child.id]
    assert payload["status"] == "available"
    assert [item["node_id"] for item in payload["items"]] == [root.id, child.id]


def test_score_nodes_with_provider_exposes_stale_cache_metadata_for_changed_node(db) -> None:
    class CapturingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, root])
    db.flush()
    old_claim = normalize_claim(node_id=root.id, raw_text="Remote work improves productivity.")
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=root.id,
            input_hash=node_scoring_input_hash(claim=old_claim, argument_text=None),
            judge_role="judge",
            provider="test-provider",
            model="test-model",
            provider_metadata={"provider": "test-provider", "model": "test-model", "status": "available"},
            status="available",
            result={
                "debate_id": debate.id,
                "status": "available",
                "node_ids": [root.id],
                "items": [{"node_id": root.id, "status": "available"}],
            },
        )
    )
    db.commit()
    provider = CapturingProvider()

    payload = score_nodes_with_provider(db, debate, provider)

    assert provider.requested_node_ids == [root.id]
    assert payload["status"] == "available"
    assert [item["node_id"] for item in payload["items"]] == [root.id]
    assert payload["cache"] == {
        "hit": False,
        "stale": {
            "reason": "input_hash_mismatch",
            "refresh_available": True,
        },
    }


def test_score_nodes_with_provider_stops_on_cancellation_and_returns_partial(db) -> None:
    class CancellingProvider:
        provider = "test-provider"
        model = "test-model"

        def __init__(self) -> None:
            self.requested_node_ids = []

        def judge_node(self, request):
            self.requested_node_ids.append(request.claim.node_id)
            if request.claim.node_id == "child-a":
                raise asyncio.CancelledError()
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment(node_id=request.claim.node_id).model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    first_child = Node(
        id="child-a",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work expands hiring pools.",
        status="complete",
        materialized_path="/0001",
    )
    second_child = Node(
        id="child-b",
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=1,
        claim="Remote work lowers office costs.",
        status="complete",
        materialized_path="/0002",
    )
    db.add_all([debate, root, first_child, second_child])
    db.commit()
    provider = CancellingProvider()

    payload = score_nodes_with_provider(db, debate, provider)

    assert provider.requested_node_ids == [root.id, first_child.id]
    assert payload["status"] == "partial"
    assert [item["node_id"] for item in payload["items"]] == [root.id]
    assert payload["errors"] == [
        {
            "node_id": first_child.id,
            "status": "unavailable",
            "reason": "Scoring batch was cancelled.",
        }
    ]
    assert second_child.id not in provider.requested_node_ids


def test_lookup_scoring_cache_reads_persisted_storage(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    cached_payload = {
        "node_id": "node-1",
        "status": "available",
        "items": [],
    }
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_CACHE_ANALYZER_TYPE,
            output={"payload": cached_payload},
            status="complete",
            provenance={
                "scoring_source": SCORING_CACHE_SOURCE,
                "node_id": "node-1",
                "input_hash": "hash-a",
                "judge_role": "judge",
                "provider": "codex",
                "model": "gpt-5.4",
            },
        )
    )
    db.commit()

    payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id="node-1",
        input_hash="hash-a",
        judge_role="judge",
        provider="codex",
        model="gpt-5.4",
    )

    assert payload == cached_payload


def test_lookup_scoring_cache_reads_node_scoring_results_table(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/0",
    )
    cached_payload = {
        "node_id": node.id,
        "status": "available",
        "items": [{"node_id": node.id, "status": "available"}],
    }
    db.add_all([debate, node])
    db.flush()
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash="hash-a",
            judge_role="judge",
            provider="codex",
            model="gpt-5.4",
            provider_metadata={"provider": "codex", "model": "gpt-5.4", "status": "available"},
            status="available",
            result=cached_payload,
        )
    )
    db.commit()

    payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id=node.id,
        input_hash="hash-a",
        judge_role="judge",
        provider="codex",
        model="gpt-5.4",
    )

    assert payload == cached_payload


def test_lookup_scoring_cache_does_not_fall_back_when_dedicated_result_is_unavailable(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/0",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    stale_payload = {"node_id": node.id, "status": "available", "items": []}
    db.add_all(
        [
            NodeScoringResult(
                debate_id=debate.id,
                node_id=node.id,
                input_hash="hash-a",
                judge_role="judge",
                provider="codex",
                model="gpt-5.4",
                provider_metadata={"provider": "codex", "model": "gpt-5.4", "status": "unavailable"},
                status="unavailable",
                result={},
            ),
            AnalyzerRun(
                debate_id=debate.id,
                branch_id=branch.id,
                analyzer_type=SCORING_CACHE_ANALYZER_TYPE,
                output={"payload": stale_payload},
                status="complete",
                provenance={
                    "scoring_source": SCORING_CACHE_SOURCE,
                    "node_id": node.id,
                    "input_hash": "hash-a",
                    "judge_role": "judge",
                    "provider": "codex",
                    "model": "gpt-5.4",
                },
            ),
        ]
    )
    db.commit()

    payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id=node.id,
        input_hash="hash-a",
        judge_role="judge",
        provider="codex",
        model="gpt-5.4",
    )

    assert payload is None


def test_node_scoring_input_hash_is_stable_for_same_real_inputs() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work improves retention.")

    first = node_scoring_input_hash(claim=claim, argument_text="Retention improved by 12%.")
    second = node_scoring_input_hash(claim=claim, argument_text="Retention improved by 12%.")

    assert first == second
    assert len(first) == 64


def test_node_scoring_input_hash_changes_when_claim_or_argument_changes() -> None:
    claim = normalize_claim(node_id="node-1", raw_text="Remote work improves retention.")
    changed_claim = normalize_claim(node_id="node-1", raw_text="Remote work improves productivity.")

    original = node_scoring_input_hash(claim=claim, argument_text="Retention improved by 12%.")

    assert node_scoring_input_hash(claim=changed_claim, argument_text="Retention improved by 12%.") != original
    assert node_scoring_input_hash(claim=claim, argument_text="Retention improved by 8%.") != original
    assert node_scoring_input_hash(claim=claim, argument_text=None) != original


def test_lookup_scoring_cache_requires_full_cache_identity(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type=SCORING_CACHE_ANALYZER_TYPE,
            output={"payload": {"node_id": "node-1", "items": []}},
            status="complete",
            provenance={
                "scoring_source": SCORING_CACHE_SOURCE,
                "node_id": "node-1",
                "input_hash": "hash-a",
                "judge_role": "judge",
                "provider": "codex",
                "model": "gpt-5.4",
            },
        )
    )
    db.commit()

    payload = lookup_scoring_cache(
        db,
        debate_id=debate.id,
        node_id="node-2",
        input_hash="hash-a",
        judge_role="judge",
        provider="codex",
        model="gpt-5.4",
    )

    assert payload is None


def test_score_one_node_with_provider_adds_checked_at_when_provider_omits_it(db) -> None:
    class ProviderWithoutCheckedAt:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment().model_dump(mode="json")),
                latency_ms=15,
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    payload = score_one_node_with_provider(db, debate, ProviderWithoutCheckedAt())

    assert payload["model_metadata"]["provider"] == "test-provider"
    assert payload["model_metadata"]["model"] == "test-model"
    assert payload["model_metadata"]["status"] == "available"
    assert payload["model_metadata"]["checked_at"]


def test_score_one_node_with_provider_returns_unavailable_on_timeout(db) -> None:
    class TimeoutProvider:
        def __init__(self) -> None:
            self.requests = []

        def judge_node(self, request):
            self.requests.append(request)
            raise TimeoutError("judge call timed out")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()
    provider = TimeoutProvider()

    payload = score_one_node_with_provider(db, debate, provider, timeout_seconds=7)

    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "Scoring judge call timed out.",
        "node_ids": [node.id],
        "items": [],
    }
    assert provider.requests[0].timeout_seconds == 7


def test_score_one_node_with_provider_maps_provider_error_to_unavailable(db) -> None:
    class FailingProvider:
        def judge_node(self, request):
            raise ProviderError("secret-token stderr from provider")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    payload = score_one_node_with_provider(db, debate, FailingProvider())

    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "Scoring judge call failed.",
        "node_ids": [node.id],
        "items": [],
    }
    assert "secret-token" not in payload["reason"]


def test_score_one_node_with_provider_exposes_public_provider_error(db) -> None:
    class FailingProvider:
        def judge_node(self, request):
            raise ProviderError("Codex command failed to start: [WinError 5] Access is denied")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    payload = score_one_node_with_provider(db, debate, FailingProvider())

    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "Scoring judge call failed: Codex command failed to start: [WinError 5] Access is denied",
        "node_ids": [node.id],
        "items": [],
    }


def test_score_one_node_with_provider_maps_unexpected_error_to_unavailable(db) -> None:
    class ExplodingProvider:
        def judge_node(self, request):
            raise RuntimeError("secret-token unexpected provider traceback")

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    payload = score_one_node_with_provider(db, debate, ExplodingProvider())

    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "Scoring judge call failed unexpectedly.",
        "node_ids": [node.id],
        "items": [],
    }
    assert "secret-token" not in payload["reason"]


def test_score_one_node_with_provider_rejects_malformed_model_output(db) -> None:
    class MalformedProvider:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output="secret-token raw prompt is not json",
                latency_ms=15,
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    payload = score_one_node_with_provider(db, debate, MalformedProvider())

    assert payload["debate_id"] == debate.id
    assert payload["status"] == "unavailable"
    assert payload["reason"] == "Judge output was not valid JSON."
    assert payload["node_ids"] == [node.id]
    assert payload["items"] == []
    assert payload["model_metadata"]["provider"] == "test-provider"
    assert payload["model_metadata"]["model"] == "test-model"
    assert payload["model_metadata"]["status"] == "unavailable"
    assert payload["model_metadata"]["checked_at"]
    assert payload["cache"] == {"hit": False}
    assert "secret-token" not in str(payload)
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    cached = db.query(NodeScoringResult).filter_by(
        debate_id=debate.id,
        node_id=node.id,
        input_hash=node_scoring_input_hash(claim=claim, argument_text=None),
        judge_role="judge",
        provider="test-provider",
        model="test-model",
    ).one()
    assert cached.status == "unavailable"
    assert cached.result == {key: value for key, value in payload.items() if key != "cache"}
    assert cached.result["items"] == []


def test_score_one_node_with_provider_hides_secret_like_model_metadata(db) -> None:
    class SecretMetadataProvider:
        provider = "codex --api-key secret-token"
        model = "gpt-5.4 TOKEN=secret-token"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=json.dumps(base_assessment().model_dump(mode="json")),
                latency_ms=15,
                checked_at="2026-06-18T10:15:30+00:00",
                metadata={
                    "command": ["codex", "--api-key", "secret-token"],
                    "env": {"OPENAI_API_KEY": "secret-token"},
                    "stderr": "secret-token",
                },
            )

    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    payload = score_one_node_with_provider(db, debate, SecretMetadataProvider())

    assert payload["status"] == "available"
    assert payload["model_metadata"] == {
        "provider": None,
        "model": None,
        "checked_at": "2026-06-18T10:15:30+00:00",
        "status": "available",
    }
    assert "secret-token" not in str(payload)


def test_scoring_service_returns_unavailable_without_real_judge_outputs(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/0",
    )
    stale = Node(
        debate=debate,
        parent=root,
        node_type="attack",
        depth=1,
        position=1,
        claim="This stale claim should be omitted.",
        status="stale",
        materialized_path="/1",
    )
    db.add_all([debate, root, child, stale])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["debate_id"] == debate.id
    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["reason"] == "No scoring judge outputs are available for this debate."


def test_scoring_service_payload_node_ids_match_real_debate_tree(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Remote work gives people more focus time.",
        status="complete",
        materialized_path="/0",
    )
    stale = Node(
        debate=debate,
        parent=root,
        node_type="attack",
        depth=1,
        position=1,
        claim="This stale node should not be exposed for scoring.",
        status="stale",
        materialized_path="/1",
    )
    db.add_all([debate, root, child, stale])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    payload = get_debate_scoring(db, debate.id)

    assert payload is not None
    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["node_ids"] == [root.id, child.id]


def test_scoring_service_unavailable_path_does_not_invent_runtime_scores(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, root])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    payload = get_debate_scoring(db, debate.id)

    assert payload is not None
    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "No scoring judge outputs are available for this debate.",
        "node_ids": [root.id],
        "items": [],
    }
    assert "scores" not in payload
    assert "labels" not in payload


def test_scoring_service_rejects_stored_outputs_without_judge_provenance(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "items": [reduce_assessments(base_claim(), base_assessment()).model_dump(mode="json")],
                "producer": "test-double",
            },
            status="complete",
            provenance={"scoring_source": "test_fixture"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["reason"] == "Stored scoring output was not produced by judge outputs."


def test_scoring_service_rejects_malformed_stored_items(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": [{"node_id": "node-1"}]},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["reason"] == "Stored scoring output contains malformed node scoring items."


def test_scoring_service_rejects_unknown_stored_status(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    db.add(debate)
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id="node-1"), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "complete",
                "items": [scoring_item],
                "producer": "stored-judge-output",
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["reason"] == "Stored scoring output has an unknown status."


def test_scoring_service_marks_active_scoring_job_over_stale_failed_output(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "unavailable",
                "node_ids": [node.id],
                "items": [],
                "reason": (
                    "Scoring judge call failed: Codex command exited with code 1: "
                    "{\"type\":\"error\",\"status\":400,\"error\":{\"type\":\"invalid_request_error\","
                    "\"message\":\"The 'codex-gpt-5.5' model is not supported when using Codex "
                    "with a ChatGPT account.\"}}"
                ),
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    job = Job(
        debate_id=debate.id,
        job_type="score_debate",
        required_role="judge",
        required_model="gpt-5.5",
        status="running",
        deadline=now_utc() + timedelta(minutes=5),
    )
    db.add(job)
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["status"] == "unavailable"
    assert payload["items"] == []
    assert payload["active_scoring_job_id"] == job.id
    assert payload["active_scoring_job_status"] == "running"
    assert payload["reason"] == "Judge outputs are being generated."
    assert "codex-gpt-5.5" not in str(payload)


def test_scoring_service_returns_stored_real_scoring_outputs(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id="node-1"), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "items": [scoring_item],
                "producer": "stored-judge-output",
                "model_metadata": {
                    "provider": "codex",
                    "model": "gpt-5.4",
                    "checked_at": "2026-06-18T10:15:30+00:00",
                    "status": "available",
                    "api_key": "must-not-leak",
                },
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["debate_id"] == debate.id
    assert payload["status"] == "available"
    assert payload["producer"] == "stored-judge-output"
    assert payload["model_metadata"] == {
        "provider": "codex",
        "model": "gpt-5.4",
        "checked_at": "2026-06-18T10:15:30+00:00",
        "status": "available",
    }
    assert len(payload["items"]) == 1
    assert payload["items"][0]["node_id"] == scoring_item["node_id"]
    assert payload["items"][0]["scores"] == scoring_item["scores"]


def test_scoring_service_hides_secret_like_stored_model_metadata(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id=node.id), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "items": [scoring_item],
                "model_metadata": {
                    "provider": "codex --api-key secret-token",
                    "model": "gpt-5.4 OPENAI_API_KEY=secret-token",
                    "checked_at": "2026-06-18T10:15:30+00:00",
                    "status": "available",
                    "command": ["codex", "--api-key", "secret-token"],
                    "env": {"OPENAI_API_KEY": "secret-token"},
                    "stderr": "secret-token",
                },
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload["model_metadata"] == {
        "provider": None,
        "model": None,
        "checked_at": "2026-06-18T10:15:30+00:00",
        "status": "available",
    }
    assert "secret-token" not in str(payload)


def test_scoring_service_hides_secret_like_stored_producer(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id=node.id), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "items": [scoring_item],
                "producer": "codex --api-key secret-token",
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert "producer" not in payload
    assert "secret-token" not in str(payload)


def test_scoring_service_rejects_stored_outputs_for_nodes_outside_current_debate(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    current_node = Node(
        id="current-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    stale_node = Node(
        id="stale-node",
        debate=debate,
        node_type="pro",
        depth=1,
        position=0,
        claim="Stale node should not receive public scoring.",
        status="stale",
        materialized_path="/0001",
    )
    other_debate = Debate(topic="Should offices reopen?", status="complete")
    other_node = Node(
        id="other-node",
        debate=other_debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Offices improve collaboration.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, current_node, stale_node, other_debate, other_node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    items = [
        reduce_assessments(base_claim(node_id="unknown-node"), base_assessment()).model_dump(mode="json"),
        reduce_assessments(base_claim(node_id=stale_node.id), base_assessment()).model_dump(mode="json"),
        reduce_assessments(base_claim(node_id=other_node.id), base_assessment()).model_dump(mode="json"),
    ]
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": items, "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    payload = debate_scoring_payload(db, debate)

    assert payload == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "Stored scoring output references nodes outside the current debate.",
        "node_ids": [current_node.id],
        "items": [],
    }


def test_scoring_api_returns_public_read_payload(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    debate.root_node_id = node.id
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"debate_id", "items", "node_ids", "reason", "status"}
    assert body["debate_id"] == debate.id
    assert body["status"] == "unavailable"
    assert body["node_ids"] == [node.id]
    assert body["items"] == []
    assert body["reason"] == "No scoring judge outputs are available for this debate."

    debate_response = TestClient(app).get(f"/api/debates/{debate.id}")
    assert debate_response.status_code == 200
    assert debate_response.json()["id"] == debate.id
    assert "items" not in debate_response.json()


def test_scoring_api_returns_stored_judge_outputs(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id="node-1"), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "available",
                "generated_at": "2026-06-17T12:00:00+00:00",
                "items": [scoring_item],
                "producer": "stored-judge-output",
            },
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")

    assert response.status_code == 200
    assert response.json()["status"] == "available"
    assert response.json()["producer"] == "stored-judge-output"
    assert response.json()["generated_at"] == "2026-06-17T12:00:00+00:00"
    assert len(response.json()["items"]) == 1
    assert response.json()["items"][0]["node_id"] == scoring_item["node_id"]
    assert response.json()["items"][0]["scores"] == scoring_item["scores"]
    assert response.json()["items"][0]["score_provenance"] == {
        "raw_judge_output_kind": "claim_assessment",
        "raw_judge_output_included": False,
        "final_score_source": "deterministic_reducer",
        "reducer_version": "node-scoring-reducer-v1",
        "rubric_version": "debateai-rubric-v1",
    }
    assert "raw_output" not in str(response.json()["items"][0])
    assert "judge_outputs" not in str(response.json()["items"][0]["score_provenance"])


def test_scoring_api_returns_adaptive_depth_dry_run_from_stored_judge_outputs(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    low_node = Node(
        id="low-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    medium_node = Node(
        id="medium-node",
        debate=debate,
        node_type="pro",
        depth=1,
        position=0,
        claim="Remote work reduces commute-related attrition.",
        status="complete",
        materialized_path="/0001/",
    )
    high_node = Node(
        id="high-node",
        debate=debate,
        node_type="con",
        depth=1,
        position=1,
        claim="Remote work weakens collaboration enough to offset gains.",
        status="complete",
        materialized_path="/0002/",
    )
    db.add_all([debate, low_node, medium_node, high_node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    items = [
        explicit_depth_pressure_payload(node_id=low_node.id).model_dump(mode="json"),
        explicit_depth_pressure_payload(
            node_id=medium_node.id,
            holes=[
                ScoringHole(
                    type="missing_evidence",
                    severity="high",
                    description="No source verifies the core premise.",
                    source="evidence_auditor",
                )
            ],
            impact=0.75,
            recommended_investigations=[
                RecommendedInvestigation(
                    action="find_evidence",
                    reason="Evidence support is weak or unverified.",
                    priority=2,
                    target_node_id=medium_node.id,
                )
            ],
        ).model_dump(mode="json"),
        explicit_depth_pressure_payload(
            node_id=high_node.id,
            holes=[
                ScoringHole(
                    type="assumption_risk",
                    severity="high",
                    description="The argument depends on an unstated adoption assumption.",
                    source="critic",
                )
            ],
            impact=0.75,
            uncertainty=0.5,
            recommended_investigations=[
                RecommendedInvestigation(
                    action="challenge",
                    reason="A priority-one challenge marks an unanswered attack.",
                    priority=1,
                    target_node_id=high_node.id,
                )
            ],
        ).model_dump(mode="json"),
    ]
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": items, "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring/adaptive-depth/dry-run")

    assert response.status_code == 200
    assert response.json() == {
        "debate_id": debate.id,
        "status": "available",
        "plan": {
            "policy": {"mode": "adaptive", "target_depth": None, "reason": None},
            "candidate_count": 3,
            "expansion_count": 2,
            "items": [
                {
                    "node_id": high_node.id,
                    "pressure": "high",
                    "score": 1.0,
                    "recommended_action": "challenge",
                    "expansion_hint": "expand",
                    "reasons": [
                        "high_severity_holes",
                        "high_impact",
                        "high_uncertainty",
                        "unanswered_attack",
                    ],
                    "hole_count": 1,
                    "recommended_investigation_count": 1,
                },
                {
                    "node_id": medium_node.id,
                    "pressure": "medium",
                    "score": 0.5,
                    "recommended_action": "find_evidence",
                    "expansion_hint": "review_for_expansion",
                    "reasons": ["high_severity_holes", "high_impact"],
                    "hole_count": 1,
                    "recommended_investigation_count": 1,
                },
            ],
        },
    }
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []


def test_scoring_api_adaptive_depth_dry_run_reports_unavailable_without_stored_scoring(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring/adaptive-depth/dry-run")

    assert response.status_code == 200
    assert response.json() == {
        "debate_id": debate.id,
        "status": "unavailable",
        "reason": "No scoring judge outputs are available for this debate.",
        "plan": {
            "policy": {"mode": "adaptive", "target_depth": None, "reason": None},
            "candidate_count": 0,
            "expansion_count": 0,
            "items": [],
        },
    }
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []


def test_scoring_api_approve_adaptive_depth_run_queues_real_regeneration_for_selected_expand_nodes(db) -> None:
    worker = Worker(
        name="mac-mini",
        token_hash=hash_token("worker-token"),
        capabilities=["mock-local"],
        status="online",
    )
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={"max_depth": 2})
    high_node = Node(
        id="high-node",
        debate=debate,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Remote work reduces commute-related attrition.",
        status="complete",
        materialized_path="/0",
    )
    medium_node = Node(
        id="medium-node",
        debate=debate,
        node_type="CON",
        depth=1,
        position=1,
        claim="Remote work weakens collaboration enough to offset gains.",
        status="complete",
        materialized_path="/1",
    )
    db.add_all([worker, debate, high_node, medium_node])
    db.flush()
    debate.root_node_id = high_node.id
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    high_item = explicit_depth_pressure_payload(
        node_id=high_node.id,
        holes=[
            ScoringHole(
                type="assumption_risk",
                severity="high",
                description="The argument depends on an unstated adoption assumption.",
                source="critic",
            )
        ],
        impact=0.75,
        uncertainty=0.5,
        recommended_investigations=[
            RecommendedInvestigation(
                action="challenge",
                reason="A priority-one challenge marks an unanswered attack.",
                priority=1,
                target_node_id=high_node.id,
            )
        ],
    ).model_dump(mode="json")
    medium_item = explicit_depth_pressure_payload(
        node_id=medium_node.id,
        holes=[
            ScoringHole(
                type="missing_evidence",
                severity="high",
                description="No source verifies the core premise.",
                source="evidence_auditor",
            )
        ],
        impact=0.75,
        recommended_investigations=[
            RecommendedInvestigation(
                action="find_evidence",
                reason="Evidence support is weak or unverified.",
                priority=2,
                target_node_id=medium_node.id,
            )
        ],
    ).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": [high_item, medium_item], "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/adaptive-depth/approvals",
        headers=USER_HEADERS,
        json={
            "debate_id": debate.id,
            "selected_node_ids": [high_node.id],
            "approval_reason": "Reviewer approved the high-pressure adaptive depth recommendation.",
        },
    )

    assert response.status_code == 202
    body = response.json()
    assert body["debate_id"] == debate.id
    assert body["status"] == "queued"
    assert body["selected_node_ids"] == [high_node.id]
    assert body["queued_node_ids"] == [high_node.id]
    assert body["unavailable_node_ids"] == []
    assert set(body) == {
        "debate_id",
        "status",
        "selected_node_ids",
        "queued_node_ids",
        "unavailable_node_ids",
        "jobs",
        "audit_record_id",
    }
    assert len(body["jobs"]) == 1
    db.expire_all()
    job = db.get(Job, body["jobs"][0]["job_id"])
    assert job is not None
    assert job.debate_id == debate.id
    assert job.node_id == high_node.id
    assert job.job_type == "argue"
    assert job.required_role == "proposer"
    assert job.required_model == "mock-local"
    assert job.status == "pending"
    assert db.get(Node, high_node.id).status == "pending"
    assert db.get(Node, medium_node.id).status == "complete"
    records = db.scalars(
        select(ProvenanceRecord)
        .where(ProvenanceRecord.debate_id == debate.id, ProvenanceRecord.artifact_kind == "adaptive_expansion")
        .order_by(ProvenanceRecord.created_at.asc(), ProvenanceRecord.id.asc())
    ).all()
    assert len(records) == 1
    assert records[0].id == body["audit_record_id"]
    assert records[0].metadata_json["selected_node_ids"] == [high_node.id]
    assert records[0].metadata_json["selected_node_count"] == 1
    assert records[0].metadata_json["approval_reason"] == (
        "Reviewer approved the high-pressure adaptive depth recommendation."
    )


def test_scoring_api_approve_adaptive_depth_run_rejects_over_limit_before_queueing(db, monkeypatch) -> None:
    monkeypatch.setattr(scoring_api, "MAX_ADAPTIVE_DEPTH_APPROVAL_EXPANSIONS", 1, raising=False)
    regenerate_calls = []

    async def fail_if_regenerate_node_is_called(*args, **kwargs):
        regenerate_calls.append((args, kwargs))
        raise AssertionError("over-limit adaptive approval must not call regenerate_node")

    monkeypatch.setattr(scoring_api, "regenerate_node", fail_if_regenerate_node_is_called)
    worker = Worker(
        name="mac-mini",
        token_hash=hash_token("worker-token"),
        capabilities=["mock-local"],
        status="online",
    )
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={"max_depth": 2})
    high_node = Node(
        id="high-node",
        debate=debate,
        node_type="PRO",
        depth=1,
        position=0,
        claim="Remote work reduces commute-related attrition.",
        status="complete",
        materialized_path="/0",
    )
    medium_node = Node(
        id="medium-node",
        debate=debate,
        node_type="CON",
        depth=1,
        position=1,
        claim="Remote work weakens collaboration enough to offset gains.",
        status="complete",
        materialized_path="/1",
    )
    db.add_all([worker, debate, high_node, medium_node])
    db.flush()
    debate.root_node_id = high_node.id
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    high_item = explicit_depth_pressure_payload(
        node_id=high_node.id,
        holes=[
            ScoringHole(
                type="assumption_risk",
                severity="high",
                description="The argument depends on an unstated adoption assumption.",
                source="critic",
            )
        ],
        impact=0.75,
        uncertainty=0.5,
        recommended_investigations=[
            RecommendedInvestigation(
                action="challenge",
                reason="A priority-one challenge marks an unanswered attack.",
                priority=1,
                target_node_id=high_node.id,
            )
        ],
    ).model_dump(mode="json")
    medium_item = explicit_depth_pressure_payload(
        node_id=medium_node.id,
        holes=[
            ScoringHole(
                type="missing_evidence",
                severity="high",
                description="No source verifies the core premise.",
                source="evidence_auditor",
            )
        ],
        impact=0.75,
        uncertainty=0.5,
        recommended_investigations=[
            RecommendedInvestigation(
                action="find_evidence",
                reason="Evidence support is weak or unverified.",
                priority=2,
                target_node_id=medium_node.id,
            )
        ],
    ).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": [high_item, medium_item], "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).post(
        f"/api/debates/{debate.id}/scoring/adaptive-depth/approvals",
        headers=USER_HEADERS,
        json={
            "debate_id": debate.id,
            "selected_node_ids": [high_node.id, medium_node.id],
            "approval_reason": "Reviewer selected too many adaptive depth recommendations.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "unavailable"
    assert body["selected_node_ids"] == [high_node.id, medium_node.id]
    assert body["queued_node_ids"] == []
    assert body["unavailable_node_ids"] == [high_node.id, medium_node.id]
    assert body["jobs"] == []
    assert body["audit_record_id"] is None
    assert body["reason"] == "Adaptive depth approval is limited to 1 expansion per request."
    assert regenerate_calls == []
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []
    assert (
        db.scalars(
            select(ProvenanceRecord).where(
                ProvenanceRecord.debate_id == debate.id,
                ProvenanceRecord.artifact_kind == "adaptive_expansion",
            )
        ).all()
        == []
    )
    assert db.get(Node, high_node.id).status == "complete"
    assert db.get(Node, medium_node.id).status == "complete"


def test_scoring_api_force_refresh_requires_user_auth(db, monkeypatch) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.commit()
    fake_provider = FakeProvider(
        responses={
            "judge": json.dumps(base_assessment(node_id=node.id).model_dump(mode="json")),
        }
    )
    registry_factory_calls = []

    def fail_if_registry_is_built() -> ProviderRegistry:
        registry_factory_calls.append("called")
        return ProviderRegistry(
            agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
            providers={"codex": fake_provider},
        )

    monkeypatch.setattr(scoring_api, "scoring_provider_registry_dependency", fail_if_registry_is_built)

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring?force_refresh=true")

    assert response.status_code == 401
    assert response.json()["detail"] == "Bearer token required"
    assert registry_factory_calls == []
    assert fake_provider.calls == []


def test_scoring_api_authenticated_force_refresh_bypasses_cache_and_calls_provider(db, monkeypatch) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-1",
        node=node,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    node.active_generation_id = generation.id
    db.add_all([debate, worker, node, generation])
    db.flush()
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    cached_item = {"node_id": node.id, "status": "available"}
    db.add(
        NodeScoringResult(
            debate_id=debate.id,
            node_id=node.id,
            input_hash=node_scoring_input_hash(claim=claim, argument_text=generation.argument),
            judge_role="judge",
            provider="codex",
            model="codex-test-model",
            provider_metadata={"provider": "codex", "model": "codex-test-model", "status": "available"},
            status="available",
            result={
                "debate_id": debate.id,
                "status": "available",
                "node_ids": [node.id],
                "items": [cached_item],
                "model_metadata": {
                    "provider": "codex",
                    "model": "codex-test-model",
                    "checked_at": "2026-06-18T09:00:00+00:00",
                    "status": "available",
                },
            },
        )
    )
    db.commit()
    fake_provider = FakeProvider(
        responses={
            "judge": json.dumps(base_assessment(node_id=node.id).model_dump(mode="json")),
        }
    )
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": fake_provider},
    )
    monkeypatch.setattr(scoring_api, "scoring_provider_registry_dependency", lambda: registry)

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring?force_refresh=true", headers=USER_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert len(fake_provider.calls) == 1
    assert fake_provider.calls[0]["role"] == "judge"
    assert fake_provider.calls[0]["response_format"] == "json"
    assert body["status"] == "available"
    assert body["items"][0]["node_id"] == node.id
    assert body["items"][0] != cached_item
    assert "scores" in body["items"][0]
    assert body["model_metadata"] == {
        "provider": "codex",
        "model": "codex-test-model",
        "checked_at": body["model_metadata"]["checked_at"],
        "status": "available",
    }


def test_scoring_jobs_api_authenticated_refresh_completes_inline_and_persists_job(db, monkeypatch) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-root",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    root.active_generation_id = generation.id
    db.add_all([debate, worker, root, generation])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    fake_provider = FakeProvider(
        responses={
            "judge": json.dumps(base_assessment(node_id=root.id).model_dump(mode="json")),
        }
    )
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": fake_provider},
    )
    monkeypatch.setattr(scoring_api, "scoring_provider_registry_dependency", lambda: registry)

    response = TestClient(app).post(f"/api/debates/{debate.id}/scoring/jobs", headers=USER_HEADERS)

    assert response.status_code == 202
    body = response.json()
    assert body["debate_id"] == debate.id
    assert body["status"] == "queued"
    assert len(fake_provider.calls) == 1

    db.expire_all()
    job = db.get(Job, body["job_id"])
    assert job is not None
    assert job.job_type == "score_debate"
    assert job.required_role == "judge"
    assert job.status == "complete"
    assert job.error is None

    scoring_response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")
    assert scoring_response.status_code == 200
    scoring_payload = scoring_response.json()
    assert scoring_payload["status"] == "available"
    assert scoring_payload["items"][0]["node_id"] == root.id


def test_scoring_jobs_api_authenticated_refresh_failure_stays_honest_unavailable(db, monkeypatch) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-root",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    root.active_generation_id = generation.id
    db.add_all([debate, worker, root, generation])
    db.flush()
    debate.root_node_id = root.id
    db.commit()

    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": FakeProvider()},
    )

    def fail_scoring_refresh(*args, **kwargs):
        raise ProviderError("Scoring provider timed out.")

    monkeypatch.setattr(scoring_api, "scoring_provider_registry_dependency", lambda: registry)
    monkeypatch.setattr(scoring_api, "score_debate_with_provider_registry", fail_scoring_refresh)

    response = TestClient(app).post(f"/api/debates/{debate.id}/scoring/jobs", headers=USER_HEADERS)

    assert response.status_code == 202
    body = response.json()
    assert body["debate_id"] == debate.id
    assert body["status"] == "queued"
    assert set(body) == {"debate_id", "job_id", "status"}

    db.expire_all()
    job = db.get(Job, body["job_id"])
    assert job is not None
    assert job.status == "failed"
    assert job.error == "Scoring provider timed out."
    assert db.scalars(select(AnalyzerRun).where(AnalyzerRun.debate_id == debate.id)).all() == []

    scoring_response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")
    assert scoring_response.status_code == 200
    scoring_payload = scoring_response.json()
    assert scoring_payload["status"] == "unavailable"
    assert scoring_payload["items"] == []
    assert scoring_payload["reason"] == "No scoring judge outputs are available for this debate."


def test_scoring_jobs_api_persisted_refresh_keeps_public_payload_sanitized(db, monkeypatch) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, root])
    db.flush()
    debate.root_node_id = root.id
    db.commit()
    scoring_item = explicit_depth_pressure_payload(node_id=root.id).model_dump(mode="json")
    scoring_item["debug"] = {
        "reducer_version": "node-scoring-reducer-v1",
        "rubric_version": "debateai-rubric-v1",
        "judge_outputs": {"raw": "secret-token private judge trace"},
    }
    internal_payload = scoring_result_payload(
        debate_id=debate.id,
        node_ids=[root.id],
        items=[scoring_item],
        errors=[],
        model_metadata={
            "provider": "codex --api-key secret-token",
            "model": "gpt-5.4 OPENAI_API_KEY=secret-token",
            "checked_at": "2026-06-18T10:15:30+00:00",
            "status": "available",
            "command": ["codex", "--api-key", "secret-token"],
        },
    )
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": FakeProvider()},
    )

    monkeypatch.setattr(scoring_api, "scoring_provider_registry_dependency", lambda: registry)
    monkeypatch.setattr(scoring_api, "score_debate_with_provider_registry", lambda *args, **kwargs: internal_payload)

    response = TestClient(app).post(f"/api/debates/{debate.id}/scoring/jobs", headers=USER_HEADERS)

    assert response.status_code == 202
    assert response.json()["status"] == "queued"
    scoring_response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")
    assert scoring_response.status_code == 200
    body = scoring_response.json()
    assert body["status"] == "available"
    assert body["items"][0]["debug"] == {
        "reducer_version": "node-scoring-reducer-v1",
        "rubric_version": "debateai-rubric-v1",
    }
    assert body["model_metadata"] == {
        "checked_at": "2026-06-18T10:15:30+00:00",
        "status": "available",
    }
    assert "judge_outputs" not in str(body)
    assert "secret-token" not in str(body)
    assert "--api-key" not in str(body)


def test_scoring_api_force_refresh_scores_real_stored_debate_generation_path(db, monkeypatch) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    worker = Worker(id="worker-a", name="Worker A", token_hash="hash", capabilities=["debate"])
    root = Node(
        id="root-node",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves retention.",
        status="complete",
        materialized_path="/",
    )
    generation = Generation(
        id="generation-root",
        node=root,
        model_id="model-a",
        role="pro",
        argument="Employees are less likely to leave when commutes are removed.",
        worker_id=worker.id,
    )
    root.active_generation_id = generation.id
    db.add_all([debate, worker, root, generation])
    db.flush()
    debate.root_node_id = root.id
    db.commit()
    fake_provider = FakeProvider(
        responses={
            "judge": json.dumps(base_assessment(node_id=root.id).model_dump(mode="json")),
        }
    )
    registry = ProviderRegistry(
        agents={"judge": AgentConfig(provider="codex", model="codex-test-model", temperature=0.0)},
        providers={"codex": fake_provider},
    )
    monkeypatch.setattr(scoring_api, "scoring_provider_registry_dependency", lambda: registry)

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring?force_refresh=true", headers=USER_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["debate_id"] == debate.id
    assert body["status"] == "available"
    assert body["node_ids"] == [root.id]
    assert body["items"][0]["node_id"] == root.id
    assert body["items"][0]["claim"]["core_claim"] == "Remote work improves retention."
    assert body["items"][0]["scores"]["evidence_quality"] == 0.2
    assert body["items"][0]["labels"]["strength_label"] == "mixed"
    assert body["model_metadata"] == {
        "provider": "codex",
        "model": "codex-test-model",
        "checked_at": body["model_metadata"]["checked_at"],
        "status": "available",
    }
    assert len(fake_provider.calls) == 1
    provider_call = fake_provider.calls[0]
    assert provider_call["role"] == "judge"
    assert provider_call["response_format"] == "json"
    rendered_messages = json.dumps(provider_call["messages"])
    assert root.claim in rendered_messages
    assert generation.argument in rendered_messages
    db.expire_all()
    persisted = db.scalars(select(NodeScoringResult).where(NodeScoringResult.debate_id == debate.id)).one()
    assert persisted.node_id == root.id
    assert persisted.status == "available"
    assert persisted.result["items"][0]["node_id"] == root.id
    assert persisted.result["items"][0]["claim"]["core_claim"] == "Remote work improves retention."


def test_scoring_api_strips_raw_debug_judge_outputs_from_public_payload(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id=node.id), base_assessment()).model_dump(mode="json")
    scoring_item["debug"] = {
        "reducer_version": "node-scoring-reducer-v1",
        "rubric_version": "debateai-rubric-v1",
        "judge_outputs": {"raw": "private judge trace"},
    }
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": [scoring_item], "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["debug"] == {
        "reducer_version": "node-scoring-reducer-v1",
        "rubric_version": "debateai-rubric-v1",
    }


def test_scoring_api_hides_secret_like_debug_metadata(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id=node.id), base_assessment()).model_dump(mode="json")
    scoring_item["debug"] = {
        "reducer_version": "node-scoring-reducer-v1 --api-key secret-token",
        "rubric_version": "debateai-rubric-v1 OPENAI_API_KEY=secret-token",
        "judge_outputs": {"raw": "secret-token private judge trace"},
    }
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={"status": "available", "items": [scoring_item], "producer": "stored-judge-output"},
            status="complete",
            provenance={"scoring_source": "judge_outputs"},
        )
    )
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert "debug" not in item
    assert "secret-token" not in str(response.json())


def test_scoring_api_exposes_stored_partial_status_without_fake_data(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete")
    node = Node(
        id="node-1",
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add_all([debate, node])
    db.flush()
    branch = DebateBranch(debate_id=debate.id, status="active")
    db.add(branch)
    db.flush()
    scoring_item = reduce_assessments(base_claim(node_id=node.id), base_assessment()).model_dump(mode="json")
    db.add(
        AnalyzerRun(
            debate_id=debate.id,
            branch_id=branch.id,
            analyzer_type="node_scoring",
            output={
                "status": "partial",
                "items": [scoring_item],
                "producer": "stored-judge-output",
            },
            provenance={"scoring_source": "judge_outputs"},
            status="complete",
        )
    )
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial"
    assert len(body["items"]) == 1
    assert body["items"][0]["node_id"] == scoring_item["node_id"]
    assert body["items"][0]["scores"] == scoring_item["scores"]
    assert body["producer"] == "stored-judge-output"
    assert "reason" not in body


def test_scoring_api_hides_missing_and_archived_debates(db) -> None:
    archived = Debate(topic="Archived", status="archived")
    db.add(archived)
    db.commit()

    client = TestClient(app)

    assert client.get("/api/debates/not-found/scoring").status_code == 404
    assert client.get(f"/api/debates/{archived.id}/scoring").status_code == 404


def test_scoring_job_start_requires_user_auth(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    db.add(debate)
    db.commit()

    response = TestClient(app).post(f"/api/debates/{debate.id}/scoring/jobs")

    assert response.status_code == 401
    assert db.scalars(select(Job).where(Job.debate_id == debate.id)).all() == []


def test_scoring_job_start_queues_and_completes_score_debate_job(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    db.add(debate)
    db.commit()

    response = TestClient(app).post(f"/api/debates/{debate.id}/scoring/jobs", headers=USER_HEADERS)

    assert response.status_code == 202
    body = response.json()
    assert body["debate_id"] == debate.id
    assert body["status"] == "queued"
    assert set(body) == {"debate_id", "job_id", "status"}
    db.expire_all()
    job = db.get(Job, body["job_id"])
    assert job is not None
    assert job.debate_id == debate.id
    assert job.job_type == "score_debate"
    assert job.required_role == "judge"
    assert job.required_model == "gpt-5.5"
    assert job.node_id is None
    assert job.status == "complete"
    assert db.scalars(select(AnalyzerRun).where(AnalyzerRun.debate_id == debate.id)).all()
    assert db.scalars(select(NodeScoringResult).where(NodeScoringResult.debate_id == debate.id)).all() == []


def test_scoring_job_start_hides_missing_and_archived_debates(db) -> None:
    archived = Debate(topic="Archived", status="archived", config={})
    db.add(archived)
    db.commit()

    client = TestClient(app)

    assert client.post("/api/debates/not-found/scoring/jobs", headers=USER_HEADERS).status_code == 404
    assert client.post(f"/api/debates/{archived.id}/scoring/jobs", headers=USER_HEADERS).status_code == 404
    assert db.scalars(select(Job).where(Job.debate_id == archived.id)).all() == []


@pytest.mark.parametrize(
    ("stored_status", "public_status"),
    [
        ("pending", "queued"),
        ("claimed", "running"),
        ("running", "running"),
        ("complete", "complete"),
    ],
)
def test_scoring_job_status_api_maps_real_job_state_without_progress(db, stored_status, public_status) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    db.add(debate)
    db.flush()
    job = queue_scoring_job(db, debate, model_id="codex-gpt-5.5")
    job.status = stored_status
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring/jobs/{job.id}")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "debate_id": debate.id,
        "job_id": job.id,
        "status": public_status,
    }
    assert "progress" not in body
    assert "percent" not in body
    assert "eta" not in body
    assert "items" not in body


def test_scoring_job_status_api_exposes_only_stored_failure_reason(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    db.add(debate)
    db.flush()
    job = queue_scoring_job(db, debate, model_id="codex-gpt-5.5")
    job.status = "failed"
    job.error = "Model timed out before returning a scoring result."
    db.commit()

    response = TestClient(app).get(f"/api/debates/{debate.id}/scoring/jobs/{job.id}")

    assert response.status_code == 200
    assert response.json() == {
        "debate_id": debate.id,
        "job_id": job.id,
        "status": "failed",
        "error": "Model timed out before returning a scoring result.",
    }


def test_scoring_job_status_api_hides_non_scoring_jobs_and_wrong_debates(db) -> None:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={})
    other_debate = Debate(topic="Should cities ban cars?", status="complete", config={})
    archived = Debate(topic="Archived", status="archived", config={})
    db.add_all([debate, other_debate, archived])
    db.flush()
    scoring_job = queue_scoring_job(db, debate, model_id="codex-gpt-5.5")
    other_job = queue_scoring_job(db, other_debate, model_id="codex-gpt-5.5")
    non_scoring_job = Job(
        debate_id=debate.id,
        job_type="decompose",
        required_role="decomposer",
        required_model="codex-gpt-5.5",
        status="pending",
    )
    archived_job = queue_scoring_job(db, archived, model_id="codex-gpt-5.5")
    db.add(non_scoring_job)
    db.commit()

    client = TestClient(app)

    assert client.get(f"/api/debates/{debate.id}/scoring/jobs/missing-job").status_code == 404
    assert client.get(f"/api/debates/{debate.id}/scoring/jobs/{other_job.id}").status_code == 404
    assert client.get(f"/api/debates/{debate.id}/scoring/jobs/{non_scoring_job.id}").status_code == 404
    assert client.get(f"/api/debates/missing-debate/scoring/jobs/{scoring_job.id}").status_code == 404
    assert client.get(f"/api/debates/{archived.id}/scoring/jobs/{archived_job.id}").status_code == 404


def test_scoring_api_docs_gate_cache_work_on_real_producer_contract() -> None:
    docs_path = Path(__file__).resolve().parents[2] / "docs" / "scoring-api.md"
    docs = docs_path.read_text(encoding="utf-8")

    assert "GET /api/debates/{id}/scoring without `force_refresh` is a read API" in docs
    assert "`force_refresh=true` bypasses matching node-scoring cache entries" in docs
    assert "ProviderRegistry" in docs
    assert "score_nodes_with_provider" in docs
    assert "force_refresh: true" in docs
    assert "must not fabricate scores when no real provider is\navailable" in docs
    assert "not durable completed\nanalyzer-run records" in docs
    assert "Option B is the active contract for this refactor" in docs
    assert "synchronous transitional refresh rather than a real background worker job" in docs
    assert "`GET /api/debates/{id}/scoring` remains a read path" in docs
    assert "Real async worker scoring is explicitly deferred to a later milestone" in docs
    assert "scoring_source: \"judge_outputs\"" in docs
    assert "must not create or\ncache fake runtime scores" in docs
