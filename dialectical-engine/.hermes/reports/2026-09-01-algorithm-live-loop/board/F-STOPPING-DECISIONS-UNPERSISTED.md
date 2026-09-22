# [unassigned] F-STOPPING-DECISIONS-UNPERSISTED · the stop and freeze decisions of a run leave no numbers behind

```yaml
state:
  ticket: F-STOPPING-DECISIONS-UNPERSISTED
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract:
    allowed: []
    readonly: [apps/runner/src/index.ts, packages/propagation/src/index.ts, packages/db/src/schema.ts]
    forbidden: all_others
    human_review: no
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, while fitting δ and ε from the real run (D77 b/5).

**The defect.** `runAdaptiveStoppingRound` (`apps/runner/src/index.ts:1813-1872`) computes, at every round
boundary, a full propagation, a `RoundContinuationDecision` (kind, reason, `maxRootMovement`, the moved
roots, `measuredEdgeCount`, the compared and uncompared roots) and one `BranchFreezeDecision` per
carrying branch (leverage, verdict). It persists exactly one thing: a `PROPAGATION` ledger row with
`call_site_key = STOPPING:round:<n>`. The strengths, the sensitivities, the reason and the verdicts are
dropped when the function returns; only a freeze that actually prevented an expansion leaves a mark.
Measured on the real run `d7b73d79` (2026-09-17): two such ledger rows (23:16:46, 23:28:22), one
persisted propagation run (the final one, `at_seq` 568), no record of either decision. STRENGTH: entailed
(read-only queries over `acceptance/.pgdata`; the function's return site).

**Why it matters.** The goal makes δ and ε values that are RE-FITTED from real runs (T7's DoD). A refit
needs the numbers the rule saw — the movement between rounds, the leverage of each branch at the moment
it was judged — and the run keeps only the final graph, where a branch's leverage has already been
changed by the very replies the rule allowed. D77's refit had to be made from the final graph for that
reason. The same gap means nobody can answer, after the fact, "why did this debate stop here?" or "how
close was this branch to being frozen?".

**Charge.** Persist each boundary's decision — ids and numbers only, no debate content — where the run's
other progress lives (a `core.run_progress_event` kind, or a small `ledger` table beside
`sensitivity_record`), and have the ceremony print one line per boundary (`T7 round <n>: <kind> <reason>
· max root movement <x> · measured edges <n> · branches <continues>/<frozen>`). RED first: a test that
runs two boundaries on a synthetic graph and reads both decisions back.
