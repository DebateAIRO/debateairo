# [claude@fable-5.1] F-DEMOPATH-R1 · reviewer packet named a dispatch by a path that does not resolve

```yaml
state:
  ticket: F-DEMOPATH-R1
  risk_tier: low
  status: waiting_review # ORCHESTRATOR PART DONE 13:24 2026-09-05: tools/packet-lint.sh written and run over every packet (historical offenders logged); D64 ADDENDUM 2; every packet since (w3-codex-r4, w5-worker-r3) linted OK before dispatch. Closure is the verifier's (router §5): the next codex packet audit confirms or re-opens
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [packets/*.md, tools/packet-lint.sh, DECISIONS.md], readonly: [], forbidden: all_others, verification: [tools/packet-lint.sh green over packets/], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: demo-path-r1-2026-09-05
```

Filed by codex (demo-path r1, finding R1). `packets/demo-path-codex-r1.md:70` said `dispatches/demo-path-1.txt`; the file is at `packets/dispatches/demo-path-1.txt`. The reviewer recovered by searching. Same defect class as the h-diag relative-path charge (D61 ADDENDUM) — the third time a path I wrote in a packet did not resolve from where the reader stood. **Mechanism fix, not a promise:** `tools/packet-lint.sh` now fails any packet whose `packets/`, `dispatches/`, `agent-reports/`, `logs/` or `board/` mention is not absolute (D64 ADDENDUM 2). Ran over every packet; the historical offenders are listed in its first-run log, and every packet written from now on is linted before dispatch.
