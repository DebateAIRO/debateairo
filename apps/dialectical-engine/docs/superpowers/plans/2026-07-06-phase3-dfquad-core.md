# Phase 3: Pure DF-QuAD Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A standalone, pure DF-QuAD (Discontinuity-Free Quantitative Argumentation Debate) scoring core lands in `coordinator/app/qbaf/dfquad.py`: a minimal `ArgumentGraph` dataclass over plain node ids (no `ClaimNode`/`Edge`/`QBAFGraph` model dependency) that computes DF-QuAD strengths via the literature-exact aggregation/mediating equations, in topological order, with zero recursion and zero I/O. Golden values are taken from two peer-reviewed, arXiv-verified worked examples and must never be adjusted to make tests pass.

**Architecture:** `ArgumentGraph` holds `base_scores: Mapping[str, float]`, `attacks: Sequence[tuple[str, str]]`, `supports: Sequence[tuple[str, str]]`. `compute_strengths()` validates (unknown edge endpoints, out-of-range tau, cycles) then runs iterative Kahn's-algorithm topological sort over the union of attack+support edges, computing each node's strength bottom-up via `_probabilistic_sum` (the DF-QuAD aggregation function alpha) and `_mediating_function` (sigma). This module is intentionally independent of the existing `coordinator/app/qbaf/model.py` (`ClaimNode`/`Edge`/`QBAFGraph`) and `coordinator/app/qbaf/semantics.py` (`DFQuADSemantics`, which is graph-object-based and recursive) — see the flagged repo fact below. `coordinator/app/qbaf/__init__.py` gains re-exports only; no existing export is touched.

**Tech Stack:** Python 3.12, stdlib only (`dataclasses`, `typing`, `collections.deque`), pytest (coordinator suite: `cd coordinator && ../.venv/Scripts/python.exe -m pytest tests`).

## Global Constraints

- **Pure module, no exceptions:** `dfquad.py` imports stdlib only. No `sqlalchemy`, `httpx`, `fastapi`, `app.api`, `app.core`, `app.db`, `app.providers`, `app.scoring`, `app.services`, `app.worker`, `os`, `pathlib`, `time`, `random`, `socket`, `subprocess`, `requests`, `datetime`, `dotenv`, `neo4j`, `openai`, or `uuid`. The test file must include a purity test that parses `dfquad`'s own import statements (or inspects `sys.modules`/`ast`) and asserts none of the forbidden names appear — do not just trust `test_qbaf_purity.py`'s existing repo-wide sweep; this plan's own test file asserts it directly too, as instructed.
- **Deterministic only:** no randomness, no time-based behavior, no hidden global state. Two calls to `compute_strengths()` on the same `ArgumentGraph` must return bit-identical results.
- **Cycles forbidden in v1:** DF-QuAD's own semantics assume acyclicity; a cycle in the union of attack+support edges raises `CyclicGraphError`, never a silent/partial result.
- **Golden values are literature ground truth, not tunable:** the two golden test cases are transcribed from published, arXiv-verified worked examples of DF-QuAD (cited by arXiv id in the test docstrings). If the implementation disagrees with a golden number, **the implementation is wrong** — do not adjust the expected values to match whatever the code produces.
- **Do not touch any existing file** except `coordinator/app/qbaf/__init__.py`, and there only to add re-exports — read it first (it carries `FOUNDATION_STEP`/`PURITY_CONTRACT` markers and existing exports for `ClaimNode`/`Edge`/`QBAFGraph`/`DFQuADSemantics`/`Semantics`/`combine_df_quad`/`probabilistic_sum` that must all still work unchanged after this task).
- **No wire/DTO renames.** This is a brand-new module; nothing existing is renamed.
- Git staging is explicit-path only: never `git add -A` / `git add .`. Stage only the files this plan names.
- Every commit created for this plan ends with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Coordinator suite must show **zero NEW failures** versus the known baseline of **12 known env-harness failures** (pre-existing, unrelated to this task — capture the baseline at Step 0 and diff against it after implementation, same pattern as Phase 2).

**Verified ground truth (read before implementing):**
- `coordinator/app/qbaf/__init__.py` (4 lines of imports + `__all__`) already re-exports `ClaimNode`, `Edge`, `QBAFGraph` (from `app.qbaf.model`) and `DFQuADSemantics`, `Semantics`, `combine_df_quad`, `probabilistic_sum` (from `app.qbaf.semantics`), plus `FOUNDATION_STEP = "proposal-b-step-1"` and `PURITY_CONTRACT = "pure-graph-math-no-io"`. This task adds `ArgumentGraph` and `CyclicGraphError` (from `app.qbaf.dfquad`) to the imports and `__all__` list — **additive only, alphabetically inserted, nothing removed or reordered beyond insertion**.
- **Repo fact worth flagging loudly:** `coordinator/app/qbaf/semantics.py` already contains a working DF-QuAD implementation (`DFQuADSemantics.propagate`, `combine_df_quad`, `probabilistic_sum`) and `coordinator/tests/test_qbaf_semantics.py` already golden-tests it against hand-picked (not literature-cited) numbers. That implementation (a) operates on `QBAFGraph`/`ClaimNode`/`Edge` objects with per-edge `weight`, not plain `(attacker, target)` tuples, and (b) computes recursively (`compute(node_id)` calls itself through `visiting`-set cycle detection) rather than via iterative Kahn's algorithm. The design for this phase explicitly calls for a second, independent, unweighted, non-recursive core (`ArgumentGraph`/`compute_strengths`) validated against literature-exact golden numbers — this is not a duplicate-by-accident, it is the decided design. Do not attempt to unify or refactor the two in this task; that would violate "do not touch any existing file except `__init__.py`."
- `coordinator/tests/test_qbaf_purity.py` already enforces a repo-wide import boundary for every file under `coordinator/app/qbaf/` (forbidden module prefixes include `sqlalchemy`, `httpx`, `os`, `pathlib`, `time`, etc.) and forbids `open`/`print` calls and `.read_text`/`.write_text`/`.exists`/etc. attribute calls anywhere in `app/qbaf/*.py`. `dfquad.py` automatically falls under this existing sweep as soon as it exists in that directory — no changes to `test_qbaf_purity.py` are needed, but its rules constrain what `dfquad.py` may import or call.
- Python venv confirmed at `apps/dialectical-engine/.venv/Scripts/python.exe` (sibling to `coordinator/`), so `cd coordinator && ../.venv/Scripts/python.exe -m pytest ...` resolves correctly.
- Both golden test cases below were independently recomputed against the exact aggregation (`agg(vs) = 1 - prod(1 - v)`) and mediating (`sigma = tau - tau*(v_a - v_s)` if `v_a >= v_s` else `sigma = tau + (1-tau)*(v_s - v_a)`) formulas during planning and match to full floating-point precision — safe to use as-is.

---

### Task 1: Pure DF-QuAD core with verified golden tests

**Files:**
- Create: `coordinator/app/qbaf/dfquad.py`
- Create: `coordinator/tests/test_dfquad.py`
- Modify: `coordinator/app/qbaf/__init__.py` (re-export additions only)

**Interfaces:**
- Produces: `class CyclicGraphError(ValueError)`; `@dataclass(frozen=True) class ArgumentGraph` with fields `base_scores: Mapping[str, float]`, `attacks: Sequence[tuple[str, str]]`, `supports: Sequence[tuple[str, str]]`, and method `compute_strengths(self) -> dict[str, float]`.
- Consumes: nothing (pure stdlib).

- [ ] **Step 0: Capture the baseline failure count**

Before touching any code, run the full coordinator suite once and record the result so the "zero NEW failures" constraint has a concrete baseline to diff against:

```bash
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests -v --basetemp=.pytest-tmp
```

Expected: 12 known env-harness failures (pre-existing, unrelated to DF-QuAD scoring). Save the list of failing test node IDs from this run; it is the baseline every later run in this task must match exactly (same 12, no more, no fewer, no new names).

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_dfquad.py
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
```

- [ ] **Step 2: Run to verify failure**

Run:
```bash
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/test_dfquad.py -v --basetemp=.pytest-tmp
```

Expected: FAIL / collection error — `app.qbaf.dfquad` does not exist yet (`ModuleNotFoundError`).

- [ ] **Step 3: Implement**

```python
# coordinator/app/qbaf/dfquad.py
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
```

`coordinator/app/qbaf/__init__.py` — add the re-exports (additive only; preserve every existing line and ordering, insert `ArgumentGraph`/`CyclicGraphError` alphabetically into the import and `__all__` list):

```python
from __future__ import annotations

from app.qbaf.dfquad import ArgumentGraph, CyclicGraphError
from app.qbaf.model import ClaimNode, Edge, QBAFGraph
from app.qbaf.semantics import DFQuADSemantics, Semantics, combine_df_quad, probabilistic_sum

FOUNDATION_STEP = "proposal-b-step-1"
PURITY_CONTRACT = "pure-graph-math-no-io"

__all__ = [
    "ArgumentGraph",
    "ClaimNode",
    "CyclicGraphError",
    "DFQuADSemantics",
    "Edge",
    "FOUNDATION_STEP",
    "PURITY_CONTRACT",
    "QBAFGraph",
    "Semantics",
    "combine_df_quad",
    "probabilistic_sum",
]
```

- [ ] **Step 4: Run to verify pass**

Run:
```bash
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/test_dfquad.py -v --basetemp=.pytest-tmp
```

Expected: all tests pass, including both golden tests, the purity test, and all property tests (determinism, attack/support monotonicity, cycle rejection, unknown-endpoint, out-of-range tau, empty graph, isolated node).

Also confirm the existing qbaf foundation/purity/semantics suites are untouched:

```bash
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests/test_qbaf_foundation.py tests/test_qbaf_purity.py tests/test_qbaf_semantics.py tests/test_qbaf_model.py tests/test_qbaf_api.py -v --basetemp=.pytest-tmp
```

Expected: all pass, unchanged.

- [ ] **Step 5: Full suite baseline comparison**

Run:
```bash
cd coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ../.venv/Scripts/python.exe -m pytest -p pytest_cov.plugin -p pytest_asyncio.plugin tests -v --basetemp=.pytest-tmp
```

Compare the failing-test list against the Step 0 baseline (12 known env-harness failures). Requirement: the failing set is identical (same test node IDs, same count) — zero NEW failures introduced by this task. If anything outside `test_dfquad.py` newly fails, that is a real regression to fix before proceeding — do not adjust the baseline to hide it.

- [ ] **Step 6: Commit**

```bash
git add coordinator/app/qbaf/dfquad.py coordinator/app/qbaf/__init__.py coordinator/tests/test_dfquad.py
git commit -m "$(cat <<'EOF'
feat(qbaf): pure DF-QuAD scoring core with literature-verified golden tests (Phase 3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```
