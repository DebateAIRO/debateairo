# PACKET — codex review S08 (T12 band over cited nodes + T13 downgrade + F30 step-down) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T12-T13-band-downgrade.md
(rework 1/3; two rounds remain). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S08-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S08-codex-self.md
(create either if absent). No tests, builds, git changes, no live provider calls. Fresh session.
NOTE: this lane filed r1 and r2 before any codex pass — review BOTH as one round. r1 delivered
T12 and T13; r2 added F30's degraded-panel step-down after the orchestrator's r1 packet omitted
that input (the omission is ledgered as the orchestrator's).

## 2. Immediate upstream artifacts
RULINGS FIRST: J1, J16, J17, J23 (the PRODUCTION widening of the cited set is T9's charge, not
this lane's — this lane's engine change stands and the pairing is the flagship run's to
demonstrate), J25 (an in-memory disclosure is not a disclosure), D24 + ADDENDA, D27 ADDENDUM-3
(the corrected stamp comparator; the earlier forms were the orchestrator's and were broken), D28,
D31, D35, D37, D38 — mission DECISIONS.md. Board F30 (the step-down's route) and F5 (the
do-not-tidy guard on the dead RAN bucket) are in board/.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08 diff e040b1ee..HEAD`
(tip ac7f4832, tree 3c5b402c, clean, 0 mode changes).
Report (marker line 1; line 2 `report sha256:` = `sed '2d' <file> | shasum -a 256`):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s08-band-downgrade.md
+ self-report beside it. Logs under
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s08/
Verify, priority order:
(1) T12: the band basis and the downgrade predicate read the nodes the statement CITES restricted
    to conformance-VERIFIED segments, replacing the load-bearing serve set; an uncited statement
    stops loudly (SERVED_STATEMENT_CITES_NO_VERIFIED_NODE) rather than downgrading on an empty
    `.every(...)`. RED on baseline, GREEN after; a homogeneous multi-node case still yields 0/1;
    the mono-maker one-step-down is preserved.
(2) T13: all-cited-REASONING yields terminal DOWNGRADED with form HYPOTHESIS_WITH_RESEARCH_PLAN,
    both segments synthesizer-written, label and band still shown. T9 rewrites the composition
    seam in an unmerged lane; the seat wrote against the current seam and says so.
(3) F30: `applyPanelDegradedBandStepDown` applies T3's recorded degraded-panel step-down through
    T16's sealed downgradeBands row (no band value chosen in code), wired between the
    mono-lineage cap and the disputed-review arm. SCOPE DECISION to test rather than accept: the
    SERVED ROOT's own record steps the band (J16(a) reads answer-scope quantities from the served
    root; T11 takes its dispersion from that node), the disputed-review arm beside it stays
    run-scope deliberately, and only the single-voice collapse steps the band — PANEL-PARTIAL
    records no step-down. Is that the right reading of confirm-item 5, and is the reason written
    at the site?
(4) REACHABILITY and J25: a test runs the repo's own `auditSurfaceReachability()` and asserts the
    arm is reachable from main.ts (declared-but-uncalled is not reachable); mutant f4 restores the
    exact F30 defect (arm exported, serve path ignores it) and that test goes RED. Then ask J25's
    question: which PERSISTED row or projection carries the stepped band, and is it asserted
    there rather than on a returned value?
(5) F-S08-5, the seat's disclosed blind spot: T16's band vocabulary has two members, so "one step
    down" and "step to the floor" are observationally identical on that path — mutant
    b1-blind-spot-double-step applies a genuine double step and the suite stays green; 17 of 18
    assertions have a named killer and the floor-is-a-fixed-point test has none, which the seat
    states rather than counts. Confirm the analysis; say whether anything cheap closes it.
(6) EVIDENCE: r1 RED 6 failed/11 on baseline and GREEN 11/11; r2 F30 RED 7 failed/18 at the r1 tip
    and GREEN 18/18 at the filed tip; 17 mutants (14 catch, 2 neighbours) at the r2 tip with D24
    gates; cluster ×3 worst 137/140 with all three failures pre-existing and verified BY PAYLOAD
    (the two scaffold failures print byte-identical obs-capture items at base and tip); zone
    set-equality with three TIP-only names each proven an F22 member by solo pass; no zone run in
    r2 under the host restriction, with the payload check standing in — is that adequate?
(7) The end-to-end leg is written into T3's confirm-item-5 acceptance file, typechecked, and NOT
    executed (J18 routes execution to W12) — confirm it is written to FAIL if the step-down is
    absent, so W12 actually tests something.
(8) Packet review of THIS packet and of the r1 packet, which omitted F30; check nothing else was
    dropped with it.

## 3. Handoff marker
First line: `CODEX REVIEW S08 r2 — APPROVE|CHANGES · comments read through: s08-r2-2026-09-02`

## 4. Stop conditions
- STATIC only; ~40 minutes; CANNOT-ASSESS over guesses. Self-report `## r2` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
