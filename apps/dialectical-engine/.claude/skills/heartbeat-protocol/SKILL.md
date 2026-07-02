---
name: heartbeat-protocol
description: Claude adapter for the DebateAI shared Kanban heartbeat protocol. Use when Hermes routes a [Claude] ticket or V invokes the Claude coding loop. Hermes acts as cockpit broker — Claude sources routing, tenant, branch, and file contracts from Kanban/Hermes, not from V.
---

# Claude Heartbeat Protocol Adapter

This Claude skill is intentionally thin. The shared protocol spine lives in repo docs so Hermes, Claude, and Codex follow the same rules.

Read in this order:

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md`
3. `docs/agent-protocols/claude-heartbeat-adapter.md`
4. The current Kanban ticket body and Hermes comments

## Claude role

```text
V      = commander / product decision maker — Claude does NOT ask V for ticket IDs, branches, file contracts, or routing.
Hermes = cockpit broker / reviewer / Done gate / Blocked authority — Claude's primary interface.
Claude = isolated parallel lane worker for [Claude] tickets.
Kanban = current source of truth.
```

**Hermes is the cockpit broker by default.** When V invokes `/heartbeat-protocol`:
- Hermes infers the active tenant/workstream and routes Claude through Kanban.
- Claude reads all routing, branch, file contract, and ticket info from Kanban ticket bodies and Hermes comments.
- If confused, Claude asks Hermes through Kanban (`CLAUDE HEARTBEAT` with `needs Hermes: yes`) — not V.

## Non-negotiables

- Work only `[Claude]` tickets.
- Read the ticket body and comments before editing.
- Respect `Allowed to edit` and `Forbidden` file contracts.
- Do not touch Codex-owned files.
- Do not mark tickets Done.
- Do not push without explicit V approval.
- Do not delete product/database data.
- Do not create fake runtime product data.
- Use `CLAUDE HEARTBEAT`, `CLAUDE BLOCKED`, and `READY FOR HERMES REVIEW` exactly as defined in the shared docs.
- When Hermes declares `LIVE MONITORING ACTIVE`, also keep the named V-visible live-output channel updated with short progress lines. If Hermes provides only a `.hermes/live/` fallback file, write there and report that path in heartbeats.

## Self-blocking prevention

If a valid active `[Claude]` ticket exists, do NOT block the whole goal because of:
- worktree path confusion
- branch uncertainty when the branch is declared in the ticket
- prior completed ticket state
- local implementation friction

Instead: continue the active ticket, fix the smallest local slice, or post `CLAUDE HEARTBEAT` with `needs Hermes: yes`. Ask Hermes through Kanban — not V.

## ScheduleWakeup note

If running in a scheduler-capable Claude environment, use the one-minute heartbeat loop described in `docs/agent-protocols/claude-heartbeat-adapter.md`. End the loop only when the Claude chain is complete or a V-level blocker exists.

Kanban ticket bodies and Hermes comments override this adapter for current mission details.
