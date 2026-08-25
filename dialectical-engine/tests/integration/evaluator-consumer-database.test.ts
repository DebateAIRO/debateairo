import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { configureContentEncryption, migrate, RunRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import {
  ContentCipher,
  generateDek,
  MemoryRunContentKeyStore,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  BLIND_SAMPLE_EXCERPT_MAX_BYTES,
  createOpenAiPublicAggregateProvider,
  PostgresEvaluatorConsumerRepository,
  type EvaluatorProviderFamilyRow,
  type PublicAggregateProvider
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
let fixtureUserId: string;
let fixtureOwnerRef: string;
let fixtureSessionId: string;
const fixtureUserDeks = new Map<string, Buffer>();
const fixtureUsers: ReadableUserDekStore = Object.freeze({
  async store(userId: string, dek: Uint8Array): Promise<void> {
    fixtureUserDeks.set(userId,Buffer.from(dek));
  },
  async load(userId: string): Promise<Buffer> {
    const dek=fixtureUserDeks.get(userId);
    if (dek===undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(dek);
  },
  async exists(userId: string): Promise<boolean> { return fixtureUserDeks.has(userId); },
  async destroy(userId: string): Promise<"DESTROYED"|"ALREADY_ABSENT"> {
    return fixtureUserDeks.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
});
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
  bound: { maxAttempts: 2, tokenCeiling: 512, deadlineMs: 250 },
  publicationCipher: {
    open: async () => ({
      decrypt: <T>() => ({
        question:"fixture public question",
        answer:{ verdict:"SUPPORTED",summary_segments:[{ text:"fixture public answer" }],
          residual_objections:[] }
      }) as T,
      close: () => undefined
    })
  }
};

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  fixtureUserId=randomUUID();
  fixtureOwnerRef=randomUUID();
  fixtureSessionId=randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,'fixture-password',$3,$4,$5,
      'active',now(),now())
  `,[fixtureUserId,randomBytes(32),`consumer-${randomUUID()}`,randomUUID(),fixtureOwnerRef]);
  await database.pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
      now()+interval '2 hours',now())
  `,[fixtureSessionId,fixtureUserId,`sha256:${randomBytes(32).toString("hex")}`,
    `sha256:${randomBytes(32).toString("hex")}`]);
  await fixtureUsers.store(fixtureUserId,generateDek());
  const runKeys=new MemoryRunContentKeyStore(fixtureUsers,async (ownerRef)=>{
    if (ownerRef!==fixtureOwnerRef) throw new Error("OWNER_REF_UNRESOLVED");
    return fixtureUserId;
  });
  configureContentEncryption(database.pool,new ContentCipher(runKeys));
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
}): Promise<Readonly<{ publicationRef: string }>> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine:input.questionLine,
    principal:{ kind:"server",userId:fixtureUserId,ownerRef:fixtureOwnerRef },
    sessionId:fixtureSessionId,
    callerScope:"ASKER",
    asOf:input.observedAt,
    askerRiskTier:"casual",
    effectiveRiskTier:"casual",
    tierSource:"ASKER",
    tierProvenanceRef:`fixture:${input.label}`,
    compositionBudgetTier:"low",
    depthParams:{ depth:1 },
    discoveredPanel:fixtureDiscoveredPanel(1),
    strangerSampleRate:0,
    envelopeBasis:{ source:"consumer-public-fixture" },
    registerVersion:1,
    batteryVersion:"consumer-public-fixture",
    batteryRows:[]
  });
  await database.pool.query(`
    INSERT INTO evaluator.observation (
      run_id,provider,model_id,model_version,domain_id,step,metric,value,outcome_json,
      truth_basis,source_kind,source_ref,derivation_version,provenance_json,
      observed_at,at_seq
    ) VALUES ($1,'openai-compatible-http','consumer:local','consumer-v1',$2,
      'JUDGING','prowess.judging-tau.v1',0.75,NULL,'CONSENSUS',
      'REDUCED_JUDGEMENT',$3,1,'{}'::jsonb,$4,ledger.allocate_sequence())
  `, [
    runId,input.withDomain ? lawDomainId : null,`public-sample:${input.label}`,input.observedAt
  ]);
  const publicationRef = randomUUID();
  const visibilityEventId=randomUUID();
  const visibilityActorRef=randomUUID();
  const bindingRefs=Array.from({ length:7 },()=>randomUUID());
  await database.pool.query(`
    INSERT INTO identity.publication_event_binding(
      user_id,session_id,run_id,action,grant_id,grant_token_hash,
      visibility_event_id,visibility_actor_ref,audit_id,audit_actor_ref,audit_target_ref,
      denied_audit_id,denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at
    ) VALUES ($1,$2,$3,'PUBLISH',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
      $14::timestamptz,$14::timestamptz+interval '1 hour')
  `,[
    fixtureUserId,fixtureSessionId,runId,bindingRefs[0],`fixture-grant:${input.label}`,
    visibilityEventId,visibilityActorRef,...bindingRefs.slice(1),new Date()
  ]);
  await database.pool.query(`
    INSERT INTO serve.publication_snapshot (
      publication_ref,run_id,format_version,content_ciphertext,created_at
    ) VALUES ($1,$2,1,$3::jsonb,$4)
  `, [
    publicationRef,runId,JSON.stringify({
      v:1,keyId:`publication-snapshot:${publicationRef}:v1`,
      nonce:"fixture-nonce",ct:"fixture-ciphertext",tag:"fixture-tag"
    }),input.observedAt
  ]);
  await database.pool.query(`
    INSERT INTO core.run_visibility_event (
      run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,
      warning_version,occurred_at,at_seq
    ) VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',$5,ledger.allocate_sequence())
  `, [visibilityEventId,runId,publicationRef,visibilityActorRef,input.observedAt]);
  return Object.freeze({ publicationRef });
}

async function startRealConsumerProvider(): Promise<{
  readonly gateway: PublicAggregateProvider;
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
  return {
    requestBodies,
    gateway: createOpenAiPublicAggregateProvider({
      endpoint: `http://127.0.0.1:${address.port}/v1`,
      providerRef: family.value.providerRef,
      model: "consumer:local",
      maker: family.value.maker,
    }),
    stop: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function successfulProvider(delayMs = 0): PublicAggregateProvider & {
  readonly classify: ReturnType<typeof vi.fn>;
} {
  return {
    classify: vi.fn(async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return Object.freeze({ classification: "ACCEPTED" as const });
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

    expect(provider.requestBodies).toHaveLength(3);
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
    expect(payload.blinded_samples).toHaveLength(1);
    expect(payload.blinded_samples.every((sample) => sample.sample_id.startsWith("opaque:sample-")))
      .toBe(true);
    for (const body of provider.requestBodies) {
      const request = JSON.parse(body) as {
        messages: readonly { readonly role: string; readonly content: string }[];
      };
      const requestPayload=JSON.parse(request.messages[1]!.content) as {
        blinded_samples:readonly { sample_id:string;question_excerpt:string;task_excerpt:string }[];
      };
      expect(requestPayload.blinded_samples).toHaveLength(1);
      expect(requestPayload.blinded_samples.every((sample) =>
        Buffer.byteLength(sample.question_excerpt,"utf8")<=BLIND_SAMPLE_EXCERPT_MAX_BYTES
        && Buffer.byteLength(sample.task_excerpt,"utf8")<=BLIND_SAMPLE_EXCERPT_MAX_BYTES
      )).toBe(true);
    }
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
      blinded_sample_refs: []
    })]);
    expect(JSON.parse(output.rows[0]!.summary)).toEqual({
      kind:"PUBLIC_SAMPLE_AGGREGATE_V1",
      public_sample_count:3,
      profile_cell_count:1,
      rank_count:1
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
    expect(currentGateway.classify).not.toHaveBeenCalled();

    await insertAggregate(SECOND_AS_OF, 2, 0.8);
    const refreshedGateway = successfulProvider();
    await expect(runPostAggregateEvaluatorConsumerRefresh({
      ...workerBase,
      pool: database.pool,
      provider: refreshedGateway,
      aggregateAsOf: SECOND_AS_OF,
      observedAt: SECOND_AS_OF
    })).resolves.toMatchObject({ state: "REFRESHED", outputsInserted: 1 });
    expect(refreshedGateway.classify).toHaveBeenCalledTimes(3);

    const versions = await database.pool.query<{ count: string; hashes: string }>(`
      SELECT count(*)::text AS count,count(DISTINCT aggregate_snapshot_hash)::text AS hashes
      FROM evaluator.consumer_output
    `);
    expect(versions.rows[0]).toEqual({ count: "2", hashes: "2" });
  });

  it("persists adversarial refusal receipts and never corrupts the output table", async () => {
    await insertAggregate(THIRD_AS_OF, 3, 0.9);
    const malicious: PublicAggregateProvider = {
      classify: vi.fn(async () => {
        throw new TypedDomainError(
          "SELF_ROUTING_FORBIDDEN","SELF_ROUTING_FORBIDDEN"
        );
      })
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
    expect(gateway.classify).toHaveBeenCalledTimes(3);
    expect(calls.filter((result) => result.state === "REFRESHED")).toHaveLength(1);
    expect(calls.reduce((sum, result) => sum + result.inFlight, 0)).toBe(23);
    await expect(database.pool.query("SELECT 1 AS usable")).resolves.toMatchObject({
      rows: [{ usable: 1 }]
    });
  });

  it("keeps consumer outputs and receipts append-only", async () => {
    const repository = new PostgresEvaluatorConsumerRepository(database.pool,async () => ({
      question:"fixture public question",
      answer:{ verdict:"SUPPORTED",summary_segments:[{ text:"fixture public answer" }],
        residual_objections:[] }
    }));
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
    const futureSample = await insertHarvestedSample({
      label: "consumer-sample-future",
      questionLine: "Future snapshot question",
      claimText: "FUTURE_SNAPSHOT_SENTINEL",
      observedAt: futureObservedAt,
      withDomain: false
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
    const repository = new PostgresEvaluatorConsumerRepository(database.pool,async () => ({
      question:"fixture public question",
      answer:{ verdict:"SUPPORTED",summary_segments:[{ text:"fixture public answer" }],
        residual_objections:[] }
    }));
    const bounded = await repository.listJobs({
      trigger: "POST_AGGREGATE",aggregateAsOf: FOURTH_AS_OF,observedAt: FOURTH_AS_OF
    });
    const current = await repository.listJobs({
      trigger: "ON_DEMAND",aggregateAsOf: null,observedAt: futureObservedAt
    });
    expect(bounded).toHaveLength(2);
    expect(bounded.some((job) => job.domain === null)).toBe(true);
    expect(JSON.stringify(bounded)).not.toContain(futureSample.publicationRef);
    expect(JSON.stringify(current)).toContain(futureSample.publicationRef);
    expect(JSON.stringify(current)).not.toContain("FUTURE_SNAPSHOT_SENTINEL");
  });
});
