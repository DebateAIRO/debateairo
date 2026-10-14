import type { AskRequest, ContractClient } from "@debateai/contract";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- the root test compiler has no JSX mode; Vitest transpiles this TSX module.
import { buildNewDebateAskConfig, fixedDepthAllowedFor } from "../../apps/ui/app/new/defaults.js";
import { createDebate } from "../../apps/ui/lib/api.js";

/**
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): the page's three choices travel in the
 * ask, inside depth_params, as INTERFACE §2 names them. A config without them sends today's ask.
 */

const SUBMIT_TIME = new Date("2026-10-12T10:00:00.000Z");
const BASE = {
  riskTier: "standard", budgetTier: "low", decisionScope: "shape wire", asOf: "2026-10-12T09:00:00.000Z",
  depth: 2, asOfWasEdited: false, planTier: "premium"
} as const;

function capturingClient(): { client: ContractClient; asks: AskRequest[] } {
  const asks: AskRequest[] = [];
  const client = { submitAsk: async (ask: AskRequest) => { asks.push(ask); return { run_ref: "run:shape", status: "QUEUED" }; } };
  return { client: client as unknown as ContractClient, asks };
}

describe("debate shape P2c — the ask carries depth mode, scrutiny and answer length", () => {
  it("puts the chosen values in the config under snake-case keys, and nothing when none was chosen", () => {
    expect(buildNewDebateAskConfig({ ...BASE, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }, SUBMIT_TIME))
      .toMatchObject({ depth: 2, depth_mode: "fixed", scrutiny: "deep", answer_length: "detailed" });
    const plain = buildNewDebateAskConfig(BASE, SUBMIT_TIME);
    for (const key of ["depth_mode", "scrutiny", "answer_length"]) expect(plain).not.toHaveProperty(key);
  });

  it("puts depth mode, scrutiny and answer length into depth_params on the wire", async () => {
    const { client, asks } = capturingClient();
    const config = buildNewDebateAskConfig({ ...BASE, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" }, SUBMIT_TIME);
    await createDebate("Should the city fund the tram?", config, "test-token", client);
    expect(asks[0]?.depth_params).toEqual({ depth: 2, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "short" });
  });

  it("sends today's depth_params when the config carries none of them (older callers)", async () => {
    const { client, asks } = capturingClient();
    await createDebate("Should the city fund the tram?", buildNewDebateAskConfig(BASE, SUBMIT_TIME), "test-token", client);
    expect(asks[0]?.depth_params).toEqual({ depth: 2 });
  });

  it("refuses a value the contract does not offer, before any network call", async () => {
    const { client, asks } = capturingClient();
    const config = { ...buildNewDebateAskConfig(BASE, SUBMIT_TIME), scrutiny: "infinite" };
    await expect(createDebate("Should we?", config, "test-token", client)).rejects.toThrow("ASK_FIELD_REQUIRED: scrutiny");
    const retired = { ...buildNewDebateAskConfig(BASE, SUBMIT_TIME), depth_mode: "recommended" };
    await expect(createDebate("Should we?", retired, "test-token", client)).rejects.toThrow("ASK_FIELD_REQUIRED: depth_mode");
    expect(asks).toEqual([]);
  });

  it("offers Fixed only where the plan allows it (S6)", () => {
    expect(fixedDepthAllowedFor("free")).toBe(false);
    expect(fixedDepthAllowedFor("premium")).toBe(true);
  });
});
