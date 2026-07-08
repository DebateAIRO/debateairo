# Phase 8: Calibration + Correlated-Error Discounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Honest calibration substrate: (a) a cold-start judge-weight module (declared config, never presented as "learned"); (b) same-family correlated-error discounting that activates ONLY when 2+ persisted judgments genuinely exist for one node (single-judgment nodes pass through byte-identical); (c) Brier/ECE calibration report STUBS that count real judgments observed but never fabricate a score when no ground-truth outcomes exist. No tau/QBAF wiring in this phase — the `compositionNote` seam (`modelWeight=constant-1.0(P8)`) is left as-is unless a task explicitly changes what is served.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **There is no existing "reduce N assessments into one score" function.** `reduce_assessments(claim: NormalizedClaim, assessment: ClaimAssessment) -> NodeScoringPayload` (`coordinator/app/scoring/reducer.py:86`) takes exactly ONE `ClaimAssessment` — it is called once per node against whichever single artifact is resolved as "the" score for that `contract_hash` (`coordinator/app/scoring/service.py:347`, `_hydrate_historical_public_result` or the live artifact path). The actual "plural judgments exist" handling found live today is `_attach_plural_judge_provenance` (`coordinator/app/scoring/service.py:873-904`), which queries `JudgeOutputArtifact` rows for the SAME `(debate_id, node_id, input_hash)` (i.e. same contract identity, different `judge_role`/`provider`/`model`/`raw_output_sha256` per the table's `ux_judge_output_artifacts_identity` unique constraint) via `_persisted_judge_evidence_for_node` (`service.py:907-929`), gates on `len(judge_evidence) < 2`, and — critically — **only ever ADDS metadata** (`score_provenance.judge_participation`, `score_provenance.disagreement_status`, optionally `judge_disagreements`) onto the single-assessment `item` dict already produced by `reduce_assessments`. It does NOT re-average or re-weight `item["scores"]` at all today. This plan's Task 2 therefore does not "replace an existing weighted-average reducer" (none exists) — it ADDS a new weighted-aggregate computation, gated behind `DIALECTICAL_CALIBRATION_WEIGHTS`, that runs alongside (not instead of) the existing single-assessment `reduce_assessments` call, at the same two call sites (`service.py:348`, `service.py:600`) where `_attach_plural_judge_provenance` is invoked. Implementer must re-read both call sites (lines ~300-360 and ~570-630) in full immediately before Task 2 to confirm the exact local variable names (`item`, `debate.id`, `node.id`, `input_hash`) are still current and that no third call site was added since this pass.
2. **`_persisted_judge_evidence_for_node` returns dicts with keys `judge_role`, `provider`, `model`, `raw_output_sha256`, `assessment`** (inferred from `_distinct_persisted_judge_evidence` in `coordinator/app/scoring/disagreement.py:63-94`, which consumes exactly these keys) — the full dict-construction site inside `_persisted_judge_evidence_for_node` (`service.py:907-929`) was read only through its `select(...)` query/ordering, not its final dict-assembly return statement (cut off at line 929 in this pass). Implementer must re-read `service.py:929` onward (the rest of `_persisted_judge_evidence_for_node`, likely another ~15-20 lines) to confirm the exact dict shape returned, in particular whether `model` here is the RAW model string (needed for `lineage_family()`) or something already transformed, before writing `correlated_discount`'s integration call in Task 2.
3. **No existing "resolved outcome" / ground-truth-label concept was found anywhere in this pass.** Grepped only `reducer.py`, `disagreement.py`, `lineage.py`, `service.py` (partial), `entities.py` (partial), `runner.py` (partial), `config.py` (partial) — did NOT grep the full repo for `outcome`, `ground_truth`, `resolved`, `label` before writing Task 3. Implementer must run `grep -rniE "ground.?truth|resolved_outcome|outcome_label" coordinator/app` immediately before Task 3 to confirm zero hits (this plan assumes zero — if any hit exists, Task 3's "count real judgments, 0 resolved outcomes" framing must be revisited to actually count real resolved outcomes instead of hardcoding 0).
4. **Exact SQLAlchemy count-query idiom for "judgments observed" was not independently re-verified against a live model in this pass** beyond the `JudgeOutputArtifact`/`NodeScoringResult` column lists already confirmed in the Phase 7 plan's Verified Ground Truth (carried over below). Implementer must confirm `db.scalar(select(func.count()).select_from(JudgeOutputArtifact).where(...))` (or equivalent) is the idiom used elsewhere in `service.py`/`runner.py` (a quick grep for `func.count` before Task 3 Step 3) rather than inventing a new counting style.
5. **Whether `AnalyzerRun` is the right home for `calibration_report`'s output, vs. a plain pure function with no persistence, was not settled against a concrete precedent search.** The mission text says "exposed via an AnalyzerRun or a pure service function (pick what repo patterns support)." This plan picks the pure-function route (`calibration_report(db, family=None) -> dict`, no new `AnalyzerRun` row written) because the mission's own Honesty Laws frame this as a STUB/report, not a durable analysis artifact consumed downstream (unlike `protocol_analysis`, which IS consumed by the tree UI). Implementer must confirm no caller already expects a persisted `AnalyzerRun(analyzer_type="calibration_report")` row before finalizing this choice; if a consumer requires persistence, add the `AnalyzerRun` write as an additive step (still no migration).
6. **`ScoringModelMetadata`, `ClaimAssessment` full field lists were not re-read in this pass** beyond what `reducer.py`/`disagreement.py` reference. Implementer must re-read `coordinator/app/scoring/models.py` in full before Task 1 to confirm the exact pydantic alias/camelCase convention (carried over as an assumption from the Phase 7 plan's own note that this should be re-confirmed, apparently never closed out) before adding new pydantic response shapes for calibration weight/discount output.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **Pre-existing known failures may exist in the coordinator suite** (environment-harness + foreign guardian WIP, count last re-baselined during Phase 5b/5c/6/7) — these are NOT this phase's responsibility. Re-baseline the count once at the start of this phase (run the full suite once before touching code) rather than trusting any stale number; do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`Generation`/`JudgeOutputArtifact`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path. Multi-judgment fixtures must be realistic (real distinct `provider`/`model`/`raw_output_sha256` combinations per the `ux_judge_output_artifacts_identity` constraint), never a bare placeholder.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings/keys must use claim/debate-domain camelCase language consistent with the rest of the codebase at the JSON/pydantic-alias boundary (e.g. `calibrationWeights`, `calibrationApplied`, `discountFactor`, `judgmentsObserved`, `resolvedOutcomes`, `calibrationVersion`). Internal Python stays snake_case per existing file convention; only JSON-facing payload keys need camelCase (re-confirm the exact boundary convention in `coordinator/app/scoring/models.py` per UNVERIFIED #6 before assuming this applies inside plain dicts too — `_attach_plural_judge_provenance` already emits snake_case keys like `judge_participation`/`disagreement_status` inside `score_provenance` today, so the new calibration metadata block should match whichever convention its immediate sibling keys use at that exact insertion point, even if that means snake_case for internal `score_provenance` sub-keys and camelCase only for the top-level `calibrationWeights`/`calibrationApplied`/`discountFactor` keys the mission explicitly names).
- **No schema migrations unless proven necessary.** `AnalyzerRun.output`, `NodeScoringResult.result`/`.provider_metadata`, and `JudgeOutputArtifact.provider_metadata`/`.assessment` are already-persisted unconstrained JSON columns (confirmed in Phase 6/7 passes, re-confirmed live in this pass at `coordinator/app/models/entities.py:348-365` and `:272-291`) sufficient to carry calibration metadata without a migration. Do NOT add a migration in this phase — every deliverable in this plan is either a pure function (Task 1), additive JSON-key metadata on an existing dict (Task 2), or a read-only counting query (Task 3). If a task's own investigation step proves a genuinely new persisted field is required, STOP and flag it in the final report rather than silently adding a migration.
- **Honesty laws (binding, non-negotiable, apply to every task):**
  - NEVER fabricate calibration numbers. `calibration_report(...)` without ground-truth resolved outcomes returns `{"brier": null, "ece": null, "reason": "no_ground_truth_outcomes", "judgmentsObserved": <real count>, "resolvedOutcomes": 0, "calibrationVersion": "calibration-v1"}` — `judgmentsObserved` MUST be a real COUNT() query result, never invented, never a placeholder like `0` or `1` written by hand.
  - Weights are declared config/cold-start values, NEVER presented as "learned." Every weight-shaped output object carries an explicit `"source"` key whose value is exactly `"cold_start"` or `"config_override"` — no other source value, ever, in this phase (no `"learned"`, no `"trained"`).
  - Same-family correlated-error discount applies ONLY when genuinely aggregating 2+ persisted assessments for the same node. A single-judgment node's weight is exactly `1.0` with NO discount applied and an explicit `"notApplicable"` marker (pick this term and use it consistently everywhere in this phase — do not also emit a `null`/absent-key variant for the same "not applicable" concept) rather than omitting the field or emitting confusing zero/near-1.0 noise.
  - Flag-gate any behavior change to SERVED scores behind `DIALECTICAL_CALIBRATION_WEIGHTS` (`bool_env`, default `False`). Metadata recording (the fact that plural judgments exist, their families, cold-start weights, discount factors) may be always-on regardless of the flag — mirrors the Phase 6/7 precedent that lineage/provenance recording is unconditional while score-affecting behavior is flag-gated.
- **Marker/flag safety on unexpected crash:** if calibration weighting or the calibration report path raises an exception not anticipated by the specific try/excepts described below, the surrounding best-effort flow (node scoring, protocol analysis) must not be made LESS safe than it is today — fail closed (record nothing new, keep the existing single-assessment score untouched) rather than fail open (serve a fabricated weighted score or a fabricated calibration number).
- **Reuse Phase 6 lineage machinery, do not fork it.** `lineage_family()` (`coordinator/app/scoring/lineage.py:15-31`) is the ONLY sanctioned way to derive a judge "family" bucket for correlated-error grouping. Task 2 must import and call this exact function, not reimplement family-matching logic.
- **No tau/QBAF wiring in this phase.** `runner.py`'s `compositionNote` literal (`"v1: tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"`, `coordinator/app/protocol/runner.py:160-163`) stays UNCHANGED unless a task explicitly proves it has become false. Since this plan does not change what tau is DERIVED FROM or what is SERVED to QBAF (Task 2's weighted aggregate, even when the flag is on, only affects the metadata/reporting layer described below — re-confirm during Task 2 that it does not accidentally get consumed by `debate_argument_graph`/`tauSources` construction before claiming the note is still accurate), the string `modelWeight=constant-1.0(P8)` remains an accurate description of what QBAF tau actually uses today, and MUST NOT be edited to claim more than this phase actually wires. If Task 2's implementation ends up changing what value flows into tau computation, STOP, flag it, and update the compositionNote text truthfully before reporting done — do not ship a silently-stale string either direction.
- **Allowed files per task** are listed under each task below; do not touch files outside those lists without stopping and flagging why in the final report.

## Verified Ground Truth

- `coordinator/app/scoring/reducer.py:86` — `reduce_assessments(claim: NormalizedClaim, assessment: ClaimAssessment) -> NodeScoringPayload` operates on exactly ONE `ClaimAssessment`. No N-assessment averaging reducer exists anywhere in `reducer.py` (full file read verbatim, 352 lines).
- `coordinator/app/scoring/service.py:873-904` — `_attach_plural_judge_provenance(db, item, *, debate_id, node_id, input_hash)`: queries `_persisted_judge_evidence_for_node` for the same `(debate_id, node_id, input_hash)` contract identity; if `len(judge_evidence) < 2`, returns `item` unchanged (no-op passthrough — this IS the existing "single judgment, no discount" honest baseline); otherwise calls `detect_persisted_judge_disagreements(judge_evidence)` and ADDS (never replaces) `item["score_provenance"]["judge_participation"] = {"plural_judges": True, "judge_count": ..., "judge_roles": [...]}` and `item["score_provenance"]["disagreement_status"] = {"status": "present"|"none", "derived_from": "persisted_judge_artifacts"}`, plus `item["judge_disagreements"]` if any disagreements found. Called at exactly two sites: `service.py:348` and `service.py:600`, both immediately after `item = reduce_assessments(claim, assessment).model_dump(mode="json")`. This is the confirmed, existing seam where Task 2's calibration-weight computation must plug in as an ADDITIONAL metadata block (`calibrationWeights`/`calibrationApplied`/`discountFactor`), following the exact same "only ever adds, never mutates existing score fields" discipline this function already demonstrates.
- `coordinator/app/scoring/service.py:907-929` (partial — query only, not full dict-assembly return, per UNVERIFIED #2) — `_persisted_judge_evidence_for_node` queries `JudgeOutputArtifact` filtered on `debate_id`, `node_id`, `input_hash`, `parse_status == "available"`, `assessment.is_not(None)`, ordered by `judge_role`, `provider`, `model`, `created_at`, `id`.
- `coordinator/app/scoring/disagreement.py` (full file read verbatim) — `detect_persisted_judge_disagreements(judge_evidence: list[dict]) -> list[JudgeDisagreement]` and its helper `_distinct_persisted_judge_evidence` confirm the consumed dict shape has (at least) keys `judge_role`, `provider`, `model`, `raw_output_sha256`, `assessment` (a `ClaimAssessment`-shaped dict, re-validated via `ClaimAssessment.model_validate`). This is confirmed, real, queryable plural-judgment data — the P1 contract-keyed cache identity (`ux_judge_output_artifacts_identity` on `debate_id, node_id, input_hash, judge_role, provider, model, raw_output_sha256`) means re-scores under different models/contracts persist as separate, independently-queryable rows, exactly as the mission's honesty context describes.
- `coordinator/app/scoring/lineage.py` (full file read verbatim) — `lineage_family(model_id: str | None) -> str | None`: coarse vendor-family bucketing (`claude`, `gpt` [also matches `codex`], `gemini`, `llama`, `mistral`, `deepseek`, `grok`; unrecognized-but-concrete strings pass through lowercased unchanged; `None`/empty -> `None`). `judge_lineage_metadata(*, arguer_model_id, judge_provider, judge_model_id) -> dict`: always-on lineage recording, honest `None`+reason-string when either side's family is unknown, never a guessed independence value. Both are pure functions, safely reusable by Task 2 for family-bucketing the `provider`/`model` fields already present on each `judge_evidence` item.
- `coordinator/app/core/config.py:134-148` — `int_env(name, default, minimum, maximum)`, `float_env(name, default, minimum, maximum)`, `bool_env(name, default)`. `float_env` is the exact existing convention for a validated, bounded numeric env override (parallels the mission's request to mirror the `convergence_epsilon` pattern) — confirmed live, reads fresh per call, no caching.
- `coordinator/app/protocol/runner.py:34,181-185` — `DEFAULT_CONVERGENCE_EPSILON = 0.05`; `raw_epsilon` is read from `(debate.config or {}).get("protocol", {}).get("convergence_epsilon")`, validated inline (`isinstance(..., (int, float)) and not isinstance(..., bool) and 0 < raw_epsilon < 1`), falling back to the default if invalid — this is a debate-config-sourced override, NOT an env-var override; Task 1's discount factor is instead specified as env-var-overridable per the mission text ("config-overridable validated like convergence_epsilon" — read as "validated the same defensive way," via `float_env`, since the mission's Task 1 module is a pure function taking `config` as a parameter, not a debate-row reader). Implementer should default to `float_env("DIALECTICAL_CALIBRATION_DISCOUNT_FACTOR", 0.5, 0.0, 1.0)` read at the call site and passed into the pure function as a parameter (keeping `calibration.py` itself free of `os.getenv` calls, consistent with `reducer.py`/`disagreement.py` being pure-input-in/pure-output-out modules with no env access of their own).
- `coordinator/app/protocol/runner.py:160-163` — `compositionNote` literal string: `"v1: tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"`. This is the pre-existing, explicit placeholder marking where Phase 8's weight module would EVENTUALLY influence QBAF tau — confirmed this phase does NOT wire that (tau derivation is untouched; the string remains accurate as long as Task 2 does not feed its weighted aggregate into `debate_argument_graph`/`tauSources`).
- `coordinator/app/models/entities.py:272-291` (`JudgeOutputArtifact`) and `:348-365` (`NodeScoringResult`) — both confirmed-live, unconstrained JSON columns (`provider_metadata`, `assessment`, `result`) safe to carry new calibration metadata keys without a migration, per the same precedent Phase 6/7 already established for `judgeLineage`/`arguerLineage`.
- `coordinator/app/scoring/judge_registry.py`'s `active_contract(role)` is imported and used throughout `service.py` (10 call sites grepped) for contract-hash/audit lookups keyed by `judge_role` — not touched by this plan; calibration weighting operates on already-persisted `judge_evidence` rows, not on contract registration.
- No existing `outcome`/`ground_truth`/`resolved` vocabulary was found in any file read in this pass (see UNVERIFIED #3 — re-grep required before Task 3, this bullet records what THIS pass observed, not an exhaustive repo-wide confirmation).

---

### Task 1: `app/scoring/calibration.py` — cold-start judge weights + correlated-error discount (pure module)

**Files:**
- Create: `coordinator/app/scoring/calibration.py`
- Create: `coordinator/tests/test_calibration.py`

**Interfaces:**
- `CALIBRATION_VERSION = "calibration-v1"` (module constant, reused by Task 3).
- `judge_weight(family: str | None, config: dict | None = None) -> dict`: pure function, no I/O.
  - `config` (optional) may contain a per-family override map, e.g. `{"weights": {"claude": 0.9}}`. If `family` is a key in `config["weights"]`, return `{"weight": <override>, "source": "config_override", "family": family}`.
  - Otherwise, cold-start default: `{"weight": 1.0, "source": "cold_start", "family": family}` — every family starts at neutral weight 1.0 until a real config override or (future, out of scope) learned calibration exists. Never returns `"source": "learned"` anywhere in this phase.
  - `family=None` (unknown lineage) still returns a valid dict: `{"weight": 1.0, "source": "cold_start", "family": None}` — honest, not an error.
- `correlated_discount(assessments_with_families: list[dict], *, discount_factor: float = 0.5) -> dict`: pure function, no I/O. Input: list of dicts each shaped `{"judge_role": str, "provider": str, "model": str, "family": str | None, ...}` (the caller derives `family` via `lineage_family(item["model"])` before calling — this function does NOT import lineage itself, keeping it a pure grouping/arithmetic function over already-labeled input).
  - If `len(assessments_with_families) < 2`: return `{"applicable": False, "reason": "single_judgment", "weights": [{"index": 0, "weight": 1.0, "discounted": False}] if exactly one item else [], "discountFactor": discount_factor, "effectiveWeightTotal": 1.0 if exactly one item else 0.0}` — the explicit `"notApplicable"`-style marker for "not enough judgments to discount" (use `"applicable": False` consistently as the single not-applicable signal; do not also add a separate null/absent variant elsewhere in this module for the same concept).
  - If `len(assessments_with_families) >= 2`: group by `family` in the ORDER items first appear (stable, deterministic — do not sort by family name, preserve input order for "first occurrence per family gets full weight"). For each item, in input order: if this is the first time its `family` has been seen, weight = `1.0`; if its `family` has been seen before (a repeat within the same family), weight = `discount_factor` (applied once — flat per-repeat discount, NOT compounding/multiplied again for a 3rd+ repeat of the same family, per the mission's worked example semantics). Items with `family=None` are NEVER discounted against each other (unknown lineage is never assumed to correlate — each `family=None` item always gets weight `1.0`, honest: we cannot claim two unknown-lineage judges are correlated).
  - Returns `{"applicable": True, "discountFactor": discount_factor, "weights": [{"index": i, "family": ..., "weight": ..., "discounted": bool}, ...], "effectiveWeightTotal": sum(weights)}`.
  - Validate `discount_factor` is in `[0.0, 1.0]`; if the caller passes an out-of-range value, clamp to the nearest bound (mirrors `bounded_float`'s defensive style referenced by `float_env`) rather than raising — this is a pure function that should not crash on a bad config value.
- Worked examples (MUST be asserted exactly in tests, per the mission):
  - 3 assessments `[claude, claude, gpt]` with `discount_factor=0.5` -> weights `[1.0, 0.5, 1.0]`, `effectiveWeightTotal == 2.5`.
  - 4 assessments `[claude, claude, claude, gpt]` with `discount_factor=0.5` -> weights `[1.0, 0.5, 0.5, 1.0]` (flat discount per repeat, not compounding to `0.25`), `effectiveWeightTotal == 3.0`.
  - 2 assessments `[claude, gpt]` (no shared family) -> weights `[1.0, 1.0]`, `effectiveWeightTotal == 2.0`, `discounted: False` for both.
  - 1 assessment `[claude]` -> `applicable: False`, `reason: "single_judgment"`.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_calibration.py`:

```python
from app.scoring.calibration import CALIBRATION_VERSION, correlated_discount, judge_weight


def test_judge_weight_cold_start_default_is_neutral() -> None:
    result = judge_weight("claude")
    assert result == {"weight": 1.0, "source": "cold_start", "family": "claude"}


def test_judge_weight_cold_start_handles_unknown_family() -> None:
    result = judge_weight(None)
    assert result == {"weight": 1.0, "source": "cold_start", "family": None}


def test_judge_weight_config_override() -> None:
    result = judge_weight("claude", config={"weights": {"claude": 0.9}})
    assert result == {"weight": 0.9, "source": "config_override", "family": "claude"}
    # Unrelated family in same config still falls back to cold start:
    assert judge_weight("gpt", config={"weights": {"claude": 0.9}}) == {
        "weight": 1.0,
        "source": "cold_start",
        "family": "gpt",
    }


def test_correlated_discount_single_judgment_not_applicable() -> None:
    result = correlated_discount([{"judge_role": "judge", "provider": "anthropic", "model": "claude-3", "family": "claude"}])
    assert result["applicable"] is False
    assert result["reason"] == "single_judgment"


def test_correlated_discount_worked_example_claude_claude_gpt() -> None:
    assessments = [
        {"judge_role": "judge", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "verifier", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "judge", "provider": "openai", "model": "gpt-4o", "family": "gpt"},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    assert result["applicable"] is True
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 0.5, 1.0]
    assert result["effectiveWeightTotal"] == 2.5


def test_correlated_discount_flat_not_compounding_for_third_repeat() -> None:
    assessments = [
        {"judge_role": "a", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "b", "provider": "anthropic", "model": "claude-3-opus", "family": "claude"},
        {"judge_role": "c", "provider": "anthropic", "model": "claude-3-haiku", "family": "claude"},
        {"judge_role": "d", "provider": "openai", "model": "gpt-4o", "family": "gpt"},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 0.5, 0.5, 1.0]
    assert result["effectiveWeightTotal"] == 3.0


def test_correlated_discount_no_shared_family_no_discount() -> None:
    assessments = [
        {"judge_role": "a", "provider": "anthropic", "model": "claude-3", "family": "claude"},
        {"judge_role": "b", "provider": "openai", "model": "gpt-4o", "family": "gpt"},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 1.0]
    assert all(item["discounted"] is False for item in result["weights"])


def test_correlated_discount_unknown_family_never_discounted() -> None:
    assessments = [
        {"judge_role": "a", "provider": "unknown", "model": None, "family": None},
        {"judge_role": "b", "provider": "unknown", "model": None, "family": None},
    ]
    result = correlated_discount(assessments, discount_factor=0.5)
    weights = [item["weight"] for item in result["weights"]]
    assert weights == [1.0, 1.0]


def test_calibration_version_constant() -> None:
    assert CALIBRATION_VERSION == "calibration-v1"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_calibration.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`ModuleNotFoundError` — `app/scoring/calibration.py` does not exist yet).

- [ ] **Step 3: Implement**

Implement `judge_weight` and `correlated_discount` per the Interfaces section exactly, including the flat (non-compounding) per-repeat discount and the `family=None` never-discounted rule. Keep the module free of `os.getenv`/DB access — it is pure, mirroring `reducer.py`/`disagreement.py`.

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_calibration.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Flag: confirmation of the flat-vs-compounding discount choice, and that `family=None` items are never mutually discounted. Move to Task 2.

---

### Task 2: Aggregation integration — flag-gated calibration weighting at the plural-judge seam

**Files:**
- Modify: `coordinator/app/scoring/service.py` (extend `_attach_plural_judge_provenance`, or add a sibling helper called from the same two sites, `service.py:348` and `service.py:600` — confirm exact current line numbers before editing, per UNVERIFIED #1)
- Modify: `coordinator/app/core/config.py` (only if needed — likely no change; call `float_env`/`bool_env` directly at the call site per existing convention, matching `DIALECTICAL_LINEAGE_INDEPENDENCE`'s call-site-only pattern)
- Create/extend: `coordinator/tests/test_calibration_integration.py` (or extend an existing scoring-service test file if one already covers `_attach_plural_judge_provenance` — grep `_attach_plural_judge_provenance|judge_participation` in `coordinator/tests/` before writing, to avoid duplicating fixture setup)

**Interfaces:**
- New flag: `DIALECTICAL_CALIBRATION_WEIGHTS`, read via `bool_env("DIALECTICAL_CALIBRATION_WEIGHTS", False)` fresh per call, matching the exact `DIALECTICAL_LINEAGE_INDEPENDENCE` call-site convention (`service.py:508`).
- New env-driven discount factor: `float_env("DIALECTICAL_CALIBRATION_DISCOUNT_FACTOR", 0.5, 0.0, 1.0)`, read at the same call site (not inside `calibration.py`, per Verified Ground Truth's reasoning), passed as `discount_factor` into `correlated_discount`.
- Extend `_attach_plural_judge_provenance` (or add `_attach_calibration_weights(db, item, *, judge_evidence: list[dict]) -> dict` called immediately after it, reusing the SAME `judge_evidence` list already fetched — do not re-query `_persisted_judge_evidence_for_node` a second time):
  1. Always compute and record metadata, regardless of the flag: for each `judge_evidence` item, derive `family = lineage_family(item["model"])` (reuse Task 1's expectation that callers pre-label family; do this labeling here, at the integration site, since `lineage_family` is a `service.py`-imported function already). Call `correlated_discount([...labeled items...], discount_factor=discount_factor)`. For each item also call `judge_weight(family, config=...)` (config source: none exists yet system-wide — pass `config=None`/`{}` unless `debate.config` carries a `calibration.weights` map; if `debate.config` has no such convention today, default to `config=None` and note this in the report as the seam for a future per-debate override).
  2. Record on `item["score_provenance"]`: `calibrationWeights` (the per-judge weight list from `correlated_discount`, keyed by judge_role/provider/model for traceability — not just bare indices, to stay legible), `calibrationApplied` (bool: `True` only if the flag is ON *and* `correlated_discount(...)["applicable"]` is `True`; `False` in every other case, including single-judgment nodes and flag-off), `discountFactor` (the resolved float, always recorded so operators can see what WOULD apply). This recording happens **unconditionally** (metadata always-on, per Global Constraints) — the flag only gates step 3 below.
  3. Score-affecting behavior (flag-gated): if and only if `bool_env("DIALECTICAL_CALIBRATION_WEIGHTS", False)` is `True` AND `correlated_discount(...)["applicable"]` is `True`, compute a weighted aggregate over the same numeric score fields `reduce_assessments` produces per assessment (implementer must decide, and document in a code comment, exactly which fields get weighted-averaged — the mission's own framing treats this as "weighted aggregate instead of the current reduction"; since `reduce_assessments` runs once per the single resolved `ClaimAssessment` today and there is no existing multi-assessment reducer, this step must re-run `reduce_assessments(claim, assessment)` once per each historical `ClaimAssessment` recovered from `judge_evidence` — via `ClaimAssessment.model_validate(evidence["assessment"])`, already validated by `_distinct_persisted_judge_evidence` — producing N `NodeScoringPayload.scores` objects, then take the `correlated_discount`-weighted average of each numeric field in `NodeScores` (`strength`, `uncertainty`, `impact`, `evidence_quality`, `relevance`, `logical_validity`, `assumption_risk`, `counter_resilience`), replacing `item["scores"]` with this weighted-average dict). When flag is OFF: `item["scores"]` is untouched (byte-identical to current behavior) — verify this explicitly with a flag-off test that snapshots `item` before/after and asserts equality apart from the new always-on metadata keys.
  4. If `judge_evidence` has fewer than 2 items (single judgment): `calibrationApplied` is always `False`, `calibrationWeights` reflects Task 1's `applicable: False, reason: "single_judgment"` shape, and `item["scores"]` is NEVER touched regardless of the flag (a single judgment has nothing to aggregate against — this is not a "weight of 1.0 applied," it is "aggregation not applicable," matching Task 1's `"notApplicable"`-style single marker).
- This task does NOT change `_persisted_judge_evidence_for_node`'s query or `detect_persisted_judge_disagreements` — both are reused as-is.

- [ ] **Step 1: Write failing tests first**

Add to `coordinator/tests/test_calibration_integration.py` (implementer: locate and reuse whatever fixture already builds a `Debate`/`Node`/multiple `JudgeOutputArtifact` rows for the existing `_attach_plural_judge_provenance` tests — grep for them first; do not hand-build fake JSON):

```python
def test_calibration_metadata_always_recorded_flag_off(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_CALIBRATION_WEIGHTS", raising=False)
    # Real debate + node + 2 JudgeOutputArtifact rows, same family (claude, claude),
    # matching contract identity (debate_id, node_id, input_hash), parse_status="available".
    ...
    item = score_node_with_provider(...)  # or whatever the real call path is at service.py:348/600
    assert item["score_provenance"]["calibrationApplied"] is False
    assert item["score_provenance"]["discountFactor"] == 0.5
    assert len(item["score_provenance"]["calibrationWeights"]["weights"]) == 2


def test_calibration_flag_off_leaves_scores_byte_identical(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_CALIBRATION_WEIGHTS", raising=False)
    ...
    item_before_calibration_metadata_stripped = {k: v for k, v in item.items() if k != "score_provenance"}
    # Compare against the same scoring path with plural-judge provenance disabled/mocked,
    # or assert item["scores"] equals a direct reduce_assessments(...) call's .scores.
    direct = reduce_assessments(claim, assessment).model_dump(mode="json")
    assert item["scores"] == direct["scores"]


def test_calibration_single_judgment_never_applies_discount(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_CALIBRATION_WEIGHTS", "true")
    # Real debate + node + exactly 1 JudgeOutputArtifact row for this contract identity.
    ...
    item = ...
    assert item["score_provenance"]["calibrationApplied"] is False
    assert item["score_provenance"]["calibrationWeights"]["applicable"] is False


def test_calibration_weighted_aggregate_applied_when_flag_on_and_plural(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_CALIBRATION_WEIGHTS", "true")
    # Real debate + node + 3 JudgeOutputArtifact rows: claude, claude, gpt -- with distinct,
    # real ClaimAssessment payloads (differing strength/evidence_quality) so the weighted
    # average is provably different from a naive unweighted mean.
    ...
    item = ...
    assert item["score_provenance"]["calibrationApplied"] is True
    # Hand-compute the expected weighted mean for at least one field (e.g. strength) using
    # weights [1.0, 0.5, 1.0] / effectiveWeightTotal 2.5, and assert item["scores"]["strength"]
    # matches that hand-computed value (rounded per reducer.py's _round convention).
```

(Implementer: fill in `...` using real fixtures. If the real call path is not `score_node_with_provider` directly but a lower-level function, adjust — confirm the exact function name/signature at `service.py:348` and `:600`'s enclosing `def` before writing.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_calibration_integration.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`calibrationWeights`/`calibrationApplied` keys not present yet).

- [ ] **Step 3: Implement**

Extend `_attach_plural_judge_provenance` (or add the sibling helper) per the Interfaces section. Import `judge_weight`, `correlated_discount` from `app.scoring.calibration`; reuse `lineage_family` from `app.scoring.lineage` (already imported in `service.py`); reuse `bool_env`, `float_env` from `app.core.config`. Do not duplicate the `judge_evidence` query — thread the already-fetched list through.

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_calibration.py tests/test_calibration_integration.py tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass except pre-existing known failures re-baselined at phase start.

- [ ] **Step 5: Report status (no commit).** Flag: exact call-site function name(s) modified, confirmation that flag-off behavior is byte-identical (Step 1's dedicated test), and confirmation that `compositionNote` in `runner.py` was NOT touched (re-verify no accidental tau feed — see Global Constraints). Move to Task 3.

---

### Task 3: `calibration_report` — honest Brier/ECE structure stubs

**Files:**
- Modify: `coordinator/app/scoring/calibration.py` (add `calibration_report`)
- Create/extend: `coordinator/tests/test_calibration.py` (append; or split into `test_calibration_report.py` if the file is getting large — implementer's call, keep one obvious home)

**Interfaces:**
- `calibration_report(db: Session, family: str | None = None) -> dict`: real DB-backed function (not pure — this one queries).
  1. Re-grep the repo per UNVERIFIED #3 for any `outcome`/`ground_truth`/`resolved` concept before writing this function. Absent one (expected), `resolvedOutcomes` is hardcoded to the literal `0` — this is NOT a fabricated number, it is an honest structural statement that the substrate for resolved ground-truth outcomes does not exist yet, same category of honesty as Phase 7's `"no_ground_truth_outcomes"` stub framing.
  2. `judgmentsObserved`: a REAL `COUNT()` query over `JudgeOutputArtifact` where `parse_status == "available"` and `assessment.is_not(None)`, optionally filtered by `family` — since `JudgeOutputArtifact.model` is a raw string and `lineage_family` is a Python-side function (not a SQL expression), the family filter must be applied by fetching model-distinct rows or by post-filtering in Python (do NOT attempt a SQL-side substring match that reimplements `lineage_family`'s bucketing rules — either (a) query all matching rows and filter with `lineage_family(row.model) == family` in Python, acceptable for a report-style function that is not on a hot path, or (b) if the table is large, query distinct `model` values first, compute which models map to `family` via `lineage_family`, then `COUNT()` with an `IN (...)` filter on that concrete model list — prefer (b) if a quick check of table size/indexing suggests (a) would be wasteful, otherwise (a) is simpler and equally honest). Either way, the returned count MUST be a real query result, never invented.
  3. Return `{"family": family, "brier": None, "ece": None, "reason": "no_ground_truth_outcomes", "judgmentsObserved": <real int>, "resolvedOutcomes": 0, "calibrationVersion": CALIBRATION_VERSION}`.
  4. If `judgmentsObserved == 0`: still return the same shape (not a different "empty" shape) — zero real judgments is itself an honest, valid count, not an error.

- [ ] **Step 1: Write failing tests first**

Append to `coordinator/tests/test_calibration.py`:

```python
def test_calibration_report_honest_stub_with_zero_judgments(db) -> None:
    report = calibration_report(db, family="claude")
    assert report == {
        "family": "claude",
        "brier": None,
        "ece": None,
        "reason": "no_ground_truth_outcomes",
        "judgmentsObserved": 0,
        "resolvedOutcomes": 0,
        "calibrationVersion": "calibration-v1",
    }


def test_calibration_report_counts_real_persisted_judgments(db) -> None:
    # Persist 2 real JudgeOutputArtifact rows (parse_status="available", assessment set,
    # model containing "claude") via the same fixture helper used in Task 2's tests, plus
    # 1 row with model containing "gpt".
    ...
    report = calibration_report(db, family="claude")
    assert report["judgmentsObserved"] == 2
    assert report["brier"] is None
    assert report["ece"] is None
    assert report["resolvedOutcomes"] == 0

    report_all = calibration_report(db, family=None)
    assert report_all["judgmentsObserved"] == 3  # no family filter counts all available artifacts


def test_calibration_report_never_fabricates_a_score() -> None:
    report = calibration_report(db, family="nonexistent-family")
    assert report["brier"] is None and report["ece"] is None
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_calibration.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`calibration_report` not defined yet).

- [ ] **Step 3: Implement**

Implement `calibration_report` per the Interfaces section. Confirm the real count query idiom against existing `func.count`/`select` usage elsewhere in `service.py`/`runner.py` (per UNVERIFIED #4) before finalizing.

- [ ] **Step 4: Verify pass + full-suite rerun**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_calibration.py tests/test_calibration_integration.py tests/test_node_scoring.py tests/test_lineage.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except pre-existing known failures re-baselined at phase start. If a NEW failure appears, fix the root cause before reporting done — do not weaken a pre-existing test to paper over a real regression. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and explicitly flag as follow-on/deferred work (product sign-off needed before further build-out):
- Whether `debate.config` carries any existing `calibration.weights` override convention (Task 2 assumed none exists system-wide today — confirm and flag if wrong).
- QBAF tau wiring from calibration weights (`compositionNote`'s `modelWeight=constant-1.0(P8)` placeholder) — explicitly deferred to P9/P10, not built here; confirm the string is still accurate and was not silently invalidated by Task 2's implementation.
- Ground-truth/resolved-outcome substrate (needed before `calibration_report` can ever return a real `brier`/`ece` number) — flagged as a future phase's foundational task, not started here.
- Whether a dedicated per-debate or per-family `judge_weight` config-override surface (UI/API) should be built — this phase only wires the pure function and its config-dict parameter, no new settings surface.
