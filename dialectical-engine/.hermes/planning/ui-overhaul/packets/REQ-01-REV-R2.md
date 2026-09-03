# GOAL PACKET — REQ-01-REV round 2 — verify the rework

You are the REVIEW seat (Claude Opus 5), round-2 verification of the REQ-01
rework for the **ui-overhaul** mission. Your round-1 verdict (13 findings) is at
.hermes/planning/ui-overhaul/logs/REQ-01-REV-claude.log — that was you; hold
yourself to the same bar now.

## 0. SKILLS LOADED gate (same law as round 1)
Read fully; open your verdict with `SKILLS LOADED: <files read>`:
1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md

## 1. Target — commit bc9f301 (FROZEN; the worker exited before it was cut)
Read the artifacts at that commit. Read-only git IS allowed this round
(git show bc9f301:<path>, git diff 6ec2f68..bc9f301 -- <paths>) — the round-1
packet's commit/no-git contradiction (your F2) is fixed as you prescribed.
Scope: docs/missions/ui-overhaul/{INSTRUCTIONS.md,slices/**} and the worker's
handoff comment (board access works this round — verify it early with:
hermes kanban --board ui-overhaul show t_7e83d3fb).

## 2. Duties
- Verify each of YOUR findings F3,F4(a–g),F7,F8,F9,F10,F11,F12,F13 is actually
  fixed at bc9f301 — per finding: FIXED | NOT FIXED | PARTIAL, with file:line.
  The worker's claim ("32/32 clusters have verification commands") is a claim;
  count them yourself.
- Verify V's three rulings are faithfully closed in: app vocabulary EVERYWHERE
  (T9 binding copy translated + mapping table in T9/DECISIONS.md); CTA→auth→New
  debate acceptance is concrete; static placeholders. A ruling half-applied is
  a finding.
- After a fix turns your named mutant red, ask what mutant still leaves it
  green. New findings are allowed and ticketed like any other — but the bar for
  REWORK round 2 is a BLOCKING defect, not polish.
- Do NOT re-litigate style you passed in round 1.

## 3. Output — ONE verdict comment on t_1ac0b5f9 (it is Done; comment anyway),
plus a copy on t_7e83d3fb. Open with SKILLS LOADED, then
`VERDICT: PASS — SPECS FROZEN` or `VERDICT: REWORK ROUND 2`.
Per finding verified: F<n>: FIXED/NOT-FIXED/PARTIAL + one line. Per NEW finding:
the round-1 format (VERDICT/CONFIDENCE/STRONGEST COUNTER + severity).

## 4. Self-report (verbatim law)
Append a round-2 section to .hermes/reports/ui-overhaul/agent-reports/REQ-01-REV-claude.md
BEFORE the verdict comment:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## 5. Bounds
Read-only repo except your self-report + board comments. No edits to artifacts.
No git write commands. Return control after the verdict posts.
