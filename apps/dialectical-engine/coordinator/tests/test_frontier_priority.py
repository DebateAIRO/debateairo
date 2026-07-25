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

import pytest
from sqlalchemy import select

from app.exploration.expansion_dispatch import (
    OUTCOME_BELOW_PRIORITY_FLOOR,
    STOPPED_BELOW_PRIORITY_FLOOR,
    adaptive_expansion_state,
    expansion_dispatch,
    expansion_priority_floor,
    expansion_wave_width,
    frontier_priority,
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


def test_defaults():
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
    assert by_priority[0.3] == "budget_exhausted"


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
    assert uncontested.dispatch_outcome == "budget_exhausted"


def test_same_created_at_tick_resolved_by_seq_at_frontier_ranking_site(
    db, monkeypatch, categorical_decisions_factory
):
    """Fourth "latest AnalyzerRun" read site (see AnalyzerRun.seq on the model
    and tests/test_analyzer_run_seq.py for the other three).

    ``_score_items_by_node`` reads the latest complete node_scoring run to
    rank the frontier. ``id`` is a random UUID4 and ``created_at`` is coarse
    wall-clock, and same-tick runs are routine under incremental scoring, so
    ordering on ``(created_at DESC, id DESC)`` alone would read a stale run
    and rank the wrong nodes. Two runs are crafted here with an IDENTICAL
    created_at and ids chosen so ``id DESC`` alone picks the OLDER one.
    """
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "1")
    debate, records, run_id = categorical_decisions_factory(db, priorities=[0.5, 0.5])
    first, second = records

    frozen = now_utc()
    stale = _scoring_run(
        db,
        debate,
        run_id="id-zzzzzzzz-older-but-lexicographically-last",
        created_at=frozen,
        priority_by_node={first.node_id: 0.9, second.node_id: 0.1},
    )
    fresh = _scoring_run(
        db,
        debate,
        run_id="id-aaaaaaaa-newer-but-lexicographically-first",
        created_at=frozen,
        priority_by_node={first.node_id: 0.1, second.node_id: 0.9},
    )
    # Pre-fix ambiguity check, so this is a provable repro rather than an
    # assertion of the new behaviour: created_at is tied, and id DESC alone
    # ranks the stale run first.
    assert stale.created_at == fresh.created_at
    assert max(stale.id, fresh.id) == stale.id
    assert fresh.seq > stale.seq

    expansion_dispatch(db, debate_id=debate.id, analyzer_run_id=run_id)

    db.expire_all()
    # seq wins: the FRESH run's ranking is used, so `second` (0.9 there, 0.1
    # in the stale run) takes the single-slot wave. Under the superseded
    # (created_at, id) ordering `first` would have spawned instead.
    assert second.frontier_priority == pytest.approx(0.9)
    assert second.dispatch_outcome == "spawned"
    assert first.frontier_priority == pytest.approx(0.1)
    assert first.dispatch_outcome == OUTCOME_BELOW_PRIORITY_FLOOR


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
