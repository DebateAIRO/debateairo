# [claude@opus-5] F-AUTH-RISK-POISONED-CATCH · a third discarding catch in the same class: auth-risk.ts:212 hides the decrypt/parse cause behind AUTH_RISK_SIGNAL_POISONED

```yaml
state:
  ticket: F-AUTH-RISK-POISONED-CATCH
  risk_tier: medium
  status: done # 15:34 2026-09-07 codex r1 APPROVE at d1b29b5b; merged into dev d5b4f7f5 (D70). Contract in this YAML is the ORIGINAL narrow one; the operative contract was the lane packet's (codex: stale metadata, reconciled here)
  owner: { agent: claude, session: risk-signal-diagnostics-worker }
  contract: { allowed: [packages/db/src/auth-risk.ts (the catch at :212 only), tests/unit or tests/integration for auth-risk], readonly: [logs/sessions-argon2/, agent-reports/sessions-argon2.md], forbidden: all_others, verification: [RED: a poisoned signal's cause is visible in the failure; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-risk-signal-diagnostics, branch: lane/risk-signal-diagnostics, merge_status: merged-into-dev-d5b4f7f5 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sessions-argon2-2026-09-07
```

**Filed from the sessions-argon2 seat's finding 2 (2026-09-07).** `packages/db/src/auth-risk.ts:212` is `}catch{poisoned();}` — the same shape as the two catches fixed on lane/sessions-argon2, outside that seat's contract (`packages/` readonly). **Outcome:** the cause reaches the poisoned() path with its identity (name/code/message; never a token, hash, ciphertext or secret), asserted by one test.

**Amended from codex sessions-argon2 r1 F3 (12:41 2026-09-07):** distinguish bounded internal decrypt-vs-parse categories while PRESERVING the existing fail-closed public classification `AUTH_RISK_SIGNAL_POISONED`; never forward raw decrypted text, ciphertext, keys or parser messages to logs. Not a landing blocker for the sessions lane.
