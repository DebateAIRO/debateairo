import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  AuthSourceContext,
  LoginChallengeRecord,
  LoginIdentityRecord,
  StaffPrerequisiteProducer,
  PostgresAuthenticationRiskSignalRepository,
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
  hashToken,
  matchTotpStep,
  normalizeEmailForBlindIndex,
  normalizeRecoveryCode,
  recoveryCodeSlot,
  verifyPassword,
  verifyRecoveryCode,
  type Argon2Executor,
  type ReadableUserDekStore,
  type TokenKind
} from "@debateai/crypto";
import { AuthFlowError, consumerPasswordUsable, storedArgon2EnvelopeNotOverPolicy } from "./registration.js";
import { MfaVerificationLimiter } from "./mfa.js";

import { staffTokenHash } from "./staff/access.js";

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

/** Internal producer for verified consumer methods. Raw bearers never cross the HTTP projection. */
export interface ConsumerSessionMaterial {
  readonly sessionId:string; readonly sessionToken:string; readonly sessionTokenHash:string;
  readonly csrfToken:string; readonly csrfTokenHash:string; readonly bindingHash:string;
  readonly sessionBindingContext:Readonly<{user_agent_hash:string}>; readonly occurredAt:Date;
  readonly idleExpiresAt:Date; readonly absoluteExpiresAt:Date;
}
export type ConsumerCeremonyOperation = 'ENROLLMENT_BEGIN' | 'ENROLLMENT_COMPLETE' | 'LOGIN_BEGIN' | 'LOGIN_COMPLETE' | 'STEP_UP_BEGIN' | 'STEP_UP_COMPLETE' | 'SECURITY_CODES' | 'RECOVERY_PROVE' | 'RECOVERY_BEGIN' | 'RECOVERY_COMPLETE' | 'ONBOARDING_STATUS' | 'ONBOARDING_COMPLETE' | 'SOCIAL_BEGIN' | 'SOCIAL_CALLBACK' | 'SOCIAL_SIGNUP';
export interface ConsumerCeremonyAdmission {
  readonly retentionKey:string;
  readonly challengeCapacity:number;
  readonly challengesPerScope:number;
}
export interface ConsumerSessionProducer {
  admit(operation:ConsumerCeremonyOperation,scope:string,source:AuthSourceContext):Promise<ConsumerCeremonyAdmission>;
  bindingHash(source:AuthSourceContext):string;
  socialBindings?():Promise<readonly string[]>;
  passwordUsable?(hash:string|null):boolean;
  prepare(source:AuthSourceContext):ConsumerSessionMaterial;
  committed(material:ConsumerSessionMaterial, identity:Readonly<{userId:string;ownerRef:string}>, source:AuthSourceContext):Promise<LoginResult>;
}

export type StaffPrerequisiteRequest = Readonly<{session: AuthenticatedSession; password: string; code: string}> & (
  Readonly<{purpose: "KEY_PREREGISTRATION"}> | Readonly<{purpose: "OWNER_POSSESSION"; commandId: string; commandNonce: string}>
);
export type StaffPrerequisiteResult = Readonly<{sessionToken: string; csrfToken: string; prerequisiteHandle: string; expiresAt: Date}>;

export interface SessionApplication {
  stepUpStaffPrerequisite?(input: StaffPrerequisiteRequest, source: AuthSourceContext, signal?: AbortSignal): Promise<StaffPrerequisiteResult>;
  /** Non-refreshing current generation/expiry/hold check. Missing implementations deny streaming. */
  assertCurrent?(session:AuthenticatedSession,signal?:AbortSignal):Promise<void>;
  authenticate(sessionToken: string, source: AuthSourceContext): Promise<AuthenticatedSession | null>;
  authenticateErasureStatus?(sessionToken:string,source:AuthSourceContext):
    Promise<AuthenticatedSession|null>;
  verifyCsrf(session: AuthenticatedSession, suppliedToken: string): boolean;
  beginLogin(input: Readonly<{ email: string; password: string }>, source: AuthSourceContext): Promise<Readonly<{
    status: "mfa_required";
    challengeToken: string;
    availableMethods?: readonly ("passkey"|"totp"|"recovery_code")[];
  }>>;
  completeLogin(input: Readonly<{ challengeToken: string; code: string }>, source: AuthSourceContext): Promise<LoginResult>;
  logout(session: AuthenticatedSession, source: AuthSourceContext): Promise<boolean>;
  listSessions(session: AuthenticatedSession): Promise<readonly SessionSummary[]>;
  revokeSession(session: AuthenticatedSession, sessionId: string, source: AuthSourceContext): Promise<boolean>;
  revokeAllSessions(session: AuthenticatedSession, source: AuthSourceContext): Promise<number>;
  /** Age gate (8k): "required" until an existing account answers its one-time check. */
  readAgeConfirmation?(session: AuthenticatedSession): Promise<"required" | "confirmed">;
  /**
   * Age gate (8k): records the one-time check. `refused` has already revoked every session
   * of the account and frozen it; `SESSION_NOT_FOUND` means this session was not live.
   */
  confirmAccountAge?(
    session: AuthenticatedSession,
    input: Readonly<{ passed: boolean; minAgeApplied: number; countryCode: string | null; ruleVersion: string }>,
    source: AuthSourceContext
  ): Promise<"passed" | "refused" | "SESSION_NOT_FOUND">;
  /**
   * Sensitive-data consent (V, 2026-09-29): "required" until the account agrees, once, to
   * the processing of sensitive information in its own questions. No debate starts before.
   */
  readSensitiveDataConsent?(session: AuthenticatedSession): Promise<"required" | "given">;
  /** Records that agreement; `SESSION_NOT_FOUND` means this session was not live. */
  recordSensitiveDataConsent?(
    session: AuthenticatedSession,
    input: Readonly<{ noticeVersion: string; locale: string }>
  ): Promise<"given" | "SESSION_NOT_FOUND">;
  stepUp(input: Readonly<{
    session: AuthenticatedSession;
    password: string;
    code: string;
    authorization?:
      | Readonly<{
        action: "PUBLISH" | "UNPUBLISH" | "DELETE_PRIVATE_DEBATE";
        targetRunId: string;
      }>
      | Readonly<{ action: "DELETE_ACCOUNT" | "CHANGE_EMAIL" | "WITHDRAW_SUBSCRIPTION" | "READ_PHONE_PROFILE" | "CHANGE_PHONE_PROFILE" | "CHANGE_RECOVERY_EMAIL" | "ADD_PASSKEY" | "ADD_TOTP" | "REGENERATE_RECOVERY_CODES" }>
      | Readonly<{action:"REMOVE_AUTH_METHOD";targetFactorId:string}>
      | Readonly<{action:"LINK_PROVIDER"|"UNLINK_PROVIDER";targetProvider:"google"|"apple"|"facebook"|"x"}>;
  }>, source: AuthSourceContext): Promise<Readonly<{
    sessionToken: string;
    csrfToken: string;
    grantToken?: string;
    grantExpiresAt?: Date;
  }>>;
}

type SessionRepository = Partial<Pick<PostgresSessionRepository,"assertSessionCurrent">> & Pick<PostgresSessionRepository,
  | "authenticateSession"
  | "authenticateAccountErasureStatusSession"
  | "confirmAccountAge"
  | "readAgeCheckOutcome"
  | "readSensitiveDataConsent"
  | "recordSensitiveDataConsent"
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
type SessionRiskSignals=Pick<PostgresAuthenticationRiskSignalRepository,"recordForSession">;

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

function safeTokenHash(kind: TokenKind, token: string): string | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  try {
    return hashToken(kind, token);
  } catch {
    return null;
  }
}

/**
 * The two purpose labels. Written out in full so a reader — and the source
 * invariant in tests/unit/session-key-derivation.test.ts — can see exactly
 * which key each HMAC below is under.
 */
const SESSION_BINDING_KDF_LABEL = "debateai:kdf:session-binding:v1" as const;
const LOGIN_RATE_KDF_LABEL = "debateai:kdf:login-rate:v1" as const;
type SessionKdfLabel = typeof SESSION_BINDING_KDF_LABEL | typeof LOGIN_RATE_KDF_LABEL;

/**
 * HMAC-SHA-256(root, label) — one independent 32-byte key
 * per purpose, so the root secret is never itself an HMAC key and a purpose key
 * cannot be run backwards to the root. The label is the whole message: it is
 * fixed-length and unambiguous, so no length prefix is needed.
 */
function deriveSessionPurposeKey(root: Uint8Array, label: SessionKdfLabel): Buffer {
  return createHmac("sha256", root).update(label, "utf8").digest();
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
    staffPrerequisites?: StaffPrerequisiteProducer;
    riskSignals:SessionRiskSignals;
    onRiskSignalFailure:(error:unknown)=>void;
    dekStore: ReadableUserDekStore;
    argon2: Argon2Executor;
    authPolicy: AuthPolicy;
    mfaPolicy: MfaPolicy;
    sessionPolicy: SessionPolicy;
    blindIndexKey: Uint8Array;
    socialProviderBindings?: () => Promise<readonly string[]>;
    sessionBindingKey: Buffer;
    loginRateKey: Buffer;
    dummyPasswordHash: string;
    clock?: () => Date;
  }>) {
    this.limiter = new MfaVerificationLimiter(dependencies.mfaPolicy.verificationLimits);
  }

  static async create(dependencies: Readonly<{
    repository: SessionRepository;
    staffPrerequisites?: StaffPrerequisiteProducer;
    riskSignals:SessionRiskSignals;
    onRiskSignalFailure:(error:unknown)=>void;
    dekStore: ReadableUserDekStore;
    argon2: Argon2Executor;
    authPolicy: AuthPolicy;
    mfaPolicy: MfaPolicy;
    sessionPolicy: SessionPolicy;
    blindIndexKey: Uint8Array;
    socialProviderBindings?: () => Promise<readonly string[]>;
    bindingKey?: Uint8Array;
    dummyPasswordHash?: string;
    clock?: () => Date;
  }>): Promise<SessionService> {
    let generated: string | undefined;
    if (dependencies.dummyPasswordHash === undefined) {
      const dummy = randomBytes(32).toString("base64url");
      generated = await hashPassword(dependencies.argon2, dummy, dependencies.authPolicy.password.argon2id);
    }
    const rootKey = dependencies.bindingKey === undefined
      ? Buffer.from(dependencies.blindIndexKey)
      : Buffer.from(dependencies.bindingKey);
    if (rootKey.byteLength < 32) {
      rootKey.fill(0);
      throw new TypeError("SESSION_BINDING_KEY_INVALID");
    }
    // L2-F5: the raw root secret is the email blind-index key by default, so
    // keying the session HMACs with it directly made one 32-byte secret serve
    // three purposes: rotating the blind index silently invalidated every
    // session binding and login challenge, and vice versa. Each purpose now
    // gets its own key, derived so the root never appears as an HMAC key.
    const sessionBindingKey = deriveSessionPurposeKey(rootKey, SESSION_BINDING_KDF_LABEL);
    const loginRateKey = deriveSessionPurposeKey(rootKey, LOGIN_RATE_KDF_LABEL);
    rootKey.fill(0);
    return new SessionService(Object.freeze({
      ...dependencies,
      sessionBindingKey,
      loginRateKey,
      dummyPasswordHash: dependencies.dummyPasswordHash ?? generated!
    }));
  }

  private now(): Date {
    return new Date((this.dependencies.clock?.() ?? new Date()).getTime());
  }

  private bindingHash(source: AuthSourceContext): string {
    const userAgent = typeof source?.userAgent === "string" && source.userAgent.trim() !== ""
      ? source.userAgent.trim().slice(0, 256) : "unknown";
    return `sha256:${createHmac("sha256", this.dependencies.sessionBindingKey)
      .update("debateai:session-user-agent:v1\0", "utf8")
      .update(userAgent, "utf8").digest("hex")}`;
  }

  private challengeRateKey(input: string): string {
    return createHmac("sha256", this.dependencies.loginRateKey)
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

  async assertCurrent(session:AuthenticatedSession,signal?:AbortSignal):Promise<void> {
    try {
      if(session.authKind!=="cookie" || this.dependencies.repository.assertSessionCurrent===undefined
        || !await this.dependencies.repository.assertSessionCurrent({userId:session.userId,sessionId:session.session.session_id,tokenHash:session.tokenHash},signal)) {
        throw new Error("SESSION_REQUIRED");
      }
    } catch {throw new Error("SESSION_REQUIRED");}
  }

  async authenticate(sessionToken: string, source: AuthSourceContext): Promise<AuthenticatedSession | null> {
    const tokenHash = safeTokenHash("session", sessionToken);
    if (tokenHash === null) return null;
    const now = this.now();
    const record = await this.dependencies.repository.authenticateSession({
      tokenHash,
      bindingHash: this.bindingHash(source),
      occurredAt: now,
      idleExpiresAt: new Date(now.getTime() + Math.min(this.dependencies.sessionPolicy.idleTtlMs,1209600000))
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

  async authenticateErasureStatus(
    sessionToken:string,source:AuthSourceContext
  ):Promise<AuthenticatedSession|null> {
    const tokenHash=safeTokenHash("session", sessionToken);
    if (tokenHash===null) return null;
    const record=await this.dependencies.repository.authenticateAccountErasureStatusSession({
      tokenHash,bindingHash:this.bindingHash(source),occurredAt:this.now()
    });
    return record===null ? null : Object.freeze({
      session:sessionFor(record.ownerRef,record.sessionId),userId:record.userId,
      ownerRef:record.ownerRef,tokenHash,csrfTokenHash:record.csrfTokenHash,
      authKind:"cookie" as const
    });
  }

  verifyCsrf(session: AuthenticatedSession, suppliedToken: string): boolean {
    const suppliedHash = safeTokenHash("csrf", suppliedToken);
    return suppliedHash !== null && sameHash(suppliedHash, session.csrfTokenHash);
  }

  async beginLogin(
    input: Readonly<{ email: string; password: string }>,
    source: AuthSourceContext
  ): Promise<Readonly<{ status: "mfa_required"; challengeToken: string; availableMethods:readonly ("passkey"|"totp"|"recovery_code")[] }>> {
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
      // V-22. A stored envelope over twice the password policy never reaches
      // Argon2 — but the attempt keeps its one-Argon shape, because the process
      // dummy (minted at exactly the sealed cost) is verified in its place.
      // Skipping the work instead would answer a planted account faster than a
      // wrong password.
      const envelopeAdmitted = storedArgon2EnvelopeNotOverPolicy(
        passwordHash, this.dependencies.authPolicy.password.argon2id, "password"
      );
      const verified = await verifyPassword(
        this.dependencies.argon2,
        envelopeAdmitted ? passwordHash : this.dependencies.dummyPasswordHash,
        input.password
      ) && envelopeAdmitted;
      if (!verified || identity === null || identity.passwordHash === null) {
        await this.dependencies.repository.recordLoginFailure({
          ...(identity === null ? {} : { actorToken: identity.auditToken }),
          occurredAt: now, source, reason: "AUTH_CREDENTIALS_INVALID"
        });
        throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      }
      const challengeToken = generateVerificationToken();
      const challengeTokenHash = hashToken("login-challenge", challengeToken);
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
      return Object.freeze({ status: "mfa_required" as const, challengeToken, availableMethods:identity.availableMethods??["totp" as const] });
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
      sessionTokenHash: hashToken("session", sessionToken),
      csrfToken,
      csrfTokenHash: hashToken("csrf", csrfToken),
      idleExpiresAt: new Date(now.getTime() + Math.min(this.dependencies.sessionPolicy.idleTtlMs,1209600000)),
      absoluteExpiresAt: new Date(now.getTime() + Math.min(this.dependencies.sessionPolicy.absoluteTtlMs,2592000000))
    });
  }

  /** Construct only from the fully initialized service so every method shares token/KDF policy. */
  consumerProducer():ConsumerSessionProducer {
    return Object.freeze({
      admit:async(operation:ConsumerCeremonyOperation,scope:string,source:AuthSourceContext)=>{
        await this.requireRateBudget(this.challengeRateKey(`consumer:${operation}:${scope==='discoverable'?`${scope}:${this.sourceIp(source)}`:scope}`),source,this.now());
        return Object.freeze({retentionKey:`sha256:${this.challengeRateKey(`consumer:retention:${this.sourceIp(source)}`)}`,
          challengeCapacity:this.dependencies.mfaPolicy.verificationLimits.capacity,
          challengesPerScope:this.dependencies.mfaPolicy.verificationLimits.perEnrollment});
      },
      bindingHash:(source:AuthSourceContext)=>this.bindingHash(source),
      passwordUsable:(hash:string|null)=>consumerPasswordUsable(hash,this.dependencies.authPolicy),
      socialBindings:()=>this.dependencies.socialProviderBindings?.() ?? Promise.resolve([]),
      prepare:(source:AuthSourceContext)=>{
        const now=this.now(), bindingHash=this.bindingHash(source);
        const material=this.sessionMaterial(now);
        // Preserve shorter selected lifetimes within the consumer maximums.
        const absoluteExpiresAt=new Date(Math.min(material.absoluteExpiresAt.getTime(),now.getTime()+2592000000));
        const idleExpiresAt=new Date(Math.min(material.idleExpiresAt.getTime(),now.getTime()+1209600000,absoluteExpiresAt.getTime()));
        return Object.freeze({...material,absoluteExpiresAt,idleExpiresAt,bindingHash,sessionBindingContext:Object.freeze({user_agent_hash:bindingHash}),occurredAt:now});
      },
      committed:async (material:ConsumerSessionMaterial,identity:Readonly<{userId:string;ownerRef:string}>,source:AuthSourceContext)=>{
        try {
          const recorded=await this.dependencies.riskSignals.recordForSession({tokenHash:material.sessionTokenHash,bindingHash:material.bindingHash,kind:"LOGIN_SUCCESS",source});
          if(recorded!=="recorded") throw new TypeError("LOGIN_RISK_SIGNAL_SCOPE_UNRESOLVED");
        } catch(error){this.dependencies.onRiskSignalFailure(error);}
        return Object.freeze({status:"authenticated" as const,sessionToken:material.sessionToken,csrfToken:material.csrfToken,session:sessionFor(identity.ownerRef,material.sessionId)});
      }
    });
  }

  private async totpStep(challenge: LoginChallengeRecord, code: string, now: Date): Promise<number | null> {
    if(challenge.factorId===null || challenge.secretCiphertext===null) return null;
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
    const challengeTokenHash = safeTokenHash("login-challenge", input.challengeToken);
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
      const admittedProviders=challenge.firstStep==='PROVIDER'?await this.dependencies.socialProviderBindings?.()??[]:[];
      if(challenge.firstStep==='PROVIDER' && (!challenge.socialConfiguration || !admittedProviders.includes(challenge.socialConfiguration) || !source.socialBrowserHash || challenge.socialCookieHash!==source.socialBrowserHash)) throw new AuthFlowError('AUTH_CREDENTIALS_INVALID');
      const socialAuthority={admittedProviders,...(source.socialBrowserHash===undefined?{}:{browserHash:source.socialBrowserHash})};
      const material = this.sessionMaterial(now);
      const context = Object.freeze({ user_agent_hash: bindingHash });
      let replacementRecoveryCode: string | undefined;
      let completed = false;
      if (/^\d{6}$/.test(input.code)) {
        const acceptedStep = await this.totpStep(challenge, input.code, now);
        completed = acceptedStep !== null && await this.dependencies.repository.completeTotpLogin({
          ...socialAuthority,challenge,
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
          // V-22: twice the MFA recovery-code policy, derived from that policy.
          && storedArgon2EnvelopeNotOverPolicy(
            record.codeHash, this.dependencies.mfaPolicy.recoveryCodes.argon2id, "recovery-code"
          )
          && await verifyRecoveryCode(this.dependencies.argon2, record.codeHash, recoveryCode);
        if (verified && record !== null) {
          replacementRecoveryCode = generateRecoveryCode(record.codeSlot);
          const replacementHash = await hashRecoveryCode(
            this.dependencies.argon2,
            replacementRecoveryCode,
            this.dependencies.mfaPolicy.recoveryCodes.argon2id
          );
          completed = await this.dependencies.repository.completeRecoveryLogin({
            ...socialAuthority,recoveryCodeHash:record.codeHash,challenge,
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
      const result=await this.consumerProducer().committed({...material,bindingHash,sessionBindingContext:context,occurredAt:now},challenge,source);
      return Object.freeze({...result,...(replacementRecoveryCode===undefined?{}:{replacementRecoveryCode})});
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

  async readAgeConfirmation(session: AuthenticatedSession): Promise<"required" | "confirmed"> {
    const outcome = await this.dependencies.repository.readAgeCheckOutcome(session.userId);
    return outcome === "required" ? "required" : "confirmed";
  }

  confirmAccountAge(
    session: AuthenticatedSession,
    input: Readonly<{ passed: boolean; minAgeApplied: number; countryCode: string | null; ruleVersion: string }>,
    source: AuthSourceContext
  ): Promise<"passed" | "refused" | "SESSION_NOT_FOUND"> {
    return this.dependencies.repository.confirmAccountAge({
      userId: session.userId,
      sessionId: session.session.session_id,
      ...input,
      occurredAt: this.now(),
      source
    });
  }

  async readSensitiveDataConsent(session: AuthenticatedSession): Promise<"required" | "given"> {
    return await this.dependencies.repository.readSensitiveDataConsent(session.userId) ? "given" : "required";
  }

  recordSensitiveDataConsent(
    session: AuthenticatedSession,
    input: Readonly<{ noticeVersion: string; locale: string }>
  ): Promise<"given" | "SESSION_NOT_FOUND"> {
    return this.dependencies.repository.recordSensitiveDataConsent({
      userId: session.userId,
      sessionId: session.session.session_id,
      ...input,
      occurredAt: this.now()
    });
  }

  async stepUp(input: Readonly<{
    session: AuthenticatedSession;
    password: string;
    code: string;
    authorization?:
      | Readonly<{
        action: "PUBLISH" | "UNPUBLISH" | "DELETE_PRIVATE_DEBATE";
        targetRunId: string;
      }>
      | Readonly<{ action: "DELETE_ACCOUNT" | "CHANGE_EMAIL" | "WITHDRAW_SUBSCRIPTION" | "READ_PHONE_PROFILE" | "CHANGE_PHONE_PROFILE" | "CHANGE_RECOVERY_EMAIL" | "ADD_PASSKEY" | "ADD_TOTP" | "REGENERATE_RECOVERY_CODES" }>
      | Readonly<{action:"REMOVE_AUTH_METHOD";targetFactorId:string}>
      | Readonly<{action:"LINK_PROVIDER"|"UNLINK_PROVIDER";targetProvider:"google"|"apple"|"facebook"|"x"}>;
  }>, source: AuthSourceContext): Promise<Readonly<{
    sessionToken: string;
    csrfToken: string;
    grantToken?: string;
    grantExpiresAt?: Date;
  }>> {
    return this.freshStepUp(input, source);
  }

  async stepUpStaffPrerequisite(input: StaffPrerequisiteRequest, source: AuthSourceContext, signal?: AbortSignal): Promise<StaffPrerequisiteResult> {
    if (this.dependencies.staffPrerequisites === undefined) throw new Error("STAFF_UNAVAILABLE");
    const result = await this.freshStepUp(input, source, input, signal);
    if (result.prerequisiteHandle === undefined || result.expiresAt === undefined) throw new Error("STAFF_UNAVAILABLE");
    return {sessionToken: result.sessionToken, csrfToken: result.csrfToken,
      prerequisiteHandle: result.prerequisiteHandle, expiresAt: result.expiresAt};
  }

  private async freshStepUp(input: Parameters<SessionApplication["stepUp"]>[0], source: AuthSourceContext,
    prerequisite?: StaffPrerequisiteRequest, signal?: AbortSignal): Promise<Awaited<ReturnType<SessionApplication["stepUp"]>> & Partial<StaffPrerequisiteResult>> {
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
      // V-22, as in beginLogin: the password policy governs this record, and a
      // refused envelope is replaced by the dummy rather than skipped, so the
      // step-up keeps the same shape it has for a wrong password.
      const envelopeAdmitted = identity !== null && storedArgon2EnvelopeNotOverPolicy(
        identity.passwordHash, this.dependencies.authPolicy.password.argon2id, "password"
      );
      const passwordVerified = identity !== null
        && await verifyPassword(
          this.dependencies.argon2,
          envelopeAdmitted ? identity.passwordHash : this.dependencies.dummyPasswordHash,
          input.password
        )
        && envelopeAdmitted;
      if (!passwordVerified || identity === null) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      const challenge: LoginChallengeRecord = Object.freeze({
        ...identity,
        challengeId: randomUUID(),
        challengeTokenHash: hashToken("login-challenge", generateVerificationToken()),
        bindingHash: this.bindingHash(source),
        expiresAt: now,
        consumedAt: null
      });
      const acceptedStep = await this.totpStep(challenge, input.code, now);
      if (acceptedStep === null) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      if (signal?.aborted) throw new Error("STAFF_UNAVAILABLE");
      const replacementToken = generateVerificationToken();
      const replacementCsrf = generateVerificationToken();
      const grantToken = input.authorization === undefined
        ? undefined : generateVerificationToken();
      const grantExpiresAt = input.authorization === undefined
        ? undefined
        : new Date(now.getTime() + this.dependencies.sessionPolicy.stepUpFreshnessMs);
      rotationAttempted = true;
      const prerequisiteHandle = prerequisite === undefined ? undefined : generateVerificationToken();
      const prerequisiteResult = prerequisite === undefined || prerequisiteHandle === undefined ? undefined
        : await this.dependencies.staffPrerequisites!.complete({
          identity: {userId: identity.userId, ownerRef: identity.ownerRef, passwordHash: identity.passwordHash, factorId: identity.factorId},
          currentSessionId: input.session.session.session_id, currentTokenHash: input.session.tokenHash, acceptedStep,
          replacementTokenHash: hashToken("session", replacementToken), replacementCsrfHash: hashToken("csrf", replacementCsrf),
          bindingContext: Object.freeze({user_agent_hash: this.bindingHash(source)}), source,
          handleHash: staffTokenHash(prerequisiteHandle)!,
          ...(prerequisite.purpose === "KEY_PREREGISTRATION" ? {purpose: "KEY_PREREGISTRATION" as const}
            : {purpose: "OWNER_POSSESSION" as const, commandId: prerequisite.commandId, nonceHash: staffTokenHash(prerequisite.commandNonce)!})
        }, signal);
      if (signal?.aborted) throw new Error("STAFF_UNAVAILABLE");
      const rotated = prerequisite === undefined ? await this.dependencies.repository.rotateAfterStepUp({
        identity,
        currentSessionId: input.session.session.session_id,
        currentTokenHash: input.session.tokenHash,
        acceptedStep,
        replacementTokenHash: hashToken("session", replacementToken),
        replacementCsrfHash: hashToken("csrf", replacementCsrf),
        bindingContext: Object.freeze({ user_agent_hash: this.bindingHash(source) }),
        occurredAt: now,
        idleExpiresAt: new Date(now.getTime() + Math.min(this.dependencies.sessionPolicy.idleTtlMs,1209600000)),
        source,
        ...(input.authorization === undefined || grantToken === undefined || grantExpiresAt === undefined
          ? {}
          : { grant: !("targetRunId" in input.authorization)
              ? {
                  grantId: randomUUID(),
                  grantTokenHash: hashToken("step-up-grant", grantToken),
                  action: input.authorization.action,
                  ...("targetFactorId" in input.authorization ? {targetFactorId:input.authorization.targetFactorId} : {}),
                  ...("targetProvider" in input.authorization ? {targetProvider:input.authorization.targetProvider} : {}),
                  expiresAt: grantExpiresAt
                }
              : {
                  grantId: randomUUID(),
                  grantTokenHash: hashToken("step-up-grant", grantToken),
                  action: input.authorization.action,
                  targetRunId: input.authorization.targetRunId,
                  expiresAt: grantExpiresAt
                } })
      }) : true;
      if (!rotated) throw new AuthFlowError("AUTH_CREDENTIALS_INVALID");
      this.limiter.clearEnrollment(rateKey);
      return Object.freeze({
        sessionToken: replacementToken,
        csrfToken: replacementCsrf,
        ...(prerequisiteHandle === undefined || prerequisiteResult === undefined ? {} : {prerequisiteHandle, expiresAt: prerequisiteResult.expiresAt}),
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
