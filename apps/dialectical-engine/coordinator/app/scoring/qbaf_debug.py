"""ORM boundary glue for the debug-only DF-QuAD debate graph view.

Converts live Node rows + a scoring payload's items into plain dicts, calls
the pure app.qbaf.debate_adapter/dfquad code, and shapes the result for
attachment to debate_scoring_payload. Never raises: any failure becomes an
honest {"unavailable_reason": ...} block instead of crashing scoring.
"""
from __future__ import annotations

import os
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Debate, Node
from app.qbaf.debate_adapter import debate_argument_graph
from app.qbaf.semantics_versions import DEFAULT_SEMANTICS

SEMANTICS_VERSION = DEFAULT_SEMANTICS


def _debate_node_rows(db: Session, debate_id: str) -> list[dict]:
    # Mirrors _debate_node_ids' filter/order (app/scoring/service.py:1811),
    # including its T2 (P0.5) failed-only exclusion (deliberately NOT
    # path_status=="abandoned" -- see that function's comment: an abandoned-
    # but-complete node must stay scoreable so the exploration-policy
    # reopen lifecycle stays reachable), but selects the extra columns
    # (parent_id, node_type) the adapter needs. No existing "full node
    # rows" helper was found in service.py -- every call site there only
    # needs bare node ids -- so this is a minimal, local query rather than
    # a shared helper.
    rows = db.scalars(
        select(Node)
        .where(
            Node.debate_id == debate_id,
            Node.status != "stale",
            Node.status != "failed",
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


def _evidence_verifications_for_debug(db: Session, debate_id: str) -> dict[str, dict[str, Any]]:
    """Task 12 (P1.3): the same verified-evidence data the real
    protocol_analysis path feeds into debate_argument_graph, so this debug
    view's edges/taus match production instead of silently omitting them.

    Deliberately its OWN try/except, separate from qbaf_debug_block's outer
    one: this enrichment is optional and must degrade to "no evidence
    edges" on failure (e.g. a caller-supplied `db` that can't run a real
    query, as the existing semantics-env test does) without marking the
    WHOLE debug block unavailable -- a genuine qbaf computation failure
    (cyclic graph, etc.) is a different, real failure that SHOULD still
    report unavailable_reason.

    Imports app.evidence.verification_evaluator LOCALLY (not at module
    level): that module transitively imports app.scoring.service (via
    app.evidence.lifecycle_input_repository -> app.exploration.* ->
    app.scoring.models -> app.scoring.__init__), which itself imports
    app.scoring.qbaf_debug (this module, for qbaf_debug_block) -- a
    module-level import here would close that cycle and make a cold
    `import app.evidence.verification_evaluator` fail with "cannot import
    name ... from partially initialized module" depending on which module
    happens to be imported first (confirmed by direct reproduction). Same
    established pattern this codebase already uses elsewhere for the same
    reason (e.g. app.services.orchestrator's many function-scoped imports).
    """
    from app.evidence.verification_evaluator import latest_evidence_verdicts_for_debate

    try:
        verified = latest_evidence_verdicts_for_debate(db, debate_id)
    except Exception:  # noqa: BLE001 - optional enrichment, never blocks the debug view
        return {}
    return {
        evidence_node_id: {"status": verdict["status"], "base_score": verdict["base_score"]}
        for evidence_node_id, verdict in verified.items()
    }


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
        evidence_verifications = _evidence_verifications_for_debug(db, debate.id)
        adapted = debate_argument_graph(
            nodes, scores, semantics=semantics, evidence_verifications=evidence_verifications
        )
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
