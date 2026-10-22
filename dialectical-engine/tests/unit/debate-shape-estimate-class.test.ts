import { describe, expect, it } from "vitest";
import { RecentRunsCostEstimator, settingsClassKey, waitingShapeClassOf, type RunSettingsClass } from "@debateai/budget";
import type { AskRequest } from "@debateai/contract";
import type { WaitingRun } from "@debateai/db";
import { runSettingsClassOfAsk, settingsClassOfWaitingRun } from "../../apps/api/src/ask-room.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

const BASE: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 });
const PRO = Object.freeze({ plan: "pro", depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } as const);
const waiting = (extra: Partial<WaitingRun> = {}): WaitingRun => Object.freeze({
  runId: "00000000-0000-4000-8000-000000000001", waitingSince: new Date(0), releaseKey: TEST_RELEASE_KEY, ownerRef: null, legacyAskerId: "legacy:a",
  planTier: "premium", compositionBudgetTier: "low", depth: 2, makerCount: 5, waitsFor: null, personRecheckAt: null, reasonAt: null, ...extra });
const ask = (depthParams: AskRequest["depth_params"]): Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params"> =>
  Object.freeze({ plan_tier: "premium", composition_budget_tier: "low", depth_params: depthParams });

describe("the history estimate's class learns the debate shape (spec 2026-10-12 §3.6)", () => {
  it("today's class key is unchanged; a shaped class keys its plan and settings", () => {
    expect(settingsClassKey(BASE)).toBe("free|low|2|1");
    expect(settingsClassKey({ ...BASE, planTier: "premium", makerCount: 5, depth: 2, shape: PRO })).toBe("premium|low|5|2|pro|fixed|deep|detailed");
    expect(() => settingsClassKey({ ...BASE, shape: { ...PRO, scrutiny: "max" as never } })).toThrow("COST_ESTIMATE_SETTINGS_INVALID");
  });
  it("estimates two shapes of one depth apart (separate samples, separate cache entries)", async () => {
    const asked: RunSettingsClass[] = [];
    const estimator = new RecentRunsCostEstimator({
      source: { readRecentRunUsage: async ({ settings }) => { asked.push(settings); return []; } },
      prices: new Map([["p", { inputMicrosPerMillionTokens: 1, outputMicrosPerMillionTokens: 1 }]]),
      maximumMicros: 500, clock: () => new Date(0)
    });
    await estimator.estimateMicros(BASE);
    await estimator.estimateMicros({ ...BASE, shape: { ...PRO, plan: "free", depthMode: "adaptive", scrutiny: "standard" } });
    expect(asked).toHaveLength(2);
    expect("shape" in asked[0]!).toBe(false);
  });
  it("a waiting run's stored shape is read the careful way and never throws", () => {
    expect(waitingShapeClassOf(null, "premium")).toBeNull();
    expect(waitingShapeClassOf(undefined, "premium")).toBeNull();
    expect(waitingShapeClassOf({ depthMode: "fixed", scrutiny: "deep", answerLength: "detailed", plan: "pro" }, "premium")).toEqual(PRO);
    expect(waitingShapeClassOf({ depthMode: "adaptive", scrutiny: "standard", answerLength: "short", plan: null }, "free"))
      .toEqual({ plan: "free", depthMode: "adaptive", scrutiny: "standard", answerLength: "short" });
    expect(waitingShapeClassOf({ depthMode: "sideways", scrutiny: 7, answerLength: null, plan: "gold" }, "free"))
      .toEqual({ plan: "max", depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" });
    for (const odd of ["text", 3, [], true]) expect(() => waitingShapeClassOf(odd, "free")).not.toThrow();
  });
  it("the ask's class carries the shape only for a shaped ask; a waiting run's only when it has one", () => {
    expect(runSettingsClassOfAsk(ask({ depth: 2 }))).not.toHaveProperty("shape");
    expect(runSettingsClassOfAsk(ask({ depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" }), undefined, "pro").shape).toEqual(PRO);
    expect(runSettingsClassOfAsk(ask({ depth: 2, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" })).shape?.plan).toBe("premium");
    expect(settingsClassOfWaitingRun(waiting())).toEqual({ planTier: "premium", compositionBudgetTier: "low", makerCount: 5, depth: 2 });
    expect(settingsClassOfWaitingRun(waiting({ shapeSettings: { depthMode: "fixed", scrutiny: "deep", answerLength: "detailed", plan: "pro" } })).shape).toEqual(PRO);
  });
});
