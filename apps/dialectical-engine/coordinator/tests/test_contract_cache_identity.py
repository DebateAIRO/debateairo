from __future__ import annotations

from sqlalchemy import select
from app.models.entities import Debate, Node, NodeScoringResult
from app.scoring.cache import (
    lookup_scoring_cache,
    lookup_stale_scoring_cache_metadata,
    store_scoring_cache,
)
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE, JudgeContract

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


def test_store_under_new_contract_creates_new_row_and_preserves_old(db) -> None:
    """Cache rows are immutable per contract: a re-score under a changed judge
    contract must create a NEW row, never overwrite the old contract's row."""
    debate_id, node_id = _seed_debate_node(db)
    contract_a = PRIMARY_NODE_SCORING_JUDGE
    contract_b = JudgeContract(
        judge_id=contract_a.judge_id,
        judge_version="v2-test",
        role=contract_a.role,
        rubric_version=contract_a.rubric_version,
        prompt_version=contract_a.prompt_version,
        schema_version=contract_a.schema_version,
        reducer_version=contract_a.reducer_version,
    )
    assert contract_a.contract_hash != contract_b.contract_hash

    common = dict(
        debate_id=debate_id,
        node_id=node_id,
        input_hash="hash-immutability",
        judge_role="judge",
        provider="codex",
        model="model-a",
        provider_metadata={},
        status="available",
    )
    row_a = store_scoring_cache(db, result={"score": "A"}, contract=contract_a, **common)
    db.commit()
    row_b = store_scoring_cache(db, result={"score": "B"}, contract=contract_b, **common)
    db.commit()

    assert row_a.id != row_b.id, "second contract overwrote the first contract's row"
    db.expire_all()
    rows = db.scalars(
        select(NodeScoringResult).where(
            NodeScoringResult.debate_id == debate_id,
            NodeScoringResult.node_id == node_id,
            NodeScoringResult.input_hash == "hash-immutability",
        )
    ).all()
    assert len(rows) == 2
    by_hash = {row.contract_hash: row for row in rows}
    assert by_hash[contract_a.contract_hash].result == {"score": "A"}
    assert by_hash[contract_b.contract_hash].result == {"score": "B"}

    # Lookup serves ONLY the requested contract's row.
    hit_b = lookup_scoring_cache(db, contract_hash=contract_b.contract_hash,
                                 **{k: v for k, v in common.items() if k not in ("provider_metadata", "status")})
    assert hit_b == {"score": "B"}
    hit_a = lookup_scoring_cache(db, contract_hash=contract_a.contract_hash,
                                 **{k: v for k, v in common.items() if k not in ("provider_metadata", "status")})
    assert hit_a == {"score": "A"}


def test_store_same_contract_updates_in_place(db) -> None:
    """Within ONE contract, re-storing refreshes the same row (same semantic
    artifact) — no unbounded row growth for identical identity."""
    debate_id, node_id = _seed_debate_node(db)
    common = dict(
        debate_id=debate_id,
        node_id=node_id,
        input_hash="hash-same-contract",
        judge_role="judge",
        provider="codex",
        model="model-a",
        provider_metadata={},
        status="available",
    )
    row_1 = store_scoring_cache(db, result={"score": 1}, contract=PRIMARY_NODE_SCORING_JUDGE, **common)
    db.commit()
    row_2 = store_scoring_cache(db, result={"score": 2}, contract=PRIMARY_NODE_SCORING_JUDGE, **common)
    db.commit()
    assert row_1.id == row_2.id
    db.expire_all()
    rows = db.scalars(
        select(NodeScoringResult).where(NodeScoringResult.input_hash == "hash-same-contract")
    ).all()
    assert len(rows) == 1
    assert rows[0].result == {"score": 2}
