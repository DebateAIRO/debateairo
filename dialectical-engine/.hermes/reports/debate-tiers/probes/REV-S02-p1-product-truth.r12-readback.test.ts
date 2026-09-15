// PROMOTED PROBE — seat REV-S02-p1-product-truth, mission debate-tiers, written against
// slice head 9ef275aa (slice/tiers-s02). Copy into <worktree>/tests/unit (refusal-face) or
// <worktree>/tests/integration (r12-readback) and run `pnpm exec vitest run <path>` from the
// worktree root. No absolute path is hard-coded; every path is relative to the worktree root
// (process.cwd()). Restores nothing: these probes MUTATE no file.
// Property: acceptance step 9 / R12 end to end. C1 tests RunRepository.startRun directly and
// C4 mocks startRun; NOBODY runs ask -> evaluateAskAdmission -> startRun -> SELECT plan_tier.
// This probe closes that gap on the embedded Postgres, for BOTH tiers x BOTH principals (4 cells;
// C1 covers 2), and proves the refusal writes no run row.
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
import { configureContentEncryption, createPool, migrate } from "@debateai/db";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRequest, PlanTier, Session } from "@debateai/contract";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let sessionId: string;
const extraPools: Array<{ end(): Promise<void> }> = [];

function rosterPanel(tier: PlanTier) {
  return PLAN_TIER_ROSTERS[tier].map((modelId, index) => Object.freeze({
    provider_ref: `provider:${tier}:${index + 1}`,
    maker: `maker:${tier}:${index + 1}`,
    model_id: modelId,
    probe_evidence_ref: `probe:${tier}:${index + 1}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  }));
}

function settingsFor(panel: readonly ReturnType<typeof rosterPanel>[number][]): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "revp1-readback",
    settlementWatchHandle: "revp1-readback",
    resolveDiscoveredPanel: async () => panel,
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  };
}

function askFor(planTier: PlanTier): AskRequest {
  return {
    question_line: `Readback probe ${planTier} ${randomUUID()}`,
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "revp1:readback",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "readback probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: []
  };
}

function newPool() {
  const pool = createPool(database.connectionString);
  extraPools.push(pool as unknown as { end(): Promise<void> });
  return pool;
}

function applicationFor(panel: readonly ReturnType<typeof rosterPanel>[number][]) {
  return new PostgresAskApplication(
    database.pool,
    { dispatch: async () => undefined },
    settingsFor(panel),
    { read: async () => [] },
    newPool(),
    { server: newPool(), legacy: newPool() }
  );
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
    [userId, Buffer.alloc(32, 0x71), `revp1-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [sessionId, userId, `sha256:${randomBytes(32).toString("hex")}`, `sha256:${randomBytes(32).toString("hex")}`]
  );
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await createActiveUser();
  secretRoot = await mkdtemp(join(tmpdir(), "revp1-readback-"));
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  const keys = new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    const result = await database.pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`, [candidate]
    );
    const resolved = result.rows[0]?.user_id;
    if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return resolved;
  });
  configureContentEncryption(database.pool, new ContentCipher(keys));
}, 180_000);

afterAll(async () => {
  for (const pool of extraPools) await pool.end().catch(() => undefined);
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("REV probe — R12 read-back through the REAL ask path", () => {
  it("server principal: free and premium both land in core.run.plan_tier", async () => {
    const rows: string[] = [];
    for (const tier of ["free", "premium"] as const) {
      const application = applicationFor(rosterPanel(tier));
      const session: Session = {
        session_id: sessionId,
        asker_id: `owner:${ownerRef}`,
        caller_scope: "ASKER",
        ownership_provenance: "server_session",
        provisional_identity_model: false
      };
      const accepted = await application.submit(askFor(tier), session, {
        kind: "server", userId, ownerRef
      });
      const read = await database.pool.query<{ plan_tier: string | null; agent_count: number }>(
        "SELECT plan_tier,agent_count FROM core.run WHERE run_id=$1", [accepted.run_ref]
      );
      rows.push(`server/${tier}: plan_tier=${read.rows[0]?.plan_tier} agent_count=${read.rows[0]?.agent_count}`);
      expect(read.rows[0]?.plan_tier).toBe(tier);
      expect(read.rows[0]?.agent_count).toBe(PLAN_TIER_ROSTERS[tier].length);
    }
    console.log("\n=== R12 SERVER PRINCIPAL ===\n" + rows.join("\n"));
  }, 120_000);

  it("legacy principal: free and premium both land in core.run.plan_tier", async () => {
    const rows: string[] = [];
    for (const tier of ["free", "premium"] as const) {
      const application = applicationFor(rosterPanel(tier));
      const legacyAskerId = `legacy-${randomUUID()}`;
      const session: Session = {
        session_id: randomUUID(),
        asker_id: legacyAskerId,
        caller_scope: "ASKER",
        ownership_provenance: "legacy_header",
        provisional_identity_model: true
      };
      const accepted = await application.submit(askFor(tier), session, {
        kind: "legacy", legacyAskerId
      });
      const read = await database.pool.query<{ plan_tier: string | null; agent_count: number }>(
        "SELECT plan_tier,agent_count FROM core.run WHERE run_id=$1", [accepted.run_ref]
      );
      rows.push(`legacy/${tier}: plan_tier=${read.rows[0]?.plan_tier} agent_count=${read.rows[0]?.agent_count}`);
      expect(read.rows[0]?.plan_tier).toBe(tier);
      expect(read.rows[0]?.agent_count).toBe(PLAN_TIER_ROSTERS[tier].length);
    }
    console.log("\n=== R12 LEGACY PRINCIPAL ===\n" + rows.join("\n"));
  }, 120_000);

  it("R8 on a real database: a refused ask writes no run row and no liveness/work row", async () => {
    const before = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM core.run");
    const beforeLiveness = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text FROM core.question_liveness_event"
    );
    // Today's real fleet: only the two premium members that exist probe HEALTHY.
    const application = applicationFor([
      ...rosterPanel("premium").filter((m) => m.model_id !== "grok-4.6")
    ]);
    const session: Session = {
      session_id: sessionId,
      asker_id: `owner:${ownerRef}`,
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    let refusal: unknown = null;
    try {
      await application.submit(askFor("premium"), session, { kind: "server", userId, ownerRef });
    } catch (error) { refusal = error; }

    const after = await database.pool.query<{ count: string }>("SELECT count(*)::text FROM core.run");
    const afterLiveness = await database.pool.query<{ count: string }>(
      "SELECT count(*)::text FROM core.question_liveness_event"
    );
    console.log("\n=== R8 ON A REAL DATABASE ===\n" +
      `refusal=${(refusal as { name?: string; code?: string })?.name}/${(refusal as { code?: string })?.code}\n` +
      `core.run ${before.rows[0]!.count} -> ${after.rows[0]!.count}\n` +
      `question_liveness_event ${beforeLiveness.rows[0]!.count} -> ${afterLiveness.rows[0]!.count}`);
    expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
    expect(afterLiveness.rows[0]!.count).toBe(beforeLiveness.rows[0]!.count);
    expect((refusal as { code?: string })?.code).toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
  }, 120_000);

  it("prints the R12 read-back exactly as acceptance step 9 words it", async () => {
    const application = applicationFor(rosterPanel("free"));
    const session: Session = {
      session_id: sessionId,
      asker_id: `owner:${ownerRef}`,
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    const accepted = await application.submit(askFor("free"), session, {
      kind: "server", userId, ownerRef
    });
    const read = await database.pool.query<{ plan_tier: string | null }>(
      `SELECT plan_tier FROM core.run WHERE run_id='${accepted.run_ref}'`
    );
    console.log("\n=== STEP 9, RUN VERBATIM ===\n" +
      `SELECT plan_tier FROM core.run WHERE run_id='${accepted.run_ref}'\n-> ${read.rows[0]?.plan_tier}`);
    expect(read.rows[0]?.plan_tier).toBe("free");
  }, 120_000);
});
