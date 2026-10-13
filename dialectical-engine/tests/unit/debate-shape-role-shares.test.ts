import { describe, expect, it } from "vitest";
import { computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape } from "@debateai/register";
import {
  ASK_MODEL_ASSIGNMENT_INVALID,
  answerTokenCeilingsForBasis,
  expectedCallsByRoleFromBasis
} from "../../apps/api/src/ask-model-picker.js";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const FREE3 = resolveDebateShape({ policy: POLICY, plan: "free", makers: 3,
  settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "detailed" } })!;
const shaped = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, shape: FREE3 });
const legacy = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });

describe("per-role call shares under the debate shape (spec 2026-10-12 §3.6)", () => {
  it("map calls go to the debaters, P cross-replies, the rest are points; the split sums to every site", () => {
    const byRole = expectedCallsByRoleFromBasis(shaped);
    expect(byRole).toEqual({ POSITION: 13, SUPPORT_ATTACK: 15, CROSS_EXCHANGE: 3, JUDGE: 42, REVIEWER: 21, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
    expect(Object.values(byRole).reduce((sum, calls) => sum + calls, 0)).toBe(31 + 42 + 21 + 6);
  });
  it("today's basis splits exactly as before", () => {
    expect(expectedCallsByRoleFromBasis(legacy))
      .toEqual({ POSITION: 3, SUPPORT_ATTACK: 18, CROSS_EXCHANGE: 6, JUDGE: 54, REVIEWER: 27, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
  });
  it("a malformed shape member is an engine fault, never read as today's", () => {
    expect(() => expectedCallsByRoleFromBasis({ ...shaped, shape: { answers: "four" } })).toThrow("malformed debate shape");
    expect(() => expectedCallsByRoleFromBasis({ ...shaped, shape: { answers: "four" } }))
      .toThrowError(expect.objectContaining({ name: "TypedDomainError", code: ASK_MODEL_ASSIGNMENT_INVALID }));
  });
  it("a shape-formula receipt whose shape member is deleted refuses; it is never priced as today's", () => {
    const withoutShape: Record<string, unknown> = { ...shaped };
    delete withoutShape.shape;
    const ceilings = Object.freeze({ POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
      ANSWER_WRITER: 4096, ANSWER_CHECKER: 2048 });
    expect(() => expectedCallsByRoleFromBasis(withoutShape))
      .toThrowError(expect.objectContaining({ name: "TypedDomainError", code: ASK_MODEL_ASSIGNMENT_INVALID }));
    expect(() => answerTokenCeilingsForBasis(ceilings, withoutShape))
      .toThrowError(expect.objectContaining({ name: "TypedDomainError", code: ASK_MODEL_ASSIGNMENT_INVALID }));
  });
  it("a shaped receipt the strict reader refuses keeps the reader's reason in the message", () => {
    const wrongReserve = { ...shaped, serve_reserve_attempts: shaped.serve_reserve_attempts + 1 };
    expect(() => expectedCallsByRoleFromBasis(wrongReserve))
      .toThrowError(expect.objectContaining({
        name: "TypedDomainError",
        code: ASK_MODEL_ASSIGNMENT_INVALID,
        message: expect.stringContaining("serve reserve")
      }));
  });
  it("a plus ask with close-call extras and deep scrutiny: the extras are judge calls, the scrutiny exchanges are support-attack calls, every site counted", () => {
    // Five makers: the plus plan's graders take 3, leaving one close-call extra (min(2, 5 - 1 - 3)). Four makers leave none.
    const PLUS5 = resolveDebateShape({ policy: POLICY, plan: "plus", makers: 5,
      settings: { depthMode: "adaptive", scrutiny: "deep", answerLength: "standard" } })!;
    const plus = computeStructuralCeilingBasis({ ...TERMS, panelSize: 5, depth: 2, shape: PLUS5 });
    const byRole = expectedCallsByRoleFromBasis(plus);
    expect(byRole).toEqual({ POSITION: 16, SUPPORT_ATTACK: 48, CROSS_EXCHANGE: 3, JUDGE: 216, REVIEWER: 54, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
    // author 67 (13 map + 54 nodes) + panel 216 + reviewer 54 + serve 6
    expect(Object.values(byRole).reduce((sum, calls) => sum + calls, 0)).toBe(67 + 216 + 54 + 6);
  });
  it("the answer writer's bound is the larger of the sealed one and the run's answer length", () => {
    const ceilings = Object.freeze({ POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
      ANSWER_WRITER: 4096, ANSWER_CHECKER: 2048 });
    expect(answerTokenCeilingsForBasis(ceilings, legacy)).toBe(ceilings);
    expect(answerTokenCeilingsForBasis(ceilings, shaped)).toEqual({ ...ceilings, ANSWER_WRITER: 16384 });
    expect(answerTokenCeilingsForBasis({ ...ceilings, ANSWER_WRITER: 20_000 }, shaped).ANSWER_WRITER).toBe(20_000);
  });
});
