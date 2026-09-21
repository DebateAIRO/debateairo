# [unassigned] F-T3-UI-CANVAS-ROWS-UNAUTHORED · three design-derived oracle rows run ahead of the product

```yaml
state:
  ticket: F-T3-UI-CANVAS-ROWS-UNAUTHORED
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T3) (SDD ledger :41–:43). **For V's UI program**,
not for this mission: authoring these sites is UI work outside the Scope law
(`slices/S12-closure/SPEC.md:22-26`).

Three `role-token-map` rows fail — the DebateMap root hub, and the DebateCanvas agreed/disputed review
marks. They were recorded as merge-caused regressions. **They are not.** The seat proved by blob hash
that `apps/ui/components/DebateMap.tsx` and `DebateCanvas.tsx` are byte-identical on `^1`, `^2` and HEAD
(`a85c0bed`, `aec019cc`), and that `DebateCanvas` has **no `compactReview` symbol on either parent**. The
render sites these rows demand have never existed. The oracle was written from the design, ahead of the
product.

**Charge:** decide, per row, whether the product should grow the site or the row should be retired. Do not
"fix" them as merge debt — there is nothing to restore.

**Two acceptance notes recorded with this ticket** (same seat, same round):
- `ModeToggle`'s **compact** branch is pinned by nothing; the non-compact labels are now pinned.
- Routing the two support surfaces through `var(--shadow-card)` gives them a **larger blur** than the
  literals did — a deliberate, visible delta for V's acceptance, not a regression.
STRENGTH: entailed.
