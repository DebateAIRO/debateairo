# PROG-09 Hermes stage verdict — `eval-09-consumer`

Mission: `model-evaluator`  
Lane: `codex/eval-09-consumer`  
Verified implementation commits: `4f0356a` + `9650a00`  
Verdict: **APPROVED**

## Review chain and ruling basis

I read every `PROG-09-*.md` review artifact present before this verdict. Round 1 was REWORK: the consumer hand-built blinded samples instead of using the shared helper, the real sample-to-prompt path lacked coverage, self-routing refusal was not a named typed domain error, and the lock path lacked an above-pool-max concurrency regression. Commit `9650a00` addressed those blockers. Both independent round-2 reviews returned PASS.

## Independent verification

All executable checks ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-09-consumer/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Full repository tests | `pnpm exec vitest run` | PASS; 98 files, 711 tests, 0 failures |
| Focused consumer verification | `pnpm exec vitest run tests/unit/evaluator-consumer.test.ts tests/unit/evaluator-foundation.test.ts tests/integration/evaluator-consumer-database.test.ts --reporter=verbose` | PASS; 3 files, 27 tests, 0 failures |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |
| Declared commits | `git merge-base --is-ancestor` for `4f0356a` and `9650a00` | PASS; both are ancestors of the tested lane head |

The tested branch head was `299b406`, a documentation-only evidence refresh above the declared implementation tip `9650a00`. The worktree remained clean.

## Required spot-checks

### Shared helper is the production construction path

`packages/evaluator/src/blind-sample.ts:24` owns `createBlindEvaluationSample`. The lane-06 add-on calls it from `packages/evaluator/src/index.ts:535`, and the consumer repository calls the same helper at `packages/evaluator/src/consumer-postgres.ts:162`. A production-source scan found no direct object construction assigned into `blindedSamples`; the helper is the sole production construction path for these grading-adjacent sample DTOs.

The real repository query joins observation, reduced judgement, node, and run, then passes the approved fields to the helper before attaching the result to a consumer job (`consumer-postgres.ts:140-168`). The focused real-PostgreSQL test passed with a non-empty blinded prompt path.

### Self-routing is a typed, named refusal

`packages/evaluator/src/consumer.ts:227-231` detects numeric or routing fields and throws `TypedDomainError("SELF_ROUTING_FORBIDDEN", ...)`. The terminal receipt mapping preserves that distinct reason at `consumer.ts:511-514`. Focused unit and real-PostgreSQL adversarial tests passed, including the receipt assertion for `SELF_ROUTING_FORBIDDEN`.

### Above-pool-max concurrency result

`tests/integration/evaluator-consumer-database.test.ts:456-470` starts 24 concurrent refreshes. My focused run passed the case: exactly one gateway call, one `REFRESHED` result, 23 aggregate in-flight skips, and a successful post-run `SELECT 1` proving the pool remained usable.

## Non-blocking cross-lane follow-up

The shared helper now caps each question/task excerpt at 4096 UTF-8 bytes (`packages/evaluator/src/blind-sample.ts:1,11-21`). Because lane 06 uses the same helper, already-merged add-on grading material is also truncated. The returned string carries no truncation marker, so a clipped excerpt can appear complete. This does not defeat blinding, typed refusal, persistence, or concurrency and is non-blocking for PROG-09. Board ticket 09 now records the follow-up to add an explicit truncation marker.

## Decision

All four round-1 blockers are resolved, round 2 is dual PASS, the full typecheck and 711-test suite pass, and the required helper, self-routing, and 24-way concurrency spot-checks are substantive. Under board custody, `eval-09-consumer` is done.

HERMES STAGE VERDICT: LANE eval-09 APPROVED
