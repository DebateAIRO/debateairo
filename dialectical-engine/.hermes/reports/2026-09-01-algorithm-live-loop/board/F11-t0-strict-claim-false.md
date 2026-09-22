# [unassigned] F11 · T0 report claim "`.strict()` rejects extra ceremony env keys" is false

Source: TREL worker handoff. acceptance/main.ts:85-89 PROJECTS the environment before
parsing, so extra ACCEPTANCE_* keys pass through harmlessly — which is precisely what makes
TREL's ACCEPTANCE_*_BINARY design safe. T0's report states the opposite as fact.
ROUTE: folded into T0's next resume (ceremony leg after TREL merges) — T0 corrects the
sentence in place and re-verifies the projection claim itself (never absorbed silently).
status: ready (consumed at T0 resume) · escalation_target: v_packet · created 2026-09-01
