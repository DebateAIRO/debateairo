from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
import math
import re
from typing import Any, Literal

from app.evidence.model import EntailmentLabel, EvidenceStatus
from app.exploration.policy import EvidenceSignal, ScoreSignal
from app.scoring.models import ClaimType


SCHEMA_VERSION = "lifecycle-input-persistence/v1"
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_RFC3339_UTC_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$"
)
_CLAIM_TYPES = {
    "empirical",
    "causal",
    "normative",
    "definitional",
    "prediction",
    "comparative",
    "mixed",
    "unknown",
}
_SOURCE_KINDS = {
    "node_scoring_result",
    "judge_output_artifact",
    "scoring_analyzer_run",
    "evidence_verification_run",
}
_COMPONENT_SOURCE_KINDS = {
    "score": {
        "node_scoring_result",
        "judge_output_artifact",
        "scoring_analyzer_run",
    },
    "evidence": {"evidence_verification_run"},
}
_SCORING_CONTRACT_FIELDS = {
    "judge_id",
    "judge_version",
    "role",
    "rubric_version",
    "prompt_version",
    "output_schema_version",
    "reducer_version",
    "contract_hash",
}
_EVIDENCE_SOURCE_FIELDS = {
    "evidence_node_id",
    "claim_node_id",
    "generation_id",
    "reference",
    "content_sha256",
    "evidence_kind",
}

LifecycleInputState = Literal[
    "missing",
    "stale",
    "malformed",
    "mismatched",
    "pending",
    "unverifiable",
    "grounded",
]
Availability = Literal["absent", "present", "in_progress", "terminal_unverifiable"]
Freshness = Literal["unknown", "fresh", "stale"]
ComponentKind = Literal["score", "evidence"]
_STATE_PRECEDENCE = {
    "grounded": -1,
    "missing": 0,
    "pending": 1,
    "unverifiable": 2,
    "stale": 3,
    "mismatched": 4,
    "malformed": 5,
}


def _non_empty(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")
    return value.strip()


def _sha256(value: object, field_name: str) -> str:
    text = _non_empty(value, field_name)
    if _SHA256_RE.fullmatch(text) is None:
        raise ValueError(f"{field_name} must be 64 lowercase hexadecimal characters")
    return text


def _positive_int(value: object, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{field_name} must be a positive integer")
    return value


def _utc_datetime(value: datetime, field_name: str) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() != timezone.utc.utcoffset(value):
        raise ValueError(f"{field_name} must be timezone-aware UTC")
    return value.astimezone(timezone.utc)


@dataclass(frozen=True)
class ScoringContractIdentity:
    judge_id: str
    judge_version: str
    role: str
    rubric_version: str
    prompt_version: str
    output_schema_version: str
    reducer_version: str
    contract_hash: str

    def __post_init__(self) -> None:
        for field_name in (
            "judge_id",
            "judge_version",
            "role",
            "rubric_version",
            "prompt_version",
            "output_schema_version",
            "reducer_version",
        ):
            object.__setattr__(self, field_name, _non_empty(getattr(self, field_name), field_name))
        object.__setattr__(self, "contract_hash", _sha256(self.contract_hash, "contract_hash"))


@dataclass(frozen=True)
class EvidenceSourceIdentity:
    evidence_node_id: str
    claim_node_id: str
    generation_id: str
    reference: str
    content_sha256: str
    evidence_kind: str

    def __post_init__(self) -> None:
        for field_name in (
            "evidence_node_id",
            "claim_node_id",
            "generation_id",
            "reference",
            "evidence_kind",
        ):
            object.__setattr__(self, field_name, _non_empty(getattr(self, field_name), field_name))
        object.__setattr__(self, "content_sha256", _sha256(self.content_sha256, "content_sha256"))


@dataclass(frozen=True)
class RunIdentity:
    run_id: str | None
    sequence: int | None


@dataclass(frozen=True)
class PersistedProvenance:
    source_kind: str
    source_record_id: str
    run: RunIdentity
    producer: str
    recorded_at: datetime
    checked_at: datetime | None


@dataclass(frozen=True)
class ScoreValues:
    strength: float
    uncertainty: float
    impact: float
    evidence_quality: float
    logical_validity: float
    assumption_risk: float
    counter_resilience: float


@dataclass(frozen=True)
class AuthoritativeScore:
    node_id: str
    claim_type: ClaimType
    values: ScoreValues
    holes: tuple[str, ...]
    fatal_flags: tuple[str, ...]
    recommended_actions: tuple[str, ...]
    final_score_source: Literal["deterministic_reducer"]
    reducer_version: str
    rubric_version: str
    # P1 Task 5: the persisted panel-disagreement fact, written into the
    # envelope by scoring_input_resolver._score_value. Defaults False so a
    # score envelope produced before this field existed maps to "no recorded
    # disagreement" rather than failing to parse.
    judges_disagree: bool = False


@dataclass(frozen=True)
class AuthoritativeEvidence:
    source: EvidenceSourceIdentity
    status: EvidenceStatus
    base_score: float
    uncertainty: float
    entailment: EntailmentLabel
    caveats: tuple[str, ...]
    evaluator_id: str
    evaluator_version: str


@dataclass(frozen=True)
class ExpectedLifecycleCorrelation:
    schema_version: str
    debate_id: str
    node_id: str
    current_score_input_hash: str
    active_scoring_contract: ScoringContractIdentity
    expected_evidence_source: EvidenceSourceIdentity | None
    decision_timestamp: datetime
    # Contract v1 §6.1 amendment (2026-07-26): RECORDED, NOT APPLIED. The
    # score component no longer ages out -- see the long note in
    # _classify_candidate for why a hash-matched, contract-matched judgment
    # cannot go stale by clock alone. The field stays on the correlation
    # because it is part of persisted lifecycle-input-persistence/v1 (dropping
    # it is a schema break) and because it still records the freshness policy
    # a historical decision ran under. It is still validated as a positive
    # integer so a caller cannot pass nonsense and believe it meant something.
    score_max_age_seconds: int
    evidence_max_age_seconds: int

    def __post_init__(self) -> None:
        if self.schema_version != SCHEMA_VERSION:
            raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
        object.__setattr__(self, "debate_id", _non_empty(self.debate_id, "debate_id"))
        object.__setattr__(self, "node_id", _non_empty(self.node_id, "node_id"))
        object.__setattr__(
            self,
            "current_score_input_hash",
            _sha256(self.current_score_input_hash, "current_score_input_hash"),
        )
        object.__setattr__(
            self,
            "decision_timestamp",
            _utc_datetime(self.decision_timestamp, "decision_timestamp"),
        )
        object.__setattr__(
            self,
            "score_max_age_seconds",
            _positive_int(self.score_max_age_seconds, "score_max_age_seconds"),
        )
        object.__setattr__(
            self,
            "evidence_max_age_seconds",
            _positive_int(self.evidence_max_age_seconds, "evidence_max_age_seconds"),
        )


@dataclass(frozen=True)
class ComponentResolution:
    component: ComponentKind
    state: LifecycleInputState
    availability: Availability
    freshness: Freshness
    reason_code: str
    provenance: PersistedProvenance | None = None


@dataclass(frozen=True)
class UnavailableLifecycleInputs:
    schema_version: str
    state: Literal["missing", "stale", "malformed", "mismatched", "pending", "unverifiable"]
    correlation: ExpectedLifecycleCorrelation
    score_resolution: ComponentResolution
    evidence_resolution: ComponentResolution
    reason_codes: tuple[str, ...]
    score: None = None
    evidence: None = None
    decision_eligibility: Literal["blocked"] = "blocked"


@dataclass(frozen=True)
class GroundedLifecycleInputs:
    schema_version: str
    state: Literal["grounded"]
    correlation: ExpectedLifecycleCorrelation
    score_resolution: ComponentResolution
    evidence_resolution: ComponentResolution
    score: AuthoritativeScore
    evidence: AuthoritativeEvidence
    decision_eligibility: Literal["eligible"] = "eligible"


def _missing_resolution(component: ComponentKind) -> ComponentResolution:
    return ComponentResolution(
        component=component,
        state="missing",
        availability="absent",
        freshness="unknown",
        reason_code=f"{component}_missing",
    )


@dataclass(frozen=True)
class _CandidateOutcome:
    resolution: ComponentResolution
    value: AuthoritativeScore | AuthoritativeEvidence | None = None
    run: RunIdentity | None = None
    current_identity: bool = False


class _CandidateProblem(ValueError):
    def __init__(
        self,
        state: LifecycleInputState,
        reason_code: str,
        *,
        availability: Availability = "present",
        freshness: Freshness = "unknown",
        provenance: PersistedProvenance | None = None,
    ) -> None:
        super().__init__(reason_code)
        self.state = state
        self.reason_code = reason_code
        self.availability = availability
        self.freshness = freshness
        self.provenance = provenance


def _mapping(value: object, field_name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{field_name} must be an object")
    if not all(isinstance(key, str) for key in value):
        raise ValueError(f"{field_name} keys must be strings")
    return value


def _strict_keys(value: Mapping[str, Any], allowed: set[str], field_name: str) -> None:
    unknown = set(value) - allowed
    if unknown:
        raise ValueError(f"{field_name} contains unknown fields: {sorted(unknown)}")


def _parse_utc(value: object, field_name: str) -> datetime:
    if not isinstance(value, str) or _RFC3339_UTC_RE.fullmatch(value) is None:
        raise ValueError(f"{field_name} must be an RFC 3339 UTC timestamp")
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field_name} must be an RFC 3339 UTC timestamp") from exc
    return _utc_datetime(parsed, field_name)


def _unit_interval(value: object, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field_name} must be a finite number between 0 and 1")
    numeric = float(value)
    if not math.isfinite(numeric) or not 0.0 <= numeric <= 1.0:
        raise ValueError(f"{field_name} must be a finite number between 0 and 1")
    return numeric


def _string_tuple(value: object, field_name: str) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"{field_name} must be an array")
    return tuple(_non_empty(item, field_name) for item in value)


def _parse_scoring_contract(value: object) -> ScoringContractIdentity:
    payload = _mapping(value, "scoring_contract")
    _strict_keys(payload, _SCORING_CONTRACT_FIELDS, "scoring_contract")
    if set(payload) != _SCORING_CONTRACT_FIELDS:
        raise ValueError("scoring_contract is missing required fields")
    return ScoringContractIdentity(**payload)


def _parse_evidence_source(value: object) -> EvidenceSourceIdentity:
    payload = _mapping(value, "evidence_source_identity")
    _strict_keys(payload, _EVIDENCE_SOURCE_FIELDS, "evidence_source_identity")
    if set(payload) != _EVIDENCE_SOURCE_FIELDS:
        raise ValueError("evidence_source_identity is missing required fields")
    return EvidenceSourceIdentity(**payload)


def _known_scoring_contract_matches(
    value: object,
    expected: ScoringContractIdentity,
) -> bool:
    if not isinstance(value, Mapping):
        return False
    try:
        known = {field: value[field] for field in _SCORING_CONTRACT_FIELDS}
        return _parse_scoring_contract(known) == expected
    except (KeyError, TypeError, ValueError):
        return False


def _known_evidence_source_matches(
    value: object,
    expected: EvidenceSourceIdentity,
) -> bool:
    if not isinstance(value, Mapping):
        return False
    try:
        known = {field: value[field] for field in _EVIDENCE_SOURCE_FIELDS}
        return _parse_evidence_source(known) == expected
    except (KeyError, TypeError, ValueError):
        return False


def _parse_provenance(value: object, *, component: ComponentKind) -> PersistedProvenance:
    payload = _mapping(value, "provenance")
    allowed = {"source_kind", "source_record_id", "run", "producer", "recorded_at", "checked_at"}
    _strict_keys(payload, allowed, "provenance")
    if set(payload) != allowed:
        raise ValueError("provenance is missing required fields")
    source_kind = _non_empty(payload["source_kind"], "source_kind")
    if source_kind not in _SOURCE_KINDS:
        raise ValueError("source_kind is unsupported")
    if source_kind not in _COMPONENT_SOURCE_KINDS[component]:
        raise _CandidateProblem(
            "mismatched",
            f"{component}_provenance_source_kind_mismatch",
        )
    run_payload = _mapping(payload["run"], "run")
    _strict_keys(run_payload, {"run_id", "sequence"}, "run")
    run_id_raw = run_payload.get("run_id")
    sequence_raw = run_payload.get("sequence")
    run_id = _non_empty(run_id_raw, "run_id") if run_id_raw is not None else None
    sequence = _positive_int(sequence_raw, "sequence") if sequence_raw is not None else None
    if run_id is None and sequence is None:
        raise _CandidateProblem("unverifiable", "legacy_run_identity_missing")
    checked_raw = payload["checked_at"]
    return PersistedProvenance(
        source_kind=source_kind,
        source_record_id=_non_empty(payload["source_record_id"], "source_record_id"),
        run=RunIdentity(run_id=run_id, sequence=sequence),
        producer=_non_empty(payload["producer"], "producer"),
        recorded_at=_parse_utc(payload["recorded_at"], "recorded_at"),
        checked_at=_parse_utc(checked_raw, "checked_at") if checked_raw is not None else None,
    )


def _parse_score_value(
    value: object,
    *,
    expected: ExpectedLifecycleCorrelation,
) -> AuthoritativeScore:
    payload = _mapping(value, "score_value")
    required = {
        "node_id",
        "claim_type",
        "values",
        "holes",
        "fatal_flags",
        "recommended_actions",
        "final_score_source",
        "reducer_version",
        "rubric_version",
    }
    if not required.issubset(payload):
        raise ValueError("score_value is missing required fields")
    # P1 Task 5: strict, matching the nested score_values block below. Without
    # it a rename or typo on the producer side
    # (scoring_input_resolver._score_value) would land as an unread extra key
    # and judges_disagree would silently default to False forever -- "never
    # contested", no error, feature dead. Fail loudly instead.
    _strict_keys(payload, required | {"judges_disagree"}, "score_value")
    node_id = _non_empty(payload["node_id"], "score_value.node_id")
    if node_id != expected.node_id:
        raise _CandidateProblem("mismatched", "score_value_node_mismatch")
    claim_type = _non_empty(payload["claim_type"], "claim_type")
    if claim_type not in _CLAIM_TYPES:
        raise ValueError("claim_type is unsupported")
    values_payload = _mapping(payload["values"], "score_values")
    value_fields = {
        "strength",
        "uncertainty",
        "impact",
        "evidence_quality",
        "logical_validity",
        "assumption_risk",
        "counter_resilience",
    }
    _strict_keys(values_payload, value_fields, "score_values")
    if set(values_payload) != value_fields:
        raise ValueError("score_values is missing required fields")
    values = ScoreValues(**{name: _unit_interval(values_payload[name], name) for name in value_fields})
    final_score_source = payload["final_score_source"]
    if final_score_source != "deterministic_reducer":
        raise ValueError("final_score_source must be deterministic_reducer")
    reducer_version = _non_empty(payload["reducer_version"], "reducer_version")
    rubric_version = _non_empty(payload["rubric_version"], "rubric_version")
    contract = expected.active_scoring_contract
    if reducer_version != contract.reducer_version or rubric_version != contract.rubric_version:
        raise _CandidateProblem("mismatched", "score_value_contract_version_mismatch")
    judges_disagree = payload.get("judges_disagree", False)
    if not isinstance(judges_disagree, bool):
        raise ValueError("judges_disagree must be a boolean")
    return AuthoritativeScore(
        node_id=node_id,
        claim_type=claim_type,
        values=values,
        holes=_string_tuple(payload["holes"], "holes"),
        fatal_flags=_string_tuple(payload["fatal_flags"], "fatal_flags"),
        recommended_actions=_string_tuple(payload["recommended_actions"], "recommended_actions"),
        final_score_source="deterministic_reducer",
        reducer_version=reducer_version,
        rubric_version=rubric_version,
        judges_disagree=judges_disagree,
    )


def _parse_evidence_value(
    value: object,
    *,
    expected_source: EvidenceSourceIdentity,
) -> AuthoritativeEvidence:
    payload = _mapping(value, "evidence_value")
    allowed = {
        "source",
        "status",
        "base_score",
        "uncertainty",
        "entailment",
        "caveats",
        "evaluator_id",
        "evaluator_version",
    }
    _strict_keys(payload, allowed, "evidence_value")
    if set(payload) != allowed:
        raise ValueError("evidence_value is missing required fields")
    source = _parse_evidence_source(payload["source"])
    if source != expected_source:
        raise _CandidateProblem("mismatched", "evidence_value_source_mismatch")
    try:
        status = EvidenceStatus(payload["status"])
        entailment = EntailmentLabel(payload["entailment"])
    except (TypeError, ValueError) as exc:
        raise ValueError("evidence status or entailment is unsupported") from exc
    allowed_entailments = {
        EvidenceStatus.GROUNDED: {EntailmentLabel.SUPPORTS},
        EvidenceStatus.MISSING: {EntailmentLabel.NOINFO},
        EvidenceStatus.UNAVAILABLE: {EntailmentLabel.NOINFO},
        EvidenceStatus.NO_INFO: {EntailmentLabel.NOINFO},
        EvidenceStatus.REFUTED: {EntailmentLabel.REFUTES},
        EvidenceStatus.CONTRADICTED: {EntailmentLabel.REFUTES},
        EvidenceStatus.RETRACTED: {
            EntailmentLabel.SUPPORTS,
            EntailmentLabel.REFUTES,
            EntailmentLabel.NOINFO,
        },
    }
    if entailment not in allowed_entailments[status]:
        raise ValueError("evidence_status_entailment_mismatch")
    return AuthoritativeEvidence(
        source=source,
        status=status,
        base_score=_unit_interval(payload["base_score"], "base_score"),
        uncertainty=_unit_interval(payload["uncertainty"], "uncertainty"),
        entailment=entailment,
        caveats=_string_tuple(payload["caveats"], "caveats"),
        evaluator_id=_non_empty(payload["evaluator_id"], "evaluator_id"),
        evaluator_version=_non_empty(payload["evaluator_version"], "evaluator_version"),
    )


def _run_identity_for_arbitration(value: object) -> RunIdentity | None:
    """Retain independently parseable run components before later validation."""

    try:
        provenance = _mapping(value, "provenance")
        run_payload = _mapping(provenance.get("run"), "run")
    except (TypeError, ValueError):
        return None

    run_id: str | None = None
    run_id_raw = run_payload.get("run_id")
    if run_id_raw is not None:
        try:
            run_id = _non_empty(run_id_raw, "run_id")
        except (TypeError, ValueError):
            pass

    sequence: int | None = None
    sequence_raw = run_payload.get("sequence")
    if sequence_raw is not None:
        try:
            sequence = _positive_int(sequence_raw, "sequence")
        except (TypeError, ValueError):
            pass

    if run_id is None and sequence is None:
        return None
    return RunIdentity(run_id=run_id, sequence=sequence)


def _problem_outcome(
    component: ComponentKind,
    problem: _CandidateProblem,
    *,
    run: RunIdentity | None = None,
    current_identity: bool = False,
) -> _CandidateOutcome:
    retained_run = run
    if retained_run is None and problem.provenance is not None:
        retained_run = problem.provenance.run
    return _CandidateOutcome(
        resolution=ComponentResolution(
            component=component,
            state=problem.state,
            availability=problem.availability,
            freshness=problem.freshness,
            reason_code=problem.reason_code,
            provenance=problem.provenance,
        ),
        run=retained_run,
        current_identity=current_identity,
    )


def _classify_candidate(
    component: ComponentKind,
    candidate: object,
    expected: ExpectedLifecycleCorrelation,
) -> _CandidateOutcome:
    if not isinstance(candidate, Mapping):
        return _problem_outcome(
            component,
            _CandidateProblem("malformed", f"{component}_candidate_not_mapping"),
        )
    candidate_run: RunIdentity | None = None
    candidate_current_identity = False
    try:
        if component == "score" and candidate.get("schema_version") is None:
            legacy_reasons = {
                "neutral_placeholder": "neutral_placeholder_not_authoritative",
                "historical_score": "historical_score_not_lifecycle_authoritative",
            }
            legacy_reason = legacy_reasons.get(candidate.get("legacy_kind"))
            if legacy_reason is not None:
                raise _CandidateProblem("unverifiable", legacy_reason)
        schema_version = candidate.get("schema_version")
        if schema_version is None:
            raise _CandidateProblem("unverifiable", "legacy_schema_version_missing")
        if not isinstance(schema_version, str):
            raise _CandidateProblem("malformed", "malformed_schema_version")
        if schema_version != SCHEMA_VERSION:
            raise _CandidateProblem("mismatched", "unsupported_schema_version")

        common_fields = {
            "schema_version",
            "debate_id",
            "node_id",
            "availability",
            "observed_at",
            "provenance",
            "value",
            "unavailability_reason",
        }
        component_fields = (
            {"input_hash", "scoring_contract"}
            if component == "score"
            else {"source_identity"}
        )
        debate_id = _non_empty(candidate.get("debate_id"), "debate_id")
        node_id = _non_empty(candidate.get("node_id"), "node_id")
        if debate_id != expected.debate_id:
            raise _CandidateProblem("mismatched", "debate_id_mismatch")
        if node_id != expected.node_id:
            raise _CandidateProblem("mismatched", "node_id_mismatch")

        expected_source: EvidenceSourceIdentity | None = None
        if component == "score":
            if candidate.get("input_hash") is None:
                raise _CandidateProblem("mismatched", "legacy_score_input_hash_missing")
            input_hash = _sha256(candidate["input_hash"], "input_hash")
            if input_hash != expected.current_score_input_hash:
                raise _CandidateProblem("mismatched", "score_input_hash_mismatch")
            if candidate.get("scoring_contract") is None:
                raise _CandidateProblem("mismatched", "legacy_scoring_contract_identity_missing")
            candidate_current_identity = _known_scoring_contract_matches(
                candidate["scoring_contract"],
                expected.active_scoring_contract,
            )
            if candidate_current_identity:
                candidate_run = _run_identity_for_arbitration(candidate.get("provenance"))
            contract = _parse_scoring_contract(candidate["scoring_contract"])
            if contract != expected.active_scoring_contract:
                raise _CandidateProblem("mismatched", "scoring_contract_mismatch")
        else:
            expected_source = expected.expected_evidence_source
            if expected_source is None:
                raise _CandidateProblem("missing", "evidence_missing", availability="absent")
            if expected_source.claim_node_id != expected.node_id:
                raise _CandidateProblem("mismatched", "evidence_source_claim_node_mismatch")
            if candidate.get("source_identity") is None:
                raise _CandidateProblem("unverifiable", "legacy_evidence_source_identity_missing")
            candidate_current_identity = _known_evidence_source_matches(
                candidate["source_identity"],
                expected_source,
            )
            if candidate_current_identity:
                candidate_run = _run_identity_for_arbitration(candidate.get("provenance"))
            source = _parse_evidence_source(candidate["source_identity"])
            if source != expected_source:
                raise _CandidateProblem("mismatched", "evidence_source_mismatch")

        candidate_current_identity = True
        if candidate_run is None:
            candidate_run = _run_identity_for_arbitration(candidate.get("provenance"))
        _strict_keys(candidate, common_fields | component_fields, f"{component}_envelope")
        availability = candidate.get("availability")
        if availability not in {"absent", "present", "in_progress", "terminal_unverifiable"}:
            raise _CandidateProblem("malformed", "invalid_availability")
        reason_raw = candidate.get("unavailability_reason")
        reason = _non_empty(reason_raw, "unavailability_reason") if reason_raw is not None else None

        if availability == "absent":
            if any(candidate.get(name) is not None for name in ("observed_at", "provenance", "value")):
                raise _CandidateProblem("malformed", "invalid_absent_shape", availability="absent")
            raise _CandidateProblem("missing", reason or f"{component}_missing", availability="absent")

        observed_raw = candidate.get("observed_at")
        observed_at: datetime | None = None
        if observed_raw is not None:
            try:
                observed_at = _parse_utc(observed_raw, "observed_at")
            except ValueError as exc:
                raise _CandidateProblem("malformed", "malformed_observed_at") from exc
            if observed_at > expected.decision_timestamp:
                raise _CandidateProblem("mismatched", "artifact_after_decision_timestamp")

        if availability == "in_progress":
            if candidate.get("value") is not None:
                raise _CandidateProblem("malformed", "pending_value_must_be_null", availability="in_progress")
            provenance = (
                _parse_provenance(candidate["provenance"], component=component)
                if candidate.get("provenance") is not None
                else None
            )
            raise _CandidateProblem(
                "pending",
                reason or f"{component}_pending",
                availability="in_progress",
                provenance=provenance,
            )

        if availability == "terminal_unverifiable":
            if candidate.get("value") is not None:
                raise _CandidateProblem(
                    "malformed",
                    "unverifiable_value_must_be_null",
                    availability="terminal_unverifiable",
                )
            provenance = (
                _parse_provenance(candidate["provenance"], component=component)
                if candidate.get("provenance") is not None
                else None
            )
            raise _CandidateProblem(
                "unverifiable",
                reason or f"{component}_terminal_unverifiable",
                availability="terminal_unverifiable",
                provenance=provenance,
            )

        if observed_at is None:
            raise _CandidateProblem("unverifiable", "legacy_observed_at_missing")
        if candidate.get("provenance") is None:
            raise _CandidateProblem("malformed", "present_provenance_missing")
        provenance = _parse_provenance(candidate["provenance"], component=component)
        # Contract v1 §6.1 amendment (2026-07-26, P1 contested frontier): the
        # AGE gate applies to EVIDENCE only. For a SCORE, freshness is
        # identity, not wall clock.
        #
        # Why: by the time control reaches here, a score candidate has already
        # been required to carry `input_hash == expected.current_score_input_
        # hash` and a scoring_contract equal to the active contract (both
        # raise `mismatched` above, before age is ever consulted -- §6's own
        # "identity validation happens before age is trusted"). The input hash
        # covers claim, argument text, debate question and the rendered
        # children digest (app.scoring.cache.node_scoring_input_hash); the
        # contract hash covers judge id/version/role and every rubric, prompt,
        # schema and reducer version. A candidate that survives both IS, by
        # construction, the judgment of exactly this input under exactly this
        # contract. Nothing about it can drift while the clock runs, because
        # every input that could drift is inside one of those two hashes --
        # and when one DOES drift, the resolver already says so precisely
        # (`score_input_hash_mismatch` / `scoring_contract_mismatch`), which
        # is the honest statement the age gate was being mistaken for.
        #
        # What the age gate actually did in production (evidence:
        # .superpowers/sdd/2026-07-24-p1-contested-frontier/
        # acceptance-path-report.md §2.4): app.scoring.cache serves an
        # unchanged node from its existing NodeScoringResult row and never
        # rewrites `checked_at`, so one hour after a node was first judged its
        # score was permanently `stale` and it could never authenticate a
        # lifecycle decision again -- unless its input hash changed and it was
        # really re-judged. On a live 84-node debate that collapsed 32
        # lifecycle-eligible nodes to 0 authenticated decisions (26 refused
        # `score_stale`) and degenerated the contested frontier to
        # re-challenging the one node that had just expanded.
        #
        # Rejected alternative: refresh the row's `checked_at` on a cache hit.
        # app.exploration.lifecycle_decision_service._run_authenticates_row
        # requires the row's `checked_at` to EQUAL its judge artifact's
        # `checked_at`, and the cache-hit path (service._relink_cached_node_
        # artifacts_to_current_job) deliberately re-attributes the ORIGINAL
        # artifact rather than writing a new one. Bumping the row alone breaks
        # that authentication link outright; bumping the artifact too would
        # falsify the durable record of when a judge was actually called. The
        # honest move is to stop asking a question whose answer we do not need.
        #
        # EVIDENCE keeps its age gate unconditionally: an evidence verdict is
        # an observation of the world outside this database (sources move,
        # 404, get retracted), so for it wall-clock age is real information.
        if component == "evidence":
            age_seconds = (expected.decision_timestamp - observed_at).total_seconds()
            if age_seconds > expected.evidence_max_age_seconds:
                raise _CandidateProblem(
                    "stale",
                    "evidence_stale",
                    freshness="stale",
                    provenance=provenance,
                )
        if candidate.get("value") is None:
            raise _CandidateProblem(
                "malformed",
                "present_value_missing",
                freshness="fresh",
                provenance=provenance,
            )
        try:
            value = (
                _parse_score_value(candidate["value"], expected=expected)
                if component == "score"
                else _parse_evidence_value(candidate["value"], expected_source=expected_source)
            )
        except _CandidateProblem as problem:
            raise _CandidateProblem(
                problem.state,
                problem.reason_code,
                freshness="fresh",
                provenance=provenance,
            ) from problem
        except (KeyError, TypeError, ValueError) as exc:
            raise _CandidateProblem(
                "malformed",
                f"malformed_{component}_candidate:{exc}",
                freshness="fresh",
                provenance=provenance,
            ) from exc
        return _CandidateOutcome(
            resolution=ComponentResolution(
                component=component,
                state="grounded",
                availability="present",
                freshness="fresh",
                reason_code=f"{component}_grounded",
                provenance=provenance,
            ),
            value=value,
            run=provenance.run,
            current_identity=True,
        )
    except _CandidateProblem as problem:
        return _problem_outcome(
            component,
            problem,
            run=candidate_run,
            current_identity=candidate_current_identity,
        )
    except (KeyError, TypeError, ValueError) as exc:
        return _problem_outcome(
            component,
            _CandidateProblem("malformed", f"malformed_{component}_candidate:{exc}"),
            run=candidate_run,
            current_identity=candidate_current_identity,
        )


def _canonical_payload(value: object) -> tuple[Any, ...]:
    """Build a deterministic, type-sensitive value for conflict comparison."""

    if value is None:
        return ("none",)
    if isinstance(value, bool):
        return ("bool", value)
    if isinstance(value, int):
        return ("int", value)
    if isinstance(value, float):
        return ("float", value.hex())
    if isinstance(value, str):
        return ("str", value)
    if isinstance(value, Mapping):
        items = [
            (_canonical_payload(key), _canonical_payload(item))
            for key, item in value.items()
        ]
        items.sort(key=lambda pair: repr(pair[0]))
        return ("mapping", tuple(items))
    if isinstance(value, list):
        return ("list", tuple(_canonical_payload(item) for item in value))
    if isinstance(value, tuple):
        return ("tuple", tuple(_canonical_payload(item) for item in value))
    value_type = type(value)
    return ("unsupported", value_type.__module__, value_type.__qualname__)


def _resolution_for_candidates(
    component: ComponentKind,
    candidates: tuple[Mapping[str, Any], ...],
    expected: ExpectedLifecycleCorrelation,
) -> _CandidateOutcome:
    if not candidates:
        return _CandidateOutcome(_missing_resolution(component))
    outcomes = [_classify_candidate(component, candidate, expected=expected) for candidate in candidates]
    current_unidentified = [
        outcome for outcome in outcomes if outcome.current_identity and outcome.run is None
    ]
    if current_unidentified:
        return max(
            current_unidentified,
            key=lambda outcome: _STATE_PRECEDENCE[outcome.resolution.state],
        )
    identified = [
        (candidate, outcome)
        for candidate, outcome in zip(candidates, outcomes, strict=True)
        if outcome.run is not None
    ]
    if not identified:
        return max(outcomes, key=lambda outcome: _STATE_PRECEDENCE[outcome.resolution.state])

    canonical_identified = [
        (candidate, outcome, _canonical_payload(candidate))
        for candidate, outcome in identified
    ]
    run_ids: dict[str, tuple[int | None, tuple[Any, ...]]] = {}
    sequences: dict[int, tuple[Any, ...]] = {}
    for _, outcome, canonical in canonical_identified:
        run = outcome.run
        assert run is not None
        if run.sequence is not None:
            prior_payload = sequences.setdefault(run.sequence, canonical)
            if prior_payload != canonical:
                return _problem_outcome(
                    component,
                    _CandidateProblem("mismatched", "conflicting_run_sequence"),
                )
        if run.run_id is not None:
            run_identity = (run.sequence, canonical)
            prior_identity = run_ids.setdefault(run.run_id, run_identity)
            if prior_identity != run_identity:
                return _problem_outcome(
                    component,
                    _CandidateProblem("mismatched", "conflicting_run_identity"),
                )

    unique_identified: list[tuple[_CandidateOutcome, tuple[Any, ...]]] = []
    seen_payloads: set[tuple[Any, ...]] = set()
    for _, outcome, canonical in canonical_identified:
        if canonical not in seen_payloads:
            unique_identified.append((outcome, canonical))
            seen_payloads.add(canonical)

    with_sequence = [
        outcome
        for outcome, _ in unique_identified
        if outcome.run is not None and outcome.run.sequence is not None
    ]
    without_sequence = [
        outcome
        for outcome, _ in unique_identified
        if outcome.run is not None and outcome.run.sequence is None
    ]
    if with_sequence and without_sequence:
        return _problem_outcome(
            component,
            _CandidateProblem("unverifiable", "ambiguous_run_ordering"),
        )
    if with_sequence:
        return max(
            with_sequence,
            key=lambda outcome: outcome.run.sequence,
        )
    if len(without_sequence) == 1:
        return without_sequence[0]
    return _problem_outcome(
        component,
        _CandidateProblem("unverifiable", "ambiguous_run_identity"),
    )


def map_lifecycle_inputs(
    *,
    expected: ExpectedLifecycleCorrelation,
    score_candidates: tuple[Mapping[str, Any], ...],
    evidence_candidates: tuple[Mapping[str, Any], ...],
) -> GroundedLifecycleInputs | UnavailableLifecycleInputs:
    """Resolve persisted candidates without I/O or implicit placeholder values."""

    score_outcome = _resolution_for_candidates("score", score_candidates, expected)
    evidence_outcome = _resolution_for_candidates("evidence", evidence_candidates, expected)
    score_resolution = score_outcome.resolution
    evidence_resolution = evidence_outcome.resolution
    if score_resolution.state == "grounded" and evidence_resolution.state == "grounded":
        assert isinstance(score_outcome.value, AuthoritativeScore)
        assert isinstance(evidence_outcome.value, AuthoritativeEvidence)
        return GroundedLifecycleInputs(
            schema_version=SCHEMA_VERSION,
            state="grounded",
            correlation=expected,
            score_resolution=score_resolution,
            evidence_resolution=evidence_resolution,
            score=score_outcome.value,
            evidence=evidence_outcome.value,
        )
    state = max(
        (score_resolution.state, evidence_resolution.state),
        key=lambda item: _STATE_PRECEDENCE[item],
    )
    reason_codes = tuple(
        resolution.reason_code
        for resolution in (score_resolution, evidence_resolution)
        if resolution.state != "grounded"
    )
    return UnavailableLifecycleInputs(
        schema_version=SCHEMA_VERSION,
        state=state,
        correlation=expected,
        score_resolution=score_resolution,
        evidence_resolution=evidence_resolution,
        reason_codes=reason_codes,
    )


def policy_signals_for_lifecycle(
    inputs: GroundedLifecycleInputs | UnavailableLifecycleInputs,
) -> tuple[ScoreSignal, EvidenceSignal] | None:
    """Return real policy inputs only for a fully grounded aggregate."""

    if not isinstance(inputs, GroundedLifecycleInputs):
        return None
    score = inputs.score
    evidence = inputs.evidence
    return (
        ScoreSignal(
            node_id=score.node_id,
            claim_type=score.claim_type,
            strength=score.values.strength,
            uncertainty=score.values.uncertainty,
            impact=score.values.impact,
            evidence_quality=score.values.evidence_quality,
            logical_validity=score.values.logical_validity,
            assumption_risk=score.values.assumption_risk,
            counter_resilience=score.values.counter_resilience,
            holes=score.holes,
            fatal_flags=score.fatal_flags,
            recommended_actions=score.recommended_actions,
            judges_disagree=score.judges_disagree,
        ),
        EvidenceSignal(
            status=evidence.status,
            base_score=evidence.base_score,
            uncertainty=evidence.uncertainty,
            entailment=evidence.entailment,
            caveats=evidence.caveats,
        ),
    )
