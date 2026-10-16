/**
 * Length guidance L26 (LG-B Task 6): the start-of-debate estimate stays a ceiling. Each final writer is priced at the
 * output it can now ask (each model's own maximum; a slow storyteller its 16,384 and a retry held to 32,768), and a gate
 * that holds a final-writer slot is held at that slot's own worst case.
 */
import { describe, expect, it } from "vitest";
import { previewModelRow, type PreviewGateRemaining } from "@debateai/providers";
import {
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, PREVIEW_STORY_REQUEST_BYTES, previewCallNanoUsd, previewCallShares, previewEstimateInputTokens,
  previewGateEstimateNanoUsd, realisticWorstCasePricer, strictUpperBoundPricer, type PreviewCallOutputTokens
} from "../../apps/api/src/preview-budget-estimate.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const MIMO = "XiaomiMiMo/MiMo-V2.6-Pro";
const HAIKU = "claude-haiku-5-5";
const row = (model: string) => previewModelRow(model)!;
const OUTPUT: PreviewCallOutputTokens = Object.freeze({ debate: 8192, storyteller: 131_072, storytellerRetry: 262_144, storyChecker: 8192 });
const IN = PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL;
const STORY = previewEstimateInputTokens(PREVIEW_STORY_REQUEST_BYTES.high.storyteller);
const CHECK = previewEstimateInputTokens(PREVIEW_STORY_REQUEST_BYTES.high.storyChecker);
const FULL = BigInt(1024 * 1024 + 2048);

describe("the realistic worst case prices the final writers at what they can ask", () => {
  const price = realisticWorstCasePricer(OUTPUT, "high");
  it("the answer writer and the answer checker at the row's own maximum, on every receipt", () => {
    expect(price(row(GLM), "ANSWER_WRITER")).toBe(IN * 150n + 131_072n * 500n);
    expect(price(row(GLM), "ANSWER_CHECKER")).toBe(IN * 150n + 131_072n * 500n);
    expect(price(row(MIMO), "ANSWER_CHECKER")).toBe(IN * 430n + 65_536n * 870n);
    expect(price(row(HAIKU), "ANSWER_WRITER")).toBe(IN * 100n + 128_000n * 500n);
    expect(price(row(GLM), "DEBATE")).toBe(IN * 150n + 8192n * 500n);
  });
  it("the storyteller at its row's allowance (slow 16,384, retry 32,768; fast its maximum twice), the checker at the maximum", () => {
    expect([price(row(GLM), "STORYTELLER"), price(row(GLM), "STORYTELLER_RETRY")])
      .toEqual([STORY * 150n + 16_384n * 500n, STORY * 150n + 32_768n * 500n]);
    expect([price(row(DEEPSEEK), "STORYTELLER"), price(row(DEEPSEEK), "STORYTELLER_RETRY")])
      .toEqual([STORY * 200n + 131_072n * 600n, STORY * 200n + 131_072n * 600n]);
    expect([price(row(GLM), "STORY_CHECKER"), price(row(GLM), "STORY_CHECKER_RETRY")])
      .toEqual([CHECK * 150n + 131_072n * 500n, CHECK * 150n + 131_072n * 500n]);
  });
  it("a register without a story prices no story output", () => {
    const none = realisticWorstCasePricer({ debate: 8192, storyteller: 0, storytellerRetry: 0, storyChecker: 0 }, "high");
    expect([none(row(GLM), "STORYTELLER"), none(row(GLM), "STORY_CHECKER_RETRY")]).toEqual([STORY * 150n, CHECK * 150n]);
  });
});

describe("the strict bound and the clamp", () => {
  it("a final writer's input is the final-writer request cap in the strict bound", () => {
    const strict = strictUpperBoundPricer(OUTPUT);
    expect(strict(row(DEEPSEEK), "ANSWER_WRITER")).toBe(FULL * 200n + 131_072n * 600n);
    expect(strict(row(DEEPSEEK), "STORY_CHECKER_RETRY")).toBe(FULL * 200n + 131_072n * 600n);
    expect(strict(row(DEEPSEEK), "DEBATE")).toBe(BigInt(256 * 1024 + 2048) * 200n + 8192n * 600n);
    // LG-A's structure-repair call stays STANDARD (controller ruling PF-B4.15): 256 KiB in, the row's 32,768 out (pre-flight PF-B3.1).
    expect(strict(row(HAIKU), "STRUCTURE_REPAIR")).toBe(BigInt(256 * 1024 + 2048) * 100n + 32_768n * 500n);
  });
  it("clamps each call's output to its tier's bound", () => {
    expect(previewCallNanoUsd(row(GLM), 0n, 200_000)).toBe(32_768n * 500n);
    expect(previewCallNanoUsd(row(GLM), 0n, 200_000, "FINAL_WRITER")).toBe(131_072n * 500n);
  });
});

describe("who makes which call", () => {
  it("the answer writer's and checker's sites are their own kinds of call, on their own models", () => {
    const basis = Object.freeze({ kind: "COMPUTED_STRUCTURAL_CEILING", panel_size: 2, depth: 1, max_model_attempts: 120, hold_cap: 2,
      call_sites: { author: 8, panel: 8, reviewer: 8, serve: 6 }, serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" } });
    const shares = previewCallShares({ basis, panel: [{ provider_ref: "preview:fixture-a", model_id: GLM },
      { provider_ref: "preview:deepseek-v4-1-flash", model_id: DEEPSEEK }],
      roleModels: { answerWriter: GLM, answerChecker: DEEPSEEK, storyteller: null, storyChecker: null },
      roleProviderRefs: ["preview:fixture-a", "preview:deepseek-v4-1-flash"], storyRounds: 0, maxCooldownHoldsPerRun: 2 });
    const kinds = (type: string) => [...new Set(shares.shares.filter((share) => share.type === type).map((share) => share.model))];
    expect([kinds("ANSWER_WRITER"), kinds("ANSWER_CHECKER")]).toEqual([[GLM], [DEEPSEEK]]);
  });
});

describe("the gate's in-flight hold", () => {
  const need = Object.freeze({ gate: "anthropic" as const, modelIds: [HAIKU], expectedCalls: 0, callsWithMargin: 0, callsNanoUsd: 0n });
  const remaining = (change: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining => Object.freeze({ state: "active", windowOpen: true,
    remainingNanoUsd: 2_000_000_000n, remainingCalls: 600, maxConcurrentCalls: 2, largestReservationNanoUsd: 247_040_000n,
    enabledModels: [HAIKU], ...change });
  it("holds the final-writer slot at its own worst case, the others at the standard one", () => {
    expect(previewGateEstimateNanoUsd(need, remaining({ largestFinalWriterReservationNanoUsd: 976_640_000n, finalWriterMaxInFlight: 1 })))
      .toBe(247_040_000n + 976_640_000n);
  });
  it("a gate that names no final-writer room is held exactly as today", () => {
    expect(previewGateEstimateNanoUsd(need, remaining())).toBe(2n * 247_040_000n);
  });
});
