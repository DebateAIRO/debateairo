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
  createPool,
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

  // NV-18 (security audit run 3, 0125): the API's one-minute maintenance pass closes every binding left open past one
  // hour. Last in this describe: the first case counts every request and every audit row in the database.
  it("closes a recovery binding left open past one hour, keeps younger ones, and is callable through the runtime only", async () => {
    const SWEEPER = "identity.expire_stale_account_recovery_bindings(integer)";
    const stale = await insertAccount(`stale-${randomUUID()}`,"active");
    const fresh = await insertAccount(`fresh-${randomUUID()}`,"active");
    const repository = new PostgresRecoveryStartRepository(database.pool,auditContext,users);
    const source = { ip:"203.0.113.45",userAgent:"p2-binding-sweep",requestId:randomUUID() };
    for (const account of [stale,fresh]) {
      await expect(repository.start({ emailBlindIndex:account.emailBlindIndex,source }))
        .resolves.toMatchObject({status:"created"});
    }
    // The binding's update trigger refuses any bound_at change, so the fixture ages it with triggers off.
    const aging = await database.pool.connect();
    try {
      await aging.query("BEGIN");
      await aging.query("SET LOCAL session_replication_role=replica");
      await aging.query(
        "UPDATE identity.account_recovery_binding SET bound_at=bound_at-interval '2 hours' WHERE user_id=$1",
        [stale.userId]
      );
      await aging.query("COMMIT");
    } catch (error) {
      await aging.query("ROLLBACK");
      throw error;
    } finally {
      aging.release();
    }

    await database.pool.query(
      "CREATE ROLE p2_binding_sweeper LOGIN PASSWORD 'sweeper-test-only' IN ROLE debateai_runtime"
    );
    const url = new URL(database.connectionString);
    url.username = "p2_binding_sweeper";
    url.password = "sweeper-test-only";
    const sweeper = createPool(url.toString());
    try {
      const runtimeRepository = new PostgresRecoveryStartRepository(sweeper,auditContext,users);
      await expect(runtimeRepository.expireStaleBindings(100,10)).resolves.toBe(1);
      await expect(runtimeRepository.expireStaleBindings(100,10)).resolves.toBe(0);
    } finally {
      await sweeper.end();
    }

    const bindings = await database.pool.query<{ user_id: string; closed: boolean; latest: string }>(`
      SELECT b.user_id,b.closed_at IS NOT NULL AS closed,
        (SELECT e.state FROM identity.account_recovery_state_event e
          WHERE e.recovery_request_id=b.recovery_request_id ORDER BY e.event_sequence DESC LIMIT 1) AS latest
      FROM identity.account_recovery_binding b WHERE b.user_id=ANY($1::uuid[]) ORDER BY b.user_id
    `,[[stale.userId,fresh.userId]]);
    expect(bindings.rows.find((row) => row.user_id===stale.userId)).toEqual({
      user_id:stale.userId,closed:true,latest:"EXPIRED"
    });
    expect(bindings.rows.find((row) => row.user_id===fresh.userId)).toEqual({
      user_id:fresh.userId,closed:false,latest:"REQUESTED"
    });
    // The stale account's one live slot is free again; the fresh one's is still held.
    expect((await database.pool.query(
      "SELECT count(*)::int AS n FROM identity.prepare_account_recovery_start($1)",[stale.emailBlindIndex]
    )).rows[0].n).toBe(1);
    expect((await database.pool.query(
      "SELECT count(*)::int AS n FROM identity.prepare_account_recovery_start($1)",[fresh.emailBlindIndex]
    )).rows[0].n).toBe(0);

    for (const batch of [0,1001]) {
      await expect(database.pool.query(`SELECT identity.expire_stale_account_recovery_bindings($1)`,[batch]))
        .rejects.toMatchObject({ code:"22023",message:"RECOVERY_BINDING_BATCH_INVALID" });
    }
    expect((await database.pool.query(
      "SELECT prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure",[SWEEPER]
    )).rows[0]).toEqual({ prosecdef:true,proconfig:["search_path=pg_catalog, pg_temp"] });
    // The explicit ACL: the owner and debateai_runtime EXECUTE (not grantable), and no PUBLIC row.
    const acl = await database.pool.query<{ grantee: string; privilege_type: string; is_grantable: boolean }>(`
      SELECT coalesce(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable
      FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      LEFT JOIN pg_roles r ON r.oid=nullif(a.grantee,0)
      WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1,2
    `,[SWEEPER]);
    expect(acl.rows).toEqual([{ grantee:"debateai_runtime",privilege_type:"EXECUTE",is_grantable:false }]);
    const execute = await database.pool.query<Record<string,boolean>>(`
      SELECT
        has_function_privilege('debateai_runtime',$1,'EXECUTE') AS runtime,
        has_function_privilege('debateai_authorization_runtime',$1,'EXECUTE') AS auth,
        has_function_privilege('debateai_billing_runtime',$1,'EXECUTE') AS billing,
        has_function_privilege('debateai_erasure_runtime',$1,'EXECUTE') AS erasure
    `,[SWEEPER]);
    expect(execute.rows[0]).toEqual({
      runtime:true,
      // 0039 intentionally makes authorization a child of ordinary runtime (0093 does the same for billing).
      auth:true,billing:true,erasure:false
    });
  });
});
