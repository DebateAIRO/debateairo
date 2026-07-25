"""FW2 Part B: the frontier run's observability.

The module that decides everything on this path
(app/exploration/expansion_dispatch.py, 1,022 lines) carried exactly ONE log
statement before this wave, and it was a defensive warning;
app/synthesis/branch_summary.py and app/scoring/disagreement.py carried none.
The only instrumentation was a call-site log saying a pass happened and how
long it took -- nothing about what it DECIDED.

These tests pin the CENSUS (the keys an operator greps for and the counts
they carry) and the PERSISTED per-pass diagnostics. They deliberately do not
assert on log prose: the contract is the event name and its field names, so
wording can change and a renamed field cannot.
"""
from __future__ import annotations

import json
import logging

import pytest

from app.exploration.expansion_dispatch import (
    ADAPTIVE_EXPANSION_CONFIG_KEY,
    CONVERGED_WAVES_KEY,
    FRONTIER_DISTRIBUTION_KEY,
    ROUNDS_COMPLETED_KEY,
    OUTCOME_BELOW_PRIORITY_FLOOR,
    OUTCOME_SCALAR_ANNOTATE_ONLY,
    OUTCOME_SPAWNED,
    STOPPED_CONVERGED,
    WAVE_POLARITY_KEY,
    _frontier_distribution,
    expansion_dispatch,
)
from app.models.entities import Debate


def events(caplog, name: str) -> list[dict]:
    """Every structured `log_event` line for `name`, decoded.

    log_event writes one JSON object per line through the module logger, so
    the transport under test is exactly the one production greps.
    """
    found: list[dict] = []
    for record in caplog.records:
        message = record.getMessage()
        if not message.startswith("{"):
            continue
        try:
            payload = json.loads(message)
        except ValueError:
            continue
        if payload.get("event") == name:
            found.append(payload)
    return found


def adaptive_state(db, debate_id: str) -> dict:
    debate = db.get(Debate, debate_id)
    db.refresh(debate)
    return (debate.config or {}).get(ADAPTIVE_EXPANSION_CONFIG_KEY, {})


@pytest.fixture()
def logs(caplog):
    caplog.set_level(logging.INFO)
    return caplog


# ---------------------------------------------------------------------------
# P0.1 -- one structured census per dispatch pass
# ---------------------------------------------------------------------------


def test_census_carries_the_full_decision_breakdown(
    db, monkeypatch, logs, categorical_decisions_factory
):
    """The single line that should answer most post-hoc questions.

    Every key here is one an operator greps for, so this asserts the whole
    key set rather than a sample: a silently dropped field is the failure
    this test exists to catch.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "2")
    debate, _records, run_id = categorical_decisions_factory(
        db, priorities=[0.9, 0.7, 0.5, 0.01]
    )

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    census = events(logs, "expansion.census")
    assert len(census) == 1, "exactly one census line per dispatch pass"
    line = census[0]
    assert line["debate_id"] == debate.id
    assert line["analyzer_run_id"] == run_id
    assert line["records_total"] == 4
    assert line["dispatchable"] == 4
    assert line["spawned"] == 2, "wave width bound it to two"
    assert line["replayed"] == 0
    assert line["rounds_completed"] == 1
    assert line["wave_width"] == 2
    assert line["floor"] == pytest.approx(0.15)
    assert line["growth_elapsed_s"] >= 0
    assert line["converged_waves"] == 0
    # Frontier shape travels on the census too, so one grep answers "did
    # anything expand, and if not was the floor or the ranking to blame".
    assert line["n_ranked"] == 4
    assert line["n_unranked"] == 0
    assert line["n_below_floor"] == 1
    assert line["priority_min"] == pytest.approx(0.01)
    assert line["priority_max"] == pytest.approx(0.9)
    assert line["priority_p50"] == pytest.approx(0.7)


def test_census_emits_each_outcome_code_as_its_own_greppable_key(
    db, monkeypatch, logs, categorical_decisions_factory
):
    """`grep expansion.census | grep outcome_below_priority_floor` must work,
    so the Counter is FLATTENED to one key per code rather than nested."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.01])

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    line = events(logs, "expansion.census")[0]
    assert line[f"outcome_{OUTCOME_SPAWNED}"] == 1
    assert line[f"outcome_{OUTCOME_BELOW_PRIORITY_FLOOR}"] == 1
    # Codes that did not occur are ABSENT, not zero -- the vocabulary keeps
    # growing and a full cross-product would be mostly zeros.
    assert f"outcome_{OUTCOME_SCALAR_ANNOTATE_ONLY}" not in line


def test_census_reports_the_raw_convergence_read(
    db, monkeypatch, logs, categorical_decisions_factory, converged_run_factory
):
    """maxDelta/epsilon travel RAW, so the stop condition is checkable
    against its own inputs rather than against a derived verdict."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    converged_run_factory(db, max_delta=0.226, epsilon=0.05, debate=debate, expanded=False)

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    line = events(logs, "expansion.census")[0]
    assert line["max_delta"] == pytest.approx(0.226)
    assert line["epsilon"] == pytest.approx(0.05)


def test_scalar_only_pass_is_distinguishable_from_an_unrankable_one(
    db, monkeypatch, logs, scalar_decisions_factory
):
    """The census separates "THE LAW refused everything" from "nothing was
    rankable" -- two of the three indistinguishable no-growth failures."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = scalar_decisions_factory(db, priorities=[0.9, 0.8])

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    line = events(logs, "expansion.census")[0]
    assert line["spawned"] == 0
    assert line[f"outcome_{OUTCOME_SCALAR_ANNOTATE_ONLY}"] == 2
    # Rankable all along: the refusal was the signal class, not the scores.
    assert line["n_ranked"] == 2
    assert line["n_unranked"] == 0


# ---------------------------------------------------------------------------
# P0.2 -- whole-debate stops at WARNING
# ---------------------------------------------------------------------------


def test_converged_stop_is_logged_at_warning_with_its_facts(
    db, monkeypatch, caplog, categorical_decisions_factory, converged_run_factory
):
    """A run ENDING produced no log line at all before this. It is the single
    most important event in the system, so it is emitted twice: a structured
    record to grep, and a WARNING for whoever watches the level."""
    caplog.set_level(logging.INFO)
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    # One settled wave already observed, and a round completed to have
    # observed it on. The SECOND settled wave arrives below, so the stop
    # fires on a pass whose records are still un-outcomed -- which is what
    # makes records_refused a real number here rather than zero.
    state = (debate.config or {}).get(ADAPTIVE_EXPANSION_CONFIG_KEY, {})
    state[ROUNDS_COMPLETED_KEY] = 1
    state[CONVERGED_WAVES_KEY] = 1
    debate.config = {**(debate.config or {}), ADAPTIVE_EXPANSION_CONFIG_KEY: state}
    db.commit()
    converged_run_factory(db, max_delta=0.01, epsilon=0.05, debate=debate, expanded=False)

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    stops = events(caplog, "expansion.stop")
    assert len(stops) == 1
    stop = stops[0]
    assert stop["debate_id"] == debate.id
    assert stop["reason"] == STOPPED_CONVERGED
    assert stop["records_refused"] == 1
    assert stop["growth_elapsed_s"] >= 0
    assert stop["rounds_completed"] >= 1

    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any("adaptive expansion STOPPED" in r.getMessage() for r in warnings)
    # A stop ends growth for the DEBATE, so the pass returns before the
    # dispatch loop and there is no census to emit.
    assert events(caplog, "expansion.census") == []


def test_wall_clock_stop_is_logged_at_warning(
    db, monkeypatch, caplog, categorical_decisions_factory
):
    caplog.set_level(logging.INFO)
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS", "60")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    # Backdate the growth clock past the ceiling.
    state = (debate.config or {}).get(ADAPTIVE_EXPANSION_CONFIG_KEY, {})
    state["growth_started_at"] = "2020-01-01T00:00:00+00:00"
    debate.config = {**(debate.config or {}), ADAPTIVE_EXPANSION_CONFIG_KEY: state}
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    stop = events(caplog, "expansion.stop")[0]
    assert stop["reason"] == "wall_clock"
    assert stop["records_refused"] == 1
    assert stop["growth_elapsed_s"] > 60
    assert any(
        r.levelno == logging.WARNING and "adaptive expansion STOPPED" in r.getMessage()
        for r in caplog.records
    )


# ---------------------------------------------------------------------------
# P0.3 / P1.5 -- persisted per-pass diagnostics
# ---------------------------------------------------------------------------


def test_frontier_distribution_is_persisted_on_the_pass(
    db, monkeypatch, categorical_decisions_factory
):
    """Persisted, not merely logged: this is what the operator reads back
    after the run, when the log has rotated."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(
        db, priorities=[0.9, 0.5, 0.02, 0.01]
    )

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    distribution = adaptive_state(db, debate.id)[FRONTIER_DISTRIBUTION_KEY]
    assert distribution["n_ranked"] == 4
    assert distribution["n_unranked"] == 0
    assert distribution["n_below_floor"] == 2
    assert distribution["min"] == pytest.approx(0.01)
    assert distribution["max"] == pytest.approx(0.9)
    assert distribution["floor"] == pytest.approx(0.15)


def test_distribution_separates_unrankable_from_below_floor(
    db, monkeypatch, categorical_decisions_factory
):
    """The whole point of P0.3: "nothing was rankable" and "everything was
    below the floor" look identical from outside and need opposite fixes."""
    from app.models.entities import AnalyzerRun

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.8])
    # The run still exists and is still complete; it simply scores nothing.
    run = db.get(AnalyzerRun, run_id)
    run.output = {**run.output, "items": []}
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    distribution = adaptive_state(db, debate.id)[FRONTIER_DISTRIBUTION_KEY]
    assert distribution["n_unranked"] == 2
    assert distribution["n_ranked"] == 0
    assert distribution["n_below_floor"] == 0, "an unmeasured node is not a low one"
    # No measurement means no min/p50/max at all, rather than a fabricated 0.0.
    assert "min" not in distribution and "p50" not in distribution


def test_wave_polarity_is_persisted_and_logged(
    db, monkeypatch, logs, categorical_decisions_factory
):
    """P1.5: the direct instrument for the open CON-dominance risk.

    The factory decides `challenge` throughout, which maps to CON -- exactly
    the short-circuit the risk describes -- so a wave of pure CON must be
    visible as such rather than only as a spawn count.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.8])

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    assert adaptive_state(db, debate.id)[WAVE_POLARITY_KEY] == {"PRO": 0, "CON": 2}
    line = events(logs, "expansion.census")[0]
    assert line["spawned_con"] == 2
    assert line["spawned_pro"] == 0


def test_a_pass_with_no_dispatchable_records_keeps_the_last_real_distribution(
    db, monkeypatch, categorical_decisions_factory
):
    """The zeroing bug P0.3 defeated itself with.

    A pass with nothing dispatchable has spawned == 0, replayed == 0 and
    outcomes == [], so it falls through to the stopped_because branch. Before
    the gate it wrote _frontier_distribution([], floor) -- all zeros, no
    min/p50/max -- straight over the last real pass's numbers, which reads
    exactly like "nothing was rankable": one of the three failure modes this
    diagnostic exists to tell apart.

    It is not a corner case. The dispatcher runs on EVERY scoring completion,
    both whole-debate stops return before the bookkeeping tail, and
    no-dispatchable-decision passes become the common case as a debate
    settles -- so the zeros are frequently the LAST thing written, and
    therefore what /api/ops/expansion serves after a finished run.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.5])
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)
    real = adaptive_state(db, debate.id)[FRONTIER_DISTRIBUTION_KEY]
    real_polarity = adaptive_state(db, debate.id)[WAVE_POLARITY_KEY]
    assert real["n_ranked"] == 2 and real_polarity == {"PRO": 0, "CON": 2}

    # A second pass over the SAME run whose decisions are all
    # non-expansion-bearing: `deepen` is not in DECISION_POLARITY, so
    # `dispatchable` is empty while `records` is not.
    for record in records:
        record.decision = "deepen"
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    state = adaptive_state(db, debate.id)
    assert state[FRONTIER_DISTRIBUTION_KEY] == real, "the real pass's numbers survive"
    assert state[WAVE_POLARITY_KEY] == real_polarity
    # The pass still records WHY it did nothing -- only the diagnostics are
    # withheld, never the stop reason.
    assert state["stopped_because"] == "quiescent_no_decisions"


def test_a_debate_with_no_records_at_all_writes_no_distribution(
    db, monkeypatch, categorical_decisions_factory
):
    """The other empty-frontier shape: no grounded records for the run."""
    from app.models.entities import AnalyzerRun, next_analyzer_run_seq
    from app.services.dialectical_v2 import first_branch

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, _run_id = categorical_decisions_factory(db, priorities=[0.9])
    # A DIFFERENT complete scoring run, which no decision record points at.
    empty_run = AnalyzerRun(
        debate_id=debate.id,
        branch_id=first_branch(db, debate.id).id,
        analyzer_type="node_scoring",
        output={"status": "available", "items": []},
        status="complete",
        provenance={"scoring_source": "judge_outputs"},
    )
    next_analyzer_run_seq(db, empty_run)
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=empty_run.id)

    assert FRONTIER_DISTRIBUTION_KEY not in adaptive_state(db, debate.id)
    assert WAVE_POLARITY_KEY not in adaptive_state(db, debate.id)


def test_distribution_is_a_pure_function_of_priorities_and_floor():
    """Unit-level, because the helper must never consult a gate: the whole
    argument that it cannot perturb dispatch rests on it being pure."""
    assert _frontier_distribution([], 0.15) == {
        "n_ranked": 0,
        "n_unranked": 0,
        "n_below_floor": 0,
        "floor": 0.15,
    }
    distribution = _frontier_distribution([0.4, None, 0.1, 0.2], 0.15)
    assert distribution["n_ranked"] == 3
    assert distribution["n_unranked"] == 1
    assert distribution["n_below_floor"] == 1
    assert distribution["min"] == pytest.approx(0.1)
    assert distribution["p50"] == pytest.approx(0.2)
    assert distribution["max"] == pytest.approx(0.4)


# ---------------------------------------------------------------------------
# P1.6 -- the two N+1 sites
# ---------------------------------------------------------------------------


def test_score_items_n_plus_one_is_timed(db, monkeypatch, logs, categorical_decisions_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, _records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.8, 0.7])

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    timing = events(logs, "expansion.score_items")
    assert len(timing) == 1
    assert timing[0]["n_nodes"] == 3
    assert timing[0]["n_requested"] == 3
    assert timing[0]["duration_ms"] >= 0


def test_contested_rank_is_timed_on_both_paths(db, logs, make_judge_evidence):
    """Emitted whether or not the cap binds, so an operator who greps and
    finds nothing can conclude the code did not run -- `capped` says which
    path it took, and only the capped path performs judge-evidence reads."""
    from app.synthesis.branch_summary import build_synthesis_tree_payload

    from test_branch_summary import _v2_debate_with_deep_scored_tree

    debate, _root = _v2_debate_with_deep_scored_tree(
        db,
        node_count=12,
        contested_node_spreads={index: 0.3 + index * 0.01 for index in range(6)},
        make_judge_evidence=make_judge_evidence,
    )

    build_synthesis_tree_payload(db, debate, load_bearing_k=5, contested_k=30)
    uncapped = events(logs, "synthesis.contested_rank")[-1]
    assert uncapped["capped"] is False
    assert uncapped["n_nodes"] == 6
    assert uncapped["duration_ms"] >= 0

    build_synthesis_tree_payload(db, debate, load_bearing_k=5, contested_k=2)
    capped = events(logs, "synthesis.contested_rank")[-1]
    assert capped["capped"] is True
    assert capped["n_nodes"] == 6
    assert capped["contested_k"] == 2


# ---------------------------------------------------------------------------
# P1.7 -- synthesis payload shape
# ---------------------------------------------------------------------------


def test_synthesis_payload_shape_makes_the_conservation_identity_mechanical(db, logs):
    """Flip-plan step 7a asks the operator to verify
    branches + load_bearing + contested + omitted_count == n_nodes BY HAND.
    Logging all five terms makes that a subtraction instead."""
    from app.synthesis.branch_summary import build_synthesis_tree_payload

    from test_branch_summary import _v2_debate_with_deep_scored_tree

    debate, _root = _v2_debate_with_deep_scored_tree(db, node_count=40)

    payload = build_synthesis_tree_payload(db, debate, load_bearing_k=5, contested_k=30)

    shape = events(logs, "synthesis.payload_shape")[-1]
    assert shape["debate_id"] == debate.id
    assert shape["branches"] == len(payload["branches"])
    assert shape["load_bearing"] == len(payload["load_bearing"]) == 5
    assert shape["contested"] == len(payload["contested"])
    assert shape["omitted_count"] == payload["omitted_count"]
    assert (
        shape["branches"] + shape["load_bearing"] + shape["contested"] + shape["omitted_count"]
        == shape["n_nodes"]
    )
    # The size trend that makes an approaching context-window failure visible
    # hours before it lands.
    assert shape["total_chars"] > 0


# ---------------------------------------------------------------------------
# P1.8 -- scoring cache hit/miss per run
# ---------------------------------------------------------------------------


def test_scoring_cache_hits_and_misses_are_counted_per_run(db, logs):
    """Re-judge volume is the dominant CLI cost across 12 waves, and the
    existing `batch_cache_hit` is an AND-fold -- it answers "was EVERY node
    cached", so it cannot express "119 of 120 were". These counts can."""
    import json as _json

    from app.models.entities import Node
    from app.scoring import ScoringProviderResult
    from app.scoring.service import score_nodes_with_provider

    from test_node_scoring import base_assessment

    class StubJudge:
        provider = "test-provider"
        model = "test-model"

        def judge_node(self, request):
            return ScoringProviderResult(
                provider=self.provider,
                model=self.model,
                raw_output=_json.dumps(
                    base_assessment(node_id=request.claim.node_id).model_dump(mode="json")
                ),
                latency_ms=5,
                checked_at="2026-07-25T10:15:30+00:00",
            )

    debate = Debate(topic="Should we meter the frontier?", status="complete")
    root = Node(
        debate=debate,
        node_type="root",
        depth=0,
        position=0,
        claim="Metering the frontier is worthwhile.",
        status="complete",
        materialized_path="/",
    )
    child = Node(
        debate=debate,
        parent=root,
        node_type="support",
        depth=1,
        position=0,
        claim="Unmeasured cost is unmanageable cost.",
        status="complete",
        materialized_path="/0001",
    )
    db.add_all([debate, root, child])
    db.commit()

    score_nodes_with_provider(db, debate, StubJudge())
    cold = events(logs, "scoring.cache")[-1]
    assert cold["debate_id"] == debate.id
    assert cold["requested_nodes"] == 2
    assert cold["cache_misses"] == 2
    assert cold["cache_hits"] == 0
    assert cold["model_call_count"] == 2

    # Same inputs, so the input-hash cache serves both nodes and NO judge
    # call runs -- the case whose volume decides whether a run takes one hour
    # or four.
    score_nodes_with_provider(db, debate, StubJudge())
    warm = events(logs, "scoring.cache")[-1]
    assert warm["cache_hits"] == 2
    assert warm["cache_misses"] == 0
    assert warm["model_call_count"] == 0
