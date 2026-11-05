// tests/unit/path-root-prompts.test.ts
// V4 start step, Task 46 (spec 2026-11-03 §4.3, §6 item 5): the path root writer's four drafted contracts and its judge leg.
// The drafts await the owners' wording; what code fixes is pinned here: the ids, the shared judge rules and form, the closed
// material, the reader sentence's place (the story's rule: only with a level) and the language line last. Data is made up.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LENGTH_GUIDANCE_START, LENGTH_SENTENCE_WRITING, READER_SENTENCE_WRITING, READING_LEVELS, argumentLanguageDirective, questionLanguageSentence,
  readerField, type LengthGuide, type ReadingLevel
} from "@debateai/kernel";
import {
  JUDGE_ANSWER_FORM, JUDGE_CLAIM_TYPE_INSTRUCTIONS, JUDGE_INSTRUCTIONS, JUDGE_INSTRUCTIONS_WITH_SOURCES, JUDGE_LEG_KINDS,
  JUDGE_PATH_ROOT_DIRECTIVE, JUDGE_PATH_ROOT_MATERIAL_FIELDS, JUDGE_PATH_ROOT_SOURCES_MATERIAL_FIELDS, JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT,
  PATH_ROOT_DRAFT_CONTRACTS, PATH_ROOT_JUDGE_INSTRUCTIONS, PATH_ROOT_JUDGE_INSTRUCTIONS_WITH_SOURCES, PATH_ROOT_NO_INVENTION_SENTENCE, framedJudgePromptForTest, judgeLegFrameSpec, judgeLegLengthStep, judgeLegModelRole, judgePathRootContractForReader,
  judgePathRootPromptContract, judgePathRootSourcesPromptContract, type JudgeLeg
} from "@debateai/judgement";
import { readPromptFrame } from "@debateai/providers";
import { storyContractForReader } from "@debateai/story";
import { engineSealedContracts } from "../../apps/runner/src/engine-contracts.js";

const GUIDE: LengthGuide = { words: 120, languageCode: "ro", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const Q = "Ar trebui orașul Harbour să construiască un al doilea debarcader înainte de vara viitoare?";
const RO = { code: "ro", name: "Romanian" };
const leg = (readingLevel: ReadingLevel | null, sources?: string): JudgeLeg => ({
  kind: "path-root", pathTitle: "Whole-system costs", pathQuestion: "What would the pier cost to build and run each year?",
  viewpoints: "Costs: What would it cost to build?\nThe old pier is enough if it is repaired.", pointsRaised: "What about winter storms?",
  readingLevel, ...(sources === undefined ? {} : { sources }) });
const SOURCES = "[{\"for\":\"path_question\",\"pages\":[],\"extracts\":[]}]";
const systemOf = (packet: { messages: readonly { role: string; content: string }[] }) => packet.messages.find((m) => m.role === "system")!.content;
const SRC = join(process.cwd(), "packages/judgement/src");
const IDS = ["judge.path-root.unknown.v1", "judge.path-root.resolved.v1", "judge.path-root.unknown.sources.v1", "judge.path-root.resolved.sources.v1"];

describe("the four drafted contracts", () => {
  it("are named in seal order; none is sealed yet, nor in the judge seal", () => {
    expect(PATH_ROOT_DRAFT_CONTRACTS.map((contract) => contract.contractId)).toEqual(IDS);
    expect(Object.isFrozen(PATH_ROOT_DRAFT_CONTRACTS)).toBe(true);
    const sealed = engineSealedContracts().map((contract) => contract.contractId);
    for (const id of IDS) {
      expect(sealed, id).not.toContain(id);
      expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, id).not.toContain(id);
    }
  });

  it("each is the drafted directive, the path root's shared rules (with sources: item 5's), the claim branch and the length sentence, in the judge form", () => {
    for (const claim of ["unknown", "resolved"] as const) {
      expect(judgePathRootPromptContract(claim)).toEqual({ contractId: `judge.path-root.${claim}.v1`,
        instruction: [JUDGE_PATH_ROOT_DIRECTIVE, PATH_ROOT_JUDGE_INSTRUCTIONS, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claim], LENGTH_SENTENCE_WRITING].join(" "),
        answerForm: JUDGE_ANSWER_FORM });
      expect(judgePathRootSourcesPromptContract(claim)).toEqual({ contractId: `judge.path-root.${claim}.sources.v1`,
        instruction: [JUDGE_PATH_ROOT_DIRECTIVE, PATH_ROOT_JUDGE_INSTRUCTIONS_WITH_SOURCES, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claim], LENGTH_SENTENCE_WRITING].join(" "),
        answerForm: JUDGE_ANSWER_FORM });
    }
  });

  it("the path root writer reads the owner's sentence on sources; every other judge keeps the sealed one", () => {
    // Task 92a: the owner's words of 4 Nov (page "AI Instructions, Batch 1"), shared by all four drafts.
    const SEALED_SENTENCE = "Never invent evidence, citations, or sources.";
    expect(PATH_ROOT_NO_INVENTION_SENTENCE).toBe("Never invent evidence, citations, or sources that are outside of the given text.");
    expect(PATH_ROOT_JUDGE_INSTRUCTIONS).toBe(PATH_ROOT_NO_INVENTION_SENTENCE + JUDGE_INSTRUCTIONS.slice(SEALED_SENTENCE.length));
    expect(PATH_ROOT_JUDGE_INSTRUCTIONS_WITH_SOURCES).toBe(PATH_ROOT_NO_INVENTION_SENTENCE + JUDGE_INSTRUCTIONS_WITH_SOURCES.slice(SEALED_SENTENCE.length));
    for (const contract of PATH_ROOT_DRAFT_CONTRACTS) {
      expect(contract.instruction.split(PATH_ROOT_NO_INVENTION_SENTENCE).length - 1, contract.contractId).toBe(1);
      expect(contract.instruction, contract.contractId).not.toContain(`${SEALED_SENTENCE} `);
    }
    expect(JUDGE_INSTRUCTIONS.startsWith(`${SEALED_SENTENCE} `)).toBe(true);
    expect(JUDGE_INSTRUCTIONS_WITH_SOURCES.startsWith(`${SEALED_SENTENCE} `)).toBe(true);
  });

  it("awaits the owners' wording; the draft names no field, and no base instruction carries the reader sentence", () => {
    // The directive and the owner's sentence on sources, each under its own marker.
    expect(readFileSync(join(SRC, "path-root-prompts.ts"), "utf8").split("// OWNER WORDING — approve before switch-on").length - 1).toBe(2);
    expect(JUDGE_PATH_ROOT_DIRECTIVE).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
    for (const name of new Set([...JUDGE_PATH_ROOT_MATERIAL_FIELDS, ...JUDGE_PATH_ROOT_SOURCES_MATERIAL_FIELDS, "question_language"])) {
      expect(JUDGE_PATH_ROOT_DIRECTIVE, name).not.toContain(name);
    }
    for (const contract of PATH_ROOT_DRAFT_CONTRACTS) {
      expect(contract.instruction, contract.contractId).not.toContain(READER_SENTENCE_WRITING);
      // The approved shared sentences name their own fields by design (the length sentence `length`, item 5 `sources`); the draft's words name none.
      for (const name of JUDGE_PATH_ROOT_SOURCES_MATERIAL_FIELDS.filter((entry) => entry !== "length" && entry !== "sources")) {
        expect(contract.instruction, `${contract.contractId} ${name}`).not.toContain(name);
      }
    }
    expect(JUDGE_PATH_ROOT_MATERIAL_FIELDS).toEqual(["question_line", "path_title", "path_question", "viewpoints", "points_raised", "length", "reader"]);
    expect(JUDGE_PATH_ROOT_SOURCES_MATERIAL_FIELDS).toEqual(["question_line", "path_title", "path_question", "viewpoints", "points_raised",
      "sources", "length", "reader"]);
  });
});

describe("the reader sentence: the story's rule, mirrored", () => {
  const C = judgePathRootPromptContract("resolved");
  it("no level: the same contract; a level: the sentence after a blank line, the id unchanged", () => {
    expect(judgePathRootContractForReader(C, null)).toBe(C);
    for (const level of ["plain", "expert"] as const) {
      const read = judgePathRootContractForReader(C, level);
      expect(read.instruction).toBe(`${C.instruction}\n\n${READER_SENTENCE_WRITING}`);
      expect(read.contractId).toBe(C.contractId);
      expect(read.answerForm).toBe(C.answerForm);
    }
  });
  it("gives exactly what the storyteller's rule gives, at every level and none (the drift pin)", () => {
    for (const contract of PATH_ROOT_DRAFT_CONTRACTS) {
      for (const level of [...READING_LEVELS, null]) {
        expect(judgePathRootContractForReader(contract, level), `${contract.contractId} ${String(level)}`)
          .toEqual(storyContractForReader(contract, level, "STORYTELLER"));
      }
    }
  });
});

describe("the path-root leg", () => {
  it("frames under its contract with the reader sentence before the language line, only with a level", () => {
    for (const claim of ["unknown", "resolved"] as const) {
      const base = judgePathRootPromptContract(claim).instruction;
      const plain = framedJudgePromptForTest(leg("plain"), Q, "Romanian", claim, RO, GUIDE).packet;
      expect(readPromptFrame(plain).contractId).toBe(`judge.path-root.${claim}.v1`);
      expect(systemOf(plain)).toContain(`${base}\n\n${READER_SENTENCE_WRITING} ${questionLanguageSentence(RO)}`);
      const none = framedJudgePromptForTest(leg(null), Q, "Romanian", claim, RO, GUIDE).packet;
      expect(systemOf(none)).toContain(`${base} ${questionLanguageSentence(RO)}`);
      expect(systemOf(none)).not.toContain(READER_SENTENCE_WRITING);
      const unlocked = framedJudgePromptForTest(leg("background"), Q, "English", claim, null, GUIDE).packet;
      expect(systemOf(unlocked)).toContain(`${base}\n\n${READER_SENTENCE_WRITING} ${argumentLanguageDirective("English")}`);
      const sourced = framedJudgePromptForTest(leg("expert", SOURCES), Q, "Romanian", claim, RO, GUIDE).packet;
      expect(readPromptFrame(sourced).contractId).toBe(`judge.path-root.${claim}.sources.v1`);
      expect(systemOf(sourced)).toContain(`${judgePathRootSourcesPromptContract(claim).instruction}\n\n${READER_SENTENCE_WRITING} ${questionLanguageSentence(RO)}`);
    }
  });

  it("sends the path's words as its own fields, then the length, the reader and the question's language last", () => {
    const frame = readPromptFrame(framedJudgePromptForTest(leg("plain"), Q, "Romanian", "resolved", RO, GUIDE).packet);
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "path_title", "path_question", "viewpoints", "points_raised",
      "length", "reader", "question_language"]);
    const content = (name: string) => frame.fields.find((field) => field.name === name)!.content;
    expect(content("question_line")).toBe(Q);
    expect(content("path_title")).toBe("Whole-system costs");
    expect(content("path_question")).toBe("What would the pier cost to build and run each year?");
    expect(content("viewpoints")).toBe("Costs: What would it cost to build?\nThe old pier is enough if it is repaired.");
    expect(content("points_raised")).toBe("What about winter storms?");
    expect(content("reader")).toBe(readerField("plain").content);
    const sourced = readPromptFrame(framedJudgePromptForTest(leg("plain", SOURCES), Q, "Romanian", "resolved", RO, GUIDE).packet);
    expect(sourced.fields.map((field) => field.name).slice(-4)).toEqual(["sources", "length", "reader", "question_language"]);
    expect(sourced.fields.find((field) => field.name === "sources")!.content).toBe(SOURCES);
  });

  it("a run without a level sends no reader field, and the leg is accepted", () => {
    const frame = readPromptFrame(framedJudgePromptForTest(leg(null), Q, "Romanian", "unknown", RO, GUIDE).packet);
    expect(frame.fields.map((field) => field.name).slice(-2)).toEqual(["length", "question_language"]);
    expect(frame.fields.map((field) => field.name)).not.toContain("reader");
    const sourced = readPromptFrame(framedJudgePromptForTest(leg(null, SOURCES), Q, "Romanian", "unknown", RO, GUIDE).packet);
    expect(sourced.fields.map((field) => field.name).slice(-3)).toEqual(["sources", "length", "question_language"]);
    expect(judgeLegFrameSpec(leg(null), "unknown", true).materialFields).toEqual(["question_line", "path_title", "path_question", "viewpoints",
      "points_raised", "length"]);
    expect(judgeLegFrameSpec(leg("plain"), "unknown", true).materialFields).toEqual(JUDGE_PATH_ROOT_MATERIAL_FIELDS);
  });

  it("is always told its length; it is the opening's step and a position's job; the leg kinds stay six", () => {
    expect(() => framedJudgePromptForTest(leg("plain"), Q, "Romanian", "resolved", RO, null))
      .toThrowError(expect.objectContaining({ code: "JUDGE_PATH_ROOT_UNLENGTHED" }));
    expect(() => framedJudgePromptForTest(leg(null, SOURCES), Q, "Romanian", "resolved", RO, null))
      .toThrowError(expect.objectContaining({ code: "JUDGE_PATH_ROOT_UNLENGTHED" }));
    expect(judgeLegLengthStep(leg(null))).toBe("opening");
    expect(judgeLegModelRole(leg("plain"))).toBe("POSITION");
    expect(JUDGE_LEG_KINDS).toHaveLength(6);
  });
});
