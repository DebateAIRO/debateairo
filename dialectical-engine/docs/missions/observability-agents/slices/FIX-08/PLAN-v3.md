# FIX-08 — PLAN v3 (row-proof correction)

**SPEC:** frozen `SPEC.md`, `SPEC-v2.md`, and `SPEC-v3.md`.

## C1 correction

1. Add a RED test where a child prints a matching pid, declared run value, and
   invented `occ_seq`, while the parent database read returns no row. Require
   one `FAIL` line and no `PASS`.
2. Add RED tests for the parent order: baseline before spawn, then read-back
   after close. Cover exact runtime, capture point, declared run value, row
   limit, query failure, and missing read-only URL.
3. Replace the stdout receipt parser and case-supplied rows. Keep a private
   parent proof keyed by the parent-owned spawn receipt.
4. Put the real PostgreSQL reader in `acceptance/obs/readback.ts`. Cases do not
   receive it. Tests mock only this module boundary.
5. Re-run the focused file three times. Kill and restore the stdout-forgery,
   missing-reader, and exact-row-match checks.

## C2 and standing checks

1. Run the real three-case CLI. Require the three exact runtime-missing `SKIP`
   lines and zero `PASS` lines.
2. Run a real family failure and require exit 1.
3. Run the standing acceptance runner and relay tests.
4. Run typecheck, source audit, scope checks, and `git diff --check`.

C3 and C4 stay deferred. This correction makes no product source change.
