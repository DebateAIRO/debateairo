### Task T02: Database pins and behaviour test for step 0193

Step 0193 (T01) adds one table and six functions. Four closed lists compare the code with the live schema and
must name them. One new integration test proves, on the real logins, how upvotes are cast, counted, taken
back, exported, swept and erased (design §5, §7.1, §7.5). This task writes no product code and no SQL.

Depends on: **T01**. May run alongside T03, T04, T05, T06, T09, T10. Touches no file of any other task. If another
task shares your working tree, run your typecheck, `generate:contract` and commit steps while no other task is in
the middle of an edit, and read every `git status` and typecheck expectation below as "nothing else of yours".

Every command is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

**Files:**
- Create: `tests/integration/public-debate-upvotes-0193.test.ts`
- Modify: `docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json:3696-3697`
  (four entries after 0192's entry, before the `]` that closes `privilegeDisclosures`)
- Modify: `tests/architecture/p3-production-database-principals.test.ts:1827-1828` (the same four entries in the
  literal) and `:2436-2437` (a new `it`, after 0192's case and before 0125's)
- Modify: `tests/integration/security-review-hardening-database.test.ts:2178-2179` (`ASKS_CONNECTION`, three signatures)
- Modify: `tests/integration/identity-database.test.ts:124` (the table inventory)
- Modify: `tests/n1-baseline.json:26-27` (`setAside`, a third entry)
- Test: the new file, plus `tests/architecture/p3-production-database-principals.test.ts`,
  `tests/architecture/n1-baseline.test.ts`, `tests/integration/identity-database.test.ts`,
  `tests/integration/security-review-hardening-database.test.ts`

Not yours: `tests/ci-integration-auth.txt` (T15 alone lists the new test there), `tests/support/master-key-files.txt`,
anything under `migrations/`, `packages/` or `apps/`.

**Interfaces:**
- Consumes, from T01 (`migrations/0193_public_debate_upvotes.sql`, applied by `migrate()`):
  - Table `identity.public_debate_upvote` and the five functions of design §7.1, with the returns given there.
    Their signatures as PostgreSQL prints them: `identity.cast_public_debate_upvote(uuid,uuid)`,
    `identity.withdraw_public_debate_upvote(uuid,uuid)`, `identity.read_own_public_debate_upvotes(uuid,uuid[])`,
    `identity.read_public_debate_upvote_counts(uuid[])`, `identity.read_data_export_public_debate_upvotes(uuid,uuid)`.
  - The sixth: `identity.delete_gone_public_debate_upvotes(integer)` → `integer`, the rows deleted, at most
    `p_limit` (1 to 1000). This test calls it with 1 and with 100. "Gone for good" means the page is no longer its
    debate's current publication (`core.publication_is_current`, which ignores holds): a debate made private, or
    published again under a new link, is swept; one that is only held never is; one held and then made private is.
    A vote another transaction holds is skipped, not waited for.
  - Refusals. Cast, in this order: a null argument `22023 PUBLIC_DEBATE_UPVOTE_INVALID`; not the connection's own
    owner `42501 REQUEST_OWNER_MISMATCH`; account not active `22023 PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID`. Withdraw
    and the own-votes read: the first two. Over 100 refs asked (own-votes, counts): `22023 PUBLIC_DEBATE_UPVOTE_INVALID`.
  - Exactly six `GRANT` lines, one role each: the first three functions to `debateai_billing_runtime`, the count
    and the sweep to `debateai_rls_all_accounts`, the export reader to `debateai_data_export_worker`.
- Produces: nothing another task imports. T15 adds `tests/integration/public-debate-upvotes-0193.test.ts` to the CI list.

**Before you start:**

Templates.
- `tests/integration/registration-country-0192.test.ts` (100 lines): the harness. Imports and pools `:6-25`,
  `beforeAll`/`afterAll` `:32-48`, the request login on a connection of its own `:63-65`, the grantee query
  `:69-72`, the production logins `:93-98`.
- `tests/integration/security-review-hardening-database.test.ts:64-118`: `sqlError`, `seeded`, `run`, `publish`,
  `unpublish`. Copy them word for word. `unpublish` writes the `PRIVATE` row that both the owner's unpublish and
  0190's takedown write (`migrations/0190_check_deletes_public_debate.sql:241-247`).
- `tests/integration/moderation-final-outcome-0176.test.ts:41` and `:87-97`: `sealed` and `step(ref, "HIDE" | "REPUBLISH")`,
  the staff hold and its lifting. Keep the `moderation_ground` row it writes beside a `HIDE`.
- `tests/integration/ask-clarify-charge-database.test.ts:82-88`: an account with one live session that a test may
  delete. `tests/integration/saved-questions-database.test.ts:78-84`: `leasedExport`.
- `tests/architecture/p3-production-database-principals.test.ts:2421-2436` (0192's case) and `:2546-2564` (0136's:
  the export worker in `disclosed`, the total `GRANT` count, no erasure grant).

Traps.
- The harness superuser (`database.pool`) is refused inside a request (`R21_SUPERUSER_POOL_IN_REQUEST`,
  `tests/support/testDatabase.ts:240-246`). Every fixture and read-back runs outside `inAccountRequest`. Do not
  add the new file to `tests/support/master-key-files.txt`.
- `logins.apiPools().runtime` sends a statement made OUTSIDE a request to the system login, where
  `identity.request_owner_matches` is true for every owner (`migrations/0171_security_review_hardening.sql:411-416`).
  Call cast, withdraw and the own-votes read on it only through `inAccountRequest`. "No session" is
  `inAccountRequest(null, …)` or a pool with no target (`createPool(logins.url("DATABASE_URL"), { max: 1 })`).
- The census (`security-review-hardening-database.test.ts:2944-2963`) lists only what the two request logins may
  execute. The count reader, the sweep and the export reader are not theirs: do NOT add those three. Do not
  touch `ASKS`, `GATED`, `PUBLIC`, `LEFT_ALONE`, `MOVED` or the `ARRIVED_…` lists.
- The JSON and the test literal are compared with `toEqual` (`p3-…test.ts:669`): same entries, same order, same
  order of grants.
- `tests/n1-baseline.json` is read by a CI job that runs the RELEASED commit's inventory test against this
  schema. The entry's `name` is that test's full name, character for character (checked: it is the same at the
  released commit `84891f69c`). Nothing local goes red without the entry; only the pull request shows it.
- If a behaviour case fails, the SQL is wrong, not the expected value: every value below is the spec's. Stop and
  report. Do not edit `migrations/0193_public_debate_upvotes.sql` (its digest is pinned) and do not weaken the case.
- Decided, not a gap to close here: "a vote leaves with its account" is proven by deleting the `identity."user"` row
  on the harness superuser, the statement the erasure's last step runs
  (`migrations/0110_account_erasure_public_debates.sql:747`). That is the house precedent (saved questions, D8). No
  case runs `identity.finalize_account_erasure` on the erasure login with a vote present, and "gone for good" is
  staged with the fixture's `PRIVATE` row, not with 0190's takedown function. Do not add either.

- [ ] **Step 1: Check that T01 is in the tree**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "^GRANT " migrations/0193_public_debate_upvotes.sql`
Expected: `6`. A missing file or another count means T01 is not done: stop.
Then, once: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract`

- [ ] **Step 2: Write the failing disclosure case**

In `tests/architecture/p3-production-database-principals.test.ts`, after the `});` that closes 0192's case (`:2436`),
add this case. It is 0192's (`:2421-2436`) with this step's file, the export worker added to `disclosed` (as
0136's case has it, `:2549`; without it the export reader's `GRANT` would not be compared), and its own closing
assertions:

```ts
it("discloses exactly 0193's grants: the vote, its withdrawal and the own-votes read to the API's billing role, the count and the sweep to the cross-account marker, the export reader to the export worker", async () => {
  const SOURCE = "migrations/0193_public_debate_upvotes.sql";
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
  const sql = await readFile(SOURCE, "utf8");
  const disclosed = "debateai_runtime|debateai_staff_security_owner|debateai_billing_runtime|debateai_authorization_runtime|debateai_rls_all_accounts|debateai_erasure_runtime|debateai_data_export_worker";
  // As for 0192: every GRANT line naming one of the disclosed roles names it alone.
  expect([...sql.matchAll(/^GRANT [^\n]+;$/gm)].map(([statement]) => statement)
    .filter(statement => new RegExp(`\\bTO\\b.*\\b(?:${disclosed})\\b`, "u").test(statement)
      && !new RegExp(` TO (?:${disclosed});$`, "u").test(statement))).toEqual([]);
  const actual = [...sql.matchAll(new RegExp(`^GRANT [^\\n]+ TO (?:${disclosed});$`, "gm"))]
    .map(([statement]) => statement.replace(/\s+/gu, " ").trim()).sort();
  const declared = manifest.privilegeDisclosures.filter(entry => entry.source === SOURCE)
    .flatMap(({ roleName, grants }) => grants.map(grant => `GRANT ${grant} TO ${roleName};`)).sort();
  expect(actual).toEqual(declared);
  expect(declared).toEqual([
    "GRANT EXECUTE ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;",
    "GRANT EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer) TO debateai_rls_all_accounts;",
    "GRANT EXECUTE ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid) TO debateai_data_export_worker;",
    "GRANT EXECUTE ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[]) TO debateai_billing_runtime;",
    "GRANT EXECUTE ON FUNCTION identity.read_public_debate_upvote_counts(uuid[]) TO debateai_rls_all_accounts;",
    "GRANT EXECUTE ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;"
  ]);
  // Six GRANT lines in the whole file, every one disclosed; nothing for the erasure login, whose functions the API counts at its start.
  expect([...sql.matchAll(/^GRANT [^\n]+;$/gm)]).toHaveLength(6);
  expect(sql).not.toMatch(/^GRANT [^\n]+ TO debateai_erasure_runtime;$/mu);
  // Four entries, by what each grant is for: the request's three, the list's count, the export, the timer's sweep.
  expect(manifest.privilegeDisclosures.filter(entry => entry.source === SOURCE).map(entry => entry.roleName))
    .toEqual(["debateai_billing_runtime", "debateai_rls_all_accounts", "debateai_data_export_worker", "debateai_rls_all_accounts"]);
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/p3-production-database-principals.test.ts`
Expected: `Tests  1 failed | 27 passed (28)`. The new case fails at `expect(actual).toEqual(declared)`: six lines against `[]`.

- [ ] **Step 4: Disclose the grants in the JSON**

In `P3-01-production-database-principals.json`, put a comma after the `}` on line 3696 and add four entries
before the `],` on line 3697. Each has the shape and indentation of 0192's entry (`:3690-3696`), with
`"source": "migrations/0193_public_debate_upvotes.sql"` and one grant per line. In this order:

| # | `roleName` | `grants`, in this order |
|---|---|---|
| 1 | `debateai_billing_runtime` | `EXECUTE ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid)`, `EXECUTE ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid)`, `EXECUTE ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[])` |
| 2 | `debateai_rls_all_accounts` | `EXECUTE ON FUNCTION identity.read_public_debate_upvote_counts(uuid[])` |
| 3 | `debateai_data_export_worker` | `EXECUTE ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid)` |
| 4 | `debateai_rls_all_accounts` | `EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer)` |

(A role may appear twice for one source: 0165's entries do.) Run the Step 3 command. Expected: still
`1 failed | 27 passed (28)`, but the failing case is now "defines the exact capability, ownership, service, and
connection-purpose inventory": the literal lacks the four entries.

- [ ] **Step 5: Add the same four entries to the test literal**

In `p3-production-database-principals.test.ts`, put a comma after the `}` on line 1827 and add the four entries
before the `]);` on line 1828, same order, same grants. Above each, one comment line saying who calls it, as
0190's and 0192's entries have (`:1811-1812`, `:1821-1822`): (1) "on the request login, inside the account's own
request; no table grant"; (2) "the API reads it on its system login inside the public list's own frame, X10";
(3) "behind 0128's lease gate, as 0162's reader"; (4) "the API calls it from a timer on its system login,
outside any request".

Run the Step 3 command. Expected: `Tests  28 passed (28)`.

- [ ] **Step 6: See the census fail, then name the three request functions**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/security-review-hardening-database.test.ts`
Expected (about 90 s): `Tests  1 failed | 77 passed (78)`. The failing case starts "the census sees every definer
either request login may EXECUTE"; its diff shows the three signatures below as not named.

In `ASKS_CONNECTION`, directly after the line `"identity.read_registration_country(uuid)",` (`:2178`), add:

```ts
    // 0193: a person's upvote of a public debate, its withdrawal, and which of the listed debates the account upvoted; each asks
    // identity.request_owner_matches before anything else, as 0192's read does.
    "identity.cast_public_debate_upvote(uuid,uuid)", "identity.withdraw_public_debate_upvote(uuid,uuid)",
    "identity.read_own_public_debate_upvotes(uuid,uuid[])",
```

Run the same command. Expected: `Tests  78 passed (78)`. That also covers the owner-taking rule (`:1229-1243`):
`ARRIVED_OWNER_TAKING` (`:280`) did not grow, so each of the three asks the session's owner.

- [ ] **Step 7: See the inventory fail, then name the table**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/identity-database.test.ts`
Expected: `Tests  1 failed | 3 passed (4)`; the diff shows `public_debate_upvote` between `public_debate_update` and `public_dig_input`.

Replace line 124 of `tests/integration/identity-database.test.ts` with:

```ts
      "public_climb_done", "public_contribution", "public_contribution_check", "public_debate_report", "public_debate_update",
      // 0193 upvotes on public debates: one row per account per public debate; the row leaves with the account.
      "public_debate_upvote",
      "public_dig_input",
```

Run the same command. Expected: `Tests  4 passed (4)`.

- [ ] **Step 8: Set the released inventory test aside for the N-1 job**

In `tests/n1-baseline.json`, put a comma after the `}` on line 26 and add, before the `],` on line 27:

```json
    {
      "name": "tests/integration/identity-database.test.ts > S2 identity schema on real PostgreSQL > creates the exact identity table inventory with the required contact, audit, and erasure column types",
      "reason": "pins the exact list of identity tables its own migration chain creates; a database migrated ahead holds the tables later expand steps add (0193, the public debate upvotes: 1), which the released code never reads"
    }
```

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/n1-baseline.test.ts`
Expected: `Tests  7 passed (7)` (it passed before too: the job that needs the entry runs only in CI).

- [ ] **Step 9: Write the behaviour test**

Create `tests/integration/public-debate-upvotes-0193.test.ts`. Header comment in the house style: what 0193 is;
every vote is cast on the API's request login inside the voter's own request; debates and holds are fixture rows
written as the product writes them; data is made up.

Set in `beforeAll` (timeout `600_000`), after `startTestDatabase()`, `migrate(database.pool)` and `provisionRlsLogins(database)`:

```ts
request = logins.apiPools().runtime;      // the API's request login, its system twin as target, as main.ts builds `pool`
system = logins.apiPools().system;        // the API's system login: it holds the cross-account marker
worker = logins.apiPools().dataExport;    // the export worker's login
ana = await seedSessionAccount(database.pool, "upvote-ana");   // ben and cal the same way
```

Helpers. Bodies are yours; names, signatures and each statement's text are fixed:

```ts
const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
const INVALID = { code: "22023", message: "PUBLIC_DEBATE_UPVOTE_INVALID" };
const ACCOUNT_INVALID = { code: "22023", message: "PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID" };
const LEASE_INVALID = { code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" };
const denied = (name: string) => ({ code: "42501", message: `permission denied for function ${name}` });
const NOT_PUBLIC = { outcome: "NOT_PUBLIC", upvotes: null };
type Vote = Readonly<{ outcome: string; upvotes: number | null }>;
type Count = Readonly<{ publication_ref: string; upvotes: number }>;
bare(key: Parameters<RlsLogins["url"]>[0], max = 1): Pool   // createPool(logins.url(key), { max }), pushed to `opened`
// On `pool`, inside the request of `token` (null: a request with no session):
cast(pool: Pool, token: string | null, ownerRef: string | null, ref: string | null): Promise<Vote>      // SELECT identity.cast_public_debate_upvote($1,$2) AS answer
withdraw(pool: Pool, token: string | null, ownerRef: string | null, ref: string | null): Promise<Vote>  // SELECT identity.withdraw_public_debate_upvote($1,$2) AS answer
own(pool: Pool, token: string | null, ownerRef: string, refs: readonly string[]): Promise<string[]>     // SELECT identity.read_own_public_debate_upvotes($1,$2::uuid[]) AS answer
// On `pool` as it is (the caller wraps it when it wants a request):
counts(pool: Pool, refs: readonly string[]): Promise<Count[]>   // SELECT identity.read_public_debate_upvote_counts($1::uuid[]) AS answer
sweep(pool: Pool, limit: number): Promise<number>               // SELECT identity.delete_gone_public_debate_upvotes($1) AS gone
exported(pool: Pool, exportId: string, lease: string): Promise<Array<Record<string, unknown>>>   // SELECT identity.read_data_export_public_debate_upvotes($1,$2) AS answer
// The public list's own path: the count asked inside site X10's frame of a request (packages/db/src/publication.ts:686).
const listCounts = (pool: Pool, token: string | null, refs: readonly string[]) => inAccountRequest(token, () => crossAccount("X10", () => counts(pool, refs)));
// Fixtures and read-backs, on database.pool, outside any request:
person(): Promise<{ userId: string; ownerRef: string; token: string }>         // ask-clarify-charge-database.test.ts:82-88
debate(owner: { ownerRef: string }): Promise<{ runId: string; ref: string }>   // run(owner), then publish(runId)
hold(ref) = step(ref, "HIDE"); release(ref) = step(ref, "REPUBLISH"); publish, unpublish, leasedExport as copied
votersOf(ref): Promise<string[]>       // SELECT owner_ref FROM identity.public_debate_upvote WHERE publication_ref=$1 ORDER BY owner_ref
votesBy(ownerRef): Promise<string[]>   // SELECT publication_ref FROM identity.public_debate_upvote WHERE owner_ref=$1 ORDER BY publication_ref
granteesOf(signature): Promise<string[]>   // the aclexplode query of registration-country-0192.test.ts:69-72
```

`crossAccount`, `createPool`, `migrate`, `assertAccountErasureDatabaseRole` and `type Pool` come from `@debateai/db`.
Start the fixtures' `sequence` at `9_930_000`. Every debate below is `await debate(ana)`; each case makes its
own. The cases, in this order, in one `describe("0193: upvotes on public debates, on the real logins", …)`.
The comment that opens a case is its setup; the lines after it are its assertions:

```ts
it("one vote per account per debate: CAST with the fresh count, ALREADY the second time, a person may upvote their own debate, and taking a vote back deletes the row", async () => {
  expect(await cast(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "CAST", upvotes: 1 });
  expect(await cast(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "ALREADY", upvotes: 1 });
  expect(await cast(request, ana.token, ana.ownerRef, ref)).toEqual({ outcome: "CAST", upvotes: 2 });   // ana's own debate
  expect(await votersOf(ref)).toEqual([ana.ownerRef, ben.ownerRef].sort());
  expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "WITHDRAWN", upvotes: 1 });
  expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "NONE", upvotes: 1 });
  expect(await votersOf(ref)).toEqual([ana.ownerRef]);
});
it("the own-votes read names the asked debates this account upvoted, sorted, whatever their state, and no one else's", async () => {
  // ben upvotes a and b, cal upvotes c; then unpublish(b).
  expect(await own(request, ben.token, ben.ownerRef, [c.ref, b.ref, a.ref, randomUUID()])).toEqual([a.ref, b.ref].sort());
  expect(await own(request, ben.token, ben.ownerRef, [c.ref])).toEqual([]);
  expect(await own(request, ben.token, ben.ownerRef, Array.from({ length: 100 }, () => randomUUID()))).toEqual([]);
  await expect(own(request, ben.token, ben.ownerRef, Array.from({ length: 101 }, () => randomUUID()))).rejects.toMatchObject(INVALID);
});
it("every kind of absence answers NOT_PUBLIC and stores nothing; a held debate keeps its votes and they count again when the hold is lifted", async () => {
  // gone: unpublished. moved: unpublished, then next = await publish(moved.runId). held: ben upvotes it, then hold(held.ref).
  for (const ref of [randomUUID(), gone.ref, moved.ref, held.ref]) {
    expect(await cast(request, cal.token, cal.ownerRef, ref), ref).toEqual(NOT_PUBLIC);
    expect(await votersOf(ref), ref).not.toContain(cal.ownerRef);
  }
  expect(await cast(request, cal.token, cal.ownerRef, next)).toEqual({ outcome: "CAST", upvotes: 1 });
  expect(await counts(system, [held.ref])).toEqual([]);
  expect(await votersOf(held.ref)).toEqual([ben.ownerRef]);
  await release(held.ref);
  expect(await counts(system, [held.ref])).toEqual([{ publication_ref: held.ref, upvotes: 1 }]);
  expect(await cast(request, cal.token, cal.ownerRef, held.ref)).toEqual({ outcome: "CAST", upvotes: 2 });
});
it("only the account's own request casts, withdraws or reads: every other connection is refused, and nothing is written or removed", async () => {
  // ana upvotes ref first.
  const others: ReadonlyArray<readonly [string, Pool, string | null]> = [["ben's session", request, ben.token], ["a request with no session", request, null],
    ["ana's revoked session", request, ana.revokedToken], ["ana's expired session", request, ana.expiredToken], ["the request login on its own connection", bare("DATABASE_URL"), null]];
  for (const [label, pool, token] of others) {
    await expect(cast(pool, token, ana.ownerRef, ref), label).rejects.toMatchObject(MISMATCH);
    await expect(withdraw(pool, token, ana.ownerRef, ref), label).rejects.toMatchObject(MISMATCH);
    await expect(own(pool, token, ana.ownerRef, [ref]), label).rejects.toMatchObject(MISMATCH);
  }
  expect(await votersOf(ref)).toEqual([ana.ownerRef]);
  await expect(cast(request, ana.token, null, ref)).rejects.toMatchObject(INVALID);
  await expect(cast(request, ana.token, ana.ownerRef, null)).rejects.toMatchObject(INVALID);
  await expect(withdraw(request, ana.token, ana.ownerRef, null)).rejects.toMatchObject(INVALID);
});
it("an account that is not active is refused a new vote, its earlier vote still counts, and it can still take it back", async () => {
  // sam = await person(); sam upvotes first.ref; then UPDATE identity."user" SET state='suspended' for sam, as 0110's prepare leaves it.
  await expect(cast(request, sam.token, sam.ownerRef, second.ref)).rejects.toMatchObject(ACCOUNT_INVALID);
  expect(await votersOf(second.ref)).toEqual([]);
  expect(await counts(system, [first.ref])).toEqual([{ publication_ref: first.ref, upvotes: 1 }]);
  expect(await withdraw(request, sam.token, sam.ownerRef, first.ref)).toEqual({ outcome: "WITHDRAWN", upvotes: 0 });
});
it("taking a vote back works when the debate is no longer public, and then answers no count", async () => {
  // ben upvotes gone.ref and held.ref; then unpublish(gone) and hold(held.ref).
  for (const { ref } of [gone, held]) {
    expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "WITHDRAWN", upvotes: null });
    expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "NONE", upvotes: null });
    expect(await votersOf(ref)).toEqual([]);
  }
});
it("counts are the same for every caller, name no account, and are given for public debates only", async () => {
  // loud: ana and ben upvote it. quiet: no vote. held: ben upvotes, then hold. gone: ben upvotes, then unpublish.
  const asked = [gone.ref, loud.ref, held.ref, quiet.ref, loud.ref, randomUUID()];
  const expected = [{ publication_ref: loud.ref, upvotes: 2 }, { publication_ref: quiet.ref, upvotes: 0 }].sort((a, b) => (a.publication_ref < b.publication_ref ? -1 : 1));
  const runner = bare("RUNNER_DATABASE_URL");
  for (const [label, read] of [["the system login, outside any request", () => counts(system, asked)],
    ["the list's read in ana's request", () => listCounts(request, ana.token, asked)], ["the list's read in ben's request", () => listCounts(request, ben.token, asked)],
    ["the list's read with no session", () => listCounts(request, null, asked)], ["the runner's login", () => counts(runner, asked)]] as const) {
    expect(await read(), label).toEqual(expected);
  }
  for (const entry of await counts(system, asked)) expect(Object.keys(entry).sort()).toEqual(["publication_ref", "upvotes"]);
  expect(await counts(system, [held.ref, gone.ref, randomUUID()])).toEqual([]);
  await expect(counts(system, Array.from({ length: 101 }, () => randomUUID()))).rejects.toMatchObject(INVALID);
  // The writers answer the same number the list shows.
  expect(await cast(request, cal.token, cal.ownerRef, loud.ref)).toEqual({ outcome: "CAST", upvotes: 3 });
  expect(await counts(system, [loud.ref])).toEqual([{ publication_ref: loud.ref, upvotes: 3 }]);
  // No request login may ask: outside the frame the statement runs on the request login itself.
  await expect(inAccountRequest(ana.token, () => counts(request, [loud.ref]))).rejects.toMatchObject(denied("read_public_debate_upvote_counts"));
  await expect(counts(bare("DATABASE_URL"), [loud.ref])).rejects.toMatchObject(denied("read_public_debate_upvote_counts"));
  await expect(counts(bare("AUTHORIZATION_DATABASE_URL"), [loud.ref])).rejects.toMatchObject({ code: "42501" });
});
it("deleting the account row, as the erasure's last step does, removes that account's votes and no one else's", async () => {
  // leaver and keeper = await person(); each upvotes a.ref and b.ref.
  await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [leaver.userId]);   // migrations/0110_account_erasure_public_debates.sql:747
  expect(await votesBy(leaver.ownerRef)).toEqual([]);
  expect(await votesBy(keeper.ownerRef)).toEqual([a.ref, b.ref].sort());
  expect(await counts(system, [a.ref])).toEqual([{ publication_ref: a.ref, upvotes: 1 }]);
  expect((await database.pool.query(`SELECT confrelid::regclass::text AS target, confdeltype::text AS on_delete FROM pg_constraint
    WHERE conrelid='identity.public_debate_upvote'::regclass AND contype='f' ORDER BY 1`)).rows)
    .toEqual([{ target: 'identity."user"', on_delete: "c" }, { target: "serve.publication_snapshot", on_delete: "a" }]);
  expect(await sqlError(() => database.pool.query("TRUNCATE identity.public_debate_upvote"))).toMatchObject({ code: expect.any(String) });
  expect(await votesBy(keeper.ownerRef)).toHaveLength(2);
});
it("the export reader answers the leased export's own upvotes, oldest first, whatever the debate's state, and is refused without the lease", async () => {
  // reader, other, empty = await person(); reader upvotes a.ref then b.ref; other upvotes c.ref; unpublish(b); { exportId, lease } = await leasedExport(reader.userId).
  const rows = await exported(worker, exportId, lease);
  expect(rows.map((row) => row.publication_ref)).toEqual([a.ref, b.ref]);
  for (const row of rows) expect(Object.keys(row).sort()).toEqual(["created_at", "publication_ref"]);
  await expect(exported(worker, exportId, randomUUID())).rejects.toMatchObject(LEASE_INVALID);
  await expect(exported(worker, randomUUID(), lease)).rejects.toMatchObject(LEASE_INVALID);
  expect(await exported(worker, none.exportId, none.lease)).toEqual([]);   // none = await leasedExport(empty.userId)
  for (const pool of [bare("DATABASE_URL"), system, bare("ERASURE_DATABASE_URL")]) await expect(exported(pool, exportId, lease)).rejects.toMatchObject({ code: "42501" });
});
it("the sweep deletes the votes of a debate that is gone for good, a bounded number a call, and leaves a held or a public debate's alone", async () => {
  while (await sweep(system, 100) > 0) { /* what the cases above left behind */ }
  // live and held: ana and ben upvote each; then hold(held.ref). ended: ana, ben and cal upvote; then unpublish.
  // moved: ana upvotes; then unpublish and next = await publish(moved.runId); cal upvotes next.
  await expect(inAccountRequest(ana.token, () => sweep(request, 1))).rejects.toMatchObject(denied("delete_gone_public_debate_upvotes"));
  await expect(sweep(bare("DATABASE_URL"), 1)).rejects.toMatchObject(denied("delete_gone_public_debate_upvotes"));
  expect((await votersOf(ended.ref)).length + (await votersOf(moved.ref)).length).toBe(4);
  expect(await sweep(system, 1)).toBe(1);
  expect((await votersOf(ended.ref)).length + (await votersOf(moved.ref)).length).toBe(3);
  // A vote another transaction holds is skipped, not waited for: the API runs a second sweep after this one on the same trigger (T16).
  const holder = await database.pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query("SELECT 1 FROM identity.public_debate_upvote WHERE publication_ref=$1 LIMIT 1 FOR UPDATE", [ended.ref]);
    expect(await sweep(system, 100)).toBe(2);
    await holder.query("COMMIT");
  } finally { await holder.query("ROLLBACK").catch(() => undefined); holder.release(); }
  expect(await sweep(system, 100)).toBe(1);
  expect(await sweep(system, 100)).toBe(0);
  expect([await votersOf(ended.ref), await votersOf(moved.ref)]).toEqual([[], []]);
  expect(await votersOf(live.ref)).toEqual([ana.ownerRef, ben.ownerRef].sort());
  expect(await votersOf(held.ref)).toEqual([ana.ownerRef, ben.ownerRef].sort());
  expect(await votersOf(next)).toEqual([cal.ownerRef]);
  await release(held.ref);
  expect(await counts(system, [held.ref])).toEqual([{ publication_ref: held.ref, upvotes: 2 }]);
});
it("each function has its one grantee, no login reads the table, and the erasure login gained nothing", async () => {
  const GRANTEES: Readonly<Record<string, string>> = {
    "identity.cast_public_debate_upvote(uuid,uuid)": "debateai_billing_runtime", "identity.withdraw_public_debate_upvote(uuid,uuid)": "debateai_billing_runtime",
    "identity.read_own_public_debate_upvotes(uuid,uuid[])": "debateai_billing_runtime", "identity.read_public_debate_upvote_counts(uuid[])": "debateai_rls_all_accounts",
    "identity.delete_gone_public_debate_upvotes(integer)": "debateai_rls_all_accounts", "identity.read_data_export_public_debate_upvotes(uuid,uuid)": "debateai_data_export_worker" };
  for (const [signature, grantee] of Object.entries(GRANTEES)) expect(await granteesOf(signature), signature).toEqual([grantee]);
  for (const key of ["DATABASE_URL", "AUTHORIZATION_DATABASE_URL", "API_SYSTEM_DATABASE_URL", "RUNNER_DATABASE_URL", "ERASURE_DATABASE_URL", "DATA_EXPORT_DATABASE_URL"] as const) {
    await expect(bare(key).query("SELECT count(*) FROM identity.public_debate_upvote"), key).rejects.toMatchObject({ code: "42501" });
  }
  // The erasure login runs none of the six, and the API's own start check of that login (it counts what the login can run) still passes.
  expect((await database.pool.query("SELECT signature FROM unnest($1::text[]) AS signature WHERE has_function_privilege('debateai_erasure_runtime',signature,'EXECUTE')",
    [Object.keys(GRANTEES)])).rows).toEqual([]);
  await expect(assertAccountErasureDatabaseRole(bare("DATABASE_URL", 2), bare("ERASURE_DATABASE_URL", 2))).resolves.toBeUndefined();
});
it("on the production logins (P3-01's memberships): api-runtime votes for its own session only; api-system reads the counts and sweeps; api-runtime does neither", async () => {
  // prodSystem = createPool(production.url("api-system"), { max: 2 }); prodRequest = createPool(production.url("api-runtime"), { max: 2, crossAccount: prodSystem });
  // prodBare = createPool(production.url("api-runtime"), { max: 1 }); all three pushed to `opened`.
  expect(await cast(prodRequest, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "CAST", upvotes: 1 });
  await expect(cast(prodRequest, cal.token, ben.ownerRef, ref)).rejects.toMatchObject(MISMATCH);
  await expect(cast(prodBare, null, ben.ownerRef, ref)).rejects.toMatchObject(MISMATCH);
  expect(await own(prodRequest, ben.token, ben.ownerRef, [ref])).toEqual([ref]);
  expect(await listCounts(prodRequest, cal.token, [ref])).toEqual([{ publication_ref: ref, upvotes: 1 }]);
  await expect(counts(prodBare, [ref])).rejects.toMatchObject(denied("read_public_debate_upvote_counts"));
  await expect(sweep(prodBare, 1)).rejects.toMatchObject(denied("delete_gone_public_debate_upvotes"));
  expect(await sweep(prodSystem, 1)).toBeGreaterThanOrEqual(0);
  expect(await withdraw(prodRequest, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "WITHDRAWN", upvotes: 0 });
}, 180_000);
```

- [ ] **Step 10: Run it**

Run: `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/public-debate-upvotes-0193.test.ts`
Expected: `Tests  12 passed (12)`. The SQL already exists, so this file is green on its first honest run (Step 11
is its red run). A failing case means T01's SQL differs from the spec: report the case name and both values; change
neither side. A sweep case that runs into the test's time limit means the sweep waited behind the locked row.

- [ ] **Step 11: Show that the guard cases can fail**

Add these three statements to `beforeAll`, directly after `await migrate(database.pool);`:

```ts
await database.pool.query(`DO $$ DECLARE k name; BEGIN SELECT conname INTO STRICT k FROM pg_constraint WHERE conrelid='identity.public_debate_upvote'::regclass
  AND confrelid='identity."user"'::regclass; EXECUTE format('ALTER TABLE identity.public_debate_upvote DROP CONSTRAINT %I', k); END $$`);
await database.pool.query("GRANT EXECUTE ON FUNCTION identity.read_public_debate_upvote_counts(uuid[]) TO debateai_billing_runtime");
await database.pool.query("GRANT EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer) TO debateai_billing_runtime");
```

And, in the case "every kind of absence answers NOT_PUBLIC…", comment out its one line `await release(held.ref);`.

Run the Step 10 command. Expected: red, and these five by name among the failures: "deleting the account row…" (a
vote outlives its account), "counts are the same for every caller…" (a request login reads the count), "the sweep
deletes the votes…" (a request login sweeps), "each function has its one grantee…", and "every kind of absence…"
(a debate still held is not counted: `expected [] to deeply equal [ { publication_ref: …, upvotes: 1 } ]`). Delete
the three statements and restore the `release` line. Run again: `Tests  12 passed (12)`.

- [ ] **Step 12: Verify the task**

Each with the prefix `cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`:

| Command | Expected |
|---|---|
| `pnpm run typecheck` | exit 0 (the root check covers `tests/**/*.ts`) |
| `pnpm exec vitest run tests/architecture/p3-production-database-principals.test.ts` | `28 passed (28)` |
| `pnpm exec vitest run tests/architecture/n1-baseline.test.ts` | `7 passed (7)` |
| `pnpm exec vitest run tests/integration/identity-database.test.ts` | `4 passed (4)` |
| `pnpm exec vitest run tests/integration/security-review-hardening-database.test.ts` | `78 passed (78)` |
| `pnpm exec vitest run tests/integration/public-debate-upvotes-0193.test.ts` | `12 passed (12)` |
| `pnpm exec vitest run tests/integration/unfinished-signup-expiry-database.test.ts` | `12 passed (12)`: no key on the account refuses a delete (`:259-266`) |
| `pnpm exec vitest run tests/integration/rls-forward0130.test.ts` | `22 passed (22)`: the row-security scope still has 118 members (`:163-168`). Not on the CI list, so run it here |
| `grep -c -e "DROP CONSTRAINT" -e "TO debateai_billing_runtime\"" -e "// *await release" tests/integration/public-debate-upvotes-0193.test.ts` | `0` (Step 11's statements are gone and the `release` line is back) |
| `git status --short` | this task's five modified files and one new file (and other tasks' files, if they share the tree) |

- [ ] **Step 13: Commit**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json tests/architecture/p3-production-database-principals.test.ts tests/integration/security-review-hardening-database.test.ts tests/integration/identity-database.test.ts tests/n1-baseline.json tests/integration/public-debate-upvotes-0193.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "Database step 0193's grants are disclosed, its request functions and its table are on the closed lists, and a test on the real logins proves how upvotes are cast, counted, taken back, exported, swept and erased." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Never `git add -A` or `git add .`. The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this
worktree; nothing is pushed. The last `-m` is the attribution line; if your session's instructions give another
one, use theirs.
