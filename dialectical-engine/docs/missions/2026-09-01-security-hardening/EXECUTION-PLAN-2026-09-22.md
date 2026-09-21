# Execution plan — building what the owner ruled (from 2026-09-22)

*Technical record, written for AI agents. The owner's plain-language view of the same plan is in [PLAIN-STATUS.md](PLAIN-STATUS.md).*

**How this runs (the owner's instruction, 2026-09-22):** Claude Fable 5.1 is the coordinator, judge and final reviewer. Claude Opus 5 agents do the building, each in its OWN git worktree on its OWN branch, in parallel where the work is independent. The coordinator reviews every branch, merges what passes into the integration branch, and decides what goes to `dev`. Pushes and every change to the owner's GitHub settings still happen only at the owner's word, in the order ruled in [GITHUB-SETTINGS-RUNBOOK.md](GITHUB-SETTINGS-RUNBOOK.md).

**Spec (binding authority):** the owner's rulings in [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md), including the addendum to V-11. If a task brief and a ruling disagree, the ruling wins — report the conflict instead of choosing.

## Global Constraints

Every task inherits all of these. Breaking one is a defect even if the tests pass.

1. **Never push. Never fetch or pull. Never change anything on GitHub or Cloudflare** (no `gh` call that writes). The coordinator controls every ref that leaves this machine.
2. **Stay inside your assigned worktree and branch.** Never touch another worktree, another branch or the main checkout. Never a bare `git stash`. Never rebase, amend or force anything. Merge only when the brief tells you to.
3. **Commits name their files:** check `git diff --cached --name-only` first, then `git commit -F - -- <explicit paths>` — a bare `git commit` is forbidden except to conclude a merge the brief ordered. Conventional prefix, imperative subject, body cites the decision or finding id (`V-22`, `DL4-F4`, …), and keep the co-author trailer your own session instructions give you.
4. **RED before GREEN, with evidence.** Every behaviour change starts with a focused test that fails for the right reason (`pnpm exec vitest run <file>`), then the smallest change that makes it pass, then `pnpm run typecheck`. Record both outputs. Run `tsc` AFTER adding a test, not before. UI behaviour tests belong in `apps/ui/**/*.test.mjs` plus the node-test manifest and `shipped-corpus.manifest.txt`; a `tests/unit` file must never import from `apps/ui` (the root tsconfig excludes it).
5. **A sealed register value is never edited** — it is superseded by a new versioned row that cites the ruling. The historical bootstrap set is sealed by hash: a new policy row is a DEPLOYMENT row, never a bootstrap row. If you find yourself editing a sealed value, stop and report.
6. **Fail-closed house style:** refuse with a typed `UPPER_SNAKE` code; never repair silently; never log secret material or model-written text. Errors are `TypeError` or typed classes carrying a `code`.
7. **Never a one-computer path** in code, tooling, tests or documented commands. Deduce it (search the PATH, ask git, use an environment override) and fail loudly when it cannot be found.
8. **Never run a binary you have not verified** is a real program: non-empty, executable, and `file` reports a shebang script or a Mach-O/ELF executable. Never launch one through a shell fallback. Never download and run a tool. `gitleaks` is not installed on this machine and must not be installed.
9. **Migrations:** never edit an existing migration file. New files only, using the numbers your brief assigns.
10. **Documents the owner may read:** a fenced code block contains only real commands that are safe to paste as-is — no placeholders in angle brackets, no "command → result" illustrations. Results go in a table or in prose with the arrow →.
11. **Host quiet rule:** other Claude sessions may be running long suites on this machine. Before a heavy suite, look (`ps -Ao pid,etime,command`) and wait if one is running; never kill a process you did not start. Never start, stop or reconfigure Docker; run database-backed suites only if the brief says so and the stack is already up.
12. **Fresh-worktree provisioning is mandatory:** `pnpm install --frozen-lockfile`, then `pnpm run generate:contract` (without it typecheck reports about 157 errors). Never add a `minimumReleaseAgeExclude` entry: a version younger than 7 days means BLOCKED — report the package, version and publish date.
13. **No subagents, no scope creep.** Do the task yourself; build only what the brief asks; follow the patterns already in the codebase. If you are blocked or unsure, stop and report `BLOCKED` or `NEEDS_CONTEXT` — bad work is worse than no work.
14. **Coordinator-owned files — do not edit:** `PLAIN-STATUS.md`, `V-DECISIONS-PACKET.md`, `DECISIONS-EXPLAINED.md`, `DEV-SYNC-2026-09-18.md`, `GITHUB-SETTINGS-RUNBOOK.md`, `HANDOFF-PROMPT.md` and this file. Write your own record where your brief says.
15. **Defensive-only, own application only.** No probing of any third-party host.

## Report contract (every task)

Write the full report to the report file named in your dispatch: what you did; every conflict or design choice and why; **TDD evidence** (RED: command, the failing output, why that failure was the expected one; GREEN: command and passing output); the verification table with the exact commands and the tail of their output; files changed; commits (short SHA + subject); self-review findings; open issues. Then reply to the coordinator in under 15 lines: **Status** (`DONE` / `DONE_WITH_CONCERNS` / `BLOCKED` / `NEEDS_CONTEXT`), commits, a one-line test summary, concerns, the report path.

---

## Task 1: SYNC2 — merge `origin/dev` into the security line

**Why.** `dev` moved 36 commits after this line last merged it (merge base `7bae9806`, `origin/dev` = `cbf1b281`, fetched by the coordinator on 2026-09-22). The other workstream moved the project to Node 26 and vitest 5 on purpose and deliberately did not take this line in. Every later task branches from your result, so this task is the foundation.

**Where.** The coordinator has created your worktree and your branch `security/dev-sync-2026-09-22` from the tip of `security/dev-sync-2026-09-18`. The product tree is `dialectical-engine/` inside it. If `git rev-parse origin/dev` does not start with `cbf1b281`, stop and report.

**Step 1 — merge.** `git merge --no-ff origin/dev` (never rebase). The coordinator's in-memory trial reported exactly 8 conflicting paths:
`dialectical-engine/apps/runner/src/index.ts`, `dialectical-engine/apps/ui/package.json`, `dialectical-engine/package.json`, `dialectical-engine/pnpm-lock.yaml`, and `dialectical-engine/tests/architecture/` `s04-contract.test.ts`, `s10-carrier-erasure-red.test.ts`, `s13-contract.test.ts`, `s14-contract.test.ts`. If you see a different set, say so in the report.

**Step 2 — resolve, by these rules.** The principle of the first sync stands (read the conflict table in `DEV-SYNC-2026-09-18.md` for how it was applied): *keep what BOTH sides meant; a security protection never gives way to a tidy-up — it is re-fitted inside the newer code.*

- **`package.json`, `apps/ui/package.json`:** take `dev`'s `engines.node` (`>=26.8.2 <27`) and `dev`'s vitest `5.0.1` with whatever `@vitest/*` packages ride with it — that was their ruled decision (their D78). KEEP this line's `fastify` `5.12.1` (a security fix; `dev` still has `5.11.2`, the version with the advisories). KEEP this line's removal of `drizzle-kit` and `drizzle.config.ts` (owner ruling V-13) — if `dev`'s side lists it, the removal wins. Keep every other dependency floor this line added; take `dev`'s other dependency changes.
- **`pnpm-workspace.yaml`** (not in the conflict list — check it anyway): the `fast-uri` and `qs` overrides and every other override of this line must survive, as must `minimumReleaseAge`. Do not prune the dated exclusions here; that is Task 2's job.
- **`pnpm-lock.yaml`:** never hand-merge it. Resolve the manifests first, then let `pnpm install` regenerate the lockfile, then prove `pnpm install --frozen-lockfile` passes. Constraint 12 applies: a too-young version is BLOCKED, never an exclusion.
- **`apps/runner/src/index.ts`:** list this line's commits to the file (`git log --oneline 7bae9806..HEAD -- dialectical-engine/apps/runner/src/index.ts`) and `dev`'s (`git log --oneline 7bae9806..origin/dev -- <same path>`). For EACH of this line's commits, name in your report the behaviour it added and where that behaviour lives after the merge. The ones that must not be lost include: task and schema failures carry codes and paths, never model text (`f9d55a65`, `097f7bbb`, `d710fbc1`); the attempt ceiling checked before every attempt (`assertAttemptAllowed`); and everything the first sync's conflict table records for this file. Run the tests that pin those behaviours and show them green.
- **The four architecture tests:** both sides repaired them. Start from `dev`'s version (the algorithm mission owns those contracts), then re-apply any security-relevant assertion of this line that `dev`'s version lacks. Run each one.
- **`.nvmrc` and `.github/workflows/security.yml`:** both still say `22.23.1`; they must say `26.8.2` (the floor of `dev`'s range, and what this host runs). TEST FIRST: `tests/architecture/ci-security-gates.test.ts` has a case "pins one Node version for humans, CI and the register (L6-F13)" — read it, change its expectation first (RED), then the files (GREEN). Where that case reaches into the register, remember constraint 5 and mirror how `dev` itself recorded its move to Node 26.

**Step 3 — provision and verify.** `pnpm install --frozen-lockfile`, `pnpm run generate:contract`, then, recording each command and the tail of its output:

| Check | Pass condition |
|---|---|
| `pnpm run typecheck` | 0 errors |
| `pnpm run test:ci-gate` | `new` = 0, except the RSS-curve measurement in `registration.test.ts` if it still cannot run under Node 26 (that test is Task 3's; just report its state); `stale` = 0 |
| `pnpm audit --audit-level=moderate` | no known vulnerabilities. Also answer: does vitest `5.0.1` by itself clear the vitest advisory, so that this line's vitest floor can be retired? If a floor must change, `tests/architecture/dependency-floors.test.ts` changes first |
| The UI checks the first sync ran (UI build, the s5 security smoke, the UI node suite — the exact commands are in `DEV-SYNC-2026-09-18.md`) | same results as recorded there, or better |

**Re-baseline `tests/ci-known-red.txt`:** remove every entry whose test now passes (the list may only shrink on its own side). Add an entry ONLY for a failure that also fails on pristine `origin/dev` @ `cbf1b281`, each with a source note naming the evidence — `dev`'s own records name the failures it still owns (search `dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` for D79). A failure that exists only on the merged tree is a defect of this merge: fix it or report it, never list it.

**Step 4 — record.** Write `DEV-SYNC-2026-09-22.md` beside this plan: every conflict (file, what each side meant, the resolution), the per-commit survival table for the runner file, the verification table, every known-red change with its source, open items. Commit it with an explicit file list.

**Not yours:** the RSS-curve re-measurement (Task 3), pruning the dated exclusions (Task 2), any fix the rulings queue for later tasks. If the merge exposes a real problem outside this brief, report it; do not fix it here.

---

## Task 2: HYG-REPO — repository hygiene the owner approved (V-8, V-7, V-18, the package bot's waiting period, V-4's stricter rule)

**Why.** Five small rulings that touch repository plumbing, not product code. Each is its own commit, each test-first. Rulings: rows V-8, V-7, V-18, V-4 and item (3) of row V-2 in `V-DECISIONS-PACKET.md`.

**2a — V-8, delete the dormant pre-push folder.** RED first: an architecture test (beside `tests/architecture/ci-security-gates.test.ts`) asserting that `dialectical-engine/.husky` does not exist and that no `package.json` script invokes husky. Then delete `.husky/`; if `husky` is a dependency that nothing else uses, remove it and let `pnpm install` update the lockfile (`pnpm install --frozen-lockfile` must pass afterwards).

**2b — V-7, stop tracking two classes of bulky file — never whole folders.** Class 1: `.zip` files under `dialectical-engine/.hermes/reports/` (110 files, 466 MiB when measured). Class 2: `.jsonl` files under `dialectical-engine/docs/missions/**/logs/` (22 files, 49 MiB). KEEP the `.jsonl` test fixture under `dialectical-engine/acceptance/test-fixtures/codex-sessions/` and every written record; two architecture tests read `S10-erasure-evidence-artifact.md` from one of those logs folders and must stay green. RED first: a guard test that asks git (`git ls-files`, repository root deduced through git — constraint 7) and asserts that no tracked file belongs to either class. Then untrack them, add ignore rules for exactly those two classes, note in a short record beside this plan (`UNTRACKED-EVIDENCE-2026-09-22.md`) the last commit that still contains the files, and repoint the one document that links to the recordings at that commit. No history rewrite.

**2c — V-18, prune the expired exceptions to the 7-day rule.** `pnpm-workspace.yaml` `minimumReleaseAgeExclude` held 40 entries when measured: 37 dated ones whose drop-after dates (2026-09-02, 2026-09-07) have passed, and 3 undated ones (`@types/node@26.2.0`, `@types/pg@8.21.0`, `tsx@4.23.11`) — SYNC2 may have changed which versions the lockfile needs, so start from what you find. RED first: a test that fails when any exclusion entry lacks a `drop after YYYY-MM-DD` comment or carries a date in the past — so expiry enforces itself from now on. Then remove every entry the lockfile no longer needs or whose version is older than 7 days (publish time from the registry: `pnpm view`); an entry that must stay gets a dated comment. Proof: `pnpm install --frozen-lockfile` passes.

**2d — the package bot's waiting period (row V-2, item 3).** `.github/dependabot.yml` configures weekly version updates for `npm` and `github-actions`. Add a 7-day cooldown to each `updates` entry so the bot obeys the workspace's own `minimumReleaseAge: 10080` (minutes). An invalid file silently stops the bot: confirm the `cooldown` syntax against GitHub's own documentation (docs.github.com — reading that one site is allowed) and quote the passage in your report. RED first: extend `tests/architecture/ci-security-gates.test.ts` so that every `updates` entry must carry a cooldown whose days equal `minimumReleaseAge / 1440` read from `pnpm-workspace.yaml` — the two numbers can then never drift apart.

**2e — V-4, a stale known-failure entry fails the gate.** Today `tools/ci-known-red.mjs` only WARNS when a listed test passes. **Coordinator ruling (recorded in the ledger): implement the owner's intent without cross-run state.** When a listed test passes, the tool re-runs just that test file two more times in the same job; a listed test that passes three consecutive executions FAILS the gate with a message naming the entry to delete. A flaky test must pass three times running to be flagged; a genuinely fixed one is flagged in the very change that fixed it, which is what "the list can only shrink" means. Pure decision logic in exported functions with unit tests (RED first); keep the existing `new` / `known` / `stale` report line intact, because other records quote it.

**Not yours:** the RSS-curve test (Task 3), anything under `apps/` or `packages/` beyond what 2a's dependency removal forces.

---

## Task 3: V-25 — re-measure the memory test under Node 26, as new versions

**Why.** `tests/unit/registration.test.ts` "S3c B4 keeps the isolated production RSS curve below the published measured bound" compares against a bound sealed for `node_v22.23.1_darwin_arm64`. The project now runs Node 26, so the case cannot find a number here and is the gate's one remaining `new` failure. Ruling: row V-25.

**What.** Read how the sealed row and the test look the bound up. Publish the bound for `darwin_arm64` under Node 26.8.2 as a NEW register version keyed by platform + Node version — the Node 22 value stays as history (constraint 5). Measure on a QUIET machine (constraint 11; the coordinator dispatches this task alone for that reason): five rounds, report each, seal with the same headroom rule the original measurement used (find it in the mission records or the test's comments and cite it). Linux keeps its loud skip until CI produces a number — say so in the record; do not invent one. RED first where a lookup changes; then GREEN; then `pnpm run test:ci-gate` must report `new` = 0.

**If the mechanism for adding a platform-keyed version is not evident from the code,** stop with `NEEDS_CONTEXT` and describe the options — do not design a new register shape on your own.

---

## Task 4: HYG-AUTH — three small hardenings of the login surface (V-14, V-22, the e-mail-verification budget order)

**4a — V-14, the password maximum length becomes policy.** Today 1 024 is only a request-shape bound in the route (→ 400) ahead of Argon2. Add a versioned `passwordPolicy` row carrying `max_length: 1024` — a new DEPLOYMENT version that supersedes, never an edit and never a bootstrap row (constraint 5) — and enforce it where the other password rules are enforced. Keep the route-level bound. State in your report which unit the policy's existing length rule uses (bytes or code points) and keep the new one coherent with it. RED first.

**4b — V-22, refuse a stored hash that asks for more than twice the policy.** `ARGON2ID_ENCODING_BOUNDS` (in `packages/crypto/src/argon2-worker-pool.ts`, with a DELIBERATE MIRROR in `argon2-worker.ts` — both change together) accepts up to 262 144 KiB / t=10 / p=4, while the sealed password cost is 65 536 KiB / t=3 / p=1. New rule: an encoded hash whose memory, time or parallelism exceeds 2× the sealed policy that governs THAT use is refused with `ARGON2_ENVELOPE_EXCEEDS_POLICY`. Argon2id runs under more than one sealed cost (password, MFA recovery codes, audit source hashing): derive each ceiling from its own policy, not from one global number. RED first, including a test that every hash minted at each sealed cost still verifies — no real user may be locked out — and one that a 4× record is refused before any allocation happens.

**4c — the e-mail-verification route checks the visitor's budget first.** In `apps/api/src/registration.ts`, `runVerifyEmail` does one indexed lookup (`findAuditIdentityByVerificationHash`) BEFORE `limiter.consume`. Charge or check the per-source budget before that lookup; the per-address budget can still only be charged after it. The refusal must stay identical whether or not the token exists (no enumeration oracle). RED first: with the per-source budget exhausted, the repository lookup is never called and the refusal is the rate-limit refusal. If this needs a new sealed limiter row, constraint 5 applies — report before adding one.

**Not yours:** anything in `packages/crypto/src/index.ts` (Task 6 owns the custody and key-store code; keep your export-list edits there to the single line you need).

---

## Task 5: HYG-DB — three database items (V-17, V-29, B28)

**Needs Docker** (the database-backed suites start their own Postgres through `testcontainers`). The coordinator dispatches this task only once the Docker engine is running; you never start or stop it (constraint 11). Migration numbers are assigned in your dispatch message.

**5a — V-17, the schema mirror.** `packages/db/src/schema.ts` lacks the two `serve.answer` columns that migration `0063_serve_answer_content_carrier.sql` added. Mirror them, and add a test that compares the mirror with the real database for that table so it cannot drift again (RED first — it fails today because the columns are missing).

**5b — V-29, a narrow window instead of `pg_monitor`.** Migration `0059_observation_pg_monitor.sql` made the observation agent's principal a member of `pg_monitor`. Its one query (`query.ts` in the observation agent) reads session counts and states from `pg_stat_activity` — without the `query` column — and `pg_database_size`. In a NEW migration: revoke the membership and grant a definer-owned view or function that exposes exactly those columns, following the project's existing `obs.*_v` security-barrier views. `pg_read_all_stats` alone is NOT enough — it also unlocks other sessions' statement text. RED first: connected as the agent's principal, another backend's statement text is unreadable; the agent's health query still works. Do NOT revoke that principal's INSERT on `observation.threshold_policy` — `oactl thresholds apply` still uses it.

**5c — B28 (finding L5-F9), a tamper check on applied migration files.** The migration ledger stores a `content_sha256` for each applied file; re-running with a changed, already-applied file refuses `MIGRATION_CONTENT_DRIFT`; the two `0025_*` files are recorded as a known ordering pin. The code is around the migration runner in `packages/db/src/index.ts`. Decide and justify how rows applied before this change get their hash (backfill on first run, from the file then on disk, is acceptable if the record says so). RED first.

---

## Task 6: KEY1 — the custody group (V-19), then master-key rotation (V-3)

**Why.** Both block or gate the server move and both touch the same key-handling code, so they are one task in a fixed order. Rulings: rows V-19 and V-3.

**6a — V-19, the custody group.** Today a key file is accepted only if it is owned by the calling uid with mode exactly `0600` and its parent is `0700` and owned by the caller (`packages/crypto/src/index.ts` — the raw-secret loader around the `CryptoCustodyError` checks, and the wrapped-key store; the same rule lives in `apps/api/src/support/keys.ts`). On the VPS two principals, `debateai-api` (read-write) and `debateai-runner` (read-only), must both read the user-DEK store, so the runner fails the owner check. Add an explicit, OPT-IN custody-group mode: when `DEBATEAI_CUSTODY_GROUP` names a group, a key file may be `0640` with its gid equal to that group's gid, and its directory `0750`; everything else stays as strict as today — refused if any world bit is set, if the group is not the named one, if group-WRITABLE, if a symlink, if `nlink` ≠ 1, if the size is wrong. With the setting absent the rule is byte-for-byte today's. Resolve the group name to a gid without a one-computer assumption (constraint 7). RED first, with the whole refusal matrix as table-driven tests. Give the support loader the group mode ONLY if a second principal genuinely needs those keys — check who reads `SUPPORT_KEK_PATH` and its stores, and say what you found. Update the VPS kit (`deploy/vps/`) so its provisioning steps create the group and set the modes; the kit has its own tests — keep them green.

**6b — V-3, master-key (KEK) rotation.** Verified absent today: no `kek_id`, no previous-KEK path, no rotate command. Inventory FIRST, and put the inventory in your report: every place a KEK wraps something — files and database rows — for every KEK the runtime environment names (`KEK_PATH`, `CORPUS_KEK_PATH`, `SUPPORT_KEK_PATH`, and any other you find). Then: v2 wrapped-key records carry a `kek_id`; a record without one keeps working and is read as "wrapped by the original KEK" — that test comes FIRST; a previous-KEK path lets the application read both during a changeover; a rotate command re-wraps every stored key under the new KEK and never re-encrypts content; it is idempotent and resumable, and refuses loudly (typed code) on a record it cannot unwrap with either key. End with a rehearsal on a COPY in a temporary directory, as an automated test: rotate, prove every record still opens, prove the old KEK alone opens nothing. If database rows are wrapped by a KEK, build their re-wrap behind the repository seam with unit tests, write the database-backed test too, and tell the coordinator it needs Docker to run. The operator-facing command and its runbook paragraph belong in the VPS kit; constraint 10 governs every command you document.
