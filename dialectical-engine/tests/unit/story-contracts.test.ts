import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { STORY_BODY_LIMITS, StoryBodySchema, StoryFateSchema, StoryVerdictBasisSchema } from "@debateai/contract";
import { argumentLanguageDirective } from "@debateai/kernel";
import { assertFramedPrompt, buildFramedPrompt, promptContractFingerprintText } from "@debateai/providers";
import {
  STORYTELLER_ANSWER_FORM,
  STORY_CHECKER_ANSWER_FORM,
  StoryCheckerVerdictSchema,
  assembleStorytellerInstruction,
  buildStoryCheckerContract,
  buildStorytellerContract,
  loadStoryPack,
  resolveStoryPackDir,
  storyContractHash,
  storyContractInArgumentLanguage
} from "@debateai/story";

/**
 * Verdict story, Task 2 — the two code-owned contracts (spec §5.2). The byte
 * pins live in `prompt-text-pins.test.ts`; this file proves the forms say what
 * the parsers enforce, and that the pack reaches only the instruction slot.
 */

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));

describe("verdict story — the storyteller and checker contracts", () => {
  it("puts the owners' pack in the instruction slot and code's form in the answer slot", () => {
    expect(buildStorytellerContract(PACK)).toEqual({
      contractId: "story.storyteller.v2",
      instruction: assembleStorytellerInstruction(PACK),
      answerForm: STORYTELLER_ANSWER_FORM
    });
    expect(buildStoryCheckerContract(PACK)).toEqual({
      contractId: "story.checker.v1",
      instruction: PACK.checker,
      answerForm: STORY_CHECKER_ANSWER_FORM
    });
  });

  it("builds a framed packet the door accepts, for both contracts", () => {
    for (const contract of [buildStorytellerContract(PACK), buildStoryCheckerContract(PACK)]) {
      const framed = buildFramedPrompt({
        contract,
        material: [{ name: "question", content: JSON.stringify("Should the city fund the tram?") }]
      });
      expect(assertFramedPrompt(framed.packet).contractId).toBe(contract.contractId);
    }
  });

  it("hashes each contract as the sha256 of the frame's fingerprint text", () => {
    const storyteller = buildStorytellerContract(PACK);
    expect(storyContractHash(storyteller)).toBe(
      createHash("sha256").update(promptContractFingerprintText(storyteller), "utf8").digest("hex")
    );
    expect(storyContractHash(storyteller)).toMatch(/^[0-9a-f]{64}$/u);
    // One owner sentence more is a different contract hash: every edit is traceable.
    const edited = buildStorytellerContract({ ...PACK, common: `${PACK.common}\nOne more owner sentence.` });
    expect(storyContractHash(edited)).not.toBe(storyContractHash(storyteller));
    expect(storyContractHash(buildStoryCheckerContract(PACK))).not.toBe(storyContractHash(storyteller));
  });
});

describe("verdict story — the question's language (R1, dev's argument-language directive)", () => {
  it("appends dev's directive to the instruction, after the owners' text, and leaves the answer form alone", () => {
    for (const contract of [buildStorytellerContract(PACK), buildStoryCheckerContract(PACK)]) {
      const romanian = storyContractInArgumentLanguage(contract, "Romanian");
      expect(romanian).toEqual({
        contractId: contract.contractId,
        instruction: `${contract.instruction}\n\n${argumentLanguageDirective("Romanian")}`,
        answerForm: contract.answerForm
      });
      expect(romanian.instruction).toContain("Write every natural-language field in Romanian.");
      expect(Object.isFrozen(romanian)).toBe(true);
      // The door still accepts it: the directive holds no token reserved for the frame.
      const framed = buildFramedPrompt({ contract: romanian, material: [{ name: "question", content: JSON.stringify("Ne mut\u0103m?") }] });
      expect(assertFramedPrompt(framed.packet).contractId).toBe(contract.contractId);
    }
  });

  it("falls back to dev's own words when the run has no language on record", () => {
    const contract = buildStorytellerContract(PACK);
    expect(storyContractInArgumentLanguage(contract, null).instruction)
      .toBe(`${contract.instruction}\n\n${argumentLanguageDirective("")}`);
    expect(argumentLanguageDirective("")).toContain("the same language as the question");
  });

  it("is a different contract hash per language: the hash is of what was actually sent", () => {
    const contract = buildStorytellerContract(PACK);
    const romanian = storyContractHash(storyContractInArgumentLanguage(contract, "Romanian"));
    expect(romanian).not.toBe(storyContractHash(storyContractInArgumentLanguage(contract, "English")));
    expect(romanian).not.toBe(storyContractHash(contract));
  });
});

describe("verdict story — each answer form describes what its parser enforces", () => {
  it("names every member of the story schema", () => {
    const short = StoryBodySchema.shape.short.shape;
    const members = [
      ...Object.keys(StoryBodySchema.shape),
      ...Object.keys(short),
      ...Object.keys(short.paths.element.shape),
      ...Object.keys(short.change.shape),
      ...Object.keys(StoryBodySchema.shape.why.shape),
      ...Object.keys(StoryBodySchema.shape.why.shape.reasons.element.shape),
      ...Object.keys(StoryBodySchema.shape.long.shape),
      ...Object.keys(StoryBodySchema.shape.long.shape.sections.element.shape)
    ];
    expect(members).toEqual(expect.arrayContaining(["confidence", "why", "reasons"]));
    for (const member of members) expect(STORYTELLER_ANSWER_FORM).toContain(`"${member}":`);
    for (const fate of StoryFateSchema.options) expect(STORYTELLER_ANSWER_FORM).toContain(`"${fate}"`);
  });

  it("states every limit the story schema and the deterministic checks hold it to", () => {
    for (const limit of [
      "at most 160 characters", "at most 900 characters", "at most 240 characters", "at most 400 characters",
      "at most 80 characters", "at most 2000 characters", "at most 1200 characters", "at most 40 entries",
      "at most 8 entries", "3 to 12 entries", "1 to 12 paragraphs", "each position exactly once",
      "every point a text rests on must be listed in that entry's node_refs",
      // Fix round 1: the text-character check and the strongest-first rule the classifier enforces.
      "no control characters other than line feed and tab",
      "no bidirectional embedding, override or isolate characters (U+202A to U+202E and U+2066 to U+2069)",
      "for the first 8 positions listed",
      // R1: the confidence sentence and the reasons.
      "at most 300 characters", "at most 700 characters", "why.reasons has 1 to 3 entries"
    ]) {
      expect(STORYTELLER_ANSWER_FORM).toContain(limit);
    }
    // The form's caps are the schema's own constants.
    expect(STORYTELLER_ANSWER_FORM).toContain(`at most ${String(STORY_BODY_LIMITS.maxPaths)} entries`);
    expect(STORYTELLER_ANSWER_FORM).toContain(`at most ${String(STORY_BODY_LIMITS.confidenceMaxChars)} characters`);
    expect(STORYTELLER_ANSWER_FORM).toContain(`1 to ${String(STORY_BODY_LIMITS.whyReasonsMax)} entries`);
  });

  it("states the rules the owners' look gate added, each in a sentence or two (R1)", () => {
    for (const rule of [
      // No score values: the deterministic check refuses them (STORY_TEXT_SCORE_VALUE).
      "No text contains a score or a threshold from the material",
      // No engine vocabulary.
      "never about how the debate was run",
      // The answer first.
      "The headline and the summary always state the best answer",
      // The confidence sentence.
      "short.confidence is one sentence"
    ]) {
      expect(STORYTELLER_ANSWER_FORM).toContain(rule);
    }
    // The site texts, the confidence sentence among them, never name a point number.
    expect(STORYTELLER_ANSWER_FORM).toContain("the confidence sentence");
  });

  it("names every member of the checker schema", () => {
    for (const member of Object.keys(StoryCheckerVerdictSchema.shape)) {
      expect(STORY_CHECKER_ANSWER_FORM).toContain(`"${member}":`);
    }
    for (const criterion of Object.keys(StoryCheckerVerdictSchema.shape.criteria.shape)) {
      expect(STORY_CHECKER_ANSWER_FORM).toContain(`"${criterion}": boolean`);
    }
    expect(STORY_CHECKER_ANSWER_FORM).toContain("at most 2000 characters");
    expect(STORY_CHECKER_ANSWER_FORM).toContain("When satisfied is true, every criterion must be true.");
    expect(STORY_CHECKER_ANSWER_FORM).toContain("When satisfied is false, objection must be a non-empty string.");
    // The reservation is read beside the report, whose appendix numbers points the same way.
    expect(STORY_CHECKER_ANSWER_FORM).toContain("refer to points by their ids, such as P7");
  });
});

describe("verdict story — the verdict basis the story explains", () => {
  const basis = {
    label: "CONTESTED",
    rung: 4,
    trigger: "MID_BAND",
    winner_node_id: "node:a",
    winner_strength: 0.61,
    runner_up_node_id: "node:b",
    runner_up_strength: 0.4,
    margin: 0.21,
    disagreement: 0.08,
    thresholds: { gamma: 0.05, high_cut: 0.7, low_cut: 0.35, disagreement: 0.25 },
    confidence_band: null,
    marks: []
  };

  it("carries the measured disagreement beside the margin, and a single-position basis with both absent", () => {
    expect(StoryVerdictBasisSchema.parse(basis)).toEqual(basis);
    const single = {
      ...basis, rung: 0, trigger: "BASIS_INCOMPLETE", runner_up_node_id: null, runner_up_strength: null,
      margin: null, disagreement: null, marks: ["LABEL-BASIS-INCOMPLETE"]
    };
    expect(StoryVerdictBasisSchema.parse(single)).toEqual(single);
  });

  it("refuses a basis without the disagreement member, or with a member it does not know", () => {
    const { disagreement: _left, ...withoutDisagreement } = basis;
    expect(StoryVerdictBasisSchema.safeParse(withoutDisagreement).success).toBe(false);
    expect(StoryVerdictBasisSchema.safeParse({ ...basis, band: "HIGH" }).success).toBe(false);
  });
});

it("preserves the installed concise storyteller answer form fingerprint",()=>{expect(createHash("sha256").update(STORYTELLER_ANSWER_FORM).digest("hex")).toBe("0e7ec7acc8a69057e6f23d1623cea3516925da8b72f310a06b33b859fa2d68e5");});
