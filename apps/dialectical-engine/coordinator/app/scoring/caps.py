from __future__ import annotations

from app.scoring.models import ClaimAssessment, NormalizedClaim, ScoreCap


def apply_score_caps(
    *,
    claim: NormalizedClaim,
    assessment: ClaimAssessment,
    strength: float,
    impact: float,
) -> tuple[float, float, list[ScoreCap]]:
    caps: list[ScoreCap] = []
    capped_strength = strength
    capped_impact = impact

    if claim.claim_type in {"empirical", "causal"} and assessment.evidence.evidence_quality < 0.30:
        capped_strength = min(capped_strength, 0.45)
        caps.append(
            ScoreCap(
                score="strength",
                cap_value=0.45,
                reason="Empirical or causal claims with weak or unverified evidence cannot score as strong.",
                triggered_by="weak_evidence",
            )
        )

    if assessment.fallacy.contradiction_flags or _has_fatal_flag(assessment, "contradiction"):
        capped_strength = min(capped_strength, 0.25)
        caps.append(
            ScoreCap(
                score="strength",
                cap_value=0.25,
                reason="Fatal contradiction prevents high claim strength.",
                triggered_by="fatal_contradiction",
            )
        )

    if assessment.context.relevance < 0.25:
        capped_impact = min(capped_impact, 0.25)
        caps.append(
            ScoreCap(
                score="impact",
                cap_value=0.25,
                reason="Low relevance to the root question limits impact.",
                triggered_by="low_relevance",
            )
        )

    return capped_strength, capped_impact, caps


def _has_fatal_flag(assessment: ClaimAssessment, flag_type: str) -> bool:
    fatal_flags = [
        *assessment.critic.fatal_flags,
        *assessment.evidence.fatal_flags,
        *assessment.fallacy.fatal_flags,
    ]
    return any(_flag_type(flag) == flag_type for flag in fatal_flags)


def _flag_type(flag) -> str | None:
    if isinstance(flag, dict):
        return flag.get("type")
    return getattr(flag, "type", None)
