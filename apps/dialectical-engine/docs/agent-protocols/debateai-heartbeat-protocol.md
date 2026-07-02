# DebateAI Shared Heartbeat Protocol

This is the shared protocol spine for DebateAI multi-agent work. It is intentionally agent-neutral: Hermes, Codex, and Claude all read this first, then read their adapter.

## Operating model

```text
V talks to Hermes.
Hermes manages Kanban, tickets, dependencies, blocker routing, review gates, and final QA truth.
Codex and Claude work assigned Kanban tickets and report through Kanban comments/heartbeats.
Kanban is the durable shared state.
When V asks for visible live monitoring, Hermes also opens a dedicated live-output channel for each active agent so V can watch progress without repeatedly asking for status.
```

V should only be interrupted for real product, architecture, security, destructive-action, or scope decisions. Routine operational issues belong to Hermes/Kanban.

## Roles

```text
V        = commander / product decision maker
Hermes   = cockpit / traffic controller / reviewer / Done gate / Blocked authority
Codex    = primary implementation coordinator for [Codex] tickets
Claude   = isolated parallel lane worker for [Claude] tickets
Kanban   = source of truth for current work state
```

## Source-of-truth order

When instructions conflict, follow this order:

1. Safety and explicit V direction.
2. Current Kanban ticket body and Hermes Kanban comments.
3. This shared protocol and the agent-specific adapter.
4. Repo guidance such as `AGENTS.md` and `.claude/skills/**/SKILL.md`.
5. Chat prompts and prior memory.

If conflict remains, post a heartbeat asking Hermes for routing. Do not silently guess across file contracts.

## Universal hard rules

All agents must:

- Work only the currently assigned ticket/lane.
- Read the full ticket body before editing: parents, children, dispatch packet, allowed files, forbidden files, verification, branch/worktree notes.
- Treat Kanban ticket bodies/comments as the current mission contract.
- Respect file ownership: one writer per file/hunk at a time.
- Keep sibling lanes independent unless Hermes explicitly routes integration.
- Use heartbeats for progress and blockers.
- Keep the V-visible live-output channel current when Hermes declares live monitoring active.
- Handoff with `READY FOR HERMES REVIEW`.
- Let Hermes decide Done, Blocked resolution, and gate completion.
- Preserve product behavior unless the ticket explicitly changes it.
- Use test fixtures only for tests; never create fake runtime product data.
- Redact secrets, tokens, auth headers, cookies, prompts, raw provider payloads, and private data.

All agents must not:

- Mark their own tickets Done.
- Push to remote without explicit V approval.
- Delete database data or product data without explicit V approval for that specific deletion.
- Touch files outside the ticket's allowed file contract.
- Cross into another agent's lane without Hermes routing.
- Add production observability infrastructure unless the ticket explicitly includes it.

## Heartbeat format

Use the agent-specific marker: `CODEX HEARTBEAT` or `CLAUDE HEARTBEAT`.

```text
<AGENT> HEARTBEAT:
- current ticket:
- state: working | ready_for_review | blocked | idle | stalled
- branch/worktree:
- last command/check:
- files changed:
- files intentionally owned:
- subagents/workstreams active/completed:
- needs Hermes: yes/no
```

Post heartbeats while working, waiting for review, blocked, or idle due to routing uncertainty.

## V-visible live-output channel

Kanban remains the durable source of truth, but V should not need to ask Hermes for routine status while agents are running.

When Hermes routes one or more agents and declares `LIVE MONITORING ACTIVE`, Hermes must create one dedicated live-output channel per active agent/ticket. The channel may be a separate visible terminal/chat/session, a named agent run whose stdout is visible to V, or another explicit UI surface V can keep open. If the runtime cannot create a separate chat/session, Hermes must fall back to a visible log file under `.hermes/live/` and state that fallback in the routing packet.

Required live channel naming:

```text
DebateAI <AGENT> <ticket-id> live
```

Agents must write short, V-readable progress lines to that channel at startup, at meaningful milestones, before/after long commands, on blockers, and at handoff. Do not stream secrets, raw auth tokens, cookies, private prompts, or unredacted provider payloads.

Live update format:

```text
[HH:MM] <AGENT> <ticket-id> — <state>: <one-line action/result/next step>
```

Examples:

```text
[16:42] CODEX t_123 — working: running focused scoring UI tests
[16:47] CLAUDE t_456 — audit: found possible API/schema mismatch, checking callers
[16:50] CODEX t_123 — blocked: app port 3010 unavailable; trying alternate port 3020
```

Live-output rules:

- Live output is for V visibility only; it does not replace Kanban comments, heartbeats, blockers, or READY FOR HERMES REVIEW.
- Every heartbeat/blocker/handoff still goes to Kanban.
- For long-running commands, post a line before starting and a line with exit code/result after completion.
- If an agent uses subagents/workstreams, summarize them in the same live channel rather than making V chase hidden logs.
- If the live channel fails, post a Kanban heartbeat noting `live-output degraded` and the fallback path.

## Blocked format

Use the agent-specific marker: `CODEX BLOCKED` or `CLAUDE BLOCKED`.

```text
<AGENT> BLOCKED:
- active ticket:
- blocker type: local | dependency | process | safety | architecture | file_contract | verification
- exact blocker:
- file/ownership conflict if any:
- proposed smallest unblock:
- needs Hermes: yes/no
```

Only use Blocked for true blockers:

- forbidden files appear required;
- destructive data action is needed;
- dependency is missing or not Done;
- architecture/product decision is required;
- secret/private-data risk is unclear;
- verification is impossible with available repo/tooling;
- Kanban routing is absent or contradictory.

Do not block the whole goal for local implementation friction, generated worktree path confusion, branch uncertainty when the branch is declared, or prior completed ticket state. Fix the smallest local slice or post a heartbeat with `needs Hermes: yes`.

## Handoff format

Use this exact marker when implementation is ready for Hermes:

```text
READY FOR HERMES REVIEW:
- agent:
- ticket:
- branch:
- worktree/path:
- commit SHA if committed:
- files changed:
- tests/checks run with exact output:
- scope/allowed-file evidence:
- privacy/redaction evidence if relevant:
- collision check result:
- subagents/workstreams used:
- risks/blockers:
- recommended Hermes action:
```

After handoff, the implementation agent waits for Hermes. Hermes reviews, completes, blocks with exact reasons, or promotes the next ticket.

## Same-file and parallelism rule

Parallelism means non-overlapping file ownership, not multiple agents editing the same thing faster.

- One writer per file/hunk.
- Read-only audit/planning can run in parallel with implementation.
- If overlap appears, pause the lower-priority lane and post a heartbeat/blocker naming the path and proposed serialization.
- Avoid simultaneous heavy builds/tests on V's laptop. Run targeted checks sequentially when in doubt.

## Hermes cockpit responsibilities

Hermes should:

- Create/repair Kanban tickets and file contracts when missing.
- Assign tickets to the correct agent.
- When routing active Codex/Claude work for V, open or declare the live-output channel(s) before launching the agent process.
- Promote the next safe ticket only when dependencies are satisfied.
- Comment guidance directly on tickets when agents self-block or lack routing.
- Review handoffs with real commands/evidence.
- Complete Done gates and remove temporary heartbeat watchers when a wave is clean.
- Interrupt V only for decisions Hermes cannot safely make.

## Agent self-block prevention

If an active ticket exists, agents should continue that ticket unless a true blocker exists. Worktree path weirdness is not a goal blocker. Use the declared branch/worktree if available, or the already-used lane worktree, and report the actual path in handoff.

Hermes may add a ticket comment titled:

```text
HERMES ROUTING GUIDANCE — DO NOT SELF-BLOCK THE GOAL
```

When that appears, the agent must follow it as current routing law.
