# [claude@opus-5] F-FLAKE-T9-RESEND · the T9 resend lock-order race test classifies itself INCONCLUSIVE under full-suite load

```yaml
state:
  ticket: F-FLAKE-T9-RESEND
  risk_tier: low
  status: done # 04:13 2026-09-08 codex r1c APPROVE at bf4df3a3 (two rework rounds on T9; POL-03 cleared at r1); merged into dev 116db345 (D70)
  owner: { agent: claude, session: flakes-worker }
  contract: { allowed: [tests/integration/registration-database.test.ts (the T9 resend block and its classification only), .hermes/TOOLING-TRAPS.md (append-only)], readonly: [logs/dev-merge/09-full-suite-dev-70647e7e.log, logs/dev-merge/02-full-suite-dev-1d954e88.log, logs/t1-oracle-evaluator/r3/97-full-suite-r3-orchestrator.log, logs/w5/27-suite-run2.log], forbidden: all_others, verification: [the INCONCLUSIVE branch's cause named from the classification's own inputs; the test either passes under full-suite load three times or its inconclusive classification is reported as a skip with its reason rather than as a failure; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-flakes, branch: lane/flakes, merge_status: merged-into-dev-116db345 }
  authority_epoch: 1
  rework_round: 2
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: dev-gate-70647e7e-2026-09-07
```

**Finding (dev gate 2026-09-07 at 70647e7e).** `tests/integration/registration-database.test.ts > T9 resend lock-order race through the real HTTP boundary > T9 counterbalances six resend windows with cadence-blocked family-wise equivalence` failed with `expected 'T9_TEST_CONTRACT_INCONCLUSIVE' to be 'T9_RESEND_EQUIVALENCE_GREEN'` at `registration-database.test.ts:6980` (a 420 s statistical test whose classification depends on measured pair gaps). It PASSED (✓) in the four prior full runs on this machine: W5 run 2 (2026-09-05), dev 1d954e88, the evaluator tip gate 1d3e2255, and t17t9-3 b14. No commit between 1d954e88 and 70647e7e touches the registration or resend path (the sessions lane touched sessions.ts, recovery.ts, main.ts's two risk-signal consumers and three test files; the evaluator lane touched two test-support files). STRENGTH: consistent-with a load-timing inconclusive; not entailed — the classification's inputs (`live.pairMedianGapsMs`, the cadence blocks) have not been read from this run. Same family as F-REG-DEADLINE-MARGIN, F-FLAKE-SENDMAIL and F22-registration-s3b-flake.

**Outcome:** the INCONCLUSIVE branch reports WHY (which input failed the contract) and is not confused with a red equivalence result; the test's own contract decides whether an inconclusive run is a failure or a typed skip.
