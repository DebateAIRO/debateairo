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

## RW2 — range shape, not boundary provenance

- Root cause: AM2 changed where the endpoint came from but kept the prefix shape; a two-interval region cannot be represented by `line <= lastEnd`.
- Price: one additional review round, four old-guard GREEN reproductions, five range-guard RED runs, two neighbor runs, and repeated byte-for-byte restores of the 4,119-line stylesheet; the extra M6 pair reconciled the packet's “old position” shorthand with the reviewer's exact line-150 record.
- M4 and M5 proved both holes around the token blocks were live: literals at the inter-block gap and banner stayed 13/13 GREEN before AM3, then failed at exact lines 73 and 4.
- M6 was the decisive class member: moving Chamber to EOF is legal CSS, yet the prefix guard expanded to nearly the whole stylesheet; the exact line-150 replay stayed 13/13 GREEN before AM3 and became 1 failed / 12 passed after it.
- The retained M2 probe failed at exact line 150 under the new logic, so fixing the two holes did not reopen the original below-region defect.
- The non-colour declaration below the blocks and benign comment between them each stayed GREEN, showing the guard responds to colour debt rather than harmless boundary movement.
- I nearly installed the new helper after reproducing only M4; doing so would have left M5/M6 without the required proof that the *current* acceptance was green, so all three old-guard runs were completed first.
- The dead end is now explicit: no better endpoint or later syntax-derived boundary can repair a prefix guard; membership must preserve both starts and both ends.
- The verbatim AM3 helper produces real-tree ranges `5,72,74,114`, and an independent four-file scan reports `hits=0`.
- Transient CSS discipline was checked by SHA-256 after every mutation family; the final `globals.css` hash equals the pre-RW2 hash `f0d290245b3d385fcef478c81c31b6c6aa7ccf4cb3fbe557cfdf6aa4cb78b631`.
- Root-canonical TypeScript remains a distinct gate: compiler 7.0.2 reports only the two named baselines and zero filtered errors; running from `apps/ui` would answer a different question.
- One-prompt upgrade: generate the shell oracle and Vitest guard from one executable range-membership fixture, with banner/gap/relocation hostile cases run when an ADR changes.
- Packet quality was high: it named the exact property, three reviewer mutants, two specificity controls, cwd-sensitive compile gate, restore law, and the only intended net test-file change.
