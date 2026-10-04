import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, migrate } from "@debateai/db";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { recordingAudit } from "../support/billingSubscriptionFixtures.js";
import { OwnerJobs } from "../../apps/api/src/billing/owner-jobs.js";
import { createRetentionPurge } from "../../apps/api/src/retention-purge.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const rowsFor = async (kind: string) =>
  (await database.pool.query<{ ref: string }>("SELECT ref FROM billing.outbox WHERE kind=$1 ORDER BY ref", [kind])).rows.map((row) => row.ref);

describe("P16c scheduling on real PostgreSQL", () => {
  it("enqueues each quarter's summary exactly once, even after it has run", async () => {
    const billing = new BillingRepository(database.pool);
    const clock = { now: new Date("2027-01-03T12:00:00.000Z") };
    const owner = new OwnerJobs({
      billing, jobs: new BillingJobQueries(database.pool),
      taxAuthorities: taxAuthoritiesFromValue(TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, "test"),
      audit: recordingAudit(), clock: () => clock.now
    });
    expect(await owner.schedule()).toBe(1);
    expect(await owner.schedule()).toBe(0);
    expect(await rowsFor("OWNER_TAX_SUMMARY")).toEqual(["tax-summary:2026-Q4"]);
    const claimed = await billing.claim(["OWNER_TAX_SUMMARY"], 10, "p16c-test", new Date("2027-01-05T06:00:01.000Z"));
    for (const job of claimed) await billing.complete(job.jobId, new Date("2027-01-05T06:00:02.000Z"));
    expect(await owner.schedule()).toBe(0);
    clock.now = new Date("2027-04-02T00:00:00.000Z");
    expect(await owner.schedule()).toBe(1);
    expect(await rowsFor("OWNER_TAX_SUMMARY")).toEqual(["tax-summary:2026-Q4", "tax-summary:2027-Q1"]);
    expect(await rowsFor("RETENTION_PURGE")).toEqual([]);
  });

  it("purges as the API's own role, with no billing composed at all", async () => {
    // The main pool's principal (api-runtime: debateai_billing_runtime since 0093, which inherits debateai_runtime)
    // runs both functions; nothing of the billing runtime is needed.
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_billing_runtime");
      const counts = await createRetentionPurge({
        pool: client, clock: () => new Date(), log: () => undefined
      }).run();
      await client.query("COMMIT");
      expect(counts).toEqual({ legal: 0, records: 0 });
      // Go-live row 41: the role the runner and the liveness sweep hold cannot run billing's purge.
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_runtime");
      await expect(client.query("SELECT billing.purge_expired_records(clock_timestamp())"))
        .rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
});
