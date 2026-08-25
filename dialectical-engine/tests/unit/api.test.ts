import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  AskRefusal,
  buildApi as buildApiBase,
  createLegacyDevSessionResolver,
  evaluateAskAdmission,
  PostgresAskApplication,
  preserveSubmittedTierSource,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { createContractClient, type AskRequest, type Session } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const QUEUED_RUN_ID = "22222222-2222-4222-8222-222222222222";
const MISSING_RUN_ID = "33333333-3333-4333-8333-333333333333";
const ANSWER_ID = "44444444-4444-4444-8444-444444444444";

/** Explicit test-only S9 rollback seam; production buildApi has no fallback. */
function buildApi(options: Parameters<typeof buildApiBase>[0]) {
  return buildApiBase({
    ...options,
    legacyDevSessionResolver(token): Session | null {
      if (typeof token !== "string" || token.trim() === "") return null;
      const digest = createHash("sha256").update(token).digest("hex");
      return {
        asker_id: `asker:${digest}`,
        session_id: `legacy:${digest}`,
        caller_scope: "ASKER",
        ownership_provenance: "user_dev_token",
        provisional_identity_model: true
      };
    }
  });
}

function buildOperatorApi(options: Parameters<typeof buildApiBase>[0]) {
  return buildApiBase({
    ...options,
    legacyDevSessionResolver: createLegacyDevSessionResolver({ operatorToken: "operator-token" })
  });
}

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId,use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => ({
      answer_id: ANSWER_ID,
      answer_version: 1,
      conformance: {
        outcome: "PASS",
        coverage_mode: "EXHAUSTIVE",
        segment_results: []
      },
      segment_suppressions: [],
      shadow_suppressions: []
    }),
    readLedgerDigest: async () => ({ answer_id: ANSWER_ID, run_ref: RUN_ID, work_items: [], entries: [] }),
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: RUN_ID, at_sequence: 1, payload: {} };
    }
  };
}

function admissionSettings(
  override: Partial<RunCreationSettings> = {}
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:test",
    settlementWatchHandle: "watch:test",
    resolveDiscoveredPanel: async () => fixtureDiscoveredPanel(2),
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    }),
    ...override
  };
}

describe("Fastify sole facade / FX-WIRE-03", () => {
  it.each([
    {
      submitted: "ASKER" as const,
      resolved: { effectiveRiskTier: "standard" as const, tierSource: "ASKER" as const, tierProvenanceRef: "asker:test" },
      expectedSource: "ASKER" as const
    },
    {
      submitted: "MACHINE_DEFAULT" as const,
      resolved: { effectiveRiskTier: "standard" as const, tierSource: "ASKER" as const, tierProvenanceRef: "machine:deployment-floor" },
      expectedSource: "MACHINE_DEFAULT" as const
    },
    {
      submitted: "ASKER" as const,
      resolved: { effectiveRiskTier: "high-stakes" as const, tierSource: "DEPLOYMENT_POLICY" as const, tierProvenanceRef: "asker:test" },
      expectedSource: "DEPLOYMENT_POLICY" as const
    },
    {
      submitted: "MACHINE_DEFAULT" as const,
      resolved: { effectiveRiskTier: "high-stakes" as const, tierSource: "DEPLOYMENT_POLICY" as const, tierProvenanceRef: "machine:deployment-floor" },
      expectedSource: "DEPLOYMENT_POLICY" as const
    }
  ])("preserves $submitted when policy escalation is $expectedSource", ({ submitted, resolved, expectedSource }) => {
    expect(preserveSubmittedTierSource(resolved, submitted)).toEqual({
      ...resolved,
      tierSource: expectedSource
    });
  });

  it("preserves MACHINE_DEFAULT provenance through admission without changing the effective tier", async () => {
    const ask: AskRequest = {
      question_line: "What follows from this evidence?",
      risk_tier: "standard",
      tier_source: "MACHINE_DEFAULT",
      tier_provenance_ref: "machine:deployment-floor",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      decision_scope: "test-layer scope",
      as_of: "2026-08-07T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    };
    await expect(evaluateAskAdmission(admissionSettings(), ask)).resolves.toMatchObject({
      risk: {
        effectiveRiskTier: "standard",
        tierSource: "MACHINE_DEFAULT",
        tierProvenanceRef: "machine:deployment-floor"
      }
    });
  });

  it("marks only maker and envelope evaluation refusals for the 422 face", async () => {
    const ask: AskRequest = {
      question_line: "What follows from this evidence?",
      risk_tier: "high-stakes",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:test",
      composition_budget_tier: "low",
      depth_params: { depth: 3 },
      decision_scope: "test-layer scope",
      as_of: "2026-08-07T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    };
    await expect(evaluateAskAdmission(admissionSettings({
      resolveDiscoveredPanel: async () => fixtureDiscoveredPanel(1)
    }), ask)).resolves.toMatchObject({
      criticUnavailableCap: {
        serves: true,
        confidenceBandCapRequired: true,
        conditionMarks: ["SINGLE-LINEAGE", "CRITIQUE-UNAVAILABLE"]
      }
    });

    await expect(evaluateAskAdmission(admissionSettings({
      resolveEnvelopeBasis: async () => {
        throw new TypedDomainError("STRUCTURAL_CEILING_INPUTS_UNRESOLVED", "No computed structural ceiling");
      }
    }), { ...ask, risk_tier: "casual" })).rejects.toMatchObject({
      name: "AskRefusal",
      code: "STRUCTURAL_CEILING_INPUTS_UNRESOLVED",
      message: "No computed structural ceiling"
    });

    await expect(evaluateAskAdmission(admissionSettings({
      resolveDiscoveredPanel: async () => {
        throw new TypedDomainError("PROVIDER_PROBE_UNRESOLVED", "Discovery evidence is broken");
      }
    }), ask)).rejects.toMatchObject({
      name: "TypedDomainError",
      code: "PROVIDER_PROBE_UNRESOLVED"
    });
  });
  it("resolves the provisional user_dev_token session surface without treating SSR as privileged", async () => {
    const api = buildApi({ application: fixtureApplication() });
    const response = await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { "x-user-dev-token": "test-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      caller_scope: "ASKER",
      ownership_provenance: "user_dev_token",
      provisional_identity_model: true
    });
    await api.close();
  });

  it("denies routes that omit an explicit authentication policy", async () => {
    const api = buildApi({ application: fixtureApplication() });
    expect(() => api.get("/test/undeclared-auth-policy", async () => ({ exposed: true })))
      .toThrow("AUTHORIZATION_POLICY_UNDECLARED:GET /test/undeclared-auth-policy");
    await api.close();
  });

  it("does not expose deployment state to an ordinary user", async () => {
    const api = buildApi({ application: fixtureApplication() });
    const response = await api.inject({
      method: "GET", url: "/v1/deployment", headers: { "x-user-dev-token": "test-token" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "OPERATOR_REQUIRED" });
    await api.close();
  });

  it("validates POST /v1/asks against the contract and forwards the resolved principal", async () => {
    let observedAsker = "";
    const application = fixtureApplication();
    application.submit = async (_ask, session) => {
      observedAsker = session.asker_id;
      return { run_ref: RUN_ID, status: "QUEUED" };
    };
    const api = buildApi({ application });
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "test-token" },
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
        steering_annotations: []
      }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ run_ref: RUN_ID, status: "QUEUED" });
    expect(observedAsker).toMatch(/^asker:/);
    await api.close();
  });

  it("maps ask-boundary domain refusals to 422 with their real code and message", async () => {
    const application = fixtureApplication();
    application.submit = async () => {
      throw new AskRefusal(new TypedDomainError(
        "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED",
        "No runCostEnvelope member matches the declared depth and effective risk tier"
      ));
    };
    const api = buildApi({ application });
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "test-token" },
      payload: {
        question_line: "What follows from this evidence?",
        risk_tier: "casual",
        tier_source: "ASKER",
        tier_provenance_ref: "asker-declaration:test",
        composition_budget_tier: "low",
        depth_params: { depth: 3 },
        decision_scope: "test-layer scope",
        as_of: "2026-08-07T00:00:00.000Z",
        steering_presets: [],
        steering_annotations: []
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED",
      message: "No runCostEnvelope member matches the declared depth and effective risk tier"
    });
    await api.close();
  });

  it("refuses a saturated owner history before any run provision or partial output", async () => {
    const queries: string[] = [];
    const leaseQueries: Array<readonly unknown[]> = [];
    let connectCalls = 0;
    const saturatedRows = Array.from({ length: 129 }, (_, index) => ({
      run_id: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`,
      question_line: "⟦DEBATEAI:CIPHERTEXT:V1⟧",
      content_ciphertext: { v: 1, alg: "A256GCM", nonce: "AA==", ct: "AA==", tag: "AA==" },
      created_at_seq: String(index + 1)
    }));
    const pool = {
      async query(statement: string) {
        queries.push(statement);
        return { rows: saturatedRows };
      },
      async connect() {
        connectCalls += 1;
        return {
          async query(...args:unknown[]) {
            leaseQueries.push(args);
            return { rows:/pg_advisory_unlock/i.test(String(args[0]))
              ? [{ unlocked:true }] : [{}] };
          },
          on() { return this; },
          removeListener() { return this; },
          release() {}
        };
      }
    };
    const dispatcher = { dispatch: async () => undefined };
    const serverAdmissionPool=new Proxy(pool,{});
    const legacyAdmissionPool=new Proxy(pool,{});
    expect(() => new PostgresAskApplication(
      pool as never,dispatcher as never,admissionSettings(),undefined,pool as never,
      { server:pool as never,legacy:legacyAdmissionPool as never }
    )).toThrow("ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE");
    const application = new PostgresAskApplication(
      pool as never,
      dispatcher as never,
      admissionSettings(),
      undefined,
      pool as never,
      { server:serverAdmissionPool as never,legacy:legacyAdmissionPool as never }
    );
    const ask: AskRequest = {
      question_line: "Bound this owner history",
      risk_tier: "casual",
      tier_source: "ASKER",
      tier_provenance_ref: "asker-declaration:bounded-history",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      decision_scope: "bounded-history",
      as_of: "2026-08-25T00:00:00.000Z",
      steering_presets: [],
      steering_annotations: []
    };
    const session: Session = {
      asker_id: "owner:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };

    await expect(application.submit(ask, session, {
      kind: "server",
      userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ownerRef: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    })).rejects.toMatchObject({
      name: "AskRefusal",
      code: "OWNER_PRIVATE_HISTORY_SCAN_SATURATED"
    });
    expect(connectCalls).toBe(1);
    expect(leaseQueries).toHaveLength(2);
    expect(leaseQueries.map((query) => String(query[0]))).toEqual([
      expect.stringMatching(/pg_advisory_lock/),
      expect.stringMatching(/pg_advisory_unlock/)
    ]);
    expect(JSON.stringify(leaseQueries)).toContain("owner-ask-admission");
    expect(JSON.stringify(leaseQueries)).not.toContain("run-content-lease");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("LIMIT");
    expect(queries.join("\n")).not.toMatch(/prepare_run_key_provision|create_encrypted_run|INSERT INTO core\.run/i);

    const apiApplication = fixtureApplication();
    apiApplication.submit = async () => {
      throw new AskRefusal(new TypedDomainError(
        "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
        "Private history exceeds the bounded comparison window"
      ));
    };
    const api = buildApi({ application: apiApplication });
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "test-token" },
      payload: ask
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "OWNER_PRIVATE_HISTORY_SCAN_SATURATED",
      message: "Private history exceeds the bounded comparison window"
    });
    await api.close();

    let answerIndexCalls = 0;
    const indexApplication = fixtureApplication();
    indexApplication.readAnswerIndex = async (_session,limit,offset) => {
      answerIndexCalls += 1;
      return { items:[],open_runs:[],limit,offset,total:0 };
    };
    const indexApi = buildApi({ application:indexApplication });
    const oversized = await indexApi.inject({
      method:"GET",
      url:"/v1/answers?limit=129&offset=0",
      headers:{ "x-user-dev-token":"test-token" }
    });
    expect(oversized.statusCode).toBe(400);
    expect(oversized.json()).toEqual({ error:"MALFORMED_REQUEST" });
    expect(answerIndexCalls).toBe(0);
    await indexApi.close();
  });

  it("keeps typed internal faults and untyped crashes on the 500 face", async () => {
    const submitApplication = fixtureApplication();
    submitApplication.submit = async () => {
      throw new TypedDomainError(
        "MEMORY_MATCH_PREDICATE_DRIFT",
        "Database and domain match predicates disagree"
      );
    };
    const submitApi = buildApi({ application: submitApplication });
    const submitResponse = await submitApi.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "test-token" },
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
        steering_annotations: []
      }
    });
    expect(submitResponse.statusCode).toBe(500);
    expect(submitResponse.json()).toEqual({
      error: "INTERNAL_ERROR",
      message: "INTERNAL_ERROR"
    });
    expect(submitResponse.body).not.toContain("Database and domain match predicates disagree");
    await submitApi.close();

    const typedApplication = fixtureApplication();
    typedApplication.readDeployment = async () => {
      throw new TypedDomainError("DEPLOYMENT_REGISTER_UNAVAILABLE", "No sealed V3 deployment register exists");
    };
    const typedApi = buildOperatorApi({ application: typedApplication });
    const typedResponse = await typedApi.inject({
      method: "GET", url: "/v1/deployment", headers: { "x-user-dev-token": "operator-token" }
    });
    expect(typedResponse.statusCode).toBe(500);
    expect(typedResponse.json()).toEqual({
      error: "INTERNAL_ERROR",
      message: "INTERNAL_ERROR"
    });
    expect(typedResponse.body).not.toContain("No sealed V3 deployment register exists");
    await typedApi.close();

    const crashedApplication = fixtureApplication();
    crashedApplication.readDeployment = async () => { throw new Error("database connection lost"); };
    const crashedApi = buildOperatorApi({ application: crashedApplication });
    const crashedResponse = await crashedApi.inject({
      method: "GET", url: "/v1/deployment", headers: { "x-user-dev-token": "operator-token" }
    });
    expect(crashedResponse.statusCode).toBe(500);
    expect(crashedResponse.json()).toEqual({ error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" });
    expect(crashedResponse.body).not.toContain("database connection lost");
    await crashedApi.close();
  });

  it("preserves a non-2xx server code and message in the contract-client error", async () => {
    const client = createContractClient("http://api.test", (async () => new Response(JSON.stringify({
      error: "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED",
      message: "No matching envelope member"
    }), { status: 422, headers: { "content-type": "application/json" } })) as typeof fetch);
    const ask = {} as AskRequest;

    await expect(client.submitAsk(ask, "test-token")).rejects.toMatchObject({
      code: "UNPROCESSABLE",
      status: 422,
      serverCode: "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED",
      message: "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED: No matching envelope member"
    });
  });

  it("keeps an invalid application response on the 500 face", async () => {
    const application = fixtureApplication();
    application.submit = async () => ({ status: "QUEUED" }) as never;
    const api = buildApi({ application });
    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "test-token" },
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
        steering_annotations: []
      }
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: "INTERNAL_ERROR" });
    await api.close();
  });

  it("rejects missing identity and malformed asks loudly", async () => {
    const api = buildApi({ application: fixtureApplication() });
    expect((await api.inject({ method: "GET", url: "/v1/session" })).statusCode).toBe(401);
    expect((await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: { "x-user-dev-token": "test-token" },
      payload: { question_line: "missing fields" }
    })).statusCode).toBe(400);
    await api.close();
  });

  it("P6 read stability forwards ?version= as a sealed-version selection", async () => {
    let observedVersion: number | undefined;
    const application = fixtureApplication();
    application.readAnswer = async (_answerId, _session, version) => {
      observedVersion = version;
      return null;
    };
    const api = buildApi({ application });
    const response = await api.inject({
      method: "GET",
      url: `/v1/answers/${ANSWER_ID}?version=7`,
      headers: { "x-user-dev-token": "test-token" }
    });
    expect(response.statusCode).toBe(404);
    expect(observedVersion).toBe(7);
    await api.close();
  });

  it("requires explicit real pagination on the asker-scoped answer index", async () => {
    const api = buildApi({ application: fixtureApplication() });
    expect((await api.inject({ method: "GET", url: "/v1/answers", headers: { "x-user-dev-token": "test-token" } })).statusCode).toBe(400);
    const response = await api.inject({ method: "GET", url: "/v1/answers?limit=3&offset=0", headers: { "x-user-dev-token": "test-token" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], open_runs: [], limit: 3, offset: 0, total: 0 });
    await api.close();
  });

  it("projects an asker-owned queued run and distinguishes a nonexistent id", async () => {
    const application = fixtureApplication();
    application.readRun = async (runId, session) => runId === QUEUED_RUN_ID ? {
      run_ref: runId,
      question_line: "Messi or Ronaldo?",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    } : null;
    const api = buildApi({ application });
    const queued = await api.inject({
      method: "GET",
      url: `/v1/runs/${QUEUED_RUN_ID}`,
      headers: { "x-user-dev-token": "test-token" }
    });
    expect(queued.statusCode).toBe(200);
    expect(queued.json()).toEqual({
      run_ref: QUEUED_RUN_ID,
      question_line: "Messi or Ronaldo?",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    });
    expect((await api.inject({
      method: "GET",
      url: `/v1/runs/${MISSING_RUN_ID}`,
      headers: { "x-user-dev-token": "test-token" }
    })).statusCode).toBe(404);
    await api.close();
  });

  it("lets the authenticated asker unlink an answer memory link", async () => {
    let observedAnswerId = "";
    let observedAsker = "";
    const application = fixtureApplication();
    application.unlinkMemoryLink = async (answerId, session) => {
      observedAnswerId = answerId;
      observedAsker = session.asker_id;
      return { memory_link_id: "memory:test", state: "UNLINKED" };
    };
    const api = buildApi({ application });
    const response = await api.inject({
      method: "POST",
      url: `/v1/answers/${ANSWER_ID}/memory-link/unlink`,
      headers: { "x-user-dev-token": "asker-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ memory_link_id: "memory:test", state: "UNLINKED" });
    expect(observedAnswerId).toBe(ANSWER_ID);
    expect(observedAsker).toMatch(/^asker:/);
    expect((await api.inject({
      method: "POST",
      url: `/v1/answers/${ANSWER_ID}/memory-link/unlink`
    })).statusCode).toBe(401);
    await api.close();
  });

  it("records investigate-deeper input as an asker-owned typed request", async () => {
    let observedInput: string | null = null;
    const application = fixtureApplication();
    application.recordInvestigation = async (_answerId, _gapRef, userInput) => {
      observedInput = userInput;
      return { request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" };
    };
    const api = buildApi({ application });
    const response = await api.inject({
      method: "POST", url: `/v1/answers/${ANSWER_ID}/investigations/gap:test`,
      headers: { "x-user-dev-token": "asker-token" },
      payload: { user_input: "Keep this verbatim.", human_steer_input: true }
    });
    expect(response.statusCode).toBe(202);
    expect(observedInput).toBe("Keep this verbatim.");
    expect(response.json()).toEqual({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" });
    await api.close();
  });

  it("FX-WIRE-01 keeps tier-2 inspection asker-owned and raw-output-free", async () => {
    let observedScope: string | undefined;
    const application = fixtureApplication();
    const readInspection = application.readInspection;
    application.readInspection = async (answerId, session, version, ownership) => {
      observedScope = session.caller_scope;
      return readInspection(answerId, session, version, ownership);
    };
    const api = buildApi({ application });
    const asker = await api.inject({
      method: "GET",
      url: `/v1/answers/${ANSWER_ID}/inspection?version=1`,
      headers: { "x-user-dev-token": "asker-token" }
    });
    expect(asker.statusCode).toBe(200);
    expect(observedScope).toBe("ASKER");
    expect(asker.body).not.toContain("raw_text");
    expect(asker.json()).toMatchObject({ answer_id: ANSWER_ID, answer_version: 1 });

    const operator = await api.inject({
      method: "GET",
      url: `/v1/answers/${ANSWER_ID}/inspection?version=1`,
      headers: { "x-operator-dev-token": "operator-token" }
    });
    expect(operator.statusCode).toBe(401);
    await api.close();
  });

  it("serves only the closed SSE vocabulary through the asker-scoped facade", async () => {
    const application = fixtureApplication();
    application.readRun = async (runId) => ({
      run_ref: runId,
      question_line: "A streamed run",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    });
    const api = buildApi({ application });
    const response = await api.inject({
      method: "GET",
      url: `/v1/runs/${RUN_ID}/events`,
      headers: { "x-user-dev-token": "asker-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: run.accepted");
    expect(response.body).toContain('"event_type":"run.accepted"');
    expect((await api.inject({ method: "GET", url: `/v1/runs/${RUN_ID}/events` })).statusCode).toBe(401);
    await api.close();
  });

  it("aborts a stale SSE connection without killing subsequent API requests", async () => {
    const application = fixtureApplication();
    application.readRun = async (runId) => ({
      run_ref: runId,
      question_line: "Stale run",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    });
    application.events = async function* (runId) {
      expect(runId).toBe(MISSING_RUN_ID);
      throw new TypedDomainError("RUN_NOT_FOUND", "No run exists for this stale EventSource");
    };
    const api = buildApi({ application });
    await api.listen({ host: "127.0.0.1", port: 0 });
    const address = api.server.address();
    if (address === null || typeof address === "string") throw new Error("Expected a TCP test listener");

    const abort = new AbortController();
    const streamOutcome = await Promise.race([
      fetch(`http://127.0.0.1:${address.port}/v1/runs/${MISSING_RUN_ID}/events`, {
        headers: { "x-user-dev-token": "stale-tab-token" },
        signal: abort.signal
      }).then(async (stream) => {
        expect(stream.status).toBe(200);
        await stream.text();
        return "ended_by_server" as const;
      }).then(
        (outcome) => outcome,
        () => "aborted_by_server" as const
      ),
      new Promise<"timed_out">((resolve) => setTimeout(() => resolve("timed_out"), 1_000))
    ]);
    if (streamOutcome === "timed_out") abort.abort();
    expect(streamOutcome).toBe("aborted_by_server");

    const survivor = await fetch(`http://127.0.0.1:${address.port}/v1/session`, {
      headers: { "x-user-dev-token": "other-user-token" }
    });
    expect(survivor.status).toBe(200);
    await expect(survivor.json()).resolves.toMatchObject({ caller_scope: "ASKER" });
    await api.close();
  });
});
