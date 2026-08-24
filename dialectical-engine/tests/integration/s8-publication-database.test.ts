import { randomBytes, randomUUID } from "node:crypto";
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
  assertPublicationDatabaseRoleSeparation,
  configureContentEncryption,
  createPool,
  PostgresSessionRepository,
  PostgresPublicationRepository,
  RunRepository,
  migrate,
  type LoginIdentityRecord
} from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";

const source = Object.freeze({ ip: "192.0.2.8", userAgent: "S8 Browser", requestId: "request:s8" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "$argon2id$v=19$m=19456,t=2,p=1$source$ip",
  hashUserAgent: async () => "$argon2id$v=19$m=19456,t=2,p=1$source$ua"
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

async function createRun(identity: Identity, label: string, pool: Pool = database.pool): Promise<string> {
  return new RunRepository(pool).startRun({
    questionLine: `S8 private question ${label}`,
    principal: { kind: "server", userId: identity.userId, ownerRef: identity.ownerRef },
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
  const token = symbol.repeat(43);
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
  contentCipher = new ContentCipher(new MemoryRunContentKeyStore(
    users,
    async (ownerRef) => {
      const userId = userIdsByOwnerRef.get(ownerRef);
      if (userId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return userId;
    }
  ), Buffer.alloc(32, 0x6a));
  configureContentEncryption(database.pool, contentCipher);
  repository = new PostgresPublicationRepository(database.pool, fakeAuditHasher);
  publicationCipher = new PublicationCipher(
    new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xc8)))
  );
}, 120_000);

afterAll(async () => database?.stop());

describe("S8 publication on real PostgreSQL", () => {
  it("attests two real least-privilege LOGIN credentials and rejects aliases or overpowered roles", async () => {
    const password = "s8-role-witness-only";
    await database.pool.query(`
      CREATE ROLE s8_publication_login LOGIN PASSWORD '${password}';
      CREATE ROLE s8_authorization_login LOGIN PASSWORD '${password}';
      CREATE ROLE s8_dual_login LOGIN PASSWORD '${password}';
      GRANT debateai_runtime TO s8_publication_login;
      GRANT debateai_authorization_runtime TO s8_authorization_login;
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
    const dualPool = createPool(urlFor("s8_dual_login"));
    try {
      await expect(assertPublicationDatabaseRoleSeparation(
        publicationPool, authorizationPool
      )).resolves.toBeUndefined();
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
    } finally {
      await Promise.all([publicationPool.end(), authorizationPool.end(), dualPool.end()]);
    }
  });

  it("defaults every event-less run private and keeps a published snapshot readable after identity deletion", async () => {
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
    expect(await repository.listPublicRefs(10, 50)).toEqual({ refs: [], total: 1 });

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
    expect(await repository.listPendingKeyCleanup()).toContain(publicationRef);
    await publicationCipher.destroy(publicationRef);
    expect(await repository.completeKeyCleanup(publicationRef, new Date())).toBe(true);
    expect(await repository.listPendingKeyCleanup()).not.toContain(publicationRef);
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
        created_at,last_seen_at,idle_expires_at,absolute_expires_at
      ) VALUES ($1,$2,$3,$4,'{}'::jsonb,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')
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

  it("refuses corpus publication of an owned legacy plaintext run", async () => {
    const identity = await createIdentity("legacy-plaintext");
    const runId = await createRun(identity, "legacy-plaintext", unconfiguredPool(database.pool));
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
          'core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,bytea,bytea,uuid,jsonb)',
          'EXECUTE') AS atomic_transition,
        has_function_privilege('debateai_runtime',
          'identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz)',
          'EXECUTE') AS runtime_grant_mint,
        has_function_privilege('debateai_authorization_runtime',
          'identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz)',
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
          $1,$2,$3,$4,$5,$6,'PUBLISH',$7,$8,$9::jsonb,$10,
          $11,NULL,$12,$13,$14::jsonb
        ) AS publication_ref
      `, [
        randomUUID(), runId, identity.userId, identity.ownerRef, identity.sessionId,
        hash("b"), publicationRef, identity.pseudonym, JSON.stringify(contentCiphertext),
        new Date(), randomUUID(), Buffer.alloc(32, 0x11), identity.auditToken,
        JSON.stringify({ ipArgon2id: "opaque", userAgentArgon2id: "opaque" })
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
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);
    const published = repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt, source, publicationRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "publish-unpublish")
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

  it("serializes publish against an ownership claim and revalidates the held latest owner", async () => {
    const original = await createIdentity("claim-original");
    const claimant = await createIdentity("claim-next");
    const runId = await createRun(original, "claim-race");
    const occurredAt = new Date();
    const publicationRef = randomUUID();
    const publishGrant = await grant(original, runId, "PUBLISH", "8", occurredAt);
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);
    const published = repository.publish({
      runId, userId: original.userId, ownerRef: original.ownerRef,
      sessionId: original.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt, source, publicationRef, expectedPseudonym: original.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "claim-race")
    });
    await expectStillPending(published);
    await blocker.query("SELECT core.append_run_ownership_event($1,$2)", [runId, claimant.ownerRef]);
    await blocker.query("COMMIT");
    blocker.release();
    expect(await published).toBe(false);
    expect((await database.pool.query<{ owned: boolean }>(
      "SELECT core.run_is_owned_by($1,$2,NULL) AS owned", [runId, claimant.ownerRef]
    )).rows[0]?.owned).toBe(true);
    expect(await repository.revalidatePublic(runId, publicationRef)).toBe(false);
  });

  it("serializes publish against identity shredding and never leaves a user-key dependency", async () => {
    const identity = await createIdentity("shred-race");
    const runId = await createRun(identity, "shred-race");
    const occurredAt = new Date();
    const publicationRef = randomUUID();
    const publishGrant = await grant(identity, runId, "PUBLISH", "9", occurredAt);
    const blocker = await database.pool.connect();
    await blocker.query("BEGIN");
    await blocker.query("SELECT 1 FROM core.run WHERE run_id=$1 FOR UPDATE", [runId]);
    const published = repository.publish({
      runId, userId: identity.userId, ownerRef: identity.ownerRef,
      sessionId: identity.sessionId, grantTokenHash: hashVerificationToken(publishGrant),
      occurredAt, source, publicationRef, expectedPseudonym: identity.pseudonym,
      contentCiphertext: await encryptedSnapshot(publicationRef, runId, "shred-race")
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
