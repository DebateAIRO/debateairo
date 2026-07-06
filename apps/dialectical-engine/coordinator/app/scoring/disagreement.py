from __future__ import annotations

from app.scoring.models import ClaimAssessment, JudgeDisagreement


def detect_disagreements(assessment: ClaimAssessment) -> list[JudgeDisagreement]:
    disagreements: list[JudgeDisagreement] = []
    if assessment.steelman.charitable_strength >= 0.75 and assessment.evidence.evidence_quality < 0.35:
        disagreements.append(
            JudgeDisagreement(
                judges=["steelman", "evidence_auditor"],
                type="steelman_evidence_tension",
                severity="high",
                description="Strong charitable reading but weak evidence support.",
            )
        )
    if assessment.context.impact >= 0.75 and assessment.critic.assumption_risk >= 0.70:
        disagreements.append(
            JudgeDisagreement(
                judges=["context_judge", "critic"],
                type="impact_assumption_tension",
                severity="high",
                description="High impact claim carries high assumption risk.",
            )
        )
    if assessment.evidence.evidence_quality >= 0.70 and assessment.context.relevance < 0.35:
        disagreements.append(
            JudgeDisagreement(
                judges=["evidence_auditor", "context_judge"],
                type="evidence_context_tension",
                severity="medium",
                description="Evidence appears strong but relevance to the debate is low.",
            )
        )
    return disagreements


def detect_persisted_judge_disagreements(judge_evidence: list[dict]) -> list[JudgeDisagreement]:
    distinct_evidence = _distinct_persisted_judge_evidence(judge_evidence)
    if len(distinct_evidence) < 2:
        return []
    scored_evidence = [
        (item, _claim_strength_signal(item["assessment"]))
        for item in distinct_evidence
        if isinstance(item.get("assessment"), ClaimAssessment)
    ]
    if len(scored_evidence) < 2:
        return []
    low_item, low_score = min(scored_evidence, key=lambda pair: (pair[1], pair[0]["judge_role"]))
    high_item, high_score = max(scored_evidence, key=lambda pair: (pair[1], pair[0]["judge_role"]))
    if high_score - low_score < 0.35:
        return []
    return [
        JudgeDisagreement(
            judges=sorted([str(high_item["judge_role"]), str(low_item["judge_role"])]),
            type="persisted_judge_strength_gap",
            severity="high",
            description="Persisted judge assessments materially disagree on claim strength.",
        )
    ]


def _distinct_persisted_judge_evidence(judge_evidence: list[dict]) -> list[dict]:
    distinct: list[dict] = []
    seen_identities: set[tuple[str, str, str]] = set()
    seen_outputs: set[str] = set()
    for item in sorted(
        judge_evidence,
        key=lambda value: (
            str(value.get("judge_role") or ""),
            str(value.get("provider") or ""),
            str(value.get("model") or ""),
            str(value.get("raw_output_sha256") or ""),
        ),
    ):
        judge_role = item.get("judge_role")
        provider = item.get("provider")
        model = item.get("model")
        raw_output_sha256 = item.get("raw_output_sha256")
        if not all(isinstance(value, str) and value for value in (judge_role, provider, model, raw_output_sha256)):
            continue
        identity = (judge_role, provider, model)
        if identity in seen_identities or raw_output_sha256 in seen_outputs:
            continue
        try:
            assessment = ClaimAssessment.model_validate(item.get("assessment"))
        except ValueError:
            continue
        next_item = dict(item)
        next_item["assessment"] = assessment
        distinct.append(next_item)
        seen_identities.add(identity)
        seen_outputs.add(raw_output_sha256)
    return distinct


def _claim_strength_signal(assessment: ClaimAssessment) -> float:
    counter_resilience = 1.0 - assessment.critic.counterargument_strength
    return max(
        0.0,
        min(
            1.0,
            (
                0.30 * assessment.critic.logical_validity
                + 0.30 * assessment.evidence.evidence_quality
                + 0.25 * counter_resilience
                + 0.15 * assessment.context.relevance
                - 0.20 * assessment.critic.assumption_risk
            ),
        ),
    )
