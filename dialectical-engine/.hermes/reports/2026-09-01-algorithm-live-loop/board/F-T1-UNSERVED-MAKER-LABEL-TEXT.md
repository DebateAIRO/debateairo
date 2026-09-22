# [unassigned] F-T1-UNSERVED-MAKER-LABEL-TEXT · the `UNSERVED-MAKER-POSITION` label TEXT is pinned by nothing

```yaml
state:
  ticket: F-T1-UNSERVED-MAKER-LABEL-TEXT
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T1)'s deferred minor (SDD ledger :27;
`agent-reports/cont-t1-web-retirement.md`).

Retiring the legacy `web/` renderer removed the only test that pinned the **display text** of
`UNSERVED-MAKER-POSITION`. Membership in `CONDITION_MARKS` is still pinned (the count-37 arm at
`tests/unit/s14-live-projections.test.ts:41`, re-homed by Task 1 and proven by mutant A) and the
renderer's totality is still pinned — but the STRING a reader sees is now free to drift.

**The decision this needs:** is the DR-161 copy load-bearing? If yes, one assertion re-homes the text
pin to the live `apps/ui` label map. If no, say so on the record and close this. Two other marks are in
the same position. STRENGTH: entailed.
