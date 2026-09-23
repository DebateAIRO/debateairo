# PACKET — codex review S09 r2 (your four r1 findings; one of them refuted the lane's own claim) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T17-cost-envelope.md
(rework 1/3; two rounds remain). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-self.md
(append `## r2`). No tests, builds, git changes, no live provider calls. Fresh session; your r1
verdict defines the scope.

## 2. Immediate upstream artifacts
RULINGS FIRST: D35 (new, from this filing: where a quantity can be measured from the system, that
measurement is the oracle; an enumeration written from the same reading is not a second opinion),
J12, J25, D24 + ADDENDA, D25, D27 + ADDENDUM, D28 — mission DECISIONS.md.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09 diff e040b1ee..HEAD`
(tip 4bbb13e5, tree f77b804a, 3 commits, clean; 16 files +1140/−50).
Report (marker line 1; line 2 `report sha256:` verified d62d1abb…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md
Logs under .../logs/s09/, including the new tests/integration/t17-envelope-ledger.test.ts run.
Verify, priority order:
(1) THE RETRACTION, which is the round's substance: the seat now says
    createPostgresProviderGateway (apps/runner/src/index.ts:3565-3577) counts attempts
    CUMULATIVELY per call-site key and passes remaining = maxAttempts − consumed, so a cooldown
    site's allowance is judge + final — the old formula's value — and its r1 "second undercount"
    was wrong. Read that code yourself and rule on the retraction. If the retraction is itself
    wrong, say so: this is the one place where agreeing with the seat is as dangerous as
    agreeing with its r1 claim was.
(2) B1's replacement: tests/integration/t17-envelope-ledger.test.ts runs a real M=2 debate with
    every site failing to its last allowed attempt and asserts from THAT run's ledger — 8 PANEL
    sites, 24 panel attempts, every JUDGE site exactly 4, total exactly 92, inside the new 112
    and above the old 88, terminal ENVELOPE_STATE WITHIN. Verify it reads the ledger rather than
    a model, and that 92 > 88 is stated correctly (it means the old ceiling would have refused a
    lawful run — the lane's justification).
(3) B2: maxDepth sealed into the T16 row; depth 6 is now a typed AskRefusal at admission. The
    seat discloses that register→budget is a cycle and apps/api has no budget edge, so the sealed
    row was the only route adding no third constant reachable from admission, and that this
    leaves a three-way statement of the 1..5 range (F-S09-6, routed to T1 whose literals it did
    not touch). Assess both the mechanism and the disclosure.
(4) B3: all nine new disclosure members pinned one at a time. B4: paired proof at the exact tip;
    diff accounting refreshed. The stale-stamp check printed nothing (the orchestrator re-ran it
    and found only the RED log naming its base commit, which the report explains).
(5) The r2 campaign: 7 caught, neighbour not caught, including M2b which re-applies the retracted
    over-count and is now rejected — confirm that mutant actually encodes the retracted claim.
(6) Under D35: does anything ELSE in this lane rest on an enumeration that shares the code's
    premises? Name it if so.
(7) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW S09 r2 — APPROVE|CHANGES · comments read through: s09-r2-2026-09-02`

## 4. Stop conditions
- STATIC only; ~35 minutes; CANNOT-ASSESS over guesses. Self-report `## r2` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
