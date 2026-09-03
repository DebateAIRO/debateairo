# GOAL PACKET — T9-C3 — Wave 0 coding seat (Codex): tokens, fonts, mode

You are the CODING seat for cluster **T9-C3** of the ui-overhaul mission — the
foundation wave. You are the ONLY writer of `apps/ui/app/globals.css` in this
entire mission. Everything downstream consumes what you ship.

## 0. Read order — MANDATORY (SKILLS LOADED gate; body-phrase verified)
1. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/agent-protocols/debateai-heartbeat-protocol.md
2. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-protocol/SKILL.md
3. /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.claude/skills/heartbeat-worker/SKILL.md
Your handoff comment OPENS with `SKILLS LOADED: <files actually read>`.

## 1. The work (all paths relative to repo root, your cwd)
Authoritative sources, read in this order:
- docs/missions/ui-overhaul/architecture/token-inventory.md — the COMPLETE
  variable inventory with hex values for both modes. Ship it verbatim.
- docs/missions/ui-overhaul/architecture/ADR-001-token-surface.md — where
  tokens live, and the 120-literal sweep you must drive to ZERO residuals
  (its sweep command is your acceptance oracle, quoted verbatim).
- docs/missions/ui-overhaul/architecture/ADR-002-mode-mechanism.md — the
  html[data-mode="chamber"] mechanism, localStorage key `debateai.mode`,
  SSR-flash guard, ModeToggle component contract.
- docs/missions/ui-overhaul/architecture/ADR-005-contrast-pins.md — the 26
  contrast rows; tests/support/contrast.ts implements its check.
- docs/missions/ui-overhaul/slices/T9/PLAN.md — cluster T9-C3 rows (SPEC refs
  R7 etc.) and docs/missions/ui-overhaul/slices/T9/SPEC.md (v3, FROZEN — read
  R7/R8 for what the mode toggle must observably do; NEVER edit any SPEC).
- Fonts: Fraunces + Plus Jakarta Sans via next/font in apps/ui/app/layout.tsx
  (JetBrains Mono STAYS — V ratified Q-08).

## 2. File contract (writes allowed — NOTHING else)
apps/ui/app/globals.css · apps/ui/app/layout.tsx ·
apps/ui/components/ModeToggle.tsx · apps/ui/lib/debatePresentation.ts ·
tests/support/contrast.ts · tests/support/tokenContract.ts ·
tests/unit/t9-mode-tokens.test.ts ·
.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-codex.md (self-report) ·
board comments on t_4ccac5c4.
FORBIDDEN: every other file; every SPEC; all git commands; package.json.

## 3. TDD law (spine, mandatory)
RED first: write tests/unit/t9-mode-tokens.test.ts asserting the token
contract + mode flip + contrast rows BEFORE the implementation; run it, capture
the failing output. Then implement to GREEN. Refactor under green only. Your
handoff includes the RED evidence (the failing run's tail) and the GREEN runs.

## 4. Acceptance (the verdict is the WORST of three runs)
pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts tests/unit/pda-s03-keyboard-accessibility.test.ts
Run it three times; all three must pass; paste the worst run's summary line.
ALSO: ADR-001's WAVE-0 ORACLE (the sweep scoped to your four product files,
amended 2026-08-31 after your own preflight block — baseline 113) showing
residual count 0. The global sweep is NOT yours; it belongs to T8-C4.
ALSO: pnpm run typecheck must exit 0 (repo-wide).

## 5. Self-report (verbatim law) — BEFORE your final comment, write
.hermes/reports/ui-overhaul/agent-reports/CODE-T9C3-codex.md:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

## 6. Handoff + freeze
Final comment on t_4ccac5c4 (hermes kanban --board ui-overhaul comment
t_4ccac5c4 "<text>" — flags literally): opens `SKILLS LOADED: …`, then
`READY FOR PEER REVIEW` + RED/GREEN evidence + the three run summaries + sweep
residual line. That comment is your LAST write of any file. The orchestrator
commits; Opus 5 reviews the commit. Rework rounds: max 3, same session.
