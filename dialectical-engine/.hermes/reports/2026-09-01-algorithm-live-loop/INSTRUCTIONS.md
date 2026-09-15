# Algorithm Live Loop — mission compass

Mission `2026-09-01-algorithm-live-loop`. Make the debate decide the answer: repeal the
all-UNKNOWN edge constraint, wire the panel that already exists, and let propagation —
not configuration order — choose, number and label the served verdict.

**This file is a COMPASS: pointers, never content.** Hard cap 100 lines; detail lives in
the slice files, uncapped and welcome. If you find detail here, this file is wrong.

## Authority chain — higher wins, and you report the disagreement

1. **V** — final authority. Performs every merge. Rules the seven confirm-items at
   acceptance and may override any deviation below at any time.
2. **The frozen goal** — `../2026-08-31-algorithm-correctness/goal-prompt.md`
   (`goal-v4-2026-09-01`, sha256 `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`).
   Verify that hash before quoting it. **It is FROZEN: any urge to reword, fix or improve
   it is a FINDING, never an edit** (D7).
3. **Walkthrough rulings** — `../2026-08-31-algorithm-correctness/DECISIONS.md`
   (I-1…I-5 intake, S1-1…S7-3 walkthrough). Every task implements a dated V ruling.
4. **This mission's law** — `DECISIONS.md` (R7-1…R7-4 intake, D1–D7 deviations).
   Append-only. **Check it before asking V anything** — a question answered there is
   re-asked to nobody.
5. **The spine** — `docs/agent-protocols/debateai-heartbeat-protocol.md`; role contracts
   at `.claude/skills/heartbeat-{protocol,orchestrator,worker,reviewer,requirements,architecture}`.

Baseline for every `file:line` in the goal: **`dev @ 1c9578a`**. Integration branch:
`mission/2026-09-01-algorithm-live-loop`.

## Roster and review route (R7-1 — elected from V's /goal text, not a preset)

| seat | model | owns |
|---|---|---|
| orchestrator + judge | Fable 5 | decomposition, dispatch, assembly, final verdict per lane and for the goal |
| every subagent seat | Opus 5 | requirements transcription and all worker lanes |
| code reviewer | Codex gpt-5.6-sol @ xhigh | static review of every Opus worker lane |

Loop map: REQUIREMENTS → Opus 5 (bounded zero-drift transcription) · ARCHITECTURE → none
(pre-satisfied — goal-v4 embeds the HOW) · PROGRAMMING → Opus 5 · QA → Codex review +
Fable judge verdict. Decorrelation and the roster-vs-spine conflict: `DECISIONS.md`
R7-2/R7-4. Routed path per lane (D2): worker RED→GREEN → codex review → ≤3 rework rounds
→ judge → V acceptance at closure.

## Slice index — four files each in `slices/<code>/` (layout fixed by `board/inputs/slice-map.md`)

| slice | goal tasks | what it settles | wave |
|---|---|---|---|
| `S00-baseline` | T0 | the three pinned commands every later count is read against | W0 |
| `S01-register` | T16 | sole owner of every new sealed row, schema and migration | W1 |
| `S02-hygiene` | T1, T2, T4, T8 | depth at the contract door, steering placebo, RAN, strict-and | W2 |
| `S03-panel` | T3 | author ≠ judge: the panel machinery finally wired | W3 |
| `S04-edges` | T5, T6 | measured edges (sentinel repealed) and review outcomes with teeth | W4/W5 |
| `S05-stopping` | T7 | adaptive stopping: global δ stop, branch freeze under ε | W5 |
| `S06-selection-label` | T10, T11 | served number by strength, three-state label from code | W6 |
| `S07-synthesis` | T9 | digest, synthesizer/evaluator loop, legacy gate re-routing | W7 |
| `S08-band-form` | T12, T13 | band over cited nodes; the honest no-evidence downgrade | W8 |
| `S09-envelope` | T17 | cost ceiling recomputed for the live topology | W9 |
| `S10-production` | T14 | double-gated production wiring (evidence first, work only if both gates fire) | W10 |
| `S11-eval-harness` | T15 | role eval harness; V's role decision seeded | W11 |
| `S12-closure` | global | Scope law, Global DoD, confirm-items, Non-goals, δ/ε refit | W12 |

## Table of contents — real files only

- `DECISIONS.md` · `PROGRESS.md` (wave plan; orchestrator is sole writer) · `LEDGER.md`
- `slices/<code>/SPEC.md` — **FROZEN** verbatim task text, goal-line-cited. No agent edits it.
- `slices/<code>/PLAN.md` — lane stages + the SPEC→DoD trace. Worker fills the evidence column.
- `slices/<code>/PROGRESS.md` — DONE · NEXT · TRIED AND FAILED · WORKED. Orchestrator only.
- `slices/<code>/DECISIONS.md` — pointer lines upstream. Rulings are never duplicated.
- `board/<TICKET>.md` — typed ticket state. **Seats never write board files** (D1).
- `packets/<seat>.md` — your dispatch. The packet is law; execute exactly it.
- `agent-reports/<seat>.md` — your report, marker on line 1. `<seat>-self.md` — self-report.
- `tools/board-lint.sh` — risk-tier and contract floor check.

## Global definition of done

Quoted **once**, verbatim, in `slices/S12-closure/SPEC.md` (goal lines 28–41), together
with the Scope law (22–26), the seven confirm-items (42–66) and the Non-goals (321–331).
Cited everywhere else — never re-quoted, so it cannot drift. Read it before you claim done.

## Standing laws — by name; the text is in the spine and the router

**Router §2** (`.claude/skills/heartbeat-protocol/SKILL.md`): no reviewing your own
homework · a finding is a finding (blocking or not, every one gets a ticket and a fix) ·
three rework rounds then it is V's · the board is the state · reproduce first (RED before
GREEN, every round) · verbatim means verbatim · say what you cannot do.
**Never:** push without V · merge · mark Done from a non-verifier seat · delete product or
database data · fabricate runtime data · reveal secrets · cross your file contract ·
sub-delegate unless your packet grants it.
**Superpowers is mandatory and the whole library is open to every seat** — load
`superpowers:using-superpowers` first. `brainstorming` is WAIVED for the requirements seat
by D7: against a frozen spec, creativity is a defect.
**Three-run law** (requirements contract §3): a cluster's verification runs three times and
the WORST run is the verdict. Green-green-red is RED.

## Marker vocabulary — first line of your report, with its cursor

`CLAIM` · `HEARTBEAT` · `BLOCKED` · `READY FOR PEER REVIEW` · `READY FOR HERMES STAGE
REVIEW` (≙ ready-for-judge, per D1) · `REWORK READY FOR REVIEW` · `FULLY DONE` — each
carrying `comments read through: <cursor>`. The orchestrator mirrors your marker into the
ticket; you never touch the board. Only the spine's FULLY DONE condition ends a goal.
