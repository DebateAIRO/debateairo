import { readFile, readdir } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CSRF_COOKIE_NAME,
  PostgresAskApplication,
  SESSION_COOKIE_NAME,
  buildApi
} from "@debateai/api";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";
import { RunRepository, configureContentEncryption, migrate } from "@debateai/db";
import { GraphRepository } from "@debateai/graph";
import { JudgementRepository } from "@debateai/judgement";
import { LedgerRepository } from "@debateai/ledger";
import { LivenessRepository } from "@debateai/liveness";
import { ServeRepository } from "@debateai/serve";
import type { Session } from "@debateai/contract";
import {
  ContentCipher,
  MemoryRunContentKeyStore,
  appendAuditEvent,
  generateDek,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import {
  createTestAskAdmissionPoolFacades,startTestDatabase,type TestDatabase
} from "../support/testDatabase.js";

const ORIGIN = "https://ui.s7.test";
const OWNER_TOKEN = "o".repeat(43);
const FOREIGN_TOKEN = "f".repeat(43);
const OWNER_CSRF = "c".repeat(43);
const FOREIGN_CSRF = "d".repeat(43);
const GAP_REF = "gap:s7-owner";

interface IdentityFixture {
  readonly userId: string;
  readonly ownerRef: string;
  readonly auditToken: string;
  readonly pseudonym: string;
  readonly email: string;
  readonly blindHex: string;
  readonly auth: AuthenticatedSession;
  readonly csrf: string;
}

interface RunFixture {
  readonly runId: string;
  readonly answerId: string;
  readonly nodeId: string;
}

let database: TestDatabase;
let api: ReturnType<typeof buildApi>;
let owner: IdentityFixture;
let foreign: IdentityFixture;
let owned: RunFixture;
let foreignRun: RunFixture;
let priorOwned: RunFixture;
let memoryLinkId: string;
let foreignMemoryLinkId: string;
let contentCipher: ContentCipher;
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

function serverSession(ownerRef: string): Session {
  return Object.freeze({
    asker_id: `owner:${ownerRef}`,
    session_id: randomUUID(),
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  });
}

async function createIdentity(label: string, token: string, csrf: string): Promise<IdentityFixture> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const pseudonym = `s7-${label}-${randomUUID()}`;
  const email = `${label}-${randomUUID()}@s7.invalid`;
  const blind = Buffer.from(label.padEnd(32, label[0] ?? "x").slice(0, 32));
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, blind, pseudonym, auditToken, ownerRef]
  );
  const session = serverSession(ownerRef);
  userIdsByOwnerRef.set(ownerRef, userId);
  await users.store(userId, generateDek());
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [session.session_id,userId,`sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
  return Object.freeze({
    userId, ownerRef, auditToken, pseudonym, email, blindHex: blind.toString("hex"), csrf,
    auth: Object.freeze({
      session, userId, ownerRef, tokenHash: `hash:${token}`, csrfTokenHash: `hash:${csrf}`, authKind: "cookie"
    })
  });
}

async function createOwnedRunHead(identity: IdentityFixture, label: string): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: `S7 ${label} authorization fixture`,
    principal: { kind: "server", userId: identity.userId, ownerRef: identity.ownerRef },
    sessionId: identity.auth.session.session_id,
    callerScope: "ASKER",
    asOf: new Date("2026-08-23T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: `s7:${label}`,
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "s7-idor" },
    registerVersion: 1,
    batteryVersion: "s7-idor",
    batteryRows: []
  });
}

async function createOwnedTerminalRun(identity: IdentityFixture, label: string): Promise<RunFixture> {
  const runId = await createOwnedRunHead(identity, label);
  const rawArtifactId = randomUUID();
  await new LedgerRepository(database.pool).appendRawArtifact({
    artifactId: rawArtifactId,
    attemptId: randomUUID(),
    runId,
    providerRef: "provider:s7",
    provider: "test-layer",
    model: "fixture/model",
    maker: "fixture-maker",
    modelVersion: "fixture-version",
    rawText: `non-personal S7 ${label} node artifact`,
    metadata: {},
    parseStatus: "UNPARSED",
    inputHash: "1".repeat(64),
    contractHash: "2".repeat(64),
    contentHash: "3".repeat(64)
  });
  const graph = new GraphRepository(database.pool);
  const nodeId = await graph.withGraphWrite(runId, async (writer) => {
    const created = await writer.addNode({
      runId,
      statementText: `S7 ${label} judged node`,
      claimType: "unknown",
      parentNodeId: null,
      childKind: null,
      siblingOrdinal: 0,
      generationStatus: "complete",
      pathStatus: "active",
      explorationDecision: "continue",
      provenanceRef: rawArtifactId,
      wayOfKnowing: "REASONING",
      locator: null,
      valueLaden: false
    });
    await writer.addStrangerRestatement({ nodeId: created, text: `S7 ${label} restatement`, checkStatus: "PASS" });
    return created;
  });
  await new JudgementRepository(database.pool).record({
    runId,
    nodeId,
    rawArtifactRef: rawArtifactId,
    tau: 0.72,
    numberKind: "probability",
    producer: "judgement:s7-test",
    wayOfKnowing: "REASONING"
  });
  const { answerId } = await persistTerminalRun({
    pool: database.pool,
    runId,
    fixtureKey: `s7-${label}`,
    factBundle: {
      facts: [`fact:s7:${label}`],
      residualObjections: [],
      badges: [],
      conditionMarks: [],
      reversalPoint: `reversal:s7:${label}`,
      buildsOnPrevious: { value: false, answerRef: null },
      memoryDisclosure: null
    }
  });
  return Object.freeze({ runId, answerId, nodeId });
}

function cookieHeaders(identity: IdentityFixture, mutating = false): Record<string, string> {
  const sessionToken = identity === owner ? OWNER_TOKEN : FOREIGN_TOKEN;
  return {
    cookie: [
      `${SESSION_COOKIE_NAME}=${sessionToken}`,
      ...(mutating ? [`${CSRF_COOKIE_NAME}=${identity.csrf}`] : [])
    ].join("; "),
    ...(mutating ? { origin: ORIGIN, "x-csrf-token": identity.csrf } : {})
  };
}

async function seedMemoryLink(source: RunFixture, priorAnswer: RunFixture, linkOwnerRef: string): Promise<string> {
  const prior = await database.pool.query<{ content_hash: string; as_of: Date }>(
    `SELECT bundle.content_hash,run.as_of
     FROM serve.answer AS answer
     JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id=answer.fact_bundle_id
     JOIN core.run AS run ON run.run_id=answer.run_id
     WHERE answer.answer_id=$1`,
    [priorAnswer.answerId]
  );
  const inserted = await database.pool.query<{ memory_link_id: string }>(
    `INSERT INTO memory.memory_link (
       source_run_id,prior_run_id,relation,match_tier,agreed_fields,disagreed_fields,
       not_compared_fields,decided_by,decided_at,source_as_of,prior_as_of,
       source_policy_version,prior_policy_version,source_key_version,prior_key_version,
       alias_row_ids,prior_answer_id,at_seq
     ) VALUES (
       $1,$2,'REPEATS','EXACT_QUESTION','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,
       's7:database-match',now(),$3,$3,1,1,1,1,'[]'::jsonb,$4,ledger.allocate_sequence()
     ) RETURNING memory_link_id`,
    [source.runId, priorAnswer.runId, prior.rows[0]!.as_of, priorAnswer.answerId]
  );
  const id = inserted.rows[0]!.memory_link_id;
  await database.pool.query(
    `INSERT INTO memory.memory_link_event (memory_link_id,state,actor_ref,reason,at_seq)
     VALUES ($1,'LINKED','s7:database-match','S7_REAL_PG_FIXTURE',ledger.allocate_sequence())`,
    [id]
  );
  const pullRecordId = randomUUID();
  const payloadSnapshot = {
    runId: priorAnswer.runId,
    questionLine: "S7 prior authorization fixture",
    verdict: null,
    confidenceBand: null
  };
  const preparedContent=await contentCipher.prepareRun(source.runId);
  const pullEnvelope=preparedContent.encrypt(
    "memory.pull_record",pullRecordId,{ payloadSnapshot }
  );
  const pullAttestation=preparedContent.attestEnvelope(
    "memory.pull_record",pullRecordId,"content_ciphertext",pullEnvelope
  );
  preparedContent.close();
  await database.pool.query(
    `INSERT INTO memory.pull_record (
       pull_record_id,memory_link_id,artifact_kind,artifact_id,artifact_version,content_hash,artifact_as_of,
       staleness_state_at_pull,asker_scope,payload_snapshot,register_row_key,
       register_version,register_source_ref,at_seq,content_ciphertext,content_attestation,
       content_hash_version
     ) VALUES (
       $1,$2,'PRIOR_ANSWER',$3,1,$4,$5,'FRESH',$6,'{"ciphertext":true,"v":1}'::jsonb,
       's7:memory-pull',1,'s7:real-pg',ledger.allocate_sequence(),$7::jsonb,$8,2
     )`,
    [pullRecordId,id, priorAnswer.answerId, prior.rows[0]!.content_hash,
      prior.rows[0]!.as_of,`owner:${linkOwnerRef}`,JSON.stringify(pullEnvelope),pullAttestation]
  );
  return id;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  contentCipher = new ContentCipher(new MemoryRunContentKeyStore(
    users,
    async (candidateOwnerRef) => {
      const candidateUserId = userIdsByOwnerRef.get(candidateOwnerRef);
      if (candidateUserId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return candidateUserId;
    }
  ));
  configureContentEncryption(database.pool, contentCipher);
  owner = await createIdentity("owner", OWNER_TOKEN, OWNER_CSRF);
  foreign = await createIdentity("foreign", FOREIGN_TOKEN, FOREIGN_CSRF);
  owned = await createOwnedTerminalRun(owner, "owned");
  foreignRun = await createOwnedTerminalRun(foreign, "foreign");
  priorOwned = await createOwnedTerminalRun(owner, "prior");
  await database.pool.query(
    `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
     VALUES ($1,ledger.allocate_sequence(),'honesty.investigation_gap_opened',$2::jsonb)`,
    [owned.runId, JSON.stringify({
      gap_ref: GAP_REF,
      gap: "An owner may request deeper investigation.",
      verdict: "UNDER-EXPLORED",
      why: "The test fixture leaves a bounded question open.",
      effort_grade: "bounded",
      constructed_prompt: "Investigate the bounded S7 fixture gap.",
      accepts_user_input: true,
      model_authored: true
    })]
  );
  await database.pool.query(
    `INSERT INTO core.run_progress_event (run_id,at_seq,kind,value_json)
     VALUES ($1,ledger.allocate_sequence(),'honesty.investigation_gap_opened',$2::jsonb)`,
    [foreignRun.runId, JSON.stringify({
      gap_ref: GAP_REF,
      gap: "A foreign owner may request deeper investigation.",
      verdict: "UNDER-EXPLORED",
      why: "The foreign fixture must be valid behind the ownership gate.",
      effort_grade: "bounded",
      constructed_prompt: "Investigate the bounded foreign S7 fixture gap.",
      accepts_user_input: true,
      model_authored: true
    })]
  );
  memoryLinkId = await seedMemoryLink(owned, priorOwned, owner.ownerRef);
  foreignMemoryLinkId = await seedMemoryLink(foreignRun, owned, foreign.ownerRef);
  const sessionsByToken = new Map([
    [OWNER_TOKEN, owner.auth],
    [FOREIGN_TOKEN, foreign.auth]
  ]);
  const sessions = {
    authenticate: async (token: string) => sessionsByToken.get(token) ?? null,
    verifyCsrf: (authenticated: AuthenticatedSession, supplied: string) =>
      supplied === (authenticated.userId === owner.userId ? OWNER_CSRF : FOREIGN_CSRF)
  } as unknown as SessionApplication;
  api = buildApi({
    application:new PostgresAskApplication(
      database.pool,{} as never,{} as never,undefined,database.pool,
      createTestAskAdmissionPoolFacades(database.pool)
    ),
    sessions,
    allowedOrigin: ORIGIN
  });
}, 120_000);

afterAll(async () => {
  await api?.close();
  await database?.stop();
});

describe("S7 real PostgreSQL ownership and IDOR boundary", () => {
  it("persists one opaque owner event atomically and enforces database invariants", async () => {
    const row = await database.pool.query<{
      asker_id: string;
      owner_ref: string;
      audit_token: string;
      event_count: string;
    }>(
      `SELECT run.asker_id,identity_user.owner_ref,identity_user.audit_token,
              count(event.*)::text AS event_count
       FROM core.run AS run
       JOIN core.run_ownership_event AS event ON event.run_id=run.run_id
       JOIN identity."user" AS identity_user ON identity_user.owner_ref=event.owner_ref
       WHERE run.run_id=$1
       GROUP BY run.asker_id,identity_user.owner_ref,identity_user.audit_token`,
      [owned.runId]
    );
    expect(row.rows[0]).toEqual({
      asker_id: `owner:${owner.ownerRef}`,
      owner_ref: owner.ownerRef,
      audit_token: owner.auditToken,
      event_count: "1"
    });
    expect(owner.ownerRef).not.toBe(owner.auditToken);
    expect(owner.ownerRef).not.toBe(owner.userId);
    expect(owner.auditToken).not.toBe(owner.userId);
    expect(owner.ownerRef).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const invalidIdentityInsert = (auditToken: string, ownerRef: string, fill: number, userId = randomUUID()) => database.pool.query(
      `INSERT INTO identity."user" (
         user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,
         password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
       ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
      [userId, Buffer.alloc(32, fill), `s7-invalid-${randomUUID()}`, auditToken, ownerRef]
    );
    const reused = randomUUID();
    await expect(invalidIdentityInsert(reused, reused, 0xa1))
      .rejects.toThrow(/identity_user_owner_ref_distinct_from_audit/);
    const ownerUserCollision = randomUUID();
    await expect(invalidIdentityInsert(randomUUID(), ownerUserCollision, 0xa2, ownerUserCollision))
      .rejects.toThrow(/identity_user_owner_ref_distinct_from_user_id/);
    const auditUserCollision = randomUUID();
    await expect(invalidIdentityInsert(auditUserCollision, randomUUID(), 0xa3, auditUserCollision))
      .rejects.toThrow(/identity_user_audit_token_distinct_from_user_id/);
    await expect(invalidIdentityInsert(randomUUID(), "11111111-1111-1111-8111-111111111111", 0xa4))
      .rejects.toThrow(/identity_user_owner_ref_uuid_v4/);
    await expect(database.pool.query(
      `SELECT core.append_run_ownership_event($1,'11111111-1111-1111-8111-111111111111')`,
      [owned.runId]
    )).rejects.toThrow(/RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE/);
    await expect(database.pool.query(
      `SELECT core.append_run_ownership_event($1,$2)`,
      [owned.runId, foreign.ownerRef]
    )).rejects.toThrow(/ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP/);
    await expect(database.pool.query(
      `UPDATE identity."user" SET owner_ref=$2 WHERE user_id=$1`, [owner.userId, randomUUID()]
    )).rejects.toThrow(/IDENTITY_OWNER_REF_IMMUTABLE/);
    await expect(database.pool.query(
      `UPDATE core.run_ownership_event SET at_seq=at_seq WHERE run_id=$1`, [owned.runId]
    )).rejects.toThrow(/append-only|immutable/);
    await expect(database.pool.query(
      `DELETE FROM core.run_ownership_event WHERE run_id=$1`, [owned.runId]
    )).rejects.toThrow(/append-only|immutable/);
    await expect(database.pool.query("TRUNCATE core.run_ownership_event"))
      .rejects.toThrow(/append-only|immutable/);
    const grants = await database.pool.query<{
      runtime_select: boolean;
      runtime_insert: boolean;
      runtime_update: boolean;
      runtime_delete: boolean;
      runtime_truncate: boolean;
      runtime_execute: boolean;
      runtime_append: boolean;
      replay_schema: boolean;
      replay_select: boolean;
      public_execute: boolean;
      public_append: boolean;
      identity_fk_count: string;
    }>(
      `SELECT
        has_table_privilege('debateai_runtime','core.run_ownership_event','SELECT') AS runtime_select,
        has_table_privilege('debateai_runtime','core.run_ownership_event','INSERT') AS runtime_insert,
        has_table_privilege('debateai_runtime','core.run_ownership_event','UPDATE') AS runtime_update,
        has_table_privilege('debateai_runtime','core.run_ownership_event','DELETE') AS runtime_delete,
        has_table_privilege('debateai_runtime','core.run_ownership_event','TRUNCATE') AS runtime_truncate,
        has_function_privilege('debateai_runtime','core.run_is_owned_by(uuid,uuid,text)','EXECUTE') AS runtime_execute,
        has_function_privilege('debateai_runtime','core.append_run_ownership_event(uuid,uuid)','EXECUTE') AS runtime_append,
        has_schema_privilege('debateai_replay','core','USAGE') AS replay_schema,
        has_table_privilege('debateai_replay','core.run_ownership_event','SELECT') AS replay_select,
        coalesce((SELECT bool_or(grantee='PUBLIC' AND privilege_type='EXECUTE')
          FROM information_schema.routine_privileges
          WHERE routine_schema='core' AND routine_name='run_is_owned_by'),false) AS public_execute,
        coalesce((SELECT bool_or(grantee='PUBLIC' AND privilege_type='EXECUTE')
          FROM information_schema.routine_privileges
          WHERE routine_schema='core' AND routine_name='append_run_ownership_event'),false) AS public_append,
        (SELECT count(*)::text FROM information_schema.table_constraints AS constraint_row
         JOIN information_schema.constraint_column_usage AS usage
           ON usage.constraint_name=constraint_row.constraint_name
          AND usage.constraint_schema=constraint_row.constraint_schema
         WHERE constraint_row.table_schema='core'
           AND constraint_row.table_name='run_ownership_event'
           AND constraint_row.constraint_type='FOREIGN KEY'
           AND usage.table_schema='identity') AS identity_fk_count`
    );
    expect(grants.rows[0]).toEqual({
      runtime_select: true,
      runtime_insert: false,
      runtime_update: false,
      runtime_delete: false,
      runtime_truncate: false,
      runtime_execute: true,
      runtime_append: false,
      replay_schema: true,
      replay_select: true,
      public_execute: false,
      public_append: false,
      identity_fk_count: "0"
    });

    const runtimeClient = await database.pool.connect();
    try {
      await runtimeClient.query("SET ROLE debateai_runtime");
      await expect(runtimeClient.query(
        `INSERT INTO core.run_ownership_event (run_id,owner_ref,at_seq)
         VALUES ($1,$2,1)`,
        [owned.runId, owner.ownerRef]
      )).rejects.toThrow(/permission denied/);
      await runtimeClient.query("BEGIN");
      await expect(runtimeClient.query<{ run_id: string }>(
        `INSERT INTO core.run (
           question_line,asker_id,session_id,caller_scope,as_of,
           asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
           composition_budget_tier,depth_params,agent_count,discovered_panel,
           stranger_sample_rate,envelope_basis,register_version,battery_version,
           ask_contract,created_at_seq
         ) SELECT
           $1,$2,$3,caller_scope,as_of,
           asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
           composition_budget_tier,depth_params,agent_count,discovered_panel,
           stranger_sample_rate,envelope_basis,register_version,battery_version,
           ask_contract,ledger.allocate_sequence()
         FROM core.run WHERE run_id=$4
         RETURNING run_id`,
        [
          `S7 runtime-role ownership ${randomUUID()}`,
          `owner:${owner.ownerRef}`,
          `session:s7-runtime-${randomUUID()}`,
          owned.runId
        ]
      )).rejects.toThrow(/permission denied/);
      await runtimeClient.query("ROLLBACK");
    } finally {
      await runtimeClient.query("ROLLBACK").catch(() => undefined);
      await runtimeClient.query("RESET ROLE").catch(() => undefined);
      runtimeClient.release();
    }

    const replayClient = await database.pool.connect();
    try {
      await replayClient.query("SET ROLE debateai_replay");
      const replayed = await replayClient.query<{ owner_ref: string }>(
        `SELECT owner_ref::text FROM core.run_ownership_event
         WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1`,
        [owned.runId]
      );
      expect(replayed.rows[0]?.owner_ref).toBe(owner.ownerRef);
    } finally {
      await replayClient.query("RESET ROLE").catch(() => undefined);
      replayClient.release();
    }

    const beforeAtomic = Number((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.run_ownership_event WHERE owner_ref=$1`, [owner.ownerRef]
    )).rows[0]!.count);
    const failedQuestion = `S7 atomic rollback ${randomUUID()}`;
    await expect(new RunRepository(database.pool).startRun({
      questionLine: failedQuestion,
      principal: { kind: "server", userId: owner.userId, ownerRef: owner.ownerRef },
      sessionId: owner.auth.session.session_id,
      callerScope: "ASKER",
      asOf: new Date("2026-08-23T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "s7:atomic-rollback",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { source: "s7-atomic-rollback" },
      registerVersion: 1,
      batteryVersion: "s7-atomic-rollback",
      batteryRows: [{
        batteryRowId: "INVALID",
        predicateRef: "s7:force-post-owner-event-failure",
        openingState: "ACTIVE",
        predicateInputs: {},
        skipEvidence: null
      }]
    })).rejects.toThrow();
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.run WHERE question_line=$1`, [failedQuestion]
    )).rows[0]!.count).toBe("0");
    expect(Number((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.run_ownership_event WHERE owner_ref=$1`, [owner.ownerRef]
    )).rows[0]!.count)).toBe(beforeAtomic);
  });

  it("uses exact legacy fallback only until the first event, then latest owner wins", async () => {
    const legacy = `asker:s7-legacy-${randomUUID()}`;
    const runId = await new RunRepository(database.pool).startRun({
      questionLine: "S7 latest-wins ownership fixture",
      principal: { kind: "legacy", legacyAskerId: legacy },
      sessionId: `session:${randomUUID()}`,
      callerScope: "ASKER",
      asOf: new Date("2026-08-23T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "s7:legacy",
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { source: "s7-latest" },
      registerVersion: 1,
      batteryVersion: "s7-latest",
      batteryRows: []
    });
    const owns = async (ownerRef: string | null, legacyAskerId: string | null) =>
      (await database.pool.query<{ owned: boolean }>(
        `SELECT core.run_is_owned_by($1,$2,$3) AS owned`, [runId, ownerRef, legacyAskerId]
      )).rows[0]!.owned;
    await expect(owns(null, legacy)).resolves.toBe(true);
    await expect(owns(null, `${legacy}:foreign`)).resolves.toBe(false);
    await database.pool.query(
      `SELECT core.append_run_ownership_event($1,$2) AS at_seq`, [runId, owner.ownerRef]
    );
    await expect(owns(null, legacy)).resolves.toBe(false);
    await expect(owns(owner.ownerRef, null)).resolves.toBe(true);
    await database.pool.query(
      `SELECT core.append_run_ownership_event($1,$2) AS at_seq`, [runId, foreign.ownerRef]
    );
    await expect(owns(owner.ownerRef, null)).resolves.toBe(false);
    await expect(owns(foreign.ownerRef, null)).resolves.toBe(true);
  });

  it("serves the owner and makes foreign-valid and absent resources exactly indistinguishable on all ten routes", async () => {
    const absentRunId = randomUUID();
    const absentAnswerId = randomUUID();
    const absentNodeId = randomUUID();
    const ownerHeaders = cookieHeaders(owner);
    const ownerMutationHeaders = cookieHeaders(owner, true);

    const index = await api.inject({ method: "GET", url: "/v1/answers?limit=20&offset=0", headers: ownerHeaders });
    expect(index.statusCode).toBe(200);
    const indexBody = index.json<{ total: number; items: Array<{ answer_id: string }>; open_runs: Array<{ run_ref: string }> }>();
    expect(indexBody.total).toBe(2);
    expect(indexBody.items.map((item) => item.answer_id)).toEqual(expect.arrayContaining([owned.answerId, priorOwned.answerId]));
    expect(JSON.stringify(indexBody)).not.toContain(foreignRun.answerId);
    expect(JSON.stringify(indexBody)).not.toContain(foreignRun.runId);

    const paired = async (foreignUrl: string, absentUrl: string, expectedBody: unknown) => {
      const [foreignResponse, absentResponse] = await Promise.all([
        api.inject({ method: "GET", url: foreignUrl, headers: ownerHeaders }),
        api.inject({ method: "GET", url: absentUrl, headers: ownerHeaders })
      ]);
      expect(foreignResponse.statusCode).toBe(404);
      expect(absentResponse.statusCode).toBe(404);
      expect(foreignResponse.json()).toEqual(expectedBody);
      expect(absentResponse.json()).toEqual(expectedBody);
      expect(foreignResponse.body).toBe(absentResponse.body);
      return foreignResponse;
    };

    expect((await api.inject({ method: "GET", url: `/v1/answers/${owned.answerId}?version=1`, headers: ownerHeaders })).statusCode).toBe(200);
    await paired(`/v1/answers/${foreignRun.answerId}?version=1`, `/v1/answers/${absentAnswerId}?version=1`, { error: "ANSWER_NOT_FOUND" });
    expect((await api.inject({ method: "GET", url: `/v1/answers/${owned.answerId}?version=2`, headers: ownerHeaders })).json())
      .toEqual({ error: "ANSWER_NOT_FOUND" });

    expect((await api.inject({ method: "GET", url: `/v1/answers/${owned.answerId}/inspection?version=1`, headers: ownerHeaders })).statusCode).toBe(200);
    await paired(`/v1/answers/${foreignRun.answerId}/inspection?version=1`, `/v1/answers/${absentAnswerId}/inspection?version=1`, { error: "INSPECTION_NOT_FOUND" });
    const missingInspectionVersion = await api.inject({
      method: "GET", url: `/v1/answers/${owned.answerId}/inspection?version=2`, headers: ownerHeaders
    });
    expect(missingInspectionVersion.statusCode).toBe(404);
    expect(missingInspectionVersion.json()).toEqual({ error: "INSPECTION_NOT_FOUND" });

    expect((await api.inject({ method: "GET", url: `/v1/answers/${owned.answerId}/nodes/${owned.nodeId}`, headers: ownerHeaders })).statusCode).toBe(200);
    await paired(`/v1/answers/${foreignRun.answerId}/nodes/${foreignRun.nodeId}`, `/v1/answers/${absentAnswerId}/nodes/${foreignRun.nodeId}`, { error: "NODE_NOT_FOUND" });
    await paired(`/v1/answers/${owned.answerId}/nodes/${foreignRun.nodeId}`, `/v1/answers/${owned.answerId}/nodes/${absentNodeId}`, { error: "NODE_NOT_FOUND" });

    expect((await api.inject({ method: "GET", url: `/v1/answers/${owned.answerId}/ledger-digest`, headers: ownerHeaders })).statusCode).toBe(200);
    await paired(`/v1/answers/${foreignRun.answerId}/ledger-digest`, `/v1/answers/${absentAnswerId}/ledger-digest`, { error: "LEDGER_DIGEST_NOT_FOUND" });

    const investigationCount = async () => Number((await database.pool.query<{ count: string }>(
      "SELECT count(*) FROM core.investigation_request"
    )).rows[0]!.count);
    const beforeInvestigations = await investigationCount();
    const foreignInvestigationsBefore = Number((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.investigation_request WHERE run_id=$1`, [foreignRun.runId]
    )).rows[0]!.count);
    const [foreignInvestigation, absentInvestigation] = await Promise.all([
      api.inject({ method: "POST", url: `/v1/answers/${foreignRun.answerId}/investigations/${GAP_REF}`,
        headers: ownerMutationHeaders, payload: { user_input: "bounded input", human_steer_input: true } }),
      api.inject({ method: "POST", url: `/v1/answers/${absentAnswerId}/investigations/${GAP_REF}`,
        headers: ownerMutationHeaders, payload: { user_input: "bounded input", human_steer_input: true } })
    ]);
    expect(foreignInvestigation.statusCode).toBe(404);
    expect(absentInvestigation.statusCode).toBe(404);
    expect(foreignInvestigation.body).toBe(absentInvestigation.body);
    expect(await investigationCount()).toBe(beforeInvestigations);
    expect(Number((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.investigation_request WHERE run_id=$1`, [foreignRun.runId]
    )).rows[0]!.count)).toBe(foreignInvestigationsBefore);
    const missingGap = await api.inject({
      method: "POST", url: `/v1/answers/${owned.answerId}/investigations/gap:s7-absent`,
      headers: ownerMutationHeaders, payload: { user_input: "bounded input", human_steer_input: true }
    });
    expect(missingGap.statusCode).toBe(404);
    expect(missingGap.body).toBe(foreignInvestigation.body);
    expect(await investigationCount()).toBe(beforeInvestigations);
    expect((await api.inject({ method: "POST", url: `/v1/answers/${owned.answerId}/investigations/${GAP_REF}`,
      headers: ownerMutationHeaders, payload: { user_input: "bounded input", human_steer_input: true } })).statusCode).toBe(202);

    const unlinkCount = async () => Number((await database.pool.query<{ count: string }>(
      "SELECT count(*) FROM memory.memory_link_event"
    )).rows[0]!.count);
    const beforeUnlinks = await unlinkCount();
    const foreignLinkEventsBefore = Number((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM memory.memory_link_event WHERE memory_link_id=$1`, [foreignMemoryLinkId]
    )).rows[0]!.count);
    const [foreignUnlink, absentUnlink] = await Promise.all([
      api.inject({ method: "POST", url: `/v1/answers/${foreignRun.answerId}/memory-link/unlink`, headers: ownerMutationHeaders }),
      api.inject({ method: "POST", url: `/v1/answers/${absentAnswerId}/memory-link/unlink`, headers: ownerMutationHeaders })
    ]);
    expect(foreignUnlink.statusCode).toBe(404);
    expect(absentUnlink.statusCode).toBe(404);
    expect(foreignUnlink.body).toBe(absentUnlink.body);
    expect(await unlinkCount()).toBe(beforeUnlinks);
    expect(Number((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM memory.memory_link_event WHERE memory_link_id=$1`, [foreignMemoryLinkId]
    )).rows[0]!.count)).toBe(foreignLinkEventsBefore);
    const ownerUnlink = await api.inject({ method: "POST", url: `/v1/answers/${owned.answerId}/memory-link/unlink`, headers: ownerMutationHeaders });
    expect(ownerUnlink.statusCode).toBe(200);
    expect(ownerUnlink.json()).toEqual({ memory_link_id: memoryLinkId, state: "UNLINKED" });
    const alreadyUnlinked = await api.inject({
      method: "POST", url: `/v1/answers/${owned.answerId}/memory-link/unlink`, headers: ownerMutationHeaders
    });
    expect(alreadyUnlinked.statusCode).toBe(404);
    expect(alreadyUnlinked.body).toBe(foreignUnlink.body);

    expect((await api.inject({ method: "GET", url: `/v1/runs/${owned.runId}`, headers: ownerHeaders })).statusCode).toBe(200);
    await paired(`/v1/runs/${foreignRun.runId}`, `/v1/runs/${absentRunId}`, { error: "RUN_NOT_FOUND" });

    const ownedEvents = await api.inject({ method: "GET", url: `/v1/runs/${owned.runId}/events`, headers: ownerHeaders });
    expect(ownedEvents.statusCode).toBe(200);
    expect(ownedEvents.headers["content-type"]).toContain("text/event-stream");
    expect(ownedEvents.body).toContain("event: run.terminal");
    const deniedEvents = await paired(`/v1/runs/${foreignRun.runId}/events`, `/v1/runs/${absentRunId}/events`, { error: "RUN_NOT_FOUND" });
    expect(deniedEvents.headers["content-type"]).not.toContain("text/event-stream");

    expect((await api.inject({ method: "GET", url: `/v1/runs/${owned.runId}/answer`, headers: ownerHeaders })).statusCode).toBe(200);
    await paired(`/v1/runs/${foreignRun.runId}/answer`, `/v1/runs/${absentRunId}/answer`, { error: "ANSWER_NOT_SERVED" });
    const openRunId = await createOwnedRunHead(owner, "open-no-answer");
    expect((await api.inject({ method: "GET", url: `/v1/runs/${openRunId}`, headers: ownerHeaders })).statusCode).toBe(200);
    const noServedAnswer = await api.inject({ method: "GET", url: `/v1/runs/${openRunId}/answer`, headers: ownerHeaders });
    expect(noServedAnswer.statusCode).toBe(404);
    expect(noServedAnswer.json()).toEqual({ error: "ANSWER_NOT_SERVED" });
  }, 60_000);

  it("serializes a rejected encrypted ownership transfer on the run lock without changing the owner", async () => {
    const claimedRunId = await createOwnedRunHead(owner, "claim-race");
    const mutator = await database.pool.connect();
    const claimant = await database.pool.connect();
    let mutationSequence = 0;
    let claim: Promise<unknown> | undefined;
    try {
      await mutator.query("BEGIN");
      await mutator.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [claimedRunId]);
      const ownedAfterLock = await mutator.query<{ owned: boolean }>(
        `SELECT core.run_is_owned_by($1,$2,NULL) AS owned`, [claimedRunId, owner.ownerRef]
      );
      expect(ownedAfterLock.rows[0]!.owned).toBe(true);
      await claimant.query("BEGIN");
      await claimant.query("SET LOCAL statement_timeout='5s'");
      const claimantPid = (await claimant.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      claim = claimant.query(
        `SELECT core.append_run_ownership_event($1,$2)::text AS at_seq`, [claimedRunId, foreign.ownerRef]
      );
      let waitType: string | null = null;
      for (let attempt = 0; attempt < 20 && waitType !== "Lock"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        waitType = (await database.pool.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [claimantPid]
        )).rows[0]?.wait_event_type ?? null;
      }
      expect(waitType).toBe("Lock");
      // The claimant is queued on the run without holding the global sequence
      // allocator. This allocation would form a deterministic 40P01 cycle if
      // the append path allocated before acquiring the run lock.
      const recorded = await mutator.query<{ at_seq: string }>(
        `INSERT INTO core.question_liveness_event (run_id,kind,occurred_at,at_seq)
         VALUES ($1,'QUERY',now(),ledger.allocate_sequence()) RETURNING at_seq`, [claimedRunId]
      );
      mutationSequence = Number(recorded.rows[0]!.at_seq);
      await mutator.query("COMMIT");
      await expect(claim).rejects.toThrow(/ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP/);
      await claimant.query("ROLLBACK");
    } finally {
      await mutator.query("ROLLBACK").catch(() => undefined);
      await claimant.query("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(claim === undefined ? [] : [claim]);
      mutator.release();
      claimant.release();
    }
    expect(mutationSequence).toBeGreaterThan(0);
    const ownership = await database.pool.query<{ owner_ref: string; count: string }>(
      `SELECT min(owner_ref::text) AS owner_ref,count(*)::text AS count
       FROM core.run_ownership_event WHERE run_id=$1`,
      [claimedRunId]
    );
    expect(ownership.rows[0]).toEqual({ owner_ref: owner.ownerRef, count: "1" });
    expect((await database.pool.query<{ owned: boolean }>(
      `SELECT core.run_is_owned_by($1,$2,NULL) AS owned`, [claimedRunId, owner.ownerRef]
    )).rows[0]!.owned).toBe(true);
  }, 60_000);

  it("keeps a same-owner append lock compatible with allocator-first child foreign keys", async () => {
    const runId = await createOwnedRunHead(owner, `implicit-fk-cycle-${randomUUID()}`);
    const mutator = await database.pool.connect();
    const claimant = await database.pool.connect();
    let claim: Promise<unknown> | undefined;
    let mutationSequence = 0;
    let claimSequence = 0;
    try {
      await mutator.query("BEGIN");
      await mutator.query("SET LOCAL statement_timeout='5s'");
      mutationSequence = Number((await mutator.query<{ at_seq: string }>(
        "SELECT ledger.allocate_sequence()::text AS at_seq"
      )).rows[0]!.at_seq);

      await claimant.query("BEGIN");
      await claimant.query("SET LOCAL statement_timeout='5s'");
      const claimantPid = (await claimant.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      )).rows[0]!.pid;
      claim = claimant.query<{ at_seq: string }>(
        `SELECT core.append_run_ownership_event($1,$2)::text AS at_seq`,
        [runId, owner.ownerRef]
      ).then((result) => {
        claimSequence = Number(result.rows[0]!.at_seq);
      });
      let claimWait: string | null = null;
      for (let attempt = 0; attempt < 30 && claimWait !== "Lock"; attempt += 1) {
        claimWait = (await database.pool.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [claimantPid]
        )).rows[0]?.wait_event_type ?? null;
        if (claimWait !== "Lock") await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(claimWait).toBe("Lock");

      // This INSERT acquires an implicit KEY SHARE on core.run after the
      // mutator already holds the global allocator. FOR UPDATE in the claim
      // creates a 40P01 cycle here; NO KEY UPDATE is intentionally compatible.
      await mutator.query(
        `INSERT INTO core.question_liveness_event (run_id,kind,occurred_at,at_seq)
         VALUES ($1,'QUERY',now(),$2)`,
        [runId, mutationSequence]
      );
      await mutator.query("COMMIT");
      await claim;
      await claimant.query("COMMIT");
    } finally {
      await mutator.query("ROLLBACK").catch(() => undefined);
      await claimant.query("ROLLBACK").catch(() => undefined);
      await Promise.allSettled(claim === undefined ? [] : [claim]);
      mutator.release();
      claimant.release();
    }
    expect(claimSequence).toBeGreaterThan(mutationSequence);
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.question_liveness_event WHERE run_id=$1`, [runId]
    )).rows[0]!.count).toBe("2");
  }, 60_000);

  it("fails a privileged direct append fast instead of holding the allocator in a cycle", async () => {
    const runId = await createOwnedRunHead(owner, `direct-append-nowait-${randomUUID()}`);
    const mutator = await database.pool.connect();
    const directWriter = await database.pool.connect();
    try {
      await mutator.query("BEGIN");
      await mutator.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);

      await directWriter.query("BEGIN");
      const directSequence = (await directWriter.query<{ at_seq: string }>(
        "SELECT ledger.allocate_sequence()::text AS at_seq"
      )).rows[0]!.at_seq;
      await expect(directWriter.query(
        `INSERT INTO core.run_ownership_event (run_id,owner_ref,at_seq)
         VALUES ($1,$2,$3)`,
        [runId, owner.ownerRef, directSequence]
      )).rejects.toThrow(/could not obtain lock/i);
      await directWriter.query("ROLLBACK");

      await expect(mutator.query("SELECT ledger.allocate_sequence() AS at_seq")).resolves.toBeDefined();
      await mutator.query("COMMIT");
    } finally {
      await directWriter.query("ROLLBACK").catch(() => undefined);
      await mutator.query("ROLLBACK").catch(() => undefined);
      directWriter.release();
      mutator.release();
    }
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.run_ownership_event WHERE run_id=$1`, [runId]
    )).rows[0]!.count).toBe("1");
  }, 60_000);

  it("keeps S10-style severance on the run-to-identity lock order", async () => {
    const deleting = await createIdentity("s10-lock-order", "z".repeat(43), "w".repeat(43));
    const runId = await createOwnedRunHead(deleting, `s10-lock-order-${randomUUID()}`);
    const severer = await database.pool.connect();
    const claimant = await database.pool.connect();
    let claim: Promise<unknown> | undefined;
    try {
      await severer.query("BEGIN");
      await severer.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);

      await claimant.query("BEGIN");
      const claimantPid = (await claimant.query<{ pid: number }>(
        "SELECT pg_backend_pid() AS pid"
      )).rows[0]!.pid;
      claim = claimant.query(
        `SELECT core.append_run_ownership_event($1,$2) AS at_seq`,
        [runId, deleting.ownerRef]
      );
      let waitType: string | null = null;
      for (let attempt = 0; attempt < 30 && waitType !== "Lock"; attempt += 1) {
        waitType = (await database.pool.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [claimantPid]
        )).rows[0]?.wait_event_type ?? null;
        if (waitType !== "Lock") await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(waitType).toBe("Lock");
      await severer.query(`DELETE FROM identity."user" WHERE user_id=$1`, [deleting.userId]);
      await severer.query("COMMIT");
      await expect(claim).rejects.toThrow(/RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE/);
      await claimant.query("ROLLBACK");
    } finally {
      await Promise.allSettled(claim === undefined ? [] : [claim]);
      await claimant.query("ROLLBACK").catch(() => undefined);
      await severer.query("ROLLBACK").catch(() => undefined);
      claimant.release();
      severer.release();
    }
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.run_ownership_event WHERE run_id=$1`, [runId]
    )).rows[0]!.count).toBe("1");
  }, 60_000);

  it("locks every matching run before allocation while a rejected transfer is queued", async () => {
    const label = `queued-claim-liveness-${randomUUID()}`;
    const question = `S7 ${label} authorization fixture`;
    const survivingRunId = await createOwnedRunHead(owner, label);
    const claimedRunId = await createOwnedRunHead(owner, label);
    const blocker = await database.pool.connect();
    const claimant = await database.pool.connect();
    const access = { ownerRef: owner.ownerRef, legacyAskerId: null } as const;
    let livenessResult = -1;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT run_id FROM core.run WHERE run_id=$1 FOR UPDATE", [claimedRunId]);
      await claimant.query("BEGIN");
      const claimantPid = (await claimant.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      const claim = claimant.query(
        `SELECT core.append_run_ownership_event($1,$2) AS at_seq`, [claimedRunId, foreign.ownerRef]
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const waiting = (await database.pool.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [claimantPid]
        )).rows[0]?.wait_event_type;
        if (waiting === "Lock") break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      const liveness = new LivenessRepository(database.pool).recordQuery(question, access);
      let lockWaiters = 0;
      for (let attempt = 0; attempt < 20 && lockWaiters < 2; attempt += 1) {
        lockWaiters = Number((await database.pool.query<{ count: string }>(
          `SELECT count(*) FROM pg_stat_activity
           WHERE wait_event_type='Lock'
             AND (query LIKE '%append_run_ownership_event%'
               OR (query LIKE '%core.run%' AND query LIKE '%FOR UPDATE%'))`
        )).rows[0]!.count);
        if (lockWaiters < 2) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(lockWaiters).toBeGreaterThanOrEqual(2);
      await blocker.query("COMMIT");
      await expect(claim).rejects.toThrow(/ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP/);
      await claimant.query("ROLLBACK");
      livenessResult = await liveness;
    } finally {
      await blocker.query("ROLLBACK").catch(() => undefined);
      await claimant.query("ROLLBACK").catch(() => undefined);
      blocker.release();
      claimant.release();
    }
    expect(livenessResult).toBe(2);
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.question_liveness_event WHERE run_id=$1`, [survivingRunId]
    )).rows[0]!.count).toBe("2");
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM core.question_liveness_event WHERE run_id=$1`, [claimedRunId]
    )).rows[0]!.count).toBe("2");
  }, 60_000);

  it("rejects an encrypted ownership transfer while an SSE lifecycle snapshot is open", async () => {
    const runId = await createOwnedRunHead(owner, `sse-claim-${randomUUID()}`);
    let markProjectionEntered!: () => void;
    let releaseProjection!: () => void;
    const projectionEntered = new Promise<void>((resolve) => { markProjectionEntered = resolve; });
    const projectionRelease = new Promise<void>((resolve) => { releaseProjection = resolve; });
    const application = new PostgresAskApplication(
      database.pool,
      {} as never,
      {} as never,
      {
        read: async (targetRunId: string) => {
          expect(targetRunId).toBe(runId);
          markProjectionEntered();
          await projectionRelease;
          return [];
        }
      },
      database.pool,
      createTestAskAdmissionPoolFacades(database.pool)
    );
    const stream = application.events(
      runId,
      owner.auth.session,
      { ownerRef: owner.ownerRef, legacyAskerId: null }
    )[Symbol.asyncIterator]();
    const first = stream.next();
    await projectionEntered;
    await expect(database.pool.query(
      `SELECT core.append_run_ownership_event($1,$2) AS at_seq`,
      [runId, foreign.ownerRef]
    )).rejects.toThrow(/ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP/);
    releaseProjection();
    const firstEvent = await first;
    expect(firstEvent.done).toBe(false);
    expect(firstEvent.value).toMatchObject({ run_ref: runId });
    expect((await database.pool.query<{ owned: boolean }>(
      `SELECT core.run_is_owned_by($1,$2,NULL) AS owned`, [runId, owner.ownerRef]
    )).rows[0]!.owned).toBe(true);
  }, 60_000);

  it("holds the active identity row through server-run creation", async () => {
    const creatingIdentity = await createIdentity("create-lock", "x".repeat(43), "y".repeat(43));
    const advisoryKey = 7_737_001;
    await database.pool.query(`
      CREATE OR REPLACE FUNCTION core.s7_test_pause_run_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(${advisoryKey});
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS s7_test_pause_run_insert ON core.run;
      CREATE TRIGGER s7_test_pause_run_insert
      BEFORE INSERT ON core.run FOR EACH ROW EXECUTE FUNCTION core.s7_test_pause_run_insert();
    `);
    const blocker = await database.pool.connect();
    const deleter = await database.pool.connect();
    let deletionWait: string | null = null;
    let createdRunId: string | null = null;
    let creation: Promise<string> | undefined;
    let deletion: Promise<unknown> | undefined;
    try {
      await blocker.query("SELECT pg_advisory_lock($1)", [advisoryKey]);
      creation = createOwnedRunHead(creatingIdentity, "create-lock-paused");
      let insertPaused = false;
      for (let attempt = 0; attempt < 30 && !insertPaused; attempt += 1) {
        insertPaused = Number((await database.pool.query<{ count: string }>(
          `SELECT count(*) FROM pg_stat_activity
           WHERE wait_event_type='Lock' AND query LIKE '%core.create_encrypted_run%'`
        )).rows[0]!.count) > 0;
        if (!insertPaused) await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(insertPaused).toBe(true);
      const deleterPid = (await deleter.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      deletion = deleter.query(`DELETE FROM identity."user" WHERE user_id=$1`, [creatingIdentity.userId]);
      for (let attempt = 0; attempt < 30 && deletionWait !== "Lock"; attempt += 1) {
        deletionWait = (await database.pool.query<{ wait_event_type: string | null }>(
          "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [deleterPid]
        )).rows[0]?.wait_event_type ?? null;
        if (deletionWait !== "Lock") await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      await blocker.query("SELECT pg_advisory_unlock($1)", [advisoryKey]).catch(() => undefined);
      if (creation !== undefined) createdRunId = await creation.catch(() => null);
      await deletion?.catch(() => undefined);
      blocker.release();
      deleter.release();
      await database.pool.query("DROP TRIGGER IF EXISTS s7_test_pause_run_insert ON core.run");
      await database.pool.query("DROP FUNCTION IF EXISTS core.s7_test_pause_run_insert()");
    }
    expect(deletionWait).toBe("Lock");
    expect(createdRunId).not.toBeNull();
  }, 60_000);

  it("severs the identity mapping without changing immutable ownership history or retaining raw identity data", async () => {
    const auditHead = await database.pool.query<{ this_hash: Buffer }>(
      `SELECT parent.this_hash
       FROM identity.audit_event AS parent
       LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
       WHERE child.audit_id IS NULL
       ORDER BY parent.occurred_at DESC,parent.audit_id DESC
       LIMIT 1`
    );
    const chainedAudit = appendAuditEvent(
      auditHead.rows[0]?.this_hash.toString("hex") ?? null,
      Object.freeze({
        auditId: randomUUID(),
        actorCiphertext: null,
        actorKeyRef: owner.auditToken,
        eventType: "identity.erasure.fixture",
        targetType: "identity.user",
        targetId: owner.auditToken,
        occurredAt: new Date(),
        sourceContext: Object.freeze({
          ipArgon2id: "argon2id:s7-erasure-ip",
          userAgentArgon2id: "argon2id:s7-erasure-user-agent"
        }),
        decision: "ALLOW",
        success: true,
        justification: "S7_ERASURE_CHAIN_PROOF"
      })
    );
    await database.pool.query(
      `INSERT INTO identity.audit_event (
         prev_hash,this_hash,actor_ciphertext,actor_key_ref,event_type,target_type,
         target_id,occurred_at,source_context,decision,success,justification
       ) VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [
        chainedAudit.prevHash === null ? null : Buffer.from(chainedAudit.prevHash, "hex"),
        Buffer.from(chainedAudit.thisHash, "hex"),
        chainedAudit.actorKeyRef,
        chainedAudit.eventType,
        chainedAudit.targetType,
        chainedAudit.targetId,
        chainedAudit.occurredAt,
        JSON.stringify(chainedAudit.sourceContext),
        chainedAudit.decision,
        chainedAudit.success,
        chainedAudit.justification
      ]
    );
    const before = await database.pool.query<{ payload: unknown }>(
      `SELECT to_jsonb(event.*) AS payload
       FROM core.run_ownership_event AS event
       WHERE event.run_id IN ($1,$2)
       ORDER BY event.at_seq`,
      [owned.runId, priorOwned.runId]
    );
    const auditBefore = await database.pool.query<{ payload: unknown }>(
      `SELECT to_jsonb(event.*) AS payload FROM identity.audit_event AS event
       ORDER BY event.occurred_at,event.audit_id`
    );
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.audit_event WHERE actor_key_ref=$1`, [owner.auditToken]
    )).rows[0]!.count).toBe("1");
    await database.pool.query(`DELETE FROM identity."user" WHERE user_id=$1`, [owner.userId]);
    const after = await database.pool.query<{ payload: unknown }>(
      `SELECT to_jsonb(event.*) AS payload
       FROM core.run_ownership_event AS event
       WHERE event.run_id IN ($1,$2)
       ORDER BY event.at_seq`,
      [owned.runId, priorOwned.runId]
    );
    expect(after.rows).toEqual(before.rows);
    const auditAfter = await database.pool.query<{ payload: unknown }>(
      `SELECT to_jsonb(event.*) AS payload FROM identity.audit_event AS event
       ORDER BY event.occurred_at,event.audit_id`
    );
    expect(auditAfter.rows).toEqual(auditBefore.rows);
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.audit_event WHERE actor_key_ref=$1`, [owner.auditToken]
    )).rows[0]!.count).toBe("1");
    expect((await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity."user" WHERE owner_ref=$1`, [owner.ownerRef]
    )).rows[0]!.count).toBe("0");
    expect((await database.pool.query<{ owned: boolean }>(
      `SELECT core.run_is_owned_by($1,$2,NULL) AS owned`, [owned.runId, owner.ownerRef]
    )).rows[0]!.owned).toBe(false);
    const immutable = await database.pool.query<{ payload: string }>(
      `SELECT string_agg(payload, E'\n') AS payload FROM (
         SELECT to_jsonb(run.*)::text AS payload FROM core.run AS run
         UNION ALL SELECT to_jsonb(event.*)::text FROM core.run_ownership_event AS event
         UNION ALL SELECT to_jsonb(event.*)::text FROM core.question_liveness_event AS event
         UNION ALL SELECT to_jsonb(key.*)::text FROM memory.question_key AS key
         UNION ALL SELECT to_jsonb(link.*)::text FROM memory.memory_link AS link
         UNION ALL SELECT to_jsonb(event.*)::text FROM memory.memory_link_event AS event
         UNION ALL SELECT to_jsonb(pull.*)::text FROM memory.pull_record AS pull
         UNION ALL SELECT to_jsonb(request.*)::text FROM core.investigation_request AS request
         UNION ALL SELECT to_jsonb(event.*)::text FROM identity.audit_event AS event
       ) AS immutable_rows`
    );
    const payload = immutable.rows[0]!.payload;
    for (const forbidden of [owner.userId, owner.email, owner.pseudonym, owner.blindHex]) {
      expect(payload).not.toContain(forbidden);
    }
    const deniedAfterErasure = await api.inject({
      method: "GET", url: `/v1/runs/${owned.runId}`, headers: cookieHeaders(owner)
    });
    expect(deniedAfterErasure.statusCode).toBe(404);
    expect(deniedAfterErasure.json()).toEqual({ error: "RUN_NOT_FOUND" });
  });

  it("fails closed and rolls migration 0037 back when any pre-S7 immutable run contains a raw user id", async () => {
    const insertRawRun = (target: TestDatabase, baseRunId: string) => target.pool.query(
      `INSERT INTO core.run (
         run_id,question_line,asker_id,session_id,caller_scope,as_of,
         asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
         composition_budget_tier,depth_params,agent_count,discovered_panel,
         stranger_sample_rate,envelope_basis,register_version,battery_version,
         ask_contract,created_at_seq
       ) SELECT
         $1,'S7 raw migration refusal',$2,'session:s7-raw','ASKER',as_of,
         asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
         composition_budget_tier,depth_params,agent_count,discovered_panel,
         stranger_sample_rate,envelope_basis,register_version,battery_version,
         ask_contract,ledger.allocate_sequence()
       FROM core.run WHERE run_id=$3`,
      [randomUUID(), `user:${randomUUID()}`, baseRunId]
    );
    await expect(insertRawRun(database, foreignRun.runId)).rejects.toThrow(/core_run_asker_id_no_raw_user_uuid/);
    const rawScope = `user:${randomUUID()}`;
    await expect(database.pool.query(
      `INSERT INTO memory.question_key (
         run_id,canonical_question_text,caller_scope,asker_scope,normalized_binding,
         frozen_terms,as_of,policy_version,key_version,at_seq
      ) VALUES ($1,'s7 raw memory scope','ASKER',$2,'{}'::jsonb,'[]'::jsonb,
         now(),1,1,ledger.allocate_sequence())`,
      [foreignRun.runId, rawScope]
    )).rejects.toThrow(/CONTENT_PLAINTEXT_WRITE_FORBIDDEN: memory\.question_key/);
    await expect(database.pool.query(
      `INSERT INTO memory.pull_record (
         memory_link_id,artifact_kind,artifact_id,artifact_version,content_hash,
         artifact_as_of,staleness_state_at_pull,asker_scope,payload_snapshot,
         register_row_key,register_version,register_source_ref,at_seq
      ) VALUES ($1,'PRIOR_ANSWER',$2,1,$3,now(),'FRESH',$4,'{}'::jsonb,
         's7:raw-memory',1,'s7:raw-memory',ledger.allocate_sequence())`,
      [foreignMemoryLinkId, randomUUID(), "a".repeat(64), rawScope]
    )).rejects.toThrow(/CONTENT_PLAINTEXT_WRITE_FORBIDDEN: memory\.pull_record/);

    const migration = await readFile(new URL("../../migrations/0037_run_ownership.sql", import.meta.url), "utf8");
    const applyPreS7Migrations = async (target: TestDatabase) => {
      const directory = new URL("../../migrations/", import.meta.url);
      const names = (await readdir(directory))
        .filter((name) => /^\d+.*\.sql$/.test(name) && name < "0037_run_ownership.sql")
        .sort();
      for (const name of names) {
        await target.pool.query(await readFile(new URL(name, directory), "utf8"));
      }
    };
    const createPreS7Base = (target: TestDatabase, label: string) => new RunRepository(target.pool).startRun({
      questionLine: `S7 pre-migration ${label} refusal base`,
      principal: { kind: "legacy", legacyAskerId: `asker:s7-pre-migration:${label}` },
      sessionId: `session:s7-pre-migration:${label}`,
      callerScope: "ASKER",
      asOf: new Date("2026-08-23T00:00:00.000Z"),
      askerRiskTier: "casual",
      effectiveRiskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: `s7:pre-migration:${label}`,
      compositionBudgetTier: "low",
      depthParams: { depth: 1 },
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: { source: `s7-pre-migration:${label}` },
      registerVersion: 1,
      batteryVersion: `s7-pre-migration:${label}`,
      batteryRows: []
    });

    const preS7 = await startTestDatabase();
    try {
      await applyPreS7Migrations(preS7);
      const baseRunId = await createPreS7Base(preS7, "run");
      await insertRawRun(preS7, baseRunId);
      const before = await preS7.pool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid='core.run_progress_event'::regclass
           AND conname='run_progress_event_kind_check'`
      );
      await expect(preS7.pool.query(migration)).rejects.toThrow(/S7_RAW_USER_ID_IN_IMMUTABLE_RUN/);
      const after = await preS7.pool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid='core.run_progress_event'::regclass
           AND conname='run_progress_event_kind_check'`
      );
      expect(after.rows).toEqual(before.rows);
      expect((await preS7.pool.query<{ count: string }>(
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema='identity' AND table_name='user' AND column_name='owner_ref'`
      )).rows[0]!.count).toBe("0");
    } finally {
      await preS7.stop();
    }

    const preS7Memory = await startTestDatabase();
    try {
      await applyPreS7Migrations(preS7Memory);
      const baseRunId = await createPreS7Base(preS7Memory, "memory");
      await preS7Memory.pool.query(
        `INSERT INTO memory.question_key (
           run_id,canonical_question_text,caller_scope,asker_scope,normalized_binding,
           frozen_terms,as_of,policy_version,key_version,at_seq
         ) VALUES ($1,'s7 historical raw memory','ASKER',$2,'{}'::jsonb,'[]'::jsonb,
           now(),1,1,ledger.allocate_sequence())`,
        [baseRunId, `user:${randomUUID()}`]
      );
      await expect(preS7Memory.pool.query(migration))
        .rejects.toThrow(/S7_RAW_USER_ID_IN_IMMUTABLE_MEMORY/);
      expect((await preS7Memory.pool.query<{ count: string }>(
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema='identity' AND table_name='user' AND column_name='owner_ref'`
      )).rows[0]!.count).toBe("0");
    } finally {
      await preS7Memory.stop();
    }

    const preS7Identity = await startTestDatabase();
    try {
      await applyPreS7Migrations(preS7Identity);
      const rawUserId = randomUUID();
      await preS7Identity.pool.query(
        `INSERT INTO identity."user" (
           user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
           phone_ciphertext,password_hash,pseudonym,audit_token,state,
           adult_affirmed_at,created_at
         ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$1,'active',now(),now())`,
        [rawUserId, Buffer.alloc(32, 0xd7), `s7-historical-domain-${randomUUID()}`]
      );
      await expect(preS7Identity.pool.query(migration))
        .rejects.toThrow(/identity_user_audit_token_distinct_from_user_id/);
      expect((await preS7Identity.pool.query<{ count: string }>(
        `SELECT count(*) FROM information_schema.columns
         WHERE table_schema='identity' AND table_name='user' AND column_name='owner_ref'`
      )).rows[0]!.count).toBe("0");
    } finally {
      await preS7Identity.stop();
    }
  }, 120_000);
});
