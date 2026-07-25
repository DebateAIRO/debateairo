from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from app.core.config import bool_env
from app.scoring.models import ClaimAssessment, JudgeDisagreement

# Task 4 (uncertainty -> labeled drivers + dispersion-derived numeric,
# docs/improvement-plan-2026-07-22.md Sec P2.1): documented map from a
# judge-panel strength spread to a [0, 1] uncertainty value. Calibrated so
# the same 0.35 strength gap that already flags a persisted_judge_strength_
# gap disagreement (see _composite_strength_gap_disagreements below -- P1
# Task 5 moved that gate onto the DIALECTICAL_FIELD_DISAGREEMENT flag-off
# path but did not change its 0.35 comparison, so this calibration still
# refers to a live threshold) lands at 0.5 uncertainty:
# uncertainty = clamp(spread * DISPERSION_UNCERTAINTY_SLOPE).
DISPERSION_UNCERTAINTY_SLOPE = 0.5 / 0.35


@dataclass(frozen=True)
class DispersionResult:
    """uncertainty: the mapped, clamped [0, 1] value. spread: the raw
    max-min _claim_strength_signal gap it was derived from, kept alongside
    so callers can label *why* (e.g. "judges disagree (spread 0.58)")
    without recomputing it."""

    uncertainty: float
    spread: float


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


# P1 Task 5: per-field cross-family detection. The previous gate compared
# _claim_strength_signal -- a weighted composite of five fields -- at 0.35.
# Averaging across fields shrinks spread: smoke4's root node had a raw
# logical_validity spread of 0.17 (0.38/0.55/0.50) but a composite spread of
# 0.11, and the panel's largest observed composite spread across 26 nodes
# was 0.11. The gate could not fire and never did.
#
# NEW FLAG, default OFF (project-owner ruling): the judge panel is live in
# production, so shipping this unflagged would move
# score_provenance.disagreement_status for every scored node the instant the
# code deployed, before any deliberate flip. Flag OFF keeps the historical
# composite gate below byte-for-byte; P1 Task 8 flips the flag.
FIELD_DISAGREEMENT_FLAG = "DIALECTICAL_FIELD_DISAGREEMENT"

# (ClaimAssessment section, leaf score field) pairs -- one per judge role, so
# a family that dissents in only its own specialty is still visible.
PIVOTAL_FIELDS: tuple[tuple[str, str], ...] = (
    ("critic", "logical_validity"),
    ("steelman", "charitable_strength"),
    ("evidence", "evidence_quality"),
    ("context", "impact"),
)
# Set from the MEASURED dispersion of the live panel, not from the frontier
# size it happens to produce. Across the 26 nodes of debate f67ad244 the
# per-field spread on critic.logical_validity averaged 0.196 and reached
# 0.45, and the other pivotal fields ran 0.114-0.168 mean. The superseded
# gate compared a five-field weighted COMPOSITE at 0.35 against a
# largest-observed composite spread of 0.11 -- it sat above the data's
# ceiling and so could not fire at all. 0.25 lies inside the observed
# per-field range and above its mean, separating the panel's routine
# scatter from its genuine splits.
#
# Recorded as evidence, NOT as the rationale for the value: at 0.20 / 0.25 /
# 0.30 this marks 16 / 13 / 8 of those 26 nodes contested, versus 0 under
# the composite gate. See tests/test_cross_family_disagreement_replay.py.
DISAGREEMENT_FIELD_THRESHOLD = 0.25


def field_disagreement_enabled() -> bool:
    return bool_env(FIELD_DISAGREEMENT_FLAG, False)


def judges_disagree_from_provenance(score_provenance: object) -> bool:
    """Read the persisted panel-disagreement fact off a scoring item.

    Reads exactly where app/scoring/service.py writes it --
    ``score_provenance["disagreement_status"]["status"] == "present"`` --
    mirroring app/synthesis/branch_summary.py's ``_is_contested``. Accepts
    either the raw dict or the ScoreProvenance model (which carries the key
    as a pydantic extra).

    Behind the same flag as the detection itself, because this is the input
    to a NEW route (``challenge`` on judge disagreement). With the flag off
    it always returns False, so no lifecycle decision can move -- not even
    for a node whose historical composite gate DID fire, which is the one
    case gating only ``detect_persisted_judge_disagreements`` would miss.
    """
    if not field_disagreement_enabled():
        return False
    if isinstance(score_provenance, Mapping):
        status = score_provenance.get("disagreement_status")
    else:
        extra = getattr(score_provenance, "model_extra", None) or {}
        status = extra.get("disagreement_status")
    return isinstance(status, Mapping) and status.get("status") == "present"


def field_spreads(judge_evidence: list[dict]) -> dict[str, float]:
    """Per-field max-minus-min across the distinct, parseable judgments.

    What actually happens to an incomplete judgment (describing behaviour
    that PRE-DATES P1 Task 5, not introducing it): every PIVOTAL_FIELDS leaf
    is a REQUIRED field on ClaimAssessment, so a judgment missing one fails
    model_validate inside _distinct_persisted_judge_evidence and that WHOLE
    judgment is discarded from the panel -- silently, with no annotation on
    any audited record. The per-field `len(values) >= 2` guard below is
    therefore a defensive floor that a missing leaf never reaches, not the
    mechanism that handles one. The consequence worth knowing at the call
    site: a three-judge panel with one unparseable judgment silently becomes
    a two-judge panel, and those two survivors can still trip the gate.

    Deliberately UNGATED: this is a pure measurement with no side effects,
    and the flag gates the gate (detect_persisted_judge_disagreements), not
    the ability to measure dispersion.
    """
    return _field_spreads(_distinct_persisted_judge_evidence(judge_evidence))


def _field_spreads(distinct_evidence: list[dict]) -> dict[str, float]:
    spreads: dict[str, float] = {}
    if len(distinct_evidence) < 2:
        return spreads
    for section, field in PIVOTAL_FIELDS:
        values: list[float] = []
        for item in distinct_evidence:
            assessment = item.get("assessment")
            block = getattr(assessment, section, None)
            value = getattr(block, field, None)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values.append(float(value))
        if len(values) >= 2:
            spreads[field] = max(values) - min(values)
    return spreads


def detect_persisted_judge_disagreements(judge_evidence: list[dict]) -> list[JudgeDisagreement]:
    if not field_disagreement_enabled():
        return _composite_strength_gap_disagreements(judge_evidence)
    distinct_evidence = _distinct_persisted_judge_evidence(judge_evidence)
    if len(distinct_evidence) < 2:
        return []
    spreads = _field_spreads(distinct_evidence)
    contested = {
        field: spread
        for field, spread in spreads.items()
        if spread >= DISAGREEMENT_FIELD_THRESHOLD
    }
    if not contested:
        return []
    widest = max(contested.items(), key=lambda pair: pair[1])
    return [
        JudgeDisagreement(
            judges=sorted({str(item["judge_role"]) for item in distinct_evidence}),
            type="cross_family_field_spread",
            severity="high",
            description=(
                f"Judge families disagree on {widest[0]} by {widest[1]:.2f} "
                f"(threshold {DISAGREEMENT_FIELD_THRESHOLD})."
            ),
        )
    ]


def _composite_strength_gap_disagreements(judge_evidence: list[dict]) -> list[JudgeDisagreement]:
    """Historical (pre-P1-Task-5) gate, kept verbatim for the flag-off path.

    This is the ORIGINAL body of detect_persisted_judge_disagreements, moved
    without a single character changed -- not reformatted, not tidied -- so
    that "flag off is byte-identical to today" is verifiable by reading the
    diff rather than taken on trust.
    """
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


def dispersion_uncertainty(judge_evidence: list[dict]) -> DispersionResult | None:
    """Derive a measured uncertainty value from real judge-panel dispersion.

    Reads exactly the same evidence base and distinctness/parseability
    rules as detect_persisted_judge_disagreements above (both call
    _distinct_persisted_judge_evidence on the same judge_evidence list), so
    "dispersion is available" and "cross-judge disagreement was checked"
    always agree on what counts as two independent judgments. Returns None
    (never a fabricated number) when fewer than two distinct, parseable
    persisted judgments exist -- callers must keep the existing heuristic
    uncertainty in that case rather than treat None as zero uncertainty.
    """
    distinct_evidence = _distinct_persisted_judge_evidence(judge_evidence)
    if len(distinct_evidence) < 2:
        return None
    strengths = [
        _claim_strength_signal(item["assessment"])
        for item in distinct_evidence
        if isinstance(item.get("assessment"), ClaimAssessment)
    ]
    if len(strengths) < 2:
        return None
    spread = max(strengths) - min(strengths)
    uncertainty = round(max(0.0, min(1.0, spread * DISPERSION_UNCERTAINTY_SLOPE)), 4)
    return DispersionResult(uncertainty=uncertainty, spread=round(spread, 4))


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
