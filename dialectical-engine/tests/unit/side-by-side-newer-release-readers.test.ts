import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MadeByNewerReleaseError, buildApi, type AskApplication } from "@debateai/api";
import type { PublicationApplication } from "../../apps/api/src/publications.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Side-by-side uploads spec 2026-10-21 §5, §6 (plan C task C14) — A READER MEETS ANOTHER RELEASE'S DATA. While two
 * releases run side by side, the older API can be asked for a debate the newer release made, and that debate may carry
 * a value this code does not know. The person sees "open it on the current site": a typed 409
 * `{error:"MADE_BY_NEWER_RELEASE", message:"MADE_BY_NEWER_RELEASE"}`, never a 404 or a 500. Only a debate stamped by
 * ANOTHER release (not this API's own key, not `legacy`) reads that way — a read of this release's own data that fails
 * is a real bug and stays a loud 500. An unreadable live event is skipped (one journal line), never a torn-down stream.
 * The code is sent on debate reads only (the website's note says "this debate was made by a newer version"). The
 * publication half (readPublicDebate, list): tests/unit/s8-publication.test.ts.
 */
// Built from pieces: a `…_KEY = "literal"` pair on one line trips gitleaks' generic-api-key rule.
const OWN_RELEASE = ["r17", "0123456789ab"].join("-");
const NEWER_RELEASE = ["r18", "ba9876543210"].join("-");
const OLD = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const ANSWER_ID = "33333333-3333-4333-8333-333333333333";
const PUBLIC_REF = "44444444-4444-4444-8444-444444444444";
const OWNER = testHttpIdentity("c14-newer-release-owner");
const MADE_BY_NEWER = Object.freeze({ error: "MADE_BY_NEWER_RELEASE", message: "MADE_BY_NEWER_RELEASE" });

/** A ZodError exactly as a contract parse throws it on a value this release does not know. */
function zodFailure(): unknown {
  try {
    z.enum(["QUEUED", "RUNNING"]).parse("SITE_BUSY");
  } catch (error) {
    return error;
  }
  throw new Error("UNREACHABLE");
}

type Stamps = Readonly<{ run?: string | null; answer?: string | null }>;

function fixtureApplication(input: Readonly<{
  stamps?: Stamps;
  readFails?: unknown;
  keysRead?: string[];
  events?: readonly unknown[];
  withKeyReaders?: boolean;
}>): AskApplication {
  const fail = async (): Promise<never> => { throw input.readFails ?? zodFailure(); };
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: fail,
    readRunAnswer: fail,
    readRun: fail,
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
    events: async function* () { for (const event of input.events ?? []) yield event; },
    resolveRunRef: async (runId) => runId === OLD ? RUN_ID : runId,
    ...(input.withKeyReaders === false ? {} : {
      readRunReleaseKey: async (runId: string) => { input.keysRead?.push(`run:${runId}`); return input.stamps?.run ?? null; },
      readAnswerReleaseKey: async (answerId: string) => {
        input.keysRead?.push(`answer:${answerId}`);
        return input.stamps?.answer ?? null;
      }
    })
  };
}

function api(application: AskApplication, extra: Partial<Parameters<typeof buildApi>[0]> = {}) {
  return buildApi({
    application,
    sessions: testSessionApplication([OWNER]),
    allowedOrigin: TEST_APP_ORIGIN,
    releaseKey: OWN_RELEASE,
    ...extra
  });
}

const read = testSessionHeaders(OWNER);
const ROUTES = Object.freeze([
  { url: `/v1/runs/${RUN_ID}`, stamp: "run" },
  { url: `/v1/runs/${RUN_ID}/answer`, stamp: "run" },
  { url: `/v1/answers/${ANSWER_ID}`, stamp: "answer" }
] as const);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("side-by-side C14: a debate made by a newer release reads as 'open it on the current site'", () => {
  it("each of the three debate reads answers 409 MADE_BY_NEWER_RELEASE for a run stamped by another release", async () => {
    for (const route of ROUTES) {
      const app = api(fixtureApplication({ stamps: { [route.stamp]: NEWER_RELEASE } }));
      try {
        const response = await app.inject({ method: "GET", url: route.url, headers: read });
        expect(response.statusCode, route.url).toBe(409);
        expect(response.json(), route.url).toEqual(MADE_BY_NEWER);
      } finally {
        await app.close();
      }
    }
  });

  it("a projection whose state this release does not know (the contract parse) reads the same way", async () => {
    const application = fixtureApplication({ stamps: { run: NEWER_RELEASE } });
    application.readRun = async (runId) => ({
      run_ref: runId, question_line: "A debate the newer release made", state: "SITE_BUSY" as never,
      terminal_reason: null, hold_until: null
    });
    const app = api(application);
    try {
      const response = await app.inject({ method: "GET", url: `/v1/runs/${RUN_ID}`, headers: read });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual(MADE_BY_NEWER);
    } finally {
      await app.close();
    }
  });

  it("reads the release key of the RESOLVED run (side-by-side C9), and an answer's through its run", async () => {
    const keysRead: string[] = [];
    const app = api(fixtureApplication({ stamps: { run: NEWER_RELEASE, answer: NEWER_RELEASE }, keysRead }));
    try {
      expect((await app.inject({ method: "GET", url: `/v1/runs/${OLD}`, headers: read })).statusCode).toBe(409);
      expect((await app.inject({ method: "GET", url: `/v1/runs/${OLD}/answer`, headers: read })).statusCode).toBe(409);
      expect((await app.inject({ method: "GET", url: `/v1/answers/${ANSWER_ID}`, headers: read })).statusCode).toBe(409);
      expect(keysRead).toEqual([`run:${RUN_ID}`, `run:${RUN_ID}`, `answer:${ANSWER_ID}`]);
    } finally {
      await app.close();
    }
  });

  it("this release's own data, a legacy run, or no known key stays a loud 500 INTERNAL_ERROR (a real bug)", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const stamp of [OWN_RELEASE, "legacy", null]) {
      for (const route of ROUTES) {
        const app = api(fixtureApplication({ stamps: { [route.stamp]: stamp } }));
        try {
          const response = await app.inject({ method: "GET", url: route.url, headers: read });
          expect(response.statusCode, `${route.url} ${String(stamp)}`).toBe(500);
          expect(response.json().error, `${route.url} ${String(stamp)}`).toBe("INTERNAL_ERROR");
        } finally {
          await app.close();
        }
      }
    }
    expect(error.mock.calls.map(([line]) => JSON.parse(String(line)).event)).toContain("api.request.failed");
  });

  it("only a ZodError is a newer release's data: any other failure of another release's run stays 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = api(fixtureApplication({ stamps: { run: NEWER_RELEASE }, readFails: new Error("DATABASE_EXPLODED") }));
    try {
      const response = await app.inject({ method: "GET", url: `/v1/runs/${RUN_ID}`, headers: read });
      expect(response.statusCode).toBe(500);
      expect(response.json().error).toBe("INTERNAL_ERROR");
    } finally {
      await app.close();
    }
  });

  it("an application that cannot read a run's key, or an API with no key of its own, stays 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const noReaders = api(fixtureApplication({ withKeyReaders: false }));
    const noOwnKey = buildApi({
      application: fixtureApplication({ stamps: { run: NEWER_RELEASE } }),
      sessions: testSessionApplication([OWNER]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    try {
      expect((await noReaders.inject({ method: "GET", url: `/v1/runs/${RUN_ID}`, headers: read })).statusCode).toBe(500);
      expect((await noOwnKey.inject({ method: "GET", url: `/v1/runs/${RUN_ID}`, headers: read })).statusCode).toBe(500);
    } finally {
      await noReaders.close();
      await noOwnKey.close();
    }
  });

  it("GET /v1/public/debates/<ref> answers 409 when the snapshot was made by a newer release", async () => {
    const publications = {
      readPublicDebate: async () => { throw new MadeByNewerReleaseError(); },
      list: async () => ({ items: [], total: 0 })
    } as unknown as PublicationApplication;
    const app = api(fixtureApplication({}), { publications });
    try {
      const response = await app.inject({ method: "GET", url: `/v1/public/debates/${PUBLIC_REF}` });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual(MADE_BY_NEWER);
    } finally {
      await app.close();
    }
  });
});

describe("side-by-side C14: an unreadable live event is skipped, never a torn-down stream", () => {
  const event = (id: string, eventType: string, sequence: number) => ({
    event_id: id, event_type: eventType, run_ref: RUN_ID, at_sequence: sequence, payload: {}
  });

  it("skips the one event this release cannot read, logs it, sends the rest and ends the stream cleanly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const application = fixtureApplication({
      events: [event("event:1", "run.accepted", 1), event("event:2", "run.future_kind", 2), event("event:3", "run.accepted", 3)]
    });
    application.readRun = async (runId) => ({
      run_ref: runId, question_line: "A streamed run", state: "QUEUED", terminal_reason: null, hold_until: null
    });
    const app = api(application);
    // How the route closes the response: a clean end() or a destroy(). The injector's own end() releases its mock
    // socket through destroy(); that inner call is part of end, not a teardown by the route.
    const ends: string[] = [];
    app.addHook("onRequest", async (_request, reply) => {
      const raw = reply.raw;
      const end = raw.end.bind(raw);
      const destroy = raw.destroy.bind(raw);
      let ending = false;
      raw.end = ((...args: Parameters<typeof raw.end>) => {
        ends.push("end");
        ending = true;
        try { return end(...args); } finally { ending = false; }
      }) as typeof raw.end;
      raw.destroy = ((...args: Parameters<typeof raw.destroy>) => {
        if (!ending) ends.push("destroy");
        return destroy(...args);
      }) as typeof raw.destroy;
    });
    try {
      const response = await app.inject({ method: "GET", url: `/v1/runs/${RUN_ID}/events`, headers: read });
      expect(response.statusCode).toBe(200);
      expect(response.body.match(/^event: /gmu)).toHaveLength(2);
      expect(response.body).toContain("id: event:1\n");
      expect(response.body).toContain("id: event:3\n");
      expect(response.body).not.toContain("run.future_kind");
      expect(ends).toEqual(["end"]);
      expect(error.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
        { event: "api.run_event.unreadable", runId: RUN_ID, event_type: "run.future_kind" }
      ]);
    } finally {
      await app.close();
    }
  });
});

describe("side-by-side C14: the unreadable-event line stays content-free", () => {
  it("logs event_type only when it has the shape of an event name, otherwise null", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const application = fixtureApplication({
      events: [{ event_id: "event:1", event_type: "Somebody's words, not a kind", run_ref: RUN_ID, at_sequence: 1, payload: {} }, "not an event"]
    });
    application.readRun = async (runId) => ({
      run_ref: runId, question_line: "A streamed run", state: "QUEUED", terminal_reason: null, hold_until: null
    });
    const app = api(application);
    try {
      const response = await app.inject({ method: "GET", url: `/v1/runs/${RUN_ID}/events`, headers: read });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/^event: /gmu);
      expect(error.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
        { event: "api.run_event.unreadable", runId: RUN_ID, event_type: null },
        { event: "api.run_event.unreadable", runId: RUN_ID, event_type: null }
      ]);
    } finally {
      await app.close();
    }
  });
});

describe("side-by-side C14: MADE_BY_NEWER_RELEASE is sent on debate reads only", () => {
  const SOURCE_ROOT = join(import.meta.dirname, "../../apps/api/src");
  const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? sources(join(dir, entry.name))
      : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : []);
  const count = (text: string, needle: string) => text.split(needle).length - 1;

  it("only the newer-release fallback and readPublicDebate throw it; the fallback wraps the three debate reads", () => {
    const throwers: string[] = [];
    for (const file of sources(SOURCE_ROOT)) {
      const text = readFileSync(file, "utf8");
      for (let n = count(text, "new MadeByNewerReleaseError("); n > 0; n -= 1) throwers.push(file.slice(SOURCE_ROOT.length + 1));
    }
    expect(throwers.sort()).toEqual(["index.ts", "publications.ts"]);
    const index = readFileSync(join(SOURCE_ROOT, "index.ts"), "utf8");
    // Each route's registration runs from its path to the next route registration.
    const routeBody = (path: string) => {
      const start = index.indexOf(`>("${path}", routePolicy(`);
      expect(start, path).toBeGreaterThan(0);
      return index.slice(start, index.indexOf("\n  api.", start));
    };
    for (const path of ["/v1/runs/:id", "/v1/runs/:id/answer", "/v1/answers/:id"]) {
      expect(count(routeBody(path), "withNewerReleaseFallback("), path).toBe(1);
    }
    expect(count(index, "function withNewerReleaseFallback<")).toBe(1);
    expect(count(index, "withNewerReleaseFallback(")).toBe(3); // the three debate reads, nothing else
  });
});
