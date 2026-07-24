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


def test_expansion_depth_limit_default_is_ten():
    assert expansion_depth_limit() == 10


def test_queue_v2_expand_job_refuses_beyond_depth_limit(db):
    debate, node = _v2_debate_with_complete_node(db)
    node.depth = expansion_depth_limit()
    db.flush()

    with pytest.raises(ValueError, match="depth limit"):
        queue_v2_expand_job(db, debate, node, "CON", "probe", "")


def test_queue_v2_expand_job_allows_one_below_the_limit(db):
    debate, node = _v2_debate_with_complete_node(db)
    node.depth = expansion_depth_limit() - 1
    db.flush()

    job = queue_v2_expand_job(db, debate, node, "CON", "probe", "")

    assert job is not None
    child = db.scalars(select(Node).where(Node.parent_id == node.id)).first()
    assert child is not None
    assert child.depth == expansion_depth_limit()
