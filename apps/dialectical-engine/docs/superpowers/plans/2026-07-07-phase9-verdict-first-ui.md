# Phase 9: Verdict-First UI (Feature-Flagged) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the debate page away from a rigid 4-POV-first presentation toward LEADING with the verdict/synthesis in plain claim language, without ever fabricating precision or hiding data. Task 1 (coordinator, pytest TDD) adds a stable, additive wire shape exposing the latest `protocol_analysis` output plus a pure `verdict_summary` function mapping real protocol data to a qualitative band + deterministic claim-language string. Task 2 (web, flag-gated) adds a verdict-first banner that reads that shape. Task 3 (web) ensures low-strength and stale/abandoned nodes are rendered de-emphasized but always visible and inspectable — never hidden or deleted. Feature flag defaults OFF; flag off must leave the UI byte-identical to today.

**Tech Stack:** Coordinator: Python 3.12, SQLAlchemy, FastAPI, pytest (`cd coordinator && python -m pytest tests`). Web: Next.js 15 (App Router), React 19, TypeScript 5.6, no bundled UI test runner (see Global Constraints — web verification strategy is adapted, not faked).

## UNVERIFIED — implementer must confirm before/while implementing

1. **Which `AnalyzerRun` row is "latest" `protocol_analysis` when serialized to web.** `serialization.py:375-377` queries ALL `AnalyzerRun` rows for the debate `order_by(AnalyzerRun.created_at.asc())` and serializes every one into `detail["analyzer_runs"]` (a flat list of all analyzer types, all historical runs, ascending). The web client would have to filter this list client-side for `analyzer_type == "protocol_analysis"` and take the last (or max `created_at`) entry. This plan's Task 1 instead adds a dedicated, already-latest-only server-side field (`protocolAnalysis` or similar) to avoid pushing that filtering/selection logic onto the web client and to avoid a second full analyzer-run list traversal per request. Implementer must re-open `coordinator/app/services/serialization.py` around lines 360-421 (the enclosing function — read its full signature/name, not yet confirmed in this pass beyond the `analyzer_runs`/`tree` keys) immediately before Task 1 to confirm: (a) the exact enclosing function name and its existing `db`/`debate` parameters, (b) whether a "latest run of a given analyzer_type" helper already exists elsewhere (grep `analyzer_type ==.*order_by.*desc` across `coordinator/app` — the pattern used at `runner.py:174-179` for `previous_run` is the confirmed precedent to reuse, not reinvent).
2. **Exact `NodeScoringPayload`/`NodeScores` pydantic alias convention** was not re-read from `coordinator/app/scoring/models.py` in this pass (carried over as an open item from Phase 7/8 plans, apparently still never closed out). Implementer must re-read `coordinator/app/scoring/models.py` in full before Task 1 to confirm whether response models use `alias_generator=to_camel` (matching the wire shape's `verificationStatuses`/`dialecticalStrengths` camelCase already observed in `runner.py`) or manual `Field(alias=...)`, so the new `verdict_summary` pydantic/dict output matches the established convention exactly.
3. **Root-claim key for `dialecticalStrengths` lookup.** `qbaf_output["dialecticalStrengths"]` (`coordinator/app/protocol/runner.py:154-156`) is `adapted.graph.compute_strengths()`, observed only as `dict[str, float]` keyed by node id (not independently re-verified in this pass which key is "the root claim" — likely `debate.root_node_id` or the tree's root `node.id`, both already available at other call sites per `serialization.py`). Implementer must confirm the root node id accessor (grep `root_node_id` in `coordinator/app/models/entities.py` and `serialization.py:409` `node_to_dict(db, root, ...)` — `root` is already a resolved variable in the enclosing function per the Verified Ground Truth below) before writing `verdict_summary`'s lookup of "the root claim's" strength.
4. **Whether `debate.config` or any existing convention holds product-facing band thresholds already** (e.g. something the mission's ">=0.65 supported / <=0.35 unsupported" thresholds might collide with or should reuse) was not grepped in this pass. Implementer should grep `0.65|0.35` and `verdictBand|verdict_band` across `coordinator/app` and `web/lib` immediately before Task 1 to confirm zero prior art (this plan assumes zero — if a prior convention exists, reconcile rather than introduce a second threshold source).
5. **Web has NO configured test runner** (`web/package.json` has only `dev`/`build`/`start`/`lint` scripts; no `jest`/`vitest`/`playwright`/`@testing-library/*` in `dependencies`/`devDependencies`). However, `web/components/*.source-test.mjs` files DO exist today (e.g. `DebateOutline.scoring.source-test.mjs`, `scoringOutput.source-test.mjs`) using Node's built-in `node:test` + `node:assert/strict`, asserting via regex against component **source text** (not rendered output, not a headless browser) — run ad hoc via `node --test <file>` (no npm script wires them; not independently re-verified in this pass whether any CI step invokes them, grep `node --test|source-test` across any `.github`/CI config before Task 2/3 if that matters to the implementer's confidence). This plan's web tasks reuse this exact existing convention for automated verification (source-regex assertions on the new conditional-rendering code, run via `node --test`), plus `tsc --noEmit`/`next build` for type-safety, plus an explicit manual-verification checklist — this is the "strongest available verification" honestly, not a claim that a real component-rendering test suite exists. See Global Constraints.
6. **Exact current `DebateOutline.tsx` / `DebateTree.tsx` / `DebateCanvas.tsx` role split on the debate page** (which component is the top-level one rendered by `web/app/debate/[id]/DebatePageClient.tsx`) was not fully traced in this pass — only grepped for keywords, not read end-to-end. Implementer must read `web/app/debate/[id]/DebatePageClient.tsx` in full before Task 2 to confirm exactly where a verdict-first banner should mount (top of the page, above whichever of `DebateOutline`/`DebateTree`/`DebateCanvas`/`SynthesisPanel` currently renders first) and confirm `SynthesisPanel.tsx` (already present) isn't already the intended "verdict" surface that Task 2 should extend instead of duplicating.
7. **Existing greyed/abandoned precedent is in `DebateTree.tsx`, not confirmed in `DebateOutline.tsx` or `DebateCanvas.tsx`.** `DebateTree.tsx` already renders abandoned children behind a collapsed `.abandonedPaths` summary (never deleted) via `isAbandonedArgumentStatus`/`isAbandonedNode` from `web/lib/debateTreeUtils.ts`. Whether `DebateCanvas.tsx` (the presumed canvas/graph view, not read in this pass) has its own separate stale/greyed handling — possibly none yet — must be confirmed before Task 3 scopes which component(s) need new de-emphasis styling versus already having it.
8. **Low-strength threshold value for Task 3's greyed-out rendering** is not yet defined anywhere in web or coordinator (only the verdict-band thresholds in Task 1 exist as of this plan). Implementer must decide whether Task 3 reuses Task 1's exact thresholds (e.g. `< 0.35` treated as "low-strength" for dimming) or defines its own, and document the choice explicitly rather than silently picking a number.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash/PowerShell call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append, coordinator tasks):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **Pre-existing known failures may exist in the coordinator suite** — these are NOT this phase's responsibility. Re-baseline the count once at the start of this phase (run the full suite once before touching code) rather than trusting any stale number; do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — coordinator tests must use real fixture rows (real `Debate`/`Node`/`AnalyzerRun`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **TDD strictly for coordinator tasks:** for every coordinator task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **Web test tooling constraint (adapted TDD, stated openly — not faked):** `web/` has no jest/vitest/playwright/testing-library installed and no `test` npm script (confirmed by reading `web/package.json` in full — only `dev`/`build`/`start`/`lint`). Web DOES have a pre-existing lightweight convention of `*.source-test.mjs` files under `web/components/` that use Node's built-in `node:test` + `node:assert/strict` to regex-assert against component **source text** (not rendered DOM, no browser). This plan's web tasks (2 and 3) follow that exact existing convention for their automated check — write a failing `*.source-test.mjs` first (asserting the new prop/conditional/class-name contract is present in source), confirm it fails (`node --test <file>` — file not yet matching), implement, confirm it passes. This is NOT equivalent to a rendered-output or interaction test; it only proves the expected code shape exists in source, not that it renders correctly at runtime. Because of that gap, EVERY web task additionally requires: (a) `npx tsc --noEmit` (or `next build`) with zero new type errors, and (b) an explicit manual-verification checklist in the task's final step (flag on/off visual check via the dev server) that the implementer must actually perform and report on, not skip. Do not claim a web task "passes tests" as if it were equivalent to the coordinator's pytest TDD rigor — report it accurately as "source-test + typecheck + manual checklist."
- **Do NOT introduce jest/vitest/playwright/testing-library in this phase.** If the implementer believes a real component test runner is warranted, STOP and flag it as a separate, explicitly-scoped follow-up decision rather than silently adding new devDependencies mid-task.
- **DDD naming:** any new public wire-facing keys must use claim/debate-domain camelCase language at the JSON/pydantic-alias boundary, consistent with `verificationStatuses`/`dialecticalStrengths`/`convergenceVersion` already emitted by `coordinator/app/protocol/runner.py`. Internal Python stays snake_case per existing file convention.
- **No schema migrations.** `AnalyzerRun.output` is already a persisted unconstrained JSON column; Task 1 reads existing persisted data and adds a pure derived-summary function plus an additive serialization field. No new persisted columns are needed anywhere in this phase.
- **Honesty laws (binding, non-negotiable, apply to every task):**
  - NEVER fake-precise numerics in user-facing claim language. Qualitative bands (`"supported"` / `"contested"` / `"unsupported"` / `"unavailable"`) are derived from real `dialecticalStrengths` scores using fixed, documented v1 thresholds (`>= 0.65` supported, `<= 0.35` unsupported, else contested) — declared as `verdictThresholdsVersion: "verdict-v1"`, explicitly NOT presented as learned/calibrated. The real underlying number is always available alongside the band (never band-only, never number-only) so a tooltip/detail view can show it.
  - Verdict language must reflect ACTUAL protocol data. `verificationStatuses` "pending" (real-verdict path, all-unverifiable) and "pending_verification" (P5b kind-classifier fallback) are DISTINCT states and MUST NOT be conflated or merged into a single label anywhere in `verdict_summary` or the web banner. `convergence` (`converged: true|false|null` plus `reason`) must be surfaced honestly, including the `null`/reason cases (`"strengths_unavailable"`, `"first_evaluation"`, `"topology_changed"`) — never silently coerced to a boolean.
  - Missing protocol data (no `protocol_analysis` `AnalyzerRun` exists yet for the debate) -> `verdictBand: "unavailable"`, `claimLanguage` an honest "analysis unavailable" template string. NEVER fabricate a verdict when the underlying analyzer run does not exist.
  - Greyed is never deleted. Low-strength nodes (below the documented threshold) and stale/abandoned nodes must remain rendered, de-emphasized (opacity/muted class + explicit status label), and reachable via the existing detail drawer — never filtered out of the DOM/tree entirely.
  - Feature flag defaults OFF. Flag off -> UI byte-identical to today (verified via the source-test asserting the new JSX is inside a flag-gated conditional block, plus a manual visual diff).
- **No LLM calls anywhere in this phase.** Task 1's `verdict_summary` is a pure function over already-persisted protocol/analyzer data; it must not call any judge/arguer/LLM provider.
- **Allowed files per task** are listed under each task below; do not touch files outside those lists without stopping and flagging why in the final report.

## Verified Ground Truth

- `coordinator/app/services/serialization.py:218-224` — `analyzer_run_to_dict(run: AnalyzerRun) -> dict`: `{"id", "debate_id", "branch_id", "analyzer_type", "output", "status", "provenance", "created_at"}` — `output` is the raw persisted JSON dict, snake_case container keys but internally camelCase per `runner.py`'s construction.
- `coordinator/app/services/serialization.py:375-377,409-421` — the debate-detail serializer queries ALL `AnalyzerRun` rows for the debate (`order_by(created_at.asc())`, no `analyzer_type` filter) and includes every one in `detail["analyzer_runs"]` as a flat ascending list, alongside `detail["tree"]` (built from a `root` node variable already resolved in the enclosing function) and `detail["branch_lineage"]`. There is currently NO dedicated "latest protocol_analysis" field served — web would have to filter/select from the flat list itself. This is the confirmed gap Task 1 closes additively (new field, not a replacement).
- `coordinator/app/protocol/runner.py:33` — `PROTOCOL_ANALYSIS_TYPE = "protocol_analysis"`; the analyzer run persisted at `runner.py:224-239` has `output = {"crossExam": ..., "verificationStatuses": verification_map, "verificationSource": verification_source, "crossExamVersion": ..., "verificationVersion": "verification-v1", "dialecticalStrengths": {...}, "graphFingerprint": ..., "tauSources": {...}, "qbafSemantics": "df-quad-v1", "compositionNote": "...", "convergence": {"converged": bool|None, "reason": str, ...}, "convergenceVersion": CONVERGENCE_VERSION}` (exact keys confirmed live). `dialecticalStrengths` may be absent (replaced by `qbafUnavailableReason`) if `CyclicGraphError`/`ValueError` occurred (`runner.py:165-166`) — an honest failure path Task 1 must handle (missing key, not a crash).
- `coordinator/app/protocol/runner.py:174-179` — the exact "latest run of a given analyzer_type" query precedent to reuse verbatim in Task 1: `select(AnalyzerRun).where(AnalyzerRun.debate_id == debate.id, AnalyzerRun.analyzer_type == PROTOCOL_ANALYSIS_TYPE).order_by(AnalyzerRun.created_at.desc(), AnalyzerRun.id.desc()).limit(1)`.
- `coordinator/app/protocol/verification.py:23-26` — `classify_verification(claim_type)` returns `"pending_verification"` as the conservative P5b kind-classifier fallback for ambiguous claim types (comment explicitly notes a future P7 "pending" real-verdict path is distinct — confirmed by the mission's own P7-contract framing; the live evidence-verification overlay path in `runner.py:100-146`, only partially read in this pass, is where the real-verdict `"pending"` state and `verification_source` values like `"kind_classifier"` vs. the overlay's own source label are produced — re-read `verification.py`/`runner.py:83-146` in full before Task 1 if the exact `"pending"` emission site matters to the implementer).
- `web/lib/types.ts:325-337` — `AnalyzerRun` TS type already exists (`{id, debate_id, branch_id, analyzer_type, output: {findings?: string[], [key: string]: unknown}, status, provenance, created_at}`), loosely typed (`output` is an open index signature) — safe to consume `verificationStatuses`/`dialecticalStrengths`/`convergence` off of it today via casting/optional-chaining without a type change, though Task 1/2 may add a narrower `ProtocolAnalysisOutput` type alongside it.
- `web/lib/types.ts:87-96` — `NodeScores = {strength, uncertainty, impact, evidence_quality, relevance, logical_validity, assumption_risk, counter_resilience}` (snake_case field names, all numeric). `web/lib/scoringFormat.ts:1-15` — `formatScorePercent(score: number) -> FormattedScorePercent` and `formatScoreBadgeLabel(title, bandLabel, score)` already exist as the precedent "real number -> display band/percent" helper Task 1's `claimLanguage`/Task 2's badge should mirror in spirit (band derived from real score, real number retained alongside).
- `web/components/DebateTree.tsx` (grepped, not fully read) — already imports `isAbandonedArgumentStatus` from `web/lib/debateTreeUtils.ts`; defines local `isAbandonedNode`. Abandoned nodes get `className="... abandoned"` and a `.abandonedBadge` "Stopped" label instead of raw `node.status`; children are split into `activeChildren`/`abandonedChildren` and abandoned ones render inside a collapsed `.abandonedPaths` summary block (`⊗ N stopped path(s)`), never removed from the DOM. This is the CONFIRMED existing "greyed/de-emphasized but visible" precedent Task 3 should extend to low-strength nodes and reuse (not reinvent) for any additional component that needs it.
- `web/package.json` (full file read) — dependencies: `next ^15.0.0`, `react ^19.0.0`, `react-dom ^19.0.0`; devDependencies: `@types/node`, `@types/react`, `@types/react-dom`, `typescript ^5.6.0`. Scripts: `dev` (`next dev -p 3000`), `build`, `start`, `lint`. NO `test` script, NO jest/vitest/playwright/testing-library anywhere in the file. `web/components/DebateOutline.scoring.source-test.mjs` and `web/components/scoringOutput.source-test.mjs` exist and use `node:test`/`node:assert/strict` to regex-match against `readFileSync`'d component source (confirmed live by reading `DebateOutline.scoring.source-test.mjs` in full) — not wired to any npm script; run via `node --test <path>` directly.
- `web/app/api/[...path]/route.ts:144-155` — catch-all API proxy: builds `targetUrl = new URL(`/api/${path.join("/")}${search}`, COORDINATOR_URL)` and forwards via `fetch`. Confirms the web app does not re-shape the coordinator's debate-detail JSON in a separate backend layer — whatever `serialization.py` emits reaches the client close to verbatim (modulo this proxy), so Task 1's new field is what the web client will actually receive.
- Feature-flag convention: `process.env`/`NEXT_PUBLIC_*` usage found only in `web/app/api/[...path]/route.ts`, `web/lib/serverApi.ts`, `web/lib/observability/logger.ts`, `web/lib/api.ts` (grepped, not all read in full) — no existing `NEXT_PUBLIC_FEATURE_*` flag convention was found or confirmed in this pass. Task 2 introduces the first such flag; implementer should check `web/lib/api.ts`/`serverApi.ts` briefly before Task 2 to confirm there's no existing generic "feature flags" module to extend instead of adding a bare `process.env.NEXT_PUBLIC_VERDICT_FIRST_UI` check inline.

---

### Task 1: Coordinator — latest `protocol_analysis` wire shape + pure `verdict_summary` (pytest TDD)

**Files:**
- Create: `coordinator/app/scoring/verdict.py`
- Modify: `coordinator/app/services/serialization.py` (add latest-protocol-analysis lookup + additive `detail["verdict"]` / `detail["protocol_analysis"]` keys at the same debate-detail serializer function confirmed in UNVERIFIED #1)
- Create: `coordinator/tests/test_verdict.py`
- Create/extend: `coordinator/tests/test_serialization_verdict.py` (or extend whichever existing test module covers the debate-detail serializer — grep `analyzer_runs\b` in `coordinator/tests/` first to find and reuse its fixtures rather than duplicating debate/node/analyzer-run setup)

**Interfaces:**
- `VERDICT_THRESHOLDS_VERSION = "verdict-v1"` (module constant).
- `verdict_summary(protocol_output: dict | None, *, root_node_id: str | None) -> dict`: pure function, no I/O, no DB access.
  - If `protocol_output` is `None` (no `protocol_analysis` `AnalyzerRun` exists yet) OR `root_node_id` is falsy: return `{"verdictBand": "unavailable", "claimLanguage": "No protocol analysis is available yet for this debate.", "basis": {"dialecticalStrength": None, "verificationStatus": None, "convergence": None}, "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION}`.
  - Else, read `strengths = protocol_output.get("dialecticalStrengths")` (may be absent/`None` if `qbafUnavailableReason` occurred). If `strengths` is `None` or `root_node_id not in strengths`: return the same `"unavailable"` shape as above but with `"basis": {"dialecticalStrength": None, "verificationStatus": <real value from protocol_output.get("verificationStatuses", {}).get(root_node_id)>, "convergence": protocol_output.get("convergence")}` — i.e. still surface whatever real partial data DOES exist (verification/convergence), never null out data that IS present just because strength is missing.
  - Else, `strength = strengths[root_node_id]` (a real float). Band: `strength >= 0.65 -> "supported"`; `strength <= 0.35 -> "unsupported"`; else `"contested"`.
  - `verification_status = protocol_output.get("verificationStatuses", {}).get(root_node_id)` (may be `None`, `"pending"`, `"pending_verification"`, or a concrete verified/unverified value — pass through verbatim, never conflate `"pending"` and `"pending_verification"`).
  - `convergence = protocol_output.get("convergence")` (pass through the whole dict verbatim: `{"converged": bool|None, "reason": str, ...}`).
  - `claimLanguage`: a deterministic template string built ONLY from real values already computed above, e.g.:
    - supported: `f"The root claim is strongly supported (dialectical strength {round(strength, 2)})."`
    - contested: `f"The root claim is contested (dialectical strength {round(strength, 2)})."`
    - unsupported: `f"The root claim is weakly supported (dialectical strength {round(strength, 2)})."`
    - Append `" Verification is still pending."` iff `verification_status in ("pending", "pending_verification")` (same suffix text for both — the DISTINCTION is preserved in the structured `basis.verificationStatus` field, not erased, but the mission does not require two different prose suffixes; implementer may choose distinct prose per state instead as long as `basis.verificationStatus` remains the real, un-merged value — document whichever choice is made).
    - Append `" Not yet converged."` iff `convergence` is a dict and `convergence.get("converged") is False`.
  - Return `{"verdictBand": <band>, "claimLanguage": <string>, "basis": {"dialecticalStrength": strength, "verificationStatus": verification_status, "convergence": convergence}, "verdictThresholdsVersion": VERDICT_THRESHOLDS_VERSION}`.
  - Never raises on malformed/partial input — every `.get(...)` call must have a safe default; a malformed `protocol_output` degrades to the `"unavailable"` shape, never a stack trace.
- Serialization addition: in the debate-detail serializer (exact function name to be confirmed per UNVERIFIED #1), after the existing `analyzer_runs` list is built, find the latest `protocol_analysis` run via the `runner.py:174-179` query pattern (reused verbatim, imported from wherever it's most natural to share — either duplicate the 5-line query inline with a comment citing `runner.py` as precedent, or extract a tiny shared helper `latest_analyzer_run(db, debate_id, analyzer_type)` if one does not already exist; check first). Add to the returned detail dict: `"verdict": verdict_summary(latest_run.output if latest_run else None, root_node_id=root.id if root else None)`. This is purely additive — no existing key is removed or renamed.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_verdict.py`:

```python
from app.scoring.verdict import VERDICT_THRESHOLDS_VERSION, verdict_summary


def test_verdict_unavailable_when_no_protocol_output() -> None:
    result = verdict_summary(None, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
    assert "no protocol analysis" in result["claimLanguage"].lower() or "not available" in result["claimLanguage"].lower()
    assert result["basis"] == {"dialecticalStrength": None, "verificationStatus": None, "convergence": None}
    assert result["verdictThresholdsVersion"] == VERDICT_THRESHOLDS_VERSION


def test_verdict_unavailable_when_no_root_node_id() -> None:
    result = verdict_summary({"dialecticalStrengths": {"node-1": 0.9}}, root_node_id=None)
    assert result["verdictBand"] == "unavailable"


def test_verdict_supported_band_from_real_strength() -> None:
    output = {
        "dialecticalStrengths": {"node-1": 0.8},
        "verificationStatuses": {"node-1": "verified"},
        "convergence": {"converged": True, "reason": None},
    }
    result = verdict_summary(output, root_node_id="node-1")
    assert result["verdictBand"] == "supported"
    assert result["basis"]["dialecticalStrength"] == 0.8
    assert "0.8" in result["claimLanguage"]
    assert result["basis"]["verificationStatus"] == "verified"
    assert result["basis"]["convergence"] == {"converged": True, "reason": None}


def test_verdict_unsupported_band() -> None:
    result = verdict_summary({"dialecticalStrengths": {"node-1": 0.2}}, root_node_id="node-1")
    assert result["verdictBand"] == "unsupported"


def test_verdict_contested_band_midpoint() -> None:
    result = verdict_summary({"dialecticalStrengths": {"node-1": 0.5}}, root_node_id="node-1")
    assert result["verdictBand"] == "contested"


def test_verdict_pending_vs_pending_verification_are_not_conflated() -> None:
    pending = verdict_summary(
        {"dialecticalStrengths": {"node-1": 0.7}, "verificationStatuses": {"node-1": "pending"}},
        root_node_id="node-1",
    )
    pending_verification = verdict_summary(
        {"dialecticalStrengths": {"node-1": 0.7}, "verificationStatuses": {"node-1": "pending_verification"}},
        root_node_id="node-1",
    )
    assert pending["basis"]["verificationStatus"] == "pending"
    assert pending_verification["basis"]["verificationStatus"] == "pending_verification"
    assert pending["basis"]["verificationStatus"] != pending_verification["basis"]["verificationStatus"]


def test_verdict_missing_strengths_still_surfaces_real_partial_data() -> None:
    output = {"qbafUnavailableReason": "cycle detected", "verificationStatuses": {"node-1": "pending_verification"}, "convergence": {"converged": None, "reason": "strengths_unavailable"}}
    result = verdict_summary(output, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
    assert result["basis"]["dialecticalStrength"] is None
    assert result["basis"]["verificationStatus"] == "pending_verification"
    assert result["basis"]["convergence"] == {"converged": None, "reason": "strengths_unavailable"}


def test_verdict_never_raises_on_malformed_input() -> None:
    result = verdict_summary({"dialecticalStrengths": "not-a-dict"}, root_node_id="node-1")
    assert result["verdictBand"] == "unavailable"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_verdict.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`ModuleNotFoundError` — `app/scoring/verdict.py` does not exist yet).

- [ ] **Step 3: Implement `verdict_summary`**

Implement per the Interfaces section exactly, including the never-raises guarantee (wrap the `strengths` type-check defensively — `test_verdict_never_raises_on_malformed_input` requires a non-dict `dialecticalStrengths` to degrade honestly, not raise).

- [ ] **Step 4: Verify `test_verdict.py` passes**

Run: `cd coordinator && python -m pytest tests/test_verdict.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Write failing serialization test**

Before editing `serialization.py`, re-read the enclosing debate-detail serializer function in full (per UNVERIFIED #1) and locate/reuse existing fixtures. Add a test (new or extended file) asserting: given a real `Debate` + root `Node` + a persisted `protocol_analysis` `AnalyzerRun` row (real `dialecticalStrengths`/`verificationStatuses`/`convergence` in `.output`), the debate-detail serializer's return dict contains `detail["verdict"]["verdictBand"]` matching what `verdict_summary` would compute directly, AND all pre-existing keys (`tree`, `analyzer_runs`, `branch_lineage`, etc.) are unchanged/still present. Also add a case with NO `protocol_analysis` run persisted, asserting `detail["verdict"]["verdictBand"] == "unavailable"`.

Run the new test file; expect FAIL (`KeyError`/`None` — `detail["verdict"]` not present yet).

- [ ] **Step 6: Implement the serialization addition**

Modify the debate-detail serializer per the Interfaces section: query the latest `protocol_analysis` `AnalyzerRun` (reusing the `runner.py:174-179` query shape), call `verdict_summary(latest_run.output if latest_run else None, root_node_id=root.id if root else None)`, add the result as `detail["verdict"]`. Purely additive — do not remove/rename any existing key.

- [ ] **Step 7: Verify pass + full re-run**

Run (single foreground call, one shot):
`cd coordinator && python -m pytest tests/test_verdict.py tests/test_serialization_verdict.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
(adjust the second path to whatever file/module Step 5 actually used)
Expected: all pass except pre-existing known failures re-baselined at phase start.

- [ ] **Step 8: Report status (no commit).** Flag: the exact enclosing serializer function name and its file/line range as edited, confirmation that `detail["verdict"]` is additive (no existing key touched), and the exact `"pending"` vs `"pending_verification"` prose choice made in `claimLanguage` (per the Interfaces bullet's documented either/or). Move to Task 2.

---

### Task 2: Web — verdict-first banner, flag-gated (`NEXT_PUBLIC_VERDICT_FIRST_UI`)

**Files:**
- Modify: `web/lib/types.ts` (add a `VerdictSummary`/`ProtocolAnalysisBasis` type matching Task 1's wire shape exactly)
- Modify: `web/app/debate/[id]/DebatePageClient.tsx` (mount the new banner component behind the flag, at the location confirmed by UNVERIFIED #6)
- Create: `web/components/VerdictBanner.tsx`
- Create: `web/components/VerdictBanner.source-test.mjs` (following the exact existing `*.source-test.mjs` convention)

**Interfaces:**
- `web/lib/types.ts` addition: `export type VerdictBand = "supported" | "contested" | "unsupported" | "unavailable";` and `export type VerdictSummary = { verdictBand: VerdictBand; claimLanguage: string; basis: { dialecticalStrength: number | null; verificationStatus: string | null; convergence: Record<string, unknown> | null }; verdictThresholdsVersion: string };`. Add `verdict?: VerdictSummary` to whichever existing `DebateDetail`-shaped type (`web/lib/types.ts:455` `DebateDetail`) is the debate-detail response type — additive optional field only.
- `VerdictBanner.tsx`: `export function VerdictBanner({ verdict }: { verdict: VerdictSummary | undefined }): JSX.Element | null` — renders `null` if `verdict` is undefined (honest: no data, no banner, never a fabricated placeholder). Otherwise renders:
  - A qualitative badge text derived from `verdict.verdictBand` (`"supported"` -> "Strongly supported", `"contested"` -> "Contested", `"unsupported"` -> "Weakly supported", `"unavailable"` -> "Analysis unavailable") with a `data-verdict-band={verdict.verdictBand}` attribute for CSS/testing hooks (mirrors the existing `data-selected`/`data-selected-path` convention already used in `DebateOutline.tsx` per the source-test read in this pass).
  - The `verdict.claimLanguage` string rendered as the leading plain-language sentence.
  - The REAL number (`verdict.basis.dialecticalStrength`) shown only inside a `<details>`/expandable "detail" element (never in the always-visible headline) — e.g. a `<details><summary>Details</summary><span>dialectical strength: {value ?? "n/a"}</span> ... </details>` block including `verificationStatus` and `convergence.converged`/`convergence.reason` verbatim (pass through the real value, including rendering `null` as an explicit "not available" string, never omitting it silently).
- `DebatePageClient.tsx` integration: wrap the `<VerdictBanner verdict={detail.verdict} />` mount in `{process.env.NEXT_PUBLIC_VERDICT_FIRST_UI === "true" ? <VerdictBanner verdict={detail.verdict} /> : null}` — the ENTIRE new section is inside the conditional; nothing else on the page changes when the flag is off. Default OFF means the env var is simply unset in normal operation (Next.js `NEXT_PUBLIC_*` vars are inlined at build time; document in the task report that toggling requires a rebuild, consistent with standard Next.js flag behavior — do not attempt a runtime-only flag mechanism unless one already exists elsewhere in `web/lib/api.ts`/`serverApi.ts`, per UNVERIFIED note in Global Constraints).

- [ ] **Step 1: Write failing source-test first**

Create `web/components/VerdictBanner.source-test.mjs` following the exact pattern read from `DebateOutline.scoring.source-test.mjs`: `readFileSync` both `VerdictBanner.tsx` and `DebatePageClient.tsx`, and regex-assert:
- `VerdictBanner.tsx` exists and exports `function VerdictBanner` with a `{ verdict }: { verdict: VerdictSummary | undefined }` (or equivalent) signature.
- `VerdictBanner.tsx` source contains `data-verdict-band=` and a `<details>` element wrapping the raw numeric value.
- `VerdictBanner.tsx` returns `null` when `verdict` is falsy (regex for an early `if (!verdict) return null;`-shaped guard, or equivalent).
- `DebatePageClient.tsx` source contains `NEXT_PUBLIC_VERDICT_FIRST_UI` and wraps the `<VerdictBanner` JSX usage inside that same conditional expression (regex asserting the flag check and the component usage appear within a bounded proximity/same conditional block).

Run: `node --test web/components/VerdictBanner.source-test.mjs`
Expected: FAIL (files/exports do not exist yet).

- [ ] **Step 2: Implement**

Create `VerdictBanner.tsx` and the `VerdictSummary`/`VerdictBand` types in `web/lib/types.ts` per the Interfaces section. Read `web/app/debate/[id]/DebatePageClient.tsx` in full first (per UNVERIFIED #6) to find the correct mount point (top of the rendered tree, above the existing outline/canvas/synthesis components) and add the flag-gated conditional mount.

- [ ] **Step 3: Verify source-test passes**

Run: `node --test web/components/VerdictBanner.source-test.mjs`
Expected: pass.

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: zero new type errors (pre-existing errors, if any, are out of scope — re-baseline by running once before this task's edits if unsure).

- [ ] **Step 5: Manual verification checklist (required, report explicitly)**

Start the dev server (`cd web && npm run dev`) against a debate that has a persisted `protocol_analysis` run:
- With `NEXT_PUBLIC_VERDICT_FIRST_UI` unset/`false` (default): confirm the debate page renders with NO banner and is visually/structurally identical to the pre-change page (spot-check via browser or the preview tool).
- With `NEXT_PUBLIC_VERDICT_FIRST_UI=true` (requires rebuild per Next.js inlining semantics): confirm the banner renders above the existing content, shows a qualitative band + plain-language sentence, and the real number/verification/convergence values are only visible after expanding the detail element.
- Confirm a debate with NO `protocol_analysis` run yet renders no banner crash (either flag state) — `verdict` is `undefined`, `VerdictBanner` returns `null`.
Report pass/fail for each bullet explicitly; do not report this task done without having actually run the dev server and observed these three states.

- [ ] **Step 6: Report status (no commit).** Flag: the exact mount location chosen in `DebatePageClient.tsx`, confirmation flag-off is byte-identical (Step 5's first bullet), and whether `SynthesisPanel.tsx` should have been extended instead (per UNVERIFIED #6) if that becomes apparent while reading the file. Move to Task 3.

---

### Task 3: Web — greyed-not-hidden low-strength + stale node rendering

**Files:**
- Modify: `web/components/DebateTree.tsx` (extend existing abandoned-node de-emphasis pattern to also cover low-strength nodes; gate any behavior change with the same flag if it alters today's default rendering, per the Interfaces note below)
- Modify: `web/lib/debateTreeUtils.ts` (add a small pure helper, e.g. `isLowStrengthNode`, alongside the existing `isAbandonedArgumentStatus`)
- Create: `web/components/DebateTree.lowStrength.source-test.mjs`

**Interfaces:**
- First, per UNVERIFIED #7/#8: confirm during implementation whether stale/abandoned nodes are ALREADY rendered unconditionally today in `DebateTree.tsx` (Verified Ground Truth above confirms yes — `.abandonedPaths`/`.abandonedBadge`, always on, not flag-gated). Because that part is already correct and already unconditional, Task 3 does NOT need to newly gate abandoned-node visibility behind the Task 2 flag — it already satisfies "greyed not hidden." Task 3's actual new work is:
  1. Add `isLowStrengthNode(strength: number | null | undefined, threshold = 0.35): boolean` to `web/lib/debateTreeUtils.ts` — pure function, `strength == null` returns `false` (honest: unknown strength is not the same as "known low strength," never treat missing data as automatically low). Reuse the SAME threshold value documented in Task 1's `verdict_summary` (`<= 0.35`) — document this shared-threshold choice explicitly in a code comment citing `coordinator/app/scoring/verdict.py`'s `VERDICT_THRESHOLDS_VERSION` so the two numbers don't silently drift apart later.
  2. In `DebateTree.tsx`, wherever a node row is rendered with access to its resolved score/strength (implementer must trace how `scoringByNodeId`-shaped data, per the `DebateOutline` precedent read in this pass, reaches `DebateTree` — it may not currently receive scoring props at all; if it doesn't, this task must thread a `scoringByNodeId?: Map<string, NodeScoringPayload>` prop through in the same optional, backward-compatible style already established by `DebateOutline`'s own `DebateOutlineProps`), add a `lowStrength` boolean derived via `isLowStrengthNode(scoring?.scores?.strength)` and apply a new CSS class (e.g. `lowStrengthNode`) plus a `data-low-strength="true"` attribute when true — additive className, never replacing the existing `abandoned`/selection classes, composable with them (a node can be both abandoned AND low-strength).
  3. This new low-strength dimming IS gated behind the SAME `NEXT_PUBLIC_VERDICT_FIRST_UI` flag from Task 2, because it changes today's default rendering (today, no strength-based dimming exists at all in `DebateTree.tsx` per the grep in this pass) — flag off must leave `DebateTree.tsx` rendering byte-identical to pre-Task-3 behavior. The already-existing abandoned-node handling remains unconditional/unchanged (it was already correct and already shipped).
  4. Low-strength nodes must remain fully clickable/inspectable (existing `NodeDetailDrawer` opening behavior untouched) — dimming is CSS/attribute-only, never a change to click handlers, children rendering, or the existing `activeChildren`/`abandonedChildren` split logic.

- [ ] **Step 1: Write failing source-test first**

Create `web/components/DebateTree.lowStrength.source-test.mjs` (mirroring the existing `DebateOutline.scoring.source-test.mjs` pattern read in this pass): regex-assert `web/lib/debateTreeUtils.ts` exports `isLowStrengthNode`, that `DebateTree.tsx` imports it, that a `lowStrengthNode` className and `data-low-strength` attribute appear in source, and that the low-strength className application is inside a block also referencing `NEXT_PUBLIC_VERDICT_FIRST_UI` (confirming the flag gate), while the pre-existing `abandoned`/`abandonedPaths` class strings remain present UNCHANGED (regex still matches the exact strings confirmed in this pass's Verified Ground Truth, proving they were not accidentally touched).

Run: `node --test web/components/DebateTree.lowStrength.source-test.mjs`
Expected: FAIL.

- [ ] **Step 2: Implement**

Add `isLowStrengthNode` to `web/lib/debateTreeUtils.ts`. Trace and thread the scoring-by-node-id prop into `DebateTree.tsx` (read the current file in full first — only grepped in this pass), add the flag-gated `lowStrengthNode`/`data-low-strength` rendering additively alongside the existing abandoned-node logic, without altering any existing classNames, labels, or the active/abandoned children split.

- [ ] **Step 3: Verify source-test passes**

Run: `node --test web/components/DebateTree.lowStrength.source-test.mjs`
Expected: pass.

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: zero new type errors.

- [ ] **Step 5: Manual verification checklist (required, report explicitly)**

Via dev server against a debate with mixed-strength nodes (some real scores `<= 0.35`, some above) and at least one abandoned node:
- Flag off: confirm no visual change versus Task 2's flag-off baseline (no dimming, no `data-low-strength` effect visible), and confirm abandoned nodes still render exactly as before (unconditional, unaffected by this task).
- Flag on: confirm low-strength nodes render visually de-emphasized (dimmed/muted) but are still present in the DOM, still clickable, and `NodeDetailDrawer` still opens with full real data for a dimmed node.
- Confirm a node that is BOTH abandoned AND low-strength renders with both treatments composed, not one clobbering the other.
Report pass/fail for each bullet explicitly.

- [ ] **Step 6: Report status (no commit).** Flag: confirmation that no existing abandoned-node behavior was altered (only additive low-strength handling was added), the exact shared-threshold value used and its citation of Task 1's `verdict-v1` thresholds, and whether `DebateCanvas.tsx` (per UNVERIFIED #7, not read in this pass) also needs equivalent treatment as follow-on scope — flag as deferred/out-of-scope for this phase if `DebateCanvas.tsx` turns out to be a separate rendering path not covered by this task's `DebateTree.tsx` changes.
