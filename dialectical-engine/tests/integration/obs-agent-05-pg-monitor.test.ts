import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { createObservationDatabasePort } from "../../apps/observation-agent/src/core/database.js";
import { readPostgresCapacity } from "../../apps/observation-agent/src/modules/postgres-capacity/query.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// V-29 (owner ruling 2026-09-22, finding DL5-F8). Migration 0059 made the agent's
// principal a member of `pg_monitor`, which lets it read every other session's
// statement text. Migration 0068 replaces that membership with one definer-owned
// function that returns only the aggregated numbers the capacity probe reads. Every
// database assertion below runs CONNECTED AS the agent's principal unless it says
// otherwise: a superuser session would see everything and prove nothing.

const legacyMigrationPath = resolve("migrations/0059_observation_pg_monitor.sql");
const windowMigrationPath = resolve("migrations/0068_observation_stats_window.sql");
const agentRole = "debateai_observation_agent";
const agentPassword = "v29-agent-only";
const statementMarker = "V29_OTHER_SESSION_STATEMENT_TEXT";
let database: TestDatabase | undefined;

function fixture(): TestDatabase {
  expect(database, "the embedded database must start before assertions run").toBeDefined();
  return database!;
}

function superuserClient(): pg.Client {
  return new pg.Client({ connectionString: fixture().connectionString });
}

function agentConnectionString(): string {
  const url = new URL(fixture().connectionString);
  url.username = agentRole;
  url.password = agentPassword;
  return url.toString();
}

function agentClient(): pg.Client {
  return new pg.Client({ connectionString: agentConnectionString() });
}

async function captureCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
    return "RESOLVED";
  } catch (error) {
    return (error as { code?: string }).code ?? "NO_CODE";
  }
}

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await check()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error("V29_TEST_CONDITION_NOT_REACHED");
}

// Three OTHER sessions (superuser-owned, so the agent could never see their details
// through ordinary same-role visibility): one holds a table lock inside an open
// transaction, one waits for that lock, and one sits idle inside a transaction whose
// last statement text carries a marker.
type OtherSessions = Readonly<{
  holder: pg.Client;
  waiter: pg.Client;
  idle: pg.Client;
  idlePid: number;
  waiting: Promise<unknown>;
  close(): Promise<void>;
}>;

async function openOtherSessions(): Promise<OtherSessions> {
  const holder = superuserClient();
  const waiter = superuserClient();
  const idle = superuserClient();
  await Promise.all([holder.connect(), waiter.connect(), idle.connect()]);
  await holder.query("BEGIN");
  await holder.query("LOCK TABLE public.v29_lock_target IN ACCESS EXCLUSIVE MODE");
  const waiting = waiter.query("SELECT count(*) FROM public.v29_lock_target");
  waiting.catch(() => undefined);
  await idle.query("BEGIN");
  await idle.query(`SELECT '${statementMarker}' AS marker`);
  const idlePid = (await idle.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
    .rows[0]!.pid;
  await idle.query(`SELECT '${statementMarker}' AS marker`);
  await waitUntil(async () => {
    const result = await fixture().pool.query<{ waiting: string }>(`
      SELECT count(*)::text AS waiting FROM pg_catalog.pg_stat_activity
      WHERE wait_event_type='Lock' AND query LIKE '%v29_lock_target%'
    `);
    return result.rows[0]?.waiting === "1";
  });
  return Object.freeze({
    holder,
    waiter,
    idle,
    idlePid,
    waiting,
    async close() {
      await holder.query("ROLLBACK").catch(() => undefined);
      await waiting.catch(() => undefined);
      await idle.query("ROLLBACK").catch(() => undefined);
      await Promise.all([holder.end(), waiter.end(), idle.end()]);
    }
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`ALTER ROLE ${agentRole} PASSWORD '${agentPassword}'`);
  await database.pool.query("CREATE DATABASE debateai");
  await database.pool.query("CREATE DATABASE hatchet");
  // Production does not hand every login CONNECT on these databases. Withdrawing the
  // PUBLIC default proves the two sizes come through the definer, not the caller.
  await database.pool.query("REVOKE CONNECT ON DATABASE debateai FROM PUBLIC");
  await database.pool.query("REVOKE CONNECT ON DATABASE hatchet FROM PUBLIC");
  await database.pool.query("CREATE TABLE public.v29_lock_target (id integer)");
}, 120_000);

afterAll(async () => {
  await database?.stop();
});

describe("OBS-05 V-29 statistics window replaces pg_monitor", () => {
  it("leaves the agent's principal in no predefined role and applies 0068 once, replay-safe", async () => {
    await expect(migrate(fixture().pool)).resolves.toBeUndefined();
    const predefinedMemberships = `
      SELECT coalesce(array_agg(granted.rolname ORDER BY granted.rolname), '{}')::text[] AS roles
      FROM pg_catalog.pg_roles AS granted
      WHERE granted.rolname LIKE 'pg\\_%'
        AND pg_has_role('${agentRole}', granted.oid, 'MEMBER')
    `;
    await expect(fixture().pool.query(predefinedMemberships))
      .resolves.toMatchObject({ rows: [{ roles: [] }] });
    await expect(fixture().pool.query(`
      SELECT name, count(*)::text AS applied FROM public.debateai_schema_migration
      WHERE name IN ('0059_observation_pg_monitor.sql','0068_observation_stats_window.sql')
      GROUP BY name ORDER BY name
    `)).resolves.toMatchObject({ rows: [
      { name: "0059_observation_pg_monitor.sql", applied: "1" },
      { name: "0068_observation_stats_window.sql", applied: "1" }
    ] });

    // Replay: forget 0068 in the ledger and apply it again over its own end state.
    await fixture().pool.query(
      "DELETE FROM public.debateai_schema_migration WHERE name='0068_observation_stats_window.sql'"
    );
    await expect(migrate(fixture().pool)).resolves.toBeUndefined();
    await expect(fixture().pool.query(predefinedMemberships))
      .resolves.toMatchObject({ rows: [{ roles: [] }] });
  });

  it("keeps every other agent grant, including INSERT on observation.threshold_policy", async () => {
    await expect(fixture().pool.query(`
      SELECT has_table_privilege('${agentRole}','observation.threshold_policy','INSERT') AS can_insert,
             has_table_privilege('${agentRole}','observation.threshold_policy','SELECT') AS can_select
    `)).resolves.toMatchObject({ rows: [{ can_insert: true, can_select: true }] });
    await expect(fixture().pool.query(`
      SELECT count(*)::text AS grants FROM information_schema.role_table_grants
      WHERE grantee='${agentRole}'
        AND table_schema NOT IN ('observation','obs')
    `)).resolves.toMatchObject({ rows: [{ grants: "0" }] });
  });

  it("exposes the window as one definer function executable by the agent alone", async () => {
    const result = await fixture().pool.query<{
      prosecdef: boolean;
      proconfig: string[];
      owner: string;
      owner_login: boolean;
      owner_super: boolean;
      owner_stats: string[];
      executors: string[];
      public_execute: boolean;
      columns: string[];
    }>(`
      SELECT proc.prosecdef, proc.proconfig, owner.rolname AS owner,
             owner.rolcanlogin AS owner_login, owner.rolsuper AS owner_super,
             ARRAY(
               SELECT granted.rolname FROM pg_catalog.pg_roles AS granted
               WHERE granted.rolname LIKE 'pg\\_%'
                 AND pg_has_role(owner.oid, granted.oid, 'USAGE')
               ORDER BY granted.rolname
             )::text[] AS owner_stats,
             ARRAY(
               SELECT caller.rolname FROM pg_catalog.pg_roles AS caller
               WHERE caller.oid <> owner.oid AND NOT caller.rolsuper
                 AND caller.rolname NOT LIKE 'pg\\_%'
                 AND has_function_privilege(caller.oid, proc.oid, 'EXECUTE')
               ORDER BY caller.rolname
             )::text[] AS executors,
             EXISTS (
               SELECT 1 FROM aclexplode(proc.proacl) AS entry
               WHERE entry.grantee = 0 AND entry.privilege_type = 'EXECUTE'
             ) AS public_execute,
             proc.proargnames AS columns
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner
      WHERE namespace.nspname = 'obs' AND proc.proname = 'postgres_capacity'
    `);
    expect(result.rows).toEqual([{
      prosecdef: true,
      proconfig: ["search_path=pg_catalog, pg_temp"],
      owner: "debateai_obs_stats_owner",
      owner_login: false,
      owner_super: false,
      owner_stats: ["pg_read_all_stats"],
      executors: [agentRole],
      public_execute: false,
      columns: [
        "lock_wait_seconds", "idle_in_transaction_seconds",
        "used_connections", "max_connections", "lock_waiters", "longest_lock_wait_seconds",
        "longest_transaction_age_seconds", "active_query_age_seconds",
        "idle_in_transaction_count", "idle_in_transaction_age_seconds",
        "debateai_database_bytes", "hatchet_database_bytes"
      ]
    }]);
  });

  it("denies the agent's principal every other backend's statement text", async () => {
    const others = await openOtherSessions();
    const agent = agentClient();
    await agent.connect();
    try {
      await expect(agent.query<{ query: string | null; state: string | null }>(`
        SELECT query, state FROM pg_catalog.pg_stat_activity WHERE pid=$1
      `, [others.idlePid])).resolves.toMatchObject({
        rows: [{ query: "<insufficient privilege>", state: null }]
      });
      await expect(agent.query<{ leaked: string }>(`
        SELECT count(*)::text AS leaked FROM pg_catalog.pg_stat_activity
        WHERE query LIKE '%${statementMarker.slice(0, 12)}%' AND pid <> pg_backend_pid()
      `)).resolves.toMatchObject({ rows: [{ leaked: "0" }] });
      // The old path: 0059 let the agent step into pg_monitor for its query.
      expect(await captureCode(() => agent.query("SET ROLE pg_monitor"))).toBe("42501");
      expect(await captureCode(() => agent.query("SET ROLE pg_read_all_stats"))).toBe("42501");
      // The window itself returns numbers only.
      const window = await agent.query("SELECT * FROM obs.postgres_capacity(0,0)");
      expect(window.rows).toHaveLength(1);
      for (const [column, value] of Object.entries(window.rows[0] as Record<string, unknown>)) {
        expect(typeof value, column).toBe("number");
      }
    } finally {
      await agent.end();
      await others.close();
    }
  });

  it("still counts OTHER sessions' states and both database sizes for the agent's health query", async () => {
    const others = await openOtherSessions();
    const pool = new pg.Pool({ connectionString: agentConnectionString(), max: 1 });
    try {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_200));
      const observedAt = new Date("2026-09-25T08:00:00.000Z");
      const result = await readPostgresCapacity(createObservationDatabasePort(pool), observedAt, {
        lockWaitSeconds: 1,
        idleInTransactionSeconds: 1
      });
      expect(result.observedAt).toEqual(observedAt);
      for (const [key, value] of Object.entries(result)) {
        if (key === "observedAt") continue;
        expect(value, key).toEqual(expect.any(Number));
        expect(Number.isFinite(value), key).toBe(true);
        expect(value, key).toBeGreaterThanOrEqual(0);
      }
      expect(result.maxConnections).toBe(100);
      expect(result.usedConnections).toBeGreaterThanOrEqual(4);
      expect(result.lockWaiters).toBe(1);
      expect(result.longestLockWaitSeconds).toBeGreaterThanOrEqual(1);
      expect(result.idleInTransactionCount).toBe(2);
      expect(result.idleInTransactionAgeSeconds).toBeGreaterThanOrEqual(1);
      expect(result.longestTransactionAgeSeconds).toBeGreaterThanOrEqual(1);
      expect(result.activeQueryAgeSeconds).toBeGreaterThanOrEqual(1);
      expect(result.debateaiDatabaseBytes).toBeGreaterThan(0);
      expect(result.hatchetDatabaseBytes).toBeGreaterThan(0);
    } finally {
      await pool.end();
      await others.close();
    }
  });

  it("proves why the window is a definer function and not a plain view", async () => {
    // pg_stat_get_activity() decides per row whether to reveal state and statement
    // text from the privileges of the CALLING user. A view is expanded as the caller,
    // so a view owned by the statistics owner still hides other sessions' state.
    await fixture().pool.query(`
      CREATE VIEW obs.v29_plain_activity_probe_v WITH (security_barrier = true) AS
      SELECT pid, state FROM pg_catalog.pg_stat_activity
    `);
    await fixture().pool.query(
      "ALTER VIEW obs.v29_plain_activity_probe_v OWNER TO debateai_obs_stats_owner"
    );
    await fixture().pool.query(`GRANT SELECT ON obs.v29_plain_activity_probe_v TO ${agentRole}`);
    const others = await openOtherSessions();
    const agent = agentClient();
    await agent.connect();
    try {
      await expect(agent.query(
        "SELECT state FROM obs.v29_plain_activity_probe_v WHERE pid=$1",
        [others.idlePid]
      )).resolves.toMatchObject({ rows: [{ state: null }] });
      const window = await agent.query<{ idle_in_transaction_count: number }>(
        "SELECT idle_in_transaction_count FROM obs.postgres_capacity(0,0)"
      );
      expect(window.rows[0]?.idle_in_transaction_count).toBe(2);
    } finally {
      await agent.end();
      await others.close();
      await fixture().pool.query("DROP VIEW obs.v29_plain_activity_probe_v");
    }
  });

  it("ships the window without enabling statement aggregation or re-granting a predefined role", async () => {
    const [legacy, window] = await Promise.all([
      readFile(legacyMigrationPath, "utf8"),
      readFile(windowMigrationPath, "utf8")
    ]);
    // 0059 is history and is never edited; 0068 supersedes it.
    expect(legacy).toContain("GRANT pg_monitor TO debateai_observation_agent");
    expect(window).toContain("REVOKE pg_monitor FROM debateai_observation_agent");
    expect(window).not.toMatch(/GRANT\s+pg_[a-z_]+\s+TO\s+debateai_observation_agent/iu);
    expect(window).not.toMatch(/pg_stat_statements|shared_preload_libraries|log_min_duration_statement/iu);
  });
});
