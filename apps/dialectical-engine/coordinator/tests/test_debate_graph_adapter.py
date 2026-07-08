from __future__ import annotations

import ast
from pathlib import Path

import pytest

from app.qbaf.debate_adapter import AdaptedDebateGraph, debate_argument_graph
from app.qbaf.dfquad import CyclicGraphError
from test_qbaf_purity import (
    FORBIDDEN_CALLS,
    FORBIDDEN_MODULE_PREFIXES,
    matches_forbidden_module,
)

ADAPTER_PATH = Path(__file__).resolve().parents[1] / "app" / "qbaf" / "debate_adapter.py"


def _node(id_, parent_id, node_type):
    return {"id": id_, "parent_id": parent_id, "node_type": node_type}


def test_purity_no_orm_or_network_imports():
    """debate_adapter.py must never import ORM/network/time — mirrors
    test_qbaf_purity.py's enforcement style for the rest of app/qbaf (it lives
    under app/qbaf/ so the repo-wide sweep already covers it; this test
    reuses the exact same forbidden-prefix table for a fast, local signal)."""
    tree = ast.parse(ADAPTER_PATH.read_text())
    offenders: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules = [node.module]
        else:
            continue
        for module in imported_modules:
            if module == "app.qbaf" or module.startswith("app.qbaf."):
                continue
            if any(
                matches_forbidden_module(module, prefix)
                for prefix in FORBIDDEN_MODULE_PREFIXES
            ):
                offenders.append(module)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in FORBIDDEN_CALLS:
                offenders.append(f"call:{node.func.id}")
    assert offenders == []


def test_root_has_no_edge_and_default_tau():
    nodes = [_node("root", None, "ROOT_CLAIM")]
    adapted = debate_argument_graph(nodes, {})
    assert adapted.graph.attacks == ()
    assert adapted.graph.supports == ()
    assert adapted.graph.base_scores["root"] == 0.5
    assert adapted.tau_sources["root"] == "default"


def test_pro_child_supports_parent_con_child_attacks_parent():
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pro1", "root", "PRO"),
        _node("con1", "root", "CON"),
    ]
    adapted = debate_argument_graph(nodes, {})
    assert ("pro1", "root") in adapted.graph.supports
    assert ("con1", "root") in adapted.graph.attacks
    assert ("pro1", "root") not in adapted.graph.attacks
    assert ("con1", "root") not in adapted.graph.supports


@pytest.mark.parametrize(
    "pov_type",
    ["SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"],
)
def test_pov_lens_node_supports_root(pov_type):
    nodes = [_node("root", None, "ROOT_CLAIM"), _node("pov1", "root", pov_type)]
    adapted = debate_argument_graph(nodes, {})
    assert ("pov1", "root") in adapted.graph.supports
    assert ("pov1", "root") not in adapted.graph.attacks


def test_evidence_node_type_has_no_edge_and_default_tau():
    """Phase 7 Task 1: EVIDENCE children (extracted substrings of their
    parent claim's own prose) are not yet QBAF argument edges -- conservative
    filtering choice, same treatment as ROOT_CLAIM."""
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pro1", "root", "PRO"),
        _node("evidence1", "pro1", "EVIDENCE"),
    ]
    adapted = debate_argument_graph(nodes, {})
    assert ("evidence1", "pro1") not in adapted.graph.supports
    assert ("evidence1", "pro1") not in adapted.graph.attacks
    assert adapted.graph.base_scores["evidence1"] == 0.5
    assert adapted.tau_sources["evidence1"] == "default"
    # EVIDENCE is in _NO_EDGE_TYPES, so no "unmapped_edge" marker either --
    # distinguishing "deliberately no edge" from "unrecognized node_type".
    assert f"evidence1__edge" not in adapted.tau_sources


def test_unknown_node_type_has_no_edge_and_is_recorded():
    nodes = [_node("root", None, "ROOT_CLAIM"), _node("mystery", "root", "SOMETHING_NEW")]
    adapted = debate_argument_graph(nodes, {})
    assert ("mystery", "root") not in adapted.graph.supports
    assert ("mystery", "root") not in adapted.graph.attacks
    assert adapted.tau_sources["mystery__edge"] == "unmapped_edge"


def test_tau_from_judge_strength_when_present():
    nodes = [_node("root", None, "ROOT_CLAIM"), _node("pro1", "root", "PRO")]
    scores = {"pro1": {"scores": {"strength": 0.83}}}
    adapted = debate_argument_graph(nodes, scores)
    assert adapted.graph.base_scores["pro1"] == 0.83
    assert adapted.tau_sources["pro1"] == "judge_strength"


def test_tau_defaults_when_score_missing():
    nodes = [_node("root", None, "ROOT_CLAIM"), _node("pro1", "root", "PRO")]
    adapted = debate_argument_graph(nodes, {})
    assert adapted.graph.base_scores["pro1"] == 0.5
    assert adapted.tau_sources["pro1"] == "default"


def test_fingerprint_stable_for_same_input_order_independent():
    nodes_a = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pro1", "root", "PRO"),
        _node("con1", "root", "CON"),
    ]
    nodes_b = list(reversed(nodes_a))
    scores = {"pro1": {"scores": {"strength": 0.7}}}
    fp_a = debate_argument_graph(nodes_a, scores).fingerprint
    fp_b = debate_argument_graph(nodes_b, scores).fingerprint
    assert fp_a == fp_b


def test_fingerprint_changes_when_tau_changes():
    nodes = [_node("root", None, "ROOT_CLAIM"), _node("pro1", "root", "PRO")]
    fp_default = debate_argument_graph(nodes, {}).fingerprint
    fp_scored = debate_argument_graph(nodes, {"pro1": {"scores": {"strength": 0.9}}}).fingerprint
    assert fp_default != fp_scored


def test_cyclic_graph_error_passes_through():
    """A malformed parent chain that creates a cycle in the edge union must
    surface CyclicGraphError from compute_strengths(), not be silently fixed
    by the adapter — the adapter maps edges; it does not validate acyclicity."""
    nodes = [
        _node("a", "b", "PRO"),
        _node("b", "a", "PRO"),
    ]
    adapted = debate_argument_graph(nodes, {})
    with pytest.raises(CyclicGraphError):
        adapted.graph.compute_strengths()
