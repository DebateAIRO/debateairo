# PROG-06 Hermes stage verdict — `eval-06-addon`

Mission: `model-evaluator`  
Lane: `codex/eval-06-addon`  
Verified head: `40a7eea` on `342eefa` / `ebdff73` over `dev`  
Verdict: **APPROVED**

## Review chain and ruling basis

I read all six pre-existing `PROG-06-*.md` review artifacts. Round 1 split: seat A ordered four changes for the real SQL retry-ceiling proof, attempt-budget ordering, missing preflight receipts, and explicit escalation of the Architecture §3.4 divergence; seat B passed the delivered surface while carrying the concurrency race and the same architecture amendment. Commit `342eefa` closed the four round-1 blockers. Round 2 then returned dual REWORK after both seats independently proved that the session advisory lock held one pool client while its callback checked out another, deadlocking the max-10 pool at and above its ceiling even for distinct runs. Commit `40a7eea` replaced the blocking lock with a try-lock and threaded the lock-owning client through repository work. Round 3 returned dual PASS.

## Independent verification

All commands ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-06-addon/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Full repository suite | `pnpm test` | PASS; 92 files / 682 tests, exit 0 |
| Focused add-on suites | `pnpm exec vitest run tests/unit/evaluator-addon.test.ts tests/integration/evaluator-addon-database.test.ts` | PASS; 2 files / 18 tests, exit 0 |
| Required focused spot-check | `pnpm exec vitest run ... -t 'blinded call\|same-maker grader\|different maker\|twelve same-run\|twelve distinct-run'` | PASS; 5 selected tests across 2 files |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |
| Lane state | `git status --short --branch` | Clean `codex/eval-06-addon` worktree |

## Required spot-checks

### Above-pool-max concurrency — PASS

Both regressions create a dedicated PostgreSQL pool with `max: 10` and `connectionTimeoutMillis: 250`, then drive 12 concurrent invocations through the real worker and repository.

- Same-run shape: one invocation grades, eleven return and persist `ADDON_PASS_IN_FLIGHT`, the gateway is called exactly once, and a subsequent `SELECT 1` proves the pool remains usable.
- Distinct-run shape: all twelve runs grade, twelve total gateway calls occur, and the same recovery query succeeds.

The implementation uses `pg_try_advisory_lock`, releases losers immediately, and passes the winner's `PoolClient` into candidate, receipt, and observation operations. The add-on repository call graph therefore performs no nested pool checkout while the advisory lock is held. Unlock failure destroys the session with `release(error)` rather than returning a potentially lock-bearing connection to the pool.

### Blinding — PASS

The focused unit test captures the exact `ProviderGateway.call` request. Its serialized user payload is an allowlist-only DTO containing opaque sample id, question excerpt, task excerpt, grade, and selected reasons. It contains no maker, provider, model, artifact, lineage, or provenance field. The provider call is null-run-scoped with `subjectItemId` under `evaluator:addon-attempt:*`, and the successful observation records the graded and grader artifact references only after the model boundary.

### Lineage guards — PASS

The focused embedded-PostgreSQL suite accepts a null-run grader artifact from a different maker and rejects a null-run same-maker artifact with `PRODUCER_GRADING_FORBIDDEN`. The unit suite separately proves the code-level pre-call same-maker refusal makes zero gateway calls and writes zero observations. The migration's remaining lineage arm requires the graded artifact to belong to the product run.

### Retry and fault accounting — PASS

The same focused run exercised the live SQL-backed ceiling: three failed passes produce three distinct `STARTED` attempts and three provider calls; the fourth invocation returns `ADDON_RETRY_LIMIT_REACHED` without another call. Three deployment-isolation faults produce only non-counted skips, after which corrected configuration successfully grades. Invalid policy and family/register mismatch paths persist typed receipts and permit the intended recovery.

## Ratification — migration 0026 / Architecture §3.4

**RATIFIED.** Migration 0026's change from `grader_run IS DISTINCT FROM NEW.run_id` to `grader_run IS NOT NULL` is the required trigger semantics under the already-ratified null-run evaluator scope. `ProviderGateway.call` receives `runId: null`, so lawful grader evidence necessarily has `ledger.raw_artifact.run_id IS NULL`. The original §3.4 predicate would reject every real add-on insert. The amended trigger still requires the graded artifact to belong to `NEW.run_id` and still rejects equal makers.

This is a documentation amendment, not a relaxation of the lineage rule. I amended binding Architecture §3.4 to show `grader_run IS NOT NULL`, added the ratification explanation, and amended §5.3 to state that grader evidence is evaluator/null-run-scoped while graded evidence remains product-run-scoped.

## Selector carry-forward and board custody

Seat-B N5 is recorded on `eval-10-seatshare` (`t_ad2ce05d`) together with PROG-04 F3. A production `ProviderGateway` sharing the evaluator repository pool would reintroduce nested checkout because gateway evidence writes occur while the add-on holds its lock client; seat B measured deadlock at 14 concurrent distinct-run calls on a max-10 pool. Selector wiring must use a separate gateway pool or thread the lock-owning client through gateway evidence writes. The composition root must also source the evaluator isolation set from the register before bind.

Board custody is complete:

- `eval-06-addon` (`t_2041f591`) is done with the verified head, test counts, and migration ratification recorded;
- `eval-07-profiles` (`t_fd6d411d`) is ready;
- ticket 07 retains the binding handoff that a settlement observation naming `supersedes_observation_id` REPLACES the consensus observation in derivation — never pool, average, or count both — while the superseded row remains append-only audit history;
- matching wayfinder tickets now record lane 06 done, lane 07 ready, and the selector constraints.

## Decision

The dual-PASS round-3 chain is supported by independent typecheck and 682-test repository verification. The 12-way same-run and distinct-run regressions both pass above the max-10 pool ceiling, blinding and code/DB maker guards are real, retries are evaluator-owned and bounded, and migration 0026 is ratified as the only trigger compatible with the null-run isolation law. No blocker remains.

HERMES STAGE VERDICT: LANE eval-06 APPROVED
