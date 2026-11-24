import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import { TypedDomainError, type SecurityReceipt, type StaffContext, type StaffProof } from "@debateai/kernel";
import { guardedAuthorityQuery, type StaffAlertIntent } from "./staff-access.js";
import { assertMailLocale } from "./mail-locale.js";
import type { EmailRecoveryNotice, EmailRecoverySource } from "./email-mfa-recovery.js";

/**
 * The Owner's permit for a locked-out account (migration 0188), through 0188's definers only: no login reads or writes
 * a table. SQL owns every rule (who may ask, the Owner's proof, the daily limit, the 72 hours, what ends an ask); the API
 * brings the checked password, the sealed mails and, for an approval, the independent alert.
 */
export type RecoveryPermitChannel = Readonly<{ channelId: string; channelType: "email" | "recovery_email"; addressCiphertext: CryptoEnvelope; proof: boolean; cancelAuthorized: boolean }>;
export type RecoveryPermitCandidate = Readonly<{ userId: string; channels: readonly RecoveryPermitChannel[] }>;
export type RecoveryPermitRequestCandidate = Readonly<{ userId: string; passwordHash: string; proofChannelId: string; proofAddressCiphertext: CryptoEnvelope }>;
export type RecoveryPermitFinishCandidate = Readonly<{ userId: string; passwordHash: string; notBefore: string; expiresAt: string; ready: boolean }>;
export type RecoveryPermitFinish = Readonly<{ status: "OPENED"; expiresAt: string }> | Readonly<{ status: "TOO_EARLY"; notBefore: string }> | Readonly<{ status: "INVALID" }>;

const SHA = /^sha256:[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** The person's side: the email route's login (debateai_mfa_recovery_runtime), the one 0188 grants these to. */
export class PostgresRecoveryPermitRepository {
  constructor(private readonly pool: Pool) {}
  private async call<T>(op: string, args: readonly unknown[]): Promise<T> {
    if (!/^[a-z_]+$/u.test(op)) throw TypeError("RECOVERY_PERMIT_CAPABILITY_INVALID");
    const sql = `SELECT identity.recovery_permit_${op}(${args.map((_, i) => `$${i + 1}`).join(",")}) AS result`;
    return (await this.pool.query<{ result: T }>(sql, [...args])).rows[0]!.result;
  }
  /** The account an address names and its verified addresses, or null for no account and for one that may not ask now. */
  prepare(index: Buffer) { return this.call<RecoveryPermitCandidate | null>("prepare", [index]); }
  start(input: Readonly<{ index: Buffer; candidateId: string; channels: readonly string[]; linkHash: string; cancelHash: string; notices: readonly unknown[]; source: EmailRecoverySource; mailLocale: string; id: string }>) {
    return this.call<boolean>("start", [input.index, input.candidateId, input.channels, input.linkHash, input.cancelHash, JSON.stringify(input.notices), input.source, assertMailLocale(input.mailLocale), input.id]);
  }
  prepareRequest(linkHash: string) { return this.call<RecoveryPermitRequestCandidate | null>("prepare_request", [linkHash]); }
  request(linkHash: string, passwordHash: string, finishHash: string, finishEnvelope: CryptoEnvelope, source: EmailRecoverySource) {
    return this.call<"REQUESTED" | "REFUSED" | "INVALID">("request", [linkHash, passwordHash, finishHash, finishEnvelope, source]);
  }
  /** A wrong password at the mailbox link (with the sealed risk context) or at the finish link (with none). */
  recordFailure(selector: string, kind: "link" | "finish", source: EmailRecoverySource, context: CryptoEnvelope | null) {
    return this.call<"PROOF_INVALID" | "REFUSED" | "INVALID">("record_failure", [selector, kind, source, context]);
  }
  cancel(cancelHash: string, source: EmailRecoverySource) { return this.call<"CANCELLED" | "INVALID">("cancel", [cancelHash, source]); }
  prepareFinish(finishHash: string) { return this.call<RecoveryPermitFinishCandidate | null>("prepare_finish", [finishHash]); }
  finish(finishHash: string, passwordHash: string, capabilityHash: string, source: EmailRecoverySource) {
    return this.call<RecoveryPermitFinish>("finish", [finishHash, passwordHash, capabilityHash, source]);
  }
  /** The sweeper's pass, and the mail worker's two calls (the shape EmailRecoveryNotificationWorker asks for). */
  expire(batch: number) { return this.call<number>("expire", [batch]); }
  async claimNotice(leaseMs: number): Promise<EmailRecoveryNotice | null> {
    const notice = await this.call<(EmailRecoveryNotice & Readonly<{ mail_locale?: string }>) | null>("claim_notice", [leaseMs]);
    if (!notice) return null;
    const { mail_locale: mailLocale, ...rest } = notice;
    return { ...rest, mailLocale: assertMailLocale(mailLocale ?? "") };
  }
  finishNotice(id: string, lease: string, sent: boolean, retry: number, max: number) { return this.call<boolean>("finish_notice", [id, lease, sent, retry, max]); }
}

export type RecoveryPermitDecision = "RECOVERY_PERMIT_APPROVE" | "RECOVERY_PERMIT_REFUSE";
export type RecoveryPermitRow = Readonly<{
  ref: string; userId: string; revision: number; stage: "REQUESTED" | "WAITING" | "OPENED";
  requestedAt: Date; requestExpiresAt: Date; approvedAt: Date | null; notBefore: Date | null; finishExpiresAt: Date | null;
  accountCreatedAt: Date; lastSignInAt: Date | null; passkeys: number; authenticatorApp: boolean; savedCodesLeft: boolean;
  securityHold: boolean; riskMark: boolean; earlierRequests: number;
}>;
export type RecoveryPermitList = Readonly<{ dailyCap: number; approvedToday: number; requests: readonly RecoveryPermitRow[] }>;
export type RecoveryPermitChange = Readonly<{
  actor: StaffContext;
  proof: StaffProof;
  intent: RecoveryPermitDecision;
  requestRef: string;
  targetUserId: string;
  expectedRevision: number;
  operationId: string;
  /** Null only for a refusal while the team tools are locked: the door then writes its own row and no audit row or alert. */
  alertIntent: StaffAlertIntent | null;
}>;

const refusal = () => new TypedDomainError("RECOVERY_PERMITS_UNAVAILABLE", "The recovery requests are unavailable");
const instant = (value: unknown): Date => {
  const at = new Date(typeof value === "string" || value instanceof Date ? value : Number.NaN);
  if (!Number.isFinite(at.getTime())) throw refusal();
  return at;
};
const optionalInstant = (value: unknown): Date | null => value === null || value === undefined ? null : instant(value);
const count = (value: unknown, least = 0): number => {
  if (!Number.isSafeInteger(value) || (value as number) < least) throw refusal();
  return value as number;
};
const flag = (value: unknown): boolean => { if (typeof value !== "boolean") throw refusal(); return value; };

/**
 * The Owner's side. `pool`: the API's request login, which holds the billing role 0188 grants the list and the door to.
 * `accounts`: the API's system login (main.ts, the cross-account site X40), the only one that reads another account's
 * payments; the routes ask it only for the Owner, after the Owner's authority is checked.
 */
export class PostgresRecoveryPermitStaffRepository {
  constructor(private readonly pool: Pool, private readonly accounts: Pick<Pool, "query">) {}

  /** Whether any payment of the account ever succeeded: a yes or a no, never an amount or a date. */
  async everPaid(userId: string): Promise<boolean> {
    if (!UUID.test(userId)) throw refusal();
    const value = (await this.accounts.query<{ paid: unknown }>(
      `SELECT EXISTS(SELECT 1 FROM identity."user" u JOIN billing.charge c ON c.owner_ref=u.owner_ref JOIN billing.charge_event e ON e.charge_id=c.charge_id
        WHERE u.user_id=$1::uuid AND e.kind='SUCCEEDED') AS paid`, [userId])).rows[0]?.paid;
    if (typeof value !== "boolean") throw refusal();
    return value;
  }

  /** The asks that wait, each with the database's facts; the database refuses anyone but the Owner. */
  async readList(context: StaffContext, ordinaryTokenHash: string): Promise<RecoveryPermitList> {
    const value = (await guardedAuthorityQuery<{ value: { dailyCap?: unknown; approvedToday?: unknown; requests?: unknown } }>(this.pool,
      "SELECT staff.read_recovery_permits($1::jsonb,$2) AS value", [context, ordinaryTokenHash])).rows[0]?.value;
    if (value === undefined || value === null || !Array.isArray(value.requests)) throw refusal();
    const requests = (value.requests as unknown[]).map((raw): RecoveryPermitRow => {
      const row = raw as Record<string, unknown> | null;
      if (row === null || typeof row.ref !== "string" || !UUID.test(row.ref) || typeof row.userId !== "string" || !UUID.test(row.userId)
        || (row.stage !== "REQUESTED" && row.stage !== "WAITING" && row.stage !== "OPENED")) throw refusal();
      return Object.freeze({
        ref: row.ref, userId: row.userId, revision: count(row.revision, 1), stage: row.stage,
        requestedAt: instant(row.requestedAt), requestExpiresAt: instant(row.requestExpiresAt), approvedAt: optionalInstant(row.approvedAt),
        notBefore: optionalInstant(row.notBefore), finishExpiresAt: optionalInstant(row.finishExpiresAt),
        accountCreatedAt: instant(row.accountCreatedAt), lastSignInAt: optionalInstant(row.lastSignInAt),
        passkeys: count(row.passkeys), authenticatorApp: flag(row.authenticatorApp), savedCodesLeft: flag(row.savedCodesLeft),
        securityHold: flag(row.securityHold), riskMark: flag(row.riskMark), earlierRequests: count(row.earlierRequests)
      });
    });
    return Object.freeze({ dailyCap: count(value.dailyCap, 1), approvedToday: count(value.approvedToday), requests: Object.freeze(requests) });
  }

  /** The one door. Its refusals keep their own messages (RECOVERY_PERMITS_STALE, RECOVERY_PERMITS_DAILY_CAP, ...). */
  async act(input: RecoveryPermitChange): Promise<SecurityReceipt> {
    const command = { intent: input.intent, requestRef: input.requestRef, targetId: input.targetUserId, expectedRevision: input.expectedRevision, operationId: input.operationId };
    const value = (await this.pool.query<{ value: { operationId?: unknown; outcome?: unknown; recordedAt?: unknown } | null }>(
      "SELECT staff.recovery_permit_act($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.alertIntent])).rows[0]?.value;
    if (value === null || value === undefined || typeof value.operationId !== "string" || value.outcome !== "COMPLETED" || typeof value.recordedAt !== "string") throw refusal();
    return Object.freeze({ operationId: value.operationId, outcome: "COMPLETED", recordedAt: instant(value.recordedAt) });
  }
}

/** A token digest as every 0188 function takes one. */
export function assertRecoveryPermitDigest(value: string): string {
  if (!SHA.test(value)) throw TypeError("RECOVERY_PERMIT_DIGEST_INVALID");
  return value;
}
