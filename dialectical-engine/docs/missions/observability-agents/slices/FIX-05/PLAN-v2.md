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

- [ ] **Step 3: Run type and audit checks honestly**

```text
pnpm typecheck
pnpm audit:source
pnpm audit:architecture
git diff --check
```

Expected: typecheck matches the pinned eight-diagnostic `tests/unit/s14-ui.test.ts` baseline with zero FIX-05 diagnostics. Source audit has no provider row and matches exactly these five existing rows:

```text
packages/obs-capture/install/api.ts reads the process environment outside the register loader
packages/obs-capture/install/runner.ts reads the process environment outside the register loader
packages/obs-capture/install/scheduler.ts reads the process environment outside the register loader
packages/obs-capture/src/runtime/config.ts reads the process environment outside the register loader
packages/obs-capture/src/runtime/index.ts reads the process environment outside the register loader
```

Architecture audit may stop at the recorded missing retired `web/package.json` baseline; the focused exact-row assertion is the provider-edge proof. `git diff --check` exits `0`. Record actual exit codes and output; do not describe a baseline-red command as passing.

- [ ] **Step 4: Prove the exact implementation surface**

The unstaged and staged name lists must contain exactly:

```text
packages/providers/package.json
pnpm-lock.yaml
tests/architecture/fix05-import-graph.test.ts
tools/orphan-audit/src/index.ts
```

Compare hashes before and after for `packages/providers/src/index.ts`, every tracked `packages/obs-capture/**` path, `docs/missions/observability-agents/slices/FIX-05/SPEC.md`, `docs/missions/observability-agents/slices/FIX-05/PLAN.md`, `docs/missions/observability-agents/slices/FIX-05/DECISIONS.md`, and the live Task 5 plan. Every hash must match its preimage.

- [ ] **Step 5: Commit exactly the four implementation paths**

```text
git add packages/providers/package.json pnpm-lock.yaml tools/orphan-audit/src/index.ts tests/architecture/fix05-import-graph.test.ts
git commit -m "fix(providers): declare obs-capture dependency"
```

- [ ] **Step 6: Write and verify the implementation report**

Record the full implementation SHA, exact committed paths, RED/GREEN/mutant/inverse receipts, type/audit baseline outputs, preserved hashes, and post-commit tracked/index checks. State explicitly: no provider source behavior changed; no capture package changed; no dependency or edge beyond provider to capture was added; no registry or RP-0 work occurred; SPEC §5 was not run; C1 PASS, V acceptance, and Done are not claimed.
