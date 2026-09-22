# [unassigned] F-UI-AUTHOR-PSEUDONYM-NO-RENDER-SITE · `author_pseudonym` has no render site on the public page

```yaml
state:
  ticket: F-UI-AUTHOR-PSEUDONYM-NO-RENDER-SITE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from Task 9's drafted ticket **D-T9-5**. Both parents identical —
**pre-existing, not merge debt.** For V's UI program.

`apps/ui/components/DebatesBuffer.tsx:110` is the only site that renders `author_pseudonym`. The public
answer surface does not, while `tests/render/pda-s02-public-page.test.tsx` asserts it does.

**Charge:** render the pseudonym on the public answer surface, or retire that assertion. This one is
worth a moment's thought rather than a mechanical choice: the pseudonym is the reader-facing half of the
blind-review promise W7 just tightened in the prompts. STRENGTH: entailed.
