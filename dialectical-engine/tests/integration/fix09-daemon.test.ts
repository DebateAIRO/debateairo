import { randomUUID } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate, obsIncident, obsOccurrence } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () => import("../../packages/kernel/src/index.js"));
vi.mock("@debateai/crypto", async () => import("../../packages/crypto/src/index.js"));
vi.mock("@debateai/db", async () => import("../../packages/db/src/index.js"));
vi.mock("@debateai/register", async () => import("../../packages/register/src/index.js"));

const WRITER_PASSWORD = "fix09-writer-test";
const LISTENER_PASSWORD = "fix09-listener-test";
let database: TestDatabase;

function roleUrl(role: string, password: string): string {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

async function insertIncident(fingerprint: string, version: number): Promise<void> {
  await database.pool.query(`
    INSERT INTO obs.incident (
      fingerprint, fingerprint_version, first_seen_at, last_seen_at,
      distinct_work_unit_count, max_severity, state, source_set
    ) VALUES ($1, $2, now(), now(), 1, 'INFO', 'NEW', '["first_party"]'::jsonb)
  `, [fingerprint, version]);
}

async function insertWriterOccurrence(client: pg.Client, sourceEventRef: string): Promise<bigint> {
  const result = await client.query<{ occ_seq: string }>(`
    INSERT INTO obs.occurrence (
      occurred_at, environment, build_ref, build_dirty, runtime, component, capture_point,
      code, taxonomy_class, severity, disposition, fingerprint, fingerprint_version,
      redaction_policy_version, allowlist_set_id, capture_status, run_ref, work_item_ref,
      node_ref, attempt_ref, ledger_ref, parent_occurrence_ref, at_seq_watermark,
      frames, safe_template_id, source, source_event_ref, writer_identity
    ) VALUES (
      now(), 'test', 'build:test', false, 'listener', '{"package":"test","call_site_key":"test"}'::jsonb,
      'self', 'CAPTURE_SELF_TEST', 'CAPTURE_SELF', 'INFO', 'RECORDED', $1, 1,
      'redaction:test', 'allowlist:test', 'PERSISTED', 'NOT_APPLICABLE', 'NOT_APPLICABLE',
      'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NO_CAUSE', 'NOT_APPLICABLE',
      '[]'::jsonb, 'template:test', 'first_party', $2, 'writer:test'
    ) RETURNING occ_seq::text
  `, [`fingerprint:${sourceEventRef}`, sourceEventRef]);
  return BigInt(result.rows[0]?.occ_seq ?? "0");
}

beforeAll(async () => {
  database = await startTestDatabase();
  await database.pool.query("SELECT set_config('debateai.obs_writer_password', $1, false)", [WRITER_PASSWORD]);
  await database.pool.query("SELECT set_config('debateai.obs_listener_password', $1, false)", [LISTENER_PASSWORD]);
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("FIX-09 C2 listener migration on real PostgreSQL", () => {
  it("uses composite incident identity with exact Drizzle parity", async () => {
    const fingerprint = `fix09:${randomUUID()}`;
    await insertIncident(fingerprint, 1);
    await insertIncident(fingerprint, 2);
    await expect(insertIncident(fingerprint, 1)).rejects.toMatchObject({ code: "23505" });

    const constraint = await database.pool.query<{ name: string; columns: string[] }>(`
      SELECT constraint_name AS name,
        array_agg(column_name::text ORDER BY ordinal_position)::text[] AS columns
      FROM information_schema.key_column_usage
      WHERE constraint_schema='obs' AND table_name='incident'
        AND constraint_name='incident_fingerprint_fingerprint_version_key'
      GROUP BY constraint_name
    `);
    expect(constraint.rows).toEqual([{
      name: "incident_fingerprint_fingerprint_version_key",
      columns: ["fingerprint", "fingerprint_version"]
    }]);

    expect(getTableConfig(obsIncident).uniqueConstraints.map((entry) => ({
      name: entry.getName(), columns: entry.columns.map((column) => column.name)
    }))).toContainEqual({
      name: "incident_fingerprint_fingerprint_version_key",
      columns: ["fingerprint", "fingerprint_version"]
    });
    expect(getTableConfig(obsOccurrence).columns.find((column) => column.name === "occ_seq")?.default)
      .toBeDefined();
  });

  it("publishes commit-aware wake hints without changing occurrence triggers or listener grants", async () => {
    const defaultResult = await database.pool.query<{ column_default: string }>(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema='obs' AND table_name='occurrence' AND column_name='occ_seq'
    `);
    expect(defaultResult.rows[0]?.column_default).toContain("obs.occurrence_seq_nextval_notify");

    const triggers = await database.pool.query<{ tgname: string }>(`
      SELECT tgname FROM pg_catalog.pg_trigger
      WHERE tgrelid='obs.occurrence'::regclass AND NOT tgisinternal ORDER BY tgname
    `);
    expect(triggers.rows.map((row) => row.tgname)).toEqual(["reject_mutation", "reject_truncate"]);

    const listenerGrants = await database.pool.query<{ privilege_type: string; table_name: string }>(`
      SELECT privilege_type, table_name FROM information_schema.role_table_grants
      WHERE grantee='debateai_obs_listener' AND table_schema='obs'
      ORDER BY table_name, privilege_type
    `);
    expect(listenerGrants.rows).toEqual(expect.arrayContaining([
      { table_name: "occurrence", privilege_type: "SELECT" },
      { table_name: "delivery", privilege_type: "INSERT" },
      { table_name: "agent_action", privilege_type: "INSERT" },
      { table_name: "incident", privilege_type: "INSERT" },
      { table_name: "consumer_cursor", privilege_type: "INSERT" },
      { table_name: "component_health", privilege_type: "INSERT" }
    ]));

    const writer = new pg.Client({ connectionString: roleUrl("debateai_obs_writer", WRITER_PASSWORD) });
    const listener = new pg.Client({ connectionString: roleUrl("debateai_obs_listener", LISTENER_PASSWORD) });
    await Promise.all([writer.connect(), listener.connect()]);
    const notifications: string[] = [];
    listener.on("notification", (message) => notifications.push(message.payload ?? ""));
    try {
      await listener.query("LISTEN obs_occurrence_inserted");
      await writer.query("BEGIN");
      const occSeq = await insertWriterOccurrence(writer, `migration:${randomUUID()}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(notifications).toEqual([]);
      await writer.query("COMMIT");
      await vi.waitFor(() => expect(notifications).toContain(occSeq.toString()));
      await expect(listener.query("SELECT obs.occurrence_seq_nextval_notify()"))
        .rejects.toMatchObject({ code: "42501" });
    } finally {
      await Promise.all([writer.end(), listener.end()]);
    }
  });
});
