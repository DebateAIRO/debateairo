### Task T15: Closing registrations and the full gates

The last task of the slice (design §6, last bullet; §8). Two closed lists were left to this task alone by every
other task: the shipped-file manifest and the list of database suites CI runs on a pull request. This task fills
both, pins them with one small test, then runs every gate once over the whole slice and reports what this machine
can prove and what only the pull request can. It writes no product code and fixes no other task's file.

Depends on: **every other task** (T01 to T14 and T16) being committed on this branch, and on T17's report (the
website built and the control looked at in a browser; T17 commits nothing and leaves the tree clean). Runs alone,
last.

Every command is written out with this prefix, from the code root:
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

**Files:**
- Create: `tests/architecture/public-debate-upvotes-closing.test.ts`
- Modify: `tests/support/shipped-corpus.manifest.txt` — six sorted lines, between today's `:164-165`, `:618-619`,
  `:1017-1018`, `:1359-1360`, `:1379-1380` (written by the update command of Step 5, not by hand)
- Modify: `tests/ci-integration-auth.txt:155` (six lines appended after the file's last line)
- Test: the new file; `tests/unit/s1-1-depth-contract.test.ts`; `tests/architecture/ci-known-red-gate.test.ts`;
  `tests/architecture/ci-security-gates.test.ts`; then the gates of Steps 9 to 14

**Interfaces:**
- Consumes (file names only; nothing is imported):
  - shipped files: `packages/db/src/migration-forward0193.ts` (T01), `packages/db/src/public-debate-upvote.ts`
    (T05, extended by T16), `apps/api/src/public-vote.ts` (T07), `apps/api/src/public-vote-sweep.ts` (T16),
    `apps/ui/lib/upvoteWords.ts` (T09), `apps/ui/components/LibraryVote.tsx` (T11);
  - database suites: `tests/integration/public-debate-upvotes-0193.test.ts` (T02),
    `tests/integration/public-debate-upvotes-repository.test.ts` (T05, extended by T16),
    `tests/integration/public-vote-flow.test.ts` (T08).
- Produces: nothing another task imports. Its result is the report of Step 16.

**Before you start:**
- `tests/architecture/saved-questions-0162-contract.test.ts:29-30` — copy `ROOT` and `read`; `:317` is the house
  way to pin a suite on the pull-request list.
- `tests/ci-integration-auth.txt:152-155` — the entry style: one `# … (step number): what it proves.` line, then
  the path. `:17`: a path that does not exist fails the gate.
- `tests/support/shippedCorpusManifest.ts:53-74` and `tests/unit/s1-1-depth-contract.test.ts:297-300`, `:391-396`
  — what the manifest scan covers (`.ts .tsx .mts .mjs` under `packages`, `apps`, `web`) and how it is rewritten.
- `tools/ci-known-red.mjs:265`, `:468`, `:501-517` — the lines the gate prints.

Traps.
- The prefix sets `PATH` and `DEVELOPER_DIR` for ONE command. A pipe, a loop or `$(…)` goes inside `sh -c '…'`,
  as written below. Without it the second command runs on the machine's Node 22.
- The update command of Step 5 writes every matching file that is ON DISK into the manifest, tracked or not. A
  stray file would be pinned. Step 1 proves there is none.
- Never edit `tests/ci-known-red.txt` or `tests/ci-flaky.txt` (the lists may only shrink,
  `tools/ci-known-red.mjs:24-31`), `tests/ci-integration-all.txt` (its glob at `:35` already takes the new suites)
  or `tests/support/master-key-files.txt`.
- No figure of the vote budget in the list's comments or in the commit message: the limits check reads added
  lines and commit messages (`tools/limits-check.mjs:12`).
- This machine has Node 26.9.0. Thirty tests in three files demand 26.8.2 exactly, so the unit gate here can never
  print `new=0`. `pnpm run lint` exits 1 on the untouched tree and is not a judge.
- From 2 December 2026 (UTC) one more test turns red whatever this slice does:
  `tests/architecture/dependency-floors.test.ts > advisories the dependency audit passes over > names each one by
  its GitHub advisory id, under an unexpired \`drop after YYYY-MM-DD\` comment` (`:301`; the date is
  `pnpm-workspace.yaml:54`). On or after that day expect `new=31` and name it in the report.
- A red that belongs to another task is reported with its owner (table in Step 10). Do not fix it here.
- T17 ran the development website in this tree. If Step 1 prints `apps/ui/.next-v4mock`, `apps/ui/next-env.d.ts`
  or `apps/ui/tsconfig.json`, T17's clean-up was not done: stop and report it, do not clean it up silently.

- [ ] **Step 1: Prove the branch holds the whole slice and nothing stray**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short --untracked-files=all -- packages apps web tests migrations tools
```

Expected: no output. Any line means an earlier task did not commit, or a stray file: stop and report it.

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'B="$(git merge-base HEAD origin/dev)"; echo "base $B"; echo "-- shipped"; git diff --name-only --diff-filter=A "$B" HEAD -- packages apps web | grep -E "\.(ts|tsx|mts|mjs)$" | grep -vE "(^|/)(node_modules|generated|dist|build|__tests__|\.next[^/]*)/"; echo "-- integration"; git diff --name-only --diff-filter=A "$B" HEAD -- tests/integration; echo "-- ui node tests"; git diff --name-only --diff-filter=A "$B" HEAD -- apps/ui | grep -E "(^|[.-])test\.mjs$"; echo "-- removed or renamed"; git diff --name-only --diff-filter=DR "$B" HEAD -- packages apps web tests/integration'
```

Expected (the base is `c946564beba6fd1072975afc73bd322f239c2a81` unless a newer `dev` was merged in since):

```
base c946564beba6fd1072975afc73bd322f239c2a81
-- shipped
apps/api/src/public-vote-sweep.ts
apps/api/src/public-vote.ts
apps/ui/components/LibraryVote.tsx
apps/ui/lib/upvoteWords.ts
packages/db/src/migration-forward0193.ts
packages/db/src/public-debate-upvote.ts
-- integration
tests/integration/public-debate-upvotes-0193.test.ts
tests/integration/public-debate-upvotes-repository.test.ts
tests/integration/public-vote-flow.test.ts
-- ui node tests
-- removed or renamed
```

Rules when it differs:
- One of the six or the three is missing: its task is not on the branch. Stop and report.
- An extra `shipped` path: add it to `SHIPPED` in Step 2; Step 5 writes it into the manifest with the rest.
- An extra `integration` path: add it to `SUITES` in Step 2 and give it its own comment and path line in Step 7.
- A `ui node tests` line: it must already be in `apps/ui/scripts/node-test-manifest.json`
  (`tests/unit/v2ui-node-runner.test.ts:12-21` compares). If it is not, report it to its task.
- A `removed or renamed` line: stop and report. The slice removes nothing.

- [ ] **Step 2: Write the closing test**

`tests/architecture/public-debate-upvotes-closing.test.ts`. First line `// tests/architecture/public-debate-upvotes-closing.test.ts`,
then a short comment saying what it guards (design §6: the shipped-file manifest and the CI integration list).

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");

/** The database suites this slice adds. Each runs on every pull request. */
const SUITES = [
  "tests/integration/public-debate-upvotes-0193.test.ts",
  "tests/integration/public-debate-upvotes-repository.test.ts",
  "tests/integration/public-vote-flow.test.ts"
] as const;
/** The shipped source files this slice adds. */
const SHIPPED = [
  "apps/api/src/public-vote-sweep.ts",
  "apps/api/src/public-vote.ts",
  "apps/ui/components/LibraryVote.tsx",
  "apps/ui/lib/upvoteWords.ts",
  "packages/db/src/migration-forward0193.ts",
  "packages/db/src/public-debate-upvote.ts"
] as const;

describe("public debate upvotes: the closing registrations", () => {
  it("runs each of the slice's database suites on every pull request, once, under a comment naming step 0193", () => {
    const lines = read("tests/ci-integration-auth.txt").split("\n");
    for (const suite of SUITES) {
      expect(existsSync(new URL(suite, ROOT)), suite).toBe(true);
      expect(lines.filter((line) => line === suite), suite).toEqual([suite]);
      expect(lines[lines.indexOf(suite) - 1], suite).toMatch(/^# [^\n]*\(0193\): [^\n]+\.$/u);
    }
  });

  it("leaves no upvote suite of tests/integration off that list", () => {
    const lines = read("tests/ci-integration-auth.txt").split("\n");
    const unlisted = readdirSync(new URL("tests/integration", ROOT))
      .filter((name) => /^public-(?:debate-upvote|vote)[\w.-]*\.test\.ts$/u.test(name))
      .map((name) => `tests/integration/${name}`)
      .filter((path) => !lines.includes(path));
    expect(unlisted).toEqual([]);
  });

  it("names each of the slice's shipped files in the shipped-file manifest", () => {
    const manifest = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of SHIPPED) {
      expect(existsSync(new URL(path, ROOT)), path).toBe(true);
      expect(manifest, path).toContain(path);
    }
  });

  it("adds no known-red and no host-sensitive entry", () => {
    for (const list of ["tests/ci-known-red.txt", "tests/ci-flaky.txt"]) {
      expect(read(list), list).not.toMatch(/upvote|public-vote|library-vote/iu);
    }
  });
});
```

- [ ] **Step 3: Run it, red**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/public-debate-upvotes-closing.test.ts
```

Expected: `Tests  3 failed | 1 passed (4)`. The first three fail (no list names the files yet); the fourth passes.
A failure of `existsSync` (`expected false to be true`) is not this red: a file of Step 1 is missing.

- [ ] **Step 4: Run the manifest's own test, red**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
```

Expected: `Tests  1 failed | 1010 passed (1011)`. The failure is
`S1-1 · the depth bound has a single source > parses every shipped file with no syntactic diagnostic`, and its
diff shows `added` holding exactly the `-- shipped` paths of Step 1 and `missing: []`. A path under `added` that
Step 1 did not print is a file on disk that git does not know: stop, do not run Step 5. Any other failing test in
this file (a parse diagnostic, a depth-bound site) is a defect in a shipped file: report it to that file's task.

- [ ] **Step 5: Register the shipped files (closed list: `tests/support/shipped-corpus.manifest.txt`)**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools SHIPPED_CORPUS_MANIFEST_UPDATE=1 pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git diff --numstat -- tests/support/shipped-corpus.manifest.txt
```

Expected from the second: `6	0	tests/support/shipped-corpus.manifest.txt` (six lines added, none removed; the
header is unchanged). The six lines, and where `git diff` must show them:

| New line | Its line number after the edit | Directly after |
|---|---|---|
| `apps/api/src/public-vote-sweep.ts` | 165 | `apps/api/src/public-tree.ts` |
| `apps/api/src/public-vote.ts` | 166 | the line above; before `apps/api/src/publication-check/check.ts` |
| `apps/ui/components/LibraryVote.tsx` | 621 | `apps/ui/components/LibraryComposer.tsx` |
| `apps/ui/lib/upvoteWords.ts` | 1021 | `apps/ui/lib/types.ts` |
| `packages/db/src/migration-forward0193.ts` | 1364 | `packages/db/src/migration-forward0192.ts` |
| `packages/db/src/public-debate-upvote.ts` | 1385 | `packages/db/src/private-stream.ts` |

A removed line, or an added line that is not a `-- shipped` path of Step 1: run
`git checkout -- tests/support/shipped-corpus.manifest.txt`, then stop and report.

- [ ] **Step 6: Run the manifest's test without the update switch, green**

Run the Step 4 command. Expected: `Tests  1011 passed (1011)`.

- [ ] **Step 7: Register the database suites (closed list: `tests/ci-integration-auth.txt`)**

Append these six lines after line 155 (`tests/integration/registration-country-0192.test.ts`, the file's last
line). No blank line between them; the file still ends with one newline.

```
# Upvotes on public debates (0193): one vote per account and debate, counts for public debates only and the same for every caller, a vote goes with its account and with a debate gone for good, and no login reads the table.
tests/integration/public-debate-upvotes-0193.test.ts
# The upvote repositories (0193): the vote, its withdrawal and the own-votes read on the request login inside a request; the public list's counts and the sweep of debates gone for good on the system login.
tests/integration/public-debate-upvotes-repository.test.ts
# An upvote end to end (0193): the API's own routes on the product's logins: cast, counted for every reader, taken back, kept under a hold, swept when its debate is gone, and braked per account.
tests/integration/public-vote-flow.test.ts
```

- [ ] **Step 8: Run the list's tests, green**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/public-debate-upvotes-closing.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/ci-known-red-gate.test.ts
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run tests/architecture/ci-security-gates.test.ts
```

Expected, in order: `Tests  4 passed (4)`; `Tests  38 passed (38)`; `Tests  18 passed (18)` (the last two are
today's counts; the third refuses a listed path that does not exist, `:84-86`).

- [ ] **Step 9: Full recipe, part 1 — generated client, both typechecks, the legal checks**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:contract
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run typecheck
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter dialectical-engine-v2ui typecheck
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run generate:legal:check
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm run legal:release-check
```

| Command | Expected |
|---|---|
| `generate:contract` | exit 0; writes the git-ignored `packages/contract/generated/` |
| `typecheck` | exit 0, no `error TS` line (it covers `tests/**/*.ts`, so the new test too) |
| UI `typecheck` | exit 0. No CI job runs this one; nothing else typechecks `apps/ui` |
| `generate:legal:check` | exit 0; every line ends `: up to date` |
| `legal:release-check` | exit 0; `Legal texts: ready for release. Every language this release offers (ar, bg, … zh) follows the current English text, and the archive holds their current texts.` |

- [ ] **Step 10: Full recipe, part 2 — the unit gate (CI job `verify-tests`)**

It runs every file under `tests/unit`, `tests/architecture` and `tests/render`: the audits, the chain pins, the
route and grant lists, the token test, the whole UI node suite. About 7 minutes side by side on this Mac, quiet
until the end. Give it a 20-minute limit or run it in the background.

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools CI_TEST_FILES_SIDE_BY_SIDE=1 sh -c 'pnpm run test:ci-gate > "${TMPDIR:-/tmp}/upvotes-unit-gate.log" 2>&1; echo "exit=$?"; grep -aE "^CI_(GATE_SCOPE|KNOWN_RED_GATE)" "${TMPDIR:-/tmp}/upvotes-unit-gate.log"'
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'sed -n "/^NEW failures/,\$p" "${TMPDIR:-/tmp}/upvotes-unit-gate.log" | grep -aE "^  tests/" | grep -avE "^  tests/unit/(upload-check-run|preview-auth-dev-binding|preview-lifecycle-unlock)\.test\.ts > "; echo "foreign=$?"'
```

Expected from the first (exit 1 is this machine's baseline: the thirty Node-pin tests):

```
exit=1
CI_GATE_SCOPE files=<1990 on the base commit, plus the slice's new test files> tests=<n>
CI_KNOWN_RED_GATE new=30 known=3 stale=0
```

Expected from the second: only `foreign=1` (no NEW name outside the three Node-pin files). Each line it prints
before that is a failure of this slice. `stale` above 0, `known` other than 3, or the line
`listed test files vitest did not run` is a failure too. Find the owner by the failing file:

| Failing test file | Owner |
|---|---|
| `migration-forward-chain`, `migration-n1-audit`, `public-debate-upvotes-0193-contract`, `scaffold` (a migration line) | T01 |
| `p3-production-database-principals`, `n1-baseline` | T02 |
| `synthesis-check-wire`, `s8-publication-contract`, `public-votes-contract` | T03 |
| `b10-admission-policy-register`, `public-vote-budget` | T04 |
| `sf-s04-data-export`, `saved-questions-export`, `v4-account-memory-export`, `data-export-*`, `dig-model-0134-contract`, `dig-picks-0135-contract`, `investigation-reports-0136-contract`, `report-export-0152-contract`, `public-debate-upvotes-export` | T06 |
| `s7-authorization`, `web-contract`, `dig-model-contract`, `public-vote-routes`, `s8-publication`, `s8-publication-http` | T07 |
| `rls-cross-account-sites` (a site in `apps/api/src/main.ts`) | T07 or T16, by the commit that added it |
| `rls-db-cross-account-sites` (a site in `packages/db`) | T05 or T16, by the commit that added it |
| `public-upvote-words`, `v2ui-node-runner` (a catalogue or `translate` line) | T09 |
| `t9-mode-tokens`, `library-vote-css`, `kbd-r4-e-forced-colors` | T10 |
| `library-vote` | T11 |
| a failure of the website's build or a look that differs from design §4 (T17's report, not a gate) | T10, T11, T12 or T13, as T17 names it |
| `t3-library`, `locale-leftovers`, `v2ui-node-runner` (`debateReferenceDesign.source-test`) | T12 |
| `v4-mock-public-votes`, `v4-mock-api` | T13 |
| `legal-*`, `preview-release-guide`, `data-export-privacy-policy` | T14 |
| `public-vote-sweep` | T16 |
| `s1-1-depth-contract`, `public-debate-upvotes-closing`, `ci-security-gates`, `ci-known-red-gate` | T15 (this task) |

- [ ] **Step 11: Full recipe, part 3 — the integration gate (CI job `auth-integration`)**

87 files, each on its own embedded PostgreSQL (84 before this task, counted from the list). No Docker. Give it a
30-minute limit or run it in the background.

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools CI_TEST_FILES_SIDE_BY_SIDE=1 sh -c 'pnpm run test:ci-integration > "${TMPDIR:-/tmp}/upvotes-integration-gate.log" 2>&1; echo "exit=$?"; grep -aE "^CI_(GATE_SCOPE|KNOWN_RED_GATE)|refusing to report a green gate" "${TMPDIR:-/tmp}/upvotes-integration-gate.log"'
```

Expected:

```
exit=0
CI_GATE_SCOPE files=87 tests=<n>
CI_KNOWN_RED_GATE new=0 known=0 stale=0
```

This baseline was never taken on this machine (the untouched tree's run of this list was not made). `known=0`
follows from `tests/ci-known-red.txt` holding no `tests/integration` entry. If it is not what you see:
- A NEW name in one of the slice's files (the three of Step 7, `identity-database`,
  `security-review-hardening-database`) is the slice's: report it with its task (T02, T05, T08, T16).
- A NEW name elsewhere: run that one file alone (`pnpm exec vitest run <path>`, with the prefix). Passing alone
  means the machine was too busy; say so in the report and list nothing. Failing alone: report it as NOT JUDGED,
  with the test's name and the first lines of its message. There is no baseline to compare with.
- `vitest reported failure but named no failing test; refusing to report a green gate`: an error outside any test.
  Seen once while this plan was written, on a busy machine: `tests/integration/preview-auth-dev-fallback.test.ts`
  printed `Errors  2 errors` with all 4 tests passing, and none on the next run. Find the file with
  `grep -an "Unhandled" "${TMPDIR:-/tmp}/upvotes-integration-gate.log"`, run it alone, and report both results.

- [ ] **Step 12: Full recipe, part 4 — the database suites no CI job runs**

These five are not on the pull-request list, and the slice changes what they read (T01, T05, T06). Each takes one
to two minutes.

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'for f in tests/integration/s8-publication-database.test.ts tests/integration/rls-readers.test.ts tests/integration/migration-per-step.test.ts tests/integration/data-export-database.test.ts tests/integration/data-export-e2e.test.ts; do echo "== $f"; pnpm exec vitest run "$f" 2>&1 | grep -aE "Test Files|Tests |Errors"; done'
```

Expected: five `== ` lines, each followed by `Test Files  1 passed (1)` and one `Tests  <n> passed (<n>)` line; no
`failed`, no `Errors`. `tests/integration/data-export-e2e.test.ts` shows 16 tests: T06 added its case `E16`, the one
test that carries a real vote row from the table into `account.json`. Owners: `s8-publication-database` and `rls-readers` T05, `migration-per-step` T01, the
two `data-export` files T06.

- [ ] **Step 13: Full recipe, part 5 — what the slice must not have touched**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'B="$(git merge-base HEAD origin/dev)"; git diff --name-only "$B" HEAD -- packages/db/src/index.ts tests/ci-known-red.txt tests/ci-flaky.txt tests/ci-integration-all.txt tests/support/master-key-files.txt pnpm-lock.yaml pnpm-workspace.yaml "*package.json"; echo "-- migrations"; git diff --name-only "$B" HEAD -- migrations'
```

Expected, exactly:

```
-- migrations
migrations/0193_public_debate_upvotes.sql
migrations/lineage/README.md
migrations/lineage/public-debate-upvotes-forward0193.json
```

Why each: the db package index is byte-pinned (design §6; `tools/orphan-audit/src/index.ts:678`); the red and
flaky lists only shrink; the all-integration list is a glob; no test of this slice needs the master key; no new
dependency, so the 37 edge rows and the dependency audit are `dev`'s; an expand step edits no earlier step. A
line before `-- migrations`, or any other migration path, is reported with the commit that made it
(`git log --oneline -- <path>`).

- [ ] **Step 14: Stage and run the limits check on the staged text**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git add tests/architecture/public-debate-upvotes-closing.test.ts tests/support/shipped-corpus.manifest.txt tests/ci-integration-auth.txt
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools node tools/limits-check.mjs --staged
```

Three `git add` paths. Never `git add -A` or `git add .`. Expected from the check:
`LIMITS_CHECK_NO_LIST: …` then `LIMITS_CHECK_OK <n> added line(s) read.`, exit 0. If it refuses a line, report it;
do not add the mark `limits-check-ok`.

- [ ] **Step 15: Commit**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git commit -m "Upvotes on public debates are closed for CI: the shipped-file manifest names the slice's six new files, and the pull-request integration list runs its three database suites." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
```

The commit goes to the branch `feat/2026-11-26-public-debate-upvotes` in this worktree; nothing is pushed. The
last `-m` is the attribution line; if your session's instructions give another one, use theirs. If Step 1 added a path to `SHIPPED` or `SUITES`, say the true number in the message.

- [ ] **Step 16: After the commit — the whole branch against its base, and the report**

```bash
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools sh -c 'node tools/limits-check.mjs --base "$(git merge-base HEAD origin/dev)"; echo "exit=$?"'
cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools git status --short
```

Expected from the first: `LIMITS_CHECK_NO_LIST: …`, `LIMITS_CHECK_OK <n> added line(s) read.`, `exit=0`. It reads
every line the slice added and every commit message since the base. A `LIMITS_CHECK_NOTE` line is copied into the
report (a reviewer looks at each marked line). This machine has no list of real figures, so only the shape half
ran. Expected from the second: nothing, or only `??` lines under `docs/superpowers/` (the plan and the design,
untracked before this task).

Report, as the task's result: the two `CI_KNOWN_RED_GATE` lines and their `CI_GATE_SCOPE` lines; every name the
`foreign` filter printed; the five results of Step 12; the output of Step 13; and this list, word for word, of
what the pull request alone can show (the workflow files are in `.github/workflows/` at the repository root, one
folder above the code root):

| Only in CI | Why not here | What to expect |
|---|---|---|
| The thirty Node-pin tests (`upload-check-run`, `preview-auth-dev-binding`, `preview-lifecycle-unlock`) | they demand Node 26.8.2 exactly; this machine has 26.9.0 | `verify-tests` prints `new=0` in each of its four parts, `known` adding up to 3 (`.github/workflows/security.yml:53-57`) |
| `n1-compatibility` | runs the released commit `84891f69c`'s suites on this branch's schema; CI only | triggered because `migrations/**` and `packages/db/**` change; green only with T02's `setAside` entry in `tests/n1-baseline.json`. Its own header says it is not a required check (`n1-compatibility.yml:15`) |
| `registration-integration` | about 34 minutes; path-filtered on the same folders | runs on this pull request; not a required check by its header |
| `pnpm audit --audit-level=moderate` (in `verify-static`) | it sends the dependency list to the registry | the slice adds no dependency (Step 13), so its answer is `dev`'s |
| `secrets` (gitleaks over the pull request's commits) | not installed here | no finding |
| `codeql` | not installed here | may raise `js/missing-rate-limiting` on the three vote routes; they charge the budget first (T07) |
| `limits-check`, list half | the list of real figures is a CI secret | whether the vote budget's default figure is refused is only known there |
| The unit gate after 1 December 2026 | a dated exception in `pnpm-workspace.yaml:54` | one red in `dependency-floors.test.ts`, not this slice's |

Not checked by any gate, here or in CI: a production build of the website (`pnpm --filter
dialectical-engine-v2ui build`). No workflow runs it; the upload check does. In this slice T17 ran it once and
looked at the control in a browser; copy T17's result (the build's exit, the screenshots' folder, anything it could
not do) into the report.
