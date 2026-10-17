import { describe, expect, it } from "vitest";
import { PREVIEW_MODEL_ROWS } from "@debateai/providers";
import {
  answerJobTokenCeilings, computeStructuralCeilingBasis, debateShapePolicyStartValues, lengthGuidanceAllowanceTokens,
  lengthGuidancePolicyStartValues, lengthGuidedFirstCallCeiling, resolveDebateShape, resolveLengthGuidance
} from "@debateai/register";
import { admittedLengthOf, answerTokenCeilingsForBasis } from "../../apps/api/src/ask-model-picker.js";
import {
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, previewCallNanoUsd, previewOutputTokensForBasis, realisticWorstCasePricer
} from "../../apps/api/src/preview-budget-estimate.js";

const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const POLICY = lengthGuidancePolicyStartValues();
const LENGTHS = ["short", "standard", "detailed"] as const;
type Length = (typeof LENGTHS)[number];
const guidanceAt = (answerLength: Length) => resolveLengthGuidance({ policy: POLICY, plan: "pro", answerLength });
const basisAt = (answerLength: Length) => computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2,
  length: guidanceAt(answerLength) });
const TODAY = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });
const OUTPUT = Object.freeze({ debate: 8192, storyteller: 32768, storytellerRetry: 65536, storyChecker: 16384 });
const SEALED = Object.freeze({ POSITION: 2048, SUPPORT_ATTACK: 2048, CROSS_EXCHANGE: 2048, JUDGE: 2048, REVIEWER: 2048,
  ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048 });
/** The steps the preview prices as DEBATE calls (Step 5's list). */
const DEBATE_STEPS = ["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer"] as const;

describe("the preview estimate prices the guided allowance (spec §3.10)", () => {
  it("a receipt without the member: the same object, today's numbers", () => {
    expect(previewOutputTokensForBasis(OUTPUT, TODAY)).toBe(OUTPUT);
    expect(admittedLengthOf(TODAY)).toBeNull();
  });

  // Pre-flight PF-C2.2: since LG-B the writer and checker are final writers priced at the row's own maximum; only the
  // DEBATE output is raised, and the writer member is left alone (no pricer reads it).
  it("with the member: every debate call at its largest guided allowance, never below today's", () => {
    const detailed = previewOutputTokensForBasis(OUTPUT, basisAt("detailed"));
    expect(detailed.debate).toBe(10704);
    expect(detailed.answerWriter).toBeUndefined();
    const standard = previewOutputTokensForBasis(OUTPUT, basisAt("standard"));
    expect(standard.debate).toBe(9144);
    expect(standard.storyChecker).toBe(OUTPUT.storyChecker);
    // Short: every guided debate allowance (at most 7,944) is below today's 8,192, so nothing moves.
    expect(previewOutputTokensForBasis(OUTPUT, basisAt("short"))).toEqual(OUTPUT);
  });

  // Pre-flight PF-C2.2 (Review Focus 3): the guarantee itself, at the pricer, for every preview row and answer length.
  it("never under-counts: each call is priced at least at what the runner may send it", () => {
    for (const answerLength of LENGTHS) {
      const guidance = guidanceAt(answerLength);
      const pricer = realisticWorstCasePricer(previewOutputTokensForBasis(OUTPUT, basisAt(answerLength)));
      for (const row of PREVIEW_MODEL_ROWS) {
        const at = (tokens: number, tier: "STANDARD" | "FINAL_WRITER"): bigint =>
          previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, tokens, tier);
        const label = `${row.model} ${answerLength}`;
        expect(pricer(row, "ANSWER_WRITER") >= at(lengthGuidanceAllowanceTokens(guidance, "answer_writer", OUTPUT.debate), "FINAL_WRITER"),
          `${label} answer_writer`).toBe(true);
        expect(pricer(row, "ANSWER_CHECKER") >= at(lengthGuidanceAllowanceTokens(guidance, "answer_checker", OUTPUT.debate), "FINAL_WRITER"),
          `${label} answer_checker`).toBe(true);
        for (const step of DEBATE_STEPS) {
          expect(pricer(row, "DEBATE") >= at(lengthGuidanceAllowanceTokens(guidance, step, OUTPUT.debate), "STANDARD"),
            `${label} ${step}`).toBe(true);
        }
      }
    }
    // Detailed: a DEBATE call is priced at exactly 10,704 output tokens (clamped by the row's own standard bound).
    const detailed = realisticWorstCasePricer(previewOutputTokensForBasis(OUTPUT, basisAt("detailed")));
    for (const row of PREVIEW_MODEL_ROWS) {
      expect(detailed(row, "DEBATE"), row.model).toBe(previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, 10704));
    }
  });
});

describe("the hosted picker and the boot checks (spec §3.10)", () => {
  it("per-run role ceilings rise to the guided allowance; without the member, the same object", () => {
    expect(answerTokenCeilingsForBasis(SEALED, TODAY)).toBe(SEALED);
    // Pre-flight PF-C2.1: the writer at Standard 350 words (OVERVIEW C-1).
    expect(answerTokenCeilingsForBasis(SEALED, basisAt("standard"))).toEqual({ POSITION: 7696, SUPPORT_ATTACK: 9144,
      CROSS_EXCHANGE: 9144, JUDGE: 6496, REVIEWER: 3488, ANSWER_WRITER: 20584, ANSWER_CHECKER: 3848 });
  });

  // Task 6 review 3: the writer's row at the other two answer lengths (Standard is pinned above).
  it("the writer's per-run ceiling at Short and Detailed: 18,784 and 28,384, each the runner's guided writer bound", () => {
    expect(LENGTHS.map((answerLength) => answerTokenCeilingsForBasis(SEALED, basisAt(answerLength)).ANSWER_WRITER))
      .toEqual([18784, 20584, 28384]);
    for (const answerLength of LENGTHS) {
      expect(answerTokenCeilingsForBasis(SEALED, basisAt(answerLength)).ANSWER_WRITER)
        .toBe(lengthGuidanceAllowanceTokens(guidanceAt(answerLength), "answer_writer", SEALED.ANSWER_WRITER));
    }
  });

  it("the Free answer jobs and the first call are checked at the largest any plan can ask", () => {
    const sealed = { writer: 2048, checker: 2048 };
    expect(answerJobTokenCeilings(sealed, null, null)).toEqual({ ANSWER_WRITER: 2048, ANSWER_CHECKER: 2048 });
    expect(answerJobTokenCeilings(sealed, debateShapePolicyStartValues(), null)).toEqual({ ANSWER_WRITER: 16384, ANSWER_CHECKER: 2048 });
    // Pre-flight PF-C2.1: the largest writer allowance is Detailed 1,000 words, 28,384 (under the 32,768 cap).
    expect(answerJobTokenCeilings(sealed, null, POLICY)).toEqual({ ANSWER_WRITER: 28384, ANSWER_CHECKER: 3848 });
    expect(answerJobTokenCeilings(sealed, debateShapePolicyStartValues(), POLICY)).toEqual({ ANSWER_WRITER: 28384, ANSWER_CHECKER: 3848 });
    expect(lengthGuidedFirstCallCeiling(2048, null)).toBe(2048);
    expect(lengthGuidedFirstCallCeiling(2048, POLICY)).toBe(9496);
  });
});

/**
 * LG-C Task 14 (spec 2026-10-15 §3.3, §3.10): a map runs only with the shape, and with the length member each map call asks
 * the map's thinking room + its reply's runaway answer room (`guidedMapBound`). The largest reply is the gap's: 8 x (35 + 35)
 * + 3 x 35 = 665 words, so a map call may ask 8,192 + 4 x 665 x 3 = 16,172 tokens. The shaped basis is built as
 * tests/unit/debate-shape-preview-estimate.test.ts builds its own, with `length:` added.
 */
describe("a shaped run with the length member prices the map's allowance (Task 14)", () => {
  const SHAPE = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "pro", makers: 2,
    settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
  const shaped = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE });
  const shapedLengthed = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, shape: SHAPE, length: guidanceAt("standard") });

  it("the preview estimate prices every debate call at least at a map call's allowance, 16,172", () => {
    expect(previewOutputTokensForBasis(OUTPUT, shapedLengthed).debate).toBe(16172);
    // Without the shape there is no map: the debate steps' own largest allowance, as before.
    expect(previewOutputTokensForBasis(OUTPUT, basisAt("standard")).debate).toBe(9144);
    // Without the length member: today's shaped pricing (the debate output untouched).
    expect(previewOutputTokensForBasis(OUTPUT, shaped).debate).toBe(OUTPUT.debate);
  });

  it("the hosted picker seats debaters (POSITION) at least at a map call's allowance", () => {
    const ceilings = answerTokenCeilingsForBasis(SEALED, shapedLengthed);
    expect(ceilings.POSITION).toBeGreaterThanOrEqual(16172);
    expect(ceilings.POSITION).toBe(Math.max(16172, SHAPE.mapMergeBound, SHAPE.mapChooseBound,
      lengthGuidanceAllowanceTokens(guidanceAt("standard"), "opening", SEALED.POSITION)));
    // Only POSITION carries the map; every other role is as without the shape (the writer keeps its shape bound).
    expect(ceilings.SUPPORT_ATTACK).toBe(answerTokenCeilingsForBasis(SEALED, basisAt("standard")).SUPPORT_ATTACK);
  });

  // Task 6 review 3: shape and length together, every role: the writer is guided from the shape's own writer bound.
  it("shape and length together: the writer is guided from the shape's writer bound; the debate roles as without the shape", () => {
    const ceilings = answerTokenCeilingsForBasis(SEALED, shapedLengthed);
    const unshaped = answerTokenCeilingsForBasis(SEALED, basisAt("standard"));
    expect(ceilings.ANSWER_WRITER).toBe(lengthGuidanceAllowanceTokens(guidanceAt("standard"), "answer_writer",
      Math.max(SEALED.ANSWER_WRITER, SHAPE.writerBound)));
    expect(ceilings.ANSWER_WRITER).toBeGreaterThanOrEqual(Math.max(SHAPE.writerBound, unshaped.ANSWER_WRITER));
    for (const role of ["SUPPORT_ATTACK", "CROSS_EXCHANGE", "JUDGE", "REVIEWER", "ANSWER_CHECKER"] as const) {
      expect(ceilings[role], role).toBe(unshaped[role]);
    }
    // Without the length member: the shape's raise only.
    expect(answerTokenCeilingsForBasis(SEALED, shaped).ANSWER_WRITER).toBe(Math.max(SEALED.ANSWER_WRITER, SHAPE.writerBound));
  });
});
