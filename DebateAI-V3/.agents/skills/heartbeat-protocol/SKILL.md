---
name: heartbeat-protocol
description: Codex node contract for DebateAI-V3's comment-driven Kanban Heartbeat protocol and Graph Spine v2. Use when Codex is assigned implementation, rework, or independent peer review on a DebateAI-V3 ticket and must follow typed-state, authorization, worktree, evidence, review, and compaction rules.
version: 3.1.0
spine_version: 3.0.0
---
<!-- Provenance: mirror of .codex/skills/heartbeat-protocol/SKILL.md; edit the .codex file canonically and keep this copy synchronized. -->

# Codex Heartbeat Protocol

## Read order

1. This `SKILL.md`.
2. `docs/agent-protocols/debateai-heartbeat-protocol.md`.
3. `docs/agent-protocols/codex-heartbeat-adapter.md`.
4. The assigned Kanban ticket's typed state block, body, declared upstream artifacts, and every comment in chronological order.

The repo currently has no root `AGENTS.md`. This is a recorded repository gap,
not permission to invent its contents. If a root `AGENTS.md` is later added, read
it before this contract and obey the normal instruction-precedence rules.

The Graph Spine is normative. Treat typed ticket state as canonical and apply the
latest applicable authorized Hermes/human comment for the current
`authority_epoch`. Never route from status alone.

## Role

```text
Codex GPT-5.6 Sol = sole implementation worker under the current model law
Peer reviewer       = different read-only agent/session
Claude-Router       = routing authority; dispatches from typed state, does no content work
Hermes-Verifier     = evidence reviewer, board custodian, human-review router, Done/Blocked authority
V                    = human product/acceptance and important-operation authority
```

Use one managed Codex CLI PTY per implementation ticket. A new ticket gets a new
terminal. Rework resumes the original ticket/session. Coordinate subagents only
inside the assigned contract, with non-overlapping files/hunks; the ticket worker
still owns the handoff and continuity.

## On launch or wakeup

Before branch creation, subagents, edits, tests, or handoff:

1. Read the sources in the stated order.
2. Fetch only the assigned ticket and declared upstream artifacts; never list the board.
3. Record `comments read through: <latest id/timestamp>`.
4. Determine from typed state and comments whether the work is first pass, peer-review correction, Hermes rework, human rework, reviewer mode, or waiting.
5. Confirm `[Codex]`, `owner.agent: codex`, original/rework owner, session ID, `authority_epoch`, `rework_round`, branch/worktree, dependencies, file contract, verification, and human gate.
6. Continue this session's active `working` ticket before claiming anything new.
7. Claim a `ready` ticket only under the latest applicable `HERMES AUTHORIZED NEXT`, or when named in a current `HERMES AUTHORIZED ROUTE` for the epoch.
8. Post `WORKER CLAIM` before edits and set `owner.session` to this CLI session.
9. Repeat the comment scan before every edit phase, heartbeat, review request, status transition, and handoff.

Require fresh authorization after an `authority_epoch` change, a new risk signal,
or an important operation. Do not infer authorization from an old route.

## First-pass flow

```text
WORKER CLAIM
→ RED → GREEN → REFACTOR
→ exact focused checks
→ READY FOR PEER REVIEW
→ stop editing
```

Include in `READY FOR PEER REVIEW`: CLI session ID; ticket; branch/worktree and
commit if any; changed files; RED/GREEN evidence; exact checks and outputs;
allowed-file evidence; risks; and the latest comment cursor.

The first-pass worker does not post `READY FOR HERMES REVIEW`. A separate
read-only reviewer evaluates the work. On reviewer RED, the same worker fixes the
findings and requests peer re-review. On reviewer GREEN, the reviewer posts
`PEER REVIEW APPROVED` and `READY FOR HERMES REVIEW`. Hermes then performs its
own non-delegable review; reviewer GREEN never substitutes for Hermes review.

## Post-dialogue checkpoint compaction

After every durable Codex coding, review, or correction handoff, and after any
substantive Hermes↔Codex dialogue, leave the same PTY open and idle. Hermes first
verifies that artifacts/diffs, checks, comments, decisions, unresolved findings,
and the next gate are durable, then sends exactly:

```text
/compact
```

Do not add preservation arguments unless the installed Codex version documents
them. Hermes waits for completion and prompt return, then records
`CODEX COMPACTION CHECKPOINT` before parking the terminal or proceeding:

```text
READY FOR PEER REVIEW → compact worker PTY → peer review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

If substantive dialogue follows a checkpoint, compact again at the next stable
handoff. Never compact while work, tests, or generation are in flight. Do not exit
merely because the conversation became chatty.

## Peer-review correction flow

When a reviewer posts `PEER REVIEW CHANGES REQUESTED`:

1. Resume the same worker/session and read all new comments.
2. Acknowledge and address every finding; preserve unresolved earlier findings unless explicitly superseded.
3. Reproduce RED where applicable, make the smallest GREEN fix, and verify.
4. Post `READY FOR PEER REVIEW` again and stop editing.

The reviewer never writes the fix.

## Hermes/human correction flow

When the ticket returns with `HERMES CHANGES REQUESTED` or
`HUMAN REVIEW CHANGES REQUESTED`:

1. Resume the exact original Codex session.
2. Read every comment after the prior handoff, including supersessions.
3. Post `REWORK ACKNOWLEDGED`, naming the triggering comment and each finding.
4. Reproduce RED where applicable, make the smallest GREEN fix, and run focused verification.
5. Post `REWORK READY FOR HERMES REVIEW` directly to Hermes, addressing findings one by one.
6. Request peer re-review only when Hermes explicitly says `peer re-review required: yes`.
7. Repeat in the same session if the ticket returns again.

If the original session is unavailable, post `CODEX BLOCKED` with blocker type
`session_continuity`. Do not create a replacement without
`WORKER CONTINUITY OVERRIDE`.

## Reviewer mode

Enter reviewer mode only when explicitly assigned in a separate read-only
session:

- Read the full ticket, typed state, all comments, upstream artifacts, and `READY FOR PEER REVIEW` evidence.
- Verify worker/session identity, inspect the diff, and independently run justified checks.
- Never edit reviewed files or review work authored by this same CLI session.
- Post `PEER REVIEW CHANGES REQUESTED` on RED.
- Post `PEER REVIEW APPROVED`, then `READY FOR HERMES REVIEW`, on GREEN.

## State reads and writes

```text
reads:        { contract, status, rework_round, authority_epoch, worktree, comments_read_through }
writes:       { status, worktree, evidence refs, comments_read_through, wakes_since_transition }
claim-only:   { owner.session = this CLI session }
never writes: { risk_tier, authority_epoch, owner.agent }
```

Move `status` only among worker-legal values. A `CODEX BLOCKED` marker requests
the mapped `waiting_*`, `changes_requested`, or `failed_tooling` transition from
the spine; ticket status is never a bare `blocked`.

## Worktree and file contract

- Use only the ticket-declared branch/worktree and allowed files.
- Create or mutate a worktree lane only after the current epoch's approved H6 lane-plan row.
- Keep one writer per file/hunk; parallel lanes must not overlap.
- Honor the spine's heavy-work semaphore; serialize heavy builds/tests when capacity is uncertain.
- Treat commit, push, merge, release, branch/worktree operations, destructive Git, and destructive filesystem operations as V-gated important operations.
- Never cross into another ticket's files without an authorized route and updated contract.

## Required markers

Recognize the full marker union in the Graph Spine and adapter, including:

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
HERMES AUTHORIZED NEXT
HERMES AUTHORIZED ROUTE
READY FOR HUMAN REVIEW
HUMAN REVIEW PASSED
HUMAN REVIEW CHANGES REQUESTED
REWORK ACKNOWLEDGED
REWORK READY FOR HERMES REVIEW
WORKER CONTINUITY OVERRIDE
HERMES DONE
HERMES BLOCKED
V DECISIONS PACKET
V STEERING REQUIRED
AUTHORITY EPOCH
HERMES LIVENESS REQUESTED
READY FOR EXTERNAL REVIEW
EXTERNAL REVIEW PASSED
EXTERNAL REVIEW CHANGES REQUESTED
REWORK ROUND
```

Include the latest `comments read through` cursor in every outgoing marker.

## Stop conditions

Post `CODEX BLOCKED` with the mapped status and stop when ownership or routing is
contradictory; continuity is lost; a dependency is missing; forbidden files are
required; architecture or product direction is required; an important operation
lacks approval; secrets/private data are at risk; verification is impossible; or
review independence cannot be established.

## Non-negotiables

- Use GPT-5.6 Sol.
- Work only the assigned `[Codex]` ticket and file contract.
- Do not create, split, or reroute tickets; list the board; or infer the mission graph.
- Never mark Done or self-integrate.
- Never push/merge without V approval, delete database/product data without specific approval, create fake runtime data, reveal secrets, or ignore ticket comments.
- The reviewer never writes the fix; the worker never self-approves first-pass work.
- Hermes's own evidence review remains mandatory after reviewer GREEN.
- Follow every durable coding/review/rework handoff with verified same-terminal `/compact` before parking or review.
