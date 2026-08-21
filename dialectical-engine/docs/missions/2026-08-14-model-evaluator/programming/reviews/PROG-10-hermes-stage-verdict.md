# PROG-10 Hermes stage verdict — `eval-10-seatshare`

Mission: `model-evaluator`  
Lane: `codex/eval-10-seatshare`  
Verified commits: `0c17179` + `310ce9b`  
Verdict: **APPROVED**

## Review chain and ruling basis

I read every `PROG-10-*.md` review artifact present before this verdict. Round 1 returned A-REWORK/B-PASS: reviewer A required missing formula/degenerate coverage, a stronger whole-workspace no-live-caller guard, grant-level darkness proofs, and the bind-readiness disclosures; reviewer B passed with non-blocking findings, including locale-dependent receipt hashing. Commit `310ce9b` closed the blocking coverage gaps, replaced locale-dependent ordering, strengthened the darkness proof, and expanded the checklist. Both independent round-2 reviews returned PASS.

## Independent verification

All executable checks ran in `/Users/vladmihaimiron/Documents/DebateAIRO-worktrees/eval-10-seatshare/DebateAI-V3`.

| Check | Command | Result |
|---|---|---|
| Repository typecheck | `pnpm run typecheck` | PASS; `tsc --noEmit`, exit 0, no diagnostics |
| Full repository tests | `pnpm exec vitest run` | PASS; 98 files, 702 tests, 0 failures |
| Focused seat-share verification | `pnpm exec vitest run tests/unit/evaluator-seat-share.test.ts tests/integration/evaluator-seat-share-database.test.ts tests/architecture/evaluator-selector-unbound.test.ts --reporter=verbose` | PASS; 3 files, 9 tests, 0 failures |
| Patch hygiene | `git diff --check dev...HEAD` | PASS; no output |
| Declared commits | `git merge-base --is-ancestor` for `0c17179` and `310ce9b` | PASS; both are ancestors of the tested head |

The tested branch head was exactly `310ce9b`; the worktree remained clean.

## Required spot-checks

### Zero live call sites across the whole repository

The shipped architecture guard scans `apps`, `packages`, `web`, `tools`, and `acceptance`, excludes only the evaluator definition, and checks all three selector/allocator entry points (`tests/architecture/evaluator-selector-unbound.test.ts:17-23`). It passed.

I additionally scanned all repository JavaScript/TypeScript production sources outside dependencies, tests, generated output, and the sole definition file for calls to `allocateEvaluatorSeatShare`, `computeAndPersistShadowDecision`, and `selectJudgesByBiasRank`. Result: `WHOLE_REPO_LIVE_CALL_SITES []`. No evaluator seat-share output can currently steer dispatch.

### Grant-level darkness proofs

The real-PostgreSQL test queries `has_table_privilege` for `debateai_evaluator_worker` on INSERT to both `scorecard.routing_decision` and `scorecard.session_assignment` (`tests/integration/evaluator-seat-share-database.test.ts:102-117`). The asserted result is false for both privileges, and the focused run passed. This is a direct grant proof, not a vacuous empty-table assertion.

### Locale-independent receipt hash

`compareCodePointStrings` implements an explicit code-point order (`packages/evaluator/src/index.ts:2304-2312`), and both candidate and numeric-producer receipt arrays use it before hashing (`index.ts:2750-2783`). The live-PostgreSQL test reverses `String.prototype.localeCompare`, recomputes the same decision, and proves the same shadow-decision id with no second insert (`tests/integration/evaluator-seat-share-database.test.ts:62-82`). The test passed, demonstrating that the idempotency hash no longer depends on host locale collation.

## Non-blocking bind-review disclosure

The bind-readiness checklist still omits the sequence-burn disclosure identified by reviewer B: `computeAndPersistShadowDecision` allocates a ledger sequence before `ON CONFLICT DO NOTHING`, so an idempotent no-op recomputation consumes a sequence value even though it inserts no shadow row. This is an established, semantically inert ordering-token gap and does not affect the admitted run or dispatch. Board ticket 10 now carries an explicit V bind-review note requiring the disclosure before integration/go-live.

## Decision

The round-1 blocking gaps are resolved, round 2 is dual PASS, the full typecheck and 702-test suite pass, whole-repository caller scans are empty, the evaluator worker lacks routing/session-assignment INSERT grants, and receipt hashing is locale-independent. The allocator remains CODED DARK / UNBOUND. Under board custody, `eval-10-seatshare` is done and final lane `eval-11-devmenu` is ready.

HERMES STAGE VERDICT: LANE eval-10 APPROVED
