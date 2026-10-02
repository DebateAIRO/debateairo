# [unassigned] F-T9-T3-LIBRARY-DOM-VOCABULARY · `t3-library` pins a DOM vocabulary no component emits

```yaml
state:
  ticket: F-T9-T3-LIBRARY-DOM-VOCABULARY
  risk_tier: medium
  status: done # 2026-09-28 BUILT on fix/2026-09-28-render-reds (0f1d4b8f): V ruled option (a), the two-layer row; closes on merge into dev
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

**Closed 2026-09-28.** The premise above was corrected on 2026-09-20 (d79-ui-seat): the vocabulary WAS emitted
(fd82d84e) and dropped by merge 690ebe14; `data-library-row` came back then. V ruled on 2026-09-28 for the frame
(option a): `DebatesBuffer.tsx` rows are shell (`libRow`) + core (`libRowCore`); the i18n port's one-box pins in
`debateReferenceDesign.source-test.mjs` are superseded by two-layer pins. `t3-library` bezel row green.
