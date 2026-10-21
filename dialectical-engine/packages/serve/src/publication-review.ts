import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  CONTENT_JSON_SENTINEL, decryptContentForRun, encryptAttestedContentForRun,
  withRunContentLease, type CryptoEnvelope
} from "@debateai/db";

export type PublicationReviewCode =
  | "PUBLICATION_REVIEW_PENDING" | "PUBLICATION_REVIEW_DECIDED"
  | "PUBLICATION_REVIEW_NOT_ALLOWED" | "PUBLICATION_REVIEW_OWN_DEBATE"
  | "PUBLICATION_REVIEW_SAME_REVIEWER" | "PUBLICATION_REVIEW_NOT_FOUND"
  | "PUBLICATION_REVIEW_UNAVAILABLE";

const refusalCodes: ReadonlySet<string> = new Set<PublicationReviewCode>([
  "PUBLICATION_REVIEW_PENDING", "PUBLICATION_REVIEW_DECIDED",
  "PUBLICATION_REVIEW_NOT_ALLOWED", "PUBLICATION_REVIEW_OWN_DEBATE",
  "PUBLICATION_REVIEW_SAME_REVIEWER", "PUBLICATION_REVIEW_NOT_FOUND",
  "PUBLICATION_REVIEW_UNAVAILABLE"
]);

export class PublicationReviewRefusal extends Error {
  constructor(readonly code: PublicationReviewCode) {
    super(code);
    this.name = "PublicationReviewRefusal";
  }
}

function rethrowReviewCode(error: unknown): never {
  if (error instanceof Error && refusalCodes.has(error.message)) {
    throw new PublicationReviewRefusal(error.message as PublicationReviewCode);
  }
  throw error;
}

export interface PublicationReviewRecord {
  readonly reviewRef?: string;
  readonly originVersion: number;
  readonly askOrdinal: 1 | 2;
  readonly askedAt?: Date;
  readonly decision: {
    readonly outcome: "APPROVE" | "REFUSE";
    readonly decidedAt: Date;
    readonly reason?: string;
  } | null;
}

export interface PendingReview {
  readonly reviewRef: string;
  readonly runId: string;
  readonly answerId: string;
  readonly originVersion: number;
  readonly ownerRef: string;
  readonly ownerUserId: string;
  readonly askedAt: Date;
  readonly askOrdinal: 1 | 2;
}

export interface OpenedReview extends PendingReview {
  readonly reasonSalt: string;
}

type StaffAuth = { readonly context: unknown; readonly tokenHash: string };
type OpenInput = StaffAuth & { readonly reviewRef: string; readonly purpose: "READ" | "DECIDE" };
type SqlReview = {
  review_ref: string; synthesis_origin_version: number; ask_ordinal: 1 | 2;
  asked_at: Date; outcome: "APPROVE" | "REFUSE" | null; decided_at: Date | null;
  content: { reason?: string | null } | null; content_ciphertext: CryptoEnvelope | null;
};

function pendingOf(value: Record<string, unknown>): PendingReview {
  return {
    reviewRef: String(value.reviewRef), runId: String(value.runId),
    answerId: String(value.answerId), originVersion: Number(value.originVersion),
    ownerRef: String(value.ownerRef), ownerUserId: String(value.ownerUserId),
    askedAt: new Date(String(value.askedAt)), askOrdinal: Number(value.askOrdinal) as 1 | 2
  };
}

export class PublicationReviewRepository {
  constructor(private readonly pool: Pool) {}

  async ask(input: {
    readonly grantTokenHash: string; readonly sessionId: string;
    readonly userId: string; readonly ownerRef: string;
    readonly runId: string; readonly answerId: string; readonly originVersion: number;
  }): Promise<"ASKED" | "GRANT_INVALID" | "PENDING" | "NOT_ALLOWED"> {
    try {
      const row = await this.pool.query<{ result: "ASKED" | "GRANT_INVALID" | "PENDING" | "NOT_ALLOWED" }>(
        "SELECT serve.ask_publication_review($1,$2,$3,$4,$5,$6,$7) AS result",
        [input.grantTokenHash,input.sessionId,input.userId,input.ownerRef,input.runId,input.answerId,input.originVersion]
      );
      return row.rows[0]!.result;
    } catch(error) { return rethrowReviewCode(error); }
  }

  async readStates(input: { readonly ownerRef: string; readonly runId: string; readonly answerId: string }): Promise<PublicationReviewRecord[]> {
    try {
      const result = await this.pool.query<SqlReview>(
        "SELECT * FROM serve.read_publication_review_state($1,$2,$3)",
        [input.ownerRef,input.runId,input.answerId]
      );
      if (result.rows.length === 0) return [];
      return withRunContentLease(this.pool,[input.runId],async () => Promise.all(result.rows.map(async (row) => {
        const content = row.outcome === null ? null : await decryptContentForRun(
          this.pool,input.runId,"serve.publication_review_decision",row.review_ref,
          row.content_ciphertext,row.content ?? {}
        );
        return {
          reviewRef: row.review_ref, originVersion: row.synthesis_origin_version,
          askOrdinal: row.ask_ordinal, askedAt: row.asked_at,
          decision: row.outcome === null ? null : {
            outcome: row.outcome, decidedAt: row.decided_at!,
            ...(row.outcome === "REFUSE" ? {reason: content?.reason ?? ""} : {})
          }
        };
      })));
    } catch(error) {
      if (error instanceof Error && /PRIVATE_CONTENT_ERASED/.test(error.message)) return [];
      return rethrowReviewCode(error);
    }
  }

  async approvalCovers(input: { readonly runId: string; readonly answerId: string; readonly originVersion: number }): Promise<boolean> {
    try {
      const result = await this.pool.query<{ approved: boolean }>(
        "SELECT serve.publication_review_approved($1,$2,$3) AS approved",
        [input.runId,input.answerId,input.originVersion]
      );
      return result.rows[0]!.approved;
    } catch(error) { return rethrowReviewCode(error); }
  }

  async listPending(input: StaffAuth & { readonly limit: number }): Promise<PendingReview[]> {
    try {
      const result = await this.pool.query<{ value: { items: Record<string, unknown>[] } }>(
        "SELECT staff.list_publication_reviews($1::jsonb,$2,$3) AS value",
        [JSON.stringify(input.context),input.tokenHash,input.limit]
      );
      return result.rows[0]!.value.items.map(pendingOf);
    } catch(error) { return rethrowReviewCode(error); }
  }

  async open(input: OpenInput): Promise<OpenedReview> {
    try {
      const result = await this.pool.query<{ value: Record<string, unknown> }>(
        "SELECT staff.open_publication_review($1::jsonb,$2,$3,$4) AS value",
        [JSON.stringify(input.context),input.tokenHash,input.reviewRef,input.purpose]
      );
      const value = result.rows[0]!.value;
      return { ...pendingOf(value), reasonSalt: String(value.reasonSalt) };
    } catch(error) { return rethrowReviewCode(error); }
  }

  async recordCopy(input: StaffAuth & {
    readonly opened: OpenedReview; readonly answerVersion: number; readonly snapshot: unknown;
  }): Promise<void> {
    try {
      await withRunContentLease(this.pool,[input.opened.runId],async () => {
        const copyRef = randomUUID();
        const sealed = await encryptAttestedContentForRun(
          this.pool,input.opened.runId,"serve.publication_review_copy",copyRef,input.snapshot
        );
        if (sealed === null) throw new Error("CONTENT_CIPHER_UNAVAILABLE");
        await this.pool.query(
          "SELECT staff.record_publication_review_copy($1::jsonb,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)",
          [JSON.stringify(input.context),input.tokenHash,input.opened.reviewRef,copyRef,
            input.opened.answerId,input.answerVersion,JSON.stringify(CONTENT_JSON_SENTINEL),
            JSON.stringify(sealed.envelope),sealed.attestation]
        );
      });
    } catch(error) { return rethrowReviewCode(error); }
  }

  async decide(input: StaffAuth & {
    readonly proofId: string; readonly binding: unknown;
    readonly opened: OpenedReview; readonly outcome: "APPROVE" | "REFUSE"; readonly reason?: string | null;
  }): Promise<{ readonly decidedAt: Date }> {
    try {
      return await withRunContentLease(this.pool,[input.opened.runId],async () => {
        const sealed = await encryptAttestedContentForRun(
          this.pool,input.opened.runId,"serve.publication_review_decision",input.opened.reviewRef,
          { reason: input.outcome === "REFUSE" ? input.reason ?? null : null }
        );
        if (sealed === null) throw new Error("CONTENT_CIPHER_UNAVAILABLE");
        const result = await this.pool.query<{ value: { decidedAt: string } }>(
          "SELECT staff.decide_publication_review($1::jsonb,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8::jsonb,$9) AS value",
          [JSON.stringify(input.context),input.tokenHash,input.proofId,JSON.stringify(input.binding),
            input.opened.reviewRef,input.outcome,JSON.stringify(CONTENT_JSON_SENTINEL),
            JSON.stringify(sealed.envelope),sealed.attestation]
        );
        return { decidedAt: new Date(result.rows[0]!.value.decidedAt) };
      });
    } catch(error) { return rethrowReviewCode(error); }
  }
}

export interface PublicationReviewState {
  readonly state: "NONE" | "UNDER_REVIEW" | "APPROVED" | "REFUSED";
  readonly asksUsed: 0 | 1 | 2;
  readonly mayAsk: boolean;
  readonly refusal: { readonly reason: string; readonly decidedAt: Date } | null;
}

export function reviewStateOf(
  records: readonly PublicationReviewRecord[],
  originVersion: number
): PublicationReviewState {
  const latest = records
    .filter((record) => record.originVersion === originVersion)
    .reduce<PublicationReviewRecord | null>((selected, record) =>
      selected === null || record.askOrdinal > selected.askOrdinal ? record : selected, null);
  if (latest === null) return { state: "NONE", asksUsed: 0, mayAsk: true, refusal: null };
  const asksUsed = latest.askOrdinal;
  if (latest.decision === null) {
    return { state: "UNDER_REVIEW", asksUsed, mayAsk: false, refusal: null };
  }
  if (latest.decision.outcome === "APPROVE") {
    return { state: "APPROVED", asksUsed, mayAsk: false, refusal: null };
  }
  return {
    state: "REFUSED", asksUsed, mayAsk: asksUsed < 2,
    refusal: { reason: latest.decision.reason ?? "", decidedAt: latest.decision.decidedAt }
  };
}
