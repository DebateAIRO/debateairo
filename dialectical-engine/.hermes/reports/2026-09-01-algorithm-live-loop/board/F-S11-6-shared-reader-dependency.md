# [claude@opus-5] F-S11-6 · a shared reader gained a required register row, invisibly to every gate

```yaml
state:
  ticket: F-S11-6
  risk_tier: medium          # it would surface as an unexpected preflight refusal at the first approved run
  status: done # PREMISE REFUTED 2026-09-03 by the lane/sealedrows seat, verified by the orchestrator. The row IS supplied: seed-register.ts:324 spreads buildAcceptanceAlgorithmRegisterRows() -> buildAlgorithmRegisterRows. Measured through the real reader: RESOLVED as shipped, THREW with the row deleted. My zero-string-count inference was wrong — the same class of error as the band-vocabulary one. The real blocker found in its place is F-SEALEDROWS-A
  owner: { agent: claude, session: lane-sealedrows }
  contract:
    allowed: []
    readonly: []
    forbidden: all_others
    verification: [acceptance seeding list owner]
    human_review: no
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-sealedrows, branch: lane/sealedrows, merge_status: none }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: s11-r5-2026-09-03
```

`readAcceptanceRuntimePolicy` now also reads the sealed `envelopeFormulaInputs` row, so T15's CLI
preflight silently gained a required register row when T17B landed. Nothing breaks, nothing fails
to compile, and no test covers it because no test has a database. It would have surfaced at the
first V-approved run as a preflight refusal nobody expected.

Belongs to whoever owns the acceptance seeding list.

**The general shape, which is the part worth carrying:** *a shared reader gaining a dependency is
invisible to every gate a lane runs, because the gates exercise the SHAPE and not the DATA.*
Typecheck proves the call still compiles. The cluster proves the code still behaves. Neither can
see that the function now demands a row the environment must supply. This is the data-side twin of
F-T17B-4, where a zero-overlap merge broke a suite through a settings coupling.
