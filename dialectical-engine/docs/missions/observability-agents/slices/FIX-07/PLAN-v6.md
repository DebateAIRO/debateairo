# FIX-07 Transport-Only Launch Cadence and Pre-Install OFF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve landed fallback behavior at every shared-loader caller, then propagate one canonical landed flush interval through the real API, runner, scheduler, and query paths while retaining the replica-safe lease and pre-install OFF gate.

**Architecture:** Preserve v5's corrected runtime, SQL, and launch path while removing numeric policy from the shared command loader. Its one new optional-string property transports raw values unchanged for ordinary callers. The acceptance parent invokes landed `readObsBounds` once, exports that canonical decimal before child assembly, and requires exact command, child, scheduler, and query echoes; omission or replacement stops before interpretation.

**Tech Stack:** TypeScript, Node.js timers and `fs/promises.lstat`, PostgreSQL 18, `pg`, Vitest, existing embedded-PostgreSQL fixture.

**Spec:** `docs/missions/observability-agents/slices/FIX-07/SPEC-v6.md`

## Global constraints

- Start from FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` or a descendant with the SPEC-v6 entry interfaces; record the exact implementation base before editing.
- The only marker is `${OBS_CONTROL_DIR}/CAPTURE_OFF`; no spool-relative fallback exists.
- Await one descriptor-only, fail-closed sample before emitter installation/readiness; stop during it yields no late install or timer.
- Retain one existing interval, one `flushInFlight`, and one separately guarded `controlInFlight`; never overlap marker reads.
- All processes covered by one acceptance query use one coherent effective `flushDeadlineMs`; tests/query bind that exact value.
- `packages/register/src/runtime-environment.ts` changes only by the exact passive SPEC-v6 §2.8 property after controller serialization against another writer.
- Landed `readObsBounds` remains the sole numeric/default authority. The shared loader forwards any optional string and never rejects empty, malformed, non-positive, fractional, or unsafe cadence.
- The acceptance parent exports the `readObsBounds` decimal before invoking the loader or assembling children. Exact post-canonical command/child/scheduler/query equality, not loader validation, is the fail-closed gate.
- Retain `CaptureRuntimeStartOptions` and the five-field `ObsBounds` unchanged.
- Migration `0063_fix07_writer_health_upsert.sql` is grant-only and contains the three SPEC-v6 grants exactly.
- No register edit outside that property; no installer, zone, registry, `@debateai/db`, product, package/lockfile, standing-test, test-support, capture-core, model, CLI, or Hermes edit.
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
- `packages/obs-capture/src/health.ts` — the five SPEC-v6 vocabulary/count entries only.
- `packages/register/src/runtime-environment.ts` — the one passive optional-string property inside `loadDevelopmentCommandEnvironment` only.

## Requirement trace

| Requirement | Plan coverage | Proof |
|---|---|---|
| FIX-07-R01 shared heartbeat | Tasks 1 and 3 | authenticated upsert plus two-replica lease test |
| FIX-07-R02 all gap classes counted | Tasks 2 and 3 | exact class/count recovery tests |
| FIX-07-R03 OFF within one interval | Tasks 2 and 3 | pre-install plus unresolved-sink fake-timer tests |
| FIX-07-R04 quiet differs from off and active | Tasks 2 and 4 | real child propagation, mismatch RED, and exact SQL case matrix |
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
| RED-07-09 | health cutoff is fixed at one minute | 30-second-old row at landed 5-second cadence returns QUIET |
| RED-07-10 | emitter installs before initial marker sample settles | pre-existing OFF marker leaks an immediate post-readiness emit |
| RED-07-11 | command allowlist omits/replaces canonical cadence | API/runner use 5000 while psql uses 7250, so age 6000 falsely returns QUIET |
| RED-07-12 | a shared-loader regex/refinement becomes a second numeric authority | empty, malformed, non-positive, fractional, or overflow cadence throws before landed fallback in `dev:auth:up` and six unrelated CLIs |

---

### Task 0: Pin sources, allocation, and forbidden bytes

**Files:** read only.

**Interfaces:**

- Consumes: SPEC-v6, FIX-01 HEAD, migration 0034, all seven shared-loader CLI callers, real development launchers, every active migration claim.
- Produces: recorded base SHA, migration allocation report, and byte hashes for forbidden source.

- [ ] **Step 0.1: Verify the base and frozen interfaces**

Run:

```bash
test "$(git merge-base --is-ancestor 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4 HEAD; echo $?)" = 0
rg -n "flushInFlight|setInterval|CaptureRuntimeStartOptions|interface ObsBounds|createCaptureHealth|CAPTURE_GAP_CLASSES" packages/obs-capture/src/runtime packages/obs-capture/src/health.ts
rg -n "loadDevelopmentCommandEnvironment|commandEnvironment|startDevelopmentApiProcess|startDevelopmentRunnerProcess|env:" packages/register/src/runtime-environment.ts apps/runner/src/dev-*-cli.ts apps/runner/src/dev-auth-stack.ts apps/runner/src/dev-api-process.ts apps/runner/src/dev-runner-process.ts
```

Expected: ancestor check `0`; one existing interval; one `flushInFlight`; three start options; five bounds fields; the health observer and process-local gap counter exist. Exactly seven CLI files call the shared loader once: `dev-auth-stack`, `dev-hatchet-token`, `dev-api-environment`, `dev-auth-data-plane`, `dev-deployment-register`, `dev-api-process`, and `dev-ui-process`. The command loader is the only missing API/runner cadence link; both child assemblers already spread `commandEnvironment` without a cadence override. Record `FIX07_BASE=$(git rev-parse HEAD)`. STOP if another writer currently owns `runtime-environment.ts`.

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

Also hash `apps/runner/src/{dev-auth-stack-cli,dev-auth-stack,dev-api-environment,dev-api-process,dev-runner-process}.ts`, `apps/scheduler/src/cli.ts`, root `package.json`, and `packages/register/src/runtime-environment.ts`. Retain all hashes for Task 4. The only authorized production paths are the migration, `runtime/{control,config,index,sink}.ts`, `health.ts`, and the single register property.

- [ ] **Step 0.4: Capture the standing register-suite baseline before editing**

Before editing, run the exact thirteen-file standing suite named in Step 4.4 at `FIX07_BASE`; retain its exit code, passed/failed totals, and normalized failing test identifiers as `FIX07_BASE_STANDING_RC` and `FIX07_BASE_STANDING_FAILURES` in the implementation evidence. On exact FIX-01 `24d0b3e5`, the known unrelated baseline is 83 passed and three failed: `tests/unit/s6-content-encryption.test.ts`, `tests/architecture/s10-carrier-erasure-red.test.ts`, and `tests/architecture/s8-publication-contract.test.ts`. A descendant may have closed those failures. Do not waive a new failure: final failures must be a subset of the recorded base identifiers and the failed total may not increase. STOP if the base has any different standing failure before FIX-07 editing.

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
- Modify: `packages/register/src/runtime-environment.ts`
- Create the configuration/truth-table cases in `tests/integration/fix07-off-switch.test.ts`

**Interfaces:**

- Produces: transport-only cadence forwarding, `readObsControlDir`, `captureOffMarkerPath`, `readCaptureOff`, and the three required gap classes.

- [ ] **Step 2.1: Write RED-07-02, RED-07-03, RED-07-11, and RED-07-12**

Assert these literal additions:

```ts
expect(CAPTURE_HEALTH_CODES.DISABLED).toBe("DISABLED");
expect(CAPTURE_GAP_CLASSES.POSTGRES_FAILURE).toBe("POSTGRES_FAILURE");
expect(CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE).toBe("GAP_WRITE_FAILURE");
expect(CAPTURE_GAP_CLASSES.DISABLED).toBe("DISABLED");
```

Assert a fresh snapshot has `DISABLED: 0`. Call `recordLoss` directly with POSTGRES_FAILURE counts `1` and `2`, GAP_WRITE_FAILURE counts `1` and `3`, and DISABLED counts `1` and `7`; flush the counter and assert the exact aggregate rows `unclassified|POSTGRES_FAILURE|3`, `unclassified|GAP_WRITE_FAILURE|4`, and `first_party|DISABLED|8`. Task 3 separately proves the health-observer conversion.

For RED-07-12, use this raw matrix against the real shared loader and landed `readObsBounds`:

```ts
const cadenceCases = [
  ["absent", undefined, undefined, 5000],
  ["empty", "", "", 5000],
  ["malformed", "malformed", "malformed", 5000],
  ["zero", "0", "0", 5000],
  ["negative", "-1", "-1", 5000],
  ["fractional", "1.5", "1.5", 5000],
  ["below default", "250", "250", 250],
  ["default", "5000", "5000", 5000],
  ["non-default", "7250", "7250", 7250],
  ["maximum safe", "9007199254740991", "9007199254740991", 9007199254740991],
  ["overflow", "9007199254740992", "9007199254740992", 5000],
] as const;

it.each(cadenceCases)("transports %s without taking numeric authority", (
  _label, raw, forwarded, effective
) => {
  withObsFlushDeadline(raw, () => {
    const commandEnvironment = loadDevelopmentCommandEnvironment();
    expect(commandEnvironment.OBS_FLUSH_DEADLINE_MS).toBe(forwarded);
    expect(withObsFlushDeadline(forwarded, () => readObsBounds().flushDeadlineMs))
      .toBe(effective);
  });
});
```

`withObsFlushDeadline` saves the prior own-property/value, assigns or deletes only `process.env.OBS_FLUSH_DEADLINE_MS`, executes the callback synchronously, and restores the prior state in `finally`. Do not duplicate the numeric rule inside that helper. The present omission keeps every defined `forwarded` assertion RED; the v5 regex/refinement mutant throws on the fallback inputs before `readObsBounds` and also remains RED.

Exercise every real loader caller under Vitest module isolation. Partially mock `@debateai/register` with `vi.importActual` so the wrapper invokes the real `loadDevelopmentCommandEnvironment`, and mock only the first downstream operation to throw a sentinel after the loader returns. Use this exact caller/sentinel map:

```text
dev:auth:up                       dev-auth-stack-cli.ts          startDevelopmentAuthStack
dev:auth:provision-hatchet-token dev-hatchet-token-cli.ts       provisionDevelopmentHatchetToken
dev:auth:assemble-api-env         dev-api-environment-cli.ts     assembleDevelopmentApiEnvironment
dev:auth:data-plane               dev-auth-data-plane-cli.ts     bootstrapDevelopmentAuthDataPlane
dev:auth:seed-register            dev-deployment-register-cli.ts seedDevelopmentDeploymentRegister
dev:auth:api                      dev-api-process-cli.ts         startDevelopmentApiProcess
dev:auth:ui                       dev-ui-process-cli.ts           startDevelopmentUiProcess
```

For `dev-deployment-register-cli.ts`, supply a syntactically valid `MIGRATION_DATABASE_URL` and mock `createPool().end()` so no database connection occurs. For each caller and every raw entry in `cadenceCases`—including absent, empty, malformed, zero, negative, fractional, below-default valid, default, non-default valid, maximum-safe, and overflow—set or delete the environment value through `withObsFlushDeadline`, dynamically import the entrypoint, assert the real loader wrapper ran once, and assert the downstream sentinel ran once. Reset modules, mocks, `process.exitCode`, console spies, and environment after each import. The v5 field fails before the fallback-input sentinels; the passive field reaches every sentinel without an external process, network call, or filesystem mutation.

For RED-07-11, feed the same initial matrix through real `readObsBounds`, convert its `flushDeadlineMs` to a decimal string, export that string before invoking the real loader, and require this exact gate:

```ts
function requireExactCadenceEcho(expected: string, actual: string | undefined): void {
  if (actual !== expected) throw new TypeError("FIX07_CADENCE_ECHO_MISMATCH");
}
```

Expected canonical strings are `5000,5000,5000,5000,5000,5000,250,5000,7250,9007199254740991,5000` in matrix order. Use captured operations around real `startDevelopmentApiProcess` and `startDevelopmentRunnerProcess`. Assert the command object, API child object, runner child object, direct scheduler environment, each child `readObsBounds`, and the query-bind echo equal the same canonical string. Assert the API credential fixture has no cadence key. At age 6000 prove `5000 -> OFF` and `7250 -> QUIET`, then require the echo gate to reject omitted, empty, malformed, zero, fractional, unsafe, and valid-but-different `5000` forwarding when expected is `7250`, before any child start or period result is accepted.

Table-test control directory inputs: missing, empty, relative, and NUL return undefined; `/tmp/fix07-control` returns unchanged; `OBS_SPOOL_DIR` never affects it. Test absent marker ON, existing file/directory/symlink OFF, `ENOENT` ON, every other error OFF, and undefined marker ON. Retain RED.

```bash
out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

- [ ] **Step 2.2: Add the transport-only launch field**

Inside only the existing `loadDevelopmentCommandEnvironment()` shape add this exact property:

```ts
OBS_FLUSH_DEADLINE_MS: z.string().optional(),
```

Do not add a regex, refinement, coercion, transform, parser, default, edit to another register function/export, cadence credential key, or child-launcher change. Add a source assertion in `fix07-off-switch.test.ts` that the `loadDevelopmentCommandEnvironment` body contains this exact property once and contains no other `OBS_FLUSH_DEADLINE_MS` token. Removing/replacing it retains RED-07-11; adding v5's numeric validator retains RED-07-12.

- [ ] **Step 2.3: Implement the closed configuration and marker probe**

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

- [ ] **Step 2.4: Add exactly five health vocabulary entries**

In `health.ts`, add only DISABLED to the health object and zero snapshot, and POSTGRES_FAILURE, GAP_WRITE_FAILURE, DISABLED to the gap object. Do not edit gap-counter algorithms.

- [ ] **Step 2.5: Run the launch/control cluster**

Run:

```bash
out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts tests/unit/fix01-runtime-shape.test.ts tests/integration/dev-api-process.test.ts tests/unit/dev-runner-process.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +5 passed \(5\)$'
```

- [ ] **Step 2.6: Commit C2**

```bash
git add packages/obs-capture/src/runtime/control.ts packages/obs-capture/src/runtime/config.ts packages/obs-capture/src/health.ts packages/register/src/runtime-environment.ts tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git commit -m "feat(obs): FIX-07 C2 — transport launch cadence and bind OFF control"
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
after fixture ages observed_at just beyond readObsBounds().flushDeadlineMs -> query is OFF
```

Assert the health-write port accepts no `observedAt` and no `STOPPED` state. Hold one writer transaction's conflict lock while the other writes and assert database time advances in serialization order.

- [ ] **Step 3.2: Write RED-07-10 for the pre-install marker**

Create `CAPTURE_OFF` before `startCaptureRuntime` and hold the first mocked `lstat` promise. Assert `installCaptureEmitter` has not run, installed readiness remains pending, no sink or health call occurs, and no timer is registered. Settle the sample as OFF, await installed readiness, call both emitter methods before advancing any timer, and assert zero delegation/occurrence plus exact pending `first_party|DISABLED|2`; phase ARMING writes no heartbeat. Settle default-gap transfer and assert the sole timer is then registered before the startup sink.

In a second case, stop while the initial `lstat` is pending. Assert stop returns within its deadline with zero timers and no runtime-emitter install. Settle the old read and await the start promise; assert it performs no late install, readiness settles stopped, and no timer appears. Make the initial probe reject and assert the successful installation starts with an OFF gate.

- [ ] **Step 3.3: Retain RED-07-05 for held startup and armed sinks**

Use fake timers with `flushDeadlineMs=25`. In the first case, let the default-gap transfer settle, hold the startup occurrence/gap sink unresolved while phase remains ARMING, create `CAPTURE_OFF`, advance at least 51 ms, and call both public emitter methods before releasing the sink. In the second case, arm ON and hold a later timer cycle's occurrence sink. Repeat the marker/clock/emitter actions. In both cases assert the calls were not delegated, both counted DISABLED, queued post-drain entries were counted once, marker reads never overlap, each attempt calls `lstat` once, and `setInterval` was registered exactly once.

Remove the marker, settle the next control attempt, release the sink, and assert the next emit persists. Retain RED against the v2 sampling shape.

- [ ] **Step 3.4: Write RED-07-06 for exact failure rows**

Force one failed occurrence-batch write followed by successful spool/recovery. Assert eventual `unclassified|POSTGRES_FAILURE|1` even though the envelope was spooled. Force one capture-gap write failure followed by recovery. Assert the original row is eventually present and `unclassified|GAP_WRITE_FAILURE|1` is a distinct row. Fail the GAP_WRITE_FAILURE row once more and assert its eventual total is `2`, not an unbounded recursive call.

- [ ] **Step 3.5: Add the internal sink port and exact upsert**

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

Return the extension from `createPostgresCaptureSink` and execute SPEC-v6 §2.6's exact SQL with three parameters. Do not add `observedAt`, STOPPED, `RETURNING`, a table-column expression, or another pool.

- [ ] **Step 3.6: Wire the observer without editing the flusher**

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

- [ ] **Step 3.7: Add the gate, pre-install sample, and separately guarded attempts**

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

After assigning `runtimeState = state`, execute this sequence before emitter installation:

```ts
await beginControlSample(state);
if (
  runtimeState !== state
  || activeGeneration !== generation
  || state.phase === "STOPPED"
) return;
const transfer = installCaptureEmitter(state.emitter, state.gaps);
settleGeneration(generation, "installed");
```

`beginControlSample` converts an injected probe rejection to OFF. Do not install or settle installed readiness before it resolves. Inside the startup promise, await `transfer`, verify that the generation is current and not stopped, start the existing interval, and only then enter the startup sink. Because the async startup promise is assigned to `flushInFlight` before it resumes after the transfer await, ARMING timer ticks sample control but cannot start another sink cycle. In the interval callback, call `beginControlSample` before checking phase and `flushInFlight`. When phase is ARMED and no flush exists, the new flush awaits that same control promise before sink work. Do not register another timer.

- [ ] **Step 3.8: Derive current state and omit STOPPED health writes**

For a completed ARMED cycle, derive immediately before upsert:

```text
captureOff -> OFF
drainInFlight -> DRAINING
result.spooled > 0 -> SPOOL_ONLY
else -> ARMED
```

At stop, clear the interval, mark the generation stopped, ignore late control settlement, retain the existing bounded final drain/flush, and skip component health. A process that never reaches ARMED writes zero health rows.

- [ ] **Step 3.9: Run the concurrency/control cluster three times**

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +3 passed \(3\)$' || exit 1; done
```

Temporarily move `beginControlSample` below the `flushInFlight` guard and retain RED-07-05, then restore. Temporarily remove the pre-install await and retain RED-07-10, then restore. Temporarily write STOPPED on B stop and retain RED-07-04, then restore.

- [ ] **Step 3.10: Commit C3**

```bash
git add packages/obs-capture/src/runtime/index.ts packages/obs-capture/src/runtime/sink.ts tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git commit -m "feat(obs): FIX-07 C3 — sample OFF independently and publish shared lease"
```

### Task 4: Prove ACTIVE versus QUIET and product invariance

**Files:**

- Extend: `tests/integration/fix07-off-switch.test.ts`

**Interfaces:**

- Consumes: SPEC-v6 §§2.7–2.8 exact query/launch chain and Tasks 1–3 runtime.
- Produces: exhaustive period and product-byte evidence.

- [ ] **Step 4.1: Write RED-07-09 for the actual-cadence boundary**

Read the effective value through the landed `readObsBounds().flushDeadlineMs`. Execute SPEC-v6 §2.7 with its `:'flush_interval_ms'` token replaced only by the `pg` bind `$1`; pass that effective value. Capture the query bind and run `requireExactCadenceEcho` before accepting rows. Use `transaction_timestamp()` in one owner transaction to seed and query each exact age:

```text
OBS_FLUSH_DEADLINE_MS absent -> effective 5000
age 4999 ms -> live
age 5000 ms -> live
age 5001 ms -> OFF
age 30000 ms -> OFF
OBS_FLUSH_DEADLINE_MS=7250 -> effective 7250
age 7249 ms -> live
age 7250 ms -> live
age 7251 ms -> OFF
OBS_FLUSH_DEADLINE_MS=9007199254740991 -> effective maximum safe integer
age 30000 ms -> live without timestamp-range underflow
```

Run the two-replica case with one coherent `7250` value. Stop both after the last heartbeat, seed age `7250.001`, and assert OFF. At age `6000`, prove `5000 -> OFF` and `7250 -> QUIET`; then prove the preflight rejects child/query omission and mismatch before accepting either result. Pass `0`, `-1`, a fraction, an unsafe integer, and a missing psql variable to the query harness and assert error or other-than-three-row output, never QUIET evidence. Retain the elapsed-age comparison; a computed timestamp cutoff is forbidden because an allowed maximum-safe-integer interval can underflow PostgreSQL's timestamp range.

- [ ] **Step 4.2: Retain RED-07-07 with the exact occurrence-aware query**

Execute SPEC-v6 §2.7 against this matrix while binding the effective interval:

```text
missing health -> OFF
health older than bound interval -> OFF
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

- [ ] **Step 4.3: Write RED-07-08 for product bytes and control failures**

Spawn the same scheduler failure input in isolated children: installed ON, installed OFF, and installer absent. Capture status, stdout, and stderr before querying observability. Assert the three product triples are byte-identical; OFF adds no post-cutover occurrence and adds exact DISABLED count. Make marker polling fail closed and health upsert reject; neither rejection may enter product output or status.

- [ ] **Step 4.4: Run focused and standing verification**

Run the FIX-07 suite three times as in Step 3.9. Then:

```bash
out=$(pnpm exec vitest run tests/unit/fix01-*.test.ts tests/integration/fix01-*.test.ts tests/architecture/fix01-*.test.ts tests/integration/obs-l1-s01-foundation.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
out=$(pnpm exec vitest run tests/architecture/dev-local-auth-topology-spec.test.ts tests/architecture/p3-production-database-principals.test.ts tests/architecture/s12-contract.test.ts tests/architecture/s6-content-encryption-contract.test.ts tests/architecture/s9-dev-token-retirement-contract.test.ts tests/integration/dev-api-environment.test.ts tests/integration/dev-api-process.test.ts tests/unit/dev-runner-process.test.ts tests/unit/crypto.test.ts tests/unit/identity-crypto.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
out=$(pnpm exec vitest run tests/architecture/dev-local-auth-topology-spec.test.ts tests/architecture/p3-production-database-principals.test.ts tests/architecture/s10-carrier-erasure-red.test.ts tests/architecture/s12-contract.test.ts tests/architecture/s6-content-encryption-contract.test.ts tests/architecture/s8-publication-contract.test.ts tests/architecture/s9-dev-token-retirement-contract.test.ts tests/integration/dev-api-environment.test.ts tests/integration/dev-api-process.test.ts tests/unit/dev-runner-process.test.ts tests/unit/crypto.test.ts tests/unit/identity-crypto.test.ts tests/unit/s6-content-encryption.test.ts 2>&1); standing_rc=$?; printf '%s\n' "$out"
out=$(pnpm typecheck 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
out=$(pnpm audit:source 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
```

The ten-file cadence-sensitive subset, FIX-01/S01 suites, typecheck, and audit must exit 0. The focused FIX-07 run includes both RED-07-11 and RED-07-12, including all seven isolated CLI entrypoints. For the thirteen-file standing suite, compare normalized failing identifiers and totals with Step 0.4: final failures must be a subset of the base failures and the count cannot increase; the exit-code guard alone is insufficient. Record exact passed/failed totals and identifiers. No standing test may be edited.

- [ ] **Step 4.5: Run final authority checks**

Assert the Task 0 hashes are unchanged except the register preimage. Assert the changed production/test/migration paths equal the ten-path ledger. Assert the register diff from `FIX07_BASE` adds exactly the one passive SPEC-v6 §2.8 property and no other line. Assert that property has no regex, refinement, coercion, transform, or default. Assert `health.ts` has exactly five semantic additions. Assert `runtime/index.ts` contains one `setInterval` call and no synchronous filesystem API. Assert no changed production file imports `@debateai/db`, zone, registry, model/provider, CLI, or `child_process`.

Repeat the all-ref/all-worktree 0063 audit. Assert the period-query health branch contains the bound effective interval and has no fixed one-minute health cutoff; one minute may occur only as `period_cutoff`. STOP if a collision appeared.

```bash
git diff --check
git status --short
git diff --name-only "$FIX07_BASE"..HEAD
test "$(git diff --unified=0 "$FIX07_BASE"..HEAD -- packages/register/src/runtime-environment.ts | grep -E '^\+[^+]' | wc -l | tr -d ' ')" = 1
git diff --unified=0 "$FIX07_BASE"..HEAD -- packages/register/src/runtime-environment.ts | grep -F '+    OBS_FLUSH_DEADLINE_MS: z.string().optional(),'
test "$(rg -n 'OBS_FLUSH_DEADLINE_MS' packages/register/src/runtime-environment.ts | wc -l | tr -d ' ')" = 1
rg -n "@debateai/db|src/zone|src/registry|child_process|setInterval" packages/obs-capture/src/runtime packages/obs-capture/src/health.ts
```

- [ ] **Step 4.6: Commit C4 and hand off without V claims**

```bash
git add tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git commit -m "test(obs): FIX-07 C4 — prove active quiet off blind and product invariance"
```

Handoff includes four implementation SHAs, `FIX07_BASE`, final HEAD, FIX-01 base, final migration/ref/worktree counts, writer privilege vector and both 42501 probes, child-environment matrix, focused worst-run summary, standing/typecheck/audit summaries, forbidden hashes, effective `flushDeadlineMs`, exact parameterized query, and the statement: `V production marker, query, veto, and acceptance remain unperformed.`

## Transaction and ordering semantics

- Each health upsert is one PostgreSQL autocommit statement; it is not in a product transaction.
- The component primary key serializes concurrent upserts. `clock_timestamp()` in the conflict update is evaluated after conflict-lock acquisition; no client event time is accepted.
- A process stop performs no health statement. Shared lease expiry, not last-stop commit order, represents all replicas stopped.
- Marker gate assignment and queue drain are synchronous in one JavaScript turn. Sink work already holding a drained batch is pre-cutover; no later batch is handed off while OFF.
- `controlInFlight` and `flushInFlight` are independent guards. The first has one `lstat`; the second remains the sole serializer for gap, occurrence, and health sinks. The single interval begins after default-gap transfer and before startup sink, samples in ARMING, and starts sink cycles only in ARMED.
- Failure gap counts are process-local until an existing gap flush succeeds. A failed gap write requeues the original before recording its separate GAP_WRITE_FAILURE event.
- The initial control attempt settles fail closed before emitter installation/readiness. The sole timer begins only after transfer and never appears when stop wins during that initial read.
- Health freshness is elapsed age `<= effective flush interval`; equality is live and the first older instant is OFF. The separate one-minute cutoff applies only to gap/occurrence evidence.
- Landed `readObsBounds` is the sole numeric canonicalizer. The passive command loader transports raw strings unchanged for ordinary callers, so invalid raw values retain landed fallback behavior. In acceptance, the parent exports the canonical decimal before child assembly; existing pure environment spreads carry it to API/runner, scheduler/psql inherit the same snapshot, and exact command/child/query echoes reject omission or mismatch before interpretation.
- Period precedence is `OFF`, then `BLIND`, then `ACTIVE`, then `QUIET`. Query failure, invalid cadence, or cadence mismatch is no proof, never QUIET.

## Stop conditions

Apply every SPEC-v6 §6 condition. In particular, stop before editing if the base, exact grant, marker path, ten-path ledger, one-timer design, shared marker/cadence invariants, passive single-property lease, or 0063 allocation differs. Stop on any need for loader numeric policy, another register edit, child-launcher/credential/package edit, STOPPED write, client heartbeat time, per-instance/cadence schema, broader grants, another timer, overlapping marker reads, pre-sample emitter installation, capture-core edit, standing-test edit, new dependency, or V-only production act.
