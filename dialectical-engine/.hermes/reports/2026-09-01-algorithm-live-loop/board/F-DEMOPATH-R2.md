# [claude@opus-5] F-DEMOPATH-R2 · demo-path report overstates the second-evaluator-call refusal

```yaml
state:
  ticket: F-DEMOPATH-R2
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [agent-reports/demo-path.md], readonly: [acceptance/panel-multi-maker.test.ts, acceptance/test-fixtures/evaluator-double.ts], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: demo-path-r1-2026-09-05
```

Filed by codex (demo-path r1, finding R2). `agent-reports/demo-path.md:270` claims a second EVALUATOR call now refuses; that holds for mono-panel and ceremony (finite queues) but NOT for panel-multi-maker, whose double is generative — it answers every matching request (`panel-multi-maker.test.ts:140`). Line 144 also needs narrowing: GENERAL requests can still consume GENERAL health-probe entries; they cannot consume entries of another class. **Fix:** a report-only correction — scope the refusal claim to the two finite-queue suites and describe panel-multi-maker as generative. No code change is required by the charged outcome; a call limit on the generative double is a separate design question and is NOT part of this ticket.
