// tests/unit/r2-engine-vocabulary.test.ts
import { describe, expect, it } from "vitest";
import {
  ENGINE2_REDUCER_VERSION, ENGINE_ANSWER_LETTERS, ENGINE_CALL_SITE_INDEX, ENGINE_QUESTION_KINDS, LENGTH_STEP_THINKING_STEP,
  MAP_CHECK_CALL_SITE_KEY, comparingJudgeCallSiteKey, debateRoleFromCallSiteKey, lengthCallStepOf, pointInvestigationCallSiteKey
} from "@debateai/kernel";
import { previewCallTierOf, previewThinkingStepOf } from "@debateai/providers";
import { ENGINE_VERSION_LIMITS } from "@debateai/register";
import { loadStoryPack, resolveStoryPackDir } from "@debateai/story";
import { callPriorityOf } from "../../apps/runner/src/call-scheduler.js";

/** Engine redesign R2 (spec 2026-10-15 §4.9; INTERFACE §4.3, §6.1, §9.1): engine 2's shared words and call keys. */
describe("engine 2's vocabulary", () => {
  it("names the reducer version, the question kinds, the answer letters, the index range and the check key, frozen", () => {
    expect(ENGINE2_REDUCER_VERSION).toBe("engine2:honest-median:v1");
    expect(ENGINE_QUESTION_KINDS).toEqual(["general", "factual", "health", "legal", "money-decision", "personal-choice"]);
    expect(ENGINE_ANSWER_LETTERS).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(ENGINE_CALL_SITE_INDEX).toEqual({ min: 1, max: 5 });
    expect(MAP_CHECK_CALL_SITE_KEY).toBe("MAP:check");
    for (const frozen of [ENGINE_QUESTION_KINDS, ENGINE_ANSWER_LETTERS, ENGINE_CALL_SITE_INDEX]) expect(Object.isFrozen(frozen)).toBe(true);
  });

  it("has exactly the story pack's shapes as question kinds, the pack's default among them", () => {
    const pack = loadStoryPack(resolveStoryPackDir({ env: {}, moduleUrl: import.meta.url }));
    expect(new Set(pack.shapes.map((shape) => shape.id))).toEqual(new Set(ENGINE_QUESTION_KINDS));
    expect(ENGINE_QUESTION_KINDS).toContain(pack.defaultShape);
  });

  it("mints the judges' and the investigations' keys for 1 to 5 only", () => {
    expect([1, 2, 3, 4, 5].map(comparingJudgeCallSiteKey))
      .toEqual(["VERDICT:judge:1", "VERDICT:judge:2", "VERDICT:judge:3", "VERDICT:judge:4", "VERDICT:judge:5"]);
    expect(pointInvestigationCallSiteKey(2)).toBe("VERDICT:investigate:2");
    // Pre-flight PF-R2a1.17: the kernel cannot import the register, so tie the key range to R1d's row bounds here.
    expect(ENGINE_CALL_SITE_INDEX.max).toBe(ENGINE_VERSION_LIMITS.judgesMax);
    expect(ENGINE_CALL_SITE_INDEX.max).toBe(ENGINE_VERSION_LIMITS.investigationsMax);
    for (const bad of [0, 6, 1.5, Number.NaN, -1]) {
      expect(() => comparingJudgeCallSiteKey(bad)).toThrow(`ENGINE_CALL_SITE_INDEX_INVALID:${String(bad)}`);
      expect(() => pointInvestigationCallSiteKey(bad)).toThrow(`ENGINE_CALL_SITE_INDEX_INVALID:${String(bad)}`);
    }
  });

  it.each([
    ["VERDICT:judge:1", "JUDGE", "comparing_judge", "judge_panel"],
    ["VERDICT:judge:5", "JUDGE", "comparing_judge", "judge_panel"],
    ["VERDICT:investigate:1", "REVIEWER", "investigator", "reviewer"],
    ["VERDICT:investigate:2", "REVIEWER", "investigator", "reviewer"],
    // On an assigned run every key carries `:seat:<main|runnerUp>` (apps/runner/src/run-seats.ts:32): same step.
    ["VERDICT:judge:3:seat:main", "JUDGE", "comparing_judge", "judge_panel"],
    ["VERDICT:investigate:1:seat:runnerUp", "REVIEWER", "investigator", "reviewer"],
    ["MAP:check", null, "map", "opening"],
    ["VERDICT:judge:9", null, null, null],
    ["VERDICT:investigate:0", null, null, null],
    ["VERDICT:judge:", null, null, null]
  ] as const)("reads %s as role %s, length step %s, thinking step %s", (key, role, step, thinking) => {
    expect(debateRoleFromCallSiteKey(key)).toBe(role);
    expect(lengthCallStepOf(key)).toBe(step);
    expect(previewThinkingStepOf({ callSiteKey: key, lane: "served" })).toBe(thinking);
  });

  it("agrees with the length row's own map from its two new steps to the thinking table", () => {
    expect(previewThinkingStepOf({ callSiteKey: comparingJudgeCallSiteKey(1), lane: "served" })).toBe(LENGTH_STEP_THINKING_STEP.comparing_judge);
    expect(previewThinkingStepOf({ callSiteKey: pointInvestigationCallSiteKey(1), lane: "served" })).toBe(LENGTH_STEP_THINKING_STEP.investigator);
  });

  it("runs the new calls as standard-tier calls with the scheduler's OTHER priority", () => {
    for (const callSiteKey of ["VERDICT:judge:1", "VERDICT:investigate:1", "MAP:check"]) {
      expect(previewCallTierOf({ callSiteKey, lane: "served", role: "JUDGE" })).toBe("STANDARD");
    }
    expect(callPriorityOf("VERDICT:judge:1")).toBe("OTHER");
    expect(callPriorityOf("VERDICT:investigate:1")).toBe("OTHER");
  });
});
