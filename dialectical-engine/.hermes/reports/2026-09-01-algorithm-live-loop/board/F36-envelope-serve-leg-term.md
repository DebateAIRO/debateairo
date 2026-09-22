# [routed: T17/S09] F36 · envelope formula's serve-leg term is wrong after T9 (found by S07)
Source: agent-reports/s07-synthesis.md (r1 findings). `packages/register/src/index.ts:189` uses
`maxRecompose * fixedOrgansPerComposition` for the serve leg; after T9 the real count is
`rounds × 2 roles` (synthesizer + evaluator per round, bounded by evaluatorLoopMaxRounds).
Also: `WalkingSkeletonSettings.maxRecompose` (apps/runner/src/index.ts:1103) has no runner
reader left. The S07 seat documented both in place and changed neither (T17 owns the envelope).
DISPOSITION: T17/S09's charge — the ceiling must cover the new serve leg before the W12
flagship run; the S07 report's numbers are the input.
status: done · escalation_target: v_packet if not closed before W12

## 2026-09-16 continuation
Moved `queued (W9)` → `done` by RECORDS(CONT-T19), as **SUPERSEDED, not repaired in place**. The serve-leg
term was not patched: F-T17T9-3's re-derivation replaced the sealed envelope row's formula inputs with the
six run-level serve sites that actually ship, and V sealed the true number **106**. Citation:
`PROGRESS.md:295` — *"V ruled accept-as-exception on F-T17T9-3 B1 … 106 landed on integration at
`c6f967da` (gate 66/66)"*. STRENGTH: entailed. Nothing in this ticket is outstanding; the successor owns
the subject.
