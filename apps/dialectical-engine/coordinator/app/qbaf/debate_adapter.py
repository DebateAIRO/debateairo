"""Pure adapter: plain debate node/score dicts -> ArgumentGraph.

No ORM/network/time/filesystem imports — see test_qbaf_purity.py and
test_debate_graph_adapter.py::test_purity_no_orm_or_network_imports for the
enforced boundary. All DB access lives in app.scoring.qbaf_debug instead.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from app.qbaf.dfquad import ArgumentGraph

DEFAULT_TAU = 0.5

# Edge mapping decision (flagged for Hermes review): POV-lens nodes are
# treated as SUPPORT edges to the root, on the rationale that each POV lens
# aggregates a perspective's sub-arguments in favor of engaging with the
# claim from that angle, rather than attacking or supporting a side. This is
# a default pending product sign-off, not a settled semantic claim.
#
# Vocabulary confirmed via `grep -rn node_type coordinator/app` (2026-07-07):
# ROOT_CLAIM (orchestrator.py, single_shot.py, dialectical_v2.py), PRO/CON
# (orchestrator.py, single_shot.py, dialectical_v2.py), and the four POV
# lenses SCIENTIFIC_POV/STATISTICAL_POV/ETHICAL_POV/PRACTICAL_POV (defined as
# POV_BRANCHES in dialectical_v2.py and V2_POV_ROLES in orchestrator.py).
#
# Phase 7 Task 1 adds EVIDENCE (app/evidence/extraction.py's
# persist_evidence_nodes) to _NO_EDGE_TYPES: evidence children are extracted
# substrings of their parent claim's own prose, not independently-argued
# QBAF support/attack edges -- conservative filtering choice pending P9
# product sign-off on whether/how evidence should ever compose into the
# argument graph.
_SUPPORT_TYPES = {"PRO", "SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}
_ATTACK_TYPES = {"CON"}
_NO_EDGE_TYPES = {"ROOT_CLAIM", "EVIDENCE"}


@dataclass(frozen=True)
class AdaptedDebateGraph:
    graph: ArgumentGraph
    tau_sources: Mapping[str, str]
    fingerprint: str


def _tau_for(node_id: str, scores: Mapping[str, Any]) -> tuple[float, str]:
    item = scores.get(node_id)
    if isinstance(item, dict):
        inner = item.get("scores")
        if isinstance(inner, dict):
            strength = inner.get("strength")
            if isinstance(strength, (int, float)) and not isinstance(strength, bool):
                return float(strength), "judge_strength"
    return DEFAULT_TAU, "default"


def _edge_for(
    node_id: str, parent_id: str | None, node_type: str
) -> tuple[tuple[str, str] | None, str | None]:
    """Returns ((source, target), polarity) or (None, 'unmapped_edge' | None)."""
    if parent_id is None or node_type in _NO_EDGE_TYPES:
        return None, None
    if node_type in _ATTACK_TYPES:
        return (node_id, parent_id), "attack"
    if node_type in _SUPPORT_TYPES:
        return (node_id, parent_id), "support"
    return None, "unmapped_edge"


def debate_argument_graph(
    nodes: Sequence[Mapping[str, Any]], scores: Mapping[str, Any]
) -> AdaptedDebateGraph:
    """Build an ArgumentGraph + provenance from plain node/score dicts.

    nodes: sequence of {"id", "parent_id", "node_type"} plain dicts (no ORM).
    scores: mapping of node_id -> scoring-item-dict (as validated/public
        scoring items), or {} when no scores are available yet.
    """
    base_scores: dict[str, float] = {}
    tau_sources: dict[str, str] = {}
    attacks: list[tuple[str, str]] = []
    supports: list[tuple[str, str]] = []
    fingerprint_rows: list[tuple[str, str, str, str]] = []

    for node in nodes:
        node_id = str(node["id"])
        parent_id = node.get("parent_id")
        node_type = str(node["node_type"])

        tau, tau_source = _tau_for(node_id, scores)
        base_scores[node_id] = tau
        tau_sources[node_id] = tau_source

        edge, polarity = _edge_for(node_id, parent_id, node_type)
        if polarity == "unmapped_edge":
            tau_sources[f"{node_id}__edge"] = "unmapped_edge"
        elif polarity == "attack" and edge is not None:
            attacks.append(edge)
        elif polarity == "support" and edge is not None:
            supports.append(edge)

        fingerprint_rows.append((node_id, str(parent_id or ""), node_type, f"{tau:.6f}"))

    graph = ArgumentGraph(base_scores=base_scores, attacks=attacks, supports=supports)

    digest = hashlib.sha256()
    for row in sorted(fingerprint_rows):
        digest.update("|".join(row).encode("utf-8"))
        digest.update(b"\n")

    return AdaptedDebateGraph(graph=graph, tau_sources=tau_sources, fingerprint=digest.hexdigest())
