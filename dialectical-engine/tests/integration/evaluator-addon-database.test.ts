import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@debateai/db";
import type { ProviderGateway } from "@debateai/providers";
import {
  PostgresEvaluatorAddonRepository,
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

async function seedRunAndArtifacts(registerVersion = 1): Promise<{
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
      '{}'::jsonb, $2, 'test', '{}'::jsonb, ledger.allocate_sequence()
    ) RETURNING run_id
  `, [JSON.stringify(fixtureDiscoveredPanel(1)), registerVersion]);
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

const validPolicyValue = Object.freeze({
  kind: "EVALUATOR_JUDGE_ADDON_POLICY" as const,
  collectionState: "COLLECT_ONLY" as const,
  everyNthRun: 1,
  maxAttempts: 2,
  tokenCeiling: 256,
  deadlineMs: 250,
  derivationVersion: 1
});

function evaluatorFamily(registerVersion: number): EvaluatorProviderFamilyRow {
  return {
    rowKey: "evaluatorProviderFamily",
    registerVersion,
    sourceRef: `fixture:evaluator-family:${registerVersion}`,
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
}

async function seedGradableRun(input: {
  readonly registerVersion: number;
  readonly policyValue?: unknown;
}): Promise<Awaited<ReturnType<typeof seedRunAndArtifacts>>> {
  const fixture = await seedRunAndArtifacts(input.registerVersion);
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
    VALUES ($1,'evaluatorJudgeAddonPolicy',$2::jsonb,$3)
    ON CONFLICT DO NOTHING
  `, [
    input.registerVersion,
    JSON.stringify(input.policyValue ?? validPolicyValue),
    `fixture:addon-policy:${input.registerVersion}`
  ]);
  return fixture;
}

function successfulGateway(
  graderRawArtifactRef: string,
  delayMs = 0
): ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } {
  return {
    call: vi.fn(async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        rawArtifactRef: graderRawArtifactRef,
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
      };
    })
  };
}

function concurrencyPool(connectionString: string): {
  readonly pool: Pool;
  stop(): Promise<void>;
} {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 250
  });
  let stopping = false;
  pool.on("error", (error) => {
    if (stopping && "code" in error && error.code === "57P01") return;
    throw error;
  });
  return {
    pool,
    async stop() {
      stopping = true;
      await pool.end();
    }
  };
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

  it("enforces the SQL-backed cross-invocation ceiling after three real failed passes", async () => {
    const registerVersion = 7001;
    const fixture = await seedGradableRun({ registerVersion });
    const gateway: ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } = {
      call: vi.fn(async () => { throw new Error("grader unavailable"); })
    };
    const input = {
      pool: database.pool,
      runId: fixture.runId,
      family: evaluatorFamily(registerVersion),
      deployment: { configuredProviders: [{ providerRef: "provider:judge", maker: "maker:judge" }] },
      provider: gateway
    };

    const results = [];
    for (let invocation = 0; invocation < 4; invocation += 1) {
      results.push(await runEvaluatorJudgeGradingAddon(input));
    }
    expect(results.slice(0, 3)).toEqual([
      { state: "FAILED", reason: "ADDON_PROVIDER_FAILED" },
      { state: "FAILED", reason: "ADDON_PROVIDER_FAILED" },
      { state: "FAILED", reason: "ADDON_PROVIDER_FAILED" }
    ]);
    expect(results[3]).toEqual({ state: "SKIPPED", reason: "ADDON_RETRY_LIMIT_REACHED" });
    expect(gateway.call).toHaveBeenCalledTimes(3);
    await expect(new PostgresEvaluatorAddonRepository(database.pool).loadCandidate(fixture.runId))
      .resolves.toBe("RETRY_LIMIT_REACHED");
    const attempts = await database.pool.query<{ count: string }>(`
      SELECT count(DISTINCT attempt_id)::text AS count FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='ADDON' AND state='STARTED'
    `, [fixture.runId]);
    expect(attempts.rows[0]!.count).toBe("3");
  });

  it("does not burn run attempts during a deployment isolation fault", async () => {
    const registerVersion = 7002;
    const fixture = await seedGradableRun({ registerVersion });
    const gateway = successfulGateway(fixture.differentGraderArtifact);
    const base = {
      pool: database.pool,
      runId: fixture.runId,
      family: evaluatorFamily(registerVersion),
      provider: gateway
    };
    for (let sweep = 0; sweep < 3; sweep += 1) {
      await expect(runEvaluatorJudgeGradingAddon({
        ...base,
        deployment: {
          configuredProviders: [{ providerRef: EVALUATOR_PROVIDER_REF, maker: EVALUATOR_MAKER }]
        }
      })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_PROVIDER_ISOLATION_FAILED" });
    }
    const faultReceipts = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='ADDON' ORDER BY at_seq
    `, [fixture.runId]);
    expect(faultReceipts.rows).toEqual([
      { state: "SKIPPED", reason: "ADDON_PROVIDER_ISOLATION_FAILED" },
      { state: "SKIPPED", reason: "ADDON_PROVIDER_ISOLATION_FAILED" },
      { state: "SKIPPED", reason: "ADDON_PROVIDER_ISOLATION_FAILED" }
    ]);

    await expect(runEvaluatorJudgeGradingAddon({
      ...base,
      deployment: { configuredProviders: [{ providerRef: "provider:judge", maker: "maker:judge" }] }
    })).resolves.toMatchObject({ state: "GRADED" });
    expect(gateway.call).toHaveBeenCalledTimes(1);
  });

  it("persists invalid-policy and family-version preflight receipts and permits recovery", async () => {
    const invalidPolicyVersion = 7003;
    const invalidPolicyRun = await seedGradableRun({
      registerVersion: invalidPolicyVersion,
      policyValue: { kind: "INVALID_POLICY" }
    });
    const invalidGateway = successfulGateway(invalidPolicyRun.differentGraderArtifact);
    await expect(runEvaluatorJudgeGradingAddon({
      pool: database.pool,
      runId: invalidPolicyRun.runId,
      family: evaluatorFamily(invalidPolicyVersion),
      deployment: { configuredProviders: [] },
      provider: invalidGateway
    })).resolves.toEqual({ state: "SKIPPED", reason: "ADDON_POLICY_INVALID" });
    const invalidReceipt = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='ADDON' ORDER BY at_seq
    `, [invalidPolicyRun.runId]);
    expect(invalidReceipt.rows).toEqual([{ state: "SKIPPED", reason: "ADDON_POLICY_INVALID" }]);
    expect(invalidGateway.call).not.toHaveBeenCalled();

    const runRegisterVersion = 7004;
    const versionedRun = await seedGradableRun({ registerVersion: runRegisterVersion });
    const versionedGateway = successfulGateway(versionedRun.differentGraderArtifact);
    await expect(runEvaluatorJudgeGradingAddon({
      pool: database.pool,
      runId: versionedRun.runId,
      family: evaluatorFamily(runRegisterVersion + 1),
      deployment: { configuredProviders: [] },
      provider: versionedGateway
    })).resolves.toEqual({
      state: "SKIPPED",
      reason: "ADDON_FAMILY_REGISTER_VERSION_MISMATCH"
    });
    const mismatchReceipt = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='ADDON' ORDER BY at_seq
    `, [versionedRun.runId]);
    expect(mismatchReceipt.rows).toEqual([{
      state: "SKIPPED",
      reason: "ADDON_FAMILY_REGISTER_VERSION_MISMATCH"
    }]);
    await expect(runEvaluatorJudgeGradingAddon({
      pool: database.pool,
      runId: versionedRun.runId,
      family: evaluatorFamily(runRegisterVersion),
      deployment: { configuredProviders: [] },
      provider: versionedGateway
    })).resolves.toMatchObject({ state: "GRADED" });
    expect(versionedGateway.call).toHaveBeenCalledTimes(1);
  });

  it("keeps twelve same-run invocations above pool max bounded to one provider call", async () => {
    const registerVersion = 7005;
    const fixture = await seedGradableRun({ registerVersion });
    const gateway = successfulGateway(fixture.differentGraderArtifact, 40);
    const concurrent = concurrencyPool(database.connectionString);
    const { pool } = concurrent;
    const input = {
      pool,
      runId: fixture.runId,
      family: evaluatorFamily(registerVersion),
      deployment: { configuredProviders: [{ providerRef: "provider:judge", maker: "maker:judge" }] },
      provider: gateway
    };
    let results: Awaited<ReturnType<typeof runEvaluatorJudgeGradingAddon>>[];
    try {
      results = await Promise.all(Array.from({ length: 12 }, () =>
        runEvaluatorJudgeGradingAddon(input)));
      await expect(pool.query("SELECT 1 AS recovered")).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await concurrent.stop();
    }
    expect(gateway.call).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.state === "GRADED")).toHaveLength(1);
    expect(results.filter((result) =>
      result.state === "SKIPPED" && result.reason === "ADDON_PASS_IN_FLIGHT")).toHaveLength(11);
    const inFlightReceipts = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.pipeline_event
      WHERE run_id=$1 AND pipeline='ADDON' AND state='SKIPPED'
        AND reason='ADDON_PASS_IN_FLIGHT'
    `, [fixture.runId]);
    expect(inFlightReceipts.rows[0]!.count).toBe("11");
  }, 15_000);

  it("completes twelve distinct-run passes above pool max and leaves the pool usable", async () => {
    const registerVersion = 7006;
    const fixtures: Awaited<ReturnType<typeof seedGradableRun>>[] = [];
    for (let index = 0; index < 12; index += 1) {
      fixtures.push(await seedGradableRun({ registerVersion }));
    }
    const gateways = fixtures.map((fixture) => successfulGateway(fixture.differentGraderArtifact, 40));
    const concurrent = concurrencyPool(database.connectionString);
    const { pool } = concurrent;
    let results: Awaited<ReturnType<typeof runEvaluatorJudgeGradingAddon>>[];
    try {
      results = await Promise.all(fixtures.map((fixture, index) =>
        runEvaluatorJudgeGradingAddon({
          pool,
          runId: fixture.runId,
          family: evaluatorFamily(registerVersion),
          deployment: {
            configuredProviders: [{ providerRef: "provider:judge", maker: "maker:judge" }]
          },
          provider: gateways[index]!
        })));
      await expect(pool.query("SELECT 1 AS recovered")).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await concurrent.stop();
    }
    expect(results.filter((result) => result.state === "GRADED")).toHaveLength(12);
    expect(gateways.reduce((count, gateway) => count + gateway.call.mock.calls.length, 0)).toBe(12);
  });
});
