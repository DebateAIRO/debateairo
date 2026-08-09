# Loop report 09 — S08 · CROSS (2026-08-08 evening)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S08 | ~fast |
| Gate: 225/225 GREEN FIRST PASS (3rd clean gate, after S03/S06) | 2m |
| Diamond rev 1: dual APPROVED, 0 blocking | ~25m |
| **Total cycle** | **~30 minutes** |

## Notes

- Cleanest cycle since S01/S02. No rework round. The honesty-row discipline
  S07 blocked on was applied correctly on the first pass — Codex is now
  internalizing the standing lessons rather than re-learning them per ticket
  (the loop-report/notes-on-ticket channel is compounding).
- The CROSS trigger is a DR-115/AC-76 hotspot (a tempting place for an
  always-on heuristic or an invented threshold); both lenses traced it to the
  ruled DR-019 knob 3 and found no invented constant.
- One good deferral captured: the casual CROSS limb doesn't yet carry the
  "contested verdict always CROSS" signal (a judgement-time input owned by the
  later CROSS runner composition) — routed forward, not lost.

## Rising debt to watch (not yet blocking)

The Drizzle schema carrier now lags the hand-SQL authority across S07 + S08
(5+ tables) plus the older decision_record. Hand-SQL is the ruled authority
(P17) so this is not a correctness risk, but drizzle-kit generate would emit
drops. Flagged for a possible consolidation ticket if it keeps growing;
S09 note asks the worker to close the gap for tables it touches.

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m · S07 1h45m
· S08 30m. Board: 27 done, 7 to go. Six live V rulings stand.

## Next: S09 · Budget and envelope (ratified split + ruled tier authority)

Notes on the ticket: the ratified 71-row split, tier authority via the P8
chain, envelope basis frozen at run start (AC-50), budget from the attempt
ledger not a counter.
