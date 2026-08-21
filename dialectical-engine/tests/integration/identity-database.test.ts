import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { decrypt, encrypt, generateDek } from "../../packages/crypto/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

function envelopeFor(userId: string, column: string, plaintext: string) {
  const key = generateDek();
  const aad = [
    "identity", "user", userId, "run:none", userId,
    "identity-confidentiality:test", "1"
  ] as const;
  return { key, aad, envelope: encrypt(key, Buffer.from(plaintext, "utf8"), aad), column };
}

async function insertUser(label: string) {
  const userId = randomUUID();
  const email = `${label}@example.test`;
  const encrypted = envelopeFor(userId, "email_ciphertext", email);
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,$5,$6,'pending_verification',now(),now())
  `, [
    userId,
    createHmac("sha256", Buffer.alloc(32, 0x41)).update(email).digest(),
    JSON.stringify(encrypted.envelope),
    JSON.stringify(encrypted.envelope),
    "$argon2id$v=19$m=65536,t=3,p=1$fixture",
    `pseudonym-${label}`
  ]);
  return { userId, email, ...encrypted };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("S2 identity schema on real PostgreSQL", () => {
  it("creates the identity tables with the required contact and audit column types", async () => {
    const tables = await database.pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='identity' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "audit_event", "channel_binding", "mfa_factor", "recovery_code", "session", "user",
      "verification_token_credential"
    ]);

    const columns = await database.pool.query<{ table_name: string; column_name: string; data_type: string }>(`
      SELECT table_name,column_name,data_type FROM information_schema.columns
      WHERE table_schema='identity'
        AND (table_name,column_name) IN (
          ('user','user_id'),('user','email_blind_index'),('user','email_ciphertext'),
          ('user','recovery_email_ciphertext'),('user','phone_ciphertext'),
          ('audit_event','prev_hash'),('audit_event','this_hash'),
          ('audit_event','actor_ciphertext'),('audit_event','occurred_at'),
          ('audit_event','source_context'),('audit_event','success')
        )
      ORDER BY table_name,column_name
    `);
    expect(columns.rows).toEqual([
      { table_name: "audit_event", column_name: "actor_ciphertext", data_type: "jsonb" },
      { table_name: "audit_event", column_name: "occurred_at", data_type: "timestamp with time zone" },
      { table_name: "audit_event", column_name: "prev_hash", data_type: "bytea" },
      { table_name: "audit_event", column_name: "source_context", data_type: "jsonb" },
      { table_name: "audit_event", column_name: "success", data_type: "boolean" },
      { table_name: "audit_event", column_name: "this_hash", data_type: "bytea" },
      { table_name: "user", column_name: "email_blind_index", data_type: "bytea" },
      { table_name: "user", column_name: "email_ciphertext", data_type: "jsonb" },
      { table_name: "user", column_name: "phone_ciphertext", data_type: "jsonb" },
      { table_name: "user", column_name: "recovery_email_ciphertext", data_type: "jsonb" },
      { table_name: "user", column_name: "user_id", data_type: "uuid" }
    ]);
  });

  it("allows update and delete on all five mutable identity tables", async () => {
    const mutableUser = await insertUser("mutable-user");
    await expect(database.pool.query(
      `UPDATE identity."user" SET state='active' WHERE user_id=$1`, [mutableUser.userId]
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(database.pool.query(
      `DELETE FROM identity."user" WHERE user_id=$1`, [mutableUser.userId]
    )).resolves.toMatchObject({ rowCount: 1 });

    const mfaUser = await insertUser("mutable-mfa");
    const mfa = await database.pool.query<{ mfa_factor_id: string }>(`
      INSERT INTO identity.mfa_factor (
        user_id,factor_type,secret_ciphertext,credential_id,public_key,state,created_at
      ) VALUES ($1,'totp',$2::jsonb,NULL,NULL,'pending',now()) RETURNING mfa_factor_id
    `, [mfaUser.userId, JSON.stringify(mfaUser.envelope)]);
    await expect(database.pool.query(
      `UPDATE identity.mfa_factor SET state='active',verified_at=now() WHERE mfa_factor_id=$1`,
      [mfa.rows[0]!.mfa_factor_id]
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(database.pool.query(
      `DELETE FROM identity.mfa_factor WHERE mfa_factor_id=$1`, [mfa.rows[0]!.mfa_factor_id]
    )).resolves.toMatchObject({ rowCount: 1 });

    const recoveryUser = await insertUser("mutable-recovery");
    const recovery = await database.pool.query<{ recovery_code_id: string }>(`
      INSERT INTO identity.recovery_code (user_id,code_hash,created_at)
      VALUES ($1,'$argon2id$fixture',now()) RETURNING recovery_code_id
    `, [recoveryUser.userId]);
    await expect(database.pool.query(
      `UPDATE identity.recovery_code SET consumed_at=now() WHERE recovery_code_id=$1`,
      [recovery.rows[0]!.recovery_code_id]
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(database.pool.query(
      `DELETE FROM identity.recovery_code WHERE recovery_code_id=$1`, [recovery.rows[0]!.recovery_code_id]
    )).resolves.toMatchObject({ rowCount: 1 });

    const channelUser = await insertUser("mutable-channel");
    const channel = await database.pool.query<{ channel_binding_id: string }>(`
      INSERT INTO identity.channel_binding (
        user_id,channel_type,address_ciphertext,state,created_at
      ) VALUES ($1,'recovery_email',$2::jsonb,'pending_verification',now())
      RETURNING channel_binding_id
    `, [channelUser.userId, JSON.stringify(channelUser.envelope)]);
    await expect(database.pool.query(
      `UPDATE identity.channel_binding SET state='verified',verified_at=now()
       WHERE channel_binding_id=$1`, [channel.rows[0]!.channel_binding_id]
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(database.pool.query(
      `DELETE FROM identity.channel_binding WHERE channel_binding_id=$1`, [channel.rows[0]!.channel_binding_id]
    )).resolves.toMatchObject({ rowCount: 1 });

    const sessionUser = await insertUser("mutable-session");
    const session = await database.pool.query<{ session_id: string }>(`
      INSERT INTO identity.session (
        user_id,token_hash,binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at
      ) VALUES ($1,$2,'{}'::jsonb,now(),now(),now()+interval '14 days',now()+interval '90 days')
      RETURNING session_id
    `, [sessionUser.userId, `sha256:${randomUUID()}`]);
    await expect(database.pool.query(
      `UPDATE identity.session SET revoked_at=now() WHERE session_id=$1`, [session.rows[0]!.session_id]
    )).resolves.toMatchObject({ rowCount: 1 });
    await expect(database.pool.query(
      `DELETE FROM identity.session WHERE session_id=$1`, [session.rows[0]!.session_id]
    )).resolves.toMatchObject({ rowCount: 1 });
  });

  it("rejects update and delete of append-only audit events with SQLSTATE 55000", async () => {
    const auditId = randomUUID();
    const auditToken = randomUUID();
    await database.pool.query(`
      INSERT INTO identity.audit_event (
        audit_id,prev_hash,this_hash,actor_ciphertext,actor_key_ref,event_type,
        target_type,target_id,occurred_at,source_context,decision,success,justification
      ) VALUES ($1,NULL,$2,NULL,$3,'identity.login','identity.user',$3,
        now(),'{}'::jsonb,'ALLOW',true,NULL)
    `, [auditId, Buffer.alloc(32, 0x7a), auditToken]);

    await expect(database.pool.query(
      `UPDATE identity.audit_event SET success=false WHERE audit_id=$1`, [auditId]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query(
      `DELETE FROM identity.audit_event WHERE audit_id=$1`, [auditId]
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("stores no plaintext email while preserving AEAD round-trip capability", async () => {
    const inserted = await insertUser("confidential-email");
    const row = await database.pool.query<{ email_ciphertext: ReturnType<typeof encrypt> }>(`
      SELECT email_ciphertext FROM identity."user" WHERE user_id=$1
    `, [inserted.userId]);
    const plaintextContactColumns = await database.pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='identity' AND table_name='user'
        AND column_name IN ('email','recovery_email','phone')
    `);

    expect(plaintextContactColumns.rows).toEqual([]);
    expect(JSON.stringify(row.rows[0]!.email_ciphertext)).not.toContain(inserted.email);
    expect(decrypt(inserted.key, row.rows[0]!.email_ciphertext, inserted.aad).toString("utf8"))
      .toBe(inserted.email);
  });
});
