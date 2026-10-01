import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { assertRunCeilingCoversOneCall, projectedCallCeilingMicros } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { Judge, firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  OpenAICompatibleProviderGateway,
  lengthRetryTokenCeiling,
  type ProviderCostEnvelopeSeam,
  type ProviderDiscoveryTarget,
  type ProviderGateway
} from "@debateai/providers";
import { readJudgeTokenCeiling } from "@debateai/register";
import { ASK_QUESTION_MAX_BYTES } from "../../apps/api/src/index.js";

/**
 * B9d (budget spec §2.10) — A LIMIT BELOW ONE CALL REFUSES THE BOOT, NOT A PERSON'S DEBATE.
 * The hosted runner and API refuse to boot when the arguing ceiling (`costEnvelopeCeilings(...).bodyMicros`)
 * is below the projected cost of the first position's own call: framed by the real judge framer for a
 * question of the largest size an ask may carry, made of the character whose encoding grows most, at the
 * judge bound's max_tokens and at the cheapest price among each plan's models — every plan's cheapest must
 * fit, because a run's makers are its plan's roster and its first call moves only among them. Only under the
 * costEnvelopePolicy row's three new members.
 */

function target(providerRef: string, model: string, input: number | null, output: number | null): ProviderDiscoveryTarget {
  return Object.freeze({
    providerRef, maker: `maker:${providerRef}`, baseUrl: "https://vendor.invalid/v1", model,
    ...(input === null || output === null ? {} : {
      inputPriceMicrosPerMillionTokens: input, outputPriceMicrosPerMillionTokens: output
    })
  });
}

/** One configured target per model on a plan's roster, the n-th priced n times the base price. */
function rosterTargets(tier: keyof typeof PLAN_TIER_ROSTERS, input: number, output: number): readonly ProviderDiscoveryTarget[] {
  return PLAN_TIER_ROSTERS[tier].map((model, index) =>
    target(`provider:${tier}:${String(index)}`, model, input * (index + 1), output * (index + 1)));
}

const TOKEN_CEILING = 2_048;

/** Every model on both rosters, the Free plan's cheap and the premium plan's dear, and one model on no roster. */
const EVERY_TARGET: readonly ProviderDiscoveryTarget[] = Object.freeze([
  ...rosterTargets("free", 1_000_000, 5_000_000),
  ...rosterTargets("premium", 5_000_000, 25_000_000),
  target("provider:support", "support-model", 100_000, 100_000)
]);

describe("B9d · the first position's own call, priced at its largest", () => {
  it("is never below what the gateway itself measures for the largest question an ask may carry", async () => {
    // The REAL gateway measures its own body and hands the seam that measure; the seam records it and refuses,
    // so nothing is sent. A member the gateway's body gains tomorrow is measured here too.
    const measured: { requestBytes: number; completionTokenCeiling: number }[] = [];
    const seam: ProviderCostEnvelopeSeam = {
      assertCallAllowed: (projection) => {
        measured.push({ ...projection });
        throw new TypedDomainError("TEST_CAPTURED", "captured");
      },
      recordCall: () => undefined,
      assertUsageReported: () => undefined
    };
    const inner = new OpenAICompatibleProviderGateway({
      endpoint: "https://vendor.invalid/v1", model: "vendor/model-a", maker: "maker:provider:a",
      fetchImplementation: async () => { throw new Error("TEST_NOTHING_IS_SENT"); },
      sleepImplementation: async () => undefined,
      persistRawArtifact: async (artifact) => artifact.artifactId,
      appendLedgerEntry: async () => "ledger:b9d",
      assertNoOpenWriteTransaction: () => undefined
    });
    const gateway: ProviderGateway = { call: (request) => inner.call({ ...request, costEnvelope: seam }) };
    // A C0 control character: 1 UTF-8 byte the ask accepts, `\u0001` (6 bytes) in the material block, `\\u0001`
    // (7 bytes) in the body. No character grows more per byte an ask is counted in.
    const question = "\u0001".repeat(askQuestionMaxBytes());
    await expect(new Judge(gateway).judge({
      runId: "run-b9d", subjectItemId: "work-b9d", callSiteKey: "JUDGE", questionLine: question,
      leg: { kind: "primary-root" }, providerRef: "provider:a", contractHash: "c".repeat(64),
      bound: { maxAttempts: 1, tokenCeiling: TOKEN_CEILING, deadlineMs: 1_000 }
    })).rejects.toMatchObject({ code: "TEST_CAPTURED" });
    expect(measured).toHaveLength(1);

    const [projection] = firstPositionCallProjections({
      targets: [target("provider:a", "vendor/model-a", 3_000_000, 15_000_000)],
      judgeTokenCeiling: TOKEN_CEILING,
      questionMaxBytes: askQuestionMaxBytes()
    });
    // Both claim-type variants are framed and the larger kept, so never below what the gateway measured.
    expect(projection!.requestBytes).toBeGreaterThanOrEqual(measured[0]!.requestBytes);
    expect(projection!.requestBytes - measured[0]!.requestBytes).toBeLessThan(200);
    expect(projection!.completionTokenCeiling).toBe(measured[0]!.completionTokenCeiling);
    expect(projection!.completionTokenCeiling).toBe(lengthRetryTokenCeiling(TOKEN_CEILING, 0));
    expect(projection!.requestBytes).toBeGreaterThan(7 * askQuestionMaxBytes());
  });

  it("prices every configured target that has a price, names its model, and skips one that has none", () => {
    const projections = firstPositionCallProjections({
      targets: [target("provider:a", "a", 3_000_000, 15_000_000), target("provider:local", "l", null, null)],
      judgeTokenCeiling: TOKEN_CEILING,
      questionMaxBytes: askQuestionMaxBytes()
    });
    expect(projections.map((entry) => [entry.providerRef, entry.model])).toEqual([["provider:a", "a"]]);
  });

  it("uses the API's own question bound, from one source", () => {
    expect(askQuestionMaxBytes()).toBe(8_192);
    expect(ASK_QUESTION_MAX_BYTES).toBe(askQuestionMaxBytes());
  });
});

describe("B9d · the first calls, one group per plan", () => {
  const projections = firstPositionCallProjections({
    targets: EVERY_TARGET, judgeTokenCeiling: TOKEN_CEILING, questionMaxBytes: askQuestionMaxBytes()
  });

  it("groups each plan's own models, and a model on no roster in none", () => {
    expect(firstCallsByPlanRoster({ projections, rosters: PLAN_TIER_ROSTERS })
      .map((group) => group.map((call) => call.providerRef))).toEqual([
      PLAN_TIER_ROSTERS.free.map((_, index) => `provider:free:${String(index)}`),
      PLAN_TIER_ROSTERS.premium.map((_, index) => `provider:premium:${String(index)}`)
    ]);
  });

  it("leaves out a plan with only part of its roster configured: the API refuses every ask on it", () => {
    const missing = PLAN_TIER_ROSTERS.premium[PLAN_TIER_ROSTERS.premium.length - 1]!;
    expect(firstCallsByPlanRoster({ projections: projections.filter((call) => call.model !== missing), rosters: PLAN_TIER_ROSTERS })
      .map((group) => group.map((call) => call.model))).toEqual([[...PLAN_TIER_ROSTERS.free]]);
  });
});

describe("B9d · assertRunCeilingCoversOneCall", () => {
  const projections = firstPositionCallProjections({
    targets: EVERY_TARGET, judgeTokenCeiling: TOKEN_CEILING, questionMaxBytes: askQuestionMaxBytes()
  });
  const groups = firstCallsByPlanRoster({ projections, rosters: PLAN_TIER_ROSTERS });
  const cost = (providerRef: string): number => {
    const call = projections.find((entry) => entry.providerRef === providerRef)!;
    return projectedCallCeilingMicros(call.price, call);
  };
  const freeCheapest = cost("provider:free:0");
  const premiumCheapest = cost("provider:premium:0");

  it("admits a ceiling exactly equal to the dearest plan's cheapest first call, and refuses one micro-unit below it", () => {
    expect(premiumCheapest).toBeGreaterThan(freeCheapest);
    expect(cost("provider:premium:1")).toBeGreaterThan(premiumCheapest);
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: premiumCheapest, firstCallsByRoster: groups })).not.toThrow();
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: premiumCheapest - 1, firstCallsByRoster: groups }))
      .toThrowError(expect.objectContaining({ code: "RUN_CEILING_BELOW_ONE_CALL" }));
  });

  it("refuses a ceiling that fits the Free plan's cheapest first call but not the premium plan's", () => {
    // A cheap Free model must never let the boot pass while a paying person's first call cannot fit.
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: freeCheapest, firstCallsByRoster: groups }))
      .toThrowError(expect.objectContaining({ code: "RUN_CEILING_BELOW_ONE_CALL" }));
    // The same ceiling fits a site that configures the Free plan's roster alone.
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: freeCheapest, firstCallsByRoster: [groups[0]!] })).not.toThrow();
  });

  it("does not let a plan with only part of its roster configured take part", () => {
    const missing = PLAN_TIER_ROSTERS.premium[PLAN_TIER_ROSTERS.premium.length - 1]!;
    const partial = firstCallsByPlanRoster({
      projections: projections.filter((call) => call.model !== missing), rosters: PLAN_TIER_ROSTERS
    });
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: freeCheapest, firstCallsByRoster: partial })).not.toThrow();
  });

  it("has nothing to refuse when no plan is wholly configured", () => {
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: 0, firstCallsByRoster: [] })).not.toThrow();
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: 0, firstCallsByRoster: [[]] })).not.toThrow();
  });

  it("names no figure in its message", () => {
    try {
      assertRunCeilingCoversOneCall({ bodyCeilingMicros: 0, firstCallsByRoster: groups });
      throw new Error("expected a refusal");
    } catch (error) {
      expect((error as TypedDomainError).code).toBe("RUN_CEILING_BELOW_ONE_CALL");
      expect((error as Error).message).not.toMatch(/\d/u);
    }
  });
});

describe("B9d · readJudgeTokenCeiling", () => {
  const poolWith = (value: unknown): Pool => ({
    query: async () => ({ rows: value === undefined ? [] : [{ value_json: value }] })
  }) as unknown as Pool;

  it("reads the judge bound's max_tokens from acceptanceOrganCostBounds", async () => {
    await expect(readJudgeTokenCeiling(poolWith({
      kind: "ACCEPTANCE_ORGAN_COST_BOUNDS",
      organs: {
        JUDGE: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 180_000 },
        COMPOSER: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 60_000 },
        CONFORMANCE: { maxAttempts: 3, tokenCeiling: 2_048, deadlineMs: 60_000 }
      }
    }), 1)).resolves.toBe(2_048);
  });

  it("refuses a register without it", async () => {
    await expect(readJudgeTokenCeiling(poolWith(undefined), 1))
      .rejects.toThrowError(expect.objectContaining({ code: "STRUCTURAL_CEILING_INPUTS_UNRESOLVED" }));
  });
});

describe("B9d · both hosted boots run the check, under the new settings only", () => {
  it("the runner, beside the guard it builds, only with the band, one group per plan", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    expect(main).toContain("if (costEnvelopePolicy !== null && envelopeBand !== null) {");
    expect(main).toContain("assertRunCeilingCoversOneCall({");
    expect(main).toContain("bodyCeilingMicros: costEnvelopeCeilings(costEnvelopePolicy).bodyMicros,");
    expect(main).toContain("firstCallsByRoster: firstCallsByPlanRoster({");
    expect(main).toContain("judgeTokenCeiling: policy.bounds.JUDGE.tokenCeiling,");
    expect(main).toContain("questionMaxBytes: askQuestionMaxBytes()");
    expect(main).toContain("rosters: PLAN_TIER_ROSTERS");
  });

  it("the API, after its provider targets are read, over the policy row its boot already read, one group per plan", async () => {
    const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const stage = main.indexOf("boot.run(\"run-ceiling-covers-one-call\"");
    expect(stage).toBeGreaterThan(main.indexOf("boot.runSync(\"provider-targets\""));
    expect(stage).toBeGreaterThan(main.indexOf("const costEnvelopeRows ="));
    expect(main).toContain("if (costEnvelopeRows === undefined || costEnvelopeBand(costEnvelopeRows.runPolicy) === null) return;");
    expect(main).toContain("bodyCeilingMicros: costEnvelopeCeilings(costEnvelopeRows.runPolicy).bodyMicros,");
    expect(main).toContain("firstCallsByRoster: firstCallsByPlanRoster({");
    expect(main).toContain("judgeTokenCeiling: await readJudgeTokenCeiling(pool, environment.REGISTER_VERSION),");
    expect(main).toContain("rosters: PLAN_TIER_ROSTERS");
  });
});
