# [claude@fable-5] F-EVALUATOR-R3-STAMPS · the Codex implementer's gate and RED records carry no commit stamp

```yaml
state:
  ticket: F-EVALUATOR-R3-STAMPS
  risk_tier: low
  status: waiting_review # ORCHESTRATOR PART DONE 08:50 2026-09-09: the implementer template carries the records block (stamps, gate-run, stamp-check); AMENDMENT 2 on the r3 packet records the omission and the stamped 98-* re-run; closure = codex static review of the template at the next tooling review
  owner: { agent: claude, session: tbd }
  contract: { allowed: [packets/t1-oracle-evaluator-codex-impl-r3.md (an AMENDMENT), the codex implementer template packets/t1-oracle-evaluator-codex-implementer.TEMPLATE.md], readonly: [logs/t1-oracle-evaluator/r3/], forbidden: all_others, verification: [the template requires every record to carry `commit=<40 hex>` at capture and to be checked with tools/stamp-check.sh before filing; the orchestrator's own re-run at the tip is stamped], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-evaluator-impl-r3-2026-09-07
```

**Found in the orchestrator's review of round 3 (2026-09-07).** `tools/stamp-check.sh <lane> logs/t1-oracle-evaluator/r3/` at tip 1d3e2255: 148 records, 99 NO-STAMP, 2 STALE. The 44 v3 mutation transcripts ARE stamped (mutate.sh writes the stamp); the seat's final gate logs (86 smoke, 87–89 selected ×3, 90 typecheck), its RED logs and its JSON summaries are not, so the ONE comparator (D41) cannot tie them to the tip — only the seat's report and 92-final-gate-summary.json say "tip 1d3e2255". The packet I wrote never told the Codex seat about stamp-check or the `commit=` contract (an orchestrator packet defect, the Codex template inherited it). **Outcome:** the implementer template names the stamp contract and the comparator; this round's gates are covered by the orchestrator's own stamped re-run at the tip (r3/98-*), recorded in the review.
