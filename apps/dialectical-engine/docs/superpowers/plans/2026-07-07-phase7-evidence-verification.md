# Phase 7: Evidence Nodes + Verification Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Evidence attached to claims as first-class data (EVIDENCE node_type + honest extraction), a real verification evaluator that produces per-evidence verdicts (supported/contradicted/unverifiable) only via an actual independent judge job (never from the mere existence of a citation string), and protocol-level `verificationStatuses` that consume real persisted verdicts where they exist, falling back to the P5b kind-classifier (`unverifiable_by_kind` / `pending_verification`) everywhere else. Normative/definitional claims are NEVER evaluated (stay `unverifiable_by_kind`). Synthesis citation surfacing and tree-UI verdict rendering are explicitly DEFERRED to P9.

**Tech Stack:** Python 3.12, SQLAlchemy, FastAPI, pytest (coordinator suite: `cd coordinator && python -m pytest tests`). Web: Next.js/TypeScript (`web/`) — touched only for a type-union addition, not rendering, per deferral to P9.

## UNVERIFIED — implementer must confirm before/while implementing

1. **No worker-side generation schema anywhere in this repo asks the model for evidence/citations/sources today.** Confirmed by reading `worker/app/adapters/codex_v2_agent_run.schema.json` verbatim (`{pros: string[5], cons: string[5], summary, confidence}` — plain strings, `additionalProperties: false`) and grepping `citation|evidence|source` (case-insensitive) across `worker/app/adapters/codex_v2_pov.schema.json` (no matches) and the other worker schema files (not individually re-grepped: `codex_v2_planner.schema.json`, `codex_v2_synthesis.schema.json` — implementer must re-check these two before writing Task 1, in case a citation-shaped field already exists there that this pass missed). `NormalizedClaim.evidence_refs` (`coordinator/app/scoring/models.py:122`) is NOT LLM-produced evidence — it is a deterministic URL regex scan (`coordinator/app/scoring/normalizer.py:268-272`, comment says "URL extraction only") over the already-generated `claim`/`core_claim` text, populated by `normalize_claim`. This means: there is no existing seam where the worker LLM call already emits a distinct "evidence" payload field distinguishable from ordinary argument prose. Per the mission's own contingency, Task 1 below is therefore the EXTRACTION-SEAM-AND-PARSER task (parsing `Generation.argument` prose for evidence-shaped spans via the same honest deterministic-regex philosophy as `_extract_evidence_refs`, extended beyond bare URLs), NOT a "persist the evidence field the worker already sends" task. Any actual prompt-side change asking workers to explicitly separate "argument" from "evidence/citation" is OUT OF SCOPE for this plan (would touch `worker/app/adapters/codex_v2_agent_run.schema.json` and whatever prompt-construction code renders instructions into the worker call — not traced in this pass) and is called out as a separate follow-on task at the end of Task 1.
2. **`app/evidence/` (`model.py`, `pipeline.py`, `entailment.py`, `quality.py`, `retraction.py`, `stub.py`) is a fully-built, ALREADY-EXISTING evidence-scoring subsystem** (`SourceRecord`, `EvidenceScore`, `EvidenceStatus` enum with `GROUNDED/MISSING/UNAVAILABLE/REFUTED/CONTRADICTED/RETRACTED/NO_INFO`, `EvidenceValidationPipeline.score_claim_source`) — read `model.py` and `pipeline.py` in full in this pass. It operates on `SourceRecord` (a manually-constructed dataclass: `reference, text, title, retracted, quality_grade, corroboration_count, statistical_flags`) and a `ClaimNode` from `app.qbaf` (QBAF argumentation-graph node, NOT the SQLAlchemy `Node` entity) — it is QBAF-graph-scoring scaffolding, not wired to `Node`/`Generation`/the DB at all (no imports of `app.models.entities` found in `pipeline.py`). Implementer must confirm, before starting Task 2, whether this module's `EvidenceStatus` vocabulary (`grounded/refuted/contradicted/no_info/...`) should be reused/aliased for the new EVIDENCE-node verification-verdict vocabulary (`supported/contradicted/unverifiable/pending` per mission) or kept fully separate — this plan's Task 2 proposes a NEW, smaller status vocabulary matching the mission's exact words rather than reusing `EvidenceStatus` wholesale, because `EvidenceStatus` is keyed to a `SourceRecord`-input scoring model (quality_grade, corroboration_count) that has no construction path from real generation output today; reusing it would require either fabricating those inputs (forbidden) or a larger refactor out of scope here. Implementer must re-confirm this scoping call is still right after re-reading `app/evidence/stub.py` and `app/evidence/quality.py` in full (not read in this pass beyond the grep hit).
3. **Exact target dict for persisting per-evidence verdicts was not narrowed to one single existing column** in this pass. Two plausible homes exist and both are schema-migration-free: (a) a new `AnalyzerRun` row with `analyzer_type="evidence_verification"` (pattern confirmed live at `coordinator/app/protocol/runner.py:157-172`'s `PROTOCOL_ANALYSIS_TYPE` row — `AnalyzerRun.output` is an unconstrained JSON column, `coordinator/app/models/entities.py:190-200`), keyed by node_id -> verdict; or (b) piggybacking onto `NodeScoringResult.result`/`provider_metadata` (JSON columns, confirmed free-form at `coordinator/app/models/entities.py:341-358` per the Phase 6 plan's verified ground truth) the same way Phase 6 added `judgeLineage`/`arguerLineage` without a migration. This plan's Task 2 recommends (a) — a dedicated `AnalyzerRun` row — because verification verdicts are evaluated PER EVIDENCE NODE (child of a claim), not per claim-scoring-attempt, and conflating them into `NodeScoringResult` (which is keyed to the claim node's own score, not its evidence children) would blur two distinct concerns. Implementer must re-verify this reasoning holds once Task 1's EVIDENCE node shape is finalized, and confirm no existing `analyzer_type` string collides with `"evidence_verification"` (grepped `PROTOCOL_ANALYSIS_TYPE`/`analyzer_type=` in this pass — only `protocol_analysis` found as a live value — but re-grep immediately before Task 2 in case another phase landed a new analyzer_type concurrently).
4. **`ScoringProviderRequest` has no field for "the evidence text under evaluation" beyond `argument_text` and `claim` (`NormalizedClaim`)** (`coordinator/app/scoring/judges.py:13-19`, full file read verbatim in this pass). A verification-evaluator call must therefore either (a) reuse `argument_text` to carry the evidence node's content (with `judge_role="verifier"` or similar distinguishing it from ordinary claim scoring — no existing `judge_role` value other than `"judge"` was found live in a grep of all 7 files that reference `judge_role`, so `"verifier"` would be a NEW role string, not a precedent-following one), or (b) add an evidence-specific field to `ScoringProviderRequest.metadata` (already a free `dict[str, Any]`, no migration/schema-break risk since it's a pydantic field, not a DB column). This plan's Task 2 proposes (b) — pass evidence content via `metadata={"evidence_text": ..., "evidence_kind": ...}` and keep `argument_text` as the claim's own argument text — to avoid overloading `argument_text`'s existing semantic meaning ("the claim node's own generated argument"). Implementer must confirm no downstream consumer of `ScoringProviderResult`/`parse_judge_json` assumes `argument_text` is the ONLY input content the judge sees, before finalizing this call shape.
5. **The `judge_lineage_metadata`/lineage-guard machinery (Phase 6) lives INLINE inside `score_node_with_provider`** (`coordinator/app/scoring/service.py:434-523`, confirmed live/shipped in this pass — not just planned; the P6 guard is real code today, both the completion-hook site and this shared `score_node_with_provider` site per the code comment at lines 495-507 explaining the Task-2-fix-wave rationale). This means a NEW verification-evaluator entry point that also calls into judge-provider machinery MUST either (a) route through `score_node_with_provider` itself (reusing 100% of guard+lineage+cache plumbing, but that function is claim-scoring-shaped: it resolves `node.active_generation_id`, computes `input_hash` from `claim`+`argument_text`, and writes to the `NodeScoringResult`/scoring-cache table — a mismatch for an EVIDENCE-node input), or (b) call `provider.judge_node(request)` directly with its own guard call (`lineage_family`, `bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", ...)` reused as pure functions/constants) and its own persistence, duplicating only the guard+call shape, not the cache/claim-scoring shape. This plan's Task 2 proposes (b) — implementer must re-read `score_node_with_provider` end-to-end (this pass read lines 434-553 only; the tail after line 553 handling `_persist_judge_output_artifact` and cache-store was not read) before finalizing whether any part of the tail (e.g. `_persist_judge_output_artifact`, `JudgeOutputArtifact` row writing for provenance/audit) should ALSO be reused for the verification evaluator's provenance recording, since `JudgeOutputArtifact` (`coordinator/app/models/entities.py:265-309`) already stores raw judge output + contract identity generically and duplicating a parallel artifact-store path would be wasteful if it fits as-is.
6. **`judge_registry.py`'s `JudgeContract`/`_ACTIVE_CONTRACTS` mechanism (`role -> JudgeContract`) currently registers only `role="judge"` (`PRIMARY_NODE_SCORING_JUDGE`)** per the Phase 6 plan's verified ground truth (not independently re-read in full in this pass, carried over from the Phase 6 plan's own full-file read). A verification evaluator introducing `judge_role="verifier"` (or similar) would need either a new registered `JudgeContract` for that role (if `active_contract(role)` is called anywhere in the verification path) or must avoid calling `active_contract` for an unregistered role (it raises `KeyError`, confirmed handled defensively at `coordinator/app/scoring/service.py:468-470` via `try/except KeyError: lookup_contract = None`). Implementer must re-read `judge_registry.py` in full immediately before Task 2 to decide whether the verification evaluator needs its own registered contract (for cache-identity/audit-trail purposes matching the claim-scoring precedent) or can legitimately skip contract-based caching entirely (simpler, but loses the "contract_hash" audit dimension other judge output has).
7. **Web `node_type` TypeScript union (`web/lib/types.ts:30`) is a closed string-literal union** (`"ROOT_CLAIM" | "SCIENTIFIC_POV" | "STATISTICAL_POV" | "ETHICAL_POV" | "PRACTICAL_POV" | "PRO" | "CON"`) with NO `"EVIDENCE"` member. Grepped `node_type` across `web/` in this pass (8 files reference it: `types.ts`, `DebatePageClient.tsx`, `DebateSplit.tsx`, `debatePresentation.ts`, `DebateTree.tsx`, `debateTreeUtils.ts`, `debateTreeUtils.test.mjs`, `ArgumentFocusView.tsx`) but did NOT read all 8 files' switch/render logic in full to confirm whether an unrecognized `node_type` string silently falls through to a default rendering branch (TypeScript's structural typing means a value outside the union compiles fine from the API-JSON boundary — this is a type-checking gap, not a runtime one, since JSON payloads aren't compile-time checked — but any `switch`/lookup-map keyed exhaustively on the union COULD have a runtime default case or could silently omit unhandled types from the tree). Implementer must grep+read all 8 files' actual usage sites before shipping Task 1's `EVIDENCE` node_type value, to confirm EVIDENCE children rendering as "just another child node" (or being filtered out of the primary argument tree, which may be the SAFER default until P9's verdict-first UI) does not visually break the tree. This plan takes the conservative position (see Task 1) that EVIDENCE nodes should be filtered OUT of default tree traversal/QBAF-graph construction in this phase (added to `_NO_EDGE_TYPES` in `debate_adapter.py` alongside `ROOT_CLAIM`, and excluded from the web tree's default child list) rather than risk unverified rendering breakage — implementer must confirm this filtering is itself sufficient and doesn't orphan evidence data from ever being queryable (it remains queryable via `parent_id`, just not auto-rendered/auto-scored as a QBAF argument edge).
8. **Whether `coordinator/app/qbaf/debate_adapter.py`'s vocabulary sets (`_SUPPORT_TYPES`, `_ATTACK_TYPES`, `_NO_EDGE_TYPES`) are exhaustively validated anywhere (e.g. a test asserting every `Node.node_type` value in the DB falls into exactly one set)** was not checked in this pass. If such an exhaustiveness check exists, adding `"EVIDENCE"` to `_NO_EDGE_TYPES` (this plan's proposal) must be paired with updating that check; implementer must grep `_SUPPORT_TYPES|_ATTACK_TYPES|_NO_EDGE_TYPES` in `coordinator/tests/` before writing Task 1's Step 3 to confirm.
9. **`worker_id` on `Generation` is a NOT-NULL foreign key** (`coordinator/app/models/entities.py:87`, `worker_id: Mapped[str] = mapped_column(ForeignKey("workers.id"), index=True)` — no `Optional`). If Task 1's EVIDENCE nodes are persisted via a synthetic/derived `Generation`-like record (they should NOT need one at all, since evidence content is extracted FROM an existing claim node's own `Generation.argument`, not independently generated) this is moot — but implementer must confirm Task 1's design (evidence as a child `Node` with its OWN `Generation` row, per the mission's "content = the evidence text/source AS PRODUCED") does not require inventing a fake `worker_id`/`model_id` for the evidence child's `Generation` row. This plan's Task 1 resolves this by giving the EVIDENCE child node a REAL `Generation` row whose `worker_id`/`model_id` are COPIED from the parent claim's active `Generation` (the same worker/model that produced the prose the evidence was extracted from — honest, not fabricated, since it correctly attributes "who produced this text") — implementer must confirm this copy-forward is semantically defensible (it is the same generation event, just split into claim-prose vs. evidence-span) and doesn't violate `ux_generations_active_per_node` (a different index scope per node_id, so no collision expected, but confirm).

## Global Constraints

- **No commits.** Do not run `git add`/`git commit` for this phase; stop after tests are green and report status.
- **Anti-stall clause:** Run tests as ONE foreground Bash call with the `timeout` parameter set; never `run_in_background`, never `Monitor`. If it times out once, report BLOCKED — do not retry in a loop.
- **Pytest flags (always append):** `--basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
- **Pre-existing known failures may exist in the coordinator suite** (environment-harness + foreign guardian WIP, count last re-baselined during Phase 5b/5c/6) — these are NOT this phase's responsibility. Re-baseline the count once at the start of this phase (run the full suite once before touching code) rather than trusting any stale number; do not attempt to fix them; do not let their presence block a "suite green" claim for the tests this phase owns.
- **Forbidden files — do not create, modify, or delete:** `Makefile`, `scripts/dev_guardian.py`, `scripts/start_dev.ps1`.
- **No DB deletion** of any kind, including in tests (use in-memory/session-scoped fixtures per existing test patterns).
- **No fake runtime data** — tests must use real fixture rows (real `Debate`/`Node`/`Generation`/`AnalyzerRun`-shaped rows via existing fixtures/factories), not hardcoded fake "looks-like-a-response" JSON standing in for a real computation path. Evidence content in tests must be realistic prose fixtures (synthetic-but-realistic, e.g. actual sentences containing a URL/statistic/quote pattern), never a bare placeholder string like `"evidence1"`.
- **TDD strictly:** for every task, write the failing test first, run it and confirm the failure, then implement, then confirm green. Do not write implementation before a failing test exists for it.
- **DDD naming:** any new public strings/keys must use claim/debate-domain camelCase language consistent with the rest of the codebase at the JSON/pydantic-alias boundary (e.g. `evidenceKind`, `verificationStatus`, `evidenceNodeIds`, `verifiedAt`) — never generic `"item"`/`"task"` placeholders. Internal Python stays snake_case per existing file convention; only the JSON-facing payload keys need camelCase (confirm the exact boundary convention — e.g. `alias_generator` usage — by re-reading `coordinator/app/scoring/models.py`'s pydantic config before assuming camelCase applies inside Python dataclasses too).
- **No schema migrations unless proven necessary.** `Node.node_type` is `String(16)` with NO enum/CHECK constraint (confirmed: `coordinator/app/models/entities.py:54`, plain indexed string column) — adding `"EVIDENCE"` as a new node_type value requires ZERO migration (it fits the 16-char limit and there is no vocabulary constraint at the DB layer; vocabulary is enforced only informally via Python-side sets like `_SUPPORT_TYPES`/`_ATTACK_TYPES`/`_NO_EDGE_TYPES`). `AnalyzerRun.output` and `NodeScoringResult.result`/`.provider_metadata` are already-persisted unconstrained JSON columns (confirmed) sufficient to carry verification-verdict payloads without a migration. Do NOT add a migration in this phase unless a task's own investigation step proves a required field is genuinely unpersisted anywhere (if so, stop, model it as its own task on the `migrations/versions/0009`-style inspector-guarded pattern, and flag it explicitly in the final report rather than silently adding it).
- **Honesty laws (binding, non-negotiable, apply to every task):**
  - An LLM-generated citation string is NEVER, by itself, "verified evidence." Evidence may only reach status `"supported"`/`"contradicted"` through a REAL verification evaluation — an actual judge-provider job call, with Phase 6 lineage-independence metadata recorded on it (reusing `lineage_family`/`judge_lineage_metadata` from `coordinator/app/scoring/lineage.py`), never by the mere existence of a citation/URL/quote string extracted from generation text.
  - Never fabricate sources/URLs/quotes/worker attribution. Evidence nodes are persisted only from content the generation actually produced (extracted from real `Generation.argument` text); no synthetic "example.com" placeholder evidence in non-test code paths, ever.
  - Absence is honest: claims with no extractable evidence stay `pending_verification` (or `unverifiable_by_kind` for normative/definitional claims, unconditionally, per P5b — NEVER evaluated regardless of evidence presence).
  - When a verification evaluator's judge call fails, times out, or is blocked by the lineage guard, the per-evidence verdict is `"unverifiable"` with an honest reason string — NEVER silently defaulted to `"supported"` and NEVER silently dropped from the response (mirrors the `no_independent_judge`/`unavailable` honest-failure precedent from Phase 6).
- **Feature flag discipline:** `DIALECTICAL_EVIDENCE_VERIFICATION` (via `bool_env`, matching the exact call shape `bool_env("DIALECTICAL_EVIDENCE_VERIFICATION", False)` per the confirmed precedent at `coordinator/app/core/config.py:144` and call-site convention at `coordinator/app/scoring/service.py:250,508`) gates the VERIFICATION EVALUATOR's execution (Task 2 — actually calling out to a judge provider to produce supported/contradicted/unverifiable verdicts) ONLY. It does NOT gate Task 1's evidence-node extraction/persistence (EVIDENCE node_type recording is always-on, harmless substrate — an EVIDENCE child node with no verdict yet is just `pending_verification`, same as any other claim). It does NOT gate Task 3's protocol-integration fallback logic (reading whatever verdicts exist, real or absent, is always-on).
- **Marker/flag safety on unexpected crash:** if something in the evidence-extraction or verification-evaluator code path raises an exception NOT anticipated by the specific try/excepts described in the tasks below, the surrounding best-effort flow (node completion, protocol analysis) must not be made LESS safe than it is today — a crash must not corrupt or silently drop an otherwise-valid node/generation/scoring result; when in doubt, fail closed (record nothing new, leave status at `pending_verification`) rather than fail open (fabricate a verdict).
- **Reuse Phase 6 lineage machinery, do not fork it.** `lineage_family()` and `judge_lineage_metadata()` (`coordinator/app/scoring/lineage.py`, shipped in Phase 6) and the `bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False)` guard pattern are the ONLY sanctioned way a verification evaluator checks/records judge-vs-source independence. Task 2 must import and call these exact functions, not reimplement lineage logic.
- **Allowed files per task** are listed under each task below; do not touch files outside those lists without stopping and flagging why in the final report.

## Verified Ground Truth

- `coordinator/app/models/entities.py:48-70` — `Node` columns: `id`, `debate_id`, `parent_id`, `node_type` (`String(16)`, indexed, NO enum/CHECK constraint — free string, confirmed by full-column read), `depth`, `position`, `claim` (`Text`, NOT NULL), `active_generation_id` (nullable `String(36)`, not an FK), `status`, `path_status`, `stopping_status`, `stopping_reason`, `materialized_path`, `created_at`.
- `coordinator/app/models/entities.py:73-91` — `Generation` columns: `id`, `node_id` (FK), `model_id` (`String(120)`, indexed), `role`, `argument` (`Text`, default `""` — this IS the LLM-produced prose, confirmed as the only free-text content field on `Generation`), `prompt_version`, `prompt_rendered`, `tokens_in`, `tokens_out`, `latency_ms`, `is_active` (bool, unique-per-node via `ux_generations_active_per_node`), `worker_id` (FK to `workers`, NOT NULL), `created_at`. No citation/source/evidence field exists on `Generation`.
- `coordinator/app/qbaf/debate_adapter.py:23-30` — confirmed live `node_type` vocabulary via repo-wide grep (dated comment already in the file, "confirmed via grep -rn node_type coordinator/app (2026-07-07)"): `ROOT_CLAIM`, `PRO`, `CON`, and four POV lenses `SCIENTIFIC_POV/STATISTICAL_POV/ETHICAL_POV/PRACTICAL_POV`. `_SUPPORT_TYPES = {"PRO", "SCIENTIFIC_POV", "STATISTICAL_POV", "ETHICAL_POV", "PRACTICAL_POV"}`, `_ATTACK_TYPES = {"CON"}`, `_NO_EDGE_TYPES = {"ROOT_CLAIM"}`.
- `coordinator/app/protocol/verification.py` (full file read verbatim) — `VERIFICATION_VERSION = "verification-v1"`. `classify_verification(claim_type: str) -> str`: returns `"unverifiable_by_kind"` for `claim_type in {"normative", "definitional"}`, else `"pending_verification"` (conservative default for `empirical/causal/prediction/comparative/mixed/unknown`). `verification_statuses(nodes_with_claims) -> dict[node_id, status]` batches this over a list of `{"id", "claim_type"}` dicts. Module docstring EXPLICITLY states: "It does NOT fetch evidence, does NOT generate citations, and does NOT decide whether a claim is actually true or false. Those responsibilities belong to a future phase (P7)." — this is the exact seam Phase 7 fills.
- `coordinator/app/protocol/runner.py` (full file read verbatim) — `_run_protocol_analysis` builds `node_dicts` (`id, parent_id, node_type`) from all non-stale `Node` rows, computes `cross_exam_report`, computes `nodes_with_claims` (`id`, `claim_type` sourced from each scoring item's `claim.claim_type`) and calls `verification_statuses(nodes_with_claims)` to get `verification_map`, then writes ONE `AnalyzerRun(analyzer_type="protocol_analysis", output={..., "verificationStatuses": verification_map, "verificationVersion": "verification-v1", ...})`. The QBAF composition-note literal STRING already says `"tau=judgeStrength|default; verificationModifier=none(P7); modelWeight=constant-1.0(P8)"` — an explicit, pre-existing placeholder marking where Phase 7's verification result should start influencing QBAF tau, confirming this is the intended integration point (though this plan's Task 3 scope is limited to `verificationStatuses` upgrade only — QBAF tau modifier wiring is a LARGER change not requested by this plan's mission text and is flagged as future work, not built here).
- `coordinator/app/scoring/judges.py` (full file read verbatim) — `ScoringProviderRequest(claim: NormalizedClaim, argument_text: str | None, judge_role: str, prompt_version: str = "scoring-provider-v1", timeout_seconds: int = 30, metadata: dict[str, Any])`. `ScoringProviderResult(provider: str, model: str, raw_output: str, latency_ms: int | None, checked_at: str | None, metadata: dict[str, Any])`. `ScoringProvider` is a `Protocol` with one method: `judge_node(request) -> result`. This is the CONFIRMED, sole existing seam for any "ask a model to judge something" call in this codebase — the verification evaluator MUST ride this same interface (per mission instruction), constructing its own `ScoringProviderRequest` (claim = the parent claim's `NormalizedClaim`, evidence content passed via `metadata`, per UNVERIFIED #4).
- `coordinator/app/scoring/service.py:434-553` (`score_node_with_provider`, read verbatim) — CONFIRMED the Phase 6 lineage guard is ALREADY SHIPPED CODE (not just planned) at both the completion-hook site and here: `if bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False) and provider_name and model_name: arguer_family = lineage_family(...); judge_family = lineage_family(...); if both known and equal: return honest "no_independent_judge" error payload`. This confirms `lineage_family`/`bool_env` are live, importable, reusable functions today (`coordinator/app/scoring/lineage.py` and `coordinator/app/core/config.py`), and the exact honest-block pattern (early return with a `NodeScoringError(status="no_independent_judge", ...)`-shaped item, never raising, never silently scoring) that Task 2 must mirror for verification-evaluator judge calls.
- `coordinator/app/scoring/models.py:115-124` — `NormalizedClaim(node_id, raw_text, core_claim, claim_type: ClaimType = "mixed", scope, implied_assumptions, evidence_refs: list[str] = [], ambiguity_flags, key_terms)`.
- `coordinator/app/scoring/normalizer.py:268-293` — `_extract_evidence_refs(text) -> list[str]` is a bare URL regex (`re.compile(r"https?://[^\s\)\]\,]+")`) applied to `core_claim` inside `normalize_claim`. This is the ONLY existing "evidence extraction" precedent in the codebase — confirmed deterministic/regex-based, no LLM call, consistent with the honesty-law style Task 1's extraction parser should follow (deterministic keyword/pattern classifier, not an LLM call).
- `worker/app/adapters/codex_v2_agent_run.schema.json` (full file read verbatim) — `{pros: string[5], cons: string[5], summary: string, confidence: number}`, `additionalProperties: false`. Confirms no evidence/citation field exists in the worker's structured-output contract for PRO/CON argument generation.
- `coordinator/app/models/entities.py:190-200` — `AnalyzerRun(id, debate_id, branch_id, analyzer_type: String(80) indexed, output: JSON dict, status: String(24) default "complete", provenance: JSON dict, created_at)` — confirmed generic, unconstrained JSON-blob run row, already used for `analyzer_type="protocol_analysis"`; safe to add a second `analyzer_type` value (e.g. `"evidence_verification"`) with zero migration.
- `coordinator/app/models/entities.py:265-309, 341-358` (carried over from Phase 6 plan's verified full-file read, re-confirmed live via Phase 6 code now shipped in `service.py`) — `JudgeOutputArtifact` (raw judge output + contract identity: `provider, model, judge_id, judge_version, contract_hash, request_metadata, provider_metadata, assessment` JSON) and `NodeScoringResult` (`provider, model, judge_id, judge_version, contract_hash, provider_metadata JSON, status String(24) default "unavailable", result JSON default dict`) both already carry `judgeLineage`/`arguerLineage`/`independent` per Phase 6 — confirmed real, shipped precedent for "add new consumer-facing keys to an existing JSON column without a migration."
- `coordinator/app/core/config.py:144` — `bool_env(name: str, default: bool) -> bool`; confirmed call-site convention `bool_env("DIALECTICAL_QBAF_DEBUG", False)` at `coordinator/app/scoring/service.py:250` and `bool_env("DIALECTICAL_LINEAGE_INDEPENDENCE", False)` at `coordinator/app/scoring/service.py:508` (both read fresh per call, no caching) — `DIALECTICAL_EVIDENCE_VERIFICATION` must follow the identical shape.
- Web: `web/lib/types.ts:30` — closed TypeScript string-literal union for `node_type`, currently `"ROOT_CLAIM" | "SCIENTIFIC_POV" | "STATISTICAL_POV" | "ETHICAL_POV" | "PRACTICAL_POV" | "PRO" | "CON"`, no `"EVIDENCE"` member. 8 files in `web/` reference `node_type` (`types.ts`, `DebatePageClient.tsx`, `DebateSplit.tsx`, `debatePresentation.ts`, `DebateTree.tsx`, `debateTreeUtils.ts`, `debateTreeUtils.test.mjs`, `ArgumentFocusView.tsx`) — none read in full this pass (see UNVERIFIED #7). Per mission instruction, tree-UI rendering/synthesis-citation surfacing is explicitly DEFERRED to P9 — this plan's web touch is limited to (a) adding `"EVIDENCE"` to the type union so the type stays honest/non-lying about what the API can return, and (b) confirming (not necessarily fixing beyond a filter) that EVIDENCE nodes don't crash existing rendering, per Task 1's `_NO_EDGE_TYPES` filtering choice.
- No existing `judge_role` value other than `"judge"` was found live in any of the 7 files referencing `judge_role` in `coordinator/app` (grepped this pass) — a verification-evaluator `judge_role` (e.g. `"verifier"`) is confirmed NEW, not a precedent-following reuse.

---

### Task 1: EVIDENCE node_type substrate — extraction seam, parser, and honest persistence

**Rationale for scope (per UNVERIFIED #1):** generation payloads contain NO evidence-shaped fields today (confirmed: worker schema is plain `pros`/`cons` strings, and the only "evidence" concept in the coordinator, `NormalizedClaim.evidence_refs`, is a bare URL regex over claim text). This task therefore builds the extraction seam + deterministic parser (in the same honest-regex spirit as `_extract_evidence_refs`) that scans a completed claim node's active `Generation.argument` text for evidence-shaped spans, classifies each by `evidenceKind` (`empirical`/`statistical`/`citation`/`anecdotal`/`unclassified`), and persists each finding as a child `Node(node_type="EVIDENCE")` with its own `Generation` row carrying the extracted text verbatim (never rewritten/summarized/fabricated). A prompt-side change to make workers explicitly separate evidence from argument prose is flagged as a SEPARATE, out-of-scope follow-on task at the end of this task (touches `worker/` files, which this plan does not modify).

**Files:**
- Create: `coordinator/app/evidence/extraction.py` (NEW module: the deterministic extractor + `evidenceKind` classifier; kept separate from the existing `app/evidence/` QBAF-scoring subsystem per UNVERIFIED #2 — do not modify `app/evidence/model.py`, `pipeline.py`, `entailment.py`, `quality.py`, `retraction.py`, `stub.py` in this task)
- Create: `coordinator/tests/test_evidence_extraction.py`
- Modify: `coordinator/app/services/dialectical_v2.py` (wire extraction into the node-completion path — the same place `create_completed_node`/`ensure_default_scoring_for_completed_v2_node` already run post-completion side-effects; confirm exact call site before editing)
- Modify: `coordinator/app/qbaf/debate_adapter.py` (add `"EVIDENCE"` to `_NO_EDGE_TYPES`, per UNVERIFIED #7/#8's conservative filtering choice — evidence children are not yet QBAF argument edges in this phase)
- Modify: `web/lib/types.ts` (add `"EVIDENCE"` to the `node_type` union, per UNVERIFIED #7 — type-honesty only, no rendering change)
- Modify/extend: `coordinator/tests/test_debate_graph_adapter.py` (or wherever `_NO_EDGE_TYPES`/vocabulary exhaustiveness is asserted, per UNVERIFIED #8 — confirm file name before editing)

**Interfaces:**
- `evidence_kind(text: str) -> str`: pure function, deterministic keyword/pattern classifier, no I/O. Checked in this order, first match wins (case-insensitive substring/regex checks over the extracted span, NOT the whole argument):
  - contains a URL (`https?://...`, reuse the exact `_URL_PATTERN` regex from `coordinator/app/scoring/normalizer.py` — do not redefine a divergent pattern) -> `"citation"`
  - contains a percentage (`\d+(\.\d+)?\s*%`) or explicit number-with-unit alongside a statistical keyword (`"study"`, `"survey"`, `"data"`, `"sample"`, `"percent"`, `"statistics"`) -> `"statistical"`
  - contains an empirical-observation keyword (`"study found"`, `"research shows"`, `"experiment"`, `"observed"`, `"measured"`, `"trial"`) without a URL/percentage -> `"empirical"`
  - contains a first-person/hearsay marker (`"in my experience"`, `"i've seen"`, `"anecdotally"`, `"one example is"`) -> `"anecdotal"`
  - no match -> `"unclassified"` (honest fallback — never silently guessed as one of the above).
- `extract_evidence_spans(argument_text: str) -> list[dict]`: pure function, no I/O. Splits `argument_text` into sentences (reuse existing sentence-splitting if any exists in `normalizer.py`; otherwise a simple `. `/`\n` splitter — confirm no existing splitter first), keeps only sentences containing a URL, a percentage/statistical keyword, or an empirical/anecdotal marker (i.e. NOT every sentence becomes an evidence node — only ones matching `evidence_kind`'s non-`"unclassified"` branches; sentences that would classify `"unclassified"` are DROPPED, not persisted as noise). Returns `[{"text": <verbatim sentence text>, "evidenceKind": <classification>}, ...]`, empty list if nothing found (honest — most arguments will have zero evidence spans, and that's fine, they stay `pending_verification` at the claim level).
- `persist_evidence_nodes(db, debate, claim_node, generation) -> list[Node]`: for each span returned by `extract_evidence_spans(generation.argument)`, creates a child `Node(debate_id=debate.id, parent_id=claim_node.id, node_type="EVIDENCE", depth=claim_node.depth+1, position=<index>, claim=span["text"], status="completed", path_status="active")` plus a `Generation(node_id=<new node id>, model_id=generation.model_id, role=generation.role, argument=span["text"], prompt_version=generation.prompt_version, worker_id=generation.worker_id, is_active=True)` (copy-forward of `model_id`/`worker_id`/`role` from the PARENT generation, per UNVERIFIED #9 — honest attribution, not fabricated), sets the new node's `active_generation_id` to the new `Generation.id`, and stores `evidenceKind` on... (implementer: confirm exact storage location before implementing — `Node` has no JSON column; options are (a) a new `Node.evidence_kind` column [migration required, avoid], or (b) store `evidenceKind` inside a JSON-ish field that doesn't exist on `Node` either. Re ground-truth: `Node` has NO JSON column at all. Simplest migration-free path: store `evidenceKind` in `Generation.prompt_version` is a misuse; instead, this plan proposes storing it as a `provenance`-style JSON blob on a lightweight new `AnalyzerRun`-style row is overkill for per-node metadata. RESOLUTION: `NodeScoringResult` is keyed to a node and has a free JSON `result` column with default-`{}` and does NOT require a real judge to exist yet — but writing a `NodeScoringResult` row for an unscored EVIDENCE node before Task 2 runs would be misleading (implies a scoring attempt happened). Cleanest honest option given zero migration budget: extend `Node.materialized_path`-style text field is also a misuse. **Implementer must re-check for a currently-unused JSON-capable column on `Node`/`Generation` one more time before writing code; if truly none exists, this is the ONE piece of Task 1 that may legitimately require a minimal additive migration** (e.g. `Node.metadata: JSON default dict` — small, additive, nullable-safe, inspector-guarded per the `0009`-style pattern) — flag this explicitly in the Step-1 failing test and get this confirmed/approved before Step 3's implementation, rather than silently picking one of the above misuse options.)
- This task does NOT gate anything on `DIALECTICAL_EVIDENCE_VERIFICATION` — extraction/persistence is unconditional per Global Constraints (always-on, harmless substrate).
- Follow-on (explicitly OUT OF SCOPE, flag in final report, do not implement): a worker-prompt/schema change (`worker/app/adapters/codex_v2_agent_run.schema.json` + whatever renders the prompt) to have the LLM emit a distinct `citations`/`evidence` array at generation time, which would let Task 1's extractor eventually operate on structured data instead of regex-over-prose. Name this explicitly as a candidate Phase 7.5/8 ticket in the final report.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_evidence_extraction.py`:

```python
from app.evidence.extraction import evidence_kind, extract_evidence_spans


def test_evidence_kind_recognizes_citation_via_url() -> None:
    assert evidence_kind("See https://example.org/study for details.") == "citation"


def test_evidence_kind_recognizes_statistical() -> None:
    assert evidence_kind("A survey found that 62% of respondents agreed.") == "statistical"


def test_evidence_kind_recognizes_empirical() -> None:
    assert evidence_kind("A controlled trial observed a measurable reduction in outcomes.") == "empirical"


def test_evidence_kind_recognizes_anecdotal() -> None:
    assert evidence_kind("In my experience, this policy caused confusion locally.") == "anecdotal"


def test_evidence_kind_unclassified_is_honest_fallback_not_guessed() -> None:
    assert evidence_kind("This claim is simply true because it is obviously correct.") == "unclassified"


def test_extract_evidence_spans_drops_unclassified_sentences() -> None:
    argument = (
        "This policy is clearly the right choice. "
        "A 2023 study found that 40% of participants reported improved outcomes. "
        "In my experience, similar policies have worked well locally."
    )
    spans = extract_evidence_spans(argument)
    assert len(spans) == 2
    kinds = {span["evidenceKind"] for span in spans}
    assert kinds == {"statistical", "anecdotal"}
    assert all(span["text"] in argument for span in spans)  # verbatim, never rewritten


def test_extract_evidence_spans_returns_empty_list_when_no_evidence_present() -> None:
    argument = "This is simply the correct position and everyone should agree."
    assert extract_evidence_spans(argument) == []
```

Add to a DB-backed test file (implementer: locate the existing fixture/helper that builds a completed `Node` + active `Generation`, e.g. following the same pattern used in `coordinator/tests/test_node_scoring.py` or wherever `create_completed_node` is already exercised — do not hand-build fake JSON):

```python
def test_persist_evidence_nodes_creates_evidence_children_with_copied_attribution(db) -> None:
    # Build a debate + completed claim Node with an active Generation whose
    # argument contains one statistical-shaped sentence.
    ...
    evidence_nodes = persist_evidence_nodes(db, debate, claim_node, generation)
    assert len(evidence_nodes) == 1
    assert evidence_nodes[0].node_type == "EVIDENCE"
    assert evidence_nodes[0].parent_id == claim_node.id
    evidence_generation = db.get(Generation, evidence_nodes[0].active_generation_id)
    assert evidence_generation.argument in generation.argument  # verbatim substring, not fabricated
    assert evidence_generation.model_id == generation.model_id  # honest attribution, copied not invented
    assert evidence_generation.worker_id == generation.worker_id


def test_persist_evidence_nodes_returns_empty_list_when_argument_has_no_evidence(db) -> None:
    ...
    evidence_nodes = persist_evidence_nodes(db, debate, claim_node, generation)
    assert evidence_nodes == []
```

(Implementer: replace `...` with real fixture calls per existing conventions. If Step-1's investigation confirms a migration is genuinely required for `evidenceKind` storage per the Interfaces note above, add a corresponding test against the new column BEFORE writing the migration, and get explicit sign-off flagged in the report rather than silently proceeding.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_evidence_extraction.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`ModuleNotFoundError` — `app/evidence/extraction.py` does not exist yet).

- [ ] **Step 3: Implement**

Implement `evidence_kind`, `extract_evidence_spans`, `persist_evidence_nodes` per the Interfaces section above. Resolve the `evidenceKind` storage question (flagged above) BEFORE writing `persist_evidence_nodes` — re-grep `Node`/`Generation` columns one more time for any unused JSON-capable field; if a migration is truly required, write it as its own sub-step modeled on `coordinator/migrations/versions/0009_contract_keyed_cache_identity.py`'s inspector-guarded pattern, and call this out explicitly (this is the ONE place in this plan where a migration may be unavoidable — confirm, don't assume). Wire `persist_evidence_nodes` into the node-completion path in `dialectical_v2.py` (confirm exact call site — likely alongside `ensure_default_scoring_for_completed_v2_node`). Add `"EVIDENCE"` to `_NO_EDGE_TYPES` in `debate_adapter.py`. Add `"EVIDENCE"` to the `node_type` union in `web/lib/types.ts`.

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_evidence_extraction.py tests/test_debate_graph_adapter.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass.

- [ ] **Step 5: Report status (no commit).** Flag: whether a migration was genuinely required for `evidenceKind` storage (and its exact shape if so), the exact node-completion call site wired, and explicitly name the worker-prompt-change follow-on as future/out-of-scope work. Move to Task 2.

---

### Task 2: Verification evaluator — real judge-provider verdicts per evidence node

**Files:**
- Create: `coordinator/app/evidence/verification_evaluator.py`
- Modify: `coordinator/app/core/config.py` (only if a settings-object convention wraps `bool_env` elsewhere — otherwise no change needed, call `bool_env` directly matching precedent)
- Create: `coordinator/tests/test_verification_evaluator.py`

**Interfaces:**
- New flag: `DIALECTICAL_EVIDENCE_VERIFICATION` read via `bool_env("DIALECTICAL_EVIDENCE_VERIFICATION", False)` at the evaluator's entry point, read fresh per call (matching `DIALECTICAL_LINEAGE_INDEPENDENCE`'s testability convention).
- `evaluate_evidence_verdict(db, debate, claim_node, evidence_node, provider: ScoringProvider, *, judge_role: str = "verifier") -> dict`: the core evaluator for ONE evidence node.
  1. If `bool_env("DIALECTICAL_EVIDENCE_VERIFICATION", False)` is `False`: return `{"status": "pending", "reason": "verification_disabled"}` immediately — no provider call, no side effects (mirrors Phase 6's flag-off no-op precedent).
  2. Resolve the claim node's active `Generation` (arguer lineage source, same pattern as `score_node_with_provider`) and the evidence node's own active `Generation` (the extracted text + copied-forward `model_id`/`worker_id` from Task 1).
  3. Apply the Phase 6 lineage guard BEFORE calling the provider: `arguer_family = lineage_family(claim_generation.model_id if claim_generation else None)`; `judge_family = lineage_family(getattr(provider, "model", None))`. If both known and equal: return `{"status": "unverifiable", "reason": "no_independent_judge"}` (never call the provider, never fabricate a verdict) — reuse `lineage_family` from `app.scoring.lineage`, import, do not reimplement.
  4. Construct `ScoringProviderRequest(claim=normalize_claim(node_id=claim_node.id, raw_text=claim_node.claim), argument_text=claim_generation.argument if claim_generation else None, judge_role=judge_role, metadata={"evidence_text": evidence_node.claim, "evidence_kind": <evidenceKind from Task 1's storage>})` (per UNVERIFIED #4 — evidence content rides in `metadata`, not `argument_text`).
  5. Call `provider.judge_node(request)` inside the SAME retry/timeout/`ProviderError` handling shape as `score_node_with_provider` (reuse the try/except structure; do not invent a different error-handling convention). On `TimeoutError`/`ProviderError`/any parse failure: return `{"status": "unverifiable", "reason": "<honest reason string, e.g. 'verification_judge_call_failed'>"}` — NEVER default to `"supported"`.
  6. On success, parse `result.raw_output` for a verdict. The verifier's judge contract (prompt/schema, out of this plan's Python-code scope to author from scratch here but MUST exist for the provider call to mean anything — flag in report if no verifier-role prompt exists yet per UNVERIFIED #6) must yield one of exactly `"supported"` / `"contradicted"` / `"unverifiable"` (never a 4th value; if parsing yields anything else, treat as `"unverifiable"` with reason `"unparseable_verdict"` — honest, never silently coerced to `"supported"`).
  7. Record `judge_lineage_metadata(arguer_model_id=claim_generation.model_id if claim_generation else None, judge_provider=getattr(provider, "provider", None), judge_model_id=getattr(provider, "model", None))` (reused verbatim from Phase 6) alongside the verdict.
  8. Persist as an `AnalyzerRun(analyzer_type="evidence_verification", output={"evidenceNodeId": evidence_node.id, "claimNodeId": claim_node.id, "status": <verdict>, "reason": <reason or None>, **lineage_metadata}, status="complete", provenance={"judge_role": judge_role})` (per UNVERIFIED #3's resolution) — NOT a `NodeScoringResult` row (that stays reserved for claim-level QBAF scoring).
- `rollup_claim_verification_status(evidence_verdicts: list[str]) -> str`: pure function. Given a list of per-evidence-node verdict strings (`"supported"`/`"contradicted"`/`"unverifiable"`/`"pending"`) for one claim: any `"contradicted"` present -> `"contradicted"`; else any `"supported"` present -> `"supported"`; else -> `"pending"` (matches mission's rollup rule exactly). Empty list -> `"pending"` (honest — no evidence means nothing to roll up).
- Normative/definitional claims (per P5b's `classify_verification`) are NEVER passed to `evaluate_evidence_verdict` at all — the evaluator's caller (Task 3) must check `classify_verification(claim_type) != "unverifiable_by_kind"` before invoking evaluation for a claim's evidence children.

- [ ] **Step 1: Write failing tests first**

Create `coordinator/tests/test_verification_evaluator.py`:

```python
def test_rollup_claim_verification_status_contradicted_wins() -> None:
    assert rollup_claim_verification_status(["supported", "contradicted", "pending"]) == "contradicted"


def test_rollup_claim_verification_status_supported_when_no_contradiction() -> None:
    assert rollup_claim_verification_status(["supported", "unverifiable"]) == "supported"


def test_rollup_claim_verification_status_pending_when_nothing_resolved() -> None:
    assert rollup_claim_verification_status(["unverifiable", "pending"]) == "pending"


def test_rollup_claim_verification_status_pending_when_empty() -> None:
    assert rollup_claim_verification_status([]) == "pending"


def test_evaluate_evidence_verdict_is_noop_pending_when_flag_off(db, monkeypatch) -> None:
    monkeypatch.delenv("DIALECTICAL_EVIDENCE_VERIFICATION", raising=False)
    ...  # real claim_node + evidence_node fixtures per Task 1's persist_evidence_nodes
    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)
    assert result["status"] == "pending"
    assert result["reason"] == "verification_disabled"


def test_evaluate_evidence_verdict_blocks_same_lineage_judge_when_enabled(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    # claim_generation.model_id and fake_provider.model in the SAME family (e.g. both "claude-...")
    ...
    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)
    assert result["status"] == "unverifiable"
    assert result["reason"] == "no_independent_judge"


def test_evaluate_evidence_verdict_records_real_verdict_from_independent_judge(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    # claim_generation.model_id and fake_provider.model in DIFFERENT families,
    # fake_provider.judge_node returns raw_output parseable to "supported".
    ...
    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, fake_provider)
    assert result["status"] == "supported"
    run = <fetch the persisted AnalyzerRun with analyzer_type="evidence_verification">
    assert run.output["evidenceNodeId"] == evidence_node.id
    assert run.output["independent"] is True


def test_evaluate_evidence_verdict_honest_unverifiable_on_provider_failure(db, monkeypatch) -> None:
    monkeypatch.setenv("DIALECTICAL_EVIDENCE_VERIFICATION", "true")
    # fake_provider.judge_node raises ProviderError.
    ...
    result = evaluate_evidence_verdict(db, debate, claim_node, evidence_node, failing_provider)
    assert result["status"] == "unverifiable"
    assert result["reason"] != "supported"  # never silently coerced
```

(Implementer: fill in `...` using real fixtures established in Task 1, plus a `FakeProvider` matching the `ScoringProvider` protocol per existing test conventions in `test_node_scoring.py`. No fake JSON standing in for real computation — the FakeProvider itself is a legitimate test double for the Protocol boundary, consistent with existing tests.)

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_verification_evaluator.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (`ModuleNotFoundError` — module does not exist yet).

- [ ] **Step 3: Implement**

Implement `evaluate_evidence_verdict` and `rollup_claim_verification_status` per the Interfaces section. Import and reuse `lineage_family`, `judge_lineage_metadata` from `app.scoring.lineage`; `bool_env` from `app.core.config`; `ScoringProviderRequest`/`ScoringProvider` from `app.scoring.judges`; `normalize_claim` from `app.scoring.normalizer`. Resolve UNVERIFIED #6 (whether a new `JudgeContract` registration is needed) before finalizing — if the evaluator skips contract-based caching, document why in a code comment referencing this plan.

- [ ] **Step 4: Verify pass**

Run: `cd coordinator && python -m pytest tests/test_verification_evaluator.py tests/test_lineage.py tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: all pass except pre-existing known failures re-baselined at phase start.

- [ ] **Step 5: Report status (no commit).** Flag UNVERIFIED #2 (whether `EvidenceStatus` should have been reused instead — decision made: no, new smaller vocabulary), #3 (`AnalyzerRun` chosen as persistence target), #4 (`metadata` chosen to carry evidence text), #5 (guard duplicated rather than routed through `score_node_with_provider`), #6 (whether a verifier `JudgeContract` was registered). Move to Task 3.

---

### Task 3: Protocol integration — `verificationStatuses` consumes real verdicts, falls back to P5b classifier

**Files:**
- Modify: `coordinator/app/protocol/runner.py`
- Modify/extend: `coordinator/tests/test_protocol_runner.py` (confirm exact test file name before editing — grep for existing `run_protocol_analysis`/`_run_protocol_analysis` tests first)

**Interfaces:**
- In `_run_protocol_analysis`, after computing `nodes_with_claims` and BEFORE calling `verification_statuses(nodes_with_claims)` for the fallback map: for each claim node whose `classify_verification(claim_type) != "unverifiable_by_kind"`, query any persisted `AnalyzerRun(analyzer_type="evidence_verification")` rows whose `output["claimNodeId"]` matches this node, collect their `output["status"]` values, and if at least one exists, compute `rollup_claim_verification_status([...])` and use THAT as the node's entry in the final `verification_map` INSTEAD OF the P5b fallback (`"pending_verification"`/`"unverifiable_by_kind"`) value. Claims with NO persisted verification-evaluator runs keep the existing P5b fallback value unchanged (no behavior change for claims Task 2 never touched — this is the confirmed "falling back to the P5b kind-classifier for the rest" mission instruction).
- Normative/definitional claims (`classify_verification(...) == "unverifiable_by_kind"`) are NEVER overridden by real verdicts, even if an `AnalyzerRun` somehow exists for them (defense-in-depth — Task 2's caller should never have evaluated them, but the runner must not trust that invariant blindly; check `claim_type` again here).
- `qbafOutput["compositionNote"]`'s `"verificationModifier=none(P7)"` substring is INTENTIONALLY left unchanged in this task — QBAF tau modifier wiring from verification verdicts is explicitly out of scope (flagged in Verified Ground Truth above); do not touch QBAF computation in this task.
- This lookup is always-on (no `DIALECTICAL_EVIDENCE_VERIFICATION` gate here) — Task 3 just reads whatever real verdicts exist; if the flag was off in Task 2, no `AnalyzerRun` rows of this type will exist, and behavior is byte-identical to before this phase.

- [ ] **Step 1: Write failing tests first**

Add to the protocol runner test file (implementer: confirm real file/fixture names before writing):

```python
def test_verification_statuses_uses_real_verdict_when_available(db) -> None:
    # Real debate + claim Node (empirical claim_type) with a persisted
    # AnalyzerRun(analyzer_type="evidence_verification", output={"claimNodeId": ..., "status": "supported", ...}).
    ...
    run_protocol_analysis(db, debate)
    latest = <fetch latest AnalyzerRun(analyzer_type="protocol_analysis") for this debate>
    assert latest.output["verificationStatuses"][claim_node.id] == "supported"


def test_verification_statuses_falls_back_to_kind_classifier_when_no_verdict_exists(db) -> None:
    # Real debate + claim Node (empirical claim_type), NO evidence_verification AnalyzerRun exists.
    ...
    run_protocol_analysis(db, debate)
    latest = <fetch latest AnalyzerRun(analyzer_type="protocol_analysis")>
    assert latest.output["verificationStatuses"][claim_node.id] == "pending_verification"


def test_verification_statuses_never_overrides_normative_claims(db) -> None:
    # Real debate + claim Node (normative claim_type) EVEN IF a stray
    # evidence_verification AnalyzerRun exists pointing at it (defense-in-depth).
    ...
    run_protocol_analysis(db, debate)
    latest = <fetch latest AnalyzerRun(analyzer_type="protocol_analysis")>
    assert latest.output["verificationStatuses"][claim_node.id] == "unverifiable_by_kind"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd coordinator && python -m pytest tests/test_protocol_runner.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`
Expected: FAIL (real-verdict lookup not wired yet; first two assertions may coincidentally pass/fail depending on current fallback behavior — the normative-override-defense test and the real-verdict test are the load-bearing new failures).

- [ ] **Step 3: Implement**

Modify `_run_protocol_analysis` per the Interfaces section: query `AnalyzerRun` rows with `analyzer_type="evidence_verification"` for the debate, build a `claim_node_id -> [status, ...]` map, then for each entry in `verification_map` where `classify_verification` did NOT return `"unverifiable_by_kind"` and a real-verdict list exists for that node, overwrite with `rollup_claim_verification_status(...)`.

- [ ] **Step 4: Verify pass + full-suite rerun**

Run (single foreground call, one shot, do not loop):
`cd coordinator && python -m pytest tests/test_evidence_extraction.py tests/test_verification_evaluator.py tests/test_protocol_runner.py tests/test_debate_graph_adapter.py tests/test_lineage.py tests/test_node_scoring.py -v --basetemp=.tmp/pytest-claude -o cache_dir=.tmp/pytest-cache-claude -p no:cacheprovider`

Expected: all pass except pre-existing known failures re-baselined at phase start. If a NEW failure appears, fix the root cause before reporting done — do not weaken a pre-existing test to paper over a real regression. If the run times out once, report BLOCKED — do not retry in a sleep loop.

- [ ] **Step 5: Report status (no commit)**

Do not commit. Report: file paths touched, test results, and explicitly flag as follow-on/deferred work (product sign-off needed before further build-out):
- The worker-prompt-schema change to make evidence generation structured instead of regex-extracted (Task 1 follow-on).
- Any migration added for `evidenceKind` storage (Task 1 Step 3), if proven necessary.
- QBAF tau modifier wiring from verification verdicts (`compositionNote`'s `verificationModifier=none(P7)` placeholder — still `none` after this phase, by design).
- Synthesis citation surfacing and tree-UI verdict rendering — explicitly deferred to P9 per mission instruction; this phase's web touch is limited to the `node_type` type-union addition.
- Whether a dedicated `verifier` `JudgeContract` should be registered (UNVERIFIED #6) for audit-trail parity with claim scoring.
