import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "../..");
const BASE = "7a9765efad4d639ac042179f626573f49efc9784";
const cases = ["apps/scheduler/src/index.ts", "apps/api/src/index.ts", "packages/obs-capture/src/runtime/index.ts", "migrations/0064_fix09_audit_chain.sql"];
describe("FIX-10 product invariance", () => {
  it.each(cases)("%s", (path) => {
    const expected = execFileSync("git", ["show", `${BASE}:dialectical-engine/${path}`], { cwd: ROOT });
    expect(readFileSync(resolve(ROOT, path))).toEqual(expected);
  });
});
