// Engine redesign R1d, Task 5 (INTERFACE §1.3, §1.5, §2.3): the runner's boot read of the engine row. No row: engine 1,
// today's boot, and neither the length row nor the seal is read. A row, enabled or not: the length row must be present and
// the sealed engineContractHash must equal the code's, else the boot refuses by its own code.
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { engineVersionPolicyStartValues, lengthGuidancePolicyStartValues } from "@debateai/register";
import { readEngineRunnerSettings, resolveEngineRunnerSettings } from "../../apps/runner/src/engine-boot.js";
import { engineContractHash } from "../../apps/runner/src/engine-contracts.js";

const code = engineContractHash();
const policy = engineVersionPolicyStartValues();
/** The rows as the database hands them back (JSON round trip). */
const ROW = JSON.parse(JSON.stringify(policy)) as Record<string, unknown>;
const LENGTH = JSON.parse(JSON.stringify(lengthGuidancePolicyStartValues())) as unknown;

type Rows = Readonly<{ engineVersionPolicy?: unknown; lengthGuidancePolicy?: unknown; engineContractHash?: unknown }>;
/** A register with at most the three rows, answering by row key and recording every read as [version, key]. */
function registerPool(rows: Rows) {
  const asked: unknown[][] = [];
  const pool = {
    query: async (_sql: string, values: unknown[]) => {
      asked.push(values);
      const key = values[1] as keyof Rows;
      return { rows: Object.hasOwn(rows, key) ? [{ value_json: rows[key] }] : [] };
    }
  } as unknown as Pool;
  return { pool, asked };
}
const resolve = (input: Partial<Parameters<typeof resolveEngineRunnerSettings>[0]>) => resolveEngineRunnerSettings({
  policy, lengthPolicyPresent: true, engineContractHash: code, codeEngineContractHash: code, ...input });

describe("the runner's boot with the engine row", () => {
  it("no row: engine 1, today's runner, and the length row and the seal are never read (row absent = today's boot)", async () => {
    expect(resolve({ policy: null, lengthPolicyPresent: false, engineContractHash: null })).toBeNull();
    expect(resolve({ policy: null, engineContractHash: "0".repeat(64) })).toBeNull();
    for (const seal of [undefined, code, "f".repeat(64), "not-a-hash", 7, null]) {
      for (const length of [undefined, LENGTH, { kind: "LENGTH_GUIDANCE_POLICY" }]) {
        const register = registerPool({ ...(seal === undefined ? {} : { engineContractHash: seal }), ...(length === undefined ? {} : { lengthGuidancePolicy: length }) });
        await expect(readEngineRunnerSettings(register.pool, 7)).resolves.toBeNull();
        expect(register.asked).toEqual([[7, "engineVersionPolicy"]]);
      }
    }
  });

  it("a row without the length row refuses ENGINE_REQUIRES_LENGTH_POLICY, and the seal is not read", async () => {
    expect(() => resolve({ lengthPolicyPresent: false })).toThrowError(expect.objectContaining({ code: "ENGINE_REQUIRES_LENGTH_POLICY" }));
    const register = registerPool({ engineVersionPolicy: ROW, engineContractHash: code });
    await expect(readEngineRunnerSettings(register.pool, 7)).rejects.toMatchObject({ code: "ENGINE_REQUIRES_LENGTH_POLICY" });
    expect(register.asked).toEqual([[7, "engineVersionPolicy"], [7, "lengthGuidancePolicy"]]);
  });

  it("a row with the length row but no seal refuses ENGINE_CONTRACT_HASH_UNSEALED", async () => {
    expect(() => resolve({ engineContractHash: null })).toThrowError(expect.objectContaining({ code: "ENGINE_CONTRACT_HASH_UNSEALED" }));
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: ROW, lengthGuidancePolicy: LENGTH }).pool, 7))
      .rejects.toMatchObject({ code: "ENGINE_CONTRACT_HASH_UNSEALED" });
  });

  it("a seal that is not the code's refuses ENGINE_CONTRACT_HASH_MISMATCH; a malformed seal refuses by the register's code", async () => {
    expect(() => resolve({ engineContractHash: "f".repeat(64) })).toThrowError(expect.objectContaining({ code: "ENGINE_CONTRACT_HASH_MISMATCH" }));
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: ROW, lengthGuidancePolicy: LENGTH, engineContractHash: "f".repeat(64) }).pool, 7))
      .rejects.toMatchObject({ code: "ENGINE_CONTRACT_HASH_MISMATCH" });
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: ROW, lengthGuidancePolicy: LENGTH, engineContractHash: "not-a-hash" }).pool, 7))
      .rejects.toThrow("ENGINE_CONTRACT_HASH_INVALID");
    // A runner of other code (a later phase's seal) refuses this register's seal the same way.
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: ROW, lengthGuidancePolicy: LENGTH, engineContractHash: code }).pool, 7, "e".repeat(64)))
      .rejects.toMatchObject({ code: "ENGINE_CONTRACT_HASH_MISMATCH" });
  });

  it("row, length row and the code's seal: the settings, read in the order engine, length, seal", async () => {
    expect(resolve({})).toEqual({ engineContractHash: code });
    const sealed = registerPool({ engineVersionPolicy: ROW, lengthGuidancePolicy: LENGTH, engineContractHash: code });
    await expect(readEngineRunnerSettings(sealed.pool, 7)).resolves.toEqual({ engineContractHash: code });
    expect(sealed.asked).toEqual([[7, "engineVersionPolicy"], [7, "lengthGuidancePolicy"], [7, "engineContractHash"]]);
  });

  it("a disabled row (enabled: false) still requires the length row and the seal: debates admitted before the switch still run", async () => {
    const off = { ...ROW, enabled: false };
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: off, engineContractHash: code }).pool, 7))
      .rejects.toMatchObject({ code: "ENGINE_REQUIRES_LENGTH_POLICY" });
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: off, lengthGuidancePolicy: LENGTH }).pool, 7))
      .rejects.toMatchObject({ code: "ENGINE_CONTRACT_HASH_UNSEALED" });
    await expect(readEngineRunnerSettings(registerPool({ engineVersionPolicy: off, lengthGuidancePolicy: LENGTH, engineContractHash: code }).pool, 7))
      .resolves.toEqual({ engineContractHash: code });
    expect(() => resolve({ policy: { ...policy, enabled: false }, lengthPolicyPresent: false }))
      .toThrowError(expect.objectContaining({ code: "ENGINE_REQUIRES_LENGTH_POLICY" }));
  });

  it("a malformed engine row refuses with the register's own code before anything else is read", async () => {
    const malformed = registerPool({ engineVersionPolicy: { kind: "ENGINE_VERSION_POLICY" }, lengthGuidancePolicy: LENGTH, engineContractHash: code });
    await expect(readEngineRunnerSettings(malformed.pool, 7)).rejects.toThrow(/^ENGINE_VERSION_POLICY_INVALID:/u);
    expect(malformed.asked).toEqual([[7, "engineVersionPolicy"]]);
  });
});
