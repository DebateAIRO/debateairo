"""Golden tests for the pure DF-QuAD scoring core.

DF-QuAD ("Discontinuity-Free Quantitative Argumentation Debate") semantics
are defined in:
  Rago, Toni, Aurisicchio, Baroni. "Discontinuity-Free Decision Support with
  Quantitative Argumentation Debates." KR 2016.

Golden 1 is transcribed from the fake-news case study worked example in:
  Yin, Potyka, Toni. "Argumentative Explanations for Pattern-Based Text
  Classifiers." ECAI 2023. arXiv:2307.13582, Figure 3 (DF-QuAD column).

Golden 2 is transcribed from the CE-QArg Example 1 loan-approval worked
example in:
  Yin, Potyka, Toni. "CE-QArg: Counterfactual Explanations for Quantitative
  Bipolar Argumentation Frameworks." KR 2024. arXiv:2407.08497, Figure 1
  (DF-QuAD semantics).

These numbers are literature ground truth, not tuned to the implementation.
If the implementation disagrees with a golden value below, the
implementation is wrong — never adjust these numbers to make a test pass.
"""
from __future__ import annotations

import ast
import inspect

import pytest

from app.qbaf.dfquad import ArgumentGraph, CyclicGraphError


# ---------------------------------------------------------------------------
# Purity: dfquad.py must import stdlib only (no sqlalchemy/httpx/fastapi/...)
# ---------------------------------------------------------------------------

FORBIDDEN_IMPORT_PREFIXES = (
    "sqlalchemy",
    "httpx",
    "fastapi",
    "app.api",
    "app.core",
    "app.db",
    "app.evidence",
    "app.orchestration",
    "app.providers",
    "app.scoring",
    "app.services",
    "app.worker",
    "os",
    "pathlib",
    "time",
    "random",
    "socket",
    "subprocess",
    "requests",
    "datetime",
    "dotenv",
    "neo4j",
    "openai",
    "uuid",
)


def test_dfquad_module_imports_are_pure_stdlib() -> None:
    import app.qbaf.dfquad as dfquad_module

    source = inspect.getsource(dfquad_module)
    tree = ast.parse(source)
    imported_modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported_modules.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported_modules.append(node.module)

    offenders = [
        module
        for module in imported_modules
        if any(
            module == prefix or module.startswith(f"{prefix}.")
            for prefix in FORBIDDEN_IMPORT_PREFIXES
        )
    ]
    assert offenders == []


# ---------------------------------------------------------------------------
# Golden 1: fake-news case study (arXiv:2307.13582, Fig. 3)
#
# All base scores (tau) = 0.5. Nodes: A, B, C, D, E, F, G, H.
# Supports: B->A, C->A. Attacks: D->A, E->B, F->D, G->F, H->F.
# ---------------------------------------------------------------------------


def _golden_1_graph() -> ArgumentGraph:
    return ArgumentGraph(
        base_scores={n: 0.5 for n in "ABCDEFGH"},
        attacks=[("D", "A"), ("E", "B"), ("F", "D"), ("G", "F"), ("H", "F")],
        supports=[("B", "A"), ("C", "A")],
    )


def test_golden_1_fake_news_case_study_matches_arxiv_2307_13582_fig3() -> None:
    strengths = _golden_1_graph().compute_strengths()

    assert strengths["F"] == pytest.approx(0.125, abs=1e-12)
    assert strengths["B"] == pytest.approx(0.25, abs=1e-12)
    assert strengths["D"] == pytest.approx(0.4375, abs=1e-12)
    assert strengths["A"] == pytest.approx(0.59375, abs=1e-12)
    # Leaves with no incoming edges keep their base score unchanged.
    for leaf in ("E", "C", "G", "H"):
        assert strengths[leaf] == pytest.approx(0.5, abs=1e-12)


# ---------------------------------------------------------------------------
# Golden 2: CE-QArg Example 1 loan approval (arXiv:2407.08497, Fig. 1)
#
# tau: alpha=0.5, beta=0.3, gamma=0.6, rho=0.7, zeta=0.4.
# Support: beta->alpha, zeta->gamma. Attack: gamma->alpha, rho->beta.
# ---------------------------------------------------------------------------


def _golden_2_graph() -> ArgumentGraph:
    return ArgumentGraph(
        base_scores={"alpha": 0.5, "beta": 0.3, "gamma": 0.6, "rho": 0.7, "zeta": 0.4},
        attacks=[("gamma", "alpha"), ("rho", "beta")],
        supports=[("beta", "alpha"), ("zeta", "gamma")],
    )


def test_golden_2_ce_qarg_loan_approval_matches_arxiv_2407_08497_fig1() -> None:
    strengths = _golden_2_graph().compute_strengths()

    assert strengths["zeta"] == pytest.approx(0.4, abs=1e-12)
    assert strengths["rho"] == pytest.approx(0.7, abs=1e-12)
    assert strengths["gamma"] == pytest.approx(0.76, abs=1e-12)
    assert strengths["beta"] == pytest.approx(0.09, abs=1e-12)
    assert strengths["alpha"] == pytest.approx(0.165, abs=1e-12)


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------


def test_compute_strengths_is_deterministic() -> None:
    graph = _golden_1_graph()
    first = graph.compute_strengths()
    second = graph.compute_strengths()
    assert first == second


def test_attack_monotonicity_strictly_decreases_target_strength() -> None:
    baseline = _golden_2_graph().compute_strengths()["alpha"]

    graph_with_extra_attacker = ArgumentGraph(
        base_scores={
            "alpha": 0.5,
            "beta": 0.3,
            "gamma": 0.6,
            "rho": 0.7,
            "zeta": 0.4,
            "extra_attacker": 0.5,
        },
        attacks=[("gamma", "alpha"), ("rho", "beta"), ("extra_attacker", "alpha")],
        supports=[("beta", "alpha"), ("zeta", "gamma")],
    )
    attacked = graph_with_extra_attacker.compute_strengths()["alpha"]

    assert attacked < baseline


def test_support_monotonicity_strictly_increases_target_strength() -> None:
    baseline = _golden_2_graph().compute_strengths()["alpha"]

    graph_with_extra_supporter = ArgumentGraph(
        base_scores={
            "alpha": 0.5,
            "beta": 0.3,
            "gamma": 0.6,
            "rho": 0.7,
            "zeta": 0.4,
            "extra_supporter": 0.5,
        },
        attacks=[("gamma", "alpha"), ("rho", "beta")],
        supports=[("beta", "alpha"), ("zeta", "gamma"), ("extra_supporter", "alpha")],
    )
    supported = graph_with_extra_supporter.compute_strengths()["alpha"]

    assert supported > baseline


def test_cycle_in_combined_attack_and_support_edges_is_rejected() -> None:
    graph = ArgumentGraph(
        base_scores={"A": 0.5, "B": 0.5},
        attacks=[("A", "B")],
        supports=[("B", "A")],
    )
    with pytest.raises(CyclicGraphError):
        graph.compute_strengths()


def test_unknown_edge_endpoint_raises_value_error() -> None:
    graph = ArgumentGraph(
        base_scores={"A": 0.5},
        attacks=[("ghost", "A")],
        supports=[],
    )
    with pytest.raises(ValueError):
        graph.compute_strengths()


def test_tau_out_of_range_raises_value_error() -> None:
    graph = ArgumentGraph(
        base_scores={"A": 1.2},
        attacks=[],
        supports=[],
    )
    with pytest.raises(ValueError):
        graph.compute_strengths()


def test_empty_graph_computes_to_empty_dict() -> None:
    graph = ArgumentGraph(base_scores={}, attacks=[], supports=[])
    assert graph.compute_strengths() == {}


def test_isolated_node_strength_equals_its_base_score() -> None:
    graph = ArgumentGraph(base_scores={"solo": 0.73}, attacks=[], supports=[])
    assert graph.compute_strengths() == {"solo": pytest.approx(0.73, abs=1e-12)}


def test_exact_duplicate_edges_do_not_double_count() -> None:
    """Duplicate identity = (source, target, polarity): exact duplicates are
    counted once in the probabilistic sum."""
    taus = {"a": 0.5, "b": 0.5}
    once = ArgumentGraph(base_scores=taus, attacks=[("b", "a")], supports=[])
    twice = ArgumentGraph(base_scores=taus, attacks=[("b", "a"), ("b", "a")], supports=[])
    assert twice.compute_strengths()["a"] == once.compute_strengths()["a"]

    supported_once = ArgumentGraph(base_scores=taus, attacks=[], supports=[("b", "a")])
    supported_twice = ArgumentGraph(base_scores=taus, attacks=[], supports=[("b", "a"), ("b", "a")])
    assert supported_twice.compute_strengths()["a"] == supported_once.compute_strengths()["a"]


def test_compute_strengths_does_not_mutate_caller_inputs() -> None:
    taus = {"a": 0.5, "b": 0.5}
    attacks = [("b", "a")]
    supports: list[tuple[str, str]] = []
    graph = ArgumentGraph(base_scores=taus, attacks=attacks, supports=supports)

    graph.compute_strengths()

    assert taus == {"a": 0.5, "b": 0.5}
    assert attacks == [("b", "a")]
    assert supports == []
    # The graph's own collections are independent frozen copies: mutating the
    # caller's originals after construction must not affect the graph.
    taus["a"] = 0.99
    attacks.append(("a", "b"))
    assert graph.compute_strengths()["a"] != 0.99
    assert len(graph.attacks) == 1


def test_argument_graph_collections_are_read_only() -> None:
    graph = ArgumentGraph(base_scores={"a": 0.5}, attacks=[], supports=[])
    import pytest as _pytest

    with _pytest.raises(TypeError):
        graph.base_scores["b"] = 0.1  # type: ignore[index]
