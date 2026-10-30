import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { STORY_BODY_LIMITS, StoryBodySchema, StoryFateSchema, StoryVerdictBasisSchema } from "@debateai/contract";
import { argumentLanguageDirective } from "@debateai/kernel";
import { assertFramedPrompt, buildFramedPrompt, promptContractFingerprintText } from "@debateai/providers";
import {
  STORYTELLER_ANSWER_FORM,
  STORY_CHECKER_ANSWER_FORM,
  STORY_CHECKER_LIMITS,
  STORY_CHECKER_RUNAWAY_LIMITS,
  StoryCheckerVerdictSchema,
  assembleStorytellerInstruction,
  buildStoryCheckerContract,
  buildStorytellerContract,
  loadStoryPack,
  resolveStoryPackDir,
  storyContractHash,
  storyContractInArgumentLanguage
} from "@debateai/story";
import { STORYTELLER_V2_ANSWER_FORM } from "../../packages/story/src/contracts.js";
import * as story from "../../packages/story/src/path-rewrite.js";

/**
 * Verdict story, Task 2 — the two code-owned contracts (spec §5.2). The byte
 * pins live in `prompt-text-pins.test.ts`; this file proves the forms say what
 * the parsers enforce, and that the pack reaches only the instruction slot.
 */

const PACK = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
const UNMET = Object.freeze({
  faithful_to_material: false, agrees_with_label: true, fair_to_losing_paths: true, no_overstatement: true,
  citations_correct: true, reviewer_note_separate: true, goal_marked_as_reading: true, speaks_to_the_person: true
});

describe("verdict story — the storyteller and checker contracts", () => {
  it("puts the owners' pack in the instruction slot and code's form in the answer slot", () => {
    expect(buildStorytellerContract(PACK)).toEqual({
      contractId: "story.storyteller.v3",
      instruction: assembleStorytellerInstruction(PACK),
      answerForm: STORYTELLER_ANSWER_FORM
    });
    expect(buildStoryCheckerContract(PACK)).toEqual({
      contractId: "story.checker.v3",
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
      expect(romanian.instruction).toContain("Write every natural-language field in Romanian, the language of the question, even where the material quotes another language.");
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
    // The form states these constants: maxPaths is still the schema's cap; confidenceMaxChars is the form's own number since LG-A (the schema reads STORY_RUNAWAY_LIMITS, L28).
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
    // Checker v3 (R15 practice debate, 2026-10-13): the form states 4000 (STORY_CHECKER_LIMITS); since LG-A the schema's guard is STORY_CHECKER_RUNAWAY_LIMITS, 30,000 (L28).
    expect(STORY_CHECKER_ANSWER_FORM).toContain(`"objection": null | non-empty string of at most ${STORY_CHECKER_LIMITS.maxObjectionChars} characters,`);
    expect(STORY_CHECKER_LIMITS.maxObjectionChars).toBe(4000);
    expect(StoryCheckerVerdictSchema.safeParse({ satisfied: false, objection: "x".repeat(STORY_CHECKER_RUNAWAY_LIMITS.maxObjectionChars), criteria: UNMET }).success).toBe(true);
    expect(StoryCheckerVerdictSchema.safeParse({ satisfied: false, objection: "x".repeat(STORY_CHECKER_RUNAWAY_LIMITS.maxObjectionChars + 1), criteria: UNMET }).success).toBe(false);
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

it("preserves the installed concise storyteller answer form fingerprint",()=>{expect(createHash("sha256").update(STORYTELLER_V2_ANSWER_FORM).digest("hex")).toBe("0e7ec7acc8a69057e6f23d1623cea3516925da8b72f310a06b33b859fa2d68e5");});
// Story format robustness (2026-10-12): v3 is v2 plus the quote sentence; v2 above stays as history.
it("pins the current storyteller v3 answer form fingerprint",()=>{expect(createHash("sha256").update(STORYTELLER_ANSWER_FORM).digest("hex")).toBe("443f79f8470f9a4597a0371b3849b9612a0df33047946d8a30d6aa74348840b4");});

// W3-5 (dig-model revision 2026-10-30): the path rewrite's two contracts, code's answer forms beside the owner's approved
// instructions (drafts 5.1 and 5.2; their text is pinned in prompt-text-pins.test.ts).
describe("path rewrite — the writer and checker contracts", () => {
  it("puts the owner's wording in the instruction slot and code's form in the answer slot, and frames for the door", () => {
    expect(story.PATH_REWRITE_WRITER_PROMPT_CONTRACT).toEqual({ contractId: "path-rewrite.writer.v1",
      instruction: story.PATH_REWRITE_WRITER_INSTRUCTION, answerForm: story.PATH_REWRITE_WRITER_ANSWER_FORM });
    expect(story.PATH_REWRITE_CHECKER_PROMPT_CONTRACT).toEqual({ contractId: "path-rewrite.checker.v1",
      instruction: story.PATH_REWRITE_CHECKER_INSTRUCTION, answerForm: story.PATH_REWRITE_CHECKER_ANSWER_FORM });
    for (const contract of story.PATH_REWRITE_SEALED_CONTRACTS) {
      const framed = buildFramedPrompt({ contract, material: [{ name: "question", content: "Should the city fund the tram?" }] });
      expect(assertFramedPrompt(framed.packet).contractId).toBe(contract.contractId);
    }
  });

  it("each answer form names every member its parser enforces", () => {
    for (const member of ["line", "summary", "what_changed", "text", "rests_on", "fate", "view", "outcome", "scope", "reason",
      "dig_paths", "position_ref", "HELD_UP", "PARTLY_HELD", "FELL", "SET_ASIDE", "HELPED", "DID_NOT_HELP", "NOT_SETTLED",
      "PATH", "MAIN_QUESTION", "PERSON_EDITED", "PERSON_OWN_VIEW", "revision_problems"]) {
      expect(story.PATH_REWRITE_WRITER_ANSWER_FORM, member).toContain(member);
    }
    expect(Object.keys(story.PathRewriteReplySchema.shape).sort()).toEqual(["dig_paths", "fate", "line", "summary", "view", "what_changed"]);
    for (const member of ["satisfied", "problem", "part", ...story.PATH_REWRITE_PARTS]) {
      expect(story.PATH_REWRITE_CHECKER_ANSWER_FORM, member).toContain(member);
    }
    // No trust word anywhere in the form: the path's word is code's (Q-D3).
    expect(story.PATH_REWRITE_WRITER_ANSWER_FORM).not.toMatch(/trust|SURE/u);
  });

  it("the call sites: the writer is a synthesizer call, the checker an evaluator call, rounds 1 to 4 only", () => {
    expect(story.pathRewriteCallSiteKey("WRITER", 1)).toBe("PATH_REWRITE:WRITER:1");
    expect(story.pathRewriteCallSiteRole("PATH_REWRITE:WRITER:4")).toBe("SYNTHESIZER");
    expect(story.pathRewriteCallSiteRole("PATH_REWRITE:CHECKER:3")).toBe("EVALUATOR");
    expect(story.pathRewriteCallSiteRole("PATH_REWRITE:CHECKER:5")).toBeNull();
    expect(story.pathRewriteCallSiteRole("STORY:STORYTELLER:1")).toBeNull();
    expect(() => story.pathRewriteCallSiteKey("CHECKER", 5)).toThrow(expect.objectContaining({ code: "PATH_REWRITE_ROUND_INVALID" }));
    // Both steps think low, under their own step names.
    expect(story.pathRewriteThinkingOf("PATH_REWRITE:WRITER:2")).toEqual({ step: "path_rewrite_writer", level: "low" });
    expect(story.pathRewriteThinkingOf("PATH_REWRITE:CHECKER:1")).toEqual({ step: "path_rewrite_checker", level: "low" });
    expect(story.pathRewriteThinkingOf("STORY:CHECKER:1")).toBeNull();
  });
});
