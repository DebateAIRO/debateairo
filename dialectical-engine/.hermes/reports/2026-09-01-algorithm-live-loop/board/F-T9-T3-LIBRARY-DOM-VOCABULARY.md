# [unassigned] F-T9-T3-LIBRARY-DOM-VOCABULARY · `t3-library` pins a DOM vocabulary no component emits

```yaml
state:
  ticket: F-T9-T3-LIBRARY-DOM-VOCABULARY
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: yes }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from Task 9's drafted ticket **D-T9-3**. Blobs identical on BOTH
parents — **pre-existing, not merge debt.** For V's UI program.

`tests/render/t3-library.test.tsx:327-334` and `:367-385` pin `[data-library-row]` and
`[data-bezel="shell"]`. Both are **absent from `apps/ui` on `^1`, `^2` and HEAD** — the T1 bezel
vocabulary was never emitted for library rows.

**Charge:** decide whether `apps/ui/app/page.tsx` should emit the T1 bezel vocabulary for library rows,
then fix the product or retire the oracle. **Do not blanket-update the pins** — that would convert a
design decision into a silent retreat. STRENGTH: entailed.
