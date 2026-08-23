import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek,
  type LoadedRunContentKey,
  type RunContentKeyIdentity,
  type RunContentKeyStore
} from "../../packages/crypto/src/index.js";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  configureContentEncryption,
  createPool,
  migrate,
  RunRepository
} from "@debateai/db";
import { EvidenceRepository } from "../../packages/evidence/src/index.js";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { MemoryRepository } from "@debateai/memory";
import { ServeRepository } from "@debateai/serve";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const { Pool: PgPool } = pg;

class TrackingRunContentKeyStore implements RunContentKeyStore {
  readonly storedRunIds: string[] = [];
  readonly destroyedRunIds: string[] = [];
  failNextDestroy = false;
  operationObserver: ((operation: "store" | "load" | "destroy") => void) | undefined;

  constructor(private readonly delegate: RunContentKeyStore) {}

  async store(runId: string, identity: RunContentKeyIdentity, key: Uint8Array): Promise<void> {
    this.operationObserver?.("store");
    await this.delegate.store(runId, identity, key);
    this.storedRunIds.push(runId);
  }

  load(runId: string): Promise<LoadedRunContentKey> {
    this.operationObserver?.("load");
    return this.delegate.load(runId);
  }

  async destroy(runId: string): Promise<void> {
    this.operationObserver?.("destroy");
    if (this.failNextDestroy) {
      this.failNextDestroy = false;
      throw new Error("SECRET_STORE_DELETE_FAILED");
    }
    await this.delegate.destroy(runId);
    this.destroyedRunIds.push(runId);
  }
}

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let keys: TrackingRunContentKeyStore;
let cipher: ContentCipher;
let ownerResolverObserver: (() => void) | undefined;

async function createActiveUser(): Promise<void> {
  userId = randomUUID();
  ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x73), `s6-${randomUUID()}`, randomUUID(), ownerRef]
  );
}

async function createEncryptedRun(questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startRun(serverRunInput(questionLine));
}

function serverRunInput(
  questionLine: string
): Parameters<RunRepository["startRun"]>[0] {
  return {
    questionLine,
    askContract: { audience: "private-test" },
    principal: { kind: "server", userId, ownerRef },
    sessionId: randomUUID(),
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

async function postgresDataContains(root: string, needle: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  const target = Buffer.from(needle, "utf8");
  for (const entry of entries) {
    const location = join(root, entry.name);
    if (entry.isDirectory()) {
      if (await postgresDataContains(location, needle)) return true;
    } else if (entry.isFile() && (await readFile(location)).includes(target)) {
      return true;
    }
  }
  return false;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-s6-content-"));
  await createActiveUser();
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
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
  cipher = new ContentCipher(keys, Buffer.alloc(32, 0x6a));
  configureContentEncryption(database.pool, cipher);
}, 120_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("S6 content encryption on disposable PostgreSQL", () => {
  it("keeps the default-off RunRepository compatible with a pre-0038 schema", async () => {
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
      expect(await repository.readLoadingProjection(runId, {
        ownerRef: null,
        legacyAskerId
      })).toMatchObject({ runRef: runId, questionLine });
      expect(await repository.readFrozenHead(runId)).toMatchObject({ runId, questionLine });
      expect((await pre0038.pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM information_schema.columns
         WHERE table_schema='core' AND table_name='run'
           AND column_name IN ('content_encryption_version','question_blind_index','content_ciphertext')`
      )).rows[0]?.count).toBe("0");
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

  it("writes an encrypted run head and decrypts it at the repository boundary", async () => {
    const question = `S6 private question ${randomUUID()}`;
    const runId = await createEncryptedRun(question);
    const raw = await database.pool.query<{
      question_line: string;
      ask_contract: unknown;
      content_encryption_version: number;
      question_blind_index: Buffer;
      content_ciphertext: unknown;
    }>(
      `SELECT question_line,ask_contract,content_encryption_version,
              question_blind_index,content_ciphertext
       FROM core.run WHERE run_id=$1`,
      [runId]
    );
    expect(raw.rows[0]).toMatchObject({
      question_line: CONTENT_CIPHERTEXT_SENTINEL,
      ask_contract: { ciphertext: true, v: 1 },
      content_encryption_version: 1
    });
    expect(raw.rows[0]!.question_blind_index).toHaveLength(32);
    expect(JSON.stringify(raw.rows[0]!.content_ciphertext)).not.toContain(question);
    await expect(new RunRepository(database.pool).readFrozenHead(runId))
      .resolves.toMatchObject({ runId, questionLine: question });
  });

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

  it("destroys a provisioned run key when the SQL transaction rolls back", async () => {
    const storedBefore = keys.storedRunIds.length;
    await expect(new RunRepository(database.pool).startRun({
      questionLine: `S6 rollback ${randomUUID()}`,
      principal: { kind: "server", userId, ownerRef },
      sessionId: randomUUID(),
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
      sessionId: randomUUID(),
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
      connect(): Promise<{
        query: (...args: unknown[]) => Promise<unknown>;
      }>;
    };
    const connect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await connect();
      const query = client.query.bind(client);
      client.query = async (...args: unknown[]) => {
        const result = await query(...args);
        if (String(args[0]).trim() === "COMMIT") {
          client.query = query;
          throw Object.assign(new Error("s6 transport details must not escape"), { code: "ECONNRESET" });
        }
        return result;
      };
      return client;
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
      connectSpy.mockRestore();
      await repositoryPool.end();
    }
  });

  it("performs provisioning, initial encryption, key loading, and owner resolution before BEGIN", async () => {
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
    const pool = repositoryPool as unknown as {
      connect(): Promise<{
        query: (...args: unknown[]) => Promise<unknown>;
      }>;
    };
    const connect = pool.connect.bind(pool);
    const connectSpy = vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await connect();
      const query = client.query.bind(client);
      client.query = async (...args: unknown[]) => {
        const sql = String(args[0]);
        const result = await query(...args);
        if (sql.trim() === "BEGIN") transactionOpen = true;
        if (/FROM identity\."user"[\s\S]*FOR UPDATE/.test(sql)) identityLockHeld = true;
        if (sql.trim() === "COMMIT" || sql.trim() === "ROLLBACK") {
          transactionOpen = false;
          identityLockHeld = false;
          client.query = query;
        }
        return result;
      };
      return client;
    });
    try {
      await new RunRepository(repositoryPool).startRun(serverRunInput(`S6 ordering ${randomUUID()}`));
    } finally {
      connectSpy.mockRestore();
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
    for (const forbidden of [
      frozenTerms[0]!, bindingField, `binding:${bindingField}`, "frozenTerms:1", "sharedTermCount"
    ]) {
      await expect(postgresDataContains(dataDirectory, forbidden)).resolves.toBe(false);
    }
  });

  it("does not decrypt a candidate after a queued ownership change wins its short lock", async () => {
    const marker = randomUUID();
    const canonicalQuestionText = `s6 candidate ownership race ${marker}`;
    const priorRunId = await createEncryptedRun(`s6 candidate race prior ${marker}`);
    await persistAcceptedTerminal(priorRunId, `candidate-race-${marker}`);
    const questionKeyId = randomUUID();
    const wrongPrimaryKey = randomUUID();
    const relocatedEnvelope = await cipher.encrypt(
      priorRunId,
      "memory.question_key",
      wrongPrimaryKey,
      { canonicalQuestionText, normalizedBinding: {}, frozenTerms: [] }
    );
    await database.pool.query(
      `INSERT INTO memory.question_key (
         question_key_id,run_id,canonical_question_text,caller_scope,asker_scope,
         settlement_act,question_type,declared_field,normalized_binding,frozen_terms,
         frozen_query_set_hash,as_of,policy_version,key_version,at_seq,
         question_blind_index,content_ciphertext
       ) VALUES ($1,$2,$3,'ASKER',$4,NULL,NULL,NULL,'{}'::jsonb,'[]'::jsonb,
         NULL,now(),1,1,ledger.allocate_sequence(),$5,$6::jsonb)`,
      [
        questionKeyId,
        priorRunId,
        CONTENT_CIPHERTEXT_SENTINEL,
        `owner:${ownerRef}`,
        cipher.questionBlindIndex(ownerRef, canonicalQuestionText),
        JSON.stringify(relocatedEnvelope)
      ]
    );
    const currentRunId = await createEncryptedRun(`s6 candidate race current ${marker}`);
    const foreignOwnerRef = await createForeignOwnerRef();
    const blocker = await database.pool.connect();
    const claimant = await database.pool.connect();
    let claim: Promise<unknown> | undefined;
    let matching: Promise<Awaited<ReturnType<MemoryRepository["recordQuestionAndMatch"]>>> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [priorRunId]);
      await claimant.query("BEGIN");
      claim = claimant.query(
        "SELECT core.append_run_ownership_event($1,$2) AS at_seq",
        [priorRunId, foreignOwnerRef]
      );
      matching = new MemoryRepository(database.pool).recordQuestionAndMatch({
        key: {
          runId: currentRunId,
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
        decidedBy: "s6:candidate-ownership-race",
        ownership: { ownerRef, legacyAskerId: null }
      });
      let lockWaiters = 0;
      for (let attempt = 0; attempt < 60 && lockWaiters < 2; attempt += 1) {
        lockWaiters = Number((await database.pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE wait_event_type='Lock'
             AND (query LIKE '%append_run_ownership_event%'
               OR query LIKE '%core.run WHERE run_id=$1 FOR UPDATE%')`
        )).rows[0]!.count);
        if (lockWaiters < 2) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(lockWaiters).toBeGreaterThanOrEqual(2);
      await blocker.query("COMMIT");
      await claim;
      await claimant.query("COMMIT");
      await expect(matching).resolves.toBeNull();
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await claimant.query("ROLLBACK").catch(() => undefined);
      await claim?.catch(() => undefined);
      await matching?.catch(() => undefined);
      blocker.release();
      claimant.release();
    }
    expect((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM memory.memory_link WHERE source_run_id=$1",
      [currentRunId]
    )).rows[0]!.count).toBe("0");
  }, 60_000);

  it("drops a selected match when ownership changes before the final deterministic lock", async () => {
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
    let currentRunId = await createEncryptedRun(`s6 final race current ${marker}`);
    for (let attempt = 0; attempt < 32 && currentRunId >= priorRunId; attempt += 1) {
      currentRunId = await createEncryptedRun(`s6 final race current retry ${attempt} ${marker}`);
    }
    expect(currentRunId < priorRunId).toBe(true);
    const foreignOwnerRef = await createForeignOwnerRef();
    const blocker = await database.pool.connect();
    let matching: Promise<Awaited<ReturnType<MemoryRepository["recordQuestionAndMatch"]>>> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [currentRunId]);
      matching = memory.recordQuestionAndMatch({
        key: {
          runId: currentRunId,
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
      });
      let finalLockWaiters = 0;
      for (let attempt = 0; attempt < 60 && finalLockWaiters < 1; attempt += 1) {
        finalLockWaiters = Number((await database.pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE wait_event_type='Lock'
             AND query LIKE '%run_id=ANY($1::uuid[])%ORDER BY run_id FOR UPDATE%'`
        )).rows[0]!.count);
        if (finalLockWaiters < 1) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(finalLockWaiters).toBeGreaterThanOrEqual(1);
      await database.pool.query(
        "SELECT core.append_run_ownership_event($1,$2) AS at_seq",
        [priorRunId, foreignOwnerRef]
      );
      await blocker.query("COMMIT");
      await expect(matching).resolves.toBeNull();
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await matching?.catch(() => undefined);
      blocker.release();
    }
    expect((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM memory.memory_link WHERE source_run_id=$1",
      [currentRunId]
    )).rows[0]!.count).toBe("0");
  }, 60_000);

  it("completes concurrent encrypted graph writes through a bounded one-connection pool", async () => {
    const boundedPool = new PgPool({
      connectionString: database.connectionString,
      max: 1,
      connectionTimeoutMillis: 750
    });
    configureContentEncryption(boundedPool, cipher);
    try {
      const repository = new RunRepository(boundedPool);
      const runIds = [
        await repository.startRun(serverRunInput(`S6 bounded graph A ${randomUUID()}`)),
        await repository.startRun(serverRunInput(`S6 bounded graph B ${randomUUID()}`))
      ];
      expect(boundedPool.totalCount).toBe(1);
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
      expect(boundedPool.totalCount).toBe(1);
      expect(boundedPool.waitingCount).toBe(0);
    } finally {
      await boundedPool.end();
    }
  });

  it("round-trips every physical carrier and shreds all eleven logical groups while rows persist", async () => {
    const marker = randomUUID();
    const runQuestion = `s6-run-${marker}`;
    const runId = await createEncryptedRun(runQuestion);
    const priorRunId = await createEncryptedRun(`s6-prior-${marker}`);
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
      inputHash: "1".repeat(64),
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
      parseStatus: "PARSED",
      inputHash: "4".repeat(64),
      contractHash: "5".repeat(64),
      contentHash: "6".repeat(64)
    });

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
    const composedEnvelope = await cipher.encrypt(
      runId, "serve.composed_text", composedTextId, { segments: storedSegments }
    );
    await database.pool.query(
      `INSERT INTO serve.composed_text (
         composed_text_id,fact_bundle_id,segments,raw_artifact_ref,attempt,content_ciphertext
       ) VALUES ($1,$2,'[]'::jsonb,$3,1,$4::jsonb)`,
      [composedTextId, factBundleId, authorArtifactId, JSON.stringify(composedEnvelope)]
    );

    const canonicalQuestion = `s6-memory-question-${marker}`;
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
        frozenQuerySetHash: null,
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
    const pullEnvelope = await cipher.encrypt(
      runId, "memory.pull_record", pullRecordId, { payloadSnapshot }
    );
    await database.pool.query(
      `INSERT INTO memory.pull_record (
         pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,
         content_hash,artifact_as_of,staleness_state_at_pull,asker_scope,
         payload_snapshot,register_row_key,register_version,register_source_ref,
         at_seq,content_ciphertext
       ) VALUES ($1,$2,'PRIOR_ANSWER',$3,1,$4,now(),'FRESH',$5,
         '{"ciphertext":true,"v":1}'::jsonb,'s6:matrix',1,'s6:matrix',
         ledger.allocate_sequence(),$6::jsonb)`,
      [pullRecordId, memoryLinkId, terminal.answerId, "7".repeat(64),
        `owner:${ownerRef}`, JSON.stringify(pullEnvelope)]
    );

    const investigationRequestId = randomUUID();
    const userInput = `s6-investigation-${marker}`;
    const investigationEnvelope = await cipher.encrypt(
      runId, "core.investigation_request", investigationRequestId, { userInput }
    );
    await database.pool.query(
      `INSERT INTO core.investigation_request (
         investigation_request_id,run_id,answer_id,answer_version,gap_ref,user_input,
         input_kind,status,replay_handle,at_seq,content_ciphertext
       ) VALUES ($1,$2,$3,1,$4,$5,'HUMAN_STEER','RECORDED',$6,
         ledger.allocate_sequence(),$7::jsonb)`,
      [investigationRequestId, runId, terminal.answerId, `gap-${marker}`,
        CONTENT_CIPHERTEXT_SENTINEL, `s6-investigation:${marker}`,
        JSON.stringify(investigationEnvelope)]
    );

    const evidence = new EvidenceRepository(database.pool);
    const querySetId = await evidence.recordFrozenQuerySet({
      runId,
      version: 1,
      seeds: [
        { text: `s6-support-${marker}`, polarity: "SUPPORTING", derivedFromQuestion: true },
        { text: `s6-disconfirm-${marker}`, polarity: "DISCONFIRMING", derivedFromQuestion: true }
      ]
    });
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
      `s6-absence-query-${marker}`
    ]) expect(persisted.rows[0]!.body).not.toContain(plaintext);

    const projection = await new ServeRepository(database.pool).readAnswerProjection(
      terminal.answerId,
      { ownerRef, legacyAskerId: null }
    );
    expect(projection).toMatchObject({
      run_ref: runId,
      question_line: runQuestion,
      residual_objections: [residualMarker]
    });

    await database.pool.query("CHECKPOINT");
    const dataDirectory = (await database.pool.query<{ data_directory: string }>(
      "SHOW data_directory"
    )).rows[0]!.data_directory;
    for (const plaintext of [
      runQuestion, rawText, canonicalQuestion, normalizedBindingMarker, frozenTermMarker, userInput
    ]) {
      await expect(postgresDataContains(dataDirectory, plaintext)).resolves.toBe(false);
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
