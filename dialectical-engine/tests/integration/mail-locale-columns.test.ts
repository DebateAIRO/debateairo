import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createEmailBlindIndex, encrypt } from "@debateai/crypto";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Mission email-locale, S01-C05 (SPEC-v3 A-9; R-11, R-09; D-05, D-06, D-44, D-55; V-22 and D-95 for the fill). Migration 0116
 * gives the five queued-mail tables a `mail_locale` column that is NOT NULL with no default, a CHECK on the 37 values, a
 * BEFORE INSERT fill that takes the transaction setting when the INSERT names no value, and a BEFORE INSERT guard that
 * raises MAIL_LOCALE_MISSING for a NULL, an empty or an unknown value; social_flow carries the value nullable, and a LINK
 * flow must carry one. The MFA lease reader is granted to its runtime role only.
 */
const NOTICE_TABLES = [
  "account_erasure_notification_outbox",
  "consumer_security_notice",
  "password_reset_notice",
  "backup_email_notice",
  "mfa_recovery_notice"
] as const;
const MLV = [
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro",
  "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi", "id", "ja", "ko", "vi", "ar", "he", "tr", "en-US", "en-GB"
] as const;
const hash = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;

let db: TestDatabase;
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
}, 300_000);
afterAll(async () => { await db?.stop(); });

it("A-9: the five queued-mail tables have mail_locale NOT NULL with no default, and social_flow has it nullable (C05.1, C05.2)", async () => {
  const rows = (await db.pool.query<{ table_name: string; is_nullable: string; column_default: string | null }>(`
    SELECT table_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = 'identity' AND column_name = 'mail_locale' ORDER BY table_name`)).rows;
  expect(rows).toEqual([
    { table_name: "account_erasure_notification_outbox", is_nullable: "NO", column_default: null },
    { table_name: "backup_email_notice", is_nullable: "NO", column_default: null },
    { table_name: "consumer_security_notice", is_nullable: "NO", column_default: null },
    { table_name: "mfa_recovery_notice", is_nullable: "NO", column_default: null },
    { table_name: "password_reset_notice", is_nullable: "NO", column_default: null },
    { table_name: "social_flow", is_nullable: "YES", column_default: null }
  ]);
});

it("the CHECKs name the 37 values on every table, and a LINK flow must carry one (C05.1, C05.2)", async () => {
  const checks = (await db.pool.query<{ conname: string; def: string }>(`
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conname LIKE '%mail_locale%' AND contype = 'c' ORDER BY conname`)).rows;
  expect(checks.map((row) => row.conname)).toEqual([
    "account_erasure_notification_outbox_mail_locale_check",
    "backup_email_notice_mail_locale_check",
    "consumer_security_notice_mail_locale_check",
    "mfa_recovery_notice_mail_locale_check",
    "password_reset_notice_mail_locale_check",
    "social_flow_mail_locale_check",
    "social_flow_mail_locale_link_check"
  ]);
  for (const row of checks.filter((check) => check.conname.endsWith("_mail_locale_check"))) {
    for (const value of MLV) expect(row.def, `${row.conname} ${value}`).toContain(`'${value}'`);
    expect(row.def, row.conname).not.toContain("'en-us'");
  }
  const link = checks.find((row) => row.conname === "social_flow_mail_locale_link_check")!;
  expect(link.def).toContain("mail_locale IS NOT NULL");
  await expect(db.pool.query(`
    INSERT INTO identity.social_flow(state_hash,cookie_hash,binding_hash,nonce_hash,retention_hash,provider,configuration,purpose,next_path,
      user_id,session_id,session_token_hash,security_epoch,created_at,expires_at,mail_locale)
    VALUES($1,$2,$3,$4,$5,'google',$6,'LINK','/',gen_random_uuid(),gen_random_uuid(),$7,0,clock_timestamp(),clock_timestamp()+interval '1 minute',NULL)`,
  [hash("1"), hash("2"), hash("3"), hash("4"), hash("5"), hash("6"), hash("7")])).rejects.toMatchObject({
    code: "23514", constraint: "social_flow_mail_locale_link_check"
  });
});

it("the guard fires BEFORE the constraints, on each of the five tables, and a NULL, an empty or an unknown value writes nothing (C05.3)", async () => {
  const triggers = (await db.pool.query<{ relname: string; def: string }>(`
    SELECT c.relname, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'identity' AND t.tgname = 'mail_locale_guard' AND NOT t.tgisinternal ORDER BY c.relname`)).rows;
  expect(triggers.map((row) => row.relname)).toEqual([...NOTICE_TABLES].sort());
  for (const row of triggers) expect(row.def).toContain("BEFORE INSERT ON identity." + row.relname + " FOR EACH ROW EXECUTE FUNCTION identity.require_mail_locale()");
  // password_reset_notice has no other BEFORE INSERT trigger: the guard is the first thing that runs, so no parent row is needed.
  const count = async (): Promise<number> => (await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM identity.password_reset_notice")).rows[0]!.n;
  const before = await count();
  const insert = `INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext,mail_locale)
    VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'PROOF','{}'::jsonb,$1)`;
  for (const value of [null, "", "xx", "en-us"]) {
    await expect(db.pool.query(insert, [value]), JSON.stringify(value)).rejects.toMatchObject({
      code: "23514", message: "MAIL_LOCALE_MISSING"
    });
  }
  expect(await count()).toBe(before);
});

it("a transaction that sets the carrier to empty and then writes a notice is refused with MAIL_LOCALE_MISSING (C05.3, the carrier path)", async () => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', '', true)");
    await expect(client.query(`INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext,mail_locale)
      VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'PROOF','{}'::jsonb,current_setting('debateai.mail_locale', true))`))
      .rejects.toThrow("MAIL_LOCALE_MISSING");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});

it("a LOGIN flow started on a connection whose carrier a finished transaction left set stores NULL, not an empty value (C05.6, D-58)", async () => {
  const stateHash = hash("8");
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', 'en', true)");
    await client.query("COMMIT");
    await client.query("BEGIN");
    try {
      await client.query("SELECT identity.begin_social_flow($1::jsonb)", [JSON.stringify({
        purpose: "LOGIN", challengeCapacity: 8192, challengesPerScope: 5, stateHash, cookieHash: hash("9"), bindingHash: hash("a"),
        nonceHash: hash("b"), retentionKey: hash("c"), provider: "google", configuration: hash("d"), next: "/"
      })]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    const row = (await client.query<{ mail_locale: string | null }>("SELECT mail_locale FROM identity.social_flow WHERE state_hash = $1", [stateHash])).rows[0];
    expect(row?.mail_locale).toBeNull();
  } finally {
    client.release();
    await db.pool.query("DELETE FROM identity.social_flow WHERE state_hash = $1", [stateHash]);
  }
});

/** A verified user with an email channel and an active state: the parent the consumer security notice needs (D-95, C05.3). */
const KEY = Buffer.alloc(32, 8);
const envelopeOf = (user: string) => encrypt(KEY, Buffer.from("fill@example.test"), ["identity", "user.email_ciphertext", user, "run:none", user, `user-dek:${user}`, "1"]);
async function verifiedUser(): Promise<{ user: string; channel: string }> {
  const user = randomUUID();
  const channel = randomUUID();
  const envelope = envelopeOf(user);
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,$3,$3,'unchanged-password',$4,'active',clock_timestamp())`, [user, createEmailBlindIndex(KEY, `${user}@example.test`), envelope, `fill-${user}`]);
  await db.pool.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,verified_at)
    VALUES($1,$2,'email',$3,'verified',clock_timestamp())`, [channel, user, envelope]);
  return { user, channel };
}

it("the fill stores the transaction's carrier when the INSERT names no value (C05.3, V-22): a sealed-style writer needs no column", async () => {
  const { user, channel } = await verifiedUser();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', 'ro', true)");
    const stored = await client.query<{ mail_locale: string }>(`INSERT INTO identity.consumer_security_notice(user_id,channel_binding_id,channel_ciphertext,event_kind)
      VALUES($1,$2,$3,'METHOD_CHANGED') RETURNING mail_locale`, [user, channel, envelopeOf(user)]);
    await client.query("COMMIT");
    expect(stored.rows[0]?.mail_locale).toBe("ro");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

it("the fill never overwrites a value the INSERT names (C05.3: the IF in the fill)", async () => {
  const { user, channel } = await verifiedUser();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', 'ro', true)");
    const stored = await client.query<{ mail_locale: string }>(`INSERT INTO identity.consumer_security_notice(user_id,channel_binding_id,channel_ciphertext,event_kind,mail_locale)
      VALUES($1,$2,$3,'CODES_REGENERATED','de') RETURNING mail_locale`, [user, channel, envelopeOf(user)]);
    await client.query("COMMIT");
    expect(stored.rows[0]?.mail_locale).toBe("de");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

it("a writer that names no value with an empty carrier writes nothing: MAIL_LOCALE_MISSING from the fill's NULL (C05.3, the sealed path)", async () => {
  const count = async (): Promise<number> => (await db.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM identity.password_reset_notice")).rows[0]!.n;
  const before = await count();
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', '', true)");
    await expect(client.query(`INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext)
      VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'PROOF','{}'::jsonb)`)).rejects.toMatchObject({ code: "23514", message: "MAIL_LOCALE_MISSING" });
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  expect(await count()).toBe(before);
});

it("the MFA lease reader is granted to its runtime role only, and refuses a lease it does not hold (C05.5, UNVERIFIED item for BUILD)", async () => {
  const grants = (await db.pool.query<{ runtime: boolean; public_granted: boolean }>(`
    SELECT has_function_privilege('debateai_mfa_recovery_runtime','identity.mail_locale_of_mfa_claim(uuid,uuid)','EXECUTE') AS runtime,
      EXISTS(SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid='identity.mail_locale_of_mfa_claim(uuid,uuid)'::regprocedure)) a WHERE a.grantee=0) AS public_granted`)).rows[0]!;
  expect(grants.runtime).toBe(true);
  expect(grants.public_granted).toBe(false);
  await expect(db.pool.query("SELECT identity.mail_locale_of_mfa_claim(gen_random_uuid(), gen_random_uuid())")).rejects.toThrow("MAIL_LOCALE_LEASE_INVALID");
});

it("the erasure schedule reader is granted to the erasure runtime role only, and reads NULL for an erasure with no SCHEDULED row (C11.6, D-108)", async () => {
  const grants = (await db.pool.query<{ runtime: boolean; public_granted: boolean }>(`
    SELECT has_function_privilege('debateai_erasure_runtime','identity.account_erasure_schedule_locale(uuid)','EXECUTE') AS runtime,
      EXISTS(SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid='identity.account_erasure_schedule_locale(uuid)'::regprocedure)) a WHERE a.grantee=0) AS public_granted`)).rows[0]!;
  expect(grants.runtime).toBe(true);
  expect(grants.public_granted).toBe(false);
  const unknown = await db.pool.query<{ locale: string | null }>("SELECT identity.account_erasure_schedule_locale(gen_random_uuid()) AS locale");
  expect(unknown.rows[0]!.locale).toBeNull();
});

it("the per-claim erasure locale reader is granted to the erasure runtime role only, and refuses a claim it does not hold (C18.2, D-120)", async () => {
  const grants = (await db.pool.query<{ runtime: boolean; public_granted: boolean }>(`
    SELECT has_function_privilege('debateai_erasure_runtime','identity.account_erasure_notification_mail_locale(uuid,uuid)','EXECUTE') AS runtime,
      EXISTS(SELECT 1 FROM aclexplode((SELECT p.proacl FROM pg_proc p WHERE p.oid='identity.account_erasure_notification_mail_locale(uuid,uuid)'::regprocedure)) a WHERE a.grantee=0) AS public_granted`)).rows[0]!;
  expect(grants.runtime).toBe(true);
  expect(grants.public_granted).toBe(false);
  await expect(db.pool.query("SELECT identity.account_erasure_notification_mail_locale(gen_random_uuid(), gen_random_uuid())")).rejects.toThrow("MAIL_LOCALE_LEASE_INVALID");
});
