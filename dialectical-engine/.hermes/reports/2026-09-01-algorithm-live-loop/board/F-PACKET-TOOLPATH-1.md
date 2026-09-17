# [claude@fable-5] F-PACKET-TOOLPATH-1 · packets spell mission tools repo-relative; the lint does not catch it

```yaml
state:
  ticket: F-PACKET-TOOLPATH-1
  risk_tier: low
  status: waiting_review # ORCHESTRATOR PART DONE 17:39 2026-09-05: packet-lint pattern now includes tools/ (the oracle worker packet would have failed it); '## Dnn' anchors added for D64 ADDENDUM 2, D66, D64 ADDENDUM 3 (text untouched). Closure is the next codex packet audit's
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [tools/packet-lint.sh, DECISIONS.md], readonly: [—], forbidden: all_others, verification: [tools/packet-lint.sh flags a bare tools/ mention; D58/D66 findable by heading], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t1-oracle-loginfp-r1-2026-09-05
```

Filed by the oracle seat (§7): `tools/mutate.sh` is written in packets as if it were a repo path; it lives in the mission dir. The packet lint (D64 ADDENDUM 2) checks `packets/ dispatches/ agent-reports/ logs/ board/` but not `tools/`. Also: packets cite D58/D66 as if `## D` headings existed; D60–D66 were written as bold paragraphs, so a grep for the heading fails. **Fix (orchestrator):** add `tools/` to the lint's pattern; give each decision a findable anchor (a `## Dnn` heading or an index at the top of DECISIONS.md) without rewriting the text.
