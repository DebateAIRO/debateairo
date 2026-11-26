### Task T13: The mock API serves counts and the three vote routes

The local mock API (`tools/v4-mock-api`, never deployed) answers the public list with real rows and an upvote count on
each, and the three vote routes, so the home page's Public debates tab can be looked at without a database (design
§4, §7.2). It touches no API, contract, page or database file. It is what T17's required look in a browser runs
against, which is why it is in scope and why it carries a self-check.

Depends on: **T03** and **T07**. May run alongside T08, T12 and T16 (no shared file). If another task shares your
working tree, run your typecheck, `generate:contract` and commit steps while no other task is in the middle of an
edit, and read every `git status` and typecheck expectation below as "nothing else of yours".

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

**Files:**
- Create: `tools/v4-mock-api/public-votes.ts`
- Create: `tests/unit/v4-mock-public-votes.test.ts`
- Modify: `tools/v4-mock-api/public-seed.ts:1-11` (header comment; three refs after line 11), `:115-122` (three pages after line 121)
- Modify: `tools/v4-mock-api/server.ts:55`, `:157`, `:554`, `:1209`, `:1749`, `:1936`, `:1944`, `:1965` (eight places, Step 7)
- Modify: `tools/v4-mock-api/check.ts:822` (one step and one signed-out block after it), and its header comment `:1-30`
- Modify: `tools/v4-mock-api/README.md:37`, `:40`, `:284`, `:371-372`, `:385`, `:394`, `:400`
- Test: `tests/unit/v4-mock-public-votes.test.ts`; unedited `tests/unit/v4-mock-api.test.ts`; the running mock's `check.ts`

**Interfaces:**
- Consumes, from T03 (`packages/contract/src`): `PublicVoteRequestSchema` (`{}` strict), `PublicVoteAnswerSchema`
  (`{ voted, vote_count }` strict), `OwnPublicVotesSchema` (`{ voted: uuid[] }`, at most 100, strict), `vote_count` optional
  on `PublicDebateSummarySchema`, and the client methods `castPublicVote(ref)`, `withdrawPublicVote(ref)`,
  `readOwnPublicVotes(refs)`, `readPublicDebates(limit, offset)`.
- Consumes, from T07: `ownVoteRefsOf(raw: unknown): readonly string[] | null` in `apps/api/src/public-vote.ts` (one
  string of 1 to 100 comma-separated uuids, lower-cased, each once; else null), and the answers the mock copies:
  `PUT`/`DELETE /v1/public/debates/{id}/vote` → 200 `{ voted, vote_count }`, 404 `{ error: "DEBATE_NOT_FOUND" }`,
  400 `{ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" }`, 401 `{ error: "SESSION_REQUIRED" }`;
  `GET /v1/account/public-debate-votes?refs=` → 200 `{ voted }`, 400, 401.
- Produces (no build task imports it; T12's eye check and the owner use the running mock):

```ts
// tools/v4-mock-api/public-seed.ts
export const PUBLIC_REF_BIKES = "f4000000-0000-4000-8000-000000000001";
export const PUBLIC_REF_HOMEWORK = "f4000000-0000-4000-8000-000000000002";
export const PUBLIC_REF_FOUR_DAY = "f4000000-0000-4000-8000-000000000003";
// seedPublicDebates() returns five pages: today's two, unchanged and first, then these three.

// tools/v4-mock-api/public-votes.ts
export const MOCK_OTHER_VOTES: Readonly<Record<string, number>>; // other people's upvotes per seeded ref
export const MOCK_OWN_VOTES: readonly string[];                   // what the mock's person upvotes when the mock starts
export function publicList(debates: readonly unknown[], isPublic: (publicRef: string) => boolean, limit: number, offset: number): PublicDebateList;
export function routePublicVotes(req: IncomingMessage, res: ServerResponse, path: string, method: string,
  context: Readonly<{ isPublic: (publicRef: string) => boolean; refs: readonly string[] }>): Promise<boolean>;
export function publicVoteSamples(debates: readonly unknown[]): Readonly<{ list: PublicDebateList; cast: PublicVoteAnswer; withdrawn: PublicVoteAnswer; own: OwnPublicVotes }>;
export function publicVoteCounters(): Readonly<{ casts: number; withdrawals: number; reads: number; voted: number }>;
export function setPublicVotesLogging(on: boolean): void;
```

  The click-test: with the mock and the website running (README §1, §2), open `/api/__mock/sign-in` once, then
  `/?tab=public`. Five rows, newest first; the box reads `12.3k`, `1.2k` (already upvoted), `999` (one press makes
  it `1k`), `0`, `7`.

**Before you start:**

Read these as templates.
- `tools/v4-mock-api/saved-questions.ts:217-259` (the `Schema` type, the logging switch, `send`: `no-store`, and a body
  that fails its schema becomes a 500), `:262-285` (the body reader), `:336-367` (a router that returns true when it
  answered), `:374-379` (samples for the startup check, built aside).
- `tools/v4-mock-api/server.ts:1932-1936` (hand a route over after the stranger's 401), `:2074-2079` (paging).
- `tests/unit/v4-mock-saved-questions.test.ts:40-81` (`fakeRequest`, `FakeResponse`), `:293-303` (the contract client
  over the routes), `:332-357` (`server.ts` read as source).
- `tools/v4-mock-api/check.ts:802-822` (a step with `must` and a `finally`), `:153-165` (the `session=OUT` block).

Traps.
- **`server.ts` listens when it is imported.** No test imports it; its wiring is read as source text
  (`tests/unit/v4-mock-saved-questions.test.ts:16-17`). The stranger's 401 is pinned as source and proved live by `check.ts`.
- **The source audit reads `tools/`** (`tools/orphan-audit/src/index.ts:852-888`). In `public-votes.ts`, comments
  included: never the words `process.env` (`:864-867`; only `server.ts` and `check.ts` may, `:850`), no `switch (`
  (`:884-886`), no `export const UPPER_NAME = <number>` (`:816-823`), no import path holding `test` or `fixture` (`:831-841`).
- **Seeded pages are strict and pinned.** Each passes `PublicDebateSchema` at the mock's start (`server.ts:1210`).
  `tests/unit/v4-mock-api.test.ts:745` pins the first page's last key as `reading_level`, and seven test files read
  pages by position 0 and 1. Add pages only after the second; put no count on any page.
- **Never write `vote_count: undefined`** on a row.
- **The mock loads the contract from `packages/contract/generated/`** (`server.ts:66`, `:97`; `check.ts:54`). With a
  stale folder `C.PublicVoteAnswerSchema` is `undefined` and the mock dies at its start. Regenerate first (Step 1).
- **The test's stand-in request sends its body when `end` is listened for.** The body reader attaches `data` before
  `end`, as `saved-questions.ts:266-283` does. `DELETE` never reads a body.
- **No new `/__mock/set` switch.** A new `url.searchParams.get("…")` inside the set handler must be named in three
  more places (`tests/unit/v4-mock-api.test.ts:762-780`). The `refs`, `limit` and `offset` reads are outside it.
- **The port.** When this plan was written the mock's default port 4011 was taken on this machine by another mock,
  so every mock command below uses `MOCK_PORT=4013` and `MOCK_URL=http://127.0.0.1:4013`. Step 1 checks that 4013
  is free on the day; if it is not, pick a free port and use it in every mock command.
- **`check.ts` was already red by one step on the untouched tree when this plan was written**: `FAIL  Report: not
  found, with a person, hidden (the page answers 410), and the queue holds them` (the mock's own
  `GET /v1/admin/public-reports` answers 500: `server.ts:1973`, `:1983`; `check.ts:815`). Its `finally` still puts
  the page back. That line is not yours; do not fix it here. That run printed 109 `PASS` lines and ended
  `1 CHECK(S) FAILED`. Step 1 takes the baseline again on the day, before any edit; Step 11 is judged against
  Step 1's figures, not against these.
- The pull request's limits check reads added lines. Do not add the mark `limits-check-ok` beforehand.

- [ ] **Step 1: Check that T03 and T07 have landed, regenerate, take the baseline**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "export const PublicVoteRequestSchema\|export const PublicVoteAnswerSchema\|export const OwnPublicVotesSchema" packages/contract/src/web.ts; grep -c "castPublicVote\|withdrawPublicVote\|readOwnPublicVotes" packages/contract/src/client.ts; grep -c "export function ownVoteRefsOf" apps/api/src/public-vote.ts; grep -c "^import type .*@debateai/db" apps/api/src/public-vote.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/v4-mock-api.test.ts
```

Then the mock's own baseline, before any edit of this task. First the port (expect no output; a line means the port
is taken, see Traps):

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools lsof -nP -iTCP:4013 -sTCP:LISTEN
```

Start the untouched mock in the background (your harness's background run, or a second terminal), wait for its
`{"mock":"ready",…` line, run the self-check into a file outside the tree, read it, stop the mock:

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools MOCK_PORT=4013 MOCK_QUIET=1 node_modules/.bin/tsx tools/v4-mock-api/server.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine/apps/ui && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'MOCK_URL=http://127.0.0.1:4013 ../../node_modules/.bin/tsx ../../tools/v4-mock-api/check.ts > "${TMPDIR:-/tmp}/v4-mock-check-baseline.log" 2>&1; grep -c "^PASS" "${TMPDIR:-/tmp}/v4-mock-check-baseline.log"; grep "^FAIL" "${TMPDIR:-/tmp}/v4-mock-check-baseline.log"; tail -1 "${TMPDIR:-/tmp}/v4-mock-check-baseline.log"'
kill $(lsof -nP -tiTCP:4013 -sTCP:LISTEN)
```

Write down the `PASS` count and every `FAIL` line: they are the baseline (when this plan was written: 109, and the
one `Report:` line). A baseline with other `FAIL` lines is not yours to repair: record them and go on.

Expected of the first three commands: `3`, at least `6`, `1`, `1`; the generator exits 0; `Tests  60 passed (60)`. If one of the first three
counts is 0, stop and report which task is missing. The fourth says the API module takes only a type from the
database package, so the mock loads no database code; if it is 0, open the file: every import from `@debateai/db`
there must be `import type`, or stop and report.

- [ ] **Step 2: Write `tests/unit/v4-mock-public-votes.test.ts`**

Imports: `EventEmitter`, `readFileSync`, the two `node:http` types, `resolve`; `beforeEach, describe, expect, it, vi`;
`OwnPublicVotesSchema, PublicDebateListSchema, PublicDebateSchema, PublicVoteAnswerSchema` from
`../../packages/contract/src/index.js`; `createContractClient` from `../../packages/contract/src/client.js`; the five
refs and `seedPublicDebates` from `../../tools/v4-mock-api/public-seed.js`. `fakeRequest` and `FakeResponse` are the
template's lines 40-81, unchanged. Fixtures and helpers:

```ts
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
```

`describe("V4 mock API: upvotes on public debates (public-votes.ts)", …)`, seven cases:

```ts
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
```

`describe("V4 mock API: the votes through the website's contract client", …)`, one case. `viaRoutes` is the
template's (`:293-303`) with two changes: a GET of `/v1/public/debates` is answered by
`Response.json(votes.publicList(PAGES, isPublic, Number(url.searchParams.get("limit")), Number(url.searchParams.get("offset"))))`,
and the route call is `votes.routePublicVotes(…, url.pathname, method, { isPublic, refs: url.searchParams.getAll("refs") })`.

```ts
it("the list, the own-votes read, a cast and a withdrawal pass through the client with no mismatch", async () => {
  const client = createContractClient("http://127.0.0.1:3011", viaRoutes, { mode: "cookie" });
  const list = await client.readPublicDebates(50, 0);
  expect(await client.readOwnPublicVotes(list.items.map((row) => row.public_ref))).toEqual({ voted: [PUBLIC_REF_HOMEWORK] });
  expect(await client.castPublicVote(PUBLIC_REF)).toEqual({ voted: true, vote_count: 8 });
  expect(await client.withdrawPublicVote(PUBLIC_REF)).toEqual({ voted: false, vote_count: 7 });
  await expect(client.castPublicVote(UNKNOWN)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404, serverCode: "DEBATE_NOT_FOUND" });
});
```

`describe("V4 mock API: server.ts, check.ts and the README serve and name the votes", …)`, two cases. `server`, `check`
and `readme` are the three files, read with `readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/<name>"), "utf8")`;
`between` is the template's (`:334`).

```ts
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
```

- [ ] **Step 3: Run it and see it fail**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/v4-mock-public-votes.test.ts
```

Red: `Test Files  1 failed (1)`, no case passes. The failure names `tools/v4-mock-api/public-votes` (the module does not exist).

- [ ] **Step 4: Seed three more public pages in `public-seed.ts`**

- After line 11: the three `export const` refs under **Interfaces**, character for character.
- After line 121 (the end of the second page), three pages in this order, built by one small local helper from the
  second page's shape (`:115-121`): the keys `public_ref`, `author_pseudonym`, `question`, `published_at`,
  `language: "en"`, `answer`, `story_short`. No `author_name_gone`, no `reading_level`, no count. `answer` is
  `{ ...answer, as_of: <published_at> }` with `summary_segments` and `reversal_point` saying this page's own summary
  and change; `story_short` has its own headline, summary, one path and change. Made-up plain English.

  | Ref | `author_pseudonym` | `question` | `published_at` |
  |---|---|---|---|
  | `PUBLIC_REF_BIKES` | `Brisk Wren` | `Should cities build more bike lanes?` | `2026-10-24T08:00:00.000Z` |
  | `PUBLIC_REF_HOMEWORK` | `Mild Badger` | `Should schools stop giving homework?` | `2026-10-26T08:00:00.000Z` |
  | `PUBLIC_REF_FOUR_DAY` | `Keen Plover` | `Should offices move to a four-day week?` | `2026-10-28T08:00:00.000Z` |

- The header comment (`:1-8`) gains one sentence: three plain pages more, so the list of public debates has five rows.

- [ ] **Step 5: Create `tools/v4-mock-api/public-votes.ts`**

Imports: the two `node:http` types; from `../../packages/contract/src/index.js` the three vote schemas,
`PublicDebateSchema` and the three types of **Interfaces**; `ownVoteRefsOf` from `../../apps/api/src/public-vote.js`
(the API's own rule, as `quaderno-tax.ts:1` takes the API's own tax reader); the five refs from `./public-seed.js`.
A header comment in the folder's style says what the file is, and that it keeps no flood brake and checks no CSRF pair.

Values:
- `MOCK_OTHER_VOTES`, frozen: `PUBLIC_REF` 7, `PUBLIC_REF_AUTHOR_GONE` 0, `PUBLIC_REF_BIKES` 999,
  `PUBLIC_REF_HOMEWORK` 1248, `PUBLIC_REF_FOUR_DAY` 12345. `MOCK_OWN_VOTES`, frozen: `[PUBLIC_REF_HOMEWORK]`.
- State: one `Set<string>` of the refs the mock's person upvotes, starting as `MOCK_OWN_VOTES`; counters `casts`,
  `withdrawals`, `reads` at 0. A page's count is `(MOCK_OTHER_VOTES[ref] ?? 0) + (the set has it ? 1 : 0)`.

Rules the signatures do not say:
- `publicList`: parses each page with `PublicDebateSchema` (a page that fails throws); keeps the pages `isPublic`
  says yes to; orders by `published_at` newest first, then `public_ref`; `total` is the number kept before paging;
  each row is exactly `public_ref`, `author_pseudonym`, `question`, `published_at`, `verdict` and `confidence_band`
  (from the page's `answer`), `vote_count`.
- `routePublicVotes`: the first match answers; every answer goes through the copied `send` (`no-store`, and the
  schema guard on each 200).
  1. `PUT /v1/public/debates/<one segment>/vote`: count a cast. Read the body: empty text is `{}`; text that is not
     JSON, or JSON that fails `PublicVoteRequestSchema`, is 400 `MALFORMED_REQUEST` (with `message`). Lower-case the
     ref. `!isPublic(ref)` is 404 `{ error: "DEBATE_NOT_FOUND" }`. Else add the ref; 200 `{ voted: true, vote_count }`.
  2. `DELETE` on the same path: count a withdrawal; never read the body. Lower-case the ref and remove it from the
     set first (a vote can always be taken back). `!isPublic(ref)` is 404. Else 200 `{ voted: false, vote_count }`.
  3. `GET /v1/account/public-debate-votes`: count a read. `context.refs.length !== 1`, or `ownVoteRefsOf(context.refs[0])`
     null, is 400. Else 200 `{ voted }`: the asked refs the set holds, sorted. No "public now" filter.
  4. Anything else: return false and write nothing.
- `publicVoteSamples`: `list` is `publicList(debates, () => true, 50, 0)`; `cast` and `withdrawn` are the first
  seeded page's answers (`{ voted: true, vote_count: 8 }`, `{ voted: false, vote_count: 7 }`); `own` is
  `{ voted: [...MOCK_OWN_VOTES] }`. It changes neither the set nor the counters.
- `publicVoteCounters`: the three counters and `voted`, the set's size; frozen.
- Logging as `saved-questions.ts:224-233`: off until `setPublicVotesLogging(true)`.

- [ ] **Step 6: Run the test: the module's cases pass, the wiring cases still fail**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/v4-mock-public-votes.test.ts
```

Expected: `Tests  2 failed | 8 passed (10)`. The two failures are the cases of the last `describe`.

- [ ] **Step 7: Wire `server.ts`**

Line numbers are the untouched file's: work from the bottom up, or find each anchor by its text. The test pins these
lines, so write them as given.

1. Directly before line 1965 (the `// Decision 35: Report.` comment):
   ```ts
     // Upvotes (public-votes.ts): the mock person's own vote on a public debate, and taking it back. A stranger has none (401), as the API's session check says first.
     if (parts[1] === "public" && parts[2] === "debates" && parts.length === 5 && parts[4] === "vote" && (method === "PUT" || method === "DELETE")) {
       if (sessionOut) return sendJson(req, res, 401, { error: "SESSION_REQUIRED" });
       if (await routePublicVotes(req, res, path, method, { isPublic: isPublicNow, refs: [] })) return;
     }
   ```
2. Replace line 1944 (the empty list):
   ```ts
     // Upvotes (public-votes.ts): the list of public debates, one row per seeded page that is public now, each with its count.
     if (path === "/v1/public/debates" && isGet) {
       const limit = positiveInt(url.searchParams.get("limit"), 50);
       const offset = positiveInt(url.searchParams.get("offset"), 0);
       if (limit === null || limit < 1 || limit > 100 || offset === null) return sendJson(req, res, 400, { error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
       return sendJson(req, res, 200, publicList([...publicDebates.values()].map(mockReviewed), isPublicNow, limit, offset), C.PublicDebateListSchema);
     }
   ```
3. Directly after line 1936 (the `}` that closes the saved-questions block). A stranger's 401 for it is already the
   account guard's at 1902-1904:
   ```ts
     // Upvotes (public-votes.ts): which of the asked public debates the mock's person upvotes. A stranger's 401 is the account guard's, above.
     if (path === "/v1/account/public-debate-votes" && isGet) {
       if (await routePublicVotes(req, res, path, "GET", { isPublic: isPublicNow, refs: url.searchParams.getAll("refs") })) return;
     }
   ```
4. In `mockState()`, directly after line 1749 (`savedQuestions: …`), under a one-line comment: `public_votes: publicVoteCounters(),`
5. Replace line 1209 (`check("GET /v1/public/debates", …, { items: [], total: 0 });`):
   ```ts
     // Upvotes (public-votes.ts): the list as the mock serves it at its start, and the vote routes' answers, built aside.
     const votes = publicVoteSamples([...publicDebates.values()]);
     check("GET /v1/public/debates", C.PublicDebateListSchema, votes.list);
     check("PUT /v1/public/debates/{id}/vote", C.PublicVoteAnswerSchema, votes.cast);
     check("DELETE /v1/public/debates/{id}/vote", C.PublicVoteAnswerSchema, votes.withdrawn);
     check("GET /v1/account/public-debate-votes", C.OwnPublicVotesSchema, votes.own);
   ```
6. Directly after line 554 (`const publicLevelOf = …`):
   ```ts
   /** Upvotes (public-votes.ts): public right now, as the list and the vote routes mean it: a seeded page that is not hidden under review. */
   const isPublicNow = (publicRef: string): boolean => publicDebates.has(publicRef) && mockReview.get(publicRef)?.hidden !== true;
   ```
7. Directly after line 157: `setPublicVotesLogging(!QUIET);`
8. Directly after line 55, one import from `"./public-votes.js"`: `publicList, publicVoteCounters, publicVoteSamples, routePublicVotes, setPublicVotesLogging`.

- [ ] **Step 8: Add the vote step to `check.ts`**

Directly after line 822 (the end of the `Report:` step, which has put the first page back). One
`await step("Upvotes: …", async () => { … }, (value: string) => value);` on `PUBLIC.authorGone` (no earlier step
hides it), then one signed-out block. Inside the step, in this order, each a `must(...)`:

1. `client.readPublicDebates(50, 0)`: every item's `vote_count` is a whole number; rows for `PUBLIC.debate` and
   `PUBLIC.authorGone` are there. `before` is the second one's count; `total` is the list's.
2. `client.readOwnPublicVotes([PUBLIC.authorGone])` names nothing.
3. `client.castPublicVote(PUBLIC.authorGone)` is `{ voted: true, vote_count: before + 1 }`; a second cast is the same.
4. The own-votes read names it; the list's row says `before + 1`.
5. `await mock(`/__mock/review?ref=${PUBLIC.authorGone}&step=HIDE`)`, then in `try`: the list has no row for it and
   its total is `total - 1`; a cast is refused with `code === "NOT_FOUND"`. In `finally`: the same address with `step=REPUBLISH`.
6. The list's row says `before + 1` again (a hidden debate keeps its votes).
7. `client.withdrawPublicVote(PUBLIC.authorGone)` is `{ voted: false, vote_count: before }`; a second one is the same.
8. A cast on `"f1000000-0000-4000-8000-00000000ffff"` is refused with `code === "NOT_FOUND"`.

Then, in the form of lines 154-165 (`session=OUT`, `try`, `finally` back to `session=IN`), three
`expectCode(…, "SESSION_REQUIRED")` lines: a cast, a withdrawal, and `client.readOwnPublicVotes([PUBLIC.authorGone])`.
The header comment (`:1-30`) gains one sentence that says so.

- [ ] **Step 9: Say it in the README**

`tools/v4-mock-api/README.md`:
- Files table, after line 37: a row for `` `public-votes.ts` ``. Line 40: one more sentence naming
  `tests/unit/v4-mock-public-votes.test.ts`.
- Line 284: take `` `/v1/public/debates` `` out of the "Simple valid replies" row. Directly above it, three rows whose
  first cells are exactly `` `GET /v1/public/debates?limit=&offset=` ``, `` `PUT`/`DELETE /v1/public/debates/:id/vote` ``
  and `` `GET /v1/account/public-debate-votes?refs=` ``. They say: one row per seeded page that is public now, newest
  first, each with `vote_count`; 200 `{voted, vote_count}`, safe to repeat, 404 `DEBATE_NOT_FOUND` for an unknown or
  hidden page, 400 for a PUT body other than nothing or `{}`; `{voted: [...]}` for 1 to 100 comma-separated
  references, 400 otherwise; both 401 with `session=OUT`.
- "Public debates": after line 372, three page rows (the three new refs, each a plain page with one path). After line
  385, one bullet **Upvotes**: open `http://127.0.0.1:3011/api/__mock/sign-in` once, then
  `http://127.0.0.1:3011/?tab=public`; the five counts and what the box shows for each; the second row starts
  upvoted; one press takes the third from `999` to `1k`; votes live in memory until the mock stops; a hidden page
  keeps its votes; the mock has no flood brake and checks no CSRF pair; `/__mock/state` shows `` `public_votes` ``.
- Line 394 ("Not mocked"): remove "the list of public debates, ". Line 400 ("Self-check"): one sentence for the new step.

- [ ] **Step 10: Run the test and see it pass**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/v4-mock-public-votes.test.ts
```

Expected: `Tests  10 passed (10)`.

- [ ] **Step 11: Run the mock and its self-check**

The port first: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools lsof -nP -iTCP:4013 -sTCP:LISTEN` prints nothing (Step 1's mock is stopped).

Start the mock in the background (your harness's background run, or a second terminal):

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools MOCK_PORT=4013 MOCK_QUIET=1 node_modules/.bin/tsx tools/v4-mock-api/server.ts
```

It prints one line that starts `{"mock":"ready","url":"http://127.0.0.1:4013"`. Then (the self-check must start in
`apps/ui`, `check.ts:39-47`; it takes about two minutes):

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools curl -s "http://127.0.0.1:4013/v1/public/debates?limit=2&offset=0"
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine/apps/ui && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools MOCK_URL=http://127.0.0.1:4013 ../../node_modules/.bin/tsx ../../tools/v4-mock-api/check.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools curl -s "http://127.0.0.1:4013/__mock/state" | grep -o '"public_votes":{[^}]*}'
kill $(lsof -nP -tiTCP:4013 -sTCP:LISTEN)
```

Expected: the first answer says `"total":5` and holds two items, `"vote_count":12345` then `"vote_count":1249`. The
self-check prints `PASS  Upvotes: …` and three `PASS  … SESSION_REQUIRED (as the website expects)` lines for the
stranger: Step 1's `PASS` count plus four (113 against the 109 of the day this was written). Its `FAIL` lines are
Step 1's, by name, and no other (the known `Report:` one, so it ends `1 CHECK(S) FAILED`; or `ALL CHECKS PASSED`
if that step has been repaired since). A `FAIL` line that Step 1 did not have is this task's. With Step 8's order
the state line is `"public_votes":{"casts":4,"withdrawals":2,"reads":2,"voted":1}`.

- [ ] **Step 12: Verify the whole task**

Each line is `cd …/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools <command>`.

| Command | Expected |
|---|---|
| `pnpm run typecheck` | exit 0 (it reads `tools/**/*.ts` and `tests/**/*.ts`) |
| `pnpm exec vitest run tests/unit/v4-mock-public-votes.test.ts` | `Tests  10 passed (10)` |
| `pnpm exec vitest run tests/unit/v4-mock-api.test.ts` | `Tests  60 passed (60)`, file unedited (the first page still ends with `reading_level`; every switch still named) |
| `pnpm exec vitest run tests/unit/v4-mock-saved-questions.test.ts` | `Tests  12 passed (12)`, file unedited |
| `pnpm exec vitest run tests/unit/public-lane.test.ts` | no failed case, file unedited (pages read by position) |
| `pnpm exec vitest run tests/render/v4-public-lane.test.tsx` | no failed case, file unedited |
| `pnpm exec vitest run tests/architecture/scaffold.test.ts` | `Tests  1 failed \| 28 passed (29)`: only the known red "dev's F31 debt…". A line naming `tools/v4-mock-api/public-votes.ts` is this task's (the source-audit trap). |
| Step 11 | as written there |
| `git status --short` | the six paths of Step 13 and nothing else of yours; no `apps/ui/.next-v4mock`, no change to `apps/ui/next-env.d.ts` or `apps/ui/tsconfig.json` |

No look in a browser belongs to this task: T10, T11 and T12 may not have landed. T17 (build and look) starts
this mock (the commands of Step 11) and the website against it, and compares the five boxes with design §4. The
seeded counts are chosen for that look: the boxes read 12.3k, 1.2k (already upvoted), 999 (one press makes 1k), 0, 7.

- [ ] **Step 13: Stage, run the limits check, commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add tools/v4-mock-api/public-votes.ts tools/v4-mock-api/public-seed.ts tools/v4-mock-api/server.ts tools/v4-mock-api/check.ts tools/v4-mock-api/README.md tests/unit/v4-mock-public-votes.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The mock API serves the list of public debates with upvote counts and the three vote routes, so the page can be looked at without a database." -m "tools/v4-mock-api: five seeded public pages, other people's counts beside the seed, one page the mock's person already upvotes. PUT and DELETE /v1/public/debates/{id}/vote and GET /v1/account/public-debate-votes answer as the API does: one vote per press, the one 404 for an unknown or hidden page, 401 for a stranger; the refs rule is the API's own. The self-check plays them through the website's client. Tests: tests/unit/v4-mock-public-votes.test.ts." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Six `git add` paths; never `git add -A` or `git add .`. Expected from the check: `LIMITS_CHECK_OK …`, exit 0. Keep
the counts out of the commit message. The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs.
