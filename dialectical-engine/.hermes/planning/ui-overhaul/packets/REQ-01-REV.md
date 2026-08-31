# GOAL PACKET — REQ-01-REV — Blind review of the ui-overhaul requirements

You are the REVIEW seat (Claude Opus 5) for the requirements artifacts of the
**ui-overhaul** mission. You produce a VERDICT; you fix nothing.

## 0. Read order — MANDATORY (SKILLS LOADED gate)

Read fully, in order; your verdict comment MUST OPEN with
`SKILLS LOADED: <the files below you actually read>`. The orchestrator greps your
transcript for skill-BODY phrases — a named-but-unread skill is a fabrication
finding against you.

1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md

## 1. What you review (all at commit 6ec2f68 — review the COMMIT, not the tree)

- docs/missions/ui-overhaul/INSTRUCTIONS.md
- docs/missions/ui-overhaul/slices/{T1,T3,T4,T5,T6,T7,T8,T9}/{SPEC,PLAN,PROGRESS,DECISIONS}.md
- ALSO review the worker's goal packet itself for defects the worker inherited:
  .hermes/planning/ui-overhaul/packets/REQ-01.md (the orchestrator cannot review
  its own packet — you do).

Ground truth to review AGAINST:
- Design: docs/missions/ui-overhaul/design/design-document-rendered.html and
  design-document-text.txt (the target; TURN sections 1,3,4,5,6,7,8,9).
- V rulings (binding): Done = the 8 TURN sections; TURN 2 does not exist.
  Landing = anonymous `/`; signed-in keep library; Method/Transcripts/Pricing
  stub anchors. QA = V personally ⇒ acceptance must be human-runnable browser
  steps. Roster: REQ=Grok→you; ARCH=Claude Opus 5→Grok; CODE=Codex→Opus 5.
- Current app reality: apps/ui/** and tests/render/** (~80 tests pin the OLD UI);
  the public debate route renders the owner workspace in read-only publicMode
  (commits 3705955/362c469) — a spec contradicting that unknowingly is a finding.

## 2. Review duties

- Coverage: every artboard/region/state visible in the design appears in exactly
  one slice's SPEC; flag anything in the design absent from all SPECs, and
  anything specced that is NOT in the design (invention).
- Acceptance quality: each SPEC's acceptance is numbered, V-runnable in a
  browser, with expected observations; each PLAN cluster names WHAT it proves;
  vague adjectives without a measurable check are findings.
- The four OPEN QUESTIONS the worker routed (vocab, anonymous CTA, placeholders,
  T3b composition): verify they are genuinely open (not silently resolved
  elsewhere in the specs) and correctly routed.
- Acceptance-defect family: a check that would return the right answer for a
  reason unrelated to its claimed property is a finding — name what mutant would
  leave it green.
- NARROW vs VACUOUS are different defects; call which one you mean.

## 3. Output — on ticket t_1ac0b5f9, ONE verdict comment

Open with `SKILLS LOADED: …`, then `VERDICT: PASS` or `VERDICT: REWORK`.
Then per finding:
  - FINDING <n> — <one-line defect> · file:line
  - VERDICT / CONFIDENCE / STRONGEST COUNTER (the three lines, every finding)
  - severity: BLOCKING | NON-BLOCKING
REWORK iff ≥1 BLOCKING finding. Max 3 rework rounds exist for the worker;
round 4 does not exist — after that it is a V DECISIONS PACKET row.
Also file every finding as its own comment ON THE WORKER TICKET t_7e83d3fb
(so nothing exists outside the board).

## 4. Bounds

- Read-only on the repo except: .hermes/reports/ui-overhaul/agent-reports/REQ-01-REV-claude.md
  (your self-report, 10–20 honest lines, murder-case bar — file it BEFORE your
  verdict comment) and board comments.
- No git commands. No edits to the artifacts under review.
- Board mechanics: hermes kanban --board ui-overhaul comment t_1ac0b5f9 "<text>"
  (flags literally as written).
- Return control after the verdict posts. Keep the session resumable. Silence is
  normal; unchanged state needs no message.
