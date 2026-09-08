# FIX-08 — SPEC v4 correction for replay

**Correction date:** 2026-09-04. **Scope:** C1 authority lifetime only. The
frozen `SPEC.md` stays unchanged. This file adds to `SPEC-v3.md`.

## Why this correction exists

The v3 row read-back is real, but its verdict, receipt, and proof stores are
shared across cases. A later case can reuse a saved value and print `PASS`
without running its own evidence path.

## Authority lifetime

- Every case execution gets new private verdict, receipt, and row-proof
  stores.
- A case can use only receipts created by its own context.
- A receipt and its row proof can be consumed once.
- `runFamily` accepts only a verdict minted by the current case context.
- `runFamily` consumes that verdict once when it renders the case result.
- A value from another case or another family run is never valid authority.
- These stores and checks remain internal to the runner. Cases cannot supply
  or replace them.

This rule applies to row-bearing and process-only `PASS` results.
