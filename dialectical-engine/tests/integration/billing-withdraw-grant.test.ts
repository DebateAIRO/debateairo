import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingRepository, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const opaqueHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;
const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function account(): Promise<Readonly<{
  userId: string; ownerRef: string; sessionId: string; sessionTokenHash: string; factorId: string;
}>> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const sessionTokenHash = opaqueHash();
  const factorId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32), PASSWORD_HASH, `p12a-${randomUUID()}`, randomUUID(), ownerRef]);
  // A notification channel, as identity.schedule_account_erasure requires (0040:4991-5000), so the erasure test
  // below is refused by the grant's purpose and by nothing else.
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,
      verified_at,verification_token_hash,verification_expires_at,
      verification_last_sent_at,verification_consumed_at,delivery_status,delivery_error
    ) VALUES ($1,$2,'recovery_email','{}','verified',clock_timestamp(),clock_timestamp(),
      NULL,NULL,NULL,NULL,'not_requested',NULL)
  `, [randomUUID(), userId]);
  await database.pool.query(`
    INSERT INTO identity.mfa_factor(
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,revoked_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}',NULL,NULL,'active',clock_timestamp(),clock_timestamp(),NULL,10)
  `, [factorId, userId]);
  await database.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,jsonb_build_object('user_agent_hash',$5::text),clock_timestamp(),
      clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp(),NULL)
  `, [sessionId, userId, sessionTokenHash, opaqueHash(), opaqueHash()]);
  return Object.freeze({ userId, ownerRef, sessionId, sessionTokenHash, factorId });
}

/** A grant issued `issuedSecondsAgo` ago that expires `expiresInSeconds` from now (negative = already stale). */
async function insertGrant(input: Readonly<{
  userId: string; sessionId: string; action: string; tokenHash: string;
  issuedSecondsAgo?: number; expiresInSeconds?: number;
}>): Promise<void> {
  await database.pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
    ) VALUES ($1,$2,$3,$4,$5,NULL,$4,clock_timestamp()-make_interval(secs => $6),
      clock_timestamp()+make_interval(secs => $7))
  `, [randomUUID(), input.tokenHash, input.sessionId, input.userId, input.action,
    input.issuedSecondsAgo ?? 1, input.expiresInSeconds ?? 120]);
}

async function consumeAsRuntime(values: readonly unknown[]): Promise<boolean> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_runtime");
    const result = await client.query<{ ok: boolean }>(
      "SELECT billing.consume_withdrawal_grant($1,$2,$3,$4) AS ok", [...values]
    );
    await client.query("COMMIT");
    return result.rows[0]?.ok === true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

describe("P12a the WITHDRAW_SUBSCRIPTION grant on real PostgreSQL", () => {
  it("is minted by the step-up rotation, bound to the account and to no run", async () => {
    const who = await account();
    const grantId = randomUUID();
    const grantHash = opaqueHash();
    const rotated = await database.pool.query<{ actor: string | null }>(`
      SELECT identity.rotate_session_after_step_up(
        $1,$2,$3,$4,11,$5,$6,$7,$8,$9::jsonb,clock_timestamp()+interval '1 hour',
        $10,$11,'WITHDRAW_SUBSCRIPTION',NULL,clock_timestamp()+interval '2 minutes'
      ) AS actor
    `, [who.userId, who.ownerRef, PASSWORD_HASH, who.factorId, who.sessionId, who.sessionTokenHash,
      opaqueHash(), opaqueHash(), JSON.stringify({ user_agent_hash: opaqueHash() }), grantId, grantHash]);
    expect(rotated.rows[0]?.actor).not.toBeNull();
    const grant = await database.pool.query<{ action: string; target_run_id: string | null; target_account_id: string }>(
      "SELECT action,target_run_id,target_account_id FROM identity.step_up_grant WHERE step_up_grant_id=$1", [grantId]
    );
    expect(grant.rows[0]).toEqual({ action: "WITHDRAW_SUBSCRIPTION", target_run_id: null, target_account_id: who.userId });
  });

  it("refuses the purpose with a run target or without the account, by the CHECK", async () => {
    const who = await account();
    for (const [targetRunId, targetAccountId] of [[randomUUID(), who.userId], [null, null]] as const) {
      await expect(database.pool.query(`
        INSERT INTO identity.step_up_grant(
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
        ) VALUES ($1,$2,$3,$4,'WITHDRAW_SUBSCRIPTION',$5,$6,clock_timestamp(),clock_timestamp()+interval '2 minutes')
      `, [randomUUID(), opaqueHash(), who.sessionId, who.userId, targetRunId, targetAccountId]))
        .rejects.toMatchObject({ code: "23514" });
    }
  });

  it("is consumed once, as the API's own role, and never for another purpose, session or a stale grant", async () => {
    const who = await account();
    const tokenHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "WITHDRAW_SUBSCRIPTION", tokenHash });
    const args = [who.userId, who.ownerRef, who.sessionId, tokenHash];
    expect(await consumeAsRuntime(args)).toBe(true);
    expect(await consumeAsRuntime(args)).toBe(false);

    const deleteHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "DELETE_ACCOUNT", tokenHash: deleteHash });
    expect(await consumeAsRuntime([who.userId, who.ownerRef, who.sessionId, deleteHash])).toBe(false);

    const other = await account();
    const crossHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "WITHDRAW_SUBSCRIPTION", tokenHash: crossHash });
    expect(await consumeAsRuntime([who.userId, who.ownerRef, other.sessionId, crossHash])).toBe(false);
    expect(await consumeAsRuntime([who.userId, other.ownerRef, who.sessionId, crossHash])).toBe(false);

    const staleHash = opaqueHash();
    // Issued ten minutes ago, expired five minutes ago (the table's CHECK wants expires_at > issued_at).
    await insertGrant({
      userId: who.userId, sessionId: who.sessionId, action: "WITHDRAW_SUBSCRIPTION", tokenHash: staleHash,
      issuedSecondsAgo: 600, expiresInSeconds: -300
    });
    expect(await consumeAsRuntime([who.userId, who.ownerRef, who.sessionId, staleHash])).toBe(false);
  });

  it("is never consumed for an account the age gate froze (0077's age_frozen, R3-2)", async () => {
    const who = await account();
    const tokenHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "WITHDRAW_SUBSCRIPTION", tokenHash });
    // The state change identity.confirm_account_age_with_audit makes on a refusal, without its session revocation,
    // so that the account state is the only thing that can refuse here.
    await database.pool.query(`UPDATE identity."user" SET state='age_frozen' WHERE user_id=$1`, [who.userId]);
    expect(await consumeAsRuntime([who.userId, who.ownerRef, who.sessionId, tokenHash])).toBe(false);
    // The positive control: the same grant, the account active again, is spent.
    await database.pool.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`, [who.userId]);
    expect(await consumeAsRuntime([who.userId, who.ownerRef, who.sessionId, tokenHash])).toBe(true);
  });

  it("is reachable through the repository inside a billing transaction", async () => {
    const who = await account();
    const tokenHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "WITHDRAW_SUBSCRIPTION", tokenHash });
    const billing = new BillingRepository(database.pool);
    const input = { userId: who.userId, ownerRef: who.ownerRef, sessionId: who.sessionId, grantTokenHash: tokenHash };
    expect(await billing.withTransaction((client) => billing.consumeWithdrawalGrant(client, input))).toBe(true);
    expect(await billing.withTransaction((client) => billing.consumeWithdrawalGrant(client, input))).toBe(false);
  });

  it("never schedules an account erasure with a WITHDRAW_SUBSCRIPTION grant, while a DELETE_ACCOUNT grant does", async () => {
    // Both purposes are account-scoped now; only 0040:5015 (`action='DELETE_ACCOUNT'`) tells them apart.
    const who = await account();
    const schedule = (tokenHash: string) => database.pool.query<{ erasure_id: string }>(
      "SELECT erasure_id FROM identity.schedule_account_erasure($1,$2,$3,$4)",
      [who.userId, who.ownerRef, who.sessionId, tokenHash]
    );
    const requests = async () => Number((await database.pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM identity.account_erasure_request WHERE user_id=$1", [who.userId]
    )).rows[0]!.n);
    const withdrawHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "WITHDRAW_SUBSCRIPTION", tokenHash: withdrawHash });
    expect((await schedule(withdrawHash)).rows).toEqual([]);
    expect(await requests()).toBe(0);
    // The grant is still unspent: the erasure function never touched it.
    expect(await consumeAsRuntime([who.userId, who.ownerRef, who.sessionId, withdrawHash])).toBe(true);
    // The positive control: the same account, the same session, the deletion purpose.
    const deleteHash = opaqueHash();
    await insertGrant({ userId: who.userId, sessionId: who.sessionId, action: "DELETE_ACCOUNT", tokenHash: deleteHash });
    expect((await schedule(deleteHash)).rows).toHaveLength(1);
    expect(await requests()).toBe(1);
  });

  it("keeps the owner's withdrawal settlement append-only, once per withdrawal, and lets only the purge take it", async () => {
    // A subscription withdrawn more than ten full calendar years ago with no charge left: P1a's purge ages it out.
    const subscriptionId = randomUUID();
    const ownerRef = randomUUID();
    const withdrawnEventId = randomUUID();
    const long = new Date("2014-03-01T00:00:00.000Z");
    const events: ReadonlyArray<readonly [string, string, Date, Record<string, unknown>]> = [
      [randomUUID(), "CREATED", long, { xmoney_environment: "stage" }],
      [withdrawnEventId, "WITHDRAWN", new Date(long.getTime() + 86_400_000),
        { refund_micros: null, refund_by_owner: true, source: "OWNER", withdrew_at: long.toISOString() }]
    ];
    for (const [eventId, kind, at, data] of events) {
      await database.pool.query(`
        INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
        VALUES ($1, $2, $3, $4, $5, 'PLUS', $6::jsonb)
      `, [eventId, subscriptionId, ownerRef, kind, at, JSON.stringify(data)]);
    }
    const settle = (micros: number) => database.pool.query(`
      INSERT INTO billing.withdrawal_owner_settlement
        (subscription_id, withdrawn_event_id, owner_ref, dashboard_refund_micros, settled_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [subscriptionId, withdrawnEventId, ownerRef, micros, new Date(long.getTime() + 2 * 86_400_000)]);
    await expect(settle(-1)).rejects.toMatchObject({ code: "23514" });
    await settle(5_000_000);
    // One settlement per withdrawal.
    await expect(settle(1_000_000)).rejects.toMatchObject({ code: "23505" });
    const privileges = (await database.pool.query<{ can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }>(`
      SELECT has_table_privilege('debateai_runtime', 'billing.withdrawal_owner_settlement', 'SELECT') AS can_select,
        has_table_privilege('debateai_runtime', 'billing.withdrawal_owner_settlement', 'INSERT') AS can_insert,
        has_table_privilege('debateai_runtime', 'billing.withdrawal_owner_settlement', 'UPDATE') AS can_update,
        has_table_privilege('debateai_runtime', 'billing.withdrawal_owner_settlement', 'DELETE') AS can_delete
    `)).rows[0];
    expect(privileges).toEqual({ can_select: true, can_insert: true, can_update: false, can_delete: false });
    // Append-only even for the owner of the database.
    await expect(database.pool.query(
      "UPDATE billing.withdrawal_owner_settlement SET dashboard_refund_micros = 0 WHERE subscription_id = $1", [subscriptionId]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query(
      "DELETE FROM billing.withdrawal_owner_settlement WHERE subscription_id = $1", [subscriptionId]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query("TRUNCATE billing.withdrawal_owner_settlement")).rejects.toMatchObject({ code: "55000" });
    // A15: the purge takes the subscription's events, and the settlement goes with its WITHDRAWN event.
    await database.pool.query("SELECT billing.purge_expired_records(clock_timestamp()) AS purged");
    const left = async (table: string) => Number((await database.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE subscription_id = $1`, [subscriptionId]
    )).rows[0]!.n);
    expect(await left("billing.subscription_event")).toBe(0);
    expect(await left("billing.withdrawal_owner_settlement")).toBe(0);
  });
});
