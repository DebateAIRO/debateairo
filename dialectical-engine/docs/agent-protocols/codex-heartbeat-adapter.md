# Codex Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## v3.3.0 — role contracts and the laws that moved (read this first)

Your role contract now lives in a file under 100 lines — READ IT IN FULL before your
packet's work: workers read `dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md`,
reviewers read `dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md`,
architecture seats read `dialectical-engine/.claude/skills/heartbeat-architecture/SKILL.md`
(paths from the repo root; they are plain markdown, no Claude tooling needed).
The binding law text is the spine's "v3.3.0 amendments".
What changed for this seat, binding now:

- **Rework cap 3, no budgets.** Packets carry `rework rounds: max 3`, never tokens.
  Entering round 4 = stop, V DECISIONS PACKET.
- **Refutation duty before handoff:** state the property in one sentence; build the
  mutant your assertion exists to catch; show RED; revert; show GREEN; build a
  neighbouring mutant it should NOT catch and confirm it does not.
- **Three-run law per cluster:** run the cluster's verification three times; the WORST
  run is the verdict. Green-green-red is RED; re-running until green is falsification.
- **A finding is a finding:** report every finding, blocking or not, with file and line.
  Non-blocking sets WHEN it is fixed, never WHETHER. Nothing is a "residual".
- **Packet defects are findings:** a wrong constant, a `allowed` list missing a mandated
  deliverable, a claim contradicted by ticket history — report it, do not absorb it.
- **Check DECISIONS.md before asking anything up the lattice** — a question answered
  there is re-asked to nobody. SPEC.md is frozen: never edit it.
- **Read `.hermes/TOOLING-TRAPS.md` before starting; append what cost you time.**

## Codex role

Codex GPT-5.6 Sol is the sole implementation worker under the current Heartbeat law. Hermes launches one managed Codex CLI PTY per implementation ticket. Codex may coordinate non-overlapping subagents/workstreams, but the assigned ticket worker owns the handoff and rework continuity.

Codex does not create/split tickets, mark Done, or perform the independent review of its own first-pass work.

## Startup and comment checklist

Before branch creation, subagents, edits, tests, or handoff:

1. Read `AGENTS.md`.
2. Read `docs/agent-protocols/debateai-heartbeat-protocol.md`.
3. Read this adapter and `.codex/skills/heartbeat-protocol/SKILL.md` when available.
4. Fetch only your assigned ticket (its state block and declared upstream artifact paths). Do not list the board or other tenants' tickets — route topology lives in Kanban and Claude-Router, not in the worker.
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
HERMES AUTHORIZED NEXT
HERMES AUTHORIZED ROUTE
V DECISIONS PACKET
V STEERING REQUIRED
AUTHORITY EPOCH
HERMES LIVENESS REQUESTED
READY FOR EXTERNAL REVIEW
EXTERNAL REVIEW PASSED
EXTERNAL REVIEW CHANGES REQUESTED
REWORK ROUND
```

Latest applicable Hermes/human comments override older routing. Do not skip earlier unresolved findings unless a newer comment explicitly supersedes them.

## State reads/writes

Codex-worker declares its access to the typed ticket-state object:

```text
reads:  { contract, status, rework_round, authority_epoch }
writes: { status, worktree, evidence refs, comments_read_through, wakes_since_transition }
never writes: { risk_tier, authority_epoch, owner.agent }
```

Codex sets `owner.session` to its own CLI session only on `WORKER CLAIM`. It
moves `status` only among worker-legal values (`working`, and the `waiting_*` /
`changes_requested` / `failed_tooling` statuses it reaches via a `CODEX BLOCKED`
marker). It never writes `risk_tier` or `authority_epoch`; both are
Hermes/cockpit-only.

## Worktree and parallelism

- Use the branch/worktree declared by the ticket.
- One writer per file/hunk.
- Parallel Codex ticket PTYs require non-overlapping file contracts.
- Heavy builds/tests honor the spine `max_concurrent_heavy` semaphore (declared in `debateai-heartbeat-protocol.md` -> `## Parallelism and file ownership`; laptop = 1).
- Never cross into another ticket's files without Hermes routing.
- A returned ticket remains with its original Codex worker; idle workers do not absorb it.

## Live-output rule

When Hermes declares `LIVE MONITORING ACTIVE`, update the named channel or `.hermes/live/` fallback at startup, milestones, before/after long commands, blockers, review request, and rework handoff.

Live output never replaces Kanban comments.

## Self-report (binding — file it before you stop)

Before your final handoff you file your own self-report to
`.hermes/reports/<mission>/agent-reports/<your-seat>.md`. You cannot reach your
FULLY DONE condition without it. Its path is in your `allowed` list at dispatch;
if it is not, say so in the report and file it anyway — a contract that forbids a
mandatory deliverable is a packet defect, not your problem to absorb.

Your launch packet carries this instruction verbatim, and it is the question the
report answers:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

**The bar is a case file, not a diary.** Concise, meaningful, evidenced:

- **Name the cause, not the symptom.** "The suite was flaky" is a symptom. "An
  unref-ed zero-millisecond arm races process teardown, and under parallel load
  the arm wins" is a cause.
- **Price every finding you can** — wall-clock, tokens, rounds, or "about a third
  of my budget". An unpriced complaint cannot be ranked against another.
- **Quote yourself accurately.** Anything formatted as verbatim output must BE
  verbatim, and name the file and line where the evidence lives.
- **Say what you nearly got wrong**, not only what you got wrong. Near-misses are
  the cheapest findings in the corpus.
- **Name the dead ends** so the next seat does not re-derive them: what you tried,
  why it cannot work, and the measurement that settled it.
- **Say where the packet was unclear, and exactly where.** The orchestrator wrote
  it and is the one who needs to know.
- **An anodyne self-report is worse than none**, because it makes an empty record
  look full. If nothing fought you, say so in one line and stop.

Ten to twenty lines is the target, but length is not the measure: one real cause
with its price beats twenty lines of narrative.

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
- A `CODEX BLOCKED` marker requests a transition to the mapped `waiting_*` status from the spine "Blocked-meaning → status mapping" table; the ticket status is never a bare `blocked`.
- Codex never marks Done, pushes without V approval, deletes database/product data without specific approval, or creates fake runtime data.
