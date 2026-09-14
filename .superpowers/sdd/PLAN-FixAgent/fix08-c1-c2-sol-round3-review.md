# FIX-08 C1/C2 Sol review — round 3

Date: 2026-09-04

Reviewed HEAD: `8e9442ff`

## Verdict

- SPEC: **PASS**
- CODE QUALITY: **PASS**

No findings.

## Authority checks

- Every case gets new private verdict, receipt, consumed-receipt, and row-proof
  stores.
- A later case cannot reuse a row verdict or row receipt.
- A later case cannot reuse a process verdict or process receipt.
- A second use inside the same case fails with
  `SPAWN_RECEIPT_ALREADY_USED`.
- `runFamily` accepts and consumes only the verdict minted by the current case
  context.
- The public case context cannot supply or replace authority stores.
- Row PASS still needs the parent-owned database read-back.
- The parent still reads the baseline before spawn, records the real child
  pid, and checks rows after child close.
- The row query and result checks still bind the new `occ_seq`, declared run,
  runtime, and capture point.
- Child stdout cannot prove a row. The old invented-`occ_seq` attack still
  fails.

## Direct attack probes

The exact old replay shape was run outside the test file.

Row authority result:

```text
row-owner PASS(rows=1)
row-verdict-replay FAIL(code=FABRICATED_VERDICT)
row-receipt-replay FAIL(code=SPAWN_RECEIPT_INVALID)
```

Process authority result:

```text
process-owner PASS(children=1)
process-verdict-replay FAIL(code=FABRICATED_VERDICT)
process-receipt-replay FAIL(code=SPAWN_RECEIPT_INVALID)
```

Both family results had exit code 1. Targeted same-case tests also proved that
row and process receipts are one-use.

## Fresh verification

- Replay and one-use tests: 4/4 passed.
- Focused FIX-08 files: 34/34 passed, three fresh runs.
- Standing acceptance and relay suites: 12/12 passed with loopback access.
- Real C2 CLI: exit 0, three exact runtime-missing SKIPs, zero PASS.
- Real failure CLI: one `FAIL(code=UNKNOWN_CASE)` line, exit 1.
- Harmful mutant coverage is present for shared verdict state, missing receipt
  consumption, and cross-context receipt acceptance. Each changed condition
  is pinned by the replay or one-use tests.
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
- C3 and C4 remain deferred and have no PASS output.

This is a C1/C2 worker milestone. It is not V acceptance and not FIX-08 Done.
