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
