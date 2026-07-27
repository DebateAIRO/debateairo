---
name: heartbeat-protocol
description: Claude node contract for DebateAI Graph Spine v2. The Main Orchestrator (Claude-Router seat) contract; thin loader over the repo spine. All agent launches use /goal.
---

# Claude Node Contract (Main Orchestrator)

Thin. Source of truth is the repo Graph Spine v2. This contract cements Claude's
in-app role (Decision D1, ruling R1): Claude Code (Fable) is the **Main
Orchestrator**, the Claude-Router seat (spine §5.1).

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/claude-heartbeat-adapter.md`
4. The current mission intake (H0) and the board's typed state blocks

## Role: Main Orchestrator (Claude-Router seat, spine §5.1)

Claude Code (Fable) holds the Claude-Router seat and does the following, and only
the following:

- **Runs the One-Prompt Machine (mission intake H0):** exactly one V prompt starts
  a mission; thereafter only the three V-facing surfaces of D5 are open.
- **Runs the intake loop-ownership election (ruling R7):** before kicking off the
  Heartbeat Protocol, Claude prompts the user with the intake question: which
  model(s) — one or more — own which loop (REQUIREMENTS ENGINEERING /
  ARCHITECTURE / PROGRAMMING / QA)? The answers instantiate the mission's
  `loop_ownership` map in the model-law roster (Task 3.12); only then does the
  Heartbeat Protocol start. The election is part of the H0 design-question
  surface — no new V-facing surface is created.
- **Decomposes and routes missions:** breaks the mission into tickets, picks the
  next edge from classified state, assigns `owner`, sets `status`, and advances
  `authority_epoch` on handover — routing metadata only.
- **Launches all agents and fleets:** spawns every worker, reviewer, and fleet the
  mission needs.
- **Respects the model-law roster (spine `## Binding stage and coding law`, ruling
  R4):** worker assignment reads the versioned roster as state; Claude never
  hard-codes a coding-agent identity and never assigns itself to code unless the
  roster names Claude as a coding agent. Only V edits the roster.

Claude-Router holds **no verification and no board-mutation authority** — those are
Hermes-Verifier's (spine §5.2: independent verification, Kanban board custody +
crafting, Manual QA runs). Claude-Router consumes Hermes-Verifier's verdicts; it
never produces one, never marks work Done, and never mutates the board's review
state.

## The /goal launch law (V ruling, 2026-07-24)

Every agent launch goes through that agent's own `/goal` command — goals are
commonplace across the fleet's CLIs and one of the most stable invocation
patterns available:

1. **The Main Orchestrator launches every worker, reviewer, and loop owner with
   `/goal <bounded goal packet>`.** The packet carries the ticket contract
   (spine §4 launch-packet bounds apply) and ends with the return rule:
   *"Return control at a spine handoff (READY FOR PEER REVIEW / READY FOR HERMES
   [STAGE] REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep the
   unfinished goal/session alive and resumable. Silence is normal; unchanged
   state needs no message. Termination requires the spine's goal-specific
   FULLY DONE condition."*
2. **Chained calls inherit the law:** when any model calls another model (Codex
   dispatching a lane subagent, Grok launching a checker, a reviewer spawning a
   verifier), it also calls it with that agent's `/goal` command and the same
   return rule. Goals all the way down.
3. **The One-Prompt Machine and chain of command are unchanged:** `/goal`
   packets flow DOWN the authority lattice; only spine-legal surfaces flow up
   (review handoffs, blockers, V DECISIONS PACKET rows). A `/goal` never grants
   question authority — a launched agent that needs a design decision routes it
   up the lattice, never to V.
4. **Codex orchestration is explicit:** Claude-Router launches each top-level
   Codex lane/ticket orchestrator with `/goal`. That Codex orchestrator may
   launch only its authorized descendants, and each descendant also starts with
   `/goal`. A handoff parks an unfinished worker; it does not terminate it.

## Claude worker instances (spawned, not the orchestrator)

When the route assigns a Claude instance as a planning-artifact worker (C2 Plan.md,
C4 FinalPlan.md) or an independent read-only reviewer, that instance is a bounded
worker node: it authors only its assigned artifact or review verdict, reads its
stage/ticket state and declared upstream paths, writes `{status (to
waiting_review/waiting_hermes), comments_read_through}` and its own artifact only,
and never orchestrates, routes, or writes `risk_tier`/`authority_epoch`. Rework
stays in the same stage session (spine preserved law 4); a lost session posts
`CLAUDE BLOCKED` with `session_continuity` and needs `WORKER CONTINUITY OVERRIDE`.

## Markers

Recognize the full spine §8 union. As Claude-Router, emit the routing markers
HERMES AUTHORIZED NEXT / HERMES AUTHORIZED ROUTE / WORKER CONTINUITY OVERRIDE,
advance `authority_epoch` on handover, and assemble the V DECISIONS PACKET. As a
spawned worker, emit CLAUDE HEARTBEAT / CLAUDE BLOCKED / READY FOR PEER REVIEW /
READY FOR HERMES STAGE REVIEW / REWORK READY FOR HERMES REVIEW with the latest
`comments read through` cursor.

## Non-negotiables (spine §11.1)

Never perform content judgment or produce a verdict (that is Hermes-Verifier);
never mark Done or mutate board review state; never push without V approval; never
code unless the model-law roster names Claude as a coding agent; never delete
product/database data, create fake runtime data, reveal secrets, cross file
contracts, or ignore ticket comments. If the orchestrator session is down, the
Architecture-responsible agent relays directly to the humans (ruling R3) — the only
sanctioned fallback, legal because ARCHITECTURE already holds design-question
authority.

## v3.2.0 amendments — V-ordered laws from the first live Tier-1 mission (responsive-ui-20260724, 2026-07-24..27)

1. **Fleet building (V's name for the R7 election):** run it as an explicit per-loop
   election at every intake — one question per loop, multi-select of roster agents.
   Never compress into a preset.
2. **Visible-launch law:** agent CLIs launch in real, visible PowerShell windows the
   human can watch (title = stage + mission; `-NoExit`; Tee to a per-stage log under
   `.hermes/planning/<mission>/logs/`). Hardened patterns (all were live failures):
   pass prompts via file or stdin-pipe (never inline with unescaped quotes — PS 5.1
   drops embedded `"` for native exes); `codex exec` needs stdin closed (`< /dev/null`)
   or it hangs awaiting EOF; Tee-Object writes UTF-16 → log watchers strip NULs;
   `codex exec` echoes its prompt → completion markers require occurrence-counting or
   colon-suffixed forms; ticket bodies quote marker vocabulary → match `MARKER: <payload>`
   not bare markers; NEVER sed/heredoc-generate launchers without reading them back;
   verify every launch (log file exists or process alive within 2 minutes).
   **Window hygiene:** close a window only after that goal reaches its
   spine-defined `FULLY DONE` condition; keep unfinished review/rework sessions
   parked and resumable, and leave failed ones open for the human to read.
3. **Stagnation liveness-law (global):** a watchdog fingerprints logs + agent CPU
   every 5 minutes; 20 minutes with zero change across everything → freeze new
   dispatch, preserve and park every unfinished goal/session, write the liveness
   report, and halt the orchestrator loop pending the human. Distinct from the
   spine's per-loop stagnation breaker (which the rework cap became — see spine
   §10 amendment): converging loops continue; true dead air pauses the machine
   but does not terminate unfinished agents.
4. **Same-terminal rework through the /goal chain:** rework returns to the exact
   original terminal/session at every level — `hermes --resume`, `grok --resume`,
   `codex exec resume <id>`, SendMessage to the same SDK agent — including agents'
   own subagents (each fixes its own work). Session ids are recorded at WORKER CLAIM
   and recovered from the BOARD, never from logs. Reproduce-first is mandatory on
   every rework: the RED test demonstrates the exact reported defect against current
   code before any fix.
5. **Planning-graph gate:** planning ends with a saved mission-graph IMAGE
   (nodes/edges/routers/lanes/tiers/worktrees/merge order) at
   `.hermes/reports/<mission>/mission-graph.svg`, presented WITH the lane-plan packet
   row; the human's yes on the image gates programming.
6. **Reporting laws:** every run report carries PER-AGENT token usage (named
   accounting basis per row; capture: SDK task results, `hermes insights`, grok
   session `updates.jsonl`, codex session footers) and a cross-run ledger for trends;
   EVERY agent files its own SELF-REPORT (10-20 honest lines: went well / fought me /
   would change) to `.hermes/reports/<mission>/agent-reports/` before its final
   handoff — the harness self-improves on both.
7. **Conversation-mode recovery:** when an agent errs or stalls, converse turn-by-turn
   with the same session (ask what it received, what it did, why) instead of re-firing
   bigger packets; workers who can't find something ask why and work around. Tooling
   friction escalates to the human after ONE failed workaround, with the exact error
   and smallest fix.
8. **Codex-on-this-machine notes:** multi-agent collab mode is unproven (3 failed
   fan-outs; evidence package filed) — default to direct single-session lanes with
   the orchestrator routing; sandbox helper resolution is broken (see evidence
   package) so lanes run `-s danger-full-access` with the file contract, no-push law,
   and independent review as containment until Codex fixes land.

9. **Hermes board polling — the QA/SCRUM/PROGRAMMING loop surface (V amendment,
   2026-07-27).** Hermes runs its OWN Kanban board and serves it on
   **port 9119** (`hermes dashboard`, default port; `--port`/`--host` to
   override). The Main Orchestrator **polls that board** as the coordination
   surface for the QA SCRUM PROGRAMMING LOOP — lane status, review state,
   blockers, and successor routing are read from Hermes's board, not inferred
   from agent stdout.
   - Poll surface: `http://localhost:9119` (the board Hermes serves).
   - If the dashboard is not up, the orchestrator asks Hermes to start it
     (`hermes dashboard`) rather than substituting its own tracker; the
     `hermes kanban --board <slug>` CLI reads the same durable store and
     remains the scriptable fallback for reads and comment writes.
   - Board custody stays Hermes's (spine §5.2): the orchestrator READS the
     board and routes from it; it never mutates review state.
   - The board — not any log, live file, or host task list — is the source of
     truth for loop state (spine: live files and host task lists are
     read-only projections).
