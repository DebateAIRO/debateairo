from __future__ import annotations

from app.argument_claim import ArgumentClaim, argument_claim_from_node
from app.models.entities import Node


def test_argument_claim_from_node_preserves_node_row_identity_without_db_rename() -> None:
    node = Node(
        id="node-1",
        debate_id="debate-1",
        parent_id="parent-1",
        node_type="PRO",
        depth=2,
        position=3,
        claim="Public transit reduces household transport costs.",
        status="complete",
        materialized_path="0/1/3",
        active_generation_id="generation-1",
    )

    claim = argument_claim_from_node(node)

    assert claim == ArgumentClaim(
        id="node-1",
        debate_id="debate-1",
        parent_id="parent-1",
        node_type="PRO",
        depth=2,
        position=3,
        text="Public transit reduces household transport costs.",
        status="complete",
        materialized_path="0/1/3",
        active_generation_id="generation-1",
    )


def test_argument_claim_serializes_domain_language_with_legacy_node_aliases() -> None:
    claim = ArgumentClaim(
        id="node-1",
        debate_id="debate-1",
        parent_id=None,
        node_type="ROOT_CLAIM",
        depth=0,
        position=0,
        text="Should cities ban cars?",
        status="complete",
        materialized_path="0",
        active_generation_id=None,
    )

    assert claim.to_node_payload() == {
        "id": "node-1",
        "debate_id": "debate-1",
        "parent_id": None,
        "node_type": "ROOT_CLAIM",
        "depth": 0,
        "position": 0,
        "claim": "Should cities ban cars?",
        "status": "complete",
        "materialized_path": "0",
        "active_generation_id": None,
    }
    assert claim.to_domain_payload() == {
        "id": "node-1",
        "debate_id": "debate-1",
        "parent_id": None,
        "node_type": "ROOT_CLAIM",
        "depth": 0,
        "position": 0,
        "text": "Should cities ban cars?",
        "status": "complete",
        "materialized_path": "0",
        "active_generation_id": None,
    }
