# FIX-S01-p2 — murder-case self-report

Question from V (verbatim): treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Disposition

The six assigned findings are addressed in commit `9ddbb1efa9f6f3ff12e586e378e770bfb035c13e` on `slice/tiers-s01`. Free-tier controls now use one mechanism end to end: native `disabled` in the page, matching `:disabled` selectors in the stylesheet, and contract tests that pin native behavior for every control family. The lane was clean immediately after commit.

## Cause of death

The prior fix split one ratified interaction contract into three partially independent mechanisms: `aria-disabled` for semantics, React guards for state, and inline paint for appearance. The stylesheet still described native `:disabled`. Tests accepted the layers separately, so no assertion proved that the page, stylesheet, and contract converged on the same mechanism.

Three gaps let that split survive:

1. Render tests counted locked controls without proving the native `disabled` property across all 14 Free controls.
2. Slider geometry covered `maxTokens` but did not pin the other three `SliderRow` grids.
3. Model-colour coverage used synthetic IDs without running the classifier against every real Free roster ID and the alternate IDs cited by review.

The select-specific cursor rule also retained `pointer`, overriding the grouped disabled cursor contract through selector specificity.

## Cost ledger

- Wall time from claim to clean commit: 31 minutes 10 seconds, from 06:01:15 to 06:32:25 EEST.
- Exact model-token consumption was not exposed to this seat.
- The mandatory three-run cluster protocol executed 51 suite invocations: six suites in C3 and eleven suites in C4, repeated three times.
- Reading the complete 9,045-line stylesheet, as the packet required, was a large fixed context cost even though the authorized change was confined to the S01 block near line 6264.
- The reviewer seam test consumed four harness attempts. Vitest rejected the external-root test each time before collection, so those runs were classified BROKEN rather than RED or GREEN.
- One initial source lookup used a package path relative to the wrong repository root and had to be corrected.
- One first GREEN attempt exposed a jsdom artifact: manually dispatching a click on a disabled element bypasses the browser activation suppression that a trusted click supplies. The test was rewritten to measure focus rejection and unchanged state without reintroducing React guards.

## Nearly wrong turns

- Reintroducing React event guards after the jsdom click failure would have violated V-24 by recreating a second lock mechanism. Root-cause analysis prevented that regression.
- Treating a style-test failure after deleting the shared selector block as sufficient product evidence would have missed that render behavior remained green.
- Running the supplied shell probe directly would have mutated the reviewer worktree because it hard-coded that path. All mutants were reproduced in this lane and restored with `apply_patch`.
- Calling the external seam probe GREEN after re-deriving its assertions locally would have overstated the evidence. Its harness result remains BROKEN and is reported as such.

## Dead ends and missing evidence

- The exact reviewer Vitest file could not be collected from its external absolute path under the lane configuration after four bounded attempts. The official render and style suites now contain the same contract checks, and those checks were shown RED before implementation and GREEN after implementation, but the exact external file is still BROKEN.
- No trusted Chrome/WebKit click or two-theme visual pass was run. jsdom verifies native properties, focus rejection, state stability, and descriptions; browser rendering remains an independent review item.
- Whole-repository `pnpm typecheck` remains red only on inherited paths outside the four-file write scope. Filtered output contains no authorized-path diagnostics.

## Packet defects

- The phrase “exactly four write files” conflicts literally with the separately required fifth write, this self-report. The seat treated the four as the commit surface and the report as an external protocol artifact.
- The supplied reviewer probes hard-code another worktree and encode the pre-ruling mechanism. A literal RED-to-GREEN execution in this lane is therefore unavailable. Future probes should resolve the current repository root and accept the oracle-selected mechanism as data.
- The package source path is ambiguous without an explicit repository root. Packet paths should be absolute or explicitly lane-relative.
- Requiring a full stylesheet read when only one named block is writable consumes context without increasing local certainty. A generated block digest plus the writable range would preserve tamper evidence at lower cost.

## Upgrades toward a one-prompt machine

### 1. Generate a control-family conformance matrix

**VERDICT:** ACCEPT. **CONFIDENCE:** high. **STRONGEST COUNTER:** generated assertions can hide omissions when their input inventory is stale.

Define each governed control once with component family, tier state, native attribute, selector, expected count, description, and grid. Generate the page-contract cases and CSS-contract cases from that inventory, while retaining one hand-authored audit that proves the inventory equals the rendered roster.

### 2. Make review probes lane-relative and oracle-parameterized

**VERDICT:** ACCEPT. **CONFIDENCE:** high. **STRONGEST COUNTER:** parameterization can make a probe too permissive unless the packet signs the expected oracle value.

Every probe should derive the lane root from `git rev-parse --show-toplevel`, refuse a dirty pre-state, record its mutant, restore via a trap, and take the signed oracle row as an immutable input. This removes worktree coupling and makes exact reproduction possible.

### 3. Add a preflight packet checker

**VERDICT:** ACCEPT. **CONFIDENCE:** high. **STRONGEST COUNTER:** a syntactically valid packet can still carry the wrong product judgment.

Before dispatch, validate that every named file exists in the target lane, every line range is in bounds, write-surface counts agree with required artifacts, probe paths do not target another worktree, and every finding maps to an executable acceptance criterion.

### 4. Separate mandatory invariant verification from inherited-failure census

**VERDICT:** ACCEPT. **CONFIDENCE:** medium-high. **STRONGEST COUNTER:** narrower commands can miss cross-cluster regressions.

Keep one full cluster run for integration evidence, then use deterministic repeated runs only for the changed invariant pairs unless the full run differs. This would preserve regression detection while avoiding 51 identical suite invocations when the pair counts and inherited failures are stable.

### 5. Add a real-browser native-lock probe

**VERDICT:** ACCEPT. **CONFIDENCE:** high. **STRONGEST COUNTER:** browser startup adds time and platform variance.

A compact Playwright contract should attempt trusted pointer and keyboard activation, verify focus rejection where the platform defines it, and capture computed disabled styling in both themes. This closes the exact gap that jsdom cannot prove and prevents future React guards from masquerading as native behavior.

### 6. Emit machine-readable evidence alongside the prose handoff

**VERDICT:** ACCEPT. **CONFIDENCE:** medium-high. **STRONGEST COUNTER:** another artifact can drift unless it is generated from the same run records.

Have the harness emit JSON containing claim SHA, mutant RED results, final pair counts, cluster attempts, inherited failure identities, typecheck path filtering, commit SHA, and dirty count. Generate the eight-line human handoff from that JSON so a single prompt cannot omit or contradict evidence.
