# [claude@opus-5] F-DEMOPATH-B · the shared evaluator double has no test of its own

```yaml
state:
  ticket: F-DEMOPATH-B
  risk_tier: low            # three suites depend on one fixture whose two guards (escape-safety, schema parse) nothing pins directly
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

Filed by lane/demo-path. `acceptance/test-fixtures/evaluator-double.ts` carries an escape-safety guard and a schema-parse guard; both are exercised only indirectly through the three suites. The seat could not pin the escape-safety guard with a mutant without a product-file edit. **Fix:** a unit test on the fixture itself — a malformed verdict is refused by `evaluatorVerdictSchema.parse`; an escaped discriminator does not match. Test-only.
