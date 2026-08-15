# PROG-04 review 2 — opus2 seat (second independent reviewer, substituting Grok per V's outage ruling)

Lane: `codex/eval-04-tagger` @ `670ac9a` ("fix(evaluator): isolate tag attempts from product runs")
Rework range reviewed: `c15690f..670ac9a` (6 files, +461/-58; no migration changes)
Round-1 review: `PROG-04-opus2-review-1.md` (PASS + carry-forward F-1, non-blockers F-2…F-5)
Independence: no other reviewer's file opened in either round.

**VERDICT: PASS.** F-1 is closed by construction and I verified it through the real production gateway; F-2, F-4 and F-5 are closed; the round-1 PASS surface is intact. F-3 is unchanged and stays a non-blocking recommendation. Five new observations, none blocking.

---

## 1. What I ran (round 2)

| Check | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` (architecture + source audits) | 27 edge rows, no violations; no blocking orphans |
| `pnpm run generate:contract` | **no tree diff** — the shared-vocabulary widening does not touch the generated contract |
| `pnpm vitest run` (full suite) | 85 files, 628 tests passed (+9 over the r1 baseline, matching the 9 new lane tests) |
| My own round-2 scratch suite (13 cases, embedded PostgreSQL, real `createPostgresProviderGateway`) | 13 passed |

My scratch file was deleted afterwards; `git status --porcelain` in the worktree is empty. No commits, no pushes, nothing written outside my two output files.

## 2. F-1 — closed by construction, verified end-to-end

The fix decouples the tag attempt from the product run scope: `provider.call` now receives `runId: null` and `subjectItemId: evaluator:tag-attempt:<attemptId>`, and `assertAdmissionArtifact` correspondingly expects `run_id IS NULL` for any artifact whose `provider_ref` is the evaluator ref (`expectedRunId = artifactRow?.provider_ref === EVALUATOR_PROVIDER_REF ? null : input.runId`). Because `detectProviderModelVersionTriggers` filters `WHERE run_id IS NOT NULL`, evaluator artifacts leave the scan's universe entirely — construction, not a filter that a future scan could forget.

I did not take that on trust. I re-ran my round-1 reproduction against the **real production wiring** — `createPostgresProviderGateway` from `apps/runner` with the real `LedgerRepository` persistence, stubbing only `fetch` — so the artifacts were written by production code, not by my INSERTs:

1. ask-time tag on container version `local/evaluator@1` → model refuses → run untagged;
2. reconciliation after an upgrade to `local/evaluator@2` → run tagged (basis `BACKFILL`);
3. observed: both `ledger.raw_artifact` rows and both `ledger.ledger_entry` rows carry `run_id = NULL`;
4. `detectProviderModelVersionTriggers()` → **0**, and `core.revision_trigger` for the product run is **empty**.

Negative control in the same run of the same file: the identical two artifacts inserted *with* the product `run_id` still fire exactly one `provider-model-version:provider:evaluator-vllm:ctl@2` trigger. So my round-1 reproduction was sound, and the null `run_id` is precisely what closes it.

The lane also added its own regression test for this (`does not fire product liveness when evaluator tags span model versions`), driven through the same real gateway and asserting both artifact and ledger `run_id` are null — the finding is now defended by a test in-tree, which is what I wanted.

**Bonus closure I verified but had not asked for:** `createPostgresProviderGateway` guards `if (request.runId !== null) await budget.assertModelAttemptAllowed(request.runId)`. With `runId: null` the tag call no longer touches the product run's model-attempt budget; I confirmed a tagged run has zero `MODEL_CALL` ledger entries against it. That closes a second influence path (evaluator enrichment consuming or being gated by a product cost envelope) that neither of my round-1 findings had named. The lane's own `keeps the asker-visible execution digest byte-identical with tagging off versus on` test closes a third, at the serve layer.

Deliverable cost: none. The evaluator link still lands (`question_domain` basis `BACKFILL`), and `evaluator.domain.source_run_id` still records the product run as evaluator-owned correlation metadata, so FR-1.1 AC3 provenance is intact — I re-verified a grown row carries `origin=GROWN`, `source_run_id`, `proposal_raw_artifact_ref` and `provenance_ref`.

## 3. Round-1 non-blockers

- **F-2 (pre-`try` failures escaped the typed contract) — closed.** Input validation, `listDomains`, the `STARTED` receipt and the worker's run lookup are now all guarded, returning `TAGGER_INPUT_INVALID`, `TAGGER_PREFLIGHT_FAILED` and `TAGGER_RUN_UNRESOLVED`; `recordTerminalEvent` swallows receipt-store failures with an explicit comment. Verified all four myself, including a repository whose `listDomains` throws and one whose receipt store fails *after* `STARTED` — the latter still returns `TAGGED` rather than throwing. Failure taxonomy also gained real resolution: `TAGGER_PROVIDER_TIMED_OUT` (via `ProviderCallFailedError.lastOutcome`) and `TAGGER_CONTENT_REFUSED` (via `ProviderContentUnacceptedError` / typed `EVALUATOR_TAGGER_OUTPUT_INVALID`) instead of one generic bucket; `parseTaggerDecision` no longer leaks a raw zod/JSON throw.
- **F-4 (duplicate admission receipt on retry) — closed.** A `readQuestionDomain` pre-flight short-circuits with `SKIPPED/TAGGER_ALREADY_TAGGED` before any provider call. I confirmed a second attempt on a tagged run leaves exactly one admission row and one link, and makes no model call.
- **F-5 (unresolved id left no receipt; `JUDGE` role) — closed.** `admitExistingDomainSelection` now writes a `REFUSED` receipt with reason `EVALUATOR_DOMAIN_SELECTION_UNRESOLVED:<id>` instead of throwing, so the tagger reports `TAGGER_ADMISSION_REFUSED` and the misbehaviour is auditable in the same table as blank proposals — verified. The call site now uses `role: "CLASSIFIER"` / `lane: "evaluator"`, added to `MODEL_ROLES`/`Lane`.
- **F-3 (isolation input is caller-supplied, not register-sourced) — unchanged, still non-blocking.** Same tier-0 precedent as `runEvaluatorCatalogProbe`; recommend sourcing the configured set at the composition root before bind so the guarantee is structural rather than argument-shaped.

## 4. Round-1 PASS surface — re-verified against the reworked code

All re-run through the real gateway: the classifier matrix (`SELECT_EXISTING`, case-variant forced onto the existing id, genuinely-new growth, near-duplicate refusal, model refusal) with registry counts checked at every step; grown-row provenance; eight hostile/injection-shaped outputs (injected payload as `proposed_name`, SQL-shaped name, word-count abuse, hallucinated id, prose, wrong literal, extra key under the strict schema, JSON array) all writing nothing and leaving the run untagged; foreign-maker rejection; product-artifact laundering still refused with `EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH`; `memory.question_key` full-row snapshot identical across a successful tag; container-down and isolation-collision degradation with typed `FAILED` receipts. No `BOUND` state, no key material, no migration change in the rework range, no non-evaluator behaviour altered beyond the additive vocabulary in §5 N-2.

## 5. New observations (none blocking)

- **N-1.** With `expectedRunId` null for evaluator artifacts, the DB no longer ties the cited artifact to *this* run — an evaluator artifact from another tag attempt would satisfy `assertAdmissionArtifact` if a caller passed it. Not model-reachable (the ref comes from the response of the call just made) and product artifacts are still refused, which I verified; this is the unavoidable cost of the isolation. If lane 05 needs a stronger tie, correlate on the attempt id rather than restoring `run_id`.
- **N-2.** `MODEL_ROLES` gains `CLASSIFIER` and `Lane` gains `evaluator` in the shared `packages/providers`. I checked this is inert: neither vocabulary has any runtime consumer repo-wide (settlement's `routeServedLane` uses its own unrelated lane strings), no migration CHECK references them, and `generate:contract` yields no diff. Additive and correct — better than reusing `JUDGE`.
- **N-3.** `TAGGER_ALREADY_TAGGED` is returned with `state: "UNTAGGED"` for a run that *is* tagged; a caller branching only on `state` would misread it. Naming nit, worth a doc line or a distinct state.
- **N-4.** The `readQuestionDomain` pre-flight is TOCTOU: two concurrent attempts can both pass it, and the loser degrades to `TAGGER_EXECUTION_FAILED` on the `question_domain.run_id` UNIQUE. Correctness is preserved by the constraint; only the receipt reads oddly.
- **N-5.** Because `recordTerminalEvent` swallows receipt failures, a successful tag can exist with no `SUCCEEDED` pipeline event. Right trade-off for enrichment, but lane 05 must not treat the pipeline event as the authoritative record of tagging — `evaluator.question_domain` is.

## 6. Merge gate

Container-up / container-down / refusal ✓; memory-no-op ✓; FR-0.6 AC5 differential ✓; repository typecheck ✓; architecture + source audits ✓; contract generation clean ✓; full 628-test suite ✓. Constraints honoured: local commits only, no push, no board mutation, no `BOUND`, DR-179 clean.
