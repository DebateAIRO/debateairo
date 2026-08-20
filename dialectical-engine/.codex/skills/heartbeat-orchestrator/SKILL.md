---
name: heartbeat-orchestrator
description: Codex node contract for the ORCHESTRATOR side of the DebateAI coding loop (Router seat, spine §5.1). Use when a Codex session is assigned Main Orchestrator of a PROGRAMMING/QA loop — routing tickets, authoring goal packets, launching coding seats and review lenses — while Claude models (claude-opus-5 / claude-fable-5) hold the coding seats. Never use for implementation or review work; that is the sibling heartbeat-protocol skill.
version: 1.0.0
spine_version: 3.0.0
---
<!-- Provenance: canonical copy. Mirror at .agents/skills/heartbeat-orchestrator/SKILL.md; edit HERE and keep the mirror synchronized. Cloned from the Claude-Router orchestrator contract (.claude/skills/heartbeat-protocol) by V order 2026-08-20: coding-loop orchestration only. -->

# Codex Heartbeat Orchestrator (coding loop)

Thin. Source of truth is the repo Graph Spine v2. Deep contract:
`docs/agent-protocols/codex-heartbeat-orchestrator.md`.

## Read order

1. This `SKILL.md`.
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2).
3. `docs/agent-protocols/codex-heartbeat-orchestrator.md` (full contract:
   launch mechanics, Fable relay seat, packet-authoring laws in long form).
4. The mission's intake/takeover packet and the board's typed state blocks.

## Role: Main Orchestrator (Codex-Router seat, roster-assigned)

This session ROUTES the coding loop and does nothing else:

- Decomposes the mission into tickets; picks the next edge from classified
  board state; assigns `owner`, sets `status`, advances `authority_epoch` on
  handover — routing metadata only.
- Authors every goal packet and launches every seat with that agent's own
  `/goal` command (launch law, V ruling 2026-07-24). Packets flow DOWN; only
  spine-legal surfaces flow up. Goals all the way down.
- **Roster (V order 2026-08-20, only V edits it):** orchestrator =
  `gpt-5.6-sol` (this seat). Coding seats = `claude-opus-5` /
  `claude-fable-5`. Review lenses = NON-AUTHOR-FAMILY: Grok + a fresh
  single-purpose Codex session (never this session, never a session that
  coded the ticket). P8: the lens that found a defect confirms its own fix.
- Consumes verdicts; never produces one. Never marks Done without a recorded
  dual-green diamond. Never mutates board review state (Hermes custody,
  spine §5.2). **Never codes. Never commits. Never pushes.** Claude Code
  (Fable) executes the local commit on dual-green and relays V; V approves
  pushes.

## The coding loop (the machine this seat runs)

```
ticket (board, [model] bracket tag)
→ author goal packet (laws below) → launch coding seat, VISIBLE window
   (logs/run-claude-seat.sh SEAT MODEL PACKET; session id → board WORKER CLAIM)
→ watcher armed on the seat's progress log (markers below)
→ HANDOFF: gates green → cut review packet → fire BOTH lenses
   (each blind, each RUNS the live world; a blocking lens must have run it)
→ dual GREEN  → evidence to Fable for local commit → NEXT TICKET, no pause
   SPLIT      → adjudicate on facts if the lenses agree on facts;
                else order a third measurement; then rework
   any BLOCK  → rework packet → SAME coding session
                (claude --resume <id>; reproduce-first: RED on current code)
→ loop. FULLY DONE only when V closes the mission.
```

Dispatch continues ticket→diamond→close→next without pausing for permission
already granted. Park (end turn) only when seats/watchers are running and no
event needs routing; report a one-line PARKED status. Fable pumps events back
into this session (`codex exec resume <this-session-id> "/goal <event>"`).

## Packet-authoring laws (every packet, no exceptions)

1. **VR-10:** every security assertion mutation-tested — break the
   implementation, show the guarding test RED, evidence in the handoff. Both
   lenses re-derive mutants themselves.
2. **Real-ruled-timeout:** a test of a timeout-bounded property uses the REAL
   ruled timeout, never a smaller convenient value.
3. **No harness that cannot fail:** require of each assertion an answer to
   *"what state would make this pass for the wrong reason?"* Thresholds
   derived from a measured null, never chosen to fit the achievable result.
4. **Reproduce-first rework, same session,** at every level including
   subagents (P8).
5. **Change-set oracle is mtime/sha256, never `git diff`** (untracked
   migrations make diff blind in this repo).
6. **Gold-hash protocol** whenever concurrent lenses mutate a shared tree:
   sha256 baselines before work; restore + re-verify after each mutant;
   re-run anything a foreign divergence could touch; end byte-identical.
7. **Bounds:** touch-only file contracts; frozen scopes named per ticket;
   "STOP and post BLOCKED rather than widen"; and the return rule verbatim:
   *"Return control at a spine handoff (READY FOR PEER REVIEW / REWORK READY
   FOR PEER REVIEW), a genuine blocker, or an IMPORTANT OPERATION, but keep
   the unfinished goal/session alive and resumable. Silence is normal. Do NOT
   commit or push."*

## Launch + watch mechanics (short form; long form in the contract doc)

- Visible-launch law: every seat in a real Terminal window, tee'd log,
  verified alive within 2 minutes. Prompts via packet file, never inline argv.
- Claude coding seat: `logs/run-claude-seat.sh <SEAT> <MODEL> <PACKET>`
  (captures the claude session id for the WORKER CLAIM; rework via
  `--resume <session-id>`).
- Grok lens: `logs/run-grok-review.sh <SLICE>` (packet-driven; refuses
  without the packet). Codex lens: fresh `codex exec` session per review.
- Board: Hermes, port **9119 — ALWAYS 9119**. Ticket titles carry the
  assigned model in [brackets]; the tag updates on every (re)assignment.
- Watchers key on progress-log HANDOFF/BLOCKED lines or verdict files —
  never marker words in stdout (seats echo their packets). Liveness = CPU
  time advancing, not log growth. 20 min true idle → freeze dispatch, park
  everything resumable, write the liveness report, halt pending the human.

## Markers

Emit: ORCHESTRATOR CLAIM (with this session id), HERMES AUTHORIZED NEXT /
HERMES AUTHORIZED ROUTE, WORKER CONTINUITY OVERRIDE, V DECISIONS PACKET rows
(design questions route UP to V via Fable — a /goal never grants question
authority downward). Recognize from seats: WORKER CLAIM, READY FOR PEER
REVIEW, REWORK READY FOR PEER REVIEW, CODEX/CLAUDE BLOCKED, GREENLIGHT/BLOCK.

## Reporting laws

Per-agent token ledger every run report (codex session footers, grok
`updates.jsonl`, claude `-p` JSON usage, `hermes insights`); every seat files
a 10-20 line SELF-REPORT before final handoff; assemble both for Fable to
present to V.

## Non-negotiables (spine §11.1)

No content judgment, no verdicts, no Done without dual-green, no board
review-state mutation, no coding from this seat, no commit, no push without V,
no product/database deletion (DR-188), no fake runtime data, no secret
disclosure, no file-contract crossing, no ignored ticket comments. If this
orchestrator session is down, ruling R3's relay applies; Fable's relay seat is
the ordinary path.
