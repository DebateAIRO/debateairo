"""ORM boundary glue for the debug-only DF-QuAD debate graph view.

Converts live Node rows + a scoring payload's items into plain dicts, calls
the pure app.qbaf.debate_adapter/dfquad code, and shapes the result for
attachment to debate_scoring_payload. Never raises: any failure becomes an
honest {"unavailable_reason": ...} block instead of crashing scoring.
"""
from __future__ import annotations

import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Debate, Node
from app.qbaf.debate_adapter import debate_argument_graph
from app.qbaf.semantics_versions import DEFAULT_SEMANTICS

SEMANTICS_VERSION = DEFAULT_SEMANTICS


def _debate_node_rows(db: Session, debate_id: str) -> list[dict]:
    # Mirrors _debate_node_ids' filter/order (app/scoring/service.py:1811),
    # including its T2 (P0.5) failed/abandoned exclusion, but selects the
    # extra columns (parent_id, node_type) the adapter needs. No existing
    # "full node rows" helper was found in service.py -- every call site
    # there only needs bare node ids -- so this is a minimal, local query
    # rather than a shared helper.
    rows = db.scalars(
        select(Node)
        .where(
            Node.debate_id == debate_id,
            Node.status != "stale",
            Node.status != "failed",
            Node.path_status != "abandoned",
        )
        .order_by(Node.materialized_path.asc(), Node.depth.asc(), Node.position.asc(), Node.id.asc())
    ).all()
    return [
        {"id": node.id, "parent_id": node.parent_id, "node_type": node.node_type}
        for node in rows
    ]


def _scores_by_node_id(scoring_payload: dict) -> dict:
    items = scoring_payload.get("items") if isinstance(scoring_payload, dict) else None
    if not isinstance(items, list):
        return {}
    result: dict[str, dict] = {}
    for item in items:
        if isinstance(item, dict) and item.get("node_id"):
            result[item["node_id"]] = item
    return result


def qbaf_debug_block(db: Session, debate: Debate, scoring_payload: dict) -> dict | None:
    """Build the debug-only qbaf strength view for a debate.

    Always returns a dict once called (never None) -- callers decide whether
    to invoke this at all (e.g. behind a debug flag). On any error --
    including CyclicGraphError from an unexpectedly cyclic parent chain --
    returns {"unavailable_reason": str(exc)} and never raises, so this debug
    feature can never affect real scoring.
    """
    try:
        nodes = _debate_node_rows(db, debate.id)
        scores = _scores_by_node_id(scoring_payload)
        semantics = os.getenv("DIALECTICAL_QBAF_DEBUG_SEMANTICS", SEMANTICS_VERSION)
        adapted = debate_argument_graph(nodes, scores, semantics=semantics)
        strengths = adapted.graph.compute_strengths()
        return {
            "fingerprint": adapted.fingerprint,
            "strengths": strengths,
            "tau_sources": dict(adapted.tau_sources),
            "semantics": adapted.semantics,
            "attacks": list(adapted.graph.attacks),
            "supports": list(adapted.graph.supports),
        }
    except Exception as exc:  # noqa: BLE001 - debug feature must never crash scoring
        return {"unavailable_reason": str(exc)}
