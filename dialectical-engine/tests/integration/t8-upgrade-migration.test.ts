import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * T8 (S5-2) — UPGRADE transition, not a from-empty run.
 *
 * The from-empty migration run cannot exercise a row that was legal before
 * `0051`. Each arm below applies the ledger only THROUGH `0050`, seeds a shape
 * that was valid at that point, and then applies `0051` against it.
 *
 * Two legacy shapes matter and neither implies the other:
 *   (a) a `WITHHELD` served-number event with the repealed reason. Nothing
 *       first-party ever wrote one, but that is a fact about this source
 *       history, not about a deployed database — and the read path folds an
 *       unrecognised status straight into PRESENT
 *       (`packages/serve/src/index.ts:1513-1523`), which would EXPOSE the very
 *       number the old semantics withheld.
 *   (b) a repealed operator resolution inside
 *       `ledger.propagation_run.operator_by_parent`. The narrowed
 *       `operator_used` CHECK on `node_strength_record` is NOT a proxy for it:
 *       a withheld parent produced no strength row at all, so the JSONB receipt
 *       can carry the repealed operator with no row anywhere to catch it.
 *
 * Policy under test: FAIL LOUD. `0051` refuses to convert a database carrying
 * either shape, and VALIDATEs its replacement constraints when it does apply —
 * `NOT VALID` alone would leave exactly these rows hiding behind a green
 * migration. A recorded number produced by a repealed operator is not ours to
 * silently reinterpret.
 *
 * Each arm gets its OWN database because `served_number_event` and
 * `propagation_run` are append-only at the trigger level: the legacy rows
 * cannot be deleted or updated away, which is itself why the operator — not
 * this migration — must decide their disposition.
 */

const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const THROUGH = "0050_t16_algorithm_register_rows.sql";
const RETIREMENT = "0051_t8_remove_strict_and.sql";
const WITHHELD_REASON = "STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED";
const REPEALED_OPERATOR = "strict-and";

async function migrationNames(): Promise<readonly string[]> {
  return (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
}

async function applyThrough(database: TestDatabase, through: string): Promise<void> {
  const names = await migrationNames();
  const cutoff = names.indexOf(through);
  if (cutoff === -1) throw new Error(`T8_TEST_FIXTURE: unknown migration ${through}`);
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.debateai_schema_migration (
        name text PRIMARY KEY CHECK (length(btrim(name)) > 0),
        applied_at timestamptz NOT NULL
      )
    `);
    for (const name of names.slice(0, cutoff + 1)) {
      await client.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
      await client.query(
        "INSERT INTO public.debateai_schema_migration (name, applied_at) VALUES ($1, statement_timestamp())",
        [name]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** Applies ONE migration in its own transaction, so a refusal rolls back whole. */
async function applyOne(database: TestDatabase, name: string): Promise<void> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(new URL(name, MIGRATIONS), "utf8"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedRun(database: TestDatabase, label: string): Promise<string> {
  const result = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of,
      asker_risk_tier, risk_tier, tier_source, tier_provenance_ref,
      composition_budget_tier, depth_params, agent_count, discovered_panel,
      stranger_sample_rate, envelope_basis, register_version,
      battery_version, created_at_seq
    ) VALUES (
      $1, $2, $3, 'ASKER', '2026-08-08T00:00:00.000Z',
      'casual', 'casual', 'ASKER', $4,
      'low', '{}', 1,
      '[{"provider_ref":"provider:raw","maker":"maker:raw","model_id":"model:raw","probe_evidence_ref":"00000000-0000-4000-8000-000000000001","probed_at":"2026-08-14T12:00:00.000Z"}]',
      1, '{}', 1, 't8-upgrade', ledger.allocate_sequence()
    ) RETURNING run_id
  `, [label, `asker:${label}`, `session:${label}`, `asker-declaration:${label}`]);
  return result.rows[0]!.run_id;
}

async function seedPropagationRun(
  database: TestDatabase, runId: string, operatorByParent: unknown
): Promise<string> {
  const result = await database.pool.query<{ propagation_run_id: string }>(`
    INSERT INTO ledger.propagation_run (
      run_id, input_hash, contract_hash, graph_fingerprint,
      arrow_order, cluster_records, operator_by_parent,
      transmission_reductions, lift_records, judgement_selection_rule, at_seq
    ) VALUES ($1, 'input:t8', 'contract:t8', 'graph:t8', '[]'::jsonb, '[]'::jsonb, $2::jsonb,
              '[]'::jsonb, '[]'::jsonb, '{"kind":"TEST_LAYER_ONLY"}'::jsonb,
              ledger.allocate_sequence())
    RETURNING propagation_run_id
  `, [runId, JSON.stringify(operatorByParent)]);
  return result.rows[0]!.propagation_run_id;
}

async function seedServedNumber(
  database: TestDatabase, runId: string, propagationRunId: string
): Promise<string> {
  const result = await database.pool.query<{ served_number_id: string }>(`
    INSERT INTO serve.served_number (
      run_id, value, number_kind, source_ref, producer, replay_handle, provenance_ref
    ) VALUES ($1, 0.75, 'fixture:t8', 'fixture:t8', 'fixture:t8', 'replay:t8', $2)
    RETURNING served_number_id
  `, [runId, propagationRunId]);
  return result.rows[0]!.served_number_id;
}

async function convalidated(
  database: TestDatabase, table: string, constraint: string
): Promise<boolean | null> {
  const result = await database.pool.query<{ convalidated: boolean }>(
    `SELECT convalidated FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`,
    [table, constraint]
  );
  return result.rows[0]?.convalidated ?? null;
}

async function rivalColumns(database: TestDatabase): Promise<readonly string[]> {
  const result = await database.pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='ledger' AND table_name='node_strength_record'`
  );
  return result.rows.map((row) => row.column_name);
}

describe("T8 upgrade — legacy WITHHELD served-number event (shape a)", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    await applyThrough(database, THROUGH);
  }, 180_000);
  afterAll(async () => { await database?.stop(); });

  it("the fixture is genuinely old-valid — 0050 ACCEPTS the WITHHELD event", async () => {
    const runId = await seedRun(database, "t8-legacy-withheld");
    const propagationRunId = await seedPropagationRun(database, runId, []);
    const servedNumberId = await seedServedNumber(database, runId, propagationRunId);
    // Legal before 0051: the 0000 status domain admits WITHHELD and the 0006
    // reason constraint pairs it with exactly this literal.
    const inserted = await database.pool.query(
      `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
       VALUES ($1, 'WITHHELD', $2, ledger.allocate_sequence())`,
      [servedNumberId, WITHHELD_REASON]
    );
    expect(inserted.rowCount).toBe(1);
  });

  it("0051 REFUSES to convert this database", async () => {
    await expect(applyOne(database, RETIREMENT)).rejects.toThrow(/T8_LEGACY_WITHHELD_EVENT/u);
  });

  it("the refusal is non-destructive — still at 0050, legacy row intact", async () => {
    const survivors = await database.pool.query(
      "SELECT 1 FROM serve.served_number_event WHERE status = 'WITHHELD'"
    );
    expect(survivors.rowCount).toBe(1);
    expect(await rivalColumns(database)).toContain("rival_operator");
  });
});

describe("T8 upgrade — legacy operator receipt with NO strength row (shape b)", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    await applyThrough(database, THROUGH);
  }, 180_000);
  afterAll(async () => { await database?.stop(); });

  it("the repealed operator hides in JSONB where the column CHECK cannot reach it", async () => {
    const runId = await seedRun(database, "t8-legacy-receipt");
    await seedPropagationRun(database, runId, [
      { parentNodeId: "00000000-0000-4000-8000-000000000009", operator: REPEALED_OPERATOR, suppliedBy: "parent" }
    ]);
    const carrier = await database.pool.query(
      `SELECT 1 FROM ledger.propagation_run WHERE operator_by_parent::text LIKE '%' || $1 || '%'`,
      [REPEALED_OPERATOR]
    );
    expect(carrier.rowCount).toBe(1);
    // The decisive fact: a withheld parent produced no strength row, so the
    // narrowed operator_used CHECK has nothing to bite on.
    const strengths = await database.pool.query("SELECT 1 FROM ledger.node_strength_record");
    expect(strengths.rowCount).toBe(0);
    const events = await database.pool.query("SELECT 1 FROM serve.served_number_event");
    expect(events.rowCount).toBe(0);
  });

  it("0051 REFUSES on the receipt alone, with no offending event row present", async () => {
    await expect(applyOne(database, RETIREMENT)).rejects.toThrow(/T8_LEGACY_OPERATOR_RECEIPT/u);
    expect(await rivalColumns(database)).toContain("rival_strength");
  });
});

describe("T8 upgrade — a database carrying neither legacy shape", () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
    await applyThrough(database, THROUGH);
  }, 180_000);
  afterAll(async () => { await database?.stop(); });

  it("0051 APPLIES and VALIDATES both replacement constraints", async () => {
    const runId = await seedRun(database, "t8-clean");
    const propagationRunId = await seedPropagationRun(database, runId, [
      { parentNodeId: "00000000-0000-4000-8000-000000000009", operator: "accumulate", suppliedBy: "parent" }
    ]);
    const servedNumberId = await seedServedNumber(database, runId, propagationRunId);
    await database.pool.query(
      `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
       VALUES ($1, 'PRESENT', NULL, ledger.allocate_sequence())`,
      [servedNumberId]
    );

    await applyOne(database, RETIREMENT);

    const columns = await rivalColumns(database);
    expect(columns).not.toContain("rival_operator");
    expect(columns).not.toContain("rival_strength");

    // NOT VALID would leave these false and let a legacy row keep hiding.
    expect(await convalidated(database, "serve.served_number_event", "served_number_event_status_check")).toBe(true);
    expect(await convalidated(database, "serve.served_number_event", "served_number_event_reason_matches_status")).toBe(true);
    expect(await convalidated(database, "ledger.node_strength_record", "node_strength_record_operator_used_check")).toBe(true);
  });

  it("after the upgrade both repealed shapes are REJECTED at the door", async () => {
    const runId = await seedRun(database, "t8-post-upgrade");
    const propagationRunId = await seedPropagationRun(database, runId, []);
    const servedNumberId = await seedServedNumber(database, runId, propagationRunId);
    await expect(database.pool.query(
      `INSERT INTO serve.served_number_event (served_number_id, status, reason, at_seq)
       VALUES ($1, 'WITHHELD', $2, ledger.allocate_sequence())`,
      [servedNumberId, WITHHELD_REASON]
    )).rejects.toThrow();
    await expect(database.pool.query(
      `INSERT INTO ledger.node_strength_record (
         propagation_run_id, node_id, strength, number_kind, source_ref, producer,
         replay_handle, way_of_knowing, supported_by, attacked_by, lift_marker,
         operator_used, operator_level, at_seq
       ) VALUES ($1, gen_random_uuid(), 0.5, 'k', 's', 'p', 'r', 'REASONING',
                 '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $2, 'parent', ledger.allocate_sequence())`,
      [propagationRunId, REPEALED_OPERATOR]
    )).rejects.toThrow();
  });
});
