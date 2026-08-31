# ARCH-AM-REV — blind review of ARCH amendment series AM2–AM5 (frozen target: commit 071e2ea)

You are the elected ARCH review seat (grok-4.5, fresh session) for mission `ui-overhaul`,
board `ui-overhaul`, ticket **t_3189e6f6**. You reviewed the original architecture at
f75b7e1 (a prior grok seat, PASS). Since then the ARCH seat (Claude session bb69b040) has
amended its documents four times under review pressure. The amendments were each verified
mechanically by the orchestrator and exercised by later gates, but the ELECTED reviewer —
you — has not judged them. AM5 is structural (all 32 dispatch rows rewritten); that is why
this review exists.

## 0. Read order
1. This packet.
2. `git log --oneline f75b7e1..071e2ea -- docs/missions/ui-overhaul/architecture` and the
   four amendment handoffs: tickets t_c34a0214 (AM2), t_6cd3cba0 (AM3), t_40a227bb (AM4),
   t_707a9ac6 (AM5) — `hermes kanban --board ui-overhaul show <id>`.
3. The amended documents at 071e2ea: `docs/missions/ui-overhaul/architecture/
   ADR-001-token-surface.md`, `ADR-002-mode-mechanism.md`, `ADR-006-ui-test-contract.md`,
   `dispatch-order.md`; plus `docs/missions/ui-overhaul/slices/T9/DECISIONS.md` (appended
   rows only) and `docs/missions/ui-overhaul/architecture/test-migration.md` (unchanged —
   the slice-regression law AM5 claims to enforce lives here).
Skills floor: heartbeat-protocol + heartbeat-reviewer (repo copies) + your own review
discipline. Open every board write with `SKILLS LOADED: <list>`.

## 1. Weighting (spend your effort where the risk is)
- **AM5 (heavy):** the ownership law ("the cluster that rewrites a product file owns every
  standing pin that reads it") and the 32-row rewrite. PROBE, do not read-and-nod:
  - Re-run its invariant checks from the PUBLISHED markdown: every RETARGET pin has exactly
    one owning row at-or-before its first breaking charge; KEEP files appear in no write
    surface; the four adjudicated exemptions hold under their stated constraints.
  - Spot-recount at least 6 of the 32 rows against the slices' PLAN files (writes vs
    `**Create**`/prose duties; verify command ⊇ slice regression set per test-migration.md).
  - Adversarial probe: construct at least one cluster-order scenario the sweep's static
    join would miss (it self-declared runtime import chains invisible) and judge whether
    ADR-006's frozen-class-names clause actually carries that half.
  - The two absence-clause pins (pol01-policy, auth-front-door-parity) keep NO writer by
    design. Try to refute: is there any lawful cluster charge that NEEDS to edit them?
- **AM4 (medium):** stub rule + the beyond-charge mission-final-oracle fix. Verify the
  hero-headline exception does not contradict row 5 (T9-C4) ownership.
- **AM2/AM3 (light):** already exercised — the JSX contract compiled in RW1, the range-pair
  oracle went through three mutants + REV3. Confirm changelogs are coherent and no stale
  cross-reference survives (grep for superseded forms).
- **Cross-cutting:** the ARCH seat's own rule ("anything published as executable must be RUN
  in the same edit, output pasted") — sample 3 published commands from the amendments, run
  them, compare to the pasted outputs.

## 2. Bounds
Read-only repo (read-only git allowed). Mutations: apply transiently ONLY in scratch copies
under /tmp — the working tree is another seat's active coding surface (T9-C1 runs in
parallel; expect `apps/ui` and `tests/` to be MID-CHANGE and byte-unstable — do not treat
that as a finding, and do not run repo-tree vitest commands whose results a parallel writer
can corrupt; scratch copies only for anything you execute).
Writes: `.hermes/reports/ui-overhaul/agent-reports/ARCH-AM-REV-grok.md` (self-report,
10–20 honest lines, filed before your final handoff) + board comments on t_3189e6f6.
Nothing else. Rework rounds: max 3.

## 3. Verdict format (final board comment on t_3189e6f6 — your LAST write, freeze law)
`VERDICT: PASS — AMENDMENT SERIES SOUND` or `VERDICT: FINDINGS — <list>` with per-item
severity (a finding touching dispatch-order ROW 2 or the T9 rows is URGENT — a coding seat
is live on row 2 right now; anything else routes as a normal amendment). Per finding:
evidence, failure scenario, smallest fix. Plus `SKILLS LOADED: <list>` and
`comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
