# Codex Heartbeat Adapter

Read this after `docs/agent-protocols/debateai-heartbeat-protocol.md`.

## Codex role

Codex GPT-5.6 Sol is the sole implementation worker under the current Heartbeat law. Claude-Router launches the Codex ticket/lane orchestrator with `/goal`; Hermes remains the independent verifier and Done authority. Codex may coordinate non-overlapping subagents/workstreams, but the assigned ticket worker owns the handoff and rework continuity.

Codex does not create/split tickets, mark Done, or perform the independent review of its own first-pass work.

## /goal chain and worker lifetime

- Claude-Router must launch or resume the top-level Codex coordinator through
  `/goal <bounded packet>`. If Claude directly invokes Codex without `/goal`,
  Codex posts a process `CODEX BLOCKED` to the orchestrator channel, requests a
  corrected `/goal`, and does not dispatch agents or edit files. V is never the
  routine relay.
- Every Codex-dispatched lane orchestrator, coding worker, reviewer, or helper
  starts with its own `/goal <ticket-scoped packet>`. A child launch does not
  grant route, board, scope, or verdict authority.
- Record launcher, parent goal/session, child goal/session, transport,
  resumability, packet ID, acknowledgement, and the goal-specific `FULLY DONE`
  condition in `WORKER CLAIM` and the durable lane registry.
- A candidate-complete packet, review handoff, Blocked/stalled state, lease
  expiry, compaction, silence, or ordinary turn end is not goal completion.
  Stop editing at a review boundary, but keep the exact worker alive, parked,
  addressable, and resumable through all requested review/rework rounds.
- An implementation worker is `FULLY DONE` only after a fresh `HERMES DONE`,
  no unresolved peer/Hermes/human changes request or pending review gate,
  durable final receipts, and its `FINAL AGENT SELF-REPORT`. Only then may the
  orchestrator terminate that goal/session.

## Hermes Kanban cockpit and visible UI

Hermes-Verifier owns and runs the canonical Kanban. Its visual projection is
available on the harness machine at:

```text
http://127.0.0.1:9119/kanban
```

Every Codex launch packet must carry the exact `mission`, authoritative
`board` slug, `ticket`, `tenant`, and this `kanban_ui` URL. Use the UI to make
the work and dependency graph visible, but do not treat it as permission to
list unrelated tickets, reroute work, mutate review state, or infer authority
from a card's column alone. The assigned ticket body, complete comment chain,
and latest applicable Hermes/human ruling remain binding. Do not guess a board
or fall back silently to `default`; report missing/mismatched coordinates as a
routing-metadata blocker before editing. If port 9119 is unavailable, report
it to Claude-Router/Hermes rather than starting a second dashboard. Remote
viewing requires an approved authenticated tunnel or bind because
`127.0.0.1` is local to the harness machine.

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

## Lane preflight and two-phase completion

Before edits, write a durable `DURABLE LANE REGISTRY` entry and pass this gate:

```text
LANE PREFLIGHT RECEIPT:
- parent Claude /goal and parent goal/session:
- Codex coordinator goal/session:
- ticket, board, tenant, and project scope:
- lane and coding-worker goal/session:
- transport and resumability/compaction rule:
- executable/capability command and version:
- immutable packet ID/hash:
- worker packet acknowledgement read back:
- worktree path proven by git worktree list --porcelain:
- expected/actual branch and commit base:
- initial git status and classified pre-existing dirt:
- Hermes claim/comment round-trip receipt:
- claim owner/token/expiry and renewal budget:
- dependency/bootstrap health:
- absolute heavy-lock path, owner token, and resource plan:
- responsive UI matrix including 568x320 when applicable:
- verdict: PASS | FAIL
```

A launched process, successful stdin write, or plausible worktree is not packet
acknowledgement. Any missing field is FAIL; on FAIL do not edit, report candidate
completion, or request review.

The durable registry lives in board metadata/comments or approved
workspace-local harness state, never only in chat memory. It records the parent
and child goal/session chain, transport and compaction class, process/log identity,
packet acknowledgement, worktree/branch/base/commit, claim expiry, lock identity,
last heartbeat, current phase, and any continuity override.

Completion is two-phase:

```text
CANDIDATE COMPLETE:
- goal/session, worktree, branch, and commit:
- files changed and exact checks:
- scope and dirty-state confirmation:
- residual-risk IDs:
- worker self-review:

ORCHESTRATOR VERIFICATION RECEIPT:
- registry/session/worktree/branch match:
- expected commit exists:
- allowed-file and dirty-state verdict:
- independent test/evidence inspection:
- packet and Kanban receipts:
- lease ownership:
- resource-lock release:
- residual-risk dispositions:
- verdict: PASS | FAIL
```

Only after both packets pass may the protocol advance to its required peer or
Hermes review marker. Neither packet terminates the worker.

### Claim leases and resource locks

- Budget claim TTL from the longest serialized gate plus queue time and safety
  margin; never default blindly to 900 seconds.
- Record expiry and renew before the next operation exceeds remaining time.
  Verify ownership after every heavy gate and review transition.
- Claim loss stops mutations but does not terminate or replace the worker.
  Reclaim only the same card and continuity before resuming.
- Prefer the checked-in gate/semaphore wrapper. Every lock receipt records the
  absolute path, ticket/session owner, ownership token, acquisition time,
  command, preserved exit code, and release result.
- Only the matching lock owner may release it. Never force-remove a sibling's
  lock; ambiguous or stale ownership is a resource/process blocker.

### Responsive UI acceptance

For responsive/UI tickets, preflight must include explicit short-height rows,
including `568x320`, vertical-space arithmetic, collision-union and pointer
hit-test assertions, shared geometry-token ownership, and no cross-lane literal
coupling. Mark unavailable real-device rows `BLOCKED-ESCALATED`; never
approximate them. The integration gate reruns the matrix.

### Residual risk and self-report

Maintain a `RESIDUAL RISK REGISTER` with risk ID, discoverer/session, source
evidence, severity/likelihood, affected lanes/gates, owner, status, closure
condition, and promotion disposition. Post `RISK PROMOTION REQUIRED` to Hermes
when two independent agents report the same risk, a cross-lane constant/shared
geometry coupling appears, an acceptance row is threatened, or no owner/closure
condition exists. Codex does not create the follow-up ticket itself.

Before an implementation goal becomes `FULLY DONE`, collect:

```text
FINAL AGENT SELF-REPORT:
- ticket/role/goal/session:
- review rounds:
- what went well:
- what went badly:
- what should change:
- evidence references:
- continuity, lease, lock, or transport issues:
- scope violations caught or avoided:
- unresolved risk IDs:
```

Missing self-reports block mission archival and coordinator-goal completion, but
do not rewrite Hermes's product-ticket status.

## First-pass implementation flow

```text
[Codex] ready
→ same assigned Codex worker/session claims
→ mandatory RED → GREEN → REFACTOR
→ focused verification
→ READY FOR PEER REVIEW
→ stop editing, remain alive, and await independent reviewer comments
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

Prefer a different model family for genuine independence when Claude-Router can
route one and Hermes can verify it.

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
- Every direct and delegated launch uses `/goal`; a handoff is not goal
  completion.
- Unfinished workers remain alive and resumable through review/rework and are
  terminated only after their goal-specific `FULLY DONE` condition.
- Every durable coding/review/rework handoff is followed by verified `/compact`
  in that same Codex PTY before parking or review.
- Reviewer sends first-pass work to Hermes.
- Rework stays with the same worker/session and returns directly to Hermes unless re-review is requested.
- A `CODEX BLOCKED` marker requests a transition to the mapped `waiting_*` status from the spine "Blocked-meaning → status mapping" table; the ticket status is never a bare `blocked`.
- Codex never marks Done, pushes without V approval, deletes database/product data without specific approval, or creates fake runtime data.
