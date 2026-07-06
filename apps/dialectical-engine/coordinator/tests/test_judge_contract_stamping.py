from __future__ import annotations

from app.models.entities import Debate, Node
from app.scoring.cache import store_scoring_cache
from app.scoring.judge_registry import PRIMARY_NODE_SCORING_JUDGE


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


def test_store_scoring_cache_stamps_contract_identity(db) -> None:
    debate_id, node_id = _seed_debate_node(db)
    row = store_scoring_cache(
        db,
        debate_id=debate_id,
        node_id=node_id,
        input_hash="hash-1",
        judge_role="judge",
        provider="codex",
        model="model-a",
        provider_metadata={},
        status="available",
        result={"ok": True},
        contract=PRIMARY_NODE_SCORING_JUDGE,
    )
    assert row.judge_id == "node_scoring.primary"
    assert row.judge_version == "v1"
    assert row.contract_hash == PRIMARY_NODE_SCORING_JUDGE.contract_hash


def test_store_scoring_cache_without_contract_leaves_identity_null(db) -> None:
    debate_id, node_id = _seed_debate_node(db)
    row = store_scoring_cache(
        db,
        debate_id=debate_id,
        node_id=node_id,
        input_hash="hash-2",
        judge_role="judge",
        provider="codex",
        model="model-a",
        provider_metadata={},
        status="available",
        result={"ok": True},
    )
    assert row.judge_id is None and row.contract_hash is None
