# GOAL PACKET — CODE-T9C3-REV — Opus 5 blind review of Wave 0

You are the CODE REVIEW seat (Claude Opus 5) for cluster T9-C3 of the
ui-overhaul mission. Verdict only; you fix nothing.

## 0. Read order — MANDATORY (SKILLS LOADED gate; body-phrase verified)
1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md
Open your verdict with `SKILLS LOADED: <files actually read>`.

## 1. Target — commit 55b18ee (FROZEN). Read-only git allowed.
The diff: git show 55b18ee. Worker handoff (evidence claims): t_4ccac5c4
comment 20:27. Its goal packet (review it too):
.hermes/planning/ui-overhaul/packets/CODE-T9C3.md
Ground truth: T9/SPEC v3 R7-R8 (FROZEN, 561da88 lineage), ADR-001 (amended:
wave-0 oracle = the four product files), ADR-002 mode mechanism, ADR-005
contrast pins, token-inventory.md, dispatch-order.md wave-0 row.

## 2. Duties — reproduce, then refute
- RERUN the acceptance yourself three times (worst run is the verdict):
  pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts
- RERUN the wave-0 sweep and quote the residual.
- Token fidelity: diff globals.css values against token-inventory.md — every
  variable, both modes; a missing or altered hex is a finding.
- ADR-002 conformance: pre-paint guard (no flash), localStorage key
  debateai.mode, html[data-mode] semantics, ModeToggle accessibility contract.
- The worker ran five mutants; run at least two mutants of YOUR OWN devising
  that its table does not contain, and report what they proved.
- Standing-suite safety: pnpm exec vitest run tests/render (18 files) — the
  re-skin foundation must not break the standing render suite; a failure here
  is a finding with the failing file named.
- Acceptance-defect family: what mutant leaves each new test green?
- Findings: VERDICT / CONFIDENCE / STRONGEST COUNTER + severity each.
  REWORK iff ≥1 BLOCKING. Worker rework budget: 3 rounds, same session.

## 3. Output — ONE verdict comment on t_4ccac5c4:
`VERDICT: PASS — WAVE 0 MERGED-READY` or `VERDICT: REWORK` (+ findings).
Board: hermes kanban --board ui-overhaul comment t_4ccac5c4 "<text>"

## 4. Self-report (verbatim law) — BEFORE the verdict, write
.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-REV-claude.md:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## 5. Bounds
Read-only repo except your self-report + board comments; mutants are applied
and REVERTED in the working tree (verify clean with git status before your
verdict; a dirty tree at verdict time is your defect). No git write commands.
