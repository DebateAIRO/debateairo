# FIX-09 C2 Occurrence Transaction-Lock Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this correction, plus `superpowers:test-driven-development` for the RED/GREEN cycle and `superpowers:verification-before-completion` before commit and handoff. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PLAN-v2's unauthorized occurrence row lock with a transaction-scoped advisory lock that the real listener role can acquire before a plain occurrence read and durable ACK recheck.

**Architecture:** The existing session advisory leader and concurrency cap one remain the outer production guards. Each delivery transaction additionally acquires one prefixed, UUID-canonicalized advisory transaction key, then performs the existing plain read, ACK check, fold/action, ACK, and cursor sequence. Same-key callers serialize and recheck durable state; a 64-bit hash collision only serializes unrelated callers.

**Tech Stack:** TypeScript, `pg`, PostgreSQL advisory locks, Vitest, embedded PostgreSQL.

**Spec:** `docs/missions/observability-agents/slices/FIX-09/SPEC-v3.md`, incorporating `SPEC-v2.md` except for the single corrected lock clause.

## Global Constraints

- This plan supersedes only PLAN-v2 Task 3's selected-occurrence row-lock instruction and the related transaction test. All other PLAN-v2 tasks, commands, files, commits, and handoff fields remain binding.
- The lock correction itself modifies only `tools/obs-listener/src/daemon/fold.ts` and `tests/integration/fix09-daemon.test.ts`. Continue PLAN-v2 Task 3's already-authorized `poison.ts` and `cursor.ts` work unchanged.
- Add no migration, grant, wrapper function, table, dependency, package/lockfile edit, or standing-test edit.
- The exact key is `hashtextextended('fixagent-daemon:occurrence:' || $1::uuid::text, 0)`.
- Acquire the transaction lock after `BEGIN` and before the occurrence read and ACK recheck.
- Acquire exactly one occurrence advisory key per delivery transaction. Do not use a nonblocking try-lock in production delivery.
- Task 4's daemon calls delivery only while its current client generation owns the global session leader lock. Process-local concurrency remains one.
- Keep `obs.occurrence` read-only to `debateai_obs_listener`; use a plain SELECT with no row-locking clause.
- Preserve every SPEC-v2 C2 authority and C1 pin not explicitly replaced by SPEC-v3.
- Run no Hermes command and record no V production act, acceptance, or Done verdict.

---

### Task 1: Prove listener-role transaction-lock semantics

**Files:**
- Modify: `tests/integration/fix09-daemon.test.ts`
- Read: `migrations/0034_obs_foundation.sql`

**Interfaces:**
- Consumes: two direct `pg.Client` connections authenticated by the existing embedded-test role helper as `debateai_obs_listener`.
- Produces: a real-PostgreSQL contract test for `OCCURRENCE_LOCK_SQL`, same-key exclusion, sampled different-key independence, transaction release, and unchanged occurrence grants.

- [ ] **Step 1: Add the exact SQL constant to the integration test**

```ts
const OCCURRENCE_LOCK_SQL = `
  SELECT pg_advisory_xact_lock(
    hashtextextended(
      'fixagent-daemon:occurrence:' || $1::uuid::text,
      0
    )
  )
`;

const OCCURRENCE_TRY_LOCK_SQL = `
  SELECT pg_try_advisory_xact_lock(
    hashtextextended(
      'fixagent-daemon:occurrence:' || $1::uuid::text,
      0
    )
  ) AS acquired
`;
```

- [ ] **Step 2: Add the listener-role exclusion and release test**

Use fixed ids `11111111-1111-4111-8111-111111111111` and `22222222-2222-4222-8222-222222222222`. Client A and client B each begin a transaction. Assert:

```ts
await clientA.query("BEGIN");
await clientB.query("BEGIN");
await clientA.query(OCCURRENCE_LOCK_SQL, [occurrenceX]);

expect((await clientB.query<{ acquired: boolean }>(
  OCCURRENCE_TRY_LOCK_SQL, [occurrenceX]
)).rows[0]?.acquired).toBe(false);

expect((await clientB.query<{ acquired: boolean }>(
  OCCURRENCE_TRY_LOCK_SQL, [occurrenceY]
)).rows[0]?.acquired).toBe(true);

expect((await clientA.query(
  "SELECT occurrence_id FROM obs.occurrence WHERE occurrence_id=$1",
  [occurrenceX]
)).rowCount).toBe(1);

await clientA.query("ROLLBACK");
expect((await clientB.query<{ acquired: boolean }>(
  OCCURRENCE_TRY_LOCK_SQL, [occurrenceX]
)).rows[0]?.acquired).toBe(true);
await clientB.query("ROLLBACK");
```

Also select the two `hashtextextended` results twice: X must be stable, and the fixed sampled X/Y values must differ. This is a sample-independence assertion, not a collision-freedom claim.

```ts
const keySql = `
  SELECT hashtextextended(
    'fixagent-daemon:occurrence:' || $1::uuid::text,
    0
  )::text AS key
`;
const x1 = (await clientA.query<{ key: string }>(keySql, [occurrenceX])).rows[0]?.key;
const x2 = (await clientA.query<{ key: string }>(keySql, [occurrenceX])).rows[0]?.key;
const y = (await clientA.query<{ key: string }>(keySql, [occurrenceY])).rows[0]?.key;
expect(x1).toBe(x2);
expect(x1).not.toBe(y);
```

- [ ] **Step 3: Pin the denied row lock and unchanged grant inventory**

As the listener, wrap the denied statement in a savepoint and assert SQLSTATE `42501`:

```sql
SELECT occurrence_id
FROM obs.occurrence
WHERE occurrence_id = $1
FOR UPDATE;
```

Query `information_schema.role_table_grants` and assert `debateai_obs_listener` has occurrence `SELECT` and no occurrence `UPDATE`.

- [ ] **Step 4: Run the focused test and retain the RED result**

Run:

```bash
out=$(pnpm exec vitest run tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

Expected: the new production-lock-order assertion is RED because `deliverOccurrence` is not yet implemented; the direct real-role advisory assertions pass. A `42501` from the advisory statement is a STOP rather than an expected RED.

Load `fold.ts` dynamically inside the production test so a missing `deliverOccurrence` fails that test without preventing the direct database tests from running:

```ts
const foldModule = await import("../../tools/obs-listener/src/daemon/fold.js");
expect(foldModule.deliverOccurrence).toBeTypeOf("function");
```

---

### Task 2: Acquire one transaction advisory key before the delivery read

**Files:**
- Modify: `tools/obs-listener/src/daemon/fold.ts`
- Test: `tests/integration/fix09-daemon.test.ts`
- Unchanged companion work: create `tools/obs-listener/src/daemon/poison.ts` and `tools/obs-listener/src/daemon/cursor.ts` exactly as PLAN-v2 Task 3 specifies

**Interfaces:**
- Consumes: PLAN-v2's unchanged `deliverOccurrence(client, occurrenceId): Promise<DeliveryOutcome>` seam and consumer literal `fixagent-daemon`.
- Produces: the same `DeliveryOutcome` union and transaction behavior, with the corrected exclusive acquisition order.

- [ ] **Step 1: Start the transaction and acquire the exact key**

The first database statements in `deliverOccurrence` are:

```ts
await client.query("BEGIN");
await client.query(`
  SELECT pg_advisory_xact_lock(
    hashtextextended(
      'fixagent-daemon:occurrence:' || $1::uuid::text,
      0
    )
  )
`, [occurrenceId]);
```

- [ ] **Step 2: Plain-select the occurrence, then recheck ACK**

```ts
const selected = await client.query<OccurrenceDatabaseRow>(`
  SELECT occurrence.*
  FROM obs.occurrence AS occurrence
  WHERE occurrence.occurrence_id = $1
`, [occurrenceId]);

const acknowledged = await client.query(`
  SELECT 1
  FROM obs.delivery
  WHERE occurrence_id = $1
    AND consumer = 'fixagent-daemon'
    AND delivery_status = 'ACKED'
  LIMIT 1
`, [occurrenceId]);
```

If ACK exists, commit and return PLAN-v2's unchanged `ALREADY_ACKED` outcome. The pending selector supplies an existing occurrence id; v3 adds no new missing-occurrence behavior.

- [ ] **Step 3: Keep the rest of PLAN-v2 Task 3 unchanged**

Fold/action, deterministic receipt checks, ACK append, contiguous cursor update, commit/rollback behavior, and operational-error classification remain exactly as PLAN-v2 specifies. Do not acquire an incident key, second occurrence key, row lock, or table lock.

- [ ] **Step 4: Prove two same-occurrence attempts converge**

Wrap both clients' existing query-only seams with test proxies that record statement order. Proxy A awaits the real advisory-lock query, signals `firstLockAcquired`, and waits on `releaseFirst` before returning that query result. Start `deliverOccurrence(proxyA, occurrenceX)`, await `firstLockAcquired`, then start `deliverOccurrence(proxyB, occurrenceX)`. Assert proxy B's statement log has not reached the plain occurrence SELECT or ACK query. Resolve `releaseFirst`; assert A commits, B then returns `ALREADY_ACKED`, and the database has one incident fold or terminal action, one ACK, and one cursor effect. Add no production-only pause hook.

- [ ] **Step 5: Run the focused integration file three times**

Run:

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +1 passed \(1\)$' || exit 1; done
```

Expected each run: one test file passes, zero failures, the listener grant remains unchanged, and the concurrency assertion observes only one transaction beyond the occurrence lock.

- [ ] **Step 6: Run the source and grant scans**

Run:

```bash
out=$(rg -n "FOR (NO KEY )?UPDATE|UPDATE[[:space:]]+obs\\.occurrence|LOCK[[:space:]]+TABLE[[:space:]]+obs\\.occurrence" tools/obs-listener/src/daemon/fold.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 1
out=$(rg -n -F "'fixagent-daemon:occurrence:' || \$1::uuid::text" tools/obs-listener/src/daemon/fold.ts tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
out=$(rg -n "pg_advisory_xact_lock|hashtextextended" tools/obs-listener/src/daemon/fold.ts tests/integration/fix09-daemon.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
```

Then run PLAN-v2 Task 3's focused integration command and Task 4's final evidence set without changing their other assertions.

- [ ] **Step 7: Commit under the existing C2.3 milestone**

Stage only PLAN-v2 Task 3's four paths—`fold.ts`, `poison.ts`, `cursor.ts`, and `fix09-daemon.test.ts`—and inspect the staged diff. The v3 correction introduces no fifth path. Then use PLAN-v2's existing commit boundary:

```bash
git commit -m "feat(listener): FIX-09 C2.3 — atomic delivery, dead-letter, and cursor"
```

The handoff adds: implementation HEAD `4fdfa192356ec830c5a420d6469d94b80d3c8308` as the pre-C2.3 evidence point; direct-role `42501`; advisory same/different/release results; unchanged occurrence grants; exact lock expression; source-scan output; and the statement that hash collisions conservatively serialize unrelated ids.

---

### Task 3: Preserve global-leader nesting in PLAN-v2 Task 4

**Files:**
- Modify: `tools/obs-listener/src/daemon/main.ts` only when executing PLAN-v2 Task 4
- Test: `tests/integration/fix09-daemon.test.ts`

**Interfaces:**
- Consumes: PLAN-v2's `DaemonControl`, client generation, session leader lock, and `deliverOccurrence` from Task 2.
- Produces: proof that no daemon delivery begins before the current client owns the global session leader lock.

- [ ] **Step 1: Retain PLAN-v2's global session lock before reconciliation**

The client generation must obtain:

```sql
SELECT pg_try_advisory_lock(hashtextextended('fixagent-daemon', 0));
```

Only a `true` result may enter reconciliation and invoke `deliverOccurrence`. Standby and reconnect behavior remain unchanged.

- [ ] **Step 2: Assert lock ordering in the two-daemon integration case**

Record database statements per client generation. For every delivery, assert the successful global session try-lock occurs before `BEGIN`, and the prefixed occurrence transaction lock occurs after `BEGIN` but before the plain occurrence SELECT and ACK recheck.

- [ ] **Step 3: Run PLAN-v2 Task 4 unchanged verification**

Run its focused suite three times, authority scans, standing S01 foundation suite, C1 suite, and typecheck. The v3 correction adds no new file or command beyond the lock-order assertion.

Do not commit a separate v3-only Task 4 change; use PLAN-v2's existing C2.4 commit boundary.
