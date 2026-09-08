import { describe, expect, it } from "vitest";

import {
  validatePatch,
  type HumanOwnedCatalog,
} from "../../tools/obs-listener/src/landing/validate-patch.js";

const invariant = Object.freeze({
  id: "INV-SCHEDULER-RETURN",
  description: "scheduler returns its authoritative report",
  command: "pnpm vitest run tests/unit/scheduler-return.test.ts",
  ownedBy: "V" as const,
});
const catalog: HumanOwnedCatalog = Object.freeze({ invariants: Object.freeze([invariant]) });
const productionPath = "apps/scheduler/src/index.ts";
const testPath = "tests/unit/scheduler-return.test.ts";
const allowlist = Object.freeze([productionPath, testPath]);

function patchFor(production = productionPath, test = testPath): string {
  return [
    `diff --git a/${production} b/${production}`,
    `--- a/${production}`,
    `+++ b/${production}`,
    "@@ -1 +1 @@",
    "-export const result = false;",
    "+export const result = true;",
    `diff --git a/${test} b/${test}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${test}`,
    "@@ -0,0 +1,3 @@",
    "+// invariant: INV-SCHEDULER-RETURN",
    "+import { expect, test } from \"vitest\";",
    "+test(\"returns the report\", () => expect(true).toBe(true));",
    "",
  ].join("\n");
}

function validate(overrides: Partial<Parameters<typeof validatePatch>[0]> = {}) {
  return validatePatch({
    patch: patchFor(),
    proposalRoot: `${productionPath}:runLivenessSweep`,
    declaredScope: allowlist,
    allowlistGlobs: allowlist,
    floorDenyGlobs: Object.freeze(["packages/crypto/**"]),
    catalog,
    invariantId: invariant.id,
    ...overrides,
  });
}

describe("FIX-13 patch validation", () => {
  it("fails closed when the production allowlist or human catalog is empty", () => {
    expect(validate({ allowlistGlobs: [] })).toEqual({ ok: false, code: "REFUSED_ALLOWLIST_EMPTY" });
    expect(validate({ catalog: { invariants: [] } })).toEqual({ ok: false, code: "REFUSED_CATALOG_EMPTY" });
  });

  it("refuses paths outside the allowlist, inside the floor, or in immutable path classes", () => {
    expect(validate({ patch: patchFor("apps/api/src/index.ts") })).toEqual({ ok: false, code: "REFUSED_OUTSIDE_ALLOWLIST" });
    expect(validate({ floorDenyGlobs: [productionPath] })).toEqual({ ok: false, code: "REFUSED_FLOOR_DENY" });
    expect(validate({ patch: patchFor("package.json"), proposalRoot: "package.json:root", declaredScope: ["package.json", testPath], allowlistGlobs: ["package.json", testPath] }))
      .toEqual({ ok: false, code: "REFUSED_IMMUTABLE_PATH" });
    expect(validate({ patch: patchFor("tools/obs-listener/src/daemon/main.ts"), proposalRoot: "tools/obs-listener/src/daemon/main.ts:main", declaredScope: ["tools/obs-listener/src/daemon/main.ts", testPath], allowlistGlobs: ["tools/**", testPath] }))
      .toEqual({ ok: false, code: "REFUSED_IMMUTABLE_PATH" });
  });

  it("refuses a second production root and any scope drift", () => {
    const second = patchFor().replace("\n", "\n") + [
      `diff --git a/apps/scheduler/src/other.ts b/apps/scheduler/src/other.ts`,
      `--- a/apps/scheduler/src/other.ts`,
      `+++ b/apps/scheduler/src/other.ts`,
      "@@ -1 +1 @@", "-old", "+new", "",
    ].join("\n");
    expect(validate({
      patch: second,
      declaredScope: [...allowlist, "apps/scheduler/src/other.ts"],
      allowlistGlobs: [...allowlist, "apps/scheduler/src/other.ts"],
    })).toEqual({ ok: false, code: "REFUSED_MULTIPLE_ROOTS" });
    expect(validate({ declaredScope: [productionPath] })).toEqual({ ok: false, code: "REFUSED_SCOPE_DRIFT" });
  });

  it("refuses weakened tests and tests not bound to a catalog invariant", () => {
    const removedAssertion = patchFor().replace(
      "+test(\"returns the report\", () => expect(true).toBe(true));",
      "-expect(report).toBeDefined();\n+test(\"returns the report\", () => expect(true).toBe(true));",
    );
    expect(validate({ patch: removedAssertion })).toEqual({ ok: false, code: "REFUSED_WEAKENS_TEST" });
    expect(validate({ patch: patchFor().replace("+test(", "+test.skip(") })).toEqual({ ok: false, code: "REFUSED_WEAKENS_TEST" });
    expect(validate({ patch: patchFor().replace("+// invariant: INV-SCHEDULER-RETURN\n", "") }))
      .toEqual({ ok: false, code: "REFUSED_INVARIANT_UNBOUND" });
    expect(validate({ invariantId: "INV-NOT-CATALOGED" })).toEqual({ ok: false, code: "REFUSED_INVARIANT_NOT_CATALOGED" });
  });

  it("returns the exact human-owned command for a valid fixture patch", () => {
    expect(validate()).toEqual({
      ok: true,
      touchedPaths: [productionPath, testPath],
      productionRoot: productionPath,
      invariantId: invariant.id,
      command: invariant.command,
    });
  });
});
