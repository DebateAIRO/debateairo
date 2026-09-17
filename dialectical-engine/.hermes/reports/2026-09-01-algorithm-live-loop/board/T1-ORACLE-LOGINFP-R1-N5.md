# [claude@fable-5] T1-ORACLE-LOGINFP-R1-N5 · orchestrator packet defect from the oracle lane's round 1

```yaml
state:
  ticket: T1-ORACLE-LOGINFP-R1-N5
  risk_tier: low
  status: waiting_review # ORCHESTRATOR PART DONE 19:09 — closure is the next codex packet audit's
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [packets/t1-oracle-loginfp-worker.md (append), packets/dispatches/t1-oracle-loginfp-1.txt (append)], readonly: [agent-reports/t1-oracle-loginfp-codex-r1.md], forbidden: all_others, verification: [the next codex packet audit], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-loginfp-codex-r1-2026-09-05
```

Filed by codex (oracle r1, N5): the m2 duty required planting into a shipped file while every such file was readonly/forbidden — duty and grant disagreed (D61). **Done 19:09:** AMENDMENT 1 grants `apps/ui/components/LoginFlow.tsx` as a NAMED TEMPORARY MUTANT TARGET (applied and restored inside one mutate.sh transcript, HASHES MATCH, empty porcelain), expressly separated from permanent edit scope.
