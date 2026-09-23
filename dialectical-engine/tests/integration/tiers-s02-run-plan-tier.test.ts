import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek
} from "../../packages/crypto/src/index.js";
import {
  CONTENT_CIPHERTEXT_SENTINEL,
  configureContentEncryption,
  migrate,
  RunRepository
} from "@debateai/db";
import { run as runSchema } from "../../packages/db/src/schema.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type RunInput = Parameters<RunRepository["startRun"]>[0] & {
  readonly planTier: "free" | "premium";
};

let database: TestDatabase;
let prePlanTierDatabase: TestDatabase;
let secretRoot: string;
let prePlanTierSecretRoot: string;
let userId: string;
let ownerRef: string;
let sessionId: string;
let prePlanTierUserId: string;
let prePlanTierOwnerRef: string;
let prePlanTierSessionId: string;

function runInput(
  planTier: "free" | "premium",
  principal: RunInput["principal"]
): RunInput {
  return {
    questionLine: `S02 plan tier ${randomUUID()}`,
    askContract: { audience: "tiers-s02-integration" },
    principal,
    sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-09T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "tiers-s02:integration",
    compositionBudgetTier: "low",
    planTier,
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "tiers-s02:integration" },
    registerVersion: 1,
    batteryVersion: "tiers-s02:integration",
    batteryRows: []
  };
}

async function migrateBeforePlanTier(target: TestDatabase): Promise<void> {
  const directory = new URL("../../migrations/", import.meta.url);
  const migrations = (await readdir(directory))
    // SYNC3 / R2: dev's plan-tier migration is 0067 now; "before plan tier" is
    // every migration that sorts before it.
    .filter((name) => /^\d+.*\.sql$/.test(name) && name < "0067_plan_tier_on_run.sql")
    .sort();
  const client = await target.pool.connect();
  try {
    await client.query("BEGIN");
    for (const name of migrations) {
      await client.query(await readFile(new URL(name, directory), "utf8"));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createActiveUser(): Promise<void> {
  userId = randomUUID();
  ownerRef = randomUUID();
  sessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x73), `tiers-s02-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [
      sessionId,
      userId,
      `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`
    ]
  );
}

async function createPrePlanTierActiveUser(): Promise<void> {
  prePlanTierUserId = randomUUID();
  prePlanTierOwnerRef = randomUUID();
  prePlanTierSessionId = randomUUID();
  await prePlanTierDatabase.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [
      prePlanTierUserId,
      Buffer.alloc(32, 0x73),
      `tiers-s02-${randomUUID()}`,
      randomUUID(),
      prePlanTierOwnerRef
    ]
  );
  await prePlanTierDatabase.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [
      prePlanTierSessionId,
      prePlanTierUserId,
      `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`
    ]
  );
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await createActiveUser();
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-tiers-s02-"));
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  const keys = new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    const result = await database.pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
      [candidate]
    );
    const resolved = result.rows[0]?.user_id;
    if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return resolved;
  });
  configureContentEncryption(database.pool, new ContentCipher(keys));

  prePlanTierDatabase = await startTestDatabase();
  await migrateBeforePlanTier(prePlanTierDatabase);
  await createPrePlanTierActiveUser();
  prePlanTierSecretRoot = await mkdtemp(join(tmpdir(), "debateai-tiers-s02-pre-0061-"));
  const prePlanTierUsers = new FileUserDekStore(
    prePlanTierSecretRoot,
    loadKek(generateDek())
  );
  await prePlanTierUsers.store(prePlanTierUserId, generateDek());
  const prePlanTierKeys = new FileRunContentKeyStore(
    prePlanTierSecretRoot,
    prePlanTierUsers,
    async (candidate) => {
      const result = await prePlanTierDatabase.pool.query<{ user_id: string }>(
        `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
        [candidate]
      );
      const resolved = result.rows[0]?.user_id;
      if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
      return resolved;
    }
  );
  configureContentEncryption(
    prePlanTierDatabase.pool,
    new ContentCipher(prePlanTierKeys)
  );
}, 120_000);

afterAll(async () => {
  await database?.stop();
  await prePlanTierDatabase?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
  if (prePlanTierSecretRoot !== undefined) {
    await rm(prePlanTierSecretRoot, { recursive: true, force: true });
  }
});

describe("S02 plan tier run storage", () => {
  it("migrates core.run.plan_tier as nullable text", async () => {
    const result = await database.pool.query<{ data_type: string; is_nullable: string }>(`
      SELECT data_type,is_nullable
      FROM information_schema.columns
      WHERE table_schema='core' AND table_name='run' AND column_name='plan_tier'
    `);
    const schemaColumn = (runSchema as unknown as {
      readonly planTier?: { readonly name?: unknown };
    }).planTier?.name;

    expect({ databaseColumns: result.rows, schemaColumn }).toEqual({
      databaseColumns: [{ data_type: "text", is_nullable: "YES" }],
      schemaColumn: "plan_tier"
    });
  });

  it("creates run_plan_tier_vocabulary and rejects an invalid plan_tier", async () => {
    const constraints = await database.pool.query<{ constraint_name: string }>(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema='core' AND table_name='run'
        AND constraint_name='run_plan_tier_vocabulary'
    `);

    expect(constraints.rows).toEqual([{ constraint_name: "run_plan_tier_vocabulary" }]);

    const runId = await new RunRepository(database.pool).startRun(
      runInput("premium", { kind: "legacy", legacyAskerId: `tiers-s02-${randomUUID()}` })
    );
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await expect(
        client.query("UPDATE core.run SET plan_tier='gold' WHERE run_id=$1", [runId])
      ).rejects.toMatchObject({ code: "23514", constraint: "run_plan_tier_vocabulary" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("persists premium through the legacy-principal plan_tier write path", async () => {
    const runId = await new RunRepository(database.pool).startRun(
      runInput("premium", { kind: "legacy", legacyAskerId: `tiers-s02-${randomUUID()}` })
    );
    const result = await database.pool.query<{ plan_tier: string | null }>(
      "SELECT plan_tier FROM core.run WHERE run_id=$1",
      [runId]
    );

    expect(result.rows[0]?.plan_tier).toBe("premium");
  });

  it("persists plaintext free beside encrypted content through the server-principal plan_tier path", async () => {
    const runId = await new RunRepository(database.pool).startRun(
      runInput("free", { kind: "server", userId, ownerRef })
    );
    const result = await database.pool.query<{ plan_tier: string | null; question_line: string }>(
      "SELECT plan_tier,question_line FROM core.run WHERE run_id=$1",
      [runId]
    );

    expect(result.rows[0]).toEqual({
      plan_tier: "free",
      question_line: CONTENT_CIPHERTEXT_SENTINEL
    });
  });

  it("starts a legacy-principal run before migration 0061", async () => {
    const input = runInput(
      "premium",
      { kind: "legacy", legacyAskerId: `tiers-s02-${randomUUID()}` }
    );
    const runId = await new RunRepository(prePlanTierDatabase.pool).startRun({
      ...input,
      sessionId: prePlanTierSessionId
    });
    const result = await prePlanTierDatabase.pool.query<{ question_line: string }>(
      "SELECT question_line FROM core.run WHERE run_id=$1",
      [runId]
    );

    expect(result.rows).toEqual([{ question_line: input.questionLine }]);
  });

  it("starts an encrypted server-principal run before migration 0061", async () => {
    const runId = await new RunRepository(prePlanTierDatabase.pool).startRun({
      ...runInput("free", {
        kind: "server",
        userId: prePlanTierUserId,
        ownerRef: prePlanTierOwnerRef
      }),
      sessionId: prePlanTierSessionId
    });
    const result = await prePlanTierDatabase.pool.query<{
      question_line: string;
      content_encryption_version: number;
    }>(
      "SELECT question_line,content_encryption_version FROM core.run WHERE run_id=$1",
      [runId]
    );

    expect(result.rows).toEqual([{
      question_line: CONTENT_CIPHERTEXT_SENTINEL,
      content_encryption_version: 1
    }]);
  });
});
