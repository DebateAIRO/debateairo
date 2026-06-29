from __future__ import annotations

import pytest

from app.evidence import EntailmentLabel, EvidenceScore, EvidenceStatus
from app.exploration import (
    EvidenceSignal,
    ExpansionAction,
    ExpansionDecision,
    ExplorationPolicy,
    ScoreSignal,
)
from app.scoring.models import (
    FatalFlag,
    NodeScoringPayload,
    NodeScores,
    NormalizedClaim,
    RecommendedInvestigation,
    ScoreLabels,
    ScoreRationale,
    ScoringHole,
)


def score_signal(**overrides) -> ScoreSignal:
    data = {
        "node_id": "node-1",
        "claim_type": "empirical",
        "strength": 0.62,
        "uncertainty": 0.24,
        "impact": 0.55,
        "evidence_quality": 0.65,
        "logical_validity": 0.72,
        "assumption_risk": 0.28,
        "counter_resilience": 0.58,
        "holes": (),
        "fatal_flags": (),
        "recommended_actions": (),
    }
    data.update(overrides)
    return ScoreSignal(**data)


def evidence_signal(**overrides) -> EvidenceSignal:
    data = {
        "status": EvidenceStatus.GROUNDED,
        "base_score": 0.72,
        "uncertainty": 0.18,
        "entailment": EntailmentLabel.SUPPORTS,
        "caveats": (),
    }
    data.update(overrides)
    return EvidenceSignal(**data)


def decide(score: ScoreSignal, evidence: EvidenceSignal | None = None) -> ExpansionDecision:
    return ExplorationPolicy().decide(score=score, evidence=evidence or evidence_signal())


def test_empirical_claim_seeks_evidence_when_support_is_missing() -> None:
    decision = decide(
        score_signal(claim_type="empirical", evidence_quality=0.22),
        evidence_signal(status=EvidenceStatus.MISSING, base_score=0.2, uncertainty=0.76),
    )

    assert decision.action == "seek_evidence"
    assert decision.node_id == "node-1"
    assert decision.keeps_path_active is True
    assert "empirical evidence is not grounded" in decision.reasons


def test_causal_claim_challenges_refuted_evidence() -> None:
    decision = decide(
        score_signal(claim_type="causal", strength=0.48, evidence_quality=0.18),
        evidence_signal(
            status=EvidenceStatus.REFUTED,
            base_score=0.1,
            uncertainty=0.2,
            entailment=EntailmentLabel.REFUTES,
        ),
    )

    assert decision.action == "challenge"
    assert decision.keeps_path_active is True
    assert "evidence refutes or contradicts the claim" in decision.reasons


def test_normative_claim_deepens_when_assumptions_are_risky() -> None:
    decision = decide(
        score_signal(
            claim_type="normative",
            uncertainty=0.53,
            assumption_risk=0.71,
            recommended_actions=("decompose",),
        )
    )

    assert decision.action == "deepen"
    assert decision.priority > 0.5
    assert "normative claim has unresolved assumptions" in decision.reasons


def test_definitional_claim_continues_when_clear_and_grounded() -> None:
    decision = decide(
        score_signal(
            claim_type="definitional",
            strength=0.78,
            uncertainty=0.11,
            impact=0.36,
            evidence_quality=0.68,
            logical_validity=0.86,
            assumption_risk=0.12,
        )
    )

    assert decision.action == "continue"
    assert decision.priority < 0.5
    assert decision.keeps_path_active is True
    assert "no expansion pressure crosses policy thresholds" in decision.reasons


def test_low_value_resolved_path_can_be_abandoned_without_deletion() -> None:
    decision = decide(
        score_signal(strength=0.12, uncertainty=0.08, impact=0.09, evidence_quality=0.64),
        evidence_signal(status=EvidenceStatus.GROUNDED, base_score=0.14, uncertainty=0.08),
    )

    assert decision.action == "abandon"
    assert decision.keeps_path_active is False
    assert "low-strength low-impact path is resolved enough to pause" in decision.reasons


def test_missing_evidence_prevents_abandon_even_for_weak_path() -> None:
    decision = decide(
        score_signal(strength=0.11, uncertainty=0.07, impact=0.08, evidence_quality=0.1),
        evidence_signal(status=EvidenceStatus.MISSING, base_score=0.1, uncertainty=0.74),
    )

    assert decision.action == "seek_evidence"
    assert decision.keeps_path_active is True
    assert "abandon blocked until evidence status is resolved" in decision.reasons


def test_abandoned_path_reopens_when_new_grounded_support_arrives() -> None:
    decision = ExplorationPolicy().decide(
        score=score_signal(strength=0.67, uncertainty=0.22, impact=0.42),
        evidence=evidence_signal(status=EvidenceStatus.GROUNDED, base_score=0.76, uncertainty=0.14),
        path_state="abandoned",
    )

    assert decision.action == "reopen"
    assert decision.keeps_path_active is True
    assert "new grounded support warrants reopening the paused path" in decision.reasons


def test_signals_adapt_from_scoring_and_evidence_contracts() -> None:
    payload = NodeScoringPayload(
        node_id="node-2",
        claim=NormalizedClaim(
            node_id="node-2",
            raw_text="Remote work increases retention.",
            core_claim="Remote work increases retention.",
            claim_type="causal",
        ),
        scores=NodeScores(
            strength=0.44,
            uncertainty=0.62,
            impact=0.7,
            evidence_quality=0.2,
            relevance=0.8,
            logical_validity=0.68,
            assumption_risk=0.55,
            counter_resilience=0.31,
        ),
        labels=ScoreLabels(strength_label="mixed", uncertainty_label="high", impact_label="high"),
        holes=[
            ScoringHole(
                type="missing_evidence",
                severity="high",
                description="No source backs the causal mechanism.",
                source="evidence_auditor",
            )
        ],
        fatal_flags=[
            FatalFlag(type="contradiction", severity="medium", description="Tension in causal timing.")
        ],
        score_caps=[],
        judge_disagreements=[],
        recommended_investigations=[
            RecommendedInvestigation(action="find_evidence", reason="Need sources.", priority=1)
        ],
        rationale=ScoreRationale(
            short="Fixture.",
            why_not_higher="Missing evidence.",
            why_not_lower="Some support.",
            weakest_link="Evidence.",
        ),
    )
    evidence = EvidenceScore(
        reference="source-1",
        base_score=0.2,
        uncertainty=0.7,
        entailment=EntailmentLabel.NOINFO,
        status=EvidenceStatus.NO_INFO,
    )

    score = ScoreSignal.from_scoring_payload(payload)
    signal = EvidenceSignal.from_evidence_score(evidence)

    assert score.node_id == "node-2"
    assert score.claim_type == "causal"
    assert score.holes == ("missing_evidence",)
    assert score.fatal_flags == ("contradiction:medium",)
    assert score.recommended_actions == ("find_evidence",)
    assert signal.status == EvidenceStatus.NO_INFO
    assert signal.entailment == EntailmentLabel.NOINFO


@pytest.mark.parametrize(
    "action",
    ["continue", "deepen", "seek_evidence", "challenge", "abandon", "reopen"],
)
def test_expansion_action_type_exposes_declared_actions(action: ExpansionAction) -> None:
    decision = ExpansionDecision(node_id="node-1", action=action, priority=0.5)

    assert decision.action == action


def test_expansion_decision_rejects_unknown_action() -> None:
    with pytest.raises(ValueError, match="action must be one of"):
        ExpansionDecision(node_id="node-1", action="delete", priority=0.5)
