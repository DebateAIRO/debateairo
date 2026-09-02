# PACKET REQ-OBS-FINISH — complete the ObservationAgent slice files (mission `observability-agents`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/observability-agents/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/00-intake-H0.md` (read the ROSTER CHANGE and WAVE-1 OUTCOME sections — they explain why this seat exists).

## 1. Ticket state
- **board:** `observability-agents` · **ticket:** `t_1301aef0` · **seat:** REQ-OBS-FINISH · **role:** requirements (`heartbeat-requirements`) · **model:** Fable 5.1 · **rework rounds: max 3**
- **session:** record in your CLAIM comment · **comment cursor at dispatch:** 2 (on `t_3af6affd`: the seat's CLAIM, the orchestrator's TREE MOVED heartbeat, and the orchestrator's SEAT DIED disposition — read all three) · **review route:** REQ-REV-OBS `t_f1236b44` (Codex Sol Max, cross-house)
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/OBS-03/`, `OBS-04/`, `OBS-05/`, `OBS-06/`, `OBS-07/` — each `SPEC.md`, `PLAN.md`, `PROGRESS.md`, `DECISIONS.md`
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/observability-agents/agent-reports/REQ-OBS-FINISH.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only) · comments on `t_1301aef0` and `t_3af6affd` (`--author REQ-OBS-FINISH`)
- **forbidden:** everything else, and specifically: `requirements/observationagent.md` and its compass block (another seat's frozen output — you TRANSCRIBE from it, you never edit it), `slices/OBS-01/` and `OBS-02/` (already written and frozen), every FIX and SUP artifact, all product code, git writes.

## 2. What you are doing, and what you are NOT
The REQ-OBS seat wrote a complete 63 KB requirements file declaring **seven** slices, then was killed by a provider session limit before writing five of the seven slice directories. **You are finishing a frozen specification, not authoring a new one.** Every requirement, latency number, detector, channel, threshold and V-row already exists in `requirements/observationagent.md`; your job is to project it into the per-slice file shape that `heartbeat-requirements` §2 mandates and that ARCH consumes.

**If you find a defect in the frozen requirements — a contradiction, a missing number, a criterion that fails the stranger test — do NOT fix it and do NOT work around it.** Name it in your handoff with `path:line` as a finding; the orchestrator tickets it the same day and the reviewer judges it. Silently repairing another seat's frozen artifact destroys the review trail.

## 3. Upstream artifacts (absolute paths)
1. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/observationagent.md` — the frozen source. §Q7 (line ~172) carries the slice table with per-slice requirement counts: OBS-03 **12**, OBS-04 **8**, OBS-05 **10**, OBS-06 **10**, OBS-07 **11**. Q1–Q6 carry the substance each slice draws on; F1–F8 are its findings; D1–D14 are its V rows.
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/observationagent-compass-block.md` — the one-line V-acceptance sentence for each of OBS-03..07. Those sentences are the seed of each SPEC's acceptance section; expand them into numbered, human-runnable steps, never contradict them.
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/slices/OBS-01/` and `OBS-02/` — **the shape you must match exactly**: read all eight files first and copy their structure, heading set, numbering convention, freeze header, PLAN scaffold layout, PROGRESS skeleton and DECISIONS seeding. A reviewer will diff your five against these two for consistency.
4. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/observability-agents/requirements/fixagent-state-audit.md` §A and §C — measured tree state (what exists, what is red) so no acceptance step assumes a component that is absent.
5. `docs/missions/observability-agents/V-DECISIONS-PACKET.md` — rows V-1..V-6; the requirements file adds D1..D14. A slice blocked on a V row says so in its SPEC rather than guessing.

## 4. The work
For each of OBS-03, OBS-04, OBS-05, OBS-06, OBS-07 write the four files:
- **SPEC.md — FROZEN at creation.** Intent · requirement list numbered `OBS-nn-R01…` with the count from Q7 matched exactly (if the requirements file yields a different number, that is a finding — report it, write what the source supports, and say so in the SPEC's own notes) · states · binding vocabulary/copy · **V-runnable acceptance: numbered steps, each with the exact command or click and the exact expected observation, runnable in the real dev stack** (Postgres `127.0.0.1:55432`, Hatchet `7077/8888`, the dev stack on `:3000`) · out of scope · dependencies on other slices and on V rows.
- **PLAN.md — SCAFFOLD ONLY.** Header, the SPEC-trace table with one row per requirement and EMPTY step cells, the quantifiability law and banned-word list, cluster table headers `OBS-nn-C1…` with EMPTY verification commands. The architecture seat fills the steps; writing them yourself is out of contract.
- **PROGRESS.md** — empty skeleton: DONE / NEXT / TRIED AND FAILED / WORKED.
- **DECISIONS.md** — append-only, seeded with the dispositions that bind this slice (C1 approval-first, C3 standalone, C4 detection ownership, plus any D-row the slice depends on), each as `date · question · choice · reason · who ruled`.

Then write the self-report (COMMON §5).

## 5. Handoff
`READY FOR PEER REVIEW` on `t_1301aef0` and a pointer comment on `t_3af6affd`, OPENING with `SKILLS LOADED: <list>`, then: the five-slice table (code · requirement count declared in Q7 · count written · acceptance-step count) · confirmation that OBS-01/02 and `observationagent.md` are byte-unchanged (`git status --porcelain` proves it) · every defect found in the frozen source, with `path:line` · `comments read through: <n>`. Self-report first. Then stop.

## 6. Stop conditions
COMMON §6. `BLOCKED` only if the frozen requirements do not contain enough substance to write a slice at all — name the slice and the gap.
