import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createEmailBlindIndex, decrypt, encrypt, generateVerificationToken, hashPassword, hashToken, matchTotpStep, normalizeEmailForBlindIndex, type AeadAad, type Argon2Executor, type ReadableUserDekStore } from "@debateai/crypto";
import type { AuthSourceContext } from "@debateai/db";
import type { AuthPolicy, MfaPolicy } from "@debateai/register";
import type { PasswordResetPolicy } from "../../../packages/register/src/password-reset-policy.js";
import { PostgresPasswordResetRepository, type PasswordResetRecord } from "../../../packages/db/src/password-reset.js";
import { RECOVERY_START_PUBLIC_RESPONSE } from "./recovery.js";
export class PasswordResetError extends Error {
  constructor(readonly code: "PASSWORD_RESET_INVALID" | "PASSWORD_RESET_PROOF_INVALID" | "PASSWORD_RESET_PASSWORD_INVALID" | "PASSWORD_RESET_CSRF_INVALID" | "PASSWORD_RESET_RATE_LIMITED" | "PASSWORD_RESET_UNAVAILABLE") {
    super(code);
    this.name = "PasswordResetError";
  }
}
const bearer = /^[A-Za-z0-9_-]{43}$/;
export function passwordResetNoticeAad(userId: string, channelId: string): AeadAad {
  return ["identity", "password_reset_notice.payload_ciphertext", channelId, "run:none", userId, `user-dek:${userId}`, "1"];
}
function sessionHash(token: string) {
  if (!bearer.test(token))
    throw new PasswordResetError("PASSWORD_RESET_INVALID");
  return hashToken("password-reset-session", token);
}
type SessionInput = Readonly<{
  sessionToken: string;
}>;
export type PasswordResetState = Readonly<{
  status: "password_required" | "completed" | "cancelled" | "refused";
  expires_at: string;
  password_min_length: number;
  password_max_length: number | null;
}>;
export interface PasswordResetApplication {
  start(input: Readonly<{
    email: string;
  }>, source: AuthSourceContext): Promise<typeof RECOVERY_START_PUBLIC_RESPONSE>;
  exchange(input: Readonly<{
    token: string;
  }>, source: AuthSourceContext): Promise<Readonly<{
    sessionToken: string;
    csrfToken: string;
    expiresAt: Date;
    state: PasswordResetState;
  }>>;
  status(input: SessionInput): Promise<PasswordResetState>;
  assertCsrf(token: string, csrf: string): Promise<void>;
  complete(input: SessionInput & Readonly<{
    password: string;
    code: string;
  }>, source: AuthSourceContext): Promise<Readonly<{
    status: "completed";
  }>>;
  cancel(input: Readonly<{
    token: string;
  }>, source: AuthSourceContext): Promise<Readonly<{
    status: "cancelled";
  }>>;
  cancelSession(input: SessionInput, source: AuthSourceContext): Promise<Readonly<{
    status: "cancelled";
  }>>;
}
/** Current authenticator proof changes only the password, never its MFA binding. */
export class PasswordResetService implements PasswordResetApplication {
  constructor(private readonly dependencies: Readonly<{
    repository: PostgresPasswordResetRepository;
    users: ReadableUserDekStore;
    argon2: Argon2Executor;
    authPolicy: AuthPolicy;
    mfaPolicy: MfaPolicy;
    passwordResetPolicy: PasswordResetPolicy;
    blindIndexKey: Uint8Array;
    reportDiagnostic: (code: string) => void;
    monotonicNow?: () => number;
    sleep?: (ms: number) => Promise<void>;
  }>) {
    if (dependencies.passwordResetPolicy.maximumElapsedMs !== 1800000 || dependencies.authPolicy.verification.enumerationResponseFloorMs < 1)
      throw new TypeError("PASSWORD_RESET_POLICY_INVALID");
  }
  private get repo() {
    return this.dependencies.repository;
  }
  private async guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    }
    catch (error) {
      if (error instanceof PasswordResetError)
        throw error;
      this.dependencies.reportDiagnostic("PASSWORD_RESET_OPERATION_UNAVAILABLE");
      throw new PasswordResetError("PASSWORD_RESET_UNAVAILABLE");
    }
  }
  private async current(token: string, active = false): Promise<PasswordResetRecord> {
    const record = await this.repo.read(sessionHash(token));
    if (!record || active && record.stage !== "PASSWORD_REQUIRED")
      throw new PasswordResetError("PASSWORD_RESET_INVALID");
    return record;
  }
  private state(record: PasswordResetRecord): PasswordResetState {
    return { status: record.stage.toLowerCase() as PasswordResetState["status"], expires_at: new Date(record.expiresAt).toISOString(), password_min_length: this.dependencies.authPolicy.password.minimumLength, password_max_length: this.dependencies.authPolicy.password.maximumLength };
  }
  private async admit(source: AuthSourceContext) {
    const prepared = await this.repo.prepareSource(source);
    if (!(await this.repo.admit(prepared)))
      throw new PasswordResetError("PASSWORD_RESET_RATE_LIMITED");
    return prepared;
  }
  async start(input: Readonly<{
    email: string;
  }>, source: AuthSourceContext): Promise<typeof RECOVERY_START_PUBLIC_RESPONSE> {
    const now = this.dependencies.monotonicNow ?? (() => performance.now()), began = now();
    try {
      return await this.guarded(async () => {
        let email: string;
        try {
          email = normalizeEmailForBlindIndex(input.email);
        }
        catch {
          return RECOVERY_START_PUBLIC_RESPONSE;
        }
        const prepared = await this.repo.prepareSource(source);
        if (!(await this.repo.admit(prepared)))
          return RECOVERY_START_PUBLIC_RESPONSE;
        const index = createEmailBlindIndex(this.dependencies.blindIndexKey, email), candidate = await this.repo.prepare(index), userId = candidate?.userId ?? randomUUID(), key = candidate ? await this.dependencies.users.load(userId) : randomBytes(32), token = generateVerificationToken(), cancelToken = generateVerificationToken();
        try {
          if(candidate&&(!Array.isArray(candidate.bindingChannelIds)||candidate.bindingChannelIds.length===0||candidate.bindingChannelIds.length>64||new Set(candidate.bindingChannelIds).size!==candidate.bindingChannelIds.length||candidate.bindingChannelIds.some(id=>!candidate.channels.some(channel=>channel.channelId===id))))throw new PasswordResetError("PASSWORD_RESET_INVALID");
          const channels = candidate?.channels ?? [], ids = channels.map(c => c.channelId), refs = encrypt(key, Buffer.from(JSON.stringify({ v: 1, channelBindingIds: candidate?.bindingChannelIds ?? [] })), ["identity", "account_recovery_request.channel_refs_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
          const notices = channels.map(channel => {
            const address = decrypt(key, channel.addressCiphertext, ["identity", channel.channelType === "email" ? "user.email_ciphertext" : "user.recovery_email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
            try {
              const recipient = address.toString("utf8"), aad = passwordResetNoticeAad(userId, channel.channelId);
              return { channelId: channel.channelId, envelope: encrypt(key, Buffer.from(JSON.stringify({ recipient })), aad), ...(channel.proof ? { proofEnvelope: encrypt(key, Buffer.from(JSON.stringify({ recipient, token, cancelToken })), aad) } : {}) };
            }
            finally {
              address.fill(0);
            }
          });
          await this.repo.start({ index, candidateId: candidate?.userId ?? null, channels: ids, refs, linkHash: hashToken("password-reset-link", token), cancelHash: hashToken("password-reset-cancel", cancelToken), notices, source: prepared });
          return RECOVERY_START_PUBLIC_RESPONSE;
        }
        finally {
          key.fill(0);
        }
      });
    }
    finally {
      const remaining = this.dependencies.authPolicy.verification.enumerationResponseFloorMs - (now() - began);
      if (remaining > 0)
        await (this.dependencies.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms))))(remaining);
    }
  }
  async exchange(input: Readonly<{
    token: string;
  }>, source: AuthSourceContext) {
    return this.guarded(async () => {
      const prepared = await this.admit(source);
      if (!bearer.test(input.token))
        throw new PasswordResetError("PASSWORD_RESET_INVALID");
      const token = generateVerificationToken(), csrf = generateVerificationToken();
      if (await this.repo.exchange(hashToken("password-reset-link", input.token), sessionHash(token), hashToken("password-reset-csrf", csrf), prepared) !== "PASSWORD_REQUIRED")
        throw new PasswordResetError("PASSWORD_RESET_INVALID");
      const record = await this.current(token, true);
      return { sessionToken: token, csrfToken: csrf, expiresAt: new Date(record.expiresAt), state: this.state(record) };
    });
  }
  async assertCsrf(token: string, csrf: string) {
    return this.guarded(async () => {
      const record = await this.current(token);
      if (record.stage !== "PASSWORD_REQUIRED" || !bearer.test(csrf) || typeof record.csrfHash !== "string")
        throw new PasswordResetError("PASSWORD_RESET_CSRF_INVALID");
      const supplied = Buffer.from(hashToken("password-reset-csrf", csrf)), expected = Buffer.from(record.csrfHash);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
        throw new PasswordResetError("PASSWORD_RESET_CSRF_INVALID");
    });
  }
  async status(input: SessionInput) {
    return this.guarded(async () => this.state(await this.current(input.sessionToken)));
  }
  async complete(input: SessionInput & Readonly<{
    password: string;
    code: string;
  }>, source: AuthSourceContext) {
    return this.guarded(async () => {
      const prepared = await this.admit(source), record = await this.current(input.sessionToken, true), policy = this.dependencies.authPolicy.password;
      if (typeof input.password !== "string" || input.password.length < policy.minimumLength || policy.maximumLength !== null && input.password.length > policy.maximumLength || Buffer.byteLength(input.password, "utf8") > 1024)
        throw new PasswordResetError("PASSWORD_RESET_PASSWORD_INVALID");
      if (!record.userId || !record.factorId || !record.factorSecret || record.nowMs === undefined || record.lastAcceptedStep === undefined)
        throw new PasswordResetError("PASSWORD_RESET_UNAVAILABLE");
      const key = await this.dependencies.users.load(record.userId);
      let secret: Buffer | undefined, step: number;
      try {
        secret = decrypt(key, record.factorSecret, ["identity", "mfa_factor.secret_ciphertext", record.factorId, "run:none", record.userId, `user-dek:${record.userId}`, "1"]);
        const match = matchTotpStep(secret, input.code, Math.floor(record.nowMs / (this.dependencies.mfaPolicy.totp.periodSeconds * 1000)), record.lastAcceptedStep);
        if (match.status !== "accepted") {
          await this.repo.failure(sessionHash(input.sessionToken), prepared);
          throw new PasswordResetError("PASSWORD_RESET_PROOF_INVALID");
        }
        step = match.step;
      }
      finally {
        secret?.fill(0);
        key.fill(0);
      }
      const passwordHash = await hashPassword(this.dependencies.argon2, input.password, policy.argon2id);
      if (await this.repo.complete({ sessionHash: sessionHash(input.sessionToken), passwordHash, factorId: record.factorId, factorSecret: record.factorSecret, lastAcceptedStep: record.lastAcceptedStep, step, source: prepared }) !== "COMPLETED")
        throw new PasswordResetError("PASSWORD_RESET_INVALID");
      return { status: "completed" as const };
    });
  }
  async cancel(input: Readonly<{
    token: string;
  }>, source: AuthSourceContext) {
    return this.guarded(async () => {
      const prepared = await this.admit(source);
      if (!bearer.test(input.token) || await this.repo.cancel(hashToken("password-reset-cancel", input.token), prepared) !== "CANCELLED")
        throw new PasswordResetError("PASSWORD_RESET_INVALID");
      return { status: "cancelled" as const };
    });
  }
  async cancelSession(input: SessionInput, source: AuthSourceContext) {
    return this.guarded(async () => {
      const prepared = await this.admit(source);
      if (await this.repo.cancelSession(sessionHash(input.sessionToken), prepared) !== "CANCELLED")
        throw new PasswordResetError("PASSWORD_RESET_INVALID");
      return { status: "cancelled" as const };
    });
  }
}
