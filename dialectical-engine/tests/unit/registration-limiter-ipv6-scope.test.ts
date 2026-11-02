import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";
import {
  AuthFlowError,
  InProcessAuthRateLimiter,
  RegistrationService
} from "../../apps/api/src/registration.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
import { clientIpNetworkScope, normalizeClientIp } from "../../apps/api/src/client-ip.js";

/**
 * NV-23. The register, verify-email and resend budgets were charged to the full
 * IPv6 address, so one /64 acted as 2^64 sources: unlimited registrations,
 * token guesses and resends, and enough distinct keys to fill the route's
 * never-evicting sketch for every other caller. The limiter now charges an IPv6
 * caller to its /64 (DL5-F3), and an IPv4 caller or the "unknown" fallback to
 * its own address.
 */
const POLICY = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
/** Fixed, so the slot preconditions below are exact rather than probabilistic. */
const SLOT_KEY = Buffer.alloc(32, 9);
const NOW = new Date("2026-10-28T00:00:00.000Z");
const TOKEN = "A".repeat(43);

/** Local copy of `fixedSlotPair` (tests/unit/registration.test.ts), fed the post-fix scope string. */
function fixedSlotPair(route: "resend", scope: string, capacity: number): string {
  const digest = createHmac("sha256", SLOT_KEY).update(`${route}:source:${scope}`, "utf8").digest();
  const firstWidth = Math.floor(capacity / 2);
  return `${digest.readUInt32BE(0) % firstWidth}:`
    + `${firstWidth + (digest.readUInt32BE(4) % (capacity - firstWidth))}`;
}

function limiter(capacity: number): InProcessAuthRateLimiter {
  return new InProcessAuthRateLimiter(POLICY.rateLimits, capacity, POLICY.rateLimitRefusalAuditIntervalMs, SLOT_KEY);
}

function resend(target: InProcessAuthRateLimiter, ip: string) {
  return target.consume({ route: "resend", ip, addressKey: "", now: NOW });
}

const services: RegistrationService[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.drainRateLimitAuditFlushes()));
});

function service(): RegistrationService {
  const built = new RegistrationService({
    repository: {
      findAuditIdentityByVerificationHash: async () => null,
      findAuditIdentityByBlindIndex: async () => null,
      consumeVerification: async () => false,
      recordRateLimitRefusal: async () => undefined
    } as never,
    mail: new MemoryMailSender(),
    dekStore: {
      store: async () => undefined,
      destroy: async () => "ALREADY_ABSENT"
    } as never,
    blindIndexKey: Buffer.alloc(32, 0x2c),
    policy: POLICY,
    limiter: new InProcessAuthRateLimiter(
      POLICY.rateLimits, POLICY.rateLimitBucketCapacity, POLICY.rateLimitRefusalAuditIntervalMs, SLOT_KEY
    ),
    argon2: {
      hashPassword: async () => `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
      verifyPassword: async () => false,
      hashAuditContext: async () => "ab".repeat(32)
    },
    sleep: async () => undefined,
    clock: () => NOW
  });
  services.push(built);
  return built;
}

function source(ip: string) {
  return Object.freeze({ ip, userAgent: "vitest-nv23", requestId: `nv23:${ip}` });
}

function codeOf(caught: unknown): string {
  expect(caught).toBeInstanceOf(AuthFlowError);
  return (caught as AuthFlowError).code;
}

describe("NV-23 registration-family budgets charge an IPv6 caller to its /64", () => {
  it("resend counts one /64 as one source", () => {
    // Precondition: the keys consume builds are the scope strings below, and at
    // capacity 256 no two of them share a slot, so nothing here is a collision.
    expect(["2001:db8:1:2::4", "2001:db8:1:3::1", "198.51.100.1", "::ffff:198.51.100.2"]
      .map((ip) => clientIpNetworkScope(normalizeClientIp(ip) ?? ip)))
      .toEqual(["2001:db8:1:2::/64", "2001:db8:1:3::/64", "198.51.100.1", "198.51.100.2"]);
    expect(["2001:db8:1:2::/64", "2001:db8:1:3::/64", "198.51.100.1", "198.51.100.2"]
      .map((scope) => fixedSlotPair("resend", scope, 256)))
      .toEqual(["111:142", "41:219", "106:221", "94:167"]);

    const target = limiter(256);
    const calls = [
      "2001:db8:1:2::1", "2001:db8:1:2::2", "2001:db8:1:2::3", "2001:db8:1:2::4",
      "2001:db8:1:3::1",
      "198.51.100.1", "198.51.100.1", "198.51.100.1", "198.51.100.1",
      "::ffff:198.51.100.2", "198.51.100.2", "::ffff:198.51.100.2", "198.51.100.2"
    ];
    expect(calls.map((ip) => [ip, resend(target, ip)])).toEqual([
      ["2001:db8:1:2::1", { allowed: true }],
      ["2001:db8:1:2::2", { allowed: true }],
      ["2001:db8:1:2::3", { allowed: true }],
      ["2001:db8:1:2::4", { allowed: false, scope: "ip" }],
      ["2001:db8:1:3::1", { allowed: true }],
      ["198.51.100.1", { allowed: true }],
      ["198.51.100.1", { allowed: true }],
      ["198.51.100.1", { allowed: true }],
      ["198.51.100.1", { allowed: false, scope: "ip" }],
      // The mapped and plain spellings of one IPv4 address are one source.
      ["::ffff:198.51.100.2", { allowed: true }],
      ["198.51.100.2", { allowed: true }],
      ["::ffff:198.51.100.2", { allowed: true }],
      ["198.51.100.2", { allowed: false, scope: "ip" }]
    ]);
  });

  it("one /64 cannot fill the sketch", () => {
    // Precondition: at capacity 64 the /64 key and the IPv4 control share no slot.
    expect(["2001:db8:1:2::/64", "198.51.100.200"].map((scope) => fixedSlotPair("resend", scope, 64)))
      .toEqual(["15:46", "9:42"]);

    const target = limiter(64);
    let allowed = 0;
    for (let n = 1; n <= 2_000; n += 1) {
      if (resend(target, `2001:db8:1:2::${n.toString(16)}`).allowed) allowed += 1;
    }
    expect({
      allowed,
      occupiedResendSlots: target.memoryOccupancy().occupiedSlotsByRoute.resend,
      freshIpv4: resend(target, "198.51.100.200")
    }).toEqual({ allowed: 3, occupiedResendSlots: 2, freshIpv4: { allowed: true } });
  });

  it("verifyEmail charges the /64", async () => {
    const flow = service();
    for (let host = 1; host <= POLICY.rateLimits.verify.admissionPerSource; host += 1) {
      const caught = await flow.verifyEmail({ token: TOKEN }, source(`2001:db8:5:6::${host.toString(16)}`)).then(
        () => { throw new Error("an unknown token was accepted"); },
        (error: unknown) => error
      );
      expect(codeOf(caught)).not.toBe("AUTH_RATE_LIMITED");
    }
    const eleventh = await flow.verifyEmail({ token: TOKEN }, source("2001:db8:5:6::b")).then(
      () => { throw new Error("an unknown token was accepted"); },
      (error: unknown) => error
    );
    expect(codeOf(eleventh)).toBe("AUTH_RATE_LIMITED");
  });

  it("admitSource resend charges the /64", async () => {
    const flow = service();
    const admitted = [];
    for (const ip of ["2001:db8:7:8::1", "2001:db8:7:8::2", "2001:db8:7:8::3"]) {
      admitted.push(await flow.admitSource({
        route: "resend", input: { email: "visitor@example.com" }, source: source(ip)
      }));
    }
    for (const admission of admitted) admission.release();
    const fourth = await flow.admitSource({
      route: "resend", input: { email: "visitor@example.com" }, source: source("2001:db8:7:8::4")
    }).then(
      (admission) => { admission.release(); throw new Error("a fourth resend from one /64 was admitted"); },
      (error: unknown) => error
    );
    expect(codeOf(fourth)).toBe("AUTH_RATE_LIMITED");
  });
});
