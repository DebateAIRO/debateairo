# [unassigned] F-T6-LINT-SHORT-CIRCUIT · `pnpm lint` still short-circuits past `audit:source`

```yaml
state:
  ticket: F-T6-LINT-SHORT-CIRCUIT
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T6) (SDD ledger :64). It is the same defect
D15 ADDENDUM already named once.

`pnpm lint` joins its two halves with `&&`, so **if the first half fails the second never runs** and its
result is silently absent from the gate. D15 ADDENDUM required the two audits to be run and reported
SEPARATELY for exactly this reason; the script was never changed to match.

**Fix, one line:** run both halves unconditionally and fail if either failed.

**Why it matters more than it looks.** This is the third appearance in this mission of one mechanism — a
gate wired so that a failure upstream hides a result downstream. D64 ADDENDUM 3 records the same shape in
a dispatch (`lint | cut … || exit 1` tested `cut`, so a packet went out carrying a lint failure). A rule
that is not enforced by exit status is not enforced. STRENGTH: entailed.
