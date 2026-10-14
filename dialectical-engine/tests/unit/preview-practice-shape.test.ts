// The preview practice's debate-shape support (spec 2026-10-12 §5 "Practice"; plan 2026-10-12-debate-shape-phase2d):
// the four debate-only flags, the start-values file, the comparison's fixed questions, the throwaway register version,
// the map calls in the practice's accounting, the report's shape block and the README's commands.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { mapPromptContractHash } from "@debateai/map";
import {
  canonicalRegisterJson,
  DEBATE_SHAPE_POLICY_ROW_KEY,
  debateShapePolicyRow,
  debateShapePolicyStartValues,
  loadBootstrapRegister,
  parseDebateShapePolicy,
  type RegisterPublicationRow
} from "@debateai/register";
import { buildPreviewSourceRowsV2 } from "../../deploy/preview-auth-dev/v1/publish-register-v2.js";
import { buildDevelopmentRunnerRegisterRows, DEVELOPMENT_RUNNER_SOURCE_REF } from "../../apps/runner/src/dev-deployment-register.js";
import { INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW, STAFF_ACCESS_POLICY_REGISTER_ROW } from "../../packages/register/src/staff-access-policy.js";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { callFamilyOf, practiceMapStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";
import { OPENINGS_QUESTIONS } from "../../tools/preview-practice/practice-openings-questions.js";
import { PRACTICE_COMPARISON_QUESTION_IDS, practiceDebateQuestion } from "../../tools/preview-practice/practice-questions.js";
import {
  practiceShapeBlock,
  practiceShapeLines,
  practiceShapeOverrideFromArgs,
  type PracticeShapeFacts
} from "../../tools/preview-practice/practice-shape.js";
import { practiceVerdict, type PracticeVerdictInput } from "../../tools/preview-practice/practice-verdict.js";
import { reportMarkdown, type PracticeReport } from "../../tools/preview-practice/practice-report.js";
import {
  composePracticeNextRegisterVersion,
  parsePracticeRegisterExport,
  PRACTICE_CODE_HASH_ROW_KEYS,
  PRACTICE_REGISTER_EXPORT_SCHEMA,
  PRACTICE_SHAPE_SOURCE_REF,
  practiceCodeContractHashRows,
  practiceShapeVersionRows,
  practiceVersionRows
} from "../../tools/preview-practice/practice-register-import.js";

const START_TEXT = readFileSync(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url), "utf8");
const flags = (entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> => new Map(Object.entries(entries));
const readStart = (): string => START_TEXT;

describe("practice debate shape: the flags", () => {
  it("the start-values file is exactly the owners' start values (rulings S5-S8)", () => {
    expect(parseDebateShapePolicy(JSON.parse(START_TEXT))).toEqual(debateShapePolicyStartValues());
    // Written out in full: the map step bounds too (the parser's default, ruling X1), and never `enabled` (start values = on).
    const start = JSON.parse(START_TEXT) as Record<string, unknown>;
    expect(Object.keys(start)).toEqual(["kind", "version", "plans", "answerLength", "mapStepBounds"]);
    expect(start.mapStepBounds).toEqual({ merge: 32768, choose: 32768 });
    expect("enabled" in start).toBe(false);
  });

  it("no shape flag: nothing (today's debate command is unchanged)", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--depth": "1", "--question": "ro" }), readStart)).toBeNull();
  });

  it("reads --shape-policy and the three ask settings", () => {
    const override = practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json", "--depth-mode": "fixed",
      "--scrutiny": "deep", "--answer-length": "short" }), readStart);
    expect(override).toEqual({ policy: debateShapePolicyStartValues(), ask: { depthMode: "fixed", scrutiny: "deep", answerLength: "short" } });
  });

  it("the ask settings alone (for a register that holds its own row): no policy of its own", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "detailed" }), readStart))
      .toEqual({ policy: null, ask: { answerLength: "detailed" } });
  });

  it.each(["formats", "openings", "report"])("refuses every shape flag outside debate mode (%s)", (mode) => {
    for (const flag of ["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"]) {
      expect(() => practiceShapeOverrideFromArgs(mode, flags({ [flag]: "x" }), readStart))
        .toThrow(`PRACTICE_FLAG_VALUE_INVALID: ${flag} (debate mode only)`);
    }
  });

  it("refuses a value outside each setting's list, naming only the flag", () => {
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--depth-mode": "manual" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --depth-mode \(fixed or adaptive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--scrutiny": "max" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --scrutiny \(standard, deep or exhaustive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "long" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --answer-length \(short, standard or detailed\)$/u);
  });

  it("refuses a policy file that does not pass the register's own check, naming only where in the file", () => {
    const shape = (edit: (value: { version: number; plans: { pro: { answers: number } } }) => void): string => {
      const value = JSON.parse(START_TEXT) as { version: number; plans: { pro: { answers: number } } };
      edit(value);
      return JSON.stringify(value);
    };
    const policyOf = (text: string) => () => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => text);
    expect(policyOf(shape((value) => { value.version = 2; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: version$/u);
    expect(policyOf(shape((value) => { value.plans.pro.answers = 9; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: plans\.pro\.answers$/u);
    expect(policyOf("{ not json")).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: \$$/u);
    // A row switched off (P2b's rollback member) could never run the new shape.
    expect(policyOf(JSON.stringify({ ...(JSON.parse(START_TEXT) as object), enabled: false }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: enabled$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => { throw new Error("ENOENT"); }))
      .toThrow(/^PRACTICE_SHAPE_POLICY_UNREADABLE$/u);
  });

  it("the command line refuses a mistyped flag and a missing value before anything starts", () => {
    expect(() => parsePracticeArgs(["debate", "--shape-polcy", "x.json"])).toThrow("PRACTICE_FLAG_UNKNOWN");
    expect(() => parsePracticeArgs(["debate", "--shape-policy"])).toThrow("PRACTICE_FLAG_VALUE_MISSING");
    expect(parsePracticeArgs(["debate", "--shape-policy", "x.json", "--depth-mode", "adaptive", "--scrutiny", "standard",
      "--answer-length", "standard"]).flags.size).toBe(4);
  });
});

describe("practice debate questions: the comparison's four fixed questions", () => {
  it("ro and en as before; the four comparison ids word for word from the openings set", () => {
    expect(practiceDebateQuestion("ro").id).toBe("ro");
    expect(practiceDebateQuestion("en").id).toBe("en");
    expect(PRACTICE_COMPARISON_QUESTION_IDS).toEqual(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"]);
    for (const id of PRACTICE_COMPARISON_QUESTION_IDS) {
      expect(practiceDebateQuestion(id)).toEqual({ id, questionLine: OPENINGS_QUESTIONS.find((question) => question.id === id)!.questionLine });
    }
  });

  it("refuses any other id without repeating it", () => {
    expect(() => practiceDebateQuestion("ro-ciuperci")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(/u);
    expect(() => practiceDebateQuestion("my own question?")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(ro, en/u);
    try { practiceDebateQuestion("my own question?"); } catch (error) { expect(String(error)).not.toContain("my own question"); }
  });
});

/** An export of two versions; the last one's rows are `rows` (live source refs). */
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

describe("practice debate shape: the throwaway register version", () => {
  /** The practice's own rows: the debate-shape row and the code's four contract-hash rows (ruling X3; pre-flight PF-D7). */
  const OWN = new Set<string>([DEBATE_SHAPE_POLICY_ROW_KEY, ...PRACTICE_CODE_HASH_ROW_KEYS]);
  let CODE: readonly RegisterPublicationRow[] = [];
  beforeAll(async () => { CODE = await practiceCodeContractHashRows(); });

  it("adds the row to the export's LAST version's rows, keeps every other row byte for byte, in key order", () => {
    const document = exportWith([{ row_key: "zeta", value_json: "\"z\"" }, { row_key: "alpha", value_json: "{\"a\": \"b\"}" }]);
    const { rows, row } = practiceShapeVersionRows(document, debateShapePolicyStartValues(), CODE);
    expect(row).toBe("ADDED");
    expect(rows.map((entry) => entry.rowKey))
      .toEqual(["alpha", "composerContractHash", "conformanceContractHash", DEBATE_SHAPE_POLICY_ROW_KEY, "judgeContractHash", "mapContractHash", "zeta"]);
    expect(rows.filter((entry) => !OWN.has(entry.rowKey))).toEqual(practiceVersionRows(document, "5"));
    expect(rows.find((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY))
      .toEqual({ ...debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF) });
  });

  it("replaces an exported row of the same key (REPLACED), never keeping two", () => {
    const live = debateShapePolicyRow(debateShapePolicyStartValues("SNOWBALL"), "live");
    const document = exportWith([{ row_key: DEBATE_SHAPE_POLICY_ROW_KEY, value_json: live.valueJsonText }, { row_key: "alpha", value_json: "1" }]);
    const { rows, row } = practiceShapeVersionRows(document, debateShapePolicyStartValues(), CODE);
    expect(row).toBe("REPLACED");
    const shapeRows = rows.filter((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY);
    expect(shapeRows).toHaveLength(1);
    expect(shapeRows[0]).toEqual({ ...debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF) });
  });

  it("supersedes the judge, composer and conformance hashes and adds the map hash, all four the code's own (the dev builder's)", async () => {
    const dev = await buildDevelopmentRunnerRegisterRows();
    expect(CODE.map((entry) => entry.rowKey)).toEqual([...PRACTICE_CODE_HASH_ROW_KEYS]);
    for (const key of PRACTICE_CODE_HASH_ROW_KEYS) {
      const value = dev.find((entry) => entry.rowKey === key)?.value;
      expect(typeof value, key).toBe("string");
      // The builder's own source ref too (P2d Task 6): the runner's policy reader (apps/runner/src/dev-runner-policy.ts)
      // refuses a judge, composer or conformance hash row sealed by anyone else (DEV_RUNNER_POLICY_PROVENANCE_INVALID).
      expect(CODE.find((entry) => entry.rowKey === key))
        .toEqual({ rowKey: key, valueJsonText: canonicalRegisterJson(value as string), sourceRef: DEVELOPMENT_RUNNER_SOURCE_REF });
    }
    expect(CODE.find((entry) => entry.rowKey === "mapContractHash")!.valueJsonText).toBe(canonicalRegisterJson(mapPromptContractHash()));
    // The export's own (live) hashes are superseded, never kept beside the code's.
    const stale = JSON.stringify("0".repeat(64));
    const document = exportWith([{ row_key: "judgeContractHash", value_json: stale }, { row_key: "composerContractHash", value_json: stale },
      { row_key: "conformanceContractHash", value_json: stale }, { row_key: "alpha", value_json: "1" }]);
    const { rows } = practiceShapeVersionRows(document, debateShapePolicyStartValues(), CODE);
    for (const own of CODE) expect(rows.filter((entry) => entry.rowKey === own.rowKey)).toEqual([own]);
  });

  it("--register-next with --shape-policy: the code's next version carries the row, from the kit's own source build", async () => {
    // Controller ruling D-REGNEXT: the policy goes into the code's next version (buildPreviewSourceRowsV2's debateShape),
    // so no second version is published on top of it. A base the kit itself would publish from this code (GLM checker,
    // rotation on, a measured runtime), so without the policy the code changes no row.
    const runtime = { nodeVersion: "v26.8.2", pnpmVersion: "11.20.0", sourceRevision: "a".repeat(40), sourceTree: "b".repeat(40),
      operatorSha256: "c".repeat(64), observedAt: "2026-10-11T10:42:25.561Z" };
    const owned = [STAFF_ACCESS_POLICY_REGISTER_ROW, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW]
      .map((entry) => ({ rowKey: entry.rowKey, valueJsonText: canonicalRegisterJson(entry.valueAst), sourceRef: entry.sourceRef }));
    const base = [...await buildPreviewSourceRowsV2(await loadBootstrapRegister(), runtime), ...owned];
    const document = parsePracticeRegisterExport(JSON.stringify({ schema: PRACTICE_REGISTER_EXPORT_SCHEMA,
      versions: [{ register_version: "11", row_count: base.length, base_register_version: "10", publication_id: null, request_sha256: null,
        snapshot_sha256: null, publication_kind: "GENERAL", recorded_at: null }],
      rows: base.map((entry) => ({ register_version: "11", row_key: entry.rowKey, value_json: entry.valueJsonText, source_ref: entry.sourceRef }))
    }));
    await expect(composePracticeNextRegisterVersion(document)).rejects.toMatchObject({ code: "PRACTICE_REGISTER_NEXT_UNSUPPORTED" });
    const next = await composePracticeNextRegisterVersion(document, undefined, debateShapePolicyStartValues());
    expect([next.addedKeys, next.changedKeys]).toEqual([[DEBATE_SHAPE_POLICY_ROW_KEY], []]);
    expect(next.rows).toHaveLength(base.length + 1);
    expect(JSON.parse(next.rows.find((entry) => entry.rowKey === DEBATE_SHAPE_POLICY_ROW_KEY)!.valueJsonText))
      .toEqual(JSON.parse(debateShapePolicyRow(debateShapePolicyStartValues(), PRACTICE_SHAPE_SOURCE_REF).valueJsonText));
  });
});

describe("practice: map calls in the practice's own accounting", () => {
  it("names the map family and step from the call-site key (spec §3.4: MAP:angles, MAP:list:<i>, MAP:list:<i>:2, MAP:merge, MAP:gap:<k>, MAP:choose)", () => {
    for (const key of ["MAP:angles", "MAP:list:0", "MAP:list:3", "MAP:list:3:2", "MAP:merge", "MAP:gap:1", "MAP:choose"]) {
      expect(callFamilyOf(key)).toBe("MAP");
    }
    // A failed list handed to another seat has its own key MAP:list:<i>:2 (P2b Task 1) and still counts as a list.
    expect(["MAP:angles", "MAP:list:3", "MAP:list:3:2", "MAP:merge", "MAP:gap:2", "MAP:choose"].map(practiceMapStepOf))
      .toEqual(["angles", "list", "list", "merge", "gap", "choose"]);
    expect(practiceMapStepOf("MAP:other")).toBeNull();
    expect(practiceMapStepOf("JUDGE:attack:root0")).toBeNull();
    expect(callFamilyOf("JUDGE:review:abc")).toBe("REVIEW");
  });

  it("re-checks a map reply by its step's own schema", () => {
    const point = (n: number) => ({ claim: `Point ${String(n)}`, why_it_matters: "It can change the answer.", leans: "context" });
    expect(recheckReply("MAP:list:0", JSON.stringify({ points: [1, 2, 3].map(point), candidate_answers: ["Yes."] })))
      .toEqual({ family: "MAP", issues: [] });
    // A snowball reply (no minimum) under the same list key is accepted too.
    expect(recheckReply("MAP:list:1", JSON.stringify({ points: [], candidate_answers: [] })).issues).toEqual([]);
    expect(recheckReply("MAP:angles", JSON.stringify({ angles: [] })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:choose", JSON.stringify({ answers: [] })).issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:merge", "not json").issues.length).toBeGreaterThan(0);
    expect(recheckReply("MAP:other", "{}")).toEqual({ family: "MAP", issues: ["UNMAPPED"] });
    expect(recheckReply("SOMETHING:ELSE", "{}")).toEqual({ family: "UNMAPPED", issues: ["UNMAPPED"] });
  });
});

// Pre-flight PF-D14: the map AIs' count sits on its own line (the plan's literal rule for lines that name the depth).
const SIZES = Object.freeze({ plan: "premium", depthMode: "adaptive", scrutiny: "standard", answerLength: "standard",
  mapAIs: 5,
  answers: 4, graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2, gapRounds: 2, closeCallExtraGraders: 1, opening: "ANGLE_MAP" });
const FACTS: PracticeShapeFacts = Object.freeze({
  storedDepthParams: { depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" },
  sizes: SIZES,
  marks: { "CHOOSE_QUOTA_FILLED": 1, "PANEL-CLOSE-CALL-EXTENDED": 3, "SCRUTINY-EXTENDED": 2, "PANEL-PARTIAL": 1 },
  choice: { opening: "MAP", answers: 2, alsoRaised: 7 },
  mapCallSiteKeys: ["MAP:angles", "MAP:list:0", "MAP:list:1", "MAP:list:1:2", "MAP:merge", "MAP:gap:1", "MAP:choose"]
});
const blockOf = (facts: PracticeShapeFacts | null, unreadable?: string) => practiceShapeBlock({ source: "FLAG", registerVersion: "6", row: "ADDED",
  asked: { scrutiny: "deep" }, facts, ...(unreadable === undefined ? {} : { unreadable }) });

describe("practice debate shape: what the run did", () => {
  it("counts what the debate-shape run did", () => {
    expect(blockOf(FACTS)).toEqual({
      source: "FLAG", registerVersion: "6", row: "ADDED", asked: { depthMode: null, scrutiny: "deep", answerLength: null },
      storedDepthParams: FACTS.storedDepthParams, sizes: SIZES, opening: "ANGLE_MAP", mapMarks: { CHOOSE_QUOTA_FILLED: 1 },
      chosenAnswers: 2, alsoRaised: 7, panelCloseCallExtensions: 3, scrutinyExtensions: 2,
      mapCallsByStep: { angles: 1, list: 3, merge: 1, gap: 1, choose: 1 }, notExercised: null
    });
  });

  it("says when the new shape was not exercised", () => {
    // Pre-flight PF-D12: a fallen-back map still stores its choice (opening TODAYS_OPENING, no answers, nothing also raised).
    const fellBack = blockOf({ ...FACTS, marks: { MAP_UNAVAILABLE_TODAYS_OPENING: 1 }, choice: { opening: "TODAYS_OPENING", answers: 0, alsoRaised: 0 },
      mapCallSiteKeys: ["MAP:angles", "MAP:list:0"] });
    expect(fellBack).toMatchObject({ opening: "TODAYS_OPENING", notExercised: "MAP_UNAVAILABLE_TODAYS_OPENING", chosenAnswers: 0,
      alsoRaised: 0, mapMarks: { MAP_UNAVAILABLE_TODAYS_OPENING: 1 } });
    // The stored opening says it alone too: an answer that was never served carries no mark.
    expect(blockOf({ ...FACTS, marks: {}, choice: { opening: "TODAYS_OPENING", answers: 0, alsoRaised: 0 } }))
      .toMatchObject({ opening: "TODAYS_OPENING", notExercised: "MAP_UNAVAILABLE_TODAYS_OPENING" });
    // Ruling C-TWO (controller ruling D-NOTARGUED, pre-flight PF-D11): the map gave one answer, so today's opening was argued.
    expect(blockOf({ ...FACTS, choice: { opening: "MAP", answers: 1, alsoRaised: 4 } })).toMatchObject({ opening: "TODAYS_OPENING",
      notExercised: "MAP_ANSWERS_NOT_ARGUED", chosenAnswers: 1, alsoRaised: 4 });
    // A shape run that stored no map at all (it stopped before the map) is not the shape shown to run (pre-flight PF-D12).
    expect(blockOf({ ...FACTS, choice: null })).toMatchObject({ opening: null, notExercised: "NO_MAP_STORED", chosenAnswers: null,
      alsoRaised: null });
    expect(blockOf({ ...FACTS, sizes: null })).toMatchObject({ opening: null, notExercised: "NO_SHAPE_ON_RECEIPT" });
    expect(blockOf(null, "CONTENT_CIPHER_UNAVAILABLE")).toMatchObject({ notExercised: "FACTS_UNREADABLE:CONTENT_CIPHER_UNAVAILABLE" });
    // Refused at the ask: the verdict already fails the run; the block only says nothing ran.
    expect(blockOf(null)).toEqual({ source: "FLAG", registerVersion: "6", row: "ADDED", asked: { depthMode: null, scrutiny: "deep", answerLength: null },
      storedDepthParams: null, sizes: null, opening: null, mapMarks: {}, chosenAnswers: null, alsoRaised: null, panelCloseCallExtensions: 0,
      scrutinyExtensions: 0, mapCallsByStep: { angles: 0, list: 0, merge: 0, gap: 0, choose: 0 }, notExercised: null });
  });

  it("a shape run that did not exercise the shape is NOT_PROVEN, never PASS", () => {
    const base: PracticeVerdictInput = { harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0,
      failedCalls: 0, gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {} };
    expect(practiceVerdict(base)).toMatchObject({ verdict: "PASS", exitCode: 0, reasons: [] });
    expect(practiceVerdict({ ...base, shapeNotExercised: [] })).toMatchObject({ verdict: "PASS", reasons: [] });
    expect(practiceVerdict({ ...base, shapeNotExercised: ["MAP_UNAVAILABLE_TODAYS_OPENING"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["SHAPE_NOT_EXERCISED:MAP_UNAVAILABLE_TODAYS_OPENING"] });
    expect(practiceVerdict({ ...base, shapeNotExercised: ["MAP_ANSWERS_NOT_ARGUED"] }))
      .toEqual({ verdict: "NOT_PROVEN", exitCode: 30, reasons: ["SHAPE_NOT_EXERCISED:MAP_ANSWERS_NOT_ARGUED"] });
    expect(practiceVerdict({ ...base, completed: false, shapeNotExercised: ["NO_SHAPE_ON_RECEIPT"] }).verdict).toBe("FAIL");
  });

  it("report.md says it in plain words, counts and codes only", () => {
    const report = { schema: "preview-practice-report-v1", mode: "debate", verdict: "PASS", exitCode: 0, reasons: [],
      startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T11:00:00.000Z", shape: blockOf(FACTS) } as unknown as PracticeReport;
    const markdown = reportMarkdown(report);
    expect(markdown).toContain("Debate shape (from --shape-policy, in this throwaway register only: version 6, row added):");
    expect(markdown).toContain("- asked: depth mode default, scrutiny deep, answer length default; stored: "
      + "{\"depth\":1,\"depthMode\":\"adaptive\",\"scrutiny\":\"standard\",\"answerLength\":\"standard\"}");
    expect(markdown).toContain("- opening used: ANGLE_MAP");
    expect(markdown).toContain("- map calls (every try, as the ledger recorded them): angles 1, list 3, merge 1, gap 1, choose 1");
    expect(markdown).toContain("- chosen answers: 2; also raised, not debated: 7");
    expect(markdown).toContain("- map marks: CHOOSE_QUOTA_FILLED x1");
    // Pre-flight PF-D19 (T14-P): the close call called for extra graders; one that then failed still leaves the mark.
    expect(markdown).toContain("- points whose close call called for extra graders: 3; points scrutinised further: 2");
    expect(practiceShapeLines(blockOf({ ...FACTS, sizes: null })).join("\n")).toContain("- the new shape was not exercised: NO_SHAPE_ON_RECEIPT");
    expect(practiceShapeLines(blockOf({ ...FACTS, choice: { opening: "MAP", answers: 1, alsoRaised: 4 } })).join("\n"))
      .toContain("- the new shape was not exercised: MAP_ANSWERS_NOT_ARGUED");
  });

  it("a report without the block reads as today", () => {
    const report = { schema: "preview-practice-report-v1", mode: "debate", verdict: "PASS", exitCode: 0, reasons: [],
      startedAt: "2026-10-12T10:00:00.000Z", finishedAt: "2026-10-12T11:00:00.000Z" } as unknown as PracticeReport;
    expect(reportMarkdown(report)).not.toContain("Debate shape");
  });
});

describe("README: the debate commands are real commands of this tool", () => {
  const readme = readFileSync(new URL("../../tools/preview-practice/README.md", import.meta.url), "utf8");
  const commands = readme.split("\n").filter((line) => line.includes("tools/preview-practice/practice.ts debate "));
  const argvOf = (line: string): string[] => line.slice(line.indexOf("practice.ts ") + "practice.ts ".length).trim().split(/\s+/u)
    .map((word) => word.replace(/^"(.*)"$/u, "$1"));
  const readFromEngine = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("names the pass bar, the new shape and the comparison", () => {
    expect(commands.length).toBeGreaterThanOrEqual(4);
    expect(commands.filter((line) => line.includes("--shape-policy tools/preview-practice/shape-policy-start.json")).length).toBeGreaterThanOrEqual(2);
    expect(commands.filter((line) => line.includes("--question \"$Q\""))).toHaveLength(2);
    // Controller ruling D-BOTHNEXT (pre-flight PF-D2): the new-shape command and both S-8 arms run on this code's next version.
    expect(commands.filter((line) => line.includes(" --register-next ")).length).toBeGreaterThanOrEqual(3);
  });

  it("every one parses with flags the tool reads, fixed questions and a valid policy file", () => {
    for (const line of commands) {
      const args = parsePracticeArgs(argvOf(line));
      expect(args.mode).toBe("debate");
      const asked = args.flags.get("--question") ?? "ro";
      for (const id of asked === "$Q" ? [...PRACTICE_COMPARISON_QUESTION_IDS] : [asked]) expect(practiceDebateQuestion(id).id).toBe(id);
      expect(() => practiceShapeOverrideFromArgs(args.mode, args.flags, readFromEngine)).not.toThrow();
      // Controller ruling D-BOTHNEXT (pre-flight PF-D2): until the owners republish the register with this code's prompt
      // fingerprints, every new-shape and comparison debate needs --register-next (S-6's own debate line carries it too:
      // P2d Task 7b, the progress ledger's NOTE for Task 7b).
      if (asked === "$Q" || args.flags.has("--shape-policy")) expect(args.switches.has("--register-next")).toBe(true);
      if (asked === "$Q") {
        expect(args.flags.get("--depth")).toBe("1");
        expect(args.switches.has("--transcript")).toBe(true);
        expect(args.flags.get("--out")).toMatch(/^\$P\/compare\/\$Q\/(today|shape)$/u);
      }
    }
  });

  it("leaves the judging to the owners, outside the repository", () => {
    expect(readme).toContain("results are judged by the owners' private method, outside this repository");
  });
});
