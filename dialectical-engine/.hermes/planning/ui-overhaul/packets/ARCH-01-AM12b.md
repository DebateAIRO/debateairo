# ARCH-01-AM12b — the accumulated ruling batch (ticket t_4e80c7bf as anchor; 10 items)

Same ARCH session (bb69b040). AM12a delivered the two RW1 blockers; this round clears
the accumulated ARCH queue. **HARD CONSTRAINT: CODE-T1C2-RW1 is LIVE in parallel,
implementing cells T1-C2-5/6 — do NOT touch row 8 or any T1-C2 cell this session.** Any
ruling whose remedy would change T1-C2's cells becomes a FUTURE routed row (T1-C3,
T1-C4, or a post-rework addendum), stated as such.

## The batch (rule each; smallest-remedy bias; measure before ruling)
1. **N7 (t_4e80c7bf) — ADR-001's oracle is an anti-gate.** Two live reproductions
   (rg-absent → 0; over-escaped pattern → stderr error → 0 on a tree with 12). Give it
   ADR-006's two guards: tool-liveness probe + discrimination proof. ADR-001 text edit.
2. **t_47057270 — ADR-006 baseline re-anchor.** TS2322 moved (1488,11)→(1490,11) at
   T1-C1 (verified verbatim-same diagnostic, count 1). Re-anchor — and DECIDE whether
   the filter becomes permanently line-agnostic-with-count=1 (three more T1 clusters
   write near it; recommendation in the ticket).
3. **N1 (t_265188c4) — Chamber working≡contested + gold's one out-of-reservation
   binding.** Retoken contested off gold (restores distinctness AND the reservation) or
   put the strict-reading question on the V packet. If retokening: product change →
   FUTURE routed row, not RW1.
4. **t_ac92d301 — the token-role oracle decision.** Three review rounds have now proven
   token CHOICE mechanically unguarded (T1-C1 M10; T1-C2 ME/MF/MH all green). The T1-C2
   reviewer sized the fix at ~40 lines. Decide: ship a role-map pin (name the owner —
   likely a small dedicated cluster or T1-C4 extension) or record why not. Also rule
   the T1-C1 gold coupling half (retoken to --gen-*/--score-uncertainty-* or ratify).
5. **N3 (t_c2f04a9f) — DebateMap depth ramp deleted with its literals; con-arc
   distinction unpinned.** Rule: restore (token-derived) or retire (record); pin the
   arc distinction or fold it under item 4's oracle.
6. **t_d20dcdb4 — widening drift residual** (T9): standing alarm or covered-by-review.
7. **t_e10b860e — N4 per-li exclusivity** (T9-C4): ratify reviewer's no-change or charge.
8. **t_db63b519 — N12 wording**: the detection rule is "RED iff the drifted schema
   rejects the fixture" — one changelog/ADR-004 wording fix.
9. **t_48ac899c — T9 slice-close bind scope**: include the mission's ten new pins in
   row 6's bind or state the exclusion as design.
10. **t_7fd7c80c — mount rationale unreachable** (tree:null only at
    PublicDebatePageClient:46): rewrite PLAN HOW/ADR-002 rationale to the reachable
    case. **t_9f2c9368 — source-tag counting sweep**: DESIGN the sweep (method + owner
    + when), do not run it.

## Bounds
- Writes: `docs/missions/ui-overhaul/architecture/**` (dispatch-order changelog +
  ADR-001/004/005/006 as needed — NOT row 8/T1-C2 cells), T9/T1 DECISIONS rows if a
  ruling is V-visible, `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md`
  ("AM12b" append). NO product/test files; no git.
- Re-run the AM5 invariant if any Writes/verify column moves. Paste it either way.
- Every ruling gets one line: ADOPTED/REFUSED/DEFERRED-to-<owner> + the measurement.

## Handoff
Final board comment on t_4e80c7bf (LAST write — freeze law): `AMENDMENT COMPLETE:
AM12b — <one line per item, numbered 1-10>` + invariant + `SKILLS LOADED:` +
`comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
