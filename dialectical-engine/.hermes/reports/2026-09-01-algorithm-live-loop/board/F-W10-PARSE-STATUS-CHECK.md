# [unassigned] F-W10-PARSE-STATUS-CHECK · `raw_artifact.parse_status` cannot name a length failure

```yaml
state:
  ticket: F-W10-PARSE-STATUS-CHECK
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T15) (SDD ledger :129).

W10 made the runtime honest: a truncation is `LENGTH_EXCEEDED`, not `PARSE_FAILED`. **The database cannot
say so.** The CHECK on `raw_artifact.parse_status` (`migrations/0004:14-21`, restated at
`0040:338-340`) has no `LENGTH_EXCEEDED` member, so the persisted truth of a truncation lives only in
`metadata.finish_reason` — a JSON field — while the typed column keeps calling it something else.

**The seat was right not to fix it:** widening the column is a MIGRATION, and W10 does not own migrations.
Recorded as correctly named rather than quietly absorbed.

**Charge:** a forward migration widening the CHECK, plus the writer that fills it. When it is done, the
`metadata.finish_reason` reading path becomes a fallback rather than the source of truth. Note the
mission-local hazard while writing it: migration numbers collide on this branch and must be **measured**
at write time — see `F-T5-MIGRATION-NUMBER-COLLISION`. STRENGTH: entailed.
