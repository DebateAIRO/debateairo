"""P1 Task 6: frontier ordering.

Scalars rank and truncate work THE LAW has already authorised; they never
authorise it. A scalar-grounded decision is still unable to spawn no matter
how high its priority.

Float discipline: ``frontier_priority`` multiplies floats, so the factory
feeds ``uncertainty=1.0`` and ``max_field_spread=0.0`` in the ordering tests
-- multiplication by 1.0 is exact in IEEE-754, so the recorded priority is
bit-for-bit the requested one. The assertions still go through
``pytest.approx`` so a later change to the formula's shape (e.g. a different
dispersion base) fails on the ordering it broke rather than on the last bit
of a mantissa.
"""
from __future__ import annotations

import hashlib
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.exploration.expansion_dispatch import (
    OUTCOME_BELOW_PRIORITY_FLOOR,
    OUTCOME_BUDGET_EXHAUSTED,
    OUTCOME_WAVE_FULL,
    STOPPED_BELOW_PRIORITY_FLOOR,
    adaptive_expansion_state,
    expansion_dispatch,
    expansion_priority_floor,
    expansion_wave_width,
    frontier_priority,
    frontier_priority_or_none,
)
from app.models.entities import (
    AnalyzerRun,
    Debate,
    Job,
    JudgeOutputArtifact,
    next_analyzer_run_seq,
    now_utc,
)
from app.services.dialectical_v2 import first_branch


def expand_jobs(db, debate_id: str) -> list[Job]:
    return list(
        db.scalars(
            select(Job).where(Job.debate_id == debate_id, Job.job_type == "v2_expand")
        ).all()
    )


def test_defaults(monkeypatch):
    # Read the PRODUCTION defaults, not whatever this machine or CI runner
    # happens to export -- the same discipline as
    # test_budgeted_expansion.test_frontier_budget_defaults. Both knobs are
    # on the flip plan, so a runner that sets them is exactly what the
    # imminent flip makes likely.
    monkeypatch.delenv("DIALECTICAL_EXPANSION_PRIORITY_FLOOR", raising=False)
    monkeypatch.delenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", raising=False)

    assert expansion_priority_floor() == 0.15
    assert expansion_wave_width() == 12


def test_priority_is_impact_times_uncertainty_times_dispersion():
    score_item = {"scores": {"impact": 0.8, "uncertainty": 0.5}, "max_field_spread": 0.4}
    assert abs(frontier_priority(score_item) - (0.8 * 0.5 * 1.4)) < 1e-9


def test_undisputed_node_is_not_penalised_below_its_merit():
    score_item = {"scores": {"impact": 0.8, "uncertainty": 0.5}, "max_field_spread": 0.0}
    assert abs(frontier_priority(score_item) - 0.40) < 1e-9


def test_missing_scores_yield_zero_priority():
    assert frontier_priority({}) == 0.0
    assert frontier_priority({"scores": None}) == 0.0
    assert frontier_priority({"scores": {"impact": 0.8}}) == 0.0
    assert frontier_priority({"scores": {"impact": True, "uncertainty": 0.5}}) == 0.0


def test_unreadable_scores_are_none_not_zero_for_the_rankability_aware_form():
    """0.0 cannot express "never measured" -- that is what None is for.

    Every shape here is an item the dispatcher must treat as UNRANKED, so the
    floor cannot refuse it on a merit measurement that never happened.
    """
    assert frontier_priority_or_none(None) is None
    assert frontier_priority_or_none({}) is None
    assert frontier_priority_or_none({"scores": None}) is None
    assert frontier_priority_or_none({"scores": "0.5"}) is None
    assert frontier_priority_or_none({"scores": {"impact": 0.8}}) is None
    assert frontier_priority_or_none({"scores": {"impact": None, "uncertainty": 0.5}}) is None
    assert frontier_priority_or_none({"scores": {"impact": "0.8", "uncertainty": 0.5}}) is None
    assert frontier_priority_or_none({"scores": {"impact": True, "uncertainty": 0.5}}) is None
    # A genuine, measured zero is NOT None -- it was read, it is just worthless.
    assert frontier_priority_or_none({"scores": {"impact": 0.0, "uncertainty": 0.5}}) == 0.0


def test_dispatch_orders_by_priority_and_truncates_to_wave_width(
    db, monkeypatch, categorical_decisions_factory
):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "3")
    # Priorities ASCEND in creation order, which is the order the dispatcher
    # walked before this task: first-come-first-served would spend the wave on
    # 0.3/0.5/0.7 and truncate 0.9. Only a real sort produces the assertion
    # below. (The brief's 0.1/0.9/0.5/0.7/0.3 does NOT distinguish the two --
    # it yields the same spawned set either way, so it proves nothing about
    # ordering; verified by disabling the sort.)
    #
    # The per-debate budget default is 6 and the per-node default is 2 (one
    # decision per distinct node here), so nothing below is truncated by a
    # budget -- only by the wave width under test.
    debate, records, run_id = categorical_decisions_factory(
        db, priorities=[0.1, 0.3, 0.5, 0.7, 0.9]
    )

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    spawned = [r for r in records if r.dispatch_outcome == "spawned"]
    assert len(spawned) == 3
    assert sorted(r.frontier_priority for r in spawned) == pytest.approx([0.5, 0.7, 0.9])
    assert len(expand_jobs(db, debate.id)) == 3
    # Nobody is silently dropped: the sub-floor record and the record beyond
    # the wave each carry their own honest refusal.
    by_priority = {round(r.frontier_priority, 6): r.dispatch_outcome for r in records}
    assert by_priority[0.1] == OUTCOME_BELOW_PRIORITY_FLOOR
    # The wave's own refusal, NOT budget_exhausted: the per-debate budget is 6
    # and only 3 were spent, so "reached its budget for this debate" would be
    # a false statement about an untouched budget.
    assert by_priority[0.3] == OUTCOME_WAVE_FULL
    assert OUTCOME_BUDGET_EXHAUSTED not in {r.dispatch_outcome for r in records}


def test_below_floor_is_refused_with_an_honest_outcome(
    db, monkeypatch, categorical_decisions_factory
):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.01])

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert records[0].dispatch_outcome == OUTCOME_BELOW_PRIORITY_FLOOR
    assert records[0].child_spawn_count == 0
    assert expand_jobs(db, debate.id) == []
    state = adaptive_expansion_state(db.get(Debate, debate.id))
    assert state["stopped_because"] == STOPPED_BELOW_PRIORITY_FLOOR


def test_unranked_node_is_exempt_from_the_floor_not_refused_by_it(
    db, monkeypatch, categorical_decisions_factory
):
    """Unranked is not low-ranked.

    A decision whose node has no readable item in the latest scoring run has
    no measured merit. Refusing it as ``below_priority_floor`` would assert a
    measurement that was never made -- and would switch adaptive expansion off
    wholesale in any deployment where the item read comes back empty. It keeps
    a NULL priority (honestly "never ranked") and is dispatched exactly as it
    was before this task, still subject to every pre-existing budget.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.5])
    # Strip the run's items: the run still exists and is still complete, it
    # simply says nothing about this node.
    run = db.get(AnalyzerRun, run_id)
    run.output = {**run.output, "items": []}
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert records[0].frontier_priority is None
    assert records[0].dispatch_outcome == "spawned"
    assert len(expand_jobs(db, debate.id)) == 1


def test_item_with_unreadable_scores_is_unranked_not_floored(
    db, monkeypatch, categorical_decisions_factory
):
    """The second door onto the same failure mode as the test above.

    Here the node DOES have an item in its scoring run -- the run just says
    nothing numeric about it (schema drift renaming ``scores``, or a run
    writing nulls). Treating that as a 0.0 merit and refusing it
    ``below_priority_floor`` would floor out every record at once and switch
    adaptive expansion off wholesale, while claiming a measurement that never
    happened.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.5])
    run = db.get(AnalyzerRun, run_id)
    items = [dict(item) for item in run.output["items"]]
    # The item is still here, and still names the node. Only its scores are
    # unreadable.
    items[0]["scores"] = {"impact": None, "uncertainty": None}
    run.output = {**run.output, "items": items}
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert records[0].frontier_priority is None
    assert records[0].dispatch_outcome == "spawned"
    assert len(expand_jobs(db, debate.id)) == 1


def test_scalar_decision_with_top_priority_still_cannot_spawn(
    db, monkeypatch, scalar_decisions_factory
):
    """THE LAW is untouched by ordering."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = scalar_decisions_factory(db, priorities=[0.99])

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert records[0].dispatch_outcome == "annotate_only_scalar_signal"
    assert expand_jobs(db, debate.id) == []


def test_cross_family_spread_promotes_a_node_it_would_otherwise_rank_below(
    db, monkeypatch, categorical_decisions_factory, make_judge_evidence
):
    """The dispersion term is real, not a constant.

    Two nodes with identical impact x uncertainty merit: the one whose judge
    families actually split on a pivotal field ranks first, and with the wave
    narrowed to one it is the one that spawns. The contested node is SECOND in
    creation order, so first-come-first-served would have spawned the other.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.5, 0.5])
    uncontested, contested = records[0], records[1]

    # A two-family panel that disagrees on critic.logical_validity by 0.40,
    # persisted exactly as production persists it (same input_hash, distinct
    # (judge_role, provider, model) identities).
    for judge_role, logical_validity in (("critic", 0.20), ("critic_b", 0.60)):
        evidence = make_judge_evidence(judge_role=judge_role, logical_validity=logical_validity)
        raw_output = f"{judge_role}:{logical_validity}"
        db.add(
            JudgeOutputArtifact(
                debate_id=debate.id,
                node_id=contested.node_id,
                input_hash="frontier-priority-input-hash",
                judge_role=evidence["judge_role"],
                provider=evidence["provider"],
                model=evidence["model"],
                raw_output=raw_output,
                raw_output_sha256=hashlib.sha256(raw_output.encode("utf-8")).hexdigest(),
                parse_status="available",
                assessment=evidence["assessment"],
                checked_at=now_utc(),
            )
        )
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert contested.frontier_priority == pytest.approx(0.5 * 1.40)
    assert uncontested.frontier_priority == pytest.approx(0.5)
    assert contested.dispatch_outcome == "spawned"
    assert uncontested.dispatch_outcome == OUTCOME_WAVE_FULL


def test_ranking_uses_the_decisions_own_run_not_the_latest_one(
    db, monkeypatch, categorical_decisions_factory
):
    """Every audited frontier_priority is derived from the scores that
    GROUNDED its decision.

    The records are selected by ``score_run_id == analyzer_run_id``, so the
    decision's own run is in hand and is what the ranker reads. A NEWER
    complete node_scoring run carrying different scores for the same nodes
    must not touch the ranking -- ranking a decision on numbers it was never
    made from would make the audit trail unfalsifiable.

    This replaces an earlier "latest run resolved by seq" test: that test
    enshrined ranking from a run other than the decision's, which is the
    behaviour being removed here. Reading by primary key has no stale-run
    hazard to resolve in the first place.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "1")
    # The decision's own run ranks `first` above `second`.
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9, 0.2])
    first, second = records

    # A strictly newer, complete node_scoring run that REVERSES the ranking.
    newer = _scoring_run(
        db,
        debate,
        run_id="newer-run-that-must-not-be-consulted",
        created_at=now_utc() + timedelta(hours=1),
        priority_by_node={first.node_id: 0.2, second.node_id: 0.9},
    )
    own_run = db.get(AnalyzerRun, run_id)
    assert newer.seq > own_run.seq and newer.created_at > own_run.created_at

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    # The decision's own run wins on every axis: the recorded priorities are
    # its numbers, and `first` takes the single-slot wave. Had the ranker
    # consulted `newer`, `second` would have spawned and the priorities would
    # be 0.2 / 0.9.
    assert first.frontier_priority == pytest.approx(0.9)
    assert second.frontier_priority == pytest.approx(0.2)
    assert first.dispatch_outcome == "spawned"
    assert second.dispatch_outcome == OUTCOME_WAVE_FULL


def test_ranking_ignores_a_run_of_the_wrong_analyzer_type(
    db, monkeypatch, categorical_decisions_factory
):
    """Defensive: items are only ever read off a complete node_scoring run.

    Anything else leaves every record honestly UNRANKED (NULL, exempt from
    the floor) rather than ranked off some other analyzer's payload.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.5])
    run = db.get(AnalyzerRun, run_id)
    run.analyzer_type = "protocol_analysis"
    db.commit()

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert records[0].frontier_priority is None
    assert records[0].dispatch_outcome == "spawned"


# ---------------------------------------------------------------------------
# P1 Task 7: convergence and wall-clock stop conditions.
#
# smoke4 stopped with converged=false, maxDelta=0.226 against epsilon=0.05 --
# scores still moving at 4.5x the stability threshold when the budget ran out.
# The convergence test existed, ran, and failed, and nothing consumed it.
# ---------------------------------------------------------------------------


def test_one_converged_wave_does_not_stop_the_loop(db, monkeypatch, converged_run_factory):
    """Hysteresis: a single wave under epsilon can be noise."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_id = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    assert stopped_because_of(debate) != "converged"
    # The wave WAS counted -- it just is not enough on its own.
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1


def test_two_consecutive_converged_waves_stop_the_loop(db, monkeypatch, converged_run_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    debate, run_b = converged_run_factory(db, max_delta=0.02, epsilon=0.05, debate=debate)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)

    assert stopped_because_of(debate) == STOPPED_CONVERGED


def test_a_moving_wave_resets_the_converged_counter(db, monkeypatch, converged_run_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    debate, run_b = converged_run_factory(db, max_delta=0.30, epsilon=0.05, debate=debate)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)
    debate, run_c = converged_run_factory(db, max_delta=0.01, epsilon=0.05, debate=debate)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_c)

    assert stopped_because_of(debate) != STOPPED_CONVERGED


def test_replaying_one_wave_does_not_count_it_twice(db, monkeypatch, converged_run_factory):
    """Hysteresis demands two INDEPENDENT observations, not two readings of one.

    ``expansion_dispatch`` is best-effort at its call site and the protocol
    re-run immediately before it is best-effort too -- so a retried
    scoring-completion tail whose protocol re-run failed calls dispatch again
    against the SAME latest protocol run. Counting that run twice would let a
    single settled wave trip a stop condition that exists precisely because one
    wave is not evidence.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_id = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1
    assert stopped_because_of(debate) != STOPPED_CONVERGED


def _rewrite_convergence(db, run_id: str, convergence: dict) -> None:
    """Replace one persisted protocol run's convergence block in place."""
    run = db.get(AnalyzerRun, run_id)
    run.output = {**run.output, "convergence": convergence}
    db.commit()


@pytest.mark.parametrize("reason", ["first_evaluation", "strengths_unavailable"])
def test_an_unmeasurable_wave_neither_counts_nor_resets(
    db, monkeypatch, converged_run_factory, reason
):
    """A wave the protocol runner could not MEASURE is not a wave that moved.

    These are the two branches where the engine failed to measure at all and
    wrote no ``maxDelta``. Treating that silence as "still moving" would reset
    a real hysteresis streak on a run that said nothing; treating it as settled
    would invent a measurement. Contrast the basis-changed reasons below, which
    are positive evidence and DO reset.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)

    debate, run_b = converged_run_factory(db, max_delta=0.01, epsilon=0.05, debate=debate)
    _rewrite_convergence(db, run_b, {"converged": None, "reason": reason, "epsilon": 0.05})
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)

    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1
    assert stopped_because_of(debate) != "converged"


@pytest.mark.parametrize("reason", ["topology_changed", "semantics_changed"])
def test_a_changed_comparison_basis_resets_the_streak(
    db, monkeypatch, converged_run_factory, reason
):
    """REVIEW FINDING 2. A changed basis is evidence, not silence.

    ``topology_changed`` says the graph itself moved between the two runs --
    which IS a further round changing the conclusions. Letting a settled-before
    and a settled-after straddle it would have the stop assert "further rounds
    were no longer changing the conclusions" at the exact moment the engine
    recorded that the graph changed shape. ``semantics_changed`` is the same
    fact about the scoring basis rather than the graph.

    A tree whose shape keeps changing has not converged, and that is precisely
    the case the loop is supposed to keep running on.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1

    debate, run_b = converged_run_factory(db, max_delta=0.01, epsilon=0.05, debate=debate)
    _rewrite_convergence(db, run_b, {"converged": None, "reason": reason, "epsilon": 0.05})
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 0

    # The streak really restarted: the very next settled wave is worth 1, not
    # the 2 that would have stopped the debate had the reset been a no-op.
    debate, run_c = converged_run_factory(db, max_delta=0.01, epsilon=0.05, debate=debate)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_c)
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1
    assert stopped_because_of(debate) != STOPPED_CONVERGED


def test_a_debate_that_never_expanded_is_never_stopped_as_converged(
    db, monkeypatch, converged_run_factory
):
    """REVIEW FINDING 1. The counter counts WAVES, not dispatch passes.

    A debate whose decisions are all non-categorical never spawns, but
    ``run_protocol_analysis`` appends a fresh run on every scoring completion,
    and scoring completions arrive from paths that have nothing to do with
    adaptive expansion (pre-synthesis scoring, cold start, the API). Two such
    passes measure near-zero drift on a tree nobody grew. Counting them would
    annotate the debate "the analysis had settled: further rounds were no
    longer changing the conclusions" when ZERO rounds ever ran -- and would
    overwrite the honest diagnosis the pass would otherwise have recorded.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        STOPPED_CONVERGED,
        STOPPED_QUIESCENT_NO_DECISIONS,
        expansion_dispatch,
        rounds_completed,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.0, epsilon=0.05, expanded=False)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    debate, run_b = converged_run_factory(
        db, max_delta=0.0, epsilon=0.05, debate=debate, expanded=False
    )
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)

    assert rounds_completed(debate) == 0
    assert adaptive_expansion_state(debate).get(CONVERGED_WAVES_KEY, 0) == 0
    assert stopped_because_of(debate) != STOPPED_CONVERGED
    # And the honest diagnosis it would otherwise have recorded survives.
    assert stopped_because_of(debate) == STOPPED_QUIESCENT_NO_DECISIONS


def test_movement_during_a_user_approval_interlude_breaks_the_streak(
    db, monkeypatch, converged_run_factory
):
    """REVIEW ROUND 2. The round guard may gate the increment, never the reset.

    ``rounds_completed`` is advanced only by ``expansion_dispatch``'s own tail,
    never by ``admit_and_spawn`` -- so a debate that keeps growing through the
    user-approval endpoint has a FROZEN round counter while its graph is still
    changing. And the runner will not rescue us with ``topology_changed``:
    ordinary node addition leaves the node-strength key sets overlapping, so
    those readings come back COMPARABLE.

    The interleave below is the residual hole. With the reset gated behind the
    round guard, the moving reading in the middle is swallowed before it ever
    reaches the ``maxDelta`` test -- so the stale pre-interlude count survives,
    combines with the single fresh measurement at the end, reaches 2, and
    stamps ``converged`` on a debate whose graph was demonstrably still moving.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        STOPPED_CONVERGED,
        expansion_dispatch,
        rounds_completed,
        stopped_because_of,
    )

    # 1. A real dispatcher-driven round completes and is counted.
    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1
    frozen_round = rounds_completed(debate)

    # 2. Growth continues by USER APPROVAL only: the round counter is frozen,
    #    the reading is comparable, and it shows real movement.
    debate, run_b = converged_run_factory(
        db, max_delta=0.30, epsilon=0.05, debate=debate, expanded=False
    )
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)
    assert rounds_completed(debate) == frozen_round
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 0

    # 3. The dispatcher resumes and produces ONE settled measurement. That is
    #    one fresh observation, not two -- the streak restarted at the movement.
    debate, run_c = converged_run_factory(db, max_delta=0.01, epsilon=0.05, debate=debate)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_c)

    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1
    assert stopped_because_of(debate) != STOPPED_CONVERGED


def test_a_repeated_reading_of_a_moving_run_still_resets(
    db, monkeypatch, converged_run_factory
):
    """The reset is ungated on the run id too, not just on the round.

    A retried scoring tail can hand the dispatcher the same latest run twice.
    The run-id guard exists to stop counting one wave twice; suppressing a
    RESET on the same grounds would let observed movement go unrecorded purely
    because it had been seen before.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        expansion_dispatch,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1

    # The SAME run re-read after being rewritten to show movement.
    _rewrite_convergence(
        db, run_a, {"converged": False, "maxDelta": 0.30, "epsilon": 0.05}
    )
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)

    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 0


def test_two_readings_with_no_expansion_between_them_count_as_one_wave(
    db, monkeypatch, converged_run_factory
):
    """REVIEW FINDING 1, the partial case: growth happens, then stalls.

    One real expansion round happened, so the first reading is a real wave. The
    second protocol run comes from a scoring completion with no expansion round
    between the two -- a second reading of one state, not a second wave. The
    ``run_id`` guard alone does not catch this: the run ids differ.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        CONVERGED_WAVES_KEY,
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_a)
    debate, run_b = converged_run_factory(
        db, max_delta=0.01, epsilon=0.05, debate=debate, expanded=False
    )
    assert run_a != run_b
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_b)

    assert adaptive_expansion_state(debate)[CONVERGED_WAVES_KEY] == 1
    assert stopped_because_of(debate) != STOPPED_CONVERGED


def _age_growth_clock(db, debate, *, days: int) -> None:
    """Backdate the debate's GROWTH clock, as if it had been growing that long."""
    from app.exploration.expansion_dispatch import (
        ADAPTIVE_EXPANSION_CONFIG_KEY,
        GROWTH_STARTED_AT_KEY,
        adaptive_expansion_state,
    )

    state = adaptive_expansion_state(debate)
    state[GROWTH_STARTED_AT_KEY] = (now_utc() - timedelta(days=days)).isoformat()
    debate.config = {**(debate.config or {}), ADAPTIVE_EXPANSION_CONFIG_KEY: state}
    db.commit()


def test_wall_clock_ceiling_stops_expansion(db, monkeypatch, categorical_decisions_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS", "1")
    from app.exploration.expansion_dispatch import (
        OUTCOME_WALL_CLOCK,
        STOPPED_WALL_CLOCK,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    _age_growth_clock(db, debate, days=365)

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert stopped_because_of(debate) == STOPPED_WALL_CLOCK
    assert all(r.dispatch_outcome != "spawned" for r in records)
    assert expand_jobs(db, debate.id) == []
    # Nobody is silently dropped: the early return still annotates every
    # record it declined to consider (binding: every refusal is annotated on
    # the audited record).
    assert all(r.dispatch_outcome == OUTCOME_WALL_CLOCK for r in records)


def test_a_stop_never_overwrites_an_outcome_a_pass_already_earned(
    db, monkeypatch, categorical_decisions_factory
):
    """The stop annotation fills NULLs; it never rewrites recorded history.

    A record that really did spawn on an earlier pass keeps ``spawned``. Saying
    "wall_clock" over it would make the audit trail claim the expansion never
    happened, while the job it queued is sitting in the table.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        OUTCOME_SPAWNED,
        STOPPED_WALL_CLOCK,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)
    db.expire_all()
    assert records[0].dispatch_outcome == OUTCOME_SPAWNED

    monkeypatch.setenv("DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS", "1")
    _age_growth_clock(db, db.get(Debate, debate.id), days=365)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert stopped_because_of(debate) == STOPPED_WALL_CLOCK
    assert records[0].dispatch_outcome == OUTCOME_SPAWNED


def test_the_created_at_fallback_reads_the_naive_utc_timestamp_sqlite_hands_back(db):
    """VERIFIED EMPIRICALLY, not assumed: ``Debate.created_at`` comes back
    timezone-NAIVE.

    ``now_utc()`` is tz-AWARE and the column is declared
    ``DateTime(timezone=True)``, but SQLAlchemy's SQLite DATETIME drops the
    offset on the way in and never restores it on the way out (the stored text
    is the UTC wall clock with no zone). Subtracting the two directly raises
    ``TypeError: can't subtract offset-naive and offset-aware datetimes`` --
    which, on the wall-clock gate, would take down EVERY dispatch pass. The
    assertion on ``tzinfo`` below is the load-bearing one: it pins the fact
    that makes the normalisation necessary, so a driver change that starts
    returning aware datetimes fails here loudly rather than silently.

    The tolerance is tight enough to catch the other half of the bug: reading
    the naive stamp as LOCAL time instead of UTC would answer a whole timezone
    offset here, not ~0.
    """
    from app.exploration.expansion_dispatch import (
        growth_clock_started_at,
        growth_elapsed_seconds,
    )

    debate = Debate(topic="timezone probe")
    db.add(debate)
    db.commit()

    assert growth_clock_started_at(debate) is None  # no stamp -> the fallback
    assert debate.created_at.tzinfo is None
    assert growth_elapsed_seconds(debate) == pytest.approx(0.0, abs=60)


def test_the_growth_stamp_round_trips_through_json_as_an_aware_utc_instant(db):
    """The other clock source, verified rather than assumed (review finding 3).

    ``growth_started_at`` is a string in a JSON column, so unlike ``created_at``
    it round-trips byte-for-byte and ``fromisoformat`` hands back an AWARE
    datetime. Both forms therefore really do occur in this one subtraction,
    which is why the normalisation has to accept either -- and why this is
    pinned rather than assumed from the fact that we wrote the value ourselves.
    """
    from app.exploration.expansion_dispatch import (
        ADAPTIVE_EXPANSION_CONFIG_KEY,
        GROWTH_STARTED_AT_KEY,
        growth_clock_started_at,
        growth_elapsed_seconds,
    )

    debate = Debate(
        topic="growth clock probe",
        config={
            ADAPTIVE_EXPANSION_CONFIG_KEY: {
                GROWTH_STARTED_AT_KEY: (now_utc() - timedelta(hours=3)).isoformat()
            }
        },
    )
    db.add(debate)
    db.commit()
    db.expire_all()
    debate = db.get(Debate, debate.id)

    stamped = growth_clock_started_at(debate)
    assert stamped is not None and stamped.tzinfo is not None
    assert growth_elapsed_seconds(debate) == pytest.approx(3 * 60 * 60, abs=60)


def test_a_corrupt_growth_stamp_degrades_to_created_at_rather_than_raising(db):
    """The gate runs first in every dispatch pass; it may not raise."""
    from app.exploration.expansion_dispatch import (
        ADAPTIVE_EXPANSION_CONFIG_KEY,
        GROWTH_STARTED_AT_KEY,
        growth_clock_started_at,
        growth_elapsed_seconds,
    )

    for corrupt in ("not-a-timestamp", "", 12345, None):
        debate = Debate(
            topic="corrupt stamp probe",
            config={ADAPTIVE_EXPANSION_CONFIG_KEY: {GROWTH_STARTED_AT_KEY: corrupt}},
        )
        db.add(debate)
        db.commit()
        assert growth_clock_started_at(debate) is None
        assert growth_elapsed_seconds(debate) == pytest.approx(0.0, abs=60)


def test_a_young_debate_is_not_stopped_by_the_wall_clock(db, monkeypatch, converged_run_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_WALL_CLOCK,
        debate_wall_clock_seconds,
        expansion_dispatch,
        stopped_because_of,
    )

    assert debate_wall_clock_seconds() == 4 * 60 * 60
    debate, run_id = converged_run_factory(db, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    assert stopped_because_of(debate) != STOPPED_WALL_CLOCK


def test_flag_flip_does_not_instantly_kill_debates_older_than_the_ceiling(
    db, monkeypatch, categorical_decisions_factory
):
    """REVIEW FINDING 3, project-owner ruling: measure from the first flag-on pass.

    The ceiling bounds how long a debate may keep GROWING, not the age of its
    row. Measuring total debate age would mean that on the day the flag is
    flipped, every pre-existing debate in production is already years past four
    hours, and its first dispatch pass stamps ``wall_clock`` before adaptive
    expansion does a single thing. This debate's row is two years old and its
    first flag-on pass must still do real work.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_WALL_CLOCK,
        expansion_dispatch,
        growth_clock_started_at,
        stopped_because_of,
    )

    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    debate.created_at = now_utc() - timedelta(days=730)
    db.commit()
    assert growth_clock_started_at(debate) is None

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    assert stopped_because_of(debate) != STOPPED_WALL_CLOCK
    # It did real work rather than being stopped on arrival.
    assert records[0].dispatch_outcome == "spawned"
    # And the growth clock is now running, from this pass rather than from the
    # row's birthday.
    started = growth_clock_started_at(db.get(Debate, debate.id))
    assert started is not None
    assert (now_utc() - started).total_seconds() == pytest.approx(0.0, abs=60)


def test_the_growth_clock_is_stamped_once_and_never_moves(
    db, monkeypatch, categorical_decisions_factory
):
    """A clock restamped on every pass would never expire."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        expansion_dispatch,
        growth_clock_started_at,
    )

    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9])
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)
    first = growth_clock_started_at(db.get(Debate, debate.id))
    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    assert growth_clock_started_at(db.get(Debate, debate.id)) == first


def test_both_new_stop_reasons_have_human_copy(db):
    """A raw code must never reach the product surface."""
    from app.exploration.expansion_dispatch import STOPPED_CONVERGED, STOPPED_WALL_CLOCK
    from app.exploration.reason_copy import DEFAULT_REASON_HUMAN_COPY, humanize_reason

    for code in (STOPPED_CONVERGED, STOPPED_WALL_CLOCK):
        copy = humanize_reason(code)
        assert copy and copy != code
        assert copy != DEFAULT_REASON_HUMAN_COPY


def _scoring_run(db, debate, *, run_id, created_at, priority_by_node):
    from test_node_scoring import explicit_depth_pressure_payload

    run = AnalyzerRun(
        id=run_id,
        created_at=created_at,
        debate_id=debate.id,
        branch_id=first_branch(db, debate.id).id,
        analyzer_type="node_scoring",
        output={
            "status": "available",
            "items": [
                explicit_depth_pressure_payload(
                    node_id=node_id, impact=priority, uncertainty=1.0
                ).model_dump(mode="json")
                for node_id, priority in priority_by_node.items()
            ],
        },
        status="complete",
        provenance={"scoring_source": "judge_outputs"},
    )
    next_analyzer_run_seq(db, run)
    db.commit()
    return run


# ---------------------------------------------------------------------------
# FW1 (I6): the per-record budget re-read.
#
# debate_expand_jobs() is a FULL SCAN of the debate's v2_expand rows, and it
# sat inside the per-record loop -- one scan per dispatchable record. With
# ~100 dispatchable records that is ~100 scans per pass x 12 passes, against
# SQLite's single writer: the same shape P1 Task 2 exists to eliminate.
#
# The re-read is REQUIRED, and stays: queue_v2_expand_job commits N times, so
# budgets derived from anything but committed rows could overspawn on a
# mid-loop retry. What was not required is re-reading when NOTHING CHANGED.
# Spawns are capped at the wave width (12), so the count now tracks spawns
# rather than records, with byte-identical budget semantics.
# ---------------------------------------------------------------------------

# The exact SQL debate_expand_jobs emits (a full-column select of one debate's
# jobs of one type). Matched by shape rather than by wrapping the function, so
# a regression that reintroduces the scan by some OTHER route is caught too.
_EXPAND_JOB_SCAN_PREFIX = "SELECT jobs.id, jobs.node_id, jobs.debate_id, jobs.job_type"
_EXPAND_JOB_SCAN_WHERE = "WHERE jobs.debate_id = ? AND jobs.job_type = ?"


def _count_expand_job_scans(db, run) -> int:
    from sqlalchemy import event

    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        statements.append(" ".join(statement.split()))

    event.listen(db.bind, "before_cursor_execute", _record)
    try:
        run()
    finally:
        event.remove(db.bind, "before_cursor_execute", _record)
    return sum(
        1
        for statement in statements
        if statement.startswith(_EXPAND_JOB_SCAN_PREFIX) and _EXPAND_JOB_SCAN_WHERE in statement
    )


def test_budget_rescan_does_not_run_once_per_record_when_nothing_spawns(
    db, monkeypatch, categorical_decisions_factory
):
    """A pass that spawns nothing needs exactly ONE budget read."""
    from app.exploration.expansion_dispatch import (
        ADAPTIVE_EXPANSION_CONFIG_KEY,
        ROUNDS_COMPLETED_KEY,
        expansion_max_rounds,
    )

    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9] * 5)
    # Rounds exhausted -> every record is refused below THE LAW's gate and
    # nothing spawns, so no committed row can change under the loop.
    debate.config = {
        **(debate.config or {}),
        ADAPTIVE_EXPANSION_CONFIG_KEY: {ROUNDS_COMPLETED_KEY: expansion_max_rounds()},
    }
    db.commit()
    debate_id = debate.id
    # Same guard as test_dialectical_v2's statement-count test: every row here
    # was written through THIS session moments ago, so a warm identity map can
    # silently absorb reads that production would issue. Evict it (expiring is
    # not enough -- db.get short-circuits on a present-but-expired instance)
    # so the instrumented window measures a genuinely cold session.
    db.expunge_all()

    scans = _count_expand_job_scans(
        db, lambda: expansion_dispatch(db, debate_id=debate_id, analyzer_run_id=run_id)
    )

    assert scans == 1, f"expected 1 budget scan for a non-spawning pass, got {scans}"


def test_budget_rescan_tracks_spawns_not_records(
    db, monkeypatch, categorical_decisions_factory
):
    """With 5 dispatchable records and a wave width of 1 the loop spawns once.

    The count must follow the SPAWN (1 initial read + 1 re-read after the
    committed row landed = 2), not the record count (5, which is what the
    per-record re-read cost). This is the assertion that fails if the re-read
    drifts back inside the loop head.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.9] * 5)
    debate_id = debate.id
    # Plain ids before the eviction below -- a detached instance cannot be
    # asked for its id afterwards.
    record_type = type(records[0])
    record_ids = [record.id for record in records]
    db.expunge_all()

    scans = _count_expand_job_scans(
        db, lambda: expansion_dispatch(db, debate_id=debate_id, analyzer_run_id=run_id)
    )

    db.expire_all()
    # The behaviour is unchanged -- one spawn, four honest wave_full refusals.
    outcomes = [db.get(record_type, record_id).dispatch_outcome for record_id in record_ids]
    assert outcomes.count("spawned") == 1
    assert outcomes.count(OUTCOME_WAVE_FULL) == 4
    assert scans == 2, f"expected 2 budget scans (1 + 1 spawn), got {scans}"
