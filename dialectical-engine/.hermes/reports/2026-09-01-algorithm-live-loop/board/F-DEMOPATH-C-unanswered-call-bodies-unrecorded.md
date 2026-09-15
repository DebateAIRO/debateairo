# [claude@opus-5] F-DEMOPATH-C · two of three acceptance doubles surface an unanswered call as a bare ANSWER_PERSIST_FAILED

```yaml
state:
  ticket: F-DEMOPATH-C
  risk_tier: low            # cost the seat an instrumentation round; will cost the next seat the same
  status: waiting_product_proof # MERGED into integration at ae35e9d2 (2026-09-05, post-merge.sh, tree == dry-run 2b64673f; 4 files +175 −27). Codex r1 APPROVE 0 blocking / 2 follow-ups (F-DEMOPATH-R1 orchestrator packet path, F-DEMOPATH-R2 report wording). Closes on a green D15 batch b13 after W3 r4 lands
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: merged }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: demo-path-r1-2026-09-05
```

Filed by lane/demo-path. Only `panel-multi-maker.test.ts`'s double records the body of an unanswered call (`PANEL_DOUBLE_UNCLASSIFIED_CALL`, packet printed verbatim). `mono-panel` and `ceremony` surface the same condition as a bare `ANSWER_PERSIST_FAILED`, so the diagnosis needs instrumentation every time. **Fix:** every double prints the unclassified request verbatim when it refuses — the panel-multi-maker pattern, shared via the fixture. Test-only.
