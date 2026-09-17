# [claude@opus-5] F-RISK-IDENTITY-LOG · main.ts logs a driver-produced error message verbatim on risk-signal failure

```yaml
state:
  ticket: F-RISK-IDENTITY-LOG
  risk_tier: low
  status: done # 15:34 2026-09-07 codex r1 APPROVE at d1b29b5b; merged into dev d5b4f7f5 (D70). Contract in this YAML is the ORIGINAL narrow one; the operative contract was the lane packet's (codex: stale metadata, reconciled here)
  owner: { agent: claude, session: risk-signal-diagnostics-worker }
  contract: { allowed: [apps/api/src/main.ts (riskSignalFailureIdentity only)], readonly: [logs/sessions-argon2/, agent-reports/sessions-argon2.md], forbidden: all_others, verification: [the logged identity is name/code, and message only when it matches ^[A-Z0-9_]+$; one unit test; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-risk-signal-diagnostics, branch: lane/risk-signal-diagnostics, merge_status: merged-into-dev-d5b4f7f5 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sessions-argon2-2026-09-07
```

**Filed from the sessions-argon2 seat's finding 3 (2026-09-07).** `apps/api/src/main.ts:64` `riskSignalFailureIdentity` logs the error's `message` verbatim; a database-driver message could carry row content. The seat's proposed one-line change: emit `message` only when it matches `^[A-Z0-9_]+$`, otherwise `name`/`code`. Decide after codex r1 on the lane says whether the residual is real.

**Amended from codex sessions-argon2 r1 F2 (12:41 2026-09-07):** the formatter forwards `name`, `code` and `message` verbatim; a regex on the message is weaker than an explicit map. **Outcome:** map known application reason constants and recognized error categories/codes to bounded diagnostic text with a fixed fallback for unrecognized errors; assert that arbitrary synthetic sensitive content in any selected or excluded field is omitted while the two scope-unresolved identities remain visible. STRENGTH: entailed for verbatim forwarding; undetermined for any actual disclosure today.
