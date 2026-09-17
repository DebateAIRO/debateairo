// PROBE — REV(S02) pass 2, lens correctness/tests. Written from the CLAIM of finding B1
// (t_ca11cffb) and the F1 remedy's own shape, never from the author's tests.
//
// The F1 fix uses TWO DIFFERENT oracles for one fact ("is migration 0061 applied?"):
//   - the plaintext INSERT asks information_schema for the core.run.plan_tier COLUMN
//     (packages/db/src/index.ts:635-646, :1138-1139);
//   - the encrypted path asks pg_get_functiondef whether core.create_encrypted_run's TEXT
//     contains 'planTier' (packages/db/src/index.ts:1198-1206).
// Migration 0061 moves both at once, so the two oracles agree on the two states any seat
// measured. This probe exceeds those parameters: it builds the two HALF-APPLIED states in
// which the oracles disagree, and measures what startRun does in each.
//
// Cases:
//   A. column present + OLD (pre-0061) function  -> deploy half-way through 0061
//   B. column ABSENT + NEW (0061) function       -> a partial rollback of 0061
//
// Every database here is a per-test embedded Postgres on an OS-assigned port. No live
// database, no :3000 stack, no .local/**.
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
  RunRepository
} from "@debateai/db";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

type RunInput = Parameters<RunRepository["startRun"]>[0] & {
  readonly planTier: "free" | "premium";
};

interface Cell {
  readonly database: TestDatabase;
  readonly secretRoot: string;
  readonly userId: string;
  readonly ownerRef: string;
  readonly sessionId: string;
}

const cells: Record<"A" | "B", Cell> = {} as Record<"A" | "B", Cell>;

function runInput(
  planTier: "free" | "premium",
  principal: RunInput["principal"],
  sessionId: string
): RunInput {
  return {
    questionLine: `REV-S02-p2 half-applied ${randomUUID()}`,
    askContract: { audience: "rev-s02-p2-correctness" },
    principal,
    sessionId,
    callerScope: "ASKER",
    asOf: new Date("2026-09-12T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "rev-s02-p2:probe",
    compositionBudgetTier: "low",
    planTier,
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1,
    envelopeBasis: { source: "rev-s02-p2:probe" },
    registerVersion: 1,
    batteryVersion: "rev-s02-p2:probe",
    batteryRows: []
  };
}

async function applyMigrations(
  target: TestDatabase,
  accept: (name: string) => boolean
): Promise<void> {
  const directory = new URL("../../migrations/", import.meta.url);
  const migrations = (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name) && accept(name))
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

async function createActiveUser(target: TestDatabase): Promise<{
  userId: string; ownerRef: string; sessionId: string;
}> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  await target.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, Buffer.alloc(32, 0x74), `rev-s02-p2-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await target.pool.query(
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
  return { userId, ownerRef, sessionId };
}

async function configureCrypto(target: TestDatabase, userId: string): Promise<string> {
  const secretRoot = await mkdtemp(join(tmpdir(), "rev-s02-p2-half-"));
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  const keys = new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    const result = await target.pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`,
      [candidate]
    );
    const resolved = result.rows[0]?.user_id;
    if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return resolved;
  });
  configureContentEncryption(target.pool, new ContentCipher(keys));
  return secretRoot;
}

beforeAll(async () => {
  // CELL A — every migration BEFORE 0061, then only 0061's COLUMN half.
  const a = await startTestDatabase();
  await applyMigrations(a, (name) => name < "0061_plan_tier_on_run.sql");
  await a.pool.query("ALTER TABLE core.run ADD COLUMN IF NOT EXISTS plan_tier text");
  await a.pool.query(`ALTER TABLE core.run ADD CONSTRAINT run_plan_tier_vocabulary
    CHECK (plan_tier IS NULL OR plan_tier IN ('free','premium'))`);
  const aIdentity = await createActiveUser(a);
  cells.A = { database: a, secretRoot: await configureCrypto(a, aIdentity.userId), ...aIdentity };

  // CELL B — every migration INCLUDING 0061, then the column dropped again
  // (the 0061 function body is left in place: a partial rollback).
  const b = await startTestDatabase();
  await applyMigrations(b, () => true);
  const bIdentity = await createActiveUser(b);
  cells.B = { database: b, secretRoot: await configureCrypto(b, bIdentity.userId), ...bIdentity };
  await b.pool.query("ALTER TABLE core.run DROP CONSTRAINT IF EXISTS run_plan_tier_vocabulary");
  await b.pool.query("ALTER TABLE core.run DROP COLUMN IF EXISTS plan_tier");
}, 240_000);

afterAll(async () => {
  for (const key of ["A", "B"] as const) {
    const cell = cells[key];
    if (cell === undefined) continue;
    await cell.database?.stop();
    if (cell.secretRoot !== undefined) {
      await rm(cell.secretRoot, { recursive: true, force: true });
    }
  }
});

describe("REV(S02) p2 — the two oracles of 'is 0061 applied?' disagree", () => {
  it("CELL A: proves the halves really are half-applied", async () => {
    const column = await cells.A.database.pool.query<{ applied: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='core' AND table_name='run' AND column_name='plan_tier') AS applied`
    );
    const fn = await cells.A.database.pool.query<{ names: boolean }>(
      `SELECT COALESCE(pg_get_functiondef(
         to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)')
       ) LIKE '%''planTier''%', false) AS names`
    );
    expect({ column: column.rows[0]?.applied, fn: fn.rows[0]?.names })
      .toEqual({ column: true, fn: false });
  });

  it("CELL A: a legacy run writes and reads back its tier", async () => {
    const cell = cells.A;
    const runId = await new RunRepository(cell.database.pool).startRun(
      runInput("premium", { kind: "legacy", legacyAskerId: `rev-s02-p2-${randomUUID()}` }, cell.sessionId)
    );
    const row = await cell.database.pool.query<{ plan_tier: string | null }>(
      "SELECT plan_tier FROM core.run WHERE run_id=$1", [runId]
    );
    expect(row.rows[0]?.plan_tier).toBe("premium");
  });

  it("CELL A: an encrypted server run is created, with the tier silently dropped", async () => {
    const cell = cells.A;
    const runId = await new RunRepository(cell.database.pool).startRun(
      runInput("free", { kind: "server", userId: cell.userId, ownerRef: cell.ownerRef }, cell.sessionId)
    );
    const row = await cell.database.pool.query<{
      plan_tier: string | null; question_line: string;
    }>("SELECT plan_tier,question_line FROM core.run WHERE run_id=$1", [runId]);
    expect(row.rows[0]).toEqual({
      plan_tier: null,
      question_line: CONTENT_CIPHERTEXT_SENTINEL
    });
  });

  it("CELL B: proves the halves really are inverted", async () => {
    const column = await cells.B.database.pool.query<{ applied: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_schema='core' AND table_name='run' AND column_name='plan_tier') AS applied`
    );
    const fn = await cells.B.database.pool.query<{ names: boolean }>(
      `SELECT COALESCE(pg_get_functiondef(
         to_regprocedure('core.create_encrypted_run(jsonb,uuid,uuid,jsonb)')
       ) LIKE '%''planTier''%', false) AS names`
    );
    expect({ column: column.rows[0]?.applied, fn: fn.rows[0]?.names })
      .toEqual({ column: false, fn: true });
  });

  it("CELL B: a legacy run is still created", async () => {
    const cell = cells.B;
    const runId = await new RunRepository(cell.database.pool).startRun(
      runInput("premium", { kind: "legacy", legacyAskerId: `rev-s02-p2-${randomUUID()}` }, cell.sessionId)
    );
    const row = await cell.database.pool.query<{ question_line: string }>(
      "SELECT question_line FROM core.run WHERE run_id=$1", [runId]
    );
    expect(row.rows).toHaveLength(1);
  });

  it("CELL B: RECORDS what an encrypted server run does", async () => {
    const cell = cells.B;
    let outcome: { name: string; code: unknown; message: string };
    try {
      const runId = await new RunRepository(cell.database.pool).startRun(
        runInput("free", { kind: "server", userId: cell.userId, ownerRef: cell.ownerRef }, cell.sessionId)
      );
      outcome = { name: "OK", code: null, message: runId };
    } catch (error) {
      const err = error as { name?: string; code?: unknown; message?: string };
      outcome = {
        name: err.name ?? "unknown",
        code: err.code ?? null,
        message: err.message ?? ""
      };
    }
    // eslint-disable-next-line no-console
    console.log("CELL B encrypted outcome:", JSON.stringify(outcome));
    expect(outcome.name).toBeDefined();
  });
});
