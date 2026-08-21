# BUG-02 Codex handoff — rev2

Ticket: `t_59d211be`  
Worker session: `019ffc70-422c-7763-9494-278e24982d4a`  
Worktree: `dev @ /Users/vladmihaimiron/Documents/DebateAIRO`  
Comments read through: `2026-08-13 22:22` (diamond split rev1)

## Outcome

- A real jsdom render test now mounts `DebatePageClient`, observes its effects, starts at the indeterminate loading surface, emits terminal SSE, and proves the served debate replaces loading without manual refresh.
- A terminal event is an explicit one-shot authority signal: `getDebateBundle(..., { answerExpected: true })` checks the run answer even when the projection still says `RUNNING`. Ordinary in-flight polling remains run-first and makes zero absent-answer requests.
- A held/SSR `initialAnswer` remains authoritative over a lagging loading projection. A later `SETTLED` projection can still refresh the answer, so legitimate answer refreshes are not frozen.
- The client `FAILED` arm renders its terminal-reason banner and removes the spinner. `SETTLED` is labeled `Settled` in plain words.
- Projection SQL is tested behaviorally on real embedded PostgreSQL for zero work, READY, CLAIMED, FAILED, and all-DONE. The whitespace-sensitive SQL source regex was removed; the explicit zero-work arm is `QUEUED` and the exhaustive remainder is `SETTLED`.
- Projection refresh preserves an SSE-built tree, with a rendered effect test that kills the clobber mutation.

## Changed-file inventory

Production changes remain within the original packet scope:

- `apps/v2-ui/lib/api.ts` — run-first discriminated bundle plus terminal-answer and held-answer authority.
- `apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` — terminal SSE signal, non-destructive refresh, failure banner, automatic flip.
- `apps/v2-ui/app/globals.css`, `lib/v3/adapter.ts`, `lib/types.ts`, `lib/format.ts` — indeterminate loading and honest projection presentation.
- `packages/contract/src/index.ts`, `packages/db/src/index.ts` — type-layer `SETTLED` and behaviorally exhaustive read projection.

Test layer:

- `tests/render/bug02-debate-effects.test.tsx` — new jsdom effect/render suite.
- `tests/render/load01-debate-page.test.tsx`
- `tests/unit/v2ui-data-layer.test.ts`, `load01-run-projection.test.ts`, `contract.test.ts`, `v2ui-ownership.test.ts`
- `tests/integration/database.test.ts`
- Root `package.json` and `pnpm-lock.yaml` add only `jsdom` as the sanctioned test-layer devDependency. This is not a production dependency edge.

No kernel vocabulary, DDL, migration, standing-stack, commit, push, or merge change was made. Reviewer-created untracked review/log artifacts were preserved untouched.

## Rev2 TDD evidence

Reproduce-first RED against rev1 current code:

```text
$ pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/unit/v2ui-data-layer.test.ts tests/integration/database.test.ts
Test Files  2 failed | 1 passed (3)
Tests       4 failed | 99 passed (103)
```

The failures were: terminal SSE did not render the answer; answer-200 plus projection-RUNNING returned loading; SSR `initialAnswer` was erased by the mount refresh. The added FAILED, SSE-tree, SETTLED-label, and zero-work behavior assertions already passed current code and were subsequently proved load-bearing by mutation.

Focused GREEN after the minimal implementation:

```text
$ pnpm exec vitest run tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/unit/v2ui-data-layer.test.ts tests/unit/load01-run-projection.test.ts tests/integration/database.test.ts
Test Files  5 passed (5)
Tests       113 passed (113)
```

Final jsdom/authority focus after refactor:

```text
Test Files  2 passed (2)
Tests       62 passed (62)
$ tsc --noEmit
(no output, exit 0)
```

## Required gates — final real output

Typecheck:

```text
$ tsc --noEmit
(no output, exit 0)
```

Architecture:

```text
$ tsx tools/orphan-audit/src/cli.ts architecture
{
  "edgeRowsChecked": 27,
  "violations": []
}
```

Real embedded PostgreSQL integration:

```text
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
Test Files  8 passed (8)
Tests       68 passed (68)
Duration    14.43s
```

Full enforced Vitest:

```text
Test Files  77 passed (77)
Tests       561 passed | 1 skipped (562)
Duration    28.05s
```

Lint:

```text
$ pnpm run audit:architecture && pnpm run audit:source
{
  "edgeRowsChecked": 27,
  "violations": []
}
{
  "blocking": []
}
```

Collection proof:

```text
$ pnpm exec vitest list --reporter=dot > /tmp/bug02-vitest-list.txt
$ wc -l /tmp/bug02-vitest-list.txt
561 /tmp/bug02-vitest-list.txt
```

The list includes all four `BUG-02 rendered refresh behaviour` jsdom cases and all three new run-projection integration cases. `git diff --check` is clean.

## Rev2 mutation ledger (all observed RED)

| Mutation | Killing assertion / observed result |
|---|---|
| B1: disable `createDebatePageRunEventConsumer` refresh wiring | jsdom `renders loading, then a served answer after terminal SSE...` failed: served claim absent. |
| R2: ignore `answerExpected` when projection is `RUNNING` | unit answer-200/RUNNING assertion returned `loading`, expected `served`. |
| R2 SSR: delete held-answer authority | jsdom hard-reload case lost the served claim and reverted to the RUNNING surface. |
| B4: delete client `FAILED` arm | jsdom FAILED case lost `Debate generation failed: TOTAL_REVIEW_COVERAGE_UNSATISFIED`. |
| L9: replace loading refresh with `setDebate(bundle.detail)` | jsdom SSE-tree case lost `Streamed claim survives refresh`. |
| B6: delete `SETTLED` label arm | label test received raw `SETTLED`, expected `Settled`. |
| B8: zero-work arm returns `RUNNING` | embedded-PG zero-work test received `RUNNING`, expected `QUEUED`. |
| L2: terminal remainder returns `RUNNING` | embedded-PG all-DONE test received `RUNNING`, expected `SETTLED`. |
| Projection arm weakening/order | embedded-PG mixed READY/CLAIMED/FAILED behavior test pins priority; no source-text regex remains. |

Rev1 priority kills remain covered: restore answer-first probing, expose `CLAIMED`, remove the indeterminate bar, resurface by-design answer 404s, or remove `SETTLED` from the wire schema all fail their existing focused assertions.

## Review request / remaining boundary

Opus 5 is the finding reviewer and must confirm its own rev1 findings on rev2 under P8. The standing API still predates the DB change and was not restarted or touched; live deployment verification remains reviewer-owned. The root `AGENTS.md` template scripts are absent from this checkout, and no `skeleton/` file changed.
