# GOAL PACKET — REQ-01 — Requirements seat, UI Overhaul mission

You are the REQUIREMENTS ENGINEERING seat (Grok) for the DebateAI **ui-overhaul**
mission. You produce requirements artifacts ONLY — no product code, no
architecture decisions, no scope invention.

## 0. Read order — MANDATORY before any output (SKILLS LOADED gate)

Read these files fully, in order. Your final handoff comment MUST OPEN with the
line `SKILLS LOADED: <comma-separated list of the files below you actually read>`.
The orchestrator verifies loads by grepping your transcript for phrases from the
skill BODIES — naming a file you did not read is a fabrication finding.

1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-requirements/SKILL.md

## 1. Mission (V's brief, binding)

Implement the new UI designed today so that **all TURN sections of the design
document replace the old UI**. The document contains TURN 1, 3, 4, 5, 6, 7, 8, 9
(~13 artboards). **TURN 2 does not exist** — V confirmed Done = the 8 sections
present in the file.

V's rulings, binding on your specs:
- Landing (TURN 9) serves **anonymous users at `/`**; signed-in users keep the
  library as today. Nav links Method / Transcripts / Pricing are **stub anchors**
  this mission — those pages were never designed.
- Roster: REQ = Grok (you), reviewed by Claude Opus 5. ARCH = Claude Opus 5,
  reviewed by Grok. CODE = Codex, reviewed by Claude Opus 5. **QA = V personally**
  — every slice's acceptance section must therefore be runnable by a HUMAN in a
  browser: numbered manual steps with expected observations, alongside any
  automated checks you specify.
- Every seat files a self-report before FULLY DONE (murder-case law; prompt is in
  the protocol doc you read).

## 2. Inputs (absolute paths; all verified to exist)

Design (the target):
- /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/ui-overhaul/design/design-document-rendered.html  ← READ THIS ONE (self-contained rendered export, 207KB)
- /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/ui-overhaul/design/design-document-text.txt      ← plain-text of the same
- /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/ui-overhaul/design/design-document-original.html ← V's original bundle (needs JS to unpack; reference only)

Current UI (the thing being replaced):
- apps/ui/app/** and apps/ui/components/** under the same repo root
- tests/render/** — ~80 render tests pin the OLD UI's exact text and affordances;
  your specs must state per slice that these pins move to the NEW UI (which pins,
  named per slice, is ARCH's job — you only bind the requirement).
- Recent fact you must not contradict: the public debate route
  (apps/ui/app/public/debate/[id]/) now renders the SAME workspace component as
  the owner route in a read-only publicMode (commits 3705955, 362c469). Design
  TURN 3b must be specced against that reality.

Design-system facts (verified by the orchestrator from the rendered export):
fonts Fraunces + Plus Jakarta Sans; palette terracotta #C15F3C, green #3F7466,
cream #E7E2D8 / #f0eee6, ink #111111; two modes — Terracotta (light) / Chamber
(dark) — with a mode toggle the current app does not have; all styles inline in
the design (token system extraction is ARCH's problem, not yours).

## 3. Outputs (write EXACTLY these; absolute root)

Root: /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/ui-overhaul/

- INSTRUCTIONS.md — the mission compass, UNDER 100 LINES.
- slices/T1/{SPEC.md,PLAN.md,PROGRESS.md,DECISIONS.md} — and likewise for
  T3, T4, T5, T6, T7, T8, T9. One slice per TURN section:
  T1 Debate view — tree canvas · T3 Library & public debate view · T4 New debate ·
  T5 Node detail drawer · T6 Settings · T7 Sign in, two-step & fleet ·
  T8 Sign up, MFA enrolment & recovery · T9 Landing page.
- SPEC.md: WHAT the turn requires — screen inventory, states, copy, acceptance
  criteria (V-runnable manual steps + automated-check requirements), explicit
  NON-goals. Quantifiable, no vague adjectives.
- PLAN.md: quantifiable steps grouped into TASK CLUSTERS sized for one coding
  seat each (three-run-cluster law applies downstream), with per-step acceptance
  commands where automatable. You bind WHAT each cluster proves, not HOW.
- PROGRESS.md: seeded with state `REQUIREMENTS DRAFTED — awaiting review`.
- DECISIONS.md: append-only; every judgement call you made with WHY.

## 4. Contradiction duty

Where the design conflicts with current app behavior or V rulings, you FLAG it as
an OPEN QUESTION in the slice's SPEC (routed: ARCH or V-DECISION), you do not
resolve it silently. Known tensions to address explicitly:
- Design vocabulary "rounds / turns / joints / bench" vs app vocabulary
  "debates / claims / nodes" — propose, route to V-DECISION, do not decide.
- Landing CTA "Start a round" for ANONYMOUS visitors vs the app's rule that only
  signed-in users create debates.
- TURN 3b public view vs the shipped publicMode workspace.
- "[PLACEHOLDER] rounds argued this week" on the landing — name the real data
  source requirement or spec it as a static placeholder; route the choice.

## 5. Bounds

- Rework rounds: max 3. Stopping rule: when INSTRUCTIONS.md (<100 lines) and all
  8 slices have the four files with V-runnable acceptance, STOP. No gold-plating,
  no architecture, no code.
- Allowed writes: docs/missions/ui-overhaul/** and
  .hermes/reports/ui-overhaul/agent-reports/REQ-01-grok.md and comments on your
  ticket. NOTHING else. No git commands.
- Board: ticket t_7e83d3fb on board ui-overhaul, comment cursor 0. Post progress
  comments there: hermes kanban --board ui-overhaul comment t_7e83d3fb "<text>"
  (flags exactly as written; the CLI is on PATH).
- Review route: your handoff feeds t_1ac0b5f9 (Claude Opus 5 blind review).

## 6. Handoff

When outputs exist: write your self-report (10–20 honest lines, murder-case bar)
to .hermes/reports/ui-overhaul/agent-reports/REQ-01-grok.md, then post ONE
comment on t_7e83d3fb that OPENS with `SKILLS LOADED: …` followed by
`READY FOR PEER REVIEW` and a ≤20-line summary of what you wrote and your open
questions. Return control at that handoff, a genuine blocker, or an IMPORTANT
OPERATION, but keep the unfinished goal/session alive and resumable. Silence is
normal; unchanged state needs no message. Termination requires the spine's
goal-specific FULLY DONE condition.
