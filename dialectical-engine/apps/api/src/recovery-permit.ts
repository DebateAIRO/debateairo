import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createEmailBlindIndex, normalizeEmailForBlindIndex, decrypt, encrypt, generateVerificationToken, hashToken, verifyPassword,
  type AeadAad, type Argon2Executor, type CryptoEnvelope, type ReadableUserDekStore } from "@debateai/crypto";
import type { AuthSourceContext, PostgresRecoveryPermitRepository } from "@debateai/db";
import type { AuthPolicy } from "@debateai/register";
import type { EmailRecoverySource, PostgresMfaRecoveryRepository } from "../../../packages/db/src/email-mfa-recovery.js";
import { authenticationRiskSignalAad } from "../../../packages/db/src/auth-risk.js";
import { emailRecoveryNoticeAad, notices } from "./email-mfa-recovery.js";
import { consumerPasswordUsable, storedArgon2EnvelopeNotOverPolicy } from "./registration.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "./recovery.js";
import { rateLimitSourceScope } from "./mfa.js";

/**
 * THE PERSON'S SIDE OF THE OWNER'S PERMIT (migration 0188): a way back into an account whose passkey or authenticator
 * app is lost and that has no saved recovery code.
 *
 *   start      the same answer for every address; an account that may ask gets a link at its own sign-in address.
 *   request    the emailed link and the account password. Only with both right is the ask one the Owner sees.
 *   cancel     the one-click link every mail carries.
 *   finish     72 hours after the Owner's approval: the emailed finish link and the password open /recover's own
 *              five-minute enrol-only step, and the existing enrolment routes take it from there.
 *
 * The database owns every rule and asks it again at each step; this service checks the typed password against the
 * stored one (the database never sees a typed password) and seals what the mails carry with the account's own key. The
 * cancel and finish links are made here, when the person proves the password, and only their digests are stored: the
 * Owner's approval switches the sealed mails on and never holds an address, a link or a code.
 */
export class RecoveryPermitError extends Error {
  constructor(readonly code: string) { super(code); this.name = "RecoveryPermitError"; }
}
export type RecoveryPermitFinishState = Readonly<{ status: "waiting"; not_before: string }> | Readonly<{ status: "ready_to_finish"; expires_at: string }>;
export type RecoveryPermitOpened = Readonly<{
  status: "RECOVERY_ENROLL_ONLY"; available_methods: readonly ("passkey" | "totp")[]; totp_unavailable_reason: null; recovery_capability: string; expires_at: string;
}>;
export interface RecoveryPermitApplication {
  start(input: Readonly<{ email: string }>, source: AuthSourceContext): Promise<typeof RECOVERY_START_PUBLIC_RESPONSE>;
  request(input: Readonly<{ token: string; password: string }>, source: AuthSourceContext): Promise<Readonly<{ status: "requested" }>>;
  cancel(input: Readonly<{ token: string }>, source: AuthSourceContext): Promise<Readonly<{ status: "cancelled" }>>;
  prepareFinish(input: Readonly<{ token: string }>, source: AuthSourceContext): Promise<RecoveryPermitFinishState>;
  finish(input: Readonly<{ token: string; password: string }>, source: AuthSourceContext): Promise<RecoveryPermitOpened>;
}

const bearer = /^[A-Za-z0-9_-]{43}$/u;
const addressAad = (userId: string): AeadAad => ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"];
const passwordShape = (password: string) => typeof password === "string" && password.length > 0 && Buffer.byteLength(password, "utf8") <= 1024;
const iso = (value: string) => new Date(value).toISOString();
/** A database or key failure never reaches the caller as its own words: it is the flow's "unavailable". */
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof RecoveryPermitError) throw error;
    throw new RecoveryPermitError("RECOVERY_PERMIT_UNAVAILABLE");
  }
}

export class RecoveryPermitService implements RecoveryPermitApplication {
  constructor(private readonly d: Readonly<{
    repository: PostgresRecoveryPermitRepository;
    /** The email route's repository, for the one source window both routes share (20 calls per source in 5 minutes). */
    sources: Pick<PostgresMfaRecoveryRepository, "prepareSource" | "admit">;
    users: ReadableUserDekStore;
    argon2: Argon2Executor;
    authPolicy: AuthPolicy;
    blindIndexKey: Uint8Array;
  }>) {}

  private async admit(source: AuthSourceContext): Promise<EmailRecoverySource> {
    const prepared = await this.d.sources.prepareSource(source, rateLimitSourceScope(source.ip));
    if (!await this.d.sources.admit(prepared)) throw new RecoveryPermitError("RECOVERY_PERMIT_RATE_LIMITED");
    return prepared;
  }
  /** The typed password against the stored one. A stored password this policy would not accept is never a match. */
  private async passwordMatches(stored: string, typed: string): Promise<boolean> {
    return passwordShape(typed) && consumerPasswordUsable(stored, this.d.authPolicy)
      && storedArgon2EnvelopeNotOverPolicy(stored, this.d.authPolicy.password.argon2id, "password") && await verifyPassword(this.d.argon2, stored, typed);
  }

  /**
   * Every address gets the same answer after the same wait, whether or not it has an account and whether or not that
   * account may ask. For one that may, the mailbox link and the cancel link are made here and sealed for the account's
   * verified addresses; the link goes to the sign-in address alone.
   */
  async start(input: Readonly<{ email: string }>, source: AuthSourceContext): Promise<typeof RECOVERY_START_PUBLIC_RESPONSE> {
    const began = performance.now();
    try {
      return await guarded(async () => {
        let email: string;
        try { email = normalizeEmailForBlindIndex(input.email); } catch { return RECOVERY_START_PUBLIC_RESPONSE; }
        const prepared = await this.d.sources.prepareSource(source, rateLimitSourceScope(source.ip));
        if (!await this.d.sources.admit(prepared)) return RECOVERY_START_PUBLIC_RESPONSE;
        const index = createEmailBlindIndex(this.d.blindIndexKey, email), candidate = await this.d.repository.prepare(index);
        // An address with no account spends the same key and sealing work on nothing, so the two take alike.
        const userId = candidate?.userId ?? randomUUID(), key = candidate ? await this.d.users.load(userId) : randomBytes(32);
        const token = generateVerificationToken(), cancel = generateVerificationToken();
        try {
          const sealed = notices("recovery_permit", userId, key, candidate?.channels ?? [], token, cancel);
          if (candidate) await this.d.repository.start({ index, candidateId: candidate.userId, channels: candidate.channels.map((channel) => channel.channelId),
            linkHash: hashToken("recovery-permit-link", token), cancelHash: hashToken("recovery-permit-cancel", cancel), notices: sealed,
            source: prepared, mailLocale: source.mailLocale ?? "en", id: randomUUID() });
          return RECOVERY_START_PUBLIC_RESPONSE;
        } finally { key.fill(0); }
      });
    } finally {
      const floor = this.d.authPolicy.verification.enumerationResponseFloorMs - (performance.now() - began);
      if (floor > 0) await new Promise<void>((resolve) => setTimeout(resolve, floor));
    }
  }

  /**
   * The emailed link and the password. A wrong password is counted (five per link, and across links toward the
   * account's failed-proof mark). With both right the finish link is made and sealed for the proving address, and the
   * database writes the ask. A dead link and an ask the database will not take are answered alike.
   */
  async request(input: Readonly<{ token: string; password: string }>, source: AuthSourceContext): Promise<Readonly<{ status: "requested" }>> {
    return guarded(async () => {
      const prepared = await this.admit(source);
      if (!bearer.test(input.token)) throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
      const link = hashToken("recovery-permit-link", input.token), candidate = await this.d.repository.prepareRequest(link);
      if (!candidate) throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
      if (!await this.passwordMatches(candidate.passwordHash, input.password)) {
        const riskKey = await this.d.users.load(candidate.userId);
        let context: CryptoEnvelope;
        try { context = encrypt(riskKey, Buffer.from(JSON.stringify({ v: 1, networkRef: prepared.ipArgon2id, clientRef: prepared.userAgentArgon2id })), authenticationRiskSignalAad(candidate.userId)); }
        finally { riskKey.fill(0); }
        const outcome = await this.d.repository.recordFailure(link, "link", prepared, context);
        throw new RecoveryPermitError(outcome === "PROOF_INVALID" ? "RECOVERY_PERMIT_PROOF_INVALID" : "RECOVERY_PERMIT_INVALID");
      }
      const key = await this.d.users.load(candidate.userId), finish = generateVerificationToken();
      let address: Buffer | undefined;
      try {
        address = decrypt(key, candidate.proofAddressCiphertext, addressAad(candidate.userId));
        const envelope = encrypt(key, Buffer.from(JSON.stringify({ recipient: address.toString("utf8"), finishToken: finish })),
          emailRecoveryNoticeAad("recovery_permit", candidate.userId, candidate.proofChannelId));
        if (await this.d.repository.request(link, candidate.passwordHash, hashToken("recovery-permit-finish", finish), envelope, prepared) !== "REQUESTED")
          throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
        return { status: "requested" as const };
      } finally { address?.fill(0); key.fill(0); }
    });
  }

  async cancel(input: Readonly<{ token: string }>, source: AuthSourceContext): Promise<Readonly<{ status: "cancelled" }>> {
    return guarded(async () => {
      const prepared = await this.admit(source);
      if (!bearer.test(input.token) || await this.d.repository.cancel(hashToken("recovery-permit-cancel", input.token), prepared) !== "CANCELLED")
        throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
      return { status: "cancelled" as const };
    });
  }

  private async finishCandidate(token: string) {
    if (!bearer.test(token)) throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
    const hash = hashToken("recovery-permit-finish", token), candidate = await this.d.repository.prepareFinish(hash);
    if (!candidate || typeof candidate.ready !== "boolean" || typeof candidate.passwordHash !== "string") throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
    return { hash, candidate };
  }
  /** What the finish link's page shows before it asks for the password: still waiting, or ready until when. */
  async prepareFinish(input: Readonly<{ token: string }>, source: AuthSourceContext): Promise<RecoveryPermitFinishState> {
    return guarded(async (): Promise<RecoveryPermitFinishState> => {
      await this.admit(source);
      const { candidate } = await this.finishCandidate(input.token);
      if (candidate.ready) return { status: "ready_to_finish", expires_at: iso(candidate.expiresAt) };
      if (new Date(candidate.notBefore).getTime() > Date.now()) return { status: "waiting", not_before: iso(candidate.notBefore) };
      // The wait is over and the link opened the set-up as often as it may.
      throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
    });
  }
  /**
   * The finish link and the password open /recover's enrol-only step: the answer is the one /recover gives after a
   * saved code, so the same enrolment routes and screens take it. The capability is made here and only its digest is
   * stored. The database refuses before the 72 hours even if this check is bypassed; a wrong password counts toward
   * this finish link's own five tries.
   */
  async finish(input: Readonly<{ token: string; password: string }>, source: AuthSourceContext): Promise<RecoveryPermitOpened> {
    return guarded(async () => {
      const prepared = await this.admit(source), { hash, candidate } = await this.finishCandidate(input.token);
      if (!candidate.ready) throw new RecoveryPermitError(new Date(candidate.notBefore).getTime() > Date.now() ? "RECOVERY_PERMIT_TOO_EARLY" : "RECOVERY_PERMIT_INVALID");
      if (!await this.passwordMatches(candidate.passwordHash, input.password)) {
        const outcome = await this.d.repository.recordFailure(hash, "finish", prepared, null);
        throw new RecoveryPermitError(outcome === "PROOF_INVALID" ? "RECOVERY_PERMIT_PROOF_INVALID" : "RECOVERY_PERMIT_INVALID");
      }
      const capability = randomBytes(32).toString("base64url");
      const result = await this.d.repository.finish(hash, candidate.passwordHash, hashToken("consumer-recovery-enroll", capability), prepared);
      if (result.status === "TOO_EARLY") throw new RecoveryPermitError("RECOVERY_PERMIT_TOO_EARLY");
      if (result.status !== "OPENED") throw new RecoveryPermitError("RECOVERY_PERMIT_INVALID");
      return { status: "RECOVERY_ENROLL_ONLY" as const, available_methods: ["passkey", "totp"] as const, totp_unavailable_reason: null, recovery_capability: capability, expires_at: iso(result.expiresAt) };
    });
  }
}
