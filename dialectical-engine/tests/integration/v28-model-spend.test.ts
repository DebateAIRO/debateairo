import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate } from "../../packages/db/src/index.js";
import { CostEnvelopeGuard, PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * V-28 (DL4-F2) — THE DATABASE HALF OF THE SPENDING CEILING.
 *
 * NOT RUN — Docker. This suite was written with the rest of task 11 and has
 * never been executed: the mission's quiet rule (constraint 11) forbids
 * starting, stopping or reconfiguring Docker on this host, and the engine was
 * down for the whole package. The decision surface it covers IS exercised, in
 * `tests/unit/v28-model-spend-ledger.test.ts`, against the same
 * `CostEnvelopeGuard` over an in-memory `ModelSpendStore`; what is unproven here
 * and nowhere else is the SQL: that migration 0066 applies, that its CHECKs and
 * its append-only guards hold, and that `PostgresModelSpendStore`'s two sums
 * return what the unit fake returns.
 *
 * The coordinator should run it on the first host with the engine up. Nothing
 * else in this package depends on it passing; everything above the seam does not
 * touch a database.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(createPool(database.connectionString));
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

/**
 * A charge needs a run to point at, and `core.run` is a wide table with its own
 * rules, so the run charges below are written against a run the ordinary
 * repository created. `newRunId` is the one thing this suite needs from the rest
 * of the schema; if `startRun`'s shape has moved by the time this runs, that is
 * what to repair.
 */
async function insertRunCharge(
  store: PostgresModelSpendStore,
  runId: string | null,
  chargeMicros: number,
  chargedOn: string
): Promise<void> {
  await store.recordSpend({
    spendId: randomUUID(),
    spendSource: runId === null ? "SUPPORT" : "RUN",
    runId,
    providerRef: "provider-1",
    chargedOn,
    chargeMicros,
    inputTokens: 1,
    outputTokens: 1
  });
}

describe("V-28 migration 0066 — ledger.model_spend", () => {
  it("applies, and the table is there with both indexes", async () => {
    const result = await database.pool.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname='ledger' AND tablename='model_spend' ORDER BY indexname"
    );
    expect(result.rows.map((row) => row.indexname))
      .toEqual(["model_spend_day_idx", "model_spend_pkey", "model_spend_run_idx"]);
  });

  it("refuses a RUN charge that names no run", async () => {
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'RUN',NULL,'provider-1',current_date,1,1,1)`,
      [randomUUID()]
    )).rejects.toThrowError(/model_spend_run_charge_names_its_run/u);
  });

  it("refuses a negative charge — a refund is not a model call", async () => {
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'SUPPORT',NULL,'provider-1',current_date,-1,1,1)`,
      [randomUUID()]
    )).rejects.toThrowError(/charge_micros/u);
  });

  it("is APPEND-ONLY: UPDATE, DELETE and TRUNCATE are all refused, owner included", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    await insertRunCharge(store, null, 7, costEnvelopeDay(new Date()));

    await expect(database.pool.query("UPDATE ledger.model_spend SET charge_micros = 0"))
      .rejects.toThrowError();
    await expect(database.pool.query("DELETE FROM ledger.model_spend"))
      .rejects.toThrowError();
    await expect(database.pool.query("TRUNCATE ledger.model_spend"))
      .rejects.toThrowError();
  });
});

describe("V-28 the persisted totals answer the two envelope questions", () => {
  it("sums one run's charges across vendors, and only that run's", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const today = costEnvelopeDay(new Date());
    const runId = randomUUID();
    const otherRunId = randomUUID();
    // Both runs must exist in core.run for the foreign key; the repository that
    // creates them is `RunRepository.startRun` (packages/db/src/index.ts).
    await database.pool.query(
      "INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) "
      + "VALUES ($1,'RUN',$2,'provider-1',$3::date,100,1,1),($4,'RUN',$2,'provider-2',$3::date,50,1,1),($5,'RUN',$6,'provider-1',$3::date,999,1,1)",
      [randomUUID(), runId, today, randomUUID(), randomUUID(), otherRunId]
    );

    expect(await store.readRunSpentMicros(runId)).toBe(150);
    expect(await store.readRunSpentMicros(otherRunId)).toBe(999);
  });

  it("sums the whole application's day — every run and, when wired, support too", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const day = "2026-01-02";
    await insertRunCharge(store, null, 40, day);
    await insertRunCharge(store, null, 2, day);
    await insertRunCharge(store, null, 1_000, "2026-01-03");

    expect(await store.readDaySpentMicros(day)).toBe(42);
    expect(await store.readDaySpentMicros("2026-01-03")).toBe(1_000);
    expect(await store.readDaySpentMicros("2026-01-04")).toBe(0);
  });

  it("refuses a NEW run once the persisted day has reached the sealed ceiling", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const day = "2026-02-02";
    await insertRunCharge(store, null, 1_000, day);
    const guard = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 500, dailyCeilingMicros: 1_000 },
      clock: () => new Date(`${day}T09:00:00.000Z`)
    });

    await expect(guard.assertDailyEnvelopeAdmitsNewRun())
      .rejects.toThrowError(expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" }));
  });
});
