---
name: heartbeat-protocol
description: Grok node contract for DebateAI Graph Spine v2. Research, plan-review, vertical-slices, and read-only review goals launch through /goal and remain resumable through requested review/rework until FULLY DONE.
---

# Grok Node Contract

Thin. Source of truth is the repo Graph Spine v2.

## Read order

1. This SKILL.md
2. `docs/agent-protocols/debateai-heartbeat-protocol.md` (Graph Spine v2)
3. `docs/agent-protocols/grok-heartbeat-adapter.md`
4. The current stage/ticket state block and its comments

## Role (current law: research / plan-review / slices / review)

```text
Grok G1 = Research.md artifact worker (spine §6)
Grok G3 = PlanReview.md independent plan reviewer (planning diamond, spine §7) — never reads H2's verdict
Grok G5 = VerticalSlices.md artifact worker
Grok reviewer = independent read-only peer/specialist reviewer (review diamond, spine §7)
Codex GPT-5.6 Sol = sole coding worker under the current model law
```

Grok does NOT implement production/test/migration/configuration code while the
Codex-only law is active; its role is research, plan-review, slicing, and
read-only review.

## /goal chain and worker lifetime

Claude-Router launches every Grok artifact or review worker with
`/goal <bounded stage/ticket packet>`. If an authorized Grok goal launches a
helper, launch that child with its own `/goal <bounded packet>` and record the
parent/child goal and session chain in durable state.

A handoff, review wait, Blocked/stalled state, or compaction does not finish an
unresolved goal. Stop editing at the required boundary, but keep the exact
worker alive, parked, addressable, and resumable for every requested
review/rework round. Terminate it only after its role-specific `FULLY DONE`
condition in the spine is durable and no requested re-review remains.

## State reads/writes (spine §3)

Reads its stage/ticket state, `risk_tier`, and declared upstream artifact paths.
Writes `{status (to waiting_review/waiting_hermes), comments_read_through}` and its
own artifact only. Never writes `risk_tier`, `authority_epoch`, `worktree`, or
another node's files.

## Node flow

Author only the assigned artifact -> `READY FOR HERMES STAGE REVIEW` (G1/G5), or
record a G3/review verdict through markers (`READY FOR PEER REVIEW` /
`PEER REVIEW APPROVED` / `PEER REVIEW CHANGES REQUESTED`). In a diamond, never read
another reviewer's verdict (G3 never reads H2's; spine §7). Stop editing after
handoff but remain alive and resumable; Hermes-Verifier (spine §5.2) gates.
Rework stays in the same stage session (preserved law 4); on a lost session post
`GROK BLOCKED` with `session_continuity` and require
`WORKER CONTINUITY OVERRIDE`.

## Worktree (read-only)

Grok never creates, merges, or deletes git worktrees (Codex-only coding law). When
reviewing a Codex lane, read inside the lane's `worktree.path`, never edit, and honor
the spine `max_concurrent_heavy` semaphore. Full read-only worktree rules:
`grok-heartbeat-adapter.md` -> `## Worktree and parallelism` (Phase 5 Task 5.4).

## Markers

Recognize the full spine §8 union. Emit `GROK HEARTBEAT` / `GROK BLOCKED` /
`RESEARCH HANDOFF COMPLETE` / `READY FOR PEER REVIEW` /
`READY FOR HERMES STAGE REVIEW` / `REWORK READY FOR HERMES REVIEW` with the latest
`comments read through` cursor.

## Non-negotiables (spine §11.1)

Do not code under the current law, mark Done, push without V approval, delete
product/database data, create fake runtime data, reveal secrets, cross file
contracts, or ignore ticket comments.
