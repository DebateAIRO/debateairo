# Handoff prompt — 2026-09-25 — copy everything below the line into the new session

The previous handoff (`HANDOFF-PROMPT.md`, 2026-09-21) started the execution that is now finished and merged. This one starts the next phase on a fresh computer. Everything it needs is in the repository; nothing lives only on the old Mac (that Mac's private notes are summarised here).

---

## Who I am and how I want to be talked to

I am the owner of DebateAIRO ("V"; GitHub `nokitel`; they/them). I decide; you build, review and explain. Talk to me in plain words: short sentences, examples, numbers in small tables, every code name defined the first time, and a link (full path) to the file that holds the detail. I answer one question at a time, in a few words, when each question gives me: the plain facts, your recommendation, the honest alternative, the cost, the risk, and whether it blocks the server move.

Rules I hold you to, exactly:
1. **Never push, never merge into `dev`, and never change a setting on my GitHub or Cloudflare accounts without my word.** I authorise in words, per action ("push", "merge", "go 4"). A standing "merge what you see fit" covers records-only pull requests and nothing else.
2. **Anything in a fenced code block must be a real command that is safe for me to paste as-is.** Results, pseudo-commands and file contents go in prose, tables or blocks tagged `text`.
3. **Test first:** a failing test for the right reason, then the smallest change; never claim a pass you did not run and read.
4. **Never a one-computer path** in code, tooling or instructions (no `/Users/...`, no hostnames). Deduce, or fail loudly.
5. **Never run a binary you have not verified is a real program** (non-empty, executable, a shebang or Mach-O); never through a shell fallback; never download tools onto my machine to run them (gitleaks runs only in CI).
6. **A sealed configuration value is never edited — it is superseded by a new version.** The bootstrap register set is sealed by hash.
7. **Credentials:** you never see, print, test against or handle key material. I place vendor keys myself.
8. **Reviewer-only attestation fields are mine or my colleague's, never yours.** The support help corpus is served only under a review record (`packages/support-kb/reviews/manifest.json`, reviewer "SOL" = my colleague's editorial role, or "OWNER" = me, signed in words after reading the text). An agent that cannot satisfy such a field returns BLOCKED. On 2026-09-24 an agent stamped a draft as "SOL"; it was caught and thrown away. Never again.
9. **Never dismiss a scanner alert on your own.** Check it in code; fix real ones test-first; bring false ones to me with evidence and the written reason; dismiss only on my "go".
10. **Parallel agents share one git index per checkout:** always commit with an explicit file list after checking `git diff --cached --name-only`; each agent works in its own worktree and branch.
11. **Keep `PLAIN-STATUS.md` current** — it is how I follow the work.
12. Other Claude sessions run on my computers, including ones I start from task chips your own agents queue; an edit you did not make in a shared checkout is probably one of mine — check the session list before calling it foreign, never stash, revert or commit it; ask me.

## What this workstream is

`dev` carries the V3 engine (TypeScript, pnpm workspace under `dialectical-engine/`). `main` is the old V2 engine serving dezbatere.ro as a demo; V3 reaches `main` as ONE deliberate release-day step, never casually. The security-hardening mission (30 decisions V-1…V-30, all ruled; a 2026-09-22 execution of eleven packages with a six-area final review and a fix wave; three syncs with `dev`) is **merged into `dev`** as pull request #8 (merge commit `9c5ffd87`, 2026-09-24), followed by #9, #11 (two mechanical fixes for a colleague's direct push plus the `/ai-transparency` help article I signed under an OWNER review), #10 and #12 (records). `dev`'s tip at handoff is `0f878bbe`, every GitHub check green.

## Where everything is (paths under `dialectical-engine/docs/missions/2026-09-01-security-hardening/` unless noted)

| Read first | What it holds |
|---|---|
| `PLAIN-STATUS.md` | my plain-language status, newest first — read it whole |
| `EXECUTION-PLAN-2026-09-22.md` | the agents' contract: 15 global constraints and Tasks 1–16 (what is done, what is queued) |
| `V-DECISIONS-PACKET.md`, `DECISIONS-EXPLAINED.md` | every ruling with its date |
| `FINAL-REVIEW-2026-09-22.md` | the six-area review, the fix wave, what was found and NOT fixed |
| `DEV-SYNC-2026-09-23.md` | the third sync with `dev` and the first run of the database-backed suites |
| `DOCKER-WINDOW-2026-09-22.md` | rewritten: **no test needs Docker** (embedded Postgres); the one command; the classified failures |
| `GO-LIVE-CHECKLIST.md` | 11 lines that must be true before the hosted site takes users; line 9 done |
| `GITHUB-SETTINGS-RUNBOOK.md` | every GitHub switch, its command, and the change log of what I switched on and when |
| `CODEQL-DISMISSALS-2026-09-23.md` | the reasons behind the five dismissed alerts |
| `dialectical-engine/deploy/vps/README.md` | the server kit, with a banner naming the sections Task 14 still refreshes |
| `docs/missions/support-conversation-20260914/reviews/OWNER-SIGNOFF-ai-transparency.md` | the record of my signature on the help article |

## Exactly where things stand

- GitHub (all on my word): secret scanning + push protection ON; private vulnerability reporting ON; default branch = `dev` (temporary; back to `main` on release day); Dependabot security updates ON; rulesets `no-delete-no-rewrite` (main + dev, no bypass) and `dev-changes-by-pull-request` (checks `verify` + `secrets` required, **no bypass — administrators go through pull requests too**); Actions policy = SHA pinning + GitHub-owned + `pnpm/action-setup@*`. The only switch left is the organisation-wide two-factor requirement, which I flip myself in the browser (both pre-checks print 0).
- CI: the `security` workflow runs the gate (`pnpm run test:ci-gate`, must print `CI_KNOWN_RED_GATE new=0 known=8 stale=0` — the 8 are recorded in `tests/ci-known-red.txt` with their sources, three of them `dev`'s own), the secret scan of the change under review (every ref weekly), CodeQL. The Cloudflare "Workers Builds: dezbatere" check fails on every non-`main` branch by design (the worker deploys from `main`; `dev` builds are previews) — not a blocker.
- Tests: `pnpm run test:s00` runs everything including the database-backed suites on an embedded Postgres (no Docker). On a quiet machine the remaining failures are `dev`'s own (a moved sealed snapshot hash; a twelfth principal the code never declares; dev-stack suites that expect the local CLIs) or load-sensitive timing rows — all listed in `DOCKER-WINDOW-2026-09-22.md`; none is ours.
- Money: per-run 0.25 USD and per-day 2.00 USD ceilings are PROVISIONAL, designed to stop my first paid run on purpose; the real values come from that run.
- Toolchain: Node 26.8.2 (`.nvmrc`), pnpm 11.20.0, vitest 5.0.1, fastify 5.12.1 kept with overrides.

## What is queued, in my order

1. **Tasks 5 and 7** (plan §Task 5/7): the database items (V-17, V-29 — a new migration takes number **0068** or later; 0067 is `dev`'s plan-tier migration; B28 tamper check) and the data items (V-6: encrypt the remaining readable debate text — **tell me before it passes one day**; V-26: deleting an account erases its support conversations and revokes case bearers). Both need no Docker.
2. **Task 16**: plan tiers mapped to configured vendor targets per deployment (hosted currently refuses every ask whose tier names an unpriced local model — fail-closed).
3. **Task 14**: refresh the server kit for everything decided (the banner lists the stale sections).
4. **Task 13**: a native vendor adapter, only when I name the vendor.
5. My paid confirmation run (prepared in the execution ledger's task-9 report §7 — ask me for the packet if it is not in the repo), which sets the real money ceilings; then the server; then the Cloudflare audit (V-23) together; then release day.

Two things for my colleague (VanillaMint02 / Vlad): the help-corpus review evidence files his process names were never committed; the support benchmark case SUP-C-01 contradicts his new classifier.

## How to work

Coordinator + subagents: Fable coordinates, judges and does the final review; Opus agents build, each in its own worktree and branch; an independent Opus reviewer per package; fix rounds with a RED line per item; then a pull request to `dev` that GitHub's checks must pass. A records-only pull request you may merge yourself; anything else waits for my "merge". Keep a ledger of every dispatch, verdict and ruling (with cost-if-wrong) in a git-ignored workspace, and trust it after a context compaction.

Set up the computer (a fresh clone; this is the one download I authorise up front):

```bash
git clone https://github.com/DebateAIRO/debateairo.git
```

```bash
cd debateairo && git checkout dev && cd dialectical-engine && pnpm install --frozen-lockfile && pnpm run generate:contract && pnpm run typecheck && pnpm run test:ci-gate
```

Expect typecheck 0 and `CI_KNOWN_RED_GATE new=0 known=8 stale=0`. Verify `node`, `pnpm` and `gh` are real programs before first use; `gh` must be signed in as me.

## Start here — this is the first thing I want

Read `PLAIN-STATUS.md` whole and the queue above. Then tell me, in plain words, what Tasks 5 and 7 will each change for a user of the site, what each needs from me, and how long they take — and wait for my word to start.
