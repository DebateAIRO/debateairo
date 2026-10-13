import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import {
  debateShapeInForce, debateShapeLargestBounds, debateShapePolicyRow, debateShapePolicyStartValues, parseDebateShapePolicy,
  parseMapContractHash
} from "@debateai/register";
import { resolveDebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";

const code = mapPromptContractHash();
const policy = debateShapePolicyStartValues();

describe("the runner's boot with the debate shape", () => {
  it("no row: today's runner, whatever the map hash row says", () => {
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: null, codeMapContractHash: code })).toBeNull();
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: "0".repeat(64), codeMapContractHash: code })).toBeNull();
  });

  it("a row needs the sealed map hash, equal to the code's", () => {
    expect(resolveDebateShapeRunnerSettings({ policy, mapContractHash: code, codeMapContractHash: code })).toEqual({ mapContractHash: code });
    expect(() => resolveDebateShapeRunnerSettings({ policy, mapContractHash: null, codeMapContractHash: code })).toThrowError(expect.objectContaining({ code: "DEBATE_SHAPE_MAP_HASH_UNSEALED" }));
    expect(() => resolveDebateShapeRunnerSettings({ policy, mapContractHash: "f".repeat(64), codeMapContractHash: code })).toThrowError(expect.objectContaining({ code: "MAP_CONTRACT_HASH_MISMATCH" }));
  });

  it("the row value is a 64-hex string", () => {
    expect(parseMapContractHash(code)).toBe(code);
    expect(() => parseMapContractHash("not-a-hash")).toThrow(/MAP_CONTRACT_HASH_INVALID/u);
  });

  it("the dev register seals the code's map hash", async () => {
    const rows = await buildDevelopmentRunnerRegisterRows();
    expect(rows.find((row) => row.rowKey === "mapContractHash")?.value).toBe(code);
  });

  it("main.ts and the practice runner read both rows and no longer carry the Phase 2a guard", () => {
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(text, file).toContain("readDebateShapePolicy(pool, environment.REGISTER_VERSION)");
      expect(text, file).toContain("readMapContractHash(pool, environment.REGISTER_VERSION)");
      expect(text, file).not.toContain("assertDebateShapeRunnerReady");
    }
  });

  it("the Phase 2a BOOT guard is gone from its five sites and the register, and the hosted readiness check resolves the shape like the runner", () => {
    // Pre-flight PF-B24a: the runner's PER-RUN refusal (the Phase 2a receipt refusal in apps/runner/src/index.ts)
    // stays until Task 13; tests/unit/debate-shape-runner-boot.test.ts's second describe pins it, and Task 13 deletes both.
    const sites = ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts",
      "apps/runner/src/hosted-register-publish.ts", "apps/api/src/main.ts", "tools/preview-practice/practice-ask-composition.ts",
      "packages/register/src/debate-shape-policy.ts", "packages/register/src/index.ts"];
    for (const file of sites) {
      const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      for (const gone of ["assertDebateShapeRunnerReady", "debate-shape-runner-pending", "DEBATE_SHAPE_POLICY_RUNNER_PENDING"]) {
        expect(text, `${file}: ${gone}`).not.toContain(gone);
      }
    }
    const hosted = readFileSync(new URL("../../apps/runner/src/hosted-register-publish.ts", import.meta.url), "utf8");
    expect(hosted).toContain("resolveDebateShapeRunnerSettings({");
    expect(hosted).toContain("readMapContractHash(pool, version)");
  });

  it("a disabled row is no row for the ask side, and still a row for the runner (the preview's rollback)", () => {
    const off = { ...policy, enabled: false };
    expect(debateShapeInForce(null)).toBeNull();
    expect(debateShapeInForce(off)).toBeNull();
    expect(debateShapeInForce(policy)).toBe(policy);
    expect(debateShapeInForce({ ...policy, enabled: true })).toEqual({ ...policy, enabled: true });
    expect(() => resolveDebateShapeRunnerSettings({ policy: off, mapContractHash: null, codeMapContractHash: code })).toThrowError(expect.objectContaining({ code: "DEBATE_SHAPE_MAP_HASH_UNSEALED" }));
    expect(resolveDebateShapeRunnerSettings({ policy: off, mapContractHash: code, codeMapContractHash: code })).toEqual({ mapContractHash: code });
    expect(Object.hasOwn(debateShapePolicyStartValues(), "enabled")).toBe(false);
    expect(parseDebateShapePolicy(JSON.parse(debateShapePolicyRow(off, "t").valueJsonText))).toEqual(off);
    expect(() => parseDebateShapePolicy({ ...policy, enabled: "no" })).toThrow("DEBATE_SHAPE_POLICY_INVALID:enabled");
  });

  it("the largest bounds the row allows: the detailed writer bound and the larger map step bound", () => {
    expect(debateShapeLargestBounds(policy)).toEqual({
      writer: policy.answerLength.detailed.writerBound,
      map: Math.max(policy.mapStepBounds.merge, policy.mapStepBounds.choose)
    });
  });
});
