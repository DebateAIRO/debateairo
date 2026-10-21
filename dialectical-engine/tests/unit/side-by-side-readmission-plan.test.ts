import { describe, expect, it, vi } from "vitest";
import type { AskRequest } from "@debateai/contract";
import type { StoredAsk } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  debateShapePolicyStartValues, lengthGuidancePolicyStartValues, parseDebateShapePolicy, type DebateShapePlanKey, type DebateShapePolicy
} from "@debateai/register";
import { AskRefusal, type PlannedAskAdmission } from "@debateai/api";
import { runSettingsClassOfAsk } from "../../apps/api/src/ask-room.js";
import {
  READMISSION_CHOICE_REFUSALS, planReadmission, readmittedAskContract, type ReadmissionPlan
} from "../../apps/api/src/readmission.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4, O3 (plan C task C10) — THE RE-ADMISSION PLAN. A waiting debate's stored ask
 * is rebuilt and re-evaluated under the current release: "the person's choices where the new version still offers them,
 * else please ask again". Fakes for `evaluate`; the real normaliser with the register's start policies (the ones
 * tests/support/debate-shape-harness.ts runs a shaped debate with). C11 starts the re-admitted run from this plan.
 */
const QUESTION = "Should a waiting debate keep the choices it was asked with?";

function stored(overrides: Partial<StoredAsk> = {}): StoredAsk {
  return Object.freeze({
    runId: "00000000-0000-4000-8000-000000000001",
    releaseKey: ["r16", "0123456789ab"].join("-"),
    registerVersion: 16,
    questionLine: QUESTION,
    askContract: Object.freeze({
      decision_scope: "personal",
      steering_presets: Object.freeze(["practical"]),
      steering_annotations: Object.freeze(["keep it short"]),
      critic_unavailable_cap: Object.freeze({ applied: false }),
      question_language: Object.freeze({ code: "en", name: "English", source: "ELD_SITE", site_language: "en", rewrite_accepted: false })
    }),
    askerId: "legacy-c10",
    sessionId: "00000000-0000-4000-8000-000000000002",
    callerScope: "ASKER",
    asOf: new Date("2026-10-21T09:00:00.000Z"),
    askerRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:side-by-side-c10",
    compositionBudgetTier: "low",
    planTier: "free",
    depthParams: Object.freeze({ depth: 1 }),
    argumentLanguageTag: "en",
    argumentLanguageName: "English",
    contentEncrypted: false,
    ...overrides
  });
}

function admission(overrides: Partial<PlannedAskAdmission> = {}): PlannedAskAdmission {
  return Object.freeze({
    risk: Object.freeze({ effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:side-by-side-c10" }),
    envelopeBasis: Object.freeze({}),
    discoveredPanel: Object.freeze([]),
    criticUnavailableCap: Object.freeze({ applied: false }),
    ...overrides
  }) as unknown as PlannedAskAdmission;
}

type Evaluate = (ask: AskRequest, shapePlan: DebateShapePlanKey) => Promise<PlannedAskAdmission | AskRefusal>;

function plan(input: Readonly<{
  stored?: StoredAsk;
  evaluate?: Evaluate;
  planId?: "FREE" | "PLUS" | "PRO" | "MAX" | null;
  debateShapePolicy?: DebateShapePolicy;
  lengthGuidancePolicy?: ReturnType<typeof lengthGuidancePolicyStartValues>;
}> = {}) {
  const evaluate = vi.fn<Evaluate>(input.evaluate ?? (async () => admission()));
  const settings = {
    ...(input.debateShapePolicy === undefined ? {} : { debateShapePolicy: input.debateShapePolicy }),
    ...(input.lengthGuidancePolicy === undefined ? {} : { lengthGuidancePolicy: input.lengthGuidancePolicy })
  };
  const result = planReadmission({ stored: input.stored ?? stored(), planId: input.planId ?? null, settings, evaluate });
  return { result, evaluate };
}

const refusal = (code: string) => new AskRefusal(new TypedDomainError(code, code));

function readmitted(value: ReadmissionPlan): Extract<ReadmissionPlan, { kind: "READMIT" }> {
  if (value.kind !== "READMIT") throw new Error(`expected READMIT, got ${JSON.stringify(value)}`);
  return value;
}

/** A policy whose premium plan no longer offers a fixed depth: the normaliser turns a stored "fixed" into "adaptive". */
function policyWithoutFixedDepth(): DebateShapePolicy {
  const start = debateShapePolicyStartValues();
  return parseDebateShapePolicy({ ...start, plans: { ...start.plans, premium: { ...start.plans.premium, fixedDepthAllowed: false } } });
}

describe("planReadmission (side-by-side spec §4, O3)", () => {
  it("re-admits a free {depth:1} ask with the stored question and choices, and no picked hold", async () => {
    const ask = stored();
    const { result, evaluate } = plan({ stored: ask });
    const value = readmitted(await result);
    expect(value.ask.question_line).toBe(QUESTION);
    expect(value.ask.depth_params).toEqual({ depth: 1 });
    expect(value.holdMicros).toBeNull();
    expect(value.ask).toEqual({
      question_line: QUESTION, risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker:side-by-side-c10",
      composition_budget_tier: "low", plan_tier: "free", depth_params: { depth: 1 }, as_of: "2026-10-21T09:00:00.000Z",
      decision_scope: "personal", steering_presets: ["practical"], steering_annotations: ["keep it short"]
    });
    expect(value.shapePlan).toBe("free");
    expect(value.planId).toBeNull();
    expect(value.settingsClass).toEqual(runSettingsClassOfAsk(value.ask, undefined, "free"));
    expect(value.stored).toBe(ask);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith(value.ask, "free");
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("asks again when a stored choice is no longer offered (the normaliser changes it), and evaluates nothing", async () => {
    const { result, evaluate } = plan({
      stored: stored({ planTier: "premium", depthParams: { depth: 2, depthMode: "fixed", scrutiny: "standard", answerLength: "standard" } }),
      debateShapePolicy: policyWithoutFixedDepth()
    });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("asks again when the shape row the choices were made under is withdrawn (a stored member goes missing)", async () => {
    const { result, evaluate } = plan({
      stored: stored({ planTier: "premium", depthParams: { depth: 2, depthMode: "fixed", scrutiny: "standard", answerLength: "standard" } })
    });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("keeps the person's choices that the new version still offers, under the plan id's own key", async () => {
    const depthParams = { depth: 2, depthMode: "fixed", scrutiny: "deep", answerLength: "detailed" } as const;
    const { result, evaluate } = plan({
      stored: stored({ planTier: "premium", depthParams }), planId: "PRO", debateShapePolicy: debateShapePolicyStartValues()
    });
    const value = readmitted(await result);
    expect(value.ask.depth_params).toEqual(depthParams);
    expect(value.shapePlan).toBe("pro");
    expect(value.planId).toBe("PRO");
    expect(evaluate).toHaveBeenCalledWith(value.ask, "pro");
  });

  it("re-admits {depth:1} under a policy whose normaliser adds answerLength, keeping the added member", async () => {
    const { result } = plan({ lengthGuidancePolicy: lengthGuidancePolicyStartValues() });
    const value = readmitted(await result);
    expect(value.ask.depth_params).toEqual({ depth: 1, answerLength: "standard" });
    expect(value.settingsClass).toEqual(runSettingsClassOfAsk(value.ask, undefined, "free"));
  });

  it("asks again when the stored ask no longer parses as an ask, and evaluates nothing", async () => {
    const { decision_scope: _dropped, ...withoutScope } = stored().askContract;
    const { result, evaluate } = plan({ stored: stored({ askContract: withoutScope }) });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("asks again on a refusal of the person's choice (ASK_PLAN_TIER_INVALID)", async () => {
    expect([...READMISSION_CHOICE_REFUSALS]).toEqual(["ASK_PLAN_TIER_INVALID"]);
    const { result } = plan({ evaluate: async () => refusal("ASK_PLAN_TIER_INVALID") });
    expect(await result).toEqual({ kind: "ASK_AGAIN" });
  });

  it("is NOT_NOW, with the code, on any other refusal: the run stays in line", async () => {
    const { result } = plan({ evaluate: async () => refusal("ASK_PLAN_TIER_MODEL_UNAVAILABLE") });
    expect(await result).toEqual({ kind: "NOT_NOW", code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
  });

  it("rethrows any other error", async () => {
    const failure = new TypeError("engine fault");
    const { result } = plan({ evaluate: async () => { throw failure; } });
    await expect(result).rejects.toBe(failure);
  });

  it("opens the hold with the picker's figure when the evaluation picked one", async () => {
    const { result } = plan({ evaluate: async () => admission({ pickedHoldMicros: 123_456 }) });
    expect(readmitted(await result).holdMicros).toBe(123_456);
  });
});

describe("readmittedAskContract (ruling L-SHAPED-ONLY)", () => {
  it("carries the stored question language only when the new evaluation minted a shape; never decides it again", async () => {
    const shaped = readmitted(await plan({ evaluate: async () => admission({ envelopeBasis: { shape: { plan: "free" } } }) }).result);
    expect(readmittedAskContract(shaped)).toEqual({
      decision_scope: "personal", steering_presets: ["practical"], steering_annotations: ["keep it short"],
      critic_unavailable_cap: { applied: false }, question_language: stored().askContract.question_language
    });
    const unshaped = readmitted(await plan({ evaluate: async () => admission({ envelopeBasis: { shape: null } }) }).result);
    expect(readmittedAskContract(unshaped)).toEqual({
      decision_scope: "personal", steering_presets: ["practical"], steering_annotations: ["keep it short"],
      critic_unavailable_cap: { applied: false }
    });
    const { question_language: _gone, ...noLanguage } = stored().askContract;
    const withoutStored = readmitted(await plan({
      stored: stored({ askContract: noLanguage }), evaluate: async () => admission({ envelopeBasis: { shape: { plan: "free" } } })
    }).result);
    expect(readmittedAskContract(withoutStored)).not.toHaveProperty("question_language");
  });
});
