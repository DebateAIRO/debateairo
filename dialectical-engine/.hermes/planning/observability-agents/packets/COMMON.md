# COMMON — binding for every seat of mission `observability-agents`. Read in full before your own packet.

**Repo root (run every command from here):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
**Mission root:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/`
**Intake record (V's verbatim goal, historical rosters, contradiction check):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md`
**Tooling traps — read FIRST, append what costs you time:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md`
**Spine (v3.4.0 — amended at this intake with V's vertical-slice law):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
**Tree state:** H0 preserves the historical 2026-09-01 snapshot (`dev` @ `8d38185c`, 111 dirty entries), but it is not a dispatch-time constant. At CLAIM, measure `git rev-parse --short HEAD` and `git status --short`; report what you observed and preserve every pre-existing or concurrently appearing edit. Never touch, revert, stash, or "clean" another seat's work. If your work needs a clean tree, say so and stop.

## 0. Active routing (V's current policy; historical identities remain historical)

Requirements workers **GPT-5.6-sol** · coding workers **GPT-5.6-sol** · reviewers **Grok 4.6** · QA **V personally**. The controller assigns orchestrator and architecture seats in their own packets; do not infer those routes from a historical H0 roster. This routing governs new dispatches and rework only. Wave-1 artifacts keep their recorded Fable 5.1/Claude author identity, and existing reviews keep their recorded reviewer identity; never rewrite history to match the active route.

## 1. Skills — load in this order, then reach for anything else in the Superpowers library
1. `superpowers:using-superpowers`
2. `heartbeat-protocol` (the router), then the role contract your packet names
3. your role's floor from `heartbeat-protocol` §1 (requirements → `superpowers:brainstorming`; reviewer/verification → `superpowers:verification-before-completion`, `superpowers:systematic-debugging` when judging a failure)

Your handoff **OPENS** with `SKILLS LOADED: <every skill you actually loaded, comma-separated>`. Naming a skill you did not load is a fabrication finding; an honest shortfall costs a line.

## 2. Board protocol
Board `observability-agents` on the Hermes Kanban (port 9119). Commands:
- `~/.local/bin/hermes kanban --board observability-agents show <ticket> --json` — the board flag goes BEFORE the verb. `show` truncates long text; slice `--json` output with `jq`.
- `~/.local/bin/hermes kanban --board observability-agents comment <ticket> "<body>" --author <SEAT>` — body is a POSITIONAL argument (no `--file`); ALWAYS pass `--author <your seat name>` so the board shows who wrote. For a body over ~20k characters pass `--max-len 80000`.
- NEVER `hermes kanban boards switch` (global pointer shared with other missions). NEVER change a ticket's status, assignee, or links — the orchestrator moves tickets; you comment.
- Your board writes are comments on YOUR ticket only. Reading other boards' tickets (e.g. `observability-loop`) is allowed only where your packet says so.

Markers, each carrying `comments read through: <n>` (the number of comments on your ticket you have read):
`CLAIM` (first comment: seat name, role, start time, the skills you intend to load) · `HEARTBEAT` (optional, at natural checkpoints) · `BLOCKED` (what blocked you, the ONE workaround you tried) · `READY FOR PEER REVIEW` (your final handoff; content per your packet). Post the handoff as a board comment AND write it to the handoff path your packet names.

## 3. Laws that bind you (pointers: spine §2, `heartbeat-protocol` §2)
- No reviewing your own homework. A finding is a finding: every finding you make gets named with a file and line so the orchestrator can ticket it the same day; non-blocking sets WHEN, never WHETHER. Rework rounds: max 3. The board is the state. Reproduce first. Verbatim means verbatim: anything formatted as command output IS that output, suites as `passed/total` with failures named and dated as pre-existing or yours. Say what you cannot do — `UNVERIFIED` is always legal, a guess presented as a result never is.
- **NEVER:** push · merge · commit · any git write at all (`add`, `stash`, `checkout`, `branch`, `worktree`, `reset`) · mark Done · delete product or database data · run migrations · fabricate runtime data or evidence · reveal secrets · cross your `allowed` list · ignore ticket comments · sub-delegate the DELIVERABLE (not granted). **Read-only search fan-out is granted to requirements and review seats, bounded:** at most 4 children per seat, each an `Explore` or `general-purpose` agent that WRITES NOTHING, each using the active route for that role (`gpt-5.6-sol` for requirements work; Grok 4.6 for review work), and every child's receipt returned in the handoff under `## Sub-delegation receipts` (what it searched, what it returned, and which claims the parent verified at `path:line` — an unverified child claim never enters an artifact). Historical receipts and provider violations stay recorded under the policy that applied when they occurred. Never write to `~/.claude/skills`, `.claude/skills`, or any protocol document.
- **The excluded security zone.** The accounts/privacy/security W.I.P. — identity, registration, verification, MFA, recovery, sessions and step-up, passkeys, account erasure, crypto shredding. Ratified file prefixes: `zone_path_prefixes` in `packages/obs-capture/src/zone/manifest.ts`; in addition treat `apps/api/src/{registration,mfa,recovery,mail-channel,sessions,account-erasure,legacy-claim}.ts`, `packages/crypto/**`, `packages/db/src/identity.ts`, migrations `0030–0033` and `0038–0049`, and the sign-in/sign-up/MFA/verify-email/settings flows in `apps/ui` as zone. Requirements may DESCRIBE a boundary with it; no seat proposes instrumenting, fixing, or changing anything inside it; the SupportAgent must be structurally incapable of touching it. When in doubt, it is in the zone.
- **Standing V law you must comply with:** DR-179 no-API-keys hold (CLI relay is the only lawful model access — state what changes if V lifts it) · DR-188 data preservation (no deletion of product data; retention is a V-gated policy) · privacy posture (private-by-default, crypto-shredding erasure; no private debate content, secrets, tokens, cookies, prompts, or raw provider payloads in any ops or support surface) · defensive-only · the immutable high-risk floor (security/auth, persistence/migrations, provider spend, scoring semantics, live data, destructive or architectural work are ALWAYS escalate-to-V for any agent this mission builds) · naming: the product is `dialectical-engine`, say "current algorithm version", never V2/V3.

## 4. Evidence and writing law
- Cite repo claims as `path:line`. Every recommendation and every contested decision carries `VERDICT / CONFIDENCE (high|medium|low) / STRONGEST COUNTER`.
- Banned words in any acceptance criterion or requirement: **improve, better, robust, handle, appropriate** — they mean you have not finished deciding.
- **QA is V personally.** Every SPEC acceptance section is numbered, human-runnable steps in the real dev stack with the expected observation per step — a browser, a terminal, a Postgres query V can paste. A green test suite is a worker milestone, never V's acceptance.
- **Vertical-slice law (V, 2026-09-01):** a slice has a beginning and an end V can exercise; slices run in parallel in separate worktrees; Done on a slice is V's veto after personally testing, nothing less. Cut slices so the FIRST one is the smallest complete end-to-end proof.
- SPEC.md is FROZEN at creation. PLAN.md is a SCAFFOLD here (SPEC-trace skeleton, quantifiability law, cluster table headers) — the architecture seat writes the steps. PROGRESS.md is an empty skeleton (orchestrator is its sole writer). DECISIONS.md is append-only: `date · question · choice · reason · who ruled`.

## 4b. WRITE AS YOU GO — binding, and it is the difference between losing a seat and losing nothing

**Write every artifact to disk the moment it is ready. Never batch writes to the end of your run.** Provider session limits have killed six seats of this mission mid-sentence with no warning; the seats that had been writing incrementally lost nothing, and the seats that were still holding their work in context lost everything they had done. Concretely:
- Write each file as it is finished (one slice's SPEC, then its PLAN, then the next slice) rather than assembling them all and writing at the end.
- Write your self-report EARLY, as soon as you have findings worth recording, and update it as you go. It is a case file, not a closing statement.
- When you learn something another seat would otherwise re-derive, append it to `.hermes/TOOLING-TRAPS.md` immediately.
- Post a `HEARTBEAT` comment on your ticket at each natural checkpoint naming what is now on disk, so the orchestrator can reconstruct your state without your final message.

**Your final message is the least durable thing you produce.** Anything that exists only there does not exist.

## 5. Self-report — binding, BEFORE your handoff
Path (in your `allowed` list): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/<SEAT>.md`. The question it answers, VERBATIM from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

A case file, not a diary: name the CAUSE, not the symptom · PRICE each finding (wall-clock, tokens, retries) · say what you NEARLY got wrong · name DEAD ENDS so nobody re-derives them · say where THIS packet was unclear, and exactly where. An anodyne report is worse than none.

## 6. Stopping rule (research/requirements seats)
Stop when every numbered charge in your packet has an answer or an explicit `UNVERIFIED`. Soft wall-clock bound: 3 hours. At 2.5 hours with charges open, write what you have, mark the rest `UNVERIFIED — out of time`, hand off. Return control at your handoff marker or at `BLOCKED`; do not idle, do not start unasked work.
