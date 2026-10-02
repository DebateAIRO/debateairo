import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRetentionPurge } from "../../apps/api/src/retention-purge.js";

function fakePool() {
  const queries: Array<Readonly<{ sql: string; values: readonly unknown[] }>> = [];
  return {
    queries,
    pool: {
      query: async (sql: string, values: readonly unknown[]) => {
        queries.push({ sql, values });
        return { rows: [{ purged: sql.includes("legal.") ? "2" : "5" }] };
      }
    }
  };
}

describe("P16c the retention purge (A15), in every mode", () => {
  it("calls both sanctioned purge functions with its clock and logs only the counts", async () => {
    const { queries, pool } = fakePool();
    const lines: string[] = [];
    const now = new Date("2027-01-02T03:00:00.000Z");
    const purge = createRetentionPurge({ pool: pool as never, clock: () => now, log: (line) => lines.push(line) });
    expect(await purge.run()).toEqual({ legal: 2, records: 5 });
    expect(queries).toEqual([
      { sql: "SELECT legal.purge_expired_acceptance($1::timestamptz) AS purged", values: [now] },
      { sql: "SELECT billing.purge_expired_records($1::timestamptz) AS purged", values: [now] }
    ]);
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ event: "retention.purged", legal: 2, records: 5 }]);
  });

  it("purges once per UTC year, from 2 January, whatever day the process started", async () => {
    const { queries, pool } = fakePool();
    let now = new Date("2027-01-01T12:00:00.000Z");
    const purge = createRetentionPurge({ pool: pool as never, clock: () => now, log: () => undefined });
    expect(await purge.runIfDue()).toBeNull();
    now = new Date("2027-01-02T00:00:00.000Z");
    expect(await purge.runIfDue()).toEqual({ legal: 2, records: 5 });
    now = new Date("2027-06-30T00:00:00.000Z");
    expect(await purge.runIfDue()).toBeNull();
    now = new Date("2028-01-01T23:59:59.000Z");
    expect(await purge.runIfDue()).toBeNull();
    now = new Date("2028-01-02T00:00:01.000Z");
    expect(await purge.runIfDue()).not.toBeNull();
    expect(queries).toHaveLength(4);
    // A process started mid-year purges at its first check.
    const later = createRetentionPurge({ pool: pool as never, clock: () => new Date("2028-07-15T00:00:00.000Z"), log: () => undefined });
    expect(await later.runIfDue()).not.toBeNull();
  });

  it("is wired in main.ts outside every billing branch, cleared on close", async () => {
    const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    // Top-level statements (no indentation): not inside the `billingConnectors === null ? … : …` composition.
    expect(source).toMatch(/^const retentionPurge = createRetentionPurge\(\{ pool,/mu);
    expect(source).toMatch(/^const retentionPurgeTimer=setInterval\(triggerRetentionPurge,86_400_000\);$/mu);
    expect(source).toMatch(/^api\.addHook\("onClose",async \(\) => clearInterval\(retentionPurgeTimer\)\);$/mu);
    expect(source).toMatch(/^triggerRetentionPurge\(\);$/mu);
  });
});
