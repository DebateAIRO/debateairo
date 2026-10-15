// tests/unit/lg-a-length-steps.test.ts
import { describe, expect, it } from "vitest";
import {
  FINAL_WRITER_STEPS, LENGTH_GUIDANCE_STEPS, LENGTH_THINKING_ROOM_KEYS, MAP_WORD_TARGET_PARTS, STORY_WORD_TARGET_FIELDS,
  lengthCallStepOf
} from "@debateai/kernel";

/** Length guidance (spec 2026-10-15, INTERFACE §1.1): one vocabulary of steps, in the preview thinking table's words. */
describe("length guidance: the step words", () => {
  it("names the steps, the thinking-room keys, the final writers and the word-target parts, frozen", () => {
    // engine amendment E-INT-4: the two engine-redesign steps follow "story_checker".
    expect(LENGTH_GUIDANCE_STEPS).toEqual(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer",
      "answer_writer", "answer_checker", "story_checker", "comparing_judge", "investigator"]);
    expect(LENGTH_THINKING_ROOM_KEYS).toEqual([...LENGTH_GUIDANCE_STEPS, "story_writer", "map"]);
    expect(FINAL_WRITER_STEPS).toEqual(["answer_writer", "answer_checker", "story_writer", "story_checker"]);
    expect(STORY_WORD_TARGET_FIELDS).toEqual(["headline", "summary", "confidence", "positionLine", "change", "whyReason"]);
    expect(MAP_WORD_TARGET_PARTS).toEqual(["claim", "whyItMatters", "candidateAnswer", "angleLabel", "angleFocus",
      "framingChallenge", "chosenAnswer", "checkReason"]);
    for (const list of [LENGTH_GUIDANCE_STEPS, LENGTH_THINKING_ROOM_KEYS, FINAL_WRITER_STEPS, STORY_WORD_TARGET_FIELDS, MAP_WORD_TARGET_PARTS]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it.each([
    ["JUDGE", "opening"], ["JUDGE:root:secondary", "opening"], ["JUDGE:root:2:seat:main", "opening"],
    ["JUDGE:defender:root0:r1:p3", "pros_cons"], ["JUDGE:critic:root1:r1:p8", "pros_cons"],
    ["JUDGE:cross-root:0->1", "cross_exchange"], ["PANEL:JUDGE:critic:root2:r1:p12:preview:fixture-a", "judge_panel"],
    ["JUDGE:review:8d823b58-05b3-4c47-abe9-dc7b18e061b1", "reviewer"],
    ["COMPOSER:SYNTHESIZER:INITIAL:1", "answer_writer"], ["POST_COMPOSE_R9:EVALUATOR:1", "answer_checker"],
    ["STORY:STORYTELLER:1", "story_writer"], ["STORY:CHECKER:2", "story_checker"],
    ["MAP:angles", "map"], ["MAP:list:3", "map"], ["MAP:list:3:2", "map"], ["MAP:choose", "map"], ["MAP:check", "map"],
    ["VERDICT:judge:1", "comparing_judge"], ["VERDICT:investigate:2", "investigator"], ["VERDICT:judge:9", null],
    ["REPAIR:STRUCTURE:JUDGE:cross-root:0->1", "structure_repair"], ["REPAIR:STRUCTURE:STORY:STORYTELLER:1", "structure_repair"],
    ["evaluator.blind", null], ["STOPPING", null], ["STORY:STORYTELLER:9", null]
  ] as const)("reads %s as %s", (key, step) => {
    expect(lengthCallStepOf(key)).toBe(step);
  });

  it("reads a story key on another lane as no story step (as previewThinkingStepOf does)", () => {
    expect(lengthCallStepOf("STORY:STORYTELLER:1", "story")).toBe("story_writer");
    expect(lengthCallStepOf("STORY:STORYTELLER:1", "served")).toBeNull();
    expect(lengthCallStepOf("STORY:CHECKER:1", "served")).toBeNull();
  });
});
