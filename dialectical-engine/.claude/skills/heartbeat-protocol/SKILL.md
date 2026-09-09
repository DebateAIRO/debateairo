---
name: heartbeat-protocol
description: Entry point for the DebateAI heartbeat graph (v4.0.0). Routes a seat to its role contract — orchestrator, requirements, architecture, mock, worker, reviewer — and states the laws that bind every node regardless of role, including the graph, the reading floor, the no-terminal law, the self-report, SKILLS LOADED and the handoff shape. Load this first, then the role skill it names.
---

# Heartbeat Protocol — router (v4.0.0, graph mode)

**You are one node in a graph. Find your role, load its contract, stop reading this.** If you are
reading more than ~200 lines of protocol before starting work, something is wrong — say so.

## 1. Which contract is yours

| Your packet makes you… | Load |
|---|---|
| schedule the graph — intake, dispatch, gates, ledgers | `heartbeat-orchestrator` |
| turn V's prompt into the mission compass and the frozen SPECs | `heartbeat-requirements` |
| decide HOW — fill PLAN.md, clusters, boundaries, ADRs | `heartbeat-architecture` |
| build the mock UI of a slice, for V to define done on | `heartbeat-mock` |
| write code or tests | `heartbeat-worker` |
| review someone else's work, or the packet that dispatched it | `heartbeat-reviewer` |

One role per node: a seat that reviews does not code, and no seat reviews its own work (§3.1).

**Superpowers is mandatory, and the whole library is open to every role (V, 2026-08-28).** Load
`superpowers:using-superpowers` first, then anything else that fits what you are about to do.
Heartbeat says WHAT you owe and to whom; Superpowers says HOW. Where they overlap, heartbeat wins
on process (caps, finding discipline, self-report) and Superpowers wins on craft (RED-first,
root cause before fixes, evidence before assertions). The floor below is what your role loads
anyway — never a ceiling.

| Role | Must load at minimum |
|---|---|
| orchestrator | `dispatching-parallel-agents` · `using-git-worktrees` · `subagent-driven-development` · `finishing-a-development-branch` |
| requirements | `brainstorming` |
| architecture | `brainstorming`, then `writing-plans` |
| mock | `design-taste-frontend` (the `/taste` skill) · `design` (the Claude Design canvas) |
| worker | `test-driven-development` · `verification-before-completion` · `systematic-debugging` (any bug) · `receiving-code-review` (on a FIX node) |
| reviewer | `verification-before-completion` · `receiving-code-review` (when your finding is contested) |

Non-Claude seats (Codex, Grok) read skills as markdown: the newest
`~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/<name>/SKILL.md` and
the repo's `.claude/skills/<name>/SKILL.md`.

Sources of truth, highest first: the spine (`docs/agent-protocols/debateai-heartbeat-protocol.md`,
its v4.0.0 amendments win over older text), these skills, the mission `INSTRUCTIONS.md`, the board.
On disagreement the higher wins — and you report it.

## 2. The graph

A mission is a DAG of board tickets. **A node is one ticket with one job, typed inputs (files named
by absolute path), one output artifact and one handoff marker. An edge is a parent→child link on the
board; a node is READY when every parent is done, and the board computes that.** You know your node
and its inputs, never the route. Nothing loops: a REWORK verdict appends a FIX node and the next REV
pass, and the cap is a node count. The code loop has exactly one review point per vertical slice —
`REV(S)`, after every cluster of the slice is green. A UI slice passes through `MOCK(S)` and V's
`DONE(S)` before any BUILD. The full vocabulary is `heartbeat-orchestrator` §2.

## 3. Laws that bind every node

**3.1 No reviewing your own homework.** No seat verifies, approves or accepts its own output —
code, plans, packets, mocks or verdicts. The reviewer also reviews the packet that dispatched the work.

**3.2 A finding is a finding, and you fix the CLASS.** Blocking or not, every finding gets a ticket
the same day and a fix; the tier sets WHEN, never WHETHER. A reported finding is a SAMPLE of a class:
name the class, sweep every member, record the sweep member-by-member so a reviewer checks it
mechanically. Choose the remedy by the SHAPE — fixed key set → project to a named allow-list; open
key set → redact wholesale; verified safe → copy with the producer trace recorded — never by your
confidence about the content.

**3.3 Three REV passes per slice, then it is V's.** Pass 4 does not exist; it is a V DECISIONS
PACKET row. (Passes 1–3 carry 92.9% of measured convergence.)

**3.4 The board is the state.** Not logs, not live files, not your memory. No ticket for your node →
say so and stop.

**3.5 Reproduce first.** RED before GREEN, on every pass. A test written after the fix, with no
failing evidence, is not evidence.

**3.6 Verbatim means verbatim.** Anything you format as command output is that output. Suites as
`passed/total`, every failure named and dated pre-existing or yours; never the blanket claim that
nothing is caused by your diff.

**3.7 Say what you cannot do.** Blocked, unsure, out of contract, packet wrong — say it and stop.
UNVERIFIED is always a legal answer; a guess presented as a result is the most expensive thing here.

**3.8 The reading floor.** You read: `using-superpowers`, this file, your contract, your floor,
`INSTRUCTIONS.md`, your packet, and the files your packet names AT THE LINES IT NAMES. A BUILD node
reads its cluster's steps, never the whole PLAN. `TOOLING-TRAPS.md` is read as its index
(`grep -n '^## \|^- ' .hermes/TOOLING-TRAPS.md`) plus the headings your packet names. A packet that
makes you read more is a packet defect — report it (3.7), do not absorb it.

**3.9 The no-terminal law (V, 2026-09-09).** Nothing is opened on V's desktop: no `osascript`, no
Terminal window, no browser window, no app — the visible-launch law is revoked. Every seat and every
watchdog runs inside the orchestrator's own process tree: background subagents and background
processes logging to files. The harness's in-app browser pane is its own PTY and may be used for
verification. A terminal or UI element is opened only when V asks, and then exactly the one asked for.

## 4. Self-report and SKILLS LOADED — binding, before your final handoff

Every seat files `.hermes/reports/<mission>/agent-reports/<seat>.md`; the path is in your `allowed`
list, and no seat reaches FULLY DONE without it. Your packet carries this instruction verbatim, and
it is the question your report answers:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

A case file, not a diary: name the CAUSE, not the symptom · PRICE each finding (wall-clock, tokens,
passes) · say what you NEARLY got wrong · name DEAD ENDS so nobody re-derives them · say exactly
where the packet was unclear. An anodyne report is worse than none.

Your handoff OPENS with `SKILLS LOADED: <every skill you actually loaded>`. Naming one you did not
load is a fabrication finding (3.6); an honest shortfall from your floor costs a line, a hidden one
costs a pass. The orchestrator verifies the line against the skill BODY in your transcript — a path
proves nothing, because packets quote paths and they echo back.

## 5. The handoff — one shape, eight lines

1 `SKILLS LOADED: …` · 2 node, pass, ticket, session id · 3 the artifact path, or branch + commit ·
4 verification verbatim — suites as passed/total, the three-run table, RED frames · 5 findings and
packet defects, each with file:line · 6 UNVERIFIED — what you could not do, and why · 7 self-report
path · 8 `comments read through: <n>`. Return control at your marker, at a genuine blocker, or at an
IMPORTANT OPERATION; keep the session resumable. Silence is normal.

## 6. Never

Push · merge · mark a slice Done (V vetoes; the orchestrator closes sub-tickets on consumed verdicts)
· delete product or database data · fabricate runtime data or evidence · reveal secrets · cross your
file contract · ignore ticket comments · sub-delegate your deliverable · open anything on V's desktop.
