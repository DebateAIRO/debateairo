# [unassigned] F-W10-C-FIFTEEN-PROSE · the manifest prose still says "fifteen"

```yaml
state:
  ticket: F-W10-C-FIFTEEN-PROSE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) as **T-W10-C** (F4), drafted in `task-15-report.md` §"Ticket
drafts" (SDD ledger :129, :131).

W10 sealed two new cost rows, so the required-row manifest now has **seventeen** entries. Three places
still describe fifteen: `acceptance/seed-register.ts:21` and `:364`,
`acceptance/dual-maker-proof.test.ts:114`, and a comment at
`tests/integration/t16-algorithm-register.test.ts:408`.

Documentation only, no behaviour — three word changes, one commit. **Re-count before editing** rather
than trusting "seventeen" from this ticket (D67 ADDENDUM 2); the manifest is the authority, not this
sentence. STRENGTH: consistent-with.
