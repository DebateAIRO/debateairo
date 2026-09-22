# ObservationAgent Shared Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the shared ObservationAgent impact and routing contracts, replay the clean OBS-02 through OBS-05 chain, and make OBS-05's load and Postgres-age behavior truthful under the active versioned policy.

**Architecture:** The OBS-01 foundation receives a closed `IMPACT_LOAD` schema plus a channel-neutral two-phase delivery coordinator and one optional router-factory contribution. A legacy router preserves pre-OBS-07 osascript behavior; OBS-05 then consumes the load contract and passes versioned age thresholds as bound Postgres parameters.

**Tech Stack:** TypeScript, Node.js, Zod, Vitest, PostgreSQL migrations and `pg`, pnpm, zsh.

**Spec:** `docs/missions/observability-agents/plans/OBS-SHARED-COMPATIBILITY-REPAIRS-2026-09-04.md`

## Global Constraints

- ObservationAgent only; do not implement FixAgent or SupportAgent.
- Do not fetch, inspect, compare, comment on, modify, merge or close the security-hardening pull request.
- Do not push, merge to a shared branch, run live V acceptance, read credentials or real certificates, or install/launch/restart services.
- Disposable embedded databases are allowed only for repository migration/integration tests.
- Code authors are exact GPT-5.6-sol workers. Claude Opus 5 review remains an asynchronous catch-up gate and must not idle provisional local implementation.
- Strict TDD is mandatory: capture the focused RED before production edits, reach GREEN, run every named reversible mutant, restore byte-for-byte, then run each authoritative focused wrapper three consecutive times.
- A signal journal fsync precedes every channel effect. A delivery ATTEMPT fsync precedes its executor, and its RESULT fsync precedes the Postgres mirror.
- The environment boundary remains the existing four-key register-owned projection; no module reads `process.env`.
- The Postgres capacity query keeps one session, one aggregate SELECT, `SET LOCAL statement_timeout = 2000`, and `SET LOCAL ROLE pg_monitor`; it never selects SQL text.
- Existing migrations 0057, 0058, 0059 and 0060 retain their allocations. Migration 0057 is an unmerged/unapplied candidate and may receive the approved impact-code addition.
- Mission-record edits occur in the main checkout and preserve unrelated dirty files. Code edits occur only in the named isolated worktree.
- The shared foundation repair is one local commit. The OBS-05 repair is one later local commit. Intermediate commits are forbidden.

---

### Task 1: Ratify the author records

**Files:**
- Modify: `docs/missions/observability-agents/requirements/observationagent.md`
- Modify: `docs/missions/observability-agents/slices/OBS-05/SPEC.md`
- Modify: `docs/missions/observability-agents/slices/OBS-05/PLAN.md`
- Modify: `docs/missions/observability-agents/slices/OBS-05/DECISIONS.md`
- Modify: `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/progress.md`

**Interfaces:**
- Consumes: the approved design's Decision A sentence and five-field evidence object.
- Produces: the exact normative contract the two code workers read by absolute path.

- [ ] **Step 1: Add the closed impact sentence to Q2**

Insert this entry beside the existing disk and memory impacts without changing another fixed sentence:

```markdown
`IMPACT_LOAD` "Host load is P across N logical cores for T seconds: processes are contending for CPU."
```

- [ ] **Step 2: Bind OBS-05 R06 and fixed copy to the new code**

State that sustained load emits `CAPACITY/DEGRADED/IMPACT_LOAD` with exactly:

```json
{
  "load_one_minute": 20.1,
  "logical_cores": 10,
  "threshold_multiplier": 2,
  "sustained_seconds": 300,
  "observed_at": "2026-09-03T12:04:30.000Z"
}
```

Add the exact fixed sentence from Step 1 to the SPEC Bodies line. Keep memory on `IMPACT_MEMORY`.

- [ ] **Step 3: Make the PLAN test obligation explicit**

Replace C2-2 with:

```markdown
2. **C2-2 RED→GREEN:** parse host memory below 10% as `IMPACT_MEMORY`; emit load above 2×cores for ten 30-second samples as `IMPACT_LOAD` with numeric load/core/multiplier/300-second evidence and the fixed CPU-contention copy.
```

- [ ] **Step 4: Append two decision receipts**

Append, without rewriting history:

```markdown
- 2026-09-04 | What impact represents sustained host load? | `CAPACITY/DEGRADED/IMPACT_LOAD` with exact numeric `load_one_minute`, `logical_cores`, `threshold_multiplier`, `sustained_seconds`, `observed_at`; fixed copy is `Host load is P across N logical cores for T seconds: processes are contending for CPU.` | `IMPACT_MEMORY` produces false memory-pressure copy and byte evidence for CPU contention; the user approved the compatibility design. | V / OBS shared compatibility design
- 2026-09-04 | May Postgres age eligibility stay hard-coded at 60/120 seconds? | No; the current versioned `lock_wait_s` and `idle_in_transaction_s` values must reach the one aggregate query as bound parameters on every probe. `SET LOCAL ROLE pg_monitor` remains required. | A lower ratified policy must not be prefiltered away by stale defaults. | V / OBS shared compatibility design
```

- [ ] **Step 5: Verify and ledger the author records**

Run:

```zsh
rg -n 'IMPACT_LOAD|load_one_minute|logical_cores|threshold_multiplier|sustained_seconds|SET LOCAL ROLE pg_monitor|bound parameters' \
  docs/missions/observability-agents/requirements/observationagent.md \
  docs/missions/observability-agents/slices/OBS-05/{SPEC,PLAN,DECISIONS}.md
```

Expected: requirements and SPEC have identical fixed copy, PLAN names the exact duty, and DECISIONS has both receipts. Append `Task 1: complete (mission records; no code commit)` to the parent ledger. Do not stage or commit the already-dirty mission records.

---

### Task 2: Implement the shared impact and routing foundation

**Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-01/dialectical-engine`

**Required base:** clean `slice/oa-obs-01 @ 47c356431094a7f54e4aa8a547125ac6949d5c7e`

**Files:**
- Create: `apps/observation-agent/src/notify/delivery.ts`
- Create: `apps/observation-agent/src/core/routing.ts`
- Create: `tests/unit/obs-agent-01-routing.test.ts`
- Modify: `apps/observation-agent/src/core/types.ts`
- Modify: `apps/observation-agent/src/core/modules.ts`
- Modify: `apps/observation-agent/src/core/signals.ts`
- Modify: `apps/observation-agent/src/notify/osascript.ts`
- Modify: `apps/observation-agent/src/main.ts`
- Modify: `migrations/0057_observation_foundation.sql`
- Modify: `tests/unit/obs-agent-01-discovery.test.ts`
- Modify: `tests/integration/obs-agent-01-delivery.test.ts`
- Modify: `tests/integration/obs-agent-01-foundation.test.ts`
- Modify only if its source list requires the new files: `tests/architecture/obs-agent-01-boundaries.test.ts`

**Interfaces:**
- Consumes: Task 1's exact `IMPACT_LOAD` contract; existing journal, mirror, signal, delivery, mute and notification-policy types.
- Produces: `DeliveryCoordinator`, `SignalRouterFactory`, `SignalRouter`, `createLegacyOsaScriptRouter`, pure osascript execution, and `ObservationModuleCatalog.routerFactory`.

- [ ] **Step 1: Verify the isolated base before editing**

Run:

```zsh
test "$(git rev-parse HEAD)" = 47c356431094a7f54e4aa8a547125ac6949d5c7e
git status --porcelain=v1
```

Expected: both commands exit 0 and porcelain is empty.

- [ ] **Step 2: Write the failing impact tests**

Add a complete valid CAPACITY signal using:

```ts
const load = signalSchema.parse({
  seq: 1,
  signal_id: "10000000-0000-4000-8000-000000000001",
  state: "OPEN",
  class: "CAPACITY",
  component: "host",
  severity: "DEGRADED",
  impact_code: "IMPACT_LOAD",
  first_failed_probe_at: "2026-09-03T12:00:00.000Z",
  detected_at: "2026-09-03T12:04:30.000Z",
  evidence: {
    load_one_minute: 20.1,
    logical_cores: 10,
    threshold_multiplier: 2,
    sustained_seconds: 300,
    observed_at: "2026-09-03T12:04:30.000Z"
  },
  suspected_defect: false,
  defect_kind: null,
  run_ref: null,
  work_item_ref: null,
  threshold_version: 1,
  clears_signal_id: null,
  recorded_at: "2026-09-03T12:04:30.000Z"
});
expect(renderImpact(load)).toBe(
  "Host load is 20.1 across 10 logical cores for 300 seconds: processes are contending for CPU."
);
expect(() => signalSchema.parse({
  ...load,
  evidence: { ...load.evidence, total_bytes: 10 }
})).toThrow("OBSERVATION_EVIDENCE_INVALID");
```

Require `total_bytes`, `percent`, or any extra evidence key to throw `OBSERVATION_EVIDENCE_INVALID`. Extend the empty-database 0057 replay test to insert `IMPACT_LOAD`, while an unknown impact still fails its CHECK.

- [ ] **Step 3: Write the failing coordinator tests**

Use temporary state directories and injected spies. Require:

```ts
expect(events).toEqual([
  "delivery-attempt-fsynced",
  "executor",
  "delivery-result-fsynced",
  "delivery-mirror"
]);
```

An executor that throws must resolve to `{ outcome: "FAILED", delivered_at: null }`. `MUTED` and `RATE_LIMITED` must not call the executor but must each write one ATTEMPT and one RESULT.

An `EXECUTE` action without an executor and a suppressed action with an executor must reject before an external effect. After one executor resolves as FAILED, a second independent action must still reach its executor and resolve DELIVERED.

- [ ] **Step 4: Write the failing router and discovery tests**

Extend the synthetic manifest generator with an optional router factory. Require one factory to appear as `catalog.routerFactory`, while two factories reject with `OBSERVATION_DUPLICATE_ROUTER` before any probe or executor runs. A synthetic router invoked from the real signal path must read its signal from the journal during `onSignal`, proving the signal fsync occurred first.

Add `router` to the discovery test's optional allowed-member set without adding it to existing manifests. Add a no-contribution characterization proving the legacy adapter routes SEVERE/FATAL OPEN, delayed DEGRADED, and every CLEARED exactly as the current implementation does. A contributed fixture router must be able to receive INFO and short-lived DEGRADED OPEN/CLEARED pairs without producing osascript actions.

- [ ] **Step 5: Run the focused RED**

Run:

```zsh
pnpm exec vitest run \
  tests/unit/obs-agent-01-routing.test.ts \
  tests/unit/obs-agent-01-discovery.test.ts \
  tests/integration/obs-agent-01-delivery.test.ts \
  tests/integration/obs-agent-01-foundation.test.ts \
  --reporter=verbose
```

Expected: failures identify missing `IMPACT_LOAD`, coordinator/router types, router discovery and persisted-signal replacement. Existing unrelated assertions remain green.

- [ ] **Step 6: Implement the closed impact contract**

In `core/signals.ts`, add:

```ts
const loadEvidenceSchema = z.object({
  load_one_minute: finiteNonnegative,
  logical_cores: positiveInteger,
  threshold_multiplier: finitePositive,
  sustained_seconds: finiteNonnegative,
  observed_at: timestamp
}).strict();
```

Add `IMPACT_LOAD` to `IMPACT_CODES`, `evidenceByImpact`, `impactsByClass.CAPACITY`, the fixed renderer and migration 0057. Do not broaden `IMPACT_MEMORY`.

- [ ] **Step 7: Implement the channel-neutral coordinator**

Create `notify/delivery.ts` with these public shapes:

```ts
export type DeliveryExecutionResult = Readonly<{
  deliveredAt: Date;
  externalRef: string | null;
}>;

export type DeliveryMirror = Readonly<{
  mirrorDelivery(delivery: ObservationDelivery): Promise<void>;
}>;

export type DeliveryAction = Readonly<{
  signal: ObservationSignal;
  channel: ObservationDelivery["channel"];
  disposition: "EXECUTE" | "MUTED" | "RATE_LIMITED";
  now: Date;
  execute?: () => Promise<DeliveryExecutionResult>;
}>;

export class DeliveryCoordinator {
  constructor(input: Readonly<{ journal: ObservationJournal; mirror: DeliveryMirror }>);
  attempt(action: DeliveryAction): Promise<ObservationDelivery>;
}
```

Validate before effects. `EXECUTE` requires one executor; suppressed dispositions forbid one. Append ATTEMPT, map executor success/failure to DELIVERED/FAILED, append RESULT, then mirror. Executor failure returns FAILED; journal failure rejects.

- [ ] **Step 8: Make osascript a pure bounded executor**

Refactor `notify/osascript.ts` to export:

```ts
export type OsaScriptDeliveryExecutor = (
  signal: ObservationSignal,
  now: Date,
  timeoutMs: number
) => Promise<DeliveryExecutionResult>;

export function createOsaScriptDeliveryExecutor(
  execute: OsaScriptExecutor = executeOsaScript
): OsaScriptDeliveryExecutor;
```

It validates the signal, renders fixed copy, invokes `/usr/bin/osascript` with the existing argv and timeout, and returns `{ deliveredAt: now, externalRef: null }`. It does not journal, mirror, mute or rate-limit.

- [ ] **Step 9: Implement router types and the legacy adapter**

Create `core/routing.ts` with:

```ts
export type SignalRoutingPolicy = Readonly<{
  rateLimitMs: number;
  degradedAfterMs: number;
  timeoutMs: number;
}>;
export type SignalRoutingMute = Readonly<{ component?: ObservationComponent }> | null;
export type PersistedSignalRoutingInput = Readonly<{
  signal: ObservationSignal;
  now: Date;
  policy: SignalRoutingPolicy;
  mute: SignalRoutingMute;
}>;
export type SignalRouter = Readonly<{
  onSignal(input: PersistedSignalRoutingInput): Promise<void>;
  onTick(input: Readonly<{
    now: Date;
    policy: SignalRoutingPolicy;
    mute: SignalRoutingMute;
  }>): Promise<void>;
}>;
export type SignalRouterFactory = Readonly<{
  create(input: Readonly<{
    stateDir: string;
    delivery: DeliveryCoordinator;
    osascript: OsaScriptDeliveryExecutor;
  }>): Promise<SignalRouter> | SignalRouter;
}>;
```

`createLegacyOsaScriptRouter` owns open-DEGRADED and last-attempt maps. It submits typed coordinator actions and preserves current mute, rate-limit, escalation and CLEARED behavior. No OBS-07 channel/policy belongs here.

- [ ] **Step 10: Add one fail-closed router contribution**

Add optional `router?: SignalRouterFactory` to `ObservationModuleManifest`. Validate `router.create` in `core/modules.ts`, retain at most one, and return:

```ts
export type ObservationModuleCatalog = Readonly<{
  modules: readonly Module[];
  verbs: readonly OactlVerbContribution[];
  targetFragments: readonly string[];
  routerFactory: SignalRouterFactory | null;
}>;
```

A second contribution throws `OBSERVATION_DUPLICATE_ROUTER` during import-only discovery.

- [ ] **Step 11: Route only after durable signal persistence**

In `main.ts`, construct the coordinator, pure osascript executor, and contributed-or-legacy router. Keep `emit` ordered as:

```ts
await persistSignal({ signal, journal, mirror });
const componentStatus = status.get(signal.component) ?? {
  state: "UNKNOWN" as const,
  lastProbeAt: null,
  lastOkAt: null,
  openSignalIds: new Set<string>()
};
status.set(signal.component, componentStatus);
if (signal.state === "OPEN") componentStatus.openSignalIds.add(signal.signal_id);
else if (signal.clears_signal_id !== null) {
  componentStatus.openSignalIds.delete(signal.clears_signal_id);
}
await router.onSignal({
  signal,
  now,
  policy: {
    rateLimitMs: policy.value.notification.rate_limit_ms,
    degradedAfterMs: policy.value.notification.degraded_after_ms,
    timeoutMs: policy.value.notification.timeout_ms
  },
  mute: await readMute(environment.OBSERVATION_STATE_DIR, now).catch(() => null)
});
```

Remove the concrete notifier call. Replace the delayed-DEGRADED loop with one `router.onTick` call using current policy and mute.

- [ ] **Step 12: Reach focused GREEN**

Run the Step 5 command. Expected: all tests pass and no real channel executes because executors are injected.

- [ ] **Step 13: Run and restore four reversible mutants**

Mutate one invariant at a time: remove `IMPACT_LOAD` from CAPACITY; allow two router factories; mirror RESULT before fsync; invoke router before signal persistence. Each focused test must exit non-zero. Restore with `apply_patch`, prove before/after SHA-256 equality, and rerun GREEN.

- [ ] **Step 14: Run authoritative and repository gates**

Run the exact C1, C2, C3 and C4 zsh wrappers from `docs/missions/observability-agents/slices/OBS-01/PLAN.md`, in order. Then run:

```zsh
pnpm generate:contract
pnpm --dir apps/observation-agent exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p apps/observation-agent/tsconfig.json
pnpm typecheck
pnpm audit:source
git diff --check
```

Require zero new ObservationAgent diagnostics, zero outside-worktree trace resolutions, no fifth environment key, and no product/downstream path.

- [ ] **Step 15: Report and create one local commit**

Write `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/task-1-compatibility-3-report.md` with RED, GREEN, mutants, three-run wrappers, gates, exact paths and concerns. Stage only the allow-list, run `git diff --cached --check`, then commit:

```zsh
git commit -m "refactor(observation-agent): add persisted signal routing"
git status --porcelain=v1
```

Expected: one new commit above `47c35643` and empty porcelain.

---

### Task 3: Independently verify and replay the downstream chain

**Files:**
- Modify: `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/progress.md`
- Create: one immutable Task-2 review package under `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/`
- Modify: local OBS-02, OBS-03, OBS-04 and OBS-05 branch ancestry only through explicit local rebase

**Interfaces:**
- Consumes: Task 2's clean foundation commit and the existing clean slice commits.
- Produces: a clean linear chain with stable downstream patch content and a verified OBS-05 base.

- [ ] **Step 1: Inspect the report and full foundation diff**

From the OBS-01 worktree, read the report and run:

```zsh
git log --oneline 47c356431094a7f54e4aa8a547125ac6949d5c7e..HEAD
git diff --stat 47c356431094a7f54e4aa8a547125ac6949d5c7e..HEAD
git diff --check 47c356431094a7f54e4aa8a547125ac6949d5c7e..HEAD
git diff --name-only 47c356431094a7f54e4aa8a547125ac6949d5c7e..HEAD
```

Expected: one commit and only Task 2 allow-listed paths.

- [ ] **Step 2: Rerun foundation verification independently**

Run the Task-2 focused command, all four authoritative OBS-01 wrappers, both app TypeScript commands, root diagnostic delta, source audit, migration replay and clean-tree check. Worker-reported output is not substitute evidence.

- [ ] **Step 3: Package the provisional review**

Set `obs01_repair_head` from the verified OBS-01 worktree HEAD. Create a review package containing the commit list, stat and full `47c35643..$obs01_repair_head` diff. Retry Claude Opus 5 only if both its provider and explicit external-code-egress approval are available; otherwise record `review pending` and continue provisionally.

- [ ] **Step 4: Reverify the old downstream chain before rewriting ancestry**

Require empty porcelain and these exact relationships:

```text
d0e619c0f88ee3ff831ba71fb3c6744791aa9386 <- 47c356431094a7f54e4aa8a547125ac6949d5c7e
6b3a9e4399a08a24d6389d3bf9fd0cfb2d3236cb <- d0e619c0f88ee3ff831ba71fb3c6744791aa9386
f16a9340525a59a07302dec29e1841473d95d946 <- 6b3a9e4399a08a24d6389d3bf9fd0cfb2d3236cb
0f992ed18b119cd7457eee26d993e4076bae3d5c <- f16a9340525a59a07302dec29e1841473d95d946
```

- [ ] **Step 5: Replay one slice at a time**

Use task-specific variables resolved directly from each verified worktree:

```zsh
obs01_repair_head="$(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-01/dialectical-engine rev-parse HEAD)"
git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-02/dialectical-engine/dialectical-engine rebase --onto "$obs01_repair_head" 47c356431094a7f54e4aa8a547125ac6949d5c7e slice/oa-obs-02
obs02_replay_head="$(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-02/dialectical-engine/dialectical-engine rev-parse HEAD)"
git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-03/dialectical-engine rebase --onto "$obs02_replay_head" d0e619c0f88ee3ff831ba71fb3c6744791aa9386 slice/oa-obs-03
obs03_replay_head="$(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-03/dialectical-engine rev-parse HEAD)"
git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-04/dialectical-engine rebase --onto "$obs03_replay_head" 6b3a9e4399a08a24d6389d3bf9fd0cfb2d3236cb slice/oa-obs-04
obs04_replay_head="$(git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-04/dialectical-engine rev-parse HEAD)"
git -C /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-05/dialectical-engine rebase --onto "$obs04_replay_head" f16a9340525a59a07302dec29e1841473d95d946 slice/oa-obs-05
```

After each rebase, require empty porcelain, the expected parent, and the same stable patch-id as its old slice commit. Stop on a semantic conflict; do not auto-resolve overlapping behavior.

- [ ] **Step 6: Verify the replayed assembled base**

From OBS-05, run all `tests/{unit,integration,architecture}/obs-agent-0[1-5]-*.test.ts`, both app TypeScript gates, root diagnostic delta, source audit, trace containment, migration order/replay, diff-check and clean-tree readback.

- [ ] **Step 7: Record new hashes**

Append old-to-new mappings, patch-id evidence, commands, review status and `Task 3: complete (local replay; no integration/push)` to the implementation and parent ledgers.

---

### Task 4: Repair OBS-05 host load and Postgres age filtering

**Worktree:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/oa-obs-05/dialectical-engine`

**Required base:** the clean replayed OBS-05 candidate produced by Task 3.

**Files:**
- Modify: `apps/observation-agent/src/modules/host-capacity/tracker.ts`
- Modify: `apps/observation-agent/src/modules/postgres-capacity/query.ts`
- Modify: `apps/observation-agent/src/modules/postgres-capacity/module.ts`
- Modify: `tests/unit/obs-agent-05-host.test.ts`
- Modify: `tests/unit/obs-agent-05-postgres.test.ts`
- Modify: `tests/architecture/obs-agent-05-sql-privacy.test.ts`
- Modify only if it is the narrower correct test home: `tests/integration/obs-agent-05-pg-monitor.test.ts`

**Interfaces:**
- Consumes: Task 2's `IMPACT_LOAD` schema/renderer/migration and existing threshold keys `lock_wait_s`, `idle_in_transaction_s`, `load_per_core_multiplier`, `load_sustained_samples`.
- Produces: truthful load intents and `readPostgresCapacity` with bound policy ages.

- [ ] **Step 1: Verify the replayed base and read author records**

Require empty porcelain, record HEAD/parent, and read Task 1's requirements/SPEC/PLAN/DECISIONS and the extracted Task-4 brief before editing.

- [ ] **Step 2: Write the failing host-load assertion**

Require the tenth 30-second high-load sample to produce:

```ts
expect(opened.intents).toEqual([expect.objectContaining({
  state: "OPEN",
  component: "host",
  class: "CAPACITY",
  severity: "DEGRADED",
  impactCode: "IMPACT_LOAD",
  evidence: {
    load_one_minute: 20.1,
    logical_cores: 10,
    threshold_multiplier: 2,
    sustained_seconds: 300,
    observed_at: new Date(at.getTime() + 270_000).toISOString()
  },
  suspectedDefect: false,
  defectKind: null
})]);
```

Run `pnpm exec vitest run tests/unit/obs-agent-05-host.test.ts --reporter=verbose`. Expected: RED on the current `IMPACT_MEMORY` and byte evidence.

- [ ] **Step 3: Implement and refute truthful host load**

Extend the local Condition impact union with `IMPACT_LOAD`. For `host-load`, emit only the five exact evidence keys. Set `sustained_seconds` to `loadSustainedSamples * 30`, giving 300 for the frozen cadence/default. Keep memory unchanged.

Run the host test GREEN. Mutate only the load impact back to `IMPACT_MEMORY`, require RED, restore with `apply_patch`, prove before/after tracker SHA-256 equality, and rerun GREEN.

- [ ] **Step 4: Write the failing policy-propagation assertions**

Create `const contextNow = at(0)` and a `vi.fn` `readSnapshot` dependency returning the existing fixture snapshot. Probe with thresholds `{ lock_wait_s: 7, idle_in_transaction_s: 11 }`, then require:

```ts
expect(readSnapshot).toHaveBeenCalledWith(
  "postgresql://fixture.invalid/debateai",
  contextNow,
  { lockWaitSeconds: 7, idleInTransactionSeconds: 11 }
);
```

At the query boundary, require an exported `postgresCapacityParameters` helper to return `[7, 11]`, and require source shape `client.query(POSTGRES_CAPACITY_SQL, parameters)`. Run the Postgres unit and SQL-privacy tests. Expected: RED because production accepts URL/time only and embeds 60/120.

- [ ] **Step 5: Implement typed threshold propagation**

Add:

```ts
export type PostgresCapacityQueryThresholds = Readonly<{
  lockWaitSeconds: number;
  idleInTransactionSeconds: number;
}>;

export function postgresCapacityParameters(
  thresholds: PostgresCapacityQueryThresholds
): readonly [number, number];
```

Change the dependency and production signatures to:

```ts
readSnapshot(
  databaseUrl: string,
  observedAt: Date,
  thresholds: PostgresCapacityQueryThresholds
): Promise<PostgresCapacitySnapshot>;
```

Compute module thresholds once per probe, pass the two query ages to `readSnapshot`, and pass the same complete object to the tracker. Replace both lock literals with `$1::double precision * interval '1 second'`, both idle literals with `$2::double precision * interval '1 second'`, and call:

```ts
const parameters = postgresCapacityParameters(thresholds);
client.query<CapacityRow>(POSTGRES_CAPACITY_SQL, parameters);
```

`postgresCapacityParameters` validates both numbers as finite and non-negative before pool creation or `BEGIN`; invalid input throws `OBSERVATION_POSTGRES_CAPACITY_INVALID:<key>` without opening a query transaction.

- [ ] **Step 6: Reach Postgres GREEN and refute both stale defaults**

Run:

```zsh
pnpm exec vitest run \
  tests/unit/obs-agent-05-postgres.test.ts \
  tests/architecture/obs-agent-05-sql-privacy.test.ts \
  tests/integration/obs-agent-05-pg-monitor.test.ts \
  --reporter=verbose
```

Mutate lock back to literal 60, then idle back to literal 120, one at a time. Each must fail its parameter/source assertion. Restore byte-for-byte and rerun GREEN. Prove `SET LOCAL ROLE pg_monitor`, one pool session and one aggregate SELECT remain.

- [ ] **Step 7: Run authoritative and assembled gates**

Run exact OBS-05 C1, C2, C3 and C4 wrappers three times from the authoritative PLAN. Run all OBS-01..05 unit/integration/architecture tests, both app TypeScript commands, root diagnostic delta, `pnpm generate:contract`, source audit, trace containment, migration replay, JSON parse, file-mode/scope checks and `git diff --check`.

- [ ] **Step 8: Report and create one local fix commit**

Append RED/GREEN, mutants, wrappers, gates and concerns to `/Users/vladmihaimiron/Documents/DebateAIRO/.superpowers/sdd/PLAN-ObservationAgent/task-5-report.md`. Stage only the Task-4 allow-list, run `git diff --cached --check`, and commit:

```zsh
git commit -m "fix(observation-agent): honor capacity policy"
git status --porcelain=v1
```

Expected: one fix commit above the replayed provisional OBS-05 commit and empty porcelain.

- [ ] **Step 9: Independently verify and package the fix**

The controller reads the full fix diff, reruns the focused commands, all four OBS-05 wrappers and assembled suite, confirms exact scope/parent/clean-tree evidence, writes a review package for the fix range, and records `review pending` if Claude Opus 5 or explicit egress approval is unavailable.
