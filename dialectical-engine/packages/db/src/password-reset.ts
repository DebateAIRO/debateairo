export type PasswordResetCandidate=PasswordRecoveryCandidate & Readonly<{bindingChannelIds:readonly string[]}>;
import type { Pool, PoolClient } from "pg";
import type { AuditContextHasher, CryptoEnvelope } from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";
import type { PasswordRecoveryCandidate } from "./recovery-candidate.js";
import { assertMailLocale, withMailLocale } from "./mail-locale.js";
export type PasswordResetRecord = Readonly<{
  stage: "EMAIL_REQUIRED" | "PASSWORD_REQUIRED" | "COMPLETED" | "CANCELLED" | "REFUSED";
  expiresAt: string;
  csrfHash: string | null;
  userId?: string;
  factorId?: string;
  factorSecret?: CryptoEnvelope;
  lastAcceptedStep?: number | null;
  nowMs?: number;
}>;
export type PasswordResetNotice = Readonly<{
  noticeId: string;
  leaseId: string;
  userId: string;
  channelId: string;
  event: "PROOF" | "COMPLETED" | "CANCELLED" | "REFUSED";
  payload: CryptoEnvelope;
  expiresAt: string;
  /** C09 (R-13): the mail language stored on the row, read from the claim's `mail_locale`. */
  mailLocale: string;
}>;
type Source = Readonly<{
  ipArgon2id: string;
  userAgentArgon2id: string;
  /** C09 (R-08, R-11): the request's mail language, carried into the writer's transaction; never sent to SQL. */
  mailLocale: string;
}>;
// The SQL source is exactly the two hashed members (password_reset_audit, 0104:67, compares it with jsonb_build_object);
// a leaked mailLocale member is refused by the recovery start, so mailLocale stays in TypeScript.
const sourceJson = (source: Source) => JSON.stringify({ ipArgon2id: source.ipArgon2id, userAgentArgon2id: source.userAgentArgon2id });
// NV-39: the digest the source window is keyed by (the caller's /64 for IPv6); a source prepared without a scope is
// admitted by its address digest.
const admissionDigests = new WeakMap<object, string>();
// R-08: an absent or unknown request value is `en` before the setting is written (the API resolves it once in sourceFor).
const requestMailLocale = (value: string | undefined): string => {
  try {
    return assertMailLocale(value ?? "en");
  }
  catch {
    return "en";
  }
};
type Capability = "password_reset_prepare" | "password_reset_start" | "password_reset_exchange" | "password_reset_read" | "password_reset_complete" | "password_reset_cancel" | "password_reset_cancel_session" | "password_reset_admit" | "password_reset_failure" | "expire_password_reset" | "password_reset_claim_pending_notice" | "password_reset_finish_notice" | "password_reset_start_guarded" | "password_reset_proof_reserve" | "password_reset_proof_refused" | "password_reset_complete_guarded" | "password_reset_admit_evicting";
/** Execute-only reset store: HTTP never supplies subject IDs or table selectors. */
export class PostgresPasswordResetRepository {
  constructor(private readonly pool: Pool, private readonly audit: AuditContextHasher, private readonly registerVersion: number) {
    if (!Number.isSafeInteger(registerVersion) || registerVersion < 1)
      throw new TypeError("PASSWORD_RESET_REGISTER_INVALID");
  }
  /** A writer passes the client of its withMailLocale transaction (C09, R-11); every other call runs on the pool. */
  private async call<T>(name: Capability, args: readonly unknown[], client?: PoolClient): Promise<T> {
    const text = `SELECT identity.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) AS result`;
    const result = client ? await client.query<{ result: T }>(text, [...args]) : await this.pool.query<{ result: T }>(text, [...args]);
    return result.rows[0]!.result;
  }
  /** NV-39: `admissionScope` (the service's rate-limit scope) is hashed too when it differs from the address. */
  async prepareSource(source: AuthSourceContext, admissionScope?: string): Promise<Source> {
    const norm = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim() : "unknown").slice(0, max);
    const ipInput = norm(source.ip, 64), scopeInput = admissionScope === undefined ? undefined : norm(admissionScope, 64);
    const [ip, ua, scope] = await Promise.all([this.audit.hashSourceIp(ipInput), this.audit.hashUserAgent(norm(source.userAgent, 256)), scopeInput !== undefined && scopeInput !== ipInput ? this.audit.hashSourceIp(scopeInput) : undefined]);
    if (!/^[0-9a-f]{64}$/.test(ip) || !/^[0-9a-f]{64}$/.test(ua) || (scope !== undefined && !/^[0-9a-f]{64}$/.test(scope)))
      throw new TypeError("PASSWORD_RESET_SOURCE_INVALID");
    const prepared = { ipArgon2id: `argon2id-audit:v1:${ip}`, userAgentArgon2id: `argon2id-audit:v1:${ua}`, mailLocale: requestMailLocale(source.mailLocale) };
    if (scope !== undefined)
      admissionDigests.set(prepared, `argon2id-audit:v1:${scope}`);
    return prepared;
  }
  async assertRole(): Promise<void> {
    const row = (await this.pool.query<{
      allowed: boolean;
    }>(`SELECT pg_has_role(current_user,'debateai_password_reset_runtime','USAGE') AND NOT pg_has_role(current_user,'debateai_password_reset_owner','MEMBER') AND NOT has_table_privilege(current_user,'identity.password_reset_control','SELECT,INSERT,UPDATE,DELETE') AND NOT has_any_column_privilege(current_user,'identity.password_reset_control','SELECT,INSERT,UPDATE,REFERENCES') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS allowed`)).rows[0];
    if (row?.allowed !== true)
      throw new TypeError("PASSWORD_RESET_DATABASE_ROLE_INVALID");
  }
  prepare(index: Buffer) {
    return this.call<PasswordResetCandidate | null>("password_reset_prepare", [index]);
  }
  start(input: Readonly<{
    index: Buffer;
    candidateId: string | null;
    channels: readonly string[];
    refs: CryptoEnvelope;
    linkHash: string;
    cancelHash: string;
    notices: readonly Readonly<{
      channelId: string;
      envelope: CryptoEnvelope;
      proofEnvelope?: CryptoEnvelope;
    }>[];
    source: Source;
  }>) {
    // NV-17: 0131's guarded start refuses while the account's proof lock is live, then delegates to 0108's sealed start.
    return withMailLocale(this.pool, input.source.mailLocale, client => this.call<boolean>("password_reset_start_guarded", [input.index, input.candidateId, input.channels, JSON.stringify(input.refs), input.linkHash, input.cancelHash, JSON.stringify(input.notices), sourceJson(input.source), this.registerVersion], client));
  }
  exchange(link: string, session: string, csrf: string, source: Source) {
    return this.call<"PASSWORD_REQUIRED" | "INVALID">("password_reset_exchange", [link, session, csrf, sourceJson(source)]);
  }
  read(session: string) {
    return this.call<PasswordResetRecord | null>("password_reset_read", [session]);
  }
  /** NV-17: charges the account's proof counter before the code is matched (0131); READY carries what complete needs. */
  reserveProof(session: string, source: Source, lockMs: number) {
    return withMailLocale(this.pool, source.mailLocale, client => this.call<Readonly<{ status: "INVALID" | "REFUSED" }> | Readonly<{ status: "READY"; userId: string; factorId: string; factorSecret: CryptoEnvelope; lastAcceptedStep: number | null; nowMs: number }>>("password_reset_proof_reserve", [session, sourceJson(source), lockMs], client));
  }
  /** NV-17: settles a mismatched code: the proof DENY audit, and the REFUSED close at the cap or under the lock. */
  proofRefused(session: string, source: Source) {
    return withMailLocale(this.pool, source.mailLocale, client => this.call<void>("password_reset_proof_refused", [session, sourceJson(source)], client));
  }
  complete(input: Readonly<{
    sessionHash: string;
    passwordHash: string;
    factorId: string;
    factorSecret: CryptoEnvelope;
    lastAcceptedStep: number | null;
    step: number;
    source: Source;
  }>) {
    return withMailLocale(this.pool, input.source.mailLocale, client => this.call<"COMPLETED" | "INVALID">("password_reset_complete_guarded", [input.sessionHash, input.passwordHash, input.factorId, JSON.stringify(input.factorSecret), input.lastAcceptedStep, input.step, sourceJson(input.source)], client));
  }
  // C09 (R-21): cancel, cancelSession and failure write CANCELLED or REFUSED through password_reset_close (0104:83, notice at 0104:92);
  // failure is the release before's REFUSED route (this release's complete settles through proofRefused). Each runs in its own withMailLocale transaction.
  cancel(hash: string, source: Source) {
    return withMailLocale(this.pool, source.mailLocale, client => this.call<"CANCELLED" | "INVALID">("password_reset_cancel", [hash, sourceJson(source)], client));
  }
  cancelSession(hash: string, source: Source) {
    return withMailLocale(this.pool, source.mailLocale, client => this.call<"CANCELLED" | "INVALID">("password_reset_cancel_session", [hash, sourceJson(source)], client));
  }
  admit(source: Source) {
    // NV-39: the 0131 admit, keyed by the admission digest, gives up a bounded batch of rows when the window is full.
    return this.call<boolean>("password_reset_admit_evicting", [JSON.stringify({ ipArgon2id: admissionDigests.get(source) ?? source.ipArgon2id, userAgentArgon2id: source.userAgentArgon2id }), this.registerVersion]);
  }
  failure(hash: string, source: Source) {
    return withMailLocale(this.pool, source.mailLocale, client => this.call<void>("password_reset_failure", [hash, sourceJson(source)], client));
  }
  expire(batch: number) {
    return this.call<number>("expire_password_reset", [batch]);
  }
  async claimNotice(leaseMs: number): Promise<PasswordResetNotice | null> {
    // NV-40: 0131's claim dead-letters every stale unleased PROOF first, so null means nothing deliverable is due.
    const row = await this.call<(Omit<PasswordResetNotice, "mailLocale"> & Readonly<{ mail_locale: string }>) | null>("password_reset_claim_pending_notice", [leaseMs]);
    if (row === null)
      return null;
    // The stored value is checked here too: an unreadable row fails closed instead of sending in a default language.
    const { mail_locale, ...notice } = row;
    return { ...notice, mailLocale: assertMailLocale(mail_locale) };
  }
  finishNotice(id: string, lease: string, sent: boolean, retryMs: number, maxAttempts: number) {
    return this.call<boolean>("password_reset_finish_notice", [id, lease, sent, retryMs, maxAttempts]);
  }
}
