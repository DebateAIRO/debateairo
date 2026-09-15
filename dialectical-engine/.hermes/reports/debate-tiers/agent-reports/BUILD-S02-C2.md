# BUILD-S02-C2 case file

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## Finding 1 — the reading floor dominates the seat budget

**Cause.** The packet required full reads of three existing write-surface files totalling 3,744 lines before the localized admission change. The runtime edit itself is concentrated in `apps/api/src/index.ts:1206-1249`, while the fixture edits are at `tests/unit/api.test.ts:35-48,101,179,189` and `tests/integration/evaluator-database.test.ts:1446-1447`.

**Price.** Roughly 5 minutes of the 15-minute seat and an estimated 35k–50k input tokens were spent ingesting files whose unrelated regions never entered a decision. This is the largest token charge in this pass.

**Upgrade.** Generate a sealed context extract containing the entire changed functions plus every referenced type and test fixture, with hashes proving the extracts came from the dispatched HEAD. Keep full-file reading as a fallback when an extract hash fails. **VERDICT: adopt hashed context extracts for BUILD packets / CONFIDENCE: high / STRONGEST COUNTER: a bad extractor can omit a distant invariant, so the fallback and hash gate are mandatory.**

## Finding 2 — the packet carried two stale internal coordinates

**Cause.** The PLAN still says `api.test.ts` ends 24/24 at `docs/missions/debate-tiers/slices/S02/PLAN.md:599`, while the dispatch packet correctly says S01 raised it to 25/25. The S9 sweep points to `$13` at `PLAN.md:624`; after C1 inserted `plan_tier`, the actual paired panel/count parameters are `$14` at `packages/db/src/index.ts:1253`.

**Price.** One failed grep hypothesis, one narrow source inspection, one ticket finding, about 1 minute and an estimated 800–1,200 tokens. The packet correction prevented the 24/24 mismatch from becoming a false gate.

**Upgrade.** Packet generation should resolve every `file:line` anchor and expected literal against the exact lane HEAD immediately before dispatch, then refuse dispatch if a literal moved or a count disagrees. **VERDICT: make anchor validation a hard dispatch preflight / CONFIDENCE: high / STRONGEST COUNTER: line drift alone is harmless, but literal-and-context validation distinguishes harmless drift from stale semantics.**

## Finding 3 — typecheck ran after the first definitive three-run table

**Cause.** The initial no-run test used a legacy provisional session, but the current `Session` type admits the server-session shape. Typecheck identified both mismatches at `tests/unit/tiers-s02-admission.test.ts:254-255`; the neighboring established shape led to the server principal at `:259`.

**Price.** One typecheck failure, one fixture patch, one focused rerun, and a second typecheck. Because the edit invalidated fresh evidence, three full cluster runs and the suite marker also had to be repeated: about 45–50 seconds of test time, 7 tool round trips, and an estimated 2k–3k transcript tokens.

**Nearly wrong.** Without the typecheck delta gate, the runtime tests would have stayed green while the new file added compile diagnostics.

**Upgrade.** Put typecheck-delta verification before the definitive three-run cluster gate in coding packets; any later edit automatically invalidates both gates and restarts from typecheck. **VERDICT: order static diagnostics before the final repeated runtime gate / CONFIDENCE: high / STRONGEST COUNTER: runtime failures can be cheaper to diagnose first, so focused TDD runs still precede typecheck; only the definitive table moves later.**

## Finding 4 — evidence output repeats the same failure names

**Cause.** Vitest prints each failed case once with `×` and again under `FAIL`; the capture-first runner preserved both sets in the S2 board frame.

**Price.** Nine duplicate lines in one ticket comment, roughly 600–900 avoidable tokens now and again for every reviewer that consumes the comment.

**Upgrade.** Standardize the runner on one failure-name form plus `Test Files` and `Tests`; keep the full log addressable for stack traces. **VERDICT: emit one canonical failure list from the summary block / CONFIDENCE: high / STRONGEST COUNTER: the duration-bearing `×` lines help performance diagnosis, but full logs retain that information without duplicating the handoff.**

## Finding 5 — refutation evidence was valuable but manually orchestrated

**Cause.** S3, S4, and S5 each required a temporary product mutant, a focused RED, a manual restore, a status check, and a restored GREEN. The probes correctly separated duplicate-provider equality, refusal position, and full missing-id enumeration.

**Price.** Six temporary patches, six focused test runs, and three restore checks; about 3 minutes and an estimated 4k–6k transcript tokens. Unlike the stale-coordinate costs, this spend directly increased assertion quality.

**Upgrade.** Let the packet provide machine-readable mutant patches, target filters, neighboring cases, and expected summaries; a harness can apply each patch, capture RED, reverse the exact patch, print status, and capture GREEN. **VERDICT: automate packet-declared mutation matrices / CONFIDENCE: high / STRONGEST COUNTER: generated mutants can overfit implementation syntax, so the property and neighboring-case fields remain human-reviewed inputs.**

## Dead ends and one-prompt route

- The planned `$13` grep returned no hit because C1 shifted the parameter; widening only to the named source range found the lawful `$14` pair.
- The first final three-run table became unusable after the type fixture correction and was intentionally replaced with fresh logs.
- Removing the shared-fixture import from `api.test.ts` changed the current importer count from the packet's base 24 to 23; editing `tests/support/discoveredPanel.ts` was neither needed nor permitted.

The shortest route to a one-prompt machine is a generated execution manifest: exact HEAD, validated anchors, exhaustive writable paths, ordered edits, RED command and count, mutation patches, static-diagnostic delta, final runner pairs, comment templates, and commit path list. The seat should stop automatically on any manifest mismatch and emit one structured BLOCKED record rather than spending a reasoning pass reconciling prose. **VERDICT: compile packets into an executable, fail-closed manifest while retaining the prose as rationale / CONFIDENCE: high / STRONGEST COUNTER: executable manifests can hide intent, so reviewers still need the property statements and frozen acceptance text beside the commands.**
