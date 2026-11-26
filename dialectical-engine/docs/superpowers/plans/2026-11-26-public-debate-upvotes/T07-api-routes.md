### Task T07: The three vote routes, their policy rows, the contract route list, the wiring, and `vote_count` in the list

Design §7.2 and §5. This task mounts `PUT` and `DELETE /v1/public/debates/{id}/vote` and
`GET /v1/account/public-debate-votes`, declares them in every closed route list (220 becomes 223), hands the API its
vote store, and makes `publications.list()` serve `vote_count`. It is the only task that edits `apps/api/src/index.ts`.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: **T03**, **T04**, **T05**. May run alongside T11 (no shared file). **Never alongside T16**: both edit
`apps/api/src/main.ts`, and T16 waits for this task. If another task shares your working tree, run your typecheck,
`generate:contract` and commit steps while no other task is in the middle of an edit, and read every `git status`
and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `apps/api/src/public-vote.ts`
- Create: `tests/unit/public-vote-routes.test.ts`
- Modify: `apps/api/src/index.ts:36-37` (port import), `:93-94` (contract imports), `:1609-1611` (policy rows, add after
  1611), `:2119-2122` (`ApiOptions`), `:4289-4301` (the flag handler; the three handlers go directly after 4301)
- Modify: `apps/api/src/main.ts:96-99` (import), `:1242` (declaration, add after), `:2211-2213` (spread, add after 2213)
- Modify: `apps/api/src/publications.ts:501-512` (interface item type), `:1033-1071` (`list()`)
- Modify: `packages/contract/src/index.ts:2160-2162` (route list only; add after 2162)
- Modify: `packages/contract/src/generate.ts:6-16` (import), `:18-37` (`endpointSchemas`), `:45-47` (three entries)
- Modify: `tests/unit/s7-authorization.test.ts:125-126` (matrix rows, add after 126), `:416-419` (comment and count)
- Modify: `tests/unit/web-contract.test.ts:352-353`, `tests/unit/dig-model-contract.test.ts:351-352` (comment and count)
- Modify: `tests/unit/s8-publication.test.ts:250-253` and `:265-267` (harness), plus one new case
- Modify: `tests/unit/s8-publication-http.test.ts` (one new case inside the `describe` that opens at 178)
- Test: `tests/unit/public-vote-routes.test.ts`, the five edited test files above, and the unedited files named in Step 16
- Every line number above and below is the untouched tree's (`c946564be`). Tasks that land before this one move
  some of them: T03 adds lines above `packages/contract/src/index.ts:2160` (the summary key near `:1464`) and
  changes `web.ts` and `client.ts`; T04 edits `apps/api/src/admission.ts`. Find each anchor by the text quoted in
  its step, not by its number.

**Interfaces:**
- Consumes, from T03 (`@debateai/contract`): `PublicVoteRequestSchema` (`z.object({}).strict()`),
  `PublicVoteAnswerSchema` (`{ voted: boolean, vote_count: non-negative int }`, strict), `OwnPublicVotesSchema`
  (`{ voted: uuid[] (max 100) }`, strict), and `vote_count` optional on `PublicDebateSummarySchema`.
- Consumes, from T04: admission scope `"publicVotes"`, always present; default `{ limit: 60, windowMs: 60_000 }`,
  read in tests as `admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef).publicVotes`.
- Consumes, from T05 (`@debateai/db`): `class PostgresPublicDebateUpvoteRepository { constructor(pool: Pool);
  cast(ownerRef, publicationRef): Promise<Readonly<{ outcome: "CAST" | "ALREADY" | "NOT_PUBLIC" | "ACCOUNT_INVALID"; upvotes: number | null }>>;
  withdraw(ownerRef, publicationRef): Promise<Readonly<{ outcome: "WITHDRAWN" | "NONE"; upvotes: number | null }>>;
  readOwn(ownerRef, publicationRefs: readonly string[]): Promise<readonly string[]> }`, and
  `listPublicRefs(limit, offset): Promise<Readonly<{ refs; total; upvotes: Readonly<Record<string, number>> }>>`.
- Produces:
  - `apps/api/src/public-vote.ts`: `export type PublicVotePorts = Readonly<{ repository: Pick<PostgresPublicDebateUpvoteRepository, "cast" | "withdraw" | "readOwn"> }>;`
    and `export function ownVoteRefsOf(raw: unknown): readonly string[] | null`.
  - `ApiOptions.publicVotes?: PublicVotePorts` (T08 builds the API with it).
  - The three routes, always mounted, with these answers (T08, T11 and T13 rely on them):

    | Route | 200 | Other answers |
    |---|---|---|
    | `PUT /v1/public/debates/{id}/vote` | `{ voted: true, vote_count }` | 404 `{ error: "DEBATE_NOT_FOUND" }`; 400 `{ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" }`; 429 `{ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }` with `retry-after`; 401 `{ error: "SESSION_REQUIRED" }`; 403 `{ error: "CSRF_VALIDATION_FAILED" }` |
    | `DELETE /v1/public/debates/{id}/vote` | `{ voted: false, vote_count }` | 404, 429, 401, 403 as above; never 400 from the handler |
    | `GET /v1/account/public-debate-votes?refs=` | `{ voted: uuid[] }` | 400, 429, 401 as above |

  - `PublicationApplication.list()` items carry `vote_count` (a number from the real application; optional in the type).
  - `main.ts` holds `const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);` once.
    T16 edits `main.ts` after this task and must leave that count at one.
  - Decided behaviour, not gaps (the design does not rule on them; do not build around them):
    1. The vote routes do not look at the public-read restore hold (`apps/api/src/publications.ts:1046`), as the
       flag route does not. While that hold is on the list is empty, and a direct `PUT` for a debate the database
       calls public still stores a vote. "Public now" is the database's rule alone.
    2. A database refusal T05's repository does not map goes to the API's general error answer (a 500). The one
       that can happen is `42501 REQUEST_OWNER_MISMATCH`, when the session row ends between the session hook and
       the statement. The next request is the hook's own 401. No handler catches it.

**Before you start:**

Read these as templates.
- `apps/api/src/index.ts:4289-4301`: the flag handler. Copy its frame: `ownerRef` from
  `request.authenticatedSession`, the absent port answered inside the handler, `admitOrRefuse`, `no-store`, then the id.
- `apps/api/src/index.ts:4281-4288`: the signed-in per-person read (`moderation-statements`): the 401 guard and `no-store`.
- `apps/api/src/moderation-statements.ts:160-163`: a ports type that is one `Pick` of a db repository.
- `tests/unit/v4-account-memory-api.test.ts:21-41` (the `application()` fixture to copy), `:70-79` (helpers),
  `:104-116` (401 and 403 assertions); `tests/support/httpSession.ts:114-124` (`testSessionHeaders(identity, mutating, origin)`).

Traps.
- Eight lists must agree: the policy table, the three registrations, `contractInventory.routes`, the test matrix, the
  three count pins and the generated `openapi.json`. `tests/unit/s7-authorization.test.ts:376-390` compares them and
  mounts every contract route with a minimal `buildApi` (no `publicVotes`), so the routes mount unconditionally.
- `GET /v1/public/ai-providers` must stay directly after `GET /v1/public/debates/{id}` in both lists
  (`tests/unit/public-ai-providers-route.test.ts:58,61`). Add only after the flag row.
- Do not put `session: "optional"` or `"best-effort"` on any row, and do not touch the `GET /v1/public/debates` row.
  `tests/unit/s7-authorization.test.ts:462-465` pins that only the plans list has `best-effort`.
- Do not charge `"asks"` (the flag does, `index.ts:4295`) or `"publicReads"`. All three routes charge `"publicVotes"`
  with the session's `ownerRef`, with no `options.admission?.configured(...)` guard.
- Every 400 body carries `message` too: `tests/unit/api-error-envelopes.test.ts:113-114` refuses the text
  `send({ error: "MALFORMED_REQUEST" })` anywhere in `index.ts`.
- `main.ts`: leave the `publicFlags` literal (`:2201-2210`) and `publicFlagRepository` (`:1242`) untouched
  (`tests/architecture/rls-cross-account-sites.test.ts:272-283` reads them by AST), and add no `crossAccount` or
  `crossAccountPool` call (`:63` pins the count of sites). The vote store is built on `pool`, the request pool. T16
  later adds a different class (`PostgresPublicDebateUpvoteSweepRepository`) to `main.ts`; do not add it here.
- `packages/contract/src/index.ts`: touch the route list only. The schemas are T03's.
- `tsconfig.json:12-13` sets `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- An `{id}` longer than 100 characters is answered 414 by the router before any handler (`index.ts:1757`, `:1817`),
  as on every `{id}` route. Do not test it as a 404.
- The new file `apps/api/src/public-vote.ts` is not yet in `tests/support/shipped-corpus.manifest.txt`. T15 adds it.
  `tests/unit/s1-1-depth-contract.test.ts` is red by that one name until then; do not edit the manifest here.
- The pull request's limits check reads added lines and commit messages. Do not write the budget's figure in a test
  or in the commit message: read it from the parsed policy.

- [ ] **Step 1: Check that T03, T04 and T05 have landed, and take the baseline**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "export const PublicVoteRequestSchema\|export const PublicVoteAnswerSchema\|export const OwnPublicVotesSchema" packages/contract/src/web.ts; grep -c '"publicVotes"' apps/api/src/admission.ts; grep -c "public-debate-upvote.js" packages/db/src/investigation-reports.ts; grep -c "read_public_debate_upvote_counts" packages/db/src/publication.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/s7-authorization.test.ts
```

Expected: the first count is `3` and the other three are at least `1`; the generator exits 0; the test file ends
`Tests  38 passed (38)`. If a count is 0, stop and report which task is missing. Do not build its part here.

- [ ] **Step 2: Write `tests/unit/public-vote-routes.test.ts`**

Imports: `readFile` from `node:fs/promises`; `describe, expect, it, vi` from `vitest`; `authorizationPolicyInventory,
buildApi, type AskApplication` from `@debateai/api`; `contractInventory` from `@debateai/contract`;
`ADMISSION_POLICY_REGISTER_ROW, admissionPolicyFromValue` from `@debateai/register`; `AdmissionLimiter` from
`../../apps/api/src/admission.js`; `ownVoteRefsOf, type PublicVotePorts` from `../../apps/api/src/public-vote.js`;
the four helpers and `type TestHttpIdentity` from `../support/httpSession.js`. Case 12 also needs
`createContractClient` from `@debateai/contract`.

Fixtures (exact values):

```ts
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
function fakeRepository(calls: Call[], inactive: ReadonlySet<string> = new Set()): PublicVotePorts["repository"] // rules below
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
```

`fakeRepository` keeps a `Map<ref, Set<ownerRef>>` seeded with `PUBLIC` and `SECOND` empty and `NOT_PUBLIC` holding
`VOTER_REF`; only `PUBLIC` and `SECOND` are public. Each method first pushes `[name, ownerRef, ref]` (for `readOwn`:
`[name, ownerRef, [...refs]]`) to `calls`. `cast`: an owner in `inactive` gives `{ outcome: "ACCOUNT_INVALID",
upvotes: null }`; a ref that is not public gives `{ outcome: "NOT_PUBLIC", upvotes: null }`; otherwise it adds the
owner and gives `{ outcome: "CAST" (or "ALREADY" when the owner was there), upvotes: <set size> }`. `withdraw`:
removes the owner and gives `{ outcome: "WITHDRAWN" (or "NONE"), upvotes: <set size> for a public ref, else null }`.
`readOwn`: the asked refs whose set holds the owner, in the asked order.
`application()` is a copy of `tests/unit/v4-account-memory-api.test.ts:21-41`. Each case closes its server.

Cases, in one `describe("public debate upvote routes", ...)`:

1. `"PUT casts once and DELETE takes it back once; a repeat changes nothing; the account is the session's"`
   ```ts
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
   ```
   The case opens with `const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);` and
   `const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);` and restores both in `finally`.
2. `"every absence is the same 404: guessed, not public, malformed id, an account that is not active, no store"`.
   Server: `server(fakeRepository(calls, new Set([OTHER_REF])))`. For each of `put(GUESSED)`, `put(NOT_PUBLIC)`,
   `put("not-an-id")`, `put(PUBLIC, OTHER)`, `del(GUESSED)`, `del("not-an-id")`, `del(NOT_PUBLIC)`:
   `statusCode` is `404`, `json()` equals `NOT_FOUND`, `headers["cache-control"]` is `"no-store"`. Then:
   ```ts
   expect(calls.some(([, , ref]) => ref === "not-an-id")).toBe(false);
   expect(calls.at(-1)).toEqual(["withdraw", VOTER_REF, NOT_PUBLIC]); // taking a vote back reaches the store whatever the debate's state
   ```
   Then with `server(undefined)`: `put(PUBLIC)` and `del(PUBLIC)` are `404` with `NOT_FOUND`.
3. `"a PUT body other than nothing or {} is 400 before the store is asked"`. For `put(PUBLIC, VOTER, { voted: true })`,
   `put(PUBLIC, VOTER, { owner_ref: OTHER_REF })`, `put(PUBLIC, VOTER, [] as unknown as object)` and
   `{ ...put(PUBLIC), payload: "null", headers: { ...testSessionHeaders(VOTER, true), "content-type": "application/json" } }`:
   `400` and `MALFORMED`. Then `expect(calls).toEqual([])`.
4. `"needs the session; both writes need the Origin and the CSRF pair"`. Without headers,
   `PUT` and `DELETE /v1/public/debates/${PUBLIC}/vote` and `GET ${OWN}?refs=${PUBLIC}` are `401` with
   `{ error: "SESSION_REQUIRED" }`. For `PUT` and `DELETE`: with `testSessionHeaders(VOTER)` the answer is `403` with
   `{ error: "CSRF_VALIDATION_FAILED" }`; with `testSessionHeaders(VOTER, true, "https://elsewhere.example")` it is
   `403`. Then `expect(calls).toEqual([])`.
5. `"one budget for the three routes, per account, charged before the id is looked at"`
   ```ts
   const policy = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
   const limiter = new AdmissionLimiter(policy);
   const decide = vi.spyOn(limiter, "decide");
   const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
   ```
   Restore `log` and close the server in `finally`.
6. `"GET names the caller's own votes among the asked debates, each asked once"`. After `put(PUBLIC)` by VOTER and
   `put(SECOND, OTHER)`:
   ```ts
   const answer = await api.inject(own(`${PUBLIC},${SECOND},${SECOND.toUpperCase()},${GUESSED}`));
   expect(answer.statusCode).toBe(200);
   expect(answer.json()).toEqual({ voted: [PUBLIC] });
   expect(answer.headers["cache-control"]).toBe("no-store");
   expect(calls.at(-1)).toEqual(["readOwn", VOTER_REF, [PUBLIC, SECOND, GUESSED]]);
   expect((await api.inject(own(`${PUBLIC},${SECOND}`, OTHER))).json()).toEqual({ voted: [SECOND] });
   ```
7. `"GET refuses refs that are missing, repeated, empty, over 100 or not uuids, and answers an empty list with no store"`.
   `const hundred = Array.from({ length: 100 }, (_, index) => \`00000000-0000-4000-8000-${String(index).padStart(12, "0")}\`);`
   For the URLs `OWN`, `${OWN}?refs=`, `${OWN}?refs=${PUBLIC}&refs=${SECOND}`, `${OWN}?refs=${PUBLIC},not-an-id`,
   `${OWN}?refs=${PUBLIC},` and `${OWN}?refs=${[...hundred, PUBLIC].join(",")}` (headers `testSessionHeaders(VOTER)`):
   `400` and `MALFORMED`; then `expect(calls).toEqual([])`. Then `own(hundred.join(","))` is `200`. Then with
   `server(undefined)`: `own(PUBLIC)` is `200` with `{ voted: [] }` and `own("not-an-id")` is `400`.
8. `"ownVoteRefsOf takes one string of 1 to 100 uuids and nothing else"`
   ```ts
   expect(ownVoteRefsOf(`${SECOND.toUpperCase()},${SECOND},${PUBLIC}`)).toEqual([SECOND, PUBLIC]);
   expect(Object.isFrozen(ownVoteRefsOf(PUBLIC))).toBe(true);
   for (const raw of [undefined, "", [PUBLIC], `${PUBLIC},`, ` ${PUBLIC}`, "not-an-id", 7]) expect(ownVoteRefsOf(raw), String(raw)).toBeNull();
   ```
9. `"the three rows follow the flag row in both lists, and the list row is unchanged"`
   ```ts
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
   ```
10. `"main.ts builds the store once on the request pool and hands it over only when publication is served"`
    ```ts
    const main = await readFile("apps/api/src/main.ts", "utf8");
    expect(main.match(/new PostgresPublicDebateUpvoteRepository\(/g)).toHaveLength(1);
    expect(main).toContain("const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);");
    expect(main).toContain("...(publications === undefined ? {} : { publicVotes: { repository: publicDebateUpvoteRepository } }),");
    ```
11. `"the published OpenAPI names the three operations and their shapes"`. Read
    `packages/contract/generated/openapi.json`; with
    `answer = (path, method) => document.paths[path]?.[method]?.responses?.["200"]?.content?.["application/json"]?.schema`:
    `answer("/v1/public/debates/{id}/vote", "put")` and `(..., "delete")` equal
    `{ $ref: "#/components/schemas/PublicVoteAnswerSchema" }`; `answer("/v1/account/public-debate-votes", "get")`
    equals `{ $ref: "#/components/schemas/OwnPublicVotesSchema" }`.
12. `"the website's own client reaches the three routes as it really sends them"`. No other test joins the two:
    T03 tests the client against a stub, cases 1 to 7 send hand-built requests with raw commas, T13 tests the client
    against the mock. This case sends the wire form production uses (`refs=a%2Cb` in one member, `PUT` with a JSON
    `{}` body, `DELETE` with no body and no content type) through the real handlers. The transport is the one of
    `tests/unit/saved-questions-routes.test.ts:136-141`, with the query kept:
    ```ts
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
    ```

- [ ] **Step 3: Run it and see it fail**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-vote-routes.test.ts
```

Red: the file fails to load, naming `apps/api/src/public-vote.js` (it does not exist). `Test Files  1 failed (1)`.
Case 12 is written here, before Step 11's handlers, on purpose: it is the test that constrains how they read the
query and the bodies the website really sends.

- [ ] **Step 4: Move the pins: three matrix rows and 223 in three tests**

- `tests/unit/s7-authorization.test.ts`: after line 126 (the flag row of `EXPECTED_AUTHORIZATION_MATRIX`) add the
  three rows of `ROWS` (Step 2, case 9), in that order, under the comment
  `// Upvotes on public debates: the signed-in account's own vote, and its own votes among a page's debates.`
  Before line 419 add the comment line
  `// Upvotes on public debates add three (PUT and DELETE /v1/public/debates/{id}/vote, GET /v1/account/public-debate-votes): 223.`
  and change `toHaveLength(220)` to `toHaveLength(223)`.
- `tests/unit/web-contract.test.ts:353` and `tests/unit/dig-model-contract.test.ts:352`: add above each the comment
  `// Upvotes on public debates: PUT and DELETE /v1/public/debates/{id}/vote, GET /v1/account/public-debate-votes.`
  and change `220` to `223`.

- [ ] **Step 5: Run the three and see them fail**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/s7-authorization.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/web-contract.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/dig-model-contract.test.ts
```

Red: in the first, exactly two cases fail, `governs the entire canonical inventory…` (the matrix differs) and
`registers the full optional composition…` (`PUT /v1/public/debates/{id}/vote` is not mounted). In the other two, one
case each fails with `expected … to have a length of 223 but got 220`.

- [ ] **Step 6: Create `apps/api/src/public-vote.ts`**

Imports: `import { z } from "zod";` and `import type { PostgresPublicDebateUpvoteRepository } from "@debateai/db";`.
A header comment says: one vote per account per debate; the database decides "public right now" and whose row it is;
the three calls run on the request pool under the caller's session, never in a cross-account frame.

```ts
export type PublicVotePorts = Readonly<{
  repository: Pick<PostgresPublicDebateUpvoteRepository, "cast" | "withdraw" | "readOwn">;
}>;
/** The `refs` query member as Fastify hands it. Null for anything but ONE string of 1 to 100 comma-separated uuids. */
export function ownVoteRefsOf(raw: unknown): readonly string[] | null
```

`ownVoteRefsOf` rules: not a string returns null (a repeated `refs=` arrives as an array); split on `","`; the pieces
must pass `z.array(z.uuid()).min(1).max(100)` as they are (no trimming; the limit counts pieces before duplicates
go); the result is each piece lower-cased, duplicates removed, first-seen order kept, frozen.

- [ ] **Step 7: Add the three routes to the contract's route list**

`packages/contract/src/index.ts`, directly after the line `"POST /v1/public/debates/{id}/flag",` (line 2162 of the
untouched tree; lower once T03 has landed) and before `"GET /v1/geo/availability",`:

```ts
    // Upvotes on public debates: cast, take back, and the signed-in person's own votes among a page's debates.
    "PUT /v1/public/debates/{id}/vote",
    "DELETE /v1/public/debates/{id}/vote",
    "GET /v1/account/public-debate-votes",
```

- [ ] **Step 8: Document the three operations for the generator**

`packages/contract/src/generate.ts`: add `PublicVoteRequestSchema, PublicVoteAnswerSchema, OwnPublicVotesSchema` to
the import from `./index.js` (line 16) and to `endpointSchemas` (after line 36, which then needs a closing comma;
under the comment `// Upvotes on public debates: the three vote routes.`). Then, directly after line 47 (the
`"GET /v1/public/debates/{id}"` entry of `staffEndpointContracts`):

```ts
  // Upvotes on public debates: the signed-in account's own vote. A debate that is not public now, a hidden one and a guessed id all answer 404 DEBATE_NOT_FOUND.
  "PUT /v1/public/debates/{id}/vote": { requestBody: { required: false, content: { "application/json": { schema: reference("PublicVoteRequestSchema") } } }, ...response(reference("PublicVoteAnswerSchema")),
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] },
  "DELETE /v1/public/debates/{id}/vote": { ...response(reference("PublicVoteAnswerSchema")),
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] },
  "GET /v1/account/public-debate-votes": { ...response(reference("OwnPublicVotesSchema")),
    parameters: [{ name: "refs", in: "query", required: true, schema: { type: "string" }, description: "1 to 100 debate references, comma-separated" }] },
```

- [ ] **Step 9: Add the three policy rows**

`apps/api/src/index.ts`, directly after line 1611 (the flag row), before the `GET /v1/geo/availability` row:

```ts
  // Upvotes on public debates: a signed-in account's own vote; a write carries the CSRF pair like any user route.
  { route: "PUT /v1/public/debates/{id}/vote", auth: "user", resource: "public-debate", action: "vote" },
  { route: "DELETE /v1/public/debates/{id}/vote", auth: "user", resource: "public-debate", action: "withdraw-vote" },
  { route: "GET /v1/account/public-debate-votes", auth: "user", resource: "public-debate", action: "read-own-votes" },
```

- [ ] **Step 10: Imports and the option**

`apps/api/src/index.ts`:
- after line 37: `import { ownVoteRefsOf, type PublicVotePorts } from "./public-vote.js";`
- in the `@debateai/contract` import, beside `PublicFlagAnswerSchema` (lines 93-94): `PublicVoteAnswerSchema`,
  `PublicVoteRequestSchema`, `OwnPublicVotesSchema`.
- in `ApiOptions`, directly after line 2120 (`readonly publicFlags?: PublicFlagPorts;`):
  ```ts
    /** Upvotes on public debates (0193): the vote store, on the request pool under the caller's session. Absent: the two writes answer 404 and the own-votes read answers an empty list. */
    readonly publicVotes?: PublicVotePorts;
  ```

- [ ] **Step 11: The three handlers**

`apps/api/src/index.ts`, directly after line 4301 (the `});` that closes the flag handler), in this order. Each
decision below is one line of the handler, in this order; the first that applies answers.

`api.put<{ Params: { id: string } }>("/v1/public/debates/:id/vote", credentialRoutePolicy("PUT /v1/public/debates/{id}/vote"), …)`
1. `ownerRef` (`request.authenticatedSession?.ownerRef`) or `options.publicVotes` is undefined: 404 `{ error: "DEBATE_NOT_FOUND" }`.
2. `PublicVoteRequestSchema.safeParse(request.body === undefined ? {} : request.body)` fails: 400 `MALFORMED_REQUEST` (with `message`).
3. `if (!admitOrRefuse(reply, "publicVotes", "PUT /v1/public/debates/{id}/vote", ownerRef)) return reply;`
4. `reply.header("Cache-Control", "no-store");`
5. `ResourceIdSchema.safeParse(request.params.id)` fails: 404, without a store call.
6. `const result = await options.publicVotes.repository.cast(ownerRef, id)`. When `result.outcome` is `"CAST"` or
   `"ALREADY"` and `result.upvotes !== null`: `reply.send(PublicVoteAnswerSchema.parse({ voted: true, vote_count: result.upvotes }))`.
   Anything else (`NOT_PUBLIC`, `ACCOUNT_INVALID`): 404.

`api.delete<{ Params: { id: string } }>("/v1/public/debates/:id/vote", credentialRoutePolicy("DELETE /v1/public/debates/{id}/vote"), …)`
Steps 1, 3, 4, 5 as above with its own route name; `request.body` is never read. Then
`const result = await options.publicVotes.repository.withdraw(ownerRef, id)`: `result.upvotes === null` is 404;
otherwise `reply.send(PublicVoteAnswerSchema.parse({ voted: false, vote_count: result.upvotes }))`.

`api.get<{ Querystring: Record<string, unknown> }>("/v1/account/public-debate-votes", routePolicy("GET /v1/account/public-debate-votes"), …)`
1. `request.authenticatedSession` undefined: 401 `{ error: "SESSION_REQUIRED" }`.
2. `admitOrRefuse(reply, "publicVotes", "GET /v1/account/public-debate-votes", authenticated.ownerRef)`.
3. `reply.header("Cache-Control", "no-store");`
4. `const refs = ownVoteRefsOf(request.query.refs)`; null: 400 `MALFORMED_REQUEST` (with `message`).
5. `options.publicVotes` undefined: `reply.send(OwnPublicVotesSchema.parse({ voted: [] }))`.
6. `reply.send(OwnPublicVotesSchema.parse({ voted: await options.publicVotes.repository.readOwn(authenticated.ownerRef, refs) }))`.

One comment above the three: one vote per account per debate; a repeat PUT changes nothing and DELETE takes it back;
every absence is the one 404; only the count leaves the server; the account is the session's, never the request's.

- [ ] **Step 12: Wire the store in `main.ts`**

`apps/api/src/main.ts`:
- directly after the line `import { PostgresRegistrationCountryReader } from "@debateai/db";` (line 99; T16 later
  adds its own import after the same line): `import { PostgresPublicDebateUpvoteRepository } from "@debateai/db";`
- directly after the line `const publicFlagRepository = new PostgresPublicFlagRepository(pool);` (line 1242), under a one-line comment (0193: 0193's three request
  functions, on the request login under the caller's session):
  `const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);`
- directly after line 2213 (the end of the `moderationStatements` spread), before the line that starts
  `  ...(publications === undefined ? {} : { publicTree: {`:
  `  ...(publications === undefined ? {} : { publicVotes: { repository: publicDebateUpvoteRepository } }),`

That is one line after line 99 and two lines (comment and declaration) after line 1242. T16 counts on exactly that.

- [ ] **Step 13: Regenerate, typecheck, and see Steps 2 and 4 go green**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run typecheck
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-vote-routes.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/s7-authorization.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/web-contract.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/dig-model-contract.test.ts
```

Green: generator and typecheck exit 0; `Tests  12 passed (12)` for the new file; `Tests  38 passed (38)` for
`s7-authorization`; no failed case in the other two.

- [ ] **Step 14: Test `vote_count` in the list (two files)**

`tests/unit/s8-publication.test.ts`, inside `publicationHarness`:
- directly after `const author` (line 216): `const votes: { upvotes: Readonly<Record<string, number>> | undefined } = { upvotes: undefined };`
- the fake at 250-253 returns `{ refs: …, total: …, ...(votes.upvotes === undefined ? {} : { upvotes: votes.upvotes }) }`;
- the returned object (265-267) gains `votes,` after `author,`.

New case, after the case that ends at line 1130:

```ts
  it("serves each listed debate's upvote count from the page it read, and 0 when the page carries none", async () => {
    const harness = publicationHarness();
    const ref = (await harness.publish(answerWithTree())).transition.public_ref;
    expect((await harness.application.list(10, 0)).items[0]).toMatchObject({ public_ref: ref, vote_count: 0 });
    harness.votes.upvotes = { [ref]: 3, [randomUUID()]: 9 };
    const listed = await harness.application.list(10, 0);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({ public_ref: ref, vote_count: 3 });
    harness.votes.upvotes = {};
    expect((await harness.application.list(10, 0)).items[0]?.vote_count).toBe(0);
  });
```

`tests/unit/s8-publication-http.test.ts`, after the first case of `describe("S8 publication HTTP boundary", …)`:

```ts
  it("serves vote_count on the list, the same body with and without a session", async () => {
    // A typed variable on purpose: an unknown member in a callback's returned literal is not a type error, in a typed variable it is.
    const item: Awaited<ReturnType<PublicationApplication["list"]>>["items"][number] = {
      public_ref: PUBLIC_REF, author_pseudonym: publicDebate.author_pseudonym, question: publicDebate.question,
      published_at: publicDebate.published_at, verdict: publicDebate.answer.verdict, confidence_band: publicDebate.answer.confidence_band, vote_count: 7
    };
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({ list: async () => ({ items: [item], total: 1 }) }) });
    const anonymous = await api.inject({ method: "GET", url: "/v1/public/debates?limit=10&offset=0" });
    const signedIn = await api.inject({ method: "GET", url: "/v1/public/debates?limit=10&offset=0", headers: { cookie, "user-agent": "s8-test-browser" } });
    expect(anonymous.statusCode).toBe(200);
    expect((anonymous.json() as { items: { vote_count?: number }[] }).items[0]?.vote_count).toBe(7);
    expect(signedIn.body).toBe(anonymous.body);
    await api.close();
  });
```

Run and see red:

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/s8-publication.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run typecheck
```

Red: the new `s8-publication` case fails at its first assertion (`vote_count` is missing from the item). The
typecheck fails in `tests/unit/s8-publication-http.test.ts` with `error TS2353` naming `vote_count` (the interface's
item type does not know it yet). The HTTP case itself already passes at run time, because T03 made the schema accept
the member; at run time it is a guard that the list answers the same with and without a session.

- [ ] **Step 15: Serve `vote_count` from `publications.list()`**

`apps/api/src/publications.ts`:
- both declared item types, the interface's (501-512, after `confidence_band: string | null;`) and the method's
  (1033-1045, after `floor_verdict?: …;`), gain `vote_count?: number;`
- inside `items.push(Object.freeze({ … }))`, after `confidence_band` (line 1065) and before the `floor_verdict` spread:
  ```ts
        // Upvotes (0193): the count read with the page, in the same cross-account frame. `?.` on purpose: a page from a repository that carries no counts reads as 0.
        vote_count: page.upvotes?.[publicationRef] ?? 0,
  ```
Nothing else in `list()` changes: the hold (1046), the skip of an unreadable snapshot (1051-1055) and `total` stay.

- [ ] **Step 16: Verify the whole task**

Each line is `cd …/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools <command>`.

| Command | Expected |
|---|---|
| `pnpm run generate:contract` | exit 0 |
| `pnpm run typecheck` | exit 0 (no `error TS` line) |
| `pnpm exec vitest run tests/unit/public-vote-routes.test.ts` | `Tests  12 passed (12)` |
| `pnpm exec vitest run tests/unit/s7-authorization.test.ts` | `Tests  38 passed (38)` |
| `pnpm exec vitest run tests/unit/web-contract.test.ts` | no failed case |
| `pnpm exec vitest run tests/unit/dig-model-contract.test.ts` | no failed case |
| `pnpm exec vitest run tests/unit/s8-publication.test.ts` | no failed case; the new case is listed |
| `pnpm exec vitest run tests/unit/s8-publication-http.test.ts` | no failed case; the new case is listed |
| `pnpm exec vitest run tests/unit/nv07-public-read-hold.test.ts` | no failed case, file unedited (the hold still answers `{ items: [], total: 0 }`) |
| `pnpm exec vitest run tests/render/m6-library-floor.test.tsx` | no failed case, file unedited |
| `pnpm exec vitest run tests/unit/public-ai-providers-route.test.ts` | no failed case, file unedited (red here means a row was added in the wrong place) |
| `pnpm exec vitest run tests/unit/staff-http.test.ts` | no failed case, file unedited |
| `pnpm exec vitest run tests/architecture/staff-contract.test.ts` | no failed case (red here means `generate:contract` was not rerun) |
| `pnpm exec vitest run tests/architecture/rls-cross-account-sites.test.ts` | no failed case, file unedited (red here means `main.ts` gained a cross-account site or the `publicFlags` literal moved) |
| `pnpm exec vitest run tests/unit/obs-l2-s04-zone.test.ts` | no failed case, file unedited |
| `pnpm exec vitest run tests/unit/api-error-envelopes.test.ts` | no failed case, file unedited |
| `pnpm exec vitest run tests/unit/ai-generated-header.test.ts` | no failed case, file unedited |
| `pnpm exec vitest run tests/unit/api-admission-limits.test.ts` | no failed case, file unedited |
| `git status --short` | the twelve paths of Step 17 and nothing else of yours (untracked files under `docs/superpowers/` were there before and are not staged) |

- [ ] **Step 17: Stage, run the limits check, commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add apps/api/src/public-vote.ts apps/api/src/index.ts apps/api/src/main.ts apps/api/src/publications.ts packages/contract/src/index.ts packages/contract/src/generate.ts tests/unit/public-vote-routes.test.ts tests/unit/s7-authorization.test.ts tests/unit/web-contract.test.ts tests/unit/dig-model-contract.test.ts tests/unit/s8-publication.test.ts tests/unit/s8-publication-http.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "A signed-in account upvotes a public debate and takes it back over three routes, and the public list carries each debate's count." -m "PUT and DELETE /v1/public/debates/{id}/vote and GET /v1/account/public-debate-votes are declared in the policy table, the contract's route list and the generated OpenAPI, and are always mounted. Every absence (guessed, not public, hidden, malformed id, an account that is not active, no store) is the one 404; the account is the session's; all three charge the publicVotes budget before the id is looked at. publications.list() serves vote_count from the page it read, the same for every caller. main.ts builds the store on the request pool. Tests: tests/unit/public-vote-routes.test.ts; the authorization matrix and the three route-count pins; the two publication tests." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

That is twelve `git add` paths (the generated folder is git-ignored and is not staged). Never `git add -A` or
`git add .`. Expected from the check: `LIMITS_CHECK_OK …`, exit 0. No figure of the budget in the commit message.
The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The last
`-m` is the attribution line; if your session's instructions give another one, use theirs.
