import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = "apps/observation-agent/src/modules/postgres-capacity";

async function productionSource(): Promise<string> {
  const names = (await readdir(root)).filter((name) => name.endsWith(".ts")).sort();
  return (await Promise.all(names.map((name) => readFile(join(root, name), "utf8")))).join("\n");
}

describe("OBS-05 SQL privacy and resource boundary", () => {
  it("never selects or stores SQL text or a query fingerprint", async () => {
    const source = await productionSource();
    expect(source).not.toMatch(/\b(?:query|query_id)\b\s*(?:,|\bfrom\b)/iu);
    expect(source).not.toMatch(/pg_stat_activity[^;]*(?:\bquery\b|\bquery_id\b)/iu);
    expect(source).not.toMatch(/pg_stat_statements|fingerprint|statement_text|sql_text/iu);
  });

  it("uses the shared database port, transaction-local role, and no literal drill numerator", async () => {
    const source = await productionSource();
    expect(source).toContain("database: ObservationDatabasePort");
    expect(source).toContain("return database.withClient(async (client) => {");
    expect(source).not.toMatch(/new pg\.(?:Pool|Client)\s*\(/u);
    expect(source).toContain("SET LOCAL statement_timeout = 2000");
    expect(source).toContain("SET LOCAL ROLE pg_monitor");
    expect(source).not.toMatch(/(?:usedConnections|\bused\b)\s*[:=]\s*25\b/u);
    expect(source).not.toMatch(/25\s*\/\s*100/u);
  });

  it("binds both policy ages without embedding stale defaults in SQL", async () => {
    const source = await productionSource();
    expect(source.match(/\$1::double precision \* interval '1 second'/gu) ?? []).toHaveLength(2);
    expect(source.match(/\$2::double precision \* interval '1 second'/gu) ?? []).toHaveLength(2);
    expect(source).toContain("const parameters = postgresCapacityParameters(thresholds)");
    expect(source).toContain("client.query<CapacityRow>(POSTGRES_CAPACITY_SQL, parameters)");
    expect(source).not.toMatch(/interval '(?:60|120) seconds'/u);
  });

  it("contains read-only SELECTs and no product or infrastructure mutation", async () => {
    const source = await productionSource();
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/u);
    expect(source).not.toMatch(/docker|execFile|spawn|process\.kill|writeFile|unlink|rmSync/iu);
  });
});
