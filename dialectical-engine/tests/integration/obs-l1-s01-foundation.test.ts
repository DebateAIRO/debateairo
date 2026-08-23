import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createPool,
  migrate,
  obsOccurrence as indexObsOccurrence,
  obsSourceLink as indexObsSourceLink,
  type Pool
} from "../../packages/db/src/index.js";
import {
  obsOccurrence as directObsOccurrence,
  obsSourceLink as directObsSourceLink
} from "../../packages/db/src/obs-schema.js";
import {
  obsOccurrence as schemaObsOccurrence,
  obsSourceLink as schemaObsSourceLink
} from "../../packages/db/src/schema.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

vi.mock("@debateai/kernel", async () => import("../../packages/kernel/src/index.js"));
vi.mock("@debateai/crypto", async () => import("../../packages/crypto/src/index.js"));
vi.mock("@debateai/db", async () => import("../../packages/db/src/index.js"));
vi.mock("@debateai/register", async () => import("../../packages/register/src/index.js"));

let database: TestDatabase;

const OBS_TABLE_COLUMNS = {
  agent_action: [
    "agent_action_id", "prev_link", "writer_identity", "actor", "action_kind",
    "occurrence_id", "incident_id", "action_ref", "action_payload", "occurred_at"
  ],
  budget_usage: [
    "budget_usage_id", "component", "budget_kind", "amount", "window_started_at", "recorded_at"
  ],
  capture_gap: [
    "capture_gap_id", "source", "gap_class", "lost_count", "opened_at", "closed_at"
  ],
  component_health: ["component", "state", "observed_at", "detail_code", "updated_at"],
  consumer_cursor: ["consumer", "last_occ_seq", "updated_at"],
  delivery: [
    "delivery_id", "occurrence_id", "consumer", "attempt_index", "lease_ref",
    "delivery_status", "occurred_at"
  ],
  incident: [
    "incident_id", "fingerprint", "fingerprint_version", "first_seen_at", "last_seen_at",
    "distinct_work_unit_count", "max_severity", "state", "source_set", "cooldown_until",
    "attributed_landing_ref", "lineage_depth", "updated_at"
  ],
  occurrence: [
    "occurrence_id", "occ_seq", "prev_link", "occurred_at", "captured_at", "environment",
    "build_ref", "build_dirty", "runtime", "component", "capture_point", "code",
    "taxonomy_class", "severity", "condition_mark", "disposition", "fingerprint",
    "fingerprint_version", "redaction_policy_version", "allowlist_set_id",
    "fallback_minimized", "capture_status", "run_ref", "work_item_ref", "node_ref",
    "attempt_ref", "ledger_ref", "parent_occurrence_ref", "cause_relation",
    "at_seq_watermark", "frames", "safe_template_id", "template_parameters", "source",
    "source_event_ref", "zone_context", "attempt_index", "writer_identity"
  ],
  occurrence_detail: [
    "occurrence_detail_id", "occurrence_id", "normalized_frames", "cause_chain_codes",
    "template_parameters", "created_at"
  ],
  policy_decision: [
    "policy_decision_id", "occurrence_id", "policy_ref", "input_hash", "decision", "evaluated_at"
  ],
  source_link: [
    "source_link_id", "left_occurrence_id", "right_occurrence_id", "evidence", "linked_at"
  ],
  spool_receipt: [
    "spool_receipt_id", "source", "spool_ref", "occurrence_id", "reingested_at"
  ],
  trace: ["trace_id", "occurrence_id", "verdict", "evidence", "recorded_at"],
  zone_daily: ["zone_daily_id", "zone_code", "counter_date", "counter_kind", "delta", "recorded_at"]
} as const;

const APPEND_ONLY_KEYS = {
  occurrence: "occurrence_id",
  occurrence_detail: "occurrence_detail_id",
  delivery: "delivery_id",
  trace: "trace_id",
  agent_action: "agent_action_id",
  policy_decision: "policy_decision_id",
  budget_usage: "budget_usage_id",
  spool_receipt: "spool_receipt_id",
  capture_gap: "capture_gap_id",
  zone_daily: "zone_daily_id",
  source_link: "source_link_id"
} as const;

const MUTABLE_KEYS = {
  incident: "incident_id",
  consumer_cursor: "consumer",
  component_health: "component"
} as const;

const OBS_ROLES = [
  "debateai_obs_writer", "debateai_obs_listener", "debateai_obs_watchdog", "debateai_obs_human"
] as const;

type ObsRole = (typeof OBS_ROLES)[number];

const TEST_ROLE_PASSWORDS: Record<ObsRole, string> = {
  debateai_obs_writer: "writer-test-8c1db813-449a",
  debateai_obs_listener: "listener-test-54cb9f1f-22e1",
  debateai_obs_watchdog: "watchdog-test-c5eb8d40-ff7e",
  debateai_obs_human: "human-test-01ed66ce-9557"
};

const ROLE_PASSWORD_SETTINGS: Record<ObsRole, string> = {
  debateai_obs_writer: "debateai.obs_writer_password",
  debateai_obs_listener: "debateai.obs_listener_password",
  debateai_obs_watchdog: "debateai.obs_watchdog_password",
  debateai_obs_human: "debateai.obs_human_password"
};

function roleConnectionString(
  role: ObsRole,
  connectionString = database.connectionString,
  password = TEST_ROLE_PASSWORDS[role]
): string {
  const url = new URL(connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

function databaseIdentity(connectionString: string): string {
  const url = new URL(connectionString);
  return `${decodeURIComponent(url.username)}@${url.hostname}:${url.port}${url.pathname}`;
}

function assertSeparatedDatabaseIdentities(urls: Record<string, string>): void {
  const identities = Object.entries(urls).map(([name, url]) => [name, databaseIdentity(url)] as const);
  const seen = new Map<string, string>();
  for (const [name, identity] of identities) {
    const previous = seen.get(identity);
    if (previous !== undefined) throw new Error(`OBS_DATABASE_IDENTITY_REUSED:${previous}:${name}`);
    seen.set(identity, name);
  }
}

async function configureRolePasswords(pool: Pool): Promise<void> {
  for (const role of OBS_ROLES) {
    await pool.query("SELECT set_config($1, $2, false)", [
      ROLE_PASSWORD_SETTINGS[role],
      TEST_ROLE_PASSWORDS[role]
    ]);
  }
}

async function captureFailure(operation: () => Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await operation();
    throw new Error("EXPECTED_DATABASE_FAILURE");
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    if (failure.message === "EXPECTED_DATABASE_FAILURE") throw error;
    return {
      ...(failure.code === undefined ? {} : { code: failure.code }),
      ...(failure.message === undefined ? {} : { message: failure.message })
    };
  }
}

async function captureOutcome(operation: () => Promise<unknown>): Promise<
  | { status: "resolved" }
  | { status: "rejected"; code?: string; message?: string }
> {
  try {
    await operation();
    return { status: "resolved" };
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return {
      status: "rejected",
      ...(failure.code === undefined ? {} : { code: failure.code }),
      ...(failure.message === undefined ? {} : { message: failure.message })
    };
  }
}

async function roleLoginOutcome(
  role: ObsRole,
  connectionString: string,
  password = TEST_ROLE_PASSWORDS[role]
): Promise<{ currentUser: string } | { code?: string; message?: string }> {
  const pool = new pg.Pool({ connectionString: roleConnectionString(role, connectionString, password) });
  try {
    const result = await pool.query<{ current_user: string }>("SELECT current_user");
    return { currentUser: result.rows[0]?.current_user ?? "" };
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return {
      ...(failure.code === undefined ? {} : { code: failure.code }),
      ...(failure.message === undefined ? {} : { message: failure.message })
    };
  } finally {
    await pool.end();
  }
}

async function withRole<T>(role: ObsRole, operation: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = createPool(roleConnectionString(role));
  try {
    return await operation(pool);
  } finally {
    await pool.end();
  }
}

async function expectEffectiveRoleDenied(
  role: "debateai" | "pg_write_all_data",
  sql: string,
  code = "55000"
): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    await expect(client.query(sql)).rejects.toMatchObject({ code });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function insertOccurrence(pool: Pool, sourceEventRef: string): Promise<string | undefined> {
  const result = await pool.query<{ occurrence_id: string }>(`
    INSERT INTO obs.occurrence (
      occurred_at, environment, build_ref, build_dirty, runtime, component, capture_point,
      code, taxonomy_class, severity, disposition, fingerprint, fingerprint_version,
      redaction_policy_version, allowlist_set_id, capture_status, run_ref, work_item_ref,
      node_ref, attempt_ref, ledger_ref, parent_occurrence_ref, at_seq_watermark,
      safe_template_id, source, source_event_ref, writer_identity
    ) VALUES (
      now(), 'test', 'build:test', false, 'listener', '{"process":"test"}'::jsonb, 'self',
      'CAPTURE_SELF_TEST', 'CAPTURE_SELF', 'INFO', 'RECORDED', $1, 1,
      'redaction:test', 'allowlist:test', 'PERSISTED', 'NOT_APPLICABLE', 'NOT_APPLICABLE',
      'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NO_CAUSE', 'NOT_APPLICABLE',
      'template:test', 'first_party', $2, 'writer:test'
    )
    ON CONFLICT (source, source_event_ref) DO NOTHING
    RETURNING occurrence_id
  `, [`fingerprint:${sourceEventRef}`, sourceEventRef]);
  return result.rows[0]?.occurrence_id;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await configureRolePasswords(database.pool);
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("S01 obs store foundation on real PostgreSQL", () => {
  it("keeps the exact SQL/Drizzle manifest, constraints, linkage, and bigint precision", async () => {
    const columns = await database.pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'obs'
        AND table_name IN (
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'obs' AND table_type = 'BASE TABLE'
        )
      ORDER BY table_name, ordinal_position
    `);
    const actual = Object.fromEntries(Object.keys(OBS_TABLE_COLUMNS).map((table) => [
      table,
      columns.rows.filter((row) => row.table_name === table).map((row) => row.column_name)
    ]));

    expect([...new Set(columns.rows.map((row) => row.table_name))].sort())
      .toEqual(Object.keys(OBS_TABLE_COLUMNS).sort());
    expect(actual).toEqual(OBS_TABLE_COLUMNS);
    const allColumnNames = columns.rows.map((row) => row.column_name);
    expect(allColumnNames.filter((column) =>
      /(^|_)(message|body|prompt|response|question|claim|answer|free_text)(_|$)/.test(column)
    )).toEqual([]);
    expect(allColumnNames.filter((column) =>
      /(^|_)(asker|session|email|phone|ip|user_agent|pseudonym|user)(_|$)/.test(column)
    )).toEqual([]);

    expect(schemaObsOccurrence).toBe(directObsOccurrence);
    expect(indexObsOccurrence).toBe(directObsOccurrence);
    expect(schemaObsSourceLink).toBe(directObsSourceLink);
    expect(indexObsSourceLink).toBe(directObsSourceLink);

    const occurrenceConfig = getTableConfig(directObsOccurrence);
    const sourceLinkConfig = getTableConfig(directObsSourceLink);
    expect(occurrenceConfig.columns.map((column) => column.name))
      .toEqual(OBS_TABLE_COLUMNS.occurrence);
    expect(sourceLinkConfig.columns.map((column) => column.name))
      .toEqual(OBS_TABLE_COLUMNS.source_link);
    expect(occurrenceConfig.uniqueConstraints.map((constraint) => ({
      name: constraint.getName(),
      columns: constraint.columns.map((column) => column.name)
    }))).toContainEqual({
      name: "occurrence_source_source_event_ref_key",
      columns: ["source", "source_event_ref"]
    });
    expect(sourceLinkConfig.uniqueConstraints.map((constraint) => ({
      name: constraint.getName(),
      columns: constraint.columns.map((column) => column.name)
    }))).toContainEqual({
      name: "source_link_left_occurrence_id_right_occurrence_id_key",
      columns: ["left_occurrence_id", "right_occurrence_id"]
    });
    expect(sourceLinkConfig.checks.map((constraint) => constraint.name))
      .toContain("source_link_check");
    expect(directObsOccurrence.occSeq.mapFromDriverValue("9007199254740993"))
      .toBe(9007199254740993n);

    const constraints = await database.pool.query<{
      table_name: string;
      constraint_name: string;
      constraint_type: string;
      columns: string[];
    }>(`
      SELECT c.relname AS table_name, con.conname AS constraint_name,
        con.contype::text AS constraint_type,
        COALESCE(array_agg(a.attname ORDER BY key.ordinality)
          FILTER (WHERE a.attname IS NOT NULL), ARRAY[]::name[])::text[] AS columns
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = key.attnum
      WHERE n.nspname = 'obs'
        AND con.conname IN (
          'occurrence_source_source_event_ref_key',
          'source_link_left_occurrence_id_right_occurrence_id_key',
          'source_link_check'
        )
      GROUP BY c.relname, con.conname, con.contype
      ORDER BY c.relname, con.conname
    `);
    expect(constraints.rows).toEqual([
      {
        table_name: "occurrence",
        constraint_name: "occurrence_source_source_event_ref_key",
        constraint_type: "u",
        columns: ["source", "source_event_ref"]
      },
      {
        table_name: "source_link",
        constraint_name: "source_link_check",
        constraint_type: "c",
        columns: ["left_occurrence_id", "right_occurrence_id"]
      },
      {
        table_name: "source_link",
        constraint_name: "source_link_left_occurrence_id_right_occurrence_id_key",
        constraint_type: "u",
        columns: ["left_occurrence_id", "right_occurrence_id"]
      }
    ]);
  });

  it("provisions distinct credentials and falsifiably separates every real LOGIN connection", async () => {
    const roles = await database.pool.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolpassword: string | null;
    }>(`
      SELECT rolname, rolcanlogin, rolinherit, rolpassword
      FROM pg_authid
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname
    `, [OBS_ROLES]);
    expect(roles.rows.map(({ rolname, rolcanlogin, rolinherit }) => ({
      rolname, rolcanlogin, rolinherit
    }))).toEqual([...OBS_ROLES].sort().map((rolname) => ({
      rolname, rolcanlogin: true, rolinherit: false
    })));
    expect(roles.rows.every((role) => role.rolpassword?.startsWith("SCRAM-SHA-256$") === true)).toBe(true);
    expect(new Set(roles.rows.map((role) => role.rolpassword)).size).toBe(OBS_ROLES.length);

    const urls = Object.fromEntries(OBS_ROLES.map((role) => [role, roleConnectionString(role)]));
    const allUrls = { product: database.connectionString, ...urls };
    expect(() => assertSeparatedDatabaseIdentities(allUrls)).not.toThrow();
    expect(() => assertSeparatedDatabaseIdentities({
      ...allUrls,
      debateai_obs_listener: database.connectionString
    })).toThrow("OBS_DATABASE_IDENTITY_REUSED:product:debateai_obs_listener");
    expect(Object.values(urls).every((url) => url !== database.connectionString)).toBe(true);

    const identities = await Promise.all(OBS_ROLES.map((role) => withRole(role, async (pool) => {
      const result = await pool.query<{ current_user: string }>("SELECT current_user");
      return result.rows[0]?.current_user;
    })));
    expect(identities).toEqual(OBS_ROLES);

    await withRole("debateai_obs_listener", async (listener) => {
      const persistedCredentials = await listener.query<{ setting: string }>(`
        SELECT setting
        FROM pg_db_role_setting
        CROSS JOIN LATERAL unnest(setconfig) AS setting
        WHERE setting LIKE 'debateai.obs\\_%\\_password=%' ESCAPE '\\'
      `);
      expect(persistedCredentials.rows).toEqual([]);
    });

    const testSource = await readFile(new URL(import.meta.url), "utf8");
    expect(testSource).not.toContain(["ALTER", "ROLE"].join(" "));
  });

  it("migrates on a stock database with no deploy credential input", async () => {
    const fresh = await startTestDatabase();
    try {
      const cryptoFunctions = await fresh.pool.query<{ bytes: string | null; uuid: string | null }>(`
        SELECT
          to_regprocedure('gen_random_bytes(integer)')::text AS bytes,
          to_regprocedure('gen_random_uuid()')::text AS uuid
      `);
      expect(cryptoFunctions.rows).toEqual([{ bytes: null, uuid: "gen_random_uuid()" }]);

      await expect(migrate(fresh.pool)).resolves.toBeUndefined();

      const roles = await fresh.pool.query<{ rolname: string; rolpassword: string | null }>(`
        SELECT rolname, rolpassword
        FROM pg_authid
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname
      `, [OBS_ROLES]);
      expect(roles.rows.every((role) => role.rolpassword?.startsWith("SCRAM-SHA-256$") === true)).toBe(true);
      expect(new Set(roles.rows.map((role) => role.rolpassword)).size).toBe(OBS_ROLES.length);
      expect(await Promise.all(OBS_ROLES.map((role) => roleLoginOutcome(
        role,
        fresh.connectionString,
        `known-wrong-${role}`
      )))).toEqual(OBS_ROLES.map(() => expect.objectContaining({ code: "28P01" })));
    } finally {
      await fresh.stop();
    }
  }, 120_000);

  it("repairs pre-existing passwordless roles from session-only deploy input", async () => {
    const fresh = await startTestDatabase();
    try {
      for (const role of OBS_ROLES) {
        await fresh.pool.query(`
          CREATE ROLE ${role}
          LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
        `);
      }
      await configureRolePasswords(fresh.pool);
      await expect(migrate(fresh.pool)).resolves.toBeUndefined();

      const roles = await fresh.pool.query<{ rolname: string; rolpassword: string | null }>(`
        SELECT rolname, rolpassword
        FROM pg_authid
        WHERE rolname = ANY($1::text[])
        ORDER BY rolname
      `, [OBS_ROLES]);
      const logins = await Promise.all(OBS_ROLES.map((role) => roleLoginOutcome(role, fresh.connectionString)));
      expect({
        credentials: roles.rows.map((role) => ({
          rolname: role.rolname,
          hasScramCredential: role.rolpassword?.startsWith("SCRAM-SHA-256$") === true
        })),
        logins
      }).toEqual({
        credentials: [...OBS_ROLES].sort().map((rolname) => ({ rolname, hasScramCredential: true })),
        logins: OBS_ROLES.map((currentUser) => ({ currentUser }))
      });
    } finally {
      await fresh.stop();
    }
  }, 120_000);

  it("uses the writer LOGIN for canonical dedup, RETURNING, detail linkage, and chain-head recovery", async () => {
    const sequence = await database.pool.query<{ column_default: string | null }>(`
      SELECT column_default FROM information_schema.columns
      WHERE table_schema = 'obs' AND table_name = 'occurrence' AND column_name = 'occ_seq'
    `);
    expect(sequence.rows[0]?.column_default).toContain("obs.occurrence_seq");
    expect(sequence.rows[0]?.column_default).not.toContain("ledger");

    await withRole("debateai_obs_writer", async (writer) => {
      const sourceEventRef = `writer:${randomUUID()}`;
      const occurrenceId = await insertOccurrence(writer, sourceEventRef);
      expect(occurrenceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(await insertOccurrence(writer, sourceEventRef)).toBeUndefined();

      await expect(writer.query(`
        INSERT INTO obs.occurrence_detail (
          occurrence_id, normalized_frames, cause_chain_codes, template_parameters
        ) VALUES ($1, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb)
      `, [occurrenceId])).resolves.toMatchObject({ rowCount: 1 });

      const chainHead = await writer.query<{
        occurrence_id: string;
        occ_seq: string;
        prev_link: Buffer | null;
        writer_identity: string;
      }>(`
        SELECT occurrence_id, occ_seq::text, prev_link, writer_identity
        FROM obs.occurrence
        WHERE source = 'first_party' AND source_event_ref = $1
      `, [sourceEventRef]);
      expect(chainHead.rows).toEqual([{
        occurrence_id: occurrenceId,
        occ_seq: expect.stringMatching(/^[1-9][0-9]*$/),
        prev_link: null,
        writer_identity: "writer:test"
      }]);
      await expect(writer.query("SELECT code, fingerprint FROM obs.occurrence LIMIT 1"))
        .rejects.toMatchObject({ code: "42501" });
    });
  });

  it("rejects every append-only mutation at statement level and keeps occurrence as the TRUNCATE target", async () => {
    const triggers = await database.pool.query<{
      table_name: string;
      trigger_name: string;
      is_row: boolean;
      is_before: boolean;
      on_delete: boolean;
      on_update: boolean;
      on_truncate: boolean;
    }>(`
      SELECT c.relname AS table_name, t.tgname AS trigger_name,
        (t.tgtype & 1) = 1 AS is_row,
        (t.tgtype & 2) = 2 AS is_before,
        (t.tgtype & 8) = 8 AS on_delete,
        (t.tgtype & 16) = 16 AS on_update,
        (t.tgtype & 32) = 32 AS on_truncate
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'obs' AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    `);
    for (const table of Object.keys(APPEND_ONLY_KEYS)) {
      expect(triggers.rows.filter((trigger) => trigger.table_name === table)).toEqual([
        {
          table_name: table,
          trigger_name: "reject_mutation",
          is_row: false,
          is_before: true,
          on_delete: true,
          on_update: true,
          on_truncate: false
        },
        {
          table_name: table,
          trigger_name: "reject_truncate",
          is_row: false,
          is_before: true,
          on_delete: false,
          on_update: false,
          on_truncate: true
        }
      ]);
      const key = APPEND_ONLY_KEYS[table as keyof typeof APPEND_ONLY_KEYS];
      await expect(database.pool.query(`UPDATE obs.${table} SET ${key} = ${key} WHERE false`))
        .rejects.toMatchObject({ code: "55000" });
      await expect(database.pool.query(`DELETE FROM obs.${table} WHERE false`))
        .rejects.toMatchObject({ code: "55000" });
      await expect(database.pool.query(`TRUNCATE obs.${table} CASCADE`))
        .rejects.toMatchObject({ code: "55000" });
    }

    await expect(database.pool.query("TRUNCATE obs.occurrence"))
      .rejects.toMatchObject({ code: "0A000" });
    await expect(database.pool.query("TRUNCATE obs.occurrence CASCADE"))
      .rejects.toMatchObject({ code: "55000" });
  });

  it("protects every mutable relation from DELETE/TRUNCATE, including zero-row and effective-role attacks", async () => {
    const triggers = await database.pool.query<{
      table_name: string;
      trigger_name: string;
      is_row: boolean;
      on_delete: boolean;
      on_update: boolean;
      on_truncate: boolean;
    }>(`
      SELECT c.relname AS table_name, t.tgname AS trigger_name,
        (t.tgtype & 1) = 1 AS is_row,
        (t.tgtype & 8) = 8 AS on_delete,
        (t.tgtype & 16) = 16 AS on_update,
        (t.tgtype & 32) = 32 AS on_truncate
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'obs' AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    `);
    for (const table of Object.keys(MUTABLE_KEYS)) {
      expect(triggers.rows.filter((trigger) => trigger.table_name === table)).toEqual([
        {
          table_name: table,
          trigger_name: "reject_delete",
          is_row: false,
          on_delete: true,
          on_update: false,
          on_truncate: false
        },
        {
          table_name: table,
          trigger_name: "reject_truncate",
          is_row: false,
          on_delete: false,
          on_update: false,
          on_truncate: true
        }
      ]);
      const key = MUTABLE_KEYS[table as keyof typeof MUTABLE_KEYS];
      await expect(database.pool.query(`UPDATE obs.${table} SET ${key} = ${key} WHERE false`))
        .resolves.toMatchObject({ rowCount: 0 });
      await expect(database.pool.query(`DELETE FROM obs.${table} WHERE false`))
        .rejects.toMatchObject({ code: "55000" });
      await expect(database.pool.query(`TRUNCATE obs.${table} CASCADE`))
        .rejects.toMatchObject({ code: "55000" });
    }

    const effective = await database.pool.query<{
      table_name: string;
      privilege_type: string;
      roles: string[];
    }>(`
      SELECT c.relname AS table_name, privilege.privilege_type,
        array_agg(r.rolname ORDER BY r.rolname)::text[] AS roles
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN pg_roles r
      CROSS JOIN (VALUES ('DELETE'), ('TRUNCATE')) AS privilege(privilege_type)
      WHERE n.nspname = 'obs' AND c.relkind = 'r'
        AND has_table_privilege(r.rolname, c.oid, privilege.privilege_type)
      GROUP BY c.relname, privilege.privilege_type
      ORDER BY c.relname, privilege.privilege_type
    `);
    expect(effective.rows).toEqual(Object.keys(OBS_TABLE_COLUMNS).sort().flatMap((table_name) => [
      { table_name, privilege_type: "DELETE", roles: ["debateai", "pg_write_all_data"] },
      { table_name, privilege_type: "TRUNCATE", roles: ["debateai"] }
    ]));

    for (const table of Object.keys(OBS_TABLE_COLUMNS)) {
      await expectEffectiveRoleDenied("debateai", `DELETE FROM obs.${table} WHERE false`);
      await expectEffectiveRoleDenied("pg_write_all_data", `DELETE FROM obs.${table} WHERE false`);
      await expectEffectiveRoleDenied("debateai", `TRUNCATE obs.${table} CASCADE`);
      await expectEffectiveRoleDenied(
        "pg_write_all_data",
        `TRUNCATE obs.${table} CASCADE`,
        "42501"
      );
    }

    const obsRoleDestructive = await database.pool.query<{
      rolname: string;
      table_name: string;
      privilege_type: string;
    }>(`
      SELECT r.rolname, c.relname AS table_name, privilege.privilege_type
      FROM pg_roles r
      CROSS JOIN pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('DELETE'), ('TRUNCATE')) AS privilege(privilege_type)
      WHERE r.rolname = ANY($1::text[])
        AND n.nspname = 'obs' AND c.relkind IN ('r', 'p', 'v')
        AND has_table_privilege(r.rolname, c.oid, privilege.privilege_type)
      ORDER BY r.rolname, c.relname, privilege.privilege_type
    `, [OBS_ROLES]);
    expect(obsRoleDestructive.rows).toEqual([]);
  });

  it("makes the safe view the sole core.run chokepoint and serves actual rows through explicit grants", async () => {
    const protectedTargets = await database.pool.query<{ target: string; columns: string[] }>(`
      SELECT table_schema || '.' || table_name AS target,
        array_agg(column_name ORDER BY ordinal_position)::text[] AS columns
      FROM information_schema.columns
      WHERE (table_schema = 'core' AND table_name = 'run')
         OR (table_schema = 'identity' AND table_name = 'user')
      GROUP BY table_schema, table_name
      ORDER BY target
    `);
    expect(protectedTargets.rows.find((row) => row.target === "core.run")?.columns)
      .toEqual(expect.arrayContaining(["question_line", "asker_id", "session_id"]));
    expect(protectedTargets.rows.find((row) => row.target === "identity.user")?.columns)
      .toContain("user_id");

    const runId = randomUUID();
    await database.pool.query(`
      INSERT INTO core.run (
        run_id, question_line, asker_id, session_id, caller_scope, as_of,
        asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
        composition_budget_tier, depth_params, agent_count, discovered_panel,
        stranger_sample_rate, envelope_basis, register_version, battery_version,
        ask_contract, created_at_seq
      ) VALUES (
        $1, 'protected question', 'protected asker', 'protected session', 'ASKER', now(),
        'standard', 'standard', 'ASKER', 'tier:test', 'medium', '{}'::jsonb, 1, '[{}]'::jsonb,
        0, '{}'::jsonb, 7, 'battery:test', '{}'::jsonb, 900000001
      )
    `, [runId]);

    const viewOptions = await database.pool.query<{
      reloptions: string[] | null;
      view_owner: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(`
      SELECT c.reloptions, pg_get_userbyid(c.relowner) AS view_owner,
        r.rolcanlogin, r.rolsuper, r.rolbypassrls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_roles r ON r.oid = c.relowner
      WHERE n.nspname = 'obs' AND c.relname = 'run_correlation_v'
    `);

    const viewGrants = await database.pool.query<{ grantee: string }>(`
      SELECT grantee
      FROM information_schema.role_table_grants
      WHERE table_schema = 'obs' AND table_name = 'run_correlation_v'
        AND privilege_type = 'SELECT' AND grantee LIKE 'debateai_obs_%'
      ORDER BY grantee
    `);
    expect(viewGrants.rows.map((row) => row.grantee)).toEqual([
      "debateai_obs_human", "debateai_obs_listener", "debateai_obs_view_owner",
      "debateai_obs_watchdog"
    ]);

    await withRole("debateai_obs_listener", async (listener) => {
      const viewRow = await listener.query<{
        run_id: string;
        created_at_seq: string;
        register_version: string;
        battery_version: string;
        risk_tier: string;
      }>(`
        SELECT run_id, created_at_seq::text, register_version::text, battery_version, risk_tier
        FROM obs.run_correlation_v WHERE run_id = $1
      `, [runId]);
      expect(viewRow.rows).toEqual([{
        run_id: runId,
        created_at_seq: "900000001",
        register_version: "7",
        battery_version: "battery:test",
        risk_tier: "standard"
      }]);

      const directCore = await captureOutcome(() => listener.query(
        `SELECT run_id, created_at_seq, register_version, battery_version, risk_tier
         FROM core.run WHERE run_id = $1`,
        [runId]
      ));
      const safeCoreReads = await database.pool.query<{ grantee: string; columns: string[] }>(`
        SELECT grantee, array_agg(column_name ORDER BY column_name)::text[] AS columns
        FROM information_schema.column_privileges
        WHERE table_schema = 'core' AND table_name = 'run'
          AND privilege_type = 'SELECT' AND grantee LIKE 'debateai_obs_%'
        GROUP BY grantee
        ORDER BY grantee
      `);
      expect({
        view: {
          ...viewOptions.rows[0],
          reloptions: viewOptions.rows[0]?.reloptions?.sort()
        },
        directCore,
        safeCoreReads: safeCoreReads.rows
      }).toEqual({
        view: {
          reloptions: ["security_barrier=true", "security_invoker=false"],
          view_owner: "debateai_obs_view_owner",
          rolcanlogin: false,
          rolsuper: false,
          rolbypassrls: false
        },
        directCore: {
          status: "rejected",
          code: "42501",
          message: "permission denied for table run"
        },
        safeCoreReads: [{
          grantee: "debateai_obs_view_owner",
          columns: ["battery_version", "created_at_seq", "register_version", "risk_tier", "run_id"]
        }]
      });

      expect(await captureFailure(() => listener.query(
        "SELECT question_line, asker_id, session_id FROM core.run LIMIT 0"
      ))).toEqual({ code: "42501", message: "permission denied for table run" });
      expect(await captureFailure(() => listener.query(
        "SELECT bogus_column FROM core.bogus_table LIMIT 0"
      ))).toEqual({ code: "42P01", message: "relation \"core.bogus_table\" does not exist" });
      expect(await captureFailure(() => listener.query(
        "SELECT * FROM obs.occurrence_detail LIMIT 0"
      ))).toEqual({ code: "42501", message: "permission denied for table occurrence_detail" });
    });
  });

  it("keeps every obs role outside identity and makes real and bogus targets equally opaque", async () => {
    const schemaPrivileges = await database.pool.query<{
      rolname: string;
      has_identity_usage: boolean;
    }>(`
      SELECT rolname, has_schema_privilege(rolname, 'identity', 'USAGE') AS has_identity_usage
      FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname
    `, [OBS_ROLES]);
    const identityOutcomes = await withRole("debateai_obs_listener", async (listener) => Promise.all([
      captureOutcome(() => listener.query('SELECT user_id FROM identity."user" LIMIT 0')),
      captureOutcome(() => listener.query("SELECT * FROM identity.no_such_table LIMIT 0"))
    ]));
    expect({ schemaPrivileges: schemaPrivileges.rows, identityOutcomes }).toEqual({
      schemaPrivileges: [...OBS_ROLES].sort().map((rolname) => ({
        rolname,
        has_identity_usage: false
      })),
      identityOutcomes: [
        { status: "rejected", code: "42501", message: "permission denied for schema identity" },
        { status: "rejected", code: "42501", message: "permission denied for schema identity" }
      ]
    });
  });

  it("keeps the exact least-privilege insert/read matrix and explicitly tests human detail access", async () => {
    const inserts = await database.pool.query<{ grantee: string; tables: string[] }>(`
      SELECT grantee, array_agg(table_name ORDER BY table_name)::text[] AS tables
      FROM information_schema.role_table_grants
      WHERE table_schema = 'obs' AND privilege_type = 'INSERT'
        AND grantee = ANY($1::text[])
      GROUP BY grantee
      ORDER BY grantee
    `, [OBS_ROLES]);
    expect(inserts.rows).toEqual([
      {
        grantee: "debateai_obs_listener",
        tables: [
          "agent_action", "budget_usage", "component_health", "consumer_cursor", "delivery",
          "incident", "policy_decision", "source_link", "trace"
        ]
      },
      {
        grantee: "debateai_obs_watchdog",
        tables: ["agent_action", "component_health"]
      },
      {
        grantee: "debateai_obs_writer",
        tables: ["capture_gap", "occurrence", "occurrence_detail", "spool_receipt", "zone_daily"]
      }
    ]);

    const writerReads = await database.pool.query<{ columns: string[] }>(`
      SELECT array_agg(column_name ORDER BY column_name)::text[] AS columns
      FROM information_schema.column_privileges
      WHERE table_schema = 'obs' AND table_name = 'occurrence'
        AND grantee = 'debateai_obs_writer' AND privilege_type = 'SELECT'
    `);
    expect(writerReads.rows).toEqual([{
      columns: ["occ_seq", "occurrence_id", "prev_link", "source", "source_event_ref", "writer_identity"]
    }]);

    const safeCoreReads = await database.pool.query<{ grantee: string; columns: string[] }>(`
      SELECT grantee, array_agg(column_name ORDER BY column_name)::text[] AS columns
      FROM information_schema.column_privileges
      WHERE table_schema = 'core' AND table_name = 'run'
        AND privilege_type = 'SELECT' AND grantee LIKE 'debateai_obs_%'
      GROUP BY grantee
      ORDER BY grantee
    `);
    const safeColumns = ["battery_version", "created_at_seq", "register_version", "risk_tier", "run_id"];
    expect(safeCoreReads.rows).toEqual([
      { grantee: "debateai_obs_view_owner", columns: safeColumns }
    ]);

    await withRole("debateai_obs_human", async (human) => {
      await expect(human.query("SELECT * FROM obs.occurrence_detail LIMIT 0"))
        .resolves.toBeDefined();
    });
  });

  it("handles reapply from another database and catches the cluster-global role creation race", async () => {
    await database.pool.query("CREATE DATABASE debateai_obs_reapply");
    const secondUrl = new URL(database.connectionString);
    secondUrl.pathname = "/debateai_obs_reapply";
    const second = createPool(secondUrl.toString());
    try {
      await configureRolePasswords(second);
      await expect(Promise.all([migrate(database.pool), migrate(second)]))
        .resolves.toEqual([undefined, undefined]);
      await expect(migrate(second)).resolves.toBeUndefined();
    } finally {
      await second.end();
    }

    const migration = await readFile(
      new URL("../../migrations/0034_obs_foundation.sql", import.meta.url),
      "utf8"
    );
    expect(migration).toMatch(/EXCEPTION WHEN duplicate_object OR unique_violation THEN/);
  });

  it("proves the mocked @debateai/db runtime import stays aligned with the direct DB exports", async () => {
    expect(import.meta.resolve("@debateai/db"))
      .toMatch(/\/packages\/db\/src\/index\.ts$/);
    const bareDb = await import("@debateai/db");
    expect(bareDb.obsOccurrence).toBe(directObsOccurrence);
    expect(bareDb.obsSourceLink).toBe(directObsSourceLink);
    expect(import.meta.resolve("../../packages/db/src/index.js"))
      .toMatch(/\/packages\/db\/src\/index\.js$/);
  });
});
