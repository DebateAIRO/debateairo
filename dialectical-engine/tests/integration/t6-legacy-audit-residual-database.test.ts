import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const applicationRoles = [
  "debateai_runtime",
  "debateai_authorization_runtime",
  "debateai_erasure_runtime",
  "debateai_replay",
  "debateai_publication_cleanup",
  "debateai_content_provision",
  "debateai_evaluator_api",
  "debateai_evaluator_ddl",
  "debateai_evaluator_reader",
  "debateai_evaluator_worker",
  "debateai_obs_human",
  "debateai_obs_listener",
  "debateai_obs_view_owner",
  "debateai_obs_watchdog",
  "debateai_obs_writer",
  "debateai_settlement_watch"
] as const;

beforeAll(async () => {
  database = await startTestDatabase();
}, 120_000);

afterAll(async () => database?.stop());

describe("T6 legacy audit erasure residual on real PostgreSQL", () => {
  it("preserves legacy rows, reports only exact counts, and denies application roles", async () => {
    await migrate(database.pool);
    await database.pool.query(
      "ALTER TABLE identity.audit_event DROP CONSTRAINT audit_event_actor_ciphertext_null"
    );
    await database.pool.query(
      "ALTER TABLE identity.audit_event DROP CONSTRAINT audit_event_target_id_no_email"
    );
    await database.pool.query(`
      DELETE FROM public.debateai_schema_migration WHERE name=ANY($1::text[])
    `, [[
      "0032_registration_audit_erasure_checks.sql",
      "0043_legacy_audit_erasure_residual.sql"
    ]]);

    const rows = [
      { actor: {}, target: "legacy-both@example.test", hashByte: 0xb1 },
      { actor: {}, target: randomUUID(), hashByte: 0xb2 },
      { actor: null, target: "legacy-target@example.test", hashByte: 0xb3 }
    ];
    for (const [index, row] of rows.entries()) {
      await database.pool.query(`
        INSERT INTO identity.audit_event (
          this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,target_id,
          occurred_at,source_context,decision,success
        ) VALUES ($1,$2::jsonb,$3,'identity.legacy','identity.user',$4,
          clock_timestamp(),$5::jsonb,'ALLOW',true)
      `, [
        Buffer.alloc(32, row.hashByte),
        row.actor === null ? null : JSON.stringify(row.actor),
        `legacy-actor-${index}`,
        row.target,
        JSON.stringify({ legacyFixture: index })
      ]);
    }

    await expect(migrate(database.pool)).resolves.toBeUndefined();
    const migration = await readFile(
      new URL("../../migrations/0043_legacy_audit_erasure_residual.sql", import.meta.url),
      "utf8"
    );
    await expect(database.pool.query(migration)).resolves.toBeDefined();

    const summary = await database.pool.query(`
      SELECT * FROM identity.legacy_audit_erasure_residual_v
    `);
    expect(summary.rows).toEqual([{
      classification: "PRE_0032_NOT_VALID_RESIDUAL",
      residual_row_count: "3",
      actor_ciphertext_row_count: "2",
      address_target_row_count: "2",
      overlapping_row_count: "1",
      constraint_count: "2",
      intentionally_not_valid: true
    }]);
    expect(Object.keys(summary.rows[0]!).sort()).toEqual([
      "actor_ciphertext_row_count", "address_target_row_count", "classification",
      "constraint_count", "intentionally_not_valid", "overlapping_row_count",
      "residual_row_count"
    ]);

    const legacy = await database.pool.query(`
      SELECT count(*)::text AS count FROM identity.audit_event
      WHERE actor_key_ref LIKE 'legacy-actor-%'
    `);
    expect(legacy.rows).toEqual([{ count: "3" }]);

    const constraints = await database.pool.query(`
      SELECT conname,convalidated,obj_description(oid,'pg_constraint') AS description
      FROM pg_catalog.pg_constraint
      WHERE conrelid='identity.audit_event'::regclass
        AND conname=ANY($1::text[])
      ORDER BY conname
    `, [["audit_event_actor_ciphertext_null", "audit_event_target_id_no_email"]]);
    expect(constraints.rows).toEqual([
      {
        conname: "audit_event_actor_ciphertext_null",
        convalidated: false,
        description: expect.stringContaining("ruled historical erasure residual")
      },
      {
        conname: "audit_event_target_id_no_email",
        convalidated: false,
        description: expect.stringContaining("ruled historical erasure residual")
      }
    ]);

    await expect(database.pool.query(`
      INSERT INTO identity.audit_event (
        this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,target_id,
        occurred_at,source_context,decision,success
      ) VALUES ($1,'{}'::jsonb,'new-invalid','identity.new','identity.user',
        'opaque-target',clock_timestamp(),'{}'::jsonb,'ALLOW',true)
    `, [Buffer.alloc(32, 0xb4)])).rejects.toMatchObject({
      code: "23514",
      constraint: "audit_event_actor_ciphertext_null"
    });

    for (const role of applicationRoles) {
      const client = await database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        await expect(client.query(
          "SELECT * FROM identity.legacy_audit_erasure_residual_v"
        )).rejects.toMatchObject({ code: "42501" });
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    }
  }, 120_000);
});
