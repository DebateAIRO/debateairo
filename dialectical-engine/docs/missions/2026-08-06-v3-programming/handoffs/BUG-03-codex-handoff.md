# BUG-03 Codex handoff

Ticket: `t_b0cb0cc7`  
Worker session: `019ffec9-e490-7093-bca0-664f12e3fa8c`  
Worktree: `dev @ /Users/vladmihaimiron/Documents/DebateAIRO`  
Comments read through: `2026-08-14 08:42` (`WORKER CLAIM`; no later comment)

## Outcome

- `GET /v1/answers` remains the single home-page request and now returns one `HOME_PAGE_SIZE`-bounded page split into served `items` and asker-owned `open_runs`.
- Page membership is ordered by the existing `core.run.created_at_seq`. Served rows carry `run_ref`, so both the persistence read and UI adapter suppress a served/open duplicate.
- Open state is delegated to BUG-02's canonical `RunRepository.readLoadingProjection`; no second lifecycle vocabulary or synthetic state was introduced.
- The home buffer merges both arms newest-first. Non-failed open runs render the existing `Generating` affordance and link to `/debate/<run_ref>`; failed runs render `Debate generation failed: <terminal_reason>` and link through.
- The existing `HOME_PAGE_SIZE = 50` is still the only page bound. No DDL, migration, kernel vocabulary, dependency edge, standing-stack process, or Git operation changed.

## Changed-file inventory

Production:

- `packages/contract/src/index.ts` — `OpenRunSummarySchema`; answer summaries gain `run_ref` and ordering sequence; answer index gains `open_runs`.
- `packages/serve/src/index.ts` — one asker-scoped mixed page; served-run exclusion; canonical BUG-02 projection reads for open state.
- `apps/v2-ui/lib/v3/adapter.ts`, `apps/v2-ui/lib/types.ts` — mixed index projection, newest-first ordering, served-run deduplication, terminal reason carrier.
- `apps/v2-ui/components/DebatesBuffer.tsx`, `apps/v2-ui/app/page.tsx` — extracted tested buffer renderer and wired it into the home page.

Tests and evidence:

- `tests/integration/database.test.ts` — real embedded-PG owner/foreign/served/failed coverage.
- `tests/render/bug03-home-buffer.test.tsx` — mixed generating/failed/served rendering, links, failure copy, and UI dedupe.
- `tests/unit/api.test.ts`, `tests/unit/load01-live-proof.test.ts`, `tests/unit/v2ui-data-layer.test.ts` — updated closed contract fixtures and index projection proof.
- `docs/missions/2026-08-06-v3-programming/handoffs/BUG-03-progress.log` — append-only major-step log.

The untracked `goal-packets/BUG-03-codex-goal.md` existed before implementation and was left untouched.

## TDD RED -> GREEN -> REFACTOR

Initial RED:

```text
FAIL tests/integration/database.test.ts > BUG-03 asker-scoped debates index
AssertionError: expected 1 to be 3

FAIL tests/render/bug03-home-buffer.test.tsx
Error: Cannot find module '../../apps/v2-ui/components/DebatesBuffer.js'

Test Files  2 failed (2)
Tests       1 failed | 42 passed (43)
```

Focused GREEN after the minimal implementation:

```text
Test Files  2 passed (2)
Tests       44 passed (44)
```

Refactor kept GREEN after replacing duplicated lifecycle SQL with the canonical BUG-02 repository projection:

```text
Test Files  2 passed (2)
Tests       44 passed (44)
$ tsc --noEmit
$ tsx tools/orphan-audit/src/cli.ts architecture
{ "edgeRowsChecked": 27, "violations": [] }
```

## Required gates — real output

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
Tests       69 passed (69)
Duration    14.51s
```

Full enforced Vitest:

```text
Test Files  78 passed (78)
Tests       563 passed | 1 skipped (564)
Duration    28.50s
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

Contract generation zero drift (second-run hashes identical):

```text
$ pnpm run generate:contract
641a3bcd41393430a610ac6fe5df01d182e73eef  packages/contract/generated/field-inventory.json
d1dce75b257e0d961609249f50552ef578e06499  packages/contract/generated/openapi.json
486fac249ec983512cbb91178ad69d14f53ec550  packages/contract/generated/client.ts
CONTRACT_ZERO_DRIFT
```

Collection proof:

```text
COLLECTED tests/integration/database.test.ts > BUG-03 asker-scoped debates index > lists open owner runs honestly and excludes foreign or already-served runs
COLLECTED tests/render/bug03-home-buffer.test.tsx > BUG-03 home debates buffer > renders generating and failed runs as honest linked entries without duplicating a served run
COLLECTION_LINES 563
```

`git diff --check` is clean.

## Mutation ledger

| Mutation | Killing assertion / observed RED |
|---|---|
| `MUT-BUG03-DROP-OPEN-READ` — replace selected open rows with an empty set | Embedded-PG test received `[]`; expected failed + running owner projections. Exit 1. |
| `MUT-BUG03-FOREIGN-LEAK-BOTH-GUARDS` — remove asker predicates from index membership and canonical run projection | Embedded-PG result gained the foreign `QUEUED` run; exact open-run assertion failed. Exit 1. Removing either guard alone stayed green, proving defense in depth. |
| `MUT-BUG03-SERVED-DUPLICATE` — remove `NOT EXISTS serve.answer` | Embedded-PG result gained the served run as an open `SETTLED` row; exact open-run assertion failed. Exit 1. |
| `MUT-BUG03-RENDER-GENERATING-AS-DONE` — map a non-failed open run to `complete` | Render test received `Complete`/`pillOk`; expected `Generating`. Exit 1. |

All mutations were restored and the clean focused baseline was rerun green before final gates.

## AC / scope evidence

- Owner visibility + foreign invisibility: real embedded-PG BUG-03 assertion.
- Failed terminal reason: exact `TEST_LAYER:BUG03_TERMINAL_FAILURE` integration assertion and exact render copy assertion.
- Served once: persistence `NOT EXISTS` assertion plus UI `run_ref` defense; both mutation-proven.
- Newest first: sequence values are supplied by the existing global sequence and the render fixture asserts `generating -> failed -> served` order.
- Bound: combined persistence page applies the caller's one `limit`; integration asserts `items.length + open_runs.length <= limit`; home still passes only `HOME_PAGE_SIZE`.
- DDD/SOLID: serve owns the read projection, DB owns lifecycle derivation, contract owns closed wire schemas, and the UI component owns presentation. Architecture gate is clean.
- DR-115: no runtime defaults, fake lifecycle values, scaffold records, or standing-stack reads were introduced.

## Live verification packet

The standing PG `55432`, API `8790`, and UI `3000` were not touched, as forbidden by the ticket. The dual review diamond must verify against the running system after its normal restart/build-skew ceremony:

1. Start a long owner-scoped debate, navigate back home, and confirm a `Generating` card links to its `/debate/<run_ref>` page.
2. Confirm a failed no-answer run shows `Debate generation failed: <terminal_reason>` and links through.
3. Confirm a served run replaces its open entry and appears once.
4. Confirm a different asker token cannot see any of those runs.

## Questions for V

None.
