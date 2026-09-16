# [unassigned] F-W1-2-PROJECTION-CODE-FROM-SEATING · a seating site raises a projection code

```yaml
state:
  ticket: F-W1-2-PROJECTION-CODE-FROM-SEATING
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T14)'s F-W1-2 (SDD ledger :127).

`acceptance/eval-harness.ts:458` raises a **projection** error code from a **seating** site. The code
names the wrong stage, so a failure there sends the reader to the wrong part of the harness. Cosmetic in
effect, a diagnostic defect in kind — and this mission has repeatedly paid for diagnostics that name the
wrong thing (`F-DIAG-*`, the whole family).

**Charge:** raise a seating-stage code, or move the check to where the projection happens.
STRENGTH: entailed.
