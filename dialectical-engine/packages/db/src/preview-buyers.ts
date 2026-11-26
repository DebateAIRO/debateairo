import type { Pool } from "pg";
import { TypedDomainError, type SecurityReceipt, type StaffContext, type StaffProof } from "@debateai/kernel";
import { guardedAuthorityQuery, type StaffAlertIntent } from "./staff-access.js";

/**
 * The preview's approved buyers (migration 0186, its door restated by 0191), through those definers only: no login reads
 * or writes the table. SQL owns who may act (the Owner), the revision, the proof, the cap and the record; the API brings
 * the account a typed address names and, while the team tools are unlocked, the independent alert.
 */
export type PreviewBuyerIntent = "PREVIEW_BUYER_ADD" | "PREVIEW_BUYER_REMOVE";
export type PreviewBuyerRow = Readonly<{ ref: string; userId: string; since: Date }>;
export type PreviewBuyerList = Readonly<{ revision: number; buyers: readonly PreviewBuyerRow[] }>;
export type PreviewBuyerAccount = Readonly<{ userId: string; active: boolean }>;
export type PreviewBuyerChange = Readonly<{
  actor: StaffContext;
  proof: StaffProof;
  intent: PreviewBuyerIntent;
  targetUserId: string;
  expectedRevision: number;
  operationId: string;
  /** Null while the team tools are locked, for an addition or a removal: the door then writes its own row and no audit row or alert. */
  alertIntent: StaffAlertIntent | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const refusal = () => new TypedDomainError("PREVIEW_BUYERS_UNAVAILABLE", "The approved buyers are unavailable");
const instant = (value: unknown): Date => {
  const at = new Date(typeof value === "string" || value instanceof Date ? value : Number.NaN);
  if (!Number.isFinite(at.getTime())) throw refusal();
  return at;
};

export class PostgresPreviewBuyerRepository {
  /**
   * `pool`: the API's request login, which holds the billing role 0186 grants the three definers to. `accounts`: the
   * API's system login (main.ts, the cross-account site X39), the only one that can look up another account by its
   * address's blind index; the routes ask it only for the Owner, after the Owner's authority is checked.
   */
  constructor(private readonly pool: Pool, private readonly accounts: Pick<Pool, "query">) {}

  /** The pay button's question for one account: is it on the list now. Anything but a plain yes or no throws. */
  async listed(userId: string): Promise<boolean> {
    if (!UUID.test(userId)) throw refusal();
    const value = (await this.pool.query<{ listed: unknown }>("SELECT staff.preview_buyer_listed($1::uuid) AS listed", [userId])).rows[0]?.listed;
    if (typeof value !== "boolean") throw refusal();
    return value;
  }

  /** The Owner's list and its revision; the database refuses anyone else. */
  async readList(context: StaffContext, ordinaryTokenHash: string): Promise<PreviewBuyerList> {
    const value = (await guardedAuthorityQuery<{ value: { revision?: unknown; buyers?: unknown } }>(this.pool,
      "SELECT staff.read_preview_buyers($1::jsonb,$2) AS value", [context, ordinaryTokenHash])).rows[0]?.value;
    if (!Number.isSafeInteger(value?.revision) || (value!.revision as number) < 0 || !Array.isArray(value?.buyers)) throw refusal();
    const buyers = (value!.buyers as unknown[]).map((row): PreviewBuyerRow => {
      const item = row as { ref?: unknown; userId?: unknown; since?: unknown } | null;
      if (item === null || typeof item.ref !== "string" || !UUID.test(item.ref) || typeof item.userId !== "string" || !UUID.test(item.userId)) throw refusal();
      return Object.freeze({ ref: item.ref, userId: item.userId, since: instant(item.since) });
    });
    return Object.freeze({ revision: value!.revision as number, buyers: Object.freeze(buyers) });
  }

  /** The account whose address has this blind index, and whether it is active; null when none has it. */
  async findAccount(emailBlindIndex: Buffer): Promise<PreviewBuyerAccount | null> {
    const row = (await this.accounts.query<{ user_id: string; state: string }>(
      'SELECT user_id,state FROM identity."user" WHERE email_blind_index=$1', [emailBlindIndex])).rows[0];
    return row === undefined ? null : Object.freeze({ userId: row.user_id, active: row.state === "active" });
  }

  /** The one door. Its refusals keep their own messages (PREVIEW_BUYERS_STALE, PREVIEW_BUYER_ALREADY, ...). */
  async act(input: PreviewBuyerChange): Promise<SecurityReceipt> {
    const command = { intent: input.intent, targetId: input.targetUserId, expectedRevision: input.expectedRevision, operationId: input.operationId };
    const value = (await this.pool.query<{ value: { operationId?: unknown; outcome?: unknown; recordedAt?: unknown } | null }>(
      "SELECT staff.preview_buyer_act($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value",
      [input.actor, input.proof.proofId, input.proof.binding, command, input.alertIntent])).rows[0]?.value;
    if (value === null || value === undefined || typeof value.operationId !== "string" || value.outcome !== "COMPLETED" || typeof value.recordedAt !== "string") throw refusal();
    return Object.freeze({ operationId: value.operationId, outcome: "COMPLETED", recordedAt: instant(value.recordedAt) });
  }
}
