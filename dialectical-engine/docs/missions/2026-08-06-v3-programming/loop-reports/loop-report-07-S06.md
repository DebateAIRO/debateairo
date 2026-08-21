# Loop report 07 — S06 · Evidence subsystem (2026-08-08 evening)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S06 (evidence DDL deferred from S00 lands) | ~fast |
| Gate r1: 187/187 GREEN FIRST PASS | 2m |
| Diamond rev 1: SPLIT — Claude APPROVED 0 blocking / Grok 1 BLOCKING (cannot-score coupling) | ~30m |
| Rework (domain refusal + DDL CHECK + dual firing test + 2 non-blockers) | ~25m |
| Gate r2: orchestrator hit SysV shm exhaustion (host wall, 32-segment cap) -> cleared -> 195/195 GREEN | ~15m incl. env fix |
| Diamond rev 2: dual APPROVED | ~15m |
| **Total cycle** | **~1h40m** |

## The headline: the diamond earned its second lens

Claude approved rev 1 with ZERO blocking findings, having verified the eight
routes, ladder order, DDL invariants and dormant marks in depth. Grok, on the
SAME code, caught the one real hole: a citation ruled off-subject (REJECTED)
could still persist a base_score — the repository never consulted the
admissibility verdict and no CHECK coupled them (DR-115-adjacent). This is the
concrete proof of why BOTH lenses run: one lens's thorough pass had a blind
spot the other covered. Across the loop the rejector has alternated (Claude on
S00/S04/S05, Grok on S03/S06, none on S01/S02) — neither lens is a rubber stamp
for the other.

## Incidents & fixes

- **Orchestrator SysV shared-memory exhaustion**: macOS caps `kern.sysv.shmmni`
  at 32 total segments; a full day of embedded-Postgres test runs filled them,
  and the gate failed with shmget EPERM that LOOKED like the sandbox denial.
  Diagnosed (ipcs showed 32/32), cleared (ipcrm), gate green. ADOPTED: the
  orchestrator clears stale SysV segments before a gate if provisioning fails
  with shmget — a host-hygiene step, not a code signal. Worth noting the
  embedded-PG path accumulates this; a periodic ipcrm sweep keeps it healthy.

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m. S06 was
back down — a clean first-pass gate and a single-finding rework. Board: 25
done, 9 to go. Six live V rulings stand (DR-127..130 today).

## Next: S07 · SPLIT loop and defeaters (+ WAIT drain + spawn-time lifecycle)

Control-flow-heavy. Notes on the ticket: WAIT drain as a real ledgered
transition (not busy-poll / fabricated completion), claim-before-call for
defeater spawns, the DR-050 K=1 re-execution bound.
