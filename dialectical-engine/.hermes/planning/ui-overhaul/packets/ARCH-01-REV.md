# GOAL PACKET — ARCH-01-REV — Grok blind review of the architecture

You are the REVIEW seat (Grok) for the ARCH-01 architecture of the
**ui-overhaul** mission. Verdict only; you fix nothing.

## 0. Read order — MANDATORY (SKILLS LOADED gate; body-phrase verified)
1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.grok/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-reviewer/SKILL.md
Open your verdict with `SKILLS LOADED: <files actually read>`.

## 1. Target — commit f75b7e1 (FROZEN; seat exited before it was cut)
Review: docs/missions/ui-overhaul/architecture/** (12 files), the HOW fills in
slices/*/PLAN.md, the 41 new DECISIONS rows, AND the orchestrator's packet
.hermes/planning/ui-overhaul/packets/ARCH-01.md (you review the packet too).
Read-only git allowed (git show/diff). Ground truth: frozen SPECs at 561da88
(v2/v3), the design exports, apps/ui/** and tests/** as they exist.

## 2. Duties
- PROBE, don't trust: the seat could not run product tests (its §4 ban), so its
  cluster commands are colour-unverified. You MAY run read-only probes:
  resolve 3+ sampled cluster commands (files exist, vitest resolves), check the
  token inventory's hex values against the design exports, recount the "12 of
  78 pins test web/" claim, verify the 26 contrast rows for at least 4 samples
  (any WCAG calculator method), and confirm serial chains (LoginFlow.tsx etc.)
  by grepping imports.
- Trace: every SPEC requirement (R-rows) reaches at least one PLAN step with a
  runnable command; every PLAN HOW names real files (spot-check 10 paths).
- The 6 ARCH-closed questions: verify each closure cites evidence and genuinely
  needs no V (a closure that changes scope is a finding).
- Acceptance-defect family: what mutant leaves each sampled command green?
- Findings format: VERDICT / CONFIDENCE / STRONGEST COUNTER + severity per
  finding. REWORK iff ≥1 BLOCKING. Max 3 rework rounds; round 4 = V packet.

## 3. Output — ONE verdict comment on t_0df178c4, copy on t_09a09884.
Open with SKILLS LOADED, then `VERDICT: PASS — ARCHITECTURE FROZEN` or
`VERDICT: REWORK`. Board mechanics: hermes kanban --board ui-overhaul comment
t_0df178c4 "<text>" (flags literally; prove access EARLY with a claim comment).

## 4. Self-report (verbatim law) — BEFORE the verdict, write
.hermes/reports/ui-overhaul/agent-reports/ARCH-01-REV-grok.md:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## 5. Bounds
Read-only repo except your self-report + board comments. No edits to reviewed
artifacts. No git write commands. Rework rounds: max 3. Return control after
the verdict posts; keep the session resumable.
