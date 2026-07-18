# DebateAI Shared Heartbeat Protocol

This is the agent-neutral protocol spine for DebateAI multi-agent work. Hermes, Codex, Claude, and Grok read this before their own adapter.

## Operating model

```text
V → Hermes cockpit
Hermes → tickets, dependencies, comments, review routing, human-review packets, Done/Blocked
Codex → sole coding worker while the current model law is active
Claude/Grok → planning-artifact workers and independent read-only reviewers
Kanban → durable shared state
```

V should only be interrupted for real product, architecture, security, destructive-action, scope, or human acceptance decisions. Routine routing and review communication belong in ticket comments.

## Binding stage and coding law

```text
H0 Hermes intake
G1 Grok Research.md        — fresh Hermes-managed Grok CLI PTY
C2 Claude Plan.md          — fresh Hermes-managed Claude CLI PTY
G3 Grok PlanReview.md      — different fresh Grok CLI PTY
C4 Claude FinalPlan.md     — different fresh Claude CLI PTY
G5 Grok VerticalSlices.md  — third fresh Grok CLI PTY
H6 Hermes Kanban routing
Implementation             — Codex GPT-5.6 Sol only, fresh CLI PTY per ticket
```

A revision stays with the original stage/ticket worker and resumable CLI session. For Claude/Grok stage revisions, Hermes sends `/compact`, verifies completion, then supplies the review comments. Do not silently substitute agents.

## Binding post-dialogue checkpoint compaction

After every durable planning, coding, review, or correction sequence—and after
any substantive Hermes↔agent ping-pong—Hermes runs the CLI compaction command
inside that same interactive PTY before parking it or proceeding with review:

```text
Claude Code 2.1.205: /compact <preservation focus>
Grok Build 0.2.93:   /compact <preservation context>
Codex CLI 0.144.0:   /compact
```

The current Grok installation uses `/compact [context]`; re-check after CLI
upgrades. Codex's installed menu documents `/compact` without arguments, so
all durable state must be externalized before running it.

Before compaction, save the artifact/diff, complete or record checks, post the
handoff/comment, write accepted decisions and unresolved findings to durable
state, and wait for the prompt to become idle. Never compact while an edit,
tool call, model response, or test is still in flight.

Sequence placement:

```text
numbered stage handoff → compact same stage PTY → Hermes stage gate
READY FOR PEER REVIEW → compact same Codex worker PTY → peer review
reviewer verdict/READY FOR HERMES REVIEW → compact reviewer PTY → Hermes review
REWORK READY FOR HERMES REVIEW → compact same worker PTY → Hermes review
```

Record `CLAUDE COMPACTION CHECKPOINT`, `GROK COMPACTION CHECKPOINT`, or
`CODEX COMPACTION CHECKPOINT` with the session, completed sequence, durable
state paths, command, success evidence, post-compact state, and comment cursor.
If substantive dialogue occurs after a checkpoint, compact again at the next
stable handoff. A checkpoint after the final substantive turn satisfies the
pre-revision compaction requirement; do not run empty duplicates.

## Binding Hermes numbered-stage review gates

Hermes itself reviews every completed numbered planning artifact after Step 1.
An agent or specialist review may add evidence but cannot replace the Hermes
gate.

```text
G1 Research.md
  → Hermes handoff-integrity check only; no substantive Research review
Step 2 / C2 Plan.md
  → HERMES STAGE REVIEW PASS required before G3
Step 3 / G3 PlanReview.md
  → HERMES STAGE REVIEW PASS required before C4
Step 4 / C4 FinalPlan.md
  → HERMES STAGE REVIEW PASS required before G5
Step 5 / G5 VerticalSlices.md
  → HERMES STAGE REVIEW PASS required before H6
Step 6 / H6 Kanban ticketization
  → HERMES STEP 6 SELF-AUDIT PASS required before any Codex launch
```

For Steps 2–5, the stage owner posts `READY FOR HERMES STAGE REVIEW`.
Hermes reads the original request, complete artifact, approved upstream
artifacts, cited material evidence, and applicable comments. Hermes records
either `HERMES STAGE REVIEW PASS` or
`HERMES STAGE REVIEW CHANGES REQUESTED`. The next stage remains blocked on
CHANGES REQUESTED; the original stage session revises after verified
`/compact` and returns a new review packet.

Step 1's exemption is narrow: Hermes still verifies that `Research.md` exists,
is readable, names its evidence, records its Grok session/path, and exposes no
safety/destructive-data decision. Later stages may return a discovered
research gap to the original Step 1 Grok session.

The H6 self-audit verifies slice-to-ticket coverage, dependencies, Codex-only
implementation ownership, file contracts, comment/rework rules, review/human
gates, a deliberately small Ready queue, and the prohibition on database
deletion without V's specific approval.

## Roles

- **V / Human reviewer:** product and acceptance authority.
- **Hermes:** cockpit broker, status/comment router, evidence gate, human-review coordinator, and sole Done/Blocked authority.
- **Worker:** assigned ticket owner. Codex is the only coding worker under the current law; Claude/Grok may own planning or review artifacts.
- **Peer reviewer:** different agent/session from the worker; reads evidence and comments, never writes the fix.
- **Kanban:** durable source of ticket scope, comments, review state, and routing decisions.

## Ticket ownership and continuity

Hermes must establish before launch:

```text
Assigned agent: <Codex|Claude|Grok>
Original worker session: <CLI session id when known>
Rework owner: same as Assigned agent / Original worker session
Lane starter: yes|no
Previous ticket: <id — title>|none
Allowed to edit:
Forbidden:
Verification:
Human review required: yes|no
```

Current mode rules:

- Production/test/migration/configuration implementation tickets are `[Codex]` only.
- `[Claude]` and `[Grok]` tickets are planning, review, audit, or verification work unless V explicitly changes the coding law.
- Rework returns to the same original worker and session.
- Session loss does not silently authorize a replacement. Hermes must comment `WORKER CONTINUITY OVERRIDE` with the reason, evidence, replacement identity, and preserved context.

## Source-of-truth order

1. Safety and explicit V direction.
2. Latest applicable Hermes/human decision comment on the current ticket.
3. Current ticket body and all comments in chronological order.
4. This shared protocol and the agent-specific adapter.
5. Repo guidance such as `AGENTS.md` and vendor skill files.
6. Chat prompts and prior memory.

A newer comment may supersede an older comment, but agents must not cherry-pick. If comments conflict and no explicit supersession exists, post a blocker for Hermes.

## Mandatory ticket-comment scan

Every worker, reviewer, and Hermes must read the full ticket body plus all comments:

1. before claim/resume;
2. before the first edit or review action;
3. on every heartbeat/wakeup;
4. after any status transition;
5. before requesting peer review;
6. before posting a review verdict or Hermes handoff;
7. before rework after a ticket returns to `ready`;
8. before human-review routing or Done.

Every claim, heartbeat, review, and handoff records:

```text
comments read through: <latest comment id or timestamp>
```

`ready` does not necessarily mean new work. It may mean Hermes or the human returned the ticket with required modifications. Read comments before acting.

## Logical review state machine

Kanban may not have native peer-review, Hermes-review, or human-review columns. These comment markers are therefore binding logical states:

```text
ready
  → WORKER CLAIM
  → running / worker implements or authors artifact
  → READY FOR PEER REVIEW
  → independent reviewer
      ├─ PEER REVIEW CHANGES REQUESTED → same worker/session fixes → peer re-review
      └─ PEER REVIEW APPROVED + READY FOR HERMES REVIEW
           → Hermes review
               ├─ HERMES CHANGES REQUESTED → status ready + same worker/session
               │    → REWORK ACKNOWLEDGED
               │    → REWORK READY FOR HERMES REVIEW
               │    → Hermes review again
               └─ READY FOR HUMAN REVIEW / V MANUAL QA PACKET
                    ├─ HUMAN REVIEW CHANGES REQUESTED → status ready + same worker/session
                    └─ HUMAN REVIEW PASSED → Hermes Done
```

For an internal ticket whose contract explicitly says `Human review required: no`, Hermes may complete after independent review and direct verification. User-facing, UX-sensitive, feature-level, or closure tickets default to human review.

## Flow requirements

### 1. Worker claim and work

The assigned worker reads all comments, records its session identity, claims the ticket, and posts `WORKER CLAIM`. It then works only the ticket/file contract and keeps comment scans current.

### 2. Worker asks for peer review

First-pass work ends with `READY FOR PEER REVIEW`, not `READY FOR HERMES REVIEW`. The worker attaches diff/artifact, RED/GREEN evidence where applicable, exact checks, risks, and the latest comment cursor.

### 3. Independent reviewer gate

The reviewer must be a different agent/session and read-only for the reviewed change.

- On rejection, post `PEER REVIEW CHANGES REQUESTED` with concrete evidence. Return findings to the same worker/session. The reviewer does not write the fix.
- On approval, post `PEER REVIEW APPROVED`, then `READY FOR HERMES REVIEW`. The reviewer—not the original worker—advances first-pass work to Hermes.

### 4. Hermes gate

Hermes reads the complete comment chain and verifies actual evidence.

- If changes are required, post `HERMES CHANGES REQUESTED`, set the ticket to `ready`, preserve assignment and original session, and name the exact comment/findings the worker must address.
- If human review is required, post `READY FOR HUMAN REVIEW` plus a `V MANUAL QA PACKET` and place a routing hold so no worker reclaims it while V reviews.
- If the contract explicitly waives human review and acceptance is proven, Hermes may complete with evidence.

### 5. Same-worker rework loop

A ticket returned to `ready` is reclaimed by the same worker/session. The worker posts `REWORK ACKNOWLEDGED`, addresses every listed finding, and then posts `REWORK READY FOR HERMES REVIEW` directly to Hermes. Peer re-review is optional only when Hermes's comment explicitly requests it; otherwise the correction loop returns directly to Hermes as V specified.

Hermes again chooses human review, another `ready` rework loop, or evidence-backed completion when human review was explicitly waived.

### 6. Human review

Hermes relays the human packet to V and writes V's verdict back to the ticket.

- Pass: `HUMAN REVIEW PASSED`; Hermes completes Done.
- Changes: `HUMAN REVIEW CHANGES REQUESTED`; Hermes records actionable findings, returns the ticket to `ready`, and preserves the same rework owner/session.

## Required comment templates

### Post-dialogue compaction checkpoint

```text
<AGENT> COMPACTION CHECKPOINT:
- mission/stage/ticket:
- CLI session id:
- sequence completed:
- durable artifact/diff/comment paths:
- command used: /compact <context> | /compact
- last substantive turn included: yes
- success evidence:
- post-compact state: parked | awaiting_review | ready_for_revision | complete
- comments read through: <id/timestamp | not ticketed>
```

If compaction fails, use `COMPACTION BLOCKED` with the CLI/version/session,
command, raw error, durable-state locations, and smallest safe recovery. Never
silently replace the session.

### Numbered-stage handoff/gate

Step 1 uses:

```text
RESEARCH HANDOFF COMPLETE:
- mission/step:
- Grok CLI session:
- Research.md path:
- sources/evidence named:
- assumptions/risks:
- comments read through: <id/timestamp | not ticketed>
```

Steps 2–5 use:

```text
READY FOR HERMES STAGE REVIEW:
- mission/step:
- owner CLI session:
- artifact path:
- upstream artifacts used:
- checks/evidence:
- assumptions/risks:
- comments read through: <id/timestamp | not ticketed>
```

Hermes records `HERMES STAGE REVIEW PASS` or
`HERMES STAGE REVIEW CHANGES REQUESTED` with the artifact, evidence inspected,
stage-contract verdict, exact findings/required changes, original owner/session,
and whether the next stage remains blocked. Step 6 records
`HERMES STEP 6 SELF-AUDIT PASS` or its CHANGES REQUESTED counterpart.

### WORKER CLAIM

```text
WORKER CLAIM:
- agent:
- ticket:
- worker CLI session id:
- branch/worktree:
- assignment type: first_pass | rework
- comments read through:
- next action:
```

### Heartbeat

Use `CODEX HEARTBEAT`, `CLAUDE HEARTBEAT`, or `GROK HEARTBEAT`.

```text
<AGENT> HEARTBEAT:
- current ticket:
- state: working | awaiting_peer_review | awaiting_hermes | awaiting_human | blocked | idle | stalled
- worker/reviewer CLI session id:
- branch/worktree:
- last command/check:
- files/artifact changed:
- comments read through:
- live-output channel/path:
- needs Hermes: yes/no
```

### READY FOR PEER REVIEW

```text
READY FOR PEER REVIEW:
- worker:
- worker CLI session id:
- ticket:
- branch/worktree:
- commit SHA if committed:
- files/artifact changed:
- RED/GREEN evidence if code:
- tests/checks with exact output:
- allowed-scope evidence:
- risks/open questions:
- comments read through:
```

### PEER REVIEW CHANGES REQUESTED

```text
PEER REVIEW CHANGES REQUESTED:
- reviewer:
- reviewer CLI session id:
- ticket:
- verdict: RED
- findings with severity and evidence:
- required modifications:
- required verification:
- route to: same original worker/session
- comments read through:
```

### PEER REVIEW APPROVED and READY FOR HERMES REVIEW

```text
PEER REVIEW APPROVED:
- reviewer:
- reviewer CLI session id:
- ticket:
- verdict: GREEN
- evidence inspected:
- checks independently run:
- residual risks:
- comments read through:

READY FOR HERMES REVIEW:
- sent by reviewer:
- original worker/session:
- ticket:
- branch/worktree:
- commit SHA if committed:
- files/artifact changed:
- worker evidence:
- reviewer evidence:
- human review required by contract: yes/no
- recommended Hermes action:
```

### HERMES CHANGES REQUESTED

```text
HERMES CHANGES REQUESTED:
- ticket:
- verdict: return_to_ready
- original worker/session:
- findings with evidence:
- required modifications:
- required verification:
- comments worker must read through:
- peer re-review required: yes/no
- assignment preserved: yes
```

Hermes then sets the ticket to `ready` without changing the assigned worker.

### REWORK ACKNOWLEDGED and REWORK READY FOR HERMES REVIEW

```text
REWORK ACKNOWLEDGED:
- worker/session:
- ticket:
- triggering Hermes/human comment:
- findings understood:
- comments read through:

REWORK READY FOR HERMES REVIEW:
- worker/session:
- ticket:
- triggering findings addressed one by one:
- files/artifact changed:
- RED/GREEN evidence if code:
- exact checks/output:
- residual risks:
- comments read through:
```

### READY FOR HUMAN REVIEW

```text
READY FOR HUMAN REVIEW:
- ticket:
- Hermes verdict:
- worker/reviewer evidence summary:
- environment/URL:
- exact steps for V:
- expected result:
- known caveats:
- pass/fail response needed:
```

Hermes also writes either `HUMAN REVIEW PASSED` or `HUMAN REVIEW CHANGES REQUESTED` after V responds.

## Blocked format

Use `CODEX BLOCKED`, `CLAUDE BLOCKED`, or `GROK BLOCKED`.

```text
<AGENT> BLOCKED:
- active ticket:
- blocker type: dependency | process | safety | architecture | file_contract | verification | session_continuity
- exact blocker:
- file/ownership conflict if any:
- comments read through:
- proposed smallest unblock:
- needs Hermes: yes/no
```

Use Blocked only for a true blocker: forbidden files, destructive data, missing dependency, architecture/product decision, secret/private-data risk, impossible verification, contradictory routing, or lost required session continuity. Local friction is not a goal blocker.

## V-visible live-output channel

When Hermes declares `LIVE MONITORING ACTIVE`, each active worker/reviewer maintains a dedicated channel or `.hermes/live/` fallback:

```text
DebateAI <AGENT> <ticket-id> <worker|reviewer> live
[HH:MM] <AGENT> <ticket-id> — <state>: <one-line action/result/next step>
```

Live output does not replace comments. Claims, heartbeats, review requests, verdicts, Hermes decisions, and human verdicts still go to the ticket.

## Parallelism and file ownership

- One writer per file/hunk.
- Reviewer sessions are read-only.
- Sibling implementation tickets may run in parallel only with non-overlapping file contracts.
- Planning/audit can run in parallel when read-only and cheap.
- Avoid simultaneous heavy builds/tests on V's laptop; serialize them when in doubt.
- A ticket returned for changes remains assigned to its original worker. Do not give it to an idle different worker merely for speed.

## Universal safety rules

Agents must not:

- mark their own ticket Done;
- push without explicit V approval;
- delete database/product data without V's explicit approval for that deletion;
- cross file contracts;
- create fake runtime product data;
- reveal secrets, tokens, cookies, private prompts, raw provider payloads, or private data;
- let a reviewer edit the change it reviews;
- ignore a newer ticket comment because an older prompt is more convenient.

## Hermes cockpit responsibilities

Hermes must:

1. create/repair tickets, dependencies, owner tags, file contracts, review requirements, and human-gate requirements;
2. record worker/reviewer CLI session handles;
3. ensure workers and reviewers scan comments at every boundary;
4. keep the same worker/session on rework;
5. launch a genuinely separate read-only reviewer for first-pass work;
6. reject a `READY FOR HERMES REVIEW` posted by the original first-pass worker without peer-review evidence;
7. verify comments, diff/artifact, tests, runtime evidence, and reviewer evidence;
8. route either to human review or back to `ready` with an actionable comment;
9. copy human verdicts into the ticket;
10. own Done/Blocked and interrupt V only for real decisions.

## Stop conditions

Stop and ask Hermes through comments when:

- assignment/owner/session identity is missing or contradictory;
- a returned `ready` ticket appears assigned to a different worker without `WORKER CONTINUITY OVERRIDE`;
- comments conflict without explicit supersession;
- allowed files or verification are absent;
- a required parent is not Done;
- destructive or secret-bearing work is required;
- review independence cannot be established;
- the original session is lost and no continuity decision exists.
