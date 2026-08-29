# Claude Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## v3.3.0 — role contracts and the laws that moved (read this first)

Your role contract now lives in its own short skill: workers load
`heartbeat-worker`, reviewers `heartbeat-reviewer`, architecture seats
`heartbeat-architecture` (spine "v3.3.0 amendments").
(If the Skill tool is unavailable, read the same contracts as files under
`dialectical-engine/.claude/skills/<name>/SKILL.md`.)
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
- **Skills-loaded gate (V ruling, 2026-08-29).** Your handoff OPENS with one line:
  `SKILLS LOADED: <every skill you actually loaded, comma-separated>`. No seat reaches FULLY
  DONE without it, exactly as with the self-report. A skill NAMED but not loaded is a
  fabrication finding; falling short of your role floor is a finding you should declare
  yourself rather than have found. The orchestrator verifies the line at seat exit by
  checking the skill BODY reached you — quoting a path proves nothing, because your packet
  quotes those paths and they echo back. Measured 2026-08-29: every seat did load its
  floor, but that was invisible without grepping transcripts, and sampling a seat mid-run
  produced a FALSE finding against a compliant seat. Declaring it costs one line and removes
  the guesswork in both directions.
- **Superpowers is mandatory and the whole library is open to every seat (V ruling,
  2026-08-28):** load `superpowers:using-superpowers`, then the ones the router's table
  names for your role as a MINIMUM — plus any other one that fits the task. Heartbeat wins on process where
  they overlap; Superpowers wins on craft.


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

A `ready` status may mean returned rework, not a new assignment. Comments determine which.

## State reads/writes

Claude (planning-artifact worker or peer reviewer) declares its access to the
typed ticket-state object:

```text
reads:  { contract, status, rework_round, authority_epoch, risk_tier }
writes: { status, evidence refs (artifact paths), comments_read_through }
never writes: { risk_tier, authority_epoch, worktree, owner.agent }
```

Claude sets `owner.session` to its own CLI session only on `WORKER CLAIM`. As a
reviewer it records verdicts through comment markers, not by writing `risk_tier`.
It never writes `risk_tier`, `authority_epoch`, or `worktree`; all three are
Hermes/cockpit-only.

## Worktree and parallelism

Claude does not create, merge, or delete git worktrees: under the current law only Codex writes code, and worktree lifecycle belongs to Codex lanes plus Claude-Router integration. Claude's role around worktrees is read-only.

- When reviewing a Codex lane, read inside the lane's declared `worktree.path`; never edit files there and never run `git worktree add/remove` or any merge/rebase/branch operation.
- Record the exact `worktree.path`, branch, and commit SHA you reviewed in the review verdict so Claude-Router can match your evidence to the right lane.
- Separate the committed range you reviewed from any uncommitted worktree state. A dirty RED test may be legitimate active TDD for a running lane; it is not a green tree and must be called out explicitly, never certified.
- Do not consume the heavy slot: read-only checks may overlap other lanes only when they honor the spine `max_concurrent_heavy` semaphore (declared in `debateai-heartbeat-protocol.md` -> `## Parallelism and file ownership`; laptop = 1).
- For planning/artifact work, stay in your assigned stage workdir; never open a Codex implementation lane's worktree to edit.

## Polling and live output

At launch and each one-minute heartbeat boundary:

- inspect assigned/running/ready stage tickets;
- read new comments before acting;
- continue the existing stage session before claiming another stage;
- update the Hermes-declared live channel or `.hermes/live/` fallback;
- stop polling only when Hermes closes/parks the stage chain or a V-level blocker exists.

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
- A `CLAUDE BLOCKED` marker requests a transition to the mapped `waiting_*` status from the spine "Blocked-meaning → status mapping" table; the ticket status is never a bare `blocked`.
- Claude never marks Done, pushes without V approval, deletes database/product data, creates fake runtime data, or crosses file contracts.
