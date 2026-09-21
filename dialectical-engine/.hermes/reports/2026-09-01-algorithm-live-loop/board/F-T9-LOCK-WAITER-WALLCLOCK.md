# [unassigned] F-T9-LOCK-WAITER-WALLCLOCK · bounded lock-waiter polls decide on wall-clock, not on the lock graph

```yaml
state:
  ticket: F-T9-LOCK-WAITER-WALLCLOCK
  risk_tier: medium
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from Task 9's drafted ticket **D-T9-2**
(`task-9-report.md` §Drafted tickets). Blobs identical on BOTH parents — **pre-existing, not merge debt.**

`tests/integration/memory-database.test.ts:219-228` (150 ms) and
`tests/integration/s7-authorization-database.test.ts:940-950` (100 ms) count lock waiters inside a fixed
time window. Under load the window expires before the waiter arrives and the row goes red for a reason
that has nothing to do with locking — the same family as F22.

**Charge:** replace the fixed attempt budget with condition-based waiting on a generous deadline, or
assert the blocking relationship directly from `pg_locks` instead of counting waiters inside a window.
STRENGTH: entailed (the attribution); the line numbers are the seat's and should be re-measured before
the fix.
