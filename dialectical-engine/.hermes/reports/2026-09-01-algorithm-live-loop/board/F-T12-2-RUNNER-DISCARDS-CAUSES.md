# [unassigned] F-T12-2-RUNNER-DISCARDS-CAUSES · `apps/runner/src/index.ts:1981` discards every cause

```yaml
state:
  ticket: F-T12-2-RUNNER-DISCARDS-CAUSES
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T12)'s F-T12-2 (SDD ledger :116). Found, not caused.

`apps/runner/src/index.ts:1981` throws away the underlying cause of every failure it handles. Whatever
actually went wrong is replaced by the handler's own message before anything records it.

**This is the same family the mission has paid for repeatedly** — `F-DIAG-ERASURE-CAUSE-LOSS` (account
erasure's three swallow paths) and `F-DIAG-DEV-AUTH-STACK` were both this shape, and each cost a
debugging session that had to reconstruct from the outside what the code already knew and deleted.

**Charge:** attach the cause (bounded, from the frozen diagnostic vocabulary — the same discipline the
erasure fix used) instead of discarding it. STRENGTH: entailed.
