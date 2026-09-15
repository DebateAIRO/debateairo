# [claude@opus-5] F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED · the UI token-unlock classifier interpolates a raw error message into an operator-facing string

```yaml
state:
  ticket: F-DIAG-TOKEN-UNLOCK-UNCLASSIFIED
  risk_tier: low
  status: done # 19:26 2026-09-07 codex r1c APPROVE at 12e054d9 (two rework rounds); merged into dev 80559019 (D70)
  owner: { agent: claude, session: diag-class-a-worker }
  contract: { allowed: [apps/ui/lib/v3/tokenUnlock.ts (classifyTokenUnlockFailure :30 and its caller :77), its unit test], readonly: [apps/api/src/risk-signal-identity.ts (the landed pattern: explicit map + fixed fallback), agent-reports/risk-signal-diagnostics.md (the class sweep), logs/risk-signal-diagnostics/02-sweep.log], forbidden: all_others, verification: [RED: an UNCLASSIFIED failure renders a fixed operator string with a bounded category, never the raw message; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a, branch: lane/diag-class-a, merge_status: merged-into-dev-80559019 }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-2026-09-07
```

**Filed from the risk-signal-diagnostics seat's class sweep (2026-09-07), Class A member 5.** `apps/ui/lib/v3/tokenUnlock.ts:77` → `classifyTokenUnlockFailure:30`: the `UNCLASSIFIED` branch interpolates `error.message` into an operator-facing string. Same class as F-RISK-IDENTITY-LOG. Lower tier (UI, operator-facing, no log sink named). **Outcome:** bounded text with a fixed fallback.
