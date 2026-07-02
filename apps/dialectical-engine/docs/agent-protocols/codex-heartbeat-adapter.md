# Codex Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## Codex role

Codex is the primary implementation coordinator for `[Codex]` tickets. Codex may use subagents/workstreams when safe, but Codex remains responsible for file ownership, verification, commit hygiene, and the unified Kanban handoff.

## Startup checklist

Before branch creation, subagents, edits, or handoff prep:

1. Read `AGENTS.md`.
2. Read `docs/agent-protocols/debateai-heartbeat-protocol.md`.
3. Read this adapter.
4. List Kanban for the active tenant.
5. Claim or continue the current `[Codex]` ticket only if it is `ready` or `running` and dependencies are satisfied.
6. Read the full ticket body and comments.
7. Confirm branch, allowed files, forbidden files, verification commands, and same-file/collision notes.

## Worktree and branch rule

Use the branch declared on the ticket. If Kanban generated an awkward or missing worktree path, use the already-established lane worktree/branch for the ticket's branch and report the actual path in the heartbeat/handoff. Do not block the whole goal only because the generated worktree path is awkward.

## Subagent/workstream rule

Codex may dispatch parallel workstreams only when ownership does not overlap:

- one writer per file/hunk;
- read-only audit/test-planning can run in parallel;
- implementation workstreams must map owned files first;
- if two workstreams need the same file/hunk, serialize them;
- never let subagents cross into `[Claude]` ticket files without Hermes routing.

## Live-output rule

When Hermes declares `LIVE MONITORING ACTIVE`, Codex must write short V-readable progress lines to the live-output channel named in the routing packet.

```text
[HH:MM] CODEX <ticket-id> — <state>: <one-line action/result/next step>
```

Codex must update that channel at startup, before/after long commands, when starting or finishing subagents/workstreams, when blocked, and at handoff. This does not replace Kanban: Codex must still post `CODEX HEARTBEAT`, `CODEX BLOCKED`, and `READY FOR HERMES REVIEW` comments to Kanban.

If no separate live chat/session is available, use the Hermes-declared fallback file under `.hermes/live/` and mention that path in every heartbeat while live-output is degraded.

## Blocked discipline

Use `CODEX BLOCKED` only for true blockers:

- required forbidden files;
- missing dependency;
- architecture/product decision;
- destructive data risk;
- secret/private-data risk;
- impossible verification;
- contradictory Kanban routing that Hermes must fix.

For local implementation friction, fix the smallest local slice or post `CODEX HEARTBEAT` with `needs Hermes: yes`. Do not block the overall goal when a valid active ticket exists.

## Required comments

### CODEX HEARTBEAT

```text
CODEX HEARTBEAT:
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

### CODEX BLOCKED

```text
CODEX BLOCKED:
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
- agent: Codex
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

- the ticket is not `[Codex]`;
- a parent is not Done;
- the allowed-file contract is absent;
- the work requires `[Claude]` files;
- the work requires data deletion or schema migration not explicitly approved;
- verification cannot be run or reasonably substituted.

Hermes owns Done. Do not mark tickets Done. Do not push without explicit V approval.
