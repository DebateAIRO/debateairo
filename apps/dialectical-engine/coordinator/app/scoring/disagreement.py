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
