from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from app.exploration.lifecycle_inputs import (
    SCHEMA_VERSION,
    Availability,
    ComponentResolution,
    ExpectedLifecycleCorrelation,
    Freshness,
    LifecycleInputState,
    RunIdentity,
    map_lifecycle_inputs,
)
from app.exploration.policy import ScoreSignal
from app.models.entities import NodeScoringResult
from app.scoring.models import NodeScoringPayload


MAX_SCORING_RESULT_CANDIDATES = 32
_STATE_PRECEDENCE = {
    "grounded": -1,
    "missing": 0,
    "pending": 1,
    "unverifiable": 2,
    "stale": 3,
    "mismatched": 4,
    "malformed": 5,
}


@dataclass(frozen=True)
class ScoringResultCandidate:
    """A persisted score row paired with its explicit producing run identity."""

    row: NodeScoringResult
    run: RunIdentity


@dataclass(frozen=True)
class ScoringInputResolution:
    """A policy-safe score component result.

    ``signal`` and ``lifecycle_candidate`` are present only for a fully
    validated, current score row. Callers cannot mistake a historical or
    unsafe payload for a neutral score.
    """

    resolution: ComponentResolution
    signal: ScoreSignal | None = None
    lifecycle_candidate: Mapping[str, Any] | None = None
    selected_record_id: str | None = None


@dataclass(frozen=True)
class _Problem:
    state: LifecycleInputState
    reason: str
    availability: Availability = "present"
    freshness: Freshness = "unknown"


def _unavailable(problem: _Problem) -> ScoringInputResolution:
    return ScoringInputResolution(
        resolution=ComponentResolution(
            component="score",
            state=problem.state,
            availability=problem.availability,
            freshness=problem.freshness,
            reason_code=problem.reason,
        )
    )


def _best_problem(problems: Sequence[_Problem]) -> _Problem:
    return max(
        problems,
        key=lambda problem: (_STATE_PRECEDENCE[problem.state], problem.reason),
    )


def _valid_run_id(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def _valid_sequence(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return None
    return value


def _validate_current_run(run: RunIdentity) -> RunIdentity:
    run_id = _valid_run_id(run.run_id) if run.run_id is not None else None
    sequence = _valid_sequence(run.sequence) if run.sequence is not None else None
    if run.run_id is not None and run_id is None:
        raise ValueError("current_run.run_id must be a non-empty string")
    if run.sequence is not None and sequence is None:
        raise ValueError("current_run.sequence must be a positive integer")
    if run_id is None and sequence is None:
        raise ValueError("current_run must contain a run_id or sequence")
    return RunIdentity(run_id=run_id, sequence=sequence)


def _candidate_run_parts(run: RunIdentity) -> tuple[str | None, int | None]:
    return _valid_run_id(run.run_id), _valid_sequence(run.sequence)


def _is_current_run(candidate: RunIdentity, expected: RunIdentity) -> bool:
    candidate_run_id, candidate_sequence = _candidate_run_parts(candidate)
    if (
        expected.run_id is not None
        and expected.sequence is not None
        and candidate_run_id is not None
        and candidate_sequence is not None
    ):
        return bool(
            candidate_run_id == expected.run_id
            and candidate_sequence == expected.sequence
        )
    return bool(
        (expected.run_id is not None and candidate_run_id == expected.run_id)
        or (expected.sequence is not None and candidate_sequence == expected.sequence)
    )


def _run_arbitration_key(
    run: RunIdentity,
    expected: RunIdentity,
) -> tuple[int, bool, int]:
    """Order conflict checks by fixed semantic relation to the current run.

    Opaque run identifiers are compared only for equality. Their lexical
    values, source record identifiers, timestamps, payloads, and arrival order
    never choose which conflict class has precedence.
    """

    run_id, sequence = _candidate_run_parts(run)
    same_run_id = expected.run_id is not None and run_id == expected.run_id
    same_sequence = expected.sequence is not None and sequence == expected.sequence
    exact_current = bool(
        (expected.run_id is None or same_run_id)
        and (expected.sequence is None or same_sequence)
    )
    if exact_current:
        conflict_class = 0
    elif same_run_id:
        conflict_class = 1
    elif same_sequence:
        conflict_class = 2
    elif run_id is None or sequence is None:
        conflict_class = 3
    else:
        conflict_class = 4
    return (
        conflict_class,
        sequence is None,
        sequence or 0,
    )


def _shares_run_component(first: RunIdentity, second: RunIdentity) -> bool:
    first_run_id, first_sequence = _candidate_run_parts(first)
    second_run_id, second_sequence = _candidate_run_parts(second)
    return bool(
        (first_run_id is not None and first_run_id == second_run_id)
        or (first_sequence is not None and first_sequence == second_sequence)
    )


def _has_complementary_current_run_conflict(
    candidates: Sequence[ScoringResultCandidate],
    expected: RunIdentity,
) -> bool:
    """Detect a split contradiction across an explicit expected run pair.

    A partial current anchor may establish one expected component while a
    different full row claims the other expected component for an incompatible
    pair. Once both claims are present, the fixed same-run conflict class takes
    precedence; opaque run and source-record identifier values are irrelevant.
    """

    if expected.run_id is None or expected.sequence is None:
        return False
    run_parts = tuple(_candidate_run_parts(candidate.run) for candidate in candidates)
    if any(
        run_id == expected.run_id and sequence == expected.sequence
        for run_id, sequence in run_parts
    ):
        return False
    run_only_anchor = any(
        run_id == expected.run_id and sequence is None
        for run_id, sequence in run_parts
    )
    conflicting_sequence_claim = any(
        sequence == expected.sequence
        and run_id is not None
        and run_id != expected.run_id
        for run_id, sequence in run_parts
    )
    sequence_only_anchor = any(
        run_id is None and sequence == expected.sequence
        for run_id, sequence in run_parts
    )
    conflicting_run_claim = any(
        run_id == expected.run_id
        and sequence is not None
        and sequence != expected.sequence
        for run_id, sequence in run_parts
    )
    return bool(
        (run_only_anchor and conflicting_sequence_claim)
        or (sequence_only_anchor and conflicting_run_claim)
    )


def _non_empty(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def _component_identity_problem(
    row: NodeScoringResult,
    expected: ExpectedLifecycleCorrelation,
) -> _Problem | None:
    if _non_empty(getattr(row, "debate_id", None)) != expected.debate_id:
        return _Problem("mismatched", "debate_id_mismatch")
    if _non_empty(getattr(row, "node_id", None)) != expected.node_id:
        return _Problem("mismatched", "node_id_mismatch")

    input_hash = getattr(row, "input_hash", None)
    if input_hash is None:
        return _Problem("mismatched", "legacy_score_input_hash_missing")
    if not isinstance(input_hash, str) or input_hash != expected.current_score_input_hash:
        return _Problem("mismatched", "score_input_hash_mismatch")

    contract_hash = getattr(row, "contract_hash", None)
    if contract_hash is None:
        return _Problem("mismatched", "legacy_scoring_contract_identity_missing")
    judge_id = getattr(row, "judge_id", None)
    judge_version = getattr(row, "judge_version", None)
    judge_role = getattr(row, "judge_role", None)
    if any(value is None for value in (judge_id, judge_version, judge_role)):
        return _Problem("mismatched", "legacy_scoring_contract_identity_missing")
    contract = expected.active_scoring_contract
    if (
        judge_id != contract.judge_id
        or judge_version != contract.judge_version
        or judge_role != contract.role
        or contract_hash != contract.contract_hash
    ):
        return _Problem("mismatched", "scoring_contract_mismatch")
    return None


def _row_identity_problem(
    row: NodeScoringResult,
    expected: ExpectedLifecycleCorrelation,
) -> _Problem | None:
    component_problem = _component_identity_problem(row, expected)
    if component_problem is not None:
        return component_problem

    if _non_empty(getattr(row, "id", None)) is None:
        return _Problem("malformed", "malformed_node_scoring_result")
    if _non_empty(getattr(row, "provider", None)) is None:
        return _Problem("malformed", "malformed_node_scoring_provenance")
    status = getattr(row, "status", None)
    if status not in {"available", "unavailable"}:
        return _Problem("malformed", "malformed_node_scoring_status")
    return None


def _result_payload(
    row: NodeScoringResult,
    expected: ExpectedLifecycleCorrelation,
) -> tuple[NodeScoringPayload | None, _Problem | None]:
    result = getattr(row, "result", None)
    if not isinstance(result, Mapping):
        return None, _Problem("malformed", "malformed_node_scoring_result")
    if result.get("debate_id") != expected.debate_id:
        return None, _Problem("mismatched", "score_payload_debate_mismatch")
    if result.get("status") != "available":
        return None, _Problem("malformed", "malformed_node_scoring_payload")
    items = result.get("items")
    if not isinstance(items, list):
        return None, _Problem("malformed", "malformed_node_scoring_payload")
    matching_items = [
        item
        for item in items
        if isinstance(item, Mapping) and item.get("node_id") == expected.node_id
    ]
    if len(matching_items) != 1:
        identified_other_node = bool(items) and all(
            isinstance(item, Mapping) and _non_empty(item.get("node_id")) is not None
            for item in items
        )
        if identified_other_node and not matching_items:
            return None, _Problem("mismatched", "score_payload_node_mismatch")
        return None, _Problem("malformed", "malformed_node_scoring_payload")
    try:
        payload = NodeScoringPayload.model_validate(matching_items[0], strict=True)
    except (TypeError, ValidationError, ValueError):
        return None, _Problem("malformed", "malformed_node_scoring_payload")
    if payload.node_id != expected.node_id or payload.claim.node_id != expected.node_id:
        return None, _Problem("mismatched", "score_payload_node_mismatch")
    score_provenance = payload.score_provenance
    contract = expected.active_scoring_contract
    if (
        score_provenance.reducer_version != contract.reducer_version
        or score_provenance.rubric_version != contract.rubric_version
    ):
        return None, _Problem("mismatched", "score_value_contract_version_mismatch")
    return payload, None


def _observed_at(row: NodeScoringResult) -> object:
    metadata = getattr(row, "provider_metadata", None)
    if not isinstance(metadata, Mapping):
        return None
    return metadata.get("checked_at")


def _contract_payload(expected: ExpectedLifecycleCorrelation) -> dict[str, str]:
    contract = expected.active_scoring_contract
    return {
        "judge_id": contract.judge_id,
        "judge_version": contract.judge_version,
        "role": contract.role,
        "rubric_version": contract.rubric_version,
        "prompt_version": contract.prompt_version,
        "output_schema_version": contract.output_schema_version,
        "reducer_version": contract.reducer_version,
        "contract_hash": contract.contract_hash,
    }


def _score_value(payload: NodeScoringPayload) -> dict[str, object]:
    return {
        "node_id": payload.node_id,
        "claim_type": payload.claim.claim_type,
        "values": {
            "strength": payload.scores.strength,
            "uncertainty": payload.scores.uncertainty,
            "impact": payload.scores.impact,
            "evidence_quality": payload.scores.evidence_quality,
            "logical_validity": payload.scores.logical_validity,
            "assumption_risk": payload.scores.assumption_risk,
            "counter_resilience": payload.scores.counter_resilience,
        },
        "holes": [hole.type for hole in payload.holes],
        "fatal_flags": [f"{flag.type}:{flag.severity}" for flag in payload.fatal_flags],
        "recommended_actions": [item.action for item in payload.recommended_investigations],
        "final_score_source": payload.score_provenance.final_score_source,
        "reducer_version": payload.score_provenance.reducer_version,
        "rubric_version": payload.score_provenance.rubric_version,
    }


def _lifecycle_candidate(
    candidate: ScoringResultCandidate,
    expected: ExpectedLifecycleCorrelation,
    payload: NodeScoringPayload | None,
) -> dict[str, object]:
    row = candidate.row
    status = getattr(row, "status", None)
    observed_at = _observed_at(row)
    run = candidate.run
    provenance = {
        "source_kind": "node_scoring_result",
        "source_record_id": getattr(row, "id", None),
        "run": {"run_id": run.run_id, "sequence": run.sequence},
        "producer": getattr(row, "provider", None),
        "recorded_at": observed_at,
        "checked_at": observed_at,
    }
    if status == "unavailable":
        return {
            "schema_version": SCHEMA_VERSION,
            "debate_id": getattr(row, "debate_id", None),
            "node_id": getattr(row, "node_id", None),
            "input_hash": getattr(row, "input_hash", None),
            "scoring_contract": _contract_payload(expected),
            "availability": "terminal_unverifiable",
            "observed_at": observed_at,
            "provenance": provenance,
            "value": None,
            "unavailability_reason": "score_terminal_unverifiable",
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "debate_id": getattr(row, "debate_id", None),
        "node_id": getattr(row, "node_id", None),
        "input_hash": getattr(row, "input_hash", None),
        "scoring_contract": _contract_payload(expected),
        "availability": "present",
        "observed_at": observed_at,
        "provenance": provenance,
        "value": _score_value(payload) if payload is not None else None,
        "unavailability_reason": None,
    }


def resolve_scoring_input(
    *,
    expected: ExpectedLifecycleCorrelation,
    current_run: RunIdentity,
    candidates: Sequence[ScoringResultCandidate],
) -> ScoringInputResolution:
    """Resolve a bounded history into one authoritative lifecycle score input.

    Candidate order has no semantic meaning. The caller supplies the current
    persisted run identity; timestamps are used only for freshness after the
    current run has been established.
    """

    current_run = _validate_current_run(current_run)
    candidate_rows = tuple(candidates)
    if len(candidate_rows) > MAX_SCORING_RESULT_CANDIDATES:
        return _unavailable(
            _Problem("unverifiable", "score_candidate_limit_exceeded")
        )
    if not candidate_rows:
        return _unavailable(
            _Problem("missing", "score_missing", availability="absent")
        )

    exact_identity_candidates: list[ScoringResultCandidate] = []
    different_identity: list[tuple[ScoringResultCandidate, _Problem]] = []
    for candidate in candidate_rows:
        identity_problem = _component_identity_problem(candidate.row, expected)
        if identity_problem is None:
            exact_identity_candidates.append(candidate)
        else:
            different_identity.append((candidate, identity_problem))

    if not exact_identity_candidates:
        current_identity_problems = [
            problem
            for candidate, problem in different_identity
            if _is_current_run(candidate.run, current_run)
        ]
        if current_identity_problems:
            return _unavailable(_best_problem(current_identity_problems))
        different_run_parts = [
            _candidate_run_parts(candidate.run)
            for candidate, _ in different_identity
        ]
        if not any(
            run_id is not None or sequence is not None
            for run_id, sequence in different_run_parts
        ):
            return _unavailable(
                _Problem("unverifiable", "legacy_run_identity_missing")
            )
        return _unavailable(_Problem("mismatched", "score_run_superseded"))

    candidate_rows = tuple(exact_identity_candidates)
    usable_run_parts = [_candidate_run_parts(candidate.run) for candidate in candidate_rows]
    if not any(run_id is not None or sequence is not None for run_id, sequence in usable_run_parts):
        return _unavailable(
            _Problem("unverifiable", "legacy_run_identity_missing")
        )

    current_candidates = [
        candidate
        for candidate in candidate_rows
        if _is_current_run(candidate.run, current_run)
    ]
    current_anchors = tuple(current_candidates)
    if current_anchors:
        current_candidates.extend(
            candidate
            for candidate in candidate_rows
            if candidate not in current_candidates
            and _shares_run_component(candidate.run, current_run)
        )
    if not current_candidates:
        return _unavailable(_Problem("mismatched", "score_run_superseded"))
    current_candidates.sort(
        key=lambda candidate: _run_arbitration_key(candidate.run, current_run)
    )

    problems: list[_Problem] = []
    parsed: list[tuple[ScoringResultCandidate, NodeScoringPayload | None]] = []
    for candidate in current_candidates:
        row = candidate.row
        identity_problem = _row_identity_problem(row, expected)
        if identity_problem is not None:
            problems.append(identity_problem)
            continue
        if getattr(row, "status", None) == "unavailable":
            parsed.append((candidate, None))
            continue
        payload, payload_problem = _result_payload(row, expected)
        if payload_problem is not None:
            problems.append(payload_problem)
            continue
        parsed.append((candidate, payload))

    if problems:
        return _unavailable(_best_problem(problems))
    if _has_complementary_current_run_conflict(
        tuple(candidate for candidate, _ in parsed),
        current_run,
    ):
        return _unavailable(
            _Problem("mismatched", "conflicting_run_identity")
        )

    lifecycle_candidates = tuple(
        _lifecycle_candidate(candidate, expected, payload)
        for candidate, payload in parsed
    )
    mapped = map_lifecycle_inputs(
        expected=expected,
        score_candidates=lifecycle_candidates,
        evidence_candidates=(),
    )
    resolution = mapped.score_resolution
    if resolution.state != "grounded":
        return ScoringInputResolution(resolution=resolution)

    selected_index = 0
    if current_run.run_id is not None:
        for index, (candidate, _) in enumerate(parsed):
            if _valid_run_id(candidate.run.run_id) == current_run.run_id:
                selected_index = index
                break
    selected_candidate, selected_payload = parsed[selected_index]
    assert selected_payload is not None
    return ScoringInputResolution(
        resolution=resolution,
        signal=ScoreSignal.from_scoring_payload(selected_payload),
        lifecycle_candidate=lifecycle_candidates[selected_index],
        selected_record_id=selected_candidate.row.id,
    )
