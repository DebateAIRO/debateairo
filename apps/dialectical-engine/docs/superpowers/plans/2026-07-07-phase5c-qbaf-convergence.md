# Phase 5c: QBAF Dialectical Scoring + Epsilon-Stability Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close out the protocol skeleton by implementing phases `5.6_qbaf_scoring` and `5.7_convergence` inside the EXISTING protocol runner (`coordinator/app/protocol/runner.py`). Both are pure, deterministic, best-effort analysis steps over data that already exists (current node topology + this run's freshly-computed scoring items + the previous `protocol_analysis` `AnalyzerRun`, if any). No new LLM calls, no new jobs, no schema changes. Register both phases as implemented in `app/protocol/state.py` (removing them from `NOT_IMPLEMENTED_PHASES`), extend `runner.py` to compute DF-QuAD dialectical strengths via the existing `app/qbaf/debate_adapter.py` + `app/qbaf/dfquad.py`, and compute an epsilon-stability convergence verdict against the prior run's strengths.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **The "previous protocol_analysis run" query pattern was inferred, not directly grepped as a literal `.offset(1)` usage.** No existing call site in this codebase was found using `.offset(1)` combined with `order_by(...desc())` to skip the just-inserted row. This plan's Task 2 assumes: query `AnalyzerRun` rows where `debate_id == debate.id` and `analyzer_type == "protocol_analysis"`, `order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())`, and take the SECOND row (`offset(1).limit(1)`) — because by the time 5.7's code runs, THIS run's own `protocol_analysis` `AnalyzerRun` (from 5.6/5.4/5.5) may or may not have been `db.add`-ed/flushed yet depending on exact ordering within `_run_protocol_analysis`. Implementer MUST re-read the current `_run_protocol_analysis` body (reproduced under Verified ground truth below, from the live file) immediately before writing Task 2 to confirm: (a) is the new `AnalyzerRun` added to the session (and does `db.add` cause it to appear in a subsequent `db.scalars(select(...))` within the same flush/transaction before commit — SQLAlchemy autoflush behavior must be checked), and (b) whether it is simplest/safest to fetch the "previous run" BEFORE constructing this run's new `AnalyzerRun` row (recommended — avoids the autoflush ambiguity entirely: query previous-run first, build this run's output dict using that result, then `db.add` the new run same as before).
2. **`debate.config["protocol"]["convergence_epsilon"]` nesting path is a PRODUCT DECISION baked into the mission text, not independently confirmed against any existing `debate.config` reader/writer convention in this codebase.** No existing code was grepped for a `"protocol"` sub-key of `debate.config` (as distinct from `"protocol_state"`, which IS confirmed to exist). Implementer must grep `debate.config` read sites once before writing Task 2's config-read code, in case a different existing nesting convention for per-debate protocol tuning already exists that this key should join instead of inventing a sibling.
3. **Whether `Node.status != "stale"` filtering (used for the 5.4/5.5 node query in the existing `_run_protocol_analysis`) is the correct/only node filter for the QBAF graph build** was not re-verified in this pass — Task 1 reuses the same `node_dicts` list already built earlier in `_run_protocol_analysis` (no new query), so this is low-risk, but confirm no additional filtering is needed before passing the same `node_dicts` into `debate_argument_graph`.
4. **Whether `ArgumentGraph`/`compute_strengths()` can raise exceptions OTHER than `CyclicGraphError`** (e.g. a validation error for out-of-range base scores, malformed edges) was not exhaustively confirmed — `dfquad.py` was only read for the `CyclicGraphError` class docstring and the `compute_strengths` signature, not the full `_validate()` body. Task 1's except clause should catch a broad-but-intentional exception surface (`(CyclicGraphError, ValueError)` at minimum, or a bare `Exception` with the `qbafUnavailableReason` capturing `repr(exc)`, consistent with the runner's existing outer best-effort style) — implementer must re-read `_validate()` once before finalizing the except clause.
5. **Exact current line numbers / full body of `coordinator/app/protocol/runner.py`'s `_run_protocol_analysis`** are current as of this plan's authoring (reproduced verbatim below) but implementer must re-read the live file immediately before editing — this file may have shifted if 5b's plan or other work landed additional changes between plan authoring and execution.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **Pre-existing known failures exist in the coordinator suite** (environment-harness + foreign guardian WIP, count last re-baselined during Phase 5b) — these are NOT this phase's responsibility. Re-baseline the count once at the start of this phase (run the full suite once before touching code) rather than trusting any stale number; do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`AnalyzerRun`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings (report keys, status literals, rationale text) must use claim/debate-domain camelCase language consistent with the rest of the codebase (`dialecticalStrengths`, `graphFingerprint`, `tauSources`, `qbafUnavailableReason`, `convergenceVersion`, `comparedAnalyzerRunId`) — never generic `"item"`/`"task"` placeholders.
- **No-false-green law, extended:** `5.6_qbaf_scoring` and `5.7_convergence` are being PROMOTED OUT of `NOT_IMPLEMENTED_PHASES` in this slice — after this phase lands, NO phase name may remain in `NOT_IMPLEMENTED_PHASES` (it becomes an empty frozenset). The hardened guard from Phase 5b (`advance_phase` raises `ValueError` for any phase in `NOT_IMPLEMENTED_PHASES` moved to a status other than `"not_implemented"`) stays in place and now simply has no members to apply to — do not delete the guard, do not delete `NOT_IMPLEMENTED_PHASES` itself (other code/tests reference it by name).
- **Mandatory composition honesty:** every `AnalyzerRun.output` written by this phase's QBAF path MUST include a verbatim `"compositionNote"` string (see Task 1) disclosing that this is a v1-partial composition (tau sourced from judge strength or a constant default; no verification-status modifier yet; no model-weighting yet). This is a HARD requirement, not a nice-to-have — the roadmap's full judge+verification+model-weight composition is NOT what this phase implements, and the note must say so in the persisted data itself, not just in a docstring.
- **Honest-failure paths still count as "the phase ran":** when QBAF graph construction fails (e.g. `CyclicGraphError`), 5.6 advances to `"complete"` WITH a `qbafUnavailableReason` key recorded (never silently omitted, never crashes the whole `protocol_analysis` run — cross-exam/verification from 5.4/5.5 must still persist). Likewise 5.7 advances to `"complete"` even when `converged` is `null` (first run, or topology fully changed) — completing the EVALUATION is honest regardless of the VALUE the evaluation produced.
- **Marker safety on unexpected crash:** if something in the QBAF/convergence code path raises an exception NOT anticipated by the specific try/excepts described in the tasks below, the OUTER best-effort wrapper already present in `run_protocol_analysis` (mirroring 5b's `try/except Exception: print(...)` idiom) must catch it — in that case the 5.6/5.7 markers stay whatever they were before this run (untouched), never falsely advanced to `"complete"`.
- **Analyzer isolation unchanged:** this phase writes into the SAME single `protocol_analysis` `AnalyzerRun` that 5.4/5.5 already write (one `AnalyzerRun` per invocation of `run_protocol_analysis`, now carrying cross-exam + verification + QBAF strengths + convergence together) — do not create a second `AnalyzerRun` row, do not change `analyzer_type` or `provenance["scoring_source"]`.
- **`dialectical_v2.py` surgical warning:** this file should NOT need to be touched by this phase at all — Phase 5b already wired `run_protocol_analysis(db, debate)` into `persist_v2_synthesis`'s best-effort call site, and this phase's work is entirely internal to `runner.py` + `state.py`. If, during implementation, you find you need to touch `dialectical_v2.py`, STOP and treat that as a signal the plan's assumption about the call site is wrong — re-verify before editing, and keep any unavoidable diff minimal.

**Verified ground truth (dev lineage):**
- `coordinator/app/protocol/state.py` (current, post-5b): `PHASE_NAMES` is the 8-tuple `5.1_triage`..`5.8_synthesis`; `NOT_IMPLEMENTED_PHASES = frozenset({"5.6_qbaf_scoring", "5.7_convergence"})`; `_VALID_STATUSES = {"pending", "in_progress", "complete", "not_implemented", "failed"}`. `advance_phase(state, phase, status)` raises `ValueError` for ANY status other than `"not_implemented"` requested on a phase still in `NOT_IMPLEMENTED_PHASES` (the Phase 5b hardening is confirmed live in the file, not just planned). `initialize_protocol_state` sets all `PHASE_NAMES` to `"pending"` by default, then overwrites every phase in `NOT_IMPLEMENTED_PHASES` to `"not_implemented"` — so once 5.6/5.7 are removed from that frozenset, they will naturally initialize as `"pending"` with zero other code changes needed in `initialize_protocol_state`.
- `coordinator/app/protocol/runner.py` (current, post-5b, full file read verbatim): defines `PROTOCOL_ANALYSIS_TYPE = "protocol_analysis"`; a local `_first_branch(db, debate_id)` helper (avoids circular import with `dialectical_v2.py`); the public `run_protocol_analysis(db, debate)` wraps `_run_protocol_analysis(db, debate)` in `try/except Exception as exc: print(...)` (best-effort, never raises); `_run_protocol_analysis` currently: (1) queries `Node` rows for the debate excluding `status == "stale"`, builds `node_dicts` (`{"id", "parent_id", "node_type"}`); (2) calls `debate_scoring_payload(db, debate)` and reads `scoring_items = scoring_payload.get("items") or []`; (3) calls `cross_examine(node_dicts, scoring_items)`; (4) builds `nodes_with_claims` from `scoring_items` and calls `verification_statuses(...)`; (5) looks up the first `DebateBranch` via `_first_branch`; (6) constructs ONE `AnalyzerRun(debate_id=, branch_id=, analyzer_type=PROTOCOL_ANALYSIS_TYPE, output={"crossExam": cross_exam_report.to_dict(), "verificationStatuses": ..., "crossExamVersion": ..., "verificationVersion": "verification-v1"}, status="complete", provenance={"scoring_source": "protocol_analysis", "debate_id": debate.id})`, `db.add(run)`; (7) reads `protocol_state_of(debate.config)`, and if not `None`, advances `"5.4_cross_exam"` and `"5.5_verification"` to `"complete"` via `advance_phase` (whole-dict reassignment: `debate.config = {**debate.config, "protocol_state": state}` — NOT in-place mutation); (8) calls `commit_write(db)`. This is the exact insertion point Task 1/2 extend — the new QBAF/convergence code goes between step (4) and step (5) (need `node_dicts`/`scoring_items` already built; need the `AnalyzerRun`'s `output` dict, not yet constructed, to receive the new keys; need the state-advance block extended to also advance `5.6_qbaf_scoring`/`5.7_convergence`).
- `coordinator/app/qbaf/debate_adapter.py` (full file read verbatim): `debate_argument_graph(nodes: Sequence[Mapping[str, Any]], scores: Mapping[str, Any]) -> AdaptedDebateGraph` is the confirmed public entry point. `nodes` must be `{"id", "parent_id", "node_type"}` dicts — EXACTLY the same shape `runner.py` already builds as `node_dicts` for 5.4/5.5, so it can be reused directly, no new query. `scores` must be a `Mapping[node_id, scoring-item-dict]` — i.e. a dict KEYED BY NODE ID, not the flat `scoring_items` LIST that `cross_examine`/`verification_statuses` consume; Task 1 must build `scores_by_node_id = {item["node_id"]: item for item in scoring_items if item.get("node_id")}` before calling `debate_argument_graph`. `AdaptedDebateGraph` is a frozen dataclass: `graph: ArgumentGraph`, `tau_sources: Mapping[str, str]` (per-node-id value `"judge_strength"` or `"default"`, plus a synthetic `f"{node_id}__edge"` key set to `"unmapped_edge"` for any node whose `node_type` doesn't match a known PRO/CON/POV/ROOT_CLAIM vocabulary), `fingerprint: str` (a stable sha256 hex digest over sorted `(node_id, parent_id, node_type, tau)` rows — deterministic per graph topology+tau state, suitable for the `"graphFingerprint"` output key verbatim). Node-type vocabulary (confirmed via the adapter's own code comment, grepped 2026-07-07): `_SUPPORT_TYPES = {"PRO", "SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}`, `_ATTACK_TYPES = {"CON"}`, `_NO_EDGE_TYPES = {"ROOT_CLAIM"}`. `_tau_for` reads `scores[node_id]["scores"]["strength"]` if present and numeric, else defaults to `DEFAULT_TAU = 0.5` with source `"default"` — this confirms the mission's `tau=judgeStrength|default` composition-note phrasing exactly.
- `coordinator/app/qbaf/dfquad.py`: `class CyclicGraphError(ValueError)` (line 37) — raised when the attack+support edge union contains a cycle; DF-QuAD's equations require an acyclic graph, v1 forbids cycles outright (no approximate/iterative fixed-point fallback). `class ArgumentGraph` (line 74) holds `base_scores: dict[str,float]`, `attacks`/`supports` edge lists. `ArgumentGraph.compute_strengths(self) -> dict[str, float]` (line 142): calls `self._validate()` (raises `CyclicGraphError` or other validation errors — full `_validate()` body not read in this pass, see UNVERIFIED #4), then computes final per-node strengths in topological order. Return shape is a flat `{node_id: float}` map — this is exactly the shape needed for the `"dialecticalStrengths"` output key (values are the DF-QuAD sigma/final-strength floats).
- `coordinator/app/models/entities.py:190-200` — `AnalyzerRun` columns: `id`, `debate_id`, `branch_id`, `analyzer_type` (`String(80)`, indexed), `output` (`JSON`, default `dict`), `status` (`String(24)`, default `"complete"`, indexed), `provenance` (`JSON`, default `dict`), `created_at` (`DateTime(timezone=True)`, default `now_utc`). No `updated_at` column — `created_at` is the only timestamp, confirming `order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())` (the tie-break-by-id pattern already used identically at `coordinator/app/scoring/service.py:128` and `coordinator/app/scoring/cache.py:68`) is the correct/consistent way to find "the previous run" for this debate.
- `coordinator/app/protocol/cross_exam.py` — `CrossExamReport` is a frozen dataclass with `entries: list[dict]`, `version: str`, `entries_by_claim_id()`, and `to_dict() -> {"entries": ..., "version": ...}` — confirms the existing report's export convention Task 1's new QBAF section should mirror stylistically (plain dict export, no nested dataclass leakage into `AnalyzerRun.output`).
- `coordinator/app/protocol/state.py`'s `protocol_state_of(debate_config)` returns `None` if `debate_config` is falsy or lacks a dict `"protocol_state"` key — Task 1/2's marker-advancement code must keep the existing `if state is not None:` guard style (do not advance markers when there is no protocol state to advance, e.g. debates created before protocol state existed).

---

### Task 1: Register 5.6 + QBAF dialectical strengths in the protocol run

**Files:**
- Modify: `coordinator/app/protocol/state.py`
- Modify: `coordinator/app/protocol/runner.py`
- Modify: `coordinator/tests/test_protocol_state.py` (update existing phase-snapshot assertions deliberately)
- Modify/extend: `coordinator/tests/test_protocol_runner.py`

**Interfaces:**
- `NOT_IMPLEMENTED_PHASES` becomes `frozenset({"5.7_convergence"})` in this task (5.7 is removed in Task 2, not here — do the two removals in their own tasks so each task's tests isolate its own phase).
- In `_run_protocol_analysis`, after building `node_dicts` and `scoring_items` (before constructing the `AnalyzerRun`): build `scores_by_node_id`, call `debate_argument_graph(node_dicts, scores_by_node_id)`, then `.graph.compute_strengths()`.
- On success, `AnalyzerRun.output` gains: `"dialecticalStrengths": {node_id: sigma, ...}`, `"graphFingerprint": adapted.fingerprint`, `"tauSources": dict(adapted.tau_sources)`, `"qbafSemantics": "df-quad-v1"`, `"compositionNote": "v1: tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"` (verbatim string — this exact text is a hard requirement, not paraphrased).
- On `CyclicGraphError` (or other adapter/graph-construction failure — see UNVERIFIED #4 for exact except-clause breadth), the qbaf keys above are OMITTED entirely and replaced with a single `"qbafUnavailableReason": str(exc)` key; the rest of the `protocol_analysis` run (cross-exam, verification) still persists normally — this failure must NOT propagate out and prevent the `AnalyzerRun` from being created.
- `5.6_qbaf_scoring` advances to `"complete"` in BOTH the success and the honest-failure (`qbafUnavailableReason`) case — both are "the evaluation ran"; it only stays untouched if an entirely unexpected exception escapes past this task's own try/except into the outer best-effort wrapper.

- [ ] **Step 1: Write failing tests first**

Edit `coordinator/tests/test_protocol_state.py`:
- Update `NOT_IMPLEMENTED_PHASES`-dependent assertions so `5.6_qbaf_scoring` is now expected to initialize as `"pending"` (not `"not_implemented"`) and can advance to `"complete"`; `5.7_convergence` still asserted as `"not_implemented"` (until Task 2). Mirror the exact test-editing pattern Phase 5b used for `5.4_cross_exam`/`5.5_verification` (see that phase's `test_cross_exam_and_verification_are_no_longer_not_implemented`-style tests) but for `5.6_qbaf_scoring` alone in this task.

Add to `coordinator/tests/test_protocol_runner.py`:

```python
def test_run_protocol_analysis_computes_dialectical_strengths_for_scored_debate(db) -> None:
    # Build a debate with a ROOT_CLAIM + one PRO + one CON child, each scored,
    # so debate_argument_graph produces a non-trivial acyclic graph.
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)  # implementer: build via existing node/scoring fixtures/factories, not hand JSON
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert "dialecticalStrengths" in run.output
    assert set(run.output["dialecticalStrengths"].keys())  # non-empty
    assert run.output["qbafSemantics"] == "df-quad-v1"
    assert run.output["compositionNote"] == (
        "v1: tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"
    )
    assert "graphFingerprint" in run.output
    assert "tauSources" in run.output
    assert "qbafUnavailableReason" not in run.output


def test_run_protocol_analysis_records_qbaf_unavailable_reason_on_cycle(db) -> None:
    from unittest.mock import patch
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.debate_argument_graph", side_effect=CyclicGraphError("cycle detected")):
        run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert "qbafUnavailableReason" in run.output
    assert "dialecticalStrengths" not in run.output
    # cross-exam/verification must still be present -- failure is isolated
    assert "crossExam" in run.output
    assert "verificationStatuses" in run.output


def test_qbaf_phase_advances_to_complete_on_success_and_on_honest_failure(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.6_qbaf_scoring"] == "complete"

    from unittest.mock import patch
    debate2 = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    with patch("app.protocol.runner.debate_argument_graph", side_effect=CyclicGraphError("cycle")):
        run_protocol_analysis(db, debate2)
    db.refresh(debate2)
    state2 = protocol_state_of(debate2.config)
    assert state2["phases"]["5.6_qbaf_scoring"] == "complete"  # honest-unavailable still completes the evaluation


def test_no_raw_judge_output_in_qbaf_section(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    dumped = str(run.output)
    assert "ClaimAssessment" not in dumped  # no raw judge object leakage
```

(Implementer: add small `_seed_scored_pro_con_nodes`/`_latest_protocol_analysis_run` test helpers using EXISTING fixtures/factories already present in `coordinator/tests/` — do not hand-construct fake scoring JSON; reuse whatever node/scoring seeding helper `test_protocol_cross_exam.py`'s or `test_node_scoring.py`'s DB-backed tests already use. Import `CyclicGraphError` from `app.qbaf.dfquad`, `debate_argument_graph` from `app.protocol.runner`'s namespace — imported there for patching, not from `app.qbaf.debate_adapter` directly, so the `patch(...)` target matches the actual call site.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (new/updated assertions fail against current `NOT_IMPLEMENTED_PHASES`/`runner.py` behavior).

- [ ] **Step 3: Implement**

In `coordinator/app/protocol/state.py`:
```python
NOT_IMPLEMENTED_PHASES: frozenset[str] = frozenset({"5.7_convergence"})
```

In `coordinator/app/protocol/runner.py`, add imports:
```python
from app.qbaf.dfquad import CyclicGraphError
from app.qbaf.debate_adapter import debate_argument_graph
```

Insert between the existing `verification_map = verification_statuses(nodes_with_claims)` line and the `branch = _first_branch(db, debate.id)` line:
```python
    scores_by_node_id = {
        item["node_id"]: item for item in scoring_items if item.get("node_id")
    }
    qbaf_output: dict[str, Any] = {}
    try:
        adapted = debate_argument_graph(node_dicts, scores_by_node_id)
        strengths = adapted.graph.compute_strengths()
        qbaf_output = {
            "dialecticalStrengths": strengths,
            "graphFingerprint": adapted.fingerprint,
            "tauSources": dict(adapted.tau_sources),
            "qbafSemantics": "df-quad-v1",
            "compositionNote": (
                "v1: tau=judgeStrength|default; verificationModifier=none(P7); "
                "modelWeight=constant-1.0(P8)"
            ),
        }
    except (CyclicGraphError, ValueError) as exc:
        qbaf_output = {"qbafUnavailableReason": str(exc)}
```
(Confirm the except-clause breadth against `_validate()`'s real exception surface per UNVERIFIED #4 before finalizing — widen to bare `Exception` if `_validate()` can raise something other than a `ValueError` subtype.)

Merge `qbaf_output` into the `AnalyzerRun.output` dict literal (alongside the existing `crossExam`/`verificationStatuses` keys) via `**qbaf_output` spread or explicit key assembly.

Extend the marker-advancement block:
```python
        state = advance_phase(state, "5.4_cross_exam", "complete")
        state = advance_phase(state, "5.5_verification", "complete")
        state = advance_phase(state, "5.6_qbaf_scoring", "complete")
```

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Move to Task 2.

---

### Task 2: Register 5.7 + epsilon-stability convergence

**Files:**
- Modify: `coordinator/app/protocol/state.py`
- Modify: `coordinator/app/protocol/runner.py`
- Modify: `coordinator/tests/test_protocol_state.py`
- Modify/extend: `coordinator/tests/test_protocol_runner.py`

**Interfaces:**
- `NOT_IMPLEMENTED_PHASES` becomes `frozenset()` (empty) — 5.7 is the last phase removed.
- Before constructing this run's `AnalyzerRun`, query the PREVIOUS `protocol_analysis` `AnalyzerRun` for the same debate: `select(AnalyzerRun).where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE).order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).limit(1)` (per UNVERIFIED #1, do this query BEFORE `db.add`-ing this run's new `AnalyzerRun`, to sidestep any autoflush ambiguity about whether the not-yet-committed new row would appear in the same query).
- If no previous run exists, OR the previous run's `output` lacks a `"dialecticalStrengths"` key (e.g. it recorded `qbafUnavailableReason` instead): `convergence = {"converged": None, "reason": "first_evaluation"}`.
- Else: `prev_strengths = previous_run.output["dialecticalStrengths"]`; `curr_strengths = qbaf_output.get("dialecticalStrengths", {})` (empty if THIS run's own QBAF failed); intersection = keys present in both; if intersection is empty: `convergence = {"converged": None, "reason": "topology_changed", "nodesCompared": 0, "nodesAdded": len(added), "nodesRemoved": len(removed)}`; else `maxDelta = max(abs(curr_strengths[k] - prev_strengths[k]) for k in intersection)`, `converged = maxDelta <= epsilon`, output includes `{"converged": bool, "maxDelta": maxDelta, "nodesCompared": len(intersection), "nodesAdded": len(added), "nodesRemoved": len(removed), "epsilon": epsilon, "comparedAnalyzerRunId": previous_run.id}` where `added = curr_keys - prev_keys`, `removed = prev_keys - curr_keys`.
- `epsilon` resolution: default `0.05`; override via `debate.config.get("protocol", {}).get("convergence_epsilon")` (see UNVERIFIED #2) IF it is a `float`/`int` strictly between 0 and 1 exclusive; otherwise fall back to the default AND note the fallback (e.g. include `"epsilonSource": "default"` vs `"epsilonSource": "config_override"` — pick one convention and apply consistently; if invalid override supplied, still use default silently-but-honestly via `epsilonSource`, do not raise).
- Full output key: `"convergence": {...}` (as assembled above, always including `"epsilon"` and `"convergenceVersion"`), plus a top-level `"convergenceVersion": "epsilon-stability-v1"` key (mission specifies this as a sibling version key, consistent with `crossExamVersion`/`verificationVersion`/`qbafSemantics` siblings already in `output`).
- `5.7_convergence` advances to `"complete"` whenever the evaluation ran at all — `converged` being `True`, `False`, or `None` are ALL completion states; only an unexpected crash escaping to the outer wrapper leaves the marker untouched.

- [ ] **Step 1: Write failing tests first**

Edit `coordinator/tests/test_protocol_state.py`: `5.7_convergence` now initializes as `"pending"` and can advance to `"complete"`; `NOT_IMPLEMENTED_PHASES` is now empty — update/remove any test that asserted it was non-empty, and add a test confirming it is `frozenset()`.

Add to `coordinator/tests/test_protocol_runner.py`:

```python
def test_first_evaluation_has_null_convergence_with_reason(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"] == {"converged": None, "reason": "first_evaluation"}
    assert run.output["convergenceVersion"] == "epsilon-stability-v1"


def test_second_evaluation_computes_max_delta_against_previous_run(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    first_run = _latest_protocol_analysis_run(db, debate.id)
    # Hand-computed fixture: mutate scoring so exactly one node's strength
    # shifts by a KNOWN delta, then re-run.
    _bump_one_node_strength(db, debate, delta=0.2)  # implementer: real scoring-row update, not fake JSON
    run_protocol_analysis(db, debate)
    second_run = _latest_protocol_analysis_run(db, debate.id)
    convergence = second_run.output["convergence"]
    assert convergence["comparedAnalyzerRunId"] == first_run.id
    assert convergence["nodesCompared"] == len(first_run.output["dialecticalStrengths"])
    assert convergence["maxDelta"] == pytest.approx(<hand-computed value>, abs=1e-6)
    assert convergence["converged"] is (convergence["maxDelta"] <= 0.05)


def test_convergence_epsilon_is_config_overridable(db) -> None:
    debate = service.create_dialectical_debate(
        db, "Should cities ban cars downtown?", {"protocol": {"convergence_epsilon": 0.5}}
    )
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    _bump_one_node_strength(db, debate, delta=0.2)
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"]["epsilon"] == 0.5


def test_invalid_convergence_epsilon_falls_back_to_default(db) -> None:
    debate = service.create_dialectical_debate(
        db, "Should cities ban cars downtown?", {"protocol": {"convergence_epsilon": 1.5}}
    )
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"]["epsilon"] == 0.05


def test_topology_drift_reports_added_and_removed_node_counts(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    _seed_scored_pro_con_nodes(db, debate)
    run_protocol_analysis(db, debate)
    _add_new_scored_node(db, debate)  # implementer: real new Node + scoring row
    run_protocol_analysis(db, debate)
    run = _latest_protocol_analysis_run(db, debate.id)
    assert run.output["convergence"]["nodesAdded"] >= 1


def test_convergence_phase_advances_to_complete_regardless_of_converged_value(db) -> None:
    debate = service.create_dialectical_debate(db, "Should cities ban cars downtown?", {})
    run_protocol_analysis(db, debate)
    db.refresh(debate)
    state = protocol_state_of(debate.config)
    assert state["phases"]["5.7_convergence"] == "complete"
```

(Implementer: replace `<hand-computed value>` with the actual arithmetic result given the real fixture deltas — do not leave a placeholder in the committed test; compute it by hand from the exact `_bump_one_node_strength` change applied. `_add_new_scored_node`/`_bump_one_node_strength` must perform REAL node/scoring mutations through existing factories/session writes, not synthetic JSON standing in for a real computation path, per the Global Constraints "no fake runtime data" rule.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_state.py tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (new assertions fail; `NOT_IMPLEMENTED_PHASES` not yet empty; no convergence output yet).

- [ ] **Step 3: Implement**

In `coordinator/app/protocol/state.py`:
```python
NOT_IMPLEMENTED_PHASES: frozenset[str] = frozenset()
```

In `coordinator/app/protocol/runner.py`, add `DEFAULT_CONVERGENCE_EPSILON = 0.05` and `CONVERGENCE_VERSION = "epsilon-stability-v1"` module constants. Before constructing this run's `AnalyzerRun` (so the previous-run query runs against not-yet-mutated state), add:

```python
    previous_run = db.scalars(
        select(AnalyzerRun)
        .where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE)
        .order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc())
        .limit(1)
    ).first()

    raw_epsilon = (debate.config or {}).get("protocol", {}).get("convergence_epsilon")
    if isinstance(raw_epsilon, (int, float)) and not isinstance(raw_epsilon, bool) and 0 < raw_epsilon < 1:
        epsilon = float(raw_epsilon)
    else:
        epsilon = DEFAULT_CONVERGENCE_EPSILON

    prev_strengths = None
    if previous_run is not None:
        prev_strengths = (previous_run.output or {}).get("dialecticalStrengths")

    curr_strengths = qbaf_output.get("dialecticalStrengths")
    if previous_run is None or prev_strengths is None:
        convergence = {"converged": None, "reason": "first_evaluation"}
    else:
        prev_keys = set(prev_strengths.keys())
        curr_keys = set((curr_strengths or {}).keys())
        intersection = prev_keys & curr_keys
        added = curr_keys - prev_keys
        removed = prev_keys - curr_keys
        if not intersection:
            convergence = {
                "converged": None,
                "reason": "topology_changed",
                "nodesCompared": 0,
                "nodesAdded": len(added),
                "nodesRemoved": len(removed),
                "epsilon": epsilon,
            }
        else:
            max_delta = max(abs(curr_strengths[k] - prev_strengths[k]) for k in intersection)
            convergence = {
                "converged": max_delta <= epsilon,
                "maxDelta": max_delta,
                "nodesCompared": len(intersection),
                "nodesAdded": len(added),
                "nodesRemoved": len(removed),
                "epsilon": epsilon,
                "comparedAnalyzerRunId": previous_run.id,
            }
```

Merge into `AnalyzerRun.output`: `"convergence": convergence, "convergenceVersion": CONVERGENCE_VERSION`.

Extend the marker-advancement block once more:
```python
        state = advance_phase(state, "5.7_convergence", "complete")
```

- [ ] **Step 4: Verify pass + full-suite rerun**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_protocol_triage.py tests/test_protocol_state.py tests/test_protocol_cross_exam.py tests/test_protocol_verification.py tests/test_protocol_runner.py tests/test_protocol_integration.py tests/test_dialectical_v2.py tests/test_node_scoring.py tests/test_debate_graph_adapter.py tests/test_qbaf_purity.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except the pre-existing known failures (re-baselined at the start of this phase per Global Constraints). If a NEW failure appears, fix the root cause in this phase's code before reporting done — do not weaken a pre-existing test to paper over a real regression. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and flag UNVERIFIED #1/#2/#4 explicitly as decisions to confirm — in particular #1 (autoflush ordering for the previous-run query) is safety-critical and must be confirmed empirically by the passing test suite, not just by code inspection.
