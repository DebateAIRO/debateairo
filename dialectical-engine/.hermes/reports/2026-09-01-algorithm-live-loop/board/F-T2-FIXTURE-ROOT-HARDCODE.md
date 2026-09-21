# [unassigned] F-T2-FIXTURE-ROOT-HARDCODE · fixtures hard-code `/tmp` roots and re-derive cwd

```yaml
state:
  ticket: F-T2-FIXTURE-ROOT-HARDCODE
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T2)'s deferred minor (SDD ledger :35;
`agent-reports/cont-t2-obs-agent-reporoot.md`).

Task 2 fixed the class it was charged with — fixtures now supply `repoRoot: observationRepoRoot()`, the
same accessor `apps/observation-agent/src/main.ts:61` uses, and the root typecheck went 35 errors → **0**.
While doing it the seat measured the neighbouring class and correctly did NOT touch it: **five fixture
sites hard-code a `/tmp` root and twenty-one sites re-derive the current working directory** instead of
taking the product's accessor. All are typecheck-clean today.

**Why this is a ticket and not a note:** it is the same shape as the defect Task 2 repaired — a test
deciding for itself where the world is — and this whole continuation moved machines, which is exactly the
condition under which such a site breaks. The counts above are the seat's; **re-enumerate before fixing**
(D67 ADDENDUM 2). STRENGTH: consistent-with (the seat's enumeration, not re-measured this pass).
