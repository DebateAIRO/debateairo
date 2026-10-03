import { readFile } from "node:fs/promises";
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

/**
 * The F33 class (tests/unit/v28-envelope-wiring.test.ts, tests/unit/b6b-room-wiring.test.ts):
 * a reader that is built, optional, and wired into nothing. The API root must build the
 * usage reader only while billing is on, from the room's own composition, and hand both
 * the room read and the billing options to buildApi. The patterns tolerate whitespace and
 * the shapes the later tasks give this wiring: P8a moves the reader into its own
 * `billingUsageReader` binding and spreads it into the same `billingRouteOptions` object,
 * and B8 adds its own spread between the two lines pinned here.
 */
describe("B7a the API root supplies the room read and the usage read", () => {
  const BILLING_ON_GUARD = String.raw`askRoomComposition\s*===\s*undefined\s*\|\|\s*askRoomComposition\.entitlements\s*===\s*null\s*\?\s*undefined\s*:\s*`;
  const READER = String.raw`new\s+PersonUsageReader\(\s*\{\s*entitlements:\s*askRoomComposition\.entitlements\s*,\s*allowance:\s*askRoomComposition\.personAllowance\s*,\s*(?:\.\.\.\(askRoomComposition\.personAllowance instanceof FundingAwarePersonAllowanceSource \? \{funding:askRoomComposition\.personAllowance\} : \{\}\),\s*)?spend:\s*askRoomComposition\.spend\s*,?\s*\}\s*\)`;

  function billingRouteOptionsStatement(main: string): string {
    const start = main.search(/const\s+billingRouteOptions\s*:\s*BillingRouteOptions\s*\|\s*undefined\s*=/u);
    expect(start).toBeGreaterThan(-1);
    const end = main.indexOf(";", start);
    expect(end).toBeGreaterThan(start);
    return main.slice(start, end + 1);
  }

  function buildApiCall(main: string): string {
    const start = main.search(/const\s+api\s*=\s*buildApi\(\s*\{/u);
    expect(start).toBeGreaterThan(-1);
    const support = main.slice(start).search(/\n\s*support\s*:\s*\{/u);
    expect(support).toBeGreaterThan(0);
    return main.slice(start, start + support);
  }

  it("builds the usage reader once, only behind billing-on (the room composed with entitlements)", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main.match(/new\s+PersonUsageReader\(/gu)?.length).toBe(1);
    // B7a: `? undefined : Object.freeze({ usage: new PersonUsageReader(`;
    // P8a: `const billingUsageReader = … ? undefined : new PersonUsageReader(`.
    expect(main).toMatch(new RegExp(
      `${BILLING_ON_GUARD}(?:Object\\.freeze\\(\\s*\\{\\s*usage:\\s*)?new\\s+PersonUsageReader\\(`, "u"
    ));
  });

  it("builds it from the room's entitlements, allowance and spend, as the billing options' usage member", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main).toMatch(new RegExp(READER, "u"));
    const statement = billingRouteOptionsStatement(main);
    const inline = new RegExp(`usage:\\s*${READER}`, "u");
    const bound = /\busage:\s*([A-Za-z_$][\w$]*)\s*\}/u.exec(statement);
    if (inline.test(statement)) {
      // B7a: the reader is built inside the one billing options object (R-3).
      expect(statement).toMatch(new RegExp(`${BILLING_ON_GUARD}Object\\.freeze\\(\\s*\\{\\s*usage:\\s*${READER}`, "u"));
    } else {
      // P8a: the reader has its own binding, spread into the same object as `usage`.
      expect(bound, "billingRouteOptions carries no usage member").not.toBeNull();
      const name = bound?.[1] ?? "";
      expect(name).not.toBe("");
      expect(main).toMatch(new RegExp(`const\\s+${name}\\s*=\\s*${BILLING_ON_GUARD}${READER}`, "u"));
      expect(statement).toMatch(new RegExp(`\\.\\.\\.\\(\\s*${name}\\s*===\\s*undefined\\s*\\?\\s*\\{\\s*\\}\\s*:\\s*\\{\\s*usage:\\s*${name}\\s*\\}\\s*\\)`, "u"));
    }
  });

  it("hands buildApi the room read", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(buildApiCall(main)).toMatch(
      /\.\.\.\(\s*askRoom\s*===\s*undefined\s*\?\s*\{\s*\}\s*:\s*\{\s*askRoom\s*\}\s*\)\s*,/u
    );
  });

  it("hands buildApi the billing options", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(buildApiCall(main)).toMatch(
      /\.\.\.\(\s*billingRouteOptions\s*===\s*undefined\s*\?\s*\{\s*\}\s*:\s*\{\s*billing\s*:\s*billingRouteOptions\s*\}\s*\)\s*,/u
    );
  });
});
