import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callFamilyOf, issueListFromParseError, practiceJsonRepairOf, practiceStepOf, recheckReply } from "../../tools/preview-practice/practice-lanes.js";
import {
  practiceLanguageFollowUpRows, practiceRepairRows, practiceStructureRescues, practiceTryJoiner, practiceUnrepairedRows, recordedSalvageRepairs,
  type PracticeDebateResult, type PracticeJoinedTry, type PracticeLedgerTry, type PracticeTryRecord
} from "../../tools/preview-practice/practice-debate.js";
import { PracticeGateObserver } from "../../tools/preview-practice/practice-gate-observer.js";
import { debateReport, reportMarkdown } from "../../tools/preview-practice/practice-report.js";
import { practiceModelCalls, practiceRepairKindsByModel } from "../../tools/preview-practice/practice-verdict.js";
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

/** Review round 1 (Review Focus 5): the ledger rows of a debate, joined into calls exactly as `collect` joins them. */
async function joined(rows: readonly (Omit<PracticeLedgerTry, "recordedForm"> & { recordedForm?: string | null })[]) {
  const join = practiceTryJoiner();
  const promptReads: string[] = [];
  const out: PracticeJoinedTry[] = [];
  for (const row of rows) {
    out.push(await join({ recordedForm: null, ...row }, async () => { promptReads.push(row.callSiteKey); return "ORIGINAL"; }));
  }
  return { out, promptReads };
}
/** The slip rule over joined tries: each call's tries, under its call's AI. */
function slipRule(rows: readonly Pick<PracticeLedgerTry, "outcome" | "formatFailed">[], joins: readonly PracticeJoinedTry[]) {
  const calls = new Map<string, { model: string; tries: { outcome: string; parseStatus: string | null; replyForm: string | null }[] }>();
  rows.forEach((row, index) => {
    const join = joins[index]!;
    const call = calls.get(join.callKey) ?? { model: join.callModel, tries: [] };
    call.tries.push({ outcome: row.outcome, parseStatus: row.formatFailed ? "SCHEMA_FAILED" : row.outcome === "OK" ? "PARSED" : null, replyForm: join.replyForm });
    calls.set(join.callKey, call);
  });
  return practiceModelCalls([...calls.values()] as never);
}
const GLM_REF = "deepinfra:glm";
const HAIKU_REF = "anthropic:haiku";
const MIMO = "XiaomiMiMo/MiMo";
const MIMO_REF = "deepinfra:mimo";
const K = "PANEL:JUDGE:critic:root2:r1:p12";
const K2 = "JUDGE:review:8d823b58";
const glmRefused = { actorRef: GLM_REF, model: GLM, callSiteKey: K, outcome: "FAILED", formatFailed: true, recordedForm: "ORIGINAL" };

describe("LG-A practice: the call join (practiceTryJoiner, review round 1, Review Focus 5)", () => {
  it("(a) GLM refused, then Haiku's accepted structure repair: one GLM call, answered and repaired; Haiku has no call", async () => {
    const rows = [glmRefused, { actorRef: HAIKU_REF, model: HAIKU, callSiteKey: `REPAIR:STRUCTURE:${K}`, outcome: "OK", formatFailed: false }];
    const { out, promptReads } = await joined(rows);
    expect(out).toEqual([
      { callKey: `${GLM_REF}\u0000${K}`, callModel: GLM, recordModel: GLM, replyForm: "ORIGINAL" },
      { callKey: `${GLM_REF}\u0000${K}`, callModel: GLM, recordModel: HAIKU, replyForm: "STRUCTURE" }
    ]);
    expect(promptReads).toEqual([]);
    expect(slipRule(rows, out)).toEqual({ [GLM]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 } });
  });

  it("(b) a refused structure repair, then GLM's final retry: one GLM call; the refused repair is the call's, never Haiku's slip", async () => {
    const rows = [glmRefused,
      { actorRef: HAIKU_REF, model: HAIKU, callSiteKey: `REPAIR:STRUCTURE:${K}`, outcome: "FAILED", formatFailed: true, recordedForm: "STRUCTURE" },
      { actorRef: GLM_REF, model: GLM, callSiteKey: K, outcome: "OK", formatFailed: false, recordedForm: "ORIGINAL" }];
    const { out } = await joined(rows);
    expect(out.map((join) => join.callKey)).toEqual(Array(3).fill(`${GLM_REF}\u0000${K}`));
    expect(out.map((join) => join.recordModel)).toEqual([GLM, GLM, GLM]);
    expect(out.map((join) => join.replyForm)).toEqual(["ORIGINAL", "STRUCTURE", "ORIGINAL"]);
    expect(slipRule(rows, out)).toEqual({ [GLM]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 } });
  });

  it("(c) another key's rows between a refusal and its repair: each repair joins the call of the key it names", async () => {
    const rows = [glmRefused,
      { actorRef: MIMO_REF, model: MIMO, callSiteKey: K2, outcome: "FAILED", formatFailed: true },
      { actorRef: HAIKU_REF, model: HAIKU, callSiteKey: `REPAIR:STRUCTURE:${K2}`, outcome: "OK", formatFailed: false },
      { actorRef: HAIKU_REF, model: HAIKU, callSiteKey: `REPAIR:STRUCTURE:${K}`, outcome: "OK", formatFailed: false }];
    const { out, promptReads } = await joined(rows);
    expect(out.map((join) => join.callKey)).toEqual([`${GLM_REF}\u0000${K}`, `${MIMO_REF}\u0000${K2}`, `${MIMO_REF}\u0000${K2}`, `${GLM_REF}\u0000${K}`]);
    expect(out.map((join) => join.callModel)).toEqual([GLM, MIMO, MIMO, GLM]);
    // Only the plain row with no recorded form reads its prompt.
    expect(promptReads).toEqual([K2]);
    expect(slipRule(rows, out)).toEqual({ [GLM]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 },
      [MIMO]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 } });
  });

  it("(d) an accepted try never marks its call as the one a repair joins", async () => {
    const accepted = { actorRef: MIMO_REF, model: MIMO, callSiteKey: K, outcome: "OK", formatFailed: false, recordedForm: "ORIGINAL" };
    const repair = { actorRef: HAIKU_REF, model: HAIKU, callSiteKey: `REPAIR:STRUCTURE:${K}`, outcome: "OK", formatFailed: false };
    // With no refused call of the key, the repair stays a call of its own.
    const alone = await joined([accepted, repair]);
    expect(alone.out[1]).toEqual({ callKey: `${HAIKU_REF}\u0000REPAIR:STRUCTURE:${K}`, callModel: HAIKU, recordModel: HAIKU, replyForm: "STRUCTURE" });
    // An accepted try of the same key between the refusal and its repair leaves the repair with the refused call.
    const between = await joined([glmRefused, accepted, repair]);
    expect(between.out.map((join) => join.callKey)).toEqual([`${GLM_REF}\u0000${K}`, `${MIMO_REF}\u0000${K}`, `${GLM_REF}\u0000${K}`]);
  });
});

describe("LG-A practice: review round 1 (codes in report.md, the story fixer's options)", () => {
  const record = (issue: string, parseStatus = "SCHEMA_FAILED"): PracticeTryRecord => ({ callKey: "k", model: GLM, callSiteKey: K,
    outcome: "FAILED", parseStatus, replyForm: "STRUCTURE", repairs: null, failureClass: "CONTENT", issue, replyText: "Write me now" });

  it("names a non-verbatim structure repair by its code, never by free text, in report.json and report.md", () => {
    expect(issueListFromParseError(JSON.stringify([{ code: "custom", path: [], message: "STRUCTURE_REPAIR_NOT_VERBATIM" }])))
      .toEqual(["STRUCTURE_REPAIR_NOT_VERBATIM@$"]);
    expect(issueListFromParseError(JSON.stringify([{ code: "custom", path: ["short"], message: "Write me now" }]))).toEqual(["custom@short"]);
    const [row] = practiceUnrepairedRows([record("STRUCTURE_REPAIR_NOT_VERBATIM@$")]);
    expect(row).toMatchObject({ code: "STRUCTURE_REPAIR_NOT_VERBATIM", path: "$", sample: "Write me now" });
    const markdown = reportMarkdown({ mode: "debate", verdict: "PASS", exitCode: 0, reasons: [], startedAt: "s", finishedAt: "f",
      unrepaired: [row] } as never);
    expect(markdown).toContain("STRUCTURE_REPAIR_NOT_VERBATIM@$ · next: NONE · not recovered");
    expect(markdown).not.toContain("Write me");
  });

  it("splits an issue only when the whole of it is a `code@path` list: words after the path never become a path", () => {
    const [row] = practiceUnrepairedRows([record("invalid_type@$ Write me now")]);
    expect(row).toMatchObject({ code: "SCHEMA_FAILED", path: "$" });
  });

  it("re-checks a storyteller's stray text under a name the story declares as the live reader does: kept, so still refused", () => {
    const stray = JSON.stringify(story((body) => { body.short.line = "A stray position line"; }));
    expect(recheckReply("STORY:STORYTELLER:1", stray).issues.length).toBeGreaterThan(0);
    expect(recheckReply("REPAIR:STRUCTURE:STORY:STORYTELLER:1", stray).issues.length).toBeGreaterThan(0);
  });
});

const RESCUES: readonly PracticeTryRecord[] = [
  { callKey: "glm|PANEL:a", model: GLM, callSiteKey: "PANEL:JUDGE:cross-root:3->2", outcome: "OK", parseStatus: "PARSED", replyForm: "ORIGINAL",
    repairs: ["ECHO_DROPPED"], failureClass: null, issue: null, replyText: null },
  { callKey: "glm|PANEL:b", model: GLM, callSiteKey: "PANEL:JUDGE:cross-root:2->3", outcome: "FAILED", parseStatus: "PARSE_FAILED",
    replyForm: "ORIGINAL", repairs: null, failureClass: "STRUCTURE", issue: "PARSE_FAILED@$", replyText: "{" },
  // The joiner records a refused Haiku try under the call's model (practice-debate.ts:289-294; pre-flight PF-S19).
  { callKey: "glm|PANEL:b", model: GLM, callSiteKey: "REPAIR:STRUCTURE:PANEL:JUDGE:cross-root:2->3", outcome: "FAILED",
    parseStatus: "SCHEMA_FAILED", replyForm: "STRUCTURE", repairs: null, failureClass: "CONTENT", issue: "STRUCTURE_REPAIR_NOT_VERBATIM@$", replyText: "{}" },
  { callKey: "glm|PANEL:b", model: GLM, callSiteKey: "PANEL:JUDGE:cross-root:2->3", outcome: "OK", parseStatus: "PARSED", replyForm: "PATCH",
    repairs: null, failureClass: null, issue: null, replyText: null }
];

/** The run had a structure-repair route (a Haiku target): a STRUCTURE reply's follow-up is B. */
const ROUTED = Object.freeze({ structureRouted: true });

describe("refused-repair salvage in the practice report", () => {
  it("A1 is a code repair: no slip, counted by kind and as a rescue in code", () => {
    expect(practiceRepairRows(RESCUES.slice(0, 1))).toEqual([{ model: GLM, step: "judge_panel", kind: "ECHO_DROPPED", count: 1 }]);
    expect(practiceModelCalls([{ model: GLM, tries: [RESCUES[0]!] }] as never)).toEqual({ [GLM]: { answered: 1, slips: 0, repaired: 0, unrecovered: 0 } });
    expect(practiceStructureRescues(RESCUES.slice(0, 1), ROUTED)).toEqual({ inCode: 1, byPatch: 0, byFullAsk: 0 });
  });

  it("B after a refused Haiku copy is the original AI's call fixed by a patch: a warning, never a failure", () => {
    const tries = RESCUES.slice(1).map((attempt) => ({ outcome: attempt.outcome, parseStatus: attempt.parseStatus, replyForm: attempt.replyForm }));
    expect(practiceRepairKindsByModel([{ model: GLM, tries }] as never)).toEqual({ [GLM]: { repairedByPatch: 1, repairedByFullAsk: 0, repairedOtherwise: 0 } });
    expect(practiceUnrepairedRows(RESCUES).every((row) => row.recovered)).toBe(true);
    expect(practiceStructureRescues(RESCUES.slice(1), ROUTED)).toEqual({ inCode: 0, byPatch: 1, byFullAsk: 0 });
  });

  it("counts the rescues and prints one line", () => {
    expect(practiceStructureRescues(RESCUES, ROUTED)).toEqual({ inCode: 1, byPatch: 1, byFullAsk: 0 });
    // The file's own report literal (as at :272-273; pre-flight PF-S17: no `debateReportFixture` exists).
    expect(reportMarkdown({ mode: "debate", verdict: "PASS", exitCode: 0, reasons: [], startedAt: "s", finishedAt: "f",
      structureRescues: { inCode: 1, byPatch: 1, byFullAsk: 0 } } as never))
      .toContain("Structure rescues: in code 1, by short follow-up 1, by full re-ask 0");
    expect(reportMarkdown({ mode: "debate", verdict: "PASS", exitCode: 0, reasons: [], startedAt: "s", finishedAt: "f" } as never))
      .not.toContain("Structure rescues");
  });

  it("the tolerant-repairs list reads A1's recorded names, not the raw reply", () => {
    expect(recordedSalvageRepairs(["UNASKED_KEYS", "ECHO_DROPPED"])).toBe("UNASKED_KEYS+ECHO_DROPPED");
    expect(recordedSalvageRepairs(["CODE_FENCE"])).toBeNull();
    expect(recordedSalvageRepairs([])).toBeNull();
    expect(recordedSalvageRepairs(null)).toBeNull();
  });
});

describe("refused-repair salvage in the practice report: review round 1", () => {
  const none = { before: null, after: null };
  const result = (extra: Record<string, unknown>) => ({
    register: null, questionId: "ro", depth: 1,
    admission: { admitted: true, refusalCode: null, panel: [], satOut: [], rotation: null },
    run: { runId: "r", workItemOutcome: "COMPLETED", failureCode: null,
      answer: { served: true, terminal: "SERVED", serveState: null, verdictState: null, conditionMarks: [] },
      story: { outcome: "READY", failureCode: null } },
    byModelAndSite: [], probes: [], failures: [], formatFailures: 0, callsByModel: {}, answersByModel: {}, jsonRepairs: [],
    failedCalls: 0, refusedCalls: 0, remaining: { deepinfra: none, anthropic: none }, seconds: { admission: 1, debate: 2 }, ...extra
  }) as unknown as PracticeDebateResult;
  const report = (extra: Record<string, unknown>) => debateReport({ result: result(extra), observer: new PracticeGateObserver(),
    startedAt: new Date(0), finishedAt: new Date(1_000) });

  it("a run with no rescue keeps today's report: no structureRescues key and no line, whether the field is absent or all zero", () => {
    const today = report({});
    const zero = report({ structureRescues: { inCode: 0, byPatch: 0, byFullAsk: 0 } });
    expect(Object.keys(zero)).not.toContain("structureRescues");
    expect(JSON.stringify(zero)).toBe(JSON.stringify(today));
    expect(reportMarkdown(zero)).toBe(reportMarkdown(today));
    expect(reportMarkdown(zero)).not.toContain("Structure rescues");
    expect(reportMarkdown({ mode: "debate", verdict: "PASS", exitCode: 0, reasons: [], startedAt: "s", finishedAt: "f",
      structureRescues: { inCode: 0, byPatch: 0, byFullAsk: 0 } } as never)).not.toContain("Structure rescues");
  });

  it("the debate report copies a non-zero count and prints its line", () => {
    const rescued = report({ structureRescues: { inCode: 0, byPatch: 0, byFullAsk: 1 } });
    expect(rescued.structureRescues).toEqual({ inCode: 0, byPatch: 0, byFullAsk: 1 });
    expect(reportMarkdown(rescued)).toContain("Structure rescues: in code 0, by short follow-up 0, by full re-ask 1");
  });

  it("a run without a structure route never counts a follow-up as B (today's patch or re-ask), but still counts A1's drops", () => {
    expect(practiceStructureRescues(RESCUES, { structureRouted: false })).toEqual({ inCode: 1, byPatch: 0, byFullAsk: 0 });
    expect(practiceStructureRescues(RESCUES, ROUTED)).toEqual({ inCode: 1, byPatch: 1, byFullAsk: 0 });
  });

  it("the practice passes the runner composition's route to the count (route present = its structure-repair ceiling is set)", () => {
    const read = (file: string) => readFileSync(new URL(`../../tools/preview-practice/${file}`, import.meta.url), "utf8");
    expect(read("practice-runner-composition.ts")).toContain("structureRouted: previewStructureRepairCeiling(structureRepairRoute) !== null");
    expect(read("practice-debate.ts")).toContain("await collect(pool, job.runId, { structureRouted: runner.structureRouted })");
  });

  it("PF-S26: a B-rescued call is still a slip the same call fixed (a warning), never unrecovered", () => {
    const tries = RESCUES.slice(1).map((attempt) => ({ outcome: attempt.outcome, parseStatus: attempt.parseStatus, replyForm: attempt.replyForm }));
    expect(practiceModelCalls([{ model: GLM, tries }] as never)).toEqual({ [GLM]: { answered: 1, slips: 1, repaired: 1, unrecovered: 0 } });
  });

  it("a writer's STRUCTURE reply answered by the full re-ask counts as by full re-ask", () => {
    const writer: readonly PracticeTryRecord[] = [
      { callKey: "glm|W", model: GLM, callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", outcome: "FAILED", parseStatus: "PARSE_FAILED",
        replyForm: "ORIGINAL", repairs: null, failureClass: "STRUCTURE", issue: "PARSE_FAILED@$", replyText: "no object" },
      { callKey: "glm|W", model: GLM, callSiteKey: "COMPOSER:SYNTHESIZER:INITIAL:1", outcome: "OK", parseStatus: "PARSED",
        replyForm: "FULL", repairs: null, failureClass: null, issue: null, replyText: null }
    ];
    expect(practiceStructureRescues(writer, ROUTED)).toEqual({ inCode: 0, byPatch: 0, byFullAsk: 1 });
  });

  it("a call whose first refusal is CONTENT and ends in a patch is today's patch, not a structure rescue", () => {
    const content: readonly PracticeTryRecord[] = [
      { callKey: "glm|S", model: GLM, callSiteKey: "STORY:STORYTELLER:1", outcome: "FAILED", parseStatus: "SCHEMA_FAILED",
        replyForm: "ORIGINAL", repairs: null, failureClass: "CONTENT", issue: "invalid_type@short.headline", replyText: "{}" },
      { callKey: "glm|S", model: GLM, callSiteKey: "STORY:STORYTELLER:1", outcome: "OK", parseStatus: "PARSED",
        replyForm: "PATCH", repairs: null, failureClass: null, issue: null, replyText: null }
    ];
    expect(practiceStructureRescues(content, ROUTED)).toEqual({ inCode: 0, byPatch: 0, byFullAsk: 0 });
  });
});

describe("the stray-letter rule's measure: reply-language refusals and their short follow-ups (PR #194)", () => {
  const refused = (callKey: string, model: string, callSiteKey: string, issues: readonly string[], replyForm = "ORIGINAL"): PracticeTryRecord => ({
    callKey, model, callSiteKey, outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm, repairs: null, failureClass: "CONTENT",
    issue: issues[0]!, issues, replyText: "{}" });
  const accepted = (callKey: string, model: string, callSiteKey: string, replyForm: string): PracticeTryRecord => ({
    callKey, model, callSiteKey, outcome: "OK", parseStatus: "PARSED", replyForm, repairs: null, failureClass: null, issue: null, replyText: null });
  const LANGUAGE: readonly PracticeTryRecord[] = [
    // R19's case: a Chinese word in the English story, refused, then the short follow-up accepted.
    refused("glm|STORY", GLM, "STORY:STORYTELLER:1", ["TEXT_NOT_IN_QUESTION_LANGUAGE@long.sections.0.paragraphs.1.text"]),
    accepted("glm|STORY", GLM, "STORY:STORYTELLER:1", "PATCH"),
    // Refused beside another issue (the language one second); the follow-up refused again, then the full re-ask accepted.
    refused("glm|PANEL", GLM, PANEL_KEY, ["too_big@steelman.summary", "TEXT_NOT_IN_QUESTION_LANGUAGE@critic.summary"]),
    refused("glm|PANEL", GLM, PANEL_KEY, ["TEXT_NOT_IN_QUESTION_LANGUAGE@critic.summary"], "PATCH"),
    accepted("glm|PANEL", GLM, PANEL_KEY, "FULL"),
    // The map's own name for the same refusal, with no try after it.
    refused("haiku|MAP", HAIKU, "MAP:merge", ["MAP_WRONG_LANGUAGE@positions.0.statement"]),
    // Any other refusal is not counted, whatever follow-up it got.
    refused("haiku|JUDGE", HAIKU, "JUDGE", ["invalid_type@statement"]),
    accepted("haiku|JUDGE", HAIKU, "JUDGE", "PATCH")
  ];

  it("counts per AI, step and code the refused replies, the short follow-ups sent for them and those accepted", () => {
    expect(practiceLanguageFollowUpRows(LANGUAGE)).toEqual([
      { model: HAIKU, step: "map", code: "MAP_WRONG_LANGUAGE", refused: 1, followUps: 0, accepted: 0 },
      { model: GLM, step: "judge_panel", code: "TEXT_NOT_IN_QUESTION_LANGUAGE", refused: 2, followUps: 1, accepted: 0 },
      { model: GLM, step: "story_writer", code: "TEXT_NOT_IN_QUESTION_LANGUAGE", refused: 1, followUps: 1, accepted: 1 }
    ]);
    // A record that kept only its first issue is read by that one; a code inside free text is never a code.
    const { issues: _issues, ...firstOnly } = LANGUAGE[0]!;
    expect(practiceLanguageFollowUpRows([firstOnly, LANGUAGE[1]!])).toEqual([
      { model: GLM, step: "story_writer", code: "TEXT_NOT_IN_QUESTION_LANGUAGE", refused: 1, followUps: 1, accepted: 1 }]);
    expect(practiceLanguageFollowUpRows([refused("k", GLM, "JUDGE", ["Expected TEXT_NOT_IN_QUESTION_LANGUAGE@x to be fixed"])])).toEqual([]);
    expect(practiceLanguageFollowUpRows([])).toEqual([]);
  });

  it("report.json keeps an admitted debate's list (an empty one too) and report.md shows the table, or none", () => {
    const none = { before: null, after: null };
    const result = (extra: Record<string, unknown>) => ({
      register: null, questionId: "lang-en-hukou", depth: 1,
      admission: { admitted: true, refusalCode: null, panel: [], satOut: [], rotation: null },
      run: { runId: "r", workItemOutcome: "COMPLETED", failureCode: null,
        answer: { served: true, terminal: "SERVED", serveState: null, verdictState: null, conditionMarks: [] },
        story: { outcome: "READY", failureCode: null } },
      byModelAndSite: [], probes: [], failures: [], formatFailures: 0, callsByModel: {}, answersByModel: {}, jsonRepairs: [],
      failedCalls: 0, refusedCalls: 0, remaining: { deepinfra: none, anthropic: none }, seconds: { admission: 1, debate: 2 }, ...extra
    }) as unknown as PracticeDebateResult;
    const report = (extra: Record<string, unknown>) => debateReport({ result: result(extra), observer: new PracticeGateObserver(),
      startedAt: new Date(0), finishedAt: new Date(1_000) });
    const rows = practiceLanguageFollowUpRows(LANGUAGE);
    const counted = report({ languageFollowUps: rows });
    expect(counted.languageFollowUps).toEqual(rows);
    const markdown = reportMarkdown(counted);
    expect(markdown).toContain("| model | step | code | refused | short follow-ups | follow-ups accepted |");
    expect(markdown).toContain(`| ${GLM} | story_writer | TEXT_NOT_IN_QUESTION_LANGUAGE | 1 | 1 | 1 |`);
    expect(markdown).toContain(`| ${HAIKU} | map | MAP_WRONG_LANGUAGE | 1 | 0 | 0 |`);
    const zero = report({ languageFollowUps: [] });
    expect(zero.languageFollowUps).toEqual([]);
    expect(reportMarkdown(zero)).toContain("Reply-language refusals: none (no reply was refused for its language or script).");
    // A debate never admitted has no list (collect never ran): no key and no line.
    const unread = report({});
    expect(Object.keys(unread)).not.toContain("languageFollowUps");
    expect(reportMarkdown(unread)).not.toContain("Reply-language refusals");
  });

  it("the debate's collector keeps every issue of a refused reply and counts them", () => {
    const source = readFileSync(new URL("../../tools/preview-practice/practice-debate.ts", import.meta.url), "utf8");
    expect(source).toContain("refused = Object.freeze({ issue: issues[0] ?? null, issues, replyText: reportableReplyText(content) });");
    expect(source).toContain("languageFollowUps: practiceLanguageFollowUpRows(records),");
  });
});
