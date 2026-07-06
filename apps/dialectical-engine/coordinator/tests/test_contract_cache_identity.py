from __future__ import annotations

from app.models.entities import Debate, Node
from app.scoring.cache import (
    lookup_scoring_cache,
    lookup_stale_scoring_cache_metadata,
    store_scoring_cache,
)
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE

V1 = PRIMARY_NODE_SCORING_JUDGE
COMMON = dict(input_hash="h1", judge_role="judge", provider="codex", model="model-a")


def _seed_debate_node(db) -> tuple[str, str]:
    debate = Debate(topic="Should companies adopt remote work?", status="complete", config={"max_depth": 1})
    db.add(debate)
    db.flush()
    node = Node(
        debate_id=debate.id,
        parent_id=None,
        node_type="root",
        depth=0,
        position=0,
        claim="Remote work improves productivity.",
        status="complete",
        materialized_path="/",
    )
    db.add(node)
    db.flush()
    debate.root_node_id = node.id
    db.commit()
    return debate.id, node.id


def _store(db, debate_id, node_id, contract):
    row = store_scoring_cache(
        db, debate_id=debate_id, node_id=node_id, provider_metadata={},
        status="available", result={"score": 1}, contract=contract, **COMMON,
    )
    db.commit()
    return row


def test_cache_hit_requires_matching_contract_hash(db) -> None:
    debate_id, node_id = _seed_debate_node(db)
    _store(db, debate_id, node_id, V1)
    hit = lookup_scoring_cache(
        db, debate_id=debate_id, node_id=node_id,
        contract_hash=V1.contract_hash, **COMMON,
    )
    assert hit == {"score": 1}


def test_v1_result_is_not_reused_for_different_contract(db) -> None:
    debate_id, node_id = _seed_debate_node(db)
    _store(db, debate_id, node_id, V1)
    hit = lookup_scoring_cache(
        db, debate_id=debate_id, node_id=node_id,
        contract_hash="different-contract-hash", **COMMON,
    )
    assert hit is None


def test_legacy_null_contract_row_is_not_a_fresh_hit(db) -> None:
    debate_id, node_id = _seed_debate_node(db)
    _store(db, debate_id, node_id, None)  # legacy row
    hit = lookup_scoring_cache(
        db, debate_id=debate_id, node_id=node_id,
        contract_hash=V1.contract_hash, **COMMON,
    )
    assert hit is None


def test_old_contract_row_remains_queryable_and_reports_stale(db) -> None:
    debate_id, node_id = _seed_debate_node(db)
    row = _store(db, debate_id, node_id, None)
    assert row.result == {"score": 1}  # historical row still present, untouched
    stale = lookup_stale_scoring_cache_metadata(
        db, debate_id=debate_id, node_id=node_id,
        contract_hash=V1.contract_hash, **COMMON,
    )
    assert stale == {"reason": "scoring_contract_changed", "refresh_available": True}
