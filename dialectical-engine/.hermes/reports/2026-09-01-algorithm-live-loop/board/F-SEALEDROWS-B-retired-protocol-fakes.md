# [claude@opus-5] F-SEALEDROWS-B · four test fakes answer a protocol the engine retired

```yaml
state:
  ticket: F-SEALEDROWS-B
  risk_tier: medium          # tests are green for a reason unrelated to what they claim to prove
  status: waiting_product_proof # MERGED into integration at ae35e9d2 (2026-09-05, post-merge.sh, tree == dry-run 2b64673f; 4 files +175 −27). Codex r1 APPROVE 0 blocking / 2 follow-ups (F-DEMOPATH-R1 orchestrator packet path, F-DEMOPATH-R2 report wording). Closes on a green D15 batch b13 after W3 r4 lands
  owner: { agent: claude, session: lane-demo-path }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [codex static review]
    human_review: no
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-demo-path, branch: lane/demo-path, merge_status: merged, base: 7e8f1e51, tip: 193509a1 }
  authority_epoch: 1
  rework_round: 1
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-r1-2026-09-03
```

Filed by the lane/sealedrows seat. Test fakes still return the retired `{conforms,findings}`
conformance shape, which the engine stopped asking for at `c1d8e09d`. A fake answering a question
nobody asks makes its test green for a reason unrelated to the thing under test.

Files carrying the retired shape (orchestrator sweep, to be narrowed by the seat — some are
legitimate historical fixtures):

```
tests/integration/database.test.ts
tests/integration/t17-envelope-ledger.test.ts
acceptance/ceremony.test.ts
acceptance/mono-panel.test.ts
acceptance/panel-multi-maker.test.ts
acceptance/seed-register.ts
acceptance/seed-register.test.ts
```

Blocked behind F-SEALEDROWS-A: the repair there decides what the current protocol text is, and
these fakes must answer THAT.
