# [claude@opus-5] F-DEMOPATH-A · mono-panel's provider double answers by POSITION, never reads the request

```yaml
state:
  ticket: F-DEMOPATH-A
  risk_tier: medium            # a future protocol move would be answered wrongly rather than refused; mutant M3 (drifted discriminator) SURVIVES on this suite for exactly this reason
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

Filed by lane/demo-path. `acceptance/mono-panel.test.ts`'s double serves responses in order and never inspects the request body, so it cannot tell an EVALUATOR call from anything else — the shared discriminator is bypassed there. The two other suites now refuse an unrecognised request by name; this one would serve the wrong entry silently. **Fix:** route mono-panel's double through the shared `evaluator-double.ts` discriminator so M3 dies there too. Test-only.
