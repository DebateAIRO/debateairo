import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnPublicVotesSchema, PublicDebateListSchema, PublicDebateSchema, PublicVoteAnswerSchema } from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";
import {
  PUBLIC_REF, PUBLIC_REF_AUTHOR_GONE, PUBLIC_REF_BIKES, PUBLIC_REF_FOUR_DAY, PUBLIC_REF_HOMEWORK, seedPublicDebates
} from "../../tools/v4-mock-api/public-seed.js";

/*
 * Upvotes on public debates (design 2026-11-26 §4, §7.2): the mock API serves the list of public debates with a count on each row and the
 * three vote routes, so the home page's Public debates tab can be looked at without a database. The module is read fresh for each case (its
 * votes and counters are the mock's life). The routes run on a stand-in request and answer, as the mock's server hands them over; server.ts
 * listens when it is imported, so its wiring is read as source, as v4-mock-saved-questions does.
 */

/** A request whose body (if any) is handed over once the route listens for its end (as a socket's arrives). */
function fakeRequest(method: string, text: string | null): IncomingMessage {
  const request = new EventEmitter() as EventEmitter & { method: string; url: string; headers: Record<string, string>; destroy(): void };
  Object.assign(request, { method, url: "/", headers: {}, destroy: () => undefined });
  const on = request.on.bind(request);
  request.on = ((event: string, listener: (...args: unknown[]) => void) => {
    on(event, listener);
    if (event === "end") {
      void Promise.resolve().then(() => {
        if (text !== null) request.emit("data", Buffer.from(text, "utf8"));
        request.emit("end");
      });
    }
    return request;
  }) as typeof request.on;
  return request as unknown as IncomingMessage;
}

class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string> = {};
  text = "";
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  writeHead(status: number, headers: Record<string, string> = {}): this {
    this.statusCode = status;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }
  write(chunk: string): boolean {
    this.text += chunk;
    return true;
  }
  end(chunk?: string): this {
    if (chunk !== undefined) this.text += chunk;
    this.writableEnded = true;
    this.emit("close");
    return this;
  }
}

type Votes = typeof import("../../tools/v4-mock-api/public-votes.js");
const PAGES = seedPublicDebates();
const KNOWN = new Set(PAGES.map((page) => String(page.public_ref)));
const UNKNOWN = "f1000000-0000-4000-8000-00000000ffff";
const OWN = "/v1/account/public-debate-votes";
const NOT_FOUND = { error: "DEBATE_NOT_FOUND" };
const MALFORMED = { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" };
const votePath = (ref: string): string => `/v1/public/debates/${ref}/vote`;
const hidden = new Set<string>();
const isPublic = (ref: string): boolean => KNOWN.has(ref) && !hidden.has(ref);
let votes: Votes;
beforeEach(async () => {
  hidden.clear();
  vi.resetModules(); // the module's votes and counters are the mock's life: fresh for each case
  votes = await import("../../tools/v4-mock-api/public-votes.js");
});
async function call(method: string, path: string, sent: Readonly<{ body?: unknown; raw?: string; refs?: readonly string[] }> = {}): Promise<FakeResponse> {
  const res = new FakeResponse();
  const text = sent.raw ?? (sent.body === undefined ? null : JSON.stringify(sent.body));
  const handled = await votes.routePublicVotes(fakeRequest(method, text), res as unknown as ServerResponse, path, method, { isPublic, refs: sent.refs ?? [] });
  expect(handled, `${method} ${path}`).toBe(true);
  return res;
}
const jsonOf = (res: FakeResponse): unknown => JSON.parse(res.text);
const rowOf = (ref: string) => votes.publicList(PAGES, isPublic, 100, 0).items.find((row) => row.public_ref === ref);
const ownOf = async (...refs: string[]) => OwnPublicVotesSchema.parse(jsonOf(await call("GET", OWN, { refs: [refs.join(",")] }))).voted;

describe("V4 mock API: upvotes on public debates (public-votes.ts)", () => {
  it("five seeded pages, other people's counts beside the seed, one page already upvoted; the startup samples are built aside", () => {
    expect(PAGES.map((page) => page.public_ref)).toEqual([PUBLIC_REF, PUBLIC_REF_AUTHOR_GONE, PUBLIC_REF_BIKES, PUBLIC_REF_HOMEWORK, PUBLIC_REF_FOUR_DAY]);
    for (const page of PAGES) expect(PublicDebateSchema.safeParse(page).success && !("vote_count" in page), String(page.public_ref)).toBe(true);
    expect(Object.keys(PAGES[0]!).at(-1)).toBe("reading_level");
    expect(votes.MOCK_OTHER_VOTES).toEqual({ [PUBLIC_REF]: 7, [PUBLIC_REF_AUTHOR_GONE]: 0, [PUBLIC_REF_BIKES]: 999, [PUBLIC_REF_HOMEWORK]: 1248, [PUBLIC_REF_FOUR_DAY]: 12345 });
    expect(votes.MOCK_OWN_VOTES).toEqual([PUBLIC_REF_HOMEWORK]);
    const samples = votes.publicVoteSamples(PAGES);
    expect(PublicDebateListSchema.parse(samples.list).total).toBe(5);
    expect(PublicVoteAnswerSchema.parse(samples.cast)).toEqual({ voted: true, vote_count: 8 });
    expect(PublicVoteAnswerSchema.parse(samples.withdrawn)).toEqual({ voted: false, vote_count: 7 });
    expect(OwnPublicVotesSchema.parse(samples.own)).toEqual({ voted: [PUBLIC_REF_HOMEWORK] });
    expect(votes.publicVoteCounters()).toEqual({ casts: 0, withdrawals: 0, reads: 0, voted: 1 });
  });
  it("the list: one row per page that is public now, newest first, each with its count; it pages and leaves a hidden page out", () => {
    const list = votes.publicList(PAGES, isPublic, 50, 0);
    expect(PublicDebateListSchema.parse(list)).toEqual(list);
    expect(list.total).toBe(5);
    expect(list.items.map((row) => [row.public_ref, row.vote_count])).toEqual([
      [PUBLIC_REF_FOUR_DAY, 12345], [PUBLIC_REF_HOMEWORK, 1249], [PUBLIC_REF_BIKES, 999], [PUBLIC_REF_AUTHOR_GONE, 0], [PUBLIC_REF, 7]]);
    expect(list.items.slice(0, 3).map((row) => [row.author_pseudonym, row.question, row.published_at])).toEqual([
      ["Keen Plover", "Should offices move to a four-day week?", "2026-10-28T08:00:00.000Z"],
      ["Mild Badger", "Should schools stop giving homework?", "2026-10-26T08:00:00.000Z"],
      ["Brisk Wren", "Should cities build more bike lanes?", "2026-10-24T08:00:00.000Z"]]);
    expect(list.items.at(-1)).toEqual({ public_ref: PUBLIC_REF, author_pseudonym: "Calm Otter", question: "Should cities make public transport free?",
      published_at: "2026-10-20T08:00:00.000Z", verdict: "SUPPORTED", confidence_band: "moderate", vote_count: 7 });
    hidden.add(PUBLIC_REF_BIKES);
    const page = votes.publicList(PAGES, isPublic, 2, 1);
    expect(page.total).toBe(4);
    expect(page.items.map((row) => row.public_ref)).toEqual([PUBLIC_REF_HOMEWORK, PUBLIC_REF_AUTHOR_GONE]);
    expect(votes.publicList(PAGES, isPublic, 50, 9)).toEqual({ items: [], total: 4 });
  });
  it("casting twice is one vote, withdrawing twice is none, and one press takes a page from 999 to 1000", async () => {
    const first = await call("PUT", votePath(PUBLIC_REF), { body: {} });
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(PublicVoteAnswerSchema.parse(jsonOf(first))).toEqual({ voted: true, vote_count: 8 });
    expect(jsonOf(await call("PUT", votePath(PUBLIC_REF)))).toEqual({ voted: true, vote_count: 8 });
    expect(rowOf(PUBLIC_REF)?.vote_count).toBe(8);
    expect(await ownOf(...KNOWN)).toEqual([PUBLIC_REF, PUBLIC_REF_HOMEWORK]);
    for (const press of [1, 2]) expect(jsonOf(await call("DELETE", votePath(PUBLIC_REF))), String(press)).toEqual({ voted: false, vote_count: 7 });
    expect(jsonOf(await call("DELETE", votePath(PUBLIC_REF_AUTHOR_GONE)))).toEqual({ voted: false, vote_count: 0 });
    expect(jsonOf(await call("DELETE", votePath(PUBLIC_REF_HOMEWORK)))).toEqual({ voted: false, vote_count: 1248 });
    expect(jsonOf(await call("PUT", votePath(PUBLIC_REF_BIKES)))).toEqual({ voted: true, vote_count: 1000 });
    expect(jsonOf(await call("PUT", votePath(PUBLIC_REF_BIKES.toUpperCase())))).toEqual({ voted: true, vote_count: 1000 });
    expect(await ownOf(...KNOWN)).toEqual([PUBLIC_REF_BIKES]);
    expect(votes.publicVoteCounters()).toEqual({ casts: 4, withdrawals: 4, reads: 2, voted: 1 });
  });
  it("every absence is the one 404; a vote can be taken back from a hidden page; a hidden page keeps its votes", async () => {
    hidden.add(PUBLIC_REF_HOMEWORK);
    for (const res of [await call("PUT", votePath(UNKNOWN)), await call("PUT", votePath("not-an-id")), await call("PUT", votePath(PUBLIC_REF_HOMEWORK)),
      await call("DELETE", votePath(UNKNOWN)), await call("DELETE", votePath("not-an-id"))]) {
      expect(res.statusCode).toBe(404);
      expect(jsonOf(res)).toEqual(NOT_FOUND);
      expect(res.headers["cache-control"]).toBe("no-store");
    }
    expect(await ownOf(UNKNOWN, PUBLIC_REF_HOMEWORK)).toEqual([PUBLIC_REF_HOMEWORK]); // nothing kept for the unknown page; this read has no "public now" filter
    const back = await call("DELETE", votePath(PUBLIC_REF_HOMEWORK));
    expect([back.statusCode, jsonOf(back)]).toEqual([404, NOT_FOUND]);
    expect(await ownOf(PUBLIC_REF_HOMEWORK)).toEqual([]);
    hidden.clear();
    expect(rowOf(PUBLIC_REF_HOMEWORK)?.vote_count).toBe(1248);
    await call("PUT", votePath(PUBLIC_REF));
    hidden.add(PUBLIC_REF);
    expect(rowOf(PUBLIC_REF)).toBeUndefined();
    hidden.clear();
    expect(rowOf(PUBLIC_REF)?.vote_count).toBe(8);
  });
  it("a PUT body other than nothing or {} is 400 before the page is looked at, and keeps nothing", async () => {
    for (const res of [await call("PUT", votePath(PUBLIC_REF), { body: { voted: true } }), await call("PUT", votePath(PUBLIC_REF), { body: [] }),
      await call("PUT", votePath(PUBLIC_REF), { raw: "null" }), await call("PUT", votePath(PUBLIC_REF), { raw: "{" }),
      await call("PUT", votePath(UNKNOWN), { body: { voted: true } })]) expect([res.statusCode, jsonOf(res)]).toEqual([400, MALFORMED]);
    expect(rowOf(PUBLIC_REF)?.vote_count).toBe(7);
  });
  it("the own-votes read takes ONE refs member of 1 to 100 uuids and names the voted ones once, sorted", async () => {
    const hundred = Array.from({ length: 100 }, (_, at) => `00000000-0000-4000-8000-${String(at).padStart(12, "0")}`);
    for (const refs of [[], [""], [PUBLIC_REF, PUBLIC_REF_BIKES], [`${PUBLIC_REF},not-an-id`], [`${PUBLIC_REF},`], [[...hundred, PUBLIC_REF].join(",")]]) {
      const res = await call("GET", OWN, { refs });
      expect([res.statusCode, jsonOf(res)], JSON.stringify(refs).slice(0, 60)).toEqual([400, MALFORMED]);
    }
    expect((await call("GET", OWN, { refs: [hundred.join(",")] })).statusCode).toBe(200);
    await call("PUT", votePath(PUBLIC_REF));
    const answer = await call("GET", OWN, { refs: [`${PUBLIC_REF_HOMEWORK.toUpperCase()},${PUBLIC_REF_HOMEWORK},${PUBLIC_REF},${UNKNOWN}`] });
    expect(answer.headers["cache-control"]).toBe("no-store");
    expect(OwnPublicVotesSchema.parse(jsonOf(answer))).toEqual({ voted: [PUBLIC_REF, PUBLIC_REF_HOMEWORK] });
  });
  it("answers nothing but its three routes", async () => {
    const res = new FakeResponse();
    for (const [method, path] of [["POST", votePath(PUBLIC_REF)], ["GET", votePath(PUBLIC_REF)], ["GET", `/v1/public/debates/${PUBLIC_REF}`],
      ["PUT", `${votePath(PUBLIC_REF)}/more`], ["PUT", OWN], ["GET", `${OWN}/more`], ["GET", "/v1/public/debates"]] as const) {
      expect(await votes.routePublicVotes(fakeRequest(method, null), res as unknown as ServerResponse, path, method, { isPublic, refs: [] }), `${method} ${path}`).toBe(false);
    }
    expect(res.headersSent).toBe(false);
  });
});

describe("V4 mock API: the votes through the website's contract client", () => {
  /** What the website's contract client does, answered in-process by the mock's list and vote routes (check.ts sends the same through the /api proxy). */
  const viaRoutes = (async (input: unknown, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET" && url.pathname === "/v1/public/debates") {
      return Response.json(votes.publicList(PAGES, isPublic, Number(url.searchParams.get("limit")), Number(url.searchParams.get("offset"))));
    }
    const res = new FakeResponse();
    const text = typeof init.body === "string" ? init.body : null;
    if (!await votes.routePublicVotes(fakeRequest(method, text), res as unknown as ServerResponse, url.pathname, method, { isPublic, refs: url.searchParams.getAll("refs") })) {
      return new Response(JSON.stringify({ error: "NOT_MOCKED" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    return new Response(res.statusCode === 204 ? null : res.text, { status: res.statusCode, headers: res.headers });
  }) as typeof fetch;

  it("the list, the own-votes read, a cast and a withdrawal pass through the client with no mismatch", async () => {
    const client = createContractClient("http://127.0.0.1:3011", viaRoutes, { mode: "cookie" });
    const list = await client.readPublicDebates(50, 0);
    expect(await client.readOwnPublicVotes(list.items.map((row) => row.public_ref))).toEqual({ voted: [PUBLIC_REF_HOMEWORK] });
    expect(await client.castPublicVote(PUBLIC_REF)).toEqual({ voted: true, vote_count: 8 });
    expect(await client.withdrawPublicVote(PUBLIC_REF)).toEqual({ voted: false, vote_count: 7 });
    await expect(client.castPublicVote(UNKNOWN)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404, serverCode: "DEBATE_NOT_FOUND" });
  });
});

describe("V4 mock API: server.ts, check.ts and the README serve and name the votes", () => {
  const server = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
  const check = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/check.ts"), "utf8");
  const readme = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/README.md"), "utf8");
  const between = (from: string, to: string): string => server.slice(server.indexOf(from), server.indexOf(to, server.indexOf(from)));

  it("server.ts serves the real list, hands the vote routes over with a stranger refused first, checks the bodies at its start", () => {
    for (const line of ['from "./public-votes.js";', "setPublicVotesLogging(!QUIET);",
      "const isPublicNow = (publicRef: string): boolean => publicDebates.has(publicRef) && mockReview.get(publicRef)?.hidden !== true;",
      "publicList([...publicDebates.values()].map(mockReviewed), isPublicNow, limit, offset), C.PublicDebateListSchema)",
      'if (path === "/v1/account/public-debate-votes" && isGet) {',
      'if (await routePublicVotes(req, res, path, "GET", { isPublic: isPublicNow, refs: url.searchParams.getAll("refs") })) return;']) expect(server).toContain(line);
    expect(server).not.toContain("{ items: [], total: 0 }");
    const routed = server.indexOf("if (await routePublicVotes(req, res, path, method, { isPublic: isPublicNow, refs: [] })) return;");
    const guard = server.lastIndexOf('parts[4] === "vote"', routed);
    expect(Math.min(routed, guard)).toBeGreaterThan(-1);
    expect(server.slice(guard, routed)).toContain('if (sessionOut) return sendJson(req, res, 401, { error: "SESSION_REQUIRED" });');
    const startup = between("function startupCheck(", "const CHECKED = startupCheck();");
    for (const line of ["publicVoteSamples([...publicDebates.values()])", 'check("GET /v1/public/debates", C.PublicDebateListSchema, votes.list);',
      'check("PUT /v1/public/debates/{id}/vote", C.PublicVoteAnswerSchema, votes.cast);', 'check("DELETE /v1/public/debates/{id}/vote", C.PublicVoteAnswerSchema, votes.withdrawn);',
      'check("GET /v1/account/public-debate-votes", C.OwnPublicVotesSchema, votes.own);']) expect(startup).toContain(line);
    expect(between("function mockState(", "function positiveInt(")).toContain("public_votes: publicVoteCounters(),");
  });
  it("check.ts plays the votes through the website's own client, and the README says what is served", () => {
    for (const used of ["client.readPublicDebates(50, 0)", "client.castPublicVote(", "client.withdrawPublicVote(", "client.readOwnPublicVotes("]) expect(check).toContain(used);
    expect([...check.matchAll(/await step\("Upvotes: /gu)]).toHaveLength(1);
    expect(check.indexOf('await step("Upvotes: ')).toBeGreaterThan(check.indexOf('await step("Report: not found'));
    for (const named of ["`public-votes.ts`", "tests/unit/v4-mock-public-votes.test.ts", "`GET /v1/public/debates?limit=&offset=`",
      "`PUT`/`DELETE /v1/public/debates/:id/vote`", "`GET /v1/account/public-debate-votes?refs=`", "/?tab=public", "`public_votes`"]) expect(readme, named).toContain(named);
    expect(readme).not.toContain("the list of public debates, deleting");
    expect(readme).not.toContain("`/v1/public/ai-providers`, `/v1/public/debates`,");
  });
});
