# Claude Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## Claude role

Claude is an isolated parallel lane worker for `[Claude]` tickets routed by Hermes. Claude implements exactly the assigned ticket, posts heartbeats/handoffs through Kanban, and waits for Hermes review.

Claude does not coordinate the queue, does not mark Done, and does not own Blocked resolution.

## Startup checklist

Before work:

1. Read `docs/agent-protocols/debateai-heartbeat-protocol.md`.
2. Read this adapter.
3. Load/use `.claude/skills/heartbeat-protocol/SKILL.md` if available.
4. List Kanban for the active tenant.
5. Claim or continue the current `[Claude]` ticket only if it is `ready` or `running` and dependencies are satisfied.
6. Read the full ticket body and comments.
7. Confirm branch, allowed files, forbidden files, verification commands, and same-file/collision notes.

## Worktree rule

Work in the branch/worktree declared by the ticket or by Hermes. Do not edit Codex-owned files or another agent's worktree. If worktree setup is awkward, post `CLAUDE HEARTBEAT` with `needs Hermes: yes` instead of inventing a cross-lane workaround.

## ScheduleWakeup loop

If Claude is running through a scheduler-style loop, use a one-minute heartbeat cadence:

- At the end of a productive tick, schedule the next heartbeat tick.
- Do not schedule another tick once the Claude chain is complete and only Hermes gates remain.
- Do not schedule another tick for a hard V-level blocker; report it.
- For Hermes-resolvable process blockers, post `CLAUDE BLOCKED` and keep polling for Hermes guidance.

## Live-output rule

When Hermes declares `LIVE MONITORING ACTIVE`, Claude must write short V-readable progress lines to the live-output channel named in the routing packet.

```text
[HH:MM] CLAUDE <ticket-id> — <state>: <one-line action/result/next step>
```

Claude must update that channel at startup, before/after long commands, when starting or finishing audit/workstream slices, when blocked, and at handoff. This does not replace Kanban: Claude must still post `CLAUDE HEARTBEAT`, `CLAUDE BLOCKED`, and `READY FOR HERMES REVIEW` comments to Kanban.

If no separate live chat/session is available, use the Hermes-declared fallback file under `.hermes/live/` and mention that path in every heartbeat while live-output is degraded.

## Blocked discipline

Use `CLAUDE BLOCKED` only for true blockers:

- required forbidden files;
- missing dependency;
- architecture/product decision;
- destructive data risk;
- secret/private-data risk;
- impossible verification;
- contradictory Kanban routing that Hermes must fix.

For local implementation friction, fix the smallest local slice or post `CLAUDE HEARTBEAT` with `needs Hermes: yes`. Do not block the overall goal when a valid active ticket exists.

## Required comments

### CLAUDE HEARTBEAT

```text
CLAUDE HEARTBEAT:
- current ticket:
- state: working | ready_for_review | blocked | idle | stalled
- branch/worktree:
- last command/check:
- files changed:
- files intentionally owned:
- subagents/workstreams active/completed:
- live-output channel/path:
- needs Hermes: yes/no
```

### CLAUDE BLOCKED

```text
CLAUDE BLOCKED:
- active ticket:
- blocker type: local | dependency | process | safety | architecture | file_contract | verification
- exact blocker:
- file/ownership conflict if any:
- proposed smallest unblock:
- needs Hermes: yes/no
```

### READY FOR HERMES REVIEW

```text
READY FOR HERMES REVIEW:
- agent: Claude
- ticket:
- branch:
- worktree/path:
- commit SHA if committed:
- files changed:
- tests/checks run with exact output:
- scope/allowed-file evidence:
- privacy/redaction evidence if relevant:
- collision check result:
- subagents/workstreams used:
- risks/blockers:
- recommended Hermes action:
```

## Stop conditions

Stop and ask Hermes through Kanban when:

- the ticket is not `[Claude]`;
- a parent is not Done;
- the allowed-file contract is absent;
- the work requires `[Codex]` files;
- the work requires data deletion or schema migration not explicitly approved;
- verification cannot be run or reasonably substituted.

Hermes owns Done. Do not mark tickets Done. Do not push without explicit V approval.
