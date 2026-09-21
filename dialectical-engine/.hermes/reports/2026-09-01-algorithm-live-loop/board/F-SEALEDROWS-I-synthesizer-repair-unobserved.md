# [claude@opus-5] F-SEALEDROWS-I · the SYNTHESIZER's repair attempts have no wire-level test — same class, other leg

```yaml
state:
  ticket: F-SEALEDROWS-I
  risk_tier: medium          # the shipped repair helper appends and is correct today; the guarantee is unenforced on this leg exactly as it was on the evaluator's
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review], human_review: no }
  worktree: { path: tbd, branch: tbd, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: sealedrows-postcap2-2026-09-05
```

Filed by the lane/sealedrows seat while closing codex r5 B1 for the evaluator. The SYNTHESIZER
call at `apps/runner/src/index.ts:4077` uses the same `buildSchemaRepairPacket` construction, and
its fingerprint is `composerContractHash`. No test observes what the synthesizer's REPAIR attempts
send on the wire; the evaluator's now does (`database.test.ts`, second post-cap round, `8a08f5e1`).

The shipped helper appends one user message and preserves the leading system message, so the
composer contract leads every attempt today. Unenforced, not wrong — the identical state the
evaluator leg was in before V-SEALEDROWS-2.

**Fix is the evaluator test's twin:** `startProviderDouble` already retains every inbound body;
return schema-invalid composer content first and valid second under `composerBound.maxAttempts:
2`; assert every synthesizer attempt leads with the composer contract text. Select attempts by
the `role` field in the user message, never by the system text — the seat's anti-vacuity rule.
Test-only.

**Carrying the seat's lesson into the ticket:** *when your observer and the system disagree
about how many things happened, the observer is in the wrong place.* One outer `call()`, two
wire attempts — that mismatch was visible in the first test and read as reassurance.

## MODEL UPDATED 2026-09-05 — copy the THIRD-round evaluator test, not the second

V-SEALEDROWS-3 chose to finish the evaluator's guarantee in its own lane rather than fold both
legs here. So when this ticket runs, the evaluator test to mirror is the one AFTER codex r6's
findings are closed, which differs from the r6 version in two ways that matter:

1. **Three attempts, not two.** Both sealed deployments permit `maxAttempts: 3`. Script
   invalid → invalid → valid, require three synthesizer wire bodies, assert the composer contract
   leads on all three. The second repair is a repair applied to an already-repaired packet and is
   the case a two-attempt fixture never produces.
2. **No shape pins.** No message-count delta, no assumption that the payload is the first user
   message. Find the synthesizer envelope by scanning all user messages for the serialised
   `role: "SYNTHESIZER"`. The attempt count is the only vacuity guard.

And from F-SEALEDROWS-K: every mutant claim through `tools/mutate.sh` with the D24 fields, or
marked CANNOT-ASSESS. Not prose.
