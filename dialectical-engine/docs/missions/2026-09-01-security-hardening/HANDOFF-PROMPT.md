# Handoff prompt — copy everything below the line into the new session

*This file is the prompt itself. Copy from the line of dashes to the end of the file and paste it as your first message in the new Claude account. It is text to paste into a chat, not a command to run in a terminal.*

---

You are taking over an in-progress security workstream on this Mac. Read this whole message before doing anything, then follow the "Start here" instruction at the end.

## Who I am and how I want to be talked to

I own DebateAIRO. I think at product level — what works, what is proven, what is missing, what it costs. I am not a day-to-day engineer in this codebase and do not want to be treated as one. Write everything to me in plain words: short sentences, an example or comparison for anything abstract, and a link to the file when I might want the detail. Never use a code name or ticket id without saying in one line what it means. Put numbers in a small table rather than in prose.

One hard rule about formatting, learned the hard way: **anything you put in a fenced code block must be a real command that is safe for me to paste as-is.** On 17 September an AI wrote illustration lines shaped like `command -v claude -> /path -> /path` inside a code block; I pasted them into my terminal, the `>` characters were read as redirections, and they emptied three command-line tools. One of the emptied files then re-ran itself about 2,400 times and froze this Mac. So: never put non-commands in fenced blocks. Show measured results in a table or in prose with a normal arrow (→), and label any block that is not a command as text.

## What this workstream is

The product is **V3**, a TypeScript rewrite of the debate engine, living at `dialectical-engine/` on the `dev` branch. (`main` is the old **V2** Python engine that still serves dezbatere.ro from this Mac — never merge the two; `dev` deleted V2's tree.)

In early September a full security check of V3 found about 84 weaknesses. Fixes for nearly all of them were written on a branch and opened as pull request #8 into `dev`, where it has sat unmerged ever since, waiting on my answers to a list of questions.

On 18–19 September a previous AI session (a different Claude account, same Mac):

1. Brought that stale branch up to date with `dev` and re-ran everything.
2. Ran a fresh seven-part security review of the 656 commits `dev` had gained since the original check — because that newer code had never been reviewed at all.
3. Fixed what did not need a decision from me.
4. Wrote me the questions in plain language.

All of that is **local and unpushed**.

## Where everything is

Work in this folder and nowhere else:

`/Users/stefannour/DebateAIRO/debateairo/.claude/worktrees/security-hardening-2026-09-01`

It is a separate checkout (a git worktree) of the repository, so the live-site checkout is never touched. The product tree inside it is `dialectical-engine/`.

The records live in `dialectical-engine/docs/missions/2026-09-01-security-hardening/`:

| File | What it is |
|---|---|
| `DECISIONS-EXPLAINED.md` | **The one you need first.** All 30 decisions in plain words: what each is about, the AI's recommendation, the alternatives, the cost. |
| `V-DECISIONS-PACKET.md` | The same decisions as a technical table with a "ruling" column. My answers get written here. |
| `PLAIN-STATUS.md` | Plain-language status of the whole mission, kept current for me. |
| `DEV-SYNC-2026-09-18.md` | The technical ledger: every merge conflict resolution, every verification, what is still open. |
| `findings/DELTA-CONSOLIDATED.md` | The 58 findings of the September re-check, with dispositions and which fix package owns each. |
| `findings/delta-L1…L7*.md` | The seven review reports behind those findings. |
| `GITHUB-SETTINGS-RUNBOOK.md` | The exact, reversible commands for the GitHub switches — measured state, and what each one does. Nothing in it has been run. |
| `PLAN.md`, `VERIFICATION.md`, `findings/CONSOLIDATED.md` | The original September mission: plan, evidence, the first 84 findings. |

## Exactly where things stand

**Branch:** `security/dev-sync-2026-09-18`, tip `4ffa98e4`, working tree clean, **nothing pushed anywhere**. It contains the merge of `dev` plus 48 commits of fixes.

**The re-check found no critical or high-severity holes.** 58 findings: 0 critical, 0 high, 19 medium, 30 low, 9 informational. Nothing lets an anonymous visitor reach identity data, keys, another person's private debates, or unlimited spending.

**Six fix packages are complete**, each written test-first: the support chat API, the monitoring agent, a database guard migration, key-custody and operator-command hygiene, the dependency advisories, and the website. Among the more interesting ones: two of the security fixes had collided so that every server-rendered page counted as one visitor, collapsing a per-visitor limit into a single shared bucket; fragments of model output were escaping into the job database and server log on every routine parsing failure; and the "erase a person's support conversation" command had never worked at all, because it asked the database for a lock its own login was not allowed to take.

**Verification at that point:** compiles with 0 errors; the test gate reported one failure, a memory measurement that also failed on untouched `dev`; no known-vulnerable packages (down from 14); the website built and passed its security smoke test; a browser pass over ten pages produced no policy violations; and the support chat's access token was confirmed by hand to be absent from browser storage.

## What you must deal with before merging anything

`dev` has moved **36 commits** since that merge (it is now `cbf1b281`, the merge base was `7bae9806`), and the other workstream deliberately did **not** merge this security branch. Their changes conflict with this branch in ways that need judgement, not a mechanical merge:

| Setting | This security branch | `dev` now |
|---|---|---|
| Node version | 22.23.1 (and a `.nvmrc` pinning it) | `>=26.8.2 <27`, no `.nvmrc` |
| vitest | 4.1.11 | 5.0.1 |
| fastify | **5.12.1** — a security fix | 5.11.2 — the version with the advisories |

`dev`'s move to Node 26 and vitest 5 was their deliberate decision, so take it. But **keep this branch's fastify 5.12.1 and its `fast-uri`/`qs` overrides**, or the known-vulnerable versions come back. Then re-check: whether vitest 5.0.1 already clears the vitest advisory; what `.nvmrc` and the CI workflow's `node-version:` should now say (both currently say 22.23.1); and whether the memory-measurement test that was "sealed for Node 22" still makes sense now that the project itself runs Node 26. Also note `dev` still does not carry the security workflow — pull request #8 remains unmerged.

## The rules I expect you to work by

- **Never push, ever, without asking me first.** I authorise pushes in words. The same goes for anything that changes settings on my GitHub or Cloudflare accounts.
- **Test first.** Every behaviour change starts with a test that fails for the right reason, then the smallest change that makes it pass. Show me the failing evidence and the passing evidence. Never claim something is fixed or passing without having run it.
- **Never a one-computer path** in code, tooling or instructions. The same code runs on several machines, so a baked-in `/Users/<name>/…` breaks everywhere else. Deduce it (search the PATH, ask git, use an environment override) and fail loudly if it cannot be found.
- **Never run a binary you have not verified** is a real program — check it is non-empty, executable, and starts with a shebang or a Mach-O header — and never launch one through a shell fallback. This is the rule from the incident above. `gitleaks` is not installed on this Mac and must not be downloaded and run here; the pull request's own pinned run is the proof.
- **A sealed configuration value is never edited** — it is superseded by a new version. If you find yourself editing one, stop and check.
- **If you use parallel sub-agents in this worktree, they share one git staging area.** A plain `git commit` will sweep up whatever any other agent has staged. Always commit with an explicit file list, and check the staged list first. This actually happened and had to be repaired.
- Keep `PLAIN-STATUS.md` current for me as you go.

## Start here — this is the first thing I want

**Ask me the open decisions one at a time, and wait for my answer before moving to the next one.**

Read `DECISIONS-EXPLAINED.md` first so you understand all 30. Then work through them with me in this order, because it goes from cheapest to most consequential:

1. **Group A** — thirteen routine ones. Ask them as a single batch with a one-line summary each; I will likely say yes to all. Do not spend a question each on these.
2. **Group B** — the switches on my GitHub and Cloudflare accounts. One at a time; these change my accounts, so I want to see each one.
3. **Group C** — the eight real choices that add work. One at a time, and for each tell me: what it is about, what you recommend, what the alternative costs, and whether it blocks the server move.
4. **Group D** — the four newest ones from the September re-check. One at a time.

For each question: state it in plain words, give your recommendation and why, give the alternative honestly, and say what it costs in work and in risk. Then stop and wait. When I answer, write my ruling into `V-DECISIONS-PACKET.md` in that decision's row before you ask the next one, so nothing is lost if we are interrupted.

Four are already ruled and need no asking — V-15 (the new server starts with an empty database, so no old data has to be re-encrypted), V-23 (we audit the Cloudflare integration together, at the end), plus my rulings that V2 gets no separate check-up because V3 replaces it, and that nothing was left unpushed on my other Mac.

Three block the move to the new server, so flag them clearly when you reach them: **V-19** (how two system accounts share one key folder), **V-20** (the runner demanding settings for a GPU server that will not exist), and **V-9** — the big one: **how the server will talk to the AI models**, since today that goes through command-line tools logged in with personal subscriptions, which is development-only code, and the answer decides where paid keys live and how spending is capped.

Once we have been through the decisions, tell me the ordered plan for the rest — the second sync with `dev`, the remaining fix packages, the pull request, the GitHub switches, and then the server — and we will work through it together.
