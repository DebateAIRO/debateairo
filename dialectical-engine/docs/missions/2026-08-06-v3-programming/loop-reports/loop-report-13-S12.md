# Loop report 13 — S12 · Settlement and scorecards (2026-08-08 late night)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S12 | ~fast |
| Gate r1: 271/272 — test-fixture answer_version omission | 3m |
| Rework 1 → gate r2: 271/272 — REAL action-kind vocab gap exposed beneath | ~6m |
| Rework 2 (kernel enum + DDL CHECK + parity) → gate r3: 273/273 | ~5m |
| Diamond rev 1: dual APPROVED, 0 blocking | ~30m |
| **Total cycle** | **~50 minutes** |

## Two recurring shapes worth a class fix if they hit once more

1. **Hand-rolled answer-table INSERT in test fixtures** (S10 root-node, S12
   answer_version) — 2 occurrences. The S13 note now instructs building the
   answer fixture via the real persist path so it cannot drift from the schema.
   If a 3rd appears: a shared fixture builder that goes through ServeRepository.
2. **New ledger action kind missing from the closed CHECK** (S01
   JUDGEMENT_SCHEDULED, S09 BUDGET_SKIP, S12 SETTLEMENT_OUTCOME_RECORDED) — 3
   occurrences. Candidate class fix: DERIVE the ledger_entry_action_kind_closed
   CHECK members from the kernel LEDGER_ACTION_KINDS enum (single source), so a
   new kernel member auto-appears in the CHECK. Flagged in the S13 note.

## Settlement verified sound

first-settled-wins under answer-scoped advisory lock, loser recorded as
SUPERSEDED_ATTEMPT (never erased) with a partial-unique-index backstop
(ADR-0017 case F); scorecards append-only derived (P5/P6); DR-089 watch
honored (separate credential, TERMINAL gate, refuses outcomes without policy).
The gate-before-diamond kept both reviewers seeing only 273/273 green.

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m · S07 1h45m
· S08 30m · S09 40m · S10 1h50m · S11 45m · S12 50m. Board: 31 done, 3 to go
(S13-S15). Six live V rulings stand.

## Next: S13 · Cross-run memory

Notes on the ticket: reads frozen prior-run records + projects (never mutates);
append-only carriers; recall over recorded content (no fabrication); action-kind
vocab discipline (the recurring class).
