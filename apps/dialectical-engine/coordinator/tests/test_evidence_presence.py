from __future__ import annotations

from app.evidence.presence import evidence_presence
from app.models.entities import Node


def _node(*, node_type: str, claim: str) -> Node:
    return Node(
        debate_id="debate-id",
        parent_id=None,
        node_type=node_type,
        depth=0,
        position=0,
        claim=claim,
        status="complete",
        materialized_path="0",
    )


def test_rollup_none_when_debate_has_no_evidence_nodes() -> None:
    nodes = [
        _node(node_type="ROOT_CLAIM", claim="Should cities ban cars?"),
        _node(node_type="PRO", claim="Fewer cars would reduce street danger."),
    ]

    assert evidence_presence(nodes) == "none"


def test_rollup_extracted_when_any_evidence_node_with_claim() -> None:
    nodes = [
        _node(node_type="EVIDENCE", claim="A transport study reported fewer collisions."),
        _node(node_type="CON", claim="Some commuters lack alternatives."),
    ]

    assert evidence_presence(nodes) == "extracted_unresolved"


def test_blank_claim_evidence_nodes_do_not_count() -> None:
    nodes = [
        _node(node_type="EVIDENCE", claim=""),
        _node(node_type="EVIDENCE", claim="   \t\n"),
    ]

    assert evidence_presence(nodes) == "none"
