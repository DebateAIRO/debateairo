# [unassigned] F-T4-UI-4 / T4-UI-5 · the `nodeHeader` region anchor does not exist in `DebateCanvas.tsx`

```yaml
state:
  ticket: F-T4-UI-4-5-NODEHEADER-ANCHOR
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T4) §7 (SDD ledger :81–:83). **For V's UI program.**
Red on BOTH parents — not merge debt. Two drafted rows, one subject, one file.

Pinned by `tests/unit/v2ui-pages.test.ts:303` (MUT-A) and `:309` (MUT-C).
`grep -n nodeHeader apps/ui/components/DebateCanvas.tsx` → **no match.** The class survives only as dead
CSS at `apps/ui/app/globals.css:3271` and `:3183`, and in `DebateCanvas.responsive.test.mjs.disabled:16`.

**The render sites the assertions protect ARE present** — `<V3ScoreBadges …/>` at `:451`,
`<ModelMetaLine …/>` at `:402` and a multi-line `<ModelMetaLine` at `:434`. Only the region ANCHOR is
gone, so the assertions fail while the thing they guard is intact.

**Options.** (a) Restore a `nodeHeader` wrapper, so the anchor AND the dead CSS both mean something
again. (b) Re-anchor both assertions on a structure V's card actually has — **a test change that needs
V's sign-off**, not a merge repair. STRENGTH: entailed.
