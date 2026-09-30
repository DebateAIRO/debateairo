import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { buildApi, type AskApplication } from "@debateai/api";
import { AskRoomResponseSchema } from "@debateai/contract";
import type { PersonWindow } from "@debateai/budget";
import type { WaitingRunRef } from "@debateai/db";
import { AskRoom, type AskRoomEntitlements, type AskRoomReader } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

const NOW = new Date("2026-09-30T18:00:20.000Z");
const OWNER = testHttpIdentity("b7a-room-owner");
const OWNER_REF = OWNER.authenticated.ownerRef;
const MONTH_RESET = new Date("2026-10-29T09:00:00.000Z");
const ROOM_URL = "/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1";

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

function roomWith(input: {
  readonly daySpent?: number;
  readonly ownerSpent?: number;
  readonly windows?: readonly PersonWindow[];
  readonly mine?: readonly WaitingRunRef[];
  /** The line's one answer: does a run waiting for the site hold this question back? */
  readonly blocking?: boolean;
  readonly estimate?: number;
  readonly entitlements?: AskRoomEntitlements | null;
}): AskRoom {
  return new AskRoom({
    lockPool: { connect: vi.fn() } as unknown as Pool,
    spend: {
      readDaySpentMicros: async () => input.daySpent ?? 0,
      readSiteCountedHoldsMicros: async () => 0,
      readOwnerSpentMicros: async () => input.ownerSpent ?? 0,
      readOwnerCountedHoldsMicros: async () => 0,
      openHold: async () => undefined
    },
    line: {
      siteLineBlocking: async () => input.blocking ?? false,
      wakeCandidates: async () => [],
      waitingForOwner: async () => input.mine ?? [],
      waitingForLegacyAsker: async () => input.mine ?? [],
      readWaiting: async () => null,
      isWaiting: async () => false,
      enterWait: async () => undefined,
      recordReason: async () => undefined,
      markStarted: async () => undefined
    },
    estimator: { estimateMicros: async () => input.estimate ?? 1_000 },
    personAllowance: { read: async () => input.windows ?? [] },
    entitlements: input.entitlements ?? null,
    dailyCeilingMicros: 100_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    clock: () => NOW
  });
}

const month = (limitMicros: number): PersonWindow => Object.freeze({
  scope: "PERSON_MONTH", limitMicros, periodStart: new Date("2026-09-29T09:00:00.000Z"), resetsAt: MONTH_RESET,
  finishBasisPoints: 11_000, closeBasisPoints: 9_500
});

const MINE = Object.freeze({
  access: Object.freeze({ ownerRef: OWNER_REF, legacyAskerId: null }),
  settingsClass: Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 })
});

async function readRoute(askRoom?: AskRoomReader, url = ROOM_URL) {
  const api = buildApi({
    application: fixtureApplication(),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(askRoom === undefined ? {} : { askRoom })
  });
  try {
    return await api.inject({ method: "GET", url, headers: testSessionHeaders(OWNER) });
  } finally {
    await api.close();
  }
}

describe("B7a the room read (budget spec §2.7, A16)", () => {
  it("answers FITS with nulls when nothing is close", async () => {
    await expect(roomWith({}).readRoom(MINE)).resolves.toEqual({
      room: "FITS", scope: null, resetsAt: null, waitingRunRef: null, planId: null
    });
  });

  it("answers CLOSE with the scope that is close and that scope's reset", async () => {
    await expect(roomWith({ windows: [month(1_000)], ownerSpent: 960 }).readRoom(MINE)).resolves.toEqual({
      room: "CLOSE", scope: "PERSON_MONTH", resetsAt: MONTH_RESET, waitingRunRef: null, planId: null
    });
  });

  it("answers FULL with the scope it would wait for and when it would start", async () => {
    await expect(roomWith({ daySpent: 100_000 }).readRoom(MINE)).resolves.toEqual({
      room: "FULL", scope: "SITE_DAY", resetsAt: new Date("2026-10-01T00:00:00.000Z"), waitingRunRef: null, planId: null
    });
  });

  it("answers FULL for the next tick behind a run waiting for the site, and FITS when only person-full runs wait", async () => {
    await expect(roomWith({ blocking: true }).readRoom(MINE)).resolves.toEqual({
      room: "FULL", scope: "SITE_DAY", resetsAt: new Date("2026-09-30T18:01:00.000Z"), waitingRunRef: null, planId: null
    });
    await expect(roomWith({ blocking: false }).readRoom(MINE)).resolves.toMatchObject({ room: "FITS" });
  });

  it("answers ALREADY_WAITING with the waiting run and its expected start", async () => {
    const waiting = { runId: randomUUID(), waitingSince: new Date("2026-09-30T12:00:00.000Z") };
    await expect(roomWith({ daySpent: 100_000, mine: [waiting] }).readRoom(MINE)).resolves.toEqual({
      room: "ALREADY_WAITING", scope: "SITE_DAY", resetsAt: new Date("2026-10-01T00:00:00.000Z"),
      waitingRunRef: waiting.runId, planId: null
    });
  });

  it("names the person's plan while billing is on", async () => {
    const entitlements: AskRoomEntitlements = {
      current: async () => ({ planId: "PRO", eventId: randomUUID() }),
      recordRunChargeScope: async () => undefined
    };
    await expect(roomWith({ entitlements }).readRoom(MINE)).resolves.toMatchObject({ room: "FITS", planId: "PRO" });
  });
});

describe("B7a GET /v1/asks/room on the wire", () => {
  it("answers FITS with nulls when no room is composed (local mode, or no band)", async () => {
    const response = await readRoute();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ room: "FITS", scope: null, resets_at: null, waiting_run_ref: null, plan_id: null });
  });

  it("never carries a figure: no estimate, no spend, no limit, no count", async () => {
    const response = await readRoute(roomWith({ estimate: 123_457, daySpent: 99_981, windows: [month(4_321)], ownerSpent: 4_321 }));
    const body = response.json() as Record<string, unknown>;
    expect(AskRoomResponseSchema.parse(body)).toEqual({
      room: "FULL", scope: "PERSON_MONTH", resets_at: MONTH_RESET.toISOString(), waiting_run_ref: null, plan_id: null
    });
    expect(Object.values(body).some((value) => typeof value === "number")).toBe(false);
    for (const figure of ["123457", "99981", "4321"]) expect(response.body).not.toContain(figure);
  });

  it("refuses a malformed settings query", async () => {
    for (const url of [
      "/v1/asks/room?plan_tier=gold&composition_budget_tier=low&depth=1",
      "/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=abc",
      "/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=9",
      `${ROOM_URL}&estimate=1`
    ]) {
      const response = await readRoute(undefined, url);
      expect(response.statusCode, url).toBe(400);
      expect(response.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    }
  });
});
