import type { ContractClient } from "@debateai/contract";
import { describe, expect, it, vi } from "vitest";

// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { buildNewDebateAskConfig } from "../../apps/ui/app/new/defaults.js";
import { createDebate } from "../../apps/ui/lib/api.js";

describe("S01 tier ask wire", () => {
  it("R13 puts the chosen tier in the ask config", () => {
    const submitTime = new Date("2026-09-10T00:00:00.000Z");
    const configs = (["premium", "free"] as const).map((planTier) =>
      buildNewDebateAskConfig({
        riskTier: "standard",
        budgetTier: "low",
        decisionScope: "tier wire",
        asOf: "2026-09-09T00:00:00.000Z",
        depth: 2,
        asOfWasEdited: false,
        planTier
      }, submitTime)
    );

    expect(configs).toMatchObject([
      { plan_tier: "premium" },
      { plan_tier: "free" }
    ]);
  });

  it("R7 names the mechanism that set an unedited risk tier", () => {
    const submitTime = new Date("2026-09-10T00:00:00.000Z");
    const provenance = (["free", "premium"] as const).flatMap((planTier) =>
      [false, true].map((riskTierWasEdited) => {
        const config = buildNewDebateAskConfig({
          riskTier: "standard",
          budgetTier: "low",
          decisionScope: "tier provenance",
          asOf: "2026-09-09T00:00:00.000Z",
          depth: 2,
          asOfWasEdited: false,
          planTier,
          riskTierWasEdited
        }, submitTime);
        return {
          planTier,
          riskTierWasEdited,
          tierSource: config.tier_source,
          tierProvenanceRef: config.tier_provenance_ref
        };
      })
    );

    expect(provenance).toEqual([
      {
        planTier: "free",
        riskTierWasEdited: false,
        tierSource: "MACHINE_DEFAULT",
        tierProvenanceRef: "machine:plan-tier-free"
      },
      {
        planTier: "free",
        riskTierWasEdited: true,
        tierSource: "ASKER",
        tierProvenanceRef: "asker:ui-selection"
      },
      {
        planTier: "premium",
        riskTierWasEdited: false,
        tierSource: "MACHINE_DEFAULT",
        tierProvenanceRef: "machine:plan-tier-free"
      },
      {
        planTier: "premium",
        riskTierWasEdited: true,
        tierSource: "ASKER",
        tierProvenanceRef: "asker:ui-selection"
      }
    ]);
  });

  it("R13 refuses an ask with no tier or an unknown tier before any network call", async () => {
    const completeConfig = {
      risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:plan-tier-free",
      composition_budget_tier: "low",
      depth: 2,
      decision_scope: "tier refusal",
      as_of: "2026-09-10T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    };
    const refusals = [];

    for (const config of [completeConfig, { ...completeConfig, plan_tier: "gold" }]) {
      const submitAsk = vi.fn().mockResolvedValue({ run_ref: "run:new", status: "QUEUED" as const });
      const client = { submitAsk } as unknown as ContractClient;
      let message = "";
      try {
        await createDebate("Which tier is valid?", config, "token", client);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      refusals.push({ message, submitAskCalls: submitAsk.mock.calls.length });
    }

    expect(refusals).toEqual([
      {
        message: expect.stringMatching(/^ASK_FIELD_REQUIRED:/),
        submitAskCalls: 0
      },
      {
        message: expect.stringMatching(/^ASK_FIELD_REQUIRED: plan_tier/),
        submitAskCalls: 0
      }
    ]);
  });
});
