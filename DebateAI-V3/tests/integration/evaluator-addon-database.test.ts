import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@debateai/db";
import type { ProviderGateway } from "@debateai/providers";
import {
  EVALUATOR_MAKER,
  EVALUATOR_PROVIDER_REF,
  type EvaluatorProviderFamilyRow
} from "../../packages/evaluator/src/index.js";
import { runEvaluatorJudgeGradingAddon } from "../../apps/evaluator-worker/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => {
  await database.stop();
});

async function seedRunAndArtifacts(): Promise<{
  readonly runId: string;
  readonly gradedArtifact: string;
  readonly differentGraderArtifact: string;
  readonly sameMakerGraderArtifact: string;
}> {
  const run = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of, asker_risk_tier,
      risk_tier, tier_source, tier_provenance_ref, composition_budget_tier,
      depth_params, agent_count, discovered_panel, stranger_sample_rate,
      envelope_basis, register_version, battery_version, ask_contract, created_at_seq
    ) VALUES (
      'addon database guard', 'asker:addon', 'session:addon', 'ASKER', now(), 'casual',
      'casual', 'ASKER', 'test:addon', 'low', '{}'::jsonb, 1, $1::jsonb, 0,
      '{}'::jsonb, 1, 'test', '{}'::jsonb, ledger.allocate_sequence()
    ) RETURNING run_id
  `, [JSON.stringify(fixtureDiscoveredPanel(1))]);
  const runId = run.rows[0]!.run_id;
  const gradedArtifact = randomUUID();
  const differentGraderArtifact = randomUUID();
  const sameMakerGraderArtifact = randomUUID();
  await database.pool.query(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id,
      maker, model_version, raw_text, metadata_json, parse_status, content_hash,
      input_hash, contract_hash, at_seq
    ) VALUES
      ($1,gen_random_uuid(),$4,'provider:judge','openai-compatible-http','model:judge',
        'maker:judge','judge-v1','{}','{}','PARSED',$5,'input','contract',ledger.allocate_sequence()),
      ($2,gen_random_uuid(),NULL,'provider:evaluator-vllm','openai-compatible-http','model:evaluator',
        'maker:evaluator-local-vllm','evaluator-v1','{}','{}','PARSED',$5,'input','contract',ledger.allocate_sequence()),
      ($3,gen_random_uuid(),NULL,'provider:other','openai-compatible-http','model:other',
        'maker:judge','other-v1','{}','{}','PARSED',$5,'input','contract',ledger.allocate_sequence())
  `, [gradedArtifact, differentGraderArtifact, sameMakerGraderArtifact, runId, "a".repeat(64)]);
  return { runId, gradedArtifact, differentGraderArtifact, sameMakerGraderArtifact };
}

async function insertAddonObservation(input: {
  readonly runId: string;
  readonly gradedArtifact: string;
  readonly graderArtifact: string;
  readonly sourceRef: string;
}): Promise<void> {
  await database.pool.query(`
    INSERT INTO evaluator.observation (
      run_id, provider, model_id, model_version, domain_id, step, metric,
      value, outcome_json, truth_basis, source_kind, source_ref,
      source_raw_artifact_ref, answer_outcome_id, graded_raw_artifact_ref,
      grader_raw_artifact_ref, derivation_version, supersedes_observation_id,
      provenance_json, observed_at, at_seq
    ) VALUES (
      $1,'openai-compatible-http','model:judge','judge-v1',NULL,'JUDGING',
      'judging.blind-grade.v1',0.8,'{"verdict":"UPHOLD"}'::jsonb,
      'BLIND_ADDON','BLIND_JUDGE_GRADE',$4,$2,NULL,$2,$3,1,NULL,
      '{}'::jsonb,now(),ledger.allocate_sequence()
    )
  `, [input.runId, input.gradedArtifact, input.graderArtifact, input.sourceRef]);
}

describe("judge-grading add-on database maker guard", () => {
  it("accepts a null-run evaluator grader artifact from a different maker", async () => {
    const fixture = await seedRunAndArtifacts();
    await expect(insertAddonObservation({
      runId: fixture.runId,
      gradedArtifact: fixture.gradedArtifact,
      graderArtifact: fixture.differentGraderArtifact,
      sourceRef: "judgement:different"
    })).resolves.toBeUndefined();
  });

  it("rejects a null-run grader artifact whose maker equals the graded judge maker", async () => {
    const fixture = await seedRunAndArtifacts();
    await expect(insertAddonObservation({
      runId: fixture.runId,
      gradedArtifact: fixture.gradedArtifact,
      graderArtifact: fixture.sameMakerGraderArtifact,
      sourceRef: "judgement:same"
    })).rejects.toThrow(/PRODUCER_GRADING_FORBIDDEN/);
  });
});

describe("persisted judge-grading add-on", () => {
  it("runs only after harvest and persists one blind add-on observation", async () => {
    const fixture = await seedRunAndArtifacts();
    const node = await database.pool.query<{ node_id: string }>(`
      INSERT INTO core.node (
        run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
        materialized_path, generation_status, path_status, exploration_decision,
        way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
      ) VALUES ($1,'graded claim','unknown',NULL,NULL,0,0,'0','complete','active','continue',
        'REASONING',$2,NULL,false,ledger.allocate_sequence()) RETURNING node_id
    `, [fixture.runId, fixture.gradedArtifact]);
    await database.pool.query(`
      INSERT INTO ledger.reduced_judgement (
        run_id,node_id,raw_artifact_ref,tau,number_kind,source_ref,producer,
        replay_handle,way_of_knowing,at_seq
      ) VALUES ($1,$2,$3,0.75,'PROBABILITY','judgement:addon','judge:addon',
        'replay:addon','REASONING',ledger.allocate_sequence())
    `, [fixture.runId, node.rows[0]!.node_id, fixture.gradedArtifact]);
    await database.pool.query(`
      INSERT INTO evaluator.pipeline_event (
        run_id,pipeline,pipeline_version,attempt_id,state,reason,input_hash,at_seq
      ) VALUES ($1,'HARVEST',1,gen_random_uuid(),'SUCCEEDED','fixture',$2,ledger.allocate_sequence())
    `, [fixture.runId, "b".repeat(64)]);
    await database.pool.query(`
      INSERT INTO register.register_row (register_version,row_key,value_json,source_ref)
      VALUES (1,'evaluatorJudgeAddonPolicy',$1::jsonb,'fixture:addon-policy')
      ON CONFLICT DO NOTHING
    `, [JSON.stringify({
      kind: "EVALUATOR_JUDGE_ADDON_POLICY",
      collectionState: "COLLECT_ONLY",
      everyNthRun: 1,
      maxAttempts: 2,
      tokenCeiling: 256,
      deadlineMs: 250,
      derivationVersion: 1
    })]);
    const gateway: ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } = {
      call: vi.fn(async () => ({
        rawArtifactRef: fixture.differentGraderArtifact,
        ledgerEntryRef: randomUUID(),
        content: JSON.stringify({
          score: 0.8,
          verdict: "UPHOLD",
          reasons: ["The anonymous grade is supported."]
        }),
        provider: "openai-compatible-http" as const,
        model: "model:evaluator",
        maker: EVALUATOR_MAKER,
        modelVersion: "evaluator-v1"
      }))
    };
    const family: EvaluatorProviderFamilyRow = {
      rowKey: "evaluatorProviderFamily",
      registerVersion: 1,
      sourceRef: "fixture:evaluator-family",
      value: {
        kind: "EVALUATOR_PROVIDER_FAMILY",
        providerRef: EVALUATOR_PROVIDER_REF,
        adapterKind: "vllm-openai-compatible-http",
        maker: EVALUATOR_MAKER,
        chatBaseUrl: "http://vllm:8000/v1",
        modelsPath: "/models",
        deadlineMs: 250,
        source: "LOCAL_CONTAINER_NO_AUTH"
      }
    };

    await expect(runEvaluatorJudgeGradingAddon({
      pool: database.pool,
      runId: fixture.runId,
      family,
      deployment: { configuredProviders: [{ providerRef: "provider:judge", maker: "maker:judge" }] },
      provider: gateway,
      observedAt: new Date("2026-08-15T12:00:00.000Z")
    })).resolves.toMatchObject({ state: "GRADED", observationId: expect.any(String) });
    expect(gateway.call).toHaveBeenCalledTimes(1);
    expect(gateway.call.mock.calls[0]![0]).toMatchObject({
      runId: null,
      subjectItemId: expect.stringMatching(/^evaluator:addon-attempt:/),
      bound: { maxAttempts: 2 }
    });
    const rows = await database.pool.query<{
      step: string; metric: string; truth_basis: string; source_kind: string;
      graded_raw_artifact_ref: string; grader_raw_artifact_ref: string;
    }>(`
      SELECT step,metric,truth_basis,source_kind,graded_raw_artifact_ref,grader_raw_artifact_ref
      FROM evaluator.observation WHERE run_id=$1 AND source_kind='BLIND_JUDGE_GRADE'
    `, [fixture.runId]);
    expect(rows.rows).toEqual([{
      step: "JUDGING",
      metric: "judging.blind-grade.v1",
      truth_basis: "BLIND_ADDON",
      source_kind: "BLIND_JUDGE_GRADE",
      graded_raw_artifact_ref: fixture.gradedArtifact,
      grader_raw_artifact_ref: fixture.differentGraderArtifact
    }]);

    await expect(runEvaluatorJudgeGradingAddon({
      pool: database.pool,
      runId: fixture.runId,
      family,
      deployment: { configuredProviders: [{ providerRef: "provider:judge", maker: "maker:judge" }] },
      provider: gateway
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_ALREADY_GRADED" });
    expect(gateway.call).toHaveBeenCalledTimes(1);
  });
});
