### Task T08: End-to-end flow on a real database

Design §5, §7.1, §7.2 and the anti-goals of §2. One integration test file follows an upvote through the API's own
routes, built by `buildApi` on the product's own database logins, over an embedded PostgreSQL with the real chain.
No production code. It proves that the separately built pieces (step 0193, the db repository, the routes, the rate
budget, the count in the list) fit, and that the anti-goals hold on real SQL. The file is long for a task file
because the test is the deliverable: its assertions are given as code.

Every command is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: **T02** and **T07** (and through them T01, T03, T04, T05). May run alongside T12, T13 and T16 (no shared
file). If another task shares your working tree, run your typecheck, `generate:contract` and commit steps while no
other task is in the middle of an edit, and read every `git status` and typecheck expectation below as "nothing
else of yours".

**Files:**
- Create: `tests/integration/public-vote-flow.test.ts`
- Modify: none. Not `tests/ci-integration-auth.txt` (T15 lists this file there), not
  `tests/support/master-key-files.txt`, nothing under `apps/`, `packages/` or `migrations/`.
- Test: `tests/integration/public-vote-flow.test.ts`

**Interfaces:**
- Consumes, from T01 (applied by `migrate(pool)`): table `identity.public_debate_upvote (publication_ref, owner_ref,
  created_at)`, read back on the harness superuser only; and `identity.delete_gone_public_debate_upvotes(p_limit
  integer) RETURNS integer`, granted to `debateai_rls_all_accounts` only and called here on the API's system login:
  it deletes at most `p_limit` (1 to 1000; this file passes 1 and 100) votes of debates whose link can never be
  public again (the link is no longer its debate's current publication: made private again, or published again
  under a new link), never the votes of a debate that is only held, and returns how many it deleted.
- Consumes, from T03 (`@debateai/contract`): `PublicVoteAnswerSchema` (`{ voted, vote_count }`), `OwnPublicVotesSchema`
  (`{ voted: uuid[] }`), and `PublicDebateListSchema` whose items carry optional `vote_count`.
- Consumes, from T04: `admissionPolicyFromValue(row.value, row.sourceRef).publicVotes` (`limit`, `windowMs`), and
  `new AdmissionLimiter(policy)`, which always has that bucket.
- Consumes, from T05 (`@debateai/db`): `new PostgresPublicDebateUpvoteRepository(pool)`.
- Consumes, from T07: `ApiOptions.publicVotes?: { repository }`; `PUT` and `DELETE /v1/public/debates/{id}/vote`
  (200 `{ voted, vote_count }`, 404 `{ error: "DEBATE_NOT_FOUND" }`); `GET /v1/account/public-debate-votes?refs=`
  (200 `{ voted }`); 401 `{ error: "SESSION_REQUIRED" }`; 403 `{ error: "CSRF_VALIDATION_FAILED" }`; 429
  `{ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" }` with `retry-after`; and `vote_count` on
  every item of `GET /v1/public/debates`.
- Produces: `tests/integration/public-vote-flow.test.ts`, seven cases in one `describe`. T15 adds its path to
  `tests/ci-integration-auth.txt`; `tests/ci-integration-all.txt:35` already takes it by its glob.

**Before you start:**

Templates.
- `tests/integration/rls-request-scope.test.ts:131-143` and `:214-219`: `buildApi` on `loginApiPools(database)`, with
  accounts from `seedSessionAccount` and identities from `httpIdentityFor`. Copy this frame. It is the wiring of
  `apps/api/src/main.ts:390-392` and `:436`: the request pool, with the system login as its cross-account target.
- `tests/integration/public-tree-flow.test.ts:71`, `:97-105` and `:144-173`: a debate made public with a real snapshot
  under a `PublicationCipher` on a `MemoryPublicationKeyStore`. Copy the cipher, the `seeded` helper and the three
  seeded rows; leave out the story, the run cipher and the rest.
- `tests/integration/security-review-hardening-database.test.ts:115-118` (an unpublish: one `PRIVATE` event) and
  `:592-593` (a review hold: one `HIDE` row in `identity.public_review_event`).

Traps.
- Do NOT copy the harness of `tests/integration/public-tree-flow.test.ts:3260-3289`. Its pool is the system login
  (`:368`) and its identities have no stored session. For a login that holds the marker and names no session,
  `identity.request_owner_matches` says yes to any owner (`migrations/0171_security_review_hardening.sql:411-416`),
  so the owner check would never run. The vote store goes on `pools.runtime` and nowhere else.
- Sessions must be real rows: `seedSessionAccount` (`tests/support/rls-logins.ts:538`) writes one and
  `httpIdentityFor` (`:573`) hands its raw token to the cookie. `testHttpIdentity`
  (`tests/support/httpSession.ts:23`) has no row: the database would see no owner and every write would be a 500.
- The snapshot's ciphertext must be real. The list decrypts each snapshot and skips one it cannot read
  (`apps/api/src/publications.ts:1055`), and `published_at` must equal the row's `created_at` (`:990-991`). The
  made-up envelope of `security-review-hardening-database.test.ts:102` gives an empty list.
- One run has one current link, so every debate gets a run of its own: a freshly seeded author.
- The harness superuser inside a request throws `R21_SUPERUSER_POOL_IN_REQUEST`
  (`tests/support/master-key-guard.ts:6-9`). The API gets `pools.runtime` only; every `database.pool` query stays in
  the test body. The file does not go on the master-key list.
- `PUT` is sent with `payload: {}`; `DELETE` with no payload (`inject` adds a JSON content type only with a payload,
  and an empty JSON body is a 400 before any handler).
- No test login may call `core.run_is_published` or `core.run_of_publication` (42501, run on this tree). Read "is it
  public" through the list, as a visitor does.
- `cache-control: no-store` is put on every answer by the API's own hook (`apps/api/src/index.ts:2796-2798`). The
  `no-store` lines below hold for every answer; they do not prove the handler's own header (T07's test does).
- The rate budgets are real here, on a clock the file owns; `beforeEach` moves it one whole window on, so every case
  starts with fresh budgets. Never write a budget's figure in this file: read it from `policy` (the pull request's
  limits check reads added lines).
- A case that fails after Step 5 is a defect of an earlier task, not of this file. Do not loosen an assertion and do
  not edit another task's file: stop and report the case, the assertion and the answer. A guide: no `vote_count` in
  the list is T05 or T07; a 500 for the suspended account is T05's error mapping; 42501 from the sweep is T01's
  grant; a wrong sweep count is T01's rule for "gone for good".
- What these cases do not prove, by decision (say so if a reviewer asks; do not add cases): the timing of the 404s
  is covered only by T01's single `NOT_PUBLIC` branch; two accounts casting at the same instant can each be answered
  a count one short until the next read (there is no stored counter, so the list is always right); and "a vote
  leaves with its account" is proven by deleting the account row, the statement erasure ends with, not by running
  the erasure's own function (the house precedent, as in T02).
- The harness and helpers of Step 2 were run on this tree at `c946564be` without the vote lines (12 seconds): the
  seeded debate is listed over HTTP, a `HIDE` row drops it, `REPUBLISH` brings it back, a `PRIVATE` event drops it,
  the account row deletes cleanly, and a suspended account's session still reaches the handler.

- [ ] **Step 1: Check that T01, T02, T03, T04, T05 and T07 have landed**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "delete_gone_public_debate_upvotes" migrations/0193_public_debate_upvotes.sql; grep -c "public-debate-upvote.js" packages/db/src/investigation-reports.ts; grep -c "export const PublicVoteAnswerSchema\|export const OwnPublicVotesSchema" packages/contract/src/web.ts; grep -c '"publicVotes"' apps/api/src/admission.ts; grep -c "publicVotes" apps/api/src/index.ts; ls tests/integration/public-debate-upvotes-0193.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
```

Expected: five counts, each 1 or more (the third is 2), the listed path, and `generate:contract` exits 0. A count
of 0 or a missing file means an earlier task is not in the tree: stop and report.

- [ ] **Step 2: Create the file with its harness and helpers, the vote store left out on purpose**

`tests/integration/public-vote-flow.test.ts`: a two-line header comment in the repository's style (what it follows,
on which logins, "Data is made up."), then this. `seeded`'s body is the template's. The `publicVotes` line comes in
Step 5.

```ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OwnPublicVotesSchema, PublicDebateListSchema, PublicDebateSchema, PublicVoteAnswerSchema } from "@debateai/contract";
import { MemoryPublicationKeyStore, PublicationCipher, generateDek, loadKek } from "../../packages/crypto/src/index.js";
import { migrate, PostgresPublicationRepository } from "@debateai/db";
import { ADMISSION_POLICY_REGISTER_ROW, admissionPolicyFromValue } from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import { TEST_APP_ORIGIN, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";
import { httpIdentityFor, loginApiPools, provisionRlsLogins, seedSessionAccount, type ApiTestPools, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const NAMES = ["ana", "ben", "cat", "dan", "eve", "fay", "gus"] as const;
type Name = (typeof NAMES)[number];
type Person = Readonly<{ account: RlsTestAccount; session: TestHttpIdentity }>;
type Debate = Readonly<{ ref: string; runId: string }>;
const LIST = "/v1/public/debates?limit=100&offset=0";
const NOT_FOUND = { error: "DEBATE_NOT_FOUND" };
const policy = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
const publicationCipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(generateDek())));
const who = {} as Record<Name, Person>;
let database: TestDatabase;
let pools: ApiTestPools;
let api: ReturnType<typeof buildApi>;
let now = new Date("2026-11-26T12:00:00.000Z");

async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  // body: public-tree-flow.test.ts:97-105 (one transaction, SET LOCAL session_replication_role = 'replica')
}
const EVENT = `INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
  VALUES ($1,$2,$3,$4,$5,2,$6,now(),ledger.allocate_sequence())`;
/** The run made public under a new link, as the transition writes it: a real snapshot under its own key, and the PUBLISHED event. */
async function publish(runId: string): Promise<Debate> {
  const [ref, at] = [randomUUID(), new Date()];
  const snapshot = PublicDebateSchema.parse({ public_ref: ref, author_pseudonym: "fixture", published_at: at.toISOString(), question: "Should Harbour Town build a second ferry pier?",
    answer: { terminal: "COMPONENTS_ONLY", verdict: null, verdict_available: false, confidence_band: null, summary_segments: [{ text: "The first answer." }], badges: [],
      residual_objections: [], reversal_point: "none", as_of: at.toISOString() } });
  const prepared = await publicationCipher.create(ref, runId);
  const content = prepared.encrypt(snapshot);
  prepared.close();
  await seeded([
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,$4)", [ref, runId, JSON.stringify(content), at]],
    [EVENT, [randomUUID(), runId, ref, "PUBLISHED", randomUUID(), "PUBLIC_INDEXED_V1"]]]);
  return { ref, runId };
}
/** A public debate on a run of its own: `author`'s, or a freshly seeded account's. */
const published = async (author?: RlsTestAccount): Promise<Debate> => publish((author ?? await seedSessionAccount(database.pool, "author")).runId);
const unpublish = (debate: Debate) => seeded([[EVENT, [randomUUID(), debate.runId, debate.ref, "PRIVATE", randomUUID(), "COPIES_MAY_PERSIST_V1"]]]);
/** 0150's log, as a staff step writes it: HIDE holds the debate for review, REPUBLISH lifts the hold. */
const review = (ref: string, revision: number, action: "HIDE" | "REPUBLISH") => seeded([[`INSERT INTO identity.public_review_event (publication_ref,revision,action,actor_staff_id,operation_id,request_sha256)
  VALUES ($1,$2,$3,$4,$5,$6)`, [ref, revision, action, randomUUID(), randomUUID(), "0".repeat(64)]]]);

const ownerOf = (name: Name): string => who[name].account.ownerRef;
const voteUrl = (ref: string): string => `/v1/public/debates/${ref}/vote`;
const put = (name: Name, ref: string) => api.inject({ method: "PUT", url: voteUrl(ref), headers: testSessionHeaders(who[name].session, true), payload: {} });
const del = (name: Name, ref: string) => api.inject({ method: "DELETE", url: voteUrl(ref), headers: testSessionHeaders(who[name].session, true) });
const own = (name: Name, refs: readonly string[]) => api.inject({ method: "GET", url: `/v1/account/public-debate-votes?refs=${refs.join(",")}`, headers: testSessionHeaders(who[name].session) });
const answered = (response: { json(): unknown }) => PublicVoteAnswerSchema.parse(response.json());
/** Every header of an answer but its clock, as one string: two answers that tell the same thing have the same one. */
const headersOf = (response: { headers: Record<string, unknown> }): string =>
  JSON.stringify(Object.entries(response.headers).filter(([name]) => name !== "date").sort(([a], [b]) => (a < b ? -1 : 1)));
const votedOf = (response: { json(): unknown }) => OwnPublicVotesSchema.parse(response.json()).voted;
/** What any visitor's read of the list shows for `ref`: its count, or null when the list does not show the debate. */
async function countOf(ref: string): Promise<number | null> {
  const answer = await api.inject({ method: "GET", url: LIST });
  expect(answer.statusCode).toBe(200);
  const item = PublicDebateListSchema.parse(answer.json()).items.find((row) => row.public_ref === ref);
  return item === undefined ? null : item.vote_count ?? Number.NaN;
}
/** The accounts whose vote on `ref` is stored: read back on the harness superuser, outside every request. */
const stored = async (ref: string): Promise<string[]> => (await database.pool.query<{ owner_ref: string }>(
  "SELECT owner_ref::text AS owner_ref FROM identity.public_debate_upvote WHERE publication_ref=$1", [ref])).rows.map((row) => row.owner_ref).sort();
/** The sweep of debates gone for good, on the API's system login, as the API's timer calls it. */
const sweep = async (limit: number): Promise<number> => (await pools.system.query<{ deleted: number }>(
  "SELECT identity.delete_gone_public_debate_upvotes($1) AS deleted", [limit])).rows[0]!.deleted;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  pools = await loginApiPools(database);
  for (const name of NAMES) {
    const account = await seedSessionAccount(database.pool, name);
    who[name] = { account, session: httpIdentityFor(account) };
  }
  api = buildApi({
    application: {} as AskApplication,
    sessions: testSessionApplication(NAMES.map((name) => who[name].session)),
    allowedOrigin: TEST_APP_ORIGIN,
    // As main.ts builds them: both on the request pool, whose cross-account target is the system login.
    publications: new PostgresPublicationApplication(new PostgresPublicationRepository(pools.runtime, { hash: () => "sha256:0" } as never), publicationCipher),
    admission: new AdmissionLimiter(policy),
    admissionClock: () => now
  });
  await api.ready();
}, 300_000);
// Every case starts with fresh budgets: the clock moves one whole window on.
beforeEach(() => { now = new Date(now.getTime() + Math.max(policy.publicReads.windowMs, policy.publicVotes.windowMs)); });
afterAll(async () => {
  await api?.close();
  if (database !== undefined) await (await provisionRlsLogins(database)).end();
  await database?.stop();
});

describe("upvotes on public debates, over the API's routes on real PostgreSQL", () => {
});
```

- [ ] **Step 3: Add the first case inside the `describe`**

```ts
it("a vote shows to every reader as the count: one per account, a second account makes 2, taking one back makes 1, and an author may upvote their own debate", async () => {
  const debate = await published(who.ana.account);
  expect(await countOf(debate.ref)).toBe(0);
  const first = await put("ben", debate.ref);
  expect(first.statusCode).toBe(200);
  expect(first.headers["cache-control"]).toBe("no-store");
  expect(answered(first)).toEqual({ voted: true, vote_count: 1 });
  expect(await countOf(debate.ref)).toBe(1);
  expect(answered(await put("ben", debate.ref))).toEqual({ voted: true, vote_count: 1 });
  expect(answered(await put("cat", debate.ref))).toEqual({ voted: true, vote_count: 2 });
  expect(await countOf(debate.ref)).toBe(2);
  expect(await stored(debate.ref)).toEqual([ownerOf("ben"), ownerOf("cat")].sort());
  const back = await del("ben", debate.ref);
  expect(back.statusCode).toBe(200);
  expect(back.headers["cache-control"]).toBe("no-store");
  expect(answered(back)).toEqual({ voted: false, vote_count: 1 });
  expect(answered(await del("ben", debate.ref))).toEqual({ voted: false, vote_count: 1 });
  expect(await countOf(debate.ref)).toBe(1);
  expect(answered(await put("ana", debate.ref))).toEqual({ voted: true, vote_count: 2 });
  expect(await stored(debate.ref)).toEqual([ownerOf("ana"), ownerOf("cat")].sort());
  // Votes never reorder the list (a non-goal): it stays newest first, whichever debate has the votes.
  const [older, newer] = [await published(), await published()];
  const order = async (): Promise<string[]> => PublicDebateListSchema.parse((await api.inject({ method: "GET", url: LIST })).json()).items
    .map((row) => row.public_ref).filter((ref) => ref === older.ref || ref === newer.ref);
  expect(await order()).toEqual([newer.ref, older.ref]);
  expect((await put("ben", older.ref)).statusCode).toBe(200);
  expect((await put("cat", older.ref)).statusCode).toBe(200);
  expect(await order()).toEqual([newer.ref, older.ref]);
});
```

- [ ] **Step 4: Run it and see it fail for the missing store**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/public-vote-flow.test.ts
```

Expected: `Tests  1 failed (1)`, with `AssertionError: expected 404 to be 200` at
`expect(first.statusCode).toBe(200)`. The line before it has passed: the list already carries a count of 0. Any other
failure (an unresolved import, `No test files found`, a failure in `beforeAll` or at `countOf`) is not this red: go
back to Step 1.

- [ ] **Step 5: Hand the API its vote store, and see the case pass**

Add `PostgresPublicDebateUpvoteRepository` to the `@debateai/db` import, and this line in `buildApi({ ... })` directly
after the `publications` line:

```ts
    publicVotes: { repository: new PostgresPublicDebateUpvoteRepository(pools.runtime) },
```

Run the command of Step 4. Expected: `Tests  1 passed (1)`.

- [ ] **Step 6: Add the second and third cases (the same list for everyone; every absence is one 404)**

```ts
it("the list is the same bytes for every caller and names no voter; which debates an account upvoted is that account's own read", async () => {
  const [one, two] = [await published(), await published()];
  expect((await put("ben", one.ref)).statusCode).toBe(200);
  expect((await put("cat", two.ref)).statusCode).toBe(200);
  const anonymous = await api.inject({ method: "GET", url: LIST });
  for (const name of ["ben", "cat", "dan"] as const) {
    const signedIn = await api.inject({ method: "GET", url: LIST, headers: testSessionHeaders(who[name].session) });
    expect(signedIn.body, name).toBe(anonymous.body);
    expect(headersOf(signedIn), name).toBe(headersOf(anonymous));   // nothing about the caller rides in a header either
  }
  for (const name of NAMES) {
    expect(anonymous.body).not.toContain(who[name].account.ownerRef);
    expect(anonymous.body).not.toContain(who[name].account.userId);
  }
  const row = (anonymous.json() as { items: Record<string, unknown>[] }).items.find((item) => item.public_ref === one.ref)!;
  expect(Object.keys(row).sort()).toEqual(["author_pseudonym", "confidence_band", "models", "public_ref", "published_at", "question", "verdict", "vote_count"]);
  expect(row.vote_count).toBe(1);
  const mine = await own("ben", [one.ref, two.ref]);
  expect(mine.statusCode).toBe(200);
  expect(mine.headers["cache-control"]).toBe("no-store");
  expect(votedOf(mine)).toEqual([one.ref]);
  expect(votedOf(await own("cat", [one.ref, two.ref]))).toEqual([two.ref]);
  expect(votedOf(await own("dan", [one.ref, two.ref]))).toEqual([]);
  const signedOut = await api.inject({ method: "GET", url: `/v1/account/public-debate-votes?refs=${one.ref}` });
  expect(signedOut.statusCode).toBe(401);
  expect(signedOut.json()).toEqual({ error: "SESSION_REQUIRED" });
});

it("a debate that is not public, a guessed link, a malformed id and an account that is not active all answer the one 404 and store nothing; no session is 401, no CSRF pair is 403", async () => {
  const [open, closed, held] = [await published(), await published(), await published()];
  await unpublish(closed);
  await review(held.ref, 1, "HIDE");
  await seeded([[`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [who.eve.account.userId]]]);
  const absent = [
    await put("ben", randomUUID()), await put("ben", "not-an-id"), await put("ben", closed.ref), await put("ben", held.ref), await put("eve", open.ref),
    await del("ben", randomUUID()), await del("ben", "not-an-id"), await del("ben", closed.ref), await del("ben", held.ref)];
  for (const answer of absent) {
    expect(answer.statusCode).toBe(404);
    expect(answer.json()).toEqual(NOT_FOUND);
    expect(answer.headers["cache-control"]).toBe("no-store");
  }
  expect(new Set(absent.map((answer) => answer.body)).size).toBe(1);
  // One face: status, body and every header are the same for private, held, unknown, malformed and not-active.
  expect(new Set(absent.map(headersOf)).size).toBe(1);
  const signedOut = await api.inject({ method: "PUT", url: voteUrl(open.ref), payload: {} });
  expect(signedOut.statusCode).toBe(401);
  expect(signedOut.json()).toEqual({ error: "SESSION_REQUIRED" });
  const noCsrf = await api.inject({ method: "PUT", url: voteUrl(open.ref), headers: testSessionHeaders(who.ben.session), payload: {} });
  expect(noCsrf.statusCode).toBe(403);
  expect(noCsrf.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
  const elsewhere = await api.inject({ method: "DELETE", url: voteUrl(open.ref), headers: testSessionHeaders(who.ben.session, true, "https://elsewhere.example") });
  expect(elsewhere.statusCode).toBe(403);
  for (const debate of [open, closed, held]) expect(await stored(debate.ref)).toEqual([]);
  expect(await countOf(open.ref)).toBe(0);
});
```

Run the command of Step 4. Expected: `Tests  3 passed (3)`.

- [ ] **Step 7: Add the fourth and fifth cases (a hold keeps the votes; a debate gone for good loses them)**

```ts
it("held for review: no new vote, the votes are kept, one can still be taken back, and the rest count again when the hold is lifted", async () => {
  const debate = await published();
  for (const name of ["ben", "cat", "dan"] as const) expect((await put(name, debate.ref)).statusCode).toBe(200);
  expect(await countOf(debate.ref)).toBe(3);
  await review(debate.ref, 1, "HIDE");
  expect(await countOf(debate.ref)).toBeNull();
  const late = await put("fay", debate.ref);
  expect(late.statusCode).toBe(404);
  expect(late.json()).toEqual(NOT_FOUND);
  expect(await stored(debate.ref)).toEqual([ownerOf("ben"), ownerOf("cat"), ownerOf("dan")].sort());
  // Taking a vote back always works: the row goes, and the answer tells nothing about the debate.
  const back = await del("dan", debate.ref);
  expect(back.statusCode).toBe(404);
  expect(back.json()).toEqual(NOT_FOUND);
  expect(await stored(debate.ref)).toEqual([ownerOf("ben"), ownerOf("cat")].sort());
  expect(votedOf(await own("ben", [debate.ref]))).toEqual([debate.ref]);
  expect(votedOf(await own("dan", [debate.ref]))).toEqual([]);
  await review(debate.ref, 2, "REPUBLISH");
  expect(await countOf(debate.ref)).toBe(2);
  expect(answered(await put("dan", debate.ref))).toEqual({ voted: true, vote_count: 3 });
});

it("gone for good: the sweep deletes those votes in bounded batches and never a held debate's; a new link starts from zero", async () => {
  const [closed, moved, held] = [await published(), await published(), await published()];
  for (const [name, debate] of [["ben", closed], ["ben", moved], ["cat", moved], ["ben", held]] as const) expect((await put(name, debate.ref)).statusCode).toBe(200);
  await unpublish(closed);                          // made private again
  await unpublish(moved);
  const again = await publish(moved.runId);         // and this one came back under a new link
  await review(held.ref, 1, "HIDE");
  expect(await countOf(closed.ref)).toBeNull();
  expect(await countOf(moved.ref)).toBeNull();
  expect(await countOf(again.ref)).toBe(0);
  expect((await put("dan", moved.ref)).statusCode).toBe(404);
  expect(await stored(moved.ref)).toHaveLength(2);
  // No other case of this file leaves a vote on a debate that is gone, so these three rows are all there is to take.
  expect(await sweep(1)).toBe(1);
  expect(await sweep(100)).toBe(2);
  expect(await sweep(100)).toBe(0);
  expect(await stored(closed.ref)).toEqual([]);
  expect(await stored(moved.ref)).toEqual([]);
  expect(await stored(held.ref)).toEqual([ownerOf("ben")]);
  await review(held.ref, 2, "REPUBLISH");
  expect(await countOf(held.ref)).toBe(1);
  expect(votedOf(await own("ben", [closed.ref, moved.ref, held.ref, again.ref]))).toEqual([held.ref]);
});
```

Run the command of Step 4. Expected: `Tests  5 passed (5)`.

- [ ] **Step 8: Add the sixth and seventh cases (a deleted account; the flood brake)**

```ts
it("an account that is deleted takes its vote with it, and the count falls", async () => {
  const debate = await published();
  expect(answered(await put("gus", debate.ref))).toEqual({ voted: true, vote_count: 1 });
  expect(answered(await put("ben", debate.ref))).toEqual({ voted: true, vote_count: 2 });
  // The statement account erasure ends with (migrations/0110_account_erasure_public_debates.sql:747), on the harness superuser.
  await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [who.gus.account.userId]);
  expect(await stored(debate.ref)).toEqual([ownerOf("ben")]);
  expect(await countOf(debate.ref)).toBe(1);
});

it("one brake per account covers the three routes together: past it the answer is 429 with the wait and nothing is stored, nobody else is slowed, and a window later it works again", async () => {
  const [one, two] = [await published(), await published()];
  const kinds = [() => put("fay", one.ref), () => del("fay", one.ref), () => own("fay", [one.ref])];
  for (let action = 0; action < policy.publicVotes.limit; action += 1) {
    expect((await kinds[action % kinds.length]!()).statusCode, `action ${String(action + 1)}`).toBe(200);
  }
  const before = await stored(one.ref);
  for (const refused of [await put("fay", two.ref), await del("fay", one.ref), await own("fay", [one.ref]), await put("fay", "not-an-id")]) {
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
    expect(refused.headers["retry-after"]).toBe(String(policy.publicVotes.windowMs / 1_000));
  }
  expect(await stored(two.ref)).toEqual([]);
  expect(await stored(one.ref)).toEqual(before);
  expect(answered(await put("ben", two.ref))).toEqual({ voted: true, vote_count: 1 });
  now = new Date(now.getTime() + policy.publicVotes.windowMs);
  expect(answered(await put("fay", two.ref))).toEqual({ voted: true, vote_count: 2 });
});
```

Run the command of Step 4. Expected: `Tests  7 passed (7)`. One `api.admission.refused` line per refused route on
stderr is the API's own log and is expected.

- [ ] **Step 9: Verify the whole task**

Each line is `cd …/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools <command>`.

| Command | Expected |
|---|---|
| `pnpm exec vitest run tests/integration/public-vote-flow.test.ts` | `Tests  7 passed (7)` |
| `pnpm run typecheck` | exit 0, no `error TS` line (the root `tsc` covers `tests/**/*.ts`) |
| `pnpm exec vitest run tests/architecture/ci-known-red-gate.test.ts` | `Tests  38 passed (38)` (the file sits flat in `tests/integration`) |
| `pnpm exec vitest run tests/unit/master-key-files.test.ts` | `Tests  10 passed (10)`, list unedited |
| `git status --short` | `?? tests/integration/public-vote-flow.test.ts` and nothing else of yours (untracked files under `docs/superpowers/` were there before) |

And one more, outside the table because of its `|` characters. It prints `0`: no budget figure is written in the file
(`grep` exits 1 when it counts nothing, which is the pass).

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -cE "limit: [0-9]+|windowMs: [0-9]+|window_ms" tests/integration/public-vote-flow.test.ts
```

- [ ] **Step 10: Stage, run the limits check, commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add tests/integration/public-vote-flow.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "An upvote is followed end to end on a real database: cast, counted for every reader, taken back, kept under a hold, swept when its debate is gone, and braked per account." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

One `git add` path. Never `git add -A` or `git add .`. Expected from the check: `LIMITS_CHECK_OK …`, exit 0; if it
refuses a line, report it and do not add the mark `limits-check-ok`. No figure of the budget in the commit message.
The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs.
