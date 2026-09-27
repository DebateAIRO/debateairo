import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { AnswerStorySchema, type Answer } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type { StoredStory } from "../../packages/story/src/repository.js";
import {
  RepositoryAnswerStoryApplication,
  storyOwnership,
  type AnswerStoryApplication
} from "../../apps/api/src/stories.js";
import {
  TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders
} from "../support/httpSession.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import { STORY_TEST_ANSWER_ID, STORY_TEST_BODY, storedStoryRecord } from "../support/storyApiFixtures.js";

const CREATED_AT = "2026-09-26T10:00:00.000Z";
const OWNER = testHttpIdentity("story-owner");
const HEADERS = testSessionHeaders(OWNER);

function servedAnswer(overrides: Partial<Answer> = {}): Answer {
  return buildFairShapedAnswer({ answer_id: STORY_TEST_ANSWER_ID, relevant_as_of: CREATED_AT, ...overrides });
}

function application(answer: Answer | null, reads: unknown[] = []): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "run:test", status: "QUEUED" }),
    readAnswer: async (answerId, _session, version, ownership) => {
      reads.push({ answerId, version, ownership });
      return answer;
    },
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

/** The story's version as the repository reads it: the answer's first (M5 review, I1). */
const ANCHOR = Object.freeze({ answerVersion: 1, storedAt: new Date(CREATED_AT) });

function stories(stored: StoredStory | null, calls: unknown[] = []): AnswerStoryApplication {
  return {
    readStory: async (input) => {
      calls.push(input);
      return stored;
    },
    readStoryAnchor: async () => ANCHOR
  };
}

/** A story reader that fails the way the repository can: a typed code plus a message that must never leave. */
const FAILURE_DETAIL = "row 33333333 failed its checks near SELECT story.content";
function failingStories(calls: unknown[] = []): AnswerStoryApplication {
  return {
    readStory: async (input) => {
      calls.push(input);
      throw new TypedDomainError("STORY_ROW_INVALID", FAILURE_DETAIL);
    },
    readStoryAnchor: async () => ANCHOR
  };
}

function api(input: {
  answer: Answer | null;
  stories?: AnswerStoryApplication;
  now?: string;
  reads?: unknown[];
}) {
  return buildApi({
    application: application(input.answer, input.reads),
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    ...(input.stories === undefined ? {} : { stories: input.stories }),
    ...(input.now === undefined ? {} : { storyClock: () => new Date(input.now!) })
  });
}

const URL_OF = `/v1/answers/${STORY_TEST_ANSWER_ID}/story`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /v1/answers/{id}/story (spec §10)", () => {
  it("refuses an anonymous caller before anything is read", async () => {
    const reads: unknown[] = [];
    const calls: unknown[] = [];
    const server = api({ answer: servedAnswer(), stories: stories(storedStoryRecord(), calls), reads });
    const response = await server.inject({ method: "GET", url: URL_OF });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(reads).toEqual([]);
    expect(calls).toEqual([]);
    await server.close();
  });

  it("answers the closed 404 when the story capability is not composed", async () => {
    const reads: unknown[] = [];
    const server = api({ answer: servedAnswer(), reads });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "STORY_NOT_FOUND" });
    expect(reads).toEqual([]);
    await server.close();
  });

  it("answers the same closed 404 for a malformed id and never reads", async () => {
    const reads: unknown[] = [];
    const calls: unknown[] = [];
    const server = api({ answer: servedAnswer(), stories: stories(storedStoryRecord(), calls), reads });
    const response = await server.inject({ method: "GET", url: "/v1/answers/not-a-uuid/story", headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "STORY_NOT_FOUND" });
    expect(reads).toEqual([]);
    expect(calls).toEqual([]);
    await server.close();
  });

  it("answers the same closed 404 for an answer that is not the caller's, without touching the story", async () => {
    const calls: unknown[] = [];
    const server = api({ answer: null, stories: stories(storedStoryRecord(), calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "STORY_NOT_FOUND" });
    expect(calls).toEqual([]);
    await server.close();
  });

  it("keeps a foreign answer's closed 404 even when its story could not have been read", async () => {
    const calls: unknown[] = [];
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = api({ answer: null, stories: failingStories(calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "STORY_NOT_FOUND" });
    expect(calls).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
    await server.close();
  });

  it("returns a READY story for the answer's own version under the caller's ownership", async () => {
    const reads: unknown[] = [];
    const calls: unknown[] = [];
    const server = api({ answer: servedAnswer(), stories: stories(storedStoryRecord(), calls), reads });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = AnswerStorySchema.parse(response.json());
    expect(body.status).toBe("READY");
    expect(body.story).toEqual(STORY_TEST_BODY);
    expect(body.shape).toEqual({ id: "money-decision", title: "Money decision" });
    expect(body.point_numbers).toEqual({ "node:position": "P1", "node:defeater": "P2" });
    expect(body.rounds).toBe(1);
    const ownership = { ownerRef: OWNER.authenticated.ownerRef, legacyAskerId: null };
    expect(reads).toEqual([{ answerId: STORY_TEST_ANSWER_ID, version: undefined, ownership }]);
    expect(calls).toEqual([{ answerId: STORY_TEST_ANSWER_ID, answerVersion: 1, ownership }]);
    await server.close();
  });

  it("carries the checker's reservation on a READY_WITH_RESERVATION story", async () => {
    const stored = storedStoryRecord({ outcome: "READY_WITH_RESERVATION", reservation: "The summary overstates the rent." });
    const server = api({ answer: servedAnswer(), stories: stories(stored) });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({
      status: "READY_WITH_RESERVATION", reservation: "The summary overstates the rent.", story: STORY_TEST_BODY
    });
    await server.close();
  });

  it("says WRITING inside the waiting window when no row exists yet", async () => {
    const server = api({ answer: servedAnswer(), stories: stories(null), now: "2026-09-26T10:05:00.000Z" });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({ status: "WRITING", unavailable_reason: null, story: null });
    await server.close();
  });

  it("says UNAVAILABLE once the window has passed with no row (the runner died mid-story)", async () => {
    const server = api({ answer: servedAnswer(), stories: stories(null), now: "2026-09-26T10:41:00.000Z" });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({ status: "UNAVAILABLE", unavailable_reason: "STORY_WINDOW_PASSED", story: null });
    await server.close();
  });

  /**
   * M5 review, I1: a DR-184 review catch-up appends version 2 with no story of
   * its own and carries the verdict forward. The story of version 1 is still
   * this answer's story, and the response names the story's own version.
   */
  it("returns version 1's story, READY and named as version 1, for an answer a catch-up moved to version 2", async () => {
    const calls: unknown[] = [];
    const server = api({ answer: servedAnswer({ answer_version: 2 }), stories: stories(storedStoryRecord(), calls) });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({ answer_version: 1, status: "READY", story: STORY_TEST_BODY });
    expect(calls).toEqual([{
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 2, ownership: { ownerRef: OWNER.authenticated.ownerRef, legacyAskerId: null }
    }]);
    await server.close();
  });

  it("waits for a story not stored yet from the version it is written for, never from a catch-up version", async () => {
    // Version 2 was appended 50 minutes after version 1: measured from version
    // 2 the story would still be WRITING; it was lost 10 minutes ago.
    const answer = servedAnswer({ answer_version: 2, relevant_as_of: "2026-09-26T10:50:00.000Z" });
    const server = api({ answer, stories: stories(null), now: "2026-09-26T10:51:00.000Z" });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({ answer_version: 1, status: "UNAVAILABLE", unavailable_reason: "STORY_WINDOW_PASSED" });
    await server.close();
  });

  it("says UNAVAILABLE at once for an answer without a verdict", async () => {
    const answer = servedAnswer({
      terminal: "BLOCKED", verdict_state: null, verdict_unavailable: { reason_ref: "reason:blocked" }
    });
    const server = api({ answer, stories: stories(null), now: "2026-09-26T10:01:00.000Z" });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({ status: "UNAVAILABLE", unavailable_reason: "NO_VERDICT" });
    await server.close();
  });

  it("reports a FAILED row as UNAVAILABLE with its code and no story text", async () => {
    const stored = storedStoryRecord({ outcome: "FAILED", failureCode: "STORY_ENVELOPE_EXHAUSTED", body: null });
    const server = api({ answer: servedAnswer(), stories: stories(stored) });
    const body = AnswerStorySchema.parse((await server.inject({ method: "GET", url: URL_OF, headers: HEADERS })).json());
    expect(body).toMatchObject({ status: "UNAVAILABLE", unavailable_reason: "STORY_ENVELOPE_EXHAUSTED", story: null });
    await server.close();
  });

  it("turns a read error on the caller's own answer into UNAVAILABLE, logging the code and never the detail", async () => {
    const calls: unknown[] = [];
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = api({ answer: servedAnswer(), stories: failingStories(calls) });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(FAILURE_DETAIL);
    expect(AnswerStorySchema.parse(response.json())).toEqual({
      answer_id: STORY_TEST_ANSWER_ID, answer_version: 1, status: "UNAVAILABLE",
      unavailable_reason: "STORY_UNREADABLE", shape: null, pack: null, written_at: null,
      storyteller: null, checker: null, rounds: null, language: null, reservation: null, verdict_basis: null,
      point_numbers: null, story: null
    });
    expect(calls).toHaveLength(1);
    expect(logged).toHaveBeenCalledTimes(1);
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain(FAILURE_DETAIL);
    expect(JSON.parse(line)).toMatchObject({
      event: "api.story.unreadable", route: "/v1/answers/:id/story", diagnostic: "STORY_ROW_INVALID"
    });
    await server.close();
  });

  it("keeps an untyped read error just as closed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const server = api({
      answer: servedAnswer(),
      stories: { readStory: async () => { throw new Error(FAILURE_DETAIL); }, readStoryAnchor: async () => ANCHOR }
    });
    const response = await server.inject({ method: "GET", url: URL_OF, headers: HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(FAILURE_DETAIL);
    expect(response.json()).toMatchObject({ status: "UNAVAILABLE", unavailable_reason: "STORY_UNREADABLE" });
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain(FAILURE_DETAIL);
    // The API's bounded diagnostic alphabet: a plain Error is its class category, never its text.
    expect(JSON.parse(line)).toMatchObject({ event: "api.story.unreadable", diagnostic: "ERROR" });
    await server.close();
  });
});

describe("story ownership adapter", () => {
  it("passes exactly the ownership the API resolved, never an empty key", () => {
    expect(storyOwnership({ ownerRef: "owner-1", legacyAskerId: null })).toEqual({ ownerRef: "owner-1" });
    expect(storyOwnership({ ownerRef: null, legacyAskerId: "legacy-1" })).toEqual({ legacyAskerId: "legacy-1" });
  });

  it("reads the repository with the adapted ownership and the answer's own version", async () => {
    const received: unknown[] = [];
    const stored = storedStoryRecord();
    const adapter = new RepositoryAnswerStoryApplication({
      readForAnswer: async (input) => {
        received.push(input);
        return stored;
      },
      readStoryAnchor: async (input) => {
        received.push(input);
        return ANCHOR;
      }
    });
    await expect(adapter.readStory({
      answerId: STORY_TEST_ANSWER_ID, answerVersion: 3, ownership: { ownerRef: "owner-1", legacyAskerId: null }
    })).resolves.toBe(stored);
    expect(received).toEqual([{ answerId: STORY_TEST_ANSWER_ID, answerVersion: 3, ownership: { ownerRef: "owner-1" } }]);
    await expect(adapter.readStoryAnchor({
      answerId: STORY_TEST_ANSWER_ID, ownership: { ownerRef: null, legacyAskerId: "legacy-1" }
    })).resolves.toBe(ANCHOR);
    expect(received.at(-1)).toEqual({ answerId: STORY_TEST_ANSWER_ID, ownership: { legacyAskerId: "legacy-1" } });
  });
});
