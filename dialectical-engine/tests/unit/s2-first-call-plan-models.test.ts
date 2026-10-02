/**
 * Paid plans S2 (B9d's hand-off, D4 Hand-off 5) — THE BOOT CHECK PRICES THE
 * GROUPS THE PICKER SEATS FROM. With a VALID model scorecard in force, ask
 * admission hands the picker each plan's roster members first and then every
 * other healthy discovered target (`reachableInTodaysOrder`), and a roster member
 * that is not configured refuses nothing, so each plan's first calls are those of
 * every configured, priced model. Without one, the plan rosters, exactly as B9d.
 */
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertRunCeilingCoversOneCall, projectedCallCeilingMicros } from "@debateai/budget";
import { PLAN_TIER_ROSTERS, askQuestionMaxBytes } from "@debateai/contract";
import { firstCallsByPlanRoster, firstPositionCallProjections } from "@debateai/judgement";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
import { firstCallPlanModels } from "@debateai/scorecard";

const TOKEN_CEILING = 2_048;

function target(providerRef: string, model: string, input: number, output: number): ProviderDiscoveryTarget {
  return Object.freeze({
    providerRef, maker: `maker:${providerRef}`, baseUrl: "https://vendor.invalid/v1", model,
    inputPriceMicrosPerMillionTokens: input, outputPriceMicrosPerMillionTokens: output
  });
}

/** The Free roster configured at a middling price, no premium model at all, and one cheap model on no roster. */
const SITE: readonly ProviderDiscoveryTarget[] = Object.freeze([
  ...PLAN_TIER_ROSTERS.free.map((model, index) => target(`provider:free:${String(index)}`, model, 5_000_000, 25_000_000)),
  target("provider:off-roster", "off-roster-model", 100_000, 500_000)
]);

const projectionsOf = (targets: readonly ProviderDiscoveryTarget[]) =>
  firstPositionCallProjections({ targets, judgeTokenCeiling: TOKEN_CEILING, questionMaxBytes: askQuestionMaxBytes() });

/** The groups both boots hand the check while a VALID scorecard is in force. */
const pickerGroups = (projections: ReturnType<typeof projectionsOf>) => firstCallsByPlanRoster({
  projections,
  rosters: firstCallPlanModels({
    scorecardInForce: true,
    rosters: PLAN_TIER_ROSTERS,
    models: projections.map((call) => call.model)
  })
});

describe("S2 · firstCallPlanModels", () => {
  it("hands back the plan rosters themselves when no scorecard is in force", () => {
    expect(firstCallPlanModels({ scorecardInForce: false, rosters: PLAN_TIER_ROSTERS, models: ["off-roster-model"] }))
      .toBe(PLAN_TIER_ROSTERS);
  });

  it("with a scorecard in force, lists every configured model once for every plan, the plan's own roster first", () => {
    const [firstFree, secondFree] = PLAN_TIER_ROSTERS.free;
    const lists = firstCallPlanModels({
      scorecardInForce: true,
      rosters: PLAN_TIER_ROSTERS,
      models: ["off-roster-model", secondFree!, firstFree!, "off-roster-model"]
    });
    expect(Object.keys(lists)).toEqual(Object.keys(PLAN_TIER_ROSTERS));
    expect(lists.free).toEqual([firstFree, secondFree, "off-roster-model"]);
    // No premium model is configured: every configured model in the order given, never one nobody configured.
    expect(lists.premium).toEqual(["off-roster-model", secondFree, firstFree]);
  });
});

describe("S2 · with a scorecard in force the check prices every model the picker can seat", () => {
  const projections = projectionsOf(SITE);
  const cost = (providerRef: string): number => {
    const call = projections.find((entry) => entry.providerRef === providerRef)!;
    return projectedCallCeilingMicros(call.price, call);
  };
  const offRoster = cost("provider:off-roster");

  it("passes a ceiling that holds the cheap model on no roster, which the rosters alone would refuse", () => {
    expect(offRoster).toBeLessThan(cost("provider:free:0"));
    const byRoster = firstCallsByPlanRoster({ projections, rosters: PLAN_TIER_ROSTERS });
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: offRoster, firstCallsByRoster: byRoster }))
      .toThrowError(expect.objectContaining({ code: "RUN_CEILING_BELOW_ONE_CALL" }));
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: offRoster, firstCallsByRoster: pickerGroups(projections) }))
      .not.toThrow();
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: offRoster - 1, firstCallsByRoster: pickerGroups(projections) }))
      .toThrowError(expect.objectContaining({ code: "RUN_CEILING_BELOW_ONE_CALL" }));
  });

  it("checks a site whose only priced model is on no roster, which the rosters alone leave unchecked", () => {
    const lone = projectionsOf([target("provider:off-roster", "off-roster-model", 100_000, 500_000)]);
    expect(firstCallsByPlanRoster({ projections: lone, rosters: PLAN_TIER_ROSTERS })).toEqual([]);
    expect(() => assertRunCeilingCoversOneCall({ bodyCeilingMicros: 0, firstCallsByRoster: pickerGroups(lone) }))
      .toThrowError(expect.objectContaining({ code: "RUN_CEILING_BELOW_ONE_CALL" }));
  });

  it("has nothing to check when no model is priced", () => {
    expect(pickerGroups([])).toEqual([]);
  });
});

describe("S2 · both hosted boots hand the check the picker's lists", () => {
  it("the API, directly below the picker it composed, asking that picker's scorecard", async () => {
    const main = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    const picker = main.indexOf("const modelPicker = await composeAskModelPicker({");
    const stage = main.indexOf("boot.run(\"run-ceiling-covers-one-call\"");
    expect(picker).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(picker);
    expect(main.indexOf("scorecardInForce: modelPicker.scorecard.state === \"VALID\",")).toBeGreaterThan(stage);
    expect(main).toContain("rosters: firstCallPlanModels({");
    expect(main).toContain("models: firstCalls.map((call) => call.model)");
  });

  it("the runner, asking the sealed scorecard row at its own register version", async () => {
    const main = await readFile(new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8");
    const block = main.indexOf("if (costEnvelopePolicy !== null && envelopeBand !== null) {");
    expect(block).toBeGreaterThan(-1);
    expect(main.indexOf(
      "scorecardInForce: (await readModelScorecard(pool, environment.REGISTER_VERSION, await readEngineVersion())).state === \"VALID\","
    )).toBeGreaterThan(block);
    expect(main).toContain("rosters: firstCallPlanModels({");
    expect(main).toContain("models: firstCalls.map((call) => call.model)");
  });
});
