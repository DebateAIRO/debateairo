# [claude@opus-5] F-FLAKE-POL03 · POL-03 pool-resilience test fails intermittently under full-suite load

```yaml
state:
  ticket: F-FLAKE-POL03
  risk_tier: low
  status: done # 04:13 2026-09-08 codex r1c APPROVE at bf4df3a3 (two rework rounds on T9; POL-03 cleared at r1); merged into dev 116db345 (D70)
  owner: { agent: claude, session: flakes-worker }
  contract: { allowed: [tests/integration/pol03-pool-resilience.test.ts, .hermes/TOOLING-TRAPS.md (append-only)], readonly: [logs/dev-merge/02-full-suite-dev-1d954e88.log, logs/w5/27-suite-run2.log, logs/t17t9-3/14-b14-full-suite.log, logs/t1-oracle-evaluator/r2/], forbidden: all_others, verification: [the failing mode reproduced in isolation or under load with its timing named; the test made load-independent or its deadline justified from the backend's reset latency; codex static review], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-flakes, branch: lane/flakes, merge_status: merged-into-dev-116db345 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
```

**Finding (dev gate 2026-09-07, dev `1d954e88`):** `tests/integration/pol03-pool-resilience.test.ts > POL-03 real PostgreSQL backend reset > survives an idle backend termination and reports in-flight and subsequent failures typed` failed in the merged-dev full suite (81/1/None/1) and in NEITHER parent run (W5 run 2 at 2af816f1; t17t9-3 b14 at 5e837ba7). The evaluator seat measured the same name across its five full-suite runs on the lane: present in 2 of 5 (`agent-reports/t1-oracle-evaluator.md`, V-rework section). No commit between the parents and dev touches the test or the pool code (the 8 commits after 2af816f1 touch tests/unit, tests/integration (t17, s06), tests/support, packages/register, packages/budget, acceptance/runtime-policy). STRENGTH: consistent-with a load-timing flake; not entailed — the failing assertion's timing has not been read.

**Outcome:** the test either passes under full-suite load three times in a row or its deadline is derived from the backend's measured reset latency and written into the test with the measurement's source. RED first: reproduce the failing mode.
