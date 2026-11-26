### Task T03: Contract shapes and client methods

The wire shapes of the upvotes and the three client methods (design §7.3). This task adds the optional count to
the public list's row, three strict shapes, and three methods of the typed client. It adds NO route to the
contract's route list and touches no API, page or mock file: T07 adds the routes with their policy rows.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: nothing of this slice. May run alongside T01, T04, T09, T10 (no shared file). If another task shares
your working tree, run your typecheck, `generate:contract` and commit steps while no other task is in the middle
of an edit, and read every `git status` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `tests/unit/public-votes-contract.test.ts`
- Modify: `packages/contract/src/web.ts` (append after `:1185`, the file's last line)
- Modify: `packages/contract/src/index.ts:49` (the import from `./web.js`), `:1464-1465` (the summary's last
  key), `:2280` (the resources list)
- Modify: `packages/contract/src/client.ts:3-4` (one new import after them), `:22` (delete), `:166` (one type
  import), `:477-487` (the list's return type), `:629` (three interface members after it), `:1181-1182` (three
  implementations between them)
- Modify: `tests/unit/synthesis-check-wire.test.ts:33-38` (key pin, runtime)
- Modify: `tests/architecture/s8-publication-contract.test.ts:205` (key pin, source text)
- Test: `tests/unit/public-votes-contract.test.ts`, `tests/unit/synthesis-check-wire.test.ts`,
  `tests/architecture/s8-publication-contract.test.ts`

**Interfaces:**
- Consumes: nothing from another task of this slice. The tree already holds `dev` with step 0192, and
  `packages/contract/generated/` exists (it is gitignored).
- Produces, for T07 (routes), T11 (the button), T12 (the page) and T13 (the mock). Exact names:

```ts
// packages/contract/src/web.ts (re-exported by index.ts:54 and by the generated entry "@debateai/contract")
export const PublicVoteRequestSchema = z.object({}).strict();
export const PublicVoteAnswerSchema = z.object({ voted: z.boolean(), vote_count: z.number().int().nonnegative() }).strict();
export type PublicVoteAnswer = z.infer<typeof PublicVoteAnswerSchema>;
export const OwnPublicVotesSchema = z.object({ voted: z.array(z.uuid()).max(100) }).strict();
export type OwnPublicVotes = z.infer<typeof OwnPublicVotesSchema>;

// packages/contract/src/index.ts: PublicDebateSummarySchema's ninth and LAST key
vote_count: z.number().int().nonnegative().optional()

// packages/contract/src/client.ts: interface ContractClient (declared at :417)
readPublicDebates(limit: number, offset: number): Promise<PublicDebateList>;
castPublicVote(publicationRef: string): Promise<PublicVoteAnswer>;       // PUT    /v1/public/debates/{ref}/vote, body {}
withdrawPublicVote(publicationRef: string): Promise<PublicVoteAnswer>;   // DELETE /v1/public/debates/{ref}/vote, no body
readOwnPublicVotes(publicationRefs: readonly string[]): Promise<OwnPublicVotes>; // GET /v1/account/public-debate-votes?refs=a,b
```

  - The three schemas are members of `contractInventory.resources` under their own names.
  - Refusals throw `ContractHttpError`: 404 → `code "NOT_FOUND"`, 401 → `"SESSION_REQUIRED"`, 403 → `"FORBIDDEN"`,
    400 → `"MALFORMED_REQUEST"`, 429 → `"RATE_LIMITED"` with `retryAfterMs`; an answer that fails its schema →
    `"INVALID_RESPONSE"`. `serverCode` is the body's `error` string. No refusal comes back as data.
  - A row's `vote_count` is `number | undefined`. Absent means "an API from before the upvotes": the page shows
    no vote box for that row (T12).
  - What "optional" does and does not buy (say it in the pull request too). A newer page reads an older API: yes.
    An older page does NOT read a newer API: the list's schema is strict (`index.ts:1465`) and the client parses
    with it (`client.ts:330`), so a build from before this slice refuses an item that carries `vote_count`
    (Step 4 shows that refusal). It holds in production only because each release's website reads its own
    release's API: a slot starts its API and its website together (`deploy/vps/README.md:1297`). No code for it.

**Before you start:**

Read these as templates.
- `packages/contract/src/web.ts:1170-1185`: the report and flag shapes. Copy the form: one strict `z.object` per
  line, the type on the next line, a `/** */` comment that names the route.
- `packages/contract/src/index.ts:1444-1449` (`public_stage`, the newest optional member of a strict served
  schema) and `:1459-1464` (how a comment sits above a key inside the summary block).
- `packages/contract/src/client.ts:852-854` (a DELETE that answers JSON and sends no body), `:1135-1140` (a PUT
  with a JSON body through the local `request`), `:1030-1040` (a GET whose query is built with
  `URLSearchParams`), `:627-631` (where the interface members go).
- `tests/unit/v4-account-memory-contract.test.ts:69-104`: the fetch stand-in this task's test copies.

Traps.
- **The summary block is read as source text.** `tests/architecture/s8-publication-contract.test.ts:198-208`
  slices `index.ts` from `export const PublicDebateSummarySchema` to `export type PublicDebateSummary =` and
  matches keys with `/^  ([a-z_]+):/gmu`. So the new key sits on its own line, indented by exactly two spaces,
  after `floor_verdict`. Any comment in that block must not contain any of: `asker_id`, `owner_ref`, `user_id`,
  `run_ref`, `answer_id`, `memory_disclosure`, `ledger_digest_handle`, `inspection_handle`, `cost_envelope`,
  `tier_provenance_ref`, `leading_node_id`, `basis_incomplete`, `floor_reason`.
- **Do not write `vote_count?: number` anywhere in `client.ts`.** `tsconfig.json:13` sets
  `exactOptionalPropertyTypes`; zod infers `vote_count?: number | undefined`, and the two are not assignable.
  The interface's return type becomes `Promise<PublicDebateList>`; nothing is spelled inline.
- **Never write `vote_count: undefined`** in a row. Leave the key out.
- **No exported number.** `tools/orphan-audit/src/index.ts:816-823` refuses `export const UPPER_NAME = <number>`
  in engine code, and `tests/architecture/scaffold.test.ts` runs that audit. The 100 is a literal inside
  `.max(100)`. Add no limits object either: the fixed interface names none.
- **`web.ts` imports nothing from `./index.js`** (`web.ts:1-4`). Keep it so.
- **The route list is not this task's.** Do not edit `index.ts:2156-2162` or anything else inside
  `contractInventory.routes`, `packages/contract/src/generate.ts`, or the three tests that pin 220 routes
  (`tests/unit/s7-authorization.test.ts:419`, `tests/unit/web-contract.test.ts:353`,
  `tests/unit/dig-model-contract.test.ts:352`). A route string without its policy row and its mount turns
  `tests/unit/s7-authorization.test.ts` and `tests/unit/staff-http.test.ts` red. The client methods may exist
  before their routes; no test compares the two.
- **PUT sends `{}`; DELETE sends no body.** `requestJson` sets `content-type` only when a body is given
  (`client.ts:302`) and adds the CSRF header to every method except GET and HEAD (`:298-301`). Do not pass an
  empty string as a body.
- **`readOwnPublicVotes` sends what it is given.** No check and no shortcut in the client: an empty list is the
  server's 400. All refs go in ONE `refs` member joined with commas (the API refuses a repeated `refs`).
- **No `recover` hook** on any of the three (unlike `writePublicReport`, `client.ts:1186-1190`).
- **Test refs must be real-shaped uuids.** `z.uuid()` in zod 4.6.7 checks the version and variant digits:
  `11111111-1111-4111-8111-111111111111` passes, `00000000-0000-0000-0000-000000000001` does not.
- **A missing export is `undefined` under vitest, not an import error.** Red looks like
  `Cannot read properties of undefined (reading 'parse')` and `client.castPublicVote is not a function`.
- **`packages/contract/generated/` is gitignored.** Regenerate it; never `git add` it.
- **The pull request's `limits-check` job** reads every added line and every commit message against a secret
  list (`tools/limits-check.mjs:2-20`). There is no list on this machine. Keep figures out of the commit
  message. If the job later refuses the `.max(100)` line, that line takes the mark `limits-check-ok` with its
  reason; do not add the mark beforehand.

- [ ] **Step 1: Add `"vote_count"` to the two key pins**

`tests/unit/synthesis-check-wire.test.ts:33-38`. Rename the case and append the key, last:

```ts
  it("PublicDebateSummarySchema's key set is exactly the 27e21e5e1 set and the upvote count", () => {
    expect(Object.keys(PublicDebateSummarySchema.shape)).toEqual([
      "public_ref", "author_pseudonym", "question", "published_at", "models",
      "verdict", "confidence_band", "floor_verdict", "vote_count"
    ]);
  });
```

`tests/architecture/s8-publication-contract.test.ts:205`. Append the key, last; change nothing else in the case:

```ts
      .toEqual(["public_ref", "author_pseudonym", "question", "published_at", "models", "verdict", "confidence_band", "floor_verdict", "vote_count"]);
```

- [ ] **Step 2: Run both pins and see them fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/synthesis-check-wire.test.ts`
Expected: `Tests  1 failed | 4 passed (5)`; the failure is the renamed case,
`expected [ 'public_ref', …(7) ] to deeply equal [ 'public_ref', …(8) ]`.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts`
Expected: `Tests  1 failed | 4 passed (5)`; the failure is "exposes a dedicated strict public contract and no
anonymous owner-only carriers", an array one name short.

- [ ] **Step 3: Write the new test file**

Create `tests/unit/public-votes-contract.test.ts` with exactly this content:

```ts
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
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-votes-contract.test.ts`
Expected: `Tests  8 failed (8)`. The messages are `expected 'floor_verdict' to be 'vote_count'`,
`Cannot read properties of undefined (reading 'parse')`, `client.castPublicVote is not a function`, and
`Unrecognized key: "vote_count"`.

- [ ] **Step 5: Add the three shapes to `web.ts`**

Append to `packages/contract/src/web.ts`, after line 1185, one blank line first. The five declarations are the
ones under **Interfaces** above, character for character, in that order. Two comments, in the file's style:

```ts
/**
 * Upvotes on public debates (spec 2026-11-26). PUT and DELETE /v1/public/debates/{id}/vote: nothing but the press; the voter is
 * the session's. Both answer where the account stands now and the debate's count now. No shape here names a voter.
 */
// ...PublicVoteRequestSchema, PublicVoteAnswerSchema, type PublicVoteAnswer
/** GET /v1/account/public-debate-votes?refs=<uuid,uuid,...>: which of the asked public debates the signed-in account upvotes now. */
// ...OwnPublicVotesSchema, type OwnPublicVotes
```

- [ ] **Step 6: Add `vote_count` to the summary, and register the shapes**

`packages/contract/src/index.ts:1464-1465`. `floor_verdict` gains a trailing comma; the new key is last:

```ts
  floor_verdict: VerdictStateSchema.optional(),
  // Upvotes (spec 2026-11-26): how many accounts upvote this debate now. A number only, never who.
  // Optional: an API from before the upvotes sends none (additive only), and the row then shows no vote box.
  vote_count: z.number().int().nonnegative().optional()
}).strict();
```

`packages/contract/src/index.ts:49`: add `OwnPublicVotesSchema, PublicVoteAnswerSchema, PublicVoteRequestSchema`
to the names imported from `"./web.js"` (the import that runs from line 49 to line 53).

`packages/contract/src/index.ts:2280`: directly after that line (it ends
`PublicReportAcceptedSchema, PublicDebateRefusedSchema,`) add, indented by four spaces:

```ts
    // Upvotes on public debates (./web.ts): the press's request and answer, and the own-votes read.
    PublicVoteRequestSchema, PublicVoteAnswerSchema, OwnPublicVotesSchema,
```

- [ ] **Step 7: Run the three files: the pins pass, the client cases still fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/synthesis-check-wire.test.ts`
Expected: `Tests  5 passed (5)`.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts`
Expected: `Tests  5 passed (5)`.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-votes-contract.test.ts`
Expected: `Tests  3 failed | 5 passed (8)`. The three failures are the cases that call `castPublicVote`
("sends each client method…", "refuses an answer outside the contract…", "throws each refusal…"), each with
`castPublicVote is not a function`.

- [ ] **Step 8: Add the three client methods and retype the list read**

All in `packages/contract/src/client.ts`.

Imports:
- After line 4, a new import from `"./web.js"` under a one-line comment (as lines 3-4 do):
  `OwnPublicVotesSchema, PublicVoteAnswerSchema, PublicVoteRequestSchema, type OwnPublicVotes, type PublicVoteAnswer`.
- Line 166: add `type PublicDebateList,` on the line after `type PublicDebate,` (the import from `./index.js`
  that ends at line 172).
- Line 22: delete `import type { VerdictState } from "./verdict-state.js";`. Its only use was line 483.

Interface (`ContractClient`, `:417`):
- Lines 477-487 become one line: `readPublicDebates(limit: number, offset: number): Promise<PublicDebateList>;`
- After line 629 (`flagPublicDebate(...)`), the three members under **Interfaces**, with these two comments:

```ts
  /**
   * Upvotes: cast (PUT) and withdraw (DELETE) the signed-in account's vote on a public debate. Each is safe to repeat and answers
   * where the account stands and the count now. A debate that is not public now is a 404; it and every other refusal throw.
   */
  /** Which of these public debates (1 to 100) the signed-in account upvotes now. A GET, so the server-drawn home page can ask it. */
```

Implementation, between `flagPublicDebate` (ends `:1181`) and `readModerationStatements` (`:1182`). Each is one
call of the local `request(path, schema, init)` (`:668-673`), with no `expectedStatus`:

| Method | Path | Schema | `init` |
|---|---|---|---|
| `castPublicVote` | `` `/v1/public/debates/${encodeURIComponent(publicationRef)}/vote` `` | `PublicVoteAnswerSchema` | `{ method: "PUT", body: JSON.stringify(PublicVoteRequestSchema.parse({})) }` |
| `withdrawPublicVote` | the same path | `PublicVoteAnswerSchema` | `{ method: "DELETE" }` |
| `readOwnPublicVotes` | `` `/v1/account/public-debate-votes?${new URLSearchParams({ refs: publicationRefs.join(",") }).toString()}` `` | `OwnPublicVotesSchema` | none |

The body of `readPublicDebates` (`:908-911`) does not change.

- [ ] **Step 9: Run the new test and see it pass**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-votes-contract.test.ts`
Expected: `Tests  8 passed (8)`.

- [ ] **Step 10: Regenerate the contract entry and check the types**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract`
Expected: exit 0. `packages/contract/generated/field-inventory.json` now names the three schemas with their
members (`[]`, `["voted","vote_count"]`, `["voted"]`) and lists `vote_count` last under
`PublicDebateSummarySchema`. Its `routes` list is unchanged.

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run typecheck`
Expected: exit 0, no error line. (The root typecheck reads `tests/**/*.ts`, so it also proves the new test's
typed lines: `const list: PublicDebateList = await client.readPublicDebates(50, 0)` and
`list.items[0]?.vote_count`.)

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui typecheck`
Expected: exit 0. (`apps/ui/app/page.tsx:158` types its list from `ContractClient["readPublicDebates"]`.)

- [ ] **Step 11: Verify the task**

One file per command, each with the prefix
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command (after the prefix) | Expected |
|---|---|
| `pnpm exec vitest run tests/unit/public-votes-contract.test.ts` | `Tests  8 passed (8)` |
| `pnpm exec vitest run tests/unit/synthesis-check-wire.test.ts` | `Tests  5 passed (5)` |
| `pnpm exec vitest run tests/architecture/s8-publication-contract.test.ts` | `Tests  5 passed (5)` |
| `pnpm exec vitest run tests/unit/web-contract.test.ts` | `Tests  26 passed (26)`: still 220 routes, file untouched |
| `pnpm exec vitest run tests/unit/s7-authorization.test.ts` | `Tests  38 passed (38)`: policy rows still equal the route list, file untouched |
| `pnpm exec vitest run tests/unit/public-ai-providers-route.test.ts` | `Tests  7 passed (7)` |
| `pnpm exec vitest run tests/unit/s8-publication-http.test.ts` | `Tests  9 passed (9)`: a list row with no count still serves, file untouched |
| `pnpm exec vitest run tests/render/m6-library-floor.test.tsx` | `Tests  4 passed (4)`, file untouched |
| `pnpm exec vitest run tests/render/t3-library.test.tsx` | `Tests  15 passed (15)`, file untouched |
| `pnpm exec vitest run tests/architecture/s14-contract.test.ts` | `Tests  6 passed (6)` |
| `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` | Alone in the tree: `Tests  1011 passed (1011)` (about 16 s). Beside other tasks of this slice: one failure at most, the shipped-file manifest case, with `missing: []` and `added` holding only files this slice created (T15's six: `packages/db/src/migration-forward0193.ts`, `packages/db/src/public-debate-upvote.ts`, `apps/api/src/public-vote.ts`, `apps/api/src/public-vote-sweep.ts`, `apps/ui/lib/upvoteWords.ts`, `apps/ui/components/LibraryVote.tsx`). This task creates no shipped file. Anything else is yours |
| `pnpm exec vitest run tests/architecture/scaffold.test.ts` | `Tests  1 failed \| 28 passed (29)`. The one failure is the known red "dev's F31 debt: apps/api, apps/runner and apps/scheduler declare their obs-capture edge". Any other failure is this task's. |
| `git status --short` | Of this task: five modified files and one new test file, the six paths of Step 12, and nothing else of yours. Other lines belong to tasks running beside it. Nothing under `packages/contract/generated/`. |
| `git diff --stat -- packages/contract/src/generate.ts tests/unit/s7-authorization.test.ts tests/unit/web-contract.test.ts tests/unit/dig-model-contract.test.ts` | empty: this task left the route list's files alone |

- [ ] **Step 12: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add packages/contract/src/web.ts packages/contract/src/index.ts packages/contract/src/client.ts tests/unit/public-votes-contract.test.ts tests/unit/synthesis-check-wire.test.ts tests/architecture/s8-publication-contract.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The contract carries a public debate's upvote count and the vote shapes, and the client can cast a vote, take it back and read the account's own." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected from the check, last line: `LIMITS_CHECK_OK <n> added line(s) read.` Never `git add -A` or `git add .`;
add nothing else to the commit. The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this
worktree; nothing is pushed. The last `-m` is the attribution line; if your session's instructions give another
one, use theirs.
