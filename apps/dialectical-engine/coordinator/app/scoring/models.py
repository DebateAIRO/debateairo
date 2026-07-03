from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


ClaimType = Literal[
    "empirical",
    "causal",
    "normative",
    "definitional",
    "prediction",
    "comparative",
    "mixed",
    "unknown",
]
Severity = Literal["low", "medium", "high"]
DepthPressure = Literal["low", "medium", "high"]
InvestigationAction = Literal["challenge", "support", "find_evidence", "decompose", "ask_user"]
AdaptiveDepthExpansionHint = Literal["expand", "review_for_expansion"]
ScoringStatus = Literal["available", "partial", "unavailable"]
ScoringJobStatus = Literal["queued", "running", "complete", "failed"]
EvidenceSupportStatus = Literal[
    "grounded",
    "missing",
    "unavailable",
    "refuted",
    "contradicted",
    "retracted",
    "no_info",
]
ScoringCacheStaleReason = Literal["input_hash_mismatch"]
AdaptiveDepthMode = Literal["fixed", "manual", "recommended", "adaptive"]
ManualInvestigationStatus = Literal["queued", "unavailable"]


def _unit_interval(value: float) -> float:
    if value < 0.0 or value > 1.0:
        raise ValueError("score values must be between 0 and 1")
    return value


class Scope(BaseModel):
    population: str | None = None
    timeframe: str | None = None
    geography: str | None = None
    domain: str | None = None


class ScoringStatusModel(BaseModel):
    status: ScoringStatus


class ScoringJobStatusModel(BaseModel):
    status: ScoringJobStatus


class ScoringModelMetadata(BaseModel):
    provider: str | None = None
    model: str | None = None
    checked_at: str | None = None
    status: ScoringStatus


class ScoringStaleCacheMetadata(BaseModel):
    reason: ScoringCacheStaleReason
    refresh_available: bool = True


class ScoringCacheMetadata(BaseModel):
    hit: bool
    stale: ScoringStaleCacheMetadata | None = None


class AdaptiveDepthPolicy(BaseModel):
    mode: AdaptiveDepthMode
    target_depth: int | None = Field(default=None, ge=0)
    reason: str | None = None


class DepthPressureSelection(BaseModel):
    node_id: str
    pressure: DepthPressure
    score: float
    reasons: list[str] = Field(default_factory=list)

    _validate_score = field_validator("score")(_unit_interval)


class AdaptiveDepthDryRunItem(BaseModel):
    node_id: str
    pressure: DepthPressure
    score: float
    recommended_action: InvestigationAction | None = None
    expansion_hint: AdaptiveDepthExpansionHint
    reasons: list[str] = Field(default_factory=list)
    hole_count: int
    recommended_investigation_count: int

    _validate_score = field_validator("score")(_unit_interval)


class AdaptiveDepthDryRunPlan(BaseModel):
    policy: AdaptiveDepthPolicy
    candidate_count: int
    expansion_count: int
    items: list[AdaptiveDepthDryRunItem] = Field(default_factory=list)


class ClaimTypeModel(BaseModel):
    claim_type: ClaimType


class NormalizedClaim(BaseModel):
    node_id: str
    raw_text: str
    core_claim: str
    claim_type: ClaimType = "mixed"
    scope: Scope = Field(default_factory=Scope)
    implied_assumptions: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    ambiguity_flags: list[str] = Field(default_factory=list)
    key_terms: list[str] = Field(default_factory=list)


class SteelmanAssessment(BaseModel):
    charitable_strength: float
    confidence: float
    improved_claim: str = ""
    strongest_points: list[str] = Field(default_factory=list)
    required_assumptions: list[str] = Field(default_factory=list)
    recommended_investigations: list[str] = Field(default_factory=list)

    _validate_unit_scores = field_validator("charitable_strength", "confidence")(_unit_interval)


class CriticAssessment(BaseModel):
    logical_validity: float
    assumption_risk: float
    counterargument_strength: float
    findings: list[str] = Field(default_factory=list)
    fatal_flags: list[FatalFlag] = Field(default_factory=list)
    recommended_investigations: list[str] = Field(default_factory=list)

    _validate_unit_scores = field_validator(
        "logical_validity",
        "assumption_risk",
        "counterargument_strength",
    )(_unit_interval)


class EvidenceAssessment(BaseModel):
    evidence_quality: float
    evidence_relevance: float
    evidence_sufficiency: float
    source_reliability: float
    freshness: float
    support_status: EvidenceSupportStatus = "missing"
    missing_evidence: list[str] = Field(default_factory=list)
    fatal_flags: list[FatalFlag] = Field(default_factory=list)
    recommended_investigations: list[str] = Field(default_factory=list)

    _validate_unit_scores = field_validator(
        "evidence_quality",
        "evidence_relevance",
        "evidence_sufficiency",
        "source_reliability",
        "freshness",
    )(_unit_interval)


class ContextAssessment(BaseModel):
    relevance: float
    impact: float
    dependency_weight: float
    relation_to_root: Literal["supports", "attacks", "clarifies", "side_issue"] = "clarifies"
    why_it_matters: str = ""

    _validate_unit_scores = field_validator("relevance", "impact", "dependency_weight")(_unit_interval)


class FallacyAssessment(BaseModel):
    logical_consistency: float
    detected_fallacies: list[str] = Field(default_factory=list)
    contradiction_flags: list[str] = Field(default_factory=list)
    fatal_flags: list[FatalFlag] = Field(default_factory=list)

    _validate_unit_scores = field_validator("logical_consistency")(_unit_interval)


class ConsistencyAssessment(FallacyAssessment):
    pass


class ClaimAssessment(BaseModel):
    steelman: SteelmanAssessment
    critic: CriticAssessment
    evidence: EvidenceAssessment
    context: ContextAssessment
    fallacy: FallacyAssessment


class NodeScores(BaseModel):
    strength: float
    uncertainty: float
    impact: float
    evidence_quality: float
    relevance: float
    logical_validity: float
    assumption_risk: float
    counter_resilience: float

    _validate_unit_scores = field_validator(
        "strength",
        "uncertainty",
        "impact",
        "evidence_quality",
        "relevance",
        "logical_validity",
        "assumption_risk",
        "counter_resilience",
    )(_unit_interval)


class ScoreLabels(BaseModel):
    strength_label: Literal["weak", "mixed", "strong"]
    uncertainty_label: Literal["low", "medium", "high"]
    impact_label: Literal["low", "medium", "high"]


class ScoringHole(BaseModel):
    type: str
    severity: Severity
    description: str
    source: str


class FatalFlag(BaseModel):
    type: str
    severity: Severity
    description: str


class JudgeAssessment(BaseModel):
    score: float
    confidence: float
    findings: list[str] = Field(default_factory=list)
    fatal_flags: list[FatalFlag] = Field(default_factory=list)
    recommended_investigations: list[str] = Field(default_factory=list)

    _validate_unit_scores = field_validator("score", "confidence")(_unit_interval)


class ScoreCap(BaseModel):
    score: str
    cap_value: float
    reason: str
    triggered_by: str

    _validate_cap = field_validator("cap_value")(_unit_interval)


class JudgeDisagreement(BaseModel):
    judges: list[str]
    type: str
    severity: Severity
    description: str


class RecommendedInvestigation(BaseModel):
    action: InvestigationAction
    reason: str
    priority: int = Field(ge=1, le=5)
    target_node_id: str | None = None


class ManualInvestigationRequest(BaseModel):
    debate_id: str
    node_id: str
    action: InvestigationAction
    hole: ScoringHole
    reason: str | None = None


class ManualInvestigationResponse(BaseModel):
    debate_id: str
    node_id: str
    action: InvestigationAction
    status: ManualInvestigationStatus
    job_id: str | None = None
    reason: str | None = None


class ScoreRationale(BaseModel):
    short: str
    why_not_higher: str
    why_not_lower: str
    weakest_link: str


class ScoringDebug(BaseModel):
    reducer_version: str
    rubric_version: str
    judge_outputs: dict | None = None


class ScoreProvenance(BaseModel):
    raw_judge_output_kind: Literal["claim_assessment"]
    raw_judge_output_included: Literal[False] = False
    final_score_source: Literal["deterministic_reducer"]
    reducer_version: str
    rubric_version: str


class NodeScoringPayload(BaseModel):
    node_id: str
    claim: NormalizedClaim
    scores: NodeScores
    labels: ScoreLabels
    holes: list[ScoringHole]
    fatal_flags: list[FatalFlag]
    score_caps: list[ScoreCap]
    judge_disagreements: list[JudgeDisagreement]
    recommended_investigations: list[RecommendedInvestigation]
    rationale: ScoreRationale
    score_provenance: ScoreProvenance = Field(
        default_factory=lambda: ScoreProvenance(
            raw_judge_output_kind="claim_assessment",
            raw_judge_output_included=False,
            final_score_source="deterministic_reducer",
            reducer_version="node-scoring-reducer-v1",
            rubric_version="debateai-rubric-v1",
        )
    )
    debug: ScoringDebug | None = None


class NodeScoringError(BaseModel):
    node_id: str
    status: Literal["unavailable"]
    reason: str


class NodeScoringPending(BaseModel):
    node_id: str
    status: Literal["pending"]
    reason: str


class DebateScoringResponse(BaseModel):
    debate_id: str
    status: ScoringStatus
    node_ids: list[str] = Field(default_factory=list)
    items: list[NodeScoringPayload] = Field(default_factory=list)
    errors: list[NodeScoringError] | None = None
    pending: list[NodeScoringPending] | None = None
    max_nodes: int | None = None
    scored_node_count: int | None = None
    skipped_node_count: int | None = None
    truncated: bool | None = None
    generated_at: str | None = None
    reason: str | None = None
    producer: str | None = None
    model_metadata: ScoringModelMetadata | None = None
    cache: ScoringCacheMetadata | None = None
    active_scoring_job_id: str | None = None
    active_scoring_job_status: ScoringJobStatus | None = None
