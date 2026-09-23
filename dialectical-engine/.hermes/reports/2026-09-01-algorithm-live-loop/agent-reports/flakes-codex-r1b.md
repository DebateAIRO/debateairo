CODEX REVIEW FLAKES r1b — CHANGES · comments read through: flakes-r1b-2026-09-08
SKILLS LOADED: none; packet-directed static review and saved-artifact audit.
Counts: 2 blocking findings, both P2 continuations of T9 F1/F2; P0/P1/P3 ×0. POL-03 remains cleared. Packet-audit qualifications below are not additional code findings.

Read the reviewer packet in full before other inspection, then the r1 verdict, worker packet including AMENDMENT 1, identical dispatch, worker report and self-report. Reviewed the complete rework diff, the evaluator, issuer, disposition and controls, and the records identified below. Source paths are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-flakes/dialectical-engine`; mission-relative paths are relative to `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop`. Line numbers are at the new head unless stated otherwise.

Identity: clean `lane/flakes`, base/dev `169941c6f1d9d2e50019550f78cb48d89288c49c`, r1 `b1c9ee33e6c5d10359063ce9479ceea512537216`, reviewed head `5e3bd0e0dc1b56d9a64c3f8276b5e416e6f80578`; two commits from base. Rework changes only `tests/integration/registration-database.test.ts`, +314/−56. Everything outside the one counterbalanced T9 test is byte-identical to r1. STRENGTH: entailed by Git blobs and direct prefix/suffix comparison.

## Findings

### F1 — P2: product-induced issuer stalls can still waive an unresolved product signal

**File/line:** `tests/integration/registration-database.test.ts:6652`, `:6846`, `:7110`, `:7128`; independence rationale at `:6479`, `:6790` and `:7130`.

**Input → wrong outcome:** an INCONCLUSIVE result with at least five of the 192 intra-slot intervals exceeding 457 ms reaches the successful typed skip, regardless of why those intervals slipped. The arithmetic is `5/192 > 0.025`; four breaches remain valid. An unresolved arm-dependent effect accompanied by enough product-induced event-loop stalls can therefore supply its own waiver, even while median-gap, response-body and database assertions hold.

The instrument is independent of the *computed endpoint values*, but not causally independent of the product being measured. `runWindow` builds a Fastify instance in the test process (`:7072`; `apps/api/src/index.ts:1236`) and invokes `injectResend` between timestamps. That helper calls `api.inject` (`:5574`) in the same process. Synchronous request work, asynchronous continuations that block the event loop, and request-related GC can postpone the next timer/issuer timestamp. Moving the timestamp before the request does not exclude work executed between this timestamp and the next. Also, individual responses already compute `elapsedMs` at `:5586`, and their promise mappers assign `score` at `:7126` during the issuance loop; the overshoots are calculated only after that loop. “Before any response is scored” is not a valid independence argument, even as a description of execution order.

The rate rule removes the one-stray-slot waiver, which is a real improvement. It does not guard the causal problem: it counts breaches without distinguishing external load from product work. Five affected slots are enough; they need not occur in multiple windows or replicates. The single-replicate and accuracy-only shapes that AMENDMENT 1 identifies remain unresolved by design. If such a shape also delays the issuer sufficiently, `measurementInvalid` overrides its red disposition. A consistent same-sign replicated effect still becomes PRODUCT_REPAIR and stays red; a median-bound failure or other earlier assertion also stays red. Thus the finding concerns unresolved effects accompanied by issuer stalls, not every possible product slowdown.

The constants have existing numerical provenance: 100 ms was the median-gap bound, and 0.025 was the local Holm threshold. Their *uses as cadence tolerance and admissible breach share are new*. A multiple-testing threshold does not establish an acceptable scheduling-error rate, and a median-effect bound does not establish drift exchangeability after an issue delay. The six saved live gates establish that this rule was false in those observations, not that it isolates environmental failure or preserves product-regression coverage.

**Required fix:** retain a red unresolved disposition when cadence breaches are the only additional evidence, while keeping those measurements in the receipt. If a successful skip is retained, justify an independent invalidation condition and explicitly address product-induced issuer delays; add a deterministic control covering that coupled case. Correct the causal-independence claims and distinguish the new acceptance policy from the constants' original meanings. Merely changing the breach rate or saying that timestamps precede evaluation does not resolve this finding.

**STRENGTH:** entailed for the shared execution path, predicate, five-slot boundary and resulting skip; consistent-with for a product regression jointly producing unresolved statistics and enough issuer stalls. No such regression was reproduced against the product, and this is not a newly validated production vulnerability. The defect is the unestablished independence used to authorize a successful unresolved gate.

### F2 — P2: the skip receipt still has no delivery contract

**File/line:** `tests/integration/registration-database.test.ts:6977`, `:7017`, `:6853`, `:7304`; mutant `logs/flakes/r2-06-mut2-endpoint-identities-removed.log:3` and `:234`.

**Input → wrong outcome:** remove the cause only from the skip message at `:6853`, or remove the message argument only from `context.skip` at `:7304`. The invalid-cadence control still sees `outcome === "skip"`, the cause checks still inspect the *valid-measurement red* message, and all six filed live gates still take GREEN. This leaves exactly the skip-output omission identified in r1 without a deterministic observer. The typed skip could lose its six endpoint identities, p-values and statistics without these checks noticing.

The implementation currently supplies the complete cause to both red and skip. F2's formatting defect is fixed: the stable sequence is `r1.auc`, `r1.accuracy`, through `r3.accuracy`, with raw p, observed statistic and q99; `r1` through `r3` separately label Holm, directed/constituent signs and gap. The red-message contract pins all six identities and their p/observed values. But the sole constructed skip at `:6977` checks only its outcome. Calling a pure factory and inspecting one red branch's message does not pin the distinct skip branch or its delivery to Vitest.

The saved endpoint-removal mutant changes the shared formatter at `:6810`. Its expected kill at `:7042` is valid and useful, but proves shared formatting reaches the red-message observer. It does not remove the cause at the skip boundary. Runtime observers were traced above; there is no type/build safeguard for these strings: the factory accepts any `string`, and the installed Vitest runner explicitly permits `skip(note?: string)` (`node_modules/.pnpm/@vitest+runner@4.1.10/node_modules/@vitest/runner/dist/tasks.d-DEYaIMIu.d.ts:1310`). No fresh mutant survival is claimed.

**Required fix:** if the skip remains, assert its complete delivered receipt on the naturally INCONCLUSIVE invalid-cadence input, including all endpoint identities, their p/observed statistics, all three replicate labels, family p and the named invalid condition. Exercise the message passed to the actual skip boundary through a deterministic observer, then file a mutation at that delivery boundary which the observer kills. Keep the working red receipt and PRODUCT_REPAIR checks. Removing the skip as part of F1 would remove this skip-specific obligation.

**STRENGTH:** entailed by the controls' data flow, the unobserved skip-message branch, the optional Vitest argument and the saved mutant payload. The current complete skip text is statically verified; the omission examples are static mutation analysis, not rerun mutation transcripts.

## Verified improvements and preserved behavior

The four new controls call the real evaluator with constructed inputs; none forces a classification. For example, `r2-03-t9-isolated-run1.log:132–135` records all four naturally INCONCLUSIVE evaluations. STRENGTH: entailed from source and saved observations.

| Control | Recorded evaluator result | Asserted disposition |
|---|---|---|
| Accuracy-only spread | AUC 0.5 / accuracy 0.75 in each replicate; raw p 1 / 0.000244; all local rejects; directed signs 0; family p 0.000244; zero median gaps | Red with valid cadence |
| Single replicate | Local rejects true/false/false; family p 0.000244; pair gaps 32/0/0 ms | Red with valid cadence |
| Undelivered cadence | Same accuracy-only statistics; 192/192 breaches supplied | Skip outcome |
| Stray slot | Same accuracy-only statistics; 1/192 breaches supplied, worst overshoot 250 ms | Red |

These cover the requested nonreplication/accuracy-only boundary and genuine evaluator INCONCLUSIVE states. They establish the implemented policy on supplied measurements; they do not establish the issuer instrument's causal independence. They cover zero, one and 192 breaches, not the exact four/five boundary.

`disposition(cadenceControl)` remains green; `blockedControl` and `armControl` remain red (`:7009–7011`). PRODUCT_REPAIR is checked before measurement validity (`:6840`), so it cannot enter the skip branch even with invalid cadence. The existing PRODUCT_REPAIR controls have valid cadence; an invalid-cadence PRODUCT_REPAIR control is absent, but branch precedence itself is clear. The 0.01 family threshold, 100 ms median limits, six-endpoint evaluator, sample counts, seeds, order function and 420,000 ms timeout are preserved. Response/database assertions are preserved. STRENGTH: entailed.

The “nonreplication proves noise” interpretation is explicitly withdrawn in the rework report and corrected in the test. The replacement issuer-independence claim needs the further correction in F1. The policy comment at `:6790–6793` also still describes the maximum exceeding tolerance as the skip trigger; the implementation now uses the breach share. STRENGTH: entailed.

## Gates, mutants and custody

All 12 new acceptance records have one gate-run.sh v3 header with head `5e3bd0e0…`, tree `11c66c299ac010ccf095fe01881511057eb2210f`, a project-local named tool, and empty tracked porcelain before/after. The three new typechecks and three supplied base typechecks contain identical diagnostic bodies: eight diagnostics in `tests/unit/s14-ui.test.ts`, SHA-256 `b4602fbc2fd076c4528a006b8b7d70299042153cda597d584def2b471b66a3be` when newline-joined without a trailing newline. These are identity passes, not successful typechecks. STRENGTH: entailed from records.

| New-tip gate records | Exits | Wrapper seconds from r2-00 summary | Recorded result |
|---|---|---|---|
| `r2-01-typecheck-run1/2/3.log` | 1/1/1 | 5/5/3 | Eight unchanged diagnostics |
| `r2-02-pol03-run1/2/3.log` | 0/0/0 | 10/9/9 | Three tests pass each |
| `r2-03-t9-isolated-run1/2/3.log` | 0/0/0 | 376/379/388 | T9 GREEN each |
| `r2-04-t9-loaded-run1/2/3.log` | 0/0/0 | 389/389/397 | T9 GREEN each |

T9 Vitest durations are respectively 373.33/375.76/382.87 and 385.93/385.55/393.89 seconds. The summary records eight burners for each loaded run and post-run load averages 16.74/14.79/14.83; that is saved load evidence, not independent process observation. All six runs show `measurement_invalid=false`. Isolated run 3 has 1/192 breaches and worst overshoot 118.866 ms (`r2-03-t9-isolated-run3.log:221`); the other five have zero breaches. The 68 skipped rows are name-filter exclusions. No new-tip live red-unresolved or typed skip is recorded. STRENGTH: entailed as saved observations.

All three r2 mutants have one matching head/tree header, pre=0, applied=1, restored=0 and empty restored porcelain. Both before/after hashes match the actual head registration-test blob: `7f85f95e376f2a1dc3b966790b7448094cac881561a0b41b514d9234cf627087`.

| Mutant | Command exit / Vitest duration | Verified discriminator |
|---|---|---|
| `r2-06-mut1-skip-made-unconditional-again.log` | 1 / 63.61 s | Accuracy-only red-outcome assertion at `:6946`; transcript `:240–245` |
| `r2-06-mut2-endpoint-identities-removed.log` | 1 / 103.33 s | Red-message endpoint assertion at `:7042`; transcript `:234–239`; limited as described in F2 |
| `r2-06-mut3-neighbour-rename-survives.log` | 0 / 373.67 s | Local overshoot-array rename; one test passes |

Fresh read-only canonical `stamp-check.sh` execution exited 0:

```text
records compared: 16 · failures: 0
OK: every record stamps the filed tip
```

Population: 12 gates, three mutants, one summary note. This verifies identity/completion framing; the payloads, outcomes and restore hashes were checked separately. STRENGTH: entailed; no claim of independent historical execution attestation.

AMENDMENT 1 expressly permits citation of the three r1 whole-file runs. Reinspection confirms exits 1/1/1, 68 passed / one failed in each, Vitest durations 1967.04/2019.73/1995.18 seconds. The sole failure is S3d's RSS assertion at `:4237`, values 4/3.484375/4.515625 MiB against 2. Their immutable identity is r1 `b1c9ee33…`, not the new tip. They remain valid evidence for that revision; absence of a new effect on other rows is consistent-with, not a fresh whole-file pass.

## POL-03

Clear. The child, harness, integration file and product pool file are all byte-identical to the r1 revision reviewed and cleared. The child still installs `expectFailure` when creating the query at `poolFailureChild.ts:53`, before the two awaits, and later awaits that receipt at `:56`. The shipped row still requires exit 0, survived=true and both typed DATABASE_POOL_FAILED receipts. Three additional new-tip POL-03 file gates pass. STRENGTH: entailed.

The r1 POL-03 gate/mutant citations remain valid as r1 evidence for those identical files; they are not relabelled new-tip transcripts. Child SHA-256 remains `bb9948682a87106ce49d1dd3baa49d5e631380aff47c4f619cf14613af9f8610`. The earlier review's distinction between an uncommitted 0/120 probe and immutable gates remains in force. No POL-03 rework requested.

## Packet audit

- **AMENDMENT 1 scope: clear.** Instrumenting issuance is directly necessary to the amendment's explicit request for a run-recorded cadence/noise/load condition; it is not charged under the older output-only wording. Rework touches only this T9 test. No product, POL-03, dependency, other row, board or DECISIONS change appears. The bound literal refactor preserves 100 ms. STRENGTH: entailed.
- **F1 completion: charge, as F1 above.** Valid-cadence unresolved red, natural controls and threshold preservation are delivered. Independence from the effect being excused is not established. Reusing numeric constants does not make their new acceptance meanings pre-existing. STRENGTH: entailed for implementation; consistent-with for the product-origin scenario.
- **F2 completion: partial; charge, as F2 above.** Identities and red-message pin are delivered; the distinct skip receipt/delivery remains unpinned. The filed formatter mutant is correctly killed but cannot discharge that narrower obligation. STRENGTH: entailed.
- **Gate and record handoff: clear with stated limits.** New-tip isolated/loaded gates and typecheck identity are supplied; whole-file reruns were explicitly waived. Worker packet and rework dispatch are byte-identical. Provisioning still ends exactly `PROVISIONED OK commit=169941c6f1d9d2e50019550f78cb48d89288c49c`. No new baseline was necessary for this rework review. STRENGTH: entailed.
- **Measurement/report precision: qualified.** The report/source's first-attempt 107.448 ms warm-up claim has no matching raw `.log` under the supplied `logs/flakes` tree, including ignored logs. The independently located 118.866 ms record supports one stray-slot observation, not “almost every run” or “the first window always warms up.” Do not promote the unfiled trial into measured prevalence. The report's issuer-timestamp location `:7133` is also wrong: timestamps are at `:7110`, overshoots at `:7133`. The old max-based acceptance comment remains stale. These qualify F1's rationale, rather than creating additional blockers. STRENGTH: entailed for supplied-artifact search and source locations; undetermined for the unfiled trial.
- **Workflow declarations: qualified clear.** The worker declares the previously missing skill loaded, and receiving-code-review loaded for this round. No reviewer-accessible invocation transcript was audited to independently attest those declarations; do not re-charge the previous-round omission as a new one. Gate tool identities remain Node 25.7.0, pnpm 11.20.0, Vitest 4.1.10 and TypeScript 7.0.2. No new programmatic compiler contract check invokes the typescript-classic rule. STRENGTH: entailed for declarations/tool records; undetermined for invocation history.

## Landing

Textually mergeable into dev `169941c6f1d9d2e50019550f78cb48d89288c49c`; semantic recommendation **CHANGES**. Dev is still the lane's merge base. Ran `git merge-tree --write-tree 169941c6 HEAD` with a disposable `GIT_OBJECT_DIRECTORY` and the source objects available only through `GIT_ALTERNATE_OBJECT_DIRECTORIES`. Exit 0, no conflict output. Temporary objects were removed; no source Git objects, index, refs, branches or worktrees were mutated.

Result tree: **`11c66c299ac010ccf095fe01881511057eb2210f`**, identical to the reviewed head tree. HEAD and empty porcelain were rechecked. STRENGTH: entailed.

Exact binary/no-textconv diff custody: base→head 30,409 bytes, SHA-256 `8f5a28658e4ca98cda27f929ae60b2092e20ac5292d9956b6a581da88bf42570`; r1→head 28,794 bytes, SHA-256 `6c955735001f896492f33139e1288f4f538295197ab3614fa0eb838e972897c7`. STRENGTH: entailed.

## Not verified

- No reviewer rerun of Vitest, typecheck, load probes or mutants. This packet permits static review plus saved artifacts. No sandbox listen() failure or fresh test success is claimed.
- No product-origin coupled-stall reproduction; no empirical skip frequency; no new-tip live INCONCLUSIVE receipt. F1 is a test-acceptance defect, not a demonstrated production defect.
- No runtime experiment removing only the skip cause. F2's unobservability is static data-flow analysis, supported by the filed branch outcomes and local type declaration.
- No exact-base whole-registration-file baseline, new-tip whole-file run, full suite or Node 22.23.1 run. The amendment waives the whole-file repeat and reserves the full suite to the orchestrator.
- The first-attempt 107.448 ms measurement and worker skill invocation history were not independently verified. Saved artifacts establish what is printed and sealed, not universal behavior or independent historical attestation.

REWORK: changes — retain the cleared POL-03 fix and the improved T9 controls, but resolve the product-coupled cadence waiver and pin any retained skip receipt at its delivery boundary before landing.
