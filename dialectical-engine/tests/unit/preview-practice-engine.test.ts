import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION_POLICY_ROW_KEY,
  LENGTH_GUIDANCE_POLICY_ROW_KEY,
  engineVersionPolicyRow,
  engineVersionPolicyStartValues,
  lengthGuidancePolicyRow,
  lengthGuidancePolicyStartValues
} from "@debateai/register";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import {
  PRACTICE_ENGINE_FLAGS,
  parsePracticeEnginePolicyText,
  practiceEngineOverrideFromArgs,
  practiceRegisterHasLengthRow
} from "../../tools/preview-practice/practice-engine.js";
import {
  PRACTICE_ENGINE_SOURCE_REF,
  parsePracticeNextRegisterInputs,
  parsePracticeRegisterExport,
  practiceOverrideVersionRows
} from "../../tools/preview-practice/practice-register-import.js";

/**
 * Engine row, practice (spec 2026-10-15 engine redesign §3.3 "Practice", §14; INTERFACE §15.1): `--engine-policy` puts
 * the engine row into the throwaway practice register only, checked by the register's own parser before anything is
 * spent, and only beside a length row (engine 2 reads its word targets from it).
 */

const START_TEXT = readFileSync(new URL("../../tools/preview-practice/engine-policy-start.json", import.meta.url), "utf8");
const flags = (entries: Record<string, string>) => new Map(Object.entries(entries));
const LENGTH = lengthGuidancePolicyRow(lengthGuidancePolicyStartValues(), "live");
const CODE_HASHES = [{ rowKey: "judgeContractHash", valueJsonText: "\"code-judge\"", sourceRef: "code" }];

/** An export of versions 4 and 5 (the newest), as tests/unit/preview-practice-shape.test.ts builds it. */
function exportWith(rows: readonly Readonly<{ row_key: string; value_json: string }>[]) {
  const version = (registerVersion: string, rowCount: number, base: string | null, kind: string | null) => ({
    register_version: registerVersion, row_count: rowCount, base_register_version: base, publication_id: null, request_sha256: null,
    snapshot_sha256: null, publication_kind: kind, recorded_at: null });
  return parsePracticeRegisterExport(JSON.stringify({
    schema: "preview-practice-register-export-v1",
    versions: [version("4", 1, null, null), version("5", rows.length, "4", "GENERAL")],
    rows: [{ register_version: "4", row_key: "alpha", value_json: "\"old\"", source_ref: "live" },
      ...rows.map((row) => ({ register_version: "5", row_key: row.row_key, value_json: row.value_json, source_ref: "live" }))]
  }));
}

describe("--engine-policy (INTERFACE §15.1)", () => {
  it("the start file is the start values, with its kind", () => {
    expect(JSON.parse(START_TEXT)).toMatchObject({ kind: "ENGINE_VERSION_POLICY", version: 1, engine: 2 });
    expect(parsePracticeEnginePolicyText(START_TEXT)).toEqual(engineVersionPolicyStartValues());
  });

  it("is a known value flag of the command line", () => {
    expect(PRACTICE_ENGINE_FLAGS).toEqual(["--engine-policy"]);
    expect(parsePracticeArgs(["debate", "--engine-policy", "x.json"]).flags.get("--engine-policy")).toBe("x.json");
  });

  it("is read only in debate mode, and only beside a length row", () => {
    const read = () => START_TEXT;
    expect(practiceEngineOverrideFromArgs("debate", flags({}), read, false)).toBeNull();
    expect(practiceEngineOverrideFromArgs("debate", flags({ "--engine-policy": "x" }), read, true)).toEqual(engineVersionPolicyStartValues());
    expect(() => practiceEngineOverrideFromArgs("formats", flags({ "--engine-policy": "x" }), read, true))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_FLAG_VALUE_INVALID", message: "PRACTICE_FLAG_VALUE_INVALID: --engine-policy (debate mode only)" }));
    expect(() => practiceEngineOverrideFromArgs("debate", flags({ "--engine-policy": "x" }), () => { throw new Error("ENOENT"); }, true))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_ENGINE_POLICY_UNREADABLE" }));
    expect(() => practiceEngineOverrideFromArgs("debate", flags({ "--engine-policy": "x" }), read, false))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_ENGINE_REQUIRES_LENGTH_POLICY" }));
  });

  it("refuses a bad file by the place it is wrong, never repeating its content; a switched-off row is refused", () => {
    const bad = JSON.parse(START_TEXT) as { judges: { count: number } };
    bad.judges.count = 9;
    const off = { ...(JSON.parse(START_TEXT) as Record<string, unknown>), enabled: false };
    for (const [text, detail] of [["{not json", "$"], [JSON.stringify(bad), "judges.count"], [JSON.stringify(off), "enabled"]] as const) {
      try {
        parsePracticeEnginePolicyText(text);
        expect.unreachable();
      } catch (error) {
        expect(error).toMatchObject({ code: "PRACTICE_ENGINE_POLICY_INVALID", message: `PRACTICE_ENGINE_POLICY_INVALID: ${detail}` });
      }
    }
  });
});

describe("the engine row in the throwaway version (one combined version with shape and length)", () => {
  it("knows whether the exported register's newest version holds the length row", () => {
    expect(practiceRegisterHasLengthRow(exportWith([{ row_key: "aRow", value_json: "1" }]))).toBe(false);
    expect(practiceRegisterHasLengthRow(exportWith([{ row_key: LENGTH_GUIDANCE_POLICY_ROW_KEY, value_json: LENGTH.valueJsonText }]))).toBe(true);
  });

  it("adds the engine row beside the export's own length row, in key order, with the code's hashes", () => {
    const document = exportWith([{ row_key: "aRow", value_json: "1" }, { row_key: LENGTH_GUIDANCE_POLICY_ROW_KEY, value_json: LENGTH.valueJsonText }]);
    const built = practiceOverrideVersionRows(document, { shape: null, length: null, engine: engineVersionPolicyStartValues() }, CODE_HASHES as never);
    expect(built.rows.map((row) => row.rowKey)).toEqual(["aRow", ENGINE_VERSION_POLICY_ROW_KEY, "judgeContractHash", LENGTH_GUIDANCE_POLICY_ROW_KEY]);
    expect(built.rows.find((row) => row.rowKey === ENGINE_VERSION_POLICY_ROW_KEY))
      .toEqual({ ...engineVersionPolicyRow(engineVersionPolicyStartValues(), PRACTICE_ENGINE_SOURCE_REF) });
    expect([built.shapeRow, built.lengthRow, built.engineRow]).toEqual([null, null, "ADDED"]);
  });

  it("length and engine rows go into the same version; without an engine override there is no engine row (LG-C's callers)", () => {
    const document = exportWith([{ row_key: "aRow", value_json: "1" }]);
    const both = practiceOverrideVersionRows(document,
      { shape: null, length: lengthGuidancePolicyStartValues(), engine: engineVersionPolicyStartValues() }, CODE_HASHES as never);
    expect([both.lengthRow, both.engineRow]).toEqual(["ADDED", "ADDED"]);
    const lengthOnly = practiceOverrideVersionRows(document, { shape: null, length: lengthGuidancePolicyStartValues() }, CODE_HASHES as never);
    expect(lengthOnly.engineRow).toBeNull();
    expect(lengthOnly.rows.some((row) => row.rowKey === ENGINE_VERSION_POLICY_ROW_KEY)).toBe(false);
  });
});

describe("--engine-policy with --register-next", () => {
  it("hands the policy to the kit's own source build as its engineVersion, and chooses no kit", async () => {
    const parsed = await parsePracticeNextRegisterInputs({ engineVersion: engineVersionPolicyStartValues() });
    expect(parsed.kit).toBe("v2");
    expect(parsed.choices.engineVersion).toEqual(engineVersionPolicyStartValues());
    expect((await parsePracticeNextRegisterInputs({ engineVersion: null })).choices).not.toHaveProperty("engineVersion");
  });
});
