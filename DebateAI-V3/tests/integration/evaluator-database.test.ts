import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database.stop();
});

describe("0023 evaluator foundation migration", () => {
  it("creates every evaluator table under append-only mutation guards", async () => {
    const tables = await database.pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='evaluator' AND table_type='BASE TABLE'
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "consumer_output", "consumer_selection", "domain", "domain_admission",
      "model_call_usage", "observation", "pipeline_event", "profile_cell",
      "question_domain", "rank_snapshot", "relative_cost_cell", "shadow_decision",
      "vllm_catalog_model", "vllm_probe"
    ]);
    const triggers = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM information_schema.triggers
      WHERE trigger_schema='evaluator' AND event_manipulation IN ('UPDATE','DELETE')
        AND trigger_name='reject_mutation'
    `);
    expect(Number(triggers.rows[0]!.count)).toBe(28);
  });

  it("keeps consensus observations outside settlement and rejects mutation", async () => {
    const run = await database.pool.query<{ run_id: string }>(`
      INSERT INTO core.run (
        question_line, asker_id, session_id, caller_scope, as_of, asker_risk_tier,
        risk_tier, tier_source, tier_provenance_ref, composition_budget_tier,
        depth_params, agent_count, discovered_panel, stranger_sample_rate,
        envelope_basis, register_version, battery_version, ask_contract, created_at_seq
      ) VALUES (
        'evaluator migration test', 'asker:test', 'session:test', 'ASKER', now(), 'casual',
        'casual', 'ASKER', 'test', 'low', '{}'::jsonb, 1, $1::jsonb, 0,
        '{}'::jsonb, 1, 'test', '{}'::jsonb, ledger.allocate_sequence()
      ) RETURNING run_id
    `, [JSON.stringify(fixtureDiscoveredPanel(1))]);
    const inserted = await database.pool.query<{ observation_id: string }>(`
      INSERT INTO evaluator.observation (
        run_id, provider, model_id, model_version, domain_id, step, metric,
        value, outcome_json, truth_basis, source_kind, source_ref,
        derivation_version, provenance_json, observed_at, at_seq
      ) VALUES (
        $1, 'provider:test', 'model:test', 'v1', NULL, 'JUDGING', 'bias.leniency.v1',
        0.25, NULL, 'CONSENSUS', 'REDUCED_JUDGEMENT', 'judgement:test',
        1, '{}'::jsonb, now(), ledger.allocate_sequence()
      ) RETURNING observation_id
    `, [run.rows[0]!.run_id]);
    await expect(database.pool.query(
      "UPDATE evaluator.observation SET value=0.5 WHERE observation_id=$1",
      [inserted.rows[0]!.observation_id]
    )).rejects.toThrow(/append-only or immutable table observation rejects UPDATE/);
    const settlementRows = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM scorecard.answer_outcome"
    );
    expect(settlementRows.rows[0]!.count).toBe("0");
  });

  it("grants the API only evaluator reads plus consumer selection inserts", async () => {
    const privileges = await database.pool.query<{ table_name: string; privilege_type: string }>(`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee='debateai_evaluator_api' AND table_schema='evaluator'
      ORDER BY table_name, privilege_type
    `);
    expect(privileges.rows).toContainEqual({ table_name: "consumer_selection", privilege_type: "INSERT" });
    expect(privileges.rows.some((row) =>
      row.privilege_type === "UPDATE" || row.privilege_type === "DELETE"
    )).toBe(false);
    expect(privileges.rows.some((row) =>
      row.privilege_type === "INSERT" && row.table_name !== "consumer_selection"
    )).toBe(false);
  });
});
