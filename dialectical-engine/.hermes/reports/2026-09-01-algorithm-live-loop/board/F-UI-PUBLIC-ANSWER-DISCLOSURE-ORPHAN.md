# [unassigned] F-UI-PUBLIC-ANSWER-DISCLOSURE-ORPHAN · `PublicAnswerDisclosure` is defined and mounted nowhere

```yaml
state:
  ticket: F-UI-PUBLIC-ANSWER-DISCLOSURE-ORPHAN
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19). **Two seats found this independently and it is ONE ticket:**
Task 4's **T4-UI-3** (`task-4-report.md` §7) and Task 9's **D-T9-4** (`task-9-report.md` §Drafted
tickets). For V's UI program.

`apps/ui/components/PublicAnswerDisclosure.tsx:3` is the only occurrence of the symbol in `apps/ui` —
the component is defined and mounted nowhere, on `^1`, on `^2` and on HEAD. `PublicDebatePageClient`
lacked it on `^1` as well, so **this is not merge damage.**

**Charge:** mount it in the public debate composition, or retire it together with the rows that read its
copy (`pda-s02-public-tree`, and re-check `s8-publication-contract`).

**Correction this ticket carries, and it should not be lost:** the measurement of record recorded
`s8-publication-contract` › *"ships the deliberate controls and public-only reader in the UI
composition"* as a **merge-caused regression against the first parent**. That attribution is wrong —
the component is mounted on NEITHER parent. STRENGTH: entailed.
