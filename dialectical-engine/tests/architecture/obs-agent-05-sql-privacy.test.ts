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

  it("uses one bounded session, the 2000 ms timeout, and no literal drill numerator", async () => {
    const source = await productionSource();
    expect(source).toContain("max: 1");
    expect(source).toContain("SET LOCAL statement_timeout = 2000");
    expect(source).not.toMatch(/(?:usedConnections|\bused\b)\s*[:=]\s*25\b/u);
    expect(source).not.toMatch(/25\s*\/\s*100/u);
  });

  it("contains read-only SELECTs and no product or infrastructure mutation", async () => {
    const source = await productionSource();
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b/u);
    expect(source).not.toMatch(/docker|execFile|spawn|process\.kill|writeFile|unlink|rmSync/iu);
  });
});
