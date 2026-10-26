import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { PostgresDataExportRepository } from "@debateai/db";
import { hashToken } from "@debateai/crypto";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { seedSupportFixture } from "../support/supportSeed.js";

const tables = ["session", "session_key", "message", "abuse_event", '"case"', "case_key", "case_event",
  "case_message", "rating", "tool_call", "admission_event", "relay_call", "relay_waiter", "relay_waiter_event"];
const deletion = ["rating", "case_message", "case_event", "case_key", '"case"', "tool_call", "abuse_event",
  "message", "session_key", "admission_event", "session", "shred_audit", "relay_waiter_event", "relay_waiter", "relay_call"];
const guarded = `SELECT c.relname relation,t.tgname name,t.tgfoid::regprocedure function_name,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='support' AND NOT t.tgisinternal AND t.tgname IN
  ('reject_mutation','reject_delete','reject_truncate','support_shred_row_guard') ORDER BY c.relname,t.tgname`;

async function prepared(check: (db: TestDatabase, before: readonly unknown[], ownerRef: string, userId: string) => Promise<void>) {
  const db = await startTestDatabase();
  try {
    await migrate(db.pool);
    const before = (await db.pool.query(guarded)).rows;
    const userId = randomUUID();
    const owner = (await db.pool.query(`INSERT INTO identity."user"
      (user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','fixture-password',$3,'active',clock_timestamp()) RETURNING owner_ref`,
    [userId, createHash("sha256").update(userId).digest(), userId])).rows[0]!.owner_ref as string;
    await db.pool.query(`GRANT INSERT ON ${tables.map((table) => `support.${table}`).join(", ")} TO debateai_support`);
    await seedSupportFixture(db.pool, { ownerRef: owner });
    await db.pool.query("DELETE FROM public.debateai_schema_migration_step WHERE source_name='0128_support_answer_scope.sql'");
    await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name='0128_support_answer_scope.sql'");
    await migrate(db.pool);
    await check(db, before, owner, userId);
  } finally {
    await db.stop();
  }
}

const timeout = 300_000;
describe("0128 destroys support records while retaining guards", () => {
  it("commits with zero rows in all fifteen tables", async () => prepared(async (db) => {
    for (const table of deletion) expect((await db.pool.query(`SELECT count(*)::int count FROM support.${table}`)).rows[0]!.count, table).toBe(0);
  }), timeout);

  it("restores every guard with its original function, timing and enabled state", async () => prepared(async (db, before) => {
    expect((await db.pool.query(guarded)).rows).toEqual(before);
    const rows = (await db.pool.query(guarded)).rows;
    for (const [name, count] of [["reject_mutation", 9], ["reject_delete", 6], ["reject_truncate", 17], ["support_shred_row_guard", 5]] as const)
      expect(rows.filter((row) => row.name === name && row.tgenabled === "O"), name).toHaveLength(count);
  }), timeout);

  it.each(["support.shred_audit", "support.session", "support.relay_call"])(
    "rejects an owner DELETE of %s with SQLSTATE 55000", async (table) => prepared(async (db) => {
      await expect(db.pool.query(`DELETE FROM ${table}`)).rejects.toMatchObject({ code: "55000" });
    }), timeout);

  it("removes fourteen INSERT grants but retains public incident, shred audit and column UPDATE", async () => prepared(async (db) => {
    for (const table of tables) expect((await db.pool.query(`SELECT has_table_privilege('debateai_support',$1,'INSERT') kept`, [`support.${table}`])).rows[0]!.kept, table).toBe(false);
    for (const table of ["support.shred_audit", "support.public_incident"])
      expect((await db.pool.query(`SELECT has_table_privilege('debateai_support',$1,'INSERT') kept`, [table])).rows[0]!.kept).toBe(true);
    const columns = (await db.pool.query(`SELECT c.relname,a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE n.nspname='support' AND a.attacl IS NOT NULL
      AND has_column_privilege('debateai_support',c.oid,a.attname,'UPDATE') ORDER BY c.relname,a.attname`)).rows;
    expect(columns).toHaveLength(13);
  }), timeout);

  it("returns empty support lists in account A's data export", async () => prepared(async (db, _before, ownerRef, userId) => {
    const exportId = randomUUID(), workerId = randomUUID(), sessionId = randomUUID(), grantToken = randomUUID();
    await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
    [sessionId,userId,`sha256:${"a".repeat(64)}`,`sha256:${"b".repeat(64)}`]);
    await db.pool.query("INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())", [userId]);
    await db.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'EXPORT_DATA',$4,clock_timestamp(),clock_timestamp()+interval '5 minutes')`,
    [randomUUID(),hashToken("step-up-grant",grantToken),sessionId,userId]);
    const repo = new PostgresDataExportRepository(db.pool, db.pool,
      { hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64) } as never);
    expect((await repo.request({ userId, sessionId, grantTokenHash: hashToken("step-up-grant",grantToken),
      exportId, locale: "en", source: { ip: "192.0.2.5", userAgent: "export-fixture", requestId: "fixture" } })).kind).toBe("ACCEPTED");
    const claim = await repo.claim(workerId, 300);
    expect(claim?.ownerRef).toBe(ownerRef);
    const snapshot = (await db.pool.query("SELECT identity.read_data_export_snapshot($1,$2) data", [exportId,workerId])).rows[0]!.data;
    for (const key of ["support_sessions","support_messages","support_cases","support_case_events","support_case_messages","support_ratings","support_key_states"])
      expect(snapshot[key], key).toEqual([]);
  }), timeout);

  it("VACUUM FULL leaves every retired relation with zero heap bytes", async () => prepared(async (db) => {
    for (const table of deletion) {
      await db.pool.query(`VACUUM FULL support.${table}`);
      expect(Number((await db.pool.query("SELECT pg_relation_size($1::regclass) bytes", [`support.${table}`])).rows[0]!.bytes), table).toBe(0);
    }
  }), timeout);

  it("keeps all 44 non-internal support triggers", async () => prepared(async (db) => {
    expect(Number((await db.pool.query(`SELECT count(*) total FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='support' AND NOT t.tgisinternal`)).rows[0]!.total)).toBe(44);
  }), timeout);

  it("the terminal guard rejects a disabled rating guard by name", async () => prepared(async (db) => {
    const sql = readFileSync(new URL("../../migrations/0128_support_answer_scope.sql", import.meta.url), "utf8");
    const last = sql.slice(sql.lastIndexOf("DO $$"));
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("ALTER TABLE support.rating DISABLE TRIGGER reject_mutation");
      await expect(client.query(last)).rejects.toThrow(/MIGRATION_0128_GUARD_MISSING.*support\.rating/u);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }), timeout);
});
