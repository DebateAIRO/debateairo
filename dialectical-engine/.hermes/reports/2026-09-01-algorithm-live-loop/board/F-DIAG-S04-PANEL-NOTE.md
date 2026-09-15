# [claude@opus-5] F-DIAG-S04-PANEL-NOTE · the judgement S04 path forwards a raw caught message into a panel note

```yaml
state:
  ticket: F-DIAG-S04-PANEL-NOTE
  risk_tier: medium
  status: done # 19:26 2026-09-07 codex r1c APPROVE at 12e054d9 (two rework rounds); merged into dev 80559019 (D70)
  owner: { agent: claude, session: diag-class-a-worker }
  contract: { allowed: [packages/judgement/src/s04.ts (the note at :245 only), its unit test], readonly: [agent-reports/diag-bounded.md (the findings), apps/api/src/risk-signal-identity.ts (the pattern)], forbidden: all_others, verification: [RED: a synthetic sensitive message never reaches the panel note; known constants map to bounded text; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-diag-class-a, branch: lane/diag-class-a, merge_status: merged-into-dev-80559019 }
  authority_epoch: 1
  rework_round: 2
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-bounded-2026-09-07
```

**Filed from the diag-bounded seat's out-of-contract findings (2026-09-07).** `packages/judgement/src/s04.ts:245` forwards a raw caught `error.message` into a panel note — the same class as F-RISK-IDENTITY-LOG and F-DIAG-OPERATIONAL-REGEX, in a package the seat could not touch. **Outcome:** the note draws from a bounded alphabet (explicit map + fixed fallback), never the raw message.
