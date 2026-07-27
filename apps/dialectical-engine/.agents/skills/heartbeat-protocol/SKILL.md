---
name: heartbeat-protocol
description: "Codex node contract for DebateAI Graph Spine v2. Semantic mirror of the .codex contract: /goal launches all Codex agents, and unfinished workers remain resumable through review/rework until FULLY DONE."
---

# Codex Node Contract (.agents mirror)

Thin. Source of truth is the repo Graph Spine v2. This `.agents` node contract
semantically mirrors the `.codex` Codex node contract; both mounts resolve the
same sole-coding-worker role.

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/codex-heartbeat-adapter.md`
4. The current Kanban ticket state block and its comments

## Role (current law: sole coding worker)

```text
Codex GPT-5.6 Sol = sole coding worker; A7 implementation lanes in isolated worktrees
Claude / Grok     = planning-artifact workers and read-only reviewers (never code under the current law)
```

Claude-Router must launch this Codex coordinator with
`/goal <bounded ticket/lane packet>`. If Claude directly invokes Codex without
`/goal`, Codex requests a corrected launch from Claude-Router and performs no
dispatch or edits; V is not the relay.

Every downstream agent launch starts with `/goal <ticket-scoped objective>`.
Record the parent/child goal/session chain, transport, resumability, packet
acknowledgement, worktree/branch, claim expiry, and resource-lock identity in
durable ticket or workspace-local state.

`READY FOR PEER REVIEW`, `READY FOR HERMES REVIEW`, Blocked, stalled,
compaction, claim expiry, or a review wait is not goal completion. The original
worker stops editing but remains alive and resumable for every requested review
or rework round. An implementation goal is `FULLY DONE` only after fresh
`HERMES DONE`, no unresolved review/rework request or pending gate, durable
final receipts, and the same worker's final self-report. Do not terminate an
unfinished worker or replace it merely for speed.

## State reads/writes (spine §3)

Reads `{contract, status, rework_round, authority_epoch, worktree,
comments_read_through}`. Writes `{status, worktree, evidence refs,
comments_read_through}`. Never writes `risk_tier`, `authority_epoch`, or
`owner.agent`.

## Node flow

Claim a Ready card only when authorized — its latest applicable
`HERMES AUTHORIZED NEXT`, OR the card is named in a current
`HERMES AUTHORIZED ROUTE` for the epoch; per-node re-auth is required again on any
new risk signal or important operation (spine §10). Fetch only the assigned ticket
(launch-packet bound, spine §4); never list the board. Work one card at a time in
its isolated worktree; run the Split -> Verify -> Merge lane checklist (spine
`## Worktree isolation`, Phase 5). Post `READY FOR PEER REVIEW` on first-pass
completion; a separate read-only reviewer advances GREEN work. Never self-Done,
never self-integrate.

## Worktree lanes (spine `## Worktree isolation`)

Create a worktree only after the H6 LANE PLAN APPROVAL row for the current
`authority_epoch` is approved. Destructive git (worktree remove, branch delete,
history rewrite, force push) stays individually V-gated.

## Markers

Recognize the full spine §8 union incl. `HERMES AUTHORIZED NEXT` /
`HERMES AUTHORIZED ROUTE`. Emit `CODEX HEARTBEAT` / `CODEX BLOCKED` /
`WORKER CLAIM` / `READY FOR PEER REVIEW` / `REWORK READY FOR HERMES REVIEW` with the
`comments read through` cursor.

## Non-negotiables (spine §11.1)

Never mark Done, push/merge without V approval, delete database/product data without
specific approval, create fake runtime data, cross file contracts, or ignore ticket
comments.
