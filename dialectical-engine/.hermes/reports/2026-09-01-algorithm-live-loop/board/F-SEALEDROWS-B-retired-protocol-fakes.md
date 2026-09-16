# [claude@opus-5] F-SEALEDROWS-B · four test fakes answer a protocol the engine retired

```yaml
state:
  ticket: F-SEALEDROWS-B
  risk_tier: medium          # tests are green for a reason unrelated to what they claim to prove
  status: done # MERGED into integration at ae35e9d2 (2026-09-05, post-merge.sh, tree == dry-run 2b64673f; 4 files +175 −27). Codex r1 APPROVE 0 blocking / 2 follow-ups (F-DEMOPATH-R1 orchestrator packet path, F-DEMOPATH-R2 report wording). Closes on a green D15 batch b13 after W3 r4 lands
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

## 2026-09-16 continuation
Moved `waiting_product_proof` → `done` by RECORDS(CONT-T19). This row waited on an ACCOUNTING gate, not
on code — the code had landed (see the `landed?` column of the 2026-09-16 status map §4.2, *"Code landed;
each row closes by accounting against a gate that has already been taken … No further code is owed."*).
That gate exists and was taken. Citation: `LEDGER.md:487` — the full suite on dev `169941c6`, the closing
run's own tree: **77 / 1 / None / 1**, passed 3379 of 3456, 33 of 265 files, attribution *"0 appeared · 2
disappeared"*, and the orchestrator's own closing sentence: *"Nothing unexplained."* STRENGTH: entailed.
The 2026-09-16 continuation added no code to this subject; the move is a records correction of a row that
had been closeable since 2026-09-08.
