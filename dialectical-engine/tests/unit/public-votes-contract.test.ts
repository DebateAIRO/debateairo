import { describe, expect, it } from "vitest";
import {
  OwnPublicVotesSchema, PublicDebateListSchema, PublicDebateSummarySchema, PublicVoteAnswerSchema, PublicVoteRequestSchema,
  contractInventory, type OwnPublicVotes, type PublicDebateList, type PublicVoteAnswer
} from "../../packages/contract/src/index.js";
import { createContractClient } from "../../packages/contract/src/client.js";

/**
 * Upvotes on public debates (spec 2026-11-26 §7.3): the count on the list's row, the three strict vote shapes, and the
 * three client methods' requests and refusals. The route list is the API task's, not this file's.
 */
const REF_A = "11111111-1111-4111-8111-111111111111";
const REF_B = "22222222-2222-4222-8222-222222222222";
const refAt = (at: number): string => `00000000-0000-4000-8000-${String(at).padStart(12, "0")}`;
const ROW = {
  public_ref: REF_A, author_pseudonym: "Calm Otter", question: "Is the sea rising?",
  published_at: "2026-11-26T10:00:00.000Z", verdict: null, confidence_band: null
};
type Seen = { method: string; path: string; search: string; body: unknown; csrf: string | null; contentType: string | null };

function clientAnswering(answer: (method: string, path: string) => Response) {
  const seen: Seen[] = [];
  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    seen.push({
      method, path: url.pathname, search: url.search,
      body: init?.body === undefined || init.body === null ? undefined : JSON.parse(String(init.body)),
      csrf: headers.get("x-csrf-token"), contentType: headers.get("content-type")
    });
    return answer(method, url.pathname);
  }) as typeof fetch;
  return { seen, client: createContractClient("https://contract.example", fetchMock, { mode: "cookie", csrfToken: () => "csrf-1" }) };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("upvotes on public debates: the contract", () => {
  it("the list's row carries an optional count: a whole number from zero, last, and still nothing about a person", () => {
    expect(Object.keys(PublicDebateSummarySchema.shape).at(-1)).toBe("vote_count");
    expect("vote_count" in PublicDebateSummarySchema.parse(ROW)).toBe(false);
    expect(PublicDebateSummarySchema.parse({ ...ROW, vote_count: 0 }).vote_count).toBe(0);
    expect(PublicDebateSummarySchema.parse({ ...ROW, vote_count: 1200 }).vote_count).toBe(1200);
    for (const bad of [-1, 1.5, "3", null]) {
      expect(PublicDebateSummarySchema.safeParse({ ...ROW, vote_count: bad }).success, JSON.stringify(bad)).toBe(false);
    }
    for (const extra of [{ voted: true }, { voters: [REF_B] }, { upvotes: 3 }]) {
      expect(PublicDebateSummarySchema.safeParse({ ...ROW, vote_count: 3, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    const list = PublicDebateListSchema.parse({ items: [{ ...ROW, vote_count: 7 }, ROW], total: 2 });
    expect(list.items.map((item) => item.vote_count)).toEqual([7, undefined]);
  });

  it("the press's request is empty and its answer is exactly {voted, vote_count}", () => {
    expect(PublicVoteRequestSchema.parse({})).toEqual({});
    expect(PublicVoteRequestSchema.safeParse({ anything: 1 }).success).toBe(false);
    expect(PublicVoteAnswerSchema.parse({ voted: true, vote_count: 0 })).toEqual({ voted: true, vote_count: 0 });
    expect(PublicVoteAnswerSchema.parse({ voted: false, vote_count: 1200 })).toEqual({ voted: false, vote_count: 1200 });
    for (const bad of [{ voted: true }, { vote_count: 1 }, { voted: "yes", vote_count: 1 }, { voted: true, vote_count: -1 },
      { voted: true, vote_count: 1.5 }, { voted: true, vote_count: "1" }, { voted: true, vote_count: null },
      { voted: true, vote_count: 1, voter: REF_B }]) {
      expect(PublicVoteAnswerSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("the own-votes answer is exactly {voted: at most 100 uuids}", () => {
    expect(OwnPublicVotesSchema.parse({ voted: [] })).toEqual({ voted: [] });
    expect(OwnPublicVotesSchema.parse({ voted: [REF_A, REF_B] })).toEqual({ voted: [REF_A, REF_B] });
    expect(OwnPublicVotesSchema.safeParse({ voted: Array.from({ length: 100 }, (_, at) => refAt(at)) }).success).toBe(true);
    expect(OwnPublicVotesSchema.safeParse({ voted: Array.from({ length: 101 }, (_, at) => refAt(at)) }).success).toBe(false);
    for (const bad of [{}, { voted: null }, { voted: ["not-a-uuid"] }, { voted: [REF_A], total: 1 }, { voted: [{ public_ref: REF_A }] }]) {
      expect(OwnPublicVotesSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("lists the three shapes among the contract's resources", () => {
    const resources = contractInventory.resources as unknown as Record<string, unknown>;
    expect(Object.keys(resources)).toEqual(expect.arrayContaining(["PublicVoteRequestSchema", "PublicVoteAnswerSchema", "OwnPublicVotesSchema"]));
    expect(resources.PublicVoteRequestSchema).toBe(PublicVoteRequestSchema);
    expect(resources.PublicVoteAnswerSchema).toBe(PublicVoteAnswerSchema);
    expect(resources.OwnPublicVotesSchema).toBe(OwnPublicVotesSchema);
  });

  it("sends each client method to its route: PUT with {}, DELETE with no body, and one refs member on the read", async () => {
    const { seen, client } = clientAnswering((method, path) => json(200,
      path === "/v1/account/public-debate-votes" ? { voted: [REF_B] } : { voted: method === "PUT", vote_count: method === "PUT" ? 4 : 3 }));
    const cast: PublicVoteAnswer = await client.castPublicVote(REF_A);
    const withdrawn: PublicVoteAnswer = await client.withdrawPublicVote(REF_A);
    const own: OwnPublicVotes = await client.readOwnPublicVotes([REF_A, REF_B]);
    expect(cast).toEqual({ voted: true, vote_count: 4 });
    expect(withdrawn).toEqual({ voted: false, vote_count: 3 });
    expect(own).toEqual({ voted: [REF_B] });
    expect(seen).toEqual([
      { method: "PUT", path: `/v1/public/debates/${REF_A}/vote`, search: "", body: {}, csrf: "csrf-1", contentType: "application/json" },
      { method: "DELETE", path: `/v1/public/debates/${REF_A}/vote`, search: "", body: undefined, csrf: "csrf-1", contentType: null },
      { method: "GET", path: "/v1/account/public-debate-votes", search: `?refs=${REF_A}%2C${REF_B}`, body: undefined, csrf: null, contentType: null }
    ]);
    await client.castPublicVote("a/b?c");
    await client.withdrawPublicVote("a/b?c");
    expect(seen.slice(3).map(({ path, search }) => path + search)).toEqual(
      ["/v1/public/debates/a%2Fb%3Fc/vote", "/v1/public/debates/a%2Fb%3Fc/vote"]);
  });

  it("refuses an answer outside the contract instead of handing it on", async () => {
    const { client } = clientAnswering((_method, path) => json(200,
      path === "/v1/account/public-debate-votes" ? { voted: [REF_B], owner: REF_A } : { voted: true, vote_count: 4, voter: REF_B }));
    await expect(client.castPublicVote(REF_A)).rejects.toMatchObject({ name: "ContractHttpError", code: "INVALID_RESPONSE" });
    await expect(client.withdrawPublicVote(REF_A)).rejects.toMatchObject({ name: "ContractHttpError", code: "INVALID_RESPONSE" });
    await expect(client.readOwnPublicVotes([REF_A])).rejects.toMatchObject({ name: "ContractHttpError", code: "INVALID_RESPONSE" });
  });

  it("throws each refusal with its code: 404, 401, 403, 400, and 429 with the wait", async () => {
    const refusing = (status: number, error: string, headers: Record<string, string> = {}) =>
      clientAnswering(() => json(status, { error }, headers)).client;
    await expect(refusing(404, "DEBATE_NOT_FOUND").castPublicVote(REF_A)).rejects.toMatchObject(
      { name: "ContractHttpError", code: "NOT_FOUND", status: 404, serverCode: "DEBATE_NOT_FOUND" });
    await expect(refusing(404, "DEBATE_NOT_FOUND").withdrawPublicVote(REF_A)).rejects.toMatchObject(
      { code: "NOT_FOUND", status: 404, serverCode: "DEBATE_NOT_FOUND" });
    await expect(refusing(401, "SESSION_REQUIRED").castPublicVote(REF_A)).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    await expect(refusing(401, "SESSION_REQUIRED").readOwnPublicVotes([REF_A])).rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    await expect(refusing(403, "CSRF_VALIDATION_FAILED").withdrawPublicVote(REF_A)).rejects.toMatchObject(
      { code: "FORBIDDEN", status: 403, serverCode: "CSRF_VALIDATION_FAILED" });
    await expect(refusing(400, "MALFORMED_REQUEST").readOwnPublicVotes([])).rejects.toMatchObject({ code: "MALFORMED_REQUEST", status: 400 });
    for (const call of [
      (client: ReturnType<typeof refusing>) => client.castPublicVote(REF_A),
      (client: ReturnType<typeof refusing>) => client.withdrawPublicVote(REF_A),
      (client: ReturnType<typeof refusing>) => client.readOwnPublicVotes([REF_A])
    ]) {
      await expect(call(refusing(429, "RATE_LIMITED", { "retry-after": "7" }))).rejects.toMatchObject(
        { code: "RATE_LIMITED", status: 429, retryAfterMs: 7000 });
    }
  });

  it("readPublicDebates is typed by the list's own schema and hands the count through", async () => {
    const { seen, client } = clientAnswering(() => json(200, { items: [{ ...ROW, vote_count: 12 }, ROW], total: 2 }));
    const list: PublicDebateList = await client.readPublicDebates(50, 0);
    expect(seen).toEqual([{ method: "GET", path: "/v1/public/debates", search: "?limit=50&offset=0", body: undefined, csrf: null, contentType: null }]);
    expect(list.items[0]?.vote_count).toBe(12);
    expect(list.items[1]).not.toHaveProperty("vote_count");
    expect(list.total).toBe(2);
  });
});
