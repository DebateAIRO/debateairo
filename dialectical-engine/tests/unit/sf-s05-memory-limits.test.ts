import { describe, expect, it } from "vitest";
import {
  SupportMessageLimiter,
  supportMessageLimitsFrom,
  type SupportMessageLimits
} from "../../apps/api/src/support/memory-limits.js";
import type { SupportConfigurationValues } from "../../packages/register/src/support-config.js";

const epoch = Date.UTC(2026, 0, 1);
const minute = 60_000;
const day = 24 * 60 * minute;
const limits: SupportMessageLimits = {
  anonymous10m: 2,
  anonymous24h: 3,
  account10m: 2,
  account24h: 3,
  lockAfterInjections: 2,
  cooldownMinutes: 60
};

function admit(limiter: SupportMessageLimiter, atMs: number, options: Partial<{
  source: string;
  ownerRef: string | null;
  injection: boolean;
  limits: SupportMessageLimits;
}> = {}) {
  return limiter.admit({
    source: options.source ?? "pseudo-a",
    ownerRef: options.ownerRef ?? null,
    injection: options.injection ?? false,
    atMs,
    limits: options.limits ?? limits
  });
}

describe("SupportMessageLimiter", () => {
  it.each([
    ["anonymous10m", null, [0, 1], 2],
    ["anonymous24h", null, [0, 11 * minute, 22 * minute], 33 * minute],
    ["account10m", "owner-a", [0, 1], 2],
    ["account24h", "owner-a", [0, 11 * minute, 22 * minute], 33 * minute]
  ] as const)("%s admits at its value and refuses one past it", (limit, ownerRef, accepted, refused) => {
    const limiter = new SupportMessageLimiter();
    const caseLimits = {
      ...limits,
      anonymous10m: limit === "anonymous24h" ? 9 : limits.anonymous10m,
      account10m: limit === "account24h" ? 9 : limits.account10m
    };
    for (const offset of accepted) {
      expect(admit(limiter, epoch + offset, { ownerRef, limits: caseLimits })).toBe("ADMITTED");
    }
    expect(admit(limiter, epoch + refused, { ownerRef, limits: caseLimits })).toBe("RATE_LIMITED");
  });

  it("a refused message adds no time", () => {
    const limiter = new SupportMessageLimiter();
    const caseLimits = { ...limits, anonymous24h: 10 };
    expect(admit(limiter, epoch, { limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1, { limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 5 * minute, { limits: caseLimits })).toBe("RATE_LIMITED");
    expect(admit(limiter, epoch + 10 * minute + 1, { limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 10 * minute + 2, { limits: caseLimits })).toBe("ADMITTED");
  });

  it("a signed-in visitor counts per account, not the network's anonymous count", () => {
    const limiter = new SupportMessageLimiter();
    expect(admit(limiter, epoch)).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1)).toBe("ADMITTED");
    expect(admit(limiter, epoch + 2, { ownerRef: "owner-a" })).toBe("ADMITTED");
  });

  it("a signed-out visitor counts per source", () => {
    const limiter = new SupportMessageLimiter();
    expect(admit(limiter, epoch)).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1)).toBe("ADMITTED");
    expect(admit(limiter, epoch + 2, { source: "pseudo-b" })).toBe("ADMITTED");
  });

  it("two injections in 24 hours pause their source for the cooldown", () => {
    const limiter = new SupportMessageLimiter();
    const caseLimits = { ...limits, anonymous10m: 10 };
    expect(admit(limiter, epoch, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 2, { limits: caseLimits })).toBe("RATE_LIMITED");
  });

  it("an ended pause admits again and clears the injection count", () => {
    const limiter = new SupportMessageLimiter();
    const caseLimits = { ...limits, anonymous10m: 10, anonymous24h: 10 };
    expect(admit(limiter, epoch, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1 + 60 * minute, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 2 + 60 * minute, { limits: caseLimits })).toBe("ADMITTED");
  });

  it("the source pause covers a signed-in visitor", () => {
    const limiter = new SupportMessageLimiter();
    const caseLimits = { ...limits, anonymous10m: 10 };
    expect(admit(limiter, epoch, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 1, { injection: true, limits: caseLimits })).toBe("ADMITTED");
    expect(admit(limiter, epoch + 2, { ownerRef: "owner-a", limits: caseLimits })).toBe("RATE_LIMITED");
  });

  it("sweeps a key at 24 hours after its last count, but not one millisecond before", () => {
    const limiter = new SupportMessageLimiter();
    expect(admit(limiter, epoch)).toBe("ADMITTED");
    expect(limiter.sweep(epoch + day - 1)).toBe(0);
    expect(limiter.keys()).toEqual(["source:pseudo-a"]);
    expect(limiter.sweep(epoch + day)).toBe(1);
    expect(limiter.keys()).toEqual([]);
  });

  it("keys contain only typed pseudonym and owner references, never message text", () => {
    const limiter = new SupportMessageLimiter();
    expect(admit(limiter, epoch, { source: "pseudo-abc" })).toBe("ADMITTED");
    expect(admit(limiter, epoch, { source: "pseudo-abc", ownerRef: "owner-xyz" })).toBe("ADMITTED");
    expect([...limiter.keys()].sort()).toEqual(["owner:owner-xyz", "source:pseudo-abc"]);
  });

  it("uses the published limit values", () => {
    const values = {
      supportLimitAnonMessages10m: 7,
      supportLimitAnonMessages24h: 8,
      supportLimitAccountMessages10m: 9,
      supportLimitAccountMessages24h: 10,
      supportLockAfterInjections: 11,
      supportIpCooldownMinutes: 12
    } as SupportConfigurationValues;
    expect(supportMessageLimitsFrom(values)).toEqual({
      anonymous10m: 7,
      anonymous24h: 8,
      account10m: 9,
      account24h: 10,
      lockAfterInjections: 11,
      cooldownMinutes: 12
    });
  });

  it("refuses a new key at capacity when no existing key has expired", () => {
    const limiter = new SupportMessageLimiter();
    let admitted = 0;
    for (let index = 0; index < 65_536; index += 1) {
      if (admit(limiter, epoch, { source: `pseudo-${index}` }) === "ADMITTED") admitted += 1;
    }
    expect(admitted).toBe(65_536);
    expect(admit(limiter, epoch, { source: "one-more" })).toBe("RATE_LIMITED");
  });
});
