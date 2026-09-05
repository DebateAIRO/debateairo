# ObservationAgent Grok Round-1 Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Grok 4.6 round-1 findings B1-B2 and N1-N9 while preserving ObservationAgent's module ownership, privacy wall, explicit suspected-defect boundary, and all frozen OBS-01 through OBS-07 behavior.

**Architecture:** The repair makes paths explicit, journals lifecycle identity before routing, restores state before the first probe, stores detector clocks in fixed-capacity sample-ring slots, and routes all database access through one max-two-session pool. OBS-04 and OBS-07 retain ownership of their capture/channel/status meanings; shared core supplies only strict typed durability and resource boundaries.

**Tech Stack:** TypeScript 7, Node.js 22, Zod 4, Vitest 4, pnpm 11, PostgreSQL 18.6, append-and-fsync JSONL journals, atomic JSON snapshots, launchd on macOS.

**Spec:** `docs/superpowers/specs/2026-09-05-observationagent-grok-r1-repairs-design.md`

## Global Constraints

- ObservationAgent only. Do not implement or modify FixAgent or SupportAgent.
- Never fetch, inspect, compare, comment on, modify, merge, or close PR #8/security-hardening.
- No push, merge, live numbered V acceptance, real Hermes/sendmail/osascript call, credential access, service install/start/restart, or product-process/container mutation.
- Work only in the isolated repair worktree and exact branch/parent named in the execution brief. Abort on a dirty or unexpected base.
- Every code task is performed by a fresh exact GPT-5.6-sol worker. A worker may not spawn another implementer.
- Each task begins with an intended focused RED, reaches focused GREEN, kills the listed reversible mutants, restores exact SHA-256 bytes, runs its inherited regression, and creates one bounded local commit.
- The controller reads every complete diff and reruns the task gate before advancing the branch.
- Use `apply_patch` for tracked edits. Preserve unrelated and pre-existing work.
- Keep the four-key ObservationAgent environment exact; add no environment variable.
- Keep `suspected_defect=true` confined to explicit OBS-03 defect detector intents. Delivery, status, capture, infrastructure, capacity, and agent-self health remain non-defect.
- Preserve signal journal fsync before routing, delivery ATTEMPT fsync before effect, RESULT fsync before mirror, append-only signal/delivery rows, Docker's read-only argv table, Hatchet REST-only access, and the error-capture privacy boundary.
- Do not store or transmit raw error messages, stacks, prompts, responses, SQL text, payloads, cookies, tokens, emails, user identities, or arbitrary product strings.
- No task may claim numbered V acceptance. Grok PASS and V veto/integration remain later gates.

---

## File Structure

### Shared foundation

- Create `apps/observation-agent/src/core/paths.ts`: code-derived repo root and branded repo-relative path resolution.
- Create `apps/observation-agent/src/core/threshold-cache.ts`: strict atomic last-ratified policy cache and database/cache boot selection.
- Create `apps/observation-agent/src/journal/records.ts`: strict legacy/v2 journal decoding and chronological replay.
- Create `apps/observation-agent/src/core/lifecycle.ts`: normalized durable OPEN records and module restoration types.
- Create `apps/observation-agent/src/core/database.ts`: the only daemon pool and restricted query-session port.
- Modify `apps/observation-agent/src/core/types.ts`: repo-root, database-port, and lifecycle hooks in module contracts.
- Modify `apps/observation-agent/src/core/runtime.ts`: restoration before first probe and shared database context.
- Modify `apps/observation-agent/src/journal/journal.ts`: v2 signal envelope writes and strict reads.
- Modify `apps/observation-agent/src/store/pipeline.ts`: carry lifecycle metadata through journal-before-mirror persistence.
- Modify `apps/observation-agent/src/main.ts`: corrected boot order, cache/replay/restoration, shared pool, and core-liveness restoration.

### Finding owners

- Modify `apps/observation-agent/bin/launch.sh`, `modules/certificate-capacity/{module,reader}.ts`, `modules/channels-sendmail/sendmail.ts`, and `modules/routing/module.ts`: B1 paths.
- Modify `modules/routing/{module,router}.ts` and `modules/status-page/module.ts`: B2, N3, N5, N7.
- Create `modules/routing/delivery-health.ts`: restart-safe three-channel non-defect health.
- Create `modules/stall-detectors/clock-store.ts`: fixed-slot READY/progress clocks for N2.
- Modify all stateful tracker/module pairs named in Task 5: N1 restoration.
- Modify `modules/capture-health/{tracker,daily,module}.ts`, `modules/spool-health/{module,scan,tracker}.ts`, and `targets.dev.d/OBS-04.json`: N4, N8, N9.
- Modify every daemon database reader named in Task 6: N6 shared pool.

### New focused tests

- Create `tests/unit/obs-agent-01-paths.test.ts`.
- Create `tests/unit/obs-agent-01-threshold-cache.test.ts`.
- Create `tests/unit/obs-agent-01-journal-replay.test.ts`.
- Create `tests/integration/obs-agent-01-restart-lifecycle.test.ts`.
- Create `tests/integration/obs-agent-01-session-budget.test.ts`.
- Create `tests/integration/obs-agent-03-clock-store.test.ts`.
- Create `tests/unit/obs-agent-07-delivery-health.test.ts`.
- Create `tests/integration/obs-agent-07-status-recovery.test.ts`.
- Create `tests/integration/obs-agent-04-daily-restart.test.ts`.

Existing slice tests may be extended only where listed below. Acceptance helpers remain stimulus-only and are not executed as live V acceptance.

---

### Task 0: Establish the isolated baseline and execution ledger

**Files:**
- Read: the approved spec, this plan, Grok r1 verdict, ObservationAgent requirements/compass, master plan, and OBS-01 through OBS-07 SPEC/PLAN/DECISIONS.
- Create outside the repository: `.superpowers/sdd/PLAN-ObservationAgent/grok-r1-repairs-progress.md`.

**Interfaces:**
- Consumes: design commit `4b75fd891a0871f24ccef34a271344306dab1936` on parent `b3d9d689e508d523d43f00c5be6e0356623e96ae`.
- Produces: an exact baseline receipt and per-task commit ledger.

- [ ] **Step 1: Verify branch custody**

```bash
git status --porcelain=v1 -uall
git rev-parse HEAD HEAD^
git branch --show-current
git rev-list --count b3d9d689e508d523d43f00c5be6e0356623e96ae..HEAD
```

Expected: empty porcelain; HEAD `4b75fd891a0871f24ccef34a271344306dab1936`; parent `b3d9d689e508d523d43f00c5be6e0356623e96ae`; branch `codex/observationagent-grok-r1-repairs`; count `1`.

- [ ] **Step 2: Verify ignored dependencies without installing or changing a lockfile**

```bash
test -d node_modules
test -x node_modules/.bin/vitest
git status --porcelain=v1 -uall
```

Expected: dependencies exist as an ignored local copy and porcelain remains empty. If absent, stop for the controller to copy the already-verified ignored dependency tree; do not use the network.

- [ ] **Step 3: Run the exact inherited baseline**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-0[1-7]-*.test.ts \
  tests/integration/obs-agent-0[1-7]-*.test.ts \
  tests/architecture/obs-agent-0[1-7]-*.test.ts \
  --reporter=verbose --maxWorkers=1
pnpm run generate:contract
pnpm exec tsc -p apps/observation-agent/tsconfig.json --noEmit
pnpm -C apps/observation-agent exec tsc -p tsconfig.json --noEmit
```

Expected: 82 files/274 tests pass; contract and both ObservationAgent TypeScript commands exit 0. Record environmental sandbox failure separately and rerun only with the established local disposable-Postgres permission; never use a real product database.

- [ ] **Step 4: Write the execution ledger**

The ledger records exact base/head, baseline counts, task status, commit SHA, RED/GREEN/mutant evidence, controller gate, and unresolved concerns. It must state all live/external/PR #8 prohibitions. This is a controller artifact, not a production commit.

---

### Task 1: Make configured repo paths cwd-independent and correct exact status ownership

**Files:**
- Create: `apps/observation-agent/src/core/paths.ts`
- Modify: `apps/observation-agent/bin/launch.sh`
- Modify: `apps/observation-agent/src/core/types.ts`
- Modify: `apps/observation-agent/src/core/runtime.ts`
- Modify: `apps/observation-agent/src/main.ts`
- Modify: `apps/observation-agent/src/modules/certificate-capacity/module.ts`
- Modify: `apps/observation-agent/src/modules/certificate-capacity/reader.ts`
- Modify: `apps/observation-agent/src/modules/channels-sendmail/sendmail.ts`
- Modify: `apps/observation-agent/src/modules/routing/module.ts`
- Modify: `apps/observation-agent/src/modules/routing/router.ts`
- Test: `tests/unit/obs-agent-01-paths.test.ts`
- Test: `tests/unit/obs-agent-05-certificate.test.ts`
- Test: `tests/unit/obs-agent-07-sendmail.test.ts`
- Test: `tests/unit/obs-agent-07-routing.test.ts`
- Test: `tests/integration/obs-agent-01-supervision.test.ts`
- Test: `tests/integration/obs-agent-07-loopback.test.ts`

**Interfaces:**
- Consumes: validated raw target/configuration paths and existing module status projections.
- Produces:

```ts
export type ResolvedRepoPath = string & { readonly __resolvedRepoPath: unique symbol };
export function observationRepoRoot(): string;
export function resolveRepoPath(repoRoot: string, configuredPath: string): ResolvedRepoPath;
```

`ModuleProbeContext` and `RouterBootstrapInput` gain immutable `repoRoot:string`. Routing owns `storm`; status-page alone owns the loopback projection.

- [ ] **Step 1: Write cwd-sensitive RED tests**

Create a temporary repo-shaped directory with `apps/observation-agent`, `.local/dev-auth/tls/localhost.pem`, and `deploy/dev-auth/sendmail-capture.mjs`. Change the test cwd to the package directory inside `try/finally`, then assert:

```ts
expect(resolveRepoPath(repoRoot, ".local/dev-auth/tls/localhost.pem"))
  .toBe(join(repoRoot, ".local/dev-auth/tls/localhost.pem"));
expect(resolveRepoPath(repoRoot, "deploy/dev-auth/sendmail-capture.mjs"))
  .toBe(join(repoRoot, "deploy/dev-auth/sendmail-capture.mjs"));
```

Exercise the real certificate reader and sendmail executor dependency seam from that cwd. Assert `../escape`, `/absolute`, empty, and NUL input reject with `OBSERVATION_REPO_PATH_INVALID`.

- [ ] **Step 2: Add exact-status RED assertions**

Using the production router and stored-status renderer, assert:

```ts
expect(lines.filter((line) => line === "storm 5/60s")).toHaveLength(1);
expect(lines.filter((line) => line === "status http://127.0.0.1:9797/status"))
  .toHaveLength(1);
expect(lines).not.toContain("storm threshold 5/60s");
```

Run the focused command and record failures caused by cwd resolution, `storm.threshold`, and duplicate loopback ownership.

```bash
pnpm exec vitest run tests/unit/obs-agent-01-paths.test.ts \
  tests/unit/obs-agent-05-certificate.test.ts \
  tests/unit/obs-agent-07-sendmail.test.ts \
  tests/unit/obs-agent-07-routing.test.ts \
  tests/integration/obs-agent-01-supervision.test.ts \
  tests/integration/obs-agent-07-loopback.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement minimal path and ownership GREEN**

`observationRepoRoot()` derives the root from its module URL. `resolveRepoPath()` uses `resolve(repoRoot, configuredPath)`, requires `relative(repoRoot,resolved)` to be non-empty or a non-escaping child, and never consults cwd. Validate the existing raw literals before resolving them.

Change launch execution to:

```zsh
cd "$repo_root"
exec node --import tsx apps/observation-agent/src/main.ts
```

Pass `repoRoot` through runtime/router context. Certificate `read()` and sendmail `spawn()` receive only the branded absolute result. Change the router template key to `storm` and delete its loopback projection; retain the status-page projection.

- [ ] **Step 4: Run GREEN and kill three mutants**

Run the focused command three consecutive times. Separately mutate and prove RED for: returning the raw path, restoring `storm.threshold`, and restoring the routing loopback projection. Restore each changed file to its recorded SHA-256, then rerun GREEN.

- [ ] **Step 5: Run inherited slice gates and commit**

```bash
pnpm exec vitest run tests/unit/obs-agent-01-*.test.ts tests/integration/obs-agent-01-*.test.ts \
  tests/architecture/obs-agent-01-*.test.ts tests/unit/obs-agent-05-*.test.ts \
  tests/integration/obs-agent-05-*.test.ts tests/architecture/obs-agent-05-*.test.ts \
  tests/unit/obs-agent-07-*.test.ts tests/integration/obs-agent-07-*.test.ts \
  tests/architecture/obs-agent-07-*.test.ts --reporter=verbose --maxWorkers=1
pnpm exec tsc -p apps/observation-agent/tsconfig.json --noEmit
git diff --check
git add apps/observation-agent tests
git commit -m "fix(observation-agent): resolve paths and status ownership"
```

Expected: all named tests pass; one bounded commit; clean worktree after controller verification.

---

### Task 2: Add a strict last-ratified threshold fallback

**Files:**
- Create: `apps/observation-agent/src/core/threshold-cache.ts`
- Modify: `apps/observation-agent/src/main.ts`
- Modify: `apps/observation-agent/src/oactl/core/thresholds.ts`
- Test: `tests/unit/obs-agent-01-threshold-cache.test.ts`
- Test: `tests/integration/obs-agent-01-foundation.test.ts`
- Test: `tests/architecture/obs-agent-01-privacy.test.ts`

**Interfaces:**
- Consumes: the existing strict `RatifiedThresholdPolicy` returned by `ThresholdRepository.readCurrent()`.
- Produces:

```ts
export type ThresholdPolicySource = "DATABASE" | "LAST_RATIFIED_CACHE";
export class ThresholdPolicyCache {
  constructor(stateDir: string, expectedUid?: number);
  read(): Promise<RatifiedThresholdPolicy>;
  write(policy: RatifiedThresholdPolicy): Promise<void>;
}
export async function readBootThresholdPolicy(input: Readonly<{
  repository: Pick<ThresholdRepository, "readCurrent">;
  cache: ThresholdPolicyCache;
}>): Promise<Readonly<{ policy: RatifiedThresholdPolicy; source: ThresholdPolicySource }>>;
```

- [ ] **Step 1: Write strict cache and fallback RED tests**

Assert a successful repository read writes atomic `stateDir/thresholds/last-ratified.json` with mode `0600` and returns `DATABASE`. Assert a classified connection failure falls back to the exact cached version. Assert these all reject rather than fallback: reachable invalid policy, bad JSON, unknown field, wrong owner/mode, missing cache, and cache path symlink.

Use a fake repository whose failures include one known connection code (`ECONNREFUSED`) and one validation error. Do not make a network call.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run tests/unit/obs-agent-01-threshold-cache.test.ts \
  tests/integration/obs-agent-01-foundation.test.ts \
  tests/architecture/obs-agent-01-privacy.test.ts --reporter=verbose
```

Expected: new tests fail because the cache/selector do not exist.

- [ ] **Step 3: Implement atomic validated cache**

Reuse the authoritative threshold schema; do not duplicate or weaken it. Create `stateDir/thresholds` as `0700`; write sibling `last-ratified.<pid>.<uuid>.tmp` with `open(...,"wx",0o600)`, `sync`, close, rename to `last-ratified.json`, then fsync the directory and remove a failed temporary write. Before reading, `lstat` and require a regular non-symlink file, mode `0600`, and expected uid. Classify only connection/availability errors (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, SQLSTATE class `08`, `57P01`, `57P03`) as fallback-eligible.

Wire boot and successful reload to update the cache. Invalid database content must propagate even when a valid cache exists.

- [ ] **Step 4: Run GREEN and kill three mutants**

Run focused tests three times. Mutate separately: fallback on a validation error, accept mode `0644`, and prefer cache while database succeeds. Each must produce its intended RED and exact-byte restore.

- [ ] **Step 5: Commit**

```bash
git add apps/observation-agent/src/core/threshold-cache.ts \
  apps/observation-agent/src/main.ts apps/observation-agent/src/oactl/core/thresholds.ts \
  tests/unit/obs-agent-01-threshold-cache.test.ts \
  tests/integration/obs-agent-01-foundation.test.ts \
  tests/architecture/obs-agent-01-privacy.test.ts
git diff --cached --check
git commit -m "fix(observation-agent): cache ratified thresholds for restart"
```

---

### Task 3: Version and replay signal/delivery journals

**Files:**
- Create: `apps/observation-agent/src/journal/records.ts`
- Create: `apps/observation-agent/src/core/lifecycle.ts`
- Modify: `apps/observation-agent/src/journal/journal.ts`
- Modify: `apps/observation-agent/src/store/pipeline.ts`
- Modify: `apps/observation-agent/src/core/signals.ts`
- Test: `tests/unit/obs-agent-01-journal-replay.test.ts`
- Test: `tests/unit/obs-agent-01-journal.test.ts`
- Test: `tests/integration/obs-agent-01-delivery.test.ts`

**Interfaces:**
- Produces:

```ts
export type SignalLifecycleIdentity = Readonly<{ owner: string; correlationKey: string }>;
export type SignalJournalRecordV2 = Readonly<{
  record_version: 2; kind: "signal"; signal: ObservationSignal;
  lifecycle: null | Readonly<{ owner: string; correlation_key: string }>;
}>;
export type ReplayedOpenSignal = Readonly<{
  signal: ObservationSignal;
  lifecycle: SignalLifecycleIdentity | null;
}>;
export type ReplayedJournals = Readonly<{
  openSignals: readonly ReplayedOpenSignal[];
  deliveryResults: readonly DeliveryResultEnvelope[];
}>;
export async function replayObservationJournals(
  stateDir: string, validOwners: ReadonlySet<string>
): Promise<ReplayedJournals>;
```

`persistSignal` gains optional `lifecycle`; raw Postgres/digest/router consumers still receive `ObservationSignal`.

- [ ] **Step 1: Write replay RED tests**

Build daily files containing legacy raw signals and v2 envelopes. Assert chronological replay, original UUID preservation, CLEAR-by-exact-ID, delivery RESULT collection, and rejection of unknown version/owner/field, mismatched clear, malformed middle line, and duplicate live `(owner,correlationKey)`.

Assert one final non-newline partial JSON row is ignored, while the same malformed row before a later newline fails.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run tests/unit/obs-agent-01-journal-replay.test.ts \
  tests/unit/obs-agent-01-journal.test.ts \
  tests/integration/obs-agent-01-delivery.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement v2 append and backward-compatible replay**

Use strict Zod discriminated schemas. `ObservationJournal.appendSignal(signal,lifecycle)` fsyncs exactly one v2 record. `persistSignal` performs v2 journal fsync, then digest, then best-effort mirror. Existing delivery ATTEMPT/RESULT formats stay unchanged.

Replay applies signals by `signal_id`, verifies each CLEAR references a current compatible OPEN, and returns only unmatched OPENs. It never queries PostgreSQL or rewrites historical files.

- [ ] **Step 4: Run GREEN and kill four mutants**

Run focused tests three times. Mutate: drop lifecycle metadata, accept unknown version, ignore malformed middle row, and clear by `(component,class)` instead of UUID. Each must fail and restore exact bytes.

- [ ] **Step 5: Commit**

```bash
git add apps/observation-agent/src/journal apps/observation-agent/src/core/lifecycle.ts \
  apps/observation-agent/src/core/signals.ts apps/observation-agent/src/store/pipeline.ts \
  tests/unit/obs-agent-01-journal-replay.test.ts tests/unit/obs-agent-01-journal.test.ts \
  tests/integration/obs-agent-01-delivery.test.ts
git diff --cached --check
git commit -m "fix(observation-agent): replay durable signal lifecycles"
```

---

### Task 4: Restore core and module lifecycle before the first probe

**Files:**
- Modify: `apps/observation-agent/src/core/types.ts`
- Modify: `apps/observation-agent/src/core/modules.ts`
- Modify: `apps/observation-agent/src/core/runtime.ts`
- Modify: `apps/observation-agent/src/main.ts`
- Modify: `apps/observation-agent/src/modules/core-liveness/state.ts`
- Modify stateful tracker/module pairs:
  - `modules/expectations/{always,state}.ts`, `modules/product-liveness/{module,latency}.ts`
  - `modules/stall-detectors/{module,lifecycle,heartbeat}.ts`
  - `modules/capture-health/{module,tracker,gaps}.ts`
  - `modules/spool-health/{module,tracker}.ts`
  - `modules/host-capacity/{module,tracker}.ts`
  - `modules/postgres-capacity/{module,tracker}.ts`
  - `modules/certificate-capacity/{module,tracker}.ts`
  - `modules/provider-health/{module,tracker}.ts`
  - `modules/throughput/{module,tracker}.ts`
  - `modules/hatchet-throughput/{module,tracker}.ts`
  - `modules/witness/{module,state}.ts`
  - `modules/job-witness/{module,witness}.ts`
- Test: `tests/integration/obs-agent-01-restart-lifecycle.test.ts`
- Extend each owning slice lifecycle test.

**Interfaces:**
- Consumes: `ReplayedOpenSignal` from Task 3.
- Produces this optional module contract:

```ts
export type RestoredOpenSignal = Readonly<{
  correlationKey: string;
  signal: ObservationSignal;
}>;
export type ModuleLifecycle = Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(opens: readonly RestoredOpenSignal[]): void;
}>;
```

Runtime records new lifecycle as `{owner:module.name,correlationKey:intent.correlationKey}`. Core liveness uses owner `core-liveness`.

- [ ] **Step 1: Write restart RED tests**

For core liveness and one representative module, run:

```text
fault -> OPEN(id=A) -> reconstruct journal/runtime/module with database mirror throwing
      -> continuing fault -> recovery -> CLEARED(clears_signal_id=A)
```

Assert exactly one OPEN for `(component,class)`, no external reroute for a new UUID, and restoration happens before the initial self-start routing callback.

Add a legacy raw OPEN case. The owner resolver must derive a unique native correlation. An ambiguous legacy owner must stop probes and emit no replacement OPEN.

- [ ] **Step 2: Run representative RED**

```bash
pnpm exec vitest run tests/integration/obs-agent-01-restart-lifecycle.test.ts \
  tests/integration/obs-agent-01-liveness.test.ts \
  tests/integration/obs-agent-03-lifecycle.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement core restoration**

Discovery validates the optional lifecycle pair as one unit. Before any `probe`, runtime resolves legacy opens by asking all lifecycle owners; exactly one match is required. It loads the runtime open map, then calls each owner's `restore()` once. Runtime retains a second `(component,class)` guard and rejects any attempt to open a different correlation while that identity remains open.

Core liveness `restore()` initializes DOWN/open state with the original first-failed time so a healthy probe enters RECOVERING and the second success clears the original UUID.

- [ ] **Step 4: Add exact restoration to every stateful owner**

Each listed tracker receives a bounded `restore()` method that validates class/component/impact/ref fields and rebuilds only the state it already owns. Module `legacyCorrelationKey()` derives existing native keys from closed signal fields:

```text
STALL/QUEUE/SUSPICIOUS -> work_item_ref
NO_PROGRESS -> run_ref
capture -> validated runtime/spool evidence
capacity/throughput/provider -> impact code plus validated safe ref
liveness/expectation/witness/schedule -> component/class plus closed timestamp/job fields
```

An invalid owner/class pair throws `OBSERVATION_LIFECYCLE_RESTORE_INVALID`; it never guesses.

- [ ] **Step 5: Add per-owner restart tests and run GREEN**

Every stateful owner gets one continuing-fault/no-duplicate assertion and one immediate-recovery/clear-original assertion in its existing slice test. Run all OBS-01 through OBS-07 lifecycle/status tests three times.

- [ ] **Step 6: Kill four mutants and commit**

Mutate separately: restore after first probe, omit tracker restore, allocate a new clear target, and allow a second `(component,class)` OPEN. Prove the intended RED and exact restore.

```bash
git add apps/observation-agent/src tests
git diff --cached --check
git commit -m "fix(observation-agent): restore open state before probes"
```

---

### Task 5: Enforce one max-two-session daemon database port

**Files:**
- Create: `apps/observation-agent/src/core/database.ts`
- Modify: `apps/observation-agent/src/core/types.ts`
- Modify: `apps/observation-agent/src/core/runtime.ts`
- Modify: `apps/observation-agent/src/main.ts`
- Modify database readers:
  - `modules/core-liveness/probes.ts`
  - `modules/capture-health/queries.ts`
  - `modules/defect-interface/queries.ts`
  - `modules/spool-health/queries.ts`
  - `modules/postgres-capacity/query.ts`
  - `modules/throughput/module.ts`
  - `modules/provider-health/module.ts`
  - `modules/job-witness/witness.ts`
- Test: `tests/integration/obs-agent-01-session-budget.test.ts`
- Test: `tests/architecture/obs-agent-01-runtime.test.ts`
- Update the 17 module-context fixtures that currently supply `databaseUrl`.

**Interfaces:**
- Produces:

```ts
export type ObservationQueryClient = Pick<PoolClient, "query">;
export type ObservationDatabasePort = Readonly<{
  withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T>;
}>;
export function createObservationDatabasePort(pool: Pool): ObservationDatabasePort;
```

`ModuleProbeContext.database` is required. `databaseUrl` is removed from module production context after all readers migrate.

- [ ] **Step 1: Write construction and concurrency RED tests**

Architecture test requires exactly two `new pg.Pool` sites in `main.ts`: the bootstrap pool fixed at `max:1`, whose `end()` completes before daemon-pool construction, and the sole daemon pool capped at two. It rejects `new pg.Pool`/`new pg.Client` beneath `src/modules`.

Disposable-Postgres integration holds one shared-pool client, begins a module read through the port, queries `pg_stat_activity` from the fixture-admin connection, and asserts active ObservationAgent daemon sessions are `<=2`.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run tests/integration/obs-agent-01-session-budget.test.ts \
  tests/architecture/obs-agent-01-runtime.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement the shared port and migrate readers**

Main constructs:

```ts
const pool = new pg.Pool({
  connectionString: environment.OBSERVATION_DATABASE_URL,
  max: Math.min(2, policy.value.resources.max_database_sessions)
});
const database = createObservationDatabasePort(pool);
```

Runtime passes `database`. Readers use `withClient`; transaction-scoped `SET LOCAL ROLE pg_monitor` remains between `BEGIN` and `COMMIT/ROLLBACK`. No module can call `end()` or retain a client after its callback resolves.

- [ ] **Step 4: Run all database-bearing slice tests three times**

```bash
pnpm exec vitest run tests/integration/obs-agent-01-foundation.test.ts \
  tests/integration/obs-agent-03-*.test.ts tests/integration/obs-agent-04-*.test.ts \
  tests/integration/obs-agent-05-*.test.ts tests/integration/obs-agent-06-*.test.ts \
  tests/architecture/obs-agent-0[1-7]-*.test.ts --reporter=verbose --maxWorkers=1
```

- [ ] **Step 5: Kill three mutants and commit**

Mutate pool max to 3, restore one module-local pool, and allow a client to escape the callback. Each must fail the exact session/architecture assertion and restore bytes.

```bash
git add apps/observation-agent/src tests
git diff --cached --check
git commit -m "refactor(observation-agent): enforce database session budget"
```

---

### Task 6: Persist READY and NO_PROGRESS clocks in fixed sample-ring slots

**Files:**
- Create: `apps/observation-agent/src/modules/stall-detectors/clock-store.ts`
- Modify: `apps/observation-agent/src/modules/stall-detectors/detectors.ts`
- Modify: `apps/observation-agent/src/modules/stall-detectors/module.ts`
- Test: `tests/integration/obs-agent-03-clock-store.test.ts`
- Test: `tests/unit/obs-agent-03-detectors.test.ts`
- Test: `tests/integration/obs-agent-03-defect-detectors.test.ts`
- Test: `tests/integration/obs-agent-03-query-budget.test.ts`

**Interfaces:**
- Produces:

```ts
export type DetectorClocks = Readonly<{
  readyFirstObserved: ReadonlyMap<string, Date>;
  progressLastChanged: ReadonlyMap<string, Readonly<{ sequence: number; at: Date }>>;
  exhausted: ReadonlySet<"READY" | "PROGRESS">;
}>;
export class DetectorClockStore {
  constructor(database: ObservationDatabasePort, capacity?: number);
  reconcile(input: Readonly<{
    ready: readonly ReadyWorkItem[];
    progress: readonly InFlightRunProgress[];
    now: Date;
  }>): Promise<DetectorClocks>;
}
```

- [ ] **Step 1: Write restart/encoding RED tests**

Assert canonical UUID to decimal numeric and padded inverse round-trip values above `Number.MAX_SAFE_INTEGER`. Seed READY at `t0`, reconstruct at `t0+119s`, then evaluate at `t0+121s`; require one QUEUE_NOT_DRAINING whose `firstFailedProbeAt=t0`.

Seed run progress sequence 7 at `t0`, reconstruct, keep 7 through `t0+301s`; require NO_PROGRESS from `t0`. Increase to 8 and require the clock moves to the increase time.

- [ ] **Step 2: Add slot safety RED tests**

With capacity 2, prove current IDs retain slots, a departed ID's slot may be reused, a current ID is never overwritten, and a third concurrent ID marks the affected detector exhausted/INELIGIBLE without a defect intent. Assert only the fixed keys `runner.ready_identity`, `runner.progress_identity`, and `runner.progress_sequence` are written.

- [ ] **Step 3: Run RED and implement minimal GREEN**

```bash
pnpm exec vitest run tests/integration/obs-agent-03-clock-store.test.ts \
  tests/unit/obs-agent-03-detectors.test.ts \
  tests/integration/obs-agent-03-defect-detectors.test.ts --reporter=verbose
```

Implement UUID conversion with `BigInt`, send decimal strings to `numeric`, and never convert through JS `number`. Reconcile/persist before detector evaluation. Remove `readyFirstObserved` and `progressMemory` ownership from the in-process tracker; it consumes `DetectorClocks`.

- [ ] **Step 4: Run GREEN and query budget**

Run the focused cluster three times. Require the clock store to use bounded parameterized statements and remain within the OBS-03 2-second timeout/query-budget fixture.

- [ ] **Step 5: Kill five mutants and commit**

Mutate separately: numeric through `Number`, reset `observed_at` on unchanged ID, reset progress time on unchanged sequence, overwrite a current slot, and emit a defect on exhaustion. Prove RED/restore for each.

```bash
git add apps/observation-agent/src/modules/stall-detectors tests
git diff --cached --check
git commit -m "fix(observation-agent): persist detector clocks"
```

---

### Task 7: Generalize delivery health and contain status-page bind failures

**Files:**
- Create: `apps/observation-agent/src/modules/routing/delivery-health.ts`
- Modify: `apps/observation-agent/src/modules/routing/module.ts`
- Modify: `apps/observation-agent/src/modules/routing/router.ts`
- Delete or reduce: `apps/observation-agent/src/modules/channels-sendmail/failures.ts`
- Modify: `apps/observation-agent/src/modules/status-page/module.ts`
- Modify: `apps/observation-agent/src/modules/status-page/status-page.ts`
- Test: `tests/unit/obs-agent-07-delivery-health.test.ts`
- Test: `tests/integration/obs-agent-07-kanban.test.ts`
- Test: `tests/unit/obs-agent-07-sendmail.test.ts`
- Test: `tests/integration/obs-agent-07-status-recovery.test.ts`
- Test: `tests/integration/obs-agent-07-loopback.test.ts`

**Interfaces:**
- Consumes: Task 3 delivery replay and Task 4 module lifecycle restoration.
- Produces:

```ts
export type RoutedChannelResult = Readonly<{
  channel: "osascript" | "sendmail" | "kanban";
  outcome: "DELIVERED" | "FAILED" | "RATE_LIMITED" | "MUTED";
  at: Date;
}>;
export function createDeliveryHealthTracker(
  restoredResults: readonly DeliveryResultEnvelope[]
): Readonly<{
  record(result: RoutedChannelResult): void;
  restore(opens: readonly RestoredOpenSignal[]): void;
  drain(): readonly SignalIntent[];
}>;
```

- [ ] **Step 1: Write three-channel lifecycle RED tests**

For each channel, feed FAILED and require one OPEN:

```ts
expect(intent).toMatchObject({
  correlationKey: `delivery:${channel}`,
  component: "observation_agent",
  class: "AGENT_SELF",
  state: "OPEN",
  severity: "DEGRADED",
  impactCode: "IMPACT_AGENT_DELIVERY",
  evidence: { reason: "DELIVERY_FAILURE", channel },
  suspectedDefect: false,
  defectKind: null
});
```

DELIVERED clears the original channel UUID after restart. RATE_LIMITED/MUTED produce no health transition. Failures are independent and DEGRADED self-health never schedules an external channel.

- [ ] **Step 2: Write bind-containment RED test**

Occupy `127.0.0.1:9797`, run the real status-page module followed by a synthetic later module, and assert the later module executes while status contains a module-owned UNKNOWN/DEGRADED projection. Release the socket, advance a cadence, and assert retry succeeds. Invalid host/port configuration must still reject the cycle.

- [ ] **Step 3: Run RED and implement GREEN**

```bash
pnpm exec vitest run tests/unit/obs-agent-07-delivery-health.test.ts \
  tests/integration/obs-agent-07-kanban.test.ts \
  tests/unit/obs-agent-07-sendmail.test.ts \
  tests/integration/obs-agent-07-status-recovery.test.ts \
  tests/integration/obs-agent-07-loopback.test.ts --reporter=verbose
```

Router calls one result callback after durable RESULT. Module queues tracker intents for its next `signals()` call and restores from journal results/opens. Status-page catches only `OBSERVATION_STATUS_BIND_FAILED`, tears down listeners, resets the cached promise, and returns fixed typed status. It never binds elsewhere.

- [ ] **Step 4: Run GREEN and kill five mutants**

Run focused tests three times. Mutate: sendmail-only callback, RATE_LIMITED-as-failure, `suspected_defect=true`, swallow invalid config, and retain rejected startup promise. Prove each RED and exact restore.

- [ ] **Step 5: Commit**

```bash
git add apps/observation-agent/src/modules/routing \
  apps/observation-agent/src/modules/channels-sendmail \
  apps/observation-agent/src/modules/status-page tests
git diff --cached --check
git commit -m "fix(observation-agent): isolate channel and status failures"
```

---

### Task 8: Make capture recovery, daily identity, and spool configuration truthful

**Files:**
- Modify: `apps/observation-agent/src/modules/capture-health/tracker.ts`
- Modify: `apps/observation-agent/src/modules/capture-health/daily.ts`
- Modify: `apps/observation-agent/src/modules/capture-health/module.ts`
- Modify: `apps/observation-agent/src/modules/spool-health/module.ts`
- Modify: `apps/observation-agent/src/modules/spool-health/scan.ts`
- Modify: `apps/observation-agent/src/modules/spool-health/tracker.ts`
- Modify: `deploy/observation-agent/targets.dev.d/OBS-04.json`
- Test: `tests/unit/obs-agent-04-blind-spool.test.ts`
- Test: `tests/integration/obs-agent-04-daily-restart.test.ts`
- Test: `tests/integration/obs-agent-04-not-wired.test.ts`
- Test: `tests/integration/obs-agent-04-status.test.ts`
- Test: `tests/architecture/obs-agent-04-zone.test.ts`

**Interfaces:**
- Consumes: Task 3 journal replay and Task 4 restored capture lifecycle.
- Produces:

```ts
export type DailyImpactResult = "APPENDED" | "ALREADY_PRESENT" | "OPEN_IDENTITY_MISSING";
export async function appendDailyNotWiredImpact(input: Readonly<{
  stateDir: string; runtime: string; now: Date; openSignals: readonly ReplayedOpenSignal[];
}>): Promise<DailyImpactResult>;
```

- [ ] **Step 1: Write blindness RED tests**

Open BLIND_PERIOD, then observe the same runtime as DOWN even when no fresh authority row exists. Require CLEARED with the original UUID. Repeat with UNKNOWN and require no clear plus retained OPEN state.

- [ ] **Step 2: Write daily digest RED tests**

Seed a still-open CAPTURE_NOT_WIRED lifecycle with UUID `70000000-0000-4000-8000-000000000404`. At `2026-09-06T12:34:56Z`, require exactly:

```text
12:34:56Z · INFO · obs_capture · CAPTURE_NOT_WIRED · Error capture is not wired into the product: no failure is recorded anywhere. · 70000000-0000-4000-8000-000000000404
```

Call twice and require one line. Clear/reopen with a new UUID next day and require the new UUID. Missing/ambiguous OPEN identity returns `OPEN_IDENTITY_MISSING` and writes nothing.

- [ ] **Step 3: Write unconfigured-spool RED tests**

Remove the target in the test fixture, inject a scan spy, and require zero filesystem calls, fixed `spool UNKNOWN` status, and no SPOOL_STRANDED intent. Assert the committed OBS-04 fragment contains no `/tmp/dialectical-engine-observation-spool` and no substitute path.

- [ ] **Step 4: Run RED and implement GREEN**

```bash
pnpm exec vitest run tests/unit/obs-agent-04-blind-spool.test.ts \
  tests/integration/obs-agent-04-daily-restart.test.ts \
  tests/integration/obs-agent-04-not-wired.test.ts \
  tests/integration/obs-agent-04-status.test.ts \
  tests/architecture/obs-agent-04-zone.test.ts --reporter=verbose
```

Move definitive-DOWN clearing before the missing-authority branch. Derive daily identity from replayed lifecycle records and idempotency from the current digest. Commit an empty OBS-04 spool target set and return before `lstat/stat` when absent.

- [ ] **Step 5: Run GREEN, kill five mutants, and commit**

Run focused tests three times. Mutate: clear on UNKNOWN, use `00:00:00Z`, fabricate a daily ID, append twice, and restore any fallback spool. Each must RED and restore.

```bash
git add apps/observation-agent/src/modules/capture-health \
  apps/observation-agent/src/modules/spool-health \
  deploy/observation-agent/targets.dev.d/OBS-04.json tests
git diff --cached --check
git commit -m "fix(observation-agent): preserve truthful capture state"
```

---

### Task 9: Integrate boot restoration and prove the complete campaign

**Files:**
- Modify only if an integration RED exposes a contract gap in an owning file from Tasks 1-8.
- Test: `tests/integration/obs-agent-01-restart-lifecycle.test.ts`
- Test: `tests/integration/obs-agent-01-session-budget.test.ts`
- Test: the complete OBS-01 through OBS-07 suite.
- Update outside repository: execution ledger and controller report.

**Interfaces:**
- Consumes: every preceding task's committed interfaces.
- Produces: one clean reviewed repair candidate and immutable whole-campaign patch for Grok round 2.

- [ ] **Step 1: Add a full boot-order integration test**

Use dependency seams and disposable local state/database only. Prove this exact order:

```text
validated targets -> database policy or valid cache -> journal replay -> lifecycle restore
-> router construction -> initial self signal -> module probes -> atomic status write
```

With PostgreSQL unavailable and a valid cache/journal, prove one existing OPEN survives, no duplicate notification occurs, a recovered probe clears the original UUID, channel FAILED state becomes non-defect self-health, and later modules run after a status-page bind failure.

- [ ] **Step 2: Run every repaired cluster three consecutive times**

Run the exact focused commands from Tasks 1-8 in task order. No run may be replaced by a narrower subset. Record file/test counts and duration for every run.

- [ ] **Step 3: Run the complete ObservationAgent suite three consecutive times**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-0[1-7]-*.test.ts \
  tests/integration/obs-agent-0[1-7]-*.test.ts \
  tests/architecture/obs-agent-0[1-7]-*.test.ts \
  --reporter=verbose --maxWorkers=1
```

Expected: all files/tests pass on each run. The expected count must be at least the inherited 82/274 plus every new test; report the measured number rather than predicting it.

- [ ] **Step 4: Run contract, TypeScript, containment, and audit gates**

```bash
pnpm run generate:contract
pnpm exec tsc -p apps/observation-agent/tsconfig.json --noEmit
pnpm -C apps/observation-agent exec tsc -p tsconfig.json --noEmit
pnpm typecheck
pnpm typecheck -- --traceResolution
pnpm audit:source
pnpm audit:text-bytes
pnpm audit:orphans
pnpm audit:architecture
git diff --check b3d9d689e508d523d43f00c5be6e0356623e96ae..HEAD
git status --porcelain=v1 -uall
```

Expected: contract and ObservationAgent TypeScript pass; root diagnostics and repository audits have zero new ObservationAgent finding and only exact documented inherited baselines; trace has zero worktree escape; diff check and porcelain are clean.

- [ ] **Step 5: Run explicit boundary scans**

Require:

```text
process.env beneath apps/observation-agent: 0
new pg.Pool/new pg.Client beneath production modules: 0
suspectedDefect:true outside the four OBS-03 detector builders: 0
product table writes: 0
raw message/prompt/query/payload/token/email/user fields: 0
/tmp/dialectical-engine-observation-spool: 0
storm.threshold production token: 0
route-owned loopback projection: 0
unknown journal envelope acceptance: 0
```

Run real disposable-catalog grant/view tests already in the suite and prove `observation.defect_signal_v` includes only explicit suspected-defect OPEN rows plus matching clears.

- [ ] **Step 6: Controller diff review and optional integration commit**

If Step 1 required no production change, create no empty commit. If it exposed an owning gap, capture RED first, make the smallest correction, rerun all gates, and commit only those exact files as:

```bash
git commit -m "test(observation-agent): prove restart repair integration"
```

The controller reads `git diff b3d9d689..HEAD` in full, maps every changed path to a finding/task, and rejects unrelated changes.

- [ ] **Step 7: Freeze the Grok round-2 package**

Create an immutable patch from original campaign base `2b670d3059c60d7262cf655bd5d402c88100dff3` through the final repair HEAD. Record exact HEAD/parent, commit count, byte count, SHA-256, test matrix, inherited baselines, design/plan SHAs, and zero-prohibited-action statement.

Submit the patch plus original r1 verdict, approved spec, this plan, execution ledger, and controller report to Grok 4.6 read-only round 2. Grok receives no write, shell, service, credential, browser, board, or live-infrastructure authority.

---

## Controller review after every task

Before dispatching the next worker, the controller must:

1. read the worker report and complete task diff;
2. verify parent, subject, changed-path allow-list, file modes, and one-commit scope;
3. rerun focused GREEN and at least one inherited regression independently;
4. inspect the recorded RED and every mutant failure/restoration receipt;
5. confirm clean porcelain and no prohibited action;
6. append the exact commit and gate evidence to the execution ledger.

A task does not advance merely because its worker says PASS.

## Review and completion boundary

Local implementation is ready for external review only after Task 9 proves the complete current candidate. Grok 4.6 round 2 must return PASS before V handoff can claim review closure. V then owns every numbered live acceptance step, veto, and integration decision. No local test, Grok verdict, or controller report substitutes for V acceptance.
