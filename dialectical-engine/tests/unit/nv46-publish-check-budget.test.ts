import { describe, expect, it } from "vitest";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";

/**
 * Security audit run 3, NV-46: POST /v1/runs/{id}/publish starts paid judge calls, so each owner's publish content
 * checks are counted by the `publishChecks` admission scope. No sealed row carries `publish_checks`; the parser applies
 * its default, so every version, sealed or hosted, gets the bound. Owner-keyed and fail-closed (never evicting).
 */
const DEFAULT_PUBLISH_CHECKS = { key: "owner", limit: 10, windowMs: 86_400_000, capacity: 196_608 };
const T0 = new Date("2026-10-28T00:00:00.000Z");

function refusalCode(value: unknown): unknown {
  try {
    admissionPolicyFromValue(value, "nv46");
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return "NOT_REFUSED";
}

function withPublishChecks(publishChecks: unknown) {
  return { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, publish_checks: publishChecks };
}

describe("NV-46 publishChecks admission scope", () => {
  // red: the scope does not exist before NV-46.
  it("the sealed row and the deployment row both resolve to the parser's default", () => {
    for (const row of [ADMISSION_POLICY_REGISTER_ROW, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW]) {
      const policy = admissionPolicyFromValue(row.value, row.sourceRef);
      expect(policy.publishChecks).toEqual(DEFAULT_PUBLISH_CHECKS);
      expect(Object.isFrozen(policy.publishChecks)).toBe(true);
    }
  });

  // red: a version may seal its own value, and the parser honours it.
  it("a version that carries publish_checks gets exactly that value", () => {
    const policy = admissionPolicyFromValue(
      withPublishChecks({ key: "owner", limit: 3, window_ms: 60_000, capacity: 16 }), "nv46"
    );
    expect(policy.publishChecks).toEqual({ key: "owner", limit: 3, windowMs: 60_000, capacity: 16 });
  });

  // guard: the strict schema already refuses every one of these before NV-46.
  it("a source key, a zero limit, a window past 24 h and an unknown member are refused", () => {
    const valid = { key: "owner", limit: 3, window_ms: 60_000, capacity: 16 };
    for (const publishChecks of [
      { ...valid, key: "source" },
      { ...valid, limit: 0 },
      { ...valid, window_ms: 86_400_001 },
      { ...valid, burst: 2 }
    ]) {
      expect(refusalCode(withPublishChecks(publishChecks)), JSON.stringify(publishChecks))
        .toBe("ADMISSION_POLICY_INVALID");
    }
    // A clearly bogus top-level member (never a real sibling scope such as NV-47's language_checks).
    expect(refusalCode({ ...withPublishChecks(valid), not_a_scope: valid })).toBe("ADMISSION_POLICY_INVALID");
  });

  // guard: the sealed constants are not edited; the default lives in the parser.
  it("no sealed row carries a publish_checks member", () => {
    expect("publish_checks" in ADMISSION_POLICY_REGISTER_ROW.value).toBe(false);
    expect("publish_checks" in ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value).toBe(false);
  });

  // red: always configured, so the route never skips the charge.
  it("the limiter built from the sealed row has the publishChecks scope configured", () => {
    const sealed = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    expect(new AdmissionLimiter(sealed).configured("publishChecks")).toBe(true);
  });

  // red: separate counts per owner, and a full table refuses a new owner instead of evicting a counted one.
  it("owners keep separate counts, and a full table refuses a new owner with CAPACITY", () => {
    const limiter = new AdmissionLimiter(admissionPolicyFromValue(
      withPublishChecks({ key: "owner", limit: 2, window_ms: 60_000, capacity: 2 }), "nv46"
    ));
    expect(limiter.decide("publishChecks", "owner-a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publishChecks", "owner-a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publishChecks", "owner-a", T0)).toEqual({
      allowed: false, reason: "LIMIT", retryAfterMs: 60_000, windowMs: 60_000
    });
    expect(limiter.decide("publishChecks", "owner-b", T0)).toEqual({ allowed: true });
    // An evicting scope would give up owner-b (the least evidence) here; this one refuses owner-c.
    expect(limiter.decide("publishChecks", "owner-c", T0)).toEqual({
      allowed: false, reason: "CAPACITY", retryAfterMs: 60_000, windowMs: 60_000
    });
    expect(limiter.size("publishChecks")).toBe(2);
    expect(limiter.decide("publishChecks", "owner-b", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publishChecks", "owner-b", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
  });
});
