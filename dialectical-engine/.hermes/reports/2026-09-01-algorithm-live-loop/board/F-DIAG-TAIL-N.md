# [claude@opus-5] F-DIAG-TAIL-N · two filing corrections on the diag-tail lane (a mislabelled TLS control; wrong aggregate counts)

```yaml
state:
  ticket: F-DIAG-TAIL-N
  risk_tier: low
  status: waiting_human # 09:47 2026-09-09 dispatched to the lane/stub-class Opus seat (/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/stub-class-worker.md); codex review after
  owner: { agent: claude, session: stub-class-worker }
  contract: { allowed: [tests/unit/dev-auth-stack.test.ts (the control's name and comment at :479–490 only, or a genuine start-rejection identity control added beside it), agent-reports/diag-tail.md (append a CORRECTION section)], readonly: [logs/diag-tail/], forbidden: all_others, verification: [the control is named for what it executes (a no-cause readiness-timeout control) or a real pass-through control exists; the filing's totals derived from the r3 records (13 exit-0 + 4 exit-1 gates; 1,106 distinct cases, 1,206 executions); codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-stub-class, branch: lane/stub-class, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-tail-r1-2026-09-07
```

**Filed from codex diag-tail r1 N1/N2 (2026-09-07, non-blocking).** N1: the TLS control at `tests/unit/dev-auth-stack.test.ts:479–490` supplies a successful start and null public probes, so it exercises the readiness-timeout error at `tls-front-door.mjs:318`, never the start-rejection pass-through at :295–297 that its name and comment claim. N2: the filing calls 14 of 17 gates green and reports 1,163 cases; the records give 13 exit-0 + 4 exit-1 (three baseline-identical typechecks and the wider sweep), 1,106 distinct cases (1,105 pass, one known red), 1,206 executions. **Outcome:** the control named for what it does (or a real pass-through control added); the totals corrected from the records.

## 2026-09-16 continuation
Moved `working` → **`waiting_human`**, NOT `done`, by RECORDS(CONT-T19). Outcome 3 **N1** landed in
**Task 8** at commit `3e57f932` (the dev-auth-stack control is renamed for the readiness timeout it
actually executes), inside `cd9d546a..496b10f9`.
**N2 cannot be done on this host, and that is the whole reason this ticket stays open.** The diag-tail
report correction has to be made against the r3 records under `logs/diag-tail/r3-*`, which exist **only on
the laptop**: the mission's records reached this machine through the archive merges `21582ba0` and
`7248b335`, and those archives carry no `logs/` tree. Ruled INFEASIBLE-ON-THIS-HOST by the orchestrator
(SDD ledger :55). STRENGTH: entailed.
**What would close it:** the operator runs the correction on the laptop, or copies `logs/diag-tail/r3-*`
onto this host. No seat can do it from here.
