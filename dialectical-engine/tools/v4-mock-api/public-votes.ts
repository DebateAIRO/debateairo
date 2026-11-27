/*
 * Upvotes on public debates (design 2026-11-26 §4, §7.2): THE LIST OF PUBLIC DEBATES WITH ITS COUNTS, and the three vote routes, for the
 * mock's one person, so the home page's Public debates tab can be looked at without a database. Plain words:
 *  - GET /v1/public/debates: one row per seeded page that is public now (server.ts says which: not hidden under review), newest first,
 *    each with `vote_count`: other people's made-up upvotes (MOCK_OTHER_VOTES) plus one when the mock's person upvotes it.
 *  - PUT /v1/public/debates/{id}/vote casts the person's vote, DELETE takes it back; both are safe to repeat and answer
 *    { voted, vote_count }. An unknown or hidden page is the one 404 DEBATE_NOT_FOUND; a vote can always be taken back, also from a
 *    hidden page, which keeps the votes it has. A PUT body other than nothing or {} is 400, before the page is looked at.
 *  - GET /v1/account/public-debate-votes?refs=: which of the asked pages the person upvotes, by the API's own rule for `refs`
 *    (apps/api/src/public-vote.ts).
 *  - Votes live in memory until the mock stops; the person starts with one (MOCK_OWN_VOTES). The mock keeps no flood brake and checks no
 *    CSRF pair; a stranger's 401 is server.ts's.
 * Every body is the contract's (packages/contract) and is checked before it is sent; server.ts checks publicVoteSamples at its start.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  OwnPublicVotesSchema, PublicDebateSchema, PublicVoteAnswerSchema, PublicVoteRequestSchema, type OwnPublicVotes, type PublicDebateList,
  type PublicVoteAnswer
} from "../../packages/contract/src/index.js";
import { ownVoteRefsOf } from "../../apps/api/src/public-vote.js";
import { PUBLIC_REF, PUBLIC_REF_AUTHOR_GONE, PUBLIC_REF_BIKES, PUBLIC_REF_FOUR_DAY, PUBLIC_REF_HOMEWORK } from "./public-seed.js";

/** Other people's upvotes on each seeded page, chosen for the look: the boxes read 7, 0, 999 (one press makes 1k), 1.2k and 12.3k. */
export const MOCK_OTHER_VOTES: Readonly<Record<string, number>> = Object.freeze({
  [PUBLIC_REF]: 7, [PUBLIC_REF_AUTHOR_GONE]: 0, [PUBLIC_REF_BIKES]: 999, [PUBLIC_REF_HOMEWORK]: 1248, [PUBLIC_REF_FOUR_DAY]: 12345
});
/** What the mock's person upvotes when the mock starts: the homework page, so one box starts upvoted. */
export const MOCK_OWN_VOTES: readonly string[] = Object.freeze([PUBLIC_REF_HOMEWORK]);

const VOTES_PREFIX = "/v1/public/debates/";
const OWN_VOTES = "/v1/account/public-debate-votes";

/** The refs the mock's person upvotes now, and the calls so far (the mock's life). */
const voted = new Set<string>(MOCK_OWN_VOTES);
const counters = { casts: 0, withdrawals: 0, reads: 0 };

const countOf = (publicRef: string): number => (MOCK_OTHER_VOTES[publicRef] ?? 0) + (voted.has(publicRef) ? 1 : 0);

/**
 * The list of public debates: every page `isPublic` says yes to, newest first (then by reference), `total` before paging. Each row is the
 * page's own summary and its count. A page that fails PublicDebateSchema throws: the seed is broken, and the mock says so.
 */
export function publicList(debates: readonly unknown[], isPublic: (publicRef: string) => boolean, limit: number, offset: number): PublicDebateList {
  const kept = debates.map((debate) => PublicDebateSchema.parse(debate)).filter((page) => isPublic(page.public_ref))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at) || a.public_ref.localeCompare(b.public_ref));
  const items = kept.slice(offset, offset + limit).map((page) => ({
    public_ref: page.public_ref, author_pseudonym: page.author_pseudonym, question: page.question, published_at: page.published_at,
    verdict: page.answer.verdict, confidence_band: page.answer.confidence_band, vote_count: countOf(page.public_ref)
  }));
  return { items, total: kept.length };
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------------

type Schema = { safeParse(value: unknown): { success: boolean } };
type Context = Readonly<{ isPublic: (publicRef: string) => boolean; refs: readonly string[] }>;

/**
 * Whether each request is logged. server.ts turns it on unless the mock is started quiet (only server.ts and check.ts read the
 * environment, the source law's two named local readers, tools/orphan-audit); a test that imports this module alone logs nothing.
 */
let logging = false;

export function setPublicVotesLogging(on: boolean): void {
  logging = on;
}

function logRequest(method: string, path: string, status: number): void {
  if (!logging) return;
  process.stderr.write(`[mock] ${method} ${path} ${String(status)}\n`);
}

/** Answers JSON, `cache-control: no-store` always, as the API's vote routes do. A 200 body that fails its schema becomes a 500. */
function send(res: ServerResponse, method: string, path: string, status: number, body: unknown, schema?: Schema): void {
  let finalStatus = status;
  let finalBody = body;
  if (schema !== undefined && !schema.safeParse(body).success) {
    process.stderr.write(`[mock] RESPONSE FAILED ITS SCHEMA for ${method} ${path}\n`);
    finalStatus = 500;
    finalBody = { error: "MOCK_RESPONSE_INVALID", message: "The mock built a body that fails the contract schema; see the mock's log." };
  }
  const text = JSON.stringify(finalBody);
  res.writeHead(finalStatus, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(text)) });
  res.end(text);
  logRequest(method, path, finalStatus);
}

const notFound = (res: ServerResponse, method: string, path: string): void => send(res, method, path, 404, { error: "DEBATE_NOT_FOUND" });
const malformed = (res: ServerResponse, method: string, path: string): void =>
  send(res, method, path, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });

/** The body's text, whole (`data` is listened for before `end`, as a socket hands it over). */
function readText(req: IncomingMessage): Promise<string> {
  return new Promise((resolveText, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolveText(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** A cast's body: nothing at all, or exactly {}. */
async function castBodyFits(req: IncomingMessage): Promise<boolean> {
  const text = await readText(req);
  if (text.trim() === "") return true;
  try {
    return PublicVoteRequestSchema.safeParse(JSON.parse(text)).success;
  } catch {
    return false;
  }
}

/** The page reference of `/v1/public/debates/<one segment>/vote`, else null. */
function voteRefOf(path: string): string | null {
  if (!path.startsWith(VOTES_PREFIX) || !path.endsWith("/vote")) return null;
  const segment = path.slice(VOTES_PREFIX.length, -"/vote".length);
  return segment === "" || segment.includes("/") ? null : segment;
}

/**
 * The three vote routes, for the mock's person; `context.isPublic` is server.ts's "public now". True when the route was one of them
 * (answered, or refused); false for anything else, which server.ts answers, and nothing is written. Signed out is server.ts's (401).
 */
export async function routePublicVotes(req: IncomingMessage, res: ServerResponse, path: string, method: string, context: Context): Promise<boolean> {
  const rawRef = voteRefOf(path);
  if (rawRef !== null && method === "PUT") {
    counters.casts += 1;
    if (!await castBodyFits(req)) {
      malformed(res, method, path);
      return true;
    }
    const ref = rawRef.toLowerCase();
    if (!context.isPublic(ref)) {
      notFound(res, method, path);
      return true;
    }
    voted.add(ref);
    send(res, method, path, 200, { voted: true, vote_count: countOf(ref) }, PublicVoteAnswerSchema);
    return true;
  }
  if (rawRef !== null && method === "DELETE") {
    counters.withdrawals += 1;
    const ref = rawRef.toLowerCase();
    // A vote can always be taken back, also from a page that is not public now.
    voted.delete(ref);
    if (!context.isPublic(ref)) {
      notFound(res, method, path);
      return true;
    }
    send(res, method, path, 200, { voted: false, vote_count: countOf(ref) }, PublicVoteAnswerSchema);
    return true;
  }
  if (path === OWN_VOTES && method === "GET") {
    counters.reads += 1;
    const asked = context.refs.length === 1 ? ownVoteRefsOf(context.refs[0]) : null;
    if (asked === null) {
      malformed(res, method, path);
      return true;
    }
    send(res, method, path, 200, { voted: asked.filter((ref) => voted.has(ref)).sort() }, OwnPublicVotesSchema);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// The startup check (server.ts) and /__mock/state
// ---------------------------------------------------------------------------------------------------------------

/** The list as the mock serves it at its start, and the vote routes' answers on the first page, built aside (nothing kept, nothing counted). */
export function publicVoteSamples(debates: readonly unknown[]): Readonly<{ list: PublicDebateList; cast: PublicVoteAnswer; withdrawn: PublicVoteAnswer; own: OwnPublicVotes }> {
  const list = publicList(debates, () => true, 50, 0);
  const first = PublicDebateSchema.parse(debates[0]).public_ref;
  const others = MOCK_OTHER_VOTES[first] ?? 0;
  return Object.freeze({ list, cast: { voted: true, vote_count: others + 1 }, withdrawn: { voted: false, vote_count: others }, own: { voted: [...MOCK_OWN_VOTES] } });
}

/** The vote calls so far (casts, withdrawals, own-vote reads) and how many pages the mock's person upvotes now. */
export function publicVoteCounters(): Readonly<{ casts: number; withdrawals: number; reads: number; voted: number }> {
  return Object.freeze({ ...counters, voted: voted.size });
}
