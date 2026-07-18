from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.evidence.model import EntailmentLabel, EvidenceScore, EvidenceStatus
from app.scoring.models import ClaimType, NodeScoringPayload


ExpansionAction = Literal["continue", "deepen", "seek_evidence", "challenge", "abandon", "reopen"]
PathState = Literal["active", "abandoned"]
EXPANSION_ACTIONS = {"continue", "deepen", "seek_evidence", "challenge", "abandon", "reopen"}

EVIDENCE_REQUIRED_CLAIM_TYPES = {"empirical", "causal"}
UNRESOLVED_EVIDENCE_STATUSES = {
    EvidenceStatus.MISSING,
    EvidenceStatus.UNAVAILABLE,
    EvidenceStatus.NO_INFO,
}
ADVERSE_EVIDENCE_STATUSES = {
    EvidenceStatus.REFUTED,
    EvidenceStatus.CONTRADICTED,
    EvidenceStatus.RETRACTED,
}


def _unit_interval(value: float, field_name: str) -> float:
    numeric = float(value)
    if numeric < 0.0 or numeric > 1.0:
        raise ValueError(f"{field_name} must be between 0 and 1")
    return numeric


def _non_empty(value: str, field_name: str) -> str:
    cleaned = str(value).strip()
    if not cleaned:
        raise ValueError(f"{field_name} cannot be empty")
    return cleaned


@dataclass(frozen=True)
class ScoreSignal:
    node_id: str
    claim_type: ClaimType
    strength: float
    uncertainty: float
    impact: float
    evidence_quality: float
    logical_validity: float
    assumption_risk: float
    counter_resilience: float
    holes: tuple[str, ...] = ()
    fatal_flags: tuple[str, ...] = ()
    recommended_actions: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "node_id", _non_empty(self.node_id, "node_id"))
        for field_name in (
            "strength",
            "uncertainty",
            "impact",
            "evidence_quality",
            "logical_validity",
            "assumption_risk",
            "counter_resilience",
        ):
            object.__setattr__(self, field_name, _unit_interval(getattr(self, field_name), field_name))
        object.__setattr__(self, "holes", tuple(str(hole) for hole in self.holes))
        object.__setattr__(self, "fatal_flags", tuple(str(flag) for flag in self.fatal_flags))
        object.__setattr__(
            self,
            "recommended_actions",
            tuple(str(action) for action in self.recommended_actions),
        )

    @classmethod
    def from_scoring_payload(cls, payload: NodeScoringPayload) -> "ScoreSignal":
        return cls(
            node_id=payload.node_id,
            claim_type=payload.claim.claim_type,
            strength=payload.scores.strength,
            uncertainty=payload.scores.uncertainty,
            impact=payload.scores.impact,
            evidence_quality=payload.scores.evidence_quality,
            logical_validity=payload.scores.logical_validity,
            assumption_risk=payload.scores.assumption_risk,
            counter_resilience=payload.scores.counter_resilience,
            holes=tuple(hole.type for hole in payload.holes),
            fatal_flags=tuple(f"{flag.type}:{flag.severity}" for flag in payload.fatal_flags),
            recommended_actions=tuple(item.action for item in payload.recommended_investigations),
        )


@dataclass(frozen=True)
class EvidenceSignal:
    status: EvidenceStatus
    base_score: float
    uncertainty: float
    entailment: EntailmentLabel
    caveats: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "status", EvidenceStatus(self.status))
        object.__setattr__(self, "base_score", _unit_interval(self.base_score, "base_score"))
        object.__setattr__(self, "uncertainty", _unit_interval(self.uncertainty, "uncertainty"))
        object.__setattr__(self, "entailment", EntailmentLabel(self.entailment))
        object.__setattr__(self, "caveats", tuple(str(caveat) for caveat in self.caveats))

    @classmethod
    def from_evidence_score(cls, score: EvidenceScore) -> "EvidenceSignal":
        return cls(
            status=score.status,
            base_score=score.base_score,
            uncertainty=score.uncertainty,
            entailment=score.entailment,
            caveats=score.caveats,
        )


@dataclass(frozen=True)
class ExpansionDecision:
    node_id: str
    action: ExpansionAction
    priority: float
    reasons: tuple[str, ...] = field(default_factory=tuple)
    keeps_path_active: bool = True

    def __post_init__(self) -> None:
        object.__setattr__(self, "node_id", _non_empty(self.node_id, "node_id"))
        if self.action not in EXPANSION_ACTIONS:
            raise ValueError(f"action must be one of {sorted(EXPANSION_ACTIONS)}")
        object.__setattr__(self, "priority", _unit_interval(self.priority, "priority"))
        object.__setattr__(self, "reasons", tuple(str(reason) for reason in self.reasons))


class ExplorationPolicy:
    def __init__(
        self,
        *,
        weak_strength_threshold: float = 0.2,
        low_impact_threshold: float = 0.2,
        resolved_uncertainty_threshold: float = 0.2,
        evidence_quality_threshold: float = 0.3,
        high_uncertainty_threshold: float = 0.45,
        high_assumption_risk_threshold: float = 0.6,
        high_impact_threshold: float = 0.5,
    ) -> None:
        self.weak_strength_threshold = _unit_interval(weak_strength_threshold, "weak_strength_threshold")
        self.low_impact_threshold = _unit_interval(low_impact_threshold, "low_impact_threshold")
        self.resolved_uncertainty_threshold = _unit_interval(
            resolved_uncertainty_threshold,
            "resolved_uncertainty_threshold",
        )
        self.evidence_quality_threshold = _unit_interval(
            evidence_quality_threshold,
            "evidence_quality_threshold",
        )
        self.high_uncertainty_threshold = _unit_interval(
            high_uncertainty_threshold,
            "high_uncertainty_threshold",
        )
        self.high_assumption_risk_threshold = _unit_interval(
            high_assumption_risk_threshold,
            "high_assumption_risk_threshold",
        )
        self.high_impact_threshold = _unit_interval(high_impact_threshold, "high_impact_threshold")

    def decide(
        self,
        *,
        score: ScoreSignal,
        evidence: EvidenceSignal | None = None,
        path_state: PathState = "active",
    ) -> ExpansionDecision:
        if path_state == "abandoned" and self._should_reopen(score, evidence):
            return self._decision(
                score,
                "reopen",
                priority=max(score.impact, score.strength),
                reasons=("new grounded support warrants reopening the paused path",),
                keeps_path_active=True,
            )

        challenge_reasons = self._challenge_reasons(score, evidence)
        if challenge_reasons:
            return self._decision(
                score,
                "challenge",
                priority=max(0.65, score.impact, 1.0 - score.logical_validity),
                reasons=challenge_reasons,
            )

        evidence_reasons = self._seek_evidence_reasons(score, evidence)
        abandon_blockers = self._abandon_blockers(score, evidence)
        if evidence_reasons:
            return self._decision(
                score,
                "seek_evidence",
                priority=max(score.impact, score.uncertainty, 1.0 - score.evidence_quality),
                reasons=tuple(evidence_reasons + abandon_blockers),
            )

        deepen_reasons = self._deepen_reasons(score)
        if deepen_reasons:
            return self._decision(
                score,
                "deepen",
                priority=max(score.impact, score.uncertainty, score.assumption_risk),
                reasons=deepen_reasons,
            )

        if not abandon_blockers and self._can_abandon(score, evidence):
            return self._decision(
                score,
                "abandon",
                priority=max(0.1, 1.0 - score.strength),
                reasons=("low-strength low-impact path is resolved enough to pause",),
                keeps_path_active=False,
            )

        return self._decision(
            score,
            "continue",
            priority=max(score.impact, score.uncertainty, 1.0 - score.strength),
            reasons=("no expansion pressure crosses policy thresholds",),
        )

    def _challenge_reasons(self, score: ScoreSignal, evidence: EvidenceSignal | None) -> tuple[str, ...]:
        reasons: list[str] = []
        if evidence and (
            evidence.status in ADVERSE_EVIDENCE_STATUSES
            or evidence.entailment == EntailmentLabel.REFUTES
        ):
            reasons.append("evidence refutes or contradicts the claim")
        if any(flag.startswith("contradiction:high") for flag in score.fatal_flags):
            reasons.append("high-severity contradiction should be challenged")
        return tuple(reasons)

    def _seek_evidence_reasons(self, score: ScoreSignal, evidence: EvidenceSignal | None) -> list[str]:
        reasons: list[str] = []
        requires_evidence = score.claim_type in EVIDENCE_REQUIRED_CLAIM_TYPES
        unresolved_evidence = evidence is None or evidence.status in UNRESOLVED_EVIDENCE_STATUSES
        weak_evidence = score.evidence_quality < self.evidence_quality_threshold
        if requires_evidence and (unresolved_evidence or weak_evidence):
            reasons.append(f"{score.claim_type} evidence is not grounded")
        if "find_evidence" in score.recommended_actions and weak_evidence:
            reasons.append("scoring recommended evidence investigation")
        return reasons

    def _deepen_reasons(self, score: ScoreSignal) -> tuple[str, ...]:
        reasons: list[str] = []
        if (
            score.claim_type == "normative"
            and score.assumption_risk >= self.high_assumption_risk_threshold
        ):
            reasons.append("normative claim has unresolved assumptions")
        if score.uncertainty >= self.high_uncertainty_threshold and score.impact >= self.high_impact_threshold:
            reasons.append("high-impact claim remains uncertain")
        if "decompose" in score.recommended_actions:
            reasons.append("scoring recommended decomposition")
        return tuple(reasons)

    def _abandon_blockers(self, score: ScoreSignal, evidence: EvidenceSignal | None) -> list[str]:
        blockers: list[str] = []
        if evidence is None or evidence.status in UNRESOLVED_EVIDENCE_STATUSES:
            blockers.append("abandon blocked until evidence status is resolved")
        if score.uncertainty >= self.high_uncertainty_threshold and score.impact >= self.high_impact_threshold:
            blockers.append("abandon blocked while high-impact uncertainty remains")
        if score.fatal_flags:
            blockers.append("abandon blocked until fatal flags are challenged")
        return blockers

    def _can_abandon(self, score: ScoreSignal, evidence: EvidenceSignal | None) -> bool:
        if evidence is None:
            return False
        return (
            score.strength < self.weak_strength_threshold
            and score.impact < self.low_impact_threshold
            and score.uncertainty <= self.resolved_uncertainty_threshold
            and evidence.status == EvidenceStatus.GROUNDED
            and evidence.uncertainty < self.resolved_uncertainty_threshold
        )

    @staticmethod
    def _should_reopen(score: ScoreSignal, evidence: EvidenceSignal | None) -> bool:
        return bool(
            evidence
            and evidence.status == EvidenceStatus.GROUNDED
            and evidence.entailment == EntailmentLabel.SUPPORTS
            and evidence.base_score >= 0.6
            and score.strength >= 0.5
        )

    @staticmethod
    def _decision(
        score: ScoreSignal,
        action: ExpansionAction,
        *,
        priority: float,
        reasons: tuple[str, ...],
        keeps_path_active: bool = True,
    ) -> ExpansionDecision:
        return ExpansionDecision(
            node_id=score.node_id,
            action=action,
            priority=min(1.0, max(0.0, priority)),
            reasons=reasons,
            keeps_path_active=keeps_path_active,
        )
