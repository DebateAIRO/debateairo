from __future__ import annotations

import ast
from datetime import datetime, timezone
from itertools import permutations
from pathlib import Path

import pytest

from app.exploration.lifecycle_inputs import (
    SCHEMA_VERSION,
    ComponentResolution,
    ExpectedLifecycleCorrelation,
    RunIdentity,
    ScoringContractIdentity,
)
from app.exploration.scoring_input_resolver import (
    MAX_SCORING_RESULT_CANDIDATES,
    ScoringResultCandidate,
    resolve_scoring_input,
)
from app.models.entities import NodeScoringResult


DECISION_TIME = datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)
CURRENT_INPUT_HASH = "a" * 64
CURRENT_CONTRACT_HASH = "b" * 64


def scoring_contract() -> ScoringContractIdentity:
    return ScoringContractIdentity(
        judge_id="node_scoring.primary",
        judge_version="v1",
        role="judge",
        rubric_version="debateai-rubric-v1",
        prompt_version="scoring-provider-v1",
        output_schema_version="claim-assessment-v1",
        reducer_version="node-scoring-reducer-v1",
        contract_hash=CURRENT_CONTRACT_HASH,
    )


def expected_correlation() -> ExpectedLifecycleCorrelation:
    return ExpectedLifecycleCorrelation(
        schema_version=SCHEMA_VERSION,
        debate_id="debate-current",
        node_id="node-current",
        current_score_input_hash=CURRENT_INPUT_HASH,
        active_scoring_contract=scoring_contract(),
        expected_evidence_source=None,
        decision_timestamp=DECISION_TIME,
        score_max_age_seconds=600,
        evidence_max_age_seconds=600,
    )


def scoring_payload(*, node_id: str = "node-current", strength: object = 0.23) -> dict[str, object]:
    return {
        "node_id": node_id,
        "claim": {
            "node_id": node_id,
            "raw_text": "A persisted claim.",
            "core_claim": "A persisted claim.",
            "claim_type": "empirical",
        },
        "scores": {
            "strength": strength,
            "uncertainty": 0.14,
            "impact": 0.31,
            "evidence_quality": 0.72,
            "relevance": 0.81,
            "logical_validity": 0.69,
            "assumption_risk": 0.16,
            "counter_resilience": 0.77,
        },
        "labels": {
            "strength_label": "weak",
            "uncertainty_label": "low",
            "impact_label": "low",
        },
        "holes": [
            {
                "type": "missing-baseline",
                "severity": "medium",
                "description": "A baseline is missing.",
                "source": "critic",
            }
        ],
        "fatal_flags": [
            {
                "type": "scope-conflict",
                "severity": "low",
                "description": "The scope is narrow.",
            }
        ],
        "score_caps": [],
        "judge_disagreements": [],
        "recommended_investigations": [
            {
                "action": "find_evidence",
                "reason": "Confirm the baseline.",
                "priority": 1,
                "target_node_id": node_id,
            }
        ],
        "rationale": {
            "short": "Persisted score.",
            "why_not_higher": "Evidence is incomplete.",
            "why_not_lower": "The claim is coherent.",
            "weakest_link": "Baseline evidence.",
        },
        "score_provenance": {
            "raw_judge_output_kind": "claim_assessment",
            "raw_judge_output_included": False,
            "final_score_source": "deterministic_reducer",
            "reducer_version": "node-scoring-reducer-v1",
            "rubric_version": "debateai-rubric-v1",
        },
    }


def scoring_result_payload(
    *,
    node_id: str = "node-current",
    strength: object = 0.23,
    debate_id: str = "debate-current",
) -> dict[str, object]:
    return {
        "debate_id": debate_id,
        "status": "available",
        "node_ids": [node_id],
        "items": [scoring_payload(node_id=node_id, strength=strength)],
        "model_metadata": {
            "provider": "fixture-provider",
            "model": "fixture-model",
            "checked_at": "2026-07-15T11:55:00Z",
            "status": "available",
        },
    }


def persisted_row(
    *,
    record_id: str = "score-record-current",
    debate_id: object = "debate-current",
    node_id: object = "node-current",
    input_hash: object = CURRENT_INPUT_HASH,
    judge_role: object = "judge",
    judge_id: object = "node_scoring.primary",
    judge_version: object = "v1",
    contract_hash: object = CURRENT_CONTRACT_HASH,
    status: object = "available",
    result: object | None = None,
    checked_at: object = "2026-07-15T11:55:00Z",
) -> NodeScoringResult:
    return NodeScoringResult(
        id=record_id,
        debate_id=debate_id,
        node_id=node_id,
        input_hash=input_hash,
        judge_role=judge_role,
        provider="fixture-provider",
        model="fixture-model",
        judge_id=judge_id,
        judge_version=judge_version,
        contract_hash=contract_hash,
        provider_metadata={
            "provider": "fixture-provider",
            "model": "fixture-model",
            "checked_at": checked_at,
            "status": status,
        },
        status=status,
        result=scoring_result_payload() if result is None else result,
    )


def candidate(
    *,
    record_id: str = "score-record-current",
    run_id: object = "run-current",
    sequence: object = 2,
    **row_overrides: object,
) -> ScoringResultCandidate:
    return ScoringResultCandidate(
        row=persisted_row(record_id=record_id, **row_overrides),
        run=RunIdentity(run_id=run_id, sequence=sequence),
    )


def resolve(
    *candidates: ScoringResultCandidate,
    current_run: RunIdentity | None = None,
):
    return resolve_scoring_input(
        expected=expected_correlation(),
        current_run=current_run or RunIdentity(run_id="run-current", sequence=2),
        candidates=tuple(candidates),
    )


def assert_unavailable(result, *, state: str, reason: str) -> None:
    assert result.resolution.state == state
    assert result.resolution.reason_code == reason
    assert result.signal is None
    assert result.lifecycle_candidate is None
    assert result.selected_record_id is None


def test_absent_result_is_typed_missing_without_a_neutral_score() -> None:
    assert_unavailable(resolve(), state="missing", reason="score_missing")


@pytest.mark.parametrize(
    ("bad_result", "reason"),
    [
        ({"debate_id": "debate-current", "status": "available", "items": [{}]}, "malformed_node_scoring_payload"),
        ("not-an-object", "malformed_node_scoring_result"),
    ],
)
def test_malformed_payload_is_withheld(bad_result: object, reason: str) -> None:
    result = resolve(candidate(result=bad_result))

    assert_unavailable(result, state="malformed", reason=reason)


def test_strict_payload_validation_rejects_boolean_score_values() -> None:
    result = resolve(candidate(result=scoring_result_payload(strength=True)))

    assert_unavailable(result, state="malformed", reason="malformed_node_scoring_payload")


@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"input_hash": "c" * 64}, "score_input_hash_mismatch"),
        ({"contract_hash": "d" * 64}, "scoring_contract_mismatch"),
        ({"judge_id": "legacy.judge"}, "scoring_contract_mismatch"),
        ({"judge_version": "v0"}, "scoring_contract_mismatch"),
        ({"judge_role": "critic"}, "scoring_contract_mismatch"),
    ],
)
def test_current_run_with_wrong_scoring_identity_is_mismatched(
    overrides: dict[str, object],
    reason: str,
) -> None:
    result = resolve(candidate(**overrides))

    assert_unavailable(result, state="mismatched", reason=reason)


def test_current_run_with_wrong_row_node_is_mismatched() -> None:
    result = resolve(candidate(node_id="node-other"))

    assert_unavailable(result, state="mismatched", reason="node_id_mismatch")


def test_payload_for_another_node_is_mismatched() -> None:
    result = resolve(
        candidate(result=scoring_result_payload(node_id="node-other"))
    )

    assert_unavailable(result, state="mismatched", reason="score_payload_node_mismatch")


def test_payload_for_another_debate_is_mismatched() -> None:
    result = resolve(
        candidate(result=scoring_result_payload(debate_id="debate-other"))
    )

    assert_unavailable(result, state="mismatched", reason="score_payload_debate_mismatch")


def test_current_result_does_not_age_out_when_its_input_hash_still_matches() -> None:
    """Contract v1 §6.1 amendment (2026-07-26, P1 contested frontier).

    Was `test_current_result_is_stale_only_against_explicit_decision_time`,
    which asserted the score aged out at `score_max_age_seconds`. The scoring
    cache serves an unchanged node from its existing row without rewriting
    `checked_at`, so that rule made every unchanged node permanently
    unauthenticatable one hour after it was first judged. A candidate that
    reaches the age test has already matched the current input hash AND the
    active contract, so it is the judgment of exactly this input: age adds
    nothing. See app.exploration.lifecycle_inputs._classify_candidate.
    """

    result = resolve(candidate(checked_at="2026-07-15T11:49:59Z"))

    assert result.resolution.state == "grounded"
    assert result.resolution.freshness == "fresh"
    assert result.signal is not None


@pytest.mark.parametrize("reverse", [False, True])
def test_newer_unverifiable_run_supersedes_older_grounded_history(reverse: bool) -> None:
    old = candidate(
        record_id="score-record-old",
        run_id="run-old",
        sequence=1,
        result=scoring_result_payload(strength=0.91),
    )
    current = candidate(
        record_id="score-record-current",
        run_id="run-current",
        sequence=2,
        status="unavailable",
        result={
            "debate_id": "debate-current",
            "status": "unavailable",
            "node_ids": ["node-current"],
            "items": [],
            "reason": "No independent judge was available.",
        },
    )
    ordered = (current, old) if reverse else (old, current)

    result = resolve(*ordered)

    assert_unavailable(result, state="unverifiable", reason="score_terminal_unverifiable")


@pytest.mark.parametrize("reverse", [False, True])
def test_explicit_current_run_selects_stably_across_historical_order(reverse: bool) -> None:
    old = candidate(
        record_id="score-record-old",
        run_id="run-old",
        sequence=1,
        result=scoring_result_payload(strength=0.91),
    )
    current = candidate(
        record_id="score-record-current",
        run_id="run-current",
        sequence=2,
        result=scoring_result_payload(strength=0.23),
    )
    ordered = (current, old) if reverse else (old, current)

    result = resolve(*ordered)

    assert result.resolution.state == "grounded"
    assert result.resolution.reason_code == "score_grounded"
    assert result.signal is not None
    assert result.signal.strength == 0.23
    assert result.signal.uncertainty == 0.14
    assert result.signal.holes == ("missing-baseline",)
    assert result.signal.fatal_flags == ("scope-conflict:low",)
    assert result.signal.recommended_actions == ("find_evidence",)
    assert result.selected_record_id == "score-record-current"
    assert result.lifecycle_candidate is not None
    assert result.lifecycle_candidate["schema_version"] == SCHEMA_VERSION
    assert result.lifecycle_candidate["input_hash"] == CURRENT_INPUT_HASH
    provenance = result.resolution.provenance
    assert provenance is not None
    assert provenance.source_kind == "node_scoring_result"
    assert provenance.source_record_id == "score-record-current"
    assert provenance.run == RunIdentity(run_id="run-current", sequence=2)


@pytest.mark.parametrize("reverse", [False, True])
def test_same_sequence_conflict_is_mismatched_independent_of_order(reverse: bool) -> None:
    first = candidate(
        record_id="score-record-a",
        run_id="run-a",
        sequence=2,
        result=scoring_result_payload(strength=0.23),
    )
    second = candidate(
        record_id="score-record-b",
        run_id="run-b",
        sequence=2,
        result=scoring_result_payload(strength=0.91),
    )
    ordered = (second, first) if reverse else (first, second)

    result = resolve(
        *ordered,
        current_run=RunIdentity(run_id=None, sequence=2),
    )

    assert_unavailable(result, state="mismatched", reason="conflicting_run_sequence")


@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize(
    "different_identity",
    [
        {"node_id": "node-other"},
        {"input_hash": "c" * 64},
        {"contract_hash": "d" * 64},
    ],
    ids=["wrong-node", "wrong-input-hash", "wrong-contract"],
)
def test_same_run_different_score_identity_cannot_poison_exact_current_result(
    reverse: bool,
    different_identity: dict[str, object],
) -> None:
    exact = candidate(
        record_id="score-record-exact",
        run_id="run-current",
        sequence=2,
        result=scoring_result_payload(strength=0.23),
    )
    unrelated = candidate(
        record_id="score-record-unrelated",
        run_id="run-current",
        sequence=2,
        result=scoring_result_payload(strength=0.91),
        **different_identity,
    )
    ordered = (unrelated, exact) if reverse else (exact, unrelated)

    result = resolve(*ordered)

    assert result.resolution.state == "grounded"
    assert result.resolution.reason_code == "score_grounded"
    assert result.signal is not None
    assert result.signal.strength == 0.23
    assert result.selected_record_id == "score-record-exact"
    assert result.lifecycle_candidate is not None
    assert result.lifecycle_candidate["node_id"] == "node-current"
    assert result.lifecycle_candidate["input_hash"] == CURRENT_INPUT_HASH
    assert result.lifecycle_candidate["scoring_contract"]["contract_hash"] == CURRENT_CONTRACT_HASH


@pytest.mark.parametrize("reverse", [False, True])
def test_same_sequence_with_contradictory_partial_run_ids_fails_closed(reverse: bool) -> None:
    sequence_only = candidate(
        record_id="score-record-sequence-only",
        run_id=None,
        sequence=2,
    )
    contradictory = candidate(
        record_id="score-record-contradictory",
        run_id="run-other",
        sequence=2,
    )
    ordered = (contradictory, sequence_only) if reverse else (sequence_only, contradictory)

    result = resolve(*ordered)

    assert_unavailable(result, state="mismatched", reason="conflicting_run_sequence")


@pytest.mark.parametrize("reverse", [False, True])
def test_same_run_id_with_contradictory_partial_sequences_fails_closed(reverse: bool) -> None:
    run_only = candidate(
        record_id="score-record-run-only",
        run_id="run-current",
        sequence=None,
    )
    contradictory = candidate(
        record_id="score-record-contradictory",
        run_id="run-current",
        sequence=3,
    )
    ordered = (contradictory, run_only) if reverse else (run_only, contradictory)

    result = resolve(*ordered)

    assert_unavailable(result, state="mismatched", reason="conflicting_run_identity")


@pytest.mark.parametrize(
    ("run_id", "sequence"),
    [
        ("run-current", 3),
        ("run-other", 2),
    ],
    ids=["matching-run-id-wrong-sequence", "wrong-run-id-matching-sequence"],
)
def test_sole_full_run_pair_with_one_conflicting_component_is_not_current(
    run_id: str,
    sequence: int,
) -> None:
    contradictory = candidate(
        record_id="score-record-contradictory",
        run_id=run_id,
        sequence=sequence,
    )

    result = resolve(contradictory)

    assert_unavailable(result, state="mismatched", reason="score_run_superseded")


def test_exact_and_partial_run_conflicts_are_identical_across_all_permutations() -> None:
    candidates = (
        candidate(
            record_id="score-record-run-only",
            run_id="run-current",
            sequence=None,
        ),
        candidate(
            record_id="score-record-sequence-only",
            run_id=None,
            sequence=2,
        ),
        candidate(
            record_id="score-record-exact",
            run_id="run-current",
            sequence=2,
        ),
    )

    results = tuple(resolve(*ordered) for ordered in permutations(candidates))

    assert len(results) == 6
    assert all(result == results[0] for result in results[1:])
    assert_unavailable(
        results[0],
        state="mismatched",
        reason="conflicting_run_identity",
    )


@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize(
    ("run_id", "sequence", "reason"),
    [
        ("run-current", 3, "conflicting_run_identity"),
        ("run-other", 2, "conflicting_run_sequence"),
    ],
    ids=["same-run-wrong-sequence", "same-sequence-wrong-run"],
)
def test_exact_run_and_full_pair_sharing_one_component_fail_closed(
    reverse: bool,
    run_id: str,
    sequence: int,
    reason: str,
) -> None:
    exact = candidate(
        record_id="score-record-exact",
        run_id="run-current",
        sequence=2,
    )
    conflicting = candidate(
        record_id="score-record-conflicting",
        run_id=run_id,
        sequence=sequence,
    )
    ordered = (conflicting, exact) if reverse else (exact, conflicting)

    result = resolve(*ordered)

    assert_unavailable(result, state="mismatched", reason=reason)


@pytest.mark.parametrize(
    "other_run_id",
    [
        pytest.param("aaa-other", id="lexically-before-current"),
        pytest.param("zzz-other", id="lexically-after-current"),
        pytest.param(
            "00000000-0000-4000-8000-000000000001",
            id="uuid-like-low",
        ),
        pytest.param(
            "ffffffff-ffff-4fff-bfff-ffffffffffff",
            id="uuid-like-high",
        ),
    ],
)
def test_mixed_full_run_conflict_precedence_is_opaque_id_and_order_invariant(
    other_run_id: str,
) -> None:
    candidates = (
        candidate(
            record_id="score-record-exact",
            run_id="run-current",
            sequence=2,
        ),
        candidate(
            record_id="score-record-same-run",
            run_id="run-current",
            sequence=3,
        ),
        candidate(
            record_id="score-record-same-sequence",
            run_id=other_run_id,
            sequence=2,
        ),
    )

    results = tuple(resolve(*ordered) for ordered in permutations(candidates))

    assert len(results) == 6
    assert all(result == results[0] for result in results[1:])
    assert results[0].resolution == ComponentResolution(
        component="score",
        state="mismatched",
        availability="present",
        freshness="unknown",
        reason_code="conflicting_run_identity",
    )
    assert_unavailable(
        results[0],
        state="mismatched",
        reason="conflicting_run_identity",
    )


@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize(
    ("anchor_record_id", "conflicting_record_id"),
    [
        pytest.param(
            "aaa-source-record",
            "zzz-source-record",
            id="source-record-ascending",
        ),
        pytest.param(
            "zzz-source-record",
            "aaa-source-record",
            id="source-record-descending",
        ),
        pytest.param(
            "00000000-0000-4000-8000-000000000001",
            "ffffffff-ffff-4fff-bfff-ffffffffffff",
            id="source-record-uuid-low-high",
        ),
        pytest.param(
            "ffffffff-ffff-4fff-bfff-ffffffffffff",
            "00000000-0000-4000-8000-000000000001",
            id="source-record-uuid-high-low",
        ),
    ],
)
@pytest.mark.parametrize(
    (
        "anchor_run_id",
        "anchor_sequence",
        "conflicting_run_id",
        "conflicting_sequence",
    ),
    [
        pytest.param(
            "run-current",
            None,
            "aaa-other",
            2,
            id="run-anchor-other-before",
        ),
        pytest.param(
            "run-current",
            None,
            "zzz-other",
            2,
            id="run-anchor-other-after",
        ),
        pytest.param(
            "run-current",
            None,
            "00000000-0000-4000-8000-000000000001",
            2,
            id="run-anchor-other-uuid-low",
        ),
        pytest.param(
            "run-current",
            None,
            "ffffffff-ffff-4fff-bfff-ffffffffffff",
            2,
            id="run-anchor-other-uuid-high",
        ),
        pytest.param(
            None,
            2,
            "run-current",
            3,
            id="sequence-anchor-same-run-newer-sequence",
        ),
    ],
)
def test_complementary_partial_full_run_conflicts_fail_closed_in_both_orders(
    reverse: bool,
    anchor_record_id: str,
    conflicting_record_id: str,
    anchor_run_id: str | None,
    anchor_sequence: int | None,
    conflicting_run_id: str,
    conflicting_sequence: int,
) -> None:
    anchor = candidate(
        record_id=anchor_record_id,
        run_id=anchor_run_id,
        sequence=anchor_sequence,
    )
    conflicting = candidate(
        record_id=conflicting_record_id,
        run_id=conflicting_run_id,
        sequence=conflicting_sequence,
    )
    ordered = (conflicting, anchor) if reverse else (anchor, conflicting)

    result = resolve(*ordered)

    assert result.resolution == ComponentResolution(
        component="score",
        state="mismatched",
        availability="present",
        freshness="unknown",
        reason_code="conflicting_run_identity",
    )
    assert_unavailable(
        result,
        state="mismatched",
        reason="conflicting_run_identity",
    )


def test_rows_from_only_superseded_runs_fail_closed() -> None:
    result = resolve(
        candidate(
            record_id="score-record-old",
            run_id="run-old",
            sequence=1,
        )
    )

    assert_unavailable(result, state="mismatched", reason="score_run_superseded")


@pytest.mark.parametrize(
    ("overrides", "state", "reason"),
    [
        ({"contract_hash": None}, "mismatched", "legacy_scoring_contract_identity_missing"),
        ({"checked_at": None}, "unverifiable", "legacy_observed_at_missing"),
    ],
)
def test_legacy_rows_are_never_silently_upgraded(
    overrides: dict[str, object],
    state: str,
    reason: str,
) -> None:
    result = resolve(candidate(**overrides))

    assert_unavailable(result, state=state, reason=reason)


def test_legacy_row_without_run_identity_is_unverifiable() -> None:
    legacy = candidate(run_id=None, sequence=None)

    result = resolve(legacy)

    assert_unavailable(result, state="unverifiable", reason="legacy_run_identity_missing")


def test_payload_reducer_version_must_match_active_contract() -> None:
    payload = scoring_result_payload()
    item = payload["items"][0]
    assert isinstance(item, dict)
    score_provenance = item["score_provenance"]
    assert isinstance(score_provenance, dict)
    score_provenance["reducer_version"] = "node-scoring-reducer-v0"

    result = resolve(candidate(result=payload))

    assert_unavailable(result, state="mismatched", reason="score_value_contract_version_mismatch")


def test_candidate_budget_fails_closed_instead_of_truncating_history() -> None:
    candidates = tuple(
        candidate(
            record_id=f"score-record-{index}",
            run_id=f"run-{index}",
            sequence=index + 1,
        )
        for index in range(MAX_SCORING_RESULT_CANDIDATES + 1)
    )

    result = resolve_scoring_input(
        expected=expected_correlation(),
        current_run=RunIdentity(
            run_id=f"run-{MAX_SCORING_RESULT_CANDIDATES}",
            sequence=MAX_SCORING_RESULT_CANDIDATES + 1,
        ),
        candidates=candidates,
    )

    assert_unavailable(result, state="unverifiable", reason="score_candidate_limit_exceeded")


@pytest.mark.parametrize(
    "current_run",
    [
        RunIdentity(run_id=None, sequence=None),
        RunIdentity(run_id="", sequence=2),
        RunIdentity(run_id="run-current", sequence=0),
        RunIdentity(run_id="run-current", sequence=True),
    ],
)
def test_invalid_current_run_expectation_is_rejected(current_run: RunIdentity) -> None:
    with pytest.raises(ValueError, match="current_run"):
        resolve_scoring_input(
            expected=expected_correlation(),
            current_run=current_run,
            candidates=(candidate(),),
        )


def test_resolver_module_has_no_provider_network_random_clock_or_database_io() -> None:
    module_path = Path(__file__).parents[1] / "app" / "exploration" / "scoring_input_resolver.py"
    tree = ast.parse(module_path.read_text(encoding="utf-8"))
    forbidden_roots = {
        "httpx",
        "requests",
        "socket",
        "random",
        "secrets",
        "time",
        "sqlalchemy",
        "app.providers",
        "app.core.db",
    }
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module)

    assert not any(
        name == forbidden or name.startswith(f"{forbidden}.")
        for name in imports
        for forbidden in forbidden_roots
    )
