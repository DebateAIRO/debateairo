from __future__ import annotations

from app.scoring.caps import apply_score_caps
from app.scoring.disagreement import detect_disagreements
from app.scoring.models import (
    AdaptiveDepthDryRunItem,
    AdaptiveDepthDryRunPlan,
    AdaptiveDepthPolicy,
    ClaimAssessment,
    DepthPressureSelection,
    FatalFlag,
    InvestigationAction,
    JudgeDisagreement,
    NodeScores,
    NodeScoringPayload,
    NormalizedClaim,
    RecommendedInvestigation,
    ScoreCap,
    Severity,
    ScoreLabels,
    ScoreProvenance,
    ScoreRationale,
    ScoringDebug,
    ScoringHole,
    UncertaintyDriver,
)

# Task 4 (uncertainty -> labeled drivers + dispersion-derived numeric,
# docs/improvement-plan-2026-07-22.md Sec P2.1): bumped v1 -> v2 because
# reduce_assessments now emits uncertainty_drivers/uncertainty_source on
# every NodeScoringPayload (see _uncertainty_drivers below) -- a real,
# semantic change to what the reducer produces from the same inputs, so the
# judge contract_hash (app.scoring.judge_registry pins REDUCER_VERSION into
# it) must change and invalidate every cached NodeScoringResult/
# JudgeOutputArtifact, same as Task 3's prompt_version bump.
REDUCER_VERSION = "node-scoring-reducer-v2"
RUBRIC_VERSION = "debateai-rubric-v1"


def select_depth_pressure(payload: NodeScoringPayload) -> DepthPressureSelection:
    reasons: list[str] = []
    pressure_score = 0.0
    if any(hole.severity == "high" for hole in payload.holes):
        reasons.append("high_severity_holes")
        pressure_score += 0.25
    if payload.scores.impact >= 0.75:
        reasons.append("high_impact")
        pressure_score += 0.25
    if payload.scores.uncertainty >= 0.50:
        reasons.append("high_uncertainty")
        pressure_score += 0.25
    if any(item.action == "challenge" and item.priority == 1 for item in payload.recommended_investigations):
        reasons.append("unanswered_attack")
        pressure_score += 0.25
    pressure_score = _round(_clamp(pressure_score))
    return DepthPressureSelection(
        node_id=payload.node_id,
        pressure=_depth_pressure_label(pressure_score),
        score=pressure_score,
        reasons=reasons,
    )


def adaptive_depth_dry_run(
    payloads: list[NodeScoringPayload],
    *,
    policy: AdaptiveDepthPolicy | None = None,
) -> AdaptiveDepthDryRunPlan:
    policy = policy or AdaptiveDepthPolicy(mode="adaptive")
    items: list[AdaptiveDepthDryRunItem] = []
    for payload in payloads:
        selection = select_depth_pressure(payload)
        if selection.pressure == "low":
            continue
        items.append(
            AdaptiveDepthDryRunItem(
                node_id=payload.node_id,
                pressure=selection.pressure,
                score=selection.score,
                recommended_action=_recommended_action(payload),
                expansion_hint=_expansion_hint(selection),
                reasons=selection.reasons,
                hole_count=len(payload.holes),
                recommended_investigation_count=len(payload.recommended_investigations),
            )
        )
    items = sorted(items, key=lambda item: (-item.score, item.node_id))
    return AdaptiveDepthDryRunPlan(
        policy=policy,
        candidate_count=len(payloads),
        expansion_count=len(items),
        items=items,
    )


def reduce_assessments(claim: NormalizedClaim, assessment: ClaimAssessment) -> NodeScoringPayload:
    counter_resilience = 1.0 - assessment.critic.counterargument_strength
    clarity = max(0.0, 1.0 - (0.15 * len(claim.ambiguity_flags)))
    base_strength = (
        0.25 * assessment.critic.logical_validity
        + 0.25 * assessment.evidence.evidence_quality
        + 0.20 * counter_resilience
        + 0.15 * clarity
        + 0.15 * assessment.context.relevance
        - 0.20 * assessment.critic.assumption_risk
    )
    strength = _clamp(base_strength)
    impact = assessment.context.impact
    strength, impact, score_caps = apply_score_caps(
        claim=claim,
        assessment=assessment,
        strength=strength,
        impact=impact,
    )
    disagreements = detect_disagreements(assessment)
    holes = _rank_holes(claim, assessment)
    fatal_flags = [
        *assessment.critic.fatal_flags,
        *assessment.evidence.fatal_flags,
        *assessment.fallacy.fatal_flags,
    ]
    uncertainty = _uncertainty(claim, assessment, len(disagreements), len(score_caps))
    uncertainty_drivers = _uncertainty_drivers(claim, assessment, disagreements, score_caps)
    scores = NodeScores(
        strength=_round(strength),
        uncertainty=_round(uncertainty),
        impact=_round(impact),
        evidence_quality=_round(assessment.evidence.evidence_quality),
        relevance=_round(assessment.context.relevance),
        logical_validity=_round(assessment.critic.logical_validity),
        assumption_risk=_round(assessment.critic.assumption_risk),
        counter_resilience=_round(counter_resilience),
    )
    return NodeScoringPayload(
        node_id=claim.node_id,
        claim=claim,
        scores=scores,
        labels=ScoreLabels(
            strength_label=_label(scores.strength, low="weak", mid="mixed", high="strong"),
            uncertainty_label=_label(scores.uncertainty, low="low", mid="medium", high="high"),
            impact_label=_label(scores.impact, low="low", mid="medium", high="high"),
        ),
        holes=holes,
        fatal_flags=fatal_flags,
        score_caps=score_caps,
        judge_disagreements=disagreements,
        recommended_investigations=_recommended_investigations(
            claim.node_id,
            scores,
            assessment,
            holes,
            fatal_flags,
            disagreements,
        ),
        rationale=_rationale(claim, scores, holes),
        score_provenance=ScoreProvenance(
            raw_judge_output_kind="claim_assessment",
            raw_judge_output_included=False,
            final_score_source="deterministic_reducer",
            reducer_version=REDUCER_VERSION,
            rubric_version=RUBRIC_VERSION,
        ),
        debug=ScoringDebug(
            reducer_version=REDUCER_VERSION,
            rubric_version=RUBRIC_VERSION,
        ),
        uncertainty_drivers=uncertainty_drivers,
        # The reducer only ever sees a single ClaimAssessment, so it always
        # stamps the heuristic fallback source here. service.py's
        # _attach_plural_judge_provenance overrides this to "dispersion"
        # (and recomputes scores.uncertainty) when >=2 independent
        # persisted judge assessments exist for the node -- see
        # app.scoring.disagreement.dispersion_uncertainty.
        uncertainty_source="heuristic",
    )


def _rank_holes(claim: NormalizedClaim, assessment: ClaimAssessment) -> list[ScoringHole]:
    holes: list[ScoringHole] = []
    for item in assessment.evidence.missing_evidence:
        holes.append(
            ScoringHole(
                type="missing_evidence",
                severity="high",
                description=item,
                source="evidence_auditor",
            )
        )
    for item in claim.ambiguity_flags:
        holes.append(
            ScoringHole(
                type="ambiguity",
                severity="medium",
                description=item,
                source="claim_normalizer",
            )
        )
    if assessment.critic.assumption_risk >= 0.65:
        holes.append(
            ScoringHole(
                type="assumption_risk",
                severity="high",
                description="The claim depends on assumptions the current argument does not establish.",
                source="critic",
            )
        )
    for item in assessment.fallacy.detected_fallacies:
        holes.append(
            ScoringHole(
                type="fallacy",
                severity="high",
                description=item,
                source="consistency_checker",
            )
        )
    return holes


def _recommended_investigations(
    target_node_id: str,
    scores: NodeScores,
    assessment: ClaimAssessment,
    holes: list[ScoringHole],
    fatal_flags: list[FatalFlag],
    disagreements: list[JudgeDisagreement],
) -> list[RecommendedInvestigation]:
    investigations: list[RecommendedInvestigation] = []
    if any(flag.type == "contradiction" for flag in fatal_flags):
        investigations.append(
            RecommendedInvestigation(
                action="challenge",
                reason="Fatal contradiction should be challenged before relying on the claim.",
                priority=1,
                target_node_id=target_node_id,
            )
        )
    if any(hole.type == "missing_evidence" for hole in holes):
        investigations.append(
            RecommendedInvestigation(
                action="find_evidence",
                reason="Evidence support is weak or unverified.",
                priority=_recommendation_priority(
                    action="find_evidence",
                    severity=_max_severity(hole.severity for hole in holes if hole.type == "missing_evidence"),
                    scores=scores,
                    assessment=assessment,
                ),
                target_node_id=target_node_id,
            )
        )
    if disagreements:
        investigations.append(
            RecommendedInvestigation(
                action="challenge",
                reason="Judges disagree on the claim's strength, impact, or support.",
                priority=_recommendation_priority(
                    action="challenge",
                    severity=_max_severity(item.severity for item in disagreements),
                    scores=scores,
                    assessment=assessment,
                ),
                target_node_id=target_node_id,
            )
        )
    if any(hole.type == "ambiguity" for hole in holes):
        investigations.append(
            RecommendedInvestigation(
                action="ask_user",
                reason="The claim needs a narrower scope before it can be judged confidently.",
                priority=_recommendation_priority(
                    action="ask_user",
                    severity=_max_severity(hole.severity for hole in holes if hole.type == "ambiguity"),
                    scores=scores,
                    assessment=assessment,
                ),
                target_node_id=target_node_id,
            )
        )
    return sorted(investigations, key=lambda item: (item.priority, item.action, item.reason))


def _recommendation_priority(
    *,
    action: InvestigationAction,
    severity: Severity,
    scores: NodeScores,
    assessment: ClaimAssessment,
) -> int:
    priority = 5
    priority -= {"low": 0, "medium": 1, "high": 2}[severity]
    if scores.impact >= 0.75:
        priority -= 1
    if scores.uncertainty >= 0.50:
        priority -= 1
    if _has_unanswered_attack_signal(action, assessment):
        priority -= 1
    return max(1, min(5, priority))


def _has_unanswered_attack_signal(action: InvestigationAction, assessment: ClaimAssessment) -> bool:
    return (
        action == "challenge"
        and assessment.context.relation_to_root == "attacks"
        and assessment.critic.counterargument_strength >= 0.65
    )


def _max_severity(severities) -> Severity:
    return max(severities, key={"low": 0, "medium": 1, "high": 2}.__getitem__)


def _rationale(claim: NormalizedClaim, scores: NodeScores, holes: list[ScoringHole]) -> ScoreRationale:
    weakest_link = holes[0].description if holes else "No dominant weakness was detected by the scoring reducer."
    return ScoreRationale(
        short=f"{claim.claim_type.title()} claim scored {scores.strength:.2f} with {scores.uncertainty:.2f} uncertainty.",
        why_not_higher=weakest_link,
        why_not_lower="The claim remains judgeable and has a coherent charitable reading.",
        weakest_link=weakest_link,
    )


def _uncertainty(
    claim: NormalizedClaim,
    assessment: ClaimAssessment,
    disagreement_count: int,
    cap_count: int,
) -> float:
    uncertainty = 0.20
    uncertainty += 0.08 * len(claim.ambiguity_flags)
    uncertainty += 0.10 if not claim.evidence_refs else 0.0
    uncertainty += 0.10 if assessment.evidence.evidence_quality < 0.30 else 0.0
    uncertainty += 0.08 * disagreement_count
    uncertainty += 0.04 * cap_count
    return _clamp(uncertainty)


def _uncertainty_drivers(
    claim: NormalizedClaim,
    assessment: ClaimAssessment,
    disagreements: list[JudgeDisagreement],
    score_caps: list[ScoreCap],
) -> list[UncertaintyDriver]:
    """Labeled, human-legible reasons behind scores.uncertainty.

    Emits one driver per true condition, in the fixed order below (never
    reordered -- callers may rely on this for a stable "primary driver"
    pill). judge_disagreement and score_caps emit one entry per item in
    disagreements/score_caps respectively, so a claim can carry several
    drivers of the same code.
    """
    drivers: list[UncertaintyDriver] = []
    if not claim.evidence_refs:
        drivers.append(UncertaintyDriver(code="no_evidence_refs", label="no external evidence"))
    if assessment.evidence.evidence_quality < 0.30:
        drivers.append(UncertaintyDriver(code="low_evidence_quality", label="evidence quality low"))
    if claim.ambiguity_flags:
        drivers.append(
            UncertaintyDriver(
                code="ambiguity",
                label=f"{len(claim.ambiguity_flags)} ambiguity flag(s)",
            )
        )
    for disagreement in disagreements:
        drivers.append(
            UncertaintyDriver(
                code="judge_disagreement",
                label=f"judge disagreement: {disagreement.type}",
            )
        )
    for cap in score_caps:
        # triggered_by (the semantic cause slug, e.g. "weak_evidence") --
        # not cap.score (the capped field name, e.g. "strength"). Two
        # different caps commonly cap the SAME score field (see
        # apply_score_caps: weak_evidence and fatal_contradiction both cap
        # "strength"), so cap.score alone would render byte-identical
        # labels for genuinely different causes.
        drivers.append(UncertaintyDriver(code="score_caps", label=f"score capped: {cap.triggered_by}"))
    if assessment.critic.counterargument_strength > 0.6:
        drivers.append(UncertaintyDriver(code="strong_counter", label="strong counterargument present"))
    return drivers


def _label(value: float, *, low: str, mid: str, high: str):
    if value < 0.34:
        return low
    if value < 0.67:
        return mid
    return high


def _depth_pressure_label(score: float):
    return _label(score, low="low", mid="medium", high="high")


def _recommended_action(payload: NodeScoringPayload) -> InvestigationAction | None:
    if not payload.recommended_investigations:
        return None
    recommendation = sorted(
        payload.recommended_investigations,
        key=lambda item: (item.priority, item.action, item.reason, item.target_node_id or ""),
    )[0]
    return recommendation.action


def _expansion_hint(selection: DepthPressureSelection):
    if selection.pressure == "high":
        return "expand"
    return "review_for_expansion"


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _round(value: float) -> float:
    return round(value, 4)
