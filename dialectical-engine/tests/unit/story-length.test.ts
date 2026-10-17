import { describe, expect, it } from "vitest";
import { proseWordCount } from "@debateai/kernel";
import { lengthGuidancePolicyStartValues, resolveLengthGuidance, type LengthGuidance } from "@debateai/register";
import { STORY_GUIDED_BOUND_LIMITS, storyActualWords, storyGuidedBound, storyGuidedWords } from "@debateai/story";

/**
 * Length guidance (spec 2026-10-15 §3.3, §3.6, INTERFACE §5.6; LG-D): the story's guided words, the allowance its two
 * calls get with the row, and the words its storyteller wrote where it was given targets.
 */

const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "premium", answerLength: "standard" });
const STORYTELLER = Object.freeze({ maxAttempts: 2, tokenCeiling: 12_000, deadlineMs: 300_000 });
const CHECKER = Object.freeze({ maxAttempts: 2, tokenCeiling: 2_048, deadlineMs: 180_000 });

const STORY = {
  shape_id: "general",
  short: {
    headline: "We would fund the tram extension now.",
    summary: "You asked whether to fund the tram extension; our answer is yes, because fares cover running costs.",
    confidence: "Fairly sure, as long as the fare forecast holds.",
    paths: [{ position_ref: "P1", fate: "HELD_UP", line: "Funding it now held up well.", node_refs: ["P1"] }],
    change: { text: "A lower fare forecast would change the answer.", node_refs: [] }
  },
  why: { reasons: [{ text: "The fare forecast covers the running costs by year nine.", node_refs: [] }] },
  reviewer_note: null,
  long: { sections: [{ title: "Our reading of your question", paragraphs: [{ text: "You want to know whether the city should pay now.", node_refs: [] }] }] }
};

describe("the story's length guidance helpers (LG-D)", () => {
  it("guided words: every short target once, the path line 8 times, the reason 3 times (805 at the start values)", () => {
    expect(storyGuidedWords(GUIDANCE.story)).toBe(805);
    expect(storyGuidedWords({ headline: 1, summary: 1, confidence: 1, positionLine: 1, change: 1, whyReason: 1 }))
      .toBe(1 + 1 + 1 + 8 * 1 + 1 + 3 * 1);
  });

  it("row absent: the bound itself, the same object", () => {
    expect(storyGuidedBound(STORYTELLER, "STORYTELLER", null)).toBe(STORYTELLER);
    expect(storyGuidedBound(CHECKER, "CHECKER", null)).toBe(CHECKER);
  });

  it("storyteller: thinking room + (short words + long reference) × tokens per word; only the token ceiling moves", () => {
    // R1c's start value: the storyteller may think up to 64k (owner Q-C2), and the answer room comes on top
    // (pre-flight PF-D4.2): 65,536 + 11,415 = 76,951.
    expect(GUIDANCE.thinkingRoom.story_writer).toBe(65_536);
    expect([GUIDANCE.storyLongReferenceWords, GUIDANCE.tokensPerWord]).toEqual([3_000, 3]);
    expect(storyGuidedBound(STORYTELLER, "STORYTELLER", GUIDANCE)).toEqual({
      maxAttempts: 2, tokenCeiling: 65_536 + (805 + 3_000) * 3, deadlineMs: 300_000
    });
  });

  it("checker: thinking room + runaway × words × tokens per word; only the token ceiling moves", () => {
    expect([GUIDANCE.thinkingRoom.story_checker, GUIDANCE.runawayMultiplier, GUIDANCE.steps.story_checker]).toEqual([12_288, 4, 250]);
    expect(storyGuidedBound(CHECKER, "CHECKER", GUIDANCE)).toEqual({
      maxAttempts: 2, tokenCeiling: 12_288 + 4 * 250 * 3, deadlineMs: 180_000
    });
  });

  it("never lowers today's allowance, and never passes the guided ceilings", () => {
    // pre-flight PF-D4.2 (ruling A): above the 76,951 the start values give, today's allowance is kept as it is.
    const generous = Object.freeze({ ...STORYTELLER, tokenCeiling: 80_000 });
    expect(generous.tokenCeiling).toBeGreaterThan(GUIDANCE.thinkingRoom.story_writer
      + (storyGuidedWords(GUIDANCE.story) + GUIDANCE.storyLongReferenceWords) * GUIDANCE.tokensPerWord);
    expect(storyGuidedBound(generous, "STORYTELLER", GUIDANCE)).toBe(generous);
    // 65,536 + (805 + 30,000) × 3 = 157,951: held to the largest reviewed row's own maximum.
    const huge: LengthGuidance = { ...GUIDANCE, storyLongReferenceWords: 30_000 };
    expect(huge.thinkingRoom.story_writer + (storyGuidedWords(huge.story) + huge.storyLongReferenceWords) * huge.tokensPerWord)
      .toBe(157_951);
    expect(storyGuidedBound(STORYTELLER, "STORYTELLER", huge).tokenCeiling).toBe(STORY_GUIDED_BOUND_LIMITS.tokenCeiling);
    expect(STORY_GUIDED_BOUND_LIMITS.tokenCeiling).toBe(131_072);
    // pre-flight PF-D4.9: the checker keeps LG-C's cap (LENGTH_ALLOWANCE_LIMITS.capTokens), as guidedCallBound does.
    const deepChecker: LengthGuidance = { ...GUIDANCE, thinkingRoom: { ...GUIDANCE.thinkingRoom, story_checker: 40_000 } };
    expect(storyGuidedBound(CHECKER, "CHECKER", deepChecker).tokenCeiling).toBe(32_768);
  });

  it("actual words: the short version and the reasons, by the guidance's own counter, never the long version", () => {
    const counted = storyActualWords(JSON.stringify(STORY), GUIDANCE.charactersPerWord);
    expect(counted).toBe(proseWordCount({ short: STORY.short, why: STORY.why }, GUIDANCE.charactersPerWord));
    expect(counted).toBeGreaterThan(0);
    expect(counted!).toBeLessThan(proseWordCount(STORY, GUIDANCE.charactersPerWord));
  });

  it("actual words: null when the reply is not a JSON object", () => {
    expect(storyActualWords("not a story", GUIDANCE.charactersPerWord)).toBeNull();
    expect(storyActualWords("[1, 2]", GUIDANCE.charactersPerWord)).toBe(0);
  });
});
