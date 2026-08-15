import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertNoOpenWriteTransaction, migrate } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";
import { OpenAICompatibleProviderGateway, type ProviderGateway } from "@debateai/providers";
import {
  BLIND_SAMPLE_EXCERPT_MAX_BYTES,
  DomainRegistryRepository,
  EvaluatorHarvestRepository,
  PostgresEvaluatorConsumerRepository,
  type EvaluatorProviderFamilyRow
} from "../../packages/evaluator/src/index.js";
import {
  runOnDemandEvaluatorConsumerRefresh,
  runPostAggregateEvaluatorConsumerRefresh
} from "../../apps/evaluator-worker/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

let database: TestDatabase;
let selectionId: string;
let lawDomainId: string;
let consumerArtifactId: string;
const sourceIdentitySentinels = Object.freeze({
  providerRef: "provider:sample-source-must-not-leak",
  maker: "maker:sample-source-must-not-leak"
});

const FIRST_AS_OF = new Date("2026-08-15T10:00:00.000Z");
const SECOND_AS_OF = new Date("2026-08-15T11:00:00.000Z");
const THIRD_AS_OF = new Date("2026-08-15T12:00:00.000Z");
const FOURTH_AS_OF = new Date("2026-08-15T13:00:00.000Z");

const family: EvaluatorProviderFamilyRow = {
  rowKey: "evaluatorProviderFamily",
  registerVersion: 1,
  sourceRef: "fixture:consumer-family",
  value: {
    kind: "EVALUATOR_PROVIDER_FAMILY",
    providerRef: "provider:evaluator-vllm",
    adapterKind: "vllm-openai-compatible-http",
    maker: "maker:evaluator-local-vllm",
    chatBaseUrl: "http://vllm:8000/v1",
    modelsPath: "/models",
    deadlineMs: 250,
    source: "LOCAL_CONTAINER_NO_AUTH"
  }
};

const workerBase = {
  family,
  deployment: { configuredProviders: [{ providerRef: "provider:product", maker: "maker:product" }] },
  bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 250 }
};

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const domains = await database.pool.query<{ domain_id: string; canonical_name: string }>(`
    INSERT INTO evaluator.domain (
      canonical_name,normalized_name,origin,guardrail_version,provenance_ref,admitted_at,at_seq
    ) VALUES
      ('Law','law','STARTER',1,'fixture:law',$1,ledger.allocate_sequence()),
      ('Medicine','medicine','STARTER',1,'fixture:medicine',$1,ledger.allocate_sequence())
    RETURNING domain_id,canonical_name
  `, [FIRST_AS_OF]);
  lawDomainId = domains.rows.find((row) => row.canonical_name === "Law")!.domain_id;

  const probe = await database.pool.query<{ vllm_probe_id: string }>(`
    INSERT INTO evaluator.vllm_probe (
      provider_ref,state,failure_code,started_at,finished_at,at_seq
    ) VALUES ('provider:evaluator-vllm','AVAILABLE',NULL,$1,$1,ledger.allocate_sequence())
    RETURNING vllm_probe_id
  `, [FIRST_AS_OF]);
  await database.pool.query(`
    INSERT INTO evaluator.vllm_catalog_model (vllm_probe_id,model_id,metadata_json,at_seq)
    VALUES ($1,'consumer:local','{"id":"consumer:local"}'::jsonb,ledger.allocate_sequence())
  `, [probe.rows[0]!.vllm_probe_id]);
  const selection = await database.pool.query<{ consumer_selection_id: string }>(`
    INSERT INTO evaluator.consumer_selection (
      vllm_probe_id,model_id,selected_by,order_ref,selected_at,at_seq
    ) VALUES ($1,'consumer:local','developer','order:test-consumer',$2,ledger.allocate_sequence())
    RETURNING consumer_selection_id
  `, [probe.rows[0]!.vllm_probe_id,FIRST_AS_OF]);
  selectionId = selection.rows[0]!.consumer_selection_id;

  consumerArtifactId = randomUUID();
  await database.pool.query(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,
      model_version,raw_text,metadata_json,parse_status,content_hash,input_hash,
      contract_hash,at_seq
    ) VALUES (
      $1,gen_random_uuid(),NULL,'provider:evaluator-vllm','openai-compatible-http',
      'consumer:local','maker:evaluator-local-vllm','consumer-v1','{}','{}'::jsonb,
      'PARSED',$2,'fixture:input','fixture:contract',ledger.allocate_sequence()
    )
  `, [consumerArtifactId,"a".repeat(64)]);
  await insertAggregate(FIRST_AS_OF, 1, 0.65);
  for (const [index, claim] of [
    "A short anonymous legal claim.",
    "A second anonymous legal claim.",
    "A third anonymous legal claim.",
    "🧭".repeat(60_000)
  ].entries()) {
    await insertHarvestedSample({
      label: `consumer-sample-${index}`,
      questionLine: `Can anonymous legal claim ${index} be sustained?`,
      claimText: claim,
      observedAt: new Date(FIRST_AS_OF.getTime() - (4 - index) * 60_000),
      withDomain: true
    });
  }
}, 120_000);

afterAll(async () => database?.stop());

async function insertAggregate(asOf: Date, version: number, value: number): Promise<void> {
  const cell = await database.pool.query<{ profile_cell_id: string }>(`
    INSERT INTO evaluator.profile_cell (
      provider,model_id,model_version,domain_id,step,metric,as_of,value,n,
      interval_lower,interval_upper,consensus_count,settlement_count,addon_count,
      basis,derivation_version,derivation_input,derivation_hash,strategy_row_key,
      strategy_register_version,strategy_source_ref,at_seq
    ) VALUES (
      'openai-compatible-http','consumer:local','consumer-v1',$1,'JUDGING',
      'prowess.judging-tau.v1',$2,$3,8,$4,$5,8,0,0,'MEASURED_PROCESS',$6,
      $7::jsonb,$8,'evaluatorProfileStrategy',1,'fixture:profile-strategy',
      ledger.allocate_sequence()
    ) RETURNING profile_cell_id
  `, [
    lawDomainId,asOf,value,value - 0.1,value + 0.1,version,
    JSON.stringify([`fixture:aggregate:${version}`]),String(version).padStart(64,"0")
  ]);
  await database.pool.query(`
    INSERT INTO evaluator.rank_snapshot (
      rank_kind,provider,model_id,model_version,domain_id,step,metric,ordinal,score,n,
      interval_lower,interval_upper,source_profile_cell_ids,source_hash,
      derivation_version,as_of,at_seq
    ) VALUES (
      'PROWESS','openai-compatible-http','consumer:local','consumer-v1',$1,'JUDGING',
      'prowess.judging-tau.v1',1,$2,8,$3,$4,$5::jsonb,$6,$7,$8,ledger.allocate_sequence()
    )
  `, [
    lawDomainId,value,value - 0.1,value + 0.1,JSON.stringify([cell.rows[0]!.profile_cell_id]),
    String(version + 10).padStart(64,"0"),version,asOf
  ]);
}

async function insertHarvestedSample(input: {
  readonly label: string;
  readonly questionLine: string;
  readonly claimText: string;
  readonly observedAt: Date;
  readonly withDomain: boolean;
}): Promise<void> {
  const run = await database.pool.query<{ run_id: string }>(`
    INSERT INTO core.run (
      question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,
      risk_tier,tier_source,tier_provenance_ref,composition_budget_tier,
      depth_params,agent_count,discovered_panel,stranger_sample_rate,envelope_basis,
      register_version,battery_version,ask_contract,created_at_seq
    ) VALUES ($1,$2,$3,'ASKER',$4,'casual','casual','ASKER',$5,'low','{}'::jsonb,
      3,$6::jsonb,0,'{}'::jsonb,1,'test','{}'::jsonb,ledger.allocate_sequence())
    RETURNING run_id
  `, [
    input.questionLine,`asker:${input.label}`,`session:${input.label}`,
    input.observedAt,`fixture:${input.label}`,JSON.stringify(fixtureDiscoveredPanel(3))
  ]);
  const runId = run.rows[0]!.run_id;
  if (input.withDomain) {
    const registry = new DomainRegistryRepository(database.pool);
    const admission = await registry.admitProposal({
      runId,
      proposedName: "Law",
      provider: "provider:fixture-tagger",
      modelId: "model:fixture-tagger",
      modelVersion: "v1",
      rawArtifactRef: null,
      provenanceRef: `fixture:${input.label}:domain`
    });
    await registry.assignQuestionDomain({
      runId,
      domainId: lawDomainId,
      domainAdmissionId: admission.domainAdmissionId,
      basis: "BACKFILL",
      rawArtifactRef: null
    });
  }
  const artifactId = randomUUID();
  await database.pool.query(`
    INSERT INTO ledger.raw_artifact (
      raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,
      model_version,raw_text,metadata_json,parse_status,content_hash,input_hash,
      contract_hash,at_seq
    ) VALUES ($1,gen_random_uuid(),$2,$3,'openai-compatible-http','consumer:local',$4,
      'consumer-v1','{}','{}'::jsonb,'PARSED',$5,$6,$7,ledger.allocate_sequence())
  `, [
    artifactId,runId,sourceIdentitySentinels.providerRef,sourceIdentitySentinels.maker,
    "b".repeat(64),`fixture:${input.label}:input`,`fixture:${input.label}:contract`
  ]);
  const node = await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,
      materialized_path,generation_status,path_status,exploration_decision,
      way_of_knowing,provenance_ref,locator,value_laden,created_at_seq
    ) VALUES ($1,$2,'unknown',NULL,NULL,0,0,'0','complete','active','continue',
      'REASONING',$3,NULL,false,ledger.allocate_sequence()) RETURNING node_id
  `, [runId,input.claimText,artifactId]);
  await database.pool.query(`
    INSERT INTO ledger.reduced_judgement (
      run_id,node_id,raw_artifact_ref,tau,number_kind,source_ref,producer,
      replay_handle,way_of_knowing,at_seq
    ) VALUES ($1,$2,$3,0.75,'PROBABILITY',$4,$5,$6,'REASONING',ledger.allocate_sequence())
  `, [
    runId,node.rows[0]!.node_id,artifactId,`judgement:${input.label}`,
    `judge:${sourceIdentitySentinels.maker}`,`replay:${input.label}`
  ]);
  await database.pool.query(`
    INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
    VALUES ($1,ledger.allocate_sequence(),'TERMINAL','{"state":"SETTLED"}'::jsonb)
  `, [runId]);
  await expect(new EvaluatorHarvestRepository(database.pool)
    .harvestTerminalRun(runId, input.observedAt))
    .resolves.toMatchObject({ state: "HARVESTED" });
}

async function startRealConsumerProvider(): Promise<{
  readonly gateway: ProviderGateway;
  readonly requestBodies: string[];
  readonly stop: () => Promise<void>;
}> {
  const requestBodies: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requestBodies.push(Buffer.concat(chunks).toString("utf8"));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: "consumer-http-fixture",
        model: "consumer:local",
        choices: [{ message: { content: JSON.stringify({
          bias_pattern_name: "Measured and cautious",
          capability_summary: "The deterministic aggregates indicate strong legal judging.",
          adjacent_domain_flags: []
        }) } }]
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("consumer fixture did not bind");
  const ledger = new LedgerRepository(database.pool);
  return {
    requestBodies,
    gateway: new OpenAICompatibleProviderGateway({
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      model: "consumer:local",
      maker: family.value.maker,
      assertNoOpenWriteTransaction,
      persistRawArtifact: (artifact) => ledger.appendRawArtifact(artifact),
      appendLedgerEntry: async (entry) => (await ledger.append(entry)).ledgerEntryId
    }),
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function successfulProvider(delayMs = 0): ProviderGateway & { readonly call: ReturnType<typeof vi.fn> } {
  return {
    call: vi.fn(async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        rawArtifactRef: consumerArtifactId,
        ledgerEntryRef: randomUUID(),
        content: JSON.stringify({
          bias_pattern_name: "Measured and cautious",
          capability_summary: "The deterministic aggregates indicate strong legal judging.",
          adjacent_domain_flags: []
        }),
        provider: "openai-compatible-http" as const,
        model: "consumer:local",
        maker: "maker:evaluator-local-vllm",
        modelVersion: "consumer-v1"
      };
    })
  };
}

describe("persisted evaluator consumer refresh", () => {
  it("writes a versioned own-model interpretation while keeping numeric cells code-owned", async () => {
    const provider = await startRealConsumerProvider();
    try {
      await expect(runOnDemandEvaluatorConsumerRefresh({
        ...workerBase,
        pool: database.pool,
        provider: provider.gateway,
        observedAt: FIRST_AS_OF
      })).resolves.toMatchObject({ state: "REFRESHED", outputsInserted: 1, failures: 0 });
    } finally {
      await provider.stop();
    }

    expect(provider.requestBodies).toHaveLength(1);
    const onWire = JSON.parse(provider.requestBodies[0]!) as {
      messages: readonly { readonly role: string; readonly content: string }[];
    };
    const requestBytes = JSON.stringify(onWire.messages);
    const payload = JSON.parse(onWire.messages[1]!.content) as {
      blinded_samples: readonly {
        sample_id: string;
        question_excerpt: string;
        task_excerpt: string;
      }[];
    };
    expect(payload.blinded_samples).toHaveLength(3);
    expect(payload.blinded_samples.every((sample) => sample.sample_id.startsWith("opaque:sample-")))
      .toBe(true);
    expect(payload.blinded_samples.some((sample) =>
      Buffer.byteLength(sample.task_excerpt, "utf8") === BLIND_SAMPLE_EXCERPT_MAX_BYTES)).toBe(true);
    expect(payload.blinded_samples.every((sample) =>
      Buffer.byteLength(sample.question_excerpt, "utf8") <= BLIND_SAMPLE_EXCERPT_MAX_BYTES
      && Buffer.byteLength(sample.task_excerpt, "utf8") <= BLIND_SAMPLE_EXCERPT_MAX_BYTES)).toBe(true);
    expect(requestBytes).not.toContain("provider:evaluator-vllm");
    expect(requestBytes).not.toContain("consumer:local");
    expect(requestBytes).not.toContain("consumer-v1");
    expect(requestBytes).not.toContain(sourceIdentitySentinels.providerRef);
    expect(requestBytes).not.toContain(sourceIdentitySentinels.maker);

    const output = await database.pool.query<{
      consumer_selection_id: string;
      target_model_id: string;
      summary: string;
      aggregate_refs: string[];
      blinded_sample_refs: string[];
    }>(`
      SELECT consumer_selection_id,target_model_id,summary,aggregate_refs,blinded_sample_refs
      FROM evaluator.consumer_output
    `);
    expect(output.rows).toEqual([expect.objectContaining({
      consumer_selection_id: selectionId,
      target_model_id: "consumer:local",
      aggregate_refs: expect.arrayContaining([
        expect.stringMatching(/^profile_cell:/),
        expect.stringMatching(/^rank_snapshot:/)
      ]),
      blinded_sample_refs: expect.arrayContaining([
        expect.stringMatching(/^opaque:sample-/),
        expect.stringMatching(/^opaque:sample-/),
        expect.stringMatching(/^opaque:sample-/)
      ])
    })]);
    expect(JSON.parse(output.rows[0]!.summary)).toEqual({
      bias_pattern_name: "Measured and cautious",
      capability_summary: "The deterministic aggregates indicate strong legal judging."
    });
    const numeric = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.profile_cell
      WHERE provider='openai-compatible-http' AND model_id='consumer:local'
    `);
    expect(numeric.rows[0]!.count).toBe("1");

    const receipts = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.consumer_refresh_receipt ORDER BY at_seq
    `);
    expect(receipts.rows).toEqual([
      { state: "STARTED", reason: "CONSUMER_REFRESH_STARTED" },
      { state: "SUCCEEDED", reason: "CONSUMER_OUTPUT_PERSISTED" }
    ]);
  });

  it("supports on-demand idempotency and post-aggregate version refresh", async () => {
    const currentGateway = successfulProvider();
    await expect(runOnDemandEvaluatorConsumerRefresh({
      ...workerBase,
      pool: database.pool,
      provider: currentGateway,
      observedAt: new Date("2026-08-15T10:30:00.000Z")
    })).resolves.toMatchObject({ state: "REFRESHED", outputsCurrent: 1 });
    expect(currentGateway.call).not.toHaveBeenCalled();

    await insertAggregate(SECOND_AS_OF, 2, 0.8);
    const refreshedGateway = successfulProvider();
    await expect(runPostAggregateEvaluatorConsumerRefresh({
      ...workerBase,
      pool: database.pool,
      provider: refreshedGateway,
      aggregateAsOf: SECOND_AS_OF,
      observedAt: SECOND_AS_OF
    })).resolves.toMatchObject({ state: "REFRESHED", outputsInserted: 1 });
    expect(refreshedGateway.call).toHaveBeenCalledTimes(1);

    const versions = await database.pool.query<{ count: string; hashes: string }>(`
      SELECT count(*)::text AS count,count(DISTINCT aggregate_snapshot_hash)::text AS hashes
      FROM evaluator.consumer_output
    `);
    expect(versions.rows[0]).toEqual({ count: "2", hashes: "2" });
  });

  it("persists adversarial refusal receipts and never corrupts the output table", async () => {
    await insertAggregate(THIRD_AS_OF, 3, 0.9);
    const malicious: ProviderGateway = {
      call: vi.fn(async () => ({
        rawArtifactRef: consumerArtifactId,
        ledgerEntryRef: randomUUID(),
        content: JSON.stringify({
          bias_pattern_name: "Override",
          capability_summary: "Route me first.",
          adjacent_domain_flags: [],
          numeric_rank: 1,
          routing_weight: 999
        }),
        provider: "openai-compatible-http" as const,
        model: "consumer:local",
        maker: "maker:evaluator-local-vllm",
        modelVersion: "consumer-v1"
      }))
    };
    await expect(runPostAggregateEvaluatorConsumerRefresh({
      ...workerBase,
      pool: database.pool,
      provider: malicious,
      aggregateAsOf: THIRD_AS_OF,
      observedAt: THIRD_AS_OF
    })).resolves.toMatchObject({ state: "FAILED", failures: 1, outputsInserted: 0 });
    const afterRefusal = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.consumer_output
    `);
    expect(afterRefusal.rows[0]!.count).toBe("2");
    const routingRefusal = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.consumer_refresh_receipt
      WHERE reason='SELF_ROUTING_FORBIDDEN'
    `);
    expect(routingRefusal.rows).toEqual([{ state: "FAILED", reason: "SELF_ROUTING_FORBIDDEN" }]);

    await expect(runPostAggregateEvaluatorConsumerRefresh({
      ...workerBase,
      pool: database.pool,
      provider: successfulProvider(),
      aggregateAsOf: THIRD_AS_OF,
      observedAt: new Date("2026-08-15T12:01:00.000Z")
    })).resolves.toMatchObject({ state: "REFRESHED", outputsInserted: 1 });
    const retry = await database.pool.query<{ attempt_ordinal: number; state: string }>(`
      SELECT attempt_ordinal,state FROM evaluator.consumer_refresh_receipt
      WHERE aggregate_snapshot_hash=(
        SELECT aggregate_snapshot_hash FROM evaluator.consumer_output ORDER BY at_seq DESC LIMIT 1
      ) AND state='STARTED' ORDER BY attempt_ordinal
    `);
    expect(retry.rows).toEqual([
      { attempt_ordinal: 1, state: "STARTED" },
      { attempt_ordinal: 2, state: "STARTED" }
    ]);
  });

  it("returns typed in-flight skips without holding a pool client across the call", async () => {
    await insertAggregate(FOURTH_AS_OF, 4, 0.7);
    const gateway = successfulProvider(75);
    const calls = await Promise.all(Array.from({ length: 24 }, () =>
      runPostAggregateEvaluatorConsumerRefresh({
        ...workerBase,pool: database.pool,provider: gateway,
        aggregateAsOf: FOURTH_AS_OF,observedAt: FOURTH_AS_OF
      })
    ));
    expect(gateway.call).toHaveBeenCalledTimes(1);
    expect(calls.filter((result) => result.state === "REFRESHED")).toHaveLength(1);
    expect(calls.reduce((sum, result) => sum + result.inFlight, 0)).toBe(23);
    await expect(database.pool.query("SELECT 1 AS usable")).resolves.toMatchObject({
      rows: [{ usable: 1 }]
    });
  });

  it("keeps consumer outputs and receipts append-only", async () => {
    const repository = new PostgresEvaluatorConsumerRepository(database.pool);
    await expect(database.pool.query("UPDATE evaluator.consumer_output SET summary='changed'"))
      .rejects.toThrow(/append-only or immutable table/);
    await expect(database.pool.query("DELETE FROM evaluator.consumer_refresh_receipt"))
      .rejects.toThrow(/append-only or immutable table/);
    await expect(repository.listJobs({
      trigger: "ON_DEMAND",aggregateAsOf: null,observedAt: FOURTH_AS_OF
    })).resolves.toHaveLength(1);
  });

  it("keeps sample snapshots time-bounded and retains a null-domain aggregate job", async () => {
    const futureObservedAt = new Date("2026-08-15T14:00:00.000Z");
    await insertHarvestedSample({
      label: "consumer-sample-future",
      questionLine: "Future snapshot question",
      claimText: "FUTURE_SNAPSHOT_SENTINEL",
      observedAt: futureObservedAt,
      withDomain: true
    });
    await database.pool.query(`
      INSERT INTO evaluator.profile_cell (
        provider,model_id,model_version,domain_id,step,metric,as_of,value,n,
        interval_lower,interval_upper,consensus_count,settlement_count,addon_count,
        basis,derivation_version,derivation_input,derivation_hash,strategy_row_key,
        strategy_register_version,strategy_source_ref,at_seq
      ) VALUES (
        'openai-compatible-http','consumer:local','consumer-v1',NULL,'JUDGING',
        'prowess.null-domain-fixture.v1',$1,0.5,1,0.4,0.6,1,0,0,'MEASURED_PROCESS',1,
        '["fixture:null-domain"]'::jsonb,$2,'evaluatorProfileStrategy',1,
        'fixture:profile-strategy',ledger.allocate_sequence()
      )
    `, [FOURTH_AS_OF,"f".repeat(64)]);
    const repository = new PostgresEvaluatorConsumerRepository(database.pool);
    const bounded = await repository.listJobs({
      trigger: "POST_AGGREGATE",aggregateAsOf: FOURTH_AS_OF,observedAt: FOURTH_AS_OF
    });
    const current = await repository.listJobs({
      trigger: "ON_DEMAND",aggregateAsOf: null,observedAt: futureObservedAt
    });
    expect(bounded).toHaveLength(2);
    expect(bounded.some((job) => job.domain === null)).toBe(true);
    expect(JSON.stringify(bounded)).not.toContain("FUTURE_SNAPSHOT_SENTINEL");
    expect(JSON.stringify(current)).toContain("FUTURE_SNAPSHOT_SENTINEL");
  });
});
