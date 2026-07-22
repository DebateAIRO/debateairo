from __future__ import annotations

import ast
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.qbaf.debate_adapter import (
    CONTRADICTED_EVIDENCE_TAU,
    EVIDENCE_VERIFIER_TAU_SOURCE,
    AdaptedDebateGraph,
    debate_argument_graph,
)
from app.qbaf.dfquad import CyclicGraphError
from app.qbaf.semantics_versions import DEFAULT_SEMANTICS, SEMANTICS_V2_LENS_LIFT
from app.scoring.qbaf_debug import qbaf_debug_block
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


# ---------------------------------------------------------------------------
# Task 12 (P1.3): verified evidence feeds DF-QuAD. An EVIDENCE node with an
# eligible verifier verdict (supplied via the `evidence_verifications` param,
# keyed by evidence node id) gets a real support/attack edge into its parent
# instead of staying no-edge; "unverifiable"/no verdict/corrupted data all
# fall back to EXACTLY the pre-Task-12 no-edge/default-tau behavior asserted
# above.
# ---------------------------------------------------------------------------


def _evidence_tree(evidence_type="EVIDENCE"):
    return [
        _node("root", None, "ROOT_CLAIM"),
        _node("pro1", "root", "PRO"),
        _node("evidence1", "pro1", evidence_type),
    ]


def test_evidence_supported_verdict_gets_support_edge_and_base_score_tau():
    nodes = _evidence_tree()
    adapted = debate_argument_graph(
        nodes, {}, evidence_verifications={"evidence1": {"status": "supported", "base_score": 0.83}}
    )
    assert ("evidence1", "pro1") in adapted.graph.supports
    assert ("evidence1", "pro1") not in adapted.graph.attacks
    assert adapted.graph.base_scores["evidence1"] == 0.83
    assert adapted.tau_sources["evidence1"] == EVIDENCE_VERIFIER_TAU_SOURCE
    assert "evidence1__edge" not in adapted.tau_sources


def test_evidence_contradicted_verdict_gets_attack_edge_and_constant_tau():
    nodes = _evidence_tree()
    adapted = debate_argument_graph(
        nodes, {}, evidence_verifications={"evidence1": {"status": "contradicted", "base_score": None}}
    )
    assert ("evidence1", "pro1") in adapted.graph.attacks
    assert ("evidence1", "pro1") not in adapted.graph.supports
    assert adapted.graph.base_scores["evidence1"] == CONTRADICTED_EVIDENCE_TAU
    assert CONTRADICTED_EVIDENCE_TAU == 0.7  # brief-documented constant
    assert adapted.tau_sources["evidence1"] == EVIDENCE_VERIFIER_TAU_SOURCE


@pytest.mark.parametrize("status", ["unverifiable", "pending", "something-unmapped"])
def test_evidence_non_actionable_status_has_no_edge(status):
    nodes = _evidence_tree()
    adapted = debate_argument_graph(
        nodes, {}, evidence_verifications={"evidence1": {"status": status, "base_score": 0.9}}
    )
    assert ("evidence1", "pro1") not in adapted.graph.supports
    assert ("evidence1", "pro1") not in adapted.graph.attacks
    assert adapted.graph.base_scores["evidence1"] == 0.5
    assert adapted.tau_sources["evidence1"] == "default"


def test_evidence_absent_from_verifications_map_has_no_edge():
    nodes = _evidence_tree()
    # Map is non-empty (some OTHER evidence node has a verdict) but this
    # node isn't in it -- must behave exactly like "no verdict at all".
    adapted = debate_argument_graph(
        nodes, {}, evidence_verifications={"some-other-node": {"status": "supported", "base_score": 0.9}}
    )
    assert ("evidence1", "pro1") not in adapted.graph.supports
    assert adapted.graph.base_scores["evidence1"] == 0.5
    assert adapted.tau_sources["evidence1"] == "default"


@pytest.mark.parametrize(
    "base_score",
    [None, "0.8", True, -0.01, 1.01, float("nan")],
)
def test_evidence_supported_verdict_with_unusable_base_score_falls_back_to_no_edge(base_score):
    # Brief binding rule 2 says the verifier schema "guarantees" base_score
    # when supported, but a corrupted/legacy upstream row must never
    # fabricate a tau -- fails closed to the pre-Task-12 no-edge behavior,
    # the same untrustworthy-data posture the rest of this codebase takes.
    nodes = _evidence_tree()
    adapted = debate_argument_graph(
        nodes, {}, evidence_verifications={"evidence1": {"status": "supported", "base_score": base_score}}
    )
    assert ("evidence1", "pro1") not in adapted.graph.supports
    assert ("evidence1", "pro1") not in adapted.graph.attacks
    assert adapted.graph.base_scores["evidence1"] == 0.5
    assert adapted.tau_sources["evidence1"] == "default"


def test_evidence_verifications_none_and_empty_dict_and_omitted_are_identical():
    nodes = _evidence_tree()
    omitted = debate_argument_graph(nodes, {})
    none_passed = debate_argument_graph(nodes, {}, evidence_verifications=None)
    empty_passed = debate_argument_graph(nodes, {}, evidence_verifications={})
    assert omitted.fingerprint == none_passed.fingerprint == empty_passed.fingerprint
    assert omitted.tau_sources == none_passed.tau_sources == empty_passed.tau_sources


def test_supported_evidence_raises_parent_strength_vs_no_verdict_baseline():
    nodes = _evidence_tree()
    baseline = debate_argument_graph(nodes, {"pro1": {"scores": {"strength": 0.7}}})
    supported = debate_argument_graph(
        nodes,
        {"pro1": {"scores": {"strength": 0.7}}},
        evidence_verifications={"evidence1": {"status": "supported", "base_score": 0.95}},
    )
    baseline_pro = baseline.graph.compute_strengths()["pro1"]
    supported_pro = supported.graph.compute_strengths()["pro1"]
    assert supported_pro > baseline_pro


def test_contradicted_evidence_lowers_parent_strength_vs_no_verdict_baseline():
    nodes = _evidence_tree()
    baseline = debate_argument_graph(nodes, {"pro1": {"scores": {"strength": 0.7}}})
    contradicted = debate_argument_graph(
        nodes,
        {"pro1": {"scores": {"strength": 0.7}}},
        evidence_verifications={"evidence1": {"status": "contradicted", "base_score": None}},
    )
    baseline_pro = baseline.graph.compute_strengths()["pro1"]
    contradicted_pro = contradicted.graph.compute_strengths()["pro1"]
    assert contradicted_pro < baseline_pro


def test_evidence_fingerprint_changes_when_verdict_edge_appears():
    nodes = _evidence_tree()
    fp_no_verdict = debate_argument_graph(nodes, {}).fingerprint
    fp_supported = debate_argument_graph(
        nodes, {}, evidence_verifications={"evidence1": {"status": "supported", "base_score": 0.6}}
    ).fingerprint
    assert fp_no_verdict != fp_supported


def test_evidence_verdict_edge_deterministic_regardless_of_node_order():
    # Fingerprint hashing sorts its rows internally (see
    # test_fingerprint_stable_for_same_input_order_independent above), so it
    # is order-independent; the raw supports/attacks tuples deliberately
    # preserve input iteration order (pre-existing property, unrelated to
    # Task 12) -- compare edge membership as a set, not tuple equality.
    nodes = _evidence_tree()
    reversed_nodes = list(reversed(nodes))
    verifications = {"evidence1": {"status": "supported", "base_score": 0.6}}
    forward = debate_argument_graph(nodes, {}, evidence_verifications=verifications)
    backward = debate_argument_graph(reversed_nodes, {}, evidence_verifications=verifications)
    assert forward.fingerprint == backward.fingerprint
    assert set(forward.graph.supports) == set(backward.graph.supports)


def test_evidence_verdict_edge_lifted_past_container_under_v2_lens_lift():
    # An EVIDENCE node's immediate parent can itself be a POV container (a
    # v2-lens-lift "no edge" pass-through node) -- a verified evidence edge
    # must lift to the nearest real argumentative ancestor exactly like
    # PRO/CON already do (_v2_effective_parent), not target the container.
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pov", "root", "SCIENTIFIC_POV"),
        _node("evidence1", "pov", "EVIDENCE"),
    ]
    adapted = debate_argument_graph(
        nodes,
        {},
        semantics=SEMANTICS_V2_LENS_LIFT,
        evidence_verifications={"evidence1": {"status": "supported", "base_score": 0.7}},
    )
    assert ("evidence1", "root") in adapted.graph.supports
    edge_endpoints = {endpoint for edge in adapted.graph.supports for endpoint in edge}
    assert "pov" not in edge_endpoints


def test_evidence_verdict_edge_orphaned_parent_fails_closed_under_v2_lens_lift():
    nodes = [
        _node("evidence1", "missing-parent", "EVIDENCE"),
    ]
    adapted = debate_argument_graph(
        nodes,
        {},
        semantics=SEMANTICS_V2_LENS_LIFT,
        evidence_verifications={"evidence1": {"status": "supported", "base_score": 0.7}},
    )
    assert adapted.graph.supports == ()
    assert adapted.graph.attacks == ()
    assert adapted.tau_sources["evidence1__edge"] == "orphaned_parent"
    # The tau override still applies -- only the EDGE fails closed.
    assert adapted.graph.base_scores["evidence1"] == 0.7
    assert adapted.tau_sources["evidence1"] == EVIDENCE_VERIFIER_TAU_SOURCE


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


def _four_pov_nodes():
    return [
        _node("root", None, "ROOT_CLAIM"),
        _node("scientific", "root", "SCIENTIFIC_POV"),
        _node("statistical", "root", "STATISTICAL_POV"),
        _node("ethical", "root", "ETHICAL_POV"),
        _node("practical", "root", "PRACTICAL_POV"),
    ]


def test_lens_lift_golden_no_severed_subtree():
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pov", "root", "SCIENTIFIC_POV"),
        _node("pro1", "pov", "PRO"),
        _node("con1", "pov", "CON"),
        _node("pro2", "con1", "PRO"),
        _node("evidence", "pro2", "EVIDENCE"),
    ]
    scores = {
        "pro1": {"scores": {"strength": 0.5}},
        "con1": {"scores": {"strength": 0.5}},
        "pro2": {"scores": {"strength": 0.9}},
    }

    adapted = debate_argument_graph(nodes, scores, semantics=SEMANTICS_V2_LENS_LIFT)

    assert adapted.graph.supports == (("pro1", "root"), ("pro2", "con1"))
    assert adapted.graph.attacks == (("con1", "root"),)
    edge_endpoints = {
        endpoint
        for edge in adapted.graph.supports + adapted.graph.attacks
        for endpoint in edge
    }
    assert "pov" not in edge_endpoints
    assert "evidence" not in edge_endpoints
    assert adapted.tau_sources["pov__edge"] == "lens_no_edge"
    assert adapted.semantics == SEMANTICS_V2_LENS_LIFT

    low_nested_support = debate_argument_graph(
        nodes,
        {**scores, "pro2": {"scores": {"strength": 0.1}}},
        semantics=SEMANTICS_V2_LENS_LIFT,
    ).graph.compute_strengths()["root"]
    high_nested_support = adapted.graph.compute_strengths()["root"]
    assert high_nested_support < low_nested_support


def test_v1_edges_strengths_fingerprint_identical_when_semantics_omitted():
    adapted = debate_argument_graph(_four_pov_nodes(), {})

    assert adapted.semantics == DEFAULT_SEMANTICS
    assert adapted.graph.supports == (
        ("scientific", "root"),
        ("statistical", "root"),
        ("ethical", "root"),
        ("practical", "root"),
    )
    assert adapted.graph.attacks == ()
    assert adapted.graph.compute_strengths() == {
        "scientific": 0.5,
        "statistical": 0.5,
        "ethical": 0.5,
        "practical": 0.5,
        "root": 0.96875,
    }
    assert adapted.fingerprint == "736a718fd8cbecc13fb91963d3fdf8971324b7443c21ef79c0588c1c0bf3c480"


def test_v2_root_strength_drops_artificial_container_support():
    nodes = _four_pov_nodes()
    v1 = debate_argument_graph(nodes, {})
    v2 = debate_argument_graph(nodes, {}, semantics=SEMANTICS_V2_LENS_LIFT)

    assert v2.graph.supports == ()
    assert v2.graph.attacks == ()
    assert v2.graph.compute_strengths()["root"] == 0.5
    assert v2.graph.compute_strengths()["root"] < v1.graph.compute_strengths()["root"]


def test_v2_fingerprint_differs_from_v1_for_same_nodes():
    nodes = _four_pov_nodes()

    v1 = debate_argument_graph(nodes, {})
    v2 = debate_argument_graph(nodes, {}, semantics=SEMANTICS_V2_LENS_LIFT)

    assert v2.fingerprint != v1.fingerprint


def test_v2_lifts_multiple_containers_and_fail_closes_orphaned_parent_walks():
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pov1", "root", "SCIENTIFIC_POV"),
        _node("pov2", "pov1", "STATISTICAL_POV"),
        _node("deep_pro", "pov2", "PRO"),
        _node("orphan", "missing", "CON"),
        _node("cycle_a", "cycle_b", "ETHICAL_POV"),
        _node("cycle_b", "cycle_a", "PRACTICAL_POV"),
        _node("cycle_pro", "cycle_a", "PRO"),
    ]

    adapted = debate_argument_graph(nodes, {}, semantics=SEMANTICS_V2_LENS_LIFT)

    assert adapted.graph.supports == (("deep_pro", "root"),)
    assert adapted.graph.attacks == ()
    assert adapted.tau_sources["orphan__edge"] == "orphaned_parent"
    assert adapted.tau_sources["cycle_pro__edge"] == "orphaned_parent"
    assert set(adapted.graph.base_scores) == {node["id"] for node in nodes}
    adapted.graph.compute_strengths()


def test_v2_container_types_can_define_a_synthetic_lens_without_changing_v1():
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("lens", "root", "SYNTHETIC_LENS"),
        _node("pro", "lens", "PRO"),
    ]

    v2 = debate_argument_graph(
        nodes,
        {},
        semantics=SEMANTICS_V2_LENS_LIFT,
        container_types=frozenset({"SYNTHETIC_LENS"}),
    )
    v1 = debate_argument_graph(nodes, {})

    assert v2.graph.supports == (("pro", "root"),)
    assert v2.tau_sources["lens__edge"] == "lens_no_edge"
    assert v1.graph.supports == (("pro", "lens"),)
    assert v1.tau_sources["lens__edge"] == "unmapped_edge"


def test_qbaf_debug_semantics_env_is_opt_in_and_defaults_to_v1(monkeypatch):
    nodes = [
        _node("root", None, "ROOT_CLAIM"),
        _node("pov", "root", "SCIENTIFIC_POV"),
        _node("pro", "pov", "PRO"),
    ]
    monkeypatch.setattr(
        "app.scoring.qbaf_debug._debate_node_rows",
        lambda _db, _debate_id: nodes,
    )
    debate = SimpleNamespace(id="isolated-debug-debate")

    monkeypatch.delenv("DIALECTICAL_QBAF_DEBUG_SEMANTICS", raising=False)
    default_block = qbaf_debug_block(object(), debate, {"items": []})

    monkeypatch.setenv("DIALECTICAL_QBAF_DEBUG_SEMANTICS", SEMANTICS_V2_LENS_LIFT)
    v2_block = qbaf_debug_block(object(), debate, {"items": []})

    assert default_block is not None and "unavailable_reason" not in default_block
    assert v2_block is not None and "unavailable_reason" not in v2_block
    assert default_block["semantics"] == DEFAULT_SEMANTICS
    assert v2_block["semantics"] == SEMANTICS_V2_LENS_LIFT
    assert default_block["supports"] == [("pov", "root"), ("pro", "pov")]
    assert default_block["attacks"] == []
    assert v2_block["supports"] == [("pro", "root")]
    assert v2_block["attacks"] == []
    v2_edge_endpoints = {
        endpoint
        for edge in v2_block["supports"] + v2_block["attacks"]
        for endpoint in edge
    }
    assert "pov" not in v2_edge_endpoints
    assert default_block["strengths"]["root"] != v2_block["strengths"]["root"]
