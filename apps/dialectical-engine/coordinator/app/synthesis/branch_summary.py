"""Bounded synthesis payload (P1 Task 3).

The v2 synthesis prompt previously serialised EVERY node with its full
argument text (dialectical_v2.py, pre-P1) -- O(total nodes x argument
length) with no cap. At frontier budgets that is several hundred nodes and
it fails at the last step of a multi-hour run.

The payload is now O(branches + K):
  - one bounded summary per POV branch
  - the top-K load-bearing nodes in full, ranked by impact x strength
  - every contested node in full, regardless of rank (a contested node is
    the point of the run -- see docs/superpowers/specs/
    2026-07-24-contested-frontier-deliberation-design.md section 5.2)
  - an honest omitted_count; nodes are never silently dropped

This module is READ-ONLY: it never opens a write transaction and never
shells out. (The 2026-07-24 nine-hour production wedge came from a stage
holding a SQLite write transaction across a CLI call --
app/scoring/service.py:1137-1159.)
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import int_env
from app.models.entities import AnalyzerRun, Debate, Generation, Node

SYNTHESIS_LOAD_BEARING_K = 20

# Per-branch summary budget, in characters of CLAIM text (claims, not
# arguments -- full argument prose is what blew the context window, and only
# load-bearing/contested nodes get it). Bounded so the branch section cannot
# grow with subtree size.
BRANCH_SUMMARY_CHAR_BUDGET = 1200


def synthesis_load_bearing_k() -> int:
    return int_env("DIALECTICAL_SYNTHESIS_LOAD_BEARING_K", SYNTHESIS_LOAD_BEARING_K, 5, 100)


def _scored_items(db: Session, debate: Debate) -> dict[str, dict[str, Any]]:
    """Latest persisted node_scoring items, keyed by node id.

    Returns {} when no scoring run exists, which degrades the payload to
    branch summaries only -- honest, not fatal.

    Ordering is (seq, created_at, id) descending -- byte-identical to the
    canonical latest-AnalyzerRun read site (app/scoring/service.py:158-167).
    Phase 11 Task 1 established seq as the PRIMARY sort key at every such
    site: `id` is a random UUID4 and `created_at` is coarse wall-clock, so
    two runs written in the same tick cannot be ordered without it. That
    matters here because incremental scoring fires on every branch
    completion, so same-tick scoring runs are routine -- without seq this
    could silently read a STALE run's scores and rank the wrong nodes as
    load-bearing.
    """
    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "node_scoring",
            AnalyzerRun.status == "complete",
        )
        .order_by(
            AnalyzerRun.seq.desc(),
            AnalyzerRun.created_at.desc(),
            AnalyzerRun.id.desc(),
        )
        .limit(1)
    ).first()
    output = getattr(run, "output", None)
    if not isinstance(output, dict):
        return {}
    items = output.get("items")
    if not isinstance(items, list):
        return {}
    return {
        str(item.get("node_id")): item
        for item in items
        if isinstance(item, dict) and item.get("node_id")
    }


def _is_contested(item: dict[str, Any]) -> bool:
    """True when the persisted scoring item carries a cross-judge
    disagreement. Mirrors the exact nesting app/scoring/service.py:1386
    writes: score_provenance["disagreement_status"]["status"] == "present".
    """
    provenance = item.get("score_provenance")
    if not isinstance(provenance, dict):
        return False
    status = provenance.get("disagreement_status")
    return isinstance(status, dict) and status.get("status") == "present"


def build_synthesis_tree_payload(
    db: Session, debate: Debate, *, load_bearing_k: int
) -> dict[str, Any]:
    nodes = list(
        db.scalars(
            select(Node)
            .where(Node.debate_id == debate.id)
            .order_by(Node.materialized_path.asc())
        ).all()
    )
    scored = _scored_items(db, debate)

    generations: dict[str, str] = {}
    generation_ids = [n.active_generation_id for n in nodes if n.active_generation_id]
    if generation_ids:
        for generation in db.scalars(
            select(Generation).where(Generation.id.in_(generation_ids))
        ).all():
            generations[generation.id] = generation.argument or ""

    def _argument(node: Node) -> str:
        return generations.get(node.active_generation_id or "", "")

    def _score(node: Node, field: str) -> float:
        item = scored.get(node.id) or {}
        scores = item.get("scores")
        value = scores.get(field) if isinstance(scores, dict) else None
        return float(value) if isinstance(value, (int, float)) else 0.0

    contested_nodes = [n for n in nodes if _is_contested(scored.get(n.id) or {})]
    contested_ids = {n.id for n in contested_nodes}

    rankable = [n for n in nodes if n.node_type in {"PRO", "CON"} and n.id not in contested_ids]
    rankable.sort(key=lambda n: (-(_score(n, "impact") * _score(n, "strength")), n.id))
    load_bearing = rankable[:load_bearing_k]
    load_bearing_ids = {n.id for n in load_bearing}

    def _full(node: Node) -> dict[str, Any]:
        return {
            "node_id": node.id,
            "parent_id": node.parent_id,
            "node_type": node.node_type,
            "depth": node.depth,
            "claim": node.claim,
            "argument": _argument(node),
            "impact": _score(node, "impact"),
            "strength": _score(node, "strength"),
        }

    branches = []
    for node in nodes:
        if not (node.node_type or "").endswith("_POV"):
            continue
        prefix = node.materialized_path or ""
        # Inclusive of the POV node itself (its own path is a prefix of
        # itself), so subtree_size counts the branch root + its descendants.
        subtree = [n for n in nodes if (n.materialized_path or "").startswith(prefix)]
        pieces: list[str] = []
        used = 0
        for child in subtree:
            text = (child.claim or "").strip()
            if not text:
                continue
            if used + len(text) > BRANCH_SUMMARY_CHAR_BUDGET:
                break
            pieces.append(text)
            used += len(text)
        branches.append(
            {
                "node_id": node.id,
                "lens": node.claim,
                "node_type": node.node_type,
                "subtree_size": len(subtree),
                "summary": " | ".join(pieces),
            }
        )

    represented = load_bearing_ids | contested_ids | {b["node_id"] for b in branches}
    omitted_count = len([n for n in nodes if n.id not in represented])

    return {
        "branches": branches,
        "load_bearing": [_full(n) for n in load_bearing],
        "contested": [_full(n) for n in contested_nodes],
        "omitted_count": omitted_count,
    }
