import { describe, expect, it } from "vitest";
import {
  AskRefusal,
  buildApi,
  evaluateAskAdmission,
  preserveSubmittedTierSource,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { createContractClient, type AskRequest } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

function fixtureApplication(): AskApplication {
  return {
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
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
      answer_id: "answer:test",
      answer_version: 1,
      conformance: {
        outcome: "PASS",
        coverage_mode: "EXHAUSTIVE",
        segment_results: []
      },
      segment_suppressions: [],
      shadow_suppressions: []
    }),
    readLedgerDigest: async () => ({ answer_id: "answer:test", run_ref: "run:test", work_items: [], entries: [] }),
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: "run:test", at_sequence: 1, payload: {} };
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
      decision_owner: "asker:test",
      action_owner: "asker:test",
      decision_scope: "test-layer scope",
      caller_scope: "ASKER",
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
      decision_owner: "asker:test",
      action_owner: "asker:test",
      decision_scope: "test-layer scope",
      caller_scope: "ASKER",
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

  it("serves the deployment register, scorecard, model ledger and honest fleet state", async () => {
    const api = buildApi({ application: fixtureApplication() });
    const response = await api.inject({
      method: "GET", url: "/v1/deployment", headers: { "x-user-dev-token": "test-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    });
    await api.close();
  });

  it("validates POST /v1/asks against the contract and forwards the resolved principal", async () => {
    let observedAsker = "";
    const application = fixtureApplication();
    application.submit = async (_ask, session) => {
      observedAsker = session.asker_id;
      return { run_ref: "run:test", status: "QUEUED" };
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
        decision_owner: "asker:test",
        action_owner: "asker:test",
        decision_scope: "test-layer scope",
        caller_scope: "ASKER",
        as_of: "2026-08-07T00:00:00.000Z",
        steering_presets: [],
        steering_annotations: []
      }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ run_ref: "run:test", status: "QUEUED" });
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
        decision_owner: "asker:test",
        action_owner: "asker:test",
        decision_scope: "test-layer scope",
        caller_scope: "ASKER",
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
        decision_owner: "asker:test",
        action_owner: "asker:test",
        decision_scope: "test-layer scope",
        caller_scope: "ASKER",
        as_of: "2026-08-07T00:00:00.000Z",
        steering_presets: [],
        steering_annotations: []
      }
    });
    expect(submitResponse.statusCode).toBe(500);
    expect(submitResponse.json()).toEqual({
      error: "INTERNAL_ERROR",
      message: "Database and domain match predicates disagree"
    });
    await submitApi.close();

    const typedApplication = fixtureApplication();
    typedApplication.readDeployment = async () => {
      throw new TypedDomainError("DEPLOYMENT_REGISTER_UNAVAILABLE", "No sealed V3 deployment register exists");
    };
    const typedApi = buildApi({ application: typedApplication });
    const typedResponse = await typedApi.inject({
      method: "GET", url: "/v1/deployment", headers: { "x-user-dev-token": "test-token" }
    });
    expect(typedResponse.statusCode).toBe(500);
    expect(typedResponse.json()).toEqual({
      error: "INTERNAL_ERROR",
      message: "No sealed V3 deployment register exists"
    });
    await typedApi.close();

    const crashedApplication = fixtureApplication();
    crashedApplication.readDeployment = async () => { throw new Error("database connection lost"); };
    const crashedApi = buildApi({ application: crashedApplication });
    const crashedResponse = await crashedApi.inject({
      method: "GET", url: "/v1/deployment", headers: { "x-user-dev-token": "test-token" }
    });
    expect(crashedResponse.statusCode).toBe(500);
    expect(crashedResponse.json()).toEqual({ error: "INTERNAL_ERROR", message: "database connection lost" });
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
        decision_owner: "asker:test",
        action_owner: "asker:test",
        decision_scope: "test-layer scope",
        caller_scope: "ASKER",
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
      url: "/v1/answers/answer:test?version=7",
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
    application.readRun = async (runId, session) => runId === "run:queued" ? {
      run_ref: runId,
      question_line: "Messi or Ronaldo?",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    } : null;
    const api = buildApi({ application });
    const queued = await api.inject({
      method: "GET",
      url: "/v1/runs/run:queued",
      headers: { "x-user-dev-token": "test-token" }
    });
    expect(queued.statusCode).toBe(200);
    expect(queued.json()).toEqual({
      run_ref: "run:queued",
      question_line: "Messi or Ronaldo?",
      state: "QUEUED",
      terminal_reason: null,
      hold_until: null
    });
    expect((await api.inject({
      method: "GET",
      url: "/v1/runs/run:missing",
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
      url: "/v1/answers/answer:test/memory-link/unlink",
      headers: { "x-user-dev-token": "asker-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ memory_link_id: "memory:test", state: "UNLINKED" });
    expect(observedAnswerId).toBe("answer:test");
    expect(observedAsker).toMatch(/^asker:/);
    expect((await api.inject({
      method: "POST",
      url: "/v1/answers/answer:test/memory-link/unlink"
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
      method: "POST", url: "/v1/answers/answer:test/investigations/gap:test",
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
    application.readInspection = async (answerId, session, version) => {
      observedScope = session.caller_scope;
      return readInspection(answerId, session, version);
    };
    const api = buildApi({ application });
    const asker = await api.inject({
      method: "GET",
      url: "/v1/answers/answer:test/inspection?version=1",
      headers: { "x-user-dev-token": "asker-token" }
    });
    expect(asker.statusCode).toBe(200);
    expect(observedScope).toBe("ASKER");
    expect(asker.body).not.toContain("raw_text");
    expect(asker.json()).toMatchObject({ answer_id: "answer:test", answer_version: 1 });

    const operator = await api.inject({
      method: "GET",
      url: "/v1/answers/answer:test/inspection?version=1",
      headers: { "x-operator-dev-token": "operator-token" }
    });
    expect(operator.statusCode).toBe(401);
    await api.close();
  });

  it("serves only the closed SSE vocabulary through the asker-scoped facade", async () => {
    const api = buildApi({ application: fixtureApplication() });
    const response = await api.inject({
      method: "GET",
      url: "/v1/runs/run:test/events",
      headers: { "x-user-dev-token": "asker-token" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("event: run.accepted");
    expect(response.body).toContain('"event_type":"run.accepted"');
    expect((await api.inject({ method: "GET", url: "/v1/runs/run:test/events" })).statusCode).toBe(401);
    await api.close();
  });

  it("aborts a stale SSE connection without killing subsequent API requests", async () => {
    const application = fixtureApplication();
    application.events = async function* (runId) {
      expect(runId).toBe("run:missing-from-reseed");
      throw new TypedDomainError("RUN_NOT_FOUND", "No run exists for this stale EventSource");
    };
    const api = buildApi({ application });
    await api.listen({ host: "127.0.0.1", port: 0 });
    const address = api.server.address();
    if (address === null || typeof address === "string") throw new Error("Expected a TCP test listener");

    const abort = new AbortController();
    const streamOutcome = await Promise.race([
      fetch(`http://127.0.0.1:${address.port}/v1/runs/run:missing-from-reseed/events`, {
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
