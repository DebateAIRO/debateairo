# [unassigned] F-T4-UI-2 · `recommendation.ts` sorts with `localeCompare`

```yaml
state:
  ticket: F-T4-UI-2-RECOMMENDATION-LOCALECOMPARE
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T4) §7 (SDD ledger :81–:83). **For V's UI program.**
Red on BOTH parents — not merge debt.

`apps/ui/lib/recommendation.ts:31` and `:32` tiebreak with `localeCompare`;
`tests/architecture/s14-contract.test.ts:52` requires a deterministic, **locale-independent** tiebreak.
A one-line class fix (compare code units) — but it is UI-owned source that **no parent ever had clean**,
so it is V's program's call, not a merge repair.

**Worth stating plainly:** a locale-dependent sort means the order a reader sees can differ by machine.
For a recommendation list, that is a correctness question, not a cosmetic one. STRENGTH: entailed.
