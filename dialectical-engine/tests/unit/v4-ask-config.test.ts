import type { AskRequest, ContractClient } from "@debateai/contract";
import { beforeAll, describe, expect, it } from "vitest";

import { createDebate } from "../../apps/ui/lib/api.js";

/*
 * V4 initial (spec 2026-10-28, B2): Quick look / Thorough and the reading level become /new's ask, built by
 * buildNewDebateAskConfig, and createDebate accepts every combination. Free never sends scrutiny above standard, and
 * every Free ask is a quick look (depth 1, owner N13 of 2026-10-29); the shape and length choices go only when the room said their row is in force.
 *
 * askConfig.ts reaches app/new/defaults.tsx, which the root test compiler (no JSX mode) cannot read, so the module is
 * loaded by a path the compiler does not follow; Vitest resolves it as usual.
 */

type Settings = Readonly<{ planTier: "free" | "premium"; shapeSettings: boolean; lengthSettings: boolean; settingsVersion?: number }>;
type Mode = "quick" | "thorough";
type Level = "plain" | "background" | "expert";
type AskConfigModule = Readonly<{
  effectiveDigMode(mode: Mode, planTier: Settings["planTier"]): Mode;
  v4RoomQuery(mode: Mode, level: Level, settings: Settings): Record<string, unknown>;
  v4AskConfig(mode: Mode, level: Level, settings: Settings, submitTime: Date, catalog: Readonly<Record<string, string>>): Record<string, unknown>;
}>;

const ASK_CONFIG_MODULE = "@/lib/v4/askConfig";
let mod: AskConfigModule;
beforeAll(async () => {
  mod = (await import(/* @vite-ignore */ ASK_CONFIG_MODULE)) as AskConfigModule;
});

const SUBMIT_TIME = new Date("2026-10-28T09:30:00.000Z");
const MODES: readonly Mode[] = ["quick", "thorough"];
const TIERS = ["free", "premium"] as const;
const SWITCHES = [
  { shapeSettings: false, lengthSettings: false },
  { shapeSettings: false, lengthSettings: true },
  { shapeSettings: true, lengthSettings: false },
  { shapeSettings: true, lengthSettings: true }
] as const;

function capturingClient(): { client: ContractClient; asks: AskRequest[] } {
  const asks: AskRequest[] = [];
  const client = { submitAsk: async (ask: AskRequest) => { asks.push(ask); return { run_ref: "run:v4", status: "QUEUED" }; } };
  return { client: client as unknown as ContractClient, asks };
}

describe("v4AskConfig", () => {
  it("passes createDebate's checks for quick and thorough × free and premium × every switch", async () => {
    for (const mode of MODES) for (const planTier of TIERS) for (const switches of SWITCHES) {
      const { client, asks } = capturingClient();
      const config = mod.v4AskConfig(mode, "background", { planTier, ...switches }, SUBMIT_TIME, {});
      await createDebate("Should the city fund the tram?", config, "cookie-session", client);
      const ask = asks[0]!;
      expect(ask.plan_tier).toBe(planTier);
      expect(ask.risk_tier).toBe("standard");
      expect(ask.tier_source).toBe("MACHINE_DEFAULT");
      expect(ask.composition_budget_tier).toBe("low");
      expect(ask.decision_scope).toBe("personal");
      expect(ask.as_of).toBe(SUBMIT_TIME.toISOString());
      expect(ask.model_strength).toBeUndefined();
      // Owner N13: every Free ask is a quick look (depth 1); paid plans keep the choice.
      expect(ask.depth_params.depth).toBe(mode === "thorough" && planTier === "premium" ? 2 : 1);
      expect(ask.depth_params.depth).toBeLessThanOrEqual(2);
      if (switches.shapeSettings) {
        expect(ask.depth_params.depthMode).toBe("adaptive");
        expect(ask.depth_params.scrutiny).toBe(mode === "thorough" && planTier === "premium" ? "deep" : "standard");
        expect(ask.depth_params.answerLength).toBe("standard");
      } else {
        expect(ask.depth_params.depthMode).toBeUndefined();
        expect(ask.depth_params.scrutiny).toBeUndefined();
        expect(ask.depth_params.answerLength).toBe(switches.lengthSettings ? "standard" : undefined);
      }
    }
  });

  it("sends every Free ask as a quick look, whatever was chosen, and keeps a paid plan's choice (owner N13)", () => {
    expect(mod.effectiveDigMode("thorough", "free")).toBe("quick");
    expect(mod.effectiveDigMode("quick", "free")).toBe("quick");
    expect(mod.effectiveDigMode("thorough", "premium")).toBe("thorough");
    expect(mod.v4AskConfig("thorough", "plain", { planTier: "free", shapeSettings: false, lengthSettings: false }, SUBMIT_TIME, {}).depth).toBe(1);
    expect(mod.v4AskConfig("thorough", "plain", { planTier: "premium", shapeSettings: false, lengthSettings: false }, SUBMIT_TIME, {}).depth).toBe(2);
  });

  it("never sends Free a scrutiny other than standard", () => {
    for (const mode of MODES) {
      const config = mod.v4AskConfig(mode, "expert", { planTier: "free", shapeSettings: true, lengthSettings: true }, SUBMIT_TIME, {});
      expect(config.scrutiny).toBe("standard");
    }
  });

  it("picks the answer length from the reading level, only with a shape or length row", () => {
    const settings: Settings = { planTier: "premium", shapeSettings: false, lengthSettings: true };
    expect(mod.v4AskConfig("quick", "plain", settings, SUBMIT_TIME, {}).answer_length).toBe("short");
    expect(mod.v4AskConfig("quick", "background", settings, SUBMIT_TIME, {}).answer_length).toBe("standard");
    expect(mod.v4AskConfig("quick", "expert", settings, SUBMIT_TIME, {}).answer_length).toBe("detailed");
    expect(mod.v4AskConfig("quick", "expert", { ...settings, lengthSettings: false }, SUBMIT_TIME, {}))
      .not.toHaveProperty("answer_length");
  });

  it("sends the settings version back only when the room named one", async () => {
    const settings: Settings = { planTier: "premium", shapeSettings: true, lengthSettings: false };
    expect(mod.v4AskConfig("thorough", "plain", settings, SUBMIT_TIME, {})).not.toHaveProperty("settings_version");
    const config = mod.v4AskConfig("thorough", "plain", { ...settings, settingsVersion: 7 }, SUBMIT_TIME, {});
    expect(config.settings_version).toBe(7);
    const { client, asks } = capturingClient();
    await createDebate("Should the city fund the tram?", config, "cookie-session", client);
    expect(asks[0]?.settings_version).toBe(7);
  });
});

describe("v4RoomQuery", () => {
  it("reads the room for exactly the ask that would be sent", () => {
    expect(mod.v4RoomQuery("quick", "plain", { planTier: "free", shapeSettings: false, lengthSettings: false }))
      .toEqual({ plan_tier: "free", composition_budget_tier: "low", depth: 1 });
    expect(mod.v4RoomQuery("thorough", "expert", { planTier: "premium", shapeSettings: false, lengthSettings: true }))
      .toEqual({ plan_tier: "premium", composition_budget_tier: "low", depth: 2, answer_length: "detailed" });
    expect(mod.v4RoomQuery("thorough", "plain", { planTier: "premium", shapeSettings: true, lengthSettings: false, settingsVersion: 3 }))
      .toEqual({ plan_tier: "premium", composition_budget_tier: "low", depth: 2, depth_mode: "adaptive", scrutiny: "deep", answer_length: "short" });
    expect(mod.v4RoomQuery("thorough", "plain", { planTier: "free", shapeSettings: true, lengthSettings: true }))
      .toEqual({ plan_tier: "free", composition_budget_tier: "low", depth: 1, depth_mode: "adaptive", scrutiny: "standard", answer_length: "short" });
  });
});
