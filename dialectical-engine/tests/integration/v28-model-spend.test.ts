import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { CostEnvelopeGuard, PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { RunRepository } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * V-28 (DL4-F2) — THE DATABASE HALF OF THE SPENDING CEILING.
 *
 * It needs no Docker: `startTestDatabase` starts the embedded PostgreSQL every
 * integration suite uses. Written with the rest of task 11, it first ran on
 * 2026-09-23 (SYNC3-C). Its one repair was the run helper below, whose cast
 * had hidden three values `core.run` refuses. The surface is also exercised in
 * `tests/unit/v28-model-spend-ledger.test.ts`, against the same
 * `CostEnvelopeGuard` over an in-memory `ModelSpendStore`; what only this file
 * proves is the SQL: that migration 0066 applies, that its CHECKs and its
 * append-only guards hold, and that `PostgresModelSpendStore`'s two sums return
 * what the unit fake returns.
 *
 * Nothing else in this package depends on it passing; everything above the seam
 * does not touch a database.
 *
 * The whole-run properties — a money refusal while the debate is argued (on a
 * second root, during expansion, on the first root's panel, on the author's
 * own first call) — are driven through the production runner in
 * `tests/integration/database.test.ts` ("Engine money rule M2 …"). Since the
 * engine money rule (spec §14.4.1, Task M2) such a stop ends the arguing only,
 * and the run still writes its answer. The `describe.skip` sketch that used to
 * close this file, a numbered contract for a harness nobody wired, was deleted
 * in the final review (Minor 9): those cases cover it.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  // I5: `migrate(database.pool)` — the suite's own pool, as every other
  // integration suite does. Round 1 opened a SECOND pool here and never closed
  // it, so the run leaked a connection pool per execution.
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

/**
 * I5 — A RUN CHARGE NEEDS A RUN THAT EXISTS.
 *
 * `ledger.model_spend.run_id` REFERENCES `core.run(run_id)`, so round 1's
 * invented uuids would have been refused 23503 on the first execution. Rather
 * than stand up the whole ask path, the two run-scoped cases below create the
 * minimum lawful `core.run` row through the repository that owns that shape.
 * If `startRun`'s signature has moved by the time this suite is first run, this
 * helper is the one thing to repair.
 */
/**
 * The minimum lawful `core.run` row, through the repository that owns its shape.
 * The legacy (unencrypted) principal is used deliberately: it is the one path
 * that needs no content cipher, no owner mapping and no provision pool.
 */
async function createLegacyRun(): Promise<string> {
  const runs = new RunRepository(database.pool);
  return runs.startRun({
    questionLine: "Is this spend row attributable?",
    principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date(),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    // Typed, not cast: an empty panel, scope "test" and tier "standard" all broke 0000 CHECKs.
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "test",
    askContract: {},
    batteryRows: []
  });
}

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

  it("stores the attempt a charge paid for, and NULL when the charge names none (model scorecard §2.3)", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const runId = await createLegacyRun();
    const attemptId = randomUUID();
    const linked = randomUUID();
    const unlinked = randomUUID();
    const charge = {
      spendSource: "RUN" as const, runId, providerRef: "provider-1", chargedOn: "2026-02-01",
      chargeMicros: 1, inputTokens: 1, outputTokens: 1
    };
    await store.recordSpend({ ...charge, spendId: linked, attemptId });
    await store.recordSpend({ ...charge, spendId: unlinked });
    const rows = await database.pool.query<{ spend_id: string; attempt_id: string | null }>(
      "SELECT spend_id::text, attempt_id::text FROM ledger.model_spend WHERE spend_id = ANY($1::uuid[])",
      [[linked, unlinked]]
    );
    expect(Object.fromEntries(rows.rows.map((row) => [row.spend_id, row.attempt_id])))
      .toEqual({ [linked]: attemptId, [unlinked]: null });
  });
});

describe("V-28 the persisted totals answer the two envelope questions", () => {
  it("sums one run's charges across vendors, and only that run's", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const today = costEnvelopeDay(new Date());
    const runId = await createLegacyRun();
    const otherRunId = await createLegacyRun();
    await database.pool.query(
      "INSERT INTO ledger.model_spend (spend_id,spend_source,run_id,provider_ref,charged_on,charge_micros,input_tokens,output_tokens) "
      + "VALUES ($1,'RUN',$2,'provider-1',$3::date,100,1,1),($4,'RUN',$2,'provider-2',$3::date,50,1,1),($5,'RUN',$6,'provider-1',$3::date,999,1,1)",
      [randomUUID(), runId, today, randomUUID(), randomUUID(), otherRunId]
    );

    expect(await store.readRunSpentMicros(runId)).toBe(150);
    expect(await store.readRunSpentMicros(otherRunId)).toBe(999);
  });

  it("refuses a charge against a run that does not exist", async () => {
    // The foreign key is the point: a charge must name a run the ledger holds,
    // or the per-run envelope would sum against a run nobody can audit.
    await expect(new PostgresModelSpendStore(database.pool).recordSpend({
      spendId: randomUUID(), spendSource: "RUN", runId: randomUUID(),
      providerRef: "provider-1", chargedOn: costEnvelopeDay(new Date()),
      chargeMicros: 1, inputTokens: 1, outputTokens: 1
    })).rejects.toThrowError(/violates foreign key constraint/u);
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

  /**
   * I1 — the property the in-memory suite can only approximate: that two
   * admissions running in two real backends actually serialise. The fake
   * serialises because it was written to; only Postgres can show that
   * `pg_advisory_xact_lock` does.
   */
  it("admits exactly one of two SIMULTANEOUS asks into a one-run day", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const day = "2026-03-03";
    const guard = new CostEnvelopeGuard({
      store,
      policy: { perRunCeilingMicros: 1_000, dailyCeilingMicros: 1_000 },
      clock: () => new Date(`${day}T09:00:00.000Z`)
    });

    const outcomes = await Promise.all([0, 1].map(() =>
      guard.assertDailyEnvelopeAdmitsNewRun().then(() => "ADMITTED", () => "REFUSED")));

    expect(outcomes.filter((outcome) => outcome === "ADMITTED")).toHaveLength(1);
    const reserved = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ledger.model_spend_reservation WHERE reserved_on = $1::date",
      [day]
    );
    expect(reserved.rows[0]?.count).toBe("1");
  });
});

/**
 * Engine money rule, Task M1 (spec 2026-09-26 §14.4.1, risk R12) — MIGRATION
 * 0075, the spend phase. The first paid runs must show what was spent while the
 * debate was argued apart from what was spent writing the answer, so every RUN
 * charge written from here on names its phase; SUPPORT and STORY charges carry
 * none, and the rows written before this file stay NULL.
 */
describe("M1 migration 0075 — ledger.model_spend.spend_phase", () => {
  const PRICE = { inputMicrosPerMillionTokens: 1_000_000, outputMicrosPerMillionTokens: 1_000_000 };
  const PROJECTION = { requestBytes: 800, completionTokenCeiling: 64 };

  async function phasesOf(runId: string): Promise<readonly (readonly [string, string | null])[]> {
    const rows = await database.pool.query<{ spend_source: string; spend_phase: string | null }>(
      `SELECT spend_source, spend_phase FROM ledger.model_spend
       WHERE run_id = $1 ORDER BY recorded_at, spend_source`,
      [runId]
    );
    return rows.rows.map((row) => [row.spend_source, row.spend_phase] as const);
  }

  it("adds a nullable text column", async () => {
    const column = await database.pool.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_schema='ledger' AND table_name='model_spend' AND column_name='spend_phase'`
    );
    expect(column.rows).toEqual([{ data_type: "text", is_nullable: "YES" }]);
  });

  it("records one BODY and one SERVE call as two RUN rows with their phases, and a STORY row with none", async () => {
    const runId = await createLegacyRun();
    const store = new PostgresModelSpendStore(database.pool);
    // This historical phase case records ordinary calls directly. The full
    // store now advertises INTERNAL reservation, whose settlement requires an
    // admitted frame; omit that optional capability only for this ordinary seam.
    const ordinaryStore = {
      recordSpend:store.recordSpend.bind(store),
      readRunSpentMicros:store.readRunSpentMicros.bind(store),
      readRunStorySpentMicros:store.readRunStorySpentMicros.bind(store),
      readDaySpentMicros:store.readDaySpentMicros.bind(store),
      admitNewRun:store.admitNewRun.bind(store)
    };
    const guard = new CostEnvelopeGuard({
      store:ordinaryStore,
      policy: {
        perRunCeilingMicros: 250_000, dailyCeilingMicros: 2_000_000,
        serveReserveBasisPoints: 3_000, serveOverrunBasisPoints: 2_000, perStoryCeilingMicros: 50_000
      }
    });
    const usage = { prompt_tokens: 10, completion_tokens: 5 };
    await guard.providerSeam({ runId, price: PRICE, requireReportedUsage: true, phase: "BODY" })
      .recordCall({ providerRef: "provider-1", usage, projection: PROJECTION });
    await guard.providerSeam({ runId, price: PRICE, requireReportedUsage: true, phase: "SERVE" })
      .recordCall({ providerRef: "provider-1", usage, projection: PROJECTION });
    await guard.storySeam({ runId, price: PRICE, requireReportedUsage: true })
      .recordCall({ providerRef: "provider-1", usage, projection: PROJECTION });

    expect([...await phasesOf(runId)].sort()).toEqual([
      ["RUN", "BODY"], ["RUN", "SERVE"], ["STORY", null]
    ]);
    // Both phases count toward the ONE run total; the story's charge does not.
    expect(await store.readRunSpentMicros(runId)).toBe(30);
  });

  it("keeps a row written without a phase (every row before this migration) as NULL", async () => {
    const runId = await createLegacyRun();
    await database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
       VALUES ($1,'RUN',$2,'provider-1',current_date,1,1,1)`,
      [randomUUID(), runId]
    );
    expect(await phasesOf(runId)).toEqual([["RUN", null]]);
  });

  it("refuses a phase outside BODY and SERVE, and a phase on a charge that is not a RUN charge", async () => {
    const runId = await createLegacyRun();
    await expect(database.pool.query(
      `INSERT INTO ledger.model_spend
         (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase)
       VALUES ($1,'RUN',$2,'provider-1',current_date,1,1,1,'PREPARE')`,
      [randomUUID(), runId]
    )).rejects.toThrowError(/model_spend_spend_phase_check/u);
    for (const [source, run] of [["STORY", runId], ["SUPPORT", null]] as const) {
      await expect(database.pool.query(
        `INSERT INTO ledger.model_spend
           (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase)
         VALUES ($1,$2,$3,'provider-1',current_date,1,1,1,'SERVE')`,
        [randomUUID(), source, run]
      ), source).rejects.toThrowError(/model_spend_phase_is_a_run_charge/u);
    }
  });

  it("refuses a phase on a non-RUN charge in the store too, before it reaches the database", async () => {
    await expect(new PostgresModelSpendStore(database.pool).recordSpend({
      spendId: randomUUID(), spendSource: "SUPPORT", runId: null, providerRef: "provider-1",
      chargedOn: costEnvelopeDay(new Date()), chargeMicros: 1, inputTokens: 1, outputTokens: 1,
      spendPhase: "BODY"
    })).rejects.toThrowError(expect.objectContaining({ code: "MODEL_SPEND_PHASE_NOT_A_RUN_CHARGE" }));
  });

  it("is replay-safe: applying the file's text again changes nothing and the table stays append-only", async () => {
    const sql = await readFile(
      new URL("../../migrations/0075_model_spend_phase.sql", import.meta.url), "utf8"
    );
    await database.pool.query(sql);
    const constraints = await database.pool.query<{ conname: string }>(
      `SELECT conname FROM pg_catalog.pg_constraint
       WHERE conrelid = 'ledger.model_spend'::regclass AND conname LIKE '%phase%' ORDER BY conname`
    );
    expect(constraints.rows.map((row) => row.conname))
      .toEqual(["model_spend_phase_is_a_run_charge", "model_spend_spend_phase_check"]);
    await expect(database.pool.query("UPDATE ledger.model_spend SET spend_phase = 'BODY'"))
      .rejects.toThrowError(/append-only or immutable table model_spend rejects UPDATE/u);
  });
});
