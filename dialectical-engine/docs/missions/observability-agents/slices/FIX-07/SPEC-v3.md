# FIX-07 — Replica-safe heartbeat, prompt capture OFF, and truthful period query

**Successor authority packet — 2026-09-04, architecture seat.** This document supersedes `SPEC-v2.md` and `SPEC.md` for FIX-07 implementation. It retains the reviewed migration allocation, writer grants, control path, installer-free configuration seam, and source/test boundary, and replaces only the four contracts found unsound in the first independent review. V's broad source-backed correction authority permits this packet; it records no V marker act, production query, veto, or acceptance.

**Entry gate:** implement from FIX-01 commit `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4` or a descendant with the same `startCaptureRuntime`, `stopCaptureRuntime`, emitter-install, one-timer, serialized `flushInFlight`, gap-counter, flusher, and direct-`pg` sink interfaces. FIX-01 must be merged before FIX-07 dispatch because both own `packages/obs-capture/src/runtime/**`.

## 1. Source reconciliation and amendments

1. The deployment contract supports N runner workers and N API replicas (`docs/missions/2026-08-06-v3-programming/ratification/monolith-vs-microservices-debate.md:150-160,313-321,471-474`). A per-runtime primary-key row therefore cannot be the last process's lifecycle row. This successor treats `capture:<runtime>` as a shared liveness lease: every completed armed cycle may refresh it, but an individual process stop never writes `STOPPED`.
2. FIX-01's timer skips occurrence work while `flushInFlight` is set (`packages/obs-capture/src/runtime/index.ts:256-270`), and its PostgreSQL pool has no query deadline (`packages/obs-capture/src/runtime/sink.ts:110-125`). Marker sampling that is awaited only inside that promise cannot meet FIX-07-R03. This successor launches a separately guarded control sample from the existing timer callback before the `flushInFlight` test. It adds no second timer.
3. Frozen FIX-07-R02 and mission IF-3 require `POSTGRES_FAILURE` and `GAP_WRITE_FAILURE` capture-gap rows (`SPEC.md:13-15`; `requirements/fixagent.md:73-78,201-206`). FIX-01 already emits one health event for each failed occurrence batch and each failed capture-gap write (`packages/obs-capture/src/flusher.ts:41-49,104-121`; `packages/obs-capture/src/health.ts:149-160,199-227`). Runtime wiring converts those events into counted pending gap events without editing the flusher.
4. A query whose only labels are `OFF`, `BLIND`, and `QUIET` cannot truthfully label a fresh, non-blind runtime that has recent occurrences: it is none of the three. This successor narrowly amends FIX-07-R04 and the period vocabulary to add `ACTIVE`. `QUIET` now means exactly fresh live evidence, no blind evidence, and no occurrence in the bounded window.
5. Migration 0034 defines `obs.component_health.component` as the primary key and `observed_at` as required (`migrations/0034_obs_foundation.sql:240-246`), gives the writer no health privilege (`:313-334,369-372`), and provides the occurrence time index plus open-gap partial index (`:248-263`). The reviewed grant-only migration remains the narrowest schema act.

Rejected alternatives are a singleton deployment fiction; a per-instance health key or health-history table; a STOPPED last-writer projection; client-provided heartbeat times; a second timer; a sink timeout/config expansion; a spool-relative marker; a register-row switch; installer edits; edits to `emit.ts`, `flusher.ts`, `queue.ts`, or `spool.ts`; a table-wide grant; a security-definer function; an `@debateai/db` import; encoding runtime names into `capture_gap.source`; or calling a recent-occurrence period `QUIET`.

## 2. Closed runtime contracts

### 2.1 Control configuration and marker truth

`packages/obs-capture/src/runtime/config.ts` exports:

```ts
export function readObsControlDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined;
```

It reads only `env.OBS_CONTROL_DIR`. A non-empty absolute path is returned unchanged. Missing, empty, relative, or NUL-containing input returns `undefined`. It is independent of `OBS_SPOOL_DIR`; `ObsBounds` and `CaptureRuntimeStartOptions` remain unchanged.

`packages/obs-capture/src/runtime/control.ts` owns one path and one probe:

```ts
export function captureOffMarkerPath(
  controlDir: string | undefined,
): string | undefined;
export async function readCaptureOff(
  markerPath: string | undefined,
): Promise<boolean>;
```

The only configured path is `join(controlDir, "CAPTURE_OFF")`. `readCaptureOff` uses `lstat` and follows this closed truth table:

| Input/result | Capture state |
|---|---|
| no valid control directory | ON (legacy unconfigured mode) |
| `lstat` succeeds for any directory entry, including a symlink | OFF |
| `lstat` fails with `ENOENT` | ON |
| any other filesystem error | OFF |

Every replica of a runtime must receive the same absolute `OBS_CONTROL_DIR` and see the same marker namespace as FIX-10. That coherence is the deployment invariant that makes shared `OFF` state truthful. A deployment with divergent per-replica marker namespaces is invalid and must not be accepted.

### 2.2 One timer, independent serialized control attempts

The runtime samples once before installing its active emitter. After the existing default-gap transfer settles, and only if the generation is still current and not stopped, it starts FIX-01's single `setInterval` at `flushDeadlineMs` before it enters the startup occurrence/gap sink. The same interval remains after arming; no second interval, timeout loop, watcher, or dependency is added. Starting it at this boundary lets control sampling continue if the startup sink hangs while retaining the existing immediate-start/stop result of zero scheduled timers when stop wins before transfer settlement.

Each interval callback does this synchronously in order:

1. if the state is not the current generation or is STOPPED, return;
2. call `beginControlSample(state)`, which returns the current `controlInFlight` promise or creates one;
3. if the phase is not ARMED or `flushInFlight` exists, return without starting occurrence/gap/health work;
4. otherwise start one flush promise that first awaits the control promise returned by step 2 and then executes the normal serialized cycle.

One control attempt performs exactly one `readCaptureOff` call. `controlInFlight` prevents overlapping marker reads and clears only when that attempt settles. A filesystem rejection is converted to OFF. A completed sample may update the gate in ARMING or ARMED, but checks generation identity and rejects STOPPED before mutating state, so a late result after stop or replacement is inert. ARMING samples never start a second sink cycle and never write health; the startup promise already owns `flushInFlight`.

The control promise is not a child of `flushInFlight`. Timer callbacks continue starting serialized control attempts when the startup or an armed occurrence, gap, or health sink promise remains unresolved. Under ordinary timer scheduling and a settling local `lstat`, a marker is reflected by the first callback begun after marker creation, no later than one configured flush interval. The covering test holds both a startup sink and a later armed sink beyond two intervals and proves suppression before releasing either. A marker read that itself never settles is outside that wall-clock proof; the single-attempt guard prevents unbounded filesystem calls, the last fail-closed state remains in force, and a stale health row makes the query OFF.

### 2.3 Cached emitter gate and cutover

`runtime/index.ts` installs one runtime-owned `CaptureEmitter` wrapper around FIX-01's emitter. It shares `captureOff` with the control sampler.

- ON: `emit()` and `captureHandled()` delegate exactly once.
- OFF: neither method delegates or queues. It records `DISABLED` and adds exactly one `first_party|DISABLED` loss.
- An ON-to-OFF sample updates the gate first, drains the concrete reference queue once, and adds the exact drained length to `first_party|DISABLED`. JavaScript's synchronous drain and gate assignment establish one cutover; entries owned by the flusher before that point are pre-cutover, and every entry still queued or emitted after it is suppressed exactly once.
- An OFF-to-ON sample updates the gate before the next flush may start, so subsequent calls queue normally.
- A database sink operation handed a batch before the OFF cutover may finish afterward. FIX-07 does not cancel an already-issued PostgreSQL operation. No batch is handed to the sink after the cutover while the cached gate is OFF.

The emitter performs no filesystem or database operation. The switch therefore still suppresses new product-path calls while a prior sink is hung or PostgreSQL is unavailable.

### 2.4 Exact gap-row semantics

`packages/obs-capture/src/health.ts` receives exactly five semantic additions:

1. `CAPTURE_HEALTH_CODES.DISABLED`;
2. `DISABLED: 0` in `zeroHealthCounts()`;
3. `CAPTURE_GAP_CLASSES.POSTGRES_FAILURE`;
4. `CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE`;
5. `CAPTURE_GAP_CLASSES.DISABLED`.

No existing member is renamed, removed, or reordered. Runtime construction passes one observer to `createCaptureHealth`. The observer retains the last detail code and, after the gap counter exists, applies this exact conversion:

| Health event | Pending gap event | Exact `lost_count` meaning |
|---|---|---|
| `POSTGRES_FAILURE` | `unclassified|POSTGRES_FAILURE|1` | one failed PostgreSQL sink operation observed by the armed runtime |
| `GAP_WRITE_FAILURE` | `unclassified|GAP_WRITE_FAILURE|1` | one failed attempt to persist one aggregate capture-gap row |
| `DISABLED` from one suppressed call | `first_party|DISABLED|1` | one suppressed occurrence candidate |
| OFF queue cutover of N entries | `first_party|DISABLED|N` | N suppressed queued occurrence candidates |

The `unclassified` source is required because the existing health callback has no envelope/runtime provenance and `CaptureSource` already admits it. Counts aggregate through the existing `(source,gap_class)` process-local map. A failed gap write first requeues its original aggregate and emits `GAP_WRITE_FAILURE`; the observer creates or increments the separate failure aggregate. If persistence of that failure aggregate also fails, it is requeued and incremented by one failed attempt, without recursive sink invocation. Recovery must persist both the original aggregate and the exact failure-operation count.

This intentionally supersedes v2's terminal-item-loss reinterpretation. A failed occurrence batch produces a `POSTGRES_FAILURE` gap even when every envelope is preserved in spool, because frozen R02 and IF-3 name database failure itself as a blind event. Process death while a count is pending remains covered by `CAPTURE_GAP_AUTHORITY_CONTRACT`: the stopped process cannot refresh the shared liveness lease.

### 2.5 Replica-safe shared heartbeat lease

`component='capture:<runtime>'` is one bounded runtime projection shared by all replicas. It is not per-process history and does not claim which replica wrote it.

- Each completed flush cycle of each ARMED process attempts at most one upsert.
- Capture processes write only `ARMED`, `SPOOL_ONLY`, `DRAINING`, or `OFF`. `STOPPED` remains a recognized historical/consumer state but FIX-07 never writes it from an individual process.
- `stopCaptureRuntime` clears the timer and prevents later control results from mutating state. Its existing bounded final flush may drain owned work but performs no component-health write.
- While any replica completes armed cycles, its server-timestamped upsert keeps the shared lease fresh. One replica stopping cannot change or stale the row. When all replicas stop, no writer refreshes it and the query becomes OFF after the stale threshold.
- `OFF` is safe as a shared value only under §2.1's coherent-marker invariant. Any live replica refreshes `ARMED` after the shared marker is removed.
- `SPOOL_ONLY`, `DRAINING`, and failure detail are conservative last-observed signals. The recent-gap branch in §2.7 prevents a later clean replica write from immediately erasing a database/gap failure period.

Heartbeat state is derived immediately before the health write, after all awaited cycle work, from current shared boxes rather than a control value captured before an await:

```text
current cached OFF                  -> OFF
current drainInFlight present       -> DRAINING
this cycle reports spooled > 0      -> SPOOL_ONLY
otherwise                           -> ARMED
```

If the health write fails, the runtime records `POSTGRES_FAILURE`, retains that code as unreported, and leaves the existing row to age. The next successful cycle publishes the retained failure code once; a later clean cycle may publish `FLUSH_OK`.

### 2.6 Exact server-clock upsert

`runtime/sink.ts` adds a runtime-internal method without changing `CaptureDatabaseSink`:

```ts
export type CaptureHeartbeatState =
  | "ARMED" | "SPOOL_ONLY" | "DRAINING" | "OFF";

export interface CaptureComponentHealthWrite {
  readonly component: `capture:${string}`;
  readonly state: CaptureHeartbeatState;
  readonly detailCode: CaptureHealthCode;
}
```

It executes exactly:

```sql
INSERT INTO obs.component_health (component, state, observed_at, detail_code)
VALUES ($1, $2, clock_timestamp(), $3)
ON CONFLICT (component) DO UPDATE SET
  state = $2,
  observed_at = clock_timestamp(),
  detail_code = $3,
  updated_at = clock_timestamp()
```

Parameters are the shared component, current state, and current detail code. There is no client timestamp to arrive late or regress the projection. On conflict, PostgreSQL acquires the primary-key conflict lock before evaluating the update expressions, so the later serialized update receives its database clock at update execution. The statement has no `RETURNING`, predicate, table-column read, explicit transaction, or second pool.

A 2026-09-04 PostgreSQL 18.4 probe authenticated two clients as `debateai_obs_writer`, executed the exact three-parameter statement in adverse lock order, left one row, advanced `observed_at`, and ended `ARMED|FLUSH_OK`. The privilege vector remained: table `INSERT=f|SELECT=f|UPDATE=f`; component `INSERT=t|SELECT=t|UPDATE=f`; state `SELECT=f|UPDATE=t`; updated-at `INSERT=f|UPDATE=t`; `DELETE=f|TRUNCATE=f`. Direct writer `SELECT state` and `UPDATE component` returned SQLSTATE `42501`.

### 2.7 Truthful bounded period query

The successor vocabulary is exhaustive:

| Label | Meaning in the one-minute window |
|---|---|
| `OFF` | health missing, stale, explicitly OFF, or historical STOPPED |
| `BLIND` | live lease plus a blind state/detail or an open/recent gap |
| `ACTIVE` | live and not blind, with at least one recent occurrence for that runtime |
| `QUIET` | live and not blind, with zero recent occurrences for that runtime |

V later pastes this exact query:

```sql
WITH params AS (
  SELECT now() - interval '1 minute' AS cutoff
), runtimes(runtime) AS (
  VALUES ('api'), ('runner'), ('scheduler')
), gap_window AS (
  SELECT EXISTS (
    SELECT 1
    FROM obs.capture_gap AS cg
    CROSS JOIN params AS p
    WHERE cg.closed_at IS NULL
       OR cg.closed_at >= p.cutoff
  ) AS any_gap
)
SELECT r.runtime,
       CASE
         WHEN h.component IS NULL
           OR h.state IN ('OFF', 'STOPPED')
           OR h.observed_at < p.cutoff THEN 'OFF'
         WHEN h.state = 'SPOOL_ONLY'
           OR h.detail_code IN (
             'QUEUE_FULL', 'EMIT_FAILURE', 'REDACTOR_FAILURE',
             'POSTGRES_FAILURE', 'SPOOL_FAILURE', 'GAP_WRITE_FAILURE'
           )
           OR g.any_gap THEN 'BLIND'
         WHEN EXISTS (
           SELECT 1
           FROM obs.occurrence AS o
           WHERE o.runtime = r.runtime
             AND o.captured_at >= p.cutoff
         ) THEN 'ACTIVE'
         ELSE 'QUIET'
       END AS period
FROM runtimes AS r
CROSS JOIN params AS p
CROSS JOIN gap_window AS g
LEFT JOIN obs.component_health AS h
  ON h.component = 'capture:' || r.runtime
ORDER BY r.runtime;
```

The window is bounded to one minute; the occurrence branch is an `EXISTS` range over `occurrence_captured_severity_idx`, and an open gap can use `capture_gap_open_idx`. A recent closed gap remains conservative evidence for one minute. The query reads `obs.occurrence`, unlike v2. Precedence is fail closed: missing/stale/explicit stop wins as OFF, blind evidence wins over activity, activity wins over quiet. V invokes `psql` with `ON_ERROR_STOP=1`; database error, timeout, or permission failure is an unsuccessful proof and must never be reported as `QUIET`.

## 3. Migration and role authority

The sole migration remains `migrations/0063_fix07_writer_health_upsert.sql` and contains only:

```sql
GRANT INSERT (component, state, observed_at, detail_code)
  ON obs.component_health TO debateai_obs_writer;
GRANT SELECT (component)
  ON obs.component_health TO debateai_obs_writer;
GRANT UPDATE (state, observed_at, detail_code, updated_at)
  ON obs.component_health TO debateai_obs_writer;
```

No table-wide privilege is granted. The writer receives no SELECT on state, time, or detail; no UPDATE on component; and no DELETE or TRUNCATE. Migration 0034, its tables, triggers, constraints, existing grants, and `packages/db/src/obs-schema.ts` remain unchanged. `SELECT(component)` remains the minimum PostgreSQL conflict-arbitration grant.

Immediately before creating 0063, implementation repeats the all-ref/all-worktree collision audit. Any competing `0063` file or paper claim is a STOP; the worker returns to architecture and does not self-renumber.

### 3.1 Fresh allocation audit

The 2026-09-04 successor audit enumerated all 78 refs and all 72 registered worktrees. Tracked ref trees and tracked/untracked worktree migration directories contain `0055_register_support_publication.sql`, `0056_security_truncate_definer_searchpath.sql`, Observation 0057–0060, FIX-01 0061, and FIX-09 0062, but no 0063 file. The mission-document search found 0063 only in this FIX-07 v2/v3 authority family. The carried ledger remains Support paper reservations 0050–0054, Support 0055, Security 0056, Observation 0057–0060, FIX-01 0061, FIX-09 0062, and FIX-07 0063.

## 4. Exact implementation surface

Create only:

- `migrations/0063_fix07_writer_health_upsert.sql`;
- `packages/obs-capture/src/runtime/control.ts`;
- `tests/integration/fix07-heartbeat.test.ts`;
- `tests/integration/fix07-off-switch.test.ts`;
- `tests/unit/fix07-gap-classes.test.ts`.

Modify only:

- `packages/obs-capture/src/runtime/config.ts` for `readObsControlDir` only;
- `packages/obs-capture/src/runtime/index.ts` for the cached gate, one-timer independent control attempt, failure-to-gap observer, replica-safe cycle, and heartbeat;
- `packages/obs-capture/src/runtime/sink.ts` for the health-write port and exact SQL;
- `packages/obs-capture/src/health.ts` for exactly the five entries in §2.4.

Read without editing:

- `packages/obs-capture/src/{emit,flusher,queue,spool}.ts`;
- `packages/obs-capture/install/{api,runner,scheduler}.ts`;
- `packages/db/src/obs-schema.ts`;
- migration 0034 and every later migration;
- all FIX-01 tests and standing Observation foundation tests.

Forbidden: installer edits; `src/zone/**`; `src/registry/**`; `@debateai/db`; package manifests and lockfiles; product application/scheduler source; Hermes; model/provider/CLI imports; schema/table/trigger/index changes beyond the three grants; test-support edits; standing-test edits; and any path not listed above.

## 5. Verification and V boundary

Worker evidence must prove:

- the exact migration vector, two authenticated writer connections, one shared row, conflict serialization, database-clock advancement, and both 42501 negative probes;
- two logical replicas of the same runtime: either may refresh; stopping either emits no STOPPED write and cannot make the query OFF; after all stop and the lease ages, the query is OFF;
- exactly one existing interval, one non-overlapping marker read per control attempt, and held startup plus armed sinks beyond two intervals do not prevent OFF suppression/counting;
- exact direct plus queued DISABLED counts across the cutover and recovery;
- forced `POSTGRES_FAILURE` and transient `GAP_WRITE_FAILURE` each eventually persist their own class and exact operation count, in addition to the original requeued gap;
- the query's missing, stale, OFF, STOPPED, SPOOL_ONLY, failure-detail, open-gap, recent-closed-gap, recent-occurrence ACTIVE, and zero-occurrence QUIET cases;
- identical scheduler exit status and stderr bytes in installed-ON, installed-OFF, and uninstalled cases;
- unchanged `ObsBounds`, start options, installers, capture core, product source, standing tests, package graph, and forbidden imports.

Focused FIX-07 tests run three times; the worst run is the verdict. All FIX-01 focused tests, the S01 foundation test, typecheck, collision scan, static surface checks, and diff checks must pass.

V alone later performs the successor acceptance sequence and pastes §2.7's query against the production-facing stack. Green worker tests, local role probes, and reviewer PASS are milestones only. This packet does not claim that V touched the marker, ran the failing job, queried production, vetoed, or accepted FIX-07.

## 6. Stop conditions

Implementation stops before editing, or at the first newly discovered conflict, if:

- the branch does not contain FIX-01 `24d0b3e5` or the named interfaces differ;
- the final audit finds another `0063` migration or paper claim;
- the exact upsert needs a grant beyond §3;
- a truthful shared lease requires a per-instance key, extra table/column/index, reader privilege, STOPPED write, or client timestamp;
- replicas do not share the same marker namespace;
- prompt sampling requires a second timer, overlapping marker reads, sink cancellation, installer edit, or public option change;
- exact failure rows require editing `emit.ts`, `flusher.ts`, `queue.ts`, or `spool.ts`;
- `health.ts` needs a semantic edit outside the five entries in §2.4;
- the ACTIVE counterexample cannot be distinguished without calling it QUIET;
- a test requires a runtime name in `capture_gap.source`, a product transaction, new dependency, standing-test edit, or test-support edit;
- product exit/stderr bytes differ;
- any requested act would assert or substitute for V's personal production acceptance.
