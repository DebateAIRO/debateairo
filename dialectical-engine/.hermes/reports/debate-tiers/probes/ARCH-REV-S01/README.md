# probes — ARCH-REV-S01, node ARCH-REV(S01) pass 1 (blind), ticket t_0e278df0

Every probe was written by the REVIEW seat from the CLAIM under test, never copied from the author's
tests. All were run in /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s01/dialectical-engine
at HEAD 7f89f7b7 with `git status --porcelain` = 0 before and after every run.

| file | the claim it attacks | result |
|---|---|---|
| p1-static.sh / .log | the step criteria a stranger must run: S01-24's `useEffect` grep, S01-35's grep, F2's empty region, F3's markers, R11's quoted-exact discriminator, R20-A's 13 literals | reproduced F2/F3/R11/R20-A exactly; found N4 (`grep -c 'useEffect'` = 2, the step says 1) and N9 (22 `:disabled` rules, not one) |
| p2-screens.sh / .log | every factual claim the `## Screens` block hands MOCK(S01): 13 globals.css line citations, the 25-token list, `modelKey`, `ModelPresentation`, `ModeToggle`, `SegmentedRow` | all correct. The token list needed a SECOND measurement — globals.css declares several tokens per line, so a line-anchored grep under-reports (see the self-report §4.1) |
| p3-cluster-c1.sh / .log | PLAN §4's C1 command, verbatim, at base | reproduced: contract 7≠8, api 24≠25, roster BROKEN — the three TDD-RED rows the PLAN declares. generate:contract rc=0, generated/ tree byte-identical before and after |
| p4-css-gate.js / .log | PLAN §8's three C4 detection claims, on known-GOOD and known-BAD input | the two consent guards fire on an end-of-file append and stay green on S01's planned placement (F3 confirmed both ways). **t9's colour-literal case is already red at base (3 hits), so the mutant that adds a 4th does not move the pair — finding N2** |
| p5-readers.sh / .log | ARCH's own F4 class, swept independently over all SIX files S01 writes (F4 swept three) | no standing reader of any S01 write surface is missing from a cluster command. `tests/unit/s14-ui.test.ts` reads the DELETED `web/lib/api`, not `apps/ui/lib/api.ts` |
| p6-newpage-render.test.tsx | F1's remedy: does the `sup-04-widget` idiom render `/new` with the real compiled components? | 5 passed (5). All fourteen R4 ids resolve in the DOM (after expanding OPTIONS), state propagates through `act`, submit reaches `createDebate`. Refutation attempt FAILED — the plan's instrument works |
| p7-typecheck-claim.test.tsx | PLAN:299-301 / §8: "a required type member would take ux01 from 1/8 to 0/8" | `pnpm exec vitest run` does NOT typecheck — a file with `const n: number = "…"` runs green. Finding N5 |
| p8-clusters-c2c3c4.sh / .log | PLAN §4's C2, C3 and C4 commands, verbatim, at base | every existing path matches its expected pair — 34 of 34 rows across all four clusters, zero disagreements |
| p9-trace.js / .log | the reviewer's OWN both-ways SPEC↔PLAN trace parser (built from the two files, not from the §2 table) | 21/21 requirements have a row, 46 steps with no gaps or duplicates, no ghost citations, reverse trace closes. Found S01-42 with no done-criterion — finding N3 |
| probe.vitest.config.ts | the harness that let p6/p7 run at all | `root` = the lane, the five `resolve.alias` entries duplicated, `include` pointed at a gitignored dir inside the lane (`coverage/`), deleted at exit — see verdict §3 P3 |

Verdict: docs/missions/debate-tiers/reviews/ARCH-REV-S01-p1.md
