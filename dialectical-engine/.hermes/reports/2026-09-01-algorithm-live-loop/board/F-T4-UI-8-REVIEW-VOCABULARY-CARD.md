# [unassigned] F-T4-UI-8 · the review vocabulary reaches the drawer and never the card

```yaml
state:
  ticket: F-T4-UI-8-REVIEW-VOCABULARY-CARD
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T4) §7 (SDD ledger :81–:83). **For V's UI program.**
Red on BOTH parents — not merge debt. **The seat called this the largest product gap of the eight and the
one most worth V's attention, and that reading is adopted here.**

Pinned by `tests/unit/v2ui-pages.test.ts:590`. `apps/ui/components/DebateCanvas.tsx` contains **zero**
`data-node-review`, **zero** `v3Review` and **zero** `"REVIEW N/A"`.
`apps/ui/components/NodeDetailDrawer.tsx:406` carries the full
`data-node-review={v3.review?.outcome ?? "absent"}` line, and its sibling assertion passes.

**Why the tier is `high` although no code here is wrong:** this is **the mission's own T6 / XREV-01
output not reaching the card surface.** Cross-review is one of the things the flagship run is supposed to
demonstrate — the closing run recorded *"each node reviewed by the other maker"* — and a reader looking at
the canvas cannot see it. It is visible only to someone who opens the drawer.

**Charge:** render the review outcome on the card, or state on the record that cross-review is
drawer-only by design and re-point the assertion. STRENGTH: entailed.
