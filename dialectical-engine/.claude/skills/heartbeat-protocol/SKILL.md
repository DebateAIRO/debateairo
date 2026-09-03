---
name: heartbeat-protocol
description: Entry point for the DebateAI heartbeat loop. Routes a seat to its role contract — orchestrator, worker, reviewer, requirements, or architecture — and states the laws that bind every seat regardless of role. Load this first, then the role skill it names.
---

# Heartbeat Protocol — router

**You are one seat in a fleet. Find your role, load its contract, stop reading this.**
Role contracts target ~100 lines and may exceed it when the content earns it (V, 2026-08-28)
— what is forbidden is padding, and making a worker read routing law it cannot act on. Never
cut a real rule or mangle a sentence to hit a number. If you are reading more than ~200 lines
of protocol before starting work, something is wrong — say so.

## 1. Which contract is yours

| If your packet makes you… | Load |
|---|---|
| decompose, route, launch seats, assemble reports | `heartbeat-orchestrator` |
| write code or tests | `heartbeat-worker` |
| review someone else's work or their packet | `heartbeat-reviewer` |
| turn a V prompt into the mission compass and SPEC | `heartbeat-requirements` |
| decide HOW — fill PLAN.md, clusters, boundaries, ADRs | `heartbeat-architecture` |

The four loops map onto these roles: REQUIREMENTS → `heartbeat-requirements` ·
ARCHITECTURE → `heartbeat-architecture` · PROGRAMMING → `heartbeat-worker` ·
QA → `heartbeat-reviewer` (plus verification seats). The R7 election assigns models to
loops; the loop's contract is the skill above.

Invoke it with the Skill tool. One role per seat: a seat that reviews does not also code,
and a seat that codes never reviews its own work (§2.1).

**Superpowers is mandatory, and EVERY seat may use ANY of it (V ruling, 2026-08-28).**
Load `superpowers:using-superpowers` first. **The whole library is open to every role** —
worker, reviewer, orchestrator, architecture, requirements alike. If a Superpowers skill
fits what you are about to do, load it, whether or not your role names it.

Heartbeat says WHAT you owe and to whom; Superpowers says HOW to do the work well. They do
not compete — where they overlap, heartbeat's law wins on process (rework cap, finding
discipline, self-report) and Superpowers wins on craft (RED-first, root-cause-before-fix,
evidence-before-assertion).

The table below is a **FLOOR, not a ceiling**: these are the ones your role must load
anyway. Reaching past your row is expected, not an exception.

| Role | Must load at minimum |
|---|---|
| worker | `test-driven-development` · `verification-before-completion` · `systematic-debugging` (any bug) · `receiving-code-review` (on rework) |
| reviewer | `verification-before-completion` · `receiving-code-review` (when your finding is contested) |
| architecture | `brainstorming` (before committing a direction) · `writing-plans` |
| requirements | `brainstorming` |
| orchestrator | `dispatching-parallel-agents` · `using-git-worktrees` · `subagent-driven-development` · `executing-plans` · `finishing-a-development-branch` |

Everything else in the library — `systematic-debugging`, `writing-plans`,
`requesting-code-review`, `executing-plans`, `writing-skills`, `finishing-a-development-branch`,
`using-git-worktrees`, `subagent-driven-development`, `dispatching-parallel-agents`,
`brainstorming`, `test-driven-development`, `receiving-code-review`,
`verification-before-completion` — is available to any seat that needs it.

Non-Claude seats (Codex, Grok) cannot invoke these: read them as markdown at
`~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/<name>/SKILL.md`,
newest version directory. The whole `skills/` directory is open to them too.

Sources of truth, in order: the spine
(`docs/agent-protocols/debateai-heartbeat-protocol.md`), your role adapter beside it, the
mission `INSTRUCTIONS.md`, the board. On disagreement the higher wins — and you report it.

## 2. Laws that bind every seat

**2.1 No reviewing your own homework.** No seat verifies, approves or accepts its own
output — this holds for code, plans, packets and verdicts alike. The reviewer seat also
reviews the *packet* that dispatched the work (see `heartbeat-reviewer` §1).

**2.2 A finding is a finding — and you fix the CLASS, not the instance.** Blocking or not,
every finding gets a ticket and a fix. **A reported finding is a SAMPLE of a class, never the
whole class.** When one is handed to you, name the class it belongs to, then sweep every member
of it and state per member whether it is affected — in the artifact, so a reviewer checks your
sweep mechanically instead of re-deriving it. Measured 2026-08-29: a seat redacted the one
leaking field a reviewer named and stopped; the same wholesale-copy decision was leaking two
more, and a later sweep found two further fields no checklist had. Searching by NAMED LEAD
instead of by RISK CLASS is how the second and third defects ship. And pick the remedy by the
SHAPE, not by your confidence about the content: fixed key set → PROJECT to a named allow-list
(build a new object, never spread the source); open key set with no semantic contract → REDACT
wholesale; verified safe → copy with the producer trace recorded. "Flag it on a checklist" is
not a remedy for an open shape — a checklist enumerates keys, and the defect is that the keys
are not enumerable.
Non-blocking changes *when* it is fixed, never *whether*. Nothing is filed as a residual
and forgotten — a residual dropped on the floor came back as a blocker and cost a full round.

**2.3 Three rework rounds, then it is V's.** Round 4 is not authorized: it goes to a V
DECISIONS PACKET row instead. (Measured: rounds 1–3 carry 92.9% of all convergence.)

**2.4 The board is the state.** Not logs, not live files, not your memory. If no ticket
exists for your seat, say so and stop — do not log `not ticketed` to satisfy the format.

**2.5 Reproduce first.** RED before GREEN, always, including on every rework round. A test
written after the fix, with no failing evidence, is not evidence.

**2.6 Verbatim means verbatim.** Anything you format as command output must be that output.
Report suites as `passed/total`, name every failure and whether it predates you, and never
make the blanket claim that nothing is caused by your diff.

**2.7 Say what you cannot do.** Blocked, unsure, out of contract, or the packet is wrong —
say it and stop. A guess presented as a result is the most expensive thing in this harness.

## 3. Self-report — binding, before your final handoff

Every seat files `.hermes/reports/<mission>/agent-reports/<seat>.md`. No seat reaches FULLY
DONE without one, and its path is in your `allowed` list at dispatch. Your packet carries
this instruction verbatim, and it is the question your report answers:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

**A case file, not a diary.** Name the CAUSE, not the symptom. PRICE each finding —
wall-clock, rounds, retries. Say what you NEARLY got wrong. Name DEAD ENDS so nobody
re-derives them. Say where the packet was unclear and exactly where. An anodyne self-report
is worse than none: it makes an empty record look full.

## 3b. SKILLS LOADED — binding, the first line of your handoff

Your handoff OPENS with:

> `SKILLS LOADED: <every skill you actually loaded, comma-separated>`

No seat reaches FULLY DONE without it. Naming a skill you did not load is a fabrication
finding (§2.6). Falling short of your role's floor (§1) is a finding against you — say so
plainly instead, per §2.7; an honest shortfall costs a line, a hidden one costs a round.

**Why this is a gate and not a reminder.** Measured 2026-08-29: all four seats DID load
their floor — but nobody could tell without grepping session transcripts, because no handoff
declared it. The orchestrator sampled a seat mid-run, saw two skills, and wrongly concluded
it had skipped a mandated one; the seat had simply not reached it yet, and loaded it in the
right order. **Unobservable compliance gets mis-judged in both directions** — skipped
silently, or falsely charged. This line makes it observable at zero cost.

## 4. Markers

`CLAIM` · `HEARTBEAT` · `BLOCKED` · `READY FOR PEER REVIEW` · `READY FOR HERMES STAGE
REVIEW` · `REWORK READY FOR REVIEW` · `FULLY DONE` — each carrying its `comments read
through` cursor. Return control at a handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the session alive and resumable. Silence is normal. Only the spine's
FULLY DONE condition terminates a goal.

## 5. Never

Push without V · merge (V performs every merge) · mark Done from a non-verifier seat ·
delete product or database data · fabricate runtime data or evidence · reveal secrets ·
cross your file contract · ignore ticket comments · sub-delegate unless your packet grants it.
