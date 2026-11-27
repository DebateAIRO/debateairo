### Task T16: The sweep that deletes the upvotes of a debate gone for good

Design §5 ("A debate that is gone for good loses its votes") and §7.1 (the sixth function). This task gives the
database package the one method that calls 0193's sweep, gives the API one bounded pass over it, and runs that pass
on the API's existing hourly sweep timer. No new timer, no new cross-account site, no route, no SQL.

Every command below is run from the code root with this prefix (written out in each step):
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

Depends on: **T01**, **T05** and **T07**. T07 is here for one reason: both tasks edit `apps/api/src/main.ts`, so this
one starts only after T07 is committed. May run alongside T08, T12 and T13 (no shared file). If another task shares
your working tree, run your typecheck and commit steps while no other task is in the middle of an edit, and read
every `git status` and typecheck expectation below as "nothing else of yours".

**Files:**
- Create: `apps/api/src/public-vote-sweep.ts`
- Create: `tests/unit/public-vote-sweep.test.ts`
- Modify: `packages/db/src/public-debate-upvote.ts` (T05's new file; one class appended at its end)
- Modify: `apps/api/src/main.ts:99` (one import added after it), `:191` (one import added after it), `:1618-1625` (the
  hourly sweep: comment, one new declaration, the trigger's body). Those numbers are the untouched tree's
  (`c946564be`). This task runs after T07, which adds one import after `:99` and two lines after `:1242`: so the
  second anchor is then at `:192` and the block at `:1621-1628`. Find each anchor by its text, quoted in Steps 8 and 9.
- Modify: `tests/integration/public-debate-upvotes-repository.test.ts` (T05's file: one import name, one `describe`
  appended at the end)
- Test: `tests/unit/public-vote-sweep.test.ts`, `tests/integration/public-debate-upvotes-repository.test.ts`

**Interfaces:**
- Consumes, from T01 (step `migrations/0193_public_debate_upvotes.sql`):
  `identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer`, `SECURITY DEFINER`, granted to
  `debateai_rls_all_accounts` only. It deletes at most `p_limit` votes whose page is no longer its debate's current
  publication and returns how many. `p_limit` null or outside 1 to 1000 raises `22023 PUBLIC_DEBATE_UPVOTE_INVALID`.
  A page that is only held is still current, so its votes stay; a page held and then made private is gone and is
  swept. A vote another transaction holds is skipped, not waited for (T02 proves it), so a short answer does not
  prove none is left, and this sweep never holds back the clarify sweep that follows it on the same trigger.
- Consumes, from T07: nothing imported. `apps/api/src/main.ts` as T07 left it, with
  `const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);` in it exactly once.
- Consumes, from T05: the file `packages/db/src/public-debate-upvote.ts`, already exported by
  `export * from "./public-debate-upvote.js";` in `packages/db/src/investigation-reports.ts` (so a class added to it
  is exported from `@debateai/db` with no further line); and the harness of
  `tests/integration/public-debate-upvotes-repository.test.ts` (`request`, `upvotes`, `person`, `asking`, `rows`,
  `refused`, `publish`, `unpublish`).
- Produces:
  - `@debateai/db`:
    ```ts
    export class PostgresPublicDebateUpvoteSweepRepository {
      constructor(pool: Pick<Pool, "query">);
      deleteGone(limit: number): Promise<number>;
    }
    ```
  - `apps/api/src/public-vote-sweep.ts`:
    ```ts
    export async function sweepGonePublicDebateUpvotes(deps: Readonly<{
      repository: Pick<PostgresPublicDebateUpvoteSweepRepository, "deleteGone">;
      log: (line: string) => void;
    }>): Promise<number>;
    ```
  - Behaviour others may state: the votes of a debate gone for good are deleted by the API's hourly pass, and once
    each time a release becomes current; one pass deletes at most ten thousand, the next pass takes the rest.
  - Two journal lines, for operators: `{"event":"public_debate_upvote.gone_deleted","deleted":<n>}` (a pass that
    deleted something) and `[PUBLIC_DEBATE_UPVOTE_SWEEP_PENDING]` (a pass that failed; the next hour tries again).
  - For T15: one more shipped file to list, `apps/api/src/public-vote-sweep.ts`. The new unit test needs no list.

**Before you start:**

Read these as templates.
- `apps/api/src/ask-clarify.ts:430-448`: the pass of the hourly clarify sweep. Copy its shape: a non-exported frozen
  `{ batch: 500, batchesPerPass: 20 }`, batches until one comes back short, a failing batch ends the pass.
- `packages/db/src/unfinished-signup-expiry.ts:18-27`: a repository on `Pick<Pool, "query">` that calls one definer of
  the cross-account marker with `$1::integer`. Copy the constructor and the statement form.
- `apps/api/src/main.ts:1598-1604`: a second job inside an existing single-flight trigger, in its own `try` with its
  own bracketed line, before the trigger's first job. Step 9 follows it character for character in style.
- `apps/api/src/unfinished-signup-expiry.ts:62-64`: the counts-only JSON line a pass writes when it did something.
- `tests/unit/unfinished-signup-expiry.test.ts:123-151`: a repository tested on a fake pool, and a source pin of the
  wiring in `main.ts`.

Why this timer. The hourly clarify sweep (`main.ts:1618-1625`) is the only timer that already has every property the
new sweep needs: it runs whatever the deployment mode, on `pool` outside any request, single flight, only on the
current release, once each time a release becomes current (`main.ts:2594`), and it calls a marker-only function with
the same `p_limit` of 1 to 1000. The public review purge (`main.ts:2574`) exists only when publication is served and
swallows its failures. The 30-second and 10-minute timers are too frequent: the sweep reads every voted page per call.

Traps.
- No cross-account site. Outside a request a statement on `pool` goes to its target, the system login
  (`packages/db/src/account-context.ts:13-14`, `main.ts:436`), which holds the marker. A background reader needs no
  reader id (`account-context.ts:40`). So the repository is built as `new …(pool)`: never `crossAccountPool(pool, …)`,
  never `systemPool`, never inside `crossAccount(…)`. `tests/architecture/rls-cross-account-sites.test.ts:28-64` and
  `tests/architecture/rls-db-cross-account-sites.test.ts:29-62` pin every site; both stay unedited and green.
- No new timer and no new one-shot. `tests/architecture/side-by-side-api-loops.test.ts:100-113` pins the timer line,
  `:137-164` the one-shots and their order, `:208-220` the files that start a `setInterval`. Keep the names
  `triggerAskClarifyReservationSweep` and `askClarifyReservationSweepTimer`; change only the trigger's body.
- `deleteGone` is never called from a route or anything a request awaits. Inside a request `pool` uses the request
  login, which the database refuses (42501). Step 4 proves it.
- T07's test pins `main.match(/new PostgresPublicDebateUpvoteRepository\(/g)` to one match. Do not construct T05's
  class here. The sweep class's name does not match that pattern; keep the name exactly.
- `packages/db/src/index.ts` is byte-pinned (`tools/orphan-audit/src/index.ts:678`, `:744`). Do not open it for
  writing, and add no export line anywhere: T05's `export *` carries the new class.
- The text `crossAccount` must not appear in `packages/db/src/public-debate-upvote.ts` (T05's check greps it) or in the
  new API file. Write "cross-account marker", with the hyphen, in comments.
- Do not export an upper-case numeric constant (`tools/orphan-audit/src/index.ts:816-823` refuses
  `export const NAME = <number>;`). The pass's two figures live in a non-exported frozen object.
- A log line carries the count and nothing else: no publication ref, no owner, no error text.
- Do not touch `main.ts:1626-1635` (the sign-up expiry). `tests/unit/unfinished-signup-expiry.test.ts:145-147` pins
  those lines by regex.
- In the integration file, never query `database.pool` inside `asking(…)` (`tests/support/testDatabase.ts:240-245`).
  Earlier cases of that file leave votes on debates made private, so the new case drains first.
- Not this task's files: `tests/support/shipped-corpus.manifest.txt` and `tests/ci-integration-auth.txt` (T15 alone).
  Until T15, `tests/unit/s1-1-depth-contract.test.ts` reports the new API file under `added`. That is expected.
- The batch figures are the clarify sweep's own (`ask-clarify.ts:433`). This machine's limits check has no list. If
  CI's check refuses a line of this task, stop and report; never add the mark `limits-check-ok`.

- [ ] **Step 1: Confirm T01, T05 and T07 are in the tree, and that nothing of this task is**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "CREATE OR REPLACE FUNCTION identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer" migrations/0193_public_debate_upvotes.sql; grep -c "GRANT EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer) TO debateai_rls_all_accounts;" migrations/0193_public_debate_upvotes.sql; grep -c "export class PostgresPublicDebateUpvoteRepository" packages/db/src/public-debate-upvote.ts; grep -c 'export \* from "./public-debate-upvote.js";' packages/db/src/investigation-reports.ts; grep -c "PostgresPublicDebateUpvoteSweepRepository" packages/db/src/public-debate-upvote.ts apps/api/src/main.ts; grep -c "const publicDebateUpvoteRepository = new PostgresPublicDebateUpvoteRepository(pool);" apps/api/src/main.ts
```

Expected: `1`, `1`, `1`, `1`, then two lines ending `:0`, then `1` (T07's line is in `main.ts`). Anything else: stop
and report which dependency is missing. Do not start on `main.ts` while T07 is unfinished.

- [ ] **Step 2: Write the unit test file**

`tests/unit/public-vote-sweep.test.ts`. First line `// tests/unit/public-vote-sweep.test.ts`, then a short comment: the
pass that deletes the upvotes of debates gone for good (0193), its repository, and its place in `main.ts`.

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { sweepGonePublicDebateUpvotes } from "../../apps/api/src/public-vote-sweep.js";
import { PostgresPublicDebateUpvoteSweepRepository } from "../../packages/db/src/public-debate-upvote.js";

const EVENT = "public_debate_upvote.gone_deleted";
/** One pass over a fake database: `answer(limit, call)` is what the call numbered `call` (from 1) deletes. */
function passOver(answer: (limit: number, call: number) => number) {
  const limits: number[] = [];
  const lines: string[] = [];
  return {
    limits,
    logged: (): unknown[] => lines.map((line) => JSON.parse(line) as unknown),
    run: () => sweepGonePublicDebateUpvotes({
      repository: { deleteGone: async (limit) => { limits.push(limit); return answer(limit, limits.length); } },
      log: (line) => lines.push(line)
    })
  };
}
const over = (query: (sql: string, values: readonly unknown[]) => Promise<unknown>) =>
  new PostgresPublicDebateUpvoteSweepRepository({ query } as never);

describe("0193 the pass that deletes the upvotes of debates gone for good", () => {
  it("takes the votes in batches of 500 until one comes back short, and logs the count alone", async () => {
    const left = [500, 500, 7];
    const pass = passOver(() => left.shift() ?? 0);
    expect(await pass.run()).toBe(1007);
    expect(pass.limits).toEqual([500, 500, 500]);
    expect(pass.logged()).toEqual([{ event: EVENT, deleted: 1007 }]);
  });
  it("logs nothing when no vote was gone", async () => {
    const pass = passOver(() => 0);
    expect(await pass.run()).toBe(0);
    expect(pass.limits).toEqual([500]);
    expect(pass.logged()).toEqual([]);
  });
  it("one pass takes at most twenty batches, so a backlog never holds the timer; the next pass takes the rest", async () => {
    const pass = passOver((limit) => limit);
    expect(await pass.run()).toBe(10_000);
    expect(pass.limits).toHaveLength(20);
    expect(pass.logged()).toEqual([{ event: EVENT, deleted: 10_000 }]);
  });
  it("a batch that fails ends the pass with its failure, after the line for what already went", async () => {
    const failure = Object.assign(new Error("permission denied"), { code: "42501" });
    const second = passOver((limit, call) => { if (call === 2) throw failure; return limit; });
    await expect(second.run()).rejects.toBe(failure);
    expect(second.limits).toHaveLength(2);
    expect(second.logged()).toEqual([{ event: EVENT, deleted: 500 }]);
    const first = passOver(() => { throw failure; });
    await expect(first.run()).rejects.toBe(failure);
    expect(first.logged()).toEqual([]);
  });
});

describe("PostgresPublicDebateUpvoteSweepRepository", () => {
  it("calls 0193's sweep and nothing else, and answers its count", async () => {
    const queries: Array<Readonly<{ sql: string; values: readonly unknown[] }>> = [];
    const repository = over(async (sql, values) => { queries.push({ sql, values }); return { rows: [{ deleted: 3 }] }; });
    expect(await repository.deleteGone(500)).toBe(3);
    expect(queries).toEqual([{ sql: "SELECT identity.delete_gone_public_debate_upvotes($1::integer) AS deleted", values: [500] }]);
  });
  it("refuses an answer that is not a count, and hands back a database refusal as it was", async () => {
    for (const rows of [[], [{ deleted: null }], [{ deleted: -1 }], [{ deleted: 1.5 }]]) {
      await expect(over(async () => ({ rows })).deleteGone(500), JSON.stringify(rows)).rejects.toThrow("PUBLIC_DEBATE_UPVOTE_SWEEP_ANSWER_INVALID");
    }
    const invalid = Object.assign(new Error("PUBLIC_DEBATE_UPVOTE_INVALID"), { code: "22023" });
    await expect(over(async () => { throw invalid; }).deleteGone(0)).rejects.toBe(invalid);
  });
});

describe("the sweep's place in main.ts", () => {
  it("runs on the hourly sweep's timer: on the pool outside any request, in its own try, before the reservations, built once", async () => {
    const source = await readFile(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
    expect(source).toMatch(/^const publicDebateUpvoteSweep = new PostgresPublicDebateUpvoteSweepRepository\(pool\);$/mu);
    expect(source.match(/new PostgresPublicDebateUpvoteSweepRepository\(/gu)).toHaveLength(1);
    expect(source.match(/sweepGonePublicDebateUpvotes\(/gu)).toHaveLength(1);
    // Two facts, not the spacing: the pass is inside the hourly trigger in a try of its own, and it runs before the reservations' sweep.
    const trigger = /^const triggerAskClarifyReservationSweep=createSingleFlightErasureReconciler\(\n([\s\S]*?)\n\);$/mu.exec(source)?.[1] ?? "";
    expect(trigger).toMatch(/try\s*\{\s*await sweepGonePublicDebateUpvotes\(\{\s*repository: publicDebateUpvoteSweep,\s*log: [^}]*\}\);?\s*\}\s*catch\s*\{\s*console\.error\("\[PUBLIC_DEBATE_UPVOTE_SWEEP_PENDING\]"\);?\s*\}/u);
    expect(trigger.indexOf("sweepGonePublicDebateUpvotes(")).toBeLessThan(trigger.indexOf("await sweepAskClarifyReservations("));
    expect(trigger.indexOf("await sweepAskClarifyReservations(")).toBeGreaterThan(-1);
    expect(trigger).toContain('console.error("[ASK_CLARIFY_RESERVATION_SWEEP_PENDING]")');
    expect(source).toMatch(/^const askClarifyReservationSweepTimer=gatedInterval\(releaseWatcher,triggerAskClarifyReservationSweep,ASK_CLARIFY_RESERVATION_SWEEP_EVERY_MS\);$/mu);
    expect(source).toMatch(/^api\.addHook\("onClose",async \(\) => clearInterval\(askClarifyReservationSweepTimer\)\);$/mu);
    expect(source).toMatch(/^endBecameCurrent = releaseWatcher\.onBecameCurrent\(\(\) => \{\n(?: {2}.*\n)*? {2}triggerAskClarifyReservationSweep\(\);$/mu);
  });
});
```

- [ ] **Step 3: Run it and see it red**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-vote-sweep.test.ts
```

Expected: `Test Files  1 failed (1)`, no test runs. The reason names the missing module
`../../apps/api/src/public-vote-sweep.js` (a "Failed to resolve import" or "Cannot find module" line).

- [ ] **Step 4: Add the two database cases to T05's integration file, and see them red**

`tests/integration/public-debate-upvotes-repository.test.ts`: add `PostgresPublicDebateUpvoteSweepRepository` to the
names imported from `@debateai/db`, and append this `describe` at the end of the file. Nothing else in the file changes.

```ts
describe("PostgresPublicDebateUpvoteSweepRepository on the API's pool, as main.ts builds it", () => {
  it("outside any request it deletes the votes of a debate that is gone for good, at most the limit a call, and leaves a public debate's", async () => {
    const sweep = new PostgresPublicDebateUpvoteSweepRepository(request);
    while (await sweep.deleteGone(1000) > 0) { /* what the cases above left on debates made private */ }
    const [ana, dan, eva] = [await person("ana"), await person("dan"), await person("eva")];
    const [gone, kept] = [await publish(ana.runId), await publish(dan.runId)];
    for (const who of [ana, dan, eva]) {
      await asking(who, () => upvotes.cast(who.ownerRef, gone));
      await asking(who, () => upvotes.cast(who.ownerRef, kept));
    }
    expect(await sweep.deleteGone(1000)).toBe(0);
    await unpublish(ana.runId, gone);
    expect(await sweep.deleteGone(2)).toBe(2);
    expect(await rows(gone)).toBe(1);
    expect(await sweep.deleteGone(1000)).toBe(1);
    expect(await sweep.deleteGone(1000)).toBe(0);
    expect([await rows(gone), await rows(kept)]).toEqual([0, 3]);
  });
  it("inside a request the same call is refused by the database, whoever asks; a limit outside 1 to 1000 is refused as the database said it", async () => {
    const sweep = new PostgresPublicDebateUpvoteSweepRepository(request);
    const ana = await person("ana");
    for (const who of [ana, null]) {
      expect(await refused(() => asking(who, () => sweep.deleteGone(1))))
        .toMatchObject({ code: "42501", message: "permission denied for function delete_gone_public_debate_upvotes" });
    }
    for (const limit of [0, 1001]) {
      expect(await refused(() => sweep.deleteGone(limit)), String(limit)).toMatchObject({ code: "22023", message: "PUBLIC_DEBATE_UPVOTE_INVALID" });
    }
  });
});
```

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/public-debate-upvotes-repository.test.ts
```

Expected: `Tests  2 failed | 11 passed (13)`, both failures saying
`PostgresPublicDebateUpvoteSweepRepository is not a constructor`. (If the runner instead refuses the whole file with a
missing-export error for that name, that is the same red.) If T05's own count is not 11, the two new cases are the
only failures.

- [ ] **Step 5: Add the repository class**

Append to `packages/db/src/public-debate-upvote.ts` (the file's `import type { Pool } from "pg";` already serves):

```ts
export class PostgresPublicDebateUpvoteSweepRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async deleteGone(limit: number): Promise<number>
}
```

- One statement: `SELECT identity.delete_gone_public_debate_upvotes($1::integer) AS deleted`, parameters `[limit]`.
- It returns `rows[0]?.deleted` when that is a non-negative integer (`Number.isInteger`), and otherwise throws
  `new TypeError("PUBLIC_DEBATE_UPVOTE_SWEEP_ANSWER_INVALID")`.
- It checks nothing about `limit` and catches nothing: the database refuses a bad limit, and every error comes back
  as the same object.
- One doc comment above the class, saying: 0193's sweep of the votes of debates gone for good; the cross-account
  marker's alone, so it is called outside any request, where the API's pool reaches its system login; inside a
  request the request login is refused; a count only, no ref and no owner reaches this class.

- [ ] **Step 6: Create the pass**

`apps/api/src/public-vote-sweep.ts`. One import: `import type { PostgresPublicDebateUpvoteSweepRepository } from "@debateai/db";`.
A non-exported `const PASS = Object.freeze({ batch: 500, batchesPerPass: 20 });` under a one-line comment (one pass:
batches of this many, at most this many batches, so a backlog never holds the timer). Then the function exactly as in
**Produces**, with a doc comment that says what a "debate gone for good" is in one sentence, that the database
decides it and never touches a held debate, and that the caller runs it outside any request.

Rules the tests pin:
- It asks `deps.repository.deleteGone(PASS.batch)` again and again; it stops after a batch that deleted fewer than
  `PASS.batch`, or after `PASS.batchesPerPass` batches.
- When the pass deleted at least one vote it calls `deps.log` once with
  `JSON.stringify({ event: "public_debate_upvote.gone_deleted", deleted })`. This also happens when a later batch
  threw: the line is written first, then the same error object is rethrown. When nothing was deleted, no line.
- It returns the number deleted.

- [ ] **Step 7: Run the unit file: six cases pass, the wiring case is red**

Same command as Step 3. Expected: `Tests  1 failed | 6 passed (7)`. The failure is
`the sweep's place in main.ts > runs on the hourly sweep's timer…`, at its first `toMatch`.

- [ ] **Step 8: Add the two imports to `main.ts`**

Closed place 1, `apps/api/src/main.ts:99`. Directly after the line
`import { PostgresRegistrationCountryReader } from "@debateai/db";` (T07's import of
`PostgresPublicDebateUpvoteRepository` already follows it; put this one between the two or after T07's, either is
fine) add:

```ts
import { PostgresPublicDebateUpvoteSweepRepository } from "@debateai/db";
```

Closed place 2, `apps/api/src/main.ts:191` (`:192` after T07). Directly after the line
`import { createUnfinishedSignupExpiry, UNFINISHED_SIGNUP_EXPIRY_EVERY_MS } from "./unfinished-signup-expiry.js";` add:

```ts
import { sweepGonePublicDebateUpvotes } from "./public-vote-sweep.js";
```

- [ ] **Step 9: Put the sweep on the hourly timer**

`apps/api/src/main.ts:1618-1625` (three lines lower after T07; the block starts at the comment
`// The security review's 0171 (F5): the clarify reservations no charge took`). The three comment lines at 1618-1620
and the timer line at 1625 stay as they are.
Lines 1621-1624 (the trigger; 1624-1627 after T07) become the block below, new comment and declaration first.
Step 2 pins the facts (built once on `pool`; called once, inside the trigger, in a `try` of its own, before the
reservations' sweep), not the spacing. Keep the neighbours' compact style as written here. The comment's wording is
yours to tighten, its facts are not.

```ts
// 0193: the upvotes of a public debate that is gone for good (made private again, or deleted by the end-of-debate check) go on the same hourly
// pass, in their own try, so neither sweep ever skips the other. Outside any request, so `pool` sends it to the API's system login, which holds the
// cross-account marker 0193's sweep is granted to. The database decides from the rows alone; a debate that is only held keeps its votes.
const publicDebateUpvoteSweep = new PostgresPublicDebateUpvoteSweepRepository(pool);
const triggerAskClarifyReservationSweep=createSingleFlightErasureReconciler(
  async ()=>{
    try{await sweepGonePublicDebateUpvotes({ repository: publicDebateUpvoteSweep, log: (line) => console.error(line) });}catch{console.error("[PUBLIC_DEBATE_UPVOTE_SWEEP_PENDING]");}
    await sweepAskClarifyReservations((limit)=>deleteAskClarifyReservationsDue(pool,limit));
  },
  ()=>console.error("[ASK_CLARIFY_RESERVATION_SWEEP_PENDING]")
);
```

Nothing else in `main.ts` changes: no new timer, no `onClose` hook, no line inside `onBecameCurrent` (`:2594` already
asks this trigger), no `crossAccountPool`.

- [ ] **Step 10: Run both test files green**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-vote-sweep.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/public-debate-upvotes-repository.test.ts
```

Expected: `Tests  7 passed (7)` and `Tests  13 passed (13)`.

- [ ] **Step 11: Verification recipe**

Each line is run with the prefix. Counts of unedited files are this tree's, measured before the change.

| Command | Expected |
|---|---|
| `pnpm run typecheck` | exit 0, no `error TS` line |
| `pnpm exec vitest run tests/unit/public-vote-sweep.test.ts` | `Tests  7 passed (7)` |
| `pnpm exec vitest run tests/integration/public-debate-upvotes-repository.test.ts` | `Tests  13 passed (13)` |
| `pnpm exec vitest run tests/architecture/side-by-side-api-loops.test.ts` | `Tests  9 passed (9)`, file unedited (red here means a timer or a one-shot was added or renamed) |
| `pnpm exec vitest run tests/architecture/rls-cross-account-sites.test.ts` | `Tests  13 passed (13)`, file unedited (red here means `main.ts` gained a cross-account site) |
| `pnpm exec vitest run tests/architecture/rls-db-cross-account-sites.test.ts` | `Tests  2 passed (2)`, file unedited |
| `pnpm exec vitest run tests/unit/ask-clarify.test.ts` | `Tests  92 passed (92)`, file unedited |
| `pnpm exec vitest run tests/unit/unfinished-signup-expiry.test.ts` | `Tests  8 passed (8)`, file unedited (its regexes on `main.ts` still match) |
| `pnpm exec vitest run tests/architecture/scaffold.test.ts` | `Tests  1 failed \| 28 passed (29)`: the one known red of the untouched tree, nothing new |
| `shasum -a 256 packages/db/src/index.ts` | `23f8cdf29c8238a47cce937f75806904965cc3543ec96160352bd2c9b7081fb5` |
| `grep -c "crossAccount" packages/db/src/public-debate-upvote.ts apps/api/src/public-vote-sweep.ts` | two lines ending `:0` |
| `grep -c "setInterval\|gatedInterval" apps/api/src/public-vote-sweep.ts` | `0` |
| `git diff --stat -- apps/api/src/main.ts` | one file, about ten lines added and one removed (against T07's commit) |
| `grep -c "new PostgresPublicDebateUpvoteRepository(" apps/api/src/main.ts` | `1`: T07's line is untouched and this task built no second store (T07's test pins this count) |
| `pnpm exec vitest run tests/unit/public-vote-routes.test.ts` | `Tests  12 passed (12)`, file unedited (its `main.ts` case still finds T07's two lines) |
| `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` | one failure, the shipped-file manifest: `missing` is `[]`, `added` holds only files this slice created, `apps/api/src/public-vote-sweep.ts` among them. T15 lists them; do not edit the manifest here |
| `git status --short` | the five paths of this task and nothing else of yours |

- [ ] **Step 12: Stage the five paths and run the limits check on them**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add packages/db/src/public-debate-upvote.ts apps/api/src/public-vote-sweep.ts apps/api/src/main.ts tests/unit/public-vote-sweep.test.ts tests/integration/public-debate-upvotes-repository.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
```

Never `git add -A` or `git add .`. Expected from the check: `LIMITS_CHECK_OK <n> added line(s) read.`, exit 0 (a
`LIMITS_CHECK_NO_LIST` note before it is normal on this machine).

- [ ] **Step 13: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The upvotes of a public debate that is gone for good are deleted by the API's hourly sweep." -m "A new repository calls 0193's sweep and nothing else, and one bounded pass over it runs on the hourly timer that already deletes the clarify reservations, in its own try, so neither sweep skips the other. It runs on the pool outside any request, where the system login holds the cross-account marker the sweep is granted to, so no cross-account site is opened and no timer is added. A debate that is only held for review keeps its votes: the database decides. A pass that deleted something writes one line with the count alone." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

No figure in the commit message (the pull request's limits check reads it). The commit goes to the branch
`feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The last `-m` is the attribution line;
if your session's instructions give another one, use theirs.
