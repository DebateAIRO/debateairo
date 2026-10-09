import { describe, expect, it } from "vitest";
import { MfaVerificationLimiter } from "../../apps/api/src/mfa.js";
import { MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue } from "../../packages/register/src/mfa-policy.js";

/**
 * Auth API hardening (2026-10-09, item 2). The shared sign-in limiter refused
 * EVERY new key once its table held `capacity` entries, so a flood of distinct
 * throwaway keys locked everybody out of sign-in for the whole window; and it
 * keyed on the full client address, so one IPv6 holder (a /64) could mint an
 * unlimited number of "sources".
 */
const policy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value).verificationLimits;
const at = new Date(1_800_000_000_000);
/** A distinct IPv4 source per index, never the legitimate caller's. */
const floodSource = (index: number) => `10.${(index >> 16) & 0xff}.${(index >> 8) & 0xff}.${index & 0xff}`;

describe("sign-in limiter under a key flood", () => {
  it("admits a new legitimate key after the table has been filled by distinct keys", () => {
    const limiter = new MfaVerificationLimiter(policy);
    for (let index = 0; index < policy.capacity; index += 1) {
      expect(limiter.consume(`flood-${index}`, floodSource(index), at)).toBe(true);
    }
    expect(limiter.consume("legitimate-account", "198.51.100.77", at)).toBe(true);
  });

  it("keeps the counter of a locked attacker while the flood evicts one-shot keys", () => {
    const limiter = new MfaVerificationLimiter(policy);
    for (let attempt = 0; attempt < policy.perEnrollment; attempt += 1) {
      expect(limiter.consume("victim-account", "203.0.113.9", at)).toBe(true);
    }
    expect(limiter.consume("victim-account", "203.0.113.9", at)).toBe(false);
    for (let index = 0; index < policy.capacity * 2; index += 1) {
      limiter.consume(`flood-${index}`, floodSource(index), at);
    }
    // The lock survives the flood: the victim's account budget was not reset by eviction.
    expect(limiter.consume("victim-account", "198.51.100.200", at)).toBe(false);
    // And a sprayer who nearly spent its source budget keeps that count too.
    const sprayer = new MfaVerificationLimiter(policy);
    for (let index = 0; index < policy.perSourceAcrossAccounts; index += 1) {
      expect(sprayer.consume(`spray-${index}`, "192.0.2.66", at)).toBe(true);
    }
    for (let index = 0; index < policy.capacity * 2; index += 1) {
      sprayer.consume(`flood-${index}`, floodSource(index), at);
    }
    expect(sprayer.consume("spray-overflow", "192.0.2.66", at)).toBe(false);
  });

  it("keeps the table bounded while it evicts", () => {
    const limiter = new MfaVerificationLimiter(policy);
    for (let index = 0; index < policy.capacity * 2; index += 1) {
      limiter.consume(`flood-${index}`, floodSource(index), at);
    }
    // One source table and one account table, each held to the sealed capacity.
    expect(limiter.size()).toBeLessThanOrEqual(policy.capacity * 2);
  });
});

describe("sign-in limiter source grouping", () => {
  it("counts every address of one IPv6 /64 as one source", () => {
    const limiter = new MfaVerificationLimiter(policy);
    for (let index = 0; index < policy.perSourceAcrossAccounts; index += 1) {
      expect(limiter.consume(`account-${index}`, `2001:db8:1:2::${(index + 1).toString(16)}`, at)).toBe(true);
    }
    expect(limiter.consume("account-next", "2001:db8:1:2:ffff:ffff:ffff:fffe", at)).toBe(false);
    // A different /64 is a different source; IPv4 stays per address.
    expect(limiter.consume("account-next", "2001:db8:1:3::1", at)).toBe(true);
    for (let index = 0; index < policy.perSourceAcrossAccounts; index += 1) {
      expect(limiter.consume(`v4-${index}`, "198.51.100.1", at)).toBe(true);
    }
    expect(limiter.consume("v4-next", "198.51.100.2", at)).toBe(true);
  });
});

describe("sign-in limiter route families", () => {
  it("keeps a password sign-in counter when a ceremony flood fills its own table", async () => {
    const { SessionService } = await import("../../apps/api/src/sessions.js");
    const register = await import("@debateai/register");
    const base = register.mfaPolicyFromValue(register.MFA_POLICY_REGISTER_ROW.value);
    let reached = 0;
    const sessions = await SessionService.create({
      repository: {
        findLoginIdentity: async () => { reached += 1; throw new Error("REPOSITORY_REACHED"); },
        recordLoginFailure: async () => undefined
      } as never,
      riskSignals: {} as never, onRiskSignalFailure: () => undefined, dekStore: {} as never, argon2: {} as never,
      blindIndexKey: Buffer.alloc(32, 1), dummyPasswordHash: "fixture",
      authPolicy: register.authPolicyFromRegisterRows(register.AUTH_POLICY_REGISTER_ROWS),
      mfaPolicy: { ...base, verificationLimits: { ...base.verificationLimits, capacity: 4, perSourceAcrossAccounts: 1_000 } },
      sessionPolicy: register.sessionPolicyFromValue(register.SESSION_POLICY_REGISTER_ROW.value, register.SESSION_POLICY_REGISTER_ROW.sourceRef)
    });
    const source = { ip: "198.51.100.5", userAgent: "fixture", requestId: "families" };
    const login = () => sessions.beginLogin({ email: "victim@example.test", password: "wrong" }, source);
    for (let attempt = 0; attempt < base.verificationLimits.perEnrollment - 1; attempt += 1) {
      await expect(login()).rejects.toThrow("REPOSITORY_REACHED");
    }
    // A flood of enrollment ceremonies, each driven to its own limit, fills the ceremony table.
    for (let index = 0; index < 8; index += 1) {
      const handle = `${"f".repeat(40)}${String(index).padStart(3, "0")}`;
      for (let attempt = 0; attempt < base.verificationLimits.perEnrollment; attempt += 1) {
        await sessions.consumerProducer().admit("ENROLLMENT_BEGIN", handle, source);
      }
    }
    // The victim's password sign-in counter survived: one attempt left, then the lock.
    await expect(login()).rejects.toThrow("REPOSITORY_REACHED");
    await expect(login()).rejects.toThrow("MFA_RATE_LIMITED");
    expect(reached).toBe(base.verificationLimits.perEnrollment);
  });
});
