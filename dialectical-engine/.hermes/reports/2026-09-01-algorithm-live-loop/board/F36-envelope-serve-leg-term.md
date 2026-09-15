# [routed: T17/S09] F36 · envelope formula's serve-leg term is wrong after T9 (found by S07)
Source: agent-reports/s07-synthesis.md (r1 findings). `packages/register/src/index.ts:189` uses
`maxRecompose * fixedOrgansPerComposition` for the serve leg; after T9 the real count is
`rounds × 2 roles` (synthesizer + evaluator per round, bounded by evaluatorLoopMaxRounds).
Also: `WalkingSkeletonSettings.maxRecompose` (apps/runner/src/index.ts:1103) has no runner
reader left. The S07 seat documented both in place and changed neither (T17 owns the envelope).
DISPOSITION: T17/S09's charge — the ceiling must cover the new serve leg before the W12
flagship run; the S07 report's numbers are the input.
status: queued (W9) · escalation_target: v_packet if not closed before W12
