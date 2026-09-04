# FIX-07 Heartbeat and Capture-OFF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every armed capture runtime publish one bounded health projection per flush cycle and honor `${OBS_CONTROL_DIR}/CAPTURE_OFF` while counting every suppressed emit.

**Architecture:** Extend FIX-01's existing serialized runtime loop. A runtime-local emitter gate consumes one marker sample per cycle, the existing gap counter owns `DISABLED` counts, and the dedicated `pg` sink performs one primary-key upsert. Migration 0063 grants only the columns PostgreSQL proved necessary for that upsert.

**Tech Stack:** TypeScript 7, Node.js 22 filesystem APIs, `pg` 8, PostgreSQL 18, Vitest 4, embedded-postgres.

**Spec:** `docs/missions/observability-agents/slices/FIX-07/SPEC-v2.md`

## Global constraints

- Start from FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` or a descendant with the SPEC-v2 entry interfaces unchanged.
- Write only the nine paths in SPEC-v2 §4. All installers, product source, zone, registry, `@debateai/db`, package manifests, lockfiles, standing tests, and Hermes are outside the write set.
- `packages/obs-capture/src/health.ts` may change only to add `DISABLED` to `CAPTURE_HEALTH_CODES`, `zeroHealthCounts()`, and `CAPTURE_GAP_CLASSES`.
- `packages/obs-capture/src/{emit,flusher,queue,spool}.ts` stay byte-identical.
- Preserve `CaptureRuntimeStartOptions`, `ObsBounds`, `CaptureDatabaseSink`, the emitter-install overloads, and FIX-01's one-`flushInFlight` exclusion.
- Preserve FIX-01's installer-owned Tier-0 pre-arm sink. The OFF gate starts only when the runtime emitter is installed; the scheduler drill uses FIX-01's readiness barrier.
- The exact switch path is `${OBS_CONTROL_DIR}/CAPTURE_OFF`. Do not derive it from `OBS_SPOOL_DIR`.
- Use migration `0063_fix07_writer_health_upsert.sql` only after the repeated collision scan. Do not edit migration 0034 or choose another number without successor authority.
- COMMON §4's vocabulary ban applies to authored steps and criteria.
- No worker or reviewer may mark V's production acceptance complete.

## Exact file ledger

| Path | Act | Task |
|---|---|---|
| `migrations/0063_fix07_writer_health_upsert.sql` | create | 1 |
| `packages/obs-capture/src/runtime/control.ts` | create | 2 |
| `packages/obs-capture/src/runtime/config.ts` | edit control-dir reader only | 2 |
| `packages/obs-capture/src/health.ts` | edit three DISABLED entries only | 2 |
| `packages/obs-capture/src/runtime/sink.ts` | edit health-write port and SQL only | 3 |
| `packages/obs-capture/src/runtime/index.ts` | edit control gate and serialized cycle only | 3 |
| `tests/unit/fix07-gap-classes.test.ts` | create | 2 |
| `tests/integration/fix07-heartbeat.test.ts` | create | 1, 3 |
| `tests/integration/fix07-off-switch.test.ts` | create | 2–4 |

No other path is a FIX-07 write target.

## Requirement trace

| Requirement | Tasks | Executable evidence |
|---|---|---|
| FIX-07-R01 | 1, 3 | writer upsert/grant vector; one advancing projection per armed cycle |
| FIX-07-R02 | 2, 3 | closed gap vocabulary and exact terminal-loss counts, including DISABLED |
| FIX-07-R03 | 2–4 | marker truth table, cycle gate, zero OFF occurrences, counted suppression |
| FIX-07-R04 | 4 | exact SQL for QUIET/OFF/BLIND fixtures |
| FIX-07-R05 | 3 | single statement per serialized cycle; zero pre-arm row |
| FIX-07-R06 | 4 | byte/status identity across installed ON, installed OFF, and uninstalled |
| FIX-07-R07 | 4 handoff | worker milestone reported; V production acceptance explicitly pending |

## RED matrix

| ID | Pre-change RED | GREEN proof | Mutant/refusal proof |
|---|---|---|---|
| RED-07-01 | writer health INSERT/upsert returns `42501` | real writer connection inserts then updates one component row | remove `SELECT(component)` or any update column → `42501`; table-level I/S/U remain false |
| RED-07-02 | `DISABLED` is absent from health and gap vocabularies | counter aggregates 1 + 7 to one `DISABLED|8` row | remove the health zero-count member → typecheck/test failure |
| RED-07-03 | no runtime config reads `OBS_CONTROL_DIR` | exact absolute-path and missing/relative/NUL cases | replace the path with an `OBS_SPOOL_DIR` derivative → source assertion failure |
| RED-07-04 | current emitter always queues while armed | OFF direct calls and cutover-queued calls produce exact loss count and zero occurrence writes | delegate one OFF call or count one item twice → count/sink assertion failure |
| RED-07-05 | no flush-cycle heartbeat exists | one PK row advances once per armed cycle and ends STOPPED/OFF | heartbeat during ARMING or two writes in one cycle → call/timestamp assertion failure |
| RED-07-06 | old query compares provenance source to runtime | exact query returns QUIET, OFF, BLIND in seeded phases | remove the missing-heartbeat or STOPPED branch → expected label failure |
| RED-07-07 | product comparison lacks OFF mode | installed ON/OFF and uninstalled child runs have identical exit/status bytes | throw a marker/read/sink error into the product path → byte/status failure |

## Task 0: Revalidate dispatch authority

**Files:** none.

- [ ] Confirm the implementation branch contains FIX-01 `24d0b3e5`. Record `git status --short`, HEAD, and the hashes of `runtime/{config,index,sink}.ts`, `health.ts`, `emit.ts`, `flusher.ts`, `queue.ts`, and `spool.ts` before editing.
- [ ] Confirm the public start options still contain exactly `runtime`, `spoolFd`, and `installExitSink`; `ObsBounds` still has its five FIX-01 fields; the active runtime still owns one `flushInFlight` promise; and the PostgreSQL sink still imports `pg` directly.
- [ ] Enumerate every local/remote ref and registered worktree. Search their tracked and untracked migration files plus mission plans and decisions for `0050` through `0063`.
- [ ] Confirm the ledger is Support `0050`–`0055`, Security `0056`, Observation `0057`–`0060`, FIX-01 `0061`, FIX-09 `0062`, and this packet alone for `0063`. Record ref count, worktree count, paths, and paper matches. If another 0063 claim exists, STOP before RED-07-01.
- [ ] Read migration 0034's exact `component_health` table and role blocks. Against the test database before 0063, connect as the actual writer role and retain `42501` for the exact upsert plus the all-false component-health privilege baseline.

## Task 1: Grant only the health-upsert columns

**Files:** create `migrations/0063_fix07_writer_health_upsert.sql`; create the migration/grant section of `tests/integration/fix07-heartbeat.test.ts`.

### Step 1.1 — Write RED-07-01

- [ ] Start the repository's embedded PostgreSQL fixture, apply the pre-0063 chain, assign the fixture password to `debateai_obs_writer`, and open a separate `pg.Pool` authenticated as that role.
- [ ] Assert the baseline has no table- or column-level privilege on `obs.component_health` and the parameterized upsert returns SQLSTATE `42501`.
- [ ] Add a migration-contract assertion that exactly one 0063 file exists and its parsed SQL contains three grants and no `CREATE`, `ALTER`, `DROP`, `REVOKE`, role creation, function, trigger, or schema statement.
- [ ] Run the focused test and retain the failure summary.

```bash
out=$(pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

### Step 1.2 — Create migration 0063

- [ ] Write exactly:

```sql
GRANT INSERT (component, state, observed_at, detail_code)
  ON obs.component_health TO debateai_obs_writer;
GRANT SELECT (component)
  ON obs.component_health TO debateai_obs_writer;
GRANT UPDATE (state, observed_at, detail_code, updated_at)
  ON obs.component_health TO debateai_obs_writer;
```

- [ ] Apply the full branch migration chain. Through the writer connection, execute this statement twice for one component with different state/time/detail parameters:

```sql
INSERT INTO obs.component_health (component, state, observed_at, detail_code)
VALUES ($1, $2, $3, $4)
ON CONFLICT (component) DO UPDATE SET
  state = $2,
  observed_at = $3,
  detail_code = $4,
  updated_at = statement_timestamp()
```

- [ ] Through the fixture owner connection, assert one row remains and carries the second state/time/detail. Through catalog functions, assert table-level INSERT/SELECT/UPDATE are false; component INSERT/SELECT are true and component UPDATE is false; mutable-field SELECT is false and UPDATE is true; updated-at INSERT is false and UPDATE is true; DELETE/TRUNCATE are false.
- [ ] Run the test. Temporarily remove `SELECT(component)` and retain the `42501` failure, then restore the migration.

```bash
out=$(pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +1 passed \(1\)$'
```

### Step 1.3 — Commit the grant slice

- [ ] Run `git diff --check` and inspect the staged path list. Commit only the migration and heartbeat test.

```bash
git commit -m "feat(obs): FIX-07 C1 — grant bounded heartbeat upsert"
```

## Task 2: Freeze the marker and DISABLED vocabulary

**Files:** create `packages/obs-capture/src/runtime/control.ts` and `tests/unit/fix07-gap-classes.test.ts`; edit `packages/obs-capture/src/runtime/config.ts` and the three authorized entries in `packages/obs-capture/src/health.ts`; create the marker/config section of `tests/integration/fix07-off-switch.test.ts`.

### Step 2.1 — Write RED-07-02 and RED-07-03

- [ ] Assert `CAPTURE_HEALTH_CODES.DISABLED` and `CAPTURE_GAP_CLASSES.DISABLED` equal the literal `DISABLED`; a fresh health snapshot contains `DISABLED: 0`; observing/recording it increments once; and gap counts `1` plus `7` flush as one `first_party|DISABLED|8` row.
- [ ] Table-test `readObsControlDir`: missing, empty, relative, and NUL-containing values return `undefined`; `/tmp/fix07-control` returns that exact string. Assert changing `OBS_SPOOL_DIR` never changes this result.
- [ ] Table-test `captureOffMarkerPath`: valid control dir returns `/tmp/fix07-control/CAPTURE_OFF`; undefined returns undefined.
- [ ] In a temporary directory, assert absent marker is ON, `touch CAPTURE_OFF` is OFF, and removal returns ON. Mock `lstat` for `EACCES` and an unknown error and assert OFF. Assert undefined marker path is ON.
- [ ] Read installer source bytes and assert none contains `OBS_CONTROL_DIR` or a fourth start option. Read control/runtime source and assert the literal `CAPTURE_OFF` occurs only in the control module and tests, never as a spool-relative derivation.
- [ ] Run both focused files and retain failures.

```bash
out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

### Step 2.2 — Implement the closed configuration

- [ ] Add this signature to `runtime/config.ts` without adding a field to `ObsBounds`:

```ts
export function readObsControlDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined;
```

- [ ] Return the unchanged value only when it is non-empty, contains no NUL, and `node:path.isAbsolute(value)` is true. Otherwise return undefined.
- [ ] In `runtime/control.ts`, join only `CAPTURE_OFF`; return ON for undefined or `ENOENT`, OFF for an existing entry or every other error. Use `lstat`, not `stat`, so a marker symlink counts as presence without following it.
- [ ] Add `DISABLED` only to the two frozen objects and the zero-count record in `health.ts`. Do not rename, remove, or reorder another member.
- [ ] Run the two focused tests and `tests/unit/fix01-runtime-shape.test.ts`. Confirm its exact `ObsBounds` and installer-option assertions remain green.

```bash
out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-off-switch.test.ts tests/unit/fix01-runtime-shape.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +3 passed \(3\)$'
```

### Step 2.3 — Commit the control vocabulary

- [ ] Inspect `git diff -- packages/obs-capture/src/health.ts` and fail unless every added semantic token is `DISABLED`. Commit only the four source/test paths from Task 2.

```bash
git commit -m "feat(obs): FIX-07 C2 — bind capture OFF marker and gap class"
```

## Task 3: Gate the emitter and heartbeat each serialized cycle

**Files:** edit `packages/obs-capture/src/runtime/index.ts` and `packages/obs-capture/src/runtime/sink.ts`; extend `tests/integration/fix07-heartbeat.test.ts` and `tests/integration/fix07-off-switch.test.ts`.

### Step 3.1 — Write RED-07-04 and RED-07-05

- [ ] With an embedded writer database, absolute control directory, and 25 ms flush deadline, start `scheduler`. Poll through five completed armed cycles and retain five strictly advancing `observed_at` values while asserting the table always contains exactly one `capture:scheduler` row.
- [ ] Assert each clean live sample is `ARMED|FLUSH_OK`; an active spool drain yields `DRAINING`; a cycle whose existing flusher returns `spooled > 0` yields `SPOOL_ONLY`; stop yields one final `STOPPED` update. A child that exits before arming yields no health row.
- [ ] Start ON, queue seven entries, create the marker before the next cycle, and emit three more calls after the sampled gate becomes OFF. Assert no occurrence sink call for all ten, the sum of one or more `first_party|DISABLED` rows is exactly 10, and the health row is `OFF|DISABLED`. Remove the marker; assert the next emit persists and the health row returns to ARMED.
- [ ] Keep PostgreSQL unreachable while toggling the marker and assert emitter suppression/counting still follows the marker. Restore PostgreSQL and assert the retained count writes once and the health row first exposes the pending `POSTGRES_FAILURE` before a later clean `FLUSH_OK`.
- [ ] Instrument concurrent timer/stop callbacks. Assert observed health/occurrence work in flight never exceeds one and stop waits before its final update.
- [ ] Run both integration files and retain failures.

```bash
out=$(pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -ne 0
```

### Step 3.2 — Add the internal health sink

- [ ] Keep `CaptureDatabaseSink` unchanged. Add a narrower runtime-only extension in `runtime/sink.ts`:

```ts
export type CaptureComponentState =
  | "ARMED" | "SPOOL_ONLY" | "DRAINING" | "OFF" | "STOPPED";

export interface CaptureComponentHealthWrite {
  readonly component: `capture:${string}`;
  readonly state: CaptureComponentState;
  readonly observedAt: Date;
  readonly detailCode: CaptureHealthCode;
}

export interface CaptureRuntimeDatabaseSink extends PostgresCaptureSink {
  writeComponentHealth(row: CaptureComponentHealthWrite): Promise<void>;
}
```

- [ ] Change only `createPostgresCaptureSink`'s return type to the extension and add `writeComponentHealth`. Use the exact SPEC-v2 §2.4 SQL and four parameters. Do not use `RETURNING`, `EXCLUDED`, a current table value, a condition, or a second pool.

### Step 3.3 — Add the shared gate and cycle

- [ ] In `createStartingState`, retain the concrete bounded queue in state. Create one mutable control box and one health-status box. Build the existing emitter, then a frozen wrapper whose two methods either delegate once or observe/count one `DISABLED`. Install the wrapper, not the underlying emitter.
- [ ] Pass an observer to `createCaptureHealth` that stores the last code. Preserve an unreported heartbeat-write `POSTGRES_FAILURE` until one later upsert succeeds.
- [ ] Before `installCaptureEmitter`, await one `readCaptureOff` sample. This changes no installer argument and performs no heartbeat while phase is ARMING.
- [ ] Refactor `flushRuntimeOnce` to follow SPEC-v2 §2.3. Set the gate immediately after the sample. When OFF, drain once and add the exact length; never call `flusher.flushOnce`. When ON, retain the existing gap preflush and flusher behavior and capture its `FlushResult`.
- [ ] Derive state with the exact precedence. If phase is ARMING, return after existing startup work without a health write. Otherwise capture one `Date`, call `writeComponentHealth` once, and swallow only that observability failure after recording `POSTGRES_FAILURE`.
- [ ] Leave timer guards, `flushInFlight`, drain ownership, and stop waiting intact. The final stop cycle uses the same function and writes OFF over STOPPED only when the sampled marker is OFF.
- [ ] Run the two integration files three times. During one run, temporarily delegate an OFF call and see the zero-occurrence assertion fail; restore. During another, remove the in-flight guard and see the max-in-flight assertion fail; restore.

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +2 passed \(2\)$' || exit 1; done
```

### Step 3.4 — Commit the runtime cycle

- [ ] Confirm `git diff --name-only` for this task contains only both integration tests plus `runtime/index.ts` and `runtime/sink.ts`. Commit them.

```bash
git commit -m "feat(obs): FIX-07 C3 — gate capture and publish flush health"
```

## Task 4: Prove the period query and product invariance

**Files:** extend `tests/integration/fix07-off-switch.test.ts` only.

### Step 4.1 — Write RED-07-06 and RED-07-07

- [ ] Execute SPEC-v2 §2.5's exact SQL against seeded phases: fresh ARMED/no gap → QUIET; fresh OFF → OFF; fresh STOPPED → OFF; missing row → OFF; row older than one minute → OFF; fresh SPOOL_ONLY → BLIND; fresh failure detail → BLIND; recent closed gap → BLIND; open gap → BLIND. Assert exactly `api`, `runner`, `scheduler` in lexical order and no fourth label.
- [ ] Assert a gap with provenance `first_party` makes otherwise-live runtime rows BLIND without inserting a false runtime name into `capture_gap.source`.
- [ ] Spawn the FIX-01 scheduler failure drill with identical input in three isolated children: runtime installed and marker absent; runtime installed and marker present; capture installer absent. Capture stdout, stderr, and exit status before inspecting observability rows. Assert all three product triples are byte-identical, OFF adds no occurrence, and OFF adds one DISABLED count.
- [ ] Make marker polling reject and health upsert reject in injected cases. Assert neither rejection appears in product stdout/stderr or changes status.
- [ ] Run the integration test and retain failures before its final assertions are implemented.

### Step 4.2 — Complete and repeat the focused suite

- [ ] Implement only test fixtures and assertions in the existing FIX-07 test. Do not add a product helper or edit `tests/support/**`.
- [ ] Run all three FIX-07 files three times. The worst run is the worker verdict.

```bash
for run in 1 2 3; do out=$(pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts 2>&1); rc=$?; printf 'run=%s rc=%s\n%s\n' "$run" "$rc" "$out"; test "$rc" -eq 0; printf '%s\n' "$out" | grep -E '^ Test Files +3 passed \(3\)$' || exit 1; done
```

### Step 4.3 — Run standing and authority checks

- [ ] Run every current FIX-01 test, the standing S01 foundation test, and typecheck. Capture each exit code and pass summary.

```bash
out=$(pnpm exec vitest run tests/unit/fix01-*.test.ts tests/integration/fix01-*.test.ts tests/architecture/fix01-*.test.ts tests/integration/obs-l1-s01-foundation.test.ts 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
out=$(pnpm typecheck 2>&1); rc=$?; printf '%s\n' "$out"; test "$rc" -eq 0
```

- [ ] Assert the forbidden source files match their Task 0 hashes. Assert no changed production file imports `@debateai/db`, a zone/registry module, model/provider/CLI code, or `child_process`.
- [ ] Assert the final source/test/migration path set equals the exact ledger, migration 0063 contains only the three grants, and `health.ts` contains only its three `DISABLED` additions.
- [ ] Repeat the migration collision audit and record final ref/worktree counts and every `0063` match. If a competing claim appeared, STOP and return to architecture.

### Step 4.4 — Commit and hand off

- [ ] Run `git diff --check`, inspect `git status --short`, and commit only the final off-switch test change.

```bash
git commit -m "test(obs): FIX-07 C4 — prove quiet off blind and product invariance"
```

- [ ] Handoff includes four implementation SHAs; final HEAD; FIX-01 base; final migration ledger/counts; writer privilege vector and negative probes; three focused summaries; standing/typecheck summaries; forbidden-byte hashes; the exact V query; and an explicit statement that V production acceptance remains unperformed.

## Stop conditions

Apply every SPEC-v2 §6 condition. In particular, stop rather than edit an installer, prior migration, standing test, product source, zone, registry, `@debateai/db`, capture core outside `runtime/**` and the three `DISABLED` entries, or any unlisted path. Stop if the exact upsert needs a wider privilege, if OFF suppression cannot be exact under the existing serialized loop, if the product bytes differ, or if another 0063 claim appears.
