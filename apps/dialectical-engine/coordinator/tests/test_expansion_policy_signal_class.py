"""P1 Task 4: signal-class contamination.

THE LAW (expansion_dispatch.py:330-335) lets only categorical decisions
spawn work. Across the entire production database, 6 lifecycle decisions
have ever existed and all 6 are scalar -- so the law blocks 100% of
expansion. Cause: _decision required EVERY reason to be categorical, but
each reason is independently sufficient to fire the action, so adding a
scalar corroboration DOWNGRADED a categorically-grounded decision. And
seek_evidence folded abandon_blockers -- reasons not to abandon -- into
its grounding tuple.
"""
from __future__ import annotations

from app.exploration.policy import CATEGORICAL_SIGNAL, SCALAR_SIGNAL, ExplorationPolicy


def test_categorical_reason_survives_a_scalar_corroboration(make_score_signal, make_evidence_signal):
    """A claim whose evidence is categorically unresolved AND whose scoring
    also recommends find_evidence is BETTER grounded, not worse."""
    policy = ExplorationPolicy()
    score = make_score_signal(
        claim_type="empirical",
        evidence_quality=0.0,
        recommended_actions=["find_evidence"],
    )
    evidence = make_evidence_signal(status="missing")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "seek_evidence"
    assert decision.signal_class == CATEGORICAL_SIGNAL


def test_abandon_blockers_do_not_ground_the_decision(make_score_signal, make_evidence_signal):
    policy = ExplorationPolicy()
    score = make_score_signal(
        claim_type="empirical",
        evidence_quality=0.0,
        uncertainty=0.9,
        impact=0.9,
        recommended_actions=[],
    )
    evidence = make_evidence_signal(status="missing")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.signal_class == CATEGORICAL_SIGNAL
    # The blocker is refused as grounding, never silently dropped: its text
    # still lands in the audited reason trail.
    assert "abandon blocked while high-impact uncertainty remains" in decision.reasons


def test_categorical_blocker_does_not_upgrade_a_scalar_grounded_decision(
    make_score_signal, make_evidence_signal
):
    """Blockers are excluded from classification in BOTH directions.

    Here the only GROUNDING reason is scalar (evidence status is resolved, so
    the seek reason fires solely through the evidence_quality threshold), while
    the abandon blocker is categorical (fatal flags present). THE LAW must keep
    this decision scalar: a reason not to abandon never licenses a spawn.
    """
    policy = ExplorationPolicy()
    score = make_score_signal(
        claim_type="empirical",
        evidence_quality=0.1,
        # Deliberately not "contradiction:high" -- that would route to challenge.
        fatal_flags=["circularity:medium"],
    )
    evidence = make_evidence_signal(status="grounded")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "seek_evidence"
    assert decision.signal_class == SCALAR_SIGNAL
    assert "abandon blocked until fatal flags are challenged" in decision.reasons


def test_purely_scalar_decision_stays_scalar(make_score_signal, make_evidence_signal):
    """THE LAW must still hold: nothing scalar-only may become categorical."""
    policy = ExplorationPolicy()
    score = make_score_signal(
        claim_type="normative",
        assumption_risk=0.95,
        recommended_actions=[],
    )
    evidence = make_evidence_signal(status="grounded")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "deepen"
    assert decision.signal_class == SCALAR_SIGNAL
