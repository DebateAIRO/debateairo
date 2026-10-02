import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * The smallest identity account the account-erasure SQL accepts, copied from the proven fixture in
 * tests/integration/s10-t9-account-erasure-races.test.ts:78-161 (user, both verified channels, one live
 * session, a due erasure request). Billing tests use it to prove billing rows survive erasure (spec §2.2 rule 5),
 * and P1a's retention purge uses it to tell a living account (identity row present) from an erased one.
 */
export type BillingTestAccount = Readonly<{
  userId: string; ownerRef: string; sessionId: string; erasureId: string;
}>;

const opaqueHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;
const sourceContext = JSON.stringify({
  ipArgon2id: `argon2id-audit:v1:${"1".repeat(64)}`,
  userAgentArgon2id: `argon2id-audit:v1:${"2".repeat(64)}`
});

export async function createBillingTestAccount(pool: Pool, label: string): Promise<BillingTestAccount> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const erasureId = randomUUID();
  const passwordHash = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
  `, [userId, randomBytes(32), passwordHash, `billing-${label}-${randomUUID()}`, randomUUID(), ownerRef]);
  await pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,
      verified_at,verification_token_hash,verification_expires_at,
      verification_last_sent_at,verification_consumed_at,delivery_status,delivery_error
    ) VALUES
      ($1,$3,'email','{}','verified',clock_timestamp(),clock_timestamp(),$4,
        clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',
        clock_timestamp(),'sent',NULL),
      ($2,$3,'recovery_email','{}','verified',clock_timestamp(),clock_timestamp(),
        NULL,NULL,NULL,NULL,'not_requested',NULL)
  `, [randomUUID(), randomUUID(), userId, opaqueHash()]);
  await pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,jsonb_build_object('user_agent_hash',$5::text),
      clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp(),NULL)
  `, [sessionId, userId, opaqueHash(), opaqueHash(), opaqueHash()]);
  await pool.query(`
    INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at)
    VALUES ($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')
  `, [erasureId, userId]);
  return Object.freeze({ userId, ownerRef, sessionId, erasureId });
}

/** Prepare → acknowledge the completion mail → finalize as the erasure principal. Returns the outcome. */
export async function eraseBillingTestAccount(pool: Pool, account: BillingTestAccount): Promise<string> {
  await pool.query("SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}','{}')", [account.erasureId]);
  await pool.query(`
    UPDATE identity.account_erasure_notification_outbox
    SET claim_token=gen_random_uuid(),claim_expires_at=NULL,acknowledged_at=clock_timestamp(),last_error_code=NULL
    WHERE user_id=$1 AND acknowledged_at IS NULL
  `, [account.userId]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE debateai_erasure_runtime");
    const outcome = (await client.query<{ outcome: string }>(`
      SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),1,0,1,0) AS outcome
    `, [account.erasureId])).rows[0]!.outcome;
    await client.query("COMMIT");
    return outcome;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export { sourceContext as billingTestSourceContext };
