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
import { Argon2InfrastructureError } from "../../packages/crypto/src/index.js";

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

const HASHED = `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`;

function harness(identity: Readonly<{ addressKey: string }> | null) {
  const findAuditIdentityByVerificationHash = vi.fn(async () => identity);
  const consumeVerification = vi.fn(async () => true);
  // NV-14: the password-carrying consume, and the hash it is handed.
  const consumeVerificationSetPassword = vi.fn(async (_input: { readonly newPasswordHash: string }) => true);
  const hashPassword = vi.fn(async () => HASHED);
  const recordRateLimitRefusal = vi.fn(async () => undefined);
  const limiter = new InProcessAuthRateLimiter(
    POLICY.rateLimits, POLICY.rateLimitBucketCapacity, POLICY.rateLimitRefusalAuditIntervalMs
  );
  const service = new RegistrationService({
    repository: {
      findAuditIdentityByVerificationHash,
      findAuditIdentityByBlindIndex: async () => null,
      consumeVerification,
      consumeVerificationSetPassword,
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
      hashPassword,
      verifyPassword: async () => false,
      hashAuditContext: async () => "ab".repeat(32)
    },
    sleep: async () => undefined,
    clock: () => NOW
  });
  return {
    service, limiter, findAuditIdentityByVerificationHash, consumeVerification,
    consumeVerificationSetPassword, hashPassword
  };
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

/**
 * NV-14: verification sets the token holder's password. The order is token shape, password policy, the visitor's
 * budget, the lookup, the hash (only for a token the lookup knows), the consume. So a refused source and an unknown
 * token buy no Argon2, and a refused password consumes nothing.
 */
describe("NV-14 the verify-time password: policy first, hash after the lookup", () => {
  const PASSWORD = "Inbox owner pass 1";

  it("refuses a password under the policy minimum before the budget and before any lookup", async () => {
    const { service, limiter, findAuditIdentityByVerificationHash, hashPassword, consumeVerification,
      consumeVerificationSetPassword } = harness({ addressKey: "address-key-of-a-real-account" });
    const ip = "203.0.113.41";
    for (let attempt = 0; attempt < POLICY.rateLimits.verify.admissionPerSource - 1; attempt += 1) {
      expect(limiter.consume({ route: "verify", ip, addressKey: "unused", now: NOW }).allowed).toBe(true);
    }
    expect("seven77").toHaveLength(POLICY.password.minimumLength - 1);
    await expect(service.verifyEmail({ token: TOKEN, password: "seven77" }, source(ip)))
      .rejects.toMatchObject({ code: "AUTH_INPUT_INVALID", statusCode: 400 });
    expect(findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(consumeVerification).not.toHaveBeenCalled();
    expect(consumeVerificationSetPassword).not.toHaveBeenCalled();
    // The refusal charged nothing: the one remaining admission is still there.
    expect(limiter.consume({ route: "verify", ip, addressKey: "unused", now: NOW }).allowed).toBe(true);
  });

  it("refuses a password over the ruled maximum the same way", async () => {
    const { service, findAuditIdentityByVerificationHash, hashPassword, consumeVerificationSetPassword } =
      harness({ addressKey: "address-key-of-a-real-account" });
    const maximum = POLICY.password.maximumLength;
    expect(maximum).not.toBeNull();
    await expect(service.verifyEmail({ token: TOKEN, password: "p".repeat(maximum! + 1) }, source("203.0.113.42")))
      .rejects.toMatchObject({ code: "AUTH_INPUT_INVALID" });
    expect(findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(consumeVerificationSetPassword).not.toHaveBeenCalled();
  });

  it("hashes after the lookup and hands that hash to the password-setting consume", async () => {
    const { service, findAuditIdentityByVerificationHash, hashPassword, consumeVerification,
      consumeVerificationSetPassword } = harness({ addressKey: "address-key-of-a-real-account" });
    await expect(service.verifyEmail({ token: TOKEN, password: PASSWORD }, source("203.0.113.43")))
      .resolves.toEqual({ status: "mfa_required" });
    expect(hashPassword).toHaveBeenCalledTimes(1);
    expect(Buffer.from((hashPassword.mock.calls[0] as unknown[])[0] as Uint8Array).toString("utf8")).toBe(PASSWORD);
    expect(findAuditIdentityByVerificationHash.mock.invocationCallOrder[0]!)
      .toBeLessThan(hashPassword.mock.invocationCallOrder[0]!);
    expect(hashPassword.mock.invocationCallOrder[0]!)
      .toBeLessThan(consumeVerificationSetPassword.mock.invocationCallOrder[0]!);
    expect(consumeVerificationSetPassword).toHaveBeenCalledTimes(1);
    expect(consumeVerificationSetPassword.mock.calls[0]![0]).toMatchObject({ newPasswordHash: HASHED });
    expect(consumeVerification).not.toHaveBeenCalled();
  });

  it("answers a refused password-setting consume as an invalid token", async () => {
    const { service, consumeVerificationSetPassword } = harness({ addressKey: "address-key-of-a-real-account" });
    consumeVerificationSetPassword.mockResolvedValueOnce(false);
    await expect(service.verifyEmail({ token: TOKEN, password: PASSWORD }, source("203.0.113.44")))
      .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
  });

  it("answers an Argon2 failure as a retryable 503 and consumes nothing", async () => {
    const { service, hashPassword, consumeVerification, consumeVerificationSetPassword } =
      harness({ addressKey: "address-key-of-a-real-account" });
    hashPassword.mockRejectedValueOnce(new Argon2InfrastructureError("ARGON2_POOL_UNAVAILABLE"));
    await expect(service.verifyEmail({ token: TOKEN, password: PASSWORD }, source("203.0.113.45")))
      .rejects.toMatchObject({ code: "AUTH_TEMPORARILY_UNAVAILABLE", statusCode: 503 });
    expect(consumeVerification).not.toHaveBeenCalled();
    expect(consumeVerificationSetPassword).not.toHaveBeenCalled();
  });

  // Guard (green before NV-14 too): today's verify never hashes, so this pins that an exhausted source still buys
  // none once a password is accepted.
  it("guard: an exhausted source buys no hash and no consume for a password request", async () => {
    const { service, limiter, findAuditIdentityByVerificationHash, hashPassword, consumeVerification,
      consumeVerificationSetPassword } = harness({ addressKey: "address-key-of-a-real-account" });
    exhaustVerifyBudget(limiter, "203.0.113.46");
    await expect(service.verifyEmail({ token: TOKEN, password: PASSWORD }, source("203.0.113.46")))
      .rejects.toMatchObject({ code: "AUTH_RATE_LIMITED" });
    expect(findAuditIdentityByVerificationHash).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
    expect(consumeVerification).not.toHaveBeenCalled();
    expect(consumeVerificationSetPassword).not.toHaveBeenCalled();
  });

  // Guard (green before NV-14 too): an unknown token buys no hash and gets today's invalid-token answer.
  it("guard: a token the lookup does not know buys no hash and answers as an invalid token", async () => {
    const { service, hashPassword, consumeVerification, consumeVerificationSetPassword } = harness(null);
    consumeVerification.mockResolvedValueOnce(false);
    await expect(service.verifyEmail({ token: OTHER_TOKEN, password: PASSWORD }, source("203.0.113.47")))
      .rejects.toMatchObject({ code: "VERIFICATION_TOKEN_INVALID", statusCode: 400 });
    expect(hashPassword).not.toHaveBeenCalled();
    expect(consumeVerificationSetPassword).not.toHaveBeenCalled();
  });

  // Guard: a request without a password (an older UI) keeps the old consume and hashes nothing.
  it("guard: a password-less request keeps the old consume", async () => {
    const { service, hashPassword, consumeVerification, consumeVerificationSetPassword } =
      harness({ addressKey: "address-key-of-a-real-account" });
    await expect(service.verifyEmail({ token: TOKEN }, source("203.0.113.48")))
      .resolves.toEqual({ status: "mfa_required" });
    expect(consumeVerification).toHaveBeenCalledTimes(1);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(consumeVerificationSetPassword).not.toHaveBeenCalled();
  });
});
