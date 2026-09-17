# FIX-S02-p1-F3 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the guard discarded the control-flow relationship at every newline

**CAUSE.** `tests/architecture/tiers-s02-rosters.test.ts:68-70` classified one line at a time and required both tier words on that same line. The predicate therefore measured typography, not the R2 relationship “a tier conditional selects `PLAN_TIER_ROSTERS`.” A wrapped ternary (M9b), a multi-line `switch` (M15), and a two-statement initialization plus `if` (M6) all preserved the forbidden relationship while removing the one-line signature.

**PRICE.** Three pre-fix mutant runs demonstrated the false GREEN, three post-fix runs demonstrated the added roster-guard failure, and one copy-only neighbor run proved the new predicate does not condemn a tier conditional that selects no roster. Those seven runs took about eight seconds of compute and seven tool turns; transcript tokens are not exposed by this harness. There were zero implementation retries.

**NEAR MISS.** A file-wide predicate (“this file contains a tier conditional and a roster access”) would have caught the three supplied mutants but recreated the product lens’s false-positive class whenever unrelated copy branching and the correct dynamic roster lookup coexist in one file.

**DEAD END.** Expanding the old line predicate to a multi-line regex still treats source layout as semantics and gives no bounded `if` or `switch` body. The fixed scanner instead matches delimiters, limits each control-flow body, and requires a roster access inside that body; ternaries are bounded to their statement.

**UPGRADE.** Generate architecture guards from explicit positive and neighboring-negative mutant fixtures, and require the packet to name the semantic relation each scanner must preserve. VERDICT: make positive/negative refutations inputs to guard generation / CONFIDENCE: high / STRONGEST COUNTER: a real TypeScript AST would express control flow more precisely, but the root package’s compiler API is not a stable dependency for this test and would widen the slice.

## Finding 2 — a file-set requirement was encoded as a line-address requirement

**CAUSE.** `sourceLinesContaining` returned `path:line` and case 2 asserted those absolute values. SPEC R1 constrains the set of files containing each model id; it does not make landing-copy line numbers part of the product contract.

**PRICE.** M14 required one pre-fix run, one post-fix run, two byte restores, and two status reconciliations. The pre-fix cluster moved from the pinned `3 failed | 6 passed (9)` to `4 failed | 5 passed (9)` solely because one comment line was inserted. The post-fix cluster stayed at `3 failed | 6 passed (9)`. Compute was about two seconds; transcript tokens are not exposed.

**NEAR MISS.** Keeping a line pin for `packages/contract/src/plan-tiers.ts` would still encode an unrequested location and leave the same class alive in the declaration file.

**DEAD END.** Updating `cards.ts:27/:28` to the shifted values would only move the tripwire and make the next harmless insertion fail again.

**UPGRADE.** Packet generation should distinguish set membership, occurrence count, and source address as separate assertion shapes. VERDICT: derive the assertion shape from the requirement noun (“file”) / CONFIDENCE: high / STRONGEST COUNTER: line locations are useful diagnostics, so the scanner still reports lines for R2 failures without asserting those lines as expected state.

## Finding 3 — restoration evidence and concurrent dirt use one ambiguous count

**CAUSE.** Charge 3 asks for `git status --porcelain` with zero lines after every restore, while charge 2 explicitly permits sibling-owned dirt and this seat’s own allowed file necessarily remains dirty after the fix. Before editing, all four restores were zero; after editing, restores correctly showed this test plus the sibling integration test, later also the sibling DB file.

**PRICE.** Nine restore checks required manual partitioning of “mutant removed,” “my intended diff,” and “sibling-owned diff.” No product retry followed, but each raw count needed interpretation. Tokens are not exposed; nine status frames are the measurable proxy.

**NEAR MISS.** Treating a nonzero tree-wide count as a failed restore would have invited touching or waiting on the sibling seat’s disjoint files. Treating it as automatically safe would have hidden a surviving mutant.

**DEAD END.** Tree-wide cleanliness cannot be the invariant during concurrent work. Byte comparison against the saved product file is the restoration invariant; path-partitioned status is the ownership invariant.

**UPGRADE.** Generated mutant runners should print a saved-byte comparison for the mutated path and classify status entries against the seat allow-list and sibling deny-list. VERDICT: replace the zero-count requirement with path-partitioned restoration evidence after the first edit / CONFIDENCE: high / STRONGEST COUNTER: a zero tree is simpler to audit, and remains the right pre-edit expectation when no sibling dirt exists.

## Finding 4 — deterministic protocol work still dominates the seat

**CAUSE.** The task required seven named skill bodies plus two mandated references, the packet, COMMON, mission instructions, two oracle extracts, the full decisions ledger, selected review ranges, predecessor artifacts, trap sections, ticket comments, 16 capture-first verification commands, and a hand-built eight-line handoff. Most of that is deterministic assembly rather than guard reasoning.

**PRICE.** Start-to-commit was 10 minutes 38 seconds. Sixteen verification commands produced the evidence set: four pre-fix mutants, one unmutated targeted run, five post-fix refutations including the neighbor, three cluster runs, `run_suites`, the promoted probe, and typecheck. One patch-anchor retry on M14 cost under a minute. Token accounting is not exposed, so read count, command count, and elapsed time are the priced proxies.

**NEAR MISS.** The first M14 patch assumed the file began with an exported type. The failed anchor made no write; reading eight named lines supplied the correct leading comment anchor.

**DEAD END.** Re-running Vitest interactively to recover a frame would violate capture-first evidence and multiply compute. Every quoted frame came from its original unique log.

**UPGRADE.** A seat bootstrap should checksum required reads, fetch the ticket cursor, post CLAIM, materialize allow/deny paths, generate unique-log runners, apply/restore declared mutants with traps, enforce staged-path ownership, and draft evidence tables directly from logs. VERDICT: automate the deterministic shell-and-board layer and reserve model context for property design / CONFIDENCE: high / STRONGEST COUNTER: the bootstrap becomes a gate of its own, so it needs known-good, known-bad, inherited-red, missing-file, and concurrent-dirt fixtures.

## Packet clarity

The packet was precise about the two assigned findings, mutant order, sibling paths, log rules, and commit boundary. The exact unclear point is the collision between §2/charge 3’s tree-wide “0 lines after every restore” and charge 2’s permitted concurrent dirt plus the worker contract’s own dirty allowed file after implementation. The executable wording should be: pre-edit, expect zero unless named sibling dirt exists; post-edit, prove the mutated product path byte-equals its saved copy and enumerate all remaining paths by owner.

## One-prompt-machine proposal

One prompt should compile into a seat manifest with immutable inputs, ordered skill hashes, comment cursor, branch/base, allowed and sibling-denied paths, semantic properties, positive mutants, negative neighbors, expected inherited failures, and verification commands. A single runner can then emit CLAIM, enforce capture-first logs and restoration, reject foreign staging, assemble the three-run worst result, create the self-report skeleton with measured prices, and draft READY. Human judgment remains only where it pays: naming the property, choosing the class boundary, interpreting unexpected evidence, and selecting the minimal fix.

VERDICT: make the packet executable data with pressure-tested runners / CONFIDENCE: high / STRONGEST COUNTER: over-encoding reviewer examples can teach a guard to catch only named mutants, so the semantic property and neighboring-negative fixture must remain first-class fields.
