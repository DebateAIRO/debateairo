import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { decrypt, type CryptoEnvelope } from "@debateai/crypto";
import type { PendingAccountInput } from "@debateai/db";
import { normalizeManualPhone } from "../../apps/api/src/phone-profile.js";
import { AuthFlowError, InProcessAuthRateLimiter, RegistrationService } from "../../apps/api/src/registration.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";

const phone = "+40 722 123 456";
const canonical = "+40722123456";
const source = { ip: "192.0.2.51", userAgent: "phone-profile-test", requestId: "phone-profile-test" };

function harness(provisionFails = false) {
  const records: PendingAccountInput[] = [];
  const keys = new Map<string, Buffer>();
  const originalKeys: Uint8Array[] = [];
  const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
  const service = new RegistrationService({
    repository: {
      findAuditIdentityByBlindIndex: async () => null,
      createPendingAccount: async (input: PendingAccountInput, beforeCommit: () => Promise<void>) => {
        records.push(input);
        if (provisionFails) throw new Error("PHONE_PROFILE_TEST_PROVISION_FAILED");
        await beforeCommit();
        return { status: "created" as const, userId: input.userId, channelBindingId: randomUUID(), verificationExpiresAt: input.verificationExpiresAt, reservationId: randomUUID() };
      },
      recordVerificationDelivery: async () => undefined,
      recordRegistrationFailure: async () => undefined,
      recordRateLimitRefusal: async () => undefined
    } as never,
    mail: new MemoryMailSender(),
    dekStore: { store: async (id, key) => { keys.set(id, Buffer.from(key)); originalKeys.push(key); }, destroy: async () => "ALREADY_ABSENT" as const },
    blindIndexKey: Buffer.alloc(32, 0x3c), policy,
    limiter: new InProcessAuthRateLimiter(policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs),
    argon2: { hashPassword: async () => `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}` } as never,
    sleep: async () => undefined
  });
  return { service, records, keys, originalKeys };
}

const validInput = { email: "phone@example.test", password: "correct horse battery staple", phone, adultAffirmed: true };
const aad = (id: string) => ["identity", "user.phone_ciphertext", id, "run:none", id, `user-dek:${id}`, "1"] as const;

describe("manual phone profile", () => {
  it("normalizes an explicit international number to canonical E.164", () => {
    expect(normalizeManualPhone(phone)).toBe(canonical);
  });

  it.each([undefined, null, 40722123456, "", "0722 123 456", "Call +40 722 123 456", "+40 722 123 456 ext. 9", "+40 722 123 456;ext=9", "+40 722 123 456 x9", "+1", `+${"1".repeat(128)}`])(
    "rejects input without an entire possible international number: %s", (value) => {
      expect(() => normalizeManualPhone(value)).toThrow();
    }
  );

  it("creates encrypted manual/unverified phone with optional recovery absent", async () => {
    const { service, records, keys, originalKeys } = harness();
    await service.register(validInput, source);
    await service.drainMailDispatches();
    const record = records[0]!;
    expect(records).toHaveLength(1);
    expect(record.recoveryEmailCiphertext).toBeNull();
    expect(record.phoneSource).toBe("manual");
    expect(record.phoneVerificationStatus).toBe("unverified");
    expect(record.phoneUpdatedAt).toEqual(record.occurredAt);
    expect(JSON.stringify(record)).not.toContain(canonical);
    expect(JSON.stringify(record)).not.toContain(phone);
    expect(originalKeys.every(key => key.every(byte => byte === 0))).toBe(true);
    const key = keys.get(record.userId)!;
    expect(decrypt(key, record.phoneCiphertext, aad(record.userId)).toString("utf8")).toBe(canonical);
    expect(() => decrypt(key, record.phoneCiphertext, aad(randomUUID()))).toThrow();
    const changed: CryptoEnvelope = { ...record.phoneCiphertext, ct: (record.phoneCiphertext.ct.startsWith("A") ? "B" : "A") + record.phoneCiphertext.ct.slice(1) };
    expect(() => decrypt(key, changed, aad(record.userId))).toThrow();
    for (const stored of keys.values()) stored.fill(0);
  });

  it("keeps phone plaintext out of provisioning failure logs and public errors", async () => {
    const logs: string[] = [];
    const logging = vi.spyOn(console, "error").mockImplementation((...values) => { logs.push(values.map(String).join(" ")); });
    const { service, records } = harness(true);
    try {
      await expect(service.register(validInput, source)).rejects.toMatchObject({ code: "AUTH_REGISTRATION_FAILED" });
      await service.drainMailDispatches();
      expect(logs.some(line => line.includes("AUTH_REGISTRATION_PROVISION_FAILED"))).toBe(true);
      expect(JSON.stringify({ logs, records })).not.toContain(canonical);
      expect(JSON.stringify({ logs, records })).not.toContain(phone);
    } finally { logging.mockRestore(); }
  });

  it("rejects legacy registration without a phone before any identity mutation", async () => {
    const { service, records } = harness();
    const { phone: _phone, ...legacy } = validInput;
    await expect(service.register({ ...legacy, recoveryEmail: "recovery@example.test" } as never, source))
      .rejects.toBeInstanceOf(AuthFlowError);
    expect(records).toHaveLength(0);
  });
});
