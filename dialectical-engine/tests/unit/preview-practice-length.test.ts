import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lengthGuidancePolicyStartValues, LENGTH_GUIDANCE_POLICY_ROW_KEY } from "@debateai/register";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import {
  parsePracticeLengthPolicyText, practiceGuidedWordsOfFields, practiceLengthBlock, practiceLengthBlockLines,
  practiceLengthOverrideFromArgs
} from "../../tools/preview-practice/practice-length.js";
import { parsePracticeRegisterExport, practiceOverrideVersionRows } from "../../tools/preview-practice/practice-register-import.js";
import { recheckReply } from "../../tools/preview-practice/practice-lanes.js";
import { MAP_LIMITS, MAP_RUNAWAY_LIMITS } from "@debateai/map";

const START_TEXT = readFileSync(new URL("../../tools/preview-practice/length-policy-start.json", import.meta.url), "utf8");
const flags = (entries: Record<string, string>) => new Map(Object.entries(entries));

/**
 * An export of two versions; the last one's rows are `rows` (live source refs). A copy of
 * tests/unit/preview-practice-shape.test.ts's helper (not exported there): `practiceVersionRows` reads the top-level
 * `rows` filtered by `register_version`, each with `row_key`, `value_json` (canonical JSON text) and `source_ref`
 * (pre-flight PF-C4.2).
 */
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

describe("--length-policy (spec §3.7, ruling L22)", () => {
  it("the start file is the start values, byte for byte", () => {
    expect(parsePracticeLengthPolicyText(START_TEXT)).toEqual(lengthGuidancePolicyStartValues());
    expect(START_TEXT).toBe(JSON.stringify(lengthGuidancePolicyStartValues(), null, 2) + "\n");
  });

  it("is a known debate flag, read before anything starts, and debate-only", () => {
    expect(parsePracticeArgs(["debate", "--length-policy", "x.json"]).flags.get("--length-policy")).toBe("x.json");
    expect(practiceLengthOverrideFromArgs("debate", flags({}), () => START_TEXT)).toBeNull();
    expect(practiceLengthOverrideFromArgs("debate", flags({ "--length-policy": "x" }), () => START_TEXT)).toEqual(lengthGuidancePolicyStartValues());
    expect(() => practiceLengthOverrideFromArgs("formats", flags({ "--length-policy": "x" }), () => START_TEXT))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_FLAG_VALUE_INVALID" }));
    expect(() => practiceLengthOverrideFromArgs("debate", flags({ "--length-policy": "x" }), () => { throw new Error("ENOENT"); }))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_LENGTH_POLICY_UNREADABLE" }));
  });

  it("refuses a bad file by the place it is wrong, never repeating its content", () => {
    const bad = JSON.parse(START_TEXT) as Record<string, unknown>;
    bad.runawayMultiplier = 99;
    for (const [text, detail] of [["{not json", "$"], [JSON.stringify(bad), "runawayMultiplier"]] as const) {
      try { parsePracticeLengthPolicyText(text); expect.unreachable(); } catch (error) {
        expect(error).toMatchObject({ code: "PRACTICE_LENGTH_POLICY_INVALID" });
        expect(String((error as Error).message)).toContain(detail);
        expect(String((error as Error).message)).not.toContain("99");
      }
    }
  });
});

describe("the throwaway version holds the overrides and this code's hashes", () => {
  // (pre-flight PF-C4.2) built through parsePracticeRegisterExport, as practiceVersionRows reads it.
  const document = exportWith([{ row_key: "aRow", value_json: "1" }, { row_key: "judgeContractHash", value_json: "\"live-judge\"" }]);
  const codeHashes = [{ rowKey: "judgeContractHash", valueJsonText: "\"code-judge\"", sourceRef: "code" }];

  it("adds the length row alone, sorted, with the code's hashes in place of the export's", () => {
    const built = practiceOverrideVersionRows(document, { shape: null, length: lengthGuidancePolicyStartValues() }, codeHashes as never);
    expect(built.rows.map((row) => row.rowKey)).toEqual(["aRow", "judgeContractHash", LENGTH_GUIDANCE_POLICY_ROW_KEY]);
    expect(built.rows.find((row) => row.rowKey === "judgeContractHash")!.valueJsonText).toBe("\"code-judge\"");
    expect([built.shapeRow, built.lengthRow]).toEqual([null, "ADDED"]);
  });
});

describe("guided words read back from a recorded prompt (transcript fallback only, spec §3.7)", () => {
  // (pre-flight PF-C4.1) the table's guided columns are LG-B's practiceLengthRows (tests/unit/preview-practice-tokens.test.ts);
  // this fallback serves transcript.json only (pre-flight PF-C4.12). (pre-flight PF-C4.4) sample words follow C-1 (350).
  it("a call's told target read back from its prompt fields", () => {
    expect(practiceGuidedWordsOfFields([{ name: "question_line", content: "Q" }])).toBeNull();
    expect(practiceGuidedWordsOfFields([{ name: "answer_length", content: "about 350 words" }])).toBe(350);
    expect(practiceGuidedWordsOfFields([{ name: "length", content: "claim: about 35 words\nwhy_it_matters: about 35 words" }])).toBe(70);
    expect(practiceGuidedWordsOfFields([{ name: "length", content: "about 1120 characters" }])).toBeNull();
  });
});

describe("report.md's length paragraph (pre-flight PF-C4.5)", () => {
  it("names the source, the version, the row and the frozen numbers; codes and numbers only", () => {
    const frozen = practiceLengthBlock({ source: "FLAG", registerVersion: "6", row: "ADDED",
      frozen: { plan: "premium", answerLength: "standard", steps: { answer_writer: 350, pros_cons: 250 } } as never });
    expect(practiceLengthBlockLines(frozen)).toEqual(["Length guidance (from --length-policy: version 6, row added):", "",
      "- frozen on the run: plan premium, answer length standard: answer_writer 350, pros_cons 250 words", ""]);
    const unread = practiceLengthBlock({ source: "REGISTER", registerVersion: "5", row: null, frozen: null,
      unreadable: "FACTS_UNREADABLE:X" });
    expect(practiceLengthBlockLines(unread)).toEqual(["Length guidance (from the imported register's own row, version 5):", "",
      "- frozen on the run: none (FACTS_UNREADABLE:X)", ""]);
  });
});

// Task 14 review 4: a refused reply of a call asked under a map length variant is re-checked under the lengthed limits.
describe("the practice re-check reads a lengthed map reply under the lengthed limits", () => {
  const list = (claim: string) => JSON.stringify({ points: [1, 2, 3].map(() => ({ claim, why_it_matters: "w", leans: "context" })),
    candidate_answers: ["Yes."] });

  it("a claim past the runaway limit: the lengthed re-check names it", () => {
    const runaway = list("x".repeat(MAP_RUNAWAY_LIMITS.claimMaxChars + 1));
    expect(recheckReply("MAP:list:1", runaway, null, true).issues).toContain("too_big@points.0.claim");
  });

  it("a claim past today's limit but within the runaway limit: accepted by the lengthed re-check, refused by today's", () => {
    const longer = list("y".repeat(MAP_LIMITS.claimMaxChars + 50));
    expect(MAP_LIMITS.claimMaxChars + 50).toBeLessThanOrEqual(MAP_RUNAWAY_LIMITS.claimMaxChars);
    expect(recheckReply("MAP:list:1", longer, null, true)).toEqual({ family: "MAP", issues: [] });
    expect(recheckReply("MAP:list:1", longer).issues).toContain("too_big@points.0.claim");
  });

  it("the debate report passes the call's own lengthed reading to the re-check", () => {
    const source = readFileSync(new URL("../../tools/preview-practice/practice-debate.ts", import.meta.url), "utf8");
    expect(source).toContain("await reviewEdgeCountOf(entry.attempt_id, entry.call_site_key),\n          await mapLengthedOf(entry.attempt_id, entry.call_site_key)).issues");
  });
});
