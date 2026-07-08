# Phase 4: DF-QuAD Debate Graph Adapter (debug-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a flag-gated, debug-only bridge from a live debate's node tree to the pure DF-QuAD engine (`app/qbaf/dfquad.py`), so `debate_scoring_payload` can optionally expose computed argument strengths (`qbaf_debug`) without touching production scoring behavior, without importing ORM types into `app/qbaf/*`, and without crashing scoring on any error.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **No boolean env-flag helper exists in `coordinator/app/core/config.py`.** Only `int_env(name, default, minimum, maximum)` and `float_env(name, default, minimum, maximum)` were found (lines 134-141), both wrapping `bounded_int`/`bounded_float`. There is no `bool_env`/`_bool` helper in the grepped range of the file. Implementer must either (a) locate a bool helper elsewhere in `config.py` outside the read range, or (b) add a small `bool_env(name: str, default: bool) -> bool` following the exact shape of `int_env`/`float_env` (`os.getenv(name)` is `None` → default; else parse `"1"/"true"/"yes"` case-insensitively) and wire it into `Settings`/`load_settings` the same way `public_rate_limit_per_minute` etc. are wired. Do not invent a different pattern (e.g. pydantic `BaseSettings` env parsing) if one doesn't already exist for booleans.
2. **No single "fetch full node rows (id, parent_id, node_type) for a debate" helper was confirmed.** `coordinator/app/scoring/service.py:1523` has `_debate_node_ids(db, debate_id) -> list[str]` (ids only, ordered by materialized_path/depth/position/id, excludes `status == "stale"`). The adapter needs `id`, `parent_id`, and `node_type` per node. Implementer must grep `coordinator/app/scoring/service.py` and `coordinator/app/services/dialectical_v2.py` for an existing "load Node rows for a debate" query (e.g. near line 1062 in dialectical_v2.py where `"node_type": node.node_type` is serialized) and reuse its `Session.scalars(select(Node)...)` shape instead of writing a new one; if truly none exists, write the minimal query in `qbaf_debug.py` itself (not in `app/qbaf/*`) mirroring `_debate_node_ids`'s filter/order (`Node.debate_id == debate.id, Node.status != "stale"`), additionally selecting `Node.parent_id` and `Node.node_type`.
3. **Exact `scores[node_id]["scores"]["strength"]` shape** — confirm the validated scoring item shape (`_public_scoring_item` in `coordinator/app/scoring/service.py`) actually nests a `"strength"` float under `item["scores"]`, and confirm what key holds `node_id` on each item (assumed `item["node_id"]`, seen in the `debate_scoring_payload` "references nodes outside the current debate" check at line 190). If the nesting differs, adjust `qbaf_debug_block`'s dict-building accordingly — do not guess further, read `app/scoring/models.py` `ClaimAssessment`/`NodeScoringPayload` and `_public_scoring_item` first.
4. **POV node_type values** confirmed as `SCIENTIFIC_POV`, `STATISTICAL_POV`, `ETHICAL_POV`, `PRACTICAL_POV` (via `POV_BRANCHES` tuple, `dialectical_v2.py:50-55`) plus `ROOT_CLAIM`, `PRO`, `CON`. Implementer should double check no other node_type literal exists elsewhere in the codebase (e.g. a `REBUTTAL` or similar) before finalizing the edge-mapping table — a quick `grep -rn 'node_type="' coordinator/app` is enough.
5. **`coordinator/tests/test_qbaf_purity.py`** is referenced as the enforcement mechanism for "no ORM/network/time imports in `app/qbaf/*`" — implementer should read it once before writing Task 1's Step 1 to match its exact assertion style (e.g. AST-based import scan vs. simple substring grep) so the new `debate_adapter.py` passes on the first try.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **17 known coordinator failures are pre-existing** (12 env-harness + 5 foreign guardian WIP) — these are NOT this phase's responsibility. Do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns. Report them as pre-existing if seen.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`NodeScoringResult`-shaped dicts as applicable), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **`app/qbaf` package purity is non-negotiable:** `debate_adapter.py` must import nothing beyond stdlib + `app.qbaf.dfquad`. No SQLAlchemy, no `app.models.*`, no FastAPI, no httpx, no provider/worker imports. All ORM/DB access lives in `app/scoring/qbaf_debug.py` instead, which converts ORM rows to plain dicts BEFORE calling into `app/qbaf/*`.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.

**Verified ground truth (dev lineage):**
- `coordinator/app/qbaf/dfquad.py`:
  - `ArgumentGraph` is a frozen dataclass: `base_scores: Mapping[str, float]`, `attacks: Sequence[tuple[str,str]]`, `supports: Sequence[tuple[str,str]]`.
  - `__post_init__` (lines 87-98) freezes `base_scores` into `MappingProxyType(dict(...))` and freezes `attacks`/`supports` into deduplicated (`dict.fromkeys`), order-preserving tuples of `(str(source), str(target))` — duplicate edges of the same polarity are silently collapsed to one.
  - `compute_strengths()` (line 142) calls `_validate()` (tau range 0..1, edge endpoints must exist in `base_scores`) then `_topological_order()` (iterative Kahn's algorithm over attacks+supports combined) then computes strengths via `probabilistic_sum` (aggregation, "attacker strength"/"supporter strength") and `mediating_function` (sigma).
  - `CyclicGraphError(ValueError)` (line 37) is raised by `_topological_order()` when `len(order) != len(known_nodes)` — i.e., whenever the attack+support edge union is not a DAG.
  - The module is stdlib-only by design; `coordinator/tests/test_qbaf_purity.py` enforces this repo-wide for `app/qbaf/*` (implementer must read it — see UNVERIFIED #5).
- **`node_type` vocabulary** (`coordinator/app/models/entities.py:54`: `Node.node_type: Mapped[str] = mapped_column(String(16), index=True)` — free-form string column, no DB-level enum):
  - `"ROOT_CLAIM"` — the debate's root node (`dialectical_v2.py:1297`).
  - `"PRO"` / `"CON"` — the two debate-side branches (`dialectical_v2.py:788, 800` and used throughout as the two polarities).
  - `"SCIENTIFIC_POV"`, `"STATISTICAL_POV"`, `"ETHICAL_POV"`, `"PRACTICAL_POV"` — the four POV-lens branch node types, defined in `POV_BRANCHES` (`dialectical_v2.py:50-55`), created as children of the root at `dialectical_v2.py:1311-1315`.
  - `dialectical_v2.py:1062` shows the existing serialization pattern for a node dict: `"node_type": node.node_type` alongside other fields — a template for what fields are available on a `Node` row.
  - `coordinator/app/services/serialization.py` contains **no** `node_type` references at all — it is not the relevant serialization site; do not look there for node_type handling.
- **`debate_scoring_payload`** (`coordinator/app/scoring/service.py:110-242`): every return path — the two early-return branches (no `run`, or `run.provenance` isn't judge-sourced), the three malformed-output branches, and the final success path (line 241-242) — funnels through `_attach_active_scoring_job(<payload>, active_job)` as the outermost wrapper call. The final success path builds `payload = {...}` (line 204), enriches it with optional keys (`errors`, `pending`, `reason`, `model_metadata`, `producer`, `generated_at`, `max_nodes`/`scored_node_count`/`skipped_node_count`, `truncated`, `cache`), then calls `payload = _with_current_node_coverage(payload, node_ids, active_job)` and `return _attach_active_scoring_job(payload, active_job)` at line 241-242. **This is the single attachment point**: the `qbaf_debug` key must be added to `payload` (a plain dict, still mutable at that point) right before line 241's `_with_current_node_coverage` call, guarded by the feature flag, so it rides through `_attach_active_scoring_job` untouched. Note the other return paths in the function (unavailable-payload branches) also produce dicts via `_unavailable_payload(...)` piped through the same two wrapper calls — for v1, only the full-success path needs the `qbaf_debug` key (the unavailable-payload branches have no scored data to build a graph from); implementer should confirm this scoping decision is acceptable or extend to those branches if `qbaf_debug_block` is called with only `db`/`debate` (it re-queries nodes independently, so it CAN be attached even to unavailable-payload branches — see Task 3 for the actual call site decision).
- `_debate_node_ids(db, debate_id) -> list[str]` (`coordinator/app/scoring/service.py:1523-1530`): the only confirmed existing node-query helper; queries `Node.id` where `Node.debate_id == debate_id and Node.status != "stale"`, ordered by `materialized_path, depth, position, id`. It returns ids only — no `parent_id`/`node_type` — see UNVERIFIED #2 for what the adapter glue must do instead.
- `int_env`/`float_env` in `coordinator/app/core/config.py:134-141` are the only confirmed numeric env-flag helpers; no boolean equivalent was found in the read range — see UNVERIFIED #1.

---

### Task 1: Pure DF-QuAD debate graph adapter

**Files:**
- Create: `coordinator/app/qbaf/debate_adapter.py`
- Test: `coordinator/tests/test_debate_graph_adapter.py` (new)

**Interfaces:**
- Produces: `AdaptedDebateGraph` (frozen dataclass: `graph: ArgumentGraph`, `tau_sources: Mapping[str, str]`, `fingerprint: str`); `debate_argument_graph(nodes, scores) -> AdaptedDebateGraph`.
- Consumes: nothing beyond stdlib + `app.qbaf.dfquad.ArgumentGraph`/`CyclicGraphError`.

- [ ] **Step 1: Write failing tests**

Before writing, read `coordinator/tests/test_qbaf_purity.py` once to match its import-enforcement style exactly (see UNVERIFIED #5), and confirm the full node_type literal set via `grep -rn 'node_type="' coordinator/app` (see UNVERIFIED #4).

```python
# coordinator/tests/test_debate_graph_adapter.py
import ast
from pathlib import Path

import pytest

from app.qbaf.debate_adapter import AdaptedDebateGraph, debate_argument_graph
from app.qbaf.dfquad import CyclicGraphError


def _node(id_, parent_id, node_type):
    return {"id": id_, "parent_id": parent_id, "node_type": node_type}


def test_purity_no_orm_or_network_imports():
    """debate_adapter.py must never import ORM/network/time — mirrors
    test_qbaf_purity.py's enforcement style for the rest of app/qbaf."""
    source = Path("app/qbaf/debate_adapter.py").read_text()
    tree = ast.parse(source)
    forbidden_prefixes = ("sqlalchemy", "app.models", "fastapi", "httpx", "app.providers", "app.services")
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        else:
            continue
        for name in names:
            assert not name.startswith(forbidden_prefixes), f"forbidden import: {name}"


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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_debate_graph_adapter.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.qbaf.debate_adapter` does not exist yet).

- [ ] **Step 3: Implement**

```python
# coordinator/app/qbaf/debate_adapter.py
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
_SUPPORT_TYPES = {"PRO", "SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}
_ATTACK_TYPES = {"CON"}
_NO_EDGE_TYPES = {"ROOT_CLAIM"}


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


def _edge_for(node_id: str, parent_id: str | None, node_type: str) -> tuple[tuple[str, str] | None, str | None]:
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
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_debate_graph_adapter.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Move to Task 2.

---

### Task 2: `qbaf_debug` service glue (ORM boundary)

**Files:**
- Create: `coordinator/app/scoring/qbaf_debug.py`
- Test: `coordinator/tests/test_qbaf_debug_service.py` (new)

**Interfaces:**
- Consumes: Task 1's `debate_argument_graph`, `AdaptedDebateGraph`.
- Produces: `qbaf_debug_block(db: Session, debate: Debate, scoring_payload: dict) -> dict | None`.

Before writing, resolve UNVERIFIED #2 and #3: find (or write, per the plan there) the node-row query and confirm the scoring item shape actually used by `scoring_payload["items"]` (built via `_public_scoring_item`, from `debate_scoring_payload`).

- [ ] **Step 1: Write failing tests**

Reuse whatever `db_session`/factory fixtures the existing coordinator scoring tests use for creating a `Debate` + `Node` rows (search `coordinator/tests/test_node_scoring.py` or similar for `make_debate`/`make_node`-style helpers and copy their setup style — do not invent new bootstrap).

```python
# coordinator/tests/test_qbaf_debug_service.py
from app.scoring.qbaf_debug import qbaf_debug_block

# NOTE: adapt make_debate/make_node calls below to whatever factory helpers
# already exist in this test module / conftest — do not invent new ones.


def test_qbaf_debug_block_with_scored_and_unscored_nodes(db_session):
    debate = make_debate(db_session)
    root = make_node(db_session, debate, node_type="ROOT_CLAIM", parent_id=None)
    pro = make_node(db_session, debate, node_type="PRO", parent_id=root.id)
    con = make_node(db_session, debate, node_type="CON", parent_id=root.id)
    db_session.flush()

    scoring_payload = {
        "items": [
            {"node_id": pro.id, "scores": {"strength": 0.8}},
            # con intentionally has no scoring item -> must default, not crash
        ]
    }

    block = qbaf_debug_block(db_session, debate, scoring_payload)

    assert block is not None
    assert "unavailable_reason" not in block
    assert block["semantics"] == "df-quad-v1"
    assert set(block["strengths"]) == {root.id, pro.id, con.id}
    assert block["tau_sources"][pro.id] == "judge_strength"
    assert block["tau_sources"][con.id] == "default"
    assert isinstance(block["fingerprint"], str) and block["fingerprint"]
    # never leak raw judge output
    assert "raw_output" not in block
    assert "raw" not in block


def test_qbaf_debug_block_returns_unavailable_reason_on_cycle(db_session, monkeypatch):
    debate = make_debate(db_session)
    root = make_node(db_session, debate, node_type="ROOT_CLAIM", parent_id=None)
    db_session.flush()

    def _boom(*_args, **_kwargs):
        raise ValueError("simulated adapter failure")

    monkeypatch.setattr("app.scoring.qbaf_debug.debate_argument_graph", _boom)

    block = qbaf_debug_block(db_session, debate, {"items": []})

    assert block is not None
    assert "unavailable_reason" in block
    assert "simulated adapter failure" in block["unavailable_reason"]
    assert "strengths" not in block
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_qbaf_debug_service.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.scoring.qbaf_debug` does not exist yet).

- [ ] **Step 3: Implement**

```python
# coordinator/app/scoring/qbaf_debug.py
"""ORM boundary glue for the debug-only DF-QuAD debate graph view.

Converts live Node rows + a scoring payload's items into plain dicts, calls
the pure app.qbaf.debate_adapter/dfquad code, and shapes the result for
attachment to debate_scoring_payload. Never raises: any failure becomes an
honest {"unavailable_reason": ...} block instead of crashing scoring.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Debate, Node
from app.qbaf.debate_adapter import debate_argument_graph
from app.qbaf.dfquad import CyclicGraphError

SEMANTICS_VERSION = "df-quad-v1"


def _debate_node_rows(db: Session, debate_id: str) -> list[dict]:
    # Mirrors _debate_node_ids' filter/order (service.py:1523) but selects the
    # extra columns the adapter needs. See UNVERIFIED #2 in the plan: replace
    # this with a shared helper if one already exists elsewhere.
    rows = db.scalars(
        select(Node)
        .where(Node.debate_id == debate_id, Node.status != "stale")
        .order_by(Node.materialized_path.asc(), Node.depth.asc(), Node.position.asc(), Node.id.asc())
    ).all()
    return [
        {"id": node.id, "parent_id": node.parent_id, "node_type": node.node_type}
        for node in rows
    ]


def _scores_by_node_id(scoring_payload: dict) -> dict:
    items = scoring_payload.get("items")
    if not isinstance(items, list):
        return {}
    result = {}
    for item in items:
        if isinstance(item, dict) and item.get("node_id"):
            result[item["node_id"]] = item
    return result


def qbaf_debug_block(db: Session, debate: Debate, scoring_payload: dict) -> dict | None:
    """Build the debug-only qbaf strength view for a debate.

    Returns None only if the flag caller decides not to call this at all
    (this function itself always returns a dict once called). On any error
    -- including CyclicGraphError -- returns {"unavailable_reason": str(exc)}
    and never raises, so scoring is never affected by this debug feature.
    """
    try:
        nodes = _debate_node_rows(db, debate.id)
        scores = _scores_by_node_id(scoring_payload)
        adapted = debate_argument_graph(nodes, scores)
        strengths = adapted.graph.compute_strengths()
        return {
            "fingerprint": adapted.fingerprint,
            "strengths": strengths,
            "tau_sources": dict(adapted.tau_sources),
            "semantics": SEMANTICS_VERSION,
        }
    except CyclicGraphError as exc:
        return {"unavailable_reason": str(exc)}
    except Exception as exc:  # noqa: BLE001 - debug feature must never crash scoring
        return {"unavailable_reason": str(exc)}
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_qbaf_debug_service.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Move to Task 3.

---

### Task 3: Flag-gated attachment to `debate_scoring_payload`

**Files:**
- Modify: `coordinator/app/core/config.py` (add boolean flag helper/setting — see UNVERIFIED #1)
- Modify: `coordinator/app/scoring/service.py` (`debate_scoring_payload`)
- Test: `coordinator/tests/test_qbaf_debug_flag_attachment.py` (new)

**Interfaces:**
- Consumes: Task 2's `qbaf_debug_block`.
- Produces: `DIALECTICAL_QBAF_DEBUG` env flag (default OFF); when OFF, `debate_scoring_payload(...)`'s returned dict has no `"qbaf_debug"` key at all (not `None` — entirely absent); when ON, the successful-scoring path's payload includes `payload["qbaf_debug"] = qbaf_debug_block(db, debate, payload)`.

- [ ] **Step 1: Write failing tests**

First resolve UNVERIFIED #1 (confirm/add the boolean env helper) by reading `coordinator/app/core/config.py` in full around `Settings`/`load_settings`. Follow whatever pattern the file uses for other toggles (search for any existing `bool`-typed `Settings` field first — there may be one this plan's grep missed).

```python
# coordinator/tests/test_qbaf_debug_flag_attachment.py
import pytest

from app.scoring.service import debate_scoring_payload

# Reuse existing fixtures/factories from test_node_scoring.py or similar for
# a debate with a completed judge-sourced AnalyzerRun (so debate_scoring_payload
# takes the full-success path, not an _unavailable_payload branch).


def test_qbaf_debug_absent_when_flag_off(db_session, monkeypatch, scored_debate):
    monkeypatch.delenv("DIALECTICAL_QBAF_DEBUG", raising=False)
    payload = debate_scoring_payload(db_session, scored_debate)
    assert "qbaf_debug" not in payload


def test_qbaf_debug_present_when_flag_on(db_session, monkeypatch, scored_debate):
    monkeypatch.setenv("DIALECTICAL_QBAF_DEBUG", "1")
    payload = debate_scoring_payload(db_session, scored_debate)
    assert "qbaf_debug" in payload
    block = payload["qbaf_debug"]
    assert block.get("semantics") == "df-quad-v1" or "unavailable_reason" in block
```

Note: `scored_debate` here stands in for whatever fixture/factory chain in `coordinator/tests/test_node_scoring.py` produces a debate with a completed judge-sourced `AnalyzerRun` — copy that setup rather than reinventing it. If the flag is read once at import/settings-load time rather than per-call via `os.getenv`, adjust the monkeypatch target accordingly (patch the resolved `Settings` object/function instead of the env var) — confirm this when implementing UNVERIFIED #1.

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_qbaf_debug_flag_attachment.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`qbaf_debug` never present, or flag helper missing).

- [ ] **Step 3: Implement**

`config.py` — add (adjust name/shape to match whatever the file's actual boolean-toggle convention turns out to be, per UNVERIFIED #1):

```python
def bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
```

`service.py` — import and call at the single attachment point identified in the verified ground truth (just before the final `payload = _with_current_node_coverage(payload, node_ids, active_job)` / `return _attach_active_scoring_job(payload, active_job)` on the full-success path, i.e. right after line ~233-240's optional-field population, before line 241):

```python
from app.core.config import bool_env
from app.scoring.qbaf_debug import qbaf_debug_block

...

    if bool_env("DIALECTICAL_QBAF_DEBUG", False):
        payload["qbaf_debug"] = qbaf_debug_block(db, debate, payload)
    payload = _with_current_node_coverage(payload, node_ids, active_job)
    return _attach_active_scoring_job(payload, active_job)
```

Only wire this into the full-success return path for v1 (see the note under "Verified ground truth" about `_unavailable_payload` branches) — do not add it to the unavailable-payload branches unless the implementer decides otherwise and updates this plan/tests accordingly.

- [ ] **Step 4: Verify pass + rerun-list**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_qbaf_debug_flag_attachment.py tests/test_debate_graph_adapter.py tests/test_qbaf_debug_service.py tests/test_node_scoring.py tests/test_judge_contract_golden.py tests/test_artifact_hydration_contract_guard.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except the pre-existing 17 known failures (12 env-harness + 5 foreign guardian WIP) if any of those happen to live in these specific files — if a NEW failure appears in `test_node_scoring.py`, `test_judge_contract_golden.py`, or `test_artifact_hydration_contract_guard.py` that is caused by this change (e.g. flag defaulting wrong, key present when it shouldn't be), fix it before reporting done. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and flag the POV-lens edge-mapping default (documented in `debate_adapter.py`'s module comment) as a decision for Hermes to confirm or override.
