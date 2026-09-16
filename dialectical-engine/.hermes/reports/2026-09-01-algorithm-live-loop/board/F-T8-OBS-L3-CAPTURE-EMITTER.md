# [unassigned] F-T8-OBS-L3-CAPTURE-EMITTER · the obs-l3 recording emitter never receives `offer`

```yaml
state:
  ticket: F-T8-OBS-L3-CAPTURE-EMITTER
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T8)'s finding for Task 9 (SDD ledger :50) and
Task 9's drafted row **D-T9-6** (`task-9-report.md` §Drafted tickets). The two are the same defect.

Four failing rows in `tests/integration/obs-l3-s06-runner-binding.test.ts` share **one** cause, localised
by Task 8 to `installRecordingEmitter` at **`:55-71`** — the emitter is installed but never receives
`offer`. Until Task 8 measured it, the cause was un-ticketed and the rows were being attributed
individually.

**It is NOT merge debt.** `packages/obs-capture/**` is byte-identical on both parents of `5e617776`
(Task 9, measured), so the defect lives either in the harness's emitter installation or in the product's
emit path — not in the reconcile.

**Charge:** decide which side is wrong and fix one. Four rows close together. STRENGTH: entailed.
