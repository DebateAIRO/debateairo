# [claude@opus-5] T17B · the refused-attempt equality boundary + the receipt's larger-arm invariant

```yaml
state:
  ticket: T17B
  risk_tier: high            # the envelope is the closing run's DoD row: "envelope state WITHIN at terminal"
  status: done # MERGED into integration at 152ed7ed. Codex 0 blocking, product fit to merge; the six mutant kills verified credited to their actual causes. Two non-blocking record corrections outstanding (the guard-algebra claim has a counterexample; 'character-for-character' overstates a changed expression whose default-0 OUTCOME is preserved)
  owner: { agent: claude, session: opus-s09-w9b }
  contract:
    allowed:
      - the lane worktree /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09 (branch lane/s09; local commits, never push)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope-self.md
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/**
    readonly:
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-s09b.md (B1 and B2-PACKET verbatim)
      - /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md (J28 + ADDENDUM, D28, D38, D51, D53, D56)
    forbidden: all_others (no re-tuning of the envelope formula; no register value re-declared; J28's successful-terminal WITHIN state must NOT be reverted)
    verification: [codex static review, judge verdict + D15 batch suite]
    human_review: no
  worktree: { path: .worktrees/lane-s09, branch: lane/s09, merge_status: merged_to_integration_152ed7ed }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: s09-codex-s09b-2026-09-02
```

## Charge

1. **B1 — the two equality contexts must stop sharing a branch.** J28 fixed the successful
   direction: a run completing with `consumed == max` records WITHIN and keeps its answer. The
   REFUSED direction still carries the old meaning. `assertModelAttemptAllowed` refuses a next
   provider call when the ledger is already `>= max`; the runner catches that
   `RUN_COST_ENVELOPE_EXHAUSTED` and accepts the catch ONLY when `evaluateEnvelope()` returns
   `HARD_STOP`. At equality the newly inclusive `decideBudgetPressure` returns `WITHIN_ENVELOPE`,
   so the runner rethrows and never calls `makeEnvelopeTerminal`. The run gets neither the ruled
   components-only envelope terminal nor an `ENVELOPE_EXHAUSTED` record.
   Represent a refused pending attempt truthfully WITHOUT reverting J28's successful-terminal
   WITHIN state, and assert the persisted outcome through the runner wrapper. The reviewer's
   words: the two contexts cannot continue to share a branch whose only input is the
   post-consumption count.
2. **B2 — my packet defect, now yours to close.** r3 required TWO independent cross-field checks:
   the selected arm must agree with `call_sites.serve`, AND `selected` must not name the smaller
   arm. My packet listed only the first, so the seat built only that, and a receipt selecting the
   SMALLER arm still parses. Require `call_sites.serve` to equal the larger arm and `selected` to
   match the constructor's tie policy, and pin the smaller-arm case with a discriminating mutant.

## RED first

Both fixes need a failing test before the fix. For B1 that means driving the RUNNER through
`RUN_COST_ENVELOPE_EXHAUSTED` at equality — the existing tests cover direct reporting at `max`
and `max+1` and a completed maximum path, and none of them enters that path.
