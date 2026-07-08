# Phase 6: Arguer != Judge Lineage Independence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Guarantee that a judge scoring a node is never from the same model lineage/family as the arguer that generated the node's active argument, record that independence check honestly on every scored node, and NEVER silently score with a same-lineage judge or fabricate independence when none is available. Enforcement is feature-flagged OFF by default this phase; independence *recording* (lineage metadata) is always-on, harmless metadata written alongside every scoring result.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`).

## UNVERIFIED — implementer must confirm before/while implementing

1. **There is currently only ONE configured judge model system-wide, not a pool of independent judge candidates to rotate across.** `ensure_node_scoring_on_completion` (`coordinator/app/scoring/service.py:1028`) resolves the judge via `detect_scoring_provider_config(registry.agents, role=judge_role, providers=registry.providers)` (`coordinator/app/providers/registry.py:100`), which reads a single `role -> AgentConfig` mapping (typically from `agents.json`) and returns exactly one `(provider, model)` pair — there is no existing concept of "the set of independent judge lineages currently available" to rotate across. The mission text's "rotation across available independent judge lineages" therefore has NO existing multi-candidate substrate to rotate over in this codebase today. This plan's enforcement task (Task 2) implements the guard as: **if the single configured judge's lineage_family collides with the arguer's lineage_family, block with `"no_independent_judge"` — there is no second candidate to fall back to yet.** True rotation across multiple simultaneously-configured judge models is OUT OF SCOPE for this phase (would require new agents.json/registry plumbing for multiple judge roles or a judge pool, which is a separate, larger change) — implementer must re-confirm this by re-reading `coordinator/app/providers/registry.py` in full and `detect_scoring_provider_config`'s callers before writing Task 2, in case a multi-judge-role convention exists elsewhere that this pass missed.
2. **`worker_can_claim_job` / `capable_online_workers`** (`coordinator/app/services/orchestrator.py:454-461, 501-520`) selects among WORKERS capable of a given `required_model` string (load-balancing identical-model workers), not among distinct MODEL LINEAGES. Since v1 has one configured judge model, this existing worker-selection path is orthogonal to the lineage guard (it picks which physical worker runs the one configured judge model; the guard decides whether that judge model is allowed to score this node at all). Implementer must confirm during Task 2 that no additional worker-lineage filtering is needed beyond gating at `ensure_node_scoring_on_completion`'s config-resolution step.
3. **`Worker` entity has no `provider`/`model` column** (`coordinator/app/models/entities.py:118-129`) — only `capabilities: list[str]`. Lineage in this plan is therefore derived from the JUDGE'S RESOLVED MODEL STRING (`config.model` from `detect_scoring_provider_config`), not from any worker row. Implementer must confirm `config.model` is always the literal model id string (e.g. `"claude-sonnet-5"`, `"gpt-5.2-codex"`) and not an internal alias, by re-reading `AgentConfig`/`load_agent_configs` in `coordinator/app/providers/registry.py` before finalizing `lineage_family()`'s input assumptions.
4. **Arguer lineage source: `Generation.model_id`** (`coordinator/app/models/entities.py:78`, confirmed persisted column) reached via `node.active_generation_id -> Generation` (confirmed live at `coordinator/app/scoring/service.py:1050`: `generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None`). For legacy/edge nodes where `active_generation_id` is `None` or the `Generation` row is missing, arguer lineage is UNKNOWN — this plan records `"arguerLineage": null, "independent": null, "reason": "arguer_lineage_unknown"` in that case (never assumed-independent). Implementer must confirm no OTHER existing source of "which model wrote this node" exists (e.g. on `Node` itself) that would be more authoritative — a full-file read of `coordinator/app/models/entities.py`'s `Node` class (lines 48-70) in this pass found no `provider`/`model` column on `Node` itself, confirming `Generation.model_id` via `active_generation_id` is the only persisted arguer-lineage source today.
5. **Exact shape of `NodeScoringResult.result` (the JSON payload consumers read) and `scoring_result_payload`'s per-item dict** were not fully read in this pass (only column names on the ORM row were confirmed: `provider`, `model`, `judge_id`, `judge_version`, `contract_hash` on both `JudgeOutputArtifact` and `NodeScoringResult`, `coordinator/app/models/entities.py:265-358`). Implementer must re-read `scoring_result_payload` and the `NodeScoringItem`/`NodeScoringError`/`NodeScoringPending` pydantic models in `coordinator/app/scoring/service.py` and `coordinator/app/scoring/models.py` in full immediately before Task 1, to confirm the exact key/field naming convention (camelCase vs snake_case at the pydantic boundary, e.g. via `alias_generator`) so `judgeLineage`/`arguerLineage`/`independent` are added consistent with existing sibling fields rather than guessed.
6. **Whether `ensure_node_scoring_on_completion` is the ONLY call site that ultimately writes a `NodeScoringResult` row**, or whether the cache-hit path (`lookup_scoring_cache`) and the batch/plural judge provenance path (`_attach_plural_judge_provenance`, `coordinator/app/scoring/service.py:801`) construct scoring output independently and would need the same lineage-guard/recording logic applied separately, was not fully traced in this pass (only grepped for signatures, not read start-to-finish). Implementer must trace all write paths to `NodeScoringResult`/`JudgeOutputArtifact` before finalizing Task 1's "always-on recording" scope, to avoid a gap where cached/replayed results skip lineage recording.
7. **`debate.config` nesting for a new feature flag was assumed to be a plain `os.environ` read via `bool_env`, NOT a per-debate `debate.config` override** (unlike Phase 5c's `convergence_epsilon`, which WAS per-debate config). This is a deliberate simplification consistent with the mission's "Feature flag: DIALECTICAL_LINEAGE_INDEPENDENCE (bool_env, default OFF)" instruction (env-level, not per-debate) — implementer must confirm no existing convention requires feature flags of this kind to ALSO be overridable per-debate before assuming env-only is sufficient.
8. **`lineage_family()`'s exact normalization table** (which substrings map to `"claude"`/`"gpt"`/`"gemini"`/etc.) is a NEW pure function with no existing precedent in this codebase (grepped, not found) — the mapping rules in Task 1 below are this plan's proposal, not verified against any existing model-name normalization utility. Implementer must grep once more for any existing `model_family`/`provider_family`/`normalize_model` helper before writing a new one, to avoid duplicating logic.

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **Pre-existing known failures may exist in the coordinator suite** (environment-harness + foreign guardian WIP, count last re-baselined during Phase 5b/5c) — these are NOT this phase's responsibility. Re-baseline the count once at the start of this phase (run the full suite once before touching code) rather than trusting any stale number; do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`Generation`/`NodeScoringResult`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings/keys must use claim/debate-domain camelCase language consistent with the rest of the codebase (`judgeLineage`, `arguerLineage`, `independent`, `lineageFamily`, `noIndependentJudge`) — never generic `"item"`/`"task"` placeholders.
- **No schema migrations unless proven necessary.** `Generation.model_id` (arguer lineage source) and `NodeScoringResult.provider`/`.model` (judge lineage source) are ALREADY persisted columns per the Verified ground truth below — lineage is DERIVED at decision/recording time via a pure function, not stored as new columns. Do not add a migration in this phase unless a task's own investigation step proves a required field is genuinely unpersisted anywhere (if so, stop, model it as its own task on the `migrations/versions/0009`-style inspector-guarded pattern, and flag it explicitly in the final report rather than silently adding it).
- **Honest-failure paths still count as "the phase ran":** when no independent judge is available, the scoring result records `status: "no_independent_judge"` (or the equivalent honest reason string) — it must NEVER silently fall back to scoring with the same-lineage judge, never fabricate an `"independent": true`, and never leave existing/previously-scored `NodeScoringResult` rows for other nodes mutated or deleted.
- **Marker/flag safety on unexpected crash:** if something in the lineage-guard code path raises an exception NOT anticipated by the specific try/excepts described in the tasks below, the surrounding best-effort scoring flow must not be made LESS safe than it is today — a crash must not corrupt or silently drop an otherwise-valid scoring result; when in doubt, fail closed (block scoring with an honest reason) rather than fail open (score anyway).
- **Feature flag discipline:** `DIALECTICAL_LINEAGE_INDEPENDENCE` (via `bool_env`, `coordinator/app/core/config.py:144`, default `False`) gates ENFORCEMENT only (refusing/blocking same-lineage judge assignment). Lineage RECORDING (`judgeLineage`, `arguerLineage`, `independent` fields on scoring output) is ALWAYS computed and written regardless of the flag — it is inert metadata when the flag is off, never gated behind it.
- **Existing single-judge reality is not to be papered over.** Do not invent a fake "second judge" or fake rotation pool to make the guard feel more sophisticated than the system currently is (see UNVERIFIED #1). The honest v1 guard for a single-configured-judge system is binary: independent (proceed) or not (block, record `no_independent_judge`).

**Verified ground truth (dev lineage):**
- `coordinator/app/models/entities.py:48-70` — `Node` columns: `id`, `debate_id`, `parent_id`, `node_type`, `depth`, `position`, `claim`, `active_generation_id` (nullable `String(36)`, NOT a foreign key — just a string pointer), `status`, `path_status`, `stopping_status`, `stopping_reason`, `materialized_path`, `created_at`. No `provider`/`model`/`worker_id` column exists directly on `Node`.
- `coordinator/app/models/entities.py:73-91` — `Generation` columns: `id`, `node_id` (FK to `nodes`), `model_id` (`String(120)`, indexed — CONFIRMED persisted arguer model), `role`, `argument`, `prompt_version`, `prompt_rendered`, `tokens_in`, `tokens_out`, `latency_ms`, `is_active` (bool, indexed, unique-per-node via `ux_generations_active_per_node` partial index), `worker_id` (FK to `workers`), `created_at`. This is the arguer-lineage source of truth: `node.active_generation_id -> Generation.model_id`.
- `coordinator/app/scoring/service.py:1050` (inside `ensure_node_scoring_on_completion`) — `generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None` — CONFIRMED live pattern for reaching the arguer's `Generation` row from a `Node` at scoring time; `generation.model_id` (when `generation is not None`) is the arguer's persisted model lineage input.
- `coordinator/app/models/entities.py:265-309` — `JudgeOutputArtifact` columns include `provider` (`String`, part of `ux_judge_output_artifacts_identity` unique constraint alongside `debate_id`, `node_id`, `input_hash`, `judge_role`, `model`, `raw_output_sha256`), `model`, `judge_id`, `judge_version`, `contract_hash`, `request_metadata` (JSON), `provider_metadata` (JSON), `assessment` (JSON).
- `coordinator/app/models/entities.py:341-358` — `NodeScoringResult` columns include `provider` (`String(120)`, NOT NULL), `model` (`String(120)`, NOT NULL), `judge_id`, `judge_version`, `contract_hash`, `provider_metadata` (JSON), `status` (`String(24)`, default `"unavailable"`, indexed), `result` (JSON, default `dict`) — this is the CONFIRMED persisted judge-lineage source (`provider`/`model` on the scoring result row itself), and `result`/`provider_metadata` are the confirmed JSON columns available to carry new `judgeLineage`/`arguerLineage`/`independent` metadata without a migration.
- `coordinator/app/scoring/judge_registry.py` (full file read verbatim) — `JudgeContract` is a frozen pydantic model (`judge_id`, `judge_version`, `role`, `rubric_version`, `prompt_version`, `schema_version`, `reducer_version`, plus a derived `contract_hash` property). `PRIMARY_NODE_SCORING_JUDGE = JudgeContract(judge_id="node_scoring.primary", judge_version="v1", role="judge", ...)` is the sole registered contract; `_ACTIVE_CONTRACTS = {"judge": PRIMARY_NODE_SCORING_JUDGE}`; `active_contract(role: str) -> JudgeContract` looks it up by role. This confirms the contract identity mechanism is about PROMPT/SCHEMA/RUBRIC pinning, not about model/provider identity — lineage is an ORTHOGONAL concept to `JudgeContract` and must be layered on top, not folded into it.
- `coordinator/app/providers/registry.py:24-29, 100-108` — `ScoringProviderConfigStatus` (`available: bool`, `role: str`, `provider: str | None`, `model: str | None`, `reason: str | None`). `detect_scoring_provider_config(agents=None, *, role="judge", providers=None) -> ScoringProviderConfigStatus` resolves via `configs = agents if agents is not None else load_agent_configs()`, `registered_providers = providers if providers is not None else {"codex": CodexCliProvider()}`, `config = configs.get(role)` — CONFIRMS a single `role -> AgentConfig` lookup, no multi-candidate/pool concept (see UNVERIFIED #1).
- `coordinator/app/scoring/service.py:1028-1072` (`ensure_node_scoring_on_completion`, full relevant slice read verbatim) — resolves `generation` from `node.active_generation_id`, computes `input_hash`, calls `_expire_stale_scoring_jobs`, then `config = detect_scoring_provider_config(registry.agents, role=judge_role, providers=registry.providers)`; if `not config.available or config.provider is None or config.model is None`, calls `fail_unavailable_scoring_job(...)` and returns an error payload with `status: "unavailable"` — this is the CONFIRMED existing "honest block, no fake score" precedent this phase's `no_independent_judge` path should mirror stylistically (same shape of early-return-with-reason, same call to a `fail_*` helper pattern).
- `coordinator/app/scoring/service.py:90-93` — `queue_scoring_job(db, debate, *, model_id: str, judge_role: str = "judge")` calls `create_job(db, debate.id, SCORING_JOB_TYPE, judge_role, None, required_model=model_id)`. `coordinator/app/scoring/service.py:96-109` — `fail_unavailable_scoring_job(db, debate, *, model_id="", judge_role="judge", reason=UNAVAILABLE_SCORING_JOB_ERROR)` queues a job via `queue_scoring_job` then immediately marks it `status="failed"`, `error=reason`, `deadline=now_utc()` — CONFIRMED existing "honest failed job" pattern; a `no_independent_judge` block should reuse this exact helper (or a sibling constructed identically) with a distinct `reason` string, rather than inventing a new job-failure code path.
- `coordinator/app/services/orchestrator.py:454-461` — `capable_online_workers(db, model_id) -> list[Worker]` filters online `Worker` rows (via `last_seen >= cutoff` and `status == "online"`) by `model_id in worker_capability_set(worker)`; `worker_capability_set(worker) -> {str(c).strip() for c in worker.capabilities or [] if str(c).strip()}` reads the `Worker.capabilities: list[str]` JSON column. No `provider`/`model` column exists on `Worker` itself (confirmed at `coordinator/app/models/entities.py:118-129`) — worker "lineage" is not directly queryable from the `Worker` row; only the resolved judge `config.model` string (from `detect_scoring_provider_config`) carries lineage information in this codebase today.
- `coordinator/app/scoring/disagreement.py` (full file read verbatim) — `detect_disagreements(assessment: ClaimAssessment) -> list[JudgeDisagreement]` (in-request heuristics from a single `ClaimAssessment`'s sub-scores) and `detect_persisted_judge_disagreements(judge_evidence: list[dict]) -> list[JudgeDisagreement]` (cross-judge-role comparison keyed on `(judge_role, provider, model)` identity tuples, gated on a `>= 0.35` claim-strength-signal gap) are the CONFIRMED existing disagreement-surfacing mechanisms. `JudgeDisagreement` (in `coordinator/app/scoring/models.py`) already carries `judges: list[str]`, `type: str`, `severity: str`, `description: str`. This is the "existing judgeDisagreements surface" the mission says to keep as-is in v1 — no new disagreement-storage table exists or is needed; `provider`/`model` are ALREADY part of the persisted-judge-evidence identity tuple used for disagreement detection, confirming disagreement detection is already lineage-adjacent infrastructure (though it compares JUDGES against each other, not judge-vs-arguer).
- `coordinator/app/core/config.py:144-148` — `bool_env(name: str, default: bool) -> bool` reads `os.getenv(name)`, returns `default` if unset, else `value.strip().lower() in {"1", "true", "yes", "on"}`. Existing call-site convention confirmed at `coordinator/app/scoring/service.py:250`: `if bool_env("DIALECTICAL_QBAF_DEBUG", False):` — this exact call shape (`bool_env("<ENV_NAME>", False)`) is the pattern `DIALECTICAL_LINEAGE_INDEPENDENCE` must follow.
- No existing `model_family`/`provider_family`/`lineage`/`normalize_model` helper function was found anywhere under `coordinator/app` in this pass's greps — `lineage_family()` is confirmed to be new code with no precedent to reuse or collide with (subject to UNVERIFIED #8's one-more-grep caveat).

---

### Task 1: `lineage_family()` pure function + always-on lineage recording on scoring results

**Files:**
- Create: `coordinator/app/scoring/lineage.py`
- Modify: `coordinator/app/scoring/service.py` (wire recording into `ensure_node_scoring_on_completion`, and any other confirmed `NodeScoringResult`-writing path per UNVERIFIED #6)
- Create: `coordinator/tests/test_lineage.py`
- Modify/extend: `coordinator/tests/test_node_scoring.py`

**Interfaces:**
- `lineage_family(model_id: str | None) -> str | None`: pure function, no I/O. Returns `None` for `None`/empty input (honest "no lineage" — never guesses). Normalization table (case-insensitive substring match, checked in this order, first match wins):
  - contains `"claude"` -> `"claude"`
  - contains `"gpt"` or `"codex"` -> `"gpt"`
  - contains `"gemini"` -> `"gemini"`
  - contains `"llama"` -> `"llama"`
  - contains `"mistral"` -> `"mistral"`
  - contains `"deepseek"` -> `"deepseek"`
  - contains `"grok"` -> `"grok"`
  - no match -> return the raw lowercased `model_id` string, UNCHANGED family-wise (honest — an unrecognized model is its own family of one, not silently bucketed with anything else, and NOT `None`, since we do have a concrete model string, we just don't recognize its vendor family).
- `judge_lineage_metadata(*, arguer_model_id: str | None, judge_provider: str | None, judge_model_id: str | None) -> dict`: pure function assembling the always-on recording block:
  - `judge_family = lineage_family(judge_model_id)`; `arguer_family = lineage_family(arguer_model_id)`.
  - If `arguer_model_id` is falsy (arguer lineage unknown — legacy/edge node): return `{"judgeLineage": {"provider": judge_provider, "model": judge_model_id, "family": judge_family}, "arguerLineage": None, "independent": None, "independenceReason": "arguer_lineage_unknown"}`.
  - Else: `independent = (arguer_family != judge_family)` (or `None` if `judge_family` is also falsy — honest, never assume independence when either side is unknown); return `{"judgeLineage": {"provider": judge_provider, "model": judge_model_id, "family": judge_family}, "arguerLineage": {"model": arguer_model_id, "family": arguer_family}, "independent": independent, "independenceReason": ("independent_lineage" if independent else "same_lineage") if judge_family and arguer_family else "judge_lineage_unknown"}`.
- In `ensure_node_scoring_on_completion` (and any other confirmed write path per UNVERIFIED #6), after `config`/`generation` are resolved and before/alongside constructing the `NodeScoringResult.result` dict, call `judge_lineage_metadata(arguer_model_id=generation.model_id if generation else None, judge_provider=config.provider, judge_model_id=config.model)` and merge the returned dict's keys into `NodeScoringResult.result` (or `provider_metadata`, per UNVERIFIED #5's confirmation of exact target — prefer `result` if it is the JSON blob consumers read as "the scoring payload," since `judgeLineage`/`arguerLineage`/`independent` are consumer-facing facts, not internal provider debug metadata).
- This task does NOT gate anything on `DIALECTICAL_LINEAGE_INDEPENDENCE` — recording is unconditional per Global Constraints.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_lineage.py`:

```python
from app.scoring.lineage import lineage_family, judge_lineage_metadata


def test_lineage_family_recognizes_claude() -> None:
    assert lineage_family("claude-sonnet-5") == "claude"
    assert lineage_family("claude-opus-4-1") == "claude"


def test_lineage_family_recognizes_gpt_and_codex() -> None:
    assert lineage_family("gpt-5.2-codex") == "gpt"
    assert lineage_family("gpt-4o") == "gpt"


def test_lineage_family_recognizes_gemini() -> None:
    assert lineage_family("gemini-2.5-pro") == "gemini"


def test_lineage_family_unknown_model_returns_raw_lowercased_string_not_none() -> None:
    # Honest: we don't recognize the vendor, but we still have a concrete
    # model string -- it must not collapse to None or a shared "unknown" bucket.
    assert lineage_family("some-future-model-x9") == "some-future-model-x9"


def test_lineage_family_of_none_or_empty_is_none() -> None:
    assert lineage_family(None) is None
    assert lineage_family("") is None


def test_judge_lineage_metadata_flags_independent_when_families_differ() -> None:
    meta = judge_lineage_metadata(
        arguer_model_id="claude-sonnet-5",
        judge_provider="codex",
        judge_model_id="gpt-5.2-codex",
    )
    assert meta["judgeLineage"] == {"provider": "codex", "model": "gpt-5.2-codex", "family": "gpt"}
    assert meta["arguerLineage"] == {"model": "claude-sonnet-5", "family": "claude"}
    assert meta["independent"] is True
    assert meta["independenceReason"] == "independent_lineage"


def test_judge_lineage_metadata_flags_not_independent_when_families_match() -> None:
    meta = judge_lineage_metadata(
        arguer_model_id="claude-opus-4-1",
        judge_provider="anthropic",
        judge_model_id="claude-sonnet-5",
    )
    assert meta["independent"] is False
    assert meta["independenceReason"] == "same_lineage"


def test_judge_lineage_metadata_honest_null_when_arguer_lineage_unknown() -> None:
    meta = judge_lineage_metadata(
        arguer_model_id=None,
        judge_provider="codex",
        judge_model_id="gpt-5.2-codex",
    )
    assert meta["arguerLineage"] is None
    assert meta["independent"] is None
    assert meta["independenceReason"] == "arguer_lineage_unknown"
```

Add to `coordinator/tests/test_node_scoring.py` (implementer: use the existing DB-backed test setup already present in this file for `ensure_node_scoring_on_completion` — locate the fixture/helper that already builds a scored `Node` + active `Generation` + `NodeScoringResult` for the current tests in this file, e.g. whatever helper backs `test_reducer_payload_surfaces_disagreements_not_averaged_away`, and follow the SAME construction pattern; do not hand-build fake JSON):

```python
def test_ensure_node_scoring_records_judge_and_arguer_lineage(db) -> None:
    # Build a debate + node with an active Generation whose model_id is a
    # known arguer model, then run ensure_node_scoring_on_completion with a
    # FakeProvider/registry resolving to a judge model of a DIFFERENT family.
    # (implementer: reuse whatever FakeProvider/registry fixture already
    # backs the passing scoring tests in this file.)
    ...
    result = ensure_node_scoring_on_completion(db, debate, node, registry, judge_role="judge")
    scoring_row = <fetch the persisted NodeScoringResult for this node>
    assert scoring_row.result["judgeLineage"]["family"] is not None
    assert scoring_row.result["arguerLineage"]["model"] == "<the seeded arguer model_id>"
    assert scoring_row.result["independent"] in (True, False)


def test_ensure_node_scoring_records_null_arguer_lineage_when_no_active_generation(db) -> None:
    # Node with active_generation_id = None (legacy/edge case).
    ...
    result = ensure_node_scoring_on_completion(db, debate, node, registry, judge_role="judge")
    scoring_row = <fetch the persisted NodeScoringResult for this node>
    assert scoring_row.result["arguerLineage"] is None
    assert scoring_row.result["independent"] is None
    assert scoring_row.result["independenceReason"] == "arguer_lineage_unknown"
```

(Implementer: replace the `...`/`<...>` placeholders with real fixture calls after re-reading UNVERIFIED #5/#6's target locations — the exact helper names for "fetch the persisted NodeScoringResult for this node" and "build a scored node with a FakeProvider registry" must come from what already exists in this file, not be invented.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_lineage.py tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`test_lineage.py` fails with `ModuleNotFoundError`/`ImportError` since `app/scoring/lineage.py` does not exist yet; new `test_node_scoring.py` assertions fail against current output shape).

- [ ] **Step 3: Implement**

Create `coordinator/app/scoring/lineage.py`:
```python
from __future__ import annotations

_FAMILY_SUBSTRINGS: tuple[tuple[str, str], ...] = (
    ("claude", "claude"),
    ("gpt", "gpt"),
    ("codex", "gpt"),
    ("gemini", "gemini"),
    ("llama", "llama"),
    ("mistral", "mistral"),
    ("deepseek", "deepseek"),
    ("grok", "grok"),
)


def lineage_family(model_id: str | None) -> str | None:
    if not model_id:
        return None
    lowered = model_id.strip().lower()
    if not lowered:
        return None
    for substring, family in _FAMILY_SUBSTRINGS:
        if substring in lowered:
            return family
    return lowered


def judge_lineage_metadata(
    *,
    arguer_model_id: str | None,
    judge_provider: str | None,
    judge_model_id: str | None,
) -> dict:
    judge_family = lineage_family(judge_model_id)
    judge_lineage = {"provider": judge_provider, "model": judge_model_id, "family": judge_family}

    if not arguer_model_id:
        return {
            "judgeLineage": judge_lineage,
            "arguerLineage": None,
            "independent": None,
            "independenceReason": "arguer_lineage_unknown",
        }

    arguer_family = lineage_family(arguer_model_id)
    arguer_lineage = {"model": arguer_model_id, "family": arguer_family}

    if not judge_family or not arguer_family:
        return {
            "judgeLineage": judge_lineage,
            "arguerLineage": arguer_lineage,
            "independent": None,
            "independenceReason": "judge_lineage_unknown",
        }

    independent = arguer_family != judge_family
    return {
        "judgeLineage": judge_lineage,
        "arguerLineage": arguer_lineage,
        "independent": independent,
        "independenceReason": "independent_lineage" if independent else "same_lineage",
    }
```

In `coordinator/app/scoring/service.py`: import `judge_lineage_metadata` from `app.scoring.lineage`; at the confirmed write site(s) (UNVERIFIED #6), compute the metadata dict using `generation.model_id if generation else None` for `arguer_model_id` and `config.provider`/`config.model` for the judge side, and merge its keys into the `NodeScoringResult.result` dict (confirm exact merge point against the real dict-construction code before finalizing — do not overwrite existing keys).

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_lineage.py tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Flag UNVERIFIED #5 and #6's resolution explicitly (which exact dict/write-path the metadata was merged into, and whether any second write path was found and handled). Move to Task 2.

---

### Task 2: Enforcement guard — block same-lineage judge assignment behind `DIALECTICAL_LINEAGE_INDEPENDENCE`

**Files:**
- Modify: `coordinator/app/scoring/service.py`
- Modify: `coordinator/app/core/config.py` (if a settings-object convention wraps `bool_env` calls elsewhere — confirm before adding a raw `bool_env` call inline; otherwise call `bool_env` directly at the guard site, matching the `DIALECTICAL_QBAF_DEBUG` precedent)
- Modify/extend: `coordinator/tests/test_node_scoring.py`

**Interfaces:**
- New flag: `DIALECTICAL_LINEAGE_INDEPENDENCE` read via `bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False)` at the guard call site inside `ensure_node_scoring_on_completion` (module-level constant is fine if it matches how `DIALECTICAL_QBAF_DEBUG` is read at its call site — re-check whether that one is read fresh per-call or cached at import time before choosing; prefer read-fresh-per-call for testability with `monkeypatch.setenv`, matching pytest's typical env-var test pattern).
- Guard logic, inserted in `ensure_node_scoring_on_completion` AFTER `config` is resolved as available (`config.available and config.provider is not None and config.model is not None`) and AFTER `generation` is resolved, but BEFORE the existing cache-lookup/job-queuing continues:
  1. If flag is off: no behavior change, proceed exactly as today (Task 1's recording still happens regardless).
  2. If flag is on: compute `arguer_family = lineage_family(generation.model_id if generation else None)` and `judge_family = lineage_family(config.model)`.
     - If `arguer_family is None` (unknown arguer lineage): per Global Constraints' honest-null law, DO NOT block (there is nothing to collide against) — proceed with scoring, `independent` recorded as `None`/`"arguer_lineage_unknown"` per Task 1. (Blocking on unknown-arguer would be MORE conservative but the mission's honesty law is about not FABRICATING independence, not about blocking on ignorance — implementer should flag this interpretation choice in the final report as a judgment call, not silently assume it.)
     - If `arguer_family == judge_family` (collision, both known): this is `NO_INDEPENDENT_JUDGE` — there is no second candidate to rotate to (UNVERIFIED #1). Call `fail_unavailable_scoring_job(db, debate, model_id=config.model, judge_role=judge_role, reason=NO_INDEPENDENT_JUDGE_REASON)` (new module constant, e.g. `NO_INDEPENDENT_JUDGE_REASON = "no_independent_judge: judge lineage matches arguer lineage"`) and return a `scoring_result_payload` whose error item has `status="no_independent_judge"` (new literal status string — confirm against existing `NodeScoringError.status` field's allowed values/type in `coordinator/app/scoring/models.py` before hardcoding; widen the type if it is a strict `Literal`) and `reason` explaining the collision, mirroring the existing `not config.available` early-return block's shape exactly.
     - Else (families differ): proceed as normal; scoring continues to record `independent: True` via Task 1's metadata.
- No existing `NodeScoringResult` rows for OTHER nodes are read, mutated, or deleted by this guard — it only affects the in-flight scoring attempt for the current node.
- No rotation logic is implemented (per UNVERIFIED #1) — this is a binary block/proceed guard for a single-configured-judge system. Document this scope limitation explicitly in code comments at the guard site, referencing this plan.

- [ ] **Step 1: Write failing tests first**

Add to `coordinator/tests/test_node_scoring.py`:

```python
def test_lineage_guard_off_by_default_scores_even_with_same_lineage(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_LINEAGE_INDEPENDENCE", raising=False)
    # Seed a node whose active Generation.model_id is the SAME family as the
    # configured judge model (e.g. both "claude-..." variants via FakeProvider).
    ...
    result = ensure_node_scoring_on_completion(db, debate, node, registry, judge_role="judge")
    # No blocking -- flag is off, existing behavior unchanged.
    assert not any(error.status == "no_independent_judge" for error in result.get("errors", []))


def test_lineage_guard_blocks_same_lineage_judge_when_enabled(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_LINEAGE_INDEPENDENCE", "true")
    # Same same-lineage seed as above.
    ...
    result = ensure_node_scoring_on_completion(db, debate, node, registry, judge_role="judge")
    assert any(error.status == "no_independent_judge" for error in result["errors"])
    # No fake score was recorded for this node.
    scoring_row = <fetch NodeScoringResult for this node, if any>
    assert scoring_row is None or scoring_row.status != "complete"


def test_lineage_guard_allows_independent_lineage_judge_when_enabled(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_LINEAGE_INDEPENDENCE", "true")
    # Seed arguer + judge with DIFFERENT families.
    ...
    result = ensure_node_scoring_on_completion(db, debate, node, registry, judge_role="judge")
    assert not any(error.status == "no_independent_judge" for error in result.get("errors", []))


def test_lineage_guard_does_not_block_when_arguer_lineage_unknown(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_LINEAGE_INDEPENDENCE", "true")
    # Node with active_generation_id = None.
    ...
    result = ensure_node_scoring_on_completion(db, debate, node, registry, judge_role="judge")
    assert not any(error.status == "no_independent_judge" for error in result.get("errors", []))
```

(Implementer: fill in `...`/`<...>` using the same real fixture/factory helpers established in Task 1 — no fake JSON. Confirm the exact shape of `result["errors"]`/`NodeScoringError` before asserting `.status`; this may need adjusting to match the real pydantic model's field access pattern, e.g. `error["status"]` if it's serialized to a dict rather than a model instance at this boundary.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (guard does not exist yet; flag is not read anywhere).

- [ ] **Step 3: Implement**

In `coordinator/app/scoring/service.py`, add near the top (module constants):
```python
NO_INDEPENDENT_JUDGE_REASON = "No independent judge lineage is available for this arguer."
```

Insert into `ensure_node_scoring_on_completion`, immediately after the existing `if not config.available or config.provider is None or config.model is None:` block (so this guard only runs once a valid judge config IS available) and after `generation` has been resolved:
```python
    from app.core.config import bool_env
    from app.scoring.lineage import lineage_family

    if bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False):
        arguer_family = lineage_family(generation.model_id if generation else None)
        judge_family = lineage_family(config.model)
        if arguer_family is not None and judge_family is not None and arguer_family == judge_family:
            fail_unavailable_scoring_job(
                db, debate, model_id=config.model, judge_role=judge_role, reason=NO_INDEPENDENT_JUDGE_REASON
            )
            return scoring_result_payload(
                debate_id=debate.id,
                node_ids=node_ids,
                items=[],
                errors=[
                    NodeScoringError(
                        node_id=node.id,
                        status="no_independent_judge",
                        reason=NO_INDEPENDENT_JUDGE_REASON,
                    )
                ],
            )
```
(Move the two `import` lines to the module's existing top-level import block instead of inline, matching file style — inline shown here only for readability of the diff location. Confirm `NodeScoringError.status` accepts arbitrary strings or widen its type per UNVERIFIED note above before this compiles/validates.)

- [ ] **Step 4: Verify pass + full-suite rerun**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_lineage.py tests/test_node_scoring.py tests/test_judge_contract_golden.py tests/test_judge_contract_stamping.py tests/test_contract_cache_identity.py tests/test_artifact_hydration_contract_guard.py tests/test_worker_lifecycle_states.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except the pre-existing known failures (re-baselined at the start of this phase per Global Constraints). If a NEW failure appears, fix the root cause in this phase's code before reporting done — do not weaken a pre-existing test to paper over a real regression. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and flag UNVERIFIED #1 (no true rotation substrate exists — this phase implements binary block/proceed only), #5/#6 (exact write-path(s) lineage recording was wired into), and the judgment call under Task 2's guard logic step 2.ii (unknown-arguer-lineage does NOT block, by design) as decisions requiring product sign-off before wider rollout (i.e. before flipping `DIALECTICAL_LINEAGE_INDEPENDENCE` on by default in any environment).
