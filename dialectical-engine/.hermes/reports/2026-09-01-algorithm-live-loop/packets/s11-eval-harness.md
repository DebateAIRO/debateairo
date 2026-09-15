# PACKET — worker S11 (T15 eval harness + T15b role decision) · filing r1 = rework 0/3 · spine §4

## 1. Ticket-state block
Ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T15-eval-harness.md
(rework rounds max 3; markers state filing label AND rework count — J19). Writable surface:
EXACTLY the ticket's allowed list — lane worktree
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s11
(branch lane/s11 off e040b1ee, PROVISIONED, core.fileMode=false), report
agent-reports/s11-eval-harness.md, self-report agent-reports/s11-eval-harness-self.md,
logs/s11/**. Never push; never merge; never edit board or DECISIONS files.

## 2. Immediate upstream artifacts
THE SPEND GATE, first and absolutely: this lane BUILDS the harness and PRINTS the projected
call count. It does NOT make a live provider call. The goal's own text makes the run an
important-operation gate: "projected call count printed BEFORE any provider call and the run
proceeds only on explicit V approval". V's authorization of this lane is NOT authorization of
the run. If you believe a live call is needed to finish a DoD row, write BLOCKED
(waiting_human) on line 1 and stop. D18 also stands: never mint, read or pass a credential
value.
RULINGS FIRST: J8 (role refs live in T16's sealed rows — synthesizerRoleRef,
evaluatorRoleRef, evaluatorLoopMaxRounds; the harness reads them, never constants), J12 +
the entry-point class (S06 B1, F33, F34), J16-J19, D13-D16, D18, D21, D24 + ADDENDA, D27 —
mission DECISIONS.md, path in the ticket.
SPEC (FROZEN, verbatim goal 309-320):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/slices/S11-eval-harness/SPEC.md
CROSS-LANE FACT: T9 (lane/s07, unmerged) owns the synthesizer/evaluator roles this harness
grades. Read that lane to learn the request shapes; never edit it. Your harness must run
against the roles as T9 defines them, and you say in the report which tip you read.
Order of work (RED before GREEN where a test is possible):
1. The exact matrix, spend-bounded: 5 recorded debates REUSED from acceptance-run fixtures (no
   new debate generation) × 3 candidate role configs × at most 2 evaluator rounds; graded blind
   by 2 graders that are never the candidate; per-call max attempts and a token ceiling stated
   in the harness config, not in code comments.
2. One command runs it. BEFORE any provider call it prints the projected call count and the
   token ceiling and stops unless an explicit approval flag is present — a test asserts the
   projected-count output and asserts that the harness refuses to proceed without approval
   (this is the DoD's "spend gate demonstrated").
3. The comparison table is produced from recorded runs; T15b routes it to V. Until V decides,
   the roles keep T16's dev-provisional defaults; no role ref is shipped arbitrarily. Write the
   seeding path so that V's choice becomes a register row edit, and leave the row unchanged.
4. Suites: root typecheck; focused clusters ×3; mode-change count 0; D14/D16 only if those
   surfaces change.

## 3. Handoff marker
Line 1: `READY FOR PEER REVIEW — S11 r1 (rework 0/3) · comments read through: packet-s11-2026-09-02`;
line 2 `report sha256:`; self-report BEFORE the marker.

## 4. Stop conditions
- No live provider call, full stop, without V's explicit approval of the printed projection.
- HOST HOLD may be in force at dispatch — the orchestrator will say; if so, start no vitest/tsc
  until "HOST RELEASED".
- Final message = `FILED: <path>` + marker + the projected-count output verbatim + the
  spend-gate test's RED/GREEN log paths + the comparison table's location.

---

## 5. DISPATCH ADDENDUM — 2026-09-02 19:3x EEST (facts that moved after §1–§4 were written)

The packet body above stands unchanged; this section only updates constants that moved and
adds one step. Where they disagree, this section wins because it was written later, and I say
so rather than editing the body and hiding the change.

**Your base is stale by four lanes.** `lane/s11` is at `e040b1ee`. The mission integration
branch `mission/2026-09-01-algorithm-live-loop` is now at `44836ecf101066c822f317233912c0c99beab2dc`
in `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration`,
carrying TINT1, T6, S06 and T7.

**Step 0, before anything in §2's order of work: merge `44836ecf` into `lane/s11`,** then
re-run `pnpm install --frozen-lockfile` and `pnpm run generate:contract` if the merge touched
the lockfile or contract sources. Build the harness against the merged tip, not against
`e040b1ee`. A harness that grades the entry point as it stood four lanes ago grades code that
will not ship. You may not weaken any landed lane's assertions to make the merge green; a
genuine conflict with a landed assertion is a finding you file and stop on.

**Two things are in flight and are NOT yours.** T3C (`lane/t3c`, the shipped entry point's
`panelPolicy` and claim-time probe, F33/F34/F37) is in merge review and not merged. T12+T13
(`lane/s08`, the band basis) has a PASS verdict and is merging in. If your harness depends on
either surface, read it where it lives, say in your report which tip you read, and do not
copy their code into your lane.

**The spend gate in §2 is unchanged and absolute.** V authorized DISPATCHING this lane. That
is not authorization to make a live provider call. Print the projection, build the refusal,
test the refusal, and stop. If a DoD row cannot close without a live call, file BLOCKED
(waiting_human) on line 1 with the projected count and the exact command V would approve.
