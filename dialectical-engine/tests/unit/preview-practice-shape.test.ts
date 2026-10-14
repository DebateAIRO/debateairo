// The preview practice's debate-shape support (spec 2026-10-12 §5 "Practice"; plan 2026-10-12-debate-shape-phase2d):
// the four debate-only flags, the start-values file, the comparison's fixed questions, the throwaway register version,
// the map calls in the practice's accounting, the report's shape block and the README's commands.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { debateShapePolicyStartValues, parseDebateShapePolicy } from "@debateai/register";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import { OPENINGS_QUESTIONS } from "../../tools/preview-practice/practice-openings-questions.js";
import { PRACTICE_COMPARISON_QUESTION_IDS, practiceDebateQuestion } from "../../tools/preview-practice/practice-questions.js";
import { practiceShapeOverrideFromArgs } from "../../tools/preview-practice/practice-shape.js";

const START_TEXT = readFileSync(new URL("../../tools/preview-practice/shape-policy-start.json", import.meta.url), "utf8");
const flags = (entries: Readonly<Record<string, string>>): ReadonlyMap<string, string> => new Map(Object.entries(entries));
const readStart = (): string => START_TEXT;

describe("practice debate shape: the flags", () => {
  it("the start-values file is exactly the owners' start values (rulings S5-S8)", () => {
    expect(parseDebateShapePolicy(JSON.parse(START_TEXT))).toEqual(debateShapePolicyStartValues());
    // Written out in full: the map step bounds too (the parser's default, ruling X1), and never `enabled` (start values = on).
    const start = JSON.parse(START_TEXT) as Record<string, unknown>;
    expect(Object.keys(start)).toEqual(["kind", "version", "plans", "answerLength", "mapStepBounds"]);
    expect(start.mapStepBounds).toEqual({ merge: 32768, choose: 32768 });
    expect("enabled" in start).toBe(false);
  });

  it("no shape flag: nothing (today's debate command is unchanged)", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--depth": "1", "--question": "ro" }), readStart)).toBeNull();
  });

  it("reads --shape-policy and the three ask settings", () => {
    const override = practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json", "--depth-mode": "fixed",
      "--scrutiny": "deep", "--answer-length": "short" }), readStart);
    expect(override).toEqual({ policy: debateShapePolicyStartValues(), ask: { depthMode: "fixed", scrutiny: "deep", answerLength: "short" } });
  });

  it("the ask settings alone (for a register that holds its own row): no policy of its own", () => {
    expect(practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "detailed" }), readStart))
      .toEqual({ policy: null, ask: { answerLength: "detailed" } });
  });

  it.each(["formats", "openings", "report"])("refuses every shape flag outside debate mode (%s)", (mode) => {
    for (const flag of ["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"]) {
      expect(() => practiceShapeOverrideFromArgs(mode, flags({ [flag]: "x" }), readStart))
        .toThrow(`PRACTICE_FLAG_VALUE_INVALID: ${flag} (debate mode only)`);
    }
  });

  it("refuses a value outside each setting's list, naming only the flag", () => {
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--depth-mode": "manual" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --depth-mode \(fixed or adaptive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--scrutiny": "max" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --scrutiny \(standard, deep or exhaustive\)$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--answer-length": "long" }), readStart))
      .toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --answer-length \(short, standard or detailed\)$/u);
  });

  it("refuses a policy file that does not pass the register's own check, naming only where in the file", () => {
    const shape = (edit: (value: { version: number; plans: { pro: { answers: number } } }) => void): string => {
      const value = JSON.parse(START_TEXT) as { version: number; plans: { pro: { answers: number } } };
      edit(value);
      return JSON.stringify(value);
    };
    const policyOf = (text: string) => () => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => text);
    expect(policyOf(shape((value) => { value.version = 2; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: version$/u);
    expect(policyOf(shape((value) => { value.plans.pro.answers = 9; }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: plans\.pro\.answers$/u);
    expect(policyOf("{ not json")).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: \$$/u);
    // A row switched off (P2b's rollback member) could never run the new shape.
    expect(policyOf(JSON.stringify({ ...(JSON.parse(START_TEXT) as object), enabled: false }))).toThrow(/^PRACTICE_SHAPE_POLICY_INVALID: enabled$/u);
    expect(() => practiceShapeOverrideFromArgs("debate", flags({ "--shape-policy": "x.json" }), () => { throw new Error("ENOENT"); }))
      .toThrow(/^PRACTICE_SHAPE_POLICY_UNREADABLE$/u);
  });

  it("the command line refuses a mistyped flag and a missing value before anything starts", () => {
    expect(() => parsePracticeArgs(["debate", "--shape-polcy", "x.json"])).toThrow("PRACTICE_FLAG_UNKNOWN");
    expect(() => parsePracticeArgs(["debate", "--shape-policy"])).toThrow("PRACTICE_FLAG_VALUE_MISSING");
    expect(parsePracticeArgs(["debate", "--shape-policy", "x.json", "--depth-mode", "adaptive", "--scrutiny", "standard",
      "--answer-length", "standard"]).flags.size).toBe(4);
  });
});

describe("practice debate questions: the comparison's four fixed questions", () => {
  it("ro and en as before; the four comparison ids word for word from the openings set", () => {
    expect(practiceDebateQuestion("ro").id).toBe("ro");
    expect(practiceDebateQuestion("en").id).toBe("en");
    expect(PRACTICE_COMPARISON_QUESTION_IDS).toEqual(["ro-euro", "ro-strainatate", "en-nuclear", "en-social-media-age"]);
    for (const id of PRACTICE_COMPARISON_QUESTION_IDS) {
      expect(practiceDebateQuestion(id)).toEqual({ id, questionLine: OPENINGS_QUESTIONS.find((question) => question.id === id)!.questionLine });
    }
  });

  it("refuses any other id without repeating it", () => {
    expect(() => practiceDebateQuestion("ro-ciuperci")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(/u);
    expect(() => practiceDebateQuestion("my own question?")).toThrow(/^PRACTICE_FLAG_VALUE_INVALID: --question \(ro, en/u);
    try { practiceDebateQuestion("my own question?"); } catch (error) { expect(String(error)).not.toContain("my own question"); }
  });
});
