# COMMON — binding for every seat of mission `translation`. Read in full before your own packet.

**Orchestrator:** Claude Code on **Opus 5** from 2026-09-02 10:20 (Fable 5.1 before that; V ruled the change). Every seat also runs on Opus 5.
**Repo root (run every command from here unless your packet names a lane):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`
**Mission root:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/`
**Intake record (V's verbatim goal, roster, measured state, contradiction check):** `<mission root>/00-intake-H0.md`
**V DECISIONS PACKET (open rows with the defaults the mission proceeds on — read before asking anything of V):** `<mission root>/V-DECISIONS-PACKET.md`
**Tooling traps — read FIRST, append what costs you time:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md`
**Spine (v3.4.0):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md`
**Tree state at packet-write (2026-09-01 23:50 EEST):** branch `dev` @ `4f764037`. The 12 dirty working-tree entries (`.hermes/planning/observability-agents/**`, `docs/missions/observability-agents/logs/**`) belong to the in-flight `observability-agents` mission. They are NOT yours: never touch, revert, stash, or "clean" them.
**Your working directory:** Claude subagents start in `/Users/vladmihaimiron/Documents/DebateAIRO` — the git root, one level ABOVE the repo root. Every command either `cd`s into the repo root (or your lane) first, or uses absolute paths. Print `pwd` before your first write.

## 1. Skills — load in this order, then reach for anything else in the Superpowers library
1. `superpowers:using-superpowers`
2. `heartbeat-protocol` (the router), then the role contract your packet names (`heartbeat-requirements` · `heartbeat-architecture` · `heartbeat-worker` · `heartbeat-reviewer`)
3. your role's floor from `heartbeat-protocol` §1 — requirements: `superpowers:brainstorming` · architecture: `superpowers:brainstorming` THEN `superpowers:writing-plans` · worker: `superpowers:test-driven-development`, `superpowers:verification-before-completion`, `superpowers:systematic-debugging` (any bug), `superpowers:receiving-code-review` (rework) · reviewer: `superpowers:verification-before-completion`, `superpowers:receiving-code-review` (when contested)

All are invoked with the Skill tool. Your handoff **OPENS** with `SKILLS LOADED: <every skill you actually loaded, comma-separated>`. Naming a skill you did not load is a fabrication finding; an honest shortfall costs a line.

## 2. Board protocol
Board `translation` on the Hermes Kanban (dashboard `http://127.0.0.1:9119`). Commands:
- `~/.local/bin/hermes kanban --board translation show <ticket> --json` — the board flag goes BEFORE the verb. `show` truncates long text; slice `--json` output with `jq`.
- `~/.local/bin/hermes kanban --board translation comment <ticket> "<body>" --author <SEAT>` — body is a POSITIONAL argument (no `--file`); ALWAYS pass `--author <your seat name>`. For a body over ~20k characters pass `--max-len 80000`.
- NEVER `hermes kanban boards switch` (global pointer shared with other missions). NEVER change a ticket's status, assignee, or links — the orchestrator moves tickets; you comment.
- Your board writes are comments on YOUR ticket only. Reading sibling tickets (`list`, `show` on another id) is out of contract unless your packet lists the ids.

**The ticket is authoritative for your comment cursor.** A packet may quote a count as of packet-write; if the ticket differs, the ticket wins and the difference is a packet finding you file. (REQ-REV-01 P1, 2026-09-02.)

**Scripts may write only to paths in your `allowed` list** — never to the repo outside it, never to another seat's paths. A generator that emits allowed artifacts is lawful; a script that writes anywhere else is a contract breach. (REQ-REV-01 P7, 2026-09-02.)

Markers, each carrying `comments read through: <n>` (the number of comments on your ticket you have read):
`CLAIM` (first comment: seat name, role, start time, the skills you intend to load) · `HEARTBEAT` (optional, at natural checkpoints) · `BLOCKED` (what blocked you, the ONE workaround you tried) · `READY FOR PEER REVIEW` (your final handoff; content per your packet). Post the handoff as a board comment AND write it to the handoff path your packet names.

## 3. Laws that bind you (pointers: spine §2, `heartbeat-protocol` §2)
- No reviewing your own homework. A finding is a finding: every finding you make gets named with a file and line so the orchestrator can ticket it the same day; non-blocking sets WHEN, never WHETHER. Rework rounds: max 3. The board is the state. Reproduce first. Verbatim means verbatim: anything formatted as command output IS that output, suites as `passed/total` with failures named and dated as pre-existing or yours. Say what you cannot do — `UNVERIFIED` is always legal, a guess presented as a result never is.
- **NEVER:** push · merge · commit except where your packet says so, and then only on your lane's branch · any git write outside your lane · mark Done · delete product or database data · run migrations · fabricate runtime data or evidence · reveal secrets · cross your `allowed` list · ignore ticket comments · sub-delegate unless your packet grants it · write to `~/.claude/skills`, `.claude/skills`, or any protocol document.
- **The security zone, translation edition.** The sign-in, sign-up, verify-email, MFA enrolment, settings, sessions and account-erasure screens belong to the accounts program. In THIS mission their COPY is in scope and their BEHAVIOUR is not: a seat may replace a literal string with a catalog lookup that renders the identical English, and may not change control flow, validation, requests, cookies, storage, redirects, or the security attributes of anything. `apps/api/**`, `packages/crypto/**`, `packages/db/**`, `migrations/**` are out of contract for every seat of this mission.
- **Standing V law you must comply with:** DR-179 no-API-keys hold — no runtime machine translation and no translation service; every translation is authored by a seat and committed as a file · DR-188 data preservation (no deletion of product data) · privacy posture (catalogs carry no user data; a translation seat never sees or needs product data) · naming: the product is `dialectical-engine`, say "current algorithm version", never V2/V3 · **T9 mode-token gate:** no colour literal (`#hex`, `rgb()`, `oklch()`) outside the FIRST `:root {` and `html[data-mode="chamber"] {` blocks of `apps/ui/app/globals.css`; a new token is registered in the `TERRACOTTA`/`CHAMBER`/`MODE_INDEPENDENT` maps of `tests/unit/t9-mode-tokens.test.ts` with comma-tight values.
- **Mission laws (set at intake, `00-intake-H0.md`):** ENGLISH IDENTITY — every screen's English rendering is byte-identical before and after string extraction, proven by a snapshot oracle, never by inspection · CATALOG PARITY — every locale carries exactly the English key set, every `{placeholder}` preserved, no empty value · MENU EVERYWHERE — the language menu renders on every route, adjacent to every `ModeToggle`, and a choice takes effect on every route · SINGLE WRITER — no two concurrent slices own the same file; catalogs are split per namespace so extraction slices never share one file.

## 4. Evidence and writing law
- Cite repo claims as `path:line`. Every recommendation and every contested decision carries `VERDICT / CONFIDENCE (high|medium|low) / STRONGEST COUNTER`.
- Banned words in any acceptance criterion or requirement: **improve, better, robust, handle, appropriate** — they mean you have not finished deciding.
- **QA is V personally.** Every SPEC acceptance section is numbered, human-runnable steps in the real dev stack with the expected observation per step — a browser V can click through. A green test suite is a worker milestone, never V's acceptance.
- **Vertical-slice law (V, 2026-09-01):** a slice has a beginning and an end V can exercise; slices run in parallel in separate worktrees; Done on a slice is V's veto after personally testing, nothing less. Cut slices so the FIRST one is the smallest complete end-to-end proof.
- SPEC.md is FROZEN at creation. PLAN.md is a SCAFFOLD from requirements (SPEC-trace skeleton, quantifiability law, cluster table headers) — the architecture seat writes the steps. PROGRESS.md is an empty skeleton (orchestrator is its sole writer). DECISIONS.md is append-only: `date · question · choice · reason · who ruled`.

## 5. Self-report — binding, BEFORE your handoff
Path (in your `allowed` list): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/translation/agent-reports/<SEAT>.md`. The question it answers, VERBATIM from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

A case file, not a diary: name the CAUSE, not the symptom · PRICE each finding (wall-clock, tokens, retries) · say what you NEARLY got wrong · name DEAD ENDS so nobody re-derives them · say where THIS packet was unclear, and exactly where. An anodyne report is worse than none.

## 6. Stopping rule
Requirements, architecture and review seats: stop when every numbered charge in your packet has an answer or an explicit `UNVERIFIED`. Soft wall-clock bound: 2.5 hours; at 2 hours with charges open, write what you have, mark the rest `UNVERIFIED — out of time`, hand off. Workers: stop at your handoff marker or at `BLOCKED`. Nobody idles, nobody starts unasked work.
