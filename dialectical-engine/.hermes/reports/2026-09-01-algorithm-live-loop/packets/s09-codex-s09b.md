# PACKET — codex review S09B (judge micro-ticket; implements J28 + two items from your r3) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T17-cost-envelope.md.
The worker's three rework rounds are EXHAUSTED; S09B is a judge-authorized micro-ticket on the
T7B/T6B standing (V's veto is open and recorded on the V packet). It is not a fourth round, and
anything you find blocking becomes a V row — say so explicitly. Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-s09b.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-self.md
(append `## s09b`). No tests, builds, git changes, no live provider calls. Fresh session; your r3
verdict defines the scope.

## 2. Immediate upstream artifacts
RULINGS FIRST: J28 (reporting follows permission — WITHIN while consumed <= max; the alternative
is V's as V-S09-8), the S09B authorization at the DECISIONS tail (exact scope: apply J28; make the
receipt parser refuse an arm whose count disagrees with call_sites.serve and add the two new
members to the deletion matrix; run D28's generated sweep and recompute the hash — nothing else),
D24 + ADDENDA, D27 ADDENDUM-3, D35 + ADDENDUM, D38 (a campaign holds the worktree exclusively —
this ruling came from this seat's own contaminated run) — mission DECISIONS.md.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09 diff e040b1ee..HEAD`
(tip 265581b2, tree adbf8382, 7 commits, clean, 0 mode changes; S09B is the last 3).
Report (marker line 1; line 2 `report sha256:` verified 3c50b13e…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md
Verify:
(1) J28 APPLIED, and the consequence you found: the seat confirms the runner does not merely
    record EXHAUSTED at equality — apps/runner/src/index.ts REPLACES the served answer with the
    envelope terminal, so a lawful maximum-path run lost its output. `decideBudgetPressure` now
    reports WITHIN while consumed <= max; nothing about what is ALLOWED changed
    (`assertModelAttemptAllowed` still refuses at consumed >= max). budget-s09.test.ts had pinned
    HARD_STOP at exactly max — the case J28 rules WITHIN — and now pins both sides. The
    integration arm asserts non-vacuously that the serve.answer row EXISTS, its terminal is the
    chain's own DOWNGRADED, and it carries no ENVELOPE_EXHAUSTED. Confirm the boundary is now
    consistent in both directions and that no other consumer reads the old meaning.
(2) The receipt: the parser refuses a serve count disagreeing with its selected arm and a
    composition arm that is not its own disclosed decomposition — it caught both shared fixtures
    immediately (each declared serve 8 against a 7-site arm). The deletion matrix gains the two
    r3 members; the seat verifies mechanically that v3 requires 11 new members (2+4+5) and the
    matrix has 11. Recount that yourself.
(3) The D28 sweep: five corrected sentences (two superseded-tip provenance claims, a leftover r2
    campaign paragraph, M8's passed-count — the integration file is a COLLECTION failure under M8
    so its tests leave the count, 98 of a 99-test cluster — and a fixture docstring describing the
    retired double). Grep for survivors.
(4) EVIDENCE, and the reason this round has more than it needed: the stamp check flagged the
    campaign log as NO-STAMP because the harness wrote `campaign tip:` instead of a `commit=`
    field. Rather than edit the log — which would be fabricating evidence — the seat fixed the
    harness and RE-RAN the whole campaign, and all twelve verdicts reproduced identically
    (M1 15, M2 14, M2b 12, M7 12, M8 31, M6 6, M3 4, M4 7, M5 4, M9 4, M10 4 caught; N1 at the
    floor of 2), 12/12 hash-equal restores, final tree = filed tree. Spot-check three rows against
    the fresh log. Solo zone 7 failed/1047 with ZERO mutant tokens; set-equal to the b8 authority;
    seven in-scope records all stamping the filed tip (the orchestrator re-checked: 7, none off).
(5) Anything still blocking is a V row, not a round. (6) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW S09B — APPROVE|CHANGES · comments read through: s09b-2026-09-02`

## 4. Stop conditions
- STATIC only; ~30 minutes; CANNOT-ASSESS over guesses. Self-report `## s09b` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
