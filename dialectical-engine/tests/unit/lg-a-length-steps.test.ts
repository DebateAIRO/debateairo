// tests/unit/lg-a-length-steps.test.ts
import { describe, expect, it } from "vitest";
import {
  FINAL_WRITER_STEPS, LENGTH_GUIDANCE_STEPS, LENGTH_THINKING_ROOM_KEYS, MAP_WORD_TARGET_PARTS, STORY_WORD_TARGET_FIELDS,
  STRUCTURE_REPAIR_CALL_SITE_PREFIX, lengthCallStepOf
} from "@debateai/kernel";
import { previewThinkingStepOf } from "@debateai/providers";

/**
 * Length guidance (spec 2026-10-15, INTERFACE §1.1): one vocabulary of steps. Where the preview thinking table names the
 * same call, the two readers must agree (the parity block at the end); the listed splits are the only exceptions.
 */
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

  it("names the structure-repair key prefix once, in the kernel", () => {
    expect(STRUCTURE_REPAIR_CALL_SITE_PREFIX).toBe("REPAIR:STRUCTURE:");
  });

  const CASES = [
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
  ] as const;

  it.each(CASES)("reads %s as %s", (key, step) => {
    expect(lengthCallStepOf(key)).toBe(step);
  });

  it("reads a story key on another lane as no story step", () => {
    expect(lengthCallStepOf("STORY:STORYTELLER:1", "story")).toBe("story_writer");
    expect(lengthCallStepOf("STORY:STORYTELLER:1", "served")).toBeNull();
    expect(lengthCallStepOf("STORY:CHECKER:1", "served")).toBeNull();
  });

  // Keys the parity block adds: the role keys with a seat suffix on each seat, and the verdict, repair, story and map
  // keys that the suffix must not reach. Both readers see every one of them.
  const EXTRA_PARITY_KEYS = [
    "JUDGE:root:2:seat:runnerUp", "JUDGE:defender:root0:r1:p3:seat:runnerUp", "JUDGE:cross-root:1->2:seat:main",
    "JUDGE:review:8d823b58-05b3-4c47-abe9-dc7b18e061b1:seat:main", "COMPOSER:SYNTHESIZER:INITIAL:1:seat:main",
    "POST_COMPOSE_R9:EVALUATOR:1:seat:runnerUp", "PANEL:JUDGE:critic:root2:r1:p12:seat:main",
    "VERDICT:judge:1:seat:main", "VERDICT:investigate:2:seat:main", "STORY:STORYTELLER:1:seat:main",
    "STORY:CHECKER:1:seat:main", "MAP:angles:seat:main"
  ] as const;
  const PARITY_LANES: readonly (string | undefined)[] = [undefined, "story", "served"];

  /**
   * The known, intended splits between the two readers. Each pins BOTH values, so a change to either table fails here.
   * Each must match at least one probe (checked below), so no split can go stale silently.
   */
  const INTENDED_SPLITS: readonly Readonly<{
    why: string;
    matches: (key: string, lane: string | undefined) => boolean;
    kernel: string | null;
    preview: string | null;
  }>[] = [
    { why: "the map's calls: the kernel names the map step; the preview table runs them at the opening level",
      matches: key => key.startsWith("MAP:"), kernel: "map", preview: "opening" },
    { why: "the comparing judges have no word in the preview table yet",
      matches: key => /^VERDICT:judge:[1-5]$/u.test(key), kernel: "comparing_judge", preview: null },
    { why: "the investigator has no word in the preview table yet",
      matches: key => /^VERDICT:investigate:[1-5]$/u.test(key), kernel: "investigator", preview: null },
    { why: "the structure-repair call: the kernel names its own step; the preview table runs it at slip_fix (LG-A Task 12)",
      matches: key => key.startsWith(STRUCTURE_REPAIR_CALL_SITE_PREFIX), kernel: "structure_repair", preview: "slip_fix" },
    { why: "a storyteller key with no lane: the kernel reads the story lane (the brief's rule); the preview table needs lane \"story\"",
      matches: (key, lane) => lane === undefined && /^STORY:STORYTELLER:[1-8]$/u.test(key), kernel: "story_writer", preview: null },
    { why: "a checker key with no lane: the kernel reads the story lane; the preview table needs lane \"story\"",
      matches: (key, lane) => lane === undefined && /^STORY:CHECKER:[1-8]$/u.test(key), kernel: "story_checker", preview: null }
  ];

  it("agrees with previewThinkingStepOf on every shared key and lane, except the listed splits", () => {
    const keys = [...CASES.map(([key]) => key), ...EXTRA_PARITY_KEYS];
    const matchedSplits = new Set<number>();
    for (const key of keys) {
      for (const lane of PARITY_LANES) {
        const kernel = lengthCallStepOf(key, lane);
        const preview = previewThinkingStepOf(lane === undefined ? { callSiteKey: key } : { callSiteKey: key, lane });
        const index = INTENDED_SPLITS.findIndex(split => split.matches(key, lane));
        if (index === -1) {
          expect({ key, lane, step: kernel }, `${key} on lane ${String(lane)}`).toEqual({ key, lane, step: preview });
        } else {
          matchedSplits.add(index);
          const split = INTENDED_SPLITS[index]!;
          expect({ key, lane, kernel, preview }, split.why)
            .toEqual({ key, lane, kernel: split.kernel, preview: split.preview });
        }
      }
    }
    expect([...matchedSplits].sort((a, b) => a - b)).toEqual(INTENDED_SPLITS.map((_, index) => index));
  });
});
