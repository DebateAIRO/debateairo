# P1 — Contested-Frontier Deliberation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dialectical engine spend its budget where model families disagree, expanding the contested spine to depth 8–10 while settled branches stop at 2 — and survive the resulting tree size at synthesis.

**Architecture:** The wave loop (`score → expand → score`) is already wired end to end: `app/scoring/jobs.py:256` dispatches expansion in the scoring-completion tail, and `app/services/dialectical_v2.py:3187` wakes a re-score in the expand-completion tail. What is missing is (a) anything the dispatcher is legally allowed to spawn on, (b) a priority order, (c) stop conditions, and (d) a synthesis step that does not explode when the tree gets large. This plan supplies those four things and changes no other control flow.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2.x (SQLite, single writer, WAL), pytest + pytest-asyncio. Coordinator at `apps/dialectical-engine/coordinator`.

---

## Scope change from the spec — read this first

The spec (§10) placed §5.2 disagreement work in **P2**. Evidence gathered while planning forces part of it into **P1**. The reason is not preference; it is that P1 is otherwise a no-op.

`app/exploration/expansion_dispatch.py:330-335` enforces a machine-checked rule the codebase calls **THE LAW**: a lifecycle decision may spawn expansion work **only** when its persisted `signal_class == "categorical"`. Scalar-grounded decisions annotate and never spawn. The rationale is documented at `app/exploration/policy.py:14-19`: there is no calibrated ground truth for scalar judge scores.

Querying the live database across **every debate ever run**:

```
decision       signal_class  input_state  n
seek_evidence  scalar        grounded     6
```

**Six lifecycle decisions have ever existed. All six are scalar. Zero categorical decisions have ever been produced.** Turning on `DIALECTICAL_ADAPTIVE_EXPANSION` and raising budgets to 150 would therefore spawn exactly nothing — every decision would hit `OUTCOME_SCALAR_ANNOTATE_ONLY`.

There are two causes, and P1 fixes both:

1. **A classification bug (Task 4).** `_decision` classifies categorical iff **every** grounding reason is categorical (`policy.py:349-353`). But `seek_evidence` folds `abandon_blockers` into its grounding tuple (`policy.py:221`), and `_abandon_blockers` can append a scalar reason (`policy.py:310-311`); `_seek_evidence_reasons` can also append a scalar corroboration (`policy.py:283-285`). Since each reason in these lists is *independently sufficient* to fire the action (`policy.py:205-222`), adding a scalar corroboration to a categorically-grounded decision **downgrades** it. More grounding makes the signal weaker. That is backwards, and it is why all six records are scalar.

2. **No categorical predicate ever fires for `challenge` (Task 5).** `_challenge_reasons` (`policy.py:251-264`) requires adverse evidence status / `EntailmentLabel.REFUTES`, or a `contradiction:high` fatal flag. Smoke4 produced neither — all verification verdicts were `unverifiable`, and the fatal flags were `non_propositional_claim`, `undefined_success_criterion`, `missing_evidence`. `challenge` is the CON expansion that the entire "resolve disagreement" objective depends on, and no categorical route to it exists.

Task 5 adds cross-family judge disagreement as a **categorical** predicate. This is consistent with THE LAW rather than a relaxation of it: the law forbids treating an *uncalibrated scalar score* as ground truth about a claim. "Two judge families assigned materially different values to this field" is a factual predicate about the judging process, not a claim about correctness — the same character as the existing `contradiction:high` fatal-flag membership test. It requires no calibration to be true.

**Two spec items are deferred out of P1 as YAGNI**, with reasons:

- **§5.5(c) `node_to_dict` recursion bound.** At depth 10 this uses ~10 stack frames against a 1000-frame default. There is no risk at P1's target depth. Revisit if depth ever becomes unbounded.
- **§5.5(d) `node_type` column width.** `String(16)` with a 15-character longest value is one character from overflow, but P1 introduces no new node types and changes no lens labels. This belongs with §5.4 typed decomposition (P3), which is what actually adds labels.

---

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include these.

- **Every new behaviour is flag-gated and defaults OFF.** Flag-off runs must be byte-identical to today. This is the established binding in this codebase (`expansion_dispatch.py:79-81`).
- **No new stage may hold a SQLite write transaction across a CLI call.** This caused a 9-hour production wedge on 2026-07-24; documented at `app/scoring/service.py:1137-1159`.
- **Every refusal is annotated on the audited record, never a silent drop** (`expansion_dispatch.py:16-18`).
- **Full existing suite must stay green.** Baseline: 2421 passed / 4 skipped.
- Depth guardrail: **10**. Wave width: **12**. Priority floor: **0.15**. Budgets: `max_rounds=12`, `max_per_node=3`, `max_per_debate=150`.
- Deep-tree safety (Tasks 1–3) lands **before** budgets rise (Task 8). Strictly ordered.

**Test command** (per-test, from repo root):

```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/TESTFILE::TESTNAME -v
```

**Full suite** (from `apps/dialectical-engine`): `make test`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `coordinator/app/services/dialectical_v2.py` | v2 pipeline: job queueing, prompt render, quiescence | Modify — depth guard, quiescence query, synthesis payload |
| `coordinator/app/synthesis/branch_summary.py` | **New.** Bounded per-branch summarisation for the synthesis payload | Create |
| `coordinator/app/exploration/policy.py` | Expansion decision policy + signal classification | Modify — classification semantics, disagreement predicate |
| `coordinator/app/exploration/lifecycle_inputs.py` | Builds `ScoreSignal` from persisted scoring output | Modify — carry judge dispersion |
| `coordinator/app/exploration/expansion_dispatch.py` | Budget admission, priority ordering, stop reasons | Modify — priority, wave width, convergence stop |
| `coordinator/tests/test_v2_depth_guard.py` | **New.** Depth guardrail | Create |
| `coordinator/tests/test_branch_summary.py` | **New.** Hierarchical synthesis payload | Create |
| `coordinator/tests/test_frontier_priority.py` | **New.** Priority ordering + wave width + stop conditions | Create |
| `coordinator/tests/test_adaptive_expansion.py` | Existing W4 suite | Modify — extend for categorical fix |

---

## Task 1: Depth guardrail on expansion

The v2 pipeline has **no depth check anywhere** (verified: grep for a depth guard in `dialectical_v2.py` returns zero hits). `triage.py` computes `depth_budget`, clamps it, persists it to `protocol_state.triage.depth_budget` (`app/protocol/state.py:52`) — and nothing reads it back. Before budgets rise to 150 expansions, the tree needs a hard rail.

**Files:**
- Modify: `coordinator/app/services/dialectical_v2.py:1884-1892` (validation block in `queue_v2_expand_job`)
- Test: `coordinator/tests/test_v2_depth_guard.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MAX_EXPANSION_DEPTH: int = 10` and `expansion_depth_limit() -> int` in `app.services.dialectical_v2`. Task 6 relies on `expansion_depth_limit`.

- [ ] **Step 1: Write the failing test**

Create `coordinator/tests/test_v2_depth_guard.py`:

```python
"""P1 Task 1: hard depth guardrail on v2 expansion.

The v2 pipeline had no depth check at all. With frontier budgets raised to
150 expansions per debate, an unbounded chain is a real shape. This is a
safety rail, not a target: settled branches stop far short of it.
"""
from __future__ import annotations

import pytest

from app.models.entities import Node
from app.services.dialectical_v2 import (
    expansion_depth_limit,
    queue_v2_expand_job,
)

from test_v2_expand import _v2_debate_with_complete_node


def test_expansion_depth_limit_default_is_ten():
    assert expansion_depth_limit() == 10


def test_queue_v2_expand_job_refuses_beyond_depth_limit(db_session):
    debate, node = _v2_debate_with_complete_node(db_session)
    node.depth = expansion_depth_limit()
    db_session.flush()

    with pytest.raises(ValueError, match="depth limit"):
        queue_v2_expand_job(db_session, debate, node, "CON", "probe", "")


def test_queue_v2_expand_job_allows_one_below_the_limit(db_session):
    debate, node = _v2_debate_with_complete_node(db_session)
    node.depth = expansion_depth_limit() - 1
    db_session.flush()

    job = queue_v2_expand_job(db_session, debate, node, "CON", "probe", "")

    assert job is not None
    child = db_session.scalars(
        Node.__table__.select().where(Node.parent_id == node.id)
    ).first()
    assert child is not None
    assert child.depth == expansion_depth_limit()
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_v2_depth_guard.py -v
```
Expected: FAIL with `ImportError: cannot import name 'expansion_depth_limit'`.

> If `_v2_debate_with_complete_node` does not exist in `tests/test_v2_expand.py` under that exact name, read that file and use its actual fixture helper. `tests/test_adaptive_expansion.py:44` already imports helpers from `test_v2_expand`, so the module is importable from the tests directory.

- [ ] **Step 3: Add the constant and accessor**

In `coordinator/app/services/dialectical_v2.py`, next to the other budget accessors (near `cross_exam_max_jobs`, ~line 1371):

```python
# P1 Task 1: hard depth guardrail. The v2 pipeline previously had no depth
# check of any kind; triage's depth_budget is computed and never read. This
# is a safety rail against unbounded expansion chains, NOT a target -- the
# frontier's priority floor is what actually stops healthy branches.
MAX_EXPANSION_DEPTH = 10


def expansion_depth_limit() -> int:
    return int_env("DIALECTICAL_MAX_EXPANSION_DEPTH", MAX_EXPANSION_DEPTH, 1, 32)
```

- [ ] **Step 4: Enforce it in the validation block**

In `queue_v2_expand_job`, immediately after the existing completed-node check at `dialectical_v2.py:1889-1890`:

```python
    if node.status != "complete" or not node.active_generation_id:
        raise ValueError("Expansion target must be a completed argument node")
    if node.depth >= expansion_depth_limit():
        raise ValueError(
            f"Expansion target is at or beyond the depth limit ({expansion_depth_limit()})"
        )
```

Placed after the completeness check so the existing error precedence is unchanged for nodes that fail both.

- [ ] **Step 5: Run tests to verify they pass**

Run the command from Step 2. Expected: 3 passed.

- [ ] **Step 6: Verify the refusal is annotated, not silent**

`admit_and_spawn` (`expansion_dispatch.py:257-266`) already catches `ValueError` from `queue_v2_expand_job` and returns `OUTCOME_TARGET_NOT_EXPANDABLE`, which the dispatcher writes to `record.dispatch_outcome` (`expansion_dispatch.py:356`). No change needed — confirm by reading those lines and satisfying yourself the depth refusal flows through them.

- [ ] **Step 7: Mark `depth_budget` honestly advisory**

The spec (§5.1) says to retire `depth_budget` rather than leave inert config in place. **Deleting it is the wrong call** — it is emitted into `protocol_state.triage`, which is serialised to the API (`app/services/serialization.py`) and may be read by the web UI, so removing the key is a breaking payload change for a cosmetic gain. It is also a legitimate *classification* output; only its use as a *budget* was fictional.

Make it honest instead. In `coordinator/app/protocol/triage.py`, above `_DEPTH_BUDGET_BY_DIFFICULTY` (`triage.py:21`):

```python
# ADVISORY ONLY -- nothing reads this back as a budget. Enforced depth
# control lives in app.services.dialectical_v2.expansion_depth_limit(), and
# the frontier's real bound is the priority floor (P1 Task 6). This value
# records the triage classifier's difficulty read, nothing more. Do not
# reintroduce it as a control input without wiring an enforcement site.
```

Add the same one-line note where it is written at `app/protocol/state.py:52`.

- [ ] **Step 8: Run the full suite**

Run: `cd apps/dialectical-engine && make test`
Expected: 2421 passed / 4 skipped (plus your 3 new tests).

- [ ] **Step 9: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/services/dialectical_v2.py apps/dialectical-engine/coordinator/app/protocol/ apps/dialectical-engine/coordinator/tests/test_v2_depth_guard.py
git commit -m "feat(dialectical): hard depth guardrail on v2 expansion"
```

---

## Task 2: Collapse the quiescence query storm

`pending_generation_nodes` (`dialectical_v2.py:2462-2488`) runs on **every** POV and expand completion. It selects all outstanding job node_ids, then issues one `db.get(Node, ...)` per result. At 150 expansions against a single-writer SQLite this is a quadratic query storm competing with the judge panel for the writer.

**Files:**
- Modify: `coordinator/app/services/dialectical_v2.py:2462-2488`
- Test: `coordinator/tests/test_dialectical_v2.py` (extend)

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change. `pending_generation_nodes(db, debate_id, root_node_id) -> list[Node]` keeps its exact contract — same nodes, same order-insensitivity. This is a pure performance change.

- [ ] **Step 1: Write the failing test**

Append to `coordinator/tests/test_dialectical_v2.py`:

```python
def test_pending_generation_nodes_uses_bounded_query_count(db_session, monkeypatch):
    """P1 Task 2: quiescence must not issue one query per outstanding node.

    Runs on every POV/expand completion; at 150 expansions the per-node
    db.get loop competes with the judge panel for SQLite's single writer.
    """
    from sqlalchemy import event

    from app.services.dialectical_v2 import pending_generation_nodes

    debate, root, nodes = _v2_debate_with_n_outstanding_expand_jobs(db_session, n=12)

    statements: list[str] = []

    def _count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", _count)
    try:
        pending = pending_generation_nodes(db_session, debate.id, root.id)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", _count)

    assert {node.id for node in pending} >= {node.id for node in nodes}
    # Bounded: container query + one node query. Must not scale with n=12.
    assert len(statements) <= 4, f"expected <=4 statements, got {len(statements)}: {statements}"
```

You must write the `_v2_debate_with_n_outstanding_expand_jobs` helper in the same file. It creates a v2 debate with a root, `n` complete argument nodes, and one `pending` `v2_expand` job per node. Model it on the existing v2 fixtures in that file — read them first and match their construction exactly.

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_dialectical_v2.py::test_pending_generation_nodes_uses_bounded_query_count -v
```
Expected: FAIL — statement count scales with n (roughly 14+).

- [ ] **Step 3: Replace the per-node loop with a single IN query**

In `dialectical_v2.py`, replace the body after the `pending` dict construction:

```python
    outstanding_node_ids = db.scalars(
        select(Job.node_id).where(
            Job.debate_id == debate_id,
            Job.job_type.in_(V2_GENERATION_JOB_TYPES),
            Job.status.in_(OUTSTANDING_JOB_STATUSES),
            Job.node_id.is_not(None),
        )
    ).all()
    # P1 Task 2: one bulk fetch instead of a db.get per outstanding job.
    # This runs on every POV/expand completion; the per-node loop was a
    # quadratic query storm against SQLite's single writer at frontier
    # budgets. Semantics are unchanged: same node set, missing rows skipped.
    missing_ids = {node_id for node_id in outstanding_node_ids if node_id and node_id not in pending}
    if missing_ids:
        for node in db.scalars(select(Node).where(Node.id.in_(missing_ids))).all():
            pending[node.id] = node
    return list(pending.values())
```

- [ ] **Step 4: Run tests to verify they pass**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Run the quiescence-sensitive suites**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_dialectical_v2.py tests/test_v2_expand.py tests/test_score_before_synthesis.py tests/test_adaptive_expansion.py -v
```
Expected: all pass. These are the suites that assert on quiescence behaviour.

- [ ] **Step 6: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/services/dialectical_v2.py apps/dialectical-engine/coordinator/tests/test_dialectical_v2.py
git commit -m "perf(dialectical): bulk-fetch outstanding nodes in quiescence check"
```

---

## Task 3: Hierarchical synthesis payload

This is the hard blocker to deep trees. `render_v2_job_prompt` for `v2_synthesize` (`dialectical_v2.py:2856-2874`) serialises **every node in the debate together with its full `active_generation.argument` text**, with no truncation, cap, or summarisation. It is O(total nodes × argument length). At smoke4's 52 nodes it fit. A frontier run targeting depth 10 produces several hundred nodes, and this blows the context window **at the final step of a multi-hour run**.

**Files:**
- Create: `coordinator/app/synthesis/branch_summary.py`
- Create: `coordinator/app/synthesis/__init__.py`
- Modify: `coordinator/app/services/dialectical_v2.py:2856-2874`
- Test: `coordinator/tests/test_branch_summary.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `SYNTHESIS_LOAD_BEARING_K: int = 20`
  - `synthesis_load_bearing_k() -> int`
  - `build_synthesis_tree_payload(db, debate, *, load_bearing_k: int) -> dict` returning
    `{"branches": [...], "load_bearing": [...], "contested": [...], "omitted_count": int}`

  Task 7 reads `omitted_count` for the coverage record. No other task depends on this module.

- [ ] **Step 1: Write the failing test**

Create `coordinator/tests/test_branch_summary.py`:

```python
"""P1 Task 3: bounded synthesis payload.

render_v2_job_prompt serialised every node with its full argument text and
no cap -- O(nodes x argument length). At frontier depth this blows the
context window at the last step of a multi-hour run. The payload becomes
O(branches + K) instead, and must never silently drop nodes.
"""
from __future__ import annotations

from app.synthesis.branch_summary import (
    build_synthesis_tree_payload,
    synthesis_load_bearing_k,
)

from test_v2_expand import _v2_debate_with_complete_node


def test_load_bearing_k_default_is_twenty():
    assert synthesis_load_bearing_k() == 20


def test_payload_is_bounded_and_reports_omissions(db_session):
    debate, root = _v2_debate_with_deep_scored_tree(db_session, node_count=120)

    payload = build_synthesis_tree_payload(db_session, debate, load_bearing_k=20)

    assert len(payload["load_bearing"]) == 20
    assert payload["omitted_count"] > 0
    total_represented = (
        len(payload["load_bearing"]) + len(payload["contested"]) + payload["omitted_count"]
    )
    assert total_represented + len(payload["branches"]) >= 120


def test_load_bearing_ranked_by_impact_times_strength(db_session):
    debate, root = _v2_debate_with_deep_scored_tree(db_session, node_count=30)

    payload = build_synthesis_tree_payload(db_session, debate, load_bearing_k=5)

    products = [item["impact"] * item["strength"] for item in payload["load_bearing"]]
    assert products == sorted(products, reverse=True)


def test_contested_nodes_are_always_included_even_below_k(db_session):
    """A contested node is the point of the run; it must never be cut for rank."""
    debate, root = _v2_debate_with_deep_scored_tree(
        db_session, node_count=30, contested_node_index=29
    )

    payload = build_synthesis_tree_payload(db_session, debate, load_bearing_k=5)

    contested_ids = {item["node_id"] for item in payload["contested"]}
    assert len(contested_ids) == 1


def test_full_argument_text_only_for_load_bearing_and_contested(db_session):
    debate, root = _v2_debate_with_deep_scored_tree(db_session, node_count=60)

    payload = build_synthesis_tree_payload(db_session, debate, load_bearing_k=10)

    for item in payload["load_bearing"]:
        assert item.get("argument")
    for branch in payload["branches"]:
        assert "argument" not in branch
        assert branch.get("summary")
```

You must write `_v2_debate_with_deep_scored_tree(db_session, node_count, contested_node_index=None)` in this file. It builds a v2 debate whose tree has `node_count` complete argument nodes spread across POV branches, each with a `Generation` carrying a non-empty `argument`, and a persisted `node_scoring` `AnalyzerRun` giving each node an `impact` and `strength`. When `contested_node_index` is set, that node's scoring item carries `uncertainty_source: "dispersion"` and a `disagreement_status` of `"present"`. Read `tests/test_adaptive_expansion.py` and `tests/test_score_before_synthesis.py` for the exact shapes these fixtures use — do not invent a scoring payload shape.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_branch_summary.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'app.synthesis'`.

- [ ] **Step 3: Create the package**

Create `coordinator/app/synthesis/__init__.py`:

```python
"""Synthesis payload construction (P1 Task 3)."""
```

- [ ] **Step 4: Write the module**

Create `coordinator/app/synthesis/branch_summary.py`:

```python
"""Bounded synthesis payload (P1 Task 3).

The v2 synthesis prompt previously serialised EVERY node with its full
argument text (dialectical_v2.py, pre-P1) -- O(total nodes x argument
length) with no cap. At frontier budgets that is several hundred nodes and
it fails at the last step of a multi-hour run.

The payload is now O(branches + K):
  - one bounded summary per POV branch
  - the top-K load-bearing nodes in full, ranked by impact x strength
  - every contested node in full, regardless of rank (a contested node is
    the point of the run -- see docs/superpowers/specs/
    2026-07-24-contested-frontier-deliberation-design.md section 5.2)
  - an honest omitted_count; nodes are never silently dropped
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import int_env
from app.models.entities import Debate, Generation, Node

SYNTHESIS_LOAD_BEARING_K = 20

# Per-branch summary budget, in characters of argument text. Bounded so the
# branch section cannot grow with subtree size.
BRANCH_SUMMARY_CHAR_BUDGET = 1200


def synthesis_load_bearing_k() -> int:
    return int_env("DIALECTICAL_SYNTHESIS_LOAD_BEARING_K", SYNTHESIS_LOAD_BEARING_K, 5, 100)


def _scored_items(db: Session, debate: Debate) -> dict[str, dict[str, Any]]:
    """Latest persisted node_scoring items, keyed by node id.

    Returns {} when no scoring run exists, which degrades the payload to
    branch summaries only -- honest, not fatal.
    """
    from app.models.entities import AnalyzerRun

    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "node_scoring",
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    output = getattr(run, "output", None)
    if not isinstance(output, dict):
        return {}
    items = output.get("items")
    if not isinstance(items, list):
        return {}
    return {
        str(item.get("node_id")): item
        for item in items
        if isinstance(item, dict) and item.get("node_id")
    }


def _is_contested(item: dict[str, Any]) -> bool:
    provenance = item.get("score_provenance")
    if not isinstance(provenance, dict):
        return False
    status = provenance.get("disagreement_status")
    return isinstance(status, dict) and status.get("status") == "present"


def build_synthesis_tree_payload(
    db: Session, debate: Debate, *, load_bearing_k: int
) -> dict[str, Any]:
    nodes = list(
        db.scalars(
            select(Node)
            .where(Node.debate_id == debate.id)
            .order_by(Node.materialized_path.asc())
        ).all()
    )
    scored = _scored_items(db, debate)

    generations: dict[str, str] = {}
    generation_ids = [n.active_generation_id for n in nodes if n.active_generation_id]
    if generation_ids:
        for generation in db.scalars(
            select(Generation).where(Generation.id.in_(generation_ids))
        ).all():
            generations[generation.id] = generation.argument or ""

    def _argument(node: Node) -> str:
        return generations.get(node.active_generation_id or "", "")

    def _score(node: Node, field: str) -> float:
        item = scored.get(node.id) or {}
        scores = item.get("scores")
        value = scores.get(field) if isinstance(scores, dict) else None
        return float(value) if isinstance(value, (int, float)) else 0.0

    contested_nodes = [n for n in nodes if _is_contested(scored.get(n.id) or {})]
    contested_ids = {n.id for n in contested_nodes}

    rankable = [n for n in nodes if n.node_type in {"PRO", "CON"} and n.id not in contested_ids]
    rankable.sort(key=lambda n: (-(_score(n, "impact") * _score(n, "strength")), n.id))
    load_bearing = rankable[:load_bearing_k]
    load_bearing_ids = {n.id for n in load_bearing}

    def _full(node: Node) -> dict[str, Any]:
        return {
            "node_id": node.id,
            "parent_id": node.parent_id,
            "node_type": node.node_type,
            "depth": node.depth,
            "claim": node.claim,
            "argument": _argument(node),
            "impact": _score(node, "impact"),
            "strength": _score(node, "strength"),
        }

    branches = []
    for node in nodes:
        if not node.node_type.endswith("_POV"):
            continue
        subtree = [n for n in nodes if n.materialized_path.startswith(node.materialized_path)]
        pieces: list[str] = []
        used = 0
        for child in subtree:
            text = (child.claim or "").strip()
            if not text:
                continue
            if used + len(text) > BRANCH_SUMMARY_CHAR_BUDGET:
                break
            pieces.append(text)
            used += len(text)
        branches.append(
            {
                "node_id": node.id,
                "lens": node.claim,
                "node_type": node.node_type,
                "subtree_size": len(subtree),
                "summary": " | ".join(pieces),
            }
        )

    represented = load_bearing_ids | contested_ids | {b["node_id"] for b in branches}
    omitted_count = len([n for n in nodes if n.id not in represented])

    return {
        "branches": branches,
        "load_bearing": [_full(n) for n in load_bearing],
        "contested": [_full(n) for n in contested_nodes],
        "omitted_count": omitted_count,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run the command from Step 2. Expected: 5 passed. Fix the module, not the tests, if any fail.

- [ ] **Step 6: Wire it into the prompt, flag-gated**

In `dialectical_v2.py`, replace the `tree_nodes = [...]` comprehension at `2856-2874` with:

```python
        # P1 Task 3: bounded payload. Flag OFF renders the historical
        # every-node-with-full-argument list byte-identically; flag ON
        # renders O(branches + K). See app/synthesis/branch_summary.py.
        if bool_env("DIALECTICAL_HIERARCHICAL_SYNTHESIS", False):
            from app.synthesis.branch_summary import (
                build_synthesis_tree_payload,
                synthesis_load_bearing_k,
            )

            tree_nodes = build_synthesis_tree_payload(
                db, debate, load_bearing_k=synthesis_load_bearing_k()
            )
        else:
            tree_nodes = [
                # ... the existing comprehension, unchanged ...
            ]
```

Keep the existing comprehension verbatim in the `else` branch. Do not reformat it — a diff that touches those lines makes the byte-identity claim unverifiable.

- [ ] **Step 7: Prove flag-off byte identity**

Add to `tests/test_branch_summary.py`:

```python
def test_flag_off_renders_historical_payload_unchanged(db_session, monkeypatch):
    from app.services.dialectical_v2 import render_v2_job_prompt

    monkeypatch.delenv("DIALECTICAL_HIERARCHICAL_SYNTHESIS", raising=False)
    debate, root = _v2_debate_with_deep_scored_tree(db_session, node_count=8)
    job = _v2_synthesize_job(db_session, debate)

    rendered = render_v2_job_prompt(db_session, job)

    assert '"active_generation"' in rendered
    assert '"load_bearing"' not in rendered
```

Write `_v2_synthesize_job` in the same file, modelled on the synthesis-job fixtures in `tests/test_score_before_synthesis.py`.

- [ ] **Step 8: Run the full suite**

Run: `cd apps/dialectical-engine && make test`
Expected: baseline green plus your new tests.

- [ ] **Step 9: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/synthesis/ apps/dialectical-engine/coordinator/app/services/dialectical_v2.py apps/dialectical-engine/coordinator/tests/test_branch_summary.py
git commit -m "feat(dialectical): bounded hierarchical synthesis payload (flag-gated)"
```

---

## Task 4: Fix signal-class contamination

`_decision` classifies a decision categorical iff **every** grounding reason is categorical (`policy.py:349-353`). But each reason in `_challenge_reasons` and `_seek_evidence_reasons` is *independently sufficient* to fire its action — the caller fires on a non-empty list (`policy.py:205-222`). So appending a scalar corroboration to a categorically-grounded decision **downgrades** it. Worse, `seek_evidence` folds `abandon_blockers` into its grounding tuple (`policy.py:221`), and those are reasons not to abandon — not grounding for seeking evidence at all.

Result: all 6 lifecycle decisions ever recorded are `scalar`, so THE LAW blocks 100% of expansion.

**Files:**
- Modify: `coordinator/app/exploration/policy.py:214-222, 337-361`
- Test: `coordinator/tests/test_expansion_policy_signal_class.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: no signature change. `ExpansionDecision.signal_class` semantics change from "all reasons categorical" to "at least one *sufficient* reason is categorical". `_decision` gains a keyword-only `blockers: tuple[tuple[str, str], ...] = ()` parameter that records non-grounding context without affecting classification.

- [ ] **Step 1: Write the failing test**

Create `coordinator/tests/test_expansion_policy_signal_class.py`:

```python
"""P1 Task 4: signal-class contamination.

THE LAW (expansion_dispatch.py:330-335) lets only categorical decisions
spawn work. Across the entire production database, 6 lifecycle decisions
have ever existed and all 6 are scalar -- so the law blocks 100% of
expansion. Cause: _decision required EVERY reason to be categorical, but
each reason is independently sufficient to fire the action, so adding a
scalar corroboration DOWNGRADED a categorically-grounded decision. And
seek_evidence folded abandon_blockers -- reasons not to abandon -- into
its grounding tuple.
"""
from __future__ import annotations

from app.exploration.policy import CATEGORICAL_SIGNAL, SCALAR_SIGNAL, ExpansionPolicy


def test_categorical_reason_survives_a_scalar_corroboration(make_score_signal, make_evidence_signal):
    """A claim whose evidence is categorically unresolved AND whose scoring
    also recommends find_evidence is BETTER grounded, not worse."""
    policy = ExpansionPolicy()
    score = make_score_signal(
        claim_type="empirical",
        evidence_quality=0.0,
        recommended_actions=["find_evidence"],
    )
    evidence = make_evidence_signal(status="unresolved")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "seek_evidence"
    assert decision.signal_class == CATEGORICAL_SIGNAL


def test_abandon_blockers_do_not_ground_the_decision(make_score_signal, make_evidence_signal):
    policy = ExpansionPolicy()
    score = make_score_signal(
        claim_type="empirical",
        evidence_quality=0.0,
        uncertainty=0.9,
        impact=0.9,
        recommended_actions=[],
    )
    evidence = make_evidence_signal(status="unresolved")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.signal_class == CATEGORICAL_SIGNAL


def test_purely_scalar_decision_stays_scalar(make_score_signal, make_evidence_signal):
    """THE LAW must still hold: nothing scalar-only may become categorical."""
    policy = ExpansionPolicy()
    score = make_score_signal(
        claim_type="normative",
        assumption_risk=0.95,
        recommended_actions=[],
    )
    evidence = make_evidence_signal(status="grounded")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "deepen"
    assert decision.signal_class == SCALAR_SIGNAL
```

You must add `make_score_signal` and `make_evidence_signal` fixtures to `coordinator/tests/conftest.py`. Read `app/exploration/policy.py`'s `ScoreSignal` and `EvidenceSignal` dataclasses first and build factories with sensible defaults that each test overrides by keyword.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_expansion_policy_signal_class.py -v
```
Expected: the first two FAIL (`assert 'scalar' == 'categorical'`), the third PASSES.

- [ ] **Step 3: Separate blockers from grounding**

In `policy.py`, change the `seek_evidence` branch at `214-222`:

```python
        evidence_reasons = self._seek_evidence_reasons(score, evidence)
        abandon_blockers = self._abandon_blockers(score, evidence)
        if evidence_reasons:
            return self._decision(
                score,
                "seek_evidence",
                priority=max(score.impact, score.uncertainty, 1.0 - score.evidence_quality),
                reasons=tuple(evidence_reasons),
                # P1 Task 4: blockers are reasons NOT to abandon; they are
                # recorded as context but never ground the seek_evidence
                # decision, so a scalar blocker can no longer contaminate a
                # categorically-grounded one.
                blockers=tuple(abandon_blockers),
            )
```

- [ ] **Step 4: Change the classification rule**

Replace `_decision` at `policy.py:337-361`:

```python
    @staticmethod
    def _decision(
        score: ScoreSignal,
        action: ExpansionAction,
        *,
        priority: float,
        reasons: tuple[tuple[str, str], ...],
        blockers: tuple[tuple[str, str], ...] = (),
        keeps_path_active: bool = True,
    ) -> ExpansionDecision:
        # P1 Task 4: categorical iff AT LEAST ONE grounding reason is
        # categorical. Every reason in _challenge_reasons /
        # _seek_evidence_reasons is independently sufficient to fire its
        # action (the caller fires on a non-empty list), so a categorical
        # reason alone would have produced this same decision. The previous
        # all() rule meant additional scalar corroboration DOWNGRADED a
        # categorically-grounded decision, which is backwards -- and it is
        # why 6 of 6 production decisions were scalar.
        #
        # THE LAW is unchanged in substance: a decision with no categorical
        # reason still cannot spawn. Blockers never participate.
        signal_class = (
            CATEGORICAL_SIGNAL
            if any(reason_class == CATEGORICAL_SIGNAL for _, reason_class in reasons)
            else SCALAR_SIGNAL
        )
        return ExpansionDecision(
            node_id=score.node_id,
            action=action,
            priority=min(1.0, max(0.0, priority)),
            reasons=tuple(reason for reason, _ in reasons)
            + tuple(reason for reason, _ in blockers),
            keeps_path_active=keeps_path_active,
            signal_class=signal_class,
        )
```

Blocker text is still carried in `reasons` for the audit trail — only classification stops seeing it.

- [ ] **Step 5: Run tests to verify they pass**

Run the command from Step 2. Expected: 3 passed.

- [ ] **Step 6: Run the policy and dispatch suites**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_adaptive_expansion.py tests/test_budgeted_expansion.py -v -k "law or signal or scalar or categorical"
```

Existing tests assert THE LAW. If one now fails **because a decision it built is legitimately categorical under the corrected rule**, update that test and note why in the commit body. If one fails because something scalar-only became categorical, **the implementation is wrong** — fix `policy.py`, not the test.

- [ ] **Step 7: Run the full suite**

Run: `cd apps/dialectical-engine && make test`

- [ ] **Step 8: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/exploration/policy.py apps/dialectical-engine/coordinator/tests/test_expansion_policy_signal_class.py apps/dialectical-engine/coordinator/tests/conftest.py
git commit -m "fix(dialectical): scalar corroboration no longer downgrades categorical decisions"
```

---

## Task 5: Cross-family disagreement as a categorical predicate

Even with Task 4, `challenge` — the CON expansion the whole objective depends on — has no categorical route. `_challenge_reasons` (`policy.py:251-264`) requires adverse evidence status / `REFUTES` entailment, or a `contradiction:high` fatal flag. Smoke4 produced neither.

This task adds one predicate: **judge families materially disagree about this node.** It is categorical in the same sense `contradiction:high` fatal-flag membership is — a factual test over judge output, not an uncalibrated scalar treated as truth.

The detection threshold replaces the composite 0.35 gate at `app/scoring/disagreement.py:72`, which has never fired: the panel's largest observed composite spread was 0.11.

**Files:**
- Modify: `coordinator/app/scoring/disagreement.py:59-81`
- Modify: `coordinator/app/exploration/lifecycle_inputs.py` (carry the flag onto `ScoreSignal`)
- Modify: `coordinator/app/exploration/policy.py:251-264`
- Test: `coordinator/tests/test_cross_family_disagreement.py` (create)

**Interfaces:**
- Consumes: `CATEGORICAL_SIGNAL` semantics from Task 4.
- Produces:
  - `PIVOTAL_FIELDS: tuple[str, ...]` and `DISAGREEMENT_FIELD_THRESHOLD: float = 0.25` in `app.scoring.disagreement`
  - `field_spreads(judge_evidence: list[dict]) -> dict[str, float]`
  - `ScoreSignal.judges_disagree: bool` (default `False`)

- [ ] **Step 1: Write the failing test**

Create `coordinator/tests/test_cross_family_disagreement.py`:

```python
"""P1 Task 5: cross-family disagreement as a categorical predicate.

Smoke4 measured real dispersion -- critic.logical_validity mean spread
0.196, max 0.45, 5 nodes at >=0.30 -- yet every node recorded
disagreement_status "none", because disagreement.py:72 gates at 0.35 on a
COMPOSITE signal whose largest observed spread was 0.11.

Per-field detection replaces it, and a disagreeing panel becomes a
categorical ground for challenge: "these families assigned materially
different values" is a fact about the judging process, not an uncalibrated
scalar treated as truth.
"""
from __future__ import annotations

from app.exploration.policy import CATEGORICAL_SIGNAL, ExpansionPolicy
from app.scoring.disagreement import (
    DISAGREEMENT_FIELD_THRESHOLD,
    detect_persisted_judge_disagreements,
    field_spreads,
)


def test_threshold_default_is_point_two_five():
    assert DISAGREEMENT_FIELD_THRESHOLD == 0.25


def test_field_spreads_reports_per_field_max_minus_min(make_judge_evidence):
    evidence = [
        make_judge_evidence(judge_role="judge", logical_validity=0.38),
        make_judge_evidence(judge_role="judge_panel_claude", logical_validity=0.55),
        make_judge_evidence(judge_role="judge_panel_gemini", logical_validity=0.50),
    ]

    spreads = field_spreads(evidence)

    assert abs(spreads["logical_validity"] - 0.17) < 1e-6


def test_smoke4_shaped_spread_now_detected(make_judge_evidence):
    """Node 7809a51f: logical_validity 0.42 / 0.35 / 0.80 -- spread 0.45.
    The old composite gate reported "none" for this."""
    evidence = [
        make_judge_evidence(judge_role="judge", logical_validity=0.42),
        make_judge_evidence(judge_role="judge_panel_claude", logical_validity=0.35),
        make_judge_evidence(judge_role="judge_panel_gemini", logical_validity=0.80),
    ]

    disagreements = detect_persisted_judge_disagreements(evidence)

    assert disagreements
    assert disagreements[0].type == "cross_family_field_spread"


def test_agreeing_panel_reports_no_disagreement(make_judge_evidence):
    evidence = [
        make_judge_evidence(judge_role="judge", logical_validity=0.50),
        make_judge_evidence(judge_role="judge_panel_claude", logical_validity=0.55),
        make_judge_evidence(judge_role="judge_panel_gemini", logical_validity=0.52),
    ]

    assert detect_persisted_judge_disagreements(evidence) == []


def test_single_judge_never_disagrees(make_judge_evidence):
    assert detect_persisted_judge_disagreements([make_judge_evidence()]) == []


def test_judge_disagreement_is_categorical_ground_for_challenge(make_score_signal, make_evidence_signal):
    policy = ExpansionPolicy()
    score = make_score_signal(judges_disagree=True, fatal_flags=[])
    evidence = make_evidence_signal(status="grounded")

    decision = policy.decide(score=score, evidence=evidence)

    assert decision.action == "challenge"
    assert decision.signal_class == CATEGORICAL_SIGNAL
```

Add a `make_judge_evidence` fixture to `conftest.py` producing the dict shape `_distinct_persisted_judge_evidence` consumes (`disagreement.py:84-115`) — read that function and `_persisted_judge_evidence_for_node` (`app/scoring/service.py:1484-1526`) to get the exact keys, including a valid `ClaimAssessment` under `"assessment"`.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_cross_family_disagreement.py -v
```
Expected: FAIL with `ImportError: cannot import name 'field_spreads'`.

- [ ] **Step 3: Add per-field detection**

In `coordinator/app/scoring/disagreement.py`, add above `detect_persisted_judge_disagreements`:

```python
# P1 Task 5: per-field cross-family detection. The previous gate compared
# _claim_strength_signal -- a weighted composite of five fields -- at 0.35.
# Averaging across fields shrinks spread: smoke4's root node had a raw
# logical_validity spread of 0.17 (0.38/0.55/0.50) but a composite spread of
# 0.11, and the panel's largest observed composite spread across 26 nodes
# was 0.11. The gate could not fire and never did.
PIVOTAL_FIELDS: tuple[tuple[str, str], ...] = (
    ("critic", "logical_validity"),
    ("steelman", "charitable_strength"),
    ("evidence", "evidence_quality"),
    ("context", "impact"),
)
DISAGREEMENT_FIELD_THRESHOLD = 0.25


def field_spreads(judge_evidence: list[dict]) -> dict[str, float]:
    """Per-field max-minus-min across distinct judges. Fields any judge
    omitted are absent from the result rather than defaulted to zero."""
    distinct = _distinct_persisted_judge_evidence(judge_evidence)
    spreads: dict[str, float] = {}
    if len(distinct) < 2:
        return spreads
    for section, field in PIVOTAL_FIELDS:
        values: list[float] = []
        for item in distinct:
            assessment = item.get("assessment")
            block = getattr(assessment, section, None)
            value = getattr(block, field, None)
            if isinstance(value, (int, float)):
                values.append(float(value))
        if len(values) >= 2:
            spreads[field] = max(values) - min(values)
    return spreads
```

- [ ] **Step 4: Replace the composite gate**

Replace the body of `detect_persisted_judge_disagreements` after its `< 2` guards:

```python
    spreads = field_spreads(judge_evidence)
    contested = {
        field: spread
        for field, spread in spreads.items()
        if spread >= DISAGREEMENT_FIELD_THRESHOLD
    }
    if not contested:
        return []
    widest = max(contested.items(), key=lambda pair: pair[1])
    return [
        JudgeDisagreement(
            judges=sorted({str(item["judge_role"]) for item in distinct_evidence}),
            type="cross_family_field_spread",
            severity="high",
            description=(
                f"Judge families disagree on {widest[0]} by {widest[1]:.2f} "
                f"(threshold {DISAGREEMENT_FIELD_THRESHOLD})."
            ),
        )
    ]
```

- [ ] **Step 5: Carry the flag onto ScoreSignal**

In `app/exploration/policy.py`, add to the `ScoreSignal` dataclass:

```python
    # P1 Task 5: set when the persisted panel disagreed on a pivotal field.
    judges_disagree: bool = False
```

In `app/exploration/lifecycle_inputs.py`, populate it where `ScoreSignal` is constructed, reading `score_provenance.disagreement_status.status == "present"` from the persisted scoring item. Read that file first and follow how the other fields are extracted — do not invent a different access path.

- [ ] **Step 6: Add the categorical challenge reason**

In `policy.py`, append to `_challenge_reasons`:

```python
        if score.judges_disagree:
            # Categorical: a MEMBERSHIP test over persisted judge artifacts
            # ("these families assigned materially different values"), not an
            # uncalibrated scalar treated as ground truth. Same character as
            # the contradiction:high fatal-flag test above. See
            # docs/superpowers/specs/2026-07-24-contested-frontier-
            # deliberation-design.md section 5.2.
            reasons.append(("judge families materially disagree", CATEGORICAL_SIGNAL))
```

- [ ] **Step 7: Run tests to verify they pass**

Run the command from Step 2. Expected: 6 passed.

- [ ] **Step 8: Replay against smoke4's real artifacts and report the threshold curve**

The spec requires the threshold be chosen against data, not defended. Write `coordinator/tests/test_cross_family_disagreement_replay.py` that loads the 78 real judge artifacts from debate `f67ad244-a37f-44cd-9008-31df0ef87bfe` (export them to a JSON fixture first; do **not** have tests read the live database) and asserts:

```python
def test_replay_smoke4_contested_counts(smoke4_judge_artifacts):
    counts = {}
    for threshold in (0.20, 0.25, 0.30):
        counts[threshold] = _contested_node_count(smoke4_judge_artifacts, threshold)
    # Recorded for the record; the design requires >=3 contested at the
    # chosen threshold, versus 0 under the old composite gate.
    assert counts[0.25] >= 3
    print(f"contested-node counts by threshold: {counts}")
```

Export the fixture with:
```bash
sqlite3 "file:$HOME/.dialectical/db.sqlite3?mode=ro" -readonly -json \
  "SELECT node_id, judge_role, model, assessment FROM judge_output_artifacts WHERE debate_id='f67ad244-a37f-44cd-9008-31df0ef87bfe';" \
  > apps/dialectical-engine/coordinator/tests/fixtures/smoke4_judge_artifacts.json
```

Report the three counts in the commit body. If 0.25 yields fewer than 3, **do not lower the threshold to pass the test** — report the finding and stop for review.

- [ ] **Step 9: Run the full suite**

Run: `cd apps/dialectical-engine && make test`

Expect failures in tests asserting the old `persisted_judge_strength_gap` type. Update those to the new type and threshold; each such change belongs in this commit.

- [ ] **Step 10: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/scoring/disagreement.py apps/dialectical-engine/coordinator/app/exploration/ apps/dialectical-engine/coordinator/tests/
git commit -m "feat(dialectical): per-field cross-family disagreement as categorical challenge ground"
```

---

## Task 6: Frontier priority ordering and wave width

`expansion_dispatch` currently walks decisions in creation order (`expansion_dispatch.py:309`) and spawns until a budget refuses. With budgets at 150 that is first-come-first-served, not "spend where families disagree."

Ordering by `impact × uncertainty × dispersion` uses scalars — but only to **rank and truncate work that THE LAW has already authorised**. No scalar causes a spawn that would not otherwise have happened. That distinction is the whole reason this is legal, and it must be stated in the code.

**Files:**
- Modify: `coordinator/app/exploration/expansion_dispatch.py:301-320`
- Test: `coordinator/tests/test_frontier_priority.py` (create)

**Interfaces:**
- Consumes: `expansion_depth_limit` (Task 1); `judges_disagree` / `field_spreads` (Task 5).
- Produces:
  - `PRIORITY_FLOOR: float = 0.15`, `expansion_priority_floor() -> float`
  - `EXPANSION_WAVE_WIDTH: int = 12`, `expansion_wave_width() -> int`
  - `frontier_priority(score_item: dict) -> float`
  - `OUTCOME_BELOW_PRIORITY_FLOOR: str`, `STOPPED_BELOW_PRIORITY_FLOOR: str`

- [ ] **Step 1: Write the failing test**

Create `coordinator/tests/test_frontier_priority.py`:

```python
"""P1 Task 6: frontier ordering.

Scalars rank and truncate work THE LAW has already authorised; they never
authorise it. A scalar-grounded decision is still unable to spawn no matter
how high its priority.
"""
from __future__ import annotations

from app.exploration.expansion_dispatch import (
    OUTCOME_BELOW_PRIORITY_FLOOR,
    expansion_priority_floor,
    expansion_wave_width,
    frontier_priority,
)


def test_defaults():
    assert expansion_priority_floor() == 0.15
    assert expansion_wave_width() == 12


def test_priority_is_impact_times_uncertainty_times_dispersion():
    score_item = {"scores": {"impact": 0.8, "uncertainty": 0.5}, "max_field_spread": 0.4}
    assert abs(frontier_priority(score_item) - (0.8 * 0.5 * 1.4)) < 1e-9


def test_undisputed_node_is_not_penalised_below_its_merit():
    score_item = {"scores": {"impact": 0.8, "uncertainty": 0.5}, "max_field_spread": 0.0}
    assert abs(frontier_priority(score_item) - 0.40) < 1e-9


def test_missing_scores_yield_zero_priority():
    assert frontier_priority({}) == 0.0


def test_dispatch_orders_by_priority_and_truncates_to_wave_width(
    db_session, monkeypatch, categorical_decisions_factory
):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_EXPANSION_WAVE_WIDTH", "3")
    debate, records, run_id = categorical_decisions_factory(
        db_session, priorities=[0.1, 0.9, 0.5, 0.7, 0.3]
    )

    from app.exploration.expansion_dispatch import expansion_dispatch

    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_id)

    spawned = [r for r in records if r.dispatch_outcome == "spawned"]
    assert len(spawned) == 3
    assert sorted(r.frontier_priority for r in spawned) == [0.5, 0.7, 0.9]


def test_below_floor_is_refused_with_an_honest_outcome(
    db_session, monkeypatch, categorical_decisions_factory
):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = categorical_decisions_factory(db_session, priorities=[0.01])

    from app.exploration.expansion_dispatch import expansion_dispatch

    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_id)

    assert records[0].dispatch_outcome == OUTCOME_BELOW_PRIORITY_FLOOR


def test_scalar_decision_with_top_priority_still_cannot_spawn(
    db_session, monkeypatch, scalar_decisions_factory
):
    """THE LAW is untouched by ordering."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    debate, records, run_id = scalar_decisions_factory(db_session, priorities=[0.99])

    from app.exploration.expansion_dispatch import expansion_dispatch

    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_id)

    assert records[0].dispatch_outcome == "annotate_only_scalar_signal"
```

Write `categorical_decisions_factory` and `scalar_decisions_factory` in `conftest.py`. Each builds a v2 debate with N complete PRO/CON nodes, a `node_scoring` AnalyzerRun whose items give each node scores producing the requested priority, and one `LifecycleDecisionRecord` per node with `input_state="grounded"`, `decision="challenge"`, and the requested `signal_class`. Model them on the record construction in `tests/test_adaptive_expansion.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_frontier_priority.py -v
```
Expected: FAIL with `ImportError: cannot import name 'frontier_priority'`.

- [ ] **Step 3: Add a migration for the audit column**

`LifecycleDecisionRecord` needs `frontier_priority` so the ordering is auditable. Create `coordinator/migrations/versions/00NN_lifecycle_frontier_priority.py` — read the most recent migration in that directory and copy its structure exactly, including the `down_revision` chain:

```python
def upgrade() -> None:
    op.add_column(
        "lifecycle_decision_records",
        sa.Column("frontier_priority", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lifecycle_decision_records", "frontier_priority")
```

Add the matching mapped column to `LifecycleDecisionRecord` in `app/models/entities.py`, nullable, defaulting to `None`.

- [ ] **Step 4: Add the priority helpers**

In `expansion_dispatch.py`, after the budget accessors:

```python
# P1 Task 6: frontier ordering.
#
# THE LAW IS UNCHANGED. Scalars here only RANK and TRUNCATE work that
# categorical grounding has already authorised. No scalar can cause a spawn
# that would not otherwise have happened -- signal_class is still the sole
# gate (see the dispatch loop below). Ordering a legal set is not the same
# act as authorising it, which is why this is consistent with the
# categorical-only steering law rather than an exception to it.
EXPANSION_PRIORITY_FLOOR_ENV = "DIALECTICAL_EXPANSION_PRIORITY_FLOOR"
EXPANSION_WAVE_WIDTH_ENV = "DIALECTICAL_EXPANSION_WAVE_WIDTH"
PRIORITY_FLOOR = 0.15
EXPANSION_WAVE_WIDTH = 12

OUTCOME_BELOW_PRIORITY_FLOOR = "below_priority_floor"
STOPPED_BELOW_PRIORITY_FLOOR = "below_priority_floor"


def expansion_priority_floor() -> float:
    return float_env(EXPANSION_PRIORITY_FLOOR_ENV, PRIORITY_FLOOR, 0.0, 1.0)


def expansion_wave_width() -> int:
    return int_env(EXPANSION_WAVE_WIDTH_ENV, EXPANSION_WAVE_WIDTH, 1, 64)


def frontier_priority(score_item: dict[str, Any]) -> float:
    """impact x uncertainty x (1 + max cross-family field spread).

    The dispersion term is 1-based so an undisputed node is never pushed
    below its own impact x uncertainty merit -- disagreement promotes, it
    never demotes.
    """
    scores = score_item.get("scores") if isinstance(score_item, dict) else None
    if not isinstance(scores, dict):
        return 0.0
    impact = scores.get("impact")
    uncertainty = scores.get("uncertainty")
    if not isinstance(impact, (int, float)) or not isinstance(uncertainty, (int, float)):
        return 0.0
    spread = score_item.get("max_field_spread")
    spread_value = float(spread) if isinstance(spread, (int, float)) else 0.0
    return float(impact) * float(uncertainty) * (1.0 + spread_value)
```

If `float_env` does not exist in `app.core.config`, add it beside `int_env` following that function's clamping style exactly.

- [ ] **Step 5: Order and truncate in the dispatch loop**

In `expansion_dispatch`, after `dispatchable` is built (`expansion_dispatch.py:312`):

```python
    dispatchable = [record for record in records if record.decision in DECISION_POLARITY]

    # P1 Task 6: rank the ALREADY-AUTHORISED set, then take the wave. Scalar
    # records stay in the list so they still receive their honest
    # annotate_only outcome below -- ordering must not silence them.
    score_items = _score_items_by_node(db, debate_id)
    for record in dispatchable:
        record.frontier_priority = frontier_priority(score_items.get(record.node_id, {}))
    dispatchable.sort(
        key=lambda r: (-(r.frontier_priority or 0.0), r.created_at, r.id)
    )
    floor = expansion_priority_floor()
    width = expansion_wave_width()
    admitted = 0
```

Then inside the loop, after the `signal_class` check and before the rounds check:

```python
            if (record.frontier_priority or 0.0) < floor:
                record.dispatch_outcome = OUTCOME_BELOW_PRIORITY_FLOOR
                outcomes.append(OUTCOME_BELOW_PRIORITY_FLOOR)
                continue
            if admitted >= width:
                record.dispatch_outcome = OUTCOME_BUDGET_EXHAUSTED
                outcomes.append(OUTCOME_BUDGET_EXHAUSTED)
                continue
```

and increment `admitted` alongside `spawned += 1`.

Add `_score_items_by_node` to the same module:

```python
def _score_items_by_node(db: Session, debate_id: str) -> dict[str, dict[str, Any]]:
    """Latest node_scoring items keyed by node id, each annotated with the
    node's widest cross-family field spread (P1 Task 5) so frontier_priority
    can read both from one dict."""
    from app.models.entities import AnalyzerRun, JudgeOutputArtifact
    from app.scoring.disagreement import field_spreads
    from app.scoring.service import _persisted_judge_evidence_for_node

    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == "node_scoring",
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    output = getattr(run, "output", None)
    items = output.get("items") if isinstance(output, dict) else None
    if not isinstance(items, list):
        return {}

    by_node: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        node_id = item.get("node_id")
        if not node_id:
            continue
        spreads = field_spreads(_persisted_judge_evidence_for_node(db, debate_id, str(node_id)))
        enriched = dict(item)
        enriched["max_field_spread"] = max(spreads.values()) if spreads else 0.0
        by_node[str(node_id)] = enriched
    return by_node
```

`_persisted_judge_evidence_for_node` is private to `app/scoring/service.py:1484-1526`. Read its actual signature before wiring this — if it does not accept `(db, debate_id, node_id)` in that order, adapt the call rather than the function, and if importing a private name across modules conflicts with house style, promote it to a public name in `service.py` in this same commit.

- [ ] **Step 6: Add the stop reason**

In `_stopped_because_for_pass`, before the final fallback:

```python
    if OUTCOME_BELOW_PRIORITY_FLOOR in outcomes:
        return STOPPED_BELOW_PRIORITY_FLOOR
```

Add `STOPPED_BELOW_PRIORITY_FLOOR` to the reason-copy vocabulary in `app/exploration/reason_copy.py` — read that file's existing entries and match their tone.

- [ ] **Step 7: Run tests to verify they pass**

Run the command from Step 2. Expected: 7 passed.

- [ ] **Step 8: Run the full suite**

Run: `cd apps/dialectical-engine && make test`

- [ ] **Step 9: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/exploration/ apps/dialectical-engine/coordinator/app/models/entities.py apps/dialectical-engine/coordinator/migrations/ apps/dialectical-engine/coordinator/tests/
git commit -m "feat(dialectical): rank the expansion frontier by impact x uncertainty x dispersion"
```

---

## Task 7: Convergence and wall-clock stop conditions

Smoke4's post-scoring protocol run recorded `converged: false, maxDelta: 0.226, epsilon: 0.05` — scores were still moving at 4.5× the stability threshold when the engine stopped. The convergence test exists, ran, and failed, and nothing consumed it. With 12 waves available, the loop needs to stop when the tree settles rather than when the budget runs out.

Hysteresis matters: a single wave under epsilon can be noise. Two consecutive waves is the requirement.

**Files:**
- Modify: `coordinator/app/exploration/expansion_dispatch.py`
- Test: `coordinator/tests/test_frontier_priority.py` (extend)

**Interfaces:**
- Consumes: `adaptive_expansion_state` / `_write_adaptive_expansion_state` (existing).
- Produces:
  - `CONVERGED_WAVES_KEY: str = "converged_waves"`, `WAVE_DEADLINE_KEY: str = "wave_deadline"`
  - `STOPPED_CONVERGED: str`, `STOPPED_WALL_CLOCK: str`
  - `debate_wall_clock_seconds() -> int`

- [ ] **Step 1: Write the failing test**

Append to `coordinator/tests/test_frontier_priority.py`:

```python
def test_one_converged_wave_does_not_stop_the_loop(db_session, monkeypatch, converged_run_factory):
    """Hysteresis: a single wave under epsilon can be noise."""
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_id = converged_run_factory(db_session, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_id)

    assert stopped_because_of(debate) != "converged"


def test_two_consecutive_converged_waves_stop_the_loop(db_session, monkeypatch, converged_run_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db_session, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_a)
    debate, run_b = converged_run_factory(db_session, max_delta=0.02, epsilon=0.05, debate=debate)
    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_b)

    assert stopped_because_of(debate) == STOPPED_CONVERGED


def test_a_moving_wave_resets_the_converged_counter(db_session, monkeypatch, converged_run_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_CONVERGED,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, run_a = converged_run_factory(db_session, max_delta=0.01, epsilon=0.05)
    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_a)
    debate, run_b = converged_run_factory(db_session, max_delta=0.30, epsilon=0.05, debate=debate)
    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_b)
    debate, run_c = converged_run_factory(db_session, max_delta=0.01, epsilon=0.05, debate=debate)
    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_c)

    assert stopped_because_of(debate) != STOPPED_CONVERGED


def test_wall_clock_ceiling_stops_expansion(db_session, monkeypatch, categorical_decisions_factory):
    monkeypatch.setenv("DIALECTICAL_ADAPTIVE_EXPANSION", "1")
    monkeypatch.setenv("DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS", "1")
    from app.exploration.expansion_dispatch import (
        STOPPED_WALL_CLOCK,
        expansion_dispatch,
        stopped_because_of,
    )

    debate, records, run_id = categorical_decisions_factory(db_session, priorities=[0.9])
    debate.created_at = debate.created_at.replace(year=debate.created_at.year - 1)
    db_session.flush()

    expansion_dispatch(db_session, debate_id=debate.id, analyzer_run_id=run_id)

    assert stopped_because_of(debate) == STOPPED_WALL_CLOCK
    assert all(r.dispatch_outcome != "spawned" for r in records)
```

Write `converged_run_factory(db_session, max_delta, epsilon, debate=None)` in `conftest.py`. It creates (or reuses) a v2 debate and persists a `protocol_analysis` AnalyzerRun whose output carries `{"convergence": {"converged": bool, "maxDelta": float, "epsilon": float}}`, matching the real shape observed in production. Return `(debate, run_id)`.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_frontier_priority.py -v -k "converg or wall_clock"
```
Expected: FAIL with `ImportError: cannot import name 'STOPPED_CONVERGED'`.

- [ ] **Step 3: Add the constants**

In `expansion_dispatch.py`:

```python
# P1 Task 7: stop conditions beyond budget exhaustion.
CONVERGED_WAVES_KEY = "converged_waves"
STOPPED_CONVERGED = "converged"
STOPPED_WALL_CLOCK = "wall_clock"

# Two consecutive settled waves, not one: smoke4 recorded maxDelta 0.226
# against epsilon 0.05, and a single wave under epsilon can be noise.
REQUIRED_CONSECUTIVE_CONVERGED_WAVES = 2

DEBATE_WALL_CLOCK_SECONDS_ENV = "DIALECTICAL_DEBATE_WALL_CLOCK_SECONDS"
DEFAULT_DEBATE_WALL_CLOCK_SECONDS = 4 * 60 * 60


def debate_wall_clock_seconds() -> int:
    return int_env(
        DEBATE_WALL_CLOCK_SECONDS_ENV, DEFAULT_DEBATE_WALL_CLOCK_SECONDS, 60, 24 * 60 * 60
    )
```

- [ ] **Step 4: Add the convergence reader and wave counter**

```python
def _latest_convergence(db: Session, debate_id: str) -> dict[str, Any]:
    from app.models.entities import AnalyzerRun

    run = db.scalars(
        select(AnalyzerRun)
        .where(
            AnalyzerRun.debate_id == debate_id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
            AnalyzerRun.status == "complete",
        )
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()
    output = getattr(run, "output", None)
    convergence = output.get("convergence") if isinstance(output, dict) else None
    return convergence if isinstance(convergence, dict) else {}


def _record_convergence_wave(debate: Debate, convergence: dict[str, Any]) -> int:
    """Returns the running count of CONSECUTIVE settled waves."""
    max_delta = convergence.get("maxDelta")
    epsilon = convergence.get("epsilon")
    state = adaptive_expansion_state(debate)
    previous = state.get(CONVERGED_WAVES_KEY)
    count = previous if isinstance(previous, int) and not isinstance(previous, bool) else 0
    if isinstance(max_delta, (int, float)) and isinstance(epsilon, (int, float)):
        count = count + 1 if float(max_delta) < float(epsilon) else 0
    state[CONVERGED_WAVES_KEY] = count
    _write_adaptive_expansion_state(debate, state)
    return count
```

- [ ] **Step 5: Gate the dispatch loop**

In `expansion_dispatch`, immediately after the v2-pipeline check:

```python
    from app.models.entities import now_utc

    elapsed = (now_utc() - debate.created_at).total_seconds()
    if elapsed >= debate_wall_clock_seconds():
        record_adaptive_stop(db, debate, STOPPED_WALL_CLOCK)
        commit_write(db)
        return

    if _record_convergence_wave(debate, _latest_convergence(db, debate_id)) >= (
        REQUIRED_CONSECUTIVE_CONVERGED_WAVES
    ):
        record_adaptive_stop(db, debate, STOPPED_CONVERGED)
        commit_write(db)
        return
```

Confirm `debate.created_at` is timezone-aware in this codebase before subtracting; if it is naive, match whatever `now_utc()` returns rather than mixing.

- [ ] **Step 6: Add the reason copy**

Add `STOPPED_CONVERGED` and `STOPPED_WALL_CLOCK` to `app/exploration/reason_copy.py`, matching the existing entries' tone.

- [ ] **Step 7: Run tests to verify they pass**

Run the command from Step 2. Expected: 4 passed.

- [ ] **Step 8: Run the full suite**

Run: `cd apps/dialectical-engine && make test`

- [ ] **Step 9: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/exploration/ apps/dialectical-engine/coordinator/tests/test_frontier_priority.py apps/dialectical-engine/coordinator/tests/conftest.py
git commit -m "feat(dialectical): stop the frontier on convergence hysteresis and wall clock"
```

---

## Task 8: Raise budgets and document the flip

Budgets stay at their conservative defaults in code. The frontier's real envelope is set by the deployment, through the git-tracked launchd template.

**This is the last task. It must not start until Tasks 1–7 are merged and `make test` is green**, because it is the step that makes deep runs actually happen.

**Files:**
- Modify: `coordinator/app/exploration/expansion_dispatch.py:47-49`
- Modify: `apps/dialectical-engine/deploy/launchd/coordinator.plist`
- Modify: `apps/dialectical-engine/docs/flip-plan-2026-07.md`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: no code interface. Deployment state only.

- [ ] **Step 1: Raise the documented defaults**

In `expansion_dispatch.py:47-49`:

```python
# P1 Task 8: frontier budgets. The previous values (2/2/6) were the
# conservative pre-economics defaults for a feature that never spawned. The
# frontier's real bound is the priority floor plus convergence hysteresis;
# these are the outer rails.
DEFAULT_EXPANSION_MAX_ROUNDS = 12
DEFAULT_EXPANSION_MAX_PER_NODE = 3
DEFAULT_EXPANSION_MAX_PER_DEBATE = 150
```

`BUDGET_BOUNDS` at `expansion_dispatch.py:89-93` must widen to admit them: `max_rounds (0, 20)` already does; `max_per_debate (0, 100)` does **not** — raise its ceiling to 200.

- [ ] **Step 2: Run the budget suites**

Run:
```bash
cd apps/dialectical-engine/coordinator && PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 DYLD_LIBRARY_PATH=/opt/homebrew/opt/expat/lib ../.venv313/bin/python -m pytest -p pytest_asyncio.plugin tests/test_budgeted_expansion.py tests/test_adaptive_expansion.py -v
```

Tests asserting the old defaults will fail. Update them to the new values.

- [ ] **Step 3: Run the full suite**

Run: `cd apps/dialectical-engine && make test`

- [ ] **Step 4: Add the flags to the launchd template**

**Editing the live `~/Library/LaunchAgents/com.dialectical.coordinator.plist` does NOT persist** — `com.dialectical.watchdog` regenerates it from the git template whenever the coordinator is briefly down. Edit `deploy/launchd/coordinator.plist` and run `make install-services`.

Add inside `<key>EnvironmentVariables</key>`:

```xml
    <!-- P1 contested-frontier (docs/superpowers/plans/2026-07-24-p1-contested-frontier.md).
         Rollback: delete these 4 keys + make install-services. -->
    <key>DIALECTICAL_HIERARCHICAL_SYNTHESIS</key>
    <string>1</string>
    <key>DIALECTICAL_ADAPTIVE_EXPANSION</key>
    <string>1</string>
```

Enable `DIALECTICAL_HIERARCHICAL_SYNTHESIS` **first**, verify one normal-size debate synthesises correctly, and only then enable `DIALECTICAL_ADAPTIVE_EXPANSION`. Turning on expansion before bounded synthesis is exactly the ordering this plan exists to prevent.

- [ ] **Step 5: Deploy**

```bash
cd apps/dialectical-engine && make install-services
```

Then verify the flags reached the process:

```bash
curl -s -o /dev/null -w "healthz=%{http_code}\n" --max-time 8 http://localhost:8000/healthz
```

- [ ] **Step 6: Update the flip plan**

Add a stage to `apps/dialectical-engine/docs/flip-plan-2026-07.md` recording preconditions, verification, and rollback for these two flags, in the same format as the existing stages.

- [ ] **Step 7: Commit**

```bash
git add apps/dialectical-engine/coordinator/app/exploration/expansion_dispatch.py apps/dialectical-engine/deploy/launchd/coordinator.plist apps/dialectical-engine/docs/flip-plan-2026-07.md apps/dialectical-engine/coordinator/tests/
git commit -m "ops(dialectical): raise frontier budgets and flip P1 flags"
```

---

## P1 Acceptance

From the spec §5.1 and §5.5, verified on a live run before P2 planning begins:

- [ ] A synthetic 400-node tree synthesises without truncation error (Task 3).
- [ ] At least one branch reaches depth ≥8; at least one terminates at depth ≤3.
- [ ] The recorded `stopped_because` is `converged` or `below_priority_floor` — **not** `budget_exhausted`.
- [ ] `disagreement_status: "present"` on ≥3 nodes (smoke4: 0).
- [ ] At least one `LifecycleDecisionRecord` has `signal_class == "categorical"` and `dispatch_outcome == "spawned"` (all-time production count before P1: **0**).
- [ ] No `database is locked` errors in `/tmp/dialectical-coordinator.err.log` during the run.
- [ ] Full suite green: 2421+ passed.

Record the actual numbers. P2's plan depends on what P1 measures — in particular, whether per-field disagreement detection fires often enough to drive the frontier on its own, or whether §5.2's judge de-biasing needs to move up as well.
