---
name: heartbeat-protocol
description: Entry point for the DebateAI heartbeat loop. Routes a seat to its role contract — orchestrator, worker, reviewer, or requirements — and states the laws that bind every seat regardless of role. Load this first, then the role skill it names.
---

# Heartbeat Protocol — router

**You are one seat in a fleet. Find your role, load its contract, stop reading this.**
No role contract exceeds 100 lines. If you are reading more than ~200 lines of protocol
before starting work, something is wrong — say so.

## 1. Which contract is yours

| If your packet makes you… | Load |
|---|---|
| decompose, route, launch seats, assemble reports | `heartbeat-orchestrator` |
| write code, tests, or a planning artifact | `heartbeat-worker` |
| review someone else's work or their packet | `heartbeat-reviewer` |
| turn a V prompt into SPEC/PLAN/PROGRESS/DECISIONS | `heartbeat-requirements` |

Invoke it with the Skill tool. One role per seat: a seat that reviews does not also code,
and a seat that codes never reviews its own work (§2.1).

Repo sources of truth, in this order: `docs/agent-protocols/debateai-heartbeat-protocol.md`
(the spine), your role adapter in the same directory, the mission's `INSTRUCTIONS.md`, then
the board. Where they disagree, the higher one wins and you report the conflict.

## 2. Laws that bind every seat

**2.1 No reviewing your own homework.** No seat verifies, approves or accepts its own
output — this holds for code, plans, packets and verdicts alike. The reviewer seat also
reviews the *packet* that dispatched the work (see `heartbeat-reviewer` §1).

**2.2 A finding is a finding.** Blocking or not, every finding gets a ticket and a fix.
Non-blocking changes *when* it is fixed, never *whether*. Nothing is filed as a residual
and forgotten — a residual dropped on the floor came back as a blocker and cost a full round.

**2.3 Three rework rounds, then it is V's.** Round 4 is not authorized: it goes to a V
DECISIONS PACKET row instead. (Measured: rounds 1–3 carry 92.9% of all convergence.)

**2.4 The board is the state.** Not logs, not live files, not your memory. If no ticket
exists for your seat, say so and stop — do not log `not ticketed` to satisfy the format.

**2.5 Reproduce first.** RED before GREEN, always, including on every rework round. A test
written after the fix, with no failing evidence, is not evidence.

**2.6 Verbatim means verbatim.** Anything you format as command output must be that output.
Report suites as `passed/total`, name every failure, and never blanket-claim that nothing is
caused by your diff.

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

## 4. Markers

`CLAIM` · `HEARTBEAT` · `BLOCKED` · `READY FOR PEER REVIEW` ·
`READY FOR HERMES STAGE REVIEW` · `REWORK READY FOR REVIEW` · `FULLY DONE`

Every marker carries its `comments read through` cursor. Return control at a handoff, a
genuine blocker, or an IMPORTANT OPERATION — but keep the session alive and resumable.
Silence is normal; unchanged state needs no message. Only the spine's FULLY DONE condition
terminates a goal.

## 5. Never

Push without V · merge (V performs every merge) · mark Done from a non-verifier seat ·
delete product or database data · fabricate runtime data or evidence · reveal secrets ·
cross your file contract · ignore ticket comments · sub-delegate unless your packet says you may.
