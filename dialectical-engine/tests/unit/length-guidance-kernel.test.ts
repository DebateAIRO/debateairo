/**
 * Length guidance (spec 2026-10-15, LG-B Task 1): the kernel's shared vocabulary. The step keys are the preview thinking
 * table's words (INTERFACE §1.1) or, for the two engine steps, map onto them (engine INTERFACE §4.2); the start values are
 * spec §7's (INTERFACE §1.2) as the engine INTERFACE §4.1 amends them; and the word counter follows the rule
 * of the research's measure_lengths.py: every text value of three or more words, keys and short labels left out; for
 * Chinese, Japanese and Thai, characters divided by the row's factor.
 */
import { describe, expect, it } from "vitest";
import {
  FINAL_WRITER_STEPS, LENGTH_GUIDANCE_START, LENGTH_GUIDANCE_STEPS, LENGTH_STEP_THINKING_STEP, LENGTH_THINKING_ROOM_KEYS,
  MAP_WORD_TARGET_PARTS, STORY_WORD_TARGET_FIELDS, answerRoomTokens, lengthCallStepOf, lengthStartWordsOf, proseWordCount,
  storyShortWordsSum, storytellerAnswerRoomTokens
} from "@debateai/kernel";
import { STORY_BODY_LIMITS } from "@debateai/contract";
import { PREVIEW_THINKING_STEPS } from "@debateai/providers";

describe("the step vocabulary", () => {
  it("uses the preview thinking table's words, plus the storyteller and the map for thinking room", () => {
    expect(LENGTH_GUIDANCE_STEPS).toEqual(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
      "answer_writer", "answer_checker", "story_checker", "comparing_judge", "investigator"]);
    // Engine INTERFACE §4.2 (pre-flight PF-B1.6): the two engine steps run at a thinking-table step of their own.
    const mapped: Readonly<Record<string, string>> = LENGTH_STEP_THINKING_STEP;
    for (const step of LENGTH_GUIDANCE_STEPS) expect(PREVIEW_THINKING_STEPS).toContain(mapped[step] ?? step);
    expect(Object.keys(LENGTH_STEP_THINKING_STEP)).toEqual(["comparing_judge", "investigator"]);
    expect(LENGTH_THINKING_ROOM_KEYS).toEqual([...LENGTH_GUIDANCE_STEPS, "story_writer", "map"]);
    expect(FINAL_WRITER_STEPS).toEqual(["answer_writer", "answer_checker", "story_writer", "story_checker"]);
    expect(STORY_WORD_TARGET_FIELDS).toEqual(["headline", "summary", "confidence", "positionLine", "change", "whyReason"]);
    expect(MAP_WORD_TARGET_PARTS).toEqual(["claim", "whyItMatters", "candidateAnswer", "angleLabel", "angleFocus",
      "framingChallenge", "chosenAnswer", "checkReason"]);
    expect(Object.isFrozen(LENGTH_GUIDANCE_STEPS) && Object.isFrozen(LENGTH_GUIDANCE_START.standardWords)).toBe(true);
  });

  it("names the step of every call-site key the engine builds", () => {
    const cases: readonly (readonly [string, string | undefined, string | null])[] = [
      ["JUDGE", "served", "opening"], ["JUDGE:root:node-1", "served", "opening"],
      ["JUDGE:defender:node-1", "served", "pros_cons"], ["JUDGE:critic:node-1:seat:main", "served", "pros_cons"],
      ["JUDGE:cross-root:node-1", "served", "cross_exchange"], ["PANEL:root:preview:fixture-a", "served", "judge_panel"],
      ["JUDGE:review:node-1", "served", "reviewer"], ["COMPOSER:SYNTHESIZER:INITIAL:1", "served", "answer_writer"],
      ["COMPOSER:SYNTHESIZER:RETRY:2:seat:runnerUp", "served", "answer_writer"],
      ["POST_COMPOSE_R9:EVALUATOR:1", "served", "answer_checker"],
      ["STORY:STORYTELLER:1", "story", "story_writer"], ["STORY:CHECKER:2", "story", "story_checker"],
      ["STORY:STORYTELLER:1", undefined, "story_writer"], ["STORY:STORYTELLER:1", "served", null],
      ["MAP:angles", "served", "map"], ["MAP:list:3", "served", "map"], ["MAP:choose", undefined, "map"],
      ["REPAIR:STRUCTURE:PANEL:root:x", "served", "structure_repair"],
      ["HEALTH:probe", "served", null], ["STOPPING", undefined, null]
    ];
    for (const [key, lane, step] of cases) expect(lengthCallStepOf(key, lane), `${key} ${String(lane)}`).toBe(step);
  });
});

describe("the start values (spec §7, engine INTERFACE §4, owner G5)", () => {
  it("are the spec's numbers", () => {
    expect(LENGTH_GUIDANCE_START.standardWords).toEqual({ opening: 300, pros_cons: 250, cross_exchange: 250, judge_panel: 200,
      reviewer: 120, answer_writer: 350, answer_checker: 150, story_checker: 250, comparing_judge: 80, investigator: 60 });
    expect(LENGTH_GUIDANCE_START.answerWriterWords).toEqual({ short: 200, standard: 350, detailed: 1000 });
    expect(LENGTH_GUIDANCE_START.sameAtEveryLevel).toEqual(["answer_checker", "story_checker", "comparing_judge", "investigator"]);
    expect(Object.keys(LENGTH_GUIDANCE_START.thinkingRoom).sort()).toEqual([...LENGTH_THINKING_ROOM_KEYS].sort());
    expect([LENGTH_GUIDANCE_START.thinkingRoom.comparing_judge, LENGTH_GUIDANCE_START.thinkingRoom.investigator]).toEqual([4096, 2048]);
    expect(Object.keys(LENGTH_GUIDANCE_START.map)).toEqual([...MAP_WORD_TARGET_PARTS]);
    expect(LENGTH_GUIDANCE_START.story).toEqual({ headline: 15, summary: 120, confidence: 30, positionLine: 35, change: 60, whyReason: 100 });
    // Owner Q-C2 (2026-10-16): the storyteller's thinking room is 64k (was 16384 until LG-C).
    expect(LENGTH_GUIDANCE_START.thinkingRoom.story_writer).toBe(65536);
    expect([LENGTH_GUIDANCE_START.runawayMultiplier, LENGTH_GUIDANCE_START.tokensPerWord, LENGTH_GUIDANCE_START.storyLongReferenceWords])
      .toEqual([4, 3, 3000]);
    expect(LENGTH_GUIDANCE_START.charactersPerWord).toEqual({ zh: 1.6, ja: 2.0, th: 5.0 });
  });

  it("counts the story's lines as the story's own schema does", () => {
    expect(LENGTH_GUIDANCE_START.storyCounts).toEqual({ positionLines: STORY_BODY_LIMITS.maxPaths, whyReasons: STORY_BODY_LIMITS.whyReasonsMax });
  });

  it("gives the row-absent words of every step, and none for the storyteller and the repair call", () => {
    expect(lengthStartWordsOf("pros_cons")).toBe(250);
    expect(lengthStartWordsOf("answer_writer")).toBe(350);
    expect(lengthStartWordsOf("comparing_judge")).toBe(80);
    expect(lengthStartWordsOf("investigator")).toBe(60);
    // One map item's parts: 35 + 35 + 25 + 8 + 35 + 35 + 35 + 40.
    expect(lengthStartWordsOf("map")).toBe(248);
    expect(lengthStartWordsOf("story_writer")).toBeNull();
    expect(lengthStartWordsOf("structure_repair")).toBeNull();
    // 15 + 120 + 30 + 8 x 35 + 60 + 3 x 100.
    expect(storyShortWordsSum(LENGTH_GUIDANCE_START.story)).toBe(805);
  });
});

describe("the answer room (L14, L25)", () => {
  it("is the runaway factor times the guided words times the tokens per word, rounded up", () => {
    expect(answerRoomTokens(250, 4, 3)).toBe(3000);
    expect(answerRoomTokens(35, 4, 2.5)).toBe(350);
    expect(answerRoomTokens(1, 2, 1.5)).toBe(3);
  });

  it("for the storyteller is the short words plus the long reference, without the runaway factor", () => {
    expect(storytellerAnswerRoomTokens(805, 3000, 3)).toBe(11415);
  });

  it("refuses a non-positive or non-finite input in every argument position", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => answerRoomTokens(bad, 4, 3)).toThrow("LENGTH_ANSWER_ROOM_INVALID");
      expect(() => answerRoomTokens(250, bad, 3)).toThrow("LENGTH_ANSWER_ROOM_INVALID");
      expect(() => answerRoomTokens(250, 4, bad)).toThrow("LENGTH_ANSWER_ROOM_INVALID");
      expect(() => storytellerAnswerRoomTokens(bad, 3000, 3)).toThrow("LENGTH_ANSWER_ROOM_INVALID");
      expect(() => storytellerAnswerRoomTokens(805, bad, 3)).toThrow("LENGTH_ANSWER_ROOM_INVALID");
      expect(() => storytellerAnswerRoomTokens(805, 3000, bad)).toThrow("LENGTH_ANSWER_ROOM_INVALID");
    }
  });
});

describe("proseWordCount (spec §3.6)", () => {
  it("counts every text value of three or more words, however deeply nested, and nothing else", () => {
    const reply = {
      statement: "The tram extension pays for itself within nine years.",       // 9
      label: "support",                                                        // a label: not prose
      id: "node-12",                                                           // an id: not prose
      reasons: ["Fares rise with the new line.", "Two words", { text: "Maintenance is shared with the bus company." }], // 6 + 0 + 7
      score: 0.7, served_number_refs: []
    };
    expect(proseWordCount(reply)).toBe(22);
  });

  it("counts Chinese and Japanese by characters over the factor, Thai the same way", () => {
    // 16 Han characters / 1.6 = 10 words.
    expect(proseWordCount({ text: "这是一个关于城市电车扩建的长句子" })).toBe(10);
    // 10 Han + Kana characters with Kana present / 2.0 = 5 words.
    expect(proseWordCount({ text: "電車の延長は良いです" })).toBe(5);
    // 12 Thai code points (vowel and tone marks included) / 5.0 = 2.4, rounded: 2 words.
    expect(proseWordCount({ text: "สวัสดีครับผม" }, { zh: 1.6, ja: 2.0, th: 5.0 })).toBe(2);
    // Fewer than 6 such characters and fewer than 3 words: not prose.
    expect(proseWordCount({ text: "电车" })).toBe(0);
  });

  it("counts Chinese characters over the factor, and neither the commas nor the full stops", () => {
    // 16 Han characters / 1.6 = 10 words; the full-width commas and the full stop are not words.
    expect(proseWordCount({ text: "这是一个关于城市，电车扩建的，长句子。" })).toBe(10);
    // 11 Han characters / 1.6 = 6.875, rounded: 7 words; the four full-width marks add nothing.
    expect(proseWordCount({ text: "电车扩建，城市，长句子，好的。" })).toBe(7);
  });

  it("counts a katakana long-vowel mark as Kana, so a loanword is not padded", () => {
    // 8 Kana characters (the two long-vowel marks of コーヒー and ケーキ included) / 2.0 = 4 words.
    expect(proseWordCount({ text: "コーヒーとケーキ。" })).toBe(4);
  });

  it("uses the factors it is given", () => {
    expect(proseWordCount({ text: "这是一个关于城市电车扩建的长句子" }, { zh: 2, ja: 2, th: 5 })).toBe(8);
  });

  it("refuses a factor that is not a positive finite number, in every position", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => proseWordCount({ text: "a b c" }, { zh: bad, ja: 2, th: 5 })).toThrow("LENGTH_CHARACTERS_PER_WORD_INVALID");
      expect(() => proseWordCount({ text: "a b c" }, { zh: 1.6, ja: bad, th: 5 })).toThrow("LENGTH_CHARACTERS_PER_WORD_INVALID");
      expect(() => proseWordCount({ text: "a b c" }, { zh: 1.6, ja: 2, th: bad })).toThrow("LENGTH_CHARACTERS_PER_WORD_INVALID");
    }
  });

  it("counts a very long array without a stack overflow", () => {
    const numbers = Array.from({ length: 200000 }, (_, index) => index);
    expect(proseWordCount(numbers)).toBe(0);
    const phrases = Array.from({ length: 200000 }, () => "one two three");
    expect(proseWordCount(phrases)).toBe(600000);
  });

  it("is 0 for a value with no prose, and never throws on odd input", () => {
    for (const value of [null, undefined, 3, true, [], {}, ["a b"], { a: { b: { c: "" } } }]) expect(proseWordCount(value)).toBe(0);
  });
});
