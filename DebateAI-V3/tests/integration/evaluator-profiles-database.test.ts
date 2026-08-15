import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { PostgresEvaluatorProfileRepository } from "../../packages/evaluator/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const FIRST_AS_OF = new Date("2026-08-15T14:00:00.000Z");
const SECOND_AS_OF = new Date("2026-08-15T16:00:00.000Z");
const strategy = {
  rowKey: "evaluatorProfileStrategy",
  registerVersion: 1,
  sourceRef: "test:profile-strategy:v1"
};

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

async function createRun(label: string, asOf: Date): Promise<string> {
  const result = await database.pool.query<{ run_id: string }>(`
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
    `profile ${label}`, `asker:${label}`, `session:${label}`, asOf,
    `test:${label}`, JSON.stringify(fixtureDiscoveredPanel(3))
  ]);
  return result.rows[0]!.run_id;
}

async function insertJudgement(input: {
  readonly runId: string;
  readonly itemKey: string;
  readonly modelId: string;
  readonly maker: string;
  readonly value: number;
  readonly observedAt: Date;
}): Promise<void> {
  await database.pool.query(`
    INSERT INTO evaluator.observation (
      run_id,provider,model_id,model_version,domain_id,step,metric,value,
      outcome_json,truth_basis,source_kind,source_ref,derivation_version,
      provenance_json,observed_at,at_seq
    ) VALUES (
      $1,'provider:judges',$2,'v1',NULL,'JUDGING','judging.tau.v1',$3,
      '{"number_kind":"PROBABILITY"}'::jsonb,'CONSENSUS','REDUCED_JUDGEMENT',$4,1,
      $5::jsonb,$6,ledger.allocate_sequence()
    )
  `, [
    input.runId,
    input.modelId,
    input.value,
    `${input.itemKey}:${input.modelId}`,
    JSON.stringify({
      item_key: input.itemKey,
      subject_maker: input.maker,
      author_maker: "maker:author"
    }),
    input.observedAt
  ]);
}

async function createAcceptedOutcome(input: {
  readonly runId: string;
  readonly modelId: string;
  readonly resolvedOutcome: boolean;
  readonly resolvedAt: Date;
}): Promise<string> {
  const carriers = await database.pool.query<{ work_item_id: string; fact_bundle_id: string }>(`
    WITH work AS (
      INSERT INTO core.work_item (
        run_id,battery_row_id,node_set,command_key,state,created_at_seq
      ) VALUES ($1,'Q61','[]','profile:settlement','DONE',ledger.allocate_sequence())
      RETURNING work_item_id
    ), bundle AS (
      INSERT INTO serve.fact_bundle (run_id,facts,residual_objections,content_hash,version)
      VALUES ($1,'[]','[]','profile:settlement',1) RETURNING fact_bundle_id
    ) SELECT work_item_id,fact_bundle_id FROM work CROSS JOIN bundle
  `, [input.runId]);
  const answer = await database.pool.query<{ answer_id: string }>(`
    INSERT INTO serve.answer (
      answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,
      condition_marks,fact_bundle_id,sealed_at_seq
    ) VALUES (1,$1,$2,'SERVED','COMPOSED','SUPPORTED','{}','[]',$3,ledger.allocate_sequence())
    RETURNING answer_id
  `, [input.runId, carriers.rows[0]!.work_item_id, carriers.rows[0]!.fact_bundle_id]);
  const outcome = await database.pool.query<{ answer_outcome_id: string }>(`
    INSERT INTO scorecard.answer_outcome (
      outcome_attempt_id,answer_id,answer_version,as_of,run_id,model_id,model_version,
      provider,task_class,prior,posterior,basis,resolver_ref,resolver_is_external,
      resolved_outcome,resolved_at,provenance_ref,scoreability,accepted,at_seq
    ) VALUES (
      gen_random_uuid(),$1,1,$2,$3,$4,'v1','provider:author','test',0.5,0.9,
      'EXTERNAL','resolver:test',true,$5,$2,'profile:settlement','SCOREABLE',true,
      ledger.allocate_sequence()
    ) RETURNING answer_outcome_id
  `, [answer.rows[0]!.answer_id, input.resolvedAt, input.runId, input.modelId, input.resolvedOutcome]);
  return outcome.rows[0]!.answer_outcome_id;
}

describe("evaluator profile persistence on live Postgres", () => {
  it("exercises replace-not-pool and the contradiction boundary through the real database path", async () => {
    const repository = new PostgresEvaluatorProfileRepository(database.pool);
    const observedAt = new Date("2026-08-15T10:00:00.000Z");
    const asOf = new Date("2026-08-15T11:00:00.000Z");
    const runId = await createRun("replace-not-pool", new Date("2026-08-15T09:00:00.000Z"));
    const consensus = await database.pool.query<{ observation_id: string }>(`
      INSERT INTO evaluator.observation (
        run_id,provider,model_id,model_version,domain_id,step,metric,value,outcome_json,
        truth_basis,source_kind,source_ref,derivation_version,provenance_json,observed_at,at_seq
      ) VALUES (
        $1,'provider:author','model:author','v1',NULL,'AUTHORING','prowess.outcome.v1',0.9,
        '{"number_kind":"PROBABILITY"}'::jsonb,'CONSENSUS','NODE_STRENGTH','strength:replaced',
        1,'{"item_key":"answer:1"}'::jsonb,$2,ledger.allocate_sequence()
      ) RETURNING observation_id
    `, [runId, observedAt]);
    const answerOutcomeId = await createAcceptedOutcome({
      runId, modelId: "model:author", resolvedOutcome: false,
      resolvedAt: new Date("2026-08-15T10:15:00.000Z")
    });
    await database.pool.query(`
      INSERT INTO evaluator.observation (
        run_id,provider,model_id,model_version,domain_id,step,metric,value,outcome_json,
        truth_basis,source_kind,source_ref,answer_outcome_id,derivation_version,
        supersedes_observation_id,provenance_json,observed_at,at_seq
      ) VALUES (
        $1,'provider:author','model:author','v1',NULL,'AUTHORING','prowess.outcome.v1',0,
        '{"resolved_outcome":false}'::jsonb,'SETTLEMENT','EXTERNAL_ANSWER_OUTCOME',$2::text,$2::uuid,1,$3,
        '{"item_key":"answer:1"}'::jsonb,$4,ledger.allocate_sequence()
      )
    `, [runId, answerOutcomeId, consensus.rows[0]!.observation_id,
      new Date("2026-08-15T10:30:00.000Z")]);
    await insertJudgement({
      runId, itemKey: "item:boundary", modelId: "judge:at-boundary", maker: "maker:boundary",
      value: 0.5, observedAt: new Date("2026-08-15T10:35:00.000Z")
    });
    await insertJudgement({
      runId, itemKey: "item:boundary", modelId: "judge:below-boundary", maker: "maker:below",
      value: 0.49, observedAt: new Date("2026-08-15T10:36:00.000Z")
    });

    await repository.deriveAndPersist({ asOf, derivationVersion: 1, strategy });
    const authorCells = await database.pool.query<{ metric: string; value: number; n: number }>(`
      SELECT metric,value,n FROM evaluator.profile_cell
      WHERE provider='provider:author' AND model_id='model:author' AND as_of=$1
      ORDER BY metric
    `, [asOf]);
    expect(authorCells.rows).toEqual([
      { metric: "prowess.settlement-outcome.v1", value: 0, n: 1 }
    ]);
    const auditHistory = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.observation
      WHERE observation_id=$1 OR supersedes_observation_id=$1
    `, [consensus.rows[0]!.observation_id]);
    expect(auditHistory.rows[0]!.count).toBe("2");
    const contradictions = await database.pool.query<{ model_id: string; value: number }>(`
      SELECT model_id,value FROM evaluator.profile_cell
      WHERE as_of=$1 AND metric='bias.settlement_contradiction.v1'
      ORDER BY model_id
    `, [asOf]);
    expect(contradictions.rows).toEqual([
      { model_id: "judge:at-boundary", value: null },
      { model_id: "judge:below-boundary", value: null }
    ]);
  });

  it("keeps versioned cells and ranks append-only", async () => {
    const repository = new PostgresEvaluatorProfileRepository(database.pool);
    const firstRun = await createRun("first", new Date("2026-08-15T12:00:00.000Z"));
    for (const [modelId, maker] of [
      ["judge:a", "maker:a"], ["judge:b", "maker:b"], ["judge:c", "maker:c"]
    ] as const) {
      await insertJudgement({
        runId: firstRun, itemKey: "item:1", modelId, maker, value: 0.5,
        observedAt: new Date("2026-08-15T12:30:00.000Z")
      });
    }

    await expect(repository.deriveAndPersist({
      asOf: FIRST_AS_OF, derivationVersion: 1, strategy
    })).resolves.toMatchObject({
      profileCellsInserted: expect.any(Number), rankSnapshotsInserted: expect.any(Number),
      derivation: { phaseOrder: ["BIAS", "JUDGE_RANK", "PROWESS", "PROWESS_RANK"] }
    });
    const firstLeader = await database.pool.query<{ model_id: string }>(`
      SELECT model_id FROM evaluator.rank_snapshot
      WHERE rank_kind='JUDGE' AND as_of=$1 AND derivation_version=1 AND ordinal=1
    `, [FIRST_AS_OF]);
    expect(firstLeader.rows[0]!.model_id).toBe("judge:a");

    const secondRun = await createRun("second", new Date("2026-08-15T15:00:00.000Z"));
    for (const [modelId, maker, value] of [
      ["judge:a", "maker:a", 0.9],
      ["judge:b", "maker:b", 0.2],
      ["judge:c", "maker:c", 0.1]
    ] as const) {
      await insertJudgement({
        runId: secondRun, itemKey: "item:2", modelId, maker, value,
        observedAt: new Date("2026-08-15T15:30:00.000Z")
      });
    }
    await repository.deriveAndPersist({ asOf: SECOND_AS_OF, derivationVersion: 1, strategy });
    await repository.deriveAndPersist({ asOf: SECOND_AS_OF, derivationVersion: 2, strategy });
    await expect(repository.deriveAndPersist({
      asOf: SECOND_AS_OF, derivationVersion: 2, strategy
    })).resolves.toMatchObject({ profileCellsInserted: 0, rankSnapshotsInserted: 0 });

    const versionedRanks = await database.pool.query<{
      as_of: Date; derivation_version: string; model_id: string;
    }>(`
      SELECT as_of,derivation_version::text,model_id FROM evaluator.rank_snapshot
      WHERE rank_kind='JUDGE' AND as_of = ANY($1::timestamptz[])
        AND model_id = ANY($2::text[])
      ORDER BY as_of,derivation_version
    `, [[FIRST_AS_OF, SECOND_AS_OF], ["judge:a", "judge:b", "judge:c"]]);
    expect(versionedRanks.rows).toHaveLength(9);
    expect(new Set(versionedRanks.rows.map((row) => row.derivation_version)))
      .toEqual(new Set(["1", "2"]));
    const versions = await database.pool.query<{ versions: string[] }>(`
      SELECT array_agg(DISTINCT derivation_version::text ORDER BY derivation_version::text) AS versions
      FROM evaluator.profile_cell WHERE as_of=$1
    `, [SECOND_AS_OF]);
    expect(versions.rows[0]!.versions).toEqual(["1", "2"]);
    const persistedIntervals = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.profile_cell
      WHERE as_of=$1 AND metric='prowess.judging-tau.v1' AND n > 0
        AND interval_lower IS NOT NULL AND interval_upper IS NOT NULL
    `, [SECOND_AS_OF]);
    expect(Number(persistedIntervals.rows[0]!.count)).toBeGreaterThan(0);
  });
});
