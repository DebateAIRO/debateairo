from __future__ import annotations

import ast
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
import inspect
from types import SimpleNamespace

import pytest

import app.exploration.lifecycle_inputs as lifecycle_inputs_module
from app.exploration.lifecycle_inputs import (
    SCHEMA_VERSION,
    EvidenceSourceIdentity,
    ExpectedLifecycleCorrelation,
    GroundedLifecycleInputs,
    ScoringContractIdentity,
    UnavailableLifecycleInputs,
    map_lifecycle_inputs,
    policy_signals_for_lifecycle,
)
from app.exploration.policy import ExplorationPolicy


SHA_A = "a" * 64
SHA_B = "b" * 64
SHA_C = "c" * 64


def evidence_source() -> EvidenceSourceIdentity:
    return EvidenceSourceIdentity(
        evidence_node_id="evidence-1",
        claim_node_id="node-1",
        generation_id="generation-1",
        reference="https://example.test/source",
        content_sha256=SHA_C,
        evidence_kind="research",
    )


def expected_correlation(*, with_evidence: bool = False) -> ExpectedLifecycleCorrelation:
    return ExpectedLifecycleCorrelation(
        schema_version=SCHEMA_VERSION,
        debate_id="debate-1",
        node_id="node-1",
        current_score_input_hash=SHA_A,
        active_scoring_contract=ScoringContractIdentity(
            judge_id="node_scoring.primary",
            judge_version="v1",
            role="judge",
            rubric_version="debateai-rubric-v1",
            prompt_version="scoring-provider-v1",
            output_schema_version="claim-assessment-v1",
            reducer_version="node-scoring-reducer-v1",
            contract_hash=SHA_B,
        ),
        expected_evidence_source=evidence_source() if with_evidence else None,
        decision_timestamp=datetime(2026, 7, 14, 20, 0, tzinfo=timezone.utc),
        score_max_age_seconds=300,
        evidence_max_age_seconds=600,
    )


def test_absent_candidates_remain_missing_and_cannot_supply_policy_inputs() -> None:
    result = map_lifecycle_inputs(
        expected=expected_correlation(),
        score_candidates=(),
        evidence_candidates=(),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "missing"
    assert result.score_resolution.state == "missing"
    assert result.evidence_resolution.state == "missing"
    assert result.reason_codes == ("score_missing", "evidence_missing")
    assert result.score is None
    assert result.evidence is None
    assert result.decision_eligibility == "blocked"


@pytest.mark.parametrize(
    ("candidate", "state", "reason_code"),
    [
        ({}, "unverifiable", "legacy_schema_version_missing"),
        ({"schema_version": 1}, "malformed", "malformed_schema_version"),
        (
            {"schema_version": "lifecycle-input-persistence/v2"},
            "mismatched",
            "unsupported_schema_version",
        ),
    ],
)
def test_schema_versions_have_distinct_fail_closed_resolutions(
    candidate: dict[str, object],
    state: str,
    reason_code: str,
) -> None:
    result = map_lifecycle_inputs(
        expected=expected_correlation(),
        score_candidates=(candidate,),
        evidence_candidates=(),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == state
    assert result.score_resolution.state == state
    assert result.score_resolution.reason_code == reason_code
    assert result.evidence_resolution.state == "missing"
    assert result.score is None
    assert result.evidence is None
    assert result.decision_eligibility == "blocked"


def scoring_contract_payload() -> dict[str, object]:
    return {
        "judge_id": "node_scoring.primary",
        "judge_version": "v1",
        "role": "judge",
        "rubric_version": "debateai-rubric-v1",
        "prompt_version": "scoring-provider-v1",
        "output_schema_version": "claim-assessment-v1",
        "reducer_version": "node-scoring-reducer-v1",
        "contract_hash": SHA_B,
    }


def evidence_source_payload() -> dict[str, object]:
    source = evidence_source()
    return {
        "evidence_node_id": source.evidence_node_id,
        "claim_node_id": source.claim_node_id,
        "generation_id": source.generation_id,
        "reference": source.reference,
        "content_sha256": source.content_sha256,
        "evidence_kind": source.evidence_kind,
    }


def provenance_payload(*, source_kind: str, run_id: str, sequence: int) -> dict[str, object]:
    return {
        "source_kind": source_kind,
        "source_record_id": f"record-{run_id}",
        "run": {"run_id": run_id, "sequence": sequence},
        "producer": "contract-test",
        "recorded_at": "2026-07-14T19:58:00Z",
        "checked_at": "2026-07-14T19:59:00Z",
    }


def grounded_score_candidate() -> dict[str, object]:
    return {
        "schema_version": SCHEMA_VERSION,
        "debate_id": "debate-1",
        "node_id": "node-1",
        "input_hash": SHA_A,
        "scoring_contract": scoring_contract_payload(),
        "availability": "present",
        "observed_at": "2026-07-14T19:57:00Z",
        "provenance": provenance_payload(
            source_kind="node_scoring_result",
            run_id="score-run-1",
            sequence=11,
        ),
        "value": {
            "node_id": "node-1",
            "claim_type": "empirical",
            "values": {
                "strength": 0.12,
                "uncertainty": 0.08,
                "impact": 0.09,
                "evidence_quality": 0.64,
                "logical_validity": 0.78,
                "assumption_risk": 0.11,
                "counter_resilience": 0.19,
            },
            "holes": [],
            "fatal_flags": [],
            "recommended_actions": [],
            "final_score_source": "deterministic_reducer",
            "reducer_version": "node-scoring-reducer-v1",
            "rubric_version": "debateai-rubric-v1",
        },
        "unavailability_reason": None,
    }


def grounded_evidence_candidate() -> dict[str, object]:
    source = evidence_source_payload()
    return {
        "schema_version": SCHEMA_VERSION,
        "debate_id": "debate-1",
        "node_id": "node-1",
        "source_identity": source,
        "availability": "present",
        "observed_at": "2026-07-14T19:56:00Z",
        "provenance": provenance_payload(
            source_kind="evidence_verification_run",
            run_id="evidence-run-1",
            sequence=12,
        ),
        "value": {
            "source": source,
            "status": "grounded",
            "base_score": 0.14,
            "uncertainty": 0.08,
            "entailment": "SUPPORTS",
            "caveats": [],
            "evaluator_id": "evidence.primary",
            "evaluator_version": "v1",
        },
        "unavailability_reason": None,
    }


def test_exact_current_score_and_evidence_map_to_grounded_policy_inputs() -> None:
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(grounded_score_candidate(),),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, GroundedLifecycleInputs)
    assert result.state == "grounded"
    assert result.score_resolution.freshness == "fresh"
    assert result.evidence_resolution.freshness == "fresh"
    assert result.score.values.strength == 0.12
    assert result.evidence.source.content_sha256 == SHA_C
    assert result.score_resolution.provenance.run.sequence == 11
    assert result.evidence_resolution.provenance.run.run_id == "evidence-run-1"
    assert result.decision_eligibility == "eligible"

    signals = policy_signals_for_lifecycle(result)
    assert signals is not None
    decision = ExplorationPolicy().decide(score=signals[0], evidence=signals[1])
    assert decision.action == "abandon"


def test_newer_pending_run_supersedes_an_older_grounded_score() -> None:
    older = grounded_score_candidate()
    newer = deepcopy(older)
    newer["availability"] = "in_progress"
    newer["observed_at"] = "2026-07-14T19:59:00Z"
    newer["provenance"] = provenance_payload(
        source_kind="node_scoring_result",
        run_id="score-run-2",
        sequence=12,
    )
    newer["value"] = None
    newer["unavailability_reason"] = "scoring_in_progress"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(older, newer),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "pending"
    assert result.score_resolution.state == "pending"
    assert result.score_resolution.reason_code == "scoring_in_progress"
    assert result.score is None
    assert result.evidence is None
    assert policy_signals_for_lifecycle(result) is None


def score_candidates_for_state(state: str) -> tuple[dict[str, object], ...]:
    if state == "missing":
        return ()
    candidate = grounded_score_candidate()
    if state == "stale":
        candidate["observed_at"] = "2026-07-14T19:54:59Z"
    elif state == "malformed":
        candidate["value"]["values"]["strength"] = True
    elif state == "mismatched":
        candidate["scoring_contract"]["contract_hash"] = "d" * 64
    elif state == "pending":
        candidate["availability"] = "in_progress"
        candidate["value"] = None
        candidate["unavailability_reason"] = "scoring_in_progress"
    elif state == "unverifiable":
        candidate["availability"] = "terminal_unverifiable"
        candidate["value"] = None
        candidate["unavailability_reason"] = "provider_timeout"
    else:
        raise AssertionError(f"unsupported test state: {state}")
    return (candidate,)


@pytest.mark.parametrize(
    "state",
    ["missing", "stale", "malformed", "mismatched", "pending", "unverifiable"],
)
def test_every_unavailable_state_withholds_values_and_blocks_policy(state: str) -> None:
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=score_candidates_for_state(state),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == state
    assert result.score_resolution.state == state
    assert result.evidence_resolution.state == "grounded"
    assert result.score is None
    assert result.evidence is None
    assert result.decision_eligibility == "blocked"
    assert policy_signals_for_lifecycle(result) is None


def test_age_equal_to_maximum_is_fresh() -> None:
    score = grounded_score_candidate()
    score["observed_at"] = "2026-07-14T19:55:00Z"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, GroundedLifecycleInputs)
    assert result.score_resolution.freshness == "fresh"


def test_artifact_after_decision_timestamp_is_mismatched() -> None:
    score = grounded_score_candidate()
    score["observed_at"] = "2026-07-14T20:00:01Z"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "mismatched"
    assert result.score_resolution.reason_code == "artifact_after_decision_timestamp"


@pytest.mark.parametrize(
    ("legacy_kind", "reason_code"),
    [
        ("neutral_placeholder", "neutral_placeholder_not_authoritative"),
        ("historical_score", "historical_score_not_lifecycle_authoritative"),
    ],
)
def test_known_legacy_scores_remain_unverifiable_historical_data(
    legacy_kind: str,
    reason_code: str,
) -> None:
    legacy_score = {
        "legacy_kind": legacy_kind,
        "node_id": "node-1",
        "strength": 0.5,
        "uncertainty": 0.5,
        "impact": 0.5,
    }

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(legacy_score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "unverifiable"
    assert result.score_resolution.reason_code == reason_code
    assert result.score is None
    assert policy_signals_for_lifecycle(result) is None


def test_non_mapping_candidate_is_malformed_instead_of_raising() -> None:
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(["not", "an", "object"],),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "malformed"
    assert result.score_resolution.state == "malformed"
    assert result.score_resolution.reason_code == "score_candidate_not_mapping"


def test_newer_malformed_current_run_blocks_older_grounded_fallback() -> None:
    older = grounded_score_candidate()
    newer = deepcopy(older)
    newer["provenance"] = provenance_payload(
        source_kind="node_scoring_result",
        run_id="score-run-3",
        sequence=13,
    )
    newer["value"]["values"]["strength"] = True

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(older, newer),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "malformed"
    assert result.score_resolution.state == "malformed"
    assert result.score_resolution.provenance is not None
    assert result.score_resolution.provenance.run.sequence == 13
    assert policy_signals_for_lifecycle(result) is None


def test_conflicting_payloads_at_the_same_run_sequence_are_mismatched() -> None:
    first = grounded_score_candidate()
    conflicting = deepcopy(first)
    conflicting["value"]["values"]["strength"] = 0.13

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(first, conflicting),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "mismatched"
    assert result.score_resolution.reason_code == "conflicting_run_sequence"


def test_trustworthy_no_info_evidence_still_cannot_abandon() -> None:
    evidence = grounded_evidence_candidate()
    evidence["value"]["status"] = "no_info"
    evidence["value"]["entailment"] = "NOINFO"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(grounded_score_candidate(),),
        evidence_candidates=(evidence,),
    )

    assert isinstance(result, GroundedLifecycleInputs)
    signals = policy_signals_for_lifecycle(result)
    assert signals is not None
    decision = ExplorationPolicy().decide(score=signals[0], evidence=signals[1])
    assert decision.action == "seek_evidence"
    assert decision.keeps_path_active is True


def test_aggregate_precedence_retains_both_component_resolutions() -> None:
    pending_score = score_candidates_for_state("pending")[0]
    malformed_evidence = grounded_evidence_candidate()
    malformed_evidence["value"]["base_score"] = True

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(pending_score,),
        evidence_candidates=(malformed_evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "malformed"
    assert result.score_resolution.state == "pending"
    assert result.evidence_resolution.state == "malformed"
    assert result.reason_codes == (
        "scoring_in_progress",
        result.evidence_resolution.reason_code,
    )


@pytest.mark.parametrize(
    ("mutate", "state", "reason_code"),
    [
        (lambda candidate: candidate.pop("input_hash"), "mismatched", "legacy_score_input_hash_missing"),
        (
            lambda candidate: candidate.pop("scoring_contract"),
            "mismatched",
            "legacy_scoring_contract_identity_missing",
        ),
        (lambda candidate: candidate.update(observed_at=None), "unverifiable", "legacy_observed_at_missing"),
        (
            lambda candidate: candidate["provenance"].update(run={"run_id": None, "sequence": None}),
            "unverifiable",
            "legacy_run_identity_missing",
        ),
    ],
)
def test_legacy_score_fields_have_stable_fail_closed_reasons(
    mutate,
    state: str,
    reason_code: str,
) -> None:
    score = grounded_score_candidate()
    mutate(score)

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == state
    assert result.score_resolution.reason_code == reason_code


def test_expected_evidence_source_cannot_target_another_claim_node() -> None:
    expected = expected_correlation(with_evidence=True)
    assert expected.expected_evidence_source is not None
    wrong_claim_source = replace(expected.expected_evidence_source, claim_node_id="node-other")
    expected = replace(expected, expected_evidence_source=wrong_claim_source)
    evidence = grounded_evidence_candidate()
    evidence["source_identity"]["claim_node_id"] = "node-other"
    evidence["value"]["source"]["claim_node_id"] = "node-other"

    result = map_lifecycle_inputs(
        expected=expected,
        score_candidates=(grounded_score_candidate(),),
        evidence_candidates=(evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "mismatched"
    assert result.evidence_resolution.state == "mismatched"
    assert result.evidence_resolution.reason_code == "evidence_source_claim_node_mismatch"
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize("reverse_order", [False, True])
def test_type_distinct_payloads_at_the_same_sequence_conflict_regardless_of_order(
    reverse_order: bool,
) -> None:
    numeric = grounded_score_candidate()
    numeric["value"]["values"]["strength"] = 1.0
    boolean = deepcopy(numeric)
    boolean["value"]["values"]["strength"] = True
    candidates = (boolean, numeric) if reverse_order else (numeric, boolean)

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=candidates,
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "mismatched"
    assert result.score_resolution.reason_code == "conflicting_run_sequence"


def test_same_run_id_without_sequence_rejects_type_sensitive_content_conflict() -> None:
    first = grounded_score_candidate()
    first["provenance"]["run"]["sequence"] = None
    conflicting = deepcopy(first)
    conflicting["value"]["values"]["strength"] = 0.13

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(first, conflicting),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "mismatched"
    assert result.score_resolution.reason_code == "conflicting_run_identity"


def test_same_run_id_without_sequence_is_idempotent_for_canonical_equal_content() -> None:
    first = grounded_score_candidate()
    first["provenance"]["run"]["sequence"] = None

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(first, deepcopy(first)),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, GroundedLifecycleInputs)
    assert result.score_resolution.provenance is not None
    assert result.score_resolution.provenance.run.run_id == "score-run-1"


def test_grounded_evidence_status_requires_supporting_entailment() -> None:
    evidence = grounded_evidence_candidate()
    evidence["value"]["entailment"] = "NOINFO"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(grounded_score_candidate(),),
        evidence_candidates=(evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "malformed"
    assert result.evidence_resolution.state == "malformed"
    assert "evidence_status_entailment_mismatch" in result.evidence_resolution.reason_code
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize("availability", ["in_progress", "terminal_unverifiable"])
def test_every_supplied_nonterminal_observed_timestamp_is_validated(availability: str) -> None:
    score = grounded_score_candidate()
    score["availability"] = availability
    score["observed_at"] = "not-an-rfc3339-timestamp"
    score["value"] = None
    score["unavailability_reason"] = "not_terminal"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "malformed"
    assert result.score_resolution.reason_code == "malformed_observed_at"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda candidate: candidate.update(observed_at="2026-07-14 19:57:00Z"),
        lambda candidate: candidate["provenance"].update(recorded_at="2026-07-14 19:58:00Z"),
        lambda candidate: candidate["provenance"].update(checked_at="2026-07-14 19:59:00Z"),
    ],
)
def test_timestamp_fields_require_declared_rfc3339_utc_shape(mutate) -> None:
    score = grounded_score_candidate()
    mutate(score)

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "malformed"
    assert result.score_resolution.state == "malformed"


@pytest.mark.parametrize(
    ("component", "source_kind"),
    [
        ("score", "evidence_verification_run"),
        ("evidence", "node_scoring_result"),
    ],
)
def test_provenance_source_kinds_are_component_specific(component: str, source_kind: str) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    candidate = score if component == "score" else evidence
    candidate["provenance"]["source_kind"] = source_kind

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state == "mismatched"
    assert resolution.reason_code == f"{component}_provenance_source_kind_mismatch"


def evidence_candidates_for_state(state: str) -> tuple[dict[str, object], ...]:
    if state == "missing":
        return ()
    candidate = grounded_evidence_candidate()
    if state == "stale":
        candidate["observed_at"] = "2026-07-14T19:49:59Z"
    elif state == "malformed":
        candidate["value"]["base_score"] = True
    elif state == "mismatched":
        candidate["source_identity"]["content_sha256"] = "d" * 64
    elif state == "pending":
        candidate["availability"] = "in_progress"
        candidate["value"] = None
        candidate["unavailability_reason"] = "evidence_verification_in_progress"
    elif state == "unverifiable":
        candidate["availability"] = "terminal_unverifiable"
        candidate["value"] = None
        candidate["unavailability_reason"] = "evidence_provider_timeout"
    else:
        raise AssertionError(f"unsupported test state: {state}")
    return (candidate,)


@pytest.mark.parametrize(
    "state",
    ["missing", "stale", "malformed", "mismatched", "pending", "unverifiable"],
)
def test_every_evidence_unavailable_state_withholds_both_values_and_blocks_policy(state: str) -> None:
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(grounded_score_candidate(),),
        evidence_candidates=evidence_candidates_for_state(state),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == state
    assert result.score_resolution.state == "grounded"
    assert result.evidence_resolution.state == state
    assert result.score is None
    assert result.evidence is None
    assert result.decision_eligibility == "blocked"
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize(
    ("component", "mutate"),
    [
        ("score", lambda candidate: candidate.update(unknown_envelope_field=True)),
        ("score", lambda candidate: candidate["scoring_contract"].update(unknown_identity_field=True)),
        ("evidence", lambda candidate: candidate.update(unknown_envelope_field=True)),
        ("evidence", lambda candidate: candidate["source_identity"].update(unknown_identity_field=True)),
    ],
)
def test_v1_rejects_unknown_envelope_and_identity_fields(component: str, mutate) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    mutate(score if component == "score" else evidence)

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state == "malformed"


@pytest.mark.parametrize(
    ("component", "mutate"),
    [
        ("score", lambda candidate: candidate.update(node_id="")),
        ("score", lambda candidate: candidate.update(input_hash="not-a-sha256")),
        ("score", lambda candidate: candidate["provenance"]["run"].update(sequence=0)),
        ("score", lambda candidate: candidate["value"].update(claim_type="unsupported")),
        ("score", lambda candidate: candidate["value"]["values"].update(strength=float("nan"))),
        ("evidence", lambda candidate: candidate["value"].update(status="unsupported")),
        ("evidence", lambda candidate: candidate["value"].update(base_score=1.01)),
    ],
)
def test_invalid_ids_hashes_sequences_enums_and_ranges_fail_closed(component: str, mutate) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    mutate(score if component == "score" else evidence)

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(score,),
        evidence_candidates=(evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state == "malformed"
    assert result.score is None
    assert result.evidence is None


def test_conflicting_run_pair_is_mismatched() -> None:
    first = grounded_score_candidate()
    conflicting = deepcopy(first)
    conflicting["provenance"]["run"]["sequence"] = 12

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(first, conflicting),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "mismatched"
    assert result.score_resolution.reason_code == "conflicting_run_identity"


def test_newer_terminal_unverifiable_run_supersedes_older_grounded_score() -> None:
    older = grounded_score_candidate()
    newer = deepcopy(older)
    newer["availability"] = "terminal_unverifiable"
    newer["provenance"] = provenance_payload(
        source_kind="node_scoring_result",
        run_id="score-run-2",
        sequence=12,
    )
    newer["value"] = None
    newer["unavailability_reason"] = "scoring_provider_timeout"

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(older, newer),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.state == "unverifiable"
    assert result.score_resolution.reason_code == "scoring_provider_timeout"
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize(
    ("field_name", "value"),
    [("score_max_age_seconds", 0), ("evidence_max_age_seconds", True)],
)
def test_expected_correlation_rejects_non_positive_or_boolean_max_ages(
    field_name: str,
    value: object,
) -> None:
    with pytest.raises(ValueError):
        replace(expected_correlation(), **{field_name: value})


def test_real_neutral_score_and_no_evidence_orchestration_seam_is_not_authoritative() -> None:
    from app.services.orchestrator import _score_signal_for_node, exploration_decision_for_node

    node = SimpleNamespace(id="node-1", path_status="active")
    neutral_score = _score_signal_for_node(node)
    decision = exploration_decision_for_node(None, None, node)

    assert {
        neutral_score.strength,
        neutral_score.uncertainty,
        neutral_score.impact,
        neutral_score.evidence_quality,
        neutral_score.logical_validity,
        neutral_score.assumption_risk,
        neutral_score.counter_resilience,
    } == {0.5}
    assert decision.action != "abandon"
    assert decision.keeps_path_active is True

    legacy_score = {
        "legacy_kind": "neutral_placeholder",
        "node_id": neutral_score.node_id,
        "strength": neutral_score.strength,
        "uncertainty": neutral_score.uncertainty,
        "impact": neutral_score.impact,
    }
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(legacy_score,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )
    assert isinstance(result, UnavailableLifecycleInputs)
    assert result.score_resolution.reason_code == "neutral_placeholder_not_authoritative"
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize(
    ("component", "failure_kind", "same_run", "expected_state", "expected_reason"),
    [
        ("score", "future_observed_at", False, "mismatched", "artifact_after_decision_timestamp"),
        ("evidence", "future_observed_at", False, "mismatched", "artifact_after_decision_timestamp"),
        ("score", "malformed_observed_at", False, "malformed", "malformed_observed_at"),
        ("evidence", "malformed_observed_at", False, "malformed", "malformed_observed_at"),
        (
            "score",
            "source_kind_mismatch",
            False,
            "mismatched",
            "score_provenance_source_kind_mismatch",
        ),
        (
            "evidence",
            "source_kind_mismatch",
            False,
            "mismatched",
            "evidence_provenance_source_kind_mismatch",
        ),
        ("score", "malformed_observed_at", True, "mismatched", "conflicting_run_identity"),
        ("evidence", "malformed_observed_at", True, "mismatched", "conflicting_run_identity"),
    ],
)
def test_parseable_run_identity_participates_in_arbitration_before_later_validation(
    component: str,
    failure_kind: str,
    same_run: bool,
    expected_state: str,
    expected_reason: str,
) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    older = score if component == "score" else evidence
    newer = deepcopy(older)
    run = newer["provenance"]["run"]
    if same_run:
        older["provenance"]["run"]["sequence"] = None
        run["sequence"] = None
    else:
        run["run_id"] = f"{component}-run-newer"
        run["sequence"] = older["provenance"]["run"]["sequence"] + 1

    if failure_kind == "future_observed_at":
        newer["observed_at"] = "2026-07-14T20:00:01Z"
    elif failure_kind == "malformed_observed_at":
        newer["observed_at"] = "not-an-rfc3339-timestamp"
    elif failure_kind == "source_kind_mismatch":
        newer["provenance"]["source_kind"] = (
            "evidence_verification_run" if component == "score" else "node_scoring_result"
        )
    else:
        raise AssertionError(f"unsupported failure kind: {failure_kind}")

    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(older, newer) if component == "score" else (score,),
        evidence_candidates=(older, newer) if component == "evidence" else (evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state == expected_state
    assert resolution.reason_code == expected_reason
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize("component", ["score", "evidence"])
@pytest.mark.parametrize("failure_kind", ["unknown_envelope_field", "same_run_invalid_sequence"])
@pytest.mark.parametrize("older_first", [True, False])
def test_structurally_invalid_current_identity_cannot_expose_older_grounded_inputs(
    component: str,
    failure_kind: str,
    older_first: bool,
) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    older = score if component == "score" else evidence
    invalid = deepcopy(older)
    run = invalid["provenance"]["run"]

    if failure_kind == "unknown_envelope_field":
        run["run_id"] = f"{component}-run-newer"
        run["sequence"] = older["provenance"]["run"]["sequence"] + 1
        invalid["unknown_envelope_field"] = True
        expected_state = "malformed"
        expected_reason = f"malformed_{component}_candidate:{component}_envelope contains unknown fields"
    elif failure_kind == "same_run_invalid_sequence":
        run["sequence"] = 0
        expected_state = "mismatched"
        expected_reason = "conflicting_run_identity"
    else:
        raise AssertionError(f"unsupported failure kind: {failure_kind}")

    candidates = (older, invalid) if older_first else (invalid, older)
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=candidates if component == "score" else (score,),
        evidence_candidates=candidates if component == "evidence" else (evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state == expected_state
    assert resolution.reason_code.startswith(expected_reason)
    assert result.decision_eligibility == "blocked"
    assert result.score is None
    assert result.evidence is None
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize("component", ["score", "evidence"])
@pytest.mark.parametrize(
    "failure_kind",
    [
        "missing_run_identity",
        "wholly_invalid_run_identity",
        "unknown_component_identity_field",
        "non_string_component_identity_key",
    ],
)
@pytest.mark.parametrize("older_first", [True, False])
def test_exact_current_unidentified_candidate_cannot_expose_older_grounded_inputs(
    component: str,
    failure_kind: str,
    older_first: bool,
) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    older = score if component == "score" else evidence
    invalid = deepcopy(older)
    run = invalid["provenance"]["run"]

    if failure_kind == "missing_run_identity":
        run.update(run_id=None, sequence=None)
    elif failure_kind == "wholly_invalid_run_identity":
        run.update(run_id="", sequence=0)
    elif failure_kind == "unknown_component_identity_field":
        identity_field = "scoring_contract" if component == "score" else "source_identity"
        invalid[identity_field]["unknown_identity_field"] = True
        run["run_id"] = f"{component}-run-newer"
        run["sequence"] = older["provenance"]["run"]["sequence"] + 1
    elif failure_kind == "non_string_component_identity_key":
        identity_field = "scoring_contract" if component == "score" else "source_identity"
        invalid[identity_field][1] = "unknown-non-string-key"
        run["run_id"] = f"{component}-run-newer"
        run["sequence"] = older["provenance"]["run"]["sequence"] + 1
    else:
        raise AssertionError(f"unsupported failure kind: {failure_kind}")

    candidates = (older, invalid) if older_first else (invalid, older)
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=candidates if component == "score" else (score,),
        evidence_candidates=candidates if component == "evidence" else (evidence,),
    )

    assert isinstance(result, UnavailableLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state != "grounded"
    assert result.decision_eligibility == "blocked"
    assert result.score is None
    assert result.evidence is None
    assert policy_signals_for_lifecycle(result) is None


@pytest.mark.parametrize("component", ["score", "evidence"])
@pytest.mark.parametrize("older_first", [True, False])
def test_genuinely_different_component_identity_does_not_poison_current_grounded_row(
    component: str,
    older_first: bool,
) -> None:
    score = grounded_score_candidate()
    evidence = grounded_evidence_candidate()
    older = score if component == "score" else evidence
    different = deepcopy(older)
    different["provenance"]["run"].update(
        run_id=f"{component}-run-different",
        sequence=older["provenance"]["run"]["sequence"] + 1,
    )
    if component == "score":
        different["input_hash"] = "d" * 64
    else:
        different["source_identity"]["content_sha256"] = "d" * 64

    candidates = (older, different) if older_first else (different, older)
    result = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=candidates if component == "score" else (score,),
        evidence_candidates=candidates if component == "evidence" else (evidence,),
    )

    assert isinstance(result, GroundedLifecycleInputs)
    resolution = result.score_resolution if component == "score" else result.evidence_resolution
    assert resolution.state == "grounded"
    assert policy_signals_for_lifecycle(result) is not None


def _imported_roots(source: str) -> set[str]:
    tree = ast.parse(source)
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.split(".")[0])
    return roots


def test_purity_import_inspection_reads_import_from_module_names() -> None:
    assert _imported_roots("from pathlib import Path\n") == {"pathlib"}


def test_mapper_is_deterministic_and_has_no_effectful_dependencies() -> None:
    expected = expected_correlation(with_evidence=True)
    score_candidates = (grounded_score_candidate(),)
    evidence_candidates = (grounded_evidence_candidate(),)

    first = map_lifecycle_inputs(
        expected=expected,
        score_candidates=score_candidates,
        evidence_candidates=evidence_candidates,
    )
    second = map_lifecycle_inputs(
        expected=expected,
        score_candidates=score_candidates,
        evidence_candidates=evidence_candidates,
    )

    assert first == second
    module_source = inspect.getsource(lifecycle_inputs_module)
    tree = ast.parse(module_source)
    imported_roots = _imported_roots(module_source)
    assert imported_roots.isdisjoint(
        {"os", "pathlib", "random", "requests", "httpx", "socket", "sqlalchemy", "time", "uuid"}
    )
    forbidden_clock_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in {"now", "utcnow", "today"}
    ]
    assert forbidden_clock_calls == []
