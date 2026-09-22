# [unassigned] F-T9-T1-CANVAS-MASKED-ROWS · four `t1-canvas` rows are hidden by the localStorage defect

```yaml
state:
  ticket: F-T9-T1-CANVAS-MASKED-ROWS
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from Task 9's drafted ticket **D-T9-8**. Depends on
`F-T9-ENGINE-MISMATCH-ADVISORY`.

Four rows in `tests/render/t1-canvas.test.tsx` are **real** failures that only become VISIBLE once
`localStorage` exists — today they are masked by the Node-26 web-storage shadowing. Task 9 proved them by
installing a shim.

**The consequence to plan for, so nobody reads it as a regression:** when the host is repaired to Node
22.23.1, the render red count will **fall by about 100 and RISE by 4**. A gate taken after that repair
is not comparable name-for-name to the gates of this continuation, and the four new names are not new
breakage — they are these.

**Charge:** fix them with the other `t1-canvas` / `role-token-map` canvas rows
(`F-T3-UI-CANVAS-ROWS-UNAUTHORED`), since they share a surface. STRENGTH: entailed.
