import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { AnswerSchema, PublicDebateSchema, type AskRequest, type PublicDebate } from "@debateai/contract";
import type { StoredAsk } from "@debateai/db";
import { buildPublicDebateBody } from "../../apps/api/src/publications.js";
import { mergedPublicDebate, textPiecesOf } from "../../apps/api/src/public-tree.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/*
 * V4 start step, Task 75d (owner, 5 Nov, second round: "A public page shows each debate at the level it was asked at, the same as its
 * map and report"; "every dig is stored and priced at its debate's level"). The public read carries the debate's reading level,
 * copied at publish time from the run (as its language is), added last and optional, so an older reader and every snapshot
 * published before it still parse (the page reads a snapshot without one as Plain words). A dig made on a public page follows the
 * level the page shows, since a stranger's own run is never readable to the person digging. Made-up data only.
 */

const IDENTITY = testHttpIdentity("public-read-reading-level");
const HEADERS = testSessionHeaders(IDENTITY, true);
const PUBLIC_REF = "33333333-3333-4333-8333-333333333333";
const PARENT_RUN_ID = "44444444-4444-4444-8444-444444444444";
const CHILD_RUN_ID = "55555555-5555-4555-8555-555555555555";

type LevelRead = (runId: string, userId: string, ownerRef: string) => Promise<string | null>;
const publicBody = (readRunReadingLevel: LevelRead) => buildPublicDebateBody({
  runId: "run-1", answer: AnswerSchema.parse(buildFairShapedAnswer()), owner: { userId: "user-1", ownerRef: "owner-1" },
  readers: {
    stories: { readStoryShort: async () => null },
    repository: { readArgumentLanguageTag: async () => null, readAnswerFloor: async () => null, readRunReadingLevel } as never,
    mapViews: { readMapView: async () => null } as never
  },
  source: { requestId: "request-1" } as never
});
const snapshotOf = (body: Awaited<ReturnType<typeof publicBody>>): PublicDebate => PublicDebateSchema.parse({
  ...body, public_ref: PUBLIC_REF, author_pseudonym: "Stable Public Author", published_at: "2026-11-05T10:00:00.000Z"
});

describe("the public read carries the debate's reading level", () => {
  it("is copied at publish time from the run the person owns, and is the snapshot's last member", async () => {
    const asked: unknown[][] = [];
    const body = await publicBody(async (...args) => { asked.push(args); return "expert"; });
    expect(asked).toEqual([["run-1", "user-1", "owner-1"]]);
    expect(body.reading_level).toBe("expert");
    const snapshot = snapshotOf(body);
    expect(snapshot.reading_level).toBe("expert");
    expect(Object.keys(snapshot).at(-1)).toBe("reading_level");
  });

  it("a debate asked without a level, a stored value that is not one, or a failed read publishes none, and the debate still publishes", async () => {
    for (const read of [async () => null, async () => "basic", async () => { throw new Error("database offline"); }] as LevelRead[]) {
      const body = await publicBody(read);
      expect(body).not.toHaveProperty("reading_level");
      expect(snapshotOf(body).question.length).toBeGreaterThan(0);
    }
  });

  it("the contract: optional (every snapshot published before it parses), one of the three levels only", async () => {
    const snapshot = snapshotOf(await publicBody(async () => null));
    expect(PublicDebateSchema.parse(snapshot)).not.toHaveProperty("reading_level");
    expect(PublicDebateSchema.parse({ ...snapshot, reading_level: "background" }).reading_level).toBe("background");
    expect(PublicDebateSchema.safeParse({ ...snapshot, reading_level: "EXPERT" }).success).toBe(false);
  });

  it("is a level, not words a person reads: no review correction and no report check is offered on it", async () => {
    const snapshot = snapshotOf(await publicBody(async () => "expert"));
    expect(textPiecesOf(snapshot).map((piece) => piece.pointer)).not.toContain("/reading_level");
    expect(textPiecesOf(snapshot).map((piece) => piece.text)).not.toContain("expert");
  });

  it("is served by GET /v1/public/debates/{id} with the page's copies merged in", async () => {
    const snapshot = snapshotOf(await publicBody(async () => "expert"));
    const merged = mergedPublicDebate(snapshot, { updates: [], reports: [], authorNameGone: false, open: () => null });
    expect(merged.reading_level).toBe("expert");
    const api = buildApi({
      application: {} as AskApplication, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN,
      publications: { readPublicDebate: async (ref: string) => (ref === PUBLIC_REF ? merged : null) } as never
    });
    try {
      const response = await api.inject({ method: "GET", url: `/v1/public/debates/${PUBLIC_REF}` });
      expect(response.statusCode).toBe(200);
      expect(response.json().reading_level).toBe("expert");
    } finally {
      await api.close();
    }
  });
});

/*
 * A dig made on someone else's public page: the run behind the page is not the person's, so it cannot be read for its level (the
 * run's own policy); the dig takes the level the page shows. Its join after submit is refused here (NOT_PUBLIC), so the route
 * answers 202 with `public_dig_not_joined`: only what was submitted is read.
 */
function publicDigApi(pageLevel: "plain" | "background" | "expert" | undefined) {
  const submitted: AskRequest[] = [];
  const storedReads: string[] = [];
  const application = {
    submit: async (ask: AskRequest) => { submitted.push(ask); return { run_ref: CHILD_RUN_ID, status: "QUEUED" as const }; },
    readRunAnswer: async () => null,
    // A stranger's run is never readable to the person digging.
    readStoredAsk: async (runId: string) => { storedReads.push(runId); return null as StoredAsk | null; }
  } as unknown as AskApplication;
  const api = buildApi({
    application, sessions: testSessionApplication([IDENTITY]), allowedOrigin: TEST_APP_ORIGIN,
    questionCheck: { check: async () => ({ outcome: "PASS" as const }) },
    publicTree: {
      pool: {} as never,
      tree: { readTreeOfRun: async () => null, readDigParent: async () => ({ root_run_id: PARENT_RUN_ID, parent_run_id: PARENT_RUN_ID, level: 0, writing: false }),
        join: async () => ({ outcome: "NOT_PUBLIC" as const, digLevel: null }) } as never,
      contributions: {} as never,
      readPublicDebate: async () => ({ story_short: { paths: [{ position_ref: "pos-1", node_refs: [] }] },
        ...(pageLevel === undefined ? {} : { reading_level: pageLevel }) }) as never
    }
  } as never);
  const ask = (depthParams: Record<string, unknown>) => ({
    question_line: "Should Harbour Town build a second pier? Dig: the ferry timetable.",
    risk_tier: "casual", tier_source: "ASKER", tier_provenance_ref: "asker-declaration:test",
    composition_budget_tier: "low", plan_tier: "premium", depth_params: depthParams,
    decision_scope: "test-layer scope", as_of: "2026-11-05T00:00:00.000Z", steering_presets: [], steering_annotations: [],
    public_parent: { public_ref: PUBLIC_REF, places: ["path:pos-1"], mode: "quick" }
  });
  const post = (depthParams: Record<string, unknown>) => api.inject({ method: "POST", url: "/v1/asks", headers: HEADERS, payload: ask(depthParams) });
  return { api, post, submitted, storedReads };
}

describe("a dig on a public page is stored and priced at the level the page shows", () => {
  it("a page asked at Expert: the dig is Expert, at Expert's length, whatever the request names", async () => {
    const h = publicDigApi("expert");
    try {
      const response = await h.post({ depth: 1, answerLength: "short", readingLevel: "plain" });
      expect(response.statusCode).toBe(202);
      expect(response.json().public_dig_not_joined).toBe(true);
      expect(h.submitted.map((ask) => ask.depth_params)).toEqual([{ depth: 1, answerLength: "detailed", readingLevel: "expert" }]);
      expect(h.storedReads).toEqual([PARENT_RUN_ID]);
    } finally {
      await h.api.close();
    }
  });

  it("a page published before the level was copied reads as Plain words: no level kept, Plain words' length", async () => {
    const h = publicDigApi(undefined);
    try {
      const response = await h.post({ depth: 1, answerLength: "detailed", readingLevel: "expert" });
      expect(response.statusCode).toBe(202);
      expect(h.submitted.map((ask) => ask.depth_params)).toEqual([{ depth: 1, answerLength: "short" }]);
    } finally {
      await h.api.close();
    }
  });
});
