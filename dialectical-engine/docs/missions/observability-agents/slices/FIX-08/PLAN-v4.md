# FIX-08 — PLAN v4 (replay correction)

**SPEC:** frozen `SPEC.md` plus `SPEC-v2.md`, `SPEC-v3.md`, and `SPEC-v4.md`.

1. Add RED tests for later-case replay of a row verdict, row receipt, process
   verdict, and process receipt.
2. Add a RED test for a second use of one row receipt and proof in the same
   case.
3. Move all authority stores into one private case state. Give the public case
   context no access to that state.
4. Consume receipts when a case asks for `PASS`. Consume the returned verdict
   when `runFamily` renders the current case.
5. Kill and restore three mutants: shared verdict state, receipt reuse, and
   cross-context receipt acceptance.
6. Run focused tests three times, standing suites, real SKIP and FAIL CLIs,
   typecheck, source audit, scope checks, and `git diff --check`.

This correction changes no product source. C3 and C4 remain deferred.
