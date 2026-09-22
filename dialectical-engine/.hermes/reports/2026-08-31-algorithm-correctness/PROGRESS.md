# PROGRESS — 2026-08-31-algorithm-correctness
Single writer: orchestrator (Fable 5 main session).

- [x] Intake: recon, codex CLI probe (codex-cli 0.147.0, model gpt-5.6-sol), four V rulings recorded
- [x] Mission skeleton + HTML input copied to board/inputs + two worktrees pinned @ 1c9578a
- [x] Packets written, tickets typed, lenses launched (codex pid 51582 + opus agent), watchdog armed
- [ ] Judge's own core-path read (intake → judgement → graph → propagation → serve → verdict)
- [ ] Walkthrough stops 1–7 with V (decisions accumulate in DECISIONS.md)
- [ ] Lens reports harvested + adjudicated (disagreements resolved with file:line on the record)
- [ ] /goal drafted from DECISIONS.md
- [ ] /goal reviewed by both lenses (≤3 rework rounds each)
- [ ] /goal delivered to V · ledger written · worktrees + processes janitored
- [ ] Self-reports collected (opus-blind, codex-audit, orchestrator's own)

Watchdog split: Codex lane = external process → Monitor on findings file + log mtime
(20-min stagnation law) + PID. Opus lane = harness-tracked Agent task → completion
notification is built-in; disk ground truth is its findings file in its worktree.

Tried/failed: (none yet)
Tried/failed log:
- 2026-08-31 codex dispatch v1 REFUSED by seat packet review (spine §4 violation).
  Price: one round + ~4 min. Fix: four-element packet v2 + typed T2 state. Lesson for
  every future dispatch this mission: packet = node contract, never a briefing.
- 2026-09-01 walkthrough stops 1–7 COMPLETE (17 V rulings in DECISIONS.md)
- 2026-09-01 judge adjudication round 1 filed (two-UI dispute settled; M8 confirmed)
- 2026-09-01 /goal drafted (goal-prompt.md, T0–T16); dual lens review dispatched (T4/T5)
- 2026-09-01 self-reports harvested; F2 dispatch-quality findings filed; LEDGER.md written
- 2026-09-01 goal-v2 → r2 (7 findings) → goal-v3 → r3 (opus APPROVE+routed; codex 2B) → goal-v4 → codex r4 APPROVE 0 findings
- 2026-09-01 BOTH LENSES APPROVE goal-v4 · all self-reports filed (opus×2, codex, orchestrator) · ledger complete
- 2026-09-01 janitor: lens processes verified exited; worktrees + branches removed (no commits ever made on them)
- MISSION DELIVERABLE COMPLETE — goal-prompt.md (v4) handed to V with 7 confirm-items
