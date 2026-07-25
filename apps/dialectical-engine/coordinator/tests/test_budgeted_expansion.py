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
    OUTCOME_NODE_BUDGET_EXHAUSTED,
    OUTCOME_ROUNDS_EXHAUSTED,
    OUTCOME_SPAWNED,
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
# ---------------------------------------------------------------------------


def test_config_override_lowers_per_debate_budget(db, monkeypatch) -> None:
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_debate": 0})

    job, outcome = admit_and_spawn(db, debate, node, polarity="CON", reason="challenge it")

    assert job is None
    assert outcome == OUTCOME_BUDGET_EXHAUSTED


def test_config_override_raises_budget_above_env_default(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_DEBATE", "1")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_debate": 2, "max_per_node": 2})

    first_job, first_outcome = admit_and_spawn(db, debate, node, polarity="CON", reason="challenge one")
    second_job, second_outcome = admit_and_spawn(db, debate, node, polarity="PRO", reason="support two")
    third_job, third_outcome = admit_and_spawn(db, debate, node, polarity="CON", reason="challenge three")

    assert (first_outcome, second_outcome) == (OUTCOME_SPAWNED, OUTCOME_SPAWNED)
    assert first_job is not None and second_job is not None
    assert third_job is None and third_outcome == OUTCOME_BUDGET_EXHAUSTED


def test_per_node_config_override_is_honored(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EXPANSION_MAX_PER_NODE", "5")
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker, complete_povs=1)
    node = first_pov_pro(db, debate)
    _set_budgets(db, debate, {"max_per_node": 1, "max_per_debate": 10})

    _job, first_outcome = admit_and_spawn(db, debate, node, polarity="CON", reason="challenge one")
    second_job, second_outcome = admit_and_spawn(db, debate, node, polarity="PRO", reason="support two")

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
