import type { Pool } from "pg";
import type { CryptoEnvelope } from "@debateai/crypto";
import { TypedDomainError, type SecurityReceipt, type StaffContext, type StaffProof } from "@debateai/kernel";
import { guardedAuthorityQuery, type StaffAlertIntent } from "./staff-access.js";

/**
 * A public debate under review (migration 0150; plan 2026-10-31-r22-owner-changes decision 33), through 0150's definers only: the runtime reads no table. SQL owns who may act, the clock, the revision, the
 * proof and the log.
 */
export type PublicReviewStepName = "HIDE" | "REPUBLISH" | "REMOVE_DIG" | "PUT_BACK" | "CORRECT" | "HIDE_REPORT" | "DECIDE";
/** 0157: the ground's fields as the proof's body carries them: the codes sorted and comma-joined, and "" for none. */
export type PublicReviewGroundFields = Readonly<{ grounds: string; source: string; flag_id: string; facts_sha256: string }>;
export type PublicReviewCommandState = Readonly<{ expectedRevision: number; hidden: boolean }>;
export type PublicReviewMaterial = Readonly<{
  snapshot: Readonly<{ run_id: string; created_at: string; content: CryptoEnvelope; latest_state: string | null }>; hidden: boolean; revision: number;
  digs: readonly Readonly<{ dig_run_id: string; parent_run_id: string; position_ref: string | null; contributed_at: string; contributor: string | null; removed: boolean }>[];
  updates: readonly Readonly<{ update_id: string; update_seq: number; dig_run_id: string | null; kind: "PATH" | "MAIN_ANSWER"; position_ref: string | null; recorded_at: string; content: CryptoEnvelope; off: boolean; own_dig_removed: boolean }>[];
  reports: readonly Readonly<{ report_id: string; report_version: number; recorded_at: string; requested_at: string; writer: string | null; content: CryptoEnvelope; off: boolean; hidden_by_hand: boolean }>[];
  corrections: readonly Readonly<{ revision: number; piece_kind: "SNAPSHOT" | "UPDATE" | "REPORT"; piece_id: string; pointer: string; recorded_at: string; content: CryptoEnvelope }>[];
  log: readonly Readonly<{ revision: number; action: PublicReviewStepName; piece_kind: string | null; piece_id: string | null; pointer: string | null; actor_staff_id: string; at: string }>[];
}>;
export type PublicReviewListRead = Readonly<{
  hidden: readonly Readonly<{ publication_ref: string; hidden_at: string }>[];
  log: readonly Readonly<{ publication_ref: string; revision: number; action: PublicReviewStepName; piece_kind: string | null; actor_staff_id: string; at: string; operation_id: string }>[];
}>;
export type PublicReviewNoticeClaim = Readonly<{ notice_id: string; kind: "PUBLIC_REVIEW"; recipient_staff_id: string; claim_token: string }>;
export type PublicReviewOverlayRead = Readonly<{ changed: boolean; corrections: readonly Readonly<{ piece_kind: "SNAPSHOT" | "UPDATE" | "REPORT"; piece_key: string; pointer: string; content: CryptoEnvelope }>[] }>;

const refusal = () => new TypedDomainError("PUBLIC_REVIEW_UNAVAILABLE", "The review is unavailable");
function receiptOf(value: unknown): SecurityReceipt {
  const row = value as { operationId?: unknown; outcome?: unknown; recordedAt?: unknown } | null;
  if (row === null || typeof row !== "object" || typeof row.operationId !== "string" || row.outcome !== "COMPLETED" || typeof row.recordedAt !== "string") throw refusal();
  return Object.freeze({ operationId: row.operationId, outcome: "COMPLETED", recordedAt: new Date(row.recordedAt) });
}

export class PostgresPublicReviewRepository {
  constructor(private readonly pool: Pool) {}

  private async one(sql: string, values: readonly unknown[]): Promise<unknown> {
    return (await this.pool.query<{ value: unknown }>(sql, [...values])).rows[0]?.value;
  }
  async readCommand(actor: StaffContext, token: string, publicationRef: string): Promise<PublicReviewCommandState> {
    const value = (await guardedAuthorityQuery<{ value: PublicReviewCommandState }>(this.pool, "SELECT staff.read_public_review_command($1::jsonb,$2,$3::uuid) AS value", [actor, token, publicationRef])).rows[0]?.value;
    if (value === undefined || !Number.isSafeInteger(value.expectedRevision)) throw refusal();
    return value;
  }
  async read(actor: StaffContext, token: string, publicationRef: string): Promise<PublicReviewMaterial | null> {
    return (await this.pool.query<{ value: PublicReviewMaterial | null }>("SELECT staff.read_public_review($1::jsonb,$2,$3::uuid) AS value", [actor, token, publicationRef])).rows[0]?.value ?? null;
  }
  async list(actor: StaffContext, token: string): Promise<PublicReviewListRead> {
    const value = (await guardedAuthorityQuery<{ value: PublicReviewListRead }>(this.pool, "SELECT staff.read_public_review_list($1::jsonb,$2) AS value", [actor, token])).rows[0]?.value;
    if (value === undefined) throw refusal();
    return value;
  }
  /**
   * `alertIntent` null only for a hide while team tools are locked; the database refuses it for any other step. Through 0157's door: the ground's four fields as the
   * proof bound them ("" for none), and the typed facts sealed under the debate's key. 0150's door stays for the release before.
   */
  async act(input: Readonly<{ actor: StaffContext; proof: StaffProof; step: PublicReviewStepName; publicationRef: string; pieceKind: string | null; pieceId: string | null; pointer: string | null;
    textSha256: string | null; content: CryptoEnvelope | null; ground: PublicReviewGroundFields; facts: CryptoEnvelope | null; expectedRevision: number; operationId: string;
    alertIntent: StaffAlertIntent | null }>): Promise<SecurityReceipt> {
    const command = { targetId: input.publicationRef, step: input.step, pieceKind: input.pieceKind ?? "", pieceId: input.pieceId ?? "", pointer: input.pointer ?? "", textSha256: input.textSha256 ?? "",
      expectedRevision: input.expectedRevision, operationId: input.operationId, grounds: input.ground.grounds, source: input.ground.source, flagId: input.ground.flag_id, factsSha256: input.ground.facts_sha256 };
    return receiptOf(await this.one("SELECT staff.public_review_act_grounded($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.content === null ? null : JSON.stringify(input.content), input.facts === null ? null : JSON.stringify(input.facts), input.alertIntent]));
  }
  async readOverlay(publicationRef: string): Promise<PublicReviewOverlayRead | null> {
    return (await this.one("SELECT identity.read_public_review_overlay($1::uuid) AS value", [publicationRef]) as PublicReviewOverlayRead | null) ?? null;
  }
  async isHeld(publicationRef: string): Promise<boolean> {
    return await this.one("SELECT identity.public_review_held($1::uuid) AS value", [publicationRef]) === true;
  }
  async claimNotices(limit: number): Promise<readonly PublicReviewNoticeClaim[]> {
    return (await this.pool.query<PublicReviewNoticeClaim>("SELECT notice_id,kind,recipient_staff_id,claim_token FROM staff.claim_public_review_notices($1)", [limit])).rows;
  }
  async completeNotice(noticeId: string, claimToken: string, delivered: boolean): Promise<void> {
    await this.pool.query("SELECT staff.complete_public_review_notice($1::uuid,$2::uuid,$3)", [noticeId, claimToken, delivered]);
  }
  async noticeUser(noticeId: string, claimToken: string): Promise<string | null> {
    return (await this.one("SELECT staff.public_review_notice_user($1::uuid,$2::uuid) AS value", [noticeId, claimToken]) as string | null | undefined) ?? null;
  }
}
