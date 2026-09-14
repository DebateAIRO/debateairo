# FIX-08 row-proof correction report

Date: 2026-09-04

## Result

The Sol finding was reproduced and fixed.

Child stdout is no longer a row receipt. A case can no longer give row objects
to `passRows`. For a row-bearing spawn, the parent runner now:

1. opens its own read-only connection from `OBS_LISTENER_DATABASE_URL`;
2. reads the current maximum `occ_seq` before spawn;
3. creates `run:obs-g1:<uuid>` and gives it to the child as a declared run;
4. records the real `ChildProcess.pid`;
5. waits for child close;
6. queries `obs.occurrence` itself for rows above the baseline with that exact
   run, runtime, and capture point;
7. stores the checked row count in a private `WeakMap`;
8. allows only that private result to mint row `PASS`.

No reader, no row, a stale row, a wrong run/runtime/capture point, too many
rows, or a query error produces `PASS`. Queries, results, child output, child
time, and cleanup are bounded. Database error text is reduced to fixed codes.
The read-only URL is not allowed in child environment input.

## Commits

- `31e89d37` — SPEC-v3 and PLAN-v3 correction
- `c524612f` — parent-owned database read-back and tests

## TDD proof

- RED: the exact child stdout forgery used a real pid, the parent challenge,
  and invented `occ_seq=777`. Old code returned exit 0 and `PASS`.
- GREEN: the same stdout with no stored row returns
  `FAIL(code=ROW_READBACK_EMPTY)` and no `PASS`.
- RED/GREEN: the old three-argument `passRows(receipt, rows, metrics)` call now
  returns `FAIL(code=CASE_ROWS_FORBIDDEN)`.
- RED/GREEN: a result over the row cap first passed, then returned
  `FAIL(code=ROW_READBACK_LIMIT)` after the cap was enforced in the parent.
- RED/GREEN: an untrusted database error code first reached output, then was
  reduced to `ROW_READBACK_QUERY_FAILED`.

Three security mutants were killed and restored:

- accepting an empty read-back made the stdout forgery test fail;
- creating fake rows when the reader was absent made the no-reader test fail;
- dropping the exact `run_ref` check made the wrong-run test fail.

## Fresh checks

- Focused FIX-08 tests: 30/30 passed, three runs.
- Standing runner and relay tests: 12/12 passed with local loopback access.
- Real C2 CLI: exit 0, three exact runtime-missing `SKIP` lines, zero `PASS`.
- Real failure CLI: one `FAIL(code=UNKNOWN_CASE)` line, exit 1.
- `pnpm typecheck`: only the eight pinned `s14-ui.test.ts` baseline errors; no
  FIX-08 error.
- `pnpm audit:source`: only the three pinned installer environment findings;
  no FIX-08 path.
- `git diff --check`: passed.
- Product source changes: zero.
- The existing `acceptance/run-acceptance.ts` change remains one registration
  line.

The first sandbox-only standing-test and `pnpm exec tsx` runs were blocked by
local socket `EPERM`. The same commands passed with local socket access.

## Deferred

C3 and C4 remain deferred. The FIX-01 runtime, real role URLs, real failure
seams, HTTPS stack, and V's p99 limit are still absent. This report makes no V
acceptance or FIX-08 Done claim.
