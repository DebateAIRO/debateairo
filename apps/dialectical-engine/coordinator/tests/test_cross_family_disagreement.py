"""P1 Task 5: cross-family disagreement as a categorical predicate.

Smoke4 measured real dispersion -- critic.logical_validity mean spread
0.196, max 0.45, 5 nodes at >=0.30 -- yet every node recorded
disagreement_status "none", because disagreement.py gates at 0.35 on a
COMPOSITE signal whose largest observed spread was 0.11.

Per-field detection replaces it, and a disagreeing panel becomes a
categorical ground for challenge: "these families assigned materially
different values" is a fact about the judging process, not an uncalibrated
scalar treated as truth.

Everything here is behind DIALECTICAL_FIELD_DISAGREEMENT (new flag, default
OFF -- project-owner ruling: the judge panel is live in production, so an
unflagged change would move score_provenance.disagreement_status for every
scored node the moment the code deploys). Every test sets the flag
explicitly rather than relying on the ambient environment, and
test_flag_off_keeps_the_historical_composite_gate below is the whole point
of the gating: the same input the flag-on path detects must still report
nothing when the flag is off.
"""
from __future__ import annotations

import pytest

from app.exploration.lifecycle_inputs import (
    SCHEMA_VERSION,
    GroundedLifecycleInputs,
    map_lifecycle_inputs,
    policy_signals_for_lifecycle,
)
from app.exploration.policy import CATEGORICAL_SIGNAL, ExplorationPolicy
from app.scoring.disagreement import (
    DISAGREEMENT_FIELD_THRESHOLD,
    FIELD_DISAGREEMENT_FLAG,
    PIVOTAL_FIELDS,
    detect_persisted_judge_disagreements,
    field_spreads,
)
from app.scoring.models import (
    ClaimAssessment,
    NodeScores,
    NodeScoringPayload,
    NormalizedClaim,
    ScoreLabels,
    ScoreProvenance,
    ScoreRationale,
)


@pytest.fixture()
def field_disagreement_on(monkeypatch):
    monkeypatch.setenv(FIELD_DISAGREEMENT_FLAG, "true")


@pytest.fixture()
def field_disagreement_off(monkeypatch):
    monkeypatch.setenv(FIELD_DISAGREEMENT_FLAG, "false")


def _smoke4_shaped_panel(make_judge_evidence) -> list[dict]:
    """Node 7809a51f: logical_validity 0.42 / 0.35 / 0.80 -- spread 0.45.
    The old composite gate reported "none" for this."""
    return [
        make_judge_evidence(judge_role="judge", logical_validity=0.42),
        make_judge_evidence(judge_role="judge_panel_claude", logical_validity=0.35),
        make_judge_evidence(judge_role="judge_panel_gemini", logical_validity=0.80),
    ]


def test_threshold_default_is_point_two_five():
    assert DISAGREEMENT_FIELD_THRESHOLD == 0.25


def test_pivotal_fields_name_real_claim_assessment_fields():
    # A field name typo would silently make that field un-measurable
    # (field_spreads skips absent fields rather than defaulting them to
    # zero), so pin the names against the model they must read.
    for section, field_name in PIVOTAL_FIELDS:
        section_model = ClaimAssessment.model_fields[section].annotation
        assert field_name in section_model.model_fields


def test_field_spreads_reports_per_field_max_minus_min(make_judge_evidence):
    evidence = [
        make_judge_evidence(judge_role="judge", logical_validity=0.38),
        make_judge_evidence(judge_role="judge_panel_claude", logical_validity=0.55),
        make_judge_evidence(judge_role="judge_panel_gemini", logical_validity=0.50),
    ]

    spreads = field_spreads(evidence)

    assert abs(spreads["logical_validity"] - 0.17) < 1e-6


def test_field_spreads_is_ungated_by_the_detection_flag(make_judge_evidence, field_disagreement_off):
    # Scope note: the flag gates the GATE (detect_persisted_judge_disagreements).
    # field_spreads is a pure measurement with no side effects and stays
    # available to callers regardless -- a later task ranks on it behind a
    # different flag.
    spreads = field_spreads(_smoke4_shaped_panel(make_judge_evidence))

    assert abs(spreads["logical_validity"] - 0.45) < 1e-6


def test_field_spreads_needs_two_distinct_judges(make_judge_evidence):
    assert field_spreads([make_judge_evidence()]) == {}


def test_smoke4_shaped_spread_now_detected(make_judge_evidence, field_disagreement_on):
    disagreements = detect_persisted_judge_disagreements(_smoke4_shaped_panel(make_judge_evidence))

    assert disagreements
    assert disagreements[0].type == "cross_family_field_spread"
    assert disagreements[0].judges == ["judge", "judge_panel_claude", "judge_panel_gemini"]
    assert "logical_validity" in disagreements[0].description


def test_flag_off_keeps_the_historical_composite_gate(make_judge_evidence, field_disagreement_off):
    # The whole point of the gating: the exact panel the flag-on path calls
    # contested is invisible to the historical 0.35 composite gate, which is
    # the byte-for-byte production behaviour until Task 8 flips the flag.
    assert detect_persisted_judge_disagreements(_smoke4_shaped_panel(make_judge_evidence)) == []


def test_flag_off_composite_gate_still_fires_on_a_wide_composite_gap(
    make_judge_evidence, field_disagreement_off
):
    # ... and the off-path is the real historical gate, not a stub that
    # always returns []: a panel whose _claim_strength_signal gap clears 0.35
    # still reports persisted_judge_strength_gap exactly as it does today.
    evidence = [
        make_judge_evidence(
            judge_role="judge",
            logical_validity=0.95,
            evidence_quality=0.95,
            counterargument_strength=0.05,
            relevance=0.95,
            assumption_risk=0.05,
        ),
        make_judge_evidence(
            judge_role="judge_panel_claude",
            logical_validity=0.05,
            evidence_quality=0.05,
            counterargument_strength=0.95,
            relevance=0.05,
            assumption_risk=0.95,
        ),
    ]

    disagreements = detect_persisted_judge_disagreements(evidence)

    assert [item.type for item in disagreements] == ["persisted_judge_strength_gap"]


def test_agreeing_panel_reports_no_disagreement(make_judge_evidence, field_disagreement_on):
    evidence = [
        make_judge_evidence(judge_role="judge", logical_validity=0.50),
        make_judge_evidence(judge_role="judge_panel_claude", logical_validity=0.55),
        make_judge_evidence(judge_role="judge_panel_gemini", logical_validity=0.52),
    ]

    assert detect_persisted_judge_disagreements(evidence) == []


def test_single_judge_never_disagrees(make_judge_evidence, field_disagreement_on):
    assert detect_persisted_judge_disagreements([make_judge_evidence()]) == []


def test_judge_disagreement_is_categorical_ground_for_challenge(
    make_score_signal, make_evidence_signal
):
    policy = ExplorationPolicy()
    score = make_score_signal(judges_disagree=True, fatal_flags=[])
    evidence = make_evidence_signal(status="grounded")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "challenge"
    assert decision.signal_class == CATEGORICAL_SIGNAL
    assert "judge families materially disagree" in decision.reasons


def test_agreeing_panel_leaves_the_challenge_route_closed(make_score_signal, make_evidence_signal):
    decision = ExplorationPolicy().decide(
        score=make_score_signal(judges_disagree=False, fatal_flags=[]),
        evidence=make_evidence_signal(status="grounded"),
    )

    assert decision.action != "challenge"


def _score_payload(
    *,
    disagreement_status: dict | None,
    reducer_version: str | None = None,
    rubric_version: str | None = None,
) -> NodeScoringPayload:
    from app.scoring.reducer import REDUCER_VERSION, RUBRIC_VERSION

    provenance: dict = {
        "raw_judge_output_kind": "claim_assessment",
        "raw_judge_output_included": False,
        "final_score_source": "deterministic_reducer",
        "reducer_version": reducer_version or REDUCER_VERSION,
        "rubric_version": rubric_version or RUBRIC_VERSION,
    }
    if disagreement_status is not None:
        provenance["disagreement_status"] = disagreement_status
    return NodeScoringPayload(
        node_id="node-1",
        claim=NormalizedClaim(
            node_id="node-1",
            raw_text="Convergence between models is not independent confirmation.",
            core_claim="Convergence between models is not independent confirmation.",
            claim_type="empirical",
        ),
        scores=NodeScores(
            strength=0.55,
            uncertainty=0.30,
            impact=0.50,
            evidence_quality=0.50,
            relevance=0.60,
            logical_validity=0.60,
            assumption_risk=0.30,
            counter_resilience=0.50,
        ),
        labels=ScoreLabels(strength_label="mixed", uncertainty_label="medium", impact_label="medium"),
        holes=[],
        fatal_flags=[],
        score_caps=[],
        judge_disagreements=[],
        recommended_investigations=[],
        rationale=ScoreRationale(
            short="Fixture.",
            why_not_higher="Fixture.",
            why_not_lower="Fixture.",
            weakest_link="Fixture.",
        ),
        score_provenance=ScoreProvenance.model_validate(provenance),
    )


@pytest.mark.parametrize(
    ("flag_value", "status", "expected"),
    [
        ("true", "present", True),
        ("true", "none", False),
        ("true", None, False),
        # Flag OFF: the lifecycle envelope carries False even for a node the
        # historical composite gate DID call contested, so no decision can
        # change until Task 8 flips the flag.
        ("false", "present", False),
    ],
)
def test_lifecycle_envelope_carries_the_panel_disagreement_fact(
    monkeypatch, flag_value, status, expected
) -> None:
    from app.exploration.scoring_input_resolver import _score_value

    monkeypatch.setenv(FIELD_DISAGREEMENT_FLAG, flag_value)
    disagreement_status = (
        None
        if status is None
        else {"status": status, "derived_from": "persisted_judge_artifacts"}
    )

    value = _score_value(_score_payload(disagreement_status=disagreement_status))

    assert value["judges_disagree"] is expected


def test_grounded_lifecycle_inputs_carry_judges_disagree_onto_the_score_signal() -> None:
    from test_lifecycle_inputs import (
        expected_correlation,
        grounded_evidence_candidate,
        grounded_score_candidate,
    )

    candidate = grounded_score_candidate()
    candidate["value"]["judges_disagree"] = True

    mapped = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(candidate,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(mapped, GroundedLifecycleInputs)
    assert mapped.schema_version == SCHEMA_VERSION
    assert mapped.score.judges_disagree is True
    signals = policy_signals_for_lifecycle(mapped)
    assert signals is not None
    assert signals[0].judges_disagree is True


def test_persisted_disagreement_label_confers_categorical_spawn_authority(monkeypatch) -> None:
    """End-to-end over the chain that actually grants spawn authority.

    Every link below is pinned individually elsewhere in this file, but the
    other policy test INJECTS judges_disagree=True into the signal fixture.
    This one derives it, starting from a persisted score_provenance and
    running the real production path:

        score_provenance.disagreement_status
          -> scoring_input_resolver._score_value   (envelope)
          -> lifecycle_inputs._parse_score_value   (AuthoritativeScore)
          -> policy_signals_for_lifecycle          (ScoreSignal)
          -> ExplorationPolicy.decide              (challenge / categorical)

    "categorical" is the only signal_class expansion_dispatch's THE LAW
    check will spawn work on, so this is the chain that confers spawn
    authority end to end.
    """
    from app.exploration.scoring_input_resolver import _score_value
    from test_lifecycle_inputs import (
        expected_correlation,
        grounded_evidence_candidate,
        grounded_score_candidate,
        scoring_contract_payload,
    )

    monkeypatch.setenv(FIELD_DISAGREEMENT_FLAG, "true")
    # Match the contract the lifecycle fixtures declare, read from the same
    # helper, so the versions cannot drift apart silently.
    contract = scoring_contract_payload()
    payload = _score_payload(
        disagreement_status={"status": "present", "derived_from": "persisted_judge_artifacts"},
        reducer_version=str(contract["reducer_version"]),
        rubric_version=str(contract["rubric_version"]),
    )
    candidate = grounded_score_candidate()
    candidate["value"] = _score_value(payload)

    mapped = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(candidate,),
        evidence_candidates=(grounded_evidence_candidate(),),
    )
    assert isinstance(mapped, GroundedLifecycleInputs)
    signals = policy_signals_for_lifecycle(mapped)
    assert signals is not None
    score_signal, evidence_signal = signals
    assert score_signal.judges_disagree is True

    decision = ExplorationPolicy().decide(score=score_signal, evidence=evidence_signal)

    assert decision.action == "challenge"
    assert decision.signal_class == CATEGORICAL_SIGNAL
    assert "judge families materially disagree" in decision.reasons


def test_legacy_score_envelope_without_the_field_defaults_to_no_disagreement() -> None:
    from test_lifecycle_inputs import (
        expected_correlation,
        grounded_evidence_candidate,
        grounded_score_candidate,
    )

    mapped = map_lifecycle_inputs(
        expected=expected_correlation(with_evidence=True),
        score_candidates=(grounded_score_candidate(),),
        evidence_candidates=(grounded_evidence_candidate(),),
    )

    assert isinstance(mapped, GroundedLifecycleInputs)
    assert mapped.score.judges_disagree is False
