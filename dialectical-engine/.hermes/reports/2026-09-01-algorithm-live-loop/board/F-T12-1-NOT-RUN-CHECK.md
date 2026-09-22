# [unassigned] F-T12-1-NOT-RUN-CHECK · a serve outcome the database forbids

```yaml
state:
  ticket: F-T12-1-NOT-RUN-CHECK
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T12) (SDD ledger :116). **Found, not caused** — the
seat hit it while doing W9 and correctly did not fix it. A row in `V-DECISIONS-PACKET.md` (2026-09-16
section B) carries the decision.

`migrations/0000_s00.sql:235` carries a CHECK that forbids `NOT_RUN`, while `packages/serve/src/index.ts:690`
and `:729` **produce** `NOT_RUN` and `:2018-2030` **insert** it. So there is a serve outcome the code can
reach and the database refuses to store.

**The decision is V's because the two arms mean different things:** widen the CHECK (NOT_RUN is a real,
recordable outcome) or stop producing it (NOT_RUN is a bug in the outcome vocabulary). A seat should not
pick.

**Note on likelihood, stated honestly:** no test reached the path, which is why it survived. That is a
statement about coverage, not about safety. STRENGTH: entailed.
