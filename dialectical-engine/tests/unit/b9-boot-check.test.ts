import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { assertRunCeilingCoversOneCall, projectedCallCeilingMicros } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { Judge, firstCallsByPlanRoster, firstPositionCallProjections, framedJudgePromptForTest } from "@debateai/judgement";
import { TypedDomainError, questionLanguageForBounds } from "@debateai/kernel";
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

  it("PF-L38: with the shape row in force it also frames the longest lock and keeps the larger; without, today's number", () => {
    const input = {
      targets: [target("provider:a", "vendor/model-a", 3_000_000, 15_000_000), target("provider:b", "vendor/model-b", 1_000_000, 5_000_000)],
      judgeTokenCeiling: TOKEN_CEILING,
      questionMaxBytes: askQuestionMaxBytes()
    };
    const today = firstPositionCallProjections(input);
    expect(firstPositionCallProjections({ ...input, questionLanguageLocked: false })).toEqual(today);
    const locked = firstPositionCallProjections({ ...input, questionLanguageLocked: true });
    expect(locked).toHaveLength(today.length);
    const question = "\u0001".repeat(askQuestionMaxBytes());
    for (const [index, projection] of locked.entries()) {
      expect(projection.requestBytes).toBeGreaterThan(today[index]!.requestBytes);
      expect(projection.completionTokenCeiling).toBe(today[index]!.completionTokenCeiling);
      for (const claim of ["unknown", "resolved"] as const) {
        const packet = framedJudgePromptForTest({ kind: "primary-root" }, question, undefined, claim, questionLanguageForBounds()).packet;
        expect(projection.requestBytes).toBeGreaterThanOrEqual(Buffer.byteLength(JSON.stringify({
          model: projection.model, max_tokens: projection.completionTokenCeiling, messages: packet.messages
        }), "utf8"));
      }
    }
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
    // Side-by-side spec §13: the check is the one per-version settings loader's (apps/runner/src/run-settings.ts), over
    // the version's own per-run ceiling and the site's day and band, and main.ts boots through that loader with the
    // site's money row and band, which it reads first.
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    const loader = await readFile(new URL("../../apps/runner/src/run-settings.ts", import.meta.url), "utf8");
    // S6: the version's envelope is composed once (hosted), for this check and the version's money guard; the check
    // still runs only with the site's band.
    expect(loader).toContain("if (debateEnvelope !== null && envelopeBand !== null) {");
    expect(loader).toContain("assertRunCeilingCoversOneCall({");
    expect(loader).toContain("const debateEnvelope = siteCostEnvelopePolicy === null\n    ? null\n    : composeDebateCostEnvelope(siteCostEnvelopePolicy, await readCostEnvelopePolicy(pool, version));");
    expect(loader).toContain("bodyCeilingMicros: costEnvelopeCeilings(debateEnvelope).bodyMicros,");
    expect(loader).toContain("firstCallsByRoster: firstCallsByPlanRoster({");
    expect(loader).toContain("judgeTokenCeiling: policy.bounds.JUDGE.tokenCeiling,");
    expect(loader).toContain("questionMaxBytes: askQuestionMaxBytes()");
    expect(loader).toContain("rosters: PLAN_TIER_ROSTERS");
    // Ruling L-B9R (P2L Task 17): the runner prices the longest lock whenever ANY debateShapePolicy row is present
    // (`debateShape`, read raw before this check: enabled false too); no row, today's price.
    expect(loader).toContain("questionLanguageLocked: debateShape !== null");
    expect(loader.indexOf("questionLanguageLocked: debateShape !== null")).toBeGreaterThan(loader.indexOf("const debateShape = await readDebateShapeRunnerSettings("));
    expect(loader.indexOf("const debateShape = await readDebateShapeRunnerSettings(")).toBeGreaterThan(-1);
    // main.ts hands the loader the site's row and band (read before it), and no longer runs the check inline.
    expect(main).toContain("siteCostEnvelopePolicy: costEnvelopePolicy,");
    expect(main).not.toContain("assertRunCeilingCoversOneCall(");
    expect(main.indexOf("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);"))
      .toBeGreaterThan(main.indexOf("const envelopeBand = costEnvelopePolicy === null ? null : costEnvelopeBand(costEnvelopePolicy);"));
  });

  it("the API, after its provider targets are read, over the policy row its boot already read, one group per plan", async () => {
    // Side-by-side spec §13 (S9): the check is the API's one per-version admission loader's
    // (apps/api/src/admission-settings.ts), over the version's own per-run ceiling and the site's day and band, and
    // main.ts loads the site version through it after its provider targets and its site money row are read.
    const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const loader = await readFile(new URL("../../apps/api/src/admission-settings.ts", import.meta.url), "utf8");
    const load = main.indexOf("const siteAdmission = await loadAdmissionSettings(");
    // Task 6 concern 4: each marker named below exists (an indexOf of -1 would pass every "after" check).
    for (const marker of ["boot.runSync(\"provider-targets\"", "const siteCostEnvelopePolicy =", "const siteAdmission = await loadAdmissionSettings("]) {
      expect(main.indexOf(marker), marker).toBeGreaterThanOrEqual(0);
    }
    expect(load).toBeGreaterThan(main.indexOf("boot.runSync(\"provider-targets\""));
    expect(load).toBeGreaterThan(main.indexOf("const siteCostEnvelopePolicy ="));
    expect(main).not.toContain("assertRunCeilingCoversOneCall(");
    const stage = loader.indexOf("await run(\"run-ceiling-covers-one-call\"");
    for (const marker of ["await run(\"run-ceiling-covers-one-call\"", "await run(\"length-guidance-policy\"",
      "const debateShapeInForcePolicy =", "const costEnvelope = money?.costEnvelope ?? null;"]) {
      expect(loader.indexOf(marker), marker).toBeGreaterThanOrEqual(0);
    }
    expect(stage).toBeGreaterThan(loader.indexOf("const costEnvelope = money?.costEnvelope ?? null;"));
    expect(loader).toContain("composeDebateCostEnvelope(siteEnvelope.runPolicy, await readers.readCostEnvelopePolicy(pool, version))");
    expect(loader).toContain("const siteBand = siteEnvelope?.band ?? null;");
    expect(loader).toContain("if (costEnvelope === null || siteBand === null) return;");
    expect(loader).toContain("bodyCeilingMicros: costEnvelopeCeilings(costEnvelope.runPolicy).bodyMicros,");
    expect(loader).toContain("firstCallsByRoster: firstCallsByPlanRoster({");
    // LG-C Task 6 (spec 2026-10-15 §3.3): the first call is checked at the largest guided opening allowance, over the
    // length row the loader read before this stage, at the version loaded.
    expect(loader).toContain(
      "judgeTokenCeiling: lengthGuidedFirstCallCeiling(await readers.readJudgeTokenCeiling(pool, version), lengthGuidancePolicy),");
    expect(stage).toBeGreaterThan(loader.indexOf("await run(\"length-guidance-policy\""));
    expect(loader).toContain("rosters: PLAN_TIER_ROSTERS");
    // PF-L38: the lock is priced only with the debate-shape row in force (read before this stage).
    expect(loader).toContain("questionLanguageLocked: debateShapeInForcePolicy !== null");
    expect(stage).toBeGreaterThan(loader.indexOf("const debateShapeInForcePolicy ="));
  });

  it("neither the API's main.ts nor the practice ask prices the first call itself: both load through the one loader (S9)", async () => {
    for (const file of ["apps/api/src/main.ts", "tools/preview-practice/practice-ask-composition.ts"]) {
      const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toContain("firstPositionCallProjections(");
      expect(source, file).not.toContain("lengthed:");
      expect(source, file).toContain("loadAdmissionSettings(pool, environment.REGISTER_VERSION, admissionSite");
    }
  });

  // Task 12 review 1: the first-call checks (the API's admission loader, which the practice ask shares, and the hosted
  // publish) frame the lengthed variant exactly when they price the guided opening: one `lengthed:` line inside each
  // one's firstPositionCallProjections call.
  it.each([
    // Side-by-side spec §13 (S9): the API's check (and so the practice ask's, which composes through the same loader)
    // is the admission loader's.
    ["apps/api/src/admission-settings.ts", "lengthed: lengthGuidancePolicy !== null"],
    ["apps/runner/src/hosted-register-publish.ts", "lengthed: lengthGuidance !== null"]
  ])("%s frames the first call lengthed with the row", async (file, line) => {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    const start = source.indexOf("const firstCalls = firstPositionCallProjections({");
    expect(start).toBeGreaterThanOrEqual(0);
    const call = source.slice(start, source.indexOf("});", start));
    expect(call.split(line).length - 1).toBe(1);
    expect(call).toContain("judgeTokenCeiling: lengthGuidedFirstCallCeiling(");
    expect(source.split("lengthed:").length - 1).toBe(1);
  });
});
