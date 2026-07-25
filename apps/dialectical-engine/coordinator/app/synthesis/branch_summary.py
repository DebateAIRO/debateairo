"""Bounded synthesis payload (P1 Task 3).

The v2 synthesis prompt previously serialised EVERY node with its full
argument text (dialectical_v2.py, pre-P1) -- O(total nodes x argument
length) with no cap. At frontier budgets that is several hundred nodes and
it fails at the last step of a multi-hour run.

The payload is now O(branches + K):
  - one bounded summary per POV branch
  - the top-K load-bearing nodes in full, ranked by impact x strength
  - the top-C contested nodes in full, ranked by widest cross-family field
    spread, selected BEFORE load-bearing ranking so a contested node never
    loses its slot to a higher impact x strength ordinary node; POV branch
    nodes are excluded, because a branch entry is already their
    representation (see docs/superpowers/specs/
    2026-07-24-contested-frontier-deliberation-design.md section 5.2)
  - an honest omitted_count; nodes are never silently dropped

P1 Task 8 capped the contested term. Task 3 deliberately left it unbounded
-- a contested node is the point of the run and must never be cut for rank
-- and that held only while contested was effectively zero. Task 5 then
measured the live panel: 13 of 26 production nodes are contested at the
chosen per-field threshold, i.e. 50%. At frontier scale (several hundred
nodes) an unbounded contested term re-unbounds the very payload this module
exists to bound, and it fails at the final synthesis step after hours of
compute. So contested is capped too -- ranked by widest field spread so the
most-disagreed nodes survive -- and the remainder is counted honestly into
omitted_count rather than silently dropped.

This module is READ-ONLY: it never opens a write transaction and never
shells out. (The 2026-07-24 nine-hour production wedge came from a stage
holding a SQLite write transaction across a CLI call --
app/scoring/service.py:1137-1159.)
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import int_env
from app.core.oplog import log_event
from app.models.entities import AnalyzerRun, Debate, Generation, Node

LOGGER = logging.getLogger(__name__)

SYNTHESIS_LOAD_BEARING_K = 20

# P1 Task 8: the contested cap. Sized against the measured contested RATE,
# not against a frontier size we hope for: Task 5 measured 13 of 26 live
# nodes contested (50%), so a 400-node frontier carries ~200 contested nodes
# and the uncapped term alone is an order of magnitude over what fits. 30
# keeps the contested section HALF AGAIN LARGER than the load-bearing one
# (SYNTHESIS_LOAD_BEARING_K = 20), so the payload stays deliberately tilted
# toward disagreement, while the total full-text record count stays bounded
# at 50 -- inside the envelope the pre-P1 payload already synthesised at.
SYNTHESIS_CONTESTED_K = 30

# Per-branch summary budget, in characters of CLAIM text (claims, not
# arguments -- full argument prose is what blew the context window, and only
# load-bearing/contested nodes get it). Bounded so the branch section cannot
# grow with subtree size.
BRANCH_SUMMARY_CHAR_BUDGET = 1200


def synthesis_load_bearing_k() -> int:
    return int_env("DIALECTICAL_SYNTHESIS_LOAD_BEARING_K", SYNTHESIS_LOAD_BEARING_K, 5, 100)


def synthesis_contested_k() -> int:
    return int_env("DIALECTICAL_SYNTHESIS_CONTESTED_K", SYNTHESIS_CONTESTED_K, 5, 100)


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


def _is_branch_node(node: Node) -> bool:
    """True for a POV node, i.e. a node the payload represents with its own
    `branches` entry.

    Deliberately the single definition of "is a branch", consumed both by the
    `branches` section and by the contested exclusion below, so the two can
    never drift into disagreeing about which nodes are branches -- which is
    exactly the drift that would re-open the double-counting bug.
    """
    return (node.node_type or "").endswith("_POV")


def _rank_and_cap_contested(
    db: Session, debate: Debate, contested: list[Node], contested_k: int
) -> list[Node]:
    """The `contested_k` widest-disagreed contested nodes (P1 Task 8).

    Ranked by the node's WIDEST cross-family field spread, descending, using
    ``app.scoring.disagreement.field_spreads`` -- the same pure, ungated
    measurement ``app/exploration/expansion_dispatch.py`` ranks the frontier
    with, read off the same per-node judge evidence
    (``latest_judge_evidence_for_node``). Ties break on node id so the cut is
    deterministic.

    A contested node whose panel can no longer be read -- fewer than two
    distinct parseable judgments survive, or the artifacts have aged out --
    scores 0.0 and therefore ranks LAST among contested. That is deliberate:
    it is still contested (the persisted disagreement_status label says so,
    and it keeps its privileged position ahead of every ordinary node), but
    with no measurable spread there is nothing to argue it should outrank a
    node whose disagreement we can still see. It can also be reached by a
    node marked contested under the historical composite gate, which never
    recorded a per-field spread at all.

    The spread reads happen ONLY when the cap actually binds: they cost one
    query per contested node, and when everything fits, the ranking cannot
    change which nodes appear -- just their order within a section that is
    carried whole. Under the cap the payload keeps its
    materialized_path-ordered listing; over it, spread-descending order.

    Read-only, like the rest of this module: no write transaction, no CLI.

    FW2 P1.6: this is the second of the two N+1 sites on the frontier path
    (``expansion_dispatch._score_items_by_node`` is the other), and it was
    equally unmeasured. It emits ``synthesis.contested_rank`` with
    ``duration_ms`` and ``n_nodes`` on BOTH paths, including the early
    return: an operator who greps and finds nothing must be able to conclude
    the code did not run, not that it ran unmeasured. ``capped`` distinguishes
    them -- ``capped=false`` means zero judge-evidence reads happened and the
    duration is the O(1) length check, so a large ``n_nodes`` there is cheap
    and a large one under ``capped=true`` is the thing to suspect.
    """
    started = time.monotonic()

    def _log(capped: bool) -> None:
        log_event(
            LOGGER,
            "synthesis.contested_rank",
            debate_id=debate.id,
            n_nodes=len(contested),
            contested_k=contested_k,
            capped=capped,
            duration_ms=int((time.monotonic() - started) * 1000),
        )

    if len(contested) <= contested_k:
        _log(False)
        return contested

    from app.scoring.disagreement import field_spreads
    from app.scoring.service import latest_judge_evidence_for_node

    widest: dict[str, float] = {}
    for node in contested:
        spreads = field_spreads(
            latest_judge_evidence_for_node(db, debate_id=debate.id, node_id=node.id)
        )
        widest[node.id] = max(spreads.values()) if spreads else 0.0
    ranked = sorted(contested, key=lambda n: (-widest[n.id], n.id))[:contested_k]
    _log(True)
    return ranked


def build_synthesis_tree_payload(
    db: Session, debate: Debate, *, load_bearing_k: int, contested_k: int
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

    # Contested selection runs FIRST and off its own ranking, so a contested
    # node is never displaced by a higher impact x strength ordinary node.
    #
    # BRANCH NODES ARE EXCLUDED. Production scores POV nodes (39 of the 250
    # scored nodes in the live database are `*_POV`, 11 of them already
    # carrying a disagreement_status block), so a contested POV node is a
    # real shape, not a corner case -- and it would otherwise be emitted
    # TWICE: once as its `branches` entry and again as a full contested
    # record. Two costs, one of them silent:
    #   * `represented` is a set, so the duplicate is counted once there
    #     while both section LISTS carry it -- the conservation identity
    #     would read len(nodes) + k for k contested POV nodes, and flip-plan
    #     step 7a asks the operator to verify exactly that identity by hand.
    #   * it burns one of the contested_k slots re-emitting, in full argument
    #     text, a node that already has a section of its own.
    # A POV node is a LENS, not a claim under dispute in this payload's
    # sense; its branch entry is its representation.
    all_contested = [
        n
        for n in nodes
        if not _is_branch_node(n) and _is_contested(scored.get(n.id) or {})
    ]
    all_contested_ids = {n.id for n in all_contested}
    contested_nodes = _rank_and_cap_contested(db, debate, all_contested, contested_k)
    contested_ids = {n.id for n in contested_nodes}

    # Excluded on ALL contested, not just the survivors: a node cut by the
    # contested cap lost on the widest-spread ranking after having had the
    # privileged first pick, and it does not get a second entry through the
    # ordinary impact x strength pool. It lands in omitted_count instead --
    # counted, never silently dropped.
    rankable = [
        n for n in nodes if n.node_type in {"PRO", "CON"} and n.id not in all_contested_ids
    ]
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
        if not _is_branch_node(node):
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

    payload = {
        "branches": branches,
        "load_bearing": [_full(n) for n in load_bearing],
        "contested": [_full(n) for n in contested_nodes],
        "omitted_count": omitted_count,
    }
    # FW2 P1.7: the payload's SHAPE at build time. Two jobs.
    #
    # First, the conservation identity -- branches + load_bearing + contested
    # + omitted_count == n_nodes -- is what flip-plan step 7a asks the
    # operator to verify BY HAND. Emitting all five terms (n_nodes included,
    # which the identity needs and the payload itself does not carry) makes
    # that check mechanical instead of manual, on every build rather than
    # once.
    #
    # Second, total_chars gives the size trend across a long run. This module
    # exists because the pre-P1 payload grew without bound and failed at the
    # LAST step of a multi-hour run; a trend that climbs toward the context
    # window is visible hours before it lands there. It is measured as the
    # JSON-serialised length -- the closest honest proxy for what the prompt
    # carries, and bounded work because the payload is bounded by
    # construction (<= load_bearing_k + contested_k full records).
    log_event(
        LOGGER,
        "synthesis.payload_shape",
        debate_id=debate.id,
        n_nodes=len(nodes),
        branches=len(branches),
        load_bearing=len(load_bearing),
        contested=len(contested_nodes),
        omitted_count=omitted_count,
        total_chars=len(json.dumps(payload, default=str)),
    )
    return payload
