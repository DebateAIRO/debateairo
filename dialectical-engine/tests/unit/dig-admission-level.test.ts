import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  DIG_FREE_PICKS_MAX, DIG_LEVEL_MAX, DIG_PICKS_ONE_PATH, DigFreePicksMaxSchema, DigPicksOnePathSchema, DigTooDeepSchema,
  FREE_DIG_PICKS_MAX, type AskParent, type AskRequest, type DigLinkRecordRequest
} from "@debateai/contract";
import {
  admitDig, digPathIndexOf, digPicksOnOnePath, joinAtStart, type DigJoinOutcome, type DigJoinPort
} from "../../apps/api/src/dig-admission.js";
import type { AccountMemoryStore } from "../../apps/api/src/account-memory.js";
import type { AskRoomReader, RoomQuestion } from "../../apps/api/src/ask-room.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Plan 2026-10-30 dig-model revision, task W3-2 — A DIG'S ADMISSION AND ITS LEVEL. A dig of a debate at level 9 is
 * level 10, the deepest, and is admitted; a dig of a level-10 debate would be level 11 and is refused 409 DIG_TOO_DEEP
 * before anything is charged (the question check, a paid site call, is never asked; nothing is submitted). Picks stay
 * on one path (owner Q-D1); Free combines at most 3. The dig's run is created with its own row (0154: what keeps it a
 * dig, never published, written by the statement that creates the run), then it joins its parent's investigation,
 * reopening it when it was closed. (The dig level is how many digs sit above a debate, never how far one debate's tree
 * grows.)
 */

const IDENTITY = testHttpIdentity("dig-admission-level");
const OWNER_REF = IDENTITY.authenticated.ownerRef;
const HEADERS = testSessionHeaders(IDENTITY, true);
const PARENT = "22222222-2222-4222-8222-222222222222";
const CHILD = "33333333-3333-4333-8333-333333333333";

const parentOf = (overrides: Partial<AskParent> = {}): AskParent => ({
  parent_run_id: PARENT, places: ["path:pos-a"], mode: "quick",
  picks: [{ kind: "OWN_VIEW", suggestion_id: null, place: "path:pos-a", text: "Rent in Munich eats most of the difference." }],
  ...overrides
});
const askOf = (parent: AskParent | undefined, planTier: "free" | "premium" = "premium") => ({
  question_line: "Should I move from Cluj to Munich as a nurse? Dig: rent in Munich.",
  risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low", plan_tier: planTier, depth_params: { depth: 1 },
  decision_scope: "test-layer scope", as_of: "2026-10-31T00:00:00.000Z", steering_presets: [], steering_annotations: [],
  ...(parent === undefined ? {} : { parent })
});

/**
 * The account-memory store as the database answers (0131): a link asks both runs, as the join does, so it is NOT_OWNED whenever the join was. Every
 * method the route calls on it is named in `calls`, so a write the route makes after the submit shows (0154: a dig's own row is the run's creation's,
 * never the route's).
 */
function memoryOf(calls: string[], joinOutcome: DigJoinOutcome) {
  const links: Array<readonly [string, string, DigLinkRecordRequest]> = [];
  const accountMemory = new Proxy({}, {
    get: (_target, name) => async (...values: unknown[]) => {
      calls.push(`memory ${String(name)}`);
      if (name !== "recordDigLink") return null;
      links.push(values as unknown as readonly [string, string, DigLinkRecordRequest]);
      return joinOutcome === "NOT_OWNED" ? "NOT_OWNED" as const : "RECORDED" as const;
    }
  }) as unknown as AccountMemoryStore;
  return { accountMemory, links };
}

function apiWith(level: number | null, askRoom?: AskRoomReader, joinOutcome: DigJoinOutcome = "JOINED") {
  const submitted: AskRequest[] = [];
  const checked: string[] = [];
  const joins: Parameters<DigJoinPort["join"]>[0][] = [];
  const calls: string[] = [];
  const { accountMemory, links } = memoryOf(calls, joinOutcome);
  const application = {
    submit: async (ask: AskRequest) => { submitted.push(ask); calls.push("submit"); return { run_ref: CHILD, status: "QUEUED" as const }; }
  } as unknown as AskApplication;
  const api = buildApi({
    application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN, ...(askRoom === undefined ? {} : { askRoom }),
    questionCheck: { check: async (question: string) => { checked.push(question); return { outcome: "PASS" as const }; } },
    digModel: {
      readDigLevel: async (ownerRef: string, runId: string) => ownerRef === OWNER_REF && runId === PARENT ? level : null,
      readPause: async () => null, resume: async () => "NOT_OWNED" as const
    },
    investigations: {
      join: async (input) => { joins.push(input); calls.push("join"); return { outcome: joinOutcome, investigationId: "inv-1", digLevel: (level ?? 0) + 1 }; },
      reopen: async () => { calls.push("reopen"); return "REOPENED" as const; }
    },
    accountMemory
  });
  return { api, submitted, checked, joins, links, calls };
}

const PUBLIC_REF = "44444444-4444-4444-8444-444444444444";
const PUBLIC_ROOT = "55555555-5555-4555-8555-555555555555";
const publicParentOf = () => ({ public_ref: PUBLIC_REF, places: ["path:pos-a"], mode: "quick" as const,
  picks: [{ kind: "OWN_VIEW" as const, suggestion_id: null, place: "path:pos-a", text: "Rent in Munich eats most of the difference." }] });
/**
 * A dig on a public debate, through the asks route: the page's public parent is admitted (it shows path pos-a, at level 1), and the public tree's
 * join answers `joined` (or throws, a store that failed). Only the public tree is wired, as for a stranger's dig.
 */
function publicApiWith(joined: string | Error) {
  const calls: string[] = [];
  const submitted: AskRequest[] = [];
  const { accountMemory } = memoryOf(calls, "JOINED");
  const application = {
    submit: async (ask: AskRequest) => { submitted.push(ask); calls.push("submit"); return { run_ref: CHILD, status: "QUEUED" as const }; }
  } as unknown as AskApplication;
  const api = buildApi({
    application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN, accountMemory,
    questionCheck: { check: async () => ({ outcome: "PASS" as const }) },
    publicTree: {
      pool: {} as never,
      tree: {
        readDigParent: async (publicationRef: string) => publicationRef === PUBLIC_REF ? { parent_run_id: PUBLIC_ROOT, level: 1 } : null,
        readTreeOfRun: async () => null,
        join: async () => { calls.push("publicJoin"); if (joined instanceof Error) throw joined; return { outcome: joined, digLevel: null }; }
      } as never,
      contributions: { recordPicks: async () => { calls.push("picks"); return "RECORDED"; } } as never,
      readPublicDebate: async (publicationRef: string) => publicationRef === PUBLIC_REF
        ? { story_short: { paths: [{ position_ref: "pos-a", node_refs: [] }] } } as never : null
    }
  });
  return { api, submitted, calls };
}

describe("the dig level at the asks route", () => {
  it("level 10 admitted: a dig of a level-9 debate is submitted and joins its parent's investigation", async () => {
    const { api, submitted, checked, joins } = apiWith(DIG_LEVEL_MAX - 1);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parentOf()) });
    expect(response.statusCode).toBe(202);
    expect(submitted).toHaveLength(1);
    expect(checked).toHaveLength(1);
    expect(joins).toEqual([{ ownerRef: OWNER_REF, parentRunId: PARENT, childRunId: CHILD, places: ["path:pos-a"], mode: "quick" }]);
    await api.close();
  });

  // Security review F2 (0154): a dig is never published, and is known as one by its own row (identity.dig_run), which the statement that creates
  // its run writes (0123's writer, patched by 0154; the application marks the run a dig for an ask with a parent or a public parent). So the route
  // hands the submit the parent as it came and writes no dig row of its own after it: whatever the join then answers, NOT_OWNED among them (the
  // parent erased or no longer the account's between the admission and the join), the dig is a dig from its first statement. The join writes the
  // link when it takes; the server writes none.
  it("the route hands the submit the dig's parent, writes no dig row of its own after it, whatever the join answers, and no link", async () => {
    for (const outcome of ["JOINED", "ALREADY", "TOO_DEEP", "CONFLICT", "NOT_OWNED", "CLOSED"] as const) {
      const { api, submitted, links, calls } = apiWith(DIG_LEVEL_MAX - 1, undefined, outcome);
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parentOf()) });
      expect(response.statusCode, outcome).toBe(202);
      expect(submitted.map((ask) => ask.parent), outcome).toEqual([parentOf()]);
      expect(calls.slice(0, 2), outcome).toEqual(["submit", "join"]);
      expect(calls.filter((call) => call.startsWith("memory ")), outcome).toEqual([]);
      expect(links, outcome).toEqual([]);
      await api.close();
    }
  });

  // A public dig too: the submit is handed its public parent, and nothing is written for it before its public tree join, nor before the 202 that
  // says the join did not take (the page not public any more, its root made private, a race past level 10, a store that failed): that dig runs as
  // the person's own debate, and is a dig all the same by the row its run was created with.
  it("a public dig's submit is handed its public parent, and nothing is written for it before its public tree join, whatever the join answers", async () => {
    for (const joined of ["NOT_PUBLIC", "PARENT_PRIVATE", "TOO_DEEP", new Error("STORE_DOWN")] as const) {
      const label = joined instanceof Error ? joined.message : joined;
      const { api, submitted, calls } = publicApiWith(joined);
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS,
        payload: { ...askOf(undefined), public_parent: publicParentOf() } });
      expect(response.statusCode, label).toBe(202);
      expect(response.json(), label).toEqual({ run_ref: CHILD, status: "QUEUED", public_dig_not_joined: true });
      expect(submitted.map((ask) => ask.public_parent), label).toEqual([publicParentOf()]);
      expect(calls.slice(0, 2), label).toEqual(["submit", "publicJoin"]);
      expect(calls.filter((call) => call.startsWith("memory ")), label).toEqual([]);
      await api.close();
    }
  });

  it("a debate dug from nothing is submitted with no parent and joins nothing", async () => {
    const { api, submitted, joins, calls } = apiWith(DIG_LEVEL_MAX - 1);
    expect((await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(undefined) })).statusCode).toBe(202);
    expect(submitted.map((ask) => [ask.parent, ask.public_parent])).toEqual([[undefined, undefined]]);
    expect([joins, calls]).toEqual([[], ["submit"]]);
    await api.close();
  });

  it("11 refused with nothing charged: 409 DIG_TOO_DEEP, no question check, nothing submitted, nothing joined", async () => {
    const { api, submitted, checked, joins, calls } = apiWith(DIG_LEVEL_MAX);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parentOf()) });
    expect(response.statusCode).toBe(409);
    expect(DigTooDeepSchema.parse(response.json())).toEqual({ error: "DIG_TOO_DEEP", message: "DIG_TOO_DEEP", level_max: 10 });
    expect([submitted, checked, joins, calls]).toEqual([[], [], [], []]);
    await api.close();
  });

  it("another account's parent is the closed 404, before anything is charged", async () => {
    const { api, submitted, checked } = apiWith(null);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parentOf()) });
    expect(response.statusCode).toBe(404);
    expect([submitted, checked]).toEqual([[], []]);
    await api.close();
  });

  // W3-8: each refusal has its own code (DIG_FREE_PICKS_MAX, DIG_PICKS_ONE_PATH), so the page can say which it was.
  it("Free combines at most 3 picks; picks from two paths are refused (Q-D1); both before anything is charged, each with its own code", async () => {
    const pick = (place: string) => ({ kind: "OWN_VIEW" as const, suggestion_id: null, place, text: "my view" });
    for (const [parent, tier, body] of [
      [parentOf({ places: [], picks: ["path:a", "path:a", "path:a", "path:a"].map(pick) }), "free",
        DigFreePicksMaxSchema.parse({ error: DIG_FREE_PICKS_MAX, message: DIG_FREE_PICKS_MAX, picks_max: FREE_DIG_PICKS_MAX })],
      [parentOf({ places: [], picks: [pick("path:a"), pick("path:b")] }), "premium",
        DigPicksOnePathSchema.parse({ error: DIG_PICKS_ONE_PATH, message: DIG_PICKS_ONE_PATH })]
    ] as const) {
      const { api, submitted, checked } = apiWith(1);
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parent, tier) });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual(body);
      expect([submitted, checked]).toEqual([[], []]);
      await api.close();
    }
  });

  it("the refusal codes are plain names, and Free's names its pick limit (3)", () => {
    expect([DIG_PICKS_ONE_PATH, DIG_FREE_PICKS_MAX, FREE_DIG_PICKS_MAX]).toEqual(["DIG_PICKS_ONE_PATH", "DIG_FREE_PICKS_MAX", 3]);
    expect(DigPicksOnePathSchema.safeParse({ error: DIG_PICKS_ONE_PATH, message: DIG_PICKS_ONE_PATH, picks_max: 3 }).success).toBe(false);
    expect(DigFreePicksMaxSchema.safeParse({ error: DIG_FREE_PICKS_MAX, message: DIG_FREE_PICKS_MAX, picks_max: 4 }).success).toBe(false);
  });

  it("the room read for a dig names the dig's own level, one below its parent's, so its share can count the climb", async () => {
    const asked: RoomQuestion[] = [];
    const { api } = apiWith(2, { readRoom: async (question) => { asked.push(question);
      return Object.freeze({ room: "FITS" as const, scope: null, resetsAt: null, waitingRunRef: null, planId: null }); } });
    const response = await api.inject({ method: "GET", headers: testSessionHeaders(IDENTITY),
      url: `/v1/asks/room?plan_tier=premium&composition_budget_tier=low&depth=1&dig_parent=${PARENT}&dig_mode=quick&dig_picks=1` });
    expect(response.statusCode).toBe(200);
    expect(asked[0]!.dig).toEqual({ parentRunId: PARENT, mode: "quick", picks: 1, level: 3 });
    await api.close();
  });

  it("the room read for a dig is refused the same way at level 10", async () => {
    const { api } = apiWith(DIG_LEVEL_MAX);
    const response = await api.inject({ method: "GET", headers: testSessionHeaders(IDENTITY),
      url: `/v1/asks/room?plan_tier=premium&composition_budget_tier=low&depth=1&dig_parent=${PARENT}&dig_mode=quick&dig_picks=1` });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "DIG_TOO_DEEP" });
    await api.close();
  });
});

describe("admitDig and the one-path rule (pure)", () => {
  const index = digPathIndexOf([
    { position_ref: "pos-a", node_refs: ["n1", "n2"] },
    { position_ref: "pos-b", node_refs: ["n3"] },
    { position_ref: "pos-a", node_refs: ["n2", "n4"] }
  ]);

  it("names a repeated position's later paths as the map does", () => {
    expect(index.map((path) => path.pathId)).toEqual(["pos-a", "pos-b", "pos-a#2"]);
  });

  it("places on one path pass; a point shared by two paths fits either; the question's places stand apart", () => {
    const parent = (places: string[]) => parentOf({ places, picks: undefined });
    expect(digPicksOnOnePath(parent(["path:pos-a", "p:n1"]), index)).toBe(true);
    expect(digPicksOnOnePath(parent(["p:n2", "path:pos-a#2"]), index)).toBe(true);
    expect(digPicksOnOnePath(parent(["p:n1", "p:n3"]), index)).toBe(false);
    expect(digPicksOnOnePath(parent(["o:0", "w"]), index)).toBe(true);
    expect(digPicksOnOnePath(parent(["o:0", "path:pos-b"]), index)).toBe(false);
    // Without a story every point hangs under the question.
    expect(digPicksOnOnePath(parent(["p:n1", "w"]), null)).toBe(true);
  });

  it("checks the parent's level only after Free's cap, and reads no story for a dig refused before it", async () => {
    const readPathIndex = vi.fn(async () => index);
    const ports = { readDigLevel: vi.fn(async () => DIG_LEVEL_MAX), readPathIndex };
    expect(await admitDig({ ownerRef: OWNER_REF, parent: parentOf(), free: false }, ports)).toEqual({ kind: "TOO_DEEP" });
    expect(readPathIndex).not.toHaveBeenCalled();
    expect(await admitDig({ ownerRef: OWNER_REF, parent: parentOf(), free: false },
      { readDigLevel: async () => DIG_LEVEL_MAX - 1, readPathIndex }))
      // W3-7: the admission names the path the dig's places share (its picks are kept on it).
      .toEqual({ kind: "ADMIT", parentLevel: DIG_LEVEL_MAX - 1, positionRef: "pos-a" });
  });
});

describe("joining at start", () => {
  it("a dig of a dig of a closed investigation reopens it, then joins", async () => {
    const calls: string[] = [];
    let closed = true;
    const port: DigJoinPort = {
      join: async (input) => {
        calls.push(`join ${input.parentRunId}`);
        return closed ? { outcome: "CLOSED", investigationId: "inv-1", digLevel: null }
          : { outcome: "JOINED", investigationId: "inv-1", digLevel: 2 };
      },
      reopen: async (_owner, investigationId) => { calls.push(`reopen ${investigationId}`); closed = false; return "REOPENED"; }
    };
    // The parent is itself a dig (level 1) of the investigation's first debate, closed by "Write my report".
    expect(await joinAtStart({ ownerRef: OWNER_REF, parent: parentOf(), childRunId: CHILD }, port)).toBe("JOINED");
    expect(calls).toEqual([`join ${PARENT}`, "reopen inv-1", `join ${PARENT}`]);
  });

  it("a join that does not take is logged by its code only and leaves the run as it is", async () => {
    const lines: string[] = [];
    const port: DigJoinPort = {
      join: async () => ({ outcome: "TOO_DEEP", investigationId: "inv-1", digLevel: null }),
      reopen: async () => "REOPENED"
    };
    expect(await joinAtStart({ ownerRef: OWNER_REF, parent: parentOf(), childRunId: CHILD }, port, (line) => lines.push(line))).toBe("TOO_DEEP");
    expect(lines).toEqual([JSON.stringify({ kind: "DEBATEAI_DIG_JOIN", code: "DIG_JOIN_TOO_DEEP" })]);
  });
});
