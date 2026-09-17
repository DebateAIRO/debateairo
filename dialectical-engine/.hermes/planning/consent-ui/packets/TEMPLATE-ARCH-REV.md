# PACKET ARCH-REV-__SLICE__ — blind review of ARCH-__SLICE__'s packet and PLAN (mission `consent-ui`)

**STEP 0 — CLAIM before you read anything else (COMMON §10.29):** post `CLAIM` on your ticket with `comments read through: <n>` NOW; then read the packet.

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/consent-ui/packets/COMMON.md` · `docs/missions/consent-ui/00-intake-H0.md` · `docs/missions/consent-ui/INSTRUCTIONS.md` · the slice `SPEC.md` (the binding WHAT) · `DECISIONS.md` · `docs/missions/consent-ui/BASELINE.md` · `.hermes/TOOLING-TRAPS.md`.
Skills (Skill tool): `superpowers:using-superpowers` · `heartbeat-protocol` · `heartbeat-reviewer` · `superpowers:verification-before-completion` · `superpowers:writing-plans` (to judge a plan by the standard it should meet) · `superpowers:receiving-code-review` (if contested).

## 1. Ticket state
- **board:** `consent-ui` · **ticket:** `__TICKET__` · **seat:** ARCH-REV-__SLICE__ · **role:** reviewer · **model:** claude-opus-5, fresh blind session · **round:** __ROUND__ of max 3 · **cwd:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine` (main tree, read-only; no git writes)
- **the work under review:** seat ARCH-__SLICE__, ticket `__WORK_TICKET__`, dispatched by `__WORK_PACKET__` (review it FIRST) — outputs: `docs/missions/consent-ui/slices/__SLICE__/PLAN.md`, the DECISIONS lines it appended, `.hermes/reports/consent-ui/mission-graph-__SLICE__.md`, self-report `.hermes/reports/consent-ui/agent-reports/ARCH-__SLICE__.md`, comments on `__WORK_TICKET__`.
- **the lane you may RUN commands in, read-only:** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/__LANE__/dialectical-engine` (change nothing; `git status --porcelain` must be empty when you leave)
- **allowed (exhaustive):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/reviews/ARCH-REV-__SLICE__-r__ROUND__.md` · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/agent-reports/ARCH-REV-__SLICE__-r__ROUND__.md` · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append) · scratch under `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/009d21d4-3595-46d3-b2b0-d763ebe8900d/scratchpad/arch-rev-__LANE__/` · comments on `__TICKET__` and ONE verdict comment on `__WORK_TICKET__` (`--author ARCH-REV-__SLICE__`). · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/consent-ui/probes/` (files named `<seat>-r<round>-*` only — COMMON §10.26; copy your probe kit there BEFORE the verdict comment) · scratch is `<seat>-r<round>/` per §10.11
- **forbidden:** editing anything under review · SPEC.md · any git write · code · subagents producing the verdict.

## 2. Probes — try to find ONE step a stranger cannot mark done/not-done
1. **Stranger test per step:** each step names files, the test and its property, the acceptance observation, the cluster. Banned words grep. A step whose acceptance is "works", "renders correctly", "matches the design" without a measurable observation is a finding.
2. **Trace both ways, mechanically:** script it — every `__SLICE__-Rnn` in SPEC appears in the trace with ≥1 step; every step id in `## Steps` appears in the trace. Count mismatches are blocking.
3. **Run every cluster command yourself, in the lane, at base:** classify BROKEN / RED-by-design / GREEN by CAUSE (COMMON §10.16–10.17), running each command from a `.sh` file under `/bin/bash` AND inline, feeding each a known-GOOD synthetic capture, and checking per guard term the mutant that flips it; compare with the author's A9 table. A command the author called RED that is BROKEN is blocking. A cluster whose command cannot fail for the mutant class it claims (reason it through, or plant a trivial mutant in scratch — never in the lane) is a finding.
4. **Surfaces and boundaries:** the union of cluster `allowed` surfaces covers every file the steps touch; no two concurrent clusters share a file; `globals.css` discipline (one delimited block at the end); the other slice's files absent; COMMON §3 no-touch surface absent; the registration request untouched.
5. **Cross-slice mechanics:** the consumed-modal wiring step exists, is last, and names the mechanism; the interface it consumes matches S02's SPEC sentence verbatim.
6. **DECISIONS:** every choice visible in the plan (names, mechanisms, values) has a line; no line contradicts an intake disposition or a V-row default without saying so.
7. **Refutation table completeness** (every step, every cluster) and honesty (a "not caught" column that is empty everywhere is theatre).
8. **Author's `SKILLS LOADED`** vs the architecture floor (`superpowers:brainstorming` then `superpowers:writing-plans`) — declaration check; self-report bar.

## 3. Verdict — `reviews/ARCH-REV-__SLICE__-r__ROUND__.md`
`SKILLS LOADED` · `Verdict: PASS | REWORK | BLOCKED` · packet findings · B1… · N1… (file:line, the seat that would go wrong and how, evidence) · verified — how (verbatim command outputs) · not verified · predictions · `comments read through`. ONE comment on `__WORK_TICKET__`, pointer on `__TICKET__`. A REWORK that would open round 4 → V row. Self-report first. Stop.

**Remedies (COMMON §10.22):** every B/N finding names its CLASS (binding) and marks its remedy `BINDING (measured: <what you ran>)` or `ADVISORY`. An advisory remedy the author refutes with output is not a NOT ADDRESSED.
