// tests/unit/lg-a-estimate-repair.test.ts
import { describe, expect, it } from "vitest";
import { previewModelRow } from "@debateai/providers";
import {
  calibratedEstimatePricer, previewCallShares, realisticWorstCasePricer, strictUpperBoundPricer
} from "../../apps/api/src/preview-budget-estimate.js";

const GLM = "zai-org/GLM-5.3-Flash";
const DEEPSEEK = "deepseek-ai/DeepSeek-V4.1-Flash";
const HAIKU = "claude-haiku-5-5";

function shares(structureRepairModel?: string | null) {
  const out = previewCallShares({ basis: { panel_size: 1, max_model_attempts: 1 }, panel: [{ provider_ref: "preview:fixture-a", model_id: GLM }],
    roleModels: { answerWriter: GLM, answerChecker: GLM, storyteller: GLM, storyChecker: DEEPSEEK },
    roleProviderRefs: [], storyRounds: 2, maxCooldownHoldsPerRun: 0, storyOnly: true,
    ...(structureRepairModel === undefined ? {} : { structureRepairModel }) });
  return (model: string, type: string) => out.shares.filter((share) => share.model === model && share.type === type)
    .reduce((sum, share) => sum + share.numerator, 0n) / out.denominator;
}

describe("LG-A: the estimate counts each story try's second POST on the repair model too", () => {
  it("with a repair model: one more second try per round per story role, on it", () => {
    const count = shares(HAIKU);
    // Controller ruling (Task 14, never under-count): each story repair is a STRUCTURE_REPAIR at the repair call's own ceiling, not a story retry.
    expect(count(HAIKU, "STRUCTURE_REPAIR")).toBe(4n);
    expect(count(HAIKU, "STORYTELLER_RETRY")).toBe(0n);
    expect(count(HAIKU, "STORY_CHECKER_RETRY")).toBe(0n);
    // The steps' own second tries keep their count (a ceiling, never less).
    expect(count(GLM, "STORYTELLER_RETRY")).toBe(2n);
    expect(count(DEEPSEEK, "STORY_CHECKER_RETRY")).toBe(2n);
  });

  it("without one (absent or null): today's shares exactly", () => {
    for (const model of [undefined, null] as const) {
      const count = shares(model);
      expect(count(HAIKU, "STRUCTURE_REPAIR")).toBe(0n);
      expect(count(HAIKU, "STORYTELLER_RETRY")).toBe(0n);
      expect(count(HAIKU, "STORY_CHECKER_RETRY")).toBe(0n);
      expect(count(GLM, "STORYTELLER_RETRY")).toBe(2n);
    }
  });

  it("prices a repair at the repair call's own ceiling: the largest body the wire accepts and the row's whole answer cap", () => {
    const haiku = previewModelRow(HAIKU)!;
    const output = Object.freeze({ debate: 8192, storyteller: 32_768, storytellerRetry: 65_536, storyChecker: 8192 });
    // Realistic worst case: (262,144 + 2,048) / 3 = 88,064 input tokens at 100 nano-USD, 32,768 output tokens at 500.
    const realistic = 88_064n * 100n + 32_768n * 500n;
    for (const tier of ["low", "medium", "high"] as const) {
      const pricer = realisticWorstCasePricer(output, tier);
      expect(pricer(haiku, "STRUCTURE_REPAIR"), tier).toBe(realistic);
      // Never below the story retry it may stand in for (the checker's retry asks only 16,384 tokens on Haiku).
      expect(pricer(haiku, "STRUCTURE_REPAIR")).toBeGreaterThanOrEqual(pricer(haiku, "STORY_CHECKER_RETRY"));
      expect(pricer(haiku, "STRUCTURE_REPAIR")).toBeGreaterThanOrEqual(pricer(haiku, "STORYTELLER_RETRY"));
    }
    // Strict bound: the gate's own reservation, (262,144 + 2,048) input tokens at one byte each.
    expect(strictUpperBoundPricer(output)(haiku, "STRUCTURE_REPAIR")).toBe(264_192n * 100n + 32_768n * 500n);
    // The calibrated average never samples a repair: it prices the realistic ceiling too.
    expect(calibratedEstimatePricer([])(haiku, "STRUCTURE_REPAIR")).toBe(realistic);
  });
});
