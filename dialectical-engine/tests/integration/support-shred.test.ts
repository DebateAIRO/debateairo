import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertSupportKeyCoverage,
  createPool,
  lockSupportOwners,
  lockSupportSessions,
  migrate,
  PostgresSupportCaseRepository,
  PostgresSupportShredRepository,
  PostgresSupportSessionRepository
} from "../../packages/db/src/index.js";
import { createSupportKeyPort } from "../../apps/api/src/support/keys.js";
import {
  createSupportCaseMaterial,
  createWrappedSupportSessionKey
} from "../../apps/api/src/support/session.js";
import {
  SupportShredService,
  type SupportShredPort
} from "../../apps/api/src/support/shred.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let migrationSource: string;

const at = new Date("2026-09-07T10:00:00.000Z");

function liveWrappedKey(fill: number): Buffer {
  return Buffer.concat([Buffer.from([1]), Buffer.alloc(60, fill)]);
}

function contentV2(fill: number): Buffer {
  const envelope = Buffer.alloc(29,fill);
  envelope[0] = 2;
  return envelope;
}

async function beginSupport(client: PoolClient): Promise<void> {
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE debateai_support");
}

async function insertSessionPair(
  client: PoolClient,
  input: Readonly<{
    sessionId: string;
    ownerRef?: string | null;
    fill?: number;
  }>
): Promise<void> {
  await client.query(`
    INSERT INTO support.session(
      session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
    ) VALUES($1,$2,$3,'en','OPEN',$4,$5)
  `, [
    input.sessionId,
    Buffer.from(`token:${input.sessionId}`).toString("hex").slice(0, 64).padEnd(64, "0"),
    input.ownerRef ?? null,
    "a".repeat(64),
    at
  ]);
  await client.query(`
    INSERT INTO support.session_key(session_id,wrapped_key,created_at)
    VALUES($1,$2,$3)
  `, [input.sessionId, liveWrappedKey(input.fill ?? 1), at]);
}

async function createSessionPair(input: Readonly<{
  sessionId: string;
  ownerRef?: string | null;
  fill?: number;
}>): Promise<void> {
  const client = await database.pool.connect();
  try {
    await beginSupport(client);
    await insertSessionPair(client, input);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function insertCasePair(
  client: PoolClient,
  input: Readonly<{ caseId: string; sessionId: string; fill?: number }>
): Promise<void> {
  await client.query(`
    INSERT INTO support."case"(
      case_id,token_sha256,session_id,language,created_at,
      transcript_snapshot_ciphertext,state
    ) VALUES($1,$2,$3,'en',$4,$5,'NEW')
  `, [
    input.caseId,
    Buffer.from(`case:${input.caseId}`).toString("hex").slice(0, 64).padEnd(64, "0"),
    input.sessionId,
    at,
    contentV2(input.fill ?? 7)
  ]);
  await client.query(`
    INSERT INTO support.case_key(case_id,wrapped_key,created_at)
    VALUES($1,$2,$3)
  `, [input.caseId, liveWrappedKey(input.fill ?? 7), at]);
}

async function seedShredTarget(input: Readonly<{
  sessionId: string;
  ownerRef?: string | null;
  caseId?: string;
}>): Promise<void> {
  const client = await database.pool.connect();
  try {
    await beginSupport(client);
    await insertSessionPair(client, input);
    await client.query(`
      INSERT INTO support.message(
        message_id,session_id,role,content_ciphertext,outcome,language,
        detected_language,redacted,received_at
      ) VALUES
        ($1,$2,'user',$3,'ANSWER_GROUNDED','en','en',false,$4),
        ($5,$2,'assistant',$6,'ANSWER_GROUNDED','en','en',false,$4)
    `, [
      randomUUID(), input.sessionId, contentV2(2), at,
      randomUUID(), contentV2(5)
    ]);
    if (input.caseId !== undefined) {
      await insertCasePair(client, { caseId: input.caseId, sessionId: input.sessionId });
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function expectReplayFailure(sql: string, code: RegExp): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await expect(client.query(migrationSource)).rejects.toThrow(code);
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function settle(client: PoolClient, operation: () => Promise<void>): Promise<boolean> {
  try {
    await operation();
    await client.query("COMMIT");
    return true;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return false;
  }
}

async function beginSupportAt(
  client: PoolClient,
  isolation: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE"
): Promise<void> {
  await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
  await client.query("SET LOCAL ROLE debateai_support");
}

beforeAll(async () => {
  migrationSource = await readFile("migrations/0054_support_keys_audit.sql", "utf8");
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop(), 120_000);

describe("SUP-07 support key schema and transaction-bound integrity", () => {
  it("creates the exact sixteen application relations plus one inaccessible guard", async () => {
    const relations = await database.pool.query<{
      relname: string;
      relkind: string;
      owner: string;
    }>(`
      SELECT relation.relname,relation.relkind,owner.rolname AS owner
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner ON owner.oid=relation.relowner
      WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
      ORDER BY relation.relname
    `);
    expect(relations.rows.map(({ relname }) => relname)).toEqual([
      "_shred_integrity_guard",
      "abuse_event",
      "admission_event",
      "case",
      "case_event",
      "case_key",
      "case_message",
      "message",
      "public_incident",
      "rating",
      "relay_call",
      "relay_waiter",
      "relay_waiter_event",
      "session",
      "session_key",
      "shred_audit",
      "tool_call"
    ]);
    expect(new Set(relations.rows.map(({ owner }) => owner)).size).toBe(1);

    const columns = await database.pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name
      FROM information_schema.columns
      WHERE table_schema='support' AND (
        (table_name='session_key' AND column_name='destroyed_at')
        OR (table_name='session' AND column_name='shredded_at')
        OR (table_name='case' AND column_name='shredded_at')
      ) ORDER BY table_name,column_name
    `);
    expect(columns.rows).toEqual([
      { table_name: "case", column_name: "shredded_at" },
      { table_name: "session", column_name: "shredded_at" },
      { table_name: "session_key", column_name: "destroyed_at" }
    ]);
  });

  it("pins the literal table and column privilege matrix", async () => {
    const privileges = await database.pool.query<{
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
      can_references: boolean;
      can_trigger: boolean;
    }>(`
      SELECT relation.relname AS table_name,
        has_table_privilege('debateai_support',relation.oid,'SELECT') AS can_select,
        has_table_privilege('debateai_support',relation.oid,'INSERT') AS can_insert,
        has_table_privilege('debateai_support',relation.oid,'UPDATE') AS can_update,
        has_table_privilege('debateai_support',relation.oid,'DELETE') AS can_delete,
        has_table_privilege('debateai_support',relation.oid,'TRUNCATE') AS can_truncate,
        has_table_privilege('debateai_support',relation.oid,'REFERENCES') AS can_references,
        has_table_privilege('debateai_support',relation.oid,'TRIGGER') AS can_trigger
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
      ORDER BY relation.relname
    `);
    expect(privileges.rows).toEqual([
      "_shred_integrity_guard",
      "abuse_event",
      "admission_event",
      "case",
      "case_event",
      "case_key",
      "case_message",
      "message",
      "public_incident",
      "rating",
      "relay_call",
      "relay_waiter",
      "relay_waiter_event",
      "session",
      "session_key",
      "shred_audit",
      "tool_call"
    ].map((table_name) => ({
      table_name,
      can_select: table_name !== "_shred_integrity_guard",
      can_insert: table_name !== "_shred_integrity_guard",
      can_update: false,
      can_delete: false,
      can_truncate: false,
      can_references: false,
      can_trigger: false
    })));

    const updates = await database.pool.query<{ table_name: string; column_name: string }>(`
      SELECT relation.relname AS table_name,attribute.attname AS column_name
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
      WHERE namespace.nspname='support' AND relation.relkind IN ('r','p','v')
        AND attribute.attnum>0 AND NOT attribute.attisdropped
        AND has_column_privilege(
          'debateai_support',relation.oid,attribute.attname,'UPDATE'
        )
      ORDER BY relation.relname,attribute.attname
    `);
    expect(updates.rows).toEqual([
      { table_name: "case", column_name: "shredded_at" },
      { table_name: "case", column_name: "state" },
      { table_name: "case", column_name: "summary_at" },
      { table_name: "case", column_name: "summary_authoritative" },
      { table_name: "case", column_name: "summary_ciphertext" },
      { table_name: "case", column_name: "summary_status" },
      { table_name: "case_key", column_name: "destroyed_at" },
      { table_name: "case_key", column_name: "wrapped_key" },
      { table_name: "public_incident", column_name: "ended_at" },
      { table_name: "session", column_name: "consent_own_context_at" },
      { table_name: "session", column_name: "shredded_at" },
      { table_name: "session_key", column_name: "destroyed_at" },
      { table_name: "session_key", column_name: "wrapped_key" }
    ]);
  });

  it("installs five statement markers and one deferred guard-only constraint trigger", async () => {
    const triggers = await database.pool.query<{
      trigger_name: string;
      relation_name: string;
      deferrable: boolean;
      initially_deferred: boolean;
      definition: string;
    }>(`
      SELECT trigger.tgname AS trigger_name,relation.relname AS relation_name,
        trigger.tgdeferrable AS deferrable,trigger.tginitdeferred AS initially_deferred,
        pg_catalog.pg_get_triggerdef(trigger.oid,true) AS definition
      FROM pg_catalog.pg_trigger AS trigger
      JOIN pg_catalog.pg_class AS relation ON relation.oid=trigger.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='support' AND NOT trigger.tgisinternal
      ORDER BY trigger.tgname
    `);
    // 13 from 0054 (5 markers + 1 deferred guard + 7 content-v2 envelope triggers)
    // plus the 32 DB1 / DL5-F2 guards migrations/0065_security_delta_guards.sql
    // installs: reject_truncate on all 17 support relations, reject_mutation on the
    // 9 append-only ones and reject_delete on the 6 never-deleted column-mutable ones.
    expect(triggers.rows).toHaveLength(45);
    expect(triggers.rows.filter(({ trigger_name }) =>
      trigger_name === "support_shred_integrity_guard_trigger"
    )).toEqual([expect.objectContaining({
      relation_name: "_shred_integrity_guard",
      deferrable: true,
      initially_deferred: true,
      definition: expect.stringContaining("UPDATE OF mutation_generation")
    })]);
    expect(triggers.rows.filter(({ trigger_name }) =>
      trigger_name.startsWith("support_shred_dirty_"))).toHaveLength(5);
    expect(triggers.rows.filter(({ trigger_name }) =>
      trigger_name.includes("_content_v2_") || trigger_name.includes("_snapshot_v2_")
        || trigger_name.includes("_summary_v2_"))).toHaveLength(7);
    expect(triggers.rows.filter(({ trigger_name }) => trigger_name === "reject_truncate")
      .map(({ relation_name }) => relation_name).sort()).toEqual([
      "_shred_integrity_guard", "abuse_event", "admission_event", "case", "case_event",
      "case_key", "case_message", "message", "public_incident", "rating", "relay_call",
      "relay_waiter", "relay_waiter_event", "session", "session_key", "shred_audit", "tool_call"
    ]);
    expect(triggers.rows.filter(({ trigger_name }) => trigger_name === "reject_mutation")
      .map(({ relation_name }) => relation_name).sort()).toEqual([
      "abuse_event", "admission_event", "case_event", "rating", "relay_call",
      "relay_waiter", "relay_waiter_event", "shred_audit", "tool_call"
    ]);
    expect(triggers.rows.filter(({ trigger_name }) => trigger_name === "reject_delete")
      .map(({ relation_name }) => relation_name).sort()).toEqual([
      "_shred_integrity_guard", "case", "case_key", "public_incident", "session", "session_key"
    ]);

    const functions = await database.pool.query<{
      proname: string;
      security_definer: boolean;
      configuration: string[];
      public_execute: boolean;
      support_execute: boolean;
      body_sha256: string;
    }>(`
      SELECT procedure.proname,procedure.prosecdef AS security_definer,
        procedure.proconfig AS configuration,
        has_function_privilege('public',procedure.oid,'EXECUTE') AS public_execute,
        has_function_privilege('debateai_support',procedure.oid,'EXECUTE') AS support_execute,
        encode(audit_crypto_internal.digest(
          convert_to(procedure.prosrc,'UTF8'),'sha256'
        ),'hex') AS body_sha256
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.pronamespace='support'::regnamespace
        AND procedure.proname IN ('mark_shred_integrity_dirty','assert_shred_integrity')
      ORDER BY procedure.proname
    `);
    expect(functions.rows).toEqual([
      {
        proname: "assert_shred_integrity",
        security_definer: true,
        configuration: ["search_path=pg_catalog, pg_temp"],
        public_execute: false,
        support_execute: false,
        body_sha256: "33ed86b5ba3aa1b98d99158a533c7347ab8ec1fce73bb8830ec901d6b6f7d44c"
      },
      {
        proname: "mark_shred_integrity_dirty",
        security_definer: true,
        configuration: ["search_path=pg_catalog, pg_temp"],
        public_execute: false,
        support_execute: false,
        body_sha256: "538dac0a59a56771a1081636404cd2f9d6e32c0550ae465a0f8085dc02c55276"
      }
    ]);
  });

  it("permits a complete key pair but atomically rejects a missing key", async () => {
    const validSession = randomUUID();
    await expect(createSessionPair({ sessionId: validSession })).resolves.toBeUndefined();

    const missingKeySession = randomUUID();
    const client = await database.pool.connect();
    try {
      await beginSupport(client);
      await client.query(`
        INSERT INTO support.session(
          session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
        ) VALUES($1,$2,NULL,'en','OPEN',$3,$4)
      `, [missingKeySession, "b".repeat(64), "c".repeat(64), at]);
      await expect(client.query("COMMIT")).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
      await client.query("ROLLBACK").catch(() => undefined);
    } finally {
      client.release();
    }
    expect((await database.pool.query(
      "SELECT session_id FROM support.session WHERE session_id=$1",
      [missingKeySession]
    )).rowCount).toBe(0);
  });

  it("commits a coherent anonymous shred and rejects split destruction without audit", async () => {
    const validSession = randomUUID();
    await createSessionPair({ sessionId: validSession, fill: 2 });
    const valid = await database.pool.connect();
    try {
      await beginSupport(valid);
      await valid.query(`UPDATE support.session_key
        SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2 WHERE session_id=$1`,
      [validSession, at]);
      await valid.query("UPDATE support.session SET shredded_at=$2 WHERE session_id=$1", [validSession, at]);
      await valid.query(`INSERT INTO support.shred_audit(
        at,os_user,target_kind,target_ref,keys_destroyed
      ) VALUES($1,'vitest','session',$2,1)`, [at, validSession]);
      await valid.query("COMMIT");
    } finally {
      valid.release();
    }

    const invalidSession = randomUUID();
    await createSessionPair({ sessionId: invalidSession, fill: 3 });
    const invalid = await database.pool.connect();
    try {
      await beginSupport(invalid);
      await invalid.query(`UPDATE support.session_key
        SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2 WHERE session_id=$1`,
      [invalidSession, at]);
      await expect(invalid.query("COMMIT")).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
      await invalid.query("ROLLBACK").catch(() => undefined);
    } finally {
      invalid.release();
    }
    const restored = (await database.pool.query<{ destroyed_at: Date | null; zero: boolean }>(`
      SELECT destroyed_at,wrapped_key=decode(repeat('00',61),'hex') AS zero
      FROM support.session_key WHERE session_id=$1
    `, [invalidSession])).rows[0];
    expect(restored).toEqual({ destroyed_at: null, zero: false });
  });

  it("revalidates every dirty generation after an early constraint flush", async () => {
    const sessionId = randomUUID();
    await createSessionPair({ sessionId, fill: 4 });
    const client = await database.pool.connect();
    try {
      await beginSupport(client);
      await client.query("SELECT set_config('debateai.support_shred_validation_count','0',true)");
      await client.query(
        "UPDATE support.session SET shredded_at=shredded_at WHERE session_id=$1",
        [sessionId]
      );
      await client.query(
        "SET CONSTRAINTS support.support_shred_integrity_guard_trigger IMMEDIATE"
      );
      expect((await client.query<{ count: string }>(`
        SELECT current_setting('debateai.support_shred_validation_count') AS count
      `)).rows[0]?.count).toBe("1");
      await client.query(
        "SET CONSTRAINTS support.support_shred_integrity_guard_trigger DEFERRED"
      );
      await client.query(`UPDATE support.session_key
        SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2 WHERE session_id=$1`,
      [sessionId, at]);
      await expect(client.query(
        "SET CONSTRAINTS support.support_shred_integrity_guard_trigger IMMEDIATE"
      )).rejects.toThrow("SUPPORT_SHRED_INTEGRITY_INVALID");
      await client.query("ROLLBACK").catch(() => undefined);
    } finally {
      client.release();
    }
  });

  it("serializes owner shreds against new signed sessions at every isolation level", async () => {
    for (const isolation of [
      "READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"
    ] as const) {
      for (const shredFirst of [true, false]) {
        const ownerRef = randomUUID();
        const existingSession = randomUUID();
        const laterSession = randomUUID();
        await createSessionPair({ sessionId: existingSession, ownerRef, fill: 5 });
        const shred = await database.pool.connect();
        const insert = await database.pool.connect();
        try {
          await beginSupportAt(shred, isolation);
          await beginSupportAt(insert, isolation);
          const shredWork = () => settle(shred, async () => {
            await shred.query(`UPDATE support.session_key AS key
              SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2
              FROM support.session AS parent
              WHERE parent.session_id=key.session_id
                AND parent.identity_owner_ref=$1`, [ownerRef, at]);
            await shred.query(
              "UPDATE support.session SET shredded_at=$2 WHERE identity_owner_ref=$1",
              [ownerRef, at]
            );
            await shred.query(`INSERT INTO support.shred_audit(
              at,os_user,target_kind,target_ref,keys_destroyed
            ) VALUES($1,'vitest','owner',$2,1)`, [at, ownerRef]);
          });
          const insertWork = () => settle(insert, async () => {
            await insertSessionPair(insert, {
              sessionId: laterSession,
              ownerRef,
              fill: 6
            });
          });

          const first = shredFirst ? shredWork() : insertWork();
          await new Promise((resolve) => setTimeout(resolve, 20));
          const second = shredFirst ? insertWork() : shredWork();
          const [firstCommitted, secondCommitted] = await Promise.all([first, second]);
          expect([firstCommitted, secondCommitted]).toEqual([true, false]);
        } finally {
          await Promise.all([
            shred.query("ROLLBACK").catch(() => undefined),
            insert.query("ROLLBACK").catch(() => undefined)
          ]);
          shred.release();
          insert.release();
        }
      }
    }
  });

  it("runs one scan per dirty generation including a later valid generation", async () => {
    const first = randomUUID();
    const second = randomUUID();
    const client = await database.pool.connect();
    try {
      await beginSupport(client);
      await client.query("SELECT set_config('debateai.support_shred_validation_count','0',true)");
      await insertSessionPair(client, { sessionId: first, fill: 7 });
      await insertSessionPair(client, { sessionId: second, fill: 8 });
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      expect((await client.query<{ count: string }>(`
        SELECT current_setting('debateai.support_shred_validation_count') AS count
      `)).rows[0]?.count).toBe("1");
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      await client.query(`UPDATE support.session_key
        SET wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$1
        WHERE session_id=ANY($2::uuid[])`, [at, [first, second]]);
      await client.query(
        "UPDATE support.session SET shredded_at=$1 WHERE session_id=ANY($2::uuid[])",
        [at, [first, second]]
      );
      await client.query(`INSERT INTO support.shred_audit(
        at,os_user,target_kind,target_ref,keys_destroyed
      ) SELECT $1,'vitest','session',session_id::text,1
        FROM support.session WHERE session_id=ANY($2::uuid[])`, [at, [first, second]]);
      await client.query("SET CONSTRAINTS ALL IMMEDIATE");
      expect((await client.query<{ count: string }>(`
        SELECT current_setting('debateai.support_shred_validation_count') AS count
      `)).rows[0]?.count).toBe("2");
      await client.query("COMMIT");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("uses total database-native owner/session lock domains across 10,000 UUIDs", async () => {
    const ids = Array.from({ length: 10_000 }, (_, index) =>
      `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
    );
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await lockSupportOwners(client, ids);
      const ownerDomains = await client.query<{ domain: number; locks: string }>(`
        SELECT classid::integer AS domain,count(*)::text AS locks
        FROM pg_catalog.pg_locks
        WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
          AND classid IN (19370701,19370702)
        GROUP BY classid ORDER BY classid
      `);
      expect(ownerDomains.rows).toEqual([
        { domain: 19370701, locks: ownerDomains.rows[0]?.locks }
      ]);
      expect(Number(ownerDomains.rows[0]?.locks) > 9_900).toBe(true);
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await lockSupportSessions(client, ids);
      const sessionDomains = await client.query<{ domain: number; locks: string }>(`
        SELECT classid::integer AS domain,count(*)::text AS locks
        FROM pg_catalog.pg_locks
        WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
          AND classid IN (19370701,19370702)
        GROUP BY classid ORDER BY classid
      `);
      expect(sessionDomains.rows).toEqual([
        { domain: 19370702, locks: sessionDomains.rows[0]?.locks }
      ]);
      expect(Number(sessionDomains.rows[0]?.locks) > 9_900).toBe(true);
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await lockSupportOwners(client, [ids[0]!]);
      await lockSupportSessions(client, [ids[0]!]);
      expect((await client.query<{ domain: number }>(`
        SELECT DISTINCT classid::integer AS domain FROM pg_catalog.pg_locks
        WHERE locktype='advisory' AND pid=pg_backend_pid() AND granted
          AND classid IN (19370701,19370702) ORDER BY domain
      `)).rows).toEqual([{ domain: 19370701 }, { domain: 19370702 }]);
      await client.query("ROLLBACK");
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("uses the canonical lock helpers without a Node-side lock hash", async () => {
    const source = await readFile("packages/db/src/support.ts", "utf8");
    expect(source).toContain("lockSupportDomain(client, 19370701, ownerRefs)");
    expect(source).toContain("lockSupportDomain(client, 19370702, sessionIds)");
    expect(source).toContain("await lockSupportOwners(client, [input.identityOwnerRef])");
    expect(source).toContain("await lockSupportSessions(client, [input.sessionId])");
    expect(source).toContain("SELECT DISTINCT ref FROM pg_catalog.unnest($2::uuid[])");
    expect(source).toContain("ORDER BY ref");
    expect(source).not.toContain("ORDER BY ref DESC");
    expect(source).not.toMatch(/createHash|murmur|fnv|advisory.*Number/iu);
    expect(source.match(/await lockSupportOwners\(/gu)).toHaveLength(3);
    expect(source.match(/await lockSupportSessions\(/gu)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("fails startup coverage for an unkeyed session", async () => {
    const sessionId = randomUUID();
    await database.pool.query("ALTER TABLE support.session DISABLE TRIGGER USER");
    try {
      await database.pool.query(`INSERT INTO support.session(
        session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at
      ) VALUES($1,$2,NULL,'en','OPEN',$3,$4)`, [
        sessionId, "d".repeat(64), "e".repeat(64), at
      ]);
      await expect(assertSupportKeyCoverage(database.pool))
        .rejects.toThrow("SUPPORT_KEY_COVERAGE_INVALID");
      await database.pool.query("DELETE FROM support.session WHERE session_id=$1", [sessionId]);
    } finally {
      await database.pool.query("ALTER TABLE support.session ENABLE TRIGGER USER");
    }
    await expect(assertSupportKeyCoverage(database.pool)).resolves.toBeUndefined();
  });

  it("creates cryptographically matched case material and preserves ciphertext after shred", async () => {
    const root = await mkdtemp(join(tmpdir(), "debateai-support-case-"));
    const secrets = join(root, "secrets");
    await mkdir(secrets, { mode: 0o700 });
    const supportKekPath = join(secrets, "support-kek.bin");
    await writeFile(supportKekPath, Buffer.alloc(32, 0x59), { mode: 0o600 });
    const keys = await createSupportKeyPort({ supportKekPath });
    const plaintext = Buffer.from("future SUP-02 transcript snapshot", "utf8");
    const sessionId = randomUUID();
    const caseId = randomUUID();
    try {
      const sessions = new PostgresSupportSessionRepository(
        database.pool,
        createWrappedSupportSessionKey(keys)
      );
      await sessions.create({
        sessionId,
        tokenSha256: "1".repeat(64),
        identityOwnerRef: null,
        language: "en",
        kbVersion: "2".repeat(64),
        createdAt: at
      });
      const sessionWrapped = (await database.pool.query<{ wrapped_key: Buffer }>(
        "SELECT wrapped_key FROM support.session_key WHERE session_id=$1",
        [sessionId]
      )).rows[0]!.wrapped_key;
      const sessionDataKey = await keys.unwrapDataKey(
        { kind: "session", ref: sessionId },sessionWrapped
      );
      sessionDataKey.fill(0);
      const cases = new PostgresSupportCaseRepository(
        database.pool,
        createSupportCaseMaterial(keys, plaintext)
      );
      await cases.createCase({
        caseId,
        tokenSha256: "3".repeat(64),
        sessionId,
        language: "en",
        createdAt: at
      });
      const stored = (await database.pool.query<{
        wrapped_key: Buffer;
        transcript_snapshot_ciphertext: Buffer;
      }>(`SELECT key.wrapped_key,parent.transcript_snapshot_ciphertext
        FROM support."case" AS parent
        JOIN support.case_key AS key ON key.case_id=parent.case_id
        WHERE parent.case_id=$1`, [caseId])).rows[0]!;
      const dataKey = await keys.unwrapDataKey({ kind: "case", ref: caseId }, stored.wrapped_key);
      try {
        expect(keys.openContent(
          { kind: "case-snapshot",caseId,purpose: "transcript" },
          dataKey,
          stored.transcript_snapshot_ciphertext
        )).toEqual(plaintext);
      } finally {
        dataKey.fill(0);
      }

      const shred = await database.pool.connect();
      try {
        await beginSupport(shred);
        await shred.query(`UPDATE support.case_key SET
          wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2 WHERE case_id=$1`,
        [caseId, at]);
        await shred.query(`UPDATE support.session_key SET
          wrapped_key=decode(repeat('00',61),'hex'),destroyed_at=$2 WHERE session_id=$1`,
        [sessionId, at]);
        await shred.query("UPDATE support.\"case\" SET shredded_at=$2 WHERE case_id=$1", [caseId, at]);
        await shred.query("UPDATE support.session SET shredded_at=$2 WHERE session_id=$1", [sessionId, at]);
        await shred.query(`INSERT INTO support.shred_audit(
          at,os_user,target_kind,target_ref,keys_destroyed
        ) VALUES($1,'vitest','session',$2,2)`, [at, sessionId]);
        await shred.query("COMMIT");
      } finally {
        shred.release();
      }
      const after = (await database.pool.query<{
        wrapped_key: Buffer;
        transcript_snapshot_ciphertext: Buffer;
      }>(`SELECT key.wrapped_key,parent.transcript_snapshot_ciphertext
        FROM support."case" AS parent
        JOIN support.case_key AS key ON key.case_id=parent.case_id
        WHERE parent.case_id=$1`, [caseId])).rows[0]!;
      expect(after.transcript_snapshot_ciphertext).toEqual(
        stored.transcript_snapshot_ciphertext
      );
      await expect(keys.unwrapDataKey({ kind: "case", ref: caseId }, after.wrapped_key))
        .rejects.toMatchObject({ code: "SUPPORT_KEY_DESTROYED" });
      const forbiddenMaterial = vi.fn(async () => ({
        wrappedKey: Buffer.concat([Buffer.from([1]), Buffer.alloc(60, 1)]),
        transcriptSnapshotCiphertext: Buffer.from([1])
      }));
      const forbiddenCaseId = randomUUID();
      await expect(new PostgresSupportCaseRepository(
        database.pool,forbiddenMaterial
      ).createCase({
        caseId: forbiddenCaseId,
        tokenSha256: "4".repeat(64),
        sessionId,
        language: "en",
        createdAt: at
      })).rejects.toThrow("SUPPORT_CASE_PARENT_INVALID");
      expect(forbiddenMaterial).not.toHaveBeenCalled();
      expect((await database.pool.query(
        "SELECT case_id FROM support.\"case\" WHERE case_id=$1",
        [forbiddenCaseId]
      )).rowCount).toBe(0);
    } finally {
      plaintext.fill(0);
      await keys.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("replays after 0055 is already recorded and rejects hostile catalog lookalikes", async () => {
    await database.pool.query(
      "DELETE FROM public.debateai_schema_migration WHERE name='0054_support_keys_audit.sql'"
    );
    await expect(migrate(database.pool)).resolves.toBeUndefined();
    expect((await database.pool.query<{ name: string }>(`
      SELECT name FROM public.debateai_schema_migration
      WHERE name IN ('0054_support_keys_audit.sql','0055_register_support_publication.sql')
      ORDER BY name
    `)).rows).toEqual([
      { name: "0054_support_keys_audit.sql" },
      { name: "0055_register_support_publication.sql" }
    ]);

    await expectReplayFailure(
      "ALTER TABLE support.case_key ALTER COLUMN created_at DROP NOT NULL",
      /SUPPORT_SHRED_DEFINITION_DRIFT: columns/u
    );
    await expectReplayFailure(`
      ALTER TABLE support.case_key DROP CONSTRAINT support_case_key_case_fk;
      ALTER TABLE support.case_key ADD CONSTRAINT support_case_key_case_fk
        FOREIGN KEY(case_id) REFERENCES support.session(session_id) NOT VALID
    `, /SUPPORT_SHRED_DEFINITION_DRIFT: constraints/u);
    await expectReplayFailure(`
      ALTER TABLE support.case_key DROP CONSTRAINT support_case_key_envelope_ck;
      ALTER TABLE support.case_key ADD CONSTRAINT support_case_key_envelope_ck
        CHECK (octet_length(wrapped_key) > 0)
    `, /SUPPORT_SHRED_DEFINITION_DRIFT: constraints/u);
    await expectReplayFailure(
      "ALTER TABLE support.case_key OWNER TO debateai_support",
      /SUPPORT_SHRED_DEFINITION_DRIFT: owners/u
    );
    await expectReplayFailure(
      "GRANT DELETE ON support.case_key TO debateai_support",
      /SUPPORT_SHRED_DEFINITION_DRIFT: privileges/u
    );
    await expectReplayFailure(
      "DROP TRIGGER support_shred_dirty_case_key ON support.case_key",
      /SUPPORT_SHRED_DEFINITION_DRIFT: triggers/u
    );
  });
});

describe("SUP-07 transactional shred boundary", () => {
  it("is structurally assignable through an API-only facade", async () => {
    const repository = new PostgresSupportShredRepository(database.pool);
    const assignable: SupportShredPort = repository;
    const service = new SupportShredService(assignable);
    await expect(service.shredOwner(randomUUID(), "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_TARGET_NOT_FOUND");
    const source = await readFile("apps/api/src/support/shred.ts", "utf8");
    expect(source).not.toMatch(/@debateai\/db|from\s+["']pg["']|PoolClient|createPool/u);
  });

  it("rejects every malformed input before pool acquisition or SQL", async () => {
    const connect = vi.fn();
    const query = vi.fn();
    const repository = new PostgresSupportShredRepository({ connect, query } as unknown as Pool);
    const valid = randomUUID();
    const badCalls: Array<() => Promise<unknown>> = [
      () => repository.shredOwner("not-a-uuid", "vitest", at),
      () => repository.shredOwner(valid.toUpperCase(), "vitest", at),
      () => repository.shredOwner(valid, "", at),
      () => repository.shredOwner(valid, "x".repeat(129), at),
      () => repository.shredOwner(valid, "bad\nuser", at),
      () => repository.shredOwner(valid, "vitest", new Date(Number.NaN)),
      () => repository.shredSession("not-a-uuid", "vitest", at),
      () => repository.shredSession(valid.toUpperCase(), "vitest", at),
      () => repository.shredSession(valid, "", at),
      () => repository.shredSession(valid, "x".repeat(129), at),
      () => repository.shredSession(valid, "bad\u0000user", at),
      () => repository.shredSession(valid, "vitest", new Date(Number.POSITIVE_INFINITY))
    ];
    for (const call of badCalls) {
      await expect(call()).rejects.toThrow("SUPPORT_SHRED_INPUT_INVALID");
    }
    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("atomically shreds an owner target, preserves ciphertext, and is idempotent", async () => {
    const ownerRef = randomUUID();
    const sessionId = randomUUID();
    const caseId = randomUUID();
    await seedShredTarget({ ownerRef, sessionId, caseId });
    const before = await database.pool.query<{
      message_id: string;
      content_ciphertext: Buffer;
    }>(`SELECT message_id,content_ciphertext FROM support.message
      WHERE session_id=$1 ORDER BY message_id`, [sessionId]);
    const beforeCase = (await database.pool.query<{ ciphertext: Buffer }>(`
      SELECT transcript_snapshot_ciphertext AS ciphertext FROM support."case"
      WHERE case_id=$1
    `, [caseId])).rows[0]!.ciphertext;
    const repository = new PostgresSupportShredRepository(database.pool);

    await expect(repository.shredOwner(ownerRef, "vitest", at)).resolves.toEqual({
      kind: "SHREDDED",
      counts: { sessions: 1, cases: 1, keysDestroyed: 2 }
    });
    const after = await database.pool.query<{
      message_id: string;
      content_ciphertext: Buffer;
    }>(`SELECT message_id,content_ciphertext FROM support.message
      WHERE session_id=$1 ORDER BY message_id`, [sessionId]);
    expect(after.rows).toEqual(before.rows);
    expect((await database.pool.query<{ ciphertext: Buffer }>(`
      SELECT transcript_snapshot_ciphertext AS ciphertext FROM support."case"
      WHERE case_id=$1
    `, [caseId])).rows[0]!.ciphertext).toEqual(beforeCase);
    const state = (await database.pool.query<{
      session_shredded: boolean;
      case_shredded: boolean;
      session_zero: boolean;
      case_zero: boolean;
      session_destroyed: Date | null;
      case_destroyed: Date | null;
    }>(`
      SELECT session.shredded_at IS NOT NULL AS session_shredded,
        child.shredded_at IS NOT NULL AS case_shredded,
        session_key.wrapped_key=decode(repeat('00',61),'hex') AS session_zero,
        case_key.wrapped_key=decode(repeat('00',61),'hex') AS case_zero,
        session_key.destroyed_at AS session_destroyed,
        case_key.destroyed_at AS case_destroyed
      FROM support.session AS session
      JOIN support.session_key AS session_key USING(session_id)
      JOIN support."case" AS child USING(session_id)
      JOIN support.case_key AS case_key USING(case_id)
      WHERE session.session_id=$1
    `, [sessionId])).rows[0];
    expect(state).toEqual({
      session_shredded: true,
      case_shredded: true,
      session_zero: true,
      case_zero: true,
      session_destroyed: at,
      case_destroyed: at
    });
    expect((await database.pool.query(`SELECT at,os_user,target_kind,target_ref,keys_destroyed
      FROM support.shred_audit WHERE target_kind='owner' AND target_ref=$1`, [ownerRef])).rows)
      .toEqual([{ at, os_user: "vitest", target_kind: "owner", target_ref: ownerRef, keys_destroyed: 2 }]);
    await expect(repository.shredOwner(ownerRef, "vitest", new Date(at.getTime() + 1000)))
      .resolves.toEqual({ kind: "ALREADY_SHREDDED" });
    expect((await database.pool.query(
      "SELECT 1 FROM support.shred_audit WHERE target_kind='owner' AND target_ref=$1",
      [ownerRef]
    )).rowCount).toBe(1);
    const forbiddenCreate = vi.fn(async () => liveWrappedKey(9));
    await expect(new PostgresSupportSessionRepository(
      database.pool, forbiddenCreate
    ).create({
      sessionId: randomUUID(),
      tokenSha256: "5".repeat(64),
      identityOwnerRef: ownerRef,
      language: "en",
      kbVersion: "6".repeat(64),
      createdAt: at
    })).rejects.toThrow("SUPPORT_OWNER_SHREDDED");
    expect(forbiddenCreate).not.toHaveBeenCalled();
  });

  it("shreds only anonymous sessions and returns typed target errors", async () => {
    const repository = new PostgresSupportShredRepository(database.pool);
    await expect(repository.shredOwner(randomUUID(), "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_TARGET_NOT_FOUND");
    await expect(repository.shredSession(randomUUID(), "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_TARGET_NOT_FOUND");

    const signedSession = randomUUID();
    await seedShredTarget({ ownerRef: randomUUID(), sessionId: signedSession });
    await expect(repository.shredSession(signedSession, "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_SESSION_BOUND");

    const sessionId = randomUUID();
    const caseId = randomUUID();
    await seedShredTarget({ sessionId, caseId });
    await expect(repository.shredSession(sessionId, "vitest", at)).resolves.toEqual({
      kind: "SHREDDED",
      counts: { sessions: 1, cases: 1, keysDestroyed: 2 }
    });
    await expect(repository.shredSession(sessionId, "vitest", at))
      .resolves.toEqual({ kind: "ALREADY_SHREDDED" });
  });

  it("serializes two shredders to one audit and one terminal outcome", async () => {
    const ownerRef = randomUUID();
    await seedShredTarget({ ownerRef, sessionId: randomUUID(), caseId: randomUUID() });
    const first = new PostgresSupportShredRepository(database.pool);
    const second = new PostgresSupportShredRepository(database.pool);
    const outcomes = await Promise.all([
      first.shredOwner(ownerRef, "vitest-a", at),
      second.shredOwner(ownerRef, "vitest-b", at)
    ]);
    expect(outcomes.map(({ kind }) => kind).sort()).toEqual(["ALREADY_SHREDDED", "SHREDDED"]);
    expect((await database.pool.query(
      "SELECT 1 FROM support.shred_audit WHERE target_kind='owner' AND target_ref=$1",
      [ownerRef]
    )).rowCount).toBe(1);
  });

  it("uses the owner barrier so a queued creator is included by the following shred", async () => {
    const ownerRef = randomUUID();
    const initialSession = randomUUID();
    const createdSession = randomUUID();
    await seedShredTarget({ ownerRef, sessionId: initialSession });
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await lockSupportOwners(blocker, [ownerRef]);
    const creator = new PostgresSupportSessionRepository(
      database.pool, async () => liveWrappedKey(8)
    );
    const createPromise = creator.create({
      sessionId: createdSession,
      tokenSha256: "7".repeat(64),
      identityOwnerRef: ownerRef,
      language: "en",
      kbVersion: "8".repeat(64),
      createdAt: at
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const shredPromise = new PostgresSupportShredRepository(database.pool)
      .shredOwner(ownerRef, "vitest", at);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await blocker.query("COMMIT");
    blocker.release();
    await expect(createPromise).resolves.toMatchObject({ sessionId: createdSession });
    await expect(shredPromise).resolves.toEqual({
      kind: "SHREDDED",
      counts: { sessions: 2, cases: 0, keysDestroyed: 2 }
    });
  });

  it("rejects missing-key, mixed-marker, and malformed-audit states without mutation", async () => {
    const repository = new PostgresSupportShredRepository(database.pool);

    const missingOwner = randomUUID();
    const missingSession = randomUUID();
    await seedShredTarget({ ownerRef: missingOwner, sessionId: missingSession });
    const originalKey = (await database.pool.query<{
      wrapped_key: Buffer;
      created_at: Date;
    }>("SELECT wrapped_key,created_at FROM support.session_key WHERE session_id=$1", [missingSession]))
      .rows[0]!;
    await database.pool.query("ALTER TABLE support.session_key DISABLE TRIGGER USER");
    await database.pool.query("DELETE FROM support.session_key WHERE session_id=$1", [missingSession]);
    await database.pool.query("ALTER TABLE support.session_key ENABLE TRIGGER USER");
    await expect(repository.shredOwner(missingOwner, "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_KEY_COVERAGE_INVALID");
    expect((await database.pool.query<{ shredded_at: Date | null }>(
      "SELECT shredded_at FROM support.session WHERE session_id=$1", [missingSession]
    )).rows[0]?.shredded_at).toBeNull();
    await database.pool.query(`INSERT INTO support.session_key(session_id,wrapped_key,created_at)
      VALUES($1,$2,$3)`, [missingSession, originalKey.wrapped_key, originalKey.created_at]);

    const mixedOwner = randomUUID();
    const mixedSession = randomUUID();
    await seedShredTarget({ ownerRef: mixedOwner, sessionId: mixedSession });
    await database.pool.query("ALTER TABLE support.session DISABLE TRIGGER USER");
    await database.pool.query(
      "UPDATE support.session SET shredded_at=$2 WHERE session_id=$1", [mixedSession, at]
    );
    await database.pool.query("ALTER TABLE support.session ENABLE TRIGGER USER");
    await expect(repository.shredOwner(mixedOwner, "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_STATE_INVALID");
    await database.pool.query(
      "UPDATE support.session SET shredded_at=NULL WHERE session_id=$1", [mixedSession]
    );

    const auditOwner = randomUUID();
    const auditSession = randomUUID();
    await seedShredTarget({ ownerRef: auditOwner, sessionId: auditSession });
    await database.pool.query("ALTER TABLE support.shred_audit DISABLE TRIGGER USER");
    await database.pool.query(`INSERT INTO support.shred_audit(
      at,os_user,target_kind,target_ref,keys_destroyed
    ) VALUES($1,'vitest','owner',$2,99)`, [at, auditOwner]);
    await database.pool.query("ALTER TABLE support.shred_audit ENABLE TRIGGER USER");
    await expect(repository.shredOwner(auditOwner, "vitest", at))
      .rejects.toThrow("SUPPORT_SHRED_AUDIT_INVALID");
    await database.pool.query("ALTER TABLE support.shred_audit DISABLE TRIGGER USER");
    await database.pool.query(
      "DELETE FROM support.shred_audit WHERE target_kind='owner' AND target_ref=$1", [auditOwner]
    );
    await database.pool.query("ALTER TABLE support.shred_audit ENABLE TRIGGER USER");
  });
});

/**
 * DL2-F1. Every other test in this file drives the shred through
 * `database.pool`, whose connections are the embedded cluster's initdb
 * superuser (tests/support/testDatabase.ts:86-90,113). The only principal that
 * ever runs `pnpm support:shred` in dev or production is `debateai_support`
 * (apps/runner/src/support-shred-cli.ts:117-130 through
 * support-status-cli-credentials.ts:122,158), which holds SELECT+INSERT on
 * support.shred_audit and nothing else — the boot attestation
 * (packages/db/src/support.ts:2386-2402) refuses any UPDATE grant there. So the
 * suite proved a path no real caller can take.
 */
describe("SUP-07 shred under the attested support principal (DL2-F1)", () => {
  async function supportRolePool(): Promise<Pool> {
    const pool = createPool(database.connectionString);
    pool.on("connect", (client) => {
      // Queued on the client before any later query, so every connection this
      // pool hands out has already dropped to the capability role.
      void client.query("SET ROLE debateai_support");
    });
    const role = await pool.query<{ current_user: string }>("SELECT current_user");
    expect(role.rows[0]?.current_user).toBe("debateai_support");
    return pool;
  }

  it("completes an owner shred and an anonymous session shred as debateai_support", async () => {
    const ownerRef = randomUUID();
    const ownerSession = randomUUID();
    const ownerCase = randomUUID();
    await seedShredTarget({ ownerRef, sessionId: ownerSession, caseId: ownerCase });
    const anonymousSession = randomUUID();
    await seedShredTarget({ sessionId: anonymousSession });

    const pool = await supportRolePool();
    try {
      const repository = new PostgresSupportShredRepository(pool);
      await expect(repository.shredOwner(ownerRef, "vitest", at)).resolves.toEqual({
        kind: "SHREDDED", counts: { sessions: 1, cases: 1, keysDestroyed: 2 }
      });
      await expect(repository.shredOwner(ownerRef, "vitest", at))
        .resolves.toEqual({ kind: "ALREADY_SHREDDED" });
      await expect(repository.shredSession(anonymousSession, "vitest", at)).resolves.toEqual({
        kind: "SHREDDED", counts: { sessions: 1, cases: 0, keysDestroyed: 1 }
      });
      await expect(repository.shredSession(anonymousSession, "vitest", at))
        .resolves.toEqual({ kind: "ALREADY_SHREDDED" });
    } finally {
      await pool.end();
    }

    const audits = await database.pool.query<{ target_kind: string; keys_destroyed: number }>(`
      SELECT target_kind,keys_destroyed FROM support.shred_audit
      WHERE target_ref=ANY($1::text[]) ORDER BY target_kind
    `, [[ownerRef, anonymousSession]]);
    expect(audits.rows).toEqual([
      { target_kind: "owner", keys_destroyed: 2 },
      { target_kind: "session", keys_destroyed: 1 }
    ]);
    await expect(assertSupportKeyCoverage(database.pool)).resolves.toBeUndefined();
  });

  it("holds no UPDATE on support.shred_audit, so no lock clause there may need one", async () => {
    // The grant the fix must NOT widen: SELECT ... FOR UPDATE needs UPDATE on at
    // least one column, and 0054:875 gives the role only SELECT and INSERT.
    const privileges = await database.pool.query<{
      table_update: boolean; any_column_update: boolean; select: boolean; insert: boolean;
    }>(`
      SELECT pg_catalog.has_table_privilege('debateai_support','support.shred_audit','UPDATE') AS table_update,
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute AS attribute
          WHERE attribute.attrelid='support.shred_audit'::regclass
            AND attribute.attnum>0 AND NOT attribute.attisdropped
            AND pg_catalog.has_column_privilege(
              'debateai_support','support.shred_audit',attribute.attname,'UPDATE'
            )
        ) AS any_column_update,
        pg_catalog.has_table_privilege('debateai_support','support.shred_audit','SELECT') AS select,
        pg_catalog.has_table_privilege('debateai_support','support.shred_audit','INSERT') AS insert
    `);
    expect(privileges.rows[0]).toEqual({
      table_update: false, any_column_update: false, select: true, insert: true
    });

    const pool = await supportRolePool();
    try {
      await expect(pool.query("SELECT 1 FROM support.shred_audit FOR UPDATE"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(pool.query("SELECT 1 FROM support.shred_audit")).resolves.toBeDefined();
      // The four locks the shred still takes are all on relations that do carry a
      // column-level UPDATE grant, so they stay legal for this principal.
      for (const relation of [
        "support.session", "support.\"case\"", "support.session_key", "support.case_key"
      ]) {
        await expect(pool.query(`SELECT 1 FROM ${relation} FOR UPDATE`)).resolves.toBeDefined();
      }
    } finally {
      await pool.end();
    }
  });

  it("locks no support relation that the attested role cannot UPDATE", async () => {
    // The regression pin for the whole class: a row lock is a write intent, and
    // PostgreSQL refuses SELECT ... FOR UPDATE/SHARE without UPDATE on at least
    // one column. Every lock clause in the repository is resolved back to the
    // relations it names and compared with the column-level UPDATE grants
    // 0054:882-885 makes, so the next lock clause on an append-only relation
    // fails here instead of in production.
    const source = await readFile(
      new URL("../../packages/db/src/support.ts", import.meta.url), "utf8"
    );
    const lockClause = /FOR\s+(?:NO\s+KEY\s+)?(?:UPDATE|KEY\s+SHARE|SHARE)(?:\s+OF\s+([A-Za-z_,\s"\\]+?))?\s*(?:`|"|\n)/gu;
    const locked = new Set<string>();
    let found = 0;
    for (const match of source.matchAll(lockClause)) {
      const start = source.slice(0, match.index).search(/SELECT[^;]*$/u);
      if (start < 0) continue;
      found += 1;
      const span = source.slice(start, match.index);
      const relations = new Map<string, string>();
      for (const reference of span.matchAll(
        /support\.\\?"?([a-z_]+)\\?"?(?:\s+AS\s+([a-z_]+))?/gu
      )) {
        const relation = `support.${reference[1]!}`;
        relations.set(reference[2] ?? reference[1]!, relation);
      }
      const named = match[1]?.split(",").map((entry) => entry.trim().replaceAll(/[\\"]/gu, ""));
      for (const [alias, relation] of relations) {
        if (named === undefined || named.includes(alias)) locked.add(relation);
      }
    }
    expect(found).toBeGreaterThanOrEqual(6);
    const grants = await database.pool.query<{ relation: string }>(`
      SELECT DISTINCT 'support.' || relation.relname AS relation
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
      WHERE namespace.nspname='support' AND relation.relkind IN ('r','p')
        AND attribute.attnum>0 AND NOT attribute.attisdropped
        AND pg_catalog.has_column_privilege(
          'debateai_support',relation.oid,attribute.attname,'UPDATE'
        )
    `);
    const updatable = new Set(grants.rows.map(({ relation }) => relation));
    expect([...locked].sort()).toEqual([
      "support.case", "support.case_key", "support.session", "support.session_key"
    ]);
    for (const relation of locked) {
      expect(updatable.has(relation), `${relation} is locked but not UPDATE-able`).toBe(true);
    }
    expect(locked.has("support.shred_audit")).toBe(false);
  });

  it("serialises two concurrent owner shreds on the advisory lock and the audit UNIQUE", async () => {
    // What replaces the dropped FOR UPDATE: lockSupportOwners/lockSupportSessions
    // (packages/db/src/support.ts:356-368) plus
    // support_shred_audit_target_unique (0054:257).
    const ownerRef = randomUUID();
    await seedShredTarget({ ownerRef, sessionId: randomUUID() });
    const pool = await supportRolePool();
    try {
      const repository = new PostgresSupportShredRepository(pool);
      const outcomes = await Promise.all([
        repository.shredOwner(ownerRef, "vitest", at),
        repository.shredOwner(ownerRef, "vitest", at)
      ]);
      expect(outcomes.filter(({ kind }) => kind === "SHREDDED")).toHaveLength(1);
      expect(outcomes.filter(({ kind }) => kind === "ALREADY_SHREDDED")).toHaveLength(1);
    } finally {
      await pool.end();
    }
    expect((await database.pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM support.shred_audit WHERE target_ref=$1", [ownerRef]
    )).rows).toEqual([{ count: 1 }]);
  });
});
