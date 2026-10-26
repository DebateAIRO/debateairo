import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import {
  debateShapeInForce, debateShapeLargestBounds, debateShapePolicyRow, debateShapePolicyStartValues, parseDebateShapePolicy,
  debateShapeWriterCeiling, parseMapContractHash
} from "@debateai/register";
import type { Pool } from "pg";
import { readDebateShapeRunnerSettings, resolveDebateShapeRunnerSettings } from "../../apps/runner/src/debate-shape-boot.js";
import { buildDevelopmentRunnerRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";

const code = mapPromptContractHash();
const policy = debateShapePolicyStartValues();

/** A register with at most the two rows, answering by row key and recording every read (version, key). */
function registerPool(rows: Readonly<{ debateShapePolicy?: unknown; mapContractHash?: unknown }>) {
  const asked: unknown[][] = [];
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      asked.push(values);
      const key = values[1] as "debateShapePolicy" | "mapContractHash";
      return { rows: Object.hasOwn(rows, key) ? [{ value_json: rows[key] }] : [] };
    }
  } as unknown as Pool;
  return { pool, asked };
}

describe("the runner's boot with the debate shape", () => {
  it("no row: today's runner, whatever the map hash row says", async () => {
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: null, codeMapContractHash: code })).toBeNull();
    expect(resolveDebateShapeRunnerSettings({ policy: null, mapContractHash: "0".repeat(64), codeMapContractHash: code })).toBeNull();
    // The boot read: without the shape row the map hash row is never read, so absent, matching, mismatching and even a
    // malformed hash row all boot today's runner (fix round 1: no shape row = today's boot).
    for (const hash of [undefined, code, "f".repeat(64), "not-a-hash", 7, null]) {
      const register = registerPool(hash === undefined ? {} : { mapContractHash: hash });
      await expect(readDebateShapeRunnerSettings(register.pool, 7)).resolves.toBeNull();
      expect(register.asked).toEqual([[7, "debateShapePolicy"]]);
    }
  });

  it("with the row, the boot read asks the map hash too and resolves it like the runner", async () => {
    const row = JSON.parse(JSON.stringify(policy));
    const sealed = registerPool({ debateShapePolicy: row, mapContractHash: code });
    await expect(readDebateShapeRunnerSettings(sealed.pool, 7)).resolves.toEqual({ mapContractHash: code });
    expect(sealed.asked).toEqual([[7, "debateShapePolicy"], [7, "mapContractHash"]]);
    await expect(readDebateShapeRunnerSettings(registerPool({ debateShapePolicy: row }).pool, 7))
      .rejects.toMatchObject({ code: "DEBATE_SHAPE_MAP_HASH_UNSEALED" });
    await expect(readDebateShapeRunnerSettings(registerPool({ debateShapePolicy: row, mapContractHash: "f".repeat(64) }).pool, 7))
      .rejects.toMatchObject({ code: "MAP_CONTRACT_HASH_MISMATCH" });
    await expect(readDebateShapeRunnerSettings(registerPool({ debateShapePolicy: row, mapContractHash: "not-a-hash" }).pool, 7))
      .rejects.toThrow("MAP_CONTRACT_HASH_INVALID");
    await expect(readDebateShapeRunnerSettings(registerPool({ debateShapePolicy: { kind: "DEBATE_SHAPE_POLICY" } }).pool, 7))
      .rejects.toThrow(/^DEBATE_SHAPE_POLICY_INVALID:/u);
    const off = registerPool({ debateShapePolicy: { ...row, enabled: false }, mapContractHash: code });
    await expect(readDebateShapeRunnerSettings(off.pool, 7)).resolves.toEqual({ mapContractHash: code });
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
    // Side-by-side spec §13: both read them through the one per-version loader, which reads the rows exactly once.
    const loader = readFileSync(new URL("../../apps/runner/src/run-settings.ts", import.meta.url), "utf8");
    expect(loader.split("await readDebateShapeRunnerSettings(pool, version)")).toHaveLength(2);
    expect(loader).not.toContain("resolveDebateShapeRunnerSettings(");
    for (const file of ["apps/runner/src/main.ts", "tools/preview-practice/practice-runner-composition.ts"]) {
      const text = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(text, file).not.toContain("readDebateShapeRunnerSettings(");
      expect(text, file).toContain("load: (version) => loadRunnerVersionSettings(pool, version, runnerSite");
      expect(text, file).not.toContain("resolveDebateShapeRunnerSettings(");
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
    expect(hosted).toContain("await readDebateShapeRunnerSettings(pool, version);");
    expect(hosted).not.toContain("resolveDebateShapeRunnerSettings(");
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
    // The Free answer-writer ceiling both boot checks ask: the sealed bound without a row in force, else the larger.
    const writer = policy.answerLength.detailed.writerBound;
    expect(debateShapeWriterCeiling(4096, null)).toBe(4096);
    expect(debateShapeWriterCeiling(4096, policy)).toBe(writer);
    expect(debateShapeWriterCeiling(writer + 1, policy)).toBe(writer + 1);
  });
});
