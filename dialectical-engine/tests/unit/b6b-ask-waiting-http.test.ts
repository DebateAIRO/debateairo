import { afterEach, describe, expect, it, vi } from "vitest";
import { AskAlreadyWaitingRefusal, AskRefusal, buildApi, type AskApplication } from "@debateai/api";
import { AskAcceptedSchema, AskAlreadyWaitingSchema, SENSITIVE_DATA_CONSENT_REQUIRED } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { AskAlreadyWaitingError } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const WAITING_RUN = "77777777-7777-4777-8777-777777777777";
const OWNER = testHttpIdentity("b6b-waiting-owner");
const ASK_BODY = Object.freeze({
  question_line: "What follows from this evidence?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  plan_tier: "free",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
});

function fixtureApplication(submit: AskApplication["submit"]): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit,
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
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: RUN_ID, at_sequence: 1, payload: {} };
    }
  };
}

async function ask(submit: AskApplication["submit"]) {
  const api = buildApi({
    application: fixtureApplication(submit),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN
  });
  try {
    return await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(OWNER, true), payload: ASK_BODY });
  } finally {
    await api.close();
  }
}

afterEach(() => { vi.restoreAllMocks(); });

describe("B6b the waiting answers on the wire (budget spec §2.7, A16)", () => {
  it("answers 202 with the run, its expected start and the limit it waits for — and nothing else", async () => {
    const response = await ask(async () => ({
      run_ref: RUN_ID, status: "WAITING", waits_until: "2026-10-01T00:00:00.000Z", waiting_scope: "PERSON_MONTH"
    }));
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      run_ref: RUN_ID, status: "WAITING", waits_until: "2026-10-01T00:00:00.000Z", waiting_scope: "PERSON_MONTH"
    });
  });

  it("answers 422 ASK_ALREADY_WAITING naming only the waiting run and its expected start", async () => {
    const response = await ask(async () => {
      throw new AskAlreadyWaitingRefusal(new AskAlreadyWaitingError(WAITING_RUN, new Date("2026-10-01T00:00:00.000Z")));
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING",
      run_ref: WAITING_RUN, waits_until: "2026-10-01T00:00:00.000Z"
    });
    expect(response.headers["retry-after"]).toBeUndefined();
  });

  /**
   * Final review Part 1b, Important 1: when the person's own running debates are
   * all that fill their windows, both answers say so (waits_for), and the time
   * they carry is the waker's next tick.
   */
  it("answers 202 WAITING with waits_for when only the person's own debates fill their window", async () => {
    const response = await ask(async () => ({
      run_ref: RUN_ID, status: "WAITING", waits_until: "2026-09-30T18:01:00.000Z", waiting_scope: "PERSON_DAY",
      waits_for: "OWN_DEBATES"
    }));
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({
      run_ref: RUN_ID, status: "WAITING", waits_until: "2026-09-30T18:01:00.000Z", waiting_scope: "PERSON_DAY",
      waits_for: "OWN_DEBATES"
    });
  });

  it("answers 422 ASK_ALREADY_WAITING with waits_for when the waiting run waits only for the person's own debates", async () => {
    const response = await ask(async () => {
      throw new AskAlreadyWaitingRefusal(new AskAlreadyWaitingError(
        WAITING_RUN, new Date("2026-09-30T18:01:00.000Z"), "OWN_DEBATES"
      ));
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING",
      run_ref: WAITING_RUN, waits_until: "2026-09-30T18:01:00.000Z", waits_for: "OWN_DEBATES"
    });
  });

  it("types waits_for: a WAITING answer's person scope only, and one word", () => {
    const waiting = { run_ref: RUN_ID, status: "WAITING", waits_until: "2026-10-01T00:00:00.000Z" } as const;
    for (const scope of ["PERSON_DAY", "PERSON_WEEK", "PERSON_MONTH"] as const) {
      expect(AskAcceptedSchema.safeParse({ ...waiting, waiting_scope: scope, waits_for: "OWN_DEBATES" }).success, scope).toBe(true);
    }
    expect(AskAcceptedSchema.safeParse({ ...waiting, waiting_scope: "SITE_DAY", waits_for: "OWN_DEBATES" }).success).toBe(false);
    expect(AskAcceptedSchema.safeParse({ run_ref: RUN_ID, status: "QUEUED", waits_for: "OWN_DEBATES" }).success).toBe(false);
    expect(AskAcceptedSchema.safeParse({ ...waiting, waiting_scope: "PERSON_DAY", waits_for: "RESET" }).success).toBe(false);
    const refusal = {
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: WAITING_RUN, waits_until: "2026-10-01T00:00:00.000Z"
    } as const;
    expect(AskAlreadyWaitingSchema.safeParse({ ...refusal, waits_for: "OWN_DEBATES" }).success).toBe(true);
    expect(AskAlreadyWaitingSchema.safeParse({ ...refusal, waits_for: "RESET" }).success).toBe(false);
  });

  it("answers the old settings' day-spent refusal exactly as today: 429, the code only, Retry-After", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await ask(async () => {
      throw new AskRefusal(new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", "spent 2000000 of 2000000 micro-units"));
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "DAILY_COST_ENVELOPE_REACHED", message: "DAILY_COST_ENVELOPE_REACHED" });
    expect(response.headers["retry-after"]).toMatch(/ 00:00:00 GMT$/u);
  });

  it("types the WAITING answer: waits_until and waiting_scope iff WAITING", () => {
    expect(AskAcceptedSchema.parse({ run_ref: RUN_ID, status: "QUEUED" }).status).toBe("QUEUED");
    expect(AskAcceptedSchema.safeParse({ run_ref: RUN_ID, status: "WAITING" }).success).toBe(false);
    expect(AskAcceptedSchema.safeParse({
      run_ref: RUN_ID, status: "WAITING", waits_until: "2026-10-01T00:00:00.000Z"
    }).success).toBe(false);
    expect(AskAcceptedSchema.safeParse({
      run_ref: RUN_ID, status: "QUEUED", waits_until: "2026-10-01T00:00:00.000Z", waiting_scope: "SITE_DAY"
    }).success).toBe(false);
    expect(AskAlreadyWaitingSchema.safeParse({
      error: "ASK_ALREADY_WAITING", message: "ASK_ALREADY_WAITING", run_ref: WAITING_RUN,
      waits_until: "2026-10-01T00:00:00.000Z", used_micros: 12
    }).success).toBe(false);
  });

  it("R3-6: a person who has not consented is refused before the room: no submit, so no wait, no hold, no charge", async () => {
    const submit = vi.fn(async () => ({
      run_ref: RUN_ID, status: "WAITING" as const, waits_until: "2026-10-01T00:00:00.000Z", waiting_scope: "SITE_DAY" as const
    }));
    const api = buildApi({
      application: fixtureApplication(submit),
      sessions: { ...testSessionApplication([OWNER]), readSensitiveDataConsent: async () => "required" as const },
      allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(OWNER, true), payload: ASK_BODY });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: SENSITIVE_DATA_CONSENT_REQUIRED, message: SENSITIVE_DATA_CONSENT_REQUIRED });
    } finally {
      await api.close();
    }
    // submit is the only way into #submitWithRoom: the precheck, the locked decision, the place in
    // line, the hold, the charge scope and B8's plan decision all sit behind it.
    expect(submit).not.toHaveBeenCalled();
  });
});
