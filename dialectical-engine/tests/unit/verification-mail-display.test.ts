import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PendingAccountInput } from "@debateai/db";
import { RegistrationService, InProcessAuthRateLimiter } from "../../apps/api/src/registration.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
import { authPolicyFromRegisterRows, AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS } from "../../packages/register/src/auth-policy.js";
const storedExpiry = new Date("2026-10-05T07:41:00Z");
const id = "11111111-1111-4111-8111-111111111111";
function harness() {
  const mail = new MemoryMailSender(), policy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
  const intentions: Date[] = [];
  const service = new RegistrationService({
    repository: {
      findAuditIdentityByBlindIndex: async () => null,
      createPendingAccount: async (input: PendingAccountInput, beforeCommit: () => Promise<void>) => {
        intentions.push(input.verificationExpiresAt); await beforeCommit();
        return { status: "created", userId: input.userId, channelBindingId: id, reservationId: id, verificationExpiresAt: storedExpiry };
      },
      prepareVerificationResend: async (input: { expiresAt: Date }) => {
        intentions.push(input.expiresAt);
        return { status: "send", userId: id, channelBindingId: id, reservationId: id, verificationExpiresAt: storedExpiry };
      },
      recordVerificationDelivery: async () => undefined, recordRegistrationFailure: async () => undefined, recordRateLimitRefusal: async () => undefined
    } as never,
    mail, dekStore: { store: async () => undefined, destroy: async () => "ALREADY_ABSENT" as const },
    blindIndexKey: Buffer.alloc(32, 0x3c), policy,
    limiter: new InProcessAuthRateLimiter(policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs),
    argon2: { hashPassword: async () => `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`, hashAuditContext: async () => "ab".repeat(32) } as never,
    clock: () => new Date("2026-10-04T01:00:00Z"), sleep: async () => undefined
  });
  return { service, mail, intentions };
}
describe("queued verification display metadata", () => {
  it.each(["register", "resend"] as const)("copies %s display and sends stored expiry despite request mutation", async route => {
    const { service, mail, intentions } = harness();
    const display = { locale: "ro", timeZone: "Europe/Bucharest" };
    const source = { ip: "81.196.1.2", userAgent: "display-test", requestId: randomUUID(), mailDisplay: display };
    if (route === "register") await service.register({ email: "person@example.test", password: "correct horse battery staple", phone: "+40722123456", adultAffirmed: true }, source);
    else await service.resendVerification({ email: "person@example.test" }, source);
    display.locale = "en-US"; display.timeZone = "Asia/Tokyo";
    await service.drainMailDispatches();
    expect(mail.messages).toHaveLength(1); expect(mail.messages[0]!.display).toEqual({ locale: "ro", timeZone: "Europe/Bucharest" });
    expect(mail.messages[0]!.expiresAt).toEqual(storedExpiry); expect(mail.messages[0]!.attemptId).toBe(id);
    expect(intentions).toHaveLength(1); expect(intentions[0]).not.toEqual(storedExpiry);
  });
  it.each([undefined, { locale: "en-GB", timeZone: "Invalid/Zone" }])("normalizes missing or invalid zone without changing expiry", async display => {
    const { service, mail } = harness();
    await service.resendVerification({ email: "person@example.test" }, { ip: "81.196.1.2", userAgent: "display-test", requestId: randomUUID(), ...(display === undefined ? {} : { mailDisplay: display }) });
    await service.drainMailDispatches();
    expect(mail.messages[0]!.display).toEqual({ locale: display?.locale ?? "en", timeZone: null });
    expect(mail.messages[0]!.expiresAt).toEqual(storedExpiry);
  });
});
