# [unassigned] F-T4-UI-7 · three of the six non-canvas maker surfaces render no maker at all

```yaml
state:
  ticket: F-T4-UI-7-MAKER-SURFACES-UNRENDERED
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

Pinned by `tests/unit/v2ui-pages.test.ts:577-581`, of which **only the first sub-assertion has ever run**
— so the row's full residue is not yet known. Measured per surface by the seat:

| surface | state |
|---|---|
| `DebateTree.tsx` | ✓ one exact `<ModelBadge …/>` |
| `DebateOutline.tsx` | ✓ one exact `<ModelMetaLine …/>` |
| `DebateThread.tsx` | ✗ **zero** `ModelMetaLine` / `ModelBadge` |
| `DebateSplit.tsx` | ✗ **zero** occurrences of `maker` |
| `DebateMap.tsx` | ✗ **zero** occurrences of `maker` |
| `NodeDetailDrawer.tsx` | renders `ModelMetaLine` six times (`:211`, `:297`, `:304`, `:330`, `:419`) but never in the exact propless form the assertion pins — `:297` carries `className="modelPill metaLine"` — so `toHaveLength(2)` fails |

**This is really two decisions, and they should not be answered as one.** (1) **Author the missing maker
surfaces** — thread, split and map show a reader no maker at all, which is a disclosure gap, not a test
gap. (2) **Decide whether the drawer's pinned form should be exact-string or structural** — the drawer
DOES disclose the maker; only the spelling the assertion demands is absent. STRENGTH: entailed.
