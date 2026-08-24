import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AuthSourceContext,
  LoginChallengeRecord,
  LoginIdentityRecord,
  PostgresSessionRepository
} from "@debateai/db";
import type { Session } from "@debateai/contract";
import type { AuthPolicy, MfaPolicy, SessionPolicy } from "@debateai/register";
import {
  Argon2InfrastructureError,
  createEmailBlindIndex,
  decrypt,
  generateRecoveryCode,
  generateVerificationToken,
  hashPassword,
  hashRecoveryCode,
  hashVerificationToken,
  matchTotpStep,
  normalizeEmailForBlindIndex,
  normalizeRecoveryCode,
  recoveryCodeSlot,
  verifyPassword,
  verifyRecoveryCode,
  type Argon2Executor,
  type ReadableUserDekStore
} from "@debateai/crypto";
import { AuthFlowError } from "./registration.js";
import { MfaVerificationLimiter } from "./mfa.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface AuthenticatedSession {
  readonly session: Session;
  readonly userId: string;
  readonly ownerRef: string;
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly authKind: "cookie";
}

export interface SessionSummary {
  readonly session_id: string;
  readonly created_at: string;
  readonly last_seen_at: string;
  readonly idle_expires_at: string;
  readonly absolute_expires_at: string;
  readonly last_mfa_at: string;
  readonly current: boolean;
}

export type LoginResult = Readonly<{
  status: "authenticated";
  sessionToken: string;
  csrfToken: string;
  session: Session;
  replacementRecoveryCode?: string;
}>;

export interface SessionApplication {
  authenticate(sessionToken: string, source: AuthSourceContext): Promise<AuthenticatedSession | null>;
  verifyCsrf(session: AuthenticatedSession, suppliedToken: string): boolean;
  beginLogin(input: Readonly<{ email: string; password: string }>, source: AuthSourceContext): Promise<Readonly<{
    status: "mfa_required";
    challengeToken: string;
  }>>;
  completeLogin(input: Readonly<{ challengeToken: string; code: string }>, source: AuthSourceContext): Promise<LoginResult>;
  logout(session: AuthenticatedSession, source: AuthSourceContext): Promise<boolean>;
  listSessions(session: AuthenticatedSession): Promise<readonly SessionSummary[]>;
  revokeSession(session: AuthenticatedSession, sessionId: string, source: AuthSourceContext): Promise<boolean>;
  revokeAllSessions(session: AuthenticatedSession, source: AuthSourceContext): Promise<number>;
  stepUp(input: Readonly<{
    session: AuthenticatedSession;
    password: string;
    code: string;
    authorization?: Readonly<{
      action: "PUBLISH" | "UNPUBLISH";
      targetRunId: string;
    }>;
  }>, source: AuthSourceContext): Promise<Readonly<{
    sessionToken: string;
    csrfToken: string;
    grantToken?: string;
    grantExpiresAt?: Date;
  }>>;
}

type SessionRepository = Pick<PostgresSessionRepository,
  | "authenticateSession"
  | "completeRecoveryLogin"
  | "completeTotpLogin"
  | "createLoginChallenge"
  | "findLoginIdentity"
  | "listActiveSessions"
  | "readLoginChallenge"
  | "readRecoveryCodeForLogin"
  | "readStepUpIdentity"
  | "recordLoginFailure"
  | "recordStepUpFailure"
  | "revokeAllSessions"
  | "revokeSession"
  | "rotateAfterStepUp"
>;

function asAuthFailure(error: unknown): unknown {
  return error instanceof Argon2InfrastructureError
    ? new AuthFlowError("AUTH_TEMPORARILY_UNAVAILABLE", { cause: error })
    : error;
}

function sessionFor(ownerRef: string, sessionId: string): Session {
  return Object.freeze({
    asker_id: `owner:${ownerRef}`,
    session_id: sessionId,
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  });
}

function safeTokenHash(token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  try {
    return hashVerificationToken(token);
  } catch {
    return null;
  }
}

function sameHash(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

export class SessionService implements SessionApplication {
  private readonly limiter: MfaVerificationLimiter;

  private constructor(private readonly dependencies: Readonly<{
    repository: SessionRepository;
    dekStore: ReadableUserDekStore;
    argon2: Argon2Executor;
    authPolicy: AuthPolicy;
    mfaPolicy: MfaPolicy;
    sessionPolicy: SessionPolicy;
    blindIndexKey: Uint8Array;
    bindingKey: Uint8Array;
    dummyPasswordHash: string;
    clock?: () => Date;
  }>) {
    this.limiter = new MfaVerificationLimiter(dependencies.mfaPolicy.verificationLimits);
  }

  static async create(dependencies: Readonly<{
    repository: SessionRepository;
    dekStore: ReadableUserDekStore;
    argon2: Argon2Executor;
    authPolicy: AuthPolicy;
    mfaPolicy: MfaPolicy;
    sessionPolicy: SessionPolicy;
    blindIndexKey: Uint8Array;
    bindingKey?: Uint8Array;
    dummyPasswordHash?: string;
    clock?: () => Date;
  }>): Promise<SessionService> {
    let generated: string | undefined;
    if (dependencies.dummyPasswordHash === undefined) {
      const dummy = randomBytes(32).toString("base64url");
      generated = await hashPassword(dependencies.argon2, dummy, dependencies.authPolicy.password.argon2id);
    }
    const bindingKey = dependencies.bindingKey === undefined
      ? Buffer.from(dependencies.blindIndexKey)
      : Buffer.from(dependencies.bindingKey);
    if (bindingKey.byteLength < 32) {
      bindingKey.fill(0);
      throw new TypeError("SESSION_BINDING_KEY_INVALID");
    }
    return new SessionService(Object.freeze({
      ...dependencies,
      bindingKey,
      dummyPasswordHash: dependencies.dummyPasswordHash ?? generated!
    }));
  }

  private now(): Date {
    return new Date((this.dependencies.clock?.() ?? new Date()).getTime());
  }

  private bindingHash(source: AuthSourceContext): string {
    const userAgent = typeof source?.userAgent === "string" && source.userAgent.trim() !== ""
      ? source.userAgent.trim().slice(0, 256) : "unknown";
    return `sha256:${createHmac("sha256", this.dependencies.bindingKey)
      .update("debateai:session-user-agent:v1\0", "utf8")
      .update(userAgent, "utf8").digest("hex")}`;
  }

  private challengeRateKey(input: string): string {
    return createHmac("sha256", this.dependencies.bindingKey)
      .update("debateai:login-rate-key:v1\0", "utf8").update(input, "utf8").digest("hex");
  }

  private sourceIp(source: AuthSourceContext): string {
    const ip = typeof source?.ip === "string" ? source.ip.trim() : "";
    return (ip === "" ? "unknown" : ip).slice(0, 64);
  }

  private async requireRateBudget(key: string, source: AuthSourceContext, now: Date): Promise<void> {
    const decision = this.limiter.decide(key, this.sourceIp(source), now);
    if (decision.allowed) return;
    if (decision.auditRefusal) {
      await this.dependencies.repository.recordLoginFailure({
        occurredAt: now, source, reason: "AUTH_RATE_LIMITED"
      });
    }
    throw new AuthFlowError("MFA_RATE_LIMITED");
  }

  async authenticate(sessionToken: string, source: AuthSourceContext): Promise<AuthenticatedSession | null> {
    const tokenHash = safeTokenHash(sessionToken);
    if (tokenHash === null) return null;
    const now = this.now();
    const record = await this.dependencies.repository.authenticateSession({
      tokenHash,
      bindingHash: this.bindingHash(source),
      occurredAt: now,
      idleExpiresAt: new Date(now.getTime() + this.dependencies.sessionPolicy.idleTtlMs)
    });
    return record === null ? null : Object.freeze({
      session: sessionFor(record.ownerRef, record.sessionId),
      userId: record.userId,
      ownerRef: record.ownerRef,
      tokenHash,
      csrfTokenHash: record.csrfTokenHash,
      authKind: "cookie" as const
    });
  }

  verifyCsrf(session: AuthenticatedSession, suppliedToken: string): boolean {
    const suppliedHash = safeTokenHash(suppliedToken);
    return suppliedHash !== null && sameHash(suppliedHash, session.csrfTokenHash);
  }

  async beginLogin(
    input: Readonly<{ email: string; password: string }>,
    source: AuthSourceContext
  ): Promise<Readonly<{ status: "mfa_required"; challengeToken: string }>> {
    const now = this.now();
    let normalizedEmail = "";
    try {
      normalizedEmail = normalizeEmailForBlindIndex(input.email);
    } catch {
      // Keep the same one-Argon verification shape with the process dummy.
    }
    const rateKey = this.challengeRateKey(normalizedEmail || "invalid-email");
    await this.requireRateBudget(rateKey, source, now);
    try {
      const identity = normalizedEmail === "" ? null : await this.dependencies.repository.findLoginIdentity(
        createEmailBlindIndex(this.dependencies.blindIndexKey, normalizedEmail)
      );
      const passwordHash = identity?.passwordHash ?? this.dependencies.dummyPasswordHash;
      const verified = await verifyPassword(this.dependencies.argon2, passwordHash, input.password);
      if (!verified || identity === null) {
        await this.dependencies.repository.recordLoginFailure({
          ...(identity === null ? {} : { actorToken: identity.auditToken }),
          occurredAt: now, source, reason: "AUTH_CREDENTIALS_INVALID"
        });
        throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      }
      const challengeToken = generateVerificationToken();
      const challengeTokenHash = hashVerificationToken(challengeToken);
      const created = await this.dependencies.repository.createLoginChallenge({
        identity,
        challengeId: randomUUID(),
        challengeTokenHash,
        bindingHash: this.bindingHash(source),
        occurredAt: now,
        expiresAt: new Date(now.getTime() + this.dependencies.sessionPolicy.loginChallengeTtlMs),
        source
      });
      if (!created) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      return Object.freeze({ status: "mfa_required" as const, challengeToken });
    } catch (error) {
      throw asAuthFailure(error);
    }
  }

  private sessionMaterial(now: Date): Readonly<{
    sessionId: string;
    sessionToken: string;
    sessionTokenHash: string;
    csrfToken: string;
    csrfTokenHash: string;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }> {
    const sessionToken = generateVerificationToken();
    const csrfToken = generateVerificationToken();
    return Object.freeze({
      sessionId: randomUUID(),
      sessionToken,
      sessionTokenHash: hashVerificationToken(sessionToken),
      csrfToken,
      csrfTokenHash: hashVerificationToken(csrfToken),
      idleExpiresAt: new Date(now.getTime() + this.dependencies.sessionPolicy.idleTtlMs),
      absoluteExpiresAt: new Date(now.getTime() + this.dependencies.sessionPolicy.absoluteTtlMs)
    });
  }

  private async totpStep(challenge: LoginChallengeRecord, code: string, now: Date): Promise<number | null> {
    let dek: Buffer | undefined;
    let secret: Buffer | undefined;
    try {
      dek = await this.dependencies.dekStore.load(challenge.userId);
      secret = decrypt(dek, challenge.secretCiphertext, [
        "identity", "mfa_factor.secret_ciphertext", challenge.factorId,
        "run:none", challenge.userId, `user-dek:${challenge.userId}`, "1"
      ]);
      const matched = matchTotpStep(
        secret,
        code,
        Math.floor(now.getTime() / (this.dependencies.mfaPolicy.totp.periodSeconds * 1_000)),
        challenge.lastAcceptedStep
      );
      return matched.status === "accepted" ? matched.step : null;
    } finally {
      secret?.fill(0);
      dek?.fill(0);
    }
  }

  async completeLogin(
    input: Readonly<{ challengeToken: string; code: string }>,
    source: AuthSourceContext
  ): Promise<LoginResult> {
    const now = this.now();
    const challengeTokenHash = safeTokenHash(input.challengeToken);
    const rateKey = this.challengeRateKey(challengeTokenHash ?? "invalid-challenge");
    await this.requireRateBudget(rateKey, source, now);
    try {
      const challenge = challengeTokenHash === null ? null
        : await this.dependencies.repository.readLoginChallenge(challengeTokenHash);
      const bindingHash = this.bindingHash(source);
      if (challenge === null || challenge.consumedAt !== null
        || challenge.expiresAt.getTime() <= now.getTime()
        || !sameHash(challenge.bindingHash, bindingHash)) {
        await this.dependencies.repository.recordLoginFailure({
          ...(challenge === null ? {} : { actorToken: challenge.auditToken }),
          occurredAt: now, source, reason: "AUTH_MFA_INVALID"
        });
        throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      }
      const material = this.sessionMaterial(now);
      const context = Object.freeze({ user_agent_hash: bindingHash });
      let replacementRecoveryCode: string | undefined;
      let completed = false;
      if (/^\d{6}$/.test(input.code)) {
        const acceptedStep = await this.totpStep(challenge, input.code, now);
        completed = acceptedStep !== null && await this.dependencies.repository.completeTotpLogin({
          challenge,
          acceptedStep,
          bindingHash,
          sessionId: material.sessionId,
          sessionTokenHash: material.sessionTokenHash,
          csrfTokenHash: material.csrfTokenHash,
          sessionBindingContext: context,
          occurredAt: now,
          idleExpiresAt: material.idleExpiresAt,
          absoluteExpiresAt: material.absoluteExpiresAt,
          source
        });
      } else {
        let recoveryCode = "";
        try { recoveryCode = normalizeRecoveryCode(input.code); } catch { /* generic rejection below */ }
        const record = recoveryCode === "" ? null : await this.dependencies.repository.readRecoveryCodeForLogin(
          challengeTokenHash!, recoveryCodeSlot(recoveryCode)
        );
        const verified = record !== null
          && await verifyRecoveryCode(this.dependencies.argon2, record.codeHash, recoveryCode);
        if (verified && record !== null) {
          replacementRecoveryCode = generateRecoveryCode(record.codeSlot);
          const replacementHash = await hashRecoveryCode(
            this.dependencies.argon2,
            replacementRecoveryCode,
            this.dependencies.mfaPolicy.recoveryCodes.argon2id
          );
          completed = await this.dependencies.repository.completeRecoveryLogin({
            challenge,
            recoveryCodeId: record.recoveryCodeId,
            replacementHash,
            bindingHash,
            sessionId: material.sessionId,
            sessionTokenHash: material.sessionTokenHash,
            csrfTokenHash: material.csrfTokenHash,
            sessionBindingContext: context,
            occurredAt: now,
            idleExpiresAt: material.idleExpiresAt,
            absoluteExpiresAt: material.absoluteExpiresAt,
            source
          });
        }
      }
      if (!completed) {
        await this.dependencies.repository.recordLoginFailure({
          actorToken: challenge.auditToken, occurredAt: now, source, reason: "AUTH_MFA_INVALID"
        });
        throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      }
      this.limiter.clearEnrollment(rateKey);
      return Object.freeze({
        status: "authenticated" as const,
        sessionToken: material.sessionToken,
        csrfToken: material.csrfToken,
        session: sessionFor(challenge.ownerRef, material.sessionId),
        ...(replacementRecoveryCode === undefined ? {} : { replacementRecoveryCode })
      });
    } catch (error) {
      throw asAuthFailure(error);
    }
  }

  async logout(session: AuthenticatedSession, source: AuthSourceContext): Promise<boolean> {
    return this.dependencies.repository.revokeSession({
      userId: session.userId,
      sessionId: session.session.session_id,
      occurredAt: this.now(),
      source
    });
  }

  async listSessions(session: AuthenticatedSession): Promise<readonly SessionSummary[]> {
    const rows = await this.dependencies.repository.listActiveSessions(session.userId, this.now());
    return Object.freeze(rows.map((row) => Object.freeze({
      session_id: row.sessionId,
      created_at: row.createdAt.toISOString(),
      last_seen_at: row.lastSeenAt.toISOString(),
      idle_expires_at: row.idleExpiresAt.toISOString(),
      absolute_expires_at: row.absoluteExpiresAt.toISOString(),
      last_mfa_at: row.lastMfaAt.toISOString(),
      current: row.sessionId === session.session.session_id
    })));
  }

  revokeSession(session: AuthenticatedSession, sessionId: string, source: AuthSourceContext): Promise<boolean> {
    return this.dependencies.repository.revokeSession({
      userId: session.userId, sessionId, occurredAt: this.now(), source
    });
  }

  revokeAllSessions(session: AuthenticatedSession, source: AuthSourceContext): Promise<number> {
    return this.dependencies.repository.revokeAllSessions({
      userId: session.userId,
      initiatingSessionId: session.session.session_id,
      occurredAt: this.now(),
      source
    });
  }

  async stepUp(input: Readonly<{
    session: AuthenticatedSession;
    password: string;
    code: string;
    authorization?: Readonly<{
      action: "PUBLISH" | "UNPUBLISH";
      targetRunId: string;
    }>;
  }>, source: AuthSourceContext): Promise<Readonly<{
    sessionToken: string;
    csrfToken: string;
    grantToken?: string;
    grantExpiresAt?: Date;
  }>> {
    const now = this.now();
    let identity: LoginIdentityRecord | null = null;
    let rotationAttempted = false;
    try {
      identity = await this.dependencies.repository.readStepUpIdentity(input.session.userId);
      const rateKey = this.challengeRateKey(`step-up:${input.session.userId}`);
      const decision = this.limiter.decide(rateKey, this.sourceIp(source), now);
      if (!decision.allowed) {
        if (decision.auditRefusal) {
          await this.dependencies.repository.recordStepUpFailure({
            ...(identity === null ? {} : { actorToken: identity.auditToken }),
            sessionId: input.session.session.session_id,
            occurredAt: now,
            source,
            reason: "AUTH_RATE_LIMITED"
          });
        }
        throw new AuthFlowError("MFA_RATE_LIMITED");
      }
      const passwordVerified = identity !== null
        && await verifyPassword(this.dependencies.argon2, identity.passwordHash, input.password);
      if (!passwordVerified || identity === null) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      const challenge: LoginChallengeRecord = Object.freeze({
        ...identity,
        challengeId: randomUUID(),
        challengeTokenHash: hashVerificationToken(generateVerificationToken()),
        bindingHash: this.bindingHash(source),
        expiresAt: now,
        consumedAt: null
      });
      const acceptedStep = await this.totpStep(challenge, input.code, now);
      if (acceptedStep === null) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      const replacementToken = generateVerificationToken();
      const replacementCsrf = generateVerificationToken();
      const grantToken = input.authorization === undefined
        ? undefined : generateVerificationToken();
      const grantExpiresAt = input.authorization === undefined
        ? undefined
        : new Date(now.getTime() + this.dependencies.sessionPolicy.stepUpFreshnessMs);
      rotationAttempted = true;
      const rotated = await this.dependencies.repository.rotateAfterStepUp({
        identity,
        currentSessionId: input.session.session.session_id,
        currentTokenHash: input.session.tokenHash,
        acceptedStep,
        replacementTokenHash: hashVerificationToken(replacementToken),
        replacementCsrfHash: hashVerificationToken(replacementCsrf),
        bindingContext: Object.freeze({ user_agent_hash: this.bindingHash(source) }),
        occurredAt: now,
        idleExpiresAt: new Date(now.getTime() + this.dependencies.sessionPolicy.idleTtlMs),
        source,
        ...(input.authorization === undefined || grantToken === undefined || grantExpiresAt === undefined
          ? {}
          : { grant: {
              grantId: randomUUID(),
              grantTokenHash: hashVerificationToken(grantToken),
              action: input.authorization.action,
              targetRunId: input.authorization.targetRunId,
              expiresAt: grantExpiresAt
            } })
      });
      if (!rotated) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      this.limiter.clearEnrollment(rateKey);
      return Object.freeze({
        sessionToken: replacementToken,
        csrfToken: replacementCsrf,
        ...(grantToken === undefined || grantExpiresAt === undefined
          ? {}
          : { grantToken, grantExpiresAt })
      });
    } catch (error) {
      if (!rotationAttempted && error instanceof AuthFlowError
        && error.code === "AUTH_CREDENTIALS_INVALID") {
        await this.dependencies.repository.recordStepUpFailure({
          ...(identity === null ? {} : { actorToken: identity.auditToken }),
          sessionId: input.session.session.session_id,
          occurredAt: now,
          source,
          reason: "AUTH_CREDENTIALS_INVALID"
        });
      }
      throw asAuthFailure(error);
    }
  }
}
