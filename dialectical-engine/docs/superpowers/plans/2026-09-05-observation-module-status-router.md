# ObservationAgent Module-Owned Status and Router Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the generic typed status and router-context contracts required for OBS-07 while preserving all inherited ObservationAgent behavior and the dual-feed FixAgent evidence boundary.

**Architecture:** Each module remains the owner of its status facts. Shared core adds only closed privacy-safe projection shapes, retains the router owner's identity, supplies that router's already-validated configuration before the first signal, refreshes its threshold context, and folds `router.status()` into the owner's atomic status snapshot. FixAgent remains unimplemented: status is never repair intake; captured normalized errors and explicit `suspected_defect=true` signals remain separate typed feeds.

**Tech Stack:** TypeScript 7, Node.js 22, Zod 4, Vitest 4, pnpm 11, atomic JSON status storage, existing ObservationAgent journal/delivery pipeline.

**Spec:** `docs/superpowers/specs/2026-09-05-observation-module-status-router-design.md`

## Global Constraints

- ObservationAgent only; do not implement or edit FixAgent or SupportAgent.
- Never fetch, inspect, compare, comment on, modify, merge, or close PR #8/security-hardening.
- No live V acceptance, real channel call, credential access, service install/start/restart, push, or shared-branch merge.
- Use the existing isolated `slice/oa-obs-01` worktree and exact parent recorded in the execution brief; abort if the lane is dirty or the SHA differs.
- The exact code worker is the existing GPT-5.6-sol shared-foundation worker. It may not spawn another implementer.
- Strict TDD: capture focused RED before each production change, implement the minimum GREEN, then run the required reversible mutants and restore exact SHA-256 bytes.
- Do not add arbitrary string or module-authored HTML status fields.
- Preserve signal journal fsync before `router.onSignal`, delivery ATTEMPT fsync before effects, delivery RESULT fsync before mirror, and the legacy router's behavior.
- Preserve the existing `observation.defect_signal_v` filter: only explicit `suspected_defect=true` signals and their matching clears are visible.
- The shared compatibility work ends in one local code commit. Intermediate tasks use verified staged checkpoints, not intermediate code commits.
- Use `apply_patch` for source edits. Do not use destructive git commands, stash unrelated work, or rewrite existing commits.

---

## File Structure

### Shared production files

- Modify `apps/observation-agent/src/core/types.ts`: closed projection types and module/router context types.
- Modify `apps/observation-agent/src/core/runtime.ts`: runtime validation and immutable reconstruction for the new projections.
- Modify `apps/observation-agent/src/store/status.ts`: strict stored schemas, camelCase-to-snake_case conversion, module/router merge validation.
- Modify `apps/observation-agent/src/oactl/core/status.ts`: fixed text rendering for the new projection shapes.
- Modify `apps/observation-agent/src/core/routing.ts`: required router lifecycle, bootstrap/current-context types, legacy empty status snapshot.
- Modify `apps/observation-agent/src/core/modules.ts`: retain and validate router ownership instead of returning a bare factory.
- Modify `apps/observation-agent/src/main.ts`: owned bootstrap, refreshed threshold context, router status collection, and atomic merge.

### Shared tests

- Modify `tests/unit/obs-agent-01-status-projections.test.ts`: source/stored schema round trips and injection/path/duplicate bounds.
- Modify `tests/unit/obs-agent-01-oactl.test.ts`: exact fixed rendering, including board, loopback endpoint, storm count/window, routing rows, UUIDs, components, paths, and external references.
- Modify `tests/unit/obs-agent-01-discovery.test.ts`: owned contribution, one-router rule, fragment match, required lifecycle.
- Modify `tests/unit/obs-agent-01-routing.test.ts`: legacy empty status and unchanged routing behavior under the expanded context.
- Modify `tests/integration/obs-agent-01-delivery.test.ts`: synthetic contributed-router bootstrap, first-signal ordering, and current threshold context.
- Create `tests/integration/obs-agent-01-router-status.test.ts`: namespaced merge, status refresh, collision rejection, and atomic preservation.
- Modify `tests/integration/obs-agent-01-foundation.test.ts`: preserve the exact defect-view boundary.
- Modify `tests/architecture/obs-agent-01-privacy.test.ts`: reject generic string/HTML/unsafe endpoint/path surfaces.
- Modify `tests/architecture/obs-agent-01-runtime.test.ts`: source/ownership/order constraints for shared core.

Do not edit migration files, ObservationAgent requirements/slice records, downstream module files, product files, or any security-hardening artifact in this compatibility commit.

---

### Task 1: Establish the exact clean baseline and capture the status-contract RED

**Files:**
- Read: `docs/superpowers/specs/2026-09-05-observation-module-status-router-design.md`
- Test: `tests/unit/obs-agent-01-status-projections.test.ts`
- Test: `tests/unit/obs-agent-01-oactl.test.ts`
- Test: `tests/architecture/obs-agent-01-privacy.test.ts`

**Interfaces:**
- Consumes: the current `ModuleStatusProjection`, `storedModuleStatusProjectionSchema`, `toStoredModuleStatusProjection`, and `renderStatus` contracts.
- Produces: failing tests that define the complete closed projection surface before production edits.

- [ ] **Step 1: Verify the lane and authority**

Run from the isolated worktree root:

```bash
git status --porcelain=v1 -uall
git rev-parse HEAD
git rev-parse --abbrev-ref HEAD
```

Expected: empty porcelain, exact brief SHA, branch `slice/oa-obs-01`. Read the full design, this plan, execution brief, ObservationAgent requirements/compass, OBS-01 SPEC/PLAN/DECISIONS, OBS-07 SPEC/PLAN/DECISIONS, and current SDD ledger before editing.

- [ ] **Step 2: Run the inherited focused and full OBS-01 baseline**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-01-status-projections.test.ts \
  tests/unit/obs-agent-01-oactl.test.ts \
  tests/unit/obs-agent-01-discovery.test.ts \
  tests/unit/obs-agent-01-routing.test.ts \
  tests/integration/obs-agent-01-delivery.test.ts \
  --reporter=verbose
pnpm exec vitest run \
  tests/unit/obs-agent-01-*.test.ts \
  tests/integration/obs-agent-01-*.test.ts \
  tests/architecture/obs-agent-01-*.test.ts \
  --reporter=verbose
```

Expected: inherited tests pass. A sandbox-only loopback denial may be rerun with the controller's established disposable-test permission; no real service or database is allowed.

- [ ] **Step 3: Add failing source/stored projection tests**

Add table-driven examples with these exact source shapes:

```ts
const required = [
  { kind: "channels", key: "route.fatal", channels: ["digest", "status", "osascript", "sendmail", "kanban"] },
  { kind: "component", key: "storm.root", component: "postgres" },
  { kind: "uuid", key: "ack.signal", value: "70000000-0000-4000-8000-000000000001" },
  { kind: "identifier", key: "board", identifierType: "board", value: "ops-alerts" },
  { kind: "identifier", key: "ticket", identifierType: "external_ref", value: "t_70000001" },
  { kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" },
  { kind: "state_child_path", key: "capture.dir", segments: ["dev-mail-capture"] },
  { kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD", count: 5, windowSeconds: 60 }
] as const;
```

Assert that each converts to a strict stored snake_case representation and round-trips through `storedModuleStatusProjectionSchema`. Assert exact rejection of an unknown field on every shape.

- [ ] **Step 4: Add failing privacy and bounds tests**

Assert rejection of:

```ts
{ kind: "string", key: "message", value: "raw product error" }
{ kind: "identifier", key: "board", identifierType: "board", value: "ops alerts" }
{ kind: "identifier", key: "ticket", identifierType: "external_ref", value: "<script>" }
{ kind: "loopback_endpoint", key: "status", port: 9797, path: "http://0.0.0.0/status" }
{ kind: "loopback_endpoint", key: "status", port: 80, path: "/status" }
{ kind: "state_child_path", key: "capture.dir", segments: ["..", "secret"] }
{ kind: "channels", key: "route.fatal", channels: ["kanban", "kanban"] }
{ kind: "channels", key: "route.fatal", channels: ["webhook"] }
{ kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD", count: 5, windowSeconds: 0 }
```

Also construct a module snapshot with duplicate `(view,key)` values and require `OBSERVATION_STATUS_DUPLICATE_KEY`.

- [ ] **Step 5: Add failing exact-render tests and run RED**

Write a temporary valid status snapshot containing the required projections. Assert that `renderStatus(stateDir)` contains exactly:

```text
board ops-alerts
status http://127.0.0.1:9797/status
storm 5/60s
route fatal digest,status,osascript,sendmail,kanban
storm root postgres
ack signal 70000000-0000-4000-8000-000000000001
ticket t_70000001
capture dir <stateDir>/dev-mail-capture
```

Run:

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-01-status-projections.test.ts \
  tests/unit/obs-agent-01-oactl.test.ts \
  tests/architecture/obs-agent-01-privacy.test.ts \
  --reporter=verbose
```

Expected: FAIL because the new discriminants/templates are absent. Record the exact failure count and causes before production edits.

---

### Task 2: Implement the closed projection schemas and fixed renderer

**Files:**
- Modify: `apps/observation-agent/src/core/types.ts`
- Modify: `apps/observation-agent/src/core/runtime.ts`
- Modify: `apps/observation-agent/src/store/status.ts`
- Modify: `apps/observation-agent/src/oactl/core/status.ts`
- Test: Task 1 files

**Interfaces:**
- Consumes: Task 1's exact source/stored/render expectations.
- Produces: closed `ModuleStatusProjection` variants, strict conversion/storage schemas, and fixed terminal rendering for later router status.

- [ ] **Step 1: Add closed constants and source types**

In `core/types.ts`, add immutable constants/types:

```ts
export const STATUS_CHANNELS = Object.freeze([
  "digest", "status", "osascript", "sendmail", "kanban"
] as const);
export type StatusChannel = typeof STATUS_CHANNELS[number];
export type StatusIdentifierType = "board" | "external_ref";
```

Extend `STATUS_TEMPLATES` with `COUNT_SECONDS_THRESHOLD`. Add the exact source projection variants from Task 1. Do not add a general string, URL, path, or HTML variant.

- [ ] **Step 2: Add runtime schemas and immutable reconstruction**

In `core/runtime.ts`, extend `moduleStatusProjectionSchema` with strict Zod objects matching Task 1. Use:

```ts
const safeIdentifierSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);
const endpointPathSchema = z.string().min(2).max(128)
  .regex(/^\/[a-z0-9][a-z0-9/_-]{0,127}$/u);
const stateSegmentSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u)
  .refine((value) => value !== "." && value !== "..");
```

Require unique channels and one through eight state-path segments. Reconstruct each parsed projection into a frozen `ModuleStatusProjection`; never return mutable input objects.

- [ ] **Step 3: Add strict stored schemas and conversion**

In `store/status.ts`, add snake_case stored forms:

```ts
{ kind: "channels", key, channels, view? }
{ kind: "component", key, component, view? }
{ kind: "uuid", key, value, view? }
{ kind: "identifier", key, identifier_type, value, view? }
{ kind: "loopback_endpoint", key, port, path, view? }
{ kind: "state_child_path", key, segments, view? }
{ kind: "template", key, template: "COUNT_SECONDS_THRESHOLD", count, window_seconds, view? }
```

Retain the 128-projection and 32-module limits. Change duplicate detection from `key` alone to the exact pair `${view ?? ""}\u0000${key}` so distinct views may reuse a key but the same `(view,key)` cannot collide.

- [ ] **Step 4: Add fixed rendering**

In `oactl/core/status.ts`, make `renderProjection` receive `stateDir`. Render only derived fixed forms:

```ts
channels           -> `${projectionLabel(key)} ${channels.join(",")}`
component          -> `${projectionLabel(key)} ${component}`
uuid               -> `${projectionLabel(key)} ${value ?? "UNKNOWN"}`
identifier         -> `${projectionLabel(key)} ${value}`
loopback_endpoint  -> `${projectionLabel(key)} http://127.0.0.1:${port}${path}`
state_child_path   -> `${projectionLabel(key)} ${join(stateDir, ...segments)}`
COUNT_SECONDS_THRESHOLD -> `${projectionLabel(key)} ${count}/${window_seconds}s`
```

The renderer must not accept a stored host, scheme, absolute path, raw label, or raw HTML.

- [ ] **Step 5: Run the focused GREEN and TypeScript checks**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-01-status-projections.test.ts \
  tests/unit/obs-agent-01-oactl.test.ts \
  tests/architecture/obs-agent-01-privacy.test.ts \
  --reporter=verbose
pnpm exec tsc -p apps/observation-agent/tsconfig.json --noEmit
pnpm -C apps/observation-agent exec tsc -p tsconfig.json --noEmit
```

Expected: all focused tests and both established ObservationAgent TypeScript commands pass.

---

### Task 3: Capture the router-ownership, bootstrap, refresh, and status RED

**Files:**
- Test: `tests/unit/obs-agent-01-discovery.test.ts`
- Test: `tests/unit/obs-agent-01-routing.test.ts`
- Test: `tests/integration/obs-agent-01-delivery.test.ts`
- Create: `tests/integration/obs-agent-01-router-status.test.ts`

**Interfaces:**
- Consumes: current bare `routerFactory`, `SignalRouterFactory.create`, `onSignal`, and `onTick` interfaces.
- Produces: failing tests for the owned contribution and current-context lifecycle.

- [ ] **Step 1: Add an owned-discovery RED**

Create a synthetic module with:

```ts
name: "routing",
targetFragmentBasename: "OBS-07.json",
router: { create() { return { onSignal: async () => {}, onTick: async () => {}, status: () => [] }; } }
```

Require discovery to return:

```ts
catalog.routerContribution === {
  moduleName: "routing",
  targetFragmentBasename: "OBS-07.json",
  factory: manifest.router
}
```

Require missing `targetFragmentBasename`, missing `status`, a mismatched contribution, or two routers to fail with `OBSERVATION_MODULE_INVALID` or `OBSERVATION_DUPLICATE_ROUTER` before any factory call.

- [ ] **Step 2: Add a bootstrap/first-signal RED**

Extend the synthetic integration router to record its create input and its first `onSignal` input. Use a target catalog containing only its `OBS-07.json` fragment and a threshold policy containing only `modules.routing` for the router. Assert create receives frozen owned values:

```ts
{
  moduleName: "routing",
  targetFragment: { basename: "OBS-07.json", targets: [], configuration: { notify: { board: "ops-alerts" } } },
  configuration: { notify: { board: "ops-alerts" } },
  thresholds: { storm_count: 5, storm_window_seconds: 60 },
  thresholdVersion: 7
}
```

Assert the router is created before the first durable `AGENT_SELF` signal invokes `onSignal`, and that the signal is readable from the fsynced journal when the router sees it.

- [ ] **Step 3: Add a threshold-refresh RED**

Invoke routing once at version 7, replace the repository policy with version 8 and different `modules.routing`, then invoke a later signal and tick. Assert both later inputs contain version 8/current thresholds and no reread of the target file occurs.

- [ ] **Step 4: Add router-status merge REDs**

In the new integration test, provide ordinary module projections and router `status()` projections for the same owner with distinct `(view,key)` pairs. Assert one atomic snapshot contains both under `modules.routing` and no top-level router namespace.

Then assert:

- duplicate `(view,key)` rejects the new snapshot and preserves the prior status file bytes;
- another module's projections remain unchanged;
- invalid router status never appears in the file;
- `status()` does not run during `onSignal` and runs once after `onTick` before the status write.

- [ ] **Step 5: Run RED**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-01-discovery.test.ts \
  tests/unit/obs-agent-01-routing.test.ts \
  tests/integration/obs-agent-01-delivery.test.ts \
  tests/integration/obs-agent-01-router-status.test.ts \
  --reporter=verbose
```

Expected: FAIL on missing owned contribution/context/status behavior. Existing unrelated delivery assertions remain green.

---

### Task 4: Implement owned router discovery and lifecycle context

**Files:**
- Modify: `apps/observation-agent/src/core/routing.ts`
- Modify: `apps/observation-agent/src/core/modules.ts`
- Modify: `apps/observation-agent/src/main.ts`
- Modify: `apps/observation-agent/src/store/status.ts`
- Test: Task 3 files

**Interfaces:**
- Consumes: Task 3's exact lifecycle tests and Task 2's projection converter.
- Produces: `RouterContribution`, `RouterBootstrapInput`, `RouterCurrentContext`, required `SignalRouter.status`, and atomic owned-status merging.

- [ ] **Step 1: Define the lifecycle types**

In `core/routing.ts`, define:

```ts
export type RouterCurrentContext = Readonly<{
  thresholdVersion: number;
  thresholds: ModuleConfigurationObject;
}>;

export type RouterBootstrapInput = Readonly<{
  stateDir: string;
  delivery: DeliveryCoordinator;
  osascript: OsaScriptDeliveryExecutor;
  moduleName: string;
  targetFragment: ModuleTargetFragment;
  configuration: ModuleConfigurationObject;
  thresholds: ModuleConfigurationObject;
  thresholdVersion: number;
}>;
```

Add `module: RouterCurrentContext` to persisted-signal and tick inputs. Require `status(): readonly ModuleStatusProjection[]` on `SignalRouter`. Make `createLegacyOsaScriptRouter` return `status: () => Object.freeze([])` and ignore module context without changing routing semantics.

- [ ] **Step 2: Retain router ownership in discovery**

In `core/modules.ts`, replace the returned bare `routerFactory` with:

```ts
routerContribution: Readonly<{
  moduleName: string;
  targetFragmentBasename: string;
  factory: SignalRouterFactory;
}> | null;
```

Validate `create` during manifest loading and validate returned router methods after creation. A manifest with `router` must have its own valid `targetFragmentBasename`. Keep the exact one-router rule.

- [ ] **Step 3: Build owned immutable context in main**

After loading target catalog and threshold policy, resolve the contribution's fragment by exact basename. Reject absence or ambiguity before creating the router. Build frozen configuration/threshold values from only that owner:

```ts
const currentRouterModule = () => Object.freeze({
  thresholdVersion: policy.version,
  thresholds: Object.freeze(policy.value.modules?.[owner.moduleName] ?? {})
});
```

Pass the initial owner values to `factory.create` before emitting the START `AGENT_SELF` signal. Pass a fresh `module: currentRouterModule()` to every `onSignal` and `onTick` call.

- [ ] **Step 4: Merge router status atomically**

Add a pure exported helper in `store/status.ts`:

```ts
export function mergeModuleStatus(
  modules: ReadonlyMap<string, readonly StoredModuleStatusProjection[]>,
  routerOwner: string | null,
  routerStatus: readonly StoredModuleStatusProjection[]
): Readonly<Record<string, readonly StoredModuleStatusProjection[]>>;
```

It copies existing arrays, appends router projections only to the exact owner, and validates the complete result with the same module-status schema before returning a frozen value. It never mutates the input map. In `main.ts`, call `router.status()` only after `onTick`, convert every projection, merge, and pass the result to the single atomic `writeStatusSnapshot` call.

- [ ] **Step 5: Run focused GREEN and TypeScript checks**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-01-discovery.test.ts \
  tests/unit/obs-agent-01-routing.test.ts \
  tests/integration/obs-agent-01-delivery.test.ts \
  tests/integration/obs-agent-01-router-status.test.ts \
  --reporter=verbose
pnpm exec tsc -p apps/observation-agent/tsconfig.json --noEmit
pnpm -C apps/observation-agent exec tsc -p tsconfig.json --noEmit
```

Expected: all focused tests pass; no new agent diagnostic exists.

---

### Task 5: Preserve the defect-feed and runtime privacy boundaries

**Files:**
- Modify: `tests/integration/obs-agent-01-foundation.test.ts`
- Modify: `tests/architecture/obs-agent-01-privacy.test.ts`
- Modify: `tests/architecture/obs-agent-01-runtime.test.ts`
- Production: no new file unless a test reveals a defect in Tasks 2 or 4

**Interfaces:**
- Consumes: the existing migration/view and the new shared projection/router contracts.
- Produces: regression evidence that status cannot become FixAgent intake and that core ordering/privacy remains intact.

- [ ] **Step 1: Add the defect-view regression test**

Insert one OPEN `observation.signal` with `suspected_defect=false` and one with `suspected_defect=true`/valid `defect_kind`, plus matching CLEARED rows. Query `observation.defect_signal_v` as the listener role. Assert it returns only the explicit suspected-defect OPEN and its matching CLEARED row. Do not change the migration or grant surface.

- [ ] **Step 2: Add source-boundary assertions**

Require that production status/router files contain none of:

```text
raw_text
occurrence_detail
content_ciphertext
innerHTML
dangerouslySetInnerHTML
process.env
0.0.0.0
webhook
```

The existing environment module remains the sole allowed environment reader. Require that `main.ts` persists via `persistSignal` before calling `router.onSignal`, and calls `router.onTick` before `router.status` and `writeStatusSnapshot`.

- [ ] **Step 3: Run the focused privacy/foundation GREEN**

```bash
pnpm exec vitest run \
  tests/integration/obs-agent-01-foundation.test.ts \
  tests/architecture/obs-agent-01-privacy.test.ts \
  tests/architecture/obs-agent-01-runtime.test.ts \
  --reporter=verbose
```

Expected: PASS without production changes. If it fails, fix only the exact shared defect introduced in Tasks 2 or 4 and rerun Tasks 2–5.

---

### Task 6: Run reversible mutants and authoritative three-run wrappers

**Files:**
- Mutate temporarily: only files changed in Tasks 2 and 4
- Restore: exact pre-mutant SHA-256 for every mutated file

**Interfaces:**
- Consumes: all final shared production/tests.
- Produces: refutation evidence, byte-exact restoration, and stable repeated GREEN.

- [ ] **Step 1: Record final pre-mutant hashes**

```bash
shasum -a 256 \
  dialectical-engine/apps/observation-agent/src/core/types.ts \
  dialectical-engine/apps/observation-agent/src/core/runtime.ts \
  dialectical-engine/apps/observation-agent/src/store/status.ts \
  dialectical-engine/apps/observation-agent/src/oactl/core/status.ts \
  dialectical-engine/apps/observation-agent/src/core/routing.ts \
  dialectical-engine/apps/observation-agent/src/core/modules.ts \
  dialectical-engine/apps/observation-agent/src/main.ts
```

- [ ] **Step 2: Kill each projection mutant independently**

Use `apply_patch` for one mutant at a time, run only its focused assertion, then reverse it with `apply_patch` and verify the file hash exactly:

1. accept `{kind:"string"}`;
2. allow `0.0.0.0`/arbitrary endpoint host;
3. allow `..` in a state-child path;
4. accept an unknown channel;
5. allow duplicate `(view,key)`.

Expected: each focused test fails for the intended assertion, never for a syntax error.

- [ ] **Step 3: Kill each router mutant independently**

Repeat the same process for:

1. omit the owner fragment/configuration from create input;
2. emit the initial START signal before router creation;
3. reuse bootstrap thresholds after policy reload;
4. skip `router.status()` or place it under a top-level namespace;
5. allow router status to overwrite an existing `(view,key)`.

Expected: each focused test fails for the intended assertion and all hashes restore exactly.

- [ ] **Step 4: Run the projection cluster three consecutive times**

```bash
set -o pipefail
test_paths=(tests/unit/obs-agent-01-status-projections.test.ts tests/unit/obs-agent-01-oactl.test.ts tests/architecture/obs-agent-01-privacy.test.ts)
for test_path in "${test_paths[@]}"; do test -f "$test_path" || exit 1; done
for run in 1 2 3; do
  out="$(mktemp "${TMPDIR:-/tmp}/obs-status-compat.XXXXXX")" || exit 1
  NO_COLOR=1 pnpm exec vitest run "${test_paths[@]}" --reporter=verbose 2>&1 | tee "$out"
  test "${pipestatus[1]}" -eq 0 || exit 1
  grep -Eq '^[[:space:]]*Tests[[:space:]]+[1-9][0-9]*[[:space:]]+passed' "$out" || exit 1
done
```

- [ ] **Step 5: Run the router cluster three consecutive times**

Use the same fail-closed wrapper with:

```text
tests/unit/obs-agent-01-discovery.test.ts
tests/unit/obs-agent-01-routing.test.ts
tests/integration/obs-agent-01-delivery.test.ts
tests/integration/obs-agent-01-router-status.test.ts
tests/integration/obs-agent-01-foundation.test.ts
tests/architecture/obs-agent-01-runtime.test.ts
```

Expected: all three runs pass and the anchored test summary is present each time.

---

### Task 7: Run full regression, audit scope, report, and create one code commit

**Files:**
- Create outside repository: `.superpowers/sdd/PLAN-ObservationAgent/task-1-compatibility-6-report.md`
- Stage: only the production/test allow-list in this plan

**Interfaces:**
- Consumes: all completed tasks and restored final bytes.
- Produces: one verified local compatibility commit and immutable execution evidence for controller replay.

- [ ] **Step 1: Run the complete inherited OBS-01 suite**

```bash
pnpm exec vitest run \
  tests/unit/obs-agent-01-*.test.ts \
  tests/integration/obs-agent-01-*.test.ts \
  tests/architecture/obs-agent-01-*.test.ts \
  --reporter=verbose
```

Expected: every inherited and new OBS-01 test passes.

- [ ] **Step 2: Run TypeScript and contract gates**

```bash
pnpm generate:contract
pnpm exec tsc -p apps/observation-agent/tsconfig.json --noEmit
pnpm -C apps/observation-agent exec tsc -p tsconfig.json --noEmit
pnpm typecheck
```

Expected: contract and both ObservationAgent commands pass. Root typecheck reproduces only the exact inherited diagnostics recorded in the brief, with zero new ObservationAgent diagnostic.

- [ ] **Step 3: Run privacy, source, trace, and diff gates**

```bash
pnpm audit:source
pnpm audit:text-bytes
pnpm audit:orphans
pnpm audit:architecture
git diff --check
git status --porcelain=v1 -uall
```

Run the existing trace-containment command from the latest OBS-01 report and prove zero resolution outside the isolated worktree. Audit failures are acceptable only when they exactly equal the inherited documented baselines; record exact output and prove zero new row.

- [ ] **Step 4: Verify exact scope and modes**

Require every changed path to be one of the files listed under File Structure, every file mode to be `100644`, no migration/requirements/downstream/product/lockfile path, and no untracked scratch file. Run `git diff --check` again after staging.

- [ ] **Step 5: Write the report**

Record:

- exact base and branch;
- authority read list;
- RED counts and causes before each production change;
- GREEN counts;
- every mutant, intended failure, and restored hash;
- three-run wrapper results;
- full suite/type/contract/audit/trace/scope results;
- changed path list;
- inherited-only concerns;
- explicit statement that no prohibited action occurred.

- [ ] **Step 6: Create the single local code commit**

```bash
git add -- <exact allow-listed production and test paths>
git diff --cached --check
git diff --cached --name-status
git commit -m "refactor(observation-agent): support module-owned router status"
```

Do not include this plan/design documentation commit in the code commit's changed-path count.

- [ ] **Step 7: Read back the final lane**

```bash
git status --porcelain=v1 -uall
git rev-parse HEAD
git rev-parse HEAD^
git show --stat --oneline --summary HEAD
git diff-tree --no-commit-id --name-status -r HEAD
```

Expected: clean porcelain; one new code commit whose parent is the plan commit recorded in the brief; exact allow-list only.

---

## Controller Handoff After the Shared Commit

The controller independently repeats the focused clusters, full OBS-01 suite, both agent TypeScript commands, root diagnostic delta, trace containment, source/privacy/audit, scope/mode/diff, and clean-tree checks. It then creates an immutable review patch.

Only after controller verification:

1. replay OBS-02 through OBS-06 in order, preserving each original patch id when mechanically possible;
2. verify the assembled OBS-01 through OBS-06 suite;
3. advance the clean OBS-07 lane to the repaired OBS-06 head;
4. resume the existing exact GPT-5.6-sol OBS-07 worker under its frozen SPEC/PLAN/DECISIONS;
5. require OBS-07 strict RED/GREEN/refutations, one local commit, and assembled OBS-01 through OBS-07 verification;
6. retry Claude Opus 5 review only when provider transport and explicit external-code-egress approval are available.

Reviewer availability does not idle provisional local work. No review or test result authorizes push, merge, live acceptance, FixAgent/SupportAgent implementation, or PR #8/security-hardening interaction.
