# [claude@opus-5] F-SEALEDROWS-K · the r7 mutant claims are prose again — the D24/D42 lesson did not carry

```yaml
state:
  ticket: F-SEALEDROWS-K
  risk_tier: low             # evidence defect only; the counterexamples are statically plausible and the assertions they name exist
  status: done # Re-captured through tools/mutate.sh in the third round; codex r7: 'the three mutation records are admissible under D24/D42'. Merged at d08ee928
  owner: { agent: claude, session: lane-sealedrows }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: merged@d08ee928 }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-codex-r6-2026-09-05
```

Codex r6 F1. `logs/sealedrows/r7-b1-every-attempt-on-the-wire.log` invokes an unretained
`/tmp/r7gate.py` and reports summaries — no applied mutation, no exact command, no applied/restored
token gates, no restore, no before/after hashes. D24 calls that testimony; D42 requires
`tools/mutate.sh`. So "both mutants caught" for the wire test is statically plausible and
unverifiable at runtime.

**The same seat repaired exactly this class two rounds earlier** (E1 in codex r2/r3: prose index →
generator output, `mutant-index.py` v3/v4). The lesson held for the campaign it was learned on and
did not transfer to the next test the seat wrote. Worth naming as a pattern, not a lapse: a
custody rule learned under review pressure needs to become the seat's default, or it reverts.

**Fix:** re-capture each claimed mutant with `tools/mutate.sh` and the D24 fields, or narrow the
report to static counterexamples and mark the runtime claims CANNOT-ASSESS. Test-only; lands with
whichever lane next touches the evaluator wire test (F-SEALEDROWS-I under V-SEALEDROWS-3 option b).
