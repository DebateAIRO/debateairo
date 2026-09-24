import { randomUUID } from "node:crypto";
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
 * RE-REVIEW: it also carries the two whole-run properties nothing else can
 * prove, both marked below — that a money refusal raised DURING EXPANSION (and
 * during root authoring at M=2) ends in the envelope terminal with the produced
 * components kept, rather than as a FAILED work item. The joints are unit-tested
 * (`expansionPhaseStop`, `reviewFailureOutcome`, `envelopeStopPendingAttempts`,
 * `isRunLevelSpendStop`) and the terminal they route into is unit-tested; what
 * only a real run shows is that the joints are wired into the loops that matter.
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
 * RE-REVIEW C1/C2(a) — THE WHOLE-RUN PROPERTY. **NOT RUN — an unwired sketch.**
 *
 * Sketched rather than finished on purpose: standing a run up to the point where
 * a second root is authored needs the runner's full settings object, a fake
 * provider panel and a seeded register, all of which the acceptance harness
 * already builds. The coordinator should wire this to that harness rather than
 * to a second, private copy of it — a private copy is how test doubles rot.
 *
 * WHAT MUST BE TRUE, written down so the assertion is not re-derived later:
 *
 *  1. M = 2. Root 0 is authored and panelled normally. The provider seam refuses
 *     `RUN_COST_ENVELOPE_MONEY_REACHED` on the FIRST call of root 1.
 *  2. The work item does NOT fail: `executeWorkItem` resolves.
 *  3. The run reaches `SERVE_CRASH_CLASSES.ENVELOPE_EXHAUSTED.terminal`, its
 *     condition marks include `ENVELOPE_EXHAUSTED`, and the condition-mark
 *     record's reason is `RUN_COST_ENVELOPE_MONEY_REACHED` — not
 *     `RUN_COST_ENVELOPE_EXHAUSTED`, which would send the operator to raise the
 *     wrong ceiling.
 *  4. Root 0's node is among the served node ids: the run KEPT what it produced.
 *  5. `ledger.model_spend` holds the charges for root 0's calls and nothing for
 *     the call that was refused before it was made.
 *
 *  6. The same, with the refusal raised during EXPANSION rather than root
 *     authoring, which is the case the temporary 0.25 USD ceiling actually
 *     produces on every run.
 *  7. The same, with `PROVIDER_USAGE_UNREPORTED`, whose reason must be its own
 *     code (ruling R2) and whose terminal must fire even though the run has
 *     attempts to spare (C3).
 *
 * ROUND 4 (rulings R-A / R-B), added to the contract above:
 *
 *  8. In case 1 no review ever ran (the review guard returns on a stop, and
 *     none may be re-opened), yet root 0 is NOT hidden: `ledger.node_review`
 *     holds no row for this run and the answer still serves root 0 — the
 *     spend-stopped run is projected on the single-maker footing (R-A). This
 *     is the property three rounds moved downstream and never closed; the
 *     pure decision is proven in `tests/unit/v28-spend-stopped-serve-decision.test.ts`
 *     and the wiring is pinned in `tests/architecture/v28-serve-decision-wiring.test.ts`,
 *     so what this case adds is the run through the real pool.
 *  9. In case 1 the answer's condition marks include `SINGLE-LINEAGE`, with a
 *     persisted record whose reason is `RUN_COST_ENVELOPE_MONEY_REACHED` (case 7:
 *     `PROVIDER_USAGE_UNREPORTED`) — never `MONO_MAKER_RUN` — and no
 *     `UNSERVED-MAKER-POSITION` mark, because no second position exists (R-B).
 * 10. M = 3 with the refusal on root 2: the work item resolves, the stronger of
 *     roots 0 and 1 is served, the other is disclosed `UNSERVED-MAKER-POSITION`,
 *     and `SINGLE-LINEAGE` is ABSENT, because two lineages exist.
 * 11. M = 2 with the refusal on the FIRST review call (root 0's): both roots
 *     authored, zero reviews landed, the work item resolves and serves the
 *     stronger root. (The round-3 re-review's "a review has landed by then"
 *     holds from the second review onward only.)
 * 12. In case 6, a child whose review LANDED `cannot-assess` before the stop
 *     keeps its `HIDDEN-UNJUDGEABLE` record; a child the stop denied a review
 *     is not hidden.
 */
describe.skip("V-28 a spend stop mid-run ends in the envelope terminal (NOT RUN — unwired sketch)", () => {
  it("keeps root 0 when root 1 is refused on money at M=2, and says it rests on one lineage", () => {
    expect.unreachable("wire to the acceptance harness; see the numbered contract above");
  });
});
