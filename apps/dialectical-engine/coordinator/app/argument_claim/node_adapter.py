from __future__ import annotations

from app.argument_claim.model import ArgumentClaim
from app.models.entities import Node


def argument_claim_from_node(node: Node) -> ArgumentClaim:
    return ArgumentClaim(
        id=node.id,
        debate_id=node.debate_id,
        parent_id=node.parent_id,
        node_type=node.node_type,
        depth=node.depth,
        position=node.position,
        text=node.claim,
        status=node.status,
        materialized_path=node.materialized_path,
        active_generation_id=node.active_generation_id,
    )
