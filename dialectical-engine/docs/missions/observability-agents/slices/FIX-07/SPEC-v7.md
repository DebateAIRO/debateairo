# FIX-07 — Node-safe launch cadence and total pre-install capture OFF

**Successor correction packet — 2026-09-05, architecture seat.** This document supersedes `SPEC-v6.md`, `SPEC-v5.md`, `SPEC-v4.md`, `SPEC-v3.md`, `SPEC-v2.md`, and `SPEC.md` for FIX-07 implementation. It corrects only the fresh implementation review's P1 native-timer domain and P3 direct control-error classification. Every other reviewed F1–F4, N1, N2, grant, lease, cutover, failure-gap, launch-transport, query, product-invariance, test, scope, and V-boundary contract remains binding. V's broad source-backed correction authority permits this packet; it records no V marker act, production query, veto, or acceptance.

**Entry gate:** apply the correction to reviewed FIX-07 implementation HEAD `3591ccd2c489729c705fb8b31dbf60327bc68439`, or a descendant with exactly the same ten-path FIX-07 implementation ledger and the same `startCaptureRuntime`, `stopCaptureRuntime`, emitter-install, one-timer, serialized `flushInFlight`, gap-counter, flusher, direct-`pg` sink, and development-launch interfaces. That implementation descends from FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`. The correction changes production semantics only in `runtime/config.ts` and `runtime/control.ts`, extends only the existing FIX-07 off-switch integration test, and does not reopen migration 0063, the passive register field, child launchers, runtime scheduling shape, or any V-owned act.

## 1. Source reconciliation and amendments

1. The deployment contract supports N runner workers and N API replicas (`docs/missions/2026-08-06-v3-programming/ratification/monolith-vs-microservices-debate.md:150-160,313-321,471-474`). A per-runtime primary-key row therefore cannot be the last process's lifecycle row. This successor treats `capture:<runtime>` as a shared liveness lease: every completed armed cycle may refresh it, but an individual process stop never writes `STOPPED`.
2. FIX-01's timer skips occurrence work while `flushInFlight` is set (`packages/obs-capture/src/runtime/index.ts:256-270`), and its PostgreSQL pool has no query deadline (`packages/obs-capture/src/runtime/sink.ts:110-125`). Marker sampling that is awaited only inside that promise cannot meet FIX-07-R03. This successor launches a separately guarded control sample from the existing timer callback before the `flushInFlight` test. It adds no second timer.
3. Frozen FIX-07-R02 and mission IF-3 require `POSTGRES_FAILURE` and `GAP_WRITE_FAILURE` capture-gap rows (`SPEC.md:13-15`; `requirements/fixagent.md:73-78,201-206`). FIX-01 already emits one health event for each failed occurrence batch and each failed capture-gap write (`packages/obs-capture/src/flusher.ts:41-49,104-121`; `packages/obs-capture/src/health.ts:149-160,199-227`). Runtime wiring converts those events into counted pending gap events without editing the flusher.
4. A query whose only labels are `OFF`, `BLIND`, and `QUIET` cannot truthfully label a fresh, non-blind runtime that has recent occurrences: it is none of the three. This successor narrowly amends FIX-07-R04 and the period vocabulary to add `ACTIVE`. `QUIET` now means exactly fresh live evidence, no blind evidence, and no occurrence in the bounded window.
5. Migration 0034 defines `obs.component_health.component` as the primary key and `observed_at` as required (`migrations/0034_obs_foundation.sql:240-246`), gives the writer no health privilege (`:313-334,369-372`), and provides the occurrence time index plus open-gap partial index (`:248-263`). The reviewed grant-only migration remains the narrowest schema act.
6. Frozen R04 defines a stale heartbeat relative to one executable flush interval, not one minute (`SPEC.md:16,29-30`). On repository-pinned Node `22.23.1`, the native timer constructor defines `TIMEOUT_MAX = 2 ** 31 - 1` and converts every larger `setInterval` delay to `1` ms with `TimeoutOverflowWarning`. FIX-07 passes landed `flushDeadlineMs` directly to its sole interval. The canonical domain is therefore a positive integer from `1` through `2147483647`; every absent, empty, malformed, fractional, zero, negative, greater-than-ceiling, or unsafe value selects the existing `5000` ms seed. The query consumes that same effective value; one minute remains only the activity/gap evidence window.
7. A pre-existing marker must close the gate before the runtime emitter becomes active. Startup therefore awaits one descriptor-only, fail-closed control attempt after assigning the current state but before `installCaptureEmitter` or the installed-readiness settlement. The v3 post-transfer timer/startup-sink ordering remains unchanged.
8. A shell export alone does not reach API or runner. Landed `loadDevelopmentCommandEnvironment()` uses a closed shape that omits `OBS_FLUSH_DEADLINE_MS`; `dev-auth-stack-cli.ts` passes only that result, and the API/runner child launchers copy it into their explicit environments (`packages/register/src/runtime-environment.ts:36-51`; `apps/runner/src/dev-auth-stack-cli.ts:38-43`; `apps/runner/src/dev-auth-stack.ts:206-249`; `apps/runner/src/dev-api-process.ts:238-255,332-343`; `apps/runner/src/dev-runner-process.ts:56-75,121-132,171-182`). This successor authorizes the single transport-only field in §2.8. The scheduler one-shot remains a direct package-script child and inherits the canonical parent environment (`package.json`; `apps/scheduler/src/cli.ts`).
9. The same command loader is invoked by `dev:auth:up` and six unrelated development CLIs: `dev-hatchet-token-cli.ts`, `dev-api-environment-cli.ts`, `dev-auth-data-plane-cli.ts`, `dev-deployment-register-cli.ts`, `dev-api-process-cli.ts`, and `dev-ui-process-cli.ts`. V5's regex/refinement would reject empty, malformed, non-positive, fractional, or unsafe raw cadence before any of those callers could reach landed `readObsBounds`. The shared loader therefore remains an allowlist/transport boundary only. Numeric acceptance and fallback, including the native-timer ceiling, remain exclusively in landed `readObsBounds`; post-canonical exact-string equality supplies the acceptance gate.
10. A fresh real-runtime probe on Node `22.23.1` observed requested/actual delay and 30 ms callback counts of `2147483647/2147483647/0`, `2147483648/1/23`, and `9007199254740991/1/24`. FIX-07 newly carries these strings into API and runner children, so textual echo alone cannot make an out-of-domain delay executable. Canonicalization must happen before the command/API/runner/scheduler/query echo chain and must choose `5000`, not clamp to `2147483647`: clamping would replace a visible fallback with approximately 24.8 days of heartbeat blindness.
11. The reviewed `readCaptureOff` catch reads `error.code` directly. A thrown error may be a primitive, an accessor-bearing object, or a proxy whose property or descriptor trap throws. The exported function's own boolean contract must remain total without relying on `beginControlSample`'s outer catch. Only an ordinary non-proxy error object's own data descriptor whose value is the string `ENOENT` means ON; every other thrown value means OFF, and classification performs zero hostile getter or proxy-trap reads.

Rejected alternatives are a singleton deployment fiction; a per-instance health key or health-history table; a STOPPED last-writer projection; client-provided heartbeat times; a fixed one-minute health lease; accepting a native interval above `2147483647`; clamping overflow to `2147483647`; adding a long-delay scheduler; a database cadence row; a new cadence field or public start option; duplicating the numeric canonicalizer; regex, refinement, coercion, transform, default, or numeric rejection in the shared command loader; rejection of landed non-default or fallback inputs; adding cadence to the credential file; editing either child launcher; a second timer; a sink timeout/config expansion; reading `error.code` or any other raw thrown-value property; invoking an error accessor or proxy trap; a spool-relative marker; a register-row switch; installer edits; edits to `emit.ts`, `flusher.ts`, `queue.ts`, or `spool.ts`; a table-wide grant; a security-definer function; an `@debateai/db` import; encoding runtime names into `capture_gap.source`; or calling a recent-occurrence period `QUIET`.

## 2. Closed runtime contracts

### 2.1 Control configuration and marker truth

`packages/obs-capture/src/runtime/config.ts` exports:

```ts
export function readObsControlDir(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined;
```

It reads only `env.OBS_CONTROL_DIR`. A non-empty absolute path is returned unchanged. Missing, empty, relative, or NUL-containing input returns `undefined`. It is independent of `OBS_SPOOL_DIR`; `ObsBounds` and `CaptureRuntimeStartOptions` remain unchanged.

`packages/obs-capture/src/runtime/control.ts` owns one path and one total probe:

```ts
export function captureOffMarkerPath(
  controlDir: string | undefined,
): string | undefined;
export async function readCaptureOff(
  markerPath: string | undefined,
): Promise<boolean>;
```

The only configured path is `join(controlDir, "CAPTURE_OFF")`. `readCaptureOff` uses `lstat` and follows this closed truth table for its direct exported promise:

| Input/result | Capture state |
|---|---|
| no valid control directory | ON (legacy unconfigured mode) |
| `lstat` succeeds for any directory entry, including a symlink | OFF |
| `lstat` throws an ordinary non-proxy object with an own data property whose value is exactly string `ENOENT` | ON |
| `lstat` throws an accessor-bearing object, proxy, primitive, non-string code, inherited code, missing code, descriptor trap, or any other value/failure | OFF |

The catch path must never read `error.code`, spread, stringify, log, rethrow, or otherwise expose the raw thrown value. It first rejects `null`, primitives, and values identified by Node's non-trapping `node:util/types.isProxy`. Inside one guarded `try`, it obtains only `Object.getOwnPropertyDescriptor(error, "code")`; only an own data descriptor with exact string value `ENOENT` returns false. An accessor descriptor is not invoked. Failure of proxy detection or descriptor classification returns true. Direct tests inject a code getter, a proxy with both `get` and `getOwnPropertyDescriptor` traps, and a throwing descriptor trap; `readCaptureOff` must resolve true and every hostile read/trap counter must remain zero. A lawful real or injected own-data `ENOENT` must resolve false.

Every replica of a runtime must receive the same absolute `OBS_CONTROL_DIR` and see the same marker namespace as FIX-10. That coherence is the deployment invariant that makes shared `OFF` state truthful. A deployment with divergent per-replica marker namespaces is invalid and must not be accepted.

All capture runtimes and replicas covered by one acceptance query must also share one effective `flushDeadlineMs`. Landed `readObsBounds` is the sole numeric canonicalizer; the value is obtained by executing it, never by restating its parser. It preserves an `OBS_FLUSH_DEADLINE_MS` value only when `Number(value)` is a safe integer in the inclusive range `1..2147483647`. Missing, empty, malformed, fractional, zero, negative, `2147483648`, `Number.MAX_SAFE_INTEGER`, unsafe, or any larger value selects the existing `5000` ms seed. The upper boundary is exact: `2147483647` is preserved and every greater value falls back; no value is clamped. V exports that returned canonical decimal before constructing any child environment or launching any covered process. A query run with a different value, or a post-canonicalization launch path that omits or changes it, is failed evidence and cannot produce acceptance.

Outside that acceptance sequence, `loadDevelopmentCommandEnvironment()` forwards the optional raw string unchanged and never decides whether it is numeric. Empty, malformed, non-positive, fractional, above-ceiling, and unsafe strings therefore do not make the shared loader throw. If such a value reaches a capture runtime, landed `readObsBounds` selects `5000`; unrelated development CLIs merely carry an inert optional string. This transport rule adds no second default and no second validation policy.

### 2.2 One timer, independent serialized control attempts

After `createStartingState` and assignment to `runtimeState`, startup executes this exact pre-install sequence:

1. `await beginControlSample(state)`; this performs one `readCaptureOff` call and therefore at most one `lstat`;
2. if the sample rejects, set the cached gate OFF;
3. if `runtimeState !== state`, `activeGeneration !== generation`, or phase is STOPPED, return without installing or settling readiness;
4. call `installCaptureEmitter` with the already-sampled wrapper and settle installed readiness.

No runtime emitter is active while the initial marker read is pending. If the marker already exists, the first call after installation is suppressed and counted before any timer tick. If stop wins while the read is pending, it schedules zero timers; late settlement cannot install the emitter.

After the existing default-gap transfer settles, and only if the generation is still current and not stopped, startup begins FIX-01's single `setInterval` at canonical `flushDeadlineMs` before it enters the startup occurrence/gap sink. Because `readObsBounds` can return only `1..2147483647`, the argument requested by the runtime and the delay stored by Node's actual returned timer are identical. The same interval remains after arming; no second interval, timeout loop, watcher, long-delay scheduler, or dependency is added. Starting it at this boundary lets control sampling continue if the startup sink hangs while retaining the existing immediate-start/stop result of zero scheduled timers when stop wins before initial-sample or transfer settlement.

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

### 2.7 Truthful configured-cadence period query

The successor vocabulary remains exhaustive. Health freshness is independent from the one-minute evidence window:

| Label | Meaning |
|---|---|
| `OFF` | health missing, explicitly OFF/STOPPED, or older than the supplied effective flush interval |
| `BLIND` | live lease plus a blind state/detail or an open/recent gap in the one-minute evidence window |
| `ACTIVE` | live and not blind, with at least one occurrence for that runtime in the one-minute evidence window |
| `QUIET` | live and not blind, with zero occurrences for that runtime in the one-minute evidence window |

For a configured interval `I`, a row whose age is less than or exactly `I` is live; a row older than `I` is OFF. Equality stays live so the query does not flip OFF at the nominal instant the next normal cycle is due. The first representable time outside `I` is OFF. Once every replica stops refreshing, this supplies the frozen one-flush-interval absence bound instead of v3's unrelated minute.

The acceptance stack and the query must use the same effective cadence. Before launching acceptance processes from one environment snapshot, V invokes the landed authority and then proves the development-command loader preserved the exact canonical string:

```bash
fix07_flush_interval_ms="$(pnpm exec tsx -e '
import { readObsBounds } from "./packages/obs-capture/src/runtime/config.ts";
process.stdout.write(String(readObsBounds().flushDeadlineMs));
')" || exit 1
export OBS_FLUSH_DEADLINE_MS="$fix07_flush_interval_ms"
fix07_forwarded_flush_interval_ms="$(pnpm exec tsx -e '
import { loadDevelopmentCommandEnvironment } from "./packages/register/src/runtime-environment.ts";
process.stdout.write(loadDevelopmentCommandEnvironment().OBS_FLUSH_DEADLINE_MS ?? "");
')" || exit 1
test "$fix07_forwarded_flush_interval_ms" = "$fix07_flush_interval_ms" || exit 1
```

The initial missing, empty, malformed, non-positive, fractional, above-ceiling, or unsafe host value is converted explicitly to landed `5000`; it is never left absent for children to default independently. The loader does not validate that decimal. Instead, the exact comparison above makes post-canonical omission, empty/malformed/out-of-domain replacement, or a different valid decimal stop before child assembly or query interpretation. API and runner start through the same checked command environment; the scheduler job and psql command execute from that same exported environment snapshot. The exact value is supplied to psql on stdin with `-v flush_interval_ms="$fix07_flush_interval_ms" -v ON_ERROR_STOP=1`; `-c` is forbidden because psql variable interpolation does not occur there. Worker tests capture the API, runner, scheduler, actual runtime timer, and query inputs and require each exact echo/delay to equal the parent's canonical value. This adds no database row or public runtime API.

V later pastes this exact query:

```sql
WITH supplied AS (
  SELECT :'flush_interval_ms'::bigint AS flush_interval_ms,
         transaction_timestamp() AS evaluated_at
), params AS (
  SELECT evaluated_at,
         flush_interval_ms,
         evaluated_at - interval '1 minute' AS period_cutoff
  FROM supplied
  WHERE flush_interval_ms BETWEEN 1 AND 2147483647
), runtimes(runtime) AS (
  VALUES ('api'), ('runner'), ('scheduler')
), gap_window AS (
  SELECT EXISTS (
    SELECT 1
    FROM obs.capture_gap AS cg
    CROSS JOIN params AS p
    WHERE cg.closed_at IS NULL
       OR cg.closed_at >= p.period_cutoff
  ) AS any_gap
)
SELECT r.runtime,
       CASE
         WHEN h.component IS NULL
           OR h.state IN ('OFF', 'STOPPED')
           OR EXTRACT(EPOCH FROM (p.evaluated_at - h.observed_at)) * 1000
                > p.flush_interval_ms THEN 'OFF'
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
             AND o.captured_at >= p.period_cutoff
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

Missing, non-bigint, non-positive, greater-than-`2147483647`, or unsafe input either raises under `ON_ERROR_STOP` or makes `params` empty; anything other than exactly three ordered rows is failed evidence, never QUIET. Acceptance never binds the raw rejected value: after initial `2147483648` or `Number.MAX_SAFE_INTEGER`, the exact canonical query echo is `5000`. The elapsed-age comparison remains direct and uses no independently calculated cutoff. `transaction_timestamp()` gives tests one stable boundary: seed and query within one transaction to prove just-inside, exact, just-outside, ceiling, and canonical-overflow cases without scheduler delay. The occurrence branch remains an `EXISTS` range over `occurrence_captured_severity_idx`, and an open gap can use `capture_gap_open_idx`. A recent closed gap remains conservative evidence for one minute. Precedence stays fail closed: missing/stale/explicit stop wins as OFF, blind evidence wins over activity, activity wins over quiet. Database error, timeout, permission failure, cadence mismatch, or fewer than three rows is an unsuccessful proof.

### 2.8 Transport-only development-launch authority

`packages/register/src/runtime-environment.ts` receives exactly one property inside the existing `loadDevelopmentCommandEnvironment()` shape and no other semantic or formatting edit:

```ts
OBS_FLUSH_DEADLINE_MS: z.string().optional(),
```

This field performs only string transport. It has no regex, refinement, coercion, transform, default, or numeric conversion. Under an ordinary shared-loader call, it preserves the raw optional value so landed `readObsBounds` remains the only place that accepts a positive integer not greater than `2147483647` or selects `5000`. Under the acceptance sequence, the parent executes `readObsBounds` first, exports its canonical decimal, invokes the real loader, and requires an exact echo before any child environment is assembled.

Under `dev:auth:up`, `dev-auth-stack-cli.ts` obtains this object once. `createDevelopmentAuthStackOperations` passes the same object to `startDevelopmentApiProcess` and `startDevelopmentRunnerProcess`. The API child uses `{ ...commandEnvironment, ...values }`; `DEVELOPMENT_API_ENVIRONMENT_KEYS` cannot contain the cadence, so the credential environment cannot replace it. The runner begins with `{ ...commandEnvironment }` and has no later cadence property. Both spawn with copies of those objects. The scheduler command is not launched by this stack and inherits the already-canonical shell environment directly.

The existing FIX-07 integration test retains its eleven-row raw matrix — absent, empty, malformed, zero, negative, fractional, `250`, `5000`, `7250`, maximum-safe, and unsafe overflow — so its seven real CLI contexts remain exactly 77 cases. No case may throw in the loader. Landed `readObsBounds` under the returned environment now yields respectively `5000,5000,5000,5000,5000,5000,250,5000,7250,5000,5000`. The test separately adds exact native-timer rows for `2147483647` and `2147483648`; this preserves all prior raw transport cases without inflating or weakening the 77-caller proof.

Second, the test feeds the same initial matrix through real `readObsBounds`, exports the returned decimal, invokes the real loader, drives the real API and runner environment assembly with captured child operations, and asserts the command object, both child objects, a scheduler child environment, each child `readObsBounds`, and the query bind echo equal the same canonical string. Maximum-safe and unsafe overflow must echo/query `5000`. Post-canonical omission, empty/malformed/non-positive/fractional/above-ceiling/unsafe replacement, and a valid-but-different replacement all stop before a child launch or period label is interpreted. Removing/replacing the field, forwarding the raw initial string after canonicalization, credential overriding, child omission, or query mismatch retains RED. A source assertion confines the register diff to this one passive property and rejects a numeric validator in that field.

Third, one real-timer proof runs the direct, API-child, and runner-child launch paths for raw `2147483647` and `2147483648`. It lets `readObsBounds` run at the final runtime boundary, registers the actual Node interval, records the requested delay and returned timer's effective delay, and counts callback entry over 30 ms. Every path must preserve `2147483647`; every overflow path must request/store `5000`; every row registers exactly one interval and observes zero callback entries in that window. The source contains exactly one `setInterval`. The test also proves raw maximum-safe canonical/query echo `5000`. The current implementation is RED because each overflow path requests a delay above the native ceiling, Node stores `1`, and callbacks recur during the observation window.

The file is shared governance, not broad FIX-07 ownership. FIX-07 may edit only this existing shape property after the controller confirms no concurrent writer. It may not edit `packages/register/src/index.ts`, append/move functions, touch another environment loader, or modify an API/runner/scheduler launcher or credential key list.

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

The 2026-09-05 round-4 audit enumerated all 78 refs, including 66 current local/remote branch refs, and all 72 registered worktrees. `git rev-list --objects --all` and tracked/untracked worktree migration scans found no `0063_*.sql`. The mission-document search found 0063 only in this FIX-07 v2–v7 authority family and decision log. The carried ledger remains Support paper reservations 0050–0054, Support 0055, Security 0056, Observation 0057–0060, FIX-01 0061, FIX-09 0062, and FIX-07 0063.

## 4. Exact implementation surface

Create only:

- `migrations/0063_fix07_writer_health_upsert.sql`;
- `packages/obs-capture/src/runtime/control.ts`;
- `tests/integration/fix07-heartbeat.test.ts`;
- `tests/integration/fix07-off-switch.test.ts`;
- `tests/unit/fix07-gap-classes.test.ts`.

Modify only:

- `packages/obs-capture/src/runtime/config.ts` for `readObsControlDir` plus the flush-deadline-only native-timer ceiling; queue capacity and every other bound remain unchanged;
- `packages/obs-capture/src/runtime/index.ts` for the cached gate, one-timer independent control attempt, failure-to-gap observer, replica-safe cycle, and heartbeat;
- `packages/obs-capture/src/runtime/sink.ts` for the health-write port and exact SQL;
- `packages/obs-capture/src/health.ts` for exactly the five entries in §2.4;
- `packages/register/src/runtime-environment.ts` for exactly the passive §2.8 property inside `loadDevelopmentCommandEnvironment()`.

Read without editing:

- `packages/obs-capture/src/{emit,flusher,queue,spool}.ts`;
- `packages/obs-capture/install/{api,runner,scheduler}.ts`;
- `apps/runner/src/{dev-auth-stack-cli,dev-auth-stack,dev-api-environment,dev-api-process,dev-runner-process}.ts`;
- `apps/scheduler/src/cli.ts` and root `package.json`;
- `packages/db/src/obs-schema.ts`;
- migration 0034 and every later migration;
- all FIX-01 tests and standing Observation foundation tests.

Forbidden: every register edit outside the one §2.8 property; installer edits; `src/zone/**`; `src/registry/**`; `@debateai/db`; package manifests and lockfiles; API/runner/scheduler launchers and product application/scheduler source; Hermes; model/provider/CLI imports; schema/table/trigger/index changes beyond the three grants; test-support edits; standing-test edits; and any path not listed above. The exact implementation ledger remains the same ten paths: v4's nine plus `packages/register/src/runtime-environment.ts`. Relative to reviewed implementation HEAD `3591ccd2c489729c705fb8b31dbf60327bc68439`, this correction may modify only `packages/obs-capture/src/runtime/config.ts`, `packages/obs-capture/src/runtime/control.ts`, and `tests/integration/fix07-off-switch.test.ts`; no migration, grant, runtime/index, sink, health, register, launcher, product, or standing-test byte changes.

## 5. Verification and V boundary

Worker evidence must prove:

- the exact migration vector, two authenticated writer connections, one shared row, conflict serialization, database-clock advancement, and both 42501 negative probes;
- two logical replicas of the same runtime: either may refresh; stopping either emits no STOPPED write and cannot make the query OFF; after all stop and the lease ages, the query is OFF;
- default `5000`, non-default `7250`, and exact ceiling `2147483647` effective intervals passed into the exact query: just inside and exactly at the selected boundary are live; just outside is OFF; a 30-second-old default-cadence row is OFF;
- the unchanged eleven-row raw-loader matrix across `dev:auth:up` plus all six unrelated loader callers remains exactly 77/77: the loader never throws or interprets cadence, while landed `readObsBounds` alone maps both maximum-safe and unsafe overflow to `5000`;
- direct, real API-child, and real runner-child launch paths each preserve `2147483647`, map `2147483648` to `5000`, register exactly one actual Node interval with requested delay equal to its stored effective delay, and enter zero callbacks in a 30 ms no-storm window; source still contains one `setInterval` and no added scheduling loop;
- real initial-value canonicalization plus exact command/API/runner/scheduler/query echoes for the same matrix, with `5000` query echo after maximum-safe/overflow input; a 6,000 ms row is OFF at actual `5000` and QUIET at `7250`, so post-canonical omission/replacement or child/query mismatch is RED before interpretation;
- direct `readCaptureOff` calls resolve false for lawful own-data string `ENOENT`, resolve true for accessors, proxies, throwing descriptor traps, primitives, inherited/missing/non-string/other codes, and perform zero hostile getter, `get`, or `getOwnPropertyDescriptor` trap reads;
- a marker present before start: readiness/install waits for the held initial `lstat`; settling OFF suppresses the first immediate post-install emit before any timer; stop during the held read yields no timer or late install;
- exactly one existing interval, one non-overlapping marker read per control attempt, and held startup plus armed sinks beyond two intervals do not prevent OFF suppression/counting;
- exact direct plus queued DISABLED counts across the cutover and recovery;
- forced `POSTGRES_FAILURE` and transient `GAP_WRITE_FAILURE` each eventually persist their own class and exact operation count, in addition to the original requeued gap;
- the query's missing, stale, OFF, STOPPED, SPOOL_ONLY, failure-detail, open-gap, recent-closed-gap, recent-occurrence ACTIVE, and zero-occurrence QUIET cases;
- identical scheduler exit status and stderr bytes in installed-ON, installed-OFF, and uninstalled cases;
- unchanged five-field `ObsBounds` interface, queue-bound semantics, start options, installers, child launchers, credential key list, capture core, product source, standing tests, package graph, and forbidden imports; the register diff remains exactly one passive string property with no numeric policy.

Focused FIX-07 tests run three times; the worst run is the verdict. All FIX-01 focused tests, the cadence-sensitive standing subset, the S01 foundation test, typecheck, audit:source, collision scan, static surface checks, and diff checks must pass. The complete thirteen-file standing register suite is run before and after the change: its final failing identifiers must be a subset of the recorded base identifiers and its failure count may not increase. Exact FIX-01 `24d0b3e5` has three known unrelated standing reds (S6 content-encryption runtime setup, S10 carrier erasure, and S8 publication); this packet neither waives a new red nor falsely calls that base suite green.

V alone later performs the successor acceptance sequence and pastes §2.7's query against the production-facing stack. Green worker tests, local role probes, and reviewer PASS are milestones only. This packet does not claim that V touched the marker, ran the failing job, queried production, vetoed, or accepted FIX-07.

## 6. Stop conditions

Implementation stops before editing, or at the first newly discovered conflict, if:

- the branch does not contain FIX-01 `24d0b3e5` or the named interfaces differ;
- the final audit finds another `0063` migration or paper claim;
- the exact upsert needs a grant beyond §3;
- a truthful shared lease requires a per-instance key, extra table/column/index, reader privilege, STOPPED write, or client timestamp;
- replicas do not share the same marker namespace;
- capture replicas/runtimes in one acceptance query do not share the supplied effective `flushDeadlineMs`, the canonical value is outside `1..2147483647`, the runtime's actual timer delay differs from that canonical value, or the query cannot receive the exact landed effective value;
- the controller has not serialized the register property against another writer, the passive one-property propagation is insufficient, any child launcher/credential list/index export must change, ordinary raw input would fail in the shared loader, a second numeric/default authority is required, or exact post-canonical equality cannot detect omission/replacement before launch;
- direct OFF classification cannot remain total without invoking a thrown-value accessor/proxy trap, or the initial descriptor-only control sample cannot settle before emitter installation/readiness, or stop during that read can later install/start a timer;
- prompt sampling requires a second timer, overlapping marker reads, sink cancellation, installer edit, or public option change;
- exact failure rows require editing `emit.ts`, `flusher.ts`, `queue.ts`, or `spool.ts`;
- `health.ts` needs a semantic edit outside the five entries in §2.4;
- the ACTIVE counterexample cannot be distinguished without calling it QUIET;
- a test requires a runtime name in `capture_gap.source`, a product transaction, new dependency, standing-test edit, or test-support edit;
- product exit/stderr bytes differ;
- any requested act would assert or substitute for V's personal production acceptance.
