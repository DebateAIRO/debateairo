import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

describe("FIX-09 chain migration on real PostgreSQL", () => {
  it("proves the exact forward-only schema, legacy microseconds, probes, constraints, and rollback", async () => {
    const columns = await database.pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name
      FROM information_schema.columns
      WHERE table_schema='obs'
        AND ((table_name='occurrence' AND column_name=ANY(ARRAY[
          'chain_version','chain_key_id','chain_seq','chain_signature','chain_link'
        ])) OR (table_name='agent_action' AND column_name=ANY(ARRAY[
          'action_seq','source','chain_version','chain_key_id','chain_seq','chain_signature','chain_link'
        ])))
      ORDER BY table_name,column_name
    `);
    expect(columns.rows).toHaveLength(12);

    expect((await database.pool.query<{ value: string }>(
      "SELECT obs.audit_chain_epoch_microseconds('1970-01-01 00:00:00.000001+00') AS value",
    )).rows[0]?.value).toBe("1");
    expect((await database.pool.query<{ value: unknown }>(
      `SELECT obs.audit_chain_tag_jsonb_v1('{"b":2,"a":[true,null]}'::jsonb) AS value`,
    )).rows[0]?.value).toEqual(["o", [["a", ["a", ["b", true], ["n"]]], ["b", ["i", "2"]]]]);

    const absent = await database.pool.query(
      "SELECT * FROM obs.audit_chain_probe_action($1,$2::jsonb)",
      ["missing", JSON.stringify(["obs-agent-action-idempotency/v1", "first_party", "fixagent-daemon", "fixagent-daemon", "FIXAGENT_SKIPPED", null, null, ["o", []]])],
    );
    expect(absent.rows).toEqual([]);

    const source = await readFile(
      new URL("../../migrations/0064_fix09_audit_chain.sql", import.meta.url),
      "utf8",
    );
    expect(source).toContain("FIX09_DUPLICATE_ACTION_REF");
    expect(source).toContain("FIX09_CHAIN_MODE");
    expect(source).toContain("SET search_path = pg_catalog");
    expect(source).not.toMatch(/DELETE\s+FROM\s+obs\.(?:occurrence|agent_action)/iu);

    await database.pool.query("BEGIN");
    try {
      await expect(database.pool.query(`
        INSERT INTO obs.agent_action
          (writer_identity,actor,action_kind,action_ref,action_payload)
        VALUES ('fixagent-daemon','fixagent-daemon','TEST','rollback-test','{}')
      `)).resolves.toBeDefined();
    } finally {
      await database.pool.query("ROLLBACK");
    }
    expect((await database.pool.query(
      "SELECT 1 FROM obs.agent_action WHERE action_ref='rollback-test'",
    )).rowCount).toBe(0);
  });
});
