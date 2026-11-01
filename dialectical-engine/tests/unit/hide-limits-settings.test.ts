import { describe, expect, it } from "vitest";
import { CostEnvelopeGuard, costEnvelopeGuardPolicy, type ModelSpendStore } from "@debateai/budget";
import {
  ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW,
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  abuseLimitsFromValue,
  billingPlansAreMadeUp,
  billingPlansFromValue,
  closingReservesOf,
  readAbuseLimits
} from "@debateai/register";
import { TEST_OWNER_BILLING_PLANS } from "../support/hostedRegisterRows.js";

/**
 * R22 decision 18 (owner: "we shouldn't let anybody seeing our GitHub repo know the limits that we have"). The real limits
 * live only on the server; the code's rows are made up, and nothing in the code stands in for a missing row. Every figure
 * here is made up. The hosted file's and the kit's refusals are in hosted-register-publish.test.ts and
 * preview-register-publish-v3.test.ts; the clarifying questions' limits in ask-clarify.test.ts.
 */
const VALID = Object.freeze({
  kind: "ABUSE_LIMITS", clarify_per_hour: 2, clarify_per_day: 3, flag_per_person_hour: 4, flag_per_debate_day: 5, flag_per_site_day: 6,
  cancel_links_per_day: 7, mail_domain_checks_per_minute: 8
});
const poolOf = (rows: readonly unknown[]) => ({ query: async () => ({ rows }) }) as never;
const rowWith = (change: (plan: Record<string, unknown>) => void) => {
  const row = structuredClone(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value) as unknown as { plans: Array<Record<string, unknown>> };
  row.plans.forEach(change);
  return row;
};

describe("the abuse limits are a required register row", () => {
  it("reads a sealed row into the shape the API takes", async () => {
    await expect(readAbuseLimits(poolOf([{ value_json: VALID, source_ref: "test" }]), 7)).resolves.toEqual({
      askClarify: { perHour: 2, perDay: 3 },
      publicFlag: { personHour: 4, debateDay: 5, siteDay: 6 },
      cancelLinksPerDay: 7,
      mailDomainChecksPerMinute: 8
    });
  });

  it("a version without the row refuses by name, and no default stands in for it", async () => {
    await expect(readAbuseLimits(poolOf([]), 7)).rejects.toThrowError(expect.objectContaining({ code: "ABUSE_LIMITS_UNRESOLVED" }));
  });

  it("a version with a broken row refuses by the parser's name", async () => {
    await expect(readAbuseLimits(poolOf([{ value_json: { kind: "ABUSE_LIMITS" }, source_ref: "test" }]), 7))
      .rejects.toThrowError(expect.objectContaining({ code: "ABUSE_LIMITS_INVALID" }));
  });

  it("the code's own row parses, and is the made-up one", () => {
    expect(abuseLimitsFromValue(ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW.value, ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW.sourceRef)).toEqual({
      askClarify: { perHour: 11, perDay: 22 },
      publicFlag: { personHour: 11, debateDay: 22, siteDay: 99 },
      cancelLinksPerDay: 11,
      mailDomainChecksPerMinute: 110
    });
    expect(ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW.sourceRef).toContain("MADE-UP");
  });

  it.each([
    ["another kind", { ...VALID, kind: "OTHER" }],
    ["a missing member", (({ cancel_links_per_day: _gone, ...rest }) => rest)(VALID)],
    ["an unknown member", { ...VALID, extra: 1 }],
    ["a zero", { ...VALID, flag_per_person_hour: 0 }],
    ["a negative", { ...VALID, mail_domain_checks_per_minute: -1 }],
    ["a fraction", { ...VALID, clarify_per_day: 3.5 }],
    ["a figure as text", { ...VALID, cancel_links_per_day: "7" }],
    ["an extra digit past the schema's bound", { ...VALID, flag_per_site_day: 1_000_001 }],
    ["an hour's limit above the day's", { ...VALID, clarify_per_hour: 4, clarify_per_day: 3 }],
    ["a debate's limit above the site's", { ...VALID, flag_per_debate_day: 7, flag_per_site_day: 6 }]
  ])("refuses %s (ABUSE_LIMITS_INVALID)", (_name, value) => {
    expect(() => abuseLimitsFromValue(value, "test")).toThrowError(expect.objectContaining({ code: "ABUSE_LIMITS_INVALID" }));
  });

  it("takes an hour equal to the day and a debate equal to the site; refuses a blank source", () => {
    expect(abuseLimitsFromValue({ ...VALID, clarify_per_hour: 3, flag_per_debate_day: 6 }, "test").askClarify.perHour).toBe(3);
    expect(() => abuseLimitsFromValue(VALID, " ")).toThrowError(expect.objectContaining({ code: "ABUSE_LIMITS_INVALID" }));
  });
});

describe("billingPlansAreMadeUp", () => {
  it("is true of the code's row and false of another row of plans", () => {
    expect(billingPlansAreMadeUp(billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test"))).toBe(true);
    expect(billingPlansAreMadeUp(billingPlansFromValue(TEST_OWNER_BILLING_PLANS, "test"))).toBe(false);
  });

  it.each(["FREE", "PLUS", "PRO", "MAX"])("is true when only %s still has the code's credit", (planId) => {
    const owner = structuredClone(TEST_OWNER_BILLING_PLANS) as unknown as { plans: Array<{ plan_id: string; monthly_credit_micros: number }> };
    const madeUp = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((plan) => plan.plan_id === planId)!.monthly_credit_micros;
    owner.plans.find((plan) => plan.plan_id === planId)!.monthly_credit_micros = madeUp;
    expect(billingPlansAreMadeUp(billingPlansFromValue(owner, "test"))).toBe(true);
  });
});

describe("closingReservesOf: what a closing may spend, from the plans in force", () => {
  it("reads the row's reserves: the paid plans', Free's, and the largest as the seam's safety net", () => {
    expect(closingReservesOf(billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test")))
      .toEqual({ paid: 440_000, free: 88_000, ceilingMicros: 440_000 });
  });

  it("no plans: null", () => {
    expect(closingReservesOf(null)).toBeNull();
  });

  it("a sealed v3 row carries no reserve: null, which refuses a closing", () => {
    const v3 = rowWith((plan) => {
      delete plan.finish_overflow_micros;
      delete plan.reserve_micros;
      delete plan.reserve_held;
      plan.finish_bp = 12_100;
    });
    expect(closingReservesOf(billingPlansFromValue(v3, "test"))).toBeNull();
  });

  it("paid plans with different reserves: a closing admits against the smallest, the seam allows the largest", () => {
    const reserves: Readonly<Record<string, number>> = { FREE: 44_000, PLUS: 110_000, PRO: 330_000, MAX: 220_000 };
    const row = rowWith((plan) => { plan.reserve_micros = reserves[plan.plan_id as string]; });
    expect(closingReservesOf(billingPlansFromValue(row, "test"))).toEqual({ paid: 110_000, free: 44_000, ceilingMicros: 330_000 });
  });

  it("the ceiling takes Free's reserve when it is the largest", () => {
    const row = rowWith((plan) => { plan.reserve_micros = plan.plan_id === "FREE" ? 330_000 : 110_000; });
    expect(closingReservesOf(billingPlansFromValue(row, "test"))).toEqual({ paid: 110_000, free: 330_000, ceilingMicros: 330_000 });
  });
});

describe("the closing's seams take their safety net from the plans, never from a constant", () => {
  const POLICY = { perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000, serveReserveBasisPoints: 0, serveOverrunBasisPoints: 0 };
  const PRICE = { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 };
  const PROJECTION = Object.freeze({ requestBytes: 800, completionTokenCeiling: 64 });
  const seamInput = { runId: "root-run", price: PRICE, requireReportedUsage: true };
  const SEAMS = ["investigationReportSeam", "answerUpdateSeam", "contributionCheckSeam", "publicReportSeam"] as const;
  const guardOf = (closingCeilingMicros: number | undefined, spent = 0) => new CostEnvelopeGuard({
    policy: costEnvelopeGuardPolicy(POLICY, null, closingCeilingMicros),
    store: {
      recordSpend: async () => undefined, readRunSpentMicros: async () => 0, readRunStorySpentMicros: async () => 0, readDaySpentMicros: async () => 0,
      admitNewRun: async () => Object.freeze({ admitted: true, committedMicros: 0 }),
      readRunInvestigationReportSpentMicros: async () => spent, readRunAnswerUpdateSpentMicros: async () => spent,
      readRunContributionCheckSpentMicros: async () => spent, readRunPublicReportSpentMicros: async () => spent
    } as unknown as ModelSpendStore
  });

  it.each(SEAMS)("%s refuses to be built without closingCeilingMicros (STORY_ENVELOPE_MISSING)", (seam) => {
    expect(() => guardOf(undefined)[seam](seamInput)).toThrowError(expect.objectContaining({ code: "STORY_ENVELOPE_MISSING" }));
  });

  it.each(SEAMS)("%s is built with it, and admits a call under it", async (seam) => {
    await expect(Promise.resolve(guardOf(440_000)[seam](seamInput).assertCallAllowed(PROJECTION))).resolves.not.toThrow();
  });

  it("holds a closing to that figure: under it admitted, past it refused", async () => {
    const seam = (spent: number) => guardOf(440_000, spent).investigationReportSeam(seamInput);
    await expect(Promise.resolve(seam(439_000).assertCallAllowed(PROJECTION))).resolves.not.toThrow();
    await expect(Promise.resolve(seam(440_000).assertCallAllowed(PROJECTION))).rejects.toMatchObject({ code: "STORY_COST_ENVELOPE_REACHED" });
  });

  it.each([0, -1, 0.5])("refuses a ceiling of %s when the guard is built", (ceiling) => {
    expect(() => guardOf(ceiling)).toThrowError("STORY_ENVELOPE_POLICY_INVALID");
  });
});
