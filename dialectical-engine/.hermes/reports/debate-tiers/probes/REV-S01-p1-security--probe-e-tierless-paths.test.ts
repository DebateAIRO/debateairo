/**
 * REV(S01) p1 · security lens · probes.md #5: "does any production path still build an
 * ask without a tier, and what does the guard do then?"  Answer measured, not argued.
 */
import { describe, expect, it, vi } from "vitest";
import { createDebate } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine/apps/ui/lib/api.ts";
import { buildNewDebateAskConfig } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine/apps/ui/app/new/defaults.tsx";

function spyClient() {
  const submitAsk = vi.fn(async () => ({ run_ref: "run:probe", status: "QUEUED" as const }));
  return { client: { submitAsk } as never, submitAsk };
}

describe("E1 — LibraryComposer's exact config (apps/ui/components/LibraryComposer.tsx:29-31)", () => {
  it("throws BEFORE any network call, and on risk_tier — the PRE-EXISTING guard, not S01's", async () => {
    const { client, submitAsk } = spyClient();
    await expect(
      createDebate("Remote work should be the default.", { max_depth: 3, branching: 2, max_tokens: 800 }, "cookie", client)
    ).rejects.toThrow(/^ASK_FIELD_REQUIRED: risk_tier/);
    expect(submitAsk).not.toHaveBeenCalled();
  });
});

describe("E2 — the plan_tier guard itself, once risk_tier is satisfied", () => {
  const withRisk = (over: Record<string, unknown> = {}) => ({
    risk_tier: "standard", tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "machine:plan-tier-free",
    composition_budget_tier: "low", depth: 2, decision_scope: "personal",
    as_of: "2026-09-10T00:00:00.000Z", steering_presets: [], steering_annotations: [], ...over
  });
  it("an ABSENT plan_tier is refused before the network (by requiredString, one guard earlier)", async () => {
    const { client, submitAsk } = spyClient();
    await expect(createDebate("A claim of some length.", withRisk(), "cookie", client))
      .rejects.toThrow(/^ASK_FIELD_REQUIRED: plan_tier must be supplied explicitly; the UI invents no ask values\.$/);
    expect(submitAsk).not.toHaveBeenCalled();
  });
  it("a FORGED plan_tier is refused before the network", async () => {
    const { client, submitAsk } = spyClient();
    await expect(createDebate("A claim of some length.", withRisk({ plan_tier: "gold" }), "cookie", client))
      .rejects.toThrow(/^ASK_FIELD_REQUIRED: plan_tier must be free or premium\.$/);
    expect(submitAsk).not.toHaveBeenCalled();
  });
  it("a non-string plan_tier is refused by requiredString", async () => {
    const { client, submitAsk } = spyClient();
    await expect(createDebate("A claim of some length.", withRisk({ plan_tier: 1 }), "cookie", client))
      .rejects.toThrow(/^ASK_FIELD_REQUIRED: plan_tier must be supplied explicitly/);
    expect(submitAsk).not.toHaveBeenCalled();
  });
  it("a PADDED plan_tier is TRIMMED and accepted — the wire still carries the clean value", async () => {
    const { client, submitAsk } = spyClient();
    await createDebate("A claim of some length.", withRisk({ plan_tier: "  premium  " }), "cookie", client);
    expect(submitAsk).toHaveBeenCalledTimes(1);
    expect((submitAsk.mock.calls[0] as unknown as [{ plan_tier: string }])[0].plan_tier).toBe("premium");
  });
  it("a valid tier reaches submitAsk verbatim", async () => {
    const { client, submitAsk } = spyClient();
    await createDebate("A claim of some length.", withRisk({ plan_tier: "free" }), "cookie", client);
    expect((submitAsk.mock.calls[0] as unknown as [{ plan_tier: string }])[0].plan_tier).toBe("free");
  });
});

describe("E3 — buildNewDebateAskConfig with NO tier (the optional member, SPEC R13)", () => {
  it("emits plan_tier: undefined, which createDebate then refuses — no invented default", async () => {
    const cfg = buildNewDebateAskConfig({
      riskTier: "standard", budgetTier: "low", decisionScope: "personal",
      asOf: "2026-09-10T00:00:00.000Z", depth: 2, asOfWasEdited: false
    }, new Date("2026-09-10T00:00:00.000Z"));
    expect("plan_tier" in cfg).toBe(true);
    expect(cfg.plan_tier).toBeUndefined();
    const { client, submitAsk } = spyClient();
    await expect(createDebate("A claim of some length.", cfg, "cookie", client))
      .rejects.toThrow(/^ASK_FIELD_REQUIRED: plan_tier/);
    expect(submitAsk).not.toHaveBeenCalled();
  });
  it("the PREMIUM-with-untouched-risk-tier ask carries provenance naming the FREE plan", () => {
    const cfg = buildNewDebateAskConfig({
      planTier: "premium", riskTier: "standard", budgetTier: "low", decisionScope: "personal",
      asOf: "2026-09-10T00:00:00.000Z", depth: 2, asOfWasEdited: false, riskTierWasEdited: false
    }, new Date("2026-09-10T00:00:00.000Z"));
    expect(cfg.plan_tier).toBe("premium");
    expect(cfg.tier_source).toBe("MACHINE_DEFAULT");
    expect(cfg.tier_provenance_ref).toBe("machine:plan-tier-free"); // R7 says intended; N-finding on the requirement
  });
});
