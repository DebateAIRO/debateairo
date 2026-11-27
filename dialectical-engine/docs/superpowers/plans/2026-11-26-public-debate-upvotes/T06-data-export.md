### Task T06: The account export holds the debates the person upvoted

Spec: `docs/superpowers/specs/2026-11-26-public-debate-upvotes-design.md` §7.5 ("Export"), §6 ("the export worker's function list (25 → 26)").
Depends on: **T01** (database step 0193 must be in the tree), and on the owner's yes to one sentence (see the gate below). May run alongside T02 and T05. Touches no file of any other task. T05 only runs `tests/architecture/investigation-reports-0136-contract.test.ts`, which this task edits: if T05 shares your working tree, make the four edits of Step 6 in one go. Read every `git status` and typecheck expectation below as "nothing else of yours", and run your typecheck and commit steps while no other task is in the middle of an edit.

**Owner gate.** Step 9 ships one user-facing English sentence in the export's README: "It also holds the public debates you upvoted, and when." The Privacy Policy's Access row (T14, passage (d)) repeats it word for word. It is approved in the same round as T14's passages. Do not start Step 9 until the orchestrator says the owner approved the sentence. Steps 1 to 8 do not need the approval. If the owner changes the sentence, change it in Step 2's README case and in Step 9, both.

Every command below is run as written. All paths are relative to `dialectical-engine/`. Line numbers were read at commit `c946564be`.

**Files:**

- Create: `tests/unit/public-debate-upvotes-export.test.ts`
- Modify: `packages/db/src/data-export.ts` — `WORKER_FUNCTIONS` 118-163 (insert after 157), the literal on 184, `readRaw` 211-235 (lines 213, 218, 227)
- Modify: `apps/api/src/data-export/snapshot.ts` — `RAW_SECTIONS` 12-34 (insert after 33), `KEEP_COLUMNS` 91-160 (insert after 159), the `account` object 601-625 (insert after 624)
- Modify: `apps/api/src/data-export/types.ts` — `ExportSnapshot.account` 96-101 (line 101)
- Modify: `apps/api/src/data-export/readme.ts` — line 27
- Modify: `tests/fixtures/data-export/raw-a.json` — line 449 (last key)
- Modify: `tests/fixtures/data-export/snapshot-a.ts` — lines 44-45
- Modify: `tests/unit/data-export-service.test.ts` — lines 31-32
- Modify: `tests/unit/data-export-archive.test.ts` — lines 14-15
- Modify: `tests/unit/sf-s04-data-export.test.ts` — lines 61, 62, 76-78
- Modify: `tests/unit/v4-account-memory-export.test.ts` — lines 175, 176, 183, 185
- Modify: `tests/unit/saved-questions-export.test.ts` — lines 183, 189, 191, 192
- Modify: `tests/architecture/dig-model-0134-contract.test.ts` — lines 278-279
- Modify: `tests/architecture/dig-picks-0135-contract.test.ts` — lines 281-282
- Modify: `tests/architecture/investigation-reports-0136-contract.test.ts` — lines 244-245
- Modify: `tests/architecture/report-export-0152-contract.test.ts` — lines 167-168
- Modify: `tests/integration/data-export-e2e.test.ts` — one new case `E16`, after `E15` (the last case of the one `describe`, which opens at line 79)
- Test: `tests/unit/public-debate-upvotes-export.test.ts` (new), `tests/integration/data-export-e2e.test.ts`, plus the existing files listed in Step 11

**Interfaces:**

- Consumes (from T01, `migrations/0193_public_debate_upvotes.sql`): `identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb`. It answers `[{"publication_ref": uuid, "created_at": timestamptz}]`, oldest first (`created_at`, then `publication_ref`), `'[]'::jsonb` when the account has no upvote, never NULL. `EXECUTE` is granted to `debateai_data_export_worker` only. Its catalog signature is `identity.read_data_export_public_debate_upvotes(uuid,uuid)`.
- Produces:
  - Raw section name `"public_debate_upvotes"`, the **last** member of `RAW_SECTIONS`; `KEEP_COLUMNS.public_debate_upvotes = ["publication_ref", "created_at"]`.
  - `ExportSnapshot.account.debates_you_upvoted: Row[]`, the **last** key of `account.json`, each entry exactly `{ debate_reference: string, upvoted_at: string }` (the publication reference; the time in UTC).
  - The boot check `assertDataExportDatabaseRoles` now demands 26 worker functions.
  - The README sentence of Step 9: `It also holds the public debates you upvoted, and when.` T14 (legal texts) quotes the section name and this sentence; T15 runs the full gates over these files.
  - `tests/integration/data-export-e2e.test.ts` has 16 cases (15 before); T15 Step 12 runs it.

**Before you start:**

Read these as templates.

- `tests/unit/pre-start-charge.test.ts:78-99` — the smallest export unit test: raw rows built from `RAW_SECTIONS`, `collectSnapshot` with fake decryptors, `account.json` read back from the ZIP. Copy the raw-row builder (80-86) and the `collectSnapshot` call (88-94).
- `tests/unit/saved-questions-export.test.ts:182-204` — the role-witness fake (two fake pools, `seen[1]?.[1]` is the worker list) and the `readRaw` fake.
- `apps/api/src/data-export/snapshot.ts:609-612` — a `simple(...)` section that renames an id to `debate_reference`. The new section has the same shape.

Traps.

1. **T01 must be in the tree.** After this task the API's boot check (`packages/db/src/data-export.ts:179-191`, called at `apps/api/src/main.ts:459`) counts 26 functions the worker can run. Without 0193 applied the count is 25 and the API refuses to start. Step 1 checks this.
2. **Five things change together or the export breaks silently or loudly** (`apps/api/src/data-export/snapshot.ts:538-546` is the exact-section check): the list entry, the literal `26`, `readRaw`'s SELECT and returned object, `RAW_SECTIONS`, and the `account` object. Seven older readers sit in the list with no archive section (`data-export.ts:129-147`, "not wired yet"). Do not copy that state: this reader is wired all the way.
3. **`RAW_SECTIONS` order is pinned.** `tests/unit/data-export-snapshot.test.ts:205` compares the key order of `tests/fixtures/data-export/raw-a.json` with `RAW_SECTIONS`. The new name goes last in both.
4. **`account.json` key order is pinned.** `tests/unit/data-export-archive.test.ts:40-46` (test A-3) compares the keys of the fixture's `account` with a declared list, in order. `debates_you_upvoted` goes last in the list, in both snapshot literals and in the `account` object of `collectSnapshot`.
5. **Forbidden key names.** `apps/api/src/data-export/archive.ts:14` aborts the build on any key matching `owner_ref`, `token`, `hash`, `nonce`, `ciphertext` and others. Export `debate_reference` and `upvoted_at` only. `upvoted_at` must keep its `_at` ending: `snapshot.ts:206-210` turns only such fields into UTC.
6. **The README line is asserted by substring in four tests** (`tests/unit/saved-questions-export.test.ts:177-178`, `tests/unit/v4-account-memory-export.test.ts:189-193`, `tests/unit/web-evidence-export.test.ts:235-236`, `tests/unit/threat-reports-removed.test.ts:98-99`). Append after the last full stop. Do not reword what is there.
7. **Do not search-and-replace "25" or "twenty-fifth".** `tests/architecture/dig-picks-0135-contract.test.ts:299-307` and `tests/architecture/investigation-reports-0136-contract.test.ts:262-270` use the same words for migration ordinals. Change only the lines named in Step 6.
8. **Leave these alone:** `ACCOUNT_AI_SCOPE` (`apps/api/src/data-export/ai-disclosure.ts:35-38`, pinned at `tests/unit/data-export-archive.test.ts:123`; the new section holds no AI text and "every other record" covers it); `html-page.ts` (it reads only `account.account` and the debates); `packages/db/src/index.ts` (byte-pinned; nothing new is exported); no `READ_DATA_EXPORT_*` constant (the readers wired since 0144 have none).
9. **`E2` of `tests/integration/data-export-e2e.test.ts` asserts that its own publication reference is NOT in the archive** (row `C4` of `outRows`, `:556`). So the new end-to-end case never votes on `E2`'s debate: it seeds its own page.
10. **Three tests fake `readRaw`'s pool with no new member** (`tests/unit/web-evidence-export.test.ts:215-231`, `tests/unit/v4-account-memory-export.test.ts:162-171`, `tests/unit/saved-questions-export.test.ts:195-203`). They stay green: a missing member becomes `undefined`, as `saved_questions` already does there. Do not add a default or a `?? []` in `readRaw`; a reader that answers nothing must fail the export, not empty the section.

---

- [ ] **Step 1: Check that T01's reader is in the tree**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -c "read_data_export_public_debate_upvotes" migrations/0193_public_debate_upvotes.sql packages/db/src/migration-forward0193.ts
```

Expected: two lines, each ending in a count of 1 or more (the SQL file defines, owns and grants the reader; the loader lists it). If either file is missing or a count is 0, stop and report: this task cannot be verified without T01.

- [ ] **Step 2: Write the failing test** `tests/unit/public-debate-upvotes-export.test.ts`

Imports: `describe, expect, it` from `vitest`; `KEEP_COLUMNS, RAW_SECTIONS, collectSnapshot` from `../../apps/api/src/data-export/snapshot.js`; `buildArchive` from `.../archive.js`; `loadArchiveCatalog` from `.../archive-catalog.js`; `renderReadme` from `.../readme.js`; `assertDataExportDatabaseRoles, PostgresDataExportSource` from `../../packages/db/src/data-export.js`; `readZip` from `../support/zip-reader.js`.

Constants and helpers (bodies as in the templates):

```ts
const DEBATE_A = "0193a000-0000-4000-8000-000000000001";
const DEBATE_B = "0193b000-0000-4000-8000-000000000002";
const READER = "identity.read_data_export_public_debate_upvotes(uuid,uuid)";
const SAVED_READER = "identity.read_data_export_saved_questions(uuid,uuid)";
// As 0193's reader answers: oldest first. The stray owner_ref stands for anything the reader must never pass on.
const TWO = [
  { publication_ref: DEBATE_A, created_at: "2026-11-26T15:00:00.123456+02:00", owner_ref: "secret-owner" },
  { publication_ref: DEBATE_B, created_at: "2026-11-26T13:30:00+00:00" }
];
const TWO_OUT = [
  { debate_reference: DEBATE_A, upvoted_at: "2026-11-26T13:00:00.123456Z" },
  { debate_reference: DEBATE_B, upvoted_at: "2026-11-26T13:30:00.000Z" }
];

function rawRows(upvotes: unknown): Record<string, unknown>;      // pre-start-charge.test.ts:80-86, then raw.public_debate_upvotes = upvotes
function collect(raw: Record<string, unknown>): Promise<ExportSnapshot>;   // pre-start-charge.test.ts:88-94
// account.json of the built archive: its text, its parsed object, and its `records` figure in manifest.json.
async function accountJson(upvotes: unknown): Promise<{ text: string; account: Record<string, any>; records: number }>;
```

The seven tests:

```ts
describe("the public debates the person upvoted in account.json", () => {
  it("holds each upvote as the debate's public reference and the time in UTC, oldest first, and nothing else", async () => {
    const snapshot = await collect(rawRows(TWO));
    expect(snapshot.account.debates_you_upvoted).toEqual(TWO_OUT);
    expect(Object.keys(snapshot.account).slice(-2)).toEqual(["questions_not_started", "debates_you_upvoted"]);
  });

  it("an account with no upvotes has debates_you_upvoted: []", async () => {
    expect((await collect(rawRows([]))).account.debates_you_upvoted).toEqual([]);
  });

  it("refuses the export when the section is missing, is not a list, or a row lacks its debate or its time", async () => {
    const missing = rawRows([]);
    delete missing.public_debate_upvotes;
    await expect(collect(missing)).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    const time = "2026-11-26T13:00:00+00:00";
    for (const bad of [null, undefined, {}, [{ publication_ref: DEBATE_A }], [{ created_at: time }], [{ publication_ref: 7, created_at: time }]]) {
      await expect(collect(rawRows(bad)), String(JSON.stringify(bad))).rejects.toMatchObject({ code: "DATA_EXPORT_SOURCE_FAILED" });
    }
  });

  it("account.json carries the section last, two keys per entry, counted in the manifest, and never the voter's reference", async () => {
    const { text, account, records } = await accountJson(TWO);
    expect(account.debates_you_upvoted).toEqual(TWO_OUT);
    expect(Object.keys(account.debates_you_upvoted[0])).toEqual(["debate_reference", "upvoted_at"]);
    expect(Object.keys(account).at(-1)).toBe("debates_you_upvoted");
    expect(account).not.toHaveProperty("public_debate_upvotes");
    for (const absent of ["secret-owner", "owner_ref", "publication_ref"]) expect(text, absent).not.toContain(absent);
    expect(records - (await accountJson([])).records).toBe(2);
  });

  it("the README names them on account.json's line", () => {
    const lines = renderReadme().split("\n").filter((line) => line.includes("upvoted"));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.startsWith("account.json — ")).toBe(true);
    expect(lines[0]!.endsWith("It also holds the questions you have not started yet, with your answers and paths. "
      + "It also holds the public debates you upvoted, and when.")).toBe(true);
  });
});

describe("the worker reads 0193's reader", () => {
  it("as the twenty-sixth function of its role witness, listed directly after 0162's reader", async () => {
    // seen, principal and pool exactly as saved-questions-export.test.ts:184-188
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 26) as never)).resolves.toBeUndefined();
    const listed = seen[1]?.[1] as string[];
    expect(listed).toHaveLength(26);
    expect(listed.indexOf(READER)).toBe(listed.indexOf(SAVED_READER) + 1);
    expect(seen[1]?.[0]).not.toContain(READER);
    await expect(assertDataExportDatabaseRoles(pool("request", 0) as never, pool("worker", 25) as never))
      .rejects.toThrow("DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED");
  });

  it("and in readRaw's one statement, beside the other readers", async () => {
    const sql: string[] = [];
    const reader = { query: async (text: string) => {
      sql.push(text);
      return { rows: [{ snapshot: { user: {} }, threat_reports: [], page_memory: null, public_debate_upvotes: TWO }] };
    } };
    const raw = await new PostgresDataExportSource(reader as never).readRaw("export", "worker");
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain("identity.read_data_export_public_debate_upvotes($1,$2) public_debate_upvotes");
    expect(raw.public_debate_upvotes).toEqual(TWO);
    expect(RAW_SECTIONS.at(-1)).toBe("public_debate_upvotes");
    expect(KEEP_COLUMNS.public_debate_upvotes).toEqual(["publication_ref", "created_at"]);
  });
});
```

- [ ] **Step 3: Run it and see it fail**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-debate-upvotes-export.test.ts
```

Expected: `Tests  7 failed (7)`. The first four fail on `DATA_EXPORT_SOURCE_FAILED` or on a promise that resolved; the witness test fails on `DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED`. A syntax or import error is not the expected red: fix the test first.

- [ ] **Step 4: Add the end-to-end case, and see it fail** (`tests/integration/data-export-e2e.test.ts`)

Every other test of this plan fakes one end of the export: T02 stops at the SQL reader's answer, Step 2 feeds `collectSnapshot` from a faked pool. This case carries a real vote row from the table, through 0193's reader on the worker's login, `PostgresDataExportSource.readRaw` and `collectSnapshot`, into `account.json`.

Add it as the last case of the `describe`, after `E15`. It uses the file's own helpers: `account(email)` (`:107-119`; it returns `userId`, `ownerRef`, `email`), `seedRuns(owner, count)` (`:172-192`), `completed(owner)` (`:158-165`: request, run the worker once, the row is `SENT`) and `entries(zip)` (`:40`). The page is seeded as `E2` seeds one (`:450-452`).

```ts
  it("E16 (0193) a vote the person cast is in their account.json, by the debate's public reference and the UTC time, and nobody else's is", async () => {
    const me = await account("upvoter@example.test"), other = await account("other-upvoter@example.test");
    const [run] = await seedRuns(other, 1);
    const ref = randomUUID();
    // A page of its own, written as E2 writes one. The reader answers a vote whatever the debate's state, so no visibility event is needed.
    await db.pool.query(`INSERT INTO serve.publication_snapshot(publication_ref,run_id,format_version,content_ciphertext,created_at)
      VALUES($1,$2,1,$3::jsonb,clock_timestamp())`, [ref, run, JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AA", ct: "AA", tag: "AA" })]);
    // Two votes on the same debate, written as 0193's cast writes them: mine and another account's.
    await db.pool.query("INSERT INTO identity.public_debate_upvote(publication_ref,owner_ref) VALUES($1,$2),($1,$3)", [ref, me.ownerRef, other.ownerRef]);
    const { store, row } = await completed(me);
    const archive = entries(await store.read(row.export_id, me.userId));
    const accountJson = JSON.parse(archive["account.json"]!) as Record<string, unknown>;
    expect(accountJson.debates_you_upvoted).toEqual([{ debate_reference: ref, upvoted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/u) }]);
    expect(Object.keys(accountJson).at(-1)).toBe("debates_you_upvoted");
    const all = JSON.stringify(archive);
    for (const absent of [other.ownerRef, other.email, other.userId]) expect(all, absent).not.toContain(absent);
  });
```

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/integration/data-export-e2e.test.ts
```

Expected (about 80 seconds): `Tests  1 failed | 15 passed (16)`. The new case fails at its first `toEqual`: `debates_you_upvoted` is `undefined`. If instead the snapshot `INSERT` is refused, stop and report the database's message: the fixture is copied from `E2` and must not be bent to fit.

- [ ] **Step 5: The fixtures that carry the section, and see the snapshot test fail**

| File | Line | Change |
| --- | --- | --- |
| `tests/fixtures/data-export/raw-a.json` | 449 | `"saved_questions": []` becomes `"saved_questions": [],` and a new last line `  "public_debate_upvotes": []` follows it (two-space indent, the closing `}` and final newline stay) |
| `tests/fixtures/data-export/snapshot-a.ts` | 45 | `questions_not_started: [] },` becomes `questions_not_started: [],` then a comment line `// 0193: the public debates the person upvoted.` then `debates_you_upvoted: [] },` |
| `tests/unit/data-export-service.test.ts` | 32 | the same three lines, at that file's indent |
| `tests/unit/data-export-archive.test.ts` | 15 | `"questions_not_started"],` becomes `"questions_not_started",` then a comment line `// 0193: the public debates the person upvoted.` then `"debates_you_upvoted"],` |

Run (this file loads `raw-a.json` and compares its key order with `RAW_SECTIONS`):

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/data-export-snapshot.test.ts
```

Expected: red. The fixture now carries a section `RAW_SECTIONS` does not know: the key-order case (`:205`) and the cases that build a snapshot from `raw-a.json` fail (`DATA_EXPORT_SOURCE_FAILED`, or the two key lists differ by `public_debate_upvotes`). It goes green in Step 10. The fixture `snapshot-a.ts` does not typecheck until Step 8 adds the member to the type; do not run the typecheck before then.

- [ ] **Step 6: Move the count pins from 25 to 26, and see them fail** (closed list: every place that states the worker's function count)

| File | Line | Change |
| --- | --- | --- |
| `tests/unit/sf-s04-data-export.test.ts` | 61 | the comment's ending `a twenty-fifth.` becomes `a twenty-fifth; 0193 (the public debates the person upvoted) a twenty-sixth.` |
| same | 62 | `pool("worker", 25)` becomes `pool("worker", 26)` |
| same | after 76 | add `expect(seen[1]?.[1]).toContain("identity.read_data_export_public_debate_upvotes(uuid,uuid)");` |
| same | 77 | `pool("worker", 24)` becomes `pool("worker", 25)` |
| same | 78 | `pool("worker", 25)` becomes `pool("worker", 26)` |
| `tests/unit/v4-account-memory-export.test.ts` | 175 | the comment's ending `twenty-five with 0162's (Task 39e).` becomes `twenty-five with 0162's (Task 39e); twenty-six with 0193's.` |
| same | 176 | title `(twenty-five functions)` becomes `(twenty-six functions)` |
| same | 183 | `pool("worker", 25)` becomes `pool("worker", 26)` |
| same | 185 | `pool("worker", 24)` becomes `pool("worker", 25)` |
| `tests/unit/saved-questions-export.test.ts` | 183 | title `(twenty-five, after 0157's moderation reader)` becomes `(the twenty-fifth, after 0157's moderation reader; twenty-six since 0193)` |
| same | 189 | `pool("worker", 25)` becomes `pool("worker", 26)` |
| same | 191 | `.toBe(25)` becomes `.toBe(26)` |
| same | 192 | `pool("worker", 24)` becomes `pool("worker", 25)` |
| `tests/architecture/dig-model-0134-contract.test.ts` | 279 | `"worker.worker_count !== 25"` becomes `"worker.worker_count !== 26"`; under the comment on 278 add `// Public debate upvotes: 0193's export reader is the twenty-sixth.` |
| `tests/architecture/dig-picks-0135-contract.test.ts` | 282 | the same literal change; the same comment line under 281 |
| `tests/architecture/investigation-reports-0136-contract.test.ts` | 245 | the same literal change; the same comment line under 244 |
| `tests/architecture/report-export-0152-contract.test.ts` | 168 | the same literal change; the same comment line under 167 |

Run, and see the pins fail for the right reason:

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/sf-s04-data-export.test.ts
```

Expected: red, with `DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED` in the failing case: the test's worker now answers 26 functions and the code still demands 25. (The four architecture files read the literal in `packages/db/src/data-export.ts` as text and are red the same way until Step 7.)

- [ ] **Step 7: The worker's list, its count and `readRaw`** in `packages/db/src/data-export.ts`

- After line 157 (`"identity.read_data_export_saved_questions(uuid,uuid)",`) and before `identity.complete_data_export` on 158, add:

```ts
  // The public debates the person upvoted (0193): wired, into account.json, each debate's public reference and the time only.
  "identity.read_data_export_public_debate_upvotes(uuid,uuid)",
```

- Line 184: `worker.worker_count !== 25` becomes `worker.worker_count !== 26`. Nothing else on the line changes.
- `readRaw`: the row type (line 213) gains `; public_debate_upvotes: unknown` after `saved_questions: unknown`. Line 218 becomes
  `+ "identity.read_data_export_saved_questions($1,$2) saved_questions, identity.read_data_export_public_debate_upvotes($1,$2) public_debate_upvotes",`.
  Line 227 becomes `saved_questions: row.saved_questions, public_debate_upvotes: row.public_debate_upvotes,`. No default, no `??`.

- [ ] **Step 8: The archive section** in `apps/api/src/data-export/snapshot.ts` and its type

- `RAW_SECTIONS`, after line 33 (`"saved_questions",`), as the last member:

```ts
  // The public debates the person upvoted (0193, identity.read_data_export_public_debate_upvotes): the debate and the time only.
  "public_debate_upvotes",
```

- `KEEP_COLUMNS`, after line 159 (`saved_questions: [...]`):

```ts
  // 0193's reader, per upvote. The archive names the debate by its public reference; nothing about the account is kept.
  public_debate_upvotes: ["publication_ref", "created_at"],
```

- `collectSnapshot`, in the `account` object after line 624 (`questions_not_started: ...`), as its last member:

```ts
        // 0193: the public debates the person upvoted, oldest first as the reader gives them; named as reports_you_made names a debate.
        debates_you_upvoted: simple("public_debate_upvotes").map(({ publication_ref, created_at }) => ({ debate_reference: string(publication_ref), upvoted_at: created_at })),
```

  The `simple` helper's `Exclude<>` list on line 597 does not change.
- `apps/api/src/data-export/types.ts` line 101: `questions_not_started: Row[] }>;` becomes

```ts
    questions_not_started: Row[];
    /** 0193: the public debates the person upvoted, each by its public reference, with when. */
    debates_you_upvoted: Row[] }>;
```

- [ ] **Step 9: The README sentence** in `apps/api/src/data-export/readme.ts` line 27

Append one sentence inside the string, after `with your answers and paths.` The line then ends:

```
It also holds the questions you have not started yet, with your answers and paths. It also holds the public debates you upvoted, and when.",
```

**Gate:** do not start this step until the orchestrator says the owner approved the sentence (see the owner gate at the top). Nothing before it on the line changes. If the approved sentence differs, use the approved one here and in Step 2's README case.

- [ ] **Step 10: Run the new test, the two pins of Steps 5 and 6, and the pin search: green**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/public-debate-upvotes-export.test.ts
```

Expected: `Tests  7 passed (7)`.

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/data-export-snapshot.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/sf-s04-data-export.test.ts
```

Expected: `Tests  16 passed (16)` and `Tests  3 passed (3)`.

Check that no pin was missed:

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools grep -rnE 'worker_count !== 25|"worker", 24\)' packages apps tests
```

Expected: no output (exit code 1).

- [ ] **Step 11: Verify**

Unit and architecture files, one vitest run per file:

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'for f in tests/unit/public-debate-upvotes-export.test.ts tests/unit/sf-s04-data-export.test.ts tests/unit/v4-account-memory-export.test.ts tests/unit/saved-questions-export.test.ts tests/unit/data-export-archive.test.ts tests/unit/data-export-service.test.ts tests/unit/data-export-snapshot.test.ts tests/unit/public-report-carrier-export.test.ts tests/unit/web-evidence-export.test.ts tests/unit/pre-start-charge.test.ts tests/unit/threat-reports-removed.test.ts tests/unit/data-export-html.test.ts tests/unit/r2-split-archive.test.ts tests/architecture/dig-model-0134-contract.test.ts tests/architecture/dig-picks-0135-contract.test.ts tests/architecture/investigation-reports-0136-contract.test.ts tests/architecture/report-export-0152-contract.test.ts; do echo "== $f"; pnpm exec vitest run "$f" 2>&1 | grep -E "Test Files|Tests "; done'
```

Expected, in order, `Test Files  1 passed (1)` each, with these test counts (the baseline of the untouched tree, plus the new file): 7, 3, 14, 8, 13, 24, 16, 2, 9, 5, 5, 12, 40, 13, 13, 14, 10. No line says `failed`.

Types:

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run typecheck
```

Expected: exit code 0, no error line.

Database files (embedded PostgreSQL; each takes 10 to 80 seconds). Only the third is in the pull-request gate (`tests/ci-integration-auth.txt:28`), so the other seven are proven here or nowhere. The first five call the real boot check or the real `readRaw` on the worker login, which now runs 0193's reader; the last three load `raw-a.json`.

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'for f in tests/integration/data-export-database.test.ts tests/integration/data-export-e2e.test.ts tests/integration/italy-approval-signup-database.test.ts tests/integration/rls-boot-attestation.test.ts tests/integration/rls-readers.test.ts tests/integration/synthesis-check-export.test.ts tests/integration/side-by-side-run-ref.test.ts tests/integration/publication-review-export.test.ts; do echo "== $f"; pnpm exec vitest run "$f" 2>&1 | grep -E "Test Files|Tests "; done'
```

Expected, in order, `Test Files  1 passed (1)` each, with test counts 19, 16, 5, 10, 39, 6, 4, 4 (the baseline of the untouched tree, plus `E16` in the second file). A failure with `DATA_EXPORT_DATABASE_ROLE_MUST_BE_ISOLATED` or `function identity.read_data_export_public_debate_upvotes(uuid, uuid) does not exist` means step 0193 is not applied in this tree: go back to Step 1.

Last, the tree holds only this task's files:

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short
```

Expected: the sixteen modified files and the one new file from **Files**, and nothing else of yours.

- [ ] **Step 12: Commit**

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add packages/db/src/data-export.ts apps/api/src/data-export/snapshot.ts apps/api/src/data-export/types.ts apps/api/src/data-export/readme.ts tests/fixtures/data-export/raw-a.json tests/fixtures/data-export/snapshot-a.ts tests/unit/data-export-service.test.ts tests/unit/data-export-archive.test.ts tests/unit/sf-s04-data-export.test.ts tests/unit/v4-account-memory-export.test.ts tests/unit/saved-questions-export.test.ts tests/architecture/dig-model-0134-contract.test.ts tests/architecture/dig-picks-0135-contract.test.ts tests/architecture/investigation-reports-0136-contract.test.ts tests/architecture/report-export-0152-contract.test.ts tests/integration/data-export-e2e.test.ts tests/unit/public-debate-upvotes-export.test.ts
```

```
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "The account export holds the public debates the person upvoted, and when." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

Expected: one commit with 17 files changed. Never `git add -A` or `git add .`. The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The last `-m` is the attribution line; if your session's instructions give another one, use theirs.
