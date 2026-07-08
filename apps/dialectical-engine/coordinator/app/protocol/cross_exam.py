"""Deterministic cross-examination analysis for the epistemic protocol's Phase 5.4.

Pure, read-only analysis over EXISTING data: current node topology + the
latest persisted node-scoring payload + already-persisted judge disagreements.
No LLM/provider calls, no new nodes, no new jobs. Attack-node (counterargument)
generation remains the job of the existing manual-challenge machinery — this
module only identifies, for each scored claim, its strongest already-existing
opposing (CON) child (if any) and surfaces that claim's persisted judge
disagreements. It does not create arguments and does not decide who "won".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

CROSS_EXAM_VERSION = "cross-exam-v1"

# Node types treated as "opposing pressure" against a parent claim. Confirmed
# against app/models/entities.py's Node.node_type vocabulary (ROOT_CLAIM, PRO,
# CON, SCIENTIFIC_POV, STATISTICAL_POV, ETHICAL_POV, PRACTICAL_POV): "CON" is
# the exact opposing/attack type.
_OPPOSING_NODE_TYPES = {"CON"}


@dataclass(frozen=True)
class CrossExamReport:
    entries: list[dict[str, Any]] = field(default_factory=list)
    version: str = CROSS_EXAM_VERSION

    def entries_by_claim_id(self) -> dict[str, dict[str, Any]]:
        return {entry["claimId"]: entry for entry in self.entries}

    def to_dict(self) -> dict[str, Any]:
        return {"entries": self.entries, "version": self.version}


def _strength(scoring_by_node_id: dict[str, dict], node_id: str) -> float | None:
    item = scoring_by_node_id.get(node_id)
    if not item:
        return None
    scores = item.get("scores") or {}
    value = scores.get("strength")
    return float(value) if isinstance(value, (int, float)) else None


def cross_examine(
    nodes: list[dict[str, Any]],
    scoring_items: list[dict[str, Any]],
    disagreements: dict[str, list[dict]] | None = None,
) -> CrossExamReport:
    """Build a deterministic cross-examination report.

    `nodes`: plain dicts with at least `id`, `parent_id`, `node_type`.
    `scoring_items`: plain dicts shaped like the public scoring payload's
    `"items"` entries (`node_id`, `scores.strength`, `judge_disagreements`).
    `disagreements`: optional override map of node_id -> list of disagreement
    dicts, for callers that computed disagreements separately from
    `scoring_items`; when omitted, each item's own `judge_disagreements` list
    is used.
    """
    scoring_by_node_id = {item["node_id"]: item for item in scoring_items if item.get("node_id")}
    children_by_parent: dict[str, list[dict]] = {}
    for node in nodes:
        parent_id = node.get("parent_id")
        if parent_id:
            children_by_parent.setdefault(parent_id, []).append(node)

    entries: list[dict[str, Any]] = []
    for node in nodes:
        node_id = node.get("id")
        if node_id not in scoring_by_node_id:
            continue  # only report on claims that have actually been scored

        opposing_children = [
            child for child in children_by_parent.get(node_id, [])
            if child.get("node_type") in _OPPOSING_NODE_TYPES and child.get("id") in scoring_by_node_id
        ]

        strongest_counter_id: str | None = None
        counter_strength: float | None = None
        if opposing_children:
            # Higher strength on the CON child == stronger counter-pressure
            # against the parent claim; break ties by node id for
            # determinism.
            scored_children = sorted(
                opposing_children,
                key=lambda child: (
                    -(_strength(scoring_by_node_id, child["id"]) or 0.0),
                    child["id"],
                ),
            )
            best_child = scored_children[0]
            strongest_counter_id = best_child["id"]
            counter_strength = _strength(scoring_by_node_id, best_child["id"])

        if disagreements is not None:
            judge_disagreements = list(disagreements.get(node_id, []))
        else:
            judge_disagreements = list(scoring_by_node_id[node_id].get("judge_disagreements") or [])

        entries.append({
            "claimId": node_id,
            "strongestCounterId": strongest_counter_id,
            "counterStrength": counter_strength,
            "judgeDisagreements": judge_disagreements,
            "unopposed": strongest_counter_id is None,
        })

    entries.sort(key=lambda entry: entry["claimId"])
    return CrossExamReport(entries=entries, version=CROSS_EXAM_VERSION)
