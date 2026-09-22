import { describe, expect, it, vi } from "vitest";
import {
  AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS,
  authPolicyFromRegisterRows
} from "../../packages/register/src/auth-policy.js";
import {
  AuthFlowError,
  InProcessAuthRateLimiter,
  RegistrationService
} from "../../apps/api/src/registration.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";

/**
 * V-2 item (5), measured on 2026-09-22: `runVerifyEmail` did one indexed
 * repository lookup BEFORE `limiter.consume`, so an exhausted source still
 * bought a database read per attempt. The visitor's own budget is charged
 * first; the refusal may not change shape with whether the token exists.
 */
const POLICY = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
const TOKEN = "A".repeat(43);
const OTHER_TOKEN = "B".repeat(43);
/** One fixed instant, so the limiter window the test spends is the one the service reads. */
const NOW = new Date("2026-09-22T00:00:00.000Z");

function source(ip: string) {
  return Object.freeze({ ip, userAgent: "vitest-verify-order", requestId: `verify:${ip}` });
}

function harness(identity: Readonly<{ addressKey: string }> | null) {
  const findAuditIdentityByVerificationHash = vi.fn(async () => identity);
  const consumeVerification = vi.fn(async () => true);
  const recordRateLimitRefusal = vi.fn(async () => undefined);
  const limiter = new InProcessAuthRateLimiter(
    POLICY.rateLimits, POLICY.rateLimitBucketCapacity, POLICY.rateLimitRefusalAuditIntervalMs
  );
  const service = new RegistrationService({
    repository: {
      findAuditIdentityByVerificationHash,
      findAuditIdentityByBlindIndex: async () => null,
      consumeVerification,
      recordRateLimitRefusal
    } as never,
    mail: new MemoryMailSender(),
    dekStore: {
      store: async () => undefined,
      destroy: async () => "ALREADY_ABSENT"
    } as never,
    blindIndexKey: Buffer.alloc(32, 0x2c),
    policy: POLICY,
    limiter,
    argon2: {
      hashPassword: async () => `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`,
      verifyPassword: async () => false,
      hashAuditContext: async () => "ab".repeat(32)
    },
    sleep: async () => undefined,
    clock: () => NOW
  });
  return { service, limiter, findAuditIdentityByVerificationHash, consumeVerification };
}

/** Spends the visitor's whole per-source verify budget, without touching the service. */
function exhaustVerifyBudget(limiter: InProcessAuthRateLimiter, ip: string): void {
  for (let attempt = 0; attempt < POLICY.rateLimits.verify.admissionPerSource; attempt += 1) {
    const spent = limiter.consume({ route: "verify", ip, addressKey: "unused", now: NOW });
    expect(spent.allowed).toBe(true);
  }
}

describe("V-2 (5) the e-mail-verification route charges the visitor's budget first", () => {
  it("never asks the repository about a token once the source budget is spent", async () => {
    const { service, limiter, findAuditIdentityByVerificationHash, consumeVerification } =
      harness({ addressKey: "address-key-of-a-real-account" });
    exhaustVerifyBudget(limiter, "203.0.113.31");

    const error = await service.verifyEmail({ token: TOKEN }, source("203.0.113.31")).then(
      () => { throw new Error("an exhausted source was admitted"); },
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(AuthFlowError);
    expect((error as AuthFlowError).code).toBe("AUTH_RATE_LIMITED");
    expect(findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
    expect(consumeVerification).not.toHaveBeenCalled();
  });

  it("refuses identically whether the token exists or not", async () => {
    const known = harness({ addressKey: "address-key-of-a-real-account" });
    const unknown = harness(null);
    exhaustVerifyBudget(known.limiter, "203.0.113.32");
    exhaustVerifyBudget(unknown.limiter, "203.0.113.32");

    const refusals = await Promise.all([
      known.service.verifyEmail({ token: TOKEN }, source("203.0.113.32"))
        .catch((caught: unknown) => caught),
      unknown.service.verifyEmail({ token: OTHER_TOKEN }, source("203.0.113.32"))
        .catch((caught: unknown) => caught)
    ]);
    const shape = (caught: unknown) => {
      const error = caught as AuthFlowError;
      return { code: error.code, statusCode: error.statusCode, message: error.message };
    };
    expect(shape(refusals[0])).toEqual(shape(refusals[1]));
    expect(shape(refusals[0])).toEqual({
      code: "AUTH_RATE_LIMITED", statusCode: 429, message: "AUTH_RATE_LIMITED"
    });
    expect(known.findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
    expect(unknown.findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
  });

  it("still looks the token up and consumes it while the budget holds", async () => {
    const { service, findAuditIdentityByVerificationHash, consumeVerification } =
      harness({ addressKey: "address-key-of-a-real-account" });
    await expect(service.verifyEmail({ token: TOKEN }, source("203.0.113.33")))
      .resolves.toEqual({ status: "mfa_required" });
    expect(findAuditIdentityByVerificationHash).toHaveBeenCalledTimes(1);
    expect(consumeVerification).toHaveBeenCalledTimes(1);
  });

  it("keeps refusing a malformed token before it costs the visitor anything", async () => {
    const { service, limiter, findAuditIdentityByVerificationHash } = harness(null);
    const ip = "203.0.113.34";
    // Spend all but ONE of the budget first. Without that, "the next consume is
    // still allowed" is true whether or not the malformed attempt charged, and
    // the case proves nothing.
    for (let attempt = 0; attempt < POLICY.rateLimits.verify.admissionPerSource - 1; attempt += 1) {
      expect(limiter.consume({ route: "verify", ip, addressKey: "unused", now: NOW }).allowed).toBe(true);
    }
    await expect(service.verifyEmail({ token: "too-short" }, source(ip)))
      .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    expect(findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
    // The one remaining admission is still there, so the malformed attempt was
    // refused on shape and charged nothing...
    expect(limiter.consume({ route: "verify", ip, addressKey: "unused", now: NOW }).allowed).toBe(true);
    // ...and that really was the last one.
    expect(limiter.consume({ route: "verify", ip, addressKey: "unused", now: NOW }).allowed).toBe(false);
  });
});
