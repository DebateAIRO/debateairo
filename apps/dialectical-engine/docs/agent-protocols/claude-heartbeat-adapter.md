# Claude Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## Claude role

Under the current Heartbeat law, Claude owns planning/reconciliation stages and may serve as an independent read-only reviewer:

- Step 2: `Plan.md` in a fresh Hermes-managed Claude CLI PTY;
- Step 4: `FinalPlan.md` in a different fresh Claude CLI PTY;
- peer/specialist review when Hermes explicitly assigns it.

Claude does not implement production code, test code, migrations, or implementation configuration while Codex-only coding is active.

## Startup and comment checklist

Before artifact work or review:

1. Read `docs/agent-protocols/debateai-heartbeat-protocol.md`.
2. Read this adapter and `.claude/skills/heartbeat-protocol/SKILL.md`.
3. Read the assigned stage/ticket body and **all comments** in chronological order.
4. Record `comments read through: <latest id/timestamp>`.
5. Confirm stage, assigned role (`artifact_worker` or `peer_reviewer`), artifact path, upstream artifacts, forbidden code/runtime actions, reviewer identity, and human-review requirement.
6. Confirm the Claude CLI session ID belongs to this exact stage/ticket.
7. Post `WORKER CLAIM` for artifact work or a reviewer heartbeat for review work.

Repeat the comment scan on every heartbeat/wakeup, after status changes, before editing the artifact, before a review verdict, before Hermes handoff, and before revision continuation.

## Planning-artifact worker flow

```text
assigned Claude stage/ticket
→ same Claude stage terminal reads artifacts + all comments
→ authors only Plan.md or FinalPlan.md
→ READY FOR HERMES STAGE REVIEW
→ Hermes directly reviews the complete artifact
   ├─ HERMES STAGE REVIEW CHANGES REQUESTED → same Claude session revises
   └─ HERMES STAGE REVIEW PASS → Hermes launches the next numbered stage
```

Claude stage artifacts do not bypass Hermes through an agent-only approval.
Step 2 must receive Hermes H2 PASS before Grok Step 3, and Step 4 must receive
Hermes H4 PASS before Grok Step 5.

## Post-dialogue checkpoint compaction

After Claude completes a durable planning, review, or correction handoff—and
after substantive Hermes↔Claude ping-pong—Claude keeps the same PTY open.
Hermes verifies the artifact/comment/log is durable and the prompt is idle,
then sends inside that same PTY:

```text
/compact Preserve the original V request, mission and stage/ticket, owned artifact scope, accepted decisions, evidence paths, latest comment cursor, unresolved findings, safety constraints, and next gate. Drop superseded drafts and tool chatter.
```

Hermes verifies Claude's compaction success signal and records
`CLAUDE COMPACTION CHECKPOINT` with session, completed sequence, durable-state
paths, command, evidence, post-compact state, and comment cursor.

```text
READY FOR HERMES STAGE REVIEW → compact stage PTY → Hermes stage review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

If substantive dialogue follows a checkpoint, compact again at the next
stable handoff. Never compact while Claude is generating, editing, testing, or
running a tool, and never exit merely because the conversation became chatty.

If Hermes posts `HERMES STAGE REVIEW CHANGES REQUESTED`:

1. Hermes resumes the same Claude stage terminal/session.
2. If substantive dialogue occurred after the last successful checkpoint,
   Hermes sends and verifies `/compact` again; otherwise the handoff checkpoint
   already satisfies pre-revision compaction.
3. Claude verifies compaction completed before accepting revision instructions.
4. Claude reads the latest ticket comments again.
5. Claude revises the same artifact and posts a new `READY FOR HERMES STAGE REVIEW` packet.

Do not spawn a replacement Claude terminal for the same stage revision.

## Peer reviewer flow

When launched as reviewer, Claude must:

1. remain read-only except for its assigned review artifact/comment;
2. read the entire ticket body and all comments;
3. verify worker/session identity and `READY FOR PEER REVIEW` evidence;
4. inspect the relevant artifact/diff and independently run justified read-only checks;
5. post `PEER REVIEW CHANGES REQUESTED` on RED, routing findings to the same original worker/session;
6. post `PEER REVIEW APPROVED`, then `READY FOR HERMES REVIEW`, on GREEN;
7. never write the fix or certify work from the same Claude session.

For Codex implementation tickets, Claude may review code but may not edit it.

## Hermes/human rework loop

When Hermes or V returns a Claude-owned planning/review artifact ticket to `ready`:

1. Resume the original Claude stage session.
2. Send and verify `/compact` before continued work.
3. Read all comments since the previous handoff.
4. Post `REWORK ACKNOWLEDGED` naming the triggering comment/findings.
5. Modify only the assigned artifact.
6. Post `REWORK READY FOR HERMES REVIEW` directly to Hermes, addressing every finding.
7. Use peer re-review only if Hermes explicitly requests it.

If the original session cannot be resumed, post `CLAUDE BLOCKED` with `session_continuity`. Hermes must issue `WORKER CONTINUITY OVERRIDE` before replacement.

## Comment markers Claude must recognize

```text
WORKER CLAIM
CLAUDE HEARTBEAT
CLAUDE BLOCKED
CLAUDE COMPACTION CHECKPOINT
COMPACTION BLOCKED
READY FOR PEER REVIEW
PEER REVIEW CHANGES REQUESTED
PEER REVIEW APPROVED
READY FOR HERMES REVIEW
READY FOR HERMES STAGE REVIEW
HERMES STAGE REVIEW PASS
HERMES STAGE REVIEW CHANGES REQUESTED
HERMES CHANGES REQUESTED
READY FOR HUMAN REVIEW
HUMAN REVIEW PASSED
HUMAN REVIEW CHANGES REQUESTED
REWORK ACKNOWLEDGED
REWORK READY FOR HERMES REVIEW
WORKER CONTINUITY OVERRIDE
```

A `ready` status may mean returned rework, not a new assignment. Comments determine which.

## Polling and live output

At launch and each one-minute heartbeat boundary:

- inspect assigned/running/ready stage tickets;
- read new comments before acting;
- continue the existing stage session before claiming another stage;
- update the Hermes-declared live channel or `.hermes/live/` fallback;
- stop polling only when Hermes closes/parks the stage chain or a V-level blocker exists.

## Stop conditions

Post `CLAUDE BLOCKED` and stop when:

- stage/ticket role or comment routing is contradictory;
- the original revision session is lost without continuity override;
- required upstream artifacts are missing;
- code edits would be required;
- forbidden files/runtime/database actions appear necessary;
- reviewer independence cannot be established;
- architecture/product/destructive-action direction is required;
- verification cannot be performed.

## Non-negotiables

- Read all ticket comments at every boundary.
- Step 2 and Step 4 use different Claude CLI PTYs.
- Revisions stay in the original stage PTY after verified `/compact`.
- Every durable planning/review/rework handoff is followed by verified
  same-terminal `/compact` before parking or review.
- Numbered-stage artifact workers stop at `READY FOR HERMES STAGE REVIEW`.
- Hermes itself reviews Step 2 and Step 4 artifacts before the next stage; delegated approval cannot replace this gate.
- When Claude is assigned as a separate ticket peer reviewer, reviewer GREEN uses `READY FOR HERMES REVIEW`.
- Claude never implements code while Codex-only coding is active.
- Claude never marks Done, pushes without V approval, deletes database/product data, creates fake runtime data, or crosses file contracts.
