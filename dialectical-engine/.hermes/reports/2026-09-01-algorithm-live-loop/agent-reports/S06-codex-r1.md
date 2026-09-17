CODEX REVIEW S06 r1 — CHANGES · comments read through: s06-r1-2026-09-02

VERDICT: REWORK — 3 blocking and 3 non-blocking findings (round r1 of max 3).

The T10 selector and T11 ladder are internally coherent, but the change is not releasable. The production runner entry point never supplies the newly mandatory label controls, preserved legacy rule values are incompatible with the new read/catch-up path, and an existing integration assertion still requires the retired rule.

## Findings

### B1 — The shipped runner never loads or supplies `verdictLabelPolicy`

`apps/runner/src/main.ts:72-100` constructs `WalkingSkeletonRunner` without `verdictLabelPolicy`. Its sole policy reader, `apps/runner/src/dev-runner-policy.ts:18-70`, does not include the four T16 verdict-control rows in its schema or returned policy. At `apps/runner/src/index.ts:2580-2585`, the new path therefore always sees `undefined` and throws `VERDICT_LABEL_CONTROLS_UNRESOLVED`.

Failure case: launch the shipped runner entry point with an otherwise valid sealed deployment and process any work item that reaches served-root selection. The runner spends through judgement/propagation, then stops before writing an answer—not because the register family is absent, but because this caller never reads it. Acceptance (`acceptance/main.ts:413,531`) and test settings (`tests/integration/database.test.ts:155`) do supply the policy, so the focused seam evidence masks the production-caller defect.

Required fix: load the sealed T16 controls in the production policy path, preserve their provenance/version semantics, pass them as `verdictLabelPolicy`, and add a production-entry-point-level assertion that distinguishes a present sealed family from a truly unresolved one.

### B2 — An existing integration test still requires the retired rule

`tests/integration/database.test.ts:2044-2049` asserts that the HYG depth-2 two-maker answer's `UNSERVED-MAKER-POSITION` record has `served_root_rule: "first-configured-provider"`. New production code always records `max-propagated-strength-lexicographic-tiebreak` for that record.

Failure case: run the authoritative integration suite. This test completes a real two-maker runner flow and then deterministically compares the new rule to the retired literal. It must fail even when root selection itself is correct. The filed S06 cluster selected only tests matching `through the production runner` (`s06-selection-label.md:218`), so it did not exercise this consumer. The report's class-sweep claim that the integration consumer was migrated (`s06-selection-label.md:130`) is false for the current file.

Required fix: migrate this assertion to the live rule and retain an assertion that the served subject is derived from recorded strengths rather than provider order.

### B3 — Preserved legacy rows are neither wire-readable nor catch-up-writable

Migration `migrations/0055_t10_served_root_selection.sql:51-59` deliberately uses `NOT VALID`, leaving historical `first-configured-provider` rows intact while refusing that value on new writes. The read model does not preserve that distinction:

- `packages/serve/src/index.ts:1730-1736` types the database value as the new-only `ServedRootRule`, and `packages/serve/src/index.ts:1806-1813` returns it unchanged.
- `packages/contract/src/index.ts:503-510` accepts only `z.literal(SERVED_ROOT_SELECTION_RULE)`; both answer routes parse projections through it at `apps/api/src/index.ts:896-899` and `apps/api/src/index.ts:989-993`.
- DR-184 catch-up copies the historical value at `apps/runner/src/index.ts:851-860`, after which `ServeRepository.persist` inserts it into the new answer version at `packages/serve/src/index.ts:1355-1372` under the new constraint.

Failure cases: reading any pre-0055 multi-maker answer through either API route throws schema validation instead of returning the preserved record; catching up such an answer attempts a new insert containing `first-configured-provider` and the database rejects it. The migration preserves the bytes but the application can no longer lawfully consume them.

Required fix: model historical read values separately from the live write vocabulary, make the public historical-answer contract explicit, and define a lawful catch-up treatment that does not relabel old evidence or copy a retired value into a constrained new row. Add coverage for an actual legacy row through projection, API parse, and catch-up persistence.

### N1 — The edited acceptance ceremony has no filed typecheck evidence

Root `tsconfig.json:26-32` includes only apps, packages, tools, tests, and two root configs. Although `tests/unit/acceptance-dispatcher.test.ts:3` imports `acceptance/main.ts`, no included module imports `acceptance/ceremony.test.ts`. `acceptance/tsconfig.json:1-7` would cover that file, but no S06 log records a compile using it; `root-typecheck-tip.log` only records `root typecheck exit=0`. The statement at `s06-selection-label.md:318-320` that the ceremony “is typechecked only” is therefore unsupported.

Static verdict: CANNOT ASSESS whether the changed ceremony test typechecks. Required fix: file a typecheck whose config includes `acceptance/ceremony.test.ts`, or close it with the binding D15 integration typecheck and name that evidence precisely.

### N2 — Current acceptance documentation still describes provider-order selection

`acceptance/README.md:77-79` says DR-161 selects `first-configured-provider` and that this rule travels on `UNSERVED-MAKER-POSITION`. This is current ceremony/operator guidance, not an archived mission document.

Failure case: an operator diagnosing a two-maker ceremony follows the README and treats the first configured provider as the expected winner, contradicting T10's maximum-propagated-strength rule. Required fix: update the README to describe strength selection, the code-unit node-id tiebreak, and the live recorded rule without converting historical records.

### N3 — One claimed non-discriminating mutant is not recorded in D24 form

The packet claims “2 non-discriminating RECORDED” and requires assessment of both (`packets/s06-codex-r1.md:77-80`). `logs/s06/refutation-d24.log:437-534` records `M8`/`M8prime` with mutation, result, restoration, and hashes. The first ladder-order mutant described at `s06-selection-label.md:195-202` and `s06-selection-label-self.md:50-68` has no corresponding D24 block in that log; the only ladder-order blocks are caught `M4` and `M4b`.

Static verdict: CANNOT ASSESS the claim that the omitted ladder mutant was semantically equivalent rather than exposing a weak test. Required fix: file its complete D24 transcript or reduce the packet/report claim to one recorded non-discriminating mutant. This does not invalidate the recorded `M8` diagnosis or the caught-mutant blocks inspected.

## Static verification record

- Reviewed the packet, rulings, SPEC, ticket, dispatch packet, worker report/self-report, full base-to-tip diff, and all named S06 logs. No product test, build, install, provider call, or mutating Git command was run by this reviewer.
- Static metadata matches the packet: base `7433be75`, tip `3665302a`, 20 files, `+1549/-51`, two product commits plus one mode-only commit, and zero residual mode changes. The worker report's content hash recomputes to the filed `44afa91d…` value.
- The recorded baseline seam RED is behavioral: it shows the weaker first-configured root and retired rule rather than a compile-only failure.
- The T10 comparator uses code-unit ordering; runner-up and single-candidate margin arms are explicit; selection and control absence stop loudly. The T11 implementation follows rungs 0-4 in SPEC order, validates NaN/cut ordering, reads winning-root dispersion, and computes before composition.
- The canonical mark insertion, enum/record consumers, three count-pin changes, and exactly one forced UI and web line are present. The selection receipt and migration 0055 schema mirror are present.
- Recorded D14 UI/web pairs are byte-identical after excluding the TIP-only evidence header. Recorded zone failure-name sets are identical. The three cluster records contain the reported repeated counts. These are author-produced records, not independent executions.
- Packet/output paths and marker requirements are valid. The only packet defect found is N3's unsupported count of fully recorded non-discriminating mutants.

## PREDICTIONS

Another focused reviewer is likely to credit the ladder and mutant campaign and miss B1 because every exercised factory supplies controls; the integration gate should expose B2 immediately if it runs unfiltered. B3 is the most likely judge miss because `NOT VALID` looks history-safe until a real legacy literal is traced through API parsing and DR-184 re-persistence. The fastest falsification order is therefore: inspect the production `main.ts` constructor, read a pre-0055 answer through `AnswerSchema`, attempt catch-up from that same historical record, then run the unfiltered integration consumer at `database.test.ts:2048`.
