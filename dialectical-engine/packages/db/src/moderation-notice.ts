import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";

/** The moderation notice (migration 0156): a person whose content a review took off the public page is told, through 0156's definers only. */
export type ModerationNoticeKind = "DEBATE_HIDDEN" | "CONTRIBUTION_REMOVED" | "REPORT_REMOVED";
export type ModerationNoticeClaim = Readonly<{ noticeId: string; claimToken: string }>;
export type ModerationNotice = Readonly<{ userId: string; kind: ModerationNoticeKind; happenedAt: string; mailLocale: string; emailCiphertext: CryptoEnvelope }>;
/** SENT: delivered. RETRY: the transport failed (the twentieth time is final). DROPPED: nothing to send to; final at once. */
export type ModerationNoticeOutcome = "SENT" | "RETRY" | "DROPPED";

export class PostgresModerationNoticeRepository {
  constructor(private readonly pool: Pool) {}

  async claim(limit = 100): Promise<readonly ModerationNoticeClaim[]> {
    return (await this.pool.query<{ notice_id: string; claim_token: string }>("SELECT * FROM identity.claim_moderation_notices($1)", [limit]))
      .rows.map((row) => Object.freeze({ noticeId: row.notice_id, claimToken: row.claim_token }));
  }
  /** Null: the claim ran out, or the account is no longer active. */
  async read(claim: ModerationNoticeClaim): Promise<ModerationNotice | null> {
    return (await this.pool.query<{ value: ModerationNotice | null }>("SELECT identity.read_moderation_notice($1::uuid,$2::uuid) AS value", [claim.noticeId, claim.claimToken])).rows[0]?.value ?? null;
  }
  /** False: the claim was no longer live, and nothing changed. */
  async complete(claim: ModerationNoticeClaim, outcome: ModerationNoticeOutcome): Promise<boolean> {
    return (await this.pool.query<{ value: boolean }>("SELECT identity.complete_moderation_notice($1::uuid,$2::uuid,$3) AS value", [claim.noticeId, claim.claimToken, outcome])).rows[0]?.value === true;
  }
}
