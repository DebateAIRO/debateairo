import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import { TypedDomainError, type SecurityReceipt, type StaffContext, type StaffProof } from "@debateai/kernel";
import { guardedAuthorityQuery, type StaffAlertIntent } from "./staff-access.js";

/** The Report button and the sealed originals' six months (migration 0151; plan 2026-10-31-r22-owner-changes decisions 35 and 36), through 0151's definers only. */
export type PublicFlagOpened = "LIMITED" | "NOT_PUBLIC" | "CHECK" | "QUEUE";
export type PublicFlagSettled = "HIDDEN" | "QUEUED" | "NOT_FOUND" | "CHECKING";
export type PublicFlagVerdict = "AGREE" | "NOT_FOUND" | "UNSURE" | "UNAVAILABLE";
export type PublicFlagLimits = Readonly<{ personHour: number; debateDay: number; siteDay: number }>;
export type PublicFlagQueueRow = Readonly<{ flag_id: string; publication_ref: string; run_id: string; reporter: string | null; state: "CHECKING" | "QUEUED" | "NOT_FOUND" | "HIDDEN"; verdict: PublicFlagVerdict | null; reason: "CONTENT" | "PERSONAL" | null;
  created_at: string; judged_at: string | null; dismissed_at: string | null; content: CryptoEnvelope | null; debate_hidden: boolean }>;
export type PublicFlagNoticeClaim = Readonly<{ notice_id: string; kind: "PUBLIC_FLAG_HIDDEN" | "PUBLIC_FLAG_WAITING"; recipient_staff_id: string; claim_token: string }>;
export type PublicReviewPurgeDue = Readonly<{ publication_ref: string; run_id: string; piece_kind: "SNAPSHOT" | "UPDATE" | "REPORT"; piece_id: string; mode: "BAKED" | "EMPTIED"; up_to_revision: number; content: CryptoEnvelope;
  corrections: readonly Readonly<{ pointer: string; content: CryptoEnvelope }>[] }>;

function receiptOf(value: unknown): SecurityReceipt {
  const row = value as { operationId?: unknown; outcome?: unknown; recordedAt?: unknown } | null;
  if (row === null || typeof row !== "object" || typeof row.operationId !== "string" || row.outcome !== "COMPLETED" || typeof row.recordedAt !== "string") throw new TypedDomainError("PUBLIC_FLAG_UNAVAILABLE", "The report queue is unavailable");
  return Object.freeze({ operationId: row.operationId, outcome: "COMPLETED", recordedAt: new Date(row.recordedAt) });
}

export class PostgresPublicFlagRepository {
  constructor(private readonly pool: Pool) {}

  private async one(sql: string, values: readonly unknown[]): Promise<unknown> {
    return (await this.pool.query<{ value: unknown }>(sql, [...values])).rows[0]?.value;
  }
  /** The run to seal under, only for a debate that is public or hidden under review. Null for a private or guessed one. */
  async readTarget(publicationRef: string): Promise<string | null> {
    return (await this.one("SELECT identity.read_public_flag_target($1::uuid) AS value", [publicationRef]) as string | null | undefined) ?? null;
  }
  async open(input: Readonly<{ ownerRef: string; publicationRef: string; flagId: string; content: CryptoEnvelope; limits: PublicFlagLimits }>): Promise<PublicFlagOpened> {
    return await this.one("SELECT identity.open_public_flag($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5,$6,$7) AS value",
      [input.ownerRef, input.publicationRef, input.flagId, JSON.stringify(input.content), input.limits.personHour, input.limits.debateDay, input.limits.siteDay]) as PublicFlagOpened;
  }
  async settle(input: Readonly<{ flagId: string; verdict: PublicFlagVerdict; reason: "CONTENT" | "PERSONAL" | null; providerRef: string | null; modelId: string | null; inputTokens: number | null; outputTokens: number | null; costUsd: number | null }>): Promise<PublicFlagSettled> {
    return await this.one("SELECT identity.settle_public_flag($1::uuid,$2,$3,$4,$5,$6,$7,$8) AS value",
      [input.flagId, input.verdict, input.reason, input.providerRef, input.modelId, input.inputTokens, input.outputTokens, input.costUsd]) as PublicFlagSettled;
  }
  /** 0157: the automatic hide's quote, the page's own words the check copied, sealed under the publication's key. False: the report did not hide its debate. */
  async recordQuote(flagId: string, content: CryptoEnvelope): Promise<boolean> {
    return await this.one("SELECT identity.record_public_flag_quote($1::uuid,$2::jsonb) AS value", [flagId, JSON.stringify(content)]) === true;
  }
  async readQueue(actor: StaffContext, token: string): Promise<readonly PublicFlagQueueRow[]> {
    const value = (await guardedAuthorityQuery<{ value: PublicFlagQueueRow[] }>(this.pool, "SELECT staff.read_public_flag_queue($1::jsonb,$2) AS value", [actor, token])).rows[0]?.value;
    return value ?? [];
  }
  async dismiss(input: Readonly<{ actor: StaffContext; proof: StaffProof; flagId: string; operationId: string; alertIntent: StaffAlertIntent }>): Promise<SecurityReceipt> {
    return receiptOf(await this.one("SELECT staff.public_flag_dismiss($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, input.flagId, input.operationId, input.alertIntent]));
  }
  async deleteWordsDue(): Promise<number> {
    return await this.one("SELECT identity.delete_public_flag_words_due() AS value", []) as number;
  }
  async readPurgeDue(limit: number): Promise<readonly PublicReviewPurgeDue[]> {
    return await this.one("SELECT identity.read_public_review_purge_due($1) AS value", [limit]) as PublicReviewPurgeDue[];
  }
  async purge(input: Readonly<{ publicationRef: string; pieceKind: string; pieceId: string; mode: string; upToRevision: number; content: CryptoEnvelope; originalSha256: string }>): Promise<"PURGED" | "ALREADY" | "NOT_DUE"> {
    return await this.one("SELECT identity.public_review_purge($1::uuid,$2,$3::uuid,$4,$5,$6::jsonb,$7) AS value",
      [input.publicationRef, input.pieceKind, input.pieceId, input.mode, input.upToRevision, JSON.stringify(input.content), input.originalSha256]) as "PURGED" | "ALREADY" | "NOT_DUE";
  }
  /** The first-run measure: what one AI check of a public row used. */
  async recordCheckUsage(input: Readonly<{ subjectKind: "RUN" | "PUBLIC_REPORT"; subjectId: string; attemptedAt: Date; calls: number; inputTokens: number | null; outputTokens: number | null; costUsd: number | null }>): Promise<void> {
    await this.pool.query("SELECT identity.record_public_check_usage($1,$2::uuid,$3,$4,$5,$6,$7)", [input.subjectKind, input.subjectId, input.attemptedAt, input.calls, input.inputTokens, input.outputTokens, input.costUsd]);
  }
  async claimNotices(limit: number): Promise<readonly PublicFlagNoticeClaim[]> {
    return (await this.pool.query<PublicFlagNoticeClaim>("SELECT notice_id,kind,recipient_staff_id,claim_token FROM staff.claim_public_flag_notices($1)", [limit])).rows;
  }
  async completeNotice(noticeId: string, claimToken: string, delivered: boolean): Promise<void> {
    await this.pool.query("SELECT staff.complete_public_flag_notice($1::uuid,$2::uuid,$3)", [noticeId, claimToken, delivered]);
  }
  async noticeUser(noticeId: string, claimToken: string): Promise<string | null> {
    return (await this.one("SELECT staff.public_flag_notice_user($1::uuid,$2::uuid) AS value", [noticeId, claimToken]) as string | null | undefined) ?? null;
  }
}
