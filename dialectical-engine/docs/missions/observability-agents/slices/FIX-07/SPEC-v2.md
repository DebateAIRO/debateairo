# FIX-07 — Authorized heartbeat and capture-OFF contract

**Successor authority packet — 2026-09-04, architecture seat.** This document supersedes `SPEC.md` for FIX-07 implementation. It carries forward the seven frozen requirements, resolves their persistence and control-path choices against FIX-01 at `24d0b3e5`, and corrects the stale live-plan default. V's broad source-backed correction authority permits this packet; it records no V production run, veto, or acceptance.

**Entry gate:** implement from FIX-01 commit `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` or a descendant with the same `startCaptureRuntime`, `stopCaptureRuntime`, emitter-install, serialized `flushInFlight`, gap-counter, flusher, and PostgreSQL-sink interfaces. FIX-01 must be merged before FIX-07 dispatch because both own `packages/obs-capture/src/runtime/**`.

## 1. Source reconciliation

1. The capture switch is the already-bound filesystem marker `${OBS_CONTROL_DIR}/CAPTURE_OFF`. The live Task 7 fallback `${OBS_SPOOL_DIR}/../.obs-capture-OFF` is invalid and must not be implemented.
2. Migration 0034 defines one mutable projection row per component: `obs.component_health.component` is the primary key. An append-only row per cycle cannot fit that table and no history table is authorized.
3. Migration 0034 grants `debateai_obs_writer` no `component_health` privilege. The 2026-09-04 local role check returned `INSERT=f|UPDATE=f|SELECT=f`. FIX-07 receives one grant-only migration with the minimum columns proven to execute the exact upsert.
4. FIX-01 already reads runtime configuration from `process.env` in `runtime/config.ts`; the three installers pass only `runtime`, `spoolFd`, and `installExitSink`. FIX-07 adds a control-directory reader in runtime configuration and does not change that installer contract.
5. FIX-01 already owns a single awaited flush per process. The control sample, OFF gate, gap flush, occurrence flush, and heartbeat are one serialized runtime cycle; no new timer or product transaction is introduced.
6. `capture_gap.source` is a provenance class, not a runtime name. The old V query's `g.source = r.runtime` comparison cannot report a real gap. The successor query uses a conservative shared recent/open-gap projection and the runtime-specific health row.

Rejected alternatives are a spool-relative marker, a register-row enforcement dependency, edits to installers, a second health table, a new health-history key, table-wide writer privileges, a security-definer upsert function, an `@debateai/db` import, or encoding runtime names into `capture_gap.source`.

## 2. Closed runtime contracts

### 2.1 Control configuration and marker truth

`packages/obs-capture/src/runtime/config.ts` exports:

```ts
export function readObsControlDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined;
```

It reads only `env.OBS_CONTROL_DIR`. A non-empty absolute path is returned unchanged. Missing, empty, relative, or NUL-containing input returns `undefined`. It is independent of `OBS_SPOOL_DIR`; `ObsBounds` and the public `CaptureRuntimeStartOptions` shape stay unchanged.

`packages/obs-capture/src/runtime/control.ts` owns one path and one probe:

```ts
export function captureOffMarkerPath(controlDir: string | undefined): string | undefined;
export async function readCaptureOff(markerPath: string | undefined): Promise<boolean>;
```

The only configured path is `join(controlDir, "CAPTURE_OFF")`. `readCaptureOff` uses `lstat` and follows this closed truth table:

| Input/result | Capture state |
|---|---|
| no valid `controlDir` | ON (legacy unconfigured mode) |
| `lstat` succeeds for any directory entry, including a symlink | OFF |
| `lstat` fails with `ENOENT` | ON |
| any other filesystem error | OFF |

The runtime samples once before installing its active emitter and once at the start of every later flush cycle. It never performs a filesystem call from `emit()` or `captureHandled()`. A marker change is therefore reflected no later than completion of the next serialized flush cycle. An unconfigured process stays ON so FIX-01's existing deployments and standing tests do not silently disable capture; a deployment that exposes the switch must set the same absolute `OBS_CONTROL_DIR` in every runtime and FIX-10. The switch works when PostgreSQL is unavailable. FIX-10 remains the production-facing marker writer; FIX-07 only reads it.

### 2.2 Emitter gate and exact loss count

`runtime/index.ts` installs a runtime-owned `CaptureEmitter` wrapper around FIX-01's existing emitter. The wrapper and the flush loop share one in-memory `captureOff` boolean.

- ON: `emit()` and `captureHandled()` delegate once to the existing emitter.
- OFF: neither method delegates or queues. It records health code `DISABLED` and calls the existing gap counter exactly once with `source='first_party'`, `gap_class='DISABLED'`, and `count=1`.
- ON-to-OFF sampling: after setting the gate OFF, the cycle drains the existing reference queue once without redaction or sink access and adds its exact drained length to the same `DISABLED` counter. Calls arriving after the gate changes are counted by the wrapper, so no item is counted twice.
- OFF-to-ON sampling: the gate changes before the existing flusher runs, so later calls queue normally.

The only edit outside `src/runtime/**` is the `DISABLED` vocabulary addition in `packages/obs-capture/src/health.ts`: add it to `CAPTURE_HEALTH_CODES`, `zeroHealthCounts()`, and `CAPTURE_GAP_CLASSES`. `emit.ts`, `flusher.ts`, `queue.ts`, and `spool.ts` remain byte-identical.

The gate begins when `startCaptureRuntime` installs the runtime emitter. FIX-01's installer-owned Tier-0 fatal sink before arming remains unchanged and is witnessed by its spool contract; it performs no marker read, DISABLED count, or heartbeat. The FIX-01 scheduler readiness barrier used by the failing-job drill ensures that drill reaches the armed runtime. Expanding OFF into the pre-arm installer is not authorized.

The terminal-loss rule remains: an item preserved in the spool is not also a lost-item gap. Existing `QUEUE_FULL`, `EMIT_FAILURE`, `REDACTOR_FAILURE`, and `SPOOL_FAILURE` counting remains unchanged. `POSTGRES_FAILURE` is the health code for a database attempt; when the item is spooled, it is not lost. A failed gap write requeues the same count and records `GAP_WRITE_FAILURE`; the positive authority-proof contract covers process death while that volatile count is pending. FIX-07 adds only deliberate suppression as a new loss class.

### 2.3 One serialized flush cycle

The existing `flushInFlight` promise is the sole per-process exclusion mechanism. A cycle performs these acts in order:

1. sample `${OBS_CONTROL_DIR}/CAPTURE_OFF` and set the shared gate;
2. if OFF, drain and count queued entries and record `DISABLED`; if ON, record `FLUSH_OK` as the cycle baseline;
3. run FIX-01's existing one-aggregate gap preflush;
4. if ON, invoke the existing occurrence flusher and retain its `FlushResult`; if OFF, do not invoke it (the unchanged flusher may perform its existing post-sink gap flushes only in the ON branch);
5. derive the heartbeat state and detail code;
6. execute one atomic, autocommit `component_health` upsert on the dedicated writer pool.

The heartbeat state precedence is exact:

```text
OFF marker/control error -> OFF
runtime phase STOPPED    -> STOPPED
drainInFlight present    -> DRAINING
cycle spooled > 0        -> SPOOL_ONLY
otherwise                -> ARMED
```

`detail_code` is the last code observed by the existing `createCaptureHealth(observer)` callback in that cycle. An ON cycle starts by observing `FLUSH_OK`; a later failure replaces it. An OFF cycle observes `DISABLED`. If the health write fails, the runtime observes `POSTGRES_FAILURE`, does not throw into product code, and leaves the previous row to become stale. The first later successful cycle publishes that pending failure code before returning to `FLUSH_OK` on a subsequent clean cycle.

The pre-install ARMING flush writes no heartbeat. Each timer cycle after ARMED writes once. `stopCaptureRuntime` waits for any in-flight cycle and performs one final serialized cycle; its health row is `OFF` if the marker is OFF and `STOPPED` otherwise. No heartbeat is attempted by a process that exits before runtime arming.

### 2.4 Atomic health upsert

`runtime/sink.ts` adds a runtime-internal health-write method without changing `CaptureDatabaseSink`. The method executes exactly:

```sql
INSERT INTO obs.component_health (component, state, observed_at, detail_code)
VALUES ($1, $2, $3, $4)
ON CONFLICT (component) DO UPDATE SET
  state = $2,
  observed_at = $3,
  detail_code = $4,
  updated_at = statement_timestamp()
```

Parameters are `capture:<runtime>`, the state from §2.3, one `Date` captured for that cycle's heartbeat, and the closed `CaptureHealthCode`. The update clause deliberately uses parameters rather than `EXCLUDED` or current table values. PostgreSQL then needs SELECT only on the conflict key. The statement has no `RETURNING`, predicate, table-column read, explicit transaction, or product-pool participation. The primary key serializes concurrent writers; one row remains per component, with last-committing projection semantics.

### 2.5 Quiet, off, and blind query

The later V run uses this exact query. A missing, stale, explicitly OFF, or STOPPED heartbeat is `OFF`. A fresh `SPOOL_ONLY` row, a fresh failure detail, or any open/recent gap makes every otherwise-live first-party runtime conservatively `BLIND`; `capture_gap` currently has no runtime dimension. Otherwise the runtime is `QUIET`.

```sql
WITH runtimes(runtime) AS (
  VALUES ('api'), ('runner'), ('scheduler')
), gap_window AS (
  SELECT EXISTS (
    SELECT 1
    FROM obs.capture_gap
    WHERE closed_at IS NULL
       OR closed_at >= now() - interval '1 minute'
  ) AS any_gap
)
SELECT r.runtime,
       CASE
         WHEN h.component IS NULL
           OR h.state IN ('OFF', 'STOPPED')
           OR h.observed_at < now() - interval '1 minute' THEN 'OFF'
         WHEN h.state = 'SPOOL_ONLY'
           OR h.detail_code IN (
             'QUEUE_FULL', 'EMIT_FAILURE', 'REDACTOR_FAILURE',
             'POSTGRES_FAILURE', 'SPOOL_FAILURE', 'GAP_WRITE_FAILURE'
           )
           OR g.any_gap THEN 'BLIND'
         ELSE 'QUIET'
       END AS period
FROM runtimes AS r
CROSS JOIN gap_window AS g
LEFT JOIN obs.component_health AS h
  ON h.component = 'capture:' || r.runtime
ORDER BY r.runtime;
```

The query returns exactly three rows and only `OFF`, `BLIND`, or `QUIET`. The shared gap signal is deliberately conservative; schema work to attribute gaps per runtime is outside FIX-07.

## 3. Migration and role authority

The sole migration is `migrations/0063_fix07_writer_health_upsert.sql`. It contains only:

```sql
GRANT INSERT (component, state, observed_at, detail_code)
  ON obs.component_health TO debateai_obs_writer;
GRANT SELECT (component)
  ON obs.component_health TO debateai_obs_writer;
GRANT UPDATE (state, observed_at, detail_code, updated_at)
  ON obs.component_health TO debateai_obs_writer;
```

No table-wide privilege is granted. The writer receives no SELECT on state, observed time, detail, or update time; no UPDATE on component; and no DELETE or TRUNCATE. Migration 0034, its table, triggers, constraints, existing grants, and `packages/db/src/obs-schema.ts` remain unchanged.

All later active migrations were checked for this surface. Observation migrations 0057–0060 add their own schema/views and do not alter `obs.component_health`; FIX-01 migration 0061 changes only the occurrence taxonomy check; FIX-09 migration 0062 changes incident identity and occurrence notification and grants the writer only execution on its publisher function. None supplies or replaces the FIX-07 health privileges.

A 2026-09-04 PostgreSQL 18 embedded-database probe authenticated a separate connection as `debateai_obs_writer` and executed the exact parameterized insert and conflict update. The row changed from `ARMED|FLUSH_OK` to `OFF|DISABLED`; the ephemeral database was then destroyed. The final privilege vector was: table-level `INSERT=f|SELECT=f|UPDATE=f`; `component INSERT=t|SELECT=t|UPDATE=f`; `state SELECT=f|UPDATE=t`; `updated_at INSERT=f|UPDATE=t`. Direct writer SELECT of `state` and UPDATE of `component` both returned SQLSTATE `42501`. A separate rollback-only local probe established that removing `SELECT(component)` also returns `42501`, so it is part of the minimum executable grant; that probe left zero rows.

### 3.1 Exhaustive migration allocation

The final allocation audit searched all 78 local/remote refs, all 72 registered worktrees, their tracked and untracked migration files, the repository filesystem, and mission-plan/document claims.

- `0050`–`0054`: Support paper reservations;
- `0055`: `register_support_publication`;
- `0056`: `security_truncate_definer_searchpath`;
- `0057`–`0060`: Observation foundation, safe views, monitor, and throughput;
- `0061`: FIX-01 job-lifecycle taxonomy;
- `0062`: FIX-09 listener fold and transactional wake;
- `0063`: no prior file or paper claim; allocated by this packet to FIX-07.

Immediately before creating migration 0063, the implementation seat repeats this scan. Any other `0063` file or competing paper allocation is a STOP; the worker returns to architecture and does not self-renumber.

## 4. Exact implementation surface

Create only:

- `migrations/0063_fix07_writer_health_upsert.sql`;
- `packages/obs-capture/src/runtime/control.ts`;
- `tests/integration/fix07-heartbeat.test.ts`;
- `tests/integration/fix07-off-switch.test.ts`;
- `tests/unit/fix07-gap-classes.test.ts`.

Modify only:

- `packages/obs-capture/src/runtime/config.ts` for `readObsControlDir` only;
- `packages/obs-capture/src/runtime/index.ts` for the control gate and serialized heartbeat cycle;
- `packages/obs-capture/src/runtime/sink.ts` for the health-write port and exact SQL;
- `packages/obs-capture/src/health.ts` for the three `DISABLED` vocabulary/count entries only.

Read without editing:

- `packages/obs-capture/src/{emit,flusher,queue,spool}.ts`;
- `packages/obs-capture/install/{api,runner,scheduler}.ts`;
- `packages/db/src/obs-schema.ts`;
- migration 0034 and every later migration;
- all FIX-01 tests and standing Observation foundation tests.

Forbidden: every installer edit; `src/zone/**`; `src/registry/**`; `@debateai/db`; package manifests and lockfiles; product application/scheduler source; Hermes; a model/provider/CLI import; schema/table/trigger changes; test-support edits; and any path not listed above.

## 5. Verification and V boundary

Worker evidence must prove the migration grant vector and negative privileges through a real writer-role connection; insert then conflict-update; one row per component; periodic observed-time advancement; pre-arm zero; final STOPPED/OFF; exact ON/OFF queue and direct-call counts; marker error truth table; database-down switch operation; unchanged occurrence count while OFF; ON recovery; the query's three labels; identical scheduler exit code and stderr bytes in installed-ON, installed-OFF, and uninstalled cases; no forbidden diff/import; FIX-01 focused tests; the standing S01 foundation test; and typecheck. Focused FIX-07 tests run three times; the worst run is the verdict.

V alone later performs the successor acceptance sequence and pastes §2.5's query against the production-facing stack. Green worker tests, this local rollback probe, and a reviewer PASS are milestones only. This packet does not claim that V touched the marker, ran the failing job, queried production, vetoed, or accepted FIX-07.

## 6. Stop conditions

Implementation stops before editing, or at the first newly discovered conflict, if:

- the branch does not contain FIX-01 `24d0b3e5` or its runtime interfaces differ;
- the final audit finds another `0063` migration or paper claim;
- the migrated writer role needs any privilege beyond §3 for the exact SQL;
- migration 0034's `component_health` primary key, columns, triggers, or role baseline differ;
- the switch cannot be derived solely from `OBS_CONTROL_DIR` or requires an installer edit;
- truthful OFF suppression requires editing `emit.ts`, `flusher.ts`, `queue.ts`, `spool.ts`, zone, registry, `@debateai/db`, or product source;
- `health.ts` needs any semantic edit other than the three `DISABLED` entries;
- a test requires runtime names in `capture_gap.source`, health history, a second timer, or a product transaction;
- the three-way product exit/stderr comparison differs;
- any requested act would assert or substitute for V's personal production acceptance.
