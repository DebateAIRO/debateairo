# [claude@fable-5] F-TOOL-MUTATE-2 · the mutation emitter must restore on every exit path and fail on inconsistent counts

```yaml
state:
  ticket: F-TOOL-MUTATE-2
  risk_tier: medium
  status: waiting_review # DONE 22:27 2026-09-06: mutate.sh v3 — trap-restore on every exit path, nonzero exit on inconsistent gates, RESULT line, MUT_EXPECT; self-tests on good / OLD-absent / NEW-present / multiplicity / interrupted under logs/tooling/m3-*.log. Closure is the next codex packet audit's
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/tools/mutate.sh, /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/tooling/*], readonly: [/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r0/ (the six round-0 mutation records), /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-r0.md (F5)], forbidden: all_others, verification: [a transcript on a known-good and on a malformed/truncated input; an interrupted run restores; a count mismatch exits nonzero; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-evaluator-r0-2026-09-06
```

Filed from codex evaluator r0 F5 ("strengthen the evidence tools before promoting them"). tools/mutate.sh v2 must: write COMPLETE summary/exit records; exit nonzero when its pre/applied/restored counts are inconsistent; preserve raw transcripts; require the declared anchor multiplicity; and RESTORE the target on normal, error AND interrupted exits (a trap), not only on the happy path; include known-good and malformed/truncated-input self-tests under logs/tooling/. **Timing:** not while a seat holds the tool — the evaluator's round 1 runs K23/K25/K27 through it now; apply between rounds and re-prove on the JSX proof input. Orchestrator-owned (mission tool).
