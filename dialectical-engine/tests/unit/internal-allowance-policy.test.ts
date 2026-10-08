import { describe, expect, it } from "vitest";
import { internalAllowancePolicyFromValue, INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from "@debateai/register";

// Synthetic limits exercise finite bounds; these are not approved deployment amounts.
const enabled = {
  enabled: true, funding_policy_version: 1, currency: "USD",
  maximum_grant_micros: 1200000, maximum_day_micros: 100000,
  maximum_week_micros: 500000, maximum_lifetime_ms: 2678400000,
  finish_allowance_bp: 10000
};
const parse = (value: unknown) => internalAllowancePolicyFromValue(value, "test:synthetic-funding");

describe("finite explicitly reviewed internal allowance policy", () => {
  it("accepts an explicit finite USD policy and preserves its exact maxima", () => {
    const policy = parse(enabled);
    expect(policy).toEqual({
      enabled: true, fundingPolicyVersion: 1, currency: "USD", maximumGrantMicros: 1200000,
      maximumDayMicros: 100000, maximumWeekMicros: 500000, maximumLifetimeMs: 2678400000,
      finishAllowanceBp: 10000, sourceRef: "test:synthetic-funding"
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("keeps the historical disabled publication and parsed default unchanged", () => {
    expect(INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW.value).toEqual({ enabled: false });
    expect(parse({ enabled: false })).toEqual({ enabled: false, sourceRef: "test:synthetic-funding" });
    expect(() => parse({ enabled: false, maximum_grant_micros: 1 })).toThrow();
  });

  it.each(["maximum_grant_micros", "maximum_day_micros", "maximum_week_micros", "maximum_lifetime_ms"])(
    "requires explicit positive safe integer %s without an unlimited fallback", field => {
      // The positive control prevents a parser that rejects every enabled input from passing.
      expect(parse(enabled).enabled).toBe(true);
      for (const value of [undefined, null, 0, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 1.5, "100000"]) {
        const candidate: Record<string, unknown> = { ...enabled, [field]: value };
        if (value === undefined) delete candidate[field];
        expect(() => parse(candidate), `${field}=${String(value)}`).toThrow();
      }
    }
  );

  it.each([
    { currency: "EUR" }, { funding_policy_version: 2 }, { finish_allowance_bp: 9999 },
    { finish_allowance_bp: null }, { maximum_lifetime_ms: 2678400001 },
    { maximum_day_micros: 500001 }, { maximum_week_micros: 1200001 },
    { unlimited: true }, { plan_id: "MAX" }, { role: "owner" }
  ])("refuses invalid finite policy or extra authority %j", change => {
    expect(parse(enabled).enabled).toBe(true);
    expect(() => parse({ ...enabled, ...change })).toThrow();
  });

  it("requires provenance on enabled and disabled policies", () => {
    expect(parse(enabled).enabled).toBe(true);
    expect(() => internalAllowancePolicyFromValue(enabled, " ")).toThrow();
    expect(() => internalAllowancePolicyFromValue({ enabled: false }, " ")).toThrow();
  });
});
