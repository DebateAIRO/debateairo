# FIX-07 Native-Timer Domain and Total OFF Probe Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plan successor — 2026-09-05, architecture seat.** This plan supersedes `PLAN-v7.md` only for the fresh implementation review's P1 native-timer domain and P3 direct `readCaptureOff` totality. `SPEC-v7.md` is the governing contract. Every other PLAN-v7 task, passing test contract, migration/grant, ten-path ledger, product invariant, and V boundary remains binding and is regression evidence, not work to redesign.

**Goal:** Ensure every accepted flush cadence is an executable Node 22 interval whose command/API/runner/scheduler/query value agrees with the actual timer, and make direct OFF probing resolve fail-closed without invoking hostile error accessors or proxy traps.

**Architecture:** Keep `loadDevelopmentCommandEnvironment` as passive string transport and keep `runtime/index.ts` on its existing one-interval design. Narrow only the flush-deadline branch of `readObsBounds` to the inclusive native interval domain `1..2147483647`, selecting the existing `5000` seed for every rejected value rather than clamping. In `readCaptureOff`, classify only a non-proxy object's own data descriptor with exact string `ENOENT` as ON; every other thrown value is OFF. Extend the existing FIX-07 integration test with native real-timer, launch-path, query, and hostile-error REDs.

**Tech Stack:** TypeScript, repository-pinned Node.js 22.23.1 native timers and `node:util/types`, `fs/promises.lstat`, Vitest, PostgreSQL 18.4, `pg`, existing embedded-PostgreSQL fixture.

**Spec:** `docs/missions/observability-agents/slices/FIX-07/SPEC-v7.md`

## Global constraints

- Apply to reviewed FIX-07 implementation HEAD `3591ccd2c489729c705fb8b31dbf60327bc68439` or a descendant with the same ten-path implementation ledger. It must descend from FIX-01 `24d0b3e5de84876b6b46fa84b13a0a42aa2640a4`.
- `readObsBounds()` remains the sole numeric/default authority. It preserves only safe integers `1..2147483647`. Absent, empty, malformed, fractional, zero, negative, `2147483648`, `Number.MAX_SAFE_INTEGER`, unsafe, and larger values select `5000`.
- Overflow selects `5000`; it is never clamped to `2147483647`. Clamping can hide heartbeat failure for about 24.8 days.
- The shared command loader still transports every optional raw string unchanged. The existing eleven raw rows still execute across seven real CLI contexts: exactly 77 loader calls, captures, terminal outcomes, fixture rows, and cadence restorations, plus 33 provider sentinels.
- Parent canonical decimal, command echo, API child, runner child, scheduler environment, final runtime timer argument/effective delay, and query bind must agree.
- The exact timer ceiling is preserved. The first overflow and maximum-safe value canonicalize and query as `5000`.
- `readCaptureOff` is total as an exported direct promise. Only an ordinary non-proxy own data descriptor whose value is exact string `ENOENT` returns false. Accessors, proxies, primitives, inherited/missing/non-string/other codes, descriptor failure, and all other thrown values return true.
- Error classification reads no raw thrown-value property, invokes no accessor or proxy trap, emits no thrown value, and performs no filesystem operation beyond the existing single asynchronous `lstat`.
- Retain exactly one `setInterval` in `runtime/index.ts`, one `controlInFlight`, one `flushInFlight`, and every pre-install/cutover/lease contract from SPEC-v7.
- Relative to reviewed implementation HEAD, modify only:
  - `packages/obs-capture/src/runtime/config.ts`;
  - `packages/obs-capture/src/runtime/control.ts`;
  - `tests/integration/fix07-off-switch.test.ts`.
- Migration `0063_fix07_writer_health_upsert.sql`, its three grants, `runtime/index.ts`, `runtime/sink.ts`, `health.ts`, the passive register property, launchers, installers, capture core, standing tests, package graph, and product source remain byte-identical.
- No migration, schema, grant, dependency, public option, new timer, long-delay scheduler, product/test-support/standing-test file, Hermes, merge, push, board, or V-owned production act.
- V production marker, query, veto, and acceptance remain unperformed.

## File map

**Modify:**

- `packages/obs-capture/src/runtime/config.ts` — add a flush-deadline-only upper-bound canonicalizer; preserve the queue-capacity parser and five-field `ObsBounds` interface.
- `packages/obs-capture/src/runtime/control.ts` — replace raw `error.code` access with guarded proxy rejection and descriptor-only ENOENT classification.
- `tests/integration/fix07-off-switch.test.ts` — update canonical expectations; add direct hostile-error, real Node timer, real API/runner launch, no-storm, and query-domain proofs.

**Read and hash without editing:**

- `packages/obs-capture/src/runtime/index.ts` and `sink.ts`;
- `packages/obs-capture/src/health.ts`;
- `packages/register/src/runtime-environment.ts`;
- `apps/runner/src/dev-api-process.ts`, `dev-runner-process.ts`, and `dev-auth-stack.ts`;
- `packages/obs-capture/src/{emit,flusher,queue,spool}.ts` and all three installers;
- `migrations/0063_fix07_writer_health_upsert.sql`;
- `tests/integration/fix07-heartbeat.test.ts`, `tests/unit/fix07-gap-classes.test.ts`, every FIX-01 test, and S01 foundation.

## Requirement trace

| Requirement | Plan coverage | Evidence |
|---|---|---|
| P1 canonical domain | Tasks 1–2 | exact `2147483647`/`2147483648`/MAX_SAFE table |
| P1 executable timer | Task 1 | actual returned Node timer and 30 ms callback count across direct/API/runner paths |
| P1 end-to-end equality | Tasks 1 and 3 | command/children/scheduler/runtime/query exact echoes |
| P1 one timer/no storm | Tasks 1 and 3 | one source call, one registration, zero short-window callbacks |
| P3 total direct probe | Tasks 1–2 | resolves true for hostile values, zero getter/trap reads; lawful ENOENT false |
| Prior PASS contracts | Tasks 0 and 3 | focused x3, 77 callers, grants/bounds, FIX-01/S01, adjacent and standing baselines |
| Exact scope/0063 | Tasks 0 and 3 | unchanged migration hash/grants and three-path correction diff |

## RED and mutant matrix

| ID | Planted/current behavior | Required failure |
|---|---|---|
| RED-07-14 | Current safe-integer parser accepts `2147483648`/MAX_SAFE | Node stores `1` and enters callbacks during 30 ms |
| RED-07-15 | Overflow is clamped to `2147483647` | canonical/query echo expected `5000`, so clamp remains RED |
| RED-07-16 | Ceiling check uses `< 2147483647` | exact ceiling expected preserved, so off-by-one remains RED |
| RED-07-17 | Query still admits through MAX_SAFE | raw `2147483648`/MAX_SAFE yields three rows instead of failed evidence |
| RED-07-18 | A second timer or scheduling loop is added | source count or actual registration count differs from one |
| RED-07-19 | Catch reads `error.code` | throwing getter rejects and read count becomes one |
| RED-07-20 | Descriptor logic omits non-trapping proxy rejection | proxy descriptor trap runs or forged ENOENT returns false |
| RED-07-21 | Accessor descriptor is invoked | getter count becomes nonzero or direct promise rejects |
| RED-07-22 | Every error is OFF | lawful own-data ENOENT resolves true instead of false |

---

### Task 0: Pin review base, Node source, scope, and green controls

**Files:** read only.

**Interfaces:**

- Consumes: SPEC-v7, PLAN-v7, fresh Sol review, implementation report, reviewed implementation HEAD, Node 22 built-in timer source.
- Produces: exact pre-change RED evidence, hashes, and preserved-baseline ledger.

- [ ] **Step 0.1: Verify the reviewed implementation base and source ledger**

Run in the implementation worktree:

```bash
test "$(git rev-parse HEAD)" = "3591ccd2c489729c705fb8b31dbf60327bc68439"
git merge-base --is-ancestor 24d0b3e5de84876b6b46fa84b13a0a42aa2640a4 HEAD
git diff --name-only a84b810653ed264dac807a94587f1dd86cdbc71f..HEAD
git status --short
```

Expected: clean reviewed HEAD; FIX-01 is an ancestor; the diff is exactly the ten SPEC-v7 paths. STOP if the implementation differs.

- [ ] **Step 0.2: Read Node's pinned native timer authority and reproduce RED-07-14**

Read `process.binding("natives")["internal/timers"]` and `process.binding("natives").timers`. Assert/document:

```text
Node 22.23.1
TIMEOUT_MAX = 2 ** 31 - 1
Timeout constructor: after > TIMEOUT_MAX -> warning and after = 1
setInterval -> new Timeout(callback, repeat, ..., true, true)
```

Run the real `startCaptureRuntime` with a wrapper around the real `setInterval` that records the requested number, the returned timer's `_idleTimeout`, and callback entries for 30 ms. Current expected evidence:

```text
2147483647 -> requested 2147483647, stored 2147483647, callbacks 0
2147483648 -> requested 2147483648, stored 1, callbacks > 0
9007199254740991 -> requested 9007199254740991, stored 1, callbacks > 0
```

This is RED evidence. Do not edit production during this step.

- [ ] **Step 0.3: Pin the direct-control counterexample and safe discriminator**

Inspect `runtime/control.ts` and confirm the current catch reads `error.code`. Probe an error with a throwing `code` getter; record direct classification rejection and one getter read. Separately probe:

```ts
import { isProxy } from "node:util/types";

function isOwnDataEnoent(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  try {
    if (isProxy(error)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== undefined
      && Object.prototype.hasOwnProperty.call(descriptor, "value")
      && typeof descriptor.value === "string"
      && descriptor.value === "ENOENT";
  } catch {
    return false;
  }
}
```

Expected: a real missing-path Node error has own data `code: "ENOENT"`; accessor and proxy inputs classify as not-ENOENT with zero getter/`get`/descriptor-trap reads.

- [ ] **Step 0.4: Record preserved green controls before editing**

Run and retain exact output:

```bash
pnpm exec vitest run tests/integration/fix07-off-switch.test.ts -t "carries every raw cadence through all seven real CLI loader contexts"
pnpm exec vitest run tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts -t "authenticated replica writers|grants only|state reads|elapsed effective cadence boundaries"
pnpm exec vitest run tests/unit/fix01-*.test.ts tests/integration/fix01-*.test.ts tests/architecture/fix01-*.test.ts tests/integration/obs-l1-s01-foundation.test.ts
```

Expected reviewed evidence: caller test green with exact internal 77/77 and 33 provider sentinels; PostgreSQL grant/boundary selection green; FIX-01/S01 `11 files / 194 tests` green.

- [ ] **Step 0.5: Hash every correction-frozen path**

Run `git hash-object` on migration 0063, `runtime/index.ts`, `runtime/sink.ts`, `health.ts`, register runtime environment, all launchers/installers/capture-core files, root package/lockfile, FIX-07 heartbeat/gap tests, FIX-01/S01 tests, and standing tests. Retain hashes for Task 3. The correction preimage hashes for `config.ts`, `control.ts`, and the off-switch test are recorded separately.

### Task 1: Add genuine RED tests for the native domain and total OFF probe

**Files:**

- Modify: `tests/integration/fix07-off-switch.test.ts`

**Interfaces:**

- Consumes: real `readObsBounds`, real command loader, real API/runner environment assemblers, real `startCaptureRuntime` timer registration, mockable `lstat`.
- Produces: RED-07-14 through RED-07-22.

- [ ] **Step 1.1: Retain the eleven raw rows and adjust only canonical expectations**

Keep the existing `cadenceCases` length at eleven so the nested seven-caller proof stays 77. Change only maximum-safe's effective value:

```ts
["maximum safe", "9007199254740991", "9007199254740991", 5_000],
```

Keep unsafe overflow `9007199254740992 -> 5000` and every prior row. Add a separate table:

```ts
const nativeTimerCases = [
  ["ceiling", "2147483647", 2_147_483_647],
  ["first overflow", "2147483648", 5_000],
] as const;
```

Assert direct `readObsBounds().flushDeadlineMs` matches both rows and MAX_SAFE maps to `5000`. Run the direct canonical test and observe RED at maximum-safe and first overflow.

- [ ] **Step 1.2: Add direct hostile-error tests with zero-read counters**

Add an async helper that resets modules, mocks only `node:fs/promises.lstat` to throw the supplied value, imports the real control module, calls `readCaptureOff("/tmp/fix07-hostile-marker")`, and asserts one `lstat` call. Ensure `afterEach` un-mocks `node:fs/promises`.

Use ordinary own-data ENOENT:

```ts
const enoent = Object.defineProperty(new Error("missing"), "code", {
  value: "ENOENT",
  enumerable: true,
  configurable: true,
});
await expect(readCaptureOffFromFailure(enoent)).resolves.toBe(false);
```

Then use:

```ts
let getterReads = 0;
const accessor = Object.defineProperty(new Error("accessor"), "code", {
  get() {
    getterReads += 1;
    throw new Error("CODE_ACCESSOR_TRAP");
  },
  configurable: true,
});

const trapReads = { get: 0, descriptor: 0 };
const proxy = new Proxy(
  Object.defineProperty(new Error("proxy"), "code", {
    value: "ENOENT",
    configurable: true,
  }),
  {
    get() {
      trapReads.get += 1;
      throw new Error("CODE_GET_TRAP");
    },
    getOwnPropertyDescriptor() {
      trapReads.descriptor += 1;
      throw new Error("CODE_DESCRIPTOR_TRAP");
    },
  },
);

await expect(readCaptureOffFromFailure(accessor)).resolves.toBe(true);
expect(getterReads).toBe(0);
await expect(readCaptureOffFromFailure(proxy)).resolves.toBe(true);
expect(trapReads).toEqual({ get: 0, descriptor: 0 });
```

Also table-test `undefined`, `null`, string `"ENOENT"`, number, symbol, missing code, inherited ENOENT, numeric ENOENT-like code, and own data `EACCES`; all resolve true. Read the production source and require `isProxy` plus `getOwnPropertyDescriptor` while rejecting raw `error.code`. Current code must reject the accessor case and record one getter read.

- [ ] **Step 1.3: Add one real-timer launch matrix**

Extend `loadRuntimeHarness` with an option that uses the actual imported `readObsBounds` while retaining its existing isolated sink/control/emitter fixtures. Do not restate the parser in the harness.

For each `nativeTimerCases` row:

1. Direct path: place the raw row value in `process.env` and start the real runtime.
2. API path: canonicalize the raw parent value with real `readObsBounds`, export its decimal, call the real command loader, drive real `startDevelopmentApiProcess` to its captured child environment, and start the runtime under that child cadence.
3. Runner path: repeat through real `startDevelopmentRunnerProcess` and its captured child environment.

Wrap, rather than fake, `globalThis.setInterval`. The wrapper calls the original native interval, increments a callback-entry counter before invoking the runtime callback, and records:

```ts
type NativeTimerObservation = {
  requestedDelay: number;
  storedDelay: number;
  callbackEntries: number;
  registrations: number;
};

storedDelay = (
  timer as NodeJS.Timeout & { readonly _idleTimeout: number }
)._idleTimeout;
```

Wait 30 ms using a saved real `setTimeout`, stop the runtime, and assert for all six rows:

```text
ceiling: canonical/requested/stored = 2147483647
overflow: canonical/requested/stored = 5000
registrations = 1
callbackEntries = 0
```

Assert command, captured child, runtime canonical decimal, and query echo match the same expected string. In particular, overflow query echo is `5000`. Read `runtime/index.ts` and assert exactly one `setInterval(` token. Current code must be RED on all three overflow paths with stored delay `1` and repeated callback entry.

- [ ] **Step 1.4: Narrow the test query domain and add PostgreSQL boundaries**

Change only the query guard:

```sql
WHERE flush_interval_ms BETWEEN 1 AND 2147483647
```

Retain 4999/5000/5000.001, 7249/7250/7250.001, and the 6000 ms contrast. Replace the prior maximum-safe-live row with:

```text
raw 2147483647, age 30000 -> bind 2147483647 -> QUIET
raw 2147483647, age 2147483647 -> QUIET
raw 2147483647, age 2147483647.001 -> OFF
raw 2147483648 -> canonical/query echo 5000
raw MAX_SAFE -> canonical/query echo 5000
```

Pass raw query binds `2147483648`, MAX_SAFE, unsafe overflow, zero, negative, fraction, and missing. They must error or return other than exactly three rows, never accepted QUIET evidence. The acceptance path must bind canonical `5000` for overflow, not a rejected raw value.

- [ ] **Step 1.5: Run the RED cluster**

Run:

```bash
pnpm exec vitest run tests/integration/fix07-off-switch.test.ts
```

Expected before production edits: failures show maximum-safe/first-overflow canonical values remain above the ceiling; actual returned timers store `1` and enter callbacks; hostile accessor rejects or increments its getter count. The lawful ENOENT and all prior unrelated tests remain green. Save the failing identifiers.

### Task 2: Implement the two minimal production corrections

**Files:**

- Modify: `packages/obs-capture/src/runtime/config.ts`
- Modify: `packages/obs-capture/src/runtime/control.ts`

**Interfaces:**

- Produces: native-timer-safe `ObsBounds.flushDeadlineMs`; total descriptor-only `readCaptureOff`.
- Preserves: queue capacity parser, `ObsBounds` shape, runtime scheduling, launch transport, and marker path.

- [ ] **Step 2.1: Add a flush-deadline-only ceiling**

Keep `positiveInteger` unchanged for `queueCapacity`. Add:

```ts
const NATIVE_TIMER_MAX_MS = 2_147_483_647;

function nativeTimerDelay(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
      && parsed > 0
      && parsed <= NATIVE_TIMER_MAX_MS
    ? parsed
    : fallback;
}
```

Use `nativeTimerDelay` only for `flushDeadlineMs`. Do not export a new public field, clamp, parse in the register loader, or change any other bound.

- [ ] **Step 2.2: Make thrown-value classification descriptor-only and fail closed**

In `runtime/control.ts` add:

```ts
import { isProxy } from "node:util/types";

function isOwnDataEnoent(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  try {
    if (isProxy(error)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== undefined
      && Object.prototype.hasOwnProperty.call(descriptor, "value")
      && typeof descriptor.value === "string"
      && descriptor.value === "ENOENT";
  } catch {
    return false;
  }
}
```

The `lstat` catch becomes:

```ts
  } catch (error) {
    return !isOwnDataEnoent(error);
  }
```

Do not export the classifier, touch a raw property, invoke a descriptor getter, stringify/log/rethrow the thrown value, or add another filesystem call.

- [ ] **Step 2.3: Run the focused GREEN cluster**

Run:

```bash
pnpm exec vitest run tests/integration/fix07-off-switch.test.ts tests/integration/fix07-heartbeat.test.ts tests/unit/fix07-gap-classes.test.ts
```

Expected: all three files pass; expected final count after the two new tests is `36 tests`. Record actual count and stop on any failure.

- [ ] **Step 2.4: Kill and restore every harmful/inverse mutant**

Use only a disposable copy, restoring between mutations:

1. Remove the ceiling from `nativeTimerDelay`: RED-07-14 observes 1 ms/storm.
2. Return `NATIVE_TIMER_MAX_MS` for overflow: RED-07-15 observes wrong canonical/query echo even though short-window callbacks are zero.
3. Change `<=` to `<`: RED-07-16 rejects the exact boundary.
4. Restore query guard through MAX_SAFE: RED-07-17 accepts an out-of-domain raw bind.
5. Add a second `setInterval` registration: RED-07-18 fails source/behavior count.
6. Replace descriptor classification with `error.code !== "ENOENT"`: RED-07-19 rejects and reads once.
7. Remove `isProxy`: RED-07-20 invokes the descriptor trap or trusts forged proxy ENOENT.
8. Invoke `descriptor.get`: RED-07-21 increments getter count or rejects.
9. Return true for own-data ENOENT: RED-07-22 fails the lawful inverse.

After each kill, restore the exact production source. Run the focused cluster once more after restoration.

- [ ] **Step 2.5: Commit the correction implementation**

Stage exactly:

```bash
git add packages/obs-capture/src/runtime/config.ts packages/obs-capture/src/runtime/control.ts tests/integration/fix07-off-switch.test.ts
git diff --cached --check
git diff --cached --name-only
git commit -m "fix(obs): FIX-07 C5 — bound native cadence and totalize OFF probe"
```

Expected staged path count: three. No migration, runtime/index, register, launcher, product, or standing-test path.

### Task 3: Re-run every preserved authority and scope gate

**Files:** read only after C5.

**Interfaces:**

- Consumes: C5 HEAD and all Task 0 baselines/hashes.
- Produces: fresh implementation report for independent Sol authority review.

- [ ] **Step 3.1: Run focused FIX-07 three times**

```bash
for run in 1 2 3; do
  pnpm exec vitest run tests/unit/fix07-gap-classes.test.ts tests/integration/fix07-heartbeat.test.ts tests/integration/fix07-off-switch.test.ts || exit 1
done
```

All three runs must pass. Record the worst duration and exact file/test totals.

- [ ] **Step 3.2: Re-run the exact 77 caller and PostgreSQL controls**

Run the targeted 77-caller case and require its summary to remain:

```text
loaderCalls=77
exactCaptures=77
sentinels=77
providerSentinels=33
exactTerminalOutcomes=77
fixtureRows=77
cadenceRestorations=77
deploymentConstructions=11
deploymentEnds=11
```

Run the real PostgreSQL heartbeat/grant suite and the cadence-boundary/query tests. Require the same nine column grants, no table-wide privilege, both direct `42501` inverse probes, conflict serialization, and the new query domain/boundaries.

- [ ] **Step 3.3: Re-run FIX-01/S01 and adjacent cadence suites**

```bash
pnpm exec vitest run tests/unit/fix01-*.test.ts tests/integration/fix01-*.test.ts tests/architecture/fix01-*.test.ts tests/integration/obs-l1-s01-foundation.test.ts
pnpm exec vitest run tests/architecture/dev-local-auth-topology-spec.test.ts tests/architecture/p3-production-database-principals.test.ts tests/architecture/s12-contract.test.ts tests/architecture/s6-content-encryption-contract.test.ts tests/architecture/s9-dev-token-retirement-contract.test.ts tests/integration/dev-api-environment.test.ts tests/integration/dev-api-process.test.ts tests/unit/dev-runner-process.test.ts tests/unit/crypto.test.ts tests/unit/identity-crypto.test.ts
```

Expected reviewed baselines: `11 files / 194 tests` and `10 files / 52 tests`. Any new failure stops handoff.

- [ ] **Step 3.4: Compare standing and repository-wide known baselines**

Run PLAN-v7's exact thirteen-file standing suite. Final failing identifiers must be a subset of the recorded base identifiers and failure count may not increase. Run `pnpm typecheck`, `pnpm audit:source`, and `pnpm audit:architecture` and compare to the exact reviewed-base outputs: eight existing S14 type diagnostics, five existing source-audit process-environment blockers, and missing `web/package.json`. Do not claim those commands green; require no new or changed diagnostic. Run `pnpm audit:text-bytes` and require `REPOSITORY_TEXT_CONTROL_BYTES=0`.

- [ ] **Step 3.5: Prove exact scope and frozen bytes**

Require:

- correction commit diff from reviewed HEAD has exactly the three authorized paths;
- full FIX-07 authority-base-to-HEAD ledger remains exactly ten paths;
- migration 0063 hash and exact three grants are unchanged;
- all Task 0 frozen hashes are unchanged;
- `runtime/index.ts` contains exactly one `setInterval` and no new scheduler;
- register still contains exactly one passive `OBS_FLUSH_DEADLINE_MS: z.string().optional()`;
- `health.ts` still has exactly the five FIX-07 semantic additions;
- no new external dependency or forbidden import, product byte, standing test, test-support file, migration claim, or Hermes path; `node:util/types.isProxy` is the sole authorized new built-in import;
- `git diff --check` exits zero.

Repeat the all-ref/all-worktree 0063 collision scan without reading or writing Hermes. There must still be one reachable/on-disk 0063 allocation, this FIX-07 migration.

- [ ] **Step 3.6: Handoff for fresh Sol authority review**

Report reviewed base, C5 SHA, final HEAD, exact three-path correction diff, ten-path total ledger, Node source/probe evidence, direct/API/runner timer observations, canonical/query echoes, P3 zero-read matrix, focused worst run, exact 77 caller counts, PostgreSQL grant/boundary results, FIX-01/S01 and adjacent results, known-baseline comparisons, frozen hashes, and collision counts. End with:

```text
V production marker, query, veto, and acceptance remain unperformed.
```

## Transaction and ordering semantics retained from PLAN-v7

- Each health upsert remains one PostgreSQL autocommit statement with server clocks and primary-key conflict serialization.
- Stop writes no component health. Shared lease expiry represents all replicas stopped.
- Gate assignment and queue drain remain synchronous in one JavaScript turn.
- `controlInFlight` and `flushInFlight` remain independent; the existing one interval is the only recurring scheduler.
- Canonical timer delay, actual Node timer delay, shared lease bound, and query bind are one value.
- The one-minute cutoff remains only for gap/occurrence evidence.
- Command loader transport remains raw and passive for ordinary callers; acceptance canonicalizes before child assembly.
- Only lawful ordinary own-data ENOENT opens the direct marker gate after `lstat` failure; every ambiguous or hostile failure keeps it OFF.
- Period precedence remains `OFF > BLIND > ACTIVE > QUIET`.
- Query failure, invalid cadence, mismatch, or other-than-three ordered rows is no proof.

## Stop conditions

Stop before editing or at the first conflict if:

- reviewed implementation HEAD/ledger or FIX-01 ancestry differs;
- config correction would change queue capacity, `ObsBounds` shape, another environment key, or require a second canonicalizer;
- any accepted delay can exceed `2147483647` or overflow would be clamped rather than defaulted;
- runtime/index, a launcher, the passive register field, installer, package, public option, or second timer must change;
- total OFF classification cannot avoid raw thrown-value access and hostile getter/proxy/descriptor execution;
- lawful own-data ENOENT cannot remain ON while every other failure is OFF;
- query/runtime/child canonical equality cannot be proved before period interpretation;
- migration 0063, its grants, schema, role authority, or any path beyond the three correction paths must change;
- a prior FIX-07, FIX-01/S01, product-invariance, grant, caller, standing-baseline, or scope contract regresses;
- any requested act would touch Hermes or assert/substitute for V's production acceptance.
