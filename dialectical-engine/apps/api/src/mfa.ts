import { randomUUID } from "node:crypto";
import type { AuthSourceContext, PostgresIdentityRepository } from "@debateai/db";
import type { MfaPolicy } from "@debateai/register";
import {
  Argon2InfrastructureError,
  decrypt,
  encodeBase32,
  encrypt,
  generateRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hashVerificationToken,
  matchTotpStep,
  normalizeRecoveryCode,
  recoveryCodeSlot,
  totpProvisioningUri,
  verifyRecoveryCode,
  type Argon2Executor,
  type ReadableUserDekStore
} from "@debateai/crypto";
import { AuthFlowError } from "./registration.js";

type MfaRepository = Pick<PostgresIdentityRepository,
  | "activateMfaEnrollment"
  | "beginTotpEnrollment"
  | "confirmTotpEnrollment"
  | "consumeAndReplaceRecoveryCode"
  | "readMfaEnrollmentIdentity"
  | "readRecoveryCodeForConfirmation"
  | "readRecoveryCodeForUse"
  | "readTotpEnrollment"
  | "recordMfaVerificationFailure"
  | "storeRecoveryCodes"
>;

interface RateEntry {
  count: number;
  windowStartedAt: number;
  blockedUntil: number;
  refusalAuditedUntil: number;
}

export type MfaRateDecision = Readonly<{ allowed: boolean; auditRefusal: boolean }>;

/**
 * A bounded, fail-closed online-guessing limiter. Account and source budgets
 * are separate, both expire automatically, and no remote sequence can produce
 * a permanent account lock.
 */
export class MfaVerificationLimiter {
  private readonly entries = new Map<string, RateEntry>();
  private capacityRefusalAuditedUntil = 0;

  constructor(private readonly policy: MfaPolicy["verificationLimits"]) {}

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil <= now && now - entry.windowStartedAt >= this.policy.windowMs) {
        this.entries.delete(key);
      }
    }
  }

  private take(key: string, limit: number, now: number): MfaRateDecision {
    this.prune(now);
    let entry = this.entries.get(key);
    if (entry === undefined) {
      if (this.entries.size >= this.policy.capacity) {
        const auditRefusal = this.capacityRefusalAuditedUntil <= now;
        if (auditRefusal) this.capacityRefusalAuditedUntil = now + this.policy.windowMs;
        return Object.freeze({ allowed: false, auditRefusal });
      }
      entry = { count: 0, windowStartedAt: now, blockedUntil: 0, refusalAuditedUntil: 0 };
      this.entries.set(key, entry);
    }
    if (entry.blockedUntil > now) {
      return Object.freeze({ allowed: false, auditRefusal: false });
    }
    if (now - entry.windowStartedAt >= this.policy.windowMs) {
      entry.count = 0;
      entry.windowStartedAt = now;
      entry.blockedUntil = 0;
      entry.refusalAuditedUntil = 0;
    }
    entry.count += 1;
    if (entry.count > limit) {
      entry.blockedUntil = now + this.policy.temporaryLockMs;
      const auditRefusal = entry.refusalAuditedUntil <= now;
      if (auditRefusal) entry.refusalAuditedUntil = entry.blockedUntil;
      return Object.freeze({ allowed: false, auditRefusal });
    }
    return Object.freeze({ allowed: true, auditRefusal: false });
  }

  decide(enrollmentKey: string, sourceIp: string, now: Date): MfaRateDecision {
    const instant = now.getTime();
    // Source first: a spray across many accounts receives one shared ceiling.
    const source = this.take(`source:${sourceIp}`, this.policy.perSourceAcrossAccounts, instant);
    if (!source.allowed) return source;
    return this.take(`enrollment:${enrollmentKey}`, this.policy.perEnrollment, instant);
  }

  consume(enrollmentKey: string, sourceIp: string, now: Date): boolean {
    return this.decide(enrollmentKey, sourceIp, now).allowed;
  }

  clearEnrollment(enrollmentKey: string): void {
    this.entries.delete(`enrollment:${enrollmentKey}`);
  }

  size(): number {
    return this.entries.size;
  }
}

export interface MfaApplication {
  beginTotp(input: { readonly enrollmentToken: string }, source: AuthSourceContext): Promise<Readonly<{
    status: "verification_required";
    secret: string;
    otpauthUri: string;
  }>>;
  verifyTotp(input: {
    readonly enrollmentToken: string;
    readonly code: string;
  }, source: AuthSourceContext): Promise<Readonly<{ status: "recovery_codes_required" }>>;
  generateRecoveryCodes(input: {
    readonly enrollmentToken: string;
  }, source: AuthSourceContext): Promise<Readonly<{
    status: "confirmation_required";
    recoveryCodes: readonly string[];
  }>>;
  confirmRecoveryCode(input: {
    readonly enrollmentToken: string;
    readonly recoveryCode: string;
  }, source: AuthSourceContext): Promise<Readonly<{ status: "active" }>>;
}

function enrollmentHash(token: string): string {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new AuthFlowError("MFA_ENROLLMENT_INVALID");
  }
  return hashVerificationToken(token);
}

function normalizedSourceIp(source: AuthSourceContext): string {
  const value = typeof source?.ip === "string" ? source.ip.trim() : "";
  return (value === "" ? "unknown" : value).slice(0, 64);
}

function mfaFailure(error: unknown): unknown {
  return error instanceof Argon2InfrastructureError
    ? new AuthFlowError("AUTH_TEMPORARILY_UNAVAILABLE", { cause: error })
    : error;
}

export class MfaEnrollmentService implements MfaApplication {
  private readonly limiter: MfaVerificationLimiter;

  constructor(private readonly dependencies: Readonly<{
    repository: MfaRepository;
    dekStore: ReadableUserDekStore;
    argon2: Argon2Executor;
    policy: MfaPolicy;
    clock?: () => Date;
  }>) {
    this.limiter = new MfaVerificationLimiter(dependencies.policy.verificationLimits);
  }

  private now(): Date {
    return new Date((this.dependencies.clock?.() ?? new Date()).getTime());
  }

  private async rateLimit(
    enrollmentTokenHash: string,
    source: AuthSourceContext,
    now: Date
  ): Promise<void> {
    const decision = this.limiter.decide(enrollmentTokenHash, normalizedSourceIp(source), now);
    if (decision.allowed) return;
    if (decision.auditRefusal) {
      await this.dependencies.repository.recordMfaVerificationFailure({
        enrollmentTokenHash,
        reason: "MFA_RATE_LIMITED",
        occurredAt: now,
        source
      });
    }
    throw new AuthFlowError("MFA_RATE_LIMITED");
  }

  async beginTotp(
    input: { readonly enrollmentToken: string },
    source: AuthSourceContext
  ): Promise<Readonly<{ status: "verification_required"; secret: string; otpauthUri: string }>> {
    const tokenHash = enrollmentHash(input.enrollmentToken);
    const now = this.now();
    await this.rateLimit(tokenHash, source, now);
    const identity = await this.dependencies.repository.readMfaEnrollmentIdentity(tokenHash);
    if (identity === null) {
      await this.dependencies.repository.recordMfaVerificationFailure({
        enrollmentTokenHash: tokenHash,
        reason: "MFA_ENROLLMENT_INVALID",
        occurredAt: now,
        source
      });
      throw new AuthFlowError("MFA_ENROLLMENT_INVALID");
    }
    const existing = await this.dependencies.repository.readTotpEnrollment(tokenHash);
    if (existing !== null && existing.factorState !== "pending") {
      throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
    }
    const factorId = randomUUID();
    const secret = generateTotpSecret();
    let dek: Buffer | undefined;
    try {
      dek = await this.dependencies.dekStore.load(identity.userId);
      const secretCiphertext = encrypt(dek, secret, [
        "identity", "mfa_factor.secret_ciphertext", factorId, "run:none", identity.userId,
        `user-dek:${identity.userId}`, "1"
      ]);
      const begun = await this.dependencies.repository.beginTotpEnrollment({
        enrollmentTokenHash: tokenHash,
        factorId,
        secretCiphertext,
        occurredAt: now,
        source
      });
      if (begun === null || begun.userId !== identity.userId || begun.factorId !== factorId) {
        throw new AuthFlowError("MFA_ENROLLMENT_INVALID");
      }
      const encoded = encodeBase32(secret);
      return Object.freeze({
        status: "verification_required" as const,
        // The authorized begin response is the only lawful plaintext exposure;
        // the value is never retrievable from a later route, log or datastore.
        secret: encoded,
        otpauthUri: totpProvisioningUri(secret, {
          issuer: this.dependencies.policy.issuer,
          accountLabel: begun.pseudonym
        })
      });
    } finally {
      secret.fill(0);
      dek?.fill(0);
    }
  }

  async verifyTotp(input: {
    readonly enrollmentToken: string;
    readonly code: string;
  }, source: AuthSourceContext): Promise<Readonly<{ status: "recovery_codes_required" }>> {
    try {
      const tokenHash = enrollmentHash(input.enrollmentToken);
      const now = this.now();
      await this.rateLimit(tokenHash, source, now);
      const enrollment = await this.dependencies.repository.readTotpEnrollment(tokenHash);
      if (enrollment === null || enrollment.factorState !== "pending") {
        throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
      }
      let dek: Buffer | undefined;
      let secret: Buffer | undefined;
      try {
        dek = await this.dependencies.dekStore.load(enrollment.userId);
        secret = decrypt(dek, enrollment.secretCiphertext, [
          "identity", "mfa_factor.secret_ciphertext", enrollment.factorId,
          "run:none", enrollment.userId, `user-dek:${enrollment.userId}`, "1"
        ]);
        const matched = matchTotpStep(
          secret,
          input.code,
          Math.floor(now.getTime() / (this.dependencies.policy.totp.periodSeconds * 1_000)),
          enrollment.lastAcceptedStep
        );
        if (matched.status !== "accepted") {
          await this.dependencies.repository.recordMfaVerificationFailure({
            enrollmentTokenHash: tokenHash,
            reason: "MFA_TOTP_INVALID",
            occurredAt: now,
            source
          });
          throw new AuthFlowError(matched.status === "replayed" ? "MFA_TOTP_REPLAYED" : "MFA_TOTP_INVALID");
        }
        const result = await this.dependencies.repository.confirmTotpEnrollment({
          enrollmentTokenHash: tokenHash,
          factorId: enrollment.factorId,
          acceptedStep: matched.step,
          occurredAt: now,
          source
        });
        if (result !== "confirmed") {
          throw new AuthFlowError(result === "replayed" ? "MFA_TOTP_REPLAYED" : "MFA_ENROLLMENT_INVALID");
        }
        this.limiter.clearEnrollment(tokenHash);
        return Object.freeze({ status: "recovery_codes_required" as const });
      } finally {
        secret?.fill(0);
        dek?.fill(0);
      }
    } catch (error) {
      throw mfaFailure(error);
    }
  }

  async generateRecoveryCodes(input: {
    readonly enrollmentToken: string;
  }, source: AuthSourceContext): Promise<Readonly<{
    status: "confirmation_required";
    recoveryCodes: readonly string[];
  }>> {
    try {
      const tokenHash = enrollmentHash(input.enrollmentToken);
      const now = this.now();
      await this.rateLimit(tokenHash, source, now);
      const enrollment = await this.dependencies.repository.readTotpEnrollment(tokenHash);
      if (enrollment === null
        || (enrollment.factorState !== "verified_pending_recovery"
          && enrollment.factorState !== "recovery_pending")) {
        throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
      }
      const codes = generateRecoveryCodes();
      // Keep at most one recovery-code KDF queued at a time. The shared
      // credential pool has two workers and registration must retain a lane;
      // enqueuing all ten here lets one enrolment monopolize both workers and
      // strand registration behind eight additional credential jobs.
      const hashes: string[] = [];
      for (const code of codes) {
        hashes.push(await hashRecoveryCode(
          this.dependencies.argon2,
          code,
          this.dependencies.policy.recoveryCodes.argon2id
        ));
      }
      const stored = await this.dependencies.repository.storeRecoveryCodes({
        enrollmentTokenHash: tokenHash,
        factorId: enrollment.factorId,
        codes: hashes.map((hash, index) => Object.freeze({ slot: index + 1, hash })),
        occurredAt: now,
        source
      });
      if (!stored) throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
      this.limiter.clearEnrollment(tokenHash);
      return Object.freeze({
        status: "confirmation_required" as const,
        recoveryCodes: codes
      });
    } catch (error) {
      throw mfaFailure(error);
    }
  }

  async confirmRecoveryCode(input: {
    readonly enrollmentToken: string;
    readonly recoveryCode: string;
  }, source: AuthSourceContext): Promise<Readonly<{ status: "active" }>> {
    try {
      const tokenHash = enrollmentHash(input.enrollmentToken);
      const now = this.now();
      await this.rateLimit(tokenHash, source, now);
      let code: string;
      try {
        code = normalizeRecoveryCode(input.recoveryCode);
      } catch {
        code = "";
      }
      const record = code === "" ? null : await this.dependencies.repository
        .readRecoveryCodeForConfirmation(tokenHash, recoveryCodeSlot(code));
      const valid = record !== null
        && await verifyRecoveryCode(this.dependencies.argon2, record.codeHash, code);
      if (!valid || record === null) {
        await this.dependencies.repository.recordMfaVerificationFailure({
          enrollmentTokenHash: tokenHash,
          reason: "MFA_RECOVERY_CONFIRMATION_INVALID",
          occurredAt: now,
          source
        });
        throw new AuthFlowError("MFA_RECOVERY_CONFIRMATION_INVALID");
      }
      if (!await this.dependencies.repository.activateMfaEnrollment({
        enrollmentTokenHash: tokenHash,
        recoveryCodeId: record.recoveryCodeId,
        occurredAt: now,
        source
      })) {
        throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
      }
      this.limiter.clearEnrollment(tokenHash);
      return Object.freeze({ status: "active" as const });
    } catch (error) {
      throw mfaFailure(error);
    }
  }

  /** Future S5/S10 session code calls this with a server-derived user id. */
  async consumeRecoveryCode(input: {
    readonly userId: string;
    readonly recoveryCode: string;
  }, source: AuthSourceContext): Promise<Readonly<{
    consumed: true;
    replacementCode: string;
  }> | Readonly<{ consumed: false }>> {
    try {
      const code = normalizeRecoveryCode(input.recoveryCode);
      const record = await this.dependencies.repository.readRecoveryCodeForUse(
        input.userId, recoveryCodeSlot(code)
      );
      if (record === null
        || !await verifyRecoveryCode(this.dependencies.argon2, record.codeHash, code)) {
        return Object.freeze({ consumed: false as const });
      }
      const replacementCode = generateRecoveryCode(record.codeSlot);
      const replacementHash = await hashRecoveryCode(
        this.dependencies.argon2,
        replacementCode,
        this.dependencies.policy.recoveryCodes.argon2id
      );
      const consumed = await this.dependencies.repository.consumeAndReplaceRecoveryCode({
        userId: input.userId,
        recoveryCodeId: record.recoveryCodeId,
        replacementHash,
        occurredAt: this.now(),
        source
      });
      return consumed
        ? Object.freeze({ consumed: true as const, replacementCode })
        : Object.freeze({ consumed: false as const });
    } catch (error) {
      if (error instanceof Error && error.message === "CRYPTO_CANONICAL_VALUE_INVALID") {
        return Object.freeze({ consumed: false as const });
      }
      throw mfaFailure(error);
    }
  }
}
