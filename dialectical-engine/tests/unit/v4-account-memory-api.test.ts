import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { ACCOUNT_MEMORY_LIMITS, visitItemsStoredBytes, type AccountReadingLevel, type DigLinkRecordRequest, type DigLinks, type LastVisit, type VisitItems } from "@debateai/contract";
import {
  AccountMemoryInputError, accountMemoryStoreFrom, type AccountMemoryQuery, type AccountMemoryStore, type DigLinkOutcome
} from "../../apps/api/src/account-memory.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * V4 account memory (owner rulings N7 and N11, migration 0130): the six routes. Each is a signed-in (cookie) route; a
 * write needs the exact Origin and the CSRF pair; a run that is not the caller's is the closed 404 RUN_NOT_FOUND (the
 * store, i.e. 0130's functions, decides it); a malformed body is 400 before the store is asked; without a store each
 * route answers 503 ACCOUNT_MEMORY_UNAVAILABLE. The PostgreSQL behaviour is tests/integration/v4-account-memory-database.test.ts.
 */
const OWNER = testHttpIdentity("account-memory-owner");
const OWNER_REF = OWNER.authenticated.ownerRef;
const RUN = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

type Call = readonly [string, ...unknown[]];
/** A store that owns RUN and CHILD for OWNER only, and records every call. */
function fakeStore(calls: Call[] = [], overrides: Partial<AccountMemoryStore> = {}): AccountMemoryStore {
  let level: AccountReadingLevel | null = null;
  const owned = (ownerRef: string, runId: string) => ownerRef === OWNER_REF && (runId === RUN || runId === CHILD);
  return {
    readReadingLevel: async (ownerRef) => { calls.push(["readReadingLevel", ownerRef]); return level; },
    saveReadingLevel: async (ownerRef, next) => { calls.push(["saveReadingLevel", ownerRef, next]); level = next; return next; },
    readLastVisit: async (ownerRef, runId): Promise<LastVisit | null> => {
      calls.push(["readLastVisit", ownerRef, runId]);
      return owned(ownerRef, runId) ? { seen_at: "2026-10-29T08:00:00.000Z", items: { "point:n-1": "SURE" } } : null;
    },
    recordLastVisit: async (ownerRef, runId, items: VisitItems) => {
      calls.push(["recordLastVisit", ownerRef, runId, items]);
      return owned(ownerRef, runId) ? new Date("2026-10-29T09:00:00.000Z") : null;
    },
    readDigLinks: async (ownerRef, runId): Promise<DigLinks | null> => {
      calls.push(["readDigLinks", ownerRef, runId]);
      return owned(ownerRef, runId) ? { parent: null, children: [{ parent_run_id: RUN, child_run_id: CHILD, places: ["w"], mode: "quick", created_at: "2026-10-29T08:30:00.000Z" }] } : null;
    },
    recordDigLink: async (ownerRef, parentRunId, link: DigLinkRecordRequest): Promise<DigLinkOutcome> => {
      calls.push(["recordDigLink", ownerRef, parentRunId, link]);
      return owned(ownerRef, parentRunId) && owned(ownerRef, link.child_run_id) ? "RECORDED" : "NOT_OWNED";
    },
    ...overrides
  };
}

function api(store: AccountMemoryStore | undefined) {
  return buildApi({
    application: application(),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(store === undefined ? {} : { accountMemory: store })
  });
}
const read = (url: string) => ({ method: "GET" as const, url, headers: testSessionHeaders(OWNER) });
const write = (url: string, payload: unknown) => ({ method: "POST" as const, url, payload: payload as object, headers: testSessionHeaders(OWNER, true) });

describe("V4 account memory routes: the reading level", () => {
  it("reads null before a choice, saves the caller's level and reads it back, always for the signed-in account", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    expect((await server.inject(read("/v1/account/reading-level"))).json()).toEqual({ reading_level: null });
    const saved = await server.inject(write("/v1/account/reading-level", { reading_level: "expert" }));
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ reading_level: "expert" });
    expect((await server.inject(read("/v1/account/reading-level"))).json()).toEqual({ reading_level: "expert" });
    expect(calls).toEqual([["readReadingLevel", OWNER_REF], ["saveReadingLevel", OWNER_REF, "expert"], ["readReadingLevel", OWNER_REF]]);
  });

  it("refuses a body that is not one level, before the store is asked", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    for (const payload of [{ reading_level: "Plain" }, { reading_level: null }, {}, { reading_level: "plain", owner_ref: OWNER_REF }]) {
      const response = await server.inject(write("/v1/account/reading-level", payload));
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    }
    expect(calls).toEqual([]);
  });

  it("needs the session for a read, and the Origin and CSRF pair for a write", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    expect((await server.inject({ method: "GET", url: "/v1/account/reading-level" })).statusCode).toBe(401);
    const noCsrf = await server.inject({ method: "POST", url: "/v1/account/reading-level", payload: { reading_level: "plain" }, headers: testSessionHeaders(OWNER) });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
    const foreignOrigin = await server.inject({ method: "POST", url: "/v1/account/reading-level", payload: { reading_level: "plain" },
      headers: testSessionHeaders(OWNER, true, "https://elsewhere.example") });
    expect(foreignOrigin.statusCode).toBe(403);
    expect(calls).toEqual([]);
  });
});

describe("V4 account memory routes: the last visit", () => {
  it("reads and saves the caller's own debate", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    const visit = await server.inject(read(`/v1/runs/${RUN}/last-visit`));
    expect(visit.json()).toEqual({ seen_at: "2026-10-29T08:00:00.000Z", items: { "point:n-1": "SURE" } });
    const items = { "dig:22222222-2222-4222-8222-222222222222": "DONE", "path:pos-a#2": "HELD_UP", "open:p:n-1": "dug", "point:n-1": "SURE" };
    const saved = await server.inject(write(`/v1/runs/${RUN}/last-visit`, { items }));
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ seen_at: "2026-10-29T09:00:00.000Z" });
    expect(calls.at(-1)).toEqual(["recordLastVisit", OWNER_REF, RUN, items]);
  });

  it("answers the closed 404 for another account's debate and for an id that is not a run id", async () => {
    const server = api(fakeStore());
    for (const response of [
      await server.inject(read(`/v1/runs/${FOREIGN}/last-visit`)),
      await server.inject(write(`/v1/runs/${FOREIGN}/last-visit`, { items: { "point:n-1": "SURE" } })),
      await server.inject(read("/v1/runs/not-a-run/last-visit"))
    ]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    }
  });

  it("refuses a snapshot outside the contract before the store is asked", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    const tooMany = Object.fromEntries(Array.from({ length: 513 }, (_, at) => [`point:n-${at}`, "SURE"]));
    // 512 entries (the most allowed) stored in just over 64 KiB, while the request body itself stays under the body limit.
    const tooLarge = Object.fromEntries(Array.from({ length: 512 }, (_, at) => [`point:${String(at).padStart(111, "x")}`, "SURE"]));
    expect(visitItemsStoredBytes(tooLarge)).toBeGreaterThan(ACCOUNT_MEMORY_LIMITS.visitBodyMaxBytes);
    expect(Buffer.byteLength(JSON.stringify({ items: tooLarge }))).toBeLessThan(ACCOUNT_MEMORY_LIMITS.visitBodyMaxBytes);
    for (const items of [[], { "question:n-1": "SURE" }, { "point:a b": "SURE" }, { 'point:a"b': "SURE" }, { "point:n-1": "sure-ish" },
      { "point:n-1": 3 }, tooMany, tooLarge]) {
      const response = await server.inject(write(`/v1/runs/${RUN}/last-visit`, { items }));
      expect(response.statusCode, JSON.stringify(items).slice(0, 40)).toBe(400);
    }
    expect((await server.inject(write(`/v1/runs/${RUN}/last-visit`, { items: {}, extra: true }))).statusCode).toBe(400);
    // A body over the route's own limit never reaches the parser.
    const huge = Object.fromEntries(Array.from({ length: 400 }, (_, at) => [`point:${String(at).padStart(150, "x")}`, "S".repeat(32)]));
    expect((await server.inject(write(`/v1/runs/${RUN}/last-visit`, { items: huge }))).statusCode).toBe(413);
    expect(calls).toEqual([]);
  });

  it("turns the database's own refusal into 400, never a 500", async () => {
    const server = api(fakeStore([], { recordLastVisit: async () => { throw new AccountMemoryInputError("DEBATE_VISIT_INVALID"); } }));
    expect((await server.inject(write(`/v1/runs/${RUN}/last-visit`, { items: { "point:n-1": "SURE" } }))).statusCode).toBe(400);
  });
});

describe("V4 account memory routes: the dig links", () => {
  it("reads the links around the caller's debate and records a dig between two of its debates", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    expect((await server.inject(read(`/v1/runs/${RUN}/dig-links`))).json()).toEqual({
      parent: null, children: [{ parent_run_id: RUN, child_run_id: CHILD, places: ["w"], mode: "quick", created_at: "2026-10-29T08:30:00.000Z" }]
    });
    const link = { child_run_id: CHILD, places: ["p:n-1", "path:pos-a"], mode: "thorough" };
    const recorded = await server.inject(write(`/v1/runs/${RUN}/dig-links`, link));
    expect(recorded.statusCode).toBe(200);
    expect(recorded.json()).toEqual({ recorded: true });
    expect(calls.at(-1)).toEqual(["recordDigLink", OWNER_REF, RUN, link]);
  });

  it("is 404 when either debate is not the caller's, 409 when the dig is already linked elsewhere", async () => {
    const server = api(fakeStore());
    expect((await server.inject(read(`/v1/runs/${FOREIGN}/dig-links`))).statusCode).toBe(404);
    for (const [parent, child] of [[RUN, FOREIGN], [FOREIGN, CHILD]] as const) {
      const response = await server.inject(write(`/v1/runs/${parent}/dig-links`, { child_run_id: child, places: [], mode: "quick" }));
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    }
    const conflicted = api(fakeStore([], { recordDigLink: async () => "CONFLICT" }));
    const response = await conflicted.inject(write(`/v1/runs/${RUN}/dig-links`, { child_run_id: CHILD, places: [], mode: "quick" }));
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "DIG_LINK_CONFLICT", message: "DIG_LINK_CONFLICT" });
  });

  it("refuses a dig of itself, an unknown mode and malformed places before the store is asked", async () => {
    const calls: Call[] = [];
    const server = api(fakeStore(calls));
    for (const payload of [
      { child_run_id: RUN, places: [], mode: "quick" }, { child_run_id: CHILD, places: [], mode: "deep" },
      { child_run_id: CHILD, places: ["has space"], mode: "quick" }, { child_run_id: CHILD, places: Array.from({ length: 17 }, (_, at) => `o:${at}`), mode: "quick" },
      { child_run_id: "not-a-run", places: [], mode: "quick" }, { child_run_id: CHILD, places: [], mode: "quick", question: "text" }
    ]) {
      expect((await server.inject(write(`/v1/runs/${RUN}/dig-links`, payload))).statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(calls).toEqual([]);
  });
});

describe("V4 account memory routes without a store", () => {
  it("answers 503 ACCOUNT_MEMORY_UNAVAILABLE on all six routes", async () => {
    const server = api(undefined);
    for (const request of [
      read("/v1/account/reading-level"), write("/v1/account/reading-level", { reading_level: "plain" }),
      read(`/v1/runs/${RUN}/last-visit`), write(`/v1/runs/${RUN}/last-visit`, { items: {} }),
      read(`/v1/runs/${RUN}/dig-links`), write(`/v1/runs/${RUN}/dig-links`, { child_run_id: CHILD, places: [], mode: "quick" })
    ]) {
      const response = await server.inject(request);
      expect(response.statusCode, `${request.method} ${request.url}`).toBe(503);
      expect(response.json()).toEqual({ error: "ACCOUNT_MEMORY_UNAVAILABLE", message: "ACCOUNT_MEMORY_UNAVAILABLE" });
    }
  });
});

describe("accountMemoryStoreFrom: the PostgreSQL adapter", () => {
  function recordingQuery(rows: readonly Readonly<Record<string, unknown>>[] | Error, seen: Array<[string, unknown[]]> = []): AccountMemoryQuery {
    return async (text, values) => {
      seen.push([text, values]);
      if (rows instanceof Error) throw rows;
      return { rows };
    };
  }

  it("calls 0130's functions with the owner first, and reads their rows", async () => {
    const seen: Array<[string, unknown[]]> = [];
    expect(await accountMemoryStoreFrom(recordingQuery([{ reading_level: "background" }], seen)).readReadingLevel(OWNER_REF)).toBe("background");
    expect(await accountMemoryStoreFrom(recordingQuery([{ reading_level: null }])).readReadingLevel(OWNER_REF)).toBeNull();
    expect(seen).toEqual([["SELECT identity.read_page_reading_level($1) AS reading_level", [OWNER_REF]]]);
    const visit = accountMemoryStoreFrom(recordingQuery([{ owned: true, seen_at: new Date("2026-10-29T08:00:00Z"), items: { "point:n-1": "SURE" } }]));
    expect(await visit.readLastVisit(OWNER_REF, RUN)).toEqual({ seen_at: "2026-10-29T08:00:00.000Z", items: { "point:n-1": "SURE" } });
    expect(await accountMemoryStoreFrom(recordingQuery([{ owned: true, seen_at: null, items: null }])).readLastVisit(OWNER_REF, RUN))
      .toEqual({ seen_at: null, items: null });
    expect(await accountMemoryStoreFrom(recordingQuery([{ owned: false, seen_at: null, items: null }])).readLastVisit(OWNER_REF, RUN)).toBeNull();
    const recordSeen: Array<[string, unknown[]]> = [];
    await accountMemoryStoreFrom(recordingQuery([{ seen_at: new Date("2026-10-29T09:00:00Z") }], recordSeen)).recordLastVisit(OWNER_REF, RUN, { "point:n-1": "SURE" });
    expect(recordSeen[0]![1]).toEqual([OWNER_REF, RUN, JSON.stringify({ "point:n-1": "SURE" })]);
  });

  it("normalises jsonb times to UTC ISO strings and reads a missing run as null", async () => {
    const links = accountMemoryStoreFrom(recordingQuery([{ links: {
      parent: { parent_run_id: RUN, child_run_id: CHILD, places: ["w"], mode: "thorough", created_at: "2026-10-29T10:30:00.123456+02:00" },
      children: []
    } }]));
    expect(await links.readDigLinks(OWNER_REF, CHILD)).toEqual({
      parent: { parent_run_id: RUN, child_run_id: CHILD, places: ["w"], mode: "thorough", created_at: "2026-10-29T08:30:00.123Z" }, children: []
    });
    expect(await accountMemoryStoreFrom(recordingQuery([{ links: null }])).readDigLinks(OWNER_REF, FOREIGN)).toBeNull();
  });

  it("maps 0130's 22023 refusals to AccountMemoryInputError and refuses an outcome it does not know", async () => {
    const refused = Object.assign(new Error("DIG_LINK_INVALID"), { code: "22023" });
    await expect(accountMemoryStoreFrom(recordingQuery(refused)).recordDigLink(OWNER_REF, RUN, { child_run_id: CHILD, places: [], mode: "quick" }))
      .rejects.toBeInstanceOf(AccountMemoryInputError);
    const outage = Object.assign(new Error("connection reset"), { code: "08006" });
    await expect(accountMemoryStoreFrom(recordingQuery(outage)).saveReadingLevel(OWNER_REF, "plain")).rejects.toBe(outage);
    await expect(accountMemoryStoreFrom(recordingQuery([{ outcome: "MAYBE" }])).recordDigLink(OWNER_REF, RUN, { child_run_id: CHILD, places: [], mode: "quick" }))
      .rejects.toThrow("ACCOUNT_MEMORY_ROW_INVALID");
    const seen: Array<[string, unknown[]]> = [];
    expect(await accountMemoryStoreFrom(recordingQuery([{ outcome: "CONFLICT" }], seen)).recordDigLink(OWNER_REF, RUN, { child_run_id: CHILD, places: ["o:1"], mode: "quick" }))
      .toBe("CONFLICT");
    expect(seen[0]).toEqual(["SELECT identity.record_dig_link($1,$2,$3,$4::text[],$5) AS outcome", [OWNER_REF, RUN, CHILD, ["o:1"], "quick"]]);
  });
});
