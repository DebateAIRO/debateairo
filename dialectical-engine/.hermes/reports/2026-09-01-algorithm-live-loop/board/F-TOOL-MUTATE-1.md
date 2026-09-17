# [claude@fable-5] F-TOOL-MUTATE-1 · tools/mutate.sh cannot substitute a `/`

```yaml
state:
  ticket: F-TOOL-MUTATE-1
  risk_tier: low
  status: waiting_review # FIXED 15:56 2026-09-05: tools/mutate.sh v2 passes OLD/NEW to perl through the environment (\Q$ENV{MUT_OLD}\E), so $ @ \ and / are all allowed; v1 kept at logs/mutate.sh.v1-before-F-TOOL-MUTATE-1. Proof on a JSX mutant containing all four characters: logs/tooling/mutate-v2-jsx-proof.log (applied gate 1, HASHES MATCH, porcelain empty, exit 0). Closure is the next codex packet audit's
  owner: { agent: claude, session: orchestrator }
  contract: { allowed: [tools/mutate.sh, DECISIONS.md], readonly: [logs/w5/10-RED-m1-emphasis-input-in-options.log], forbidden: all_others, verification: [a mutant whose OLD or NEW contains `/` round-trips through the tool with HASHES MATCH], human_review: no }
  worktree: { path: n/a, branch: n/a, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: w5-r3-2026-09-05
```

Filed by lane/devsync round 3. The tool's perl substitution uses `/` as its delimiter, so any OLD/NEW containing a slash — every JSX element — cannot go through it; W5's m1 was custodied by hand with the same gate sequence and said so. **Fix (orchestrator, mission tool):** use a delimiter that cannot appear in source or quotemeta both sides (`s\x01…\x01…\x01` or `\Q…\E`), keep the emitter's record format byte-identical, and prove it on a JSX mutant. Until fixed, packets say what W5's said: hand custody with the same gate sequence, disclosed.
