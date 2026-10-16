import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callFamilyOf, practiceJsonRepairOf, practiceStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";
import { practiceRepairRows, practiceUnrepairedRows, type PracticeTryRecord } from "../../tools/preview-practice/practice-debate.js";
import { practiceModelCalls } from "../../tools/preview-practice/practice-verdict.js";
import { buildTranscriptAttempts, type TranscriptArtifact, type TranscriptLedgerRow } from "../../tools/preview-practice/practice-transcript.js";

const GLM = "zai-org/GLM-5.3-Flash";
const HAIKU = "claude-haiku-5-5";

describe("LG-A practice: per-step keys finer than the call family (INTERFACE §1.3)", () => {
  it.each([
    ["JUDGE", "opening"], ["JUDGE:defender:root0:r1:p3", "pros_cons"], ["JUDGE:cross-root:0->1", "cross_exchange"],
    ["PANEL:JUDGE:critic:root2:r1:p12:preview:fixture-a", "judge_panel"], ["JUDGE:review:8d823b58", "reviewer"],
    ["COMPOSER:SYNTHESIZER:INITIAL:1", "answer_writer"], ["STORY:STORYTELLER:1", "story_writer"], ["MAP:merge", "map"],
    ["REPAIR:STRUCTURE:STORY:STORYTELLER:1", "structure_repair"], ["SOMETHING", "UNMAPPED"]
  ] as const)("%s → %s", (key, step) => { expect(practiceStepOf(key)).toBe(step); });

  it("names the structure-repair family", () => {
    expect(callFamilyOf("REPAIR:STRUCTURE:JUDGE:cross-root:0->1")).toBe("STRUCTURE_REPAIR");
    expect(callFamilyOf("JUDGE:cross-root:0->1")).toBe("JUDGE");
  });
});

/** One call that slipped on structure and was repaired by Haiku, one fenced reply with an inner key, one that stayed broken. */
const TRIES: readonly PracticeTryRecord[] = [
  { callKey: "glm|JUDGE", model: GLM, callSiteKey: "JUDGE", outcome: "FAILED", parseStatus: "PARSE_FAILED", replyForm: "ORIGINAL",
    repairs: null, failureClass: "STRUCTURE", issue: "PARSE_FAILED@$", replyText: "{\"statement\": \"x\" \"steelman\": {}}" },
  { callKey: "glm|JUDGE", model: HAIKU, callSiteKey: "REPAIR:STRUCTURE:JUDGE", outcome: "OK", parseStatus: "PARSED", replyForm: "STRUCTURE",
    repairs: null, failureClass: null, issue: null, replyText: null },
  { callKey: "glm|PANEL:x", model: GLM, callSiteKey: "PANEL:JUDGE:critic:root2:r1:p12", outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL",
    repairs: ["CODE_FENCE", "INNER_UNASKED_KEYS"], failureClass: null, issue: null, replyText: null },
  { callKey: "glm|STORY", model: GLM, callSiteKey: "STORY:STORYTELLER:1", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: "ORIGINAL",
    repairs: null, failureClass: "CONTENT", issue: "invalid_type@short.headline", replyText: "{\"short\": {}}" },
  { callKey: "glm|STORY", model: GLM, callSiteKey: "STORY:STORYTELLER:1", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: "PATCH",
    repairs: null, failureClass: "CONTENT", issue: "invalid_type@short.headline", replyText: "{}" }
];

describe("LG-A practice report: repairs by kind and the replies code could not repair (L34)", () => {
  it("counts the repairs of accepted replies per AI, step and kind", () => {
    expect(practiceRepairRows(TRIES)).toEqual([
      { model: GLM, step: "judge_panel", kind: "CODE_FENCE", count: 1 },
      { model: GLM, step: "judge_panel", kind: "INNER_UNASKED_KEYS", count: 1 }
    ]);
  });

  it("lists each refused reply with its class, the follow-up that came next, whether the call recovered, and a short sample", () => {
    const rows = practiceUnrepairedRows(TRIES);
    expect(rows.map(({ sample: _sample, ...row }) => row)).toEqual([
      { model: GLM, step: "opening", failureClass: "STRUCTURE", code: "PARSE_FAILED", path: "$", followUp: "STRUCTURE", recovered: true },
      { model: GLM, step: "story_writer", failureClass: "CONTENT", code: "invalid_type", path: "short.headline", followUp: "PATCH", recovered: false },
      { model: GLM, step: "story_writer", failureClass: "CONTENT", code: "invalid_type", path: "short.headline", followUp: "NONE", recovered: false }
    ]);
    expect(rows[0]!.sample).toBe("{\"statement\": \"x\" \"steelman\": {}}");
    expect(rows.every((row) => row.sample.length <= 400)).toBe(true);
  });

  it("a structure-repaired call is the original AI's one call, fixed: a warning, never a failure or Haiku's slip", () => {
    const calls = new Map<string, { model: string; tries: { outcome: string; parseStatus: string | null; replyForm: string | null }[] }>();
    for (const attempt of TRIES.slice(0, 2)) {
      const call = calls.get(attempt.callKey) ?? { model: GLM, tries: [] };
      call.tries.push({ outcome: attempt.outcome, parseStatus: attempt.parseStatus, replyForm: attempt.replyForm });
      calls.set(attempt.callKey, call);
    }
    expect(practiceModelCalls([...calls.values()] as never)).toEqual({ [GLM]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 } });
  });
});

/** A valid judge-panel assessment (judgeAssessmentSchema), and a valid story body (StoryBodySchema), as Task 4's test has them. */
const ASSESSMENT = {
  steelman: { summary: "The strongest form of the claim holds.", fidelity: 0.8 },
  critic: { summary: "The best counter is weak.", counterargumentStrength: 0.3, basis: "PLAUSIBLE_COUNTER" },
  evidence: { quality: 0.6, relevance: 0.7 },
  context: { fit: 0.9, ambiguityFlags: [] },
  fallacy: { severity: 0.1, fatalFlags: [] }
};
const paragraph = (text: string, refs: readonly string[] = []) => ({ text, node_refs: [...refs] });
const STORY = {
  shape_id: "general",
  short: {
    headline: "Fund it.", summary: "The savings held up.", confidence: "Fairly sure.",
    paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Fund it held up.", node_refs: ["P1"] }],
    change: paragraph("A ridership drop would move it.")
  },
  why: { reasons: [paragraph("Savings cover the costs.", ["P1"])] },
  long: { sections: [0, 1, 2].map((n) => ({ title: `Section ${String(n)}`, paragraphs: [paragraph(`Text ${String(n)}.`)] })) },
  reviewer_note: null as unknown
};
const story = (edit: (body: Record<string, any>) => void): Record<string, any> => {
  const body = JSON.parse(JSON.stringify(STORY)) as Record<string, any>;
  edit(body);
  return body;
};
const PANEL_KEY = "PANEL:JUDGE:critic:root2:r1:p12";

describe("LG-A practice: every repair named, and a structure-repair try read as the step it repairs", () => {
  it("names every repair of the judge's reading and of the shared decode, joined by \"+\" like the map's (pre-flight PF-A9)", () => {
    // The judge's syntax pass (Task 3): SYNTAX_REPAIRED names no repair alone; its list does.
    expect(practiceJsonRepairOf(`${JSON.stringify(ASSESSMENT).slice(0, -1)},}`, "stop", PANEL_KEY)).toBe("TRAILING_COMMA");
    expect(practiceJsonRepairOf(JSON.stringify(ASSESSMENT), "stop", PANEL_KEY)).toBeNull();
    // The shared decode (no key): every repair, in the list's order; one repair alone, as before.
    expect(practiceJsonRepairOf("{\"text\":\"a\nb\",\"list\":[1,],\"c\":\"d\",}", "stop")).toBe("TRAILING_COMMA+RAW_LINE_BREAK");
    expect(practiceJsonRepairOf("```json\n{\"a\":1}\n```", "stop")).toBe("CODE_FENCE");
    expect(practiceJsonRepairOf("{\"a\":1}", "stop")).toBeNull();
  });

  it("reads a REPAIR:STRUCTURE: try as the step it repairs, never as UNMAPPED (pre-flight PF-A57)", () => {
    const unasked = JSON.stringify({ ...ASSESSMENT, notes: "x" });
    expect(practiceJsonRepairOf(unasked, "stop", PANEL_KEY)).toBe("UNASKED_KEYS");
    expect(practiceJsonRepairOf(unasked, "stop", `REPAIR:STRUCTURE:${PANEL_KEY}`)).toBe("UNASKED_KEYS");
    const refused = JSON.stringify({ ...ASSESSMENT, steelman: { summary: "x" } });
    const repairRead = recheckReply(`REPAIR:STRUCTURE:${PANEL_KEY}`, refused);
    expect(repairRead.family).toBe("STRUCTURE_REPAIR");
    expect(repairRead.issues.length).toBeGreaterThan(0);
    expect(repairRead.issues).not.toContain("UNMAPPED");
    expect(repairRead.issues).toEqual(recheckReply(PANEL_KEY, refused).issues);
    expect(recheckReply("REPAIR:STRUCTURE:SOMETHING", "{}")).toEqual({ family: "STRUCTURE_REPAIR", issues: ["UNMAPPED"] });
    // The story's trailing-object decode follows the original key too (R15 reply 644: prose, then the verdict).
    const r15 = readFileSync(new URL("../support/fixtures/story-format-replies/mimo-checker-r15-644-reasoning-then-fenced-verdict.txt", import.meta.url), "utf8");
    expect(practiceJsonRepairOf(r15, "stop", "STORY:CHECKER:1")).toBe("TRAILING_OBJECT");
    expect(practiceJsonRepairOf(r15, "stop", "REPAIR:STRUCTURE:STORY:CHECKER:1")).toBe("TRAILING_OBJECT");
  });

  it("re-checks a storyteller's reply as the live reader reads it: the schema, then the reply fixer (pre-flight PF-A22)", () => {
    const wrapped = JSON.stringify(story((body) => { body.long = body.long.sections; }));
    expect(recheckReply("STORY:STORYTELLER:1", wrapped)).toEqual({ family: "STORYTELLER", issues: [] });
    expect(recheckReply("REPAIR:STRUCTURE:STORY:STORYTELLER:1", wrapped)).toEqual({ family: "STRUCTURE_REPAIR", issues: [] });
    const missing = JSON.stringify(story((body) => { delete body.short.headline; }));
    expect(recheckReply("STORY:STORYTELLER:1", missing).issues).toContain("invalid_type@short.headline");
  });
});

describe("LG-A practice: a failed structure-repair try, a free-text refusal, and the transcript's record", () => {
  it("a refused structure-repair try is a failed repair try of the original call, never the original AI's own slip (Task 12 carry)", () => {
    // As `collect` records them: the repair try joins the original call, and a refused try carries the call's model.
    const tries: readonly PracticeTryRecord[] = [
      { callKey: "glm|JUDGE", model: GLM, callSiteKey: "JUDGE", outcome: "FAILED", parseStatus: "PARSE_FAILED", replyForm: "ORIGINAL",
        repairs: null, failureClass: "STRUCTURE", issue: "PARSE_FAILED@$", replyText: "{\"a\" 1}" },
      { callKey: "glm|JUDGE", model: GLM, callSiteKey: "REPAIR:STRUCTURE:JUDGE", outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: "STRUCTURE",
        repairs: null, failureClass: "CONTENT", issue: "custom@$", replyText: "{}" },
      { callKey: "glm|JUDGE", model: GLM, callSiteKey: "JUDGE", outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL",
        repairs: null, failureClass: null, issue: null, replyText: null }
    ];
    expect(practiceUnrepairedRows(tries).map(({ sample: _sample, ...row }) => row)).toEqual([
      { model: GLM, step: "opening", failureClass: "STRUCTURE", code: "PARSE_FAILED", path: "$", followUp: "STRUCTURE", recovered: true },
      { model: GLM, step: "structure_repair", failureClass: "CONTENT", code: "custom", path: "$", followUp: "NONE", recovered: true }
    ]);
    expect(practiceModelCalls([{ model: GLM, tries: tries.map(({ outcome, parseStatus, replyForm }) => ({ outcome, parseStatus, replyForm })) }] as never))
      .toEqual({ [GLM]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 } });
  });

  it("splits only a `code@path` issue: a free-text parse error (which may quote the reply) gives the status, never its words", () => {
    const [row] = practiceUnrepairedRows([{ callKey: "k", model: GLM, callSiteKey: "JUDGE", outcome: "FAILED", parseStatus: "PARSE_FAILED",
      replyForm: "ORIGINAL", repairs: null, failureClass: "STRUCTURE", issue: "Unexpected token 'W', \"Write me@x\"... is not valid JSON", replyText: "Write me@x" }]);
    expect(row).toMatchObject({ code: "PARSE_FAILED", path: "$" });
  });

  it("the transcript reads the artifact's own record (migration 0120), and a structure-repair try's form without one is STRUCTURE", () => {
    const at = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const entry = (n: number, overrides: Partial<TranscriptLedgerRow>): TranscriptLedgerRow => ({
      sequence: String(n), ledgerEntryId: at(1000 + n), attemptId: at(2000 + n), callSiteKey: "JUDGE", subjectItemId: "item",
      stance: "NEUTRAL", actorRef: "deepinfra:glm", outcome: "OK", modelRole: null, thinkingLevel: null, candidateId: null,
      startedAt: new Date(0), finishedAt: new Date(1), rawArtifactRef: at(3000 + n), ...overrides });
    const artifact = (n: number, overrides: Partial<TranscriptArtifact>): TranscriptArtifact => ({
      rawArtifactId: at(3000 + n), provider: "deepinfra", providerRef: "deepinfra:glm", modelId: GLM, maker: "zai", modelVersion: null,
      parseStatus: "PARSED", parseErrorCode: null, metadata: { finish_reason: "stop" }, thinkingTokens: null, rawText: "{\"a\":1}",
      parseErrorDetail: null, ...overrides });
    const [recorded, worked, repair] = buildTranscriptAttempts({
      entries: [entry(1, {}), entry(2, { callSiteKey: "MAP:merge" }), entry(3, { callSiteKey: "REPAIR:STRUCTURE:JUDGE", outcome: "FAILED", rawArtifactRef: null })],
      artifacts: new Map([
        [at(3001), artifact(1, { replyRepairs: ["TRAILING_COMMA", "RAW_LINE_BREAK"], replyFailureClass: null, replyForm: "STRUCTURE" })],
        [at(3002), artifact(2, { rawText: "```json\n{\"a\":1}\n```" })]
      ]),
      prompts: new Map(), spend: new Map() });
    expect(recorded).toMatchObject({ replyForm: "STRUCTURE", parse: { jsonRepairs: ["TRAILING_COMMA", "RAW_LINE_BREAK"], failureClass: null } });
    expect(worked).toMatchObject({ replyForm: null, parse: { jsonRepair: "CODE_FENCE", jsonRepairs: ["CODE_FENCE"], failureClass: null } });
    expect(repair).toMatchObject({ family: "STRUCTURE_REPAIR", replyForm: "STRUCTURE", parse: { jsonRepairs: [], failureClass: null } });
  });
});
