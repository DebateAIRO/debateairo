# [unassigned] F-W10-D-PURITY-REGEX · the source-purity law enforces itself at random

```yaml
state:
  ticket: F-W10-D-PURITY-REGEX
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) as **T-W10-D** (F5/F6), drafted in `task-15-report.md` §"Ticket
drafts" (SDD ledger :129, :131).

`tools/orphan-audit/src/index.ts:694`'s regex **cannot see a numeric separator**, so
`export const X = 180_000;` is invisible while `export const X = 3;` is caught. **The perverse incentive
is the finding:** the obvious way to clear a reported row is to reshape the literal, which disables the
law in the very file that most needs it.

Same entry, `:697`: the finding message names the **FILE and never the SYMBOL**, so a seat with several
new exports has to bisect its own diff to find out which one the audit means.

**Scope:** one character class, one message. **Expect a sweep** — fixing the regex will surface
currently-invisible violations across `packages/**` and `apps/**`, and the sweep must land WITH the regex
or the next gate goes red for a reason nobody planned.

**Sibling, same instrument, same weakness:** `F-T6-AUDIT-RULE-GAPS` row 1 (a type annotation defeats the
same rule). They should be fixed together. STRENGTH: entailed.
