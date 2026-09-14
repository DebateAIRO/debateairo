# FIX-08 C1/C2 final Sol review

Date: 2026-09-04

Reviewed HEAD: `c524612f`  
Controller docs: `31e89d37`

## Verdict

- SPEC: **REWORK**
- CODE QUALITY: **REWORK**

## Finding

### HIGH — a PASS or row proof can be replayed by another case

The stdout-only row forgery is fixed. The parent now reads the real sink and
checks the baseline, declared run, runtime, capture point, and `occ_seq`.

But the authority stores are shared by every case and every family run:

- `verdicts` is a module-global `WeakSet`.
- `spawnReceipts` is a module-global `WeakSet`.
- `rowProofs` is a module-global `WeakMap`.

A case can save a row PASS from one real parent read-back. A later case can
return that same verdict object without spawning a child, reading the sink, or
running its own check. The family accepts it because the global `verdicts` set
still contains it.

Fresh proof at `c524612f` produced:

```json
{"exitCode":0,"lines":["obs-g1/row-owner PASS(rows=1)","obs-g1/row-replay PASS(rows=1)"]}
```

Only `row-owner` spawned and read rows. `row-replay` did neither. A process-only
PASS can be replayed in the same way.

The same problem also allows a later case context to call `passRows()` with an
older receipt because the receipt and proof maps are global.

This can print PASS for a case that did not run its own evidence path. That
breaks the no-fabrication rule.

Required change: make verdict, receipt, and row-proof authority local to one
case execution. `runFamily` must accept only the verdict minted by the current
case context. A receipt from another case or an earlier family run must fail.
Make row proof one-use if the contract does not need reuse. Add tests for both
saved-verdict replay and saved-receipt replay.

## What passed

- The exact old stdout forgery now fails with `ROW_READBACK_EMPTY`.
- Cases cannot pass row objects to `passRows()`.
- The parent opens the listener reader before spawn and reads the baseline
  before the child starts.
- The parent records the real child pid.
- After child close, the parent query uses exact, parameterized filters for
  baseline, declared run, runtime, and capture point.
- Empty, stale, mismatched, duplicate, malformed, over-limit, missing-reader,
  and query-error paths fail closed in code or tests.
- The child cannot receive `OBS_LISTENER_DATABASE_URL` through the spawn
  environment API.
- Tests mock the read-back module boundary; the read-back tests mock `pg`.

## Fresh verification

- Exact forgery regression: 1/1 passed.
- Focused FIX-08 files: 30/30 passed, three fresh runs.
- Standing acceptance and relay suites: 12/12 passed with loopback access.
- Real C2 CLI: exit 0, three exact runtime-missing SKIPs, zero PASS.
- Real failure CLI: one `FAIL(code=UNKNOWN_CASE)` line, exit 1.
- Harmful paths covered: forged stdout, old case rows, missing reader, stale
  baseline, wrong run, wrong runtime, wrong capture point, row limit, and
  hidden database error text.
- `pnpm typecheck`: only the eight pinned `s14-ui.test.ts` baseline errors; no
  FIX-08 error.
- `pnpm audit:source`: only the three pinned installer environment findings;
  no FIX-08 path.
- `git diff --check dev...HEAD`: passed.

## Scope

- Product source diff: zero.
- `acceptance/run-acceptance.ts`: one added dispatch line.
- Code and tests stay in `acceptance/obs/**` and
  `tests/integration/fix08-*.test.ts`.
- Other changed files are the controller SPEC/PLAN corrections.
- No zone file metadata is read.
- C3 and C4 remain deferred and no PASS is invented for them.

The row query correction is good, but the cross-case replay must be closed
before C1/C2 can pass review.
