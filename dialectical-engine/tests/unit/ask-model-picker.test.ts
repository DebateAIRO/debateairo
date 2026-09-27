/**
 * A20 — the pure half of ask admission with a model scorecard: what admission
 * hands the picker. Nothing here decides a seat; every row pins how one
 * deployment fact becomes one picker input.
 */
import { describe, expect, it } from "vitest";
import {
  askModelPickerSettings,
  askTargetFacts,
  debaterSeatCount,
  describeModelScorecard,
  expectedCallsByRoleFromBasis,
  reachableInTodaysOrder,
  seatDemandForDebaters,
  targetPricesOf
} from "@debateai/api";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
import { computeStructuralCeilingBasis } from "@debateai/register";
import type { Scorecard } from "@debateai/scorecard";

const CEILING_TERMS = Object.freeze({
  judgeMaxAttempts: 3,
  organMaxAttempts: 3,
  maxRecompose: 1,
  maxCooldownHoldsPerRun: 1,
  finalRetryAttempts: 1,
  branchingFactor: 2,
  compositionSegmentCap: 4,
  fixedOrgansPerComposition: 6,
  reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3,
  evaluatorMaxRounds: 3,
  maxDepth: 5
});

function basis(panelSize: number, depth: number) {
  return computeStructuralCeilingBasis({ ...CEILING_TERMS, panelSize, depth });
}

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({
    provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-09-26T00:00:00.000Z"
  });
}

const TARGETS: readonly ProviderDiscoveryTarget[] = Object.freeze([
  Object.freeze({
    providerRef: "vendor:alpha", maker: "Alpha", baseUrl: "https://api.alpha-vendor-fixture.com/v1",
    model: "alpha-large", inputPriceMicrosPerMillionTokens: 3_000_000, outputPriceMicrosPerMillionTokens: 15_000_000,
    thinkingParameter: "reasoning_effort" as const, thinkingLevels: Object.freeze(["low", "high"]),
    contextWindowTokens: 200_000
  }),
  Object.freeze({
    providerRef: "development:pi-glm-cli", maker: "Z.AI", baseUrl: "http://127.0.0.1:8798/v1", model: "glm-5.3-flash",
    thinkingParameter: "x_thinking_level" as const, thinkingLevels: Object.freeze(["low", "high"]),
    contextWindowTokens: 1_000_000
  }),
  Object.freeze({
    providerRef: "development:grok-cli", maker: "xAI", baseUrl: "http://127.0.0.1:8793/v1", model: "grok-4.7-build"
  })
]);

describe("A20 · expected calls per role come from the admitted structure", () => {
  it.each([
    { panelSize: 1, depth: 1, expected: { POSITION: 1, SUPPORT_ATTACK: 0, CROSS_EXCHANGE: 0, JUDGE: 0, REVIEWER: 0, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } },
    { panelSize: 2, depth: 1, expected: { POSITION: 2, SUPPORT_ATTACK: 4, CROSS_EXCHANGE: 2, JUDGE: 8, REVIEWER: 8, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } },
    { panelSize: 3, depth: 1, expected: { POSITION: 3, SUPPORT_ATTACK: 6, CROSS_EXCHANGE: 6, JUDGE: 30, REVIEWER: 15, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } },
    { panelSize: 3, depth: 2, expected: { POSITION: 3, SUPPORT_ATTACK: 18, CROSS_EXCHANGE: 6, JUDGE: 54, REVIEWER: 27, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 } }
  ])("maps $panelSize debaters at depth $depth", ({ panelSize, depth, expected }) => {
    const admitted = basis(panelSize, depth);
    const calls = expectedCallsByRoleFromBasis(admitted);
    expect(calls).toEqual(expected);
    const sites = admitted.call_sites as { author: number };
    const serveLeg = admitted.serve_leg as { synthesis_loop_sites: number };
    // The split partitions the same tree the run ceiling counts: nothing lost, nothing invented.
    expect(calls.POSITION + calls.SUPPORT_ATTACK + calls.CROSS_EXCHANGE).toBe(sites.author);
    expect(calls.ANSWER_WRITER + calls.ANSWER_CHECKER).toBe(serveLeg.synthesis_loop_sites);
  });

  it("refuses a basis with no call-site split as an engine fault", () => {
    expect(() => expectedCallsByRoleFromBasis({ max_model_attempts: 1 }))
      .toThrowError(expect.objectContaining({ name: "TypedDomainError", code: "ASK_MODEL_ASSIGNMENT_INVALID" }));
  });
});

describe("A20 · seats", () => {
  it("demands a seat per debater in every debate role, and one per answer role", () => {
    expect(seatDemandForDebaters(1)).toEqual({
      POSITION: 1, SUPPORT_ATTACK: 0, CROSS_EXCHANGE: 0, JUDGE: 0, REVIEWER: 0, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
    });
    expect(seatDemandForDebaters(3)).toEqual({
      POSITION: 3, SUPPORT_ATTACK: 3, CROSS_EXCHANGE: 3, JUDGE: 3, REVIEWER: 3, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
    });
  });

  it("seats the plan's number of debaters, capped by the distinct makers reachable", () => {
    const facts = new Map();
    const five = reachableInTodaysOrder([
      member("a", "OpenAI", "m1"), member("b", "Anthropic", "m2"), member("c", "xAI", "m3"),
      member("d", "Google", "m4"), member("e", "Z.AI", "m5")
    ], [], facts);
    const two = reachableInTodaysOrder([
      member("a", "OpenAI", "m1"), member("b", "OpenAI", "m2"), member("c", "Anthropic", "m3")
    ], [], facts);
    expect(debaterSeatCount(five, 3)).toBe(3);
    expect(debaterSeatCount(two, 3)).toBe(2);
    expect(debaterSeatCount([], 3)).toBe(0);
  });
});

describe("A20 · reachable targets keep today's order", () => {
  it("puts the plan roster's members first, in roster order, then every other target in discovery order", () => {
    const discovered = [
      member("vendor:x", "xAI", "grok-4.7-build"),
      member("vendor:b", "Anthropic", "claude-opus-5"),
      member("vendor:a", "OpenAI", "gpt-5.6-sol"),
      member("vendor:a2", "OpenAI", "gpt-5.6-sol"),
      member("development:pi-glm-cli", "Z.AI", "glm-5.3-flash")
    ];
    // The premium roster, read from the contract (pre-flight ruling F22): this row holds before and
    // after A20b moves its grok id, because vendor:x comes third either way.
    const reachable = reachableInTodaysOrder(discovered, PLAN_TIER_ROSTERS.premium, askTargetFacts(TARGETS));
    // The first target serving a roster id is the one today's filter seats; the second stays reachable after it.
    expect(reachable.map((target) => target.providerRef))
      .toEqual(["vendor:a", "vendor:b", "vendor:x", "vendor:a2", "development:pi-glm-cli"]);
    expect(reachable.find((target) => target.providerRef === "development:pi-glm-cli")).toEqual({
      providerRef: "development:pi-glm-cli", maker: "Z.AI", modelId: "glm-5.3-flash",
      thinkingLevels: ["low", "high"], contextWindowTokens: 1_000_000
    });
    // A target the deployment declares nothing for can set no level and has no declared window.
    expect(reachable.find((target) => target.providerRef === "vendor:x"))
      .toMatchObject({ thinkingLevels: [], contextWindowTokens: null });
  });
});

describe("A20 · deployment facts", () => {
  it("reads each target's levels, window and configured price, and keys prices by provider ref", () => {
    const facts = askTargetFacts(TARGETS);
    expect(facts.get("vendor:alpha")).toEqual({
      thinkingLevels: ["low", "high"], contextWindowTokens: 200_000,
      price: { inputMicrosPerMTok: 3_000_000, outputMicrosPerMTok: 15_000_000 }
    });
    expect(facts.get("development:grok-cli")).toEqual({ thinkingLevels: [], contextWindowTokens: null, price: null });
    expect([...targetPricesOf(facts)]).toEqual([
      ["vendor:alpha", { inputMicrosPerMTok: 3_000_000, outputMicrosPerMTok: 15_000_000 }]
    ]);
  });

  it("builds HOSTED settings with the per-run ceiling, and LOCAL settings without one", () => {
    const absent = Object.freeze({ state: "ABSENT" as const });
    expect(askModelPickerSettings({
      scorecard: absent, deploymentMode: "hosted", targets: TARGETS, perRunCeilingMicros: 250_000
    })).toMatchObject({ mode: "HOSTED", perRunCeilingMicros: 250_000 });
    expect(askModelPickerSettings({
      scorecard: absent, deploymentMode: "local", targets: TARGETS, perRunCeilingMicros: 250_000
    })).toMatchObject({ mode: "LOCAL", perRunCeilingMicros: null });
  });

  it("says in one line which scorecard the deployment runs", () => {
    const scorecard = Object.freeze({ scorecardVersion: 4 }) as unknown as Scorecard;
    expect(describeModelScorecard({ state: "VALID", scorecard, sourceRef: "x" }, "local"))
      .toBe("MODEL_SCORECARD state=VALID scorecard_version=4 source=bundled-file");
    expect(describeModelScorecard({ state: "ABSENT" }, "hosted"))
      .toBe("MODEL_SCORECARD state=ABSENT source=register (asks keep the plan rosters)");
    expect(describeModelScorecard({ state: "REFUSED", reason: "ENGINE_INCOMPATIBLE", detail: "long text" }, "hosted"))
      .toBe("MODEL_SCORECARD state=REFUSED reason=ENGINE_INCOMPATIBLE source=register (asks keep the plan rosters)");
  });
});
