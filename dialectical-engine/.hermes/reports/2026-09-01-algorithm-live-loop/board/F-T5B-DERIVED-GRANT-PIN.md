# [unassigned] F-T5B-DERIVED-GRANT-PIN · the grant-floor pin is enumerated, so a fifth table slips past it

```yaml
state:
  ticket: F-T5B-DERIVED-GRANT-PIN
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T5B)'s deferred minor (SDD ledger :75; the query
is in `agent-reports/cont-t5b-grant-floor.md` §6).

Task 5b closed a real hole: `migrations/0060:23` had granted TABLE-level SELECT on `core.run`,
`core.work_item` and `ledger.raw_artifact` to `debateai_obs_view_owner`, superseding `0034`'s
five-column floor and putting `content_ciphertext`, `question_line`, `question_blind_index` and
`session_id` inside that owner's reach — and because the views are `security_invoker=false`, that grant
IS the chokepoint floor. Forward migration `0062` revokes those grants and re-grants the
**pg_depend-measured** union of the owner's views' reads; the class's fourth member (`0058:23`,
`core.run_progress_event`) was swept in at `af2c93c8`. `pg_depend` proves the role owns exactly five
views over exactly these four tables — **the class is closed today.**

**What is NOT closed:** the test that pins it is an **enumeration** of four tables with exact column
arrays. Add a fifth view over a fifth table tomorrow and the pin stays green while the floor is gone.

**Charge:** replace the enumeration with a DERIVED assertion — the set of columns the owner's views read
(from `pg_depend`) must EQUAL the set in `information_schema.column_privileges` for that role. Then a
fifth table is covered the day it appears. STRENGTH: entailed.
