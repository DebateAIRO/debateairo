# Loop report 08 — S07 · SPLIT loop and defeaters (2026-08-08 evening)

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Continuous session claims + builds S07 | ~fast |
| Gate r1: 205/206 — stale-expected-ledger chore | ~5m |
| Rework: instance fix + made the ledger test SELF-UPDATING (globs migrations/*.sql) | ~10m |
| Gate r2: 207/207 GREEN | 2m |
| Diamond rev 1: SPLIT — both lenses converged on ONE honesty defect (false ATTACHED in orphan-audit); Opus nailed the addEdge/spawnPendingChild contradiction | ~45m |
| Rework: audit-ledger accuracy fix (no logic change) | ~10m |
| ZOMBIE cleanup: the S06 rework session was still alive ~79 min after S06 closed (hung poll loop); killed | — |
| Gate r3: 207/207 GREEN | 2m |
| Diamond rev 2: dual APPROVED (reachability traced end-to-end) | ~20m |
| **Total cycle** | **~1h45m** |

## What the loop caught

1. **The honesty audit policing itself.** The orphan-audit report — the artifact
   that keeps the fleet truthful about what's production-wired — had drifted
   into over-claiming: it marked the test-only SPLIT write path ATTACHED, and
   (Opus's catch) simultaneously marked addEdge neverCalled while its only
   caller was ATTACHED — a self-contradiction. Both lenses converged; fix was
   surgical (reclassify, no logic touched). The engine (WAIT drain as a real
   ledgered trigger, DR-050 K=1, decision-core purity) was verified STRONG.
2. Gate r1: the recurring stale-ledger chore — ENDED by making the test
   self-updating (globs the migrations dir), same class-fix approach that
   ended the migration-idempotency series.

## Ops fixes adopted (two)

1. **Zombie-guard self-exit** (now in CODING-LOOP-PROTOCOL.md step 9): a Codex
   session must END the moment its ticket is settled/reassigned, not keep
   polling. Root cause of the ~79-min S06 zombie killed this cycle. The
   orchestrator also kills sessions whose ticket is done + process is old.
2. **SysV segment sweep before each gate**: `ipcrm` stale shm segments before
   the vitest run — prevents the macOS 32-segment cap (hit at S06) from
   masquerading as a sandbox denial.

## Cadence

S01 57m · S02 53m · S03 2h15m · S04 2h55m · S05 5.5h · S06 1h40m · S07 1h45m.
Steadying in the ~1.5-2h band for mid-complexity tickets. Board: 26 done, 8
to go. Six live V rulings stand (DR-127..130).

## Next: S08 · CROSS (ruled trigger + item-scoped symmetry + critique schema)

Notes on the ticket. Watch: the CROSS trigger fires on its ruled condition
only (no always-on heuristic); item-scoped symmetry; critique schema as a
closed kernel vocabulary; claim-before-call for CROSS spawns.
