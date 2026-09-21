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
