# FIX-05 Provider Capture Dependency Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-reviewed provider capture import resolvable from an isolated production deployment by declaring the direct dependency at every existing package-accounting boundary.

**Architecture:** Keep the C1 provider implementation byte-identical. Add one direct provider runtime dependency, mirror it in the provider lock importer and provider audit allowlist, then extend the existing FIX-05 architecture test so workspace-root dependency leakage cannot mask the package contract.

**Tech Stack:** TypeScript ESM, Node 22.23.1, pnpm 11.20.0, Vitest 4.1.10, workspace protocol dependencies.

**Spec:** `docs/missions/observability-agents/slices/FIX-05/SPEC-v2.md`

## Global Constraints

- `SPEC-v2.md` controls only this dependency correction; frozen `SPEC.md` continues to control C1 behavior and V acceptance.
- Write exactly four implementation paths: `packages/providers/package.json`, the `packages/providers` importer in `pnpm-lock.yaml`, the `providers` row in `tools/orphan-audit/src/index.ts`, and `tests/architecture/fix05-import-graph.test.ts`.
- Add only `@debateai/obs-capture: workspace:*`, its exact provider lock entry, and the matching provider allowlist member. Add no other dependency or edge.
- Keep `packages/providers/src/index.ts`, every `packages/obs-capture/**` path, every other test, and the live Task 5 plan byte-identical.
- Make no registry, safe-template, RP-0, stored-row, C1 PASS, V acceptance, or Done claim.
- RED precedes GREEN. The focused cluster runs three times; the worst run is the verdict. Each source mutant is restored byte-for-byte before the next mutation.

---

### Task 1: Add the isolated package-boundary regression proof

**Files:**

- Modify: `tests/architecture/fix05-import-graph.test.ts`
- Read: `packages/providers/package.json`
- Read: `pnpm-lock.yaml`
- Read: `tools/orphan-audit/src/index.ts`

**Interfaces:**

- Consumes: the `@debateai/providers` workspace selector; Node's ESM loader; the existing `traceProviderImport()` load-only proof.
- Produces: four architecture tests: exact metadata contract, isolated production deployment import, deployed-edge mutant, and the retained no-`pg`/no-product-database graph proof.

- [ ] **Step 1: Replace the architecture test with the complete regression file**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

interface ImportTrace {
  readonly status: number | null;
  readonly stderr: string;
  readonly resolved: readonly string[];
}

interface CommandResult {
  readonly status: number | null;
  readonly stderr: string;
}

const root = fileURLToPath(new URL("../..", import.meta.url));
const tsxLoader = fileURLToPath(import.meta.resolve("tsx"));

function traceProviderImport(): ImportTrace {
  const script = `
    import { registerHooks } from "node:module";
    const resolved = [];
    registerHooks({ resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      resolved.push(String(result.url));
      return result;
    }});
    await import("@debateai/providers");
    process.stdout.write(JSON.stringify(resolved));
  `;
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8" },
  );
  let resolved: readonly string[] = [];
  try {
    resolved = JSON.parse(child.stdout) as readonly string[];
  } catch {
    resolved = [];
  }
  return Object.freeze({ status: child.status, stderr: child.stderr, resolved });
}

function contains(trace: ImportTrace, pattern: RegExp): boolean {
  return trace.resolved.some((value) => pattern.test(value));
}

function deployProvider(label: string): { readonly directory: string; readonly result: CommandResult } {
  const directory = mkdtempSync(join(tmpdir(), `fix05-provider-${label}-`));
  const child = spawnSync(
    "pnpm",
    ["--filter", "@debateai/providers", "deploy", "--legacy", "--prod", directory],
    { cwd: root, encoding: "utf8" },
  );
  return Object.freeze({
    directory,
    result: Object.freeze({ status: child.status, stderr: child.stderr }),
  });
}

function importDeployedProvider(directory: string): CommandResult {
  const entry = pathToFileURL(join(directory, "src/index.ts")).href;
  const child = spawnSync(
    process.execPath,
    ["--import", tsxLoader, "--input-type=module", "-e", `await import(${JSON.stringify(entry)})`],
    { cwd: directory, encoding: "utf8" },
  );
  return Object.freeze({ status: child.status, stderr: child.stderr });
}

function providerLockImporter(lockfile: string): string {
  return lockfile.match(/\n  packages\/providers:\n([\s\S]*?)(?=\n  \S)/u)?.[1] ?? "";
}

describe("FIX-05 provider import graph", () => {
  it("declares the exact provider dependency contract", () => {
    const manifest = JSON.parse(readFileSync(join(root, "packages/providers/package.json"), "utf8")) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    expect(manifest.dependencies?.["@debateai/obs-capture"]).toBe("workspace:*");

    const importer = providerLockImporter(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
    expect(importer.match(/'@debateai\/obs-capture':/gu)).toHaveLength(1);
    expect(importer).toContain(`      '@debateai/obs-capture':
        specifier: workspace:*
        version: link:../obs-capture`);

    const auditSource = readFileSync(join(root, "tools/orphan-audit/src/index.ts"), "utf8");
    expect(auditSource.match(/^\s*\["providers".*$/mu)?.[0]).toBe(
      `  ["providers", "packages/providers", ["kernel", "register", "ledger", "obs-capture"]],`,
    );
  });

  it("imports an isolated provider production deployment", () => {
    const deployment = deployProvider("green");
    try {
      expect(deployment.result.status, deployment.result.stderr).toBe(0);
      const imported = importDeployedProvider(deployment.directory);
      expect(imported.status, imported.stderr).toBe(0);
      expect(existsSync(join(
        deployment.directory,
        "node_modules/@debateai/obs-capture/package.json",
      ))).toBe(true);
    } finally {
      rmSync(deployment.directory, { recursive: true, force: true });
    }
  });

  it("rejects a deployed provider whose capture edge is removed", () => {
    const deployment = deployProvider("missing-edge");
    try {
      expect(deployment.result.status, deployment.result.stderr).toBe(0);
      rmSync(join(deployment.directory, "node_modules/@debateai/obs-capture"), {
        recursive: true,
        force: true,
      });
      const imported = importDeployedProvider(deployment.directory);
      expect(imported.status).not.toBe(0);
      expect(imported.stderr).toContain("ERR_MODULE_NOT_FOUND");
      expect(imported.stderr).toContain("@debateai/obs-capture");
    } finally {
      rmSync(deployment.directory, { recursive: true, force: true });
    }
  });

  it("loads only the capture core and never pg or the product database package", () => {
    const trace = traceProviderImport();
    console.info("FIX-05 provider resolve trace", JSON.stringify(
      trace.resolved.filter((value) => /providers|obs-capture|\/pg(?:@|\/)|@debateai\/db|\/packages\/db\//u.test(value)),
    ));

    expect(trace.status, trace.stderr).toBe(0);
    expect(contains(trace, /\/packages\/obs-capture\/src\/index\.ts$/u)).toBe(true);
    expect(contains(trace, /\/pg(?:@|\/)/u)).toBe(false);
    expect(contains(trace, /@debateai\/db|\/packages\/db\//u)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the RED and inverse control**

Run from reviewed implementation commit `7459c3fc9709054c532942e063b46cf9fd8301ff`, with only the test edit present:

```text
pnpm exec vitest run tests/architecture/fix05-import-graph.test.ts --reporter=dot
```

Expected: the exact-contract test is RED because the manifest value is absent; the isolated deployment test is RED with `ERR_MODULE_NOT_FOUND` naming `@debateai/obs-capture`; the removed-edge mutant test is GREEN; the pre-existing load-only graph test is GREEN and still reports zero `pg` and zero product-database imports. A deployment command crash is BROKEN, not the required RED.

---

### Task 2: Declare the direct dependency at all three accounting boundaries

**Files:**

- Modify: `packages/providers/package.json`
- Modify: `pnpm-lock.yaml`, `packages/providers` importer only
- Modify: `tools/orphan-audit/src/index.ts`, `providers` row only
- Test: `tests/architecture/fix05-import-graph.test.ts`

**Interfaces:**

- Consumes: the existing `packages/obs-capture` workspace package.
- Produces: `@debateai/providers` direct runtime resolution of `@debateai/obs-capture`; matching lock and architecture declarations.

- [ ] **Step 1: Add the exact manifest dependency**

Keep the one-line manifest and add this one entry inside `dependencies`:

```json
"@debateai/obs-capture":"workspace:*"
```

Do not change any version, script, export, or other dependency.

- [ ] **Step 2: Add the exact provider lock importer entry**

Insert between the existing ledger and register entries under `packages/providers`:

```yaml
      '@debateai/obs-capture':
        specifier: workspace:*
        version: link:../obs-capture
```

Do not regenerate or reorder any other lockfile byte.

- [ ] **Step 3: Add the exact provider audit edge**

Replace only the provider row with:

```ts
  ["providers", "packages/providers", ["kernel", "register", "ledger", "obs-capture"]],
```

- [ ] **Step 4: Run GREEN once before mutation work**

```text
pnpm exec vitest run tests/architecture/fix05-import-graph.test.ts --reporter=dot
```

Expected: `1` file passed and `4` tests passed. The isolated deployment import exits `0`.

---

### Task 3: Falsify every new assertion and restore GREEN

**Files:**

- Mutate then restore: `packages/providers/package.json`
- Mutate then restore: `pnpm-lock.yaml`, `packages/providers` importer only
- Mutate then restore: `tools/orphan-audit/src/index.ts`, `providers` row only
- Test: `tests/architecture/fix05-import-graph.test.ts`

**Interfaces:**

- Consumes: Task 2's GREEN bytes.
- Produces: named RED receipts for all three source declarations plus the self-contained deployed-edge mutant receipt.

- [ ] **Step 1: Kill the manifest mutant**

Temporarily remove only `"@debateai/obs-capture":"workspace:*"` from the provider manifest. Run the architecture test. Expected: the exact-contract test is RED; if deployment starts, the isolated import is also RED. Restore the manifest byte-for-byte and require `4/4` GREEN.

- [ ] **Step 2: Kill the lock-importer mutant**

Temporarily remove only the three-line provider lock stanza. Run the architecture test. Expected: the exact-contract test is RED at its one-occurrence or exact-stanza assertion; a deploy refusal also counts only after that named assertion is recorded. Restore the lockfile byte-for-byte and require `4/4` GREEN.

- [ ] **Step 3: Kill the allowlist mutant**

Temporarily remove only `"obs-capture"` from the provider row. Run the architecture test. Expected: the exact-contract test is RED at the exact-row assertion. Restore the audit source byte-for-byte and require `4/4` GREEN.

- [ ] **Step 4: Record the deployed-edge mutant and inverse**

Run the restored architecture test. The `rejects a deployed provider whose capture edge is removed` case must be GREEN only because its child import returns nonzero with the exact missing-package evidence. The retained load-only test must also be GREEN with zero `pg` and zero product-database resolutions; it is the inverse neighbor that stayed GREEN during Task 1's package-boundary RED.

---

### Task 4: Verify scope, commit the four-file implementation, and report without acceptance claims

**Files:**

- Verify: the four implementation paths from `SPEC-v2.md` §3
- Read: `tests/unit/fix05-provider-exhaustion.test.ts`
- Read: `docs/missions/observability-agents/TYPECHECK-BASELINE.md`
- Create after the implementation commit: the normal FIX-05 implementation report outside the product commit

**Interfaces:**

- Consumes: restored GREEN bytes and the reviewed C1 implementation.
- Produces: one four-path implementation commit and evidence that all excluded surfaces remained unchanged.

- [ ] **Step 1: Run the focused cluster three fresh times**

```text
for run in 1 2 3; do
  out=$(NO_COLOR=1 pnpm exec vitest run tests/architecture/fix05-import-graph.test.ts --reporter=dot 2>&1)
  rc=$?
  printf '%s\n' "$out"
  printf 'FIX-05-DEPENDENCY run=%s rc=%s\n' "$run" "$rc"
  test "$rc" -eq 0 || exit "$rc"
  case "$out" in
    *"Test Files  1 passed (1)"*"Tests  4 passed (4)"*) ;;
    *) exit 1 ;;
  esac
done
```

Expected: three anchored `run=<1|2|3> rc=0` receipts; every run reports `1` file and `4` tests passed. The wrapper fails on a missing test file, an empty filter, a nonzero child, or a zero-test summary.

Authoring-time hostile check on 2026-09-05: the wrapper returned `1` against the current one-test file, `1` for a missing test path, and `1` for a filter matching no test. None can produce a false GREEN receipt.

- [ ] **Step 2: Run the C1 neighbor set**

```text
pnpm exec vitest run tests/unit/fix05-provider-exhaustion.test.ts tests/architecture/fix05-import-graph.test.ts --reporter=dot
```

Expected: `2` files passed and `8` tests passed. No provider unit fixture changes.

- [ ] **Step 3: Run the mandatory generation, typecheck, and containment sequence**

Start from the FIX-05 implementation worktree with exactly the four authorized tracked edits and an empty index. Run generation first and require the ignored generated tree, the global tracked-name set, and the index to remain byte-identical:

```text
set -e
expected_paths=$'dialectical-engine/packages/providers/package.json\ndialectical-engine/pnpm-lock.yaml\ndialectical-engine/tests/architecture/fix05-import-graph.test.ts\ndialectical-engine/tools/orphan-audit/src/index.ts'
generated_paths=$'packages/contract/generated/client.ts\npackages/contract/generated/field-inventory.json\npackages/contract/generated/openapi.json'
unstaged_before=$(git diff --name-only | LC_ALL=C sort)
staged_before=$(git diff --cached --name-only | LC_ALL=C sort)
test "$unstaged_before" = "$expected_paths"
if test -n "$staged_before"; then
  printf 'STOP: pre-generation index is not empty\n'
  printf '%s\n' "$staged_before"
  exit 1
fi
test "$(rg --files packages/contract/generated | LC_ALL=C sort)" = "$generated_paths"
generated_before=$(git hash-object packages/contract/generated/client.ts packages/contract/generated/field-inventory.json packages/contract/generated/openapi.json)
set +e
out=$(pnpm generate:contract 2>&1)
rc=$?
set -e
printf '%s\n' "$out"
printf 'generate_contract_rc=%s\n' "$rc"
test "$rc" -eq 0
generated_after=$(git hash-object packages/contract/generated/client.ts packages/contract/generated/field-inventory.json packages/contract/generated/openapi.json)
test "$generated_after" = "$generated_before"
test "$(rg --files packages/contract/generated | LC_ALL=C sort)" = "$generated_paths"
test "$(git diff --name-only | LC_ALL=C sort)" = "$unstaged_before"
test "$(git diff --cached --name-only | LC_ALL=C sort)" = "$staged_before"
```

Expected: `generate_contract_rc=0`; the ignored generated tree contains exactly the three named files with identical pre/post blob hashes; the only global unstaged paths are the four authorized paths; the index remains empty. Any generated byte/path change or other tracked-name change is a blocker.

Run the full typecheck next. Exit `1` is allowed only with the pinned invariant: exactly eight diagnostics, every one in `tests/unit/s14-ui.test.ts`, with the first diagnostic still the recorded `TS2307` for the deleted presentation module. Every other diagnostic path, any ninth diagnostic, or any FIX-05 diagnostic fails the step:

```text
set +e
typecheck_out=$(NO_COLOR=1 pnpm typecheck 2>&1)
typecheck_rc=$?
set -e
printf '%s\n' "$typecheck_out"
printf 'typecheck_rc=%s\n' "$typecheck_rc"
test "$typecheck_rc" -eq 1
FIX05_TYPECHECK_OUTPUT="$typecheck_out" node --input-type=module -e '
  const output = process.env.FIX05_TYPECHECK_OUTPUT ?? "";
  const diagnostics = output.split(/\r?\n/u).filter((line) => /error TS\d+:/u.test(line));
  const pinnedFile = diagnostics.filter((line) => /^tests\/unit\/s14-ui\.test\.ts\(\d+,\d+\): error TS\d+:/u.test(line));
  const fix05 = diagnostics.filter((line) => /packages\/providers|tests\/(?:architecture|unit)\/fix05-|tools\/orphan-audit/u.test(line));
  if (diagnostics.length !== 8) throw new Error(`expected 8 pinned diagnostics, saw ${diagnostics.length}`);
  if (pinnedFile.length !== diagnostics.length) throw new Error(`diagnostics outside pinned file:\n${diagnostics.filter((line) => !pinnedFile.includes(line)).join("\n")}`);
  if (!diagnostics[0].startsWith("tests/unit/s14-ui.test.ts(19,8): error TS2307: Cannot find module \x27../../web/lib/v3Presentation.js\x27")) throw new Error("first pinned diagnostic changed");
  if (fix05.length !== 0) throw new Error(`FIX-05 diagnostics:\n${fix05.join("\n")}`);
  console.log(JSON.stringify({ diagnostics: diagnostics.length, s14Ui: pinnedFile.length, fix05: fix05.length }));
'
```

Expected: the parser exits `0` and prints exactly the counts `{diagnostics:8, s14Ui:8, fix05:0}`. Preserve the full eight-line output in the report; do not repair or suppress any pinned diagnostic.

Finally, run a second full compiler pass with resolution tracing and positively prove containment. The parser requires at least one absolute successful resolution, zero successful absolute paths outside the FIX-05 worktree root, the same exact eight-diagnostic pin, and zero FIX-05 diagnostics:

```text
node --input-type=module -e '
  import { spawnSync } from "node:child_process";
  import { isAbsolute, relative, resolve, sep } from "node:path";
  const root = resolve(process.cwd());
  const child = spawnSync("pnpm", ["exec", "tsc", "--noEmit", "--traceResolution"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (child.error !== undefined) throw child.error;
  if (child.signal !== null) throw new Error(`trace compiler terminated by ${child.signal}`);
  const output = `${child.stdout}\n${child.stderr}`;
  const successful = [...output.matchAll(/was successfully resolved to \x27([^\x27]+)\x27/gu)].map((match) => match[1]);
  const absolute = successful.filter((value) => isAbsolute(value));
  if (absolute.length === 0) throw new Error("trace contained zero absolute successful resolutions");
  const escaped = absolute.filter((value) => {
    const pathFromRoot = relative(root, resolve(value));
    return pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot);
  });
  const diagnostics = output.split(/\r?\n/u).filter((line) => /error TS\d+:/u.test(line));
  const pinnedFile = diagnostics.filter((line) => /^tests\/unit\/s14-ui\.test\.ts\(\d+,\d+\): error TS\d+:/u.test(line));
  const fix05 = diagnostics.filter((line) => /packages\/providers|tests\/(?:architecture|unit)\/fix05-|tools\/orphan-audit/u.test(line));
  if (escaped.length !== 0) throw new Error(`resolution escaped worktree:\n${escaped.join("\n")}`);
  if (diagnostics.length !== 8 || pinnedFile.length !== diagnostics.length) {
    throw new Error(`trace diagnostics differ from pin: total=${diagnostics.length} s14Ui=${pinnedFile.length}`);
  }
  if (!diagnostics[0].startsWith("tests/unit/s14-ui.test.ts(19,8): error TS2307: Cannot find module \x27../../web/lib/v3Presentation.js\x27")) throw new Error("first trace pin diagnostic changed");
  if (fix05.length !== 0) throw new Error(`FIX-05 trace diagnostics:\n${fix05.join("\n")}`);
  console.log(JSON.stringify({ compilerStatus: child.status, absoluteSuccessfulResolutions: absolute.length, escaped: escaped.length, diagnostics: diagnostics.length, fix05: fix05.length }));
'
```

Expected: the containment parser exits `0` and prints positive `absoluteSuccessfulResolutions`, `escaped:0`, `diagnostics:8`, and `fix05:0`. The compiler's nonzero status reflects only the parsed pin; the parser, not that raw status, is the gate. A truncated trace, zero-resolution trace, signal, spawn error, escaped path, ninth diagnostic, different diagnostic path/code, or FIX-05 diagnostic fails closed.

- [ ] **Step 4: Run audits, verify preserved hashes, and prove the exact pre-stage state**

```text
pnpm audit:source
pnpm audit:architecture
git diff --check
```

Expected: source audit has no provider row and matches exactly these five existing rows:

```text
packages/obs-capture/install/api.ts reads the process environment outside the register loader
packages/obs-capture/install/runner.ts reads the process environment outside the register loader
packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader
packages/obs-capture/src/runtime/config.ts reads the process environment outside the register loader
packages/obs-capture/src/runtime/index.ts reads the process environment outside the register loader
```

Architecture audit may stop at the recorded missing retired `web/package.json` baseline; the focused exact-row assertion is the provider-edge proof. `git diff --check` exits `0`. Record actual exit codes and output; do not describe a baseline-red command as passing.

Compare hashes before and after for `packages/providers/src/index.ts`, every tracked `packages/obs-capture/**` path, `docs/missions/observability-agents/slices/FIX-05/SPEC.md`, `docs/missions/observability-agents/slices/FIX-05/PLAN.md`, `docs/missions/observability-agents/slices/FIX-05/DECISIONS.md`, and the live Task 5 plan. Every hash must match its preimage.

Immediately before staging, run this global tracked-state checkpoint:

```text
set -e
expected_paths=$'dialectical-engine/packages/providers/package.json\ndialectical-engine/pnpm-lock.yaml\ndialectical-engine/tests/architecture/fix05-import-graph.test.ts\ndialectical-engine/tools/orphan-audit/src/index.ts'
unstaged_names=$(git diff --name-only | LC_ALL=C sort)
staged_names=$(git diff --cached --name-only | LC_ALL=C sort)
if test "$unstaged_names" != "$expected_paths"; then
  printf 'STOP: pre-stage unstaged paths differ from FIX-05 authority\n'
  printf '%s\n' "$unstaged_names"
  exit 1
fi
if test -n "$staged_names"; then
  printf 'STOP: pre-stage index contains paths\n'
  printf '%s\n' "$staged_names"
  exit 1
fi
printf 'pre_stage_unstaged=exact_four pre_stage_index=empty\n'
```

Expected: the only unstaged tracked paths are the exact four Git-root paths above and the index is empty. Stop before `git add` on any missing, extra, or staged path.

- [ ] **Step 5: Stage exactly four paths, verify the transition, and commit exactly four**

```text
set -e
expected_paths=$'dialectical-engine/packages/providers/package.json\ndialectical-engine/pnpm-lock.yaml\ndialectical-engine/tests/architecture/fix05-import-graph.test.ts\ndialectical-engine/tools/orphan-audit/src/index.ts'
git add packages/providers/package.json pnpm-lock.yaml tools/orphan-audit/src/index.ts tests/architecture/fix05-import-graph.test.ts
staged_names=$(git diff --cached --name-only | LC_ALL=C sort)
unstaged_names=$(git diff --name-only | LC_ALL=C sort)
if test "$staged_names" != "$expected_paths"; then
  printf 'STOP: staged paths differ from FIX-05 authority\n'
  printf '%s\n' "$staged_names"
  exit 1
fi
if test -n "$unstaged_names"; then
  printf 'STOP: unstaged tracked paths remain after exact git add\n'
  printf '%s\n' "$unstaged_names"
  exit 1
fi
git diff --cached --check
git commit -m "fix(providers): declare obs-capture dependency"
test "$(git show -s --format=%s HEAD)" = 'fix(providers): declare obs-capture dependency'
commit_paths=$(git diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort)
if test "$commit_paths" != "$expected_paths"; then
  printf 'STOP: created commit paths differ from FIX-05 authority\n'
  printf '%s\n' "$commit_paths"
  exit 1
fi
printf 'post_stage_staged=exact_four post_stage_unstaged=empty commit_paths=exact_four\n'
```

- [ ] **Step 6: Prove the post-commit tracked state, then write the implementation report**

```text
set -e
post_commit_unstaged=$(git diff --name-only | LC_ALL=C sort)
post_commit_staged=$(git diff --cached --name-only | LC_ALL=C sort)
if test -n "$post_commit_unstaged"; then
  printf 'STOP: post-commit tracked worktree is not empty\n'
  printf '%s\n' "$post_commit_unstaged"
  exit 1
fi
if test -n "$post_commit_staged"; then
  printf 'STOP: post-commit index is not empty\n'
  printf '%s\n' "$post_commit_staged"
  exit 1
fi
printf 'post_commit_tracked=empty post_commit_index=empty\n'
```

Record the full implementation SHA, exact committed paths, RED/GREEN/mutant/inverse receipts, type/audit baseline outputs, preserved hashes, and post-commit tracked/index checks. State explicitly: no provider source behavior changed; no capture package changed; no dependency or edge beyond provider to capture was added; no registry or RP-0 work occurred; SPEC §5 was not run; C1 PASS, V acceptance, and Done are not claimed.
