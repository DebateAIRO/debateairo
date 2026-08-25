import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type Argon2Executor,
  type CryptoEnvelope,
  TOTP_PROFILE,
  decodeBase32,
  encodeBase32,
  generateRecoveryCodes,
  generateTotpSecret,
  generateVerificationToken,
  hashPassword,
  matchTotpStep,
  totpCodeAtStep,
  totpProvisioningUri
} from "../../packages/crypto/src/index.js";
import { MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue } from "../../packages/register/src/mfa-policy.js";
import { MfaEnrollmentService, MfaVerificationLimiter } from "../../apps/api/src/mfa.js";
import { totpQrMatrix } from "../../apps/ui/lib/totpQr.js";

describe("S4 TOTP and recovery-code primitives", () => {
  it("pins the interoperable TOTP profile and reproduces the RFC 6238 SHA-1 vectors", () => {
    expect(TOTP_PROFILE).toEqual({ algorithm: "SHA1", digits: 6, periodSeconds: 30, secretBytes: 20 });
    const secret = Buffer.from("12345678901234567890", "ascii");
    const expected = ["287082", "081804", "050471", "005924", "279037", "353130"];
    const instants = [59, 1_111_111_109, 1_111_111_111, 1_234_567_890, 2_000_000_000, 20_000_000_000];
    expect(instants.map((seconds) => totpCodeAtStep(secret, Math.floor(seconds / 30))))
      .toEqual(expected);
  });

  it("generates exactly 160 secret bits and an unpadded, round-trippable Base32 value", () => {
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(20);
    const encoded = encodeBase32(secret);
    expect(encoded).toMatch(/^[A-Z2-7]{32}$/);
    expect(encoded).not.toContain("=");
    expect(decodeBase32(encoded)).toEqual(secret);
  });

  it("puts the issuer in both the label and query and exposes no optional algorithm knobs", () => {
    const uri = new URL(totpProvisioningUri(Buffer.alloc(20, 7), {
      issuer: "DebateAIRO",
      accountLabel: "pseudonym amber-raven"
    }));
    expect(uri.protocol).toBe("otpauth:");
    expect(decodeURIComponent(uri.pathname)).toBe("/DebateAIRO:pseudonym amber-raven");
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: encodeBase32(Buffer.alloc(20, 7)),
      issuer: "DebateAIRO",
      algorithm: "SHA1",
      digits: "6",
      period: "30"
    });
  });

  it("accepts only the ±1 drift window and rejects a replayed or wider-step code", () => {
    const secret = Buffer.alloc(20, 9);
    const current = 50_000;
    expect(matchTotpStep(secret, totpCodeAtStep(secret, current - 1), current, null)).toEqual({
      status: "accepted", step: current - 1
    });
    expect(matchTotpStep(secret, totpCodeAtStep(secret, current + 1), current, current)).toEqual({
      status: "accepted", step: current + 1
    });
    expect(matchTotpStep(secret, totpCodeAtStep(secret, current), current, current)).toEqual({
      status: "replayed"
    });
    expect(matchTotpStep(secret, totpCodeAtStep(secret, current + 2), current, null)).toEqual({
      status: "invalid"
    });
  });

  it("generates ten distinct, numbered, 128-bit human-transcribable recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes)).toHaveLength(10);
    for (const [index, code] of codes.entries()) {
      expect(code).toMatch(new RegExp(`^${String(index + 1).padStart(2, "0")}-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){5}-[A-HJ-NP-Z2-9]{2}$`));
    }
  });

  it("renders the independently decoded, local-only version 10-L provisioning QR", () => {
    const uri = "otpauth://totp/DebateAIRO%3Aamber-raven-010203"
      + "?secret=AEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIB&issuer=DebateAIRO&algorithm=SHA1&digits=6&period=30";
    const matrix = totpQrMatrix(uri);
    expect(matrix).toHaveLength(57);
    expect(matrix.every((row) => row.length === 57 && row.every((module) => typeof module === "boolean")))
      .toBe(true);
    const serialized = matrix.map((row) => row.map((module) => module ? "1" : "0").join(""))
      .join("\n");
    // This fixture was decoded back to the exact URI by macOS Vision's
    // independent barcode implementation before the fingerprint was pinned.
    expect(createHash("sha256").update(serialized).digest("hex"))
      .toBe("33020c92cdc65255ab2c3df7327b159dca8223019964b5618c1729a8c375769e");
  });

  it("rejects non-otpauth input and payloads beyond the fixed QR capacity", () => {
    expect(() => totpQrMatrix("https://example.test/not-a-secret"))
      .toThrow("TOTP_QR_URI_INVALID");
    expect(() => totpQrMatrix(`otpauth://totp/${"A".repeat(280)}`))
      .toThrow("TOTP_QR_PAYLOAD_TOO_LONG");
  });
});

function fakeArgon2(): Argon2Executor {
  const values = new Map<string, string>();
  let sequence = 0;
  return {
    async hashPassword(password, _salt, parameters) {
      const id = String(++sequence).padStart(22, "A");
      const digest = String(sequence).padStart(43, "B");
      const encoded = `$argon2id$v=19$m=${parameters.memoryCostKiB},t=${parameters.timeCost},p=${parameters.parallelism}$${id}$${digest}`;
      values.set(encoded, Buffer.from(password).toString("hex"));
      return encoded;
    },
    async verifyPassword(password, encodedHash) {
      return values.get(encodedHash) === Buffer.from(password).toString("hex");
    },
    async hashAuditContext() {
      throw new Error("unused");
    }
  };
}

describe("S4 MFA enrolment service", () => {
  it("fails closed at temporary account/source ceilings and reopens after the ruled window", () => {
    const policy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value).verificationLimits;
    let now = new Date(0);
    const limiter = new MfaVerificationLimiter(policy);
    for (let index = 0; index < policy.perEnrollment; index += 1) {
      expect(limiter.consume("enrollment-a", "198.51.100.1", now)).toBe(true);
    }
    expect(limiter.decide("enrollment-a", "198.51.100.1", now)).toEqual({
      allowed: false, auditRefusal: true
    });
    expect(limiter.decide("enrollment-a", "198.51.100.1", now)).toEqual({
      allowed: false, auditRefusal: false
    });
    now = new Date(policy.temporaryLockMs + 1);
    expect(limiter.consume("enrollment-a", "198.51.100.1", now)).toBe(true);

    const spray = new MfaVerificationLimiter(policy);
    for (let index = 0; index < policy.perSourceAcrossAccounts; index += 1) {
      expect(spray.consume(`enrollment-${index}`, "203.0.113.4", new Date(0))).toBe(true);
    }
    expect(spray.consume("enrollment-overflow", "203.0.113.4", new Date(0))).toBe(false);
  });

  it("keeps the seed encrypted, requires TOTP then a recovery-code type-back, and replaces a used code", async () => {
    const policy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
    const userId = "11111111-1111-4111-8111-111111111111";
    const pseudonym = "amber-raven-010203";
    const token = generateVerificationToken();
    const dek = Buffer.alloc(32, 19);
    const now = new Date(1_800_000_000_000);
    let factor: {
      factorId: string;
      secretCiphertext: CryptoEnvelope;
      state: "pending" | "verified_pending_recovery" | "recovery_pending" | "active";
      lastAcceptedStep: number | null;
    } | undefined;
    let accountState: "pending_mfa" | "active" = "pending_mfa";
    let nextRecoveryId = 0;
    const recovery = new Map<number, { id: string; hash: string; consumed: boolean }>();
    const failures: string[] = [];
    const repository = {
      async readMfaEnrollmentIdentity() {
        return accountState === "pending_mfa" ? { userId, pseudonym } : null;
      },
      async beginTotpEnrollment(input: { factorId: string; secretCiphertext: CryptoEnvelope }) {
        factor = { factorId: input.factorId, secretCiphertext: input.secretCiphertext, state: "pending", lastAcceptedStep: null };
        return { userId, pseudonym, factorId: input.factorId };
      },
      async readTotpEnrollment() {
        return factor === undefined || factor.state === "active" ? null : {
          userId, pseudonym, factorId: factor.factorId,
          secretCiphertext: factor.secretCiphertext,
          lastAcceptedStep: factor.lastAcceptedStep,
          factorState: factor.state
        };
      },
      async confirmTotpEnrollment(input: { acceptedStep: number }) {
        if (factor === undefined || factor.state !== "pending") return "invalid" as const;
        if (factor.lastAcceptedStep !== null && input.acceptedStep <= factor.lastAcceptedStep) return "replayed" as const;
        factor.lastAcceptedStep = input.acceptedStep;
        factor.state = "verified_pending_recovery";
        return "confirmed" as const;
      },
      async recordMfaVerificationFailure(input: { reason: string }) {
        failures.push(input.reason);
      },
      async storeRecoveryCodes(input: { codes: readonly { slot: number; hash: string }[] }) {
        if (factor?.state !== "verified_pending_recovery" && factor?.state !== "recovery_pending") return false;
        recovery.clear();
        for (const code of input.codes) {
          recovery.set(code.slot, { id: `recovery-${++nextRecoveryId}`, hash: code.hash, consumed: false });
        }
        factor.state = "recovery_pending";
        return true;
      },
      async readRecoveryCodeForConfirmation(_tokenHash: string, slot: number) {
        const code = recovery.get(slot);
        return code === undefined || code.consumed ? null : {
          userId, recoveryCodeId: code.id, codeHash: code.hash, codeSlot: slot
        };
      },
      async activateMfaEnrollment(input: { recoveryCodeId: string }) {
        if (factor?.state !== "recovery_pending"
          || ![...recovery.values()].some((code) => code.id === input.recoveryCodeId)) return false;
        factor.state = "active";
        accountState = "active";
        return true;
      },
      async readRecoveryCodeForUse(_userId: string, slot: number) {
        const code = recovery.get(slot);
        return code === undefined || code.consumed ? null : {
          userId, recoveryCodeId: code.id, codeHash: code.hash, codeSlot: slot
        };
      },
      async consumeAndReplaceRecoveryCode(input: { recoveryCodeId: string; replacementHash: string }) {
        const found = [...recovery.entries()].find(([, code]) =>
          code.id === input.recoveryCodeId && !code.consumed);
        if (found === undefined) return false;
        const [slot, old] = found;
        old.consumed = true;
        recovery.set(slot, { id: `recovery-${++nextRecoveryId}`, hash: input.replacementHash, consumed: false });
        return true;
      }
    };
    const service = new MfaEnrollmentService({
      repository: repository as never,
      dekStore: {
        async store() { throw new Error("unused"); },
        async destroy() { return "ALREADY_ABSENT"; },
        async exists() { return true; },
        async load() { return Buffer.from(dek); }
      },
      argon2: fakeArgon2(),
      policy,
      clock: () => now
    });
    const source = { ip: "198.51.100.9", userAgent: "vitest-mfa", requestId: "mfa-1" };

    const begun = await service.beginTotp({ enrollmentToken: token }, source);
    expect(begun.status).toBe("verification_required");
    expect(JSON.stringify(factor!.secretCiphertext)).not.toContain(begun.secret);
    const currentStep = Math.floor(now.getTime() / 30_000);
    const code = totpCodeAtStep(decodeBase32(begun.secret), currentStep);
    await expect(service.verifyTotp({ enrollmentToken: token, code }, source))
      .resolves.toEqual({ status: "recovery_codes_required" });

    const unseen = await service.generateRecoveryCodes({ enrollmentToken: token }, source);
    const generated = await service.generateRecoveryCodes({ enrollmentToken: token }, source);
    expect(generated.recoveryCodes).toHaveLength(10);
    expect(generated.recoveryCodes).not.toEqual(unseen.recoveryCodes);
    for (const plaintext of generated.recoveryCodes) {
      expect([...recovery.values()].every((stored) => !stored.hash.includes(plaintext))).toBe(true);
    }
    await expect(service.confirmRecoveryCode({
      enrollmentToken: token,
      recoveryCode: unseen.recoveryCodes[0]!
    }, source)).rejects.toMatchObject({ code: "MFA_RECOVERY_CONFIRMATION_INVALID" });
    await expect(service.confirmRecoveryCode({
      enrollmentToken: token,
      recoveryCode: generated.recoveryCodes[0]!
    }, source)).resolves.toEqual({ status: "active" });
    expect(accountState).toBe("active");

    const first = await service.consumeRecoveryCode({
      userId, recoveryCode: generated.recoveryCodes[1]!
    }, source);
    expect(first).toMatchObject({ consumed: true });
    await expect(service.consumeRecoveryCode({
      userId, recoveryCode: generated.recoveryCodes[1]!
    }, source)).resolves.toEqual({ consumed: false });
    expect(failures).toEqual(["MFA_RECOVERY_CONFIRMATION_INVALID"]);
  });

  it("bounds recovery hashing so a registration credential job coexists within two workers", async () => {
    const policy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
    const token = generateVerificationToken();
    const requestSource = { ip: "198.51.100.10", userAgent: "vitest-mfa", requestId: "mfa-capacity" };
    let entered = 0;
    let active = 0;
    let maximumActive = 0;
    let passThrough = false;
    const releases: Array<() => void> = [];
    const encoded = (sequence: number) =>
      `$argon2id$v=19$m=19456,t=2,p=1$${String(sequence).padStart(22, "A")}$${String(sequence).padStart(43, "B")}`;
    const controlled: Argon2Executor = {
      async hashPassword() {
        const sequence = ++entered;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        return new Promise<string>((resolve) => {
          const finish = () => {
            active -= 1;
            resolve(encoded(sequence));
          };
          if (passThrough) finish();
          else releases.push(finish);
        });
      },
      async verifyPassword() { return false; },
      async hashAuditContext() { throw new Error("unused"); }
    };
    let stored: readonly Readonly<{ slot: number; hash: string }>[] = [];
    const service = new MfaEnrollmentService({
      repository: {
        async readTotpEnrollment() {
          return {
            userId: "11111111-1111-4111-8111-111111111111",
            pseudonym: "amber-raven-010203",
            factorId: "22222222-2222-4222-8222-222222222222",
            secretCiphertext: { v: 1, keyId: "unused", nonce: "", ct: "", tag: "" },
            lastAcceptedStep: 1,
            factorState: "verified_pending_recovery" as const
          };
        },
        async storeRecoveryCodes(input: { codes: readonly Readonly<{ slot: number; hash: string }>[] }) {
          stored = input.codes;
          return true;
        },
        async recordMfaVerificationFailure() { throw new Error("unused"); }
      } as never,
      dekStore: {
        async store() { throw new Error("unused"); },
        async destroy() { return "ALREADY_ABSENT"; },
        async exists() { return true; },
        async load() { throw new Error("unused"); }
      },
      argon2: controlled,
      policy
    });

    const generating = service.generateRecoveryCodes({ enrollmentToken: token }, requestSource);
    await vi.waitFor(() => expect(entered).toBeGreaterThan(0));
    const recoveryJobsSubmittedBeforeRegistration = entered;
    const registration = hashPassword(controlled, "registration password", {
      memoryCostKiB: 65_536, timeCost: 3, parallelism: 1, hashLength: 32
    });
    await vi.waitFor(() => expect(entered).toBeGreaterThan(recoveryJobsSubmittedBeforeRegistration));
    try {
      expect(recoveryJobsSubmittedBeforeRegistration).toBeLessThanOrEqual(2);
      expect(maximumActive).toBeLessThanOrEqual(2);
    } finally {
      passThrough = true;
      for (const release of releases.splice(0)) release();
    }
    const [, registrationHash] = await Promise.all([generating, registration]);
    expect(stored).toHaveLength(10);
    expect(registrationHash).toMatch(/^\$argon2id\$/);
  });
});
