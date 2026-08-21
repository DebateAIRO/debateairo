import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { EvaluatorHarvestRepository } from "../../packages/evaluator/src/index.js";
import {
  reconcileEvaluatorTerminalRuns,
  runEvaluatorTerminalHarvest
} from "../../apps/evaluator-worker/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const meteringWindow = {
  windowStart: new Date("2026-08-15T00:00:00.000Z"),
  windowEnd: new Date("2026-08-16T00:00:00.000Z"),
  asOf: new Date("2026-08-16T00:00:01.000Z")
};
const SETTLED_AT = new Date("2026-08-15T07:00:00.000Z");
const HARVESTED_AT = new Date("2026-08-15T09:00:00.000Z");
const RECONCILED_AT = new Date("2026-08-15T10:00:00.000Z");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

async function createTerminalRun(label: string): Promise<string> {
  const result = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line, asker_id, session_id, caller_scope, as_of, asker_risk_tier,
      risk_tier, tier_source, tier_provenance_ref, composition_budget_tier,
      depth_params, agent_count, discovered_panel, stranger_sample_rate,
      envelope_basis, register_version, battery_version, ask_contract, created_at_seq
    ) VALUES (
      $1,$2,$3,'ASKER',now(),'casual','casual','ASKER',$4,'low','{}'::jsonb,
      1,$5::jsonb,0,'{}'::jsonb,1,'test','{}'::jsonb,ledger.allocate_sequence()
    ) RETURNING run_id
  `, [
    `harvest rework ${label}`, `asker:${label}`, `session:${label}`,
    `test:${label}`, JSON.stringify(fixtureDiscoveredPanel(1))
  ]);
  const runId = result.rows[0]!.run_id;
  await database.pool.query(`
    INSERT INTO core.run_progress_event (run_id, at_seq, kind, value_json)
    VALUES ($1,ledger.allocate_sequence(),'TERMINAL','{"state":"SETTLED"}'::jsonb)
  `, [runId]);
  return runId;
}

async function addArtifactCall(input: {
  readonly runId: string | null;
  readonly callSiteKey: string;
  readonly providerRef: string;
  readonly modelId: string;
  readonly modelVersion: string | null;
  readonly maker: string;
  readonly usage: unknown;
}): Promise<{ readonly artifactId: string; readonly ledgerEntryId: string }> {
  const artifact = await database.pool.query<{ raw_artifact_id: string; attempt_id: string }>(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id, attempt_id, run_id, provider_ref, provider, model_id, maker,
      model_version, raw_text, metadata_json, parse_status, content_hash,
      input_hash, contract_hash, at_seq
    ) VALUES (
      gen_random_uuid(),gen_random_uuid(),$1,$2,'openai-compatible-http',$3,$4,$5,
      '{}',$6::jsonb,'PARSED',$7,'input','contract',ledger.allocate_sequence()
    ) RETURNING raw_artifact_id, attempt_id
  `, [
    input.runId, input.providerRef, input.modelId, input.maker, input.modelVersion,
    JSON.stringify({ usage: input.usage }), "c".repeat(64)
  ]);
  const row = artifact.rows[0]!;
  const entry = await database.pool.query<{ ledger_entry_id: string }>(`
    INSERT INTO ledger.ledger_entry (
      sequence, run_id, attempt_id, action_kind, call_site_key, subject_item_id,
      stance_at_action, outcome, actor_ref, input_hash, contract_hash,
      raw_artifact_ref, started_at, finished_at
    ) VALUES (
      ledger.allocate_sequence(),$1,$2,'MODEL_CALL',$3,$4,'UNASSIGNED','OK',$5,
      'input','contract',$6,$7,$8
    ) RETURNING ledger_entry_id
  `, [
    input.runId, row.attempt_id, input.callSiteKey, `subject:${input.modelId}`,
    input.providerRef, row.raw_artifact_id,
    new Date("2026-08-15T08:00:00.000Z"), new Date("2026-08-15T08:00:01.000Z")
  ]);
  return { artifactId: row.raw_artifact_id, ledgerEntryId: entry.rows[0]!.ledger_entry_id };
}

async function addRootNode(runId: string, artifactId: string): Promise<string> {
  const row = await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,'root claim','unknown',NULL,NULL,0,0,'0','complete','active','continue',
      'REASONING',$2,NULL,false,ledger.allocate_sequence())
    RETURNING node_id
  `, [runId, artifactId]);
  return row.rows[0]!.node_id;
}

async function addStrength(runId: string, nodeId: string): Promise<void> {
  const propagation = await database.pool.query<{ propagation_run_id: string }>(`
    INSERT INTO ledger.propagation_run (
      run_id,input_hash,contract_hash,graph_fingerprint,arrow_order,cluster_records,
      operator_by_parent,transmission_reductions,lift_records,judgement_selection_rule,at_seq
    ) VALUES ($1,'input','contract','graph','[]','[]','[]','[]','[]','{}',ledger.allocate_sequence())
    RETURNING propagation_run_id
  `, [runId]);
  await database.pool.query(`
    INSERT INTO ledger.node_strength_record (
      propagation_run_id,node_id,strength,number_kind,source_ref,producer,replay_handle,
      way_of_knowing,abstained,supported_by,attacked_by,lift_marker
    ) VALUES ($1,$2,0.8,'PROBABILITY','strength:test','propagator:test','replay:test',
      'REASONING',false,'[]','[]','[]')
  `, [propagation.rows[0]!.propagation_run_id, nodeId]);
}

async function addExternalOutcome(input: {
  readonly runId: string;
  readonly provider: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly resolvedAt: Date;
  readonly outcomeKey?: string;
  readonly answerVersion?: number;
}): Promise<string> {
  const answerVersion = input.answerVersion ?? 1;
  const carriers = await database.pool.query<{ work_item_id: string; fact_bundle_id: string }>(`
    WITH work AS (
      INSERT INTO core.work_item (
        run_id,battery_row_id,node_set,command_key,state,created_at_seq
      ) VALUES ($1,'Q61','[]',$2,'DONE',ledger.allocate_sequence())
      RETURNING work_item_id
    ), bundle AS (
      INSERT INTO serve.fact_bundle (run_id,facts,residual_objections,content_hash,version)
      VALUES ($1,'[]','[]',$3,$4) RETURNING fact_bundle_id
    ) SELECT work_item_id,fact_bundle_id FROM work CROSS JOIN bundle
  `, [
    input.runId,
    `${input.outcomeKey ?? "settlement"}:${input.runId}`,
    `hash:${input.outcomeKey ?? "settlement"}:${input.runId}`,
    answerVersion
  ]);
  const answer = await database.pool.query<{ answer_id: string }>(`
    INSERT INTO serve.answer (
      answer_version,run_id,work_item_id,terminal,serve_state,verdict_state,answer_form,
      condition_marks,fact_bundle_id,sealed_at_seq
    ) VALUES ($4,$1,$2,'SERVED','COMPOSED','SUPPORTED','{}','[]',$3,ledger.allocate_sequence())
    RETURNING answer_id
  `, [input.runId, carriers.rows[0]!.work_item_id, carriers.rows[0]!.fact_bundle_id, answerVersion]);
  const outcome = await database.pool.query<{ answer_outcome_id: string }>(`
    INSERT INTO scorecard.answer_outcome (
      outcome_attempt_id,answer_id,answer_version,as_of,run_id,model_id,model_version,
      provider,task_class,prior,posterior,basis,resolver_ref,resolver_is_external,
      resolved_outcome,resolved_at,provenance_ref,scoreability,accepted,at_seq
    ) VALUES (
      gen_random_uuid(),$1,$7,$2,$3,$4,$5,$6,'test',0.5,0.9,'EXTERNAL',
      'resolver:test',true,true,$2,'settlement:test','SCOREABLE',true,ledger.allocate_sequence()
    ) RETURNING answer_outcome_id
  `, [
    answer.rows[0]!.answer_id, input.resolvedAt, input.runId,
    input.modelId, input.modelVersion, input.provider, answerVersion
  ]);
  return outcome.rows[0]!.answer_outcome_id;
}

async function providerEvidenceCounts(): Promise<{ readonly artifacts: number; readonly calls: number }> {
  const result = await database.pool.query<{ artifacts: string; calls: string }>(`
    SELECT (SELECT count(*) FROM ledger.raw_artifact)::text AS artifacts,
           (SELECT count(*) FROM ledger.ledger_entry WHERE action_kind='MODEL_CALL')::text AS calls
  `);
  return { artifacts: Number(result.rows[0]!.artifacts), calls: Number(result.rows[0]!.calls) };
}

async function expectNoProviderEvidenceDuring(action: () => Promise<unknown>): Promise<void> {
  const before = await providerEvidenceCounts();
  await action();
  expect(await providerEvidenceCounts()).toEqual(before);
}

describe("PROG-05 rework regressions", () => {
  it("revisits an already-harvested run and supersedes a backdated late settlement", async () => {
    const runId = await createTerminalRun("late-settlement");
    const author = await addArtifactCall({
      runId, callSiteKey: "runner.author.v1", providerRef: "provider:author",
      modelId: "model:author", modelVersion: "v1", maker: "maker:author",
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3, x_cost_usd: 0.01 }
    });
    await addStrength(runId, await addRootNode(runId, author.artifactId));
    await runEvaluatorTerminalHarvest({
      pool: database.pool, runId, meteringWindow, observedAt: HARVESTED_AT
    });
    const consensus = await database.pool.query<{ observation_id: string; metric: string }>(`
      SELECT observation_id,metric FROM evaluator.observation
      WHERE run_id=$1 AND truth_basis='CONSENSUS' AND source_kind='NODE_STRENGTH'
    `, [runId]);
    expect(consensus.rows).toHaveLength(1);

    const answerOutcomeId = await addExternalOutcome({
      runId, provider: "openai-compatible-http", modelId: "model:author", modelVersion: "v1",
      resolvedAt: SETTLED_AT
    });
    const q59Before = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM scorecard.answer_outcome WHERE run_id=$1", [runId]
    );
    await expect(reconcileEvaluatorTerminalRuns({
      pool: database.pool, meteringWindow, observedAt: RECONCILED_AT
    }))
      .resolves.toEqual([
        expect.objectContaining({ state: "SETTLEMENTS_RECONCILED", observationsInserted: 1 })
      ]);
    const settlement = await database.pool.query<{
      answer_outcome_id: string; supersedes_observation_id: string; metric: string;
      observed_at: Date; provenance_json: { resolved_at: string };
    }>(`
      SELECT answer_outcome_id,supersedes_observation_id,metric,observed_at,provenance_json
      FROM evaluator.observation WHERE run_id=$1 AND truth_basis='SETTLEMENT'
    `, [runId]);
    expect(settlement.rows).toEqual([{
      answer_outcome_id: answerOutcomeId,
      supersedes_observation_id: consensus.rows[0]!.observation_id,
      metric: consensus.rows[0]!.metric,
      observed_at: RECONCILED_AT,
      provenance_json: expect.objectContaining({ resolved_at: SETTLED_AT.toISOString() })
    }]);
    const q59After = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM scorecard.answer_outcome WHERE run_id=$1", [runId]
    );
    expect(q59After.rows[0]!.count).toBe(q59Before.rows[0]!.count);
  });

  it("harvests a run whose backdated settlement already exists on the first pass", async () => {
    const runId = await createTerminalRun("pre-harvest-settlement");
    const author = await addArtifactCall({
      runId, callSiteKey: "runner.author.v1", providerRef: "provider:pre-settled",
      modelId: "model:pre-settled", modelVersion: "v1", maker: "maker:pre-settled", usage: null
    });
    await addStrength(runId, await addRootNode(runId, author.artifactId));
    const answerOutcomeId = await addExternalOutcome({
      runId, provider: "openai-compatible-http", modelId: "model:pre-settled",
      modelVersion: "v1", resolvedAt: SETTLED_AT
    });

    await expect(runEvaluatorTerminalHarvest({
      pool: database.pool, runId, meteringWindow, observedAt: HARVESTED_AT
    })).resolves.toMatchObject({ harvest: { state: "HARVESTED", observationsInserted: 3 } });
    const rows = await database.pool.query<{
      truth_basis: string; answer_outcome_id: string | null;
      supersedes_observation_id: string | null; observed_at: Date;
    }>(`
      SELECT truth_basis,answer_outcome_id,supersedes_observation_id,observed_at
      FROM evaluator.observation WHERE run_id=$1 AND metric='prowess.outcome.v1'
      ORDER BY truth_basis
    `, [runId]);
    expect(rows.rows).toHaveLength(2);
    const consensus = rows.rows.find((row) => row.truth_basis === "CONSENSUS")!;
    const settlement = rows.rows.find((row) => row.truth_basis === "SETTLEMENT")!;
    expect(settlement).toMatchObject({
      answer_outcome_id: answerOutcomeId,
      supersedes_observation_id: expect.any(String),
      observed_at: HARVESTED_AT
    });
    expect(settlement.supersedes_observation_id).toBeTruthy();
    expect(settlement.observed_at.getTime()).toBeGreaterThanOrEqual(consensus.observed_at.getTime());
  });

  it("keeps a second settlement auditable and receipts its unavailable supersession", async () => {
    const runId = await createTerminalRun("two-settlements");
    const author = await addArtifactCall({
      runId, callSiteKey: "runner.author.v1", providerRef: "provider:two-settlements",
      modelId: "model:two-settlements", modelVersion: "v1",
      maker: "maker:two-settlements", usage: null
    });
    await addStrength(runId, await addRootNode(runId, author.artifactId));
    for (const [outcomeKey, resolvedAt, answerVersion] of [
      ["first", SETTLED_AT, 1],
      ["second", new Date("2026-08-15T08:00:00.000Z"), 2]
    ] as const) {
      await addExternalOutcome({
        runId, provider: "openai-compatible-http", modelId: "model:two-settlements",
        modelVersion: "v1", resolvedAt, outcomeKey, answerVersion
      });
    }

    await expect(runEvaluatorTerminalHarvest({
      pool: database.pool, runId, meteringWindow, observedAt: HARVESTED_AT
    })).resolves.toMatchObject({ harvest: { state: "HARVESTED", observationsInserted: 4 } });
    const settlementLinks = await database.pool.query<{ supersedes_observation_id: string | null }>(`
      SELECT supersedes_observation_id FROM evaluator.observation
      WHERE run_id=$1 AND truth_basis='SETTLEMENT' ORDER BY source_ref
    `, [runId]);
    expect(settlementLinks.rows).toHaveLength(2);
    expect(settlementLinks.rows.filter((row) => row.supersedes_observation_id !== null)).toHaveLength(1);
    const receipts = await database.pool.query<{ reason: string }>(`
      SELECT reason FROM evaluator.pipeline_event
      WHERE run_id=$1 AND reason LIKE 'SUPERSESSION_PRIOR_UNAVAILABLE:%'
    `, [runId]);
    expect(receipts.rows).toHaveLength(1);
  });

  it("records malformed observed usage as UNMETERED and still harvests an unrelated run", async () => {
    const poisonMismatch = await addArtifactCall({
      runId: null, callSiteKey: "runner.poison.v1", providerRef: "provider:poison",
      modelId: "model:poison", modelVersion: "v1", maker: "maker:poison",
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 99 }
    });
    const poisonEmpty = await addArtifactCall({
      runId: null, callSiteKey: "runner.poison-empty.v1", providerRef: "provider:poison",
      modelId: "model:poison-empty", modelVersion: "v1", maker: "maker:poison",
      usage: {}
    });
    const poisonUnknown = await addArtifactCall({
      runId: null, callSiteKey: "runner.poison-unknown.v1", providerRef: "provider:poison",
      modelId: "model:poison-unknown", modelVersion: "v1", maker: "maker:poison",
      usage: { input_tokens: 3, output_tokens: 2 }
    });
    const runId = await createTerminalRun("poison-resistant");

    await expect(runEvaluatorTerminalHarvest({
      pool: database.pool, runId, meteringWindow, observedAt: HARVESTED_AT
    }))
      .resolves.toMatchObject({ harvest: { state: "HARVESTED" } });
    const usage = await database.pool.query<{ metering_status: string; raw_usage: unknown }>(`
      SELECT metering_status,raw_usage FROM evaluator.model_call_usage
      WHERE ledger_entry_id = ANY($1::uuid[]) ORDER BY ledger_entry_id
    `, [[poisonMismatch.ledgerEntryId, poisonEmpty.ledgerEntryId, poisonUnknown.ledgerEntryId]]);
    expect(usage.rows).toEqual([
      { metering_status: "UNMETERED", raw_usage: null },
      { metering_status: "UNMETERED", raw_usage: null },
      { metering_status: "UNMETERED", raw_usage: null }
    ]);
  });

  it("reports an outer metering failure without fabricating a failed-call count", async () => {
    const runId = await createTerminalRun("metering-outer-failure");
    const result = await runEvaluatorTerminalHarvest({
      pool: database.pool,
      runId,
      observedAt: HARVESTED_AT,
      meteringWindow: {
        windowStart: new Date("2026-08-16T00:00:00.000Z"),
        windowEnd: new Date("2026-08-15T00:00:00.000Z"),
        asOf: new Date("2026-08-16T00:00:01.000Z")
      }
    });

    expect(result.metering).toEqual({
      callsProjected: 0,
      callsFailed: 0,
      relativeCostCellsDerived: 0,
      failureReason: "METERING_RECONCILIATION_FAILED"
    });
    expect(result.harvest).toMatchObject({ state: "HARVESTED", runId });
  });

  it("proves the zero-provider-call assertion detects injected evidence and passes for harvest", async () => {
    await expect(expectNoProviderEvidenceDuring(async () => {
      await addArtifactCall({
        runId: null, callSiteKey: "test.injected-provider-call", providerRef: "provider:injected",
        modelId: "model:injected", modelVersion: "v1", maker: "maker:injected", usage: null
      });
    })).rejects.toThrow();
    const runId = await createTerminalRun("zero-provider-call");
    await expectNoProviderEvidenceDuring(async () => {
      await runEvaluatorTerminalHarvest({
        pool: database.pool, runId, meteringWindow, observedAt: HARVESTED_AT
      });
    });
  });

  it("records MODEL_IDENTITY_INCOMPLETE for skipped source evidence", async () => {
    const runId = await createTerminalRun("missing-version");
    const versionless = await addArtifactCall({
      runId, callSiteKey: "runner.author.v1", providerRef: "provider:versionless",
      modelId: "model:versionless", modelVersion: null, maker: "maker:versionless", usage: null
    });
    await addRootNode(runId, versionless.artifactId);

    await runEvaluatorTerminalHarvest({
      pool: database.pool, runId, meteringWindow, observedAt: HARVESTED_AT
    });
    const receipts = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.pipeline_event
      WHERE run_id=$1 AND reason LIKE 'MODEL_IDENTITY_INCOMPLETE%'
    `, [runId]);
    expect(receipts.rows).toEqual([{
      state: "SKIPPED",
      reason: `MODEL_IDENTITY_INCOMPLETE:${versionless.artifactId}`
    }]);
  });

  it("isolates a poisoned run, harvests a later healthy run, and bounds poison retries", async () => {
    const runIds = [
      await createTerminalRun("batch-order-a"),
      await createTerminalRun("batch-order-b")
    ].sort();
    const [poisonRunId, healthyRunId] = runIds as [string, string];
    for (const [runId, suffix] of [[poisonRunId, "poison"], [healthyRunId, "healthy"]] as const) {
      const artifact = await addArtifactCall({
        runId, callSiteKey: `runner.${suffix}.v1`, providerRef: `provider:${suffix}`,
        modelId: `model:${suffix}`, modelVersion: "v1", maker: `maker:${suffix}`, usage: null
      });
      await addRootNode(runId, artifact.artifactId);
    }
    await database.pool.query(`
      CREATE FUNCTION evaluator.fail_prog05_batch_poison() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.run_id = '${poisonRunId}'::uuid THEN
          RAISE EXCEPTION 'PROG05_BATCH_POISON';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_prog05_batch_poison BEFORE INSERT ON evaluator.observation
      FOR EACH ROW EXECUTE FUNCTION evaluator.fail_prog05_batch_poison();
    `);
    try {
      const firstResults = await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      expect(firstResults).toEqual(expect.arrayContaining([
        { state: "FAILED", runId: poisonRunId, reason: "TERMINAL_HARVEST_FAILED" },
        expect.objectContaining({ state: "HARVESTED", runId: healthyRunId })
      ]));
      const healthy = await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM evaluator.observation WHERE run_id=$1", [healthyRunId]
      );
      expect(healthy.rows[0]!.count).toBe("1");

      await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      const fourthResults = await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      expect(fourthResults.some((result) => result.runId === poisonRunId)).toBe(false);
      const failures = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM evaluator.pipeline_event
        WHERE run_id=$1 AND state='FAILED' AND reason='TERMINAL_HARVEST_FAILED'
      `, [poisonRunId]);
      expect(failures.rows[0]!.count).toBe("3");
    } finally {
      await database.pool.query("DROP TRIGGER fail_prog05_batch_poison ON evaluator.observation");
      await database.pool.query("DROP FUNCTION evaluator.fail_prog05_batch_poison()");
    }
  });

  it("parks a phase-1 failure after three attempts without starving a healthy run", async () => {
    const runIds = [
      await createTerminalRun("prepare-order-a"),
      await createTerminalRun("prepare-order-b")
    ].sort();
    const [poisonRunId, healthyRunId] = runIds as [string, string];
    for (const [runId, suffix] of [[poisonRunId, "prepare-poison"], [healthyRunId, "prepare-healthy"]] as const) {
      const artifact = await addArtifactCall({
        runId, callSiteKey: `runner.${suffix}.v1`, providerRef: `provider:${suffix}`,
        modelId: `model:${suffix}`, modelVersion: "v1", maker: `maker:${suffix}`, usage: null
      });
      await addRootNode(runId, artifact.artifactId);
    }
    await database.pool.query(`
      CREATE FUNCTION evaluator.fail_prog05_prepare_poison() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.run_id = '${poisonRunId}'::uuid AND NEW.state = 'STARTED' THEN
          RAISE EXCEPTION 'PROG05_PREPARE_POISON';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER fail_prog05_prepare_poison BEFORE INSERT ON evaluator.pipeline_event
      FOR EACH ROW EXECUTE FUNCTION evaluator.fail_prog05_prepare_poison();
    `);
    try {
      const firstResults = await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      expect(firstResults).toEqual(expect.arrayContaining([
        { state: "FAILED", runId: poisonRunId, reason: "TERMINAL_HARVEST_FAILED" },
        expect.objectContaining({ state: "HARVESTED", runId: healthyRunId })
      ]));

      await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      const fourthResults = await reconcileEvaluatorTerminalRuns({
        pool: database.pool, meteringWindow, observedAt: HARVESTED_AT
      });
      expect(fourthResults.some((result) => result.runId === poisonRunId)).toBe(false);
      const failures = await database.pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM evaluator.pipeline_event
        WHERE run_id=$1 AND state='FAILED' AND reason='TERMINAL_HARVEST_FAILED'
      `, [poisonRunId]);
      expect(failures.rows[0]!.count).toBe("3");
    } finally {
      await database.pool.query("DROP TRIGGER fail_prog05_prepare_poison ON evaluator.pipeline_event");
      await database.pool.query("DROP FUNCTION evaluator.fail_prog05_prepare_poison()");
    }
  });

  it("keeps STARTED and FAILED receipts durable when an observation write fails", async () => {
    const runId = await createTerminalRun("failed-receipt");
    const author = await addArtifactCall({
      runId, callSiteKey: "runner.author.v1", providerRef: "provider:failure",
      modelId: "model:failure", modelVersion: "v1", maker: "maker:failure", usage: null
    });
    await addRootNode(runId, author.artifactId);
    await database.pool.query(`
      CREATE FUNCTION evaluator.fail_prog05_rework_test() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'PROG05_FORCED_OBSERVATION_FAILURE'; END $$;
      CREATE TRIGGER fail_prog05_rework_test BEFORE INSERT ON evaluator.observation
      FOR EACH ROW EXECUTE FUNCTION evaluator.fail_prog05_rework_test();
    `);
    try {
      await expect(new EvaluatorHarvestRepository(database.pool)
        .harvestTerminalRun(runId, HARVESTED_AT))
        .rejects.toThrow(/PROG05_FORCED_OBSERVATION_FAILURE/);
      const receipts = await database.pool.query<{ state: string; reason: string }>(`
        SELECT state,reason FROM evaluator.pipeline_event WHERE run_id=$1 ORDER BY at_seq
      `, [runId]);
      expect(receipts.rows).toEqual([
        { state: "STARTED", reason: "TERMINAL_HARVEST_STARTED" },
        { state: "FAILED", reason: "TERMINAL_HARVEST_FAILED" }
      ]);
    } finally {
      await database.pool.query("DROP TRIGGER fail_prog05_rework_test ON evaluator.observation");
      await database.pool.query("DROP FUNCTION evaluator.fail_prog05_rework_test() ");
    }
  });
});
