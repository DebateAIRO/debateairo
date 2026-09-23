# T1B REVIEW — codex gpt-5.6-sol, xhigh, static only

You review the V-authorized micro-ticket replacing T1's line-scoped depth-ceiling oracle. You
filed the finding it closes (T1-codex-r3 B1). You are not the author. This is NOT a fourth round
of T1: T1's product is frozen and only the ORACLE changed.

| what | value |
|---|---|
| lane worktree | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1` · branch `lane/t1` |
| filed tip | `ad44f507` · RED taken at its parent `7828d220` |
| integration merged in | `19bbb4c4` — **102 commits**, the largest catch-up in the mission |
| worker report | `<mission>/agent-reports/t01-depth.md`, T1B section APPENDED; the r3 body is untouched and its declared hash `b7c8c7f5…` still reproduces over lines 3–437 |
| mission dir | `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop` |

Outputs, nothing else writable: `<mission>/agent-reports/T1-codex-t1b.md` (first line
`CODEX REVIEW T1B — <VERDICT> · comments read through: t1b-2026-09-03`) and
`<mission>/agent-reports/T1-codex-self.md`.

## Claims to verify, not assume
- **The three evasions you reproduced are now RED-then-GREEN**, each with its own pair: E1
  multiline Zod chain, E2 split refinement, E3 multiline `[1,2,3,4,5]`. All three RED frames read
  `expected [] to not deeply equal []` — the oracle returned NO site, reproducing your own result.
- **The fix is strictly ADDITIVE.** Predicates and the owning-declaration exemption are
  byte-unchanged; the fault was the UNIT. `duplicateBoundSites` is now the union of the r3 line
  scan and a lexer-driven declaration-unit scan. Verify it is genuinely additive and cannot
  narrow what r3 caught.
- **The 102-commit merge:** one conflict (runner import block), resolved keeping both intents. The
  seat checked the auto-merges BY MEANING rather than by absence of markers: for all three
  overlapping files, `diff(base,lane) == diff(integration,merged)` AND
  `diff(base,integration) == diff(lane,merged)`, both directions. Judge whether that check is
  sound and sufficient.
- **Refutation:** m1 (revert to the line scan) kills exactly the 4 layout controls; m2 (drop the
  `&&` boundary) kills 3 including both real-tree assertions; m4 (a real multiline duplicate
  PLANTED in `packages/contract/src/index.ts`) is caught; m3 neighbour survives. The causal claim
  is generated: with m4 applied the line scan reports 1 site and the unit scan reports 2.
- **D56 applied to its own oracle, and this is the part to weigh.** The seat ran FOUR defeat
  inputs through the shipped code path and DISCLOSED all four as undetected: constant indirection,
  arithmetic and hex spellings of the ceiling, and a bound split across `&&`. It states the last
  is the price of removing a false positive it measured at `apps/ui/app/new/page.tsx:75`.
  **Decide whether the residual blind spots are acceptable for a guard of this kind, or whether
  any of them is as ordinary as the three you originally found.**
- Suites: S1-1 cluster 36/36 in 3 of 3 runs at tip; typecheck 0 errors; wide
  `tests/unit`+`tests/architecture` worst run `14 failed / 1431`, with runs 1 and 3 at
  `13 failed / 1431` — exactly the known-red seed.
- **F-T1B-1, filed by the seat:** across six runs the 14th failing name ROTATED between two tests
  (registration RSS, obs-L2 S05 Tier-0); both pass 3/3 in isolation and neither file is in the
  diff. Its point: a single suite run cannot distinguish "this lane broke something" from "the
  suite flaked." Assess whether the worst-run verdict is honest here.
- **F-T1B-2:** an existing assertion pins line `:112` and will break loudly for the next lane that
  inserts above it. Named, not fixed, because it is T1's frozen product.
- **Diff surface is 11 files, not 10:** the seat appended three tooling traps to
  `.hermes/TOOLING-TRAPS.md` per worker contract §6, and that commit moved the tip and forced a
  full re-run of every gate.
- `systematic-debugging` was NOT loaded and the seat says so rather than claiming it.

## Questions
1. Does the new oracle catch all three evasions without narrowing anything r3 caught?
2. Is the merge-by-meaning check sound, and did the 102-commit catch-up weaken any landed assertion?
3. Are the four disclosed blind spots acceptable, or is one of them a finding?
4. Is the rotating 14th failure honestly handled?
5. Fit to merge?

## Rules
Static only — no tests, builds, installs, provider calls, or mutating git. `passed/total`
verbatim. Every finding gets a ticket; non-blocking changes WHEN, never WHETHER. CANNOT-ASSESS
where you cannot assess. End with `## PREDICTIONS`.
