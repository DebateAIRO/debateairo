# [unassigned] F-T1-FX-ORPH-04-NO-LIVE-SUBJECT · FX-ORPH-04's consumer walk has no live-UI subject

```yaml
state:
  ticket: F-T1-FX-ORPH-04-NO-LIVE-SUBJECT
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T1) (SDD ledger :26–:28).

`tests/architecture/s14-contract.test.ts`'s FX-ORPH-04 arm walked web consumers in both directions
(`servedWithoutConsumer`, `consumedWithoutServed`, `deathListReachable`). Task 1 retired those three
web-derived assertions **with the ruling cited** and kept the two contract-derived ones, because the
subjects they walked no longer exist. The arm therefore still tests the generated contract and **no
longer tests any live consumer**.

**Charge:** decide whether the bidirectional consumer walk should be re-pointed at the `apps/ui`
composition (the live consumer), or whether FX-ORPH-04 is now a contract-only rule and its title should
stop promising a consumer walk. Do not blanket-restore the old assertions — their subjects are gone.
STRENGTH: entailed.
