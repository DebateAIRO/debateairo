### Task T18: Take today's dev and renumber the upvote step to 0194

Added by the orchestrator after T15 (27 November 2026). While the slice was built, `dev` gained 28 commits, among
them database step `0193_google_return_connects_account.sql` (pull request #382). The upvote step was built as 0193
and must become **0194**, with PREVIOUS `0193_google_return_connects_account.sql`. The plan foresaw this: "If
another step lands on `dev` first, this one is renumbered and its manifest redone" (plan index, Global Constraints).
The repository's precedent is commit `f6d17529b` ("Merge origin/dev: the sign-up country read becomes database step
0192, after dev's 0191."): the merge commit itself carries the renumbering.

Every command is run with this prefix:
`cd /Users/vladmihaimiron/Documents/DebateAIRO/.claude/worktrees/public-debate-upvotes/dialectical-engine && PATH=/opt/homebrew/bin:$PATH DEVELOPER_DIR=/Library/Developer/CommandLineTools`

**Files:** whatever the merge and the renumbering touch. Every file of this slice that names the upvote step by its
number, and every closed list both sides edited. Nothing outside those two groups.

**Interfaces:**
- Consumes: `origin/dev` at `9bba78052c53056c67aab297900a40292681d471` (fetch first; if it has moved, use the new tip
  and say so; if the new tip holds a step numbered 0194 or higher, stop and report BLOCKED).
- Produces, the only names that change:

| Was | Becomes |
|---|---|
| `migrations/0193_public_debate_upvotes.sql` | `migrations/0194_public_debate_upvotes.sql` |
| `migrations/lineage/public-debate-upvotes-forward0193.json`, version `public-debate-upvotes-forward0193-v1` | `migrations/lineage/public-debate-upvotes-forward0194.json`, version `public-debate-upvotes-forward0194-v1` |
| `packages/db/src/migration-forward0193.ts` (OURS), `loadForward0193`, prefix `MIGRATION_FORWARD0193_` | `packages/db/src/migration-forward0194.ts`, `loadForward0194`, prefix `MIGRATION_FORWARD0194_`. `migration-forward0193.ts` is `dev`'s file for the Google step after the merge |
| `tests/architecture/public-debate-upvotes-0193-contract.test.ts` | `tests/architecture/public-debate-upvotes-0194-contract.test.ts` |
| `tests/integration/public-debate-upvotes-0193.test.ts` | `tests/integration/public-debate-upvotes-0194.test.ts` |
| every prose or test mention of the upvote step as "0193" | "0194" |

Unchanged: the table, the six functions' names and bodies, the grants, the routes, the contract, the page, the
words, the styles, the legal texts' wording, the step's refusal names (`PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE`,
`PUBLIC_DEBATE_UPVOTES_CONTRACT`).

**Before you start:**
- Read `git show f6d17529b --stat` and skim its diff: it is the same operation one number earlier.
- Read `migrations/lineage/README.md` around the 0192 and 0193 sections, the recipe for computing a manifest's
  digests by hand (the node one-liners near lines 862 and 1334), and the ordinal sentence near line 13.
- Traps:
  - **Do not rename `dev`'s mentions of its own 0193.** A mention of "0193" belongs to the upvote step only when it
    sits in a file or passage this slice wrote. Decide by `git log -L` or `git blame` when unsure.
  - The plan's task files (`docs/superpowers/plans/2026-11-26-public-debate-upvotes/T*.md`) are a record of what was
    planned. Do not rewrite them. In the design document and the plan index, change only the lines that state the
    step's number and its PREVIOUS, and add one sentence in the index's Global Constraints saying the step became
    0194 when `dev` took 0193 (with this task's name).
  - Archived legal copies under `apps/ui/legal/archive/` and the font files merely contain the digits: leave them.
  - The SQL file's own comments name its number. Changing them changes its digest, so the manifest's
    `migration.sha256` and the contract test's pins must follow. The SQL's statements do not change.
  - `previous.manifestSha256` becomes the sha256 of `migrations/lineage/google-return-connects-account-forward0193.json`
    as it is after the merge. `previous.verifierSha256` and `verifier.sha256` are the verifier digests that file's
    own manifest carries (`dev`'s 0193 declares keeps-verifier). Compute every digest from the files, never by hand.
  - Closed lists both sides extended (the STEPS array, `tests/support/forward-chain-steps.ts`, the P3 disclosures
    JSON and its test literal, the census in `tests/integration/security-review-hardening-database.test.ts`, the
    identity inventory, `tests/n1-baseline.json`, `tests/support/shipped-corpus.manifest.txt`,
    `tests/ci-integration-auth.txt`, `migrations/lineage/README.md`, `deploy/preview-auth-dev/v1/MAIN-SITE.md`,
    `tests/unit/preview-release-guide.test.ts`): keep both sides' entries, dev's 0193 first, ours after. Each list's
    own count, ordinal or chain-head case moves by one.
  - The chain-head case in `tests/architecture/migration-forward-chain.test.ts`: the newest step's case pins the
    head with `names.slice(-2)`. After the merge the head is 0194: rewrite dev's 0193 case to find 0193 by name, as
    T01 did for 0192, and make the upvote case the head case.
  - `tests/n1-baseline.json`: `dev` moved the baseline (pull request #387, r34). Keep dev's new baseline and re-add
    this slice's set-aside entry for the identity inventory test with its reason naming 0194, if dev's version
    does not already set it aside.

- [ ] **Step 1: Record BASE and fetch**

`git rev-parse HEAD` (expected `886a532cd`), `git fetch origin`, `git rev-parse origin/dev`.

- [ ] **Step 2: Merge**

`git merge --no-ff --no-commit origin/dev`. List the conflicts with `git diff --name-only --diff-filter=U`.

- [ ] **Step 3: Resolve the conflicts and renumber**

Resolve each conflict by keeping both sides as the traps above say. Rename the files of the table above with
`git mv`, then change every mention the table names. Recompute the SQL's digest, then write the manifest with all
digests computed from files.

- [ ] **Step 4: Check that no mention was missed or overdone**

`git grep -n "0193" -- migrations packages apps tests tools deploy docs/missions docs/legal` and read every hit:
each must be `dev`'s own step, an older unrelated number, or an archived or binary file. `git grep -n "forward0193\|Forward0193"`
must show only `dev`'s Google loader and its own tests.

- [ ] **Step 5: Verify**

Run each, with the prefix. Expected results in brackets.
- `pnpm run generate:contract` and `pnpm run typecheck` and `pnpm --filter dialectical-engine-v2ui typecheck` [each exit 0]
- `pnpm exec vitest run tests/architecture/public-debate-upvotes-0194-contract.test.ts` [all passed]
- `pnpm exec vitest run tests/architecture/migration-forward-chain.test.ts` [all passed]
- `pnpm exec vitest run tests/architecture/migration-n1-audit.test.ts` [all passed]
- `pnpm exec vitest run tests/architecture/p3-production-database-principals.test.ts` [all passed]
- `pnpm exec vitest run tests/architecture/n1-baseline.test.ts` [all passed]
- `pnpm exec vitest run tests/architecture/public-debate-upvotes-closing.test.ts` [4 passed]
- `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts` [all passed]
- `pnpm exec vitest run tests/unit/preview-release-guide.test.ts` [all passed]
- `pnpm exec vitest run tests/integration/identity-database.test.ts` [all passed]
- `pnpm exec vitest run tests/integration/security-review-hardening-database.test.ts` [all passed]
- `pnpm exec vitest run tests/integration/public-debate-upvotes-0194.test.ts` [12 passed]
- `pnpm exec vitest run tests/integration/migration-per-step.test.ts` [all passed]
- `pnpm run generate:legal:check` and `pnpm run legal:release-check` [exit 0, up to date, ready for release]
- the unit gate: `CI_TEST_FILES_SIDE_BY_SIDE=1 pnpm run test:ci-gate` [exit 1 with `CI_KNOWN_RED_GATE new=30 known=3 stale=0`, every new name in the three Node-pin files `upload-check-run`, `preview-auth-dev-binding`, `preview-lifecycle-unlock`; if dev's own changes moved those numbers, show it on dev's tip alone before calling it yours]
- the integration gate: `CI_TEST_FILES_SIDE_BY_SIDE=1 pnpm run test:ci-integration` [exit 0, `new=0 known=0 stale=0`]

- [ ] **Step 6: Commit**

One merge commit carrying the resolution and the renumbering, subject in the precedent's style:
`Merge origin/dev: upvotes on public debates become database step 0194, after dev's 0193.`
Add paths by name (never `-A` or `.`); `git status --short` must print nothing afterwards.
