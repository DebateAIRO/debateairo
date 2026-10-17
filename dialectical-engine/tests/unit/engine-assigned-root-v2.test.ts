// tests/unit/engine-assigned-root-v2.test.ts
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START, LENGTH_SENTENCE_WRITING, type LengthGuide } from "@debateai/kernel";
import {
  JUDGE_ANSWER_FORM, JUDGE_ASSIGNED_ROOT_V2_DIRECTIVE, JUDGE_ASSIGNED_ROOT_V2_MATERIAL_FIELDS, JUDGE_CLAIM_TYPE_INSTRUCTIONS, JUDGE_INSTRUCTIONS,
  JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT, framedJudgePromptForTest, judgeAssignedRootV2PromptContract, rootPositionRequestBytesBound,
  type JudgeLeg
} from "@debateai/judgement";
import { readPromptFrame } from "@debateai/providers";

const GUIDE: LengthGuide = { words: 300, languageCode: "en", charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord };
const Q = "Should a mid-sized city make its central bus lines free to ride?";
const LONG = `Yes, where the buses already run full at peak hours, ${"and where the city can fund it ".repeat(48)}`.trim();
const leg = (statement: string): JudgeLeg => ({ kind: "assigned-root", assignedAnswer: statement,
  mapPoints: JSON.stringify({ for: [{ text: "Fares fund night buses.", rests_on: "question" }], against: [] }),
  engine: { pointsRaised: JSON.stringify([{ text: "Costs rise.", rests_on: "assumption" }]), assumptions: JSON.stringify(["The city can pay."]) } });

/** P2.6 (spec 2026-10-15 §5.2 item 6, §5.6): the position writer defends exactly its assigned words and writes the case. */
describe("engine 2: the fixed-words position contract", () => {
  it("is the owner's directive, the judge's shared rules, the claim branch and the length sentence; never in the judge seal", () => {
    for (const claim of ["unknown", "resolved"] as const) {
      const contract = judgeAssignedRootV2PromptContract(claim);
      expect(contract.contractId).toBe(`judge.assigned-root.${claim}.v2`);
      expect(contract.instruction).toBe([JUDGE_ASSIGNED_ROOT_V2_DIRECTIVE, JUDGE_INSTRUCTIONS, JUDGE_CLAIM_TYPE_INSTRUCTIONS[claim], LENGTH_SENTENCE_WRITING].join(" "));
      expect(contract.answerForm).toBe(JUDGE_ANSWER_FORM);
      expect(JUDGEMENT_PROMPT_CONTRACT_FINGERPRINT_TEXT).not.toContain(contract.contractId);
      // P2.7 (Ruling PF-R34.10): the v2 instruction names no MATERIAL field; LG-C's length sentence names its own `length`
      // field by design, and the shared sealed judge rules keep naming the answer form's codes.
      for (const name of JUDGE_ASSIGNED_ROOT_V2_MATERIAL_FIELDS.filter((entry) => entry !== "length")) expect(contract.instruction).not.toContain(name);
    }
    expect(JUDGE_ASSIGNED_ROOT_V2_DIRECTIVE).not.toMatch(/[A-Za-z]+_[A-Za-z]+/u);
  });

  it("frames the chosen words whole, then the labelled points, the points raised, the assumptions and the length", () => {
    const frame = readPromptFrame(framedJudgePromptForTest(leg(LONG), Q, "English", "resolved", null, GUIDE).packet);
    expect(frame.contractId).toBe("judge.assigned-root.resolved.v2");
    expect(frame.fields.map((field) => field.name)).toEqual(["question_line", "assigned_answer", "map_points", "points_raised", "assumptions", "length"]);
    expect(LONG.length).toBeGreaterThan(480);
    expect(frame.fields[1]!.content).toBe(LONG);
  });

  it("refuses an unlengthed v2 position; today's assigned root (no engine) keeps its contracts", () => {
    expect(() => framedJudgePromptForTest(leg("Yes."), Q, "English", "resolved", null, null))
      .toThrowError(expect.objectContaining({ code: "JUDGE_ASSIGNED_ROOT_V2_UNLENGTHED" }));
    const today: JudgeLeg = { kind: "assigned-root", assignedAnswer: "Yes.", mapPoints: "{\"for\":[],\"against\":[]}" };
    expect(readPromptFrame(framedJudgePromptForTest(today, Q, "English", "resolved").packet).contractId).toBe("judge.assigned-root.resolved.v1");
    expect(readPromptFrame(framedJudgePromptForTest(today, Q, "English", "resolved", null, GUIDE).packet).contractId).toBe("judge.assigned-root.resolved.length.v1");
  });

  it("the root bound covers a v2 call at the runaway limit, at every split of the shared points room (Review Focus 5)", () => {
    const points = 15 * (2000 + 64) + 64;
    // Ruling PF-R35.4 (a): the points raised share the points' room (Task 14 passes pointsRaised = points).
    const sizes = { answer: 4000, points, pointsRaised: points, assumptions: 3 * (2000 + 8) + 8 };
    const base = { questionLine: Q, argumentLanguageName: "English", completionTokenCeiling: 8192, length: GUIDE };
    const bound = rootPositionRequestBytesBound({ ...base, assignedMaterialChars: sizes });
    const withoutEngine = rootPositionRequestBytesBound({ ...base, assignedMaterialChars: { answer: sizes.answer, points } });
    expect(bound).toBeGreaterThan(withoutEngine);
    const bodyOf = (engineLeg: JudgeLeg): number => Buffer.byteLength(JSON.stringify({ model: "", max_tokens: 8192,
      messages: framedJudgePromptForTest(engineLeg, Q, "English", "unknown", null, GUIDE).packet.messages }), "utf8");
    expect(bound).toBeGreaterThanOrEqual(bodyOf(leg("x".repeat(2000))));
    // The worst splits: the sided points and the points raised together hold at most pointsRaised + 2 characters of the
    // character that grows most (U+0001); all of it on one side, half and half, all on the other.
    const total = sizes.pointsRaised + 2;
    for (const sided of [total - 2, Math.floor(total / 2), 2]) {
      expect(bound, String(sided)).toBeGreaterThanOrEqual(bodyOf({ kind: "assigned-root", assignedAnswer: "\u0001".repeat(sizes.answer),
        mapPoints: "\u0001".repeat(sided), engine: { pointsRaised: "\u0001".repeat(total - sided), assumptions: "\u0001".repeat(sizes.assumptions) } }));
    }
    // Pre-flight PF-R34.8: one of the two sizes alone would measure no v2 leg; it is refused, never under-counted.
    expect(() => rootPositionRequestBytesBound({ ...base, assignedMaterialChars: { answer: 4000, points: 10, pointsRaised: 10 } }))
      .toThrowError("ROOT_POSITION_BOUND_INPUT_INVALID");
  });
});
