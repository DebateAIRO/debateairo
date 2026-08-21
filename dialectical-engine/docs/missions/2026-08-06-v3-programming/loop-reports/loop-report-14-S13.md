# Loop report 14 — S13 · Cross-run memory (2026-08-09 early hours)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S13 | ~fast |
| Gate r1: 282/283 — REAL product defect (jsonb_object_length nonexistent PG fn) | 3m |
| Rework 1 → gate r2: 282/283 — fixture double-TERMINAL beneath it | ~6m |
| Rework 2 (fixture fix + CLASS FIX settledRun helper) → gate r3: 284/284 | ~6m |
| Diamond rev 1: dual APPROVED, 0 blocking (Opus ran real-PG first-hand) | ~30m |
| **Total cycle** | **~50 minutes** |

## The r1 defect: why the outside-sandbox gate is load-bearing

S13's match SQL called `jsonb_object_length()` — a function that does not
exist in PostgreSQL. It passed 233 in-sandbox tests because the worker's
sandbox cannot run PostgreSQL; the query was never executed until the
orchestrator's real-PG gate ran it. This is the single clearest example of
why the gate-before-diamond runs the DB suite OUTSIDE the worker's sandbox:
a whole class of defect (nonexistent functions, real constraint violations,
type mismatches) is invisible in-sandbox and only surfaces against a real
database.

## The 4th defect class killed

Three hand-rolled-fixture bugs (S10 root-node, S12 answer_version, S13
double-TERMINAL) -> a shared `tests/support/settledRun.ts::persistTerminalRun`
helper that builds a valid terminal+settled run through ONE ServeRepository
path, with an architecture test forbidding direct run_progress_event inserts
in fixtures. Fourth class retired systemically (after migration-idempotency,
stale-ledger, attachment-honesty).

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m · S07 1h45m
· S08 30m · S09 40m · S10 1h50m · S11 45m · S12 50m · S13 50m. Board: 32 done,
2 to go. **All deep engine organs (S00-S13) are built and dual-verified.**
Remaining: S14 (UI data-layer rebuild) + S15 (launch bundle).

## Next: S14 · UI data-layer rebuild — the reader-facing surface

The kept V2 UI at web/. The whole point (AC-59): consume packages/contract
types ONLY, no hand-mirror (V2's types.ts was the death-list exhibit). The
orphan audit now walks web/ for AC-61 bidirectional no-orphan. Expect S05-level
scrutiny: this is what readers touch. The S05 security lesson (ownership-scoped
reads) and the one-transport law (SSE on the single front door, not V2's
3-path seam) both apply. The web/ localeCompare tiebreak lands here (its home).
