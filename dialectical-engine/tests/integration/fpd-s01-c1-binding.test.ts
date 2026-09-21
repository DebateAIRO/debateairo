import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
  CONTENT_JSON_SENTINEL,
  configureContentEncryption,
  migrate,
  RunRepository,
  type Pool
} from "@debateai/db";
import { run as runSchema } from "../../packages/db/src/schema.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let sessionId: string;
let cipher: ContentCipher;

function runInput(
  planTier: "free" | "premium" | undefined,
  principal: Parameters<RunRepository["startRun"]>[0]["principal"]
): Parameters<RunRepository["startRun"]>[0] {
  return {
    questionLine: `FPD S01 binding ${randomUUID()}`,
    askContract: { audience: "fpd-s01-c1-integration" },
    principal,
    sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-20T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "fpd-s01-c1:integration",
    compositionBudgetTier: "low",
    ...(planTier === undefined ? {} : { planTier }),
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "fpd-s01-c1:integration" },
    registerVersion: 1,
    batteryVersion: "fpd-s01-c1:integration",
    batteryRows: []
  };
}

async function insertPreRuleFreeRun(): Promise<string> {
  const runId = randomUUID();
  await database.pool.query(
    `INSERT INTO core.run (
       run_id,question_line,asker_id,session_id,caller_scope,as_of,
       asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
       composition_budget_tier,plan_tier,
       depth_params,agent_count,discovered_panel,stranger_sample_rate,
       envelope_basis,register_version,battery_version,ask_contract,created_at_seq
     ) VALUES (
       $1,$2,$3,$4,'ASKER',$5,'casual','casual','ASKER',$6,
       'low','free','{}'::jsonb,1,$8::jsonb,1,
       '{}'::jsonb,1,$7,'{}'::jsonb,ledger.allocate_sequence()
     )`,
    [
      runId,
      `FPD pre-rule ${runId}`,
      `fpd-pre-rule-${runId}`,
      randomUUID(),
      new Date("2026-09-19T00:00:00.000Z"),
      "fpd-s01-c1:pre-rule",
      "fpd-s01-c1:pre-rule",
      JSON.stringify(fixtureDiscoveredPanel(1))
    ]
  );
  return runId;
}

async function queryBound(pool: Pick<Pool, "query">, runId: string): Promise<boolean> {
  const result = await pool.query<{ bound: boolean | null }>(
    "SELECT core.run_is_free_public_bound($1::uuid) AS bound",
    [runId]
  );
  return result.rows[0]?.bound === true;
}

async function exportedBound(pool: Pick<Pool, "query">, runId: string): Promise<boolean> {
  const db = await import("@debateai/db") as typeof import("@debateai/db") & {
    readonly runIsFreePublicBound: (
      candidatePool: Pick<Pool, "query">,
      candidateRunId: string
    ) => Promise<boolean>;
  };
  return db.runIsFreePublicBound(pool, runId);
}

async function callCreateEncryptedRun(options: {
  readonly freePublicRule: boolean | undefined;
  readonly extraKey?: boolean;
}): Promise<{ readonly created: boolean; readonly runId: string }> {
  const runId = randomUUID();
  const intent = await database.pool.query<{ execution_ref: string | null }>(
    "SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS execution_ref",
    [runId, userId, ownerRef, sessionId]
  );
  const executionRef = intent.rows[0]?.execution_ref;
  if (executionRef === null || executionRef === undefined) {
    throw new Error("RUN_KEY_PROVISION_INTENT_MISSING");
  }

  await cipher.provisionRun(runId, { userId, ownerRef });
  const prepared = await cipher.prepareRun(runId);
  try {
    const contentCiphertext = prepared.encrypt("core.run", runId, {
      questionLine: `FPD direct create ${runId}`,
      askContract: {}
    });
    const contentAttestation = prepared.attestEnvelope(
      "core.run",
      runId,
      "content_ciphertext",
      contentCiphertext
    );
    const contentAttestationSecret = prepared.databaseAttestationSecret();
    const payload = {
      runId,
      questionLine: CONTENT_CIPHERTEXT_SENTINEL,
      askerId: `owner:${ownerRef}`,
      executionRef,
      callerScope: "ASKER",
      asOf: new Date("2026-09-20T00:00:00.000Z").toISOString(),
      askerRiskTier: "casual",
      riskTier: "casual",
      tierSource: "ASKER",
      tierProvenanceRef: "fpd-s01-c1:direct-create",
      compositionBudgetTier: "low",
      planTier: "free",
      ...(options.freePublicRule === undefined
        ? {}
        : { freePublicRule: options.freePublicRule }),
      depthParams: {},
      discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1,
      envelopeBasis: {},
      registerVersion: 1,
      batteryVersion: "fpd-s01-c1:direct-create",
      askContract: CONTENT_JSON_SENTINEL,
      contentCiphertext,
      contentAttestation: contentAttestation.toString("base64"),
      contentAttestationSecret: contentAttestationSecret.toString("base64"),
      ...(options.extraKey === true ? { notAColumn: true } : {})
    };
    const result = await database.pool.query<{ created: boolean }>(
      "SELECT core.create_encrypted_run($1::jsonb,$2,$3,'[]'::jsonb) AS created",
      [JSON.stringify(payload), userId, ownerRef]
    );
    contentAttestation.fill(0);
    contentAttestationSecret.fill(0);
    return { created: result.rows[0]?.created === true, runId };
  } finally {
    prepared.close();
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);

  userId = randomUUID();
  ownerRef = randomUUID();
  sessionId = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,
       'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x66), `fpd-s01-c1-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session (
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

  secretRoot = await mkdtemp(join(tmpdir(), "debateai-fpd-s01-c1-"));
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
  cipher = new ContentCipher(keys);
  configureContentEncryption(database.pool, cipher);
}, 120_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("S01 C1 free-public binding", () => {
  it("maps free_public_rule in the Drizzle run schema", () => {
    const schemaColumn = (runSchema as unknown as {
      readonly freePublicRule?: { readonly name?: unknown };
    }).freePublicRule?.name;

    expect(schemaColumn).toBe("free_public_rule");
  });

  it("pre-rule free row is not bound", async () => {
    const runId = await insertPreRuleFreeRun();

    await expect(queryBound(database.pool, runId)).resolves.toBe(false);
  });

  it("post-rule free startRun is bound", async () => {
    const runId = await new RunRepository(database.pool).startRun(
      runInput("free", { kind: "server", userId, ownerRef })
    );
    const row = await database.pool.query<{
      free_public_rule: boolean;
      plan_tier: string | null;
    }>("SELECT free_public_rule,plan_tier FROM core.run WHERE run_id=$1", [runId]);

    expect({
      freePublicRule: row.rows[0]?.free_public_rule,
      planTier: row.rows[0]?.plan_tier,
      bound: await exportedBound(database.pool, runId)
    }).toEqual({ freePublicRule: true, planTier: "free", bound: true });
  });

  it("post-rule premium startRun is not bound", async () => {
    const runId = await new RunRepository(database.pool).startRun(
      runInput("premium", { kind: "server", userId, ownerRef })
    );
    const row = await database.pool.query<{
      free_public_rule: boolean;
      plan_tier: string | null;
    }>("SELECT free_public_rule,plan_tier FROM core.run WHERE run_id=$1", [runId]);

    expect({
      freePublicRule: row.rows[0]?.free_public_rule,
      planTier: row.rows[0]?.plan_tier,
      bound: await exportedBound(database.pool, runId)
    }).toEqual({ freePublicRule: true, planTier: "premium", bound: false });
  });

  it("post-rule null plan_tier startRun is not bound", async () => {
    const runId = await new RunRepository(database.pool).startRun(
      runInput(undefined, { kind: "server", userId, ownerRef })
    );
    const row = await database.pool.query<{
      free_public_rule: boolean;
      plan_tier: string | null;
    }>("SELECT free_public_rule,plan_tier FROM core.run WHERE run_id=$1", [runId]);

    expect({
      freePublicRule: row.rows[0]?.free_public_rule,
      planTier: row.rows[0]?.plan_tier,
      bound: await exportedBound(database.pool, runId)
    }).toEqual({ freePublicRule: true, planTier: null, bound: false });
  });

  it("legacy startRun writes free_public_rule true", async () => {
    const runId = await new RunRepository(database.pool).startRun(
      runInput("free", { kind: "legacy", legacyAskerId: `fpd-legacy-${randomUUID()}` })
    );
    const row = await database.pool.query<{
      free_public_rule: boolean;
      plan_tier: string | null;
    }>("SELECT free_public_rule,plan_tier FROM core.run WHERE run_id=$1", [runId]);

    expect({
      freePublicRule: row.rows[0]?.free_public_rule,
      planTier: row.rows[0]?.plan_tier,
      bound: await exportedBound(database.pool, runId)
    }).toEqual({ freePublicRule: true, planTier: "free", bound: true });
  });

  it("pre-rule visibility event count is unchanged by the predicate", async () => {
    const runId = await insertPreRuleFreeRun();
    const visibilityEventId = randomUUID();
    const visibilityActorRef = randomUUID();
    const publicationRef = randomUUID();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        `INSERT INTO serve.publication_snapshot (
           publication_ref,run_id,format_version,content_ciphertext,created_at
         ) VALUES ($1,$2,1,'{}'::jsonb,now())`,
        [publicationRef, runId]
      );
      await client.query(
        `INSERT INTO core.run_visibility_event (
           run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
           warning_version,occurred_at,at_seq,actor_ref_version
         ) VALUES ($1,$2,$3,'PRIVATE',$4,'COPIES_MAY_PERSIST_V1',now(),ledger.allocate_sequence(),2)`,
        [visibilityEventId, runId, publicationRef, visibilityActorRef]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const before = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_visibility_event WHERE run_id=$1",
      [runId]
    );
    const bound = await queryBound(database.pool, runId);
    const after = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_visibility_event WHERE run_id=$1",
      [runId]
    );

    expect({ before: before.rows[0]?.count, bound, after: after.rows[0]?.count })
      .toEqual({ before: "1", bound: false, after: "1" });
  });

  it("create_encrypted_run accepts a missing freePublicRule key as false", async () => {
    const result = await callCreateEncryptedRun({ freePublicRule: undefined });
    const row = await database.pool.query<{ free_public_rule: boolean }>(
      "SELECT free_public_rule FROM core.run WHERE run_id=$1",
      [result.runId]
    );

    expect({ created: result.created, freePublicRule: row.rows[0]?.free_public_rule })
      .toEqual({ created: true, freePublicRule: false });
  });

  it("create_encrypted_run rejects an extra payload key", async () => {
    const rejected = await callCreateEncryptedRun({ freePublicRule: true, extraKey: true });
    const accepted = await callCreateEncryptedRun({ freePublicRule: true });

    expect({ rejected: rejected.created, acceptedWithoutExtraKey: accepted.created })
      .toEqual({ rejected: false, acceptedWithoutExtraKey: true });
  });
});
