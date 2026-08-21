# BUG-04 Codex handoff

Ticket: `t_187a3bea`  
Worker session: `019ffef0-8189-76e3-8d46-aeb84cfe78ee`  
Worktree: `dev @ /Users/vladmihaimiron/Documents/DebateAIRO`  
Comments read through: `2026-08-14 09:33` (`CODEX HEARTBEAT`; no later comment)

## Outcome

- Failed debate cards now use the existing `pillBad` chrome; generating and complete cards retain `pillGen` and `pillOk` respectively.
- The render regression test isolates the failed card's own projected status and markup, so a failed-as-generating mutation cannot hide behind a sibling generating card.
- A real embedded-PostgreSQL integration fixture creates `HOME_PAGE_SIZE + 1` served rows, then a newer running row, and proves the running row remains on page one under the shipped global newest-first ordering.
- The two false in-file mutation claims were corrected: foreign leakage is claimed only for removal of both asker guards, and failed-as-generating is claimed only by the new card-scoped assertions.
- No schema, contract, kernel, dependency edge, standing-stack process, or Git operation changed.

## Changed-file inventory

Product:

- `apps/v2-ui/components/DebatesBuffer.tsx` — choose `pillBad` for failed status.

Tests:

- `tests/render/bug03-home-buffer.test.tsx` — assert the failed card's own status, pill class, and label; correct the mutation comment.
- `tests/integration/database.test.ts` — add the real-PG page-order fixture derived from `HOME_PAGE_SIZE`; correct the dual-guard mutation comment.

Evidence:

- `docs/missions/2026-08-06-v3-programming/handoffs/BUG-04-progress.log` — append-only major-step log (ignored by the repository's standing `*.log` rule, but present on disk).
- `docs/missions/2026-08-06-v3-programming/handoffs/BUG-04-codex-handoff.md` — this handoff.

Pre-existing unrelated dirt left untouched: `decisions-ledger.md` and the untracked `goal-packets/BUG-04-codex-goal.md`.

## TDD RED -> GREEN -> REFACTOR

Initial RED after adding the card-scoped render assertion and the real-PG ordering fixture:

```text
FAIL tests/render/bug03-home-buffer.test.tsx > BUG-03 home debates buffer
expected '<a class="debateCard" href="/debate/r…' to contain 'class="pill pillBad"'
Received: ...<div class="pill pillGen">...Failed...</div>...

Test Files  1 failed | 1 passed (2)
Tests       1 failed | 2 passed | 42 skipped (45)
```

Minimal GREEN after the one-line product correction:

```text
Test Files  2 passed (2)
Tests       3 passed | 42 skipped (45)
Duration    3.08s
```

Refactor was limited to ordering the pagination assertions so the directed mutation reports the missing running row directly. The restored focused baseline remained GREEN:

```text
Test Files  2 passed (2)
Tests       3 passed | 42 skipped (45)
Duration    2.61s
```

## Mutation ledger (P1)

| Named mutation | Killing assertion / real RED |
|---|---|
| `MUT-BUG04-RENDER-FAILED-AS-GENERATING` — replace the adapter's failed/generating branch with unconditional `status: "generating"` | Render test failed at the failed card itself: expected `{ status: "failed" }`, received `{ status: "generating" }`. `1 failed`, exit 1. |
| `MUT-BUG04-SERVED-FIRST` — replace global `ORDER BY created_at_sequence DESC` with `ORDER BY kind ASC, created_at_sequence DESC` | Embedded-PG test failed because a page filled by served answers displaced the newer running row: expected one RUNNING `open_runs` entry, received `[]`. `1 failed | 43 skipped`, exit 1. |

Each mutation was applied alone, restored immediately, and followed by a GREEN focused rerun. `packages/serve/src/index.ts` and `apps/v2-ui/lib/v3/adapter.ts` have no final diff.

## Fixture-by-fixture status

- Failed pill chrome: RED on current `pillGen`; GREEN on `pillBad`.
- Failed-card ownership pin: GREEN on shipped adapter; directed failed-as-generating mutation RED at the failed card's status before any whole-document assertion can mask it.
- Page-order pin: `HOME_PAGE_SIZE + 1` served runs plus one newer CLAIMED work item; shipped SQL returns one RUNNING open row plus `HOME_PAGE_SIZE - 1` served rows; served-first mutation returns no open row and is RED.
- Honesty hygiene: both overstated comments now name the exact mutation that is actually killed.

## Required gates — real output

Typecheck:

```text
$ pnpm run typecheck
$ tsc --noEmit
(exit 0)
```

Architecture + source lint:

```text
$ pnpm run lint
{
  "edgeRowsChecked": 27,
  "violations": []
}
{
  "blocking": []
}
```

Real embedded PostgreSQL integration:

```text
$ pnpm vitest run tests/integration
[S00 DB] Testcontainers DEFERRED BY DR-121; starting real embedded PostgreSQL directly
Test Files  8 passed (8)
Tests       70 passed (70)
Duration    13.77s
```

Full enforced Vitest:

```text
$ pnpm test
Test Files  78 passed (78)
Tests       564 passed | 1 skipped (565)
Duration    25.40s
```

Repository template gates, run from `/Users/vladmihaimiron/Documents/DebateAIRO`:

```text
$ bash tests/render-templates.sh
Rendered templates into <temporary-directory>
$ bash tests/lint-templates.sh
(no output, exit 0)
```

`git diff --check`: no output, exit 0.

## Collection proof (P2)

```text
$ pnpm vitest list | rg 'BUG-03 asker-scoped debates index|BUG-03 home debates buffer'
tests/integration/database.test.ts > BUG-03 asker-scoped debates index > lists open owner runs honestly and excludes foreign or already-served runs
tests/integration/database.test.ts > BUG-03 asker-scoped debates index > keeps a newer in-flight run on page one when served answers exceed HOME_PAGE_SIZE
tests/render/bug03-home-buffer.test.tsx > BUG-03 home debates buffer > renders generating and failed runs as honest linked entries without duplicating a served run

$ pnpm vitest list | wc -l
564
```

## AC and design evidence

- No new production bound: the fixture imports the existing `HOME_PAGE_SIZE`; its served cardinality is derived as `HOME_PAGE_SIZE + 1`.
- DDD/SOLID boundaries remain unchanged: the UI component owns presentation; Serve retains the existing ordered read; the test layer alone constructs database fixtures.
- DR-115 remains intact: production derives status from the existing typed projection; no runtime data or state is fabricated.
- Scope is exact: one presentation line, two regression pins, and two corrected comments.

## Live verification packet (P3)

Live verification was not run because BUG-04 explicitly forbids standing-stack control and no live failed run is guaranteed to exist. The review diamond should verify on the running system without restarting or reseeding it:

1. If an existing failed no-answer run is available, confirm its home card says `Failed` and uses the bad/error chrome rather than generating chrome.
2. With an asker owning more than one home page of served answers, start or identify a newer in-flight run and confirm it remains visible on page one.
3. Confirm generating and complete cards retain their existing chrome.

The real embedded-PG and SSR render gates above are the executable evidence when those live preconditions are unavailable.

## Acknowledged deferrals / environment tail

- Testcontainers remains authored-dormant and deferred by DR-121; all database evidence ran on real embedded PostgreSQL.
- No contract generation gate was required because this ticket changes no contract source or generated artifact.
- No local commit was made: the coding protocol's P5 micro-commit occurs only at dual-greenlit ticket close, and Git operations remain V/orchestrator-gated.

## Questions for V

None.
