import { describe, expect, it } from "vitest";
import {
  authorizationPolicyInventory,
  buildApi,
  createLegacyDevSessionResolver,
  type AskApplication
} from "@debateai/api";
import { contractInventory } from "@debateai/contract";

const OWNED_RUN_ID = "11111111-1111-4111-8111-111111111111";
const ANSWER_ID = "22222222-2222-4222-8222-222222222222";
const NODE_ID = "33333333-3333-4333-8333-333333333333";

const EXPECTED_AUTHORIZATION_MATRIX = Object.freeze([
  { route: "POST /v1/auth/register", auth: "public", resource: "identity", action: "register" },
  { route: "POST /v1/auth/verify-email", auth: "public", resource: "identity", action: "verify-email" },
  { route: "POST /v1/auth/resend-verification", auth: "public", resource: "identity", action: "resend-verification" },
  { route: "POST /v1/auth/mfa/totp/begin", auth: "public", resource: "identity", action: "begin-totp" },
  { route: "POST /v1/auth/mfa/totp/verify", auth: "public", resource: "identity", action: "verify-totp" },
  { route: "POST /v1/auth/mfa/recovery-codes/generate", auth: "public", resource: "identity", action: "generate-recovery-codes" },
  { route: "POST /v1/auth/mfa/recovery-codes/confirm", auth: "public", resource: "identity", action: "confirm-recovery-code" },
  { route: "POST /v1/auth/login", auth: "public", origin: "trusted", resource: "identity", action: "login" },
  { route: "POST /v1/auth/logout", auth: "user", resource: "session-self", action: "logout" },
  { route: "GET /v1/auth/sessions", auth: "user", resource: "session-owner", action: "list" },
  { route: "DELETE /v1/auth/sessions/{id}", auth: "user", resource: "session-owner", action: "revoke" },
  { route: "DELETE /v1/auth/sessions", auth: "user", resource: "session-owner", action: "revoke-all" },
  { route: "POST /v1/auth/step-up", auth: "user", resource: "session-self", action: "step-up" },
  { route: "DELETE /v1/account", auth: "user", resource: "identity", action: "schedule-erasure" },
  { route: "GET /v1/account/erasure", auth: "user", resource: "identity", action: "read-erasure" },
  { route: "POST /v1/account/erasure/cancel", auth: "user", resource: "identity", action: "cancel-erasure" },
  { route: "DELETE /v1/debates/{id}", auth: "user", resource: "run-owner", action: "erase-private" },
  { route: "GET /v1/public/debates", auth: "public", resource: "public-debate", action: "list" },
  { route: "GET /v1/public/debates/{id}", auth: "public", resource: "public-debate", action: "read" },
  { route: "POST /v1/asks", auth: "user", resource: "run-owner", action: "create" },
  { route: "GET /v1/session", auth: "user", resource: "session-self", action: "read" },
  { route: "GET /v1/deployment", auth: "operator", resource: "deployment", action: "read" },
  { route: "GET /v1/dev/evaluator", auth: "operator", resource: "evaluator", action: "read" },
  { route: "POST /v1/dev/evaluator/consumer-selection", auth: "operator", resource: "evaluator", action: "select-consumer" },
  { route: "GET /v1/answers", auth: "user", resource: "run-owner", action: "list" },
  { route: "GET /v1/answers/{id}", auth: "user", resource: "run-owner", action: "read-answer" },
  { route: "GET /v1/answers/{id}/inspection", auth: "user", resource: "run-owner", action: "read-inspection" },
  { route: "GET /v1/answers/{id}/nodes/{nodeId}", auth: "user", resource: "run-owner", action: "read-node" },
  { route: "GET /v1/answers/{id}/ledger-digest", auth: "user", resource: "run-owner", action: "read-ledger-digest" },
  { route: "POST /v1/answers/{id}/investigations/{gapRef}", auth: "user", resource: "run-owner", action: "investigate" },
  { route: "POST /v1/answers/{id}/memory-link/unlink", auth: "user", resource: "run-owner", action: "unlink-memory" },
  { route: "GET /v1/runs/{id}", auth: "user", resource: "run-owner", action: "read-run" },
  { route: "GET /v1/runs/{id}/visibility", auth: "user", resource: "run-owner", action: "read-visibility" },
  { route: "GET /v1/runs/{id}/events", auth: "user", resource: "run-owner", action: "read-events" },
  { route: "GET /v1/runs/{id}/answer", auth: "user", resource: "run-owner", action: "read-run-answer" },
  { route: "POST /v1/runs/{id}/publish", auth: "user", resource: "run-owner", action: "publish" },
  { route: "POST /v1/runs/{id}/unpublish", auth: "user", resource: "run-owner", action: "unpublish" }
] as const);

const validAskPayload = () => ({
  question_line: "Can an asker promote itself?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker:test",
  composition_budget_tier: "low",
  depth_params: { depth: 1 },
  decision_scope: "test",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
});

const evaluatorView = () => ({
  catalog: { state: "UNAVAILABLE" as const, probeId: null, failureCode: "TEST", models: [] },
  selectedConsumer: null,
  dispatchBinding: {
    state: "UNBOUND" as const, reason: "ROW_ABSENT" as const,
    registerVersion: 1, sourceRef: null
  },
  harvestedRows: 0,
  domains: [],
  profiles: [],
  parkedRuns: []
});

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId,use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {
      yield {
        event_id: "event:test", event_type: "run.accepted", run_ref: OWNED_RUN_ID,
        at_sequence: 1, payload: {}
      };
    }
  };
}

function buildRoleApi(application: AskApplication = fixtureApplication()) {
  return buildApi({
    application,
    legacyDevSessionResolver: createLegacyDevSessionResolver({
      userToken: "exact-user-token",
      operatorToken: "exact-operator-token"
    })
  });
}

describe("S7 deny-by-default authorization", () => {
  it("keeps one complete, duplicate-free policy row per contract route", () => {
    const governed = authorizationPolicyInventory.map((policy) => policy.route);
    expect(new Set(contractInventory.routes).size).toBe(contractInventory.routes.length);
    expect(new Set(governed).size).toBe(governed.length);
    expect(governed).toHaveLength(contractInventory.routes.length);
    expect(new Set(governed)).toEqual(new Set(contractInventory.routes));
    expect(authorizationPolicyInventory).toEqual(EXPECTED_AUTHORIZATION_MATRIX);
  });

  it("registers the full optional composition and rejects anonymous access to every governed private route", async () => {
    const api = buildApi({
      application: fixtureApplication(),
      registration: {} as never,
      mfa: {} as never,
      sessions: {} as never,
      evaluatorDevMenu: {} as never,
      evaluatorDevMenuRegisterVersion: 1
    });
    for (const policy of EXPECTED_AUTHORIZATION_MATRIX) {
      const [method, template] = policy.route.split(" ") as [string, string];
      const httpMethod = method as "GET" | "POST" | "DELETE";
      const registeredUrl = template.replace(/\{([^}]+)\}/g, ":$1");
      expect(api.hasRoute({ method: httpMethod, url: registeredUrl }), policy.route).toBe(true);
      if (policy.auth === "public") continue;
      const requestUrl = template
        .replace("{nodeId}", NODE_ID)
        .replace("{gapRef}", "gap:test")
        .replace("{id}", policy.route.includes("/runs/") ? OWNED_RUN_ID : ANSWER_ID);
      const response = await api.inject({ method: httpMethod, url: requestUrl });
      expect(response.statusCode, policy.route).toBe(401);
      expect(response.json(), policy.route).toEqual({ error: "SESSION_REQUIRED" });
    }
    await api.close();
  });

  it("rejects registration of a route outside the canonical policy table", async () => {
    const api = buildRoleApi();
    expect(() => api.get("/test/undeclared-auth-policy", async () => ({ exposed: true })))
      .toThrow("AUTHORIZATION_POLICY_UNDECLARED:GET /test/undeclared-auth-policy");
    await api.close();
  });

  it("operator-gates deployment with the exact transitional credential and stays default-off", async () => {
    const api = buildRoleApi();
    const ordinary = await api.inject({
      method: "GET", url: "/v1/deployment",
      headers: { "x-user-dev-token": "exact-user-token" }
    });
    const operator = await api.inject({
      method: "GET", url: "/v1/deployment",
      headers: { "x-user-dev-token": "exact-operator-token" }
    });
    expect(ordinary.statusCode).toBe(403);
    expect(operator.statusCode).toBe(200);
    await api.close();

    const defaultOff = buildApi({ application: fixtureApplication() });
    expect((await defaultOff.inject({
      method: "GET", url: "/v1/deployment",
      headers: { "x-user-dev-token": "exact-operator-token" }
    })).statusCode).toBe(401);
    await defaultOff.close();
  });

  it("operator-gates both evaluator routes", async () => {
    const selectedBy: string[] = [];
    const api = buildApi({
      application: fixtureApplication(),
      legacyDevSessionResolver: createLegacyDevSessionResolver({
        userToken: "exact-user-token",
        operatorToken: "exact-operator-token"
      }),
      evaluatorDevMenuRegisterVersion: 1,
      evaluatorDevMenu: {
        readView: async () => evaluatorView(),
        selectConsumerModel: async (input) => {
          selectedBy.push(input.selectedBy);
          return { consumerSelectionId: "selection:test", modelId: input.modelId, selectedAt: input.selectedAt };
        }
      }
    });
    for (const route of [
      { method: "GET" as const, url: "/v1/dev/evaluator" },
      {
        method: "POST" as const, url: "/v1/dev/evaluator/consumer-selection",
        payload: { model_id: "model:test" }
      }
    ]) {
      expect((await api.inject({
        ...route, headers: { "x-user-dev-token": "exact-user-token" }
      })).statusCode).toBe(403);
    }
    expect((await api.inject({
      method: "GET", url: "/v1/dev/evaluator",
      headers: { "x-user-dev-token": "exact-operator-token" }
    })).statusCode).toBe(200);
    expect((await api.inject({
      method: "POST", url: "/v1/dev/evaluator/consumer-selection",
      headers: { "x-user-dev-token": "exact-operator-token" },
      payload: { model_id: "model:test" }
    })).statusCode).toBe(201);
    expect(selectedBy).toHaveLength(1);
    await api.close();
  });

  it("derives caller scope from the authenticated principal for a valid ask", async () => {
    let submittedScope: string | undefined;
    const application = fixtureApplication();
    application.submit = async (_ask, session) => {
      submittedScope = session.caller_scope;
      return { run_ref: "run:test", status: "QUEUED" };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "POST", url: "/v1/asks",
      headers: { "x-user-dev-token": "exact-user-token" },
      payload: validAskPayload()
    });
    expect(response.statusCode).toBe(202);
    expect(submittedScope).toBe("ASKER");
    await api.close();
  });

  it.each(["caller_scope", "decision_owner", "action_owner"] as const)(
    "rejects the forbidden %s claim by itself",
    async (field) => {
    let submitted = false;
    const application = fixtureApplication();
    application.submit = async () => {
      submitted = true;
      return { run_ref: "run:test", status: "QUEUED" };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "exact-user-token" },
      payload: {
        ...validAskPayload(),
        [field]: field === "caller_scope" ? "OPERATOR" : "attacker"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(submitted).toBe(false);
    await api.close();
    }
  );

  it("preauthorizes an owned SSE stream before committing status 200", async () => {
    let streamed = false;
    let ownershipReads = 0;
    const application = fixtureApplication();
    application.readRun = async () => {
      ownershipReads += 1;
      return null;
    };
    application.events = async function* () {
      streamed = true;
      yield {
        event_id: "event:foreign", event_type: "run.accepted", run_ref: OWNED_RUN_ID,
        at_sequence: 1, payload: {}
      };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "GET", url: `/v1/runs/${OWNED_RUN_ID}/events`,
      headers: { "x-user-dev-token": "exact-user-token" }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    expect(ownershipReads).toBe(1);
    expect(streamed).toBe(false);
    await api.close();
  });

  it("streams only after a successful owned-run preflight", async () => {
    let streamed = false;
    const application = fixtureApplication();
    application.readRun = async (runId) => ({
      run_ref: runId, question_line: "Owned stream", state: "QUEUED",
      terminal_reason: null, hold_until: null
    });
    application.events = async function* (runId) {
      streamed = true;
      yield {
        event_id: "event:owned", event_type: "run.accepted", run_ref: runId,
        at_sequence: 1, payload: {}
      };
    };
    const api = buildRoleApi(application);
    const response = await api.inject({
      method: "GET", url: `/v1/runs/${OWNED_RUN_ID}/events`,
      headers: { "x-user-dev-token": "exact-user-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: run.accepted");
    expect(streamed).toBe(true);
    await api.close();
  });

  it.each([
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}`, error: "ANSWER_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/inspection`, error: "INSPECTION_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/ledger-digest`, error: "LEDGER_DIGEST_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/nodes/${NODE_ID}`, error: "NODE_NOT_FOUND" },
    {
      method: "POST" as const, url: `/v1/answers/${ANSWER_ID}/investigations/gap:test`,
      payload: { user_input: null, human_steer_input: true }, error: "INVESTIGATION_GAP_NOT_FOUND"
    },
    { method: "POST" as const, url: `/v1/answers/${ANSWER_ID}/memory-link/unlink`, error: "MEMORY_LINK_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/runs/${OWNED_RUN_ID}`, error: "RUN_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/runs/${OWNED_RUN_ID}/answer`, error: "ANSWER_NOT_SERVED" },
    { method: "GET" as const, url: `/v1/runs/${OWNED_RUN_ID}/events`, error: "RUN_NOT_FOUND" }
  ])("maps denied owned route $method $url to its closed 404 face", async (route) => {
    const application = fixtureApplication();
    application.unlinkMemoryLink = async () => null;
    const api = buildApi({
      application,
      legacyDevSessionResolver: createLegacyDevSessionResolver({
        userToken: "foreign-user-token",
        operatorToken: "not-used"
      })
    });
    const foreign = await api.inject({
      ...route, headers: { "x-user-dev-token": "foreign-user-token" }
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: route.error });
    await api.close();
  });

  it.each([
    { method: "GET" as const, url: "/v1/answers/not-a-uuid", error: "ANSWER_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/inspection", error: "INSPECTION_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/answers/not-a-uuid/ledger-digest", error: "LEDGER_DIGEST_NOT_FOUND" },
    { method: "GET" as const, url: `/v1/answers/${ANSWER_ID}/nodes/not-a-uuid`, error: "NODE_NOT_FOUND" },
    {
      method: "POST" as const, url: "/v1/answers/not-a-uuid/investigations/gap:test",
      payload: { user_input: null, human_steer_input: true }, error: "INVESTIGATION_GAP_NOT_FOUND"
    },
    { method: "POST" as const, url: "/v1/answers/not-a-uuid/memory-link/unlink", error: "MEMORY_LINK_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/runs/not-a-uuid", error: "RUN_NOT_FOUND" },
    { method: "GET" as const, url: "/v1/runs/not-a-uuid/answer", error: "ANSWER_NOT_SERVED" },
    { method: "GET" as const, url: "/v1/runs/not-a-uuid/events", error: "RUN_NOT_FOUND" }
  ])("maps malformed resource IDs on $method $url to the closed 404 face", async (route) => {
    const api = buildRoleApi();
    const response = await api.inject({
      ...route, headers: { "x-user-dev-token": "exact-user-token" }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: route.error });
    await api.close();
  });

  it("does not expose implicit HEAD carriers for any governed GET route", async () => {
    const api = buildApi({
      application: fixtureApplication(),
      legacyDevSessionResolver: createLegacyDevSessionResolver({ operatorToken: "exact-operator-token" }),
      evaluatorDevMenuRegisterVersion: 1,
      evaluatorDevMenu: {
        readView: async () => evaluatorView(),
        selectConsumerModel: async (input) => ({
          consumerSelectionId: "selection:test", modelId: input.modelId, selectedAt: input.selectedAt
        })
      }
    });
    for (const policy of authorizationPolicyInventory.filter(({ route }) => route.startsWith("GET "))) {
      const url = policy.route.slice(4)
        .replace("{id}", OWNED_RUN_ID)
        .replace("{nodeId}", "22222222-2222-4222-8222-222222222222");
      expect((await api.inject({
        method: "HEAD", url,
        headers: { "x-user-dev-token": "exact-operator-token" }
      })).statusCode, policy.route).toBe(404);
    }
    await api.close();
  });
});
