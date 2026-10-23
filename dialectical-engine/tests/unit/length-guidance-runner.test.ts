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
    // Task 7 review 5: the two legs not named above.
    expect(judgeLegLengthStep({ kind: "independent-root" })).toBe("opening");
    expect(judgeLegLengthStep({ kind: "support", positionUnderDebate: "p" })).toBe("pros_cons");
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

// Task 7 review 1: the runner's call sites, read off its source, so a site that stops sizing or telling its call fails here.
describe("the runner's length call sites (source pins)", () => {
  const RUNNER = readFileSync(new URL("../../apps/runner/src/index.ts", import.meta.url), "utf8");
  const count = (text: string): number => RUNNER.split(text).length - 1;

  // Engine redesign R2a A14: the investigator's call is the ninth sized site.
  it("eleven guided bounds: the definition and one per sized call site (ten)", () => {
    // R2a A14 added the investigator's site, R2b B5 the comparing judges'.
    expect(count("guidedCallBound(")).toBe(11);
    for (const site of [
      "guidedCallBound(input.judgeBound, \"reviewer\", catchUpLength)",
      "guidedCallBound(settings.judgeBound, \"judge_panel\", lengthGuidance)",
      "guidedCallBound(settings.judgeBound, \"opening\", lengthGuidance).tokenCeiling",
      "guidedCallBound(settings.judgeBound, judgeLegLengthStep(leg), lengthGuidance)",
      "guidedCallBound(settings.judgeBound, judgeLegLengthStep(input.leg), lengthGuidance)",
      "guidedCallBound(settings.judgeBound, \"reviewer\", lengthGuidance)",
      "\"answer_writer\", lengthGuidance),",
      "guidedCallBound(settings.synthesisRolePolicy.evaluatorBound, \"answer_checker\", lengthGuidance)",
      "guidedCallBound(settings.judgeBound, \"investigator\", lengthGuidance)",
      "guidedCallBound(settings.judgeBound, \"comparing_judge\", lengthGuidance)"
    ]) expect(count(site), site).toBe(1);
  });

  it("the writer and the checker record their guided words only with the receipt's length", () => {
    expect(count("...(lengthGuidance === null ? {} : { guidedWords: lengthGuidance.steps.answer_writer }),")).toBe(1);
    expect(count("...(lengthGuidance === null ? {} : { guidedWords: lengthGuidance.steps.answer_checker }),")).toBe(1);
  });

  it("every target names the run's own language tag", () => {
    // The writer's and the checker's RoleLength, and (R2a A14) the investigator's guide.
    expect(count("languageCode: run.argumentLanguageTag")).toBe(3);
    expect(count("lengthGuideFrom(lengthGuidance, step, run.argumentLanguageTag)")).toBe(1); // judge, panel, review
    expect(count("lengthGuideFrom(catchUpLength, \"reviewer\", catchUpTag)")).toBe(1);
  });
});

describe("the runner never reads the row (Review Focus 2)", () => {
  // apps/runner/src is flat, so the scan also reads Task 8's hosted publisher, which reads the row for its boot-readiness
  // check only; it is exempt for both names (pre-flight PF-C3.4).
  // Engine redesign (R1d Task 5, controller ruling Q6): engine-boot.ts reads the row's PRESENCE for the reader name only (never a number, never the key).
  it("no runner source names the row's reader or key", () => {
    const dir = new URL("../../apps/runner/src/", import.meta.url);
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(new URL(name, dir), "utf8");
      const publisher = name === "hosted-register-publish.ts";
      const presenceOnly = name === "engine-boot.ts";
      expect(source.includes("readLengthGuidancePolicy") && !publisher && !presenceOnly, name).toBe(false);
      expect(source.includes("LENGTH_GUIDANCE_POLICY_ROW_KEY") && !publisher, name).toBe(false);
    }
    const engineBoot = readFileSync(new URL("engine-boot.ts", dir), "utf8");
    expect(engineBoot).toContain("(await readLengthGuidancePolicy(pool, registerVersion)) !== null");
    expect(engineBoot.split("readLengthGuidancePolicy(")).toHaveLength(2);
    // Task 5 review 1 (final wave B3): the bare name too, so an alias or a passed-on reference cannot dodge the pin:
    // exactly the import and the one call.
    expect(engineBoot.split("readLengthGuidancePolicy")).toHaveLength(3);
  });
  // Task 7 review 4: the publisher's exemption is ONE read, inside its boot-readiness check.
  it("the hosted publisher reads the row exactly once, inside verifyHostedRegisterBootReadiness", () => {
    const source = readFileSync(new URL("../../apps/runner/src/hosted-register-publish.ts", import.meta.url), "utf8");
    expect(source.split("readLengthGuidancePolicy(").length - 1).toBe(1);
    const start = source.indexOf("export async function verifyHostedRegisterBootReadiness(");
    expect(start).toBeGreaterThanOrEqual(0);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body.split("readLengthGuidancePolicy(").length - 1).toBe(1);
    // Task 8 review 2: the read is awaited (a malformed sealed row throws LENGTH_GUIDANCE_POLICY_INVALID and the version is
    // never reported ready), in main.ts's order: after the question-language step, before the scorecard.
    const read = body.indexOf("  await readLengthGuidancePolicy(pool, version);\n");
    expect(read).toBeGreaterThan(body.indexOf("await assertHostedQuestionLanguageBootReady(pool, version);"));
    expect(body.indexOf("await assertHostedQuestionLanguageBootReady(pool, version);")).toBeGreaterThanOrEqual(0);
    expect(read).toBeLessThan(body.indexOf("await readModelScorecard(pool, version,"));
  });
});
