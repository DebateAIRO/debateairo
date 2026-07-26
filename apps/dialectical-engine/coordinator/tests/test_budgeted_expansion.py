"""W7: per-debate budgets for the adaptive expansion loop.

Design under test:
  - debate.config["adaptive_expansion"] may carry the three budget knobs
    (max_rounds / max_per_node / max_per_debate); each overrides its env
    default for THAT debate only, clamped to the same bounds as the env
    knobs. Invalid values are ignored (env default wins).
  - The override can RAISE a budget above the env default -- the point of
    the feature: let a debate roam wider when the user asks for it.
  - merged_debate_config sanitizes the client-supplied budget dict: only the
    three known integer knobs survive; runtime bookkeeping keys
    (rounds_completed / stopped_because) and junk can never be injected at
    creation time.
"""
from __future__ import annotations

from app.exploration.expansion_dispatch import (
    BUDGET_BOUNDS,
    OUTCOME_BUDGET_EXHAUSTED,
    OUTCOME_DEPTH_LIMIT,
    OUTCOME_NODE_BUDGET_EXHAUSTED,
    OUTCOME_ROUNDS_EXHAUSTED,
    OUTCOME_SPAWNED,
    STOPPED_DEPTH_LIMIT,
    STOPPED_QUIESCENT_NO_DECISIONS,
    _stopped_because_for_pass,
    admit_and_spawn,
    expansion_max_per_debate,
    expansion_max_per_node,
    expansion_max_rounds,
)
from app.models.entities import Debate
from app.services.orchestrator import merged_debate_config

from test_v2_expand import codex_worker, first_pov_pro, make_v2_debate


def _set_budgets(db, debate: Debate, budgets: dict) -> None:
    debate.config = {**debate.config, "adaptive_expansion": budgets}
    db.commit()


# ---------------------------------------------------------------------------
# Config overrides (lower and raise) with env defaults as the baseline
#
# These exercise the rails through ADAPTIVE spawns (a decision_record_id in
# the payload). Since 2026-07-26 the budgets count adaptive-origin expansions
# only -- see _adaptive_expand_jobs and the origin tests at the bottom of this
# file -- so an origin-less call no longer consumes them and could not
# demonstrate a knob at all.
# ---------------------------------------------------------------------------


def test_config_override_lowers_per_debate_budget(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_debate": 0})

    job, outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="challenge it", decision_record_id="decision-1"
    )

    assert job is None
    assert outcome == OUTCOME_BUDGET_EXHAUSTED


def test_config_override_raises_budget_above_env_default(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_DEBATE", "1")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_debate": 2, "max_per_node": 2})

    first_job, first_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="challenge one", decision_record_id="decision-1"
    )
    second_job, second_outcome = admit_and_spawn(
        db, debate, node, polarity="PRO", reason="support two", decision_record_id="decision-2"
    )
    third_job, third_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="challenge three", decision_record_id="decision-3"
    )

    assert (first_outcome, second_outcome) == (OUTCOME_SPAWNED, OUTCOME_SPAWNED)
    assert first_job is not None and second_job is not None
    assert third_job is None and third_outcome == OUTCOME_BUDGET_EXHAUSTED


def test_per_node_config_override_is_honored(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_NODE", "5")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_node": 1, "max_per_debate": 10})

    _job, first_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="challenge one", decision_record_id="decision-1"
    )
    second_job, second_outcome = admit_and_spawn(
        db, debate, node, polarity="PRO", reason="support two", decision_record_id="decision-2"
    )

    assert first_outcome == OUTCOME_SPAWNED
    # FW1 (I1): the PER-NODE rail is its own code. It is NOT
    # OUTCOME_BUDGET_EXHAUSTED: the debate budget here is 10 and only one of
    # it is spent, so "reaching its budget for this debate" would be false,
    # and the operator response ("investigate one hot node" vs "raise the
    # debate budget") is the opposite one.
    assert second_job is None and second_outcome == OUTCOME_NODE_BUDGET_EXHAUSTED
    assert second_outcome != OUTCOME_BUDGET_EXHAUSTED


def test_the_three_expansion_stop_rails_have_distinct_codes() -> None:
    """FW1 (I1): max_rounds, max_per_debate and max_per_node are three
    different findings demanding three different operator responses. At the
    new budgets 12 rounds x 12 wave width = 144 < 150, so max_rounds binds
    FIRST in practice -- and a rounds-exhausted pass has an UNTOUCHED debate
    budget, which is exactly what the shared code used to deny."""
    assert len(
        {OUTCOME_ROUNDS_EXHAUSTED, OUTCOME_BUDGET_EXHAUSTED, OUTCOME_NODE_BUDGET_EXHAUSTED}
    ) == 3


def test_an_all_depth_rail_pass_names_the_depth_rail_not_quiescence() -> None:
    """FW2: OUTCOME_DEPTH_LIMIT joined GROWTH_STOP_OUTCOMES in FW1 (I4) but
    never reached _stopped_because_for_pass, so a pass whose every record was
    refused by the depth rail recorded `quiescent_no_decisions` -- rendered
    as "Automatic expansion has not found anything to grow yet", which is
    FALSE: it found targets and the rail refused them. An all-depth-rail pass
    is expected late in a 12-round run against a depth-10 rail.
    """
    assert _stopped_because_for_pass([OUTCOME_DEPTH_LIMIT]) == STOPPED_DEPTH_LIMIT
    assert _stopped_because_for_pass([OUTCOME_DEPTH_LIMIT]) != STOPPED_QUIESCENT_NO_DECISIONS
    # A genuinely empty pass still says quiescent -- the depth rail only
    # claims the pass when the rail actually fired.
    assert _stopped_because_for_pass([]) == STOPPED_QUIESCENT_NO_DECISIONS


def test_the_depth_rail_yields_to_every_wave_and_debate_level_rail() -> None:
    """Ordering, not just membership: the depth rail is PER-BRANCH, so it is
    the weakest claim about why a whole pass stopped and must not mask a rail
    the operator answers with a debate-level knob."""
    for stronger in (
        OUTCOME_ROUNDS_EXHAUSTED,
        OUTCOME_BUDGET_EXHAUSTED,
        OUTCOME_NODE_BUDGET_EXHAUSTED,
    ):
        assert _stopped_because_for_pass([OUTCOME_DEPTH_LIMIT, stronger]) != STOPPED_DEPTH_LIMIT


def test_frontier_budget_defaults(monkeypatch) -> None:
    """P1 Task 8's raise, read from the production defaults rather than from
    whatever this machine/CI runner happens to export."""
    for name in (
        "DIALECTICAL_EXPANSION_MAX_ROUNDS",
        "DIALECTICAL_EXPANSION_MAX_PER_NODE",
        "DIALECTICAL_EXPANSION_MAX_PER_DEBATE",
    ):
        monkeypatch.delenv(name, raising=False)

    assert expansion_max_rounds() == 12
    assert expansion_max_per_node() == 3
    assert expansion_max_per_debate() == 150


def test_budget_bounds_admit_their_own_defaults(monkeypatch) -> None:
    """A bound that cannot admit its own default silently clamps every
    explicit operator override back below it -- which is exactly what
    max_per_debate's (0, 100) ceiling would have done to the new 150 default.
    The env route and the debate.config route read the SAME bounds, so this
    pins both.
    """
    assert BUDGET_BOUNDS["max_per_debate"] == (0, 200)
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_DEBATE", "150")
    assert expansion_max_per_debate() == 150

    debate = Debate(
        topic="t",
        status="generating",
        config={"adaptive_expansion": {"max_per_debate": 150}},
    )
    assert expansion_max_per_debate(debate) == 150


def test_budget_helpers_read_config_overrides_and_env_defaults(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_ROUNDS", "1")
    debate = Debate(topic="t", status="generating", config={"adaptive_expansion": {"max_rounds": 4}})

    assert expansion_max_rounds(debate) == 4
    assert expansion_max_rounds() == 1  # env default without a debate
    assert expansion_max_per_node(debate) == expansion_max_per_node()  # no override set
    assert expansion_max_per_debate(debate) == expansion_max_per_debate()


def test_invalid_config_budgets_fall_back_to_env_defaults(monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_ROUNDS", "2")
    for bad in (True, "many", -1, 10_000, None):
        debate = Debate(topic="t", status="generating", config={"adaptive_expansion": {"max_rounds": bad}})
        assert expansion_max_rounds(debate) == 2


# ---------------------------------------------------------------------------
# Creation-time sanitization of the client-supplied budget dict
# ---------------------------------------------------------------------------


def test_merged_debate_config_keeps_only_known_budget_knobs() -> None:
    merged = merged_debate_config(
        {
            "adaptive_expansion": {
                "max_per_debate": 9,
                "max_rounds": 3,
                "rounds_completed": 5,
                "stopped_because": "injected",
                "junk": "x",
            }
        }
    )
    assert merged["adaptive_expansion"] == {"max_per_debate": 9, "max_rounds": 3}


def test_merged_debate_config_drops_non_dict_or_valueless_budgets() -> None:
    assert "adaptive_expansion" not in merged_debate_config({"adaptive_expansion": "wide open"})
    assert "adaptive_expansion" not in merged_debate_config({"adaptive_expansion": {"junk": 1}})
    assert "adaptive_expansion" not in merged_debate_config({})


# ---------------------------------------------------------------------------
# P1 contested-frontier fix (2026-07-26): the expansion budgets bound the
# ADAPTIVE automation, and only it. See
# .superpowers/sdd/2026-07-24-p1-contested-frontier/frontier-fix-report.md.
#
# Live evidence (acceptance-path-report.md §5.2): cross-exam and adversarial-
# POV waves queue v2_expand jobs through the same primitive but never through
# admit_and_spawn, so they consumed the adaptive rails without ever being
# checked against them. Six nodes on debate 0f688d87 were already at 2 of
# max_per_node=3 from those features alone -- including the only node that
# could authenticate -- so the adaptive frontier had at most ONE spawn left
# per node before the rail refused, and a whole-debate stop would have been
# attributed to `node_budget_exhausted`.
# ---------------------------------------------------------------------------


def _non_adaptive_expand_job(db, debate, node, *, reason: str):
    """A v2_expand job with no decision_record_id: exactly the shape
    _queue_cross_exam_jobs / _queue_adversarial_attack_jobs produce."""

    from app.services.dialectical_v2 import queue_v2_expand_job

    return queue_v2_expand_job(db, debate, node, "CON", reason, payload_extra={"cross_exam": True})


def test_non_adaptive_expand_jobs_do_not_consume_the_adaptive_per_node_budget(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_node": 2, "max_per_debate": 50})
    _non_adaptive_expand_job(db, debate, node, reason="cross-examine this claim")
    _non_adaptive_expand_job(db, debate, node, reason="adversarially attack this claim")

    job, outcome = admit_and_spawn(
        db,
        debate,
        node,
        polarity="CON",
        reason="judge families materially disagree",
        decision_record_id="decision-1",
    )

    assert outcome == OUTCOME_SPAWNED
    assert job is not None


def test_adaptive_spawns_are_still_refused_at_the_per_node_budget(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_node": 2, "max_per_debate": 50})

    first, first_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="disagree one", decision_record_id="decision-1"
    )
    second, second_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="disagree two", decision_record_id="decision-2"
    )
    third, third_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="disagree three", decision_record_id="decision-3"
    )

    assert (first_outcome, second_outcome) == (OUTCOME_SPAWNED, OUTCOME_SPAWNED)
    assert first is not None and second is not None
    # Refusal-only, and still the per-node code rather than the debate one.
    assert third is None and third_outcome == OUTCOME_NODE_BUDGET_EXHAUSTED


def test_non_adaptive_expand_jobs_do_not_consume_the_adaptive_per_debate_budget(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_debate": 1, "max_per_node": 5})
    _non_adaptive_expand_job(db, debate, node, reason="cross-examine this claim")

    job, outcome = admit_and_spawn(
        db,
        debate,
        node,
        polarity="CON",
        reason="judge families materially disagree",
        decision_record_id="decision-1",
    )

    assert outcome == OUTCOME_SPAWNED
    assert job is not None


def test_adaptive_spawns_are_still_refused_at_the_per_debate_budget(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_debate": 1, "max_per_node": 5})

    first, first_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="disagree one", decision_record_id="decision-1"
    )
    second, second_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="disagree two", decision_record_id="decision-2"
    )

    assert first_outcome == OUTCOME_SPAWNED and first is not None
    assert second is None and second_outcome == OUTCOME_BUDGET_EXHAUSTED


def test_operator_approved_spawns_do_not_consume_the_adaptive_budget(db, monkeypatch) -> None:
    """The same ruling precedent the approval path already follows for
    rounds_completed (app/api/scoring.py: clear_adaptive_stop is deliberately
    NOT paired with a rounds bump -- "an operator override must not spend the
    automation's budget"). An approved expansion reaches admit_and_spawn with
    no decision_record_id, so it is not adaptive-origin either."""

    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_node": 1, "max_per_debate": 50})

    approved, approved_outcome = admit_and_spawn(
        db, debate, node, polarity="CON", reason="operator approved this expansion"
    )
    adaptive, adaptive_outcome = admit_and_spawn(
        db,
        debate,
        node,
        polarity="CON",
        reason="judge families materially disagree",
        decision_record_id="decision-1",
    )

    assert approved_outcome == OUTCOME_SPAWNED and approved is not None
    assert adaptive_outcome == OUTCOME_SPAWNED and adaptive is not None
