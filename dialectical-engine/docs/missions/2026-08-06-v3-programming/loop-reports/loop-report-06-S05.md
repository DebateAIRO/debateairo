# Loop report 06 — S05 · Serve pipeline hardened (2026-08-08 afternoon/evening)

The loop's hardest ticket. Serve is the reader-facing organ; the diamond
treated it with maximum suspicion, and that was correct.

## Wall-clock accounting

| Phase | Duration |
|---|---|
| Build → gate r1 (migration idempotency, 3rd of class) → class-fix lint ordered | fast build + ~10m |
| Gate r2: 151/151 green with migration lint landed | 2m |
| Diamond rev 1: SPLIT, 4 blocking total (Grok B1 terminal-as-value; Claude C1 SECURITY inspection scoping, C2 band-cap-rule-as-boolean, C3 uncalled AC-86..90 + asserted verdict_state) + 2 V spec questions | ~1h |
| V RULINGS LIVE: DR-129 (order pin), DR-130 (serve_state → 3 members, the harder law-faithful path) | minutes |
| Rework rounds 1-3 (partial pre-verdict landed; then consolidated: security, band-cap rule, attach-or-declare, DR-130 correction) | ~2.5h across rounds |
| Gate r3: 6 real-PG failures on first contact (incl. the new pairing CHECK rejecting the happy path) → fixed → 156/156 | ~30m |
| Orchestrator toolchain fix: pnpm verify-deps-before-run aborted on non-TTY; disabled | — |
| Diamond rev 2: dual APPROVED, both lenses reproduced 156/156 on real PG, security scoping traced end-to-end | ~40m |
| **Total cycle** | **~5.5 hours** |

## What the loop caught (highest-value cycle)

1. **A security defect**: the tier-2 inspection route readable by any asker for
   any answer (inverted audience + discarded principal + no ownership filter +
   any-token-grants-operator). Found by the Claude lens, fixed, and the fix
   proven on real PG (non-owner → null).
2. **A ruled rule implemented as a boolean shim**: the band-cap "gate" returned
   a supplied flag instead of computing the ceiling from the WOK basis. Now
   domain logic against register cuts.
3. **The uncalled-law class again** (AC-86..90 landed but never called;
   verdict_state asserted not derived) — the exact class S04 settled; the
   honesty-row standard held it.
4. **Migration-hygiene series ENDED**: the 3rd idempotency event triggered a
   standing text-level migration-replay-safety LINT wired into pnpm run lint,
   with teeth verified. The class cannot recur silently in-sandbox now.
5. Two live V rulings (DR-129 pin, DR-130 the harder correction — V chose
   law-faithful over cheap), minted in minutes under day mode.

## Loop deltas adopted

- Full gate logs now copied into the workspace (handoffs/SXX-gateN.log) so the
  sandboxed worker reads every failure + stack, not a summary.
- pnpm verify-deps-before-run disabled (config) — removes a non-TTY abort from
  the orchestrator's gate path.
- The reworked-serve-surface-vs-real-PG pattern: expect first-contact DB
  failures on large reworks (the worker's sandbox can't run them). Not a
  worker defect; budget a gate round for it.

## Cadence & standing

S01 57m · S02 ~53m · S03 ~2h15m · S04 ~2h55m · S05 ~5.5h. The curve tracks
organ criticality, not loop decay: serve earned every minute. Board: 24 done,
10 to go. Six live V rulings total across the loop (DR-127..DR-130 today).

## Next: S06 · Evidence subsystem (ruled gates + ratified routes + row contracts)

Notes on the ticket. The evidence schema DDL lands here (deferred from S00).
Watch: honesty-row standard, migration lint, and the composition-budget-unit
VG-02 question if evidence sizing intersects.
