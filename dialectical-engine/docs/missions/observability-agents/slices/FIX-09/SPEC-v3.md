# FIX-09 C2 — Listener occurrence transaction-lock correction

**Successor authority packet — 2026-09-04, architecture seat.** This document supersedes `SPEC-v2.md` only where an occurrence delivery transaction needs exclusive ownership before its plain occurrence read and ACK recheck. Every other C2 ruling, migration allocation, file boundary, stop condition, C1 byte/hash/interface pin, and V-owned gate in `SPEC-v2.md` remains binding. This packet records no V production run, veto, or acceptance.

## 1. Proven conflict

Implementation HEAD `4fdfa192356ec830c5a420d6469d94b80d3c8308` reached the PLAN-v2 Task 3 RED gate with no C2.3 source edit. In a real embedded PostgreSQL transaction authenticated as `debateai_obs_listener`, this statement failed:

```sql
SELECT occurrence.*
FROM obs.occurrence AS occurrence
WHERE occurrence.occurrence_id = $1
FOR UPDATE;
```

PostgreSQL returned SQLSTATE `42501`, `permission denied for table occurrence`, from `aclcheck_error`. Migration 0034 grants that role `SELECT` on `obs.occurrence`, but no occurrence `UPDATE`. PostgreSQL row locking requires update authority. C2 may not add that authority, change migration 0034, or widen migration 0062.

## 2. Exact replacement

Every `deliverOccurrence` execution follows this order:

```text
BEGIN
  -> acquire the transaction-scoped occurrence advisory lock
  -> plain SELECT the occurrence
  -> recheck the durable ACK
  -> perform the unchanged fold or typed terminal action
  -> append the unchanged ACK
  -> advance the unchanged contiguous cursor
COMMIT
```

The exact lock statement is:

```sql
SELECT pg_advisory_xact_lock(
  hashtextextended(
    'fixagent-daemon:occurrence:' || $1::uuid::text,
    0
  )
);
```

The same bound `occurrence_id` is then used in a plain `SELECT` with no locking clause. The `$1::uuid::text` cast canonicalizes any accepted UUID spelling before hashing. The `fixagent-daemon:occurrence:` prefix separates this key family from the daemon's global session-lock input and from named advisory-lock families already present elsewhere in the repository. The seed is the literal signed-bigint-compatible `0`.

The transaction advisory lock is acquired before the occurrence read and before the ACK recheck. A delivery transaction acquires exactly one occurrence key and retains it until commit, rollback, or connection loss. No C2 production path may read/check an occurrence for delivery before acquiring this key.

## 3. Lock hierarchy and sufficiency

The existing SPEC-v2 hierarchy remains:

1. the daemon connection first owns the session-scoped global leader lock keyed by `hashtextextended('fixagent-daemon', 0)`;
2. process-local delivery concurrency remains exactly one;
3. inside each delivery transaction, the leader acquires the transaction-scoped prefixed occurrence key;
4. the transaction performs the plain occurrence read, ACK recheck, fold/action, ACK, and cursor update.

Task 4's daemon loop may invoke `deliverOccurrence` only while its current client generation owns the global leader lock. The transaction lock also serializes concurrent direct calls that use the C2 repository contract for the same occurrence. All such calls must use the exact prefixed key expression.

This is sufficient for C2 because:

- identical canonical occurrence UUIDs map to the same advisory key during concurrent transactions;
- PostgreSQL grants only one exclusive transaction advisory lock for that key at a time;
- the waiter rechecks ACK after it acquires the key, so a committed first delivery becomes `ALREADY_ACKED` for the second;
- rollback and connection loss release the lock automatically and leave the unchanged atomic-delivery rules in force;
- the global leader and cap one already prevent production transactions for different occurrences from racing on mutable incident aggregates.

Advisory locks are cooperative. Any delivery path that omits the exact acquisition sequence is outside C2 authority and is a STOP, not an alternative implementation.

## 4. Key collision semantics

`hashtextextended(text, 0)` maps the prefixed 128-bit UUID text domain into a signed 64-bit advisory key, so a mathematical collision between distinct occurrence ids is possible. That collision is safe: it makes unrelated delivery transactions wait on one another. It cannot let two transactions for the same occurrence run together. With the existing global leader and concurrency cap one, production C2 does not run different occurrence transactions concurrently in any case.

The key is not persisted and is used only for simultaneous transaction exclusion. A PostgreSQL-version change in the hash implementation therefore creates no stored-key migration or restart obligation. Same-server contenders always evaluate the same built-in function.

No claim of collision freedom is authorized. Tests prove determinism for one id, exclusion for the same id, independence for a fixed sampled pair whose keys differ, and release on rollback; the safety argument above covers the collision case as conservative serialization.

## 5. Real-role verification evidence

A standalone probe used the repository's real migration runner and embedded PostgreSQL 18.4. Two direct connections authenticated as `debateai_obs_listener`. With fixed UUIDs `11111111-1111-4111-8111-111111111111` and `22222222-2222-4222-8222-222222222222`, it observed:

```json
{
  "role": "debateai_obs_listener",
  "firstKeyStable": true,
  "sampledDistinctKeysDiffer": true,
  "sameWhileHeld": false,
  "differentWhileHeld": true,
  "sameAfterRollback": true,
  "plainSelectRows": 1,
  "forUpdateCode": "42501"
}
```

`sameWhileHeld=false` is the second transaction's `pg_try_advisory_xact_lock` result while the first holds the key. `sameAfterRollback=true` proves transaction release. The listener role invoked both advisory-lock built-ins and the plain occurrence SELECT without any new grant.

## 6. Authority and file scope

No migration or grant changes. Migration `0062_fix09_listener_fold.sql`, the Drizzle declaration, notification publisher, incident constraint, and all existing role grants remain exactly as authorized by SPEC-v2.

The implementation correction remains inside SPEC-v2's existing C2 write set:

- modify `tools/obs-listener/src/daemon/fold.ts` only where the transaction begins, acquires delivery ownership, and reads the occurrence;
- extend `tests/integration/fix09-daemon.test.ts` with the exact listener-role lock/exclusion/release assertions.

No additional production or test file is authorized. `obs.occurrence` stays read-only to `debateai_obs_listener`. `FOR UPDATE`, `FOR NO KEY UPDATE`, occurrence mutation, an occurrence update grant, a security-definer lock wrapper, a new lock table, and a migration change are forbidden.

All SPEC-v2 prohibitions remain: no model, provider, CLI, child process, Hermes, product source, `@debateai/db` daemon import, `occurrence_detail`, `identity.*`, raw `core.run`, detector-view poll, trace, tier, notification, dispatch, mutation, or C1 change.

## 7. Corrected verification and stop conditions

The PLAN-v2 Task 3 integration gate gains these assertions:

1. `FOR UPDATE` as the listener produces `42501`, proving no grant was widened;
2. the exact prefixed transaction lock plus a plain occurrence SELECT succeeds as the listener;
3. while client A holds occurrence X's transaction lock, client B's try-lock for X returns false;
4. client B's try-lock for fixed occurrence Y returns true when the sampled keys differ;
5. after client A rolls back, client B's try-lock for X returns true;
6. two same-occurrence delivery attempts produce exactly one fold/action and ACK; the waiter returns `ALREADY_ACKED` after its post-lock recheck;
7. C2 production source contains no occurrence `FOR UPDATE` or occurrence mutation and the listener grant inventory contains occurrence `SELECT` but no occurrence `UPDATE`.

In addition to every SPEC-v2 stop, C2 stops before implementation or commit if the real listener cannot execute the exact advisory-lock expression, the plain SELECT fails, same-key exclusion or rollback release fails, delivery reads before the transaction lock, a code path uses a different key expression, a transaction acquires more than one occurrence key, Task 4 can call delivery without global leadership, or any grant/migration expansion is proposed.

No V-owned act is required for this correction. Production acceptance remains pending at its existing gate.
