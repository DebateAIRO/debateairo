import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import {
  PostgresEvaluatorSeatShareRepository,
  type EvaluatorSeatSharePolicy
} from "../../packages/evaluator/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const policy: EvaluatorSeatSharePolicy = {
  rowKey: "evaluatorSeatSharePolicy",
  registerVersion: 7,
  sourceRef: "test:seat-share-policy:v1",
  formulaVersion: 1,
  premiumMinimumDepth: 3,
  shares: {
    premium: { best: 0.8, runnerUp: 0.2, residual: 0 },
    normal: { best: 0.6, runnerUp: 0.3, residual: 0.1 },
    bestAlsoCheaper: { best: 0.8, runnerUp: 0.15, residual: 0.05 }
  }
};

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("seat-share shadow decisions on live PostgreSQL", () => {
  it("persists an idempotent UNBOUND receipt for a real admitted run without dispatching it", async () => {
    const admittedAt = new Date("2026-08-15T19:00:00.000Z");
    const run = await database.pool.query<{ run_id: string }>(`
      INSERT INTO core.run (
        question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
        risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
        depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,
        register_version,battery_version,ask_contract,created_at_seq
      ) VALUES (
        'seat-share shadow fixture','asker:seat-share','session:seat-share','ASKER',$1,
        'high-stakes','high-stakes','ASKER','test:seat-share','high','{"depth":3}'::jsonb,
        3,$2::jsonb,0,'{}'::jsonb,1,'test','{}'::jsonb,ledger.allocate_sequence()
      ) RETURNING run_id
    `, [admittedAt, JSON.stringify(fixtureDiscoveredPanel(3))]);
    const repository = new PostgresEvaluatorSeatShareRepository(database.pool);
    const input = {
      requestedSeatCount: 10,
      riskTier: "high-stakes" as const,
      depth: 3,
      candidates: [
        { provider: "p", modelId: "best", modelVersion: "v1", maker: "m:best", healthy: true,
          prowessOrdinal: 1, relativeCost: 0.7, costComparability: "COMPARABLE" as const },
        { provider: "p", modelId: "runner", modelVersion: "v1", maker: "m:runner", healthy: true,
          prowessOrdinal: 2, relativeCost: 0.2, costComparability: "COMPARABLE" as const }
      ],
      policy,
      numericInputProducerIdentities: []
    };

    const first = await repository.computeAndPersistShadowDecision({ runId: run.rows[0]!.run_id, input });
    const repeated = await repository.computeAndPersistShadowDecision({ runId: run.rows[0]!.run_id, input });
    expect(repeated.shadowDecisionId).toBe(first.shadowDecisionId);
    expect(repeated.inserted).toBe(false);

    const receipt = await database.pool.query<{
      run_id: string; kind: string; binding_state: string; formula_version: string;
      not_consumed_reason: string; input_json: unknown; output_json: unknown;
    }>(`
      SELECT run_id,kind,binding_state,formula_version::text,not_consumed_reason,input_json,output_json
      FROM evaluator.shadow_decision WHERE shadow_decision_id=$1
    `, [first.shadowDecisionId]);
    expect(receipt.rows).toEqual([{
      run_id: run.rows[0]!.run_id,
      kind: "SEAT_SHARE",
      binding_state: "UNBOUND",
      formula_version: "1",
      not_consumed_reason: "FR-8.0_PANEL_SHAPE_AND_V_BIND_REQUIRED",
      input_json: first.inputReceipt,
      output_json: first.decision
    }]);
    expect(first.decision.allocations.reduce((sum, allocation) => sum + allocation.seatCount, 0)).toBe(10);

    const routingWrites = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM scorecard.routing_decision WHERE session_id='session:seat-share'`
    );
    expect(routingWrites.rows[0]!.count).toBe("0");
  });
});
