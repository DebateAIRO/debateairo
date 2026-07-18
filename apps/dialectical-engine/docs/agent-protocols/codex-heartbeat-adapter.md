# Codex Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## Codex role

Codex GPT-5.6 Sol is the sole implementation worker under the current Heartbeat law. Hermes launches one managed Codex CLI PTY per implementation ticket. Codex may coordinate non-overlapping subagents/workstreams, but the assigned ticket worker owns the handoff and rework continuity.

Codex does not create/split tickets, mark Done, or perform the independent review of its own first-pass work.

## Startup and comment checklist

Before branch creation, subagents, edits, tests, or handoff:

1. Read `AGENTS.md`.
2. Read `docs/agent-protocols/debateai-heartbeat-protocol.md`.
3. Read this adapter and `.codex/skills/heartbeat-protocol/SKILL.md` when available.
4. List Kanban for the active tenant.
5. Continue a `[Codex]` ticket already `running` in this CLI session before claiming new work.
6. For a `ready` ticket, read the full body and **all comments** before deciding whether it is first-pass work or returned rework.
7. Record `comments read through: <latest id/timestamp>`.
8. Confirm `Assigned agent: Codex`, original/rework owner, branch/worktree, dependencies, previous ticket, allowed/forbidden files, verification, and human-review requirement.
9. If the ticket was returned by `HERMES CHANGES REQUESTED` or `HUMAN REVIEW CHANGES REQUESTED`, verify this is the original worker/session. Do not let another Codex instance steal the rework.
10. Post `WORKER CLAIM` before edits.

Repeat the comment scan on every heartbeat/wakeup, after every status change, before review requests, and before rework handoff. Ticket status alone is never sufficient routing information.

## First-pass implementation flow

```text
[Codex] ready
→ same assigned Codex worker/session claims
→ mandatory RED → GREEN → REFACTOR
→ focused verification
→ READY FOR PEER REVIEW
→ stop editing and await independent reviewer comments
```

The first-pass worker must **not** post `READY FOR HERMES REVIEW`. A different
read-only reviewer does that after a GREEN verdict. Hermes then performs its
own non-delegable review of the comments, diff, tests, and product evidence;
reviewer GREEN never substitutes for Hermes.

`READY FOR PEER REVIEW` must include:

- worker CLI session ID;
- ticket, branch/worktree, and commit if any;
- files changed;
- RED/GREEN evidence;
- exact checks/output;
- allowed-file evidence;
- risks;
- latest comment cursor.

If the peer reviewer posts `PEER REVIEW CHANGES REQUESTED`, the same Codex worker/session addresses the findings and requests peer re-review. The reviewer never writes the fix.

## Post-dialogue checkpoint compaction

After any bounded Codex coding, review, or correction sequence reaches a
durable handoff—and after substantive Hermes↔Codex ping-pong—Codex leaves the
interactive prompt open. Hermes then sends exactly this inside the same PTY:

```text
/compact
```

Before compaction, the artifact/diff, checks, accepted decisions, unresolved
findings, ticket comments, and next gate must be durable and no command may be
in flight. The installed Codex 0.144.0 menu does not document preservation arguments,
so do not pass `/compact ...` arguments unless that version changes.

Hermes waits for the compaction response and prompt return, then records
`CODEX COMPACTION CHECKPOINT` with session, completed sequence, durable-state
paths, command, evidence, post-compact state, and comment cursor.

```text
READY FOR PEER REVIEW → compact worker PTY → peer review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

If new substantive dialogue follows a checkpoint, compact again at the next
stable handoff. Never exit merely because the conversation became chatty.

## Hermes/human rework loop

When Hermes or V returns the ticket to `ready` with comments:

1. Resume the same original Codex CLI session when available.
2. Read every comment after the previous handoff.
3. Locate the latest `HERMES CHANGES REQUESTED` or `HUMAN REVIEW CHANGES REQUESTED` comment and any superseding comment.
4. Post `REWORK ACKNOWLEDGED`, naming the triggering comment and findings.
5. Reproduce the reported defect RED where applicable.
6. Implement the smallest GREEN correction and refactor only under green.
7. Run the required focused checks.
8. Post `REWORK READY FOR HERMES REVIEW` directly to Hermes, addressing each finding one by one.
9. Do not run peer re-review unless Hermes's return comment says `peer re-review required: yes`.

Hermes may then route human review or return the ticket to `ready` again with a newer actionable comment. Repeat in the same Codex session.

If the original CLI session cannot be resumed, stop with `CODEX BLOCKED` using blocker type `session_continuity`. A replacement requires a Hermes `WORKER CONTINUITY OVERRIDE` comment.

## Reviewer mode

Codex may be launched in a separate read-only reviewer PTY only when Hermes explicitly assigns review. In reviewer mode:

- read the full ticket and all comments;
- verify worker/session identity and `READY FOR PEER REVIEW` evidence;
- inspect the diff and independently run justified checks;
- do not edit files;
- post `PEER REVIEW CHANGES REQUESTED` on RED;
- post `PEER REVIEW APPROVED` followed by `READY FOR HERMES REVIEW` on GREEN;
- never review work authored by the same CLI session.

Prefer a different model family for genuine independence when Hermes can route one.

## Comment markers Codex must recognize

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

Latest applicable Hermes/human comments override older routing. Do not skip earlier unresolved findings unless a newer comment explicitly supersedes them.

## Worktree and parallelism

- Use the branch/worktree declared by the ticket.
- One writer per file/hunk.
- Parallel Codex ticket PTYs require non-overlapping file contracts.
- Serialize heavy builds/tests on V's current laptop when in doubt.
- Never cross into another ticket's files without Hermes routing.
- A returned ticket remains with its original Codex worker; idle workers do not absorb it.

## Live-output rule

When Hermes declares `LIVE MONITORING ACTIVE`, update the named channel or `.hermes/live/` fallback at startup, milestones, before/after long commands, blockers, review request, and rework handoff.

Live output never replaces Kanban comments.

## Stop conditions

Post `CODEX BLOCKED` and stop when:

- ownership or comment routing is contradictory;
- original rework session is unavailable without continuity override;
- a dependency is missing;
- forbidden files are required;
- architecture/product direction is required;
- destructive data action lacks V approval;
- secrets/private data are at risk;
- verification is impossible;
- review independence cannot be established.

## Non-negotiables

- Model: GPT-5.6 Sol.
- Codex is the only coding worker under the current law.
- Read ticket comments at every boundary.
- First-pass worker stops at `READY FOR PEER REVIEW`.
- Every durable coding/review/rework handoff is followed by verified `/compact`
  in that same Codex PTY before parking or review.
- Reviewer sends first-pass work to Hermes.
- Rework stays with the same worker/session and returns directly to Hermes unless re-review is requested.
- Codex never marks Done, pushes without V approval, deletes database/product data without specific approval, or creates fake runtime data.
