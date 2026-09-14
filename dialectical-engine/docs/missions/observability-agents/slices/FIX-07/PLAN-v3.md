# FIX-07 Replica-Safe Heartbeat and Capture-OFF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a replica-safe shared capture lease, honor `${OBS_CONTROL_DIR}/CAPTURE_OFF` while a sink is hung, persist all frozen gap classes, and classify live active periods separately from quiet periods.

**Architecture:** Keep FIX-01's one runtime timer and serialized sink promise. Each tick starts a separately serialized marker sample before it decides whether a sink cycle may start; the cached emitter gate changes independently of a hung sink. Every armed replica refreshes one server-clock runtime lease, while process stop performs no STOPPED write. Existing health events feed the existing gap counter, and the pasteable query reads recent occurrences and returns `ACTIVE` when warranted.

**Tech Stack:** TypeScript, Node.js timers and `fs/promises.lstat`, PostgreSQL 18, `pg`, Vitest, existing embedded-PostgreSQL fixture.

**Spec:** `docs/missions/observability-agents/slices/FIX-07/SPEC-v3.md`

## Global constraints

- Start from FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` or a descendant with the SPEC-v3 entry interfaces.
- The only marker is `${OBS_CONTROL_DIR}/CAPTURE_OFF`; no spool-relative fallback exists.
- Retain one existing interval, one `flushInFlight`, and one separately guarded `controlInFlight`; never overlap marker reads.
- Retain `CaptureRuntimeStartOptions` and the five-field `ObsBounds` unchanged.
- Migration `0063_fix07_writer_health_upsert.sql` is grant-only and contains the three SPEC-v3 grants exactly.
- No installer, zone, registry, `@debateai/db`, product, package/lockfile, standing-test, test-support, capture-core, model, CLI, or Hermes edit.
- `emit.ts`, `flusher.ts`, `queue.ts`, and `spool.ts` stay byte-identical.
- V production marker/query/veto/acceptance acts are not worker evidence.

## File map

**Create:**

- `migrations/0063_fix07_writer_health_upsert.sql` — the three column grants only.
- `packages/obs-capture/src/runtime/control.ts` — marker path and fail-closed `lstat` probe.
- `tests/unit/fix07-gap-classes.test.ts` — closed vocabulary, failure conversion, and exact aggregate counts.
- `tests/integration/fix07-heartbeat.test.ts` — real-role upsert, replica lease, server clock, lifecycle, and cadence.
- `tests/integration/fix07-off-switch.test.ts` — control truth table, held-sink cutover, period query, and product invariance.

**Modify:**

- `packages/obs-capture/src/runtime/config.ts` — `readObsControlDir` only.
- `packages/obs-capture/src/runtime/index.ts` — shared gate, `controlInFlight`, health-to-gap observer, cycle state, and no STOPPED write.
- `packages/obs-capture/src/runtime/sink.ts` — runtime-only health port and exact three-parameter upsert.
- `packages/obs-capture/src/health.ts` — the five SPEC-v3 vocabulary/count entries only.

## Requirement trace

| Requirement | Plan coverage | Proof |
|---|---|---|
| FIX-07-R01 shared heartbeat | Tasks 1 and 3 | authenticated upsert plus two-replica lease test |
| FIX-07-R02 all gap classes counted | Tasks 2 and 3 | exact class/count recovery tests |
| FIX-07-R03 OFF within one interval | Tasks 2 and 3 | unresolved-sink fake-timer test |
| FIX-07-R04 quiet differs from off and active | Task 4 | exact SQL case matrix |
| FIX-07-R05 bounded cost/pre-arm zero | Task 3 | one timer, one upsert per completed armed cycle, zero pre-arm |
| FIX-07-R06 product invariant | Task 4 | byte-identical status/stderr triple |
| FIX-07-R07 V veto is Done | Task 4 handoff | explicit unperformed V boundary |

## RED matrix

| ID | Planted behavior before implementation | Required RED assertion |
|---|---|---|
| RED-07-01 | 0063 absent | writer exact upsert returns 42501 |
| RED-07-02 | old gap vocabulary | POSTGRES_FAILURE, GAP_WRITE_FAILURE, and DISABLED are rejected as gap classes |
| RED-07-03 | marker/config modules absent | exact path and truth-table imports fail |
| RED-07-04 | stop writes shared STOPPED or accepts client time | live sibling becomes OFF or older time wins |
| RED-07-05 | marker sample is inside `flushInFlight` or its timer starts after startup sink | held startup/armed sink leaves post-marker emit delegated beyond two intervals |
| RED-07-06 | failure health is not converted | recovery has no POSTGRES_FAILURE/GAP_WRITE_FAILURE rows |
| RED-07-07 | v2 period query | recent occurrence with fresh ARMED/no-gap returns QUIET rather than ACTIVE |
| RED-07-08 | OFF leaks into product behavior | status or stderr differs from the uninstalled control |

---

### Task 0: Pin sources, allocation, and forbidden bytes

**Files:** read only.

**Interfaces:**

- Consumes: SPEC-v3, FIX-01 HEAD, migration 0034, every active migration claim.
- Produces: recorded base SHA, migration allocation report, and byte hashes for forbidden source.

- [ ] **Step 0.1: Verify the base and frozen interfaces**

Run:

```bash
test "$(git merge-base --is-ancestor 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4 HEAD; echo $?)" = 0
rg -n "flushInFlight|setInterval|CaptureRuntimeStartOptions|interface ObsBounds|createCaptureHealth|CAPTURE_GAP_CLASSES" packages/obs-capture/src/runtime packages/obs-capture/src/health.ts
```

Expected: ancestor check `0`; one existing interval; one `flushInFlight`; three start options; five bounds fields; the health observer and process-local gap counter exist.

- [ ] **Step 0.2: Repeat the migration collision audit**

Run all local and remote refs plus every registered worktree, including untracked files, and search mission documents for paper allocations:

```bash
git for-each-ref --format='%(refname)' refs/heads refs/remotes
git worktree list --porcelain
rg -n "(^|[^0-9])0063([^0-9]|$)|0063_" . --glob '!**/.hermes/**'
```

Expected: every match is this FIX-07 authority packet; no migration file or other allocation claims 0063. Record ref and worktree counts. STOP on any competing match.

- [ ] **Step 0.3: Hash forbidden source and record the exact ledger**

Run:

```bash
git hash-object packages/obs-capture/src/emit.ts packages/obs-capture/src/flusher.ts packages/obs-capture/src/queue.ts packages/obs-capture/src/spool.ts packages/obs-capture/install/api.ts packages/obs-capture/install/runner.ts packages/obs-capture/install/scheduler.ts packages/db/src/obs-schema.ts
```

Expected: eight hashes retained for Task 4. The only authorized production paths are the migration, `runtime/{control,config,index,sink}.ts`, and `health.ts`.

### Task 1: Grant and prove the server-clock shared lease

**Files:**

- Create: `migrations/0063_fix07_writer_health_upsert.sql`
- Create: `tests/integration/fix07-heartbeat.test.ts`

**Interfaces:**

- Consumes: migration 0034 `obs.component_health` primary key and writer baseline.
- Produces: exact executable grant vector for Task 3's `writeComponentHealth`.

- [ ] **Step 1.1: Write RED-07-01 against the unmigrated writer role**

In `fix07-heartbeat.test.ts`, start the existing embedded database, set `debateai.obs_writer_password` before `migrate`, connect a separate `pg.Client` as `debateai_obs_writer`, and execute:

```sql
INSERT INTO obs.component_health (component, state, observed_at, detail_code)
VALUES ($1, $2, clock_timestamp(), $3)
ON CONFLICT (component) DO UPDATE SET
  state = $2,
  observed_at = clock_timestamp(),
  detail_code = $3,
  updated_at = clock_timestamp()
```

Assert SQLSTATE `42501` before 0063. Run:

```bash
out=$(pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

- [ ] **Step 1.2: Add only the three grants**

Create the migration with exactly:

```sql
GRANT INSERT (component, state, observed_at, detail_code)
  ON obs.component_health TO debateai_obs_writer;
GRANT SELECT (component)
  ON obs.component_health TO debateai_obs_writer;
GRANT UPDATE (state, observed_at, detail_code, updated_at)
  ON obs.component_health TO debateai_obs_writer;
```

- [ ] **Step 1.3: Prove two authenticated connections and negative authority**

Use two writer clients. Client A inserts `ARMED|FLUSH_OK`. Client A then starts a transaction, conflict-upserts `SPOOL_ONLY|POSTGRES_FAILURE`, and holds the row lock. Client B starts the exact upsert to `ARMED|FLUSH_OK`; assert it remains pending until A commits, then finishes. Through the fixture owner assert one row, final `ARMED|FLUSH_OK`, and a strictly later `observed_at`.

Assert this exact privilege vector:

```text
table INSERT=f SELECT=f UPDATE=f DELETE=f TRUNCATE=f
component INSERT=t SELECT=t UPDATE=f
state SELECT=f UPDATE=t
updated_at INSERT=f UPDATE=t
```

Direct writer `SELECT state` and `UPDATE component` must return `42501`.

Run:

```bash
out=$(pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +1 passed \(1\)$'
```

- [ ] **Step 1.4: Commit C1**

```bash
git add migrations/0063_fix07_writer_health_upsert.sql tests/integration/fix07-heartbeat.test.ts
git diff --cached --check
git commit -m "feat(obs): FIX-07 C1 — grant replica-safe capture lease"
```

### Task 2: Close configuration, marker, and gap vocabularies

**Files:**

- Create: `packages/obs-capture/src/runtime/control.ts`
- Create: `tests/unit/fix07-gap-classes.test.ts`
- Modify: `packages/obs-capture/src/runtime/config.ts`
- Modify: `packages/obs-capture/src/health.ts`
- Create the configuration/truth-table cases in `tests/integration/fix07-off-switch.test.ts`

**Interfaces:**

- Produces: `readObsControlDir`, `captureOffMarkerPath`, `readCaptureOff`, and the three required gap classes.

- [ ] **Step 2.1: Write RED-07-02 and RED-07-03**

Assert these literal additions:

```ts
expect(CAPTURE_HEALTH_CODES.DISABLED).toBe("DISABLED");
expect(CAPTURE_GAP_CLASSES.POSTGRES_FAILURE).toBe("POSTGRES_FAILURE");
expect(CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE).toBe("GAP_WRITE_FAILURE");
expect(CAPTURE_GAP_CLASSES.DISABLED).toBe("DISABLED");
```

Assert a fresh snapshot has `DISABLED: 0`. Call `recordLoss` directly with POSTGRES_FAILURE counts `1` and `2`, GAP_WRITE_FAILURE counts `1` and `3`, and DISABLED counts `1` and `7`; flush the counter and assert the exact aggregate rows `unclassified|POSTGRES_FAILURE|3`, `unclassified|GAP_WRITE_FAILURE|4`, and `first_party|DISABLED|8`. Task 3 separately proves the health-observer conversion.

Table-test control directory inputs: missing, empty, relative, and NUL return undefined; `/tmp/fix07-control` returns unchanged; `OBS_SPOOL_DIR` never affects it. Test absent marker ON, existing file/directory/symlink OFF, `ENOENT` ON, every other error OFF, and undefined marker ON. Retain RED.

```bash
out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

- [ ] **Step 2.2: Implement the closed configuration and marker probe**

Add only:

```ts
export function readObsControlDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined;

export function captureOffMarkerPath(
  controlDir: string | undefined,
): string | undefined;

export async function readCaptureOff(
  markerPath: string | undefined,
): Promise<boolean>;
```

`readObsControlDir` uses `node:path.isAbsolute`; `captureOffMarkerPath` joins only `CAPTURE_OFF`; `readCaptureOff` uses `lstat`, returns false only for undefined or `ENOENT`, and returns true for success or every other error.

- [ ] **Step 2.3: Add exactly five health vocabulary entries**

In `health.ts`, add only DISABLED to the health object and zero snapshot, and POSTGRES_FAILURE, GAP_WRITE_FAILURE, DISABLED to the gap object. Do not edit gap-counter algorithms.

Run:

```bash
out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts tests/unit/fix01-runtime-shape.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +3 passed \(3\)$'
```

- [ ] **Step 2.4: Commit C2**

```bash
git add packages/obs-capture/src/runtime/control.ts packages/obs-capture/src/runtime/config.ts packages/obs-capture/src/health.ts tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git commit -m "feat(obs): FIX-07 C2 — bind OFF control and frozen gap classes"
```

### Task 3: Implement independent sampling and the replica-safe heartbeat

**Files:**

- Modify: `packages/obs-capture/src/runtime/index.ts`
- Modify: `packages/obs-capture/src/runtime/sink.ts`
- Extend: `tests/integration/fix07-heartbeat.test.ts`
- Extend: `tests/integration/fix07-off-switch.test.ts`
- Extend: `tests/unit/fix07-gap-classes.test.ts`

**Interfaces:**

- Consumes: Task 1 grants and Task 2 control/gap vocabulary.
- Produces: runtime-only `writeComponentHealth`, one-timer control sampling, cached gate, and shared lease.

- [ ] **Step 3.1: Write RED-07-04 for replica and time ordering**

Drive two isolated runtime children, each with its own writer pool, against the same `capture:runner` row and shared control directory. Assert:

```text
A armed write -> lease fresh
B armed write -> exactly one row
B stop -> zero component-health statements
A next cycle -> query is not OFF
A stop -> zero component-health statements
after fixture ages observed_at past cutoff -> query is OFF
```

Assert the health-write port accepts no `observedAt` and no `STOPPED` state. Hold one writer transaction's conflict lock while the other writes and assert database time advances in serialization order.

- [ ] **Step 3.2: Write RED-07-05 for the held-sink switch**

Use fake timers with `flushDeadlineMs=25`. In the first case, let the default-gap transfer settle, hold the startup occurrence/gap sink unresolved while phase remains ARMING, create `CAPTURE_OFF`, advance at least 51 ms, and call both public emitter methods before releasing the sink. In the second case, arm ON and hold a later timer cycle's occurrence sink. Repeat the marker/clock/emitter actions. In both cases assert the calls were not delegated, both counted DISABLED, queued post-drain entries were counted once, marker reads never overlap, each attempt calls `lstat` once, and `setInterval` was registered exactly once.

Remove the marker, settle the next control attempt, release the sink, and assert the next emit persists. Retain RED against the v2 sampling shape.

- [ ] **Step 3.3: Write RED-07-06 for exact failure rows**

Force one failed occurrence-batch write followed by successful spool/recovery. Assert eventual `unclassified|POSTGRES_FAILURE|1` even though the envelope was spooled. Force one capture-gap write failure followed by recovery. Assert the original row is eventually present and `unclassified|GAP_WRITE_FAILURE|1` is a distinct row. Fail the GAP_WRITE_FAILURE row once more and assert its eventual total is `2`, not an unbounded recursive call.

- [ ] **Step 3.4: Add the internal sink port and exact upsert**

Add:

```ts
export type CaptureHeartbeatState =
  | "ARMED" | "SPOOL_ONLY" | "DRAINING" | "OFF";

export interface CaptureComponentHealthWrite {
  readonly component: `capture:${string}`;
  readonly state: CaptureHeartbeatState;
  readonly detailCode: CaptureHealthCode;
}

export interface CaptureRuntimeDatabaseSink extends PostgresCaptureSink {
  writeComponentHealth(row: CaptureComponentHealthWrite): Promise<void>;
}
```

Return the extension from `createPostgresCaptureSink` and execute SPEC-v3 §2.6's exact SQL with three parameters. Do not add `observedAt`, STOPPED, `RETURNING`, a table-column expression, or another pool.

- [ ] **Step 3.5: Wire the observer without editing the flusher**

In `createStartingState`, retain the concrete queue and create `let gaps: CaptureGapCounter | undefined` before the health observer. The observer:

```ts
lastDetailCode = code;
if (code === CAPTURE_HEALTH_CODES.POSTGRES_FAILURE) {
  gaps?.recordLoss("unclassified", CAPTURE_GAP_CLASSES.POSTGRES_FAILURE, 1);
}
if (code === CAPTURE_HEALTH_CODES.GAP_WRITE_FAILURE) {
  gaps?.recordLoss("unclassified", CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE, 1);
}
```

Then assign `gaps = createCaptureGapCounter({ health })`. Preserve one unreported health-write failure until a later health upsert succeeds.

- [ ] **Step 3.6: Add the gate and separately guarded control attempt**

Store the queue, marker path, `captureOff`, and `controlInFlight` in the active state. Install a frozen emitter wrapper whose OFF branch records health and one DISABLED loss without delegation.

`beginControlSample` must:

```text
return current controlInFlight when present
otherwise call readCaptureOff exactly once
after settlement, verify current generation and phase is not STOPPED
on ON -> OFF: set gate, drain queue once, count exact drained length
on OFF -> ON: clear gate
on probe rejection: use OFF
clear only its own controlInFlight in finally
```

Inside the startup promise, await the existing default-gap transfer, verify that the generation is current and not stopped, start the existing interval, and only then enter the startup sink. Because the async startup promise is assigned to `flushInFlight` before it resumes after the transfer await, ARMING timer ticks sample control but cannot start another sink cycle. In the interval callback, call `beginControlSample` before checking phase and `flushInFlight`. When phase is ARMED and no flush exists, the new flush awaits that same control promise before sink work. Do not register another timer.

- [ ] **Step 3.7: Derive current state and omit STOPPED health writes**

For a completed ARMED cycle, derive immediately before upsert:

```text
captureOff -> OFF
drainInFlight -> DRAINING
result.spooled > 0 -> SPOOL_ONLY
else -> ARMED
```

At stop, clear the interval, mark the generation stopped, ignore late control settlement, retain the existing bounded final drain/flush, and skip component health. A process that never reaches ARMED writes zero health rows.

- [ ] **Step 3.8: Run the concurrency cluster three times**

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +3 passed \(3\)$' || exit 1; done
```

Temporarily move `beginControlSample` below the `flushInFlight` guard and retain RED-07-05, then restore. Temporarily write STOPPED on B stop and retain RED-07-04, then restore.

- [ ] **Step 3.9: Commit C3**

```bash
git add packages/obs-capture/src/runtime/index.ts packages/obs-capture/src/runtime/sink.ts tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git commit -m "feat(obs): FIX-07 C3 — sample OFF independently and publish shared lease"
```

### Task 4: Prove ACTIVE versus QUIET and product invariance

**Files:**

- Extend: `tests/integration/fix07-off-switch.test.ts`

**Interfaces:**

- Consumes: SPEC-v3 §2.7 exact query and Tasks 1–3 runtime.
- Produces: exhaustive period and product-byte evidence.

- [ ] **Step 4.1: Write RED-07-07 with the exact query**

Execute SPEC-v3 §2.7 verbatim against this matrix:

```text
missing health -> OFF
stale health -> OFF
fresh OFF -> OFF
fresh historical STOPPED -> OFF
fresh SPOOL_ONLY -> BLIND
fresh failure detail -> BLIND
open gap -> BLIND
recent closed gap -> BLIND
fresh ARMED + recent occurrence for same runtime + no gap -> ACTIVE
fresh ARMED + zero recent occurrence + no gap -> QUIET
old occurrence outside cutoff -> QUIET
```

Assert exactly `api`, `runner`, `scheduler` in lexical order and no label outside `OFF|BLIND|ACTIVE|QUIET`. Retain the v2 counterexample returning QUIET as RED.

- [ ] **Step 4.2: Write RED-07-08 for product bytes and control failures**

Spawn the same scheduler failure input in isolated children: installed ON, installed OFF, and installer absent. Capture status, stdout, and stderr before querying observability. Assert the three product triples are byte-identical; OFF adds no post-cutover occurrence and adds exact DISABLED count. Make marker polling fail closed and health upsert reject; neither rejection may enter product output or status.

- [ ] **Step 4.3: Run focused and standing verification**

Run the FIX-07 suite three times as in Step 3.8. Then:

```bash
out=$(pnpm exec vitest run tests/unit/fix01-*.test.ts tests/integration/fix01-*.test.ts tests/architecture/fix01-*.test.ts tests/integration/obs-l1-s01-foundation.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
out=$(pnpm typecheck 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
```

Expected: both exit 0. Record exact passed/total summaries.

- [ ] **Step 4.4: Run final authority checks**

Assert the Task 0 hashes are unchanged. Assert the changed production/test/migration paths equal the nine-path ledger. Assert `health.ts` has exactly five semantic additions. Assert `runtime/index.ts` contains one `setInterval` call and no synchronous filesystem API. Assert no changed production file imports `@debateai/db`, zone, registry, model/provider, CLI, or `child_process`.

Repeat the all-ref/all-worktree 0063 audit. STOP if a collision appeared.

```bash
git diff --check
git status --short
git diff --name-only 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4..HEAD
rg -n "@debateai/db|src/zone|src/registry|child_process|setInterval" packages/obs-capture/src/runtime packages/obs-capture/src/health.ts
```

- [ ] **Step 4.5: Commit C4 and hand off without V claims**

```bash
git add tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git commit -m "test(obs): FIX-07 C4 — prove active quiet off blind and product invariance"
```

Handoff includes four implementation SHAs, final HEAD, FIX-01 base, final migration/ref/worktree counts, writer privilege vector and both 42501 probes, focused worst-run summary, standing/typecheck summaries, forbidden hashes, exact query, and the statement: `V production marker, query, veto, and acceptance remain unperformed.`

## Transaction and ordering semantics

- Each health upsert is one PostgreSQL autocommit statement; it is not in a product transaction.
- The component primary key serializes concurrent upserts. `clock_timestamp()` in the conflict update is evaluated after conflict-lock acquisition; no client event time is accepted.
- A process stop performs no health statement. Shared lease expiry, not last-stop commit order, represents all replicas stopped.
- Marker gate assignment and queue drain are synchronous in one JavaScript turn. Sink work already holding a drained batch is pre-cutover; no later batch is handed off while OFF.
- `controlInFlight` and `flushInFlight` are independent guards. The first has one `lstat`; the second remains the sole serializer for gap, occurrence, and health sinks. The single interval begins after default-gap transfer and before startup sink, samples in ARMING, and starts sink cycles only in ARMED.
- Failure gap counts are process-local until an existing gap flush succeeds. A failed gap write requeues the original before recording its separate GAP_WRITE_FAILURE event.
- Period precedence is `OFF`, then `BLIND`, then `ACTIVE`, then `QUIET`. Query failure is no proof, never QUIET.

## Stop conditions

Apply every SPEC-v3 §6 condition. In particular, stop before editing if the base, exact grant, marker path, nine-path ledger, one-timer design, shared marker invariant, or 0063 allocation differs. Stop on any need for STOPPED writes, client heartbeat time, per-instance schema, broader grants, another timer, overlapping marker reads, capture-core edits, standing-test edits, new dependency, or V-only production acts.
