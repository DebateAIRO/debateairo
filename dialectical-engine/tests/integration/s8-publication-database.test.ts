import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  ContentCipher,
  MemoryRunContentKeyStore,
  MemoryPublicationKeyStore,
  PublicationCipher,
  generateDek,
  hashVerificationToken,
  loadKek,
  verifyChain,
  type AuditContextHasher,
  type ChainedAuditEvent,
  type CryptoEnvelope,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  AccountErasureCoordinator,
  configureContentEncryption,
  createPool,
  PostgresAccountErasureRepository,
  PostgresSessionRepository,
  PostgresPublicationRepository,
  RunRepository,
  migrate,
  type LoginIdentityRecord
} from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import { createPublicEvaluatorConsumerWorker } from "../../apps/evaluator-worker/src/index.js";
import {
  PostgresEvaluatorConsumerRepository,
  type EvaluatorConsumerPublicSample,
  type EvaluatorProviderFamilyRow
} from "../../packages/evaluator/src/index.js";

const source = Object.freeze({ ip: "192.0.2.8", userAgent: "S8 Browser", requestId: "request:s8" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;

type Identity = Readonly<{
  userId: string;
  ownerRef: string;
  auditToken: string;
  pseudonym: string;
  sessionId: string;
  sessionTokenHash: string;
  factorId: string;
  passwordHash: string;
}>;

let database: TestDatabase;
let repository: PostgresPublicationRepository;
let publicationCipher: PublicationCipher;
let contentCipher: ContentCipher;
let runKeys: MemoryRunContentKeyStore;
const userDeks = new Map<string, Buffer>();
const userIdsByOwnerRef = new Map<string, string>();

const users: ReadableUserDekStore = Object.freeze({
  async store(userId: string, dek: Uint8Array): Promise<void> {
    userDeks.set(userId, Buffer.from(dek));
  },
  async load(userId: string): Promise<Buffer> {
    const dek = userDeks.get(userId);
    if (dek === undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(dek);
  },
  async exists(userId: string): Promise<boolean> {
    return userDeks.has(userId);
  },
  async destroy(userId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    return userDeks.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT";
  }
});

function poolWithHeldRuntimeClient(client: PoolClient): Pool {
  const borrowed = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "release") return () => undefined;
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return {
    connect: async () => borrowed,
    query: (...args: Parameters<PoolClient["query"]>) => borrowed.query(...args)
  } as unknown as Pool;
}

function unconfiguredPool(pool: Pool): Pool {
  return new Proxy(pool, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function hash(symbol: string): string {
  const hex = (symbol.codePointAt(0) ?? 0).toString(16).slice(-1);
  return `sha256:${hex.repeat(64)}`;
}

async function readAuditChain(): Promise<readonly ChainedAuditEvent[]> {
  const rows = await database.pool.query<{
    audit_id: string; prev_hash: Buffer | null; this_hash: Buffer;
    actor_ciphertext: null; actor_key_ref: string; event_type: string;
    target_type: string; target_id: string; occurred_at: Date;
    source_context: Record<string, unknown>; decision: string;
    success: boolean; justification: string | null; depth: number;
  }>(`
    WITH RECURSIVE chain AS (
      SELECT audit.*,1 AS depth
      FROM identity.audit_event AS audit WHERE audit.prev_hash IS NULL
      UNION ALL
      SELECT child.*,chain.depth+1
      FROM identity.audit_event AS child
      JOIN chain ON child.prev_hash=chain.this_hash
    )
    SELECT * FROM chain ORDER BY depth
  `);
  return Object.freeze(rows.rows.map((row) => Object.freeze({
    auditId: row.audit_id,
    actorCiphertext: row.actor_ciphertext,
    actorKeyRef: row.actor_key_ref,
    eventType: row.event_type,
    targetType: row.target_type,
    targetId: row.target_id,
    occurredAt: row.occurred_at,
    sourceContext: row.source_context,
    decision: row.decision,
    success: row.success,
    justification: row.justification,
    prevHash: row.prev_hash?.toString("hex") ?? null,
    thisHash: row.this_hash.toString("hex")
  })));
}

async function expectStillPending<T>(operation: Promise<T>): Promise<void> {
  const state = await Promise.race([
    operation.then(() => "settled" as const, () => "settled" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 75))
  ]);
  expect(state).toBe("pending");
}

async function createIdentity(label: string): Promise<Identity> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const pseudonym = `s8-${label}-${randomUUID()}`;
  const passwordHash = "test-password";
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password',$3,$4,$5,'active',now(),now())
  `, [userId, randomBytes(32), pseudonym, auditToken, ownerRef]);
  await users.store(userId, generateDek());
  userIdsByOwnerRef.set(ownerRef, userId);
  const factorId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity.mfa_factor (
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}'::jsonb,NULL,NULL,'active',now(),now(),10)
  `, [factorId, userId]);
  const sessionId = randomUUID();
  const sessionTokenHash = `sha256:${randomBytes(32).toString("hex")}`;
  const csrfTokenHash = `sha256:${randomBytes(32).toString("hex")}`;
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,$5,$6,$7,$5,NULL)
  `, [
    sessionId,
    userId,
    sessionTokenHash,
    csrfTokenHash,
    now,
    new Date(now.getTime() + 3_600_000),
    new Date(now.getTime() + 7_200_000)
  ]);
  return Object.freeze({
    userId, ownerRef, auditToken, pseudonym, sessionId,
    sessionTokenHash, factorId, passwordHash
  });
}

async function createRun(
  identity: Identity,label: string,pool: Pool = database.pool,legacy=false
): Promise<string> {
  return new RunRepository(pool).startRun({
    questionLine: `S8 private question ${label}`,
    principal:legacy
      ? { kind:"legacy",legacyAskerId:`legacy-s8-${randomUUID()}` }
      : { kind: "server", userId: identity.userId, ownerRef: identity.ownerRef },
    sessionId: identity.sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-08-24T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: `s8:${label}`,
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "s8-integration" },
    registerVersion: 1,
    batteryVersion: "s8-integration",
    batteryRows: []
  });
}

async function grant(
  identity: Identity,
  runId: string,
  action: "PUBLISH" | "UNPUBLISH",
  symbol: string,
  occurredAt: Date
): Promise<string> {
  // A complete-file run shares one database across every publication case.
  // Keep the human-readable symbol while making the one-use token unique so
  // earlier cases cannot collide with the global token_hash constraint.
  const token = `${symbol}-${randomUUID()}`;
  await database.pool.query(`
    INSERT INTO identity.step_up_grant (
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
      issued_at,expires_at,consumed_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
  `, [
    randomUUID(),
    hashVerificationToken(token),
    identity.sessionId,
    identity.userId,
    action,
    runId,
    new Date(Date.now() - 1_000),
    new Date(Date.now() + 60_000)
  ]);
  return token;
}

async function encryptedSnapshot(
  publicationRef: string,
  runId: string,
  marker: string
): Promise<CryptoEnvelope> {
  const provision = await database.pool.query<{
    user_id: string;
    owner_ref: string;
    session_id: string;
    token_hash: string;
  }>(`
    SELECT step_grant.user_id,identity_user.owner_ref,step_grant.session_id,
      step_grant.token_hash
    FROM identity.step_up_grant AS step_grant
    JOIN identity."user" AS identity_user ON identity_user.user_id=step_grant.user_id
    WHERE step_grant.action='PUBLISH' AND step_grant.target_run_id=$1
      AND step_grant.consumed_at IS NULL
    ORDER BY step_grant.issued_at DESC LIMIT 1
  `, [runId]);
  const candidate = provision.rows[0];
  if (candidate !== undefined) {
    await database.pool.query(
      "SELECT serve.prepare_publication_key_provision($1,$2,$3,$4,$5,$6)",
      [publicationRef,runId,candidate.user_id,candidate.owner_ref,
        candidate.session_id,candidate.token_hash]
    );
  }
  const prepared = await publicationCipher.create(publicationRef, runId);
  try {
    return prepared.encrypt({
      public_ref: publicationRef,
      author_pseudonym: `public-${marker}`,
      question: `public question ${marker}`,
      published_at: "2026-08-24T00:00:00.000Z",
      answer: {
        terminal: "SERVED",
        verdict: "SUPPORTED",
        verdict_available: true,
        confidence_band: "moderate",
        summary_segments: [{ text: `public answer ${marker}` }],
        badges: [], residual_objections: [], reversal_point: "new evidence",
        as_of: "2026-08-24T00:00:00.000Z"
      }
    });
  } finally {
    prepared.close();
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runKeys = new MemoryRunContentKeyStore(
    users,
    async (ownerRef) => {
      const userId = userIdsByOwnerRef.get(ownerRef);
      if (userId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return userId;
    }
  );
  contentCipher = new ContentCipher(runKeys);
  configureContentEncryption(database.pool, contentCipher);
  repository = new PostgresPublicationRepository(database.pool, fakeAuditHasher);
  publicationCipher = new PublicationCipher(
    new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xc8)))
  );
}, 120_000);

afterAll(async () => database?.stop());

describe("S8 publication on real PostgreSQL", () => {
  it("evaluates three current public snapshots after account erasure without private keys", async () => {
    const sampleRefs: { runId:string;publicationRef:string }[] = [];
    for (const ordinal of [1,2,3]) {
      const identity = await createIdentity(`evaluator-public-${ordinal}`);
      const runId = await createRun(identity,`evaluator-public-${ordinal}`);
      const publicationRef = randomUUID();
      const publishGrant = await grant(identity,runId,"PUBLISH",String(ordinal),new Date());
      expect(await repository.publish({
        runId,userId:identity.userId,ownerRef:identity.ownerRef,
        sessionId:identity.sessionId,grantTokenHash:hashVerificationToken(publishGrant),
        occurredAt:new Date(),source,publicationRef,expectedPseudonym:identity.pseudonym,
        contentCiphertext:await encryptedSnapshot(
          publicationRef,runId,`evaluator-public-${ordinal}`
        )
      })).toBe(true);
      await database.pool.query(`
        INSERT INTO evaluator.observation (
          run_id,provider,model_id,model_version,domain_id,step,metric,value,outcome_json,
          truth_basis,source_kind,source_ref,derivation_version,provenance_json,
          observed_at,at_seq
        ) VALUES ($1,'source-provider','source-model','source-v1',NULL,'JUDGING',
          'public.sample.v1',0.75,NULL,'CONSENSUS','REDUCED_JUDGEMENT',$2,1,
          '{}'::jsonb,now(),ledger.allocate_sequence())
      `,[runId,`public-sample:${ordinal}`]);
      const erasureId = (await database.pool.query<{ erasure_id:string }>(`
        INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
        VALUES ($1,clock_timestamp()-interval '2 seconds',
          clock_timestamp()-interval '1 second') RETURNING erasure_id
      `,[identity.userId])).rows[0]!.erasure_id;
      const erasureRepository = new PostgresAccountErasureRepository(
        database.pool,fakeAuditHasher
      );
      const preview = (await erasureRepository.preview(erasureId))!;
      expect(await erasureRepository.prepare(
        erasureId,preview.runIds,preview.legacyRunIds,preview.publishedRunIds
      )).toBe("PREPARED");
      expect(await new AccountErasureCoordinator(
        erasureRepository,users,runKeys,publicationCipher
      ).execute(erasureId,source)).toBe("CLEANED");
      expect(await runKeys.exists(runId)).toBe(false);
      expect(await publicationCipher.exists(publicationRef)).toBe(true);
      sampleRefs.push({ runId,publicationRef });
    }

    const probe = (await database.pool.query<{ vllm_probe_id:string }>(`
      INSERT INTO evaluator.vllm_probe(
        provider_ref,state,started_at,finished_at,at_seq
      ) VALUES ('provider:evaluator-vllm','AVAILABLE',now(),now(),ledger.allocate_sequence())
      RETURNING vllm_probe_id
    `)).rows[0]!.vllm_probe_id;
    await database.pool.query(`
      INSERT INTO evaluator.vllm_catalog_model(vllm_probe_id,model_id,metadata_json,at_seq)
      VALUES ($1,'consumer:local','{}'::jsonb,ledger.allocate_sequence())
    `,[probe]);
    await database.pool.query(`
      INSERT INTO evaluator.consumer_selection(
        vllm_probe_id,model_id,selected_by,order_ref,selected_at,at_seq
      ) VALUES ($1,'consumer:local','developer','s10:public-evaluator',now(),
        ledger.allocate_sequence())
    `,[probe]);
    await database.pool.query(`
      INSERT INTO evaluator.profile_cell(
        provider,model_id,model_version,domain_id,step,metric,as_of,value,n,
        interval_lower,interval_upper,consensus_count,settlement_count,addon_count,
        basis,derivation_version,derivation_input,derivation_hash,strategy_row_key,
        strategy_register_version,strategy_source_ref,at_seq
      ) VALUES ('source-provider','source-model','source-v1',NULL,'JUDGING',
        'public.sample.v1',now(),0.75,3,0.5,1.0,3,0,0,'MEASURED_PROCESS',1,
        '[]'::jsonb,$1,'evaluatorProfileStrategy',1,'s10:public-evaluator',
        ledger.allocate_sequence())
    `,["8".repeat(64)]);
    const providerBodies:string[]=[];
    const providerResponses:string[]=[];
    let ordinal=0;
    const relay=createServer((request,response) => {
      const chunks:Buffer[]=[];
      request.on("data",(chunk:Buffer)=>chunks.push(chunk));
      request.on("end",()=>{
        providerBodies.push(Buffer.concat(chunks).toString("utf8"));
        ordinal+=1;
        response.setHeader("content-type","application/json");
        const providerResponse=JSON.stringify({
          id:`public-consumer-${ordinal}`,
          model:"consumer:local",choices:[{ message:{
            content:JSON.stringify(ordinal%2===1 ? {
              bias_pattern_name:"Public sample",
              capability_summary:"Content-free public aggregate",
              adjacent_domain_flags:[],
              echoed_prompt:"evaluator-public-1 PRIVATE_ECHO_MUST_NOT_PERSIST"
            } : {
              bias_pattern_name:"Public sample",
              capability_summary:"Content-free public aggregate",
              adjacent_domain_flags:[]
            })
          }}]
        });
        providerResponses.push(providerResponse);
        response.end(providerResponse);
      });
    });
    await new Promise<void>((resolve)=>relay.listen(0,"127.0.0.1",resolve));
    const relayAddress=relay.address();
    if (relayAddress===null || typeof relayAddress==="string") throw new Error("relay bind failed");
    const opened:string[]=[];
    const evaluatorFamily:EvaluatorProviderFamilyRow={
      rowKey:"evaluatorProviderFamily",registerVersion:1,sourceRef:"s10:public",
      value:{ kind:"EVALUATOR_PROVIDER_FAMILY",providerRef:"provider:evaluator-vllm",
        adapterKind:"vllm-openai-compatible-http",maker:"maker:evaluator-local-vllm",
        chatBaseUrl:`http://127.0.0.1:${relayAddress.port}/v1`,modelsPath:"/models",
        deadlineMs:250,source:"LOCAL_CONTAINER_NO_AUTH" }
    };
    const evaluatorDeployment={
      configuredProviders:[{ providerRef:"provider:product",maker:"maker:product" }]
    } as const;
    const worker=createPublicEvaluatorConsumerWorker({
      family:evaluatorFamily,deployment:evaluatorDeployment,model:"consumer:local",
      publicationCipher:{ open:async (publicationRef:string,runId:string)=>{
        opened.push(`${publicationRef}:${runId}`);
        return publicationCipher.open(publicationRef,runId);
      }}
    });
    const beforeProviderPersistence=(await database.pool.query<{
      raw_count:string;ledger_count:string;pipeline_count:string;
    }>(`SELECT
      (SELECT count(*)::text FROM ledger.raw_artifact) AS raw_count,
      (SELECT count(*)::text FROM ledger.ledger_entry) AS ledger_count,
      (SELECT count(*)::text FROM evaluator.pipeline_event) AS pipeline_count`)).rows[0]!;
    try {
      await expect(worker.runOnDemand({
        pool:database.pool,
        bound:{ maxAttempts:2,tokenCeiling:256,deadlineMs:250 }
      })).resolves.toMatchObject({ state:"REFRESHED",outputsInserted:1,failures:0 });
    } finally {
      await new Promise<void>((resolve,reject)=>relay.close((error)=>error?reject(error):resolve()));
    }
    expect(providerBodies).toHaveLength(6);
    expect(new Set(opened)).toEqual(new Set(sampleRefs.map(
      (sample)=>`${sample.publicationRef}:${sample.runId}`
    )));
    for (const { publicationRef } of sampleRefs) {
      expect(await repository.readPublic(publicationRef)).not.toBeNull();
    }
    const output = (await database.pool.query<{ summary:string;blinded_sample_refs:string[] }>(
      "SELECT summary,blinded_sample_refs FROM evaluator.consumer_output ORDER BY at_seq DESC LIMIT 1"
    )).rows[0]!;
    expect(JSON.parse(output.summary)).toEqual({
      kind:"PUBLIC_SAMPLE_AGGREGATE_V1",public_sample_count:3,
      profile_cell_count:1,rank_count:0
    });
    expect(output.blinded_sample_refs).toEqual([]);
    const afterProviderPersistence=(await database.pool.query<{
      raw_count:string;ledger_count:string;pipeline_count:string;
    }>(`SELECT
      (SELECT count(*)::text FROM ledger.raw_artifact) AS raw_count,
      (SELECT count(*)::text FROM ledger.ledger_entry) AS ledger_count,
      (SELECT count(*)::text FROM evaluator.pipeline_event) AS pipeline_count`)).rows[0]!;
    expect(afterProviderPersistence).toEqual(beforeProviderPersistence);
    expect(JSON.stringify(output)).not.toContain("PRIVATE_ECHO_MUST_NOT_PERSIST");
    expect(JSON.stringify(providerResponses)).toContain("PRIVATE_ECHO_MUST_NOT_PERSIST");
  },120_000);

  it("binds the public worker family and selected model before relay or aggregate persistence", async () => {
    const latest=async ():Promise<{ selectionId:string;probeId:string;modelId:string }>=>{
      const row=(await database.pool.query<{
        consumer_selection_id:string;vllm_probe_id:string;model_id:string;
      }>(`SELECT consumer_selection_id,vllm_probe_id,model_id
          FROM evaluator.consumer_selection ORDER BY at_seq DESC LIMIT 1`)).rows[0]!;
      return { selectionId:row.consumer_selection_id,probeId:row.vllm_probe_id,
        modelId:row.model_id };
    };
    const supersede=async (orderRef:string):Promise<void>=>{
      const prior=await latest();
      await database.pool.query(`
        INSERT INTO evaluator.consumer_selection(
          vllm_probe_id,model_id,selected_by,order_ref,supersedes_selection_id,
          selected_at,at_seq
        ) VALUES ($1,$2,'developer',$3,$4,clock_timestamp(),ledger.allocate_sequence())
      `,[prior.probeId,prior.modelId,orderRef,prior.selectionId]);
    };
    const counts=async ()=> (await database.pool.query<{
      output_count:string;raw_count:string;ledger_count:string;pipeline_count:string;
    }>(`SELECT
      (SELECT count(*)::text FROM evaluator.consumer_output) AS output_count,
      (SELECT count(*)::text FROM ledger.raw_artifact) AS raw_count,
      (SELECT count(*)::text FROM ledger.ledger_entry) AS ledger_count,
      (SELECT count(*)::text FROM evaluator.pipeline_event) AS pipeline_count`)).rows[0]!;

    let relayCalls=0;
    const relay=createServer((_request,response)=>{
      relayCalls+=1;
      response.setHeader("content-type","application/json");
      response.end(JSON.stringify({
        id:"public-consumer-mismatched-metadata",
        model:"consumer:attacker",choices:[{ message:{ content:JSON.stringify({
          bias_pattern_name:"Must not persist",capability_summary:"Must not persist",
          adjacent_domain_flags:[]
        }) } }]
      }));
    });
    await new Promise<void>((resolve)=>relay.listen(0,"127.0.0.1",resolve));
    const address=relay.address();
    if (address===null || typeof address==="string") throw new Error("relay bind failed");
    const family:EvaluatorProviderFamilyRow={
      rowKey:"evaluatorProviderFamily",registerVersion:1,sourceRef:"s10:bound-public",
      value:{ kind:"EVALUATOR_PROVIDER_FAMILY",providerRef:"provider:evaluator-vllm",
        adapterKind:"vllm-openai-compatible-http",maker:"maker:evaluator-local-vllm",
        chatBaseUrl:`http://127.0.0.1:${address.port}/v1`,modelsPath:"/models",
        deadlineMs:250,source:"LOCAL_CONTAINER_NO_AUTH" }
    };
    const deployment={
      configuredProviders:[{ providerRef:"provider:product",maker:"maker:product" }]
    } as const;
    const workerOptions={
      family,deployment,publicationCipher:{
        open:(publicationRef:string,runId:string)=>publicationCipher.open(publicationRef,runId)
      }
    } as const;
    const before=await counts();
    try {
      expect(()=>createPublicEvaluatorConsumerWorker({
        ...workerOptions,
        family:{ ...family,value:{ ...family.value,
          providerRef:"provider:attacker" } } as unknown as EvaluatorProviderFamilyRow,
        model:"consumer:local"
      })).toThrow("PUBLIC_EVALUATOR_WORKER_CONFIGURATION_INVALID");
      expect(()=>createPublicEvaluatorConsumerWorker({
        ...workerOptions,
        family:{ ...family,value:{ ...family.value,
          maker:"maker:attacker" } } as unknown as EvaluatorProviderFamilyRow,
        model:"consumer:local"
      })).toThrow("PUBLIC_EVALUATOR_WORKER_CONFIGURATION_INVALID");
      expect(()=>createPublicEvaluatorConsumerWorker({
        ...workerOptions,
        family:{ ...family,value:{ ...family.value,
          chatBaseUrl:"https://remote-attacker.invalid/v1" }
        } as unknown as EvaluatorProviderFamilyRow,
        model:"consumer:local"
      })).toThrow("PUBLIC_EVALUATOR_WORKER_CONFIGURATION_INVALID");
      expect(relayCalls).toBe(0);

      await supersede("s10:wrong-public-consumer-model");
      const wrongModel=createPublicEvaluatorConsumerWorker({
        ...workerOptions,model:"consumer:not-selected"
      });
      await expect(wrongModel.runOnDemand({
        pool:database.pool,bound:{ maxAttempts:2,tokenCeiling:256,deadlineMs:250 }
      })).resolves.toMatchObject({ state:"FAILED",outputsInserted:0,failures:1 });
      expect(relayCalls).toBe(0);
      expect(await counts()).toEqual(before);

      await supersede("s10:wrong-public-relay-metadata");
      const wrongMetadata=createPublicEvaluatorConsumerWorker({
        ...workerOptions,model:"consumer:local"
      });
      await expect(wrongMetadata.runOnDemand({
        pool:database.pool,bound:{ maxAttempts:2,tokenCeiling:256,deadlineMs:250 }
      })).resolves.toMatchObject({ state:"FAILED",outputsInserted:0,failures:1 });
      expect(relayCalls).toBe(1);
      expect(await counts()).toEqual(before);
    } finally {
      await new Promise<void>((resolve,reject)=>relay.close((error)=>error?reject(error):resolve()));
    }
  },120_000);

  it("serializes public evaluation with unpublish key cleanup in both orders", async () => {
    const publishFixture = async (label:string): Promise<{
      identity:Identity;runId:string;publicationRef:string;
    }> => {
      const identity = await createIdentity(label);
      const runId = await createRun(identity,label);
      const publicationRef = randomUUID();
      const publishedAt = new Date();
      const publishGrant = await grant(
        identity,runId,"PUBLISH",label.startsWith("cleanup-") ? "y" : "v",publishedAt
      );
      expect(await repository.publish({
        runId,userId:identity.userId,ownerRef:identity.ownerRef,
        sessionId:identity.sessionId,grantTokenHash:hashVerificationToken(publishGrant),
        occurredAt:publishedAt,source,publicationRef,
        expectedPseudonym:identity.pseudonym,
        contentCiphertext:await encryptedSnapshot(publicationRef,runId,label)
      })).toBe(true);
      return { identity,runId,publicationRef };
    };
    const consumer = new PostgresEvaluatorConsumerRepository(
      database.pool,
      async (publicationRef:string,runId:string,envelope:CryptoEnvelope) => {
        const prepared = await publicationCipher.open(publicationRef,runId);
        try { return prepared.decrypt(envelope); }
        finally { prepared.close(); }
      }
    );

    const evaluatorWins = await publishFixture(`evaluator-lease-wins-${randomUUID()}`);
    let releaseProvider!: () => void;
    let reportProvider!: () => void;
    const providerEntered = new Promise<void>((resolve) => { reportProvider = resolve; });
    const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const evaluating = consumer.withPublicSampleLease({
      ...evaluatorWins,sampleId:randomUUID()
    },async (resolved:EvaluatorConsumerPublicSample) => {
      expect(resolved.questionExcerpt).toContain("public question");
      reportProvider();
      await providerRelease;
      return "provider-output";
    });
    await providerEntered;
    const unpublishedAt = new Date();
    const unpublishGrant = await grant(
      evaluatorWins.identity,evaluatorWins.runId,"UNPUBLISH","w",unpublishedAt
    );
    await expect(repository.unpublish({
      runId:evaluatorWins.runId,userId:evaluatorWins.identity.userId,
      ownerRef:evaluatorWins.identity.ownerRef,sessionId:evaluatorWins.identity.sessionId,
      grantTokenHash:hashVerificationToken(unpublishGrant),occurredAt:unpublishedAt,source
    })).resolves.toBe(evaluatorWins.publicationRef);
    const cleanup = new PostgresPublicationApplication(
      repository,publicationCipher
    ).reconcileKeyCleanup();
    await expectStillPending(cleanup);
    expect(await publicationCipher.exists(evaluatorWins.publicationRef)).toBe(true);
    releaseProvider();
    await expect(evaluating).rejects.toMatchObject({
      code:"CONSUMER_PUBLIC_SAMPLE_UNAVAILABLE"
    });
    await expect(cleanup).resolves.toBe(1);
    expect(await publicationCipher.exists(evaluatorWins.publicationRef)).toBe(false);

    const cleanupWins = await publishFixture(`cleanup-lease-wins-${randomUUID()}`);
    const cleanupWinsAt = new Date();
    const cleanupWinsGrant = await grant(
      cleanupWins.identity,cleanupWins.runId,"UNPUBLISH","x",cleanupWinsAt
    );
    await expect(repository.unpublish({
      runId:cleanupWins.runId,userId:cleanupWins.identity.userId,
      ownerRef:cleanupWins.identity.ownerRef,sessionId:cleanupWins.identity.sessionId,
      grantTokenHash:hashVerificationToken(cleanupWinsGrant),occurredAt:cleanupWinsAt,source
    })).resolves.toBe(cleanupWins.publicationRef);
    await expect(new PostgresPublicationApplication(
      repository,publicationCipher
    ).reconcileKeyCleanup()).resolves.toBe(1);
    let decrypted = false;
    await expect(consumer.withPublicSampleLease({
      ...cleanupWins,sampleId:randomUUID()
    },async () => {
      decrypted = true;
      return "impossible";
    })).rejects.toMatchObject({ code:"CONSUMER_PUBLIC_SAMPLE_UNAVAILABLE" });
    expect(decrypted).toBe(false);
    expect(await publicationCipher.exists(cleanupWins.publicationRef)).toBe(false);
  },60_000);

  it("releases a publication lease after its backend crashes and lets cleanup finish", async () => {
    const identity=await createIdentity(`publication-crash-${randomUUID()}`);
    const runId=await createRun(identity,`publication-crash-${randomUUID()}`);
    const publicationRef=randomUUID();
    const publishedAt=new Date();
    const publishGrant=await grant(identity,runId,"PUBLISH","k",publishedAt);
    expect(await repository.publish({
      runId,userId:identity.userId,ownerRef:identity.ownerRef,
      sessionId:identity.sessionId,grantTokenHash:hashVerificationToken(publishGrant),
      occurredAt:publishedAt,source,publicationRef,expectedPseudonym:identity.pseudonym,
      contentCiphertext:await encryptedSnapshot(publicationRef,runId,"publication-crash")
    })).toBe(true);
    const applicationName=`s10-publication-crash-${randomUUID()}`;
    const crashUrl=new URL(database.connectionString);
    crashUrl.searchParams.set("application_name",applicationName);
    const crashedPool=createPool(crashUrl.toString());
    const consumer=new PostgresEvaluatorConsumerRepository(
      crashedPool,
      async (ref:string,candidateRunId:string,envelope:CryptoEnvelope) => {
        const prepared=await publicationCipher.open(ref,candidateRunId);
        try { return prepared.decrypt(envelope); }
        finally { prepared.close(); }
      }
    );
    const outputCountBefore=(await database.pool.query<{ count:string }>(
      "SELECT count(*)::text AS count FROM evaluator.consumer_output"
    )).rows[0]!.count;
    let providerEntered!:()=>void;
    let releaseProvider!:()=>void;
    const entered=new Promise<void>((resolve)=>{ providerEntered=resolve; });
    const providerRelease=new Promise<void>((resolve)=>{ releaseProvider=resolve; });
    const evaluating=consumer.withPublicSampleLease(
      { runId,publicationRef,sampleId:randomUUID() },
      async (resolved:EvaluatorConsumerPublicSample) => {
        expect(resolved.questionExcerpt).toContain("public question");
        providerEntered();
        await providerRelease;
        return "must-not-persist";
      }
    );
    try {
      await entered;
      const unpublishGrant=await grant(identity,runId,"UNPUBLISH","l",new Date());
      expect(await repository.unpublish({
        runId,userId:identity.userId,ownerRef:identity.ownerRef,
        sessionId:identity.sessionId,grantTokenHash:hashVerificationToken(unpublishGrant),
        occurredAt:new Date(),source
      })).toBe(publicationRef);
      const pid=(await database.pool.query<{ pid:number }>(`
        SELECT pid FROM pg_catalog.pg_stat_activity
        WHERE application_name=$1 AND backend_type='client backend'
      `,[applicationName])).rows[0]?.pid;
      expect(pid).toBeTypeOf("number");
      expect((await database.pool.query<{ held:boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM pg_catalog.pg_locks
          WHERE pid=$1 AND locktype='advisory' AND granted
        ) AS held
      `,[pid])).rows[0]?.held).toBe(true);

      const cleanup=new PostgresPublicationApplication(
        repository,publicationCipher
      ).reconcileKeyCleanup();
      await expectStillPending(cleanup);
      expect(await publicationCipher.exists(publicationRef)).toBe(true);
      expect((await database.pool.query<{ terminated:boolean }>(
        "SELECT pg_terminate_backend($1) AS terminated",[pid]
      )).rows[0]?.terminated).toBe(true);
      await expect(cleanup).resolves.toBe(1);
      expect(await publicationCipher.exists(publicationRef)).toBe(false);
      releaseProvider();
      await expect(evaluating).rejects.toBeDefined();
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM evaluator.consumer_output"
      )).rows[0]?.count).toBe(outputCountBefore);
      expect(await repository.claimKeyCleanup()).toEqual([]);
    } finally {
      releaseProvider?.();
      await evaluating.catch(()=>undefined);
      await crashedPool.end();
    }
  },60_000);

  it("attests two real least-privilege LOGIN credentials and rejects aliases or overpowered roles", async () => {
    const password = "s8-role-witness-only";
    await database.pool.query(`
      CREATE ROLE s8_publication_login LOGIN PASSWORD '${password}';
      CREATE ROLE s8_authorization_login LOGIN PASSWORD '${password}';
      CREATE ROLE s10_publication_cleanup_login LOGIN PASSWORD '${password}';
      CREATE ROLE s8_dual_login LOGIN PASSWORD '${password}';
      GRANT debateai_runtime TO s8_publication_login;
      GRANT debateai_authorization_runtime TO s8_authorization_login;
      GRANT debateai_publication_cleanup TO s10_publication_cleanup_login;
      GRANT debateai_authorization_runtime TO s8_dual_login
    `);
    const urlFor = (role: string): string => {
      const url = new URL(database.connectionString);
      url.username = role;
      url.password = password;
      return url.toString();
    };
    const publicationPool = createPool(urlFor("s8_publication_login"));
    const authorizationPool = createPool(urlFor("s8_authorization_login"));
    const cleanupPool = createPool(urlFor("s10_publication_cleanup_login"));
    const dualPool = createPool(urlFor("s8_dual_login"));
    try {
      await expect(assertPublicationDatabaseRoleSeparation(
        publicationPool, authorizationPool
      )).resolves.toBeUndefined();
      await expect(assertPublicationCleanupDatabaseRole(cleanupPool)).resolves.toBeUndefined();
      await expect(assertPublicationCleanupDatabaseRole(publicationPool))
        .rejects.toThrow("PUBLICATION_CLEANUP_DATABASE_ROLE_INVALID");
      await expect(assertPublicationDatabaseRoleSeparation(
        publicationPool, publicationPool
      )).rejects.toThrow("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
      await expect(assertPublicationDatabaseRoleSeparation(
        database.pool, authorizationPool
      )).rejects.toThrow("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
      await expect(assertPublicationDatabaseRoleSeparation(
        dualPool, authorizationPool
      )).rejects.toThrow("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
      await expect(assertPublicationDatabaseRoleSeparation(
        authorizationPool, publicationPool
      )).rejects.toThrow("PUBLICATION_DATABASE_ROLES_MUST_BE_SEPARATE");
      const ownerAuthorizationRejected = await assertPublicationDatabaseRoleSeparation(
        publicationPool, database.pool
      ).then(() => false, () => true);

      const authorizationDmlRejections: boolean[] = [];
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"] as const) {
        await database.pool.query(
          `GRANT ${privilege} ON identity.step_up_grant TO s8_authorization_login`
        );
        authorizationDmlRejections.push(await assertPublicationDatabaseRoleSeparation(
          publicationPool, authorizationPool
        ).then(() => false, () => true));
        await database.pool.query(
          `REVOKE ${privilege} ON identity.step_up_grant FROM s8_authorization_login`
        );
      }

      await authorizationPool.query("SET ROLE debateai_authorization_runtime");
      const setRoleRejected = await assertPublicationDatabaseRoleSeparation(
        publicationPool, authorizationPool
      ).then(() => false, () => true);
      await authorizationPool.query("RESET ROLE");
      await publicationPool.query("SET ROLE debateai_runtime");
      const publicationSetRoleRejected = await assertPublicationDatabaseRoleSeparation(
        publicationPool, authorizationPool
      ).then(() => false, () => true);
      await publicationPool.query("RESET ROLE");
      expect({
        ownerAuthorizationRejected,
        authorizationDmlRejections,
        setRoleRejected,
        publicationSetRoleRejected
      })
        .toEqual({
          ownerAuthorizationRejected: true,
          authorizationDmlRejections: [true, true, true, true],
          setRoleRejected: true,
          publicationSetRoleRejected: true
        });
    } finally {
      await Promise.all([
        publicationPool.end(),authorizationPool.end(),cleanupPool.end(),dualPool.end()
      ]);
    }
  });

  it("defaults every event-less run private and keeps a published snapshot readable after identity deletion", async () => {
    const indexBefore = await repository.listPublicRefs(10,50);
    const identity = await createIdentity("survive");
    const runId = await createRun(identity, "survive");
    const publicationRef = randomUUID();
    const occurredAt = new Date("2026-08-24T00:00:00.000Z");
    const grantToken = await grant(identity, runId, "PUBLISH", "p", occurredAt);
    await expect(database.pool.query<{ published: boolean }>(
      "SELECT core.run_is_published($1,$2) AS published", [runId, publicationRef]
    )).resolves.toMatchObject({ rows: [{ published: false }] });

    expect(await repository.publish({
      runId,
      userId: identity.userId,
      ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken(grantToken),
      occurredAt,
      source,
      publicationRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "survive")
    })).toBe(true);
    const indexAfter = await repository.listPublicRefs(10,50);
    expect(indexAfter).toEqual({ refs: [],total:indexBefore.total+1 });

    const raw = await database.pool.query<{ content_ciphertext: unknown }>(
      "SELECT content_ciphertext FROM serve.publication_snapshot WHERE publication_ref=$1",
      [publicationRef]
    );
    expect(JSON.stringify(raw.rows)).not.toContain("public answer survive");
    const beforeDelete = await repository.readPublic(publicationRef);
    expect(beforeDelete).not.toBeNull();
    const application = new PostgresPublicationApplication(repository, publicationCipher);
    await expect(application.readPublicDebate(publicationRef)).resolves.toMatchObject({
      public_ref: publicationRef,
      question: "public question survive"
    });
    userDeks.get(identity.userId)?.fill(0);
    userDeks.delete(identity.userId);
    userIdsByOwnerRef.delete(identity.ownerRef);
    await expect(contentCipher.prepareRun(runId)).rejects.toThrow();
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [identity.userId]);
    const afterDelete = await repository.readPublic(publicationRef);
    expect(afterDelete).not.toBeNull();
    await expect(application.readPublicDebate(publicationRef)).resolves.toMatchObject({
      public_ref: publicationRef,
      question: "public question survive"
    });
    expect(await repository.unpublish({
      runId,
      userId: identity.userId,
      ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken("n".repeat(43)),
      occurredAt: new Date(occurredAt.getTime() + 1_000),
      source
    })).toBeNull();
    const opened = await publicationCipher.open(publicationRef, runId);
    try {
      expect(opened.decrypt<{ question: string }>(afterDelete!.contentCiphertext).question)
        .toBe("public question survive");
    } finally {
      opened.close();
    }
    const audit = await database.pool.query(
      "SELECT * FROM identity.audit_event WHERE event_type='debate.publication.published'"
    );
    const auditBytes = JSON.stringify(audit.rows);
    for (const forbidden of [identity.userId, identity.ownerRef, identity.pseudonym, "public question survive"]) {
      expect(auditBytes).not.toContain(forbidden);
    }
    const chain = await readAuditChain();
    const total = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity.audit_event"
    );
    expect(chain).toHaveLength(Number(total.rows[0]?.count));
    expect(chain.some((event) => event.eventType === "debate.publication.published")).toBe(true);
    expect(verifyChain(chain)).toBe(true);
  });

  it("unpublishes latest-wins, leaves the owner run intact, and rejects event/snapshot mutation and truncate", async () => {
    const identity = await createIdentity("unpublish");
    const runId = await createRun(identity, "unpublish");
    const publicationRef = randomUUID();
    const publishedAt = new Date();
    const publishGrant = await grant(identity, runId, "PUBLISH", "q", publishedAt);
    expect(await repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt: publishedAt, source, publicationRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "unpublish")
    })).toBe(true);
    const unpublishedAt = new Date(publishedAt.getTime() + 2_000);
    const unpublishGrant = await grant(identity, runId, "UNPUBLISH", "r", unpublishedAt);
    expect(await repository.unpublish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(unpublishGrant),
      occurredAt: unpublishedAt, source
    })).toBe(publicationRef);

    const cleanupCatalog = (await database.pool.query<{
      old_complete: string | null;
      runtime_claim: boolean;
      runtime_complete: boolean;
      runtime_table_update: boolean;
    }>(`
      SELECT
        to_regprocedure('serve.complete_publication_key_cleanup(uuid,timestamp with time zone)')::text
          AS old_complete,
        has_function_privilege('debateai_runtime',
          'serve.claim_publication_key_cleanup(integer)','EXECUTE') AS runtime_claim,
        has_function_privilege('debateai_runtime',
          'serve.complete_publication_key_cleanup(uuid,uuid,text)','EXECUTE') AS runtime_complete,
        has_table_privilege('debateai_runtime',
          'serve.publication_key_cleanup_intent','UPDATE') AS runtime_table_update
    `)).rows[0];
    expect(cleanupCatalog).toEqual({
      old_complete: null,runtime_claim: false,runtime_complete: false,
      runtime_table_update: false
    });
    const runtime = await database.pool.connect();
    try {
      await runtime.query("SET ROLE debateai_runtime");
      await expect(runtime.query<{ completed: boolean }>(`
        SELECT serve.complete_publication_key_cleanup($1,$2,'DESTROYED') AS completed
      `, [publicationRef,randomUUID()])).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.query("RESET ROLE").catch(() => undefined);
      runtime.release();
    }

    const firstClaim = (await repository.claimKeyCleanup()).find(
      (claim) => claim.publicationRef === publicationRef
    );
    expect(firstClaim).toBeDefined();
    await database.pool.query(`
      UPDATE serve.publication_key_cleanup_intent
      SET cleanup_claim_expires_at=clock_timestamp()-interval '1 second'
      WHERE publication_ref=$1
    `, [publicationRef]);
    const cleanupClaim = (await repository.claimKeyCleanup()).find(
      (claim) => claim.publicationRef === publicationRef
    );
    expect(cleanupClaim).toBeDefined();
    expect(cleanupClaim!.claimToken).not.toBe(firstClaim!.claimToken);
    expect(await repository.completeKeyCleanup(
      publicationRef,firstClaim!.claimToken,"DESTROYED"
    )).toBe(false);
    const destroyResult = await publicationCipher.destroy(publicationRef);
    expect(await repository.completeKeyCleanup(
      publicationRef,cleanupClaim!.claimToken,destroyResult
    )).toBe(true);
    expect(await repository.completeKeyCleanup(
      publicationRef,cleanupClaim!.claimToken,destroyResult
    )).toBe(true);
    expect(await repository.claimKeyCleanup()).toEqual([]);
    expect(await repository.readPublic(publicationRef)).toBeNull();
    expect((await database.pool.query("SELECT 1 FROM core.run WHERE run_id=$1", [runId])).rowCount).toBe(1);
    await expect(database.pool.query(
      "UPDATE core.run_visibility_event SET state='PUBLISHED' WHERE run_id=$1", [runId]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query(
      "DELETE FROM serve.publication_snapshot WHERE publication_ref=$1", [publicationRef]
    )).rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query("TRUNCATE core.run_visibility_event"))
      .rejects.toMatchObject({ code: "55000" });
    await expect(database.pool.query("TRUNCATE serve.publication_snapshot CASCADE"))
      .rejects.toMatchObject({ code: "55000" });
  });

  it("blocks private erasure until every historical publication key cleanup is durable", async () => {
    const identity = await createIdentity("private-erasure-publication-cleanup");
    const runId = await createRun(identity, "private-erasure-publication-cleanup");
    const publicationRef = randomUUID();
    const publishedAt = new Date();
    const publishGrant = await grant(identity,runId,"PUBLISH","u",publishedAt);
    expect(await repository.publish({
      runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt: publishedAt,source,publicationRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(
        publicationRef,runId,"private-erasure-publication-cleanup"
      )
    })).toBe(true);
    const unpublishGrant = await grant(identity,runId,"UNPUBLISH","v",new Date());
    expect(await repository.unpublish({
      runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(unpublishGrant),
      occurredAt: new Date(),source
    })).toBe(publicationRef);

    const prepare = async (token: string) => database.pool.query<{
      outcome: string;
      erasure_id: string | null;
    }>("SELECT * FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)", [
      runId,identity.userId,identity.ownerRef,identity.sessionId,
      hashVerificationToken(token)
    ]);
    const firstDeleteToken = "w".repeat(43);
    await database.pool.query(`
      INSERT INTO identity.step_up_grant(
        token_hash,session_id,user_id,action,target_run_id,
        issued_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,'DELETE_PRIVATE_DEBATE',$4,
        clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 minute',NULL)
    `, [hashVerificationToken(firstDeleteToken),identity.sessionId,identity.userId,runId]);
    expect((await prepare(firstDeleteToken)).rows[0]).toEqual({
      outcome: "CONTENDED",erasure_id: null
    });
    expect(await publicationCipher.exists(publicationRef)).toBe(true);

    const cleanupClaim = (await repository.claimKeyCleanup()).find(
      (claim) => claim.publicationRef === publicationRef
    );
    expect(cleanupClaim).toBeDefined();
    const destroyResult = await publicationCipher.destroy(publicationRef);
    expect(destroyResult).toBe("DESTROYED");
    expect(await publicationCipher.exists(publicationRef)).toBe(false);
    expect(await repository.completeKeyCleanup(
      publicationRef,cleanupClaim!.claimToken,destroyResult
    )).toBe(true);
    const secondDeleteToken = "x".repeat(43);
    await database.pool.query(`
      INSERT INTO identity.step_up_grant(
        token_hash,session_id,user_id,action,target_run_id,
        issued_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,'DELETE_PRIVATE_DEBATE',$4,
        clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 minute',NULL)
    `, [hashVerificationToken(secondDeleteToken),identity.sessionId,identity.userId,runId]);
    const prepared = (await prepare(secondDeleteToken)).rows[0];
    expect(prepared?.outcome).toBe("PREPARED");
    const manifest = await database.pool.query<{
      run_id: string;
      cleanup_publication_refs: string[];
    }>("SELECT * FROM core.private_run_erasure_manifest($1)", [prepared?.erasure_id]);
    expect(manifest.rows[0]).toMatchObject({
      run_id: runId,cleanup_publication_refs: [publicationRef]
    });
  });

  it("recomputes the complete account snapshot inventory under run locks", async () => {
    const identity = await createIdentity("account-erasure-publication-cleanup");
    const runId = await createRun(identity,"account-erasure-publication-cleanup");
    const publicationRef = randomUUID();
    const publishGrant = await grant(identity,runId,"PUBLISH","y",new Date());
    expect(await repository.publish({
      runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt: new Date(),source,publicationRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(
        publicationRef,runId,"account-erasure-publication-cleanup"
      )
    })).toBe(true);
    const unpublishGrant = await grant(identity,runId,"UNPUBLISH","z",new Date());
    expect(await repository.unpublish({
      runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(unpublishGrant),
      occurredAt: new Date(),source
    })).toBe(publicationRef);
    const erasureId = (await database.pool.query<{ erasure_id: string }>(`
      INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
      VALUES ($1,clock_timestamp()-interval '2 seconds',
        clock_timestamp()-interval '1 second') RETURNING erasure_id
    `, [identity.userId])).rows[0]!.erasure_id;
    const prepare = async (): Promise<string> => {
      const preview = (await database.pool.query<{
        run_ids: string[];
        legacy_run_ids: string[];
        published_run_ids: string[];
      }>("SELECT * FROM identity.account_erasure_preview($1)", [erasureId])).rows[0]!;
      return (await database.pool.query<{ outcome: string }>(`
        SELECT identity.prepare_account_erasure($1,$2::uuid[],$3::uuid[],$4::uuid[])
          AS outcome
      `, [erasureId,preview.run_ids,preview.legacy_run_ids,preview.published_run_ids]))
        .rows[0]!.outcome;
    };
    expect(await prepare()).toBe("CONTENDED");
    expect(await publicationCipher.exists(publicationRef)).toBe(true);
    const cleanupClaim = (await repository.claimKeyCleanup()).find(
      (claim) => claim.publicationRef === publicationRef
    );
    expect(cleanupClaim).toBeDefined();
    const destroyResult = await publicationCipher.destroy(publicationRef);
    expect(destroyResult).toBe("DESTROYED");
    expect(await repository.completeKeyCleanup(
      publicationRef,cleanupClaim!.claimToken,destroyResult
    )).toBe(true);
    expect(await prepare()).toBe("PREPARED");
    const manifest = (await database.pool.query<{
      current_publication_refs: string[];
      cleanup_publication_refs: string[];
    }>("SELECT * FROM identity.account_erasure_cleanup_manifest($1)", [erasureId])).rows[0];
    expect(manifest).toMatchObject({
      current_publication_refs: [],cleanup_publication_refs: [publicationRef]
    });
    expect((await database.pool.query<{
      retained_public_snapshot_count: number;
      keyless_historical_snapshot_count: number;
    }>(`
      SELECT retained_public_snapshot_count,keyless_historical_snapshot_count
      FROM identity.account_erasure_request WHERE erasure_id=$1
    `, [erasureId])).rows[0]).toEqual({
      retained_public_snapshot_count: 0,keyless_historical_snapshot_count: 1
    });
  });

  it("retains only the current corpus across account erasure and reports a mixed key manifest literally", async () => {
    const identity = await createIdentity("account-erasure-multicycle");
    const publicRunId = await createRun(identity,"account-erasure-multicycle-public");
    const alreadyAbsentRunId = await createRun(identity,"account-erasure-multicycle-absent");
    const historicalRefs: string[] = [];
    for (const symbol of ["1","2"] as const) {
      const publicationRef = randomUUID();
      const publishGrant = await grant(identity,publicRunId,"PUBLISH",symbol,new Date());
      expect(await repository.publish({
        runId: publicRunId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,
        grantTokenHash: hashVerificationToken(publishGrant),
        occurredAt: new Date(),source,publicationRef,
        expectedPseudonym: identity.pseudonym,
        contentCiphertext: await encryptedSnapshot(
          publicationRef,publicRunId,`account-erasure-history-${symbol}`
        )
      })).toBe(true);
      const unpublishGrant = await grant(
        identity,publicRunId,"UNPUBLISH",symbol === "1" ? "3" : "4",new Date()
      );
      expect(await repository.unpublish({
        runId: publicRunId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,
        grantTokenHash: hashVerificationToken(unpublishGrant),
        occurredAt: new Date(),source
      })).toBe(publicationRef);
      const cleanupClaim = (await repository.claimKeyCleanup()).find(
        (claim) => claim.publicationRef === publicationRef
      );
      expect(cleanupClaim).toBeDefined();
      const destroyResult = await publicationCipher.destroy(publicationRef);
      expect(destroyResult).toBe("DESTROYED");
      expect(await repository.completeKeyCleanup(
        publicationRef,cleanupClaim!.claimToken,destroyResult
      )).toBe(true);
      historicalRefs.push(publicationRef);
    }
    const currentRef = randomUUID();
    const currentAt = new Date("2026-08-24T00:00:00.000Z");
    const currentGrant = await grant(identity,publicRunId,"PUBLISH","5",currentAt);
    expect(await repository.publish({
      runId: publicRunId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken(currentGrant),
      occurredAt: currentAt,source,publicationRef: currentRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(
        currentRef,publicRunId,"account-erasure-current"
      )
    })).toBe(true);
    expect(await runKeys.destroy(alreadyAbsentRunId)).toBe("DESTROYED");

    const erasureId = (await database.pool.query<{ erasure_id: string }>(`
      INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
      VALUES ($1,clock_timestamp()-interval '2 seconds',
        clock_timestamp()-interval '1 second') RETURNING erasure_id
    `,[identity.userId])).rows[0]!.erasure_id;
    const erasureRepository = new PostgresAccountErasureRepository(
      database.pool,fakeAuditHasher
    );
    const preview = (await erasureRepository.preview(erasureId))!;
    expect(await erasureRepository.prepare(
      erasureId,preview.runIds,preview.legacyRunIds,preview.publishedRunIds
    )).toBe("PREPARED");
    expect(await new AccountErasureCoordinator(
      erasureRepository,users,runKeys,publicationCipher
    ).execute(erasureId,{
      ip: identity.userId,userAgent: identity.ownerRef,requestId: identity.sessionId
    })).toBe("CLEANED");

    expect((await database.pool.query<{
      run_count: string;
      snapshot_count: string;
      visibility_count: string;
      published: boolean;
    }>(`SELECT
      (SELECT count(*)::text FROM core.run WHERE run_id=$1) AS run_count,
      (SELECT count(*)::text FROM serve.publication_snapshot
        WHERE publication_ref=$2) AS snapshot_count,
      (SELECT count(*)::text FROM core.run_visibility_event
        WHERE run_id=$1) AS visibility_count,
      core.run_is_published($1,$2) AS published`,[publicRunId,currentRef])).rows[0]).toEqual({
      run_count: "1",snapshot_count: "1",visibility_count: "5",published: true
    });
    expect(await new PostgresPublicationApplication(
      repository,publicationCipher
    ).readPublicDebate(currentRef)).toMatchObject({
      public_ref: currentRef,question: "public question account-erasure-current"
    });
    expect(await publicationCipher.exists(currentRef)).toBe(true);
    for (const ref of historicalRefs) expect(await publicationCipher.exists(ref)).toBe(false);
    const evidence = (await database.pool.query<{
      retained_public_snapshot_count: number;
      keyless_historical_snapshot_count: number;
      destroyed_run_key_count: number;
      already_absent_run_key_count: number;
      destroyed_user_dek_count: number;
      already_absent_user_dek_count: number;
    }>(`
      SELECT retained_public_snapshot_count,keyless_historical_snapshot_count,
        destroyed_run_key_count,already_absent_run_key_count,
        destroyed_user_dek_count,already_absent_user_dek_count
      FROM identity.account_erasure_request WHERE erasure_id=$1
    `,[erasureId])).rows[0];
    expect(evidence).toEqual({
      retained_public_snapshot_count: 1,keyless_historical_snapshot_count: 2,
      destroyed_run_key_count: 1,already_absent_run_key_count: 1,
      destroyed_user_dek_count: 1,already_absent_user_dek_count: 0
    });
    const immutableAudit = JSON.stringify((await database.pool.query(
      `SELECT audit.* FROM identity.audit_event AS audit
       WHERE audit.event_type='identity.account.erased'
         AND audit.target_id=$1`,[erasureId]
    )).rows);
    for (const forbidden of [identity.userId,identity.ownerRef,identity.sessionId]) {
      expect(immutableAudit).not.toContain(forbidden);
    }
  });

  it("reconciles a crash after publication-key store before any snapshot commit", async () => {
    const identity = await createIdentity("publication-provision-crash");
    const runId = await createRun(identity,"publication-provision-crash");
    const publicationRef = randomUUID();
    const publishToken = await grant(identity,runId,"PUBLISH","a",new Date());
    expect(await repository.prepareKeyProvision({
      publicationRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(publishToken)
    })).toBe(true);
    const orphan = await publicationCipher.create(publicationRef,runId);
    orphan.close();
    expect(await publicationCipher.exists(publicationRef)).toBe(true);
    expect((await database.pool.query(
      "SELECT 1 FROM serve.publication_snapshot WHERE publication_ref=$1",[publicationRef]
    )).rowCount).toBe(0);

    const erasureId = (await database.pool.query<{ erasure_id: string }>(`
      INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
      VALUES ($1,clock_timestamp()-interval '2 seconds',
        clock_timestamp()-interval '1 second') RETURNING erasure_id
    `, [identity.userId])).rows[0]!.erasure_id;
    const preview = (await database.pool.query<{
      run_ids: string[];
      legacy_run_ids: string[];
      published_run_ids: string[];
    }>("SELECT * FROM identity.account_erasure_preview($1)", [erasureId])).rows[0]!;
    const prepareAccount = async () => (await database.pool.query<{ outcome: string }>(`
      SELECT identity.prepare_account_erasure($1,$2::uuid[],$3::uuid[],$4::uuid[])
        AS outcome
    `, [erasureId,preview.run_ids,preview.legacy_run_ids,preview.published_run_ids]))
      .rows[0]!.outcome;
    expect(await prepareAccount()).toBe("CONTENDED");
    expect(await repository.abandonKeyProvision(publicationRef,identity.userId)).toBe(true);
    const application = new PostgresPublicationApplication(repository,publicationCipher);
    expect(await application.reconcileKeyProvisionCleanup()).toBe(1);
    expect(await publicationCipher.exists(publicationRef)).toBe(false);
    expect((await database.pool.query(
      "SELECT 1 FROM serve.publication_key_provision_intent WHERE publication_ref=$1",
      [publicationRef]
    )).rowCount).toBe(0);
    expect(await prepareAccount()).toBe("PREPARED");
  });

  it("makes a claimed publication-key cleanup beat a late publish attempt", async () => {
    const identity = await createIdentity("publication-claim-wins");
    const runId = await createRun(identity,"publication-claim-wins");
    const publicationRef = randomUUID();
    const publishToken = await grant(identity,runId,"PUBLISH","b",new Date());
    const grantTokenHash = hashVerificationToken(publishToken);
    expect(await repository.prepareKeyProvision({
      publicationRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash
    })).toBe(true);
    const preparedKey = await publicationCipher.create(publicationRef,runId);
    const contentCiphertext = preparedKey.encrypt({
      public_ref: publicationRef,author_pseudonym: identity.pseudonym,
      question: "claim wins",published_at: new Date().toISOString(),
      answer: { terminal: "SERVED",verdict: null,verdict_available: false,
        confidence_band: null,summary_segments: [],badges: [],residual_objections: [],
        reversal_point: null,as_of: new Date().toISOString() }
    });
    preparedKey.close();
    expect(await repository.abandonKeyProvision(publicationRef,identity.userId)).toBe(true);
    const claim = await repository.claimKeyProvisionCleanup(100);
    expect(claim).toHaveLength(1);
    expect(claim[0]).toMatchObject({ publicationRef,runId,userId: identity.userId });
    expect(await repository.publish({
      runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash,occurredAt: new Date(),source,
      publicationRef,expectedPseudonym: identity.pseudonym,contentCiphertext
    })).toBe(false);
    expect((await database.pool.query(
      "SELECT 1 FROM serve.publication_snapshot WHERE publication_ref=$1",[publicationRef]
    )).rowCount).toBe(0);
    expect(await publicationCipher.destroy(publicationRef)).toBe("DESTROYED");
    expect(await publicationCipher.exists(publicationRef)).toBe(false);
    expect(await repository.completeKeyProvisionCleanup(
      publicationRef,claim[0]!.claimToken
    )).toBe(true);
  });

  it("lets a publish holding the run and provision intent beat an expiring cleanup claim", async () => {
    const identity = await createIdentity("publication-publish-wins");
    const runId = await createRun(identity,"publication-publish-wins");
    const publicationRef = randomUUID();
    const publishToken = await grant(identity,runId,"PUBLISH","c",new Date());
    const grantTokenHash = hashVerificationToken(publishToken);
    const contentCiphertext = await encryptedSnapshot(
      publicationRef,runId,"publication-publish-wins"
    );
    await database.pool.query(`
      UPDATE serve.publication_key_provision_intent
      SET expires_at=clock_timestamp()+interval '200 milliseconds'
      WHERE publication_ref=$1
    `, [publicationRef]);
    const pauseKey = 804002;
    await database.pool.query(`
      CREATE OR REPLACE FUNCTION public.s10_pause_publication_grant()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $body$
      BEGIN
        IF NEW.target_run_id::text=TG_ARGV[0] THEN
          PERFORM pg_advisory_xact_lock(TG_ARGV[1]::bigint);
        END IF;
        RETURN NEW;
      END
      $body$;
      DROP TRIGGER IF EXISTS s10_pause_publication_grant ON identity.step_up_grant;
      CREATE TRIGGER s10_pause_publication_grant
      BEFORE UPDATE OF consumed_at ON identity.step_up_grant
      FOR EACH ROW EXECUTE FUNCTION public.s10_pause_publication_grant('${runId}','${pauseKey}')
    `);
    const barrier = await database.pool.connect();
    const publishClient = await database.pool.connect();
    const claimClient = await database.pool.connect();
    try {
      await barrier.query("BEGIN");
      await barrier.query("SELECT pg_advisory_xact_lock($1)",[pauseKey]);
      await publishClient.query("SET application_name='s10-publication-publish-wins'");
      const heldRepository = new PostgresPublicationRepository(
        poolWithHeldRuntimeClient(publishClient),fakeAuditHasher
      );
      const publishing = heldRepository.publish({
        runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,grantTokenHash,occurredAt: new Date(),source,
        publicationRef,expectedPseudonym: identity.pseudonym,contentCiphertext
      });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = await database.pool.query<{ waiting: boolean }>(`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE application_name='s10-publication-publish-wins'
              AND wait_event='advisory') AS waiting
        `);
        if (waiting.rows[0]?.waiting === true) break;
        await new Promise((resolve) => setTimeout(resolve,10));
        if (attempt===99) throw new Error("PUBLICATION_PUBLISH_BARRIER_NOT_REACHED");
      }
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const expired = await database.pool.query<{ expired: boolean }>(`
          SELECT expires_at<=clock_timestamp() AS expired
          FROM serve.publication_key_provision_intent WHERE publication_ref=$1
        `, [publicationRef]);
        if (expired.rows[0]?.expired === true) break;
        await new Promise((resolve) => setTimeout(resolve,10));
      }
      await claimClient.query("SET application_name='s10-publication-claim-loser'");
      const claiming = claimClient.query(
        "SELECT * FROM serve.claim_publication_key_provision_cleanup(100)"
      );
      await expectStillPending(claiming);
      await barrier.query("COMMIT");
      await expect(publishing).resolves.toBe(true);
      await expect(claiming).resolves.toMatchObject({ rows: [] });
      expect(await publicationCipher.keyReadable(publicationRef)).toBe(true);
      expect((await database.pool.query(
        "SELECT 1 FROM serve.publication_key_provision_intent WHERE publication_ref=$1",
        [publicationRef]
      )).rowCount).toBe(0);
    } finally {
      await barrier.query("ROLLBACK").catch(() => undefined);
      barrier.release();
      publishClient.release();
      claimClient.release();
      await database.pool.query(
        "DROP TRIGGER IF EXISTS s10_pause_publication_grant ON identity.step_up_grant"
      );
      await database.pool.query("DROP FUNCTION IF EXISTS public.s10_pause_publication_grant()");
    }
  });

  it("uses run-first T9 order for provision, publish, unpublish, and account erasure", async () => {
    const identity = await createIdentity("t9-publication-order");
    const runId = await createRun(identity,"t9-publication-order");
    const firstRef = randomUUID();
    const firstToken = await grant(identity,runId,"PUBLISH","d",new Date());
    const firstHash = hashVerificationToken(firstToken);
    const firstCiphertext = await encryptedSnapshot(firstRef,runId,"t9-publication-order");

    // Provision wins the run row, then waits for the account serializer. The
    // transition queues on that run instead of holding grant/session locks and
    // forming the historical provision<->transition cycle.
    const accountBarrier = await database.pool.connect();
    try {
      await accountBarrier.query("BEGIN");
      await accountBarrier.query(`SELECT pg_advisory_xact_lock(
        hashtextextended('identity:account:'||$1::text,0)
      )`,[identity.userId]);
      const duplicateProvision = repository.prepareKeyProvision({
        publicationRef: firstRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,grantTokenHash: firstHash
      });
      await expectStillPending(duplicateProvision);
      const publishing = repository.publish({
        runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,grantTokenHash: firstHash,occurredAt: new Date(),source,
        publicationRef: firstRef,expectedPseudonym: identity.pseudonym,
        contentCiphertext: firstCiphertext
      });
      await expectStillPending(publishing);
      await accountBarrier.query("COMMIT");
      expect(await duplicateProvision).toBe(false);
      expect(await publishing).toBe(true);
    } finally {
      await accountBarrier.query("ROLLBACK").catch(() => undefined);
      accountBarrier.release();
    }

    // Provision-first makes the later unpublish queue on the run and then
    // cleanly deny the redundant provision against the still-public state.
    const deniedRef = randomUUID();
    const nextPublishToken = await grant(identity,runId,"PUBLISH","e",new Date());
    const unpublishToken = await grant(identity,runId,"UNPUBLISH","f",new Date());
    const secondBarrier = await database.pool.connect();
    try {
      await secondBarrier.query("BEGIN");
      await secondBarrier.query(`SELECT pg_advisory_xact_lock(
        hashtextextended('identity:account:'||$1::text,0)
      )`,[identity.userId]);
      const provisioning = repository.prepareKeyProvision({
        publicationRef: deniedRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(nextPublishToken)
      });
      await expectStillPending(provisioning);
      const unpublishing = repository.unpublish({
        runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(unpublishToken),
        occurredAt: new Date(),source
      });
      await expectStillPending(unpublishing);
      await secondBarrier.query("COMMIT");
      expect(await provisioning).toBe(false);
      expect(await unpublishing).toBe(firstRef);
    } finally {
      await secondBarrier.query("ROLLBACK").catch(() => undefined);
      secondBarrier.release();
    }

    // Reverse schedule: an unpublish already queued on the run commits first.
    // A provision statement whose READ COMMITTED snapshot predates that commit
    // denies conservatively; a fresh retry observes PRIVATE and succeeds.
    const republishedCiphertext = await encryptedSnapshot(
      deniedRef,runId,"t9-publication-order-republished"
    );
    expect(await repository.publish({
      runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,grantTokenHash: hashVerificationToken(nextPublishToken),
      occurredAt: new Date(),source,publicationRef: deniedRef,
      expectedPseudonym: identity.pseudonym,contentCiphertext: republishedCiphertext
    })).toBe(true);
    const reverseRef = randomUUID();
    const reversePublishToken = await grant(identity,runId,"PUBLISH","i",new Date());
    const reverseUnpublishToken = await grant(identity,runId,"UNPUBLISH","j",new Date());
    const runBarrier = await database.pool.connect();
    try {
      await runBarrier.query("BEGIN");
      await runBarrier.query(`SELECT pg_advisory_xact_lock(
        hashtextextended('identity:account:'||$1::text,0)
      )`,[identity.userId]);
      const unpublishing = repository.unpublish({
        runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,
        grantTokenHash: hashVerificationToken(reverseUnpublishToken),
        occurredAt: new Date(),source
      });
      await expectStillPending(unpublishing);
      const provisioning = repository.prepareKeyProvision({
        publicationRef: reverseRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,
        grantTokenHash: hashVerificationToken(reversePublishToken)
      });
      await expectStillPending(provisioning);
      await runBarrier.query("COMMIT");
      expect(await unpublishing).toBe(deniedRef);
      expect(await provisioning).toBe(false);
    } finally {
      await runBarrier.query("ROLLBACK").catch(() => undefined);
      runBarrier.release();
    }
    expect(await repository.prepareKeyProvision({
      publicationRef: reverseRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken(reversePublishToken)
    })).toBe(true);
    expect(await repository.abandonKeyProvision(reverseRef,identity.userId)).toBe(true);
    const application = new PostgresPublicationApplication(repository,publicationCipher);
    expect(await application.reconcileKeyProvisionCleanup()).toBe(1);
    let historicalCleanupCount = 0;
    for (const cleanup of await repository.claimKeyCleanup()) {
      if (cleanup.publicationRef!==firstRef && cleanup.publicationRef!==deniedRef) continue;
      historicalCleanupCount += 1;
      const destroyResult = await publicationCipher.destroy(cleanup.publicationRef);
      expect(await repository.completeKeyCleanup(
        cleanup.publicationRef,cleanup.claimToken,destroyResult
      )).toBe(true);
    }
    expect(historicalCleanupCount).toBe(2);

    // Account PREPARE also takes owned runs before the account serializer. If
    // provision holds the run first, PREPARE returns typed contention without
    // waiting into a deadlock; after the orphan intent is reconciled it proceeds.
    const accountRef = randomUUID();
    const accountPublishToken = await grant(identity,runId,"PUBLISH","g",new Date());
    const erasureId = (await database.pool.query<{ erasure_id: string }>(`
      INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
      VALUES ($1,clock_timestamp()-interval '2 seconds',
        clock_timestamp()-interval '1 second') RETURNING erasure_id
    `,[identity.userId])).rows[0]!.erasure_id;
    const preview = (await database.pool.query<{
      run_ids: string[];legacy_run_ids: string[];published_run_ids: string[];
    }>("SELECT * FROM identity.account_erasure_preview($1)",[erasureId])).rows[0]!;
    const prepareAccount = async () => (await database.pool.query<{ outcome: string }>(`
      SELECT identity.prepare_account_erasure($1,$2::uuid[],$3::uuid[],$4::uuid[])
        AS outcome
    `,[erasureId,preview.run_ids,preview.legacy_run_ids,preview.published_run_ids]))
      .rows[0]!.outcome;
    const thirdBarrier = await database.pool.connect();
    try {
      await thirdBarrier.query("BEGIN");
      await thirdBarrier.query(`SELECT pg_advisory_xact_lock(
        hashtextextended('identity:account:'||$1::text,0)
      )`,[identity.userId]);
      const provisioning = repository.prepareKeyProvision({
        publicationRef: accountRef,runId,userId: identity.userId,ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,
        grantTokenHash: hashVerificationToken(accountPublishToken)
      });
      await expectStillPending(provisioning);
      expect(await prepareAccount()).toBe("CONTENDED");
      await thirdBarrier.query("COMMIT");
      expect(await provisioning).toBe(true);
    } finally {
      await thirdBarrier.query("ROLLBACK").catch(() => undefined);
      thirdBarrier.release();
    }
    expect(await repository.abandonKeyProvision(accountRef,identity.userId)).toBe(true);
    expect(await application.reconcileKeyProvisionCleanup()).toBe(1);
    expect(await prepareAccount()).toBe("PREPARED");

    // Reverse schedule: PREPARE pauses after all governed locks are held. A new
    // provision waits on the run and, after PREPARE commits, revalidates the
    // suspended account to a typed false outcome.
    const deletionWinner = await createIdentity("t9-account-wins");
    const deletionRun = await createRun(deletionWinner,"t9-account-wins");
    const deletionToken = await grant(deletionWinner,deletionRun,"PUBLISH","h",new Date());
    const deletionRef = randomUUID();
    const deletionErasureId = (await database.pool.query<{ erasure_id: string }>(`
      INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
      VALUES ($1,clock_timestamp()-interval '2 seconds',
        clock_timestamp()-interval '1 second') RETURNING erasure_id
    `,[deletionWinner.userId])).rows[0]!.erasure_id;
    const deletionPreview = (await database.pool.query<{
      run_ids: string[];legacy_run_ids: string[];published_run_ids: string[];
    }>("SELECT * FROM identity.account_erasure_preview($1)",[deletionErasureId])).rows[0]!;
    const pauseKey = 804009;
    await database.pool.query(`
      CREATE OR REPLACE FUNCTION public.s10_pause_account_prepare()
      RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $body$
      BEGIN
        IF NEW.user_id::text=TG_ARGV[0] AND NEW.state='suspended' THEN
          PERFORM pg_advisory_xact_lock(TG_ARGV[1]::bigint);
        END IF;
        RETURN NEW;
      END
      $body$;
      DROP TRIGGER IF EXISTS s10_pause_account_prepare ON identity."user";
      CREATE TRIGGER s10_pause_account_prepare
      BEFORE UPDATE OF state ON identity."user"
      FOR EACH ROW EXECUTE FUNCTION public.s10_pause_account_prepare(
        '${deletionWinner.userId}','${pauseKey}'
      )
    `);
    const pauseBarrier = await database.pool.connect();
    try {
      await pauseBarrier.query("BEGIN");
      await pauseBarrier.query("SELECT pg_advisory_xact_lock($1)",[pauseKey]);
      const deleting = database.pool.query<{ outcome: string }>(`
        SELECT identity.prepare_account_erasure($1,$2::uuid[],$3::uuid[],$4::uuid[])
          AS outcome
      `,[deletionErasureId,deletionPreview.run_ids,deletionPreview.legacy_run_ids,
        deletionPreview.published_run_ids]);
      await expectStillPending(deleting);
      const provisioning = repository.prepareKeyProvision({
        publicationRef: deletionRef,runId: deletionRun,userId: deletionWinner.userId,
        ownerRef: deletionWinner.ownerRef,sessionId: deletionWinner.sessionId,
        grantTokenHash: hashVerificationToken(deletionToken)
      });
      await expectStillPending(provisioning);
      await pauseBarrier.query("COMMIT");
      expect((await deleting).rows[0]?.outcome).toBe("PREPARED");
      expect(await provisioning).toBe(false);
    } finally {
      await pauseBarrier.query("ROLLBACK").catch(() => undefined);
      pauseBarrier.release();
      await database.pool.query(
        'DROP TRIGGER IF EXISTS s10_pause_account_prepare ON identity."user"'
      );
      await database.pool.query("DROP FUNCTION IF EXISTS public.s10_pause_account_prepare()");
    }
  });

  it("preserves a committed corpus key when the publish result is transport-ambiguous", async () => {
    const identity = await createIdentity("publication-ambiguous-commit");
    const runId = await createRun(identity,"publication-ambiguous-commit");
    const publishToken = await grant(identity,runId,"PUBLISH","e",new Date());
    const ambiguousRepository = new Proxy(repository,{
      get(target,property,receiver) {
        if (property==="publish") return async (
          input: Parameters<PostgresPublicationRepository["publish"]>[0]
        ): Promise<boolean> => {
          expect(await target.publish(input)).toBe(true);
          throw new Error("SIMULATED_AMBIGUOUS_COMMIT");
        };
        const value = Reflect.get(target,property,receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as PostgresPublicationRepository;
    const application = new PostgresPublicationApplication(
      ambiguousRepository,publicationCipher
    );
    const asOf = new Date().toISOString();
    await expect(application.publish({
      runId,
      authenticated: {
        userId: identity.userId,ownerRef: identity.ownerRef,
        session: { session_id: identity.sessionId }
      } as never,
      grantToken: publishToken,
      source,
      answer: {
        run_ref: runId,terminal: "SERVED",question_line: "ambiguous public question",
        verdict_state: "SUPPORTED",confidence_band: "moderate",
        composed_text: [{ text: "ambiguous public answer" }],badges: [],
        residual_objections: [],reversal_point: "new evidence",as_of: asOf
      } as never
    })).rejects.toThrow("SIMULATED_AMBIGUOUS_COMMIT");
    const committed = await database.pool.query<{ publication_ref: string }>(`
      SELECT snapshot.publication_ref FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.run_id=$1
    `, [runId]);
    expect(committed.rows).toHaveLength(1);
    const publicationRef = committed.rows[0]!.publication_ref;
    expect(await publicationCipher.keyReadable(publicationRef)).toBe(true);
    expect((await database.pool.query(
      "SELECT 1 FROM serve.publication_key_provision_intent WHERE publication_ref=$1",
      [publicationRef]
    )).rowCount).toBe(0);
    await expect(application.readPublicDebate(publicationRef)).resolves.toMatchObject({
      public_ref: publicationRef,question: "ambiguous public question"
    });
  });

  it("serializes double publish and kills grant reuse, cross-action, and cross-target mutants", async () => {
    const identity = await createIdentity("race");
    const runId = await createRun(identity, "race");
    const otherRunId = await createRun(identity, "other");
    const occurredAt = new Date();
    const tokenA = await grant(identity, runId, "PUBLISH", "s", occurredAt);
    const tokenB = await grant(identity, runId, "PUBLISH", "t", occurredAt);
    const refs = [randomUUID(), randomUUID()] as const;
    const outcomes = await Promise.all(refs.map(async (publicationRef, index) => repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken(index === 0 ? tokenA : tokenB),
      occurredAt, source, publicationRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, `race-${index}`)
    })));
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const winner = refs[outcomes[0] ? 0 : 1];
    expect(await repository.revalidatePublic(runId, winner)).toBe(true);

    // Put the run back in a genuinely eligible PRIVATE state before replaying
    // the consumed winning grant; state alone can no longer reject the mutant.
    const unpublishToken = await grant(identity, runId, "UNPUBLISH", "0", new Date());
    expect(await repository.unpublish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken(unpublishToken),
      occurredAt: new Date(), source
    })).toBe(winner);

    const reuseRef = randomUUID();
    expect(await repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(outcomes[0] ? tokenA : tokenB),
      occurredAt: new Date(occurredAt.getTime() + 1_000), source,
      publicationRef: reuseRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(reuseRef, runId, "reuse")
    })).toBe(false);
    const wrongAction = await grant(identity, otherRunId, "UNPUBLISH", "u", occurredAt);
    const wrongRef = randomUUID();
    expect(await repository.publish({
      runId: otherRunId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(wrongAction),
      occurredAt, source, publicationRef: wrongRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(wrongRef, otherRunId, "wrong-action")
    })).toBe(false);
    const crossTarget = await grant(identity, otherRunId, "PUBLISH", "v", occurredAt);
    const crossRef = randomUUID();
    expect(await repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(crossTarget),
      occurredAt, source, publicationRef: crossRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(crossRef, runId, "cross-target")
    })).toBe(false);
    const alternateSessionId = randomUUID();
    await database.pool.query(`
      INSERT INTO identity.session (
        session_id,user_id,token_hash,csrf_token_hash,binding_context,
        created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
      ) VALUES ($1,$2,$3,$4,'{}'::jsonb,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())
    `, [alternateSessionId, identity.userId, hash("7"), hash("8")]);
    const wrongSessionRef = randomUUID();
    expect(await repository.publish({
      runId: otherRunId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: alternateSessionId, grantTokenHash: hashVerificationToken(crossTarget),
      occurredAt, source, publicationRef: wrongSessionRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(wrongSessionRef, otherRunId, "cross-session")
    })).toBe(false);
  });

  it("creates the exact step-up grant atomically without probing whether its target exists", async () => {
    const identity = await createIdentity("stepup");
    const authorizationClient = await database.pool.connect();
    await authorizationClient.query("SET ROLE debateai_authorization_runtime");
    const repository = new PostgresSessionRepository(
      poolWithHeldRuntimeClient(authorizationClient), fakeAuditHasher
    );
    const occurredAt = new Date();
    const targetRunId = randomUUID();
    const grantTokenHash = hash("w");
    const loginIdentity: LoginIdentityRecord = Object.freeze({
      userId: identity.userId,
      ownerRef: identity.ownerRef,
      auditToken: identity.auditToken,
      passwordHash: identity.passwordHash,
      factorId: identity.factorId,
      secretCiphertext: {} as CryptoEnvelope,
      lastAcceptedStep: 10
    });
    try {
      expect(await repository.rotateAfterStepUp({
        identity: loginIdentity,
        currentSessionId: identity.sessionId,
        currentTokenHash: identity.sessionTokenHash,
        acceptedStep: 11,
        replacementTokenHash: hash("x"),
        replacementCsrfHash: hash("y"),
        bindingContext: { user_agent_hash: hash("z") },
        occurredAt,
        idleExpiresAt: new Date(occurredAt.getTime() + 60_000),
        source,
        grant: {
          grantId: randomUUID(), grantTokenHash, action: "PUBLISH",
          targetRunId, expiresAt: new Date(occurredAt.getTime() + 30_000)
        }
      })).toBe(true);
      expect((await database.pool.query<{
        action: string; target_run_id: string; token_hash: string;
      }>(`
        SELECT action,target_run_id,token_hash FROM identity.step_up_grant
        WHERE session_id=$1
      `, [identity.sessionId])).rows).toEqual([{
        action: "PUBLISH", target_run_id: targetRunId, token_hash: grantTokenHash
      }]);
      expect((await database.pool.query<{ token_hash: string }>(
        "SELECT token_hash FROM identity.session WHERE session_id=$1",
        [identity.sessionId]
      )).rows[0]?.token_hash).toBe(hash("x"));

      // Replaying the same accepted TOTP step rolls back both rotation and grant.
      expect(await repository.rotateAfterStepUp({
        identity: { ...loginIdentity, lastAcceptedStep: 11 },
        currentSessionId: identity.sessionId,
        currentTokenHash: hash("x"),
        acceptedStep: 11,
        replacementTokenHash: hash("1"),
        replacementCsrfHash: hash("2"),
        bindingContext: { user_agent_hash: hash("3") },
        occurredAt: new Date(occurredAt.getTime() + 1_000),
        idleExpiresAt: new Date(occurredAt.getTime() + 61_000),
        source,
        grant: {
          grantId: randomUUID(), grantTokenHash: hash("4"), action: "UNPUBLISH",
          targetRunId, expiresAt: new Date(occurredAt.getTime() + 31_000)
        }
      })).toBe(false);
      expect((await database.pool.query(
        "SELECT 1 FROM identity.step_up_grant WHERE session_id=$1",
        [identity.sessionId]
      )).rowCount).toBe(1);
    } finally {
      await authorizationClient.query("RESET ROLE").catch(() => undefined);
      authorizationClient.release();
    }
  });

  it("uses the final database clock so a backdated caller cannot revive an expired grant", async () => {
    const identity = await createIdentity("expired-db-clock");
    const runId = await createRun(identity, "expired-db-clock");
    const publicationRef = randomUUID();
    const token = "e".repeat(43);
    const presentedAt = new Date();
    await database.pool.query(`
      INSERT INTO identity.step_up_grant (
        step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
        issued_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,$4,'PUBLISH',$5,clock_timestamp()-interval '1 second',
        clock_timestamp()+interval '150 milliseconds',NULL)
    `, [randomUUID(), hashVerificationToken(token), identity.sessionId, identity.userId, runId]);
    expect(await repository.preflightGrant({
      runId, userId: identity.userId, sessionId: identity.sessionId,
      grantTokenHash: hashVerificationToken(token)
    }, "PUBLISH")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 225));
    expect(await repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(token),
      occurredAt: presentedAt, source, publicationRef,
      expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "expired-db-clock")
    })).toBe(false);
    expect((await database.pool.query(
      "SELECT 1 FROM serve.publication_snapshot WHERE publication_ref=$1", [publicationRef]
    )).rowCount).toBe(0);
  });

  it("audits authenticated publish and unpublish denials without run or content identifiers", async () => {
    const identity = await createIdentity("denied-audit");
    const runId = await createRun(identity, "denied-audit");
    const publicationRef = randomUUID();
    const publishGrant = await grant(identity, runId, "PUBLISH", "d", new Date());
    expect(await repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt: new Date(), source, publicationRef,
      expectedPseudonym: "wrong-pseudonym",
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "denied-audit")
    })).toBe(false);

    const unpublishGrant = await grant(identity, runId, "UNPUBLISH", "f", new Date());
    expect(await repository.unpublish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(unpublishGrant),
      occurredAt: new Date(), source
    })).toBeNull();

    const denied = await database.pool.query<{
      actor_key_ref: string; event_type: string; target_type: string; target_id: string;
      decision: string; success: boolean; justification: string | null;
    }>(`
      SELECT actor_key_ref,event_type,target_type,target_id,decision,success,justification
      FROM identity.audit_event AS audit
      JOIN identity.publication_event_binding AS binding
        ON binding.denied_audit_id=audit.audit_id
          AND binding.denied_audit_actor_ref::text=audit.actor_key_ref
      WHERE audit.event_type='debate.publication.denied'
        AND binding.run_id=$1 AND binding.user_id=$2
      ORDER BY audit.occurred_at,audit.audit_id
    `, [runId,identity.userId]);
    expect(denied.rows).toHaveLength(2);
    for (const row of denied.rows) {
      expect(row).toMatchObject({
        event_type: "debate.publication.denied",
        target_type: "debate.publication_attempt",
        decision: "DENY",
        success: false,
        justification: "PUBLICATION_TRANSITION_DENIED"
      });
      expect(row.target_id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(row.actor_key_ref).toMatch(/^[0-9a-f-]{36}$/i);
      expect(row.actor_key_ref).not.toBe(identity.auditToken);
      expect([runId, publicationRef]).not.toContain(row.target_id);
    }
    const serialized = JSON.stringify(denied.rows);
    for (const forbidden of [
      identity.userId, identity.ownerRef, identity.pseudonym, runId,
      publicationRef, "S8 private question denied-audit", "public answer denied-audit"
    ]) expect(serialized).not.toContain(forbidden);
    expect(verifyChain(await readAuditChain())).toBe(true);
  });

  it("audits authenticated grant-preflight denials opaquely without source KDF work", async () => {
    const identity = await createIdentity("preflight-denied-audit");
    const runId = await createRun(identity, "preflight-denied-audit");
    const publicationRef = randomUUID();
    const requestId = `request:${randomUUID()}`;
    expect(await repository.auditAuthenticatedPreflightDenial({
      userId: identity.userId,
      sessionId: identity.sessionId,
      occurredAt: new Date(),
      requestId
    })).toBe(true);

    expect(await repository.auditAuthenticatedPreflightDenial({
      userId: identity.userId,
      sessionId: randomUUID(),
      occurredAt: new Date(),
      requestId: `request:${randomUUID()}`
    })).toBe(false);

    const denied = await database.pool.query<{
      actor_key_ref: string; event_type: string; target_type: string; target_id: string;
      source_context: Record<string, unknown>; decision: string; success: boolean;
      justification: string | null;
    }>(`
      SELECT actor_key_ref,event_type,target_type,target_id,source_context,
        decision,success,justification
      FROM identity.audit_event AS audit
      JOIN identity.publication_event_binding AS binding
        ON binding.audit_id=audit.audit_id
          AND binding.audit_actor_ref::text=audit.actor_key_ref
      WHERE audit.event_type='debate.publication.preflight_denied'
        AND binding.action='PREFLIGHT_DENIAL'
        AND binding.user_id=$1 AND binding.session_id=$2
    `, [identity.userId,identity.sessionId]);
    expect(denied.rows).toHaveLength(1);
    expect(denied.rows[0]).toMatchObject({
      event_type: "debate.publication.preflight_denied",
      target_type: "debate.publication_attempt",
      source_context: { schema:"s10-publication-preflight-v2" },
      decision: "DENY",
      success: false,
      justification: "PUBLICATION_GRANT_PREFLIGHT_DENIED"
    });
    expect(denied.rows[0]?.target_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(denied.rows[0]?.actor_key_ref).toMatch(/^[0-9a-f-]{36}$/i);
    expect(denied.rows[0]?.actor_key_ref).not.toBe(identity.auditToken);
    const serialized = JSON.stringify(denied.rows);
    for (const forbidden of [
      identity.userId, identity.ownerRef, identity.pseudonym, identity.sessionId,
      runId, publicationRef, source.ip, source.userAgent,
      "S8 private question preflight-denied-audit"
    ]) expect(serialized).not.toContain(forbidden);
    expect(verifyChain(await readAuditChain())).toBe(true);
  });

  it("refuses corpus publication of an owned legacy plaintext run", async () => {
    const identity = await createIdentity("legacy-plaintext");
    const runId = await createRun(
      identity,"legacy-plaintext",unconfiguredPool(database.pool),true
    );
    await database.pool.query(
      "SELECT core.append_run_ownership_event($1,$2)",[runId,identity.ownerRef]
    );
    expect((await database.pool.query<{ content_encryption_version: number | null }>(
      "SELECT content_encryption_version FROM core.run WHERE run_id=$1", [runId]
    )).rows[0]?.content_encryption_version).toBeNull();
    const occurredAt = new Date();
    const token = await grant(identity, runId, "PUBLISH", "l", occurredAt);
    const publicationRef = randomUUID();
    expect(await repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(token),
      occurredAt, source, publicationRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "legacy-plaintext")
    })).toBe(false);
    expect((await database.pool.query(
      "SELECT 1 FROM serve.publication_snapshot WHERE publication_ref=$1", [publicationRef]
    )).rowCount).toBe(0);
  });

  it("denies runtime grant/snapshot/event DML and exposes only the atomic transition", async () => {
    const identity = await createIdentity("role");
    const runId = await createRun(identity, "role");
    const publicationRef = randomUUID();
    const contentCiphertext = await encryptedSnapshot(publicationRef, runId, "role");
    const privileges = (await database.pool.query<{
      snapshot_insert: boolean; event_insert: boolean;
      grant_select: boolean; grant_insert: boolean; grant_update: boolean;
      atomic_transition: boolean;
      runtime_grant_mint: boolean; authorization_grant_mint: boolean;
      runtime_can_assume_authorization: boolean;
      legacy_lock: string | null; legacy_snapshot_append: string | null; legacy_event_append: string | null;
    }>(`
      SELECT
        has_table_privilege('debateai_runtime','serve.publication_snapshot','INSERT') AS snapshot_insert,
        has_table_privilege('debateai_runtime','core.run_visibility_event','INSERT') AS event_insert,
        has_table_privilege('debateai_runtime','identity.step_up_grant','SELECT') AS grant_select,
        has_table_privilege('debateai_runtime','identity.step_up_grant','INSERT') AS grant_insert,
        has_table_privilege('debateai_runtime','identity.step_up_grant','UPDATE') AS grant_update,
        has_function_privilege('debateai_runtime',
          'core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,uuid,uuid)',
          'EXECUTE') AS atomic_transition,
        has_function_privilege('debateai_runtime',
          'identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb)',
          'EXECUTE') AS runtime_grant_mint,
        has_function_privilege('debateai_authorization_runtime',
          'identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb)',
          'EXECUTE') AS authorization_grant_mint,
        pg_has_role('debateai_runtime','debateai_authorization_runtime','MEMBER')
          AS runtime_can_assume_authorization,
        to_regprocedure('core.lock_run_for_publication(uuid)')::text AS legacy_lock,
        to_regprocedure('serve.append_publication_snapshot(uuid,uuid,jsonb,timestamptz)')::text
          AS legacy_snapshot_append,
        to_regprocedure('core.append_run_visibility_event(uuid,uuid,uuid,text,uuid,text,timestamptz)')::text
          AS legacy_event_append
    `)).rows[0];
    expect(privileges).toEqual({
      snapshot_insert: false, event_insert: false,
      grant_select: false, grant_insert: false, grant_update: false,
      atomic_transition: true,
      runtime_grant_mint: false, authorization_grant_mint: true,
      runtime_can_assume_authorization: false,
      legacy_lock: null, legacy_snapshot_append: null, legacy_event_append: null
    });

    const runtime = await database.pool.connect();
    try {
      await runtime.query("SET ROLE debateai_runtime");
      await expect(runtime.query(`
        INSERT INTO serve.publication_snapshot (
          publication_ref,run_id,format_version,content_ciphertext,created_at
        ) VALUES ($1,$2,1,$3::jsonb,now())
      `, [publicationRef, runId, JSON.stringify(contentCiphertext)]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query(`
        INSERT INTO core.run_visibility_event (
          run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
          warning_version,occurred_at,at_seq
        ) VALUES ($1,$2,$3,'PUBLISHED',$4,'PUBLIC_INDEXED_V1',now(),1)
      `, [randomUUID(), runId, publicationRef, identity.auditToken]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query(`
        INSERT INTO identity.step_up_grant (
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
          issued_at,expires_at,consumed_at
        ) VALUES ($1,$2,$3,$4,'PUBLISH',$5,now(),now()+interval '1 minute',NULL)
      `, [randomUUID(), hash("a"), identity.sessionId, identity.userId, runId]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query(
        "UPDATE identity.step_up_grant SET consumed_at=NULL WHERE target_run_id=$1", [runId]
      )).rejects.toMatchObject({ code: "42501" });
      const attempted = await runtime.query<{ publication_ref: string | null }>(`
        SELECT core.transition_run_publication(
          $1,$2,$3,$4,$5,$6,'PUBLISH',$7,$8,$9::jsonb,$10,$11,$12,$13
        ) AS publication_ref
      `, [
        randomUUID(), runId, identity.userId, identity.ownerRef, identity.sessionId,
        hash("b"), publicationRef, identity.pseudonym, JSON.stringify(contentCiphertext),
        new Date(), randomUUID(), randomUUID(), randomUUID()
      ]);
      expect(attempted.rows[0]?.publication_ref).toBeNull();
      expect((await runtime.query(
        "SELECT 1 FROM serve.publication_snapshot WHERE publication_ref=$1", [publicationRef]
      )).rowCount).toBe(0);
    } finally {
      await runtime.query("RESET ROLE").catch(() => undefined);
      runtime.release();
    }
  });

  it("executes the complete repository publication transaction as debateai_runtime", async () => {
    const identity = await createIdentity("runtimepath");
    const runId = await createRun(identity, "runtimepath");
    const occurredAt = new Date();
    const grantToken = await grant(identity, runId, "PUBLISH", "5", occurredAt);
    const publicationRef = randomUUID();
    const held = await database.pool.connect();
    try {
      await held.query("SET ROLE debateai_runtime");
      const runtimeRepository = new PostgresPublicationRepository(
        poolWithHeldRuntimeClient(held),
        fakeAuditHasher
      );
      expect(await runtimeRepository.publish({
        runId,
        userId: identity.userId,
        ownerRef: identity.ownerRef,
        sessionId: identity.sessionId,
        grantTokenHash: hashVerificationToken(grantToken),
        occurredAt,
        source,
        publicationRef,
        expectedPseudonym: identity.pseudonym,
        contentCiphertext: await encryptedSnapshot(publicationRef, runId, "runtimepath")
      })).toBe(true);
    } finally {
      await held.query("RESET ROLE").catch(() => undefined);
      held.release();
    }
    expect(await repository.revalidatePublic(runId, publicationRef)).toBe(true);
  });

  it("queues publish before unpublish on the held run lock and linearizes to PRIVATE", async () => {
    const identity = await createIdentity("publish-unpublish");
    const runId = await createRun(identity, "publish-unpublish");
    const occurredAt = new Date();
    const publicationRef = randomUUID();
    const publishGrant = await grant(identity, runId, "PUBLISH", "6", occurredAt);
    const unpublishGrant = await grant(identity, runId, "UNPUBLISH", "7", occurredAt);
    const contentCiphertext = await encryptedSnapshot(
      publicationRef,runId,"publish-unpublish"
    );
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);
    const published = repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt, source, publicationRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext
    });
    await expectStillPending(published);
    const unpublished = repository.unpublish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(unpublishGrant),
      occurredAt: new Date(occurredAt.getTime() + 1), source
    });
    await expectStillPending(unpublished);
    await blocker.query("COMMIT");
    blocker.release();
    expect(await published).toBe(true);
    expect(await unpublished).toBe(publicationRef);
    expect(await repository.revalidatePublic(runId, publicationRef)).toBe(false);
  });

  it("serializes publish while rejecting encrypted ownership transfer", async () => {
    const original = await createIdentity("claim-original");
    const claimant = await createIdentity("claim-next");
    const runId = await createRun(original, "claim-race");
    const occurredAt = new Date();
    const publicationRef = randomUUID();
    const publishGrant = await grant(original, runId, "PUBLISH", "8", occurredAt);
    const contentCiphertext = await encryptedSnapshot(publicationRef,runId,"claim-race");
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);
    const published = repository.publish({
      runId, userId: original.userId, ownerRef: original.ownerRef,
      sessionId: original.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt, source, publicationRef, expectedPseudonym: original.pseudonym,
      contentCiphertext
    });
    await expectStillPending(published);
    await expect(blocker.query(
      "SELECT core.append_run_ownership_event($1,$2)",[runId,claimant.ownerRef]
    )).rejects.toMatchObject({
      code:"23514",message:"ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP"
    });
    await blocker.query("ROLLBACK");
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1");
    await blocker.query("COMMIT");
    blocker.release();
    expect(await published).toBe(true);
    expect((await database.pool.query<{ owned: boolean }>(
      "SELECT core.run_is_owned_by($1,$2,NULL) AS owned", [runId, original.ownerRef]
    )).rows[0]?.owned).toBe(true);
    expect(await repository.revalidatePublic(runId, publicationRef)).toBe(true);
  });

  it("serializes publish against identity shredding and never leaves a user-key dependency", async () => {
    const identity = await createIdentity("shred-race");
    const runId = await createRun(identity, "shred-race");
    const occurredAt = new Date();
    const publicationRef = randomUUID();
    const publishGrant = await grant(identity, runId, "PUBLISH", "9", occurredAt);
    const contentCiphertext = await encryptedSnapshot(publicationRef,runId,"shred-race");
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);
    const published = repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt, source, publicationRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext
    });
    await expectStillPending(published);
    userDeks.get(identity.userId)?.fill(0);
    userDeks.delete(identity.userId);
    userIdsByOwnerRef.delete(identity.ownerRef);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [identity.userId]);
    await blocker.query("COMMIT");
    blocker.release();
    expect(await published).toBe(false);
    expect(await repository.readPublic(publicationRef)).toBeNull();
  });
});
