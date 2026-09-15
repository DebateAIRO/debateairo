// TEMPORARY reviewer probe — seat REV-S02-p1-security-data-safety, pass 1.
// Deleted before handoff; never committed.
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRequest, Session } from "@debateai/contract";
import { migrate } from "@debateai/db";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  generateDek,
  loadKek
} from "../../packages/crypto/src/index.js";
import { configureContentEncryption } from "@debateai/db";
import {
  createTestAskAdmissionPoolFacades,
  startTestDatabase,
  type TestDatabase
} from "../support/testDatabase.js";

let database: TestDatabase;
let secretRoot: string;
let userId: string;
let ownerRef: string;
let sessionId: string;

function member(modelId: string, tag: string) {
  return Object.freeze({
    provider_ref: `provider:${tag}`,
    maker: `maker:${tag}`,
    model_id: modelId,
    probe_evidence_ref: `probe:${tag}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

function settingsFor(panel: readonly ReturnType<typeof member>[]): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "rev-s02-p1-sec",
    settlementWatchHandle: "rev-s02-p1-sec",
    resolveDiscoveredPanel: async () => panel,
    resolveEnvelopeBasis: async ({ panelSize }) => ({ max_model_attempts: 1, panel_size: panelSize }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  };
}

function ask(planTier: "free" | "premium"): AskRequest {
  return {
    question_line: `rev-s02-p1-sec ${randomUUID()}`,
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:rev-s02-p1-sec",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "rev probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: []
  } as unknown as AskRequest;
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
    [userId, Buffer.alloc(32, 0x71), `rev-s02-sec-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',
       now()+interval '2 hours',now())`,
    [sessionId, userId,
      `sha256:${randomBytes(32).toString("hex")}`,
      `sha256:${randomBytes(32).toString("hex")}`]
  );
}

function appFor(panel: readonly ReturnType<typeof member>[]): PostgresAskApplication {
  return new PostgresAskApplication(
    database.pool,
    { dispatch: async () => undefined },
    settingsFor(panel),
    undefined,
    database.pool,
    createTestAskAdmissionPoolFacades(database.pool)
  );
}

async function readRun(runId: string) {
  const result = await database.pool.query<{
    plan_tier: string | null;
    agent_count: number;
    discovered_panel: readonly { model_id: string; provider_ref: string }[];
    question_line: string;
    ask_contract: unknown;
  }>(
    `SELECT plan_tier, agent_count, discovered_panel, question_line, ask_contract
     FROM core.run WHERE run_id=$1`, [runId]
  );
  return result.rows[0]!;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await createActiveUser();
  secretRoot = await mkdtemp(join(tmpdir(), "revs02sec-"));
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  await users.store(userId, generateDek());
  const keys = new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    const r = await database.pool.query<{ user_id: string }>(
      `SELECT user_id FROM identity."user" WHERE owner_ref=$1 AND state='active'`, [candidate]
    );
    const resolved = r.rows[0]?.user_id;
    if (resolved === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return resolved;
  });
  configureContentEncryption(database.pool, new ContentCipher(keys));
}, 180_000);

afterAll(async () => {
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

describe("REV-S02-p1-security DB probe: the filtered panel on BOTH write paths", () => {
  const noisyFreePanel = [
    member("gpt-5.6-sol", "sol"),
    member("claude-opus-5", "opus"),
    member("grok-4.6", "grok"),
    member("claude-sonnet-5", "sonnet"),
    member("model:evaluator-local", "evaluator"),
    member("gpt-5.6-luna", "luna")
  ];

  it("LEGACY (plaintext INSERT) persists only the roster, sized and billed to the roster", async () => {
    const session: Session = {
      asker_id: "asker:rev-s02-p1-sec-legacy",
      session_id: randomUUID(),
      caller_scope: "ASKER",
      ownership_provenance: "legacy",
      provisional_identity_model: true
    } as unknown as Session;
    const accepted = await appFor(noisyFreePanel).submit(ask("free"), session, {
      kind: "legacy", legacyAskerId: session.asker_id
    });
    const row = await readRun(accepted.run_ref);
    console.log("LEGACY-ROW =", JSON.stringify({
      plan_tier: row.plan_tier,
      agent_count: row.agent_count,
      panel: row.discovered_panel.map((m) => m.model_id)
    }));
    expect({
      plan_tier: row.plan_tier,
      agent_count: row.agent_count,
      panel: row.discovered_panel.map((m) => m.model_id)
    }).toEqual({
      plan_tier: "free",
      agent_count: 2,
      panel: ["gpt-5.6-luna", "claude-sonnet-5"]
    });
  });

  it("SERVER (create_encrypted_run RPC) persists only the roster, sized and billed to the roster", async () => {
    const session: Session = {
      asker_id: `owner:${ownerRef}`,
      session_id: sessionId,
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    const accepted = await appFor([
      member("gpt-5.6-luna", "luna"),
      member("claude-sonnet-5", "sonnet"),
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus"),
      member("grok-4.6", "grok")
    ]).submit(ask("premium"), session, { kind: "server", userId, ownerRef });
    const row = await readRun(accepted.run_ref);
    console.log("SERVER-ROW =", JSON.stringify({
      plan_tier: row.plan_tier,
      agent_count: row.agent_count,
      panel: row.discovered_panel.map((m) => m.model_id),
      question_line: row.question_line,
      ask_contract: row.ask_contract
    }));
    expect({
      plan_tier: row.plan_tier,
      agent_count: row.agent_count,
      panel: row.discovered_panel.map((m) => m.model_id)
    }).toEqual({
      plan_tier: "premium",
      agent_count: 3,
      panel: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]
    });
  });

  it("V-19: two providers serving one model id — what is persisted and what is billed", async () => {
    const session: Session = {
      asker_id: `owner:${ownerRef}`,
      session_id: sessionId,
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    const accepted = await appFor([
      member("gpt-5.6-sol", "sol-A"),
      member("gpt-5.6-sol", "sol-B"),
      member("claude-opus-5", "opus-A"),
      member("claude-opus-5", "opus-B"),
      member("grok-4.6", "grok-A"),
      member("grok-4.6", "grok-B")
    ]).submit(ask("premium"), session, { kind: "server", userId, ownerRef });
    const row = await readRun(accepted.run_ref);
    console.log("DUPLICATE-ROW =", JSON.stringify({
      agent_count: row.agent_count,
      panel: row.discovered_panel.map((m) => `${m.model_id}@${m.provider_ref}`)
    }));
    expect({
      agent_count: row.agent_count,
      panel: row.discovered_panel.map((m) => `${m.model_id}@${m.provider_ref}`)
    }).toEqual({
      agent_count: 3,
      panel: [
        "gpt-5.6-sol@provider:sol-A",
        "claude-opus-5@provider:opus-A",
        "grok-4.6@provider:grok-A"
      ]
    });
  });

  it("R8 AGAINST A REAL DATABASE: a refused ask writes no row anywhere", async () => {
    const before = await database.pool.query<{ n: string }>(`
      SELECT
        (SELECT count(*) FROM core.run)::text AS n,
        (SELECT count(*) FROM core.question_liveness_event)::text AS liveness,
        (SELECT count(*) FROM core.work_item)::text AS work,
        (SELECT count(*) FROM core.run_ownership_event)::text AS own
    `);
    const session: Session = {
      asker_id: `owner:${ownerRef}`,
      session_id: sessionId,
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };
    let code: string | null = null;
    await appFor([member("gpt-5.6-sol", "sol"), member("claude-opus-5", "opus")])
      .submit(ask("free"), session, { kind: "server", userId, ownerRef })
      .catch((error: Error & { code?: string }) => { code = error.code ?? error.name; });
    const after = await database.pool.query<{ n: string }>(`
      SELECT
        (SELECT count(*) FROM core.run)::text AS n,
        (SELECT count(*) FROM core.question_liveness_event)::text AS liveness,
        (SELECT count(*) FROM core.work_item)::text AS work,
        (SELECT count(*) FROM core.run_ownership_event)::text AS own
    `);
    console.log("R8-DB =", JSON.stringify({ code, before: before.rows[0], after: after.rows[0] }));
    expect({ code, rows: after.rows[0] }).toEqual({
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      rows: before.rows[0]
    });
  });

  it("the panel-count identity holds for every run this probe created", async () => {
    const result = await database.pool.query<{ bad: string }>(`
      SELECT count(*)::text AS bad FROM core.run
      WHERE agent_count <> jsonb_array_length(discovered_panel)
    `);
    expect(result.rows[0]!.bad).toBe("0");
  });
});
