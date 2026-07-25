"""P1 Task 1: hard depth guardrail on v2 expansion.

The v2 pipeline had no depth check at all. With frontier budgets raised to
150 expansions per debate, an unbounded chain is a real shape. This is a
safety rail, not a target: settled branches stop far short of it.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.entities import Node
from app.services.dialectical_v2 import (
    expansion_depth_limit,
    queue_v2_expand_job,
)

from test_v2_expand import argument_children, codex_worker, first_pov_pro, make_v2_debate


def _v2_debate_with_complete_node(db) -> tuple:
    """A v2 debate with every POV completed, plus a completed argument node
    usable as an expansion target.

    No helper of this name exists in tests/test_v2_expand.py -- composed here
    from its real fixtures. first_pov_pro (depth 2) already carries two
    materialized argument children of its own (the nested PRO/CON detail
    nodes materialize_pov_branch creates at depth 3), so it is unsuitable as
    the target here: this module's child-lookup tests assert on "the" child
    of the target node, which only holds for a genuine leaf. One of those
    depth-3 nested nodes IS such a leaf (complete, active_generation_id set,
    zero children of its own) -- use it instead."""
    worker = codex_worker(db)
    debate = make_v2_debate(db, worker)
    pro = first_pov_pro(db, debate)
    node = argument_children(db, pro.id)[0]
    return debate, node


def test_expansion_depth_limit_default_is_ten(monkeypatch):
    # Read the PRODUCTION default, not whatever this machine or CI runner
    # happens to export -- the same discipline as
    # test_budgeted_expansion.test_frontier_budget_defaults. The imminent
    # flip makes a runner that sets this knob likely.
    monkeypatch.delenv("DIALECTICAL_MAX_EXPANSION_DEPTH", raising=False)

    assert expansion_depth_limit() == 10


def test_queue_v2_expand_job_refuses_beyond_depth_limit(db):
    # The literal 10, not expansion_depth_limit(): deriving the input from
    # the function under test makes the assertion self-referential, and a
    # mutation returning 10,000 would satisfy it. The default is pinned
    # independently above.
    debate, node = _v2_debate_with_complete_node(db)
    node.depth = 10
    db.flush()

    with pytest.raises(ValueError, match="depth limit"):
        queue_v2_expand_job(db, debate, node, "CON", "probe", "")


def test_queue_v2_expand_job_allows_one_below_the_limit(db):
    debate, node = _v2_debate_with_complete_node(db)
    node.depth = 9
    db.flush()

    job = queue_v2_expand_job(db, debate, node, "CON", "probe", "")

    assert job is not None
    child = db.scalars(select(Node).where(Node.parent_id == node.id)).first()
    assert child is not None
    assert child.depth == 10


# ---------------------------------------------------------------------------
# FW1 (I4): the DISPATCHER-level refusal. Everything above tests the
# primitive. The dispatcher reached the rail only by catching the primitive's
# ValueError -- a path whose own comment said it "should not fire in
# practice", which stopped being true the moment the primitive gained a depth
# check the dispatcher's admission predicate did not mirror. At 12 rounds
# against a depth-10 rail it fires routinely, and it fired at WARNING while
# annotating target_not_expandable, conflating "at the depth rail" with "the
# node was staled / abandoned / never completed".
# ---------------------------------------------------------------------------


def test_admit_and_spawn_names_the_depth_rail_without_warning(db, caplog) -> None:
    import logging

    from app.exploration import expansion_dispatch as dispatch

    debate, node = _v2_debate_with_complete_node(db)
    node.depth = expansion_depth_limit()
    db.flush()

    with caplog.at_level(logging.WARNING, logger=dispatch.LOGGER.name):
        job, outcome = dispatch.admit_and_spawn(
            db, debate, node, polarity="CON", reason="probe the deepest node"
        )

    assert job is None
    assert outcome == dispatch.OUTCOME_DEPTH_LIMIT
    assert outcome != dispatch.OUTCOME_TARGET_NOT_EXPANDABLE
    # An expected rail is not an anomaly. Logging it at WARNING every pass is
    # what trains an operator to ignore the channel.
    assert caplog.records == []
    # No placeholder child was created -- the primitive was never reached.
    assert db.scalars(select(Node).where(Node.parent_id == node.id)).first() is None


def test_admit_and_spawn_still_allows_one_below_the_depth_limit(db) -> None:
    from app.exploration import expansion_dispatch as dispatch

    debate, node = _v2_debate_with_complete_node(db)
    node.depth = expansion_depth_limit() - 1
    db.flush()

    job, outcome = dispatch.admit_and_spawn(
        db, debate, node, polarity="CON", reason="probe one below the rail"
    )

    assert outcome == dispatch.OUTCOME_SPAWNED
    assert job is not None


def test_depth_rail_is_distinct_from_a_gone_target(db) -> None:
    """The two facts the old code conflated. An abandoned path and a node at
    the depth rail demand different reads of the audit trail."""
    from app.exploration import expansion_dispatch as dispatch

    debate, node = _v2_debate_with_complete_node(db)
    node.depth = 2
    node.path_status = "abandoned"
    db.flush()

    _job, outcome = dispatch.admit_and_spawn(
        db, debate, node, polarity="CON", reason="probe an abandoned node"
    )

    assert outcome == dispatch.OUTCOME_TARGET_NOT_EXPANDABLE
