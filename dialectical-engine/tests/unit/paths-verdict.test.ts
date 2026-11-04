/**
 * V4 start step, Task 44 (spec 2026-11-03 §4.3 "After Start", the main answer): the label of a path run. No judge picks a
 * winner on a debate with chosen paths; its label comes from the main answer's trust word, which code sets from the
 * evidence (Task 15's `mainAnswerTrustWordOf`). The record has the judges' shape (rung 5, no basis absence, no marks)
 * with one of five path triggers of its own; the judges' verdict keeps its six. No new served-root rule: 0121 is
 * untouched.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { TRUST_WORDS, type TrustWord } from "@debateai/contract";
import {
  ENGINE_VERDICT_TRIGGERS, PATHS_VERDICT_TRIGGERS, verdictDerivationOfPaths,
  type EngineVerdictTrigger, type JudgesVerdict, type VerdictLabelDerivation
} from "@debateai/serve";

const record = (label: VerdictLabelDerivation["label"], trigger: VerdictLabelDerivation["trigger"]) =>
  ({ label, rung: 5, trigger, basisAbsence: [], marks: [] });

describe("the label of a path run", () => {
  it("comes from the main answer's trust word", () => {
    expect(verdictDerivationOfPaths("SURE")).toEqual(record("SUPPORTED", "PATHS_MAIN_SURE"));
    expect(verdictDerivationOfPaths("SURE_FOR_CASE")).toEqual(record("SUPPORTED", "PATHS_MAIN_SURE_FOR_CASE"));
    expect(verdictDerivationOfPaths("STILL_ARGUED")).toEqual(record("CONTESTED", "PATHS_MAIN_STILL_ARGUED"));
    expect(verdictDerivationOfPaths("DIDNT_HOLD")).toEqual(record("UNSUPPORTED", "PATHS_MAIN_DIDNT_HOLD"));
  });

  it("is a close call when no trust word could be set", () => {
    expect(verdictDerivationOfPaths(null)).toEqual(record("CONTESTED", "PATHS_MAIN_UNSETTLED"));
  });

  it("reads every trust word, never SPLIT, and is frozen", () => {
    const words: readonly (TrustWord | null)[] = [...TRUST_WORDS, null];
    const derivations = words.map(verdictDerivationOfPaths);
    expect(derivations.map((derivation) => derivation.trigger)).toEqual([...PATHS_VERDICT_TRIGGERS]);
    expect(derivations.map((derivation) => derivation.label)).not.toContain("SPLIT");
    for (const derivation of derivations) {
      expect(Object.isFrozen(derivation)).toBe(true);
      expect(Object.isFrozen(derivation.basisAbsence)).toBe(true);
      expect(Object.isFrozen(derivation.marks)).toBe(true);
    }
  });

  it("has five path triggers of its own; the judges keep their six", () => {
    expect(PATHS_VERDICT_TRIGGERS).toEqual(["PATHS_MAIN_SURE", "PATHS_MAIN_SURE_FOR_CASE", "PATHS_MAIN_STILL_ARGUED",
      "PATHS_MAIN_DIDNT_HOLD", "PATHS_MAIN_UNSETTLED"]);
    expect(Object.isFrozen(PATHS_VERDICT_TRIGGERS)).toBe(true);
    expect(ENGINE_VERDICT_TRIGGERS).toHaveLength(6);
    expect(PATHS_VERDICT_TRIGGERS.filter((trigger) => (ENGINE_VERDICT_TRIGGERS as readonly string[]).includes(trigger))).toEqual([]);
    expectTypeOf<JudgesVerdict["trigger"]>().toEqualTypeOf<typeof ENGINE_VERDICT_TRIGGERS[number]>();
    expectTypeOf<EngineVerdictTrigger>()
      .toEqualTypeOf<typeof ENGINE_VERDICT_TRIGGERS[number] | typeof PATHS_VERDICT_TRIGGERS[number]>();
  });
});
