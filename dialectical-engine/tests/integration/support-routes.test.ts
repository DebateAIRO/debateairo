import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import type {
  SupportApplication,
  SupportKnowledgeStatusPort
} from "../../apps/api/src/support/index.js";
import type {
  SupportSessionPort
} from "../../apps/api/src/support/session.js";
import { migrate, PostgresSupportRepository } from "../../packages/db/src/index.js";
import type { SupportConfigurationState } from "../../packages/register/src/index.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const KB_VERSION = "a".repeat(64);
const IDENTITY = testHttpIdentity("support-routes");

function askApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () { return; }
  };
}

function configuration(enabled: boolean): Pick<SupportApplication["configuration"], "current"> {
  const state = {
    kind: "AVAILABLE",
    snapshot: {
      supportRegisterVersion: "9007199254740992",
      values: { supportEnabled: enabled }
    }
  } as unknown as SupportConfigurationState;
  return Object.freeze({ current: async () => state });
}

const knowledge: SupportKnowledgeStatusPort = Object.freeze({
  status: async () => Object.freeze({ kbVersion: KB_VERSION, shipped: 12, ignored: 1 })
});

describe("SUP-01 support routes", () => {
  let database: TestDatabase;
  let sessions: SupportSessionPort;

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    sessions = new PostgresSupportRepository(database.pool);
  }, 120_000);

  afterAll(async () => database?.stop(), 120_000);

  function api(enabled: boolean) {
    return buildApi({
      application: askApplication(),
      sessions: testSessionApplication([IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN,
      support: { configuration: configuration(enabled), sessions, knowledge }
    });
  }

  it("creates an anonymous capability session without storing the raw token", async () => {
    const server = api(true);
    const response = await server.inject({ method: "POST", url: "/v1/support/sessions", payload: { language: "en" } });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ session: { session_id: string }; session_token: string; first_message: { text: string } }>();
    expect(body.session_token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(body.first_message.text).toContain("an AI");
    const stored = await database.pool.query<{ identity_owner_ref: string | null; session_token_sha256: string }>(
      "SELECT identity_owner_ref,session_token_sha256 FROM support.session WHERE session_id=$1",
      [body.session.session_id]
    );
    expect(stored.rows[0]?.identity_owner_ref).toBeNull();
    expect(stored.rows[0]?.session_token_sha256).not.toBe(body.session_token);
    await server.close();
  });

  it("treats an invalid identity cookie as anonymous", async () => {
    const server = api(true);
    const response = await server.inject({
      method: "POST", url: "/v1/support/sessions",
      headers: { cookie: `__Host-debateai-session=${"x".repeat(43)}` },
      payload: { language: "ro" }
    });
    expect(response.statusCode).toBe(201);
    const row = await database.pool.query<{ identity_owner_ref: string | null }>(
      "SELECT identity_owner_ref FROM support.session WHERE session_id=$1",
      [response.json().session.session_id]
    );
    expect(row.rows[0]?.identity_owner_ref).toBeNull();
    await server.close();
  });

  it("requires trusted origin and CSRF only when a mutating request binds a valid identity cookie", async () => {
    const server = api(true);
    const denied = await server.inject({
      method: "POST", url: "/v1/support/sessions",
      headers: testSessionHeaders(IDENTITY), payload: { language: "en" }
    });
    expect(denied.statusCode).toBe(403);
    const allowed = await server.inject({
      method: "POST", url: "/v1/support/sessions",
      headers: testSessionHeaders(IDENTITY, true), payload: { language: "en" }
    });
    expect(allowed.statusCode).toBe(201);
    const stored = await database.pool.query<{ identity_owner_ref: string | null }>(
      "SELECT identity_owner_ref FROM support.session WHERE session_id=$1",
      [allowed.json().session.session_id]
    );
    expect(stored.rows[0]?.identity_owner_ref).toBe(IDENTITY.authenticated.ownerRef);
    await server.close();
  });

  it("returns DISABLED without a model-call reservation or transcript row", async () => {
    const server = api(false);
    const opened = await server.inject({ method: "POST", url: "/v1/support/sessions", payload: { language: "en" } });
    const body = opened.json<{ session: { session_id: string }; session_token: string }>();
    const response = await server.inject({
      method: "POST", url: `/v1/support/sessions/${body.session.session_id}/messages`,
      headers: { "x-support-session-token": body.session_token }, payload: { text: "hello" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: "DISABLED", code: "SUPPORT_DISABLED" });
    expect((await database.pool.query("SELECT 1 FROM support.message")).rowCount).toBe(0);
    await server.close();
  });

  it("composes public status from register, KB, and support repository ports", async () => {
    const server = api(true);
    const response = await server.inject({ method: "GET", url: "/v1/support/status" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      calls_today: 0,
      kb_version: KB_VERSION,
      kb_loaded: { shipped: 12, ignored: 1 },
      relay_state: "UNAVAILABLE"
    });
    await server.close();
  });
});
