# CODEX REVIEWER PACKET — lane/t17t9 r1 · F-T17-T9 · the demo blocker

```
lane worktree : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9
base tip      : d08ee9283244dcfb76d68820360810c7749940d6   (integration, post-sealedrows)
fix tip       : b763ffb7
base..fix     : 5 files changed, 346 insertions(+), 9 deletions(-)
```

Orchestrator committed the seat's uncommitted work under a precommit manifest
(`logs/t17t9/precommit-manifest.txt`, 5/5 MATCH against the committed blobs). `apps/runner/src/index.ts`
and `main.ts` are byte-identical to base — verified by `git diff --quiet`.

## The defect and the fix

`synthesisRolePolicy` was built only in `dev-runner-policy.ts` and wired only in `main.ts:138`;
`acceptance/main.ts` never passed it, so every acceptance path reaching synthesis refused with
`SYNTHESIS_ROLE_CONTROLS_UNRESOLVED`. Fifth instance of one class (optional field on a shared
settings object, one lane adds, another deployment never supplies, compiler silent); the dev side
got this exact fix earlier as F33, with a comment describing it word for word.

**Fix:** `acceptance/runtime-policy.ts` reads the sealed family through T16's own reader, checks
provenance against `ACCEPTANCE_ALGORITHM_SOURCE_REF` (refusing
`ACCEPTANCE_SYNTHESIS_ROLE_PROVENANCE_INVALID`), carries it on a NON-optional field;
`acceptance/main.ts` passes it.

**The class — measured, and deliberately not forced.** The seat removed the `?` on the runner
settings field and ran full `tsc`: exactly 4 TS2741 errors in 3 files — `acceptance/ceremony.test.ts:214`,
`database.test.ts:5605`, `dev-deployment-register.test.ts:403,513` — all outside its contract,
and ZERO in `index.ts`. It **reverted** rather than hand back a non-compiling tree. In its place:
`tests/unit/deployment-register-family-wiring.test.ts`, a guard that DERIVES the obligation set
from the runner's own refusal gates and checks BOTH entry points. Seat reports mutant M1 (drop the
acceptance wiring) killed naming `acceptance (ceremony): synthesisRolePolicy`; neighbour M2
survived correctly. It also found WHY the existing guard missed this: `t09-synthesis-entrypoint.test.ts`
checks `apps/runner/src/main.ts` BY NAME and never `acceptance/main.ts`.

## The outcome is PARTIAL, and the seat said so first

Of the six tests: `T17B` green (0/2 → 1/2 in `t17-envelope-ledger`). The other five fail PAST the
claim-time gate on causes that are not this defect, all filed:
- **F-T17T9-1** `mono-panel` seals `evaluatorRoleRef=acceptance:claude-cli` but configures only
  codex-cli → `SYNTHESIS_ROLE_PROVIDER_UNRESOLVED`, correct under J24; fixture defect.
- **F-SEALEDROWS-B** (pre-existing ticket, now promoted): three acceptance doubles classify on the
  retired `conforms,findings`/`{pass}` organs and cannot answer the EVALUATOR call.
- **F-T17T9-3 (HIGH, human_review):** T17's envelope test expects 7 serve-leg sites and measures 2
  post-T9; observed ~109 → ~94 while the sealed `envelopeFormulaInputs` still yields 109. The
  ceiling COVERS; its TIGHTNESS claim is false. **The seat refused to make it green by editing two
  numbers.** Judge that refusal.

## Suites (seat-reported; verify)

`runtime-policy` 5/5 → **8/8**; class guard **2/2**, both 3/3 across three runs; `t17-envelope-ledger`
0/2 → 1/2; `mono-panel` 0/1; `panel-multi-maker` 0/2; `ceremony` 1/2; `tsc` EXIT 0; `lint` EXIT 1
**predating** (three `obs-capture` edge violations, F31, 2026-08-28; this diff adds no package
edge). 28 gate records, all `CLEAN-STATE: unchanged`.

## Questions

1. Is the provenance check on the synthesis-role family correct and complete for what the acceptance
   path reads? (The seat filed F-T17T9-4: acceptance checks 1 of 4 families; dev checks all.)
2. Does the derived class guard genuinely derive from the runner's refusal gates, or does it
   enumerate a list that will go stale the way the F33 guard did? Try adding a sixth gated field
   in your head and say whether the guard would notice.
3. Was reverting the `?` the right call, or should the seat have STOPPED on the 4 TS2741 lines
   and asked, rather than shipping a runtime guard as the class closure?
4. The F-T17T9-3 refusal: right, and is the seat's reading (tightness false, coverage intact) correct?
5. **Is this lane MERGEABLE with one of six green?** The instance is closed and the remaining five
   fail on three separately-ticketed causes. Say whether merging a correct partial is right, or
   whether it should wait for F-T17T9-1 and F-SEALEDROWS-B to land beside it.
6. **Packet audit.** `packets/t17t9-worker.md`. The seat named the outcome as unreachable in the
   contract (orchestrator defect #10, admitted). Anything else.

## Method

Static; no mutating git; verify by artifact; scoped runs only; absolute paths — mission directory `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`.

## Output — ONLY these two files

```
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r1.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t17t9-codex-r1-self.md
```

Line 1 exactly:
`CODEX REVIEW T17T9 r1 — <APPROVE|CHANGES> · comments read through: t17t9-r1-2026-09-05`

Finding counts BLOCKING / FOLLOW-UP; per-finding **File/line · Input → wrong outcome · Required
fix**; `## Packet audit`; `## Not verified`; `## PREDICTIONS`; final line
`MERGEABLE: yes|no — <one sentence>`.
