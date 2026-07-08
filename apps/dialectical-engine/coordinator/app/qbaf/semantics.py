from __future__ import annotations

from dataclasses import replace
from typing import Iterable, Protocol

from app.qbaf.dfquad import mediating_function as _canonical_mediating_function
from app.qbaf.dfquad import probabilistic_sum as _canonical_probabilistic_sum
from app.qbaf.model import Edge, QBAFGraph, require_unit_interval


class Semantics(Protocol):
    name: str

    def propagate(self, graph: QBAFGraph) -> QBAFGraph:
        """Return a graph with propagated node strengths."""
        ...


def probabilistic_sum(values: Iterable[float]) -> float:
    """Validated wrapper over the canonical DF-QuAD aggregation in dfquad.py."""
    validated = [require_unit_interval(float(value), "strength") for value in values]
    return _canonical_probabilistic_sum(validated)


def combine_df_quad(base_score: float, attacker_strength: float, supporter_strength: float) -> float:
    """Validated wrapper over the canonical DF-QuAD mediating function in dfquad.py."""
    base = require_unit_interval(float(base_score), "base_score")
    attackers = require_unit_interval(float(attacker_strength), "attacker_strength")
    supporters = require_unit_interval(float(supporter_strength), "supporter_strength")
    return _canonical_mediating_function(base, attackers, supporters)


class DFQuADSemantics:
    name = "df-quad"

    def propagate(self, graph: QBAFGraph) -> QBAFGraph:
        incoming_edges = self._incoming_edges(graph)
        strengths: dict[str, float] = {}
        visiting: set[str] = set()

        def compute(node_id: str) -> float:
            if node_id in strengths:
                return strengths[node_id]
            if node_id in visiting:
                raise ValueError(f"cycle detected in QBAF graph at node {node_id}")

            visiting.add(node_id)
            try:
                supporting_strengths = []
                attacking_strengths = []
                for edge in incoming_edges[node_id]:
                    weighted_strength = edge.weight * compute(edge.source_id)
                    if edge.polarity == "support":
                        supporting_strengths.append(weighted_strength)
                    else:
                        attacking_strengths.append(weighted_strength)

                node = graph.nodes[node_id]
                strength = combine_df_quad(
                    node.base_score,
                    probabilistic_sum(attacking_strengths),
                    probabilistic_sum(supporting_strengths),
                )
                strengths[node_id] = strength
                return strength
            finally:
                visiting.discard(node_id)

        for node_id in graph.nodes:
            compute(node_id)

        return QBAFGraph(
            root_id=graph.root_id,
            nodes={
                node_id: replace(node, final_strength=strengths[node_id])
                for node_id, node in graph.nodes.items()
            },
            edges=list(graph.edges),
        )

    @staticmethod
    def _incoming_edges(graph: QBAFGraph) -> dict[str, list[Edge]]:
        """Group incoming edges per target with duplicate handling.

        Duplicate identity = (source_id, target_id, polarity). Exact
        duplicates (same weight) collapse to one edge; the same identity with
        conflicting weights is ambiguous input and raises ValueError.
        """
        seen: dict[tuple[str, str, str], float] = {}
        incoming_edges: dict[str, list[Edge]] = {node_id: [] for node_id in graph.nodes}
        for edge in graph.edges:
            key = (edge.source_id, edge.target_id, edge.polarity)
            if key in seen:
                if seen[key] != edge.weight:
                    raise ValueError(
                        "conflicting duplicate edge weights for "
                        f"{edge.source_id!r}->{edge.target_id!r} ({edge.polarity}): "
                        f"{seen[key]!r} vs {edge.weight!r}"
                    )
                continue
            seen[key] = edge.weight
            incoming_edges[edge.target_id].append(edge)
        return incoming_edges
