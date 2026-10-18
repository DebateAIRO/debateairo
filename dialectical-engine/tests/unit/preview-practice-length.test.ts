import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { buildFramedPrompt } from "@debateai/providers";
import {
  DEBATE_SHAPE_POLICY_ROW_KEY, ENGINE_VERSION_POLICY_ROW_KEY, debateShapePolicyStartValues, engineVersionPolicyStartValues,
  lengthGuidancePolicyStartValues, LENGTH_GUIDANCE_POLICY_ROW_KEY
} from "@debateai/register";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import {
  parsePracticeLengthPolicyText, practiceGuidedWordsOfFields, practiceLengthBlock, practiceLengthBlockLines,
  practiceLengthOverrideFromArgs
} from "../../tools/preview-practice/practice-length.js";
import {
  PRACTICE_ENGINE_SOURCE_REF, PRACTICE_LENGTH_SOURCE_REF, PRACTICE_SHAPE_SOURCE_REF, parsePracticeNextRegisterInputs, parsePracticeRegisterExport,
  practiceOverrideVersionRows, publishPracticeLengthVersion, publishPracticeOverrideVersion
} from "../../tools/preview-practice/practice-register-import.js";
import { buildTranscriptAttempts, type TranscriptArtifact } from "../../tools/preview-practice/practice-transcript.js";
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
        // Task 9 review 8: the whole message is the code and the path, nothing else.
        expect(String((error as Error).message)).toMatch(new RegExp(`^PRACTICE_LENGTH_POLICY_INVALID: ${detail.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u"));
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

  // Task 9 review 1: --shape-policy and --length-policy together make ONE version carrying both rows.
  it("adds the shape row and the length row together, sorted, with the code's hashes", () => {
    const built = practiceOverrideVersionRows(document, { shape: debateShapePolicyStartValues(), length: lengthGuidancePolicyStartValues() },
      codeHashes as never);
    expect(built.rows.map((row) => row.rowKey)).toEqual(["aRow", DEBATE_SHAPE_POLICY_ROW_KEY, "judgeContractHash", LENGTH_GUIDANCE_POLICY_ROW_KEY]);
    expect([built.shapeRow, built.lengthRow]).toEqual(["ADDED", "ADDED"]);
  });

  /** A pool whose one publication call is captured, then stopped (nothing is written). */
  function capturingPool() {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const client = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes("register.publish_register_version")) throw new Error("captured");
        return { rows: [] };
      },
      release: () => undefined
    };
    return { pool: { connect: async () => client } as unknown as Pool, calls };
  }
  const publication = (calls: readonly { sql: string; params: readonly unknown[] }[]) => {
    const found = calls.filter((call) => call.sql.includes("register.publish_register_version"));
    expect(found).toHaveLength(1);
    const [, , base, envelope, sourceRef] = found[0]!.params as [unknown, unknown, string, string, string];
    return { base, keys: (JSON.parse(envelope) as { row_key: string }[]).map((row) => row.row_key), sourceRef };
  };

  // Task 9 review 2: the length-only publisher.
  it("publishPracticeLengthVersion publishes ONE general version on the export's last one: the length row alone, the length source line", async () => {
    const { pool, calls } = capturingPool();
    await expect(publishPracticeLengthVersion(pool, document, { registerVersion: "5", steps: [] }, lengthGuidancePolicyStartValues()))
      .rejects.toThrow("captured");
    const published = publication(calls);
    expect(published.base).toBe("5");
    expect(published.keys).toContain(LENGTH_GUIDANCE_POLICY_ROW_KEY);
    expect(published.keys).not.toContain(DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(published.sourceRef).toBe(PRACTICE_LENGTH_SOURCE_REF);
  });

  // Task 20 review 1 (final wave B14): --engine-policy alone (beside the export's own length row) has its own source line.
  it("the engine override alone: ONE publication with the engine row, under the engine's source line", async () => {
    const { pool, calls } = capturingPool();
    await expect(publishPracticeOverrideVersion(pool, document, { registerVersion: "5", steps: [] },
      { shape: null, length: null, engine: engineVersionPolicyStartValues() })).rejects.toThrow("captured");
    const published = publication(calls);
    expect(published.keys).toContain(ENGINE_VERSION_POLICY_ROW_KEY);
    expect(published.keys).not.toContain(LENGTH_GUIDANCE_POLICY_ROW_KEY);
    expect(published.sourceRef).toBe(PRACTICE_ENGINE_SOURCE_REF);
  });

  it("both overrides: ONE publication with both rows, under the shape's source line", async () => {
    const { pool, calls } = capturingPool();
    await expect(publishPracticeOverrideVersion(pool, document, { registerVersion: "5", steps: [] },
      { shape: debateShapePolicyStartValues(), length: lengthGuidancePolicyStartValues() })).rejects.toThrow("captured");
    const published = publication(calls);
    expect(published.keys).toEqual(expect.arrayContaining([DEBATE_SHAPE_POLICY_ROW_KEY, LENGTH_GUIDANCE_POLICY_ROW_KEY]));
    expect(published.sourceRef).toBe(PRACTICE_SHAPE_SOURCE_REF);
  });
});

// Task 9 review 3: with --register-next the policy goes into the code's next version, as the plan's --length-guidance.
describe("--length-policy with --register-next", () => {
  it("the next version's choices carry the policy; null or none adds nothing; it never chooses the kit", async () => {
    const policy = lengthGuidancePolicyStartValues();
    expect(await parsePracticeNextRegisterInputs({ lengthGuidance: policy })).toEqual({ kit: "v2", hostedBilling: null,
      choices: { lengthGuidance: policy } });
    expect(await parsePracticeNextRegisterInputs({ lengthGuidance: null })).toEqual({ kit: "v2", hostedBilling: null, choices: {} });
    expect(await parsePracticeNextRegisterInputs({})).toEqual({ kit: "v2", hostedBilling: null, choices: {} });
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

  // Task 9 review 4: the fallback through the transcript builder itself; the recorded column wins when there is one.
  it("transcript.json: a try with no recorded guided words reads its prompt's target; a recorded number wins", () => {
    const framed = buildFramedPrompt({ contract: { contractId: "serve.synthesizer.length.v2", instruction: "Write the answer.",
      answerForm: "Plain text." }, material: [{ name: "question_line", content: "Q?" }, { name: "answer_length", content: "about 350 words" }] });
    const at = new Date("2026-10-17T00:00:00.000Z");
    const entry = (n: number) => ({ sequence: String(n), ledgerEntryId: `ledger-${String(n)}`, attemptId: `attempt-${String(n)}`,
      callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", subjectItemId: "item", stance: "NEUTRAL", actorRef: "preview:glm-5-3-flash",
      outcome: "OK", modelRole: "SYNTHESIZER", thinkingLevel: "high", candidateId: null, startedAt: at, finishedAt: at,
      rawArtifactRef: `artifact-${String(n)}` });
    const artifact = (n: number, guidedWords: number | null): TranscriptArtifact => ({ rawArtifactId: `artifact-${String(n)}`,
      provider: "deepinfra", providerRef: "preview:glm-5-3-flash", modelId: "zai-org/GLM-5.3-Flash", maker: "zai", modelVersion: null,
      parseStatus: "PARSED", parseErrorCode: null, metadata: null, thinkingTokens: null, rawText: "An answer.", parseErrorDetail: null,
      ...(guidedWords === null ? {} : { guidedWords }) });
    const prompt = { promptText: JSON.stringify(framed.packet.messages), promptFingerprint: `sha256:${"b".repeat(64)}` };
    const [fallback, recorded] = buildTranscriptAttempts({ entries: [entry(1), entry(2)],
      artifacts: new Map([["artifact-1", artifact(1, null)], ["artifact-2", artifact(2, 120)]]),
      prompts: new Map([["attempt-1", prompt], ["attempt-2", prompt]]), spend: new Map() });
    expect(fallback!.guidedWords).toBe(350);
    expect(recorded!.guidedWords).toBe(120);
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
    // R3's final wave (P17) added the call's engine flag after the lengthed reading; the lengthed reading is still passed.
    expect(source).toContain("await reviewEdgeCountOf(entry.attempt_id, entry.call_site_key),\n          await mapLengthedOf(entry.attempt_id, entry.call_site_key), mapEngine).issues");
  });
});
