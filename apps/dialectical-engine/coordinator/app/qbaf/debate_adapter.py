"""Pure adapter: plain debate node/score dicts -> ArgumentGraph.

No ORM/network/time/filesystem imports — see test_qbaf_purity.py and
test_debate_graph_adapter.py::test_purity_no_orm_or_network_imports for the
enforced boundary. All DB access lives in app.scoring.qbaf_debug instead.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import AbstractSet, Any, Mapping, Sequence

from app.qbaf.dfquad import ArgumentGraph
from app.qbaf.semantics_versions import (
    DEFAULT_SEMANTICS,
    SEMANTICS_V2_LENS_LIFT,
    resolve_semantics,
)

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
# Phase 7 Task 1 added EVIDENCE (app/evidence/extraction.py's
# persist_evidence_nodes) to _NO_EDGE_TYPES: evidence children are extracted
# substrings of their parent claim's own prose, not independently-argued
# QBAF support/attack edges -- conservative filtering choice pending
# verification. Task 12 (P1.3) narrows that: an EVIDENCE node with an
# ELIGIBLE verifier verdict (see `evidence_verifications` on
# `debate_argument_graph`) now gets a real edge; ROOT_CLAIM remains
# unconditionally no-edge. See `_evidence_verdict_tau` below.
_SUPPORT_TYPES = {"PRO", "SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}
_ATTACK_TYPES = {"CON"}
_NO_EDGE_TYPES = {"ROOT_CLAIM"}
_DEFAULT_CONTAINER_TYPES = frozenset(
    {"SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}
)

# Task 12 (P1.3, brief-binding rule 2): the verifier output schema
# (app.scoring.prompts._VERIFIER_OUTPUT_SCHEMA) only ever carries a numeric
# grounded score (evidence.base_score) on the "supported" branch -- the
# schema's own allOf clause REQUIRES the "evidence" object to be ABSENT
# whenever verdict != "supported", so a "contradicted" verdict never carries
# a confidence/score value the verifier itself vouches for. Rather than
# fabricate one, "contradicted" evidence gets this single documented
# constant as its tau: strong enough to register as a real attack, but
# deliberately below 1.0 -- the verifier confirmed contradiction, but gave
# no magnitude for how strongly, so this must never read as maximal
# certainty either.
CONTRADICTED_EVIDENCE_TAU = 0.7

# Tau-source label for an EVIDENCE leaf whose tau came from a real verifier
# verdict (a supported base_score, or CONTRADICTED_EVIDENCE_TAU) rather than
# a judge strength or the bare default -- lets every consumer (tauCoverage,
# convergence, debug views) distinguish "this is a verified evidence signal"
# without re-deriving it from the edge lists.
EVIDENCE_VERIFIER_TAU_SOURCE = "verifier_evidence"

# Brief-binding rule 1: "supported" -> SUPPORT edge, "contradicted" -> ATTACK
# edge; any other status (including "unverifiable"/"pending") maps to no
# entry here, which callers use to mean "no edge -- exactly today's
# behavior".
_EVIDENCE_VERDICT_POLARITY = {"supported": "support", "contradicted": "attack"}


@dataclass(frozen=True)
class AdaptedDebateGraph:
    graph: ArgumentGraph
    tau_sources: Mapping[str, str]
    fingerprint: str
    semantics: str = DEFAULT_SEMANTICS


def _tau_for(node_id: str, scores: Mapping[str, Any]) -> tuple[float, str]:
    item = scores.get(node_id)
    if isinstance(item, dict):
        inner = item.get("scores")
        if isinstance(inner, dict):
            strength = inner.get("strength")
            if isinstance(strength, (int, float)) and not isinstance(strength, bool):
                return float(strength), "judge_strength"
    return DEFAULT_TAU, "default"


def _evidence_verdict_tau(
    node_id: str, evidence_verifications: Mapping[str, Any] | None
) -> tuple[str | None, float | None]:
    """Return (polarity, tau) for an EVIDENCE node's latest verifier verdict.

    (None, None) covers every case that must fall back to the pre-Task-12
    behavior UNCHANGED (brief P1.3 binding rule 1: "unverifiable" or no
    verdict -> no edge, exactly today's behavior): no evidence_verifications
    map at all, this node id absent from it, a status other than
    "supported"/"contradicted", or -- fail closed -- a "supported" entry
    whose base_score is missing/out-of-range/wrong-typed. The verifier
    output schema guarantees base_score when supported, but a corrupted or
    legacy upstream row must never fabricate a tau rather than degrading to
    "no edge"; this mirrors the untrustworthy-data posture
    app.evidence.verification_evaluator.evidence_node_verification_eligible
    already takes on corrupted evidence metadata.
    """
    if not evidence_verifications:
        return None, None
    verdict = evidence_verifications.get(node_id)
    if not isinstance(verdict, Mapping):
        return None, None
    polarity = _EVIDENCE_VERDICT_POLARITY.get(verdict.get("status"))
    if polarity is None:
        return None, None
    if polarity == "attack":
        return polarity, CONTRADICTED_EVIDENCE_TAU
    base_score = verdict.get("base_score")
    if isinstance(base_score, bool) or not isinstance(base_score, (int, float)):
        return None, None
    base_score = float(base_score)
    if not 0.0 <= base_score <= 1.0:
        return None, None
    return polarity, base_score


def _edge_for(
    node_id: str,
    parent_id: str | None,
    node_type: str,
    evidence_polarity: str | None = None,
) -> tuple[tuple[str, str] | None, str | None]:
    """Returns ((source, target), polarity) or (None, 'unmapped_edge' | None)."""
    if parent_id is None:
        return None, None
    if node_type == "EVIDENCE":
        if evidence_polarity is None:
            return None, None
        return (node_id, parent_id), evidence_polarity
    if node_type in _NO_EDGE_TYPES:
        return None, None
    if node_type in _ATTACK_TYPES:
        return (node_id, parent_id), "attack"
    if node_type in _SUPPORT_TYPES:
        return (node_id, parent_id), "support"
    return None, "unmapped_edge"


def _v2_node_class(node_type: str, container_types: AbstractSet[str]) -> str:
    if node_type in container_types:
        return "container"
    if node_type == "EVIDENCE":
        return "no_edge"
    if node_type == "ROOT_CLAIM":
        return "root"
    if node_type == "PRO":
        return "support"
    if node_type == "CON":
        return "attack"
    return "unmapped"


def _v2_effective_parent(
    node_id: str,
    parent_id: Any,
    nodes_by_id: Mapping[str, Mapping[str, Any]],
    container_types: AbstractSet[str],
) -> str | None:
    """Lift a direct container parent to the nearest argumentative ancestor.

    Malformed/missing parent walks fail closed instead of raising. Including
    the source node in ``visited`` also prevents a malformed container cycle
    from manufacturing a self-edge.
    """
    if parent_id is None:
        return None

    visited = {node_id}
    current_parent_id = str(parent_id)
    while True:
        if current_parent_id in visited:
            return None
        visited.add(current_parent_id)

        parent = nodes_by_id.get(current_parent_id)
        if parent is None:
            return None
        parent_type = str(parent["node_type"])
        if _v2_node_class(parent_type, container_types) != "container":
            return current_parent_id

        next_parent_id = parent.get("parent_id")
        if next_parent_id is None:
            return None
        current_parent_id = str(next_parent_id)


def _v2_edge_for(
    node_id: str,
    parent_id: Any,
    node_type: str,
    nodes_by_id: Mapping[str, Mapping[str, Any]],
    container_types: AbstractSet[str],
    evidence_polarity: str | None = None,
) -> tuple[tuple[str, str] | None, str | None]:
    # Task 12 (P1.3): a verified EVIDENCE node's edge target lifts past a
    # container parent exactly like PRO/CON's own _v2_effective_parent walk
    # -- an EVIDENCE node's immediate parent CAN be a POV container, and a
    # verified edge must land on the nearest real argumentative ancestor,
    # never on a "no edge" pass-through container. `_v2_node_class` still
    # classifies EVIDENCE as "no_edge" below (used when evidence_polarity is
    # None -- no verdict, exactly today's behavior).
    if node_type == "EVIDENCE" and evidence_polarity is not None:
        effective_parent = _v2_effective_parent(node_id, parent_id, nodes_by_id, container_types)
        if effective_parent is None:
            return None, "orphaned_parent"
        return (node_id, effective_parent), evidence_polarity

    node_class = _v2_node_class(node_type, container_types)
    if node_class == "container":
        return None, "lens_no_edge"
    if node_class in {"root", "no_edge"}:
        return None, None
    if node_class == "unmapped":
        return None, "unmapped_edge"

    effective_parent = _v2_effective_parent(
        node_id,
        parent_id,
        nodes_by_id,
        container_types,
    )
    if effective_parent is None:
        return None, "orphaned_parent"
    return (node_id, effective_parent), node_class


def debate_argument_graph(
    nodes: Sequence[Mapping[str, Any]],
    scores: Mapping[str, Any],
    *,
    semantics: str = DEFAULT_SEMANTICS,
    container_types: AbstractSet[str] | None = None,
    evidence_verifications: Mapping[str, Mapping[str, Any]] | None = None,
) -> AdaptedDebateGraph:
    """Build an ArgumentGraph + provenance from plain node/score dicts.

    nodes: sequence of {"id", "parent_id", "node_type"} plain dicts (no ORM).
    scores: mapping of node_id -> scoring-item-dict (as validated/public
        scoring items), or {} when no scores are available yet.
    evidence_verifications: Task 12 (P1.3) -- mapping of EVIDENCE node id ->
        {"status": "supported"|"contradicted"|..., "base_score": float|None},
        the latest-per-evidence-node verifier verdict (Task 11 semantics).
        Only "supported"/"contradicted" ever produce an edge (support/attack
        respectively into the node's own parent_id, or the nearest real
        argumentative ancestor under v2 lens-lift semantics); any other
        status, a node id absent from this mapping, or None/{} (the default)
        all mean "no edge" -- byte-identical to pre-Task-12 behavior. See
        `_evidence_verdict_tau`.
    """
    resolved_semantics = resolve_semantics(semantics)
    if resolved_semantics not in {DEFAULT_SEMANTICS, SEMANTICS_V2_LENS_LIFT}:
        raise ValueError(f"Unsupported debate graph semantics: {resolved_semantics!r}")

    is_lens_lift = resolved_semantics == SEMANTICS_V2_LENS_LIFT
    if is_lens_lift:
        resolved_container_types = (
            _DEFAULT_CONTAINER_TYPES
            if container_types is None
            else frozenset(str(node_type) for node_type in container_types)
        )
        nodes_by_id = {str(node["id"]): node for node in nodes}
    else:
        # Keep all v2-only classification and parent-walk setup off the v1 path.
        resolved_container_types = frozenset()
        nodes_by_id = {}

    base_scores: dict[str, float] = {}
    tau_sources: dict[str, str] = {}
    attacks: list[tuple[str, str]] = []
    supports: list[tuple[str, str]] = []
    fingerprint_rows: list[tuple[str, str, str, str]] = []

    for node in nodes:
        node_id = str(node["id"])
        parent_id = node.get("parent_id")
        node_type = str(node["node_type"])

        # Task 12 (P1.3): only ever consult evidence_verifications for
        # EVIDENCE-typed nodes -- a non-EVIDENCE node_id must never have its
        # tau/edge overridden even if it happens to collide with a key in a
        # malformed caller-supplied map.
        evidence_polarity, evidence_tau = (
            _evidence_verdict_tau(node_id, evidence_verifications)
            if node_type == "EVIDENCE"
            else (None, None)
        )

        if evidence_polarity is not None:
            tau, tau_source = evidence_tau, EVIDENCE_VERIFIER_TAU_SOURCE
        else:
            tau, tau_source = _tau_for(node_id, scores)
        base_scores[node_id] = tau
        tau_sources[node_id] = tau_source

        if is_lens_lift:
            edge, polarity = _v2_edge_for(
                node_id,
                parent_id,
                node_type,
                nodes_by_id,
                resolved_container_types,
                evidence_polarity,
            )
        else:
            edge, polarity = _edge_for(node_id, parent_id, node_type, evidence_polarity)

        if polarity in {"unmapped_edge", "lens_no_edge", "orphaned_parent"}:
            tau_sources[f"{node_id}__edge"] = polarity
        elif polarity == "attack" and edge is not None:
            attacks.append(edge)
        elif polarity == "support" and edge is not None:
            supports.append(edge)

        fingerprint_rows.append((node_id, str(parent_id or ""), node_type, f"{tau:.6f}"))

    graph = ArgumentGraph(base_scores=base_scores, attacks=attacks, supports=supports)

    digest = hashlib.sha256()
    if resolved_semantics != DEFAULT_SEMANTICS:
        digest.update(f"semantics|{resolved_semantics}\n".encode("utf-8"))
    for row in sorted(fingerprint_rows):
        digest.update("|".join(row).encode("utf-8"))
        digest.update(b"\n")

    return AdaptedDebateGraph(
        graph=graph,
        tau_sources=tau_sources,
        fingerprint=digest.hexdigest(),
        semantics=resolved_semantics,
    )
