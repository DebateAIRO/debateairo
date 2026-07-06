"""Pure DF-QuAD (Discontinuity-Free Quantitative Argumentation Debate) core.

Semantics per:
  Rago, Toni, Aurisicchio, Baroni. "Discontinuity-Free Decision Support with
  Quantitative Argumentation Debates." KR 2016.

This module is intentionally independent of ``app.qbaf.model``/
``app.qbaf.semantics``: it operates on plain node ids and unweighted
attack/support edge tuples, and computes strengths iteratively (Kahn's
topological sort) rather than recursively. It is pure stdlib: no
SQLAlchemy/httpx/FastAPI/provider/worker imports, no filesystem, network,
time, or randomness access. See ``coordinator/tests/test_qbaf_purity.py``
for the repo-wide enforcement of this boundary across ``app/qbaf/*``.

DF-QuAD aggregation function (probabilistic sum, "alpha" in the paper):
    agg([]) = 0
    agg(v1, v2, ..., vn) = 1 - prod(1 - vi for vi in [v1..vn])

DF-QuAD mediating function ("sigma" in the paper), given a node's base
score tau, aggregated attacker strength v_a, and aggregated supporter
strength v_s:
    sigma(tau, v_a, v_s) = tau - tau * (v_a - v_s)       if v_a >= v_s
    sigma(tau, v_a, v_s) = tau + (1 - tau) * (v_s - v_a) otherwise

DF-QuAD's own semantics assume the argument graph is acyclic; this
implementation enforces that explicitly (``CyclicGraphError``) rather than
silently producing a partial or non-terminating result.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Mapping, Sequence


class CyclicGraphError(ValueError):
    """Raised when the attack+support edge union contains a cycle.

    DF-QuAD's mediating/aggregation equations are only well-defined over an
    acyclic argument graph (each node's strength depends only on its
    predecessors' already-computed strengths). v1 forbids cycles outright
    rather than attempting any approximate/iterative fixed-point resolution.
    """


def _probabilistic_sum(values: Sequence[float]) -> float:
    """DF-QuAD aggregation function (alpha): probabilistic sum.

    agg([]) = 0; agg(v1..vn) = 1 - prod(1 - vi).
    """
    aggregate = 0.0
    for value in values:
        aggregate = 1 - (1 - aggregate) * (1 - value)
    return aggregate


def _mediating_function(tau: float, attacker_strength: float, supporter_strength: float) -> float:
    """DF-QuAD mediating function (sigma)."""
    if attacker_strength >= supporter_strength:
        return tau - tau * (attacker_strength - supporter_strength)
    return tau + (1 - tau) * (supporter_strength - attacker_strength)


@dataclass(frozen=True)
class ArgumentGraph:
    """A minimal quantitative bipolar argumentation framework for DF-QuAD.

    Attributes:
        base_scores: node id -> base score (tau), each in [0, 1].
        attacks: sequence of (attacker_id, target_id) edges.
        supports: sequence of (supporter_id, target_id) edges.
    """

    base_scores: Mapping[str, float]
    attacks: Sequence[tuple[str, str]]
    supports: Sequence[tuple[str, str]]

    def _validate(self) -> None:
        for node_id, tau in self.base_scores.items():
            if not (0.0 <= tau <= 1.0):
                raise ValueError(f"base score for {node_id!r} must be in [0, 1], got {tau!r}")

        known_nodes = set(self.base_scores)
        for kind, edges in (("attack", self.attacks), ("support", self.supports)):
            for source_id, target_id in edges:
                if source_id not in known_nodes:
                    raise ValueError(f"unknown {kind} edge endpoint {source_id!r}")
                if target_id not in known_nodes:
                    raise ValueError(f"unknown {kind} edge endpoint {target_id!r}")

    def _topological_order(self) -> list[str]:
        """Iterative Kahn's-algorithm topological sort over attack+support edges."""
        known_nodes = list(self.base_scores)
        in_degree: dict[str, int] = {node_id: 0 for node_id in known_nodes}
        successors: dict[str, list[str]] = {node_id: [] for node_id in known_nodes}

        all_edges = list(self.attacks) + list(self.supports)
        for source_id, target_id in all_edges:
            successors[source_id].append(target_id)
            in_degree[target_id] += 1

        queue: deque[str] = deque(node_id for node_id in known_nodes if in_degree[node_id] == 0)
        order: list[str] = []

        while queue:
            node_id = queue.popleft()
            order.append(node_id)
            for successor_id in successors[node_id]:
                in_degree[successor_id] -= 1
                if in_degree[successor_id] == 0:
                    queue.append(successor_id)

        if len(order) != len(known_nodes):
            raise CyclicGraphError(
                "ArgumentGraph contains a cycle in its attack+support edges; "
                "DF-QuAD v1 requires an acyclic graph"
            )
        return order

    def compute_strengths(self) -> dict[str, float]:
        """Compute DF-QuAD final strengths for every node, in topological order."""
        self._validate()
        order = self._topological_order()

        incoming_attackers: dict[str, list[str]] = {node_id: [] for node_id in self.base_scores}
        incoming_supporters: dict[str, list[str]] = {node_id: [] for node_id in self.base_scores}
        for source_id, target_id in self.attacks:
            incoming_attackers[target_id].append(source_id)
        for source_id, target_id in self.supports:
            incoming_supporters[target_id].append(source_id)

        strengths: dict[str, float] = {}
        for node_id in order:
            attacker_strength = _probabilistic_sum(
                [strengths[attacker_id] for attacker_id in incoming_attackers[node_id]]
            )
            supporter_strength = _probabilistic_sum(
                [strengths[supporter_id] for supporter_id in incoming_supporters[node_id]]
            )
            tau = self.base_scores[node_id]
            strengths[node_id] = _mediating_function(tau, attacker_strength, supporter_strength)

        return strengths
