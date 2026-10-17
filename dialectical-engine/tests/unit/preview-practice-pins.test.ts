import { describe, expect, it } from "vitest";
import { PREVIEW_PROVIDER_REF_MODELS } from "@debateai/providers";
import { pickRotatedRoles, type RoleRotationCounts } from "@debateai/scorecard";
import { parsePracticeArgs } from "../../tools/preview-practice/practice.js";
import {
  PRACTICE_PIN_FLAGS,
  practicePinsNotHeld,
  practicePinsRequireRotation,
  practiceRotationCountsWithPins,
  practiceServedModels,
  practiceServedStoryteller,
  practiceWriterPinsBlock,
  practiceWriterPinsFromArgs,
  practiceWriterPinsLines
} from "../../tools/preview-practice/practice-pins.js";
import { practiceVerdict } from "../../tools/preview-practice/practice-verdict.js";

/**
 * Pinning the final writers (spec 2026-10-15 engine redesign §14; INTERFACE §15.2, counts mechanism): the counts the
 * role rotation reads give the pinned model share 0 in its role, so the rotation's own rule picks it; the checkers stay
 * with another maker; the run's role table is never written by the practice.
 */

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const QWEN = "Qwen/Qwen3.8-Flash";
const HAIKU = "claude-haiku-5-5";
const PREMIUM = [GLM, DEEPSEEK, MIMO, QWEN, HAIKU];
const PANEL = [
  { provider_ref: "ref-glm", maker: "zai", model_id: GLM },
  { provider_ref: "ref-deepseek", maker: "deepseek", model_id: DEEPSEEK },
  { provider_ref: "ref-haiku", maker: "anthropic", model_id: HAIKU }
];
const SEED = "a".repeat(64);
/** Haiku has written every earlier answer and story: the rotation, left alone, never picks it for either role. */
const HEAVY: RoleRotationCounts = {
  ANSWER_WRITER: { [HAIKU]: { picked: 9, eligible: 9 } },
  STORYTELLER: { [HAIKU]: { picked: 9, eligible: 9 } },
  OPENER: { [GLM]: { picked: 2, eligible: 3 } }
};
const flags = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe("pins: the flags", () => {
  it("are known value flags, debate-only, each a premium preview model, the value never repeated", () => {
    expect(PRACTICE_PIN_FLAGS).toEqual(["--answer-writer-model", "--storyteller-model"]);
    expect(parsePracticeArgs(["debate", "--answer-writer-model", HAIKU, "--storyteller-model", MIMO]).flags.get("--storyteller-model")).toBe(MIMO);
    expect(practiceWriterPinsFromArgs("debate", flags({}), PREMIUM)).toEqual({ answerWriter: null, storyteller: null });
    expect(practiceWriterPinsFromArgs("debate", flags({ "--answer-writer-model": HAIKU }), PREMIUM)).toEqual({ answerWriter: HAIKU, storyteller: null });
    expect(() => practiceWriterPinsFromArgs("formats", flags({ "--storyteller-model": HAIKU }), PREMIUM))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_FLAG_VALUE_INVALID", message: "PRACTICE_FLAG_VALUE_INVALID: --storyteller-model (debate mode only)" }));
    expect(() => practiceWriterPinsFromArgs("debate", flags({ "--storyteller-model": "gpt-unknown" }), PREMIUM))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_PIN_MODEL_INVALID", message: "PRACTICE_PIN_MODEL_INVALID: --storyteller-model" }));
  });

  it("need role rotation on in the practice register", () => {
    expect(() => practicePinsRequireRotation({ answerWriter: HAIKU, storyteller: null }, false))
      .toThrowError(expect.objectContaining({ code: "PRACTICE_PIN_NEEDS_ROLE_ROTATION" }));
    expect(() => practicePinsRequireRotation({ answerWriter: HAIKU, storyteller: null }, true)).not.toThrow();
    expect(() => practicePinsRequireRotation({ answerWriter: null, storyteller: null }, false)).not.toThrow();
  });
});

describe("pins: the counts the rotation reads", () => {
  it("left alone, the rotation never picks the model with the largest share", () => {
    const today = pickRotatedRoles({ panel: PANEL, counts: HEAVY, seed: SEED })!;
    expect(today.answerWriter.modelId).not.toBe(HAIKU);
    expect(today.storyteller.modelId).not.toBe(HAIKU);
  });

  it("the pinned model is picked for its role; each checker stays with another maker; other roles keep their counts", () => {
    const counts = practiceRotationCountsWithPins(HEAVY, { answerWriter: HAIKU, storyteller: GLM }, PREMIUM);
    const picked = pickRotatedRoles({ panel: PANEL, counts, seed: SEED })!;
    expect(picked.answerWriter.modelId).toBe(HAIKU);
    expect(picked.answerChecker.maker).not.toBe("anthropic");
    expect(picked.storyteller.modelId).toBe(GLM);
    expect(picked.storyChecker.maker).not.toBe("zai");
    expect(counts.OPENER).toEqual(HEAVY.OPENER);
    expect(counts.ANSWER_WRITER![HAIKU]).toEqual({ picked: 0, eligible: 0 });
    expect(counts.ANSWER_WRITER![GLM]).toEqual({ picked: 1, eligible: 1 });
    expect(practiceRotationCountsWithPins(HEAVY, { answerWriter: null, storyteller: null }, PREMIUM)).toEqual(HEAVY);
  });

  it("a pinned model that sat out is not on the panel: the rotation picks another", () => {
    const counts = practiceRotationCountsWithPins({}, { answerWriter: MIMO, storyteller: null }, PREMIUM);
    expect(pickRotatedRoles({ panel: PANEL, counts, seed: SEED })!.answerWriter.modelId).not.toBe(MIMO);
  });

  it("a pin outside the premium list here is a broken invariant (the flags refused it first), never a practice refusal", () => {
    // Task 21 review 3 (final wave A8): practiceWriterPinsFromArgs checks the same premium list before any gate is asked.
    expect(() => practiceRotationCountsWithPins({}, { answerWriter: null, storyteller: "gpt-unknown" }, PREMIUM))
      .toThrowError(new TypeError("PRACTICE_PIN_UNCHECKED: STORYTELLER"));
  });
});

describe("pins: what the run did", () => {
  const ref = (model: string) => Object.entries(PREVIEW_PROVIDER_REF_MODELS).find(([, id]) => id === model)![0];

  // Task 21 review, RULING (final wave A1): "held" means the pinned model actually SERVED the step, read from the run's own
  // served-call facts (the answered final-writer calls, the stored story's storyteller), not only that the role pin named it.
  const served = (answerWriter: readonly string[], storyteller: readonly string[]) => ({ answerWriter, storyteller });

  it("held when the run's own pin names the pinned model and it served the step; not held otherwise, a NOT_PROVEN reason", () => {
    const block = practiceWriterPinsBlock({ answerWriter: HAIKU, storyteller: MIMO }, { answerWriter: ref(HAIKU), storyteller: ref(GLM) },
      served([HAIKU], [GLM]));
    expect(block).toEqual({
      answerWriter: { pinnedModel: HAIKU, wroteModel: HAIKU, servedBy: [HAIKU], held: true },
      storyteller: { pinnedModel: MIMO, wroteModel: GLM, servedBy: [GLM], held: false }
    });
    expect(practicePinsNotHeld(block)).toEqual(["STORYTELLER"]);
    expect(practiceWriterPinsBlock({ answerWriter: HAIKU, storyteller: null }, null, null))
      .toEqual({ answerWriter: { pinnedModel: HAIKU, wroteModel: null, servedBy: [], held: false }, storyteller: null });
    const verdict = practiceVerdict({ harnessError: null, completed: true, servedAnswer: true, storyOutcome: "READY", formatFailures: 0,
      failedCalls: 0, gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {},
      pinsNotHeld: practicePinsNotHeld(block) });
    expect({ verdict: verdict.verdict, reasons: verdict.reasons }).toEqual({ verdict: "NOT_PROVEN", reasons: ["PRACTICE_PIN_NOT_HELD:STORYTELLER"] });
  });

  it("a cost fallback serving the final writer instead of the pinned model: not held, though the role pin names it", () => {
    const pins = { answerWriter: HAIKU, storyteller: null };
    const rotation = { answerWriter: ref(HAIKU), storyteller: ref(GLM) };
    // One of the writer's calls was served by the cost fallback's GLM: the pinned model did not write the answer alone.
    expect(practiceWriterPinsBlock(pins, rotation, served([HAIKU, GLM], [GLM])).answerWriter)
      .toEqual({ pinnedModel: HAIKU, wroteModel: HAIKU, servedBy: [HAIKU, GLM], held: false });
    expect(practiceWriterPinsBlock(pins, rotation, served([GLM], [GLM])).answerWriter?.held).toBe(false);
    // No final-writer call answered (the debate ended first): nothing served, not held.
    expect(practiceWriterPinsBlock(pins, rotation, served([], [])).answerWriter?.held).toBe(false);
    expect(practicePinsNotHeld(practiceWriterPinsBlock(pins, rotation, served([GLM], [])))).toEqual(["ANSWER_WRITER"]);
  });

  it("a backup storyteller (or a cost fallback) telling the story instead of the pinned model: not held", () => {
    const pins = { answerWriter: null, storyteller: MIMO };
    const rotation = { answerWriter: ref(HAIKU), storyteller: ref(MIMO) };
    expect(practiceWriterPinsBlock(pins, rotation, served([HAIKU], [DEEPSEEK])).storyteller)
      .toEqual({ pinnedModel: MIMO, wroteModel: MIMO, servedBy: [DEEPSEEK], held: false });
    expect(practiceWriterPinsBlock(pins, rotation, served([HAIKU], [MIMO])).storyteller?.held).toBe(true);
    // No stored story lineage (the story FAILED): nothing served, not held.
    expect(practiceWriterPinsBlock(pins, rotation, served([HAIKU], [])).storyteller?.held).toBe(false);
  });

  it("the served facts: each answered call's own AI, per family, once each in ledger order; the story's served storyteller", () => {
    const calls = [
      { model: HAIKU, family: "SYNTHESIZER" as const, tries: [{ outcome: "OK", parseStatus: "PARSED", replyForm: null }] },
      // A call that never answered serves nothing.
      { model: QWEN, family: "SYNTHESIZER" as const, tries: [{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: null }] },
      // A structure-repaired call is its own AI's (the call join names the call's AI, not the repair model).
      { model: GLM, family: "SYNTHESIZER" as const, tries: [{ outcome: "FAILED", parseStatus: "SCHEMA_FAILED", replyForm: null },
        { outcome: "OK", parseStatus: "PARSED", replyForm: "STRUCTURE" as const }] },
      { model: HAIKU, family: "SYNTHESIZER" as const, tries: [{ outcome: "OK", parseStatus: "PARSED", replyForm: null }] },
      { model: MIMO, family: "STORYTELLER" as const, tries: [{ outcome: "OK", parseStatus: "PARSED", replyForm: null }] }
    ];
    expect(practiceServedModels(calls, "SYNTHESIZER")).toEqual([HAIKU, GLM]);
    expect(practiceServedStoryteller({ storytellerLineage: { maker: "xiaomi", model_id: "m", transport: "t", provider_ref: ref(MIMO) } }))
      .toEqual([MIMO]);
    expect(practiceServedStoryteller({ storytellerLineage: null })).toEqual([]);
    expect(practiceServedStoryteller(null)).toEqual([]);
  });

  it("report lines: model ids and yes/no only", () => {
    const lines = practiceWriterPinsLines({ answerWriter: { pinnedModel: HAIKU, wroteModel: HAIKU, servedBy: [HAIKU], held: true },
      storyteller: null }).join("\n");
    expect(lines).toContain(`- answer writer: pinned ${HAIKU}, wrote ${HAIKU}, served by ${HAIKU}, held: yes`);
    expect(practiceWriterPinsLines({ answerWriter: { pinnedModel: HAIKU, wroteModel: HAIKU, servedBy: [], held: false }, storyteller: null })
      .join("\n")).toContain(`- answer writer: pinned ${HAIKU}, wrote ${HAIKU}, served by none, held: no`);
    expect(lines).not.toContain("storyteller:");
  });
});
