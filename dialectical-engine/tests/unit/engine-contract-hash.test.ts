// Engine redesign R1d, Task 4 (INTERFACE §2.1, §2.2, §2.4, §2.5): the engineContractHash seal. The register side reads and
// parses the row; the code side folds engine 2's sealed contracts into one fingerprint text and its sha256. R1d seals no
// contract (deviation 2), so the hash is the sha256 of the header alone. A phase that appends a contract (R2a: verdict.investigate.v1;
// R2b: verdict.judge.v1) moves ENGINE_SEALED_IDS and ENGINE_CONTRACT_HASH_SEALED and says why in its commit (INTERFACE
// §2.5); R1D_ENGINE_CONTRACT_HASH stays the empty list's seal.
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { POINT_INVESTIGATION_PROMPT_CONTRACT } from "@debateai/judgement";
import { ENGINE_CONTRACT_HASH_ROW_KEY, loadBootstrapRegister, parseEngineContractHash, readEngineContractHash } from "@debateai/register";
import {
  ENGINE_CONTRACT_FINGERPRINT_HEADER, ENGINE_SEALED_CONTRACT_IDS, engineContractFingerprintText, engineContractHash, engineSealedContracts
} from "../../apps/runner/src/engine-contracts.js";
import { buildDevelopmentRunnerRegisterRows, DEVELOPMENT_RUNNER_SOURCE_REF } from "../../apps/runner/src/dev-deployment-register.js";
import { buildPreviewSourceRows } from "../../deploy/preview-auth-dev/v1/publish-register.js";
import { buildPreviewSourceRowsV2, PREVIEW_SOURCE_ROW_KEYS_V2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";

/** The sealed ids in phase order (INTERFACE §2.2, §2.5): R2a seals the investigation; R2b (B1) appends verdict.judge.v1. */
const ENGINE_SEALED_IDS: readonly string[] = ["verdict.investigate.v1"];
/**
 * R1d's seal: sha256 of the header text alone, no trailing newline. Printed once with
 * `printf '%s' debateai.engine-contracts.v1 | shasum -a 256` and pasted here; the test also recomputes it.
 */
const R1D_ENGINE_CONTRACT_HASH = "b98a45d5933d82205d5c6514082d4151bfb8f3f45b3677f6319794ae2a885e24";
/**
 * The code's seal now: sha256 of engineContractFingerprintText() over ENGINE_SEALED_IDS. Written by Step 4's command from
 * the code's own output (never typed); the zeros are the red-first value Step 4 replaces.
 */
const ENGINE_CONTRACT_HASH_SEALED = "bb9e93c372bad372468b03f60eceebf92047889e247b8ccacfb8c949b9da9e7a";
const SELECT = "SELECT value_json FROM register.register_row WHERE register_version=$1 AND row_key=$2";
const runtime = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
  operatorSha256: "c".repeat(64), observedAt: "2026-10-16T12:00:00.000Z" };

/** A register answering by row key, recording every read as [version, key]. */
function registerPool(rows: Readonly<Record<string, unknown>>) {
  const asked: unknown[][] = [];
  const pool = {
    query: async (sql: string, values: unknown[]) => {
      expect(sql).toBe(SELECT);
      asked.push(values);
      const key = String(values[1]);
      return { rows: Object.hasOwn(rows, key) ? [{ value_json: rows[key] }] : [] };
    }
  } as unknown as Pool;
  return { pool, asked };
}

describe("the engineContractHash row, register side (INTERFACE §2.1)", () => {
  it("names its row key", () => {
    expect(ENGINE_CONTRACT_HASH_ROW_KEY).toBe("engineContractHash");
  });

  it("parses a 64-character lowercase hex string and refuses everything else with its own code", () => {
    const hex = "a".repeat(64);
    expect(parseEngineContractHash(hex)).toBe(hex);
    for (const bad of ["A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), ` ${hex}`, `${hex}\n`, "", 7, null, undefined, { hex }, [hex]]) {
      expect(() => parseEngineContractHash(bad), JSON.stringify(bad) ?? "undefined").toThrow(new TypeError("ENGINE_CONTRACT_HASH_INVALID"));
    }
  });

  it("reads the row at its version: absent is null, present is the hash, malformed is refused", async () => {
    const absent = registerPool({});
    await expect(readEngineContractHash(absent.pool, 9)).resolves.toBeNull();
    expect(absent.asked).toEqual([[9, "engineContractHash"]]);
    await expect(readEngineContractHash(registerPool({ engineContractHash: R1D_ENGINE_CONTRACT_HASH }).pool, 9)).resolves.toBe(R1D_ENGINE_CONTRACT_HASH);
    await expect(readEngineContractHash(registerPool({ engineContractHash: "not-a-hash" }).pool, 9)).rejects.toThrow("ENGINE_CONTRACT_HASH_INVALID");
    await expect(readEngineContractHash(registerPool({ engineContractHash: null }).pool, 9)).rejects.toThrow("ENGINE_CONTRACT_HASH_INVALID");
  });
});

describe("engine 2's sealed contracts, code side (INTERFACE §2.2)", () => {
  it("the list is frozen and holds the sealed ids in phase order", () => {
    expect(ENGINE_SEALED_CONTRACT_IDS).toEqual(ENGINE_SEALED_IDS);
    expect(Object.isFrozen(ENGINE_SEALED_CONTRACT_IDS)).toBe(true);
    expect(engineSealedContracts().map((contract) => contract.contractId)).toEqual(ENGINE_SEALED_IDS);
    expect(Object.isFrozen(engineSealedContracts())).toBe(true);
  });

  it("the fingerprint text of no contract is the header alone, and its seal is R1d's (header-only text)", () => {
    expect(ENGINE_CONTRACT_FINGERPRINT_HEADER).toBe("debateai.engine-contracts.v1");
    expect(engineContractFingerprintText([])).toBe("debateai.engine-contracts.v1");
    const computed = createHash("sha256").update("debateai.engine-contracts.v1").digest("hex");
    expect(engineContractHash([])).toBe(computed);
    expect(engineContractHash([])).toBe(R1D_ENGINE_CONTRACT_HASH);
    expect(parseEngineContractHash(engineContractHash([]))).toBe(R1D_ENGINE_CONTRACT_HASH);
  });

  it("seals verdict.investigate.v1 first (R2a; verdict.judge.v1 follows in R2b), and the code's seal is its sha256", () => {
    expect(ENGINE_SEALED_CONTRACT_IDS).toEqual(["verdict.investigate.v1"]);
    expect(engineSealedContracts()).toEqual([POINT_INVESTIGATION_PROMPT_CONTRACT]);
    expect(engineContractFingerprintText()).toBe([ENGINE_CONTRACT_FINGERPRINT_HEADER,
      promptContractFingerprintText(POINT_INVESTIGATION_PROMPT_CONTRACT)].join("\n---\n"));
    expect(engineContractHash()).toBe(createHash("sha256").update(engineContractFingerprintText()).digest("hex"));
    expect(engineContractHash()).toBe(ENGINE_CONTRACT_HASH_SEALED);
    expect(engineContractHash()).not.toBe(R1D_ENGINE_CONTRACT_HASH);
    expect(parseEngineContractHash(engineContractHash())).toBe(ENGINE_CONTRACT_HASH_SEALED);
  });

  it("a contract is folded in after the header by the providers' own fingerprint text, in list order", () => {
    const first: PromptContract = Object.freeze({ contractId: "test.engine.first.v1", instruction: "Do the first thing.", answerForm: "{}" });
    const second: PromptContract = Object.freeze({ contractId: "test.engine.second.v1", instruction: "Do the second thing.", answerForm: "[]" });
    expect(engineContractFingerprintText([first, second])).toBe(
      ["debateai.engine-contracts.v1", promptContractFingerprintText(first), promptContractFingerprintText(second)].join("\n---\n"));
    expect(engineContractHash([first, second]))
      .toBe(createHash("sha256").update(engineContractFingerprintText([first, second])).digest("hex"));
    expect(engineContractHash([first, second])).not.toBe(engineContractHash([second, first]));
    expect(engineContractHash([first])).not.toBe(engineContractHash());
  });
});

describe("where the seal row is written (INTERFACE §2.4: code-owned, as mapContractHash)", () => {
  it("the dev builder carries the row once, equal to the code's hash, under the runner's own source ref", async () => {
    const rows = await buildDevelopmentRunnerRegisterRows();
    const seal = rows.filter((row) => row.rowKey === "engineContractHash");
    expect(seal).toHaveLength(1);
    expect(seal[0]!.value).toBe(engineContractHash());
    expect(seal[0]!.sourceRef).toBe(DEVELOPMENT_RUNNER_SOURCE_REF);
    expect(rows.find((row) => row.rowKey === "mapContractHash")?.sourceRef).toBe(DEVELOPMENT_RUNNER_SOURCE_REF);
  });

  it("kit v1 filters it out (its reviewed closure stays the 66 keys it was written for); kit v2 carries it as a required key", async () => {
    const bootstrap = await loadBootstrapRegister();
    const v1 = await buildPreviewSourceRows(bootstrap, runtime);
    expect(v1.map((row) => row.rowKey)).not.toContain("engineContractHash");
    expect(v1).toHaveLength(66);
    const v2 = await buildPreviewSourceRowsV2(bootstrap, runtime);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).toContain("engineContractHash");
    expect(JSON.parse(v2.find((row) => row.rowKey === "engineContractHash")!.valueJsonText)).toBe(engineContractHash());
  });
});
