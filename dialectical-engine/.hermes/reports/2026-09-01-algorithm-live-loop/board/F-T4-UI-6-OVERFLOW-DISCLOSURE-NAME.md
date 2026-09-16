# [unassigned] F-T4-UI-6 · the overflow disclosure is `debateUtilityOverflow`, not `debateOverflow`

```yaml
state:
  ticket: F-T4-UI-6-OVERFLOW-DISCLOSURE-NAME
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T4) §7 (SDD ledger :81–:83). **For V's UI program.**
Red on BOTH parents — not merge debt.

Pinned by `tests/unit/v2ui-pages.test.ts:316`. The product renders
`<details className="debateUtilityOverflow" aria-hidden="true">` at
`apps/ui/app/debate/[id]/DebatePageClient.tsx:1182`; the assertion looks for `debateOverflow`. Everything
else the same assertion pins is present — the identity/control rows (`:1104`, `:1114`), the
`aria-label="More debate actions"` summary (`:1183`) and the measurement wiring. **A name, nothing more.**

**Found while measuring it, and it is the more interesting half:** `aria-hidden="true"` sits on a
container that holds **focusable controls**. That hides them from assistive technology while leaving them
in the tab order — an accessibility defect independent of the naming question, and one that no
assertion here covers. STRENGTH: entailed.
