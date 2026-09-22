# [claude@opus-5] F-DEMOPATH-C · two of three acceptance doubles surface an unanswered call as a bare ANSWER_PERSIST_FAILED

```yaml
state:
  ticket: F-DEMOPATH-C
  risk_tier: low            # cost the seat an instrumentation round; will cost the next seat the same
  status: done # MERGED into integration at ae35e9d2 (2026-09-05, post-merge.sh, tree == dry-run 2b64673f; 4 files +175 −27). Codex r1 APPROVE 0 blocking / 2 follow-ups (F-DEMOPATH-R1 orchestrator packet path, F-DEMOPATH-R2 report wording). Closes on a green D15 batch b13 after W3 r4 lands
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

## 2026-09-16 continuation
Moved `waiting_product_proof` → `done` by RECORDS(CONT-T19). This row waited on an ACCOUNTING gate, not
on code — the code had landed (see the `landed?` column of the 2026-09-16 status map §4.2, *"Code landed;
each row closes by accounting against a gate that has already been taken … No further code is owed."*).
That gate exists and was taken. Citation: `LEDGER.md:487` — the full suite on dev `169941c6`, the closing
run's own tree: **77 / 1 / None / 1**, passed 3379 of 3456, 33 of 265 files, attribution *"0 appeared · 2
disappeared"*, and the orchestrator's own closing sentence: *"Nothing unexplained."* STRENGTH: entailed.
The 2026-09-16 continuation added no code to this subject; the move is a records correction of a row that
had been closeable since 2026-09-08.
