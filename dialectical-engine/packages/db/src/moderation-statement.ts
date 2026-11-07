import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";

/**
 * The statements of reasons (migration 0157; DSA Art 17; the owner's D1, D3, D7, D8 and D9 of 6 November 2026), through 0157's definers only: the
 * runtime reads no table. A review step queues one statement per person it affects; the sender mails each once; the signed-in page reads the
 * person's own.
 */
export type ModerationStatementKind = "DEBATE_HIDDEN" | "DEBATE_DECIDED" | "CONTRIBUTION_REMOVED" | "REPORT_REMOVED" | "CORRECTED" | "CONTRIBUTION_AFFECTED" | "REPORT_AFFECTED";
export type ModerationStatementGround = Readonly<{
  /** False: the step was taken before 0157 kept a ground (D9). */
  recorded: boolean; interim: boolean; grounds: readonly string[]; suspected: readonly string[]; sources: readonly string[];
  automated_detection: boolean; automated_decision: boolean;
}>;
export type ModerationStatementClaim = Readonly<{ statementId: string; claimToken: string }>;
export type ModerationStatementMail = Readonly<{ userId: string; statementId: string; kind: ModerationStatementKind; happenedAt: string; mailLocale: string; publicationRef: string;
  ground: ModerationStatementGround; emailCiphertext: CryptoEnvelope }>;
/** SENT: delivered. RETRY: the transport failed (the twentieth time is final). DROPPED: nothing to send to; final at once. */
export type ModerationStatementOutcome = "SENT" | "RETRY" | "DROPPED";
/** One of the person's own statements, as the page reads it. The facts and the quote are sealed under the debate's key: the API opens them. */
export type OwnModerationStatementRead = Readonly<{
  statement_id: string; kind: ModerationStatementKind; publication_ref: string; run_id: string | null; happened_at: string; piece_kind: "DIG" | "REPORT" | null;
  places: readonly Readonly<{ piece_kind: "SNAPSHOT" | "UPDATE" | "REPORT"; piece_id: string; pointer: string }>[]; ground: ModerationStatementGround; hidden_now: boolean;
  facts: readonly (CryptoEnvelope | null)[] | null; facts_deleted: boolean; quote: CryptoEnvelope | null;
}>;

export class PostgresModerationStatementRepository {
  constructor(private readonly pool: Pool) {}

  /** Queues what is new since the last call, then claims oldest first with five minutes to send. */
  async claim(limit = 100): Promise<readonly ModerationStatementClaim[]> {
    return (await this.pool.query<{ statement_id: string; claim_token: string }>("SELECT * FROM identity.claim_moderation_statements($1)", [limit]))
      .rows.map((row) => Object.freeze({ statementId: row.statement_id, claimToken: row.claim_token }));
  }
  /** Null: the claim ran out, or the account is neither active nor in its closure grace. */
  async read(claim: ModerationStatementClaim): Promise<ModerationStatementMail | null> {
    return (await this.pool.query<{ value: ModerationStatementMail | null }>("SELECT identity.read_moderation_statement($1::uuid,$2::uuid) AS value", [claim.statementId, claim.claimToken])).rows[0]?.value ?? null;
  }
  /** False: the claim was no longer live, and nothing changed. */
  async complete(claim: ModerationStatementClaim, outcome: ModerationStatementOutcome): Promise<boolean> {
    return (await this.pool.query<{ value: boolean }>("SELECT identity.complete_moderation_statement($1::uuid,$2::uuid,$3) AS value", [claim.statementId, claim.claimToken, outcome])).rows[0]?.value === true;
  }
  async readOwn(ownerRef: string): Promise<readonly OwnModerationStatementRead[]> {
    return (await this.pool.query<{ value: OwnModerationStatementRead[] }>("SELECT identity.read_own_moderation_statements($1::uuid) AS value", [ownerRef])).rows[0]?.value ?? [];
  }
  /** Twelve months after a step, the typed facts and the automatic hide's quote go; returns how many. */
  async deleteWordsDue(): Promise<number> {
    return Number((await this.pool.query<{ value: number }>("SELECT identity.delete_moderation_words_due() AS value")).rows[0]?.value ?? 0);
  }
}

/**
 * The answers to people who report (migration 0157; DSA Art 16(4)-(6); the owner's D4 of 6 November 2026), through 0157's definers only. The sender
 * queues what is new since the step applied (a receipt, the automatic check's decisions, a person's) and mails each once.
 */
export type PublicFlagMailKind = "RECEIPT" | "AUTO_HIDDEN" | "AUTO_NOT_FOUND" | "NO_BREACH" | "ACTED";
export type PublicFlagMailClaim = Readonly<{ mailId: string; claimToken: string }>;
export type PublicFlagMail = Readonly<{ userId: string; mailId: string; kind: PublicFlagMailKind; happenedAt: string; mailLocale: string; publicationRef: string; emailCiphertext: CryptoEnvelope }>;

export class PostgresPublicFlagMailRepository {
  constructor(private readonly pool: Pool) {}

  /** Queues what is new since the last call, then claims oldest first with five minutes to send. */
  async claim(limit = 100): Promise<readonly PublicFlagMailClaim[]> {
    return (await this.pool.query<{ mail_id: string; claim_token: string }>("SELECT * FROM identity.claim_public_flag_mail($1)", [limit]))
      .rows.map((row) => Object.freeze({ mailId: row.mail_id, claimToken: row.claim_token }));
  }
  /** Null: the claim ran out, or the reporter is erased, or neither active nor in their closure grace. */
  async read(claim: PublicFlagMailClaim): Promise<PublicFlagMail | null> {
    return (await this.pool.query<{ value: PublicFlagMail | null }>("SELECT identity.read_public_flag_mail($1::uuid,$2::uuid) AS value", [claim.mailId, claim.claimToken])).rows[0]?.value ?? null;
  }
  /** False: the claim was no longer live, and nothing changed. */
  async complete(claim: PublicFlagMailClaim, outcome: ModerationStatementOutcome): Promise<boolean> {
    return (await this.pool.query<{ value: boolean }>("SELECT identity.complete_public_flag_mail($1::uuid,$2::uuid,$3) AS value", [claim.mailId, claim.claimToken, outcome])).rows[0]?.value === true;
  }
  /** A report left CHECKING for five minutes goes to a person, through 0151's own settle; returns how many. */
  async settleStuck(): Promise<number> {
    return Number((await this.pool.query<{ value: number }>("SELECT identity.settle_stuck_public_flags() AS value")).rows[0]?.value ?? 0);
  }
}
