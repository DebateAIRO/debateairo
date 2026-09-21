# PACKET — opus-blind · blind reconstruction lens
Mission: 2026-08-31-algorithm-correctness · Ticket: T1 · Dispatched by orchestrator (Fable 5), 2026-08-31

## 0. Protocol (do this first)
You are one seat in a heartbeat fleet. Invoke skill `heartbeat-protocol`, then the role
contract it names for a seat that reviews/verifies someone else's work: `heartbeat-reviewer`
(you verify what the CODE claims to do — the code is the artifact under review). Also invoke
`superpowers:using-superpowers`. Router §2 laws bind you.
Board note: the hermes kanban CLI is absent this mission; your ticket is a file the
orchestrator maintains. You never write board files. Your markers (CLAIM / HEARTBEAT /
BLOCKED / FULLY DONE) go as the FIRST line of your findings file, updated as you go; the
orchestrator mirrors them.
**Packet review duty:** before working, check this packet against your role contract and
the laws. If anything is contradictory or impossible, write `BLOCKED: <reason>` into your
findings file and stop. Do not absorb defects.

## 1. Working root and write law
- Working root (your code universe, pinned): `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/algo-lens-opus/dialectical-engine`
- You may WRITE exactly two files, both inside your worktree:
  - `<working root>/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-blind-findings.md`
  - `<working root>/.hermes/reports/2026-08-31-algorithm-correctness/agent-reports/opus-blind.md` (self-report)
  (Create parent directories as needed.)
- READ-ONLY everywhere else. No code edits, no git mutations, no pushes, no network.
- BLIND LAW: do not read `.hermes/reports/2026-08-31-algorithm-correctness/board/inputs/`
  anywhere, any other seat's report, or anything outside your worktree except this packet.
  Do not go hunting for prior analyses of this pipeline. Your value is independence.
- Repo docs (`docs/`, READMEs) may give you vocabulary, never evidence: every load-bearing
  assertion in your report cites CODE `file:line` from your worktree.

## 2. The mission question
Reconstruct, from code alone, exactly what happens from the moment a user submits a
question in the web UI until a verdict (or its absence) is displayed back. Code is truth;
intent documents are not. Orientation map (a map, not conclusions): the ask form is under
`web/app/new/`, the API under `apps/api/`, the runner under `apps/runner/`, and the engine
logic under `packages/` (judgement, graph, propagation, serve, critique, battery, register,
providers, contract, db).

## 3. Deliverable — exact skeleton for opus-blind-findings.md
```
<marker line>
# OPUS BLIND RECONSTRUCTION — dev@1c9578a
## PIPELINE
(ordered steps; per step: WHAT · WHERE file:line · DATA in→out · CONFIDENCE certain|likely|unsure)
## THE MATH
(every formula as implemented — self-assessment→score, aggregation, propagation, bands,
thresholds — with file:line; write the formula, not a paraphrase)
## DECISION POINTS
(every place the system CHOOSES: among candidate answers, gates that suppress output,
how the final verdict/confidence is derived. Per item: VERDICT (what the rule actually is)
/ CONFIDENCE / STRONGEST COUNTER (the best reading against your interpretation))
## DEAD OR ODD
(declared-but-unreachable states, computed-but-never-used values, inputs stored but never
read, behavior that only tests can trigger. Per item: VERDICT / CONFIDENCE / STRONGEST COUNTER)
## RUNTIME WIRING
(does `apps/runner/src/main.ts` construct a runner able to execute a full run? name every
policy/config it wires and where each value comes from; anything missing or dev-stubbed;
compare with what `acceptance/` wires if useful)
## OPEN QUESTIONS
(what static reading could not determine)
## ABSTRACT
(≤12 lines, plain words: the 5 most load-bearing truths you found)
```

## 4. Bounds
- rework rounds: max 3 (orchestrator may return findings with questions; each return is a round)
- stopping rule: stop when the full path is traced with file:line on every load-bearing
  assertion, or at ~90 minutes of work — whichever comes first. A long OPEN QUESTIONS
  section is an honest outcome; a padded PIPELINE is not.
- Verbatim law: anything formatted as code/output in your report must be verbatim from the tree.

## 5. Self-report (before FULLY DONE) — opus-blind.md
Per router §3, answer: "treat it like a murder case. I want to get a nice report on what
can be done better. What we must upgrade. what repeatedly costed us tokens. how we can
make the coding more efficient. How can we turn this into a one prompt machine even
better." Name causes and prices (wall-clock, retries), what you NEARLY got wrong, dead
ends, and exactly where this packet was unclear.

## 6. Return
Your final message = `FILED: <both absolute paths>` + your ABSTRACT verbatim. Nothing else.
