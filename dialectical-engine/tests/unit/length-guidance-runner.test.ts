import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LENGTH_GUIDANCE_START } from "@debateai/kernel";
import { judgeLegLengthStep } from "@debateai/judgement";
import { readPromptFrame } from "@debateai/providers";
import { lengthGuidancePolicyStartValues, resolveLengthGuidance } from "@debateai/register";
import { SYNTHESIZER_LENGTH_PROMPT_CONTRACT, synthesizerAnswerLengthField, toSynthesisPromptMaterial } from "@debateai/serve";
import { buildSynthesisRolePrompt, guidedCallBound, type RoleLength } from "../../apps/runner/src/index.js";
import { synthesisRequestFixture } from "../support/synthesisRequestFixture.js";

const GUIDANCE = resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" });
const SEALED = Object.freeze({ maxAttempts: 3, tokenCeiling: 2048, deadlineMs: 180000 });
const fixed = (size: number) => Buffer.alloc(size, 7);
const words = (answerWords: number, languageCode: string | null = null): RoleLength =>
  ({ answerWords, ownWords: null, languageCode, charactersPerWord: LENGTH_GUIDANCE_START.charactersPerWord });

describe("guidedCallBound (spec §3.3)", () => {
  it("row absent: the bound itself, the same object", () => {
    expect(guidedCallBound(SEALED, "pros_cons", null)).toBe(SEALED);
  });
  it("each debate step at its guided allowance; steps sized elsewhere unchanged", () => {
    expect(guidedCallBound(SEALED, "pros_cons", GUIDANCE)).toEqual({ ...SEALED, tokenCeiling: 9144 });
    expect(guidedCallBound(SEALED, "opening", GUIDANCE).tokenCeiling).toBe(7696);
    // C-1 writer words 200 / 350 / 1,000 (engine INTERFACE §4.1): 16,384 + 4 x words x 3 (pre-flight PF-C3.1).
    expect(guidedCallBound(SEALED, "answer_writer", GUIDANCE).tokenCeiling).toBe(20584);
    for (const step of ["story_writer", "map", "structure_repair"] as const) expect(guidedCallBound(SEALED, step, GUIDANCE)).toBe(SEALED);
    const big = { ...SEALED, tokenCeiling: 65536 };
    expect(guidedCallBound(big, "answer_writer", GUIDANCE)).toBe(big);
  });
  // Pre-flight PF-C3.9 (accepted by the controller): these writer bounds are what the preview wrapper's final-writer tier
  // receives as `request.bound`. On a slow row (GLM, MiMo, Qwen) they are asked FIRST, before LG-B's 16,384 floor; Step 6b
  // pins that in tests/unit/lg-b-final-writer-tier.test.ts.
  it("the writer's bound at each answer length: 18,784 / 20,584 / 28,384, all above LG-B's slow-row 16,384", () => {
    const at = (answerLength: "short" | "standard" | "detailed") =>
      resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength });
    expect((["short", "standard", "detailed"] as const).map((answerLength) =>
      guidedCallBound(SEALED, "answer_writer", at(answerLength)).tokenCeiling)).toEqual([18784, 20584, 28384]);
  });
  it("judge legs map to their steps", () => {
    expect(judgeLegLengthStep({ kind: "primary-root" })).toBe("opening");
    expect(judgeLegLengthStep({ kind: "assigned-root", assignedAnswer: "a", mapPoints: "{}" })).toBe("opening");
    expect(judgeLegLengthStep({ kind: "attack", positionUnderDebate: "p" })).toBe("pros_cons");
    expect(judgeLegLengthStep({ kind: "cross-root", ownPosition: "a", otherMakersPosition: "b" })).toBe("cross_exchange");
  });
});

describe("the answer writer is told its target (spec §3.2 notes)", () => {
  it("a words target is today's length variant: today's projection, then answer_length last", () => {
    const request = synthesisRequestFixture();
    const frame = readPromptFrame(buildSynthesisRolePrompt(request, "English", fixed, words(700)).packet);
    expect(frame.contractId).toBe(SYNTHESIZER_LENGTH_PROMPT_CONTRACT.contractId);
    expect(frame.fields).toEqual([...toSynthesisPromptMaterial(request), synthesizerAnswerLengthField(700)]
      .map((field) => ({ name: field.name, content: field.content })));
  });
  // A 700-word target passed directly (not the Standard start value, which is 350 under C-1): 700 x 1.6 = 1,120 characters
  // (pre-flight PF-C3.1).
  it("a Chinese run's 700-word target names characters", () => {
    const frame = readPromptFrame(buildSynthesisRolePrompt(synthesisRequestFixture(), "Chinese", undefined, words(700, "zh-Hans")).packet);
    expect(frame.fields.at(-1)).toEqual({ name: "answer_length", content: "about 1120 characters" });
  });
  // Today's writer is serve.synthesizer.v4 (answer-writer v4 wording, R15); pre-flight PF-C3.2.
  it("no target: today's v4 packet", () => {
    const request = synthesisRequestFixture();
    expect(buildSynthesisRolePrompt(request, "English", fixed, null).packet).toEqual(buildSynthesisRolePrompt(request, "English", fixed).packet);
    expect(readPromptFrame(buildSynthesisRolePrompt(request, "English", fixed).packet).contractId).toBe("serve.synthesizer.v4");
  });
});

describe("the runner never reads the row (Review Focus 2)", () => {
  // apps/runner/src is flat, so the scan also reads Task 8's hosted publisher, which reads the row for its boot-readiness
  // check only; it is exempt for both names (pre-flight PF-C3.4).
  it("no runner source names the row's reader or key", () => {
    const dir = new URL("../../apps/runner/src/", import.meta.url);
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(new URL(name, dir), "utf8");
      const publisher = name === "hosted-register-publish.ts";
      expect(source.includes("readLengthGuidancePolicy") && !publisher, name).toBe(false);
      expect(source.includes("LENGTH_GUIDANCE_POLICY_ROW_KEY") && !publisher, name).toBe(false);
    }
  });
});
