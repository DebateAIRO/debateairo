# [claude@opus-5] F-RISK-SIGNAL-DIAGNOSTICS-F1 · the risk-signal lane's report credits an unsaved early mutant survival and a different runner version

```yaml
state:
  ticket: F-RISK-SIGNAL-DIAGNOSTICS-F1
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [agent-reports/risk-signal-diagnostics.md (append a CORRECTION section), agent-reports/risk-signal-diagnostics-self.md (append)], readonly: [logs/risk-signal-diagnostics/, agent-reports/risk-signal-diagnostics-codex-r1.md], forbidden: all_others, verification: [the early A2 4/4 survival labelled worker-reported unless its transcript is supplied; the reason-key grep's provenance corrected; the runner-version distinction recorded; codex static review], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: risk-signal-diagnostics-r1-2026-09-07
```

**Filed from codex risk-signal-diagnostics r1 F1 (2026-09-07, non-blocking).** The report (lines 25, 42) presents an EARLY A2 4/4 survival as entailed from two transcripts, but only the final A2 kill is filed; the reason-key grep is described as in 02-sweep and is not; the mutant captures ran under a different vitest runner version than the gate runs. **Outcome:** labels corrected (worker-reported vs filed), provenance stated, and a standing note that mutant captures use the project-local runner. No source change.
