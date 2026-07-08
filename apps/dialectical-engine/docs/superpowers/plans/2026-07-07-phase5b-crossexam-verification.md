# Phase 5b: Cross-Examination + Verification-Status Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement protocol phases `5.4_cross_exam` and `5.5_verification` as pure, DETERMINISTIC analysis steps over data that already exists (current node topology + the latest persisted scoring payload + persisted judge disagreements) — no new LLM calls, no new generation jobs, no new attack-node authoring. Attack-node generation stays with the existing manual-challenge machinery; this phase only reads and reports. Register both phases as implemented in `app/protocol/state.py` (removing them from `NOT_IMPLEMENTED_PHASES`), add a guard so a `not_implemented` phase may only ever stay `not_implemented`, build two pure analysis modules (`cross_exam.py`, `verification.py`), and a best-effort service (`runner.py`) that persists one new `AnalyzerRun` (`analyzer_type="protocol_analysis"`) and advances the 5.4/5.5 markers, wired into `persist_v2_synthesis` after the existing 5.3/5.8 marker calls.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **Exact `NodeScoringPayload` field names for `counter_resilience` and `judge_disagreements` are confirmed** (`coordinator/app/scoring/models.py:212` and `:326`), but the exact nesting under `scores` vs top-level for `counter_resilience` (it lives inside `NodeScores`, a nested model — line ~200-222) must be re-read once immediately before writing `cross_exam.py`'s item-parsing code, since this plan reads it from `item["scores"]["counter_resilience"]` assuming `NodeScoringPayload.model_dump()`-style serialization; implementer must confirm the actual dict shape returned by `debate_scoring_payload(...)["items"]` (list of dicts — are they already `.model_dump()`-ed, or Pydantic model instances still in this internal path?) before trusting field access syntax.
2. **CON/PRO child topology attribute names on `Node`** were not directly grepped in this pass (budget-limited) — the mission says "max-strength CON child (from nodes topology + scoring items)". Implementer must open `coordinator/app/models/entities.py`'s `Node` class once (grep hit at line ~196 area is `AnalyzerRun`, not `Node` — `Node` is elsewhere in the same file) to confirm the parent/child linkage field name (likely `parent_id` + `node_type` with values including something like `"CON"`/`"PRO"` or `"counter"`/`"support"` — Phase 4/5a's `POV_BRANCHES` used `SCIENTIFIC_POV` etc. for POV lenses, but the CON/PRO branch vocabulary for challenge/counter nodes is a SEPARATE vocabulary not yet confirmed in this pass) before writing `cross_examine`'s child-walk logic.
3. **The manual-challenge / counterargument node vocabulary** (what `node_type` or label marks a node as an opposing/counter claim vs a supporting one) is UNVERIFIED — grep for `"CON"`, `"counter"`, `challenge` node types in `coordinator/app/models/entities.py` and wherever manual investigation/challenge nodes are created (`app/api/scoring.py` mentioned a `ManualInvestigationRequest` — likely relevant) before implementing Task 2's topology walk.
4. **`debate_scoring_payload(db, debate)`'s `"items"` list shape when scoring is `"unavailable"`** (i.e. no completed `node_scoring` `AnalyzerRun` exists yet, e.g. very early in a debate's lifecycle) returns `"items": []` per `_unavailable_payload` (service.py:1331,1343) — implementer must confirm `run_protocol_analysis` degrades gracefully (empty cross-exam report, all-pending verification statuses, or simply skip persisting when there is nothing to analyze) rather than crashing when called before scoring exists; this plan requires a best-effort try/except regardless, but the empty-input behavior of `cross_examine`/`classify_verification` should be unit-tested explicitly, not just caught by the except.
5. **Whether `persist_v2_synthesis` is the ONLY intended call site, or whether `run_protocol_analysis` should also be invoked from a scoring-completion hook** (e.g. wherever `node_scoring` `AnalyzerRun`s complete, so cross-exam/verification can refresh whenever scoring changes, not just once at synthesis) is a product decision the mission text left implicit ("wire the call best-effort into persist_v2_synthesis AFTER the 5.3/5.8 markers (one site) AND expose for manual invocation"). This plan takes the literal reading: ONE automatic hook (in `persist_v2_synthesis`) plus a manually-callable function (`run_protocol_analysis` itself, callable from a route/script/test) — not a second automatic hook. Implementer must flag if product wants scoring-completion-triggered re-analysis instead/also.
6. **Exact line numbers in `persist_v2_synthesis`** for "after the 5.3/5.8 markers" are stale relative to Phase 5a's plan (which inserted the 5.8 marker call between `debate.completed_at = now_utc()` and `record_provenance(...)`) — implementer must re-read `coordinator/app/services/dialectical_v2.py`'s current `persist_v2_synthesis` body once immediately before editing to find the actual post-5a line numbers (5a's plan used pre-5a line numbers 879/880; those have shifted now that the 5a marker code has been inserted).
7. **Whether 5a has already been fully implemented in the working tree** (this plan assumes yes, based on `state.py` already containing `"in_progress"` in `_VALID_STATUSES` — confirmed live in the file — which is the "post-5a" marker the mission asked to verify). Implementer should still run the full existing test suite once before starting to get a fresh baseline failure count (expected: 17 pre-existing) rather than trusting this plan's number blindly, since time has passed since 5a landed.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **17 known coordinator failures are pre-existing** (12 env-harness + 5 foreign guardian WIP) — these are NOT this phase's responsibility. Do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns. Report them as pre-existing if seen. Re-baseline this count once (see UNVERIFIED #7) before relying on it.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`AnalyzerRun`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings (report keys, status literals, rationale text) must use claim/debate-domain language consistent with the rest of the codebase — camelCase claim-language keys in the published/persisted report (`claimId`, `strongestCounterId`, `counterStrength`, `judgeDisagreements`, `unopposed`), not generic `"item"`/`"task"` placeholders.
- **No-false-green law:** phases `5.6_qbaf_scoring` and `5.7_convergence` remain `not_implemented` in this slice and MUST stay recorded as `"not_implemented"` — never `"complete"`, never silently omitted. Any attempt to mark a not-implemented phase anything other than `"not_implemented"` must raise, not silently succeed (this plan HARDENS that guard in Task 1 to reject any status transition away from `not_implemented`, not just `"complete"`).
- **Protocol honesty (no-false-green, extended):** the new `5.4_cross_exam`/`5.5_verification` phases must never claim more than they do. `verification` in this slice is a STATUS CLASSIFIER only (`pending_verification` / `unverifiable_by_kind`) — it must never fabricate citations, evidence objects, or "verified" claims. Document this v1-scope limitation honestly in module docstrings and in the final report.
- **Analyzer isolation:** the new `AnalyzerRun` written by this phase MUST use `analyzer_type="protocol_analysis"` (never `"node_scoring"`) and `provenance={"scoring_source": "protocol_analysis", ...}` (never `"judge_outputs"`) so it does not trip the judge-artifact linking listener at `coordinator/app/models/entities.py:311-324` (`_link_judge_artifacts_to_analyzer_run`), which only acts when `analyzer_type == "node_scoring"` AND `provenance.get("scoring_source") == "judge_outputs"` — this phase's analyzer_type alone already guarantees the listener no-ops (early-return at line 320), and the distinct `scoring_source` value is a second, redundant safety margin. Confirm this with a dedicated test (Task 4) rather than relying on code inspection alone.
- **`dialectical_v2.py` surgical-edit warning:** this file carries uncommitted work from Phase 5a (and possibly others). Re-read the exact target region immediately before editing (see UNVERIFIED #6); make the smallest possible diff; do not reformat or reorder unrelated code.

**Verified ground truth (dev lineage):**
- `coordinator/app/protocol/state.py` (current, post-5a): `PHASE_NAMES` is the 8-tuple `5.1_triage`..`5.8_synthesis`; `NOT_IMPLEMENTED_PHASES = frozenset({"5.4_cross_exam", "5.5_verification", "5.6_qbaf_scoring", "5.7_convergence"})`; `_VALID_STATUSES = {"pending", "in_progress", "complete", "not_implemented", "failed"}` (confirmed `"in_progress"` already exists, ahead of what the 5a plan doc shows — the doc's code sample predates a later edit). `advance_phase(state, phase, status)` currently raises `ValueError` ONLY when `phase in NOT_IMPLEMENTED_PHASES and status == "complete"` (line 73 area) — it does NOT yet raise for other statuses (e.g. advancing a not-implemented phase to `"in_progress"` or `"failed"` currently silently succeeds). Task 1 must close this gap per the mission's "not_implemented phases may only STAY not_implemented (any other status -> ValueError)" instruction.
- `coordinator/app/scoring/models.py:200-223` — `NodeScores` (Pydantic `BaseModel`) has a `counter_resilience: float` field (line 212) alongside `strength`, `uncertainty`, `impact`, `logical_validity`, `assumption_risk`, all validated to the unit interval `[0, 1]` via a shared `_unit_interval` validator (line 214-223). `counter_resilience` is nested INSIDE `NodeScores`, itself a field of `NodeScoringPayload.scores` (line 321) — access is `item["scores"]["counter_resilience"]` if the payload has been dict-serialized, or `item.scores.counter_resilience` if still Pydantic objects (see UNVERIFIED #1).
- `coordinator/app/scoring/models.py:318-330` — `NodeScoringPayload(BaseModel)`: `node_id: str`, `claim: NormalizedClaim`, `scores: NodeScores`, `labels: ScoreLabels`, `holes: list[ScoringHole]`, `fatal_flags: list[FatalFlag]`, `score_caps: list[ScoreCap]`, `judge_disagreements: list[JudgeDisagreement]` (line 326 — this is the PER-NODE persisted judge-disagreement list, already computed and stored on each item; distinct from calling `detect_persisted_judge_disagreements` fresh), `recommended_investigations`, `rationale`, `score_provenance`.
- `coordinator/app/scoring/disagreement.py:38-60` — `detect_persisted_judge_disagreements(judge_evidence: list[dict]) -> list[JudgeDisagreement]`: pure function, deterministic. Requires >=2 distinct judge-evidence items with a `ClaimAssessment`-typed `"assessment"` field; computes min/max claim-strength signal across judges; if the gap is `>= 0.35`, returns one `JudgeDisagreement(judges=[...], type="persisted_judge_strength_gap", severity="high", description="...")`; otherwise returns `[]`. This is the "absorbed followup work" the mission refers to — it is a REAL, already-implemented function, not new work for this phase. Task 2 can either (a) reuse each node's already-persisted `NodeScoringPayload.judge_disagreements` list directly (simpler — recommended), or (b) call `detect_persisted_judge_disagreements` fresh if raw judge evidence is passed in instead of the already-scored payload; the mission's Task 2 wording ("judge_disagreements: [...from persisted disagreements for that node...]") indicates reading the ALREADY-PERSISTED per-node list (option a), not recomputing.
- `coordinator/app/scoring/service.py:56-58` — `SCORING_ANALYZER_TYPE = "node_scoring"`, `JUDGE_OUTPUT_SOURCE = "judge_outputs"`. `debate_scoring_payload(db, debate) -> dict` (line 112) is the confirmed public accessor: queries the latest `complete` `AnalyzerRun` with `analyzer_type == SCORING_ANALYZER_TYPE`, falls back to `_hydrate_scoring_payload_from_judge_artifacts(...)` if none exists, else returns an `_unavailable_payload(...)` shape with `"items": []`. The returned dict has an `"items"` key (list) in all cases (confirmed via grep at lines 155, 217, 262, 288, 1157, 1343 — every payload-building path sets `"items"`). This is the accessor Task 4 should reuse to fetch the current scoring payload rather than inventing a second reader.
- `coordinator/app/models/entities.py:311-324` — `_link_judge_artifacts_to_analyzer_run`, an `after_insert` SQLAlchemy event listener on `AnalyzerRun`. Early-returns (does nothing) unless BOTH `target.analyzer_type == "node_scoring"` AND `target.provenance.get("scoring_source") == "judge_outputs"`. A new `AnalyzerRun` with `analyzer_type="protocol_analysis"` fails the FIRST condition and the listener no-ops immediately — confirmed safe by direct code read, not inference.
- `coordinator/app/scoring/jobs.py:70-77` — existing `node_scoring` `AnalyzerRun` creation pattern (for reference/mirroring persistence style, NOT reuse of the analyzer_type): constructs `AnalyzerRun(..., analyzer_type=SCORING_ANALYZER_TYPE, ..., provenance={"scoring_source": JUDGE_OUTPUT_SOURCE, ...})`. Task 4's new `AnalyzerRun` should mirror the general construction shape (fields: `debate_id`, `analyzer_type`, `output`, `status`, `provenance`, `created_at` per `coordinator/app/services/serialization.py:223` and `coordinator/migrations/versions/0003_dialectical_v2_artifacts.py:65`) but with this phase's own `analyzer_type`/`provenance` values.
- `coordinator/app/services/dialectical_v2.py` — `persist_v2_synthesis` (confirmed to exist, per 5a's ground truth at pre-5a lines 836-886; post-5a it additionally contains the 5a-inserted 5.8-marker `try/except` block per the 5a plan's Task 3). Exact current line numbers are UNVERIFIED post-5a-edit (see UNVERIFIED #6) — re-read before editing.
- `coordinator/app/scoring/normalizer.py` — `ClaimType = Literal["empirical", "causal", "normative", "definitional", "prediction", "comparative", "mixed", "unknown"]` (confirmed in 5a's ground truth from `coordinator/app/scoring/models.py:8-17`; `classify_claim_type`/`normalize_claim` live in `normalizer.py`). Task 3's `classify_verification(claim_type)` switches on exactly these 8 literal values.

---

### Task 1: Harden the not_implemented guard + register 5.4/5.5 as implemented

**Files:**
- Modify: `coordinator/app/protocol/state.py`
- Modify: `coordinator/tests/test_protocol_state.py` (update existing assertions)

**Interfaces:**
- Changes `NOT_IMPLEMENTED_PHASES` to `frozenset({"5.6_qbaf_scoring", "5.7_convergence"})` (5.4/5.5 removed).
- Changes `initialize_protocol_state` so 5.4/5.5 initialize as `"pending"` (via the existing `phases = {name: "pending" for name in PHASE_NAMES}` default — no longer overwritten to `"not_implemented"` since they're no longer in `NOT_IMPLEMENTED_PHASES`).
- Hardens `advance_phase`: any status other than `"not_implemented"` requested for a phase in `NOT_IMPLEMENTED_PHASES` raises `ValueError` (not just `status == "complete"`); message instructs "implement and register the phase in `NOT_IMPLEMENTED_PHASES`/state.py first."

- [ ] **Step 1: Update failing tests first**

Edit `coordinator/tests/test_protocol_state.py`:
- Change `test_initialize_includes_triage_and_honest_not_implemented_phases`: `phases["5.4_cross_exam"]` and `phases["5.5_verification"]` now expected to equal `"pending"` (not `"not_implemented"`); keep `5.6_qbaf_scoring`/`5.7_convergence` asserted as `"not_implemented"`.
- Change the `@pytest.mark.parametrize("phase", sorted(NOT_IMPLEMENTED_PHASES))` test (`test_no_false_green_cannot_mark_not_implemented_phase_complete`) — it already parametrizes off the live `NOT_IMPLEMENTED_PHASES` set, so it will automatically narrow to `5.6_qbaf_scoring`/`5.7_convergence` once Task 1's Step 3 lands; no edit needed to the test body itself, but ADD a new test:

```python
@pytest.mark.parametrize("phase", sorted(NOT_IMPLEMENTED_PHASES))
@pytest.mark.parametrize("status", ["in_progress", "pending", "failed"])
def test_not_implemented_phase_cannot_move_to_any_other_status(phase, status):
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    with pytest.raises(ValueError, match="not_implemented"):
        advance_phase(state, phase, status)


def test_cross_exam_and_verification_are_no_longer_not_implemented():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    assert state["phases"]["5.4_cross_exam"] == "pending"
    assert state["phases"]["5.5_verification"] == "pending"
    assert "5.4_cross_exam" not in NOT_IMPLEMENTED_PHASES
    assert "5.5_verification" not in NOT_IMPLEMENTED_PHASES


def test_cross_exam_and_verification_can_advance_to_complete():
    state = initialize_protocol_state("The Earth orbits the Sun.", None)
    state = advance_phase(state, "5.4_cross_exam", "complete")
    state = advance_phase(state, "5.5_verification", "complete")
    assert state["phases"]["5.4_cross_exam"] == "complete"
    assert state["phases"]["5.5_verification"] == "complete"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (new tests fail against old `NOT_IMPLEMENTED_PHASES`/guard behavior).

- [ ] **Step 3: Implement**

In `coordinator/app/protocol/state.py`:

```python
NOT_IMPLEMENTED_PHASES: frozenset[str] = frozenset({"5.6_qbaf_scoring", "5.7_convergence"})
```

Update `advance_phase`'s guard:

```python
    if phase in NOT_IMPLEMENTED_PHASES and status != "not_implemented":
        raise ValueError(
            f"Refusing to change {phase!r} away from not_implemented to {status!r}: "
            "this phase has no real implementation registered in this slice "
            "(no-false-green law) — implement the phase and remove it from "
            "NOT_IMPLEMENTED_PHASES in app/protocol/state.py before advancing "
            "its status."
        )
```

(`initialize_protocol_state` needs no code change — 5.4/5.5 now fall through to the default `"pending"` since the `for phase in NOT_IMPLEMENTED_PHASES: phases[phase] = "not_implemented"` loop no longer touches them.)

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Move to Task 2.

---

### Task 2: Pure cross-examination analysis module

**Files:**
- Create: `coordinator/app/protocol/cross_exam.py`
- Test: `coordinator/tests/test_protocol_cross_exam.py` (new)

**Interfaces:**
- Produces: `CrossExamReport` (frozen dataclass; JSON-safe `.to_dict()`/`as_dict()`-style export — mirror `TriageDecision`'s plain-dataclass style from Phase 5a); `cross_examine(nodes: list[dict], scoring_items: list[dict], disagreements: dict[str, list[dict]] | None = None) -> CrossExamReport`.
- Report entry shape per scored claim: `{"claimId": str, "strongestCounterId": str | None, "counterStrength": float | None, "judgeDisagreements": list[dict], "unopposed": bool}`.
- `CROSS_EXAM_VERSION = "cross-exam-v1"`.
- Pure function: plain dicts in, frozen dataclass out. No DB session, no ORM imports (mirror `app/protocol/triage.py`'s purity discipline).

Before writing, implementer MUST resolve UNVERIFIED #2/#3 (Node topology + CON/PRO or challenge/counter node_type vocabulary) by grepping `coordinator/app/models/entities.py`'s `Node` class and wherever manual-challenge nodes are created, and adjust the exact field names below accordingly — the field names `parent_id`/`node_type` used in this task's sample code are PLACEHOLDERS pending that confirmation.

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_protocol_cross_exam.py
from app.protocol.cross_exam import CROSS_EXAM_VERSION, CrossExamReport, cross_examine


def _scoring_item(node_id: str, counter_resilience: float, judge_disagreements=None):
    return {
        "node_id": node_id,
        "scores": {"counter_resilience": counter_resilience},
        "judge_disagreements": judge_disagreements or [],
    }


def test_unopposed_claim_has_no_counter():
    nodes = [{"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n1", counter_resilience=0.9)]
    report = cross_examine(nodes, scoring_items)
    assert report.version == CROSS_EXAM_VERSION
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] is None
    assert entry["counterStrength"] is None
    assert entry["unopposed"] is True


def test_strongest_opposing_child_is_selected_by_lowest_counter_resilience():
    # lower counter_resilience on the child = stronger pressure against the parent claim
    nodes = [
        {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"},
        {"id": "n2", "parent_id": "n1", "node_type": "CON"},
        {"id": "n3", "parent_id": "n1", "node_type": "CON"},
    ]
    scoring_items = [
        _scoring_item("n1", counter_resilience=0.8),
        _scoring_item("n2", counter_resilience=0.6),
        _scoring_item("n3", counter_resilience=0.2),  # weakest resilience -> strongest counter-pressure
    ]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["strongestCounterId"] == "n3"
    assert entry["counterStrength"] == 0.2
    assert entry["unopposed"] is False


def test_judge_disagreements_are_carried_through_per_node():
    disagreement = {"judges": ["a", "b"], "type": "persisted_judge_strength_gap", "severity": "high"}
    nodes = [{"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n1", counter_resilience=0.5, judge_disagreements=[disagreement])]
    report = cross_examine(nodes, scoring_items)
    entry = report.entries_by_claim_id()["n1"]
    assert entry["judgeDisagreements"] == [disagreement]


def test_deterministic_ordering_by_claim_id():
    nodes = [{"id": "n3", "parent_id": None, "node_type": "ROOT_CLAIM"},
             {"id": "n1", "parent_id": None, "node_type": "ROOT_CLAIM"}]
    scoring_items = [_scoring_item("n3", 0.5), _scoring_item("n1", 0.5)]
    report = cross_examine(nodes, scoring_items)
    assert [e["claimId"] for e in report.entries] == sorted(e["claimId"] for e in report.entries)


def test_empty_input_returns_empty_report():
    report = cross_examine([], [])
    assert report.entries == []
    assert report.version == CROSS_EXAM_VERSION


def test_report_is_frozen():
    import pytest
    report = cross_examine([], [])
    with pytest.raises(Exception):
        report.entries = []  # type: ignore[misc]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_cross_exam.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.protocol.cross_exam` does not exist yet).

- [ ] **Step 3: Implement**

```python
# coordinator/app/protocol/cross_exam.py
"""Deterministic cross-examination analysis for the epistemic protocol's Phase 5.4.

Pure, read-only analysis over EXISTING data: current node topology + the
latest persisted node-scoring payload + already-persisted judge disagreements.
No LLM/provider calls, no new nodes, no new jobs. Attack-node (counterargument)
generation remains the job of the existing manual-challenge machinery — this
module only identifies, for each scored claim, its strongest already-existing
opposing child (if any) and surfaces that claim's persisted judge
disagreements. It does not create arguments and does not decide who "won".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

CROSS_EXAM_VERSION = "cross-exam-v1"

# Node types treated as "opposing pressure" against a parent claim. Placeholder
# pending UNVERIFIED #2/#3 confirmation against the real challenge/counter
# node vocabulary in app/models/entities.py.
_OPPOSING_NODE_TYPES = {"CON"}


@dataclass(frozen=True)
class CrossExamReport:
    entries: list[dict[str, Any]] = field(default_factory=list)
    version: str = CROSS_EXAM_VERSION

    def entries_by_claim_id(self) -> dict[str, dict[str, Any]]:
        return {entry["claimId"]: entry for entry in self.entries}


def _counter_resilience(scoring_by_node_id: dict[str, dict], node_id: str) -> float | None:
    item = scoring_by_node_id.get(node_id)
    if not item:
        return None
    scores = item.get("scores") or {}
    value = scores.get("counter_resilience")
    return float(value) if isinstance(value, (int, float)) else None


def cross_examine(
    nodes: list[dict[str, Any]],
    scoring_items: list[dict[str, Any]],
    disagreements: dict[str, list[dict]] | None = None,
) -> CrossExamReport:
    """Build a deterministic cross-examination report.

    `nodes`: plain dicts with at least `id`, `parent_id`, `node_type`.
    `scoring_items`: plain dicts shaped like the public scoring payload's
    `"items"` entries (`node_id`, `scores.counter_resilience`,
    `judge_disagreements`).
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
            # Lower counter_resilience on the opposing child == stronger
            # pressure against the parent claim; break ties by node id for
            # determinism.
            scored_children = sorted(
                opposing_children,
                key=lambda child: (
                    _counter_resilience(scoring_by_node_id, child["id"]) if _counter_resilience(scoring_by_node_id, child["id"]) is not None else 1.0,
                    child["id"],
                ),
            )
            best_child = scored_children[0]
            strongest_counter_id = best_child["id"]
            counter_strength = _counter_resilience(scoring_by_node_id, best_child["id"])

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
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_protocol_cross_exam.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass. If the real `Node`/challenge vocabulary differs from the `_OPPOSING_NODE_TYPES = {"CON"}` placeholder (per UNVERIFIED #2/#3), adjust the constant and node-fixture dicts in the tests to match reality before considering this task done.

- [ ] **Step 5: Report status (no commit).** Move to Task 3.

---

### Task 3: Pure verification-status classifier module

**Files:**
- Create: `coordinator/app/protocol/verification.py`
- Test: `coordinator/tests/test_protocol_verification.py` (new)

**Interfaces:**
- `VERIFICATION_VERSION = "verification-v1"`.
- `classify_verification(claim_type: str) -> str` returning `"pending_verification"` or `"unverifiable_by_kind"`.
- `verification_statuses(nodes_with_claims: list[dict]) -> dict[str, str]` — per-node map builder; input dicts have at least `{"id": str, "claim_type": str}`; output `{node_id: status}`.
- Mapping: `empirical`, `causal`, `prediction`, `comparative` -> `"pending_verification"`; `normative`, `definitional` -> `"unverifiable_by_kind"`; `mixed`, `unknown` -> `"pending_verification"` (conservative default — never silently drop a claim from verification consideration just because its type is ambiguous).
- Explicitly out of scope (v1): no evidence objects, no citations, no "verified"/"refuted" outcome — this module only classifies whether a claim IS THE KIND OF THING that verification applies to, deferring actual evidence-gathering to a future phase (P7 per the mission).

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_protocol_verification.py
import pytest

from app.protocol.verification import (
    VERIFICATION_VERSION,
    classify_verification,
    verification_statuses,
)


@pytest.mark.parametrize("claim_type", ["empirical", "causal", "prediction", "comparative"])
def test_verifiable_kinds_are_pending_verification(claim_type):
    assert classify_verification(claim_type) == "pending_verification"


@pytest.mark.parametrize("claim_type", ["normative", "definitional"])
def test_unverifiable_kinds_are_unverifiable_by_kind(claim_type):
    assert classify_verification(claim_type) == "unverifiable_by_kind"


@pytest.mark.parametrize("claim_type", ["mixed", "unknown"])
def test_ambiguous_kinds_default_conservatively_to_pending_verification(claim_type):
    assert classify_verification(claim_type) == "pending_verification"


def test_verification_statuses_builds_per_node_map():
    nodes_with_claims = [
        {"id": "n1", "claim_type": "empirical"},
        {"id": "n2", "claim_type": "normative"},
    ]
    result = verification_statuses(nodes_with_claims)
    assert result == {"n1": "pending_verification", "n2": "unverifiable_by_kind"}


def test_verification_statuses_empty_input():
    assert verification_statuses([]) == {}


def test_version_is_pinned():
    assert VERIFICATION_VERSION == "verification-v1"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_verification.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.protocol.verification` does not exist yet).

- [ ] **Step 3: Implement**

```python
# coordinator/app/protocol/verification.py
"""Deterministic verification-status classification for Phase 5.5.

v1 scope, stated honestly: this module classifies whether a claim is the
KIND of thing verification could apply to (by its already-computed claim
type). It does NOT fetch evidence, does NOT generate citations, and does NOT
decide whether a claim is actually true or false. Those responsibilities
belong to a future phase. Marking a claim "pending_verification" here means
only "verification is in-kind and not yet attempted" -- never "verified".
"""
from __future__ import annotations

from typing import Any

VERIFICATION_VERSION = "verification-v1"

_UNVERIFIABLE_BY_KIND = {"normative", "definitional"}
# empirical, causal, prediction, comparative, mixed, unknown all fall through
# to "pending_verification" -- conservative default so ambiguous claim types
# are never silently excluded from verification consideration.


def classify_verification(claim_type: str) -> str:
    if claim_type in _UNVERIFIABLE_BY_KIND:
        return "unverifiable_by_kind"
    return "pending_verification"


def verification_statuses(nodes_with_claims: list[dict[str, Any]]) -> dict[str, str]:
    """Build a node_id -> verification status map for a batch of claims."""
    return {
        node["id"]: classify_verification(node.get("claim_type", "unknown"))
        for node in nodes_with_claims
        if node.get("id")
    }
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_protocol_verification.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Move to Task 4.

---

### Task 4: Service integration — `runner.py` + wiring into `persist_v2_synthesis`

**Files:**
- Create: `coordinator/app/protocol/runner.py`
- Modify: `coordinator/app/services/dialectical_v2.py` (`persist_v2_synthesis`)
- Test: `coordinator/tests/test_protocol_runner.py` (new)

**Interfaces:**
- `run_protocol_analysis(db: Session, debate: Debate) -> None`, best-effort (never raises to the caller — catches and swallows internally, mirroring Phase 5a's marker try/except idiom), callable both from the synthesis hook and manually (e.g. from a script/route/test).
- Builds inputs from current `Node` rows for `debate` + the latest scoring payload via `debate_scoring_payload(db, debate)` (confirmed accessor, `app/scoring/service.py:112`).
- Runs `cross_examine(...)` (Task 2) and `verification_statuses(...)` (Task 3).
- Persists exactly ONE new `AnalyzerRun`: `analyzer_type="protocol_analysis"`, `status="complete"`, `output={"crossExam": <CrossExamReport dict form>, "verificationStatuses": {...}, "crossExamVersion": "cross-exam-v1", "verificationVersion": "verification-v1"}`, `provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id}`.
- Advances `5.4_cross_exam` and `5.5_verification` markers `pending`/`in_progress` -> `complete` via the same whole-config reassignment pattern Phase 5a used (`debate.config = {**debate.config, "protocol_state": state}` — NOT in-place mutation, per 5a's confirmed SQLAlchemy `JSON`-column mutability note).
- No raw judge output (e.g. full `ClaimAssessment`/judge free-text) appears in the analyzer's `output` field — only the report's already-summarized shape (claim ids, counter ids/strengths, disagreement summaries, verification status strings).

Before writing, re-read the CURRENT `persist_v2_synthesis` body in `coordinator/app/services/dialectical_v2.py` once (per UNVERIFIED #6) to find the real post-5a insertion point (after the 5a-added 5.8-marker block, before `commit_write(db)`).

- [ ] **Step 1: Write failing tests**

```python
# coordinator/tests/test_protocol_runner.py
from sqlalchemy import select

from app.models.entities import AnalyzerRun
from app.protocol.runner import run_protocol_analysis
from app.protocol.state import protocol_state_of
from app.services import dialectical_v2 as service


def test_run_protocol_analysis_persists_one_protocol_analysis_run(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert len(runs) == 1
    run = runs[0]
    assert run.status == "complete"
    assert "crossExam" in run.output
    assert "verificationStatuses" in run.output
    assert run.provenance["scoring_source"] == "protocol_analysis"


def test_protocol_analysis_run_does_not_trip_judge_artifact_listener(db) -> None:
    # The after_insert listener only acts on analyzer_type == "node_scoring";
    # this is a direct regression guard, not just code inspection.
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    from app.models.entities import JudgeOutputArtifact
    linked = db.scalars(
        select(JudgeOutputArtifact).where(JudgeOutputArtifact.debate_id == debate.id)
    ).all()
    assert linked == []  # nothing spuriously linked by this phase's analyzer run


def test_run_protocol_analysis_advances_markers_to_complete(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.4_cross_exam"] == "complete"
    assert state["phases"]["5.5_verification"] == "complete"
    # not-yet-implemented phases remain honest
    assert state["phases"]["5.6_qbaf_scoring"] == "not_implemented"
    assert state["phases"]["5.7_convergence"] == "not_implemented"


def test_run_protocol_analysis_is_best_effort_and_never_raises(db) -> None:
    from unittest.mock import patch
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.cross_examine", side_effect=RuntimeError("boom")):
        run_protocol_analysis(db, debate)  # must not raise
    # no protocol_analysis AnalyzerRun on failure
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert runs == []


def test_synthesis_triggers_protocol_analysis(db) -> None:
    # Reuse whatever helper coordinator/tests/test_dialectical_v2.py uses to
    # drive a debate through complete_v2_worker_job to persist_v2_synthesis
    # (see Phase 5a's plan note on this same pattern) -- inline the real
    # sequence here rather than assuming a named helper exists.
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    # ... drive to synthesis using the confirmed real sequence from
    # test_dialectical_v2.py (copy, do not invent) ...
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.4_cross_exam"] == "complete"
    assert state["phases"]["5.5_verification"] == "complete"
    runs = db.scalars(
        select(AnalyzerRun).where(
            AnalyzerRun.debate_id == debate.id,
            AnalyzerRun.analyzer_type == "protocol_analysis",
        )
    ).all()
    assert len(runs) == 1


def test_marker_and_analysis_failure_never_fails_synthesis(db) -> None:
    from unittest.mock import patch
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.services.dialectical_v2.run_protocol_analysis", side_effect=RuntimeError("boom")):
        # ... drive to synthesis using the same real sequence as above ...
        pass
    db.refresh(debate)
    assert debate.status == "complete"  # synthesis itself must still succeed
```

Note: the two "drive to synthesis" tests must be filled in using the ACTUAL job-completion sequence already used by `coordinator/tests/test_dialectical_v2.py` (e.g. around `test_v2_persists_pov_tree_and_synthesis_from_worker_completed_json`) — copy that real sequence inline; do not assume a `_drive_debate_to_synthesis` helper exists (Phase 5a's plan flagged the same uncertainty and left it to the implementer to confirm against the live test file).

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`app.protocol.runner` does not exist yet; wiring not present).

- [ ] **Step 3: Implement**

```python
# coordinator/app/protocol/runner.py
"""Service-layer integration for Phase 5.4 (cross-exam) + 5.5 (verification).

Best-effort orchestration only: reads current Node rows + the latest
persisted scoring payload, runs the two pure analysis modules, and persists
ONE AnalyzerRun capturing both results. Never raises to its caller -- a
failure here must never fail debate creation, worker-job completion, or
synthesis. No new LLM calls. No new nodes. No raw judge output is stored in
the analyzer's output; only the already-summarized report shapes.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import commit_write, now_utc
from app.models.entities import AnalyzerRun, Debate, Node
from app.protocol.cross_exam import cross_examine
from app.protocol.state import advance_phase, protocol_state_of
from app.protocol.verification import verification_statuses
from app.scoring.service import debate_scoring_payload

PROTOCOL_ANALYSIS_TYPE = "protocol_analysis"


def run_protocol_analysis(db: Session, debate: Debate) -> None:
    try:
        _run_protocol_analysis(db, debate)
    except Exception:
        # Best-effort: this is deterministic scaffolding analysis, not
        # load-bearing for the debate itself. Any bug here must never
        # propagate to the caller (debate creation / worker completion /
        # synthesis persistence).
        pass


def _run_protocol_analysis(db: Session, debate: Debate) -> None:
    nodes = db.scalars(select(Node).where(Node.debate_id == debate.id)).all()
    node_dicts = [
        {"id": node.id, "parent_id": node.parent_id, "node_type": node.node_type}
        for node in nodes
    ]

    scoring_payload = debate_scoring_payload(db, debate)
    scoring_items = scoring_payload.get("items") or []

    cross_exam_report = cross_examine(node_dicts, scoring_items)

    nodes_with_claims = [
        {"id": item["node_id"], "claim_type": (item.get("claim") or {}).get("claim_type", "unknown")}
        for item in scoring_items
        if item.get("node_id")
    ]
    verification_map = verification_statuses(nodes_with_claims)

    run = AnalyzerRun(
        debate_id=debate.id,
        analyzer_type=PROTOCOL_ANALYSIS_TYPE,
        output={
            "crossExam": {"entries": cross_exam_report.entries, "version": cross_exam_report.version},
            "verificationStatuses": verification_map,
            "crossExamVersion": cross_exam_report.version,
            "verificationVersion": "verification-v1",
        },
        status="complete",
        provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id},
        created_at=now_utc(),
    )
    db.add(run)

    state = protocol_state_of(debate.config)
    if state is not None:
        state = advance_phase(state, "5.4_cross_exam", "complete")
        state = advance_phase(state, "5.5_verification", "complete")
        debate.config = {**debate.config, "protocol_state": state}

    commit_write(db)
```

In `coordinator/app/services/dialectical_v2.py`, add the import near the other local imports:

```python
from app.protocol.runner import run_protocol_analysis
```

In `persist_v2_synthesis`, immediately AFTER the existing 5a-added 5.8-marker `try/except` block (and after `debate.status = "complete"` / `debate.completed_at = now_utc()` have been set) but BEFORE `commit_write(db)`:

```python
    try:
        run_protocol_analysis(db, debate)
    except Exception:
        pass  # best-effort: protocol analysis must never fail synthesis persistence
```

(Re-confirm exact surrounding lines against the live file per UNVERIFIED #6 before inserting — `run_protocol_analysis` is already internally best-effort/non-raising, so this outer try/except is defense-in-depth, not strictly required, but keeps the call site symmetric with the existing marker-update try/except style from Phase 5a.)

- [ ] **Step 4: Verify pass + full-suite rerun**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_protocol_triage.py tests/test_protocol_state.py tests/test_protocol_cross_exam.py tests/test_protocol_verification.py tests/test_protocol_runner.py tests/test_protocol_integration.py tests/test_dialectical_v2.py tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except the pre-existing known failures (re-baselined per UNVERIFIED #7; expected ~17: 12 env-harness + 5 foreign guardian WIP). If a NEW failure appears (e.g. `test_node_scoring.py` assertions on `AnalyzerRun` enumeration/listing that this phase's new `protocol_analysis` run type now surfaces unexpectedly), fix the root cause in this phase's code before reporting done — do not weaken a pre-existing test to paper over a real regression. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and flag UNVERIFIED #2/#3/#5/#6 explicitly as decisions for Hermes/product to confirm before any later phase (5.6 QBAF scoring, 5.7 convergence) builds on top of this phase's report shapes.
