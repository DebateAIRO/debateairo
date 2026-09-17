# [unassigned] F-T5-MIGRATION-NUMBER-COLLISION · both parents numbered migrations independently

```yaml
state:
  ticket: F-T5-MIGRATION-NUMBER-COLLISION
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-16 by RECORDS(CONT-T19) from BUILD(CONT-T5) (SDD ledger :58).

The reconcile merge joined two lines that had each been numbering migrations from the same counter, so
HEAD carries **colliding `0050`–`0057` pairs**. They apply — the runner sorts by full file name, not by
the numeric prefix — but the invariant "the number identifies the migration" is gone.

**The operational consequence, and the reason for the `high` tier:** a new migration's number can no
longer be chosen by reading the highest one; it has to be **measured at write time**. This continuation
did exactly that three times (`0062` Task 5b, `0063` Task 10's renumber of the peer's migration, `0064`
Task 15) and each was correct only because its packet forced the measurement.

**Charge:** either make the collision impossible (a migration-numbering audit that fails on a duplicate
prefix) or make it harmless on the record — state that the full file name is the identity, and fix every
tool and comment that still treats the prefix as unique. STRENGTH: entailed.
