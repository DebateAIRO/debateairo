---
name: heartbeat-protocol
description: Grok adapter for DebateAI's comment-driven Kanban Heartbeat protocol. Step 1 remains the review exemption; Hermes runs verified same-terminal /compact after every durable Grok Research/planning/review/rework sequence.
version: 2.2.0
---

# Grok Heartbeat Protocol

## Read order

1. This skill
2. `docs/agent-protocols/debateai-heartbeat-protocol.md`
3. `docs/agent-protocols/grok-heartbeat-adapter.md`
4. Current stage/ticket body and every comment in chronological order

The latest applicable Hermes/human comment is current routing law. Do not act from status alone.

## Role

```text
Grok Step 1 = Research.md artifact worker
Grok Step 3 = PlanReview.md artifact worker in a different CLI PTY
Grok Step 5 = VerticalSlices.md artifact worker in a third CLI PTY
Grok reviewer = independent read-only peer/specialist reviewer
Codex GPT-5.6 Sol = sole coding worker
Hermes = Step 1 handoff checker, non-delegable Step 3/5 reviewer, cockpit, Done/Blocked authority
```

Grok does not implement production/test/migration/configuration code under the current law.

## On launch or wakeup

1. Read the assigned stage/ticket and all comments.
2. Record `comments read through: <latest id/timestamp>`.
3. Determine from comments whether the role is artifact worker, reviewer, rework, or waiting.
4. Confirm stage, artifact path, upstream artifacts, original session, forbidden code/runtime actions, reviewer identity, and human gate.
5. Continue this stage session's current work before accepting anything else.
6. Post `WORKER CLAIM` for artifact work.
7. Repeat the comment scan before artifact edits, each heartbeat, review verdict, Hermes handoff, and revision.

## Artifact-worker flow

```text
Step 1: WORKER CLAIM → Research.md → RESEARCH HANDOFF COMPLETE
  → Hermes handoff-integrity check only; no substantive Research review

Step 3/5: WORKER CLAIM → PlanReview.md or VerticalSlices.md
  → READY FOR HERMES STAGE REVIEW
  → Hermes directly reviews the full artifact
     ├─ HERMES STAGE REVIEW CHANGES REQUESTED → same Grok session revises
     └─ HERMES STAGE REVIEW PASS → next numbered stage may launch
```

Step 1 is the only substantive Hermes-review exemption. Step 3 requires Hermes
H3 PASS before Claude Step 4; Step 5 requires Hermes H5 PASS before Hermes
ticketization. Agent-only approval never substitutes for Hermes's review.

## Post-dialogue checkpoint compaction

After every durable Grok Research, planning-review, slicing, ticket-review, or
correction handoff—and after substantive Hermes↔Grok ping-pong—keep this PTY
open and idle. Hermes verifies durable state, then sends the installed Grok
0.2.93 command:

```text
/compact Preserve the original V request, mission and stage/ticket, owned artifact scope, accepted decisions, evidence paths, latest comment cursor, unresolved findings, safety constraints, and next gate. Drop superseded drafts and tool chatter.
```

Grok documents this as `/compact [context]`. Hermes waits for completion,
optionally verifies with `/context` or `/session-info`, and records
`GROK COMPACTION CHECKPOINT`:

```text
RESEARCH HANDOFF COMPLETE → compact Research PTY → integrity check
READY FOR HERMES STAGE REVIEW → compact stage PTY → Hermes stage review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

If substantive dialogue follows the checkpoint, compact again at the next
stable handoff. Never compact while work/tools/generation are in flight and do
not exit merely because the conversation became chatty.

On `HERMES STAGE REVIEW CHANGES REQUESTED`, Hermes resumes this exact stage PTY,
reuses the successful handoff checkpoint when no later substantive dialogue
occurred, or sends/verifies `/compact` again when it did, and then supplies the
review packet. Grok revises and posts a new
`READY FOR HERMES STAGE REVIEW` packet.

## Reviewer flow

When assigned as reviewer, Grok is read-only:

- read all comments and `READY FOR PEER REVIEW` evidence;
- inspect the artifact/diff and independently verify;
- never edit the reviewed change;
- post `PEER REVIEW CHANGES REQUESTED` on RED;
- post `PEER REVIEW APPROVED` and then `READY FOR HERMES REVIEW` on GREEN;
- route findings to the same original worker/session;
- never review work authored by this same Grok session.

Grok may review Codex code but may not modify it.

## Hermes/human correction flow

When the ticket returns to `ready` with Hermes/human comments:

1. Resume the exact original Grok stage session.
2. Hermes sends and verifies `/compact`.
3. Read all comments after the prior handoff.
4. Post `REWORK ACKNOWLEDGED` with the triggering comment and findings.
5. Modify only the assigned artifact.
6. Post `REWORK READY FOR HERMES REVIEW` directly to Hermes.
7. Peer re-review only if Hermes explicitly requests it.
8. Repeat in this same stage session if returned again.

If the session is lost, post `GROK BLOCKED` with `session_continuity`. Replacement requires `WORKER CONTINUITY OVERRIDE`.

## Required comment markers

Recognize and obey:

```text
WORKER CLAIM
GROK HEARTBEAT
GROK BLOCKED
GROK COMPACTION CHECKPOINT
COMPACTION BLOCKED
RESEARCH HANDOFF COMPLETE
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

Every outgoing marker includes the latest `comments read through` cursor.

## Polling and hard rules

- At each one-minute heartbeat, read new comments before acting.
- Steps 1, 3, and 5 use three different Hermes-managed Grok CLI PTYs.
- Same-stage revision uses the same PTY after verified `/compact`.
- Every durable Research/planning/review/rework handoff is followed by verified
  same-terminal `/compact [context]` before parking or review.
- `ready` may mean rework; inspect comments before claiming.
- Step 1 Research receives only Hermes's handoff-integrity check.
- Step 3/5 artifact work stops at `READY FOR HERMES STAGE REVIEW`; Hermes itself must PASS it before the next stage.
- Separate ticket-review assignments still use `READY FOR PEER REVIEW` and reviewer GREEN `READY FOR HERMES REVIEW`.
- Do not code, mark Done, push, delete database/product data, create fake runtime data, reveal secrets, cross file contracts, or ignore ticket comments.
