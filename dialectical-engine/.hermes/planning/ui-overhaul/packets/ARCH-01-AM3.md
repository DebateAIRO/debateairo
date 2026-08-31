# ARCH-01-AM3 — micro-amendment 3 (REV2 verdict B2 + N9, ticket t_6cd3cba0)

Same ARCH seat (session bb69b040). Board `ui-overhaul`. The re-review of rework round 1
(verdict 21:55 on t_4ccac5c4) confirmed all four round-1 fixes, then found that YOUR AM2
remedy for the exclusion kept the wrong SHAPE. Two amendments. ARCH docs only.

## 0. Read order
1. This packet.
2. The REV2 verdict: `hermes kanban --board ui-overhaul show t_4ccac5c4` (comment 21:55) —
   B2 and N9 sections, including the reviewer's out-of-tree remedy table.
3. Your `ADR-001-token-surface.md` (the AM2 §(a) filter and tokenBlockBoundary contract) and
   `ADR-006-ui-test-contract.md` (the 0-new gate command).
Open with `SKILLS LOADED: <list>`.

## 1. Amendment A — B2: the exclusion becomes RANGE-PAIR MEMBERSHIP (ADR-001)
Your AM2 fix moved the boundary's SOURCE from a literal to syntax — that closed M2 — but kept
a one-sided prefix (`lineNumber <= boundary` / `$2+0 <= b`). The token region is TWO intervals
(`:root` 5–72, chamber 74–114); a prefix cannot express it. Reviewer mutants, all GREEN on the
frozen tree: M4 (literal in the inter-block gap, line 73), M5 (literal above `:root` in the
banner), and M6 — **the chamber block legally relocated to EOF** (specificity beats source
order per your own ADR-002), which makes the computed boundary 4122 and exempts the ENTIRE
stylesheet from the colour-literal law, silently, for a file with ONE authorized writer all
mission.
**Amend ADR-001 so both consumers exempt a line iff it lies INSIDE one of the two token-block
ranges** (`:root { ... }` and `html[data-mode="chamber"] { ... }`, each found by syntax,
fail-loud if either is missing or unclosed):
- the shell oracle filter in §(a) (and anywhere else it is quoted), and
- the published TS helper contract that `tests/unit/t9-mode-tokens.test.ts` mirrors
  (replacing `tokenBlockBoundary(): number` with a ranges form — the test edit itself is the
  rework worker's, RW2).
The reviewer verified this remedy out-of-tree (CLEAN hits=0; M4 hits=1; M5 hits=1; M6 hits=1)
— your amendment must reproduce that table with YOUR published artifacts, per your own AM2
rule: run everything you publish at real scope, clean + M4 + M5 + M6 fixtures, outputs pasted
into the changelog. Scratch fixtures under /tmp or an untracked path; zero repo writes outside
your allowed files; leave no fixture behind.

## 2. Amendment B — N9: gates pin the INVOCATION DIRECTORY (ADR-006)
This repo carries TWO TypeScript compilers: root pins 7.0.2, apps/ui pins ^5.6.0 → 5.9.3, and
`pnpm exec` resolves the nearest one. Same tsconfig, different compiler, different answer
(TS7 emits TS2882 for the side-effect CSS import; 5.9.3 is silent). The reviewer's round-0
"layout.tsx CLEAN" record fell to exactly this, from inside apps/ui.
**Extend the ADR-006 law:** every acceptance compile gate names the tsconfig AND the
invocation directory (repo root is canonical for the 0-new gate); note the dual-compiler
split and that the TS2882 baseline is load-bearing under the canonical compiler (dropping the
clause makes the gate return 1 — the reviewer verified). TOOLING-TRAPS.md is already updated
by the orchestrator; reference it, do not edit it.

## 3. Bounds
Writes: `docs/missions/ui-overhaul/architecture/ADR-001-token-surface.md`,
`ADR-006-ui-test-contract.md`, dated AM3 changelog entries naming t_4ccac5c4/t_6cd3cba0,
append an "AM3" section to `.hermes/reports/ui-overhaul/agent-reports/ARCH-01-claude.md`,
board comments on t_6cd3cba0. Nothing else. No product code, no tests, no git commands.
Rework rounds: max 3.

## 4. Handoff
Final board comment on t_6cd3cba0 (your LAST write, freeze law):
`AMENDMENT COMPLETE: AM3` + one line per amendment naming file + change, the pasted
verification table (clean/M4/M5/M6), `SKILLS LOADED: <list>`,
`comments read through: <timestamp>`.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
