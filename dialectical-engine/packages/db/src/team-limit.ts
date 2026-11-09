import type { Pool, PoolClient } from "pg";
import { TypedDomainError, type ActionBinding, type Reason, type SecurityReceipt, type StaffContext, type StaffProof } from "@debateai/kernel";
import { guardedAuthorityQuery, type StaffAlertIntent } from "./staff-access.js";

/**
 * The team's one limit (migration 0142; plan 2026-10-31-r22-owner-changes decision 24), through 0142's definers only: the runtime reads no
 * table. SQL owns who may act, the clock, the revision, the proof and the log. Only `readTeamLimitPage` returns an amount, and only to the
 * two accounts; the room answer carries none.
 */
export type TeamRoom = "NOT_SET" | "FITS" | "FULL";
export type TeamLimitCommandState = Readonly<{ currentMicros: number; expectedRevision: number }>;
export type TeamLimitNoticeClaim = Readonly<{ notice_id: string; kind: "LIMIT_CHANGED" | "PARTNER_CHANGED"; recipient_staff_id: string; claim_token: string }>;
type Mutation = Readonly<{ actor: StaffContext; proof: StaffProof; operationId: string; reason: Reason; alertIntent: StaffAlertIntent }>;

const refusal = () => new TypedDomainError("TEAM_LIMIT_UNAVAILABLE", "The team limit is unavailable");
function receiptOf(value: unknown): SecurityReceipt {
  const row = value as { operationId?: unknown; outcome?: unknown; recordedAt?: unknown } | null;
  if (row === null || typeof row !== "object" || typeof row.operationId !== "string" || row.outcome !== "COMPLETED" || typeof row.recordedAt !== "string") throw refusal();
  return Object.freeze({ operationId: row.operationId, outcome: "COMPLETED", recordedAt: new Date(row.recordedAt) });
}

/** What admission asks: does this estimate fit the team's month. Answered by the database, no amount leaves it. */
export async function readTeamRoom(pool: Pick<Pool, "query"> | PoolClient, estimateMicros: number): Promise<TeamRoom> {
  const room = (await pool.query<{ room: unknown }>("SELECT staff.read_team_room($1::bigint) AS room", [estimateMicros])).rows[0]?.room;
  if (room !== "NOT_SET" && room !== "FITS" && room !== "FULL") throw refusal();
  return room;
}

export class PostgresTeamLimitRepository {
  constructor(private readonly pool: Pool) {}
  private async one(sql: string, values: readonly unknown[]): Promise<unknown> {
    return (await this.pool.query<{ value: unknown }>(sql, [...values])).rows[0]?.value;
  }
  async readCommand(context: StaffContext, ordinaryTokenHash: string): Promise<TeamLimitCommandState> {
    const value = (await guardedAuthorityQuery<{ value: { currentMicros?: unknown; expectedRevision?: unknown } }>(this.pool,
      "SELECT staff.read_team_limit_command($1::jsonb,$2) AS value", [context, ordinaryTokenHash])).rows[0]?.value;
    if (!Number.isSafeInteger(value?.currentMicros) || !Number.isSafeInteger(value?.expectedRevision)) throw refusal();
    return Object.freeze({ currentMicros: value!.currentMicros as number, expectedRevision: value!.expectedRevision as number });
  }
  async readPage(context: StaffContext, ordinaryTokenHash: string): Promise<unknown> {
    return (await guardedAuthorityQuery<{ value: unknown }>(this.pool, "SELECT staff.read_team_limit_page($1::jsonb,$2) AS value", [context, ordinaryTokenHash])).rows[0]?.value;
  }
  async setLimit(input: Mutation & Readonly<{ amountMicros: number; currentMicros: number; expectedRevision: number }>): Promise<SecurityReceipt> {
    const command = { targetId: input.actor.staffId, amountMicros: input.amountMicros, currentMicros: input.currentMicros,
      expectedRevision: input.expectedRevision, operationId: input.operationId, reason: input.reason };
    return receiptOf(await this.one("SELECT staff.set_team_limit($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.alertIntent]));
  }
  async recordPractice(input: Mutation & Readonly<{ practiceRef: string; chargeMicros: number }>): Promise<SecurityReceipt> {
    const command = { targetId: input.practiceRef, chargeMicros: input.chargeMicros, operationId: input.operationId, reason: input.reason };
    return receiptOf(await this.one("SELECT staff.record_team_practice($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.alertIntent]));
  }
  async grantPartner(input: Mutation & Readonly<{ targetStaffId: string }>): Promise<SecurityReceipt> {
    return receiptOf(await this.one("SELECT staff.grant_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, input.targetStaffId, input.operationId, input.reason, input.alertIntent]));
  }
  async revokePartner(input: Mutation & Readonly<{ targetStaffId: string }>): Promise<SecurityReceipt> {
    return receiptOf(await this.one("SELECT staff.revoke_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, input.targetStaffId, input.operationId, input.reason, input.alertIntent]));
  }
  /**
   * The mail loop's leases over 0142's notices. The API calls these three only from its gated timer, outside any request, so on its system login:
   * they are the cross-account marker's (debateai_rls_all_accounts) since 0171, never a request login's.
   */
  async claimNotices(limit: number): Promise<readonly TeamLimitNoticeClaim[]> {
    return (await this.pool.query<TeamLimitNoticeClaim>("SELECT notice_id,kind,recipient_staff_id,claim_token FROM staff.claim_team_limit_notices($1)", [limit])).rows;
  }
  async completeNotice(noticeId: string, claimToken: string, delivered: boolean): Promise<void> {
    await this.pool.query("SELECT staff.complete_team_limit_notice($1::uuid,$2::uuid,$3)", [noticeId, claimToken, delivered]);
  }
  /** The account a claimed notice goes to; null when that account is gone. */
  async noticeUser(noticeId: string, claimToken: string): Promise<string | null> {
    return ((await this.one("SELECT staff.team_limit_notice_user($1::uuid,$2::uuid) AS value", [noticeId, claimToken])) as string | null | undefined) ?? null;
  }
}
export type { ActionBinding };
