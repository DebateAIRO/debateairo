# [unassigned] F-W1-3-TWO-GRADER-DOCS · the docs still describe the retired two-grader matrix

```yaml
state:
  ticket: F-W1-3-TWO-GRADER-DOCS
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T14)'s F-W1-3 (SDD ledger :127).

W1 replaced the two-grader matrix with ONE fixed grader per arm and moved `gradersPerCell` 2 → 1, so the
printed projection fell 90/180 → 75/150. `acceptance/README.md` and the S11 slice docs may still state
the old matrix.

**Why a low-tier docs row is worth filing rather than waving through:** the "2 graders" number is also in
the GOAL text, and the ruling that `gradersPerCell` = 1 **supersedes** that clause is a V row in
`V-DECISIONS-PACKET.md` (2026-09-16 section A). If V accepts it, these documents are the place where the
supersession has to be visible — otherwise the next reader reconciles the goal against the code and
re-opens a settled decision. **Re-grep before editing**; the seat named the files as candidates, not as a
measured list. STRENGTH: consistent-with.
