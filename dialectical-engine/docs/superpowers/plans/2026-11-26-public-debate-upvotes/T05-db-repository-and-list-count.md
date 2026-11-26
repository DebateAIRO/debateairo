### Task T05: Db repository and the count in `listPublicRefs`

The database package's side of upvotes (design §7.1, §7.2): one small repository that calls 0193's three request
functions (cast, withdraw, "which of these have I upvoted"), and the public list's read carrying each listed
debate's count. No route, no wiring in `main.ts`, no contract change: T07 does those.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: **T01**. May run alongside T02 and T06 (no shared file; this task only RUNS
`tests/architecture/investigation-reports-0136-contract.test.ts`, which T06 edits: if T06 shares your tree and that
file is red in the middle of T06's count pins, run it again when T06 has committed). T16 later appends a class to
this task's new file and two cases to its integration test, so T16 starts after this task is committed. If another
task shares your working tree, run your typecheck and commit steps while no other task is in the middle of an
edit, and read every `git status` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `packages/db/src/public-debate-upvote.ts`
- Create: `tests/integration/public-debate-upvotes-repository.test.ts`
- Modify: `packages/db/src/investigation-reports.ts:2-15` (the re-export block; one line added after line 15)
- Modify: `packages/db/src/publication.ts:682-711` (`listPublicRefs`)
- Modify: `tests/integration/s8-publication-database.test.ts:966` (one strict `toEqual`)
- Test: `tests/integration/public-debate-upvotes-repository.test.ts`, `tests/integration/s8-publication-database.test.ts`

**Interfaces:**
- Consumes, from T01 (step `migrations/0193_public_debate_upvotes.sql`, applied by `migrate(pool)`):
  - `identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb`:
    `{"outcome":"CAST"|"ALREADY","upvotes":<integer>}` or `{"outcome":"NOT_PUBLIC","upvotes":null}`. Raises
    `22023 PUBLIC_DEBATE_UPVOTE_INVALID` (a null argument), `42501 REQUEST_OWNER_MISMATCH` (the owner is not the
    connection's session), `22023 PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID` (the account is not `active`).
  - `identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb`:
    `{"outcome":"WITHDRAWN"|"NONE","upvotes":<integer, or null when the debate is not public now>}`. Same first
    two refusals; no account-state check.
  - `identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]`: the asked
    refs this account upvoted, sorted, an empty array when none, no public-now filter; more than 100 asked raises
    `22023 PUBLIC_DEBATE_UPVOTE_INVALID`.
  - `identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb`:
    `[{"publication_ref":uuid,"upvotes":integer}]`, one entry per distinct asked ref that is public now (0 when no
    votes); more than 100 asked raises `22023 PUBLIC_DEBATE_UPVOTE_INVALID`.
  - The first three are granted to `debateai_billing_runtime` only (the API's request login). The count reader is
    granted to `debateai_rls_all_accounts` only (the API's system login).
- Produces, for T07 (routes and `publications.list()`), T08 (end-to-end flow) and T16 (the sweep, which adds a second
  class to the same new file):
  - `@debateai/db` exports, through `packages/db/src/investigation-reports.ts`:
    ```ts
    export type PublicDebateUpvoteCast = Readonly<{ outcome: "CAST" | "ALREADY" | "NOT_PUBLIC" | "ACCOUNT_INVALID"; upvotes: number | null }>;
    export type PublicDebateUpvoteWithdrawn = Readonly<{ outcome: "WITHDRAWN" | "NONE"; upvotes: number | null }>;
    export class PostgresPublicDebateUpvoteRepository {
      constructor(pool: Pool);
      cast(ownerRef: string, publicationRef: string): Promise<PublicDebateUpvoteCast>;
      withdraw(ownerRef: string, publicationRef: string): Promise<PublicDebateUpvoteWithdrawn>;
      readOwn(ownerRef: string, publicationRefs: readonly string[]): Promise<readonly string[]>;
    }
    ```
  - `PostgresPublicationRepository.listPublicRefs(limit: number, offset: number): Promise<Readonly<{ refs: readonly string[]; total: number; upvotes: Readonly<Record<string, number>> }>>`.
    `upvotes` is keyed by `publication_ref` and holds exactly the entries the count reader answered; `{}` when
    `refs` is empty. A listed ref may be missing from it (the debate stopped being public between the two
    statements), so T07 reads it as `page.upvotes?.[ref] ?? 0`.

**Before you start:**

Read these as templates.
- `packages/db/src/public-flag.ts:28-46`: a repository that only calls definers. Copy the constructor, the private
  `one(sql, values)` helper (`SELECT … AS value`, `rows[0]?.value`) and the `$n::uuid` casts.
- `apps/api/src/saved-questions/store.ts:97-108`: how one named database refusal is recognised by `code` and
  `message` on the caught error and every other error is rethrown as it came. Copy the shape for `cast`.
- `tests/integration/free-debate-refused-by-check-0189.test.ts:27-30`, `:48-50`, `:134-149`: the harness. The API's
  request login is `logins.apiPools().runtime`; a repository call is made as the product makes it with
  `inAccountRequest(token, fn)`; `beforeAll` and `afterAll` as written there.
- `tests/integration/security-review-hardening-database.test.ts:79-87` (`seeded`), `:102` (`pubEnvelope`),
  `:104-113` (`publish`), `:115-118` (`unpublish`): how a debate is made public and private again with made-up
  rows. Copy these four and a file-local `let sequence = 9_930_000;` (`at_seq` is unique,
  `migrations/0039_publication_visibility.sql:77`).

Traps.
- `packages/db/src/index.ts` is byte-pinned (`tools/orphan-audit/src/index.ts:678` holds its sha256, `:744` refuses
  any other). Do not open it for writing. The export goes in `packages/db/src/investigation-reports.ts`, which reaches
  the index through `packages/db/src/investigations.ts:4`. Its sha256 must stay
  `23f8cdf29c8238a47cce937f75806904965cc3543ec96160352bd2c9b7081fb5` (checked in step 10).
- No `crossAccount(` and no `crossAccountPool(` in the new file. The three methods must run on the caller's own
  request connection. Inside a frame, or outside any request, a statement goes to the system login, where
  `identity.request_owner_matches` is true for every owner (`migrations/0171_security_review_hardening.sql:411-416`).
  `tests/architecture/rls-db-cross-account-sites.test.ts:30-34` pins the three X10 sites by method name; this task
  adds no site (a second statement inside the existing frame of `listPublicRefs` is not a new site).
- The count reader is the opposite: the request login cannot execute it. It is called only inside the existing
  `crossAccount("X10", …)` frame at `packages/db/src/publication.ts:686`.
- No statement in either file names the table `identity.public_debate_upvote`. No login holds a right on it.
- The count reader refuses more than 100 refs. `listPublicRefs` hands it the page's refs as they are: no chunking,
  no catch. The only product caller caps `limit` at 100 (`apps/api/src/index.ts:4250`).
- In the test file, never query `database.pool` inside `inAccountRequest`: the harness refuses its superuser inside
  a request (`tests/support/testDatabase.ts:240-245`). Seed and read back outside. Do not add the file to
  `tests/support/master-key-files.txt`.
- In the test file, every call of `cast`, `withdraw` and `readOwn` on the real pool is inside `asking(…)`. Outside a
  request the same call would run on the system login and pass for any owner.
- Fakes elsewhere return `{ refs, total }` with no `upvotes`, cast through `unknown`
  (`tests/unit/s8-publication.test.ts:250-253`, `tests/unit/nv07-public-read-hold.test.ts:13`,
  `tests/render/m6-library-floor.test.tsx:94`). They are not edited and must stay green.
- Do not export an upper-case numeric constant (the source audit refuses it, `tools/orphan-audit/src/index.ts:887`).
- Not this task's files: `tests/support/shipped-corpus.manifest.txt` and `tests/ci-integration-auth.txt` (T15 alone
  edits them), `apps/api/src/**` (T07), the sweep class `PostgresPublicDebateUpvoteSweepRepository` (T16). So after
  this task `tests/unit/s1-1-depth-contract.test.ts` reports the new file under `added` until T15; that is expected.

- [ ] **Step 1: Confirm T01's step is in the tree**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -En "CREATE OR REPLACE FUNCTION identity\.(cast_public_debate_upvote|withdraw_public_debate_upvote|read_own_public_debate_upvotes|read_public_debate_upvote_counts)\(" migrations/0193_public_debate_upvotes.sql
```

Expected: four lines, one per function. The cast and withdraw functions return `jsonb` (not `text`). If the file is missing or either
returns `text`, stop and report: T01 has not landed in the fixed form.

- [ ] **Step 2: Write the new test file**

`tests/integration/public-debate-upvotes-repository.test.ts`. First line `// tests/integration/public-debate-upvotes-repository.test.ts`,
then a short comment saying what it proves and "Data is made up." Imports: `randomUUID` from `node:crypto`;
`afterAll, beforeAll, describe, expect, it, vi` from `vitest`; `type AuditContextHasher` from
`../../packages/crypto/src/index.js`; `migrate, PostgresPublicDebateUpvoteRepository, PostgresPublicationRepository,
type Pool` from `@debateai/db`; `inAccountRequest, provisionRlsLogins, seedSessionAccount, type RlsLogins,
type RlsTestAccount` from `../support/rls-logins.js`; `startTestDatabase, type TestDatabase` from
`../support/testDatabase.js`.

Harness (`seeded`, `pubEnvelope`, `publish` and `unpublish` copied from the template lines above, unchanged):

```ts
const HASHER = Object.freeze({ hashSourceIp: async () => "33".repeat(32), hashUserAgent: async () => "44".repeat(32) }) as unknown as AuditContextHasher;
const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
let database: TestDatabase;
let logins: RlsLogins;
/** The API's request login with its system twin as target, as main.ts builds `pool`. */
let request: Pool;
let upvotes: PostgresPublicDebateUpvoteRepository;
let publications: PostgresPublicationRepository;
let sequence = 9_930_000;

const person = (label: string): Promise<RlsTestAccount> => seedSessionAccount(database.pool, `upvote-${label}`);
/** `fn` inside `who`'s own request (null: a request with no session). */
const asking = <T>(who: RlsTestAccount | null, fn: () => Promise<T>): Promise<T> => inAccountRequest(who?.token ?? null, fn);
const rows = async (ref: string): Promise<number> => (await database.pool.query<{ n: number }>(
  "SELECT count(*)::int AS n FROM identity.public_debate_upvote WHERE publication_ref=$1", [ref])).rows[0]!.n;
const refused = async (run: () => Promise<unknown>): Promise<unknown> => { try { await run(); return null; } catch (error) { return error; } };
const fakePool = (query: (...args: unknown[]) => unknown): Pool => ({ query }) as unknown as Pool;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  request = logins.apiPools().runtime;
  upvotes = new PostgresPublicDebateUpvoteRepository(request);
  publications = new PostgresPublicationRepository(request, HASHER);
}, 600_000);
afterAll(async () => { await logins?.end(); await database?.stop(); });
```

Cases, with these names and assertions:

```ts
describe("PostgresPublicDebateUpvoteRepository on the API's request login", () => {
  it("cast answers CAST then ALREADY with the fresh count, and a person may upvote their own debate", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    expect(await asking(dan, () => upvotes.cast(dan.ownerRef, ref))).toEqual({ outcome: "CAST", upvotes: 1 });
    expect(await asking(dan, () => upvotes.cast(dan.ownerRef, ref))).toEqual({ outcome: "ALREADY", upvotes: 1 });
    expect(await asking(ana, () => upvotes.cast(ana.ownerRef, ref))).toEqual({ outcome: "CAST", upvotes: 2 });
    expect(await rows(ref)).toBe(2);
  });
  it("withdraw answers WITHDRAWN then NONE with the fresh count, and still works, with a null count, once the debate is private", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    await asking(ana, () => upvotes.cast(ana.ownerRef, ref));
    await asking(dan, () => upvotes.cast(dan.ownerRef, ref));
    expect(await asking(dan, () => upvotes.withdraw(dan.ownerRef, ref))).toEqual({ outcome: "WITHDRAWN", upvotes: 1 });
    expect(await asking(dan, () => upvotes.withdraw(dan.ownerRef, ref))).toEqual({ outcome: "NONE", upvotes: 1 });
    await unpublish(ana.runId, ref);
    expect(await asking(ana, () => upvotes.withdraw(ana.ownerRef, ref))).toEqual({ outcome: "WITHDRAWN", upvotes: null });
    expect(await rows(ref)).toBe(0);
  });
  it("cast answers NOT_PUBLIC with a null count for a guessed link and for a debate made private, and stores nothing", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    await unpublish(ana.runId, ref);
    for (const target of [randomUUID(), ref]) {
      expect(await asking(dan, () => upvotes.cast(dan.ownerRef, target))).toEqual({ outcome: "NOT_PUBLIC", upvotes: null });
    }
    expect(await rows(ref)).toBe(0);
  });
  it("cast answers ACCOUNT_INVALID with a null count for an account that is not active, and stores nothing", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    // The session still names the account (rls.context_user_id reads the session row only), so the owner check passes.
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [dan.userId]);
    expect(await asking(dan, () => upvotes.cast(dan.ownerRef, ref))).toEqual({ outcome: "ACCOUNT_INVALID", upvotes: null });
    expect(await rows(ref)).toBe(0);
  });
  it("readOwn names the asked debates this account upvoted, sorted, whatever their state, and no one else's", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const [first, second] = [await publish(ana.runId), await publish(dan.runId)];
    await asking(dan, () => upvotes.cast(dan.ownerRef, first));
    await asking(dan, () => upvotes.cast(dan.ownerRef, second));
    await asking(ana, () => upvotes.cast(ana.ownerRef, first));
    await unpublish(dan.runId, second);
    const asked = [second, randomUUID(), first];
    expect(await asking(dan, () => upvotes.readOwn(dan.ownerRef, asked))).toEqual([first, second].sort());
    expect(await asking(ana, () => upvotes.readOwn(ana.ownerRef, asked))).toEqual([first]);
    expect(await asking(ana, () => upvotes.readOwn(ana.ownerRef, [second]))).toEqual([]);
  });
  it("another account's owner, and a request with no session, are refused by the database and the error comes back as it was", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    for (const who of [dan, null]) {
      expect(await refused(() => asking(who, () => upvotes.cast(ana.ownerRef, ref)))).toMatchObject(MISMATCH);
      expect(await refused(() => asking(who, () => upvotes.withdraw(ana.ownerRef, ref)))).toMatchObject(MISMATCH);
      expect(await refused(() => asking(who, () => upvotes.readOwn(ana.ownerRef, [ref])))).toMatchObject(MISMATCH);
    }
    expect(await rows(ref)).toBe(0);
  });
});

describe("PostgresPublicDebateUpvoteRepository, the parts no database decides", () => {
  const [owner, ref] = [randomUUID(), randomUUID()];
  const over = (query: (...args: unknown[]) => unknown) => new PostgresPublicDebateUpvoteRepository(fakePool(query));
  it("readOwn with an empty list answers [] and sends nothing", async () => {
    const query = vi.fn();
    expect(await over(query).readOwn(owner, [])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
  it("cast answers ACCOUNT_INVALID when the voter's key is gone (23503); withdraw does not; any other error is rethrown", async () => {
    const gone = Object.assign(new Error("violates foreign key constraint"), { code: "23503" });
    const invalid = Object.assign(new Error("PUBLIC_DEBATE_UPVOTE_INVALID"), { code: "22023" });
    expect(await over(async () => { throw gone; }).cast(owner, ref)).toEqual({ outcome: "ACCOUNT_INVALID", upvotes: null });
    await expect(over(async () => { throw gone; }).withdraw(owner, ref)).rejects.toBe(gone);
    await expect(over(async () => { throw invalid; }).cast(owner, ref)).rejects.toBe(invalid);
  });
});

describe("PostgresPublicationRepository.listPublicRefs with the counts", () => {
  it("carries the count of every listed debate, the same for every caller", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const [voted, quiet] = [await publish(ana.runId), await publish(dan.runId)];
    await asking(ana, () => upvotes.cast(ana.ownerRef, voted));
    await asking(dan, () => upvotes.cast(dan.ownerRef, voted));
    const anonymous = await asking(null, () => publications.listPublicRefs(100, 0));
    expect(anonymous.refs).toEqual(expect.arrayContaining([voted, quiet]));
    expect(Object.keys(anonymous.upvotes).sort()).toEqual([...anonymous.refs].sort());
    expect(anonymous.upvotes[voted]).toBe(2);
    expect(anonymous.upvotes[quiet]).toBe(0);
    expect(Object.isFrozen(anonymous.upvotes)).toBe(true);
    expect(await asking(dan, () => publications.listPublicRefs(100, 0))).toEqual(anonymous);
    expect(await publications.listPublicRefs(100, 0)).toEqual(anonymous);
  });
  it("an empty page carries {} and asks for no counts", async () => {
    expect(await asking(null, () => publications.listPublicRefs(10, 1_000))).toMatchObject({ refs: [], upvotes: {} });
    const query = vi.fn(async () => ({ rows: [{ publication_ref: null, total: "3" }] }));
    expect(await new PostgresPublicationRepository(fakePool(query), HASHER).listPublicRefs(10, 50)).toEqual({ refs: [], total: 3, upvotes: {} });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("asks for the page's refs in one statement and keeps only the counts the database answered", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ publication_ref: a, total: "2" }, { publication_ref: b, total: "2" }] })
      .mockResolvedValueOnce({ rows: [{ value: [{ publication_ref: a, upvotes: 4 }] }] });
    expect(await new PostgresPublicationRepository(fakePool(query), HASHER).listPublicRefs(2, 0)).toEqual({ refs: [a, b], total: 2, upvotes: { [a]: 4 } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]).toEqual([expect.stringContaining("identity.read_public_debate_upvote_counts($1::uuid[])"), [[a, b]]]);
  });
});
```

- [ ] **Step 3: Run it and see it red**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/public-debate-upvotes-repository.test.ts
```

Expected: `Test Files  1 failed (1)`, no test passes. The reason names the missing class
(`PostgresPublicDebateUpvoteRepository is not a constructor`, or a missing-export error for that name). A failure
that says `function identity.cast_public_debate_upvote… does not exist` means step 1 was skipped.

- [ ] **Step 4: Create the repository file**

`packages/db/src/public-debate-upvote.ts`. `import type { Pool } from "pg";` and nothing else. One doc comment
above the class: upvotes on public debates (migration 0193), through its definers only; on the API's request pool
under the caller's session; never inside a cross-account frame. The two exported types and the class exactly as in
**Produces**. Statements, each read as `rows[0]?.value`:

| Method | Statement | Parameters |
|---|---|---|
| `cast` | `SELECT identity.cast_public_debate_upvote($1::uuid,$2::uuid) AS value` | `[ownerRef, publicationRef]` |
| `withdraw` | `SELECT identity.withdraw_public_debate_upvote($1::uuid,$2::uuid) AS value` | `[ownerRef, publicationRef]` |
| `readOwn` | `SELECT identity.read_own_public_debate_upvotes($1::uuid,$2::uuid[]) AS value` | `[ownerRef, [...publicationRefs]]` |

Rules the tests pin:
- `cast` catches one kind of error and answers `{ outcome: "ACCOUNT_INVALID", upvotes: null }`: an error object
  whose `message` is `"PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID"` or whose `code` is `"23503"`. Every other error is
  rethrown as the same object. `withdraw` and `readOwn` catch nothing.
- `readOwn` with `publicationRefs.length === 0` returns a frozen `[]` before any query.
- `cast` and `withdraw` return a frozen `{ outcome, upvotes }` taken from the answer; `readOwn` returns a frozen
  copy of the answered array.

- [ ] **Step 5: Register the export**

Closed list: the re-export block of `packages/db/src/investigation-reports.ts:2-15`. Add directly after line 15
(`export * from "./path-suggestions.js";`), before the `import type { InvestigationRead }` line:

```ts
// 0193: upvotes on public debates.
export * from "./public-debate-upvote.js";
```

- [ ] **Step 6: Run the new file: the repository cases pass, the list cases are still red**

Same command as step 3. Expected: `Tests  3 failed | 8 passed (11)`. The three failures are the three cases of
`PostgresPublicationRepository.listPublicRefs with the counts` (`upvotes` is `undefined`). The eight others pass.

- [ ] **Step 7: Move the one strict assertion of the existing list test, and see it red**

`tests/integration/s8-publication-database.test.ts:966` becomes:

```ts
    expect(indexAfter).toEqual({ refs: [],total:indexBefore.total+1,upvotes:{} });
```

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/s8-publication-database.test.ts
```

Expected: `Tests  1 failed | 64 passed (65)`. The failing test is `defaults every event-less run private and keeps a
published snapshot readable after identity deletion`; the diff shows `upvotes` missing from what was received.

- [ ] **Step 8: Add the counts to `listPublicRefs`**

`packages/db/src/publication.ts:682-711`. The return type gains `upvotes: Readonly<Record<string, number>>;` as its
third member. The page statement (lines 687-704) is not changed by one character. Inside the same
`crossAccount("X10", …)` callback, after the page statement and only when the page holds at least one ref, one more
statement on `this.pool`:

```sql
SELECT identity.read_public_debate_upvote_counts($1::uuid[]) AS value
```

with the page's refs as its one parameter, in page order. `upvotes` is a frozen object built from the answer's
entries, `publication_ref` to `upvotes`; a missing or null answer gives `{}`; no entry is invented for a ref the
answer left out. With an empty page there is no second statement and `upvotes` is a frozen `{}`. Add one comment
line above the statement: the count is 0193's, the marker's alone, so it is read here on the system login and not
by the request login.

- [ ] **Step 9: Run both files green**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/public-debate-upvotes-repository.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/s8-publication-database.test.ts
```

Expected: `Tests  11 passed (11)` and `Tests  65 passed (65)`.

- [ ] **Step 10: Verification recipe**

Each line is run with the prefix. Counts are this tree's, measured before the change.

| Command | Expected |
|---|---|
| `pnpm run typecheck` | exit 0, no `error TS` line |
| `pnpm exec vitest run tests/integration/public-debate-upvotes-repository.test.ts` | `Tests  11 passed (11)` |
| `pnpm exec vitest run tests/integration/s8-publication-database.test.ts` | `Tests  65 passed (65)` |
| `pnpm exec vitest run tests/integration/rls-readers.test.ts` | `Tests  39 passed (39)`, file unedited (its X10 case runs `listPublicRefs(100, 0)` on the dev system login, so it proves that login may call the count reader) |
| `pnpm exec vitest run tests/architecture/rls-db-cross-account-sites.test.ts` | `Tests  2 passed (2)`, file unedited (red here means a `crossAccount` site was added) |
| `pnpm exec vitest run tests/architecture/investigation-reports-0136-contract.test.ts` | `Tests  14 passed (14)`, file unedited |
| `pnpm exec vitest run tests/unit/s8-publication.test.ts` | `Tests  34 passed (34)`, file unedited |
| `pnpm exec vitest run tests/unit/nv07-public-read-hold.test.ts` | `Tests  3 passed (3)`, file unedited |
| `pnpm exec vitest run tests/render/m6-library-floor.test.tsx` | `Tests  4 passed (4)`, file unedited |
| `pnpm exec vitest run tests/architecture/scaffold.test.ts` | `Tests  1 failed \| 28 passed (29)`: the one known red of the untouched tree (`dev's F31 debt: … obs-capture edge`), nothing new |
| `shasum -a 256 packages/db/src/index.ts` | `23f8cdf29c8238a47cce937f75806904965cc3543ec96160352bd2c9b7081fb5` |
| `grep -c "crossAccount" packages/db/src/public-debate-upvote.ts` | `0` |
| `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` | `Tests  1 failed \| 1010 passed (1011)`; the failure is the shipped-file manifest: `missing` is `[]` and `added` holds only files this slice created, `packages/db/src/public-debate-upvote.ts` among them. T15 lists them; do not edit the manifest here |
| `git status --short` | the five paths of this task and nothing else of yours (the `??` lines under `docs/superpowers/` were there before and are not staged) |

- [ ] **Step 11: Stage the five paths and run the limits check on them**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add packages/db/src/public-debate-upvote.ts packages/db/src/investigation-reports.ts packages/db/src/publication.ts tests/integration/s8-publication-database.test.ts tests/integration/public-debate-upvotes-repository.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
```

Never `git add -A` or `git add .`: the tree holds untracked plan and design files that are not this task's.
Expected from the check: `LIMITS_CHECK_OK <n> added line(s) read.`, exit 0 (a `LIMITS_CHECK_NO_LIST` note before it
is normal on this machine).

- [ ] **Step 12: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The database package casts, withdraws and reads an account's own upvotes on the request login, and the public list's read carries each listed debate's count." -m "A new repository calls 0193's three request functions and nothing else; an account that is not active, or whose row went while it voted, answers ACCOUNT_INVALID instead of an error. listPublicRefs asks 0193's count reader for the page's refs inside its existing cross-account frame, so no new site is opened and the request login never reads a count. The repository is exported beside the Report button's, because the package index's bytes are pinned." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

No figure in the commit message (the pull request's limits check reads it). The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs.
