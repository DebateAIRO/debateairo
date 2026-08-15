import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "@debateai/db";
import type { ProviderGateway } from "@debateai/providers";
import {
  PostgresEvaluatorConsumerRepository,
  type EvaluatorProviderFamilyRow
} from "../../packages/evaluator/src/index.js";
import {
  runOnDemandEvaluatorConsumerRefresh,
  runPostAggregateEvaluatorConsumerRefresh
} from "../../apps/evaluator-worker/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let selectionId: string;
let lawDomainId: string;
let consumerArtifactId: string;

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
      'provider:evaluator-vllm','consumer:local','consumer-v1',$1,'JUDGING',
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
      'PROWESS','provider:evaluator-vllm','consumer:local','consumer-v1',$1,'JUDGING',
      'prowess.judging-tau.v1',1,$2,8,$3,$4,$5::jsonb,$6,$7,$8,ledger.allocate_sequence()
    )
  `, [
    lawDomainId,value,value - 0.1,value + 0.1,JSON.stringify([cell.rows[0]!.profile_cell_id]),
    String(version + 10).padStart(64,"0"),version,asOf
  ]);
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
    const gateway = successfulProvider();
    await expect(runOnDemandEvaluatorConsumerRefresh({
      ...workerBase,
      pool: database.pool,
      provider: gateway,
      observedAt: FIRST_AS_OF
    })).resolves.toMatchObject({ state: "REFRESHED", outputsInserted: 1, failures: 0 });

    expect(gateway.call).toHaveBeenCalledTimes(1);
    const request = gateway.call.mock.calls[0]![0];
    expect(request).toMatchObject({
      runId: null,
      subjectItemId: expect.stringMatching(/^evaluator:consumer-attempt:/),
      callSiteKey: "evaluator.refresh-consumer-output.v1"
    });
    const requestBytes = JSON.stringify(request.packet);
    expect(requestBytes).not.toContain("provider:evaluator-vllm");
    expect(requestBytes).not.toContain("consumer:local");
    expect(requestBytes).not.toContain("consumer-v1");

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
      blinded_sample_refs: []
    })]);
    expect(JSON.parse(output.rows[0]!.summary)).toEqual({
      bias_pattern_name: "Measured and cautious",
      capability_summary: "The deterministic aggregates indicate strong legal judging."
    });
    const numeric = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM evaluator.profile_cell
      WHERE provider='provider:evaluator-vllm' AND model_id='consumer:local'
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
    const refusal = await database.pool.query<{ state: string; reason: string }>(`
      SELECT state,reason FROM evaluator.consumer_refresh_receipt
      WHERE reason='CONSUMER_CONTENT_REFUSED'
    `);
    expect(refusal.rows).toEqual([{ state: "FAILED", reason: "CONSUMER_CONTENT_REFUSED" }]);

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
    const calls = await Promise.all([
      runPostAggregateEvaluatorConsumerRefresh({
        ...workerBase,pool: database.pool,provider: gateway,
        aggregateAsOf: FOURTH_AS_OF,observedAt: FOURTH_AS_OF
      }),
      runPostAggregateEvaluatorConsumerRefresh({
        ...workerBase,pool: database.pool,provider: gateway,
        aggregateAsOf: FOURTH_AS_OF,observedAt: FOURTH_AS_OF
      }),
      runPostAggregateEvaluatorConsumerRefresh({
        ...workerBase,pool: database.pool,provider: gateway,
        aggregateAsOf: FOURTH_AS_OF,observedAt: FOURTH_AS_OF
      })
    ]);
    expect(gateway.call).toHaveBeenCalledTimes(1);
    expect(calls.filter((result) => result.state === "REFRESHED")).toHaveLength(1);
    expect(calls.reduce((sum, result) => sum + result.inFlight, 0)).toBe(2);
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
});
