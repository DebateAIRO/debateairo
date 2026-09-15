# [claude@fable-5] F-TOOL-MUTATE-3 · mutate.sh appends to an existing transcript, so a re-run keeps the old stamp first and stamp-check reads the stale one

```yaml
state:
  ticket: F-TOOL-MUTATE-3
  risk_tier: low
  status: waiting_human # 21:32 2026-09-07 codex r4 CHANGES after three reworks (B1 nested-opener push inside a span; B2 completion after the last span, exact CLEAN-STATE token, exit 0–255; N1 MUT_EXPECT numeric contract; N2 packet prose) — V DECISIONS PACKET row F-TOOL-MUTATE-3; the live tools stay v3/v3/v3.2; the staged v4.1 set is not swapped
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [tools/mutate.sh, tools/stamp-check.sh, logs/tooling/ (self-tests)], readonly: [logs/diag-class-a/], forbidden: all_others, verification: [a re-run into an existing transcript either truncates it (with the old one preserved under a suffix) or stamp-check reads the LAST stamp; self-tests filed; no v3 transcript semantics changed], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: diag-class-a-r1-2026-09-07
```

**Filed from the diag-class-a seat's process note (2026-09-07).** `tools/mutate.sh` v3 appends to its output file; a mutant re-run into the same file (a rework round) leaves the round-0 `commit=` stamp first, and `tools/stamp-check.sh` takes the first stamp (`grep -m1`), so six correctly re-taken records reported STALE and looked like skipped re-takes. **Outcome:** either the emitter truncates (preserving the previous transcript under a numbered suffix — capture-before-destroy, D60) or the comparator reads the last stamp; both tools' self-tests updated; the mission's records are unaffected retroactively (the seat named which records were re-taken).
