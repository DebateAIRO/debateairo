// Engine redesign R1d, Task 4 (INTERFACE §2.1, §2.2, §2.4, §2.5): the engineContractHash seal. The register side reads and
// parses the row; the code side folds engine 2's sealed contracts into one fingerprint text and its sha256. R1d seals no
// contract (deviation 2), so the hash is the sha256 of the header alone. A phase that appends a contract (R2a: verdict.investigate.v1;
// R2b: verdict.judge.v1; R3: the map's eight engine-2 contracts, then judge.assigned-root.unknown.v2 and .resolved.v2;
// W1-5: the web wording's 20; W1-5b: web.plan.v2, web.pick.v2, web.read-top.v2, web.suggest.v1; W3-5: path-rewrite.writer.v1,
// path-rewrite.checker.v1; W4-2: web.plan-dig.v1)
// moves ENGINE_SEALED_IDS and ENGINE_CONTRACT_HASH_SEALED and says why in its commit (INTERFACE §2.5); R1D_ENGINE_CONTRACT_HASH
// stays the empty list's seal.
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { promptContractFingerprintText, type PromptContract } from "@debateai/providers";
import { COMPARING_JUDGE_PROMPT_CONTRACT, POINT_INVESTIGATION_PROMPT_CONTRACT, judgeAssignedRootV2PromptContract } from "@debateai/judgement";
import { MAP_ENGINE_CONTRACT_NAMES, mapEnginePromptContracts } from "@debateai/map";
import { ENGINE_CONTRACT_HASH_ROW_KEY, loadBootstrapRegister, parseEngineContractHash, readEngineContractHash } from "@debateai/register";
import {
  ENGINE_CONTRACT_FINGERPRINT_HEADER, ENGINE_SEALED_CONTRACT_IDS, engineContractFingerprintText, engineContractHash, engineSealedContracts
} from "../../apps/runner/src/engine-contracts.js";
import { buildDevelopmentRunnerRegisterRows, DEVELOPMENT_RUNNER_SOURCE_REF } from "../../apps/runner/src/dev-deployment-register.js";
import { buildPreviewSourceRows } from "../../deploy/preview-auth-dev/v1/publish-register.js";
import { buildPreviewSourceRowsV2, PREVIEW_SOURCE_ROW_KEYS_V2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";

/**
 * The sealed ids in phase order (INTERFACE §2.2, §2.5): R2a seals the investigation; R2b (B1) appends verdict.judge.v1;
 * R3 (Task 13) appends the map's eight engine-2 contracts, then judge.assigned-root.unknown.v2 and .resolved.v2.
 */
// R3 (engine redesign spec §9): the map's eight engine-2 contracts, then the fixed-words position writer's two, after R2's.
const ENGINE_SEALED_IDS: readonly string[] = ["verdict.investigate.v1", "verdict.judge.v1", "map.angles.v2", "map.list.angle.v2",
  "map.list.open.v2", "map.list.snowball.v2", "map.merge.v2", "map.gap.v2", "map.choose.v2", "map.check.v1",
  "judge.assigned-root.unknown.v2", "judge.assigned-root.resolved.v2",
  // W1-5 (web search, plan 2026-10-30; design §7.1 items 1-7, approved 2026-10-30): the web step's four, the arguing legs'
  // and the review's sources variants, the comparing judges' and the answer writer's (tests/unit/web-prompts.test.ts).
  "web.plan.v1", "web.read-all.v1", "web.pick.v1", "web.read-top.v1",
  "judge.assigned-root.unknown.sources.v1", "judge.assigned-root.resolved.sources.v1",
  "judge.support.unknown.length.sources.v1", "judge.support.resolved.length.sources.v1",
  "judge.attack.unknown.length.sources.v1", "judge.attack.resolved.length.sources.v1",
  "judge.support.consideration.unknown.length.sources.v1", "judge.support.consideration.resolved.length.sources.v1",
  "judge.attack.consideration.unknown.length.sources.v1", "judge.attack.consideration.resolved.length.sources.v1",
  "judge.cross-root.unknown.length.sources.v1", "judge.cross-root.resolved.length.sources.v1",
  "judge.review.length.sources.v1", "verdict.judge.sources.v1",
  "serve.synthesizer.length.sources.v1", "serve.synthesizer.length.reader.sources.v1",
  // W1-5b (owner approvals of 2026-10-30): the second web wording as new ids; web.plan.v1, web.pick.v1 and
  // web.read-top.v1 stay sealed above, unused (tests/unit/web-prompts.test.ts).
  "web.plan.v2", "web.pick.v2", "web.read-top.v2", "web.suggest.v1",
  // W3-5 (dig-model revision 2026-10-30; drafts 5.1 and 5.2, approved as written): the path rewrite's writer and checker.
  "path-rewrite.writer.v1", "path-rewrite.checker.v1",
  // W4-2 (plan 2026-10-30; owner Q9): the dig's planner, one search per pick (a draft wording, approve before switch-on).
  "web.plan-dig.v1"];
/**
 * R1d's seal: sha256 of the header text alone, no trailing newline. Printed once with
 * `printf '%s' debateai.engine-contracts.v1 | shasum -a 256` and pasted here; the test also recomputes it.
 */
const R1D_ENGINE_CONTRACT_HASH = "b98a45d5933d82205d5c6514082d4151bfb8f3f45b3677f6319794ae2a885e24";
/**
 * The code's seal now: sha256 of engineContractFingerprintText() over ENGINE_SEALED_IDS, written by command from the code's
 * own output (never typed). A phase that appends sets it aside to zeros for its red run, then writes the code's new seal.
 */
// R3 (2026-10-17): + the map's eight engine-2 contracts and judge.assigned-root.*.v2 (option-1 drafts, approve before switch-on)
// (ba2f15d5d89b2f7b4c3168e2f7908f5d3130aa55fc4929ad0825b15028500a4d, history). W1-5 (2026-10-30): + the web wording's 20
// (a5a988393472a0e5a86d01c2a194e4aacb247c4d4407b6d8ad88fe06a818af5c, history). W1-5b (2026-10-30): + the second web wording's 4
// (64ec9ef0258010b8b63f9a5e270a2c734b7311650c47281eda1fe2fc7b61057a, history). W3-5 (2026-10-31): + the path rewrite's 2
// (e87152961c68939de279dec08e8c50423e758936db4bc8e7d785a61455151123, history). W4-2 (2026-11-01): + the dig's planner.
const ENGINE_CONTRACT_HASH_SEALED = "85278722824f1cde050e290bbb7ec507af08a8e7ae8087526aee27b45f1b66aa";
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

  it("seals verdict.investigate.v1, then verdict.judge.v1 first (R2a, R2b; R3 appends after them), and the code's seal is the sha256", () => {
    expect(ENGINE_SEALED_CONTRACT_IDS).toEqual(ENGINE_SEALED_IDS);
    expect(engineSealedContracts().slice(0, 2)).toEqual([POINT_INVESTIGATION_PROMPT_CONTRACT, COMPARING_JUDGE_PROMPT_CONTRACT]);
    expect(engineContractFingerprintText().startsWith([ENGINE_CONTRACT_FINGERPRINT_HEADER,
      promptContractFingerprintText(POINT_INVESTIGATION_PROMPT_CONTRACT),
      promptContractFingerprintText(COMPARING_JUDGE_PROMPT_CONTRACT)].join("\n---\n"))).toBe(true);
    expect(engineContractHash()).toBe(createHash("sha256").update(engineContractFingerprintText()).digest("hex"));
    expect(engineContractHash()).toBe(ENGINE_CONTRACT_HASH_SEALED);
    expect(engineContractHash()).not.toBe(R1D_ENGINE_CONTRACT_HASH);
    expect(engineContractHash()).not.toBe(engineContractHash([POINT_INVESTIGATION_PROMPT_CONTRACT]));
    expect(parseEngineContractHash(engineContractHash())).toBe(ENGINE_CONTRACT_HASH_SEALED);
  });

  it("R3: each of its ten contracts is in the seal's text in order after R2's, and any change to one moves the hash", () => {
    const text = engineContractFingerprintText();
    let from = text.indexOf(promptContractFingerprintText(COMPARING_JUDGE_PROMPT_CONTRACT));
    expect(from).toBeGreaterThan(0);
    for (const contract of [...MAP_ENGINE_CONTRACT_NAMES.map((name) => mapEnginePromptContracts()[name]),
      judgeAssignedRootV2PromptContract("unknown"), judgeAssignedRootV2PromptContract("resolved")]) {
      const at = text.indexOf(promptContractFingerprintText(contract), from);
      expect(at, contract.contractId).toBeGreaterThan(from);
      from = at;
    }
    const edited = engineSealedContracts().map((contract) => (contract.contractId === "map.check.v1" ? { ...contract, instruction: `${contract.instruction} ` } : contract));
    expect(engineContractHash(edited)).not.toBe(engineContractHash());
    expect(ENGINE_SEALED_CONTRACT_IDS.some((id) => id.endsWith(".wording-n"))).toBe(false);
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

  it("kit v1 filters it out (its reviewed closure is the 66 keys it was written for plus S04's questionCheckPolicy); kit v2 carries it as a required key", async () => {
    const bootstrap = await loadBootstrapRegister();
    const v1 = await buildPreviewSourceRows(bootstrap, runtime);
    expect(v1.map((row) => row.rowKey)).not.toContain("engineContractHash");
    expect(v1).toHaveLength(67);
    const v2 = await buildPreviewSourceRowsV2(bootstrap, runtime);
    expect(PREVIEW_SOURCE_ROW_KEYS_V2).toContain("engineContractHash");
    expect(JSON.parse(v2.find((row) => row.rowKey === "engineContractHash")!.valueJsonText)).toBe(engineContractHash());
  });
});
