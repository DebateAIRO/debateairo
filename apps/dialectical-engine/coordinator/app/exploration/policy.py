from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.evidence.model import EntailmentLabel, EvidenceScore, EvidenceStatus
from app.scoring.models import ClaimType, NodeScoringPayload


ExpansionAction = Literal["continue", "deepen", "seek_evidence", "challenge", "abandon", "reopen"]
PathState = Literal["active", "abandoned"]
SignalClass = Literal["categorical", "scalar"]
EXPANSION_ACTIONS = {"continue", "deepen", "seek_evidence", "challenge", "abandon", "reopen"}
# W4 categorical-only steering law: there is NO calibrated ground truth for
# scalar judge scores (app/scoring/calibration.py -- weights are declared
# cold-start/config values, never learned), so a decision may steer real work
# only when its grounding consulted exclusively categorical predicates:
# evidence status, entailment verdicts, fatal flags, claim-type evidence
# requirements (explicit user approval is categorical too, but lives outside
# this policy). P1 Task 4 refined the rule to match how the decision is
# actually made: a decision is categorical iff AT LEAST ONE of its GROUNDING
# reasons is categorical, because every reason in a grounding tuple is
# independently sufficient to fire the action -- so that categorical reason
# alone would have produced the same decision. A decision with no categorical
# grounding reason still fails closed to "scalar", as does one with no
# grounding at all. Classification is structural (derived from which
# predicates fired), never a judgment about the values themselves. Priorities
# are ranking metadata, not grounding, and do not participate; neither do
# blockers (reasons NOT to abandon), which are recorded on the decision for
# the audit trail but never ground it.
CATEGORICAL_SIGNAL = "categorical"
SCALAR_SIGNAL = "scalar"
SIGNAL_CLASSES = {CATEGORICAL_SIGNAL, SCALAR_SIGNAL}

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
    # Fail-closed default: an unclassified decision is treated as
    # scalar-grounded and can therefore never steer real work.
    signal_class: SignalClass = SCALAR_SIGNAL

    def __post_init__(self) -> None:
        object.__setattr__(self, "node_id", _non_empty(self.node_id, "node_id"))
        if self.action not in EXPANSION_ACTIONS:
            raise ValueError(f"action must be one of {sorted(EXPANSION_ACTIONS)}")
        object.__setattr__(self, "priority", _unit_interval(self.priority, "priority"))
        object.__setattr__(self, "reasons", tuple(str(reason) for reason in self.reasons))
        if self.signal_class not in SIGNAL_CLASSES:
            raise ValueError(f"signal_class must be one of {sorted(SIGNAL_CLASSES)}")


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
                # _should_reopen consults base_score/strength thresholds.
                reasons=(("new grounded support warrants reopening the paused path", SCALAR_SIGNAL),),
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
                reasons=tuple(evidence_reasons),
                # P1 Task 4: blockers are reasons NOT to abandon; they are
                # recorded as context but never ground the seek_evidence
                # decision, so a scalar blocker can no longer contaminate a
                # categorically-grounded one.
                blockers=tuple(abandon_blockers),
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
                # _can_abandon consults strength/impact/uncertainty thresholds.
                reasons=(("low-strength low-impact path is resolved enough to pause", SCALAR_SIGNAL),),
                keeps_path_active=False,
            )

        return self._decision(
            score,
            "continue",
            priority=max(score.impact, score.uncertainty, 1.0 - score.strength),
            # The fallback is grounded in the absence of threshold crossings.
            reasons=(("no expansion pressure crosses policy thresholds", SCALAR_SIGNAL),),
        )

    def _challenge_reasons(
        self, score: ScoreSignal, evidence: EvidenceSignal | None
    ) -> tuple[tuple[str, str], ...]:
        reasons: list[tuple[str, str]] = []
        if evidence and (
            evidence.status in ADVERSE_EVIDENCE_STATUSES
            or evidence.entailment == EntailmentLabel.REFUTES
        ):
            # Evidence status / entailment verdict: categorical predicates.
            reasons.append(("evidence refutes or contradicts the claim", CATEGORICAL_SIGNAL))
        if any(flag.startswith("contradiction:high") for flag in score.fatal_flags):
            # Fatal-flag membership: categorical predicate.
            reasons.append(("high-severity contradiction should be challenged", CATEGORICAL_SIGNAL))
        return tuple(reasons)

    def _seek_evidence_reasons(
        self, score: ScoreSignal, evidence: EvidenceSignal | None
    ) -> list[tuple[str, str]]:
        reasons: list[tuple[str, str]] = []
        requires_evidence = score.claim_type in EVIDENCE_REQUIRED_CLAIM_TYPES
        unresolved_evidence = evidence is None or evidence.status in UNRESOLVED_EVIDENCE_STATUSES
        weak_evidence = score.evidence_quality < self.evidence_quality_threshold
        if requires_evidence and (unresolved_evidence or weak_evidence):
            # Categorical only when the claim-type requirement plus the
            # unresolved evidence STATUS fired it; if it fired solely through
            # the evidence_quality threshold, the grounding is scalar.
            reasons.append(
                (
                    f"{score.claim_type} evidence is not grounded",
                    CATEGORICAL_SIGNAL if unresolved_evidence else SCALAR_SIGNAL,
                )
            )
        if "find_evidence" in score.recommended_actions and weak_evidence:
            # Requires the evidence_quality threshold consult: scalar.
            reasons.append(("scoring recommended evidence investigation", SCALAR_SIGNAL))
        return reasons

    def _deepen_reasons(self, score: ScoreSignal) -> tuple[tuple[str, str], ...]:
        # Every deepen predicate consults a scalar threshold (assumption
        # risk / uncertainty x impact) or a scoring recommendation that is
        # not in the categorical vocabulary: scalar-grounded throughout.
        reasons: list[tuple[str, str]] = []
        if (
            score.claim_type == "normative"
            and score.assumption_risk >= self.high_assumption_risk_threshold
        ):
            reasons.append(("normative claim has unresolved assumptions", SCALAR_SIGNAL))
        if score.uncertainty >= self.high_uncertainty_threshold and score.impact >= self.high_impact_threshold:
            reasons.append(("high-impact claim remains uncertain", SCALAR_SIGNAL))
        if "decompose" in score.recommended_actions:
            reasons.append(("scoring recommended decomposition", SCALAR_SIGNAL))
        return tuple(reasons)

    def _abandon_blockers(
        self, score: ScoreSignal, evidence: EvidenceSignal | None
    ) -> list[tuple[str, str]]:
        blockers: list[tuple[str, str]] = []
        if evidence is None or evidence.status in UNRESOLVED_EVIDENCE_STATUSES:
            blockers.append(("abandon blocked until evidence status is resolved", CATEGORICAL_SIGNAL))
        if score.uncertainty >= self.high_uncertainty_threshold and score.impact >= self.high_impact_threshold:
            blockers.append(("abandon blocked while high-impact uncertainty remains", SCALAR_SIGNAL))
        if score.fatal_flags:
            blockers.append(("abandon blocked until fatal flags are challenged", CATEGORICAL_SIGNAL))
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
        reasons: tuple[tuple[str, str], ...],
        blockers: tuple[tuple[str, str], ...] = (),
        keeps_path_active: bool = True,
    ) -> ExpansionDecision:
        # P1 Task 4: categorical iff AT LEAST ONE grounding reason is
        # categorical. Every reason in _challenge_reasons /
        # _seek_evidence_reasons is independently sufficient to fire its
        # action (the caller fires on a non-empty list), so a categorical
        # reason alone would have produced this same decision. The previous
        # all() rule meant additional scalar corroboration DOWNGRADED a
        # categorically-grounded decision, which is backwards -- and it is
        # why 6 of 6 production decisions were scalar.
        #
        # THE LAW is unchanged in substance: a decision with no categorical
        # reason still cannot spawn. Blockers never participate.
        signal_class = (
            CATEGORICAL_SIGNAL
            if any(reason_class == CATEGORICAL_SIGNAL for _, reason_class in reasons)
            else SCALAR_SIGNAL
        )
        return ExpansionDecision(
            node_id=score.node_id,
            action=action,
            priority=min(1.0, max(0.0, priority)),
            reasons=tuple(reason for reason, _ in reasons)
            + tuple(reason for reason, _ in blockers),
            keeps_path_active=keeps_path_active,
            signal_class=signal_class,
        )
