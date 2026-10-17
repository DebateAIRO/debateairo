import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_STEPS, LENGTH_THINKING_ROOM_KEYS } from "@debateai/kernel";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { publicCostEnvelopeBasis } from "@debateai/serve";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, lengthGuidanceOfReceipt, resolveDebateShape, lengthGuidancePolicyStartValues, lengthGuidanceReceipt,
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

  // Task 3 review 3: `length: null` (or any non-plain object) is refused with the named code, never a bare TypeError.
  it.each([
    ["null", null], ["an array", []], ["a string", "standard"], ["a number", 350], ["a Map", new Map()], ["a Date", new Date(0)]
  ])("refuses %s as the length member with STRUCTURAL_CEILING_LENGTH_INVALID", (_label, bad) => {
    expect(() => lengthGuidanceReceipt(bad as unknown as LengthGuidance))
      .toThrowError(expect.objectContaining({ code: "STRUCTURAL_CEILING_LENGTH_INVALID" }));
    expect(() => computeStructuralCeilingBasis({ ...TERMS, panelSize: 2, depth: 1, length: bad as unknown as LengthGuidance }))
      .toThrowError(expect.objectContaining({ code: "STRUCTURAL_CEILING_LENGTH_INVALID" }));
  });

  // Task 3 review 1: at MINT time the numbers are checked against the row's own bounds (the read-back schema stays loose).
  it.each([
    ["a step's words above the row's 5000", { steps: { ...GUIDANCE.steps, opening: 5001 } }, "steps.opening"],
    ["the answer writer's words below the row's 50", { steps: { ...GUIDANCE.steps, answer_writer: 49 } }, "steps.answer_writer"],
    ["a map part below the row's 5", { map: { ...GUIDANCE.map, claim: 4 } }, "map.claim"],
    ["a story part above the row's 5000", { story: { ...GUIDANCE.story, summary: 5001 } }, "story.summary"],
    ["a thinking room above the row's 32768", { thinkingRoom: { ...GUIDANCE.thinkingRoom, map: 32769 } }, "thinkingRoom.map"],
    ["the storyteller's room above the row's 65536", { thinkingRoom: { ...GUIDANCE.thinkingRoom, story_writer: 65537 } },
      "thinkingRoom.story_writer"],
    ["tokens per word with seven decimals", { tokensPerWord: 3.0000001 }, "tokensPerWord"],
    ["the story long reference below the row's 500", { storyLongReferenceWords: 499 }, "storyLongReferenceWords"],
    ["a characters factor above the row's 10", { charactersPerWord: { ...GUIDANCE.charactersPerWord, th: 10.5 } }, "charactersPerWord.th"],
    ["an unknown plan key", { plan: "gold" }, "plan"]
  ])("refuses %s at mint, naming the path", (_label, change, path) => {
    const broken = { ...GUIDANCE, ...change } as LengthGuidance;
    expect(() => lengthGuidanceReceipt(broken)).toThrowError(expect.objectContaining({ code: "STRUCTURAL_CEILING_LENGTH_INVALID",
      message: expect.stringContaining(path) }));
  });

  it("the read-back schema stays looser than the row on purpose: a sealed receipt minted under older bounds still reads", () => {
    const receipt = lengthGuidanceReceipt(GUIDANCE);
    const older = { ...receipt, steps: { ...receipt.steps, opening: 6000 }, thinking_room: { ...receipt.thinking_room, map: 40000 } };
    expect(lengthGuidanceReceiptSchema.safeParse(older).success).toBe(true);
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

  // Task 3 review 2: with the shape member too, the length member still rides last and both read back.
  it("shape and length together: the last two keys are shape then length, and both read back", () => {
    const shape = resolveDebateShape({ policy: debateShapePolicyStartValues(), plan: "pro", makers: 3,
      settings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } })!;
    const both = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, shape, length: GUIDANCE })));
    expect(Object.keys(both).slice(-2)).toEqual(["shape", "length"]);
    const parsed = parseCostEnvelopeBasis(both);
    expect(parsed.shape).toEqual(shape);
    expect(parsed.length).toEqual(GUIDANCE);
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

describe("R1d PF-D2.3 ruling: the public answer read carries no length member", () => {
  it("a lengthed receipt's public basis has no length key and every other member as stored; the stored receipt is unchanged", () => {
    const stored = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2, length: GUIDANCE }))) as
      Record<string, unknown>;
    const shown = publicCostEnvelopeBasis(stored);
    expect(Object.hasOwn(shown, "length")).toBe(false);
    const { length: _length, ...rest } = stored;
    expect(JSON.stringify(shown)).toBe(JSON.stringify(rest));
    expect(stored.length).toBeDefined();
  });

  it("without length (and without shape) the public basis is today's object itself, byte for byte", () => {
    const today = JSON.parse(JSON.stringify(computeStructuralCeilingBasis({ ...TERMS, panelSize: 3, depth: 2 }))) as Record<string, unknown>;
    const before = JSON.stringify(today);
    expect(publicCostEnvelopeBasis(today)).toBe(today);
    expect(JSON.stringify(publicCostEnvelopeBasis(today))).toBe(before);
  });
});
