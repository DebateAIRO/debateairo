# RESIL-01 Codex handoff — rev2 cooldown, hidden frame, and run-death policy

Ticket: `t_00c8561c` · worker session: `019fff14-a083-79d2-a587-559afdabe92e`

Disposition: `REWORK READY FOR PEER REVIEW - RESIL-01 rev2`.

## Honest review baseline

The review delta is `git diff 2f2aaa2`. Part of Codex rev1 landed in `aa4aa0b` through the orchestrator sweep error acknowledged in the rev2 instruction, so `HEAD` is not an honest implementation baseline. Codex made no commit, push, merge, branch/worktree mutation, service restart, standing-stack change, register reseed, provider call, or product-data write in this worker session.

## Opus rev1 findings closed

- **R1 / B1:** maker-root selection now happens after class-H subtree exclusion and propagation. If the configured preferred root is hidden, the first remaining configured maker root is served with the ruled marks. If no maker root survives, the runner emits typed `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`, carrying the review-exhaustion cause; it never mislabels this case `EMPTY_PROPAGATION`.
- **R2 / B2:** class L (`strength <= 0.35`) is presentation-only. L records have `excluded_from_served_number=false`; low nodes and their attacks stay in propagation and the served number. Only class H excludes a subtree from evaluation.
- **R3 / B3:** enforced tests pin H1, H2, H3, H6, H7, H9/T11, and H10 on production seams, including real embedded-PostgreSQL runner drivers.
- **R4:** halt `attempts_spent` is cumulative across the exhausted call and courtesy retry. `EXPANSION_HALTED` is written only for an expansion death; maker-position and review transport deaths retain their correctly scoped terminal/hidden behavior.

`NodeSchema.final_strength` remains nullable intentionally. DR-165(3) and the authorized plan require retained class-H material to be disclosed as unjudged and to carry no served opinion. A non-null contract would require deleting the retained node or fabricating a strength. Contract generation is zero-drift with this representation.

## Rev2 reproduce-first RED and GREEN

The new regression set was first run unchanged against the reviewed implementation and real embedded PostgreSQL:

```text
$ pnpm vitest run tests/integration/database.test.ts tests/unit/dr174-resilience.test.ts -t 'RESIL-01 rev2' --reporter=verbose
Test Files  1 failed | 1 passed (2)
Tests       8 failed | 3 passed | 55 skipped (66)
```

The failures reproduced the served-root `EMPTY_PROPAGATION`, all-roots-H mislabel, tau-0.30 annihilation, L-number exclusion, exact-boundary loss, maker deaths misrecorded as expansion halts, and non-cumulative halt attempts. After the fixes and source pin:

```text
$ pnpm typecheck && pnpm vitest run tests/integration/database.test.ts tests/unit/dr174-resilience.test.ts -t 'RESIL-01 rev2' --reporter=dot --silent
$ tsc --noEmit
Test Files  2 passed (2)
Tests       12 passed | 55 skipped (67)
```

The two focused files also pass in full (67 tests).

## Mutation ledger

Every mutation below was applied alone, produced RED, and was restored before the final GREEN and gates.

| Mutation | Enforced killer and observed RED |
|---|---|
| H1 bypass primary maker `JUDGE` cooldown wrapper | Real-PG primary-death test observed raw `PROVIDER_CALL_FAILED` instead of the typed maker terminal/hold path. The source seam also pins `callSiteKey: "JUDGE"` inside `withCooldownRetry`. |
| H2 bypass secondary maker-root cooldown wrapper | Real-PG secondary-death test observed raw `PROVIDER_CALL_FAILED`; source pin proves `authorPosition` routes the parentless secondary root through the wrapper. |
| H3 map class N to a revealable set-aside state | Unit adapter test observed `path_status: "abandoned"` where no reveal state is permitted. |
| H6 change runner threshold `<= tau` to `< tau` | Real-PG exact-0.35 fixture lost its class-L presentation record. |
| H7 use the base call bound instead of effective final-retry bound in preflight | Source pin failed at the production preflight expression. |
| H9/T11 remove successful-outcome continuation at the effective bound | Real-PG last-effective-attempt-success test entered a false later terminal instead of completing its site. |
| H10 remove the halted-subtree skip | Real-PG depth-two halted expansion tried to author a descendant and failed `DEBATE_EXPANSION_PARENT_MISSING`. |

T11's failed half is separately driven: an effective-bound failed non-root site enters the typed expansion halt path. R1 and both R2 reproductions are behavioral mutation killers for pre-exclusion root selection and L subtree exclusion respectively.

## Delivered behavior

1. Transport exhaustion at every runner provider seam records a visible ten-minute hold, waits, and spends one remaining wrapper attempt. The durable two-hold run cap is recovered from progress events; schema/content/budget failures do not enter this transport-only courtesy.
2. `HOLDING`, `hold_until`, typed hold/retry/halt events, ordered writes, recovery, and self-expiring read projection remain intact. Migration `0021_dr174_cooldown_prune.sql` enforces H as number-excluding and L as presentation-only.
3. Class H excludes its complete subtree without deletion or re-parenting. Class L dims/sets aside presentation while remaining evaluated. Class N visibly halts an unauthored branch and is never revealable.
4. Served-root choice consumes the post-H-exclusion propagation. Sparse authored-node lookup and effective-bound preflight behavior remain repaired.
5. Acceptance-register provenance, deployment threshold wiring, HOLDING UI, missing-vs-low distinction, and existing disclosure affordances remain intact.

## Required gates — real output

```text
$ pnpm vitest run tests/integration --maxWorkers=1 --reporter=dot --silent
Test Files  8 passed (8)
Tests       82 passed (82)
Duration    14.39s

$ pnpm generate:contract && pnpm typecheck && pnpm lint && git diff --check
$ tsx packages/contract/src/generate.ts
$ tsc --noEmit
{ "edgeRowsChecked": 27, "violations": [] }
{ "blocking": [] }
[git diff --check: no output]
exit 0

$ pnpm vitest run --config acceptance/vitest.config.ts --reporter=dot --silent
Test Files  9 passed (9)
Tests       35 passed (35)
Duration    6.00s

$ pnpm --dir apps/v2-ui typecheck && pnpm --dir apps/v2-ui test
$ tsc --noEmit -p tsconfig.json
V2_UI_NODE_TESTS_DISCOVERED=1
tests 27 · pass 27 · fail 0

$ pnpm vitest run --reporter=dot --silent
Test Files  79 passed (79)
Tests       588 passed | 1 skipped (589)
Duration    26.16s

$ cd /Users/vladmihaimiron/Documents/DebateAIRO && bash tests/render-templates.sh && bash tests/lint-templates.sh
Rendered templates into <temporary directory>
exit 0
```

The rev2 tests are listed by `pnpm vitest list`, live under the existing enforced integration/unit roots, and are counted by the full 79-file gate.

## File inventory

- `apps/runner/src/index.ts` — scoped cooldown failures, cumulative attempts, post-H served-root selection, L presentation-only behavior, and halted-subtree/effective-bound handling.
- `packages/contract/src/index.ts`, `packages/serve/src/index.ts`, `migrations/0021_dr174_cooldown_prune.sql` — H/L exclusion invariants and the justified nullable hidden strength.
- `tests/integration/database.test.ts` — real-PG R1/R2, H1/H2/H6/H10, and both effective-bound drivers.
- `tests/unit/dr174-resilience.test.ts` — production source seam pins and non-revealable class-N adapter proof.
- Prior rev1 RESIL files in `git diff 2f2aaa2` — cooldown persistence/projection, register, API, UI, and compatibility coverage.
- `docs/missions/2026-08-06-v3-programming/handoffs/RESIL-01-progress.log` and this handoff — durable rev1/rev2 evidence.

No `skeleton/` file or target-project template behavior changed, so no skeleton `VERSION`, `CHANGELOG.md`, or upgrade-guide update is applicable. No implementation item is deferred and there is no question for V. The orchestrator still owns any forbidden standing-stack register-hash reseed after ticket close.

