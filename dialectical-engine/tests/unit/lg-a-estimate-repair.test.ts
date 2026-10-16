// tests/unit/lg-a-estimate-repair.test.ts
import { describe, expect, it } from "vitest";
import { previewCallShares } from "../../apps/api/src/preview-budget-estimate.js";

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
    expect(count(HAIKU, "STORYTELLER_RETRY")).toBe(2n);
    expect(count(HAIKU, "STORY_CHECKER_RETRY")).toBe(2n);
    // The steps' own second tries keep their count (a ceiling, never less).
    expect(count(GLM, "STORYTELLER_RETRY")).toBe(2n);
    expect(count(DEEPSEEK, "STORY_CHECKER_RETRY")).toBe(2n);
  });

  it("without one (absent or null): today's shares exactly", () => {
    for (const model of [undefined, null] as const) {
      const count = shares(model);
      expect(count(HAIKU, "STORYTELLER_RETRY")).toBe(0n);
      expect(count(HAIKU, "STORY_CHECKER_RETRY")).toBe(0n);
      expect(count(GLM, "STORYTELLER_RETRY")).toBe(2n);
    }
  });
});
