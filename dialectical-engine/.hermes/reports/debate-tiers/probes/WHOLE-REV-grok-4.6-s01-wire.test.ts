// Independent WHOLE-REV-grok-4.6 probe: S01 R12/R13 wire + guard. Deleted before handoff.

import { describe, expect, it, vi } from "vitest";
import { AskRequestSchema, PLAN_TIER_ROSTERS } from "@debateai/contract";
import { createDebate } from "../../apps/ui/lib/api.js";
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";

const validAsk = {
  question_line: "Independent whole-rev schema probe.",
  risk_tier: "standard" as const,
  tier_source: "MACHINE_DEFAULT" as const,
  tier_provenance_ref: "machine:plan-tier-free",
  composition_budget_tier: "low" as const,
  depth_params: { depth: 2 },
  decision_scope: "whole-rev",
  as_of: "2026-09-12T00:00:00.000Z",
  steering_presets: [] as string[],
  plan_tier: "free" as const,
  steering_annotations: [] as string[]
};

describe("WHOLE-REV independent S01 wire probe", () => {
  it("R12: plan_tier is required, enum free|premium, schema stays strict", () => {
    expect(AskRequestSchema.parse({ ...validAsk, plan_tier: "free" }).plan_tier).toBe("free");
    expect(AskRequestSchema.parse({ ...validAsk, plan_tier: "premium" }).plan_tier).toBe("premium");
    expect(() => AskRequestSchema.parse({ ...validAsk, plan_tier: "gold" })).toThrow();
    const { plan_tier: _dropped, ...rest } = validAsk;
    expect(() => AskRequestSchema.parse(rest)).toThrow();
    expect(() => AskRequestSchema.parse({ ...validAsk, extra: true })).toThrow();
  });

  it("R11: the single roster declaration is the S01/S02 shared export", () => {
    expect(PLAN_TIER_ROSTERS.free).toEqual(["gpt-5.6-luna", "claude-sonnet-5"]);
    expect(PLAN_TIER_ROSTERS.premium).toEqual(["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]);
  });

  it("R13: buildNewDebateAskConfig copies the chosen tier; createDebate rejects anything else before network", async () => {
    const submit = new Date("2026-09-12T12:00:00.000Z");
    const config = buildNewDebateAskConfig({
      planTier: "premium",
      riskTier: "standard",
      budgetTier: "low",
      decisionScope: "whole-rev",
      asOf: submit.toISOString(),
      depth: 2,
      asOfWasEdited: false,
      riskTierWasEdited: false
    }, submit);
    expect(config.plan_tier).toBe("premium");
    expect(config.tier_source).toBe("MACHINE_DEFAULT");
    expect(config.tier_provenance_ref).toBe("machine:plan-tier-free");

    const submitAsk = vi.fn();
    await expect(createDebate("a question that is long enough", {
      risk_tier: "standard",
      composition_budget_tier: "low",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection",
      as_of: submit.toISOString(),
      depth: 2,
      decision_scope: "whole-rev"
    }, "token", { submitAsk } as never)).rejects.toThrow(/^ASK_FIELD_REQUIRED:/);

    await expect(createDebate("a question that is long enough", {
      plan_tier: "gold",
      risk_tier: "standard",
      composition_budget_tier: "low",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:ui-selection",
      as_of: submit.toISOString(),
      depth: 2,
      decision_scope: "whole-rev"
    }, "token", { submitAsk } as never)).rejects.toThrow(/^ASK_FIELD_REQUIRED:/);

    expect(submitAsk).not.toHaveBeenCalled();
  });
});
