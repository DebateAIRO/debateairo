import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ContentCipher,
  canonicalContentEnvelopeAttestationBytes,
  encrypt,
  FileRunContentKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek,
  type AuditContextHasher,
  type LoadedRunContentKey,
  type RunContentKeyIdentity,
  type RunContentKeyStore
} from "../../packages/crypto/src/index.js";
import {
  AccountErasureCoordinator,
  CONTENT_CIPHERTEXT_SENTINEL,
  MAX_OWNER_PRIVATE_HISTORY_SCAN,
  PostgresPrivateRunErasureRepository,
  PrivateRunErasureCoordinator,
  acquireOwnerAskAdmissionLease,
  acquireRunContentLease,
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  configureContentEncryption,
  createPool,
  decryptContentForRun,
  migrate,
  PostgresAccountErasureRepository,
  prepareLeasedContentEncryptionForRuns,
  RunRepository,
  withOwnerAskAdmissionLease,
  withRunContentLease
} from "@debateai/db";
import { LivenessRepository } from "@debateai/liveness";
import { WorkItemRepository } from "@debateai/battery";
import { EvidenceRepository } from "../../packages/evidence/src/index.js";
import { CritiqueRepository } from "@debateai/critique";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { MemoryRepository } from "@debateai/memory";
import { ServeRepository } from "@debateai/serve";
import {
  EvaluatorHarvestRepository,
  PostgresEvaluatorAddonRepository
} from "../../packages/evaluator/src/index.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { AccountErasureNotificationReconciler } from "../../apps/api/src/account-erasure.js";
import {
  MailDeliveryError,
  type SecurityNotificationMail
} from "../../apps/api/src/mail-channel.js";

const { Pool: PgPool } = pg;

class TrackingRunContentKeyStore implements RunContentKeyStore {
  readonly storedRunIds: string[] = [];
  readonly destroyedRunIds: string[] = [];
  readonly loadedKeys: Buffer[] = [];
  readonly loadedRunIds: string[] = [];
  failNextDestroy = false;
  operationObserver: ((operation: "store" | "load" | "destroy") => void) | undefined;

  constructor(private readonly delegate: RunContentKeyStore) {}

  async store(runId: string, identity: RunContentKeyIdentity, key: Uint8Array): Promise<void> {
    this.operationObserver?.("store");
    await this.delegate.store(runId, identity, key);
    this.storedRunIds.push(runId);
  }

  async load(runId: string): Promise<LoadedRunContentKey> {
    this.operationObserver?.("load");
    const loaded = await this.delegate.load(runId);
    this.loadedRunIds.push(runId);
    this.loadedKeys.push(loaded.key);
    return loaded;
  }

  exists(runId: string): Promise<boolean> {
    return this.delegate.exists(runId);
  }

  ownerRef(runId: string): Promise<string> {
    return this.delegate.ownerRef(runId);
  }

  listByOwner(ownerRef: string): Promise<readonly string[]> {
    return this.delegate.listByOwner(ownerRef);
  }

  async destroy(runId: string): Promise<"DESTROYED" | "ALREADY_ABSENT"> {
    this.operationObserver?.("destroy");
    if (this.failNextDestroy) {
      this.failNextDestroy = false;
      throw new Error("SECRET_STORE_DELETE_FAILED");
    }
    const outcome = await this.delegate.destroy(runId);
    this.destroyedRunIds.push(runId);
    return outcome;
  }
}

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let authSessionId: string;
let users: FileUserDekStore;
let userKekBytes: Buffer;
let keys: TrackingRunContentKeyStore;
let cipher: ContentCipher;
let ownerResolverObserver: (() => void) | undefined;

async function createActiveUser(): Promise<void> {
  userId = randomUUID();
  ownerRef = randomUUID();
  authSessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x73), `s6-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [authSessionId,userId,`sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
}

type BoundedHistoryOwner = Readonly<{
  userId: string;
  ownerRef: string;
  sessionId: string;
}>;

async function createBoundedHistoryOwner(): Promise<BoundedHistoryOwner> {
  const boundedUserId = randomUUID();
  const boundedOwnerRef = randomUUID();
  const boundedSessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [boundedUserId, randomBytes(32), `s10-bounded-${randomUUID()}`, randomUUID(), boundedOwnerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [boundedSessionId,boundedUserId,`sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
  await users.store(boundedUserId,generateDek());
  return Object.freeze({ userId:boundedUserId,ownerRef:boundedOwnerRef,sessionId:boundedSessionId });
}

async function createEncryptedRun(questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startRun(serverRunInput(questionLine));
}

async function grantPrivateRunDeletion(runId: string): Promise<string> {
  const grantHash = `sha256:${randomBytes(32).toString("hex")}`;
  await database.pool.query(
    `INSERT INTO identity.step_up_grant(
       step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
       target_account_id,issued_at,expires_at,consumed_at
     ) VALUES ($1,$2,$3,$4,'DELETE_PRIVATE_DEBATE',$5,NULL,now(),
       now()+interval '10 minutes',NULL)`,
    [randomUUID(),grantHash,authSessionId,userId,runId]
  );
  return grantHash;
}

async function waitForAdvisoryWait(applicationName: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const waiting = await database.pool.query<{ waiting: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pg_stat_activity
         WHERE application_name=$1 AND wait_event_type='Lock' AND wait_event='advisory'
       ) AS waiting`,
      [applicationName]
    );
    if (waiting.rows[0]?.waiting === true) return;
    await new Promise((resolve) => setTimeout(resolve,10));
  }
  throw new Error(`CONTENT_LEASE_WAIT_NOT_OBSERVED:${applicationName}`);
}

async function waitForCondition(
  predicate:()=>boolean,code:string
):Promise<void> {
  for (let attempt=0;attempt<500;attempt+=1) {
    if (predicate()) return;
    await new Promise((resolve)=>setTimeout(resolve,10));
  }
  throw new Error(code);
}

function serverRunInput(
  questionLine: string,
  identity: BoundedHistoryOwner = Object.freeze({ userId,ownerRef,sessionId:authSessionId })
): Parameters<RunRepository["startRun"]>[0] {
  return {
    questionLine,
    askContract: { audience: "private-test" },
    principal: { kind: "server", userId:identity.userId, ownerRef:identity.ownerRef },
    sessionId: identity.sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-08-23T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "s6:integration",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "s6:integration" },
    registerVersion: 1,
    batteryVersion: "s6:integration",
    batteryRows: []
  };
}

type HistoryScanCounters = {
  advisoryLocks: number;
  keyPreparations: number;
  decrypts: number;
  livenessWrites: number;
  memoryWrites: number;
};

function createObservedHistoryPool(): Readonly<{
  pool: Pool;
  counters: HistoryScanCounters;
  reset(): void;
  end(): Promise<void>;
}> {
  const target = new PgPool({
    connectionString:database.connectionString,
    max:8,
    connectionTimeoutMillis:2_000
  });
  const counters: HistoryScanCounters = {
    advisoryLocks:0,keyPreparations:0,decrypts:0,livenessWrites:0,memoryWrites:0
  };
  const observe = (statement: unknown): void => {
    const sql = typeof statement === "string"
      ? statement
      : typeof statement === "object" && statement !== null && "text" in statement
        ? String((statement as { text:unknown }).text)
        : "";
    if (/pg_(?:try_)?advisory_lock\s*\(/i.test(sql)) counters.advisoryLocks += 1;
    if (/INSERT\s+INTO\s+core\.question_liveness_event/i.test(sql)) counters.livenessWrites += 1;
    if (/INSERT\s+INTO\s+memory\.question_key/i.test(sql)) counters.memoryWrites += 1;
  };
  const observedPool = new Proxy(target,{
    get(poolTarget,property) {
      if (property === "query") return (...args: unknown[]) => {
        observe(args[0]);
        return Reflect.apply(poolTarget.query,poolTarget,args);
      };
      if (property === "connect") return async () => {
        const client = await poolTarget.connect();
        return new Proxy(client,{
          get(clientTarget,clientProperty) {
            if (clientProperty === "query") return (...args: unknown[]) => {
              observe(args[0]);
              return Reflect.apply(clientTarget.query,clientTarget,args);
            };
            const value = Reflect.get(clientTarget,clientProperty,clientTarget);
            return typeof value === "function" ? value.bind(clientTarget) : value;
          }
        });
      };
      const value = Reflect.get(poolTarget,property,poolTarget);
      return typeof value === "function" ? value.bind(poolTarget) : value;
    }
  }) as unknown as Pool;
  const observedCipher = new Proxy(cipher,{
    get(cipherTarget,property) {
      if (property === "prepareRun") return async (runId:string) => {
        counters.keyPreparations += 1;
        const prepared = await cipherTarget.prepareRun(runId);
        return new Proxy(prepared,{
          get(preparedTarget,preparedProperty) {
            if (preparedProperty === "decrypt") return (...args:unknown[]) => {
              counters.decrypts += 1;
              return Reflect.apply(preparedTarget.decrypt,preparedTarget,args);
            };
            const value = Reflect.get(preparedTarget,preparedProperty,preparedTarget);
            return typeof value === "function" ? value.bind(preparedTarget) : value;
          }
        });
      };
      const value = Reflect.get(cipherTarget,property,cipherTarget);
      return typeof value === "function" ? value.bind(cipherTarget) : value;
    }
  });
  configureContentEncryption(observedPool,observedCipher);
  return Object.freeze({
    pool:observedPool,
    counters,
    reset() {
      counters.advisoryLocks=0;
      counters.keyPreparations=0;
      counters.decrypts=0;
      counters.livenessWrites=0;
      counters.memoryWrites=0;
    },
    end:() => target.end()
  });
}

function createObservedAskPool(applicationName:string): Readonly<{
  pool:Pool;
  livenessQueries():number;
  end():Promise<void>;
}> {
  const target = new PgPool({
    connectionString:database.connectionString,max:16,application_name:applicationName
  });
  let observedLivenessQueries = 0;
  const pool = new Proxy(target,{
    get(poolTarget,property) {
      if (property === "query") return (...args:unknown[]) => {
        const statement=args[0];
        const sql=typeof statement === "string"
          ? statement
          : typeof statement === "object" && statement !== null && "text" in statement
            ? String((statement as { text:unknown }).text)
            : "";
        if (/FROM\s+core\.run\s+AS\s+run[\s\S]*core\.run_is_owned_by/i.test(sql)) {
          observedLivenessQueries += 1;
        }
        return Reflect.apply(poolTarget.query,poolTarget,args);
      };
      const value=Reflect.get(poolTarget,property,poolTarget);
      return typeof value === "function" ? value.bind(poolTarget) : value;
    }
  }) as unknown as Pool;
  configureContentEncryption(pool,cipher);
  return Object.freeze({
    pool,
    livenessQueries:() => observedLivenessQueries,
    end:() => target.end()
  });
}

function createObservedAdmissionPool(max:number):Readonly<{
  pool:Pool;advisoryLocks():number;provisionPrepares():number;
  totalConnections():number;end():Promise<void>;
}> {
  const target=new PgPool({ connectionString:database.connectionString,max });
  let advisoryLocks=0;
  let provisionPrepares=0;
  const pool=new Proxy(target,{
    get(poolTarget,property) {
      if (property === "connect") return async () => {
        const client=await poolTarget.connect();
        return new Proxy(client,{
          get(clientTarget,clientProperty) {
            if (clientProperty === "query") return (...args:unknown[]) => {
              const sql=String(args[0]);
              if (sql.includes("pg_advisory_lock(hashtextextended")) advisoryLocks+=1;
              if (sql.includes("core.prepare_run_key_provision")) provisionPrepares+=1;
              return Reflect.apply(clientTarget.query,clientTarget,args);
            };
            const value=Reflect.get(clientTarget,clientProperty,clientTarget);
            return typeof value === "function" ? value.bind(clientTarget) : value;
          }
        });
      };
      const value=Reflect.get(poolTarget,property,poolTarget);
      return typeof value === "function" ? value.bind(poolTarget) : value;
    }
  }) as unknown as Pool;
  return Object.freeze({
    pool,advisoryLocks:()=>advisoryLocks,provisionPrepares:()=>provisionPrepares,
    totalConnections:()=>target.totalCount,end:()=>target.end()
  });
}

async function persistBoundedMemoryCandidate(runId:string,index:number,identity:BoundedHistoryOwner): Promise<void> {
  const canonicalQuestionText = `bounded historical question ${index}`;
  await persistAcceptedTerminal(runId,`bounded-history-${index}-${randomUUID()}`);
  const questionKeyId = randomUUID();
  const prepared = await cipher.prepareRun(runId);
  const envelope = prepared.encrypt("memory.question_key",questionKeyId,{
    canonicalQuestionText,normalizedBinding:{},frozenTerms:[]
  });
  const attestation = prepared.attestEnvelope(
    "memory.question_key",questionKeyId,"content_ciphertext",envelope
  );
  prepared.close();
  await database.pool.query(
    `INSERT INTO memory.question_key (
       question_key_id,run_id,canonical_question_text,caller_scope,asker_scope,
       settlement_act,question_type,declared_field,normalized_binding,frozen_terms,
       frozen_query_set_hash,as_of,policy_version,key_version,at_seq,
       question_blind_index_version,question_blind_index,content_ciphertext,content_attestation
     ) VALUES ($1,$2,$3,'ASKER',$4,NULL,NULL,NULL,'{}'::jsonb,'[]'::jsonb,
       NULL,now(),1,1,ledger.allocate_sequence(),2,NULL,$5::jsonb,$6)`,
    [questionKeyId,runId,CONTENT_CIPHERTEXT_SENTINEL,`owner:${identity.ownerRef}`,
      JSON.stringify(envelope),attestation]
  );
}

async function createLegacyRun(questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine,
    askContract: { audience: "legacy-test" },
    principal: { kind: "legacy", legacyAskerId: `legacy-s6-${randomUUID()}` },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date("2026-08-23T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "s6:legacy-compatibility",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "s6:legacy-compatibility" },
    registerVersion: 1,
    batteryVersion: "s6:legacy-compatibility",
    batteryRows: []
  });
}

async function createForeignOwnerRef(): Promise<string> {
  const foreignOwnerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `s6-foreign-${randomUUID()}`, randomUUID(), foreignOwnerRef]
  );
  return foreignOwnerRef;
}

async function persistAcceptedTerminal(runId: string, marker: string): Promise<string> {
  const terminal = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: marker,
    factBundle: {
      facts: [`s6-accepted-fact-${marker}`],
      residualObjections: [],
      badges: [],
      conditionMarks: ["DEFECT"],
      reversalPoint: `s6-accepted-reversal-${marker}`,
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  await database.pool.query(
    `INSERT INTO scorecard.answer_outcome (
       outcome_attempt_id,answer_id,answer_version,as_of,run_id,model_id,
       model_version,provider,task_class,prior,posterior,basis,resolver_ref,
       resolver_is_external,resolved_outcome,resolved_at,provenance_ref,
       scoreability,accepted,superseded_by_answer_outcome_id,at_seq
     ) VALUES ($1,$2,1,now(),$3,'model:s6-memory','v1','provider:s6-memory',
       'task:s6-memory',0.5,0.7,'s6:memory-race','resolver:s6-memory',true,true,
       now(),'artifact:s6-memory','PERMANENTLY_UNSCOREABLE',true,NULL,
       ledger.allocate_sequence())`,
    [randomUUID(), terminal.answerId, runId]
  );
  return terminal.answerId;
}

async function createBoundedEvaluatorFixture(pool: Pool, marker: string): Promise<{
  readonly runId: string;
  readonly questionLine: string;
  readonly claimText: string;
}> {
  const questionLine = `s6 evaluator question ${marker}`;
  const claimText = `s6 evaluator claim ${marker}`;
  const rawText = JSON.stringify({ restatement_text: `s6 evaluator review ${marker}` });
  const runId = await new RunRepository(pool).startRun(serverRunInput(questionLine));
  const ledger = new LedgerRepository(pool);
  const authorArtifactId = randomUUID();
  const reviewerArtifactId = randomUUID();
  await ledger.appendRawArtifact({
    artifactId: authorArtifactId,
    attemptId: randomUUID(),
    runId,
    providerRef: "provider:s6-evaluator-author",
    provider: "test",
    model: "model:s6-evaluator-author",
    maker: "maker:s6-evaluator-author",
    modelVersion: "v1",
    rawText: JSON.stringify({ author: marker }),
    metadata: {},
    parseStatus: "PARSED",
    inputHash: "8".repeat(64),
    contractHash: "9".repeat(64),
    contentHash: "a".repeat(64)
  });
  await ledger.appendRawArtifact({
    artifactId: reviewerArtifactId,
    attemptId: randomUUID(),
    runId,
    providerRef: "provider:s6-evaluator-reviewer",
    provider: "test",
    model: "model:s6-evaluator-reviewer",
    maker: "maker:s6-evaluator-reviewer",
    modelVersion: "v1",
    rawText,
    metadata: {},
    parseStatus: "PARSED",
    inputHash: "b".repeat(64),
    contractHash: "c".repeat(64),
    contentHash: "d".repeat(64)
  });
  const nodeId = await new GraphRepository(pool).withGraphWrite(runId, (writer) => writer.addNode({
    runId,
    statementText: claimText,
    claimType: "unknown",
    parentNodeId: null,
    childKind: null,
    siblingOrdinal: 0,
    generationStatus: "complete",
    pathStatus: "active",
    explorationDecision: "continue",
    provenanceRef: authorArtifactId,
    wayOfKnowing: "REASONING",
    locator: null,
    valueLaden: false
  }));
  const judgement = new JudgementRepository(pool);
  await judgement.recordNodeReview({
    runId,
    nodeId,
    authorRawArtifactRef: authorArtifactId,
    reviewRawArtifactRef: reviewerArtifactId,
    outcome: "agree",
    reasons: [`s6 evaluator reason ${marker}`]
  });
  await judgement.record({
    runId,
    nodeId,
    rawArtifactRef: reviewerArtifactId,
    tau: 0.75,
    numberKind: "PROBABILITY",
    producer: "judge:s6-evaluator",
    wayOfKnowing: "REASONING"
  });
  await pool.query(
    `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
     VALUES ($1,ledger.allocate_sequence(),'TERMINAL','{"state":"SETTLED"}'::jsonb)`,
    [runId]
  );
  return { runId, questionLine, claimText };
}

function createBoundedEvaluatorPool(): {
  readonly pool: Pool;
  readonly cipher: ContentCipher;
  readonly loadedKeys: readonly Buffer[];
  readonly nestedResolverWaits: () => number;
} {
  const pool = new PgPool({
    connectionString: database.connectionString,
    max: 2,
    connectionTimeoutMillis: 1_000
  });
  let nestedResolverWaits = 0;
  const boundedKeys = new TrackingRunContentKeyStore(new FileRunContentKeyStore(
    secretRoot, users, async (candidate) => {
      const resolved = database.pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
        [candidate]
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const result = await resolved;
      const resolvedUserId = result.rows[0]?.user_id;
      if (resolvedUserId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return resolvedUserId;
    }
  ));
  const boundedCipher = new ContentCipher(boundedKeys);
  configureContentEncryption(pool, boundedCipher);
  return {
    pool,
    cipher: boundedCipher,
    loadedKeys: boundedKeys.loadedKeys,
    nestedResolverWaits: () => nestedResolverWaits
  };
}

type PostgresDataScan = Readonly<{ contains: boolean; files: number; bytes: number }>;

async function scanPostgresData(root: string, needle: string): Promise<PostgresDataScan> {
  const entries = await readdir(root, { withFileTypes: true });
  const target = Buffer.from(needle, "utf8");
  let contains = false;
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    const location = join(root, entry.name);
    if (entry.isDirectory()) {
      const child = await scanPostgresData(location, needle);
      contains ||= child.contains;
      files += child.files;
      bytes += child.bytes;
    } else if (entry.isFile()) {
      const body = await readFile(location);
      contains ||= body.includes(target);
      files += 1;
      bytes += body.length;
    }
  }
  return { contains,files,bytes };
}

async function assertPostgresDataScanReadable(pool: Pool, root: string): Promise<void> {
  const marker = `s10-data-dir-positive-control-${randomUUID()}`;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS core.s10_data_dir_positive_control(
       marker text PRIMARY KEY
     )`
  );
  await pool.query("INSERT INTO core.s10_data_dir_positive_control(marker) VALUES ($1)",[marker]);
  await pool.query("CHECKPOINT");
  const scan = await scanPostgresData(root,marker);
  expect(scan).toMatchObject({ contains:true });
  expect(scan.files).toBeGreaterThan(0);
  expect(scan.bytes).toBeGreaterThan(0);
}

type FreshProcessSecretProbe = Readonly<{
  userDek: Readonly<{ state: "LOADED" | "ERROR"; code?: string }>;
  erasedExists: boolean;
  erasedLoad: Readonly<{ state: "LOADED" | "ERROR"; code?: string }>;
  erasedDecrypt: Readonly<{ state: "DECRYPTED" | "ERROR"; code?: string }>;
  erasedLocator: Readonly<{ state: "DERIVED" | "ERROR"; code?: string }>;
  siblingExists: boolean;
  siblingDecrypt: Readonly<{ state: "DECRYPTED" | "ERROR"; value?: unknown; code?: string }>;
}>;

async function runFreshProcessSecretProbe(input: {
  readonly erasedRunId: string;
  readonly erasedEnvelope: object;
  readonly siblingRunId: string;
  readonly siblingEnvelope: object;
  readonly resolver: Readonly<Record<string,string>>;
  readonly probeUserId: string;
}): Promise<FreshProcessSecretProbe> {
  const cryptoModule = new URL("../../packages/crypto/src/index.ts",import.meta.url).href;
  const program = `
    const { ContentCipher,FileRunContentKeyStore,FileUserDekStore,loadKek } =
      await import(${JSON.stringify(cryptoModule)});
    let payloadText = "";
    for await (const chunk of process.stdin) payloadText += chunk;
    const payload = JSON.parse(payloadText);
    const users = new FileUserDekStore(payload.root,loadKek(Buffer.from(payload.kek,"base64")));
    const keys = new FileRunContentKeyStore(payload.root,users,async (ownerRef) => {
      const userId = payload.resolver[ownerRef];
      if (userId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return userId;
    });
    const cipher = new ContentCipher(keys);
    const outcome = async (success,use) => {
      try { return { state: success,...await use() }; }
      catch (error) { return { state: "ERROR",code: String(error?.code ?? error?.message ?? "UNRESOLVED") }; }
    };
    const result = {
      userDek: await outcome("LOADED",async () => {
        const key = await users.load(payload.probeUserId); key.fill(0); return {};
      }),
      erasedExists: await keys.exists(payload.erasedRunId),
      erasedLoad: await outcome("LOADED",async () => {
        const loaded = await keys.load(payload.erasedRunId); loaded.key.fill(0); return {};
      }),
      erasedDecrypt: await outcome("DECRYPTED",async () => ({
        value: await cipher.decrypt(payload.erasedRunId,"core.run",payload.erasedRunId,payload.erasedEnvelope)
      })),
      erasedLocator: await outcome("DERIVED",async () => ({
        value: await (async () => {
          const prepared = await cipher.prepareRun(payload.erasedRunId);
          try { return prepared.databaseAttestationSecret().toString("hex"); }
          finally { prepared.close(); }
        })()
      })),
      siblingExists: await keys.exists(payload.siblingRunId),
      siblingDecrypt: await outcome("DECRYPTED",async () => ({
        value: await cipher.decrypt(payload.siblingRunId,"core.run",payload.siblingRunId,payload.siblingEnvelope)
      }))
    };
    process.stdout.write(JSON.stringify(result));
  `;
  const payload = JSON.stringify({
    root: secretRoot,kek: userKekBytes.toString("base64"),
    erasedRunId: input.erasedRunId,erasedEnvelope: input.erasedEnvelope,
    siblingRunId: input.siblingRunId,siblingEnvelope: input.siblingEnvelope,
    resolver: input.resolver,probeUserId: input.probeUserId
  });
  return new Promise<FreshProcessSecretProbe>((resolve,reject) => {
    const child = spawn(process.execPath,["--import","tsx","--input-type=module","--eval",program],{
      cwd: process.cwd(),env: { PATH: process.env.PATH ?? "" },stdio: ["pipe","pipe","pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"),10_000);
    child.stdout.setEncoding("utf8").on("data",(chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data",(chunk: string) => { stderr += chunk; });
    child.once("error",(error) => { clearTimeout(timeout); reject(error); });
    child.once("close",(code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`FRESH_PROCESS_SECRET_PROBE_FAILED:${code}:${stderr.slice(0,160)}`));
        return;
      }
      try { resolve(JSON.parse(stdout) as FreshProcessSecretProbe); }
      catch { reject(new Error("FRESH_PROCESS_SECRET_PROBE_OUTPUT_INVALID")); }
    });
    child.stdin.end(payload);
  });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-s6-content-"));
  await createActiveUser();
  userKekBytes = generateDek();
  users = new FileUserDekStore(secretRoot, loadKek(userKekBytes));
  await users.store(userId, generateDek());
  keys = new TrackingRunContentKeyStore(new FileRunContentKeyStore(
    secretRoot,
    users,
    async (candidate) => {
      ownerResolverObserver?.();
      const result = await database.pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
        [candidate]
      );
      const resolved = result.rows[0]?.user_id;
      if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return resolved;
    }
  ));
  cipher = new ContentCipher(keys);
  configureContentEncryption(database.pool, cipher);
}, 120_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("S6 content encryption on disposable PostgreSQL", () => {
  it("applies the complete fresh migration set and replays 0040 safely", async () => {
    const directory=new URL("../../migrations/",import.meta.url);
    const migration=await readFile(new URL("0040_account_erasure.sql",directory),"utf8");
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    await expect(database.pool.query(migration)).resolves.toBeDefined();
  },120_000);

  it("bounds owner-private liveness and memory scans at N before any N+1 lease, key load, decrypt, or write", async () => {
    expect(MAX_OWNER_PRIVATE_HISTORY_SCAN).toBe(128);
    const identity = await createBoundedHistoryOwner();
    const runs = await Promise.all(Array.from(
      { length:MAX_OWNER_PRIVATE_HISTORY_SCAN },
      (_,index) => new RunRepository(database.pool).startRun(
        serverRunInput(`bounded history run ${index}`,identity)
      )
    ));
    const observed = createObservedHistoryPool();
    try {
      const liveness = new LivenessRepository(observed.pool);
      observed.reset();
      await expect(liveness.recordQuery(
        "bounded history query with no match",
        { ownerRef:identity.ownerRef,legacyAskerId:null }
      )).resolves.toBe(0);
      expect(observed.counters).toEqual({
        advisoryLocks:MAX_OWNER_PRIVATE_HISTORY_SCAN,
        keyPreparations:MAX_OWNER_PRIVATE_HISTORY_SCAN,
        decrypts:MAX_OWNER_PRIVATE_HISTORY_SCAN,
        livenessWrites:0,
        memoryWrites:0
      });
      const livenessRowsBeforeSaturation = (await database.pool.query<{ count:string }>(
        `SELECT count(*)::text AS count FROM core.question_liveness_event
         WHERE run_id=ANY($1::uuid[])`,[runs]
      )).rows[0]!.count;

      const admittedRunId = await (async () => {
        const applicationNameA=`s10-owner-ask-a-${randomUUID()}`;
        const applicationNameB=`s10-owner-ask-b-${randomUUID()}`;
        const applicationNameC=`s10-owner-ask-c-${randomUUID()}`;
        const observedA=createObservedAskPool(applicationNameA);
        const observedB=createObservedAskPool(applicationNameB);
        const observedC=createObservedAskPool(applicationNameC);
        const admission=createObservedAdmissionPool(3);
        const admissionPool=admission.pool;
        const dispatched:string[]=[];
        const ownership={ ownerRef:identity.ownerRef,legacyAskerId:null } as const;
        const submit=async (pool:Pool,label:string) => {
          const runId=await withOwnerAskAdmissionLease(
            admissionPool,ownership,async (lease) => {
            await new LivenessRepository(pool).recordQuery(
              `bounded concurrent memory source ${label}`,ownership,
              new Date("2026-08-25T00:00:00.000Z")
            );
            const runId=await new RunRepository(pool).startRun(
              serverRunInput(`bounded concurrent memory source ${label}`,identity),
              lease.client
            );
            return runId;
          });
            await new ServeRepository(pool).recordMemoryQuestion({
              runId,questionLine:`bounded concurrent memory source ${label}`,
              callerScope:"ASKER",askerScope:`owner:${identity.ownerRef}`,
              asOf:"2026-08-25T00:00:00.000Z",policyVersion:1
            },ownership);
            const workItemId=await new WorkItemRepository(pool).enqueue({
              runId,batteryRowId:"Q1",nodeSet:[],commandKey:`S00:${runId}:Q1`
            });
            dispatched.push(runId);
            return Object.freeze({ run_ref:runId,status:"QUEUED" as const,workItemId });
        };
        const blocker=await database.pool.connect();
        let accountLocked=false;
        let submitA:ReturnType<typeof submit>|undefined;
        let submitB:ReturnType<typeof submit>|undefined;
        let submitC:ReturnType<typeof submit>|undefined;
        try {
          await blocker.query(
            "SELECT pg_advisory_lock(hashtextextended($1,0))",
            [`identity:account:${identity.userId}`]
          );
          accountLocked=true;
          submitA=submit(observedA.pool,"A");
          await waitForCondition(
            ()=>admission.provisionPrepares()===1,
            "OWNER_ADMISSION_FIRST_PREPARE_NOT_OBSERVED"
          );
          expect(observedA.livenessQueries()).toBe(1);
          submitB=submit(observedB.pool,"B");
          submitC=submit(observedC.pool,"C");
          await waitForCondition(
            ()=>admission.advisoryLocks()===3 && admission.totalConnections()===3,
            "OWNER_ADMISSION_SHARED_POOL_NOT_SATURATED"
          );
          // Both followers must be queued at the owner admission lease while
          // every connection in the admission pool is occupied. Without that
          // cross-process boundary it completes its own liveness scan and can
          // later provision a run that loses the memory N+1 race.
          expect(observedB.livenessQueries()).toBe(0);
          expect(observedC.livenessQueries()).toBe(0);
          await blocker.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0)) AS unlocked",
            [`identity:account:${identity.userId}`]
          );
          accountLocked=false;
          const settled=await Promise.allSettled([submitA,submitB,submitC]);
          const fulfilled=settled.filter((item) => item.status === "fulfilled");
          const rejected=settled.filter((item) => item.status === "rejected");
          if (fulfilled.length !== 1) {
            throw new Error(`OWNER_ADMISSION_SETTLEMENT_INVALID:${JSON.stringify(settled.map(
              (item) => item.status === "fulfilled"
                ? { status:item.status,value:item.value }
                : { status:item.status,reason:String(item.reason),code:(item.reason as { code?:unknown })?.code }
            ))}`);
          }
          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(2);
          for (const item of rejected) expect(item).toMatchObject({
            reason:{ name:"TypedDomainError",code:"OWNER_PRIVATE_HISTORY_SCAN_SATURATED" }
          });
          const accepted=(fulfilled[0] as PromiseFulfilledResult<{
            readonly run_ref:string; readonly status:"QUEUED"; readonly workItemId:string;
          }>).value;
          expect(dispatched).toEqual([accepted.run_ref]);
          expect(observedB.livenessQueries()).toBe(1);
          expect(observedC.livenessQueries()).toBe(1);
          const durable=await database.pool.query<{
            owned_runs:string; attestation_rows:string; memory_rows:string;
            work_rows:string; pending_intents:string;
          }>(`
            SELECT
              (SELECT count(*)::text FROM core.run AS candidate
               WHERE core.run_is_owned_by(candidate.run_id,$1,NULL)) AS owned_runs,
              (SELECT count(*)::text FROM core.run_content_attestation_secret
               WHERE run_id=$2) AS attestation_rows,
              (SELECT count(*)::text FROM memory.question_key WHERE run_id=$2) AS memory_rows,
              (SELECT count(*)::text FROM core.work_item WHERE run_id=$2) AS work_rows,
              (SELECT count(*)::text FROM core.run_key_provision_intent
               WHERE user_id=$3) AS pending_intents
          `,[identity.ownerRef,accepted.run_ref,identity.userId]);
          expect(durable.rows[0]).toEqual({
            owned_runs:String(MAX_OWNER_PRIVATE_HISTORY_SCAN+1),
            attestation_rows:"1",memory_rows:"1",work_rows:"1",pending_intents:"0"
          });
          expect(await keys.listByOwner(identity.ownerRef)).toHaveLength(
            MAX_OWNER_PRIVATE_HISTORY_SCAN+1
          );
          return accepted.run_ref;
        } finally {
          if (accountLocked) {
            await blocker.query(
              "SELECT pg_advisory_unlock(hashtextextended($1,0))",
              [`identity:account:${identity.userId}`]
            ).catch(() => undefined);
          }
          blocker.release();
          if (submitA !== undefined || submitB !== undefined || submitC !== undefined) {
            await Promise.allSettled([submitA,submitB,submitC].filter(
              (promise):promise is NonNullable<typeof promise> => promise !== undefined
            ));
          }
          await Promise.all([
            observedA.end(),observedB.end(),observedC.end(),admission.end()
          ]);
        }
      })();
      expect(admittedRunId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      const sourceRunId = await new RunRepository(database.pool).startRun(
        serverRunInput("bounded memory source",identity)
      );
      observed.reset();
      await expect(liveness.recordQuery(
        "bounded saturated liveness",
        { ownerRef:identity.ownerRef,legacyAskerId:null }
      )).rejects.toMatchObject({ code:"OWNER_PRIVATE_HISTORY_SCAN_SATURATED" });
      expect(observed.counters).toEqual({
        advisoryLocks:0,keyPreparations:0,decrypts:0,livenessWrites:0,memoryWrites:0
      });
      expect((await database.pool.query<{ count:string }>(
        `SELECT count(*)::text AS count FROM core.question_liveness_event
         WHERE run_id=ANY($1::uuid[])`,[runs]
      )).rows[0]?.count).toBe(livenessRowsBeforeSaturation);

      for (let offset=0; offset<runs.length; offset+=8) {
        await Promise.all(runs.slice(offset,offset+8).map((runId,index) =>
          persistBoundedMemoryCandidate(runId,offset+index,identity)
        ));
      }
      const memory = new MemoryRepository(observed.pool);
      const memoryInput = {
        key:{
          runId:sourceRunId,
          canonicalQuestionText:"bounded current question with no match",
          callerScope:"ASKER",
          askerScope:`owner:${identity.ownerRef}`,
          settlementAct:null,
          questionType:null,
          declaredField:null,
          normalizedBinding:{},
          frozenTerms:[],
          frozenQuerySetHash:null,
          asOf:"2026-08-25T00:00:00.000Z",
          policyVersion:1,
          keyVersion:1
        },
        decidedBy:"s10:bounded-owner-history",
        ownership:{ ownerRef:identity.ownerRef,legacyAskerId:null }
      } as const;
      observed.reset();
      await expect(memory.recordQuestionAndMatch(memoryInput)).resolves.toBeNull();
      expect(observed.counters).toEqual({
        // One short lease per candidate, the source write lease, and the
        // post-write disclosure projection's source lease are all bounded.
        advisoryLocks:MAX_OWNER_PRIVATE_HISTORY_SCAN+2,
        keyPreparations:MAX_OWNER_PRIVATE_HISTORY_SCAN+1,
        decrypts:MAX_OWNER_PRIVATE_HISTORY_SCAN,
        livenessWrites:0,
        memoryWrites:1
      });
      const sourceRowsBefore = (await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM memory.question_key WHERE run_id=$1",
        [sourceRunId]
      )).rows[0]!.count;

      const overflowRunId = await new RunRepository(database.pool).startRun(
        serverRunInput("bounded memory overflow",identity)
      );
      await persistBoundedMemoryCandidate(
        overflowRunId,MAX_OWNER_PRIVATE_HISTORY_SCAN,identity
      );
      observed.reset();
      await expect(memory.recordQuestionAndMatch(memoryInput)).rejects.toMatchObject({
        code:"OWNER_PRIVATE_HISTORY_SCAN_SATURATED"
      });
      expect(observed.counters).toEqual({
        advisoryLocks:0,keyPreparations:0,decrypts:0,livenessWrites:0,memoryWrites:0
      });
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM memory.question_key WHERE run_id=$1",
        [sourceRunId]
      )).rows[0]?.count).toBe(sourceRowsBefore);
    } finally {
      await observed.end();
    }
  },600_000);

  it("creates server and legacy runs on the exact held admission backend",async ()=>{
    const serverPool=new PgPool({ connectionString:database.connectionString,max:1 });
    const legacyPool=new PgPool({ connectionString:database.connectionString,max:1 });
    const observeClient=(client:PoolClient,statements:string[]):PoolClient => new Proxy(client,{
      get(target,property) {
        if (property === "query") return (...args:unknown[]) => {
          const statement=args[0];
          statements.push(typeof statement === "string" ? statement
            : typeof statement === "object" && statement !== null && "text" in statement
              ? String((statement as { text:unknown }).text) : "");
          return Reflect.apply(target.query,target,args);
        };
        const value=Reflect.get(target,property,target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as PoolClient;
    try {
      const serverStatements:string[]=[];
      const serverRunId=await withOwnerAskAdmissionLease(
        serverPool,{ ownerRef,legacyAskerId:null },async (lease) => {
          const before=(await lease.client.query<{ pid:number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]!.pid;
          const created=await new RunRepository(database.pool).startRun(
            serverRunInput(`S6 exact server admission backend ${randomUUID()}`),
            observeClient(lease.client,serverStatements)
          );
          const after=(await lease.client.query<{ pid:number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]!.pid;
          expect(after).toBe(before);
          return created;
        }
      );
      expect(serverStatements.some((sql)=>sql.includes("core.prepare_run_key_provision"))).toBe(true);
      expect(serverStatements.some((sql)=>sql.includes("core.create_encrypted_run"))).toBe(true);
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",[serverRunId]
      )).rows[0]?.count).toBe("1");

      const legacyAskerId=`legacy-owner-admission-${randomUUID()}`;
      const legacyStatements:string[]=[];
      const legacyRunId=await withOwnerAskAdmissionLease(
        legacyPool,{ ownerRef:null,legacyAskerId },async (lease) => {
          const before=(await lease.client.query<{ pid:number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]!.pid;
          const created=await new RunRepository(database.pool).startRun({
            questionLine:`S6 exact legacy admission backend ${randomUUID()}`,
            askContract:{ audience:"legacy-admission" },
            principal:{ kind:"legacy",legacyAskerId },sessionId:randomUUID(),
            callerScope:"ASKER",asOf:new Date("2026-08-25T00:00:00.000Z"),
            askerRiskTier:"casual",effectiveRiskTier:"casual",tierSource:"ASKER",
            tierProvenanceRef:"s6:legacy-admission",compositionBudgetTier:"low",
            depthParams:{ depth:1 },discoveredPanel:fixtureDiscoveredPanel(1),
            strangerSampleRate:1,envelopeBasis:{ source:"s6:legacy-admission" },
            registerVersion:1,batteryVersion:"s6:legacy-admission",batteryRows:[]
          },observeClient(lease.client,legacyStatements));
          const after=(await lease.client.query<{ pid:number }>(
            "SELECT pg_backend_pid() AS pid"
          )).rows[0]!.pid;
          expect(after).toBe(before);
          return created;
        }
      );
      expect(legacyStatements).toEqual(expect.arrayContaining(["BEGIN","COMMIT"]));
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",[legacyRunId]
      )).rows[0]?.count).toBe("1");
    } finally {
      await Promise.all([serverPool.end(),legacyPool.end()]);
    }
  },120_000);

  it("lets a different owner create while another owner admission is blocked",async ()=>{
    const blockedIdentity=await createBoundedHistoryOwner();
    const independentIdentity=await createBoundedHistoryOwner();
    const admission=createObservedAdmissionPool(2);
    const admissionPool=admission.pool;
    const blocker=await database.pool.connect();
    let accountLocked=false;
    const start=async (identity:BoundedHistoryOwner,label:string) =>
      withOwnerAskAdmissionLease(
        admissionPool,{ ownerRef:identity.ownerRef,legacyAskerId:null },async (lease) => {
          await new LivenessRepository(database.pool).recordQuery(
            `S6 independent admission ${label}`,
            { ownerRef:identity.ownerRef,legacyAskerId:null }
          );
          return new RunRepository(database.pool).startRun(
            serverRunInput(`S6 independent admission ${label}`,identity),lease.client
          );
        }
      );
    let blocked:Promise<string>|undefined;
    try {
      await blocker.query(
        "SELECT pg_advisory_lock(hashtextextended($1,0))",
        [`identity:account:${blockedIdentity.userId}`]
      );
      accountLocked=true;
      blocked=start(blockedIdentity,"blocked");
      await waitForCondition(
        ()=>admission.provisionPrepares()===1,
        "OWNER_ADMISSION_BLOCKED_PREPARE_NOT_OBSERVED"
      );
      let blockedSettled=false;
      void blocked.then(()=>{ blockedSettled=true; },()=>{ blockedSettled=true; });
      const independentRunId=await start(independentIdentity,"independent");
      expect(blockedSettled).toBe(false);
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",[independentRunId]
      )).rows[0]?.count).toBe("1");
      await blocker.query(
        "SELECT pg_advisory_unlock(hashtextextended($1,0))",
        [`identity:account:${blockedIdentity.userId}`]
      );
      accountLocked=false;
      const blockedRunId=await blocked;
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.run WHERE run_id=ANY($1::uuid[])",
        [[blockedRunId,independentRunId]]
      )).rows[0]?.count).toBe("2");
    } finally {
      if (accountLocked) await blocker.query(
        "SELECT pg_advisory_unlock(hashtextextended($1,0))",
        [`identity:account:${blockedIdentity.userId}`]
      ).catch(()=>undefined);
      blocker.release();
      if (blocked !== undefined) await Promise.allSettled([blocked]);
      await admission.end();
    }
  },120_000);

  it("isolates owner admission scopes in either order and releases the session lease on backend crash", async () => {
    const lowOwner="00000000-0000-4000-8000-000000000001";
    const highOwner="ffffffff-ffff-4fff-bfff-ffffffffffff";
    const legacyOwner="legacy-owner-admission-s6";
    const lowPool=new PgPool({
      connectionString:database.connectionString,max:1,
      application_name:`s10-owner-low-${randomUUID()}`
    });
    const highPool=new PgPool({
      connectionString:database.connectionString,max:1,
      application_name:`s10-owner-high-${randomUUID()}`
    });
    const legacyPool=new PgPool({
      connectionString:database.connectionString,max:1,
      application_name:`s10-owner-legacy-${randomUUID()}`
    });
    const within=async <T>(promise:Promise<T>,stage="scope"):Promise<T> => new Promise<T>((resolve,reject) => {
      const timer=setTimeout(() => reject(new Error(`OWNER_ADMISSION_SCOPE_BLOCKED:${stage}`)),2_000);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
    try {
      let releaseLow!:()=>void;
      let lowEntered!:()=>void;
      const lowEnteredPromise=new Promise<void>((resolve) => { lowEntered=resolve; });
      const lowReleasePromise=new Promise<void>((resolve) => { releaseLow=resolve; });
      const lowHolder=withOwnerAskAdmissionLease(
        lowPool,{ ownerRef:lowOwner,legacyAskerId:null },async () => {
          lowEntered();
          await lowReleasePromise;
        }
      );
      await lowEnteredPromise;
      await expect(within(withOwnerAskAdmissionLease(
        highPool,{ ownerRef:highOwner,legacyAskerId:null },async () => "HIGH"
      ))).resolves.toBe("HIGH");
      await expect(within(withOwnerAskAdmissionLease(
        legacyPool,{ ownerRef:null,legacyAskerId:legacyOwner },async () => "LEGACY"
      ))).resolves.toBe("LEGACY");
      releaseLow();
      await lowHolder;

      let releaseHigh!:()=>void;
      let highEntered!:()=>void;
      const highEnteredPromise=new Promise<void>((resolve) => { highEntered=resolve; });
      const highReleasePromise=new Promise<void>((resolve) => { releaseHigh=resolve; });
      const highHolder=withOwnerAskAdmissionLease(
        highPool,{ ownerRef:highOwner,legacyAskerId:null },async () => {
          highEntered();
          await highReleasePromise;
        }
      );
      await highEnteredPromise;
      await expect(within(withOwnerAskAdmissionLease(
        lowPool,{ ownerRef:lowOwner,legacyAskerId:null },async () => "LOW"
      ))).resolves.toBe("LOW");
      releaseHigh();
      await highHolder;
    } finally {
      await Promise.all([lowPool.end(),highPool.end(),legacyPool.end()]);
    }

  },120_000);

  it("releases an owner admission lease when its dedicated backend crashes", async () => {
    const crashIdentity=await createBoundedHistoryOwner();
    const crashOwner=crashIdentity.ownerRef;
    const holderName=`s10-owner-admission-crash-holder-${randomUUID()}`;
    const holderPool=new PgPool({
      connectionString:database.connectionString,max:1,application_name:holderName
    });
    const within=async <T>(promise:Promise<T>,stage:string):Promise<T> => new Promise<T>((resolve,reject) => {
      const timer=setTimeout(() => reject(new Error(`OWNER_ADMISSION_CRASH_BLOCKED:${stage}`)),2_000);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
    const holderLease=await acquireOwnerAskAdmissionLease(
      holderPool,{ ownerRef:crashOwner,legacyAskerId:null }
    );
    const storedBefore=keys.storedRunIds.length;
    try {
      await expect(new LivenessRepository(database.pool).recordQuery(
        "S6 killed admission after liveness and before create",
        { ownerRef:crashOwner,legacyAskerId:null }
      )).resolves.toBe(0);
      const holderPid=(await holderLease.client.query<{ pid:number }>(
        "SELECT pg_backend_pid() AS pid"
      )).rows[0]?.pid;
      expect(holderPid).toBeTypeOf("number");
      await expect(database.pool.query(
        "SELECT pg_terminate_backend($1) AS terminated",[holderPid]
      )).resolves.toMatchObject({ rows:[{ terminated:true }] });
      await expect(new RunRepository(database.pool).startRun(
        serverRunInput(`S6 killed before admission create ${randomUUID()}`,crashIdentity),
        holderLease.client
      )).rejects.toBeInstanceOf(Error);
      await expect(within(holderLease.release(),"crashed-holder-result")).rejects.toBeInstanceOf(Error);
      const successorRunId=await within(withOwnerAskAdmissionLease(
        holderPool,{ ownerRef:crashOwner,legacyAskerId:null },async (successorLease) => {
          await expect(new LivenessRepository(database.pool).recordQuery(
            "S6 successor recheck after killed admission backend",
            { ownerRef:crashOwner,legacyAskerId:null }
          )).resolves.toBe(0);
          return new RunRepository(database.pool).startRun(
            serverRunInput(`S6 successor after killed admission backend ${randomUUID()}`,crashIdentity),
            successorLease.client
          );
        }
      ),"successor");
      expect(keys.storedRunIds.slice(storedBefore)).toEqual([successorRunId]);
      expect((await database.pool.query<{ runs:string;intents:string }>(`
        SELECT
          (SELECT count(*)::text FROM core.run WHERE run_id=$1) AS runs,
          (SELECT count(*)::text FROM core.run_key_provision_intent
            WHERE user_id=$2) AS intents
      `,[successorRunId,crashIdentity.userId])).rows[0]).toEqual({ runs:"1",intents:"0" });
    } finally {
      await holderLease.release().catch(() => undefined);
      await within(holderPool.end(),"crash-holder-pool-end");
    }
  },120_000);

  it("rechecks a committed ambiguous admission before any successor provision",async ()=>{
    const ambiguousIdentity=await createBoundedHistoryOwner();
    await Promise.all(Array.from(
      { length:MAX_OWNER_PRIVATE_HISTORY_SCAN },(_,index) =>
        new RunRepository(database.pool).startRun(serverRunInput(
          `S6 ambiguous admission history ${index}`,ambiguousIdentity
        ))
    ));
    const admissionPool=new PgPool({
      connectionString:database.connectionString,max:1,
      application_name:`s10-owner-admission-ambiguous-${randomUUID()}`
    });
    const ownership={ ownerRef:ambiguousIdentity.ownerRef,legacyAskerId:null } as const;
    const storedBefore=keys.storedRunIds.length;
    try {
      const failure=await withOwnerAskAdmissionLease(
        admissionPool,ownership,async (lease) => {
          const ambiguousClient=new Proxy(lease.client,{
            get(target,property) {
              if (property === "query") return async (...args:unknown[]) => {
                const result=await Reflect.apply(target.query,target,args);
                if (String(args[0]).includes("core.create_encrypted_run")) {
                  throw Object.assign(new Error("ambiguous response after commit"),{
                    code:"ECONNRESET"
                  });
                }
                return result;
              };
              const value=Reflect.get(target,property,target);
              return typeof value === "function" ? value.bind(target) : value;
            }
          }) as PoolClient;
          return new RunRepository(database.pool).startRun(
            serverRunInput(`S6 ambiguous admission commit ${randomUUID()}`,ambiguousIdentity),
            ambiguousClient
          );
        }
      ).catch((error:unknown)=>error);
      expect(failure).toMatchObject({
        code:"RUN_CONTENT_ROLLBACK_INCOMPLETE",
        message:"Run rollback or external content-key cleanup did not complete"
      });
      const committedRunId=keys.storedRunIds[storedBefore]!;
      expect(await keys.exists(committedRunId)).toBe(true);
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",[committedRunId]
      )).rows[0]?.count).toBe("1");

      await expect(withOwnerAskAdmissionLease(
        admissionPool,ownership,async () => new LivenessRepository(database.pool).recordQuery(
          "S6 successor after ambiguous admission commit",ownership
        )
      )).rejects.toMatchObject({ code:"OWNER_PRIVATE_HISTORY_SCAN_SATURATED" });
      expect(keys.storedRunIds.slice(storedBefore)).toEqual([committedRunId]);
      expect((await database.pool.query<{ runs:string;intents:string }>(`
        SELECT
          (SELECT count(*)::text FROM core.run AS candidate
            WHERE core.run_is_owned_by(candidate.run_id,$1,NULL)) AS runs,
          (SELECT count(*)::text FROM core.run_key_provision_intent
            WHERE user_id=$2) AS intents
      `,[ambiguousIdentity.ownerRef,ambiguousIdentity.userId])).rows[0]).toEqual({
        runs:String(MAX_OWNER_PRIVATE_HISTORY_SCAN+1),intents:"0"
      });
    } finally {
      await admissionPool.end();
    }
  },600_000);

  it("refuses historical and forward WhatsApp identity carriers", async () => {
    await expect(database.pool.query(
      `UPDATE identity."user" SET phone_ciphertext='{}'::jsonb WHERE user_id=$1`,
      [userId]
    )).rejects.toMatchObject({ code:"23514" });
    for (const [action,targetRunId,targetAccountId] of [
      ["DELETE_ACCOUNT",randomUUID(),null],
      ["DELETE_ACCOUNT",randomUUID(),userId],
      ["PUBLISH",null,userId]
    ] as const) {
      await expect(database.pool.query(
        `INSERT INTO identity.step_up_grant(
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
          target_account_id,issued_at,expires_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),
          clock_timestamp()+interval '10 minutes')`,
        [randomUUID(),`sha256:${randomBytes(32).toString("hex")}`,authSessionId,
          userId,action,targetRunId,targetAccountId]
      )).rejects.toMatchObject({ code:"23514" });
    }
    await expect(database.pool.query(
      `INSERT INTO identity.channel_binding(
        channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at
      ) VALUES ($1,$2,'whatsapp','{}'::jsonb,'pending_verification',clock_timestamp())`,
      [randomUUID(),userId]
    )).rejects.toMatchObject({ code:"23514" });

    const directory=new URL("../../migrations/",import.meta.url);
    const names=(await readdir(directory))
      .filter((name)=>/^\d+.*\.sql$/.test(name) && name<"0040_account_erasure.sql")
      .sort();
    const migration=await readFile(
      new URL("0040_account_erasure.sql",directory),"utf8"
    );
    for (const carrier of ["phone","binding"] as const) {
      const target=await startTestDatabase();
      try {
        for (const name of names) {
          await target.pool.query(await readFile(new URL(name,directory),"utf8"));
        }
        const historicalUserId=randomUUID();
        await target.pool.query(
          `INSERT INTO identity."user"(
            user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
            phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
            adult_affirmed_at,created_at
          ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,$3::jsonb,'test-password-hash',
            $4,$5,$6,'active',clock_timestamp(),clock_timestamp())`,
          [historicalUserId,randomBytes(32),carrier==="phone" ? "{}" : null,
            `s10-whatsapp-${randomUUID()}`,randomUUID(),randomUUID()]
        );
        if (carrier==="binding") {
          await target.pool.query(
            `INSERT INTO identity.channel_binding(
              channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at
            ) VALUES ($1,$2,'whatsapp','{}'::jsonb,'pending_verification',clock_timestamp())`,
            [randomUUID(),historicalUserId]
          );
        }
        await expect(target.pool.query(migration)).rejects.toMatchObject({
          code:"23514",message:"S10_WHATSAPP_CHANNEL_UNSUPPORTED"
        });
      } finally {
        await target.stop();
      }
    }
  },120_000);

  it("refuses a historical encrypted v1 blind index instead of grandfathering equality bytes", async () => {
    const target=await startTestDatabase();
    try {
      const directory=new URL("../../migrations/",import.meta.url);
      const names=(await readdir(directory))
        .filter((name)=>/^\d+.*\.sql$/.test(name) && name<"0040_account_erasure.sql")
        .sort();
      for (const name of names) {
        await target.pool.query(await readFile(new URL(name,directory),"utf8"));
      }
      const runId=randomUUID();
      const historicalUserId=randomUUID();
      const historicalOwnerRef=randomUUID();
      const envelope={ v:"1",keyId:"v1-fixture",nonce:"AA==",ct:"AA==",tag:"AA==" };
      await target.pool.query(
        `INSERT INTO identity."user"(
          user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
          phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
          adult_affirmed_at,created_at
        ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'v1-fixture-password',
          $3,$4,$5,'active',clock_timestamp(),clock_timestamp())`,
        [historicalUserId,randomBytes(32),`s10-v1-${randomUUID()}`,randomUUID(),
          historicalOwnerRef]
      );
      await target.pool.query(
        `INSERT INTO core.run(
          run_id,question_line,asker_id,session_id,caller_scope,as_of,
          asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
          composition_budget_tier,depth_params,agent_count,discovered_panel,
          stranger_sample_rate,envelope_basis,register_version,battery_version,
          ask_contract,created_at_seq,content_encryption_version,
          question_blind_index,content_ciphertext
        ) VALUES (
          $1,$2,$3,$4,'ASKER',clock_timestamp(),'casual','casual','ASKER',
          's10:v1-preflight','low','{}'::jsonb,1,$5::jsonb,1,'{}'::jsonb,1,
          's10:v1-preflight',$6::jsonb,ledger.allocate_sequence(),1,$7,$8::jsonb
        )`,
        [runId,CONTENT_CIPHERTEXT_SENTINEL,`owner:${historicalOwnerRef}`,randomUUID(),
          JSON.stringify(fixtureDiscoveredPanel(1)),JSON.stringify({ ciphertext:true,v:1 }),
          randomBytes(32),JSON.stringify(envelope)]
      );
      await target.pool.query(
        "SELECT core.append_run_ownership_event($1,$2)",[runId,historicalOwnerRef]
      );
      const migration=await readFile(new URL("0040_account_erasure.sql",directory),"utf8");
      await expect(target.pool.query(migration)).rejects.toMatchObject({
        code:"23514",message:"CONTENT_BLIND_INDEX_V1_ROWS_FORBIDDEN"
      });
      expect((await target.pool.query<{ version:number; qbi_bytes:number }>(
        `SELECT content_encryption_version AS version,
          octet_length(question_blind_index) AS qbi_bytes
         FROM core.run WHERE run_id=$1`,[runId]
      )).rows[0]).toEqual({ version:1,qbi_bytes:32 });
    } finally {
      await target.stop();
    }
  },120_000);

  it("migrates a default-off pre-0038 legacy run through the final schema", async () => {
    const pre0038 = await startTestDatabase();
    try {
      const directory = new URL("../../migrations/", import.meta.url);
      const names = (await readdir(directory))
        .filter((name) => /^\d+.*\.sql$/.test(name) && name < "0038_content_encryption.sql")
        .sort();
      for (const name of names) {
        await pre0038.pool.query(await readFile(new URL(name, directory), "utf8"));
      }

      const questionLine = `S6 pre-0038 legacy question ${randomUUID()}`;
      const legacyAskerId = `legacy-s6-pre0038-${randomUUID()}`;
      const repository = new RunRepository(pre0038.pool);
      const runId = await repository.startRun({
        questionLine,
        askContract: { audience: "pre-0038-legacy" },
        principal: { kind: "legacy", legacyAskerId },
        sessionId: randomUUID(),
        callerScope: "ASKER",
        asOf: new Date("2026-08-23T00:00:00.000Z"),
        askerRiskTier: "casual",
        effectiveRiskTier: "casual",
        tierSource: "ASKER",
        tierProvenanceRef: "s6:pre-0038-compatibility",
        compositionBudgetTier: "low",
        depthParams: { depth: 1 },
        discoveredPanel: fixtureDiscoveredPanel(1),
        strangerSampleRate: 1,
        envelopeBasis: { source: "s6:pre-0038-compatibility" },
        registerVersion: 1,
        batteryVersion: "s6:pre-0038-compatibility",
        batteryRows: []
      });

      const stored = await pre0038.pool.query<{ question_line: string; ask_contract: unknown }>(
        `SELECT question_line, ask_contract FROM core.run WHERE run_id=$1`,
        [runId]
      );
      expect(stored.rows[0]).toEqual({
        question_line: questionLine,
        ask_contract: { audience: "pre-0038-legacy" }
      });
      for (const name of (await readdir(directory))
        .filter((name) => /^\d+.*\.sql$/.test(name) && name >= "0038_content_encryption.sql")
        .sort()) {
        await pre0038.pool.query(await readFile(new URL(name, directory), "utf8"));
      }
      expect(await repository.readLoadingProjection(runId, {
        ownerRef: null,
        legacyAskerId
      })).toMatchObject({ runRef: runId, questionLine });
      expect(await repository.readFrozenHead(runId)).toMatchObject({ runId, questionLine });
      expect((await pre0038.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
         WHERE table_schema='core' AND table_name='run'
           AND column_name IN ('content_encryption_version','question_blind_index','content_ciphertext')`
      )).rows[0]?.count).toBe("3");
    } finally {
      await pre0038.stop();
    }
  }, 120_000);

  it("applies migration 0038 replay-safely", async () => {
    await expect(migrate(database.pool)).resolves.toBeUndefined();
    const applied = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.debateai_schema_migration
       WHERE name='0038_content_encryption.sql'`
    );
    expect(applied.rows[0]?.count).toBe("1");
  });

  it("exposes only the exact run-provision capability signatures", async () => {
    const catalog = await database.pool.query<{
      prepare_v2: string | null;
      lock_v2: string | null;
      complete_v2: string | null;
      create_v2: string | null;
      obsolete_prepare: string | null;
      obsolete_create: string | null;
      runtime_prepare: boolean;
      runtime_create: boolean;
      content_prepare: boolean;
      content_create: boolean;
      runtime_insert_run: boolean;
    }>(
      `SELECT
        to_regprocedure('core.prepare_run_key_provision(uuid,uuid,uuid,uuid)')::text AS prepare_v2,
        to_regprocedure('core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)')::text AS lock_v2,
        to_regprocedure('core.complete_run_key_provision(uuid,uuid,uuid,uuid)')::text AS complete_v2,
        to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)')::text AS create_v2,
        to_regprocedure('core.prepare_run_key_provision(uuid,uuid,uuid)')::text AS obsolete_prepare,
        to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid)')::text AS obsolete_create,
        has_function_privilege('debateai_runtime',
          'core.prepare_run_key_provision(uuid,uuid,uuid,uuid)','EXECUTE') AS runtime_prepare,
        has_function_privilege('debateai_runtime',
          'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)','EXECUTE') AS runtime_create,
        has_function_privilege('debateai_content_provision',
          'core.prepare_run_key_provision(uuid,uuid,uuid,uuid)','EXECUTE') AS content_prepare,
        has_function_privilege('debateai_content_provision',
          'core.create_encrypted_run(jsonb,uuid,uuid,jsonb)','EXECUTE') AS content_create,
        has_table_privilege('debateai_runtime','core.run','INSERT') AS runtime_insert_run`
    );
    expect(catalog.rows[0]).toEqual({
      prepare_v2: "core.prepare_run_key_provision(uuid,uuid,uuid,uuid)",
      lock_v2: "core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
      complete_v2: "core.complete_run_key_provision(uuid,uuid,uuid,uuid)",
      create_v2: "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)",
      obsolete_prepare: null,
      obsolete_create: null,
      runtime_prepare: false,
      runtime_create: false,
      content_prepare: true,
      content_create: true,
      runtime_insert_run: false
    });
    const runtime = await database.pool.connect();
    try {
      await runtime.query("SET ROLE debateai_runtime");
      await expect(runtime.query("INSERT INTO core.run DEFAULT VALUES"))
        .rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query<{ execution_ref: string | null }>(
        "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
        [randomUUID(),randomUUID(),randomUUID(),randomUUID()]
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.query("RESET ROLE").catch(() => undefined);
      runtime.release();
    }
  });

  it("isolates actual runtime and content-provision LOGINs across the complete run saga", async () => {
    const suffix = randomUUID().replaceAll("-","");
    const runtimeLogin = `s10_runtime_${suffix}`;
    const contentLogin = `s10_content_${suffix}`;
    const elevatedBridge = `s10_elevated_${suffix}`;
    const password = `s10-${randomUUID()}`;
    const loginUrl = (user:string):string => {
      const url = new URL(database.connectionString);
      url.username = user;
      url.password = password;
      return url.toString();
    };
    let runtimePool: InstanceType<typeof PgPool> | undefined;
    let contentPool: InstanceType<typeof PgPool> | undefined;
    await database.pool.query(`
      CREATE ROLE ${runtimeLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      CREATE ROLE ${contentLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      CREATE ROLE ${elevatedBridge} NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS;
      GRANT debateai_runtime TO ${runtimeLogin};
      GRANT debateai_content_provision TO ${contentLogin}
    `);
    try {
      runtimePool = new PgPool({ connectionString:loginUrl(runtimeLogin),max:2 });
      contentPool = new PgPool({ connectionString:loginUrl(contentLogin),max:2 });
      configureContentEncryption(runtimePool,cipher);
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .resolves.toBeUndefined();
      await expect(assertContentProvisionDatabaseRole(contentPool,contentPool))
        .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
      await expect(assertContentProvisionDatabaseRole(contentPool,runtimePool))
        .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");

      const forgedRunId = randomUUID();
      await expect(runtimePool.query(
        "SELECT core.prepare_run_key_provision($1,$2,$3,$4)",
        [forgedRunId,userId,ownerRef,authSessionId]
      )).rejects.toMatchObject({ code:"42501" });
      expect((await database.pool.query<{ count:string }>(`
        SELECT count(*)::text AS count FROM core.run_key_provision_intent
        WHERE run_id=$1
      `,[forgedRunId])).rows[0]?.count).toBe("0");
      expect((await database.pool.query<{ count:string }>(`
        SELECT count(*)::text AS count FROM core.run WHERE run_id=$1
      `,[forgedRunId])).rows[0]?.count).toBe("0");

      // The ACL receipt is non-vacuous: the trusted provision principal first
      // stages a real, externally provisioned intent. The ordinary runtime
      // then supplies a fully shaped run whose envelope MAC is valid under a
      // secret chosen by that runtime. It must fail on authority, before any
      // DB carrier or attestation secret becomes durable.
      const chosenRunId=randomUUID();
      const staged=(await contentPool.query<{ execution_ref:string | null }>(
        "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
        [chosenRunId,userId,ownerRef,authSessionId]
      )).rows[0]?.execution_ref;
      expect(staged).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      await cipher.provisionRun(chosenRunId,{ userId,ownerRef });
      const chosenInput=serverRunInput(`S10 chosen-secret ${randomUUID()}`);
      const preparedChosen=await cipher.prepareRun(chosenRunId);
      const chosenEnvelope=preparedChosen.encrypt("core.run",chosenRunId,{
        questionLine:chosenInput.questionLine,askContract:chosenInput.askContract ?? {}
      });
      const legitimateAttestation=preparedChosen.attestEnvelope(
        "core.run",chosenRunId,"content_ciphertext",chosenEnvelope
      );
      const legitimateSecret=preparedChosen.databaseAttestationSecret();
      preparedChosen.close();
      const attackerSecret=Buffer.alloc(32,0xa7);
      const attackerRunBytes=canonicalContentEnvelopeAttestationBytes({
        runId:chosenRunId,carrier:"core.run",primaryKey:chosenRunId,
        purpose:"content_ciphertext",envelope:chosenEnvelope
      });
      const attackerRunAttestation=createHmac("sha256",attackerSecret)
        .update(attackerRunBytes).digest();
      attackerRunBytes.fill(0);
      const runPayload=(contentAttestation:Buffer,contentAttestationSecret:Buffer)=>({
        runId:chosenRunId,questionLine:CONTENT_CIPHERTEXT_SENTINEL,
        askerId:`owner:${ownerRef}`,executionRef:staged,callerScope:chosenInput.callerScope,
        asOf:chosenInput.asOf.toISOString(),askerRiskTier:chosenInput.askerRiskTier,
        riskTier:chosenInput.effectiveRiskTier,tierSource:chosenInput.tierSource,
        tierProvenanceRef:chosenInput.tierProvenanceRef,
        compositionBudgetTier:chosenInput.compositionBudgetTier,
        depthParams:chosenInput.depthParams,discoveredPanel:chosenInput.discoveredPanel,
        strangerSampleRate:chosenInput.strangerSampleRate,
        envelopeBasis:chosenInput.envelopeBasis,registerVersion:chosenInput.registerVersion,
        batteryVersion:chosenInput.batteryVersion,askContract:{ ciphertext:true,v:1 },
        contentCiphertext:chosenEnvelope,
        contentAttestation:contentAttestation.toString("base64"),
        contentAttestationSecret:contentAttestationSecret.toString("base64")
      });
      await expect(runtimePool.query(
        "SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb)",
        [JSON.stringify(runPayload(attackerRunAttestation,attackerSecret)),
          userId,ownerRef,JSON.stringify(chosenInput.batteryRows)]
      )).rejects.toMatchObject({ code:"42501" });
      expect((await database.pool.query<{
        intent_count:string;run_count:string;secret_count:string;carrier_count:string;
      }>(`SELECT
        (SELECT count(*)::text FROM core.run_key_provision_intent WHERE run_id=$1)
          AS intent_count,
        (SELECT count(*)::text FROM core.run WHERE run_id=$1) AS run_count,
        (SELECT count(*)::text FROM core.run_content_attestation_secret WHERE run_id=$1)
          AS secret_count,
        (SELECT count(*)::text FROM core.node WHERE run_id=$1) AS carrier_count`,
        [chosenRunId])).rows[0]).toEqual({
        intent_count:"1",run_count:"0",secret_count:"0",carrier_count:"0"
      });
      expect(await keys.exists(chosenRunId)).toBe(true);
      expect(await keys.ownerRef(chosenRunId)).toBe(ownerRef);

      expect((await contentPool.query<{ created:boolean }>(
        "SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
        [JSON.stringify(runPayload(legitimateAttestation,legitimateSecret)),
          userId,ownerRef,JSON.stringify(chosenInput.batteryRows)]
      )).rows[0]?.created).toBe(true);
      expect((await database.pool.query<{
        intent_count:string;run_count:string;secret_count:string;
      }>(`SELECT
        (SELECT count(*)::text FROM core.run_key_provision_intent WHERE run_id=$1)
          AS intent_count,
        (SELECT count(*)::text FROM core.run WHERE run_id=$1) AS run_count,
        (SELECT count(*)::text FROM core.run_content_attestation_secret WHERE run_id=$1)
          AS secret_count`,[chosenRunId])).rows[0]).toEqual({
        intent_count:"0",run_count:"1",secret_count:"1"
      });
      expect(await keys.exists(chosenRunId)).toBe(true);

      const forgedChildId=randomUUID();
      const attackerChildBytes=canonicalContentEnvelopeAttestationBytes({
        runId:chosenRunId,carrier:"core.node",primaryKey:forgedChildId,
        purpose:"content_ciphertext",envelope:chosenEnvelope
      });
      const attackerChildAttestation=createHmac("sha256",attackerSecret)
        .update(attackerChildBytes).digest();
      attackerChildBytes.fill(0);
      await expect(runtimePool.query(`
        INSERT INTO core.node(
          node_id,run_id,claim_text,claim_type,depth,sibling_ordinal,materialized_path,
          generation_status,path_status,exploration_decision,way_of_knowing,
          value_laden,is_folder,created_at_seq,relevant_as_of,
          content_ciphertext,content_attestation
        ) VALUES ($1,$2,$3,'unknown',0,0,'0','complete','active','continue',
          'REASONING',false,false,ledger.allocate_sequence(),clock_timestamp(),$4::jsonb,$5)
      `,[forgedChildId,chosenRunId,CONTENT_CIPHERTEXT_SENTINEL,
        JSON.stringify(chosenEnvelope),attackerChildAttestation]))
        .rejects.toMatchObject({ code:"22023" });
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.node WHERE node_id=$1",
        [forgedChildId]
      )).rows[0]?.count).toBe("0");
      attackerRunAttestation.fill(0);
      attackerChildAttestation.fill(0);
      attackerSecret.fill(0);
      legitimateAttestation.fill(0);
      legitimateSecret.fill(0);

      const runId = await new RunRepository(runtimePool,contentPool).startRun(
        serverRunInput(`S10 content principal ${randomUUID()}`)
      );
      expect((await database.pool.query<{ count:string }>(`
        SELECT count(*)::text AS count FROM core.run_progress_event WHERE run_id=$1
      `,[runId])).rows[0]?.count).toBe("3");
      const childId = randomUUID();
      const prepared = await cipher.prepareRun(runId);
      const childEnvelope = prepared.encrypt("core.node",childId,{ claimText:"tagged child" });
      const childAttestation = prepared.attestEnvelope(
        "core.node",childId,"content_ciphertext",childEnvelope
      );
      prepared.close();
      await expect(runtimePool.query(`
        INSERT INTO core.node(
          node_id,run_id,claim_text,claim_type,depth,sibling_ordinal,materialized_path,
          generation_status,path_status,exploration_decision,way_of_knowing,
          value_laden,is_folder,created_at_seq,relevant_as_of,
          content_ciphertext,content_attestation
        ) VALUES ($1,$2,$3,'unknown',0,0,'0','complete','active','continue',
          'REASONING',false,false,ledger.allocate_sequence(),clock_timestamp(),$4::jsonb,$5)
      `,[childId,runId,CONTENT_CIPHERTEXT_SENTINEL,
        JSON.stringify(childEnvelope),childAttestation])).resolves.toMatchObject({ rowCount:1 });

      await expect(contentPool.query(
        "SELECT secret FROM core.run_content_attestation_secret WHERE run_id=$1",
        [runId]
      )).rejects.toMatchObject({ code:"42501" });
      await expect(contentPool.query(`
        INSERT INTO core.node(
          run_id,claim_text,claim_type,depth,sibling_ordinal,materialized_path,
          generation_status,path_status,exploration_decision,way_of_knowing,
          value_laden,is_folder,created_at_seq,relevant_as_of
        ) VALUES ($1,'forged','unknown',0,0,'0','complete','active','continue',
          'REASONING',false,false,1,clock_timestamp())
      `,[runId])).rejects.toMatchObject({ code:"42501" });
      await expect(contentPool.query("SET ROLE debateai_runtime"))
        .rejects.toMatchObject({ code:"42501" });

      const provisionSignatures=[
        "core.prepare_run_key_provision(uuid,uuid,uuid,uuid)",
        "core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)",
        "core.complete_run_key_provision(uuid,uuid,uuid,uuid)",
        "core.create_encrypted_run(jsonb,uuid,uuid,jsonb)",
        "core.claim_run_key_provision_cleanup(integer)",
        "core.complete_run_key_provision_cleanup(uuid,uuid)"
      ] as const;
      for (const signature of provisionSignatures) {
        await database.pool.query(`GRANT EXECUTE ON FUNCTION ${signature} TO ${runtimeLogin}`);
        try {
          await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
            .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
        } finally {
          await database.pool.query(`REVOKE EXECUTE ON FUNCTION ${signature} FROM ${runtimeLogin}`);
        }
      }
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .resolves.toBeUndefined();

      // PostgreSQL adds predefined privileged roles over time. Exercise every
      // available, grantable pg_* role rather than freezing the boot boundary
      // to the server version used when this test was written. The special
      // pg_database_owner role cannot be granted; database/schema ownership is
      // attested independently above.
      const elevatedRoles=(await database.pool.query<{ rolname:string }>(`
        SELECT rolname
        FROM pg_catalog.pg_roles
        WHERE left(rolname,3)='pg_'
          AND rolname <> 'pg_database_owner'
        ORDER BY rolname
      `)).rows.map(({ rolname })=>rolname);
      expect(elevatedRoles).toEqual(expect.arrayContaining([
        "pg_execute_server_program","pg_read_server_files","pg_write_server_files",
        "pg_read_all_data","pg_write_all_data"
      ]));
      for (const elevatedRole of elevatedRoles) {
        await database.pool.query(`GRANT ${elevatedRole} TO ${contentLogin}`);
        try {
          await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
            .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
        } finally {
          await database.pool.query(`REVOKE ${elevatedRole} FROM ${contentLogin}`);
        }
      }
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .resolves.toBeUndefined();

      await database.pool.query(`
        GRANT pg_execute_server_program TO ${elevatedBridge};
        GRANT ${elevatedBridge} TO ${contentLogin}
      `);
      try {
        await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
          .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
      } finally {
        await database.pool.query(`
          REVOKE ${elevatedBridge} FROM ${contentLogin};
          REVOKE pg_execute_server_program FROM ${elevatedBridge}
        `);
      }
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .resolves.toBeUndefined();

      await database.pool.query(`GRANT SELECT ON core.run TO ${contentLogin}`);
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
      await database.pool.query(`REVOKE SELECT ON core.run FROM ${contentLogin}`);
      await database.pool.query(`GRANT debateai_runtime TO ${contentLogin}`);
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
      await database.pool.query(`REVOKE debateai_runtime FROM ${contentLogin}`);
      await database.pool.query(`ALTER ROLE ${contentLogin} SUPERUSER`);
      await expect(assertContentProvisionDatabaseRole(runtimePool,contentPool))
        .rejects.toThrow("CONTENT_PROVISION_DATABASE_ROLE_MUST_BE_ISOLATED");
      await database.pool.query(`ALTER ROLE ${contentLogin} NOSUPERUSER`);
    } finally {
      await Promise.allSettled([runtimePool?.end(),contentPool?.end()]);
      await database.pool.query(`
        REVOKE debateai_runtime FROM ${runtimeLogin};
        REVOKE debateai_content_provision FROM ${contentLogin};
        DROP ROLE IF EXISTS ${runtimeLogin};
        DROP ROLE IF EXISTS ${contentLogin};
        DROP ROLE IF EXISTS ${elevatedBridge}
      `);
    }
  },120_000);

  it("writes an encrypted run head and decrypts it at the repository boundary", async () => {
    const question = `S6 private question ${randomUUID()}`;
    const runId = await createEncryptedRun(question);
    const raw = await database.pool.query<{
      question_line: string;
      ask_contract: unknown;
      content_encryption_version: number;
      question_blind_index: Buffer | null;
      content_ciphertext: unknown;
      content_attestation: Buffer;
    }>(
      `SELECT question_line,ask_contract,content_encryption_version,
              question_blind_index,content_ciphertext,content_attestation
       FROM core.run WHERE run_id=$1`,
      [runId]
    );
    expect(raw.rows[0]).toMatchObject({
      question_line: CONTENT_CIPHERTEXT_SENTINEL,
      ask_contract: { ciphertext: true, v: 1 },
      content_encryption_version: 1
    });
    expect(raw.rows[0]!.question_blind_index).toBeNull();
    expect(raw.rows[0]!.content_attestation).toHaveLength(32);
    expect(JSON.stringify(raw.rows[0]!.content_ciphertext)).not.toContain(question);
    await expect(new RunRepository(database.pool).readFrozenHead(runId))
      .resolves.toMatchObject({ runId, questionLine: question });
  });

  it("severs the authenticated session from all three immutable execution carriers", async () => {
    const runId = await createEncryptedRun(`S10 execution ref ${randomUUID()}`);
    const run = await database.pool.query<{ session_id: string }>(
      "SELECT session_id FROM core.run WHERE run_id=$1", [runId]
    );
    const executionRef = run.rows[0]!.session_id;
    expect(executionRef).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(executionRef).not.toBe(authSessionId);
    const decision = await database.pool.query<{ routing_decision_id: string }>(
      `INSERT INTO scorecard.routing_decision(
         session_id,task_class,lane,selected_model_id,selected_model_version,
         propensity,guard_trail,policy_row_key,policy_register_version,
         policy_source_ref,at_seq
       ) VALUES ($1,'debate','SERVED','fixture-model','v1',1,'[]'::jsonb,
         'fixture-policy',1,'s10:execution-ref',ledger.allocate_sequence())
       RETURNING routing_decision_id`,
      [executionRef]
    );
    await database.pool.query(
      `INSERT INTO scorecard.session_assignment(
         session_id,task_class,model_id,model_version,provider,routing_decision_id,at_seq
       ) VALUES ($1,'debate','fixture-model','v1','fixture-provider',$2,
         ledger.allocate_sequence())`,
      [executionRef,decision.rows[0]!.routing_decision_id]
    );
    const witness = await database.pool.query<{
      carrier_count: string;
      binding_count: string;
      identity_join_count: string;
      audit_join_count: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM (
          SELECT session_id FROM core.run WHERE run_id=$1
          UNION ALL
          SELECT session_id FROM scorecard.routing_decision WHERE routing_decision_id=$2
          UNION ALL
          SELECT session_id FROM scorecard.session_assignment WHERE routing_decision_id=$2
        ) AS carrier WHERE carrier.session_id=$3) AS carrier_count,
        (SELECT count(*)::text FROM identity.run_execution_binding
          WHERE execution_ref=$3::uuid AND identity_session_id=$4 AND run_id=$1) AS binding_count,
        (SELECT count(*)::text FROM identity.session AS session
          WHERE session.session_id::text=$3) AS identity_join_count,
        (SELECT count(*)::text FROM identity.audit_event AS audit
          WHERE audit.target_id=$3 OR audit.actor_key_ref=$3) AS audit_join_count`,
      [runId,decision.rows[0]!.routing_decision_id,executionRef,authSessionId]
    );
    expect(witness.rows[0]).toEqual({
      carrier_count: "3",
      binding_count: "1",
      identity_join_count: "0",
      audit_join_count: "0"
    });
    await expect(database.pool.query(
      `INSERT INTO scorecard.routing_decision(
         session_id,task_class,lane,selected_model_id,propensity,guard_trail,
         policy_row_key,policy_register_version,policy_source_ref,at_seq
       ) VALUES ($1,'debate','SERVED','fixture-model',1,'[]'::jsonb,
         'fixture-policy',1,'s10:identity-session-mutant',ledger.allocate_sequence())`,
      [authSessionId]
    )).rejects.toThrow(/RUN_EXECUTION_REF_REQUIRED/);
  });

  it("authenticates before private-run classification and severs its tombstone from audit history", async () => {
    const privateUserId = randomUUID();
    const privateOwnerRef = randomUUID();
    const privateAuditToken = randomUUID();
    const privateSessionId = randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user"(
         user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
         phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
         adult_affirmed_at,created_at
       ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,
         'active',now(),now())`,
      [privateUserId,randomBytes(32),`s10-private-${randomUUID()}`,
        privateAuditToken,privateOwnerRef]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
         session_id,user_id,token_hash,csrf_token_hash,binding_context,
         created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
       ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
         now()+interval '2 hours',now())`,
      [privateSessionId,privateUserId,`sha256:${randomBytes(32).toString("hex")}`,
        `sha256:${randomBytes(32).toString("hex")}`]
    );
    await users.store(privateUserId,generateDek());
    const privateRunId = await new RunRepository(database.pool).startRun({
      ...serverRunInput(`S10 private erasure ${randomUUID()}`),
      principal: { kind: "server", userId: privateUserId, ownerRef: privateOwnerRef },
      sessionId: privateSessionId
    });
    const legacyRunId = await createLegacyRun(`S10 private classification ${randomUUID()}`);
    const opaque = await database.pool.query<{ outcome: string; erasure_id: string | null }>(
      "SELECT * FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)",
      [legacyRunId,privateUserId,privateOwnerRef,privateSessionId,
        `sha256:${randomBytes(32).toString("hex")}`]
    );
    expect(opaque.rows[0]).toEqual({ outcome: "NOT_FOUND", erasure_id: null });

    // The production coordinator probes resume before prepare. A foreign run
    // lock must therefore be invisible in both functions, not translated to a
    // route-visible CONTENDED/PENDING result.
    const oracleUserId = randomUUID();
    const oracleOwnerRef = randomUUID();
    const oracleSessionId = randomUUID();
    const oracleLockedGrantId = randomUUID();
    const oracleLockedGrantHash = `sha256:${randomBytes(32).toString("hex")}`;
    const absentRunId = randomUUID();
    const oracleAbsentGrantId = randomUUID();
    const oracleAbsentGrantHash = `sha256:${randomBytes(32).toString("hex")}`;
    await database.pool.query(
      `INSERT INTO identity."user"(
         user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
         phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
         adult_affirmed_at,created_at
       ) VALUES ($1,$2,'{}','{}',NULL,'oracle-password',$3,$4,$5,'active',now(),now())`,
      [oracleUserId,randomBytes(32),`s10-oracle-${randomUUID()}`,randomUUID(),oracleOwnerRef]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
         session_id,user_id,token_hash,csrf_token_hash,binding_context,
         created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
       ) VALUES ($1,$2,$3,$4,'{}',now(),now(),now()+interval '1 hour',
         now()+interval '2 hours',now())`,
      [oracleSessionId,oracleUserId,`sha256:${randomBytes(32).toString("hex")}`,
        `sha256:${randomBytes(32).toString("hex")}`]
    );
    await database.pool.query(
      `INSERT INTO identity.step_up_grant(
         step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
         target_account_id,issued_at,expires_at,consumed_at
       ) VALUES
         ($1,$2,$3,$4,'DELETE_PRIVATE_DEBATE',$5,NULL,now(),now()+interval '10 minutes',NULL),
         ($6,$7,$3,$4,'DELETE_PRIVATE_DEBATE',$8,NULL,now(),now()+interval '10 minutes',NULL)`,
      [oracleLockedGrantId,oracleLockedGrantHash,oracleSessionId,oracleUserId,privateRunId,
        oracleAbsentGrantId,oracleAbsentGrantHash,absentRunId]
    );
    const repository = new PostgresPrivateRunErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    const coordinator = new PrivateRunErasureCoordinator(repository,keys);
    const oracleAttempt = {
      runId:privateRunId,userId:oracleUserId,ownerRef:oracleOwnerRef,
      sessionId:oracleSessionId,grantTokenHash:oracleLockedGrantHash,
      source:{ ip:"192.0.2.57",userAgent:"oracle",requestId:randomUUID() }
    };
    const lockHolder = await database.pool.connect();
    try {
      await lockHolder.query("BEGIN");
      await lockHolder.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE",[privateRunId]);
      await expect(Promise.race([
        coordinator.execute(oracleAttempt),
        new Promise<never>((_resolve,reject)=>setTimeout(
          ()=>reject(new Error("FOREIGN_RUN_LOCK_ORACLE")),250
        ))
      ])).resolves.toBe("NOT_FOUND");
      await lockHolder.query("ROLLBACK");
    } finally {
      lockHolder.release();
    }
    await expect(coordinator.execute(oracleAttempt)).resolves.toBe("NOT_FOUND");
    await expect(coordinator.execute({
      ...oracleAttempt,runId:absentRunId,grantTokenHash:oracleAbsentGrantHash
    })).resolves.toBe("NOT_FOUND");
    expect((await database.pool.query<{
      consumed_count:string;binding_count:string;intent_count:string;audit_count:string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM identity.step_up_grant
          WHERE step_up_grant_id=ANY($1::uuid[]) AND consumed_at IS NOT NULL) AS consumed_count,
        (SELECT count(*)::text FROM identity.private_erasure_audit_binding
          WHERE user_id=$2) AS binding_count,
        (SELECT count(*)::text FROM serve.private_run_key_cleanup_intent
          WHERE user_id=$2) AS intent_count,
        (SELECT count(*)::text FROM identity.audit_event
          WHERE event_type='debate.private.erased') AS audit_count`,
      [[oracleLockedGrantId,oracleAbsentGrantId],oracleUserId]
    )).rows[0]).toEqual({
      consumed_count:"0",binding_count:"0",intent_count:"0",audit_count:"0"
    });

    const grantId = randomUUID();
    const grantHash = `sha256:${randomBytes(32).toString("hex")}`;
    await database.pool.query(
      `INSERT INTO identity.step_up_grant(
         step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
         target_account_id,issued_at,expires_at,consumed_at
       ) VALUES ($1,$2,$3,$4,'DELETE_PRIVATE_DEBATE',$5,NULL,now(),
         now()+interval '10 minutes',NULL)`,
      [grantId,grantHash,privateSessionId,privateUserId,privateRunId]
    );
    const prepared = await repository.prepare({
      runId: privateRunId,userId: privateUserId,ownerRef: privateOwnerRef,
      sessionId: privateSessionId,grantTokenHash: grantHash
    });
    expect(prepared.outcome).toBe("PREPARED");

    const foreignUserId = randomUUID();
    const foreignOwnerRef = randomUUID();
    const foreignSessionId = randomUUID();
    await database.pool.query(`
      INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,'{}','{}',NULL,'foreign-password',$3,$4,$5,'active',now(),now())
    `, [foreignUserId,randomBytes(32),`s10-foreign-${randomUUID()}`,randomUUID(),
      foreignOwnerRef]);
    await database.pool.query(`
      INSERT INTO identity.session(
        session_id,user_id,token_hash,csrf_token_hash,binding_context,
        created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
      ) VALUES ($2,$1,$3,$4,'{}',now(),now(),now()+interval '1 hour',
        now()+interval '2 hours',now())
    `, [foreignUserId,foreignSessionId,`sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]);
    const foreignAttempt = {
      runId: privateRunId,userId: foreignUserId,ownerRef: foreignOwnerRef,
      sessionId: foreignSessionId,
      grantTokenHash: `sha256:${randomBytes(32).toString("hex")}`,
      source: { ip: "192.0.2.56",userAgent: "foreign",requestId: randomUUID() }
    };
    await expect(coordinator.execute(foreignAttempt)).resolves.toBe("NOT_FOUND");
    await expect(keys.exists(privateRunId)).resolves.toBe(true);
    await expect(coordinator.execute({
      runId: privateRunId,
      userId: privateUserId,
      ownerRef: privateOwnerRef,
      sessionId: privateSessionId,
      grantTokenHash: grantHash,
      source: { ip: "192.0.2.55", userAgent: "S10 fixture", requestId: privateUserId }
    })).resolves.toBe("CLEANED");
    await expect(keys.exists(privateRunId)).resolves.toBe(false);
    const privateAuditCount = async (): Promise<string> => (await database.pool.query<{
      count: string;
    }>("SELECT count(*)::text AS count FROM identity.audit_event WHERE event_type='debate.private.erased'"))
      .rows[0]!.count;
    const beforeForeignCleaned = await privateAuditCount();
    await expect(coordinator.execute(foreignAttempt)).resolves.toBe("NOT_FOUND");
    expect(await privateAuditCount()).toBe(beforeForeignCleaned);
    await expect(repository.resume({
      runId: privateRunId,userId: privateUserId,ownerRef: privateOwnerRef,
      sessionId: privateSessionId,grantTokenHash: grantHash
    })).resolves.toEqual({ erasureId: null,outcome: "NOT_FOUND" });
    expect((await database.pool.query(
      "SELECT 1 FROM serve.private_run_erasure_tombstone WHERE run_id=$1", [privateRunId]
    )).rowCount).toBe(1);
    const beforeDelete = await database.pool.query<{
      pending_count: string;
      tombstone_count: string;
      binding_count: string;
      audit_count: string;
      bad_ref_count: string;
      source_context: unknown;
    }>(
      `SELECT
        (SELECT count(*)::text FROM serve.private_run_key_cleanup_intent
          WHERE run_id=$1) AS pending_count,
        (SELECT count(*)::text FROM serve.private_run_erasure_tombstone
          WHERE run_id=$1) AS tombstone_count,
        (SELECT count(*)::text FROM identity.private_erasure_audit_binding
          WHERE run_id=$1 AND user_id=$2 AND consumed_at IS NOT NULL) AS binding_count,
        (SELECT count(*)::text FROM identity.audit_event AS audit
          JOIN identity.private_erasure_audit_binding AS binding
            ON binding.audit_id=audit.audit_id
           AND binding.audit_actor_ref::text=audit.actor_key_ref
           AND binding.audit_target_ref::text=audit.target_id
          WHERE binding.run_id=$1 AND audit.event_type='debate.private.erased') AS audit_count,
        (SELECT count(*)::text FROM identity.private_erasure_audit_binding AS binding
          WHERE binding.run_id=$1 AND (
            binding.request_ref=ANY(ARRAY[$1,$2,$3,$4,$5]::uuid[])
            OR binding.audit_id=ANY(ARRAY[$1,$2,$3,$4,$5]::uuid[])
            OR binding.audit_actor_ref=ANY(ARRAY[$1,$2,$3,$4,$5]::uuid[])
            OR binding.audit_target_ref=ANY(ARRAY[$1,$2,$3,$4,$5]::uuid[])
          )) AS bad_ref_count,
        (SELECT audit.source_context FROM identity.audit_event AS audit
          JOIN identity.private_erasure_audit_binding AS binding
            ON binding.audit_id=audit.audit_id WHERE binding.run_id=$1) AS source_context`,
      [privateRunId,privateUserId,privateOwnerRef,privateSessionId,privateAuditToken]
    );
    expect(beforeDelete.rows[0]).toEqual({
      pending_count: "0",tombstone_count: "1",binding_count: "1",audit_count: "1",
      bad_ref_count: "0",source_context: { schema: "s10-private-erasure-v1" }
    });
    await database.pool.query(`DELETE FROM identity."user" WHERE user_id=$1`, [privateUserId]);
    const severed = await database.pool.query<{
      binding_count: string;
      join_attack_count: string;
      audit_count: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM identity.private_erasure_audit_binding
          WHERE run_id=$1) AS binding_count,
        (SELECT count(*)::text
         FROM core.run AS run
         JOIN serve.private_run_erasure_tombstone AS tombstone USING (run_id)
         JOIN identity.private_erasure_audit_binding AS binding USING (run_id)
         JOIN identity.audit_event AS audit
           ON audit.audit_id=binding.audit_id
           OR audit.actor_key_ref=binding.audit_actor_ref::text
           OR audit.target_id=binding.audit_target_ref::text
         WHERE run.run_id=$1) AS join_attack_count,
        (SELECT count(*)::text FROM identity.audit_event
          WHERE event_type='debate.private.erased') AS audit_count`,
      [privateRunId]
    );
    expect(severed.rows[0]).toEqual({
      binding_count: "0",join_attack_count: "0",audit_count: "1"
    });
  });

  it("blocks account PREPARE on a crash-after-key-publish intent until durable cleanup readback", async () => {
    const crashedUserId = randomUUID();
    const crashedOwnerRef = randomUUID();
    const crashedSessionId = randomUUID();
    const orphanRunId = randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [crashedUserId,randomBytes(32),`s10-crash-${randomUUID()}`,randomUUID(),crashedOwnerRef]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
         session_id,user_id,token_hash,csrf_token_hash,binding_context,
         created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
       ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
         now()+interval '2 hours',now())`,
      [crashedSessionId,crashedUserId,`sha256:${randomBytes(32).toString("hex")}`,
        `sha256:${randomBytes(32).toString("hex")}`]
    );
    await users.store(crashedUserId, generateDek());
    expect((await database.pool.query<{ execution_ref: string | null }>(
      "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
      [orphanRunId,crashedUserId,crashedOwnerRef,crashedSessionId]
    )).rows[0]?.execution_ref).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    await cipher.provisionRun(orphanRunId, { userId: crashedUserId, ownerRef: crashedOwnerRef });

    const erasureId = randomUUID();
    await database.pool.query(
      `INSERT INTO identity.account_erasure_request(
        erasure_id,user_id,requested_at,execute_at
      ) VALUES ($1,$2,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')`,
      [erasureId,crashedUserId]
    );
    const blocked = await database.pool.query<{ outcome: string }>(
      `SELECT identity.prepare_account_erasure(
        $1,ARRAY[]::uuid[],ARRAY[]::uuid[],ARRAY[]::uuid[]
      ) AS outcome`,
      [erasureId]
    );
    expect(blocked.rows[0]?.outcome).toBe("CONTENDED");
    expect(await keys.exists(orphanRunId)).toBe(true);
    // The process is declared crashed only after its bounded creation lease
    // expires; reconciliation must never steal a live second transaction.
    await database.pool.query(
      `UPDATE core.run_key_provision_intent
       SET requested_at=clock_timestamp()-interval '2 seconds',
           expires_at=clock_timestamp()-interval '1 second'
       WHERE run_id=$1`,
      [orphanRunId]
    );

    const erasureRepository = new PostgresAccountErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    const firstClaim = await erasureRepository.claimRunKeyProvisionCleanup();
    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]).toMatchObject({
      runId: orphanRunId,userId: crashedUserId,ownerRef: crashedOwnerRef
    });
    expect((await database.pool.query<{ locked: boolean }>(
      `SELECT core.lock_run_key_provision_for_commit($1,$2,$3,$4) AS locked`,
      [orphanRunId,crashedUserId,crashedOwnerRef,
        (await database.pool.query<{ execution_ref: string }>(
          "SELECT execution_ref FROM core.run_key_provision_intent WHERE run_id=$1",
          [orphanRunId]
        )).rows[0]!.execution_ref]
    )).rows[0]?.locked).toBe(false);
    expect(await keys.exists(orphanRunId)).toBe(true);
    // Crash after the committed claim but before destroy: a later reconciler
    // may reclaim the lease, while the stale claim token can never complete it.
    await database.pool.query(
      `UPDATE core.run_key_provision_intent
       SET requested_at=clock_timestamp()-interval '7 minutes',
           expires_at=clock_timestamp()-interval '6 minutes 30 seconds',
           cleanup_claimed_at=clock_timestamp()-interval '6 minutes'
       WHERE run_id=$1`,
      [orphanRunId]
    );
    const reconciler = new AccountErasureCoordinator(
      erasureRepository,
      users,
      keys
    );
    expect(await reconciler.reconcileRunKeyProvisionIntents()).toContainEqual({
      runId: orphanRunId,
      outcome: "CLEANED"
    });
    expect(await erasureRepository.completeRunKeyProvisionCleanup(
      orphanRunId,firstClaim[0]!.claimToken
    )).toBe(false);
    expect(await keys.exists(orphanRunId)).toBe(false);
    expect((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_key_provision_intent WHERE run_id=$1",
      [orphanRunId]
    )).rows[0]?.count).toBe("0");
    const prepared = await database.pool.query<{ outcome: string }>(
      `SELECT identity.prepare_account_erasure(
        $1,ARRAY[]::uuid[],ARRAY[]::uuid[],ARRAY[]::uuid[]
      ) AS outcome`,
      [erasureId]
    );
    expect(prepared.rows[0]?.outcome).toBe("PREPARED");
    await expect(reconciler.execute(erasureId,{
      ip: "192.0.2.99",
      userAgent: `s10 ${crashedUserId}`,
      requestId: crashedUserId
    })).resolves.toBe("CLEANED");
    expect((await database.pool.query<{
      destroyed_run_key_count: number;
      already_absent_run_key_count: number;
      destroyed_user_dek_count: number;
      already_absent_user_dek_count: number;
      source_context: unknown;
    }>(`
      SELECT request.destroyed_run_key_count,request.already_absent_run_key_count,
        request.destroyed_user_dek_count,request.already_absent_user_dek_count,
        audit.source_context
      FROM identity.account_erasure_request AS request
      JOIN identity.audit_event AS audit
        ON audit.target_id=request.erasure_id::text
       AND audit.event_type='identity.account.erased'
      WHERE request.erasure_id=$1
    `,[erasureId])).rows[0]).toEqual({
      destroyed_run_key_count: 0,
      already_absent_run_key_count: 0,
      destroyed_user_dek_count: 1,
      already_absent_user_dek_count: 0,
      source_context: { schema: "s10-account-erasure-v1" }
    });
    expect(JSON.stringify((await database.pool.query(
      `SELECT audit.* FROM identity.audit_event AS audit
       WHERE audit.event_type='identity.account.erased' AND audit.target_id=$1`,
      [erasureId]
    )).rows)).not.toContain(crashedUserId);
  });

  it("makes DELETE_ACCOUNT scheduling idempotent across an ambiguous COMMIT and auth-binds readback/cancel", async () => {
    const dstClient = await database.pool.connect();
    try {
      await dstClient.query("BEGIN");
      await dstClient.query("SET LOCAL TIME ZONE 'Europe/Bucharest'");
      const dst = await dstClient.query<{
        spring_elapsed_seconds: string;
        fall_elapsed_seconds: string;
        spring_calendar_seconds: string;
        fall_calendar_seconds: string;
        spring_one_hour_early_is_due: boolean;
        fall_one_hour_early_is_due: boolean;
        function_uses_elapsed_grace: boolean;
      }>(`
        WITH boundaries AS (
          SELECT
            '2027-03-27 12:00 Europe/Bucharest'::timestamptz AS spring_start,
            '2027-10-30 12:00 Europe/Bucharest'::timestamptz AS fall_start
        )
        SELECT
          extract(epoch FROM ((spring_start+interval '604800 seconds')-spring_start))::bigint::text
            AS spring_elapsed_seconds,
          extract(epoch FROM ((fall_start+interval '604800 seconds')-fall_start))::bigint::text
            AS fall_elapsed_seconds,
          extract(epoch FROM ((spring_start+interval '7 days')-spring_start))::bigint::text
            AS spring_calendar_seconds,
          extract(epoch FROM ((fall_start+interval '7 days')-fall_start))::bigint::text
            AS fall_calendar_seconds,
          spring_start+interval '603000 seconds'>=spring_start+interval '604800 seconds'
            AS spring_one_hour_early_is_due,
          fall_start+interval '603000 seconds'>=fall_start+interval '604800 seconds'
            AS fall_one_hour_early_is_due,
          pg_get_functiondef(
            'identity.schedule_account_erasure(uuid,uuid,uuid,text)'::regprocedure
          ) LIKE '%interval ''604800 seconds''%'
            AS function_uses_elapsed_grace
        FROM boundaries
      `);
      expect(dst.rows[0]).toEqual({
        spring_elapsed_seconds:"604800",fall_elapsed_seconds:"604800",
        spring_calendar_seconds:"601200",fall_calendar_seconds:"608400",
        spring_one_hour_early_is_due:false,fall_one_hour_early_is_due:false,
        function_uses_elapsed_grace:true
      });
      await dstClient.query("ROLLBACK");
    } finally {
      dstClient.release();
    }
    const scheduledUserId = randomUUID();
    const scheduledOwnerRef = randomUUID();
    const schedulingSessionId = randomUUID();
    const siblingSessionId = randomUUID();
    const grantId = randomUUID();
    const grantTokenHash = `sha256:${randomBytes(32).toString("hex")}`;
    await database.pool.query(
      `INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [scheduledUserId,randomBytes(32),`s10-schedule-${randomUUID()}`,
        randomUUID(),scheduledOwnerRef]
    );
    for (const sessionId of [schedulingSessionId,siblingSessionId]) {
      await database.pool.query(
        `INSERT INTO identity.session(
          session_id,user_id,token_hash,csrf_token_hash,binding_context,
          created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
        ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
          now()+interval '2 hours',now())`,
        [sessionId,scheduledUserId,`sha256:${randomBytes(32).toString("hex")}`,
          `sha256:${randomBytes(32).toString("hex")}`]
      );
    }
    await database.pool.query(
      `INSERT INTO identity.channel_binding(
        channel_binding_id,user_id,channel_type,address_ciphertext,state,
        created_at,verified_at
      ) VALUES ($1,$2,'email','{}'::jsonb,'verified',clock_timestamp(),clock_timestamp())`,
      [randomUUID(),scheduledUserId]
    );
    await database.pool.query(
      `INSERT INTO identity.step_up_grant(
        step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
        target_account_id,issued_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,
        clock_timestamp()-interval '1 second',clock_timestamp()+interval '10 minutes',NULL)`,
      [grantId,grantTokenHash,schedulingSessionId,scheduledUserId]
    );

    const roleClient = await database.pool.connect();
    let erasureId: string;
    try {
      await roleClient.query("BEGIN");
      await roleClient.query("SET LOCAL ROLE debateai_erasure_runtime");
      const first = await roleClient.query<{
        erasure_id:string|null;status:string;execute_at:Date;cancellation_ref:string;
      }>(
        `SELECT * FROM identity.schedule_account_erasure($1,$2,$3,$4)`,
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId,grantTokenHash]
      );
      erasureId = first.rows[0]!.erasure_id!;
      expect(erasureId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(first.rows[0]).toEqual({
        erasure_id:erasureId,status:"SCHEDULED",execute_at:expect.any(Date),
        cancellation_ref:expect.stringMatching(/^[0-9a-f-]{36}$/)
      });
      await roleClient.query("COMMIT");

      // Model a lost response after COMMIT: discard the first result and retry
      // the same one-use grant. No caller deadline exists to replace the
      // DB-owned exact seven-day schedule.
      await roleClient.query("BEGIN");
      await roleClient.query("SET LOCAL ROLE debateai_erasure_runtime");
      const retry = await roleClient.query<{
        erasure_id:string|null;status:string;execute_at:Date;cancellation_ref:string;
      }>(
        `SELECT * FROM identity.schedule_account_erasure($1,$2,$3,$4)`,
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId,grantTokenHash]
      );
      expect(retry.rows[0]?.erasure_id).toBe(erasureId);
      expect(retry.rows[0]?.cancellation_ref).toBe(first.rows[0]!.cancellation_ref);
      const current = await roleClient.query<{
        erasure_id: string;
        status: string;
      }>("SELECT * FROM identity.current_account_erasure($1,$2,$3)", [
        scheduledUserId,scheduledOwnerRef,schedulingSessionId
      ]);
      expect(current.rows).toEqual([{ erasure_id: erasureId,status: "SCHEDULED",
        execute_at: expect.any(Date),cancellation_ref:first.rows[0]!.cancellation_ref }]);
      expect((await roleClient.query(
        "SELECT * FROM identity.current_account_erasure($1,$2,$3)",
        [scheduledUserId,scheduledOwnerRef,siblingSessionId]
      )).rows).toEqual([]);
      expect((await roleClient.query<{ cancelled: boolean }>(
        "SELECT identity.cancel_current_account_erasure($1,$2,$3,$4) AS cancelled",
        [scheduledUserId,scheduledOwnerRef,siblingSessionId,
          first.rows[0]!.cancellation_ref]
      )).rows[0]?.cancelled).toBe(false);
      expect((await roleClient.query<{ cancelled: boolean }>(
        "SELECT identity.cancel_current_account_erasure($1,$2,$3,$4) AS cancelled",
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId,
          first.rows[0]!.cancellation_ref]
      )).rows[0]?.cancelled).toBe(true);
      expect((await roleClient.query(
        "SELECT * FROM identity.current_account_erasure($1,$2,$3)",
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId]
      )).rows).toEqual([]);
      await roleClient.query("COMMIT");

      // A delayed replay of generation A must remain bound to A after the
      // same scheduling session has created generation B.
      const secondGrantId=randomUUID();
      const secondGrantTokenHash=`sha256:${randomBytes(32).toString("hex")}`;
      await database.pool.query(
        `INSERT INTO identity.step_up_grant(
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
          target_account_id,issued_at,expires_at,consumed_at
        ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,
          clock_timestamp()-interval '1 second',clock_timestamp()+interval '10 minutes',NULL)`,
        [secondGrantId,secondGrantTokenHash,schedulingSessionId,scheduledUserId]
      );
      await roleClient.query("BEGIN");
      await roleClient.query("SET LOCAL ROLE debateai_erasure_runtime");
      const second=await roleClient.query<{
        erasure_id:string; cancellation_ref:string;
      }>("SELECT * FROM identity.schedule_account_erasure($1,$2,$3,$4)",[
        scheduledUserId,scheduledOwnerRef,schedulingSessionId,secondGrantTokenHash
      ]);
      expect((await roleClient.query<{ cancelled:boolean }>(
        "SELECT identity.cancel_current_account_erasure($1,$2,$3,$4) AS cancelled",
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId,first.rows[0]!.cancellation_ref]
      )).rows[0]?.cancelled).toBe(true);
      expect((await roleClient.query<{ erasure_id:string }>(
        "SELECT * FROM identity.current_account_erasure($1,$2,$3)",
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId]
      )).rows[0]?.erasure_id).toBe(second.rows[0]!.erasure_id);
      expect((await roleClient.query<{ cancelled:boolean }>(
        "SELECT identity.cancel_current_account_erasure($1,$2,$3,$4) AS cancelled",
        [scheduledUserId,scheduledOwnerRef,schedulingSessionId,second.rows[0]!.cancellation_ref]
      )).rows[0]?.cancelled).toBe(true);
      await roleClient.query("COMMIT");
    } finally {
      roleClient.release();
    }

    const receipt = await database.pool.query<{
      request_count: string;
      schedule_session_id: string;
      schedule_grant_id: string;
      grace_seconds: string;
      cancelled: boolean;
      grant_consumed: boolean;
      erasure_execute: boolean;
      runtime_execute: boolean;
      public_execute: boolean;
    }>(`
      SELECT count(*)::text AS request_count,
        min(request.schedule_session_id::text) AS schedule_session_id,
        min(request.schedule_grant_id::text) AS schedule_grant_id,
        min(extract(epoch FROM request.execute_at-request.requested_at)::bigint)::text
          AS grace_seconds,
        bool_and(request.cancelled_at IS NOT NULL) AS cancelled,
        bool_and(step_grant.consumed_at IS NOT NULL) AS grant_consumed,
        has_function_privilege('debateai_erasure_runtime',
          'identity.current_account_erasure(uuid,uuid,uuid)','EXECUTE') AS erasure_execute,
        has_function_privilege('debateai_runtime',
          'identity.current_account_erasure(uuid,uuid,uuid)','EXECUTE') AS runtime_execute,
        has_function_privilege('public',
          'identity.current_account_erasure(uuid,uuid,uuid)','EXECUTE') AS public_execute
      FROM identity.account_erasure_request AS request
      JOIN identity.step_up_grant AS step_grant
        ON step_grant.step_up_grant_id=request.schedule_grant_id
      WHERE request.erasure_id=$1
      GROUP BY erasure_execute,runtime_execute,public_execute
    `,[erasureId]);
    expect(receipt.rows[0]).toEqual({
      request_count: "1",schedule_session_id: schedulingSessionId,
      schedule_grant_id: grantId,grace_seconds: "604800",
      cancelled: true,grant_consumed: true,
      erasure_execute: true,runtime_execute: false,public_execute: false
    });
    const repository = new PostgresAccountErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    expect(await repository.current({
      userId: scheduledUserId,ownerRef: scheduledOwnerRef,sessionId: schedulingSessionId
    })).toBeNull();
    expect(await new AccountErasureCoordinator(repository,users,keys).execute(erasureId,{
      ip: "192.0.2.44",userAgent: "s10-schedule-test",requestId: randomUUID()
    })).toBe("NOT_FOUND");
    expect(await repository.status(erasureId)).toBe("CANCELLED");
    expect((await database.pool.query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=$1) AS present`,
      [scheduledUserId]
    )).rows[0]?.present).toBe(true);
  });

  it("refuses account scheduling without a live supported notification channel",async ()=>{
    for (const mode of ["ZERO_CHANNELS","ALL_REVOKED"] as const) {
      const candidateUserId=randomUUID();
      const candidateOwnerRef=randomUUID();
      const candidateSessionId=randomUUID();
      const candidateGrantId=randomUUID();
      const candidateGrantHash=`sha256:${randomBytes(32).toString("hex")}`;
      const candidateAuditToken=randomUUID();
      await database.pool.query(
        `INSERT INTO identity."user"(
          user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
          phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
          adult_affirmed_at,created_at
        ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',
          $3,$4,$5,'active',clock_timestamp(),clock_timestamp())`,
        [candidateUserId,randomBytes(32),`s10-no-channel-${randomUUID()}`,
          candidateAuditToken,candidateOwnerRef]
      );
      await database.pool.query(
        `INSERT INTO identity.session(
          session_id,user_id,token_hash,csrf_token_hash,binding_context,
          created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
        ) VALUES ($1,$2,$3,$4,'{}'::jsonb,clock_timestamp(),clock_timestamp(),
          clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
          clock_timestamp())`,
        [candidateSessionId,candidateUserId,
          `sha256:${randomBytes(32).toString("hex")}`,
          `sha256:${randomBytes(32).toString("hex")}`]
      );
      if (mode==="ALL_REVOKED") {
        await database.pool.query(
          `INSERT INTO identity.channel_binding(
            channel_binding_id,user_id,channel_type,address_ciphertext,state,
            created_at,revoked_at
          ) VALUES ($1,$2,'email','{}'::jsonb,'revoked',
            clock_timestamp()-interval '1 second',clock_timestamp())`,
          [randomUUID(),candidateUserId]
        );
      }
      await database.pool.query(
        `INSERT INTO identity.step_up_grant(
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
          target_account_id,issued_at,expires_at
        ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,clock_timestamp(),
          clock_timestamp()+interval '10 minutes')`,
        [candidateGrantId,candidateGrantHash,candidateSessionId,candidateUserId]
      );
      const client=await database.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE debateai_erasure_runtime");
        await expect(client.query(
          "SELECT identity.schedule_account_erasure($1,$2,$3,$4)",
          [candidateUserId,candidateOwnerRef,candidateSessionId,candidateGrantHash]
        )).rejects.toMatchObject({
          code:"55000",message:"ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED"
        });
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
      expect((await database.pool.query<{
        requests:string;outbox:string;consumed:boolean;audits:string;
      }>(`SELECT
        (SELECT count(*)::text FROM identity.account_erasure_request
          WHERE user_id=$1) AS requests,
        (SELECT count(*)::text FROM identity.account_erasure_notification_outbox
          WHERE user_id=$1) AS outbox,
        (SELECT consumed_at IS NOT NULL FROM identity.step_up_grant
          WHERE step_up_grant_id=$2) AS consumed,
        (SELECT count(*)::text FROM identity.audit_event
          WHERE actor_key_ref=$3::text) AS audits`,
        [candidateUserId,candidateGrantId,candidateAuditToken]
      )).rows[0]).toEqual({ requests:"0",outbox:"0",consumed:false,audits:"0" });
    }
  });

  it("backs off a saturated due-work page so poisoned rows cannot starve later requests",async ()=>{
    const requestIds=Array.from({ length:101 },()=>randomUUID());
    const laterRequestId=randomUUID();
    await database.pool.query(
      `INSERT INTO identity.account_erasure_request(
        erasure_id,user_id,requested_at,execute_at,cancelled_at,prepared_at,
        prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,
        committed_at,key_cleanup_completed_at,reconcile_available_at
      )
      SELECT request_id,NULL,clock_timestamp()-interval '9 days',
        clock_timestamp()-interval '2 days',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
        clock_timestamp()-interval '1 second'
      FROM unnest($1::uuid[]) AS candidate(request_id)`,[requestIds]
    );
    try {
      const repository=new PostgresAccountErasureRepository(
        database.pool,{} as AuditContextHasher
      );
      const first=await repository.pendingWork(100);
      const second=await repository.pendingWork(100);
      const third=await repository.pendingWork(100);
      expect(first).toHaveLength(100);
      expect(second).toHaveLength(1);
      expect(third).toEqual([]);
      expect(new Set([...first,...second])).toEqual(new Set(requestIds));
      expect((await database.pool.query<{ count:string }>(`
        SELECT count(*)::text AS count
        FROM identity.account_erasure_request
        WHERE erasure_id=ANY($1::uuid[]) AND reconcile_attempt_count=1
      `,[requestIds])).rows[0]?.count).toBe("101");
      await database.pool.query(
        `UPDATE identity.account_erasure_request
         SET reconcile_available_at=clock_timestamp()-interval '1 second'
         WHERE erasure_id=ANY($1::uuid[])`,[requestIds]
      );
      await database.pool.query(
        `INSERT INTO identity.account_erasure_request(
           erasure_id,user_id,requested_at,execute_at,cancelled_at,prepared_at,
           prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,
           committed_at,key_cleanup_completed_at,reconcile_available_at
         ) VALUES ($1,NULL,clock_timestamp()-interval '8 days',
           clock_timestamp()-interval '1 day',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
           clock_timestamp()-interval '1 second')`,[laterRequestId]
      );
      expect(await repository.pendingWork(1)).toEqual([laterRequestId]);
    } finally {
      await database.pool.query(
        `DELETE FROM identity.account_erasure_request
         WHERE erasure_id=ANY($1::uuid[]) OR erasure_id=$2`,
        [requestIds,laterRequestId]
      );
    }
  });

  it("boots an isolated actual erasure LOGIN with only the exact cleanup capabilities", async () => {
    const suffix=randomUUID().replaceAll("-","");
    const runtimeLogin=`s10_erasure_runtime_control_${suffix}`;
    const erasureLogin=`s10_erasure_worker_${suffix}`;
    const password=`s10-erasure-${randomUUID()}`;
    const loginUrl=(user:string):string=>{
      const url=new URL(database.connectionString);
      url.username=user;
      url.password=password;
      return url.toString();
    };
    let runtimePool:InstanceType<typeof PgPool>|undefined;
    let erasurePool:InstanceType<typeof PgPool>|undefined;
    let directCapabilityPool:InstanceType<typeof PgPool>|undefined;
    await database.pool.query(`
      CREATE ROLE ${runtimeLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      CREATE ROLE ${erasureLogin} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
        NOREPLICATION NOBYPASSRLS PASSWORD '${password}';
      GRANT debateai_runtime TO ${runtimeLogin};
      GRANT debateai_erasure_runtime TO ${erasureLogin}
    `);
    try {
      runtimePool=new PgPool({ connectionString:loginUrl(runtimeLogin),max:1 });
      erasurePool=new PgPool({ connectionString:loginUrl(erasureLogin),max:1 });
      await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool))
        .resolves.toBeUndefined();
      expect((await database.pool.query<{
        rolcanlogin:boolean;rolinherit:boolean;
      }>(`
        SELECT rolcanlogin,rolinherit FROM pg_catalog.pg_roles
        WHERE rolname='debateai_erasure_runtime'
      `)).rows[0]).toEqual({ rolcanlogin:false,rolinherit:false });
      await expect(assertAccountErasureDatabaseRole(erasurePool,erasurePool))
        .rejects.toThrow("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
      await expect(assertAccountErasureDatabaseRole(erasurePool,runtimePool))
        .rejects.toThrow("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");

      expect((await erasurePool.query(
        "SELECT * FROM identity.pending_account_key_cleanup(1)"
      )).rows).toEqual([]);
      expect((await erasurePool.query(
        "SELECT * FROM identity.claim_account_erasure_notifications(0)"
      )).rows).toEqual([]);
      expect((await erasurePool.query<{ acknowledged:boolean }>(
        "SELECT identity.ack_account_erasure_notification($1,$2) AS acknowledged",
        [randomUUID(),randomUUID()]
      )).rows[0]?.acknowledged).toBe(false);
      expect((await erasurePool.query<{ failed:boolean }>(
        "SELECT identity.fail_account_erasure_notification($1,$2,'WORKER_CRASH') AS failed",
        [randomUUID(),randomUUID()]
      )).rows[0]?.failed).toBe(false);
      const deniedNotificationCalls:readonly Readonly<{
        statement:string;parameters:readonly string[];
      }>[]=[
        { statement:"SELECT * FROM identity.claim_account_erasure_notifications(0)",
          parameters:[] },
        { statement:"SELECT identity.ack_account_erasure_notification($1,$2)",
          parameters:[randomUUID(),randomUUID()] },
        { statement:"SELECT identity.fail_account_erasure_notification($1,$2,'FORGED')",
          parameters:[randomUUID(),randomUUID()] }
      ];
      for (const { statement,parameters } of deniedNotificationCalls) {
        await expect(runtimePool.query(statement,[...parameters]))
          .rejects.toMatchObject({ code:"42501" });
      }
      await expect(erasurePool.query(
        'SELECT user_id FROM identity."user" LIMIT 1'
      )).rejects.toMatchObject({ code:"42501" });
      await expect(erasurePool.query(
        `UPDATE identity.account_erasure_request SET execute_at=clock_timestamp()
         WHERE false`
      )).rejects.toMatchObject({ code:"42501" });
      await expect(erasurePool.query("SET ROLE debateai_runtime"))
        .rejects.toMatchObject({ code:"42501" });

      await database.pool.query(`GRANT SELECT ON identity."user" TO ${erasureLogin}`);
      await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool))
        .rejects.toThrow("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
      await database.pool.query(`REVOKE SELECT ON identity."user" FROM ${erasureLogin}`);
      await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool))
        .resolves.toBeUndefined();

      await database.pool.query(
        `GRANT EXECUTE ON FUNCTION identity.account_erasure_audit_seed(uuid)
         TO ${runtimeLogin}`
      );
      await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool))
        .rejects.toThrow("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
      await database.pool.query(
        `REVOKE EXECUTE ON FUNCTION identity.account_erasure_audit_seed(uuid)
         FROM ${runtimeLogin}`
      );
      await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool))
        .resolves.toBeUndefined();

      await database.pool.query(
        `ALTER ROLE debateai_erasure_runtime LOGIN PASSWORD '${password}'`
      );
      try {
        directCapabilityPool=new PgPool({
          connectionString:loginUrl("debateai_erasure_runtime"),max:1
        });
        expect((await directCapabilityPool.query<{ principal:string }>(
          "SELECT current_user AS principal"
        )).rows[0]?.principal).toBe("debateai_erasure_runtime");
        await expect(assertAccountErasureDatabaseRole(runtimePool,directCapabilityPool))
          .rejects.toThrow("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
      } finally {
        await directCapabilityPool?.end();
        directCapabilityPool=undefined;
        await database.pool.query(
          "ALTER ROLE debateai_erasure_runtime NOLOGIN PASSWORD NULL"
        );
      }
      await expect(assertAccountErasureDatabaseRole(runtimePool,erasurePool))
        .resolves.toBeUndefined();
    } finally {
      await Promise.allSettled([
        runtimePool?.end(),erasurePool?.end(),directCapabilityPool?.end()
      ]);
      await database.pool.query(`
        REVOKE debateai_runtime FROM ${runtimeLogin};
        REVOKE debateai_erasure_runtime FROM ${erasureLogin};
        DROP ROLE IF EXISTS ${runtimeLogin};
        DROP ROLE IF EXISTS ${erasureLogin}
      `);
    }
  },120_000);

  it("delivers both encrypted channel notifications before key shred and cascades the outbox", async () => {
    const notificationUserId=randomUUID();
    const notificationOwnerRef=randomUUID();
    const notificationSessionId=randomUUID();
    const notificationSessionTokenHash=`sha256:${randomBytes(32).toString("hex")}`;
    const notificationBindingHash=`sha256:${randomBytes(32).toString("hex")}`;
    const primary=`s10-notify-${randomUUID()}@example.test`;
    const recovery=`s10-notify-recovery-${randomUUID()}@example.test`;
    const notificationDek=generateDek();
    const keyId=`user-dek:${notificationUserId}`;
    const envelope=(field:"user.email_ciphertext"|"user.recovery_email_ciphertext",value:string)=>
      encrypt(notificationDek,Buffer.from(value,"utf8"),[
        "identity",field,notificationUserId,"run:none",notificationUserId,keyId,"1"
      ]);
    const primaryEnvelope=envelope("user.email_ciphertext",primary);
    const recoveryEnvelope=envelope("user.recovery_email_ciphertext",recovery);
    await users.store(notificationUserId,notificationDek);
    notificationDek.fill(0);
    await database.pool.query(
      `INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,'test-password-hash',$5,$6,$7,
        'active',clock_timestamp(),clock_timestamp())`,
      [notificationUserId,randomBytes(32),JSON.stringify(primaryEnvelope),
        JSON.stringify(recoveryEnvelope),`s10-notify-${randomUUID()}`,
        randomUUID(),notificationOwnerRef]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
        session_id,user_id,token_hash,csrf_token_hash,binding_context,
        created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
        clock_timestamp())`,
      [notificationSessionId,notificationUserId,notificationSessionTokenHash,
        `sha256:${randomBytes(32).toString("hex")}`,
        JSON.stringify({ user_agent_hash:notificationBindingHash })]
    );
    const channelIds=[randomUUID(),randomUUID()];
    await database.pool.query(
      `INSERT INTO identity.channel_binding(
        channel_binding_id,user_id,channel_type,address_ciphertext,state,
        created_at,verified_at
      ) VALUES
        ($1,$3,'email',$4::jsonb,'verified',clock_timestamp(),clock_timestamp()),
        ($2,$3,'recovery_email',$5::jsonb,'verified',clock_timestamp(),clock_timestamp())`,
      [channelIds[0],channelIds[1],notificationUserId,
        JSON.stringify(primaryEnvelope),JSON.stringify(recoveryEnvelope)]
    );
    const repository=new PostgresAccountErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    const makeGrant=async ():Promise<string>=>{
      const token=`sha256:${randomBytes(32).toString("hex")}`;
      await database.pool.query(
        `INSERT INTO identity.step_up_grant(
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
          target_account_id,issued_at,expires_at,consumed_at
        ) VALUES ($1,$2,$3,$4,'DELETE_ACCOUNT',NULL,$4,clock_timestamp(),
          clock_timestamp()+interval '10 minutes',NULL)`,
        [randomUUID(),token,notificationSessionId,notificationUserId]
      );
      return token;
    };
    const sent:SecurityNotificationMail[]=[];
    let failPrimaryOnce=true;
    let holdNextAcknowledgement=false;
    let reportAcknowledgementCommitted!:()=>void;
    let releaseAcknowledgementResponse!:()=>void;
    const acknowledgementCommitted=new Promise<void>((resolve)=>{
      reportAcknowledgementCommitted=resolve;
    });
    const acknowledgementResponse=new Promise<void>((resolve)=>{
      releaseAcknowledgementResponse=resolve;
    });
    const acknowledgeNotification=repository.acknowledgeNotification.bind(repository);
    vi.spyOn(repository,"acknowledgeNotification").mockImplementation(
      async (messageId,claimToken)=>{
        const acknowledged=await acknowledgeNotification(messageId,claimToken);
        if (acknowledged && holdNextAcknowledgement) {
          holdNextAcknowledgement=false;
          reportAcknowledgementCommitted();
          await acknowledgementResponse;
        }
        return acknowledged;
      }
    );
    const reconciler=new AccountErasureNotificationReconciler(repository,users,{
      async sendSecurityNotification(mail):Promise<void> {
        sent.push(mail);
        if (mail.recipient===primary && failPrimaryOnce) {
          failPrimaryOnce=false;
          throw new MailDeliveryError("SENDMAIL_EXIT_75");
        }
      }
    });

    const cancelledSchedule=await repository.schedule({
      userId:notificationUserId,ownerRef:notificationOwnerRef,
      sessionId:notificationSessionId,grantTokenHash:await makeGrant()
    });
    const cancelledErasureId=cancelledSchedule?.erasureId;
    expect(cancelledErasureId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await database.pool.query<{ count:string }>(`
      SELECT count(*)::text AS count
      FROM identity.account_erasure_notification_outbox
      WHERE erasure_id=$1 AND event_kind='SCHEDULED'
    `,[cancelledErasureId])).rows[0]?.count).toBe("2");
    const scheduledMessageIds=new Set((await database.pool.query<{ message_id:string }>(`
      SELECT message_id
      FROM identity.account_erasure_notification_outbox
      WHERE erasure_id=$1 AND event_kind='SCHEDULED'
    `,[cancelledErasureId])).rows.map(({ message_id })=>message_id));
    const firstOutcomes=await reconciler.reconcile(100);
    expect(firstOutcomes
      .filter(({ messageId })=>scheduledMessageIds.has(messageId))
      .map(({ outcome })=>outcome).sort())
      .toEqual(["ACKNOWLEDGED","FAILED"]);
    const failedReceipt=(await database.pool.query<{
      message_id:string;attempt_count:number;last_error_code:string;
    }>(`
      SELECT message_id,attempt_count,last_error_code
      FROM identity.account_erasure_notification_outbox
      WHERE erasure_id=$1 AND last_error_code='SENDMAIL_EXIT_75'
    `,[cancelledErasureId])).rows[0]!;
    expect(failedReceipt.attempt_count).toBe(1);
    await database.pool.query(
      `UPDATE identity.account_erasure_notification_outbox
       SET available_at=clock_timestamp()-interval '1 second'
       WHERE message_id=$1`,[failedReceipt.message_id]
    );
    expect(await reconciler.reconcile(100)).toEqual([{
      messageId:failedReceipt.message_id,outcome:"ACKNOWLEDGED"
    }]);
    expect(sent.filter(({ messageId })=>messageId===failedReceipt.message_id))
      .toHaveLength(2);

    expect(await repository.cancelCurrent({
      userId:notificationUserId,ownerRef:notificationOwnerRef,
      sessionId:notificationSessionId,
      cancellationRef:cancelledSchedule!.cancellationRef
    })).toBe(true);
    const crashedClaims=await repository.claimNotifications(1);
    expect(crashedClaims).toHaveLength(1);
    // The first worker vanished after its DB claim committed. Its durable
    // unacked row stays unavailable until the bounded lease expires. Park its
    // sibling briefly so the next claim proves exact crash-item recovery.
    await database.pool.query(
      `UPDATE identity.account_erasure_notification_outbox
       SET available_at=clock_timestamp()+interval '1 day'
       WHERE erasure_id=$1 AND message_id<>$2`,
      [cancelledErasureId,crashedClaims[0]!.messageId]
    );
    await database.pool.query(
      `UPDATE identity.account_erasure_notification_outbox
       SET claim_expires_at=clock_timestamp()-interval '1 second'
       WHERE message_id=$1`,[crashedClaims[0]!.messageId]
    );
    expect(await reconciler.reconcile(100)).toEqual([{
      messageId:crashedClaims[0]!.messageId,outcome:"ACKNOWLEDGED"
    }]);
    await database.pool.query(
      `UPDATE identity.account_erasure_notification_outbox
       SET available_at=clock_timestamp()-interval '1 second'
       WHERE erasure_id=$1 AND acknowledged_at IS NULL`,[cancelledErasureId]
    );
    holdNextAcknowledgement=true;
    const heldCancelled=reconciler.reconcile(100);
    await acknowledgementCommitted;
    expect((await database.pool.query<{ acknowledged:boolean }>(`
      SELECT bool_and(acknowledged_at IS NOT NULL) AS acknowledged
      FROM identity.account_erasure_notification_outbox
      WHERE erasure_id=$1`,[cancelledErasureId])).rows[0]?.acknowledged).toBe(true);

    const scheduledErasure=await repository.schedule({
      userId:notificationUserId,ownerRef:notificationOwnerRef,
      sessionId:notificationSessionId,grantTokenHash:await makeGrant()
    });
    const erasureId=scheduledErasure?.erasureId;
    expect(erasureId).toMatch(/^[0-9a-f-]{36}$/);
    // A delayed/ambiguous replay of cancellation generation A is idempotent
    // for A and cannot select or cancel the newer live generation B.
    expect(await repository.cancelCurrent({
      userId:notificationUserId,ownerRef:notificationOwnerRef,
      sessionId:notificationSessionId,
      cancellationRef:cancelledSchedule!.cancellationRef
    })).toBe(true);
    expect((await repository.current({
      userId:notificationUserId,ownerRef:notificationOwnerRef,
      sessionId:notificationSessionId
    }))?.erasureId).toBe(erasureId);
    await database.pool.query(
      `UPDATE identity.account_erasure_request
       SET requested_at=clock_timestamp()-interval '8 days',
         execute_at=clock_timestamp()-interval '1 day'
       WHERE erasure_id=$1`,[erasureId]
    );
    const coordinator=new AccountErasureCoordinator(repository,users,keys);
    let deletionSettled=false;
    const deleting=coordinator.reconcile({
      ip:"background",userAgent:"s10-notification-test",requestId:randomUUID()
    },100).finally(()=>{ deletionSettled=true; });
    await new Promise((resolve)=>setTimeout(resolve,25));
    expect(deletionSettled).toBe(false);
    expect(await repository.status(erasureId!)).toBe("DUE");
    expect((await database.pool.query<{ acquired:boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired`,
      [`debateai:account-erasure-notification:v1:${notificationUserId}`]
    )).rows[0]?.acquired).toBe(false);
    expect(await users.exists(notificationUserId)).toBe(true);
    releaseAcknowledgementResponse();
    expect(await heldCancelled).toEqual(expect.arrayContaining([
      expect.objectContaining({ outcome:"ACKNOWLEDGED" })
    ]));
    expect(await deleting).toEqual([{ erasureId,outcome:"CONTENDED" }]);
    expect(await repository.status(erasureId!)).toBe("PREPARED");
    expect((await repository.current({
      userId:notificationUserId,ownerRef:notificationOwnerRef,
      sessionId:notificationSessionId
    }))?.status).toBe("PROCESSING");
    const statusCapabilityAcl=await database.pool.query<{
      role_name:string;executable:boolean;
    }>(`
      SELECT role_name,has_function_privilege(
        role_name,'identity.authenticate_account_erasure_status_session(text,text,timestamptz)',
        'EXECUTE'
      ) AS executable
      FROM unnest(ARRAY[
        'debateai_authorization_runtime','debateai_runtime','debateai_erasure_runtime',
        'debateai_replay','debateai_publication_cleanup','debateai_content_provision',
        'public'
      ]) AS role_name
      ORDER BY role_name
    `);
    expect(statusCapabilityAcl.rows).toEqual([
      { role_name:"debateai_authorization_runtime",executable:true },
      { role_name:"debateai_content_provision",executable:false },
      { role_name:"debateai_erasure_runtime",executable:false },
      { role_name:"debateai_publication_cleanup",executable:false },
      { role_name:"debateai_replay",executable:false },
      { role_name:"debateai_runtime",executable:false },
      { role_name:"public",executable:false }
    ]);
    const statusAuth=await database.pool.connect();
    try {
      await statusAuth.query("BEGIN");
      await statusAuth.query("SET LOCAL ROLE debateai_authorization_runtime");
      expect((await statusAuth.query(
        "SELECT * FROM identity.authenticate_session_t9($1,$2,clock_timestamp(),clock_timestamp()+interval '1 hour')",
        [notificationSessionTokenHash,notificationBindingHash]
      )).rows).toEqual([]);
      expect((await statusAuth.query(
        "SELECT session_id,user_id FROM identity.authenticate_account_erasure_status_session($1,$2,clock_timestamp())",
        [notificationSessionTokenHash,notificationBindingHash]
      )).rows).toEqual([{
        session_id:notificationSessionId,user_id:notificationUserId
      }]);
      await statusAuth.query("ROLLBACK");
    } finally {
      statusAuth.release();
    }
    expect((await database.pool.query<{ count:string }>(`
      SELECT count(*)::text AS count
      FROM identity.account_erasure_notification_outbox
      WHERE erasure_id=$1 AND event_kind='COMPLETION' AND acknowledged_at IS NULL
    `,[erasureId])).rows[0]?.count).toBe("2");
    expect((await reconciler.reconcile(100)).map(({ outcome })=>outcome))
      .toEqual(["ACKNOWLEDGED","ACKNOWLEDGED","ACKNOWLEDGED","ACKNOWLEDGED"]);
    const staleCancelledMessage=(await database.pool.query<{ message_id:string }>(`
      UPDATE identity.account_erasure_notification_outbox
      SET acknowledged_at=NULL,claim_token=NULL,claim_expires_at=NULL,
        available_at=clock_timestamp()-interval '1 second'
      WHERE message_id=(
        SELECT message_id FROM identity.account_erasure_notification_outbox
        WHERE erasure_id=$1 ORDER BY message_id LIMIT 1
      )
      RETURNING message_id
    `,[cancelledErasureId])).rows[0]!.message_id;
    expect(await coordinator.execute(erasureId!,{
      ip:"background",userAgent:"s10-notification-test",requestId:randomUUID()
    })).toBe("CONTENDED");
    expect(await reconciler.reconcile(100)).toEqual([{
      messageId:staleCancelledMessage,outcome:"ACKNOWLEDGED"
    }]);
    expect(await coordinator.execute(erasureId!,{
      ip:"background",userAgent:"s10-notification-test",requestId:randomUUID()
    })).toBe("CLEANED");
    expect(await users.exists(notificationUserId)).toBe(false);
    expect((await database.pool.query<{
      users:string;channels:string;outbox:string;
    }>(`SELECT
      (SELECT count(*)::text FROM identity."user" WHERE user_id=$1) AS users,
      (SELECT count(*)::text FROM identity.channel_binding WHERE user_id=$1) AS channels,
      (SELECT count(*)::text FROM identity.account_erasure_notification_outbox
        WHERE user_id=$1) AS outbox`,[notificationUserId])).rows[0]).toEqual({
      users:"0",channels:"0",outbox:"0"
    });
    expect(await repository.claimNotifications(100)).toEqual([]);
  },120_000);

  it("releases the notification custody lease when its PostgreSQL backend crashes",async ()=>{
    const applicationName=`s10-notification-crash-${randomUUID()}`;
    const userRef=randomUUID();
    const holderPool=new PgPool({
      connectionString:database.connectionString,max:1,application_name:applicationName
    });
    const holderRepository=new PostgresAccountErasureRepository(
      holderPool,{} as AuditContextHasher
    );
    const successorRepository=new PostgresAccountErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    let reportEntered!:()=>void;
    let releaseUse!:()=>void;
    const entered=new Promise<void>((resolve)=>{ reportEntered=resolve; });
    const useGate=new Promise<void>((resolve)=>{ releaseUse=resolve; });
    const holding=holderRepository.withNotificationLease(userRef,async ()=>{
      reportEntered();
      await useGate;
    });
    try {
      await entered;
      const backend=(await database.pool.query<{ pid:number }>(`
        SELECT pid FROM pg_catalog.pg_stat_activity
        WHERE application_name=$1 AND pid<>pg_backend_pid()
      `,[applicationName])).rows[0]?.pid;
      expect(backend).toEqual(expect.any(Number));
      expect((await database.pool.query<{ terminated:boolean }>(
        "SELECT pg_terminate_backend($1) AS terminated",[backend]
      )).rows[0]?.terminated).toBe(true);
      await expect(successorRepository.withNotificationLease(
        userRef,async ()=>"ACQUIRED_AFTER_CRASH" as const
      )).resolves.toBe("ACQUIRED_AFTER_CRASH");
      releaseUse();
      await expect(holding).rejects.toThrow();
    } finally {
      releaseUse();
      await Promise.allSettled([holding,holderPool.end()]);
    }
  },120_000);

  it("lets a creation that already locked its live intent beat an expiring cleanup claim", async () => {
    const runId=randomUUID();
    const input=serverRunInput(`S10 create-wins ${randomUUID()}`);
    const executionRef=(await database.pool.query<{ execution_ref:string }>(
      "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
      [runId,userId,ownerRef,authSessionId]
    )).rows[0]!.execution_ref;
    await cipher.provisionRun(runId,{ userId,ownerRef });
    const prepared=await cipher.prepareRun(runId);
    const envelope=prepared.encrypt("core.run",runId,{
      questionLine:input.questionLine,askContract:input.askContract ?? {}
    });
    const attestation=prepared.attestEnvelope(
      "core.run",runId,"content_ciphertext",envelope
    );
    const attestationSecret=prepared.databaseAttestationSecret();
    prepared.close();
    await database.pool.query(
      `UPDATE core.run_key_provision_intent
       SET expires_at=clock_timestamp()+interval '1 second'
       WHERE run_id=$1`,[runId]
    );
    const creatorClient=await database.pool.connect();
    const claimClient=await database.pool.connect();
    let freshReaderPool:InstanceType<typeof PgPool>|undefined;
    try {
      await creatorClient.query("BEGIN");
      const created=await creatorClient.query<{ created:boolean }>(`
        SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created
      `,[JSON.stringify({
        runId,questionLine:CONTENT_CIPHERTEXT_SENTINEL,
        askerId:`owner:${ownerRef}`,executionRef,callerScope:input.callerScope,
        asOf:input.asOf.toISOString(),askerRiskTier:input.askerRiskTier,
        riskTier:input.effectiveRiskTier,tierSource:input.tierSource,
        tierProvenanceRef:input.tierProvenanceRef,
        compositionBudgetTier:input.compositionBudgetTier,
        depthParams:input.depthParams,discoveredPanel:input.discoveredPanel,
        strangerSampleRate:input.strangerSampleRate,envelopeBasis:input.envelopeBasis,
        registerVersion:input.registerVersion,batteryVersion:input.batteryVersion,
        askContract:{ ciphertext:true,v:1 },contentCiphertext:envelope,
        contentAttestation:attestation.toString("base64"),
        contentAttestationSecret:attestationSecret.toString("base64")
      }),userId,ownerRef,"[]"]);
      expect(created.rows[0]?.created).toBe(true);
      await expect(database.pool.query(
        "SELECT 1 FROM identity.run_execution_binding WHERE execution_ref=$1 FOR UPDATE NOWAIT",
        [executionRef]
      )).rejects.toMatchObject({ code:"55P03" });
      for (let attempt=0;attempt<150;attempt+=1) {
        const expired=await database.pool.query<{ expired:boolean }>(`
          SELECT expires_at<=clock_timestamp() AS expired
          FROM core.run_key_provision_intent WHERE run_id=$1
        `,[runId]);
        if (expired.rows[0]?.expired===true) break;
        await new Promise((resolve)=>setTimeout(resolve,10));
        if (attempt===149) throw new Error("CREATE_INTENT_EXPIRY_NOT_REACHED");
      }
      await claimClient.query("SET application_name='s10-create-wins-claim'");
      const claiming=claimClient.query<{ run_id:string }>(
        "SELECT run_id FROM core.claim_run_key_provision_cleanup(100)"
      );
      for (let attempt=0;attempt<100;attempt+=1) {
        const waiting=await database.pool.query<{ waiting:boolean }>(`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity
            WHERE application_name='s10-create-wins-claim'
              AND wait_event_type='Lock') AS waiting
        `);
        if (waiting.rows[0]?.waiting===true) break;
        await new Promise((resolve)=>setTimeout(resolve,10));
        if (attempt===99) throw new Error("CLEANUP_CLAIM_BARRIER_NOT_REACHED");
      }
      await creatorClient.query("COMMIT");
      await expect(claiming).resolves.toMatchObject({ rows:[] });
      expect(await keys.exists(runId)).toBe(true);
      expect((await database.pool.query<{ count:string }>(
        "SELECT count(*)::text AS count FROM core.run_key_provision_intent WHERE run_id=$1",
        [runId]
      )).rows[0]?.count).toBe("0");
      freshReaderPool=new PgPool({ connectionString:database.connectionString,max:2 });
      configureContentEncryption(freshReaderPool,new ContentCipher(keys));
      await expect(new RunRepository(freshReaderPool).readFrozenHead(runId))
        .resolves.toMatchObject({ runId });
    } finally {
      attestation.fill(0);
      attestationSecret.fill(0);
      await creatorClient.query("ROLLBACK").catch(()=>undefined);
      await claimClient.query("RESET application_name").catch(()=>undefined);
      creatorClient.release();
      claimClient.release();
      if (freshReaderPool!==undefined) await freshReaderPool.end();
      if ((await database.pool.query("SELECT 1 FROM core.run WHERE run_id=$1",[runId])).rowCount===0) {
        await keys.destroy(runId).catch(()=>undefined);
      }
    }
  },120_000);

  it("keeps the default-off legacy write/read contract explicit and plaintext-compatible", async () => {
    const question = `S6 legacy compatibility ${randomUUID()}`;
    const runId = await createLegacyRun(question);
    const raw = await database.pool.query<{
      question_line: string;
      content_encryption_version: number | null;
      question_blind_index: Buffer | null;
      content_ciphertext: object | null;
    }>(
      `SELECT question_line,content_encryption_version,question_blind_index,content_ciphertext
       FROM core.run WHERE run_id=$1`,
      [runId]
    );
    expect(raw.rows[0]).toEqual({
      question_line: question,
      content_encryption_version: null,
      question_blind_index: null,
      content_ciphertext: null
    });
    await expect(new RunRepository(database.pool).readFrozenHead(runId))
      .resolves.toMatchObject({ runId, questionLine: question });
  });

  it("rejects a plaintext carrier write for an encrypted run", async () => {
    const runId = await createEncryptedRun(`S6 guard ${randomUUID()}`);
    await expect(database.pool.query(
      `INSERT INTO core.node (
         run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,
         materialized_path,generation_status,path_status,exploration_decision,
         provenance_ref,way_of_knowing,locator,value_laden,position_label,is_folder,
         created_at_seq,relevant_as_of
       ) VALUES ($1,'plaintext forbidden','unknown',NULL,NULL,0,0,'0','complete',
         'active','continue',NULL,'REASONING',NULL,false,NULL,false,
         ledger.allocate_sequence(),now())`,
      [runId]
    )).rejects.toThrow(/CONTENT_PLAINTEXT_WRITE_FORBIDDEN/);
  });

  it("rejects role-switched forged envelopes and hides the run attestation secret", async () => {
    const runId = await createEncryptedRun(`S10 attestation guard ${randomUUID()}`);
    const otherRunId = await createEncryptedRun(`S10 attestation other ${randomUUID()}`);
    const nodeId = randomUUID();
    const prepared = await cipher.prepareRun(runId);
    const envelope = prepared.encrypt("core.node",nodeId,{ claimText:"attested node" });
    const attestation = prepared.attestEnvelope(
      "core.node",nodeId,"content_ciphertext",envelope
    );
    const wrongPurposeAttestation = prepared.attestEnvelope(
      "core.node",nodeId,"wrong-purpose",envelope
    );
    prepared.close();
    const runtime = await database.pool.connect();
    try {
      await runtime.query("SET ROLE debateai_runtime");
      await expect(runtime.query(
        "SELECT secret FROM core.run_content_attestation_secret WHERE run_id=$1",
        [runId]
      )).rejects.toMatchObject({ code: "42501" });
      const fakeEnvelope = {
        v:1,keyId:`run-content:${runId}:v1`,
        nonce:Buffer.alloc(12,0x11).toString("base64url"),
        ct:Buffer.from("dictionary-testable private plaintext").toString("base64url"),
        tag:Buffer.alloc(16,0x22).toString("base64url")
      };
      await expect(runtime.query(
        `INSERT INTO core.node (
           node_id,run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,
           materialized_path,generation_status,path_status,exploration_decision,
           provenance_ref,way_of_knowing,locator,value_laden,position_label,is_folder,
           created_at_seq,relevant_as_of,content_ciphertext,content_attestation
         ) VALUES ($1,$2,$3,'unknown',NULL,NULL,0,0,'0','complete','active','continue',
           NULL,'REASONING',NULL,false,NULL,false,ledger.allocate_sequence(),now(),$4::jsonb,$5)`,
        [randomUUID(),runId,CONTENT_CIPHERTEXT_SENTINEL,JSON.stringify(fakeEnvelope),Buffer.alloc(32,0x44)]
      )).rejects.toThrow(/CONTENT_ATTESTATION_INVALID/);

      const insertNode = (candidateNodeId: string,candidateRunId: string,
        candidateEnvelope: object,candidateAttestation: Buffer | null) => runtime.query(
        `INSERT INTO core.node (
           node_id,run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,
           materialized_path,generation_status,path_status,exploration_decision,
           provenance_ref,way_of_knowing,locator,value_laden,position_label,is_folder,
           created_at_seq,relevant_as_of,content_ciphertext,content_attestation
         ) VALUES ($1,$2,$3,'unknown',NULL,NULL,0,0,'0','complete','active','continue',
           NULL,'REASONING',NULL,false,NULL,false,ledger.allocate_sequence(),now(),$4::jsonb,$5)`,
        [candidateNodeId,candidateRunId,CONTENT_CIPHERTEXT_SENTINEL,
          JSON.stringify(candidateEnvelope),candidateAttestation]
      );
      await expect(insertNode(nodeId,runId,envelope,attestation)).resolves.toMatchObject({
        rowCount:1
      });
      await expect(insertNode(randomUUID(),runId,envelope,attestation))
        .rejects.toThrow(/CONTENT_ATTESTATION_INVALID/);
      await expect(insertNode(randomUUID(),otherRunId,envelope,attestation))
        .rejects.toThrow(/CONTENT_ATTESTATION_INVALID/);
      await expect(insertNode(randomUUID(),runId,envelope,null))
        .rejects.toThrow(/CONTENT_ATTESTATION_REQUIRED/);
      await expect(insertNode(randomUUID(),runId,envelope,wrongPurposeAttestation))
        .rejects.toThrow(/CONTENT_ATTESTATION_INVALID/);
      await expect(runtime.query(
        `INSERT INTO core.stranger_restatement (
           restatement_id,run_id,subject_kind,subject_id,restatement_text,check_status,
           at_seq,content_ciphertext,content_attestation
         ) VALUES ($1,$2,'node',$3,$4,'PASS',ledger.allocate_sequence(),$5::jsonb,$6)`,
        [randomUUID(),runId,nodeId,CONTENT_CIPHERTEXT_SENTINEL,
          JSON.stringify(envelope),attestation]
      )).rejects.toThrow(/CONTENT_ATTESTATION_INVALID/);
    } finally {
      await runtime.query("RESET ROLE").catch(() => undefined);
      runtime.release();
    }
  });

  it("destroys a provisioned run key when the SQL transaction rolls back", async () => {
    const storedBefore = keys.storedRunIds.length;
    await expect(new RunRepository(database.pool).startRun({
      questionLine: `S6 rollback ${randomUUID()}`,
      principal: { kind: "server", userId, ownerRef },
      sessionId: authSessionId,
      callerScope: "ASKER",
      asOf: new Date("2026-08-23T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "s6:rollback",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { source: "s6:rollback" },
      registerVersion: 1,
      batteryVersion: "s6:rollback",
      batteryRows: [{
        batteryRowId: "missing-battery-row",
        predicateRef: "s6:rollback",
        openingState: "ACTIVE",
        predicateInputs: {},
        skipEvidence: null
      }]
    })).rejects.toThrow();
    const provisioned = keys.storedRunIds[storedBefore];
    expect(provisioned).toBeDefined();
    expect(keys.destroyedRunIds).toContain(provisioned);
    await expect(keys.load(provisioned!)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    const rows = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",
      [provisioned]
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("fails loudly and generically if SQL rollback key cleanup is incomplete", async () => {
    const storedBefore = keys.storedRunIds.length;
    keys.failNextDestroy = true;
    const failure = await new RunRepository(database.pool).startRun({
      questionLine: `S6 cleanup failure ${randomUUID()}`,
      principal: { kind: "server", userId, ownerRef },
      sessionId: authSessionId,
      callerScope: "ASKER",
      asOf: new Date("2026-08-23T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "s6:cleanup-failure",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { source: "s6:cleanup-failure" },
      registerVersion: 1,
      batteryVersion: "s6:cleanup-failure",
      batteryRows: [{
        batteryRowId: "missing-battery-row",
        predicateRef: "s6:cleanup-failure",
        openingState: "ACTIVE",
        predicateInputs: {},
        skipEvidence: null
      }]
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "RUN_CONTENT_ROLLBACK_INCOMPLETE",
      message: "Run rollback or external content-key cleanup did not complete"
    });
    expect(String(failure)).not.toContain("SECRET_STORE_DELETE_FAILED");
    const provisioned = keys.storedRunIds[storedBefore]!;
    await expect(keys.load(provisioned)).resolves.toMatchObject({ runId: provisioned });
    const rows = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",
      [provisioned]
    );
    expect(rows.rows[0]?.count).toBe("0");
    await keys.destroy(provisioned);
    await expect(keys.load(provisioned)).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
  });

  it("retains the external key and reports a sanitized incomplete rollback after an ambiguous COMMIT", async () => {
    const storedBefore = keys.storedRunIds.length;
    const repositoryPool = createPool(database.connectionString);
    configureContentEncryption(repositoryPool, cipher);
    const pool = repositoryPool as unknown as {
      query: (...args: unknown[]) => Promise<unknown>;
    };
    const query = pool.query.bind(pool);
    const querySpy = vi.spyOn(pool,"query").mockImplementation(async (...args:unknown[]) => {
      const result = await query(...args);
      if (String(args[0]).includes("core.create_encrypted_run")) {
        throw Object.assign(new Error("s6 transport details must not escape"),{
          code:"ECONNRESET"
        });
      }
      return result;
    });
    try {
      const failure = await new RunRepository(repositoryPool)
        .startRun(serverRunInput(`S6 ambiguous commit ${randomUUID()}`))
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        code: "RUN_CONTENT_ROLLBACK_INCOMPLETE",
        message: "Run rollback or external content-key cleanup did not complete"
      });
      expect(String(failure)).not.toContain("transport details");
      expect(String(failure)).not.toContain("ECONNRESET");
      const provisioned = keys.storedRunIds[storedBefore]!;
      expect(keys.destroyedRunIds).not.toContain(provisioned);
      await expect(keys.load(provisioned)).resolves.toMatchObject({ runId: provisioned });
      expect((await database.pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM core.run WHERE run_id=$1",
        [provisioned]
      )).rows[0]?.count).toBe("1");
    } finally {
      querySpy.mockRestore();
      await repositoryPool.end();
    }
  });

  it("performs provisioning, initial encryption, key loading, and owner resolution without a runtime transaction", async () => {
    const observations: Array<{
      operation: "store" | "load" | "destroy" | "resolve";
      transactionOpen: boolean;
      identityLockHeld: boolean;
    }> = [];
    let transactionOpen = false;
    let identityLockHeld = false;
    const observe = (operation: "store" | "load" | "destroy" | "resolve") => {
      observations.push({ operation, transactionOpen, identityLockHeld });
    };
    keys.operationObserver = observe;
    ownerResolverObserver = () => observe("resolve");
    const repositoryPool = createPool(database.connectionString);
    configureContentEncryption(repositoryPool, cipher);
    try {
      await new RunRepository(repositoryPool).startRun(serverRunInput(`S6 ordering ${randomUUID()}`));
    } finally {
      keys.operationObserver = undefined;
      ownerResolverObserver = undefined;
      await repositoryPool.end();
    }
    expect(observations.map((entry) => entry.operation)).toEqual(["store", "load", "resolve"]);
    expect(observations.every((entry) => !entry.transactionOpen && !entry.identityLockHeld)).toBe(true);
  });

  it("fails closed when a 0038 encrypted run is read through a pool without a content cipher", async () => {
    const runId = await createEncryptedRun(`S6 missing cipher ${randomUUID()}`);
    const unconfiguredPool = createPool(database.connectionString);
    try {
      await expect(new RunRepository(unconfiguredPool).readLoadingProjection(runId, {
        ownerRef,
        legacyAskerId: null
      })).rejects.toMatchObject({ code: "CONTENT_CIPHER_UNAVAILABLE" });
      await expect(new RunRepository(unconfiguredPool).readFrozenHead(runId))
        .rejects.toMatchObject({ code: "CONTENT_CIPHER_UNAVAILABLE" });
    } finally {
      await unconfiguredPool.end();
    }
  });

  it("stores encrypted memory bindings and terms only inside the authenticated envelope", async () => {
    const marker = randomUUID();
    const runId = await createEncryptedRun(`S6 memory metadata ${marker}`);
    const canonicalQuestionText = `s6 memory metadata question ${marker}`;
    const bindingField = `s6-distinct-binding-field-${marker}`;
    const normalizedBinding = { [bindingField]: `s6-distinct-binding-${marker}` };
    const frozenTerms = [`s6-distinct-term-${marker}`];
    await new MemoryRepository(database.pool).recordQuestionAndMatch({
      key: {
        runId,
        canonicalQuestionText,
        callerScope: "ASKER",
        askerScope: `owner:${ownerRef}`,
        settlementAct: null,
        questionType: null,
        declaredField: null,
        normalizedBinding,
        frozenTerms,
        frozenQuerySetHash: null,
        asOf: "2026-08-23T00:00:00.000Z",
        policyVersion: 1,
        keyVersion: 1
      },
      decidedBy: "s6:memory-metadata-red",
      ownership: { ownerRef, legacyAskerId: null }
    });
    const raw = (await database.pool.query<{
      question_key_id: string;
      normalized_binding: Record<string, string>;
      frozen_terms: string[];
      content_ciphertext: object;
    }>(
      `SELECT question_key_id,normalized_binding,frozen_terms,content_ciphertext
       FROM memory.question_key WHERE run_id=$1`,
      [runId]
    )).rows[0]!;
    expect(raw.normalized_binding).toEqual({});
    expect(raw.frozen_terms).toEqual([]);
    await expect(cipher.decrypt(
      runId, "memory.question_key", raw.question_key_id, raw.content_ciphertext as never
    )).resolves.toEqual({ canonicalQuestionText, normalizedBinding, frozenTerms });
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain(normalizedBinding[bindingField]);
    expect(serialized).not.toContain(frozenTerms[0]!);

    await persistAcceptedTerminal(runId, `metadata-${marker}`);
    const currentRunId = await createEncryptedRun(`s6 metadata candidate ${marker}`);
    const disclosure = await new MemoryRepository(database.pool).recordQuestionAndMatch({
      key: {
        runId: currentRunId,
        canonicalQuestionText: `s6 alternate metadata question ${marker}`,
        callerScope: "ASKER",
        askerScope: `owner:${ownerRef}`,
        settlementAct: null,
        questionType: null,
        declaredField: null,
        normalizedBinding: {},
        frozenTerms,
        frozenQuerySetHash: null,
        asOf: "2026-08-23T00:00:00.000Z",
        policyVersion: 1,
        keyVersion: 1
      },
      decidedBy: "s6:memory-metadata-red",
      ownership: { ownerRef, legacyAskerId: null }
    });
    expect(disclosure).toMatchObject({
      matched: false,
      candidates_not_linked: [{ prior_run_id: runId, tier: "TERM_OVERLAP" }]
    });
    const matchMetadata = (await database.pool.query<{
      match_tier: string;
      agreement_pattern: Record<string, unknown>;
    }>(
      `SELECT match_tier,agreement_pattern
       FROM memory.candidate_record WHERE source_run_id=$1`,
      [currentRunId]
    )).rows[0]!;
    expect(matchMetadata).toMatchObject({
      match_tier: "TERM_OVERLAP",
      agreement_pattern: { agreedFields: ["termOverlap"] }
    });
    const persistedMetadata = JSON.stringify((await database.pool.query<{ body: string }>(
      `SELECT string_agg(body, E'\\n') AS body FROM (
         SELECT to_jsonb(value)::text AS body
         FROM memory.question_key AS value WHERE run_id=ANY($1::uuid[])
         UNION ALL
         SELECT to_jsonb(value)::text AS body
         FROM memory.candidate_record AS value WHERE source_run_id=$2
       ) AS persisted`,
      [[runId, currentRunId], currentRunId]
    )).rows[0]?.body ?? "");
    for (const forbidden of [
      frozenTerms[0]!,
      bindingField,
      `binding:${bindingField}`,
      `term:${frozenTerms[0]!}`,
      "frozenTerms:1",
      "sharedTermCount"
    ]) expect(persistedMetadata).not.toContain(forbidden);
    await database.pool.query("CHECKPOINT");
    const dataDirectory = (await database.pool.query<{ data_directory: string }>(
      "SHOW data_directory"
    )).rows[0]!.data_directory;
    await assertPostgresDataScanReadable(database.pool,dataDirectory);
    for (const forbidden of [
      frozenTerms[0]!, bindingField, `binding:${bindingField}`, "frozenTerms:1", "sharedTermCount"
    ]) {
      await expect(scanPostgresData(dataDirectory,forbidden)).resolves.toMatchObject({
        contains:false
      });
    }
  });

  it("rejects encrypted ownership transfer before loading a candidate key", async () => {
    const marker = randomUUID();
    const canonicalQuestionText = `s6 candidate ownership race ${marker}`;
    const priorRunId = await createEncryptedRun(`s6 candidate race prior ${marker}`);
    await persistAcceptedTerminal(priorRunId, `candidate-race-${marker}`);
    const questionKeyId = randomUUID();
    const preparedContent = await cipher.prepareRun(priorRunId);
    const contentEnvelope = preparedContent.encrypt(
      "memory.question_key",questionKeyId,
      { canonicalQuestionText,normalizedBinding:{},frozenTerms:[] }
    );
    const contentAttestation = preparedContent.attestEnvelope(
      "memory.question_key",questionKeyId,"content_ciphertext",contentEnvelope
    );
    preparedContent.close();
    await database.pool.query(
      `INSERT INTO memory.question_key (
         question_key_id,run_id,canonical_question_text,caller_scope,asker_scope,
         settlement_act,question_type,declared_field,normalized_binding,frozen_terms,
         frozen_query_set_hash,as_of,policy_version,key_version,at_seq,
         question_blind_index_version,question_blind_index,content_ciphertext,content_attestation
       ) VALUES ($1,$2,$3,'ASKER',$4,NULL,NULL,NULL,'{}'::jsonb,'[]'::jsonb,
         NULL,now(),1,1,ledger.allocate_sequence(),2,NULL,$5::jsonb,$6)`,
      [
        questionKeyId,
        priorRunId,
        CONTENT_CIPHERTEXT_SENTINEL,
        `owner:${ownerRef}`,
        JSON.stringify(contentEnvelope),contentAttestation
      ]
    );
    const foreignOwnerRef = await createForeignOwnerRef();
    const loadedBefore = keys.loadedRunIds.length;
    await expect(database.pool.query(
      "SELECT core.append_run_ownership_event($1,$2) AS at_seq",
      [priorRunId, foreignOwnerRef]
    )).rejects.toMatchObject({
      code: "23514",
      message: "ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP"
    });
    expect(keys.loadedRunIds).toHaveLength(loadedBefore);
  }, 60_000);

  it("keeps selected encrypted ownership immutable before matching", async () => {
    const marker = randomUUID();
    const canonicalQuestionText = `s6 final ownership race ${marker}`;
    const memory = new MemoryRepository(database.pool);
    let priorRunId = await createEncryptedRun(`s6 final race prior ${marker}`);
    for (let attempt = 0; attempt < 32 && priorRunId < "80000000-0000-4000-8000-000000000000"; attempt += 1) {
      priorRunId = await createEncryptedRun(`s6 final race prior retry ${attempt} ${marker}`);
    }
    expect(priorRunId >= "80000000-0000-4000-8000-000000000000").toBe(true);
    await expect(memory.recordQuestionAndMatch({
      key: {
        runId: priorRunId,
        canonicalQuestionText,
        callerScope: "ASKER",
        askerScope: `owner:${ownerRef}`,
        settlementAct: null,
        questionType: null,
        declaredField: null,
        normalizedBinding: {},
        frozenTerms: [],
        frozenQuerySetHash: null,
        asOf: "2026-08-23T00:00:00.000Z",
        policyVersion: 1,
        keyVersion: 1
      },
      decidedBy: "s6:final-ownership-race",
      ownership: { ownerRef, legacyAskerId: null }
    })).resolves.toBeNull();
    await persistAcceptedTerminal(priorRunId, `final-race-${marker}`);
    const foreignOwnerRef = await createForeignOwnerRef();
    await expect(database.pool.query(
      "SELECT core.append_run_ownership_event($1,$2) AS at_seq",
      [priorRunId, foreignOwnerRef]
    )).rejects.toMatchObject({
      code: "23514",
      message: "ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP"
    });
    expect((await database.pool.query<{ owner_ref: string }>(`
      SELECT owner_ref FROM core.run_ownership_event WHERE run_id=$1
      ORDER BY at_seq DESC LIMIT 1
    `,[priorRunId])).rows[0]?.owner_ref).toBe(ownerRef);
  }, 60_000);

  it("completes concurrent encrypted graph writes through a bounded lease-capable pool", async () => {
    const boundedPool = new PgPool({
      connectionString: database.connectionString,
      max: 4,
      connectionTimeoutMillis: 1_500
    });
    configureContentEncryption(boundedPool, cipher);
    try {
      const repository = new RunRepository(boundedPool);
      const runIds = [
        await repository.startRun(serverRunInput(`S6 bounded graph A ${randomUUID()}`)),
        await repository.startRun(serverRunInput(`S6 bounded graph B ${randomUUID()}`))
      ];
      expect(boundedPool.totalCount).toBeGreaterThanOrEqual(1);
      const nodeIds = await Promise.all(runIds.map((runId, index) =>
        new GraphRepository(boundedPool).withGraphWrite(runId, (writer) => writer.addNode({
          runId,
          statementText: `S6 bounded node ${index} ${randomUUID()}`,
          claimType: "unknown",
          parentNodeId: null,
          childKind: null,
          siblingOrdinal: 0,
          generationStatus: "complete",
          pathStatus: "active",
          explorationDecision: "continue",
          provenanceRef: null,
          wayOfKnowing: "REASONING",
          locator: null,
          valueLaden: false
        }))
      ));
      expect(nodeIds).toHaveLength(2);
      expect(new Set(nodeIds).size).toBe(2);
      expect(boundedPool.totalCount).toBeLessThanOrEqual(4);
      expect(boundedPool.waitingCount).toBe(0);
    } finally {
      await boundedPool.end();
    }
  });

  it("harvests an encrypted node review with a dedicated resolver and lease connection", async () => {
    const bounded = createBoundedEvaluatorPool();
    try {
      const fixture = await createBoundedEvaluatorFixture(
        bounded.pool,
        `harvest-${randomUUID()}`
      );
      const keyProbe = await bounded.cipher.prepareRun(fixture.runId);
      keyProbe.close();

      const harvested = await new EvaluatorHarvestRepository(bounded.pool)
        .harvestTerminalRun(fixture.runId, new Date("2026-08-23T01:00:00.000Z"))
        .catch((error: unknown) => ({
          state: "ERROR" as const,
          code: error !== null && typeof error === "object" && "code" in error
            ? String(error.code)
            : "UNKNOWN"
        }));

      expect({
        keyExists: true,
        nestedResolverWaits: bounded.nestedResolverWaits(),
        harvested
      }).toMatchObject({
        keyExists: true,
        nestedResolverWaits: 0,
        harvested: { state: "HARVESTED", runId: fixture.runId }
      });
      expect(bounded.pool.totalCount).toBeLessThanOrEqual(2);
      expect(bounded.pool.waitingCount).toBe(0);
      expect(bounded.loadedKeys.length).toBeGreaterThan(0);
      expect(bounded.loadedKeys.every((key) => key.every((byte) => byte === 0))).toBe(true);
    } finally {
      await bounded.pool.end();
    }
  }, 30_000);

  it("loads an encrypted add-on candidate under its run lock with a dedicated resolver", async () => {
    const bounded = createBoundedEvaluatorPool();
    try {
      const fixture = await createBoundedEvaluatorFixture(
        bounded.pool,
        `addon-${randomUUID()}`
      );
      await bounded.pool.query(
        `INSERT INTO evaluator.pipeline_event (
           run_id,pipeline,pipeline_version,attempt_id,state,reason,input_hash,at_seq
         ) VALUES ($1,'HARVEST',1,gen_random_uuid(),'SUCCEEDED','fixture',$2,
           ledger.allocate_sequence())`,
        [fixture.runId, "e".repeat(64)]
      );
      const keyProbe = await bounded.cipher.prepareRun(fixture.runId);
      keyProbe.close();
      const repository = new PostgresEvaluatorAddonRepository(bounded.pool);

      const loaded = await repository.withRunLock(
        fixture.runId,
        (client, preparedContent) => repository.loadCandidate(
          fixture.runId, client, preparedContent
        )
      ).catch((error: unknown) => ({
        state: "ERROR" as const,
        code: error !== null && typeof error === "object" && "code" in error
          ? String(error.code)
          : "UNKNOWN"
      }));

      expect({
        keyExists: true,
        nestedResolverWaits: bounded.nestedResolverWaits(),
        loaded
      }).toMatchObject({
        keyExists: true,
        nestedResolverWaits: 0,
        loaded: {
          acquired: true,
          value: {
            runId: fixture.runId,
            questionExcerpt: fixture.questionLine,
            taskExcerpt: fixture.claimText,
            reasons: expect.arrayContaining([
              expect.stringMatching(/^s6 evaluator review addon-/)
            ])
          }
        }
      });
      expect(bounded.pool.totalCount).toBeLessThanOrEqual(2);
      expect(bounded.pool.waitingCount).toBe(0);
      expect(bounded.loadedKeys.length).toBeGreaterThan(0);
      expect(bounded.loadedKeys.every((key) => key.every((byte) => byte === 0))).toBe(true);
    } finally {
      await bounded.pool.end();
    }
  }, 30_000);

  it("holds the session content lease through key load, decrypt, plaintext use, and erasure PREPARE", async () => {
    for (const pauseAt of ["LOAD","DECRYPT"] as const) {
      const question = `S10 ${pauseAt.toLowerCase()} lease ${randomUUID()}`;
      const runId = await createEncryptedRun(question);
      const grantTokenHash = await grantPrivateRunDeletion(runId);
      const applicationName = `s10-content-lease-${pauseAt.toLowerCase()}-${randomUUID()}`;
      const readerPool = new PgPool({ connectionString: database.connectionString,max: 3 });
      const erasurePool = new PgPool({
        connectionString: database.connectionString,max: 2,application_name: applicationName
      });
      let releasePause!: () => void;
      let reportPause!: () => void;
      const paused = new Promise<void>((resolve) => { reportPause = resolve; });
      const resume = new Promise<void>((resolve) => { releasePause = resolve; });
      const phaseStore: RunContentKeyStore = {
        store: (candidateRunId,identity,key) => keys.store(candidateRunId,identity,key),
        async load(candidateRunId): Promise<LoadedRunContentKey> {
          const loaded = await keys.load(candidateRunId);
          if (pauseAt === "LOAD" && candidateRunId === runId) {
            reportPause();
            await resume;
          }
          return loaded;
        },
        exists: (candidateRunId) => keys.exists(candidateRunId),
        ownerRef: (candidateRunId) => keys.ownerRef(candidateRunId),
        listByOwner: (candidateOwnerRef) => keys.listByOwner(candidateOwnerRef),
        destroy: (candidateRunId) => keys.destroy(candidateRunId)
      };
      configureContentEncryption(readerPool,new ContentCipher(phaseStore));
      const repository = new PostgresPrivateRunErasureRepository(
        erasurePool,{} as AuditContextHasher
      );
      const loadedKeyOffset = keys.loadedKeys.length;
      try {
        const reading = withRunContentLease(readerPool,[runId],async () => {
          const row = (await readerPool.query<{
            question_line: string;
            content_ciphertext: object;
          }>(
            "SELECT question_line,content_ciphertext FROM core.run WHERE run_id=$1",
            [runId]
          )).rows[0]!;
          const content = await decryptContentForRun<{ questionLine: string }>(
            readerPool,runId,"core.run",runId,row.content_ciphertext as never,
            { questionLine: row.question_line }
          );
          if (pauseAt === "DECRYPT") {
            reportPause();
            await resume;
          }
          return content.questionLine;
        });
        await paused;
        const preparing = repository.prepare({
          runId,userId,ownerRef,sessionId: authSessionId,grantTokenHash
        });
        await waitForAdvisoryWait(applicationName);
        releasePause();
        await expect(reading).resolves.toBe(question);
        await expect(preparing).resolves.toMatchObject({ outcome: "PREPARED" });
        const usedKeys = keys.loadedKeys.slice(loadedKeyOffset);
        expect(usedKeys.length).toBeGreaterThan(0);
        expect(usedKeys.every((key) => key.every((byte) => byte === 0))).toBe(true);
        await expect(new PrivateRunErasureCoordinator(repository,keys).execute({
          runId,userId,ownerRef,sessionId: authSessionId,grantTokenHash,
          source: { ip: "192.0.2.61",userAgent: "s10-content-lease",requestId: randomUUID() }
        })).resolves.toBe("CLEANED");
      } finally {
        releasePause();
        await readerPool.end();
        await erasurePool.end();
      }
    }
  }, 60_000);

  it("rejects nested lease expansion immediately in either UUID order", async () => {
    const runIds = [
      await createEncryptedRun(`S10 nested lease low ${randomUUID()}`),
      await createEncryptedRun(`S10 nested lease high ${randomUUID()}`)
    ].sort();
    for (const sourceRunId of [runIds[0]!,runIds[1]!] as const) {
      const expanding = withRunContentLease(database.pool,[sourceRunId],async () =>
        withRunContentLease(database.pool,runIds,async () => "expanded"));
      await expect(Promise.race([
        expanding,
        new Promise((_,reject) => setTimeout(
          () => reject(new Error("LEASE_EXPANSION_HUNG")),250
        ))
      ])).rejects.toMatchObject({ code: "CONTENT_LEASE_SCOPE_EXPANSION_FORBIDDEN" });
    }
  });

  it("lets a content-lease holder use a maxed shared pool while followers wait", async () => {
    const runId = await createEncryptedRun(`S10 content pool progress ${randomUUID()}`);
    const applicationName = `s10-content-pool-progress-${randomUUID()}`;
    const sharedPool = new PgPool({
      connectionString: database.connectionString,
      application_name: applicationName,
      max: 2
    });
    sharedPool.on("error",() => undefined);
    configureContentEncryption(sharedPool,new ContentCipher(keys));
    let beginHolderQuery!: () => void;
    let releaseHolder!: () => void;
    let reportHolderEntered!: () => void;
    let reportHolderQueryComplete!: () => void;
    const holderEntered = new Promise<void>((resolve) => { reportHolderEntered = resolve; });
    const holderQueryGate = new Promise<void>((resolve) => { beginHolderQuery = resolve; });
    const holderQueryComplete = new Promise<void>((resolve) => { reportHolderQueryComplete = resolve; });
    const holderRelease = new Promise<void>((resolve) => { releaseHolder = resolve; });
    let holder: Promise<void> | undefined;
    let followers: Promise<unknown>[] = [];
    let followersDone: Promise<unknown[]> | undefined;
    try {
      holder = withRunContentLease(sharedPool,[runId],async () => {
        reportHolderEntered();
        await holderQueryGate;
        await sharedPool.query("SELECT 1");
        reportHolderQueryComplete();
        await holderRelease;
      });
      void holder.catch(() => undefined);
      await holderEntered;
      followers = [0].map(() => withRunContentLease(
        sharedPool,[runId],async () => "acquired"
      ));
      followersDone = Promise.all(followers);
      void followersDone.catch(() => undefined);
      for (let attempt=0;attempt<500;attempt+=1) {
        const waiting = await database.pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE application_name=$1`,
          [applicationName]
        );
        if (Number(waiting.rows[0]?.count ?? 0) === 2) break;
        if (attempt === 499) throw new Error("CONTENT_LEASE_FOLLOWER_DID_NOT_CONNECT");
        await new Promise((resolve) => setTimeout(resolve,10));
      }
      beginHolderQuery();
      const progressed = await Promise.race([
        holderQueryComplete.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false),500))
      ]);
      expect(progressed).toBe(true);
      releaseHolder();
      await expect(holder).resolves.toBeUndefined();
      await expect(followersDone).resolves.toEqual(["acquired"]);
    } finally {
      beginHolderQuery();
      releaseHolder();
      await database.pool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE application_name=$1 AND pid<>pg_backend_pid()`,
        [applicationName]
      ).catch(() => undefined);
      if (holder !== undefined) await holder.catch(() => undefined);
      await Promise.allSettled(followers);
      await sharedPool.end().catch(() => undefined);
    }
  },30_000);

  it("loads only a requested nested subset and ignores an unrelated missing outer key", async () => {
    const runA = await createEncryptedRun(`S10 lease subset A ${randomUUID()}`);
    const runB = await createEncryptedRun(`S10 lease subset B ${randomUUID()}`);
    const loaded: string[] = [];
    const selectiveStore: RunContentKeyStore = {
      store: (runId,identity,key) => keys.store(runId,identity,key),
      async load(runId): Promise<LoadedRunContentKey> {
        loaded.push(runId);
        if (runId === runB) throw new Error("UNRELATED_RUN_CONTENT_KEY_UNRESOLVED");
        return keys.load(runId);
      },
      exists: (runId) => keys.exists(runId),
      ownerRef: (runId) => keys.ownerRef(runId),
      listByOwner: (candidateOwnerRef) => keys.listByOwner(candidateOwnerRef),
      destroy: (runId) => keys.destroy(runId)
    };
    const subsetPool = new PgPool({ connectionString: database.connectionString,max: 2 });
    configureContentEncryption(subsetPool,new ContentCipher(selectiveStore));
    try {
      await withRunContentLease(subsetPool,[runA,runB],async () => {
        const prepared = await prepareLeasedContentEncryptionForRuns(subsetPool,[runA]);
        expect([...prepared.keys()]).toEqual([runA]);
        await prepared.get(runA)!.close();
      });
      expect(loaded).toEqual([runA]);
    } finally {
      await subsetPool.end();
    }
  });

  it("retries relation discovery before plaintext use in both UUID orders", async () => {
    const runIds = [
      await createEncryptedRun(`S10 relation retry A ${randomUUID()}`),
      await createEncryptedRun(`S10 relation retry B ${randomUUID()}`)
    ].sort();
    for (const [sourceRunId,priorRunId] of [
      [runIds[0]!,runIds[1]!],
      [runIds[1]!,runIds[0]!]
    ] as const) {
      const memory = new MemoryRepository(database.pool);
      const discovery = vi.spyOn(memory,"leaseRunIdsForDisclosure")
        .mockResolvedValueOnce(Object.freeze([sourceRunId]))
        .mockResolvedValueOnce(Object.freeze([sourceRunId,priorRunId].sort()))
        .mockResolvedValueOnce(Object.freeze([sourceRunId,priorRunId].sort()))
        .mockResolvedValueOnce(Object.freeze([sourceRunId,priorRunId].sort()));
      const plaintextUse = vi.fn(async () => "used");
      try {
        await expect(memory.withDisclosureContentLease([sourceRunId],plaintextUse))
          .resolves.toBe("used");
        expect(discovery).toHaveBeenCalledTimes(4);
        expect(plaintextUse).toHaveBeenCalledTimes(1);
      } finally {
        discovery.mockRestore();
      }
    }
  });

  it("denies a fresh reader when erasure wins and leaves an active sibling readable", async () => {
    const erasedQuestion = `S10 erasure-wins ${randomUUID()}`;
    const siblingQuestion = `S10 sibling-survives ${randomUUID()}`;
    const erasedRunId = await createEncryptedRun(erasedQuestion);
    const siblingRunId = await createEncryptedRun(siblingQuestion);
    const envelopes = await database.pool.query<{
      run_id: string;
      content_ciphertext: object;
    }>(
      "SELECT run_id,content_ciphertext FROM core.run WHERE run_id=ANY($1::uuid[]) ORDER BY run_id",
      [[erasedRunId,siblingRunId]]
    );
    const envelopeFor = (runId: string): object =>
      envelopes.rows.find((row) => row.run_id === runId)!.content_ciphertext;
    const grantTokenHash = await grantPrivateRunDeletion(erasedRunId);
    const repository = new PostgresPrivateRunErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    await expect(new PrivateRunErasureCoordinator(repository,keys).execute({
      runId: erasedRunId,userId,ownerRef,sessionId: authSessionId,grantTokenHash,
      source: { ip: "192.0.2.62",userAgent: "s10-erasure-wins",requestId: randomUUID() }
    })).resolves.toBe("CLEANED");
    const loadCount = keys.loadedKeys.length;
    const freshPool = new PgPool({ connectionString: database.connectionString,max: 2 });
    configureContentEncryption(freshPool,new ContentCipher(keys));
    try {
      await expect(new RunRepository(freshPool).readFrozenHead(erasedRunId))
        .rejects.toMatchObject({ code: "PRIVATE_CONTENT_ERASED" });
      expect(keys.loadedKeys).toHaveLength(loadCount);
      await expect(new RunRepository(freshPool).readFrozenHead(siblingRunId))
        .resolves.toMatchObject({ runId: siblingRunId,questionLine: siblingQuestion });
      expect(keys.loadedKeys.length).toBeGreaterThan(loadCount);
      await expect(new ContentCipher(keys).decrypt(
        erasedRunId,"core.run",erasedRunId,
        envelopeFor(erasedRunId) as never
      )).rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
      const child = await runFreshProcessSecretProbe({
        erasedRunId,erasedEnvelope: envelopeFor(erasedRunId),
        siblingRunId,siblingEnvelope: envelopeFor(siblingRunId),
        resolver: { [ownerRef]: userId },probeUserId: userId
      });
      expect(child).toEqual({
        userDek: { state: "LOADED" },
        erasedExists: false,
        erasedLoad: { state: "ERROR",code: "RUN_CONTENT_KEY_UNRESOLVED" },
        erasedDecrypt: { state: "ERROR",code: "RUN_CONTENT_KEY_UNRESOLVED" },
        erasedLocator: { state: "ERROR",code: "RUN_CONTENT_KEY_UNRESOLVED" },
        siblingExists: true,
        siblingDecrypt: {
          state: "DECRYPTED",value: {
            questionLine: siblingQuestion,askContract: { audience: "private-test" }
          }
        }
      });
      expect(JSON.stringify(child)).not.toContain(secretRoot);
    } finally {
      await freshPool.end();
    }
  }, 30_000);

  it("denies a spawned fresh process after account key shredding while an active sibling remains readable", async () => {
    const deletedUserId = randomUUID();
    const deletedOwnerRef = randomUUID();
    const deletedSessionId = randomUUID();
    const deletedQuestion = `S10 account-child-erased ${randomUUID()}`;
    const siblingQuestion = `S10 account-child-sibling ${randomUUID()}`;
    await database.pool.query(
      `INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [deletedUserId,randomBytes(32),`s10-child-${randomUUID()}`,randomUUID(),deletedOwnerRef]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
        session_id,user_id,token_hash,csrf_token_hash,binding_context,
        created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
      ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
        now()+interval '2 hours',now())`,
      [deletedSessionId,deletedUserId,`sha256:${randomBytes(32).toString("hex")}`,
        `sha256:${randomBytes(32).toString("hex")}`]
    );
    await users.store(deletedUserId,generateDek());
    const deletedRunId = await new RunRepository(database.pool).startRun({
      ...serverRunInput(deletedQuestion),
      principal: { kind: "server",userId: deletedUserId,ownerRef: deletedOwnerRef },
      sessionId: deletedSessionId
    });
    const siblingRunId = await createEncryptedRun(siblingQuestion);
    const rows = await database.pool.query<{ run_id: string; content_ciphertext: object }>(
      "SELECT run_id,content_ciphertext FROM core.run WHERE run_id=ANY($1::uuid[])",
      [[deletedRunId,siblingRunId]]
    );
    const envelopeFor = (runId: string): object =>
      rows.rows.find((row) => row.run_id === runId)!.content_ciphertext;
    const erasureId = (await database.pool.query<{ erasure_id: string }>(
      `INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
       VALUES ($1,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')
       RETURNING erasure_id`,[deletedUserId]
    )).rows[0]!.erasure_id;
    const repository = new PostgresAccountErasureRepository(
      database.pool,{} as AuditContextHasher
    );
    const preview = (await repository.preview(erasureId))!;
    expect(await repository.prepare(
      erasureId,preview.runIds,preview.legacyRunIds,preview.publishedRunIds
    )).toBe("PREPARED");
    expect(await new AccountErasureCoordinator(repository,users,keys).execute(erasureId,{
      ip: "192.0.2.63",userAgent: "s10-account-child",requestId: randomUUID()
    })).toBe("CLEANED");
    const child = await runFreshProcessSecretProbe({
      erasedRunId: deletedRunId,erasedEnvelope: envelopeFor(deletedRunId),
      siblingRunId,siblingEnvelope: envelopeFor(siblingRunId),
      resolver: { [deletedOwnerRef]: deletedUserId,[ownerRef]: userId },
      probeUserId: deletedUserId
    });
    expect(child).toEqual({
      userDek: { state: "ERROR",code: "KEK_UNRESOLVED" },
      erasedExists: false,
      erasedLoad: { state: "ERROR",code: "RUN_CONTENT_KEY_UNRESOLVED" },
      erasedDecrypt: { state: "ERROR",code: "RUN_CONTENT_KEY_UNRESOLVED" },
      erasedLocator: { state: "ERROR",code: "RUN_CONTENT_KEY_UNRESOLVED" },
      siblingExists: true,
      siblingDecrypt: { state: "DECRYPTED",value: {
        questionLine: siblingQuestion,askContract: { audience: "private-test" }
      } }
    });
    expect(JSON.stringify(child)).not.toContain(secretRoot);
    expect((await database.pool.query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=$1) AS present`,
      [deletedUserId]
    )).rows[0]?.present).toBe(false);
  }, 30_000);

  it("makes account PREPARE wait for a live reader's complete run-content lease", async () => {
    const deletedUserId = randomUUID();
    const deletedOwnerRef = randomUUID();
    const deletedSessionId = randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,
        'active',now(),now())`,
      [deletedUserId,randomBytes(32),`s10-account-lease-${randomUUID()}`,
        randomUUID(),deletedOwnerRef]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
        session_id,user_id,token_hash,csrf_token_hash,binding_context,
        created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
      ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
        now()+interval '2 hours',now())`,
      [deletedSessionId,deletedUserId,`sha256:${randomBytes(32).toString("hex")}`,
        `sha256:${randomBytes(32).toString("hex")}`]
    );
    await users.store(deletedUserId,generateDek());
    const runId = await new RunRepository(database.pool).startRun({
      ...serverRunInput(`S10 account lease waits ${randomUUID()}`),
      principal:{ kind:"server",userId:deletedUserId,ownerRef:deletedOwnerRef },
      sessionId:deletedSessionId
    });
    const erasureId = (await database.pool.query<{ erasure_id:string }>(
      `INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at)
       VALUES ($1,clock_timestamp()-interval '2 seconds',
         clock_timestamp()-interval '1 second') RETURNING erasure_id`,
      [deletedUserId]
    )).rows[0]!.erasure_id;
    const applicationName = `s10-account-content-lease-${randomUUID()}`;
    const readerPool = new PgPool({ connectionString:database.connectionString,max:2 });
    const erasurePool = new PgPool({
      connectionString:database.connectionString,max:2,application_name:applicationName
    });
    configureContentEncryption(readerPool,new ContentCipher(keys));
    let releaseReader!: () => void;
    let reportReader!: () => void;
    const readerEntered = new Promise<void>((resolve) => { reportReader = resolve; });
    const readerRelease = new Promise<void>((resolve) => { releaseReader = resolve; });
    const erasureRepository = new PostgresAccountErasureRepository(
      erasurePool,{} as AuditContextHasher
    );
    try {
      const reading = withRunContentLease(readerPool,[runId],async () => {
        reportReader();
        await readerRelease;
        return new RunRepository(readerPool).readFrozenHead(runId);
      });
      await readerEntered;
      const preview = (await erasureRepository.preview(erasureId))!;
      const preparing = erasureRepository.prepare(
        erasureId,preview.runIds,preview.legacyRunIds,preview.publishedRunIds
      );
      await waitForAdvisoryWait(applicationName);
      releaseReader();
      await expect(reading).resolves.toMatchObject({ runId });
      await expect(preparing).resolves.toBe("PREPARED");
      await expect(new AccountErasureCoordinator(
        erasureRepository,users,keys
      ).execute(erasureId,{
        ip:"192.0.2.64",userAgent:"s10-account-content-lease",requestId:randomUUID()
      })).resolves.toBe("CLEANED");
    } finally {
      releaseReader();
      await readerPool.end();
      await erasurePool.end();
    }
  },30_000);

  it("releases a session content lease when its PostgreSQL backend crashes", async () => {
    const runId = await createEncryptedRun(`S10 crash-release ${randomUUID()}`);
    const crashedPool = new PgPool({ connectionString: database.connectionString,max: 1 });
    const successorPool = new PgPool({ connectionString: database.connectionString,max: 1 });
    const lease = await acquireRunContentLease(crashedPool,[runId]);
    // A terminated backend is the expected crash signal for this witness; pg
    // emits it out-of-band as well as failing the next query.
    crashedPool.on("error",() => undefined);
    lease.client.on("error",() => undefined);
    try {
      const pid = (await lease.client.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      )).rows[0]!.pid;
      await expect(database.pool.query<{ terminated: boolean }>(
        "SELECT pg_terminate_backend($1) AS terminated",[pid]
      )).resolves.toMatchObject({ rows: [{ terminated: true }] });
      const successor = await acquireRunContentLease(successorPool,[runId]);
      await successor.assertLive();
      await successor.release();
    } finally {
      await lease.release().catch(() => undefined);
      await crashedPool.end().catch(() => undefined);
      await successorPool.end();
    }
  }, 30_000);

  it("round-trips every physical carrier and shreds all fourteen logical groups while rows persist", async () => {
    const marker = randomUUID();
    const runQuestion = `s6-run-${marker}`;
    const runId = await createEncryptedRun(runQuestion);
    const priorRunId = await createEncryptedRun(runQuestion);
    let activeTransactions = 0;
    const nestedPoolQueries: string[] = [];
    type GuardedClient = { query: (...args: unknown[]) => Promise<unknown> };
    const guardedPool = database.pool as unknown as {
      connect: (...args: unknown[]) => unknown;
      query: (...args: unknown[]) => Promise<unknown>;
    };
    const directConnect = guardedPool.connect.bind(guardedPool);
    const directQuery = guardedPool.query.bind(guardedPool);
    const instrumentedClients = new WeakSet<object>();
    const instrumentClient = (client: GuardedClient): GuardedClient => {
      if (instrumentedClients.has(client)) return client;
      instrumentedClients.add(client);
      const query = client.query.bind(client);
      client.query = async (...args: unknown[]) => {
        const sql = String(args[0]).trim();
        const result = await query(...args);
        if (sql === "BEGIN") activeTransactions += 1;
        if (sql === "COMMIT" || sql === "ROLLBACK") {
          activeTransactions -= 1;
        }
        return result;
      };
      return client;
    };
    const connectSpy = vi.spyOn(guardedPool, "connect").mockImplementation((...args: unknown[]) => {
      const connected = directConnect() as Promise<GuardedClient>;
      const callback = args[0];
      if (typeof callback === "function") {
        void connected.then(
          (client) => callback(undefined, instrumentClient(client)),
          (error: unknown) => callback(error)
        );
        return undefined;
      }
      return connected.then(instrumentClient);
    });
    const querySpy = vi.spyOn(guardedPool, "query").mockImplementation(async (...args: unknown[]) => {
      if (activeTransactions > 0) {
        nestedPoolQueries.push(String(args[0]));
        throw new Error("S6_NESTED_POOL_CHECKOUT_INSIDE_WRITE_TRANSACTION");
      }
      return directQuery(...args);
    });
    try {
    const ledger = new LedgerRepository(database.pool);
    const authorArtifactId = randomUUID();
    const reviewerArtifactId = randomUUID();
    const rawText = `s6-raw-${marker}`;
    const malformedProviderDetail = `S10_DISTINCTIVE_PRIVATE_TEXT_8391_${marker}@example.invalid`;
    const sharedLowEntropyDigestInput = `private-low-entropy-${marker}`;
    await ledger.appendRawArtifact({
      artifactId: authorArtifactId,
      attemptId: randomUUID(),
      runId,
      providerRef: "provider:s6-author",
      provider: "test",
      model: "model/s6-author",
      maker: "maker:s6-author",
      modelVersion: "v1",
      rawText,
      metadata: {},
      parseStatus: "PARSED",
      inputHash: sharedLowEntropyDigestInput,
      contractHash: "2".repeat(64),
      contentHash: "3".repeat(64)
    });
    await ledger.appendRawArtifact({
      artifactId: reviewerArtifactId,
      attemptId: randomUUID(),
      runId,
      providerRef: "provider:s6-reviewer",
      provider: "test",
      model: "model/s6-reviewer",
      maker: "maker:s6-reviewer",
      modelVersion: "v1",
      rawText: `s6-review-raw-${marker}`,
      metadata: {},
      parseStatus: "SCHEMA_FAILED",
      parseError: `Unexpected token near ${malformedProviderDetail}`,
      inputHash: "4".repeat(64),
      contractHash: "5".repeat(64),
      contentHash: "6".repeat(64)
    });
    const ledgerEntry = await ledger.append({
      runId,actionKind: "MODEL_CALL",callSiteKey: "s10.locator-proof",
      subjectItemId: authorArtifactId,stanceAtAction: "NEUTRAL",outcome: "OK",
      actorRef: "s10:locator-proof",inputHash: sharedLowEntropyDigestInput,
      contractHash: "s10:locator-proof",rawArtifactRef: authorArtifactId,
      startedAt: new Date("2026-08-23T00:00:00.000Z"),
      finishedAt: new Date("2026-08-23T00:00:01.000Z")
    });
    const critiquePacketId = await new CritiqueRepository(database.pool).recordCritiquePacket({
      runId,sourceArtifactRef: authorArtifactId,sourceContent: malformedProviderDetail,
      criticMaker: "maker:s10-critic",blindingApplied: "IDENTITY_STRIPPED",
      researchContextHash: sharedLowEntropyDigestInput,
      critiqueContextHash: sharedLowEntropyDigestInput,
      packetFingerprint: sharedLowEntropyDigestInput
    });
    const propagationRunId = randomUUID();
    await database.pool.query(
      `INSERT INTO ledger.propagation_run (
         propagation_run_id,run_id,input_hash,input_hash_version,contract_hash,
         graph_fingerprint,graph_fingerprint_version,arrow_order,cluster_records,
         operator_by_parent,transmission_reductions,lift_records,judgement_selection_rule,
         at_seq
       ) VALUES ($1,$2,$3,1,$4,$3,1,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,
         '[]'::jsonb,'[]'::jsonb,'{}'::jsonb,ledger.allocate_sequence())`,
      [propagationRunId,runId,sharedLowEntropyDigestInput,"7".repeat(64)]
    );
    const pipelineEventId = randomUUID();
    await database.pool.query(
      `INSERT INTO evaluator.pipeline_event (
         pipeline_event_id,run_id,pipeline,pipeline_version,attempt_id,state,reason,
         input_hash,input_hash_version,at_seq
       ) VALUES ($1,$2,'CONSUMER',1,$3,'STARTED','s10 locator matrix',$4,1,
         ledger.allocate_sequence())`,
      [pipelineEventId,runId,randomUUID(),sharedLowEntropyDigestInput]
    );

    const nodeClaim = `s6-node-${marker}`;
    const restatementText = `s6-restatement-${marker}`;
    const nodeId = await new GraphRepository(database.pool).withGraphWrite(runId, async (writer) => {
      const created = await writer.addNode({
        runId,
        statementText: nodeClaim,
        claimType: "unknown",
        parentNodeId: null,
        childKind: null,
        siblingOrdinal: 0,
        generationStatus: "complete",
        pathStatus: "active",
        explorationDecision: "continue",
        provenanceRef: authorArtifactId,
        wayOfKnowing: "REASONING",
        locator: null,
        valueLaden: false
      });
      await writer.addStrangerRestatement({
        nodeId: created,
        text: restatementText,
        checkStatus: "PASS"
      });
      return created;
    });
    const restatementId = (await database.pool.query<{ restatement_id: string }>(
      "SELECT restatement_id FROM core.stranger_restatement WHERE run_id=$1",
      [runId]
    )).rows[0]!.restatement_id;

    const reviewReasons = [`s6-review-reason-${marker}`];
    const nodeReviewId = await new JudgementRepository(database.pool).recordNodeReview({
      runId,
      nodeId,
      authorRawArtifactRef: authorArtifactId,
      reviewRawArtifactRef: reviewerArtifactId,
      outcome: "agree",
      reasons: reviewReasons
    });

    const factMarker = `s6-fact-${marker}`;
    const residualMarker = `s6-residual-${marker}`;
    const terminal = await persistTerminalRun({
      pool: database.pool,
      runId,
      fixtureKey: marker,
      factBundle: {
        facts: [factMarker],
        residualObjections: [residualMarker],
        badges: [],
        conditionMarks: ["DEFECT"],
        reversalPoint: `s6-reversal-${marker}`,
        buildsOnPrevious: { value: false, answerRef: null },
        memoryDisclosure: null
      }
    });
    const factBundleId = (await database.pool.query<{ fact_bundle_id: string }>(
      `SELECT fact_bundle_id FROM serve.answer
       WHERE answer_id=$1 ORDER BY answer_version DESC LIMIT 1`,
      [terminal.answerId]
    )).rows[0]!.fact_bundle_id;
    const composedTextId = randomUUID();
    const segmentMarker = `s6-segment-${marker}`;
    const storedSegments = [{
      segment_id: `segment-${marker}`,
      text: segmentMarker,
      load_bearing: true,
      served_number_refs: []
    }];
    const preparedComposed = await cipher.prepareRun(runId);
    const composedEnvelope = preparedComposed.encrypt(
      "serve.composed_text", composedTextId, { segments: storedSegments }
    );
    const composedAttestation = preparedComposed.attestEnvelope(
      "serve.composed_text",composedTextId,"content_ciphertext",composedEnvelope
    );
    preparedComposed.close();
    await database.pool.query(
      `INSERT INTO serve.composed_text (
         composed_text_id,fact_bundle_id,segments,raw_artifact_ref,attempt,
         content_ciphertext,content_attestation
       ) VALUES ($1,$2,'[]'::jsonb,$3,1,$4::jsonb,$5)`,
      [composedTextId, factBundleId, authorArtifactId, JSON.stringify(composedEnvelope),
        composedAttestation]
    );

    const evidence = new EvidenceRepository(database.pool);
    const sharedQueries = [
      { text: `s6-support-${marker}`, polarity: "SUPPORTING" as const, derivedFromQuestion: true },
      { text: `s6-disconfirm-${marker}`, polarity: "DISCONFIRMING" as const, derivedFromQuestion: true }
    ];
    const querySetId = await evidence.recordFrozenQuerySet({
      runId,
      version: 1,
      seeds: sharedQueries
    });
    const priorQuerySetId = await evidence.recordFrozenQuerySet({
      runId:priorRunId,
      version:1,
      seeds:sharedQueries
    });
    const frozenQuerySetLocator = (await database.pool.query<{ content_hash: string }>(
      "SELECT content_hash FROM evidence.query_set WHERE query_set_id=$1",[querySetId]
    )).rows[0]!.content_hash;

    const canonicalQuestion = runQuestion;
    const normalizedBindingMarker = `s6-memory-binding-${marker}`;
    const frozenTermMarker = `s6-memory-term-${marker}`;
    await new MemoryRepository(database.pool).recordQuestionAndMatch({
      key: {
        runId,
        canonicalQuestionText: canonicalQuestion,
        callerScope: "ASKER",
        askerScope: `owner:${ownerRef}`,
        settlementAct: null,
        questionType: null,
        declaredField: null,
        normalizedBinding: { subject: normalizedBindingMarker },
        frozenTerms: [frozenTermMarker],
        frozenQuerySetHash: frozenQuerySetLocator,
        asOf: "2026-08-23T00:00:00.000Z",
        policyVersion: 1,
        keyVersion: 1
      },
      decidedBy: "s6:matrix",
      ownership: { ownerRef, legacyAskerId: null }
    });
    const questionKeyId = (await database.pool.query<{ question_key_id: string }>(
      "SELECT question_key_id FROM memory.question_key WHERE run_id=$1",
      [runId]
    )).rows[0]!.question_key_id;
    const rawMemoryKey = (await database.pool.query<{
      normalized_binding: Record<string, string>;
      frozen_terms: string[];
      content_ciphertext: object;
    }>(
      `SELECT normalized_binding,frozen_terms,content_ciphertext
       FROM memory.question_key WHERE question_key_id=$1`,
      [questionKeyId]
    )).rows[0]!;
    expect(rawMemoryKey.normalized_binding).toEqual({});
    expect(rawMemoryKey.frozen_terms).toEqual([]);
    await expect(cipher.decrypt(
      runId, "memory.question_key", questionKeyId, rawMemoryKey.content_ciphertext as never
    )).resolves.toMatchObject({
      canonicalQuestionText: canonicalQuestion,
      normalizedBinding: { subject: normalizedBindingMarker },
      frozenTerms: [frozenTermMarker]
    });
    const memoryLinkId = randomUUID();
    await database.pool.query(
      `INSERT INTO memory.memory_link (
         memory_link_id,source_run_id,prior_run_id,relation,match_tier,agreed_fields,
         disagreed_fields,not_compared_fields,decided_by,decided_at,source_as_of,
         prior_as_of,source_policy_version,prior_policy_version,source_key_version,
         prior_key_version,alias_row_ids,prior_answer_id,at_seq
       ) VALUES ($1,$2,$3,'REPEATS','EXACT_QUESTION','[]'::jsonb,'[]'::jsonb,
         '[]'::jsonb,'s6:matrix',now(),now(),now(),1,1,1,1,'[]'::jsonb,$4,
         ledger.allocate_sequence())`,
      [memoryLinkId, runId, priorRunId, terminal.answerId]
    );
    const pullRecordId = randomUUID();
    const payloadSnapshot = { note: `s6-pull-${marker}` };
    const preparedPull = await cipher.prepareRun(runId);
    const pullEnvelope = preparedPull.encrypt(
      "memory.pull_record",pullRecordId,{ payloadSnapshot }
    );
    const pullAttestation = preparedPull.attestEnvelope(
      "memory.pull_record",pullRecordId,"content_ciphertext",pullEnvelope
    );
    preparedPull.close();
    await database.pool.query(
      `INSERT INTO memory.pull_record (
         pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,
         content_hash,content_hash_version,artifact_as_of,staleness_state_at_pull,asker_scope,
         payload_snapshot,register_row_key,register_version,register_source_ref,
         at_seq,content_ciphertext,content_attestation
       ) VALUES ($1,$2,'PRIOR_ANSWER',$3,1,NULL,2,now(),'FRESH',$4,
         '{"ciphertext":true,"v":1}'::jsonb,'s6:matrix',1,'s6:matrix',
         ledger.allocate_sequence(),$5::jsonb,$6)`,
      [pullRecordId,memoryLinkId,terminal.answerId,`owner:${ownerRef}`,
        JSON.stringify(pullEnvelope),pullAttestation]
    );
    const secondPullRecordId = randomUUID();
    const preparedSecondPull = await cipher.prepareRun(runId);
    const secondPullEnvelope = preparedSecondPull.encrypt(
      "memory.pull_record",secondPullRecordId,{ payloadSnapshot }
    );
    const secondPullAttestation = preparedSecondPull.attestEnvelope(
      "memory.pull_record",secondPullRecordId,"content_ciphertext",secondPullEnvelope
    );
    preparedSecondPull.close();
    await database.pool.query(
      `INSERT INTO memory.pull_record (
         pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,
         content_hash,content_hash_version,artifact_as_of,staleness_state_at_pull,asker_scope,
         payload_snapshot,register_row_key,register_version,register_source_ref,
         at_seq,content_ciphertext,content_attestation
       ) VALUES ($1,$2,'PRIOR_ANSWER',$3,1,NULL,2,now(),'FRESH',$4,
         '{"ciphertext":true,"v":1}'::jsonb,'s6:matrix:second',1,'s6:matrix:second',
         ledger.allocate_sequence(),$5::jsonb,$6)`,
      [secondPullRecordId,memoryLinkId,terminal.answerId,`owner:${ownerRef}`,
        JSON.stringify(secondPullEnvelope),secondPullAttestation]
    );
    const locatorReceipt = (await database.pool.query<{
      run_qbi: string | null;
      prior_qbi: string | null;
      memory_qbi: string | null;
      run_qbi_version: number;
      prior_qbi_version: number;
      memory_qbi_version: number;
      query_hash: string;
      prior_query_hash: string;
      memory_query_hash: string;
      query_hash_version: number;
      prior_query_hash_version: number;
      memory_query_hash_version: number;
      fact_hash: string;
      pull_hash: string;
      second_pull_hash: string;
      fact_hash_version: number;
      pull_hash_version: number;
      second_pull_hash_version: number;
      raw_input_hash: string;
      raw_content_hash: string;
      ledger_input_hash: string;
      raw_input_hash_version: number;
      raw_content_hash_version: number;
      ledger_input_hash_version: number;
      packet_fingerprint: string;
      research_hash: string;
      critique_hash: string;
      packet_fingerprint_version: number;
      research_hash_version: number;
      critique_hash_version: number;
      propagation_input_hash: string;
      propagation_graph_hash: string;
      propagation_input_hash_version: number;
      propagation_graph_hash_version: number;
      pipeline_input_hash: string;
      pipeline_input_hash_version: number;
    }>(`
      SELECT encode(run.question_blind_index,'hex') AS run_qbi,
        encode(prior.question_blind_index,'hex') AS prior_qbi,
        encode(question.question_blind_index,'hex') AS memory_qbi,
        run.question_blind_index_version AS run_qbi_version,
        prior.question_blind_index_version AS prior_qbi_version,
        question.question_blind_index_version AS memory_qbi_version,
        query.content_hash AS query_hash,
        prior_query.content_hash AS prior_query_hash,
        question.frozen_query_set_hash AS memory_query_hash,
        query.content_hash_version AS query_hash_version,
        prior_query.content_hash_version AS prior_query_hash_version,
        question.frozen_query_set_hash_version AS memory_query_hash_version,
        fact.content_hash AS fact_hash,pull.content_hash AS pull_hash,
        second_pull.content_hash AS second_pull_hash,
        fact.content_hash_version AS fact_hash_version,
        pull.content_hash_version AS pull_hash_version,
        second_pull.content_hash_version AS second_pull_hash_version,
        raw.input_hash AS raw_input_hash,raw.content_hash AS raw_content_hash,
        entry.input_hash AS ledger_input_hash,
        raw.input_hash_version AS raw_input_hash_version,
        raw.content_hash_version AS raw_content_hash_version,
        entry.input_hash_version AS ledger_input_hash_version,
        packet.packet_fingerprint,packet.research_context_hash AS research_hash,
        packet.critique_context_hash AS critique_hash,
        packet.packet_fingerprint_version,packet.research_context_hash_version AS research_hash_version,
        packet.critique_context_hash_version AS critique_hash_version,
        propagation.input_hash AS propagation_input_hash,
        propagation.graph_fingerprint AS propagation_graph_hash,
        propagation.input_hash_version AS propagation_input_hash_version,
        propagation.graph_fingerprint_version AS propagation_graph_hash_version,
        pipeline.input_hash AS pipeline_input_hash,
        pipeline.input_hash_version AS pipeline_input_hash_version
      FROM core.run AS run
      JOIN core.run AS prior ON prior.run_id=$2
      JOIN memory.question_key AS question ON question.run_id=run.run_id
      JOIN evidence.query_set AS query ON query.query_set_id=$3
      JOIN evidence.query_set AS prior_query ON prior_query.query_set_id=$9
      JOIN serve.fact_bundle AS fact ON fact.fact_bundle_id=$4
      JOIN memory.pull_record AS pull ON pull.pull_record_id=$5
      JOIN memory.pull_record AS second_pull ON second_pull.pull_record_id=$10
      JOIN ledger.raw_artifact AS raw ON raw.raw_artifact_id=$6
      JOIN ledger.ledger_entry AS entry ON entry.ledger_entry_id=$7
      JOIN core.critique_packet AS packet ON packet.critique_packet_id=$8
      JOIN ledger.propagation_run AS propagation ON propagation.propagation_run_id=$11
      JOIN evaluator.pipeline_event AS pipeline ON pipeline.pipeline_event_id=$12
      WHERE run.run_id=$1
    `,[runId,priorRunId,querySetId,factBundleId,pullRecordId,authorArtifactId,
      ledgerEntry.ledgerEntryId,critiquePacketId,priorQuerySetId,secondPullRecordId,
      propagationRunId,pipelineEventId])).rows[0]!;
    expect([
      locatorReceipt.run_qbi_version,locatorReceipt.prior_qbi_version,
      locatorReceipt.memory_qbi_version,locatorReceipt.query_hash_version,
      locatorReceipt.prior_query_hash_version,locatorReceipt.memory_query_hash_version,
      locatorReceipt.fact_hash_version,locatorReceipt.pull_hash_version,
      locatorReceipt.second_pull_hash_version,locatorReceipt.raw_input_hash_version,
      locatorReceipt.raw_content_hash_version,locatorReceipt.ledger_input_hash_version,
      locatorReceipt.packet_fingerprint_version,locatorReceipt.research_hash_version,
      locatorReceipt.critique_hash_version,locatorReceipt.propagation_input_hash_version,
      locatorReceipt.propagation_graph_hash_version,locatorReceipt.pipeline_input_hash_version
    ]).toEqual(Array(18).fill(2));
    expect([
      locatorReceipt.run_qbi,locatorReceipt.prior_qbi,locatorReceipt.memory_qbi
    ]).toEqual([null,null,null]);
    expect(new Set([
      locatorReceipt.query_hash,locatorReceipt.prior_query_hash,
      locatorReceipt.memory_query_hash,locatorReceipt.fact_hash,
      locatorReceipt.pull_hash,locatorReceipt.second_pull_hash
    ]).size).toBe(6);
    expect(new Set([
      locatorReceipt.raw_input_hash,locatorReceipt.raw_content_hash,
      locatorReceipt.ledger_input_hash,locatorReceipt.propagation_input_hash,
      locatorReceipt.propagation_graph_hash,locatorReceipt.pipeline_input_hash,
      locatorReceipt.packet_fingerprint,locatorReceipt.research_hash,
      locatorReceipt.critique_hash
    ]).size).toBe(9);
    expect(JSON.stringify(locatorReceipt)).not.toContain(sharedLowEntropyDigestInput);

    const investigationRequestId = randomUUID();
    const userInput = `s6-investigation-${marker}`;
    const preparedInvestigation = await cipher.prepareRun(runId);
    const investigationEnvelope = preparedInvestigation.encrypt(
      "core.investigation_request", investigationRequestId, { userInput }
    );
    const investigationAttestation = preparedInvestigation.attestEnvelope(
      "core.investigation_request",investigationRequestId,"content_ciphertext",
      investigationEnvelope
    );
    preparedInvestigation.close();
    await database.pool.query(
      `INSERT INTO core.investigation_request (
         investigation_request_id,run_id,answer_id,answer_version,gap_ref,user_input,
         input_kind,status,replay_handle,at_seq,content_ciphertext,content_attestation
       ) VALUES ($1,$2,$3,1,$4,$5,'HUMAN_STEER','RECORDED',$6,
         ledger.allocate_sequence(),$7::jsonb,$8)`,
      [investigationRequestId, runId, terminal.answerId, `gap-${marker}`,
        CONTENT_CIPHERTEXT_SENTINEL, `s6-investigation:${marker}`,
        JSON.stringify(investigationEnvelope),investigationAttestation]
    );

    const queryAmendmentId = await evidence.recordQueryAmendment({
      runId,
      querySetRef: querySetId,
      kind: "MECHANICAL_REPAIR",
      amendedQuery: `s6-amended-${marker}`,
      reason: `s6-amendment-reason-${marker}`
    });
    const sourceRef = await evidence.recordSource({
      runId,
      querySetRef: querySetId,
      locator: `https://s6.invalid/${marker}`,
      archivedVersion: "v1",
      retrievedAt: new Date("2026-08-23T00:00:00.000Z"),
      accessDepth: "OPENED_FULL",
      sourceRole: "PRIMARY"
    });
    const evidenceItemId = await evidence.recordEvidenceItem({
      runId,
      nodeId,
      sourceRef,
      excerpt: `s6-excerpt-${marker}`,
      excerptTruncated: false,
      truncationAtWordBoundary: false,
      relevance: "ON_SUBJECT",
      studyOrDatasetIdentity: null,
      sourceDomain: "s6.invalid",
      publisher: "s6",
      producingRunId: runId,
      modelFamily: "s6",
      archivedSourceVersion: "v1",
      retrievedAt: new Date("2026-08-23T00:00:00.000Z")
    });
    const absenceRowId = await evidence.recordAbsence({
      runId,
      querySetRef: querySetId,
      queryText: `s6-absence-query-${marker}`,
      scope: "s6:matrix",
      observedAt: new Date("2026-08-23T00:00:00.000Z"),
      reason: `s6-absence-reason-${marker}`
    });

    const factEnvelope = (await database.pool.query<{ content_ciphertext: object }>(
      "SELECT content_ciphertext FROM serve.fact_bundle WHERE fact_bundle_id=$1",
      [factBundleId]
    )).rows[0]!.content_ciphertext;
    const reviewerCarrier = (await database.pool.query<{
      parse_error: string;
      content_ciphertext: object;
    }>(
      "SELECT parse_error,content_ciphertext FROM ledger.raw_artifact WHERE raw_artifact_id=$1",
      [reviewerArtifactId]
    )).rows[0]!;
    expect(reviewerCarrier.parse_error).toBe("CONTENT_SCHEMA_FAILED");
    await expect(cipher.decrypt(
      runId,"ledger.raw_artifact",reviewerArtifactId,reviewerCarrier.content_ciphertext as never
    )).resolves.toMatchObject({ parseErrorDetail: `Unexpected token near ${malformedProviderDetail}` });
    const envelopes = [
      { carrier: "core.run" as const, id: runId, envelope: (await database.pool.query("SELECT content_ciphertext FROM core.run WHERE run_id=$1", [runId])).rows[0].content_ciphertext },
      { carrier: "core.node" as const, id: nodeId, envelope: (await database.pool.query("SELECT content_ciphertext FROM core.node WHERE node_id=$1", [nodeId])).rows[0].content_ciphertext },
      { carrier: "core.stranger_restatement" as const, id: restatementId, envelope: (await database.pool.query("SELECT content_ciphertext FROM core.stranger_restatement WHERE restatement_id=$1", [restatementId])).rows[0].content_ciphertext },
      { carrier: "ledger.raw_artifact" as const, id: authorArtifactId, envelope: (await database.pool.query("SELECT content_ciphertext FROM ledger.raw_artifact WHERE raw_artifact_id=$1", [authorArtifactId])).rows[0].content_ciphertext },
      { carrier: "serve.fact_bundle" as const, id: factBundleId, envelope: factEnvelope },
      { carrier: "serve.composed_text" as const, id: composedTextId, envelope: composedEnvelope },
      { carrier: "ledger.node_review" as const, id: nodeReviewId, envelope: (await database.pool.query("SELECT content_ciphertext FROM ledger.node_review WHERE node_review_id=$1", [nodeReviewId])).rows[0].content_ciphertext },
      { carrier: "memory.question_key" as const, id: questionKeyId, envelope: (await database.pool.query("SELECT content_ciphertext FROM memory.question_key WHERE question_key_id=$1", [questionKeyId])).rows[0].content_ciphertext },
      { carrier: "memory.pull_record" as const, id: pullRecordId, envelope: pullEnvelope },
      { carrier: "core.investigation_request" as const, id: investigationRequestId, envelope: investigationEnvelope },
      { carrier: "evidence.query_set" as const, id: querySetId, envelope: (await database.pool.query("SELECT content_ciphertext FROM evidence.query_set WHERE query_set_id=$1", [querySetId])).rows[0].content_ciphertext },
      { carrier: "evidence.query_amendment" as const, id: queryAmendmentId, envelope: (await database.pool.query("SELECT content_ciphertext FROM evidence.query_amendment WHERE query_amendment_id=$1", [queryAmendmentId])).rows[0].content_ciphertext },
      { carrier: "evidence.evidence_item" as const, id: evidenceItemId, envelope: (await database.pool.query("SELECT content_ciphertext FROM evidence.evidence_item WHERE evidence_item_id=$1", [evidenceItemId])).rows[0].content_ciphertext },
      { carrier: "evidence.absence_row" as const, id: absenceRowId, envelope: (await database.pool.query("SELECT content_ciphertext FROM evidence.absence_row WHERE absence_row_id=$1", [absenceRowId])).rows[0].content_ciphertext }
    ];
    expect(envelopes).toHaveLength(14);
    for (const item of envelopes) {
      await expect(cipher.decrypt(runId, item.carrier, item.id, item.envelope as never))
        .resolves.toBeTypeOf("object");
    }
    const nodeEnvelope = envelopes.find((item) => item.carrier === "core.node")!;
    await expect(cipher.decrypt(runId, "core.node", randomUUID(), nodeEnvelope.envelope as never))
      .rejects.toThrow("CRYPTO_AUTHENTICATION_FAILED");
    await expect(cipher.decrypt(
      runId, "ledger.raw_artifact", nodeId, nodeEnvelope.envelope as never
    )).rejects.toThrow("CRYPTO_AUTHENTICATION_FAILED");
    await expect(cipher.decrypt(
      priorRunId, "core.node", nodeId, nodeEnvelope.envelope as never
    )).rejects.toThrow("CRYPTO_AUTHENTICATION_FAILED");

    const plaintextMutations = [
      {
        carrier: "core.run",
        id: runId,
        sql: `INSERT INTO core.run
          SELECT (jsonb_populate_record(NULL::core.run, to_jsonb(source)
            || jsonb_build_object('question_line',$2::text))).*
          FROM core.run AS source WHERE run_id=$1`
      },
      {
        carrier: "core.node",
        id: nodeId,
        sql: `INSERT INTO core.node
          SELECT (jsonb_populate_record(NULL::core.node, to_jsonb(source)
            || jsonb_build_object('claim_text',$2::text))).*
          FROM core.node AS source WHERE node_id=$1`
      },
      {
        carrier: "core.stranger_restatement",
        id: restatementId,
        sql: `INSERT INTO core.stranger_restatement
          SELECT (jsonb_populate_record(NULL::core.stranger_restatement, to_jsonb(source)
            || jsonb_build_object('restatement_text',$2::text))).*
          FROM core.stranger_restatement AS source WHERE restatement_id=$1`
      },
      {
        carrier: "ledger.raw_artifact",
        id: authorArtifactId,
        sql: `INSERT INTO ledger.raw_artifact
          SELECT (jsonb_populate_record(NULL::ledger.raw_artifact, to_jsonb(source)
            || jsonb_build_object('raw_text',$2::text))).*
          FROM ledger.raw_artifact AS source WHERE raw_artifact_id=$1`
      },
      {
        carrier: "serve.fact_bundle",
        id: factBundleId,
        sql: `INSERT INTO serve.fact_bundle
          SELECT (jsonb_populate_record(NULL::serve.fact_bundle, to_jsonb(source)
            || jsonb_build_object('facts',jsonb_build_array($2::text)))).*
          FROM serve.fact_bundle AS source WHERE fact_bundle_id=$1`
      },
      {
        carrier: "serve.composed_text",
        id: composedTextId,
        sql: `INSERT INTO serve.composed_text
          SELECT (jsonb_populate_record(NULL::serve.composed_text, to_jsonb(source)
            || jsonb_build_object('segments',jsonb_build_array($2::text)))).*
          FROM serve.composed_text AS source WHERE composed_text_id=$1`
      },
      {
        carrier: "ledger.node_review",
        id: nodeReviewId,
        sql: `INSERT INTO ledger.node_review
          SELECT (jsonb_populate_record(NULL::ledger.node_review, to_jsonb(source)
            || jsonb_build_object('reasons',jsonb_build_array($2::text)))).*
          FROM ledger.node_review AS source WHERE node_review_id=$1`
      },
      {
        carrier: "memory.question_key",
        id: questionKeyId,
        sql: `INSERT INTO memory.question_key
          SELECT (jsonb_populate_record(NULL::memory.question_key, to_jsonb(source)
            || jsonb_build_object('canonical_question_text',$2::text))).*
          FROM memory.question_key AS source WHERE question_key_id=$1`
      },
      {
        carrier: "memory.pull_record",
        id: pullRecordId,
        sql: `INSERT INTO memory.pull_record
          SELECT (jsonb_populate_record(NULL::memory.pull_record, to_jsonb(source)
            || jsonb_build_object('payload_snapshot',jsonb_build_object('plaintext',$2::text)))).*
          FROM memory.pull_record AS source WHERE pull_record_id=$1`
      },
      {
        carrier: "core.investigation_request",
        id: investigationRequestId,
        sql: `INSERT INTO core.investigation_request
          SELECT (jsonb_populate_record(NULL::core.investigation_request, to_jsonb(source)
            || jsonb_build_object('user_input',$2::text))).*
          FROM core.investigation_request AS source WHERE investigation_request_id=$1`
      },
      {
        carrier: "evidence.query_set",
        id: querySetId,
        sql: `INSERT INTO evidence.query_set
          SELECT (jsonb_populate_record(NULL::evidence.query_set, to_jsonb(source)
            || jsonb_build_object('queries',jsonb_build_array($2::text)))).*
          FROM evidence.query_set AS source WHERE query_set_id=$1`
      },
      {
        carrier: "evidence.query_amendment",
        id: queryAmendmentId,
        sql: `INSERT INTO evidence.query_amendment
          SELECT (jsonb_populate_record(NULL::evidence.query_amendment, to_jsonb(source)
            || jsonb_build_object('amended_query',$2::text))).*
          FROM evidence.query_amendment AS source WHERE query_amendment_id=$1`
      },
      {
        carrier: "evidence.evidence_item",
        id: evidenceItemId,
        sql: `INSERT INTO evidence.evidence_item
          SELECT (jsonb_populate_record(NULL::evidence.evidence_item, to_jsonb(source)
            || jsonb_build_object('excerpt',$2::text))).*
          FROM evidence.evidence_item AS source WHERE evidence_item_id=$1`
      },
      {
        carrier: "evidence.absence_row",
        id: absenceRowId,
        sql: `INSERT INTO evidence.absence_row
          SELECT (jsonb_populate_record(NULL::evidence.absence_row, to_jsonb(source)
            || jsonb_build_object('query_text',$2::text))).*
          FROM evidence.absence_row AS source WHERE absence_row_id=$1`
      }
    ] as const;
    expect(plaintextMutations).toHaveLength(14);
    for (const mutation of plaintextMutations) {
      await expect(database.pool.query(mutation.sql, [
        mutation.id, `s6-plaintext-mutation-${mutation.carrier}-${marker}`
      ])).rejects.toThrow(`CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ${mutation.carrier}`);
    }

    const persisted = await database.pool.query<{ body: string }>(
      `SELECT string_agg(row_text,' ') AS body FROM (
         SELECT to_jsonb(run)::text AS row_text FROM core.run AS run WHERE run_id=$1
         UNION ALL SELECT to_jsonb(node)::text FROM core.node AS node WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM core.stranger_restatement AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM ledger.raw_artifact AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM serve.fact_bundle AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM serve.composed_text AS value
           JOIN serve.fact_bundle AS bundle USING (fact_bundle_id) WHERE bundle.run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM ledger.node_review AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM memory.question_key AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM memory.pull_record AS value
           JOIN memory.memory_link AS link USING (memory_link_id) WHERE link.source_run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM core.investigation_request AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM evidence.query_set AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM evidence.query_amendment AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM evidence.evidence_item AS value WHERE run_id=$1
         UNION ALL SELECT to_jsonb(value)::text FROM evidence.absence_row AS value WHERE run_id=$1
       ) AS carrier_rows`,
      [runId]
    );
    for (const plaintext of [
      runQuestion, rawText, nodeClaim, restatementText, factMarker, residualMarker,
      segmentMarker, reviewReasons[0]!, canonicalQuestion, normalizedBindingMarker,
      frozenTermMarker, payloadSnapshot.note, userInput,
      `s6-support-${marker}`, `s6-amended-${marker}`, `s6-excerpt-${marker}`,
      `s6-absence-query-${marker}`,malformedProviderDetail,sharedLowEntropyDigestInput
    ]) expect(persisted.rows[0]!.body).not.toContain(plaintext);

    const serve = new ServeRepository(database.pool);
    const projection = await serve.readAnswerProjection(
      terminal.answerId,
      { ownerRef, legacyAskerId: null }
    );
    expect(projection).toMatchObject({
      run_ref: runId,
      question_line: runQuestion,
      residual_objections: [residualMarker]
    });
    await expect(serve.readReviewCatchUpSource(runId)).resolves.toMatchObject({
      answerId:terminal.answerId,answer:{ run_ref:runId }
    });
    await expect(serve.readAnswerIndex(
      { ownerRef,legacyAskerId:null },100,0
    )).resolves.toMatchObject({
      items:expect.arrayContaining([expect.objectContaining({
        answer_id:terminal.answerId,run_ref:runId
      })])
    });

    await database.pool.query("CHECKPOINT");
    const dataDirectory = (await database.pool.query<{ data_directory: string }>(
      "SHOW data_directory"
    )).rows[0]!.data_directory;
    await assertPostgresDataScanReadable(database.pool,dataDirectory);
    for (const plaintext of [
      runQuestion, rawText, canonicalQuestion, normalizedBindingMarker, frozenTermMarker, userInput,
      malformedProviderDetail,sharedLowEntropyDigestInput
    ]) {
      await expect(scanPostgresData(dataDirectory,plaintext)).resolves.toMatchObject({
        contains:false
      });
    }

    await cipher.destroyRunKey(runId);
    for (const item of envelopes) {
      await expect(cipher.decrypt(runId, item.carrier, item.id, item.envelope as never))
        .rejects.toThrow("RUN_CONTENT_KEY_UNRESOLVED");
    }
    const rowCount = await database.pool.query<{ count: string }>(
      `SELECT (
         (SELECT count(*) FROM core.run WHERE run_id=$1)
         + (SELECT count(*) FROM core.node WHERE run_id=$1)
         + (SELECT count(*) FROM core.stranger_restatement WHERE run_id=$1)
         + (SELECT count(*) FROM ledger.raw_artifact WHERE run_id=$1)
         + (SELECT count(*) FROM serve.fact_bundle WHERE run_id=$1)
         + (SELECT count(*) FROM serve.composed_text AS value
            JOIN serve.fact_bundle AS bundle USING (fact_bundle_id) WHERE bundle.run_id=$1)
         + (SELECT count(*) FROM ledger.node_review WHERE run_id=$1)
         + (SELECT count(*) FROM memory.question_key WHERE run_id=$1)
         + (SELECT count(*) FROM memory.pull_record AS value
            JOIN memory.memory_link AS link USING (memory_link_id) WHERE link.source_run_id=$1)
         + (SELECT count(*) FROM core.investigation_request WHERE run_id=$1)
         + (SELECT count(*) FROM evidence.query_set WHERE run_id=$1)
         + (SELECT count(*) FROM evidence.query_amendment WHERE run_id=$1)
         + (SELECT count(*) FROM evidence.evidence_item WHERE run_id=$1)
         + (SELECT count(*) FROM evidence.absence_row WHERE run_id=$1)
       )::text AS count`,
      [runId]
    );
    expect(Number(rowCount.rows[0]?.count)).toBeGreaterThanOrEqual(14);
    expect(nestedPoolQueries).toEqual([]);
    } finally {
      querySpy.mockRestore();
      connectSpy.mockRestore();
    }
  });
});
