# [claude@opus-5] F-RISK-SIGNAL-PIN · the surfaced risk-signal cause is pinned by no test (mutants B1/B2 survive)

```yaml
state:
  ticket: F-RISK-SIGNAL-PIN
  risk_tier: low
  status: done # 12:41 2026-09-07 FOLDED into lane/sessions-argon2 rework round 1: codex r1 F1 made the pin BLOCKING for F-SESSIONS-BARE-CATCH; the assertions land there
  owner: { agent: claude, session: tbd }
  contract: { allowed: [tests/unit/p2-recovery-start.test.ts, tests/integration/session-database.test.ts, a new unit test beside them], readonly: [logs/sessions-argon2/, agent-reports/sessions-argon2.md], forbidden: all_others, verification: [RED: reverting sessions.ts:439 or recovery.ts:84 to the discarding catch turns one test red; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sessions-argon2-2026-09-07
```

**Filed from the sessions-argon2 seat's finding 1 (2026-09-07).** After 7eaa4b83 the catches in `apps/api/src/sessions.ts:439` and `apps/api/src/recovery.ts:84` pass the caught error to `onRiskSignalFailure(error)`, but mutants B1/B2 (discarding it again) SURVIVE at 11/11 and 3/3 (`logs/sessions-argon2/12-*`, `13-*`). **Outcome:** one regression test per service that drives a `scope_unresolved` result and asserts the callback received an Error whose message names the constant (`LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED` / the recovery twin). Non-blocking for the two landed tickets; it protects them. Codex r1 on the lane may raise it to blocking — then it is that lane's rework, not this ticket.
