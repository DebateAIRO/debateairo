# [unassigned] F-T16-MANIFEST-PROVENANCE-STALE · the migration's manifest still says the goal chose δ and ε

```yaml
state:
  ticket: F-T16-MANIFEST-PROVENANCE-STALE
  risk_tier: low
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-18 by the orchestrator, from the D77 refit's seat.

`migrations/0050_t16_algorithm_register_rows.sql:32-33` records `goal-v4-2026-09-01:80-96` as the manifest
provenance of `globalStopDelta` and `branchFreezeEpsilon`. Since `8d41d4db` the sealed rows themselves
cite `algorithm-live-loop-DECISIONS.md#D77`, which is the ruling that actually chose the values. Nothing
reads the manifest's provenance column (`grep` by the seat), so no behaviour is wrong — but it is the
shape mission ruling J8 calls audit poison: a record naming a ruling that did not choose the value.
STRENGTH: entailed.

**Charge.** A forward migration that corrects the two provenance cells (never an edit to `0050`), or a
dated sentence in the register's README saying the manifest records the ORIGINAL ruling and the sealed
row's `sourceRef` records the current one. Decide which reading the column has, then make it true.
