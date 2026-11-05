import { EventEmitter } from "node:events";
import type { Pool, PoolClient, QueryResult } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, PostgresAskApplication, type AskApplication, type RunCreationSettings } from "@debateai/api";
import { RunProjectionSchema, type AskParent, type AskRequest, type Session } from "@debateai/contract";
import { RunRepository, type StoredAsk } from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import { digDepthParamsAtParentLevel } from "../../apps/api/src/dig-admission.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/*
 * V4 start step, Task 75c (owner answer Q15 of 5 Nov: "once he chose the type of language used, then this should propagate
 * throughout the whole debate and shouldn't be changed"): the reading level belongs to the question. A dig is written at its
 * parent debate's level, whatever the request names (another is ignored, never refused); a parent asked without one gives the
 * dig none (the default, as today). The run read says the debate's own level, so its map page can show it. Made-up data only.
 */

const IDENTITY = testHttpIdentity("dig-reading-level");
const OWNER_REF = IDENTITY.authenticated.ownerRef;
const HEADERS = testSessionHeaders(IDENTITY, true);
const PARENT = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";

const parent: AskParent = {
  parent_run_id: PARENT, places: ["path:pos-a"], mode: "quick",
  picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "path:pos-a", text: "Rent in the city eats most of the difference." }]
};
const askOf = (depthParams: Record<string, unknown>, withParent = true) => ({
  question_line: "Should I move to the city as a nurse? Dig: rent in the city.",
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low", plan_tier: "premium", depth_params: depthParams,
  decision_scope: "test-layer scope", as_of: "2026-11-05T00:00:00.000Z", steering_presets: [], steering_annotations: [],
  ...(withParent ? { parent } : {})
});

/** The parent debate as it was stored: its depth_params, or null when no such run can be read. */
function apiWith(parentDepthParams: Record<string, unknown> | null) {
  const submitted: AskRequest[] = [];
  const storedReads: string[] = [];
  const application = {
    submit: async (ask: AskRequest) => { submitted.push(ask); return { run_ref: CHILD, status: "QUEUED" as const }; },
    readStoredAsk: async (runId: string) => {
      storedReads.push(runId);
      return runId === PARENT && parentDepthParams !== null ? ({ runId, depthParams: parentDepthParams } as unknown as StoredAsk) : null;
    }
  } as unknown as AskApplication;
  const api = buildApi({
    application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN,
    questionCheck: { check: async () => ({ outcome: "PASS" as const }) },
    digModel: {
      readDigLevel: async (ownerRef: string, runId: string) => ownerRef === OWNER_REF && runId === PARENT ? 1 : null,
      readPause: async () => null, resume: async () => "NOT_OWNED" as const
    },
    investigations: {
      join: async () => ({ outcome: "JOINED" as const, investigationId: "inv-1", digLevel: 2 }),
      reopen: async () => "REOPENED" as const
    }
  });
  return { api, submitted, storedReads };
}

describe("a dig is written at its parent debate's level (the asks route)", () => {
  it("a parent asked at Expert: the dig is Expert, whatever level the request names, and nothing is refused", async () => {
    for (const asked of [{ depth: 1, readingLevel: "plain" }, { depth: 1, readingLevel: "expert" }, { depth: 1 }]) {
      const { api, submitted, storedReads } = apiWith({ depth: 1, readingLevel: "expert" });
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(asked) });
      expect(response.statusCode, JSON.stringify(asked)).toBe(202);
      expect(submitted.map((ask) => ask.depth_params)).toEqual([{ depth: 1, readingLevel: "expert" }]);
      expect(storedReads).toEqual([PARENT]);
      await api.close();
    }
  });

  it("a parent asked without a level: the dig has none either (the default, as today)", async () => {
    const { api, submitted } = apiWith({ depth: 2 });
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf({ depth: 1, readingLevel: "plain" }) });
    expect(response.statusCode).toBe(202);
    expect(submitted.map((ask) => ask.depth_params)).toEqual([{ depth: 1 }]);
    await api.close();
  });

  it("a new question keeps the level its person chose, and no debate is read for it", async () => {
    const { api, submitted, storedReads } = apiWith({ depth: 1, readingLevel: "expert" });
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf({ depth: 1, readingLevel: "plain" }, false) });
    expect(response.statusCode).toBe(202);
    expect(submitted.map((ask) => ask.depth_params)).toEqual([{ depth: 1, readingLevel: "plain" }]);
    expect(storedReads).toEqual([]);
    await api.close();
  });
});

describe("digDepthParamsAtParentLevel (pure)", () => {
  it("takes the parent's level, drops the asked one when the parent has none, and keeps the asked params when the parent is unknown", () => {
    expect(digDepthParamsAtParentLevel({ depth: 1, readingLevel: "plain" }, { depth: 2, readingLevel: "background" }))
      .toEqual({ depth: 1, readingLevel: "background" });
    expect(digDepthParamsAtParentLevel({ depth: 1, readingLevel: "plain" }, { depth: 2 })).toEqual({ depth: 1 });
    expect(digDepthParamsAtParentLevel({ depth: 1, readingLevel: "plain" }, null)).toEqual({ depth: 1, readingLevel: "plain" });
    // A stored value that is not a level reads as none (never an error on the dig).
    expect(digDepthParamsAtParentLevel({ depth: 1, readingLevel: "plain" }, { depth: 1, readingLevel: "basic" })).toEqual({ depth: 1 });
  });
});

/*
 * The run read (PostgresAskApplication.readRun) says the debate's own level, read from the run's stored depth_params after the
 * owner check, so the map page shows it whatever the address or the account says. Stores stubbed on their prototypes, as
 * tests/unit/carry-on-part.test.ts does.
 */
describe("the run read says the debate's own level", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const RUN = "55555555-5555-4555-8555-555555555555";
  const OWNER = { ownerRef: "44444444-4444-4444-8444-444444444444", legacyAskerId: null };
  const session = { session_id: "66666666-6666-4666-8666-666666666666" } as Session;
  const settings: RunCreationSettings = {
    strangerSampleRate: 0, releaseKey: TEST_RELEASE_KEY, registerVersion: 1, batteryVersion: "t75c", settlementWatchHandle: "t75c",
    resolveDiscoveredPanel: async () => [], resolveEnvelopeBasis: async () => ({}),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource: tierSource as never, tierProvenanceRef })
  };
  function poolAnswering(level: string | null | undefined): Pool {
    const query = vi.fn(async (sql: string) => ({
      rows: /readingLevel/u.test(sql) && level !== undefined ? [{ reading_level: level }] : [], rowCount: 0
    } as unknown as QueryResult));
    const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
    return { connect: vi.fn(async () => client), query } as unknown as Pool;
  }
  async function runRead(level: string | null | undefined) {
    vi.spyOn(RunRepository.prototype, "readLoadingProjection").mockResolvedValue({ runRef: RUN,
      questionLine: "Should Harbour Town build a second pier?", state: "RUNNING", terminalReason: null, holdUntil: null, argumentLanguage: null });
    vi.spyOn(ServeRepository.prototype, "readRunBranches").mockResolvedValue(null);
    vi.spyOn(ServeRepository.prototype, "readRunPathProgress").mockResolvedValue(null);
    const blank = (): Pool => poolAnswering(undefined);
    const application = new PostgresAskApplication(poolAnswering(level), { dispatch: vi.fn() }, settings, { read: async () => [] }, blank(),
      { server: blank(), legacy: blank() });
    return RunProjectionSchema.parse(await application.readRun(RUN, session, OWNER));
  }

  it("a debate asked at Expert reads Expert", async () => {
    expect((await runRead("expert")).reading_level).toBe("expert");
  });

  it("a debate asked without a level, or with a stored value that is not one, carries no level", async () => {
    for (const level of [null, "basic", undefined]) expect(await runRead(level), String(level)).not.toHaveProperty("reading_level");
  });

  it("another person's debate is not read at all", async () => {
    vi.spyOn(RunRepository.prototype, "readLoadingProjection").mockResolvedValue(null);
    const pool = poolAnswering("expert");
    const blank = (): Pool => poolAnswering(undefined);
    const application = new PostgresAskApplication(pool, { dispatch: vi.fn() }, settings, { read: async () => [] }, blank(),
      { server: blank(), legacy: blank() });
    expect(await application.readRun(RUN, session, OWNER)).toBeNull();
    expect((pool.query as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([sql]) => /readingLevel/u.test(String(sql)))).toEqual([]);
  });
});
