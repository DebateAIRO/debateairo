// tests/unit/story-paths-v5.test.ts
// V4 start step, Task 51 (spec 2026-11-03 §4.3 and §6 item 8; plan Review Focus 5): STORY V5, ONE ENTRY PER PATH. On a path
// run the story is told from the paths' answers so far and the main answer: two drafted contracts (they await the owners'
// wording and are not sealed), one `short.paths` entry per path in the person's order, node refs from the points only, a
// material that keeps its shared fields first and fits the 100,000-token line by bytes and by the real count, and one fence
// for every round of one story. Without paths the story is today's, byte for byte. All data is made up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PathOutcome, StoryBody, StoryFate, TrustWord } from "@debateai/contract";
import type { Pool } from "@debateai/db";
import {
  READER_SENTENCE_STORY_CHECKER, READER_SENTENCE_WRITING, TEXT_NOT_IN_QUESTION_LANGUAGE, TypedDomainError, questionLanguageFromRun,
  questionLanguageSentence, type PathId
} from "@debateai/kernel";
import {
  ANTHROPIC_TOKEN_COUNT, PREVIEW_FINAL_WRITER_LIMITS, PROVIDER_SENT_INPUT_OVER_LIMIT, ProviderContentUnacceptedError, buildFramedPrompt,
  estimateWindowTokens, readPromptFrame, type PromptPacket, type ProviderCallRequest, type ProviderGateway, type TokenCounter
} from "@debateai/providers";
import {
  engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, resolveLengthGuidance, type StoryPolicy
} from "@debateai/register";
import {
  PATH_FINAL_DRAFT_CONTRACTS, STORYTELLER_V4_CONTRACT_ID, STORY_CHECKER_V4_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID,
  STORY_PATHS_CHECK_CRITERIA, STORY_PATHS_CHECK_V5_ANSWER_FORM, STORY_PATHS_CONTRACT_ID, STORY_PATHS_ISSUES, STORY_PATHS_LADDER,
  STORY_PATHS_INPUT_OVER_LIMIT, STORY_PATHS_LIMITS, STORY_PATHS_V5_ANSWER_FORM, StoryPathsCheckVerdictSchema, StoryWriter, loadStoryPack,
  resolveStoryPackDir, storyLengthField, storyPathsGuard, storyPathsIssues, storyPathsMaterial, storyPathsPointsOf, type StoryNodeEnrichment,
  type StoryPathsInput,
  type StoryPathsMaterialInput, type StoryRecordInput, type StorySnapshotNode, type StoryWriteInput, type StoryWriterDependencies
} from "@debateai/story";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";
import { closingRandomBytes } from "../../apps/runner/src/investigation-close.js";
import { buildStoryRunSnapshot, type StorySnapshotSource } from "../../apps/runner/src/story-snapshot.js";
import { fitStoryPathsToTokenLine } from "../../apps/runner/src/token-line.js";

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const SHARED = ["question_line", "main_answer", "paths", "points", "also_raised", "length"];
const ROOM = STORY_PATHS_LIMITS.roundTwoRoomBytes;
const LINE = PREVIEW_FINAL_WRITER_LIMITS.inputBodyMaxBytes;
const SEED = Buffer.from("a made-up seed for one story, only for this test.");
const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
const ENGINE = engineSettingsOf(engineVersionPolicyStartValues(), { makers: 3, mapOpening: false });
const nodeId = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/* ----------------------------------------------------------------- fixtures */

const ready = (line: string, fate: StoryFate, trust: TrustWord): PathOutcome => ({
  state: "READY", text: { line, summary: `${line} That is where the arguing left it.`, fate },
  what_changed: ["The arguing added a cost check."], view: null, trust, rests_on: []
});
const PATHS: StoryPathsInput = {
  paths: [
    { pathId: "b1", title: "Whole-system costs", question: "What would the tram cost to build and run each year?", author: "AI_SUGGESTION",
      ownWords: [], outcome: ready("Costs stay within the city's budget.", "HELD_UP", "SURE_FOR_CASE") },
    { pathId: "b2", title: "Riders", question: "Would people on my street ride it?", author: "PERSON_OWN_VIEW",
      ownWords: ["My street needs it more than the centre does."], outcome: ready("Riders would come if fares hold.", "PARTLY_HELD", "STILL_ARGUED") },
    { pathId: "b3", title: "Works in the centre", question: "How long would the works disrupt the centre?", author: "AI_COMBINED",
      ownWords: [], outcome: null }
  ],
  mainAnswer: ["Fund the extension, as long as fares hold."],
  mainTrust: "STILL_ARGUED",
  alsoRaised: ["Noise at night from the depot."]
};

const snapshotNode = (n: number, claim: string, isPosition = false): StorySnapshotNode => ({
  nodeId: nodeId(n), claim, isPosition, wayOfKnowing: "REASONING", baseScore: 0.5, finalStrength: 0.5, excludedReason: null,
  authorModel: "maker-a", panelDispersion: null, criticSummary: null
});
const NODES: readonly StorySnapshotNode[] = [
  snapshotNode(1, "The tram's costs fit the budget.", true),
  snapshotNode(2, "Riders would come if fares stay low.", true),
  snapshotNode(3, "The works would close two streets for a year.", true),
  snapshotNode(4, "A similar line nearby filled its trams in the first year."),
  snapshotNode(5, "Running costs rise when fares fall.")
];

const PATH_RUN: StoryWriteInput = Object.freeze<StoryWriteInput>({
  runId: "33333333-3333-4333-8333-333333333333",
  workItemId: "44444444-4444-4444-8444-444444444444",
  answerId: "55555555-5555-4555-8555-555555555555",
  answerVersion: 1,
  questionLine: "Should the city fund the tram extension?",
  argumentLanguage: { tag: "en", name: "English" },
  compositionBudgetTier: "low",
  verdictBasis: {
    label: "CONTESTED", rung: 5, trigger: "JUDGES_MAJORITY", winner_node_id: nodeId(1), winner_strength: 0.6,
    runner_up_node_id: null, runner_up_strength: null, margin: null, disagreement: null,
    thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 }, confidence_band: null, marks: []
  },
  servedStatement: ["Fund the extension, as long as fares hold."],
  nodes: NODES,
  arrows: [],
  sensitivity: [],
  setAside: [],
  judgeArtifactRefs: new Map(),
  engine: ENGINE,
  lengthGuidance: GUIDANCE,
  paths: PATHS
});

const POLICY: StoryPolicy = Object.freeze({
  storytellerRoleRef: "provider:storyteller",
  storyCheckerRoleRef: "provider:checker",
  loopMaxRounds: 2,
  storytellerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 }),
  checkerBound: Object.freeze({ maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 }),
  materialBudget: Object.freeze({ low: 40_000, medium: 80_000, high: 120_000 }),
  perStoryCeilingMicros: null,
  perStoryOverrunBasisPoints: 0,
  registerVersion: 7
});

const CRITERIA = Object.freeze(Object.fromEntries(STORY_PATHS_CHECK_CRITERIA.map((name) => [name, true])));
const CHECK_SATISFIED = JSON.stringify({ satisfied: true, misleading: false, objection: null, criteria: CRITERIA });
const CHECK_MISLEADING = JSON.stringify({ satisfied: false, misleading: true, objection: "The summary is surer than the riders' path allows.",
  criteria: { ...CRITERIA, no_overstatement: false } });

/** A v5 story as the storyteller writes it: no shape_id, one entry per path, node refs from the points. */
function storyV5(refs: readonly string[] = ["b1", "b2", "b3"]): string {
  const paragraph = (text: string) => ({ text, node_refs: ["P1"] });
  return JSON.stringify({
    short: {
      headline: "Fund the tram extension, as long as fares hold.",
      summary: "You asked whether the city should fund the tram extension. The costs fit, and riders would come if fares hold.",
      confidence: "We are fairly sure about the costs and less sure about the riders.",
      paths: refs.map((ref, at) => ({ position_ref: ref, fate: "HELD_UP", line: `What this angle found, part ${String(at + 1)}.`, node_refs: ["P1"] })),
      change: paragraph("Fares that rise sharply would change the answer.")
    },
    why: { reasons: [{ text: "The costs fit the budget, as the first point shows.", node_refs: ["P1", "P4"] }] },
    reviewer_note: null,
    long: { sections: ["The answer", "The paths", "What would change it"].map((title) => ({ title, paragraphs: [paragraph(`${title}.`)] })) }
  });
}

/** A provider double that applies the call's own content classifier, as the gateway does. */
function scripted(answer: (request: ProviderCallRequest, index: number) => string) {
  const calls: ProviderCallRequest[] = [];
  const provider: ProviderGateway = {
    async call(request) {
      calls.push(request);
      const content = answer(request, calls.length - 1);
      const classified = request.classifyContent?.(content);
      if (classified !== undefined && classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact:rejected", "ledger:rejected");
      }
      return { rawArtifactRef: `artifact:${String(calls.length)}`, ledgerEntryRef: `ledger:${String(calls.length)}`, content,
        provider: "openai-compatible-http", model: "unit/model", maker: "unit-maker", modelVersion: "unit/model" };
    }
  };
  return { provider, calls };
}

const DISPUTED: StoryNodeEnrichment = { judgeBestCase: null, judgeObjection: null, reviewOutcome: "dispute", reviewReasons: [], dispersion: null };
function harness(provider: ProviderGateway, disputed: readonly string[] = []) {
  const inserted: StoryRecordInput[] = [];
  const events: Array<[string, Record<string, unknown>]> = [];
  const deps: StoryWriterDependencies = {
    pool: {} as Pool, pack: PACK, policy: POLICY, hosted: false,
    resolveProvider: (roleRef) => ({ provider, providerRef: roleRef }),
    log: (event, detail) => { events.push([event, detail]); },
    repository: { insert: async (record) => { inserted.push(record); return "INSERTED" as const; } },
    readEnrichment: async () => new Map(disputed.map((id) => [id, DISPUTED] as const))
  };
  return { writer: new StoryWriter(deps), inserted, events };
}

const contractOf = (request: ProviderCallRequest): string => readPromptFrame(request.packet).contractId;
const names = (request: ProviderCallRequest): string[] => readPromptFrame(request.packet).fields.map((field) => field.name);
const fieldOf = (request: ProviderCallRequest, name: string): string | undefined =>
  readPromptFrame(request.packet).fields.find((field) => field.name === name)?.content;
const fieldIn = (fields: readonly { name: string; content: string }[], name: string): string | undefined =>
  fields.find((field) => field.name === name)?.content;
const answering = (checks: readonly string[]) => (request: ProviderCallRequest): string => {
  if (contractOf(request) === STORY_PATHS_CONTRACT_ID) return storyV5();
  const round = Number(request.callSiteKey.split(":").at(-1));
  return checks[round - 1] ?? CHECK_SATISFIED;
};

/** The material the writer builds for a path run (its points from the nodes, the run's length targets, no reader, no lock). */
function materialOf(input: StoryWriteInput, disputed: ReadonlySet<string>): StoryPathsMaterialInput {
  return { ...input.paths!, points: storyPathsPointsOf(input.nodes, disputed).points, questionLine: input.questionLine,
    length: storyLengthField(GUIDANCE.story, "en", GUIDANCE.charactersPerWord), readingLevel: null, language: null };
}

const words = (count: number, seed: string): string => Array.from({ length: count }, (_, at) => `${seed}${String(at % 10)}`).join(" ").slice(0, count);
/** A path at the largest texts the outcome step and the person can give it, in Latin text. */
function fullPath(no: number): StoryPathsInput["paths"][number] {
  return {
    pathId: `b${String(no)}` as PathId, title: words(120, "title"), question: words(1000, "question"), author: no === 1 ? "PERSON_OWN_VIEW" : "AI_SUGGESTION",
    ownWords: no === 1 ? [words(1000, "own")] : [],
    outcome: { state: "READY", text: { line: words(2000, "line"), summary: words(4000, "summary"), fate: "PARTLY_HELD" },
      what_changed: [words(1000, "changed"), words(1000, "changed"), words(1000, "changed")], view: null, trust: "SURE_FOR_CASE", rests_on: [] }
  };
}
const point = (n: number, text: string, disputed = false) => ({ ref: `P${String(n)}`, text, disputed });
const FULL_EIGHT: StoryPathsMaterialInput = {
  paths: [1, 2, 3, 4, 5, 6, 7, 8].map(fullPath),
  mainAnswer: [words(1500, "answer"), words(1500, "evidence")], mainTrust: "SURE_FOR_CASE",
  alsoRaised: Array.from({ length: 40 }, (_, at) => words(400, `raised${String(at)}`)),
  points: Array.from({ length: 120 }, (_, at) => point(at + 1, words(200, `point${String(at)}`), at % 7 === 6)),
  questionLine: words(1000, "question"), length: storyLengthField(GUIDANCE.story, "en", GUIDANCE.charactersPerWord), readingLevel: "plain",
  language: questionLanguageFromRun("en", "English")
};
const CJK = "中";
/** Seven paths in "中", each the person's own 1000-character path, with points and gap points in the same script. */
const CJK_SEVEN: StoryPathsMaterialInput = {
  paths: [1, 2, 3, 4, 5, 6, 7].map((no) => ({
    pathId: `b${String(no)}` as PathId, title: CJK.repeat(30), question: CJK.repeat(1000), author: "PERSON_OWN_VIEW" as const,
    ownWords: [CJK.repeat(1000)],
    outcome: { state: "READY" as const, text: { line: CJK.repeat(120), summary: CJK.repeat(400), fate: "HELD_UP" as const },
      what_changed: [CJK.repeat(100), CJK.repeat(100), CJK.repeat(100)], view: null, trust: "STILL_ARGUED" as const, rests_on: [] }
  })),
  mainAnswer: [CJK.repeat(300)], mainTrust: "STILL_ARGUED", alsoRaised: Array.from({ length: 10 }, () => CJK.repeat(100)),
  points: Array.from({ length: 60 }, (_, at) => point(at + 1, CJK.repeat(150), at % 5 === 0)),
  questionLine: CJK.repeat(200), length: storyLengthField(GUIDANCE.story, "zh", GUIDANCE.charactersPerWord), readingLevel: null,
  language: questionLanguageFromRun("zh", "Chinese")
};
const bodyBytes = (packet: PromptPacket): number => Buffer.byteLength(JSON.stringify({ messages: packet.messages }), "utf8") + 1_024;
const charactersOf = (packet: PromptPacket): number => packet.messages.reduce((sum, message) => sum + Array.from(message.content).length, 0);

/* ----------------------------------------------------------------- the drafts */

describe("the two drafted contracts", () => {
  it("are story.paths.v5 and story.paths-check.v5, in seal order, and neither is sealed yet", () => {
    expect(PATH_FINAL_DRAFT_CONTRACTS.map((contract) => contract.contractId)).toEqual([STORY_PATHS_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID]);
    expect([STORY_PATHS_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID]).toEqual(["story.paths.v5", "story.paths-check.v5"]);
    expect(Object.isFrozen(PATH_FINAL_DRAFT_CONTRACTS)).toBe(true);
    const sealed = engineSealedContracts().map((contract) => contract.contractId);
    for (const contract of PATH_FINAL_DRAFT_CONTRACTS) expect(sealed, contract.contractId).not.toContain(contract.contractId);
    expect(PATH_FINAL_DRAFT_CONTRACTS.map((contract) => contract.answerForm)).toEqual([STORY_PATHS_V5_ANSWER_FORM, STORY_PATHS_CHECK_V5_ANSWER_FORM]);
  });

  it("await the owners' wording; no instruction names a field and no form shows an id a model could copy", () => {
    expect(readFileSync(join(process.cwd(), "packages/story/src/path-final.ts"), "utf8").split("// OWNER WORDING — approve before switch-on").length - 1)
      .toBe(2);
    for (const contract of PATH_FINAL_DRAFT_CONTRACTS) {
      expect(contract.instruction, contract.contractId).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
      for (const name of [...SHARED, "candidate_story", "reader", "question_language"].filter((entry) => entry.includes("_"))) {
        expect(contract.instruction, `${contract.contractId} ${name}`).not.toContain(name);
      }
      for (const text of [contract.instruction, contract.answerForm]) {
        expect(text, contract.contractId).not.toMatch(/\b(P[1-9][0-9]*|b[1-8]|pt[1-9][1-6]|kp\d{2}|cd[1-3])\b/u);
      }
      expect(contract.answerForm.startsWith("Return only one JSON object with exactly the following schema and no additional keys"), contract.contractId)
        .toBe(true);
    }
  });

  it("the story's form asks for one entry per path in the paths field, node refs from the points, and no more certainty than the trust words", () => {
    expect(STORY_PATHS_V5_ANSWER_FORM).toContain("one entry per path in the paths field");
    expect(STORY_PATHS_V5_ANSWER_FORM).toContain("in the order given");
    expect(STORY_PATHS_V5_ANSWER_FORM).toContain("each position_ref is copied exactly from the id of a path in the paths field");
    expect(STORY_PATHS_V5_ANSWER_FORM).toContain("copied exactly from the ref of a point in the points field");
    expect(STORY_PATHS_V5_ANSWER_FORM).toContain("never surer than the trust words");
    expect(STORY_PATHS_V5_ANSWER_FORM).not.toContain("shape_id");
    for (const member of ["short", "headline", "summary", "confidence", "paths", "position_ref", "fate", "line", "node_refs", "change", "why",
      "reasons", "reviewer_note", "long", "sections", "title", "paragraphs", "text", "revision_problems"]) {
      expect(STORY_PATHS_V5_ANSWER_FORM, member).toContain(member);
    }
  });

  it("the check's criteria are the eight keys, in the form in order, and its verdict reads exactly them", () => {
    expect([...STORY_PATHS_CHECK_CRITERIA]).toEqual(["faithful_to_material", "agrees_with_main_answer", "fair_to_every_path", "no_overstatement",
      "citations_correct", "reviewer_note_separate", "goal_marked_as_reading", "speaks_to_the_person"]);
    expect(Object.keys(StoryPathsCheckVerdictSchema.shape.criteria.shape)).toEqual([...STORY_PATHS_CHECK_CRITERIA]);
    const at = STORY_PATHS_CHECK_CRITERIA.map((name) => STORY_PATHS_CHECK_V5_ANSWER_FORM.indexOf(`"${name}": boolean`));
    expect(at.every((place) => place > 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    for (const member of ["satisfied", "misleading", "objection", "criteria"]) expect(STORY_PATHS_CHECK_V5_ANSWER_FORM).toContain(`"${member}":`);
    expect(StoryPathsCheckVerdictSchema.safeParse(JSON.parse(CHECK_SATISFIED)).success).toBe(true);
    expect(StoryPathsCheckVerdictSchema.safeParse(JSON.parse(CHECK_MISLEADING)).success).toBe(true);
    // v4's criteria are not these; a satisfied verdict with an unmet criterion, or misleading without an objection, is refused.
    expect(StoryPathsCheckVerdictSchema.safeParse({ satisfied: true, misleading: false, objection: null,
      criteria: { ...CRITERIA, agrees_with_label: true } }).success).toBe(false);
    expect(StoryPathsCheckVerdictSchema.safeParse({ satisfied: true, misleading: false, objection: null,
      criteria: { ...CRITERIA, fair_to_every_path: false } }).success).toBe(false);
    expect(StoryPathsCheckVerdictSchema.safeParse({ satisfied: false, misleading: true, objection: null, criteria: CRITERIA }).success).toBe(false);
  });
});

/* ----------------------------------------------------------------- the paths check */

describe("storyPathsIssues: one entry per path, in order, node refs from the points", () => {
  const body = (refs: readonly string[], reasonRefs: readonly string[] = ["P1"]): StoryBody => ({
    shape_id: PACK.defaultShape,
    short: { headline: "h", summary: "s", confidence: "c", change: { text: "c", node_refs: [] },
      paths: refs.map((ref) => ({ position_ref: ref, fate: "HELD_UP" as const, line: "l", node_refs: ["P1"] })) },
    why: { reasons: [{ text: "r", node_refs: [...reasonRefs] }] },
    long: { sections: ["a", "b", "c"].map((title) => ({ title, paragraphs: [{ text: "p", node_refs: [] }] })) },
    reviewer_note: null
  });
  const IDS = ["b1", "b2", "b3"];
  const POINTS: ReadonlySet<string> = new Set(["P1", "P2"]);

  it.each([
    ["none", ["b1", "b2", "b3"], []],
    ["missing", ["b1", "b3"], [STORY_PATHS_ISSUES.missing]],
    ["unknown", ["b1", "b2", "b3", "b9"], [STORY_PATHS_ISSUES.unknown]],
    ["order", ["b2", "b1", "b3"], [STORY_PATHS_ISSUES.order]],
    ["twice", ["b1", "b2", "b2", "b3"], [STORY_PATHS_ISSUES.order]],
    ["unknown in place of one", ["b1", "b2", "b4"], [STORY_PATHS_ISSUES.unknown, STORY_PATHS_ISSUES.missing]]
  ] as const)("%s", (_name, refs, expected) => {
    expect(storyPathsIssues(body(refs), IDS, POINTS).map((issue) => issue.message)).toEqual(expected);
  });

  it("names each node ref the points do not give, where it stands", () => {
    expect(storyPathsIssues(body(IDS, ["P1", "P7"]), IDS, POINTS)).toEqual([
      { code: "custom", path: ["why", "reasons", 0, "node_refs", 1], message: STORY_PATHS_ISSUES.nodeRef }
    ]);
    expect(STORY_PATHS_ISSUES).toEqual({ missing: "STORY_PATHS_PATH_MISSING", unknown: "STORY_PATHS_PATH_UNKNOWN", order: "STORY_PATHS_ORDER",
      nodeRef: "STORY_PATHS_NODE_REF_UNKNOWN" });
    expect(Object.isFrozen(STORY_PATHS_ISSUES)).toBe(true);
  });
});

/* ----------------------------------------------------------------- the material and its ladder */

describe("the material", () => {
  it("shares its first fields, then the reader and the question's language last; each path's answer so far, by its id", () => {
    const built = storyPathsMaterial({ ...materialOf(PATH_RUN, new Set([nodeId(5)])), readingLevel: "plain", language: questionLanguageFromRun("ro", "Romanian") });
    expect(built.fields.map((field) => field.name)).toEqual([...SHARED, "reader", "question_language"]);
    expect(built.sharedFieldCount).toBe(6);
    expect(built.checkerOf(JSON.parse(storyV5()) as never).map((field) => field.name)).toEqual([...SHARED, "candidate_story", "reader", "question_language"]);
    expect(JSON.parse(fieldIn(built.fields, "main_answer")!)).toEqual({ segments: ["Fund the extension, as long as fares hold."], trust: "STILL_ARGUED" });
    expect(JSON.parse(fieldIn(built.fields, "paths")!)).toEqual([
      { id: "b1", title: "Whole-system costs", question: "What would the tram cost to build and run each year?", by: "AI_SUGGESTION",
        line: "Costs stay within the city's budget.", summary: "Costs stay within the city's budget. That is where the arguing left it.",
        fate: "HELD_UP", trust: "SURE_FOR_CASE", what_changed: ["The arguing added a cost check."] },
      { id: "b2", title: "Riders", question: "Would people on my street ride it?", by: "PERSON_OWN_VIEW",
        own_words: ["My street needs it more than the centre does."], line: "Riders would come if fares hold.",
        summary: "Riders would come if fares hold. That is where the arguing left it.", fate: "PARTLY_HELD", trust: "STILL_ARGUED",
        what_changed: ["The arguing added a cost check."] },
      { id: "b3", title: "Works in the centre", question: "How long would the works disrupt the centre?", by: "AI_COMBINED",
        line: null, summary: null, fate: "SET_ASIDE", trust: null, what_changed: [] }
    ]);
    expect(JSON.parse(fieldIn(built.fields, "points")!)).toEqual([
      { ref: "P1", text: "The tram's costs fit the budget." }, { ref: "P2", text: "Riders would come if fares stay low." },
      { ref: "P3", text: "The works would close two streets for a year." }, { ref: "P4", text: "A similar line nearby filled its trams in the first year." },
      { ref: "P5", text: "Running costs rise when fares fall.", disputed: true }
    ]);
    expect(JSON.parse(fieldIn(built.fields, "also_raised")!)).toEqual(["Noise at night from the depot."]);
    expect(built.ladderStep).toBe(1);
    expect([...built.pointRefs]).toEqual(["P1", "P2", "P3", "P4", "P5"]);
  });

  it("goes down the ladder, all points then 40, 20, 10 and none, disputed points first, each step from the one asked for", () => {
    expect([...STORY_PATHS_LADDER]).toEqual([Number.POSITIVE_INFINITY, 40, 20, 10, 0]);
    const at = (step: number) => storyPathsMaterial(CJK_SEVEN, { fromStep: step });
    const kept = (step: number) => JSON.parse(fieldIn(at(step).fields, "points")!) as { ref: string; disputed?: true }[];
    expect([1, 2, 3, 4, 5].map((step) => at(step).ladderStep)).toEqual([1, 2, 3, 4, 5]);
    expect(kept(1)).toHaveLength(60);
    expect(kept(2)).toHaveLength(40);
    expect(kept(3)).toHaveLength(20);
    expect(kept(4)).toHaveLength(10);
    expect(kept(5)).toEqual([]);
    expect([...at(4).pointRefs]).toEqual(kept(4).map((entry) => entry.ref));
    // 12 of the 60 points are disputed: all of them stay at 40 and 20 and fill the 10 first, written in their own order.
    expect(kept(2).filter((entry) => entry.disputed === true)).toHaveLength(12);
    expect(kept(3).filter((entry) => entry.disputed === true)).toHaveLength(12);
    expect(kept(4).every((entry) => entry.disputed === true)).toBe(true);
    const refs = kept(2).map((entry) => Number(entry.ref.slice(1)));
    expect([...refs].sort((left, right) => left - right)).toEqual(refs);
  });

  it("eight full paths: the largest round stays at or under 195,904 bytes, with the round-two room", () => {
    const built = storyPathsMaterial(FULL_EIGHT);
    expect(built.fits).toBe(true);
    expect(built.bodyBytes + ROOM).toBeLessThanOrEqual(LINE);
    // The measured packet is the storyteller's, the larger of the two first packets over the same fields.
    const teller = bodyBytes(buildFramedPrompt({ contract: PATH_FINAL_DRAFT_CONTRACTS[0]!, material: built.fields }).packet);
    const check = bodyBytes(buildFramedPrompt({ contract: PATH_FINAL_DRAFT_CONTRACTS[1]!, material: built.fields }).packet);
    expect(built.bodyBytes).toBe(teller);
    expect(teller).toBeGreaterThan(check);
    // Every path stands whole on every step: only points leave.
    expect(JSON.parse(fieldIn(built.fields, "paths")!)).toHaveLength(8);
    expect(built.ladderStep).toBeGreaterThan(1);
  });
});

/* ----------------------------------------------------------------- the real count */

describe("fitStoryPathsToTokenLine", () => {
  it("on eight full paths, a count of 99,000 moves the material one step down, logged by step only", async () => {
    const start = storyPathsMaterial(FULL_EIGHT);
    const logged: Array<[string, Record<string, unknown>]> = [];
    const asked: number[] = [];
    const count: TokenCounter = async ({ sharedFirstFieldCount }) => {
      asked.push(sharedFirstFieldCount ?? -1);
      return asked.length === 1 ? 99_000 : 50_000;
    };
    const fitted = await fitStoryPathsToTokenLine(FULL_EIGHT, count, (event, detail) => { logged.push([event, detail]); });
    expect(fitted.ladderStep).toBe(start.ladderStep + 1);
    expect(logged).toEqual([["STORY_PATHS_OVER_THE_TOKEN_LINE", { ladderStep: start.ladderStep }]]);
    expect(asked).toEqual([6, 6]);
    expect(fitted.fields).toEqual(storyPathsMaterial(FULL_EIGHT, { fromStep: start.ladderStep + 1 }).fields);
  });

  it("seven paths in \"中\", one token per character: the fitted material stays below the line with the round-two room", async () => {
    const answers: number[] = [];
    const logged: string[] = [];
    const count: TokenCounter = async ({ packet }) => { const real = charactersOf(packet); answers.push(real); return real; };
    const fitted = await fitStoryPathsToTokenLine(CJK_SEVEN, count, (event) => { logged.push(event); });
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.at(-1)! + Math.ceil(ROOM / 2)).toBeLessThan(ANTHROPIC_TOKEN_COUNT.line);
    expect(logged).toEqual([]);
    expect(fitted.fits).toBe(true);
    expect(fitted.bodyBytes + ROOM).toBeLessThanOrEqual(LINE);
  });

  it("no counter, or a failed count: the byte ladder alone", async () => {
    const bytesOnly = storyPathsMaterial(FULL_EIGHT);
    for (const fitted of [await fitStoryPathsToTokenLine(FULL_EIGHT, undefined, () => undefined),
      await fitStoryPathsToTokenLine(FULL_EIGHT, async () => null, () => undefined)]) {
      expect(fitted.ladderStep).toBe(bytesOnly.ladderStep);
      expect(fitted.fields).toEqual(bytesOnly.fields);
    }
  });
});

/* ----------------------------------------------------------------- the writer */

describe("the writer on a path run", () => {
  it("asks story.paths.v5, then the check with the same first six fields in order, and stores one entry per path by its id", async () => {
    const { provider, calls } = scripted(answering([]));
    const { writer, inserted } = harness(provider, [nodeId(5)]);
    await writer.writeAfterSettle({ ...PATH_RUN, randomBytes: closingRandomBytes(SEED) });
    expect(calls.map(contractOf)).toEqual([STORY_PATHS_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID]);
    const [teller, check] = calls as [ProviderCallRequest, ProviderCallRequest];
    expect(names(teller)).toEqual(SHARED);
    expect(names(check)).toEqual([...SHARED, "candidate_story"]);
    expect(readPromptFrame(check.packet).fields.slice(0, 6)).toEqual(readPromptFrame(teller.packet).fields.slice(0, 6));
    expect(fieldOf(teller, "points")).toBe(fieldIn(storyPathsMaterial(materialOf(PATH_RUN, new Set([nodeId(5)]))).fields, "points"));
    expect([teller.callSiteKey, check.callSiteKey]).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1"]);
    expect([teller.sharedFirstFieldCount, check.sharedFirstFieldCount]).toEqual([6, 6]);
    expect([teller.lane, teller.role, check.role]).toEqual(["story", "SYNTHESIZER", "EVALUATOR"]);
    // Code's checks: a reply out of the person's order is refused, by its code.
    const refused = teller.classifyContent!(storyV5(["b2", "b1", "b3"]));
    expect(refused.parseStatus).toBe("SCHEMA_FAILED");
    expect(refused.parseError).toContain(STORY_PATHS_ISSUES.order);
    expect(teller.classifyContent!(storyV5()).parseStatus).toBe("PARSED");
    const record = inserted[0]!;
    expect(record).toMatchObject({ outcome: "READY", failureCode: null, shapeId: PACK.defaultShape, rounds: 1 });
    expect(record.body!.short.paths.map((path) => path.position_ref)).toEqual(["b1", "b2", "b3"]);
    expect(record.body!.short.paths[0]!.node_refs).toEqual([nodeId(1)]);
    expect(record.body!.why.reasons[0]!.node_refs).toEqual([nodeId(1), nodeId(4)]);
    expect(record.pointNumbers).toEqual(Object.fromEntries(NODES.map((node, at) => [node.nodeId, `P${String(at + 1)}`])));
  });

  it("starts the ladder where the runner's fit stopped: pathsFromStep 2 sends the step-2 points", async () => {
    const many: readonly StorySnapshotNode[] = [...NODES, ...Array.from({ length: 45 }, (_, at) => snapshotNode(6 + at, `Another made-up point, number ${String(at)}.`))];
    const input: StoryWriteInput = { ...PATH_RUN, nodes: many, pathsFromStep: 2, randomBytes: closingRandomBytes(SEED) };
    const { provider, calls } = scripted(answering([]));
    const { writer, inserted } = harness(provider, [nodeId(48)]);
    await writer.writeAfterSettle(input);
    expect(inserted[0]?.outcome).toBe("READY");
    const material = materialOf(input, new Set([nodeId(48)]));
    const stepTwo = storyPathsMaterial(material, { fromStep: 2 });
    expect(stepTwo.ladderStep).toBe(2);
    expect(fieldOf(calls[0]!, "points")).toBe(fieldIn(stepTwo.fields, "points"));
    expect(fieldOf(calls[0]!, "points")).not.toBe(fieldIn(storyPathsMaterial(material).fields, "points"));
    expect(JSON.parse(fieldOf(calls[0]!, "points")!)).toHaveLength(40);
    expect(fieldOf(calls[1]!, "points")).toBe(fieldIn(stepTwo.fields, "points"));
  });

  it("every round of one story sends one fence, the revision included; another story another", async () => {
    const { provider, calls } = scripted(answering([CHECK_MISLEADING]));
    const { writer, inserted } = harness(provider);
    await writer.writeAfterSettle({ ...PATH_RUN, randomBytes: closingRandomBytes(SEED) });
    expect(calls.map((request) => request.callSiteKey)).toEqual(["STORY:STORYTELLER:1", "STORY:CHECKER:1", "STORY:STORYTELLER:2", "STORY:CHECKER:2"]);
    expect(calls.map(contractOf)).toEqual([STORY_PATHS_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID, STORY_PATHS_CONTRACT_ID, STORY_PATHS_CHECK_CONTRACT_ID]);
    const fences = calls.map((request) => readPromptFrame(request.packet).fence);
    expect(new Set(fences).size).toBe(1);
    expect(new Set(calls.map((request) => readPromptFrame(request.packet).canary)).size).toBe(1);
    // Round 2 revises its own draft: the draft as the model's own turn, the problem after it.
    expect(calls[2]!.packet.messages.length).toBeGreaterThan(calls[0]!.packet.messages.length);
    expect(JSON.stringify(calls[2]!.packet.messages)).toContain("The summary is surer than the riders");
    expect(inserted[0]).toMatchObject({ outcome: "READY", rounds: 2 });
    // Review (Task 51): every call of the story, the revision included, leaves under the 100K line, checked as each packet
    // leaves; a packet under the line goes out exactly as framed.
    for (const request of calls) {
      expect(request.sentInputTokensBelow, request.callSiteKey).toBe(ANTHROPIC_TOKEN_COUNT.line);
      expect(request.vendorPacketOf?.(request.packet), request.callSiteKey).toBe(request.packet);
    }
    const other = scripted(answering([]));
    await harness(other.provider).writer.writeAfterSettle({ ...PATH_RUN, randomBytes: closingRandomBytes(Buffer.from("another made-up seed")) });
    expect(readPromptFrame(other.calls[0]!.packet).fence).not.toBe(fences[0]);
  });

  // Review (Task 51): the writer's own refusal when no step fits, which nothing else exercised.
  it("a material over the line on every step: no call at all, FAILED/STORY_MATERIAL_TOO_LARGE, logged by its sizes", async () => {
    const huge = (no: number): StoryPathsInput["paths"][number] => ({
      pathId: `b${String(no)}` as PathId, title: CJK.repeat(120), question: CJK.repeat(1000), author: "PERSON_OWN_VIEW", ownWords: [CJK.repeat(1000)],
      outcome: { state: "READY", text: { line: CJK.repeat(2000), summary: CJK.repeat(4000), fate: "HELD_UP" },
        what_changed: [CJK.repeat(1000), CJK.repeat(1000), CJK.repeat(1000)], view: null, trust: "STILL_ARGUED", rests_on: [] }
    });
    const input: StoryWriteInput = { ...PATH_RUN, paths: { ...PATHS, paths: [1, 2, 3, 4, 5, 6, 7, 8].map(huge) }, randomBytes: closingRandomBytes(SEED) };
    const built = storyPathsMaterial(materialOf(input, new Set()));
    expect([built.ladderStep, built.fits]).toEqual([STORY_PATHS_LADDER.length, false]);
    const { provider, calls } = scripted(answering([]));
    const { writer, inserted, events } = harness(provider);
    await writer.writeAfterSettle(input);
    expect(calls).toEqual([]);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", failureCode: "STORY_MATERIAL_TOO_LARGE", body: null });
    expect(events.filter(([event]) => event === "STORY_MATERIAL_TOO_LARGE"))
      .toEqual([["STORY_MATERIAL_TOO_LARGE", { answerId: PATH_RUN.answerId, bytes: built.bodyBytes + ROOM, budgetBytes: LINE }]]);
  });

  // Review (Task 51; plan Review Focus 5): the writer hands the run's reading level and its locked language to both calls.
  it("a locked Romanian run with a reading level: the reader, then the question's language last, on both calls; an English story is refused", async () => {
    const RO = questionLanguageFromRun("ro", "Romanian")!;
    const ROMANIAN = JSON.stringify({
      short: {
        headline: "Prelungirea liniei de tramvai merită finanțată, cât timp prețul biletelor rămâne la fel.",
        summary: "Ai întrebat dacă orașul ar trebui să finanțeze prelungirea liniei de tramvai; dezbaterea spune că da, dar numărul de călători depinde de prețul biletelor.",
        confidence: "Destul de siguri în privința costurilor și mai puțin siguri în privința călătorilor.",
        paths: ["b1", "b2", "b3"].map((ref) => ({ position_ref: ref, fate: "HELD_UP", node_refs: ["P1"],
          line: "Această cale a rezistat în fața obiecțiilor și a rămas cea mai bună cale pentru oraș." })),
        change: { text: "Cifre care arată o creștere mare a prețului biletelor ar schimba răspunsul.", node_refs: ["P1"] }
      },
      why: { reasons: [{ text: "Costurile încap în bugetul orașului, după cum arată primul punct al dezbaterii.", node_refs: ["P1", "P4"] }] },
      reviewer_note: null,
      long: { sections: ["Cum am citit întrebarea", "Ce spune dezbaterea", "Ce ar schimba răspunsul"].map((title) => ({ title, paragraphs: [{
        text: "Dezbaterea a arătat că prelungirea liniei de tramvai este o idee bună pentru oraș și că nu are costuri mari.", node_refs: ["P1"] }] })) }
    });
    const locked: StoryWriteInput = { ...PATH_RUN, questionLine: "Ar trebui orasul sa finanteze prelungirea liniei de tramvai?",
      argumentLanguage: { tag: "ro", name: "Romanian" }, languageLocked: true, readingLevel: "plain", randomBytes: closingRandomBytes(SEED) };
    const { provider, calls } = scripted((request) => contractOf(request) === STORY_PATHS_CONTRACT_ID ? ROMANIAN : CHECK_SATISFIED);
    const { writer, inserted } = harness(provider);
    await writer.writeAfterSettle(locked);
    expect(inserted[0]).toMatchObject({ outcome: "READY", languageTag: "ro" });
    const [teller, check] = calls as [ProviderCallRequest, ProviderCallRequest];
    expect(names(teller)).toEqual([...SHARED, "reader", "question_language"]);
    expect(names(check)).toEqual([...SHARED, "candidate_story", "reader", "question_language"]);
    for (const request of [teller, check]) {
      expect(readPromptFrame(request.packet).fields.at(-1), request.callSiteKey).toEqual({ name: "question_language", content: JSON.stringify(RO) });
      expect(request.packet.messages[0]?.content, request.callSiteKey).toContain(questionLanguageSentence(RO));
    }
    expect(teller.packet.messages[0]?.content).toContain(READER_SENTENCE_WRITING);
    expect(check.packet.messages[0]?.content).toContain(READER_SENTENCE_STORY_CHECKER);
    const english = teller.classifyContent!(storyV5());
    expect(english.parseStatus).toBe("SCHEMA_FAILED");
    expect(english.parseError).toContain(TEXT_NOT_IN_QUESTION_LANGUAGE);
  });
});

/* ----------------------------------------------------------------- the 100K line as each packet leaves */

/**
 * Review (Task 51; plan Global "End-of-debate bodies ≤ 195_904 bytes", Review Focus 5): a provider double that sends as the
 * gateway does, so what would leave is measured: each attempt's sent form first (the caller's `vendorPacketOf`, which may refuse
 * it), then the call's input line (`sentInputTokensBelow`, the gateway's window count), and only then is it sent.
 */
function sending(answer: (request: ProviderCallRequest) => string) {
  const sent: Array<{ key: string; bytes: number }> = [];
  const refused: string[] = [];
  const provider: ProviderGateway = {
    async call(request) {
      let packet: PromptPacket;
      try {
        packet = request.vendorPacketOf === undefined ? request.packet : await request.vendorPacketOf(request.packet);
        if (request.sentInputTokensBelow !== undefined && estimateWindowTokens(packet.messages) >= request.sentInputTokensBelow) {
          throw new TypedDomainError(PROVIDER_SENT_INPUT_OVER_LIMIT, "over the call's input line");
        }
      } catch (error) {
        refused.push(request.callSiteKey);
        throw error;
      }
      sent.push({ key: request.callSiteKey, bytes: bodyBytes(packet) });
      const content = answer(request);
      const classified = request.classifyContent?.(content);
      if (classified !== undefined && classified.parseStatus !== "PARSED") {
        throw new ProviderContentUnacceptedError(1, classified.parseStatus, classified.parseError, "artifact:rejected", "ledger:rejected");
      }
      return { rawArtifactRef: `artifact:${String(sent.length)}`, ledgerEntryRef: `ledger:${String(sent.length)}`, content,
        provider: "openai-compatible-http", model: "unit/model", maker: "unit-maker", modelVersion: "unit/model" };
    }
  };
  return { provider, sent, refused };
}

describe("the 100K line, on every packet as it leaves", () => {
  /** A legal story far longer than the round-two room (24 paragraphs of about 9,700 characters): its check would carry it past the line. */
  const longStory = (): string => {
    const parsed = JSON.parse(storyV5()) as { long: { sections: unknown[] } };
    const paragraph = "The tram would run every few minutes along the new line. ".repeat(170).trim();
    parsed.long.sections = Array.from({ length: 12 }, (_, at) => ({ title: `Part ${String(at + 1)}`,
      paragraphs: [{ text: paragraph, node_refs: ["P1"] }, { text: paragraph, node_refs: ["P4"] }] }));
    return JSON.stringify(parsed);
  };

  it("a draft too long for the room: its check is refused before it leaves, so nothing goes past the line", async () => {
    const { provider, sent, refused } = sending((request) => contractOf(request) === STORY_PATHS_CONTRACT_ID ? longStory() : CHECK_SATISFIED);
    const { writer, inserted } = harness(provider);
    await writer.writeAfterSettle({ ...PATH_RUN, randomBytes: closingRandomBytes(SEED) });
    for (const packet of sent) expect(packet.bytes, packet.key).toBeLessThanOrEqual(LINE);
    expect(sent.map((packet) => packet.key)).toEqual(["STORY:STORYTELLER:1"]);
    expect(refused).toEqual(["STORY:CHECKER:1"]);
    expect(inserted[0]).toMatchObject({ outcome: "FAILED", body: null });
  });

  it("the guard measures a packet as the material is measured: at the line it passes as it is, one byte over it is refused", () => {
    const at = (bytes: number): PromptPacket => {
      const framed = (filler: number) => buildFramedPrompt({ contract: PATH_FINAL_DRAFT_CONTRACTS[0]!,
        material: [{ name: "points", content: "a".repeat(filler) }], randomBytes: closingRandomBytes(SEED) }).packet;
      const base = bodyBytes(framed(0));
      return framed(bytes - base);
    };
    const line = at(LINE);
    expect(bodyBytes(line)).toBe(LINE);
    expect(storyPathsGuard(line)).toBe(line);
    const over = at(LINE + 1);
    expect(bodyBytes(over)).toBe(LINE + 1);
    expect(() => storyPathsGuard(over)).toThrow(expect.objectContaining({ code: STORY_PATHS_INPUT_OVER_LIMIT }));
    expect(STORY_PATHS_INPUT_OVER_LIMIT).toBe("STORY_PATHS_INPUT_OVER_LIMIT");
  });
});

/* ----------------------------------------------------------------- without paths */

describe("without paths: today's story, byte for byte", () => {
  const ROOT = nodeId(101);
  const ATTACK = nodeId(102);
  const { paths: _none, ...today } = PATH_RUN;
  const withoutPaths: StoryWriteInput = Object.freeze<StoryWriteInput>({
    ...today,
    nodes: [
      { ...snapshotNode(101, "Adopt the tram extension.", true), finalStrength: 0.61 },
      { ...snapshotNode(102, "Payroll costs rise."), finalStrength: 0.4 }
    ],
    arrows: [{ sourceNodeId: ATTACK, targetNodeId: ROOT, polarity: "attack" }],
    verdictBasis: { ...PATH_RUN.verdictBasis, winner_node_id: ROOT }
  });
  /** Today's v4 story over the one position (P1) and the point against it (P2). */
  const storyV4 = (): string => {
    const parsed = JSON.parse(storyV5(["P1"])) as { short: { paths: { node_refs: string[] }[] }; why: { reasons: { node_refs: string[] }[] } };
    parsed.short.paths[0]!.node_refs = ["P1", "P2"];
    parsed.why.reasons[0]!.node_refs = ["P1", "P2"];
    return JSON.stringify(parsed);
  };
  const CHECK_V4 = JSON.stringify({ satisfied: true, misleading: false, objection: null, criteria: {
    faithful_to_material: true, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true, citations_correct: true,
    reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true } });
  const normal = (request: ProviderCallRequest) => {
    const frame = readPromptFrame(request.packet);
    return JSON.stringify(request.packet).split(frame.fence).join("<fence>").split(frame.canary).join("<canary>");
  };

  it("story.storyteller.v4 as before, and a pathsFromStep or a fence source without paths changes nothing", async () => {
    const runs = [];
    for (const input of [withoutPaths, { ...withoutPaths, pathsFromStep: 2, randomBytes: closingRandomBytes(SEED) }] as StoryWriteInput[]) {
      const { provider, calls } = scripted((request) => contractOf(request) === STORYTELLER_V4_CONTRACT_ID ? storyV4() : CHECK_V4);
      const { writer, inserted } = harness(provider);
      await writer.writeAfterSettle(input);
      expect(inserted[0]?.outcome).toBe("READY");
      expect(calls.map(contractOf)).toEqual([STORYTELLER_V4_CONTRACT_ID, STORY_CHECKER_V4_CONTRACT_ID]);
      for (const request of calls) {
        for (const member of ["sharedFirstFieldCount", "sentInputTokensBelow", "vendorPacketOf"]) expect(Object.hasOwn(request, member), member).toBe(false);
      }
      runs.push(calls);
    }
    const [before, after] = runs as [ProviderCallRequest[], ProviderCallRequest[]];
    expect(after.map(normal)).toEqual(before.map(normal));
    expect(after.map((request) => [request.callSiteKey, request.contractHash, request.bound]))
      .toEqual(before.map((request) => [request.callSiteKey, request.contractHash, request.bound]));
    // Two runs of today's story draw two fences: no fence source reaches it.
    expect(readPromptFrame(after[0]!.packet).fence).not.toBe(readPromptFrame(after[1]!.packet).fence);
  });
});

/* ----------------------------------------------------------------- the snapshot */

describe("the runner's snapshot", () => {
  const provider: ProviderGateway = { call: async () => { throw new Error("unused"); } };
  const ROOT = nodeId(201);
  const source = (overrides: Partial<StorySnapshotSource> = {}): StorySnapshotSource => ({
    runId: "run-1", workItemId: "work-1", answerId: "answer-1", answerVersion: 1, questionLine: "Should we?",
    argumentLanguage: { tag: "en", name: "English" }, compositionBudgetTier: "low",
    verdict: { label: "SPLIT", rung: 5, trigger: "JUDGES_NO_MAJORITY" },
    servedRootNodeId: ROOT, servedStrength: 0.6, runnerUp: null,
    margin: { kind: "ABSENT", reason: "ONE_POSITION" }, disagreement: { kind: "ABSENT", reason: "ENGINE2_JUDGES" },
    thresholds: { gamma: 0.05, highCut: 0.7, lowCut: 0.35, disagreementThreshold: 0.25 },
    confidenceBand: null, answerMarks: [], servedSegments: [{ text: "Yes." }],
    authored: [{ nodeId: ROOT, statement: "Yes.", provenanceRef: "artifact-root", wayOfKnowing: "REASONING", reversalPoint: "Unless not.",
      maker: "maker-a", panelDispersion: 0.05 }],
    positionNodeIds: new Set([ROOT]), baseStrengths: [{ nodeId: ROOT, baseStrength: 0.6 }], finalStrengths: [{ nodeId: ROOT, strength: 0.6 }],
    arrows: [], arrowOrder: [], sensitivity: [], conditionMarkRecords: [],
    resolveProvider: () => ({ provider, providerRef: "provider:a" }), stepLease: (use) => use(),
    costFallback: async ({ planned, request, call }) => ({ result: await call(planned, request), servedBy: planned }),
    ...overrides
  });

  it("hands the paths on with their step and fence source, node ids cleared from their texts; without paths, neither", () => {
    const randomBytes = closingRandomBytes(SEED);
    const withId = { ...PATHS, mainAnswer: [`It rests on ${nodeId(7)}.`], alsoRaised: [`See ${nodeId(8)}.`] };
    const built = buildStoryRunSnapshot(source({ paths: withId, pathsFromStep: 3, randomBytes }));
    expect(built.paths?.mainAnswer).toEqual(["It rests on (a point)."]);
    expect(built.paths?.alsoRaised).toEqual(["See (a point)."]);
    expect(built.paths?.paths).toEqual(PATHS.paths);
    expect(built.pathsFromStep).toBe(3);
    expect(built.randomBytes).toBe(randomBytes);
    const base = source();
    const today = buildStoryRunSnapshot({ ...base, pathsFromStep: 3, randomBytes });
    for (const member of ["paths", "pathsFromStep", "randomBytes"]) expect(Object.hasOwn(today, member), member).toBe(false);
    expect(today).toEqual(buildStoryRunSnapshot(base));
  });
});
