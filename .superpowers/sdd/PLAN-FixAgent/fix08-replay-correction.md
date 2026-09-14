# FIX-08 replay correction report

Date: 2026-09-04

## Result

The Sol replay finding was reproduced and fixed.

Each case now gets private verdict, receipt, consumed-receipt, and row-proof
stores. A later case cannot use a saved verdict, receipt, or row proof. A case
also cannot use one receipt twice. `runFamily` consumes the current case's
verdict when it prints the result.

The public case context does not expose these stores or an authority input.
Row PASS still needs the parent runner's database read-back. Process PASS still
needs a real child receipt.

## Commit

- `8e9442ff` — case-local, one-use FIX-08 proof and replay tests

The same commit includes the narrow `SPEC-v4.md` and `PLAN-v4.md` correction.

## TDD and mutants

- RED: a row case got a real parent-read-back PASS. Later cases reused its
  verdict and receipt without a new spawn or query. Both printed PASS on the
  old code.
- RED: a process case got a real child PASS. Later cases reused its verdict
  and receipt. Both printed PASS on the old code.
- RED: a case used the same row receipt twice. The second use printed PASS on
  the old code.
- RED: a case used the same process receipt twice. The second use printed PASS
  on the old code.
- GREEN: verdict replay now gives `FABRICATED_VERDICT`; receipt replay gives
  `SPAWN_RECEIPT_INVALID`; a second same-case use gives
  `SPAWN_RECEIPT_ALREADY_USED`.

Three mutants were killed and restored:

- accepting a verdict missing from the current case store;
- not consuming an active receipt;
- accepting a receipt missing from the current case store.

## Checks

- Focused FIX-08 tests: 34/34 passed on three full runs. A final fresh run also
  passed 34/34 after the type annotation fix.
- Standing runner and relay tests: 12/12 passed with local loopback access.
- Real C2 CLI: exit 0, three exact runtime-missing SKIP lines, no PASS.
- Real failure CLI: one `FAIL(code=UNKNOWN_CASE)` line, exit 1.
- Contract generation: exit 0 and no changed output.
- Typecheck: only the eight pinned `s14-ui.test.ts` errors; no FIX-08 error.
- Source audit: only the three pinned installer environment findings; no
  FIX-08 path.
- Architecture audit: still blocked by the pinned missing `web/package.json`.
- Staged diff check: passed.
- Product source changes: zero.
- Zone changes: zero.
- The earlier one-line acceptance registration is unchanged.

The first standing-test and tsx runs were blocked by sandbox socket rules. The
same commands ran with local socket access.

## Deferred

C3 and C4 remain deferred. Their real runtime, role URLs, failure seams, HTTPS
stack, and V's p99 limit are still absent. This report makes no V acceptance,
FIX-08 Done, board, or merge claim.
