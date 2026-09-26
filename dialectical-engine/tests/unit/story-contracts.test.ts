import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { StoryBodySchema, StoryFateSchema, StoryVerdictBasisSchema } from "@debateai/contract";
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
  storyContractHash
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
      contractId: "story.storyteller.v1",
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

describe("verdict story — each answer form describes what its parser enforces", () => {
  it("names every member of the story schema", () => {
    const short = StoryBodySchema.shape.short.shape;
    const members = [
      ...Object.keys(StoryBodySchema.shape),
      ...Object.keys(short),
      ...Object.keys(short.paths.element.shape),
      ...Object.keys(short.change.shape),
      ...Object.keys(StoryBodySchema.shape.long.shape),
      ...Object.keys(StoryBodySchema.shape.long.shape.sections.element.shape)
    ];
    for (const member of members) expect(STORYTELLER_ANSWER_FORM).toContain(`"${member}":`);
    for (const fate of StoryFateSchema.options) expect(STORYTELLER_ANSWER_FORM).toContain(`"${fate}"`);
  });

  it("states every limit the story schema and the deterministic checks hold it to", () => {
    for (const limit of [
      "at most 160 characters", "at most 900 characters", "at most 240 characters", "at most 400 characters",
      "at most 80 characters", "at most 2000 characters", "at most 1200 characters", "at most 40 entries",
      "at most 8 entries", "3 to 12 entries", "1 to 12 paragraphs", "each position exactly once",
      "every point a text rests on must be listed in that entry's node_refs"
    ]) {
      expect(STORYTELLER_ANSWER_FORM).toContain(limit);
    }
  });

  it("names every member of the checker schema", () => {
    for (const member of Object.keys(StoryCheckerVerdictSchema.shape)) {
      expect(STORY_CHECKER_ANSWER_FORM).toContain(`"${member}":`);
    }
    for (const criterion of Object.keys(StoryCheckerVerdictSchema.shape.criteria.shape)) {
      expect(STORY_CHECKER_ANSWER_FORM).toContain(`"${criterion}": boolean`);
    }
    expect(STORY_CHECKER_ANSWER_FORM).toContain("at most 2000 characters");
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
