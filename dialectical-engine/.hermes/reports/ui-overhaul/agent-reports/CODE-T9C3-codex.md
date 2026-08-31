# CODE-T9C3 case file — Terracotta / Chamber token contract

## Cause of death

- The old UI mixed palette declarations with component-level colour literals, so changing a root marker could never produce a complete mode switch.
- Typography also depended on the prior Source Serif / Hanken pairing, while persistence had no pre-paint reader; together these made the visible contract and the first painted frame disagree.
- The repair centralizes the ratified values, removes owned literals below the token region, and makes `html[data-mode]` the live source of truth.

## Evidence that mattered

- The first focused RED was genuine: 6 of 11 tests failed while all 5 standing keyboard-accessibility tests stayed green.
- Palette, toggle, guard, and literal-sweep mutants each turned their owning property test red; an unrelated 34px-to-35px spacing mutant stayed 6/6 green.
- A broader three-to-eight-digit hex sweep found one `#fff`-class remnant that the six-digit mission oracle could not see; fixing the class of defect was more useful than satisfying only the literal command.
- jsdom canonicalizes whitespace inside custom properties, so the first GREEN attempt exposed a test-harness lexical comparison bug rather than a product defect; canonicalizing insignificant whitespace fixed the assertion without relaxing values.

## Prices and dead ends

- The earlier AF-1 packet contradiction was correctly stopped in preflight; the board/trap record attributes roughly 175k tokens and one failed attempt to that packet defect before authority epoch 2 repaired the scope.
- This seat still had to read a 2,006-line spine plus overlapping Claude/Codex adapters and skill copies; version labels drift between 3.0, 3.1, and 3.3 even though the normative rules are compatible. That cost was real but not metered in this session.
- Bulk literal conversion through patch generation took three attempts: one unsafe cleanup form was rejected, then two diff formats did not match `apply_patch`; a mission-owned codemod would remove this avoidable friction.
- The sweep mutation patch initially landed on `.topBarTitle` instead of `.modeToggle`; it remained a valid oracle mutant, but it is a reminder to anchor temporary edits with selector context and verify the exact changed line.
- Root `tsc` sees runtime jsdom/React from the UI workspace but not their declaration packages; narrow import annotations were required because package edits were out of contract.

## Upgrade path toward a one-prompt machine

- Generate CSS token blocks, exact-value fixtures, and contrast rows from one checked structured token artifact instead of duplicating inventories across Markdown, CSS, and tests.
- Add a pre-dispatch validator that runs the exact scope oracle, verifies its exclusion boundary, and checks that the allowed-file list can satisfy every acceptance command; authority epoch 2 shows this validation pays for itself.
- Ship a standard token-migration codemod and a typed jsdom stylesheet harness so coding seats spend tokens on semantic decisions, not regex replacement and module-declaration plumbing.
- Keep the packet's explicit RED/GREEN commands, mutation properties, and standing-test requirement: those were unusually clear and made the implementation deterministic.
- The tooling-trap appendix could not be amended because it is outside this packet's write allowlist; the orchestrator should promote the patch-format and root/workspace typing observations if they recur.

## RW1 — what the blind review taught

- The blocking compiler failure came from a contract that was exact but uncompiled: root `typecheck` excludes `apps/ui`, so exact ADR conformance and a green root compiler still left React 19 product code red.
- Price: one independent-review round and four worker findings; the code correction itself was one type-only import.
- The original refutation set mutated values. M1 and M3 showed that position and presence are separate bug classes; a value-heavy mutation suite cannot stand in for move/remove mutants.
- M1 moved the intact guard after children and stayed 11/11 green; the new head-boundary assertion made the same tree 1 red / 11 green before the move was reverted.
- M2 proved the 199-line window was a positional constant, not a token-region definition: a magenta rule at line 151 stayed green until the syntax-derived line-114 boundary replaced it.
- M3 removed only the root hydration suppression and stayed green; the new tag-scoped assertion made it red without confusing the body attribute for the html attribute.
- The three neighboring probes stayed green: body child order, a non-colour declaration below the boundary, and the html language value are not frozen by these assertions.
- The RW1 packet was unusually executable: every mutant, expected failure mode, allowed file, and baseline compiler diagnostic was concrete and re-measured before dispatch.
- One acceptance-instrument defect remains outside product code: the verbatim filtered compiler pipeline reports `tee: /dev/stderr: Operation not permitted` here while still printing `0`; capture-first filtering independently proved the true filtered count is zero.
- `rg` also disappeared from this shell PATH exactly as the tooling-traps file predicts, so the syntax-bound oracle used its documented grep fallback and still measured boundary 114 / residual 0.
- The direct Superpowers skill bodies were readable even though they were absent from this turn's invokable skill catalog; the adapter's markdown fallback prevented a false skills-floor shortfall.
- One-prompt upgrade: compile every published TS/TSX contract under the owning workspace tsconfig during ADR authoring, and require move/remove mutants whenever an acceptance says “inside”, “before”, “after”, or “on this element”.
- The tooling-trap appendix is again outside the rework allowlist, so the new `/dev/stderr` behavior is recorded here for Hermes to promote rather than written across the contract.
