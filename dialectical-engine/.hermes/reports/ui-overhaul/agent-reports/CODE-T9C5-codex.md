# CODE-T9C5 case file

- Outcome: the five-case `pda-s03` audit found no stale anchor; the product test remains byte-identical at SHA-256 `6a74e4aed4fe2eac1402b8fb4677b595ea8658b4dd2939f744e71534e6b7c06e`.
- The main process defect was PD12: the packet promised an epoch-16 authorization marker that the card did not contain, while the card also had no assignee or typed state.
- Price: one blocked seat cycle, one extra full preflight/comment scan, and one human/orchestrator resume; no product or test edits escaped that cycle.
- The block was necessary: `.hermes/TOOLING-TRAPS.md` records the same unassigned-card failure from T9-C3, so proceeding would have repeated a known authorization breach.
- Improvement: dispatch should read the exact card back after assign+authorize and compare the named session/epoch before launching the CLI.
- Near-miss: treating DECISIONS' “4 of 4” as a raw direct-reader count would have been false.
- The measured current inventory also contains pre-mission `tests/render/auth-flow-integration.test.tsx`, which imports T9-C2's auth components.
- That fifth direct reader is an auth-state-machine pin owned by T9-C2/T7/T8, not an R9 OLD home/landing pin or a T9-C5 row-6 residual; the distinction belongs in future tables.
- Improvement: publish two columns—raw readers and migration owners—instead of compressing both ideas into “pin list”.
- A first exact-path grep missed `v2ui-pages.test.ts` because it reads `source("app/globals.css")` through a helper rather than spelling the full path.
- Price: one additional helper-aware grep pass; this is the dead end future audits should avoid by scanning helper arguments as well as full paths.
- Runtime instrumentation proved all four signed-in parameterized renders contain 0 landing markers and the anonymous render contains 5; it was reverted to the original test hash.
- The route-split mutant made only the anonymous case RED (1 failed / 4 passed), proving the migrated case is live rather than ceremonial.
- Product restoration returned `apps/ui/app/page.tsx` to SHA-256 `38d754166135be9233cf311dcae7b3a72fdcd3e25d50950dfa2a483192c368b6`.
- Three exact row-6 runs each reported 4 files / 54 tests passed; root `pnpm run typecheck` exited 0.
- No new tooling trap was discovered: absent `rg` and the no-git restore constraints were already documented, so TOOLING-TRAPS needed no duplicate entry.
