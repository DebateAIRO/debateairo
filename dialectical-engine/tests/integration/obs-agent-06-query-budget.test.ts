import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase | undefined;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const fixture = await import("../acceptance/obs-agent-06-fixture.js");
  await fixture.seedQueryBudget(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

describe("OBS-06 10x query budget", () => {
  it("loads exactly 220 runs, 210 work items and 210 provider calls", async () => {
    const result = await database!.pool.query<{ runs: string; work_items: string; providers: string }>(`
      SELECT count(DISTINCT run_id)::text AS runs,
             count(DISTINCT work_item_id)::text AS work_items,
             (SELECT count(*)::text FROM obs.provider_call_v) AS providers
      FROM obs.run_throughput_v
    `);
    expect(result.rows).toEqual([{ runs: "220", work_items: "210", providers: "210" }]);
  });

  it("keeps the three runtime definitions at or below 100 ms", async () => {
    const throughput = await import("../../apps/observation-agent/src/modules/throughput/queries.js");
    const provider = await import("../../apps/observation-agent/src/modules/provider-health/queries.js");
    const definitions = { ...throughput.THROUGHPUT_QUERY_DEFINITIONS,
      PROVIDER_FAILURE: provider.PROVIDER_FAILURE_SELECT };
    for (const [name, query] of Object.entries(definitions)) {
      const explained = await database!.pool.query<{ "QUERY PLAN": string }>(
        `EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON) ${query}`
      );
      const line = explained.rows.map((row) => row["QUERY PLAN"])
        .find((value) => value.startsWith("Execution Time:"));
      expect(line, name).toBeDefined();
      expect(Number(/Execution Time: ([0-9.]+) ms/u.exec(line!)?.[1]), name).toBeLessThanOrEqual(100);
    }
  });

  it("checks in the same three labelled SELECT definitions for V", async () => {
    expect(existsSync("tests/acceptance/obs-agent-06-query-budget.sql")).toBe(true);
    const sql = await readFile("tests/acceptance/obs-agent-06-query-budget.sql", "utf8");
    const throughput = await import("../../apps/observation-agent/src/modules/throughput/queries.js");
    const provider = await import("../../apps/observation-agent/src/modules/provider-health/queries.js");
    const definitions = { ...throughput.THROUGHPUT_QUERY_DEFINITIONS,
      PROVIDER_FAILURE: provider.PROVIDER_FAILURE_SELECT };
    for (const [name, query] of Object.entries(definitions)) {
      expect(sql).toContain(`\\echo 'OBS-06 ${name.replaceAll("_", " ")}'`);
      expect(sql).toContain(`EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)\n${query};`);
    }
  });
});
