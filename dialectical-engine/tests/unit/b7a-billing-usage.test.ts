import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { BillingUsageResponseSchema } from "@debateai/contract";
import type { PersonWindow } from "@debateai/budget";
import { PersonUsageReader, usagePercent } from "../../apps/api/src/billing/usage.js";
import { installBillingRoutes, type BillingRouteDeps, type BillingUsageReader } from "../../apps/api/src/billing/index.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const OWNER = testHttpIdentity("b7a-usage-owner");
const NOW = new Date("2026-09-30T18:00:00.000Z");
const window = (scope: PersonWindow["scope"], limitMicros: number, resetsAt: string): PersonWindow => Object.freeze({
  scope, limitMicros, periodStart: new Date("2026-09-29T09:00:00.000Z"), resetsAt: new Date(resetsAt),
  finishBasisPoints: 11_000, closeBasisPoints: 9_500
});

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
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
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: "run:test", at_sequence: 1, payload: {} };
    }
  };
}

async function usageRoute(usage?: BillingUsageReader) {
  const api = buildApi({
    application: fixtureApplication(),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(usage === undefined ? {} : { billing: { usage } })
  });
  try {
    return await api.inject({ method: "GET", url: "/v1/billing/usage", headers: testSessionHeaders(OWNER) });
  } finally {
    await api.close();
  }
}

describe("B7a usage as a percentage (paid-plans spec §1.2, U1)", () => {
  it.each([
    [0, 1_000, 0], [9_999, 1_000_000, 0], [949_900, 1_000_000, 94], [999_999, 1_000_000, 99],
    [1_000_000, 1_000_000, 100], [1_099_999, 1_000_000, 109], [1_100_000, 1_000_000, 110], [5_000_000, 1_000_000, 110]
  ] as const)("%i of %i shows %i", (spent, limit, percent) => {
    expect(usagePercent(spent, limit)).toBe(percent);
  });

  it("refuses a limit below one micro-unit", () => {
    expect(() => usagePercent(1, 0)).toThrow(TypeError);
  });

  it("reads each window's spend in [periodStart, resetsAt), and orders day, week, month", async () => {
    const reads: Array<[string, Date, Date]> = [];
    const windows = [
      window("PERSON_MONTH", 5_000_000, "2026-10-29T09:00:00.000Z"),
      window("PERSON_DAY", 1_000_000, "2026-10-01T09:00:00.000Z"),
      window("PERSON_WEEK", 2_500_000, "2026-10-06T09:00:00.000Z")
    ];
    const reader = new PersonUsageReader({
      entitlements: { current: async () => ({ planId: "PLUS" }) },
      allowance: { read: async () => windows },
      spend: { readOwnerSpentMicros: async (ownerRef, from, to) => { reads.push([ownerRef, from, to]); return 400_000; } }
    });
    await expect(reader.read("owner:a", NOW)).resolves.toEqual({
      planId: "PLUS",
      windows: [
        { scope: "PERSON_DAY", percent: 40, resetsAt: new Date("2026-10-01T09:00:00.000Z") },
        { scope: "PERSON_WEEK", percent: 16, resetsAt: new Date("2026-10-06T09:00:00.000Z") },
        { scope: "PERSON_MONTH", percent: 8, resetsAt: new Date("2026-10-29T09:00:00.000Z") }
      ]
    });
    expect(reads).toContainEqual(["owner:a", new Date("2026-09-29T09:00:00.000Z"), new Date("2026-10-01T09:00:00.000Z")]);
  });
});

describe("B7a GET /v1/billing/usage on the wire", () => {
  it("answers 404 NOT_FOUND when billing is off or the deployment is local", async () => {
    const response = await usageRoute();
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });
  });

  it("answers the plan and one whole percentage per window, and no figure", async () => {
    const response = await usageRoute({
      read: async () => ({
        planId: "FREE",
        windows: [{ scope: "PERSON_MONTH", percent: 57, resetsAt: new Date("2026-10-29T09:00:00.000Z") }]
      })
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 57, resets_at: "2026-10-29T09:00:00.000Z" }]
    });
    expect(BillingUsageResponseSchema.safeParse({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 57, resets_at: "2026-10-29T09:00:00.000Z", spent_micros: 1 }]
    }).success).toBe(false);
    expect(BillingUsageResponseSchema.safeParse({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 57.5, resets_at: "2026-10-29T09:00:00.000Z" }]
    }).success).toBe(false);
    expect(BillingUsageResponseSchema.safeParse({
      plan_id: "FREE", windows: [{ scope: "PERSON_MONTH", percent: 111, resets_at: "2026-10-29T09:00:00.000Z" }]
    }).success).toBe(false);
  });

  it("requires a session", async () => {
    const api = buildApi({ application: fixtureApplication(), sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN });
    const response = await api.inject({ method: "GET", url: "/v1/billing/usage" });
    await api.close();
    expect(response.statusCode).toBe(401);
  });
});

describe("B7a installBillingRoutes(api, deps) — the one billing routes module (R-3)", () => {
  it("asks the route policy for every route it installs, and reads the clock it is given", async () => {
    const asked: string[] = [];
    const seen: Date[] = [];
    const deps: BillingRouteDeps = {
      policy: (route) => {
        asked.push(route);
        return { config: { auth: "public" } };
      },
      usage: {
        read: async (_ownerRef, now) => {
          seen.push(now);
          return { planId: "PLUS", windows: [] };
        }
      },
      clock: () => NOW
    };
    // A bare Fastify instance: the module needs nothing of buildApi but what `deps` carries.
    const api = Fastify();
    api.decorateRequest("authenticatedSession");
    api.addHook("onRequest", async (request) => {
      request.authenticatedSession = { ownerRef: "owner:a" } as NonNullable<typeof request.authenticatedSession>;
    });
    installBillingRoutes(api, deps);
    const response = await api.inject({ method: "GET", url: "/v1/billing/usage" });
    await api.close();
    expect(asked).toEqual(["GET /v1/billing/usage"]);
    expect(response.json()).toEqual({ plan_id: "PLUS", windows: [] });
    expect(seen).toEqual([NOW]);
  });
});
