# ARCH-01-AM12a — two RW1 blockers only (ticket t_33f1eb6a)

Same ARCH session (bb69b040). The T1-C2 review returned REWORK with three blockers; two
of the three need YOUR ruling before the worker can move. Deliver ONLY these two; the
review's larger batch (N1 gold/contested, N3 ramp, N7 anti-gate oracle, the token-role
oracle decision and the 8 queued tickets) is AM12b, a separate later round — do not
spend this session on it.

## Charge 1 — B2: the review-mark enumeration is not a partition
The T1-C2 cell (dispatch-order row 8 / PLAN T1-C2 HOW) enumerates
`data-review="agreed" | "disputed" | "absent"`. The contract union is
`agree | dispute | cannot-assess`. The shipped ternary maps two; a completed
cannot-assess review renders as `absent` — the reviewer measured it with a probe
element (`data-node-review="cannot-assess"` → `data-review="absent"`). It was
unreachable in every fixture because `tests/support/v2uiFixtures.ts` types the review
helper to two outcomes — rule on widening that type as part of the cell (the fixture
gap is WHY no RED existed).
Amend the cell to a TOTAL mapping over the contract union. The reviewer's probe shows
the honest option (a fourth rendered value); a justified fold is also available if you
measure a reason. Reproduce-first: state the probe you ran (the reviewer's or your own).

## Charge 2 — N4 (t_a862b1b5): four stances, three line tokens
PLAN enumerates `data-stance="pro"|"con"|"reasoning"|"root"` and names only
`--pro-line`/`--con-line`/`--reasoning-line`. The shipped `stanceLine` has three arms;
root and reasoning tabs paint identically (DebateCanvas:232-237; DebateMap hub same).
Name the root treatment: a fourth token binding (existing wave-0 token only — no new
tokens without measuring the ADR-001 cost) or RATIFY root=reasoning explicitly in the
cell so the collapse is law rather than accident.

## Bounds
- Writes: `docs/missions/ui-overhaul/architecture/dispatch-order.md` (row-8 cell text +
  changelog "AM12a"), `docs/missions/ui-overhaul/slices/T1/PLAN.md` ONLY if the cell
  lives there verbatim (state which file you touched and why),
  `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md` ("AM12a" append).
  NO test or product files; no git.
- Re-run the AM5 ownership invariant over any row you touch; paste the result.
- Live-lane awareness: none — the tree is idle; the worker resumes AFTER your handoff.

## Handoff
Final board comment on t_33f1eb6a (LAST write — freeze law): `AMENDMENT COMPLETE:
AM12a — <one line per charge>` + amended cell text verbatim + invariant result +
`SKILLS LOADED:` + `comments read through:`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep
the unfinished goal/session alive and resumable. Silence is normal; unchanged state
needs no message. Termination requires the spine's goal-specific FULLY DONE condition.
