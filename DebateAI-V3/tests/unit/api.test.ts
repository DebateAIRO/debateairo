import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";

function fixtureApplication(): AskApplication {
  return {
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], limit, offset, total: 0 }),
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

describe("Fastify sole facade / FX-WIRE-03", () => {
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
        agent_count: 1,
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
    expect(response.json()).toEqual({ items: [], limit: 3, offset: 0, total: 0 });
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
});
