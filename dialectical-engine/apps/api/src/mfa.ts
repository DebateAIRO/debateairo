import { socialHash } from './social-providers/hashes.js';
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthSourceContext, PostgresIdentityRepository, PostgresConsumerAuthRepository, TotpEnrollmentAuthority } from "@debateai/db";
import { currentDocument, legalManifestLocales } from "@debateai/legal-manifest";
import type { AuthenticatedSession, ConsumerSessionProducer, LoginResult } from "./sessions.js";
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
  hashToken,
  matchTotpStep,
  normalizeRecoveryCode,
  recoveryCodeSlot,
  totpProvisioningUri,
  verifyRecoveryCode,
  type Argon2Executor,
  type ReadableUserDekStore
} from "@debateai/crypto";
import { AuthFlowError, storedArgon2EnvelopeNotOverPolicy } from "./registration.js";
import { clientIpNetworkScope, normalizeClientIp } from "./client-ip.js";
import { leastEvidenceKey } from "./admission.js";

type MfaRepository = Pick<PostgresIdentityRepository,
  | "consumeAndReplaceRecoveryCode"
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
 * The per-source key: one IPv4 address, or one IPv6 /64 (a single residential
 * or hosting allocation), so one holder cannot mint unlimited "sources".
 * Anything that is not an address keeps its own string and is never merged.
 */
export function rateLimitSourceScope(sourceIp: string): string {
  return clientIpNetworkScope(normalizeClientIp(sourceIp) ?? sourceIp);
}

/**
 * A bounded, fail-closed online-guessing limiter. Account and source budgets
 * are separate, both expire automatically, and no remote sequence can produce
 * a permanent account lock.
 *
 * Each table (the source table, and one account table per route family) holds
 * at most `capacity` keys. A full table evicts rather than refusing new keys:
 * refusing let a flood of distinct throwaway keys lock everybody out of sign-in
 * for the whole window, and separate account tables keep a flood on one route
 * family from evicting the counters of another.
 */
export class MfaVerificationLimiter {
  private readonly tables = new Map<string, Map<string, RateEntry>>();

  constructor(private readonly policy: MfaPolicy["verificationLimits"]) {}

  private table(namespace: string): Map<string, RateEntry> {
    let table = this.tables.get(namespace);
    if (table === undefined) {
      table = new Map();
      this.tables.set(namespace, table);
    }
    return table;
  }

  private prune(entries: Map<string, RateEntry>, now: number): void {
    for (const [key, entry] of entries) {
      if (entry.blockedUntil <= now && now - entry.windowStartedAt >= this.policy.windowMs) {
        entries.delete(key);
      }
    }
  }

  private take(namespace: string, key: string, limit: number, now: number): MfaRateDecision {
    const entries = this.table(namespace);
    let entry = entries.get(key);
    if (entry === undefined) {
      // An expired entry is reset on its next use, so the table is swept only when it is full.
      if (entries.size >= this.policy.capacity) this.prune(entries, now);
      while (entries.size >= this.policy.capacity) {
        const victim = leastEvidenceKey(entries, now);
        if (victim === undefined) break;
        entries.delete(victim);
      }
      entry = { count: 0, windowStartedAt: now, blockedUntil: 0, refusalAuditedUntil: 0 };
      entries.set(key, entry);
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

  /** The shared per-source ceiling alone (one IPv4 address or one IPv6 /64). */
  decideSource(sourceIp: string, now: Date): MfaRateDecision {
    return this.take("source", rateLimitSourceScope(sourceIp), this.policy.perSourceAcrossAccounts, now.getTime());
  }

  /** The per-account (enrollment, challenge, address) ceiling of one route family. */
  decideAccount(enrollmentKey: string, now: Date, family = "default"): MfaRateDecision {
    return this.take(`account:${family}`, enrollmentKey, this.policy.perEnrollment, now.getTime());
  }

  decide(enrollmentKey: string, sourceIp: string, now: Date, family = "default"): MfaRateDecision {
    // Source first: a spray across many accounts receives one shared ceiling.
    const source = this.decideSource(sourceIp, now);
    if (!source.allowed) return source;
    return this.decideAccount(enrollmentKey, now, family);
  }

  consume(enrollmentKey: string, sourceIp: string, now: Date, family = "default"): boolean {
    return this.decide(enrollmentKey, sourceIp, now, family).allowed;
  }

  clearEnrollment(enrollmentKey: string, family = "default"): void {
    this.tables.get(`account:${family}`)?.delete(enrollmentKey);
  }

  size(): number {
    let total = 0;
    for (const table of this.tables.values()) total += table.size;
    return total;
  }
}

export interface MfaApplication {
  beginTotp(input: Readonly<{enrollmentToken:string}>|Readonly<{stepUpGrant:string}>, source:AuthSourceContext, session?:AuthenticatedSession):Promise<Readonly<{status:"verification_required";secret:string;otpauthUri:string;enrollment_token:string;expires_at:string}>>;
  verifyTotp(input:Readonly<{enrollmentToken:string;code:string}>,source:AuthSourceContext,session?:AuthenticatedSession):Promise<LoginResult|Readonly<{status:"enrolled"}>>;
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
  // The enrolment token is the consumed verification credential itself
  // (channel_binding.verification_token_hash), so it shares that kind.
  return hashToken("verification", token);
}

function normalizedSourceIp(source: AuthSourceContext): string {
  const value = typeof source?.ip === "string" ? source.ip.trim() : "";
  return (value === "" ? "unknown" : value).slice(0, 64);
}

function mfaFailure(error: unknown): unknown {
  if(error instanceof Error && error.message==="CONSUMER_PASSWORD_PATH_UNAVAILABLE") return new AuthFlowError("MFA_FIRST_STEP_UNAVAILABLE");
  if(error instanceof Error && error.message==="MFA_ENROLLMENT_STATE_INVALID") return new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
  if(error instanceof Error && error.message==="CONSUMER_AUTH_INVALID") return new AuthFlowError("MFA_ENROLLMENT_INVALID");
  if(error instanceof Error && error.message==="CONSUMER_CHALLENGE_CAPACITY") return new AuthFlowError("MFA_RATE_LIMITED");
  return error instanceof Argon2InfrastructureError
    ? new AuthFlowError("AUTH_TEMPORARILY_UNAVAILABLE", { cause: error })
    : error;
}

export class MfaEnrollmentService implements MfaApplication {
  private readonly limiter: MfaVerificationLimiter;

  constructor(private readonly dependencies: Readonly<{
    repository: MfaRepository;
    consumerRepository?: Pick<PostgresConsumerAuthRepository,"prepareTotpEnrollment"|"beginTotpEnrollment"|"readTotpEnrollment"|"completeTotpEnrollment">;
    sessions?: ConsumerSessionProducer;
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

  private secureDependencies() {
    const {consumerRepository,sessions}=this.dependencies;
    if(consumerRepository===undefined || sessions===undefined) throw new AuthFlowError("AUTH_TEMPORARILY_UNAVAILABLE");
    return {consumerRepository,sessions};
  }

  private additionHash(token:string):string {
    enrollmentHash(token);
    return "sha256:"+createHash("sha256").update("consumer-totp:ADD_TOTP\0").update(token).digest("hex");
  }

  async beginTotp(input:Readonly<{enrollmentToken:string}>|Readonly<{stepUpGrant:string}>,source:AuthSourceContext,session?:AuthenticatedSession) {
    const initial="enrollmentToken" in input;
    if(!initial) enrollmentHash(input.stepUpGrant);
    if(!initial && session===undefined) throw new AuthFlowError("MFA_ENROLLMENT_INVALID");
    if(initial) enrollmentHash(input.enrollmentToken);
    const admission=await this.secureDependencies().sessions.admit("ENROLLMENT_BEGIN",initial?input.enrollmentToken:session!.userId,source);
    const authority:TotpEnrollmentAuthority=initial ? {enrollmentTokenHash:enrollmentHash(input.enrollmentToken),socialEnrollmentHash:socialHash('enrollment',input.enrollmentToken),bindingHash:this.secureDependencies().sessions.bindingHash(source),...(source.socialBrowserHash===undefined?{}:{browserHash:source.socialBrowserHash}),admittedProviders:await this.secureDependencies().sessions.socialBindings?.()??[]} : {
      userId:session!.userId,sessionId:session!.session.session_id,tokenHash:session!.tokenHash,grantHash:hashToken("step-up-grant",input.stepUpGrant)
    };
    const identity=await this.secureDependencies().consumerRepository.prepareTotpEnrollment(authority);
    if(identity===null) throw new AuthFlowError("MFA_ENROLLMENT_INVALID");
    const factorId=randomUUID(),secret=generateTotpSecret();
    const enrollmentToken=initial?input.enrollmentToken:randomBytes(32).toString("base64url");
    let dek:Buffer|undefined;
    try {
      dek=await this.dependencies.dekStore.load(identity.userId);
      const secretCiphertext=encrypt(dek,secret,["identity","mfa_factor.secret_ciphertext",factorId,"run:none",identity.userId,`user-dek:${identity.userId}`,"1"]);
      const begun=await this.secureDependencies().consumerRepository.beginTotpEnrollment({...authority,...admission,factorId,secretCiphertext,bindingHash:this.secureDependencies().sessions.bindingHash(source),
        ...(initial?{}:{handleHash:this.additionHash(enrollmentToken)})},source).catch(error=>{throw mfaFailure(error);});
      return Object.freeze({status:"verification_required" as const,secret:encodeBase32(secret),otpauthUri:totpProvisioningUri(secret,{issuer:this.dependencies.policy.issuer,accountLabel:identity.pseudonym}),
        enrollment_token:enrollmentToken,expires_at:new Date(begun.expiresAt).toISOString()});
    } finally {secret.fill(0);dek?.fill(0);}
  }

  async verifyTotp(input:Readonly<{enrollmentToken:string;code:string}>,source:AuthSourceContext,session?:AuthenticatedSession):Promise<LoginResult|Readonly<{status:"enrolled"}>> {
    try {
      enrollmentHash(input.enrollmentToken);
      await this.secureDependencies().sessions.admit("ENROLLMENT_COMPLETE",input.enrollmentToken,source);
      const lookup={enrollmentTokenHash:enrollmentHash(input.enrollmentToken),socialEnrollmentHash:socialHash('enrollment',input.enrollmentToken),...(source.socialBrowserHash===undefined?{}:{browserHash:source.socialBrowserHash}),admittedProviders:await this.secureDependencies().sessions.socialBindings?.()??[],additionHandleHash:this.additionHash(input.enrollmentToken),bindingHash:this.secureDependencies().sessions.bindingHash(source),
        ...(session===undefined?{}:{sessionId:session.session.session_id,tokenHash:session.tokenHash})};
      const enrollment=await this.secureDependencies().consumerRepository.readTotpEnrollment(lookup);
      if(enrollment===null) throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
      let dek:Buffer|undefined,secret:Buffer|undefined;
      try {
        dek=await this.dependencies.dekStore.load(enrollment.userId);
        secret=decrypt(dek,enrollment.secretCiphertext,["identity","mfa_factor.secret_ciphertext",enrollment.factorId,"run:none",enrollment.userId,`user-dek:${enrollment.userId}`,"1"]);
        const matched=matchTotpStep(secret,input.code,Math.floor(this.now().getTime()/(this.dependencies.policy.totp.periodSeconds*1000)),enrollment.lastAcceptedStep);
        if(matched.status!=="accepted") {
          await this.dependencies.repository.recordMfaVerificationFailure({enrollmentTokenHash:lookup.enrollmentTokenHash,reason:"MFA_TOTP_INVALID",occurredAt:this.now(),source});
          throw new AuthFlowError(matched.status==="replayed"?"MFA_TOTP_REPLAYED":"MFA_TOTP_INVALID");
        }
        const material=enrollment.purpose==="INITIAL_ENROLLMENT"?this.secureDependencies().sessions.prepare(source):undefined;
        const currentLegal=(["TERMS","PRIVACY"] as const).flatMap(kind=>legalManifestLocales(kind).map(locale=>({kind,locale,...currentDocument(kind,locale)!})));
        const committed=await this.secureDependencies().consumerRepository.completeTotpEnrollment({...lookup,passwordHashSnapshot:enrollment.passwordHash,passwordUsable:this.secureDependencies().sessions.passwordUsable?.(enrollment.passwordHash)??false,userId:enrollment.userId,factorId:enrollment.factorId,secretCiphertext:enrollment.secretCiphertext,acceptedStep:matched.step,
          ...(material===undefined?{}:{material:{sessionId:material.sessionId,sessionTokenHash:material.sessionTokenHash,csrfTokenHash:material.csrfTokenHash,sessionBindingContext:material.sessionBindingContext,idleExpiresAt:material.idleExpiresAt,absoluteExpiresAt:material.absoluteExpiresAt}})},currentLegal,source);
        return material===undefined?Object.freeze({status:"enrolled" as const}):this.secureDependencies().sessions.committed(material,committed,source);
      } finally {secret?.fill(0);dek?.fill(0);}
    } catch(error) {throw mfaFailure(error);}
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

  async confirmRecoveryCode(_input:{readonly enrollmentToken:string;readonly recoveryCode:string},_source:AuthSourceContext):Promise<Readonly<{status:"active"}>> {
    throw new AuthFlowError("MFA_ENROLLMENT_STATE_INVALID");
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
        // V-22: a planted envelope is refused exactly like a wrong code.
        || !storedArgon2EnvelopeNotOverPolicy(
          record.codeHash, this.dependencies.policy.recoveryCodes.argon2id, "recovery-code"
        )
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
