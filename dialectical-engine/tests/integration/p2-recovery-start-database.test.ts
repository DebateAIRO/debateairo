import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEmailBlindIndex,
  decrypt,
  encrypt,
  generateDek,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "@debateai/crypto";
import {
  accountRecoveryChannelRefsAad,
  migrate,
  PostgresRecoveryStartRepository
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
const blindIndexKey = Buffer.alloc(32, 0x72);
const userKeys = new Map<string, Buffer>();
const loadedUsers: string[] = [];

const users: ReadableUserDekStore = Object.freeze({
  async store(userId: string, dek: Uint8Array) { userKeys.set(userId, Buffer.from(dek)); },
  async load(userId: string) {
    loadedUsers.push(userId);
    const key = userKeys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(key);
  },
  async exists(userId: string) { return userKeys.has(userId); },
  async destroy(userId: string) {
    const key = userKeys.get(userId);
    if (key === undefined) return "ALREADY_ABSENT";
    key.fill(0);
    userKeys.delete(userId);
    return "DESTROYED";
  }
});

const auditContext = Object.freeze({
  async hashSourceIp() { return "1".repeat(64); },
  async hashUserAgent() { return "2".repeat(64); }
}) as unknown as AuditContextHasher;

function fixtureEnvelope(userId: string) {
  const key = Buffer.alloc(32, 0x44);
  try {
    return encrypt(key,Buffer.from("fixture@example.test"),[
      "identity","user.email_ciphertext",userId,"run:none",userId,
      `user-dek:${userId}`,"1"
    ]);
  } finally {
    key.fill(0);
  }
}

async function insertAccount(label: string, state: "active" | "suspended") {
  const userId = randomUUID();
  const email = `${label}@example.test`;
  const emailBlindIndex = createEmailBlindIndex(blindIndexKey,email);
  const envelope = fixtureEnvelope(userId);
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,$3::jsonb,NULL,'hash',$4,'active',clock_timestamp(),clock_timestamp())
  `,[userId,emailBlindIndex,JSON.stringify(envelope),`p2-${label}`]);
  const channelIds = [randomUUID(),randomUUID()];
  await database.pool.query(`
    INSERT INTO identity.channel_binding(
      channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,verified_at
    ) VALUES
      ($1,$3,'email',$4::jsonb,'verified',clock_timestamp(),clock_timestamp()),
      ($2,$3,'recovery_email',$4::jsonb,'verified',clock_timestamp(),clock_timestamp())
  `,[channelIds[0],channelIds[1],userId,JSON.stringify(envelope)]);
  if (state === "suspended") {
    await database.pool.query(
      `UPDATE identity."user" SET state='suspended' WHERE user_id=$1`,
      [userId]
    );
  }
  const dek = generateDek();
  await users.store(userId,dek);
  dek.fill(0);
  return { userId,email,emailBlindIndex,channelIds:channelIds.sort() };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
},120_000);

afterAll(async () => {
  for (const key of userKeys.values()) key.fill(0);
  userKeys.clear();
  await database?.stop();
});

describe("P2-04 recovery start on real PostgreSQL", () => {
  it("creates one lawful opaque request, audits every arm, and creates no absent/suspended work", async () => {
    const active = await insertAccount(`active-${randomUUID()}`,"active");
    const suspended = await insertAccount(`suspended-${randomUUID()}`,"suspended");
    const repository = new PostgresRecoveryStartRepository(database.pool,auditContext,users);
    const source = { ip:"203.0.113.44",userAgent:"p2-recovery",requestId:randomUUID() };

    await expect(repository.start({ emailBlindIndex:active.emailBlindIndex,source }))
      .resolves.toMatchObject({status:"created",publicHandle:expect.any(String)});
    await expect(repository.start({ emailBlindIndex:active.emailBlindIndex,source }))
      .resolves.toEqual({status:"not_created"});
    await expect(repository.start({
      emailBlindIndex:createEmailBlindIndex(blindIndexKey,"absent@example.test"),source
    })).resolves.toEqual({status:"not_created"});
    await expect(repository.start({ emailBlindIndex:suspended.emailBlindIndex,source }))
      .resolves.toEqual({status:"not_created"});

    const persisted = await database.pool.query<{
      recovery_request_id: string;
      public_handle: string;
      user_id: string;
      channel_refs_ciphertext: { v: 1; keyId: string; nonce: string; ct: string; tag: string };
      state: string;
    }>(`
      SELECT request.recovery_request_id,request.public_handle,binding.user_id,
        request.channel_refs_ciphertext,event.state
      FROM identity.account_recovery_request AS request
      JOIN identity.account_recovery_binding AS binding USING (recovery_request_id)
      JOIN identity.account_recovery_state_event AS event USING (recovery_request_id)
    `);
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({ user_id:active.userId,state:"REQUESTED" });
    expect(persisted.rows[0]!.public_handle).not.toBe(persisted.rows[0]!.recovery_request_id);
    const key = await users.load(active.userId);
    try {
      const decoded = JSON.parse(decrypt(
        key,persisted.rows[0]!.channel_refs_ciphertext,
        accountRecoveryChannelRefsAad(active.userId)
      ).toString("utf8")) as { v: number; channelBindingIds: string[] };
      expect(decoded).toEqual({ v:1,channelBindingIds:active.channelIds });
    } finally {
      key.fill(0);
    }

    const audit = await database.pool.query<{
      decision: string; success: boolean; justification: string; target_id: string;
      source_context: Record<string,string>;
    }>(`
      SELECT decision,success,justification,target_id,source_context
      FROM identity.audit_event
      WHERE event_type='identity.recovery.started'
      ORDER BY occurred_at,audit_id
    `);
    expect(audit.rows).toHaveLength(4);
    expect(audit.rows.filter((row) => row.success)).toHaveLength(1);
    expect(audit.rows.filter((row) => !row.success)).toHaveLength(3);
    for (const row of audit.rows) {
      expect(row.decision).toBe(row.success ? "ALLOW" : "DENY");
      expect(row.justification).toBe(row.success
        ? "RECOVERY_REQUEST_CREATED" : "RECOVERY_REQUEST_NOT_CREATED");
      expect(row.target_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.target_id).not.toContain("@");
      expect(row.source_context).toEqual({
        ipArgon2id:`argon2id-audit:v1:${"1".repeat(64)}`,
        userAgentArgon2id:`argon2id-audit:v1:${"2".repeat(64)}`
      });
    }
    expect(loadedUsers.filter((userId) => userId===active.userId)).toHaveLength(2);
    expect(loadedUsers).not.toContain(suspended.userId);
  });

  it("replays safely and keeps table DML private while runtime gets only exact capabilities", async () => {
    const migration = await readFile(
      new URL("../../migrations/0045_account_recovery_start.sql",import.meta.url),"utf8"
    );
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    const privileges = await database.pool.query<{
      runtime_prepare: boolean; runtime_start: boolean; runtime_select: boolean;
      auth_prepare: boolean; auth_start: boolean; erasure_prepare: boolean;
      erasure_start: boolean;
    }>(`
      SELECT
        has_function_privilege('debateai_runtime',
          'identity.prepare_account_recovery_start(bytea)','EXECUTE') AS runtime_prepare,
        has_function_privilege('debateai_runtime',
          'identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)','EXECUTE') AS runtime_start,
        has_table_privilege('debateai_runtime',
          'identity.account_recovery_binding','SELECT') AS runtime_select,
        has_function_privilege('debateai_authorization_runtime',
          'identity.prepare_account_recovery_start(bytea)','EXECUTE') AS auth_prepare,
        has_function_privilege('debateai_authorization_runtime',
          'identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)','EXECUTE') AS auth_start,
        has_function_privilege('debateai_erasure_runtime',
          'identity.prepare_account_recovery_start(bytea)','EXECUTE') AS erasure_prepare,
        has_function_privilege('debateai_erasure_runtime',
          'identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)','EXECUTE') AS erasure_start
    `);
    expect(privileges.rows[0]).toEqual({
      runtime_prepare:true,runtime_start:true,runtime_select:false,
      // 0039 intentionally makes authorization a child of ordinary runtime.
      auth_prepare:true,auth_start:true,erasure_prepare:false,erasure_start:false
    });
  });
});
