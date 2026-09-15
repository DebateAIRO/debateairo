# [unassigned] F18 · architecture edge declarations for the two J6-created dependencies (CORRECTED per codex T1-r2 B2)

CORRECTION 2026-09-01 (orchestrator error, named in J10c): the original ticket text said
apps/ui→contract and claimed the failure signature was unchanged at base — both wrong.
TRUE state (codex-verified from T1's own logs): the J6 diff creates TWO new edges,
packages/budget→@debateai/contract and apps/runner→@debateai/contract; T1's base-restore
proof missed the manifests, so the two edge violations at HEAD are T1-OWNED, not
pre-existing. DISPOSITION: J10a authorizes declaring both edges as J6 coherence
consequences — this lands IN T1's final rework round, not at V. scaffold.test.ts's
OTHER, genuinely pre-existing failure causes remain untouched and stay with their eventual
repairer.
status: ready (consumed by T1 r3) · escalation_target: v_packet · created 2026-09-01

## MEASURED 2026-09-05 by lane/w3b — dated at integration 3d137d64

`tests/architecture/scaffold.test.ts`: **2 failed | 6 passed (8)**, identical on the untouched
integration worktree at `3d137d64`. Both failures are the pre-existing violations:
`expect(report.violations).toEqual([])` receives the three `obs-capture` edges (F31), and
`expect(report.blocking).toEqual([])` receives the three `obs-capture` env reads plus a
`serve/synthesis.ts` law carrier (T9's file — owes a `GOAL_RULED_LAW_CARRIERS` entry). The
`edgeRowsChecked === 28` assertion PASSES on W3's tree, which is the cheapest proof that W3's row-17
change amended a row rather than adding one.

**So an architecture suite has been red at integration for at least two tips**, and — per D15
ADDENDUM — the `audit:source` half of lint has not run in any lane's gate this week because the
architecture half short-circuits it. Two owners: F31 (obs-capture) and T9/serve (the law carrier).
