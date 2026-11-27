import { describe, expect, it } from "vitest";
import {
  ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW,
  ADMISSION_POLICY_REGISTER_ROW,
  admissionPolicyFromValue
} from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";

/**
 * Public debate upvotes (design 2026-11-26, section 5): casting, withdrawing and the "which have I upvoted" read share
 * one per-account flood brake, the `publicVotes` admission scope. No sealed row carries `public_votes`; the parser
 * applies its default, so every settings version gets the bound. Keyed by account and fail-closed (never evicting).
 */
const DEFAULT_PUBLIC_VOTES = { key: "owner", limit: 60, windowMs: 60_000, capacity: 65_536 };
const VALID = { key: "owner", limit: 3, window_ms: 1_000, capacity: 16 };
const T0 = new Date("2026-11-26T12:00:00.000Z");

function refusalCode(value: unknown): unknown {
  try {
    admissionPolicyFromValue(value, "public-votes");
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
  return "NOT_REFUSED";
}

function withPublicVotes(publicVotes: unknown) {
  return { ...ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, public_votes: publicVotes };
}

function sealedLimiter(): AdmissionLimiter {
  return new AdmissionLimiter(admissionPolicyFromValue(
    ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef
  ));
}

describe("publicVotes admission scope (public debate upvotes)", () => {
  it("the sealed row and the deployment row both resolve to the parser's default", () => {
    for (const row of [ADMISSION_POLICY_REGISTER_ROW, ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW]) {
      const policy = admissionPolicyFromValue(row.value, row.sourceRef);
      expect(policy.publicVotes).toEqual(DEFAULT_PUBLIC_VOTES);
      expect(Object.isFrozen(policy.publicVotes)).toBe(true);
    }
  });

  it("a version that carries public_votes gets exactly that value", () => {
    const policy = admissionPolicyFromValue(withPublicVotes(VALID), "public-votes");
    expect(policy.publicVotes).toEqual({ key: "owner", limit: 3, windowMs: 1_000, capacity: 16 });
  });

  it("a well-formed public_votes is accepted; a source key, a zero limit, a window past 24 h, a capacity past the bound and an unknown member are refused", () => {
    expect(refusalCode(withPublicVotes(VALID))).toBe("NOT_REFUSED");
    for (const publicVotes of [
      { ...VALID, key: "source" },
      { ...VALID, limit: 0 },
      { ...VALID, window_ms: 86_400_001 },
      { ...VALID, capacity: 1_048_577 },
      { ...VALID, windowMs: 1_000 },
      null
    ]) {
      expect(refusalCode(withPublicVotes(publicVotes)), JSON.stringify(publicVotes)).toBe("ADMISSION_POLICY_INVALID");
    }
  });

  // guard: green before the change too. The default lives in the parser, never in a sealed row.
  it("no sealed row carries a public_votes member", () => {
    expect("public_votes" in ADMISSION_POLICY_REGISTER_ROW.value).toBe(false);
    expect("public_votes" in ADMISSION_POLICY_DEPLOYMENT_REGISTER_ROW.value).toBe(false);
  });

  it("the default limiter admits 60 actions per account per fixed minute, and the next minute admits again", () => {
    const limiter = sealedLimiter();
    expect(limiter.configured("publicVotes")).toBe(true);
    for (let action = 1; action <= 60; action += 1) {
      expect(limiter.decide("publicVotes", "owner:heavy", T0), String(action)).toEqual({ allowed: true });
    }
    expect(limiter.decide("publicVotes", "owner:heavy", T0)).toEqual({
      allowed: false, reason: "LIMIT", retryAfterMs: 60_000, windowMs: 60_000
    });
    expect(limiter.decide("publicVotes", "owner:other", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:heavy", new Date(T0.getTime() + 59_999)))
      .toMatchObject({ allowed: false, reason: "LIMIT", retryAfterMs: 1 });
    expect(limiter.decide("publicVotes", "owner:heavy", new Date(T0.getTime() + 60_000))).toEqual({ allowed: true });
  });

  it("vote actions and asks are counted apart", () => {
    const limiter = sealedLimiter();
    for (let action = 1; action <= 61; action += 1) limiter.decide("publicVotes", "owner:a", T0);
    expect(limiter.size("asks")).toBe(0);
    for (let ask = 1; ask <= 20; ask += 1) {
      expect(limiter.decide("asks", "owner:a", T0), String(ask)).toEqual({ allowed: true });
    }
    expect(limiter.decide("asks", "owner:a", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
    expect(limiter.decide("publicVotes", "owner:b", T0)).toEqual({ allowed: true });
    expect(limiter.size("publicVotes")).toBe(2);
  });

  it("a full table refuses a new account with CAPACITY, and keeps the counted ones", () => {
    const limiter = new AdmissionLimiter(admissionPolicyFromValue(
      withPublicVotes({ key: "owner", limit: 2, window_ms: 60_000, capacity: 2 }), "public-votes"
    ));
    expect(limiter.decide("publicVotes", "owner:a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:b", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:c", T0)).toEqual({
      allowed: false, reason: "CAPACITY", retryAfterMs: 60_000, windowMs: 60_000
    });
    expect(limiter.size("publicVotes")).toBe(2);
    expect(limiter.decide("publicVotes", "owner:a", T0)).toEqual({ allowed: true });
    expect(limiter.decide("publicVotes", "owner:a", T0)).toMatchObject({ allowed: false, reason: "LIMIT" });
  });
});
