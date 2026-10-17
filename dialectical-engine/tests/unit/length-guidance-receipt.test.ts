import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_STEPS, LENGTH_THINKING_ROOM_KEYS } from "@debateai/kernel";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import {
  computeStructuralCeilingBasis, lengthGuidanceOfReceipt, lengthGuidancePolicyStartValues, lengthGuidanceReceipt,
  lengthGuidanceReceiptSchema, resolveLengthGuidance, type LengthGuidance
} from "@debateai/register";

const TERMS = Object.freeze({ judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 2,
  finalRetryAttempts: 1, branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5 });
const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "pro", answerLength: "detailed" });

describe("the receipt member envelope_basis.length (INTERFACE §5.5)", () => {
  it("is snake_case, version 1, and reads back to the same numbers", () => {
    const receipt = lengthGuidanceReceipt(GUIDANCE);
    expect(Object.keys(receipt)).toEqual(["version", "plan", "answer_length", "steps", "story", "map", "thinking_room",
      "runaway_multiplier", "tokens_per_word", "story_long_reference_words", "characters_per_word", "answer_writer_sees_judge_reasons"]);
    expect(receipt.story).toEqual({ headline: 15, summary: 120, confidence: 30, position_line: 35, change: 60, why_reason: 100 });
    expect(receipt.map.why_it_matters).toBe(35);
    // Engine keys (pre-flight PF-C1.1) and the storyteller's room (owner Q-C2, pre-flight PF-C1.2).
    expect(receipt.map.check_reason).toBe(40);
    expect([receipt.steps.comparing_judge, receipt.steps.investigator]).toEqual([80, 60]);
    expect([receipt.thinking_room.comparing_judge, receipt.thinking_room.investigator, receipt.thinking_room.story_writer])
      .toEqual([4096, 2048, 65536]);
    expect(Object.keys(receipt.steps)).toEqual([...LENGTH_GUIDANCE_STEPS]);
    expect(Object.keys(receipt.thinking_room)).toEqual([...LENGTH_THINKING_ROOM_KEYS]);
    expect(lengthGuidanceReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(lengthGuidanceOfReceipt(receipt)).toEqual(GUIDANCE);
  });

  it("is never minted malformed", () => {
    const broken = { ...GUIDANCE, tokensPerWord: 0.5 } as LengthGuidance;
    expect(() => lengthGuidanceReceipt(broken)).toThrowError(expect.objectContaining({ code: "STRUCTURAL_CEILING_LENGTH_INVALID" }));
  });

  it("row absent: no length key on any receipt, and today's last key stays last", () => {
    for (const panelSize of [1, 2, 3, 4]) {
      for (const depth of [1, 2, 3]) {
        const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize, depth });
        expect(Object.hasOwn(basis, "length"), `${String(panelSize)}/${String(depth)}`).toBe(false);
        expect(Object.keys(basis).at(-1)).toBe("bounds_source_ref");
        expect(Object.hasOwn(parseCostEnvelopeBasis(basis), "length")).toBe(false);
      }
    }
  });

  it("row present: the member rides last, and every earlier member keeps its bytes", () => {
    const today = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 });
    const guided = computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE });
    expect(Object.keys(guided).at(-1)).toBe("length");
    const { length: member, ...rest } = guided as Record<string, unknown>;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(today));
    expect(member).toEqual(lengthGuidanceReceipt(GUIDANCE));
    expect(parseCostEnvelopeBasis(guided).length).toEqual(GUIDANCE);
  });

  it("the strict parser refuses a malformed member", () => {
    const guided = computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, length: GUIDANCE }) as Record<string, unknown>;
    const member = guided.length as Record<string, unknown>;
    for (const bad of [null, { ...member, extra: 1 }, { ...member, story: { headline: 15 } }, { ...member, version: 2 }]) {
      expect(() => parseCostEnvelopeBasis({ ...guided, length: bad }), JSON.stringify(bad).slice(0, 60))
        .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
    }
  });
});
