// tests/integration/obs-agent-dl7-f9-threshold-operator.test.ts
// DL7-F9: the observation daemon's own principal held INSERT on observation.threshold_policy —
// the table the daemon re-reads every cycle to decide what to alarm on — because
// `oactl thresholds apply` ran as that same principal. A credential stolen from the daemon could
// therefore re-rule its own monitor. Migration 0071 moves the write to a SECOND principal,
// `debateai_observation_threshold_operator`, and revokes the daemon's INSERT (its SELECT stays).
// Every assertion below runs CONNECTED AS the principal it is about; a superuser proves nothing.
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import {
  reloadThresholdPolicy,
  ThresholdRepository
} from "../../apps/observation-agent/src/oactl/core/thresholds.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const agentRole = "debateai_observation_agent";
const operatorRole = "debateai_observation_threshold_operator";
const agentPassword = "dl7-f9-agent-only";
const operatorPassword = "dl7-f9-operator-only";
const MIGRATION = "0071_observation_threshold_operator.sql";

const POLICY = {
  schema_version: 1,
  liveness: {
    probe_interval_ms: 5_000, probe_timeout_ms: 2_000,
    open_after_failures: 2, clear_after_successes: 2
  },
  notification: { rate_limit_ms: 600_000, degraded_after_ms: 900_000, timeout_ms: 2_000 },
  resources: {
    cpu_percent_max: 2, rss_mb_max: 150, max_database_sessions: 2, statement_timeout_ms: 2_000
  },
  routing: {
    INFRA_DOWN: "FATAL", INFRA_NOT_READY: "DEGRADED", INFRA_UNKNOWN: "SEVERE", AGENT_SELF: "SEVERE"
  }
} as const;

let database: TestDatabase | undefined;
let agentPool: pg.Pool;
let operatorPool: pg.Pool;

function fixture(): TestDatabase {
  expect(database, "the embedded database must start before assertions run").toBeDefined();
  return database!;
}

function urlFor(role: string, password: string): string {
  const url = new URL(fixture().connectionString);
  url.username = role;
  url.password = password;
  return url.toString();
}

async function sqlState(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
    return "RESOLVED";
  } catch (error) {
    return (error as { code?: string }).code ?? "NO_CODE";
  }
}

async function replayMigration(): Promise<string> {
  await fixture().pool.query(
    "DELETE FROM public.debateai_schema_migration WHERE name=$1", [MIGRATION]
  );
  try {
    await migrate(fixture().pool);
    return "APPLIED";
  } catch (error) {
    return (error as Error).message;
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`ALTER ROLE ${agentRole} PASSWORD '${agentPassword}'`);
  await database.pool.query(`ALTER ROLE ${operatorRole} PASSWORD '${operatorPassword}'`);
  agentPool = new pg.Pool({ connectionString: urlFor(agentRole, agentPassword), max: 1 });
  operatorPool = new pg.Pool({ connectionString: urlFor(operatorRole, operatorPassword), max: 1 });
  // Fixtures seed as the ADMIN: the first ratified version exists before any principal acts.
  await new ThresholdRepository(database.pool as unknown as pg.Pool).apply(POLICY, "DL7-F9-seed", "V");
}, 120_000);

afterAll(async () => {
  await agentPool?.end();
  await operatorPool?.end();
  await database?.stop();
});

describe("DL7-F9: the daemon can no longer re-rule its own monitor", () => {
  it("refuses the daemon's INSERT on observation.threshold_policy (42501) and keeps its SELECT", async () => {
    await expect(sqlState(() => agentPool.query(`
      INSERT INTO observation.threshold_policy(version,applied_at,ratified_by,source_ref,value_json)
      VALUES (99,clock_timestamp(),'daemon','DL7-F9-forged','{}'::jsonb)
    `))).resolves.toBe("42501");
    await expect(new ThresholdRepository(agentPool).apply(POLICY, "DL7-F9-daemon", "daemon"))
      .rejects.toMatchObject({ code: "42501" });
    await expect(agentPool.query("SELECT count(*)::int AS rows FROM observation.threshold_policy"))
      .resolves.toMatchObject({ rows: [{ rows: 1 }] });
  });

  it("lets `oactl thresholds apply` ratify a new version under the operator principal", async () => {
    const changed = { ...POLICY, notification: { ...POLICY.notification, rate_limit_ms: 300_000 } };
    await expect(new ThresholdRepository(operatorPool).apply(changed, "DL7-F9-operator", "V"))
      .resolves.toMatchObject({ version: 2, diff: ["notification.rate_limit_ms: 600000 -> 300000"] });
    await expect(operatorPool.query("SELECT current_user AS principal"))
      .resolves.toMatchObject({ rows: [{ principal: operatorRole }] });
  });

  it("the daemon still reads and reloads the version the operator ratified", async () => {
    const repository = new ThresholdRepository(agentPool);
    const current = await repository.readCurrent();
    expect(current.version).toBe(2);
    const reloaded = await reloadThresholdPolicy(repository, { ...current, version: 1 });
    expect(reloaded).toMatchObject({ version: 2, value: { notification: { rate_limit_ms: 300_000 } } });
  });

  it("gives the operator nothing but SELECT and INSERT on the one table, and no pg_* role", async () => {
    await expect(fixture().pool.query(`
      SELECT table_schema,table_name,privilege_type FROM information_schema.role_table_grants
      WHERE grantee='${operatorRole}' ORDER BY table_schema,table_name,privilege_type
    `)).resolves.toMatchObject({ rows: [
      { table_schema: "observation", table_name: "threshold_policy", privilege_type: "INSERT" },
      { table_schema: "observation", table_name: "threshold_policy", privilege_type: "SELECT" }
    ] });
    await expect(fixture().pool.query(`
      SELECT rolcanlogin,rolinherit,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,
        (SELECT count(*)::int FROM pg_catalog.pg_auth_members WHERE member=role.oid) AS memberships
      FROM pg_catalog.pg_roles AS role WHERE rolname='${operatorRole}'
    `)).resolves.toMatchObject({ rows: [{
      rolcanlogin: true, rolinherit: false, rolsuper: false, rolcreaterole: false,
      rolcreatedb: false, rolbypassrls: false, memberships: 0
    }] });
    // Rows stay immutable for the operator too: the reject_mutation triggers still hold.
    await expect(sqlState(() => operatorPool.query(
      "UPDATE observation.threshold_policy SET source_ref='overwrite' WHERE version=1"
    ))).resolves.not.toBe("RESOLVED");
  });

  it("applies 0071 replay-safely and refuses to finish while the daemon can still INSERT", async () => {
    expect(await replayMigration()).toBe("APPLIED");
    await fixture().pool.query("GRANT INSERT ON observation.threshold_policy TO PUBLIC");
    try {
      expect(await replayMigration()).toMatch(/^OBS_AGENT_THRESHOLD_INSERT_RETAINED/u);
    } finally {
      await fixture().pool.query("REVOKE INSERT ON observation.threshold_policy FROM PUBLIC");
    }
    expect(await replayMigration()).toBe("APPLIED");
    await expect(fixture().pool.query(`
      SELECT has_table_privilege('${agentRole}','observation.threshold_policy','INSERT') AS can_insert,
             has_table_privilege('${agentRole}','observation.threshold_policy','SELECT') AS can_select
    `)).resolves.toMatchObject({ rows: [{ can_insert: false, can_select: true }] });
  });
});
