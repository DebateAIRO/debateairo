import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import {
  EvaluatorHarvestRepository,
  PostgresEvaluatorProfileRepository
} from "../../packages/evaluator/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const strategy = {
  rowKey: "evaluatorProfileStrategy",
  registerVersion: 1,
  sourceRef: "test:profile-rework:v1"
};
const HARVESTED_AT = new Date("2026-08-15T10:00:00.000Z");
const AS_OF = new Date("2026-08-15T11:00:00.000Z");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

async function createTerminalRun(label: string): Promise<string> {
  const run = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
      depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,
      register_version,battery_version,ask_contract,created_at_seq
    ) VALUES (
      $1,$2,$3,'ASKER',$4,'casual','casual','ASKER',$5,'low','{}'::jsonb,
      3,$6::jsonb,0,'{}'::jsonb,1,'test','{}'::jsonb,ledger.allocate_sequence()
    ) RETURNING run_id
  `, [
    `profile rework ${label}`, `asker:${label}`, `session:${label}`,
    new Date("2026-08-15T09:00:00.000Z"), `test:${label}`,
    JSON.stringify(fixtureDiscoveredPanel(3))
  ]);
  const runId = run.rows[0]!.run_id;
  await database.pool.query(`
    INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
    VALUES ($1,ledger.allocate_sequence(),'TERMINAL','{"state":"SETTLED"}'::jsonb)
  `, [runId]);
  return runId;
}

async function addArtifact(input: {
  readonly runId: string;
  readonly modelId: string;
  readonly maker: string;
}): Promise<string> {
  const artifact = await database.pool.query<{ raw_artifact_id: string }>(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,
      model_version,raw_text,metadata_json,parse_status,content_hash,input_hash,
      contract_hash,at_seq
    ) VALUES (
      gen_random_uuid(),gen_random_uuid(),$1,$2,'openai-compatible-http',$3,$4,
      'v1','{}','{}','PARSED',$5,'input','contract',ledger.allocate_sequence()
    ) RETURNING raw_artifact_id
  `, [input.runId, `provider:${input.modelId}`, input.modelId, input.maker, "a".repeat(64)]);
  return artifact.rows[0]!.raw_artifact_id;
}

async function addJudgedNode(input: {
  readonly runId: string;
  readonly modelId: string;
  readonly maker: string;
  readonly tau: number;
  readonly ordinal: number;
  readonly withStrength?: number;
}): Promise<{ readonly nodeId: string; readonly artifactId: string }> {
  const artifactId = await addArtifact(input);
  const root = await database.pool.query<{ node_id: string }>(`
    SELECT node_id FROM core.node WHERE run_id=$1 AND parent_node_id IS NULL LIMIT 1
  `, [input.runId]);
  const parentNodeId = root.rows[0]?.node_id ?? null;
  const node = await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,
      materialized_path,generation_status,path_status,exploration_decision,
      way_of_knowing,provenance_ref,locator,value_laden,created_at_seq
    ) VALUES ($1,$2,'unknown',$3,$4,$5,$6,$7,'complete','active','continue',
      'REASONING',$8,NULL,false,ledger.allocate_sequence()) RETURNING node_id
  `, [
    input.runId, `claim ${input.modelId} ${input.ordinal}`, parentNodeId,
    parentNodeId === null ? null : "support", parentNodeId === null ? 0 : 1,
    parentNodeId === null ? 0 : input.ordinal,
    parentNodeId === null ? "0" : `0/${input.ordinal}`,
    artifactId
  ]);
  const nodeId = node.rows[0]!.node_id;
  // This is the production runner shape: the node and its sole reduced judgement
  // cite the same model artifact.
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (
      run_id,node_id,raw_artifact_ref,tau,number_kind,source_ref,producer,
      replay_handle,way_of_knowing,at_seq
    ) VALUES ($1,$2,$3,$4,'PROBABILITY',$5,$6,$7,'REASONING',ledger.allocate_sequence())
  `, [input.runId, nodeId, artifactId, input.tau, `judgement:${nodeId}`,
    `judge:${input.modelId}`, `replay:${nodeId}`]);
  if (input.withStrength !== undefined) {
    const propagation = await database.pool.query<{ propagation_run_id: string }>(`
      INSERT INTO ledger.propagation_run (
        run_id,input_hash,contract_hash,graph_fingerprint,arrow_order,cluster_records,
        operator_by_parent,transmission_reductions,lift_records,judgement_selection_rule,at_seq
      ) VALUES ($1,$2,'contract','graph','[]','[]','[]','[]','[]','{}',ledger.allocate_sequence())
      RETURNING propagation_run_id
    `, [input.runId, `input:${nodeId}`]);
    await database.pool.query(`
      INSERT INTO ledger.node_strength_record (
        propagation_run_id,node_id,strength,number_kind,source_ref,producer,replay_handle,
        way_of_knowing,abstained,supported_by,attacked_by,lift_marker
      ) VALUES ($1,$2,$3,'PROBABILITY',$4,'propagator:test',$5,'REASONING',false,'[]','[]','[]')
    `, [propagation.rows[0]!.propagation_run_id, nodeId, input.withStrength,
      `strength:${nodeId}`, `replay:strength:${nodeId}`]);
  }
  return { nodeId, artifactId };
}

async function addReview(input: {
  readonly runId: string;
  readonly author: { readonly nodeId: string; readonly artifactId: string };
  readonly reviewerModel: string;
  readonly reviewerMaker: string;
  readonly outcome: "agree" | "dispute";
}): Promise<void> {
  const reviewer = await addArtifact({
    runId: input.runId, modelId: input.reviewerModel, maker: input.reviewerMaker
  });
  await database.pool.query(`
    INSERT INTO ledger.node_review (
      node_review_id,run_id,node_id,author_raw_artifact_ref,review_raw_artifact_ref,
      outcome,reasons,at_seq
    ) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'["evidence"]'::jsonb,ledger.allocate_sequence())
  `, [input.runId, input.author.nodeId, input.author.artifactId, reviewer, input.outcome]);
}

async function addOutcome(input: {
  readonly runId: string;
  readonly modelId: string;
  readonly resolvedOutcome: boolean;
  readonly answerVersion?: number;
}): Promise<void> {
  const answerVersion = input.answerVersion ?? 1;
  const carrier = await database.pool.query<{ work_item_id: string; fact_bundle_id: string }>(`
    WITH work AS (
      INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,created_at_seq)
      VALUES ($1,'Q61','[]',$2,'DONE',ledger.allocate_sequence()) RETURNING work_item_id
    ), bundle AS (
      INSERT INTO serve.fact_bundle (run_id,facts,residual_objections,content_hash,version)
      VALUES ($1,'[]','[]',$3,$4) RETURNING fact_bundle_id
    ) SELECT work_item_id,fact_bundle_id FROM work CROSS JOIN bundle
  `, [input.runId, `profile:${input.modelId}:${answerVersion}`,
    `profile:${input.modelId}:${answerVersion}`, answerVersion]);
  const answer = await database.pool.query<{ answer_id: string }>(`
    INSERT INTO serve.answer (
      answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,
      condition_marks,fact_bundle_id,sealed_at_seq
    ) VALUES ($4,$1,$2,'SERVED','COMPOSED','SUPPORTED','{}','[]',$3,ledger.allocate_sequence())
    RETURNING answer_id
  `, [input.runId, carrier.rows[0]!.work_item_id, carrier.rows[0]!.fact_bundle_id, answerVersion]);
  await database.pool.query(`
    INSERT INTO scorecard.answer_outcome (
      outcome_attempt_id,answer_id,answer_version,as_of,run_id,model_id,model_version,
      provider,task_class,prior,posterior,basis,resolver_ref,resolver_is_external,
      resolved_outcome,resolved_at,provenance_ref,scoreability,accepted,at_seq
    ) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'v1','openai-compatible-http','test',
      0.5,0.9,'EXTERNAL','resolver:test',true,$6,$3,'profile:outcome','SCOREABLE',true,
      ledger.allocate_sequence())
  `, [answer.rows[0]!.answer_id, answerVersion, HARVESTED_AT, input.runId,
    input.modelId, input.resolvedOutcome]);
}

async function harvest(runId: string, observedAt = HARVESTED_AT): Promise<void> {
  await expect(new EvaluatorHarvestRepository(database.pool).harvestTerminalRun(runId, observedAt))
    .resolves.toMatchObject({ state: "HARVESTED" });
}

describe("PROG-07 rework regressions through production harvest shapes", () => {
  it("moves a judge down the persisted bias rank and receipts that ordinal in prowess", async () => {
    const repository = new PostgresEvaluatorProfileRepository(database.pool);
    const baselineAsOf = new Date("2026-08-15T09:45:00.000Z");
    const injectedAsOf = new Date("2026-08-15T10:45:00.000Z");
    const baseline = await createTerminalRun("judge-rank-baseline");
    for (const [modelId, maker, ordinal] of [
      ["rankmove:a", "maker:rankmove:a", 1],
      ["rankmove:b", "maker:rankmove:b", 2],
      ["rankmove:c", "maker:rankmove:c", 3]
    ] as const) {
      await addJudgedNode({ runId: baseline, modelId, maker, tau: 0.5, ordinal });
    }
    await harvest(baseline, new Date("2026-08-15T09:30:00.000Z"));
    await repository.deriveAndPersist({
      asOf: baselineAsOf, derivationVersion: 20, strategy
    });

    const injected = await createTerminalRun("judge-rank-injected-leniency");
    for (const [modelId, maker, tau, ordinal] of [
      ["rankmove:a", "maker:rankmove:a", 0.95, 1],
      ["rankmove:b", "maker:rankmove:b", 0.1, 2],
      ["rankmove:c", "maker:rankmove:c", 0.1, 3]
    ] as const) {
      await addJudgedNode({ runId: injected, modelId, maker, tau, ordinal });
    }
    await harvest(injected, new Date("2026-08-15T10:30:00.000Z"));
    await repository.deriveAndPersist({
      asOf: injectedAsOf, derivationVersion: 20, strategy
    });

    const ranks = await database.pool.query<{
      as_of: Date; model_id: string; ordinal: number; score: number;
    }>(`
      SELECT as_of,model_id,ordinal,score FROM evaluator.rank_snapshot
      WHERE rank_kind='JUDGE' AND metric='bias.composite-rank.v1'
        AND derivation_version=20
      ORDER BY as_of,ordinal
    `);
    expect(ranks.rows).toEqual([
      { as_of: baselineAsOf, model_id: "rankmove:a", ordinal: 1, score: 1 },
      { as_of: baselineAsOf, model_id: "rankmove:b", ordinal: 2, score: 1 },
      { as_of: baselineAsOf, model_id: "rankmove:c", ordinal: 3, score: 1 },
      { as_of: injectedAsOf, model_id: "rankmove:b", ordinal: 1, score: 0.7875 },
      { as_of: injectedAsOf, model_id: "rankmove:c", ordinal: 2, score: 0.7875 },
      { as_of: injectedAsOf, model_id: "rankmove:a", ordinal: 3, score: 0.575 }
    ]);

    const receipt = await database.pool.query<{ derivation_input: string[] }>(`
      SELECT derivation_input FROM evaluator.profile_cell
      WHERE provider='openai-compatible-http' AND model_id='rankmove:a'
        AND model_version='v1' AND step='JUDGING'
        AND metric='prowess.judging-tau.v1' AND as_of=$1 AND derivation_version=20
    `, [injectedAsOf]);
    expect(receipt.rows[0]!.derivation_input).toEqual(expect.arrayContaining([
      "bias-rank:openai-compatible-http/rankmove:a/v1@3"
    ]));
  });

  it("derives non-degenerate run-panel leniency, review lineage residue, and event-level contradictions", async () => {
    const runId = await createTerminalRun("bias-real-shapes");
    const authorA1 = await addJudgedNode({
      runId, modelId: "judge:a", maker: "maker:a", tau: 0.8, ordinal: 1
    });
    await addJudgedNode({ runId, modelId: "judge:a", maker: "maker:a", tau: 0.6, ordinal: 2 });
    const authorB = await addJudgedNode({
      runId, modelId: "judge:b", maker: "maker:b", tau: 0.2, ordinal: 3
    });
    await addJudgedNode({ runId, modelId: "judge:boundary", maker: "maker:c", tau: 0.5, ordinal: 4 });
    await addReview({
      runId, author: authorA1, reviewerModel: "reviewer:r", reviewerMaker: "maker:r", outcome: "agree"
    });
    await addReview({
      runId, author: authorB, reviewerModel: "reviewer:r", reviewerMaker: "maker:r", outcome: "dispute"
    });
    await addOutcome({ runId, modelId: "judge:a", resolvedOutcome: false, answerVersion: 1 });
    await addOutcome({ runId, modelId: "judge:b", resolvedOutcome: true, answerVersion: 2 });
    await addOutcome({
      runId, modelId: "judge:boundary", resolvedOutcome: false, answerVersion: 3
    });
    await addOutcome({ runId, modelId: "judge:a", resolvedOutcome: true, answerVersion: 4 });
    await harvest(runId);
    const soloRun = await createTerminalRun("bias-degenerate-panel");
    await addJudgedNode({
      runId: soloRun, modelId: "judge:solo", maker: "maker:solo", tau: 0.9, ordinal: 1
    });
    await harvest(soloRun, new Date("2026-08-15T10:01:00.000Z"));

    await new PostgresEvaluatorProfileRepository(database.pool).deriveAndPersist({
      asOf: AS_OF, derivationVersion: 11, strategy
    });
    const bias = await database.pool.query<{
      model_id: string; metric: string; value: number | null; n: number;
    }>(`
      SELECT model_id,metric,value,n FROM evaluator.profile_cell
      WHERE as_of=$1 AND derivation_version=11 AND metric LIKE 'bias.%'
      ORDER BY model_id,metric
    `, [AS_OF]);
    expect(bias.rows).toEqual(expect.arrayContaining([
      { model_id: "judge:a", metric: "bias.leniency.v1", value: 0.35, n: 1 },
      { model_id: "judge:a", metric: "bias.settlement_contradiction.v1", value: 0.5, n: 2 },
      { model_id: "judge:b", metric: "bias.settlement_contradiction.v1", value: 1, n: 1 },
      { model_id: "judge:boundary", metric: "bias.settlement_contradiction.v1", value: null, n: 0 },
      { model_id: "judge:solo", metric: "bias.leniency.v1", value: null, n: 0 },
      { model_id: "reviewer:r", metric: "bias.lineage_favoritism_residue.v1", value: 1, n: 2 }
    ]));
  });

  it("ranks each prowess metric independently and keeps unsuperseded consensus at full weight", async () => {
    const first = await createTerminalRun("rank-consensus");
    await addJudgedNode({
      runId: first, modelId: "model:a", maker: "maker:a", tau: 0.8, ordinal: 1, withStrength: 0.9
    });
    await addJudgedNode({
      runId: first, modelId: "model:b", maker: "maker:b", tau: 0.7, ordinal: 2, withStrength: 0.7
    });
    await harvest(first);
    const second = await createTerminalRun("rank-settlement");
    await addJudgedNode({
      runId: second, modelId: "model:a", maker: "maker:a", tau: 0.8, ordinal: 1, withStrength: 0.8
    });
    await addOutcome({ runId: second, modelId: "model:a", resolvedOutcome: false });
    await harvest(second, new Date("2026-08-15T10:05:00.000Z"));

    await new PostgresEvaluatorProfileRepository(database.pool).deriveAndPersist({
      asOf: AS_OF, derivationVersion: 12, strategy
    });
    const ranks = await database.pool.query<{ metric: string; model_id: string; ordinal: number }>(`
      SELECT metric,model_id,ordinal FROM evaluator.rank_snapshot
      WHERE rank_kind='PROWESS' AND as_of=$1 AND derivation_version=12
      ORDER BY metric,ordinal
    `, [AS_OF]);
    expect(ranks.rows).toEqual(expect.arrayContaining([
      { metric: "prowess.consensus-strength.v1", model_id: "model:a", ordinal: 1 },
      { metric: "prowess.consensus-strength.v1", model_id: "model:b", ordinal: 2 },
      expect.objectContaining({ metric: "prowess.settlement-outcome.v1", model_id: "model:a" })
    ]));
  });

  it("refuses a changed same-version derivation instead of silently retaining stale cells", async () => {
    const repository = new PostgresEvaluatorProfileRepository(database.pool);
    const first = await createTerminalRun("conflict-first");
    await addJudgedNode({ runId: first, modelId: "conflict:a", maker: "maker:a", tau: 0.8, ordinal: 1 });
    await addJudgedNode({ runId: first, modelId: "conflict:b", maker: "maker:b", tau: 0.2, ordinal: 2 });
    await harvest(first, new Date("2026-08-15T09:30:00.000Z"));
    await repository.deriveAndPersist({ asOf: AS_OF, derivationVersion: 13, strategy });

    const late = await createTerminalRun("conflict-late");
    await addJudgedNode({ runId: late, modelId: "conflict:a", maker: "maker:a", tau: 0.9, ordinal: 1 });
    await addJudgedNode({ runId: late, modelId: "conflict:b", maker: "maker:b", tau: 0.1, ordinal: 2 });
    await harvest(late, new Date("2026-08-15T10:30:00.000Z"));

    await expect(repository.deriveAndPersist({ asOf: AS_OF, derivationVersion: 13, strategy }))
      .rejects.toMatchObject({ code: "EVALUATOR_PROFILE_DERIVATION_CONFLICT" });
  });

  it("uses the full [-1,1] Hoeffding range and clamps the interval to that domain", async () => {
    for (let index = 0; index < 10; index += 1) {
      const runId = await createTerminalRun(`interval-${index}`);
      await addJudgedNode({ runId, modelId: "interval:a", maker: "maker:a", tau: 0.8, ordinal: 1 });
      await addJudgedNode({ runId, modelId: "interval:b", maker: "maker:b", tau: 0.2, ordinal: 2 });
      await harvest(runId, new Date(HARVESTED_AT.getTime() + index));
    }
    await new PostgresEvaluatorProfileRepository(database.pool).deriveAndPersist({
      asOf: AS_OF, derivationVersion: 14, strategy
    });
    const interval = await database.pool.query<{
      value: number; n: number; interval_lower: number; interval_upper: number;
    }>(`
      SELECT value,n,interval_lower,interval_upper FROM evaluator.profile_cell
      WHERE model_id='interval:a' AND metric='bias.leniency.v1'
        AND as_of=$1 AND derivation_version=14
    `, [AS_OF]);
    const radius = 2 * Math.sqrt(Math.log(40) / (2 * 10));
    expect(interval.rows[0]).toEqual({
      value: 0.6,
      n: 10,
      interval_lower: expect.closeTo(0.6 - radius, 10),
      interval_upper: 1
    });
  });
});
