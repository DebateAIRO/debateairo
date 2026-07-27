---
name: heartbeat-protocol
description: Codex adapter for DebateAI's comment-driven Kanban Heartbeat protocol. Claude-Router and every descendant launch Codex agents through /goal; unfinished workers remain resumable through review and rework until FULLY DONE.
---

# Codex Heartbeat Protocol

## Read order

1. `AGENTS.md`
2. `docs/agent-protocols/debateai-heartbeat-protocol.md`
3. `docs/agent-protocols/codex-heartbeat-adapter.md`
4. Current Kanban ticket body and every comment in chronological order

The latest applicable Hermes/human comment is current routing law. Do not act from status alone.

## Role

```text
Codex GPT-5.6 Sol = sole coding worker
Peer reviewer       = different read-only agent/session
Hermes              = non-delegable evidence reviewer, cockpit, human-review router, Done/Blocked authority
V                    = human product/acceptance reviewer
```

Claude-Router must launch this Codex coordinator with
`/goal <bounded ticket/lane packet>`. New ticket means a new goal/session.
Rework means resume the same original goal/session.

## /goal chain and worker lifetime

- If Claude directly launches Codex without `/goal`, request a corrected
  `/goal` from Claude-Router before dispatching agents or editing files. Record
  the process blocker through the orchestrator channel; never ask V to relay it.
- Every downstream agent launch starts with
  `/goal <ticket-scoped objective>`, including lane orchestrators, coding
  workers, reviewers, and helpers.
- Record parent/child goal and session IDs, transport, resumability, packet
  acknowledgement, worktree/branch, claim expiry, and lock identity in the
  durable lane registry.
- `READY FOR PEER REVIEW`, `READY FOR HERMES REVIEW`, Blocked, stalled,
  compaction, claim expiry, or waiting for review does not complete a goal.
  Stop editing at the required boundary, but keep the exact worker alive and
  resumable for review requests.
- An implementation goal is `FULLY DONE` only after fresh `HERMES DONE`, no
  unresolved review/rework request or pending gate, final evidence receipts,
  and the same worker's final self-report. Do not terminate an unfinished
  worker or replace it merely to save time.

## On launch or wakeup

1. Read the ticket body and all comments.
2. Record `comments read through: <latest id/timestamp>`.
3. Determine from comments whether this is first-pass work, peer-review correction, Hermes rework, human rework, or waiting.
4. Confirm `[Codex]`, `Assigned agent: Codex`, original/rework owner, session ID, branch/worktree, dependencies, file contract, verification, and human gate.
5. Continue this session's `running` ticket before claiming anything new.
6. Post `WORKER CLAIM` before edits.
7. Repeat the comment scan before every edit phase, heartbeat, review request, and handoff.

## First-pass flow

```text
WORKER CLAIM
→ RED → GREEN → REFACTOR
→ exact focused checks
→ READY FOR PEER REVIEW
→ stop editing but remain alive and resumable
```

The first-pass Codex worker does **not** post `READY FOR HERMES REVIEW`.
Claude-Router launches a separate reviewer through `/goal`; Hermes independently
verifies the resulting verdict. On reviewer RED, the same Codex worker fixes and
requests peer re-review. On reviewer GREEN, the reviewer posts
`READY FOR HERMES REVIEW`; Hermes itself then reads the full comment chain, diff,
tests, and product evidence. Reviewer GREEN never substitutes for Hermes's own
review.

## Post-dialogue checkpoint compaction

After every durable Codex coding, review, or correction handoff—and after any
substantive Hermes↔Codex ping-pong—keep this PTY open and idle. Hermes first
verifies that artifacts/diffs, checks, comments, decisions, unresolved
findings, and next gate are durable, then sends exactly:

```text
/compact
```

The installed Codex 0.144.0 menu does not document preservation arguments.
Hermes waits for completion/prompt return and records
`CODEX COMPACTION CHECKPOINT` before parking this terminal or proceeding:

```text
READY FOR PEER REVIEW → compact worker PTY → peer review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

If substantive dialogue follows the checkpoint, compact again at the next
stable handoff. Never compact while work/tests/generation are in flight and do
not exit merely because the conversation became chatty.

## Hermes/human correction flow

When the ticket returns to `ready` with `HERMES CHANGES REQUESTED` or `HUMAN REVIEW CHANGES REQUESTED`:

1. Resume this exact original Codex session.
2. Read all comments added after the prior handoff, including supersessions.
3. Post `REWORK ACKNOWLEDGED` with the triggering comment and each finding.
4. Reproduce RED where applicable, make the smallest GREEN fix, and verify.
5. Post `REWORK READY FOR HERMES REVIEW` directly to Hermes.
6. Peer re-review only when Hermes explicitly requests it.
7. If Hermes returns it again, repeat in this same session.

If this session is lost, post `CODEX BLOCKED` with `session_continuity`. Do not create a replacement without `WORKER CONTINUITY OVERRIDE`.

## Reviewer mode

If Hermes launches this Codex session as a reviewer, it is read-only:

- read all comments and `READY FOR PEER REVIEW` evidence;
- independently inspect and verify;
- never edit the reviewed files;
- post `PEER REVIEW CHANGES REQUESTED` on RED;
- post `PEER REVIEW APPROVED` and then `READY FOR HERMES REVIEW` on GREEN;
- never review work authored by this same CLI session.

## Required comment markers

Recognize and obey:

```text
WORKER CLAIM
CODEX HEARTBEAT
CODEX BLOCKED
CODEX COMPACTION CHECKPOINT
COMPACTION BLOCKED
READY FOR PEER REVIEW
PEER REVIEW CHANGES REQUESTED
PEER REVIEW APPROVED
READY FOR HERMES REVIEW
HERMES CHANGES REQUESTED
READY FOR HUMAN REVIEW
HUMAN REVIEW PASSED
HUMAN REVIEW CHANGES REQUESTED
REWORK ACKNOWLEDGED
REWORK READY FOR HERMES REVIEW
WORKER CONTINUITY OVERRIDE
```

Every outgoing marker includes the latest `comments read through` cursor.

## Hard rules

- Use GPT-5.6 Sol.
- Work only the assigned `[Codex]` ticket and file contract.
- Do not create/split/reroute tickets.
- One writer per file/hunk; parallel lanes require non-overlap.
- Serialize heavy builds/tests when in doubt about V's available RAM.
- Do not mark Done, push without V approval, delete database/product data without specific approval, create fake runtime data, reveal secrets, or ignore ticket comments.
- Reviewer never writes the fix; worker never self-approves first-pass work.
- Hermes's own review remains mandatory after reviewer GREEN.
- Every durable coding/review/rework handoff is followed by verified
  same-terminal `/compact` before parking or review.
- Every direct or delegated launch uses `/goal`; a handoff is never
  implementation-goal completion.
- Do not terminate an implementation worker until its `FULLY DONE` condition
  is verified.
