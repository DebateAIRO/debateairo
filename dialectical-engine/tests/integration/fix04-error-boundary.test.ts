import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  AskRefusal,
  buildApi,
  type AskApplication,
} from "@debateai/api";
import { TypedDomainError } from "@debateai/kernel";
import {
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  installCaptureEmitter,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";

const EVENT_REF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_TOKEN = "a".repeat(43);
const CSRF_TOKEN = "b".repeat(43);
const USER_HEADERS = Object.freeze({
  cookie: `__Host-debateai-session=${SESSION_TOKEN}; __Host-debateai-csrf=${CSRF_TOKEN}`,
});
const USER_MUTATION_HEADERS = Object.freeze({
  ...USER_HEADERS,
  origin: "https://app.debateai.test",
  "x-csrf-token": CSRF_TOKEN,
});

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0,
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => ({
      answer_id: RUN_ID,
      run_ref: RUN_ID,
      work_items: [],
      entries: [],
    }),
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" },
    }),
    events: async function* () {},
  };
}

function sessions() {
  const authenticated = Object.freeze({
    session: Object.freeze({
      asker_id: `owner:${RUN_ID}`,
      session_id: "22222222-2222-4222-8222-222222222222",
      caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const,
      provisional_identity_model: false as const,
    }),
    userId: "33333333-3333-4333-8333-333333333333",
    ownerRef: "44444444-4444-4444-8444-444444444444",
    tokenHash: "sha256:test-session",
    csrfTokenHash: "sha256:test-csrf",
    authKind: "cookie" as const,
  });
  return Object.freeze({
    authenticate: async (token: string) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_authenticated: unknown, token: string) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required" as const, challengeToken: "c".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated" as const,
      sessionToken: SESSION_TOKEN,
      csrfToken: CSRF_TOKEN,
      session: authenticated.session,
    }),
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN }),
  });
}

function apiFor(app: AskApplication) {
  return buildApi({
    application: app,
    sessions: sessions(),
    allowedOrigin: "https://app.debateai.test",
  });
}

function installProbe(order: string[] = []) {
  const entries: CaptureQueueEntry[] = [];
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: {
      offer(entry) {
        order.push("emit");
        entries.push(entry);
        return true;
      },
    },
    health,
    gaps: createCaptureGapCounter({ health }),
    sourceEventRef: () => EVENT_REF,
  }));
  return entries;
}

function redact(entry: CaptureQueueEntry) {
  return createSharedRedactor({
    environment: "test",
    build_ref: "test-build",
    build_dirty: false,
    runtime: "api",
    component: Object.freeze({ process: "api", package: "@debateai/api" }),
    writer_identity: "api",
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
  }).redact(entry);
}

afterEach(() => {
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: { offer: () => true },
    health,
    gaps: createCaptureGapCounter({ health }),
  }));
});

describe("FIX-04 API error boundary", () => {
  it("imports the API installer first and emits a 500 before returning its exact correlation id", async () => {
    const mainPath = fileURLToPath(new URL("../../apps/api/src/main.ts", import.meta.url));
    const firstStatement = readFileSync(mainPath, "utf8").split("\n", 1)[0];
    expect(firstStatement).toBe('import "@debateai/obs-capture/install/api";');

    const entries = installProbe();
    const app = application();
    app.readAnswerIndex = async () => {
      throw new TypedDomainError(
        "DEPLOYMENT_REGISTER_UNAVAILABLE",
        "No sealed deployment register exists",
      );
    };
    const api = apiFor(app);
    const response = await api.inject({
      method: "GET",
      url: "/v1/answers?limit=1&offset=0",
      headers: USER_HEADERS,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "INTERNAL_ERROR",
      correlation_id: EVENT_REF,
    });
    expect(entries).toHaveLength(1);
    const envelope = redact(entries[0]!);
    expect(envelope).toMatchObject({
      runtime: "api",
      capture_point: "http",
      source_event_ref: EVENT_REF,
      component: {
        process: "api",
        package: "@debateai/api",
        route_template: "/v1/answers",
      },
    });
    await api.close();
  });

  it("keeps the 4xx body stable while recording the request failure", async () => {
    const entries = installProbe();
    const app = application();
    app.submit = async () => {
      throw new AskRefusal(new TypedDomainError(
        "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
        "Private history exceeds the bounded comparison window",
      ));
    };
    const api = apiFor(app);
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: USER_MUTATION_HEADERS,
      payload: {
        question_line: "What follows from this evidence?",
        risk_tier: "casual",
        tier_source: "ASKER",
        tier_provenance_ref: "asker-declaration:test",
        composition_budget_tier: "low",
        depth_params: { depth: 1 },
        decision_scope: "test-layer scope",
        as_of: "2026-08-07T00:00:00.000Z",
        steering_presets: [],
        steering_annotations: [],
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
      message: "Private history exceeds the bounded comparison window",
    });
    expect(entries).toHaveLength(1);
    expect(redact(entries[0]!).component).toMatchObject({
      route_template: "/v1/asks",
    });
    await api.close();
  });

  it("offers the occurrence before destroying a response whose headers were sent", async () => {
    const order: string[] = [];
    const entries = installProbe(order);
    const app = application();
    app.readRun = async (runId) => ({
      run_ref: runId,
      question_line: "A streamed run",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null,
    });
    app.events = async function* () {
      throw new TypedDomainError("RUN_NOT_FOUND", "Run vanished during streaming");
    };
    const api = apiFor(app);
    api.server.on("connection", (socket) => {
      const destroy = socket.destroy.bind(socket);
      socket.destroy = ((...args: Parameters<typeof socket.destroy>) => {
        order.push("destroy");
        return destroy(...args);
      }) as typeof socket.destroy;
    });
    await api.listen({ host: "127.0.0.1", port: 0 });
    const address = api.server.address();
    if (address === null || typeof address === "string") throw new Error("FIX04_TEST_LISTENER_REQUIRED");

    const outcome = await fetch(`http://127.0.0.1:${address.port}/v1/runs/${RUN_ID}/events`, {
      headers: USER_HEADERS,
    }).then(async (response) => {
      await response.text();
      return "ended" as const;
    }, () => "aborted" as const);

    expect(outcome).toBe("aborted");
    expect(entries).toHaveLength(1);
    expect(order.indexOf("emit")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("destroy")).toBeGreaterThan(order.indexOf("emit"));
    expect(redact(entries[0]!).component).toMatchObject({
      route_template: "/v1/runs/:id/events",
    });
    await api.close();
  });
});
