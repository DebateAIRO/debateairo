import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  DIG_FREE_PICKS_MAX, DIG_LEVEL_MAX, DIG_PICKS_ONE_PATH, DigFreePicksMaxSchema, DigPicksOnePathSchema, DigTooDeepSchema,
  FREE_DIG_PICKS_MAX, type AskParent, type AskRequest
} from "@debateai/contract";
import {
  admitDig, digPathIndexOf, digPicksOnOnePath, joinAtStart, type DigJoinPort
} from "../../apps/api/src/dig-admission.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Plan 2026-10-30 dig-model revision, task W3-2 — A DIG'S ADMISSION AND ITS LEVEL. A dig of a debate at level 9 is
 * level 10, the deepest, and is admitted; a dig of a level-10 debate would be level 11 and is refused 409 DIG_TOO_DEEP
 * before anything is charged (the question check, a paid site call, is never asked; nothing is submitted). Picks stay
 * on one path (owner Q-D1); Free combines at most 3. At start the dig joins its parent's investigation, reopening it
 * when it was closed. (The dig level is how many digs sit above a debate, never how far one debate's tree grows.)
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

function apiWith(level: number | null) {
  const submitted: AskRequest[] = [];
  const checked: string[] = [];
  const joins: Parameters<DigJoinPort["join"]>[0][] = [];
  const application = {
    submit: async (ask: AskRequest) => { submitted.push(ask); return { run_ref: CHILD, status: "QUEUED" as const }; }
  } as unknown as AskApplication;
  const api = buildApi({
    application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN,
    questionCheck: { check: async (question: string) => { checked.push(question); return { outcome: "PASS" as const }; } },
    digModel: {
      readDigLevel: async (ownerRef: string, runId: string) => ownerRef === OWNER_REF && runId === PARENT ? level : null,
      readPause: async () => null, resume: async () => "NOT_OWNED" as const
    },
    investigations: {
      join: async (input) => { joins.push(input); return { outcome: "JOINED" as const, investigationId: "inv-1", digLevel: (level ?? 0) + 1 }; },
      reopen: async () => "REOPENED" as const
    }
  });
  return { api, submitted, checked, joins };
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

  it("11 refused with nothing charged: 409 DIG_TOO_DEEP, no question check, nothing submitted, nothing joined", async () => {
    const { api, submitted, checked, joins } = apiWith(DIG_LEVEL_MAX);
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: askOf(parentOf()) });
    expect(response.statusCode).toBe(409);
    expect(DigTooDeepSchema.parse(response.json())).toEqual({ error: "DIG_TOO_DEEP", message: "DIG_TOO_DEEP", level_max: 10 });
    expect([submitted, checked, joins]).toEqual([[], [], []]);
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
