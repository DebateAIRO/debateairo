# V DECISIONS PACKET — mission `observability-agents` (ticket `t_a273e880`)

Rows only V can rule. Each row is self-contained: what the thing IS, why it exists, one example, then the options. Reply on the ticket or in chat with the row id and a choice. Rows marked CONFIRM need one word.

## V-1 · CONFIRM — every agent action is approval-first until you flip a switch

**What it is.** The previous observability mission planned that the fix agent could merge "very quick" fixes into `dev` by itself (criterion D11). Today you said "Initially I want to be in charge of everything."
**How it was read.** Newer statement wins: in phase 1 the FixAgent proposes (a ticket with the traced root, and a pull request for anything larger) and never merges. Auto-merge of QUICK fixes becomes a later phase that only you turn on, with the size bound you ratify then.
**Example.** A runner job crashes on a missing null-check. Phase 1: the agent files a ticket naming the root and opens a PR with the one-line fix and a failing-then-passing test; you merge or reject. Later phase (after your switch): the same fix merges into `dev` by itself and you see it in a digest.
**Options.** (a) CONFIRM this reading · (b) keep D11 auto-merge in phase 1 for fixes under a bound you name now.
**Recommendation:** (a). Nothing is lost — the switch is designed in, just off.

## V-2 · How may the SupportAgent talk to a language model?

**What it is.** DR-179 (2026-08-14) forbids API keys: the only lawful model access is the CLI relay (the same path the debate engine uses). A customer-support chatbot needs a model on every user message.
**Why it matters.** Relay-only means the bot runs where a logged-in CLI exists (your machine / a server you sign in on), with the relay's latency and rate limits, and it cannot scale to many concurrent users. A key-based provider (your own Anthropic/OpenAI key, or a hosted gateway) scales and is cheaper per turn but lifts DR-179 for this component and introduces secrets governance you have deferred.
**Example.** A user asks "why is my debate stuck?" at 03:00. Relay-only: answered only while the relay host is up and signed in. Key-based: answered by the server.
**Options.** (a) relay-only for phase 1, key-based designed but not built · (b) lift DR-179 for the SupportAgent only, with the key held in the register's secret files · (c) lift DR-179 platform-wide.
**Recommendation:** (a) for phase 1 so the bot ships without new secrets law; revisit at the first real-user test. REQ-SUP specifies both (a) and (b).

## V-3 · Who detects "it just doesn't work" — the ObservationAgent or the FixAgent?

**What it is.** Two failure kinds exist: something THROWS (an exception with a stack), and something SILENTLY STALLS (a job that never finishes, a queue that stops draining, a period where capture itself was off). You said the FixAgent "only checks errors" and the ObservationAgent "checks our metrics and our observability part + the infrastructure."
**Default taken.** The ObservationAgent owns stall and blind-period detection and emits a typed signal ("runner queue not drained for 10 min"); the FixAgent consumes only thrown errors and such signals when they name a code defect. This keeps both standalone (V's word) and gives the stall a single owner.
**Example.** Hatchet stops dispatching. ObservationAgent alerts you within its latency budget naming Hatchet and the impact. If the cause is an infrastructure outage, the FixAgent never wakes; if the cause is a code defect that surfaces as an error, the FixAgent traces it.
**Options.** (a) CONFIRM the default · (b) FixAgent also owns stall detection (predecessor's D3 as written) · (c) both detect independently (two alerts for one event).
**Recommendation:** (a).

## V-4 · The support "evidence bot" (Bot B) — design only in phase 1?

**What it is.** On 2026-08-17 you designed two bots: Bot A talks to users and structurally cannot touch MFA, recovery, credentials or contacts; Bot B asks higher-privilege identity questions in an isolated VM with no network egress, and records evidence only human support staff can read. Bot B protects against prompt injection reaching account actions.
**Why it is a row.** Bot B needs an isolated VM, a one-way evidence channel and a human console — infrastructure the product does not have. Building it before there are human support staff or account-recovery actions to protect would be building a lock for a door that does not exist yet.
**Options.** (a) phase 1 = Bot A + escalation to you (a ticket/inbox with full transcript); Bot B fully specified but not built · (b) build Bot B in phase 1 too.
**Recommendation:** (a).

## V-5 · CARRIED — RP-0: ratify the `declared_gap` hash (predecessor ticket `t_4deda7ab`)

**What it is.** The error-code registry has a frozen "seed" of known codes; nine codes exist in the tree but not in the seed, so a `declared_gap` list names them. A test pins that list by a SHA-256 you compute yourself — the pin is only a pin if the party who wrote the recipe (the Router) never computes the number. Everything after S02 waits on it.
**What to do.** Run the one-liner on the card (nine names, `LC_ALL=C sort -u | shasum -a 256`), post the hash and the count (9) as a comment on `t_4deda7ab`. AUDIT-STATE posts an independent derivation for you to compare against; if the two disagree, STOP — that is a finding.

## V-6 · CARRIED — `audit:source` vs env-only obs config (predecessor ticket `t_d821f99e`)

**What it is.** The repo's lint (`pnpm audit:source`) blocks any file that reads `process.env` except one register file. The observability plan mandates the capture layer read its eight `OBS_*` bounds from `process.env` and nowhere else. Both cannot hold; five files trip today and the count grows with every slice. `tools/**` is floor-deny, so only you may authorize the fix.
**Options.** (A) extend the exemption to a named set of obs files · (B) carve out the `packages/obs-capture/` directory (like `apps/ui` already is) · (C) give obs a validated config surface in the register (reopens an adopted plan section) · (D) accept the red rows and record them.
**Recommendation:** (A) now, revisit (C) when the ObservationAgent needs validated config anyway — its metrics thresholds will want a schema, which is the argument (C) always had.

---

## V-7 · A change was merged into `dev` without anyone reviewing it. Retrospective review, or accept it?

**What it is.** In the previous observability mission, a coding seat finished a change to the error-code registry (commit `5f0bd546`, "make declaration validation exhaustive"), posted "ready for peer review" on its ticket, and **no reviewer ever answered**. Eight days later that commit was merged into `dev` along with the rest of the lane. Today's audit found it while reconciling the board.
**Why it matters.** Every other change in that lane has a reviewer's verdict behind it. This one has none, so nobody but its author has looked at it. The code may well be fine — the audit ran the registry tests three times and they pass. But "the tests pass" and "a second pair of eyes checked it" are different claims, and right now only the first is true.
**Example of what a review would catch that tests do not.** A test proves the code does what the test says. A reviewer asks whether the test pins the right property at all — this fleet has shipped three assertions in a row that caught exactly their demo case and nothing behind it.
**Options.** (a) a reviewer reads `5f0bd546` now, as a small standalone job, before any FixAgent slice touches that file · (b) accept it as reviewed-by-merge and record that the exception was deliberate · (c) fold it into the review of the first FixAgent slice that edits the registry.
**Recommendation:** (c). It costs nothing extra, the reviewer is already reading that file, and it keeps the debt attached to work rather than becoming a separate errand.

## V-8 · The repo's type check is red right now, for a reason that is not ours. Do the coders start anyway?

**What it is.** `pnpm typecheck` currently fails on `dev` with 8 errors, all in one file, `tests/unit/s14-ui.test.ts`. The cause is last night's UI consolidation, which deleted the old `web/` directory while that test still imports from it. **None of the 8 errors is in observability code.**
**Why it matters.** Every coding seat in this mission is required to run the repo-wide type check before handing off, and to report a clean result. With the repo already red, a seat cannot tell its own breakage from the pre-existing one unless it is told the exact baseline — and a seat that "fixes" the red it did not cause has silently crossed into another mission's files.
**Example.** A FixAgent coder adds a capture call, runs the type check, sees 8 errors, and spends an hour hunting a bug it never introduced.
**Options.** (a) coders start now; every packet states the exact baseline (8 errors, that one file) and each seat asserts *no new errors* rather than *zero errors* · (b) the UI mission fixes its test first and the coders wait · (c) I ask the UI mission to fix it while the coders start under (a).
**Recommendation:** (c), with (a) as the working rule regardless — the delta assertion is the honest one even on a green repo, and it is what protects a seat from inheriting someone else's red.

---

# Rows added 2026-09-02 by the WAR PLAN (`WAR-PLAN-2026-09-02.md` §12) — V-9..V-15
Context in one line: you ordered a FixAgent that branches from `dev` on the remote, fixes, proves the fix on its own mock database and alerts through a file in the app. Seven decisions below are yours alone; the plan (under Grok review, ticket `t_d9a33421`) explains each at length. Reply with the row id and a letter.

## V-9 · Push authorization for the FixAgent (F-14 → remote form)

What it is: today's law says nobody pushes without you; FIX-13 froze a LOCAL branch for that reason. You ordered a branch "on the remote as well". Example: incident `7f3a…` is traced to `apps/scheduler/src/jobs/archive.ts:archiveExpired`; the agent pushes `origin/fixagent/7f3a…` (one commit) and opens a draft PR into `dev`; it cannot push `dev` or `main` because the ruleset refuses the bot identity there — and Op 0.4 PROVES that refusal before any push code exists — the drill records a refused push to the decoy AND a refused push to `dev` itself (a harmless V-authored docs commit), an allowed push to `fixagent/probe`, and its deletion. Options: (a) the FixAgent's bot identity pushes `refs/heads/fixagent/*` ONLY, GitHub rulesets forbid it `dev` and `main`, it opens a DRAFT PR into `dev`, you merge · (b) keep the local form. **Recommendation (a)** — it is what you ordered, and the ruleset makes the scope mechanical rather than promised.

## V-10 · PR #8 before the campaign?

What it is: `security/2026-09-01-hardening` (130 commits, 184 files) is open against `dev` and conflicts on one file, `apps/ui/scripts/node-test-manifest.json` (a test manifest — both sides added entries). Its own CI jobs (`verify`, `secrets`, `codeql`) pass; two EXTERNAL checks are red: GitHub's "CodeQL" status (failed in 4 s — a setup-level failure, not a finding) and the Cloudflare Workers build for `dezbatere`. Example: if the FixAgent's first branch is cut today and PR #8 lands next week, that branch rebases across 13k lines, and FIX-03/04 bind into entry points that PR #8 rewrote. Options: (a) merge now, resolving the manifest conflict, accepting the two red external checks as not-ours-to-gate · (b) park PR #8 until both external checks are green; FixAgent slices branch knowing a rebase is coming · (c) merge only the `deploy/` + CI parts now. **Recommendation (a)** — residual: the two external checks stay red until their owners fix them; note it in the merge commit.

## V-11 · Does the agent wait for your approval before coding, or is your merge the only gate?

Your 09-01 words ("in charge of everything") froze approve-first (FIX-12 waits for `obsctl approve` before FIX-13 codes); your 09-02 words describe an agent that fixes and then alerts. Example: a scheduler job throws at 03:00. Under (a) you wake to a draft PR with RED→GREEN evidence and an alert block; under (b) you wake to a proposal and nothing coded until you type `obsctl approve`. Options: (a) code-first on the branch — the PR is the approval object; nothing lands without you · (b) approve-first as frozen. **What (a) costs that (b) does not, named:** a Codex session is spent per incident BEFORE you have seen a proposal (bounded by `callsPerDay`, `maxConcurrent` and wall-clock register rows that count diagnosis AND coding together, seeds yours; and the coding worker inherits FIX-12-R07: no usage data → no next spawn until you re-arm); a flapping fingerprint could burn the day's cap while you sleep (one active mutation per fingerprint; the cap is a hard stop, not a retry); a live bot token exists — so the rulesets and the decoy-ref refusal drill (Op 0.4) MUST exist before the first push, or the first coding bug is a push; a kill mid-push can leave a PR-less `origin/fixagent/*` ref (the daemon deletes it — App. A R08′); draft PRs accumulate in your inbox faster than you scope them. **Recommendation (a)** with those five bounds — it is faster, a branch plus a Foundry touches nothing, and V-1 (nothing LANDS unapproved) still holds.

## V-12 · Foundry mechanism

What it is: the agent needs a database it may break. SQLite or an in-memory emulator cannot be it: the schema carries 171 stored functions, 77 triggers, pgcrypto and 143 `SECURITY DEFINER` clauses, and the tests assert on them (§7.1 Option 0). Two real-Postgres mechanisms remain. Example: `pnpm mock:up` in a fresh worktree boots a private PostgreSQL 18 on a kernel-chosen port; each test clones a migrated template in ~50 ms (measured on an empty template). Options: (a) embedded-postgres per worktree + template clone (honours DR-121; zero new deps) · (b) Docker `postgres:18` per worktree (reverses DR-121; two tests red) · (c) (a) now, Docker later for a Linux CI runner. **Recommendation (a) now, (c) when CI runs DB tests.**

## V-13 · How does the ObservationAgent hand a suspected code defect to the FixAgent?

The two frozen requirement sets disagree (FixAgent F-1: it inserts `detector` rows into `obs.occurrence`; ObservationAgent D1: it NEVER writes a product table and exposes a view). Options: (a) F-1 · (b) D1's view, FixAgent polls · (c) FixAgent consumes thrown errors only in THIS campaign; decide at Op 5. **Recommendation (c) now, (b) at Op 5** — G12 says the ObservationAgent writes no product table.

## V-14 · Alert file location and format

What it is: the file the daemon appends to when a fix is proven, written into ONE configured checkout: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`, which is `<git-root>/dialectical-engine` where the git root `/Users/vladmihaimiron/Documents/DebateAIRO` is the first row of `git worktree list` (the daemon checks both facts before it starts), file `.fixagent/ALERTS.md`. Options: (a) `.fixagent/ALERTS.md` + JSON twin, gitignored in that checkout, PR body as the durable copy · (b) a committed `docs/fixagent/<hash>.md` inside the fix branch · (c) both. **Recommendation (a).**

## V-15 · First fault to hunt

Options: (a) FIX-01's scheduler job (one terminal command, nothing else running) · (b) FIX-03's runner job (closer to real pain; needs the stack up). **Recommendation (a)** for W1..W7; (b) opens Op 4.
