import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi, type AskApplication } from "@debateai/api";
import { contractInventory, createContractClient } from "@debateai/contract";
import { ADMISSION_POLICY_REGISTER_ROW, admissionPolicyFromValue } from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { ownVoteRefsOf, type PublicVotePorts } from "../../apps/api/src/public-vote.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";

/**
 * Upvotes on public debates (design 2026-11-26, sections 5 and 7.2): PUT and DELETE /v1/public/debates/{id}/vote and
 * GET /v1/account/public-debate-votes. One vote per account per debate; the account is the session's; every absence is
 * the one 404 DEBATE_NOT_FOUND; the three routes share the publicVotes budget, charged before the id is looked at. The
 * store here is a fake that keeps the database's rules (0193); the PostgreSQL behaviour is
 * tests/integration/public-debate-upvotes-0193.test.ts.
 */
const VOTER = testHttpIdentity("public-vote-voter");
const OTHER = testHttpIdentity("public-vote-other");
const VOTER_REF = VOTER.authenticated.ownerRef;
const OTHER_REF = OTHER.authenticated.ownerRef;
const PUBLIC = "11111111-1111-4111-8111-111111111111";
const SECOND = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOT_PUBLIC = "33333333-3333-4333-8333-333333333333";
const GUESSED = "44444444-4444-4444-8444-444444444444";
const NOT_FOUND = { error: "DEBATE_NOT_FOUND" };
const MALFORMED = { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" };
const REFUSED = { error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" };
const T0 = new Date("2026-11-26T00:00:00.000Z");
const OWN = "/v1/account/public-debate-votes";
type Call = readonly [string, ...unknown[]];

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

/** A store with PUBLIC and SECOND public and empty, and NOT_PUBLIC holding VOTER's vote; records every call. */
function fakeRepository(calls: Call[], inactive: ReadonlySet<string> = new Set()): PublicVotePorts["repository"] {
  const votes = new Map<string, Set<string>>([[PUBLIC, new Set()], [SECOND, new Set()], [NOT_PUBLIC, new Set([VOTER_REF])]]);
  const isPublic = (ref: string) => ref === PUBLIC || ref === SECOND;
  return {
    cast: async (ownerRef, ref) => {
      calls.push(["cast", ownerRef, ref]);
      if (inactive.has(ownerRef)) return { outcome: "ACCOUNT_INVALID", upvotes: null };
      const voters = votes.get(ref);
      if (!isPublic(ref) || voters === undefined) return { outcome: "NOT_PUBLIC", upvotes: null };
      const already = voters.has(ownerRef);
      voters.add(ownerRef);
      return { outcome: already ? "ALREADY" : "CAST", upvotes: voters.size };
    },
    withdraw: async (ownerRef, ref) => {
      calls.push(["withdraw", ownerRef, ref]);
      const voters = votes.get(ref);
      const removed = voters?.delete(ownerRef) ?? false;
      return { outcome: removed ? "WITHDRAWN" : "NONE", upvotes: isPublic(ref) && voters !== undefined ? voters.size : null };
    },
    readOwn: async (ownerRef, refs) => {
      calls.push(["readOwn", ownerRef, [...refs]]);
      return refs.filter((ref) => votes.get(ref)?.has(ownerRef) === true);
    }
  };
}

function server(repository: PublicVotePorts["repository"] | undefined, limiter?: AdmissionLimiter) {
  return buildApi({
    application: application(), sessions: testSessionApplication([VOTER, OTHER]), allowedOrigin: TEST_APP_ORIGIN,
    ...(repository === undefined ? {} : { publicVotes: { repository } }),
    ...(limiter === undefined ? {} : { admission: limiter, admissionClock: () => T0 })
  });
}
const put = (ref: string, who: TestHttpIdentity = VOTER, payload?: object) => ({ method: "PUT" as const,
  url: `/v1/public/debates/${ref}/vote`, headers: testSessionHeaders(who, true), ...(payload === undefined ? {} : { payload }) });
const del = (ref: string, who: TestHttpIdentity = VOTER) => ({ method: "DELETE" as const,
  url: `/v1/public/debates/${ref}/vote`, headers: testSessionHeaders(who, true) });
const own = (refs: string, who: TestHttpIdentity = VOTER) => ({ method: "GET" as const, url: `${OWN}?refs=${refs}`, headers: testSessionHeaders(who) });

describe("public debate upvote routes", () => {
  it("PUT casts once and DELETE takes it back once; a repeat changes nothing; the account is the session's", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const calls: Call[] = [];
    const api = server(fakeRepository(calls));
    try {
      const first = await api.inject(put(PUBLIC));
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ voted: true, vote_count: 1 });
      expect(first.headers["cache-control"]).toBe("no-store");
      expect((await api.inject(put(PUBLIC, VOTER, {}))).json()).toEqual({ voted: true, vote_count: 1 });
      expect((await api.inject(put(PUBLIC, OTHER))).json()).toEqual({ voted: true, vote_count: 2 });
      const back = await api.inject(del(PUBLIC));
      expect(back.statusCode).toBe(200);
      expect(back.json()).toEqual({ voted: false, vote_count: 1 });
      expect(back.headers["cache-control"]).toBe("no-store");
      expect((await api.inject(del(PUBLIC))).json()).toEqual({ voted: false, vote_count: 1 });
      expect(calls).toEqual([["cast", VOTER_REF, PUBLIC], ["cast", VOTER_REF, PUBLIC], ["cast", OTHER_REF, PUBLIC],
        ["withdraw", VOTER_REF, PUBLIC], ["withdraw", VOTER_REF, PUBLIC]]);
      // A vote writes no log line that names the voter or the debate (no list of who voted, anywhere).
      const journal = [...errors.mock.calls, ...logs.mock.calls].flat().map(String).join("\n");
      for (const secret of [VOTER_REF, OTHER_REF, PUBLIC]) expect(journal, secret).not.toContain(secret);
    } finally {
      errors.mockRestore();
      logs.mockRestore();
      await api.close();
    }
  });

  it("every absence is the same 404: guessed, not public, malformed id, an account that is not active, no store", async () => {
    const calls: Call[] = [];
    const api = server(fakeRepository(calls, new Set([OTHER_REF])));
    try {
      for (const request of [put(GUESSED), put(NOT_PUBLIC), put("not-an-id"), put(PUBLIC, OTHER), del(GUESSED), del("not-an-id"), del(NOT_PUBLIC)]) {
        const answer = await api.inject(request);
        expect(answer.statusCode, `${request.method} ${request.url}`).toBe(404);
        expect(answer.json()).toEqual(NOT_FOUND);
        expect(answer.headers["cache-control"]).toBe("no-store");
      }
      expect(calls.some(([, , ref]) => ref === "not-an-id")).toBe(false);
      expect(calls.at(-1)).toEqual(["withdraw", VOTER_REF, NOT_PUBLIC]); // taking a vote back reaches the store whatever the debate's state
    } finally {
      await api.close();
    }
    const bare = server(undefined);
    try {
      for (const request of [put(PUBLIC), del(PUBLIC)]) {
        const answer = await bare.inject(request);
        expect(answer.statusCode, request.method).toBe(404);
        expect(answer.json()).toEqual(NOT_FOUND);
      }
    } finally {
      await bare.close();
    }
  });

  it("a PUT body other than nothing or {} is 400 before the store is asked", async () => {
    const calls: Call[] = [];
    const api = server(fakeRepository(calls));
    try {
      for (const request of [
        put(PUBLIC, VOTER, { voted: true }),
        put(PUBLIC, VOTER, { owner_ref: OTHER_REF }),
        put(PUBLIC, VOTER, [] as unknown as object),
        { ...put(PUBLIC), payload: "null", headers: { ...testSessionHeaders(VOTER, true), "content-type": "application/json" } }
      ]) {
        const answer = await api.inject(request);
        expect(answer.statusCode, JSON.stringify(request.payload)).toBe(400);
        expect(answer.json()).toEqual(MALFORMED);
      }
      expect(calls).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("needs the session; both writes need the Origin and the CSRF pair", async () => {
    const calls: Call[] = [];
    const api = server(fakeRepository(calls));
    try {
      for (const request of [
        { method: "PUT" as const, url: `/v1/public/debates/${PUBLIC}/vote` },
        { method: "DELETE" as const, url: `/v1/public/debates/${PUBLIC}/vote` },
        { method: "GET" as const, url: `${OWN}?refs=${PUBLIC}` }
      ]) {
        const answer = await api.inject(request);
        expect(answer.statusCode, request.method).toBe(401);
        expect(answer.json()).toEqual({ error: "SESSION_REQUIRED" });
      }
      for (const method of ["PUT", "DELETE"] as const) {
        const url = `/v1/public/debates/${PUBLIC}/vote`;
        const noCsrf = await api.inject({ method, url, headers: testSessionHeaders(VOTER) });
        expect(noCsrf.statusCode, method).toBe(403);
        expect(noCsrf.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
        const foreignOrigin = await api.inject({ method, url, headers: testSessionHeaders(VOTER, true, "https://elsewhere.example") });
        expect(foreignOrigin.statusCode, method).toBe(403);
      }
      expect(calls).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("one budget for the three routes, per account, charged before the id is looked at", async () => {
    const policy = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
    const limiter = new AdmissionLimiter(policy);
    const decide = vi.spyOn(limiter, "decide");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const calls: Call[] = [];
    const api = server(fakeRepository(calls), limiter);
    try {
      const kinds = [() => put("not-an-id"), () => del(GUESSED), () => own(PUBLIC)];
      for (let press = 0; press < policy.publicVotes.limit; press += 1) {
        expect((await api.inject(kinds[press % 3]!())).statusCode, `press ${press + 1}`).not.toBe(429);
      }
      for (const request of [put(PUBLIC), del(PUBLIC), own(PUBLIC)]) {
        const refused = await api.inject(request);
        expect(refused.statusCode, request.method).toBe(429);
        expect(refused.json()).toEqual(REFUSED);
        expect(refused.headers["retry-after"]).toBe(String(policy.publicVotes.windowMs / 1_000));
      }
      expect(calls.filter(([name]) => name === "cast")).toEqual([]);
      expect((await api.inject(put(PUBLIC, OTHER))).statusCode).toBe(200);
      expect(new Set(decide.mock.calls.map(([scope]) => scope))).toEqual(new Set(["publicVotes"]));
      expect(decide.mock.calls).toHaveLength(policy.publicVotes.limit + 4);
      expect(new Set(decide.mock.calls.map(([, key]) => key))).toEqual(new Set([VOTER_REF, OTHER_REF]));
    } finally {
      log.mockRestore();
      await api.close();
    }
  });

  it("GET names the caller's own votes among the asked debates, each asked once", async () => {
    const calls: Call[] = [];
    const api = server(fakeRepository(calls));
    try {
      expect((await api.inject(put(PUBLIC))).statusCode).toBe(200);
      expect((await api.inject(put(SECOND, OTHER))).statusCode).toBe(200);
      const answer = await api.inject(own(`${PUBLIC},${SECOND},${SECOND.toUpperCase()},${GUESSED}`));
      expect(answer.statusCode).toBe(200);
      expect(answer.json()).toEqual({ voted: [PUBLIC] });
      expect(answer.headers["cache-control"]).toBe("no-store");
      expect(calls.at(-1)).toEqual(["readOwn", VOTER_REF, [PUBLIC, SECOND, GUESSED]]);
      expect((await api.inject(own(`${PUBLIC},${SECOND}`, OTHER))).json()).toEqual({ voted: [SECOND] });
    } finally {
      await api.close();
    }
  });

  it("GET refuses refs that are missing, repeated, empty, over 100 or not uuids, and answers an empty list with no store", async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    const calls: Call[] = [];
    const api = server(fakeRepository(calls));
    try {
      for (const url of [OWN, `${OWN}?refs=`, `${OWN}?refs=${PUBLIC}&refs=${SECOND}`, `${OWN}?refs=${PUBLIC},not-an-id`,
        `${OWN}?refs=${PUBLIC},`, `${OWN}?refs=${[...hundred, PUBLIC].join(",")}`]) {
        const answer = await api.inject({ method: "GET", url, headers: testSessionHeaders(VOTER) });
        expect(answer.statusCode, url).toBe(400);
        expect(answer.json()).toEqual(MALFORMED);
      }
      expect(calls).toEqual([]);
      expect((await api.inject(own(hundred.join(",")))).statusCode).toBe(200);
    } finally {
      await api.close();
    }
    const bare = server(undefined);
    try {
      const empty = await bare.inject(own(PUBLIC));
      expect(empty.statusCode).toBe(200);
      expect(empty.json()).toEqual({ voted: [] });
      expect((await bare.inject(own("not-an-id"))).statusCode).toBe(400);
    } finally {
      await bare.close();
    }
  });

  it("ownVoteRefsOf takes one string of 1 to 100 uuids and nothing else", () => {
    expect(ownVoteRefsOf(`${SECOND.toUpperCase()},${SECOND},${PUBLIC}`)).toEqual([SECOND, PUBLIC]);
    expect(Object.isFrozen(ownVoteRefsOf(PUBLIC))).toBe(true);
    for (const raw of [undefined, "", [PUBLIC], `${PUBLIC},`, ` ${PUBLIC}`, "not-an-id", 7]) expect(ownVoteRefsOf(raw), String(raw)).toBeNull();
  });

  it("the three rows follow the flag row in both lists, and the list row is unchanged", () => {
    const ROWS = [
      { route: "PUT /v1/public/debates/{id}/vote", auth: "user", resource: "public-debate", action: "vote" },
      { route: "DELETE /v1/public/debates/{id}/vote", auth: "user", resource: "public-debate", action: "withdraw-vote" },
      { route: "GET /v1/account/public-debate-votes", auth: "user", resource: "public-debate", action: "read-own-votes" }
    ];
    const governed = authorizationPolicyInventory.map((policy) => policy.route as string);
    const flag = governed.indexOf("POST /v1/public/debates/{id}/flag");
    expect(authorizationPolicyInventory.slice(flag + 1, flag + 4)).toEqual(ROWS);
    const routes = contractInventory.routes as readonly string[];
    const listed = routes.indexOf("POST /v1/public/debates/{id}/flag");
    expect(routes.slice(listed + 1, listed + 4)).toEqual(ROWS.map((row) => row.route));
    expect(authorizationPolicyInventory).toContainEqual({ route: "GET /v1/public/debates", auth: "public", resource: "public-debate", action: "list" });
  });

  it("main.ts builds the store once on the request pool and hands it over only when publication is served", async () => {
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main.match(/new PostgresPublicDebateUpvoteRepository\(/g)).toHaveLength(1);
    expect(main).toContain("const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);");
    expect(main).toContain("...(publications === undefined ? {} : { publicVotes: { repository: publicDebateUpvoteRepository } }),");
  });

  it("the published OpenAPI names the three operations and their shapes", async () => {
    const document = JSON.parse(await readFile("packages/contract/generated/openapi.json", "utf8")) as {
      paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> } | undefined> | undefined>;
    };
    const answer = (path: string, method: string) => document.paths[path]?.[method]?.responses?.["200"]?.content?.["application/json"]?.schema;
    expect(answer("/v1/public/debates/{id}/vote", "put")).toEqual({ $ref: "#/components/schemas/PublicVoteAnswerSchema" });
    expect(answer("/v1/public/debates/{id}/vote", "delete")).toEqual({ $ref: "#/components/schemas/PublicVoteAnswerSchema" });
    expect(answer("/v1/account/public-debate-votes", "get")).toEqual({ $ref: "#/components/schemas/OwnPublicVotesSchema" });
  });

  it("the website's own client reaches the three routes as it really sends them", async () => {
    const calls: Call[] = [];
    const api = server(fakeRepository(calls));
    const transport = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = (init?.method ?? "GET") as "GET";
      const result = await api.inject({ method, url: url.pathname + url.search,
        headers: { ...testSessionHeaders(VOTER, method !== "GET"), ...Object.fromEntries(new Headers(init?.headers).entries()) },
        ...(init?.body === undefined || init.body === null ? {} : { payload: String(init.body) }) });
      return new Response(result.body, { status: result.statusCode, headers: result.headers as Record<string, string> });
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", transport, { mode: "cookie", csrfToken: () => VOTER.rawCsrfToken });
    expect(await client.castPublicVote(PUBLIC)).toEqual({ voted: true, vote_count: 1 });
    expect(await client.readOwnPublicVotes([PUBLIC, SECOND, GUESSED])).toEqual({ voted: [PUBLIC] });
    expect(calls.at(-1)).toEqual(["readOwn", VOTER_REF, [PUBLIC, SECOND, GUESSED]]);
    expect(await client.withdrawPublicVote(PUBLIC)).toEqual({ voted: false, vote_count: 0 });
    await expect(client.castPublicVote(NOT_PUBLIC)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404, serverCode: "DEBATE_NOT_FOUND" });
    await api.close();
  });
});
