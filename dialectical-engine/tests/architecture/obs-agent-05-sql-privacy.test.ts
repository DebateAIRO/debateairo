import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = "apps/observation-agent/src/modules/postgres-capacity";
// V-29: the statistics window the probe reads through (it replaced pg_monitor).
const windowMigration = "migrations/0068_observation_stats_window.sql";

async function productionSource(): Promise<string> {
  const names = (await readdir(root)).filter((name) => name.endsWith(".ts")).sort();
  return (await Promise.all(names.map((name) => readFile(join(root, name), "utf8")))).join("\n");
}

// The body of obs.postgres_capacity(...) — the only SQL that touches pg_stat_activity.
async function windowFunctionBody(): Promise<string> {
  const source = await readFile(windowMigration, "utf8");
  const match = source.match(/CREATE OR REPLACE FUNCTION obs\.postgres_capacity\([\s\S]*?AS \$capacity\$([\s\S]*?)\$capacity\$;/u);
  expect(match, "0068 must define obs.postgres_capacity with a $capacity$ body").not.toBeNull();
  return match![1]!;
}

describe("OBS-05 SQL privacy and resource boundary", () => {
  it("never selects or stores SQL text or a query fingerprint", async () => {
    const source = await productionSource();
    expect(source).not.toMatch(/\b(?:query|query_id)\b\s*(?:,|\bfrom\b)/iu);
    expect(source).not.toMatch(/pg_stat_activity[^;]*(?:\bquery\b|\bquery_id\b)/iu);
    expect(source).not.toMatch(/pg_stat_statements|fingerprint|statement_text|sql_text/iu);
    const body = await windowFunctionBody();
    expect(body).toContain("FROM pg_catalog.pg_stat_activity");
    expect(body).not.toMatch(/\b(?:query|query_id)\b\s*(?:,|\bfrom\b)/iu);
    expect(body).not.toMatch(/pg_stat_activity[^;]*(?:\bquery\b|\bquery_id\b)/iu);
    expect(body).not.toMatch(/pg_stat_statements|fingerprint|statement_text|sql_text/iu);
  });

  it("uses the shared database port, the V-29 window, no role switch, and no literal drill numerator", async () => {
    const source = await productionSource();
    expect(source).toContain("database: ObservationDatabasePort");
    expect(source).toContain("return database.withClient(async (client) => {");
    expect(source).not.toMatch(/new pg\.(?:Pool|Client)\s*\(/u);
    expect(source).toContain("SET LOCAL statement_timeout = 2000");
    // V-29 supersedes the old `SET LOCAL ROLE pg_monitor` pin: the probe now reads only
    // the definer-owned window and never switches role or touches pg_stat_activity.
    expect(source).toContain(
      "FROM obs.postgres_capacity($1::double precision,$2::double precision)"
    );
    expect(source).not.toMatch(/\bSET\s+(?:LOCAL\s+)?ROLE\b/iu);
    expect(source).not.toMatch(/pg_monitor|pg_read_all_stats|pg_stat_activity/u);
    expect(source).not.toMatch(/(?:usedConnections|\bused\b)\s*[:=]\s*25\b/u);
    expect(source).not.toMatch(/25\s*\/\s*100/u);
  });

  it("binds both policy ages without embedding stale defaults in SQL", async () => {
    const source = await productionSource();
    const body = await windowFunctionBody();
    expect(body.match(/lock_wait_seconds \* interval '1 second'/gu) ?? []).toHaveLength(2);
    expect(body.match(/idle_in_transaction_seconds \* interval '1 second'/gu) ?? []).toHaveLength(2);
    expect(body).not.toMatch(/interval '(?:60|120) seconds'/u);
    expect(body).not.toMatch(/\b(?:60|120)\s*\*\s*interval/u);
    expect(source).toContain("const parameters = postgresCapacityParameters(thresholds)");
    expect(source).toContain("client.query<CapacityRow>(POSTGRES_CAPACITY_SQL, parameters)");
    expect(source).not.toMatch(/interval '(?:60|120) seconds'/u);
  });

  it("contains read-only SELECTs and no product or infrastructure mutation", async () => {
    const source = await productionSource();
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/u);
    expect(source).not.toMatch(/docker|execFile|spawn|process\.kill|writeFile|unlink|rmSync/iu);
    const body = await windowFunctionBody();
    expect(body.trim()).toMatch(/^WITH activity AS MATERIALIZED \(/u);
    expect(body).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|SET|GRANT)\b/u);
  });
});
