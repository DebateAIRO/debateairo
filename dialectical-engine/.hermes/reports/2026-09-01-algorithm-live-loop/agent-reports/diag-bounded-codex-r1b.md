CODEX REVIEW DIAG-BOUNDED r1b — CHANGES · comments read through: diag-bounded-r1b-2026-09-07

Counts: **2 must-fix findings (F2/F3, both P2); 0 P0/P1 findings; 2 nonblocking evidence corrections (C1/C2). Original r1 F1 is fixed: the arbitrary typed-code passthrough is closed.** The remaining defects are three non-code literals admitted as recognized codes and two legitimate subclass codes omitted. Twin-copy and rollback rulings remain accepted.

Reviewed branch `lane/diag-bounded`, clean worktree, base/dev `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`, prior reviewed head `d6d0f69c32d7adc7ab462e726bccb7d6a5c651dc`, rework head `474794537c7709e26bbae49cdb5f2ccba7913bcc`. Two commits above base. Seven cumulative changed files; five in the rework commit. Source paths below are relative to the lane's `dialectical-engine/`; `agent-reports/`, `packets/`, and `logs/` paths are relative to the mission directory. Source lines refer to the current head unless another revision is specified.

Exact cumulative patch, generated with `git diff --no-ext-diff --no-textconv --binary --full-index <base> <head>`: **107,237 bytes**, SHA-256 `ec34f10cada6d872888773be58fe7f257fa24b8cfb4eca6b3b85e6f7dafb22d4`. Rework-only patch: **50,291 bytes**, SHA-256 `75bc9ac1b89958f85bc90fb559913743ae0e4eb00aadd59eb270dcd16edf9b5c`. STRENGTH: **entailed**, freshly read from Git and hashed.

## Finding F2 — P2: the final domain map still admits three non-code literals

**File/line:** `apps/api/src/index.ts:333`, `:397`, `:523`; twins `apps/runner/src/index.ts:4669`, `:4733`, `:4859`. False provenance: `logs/diag-bounded/r1-03-domain-code-citations.log:271`, `:272`, `:351`, `:352`, `:503`. The affected lookup is API `:942`, runner `:5278`.

**Input → wrong outcome:** a typed error whose code is `MATCHED_EXISTING`, `PROWESS_RANK`, or `UNASSESSABLE` is recognized and produces that text, with the usual runner prefix. None is a declared domain error code in the stated producer scope. Under AMENDMENT 1's recognized/unknown distinction, these should select `UNRECOGNIZED_DOMAIN_ERROR` instead.

The five cited rows all claim resolution through the `requireNonblank` pair loop at `packages/evaluator/src/index.ts:1026`. Their actual syntax disproves that claim:

| Admitted value | Cited evaluator lines | Actual use |
|---|---|---|
| `MATCHED_EXISTING` | 1317, 1594 | Membership checks on admission decisions; neither passes this value to `requireNonblank`. |
| `PROWESS_RANK` | 2334, 2699 | A phase-order tuple type and its returned tuple value. The type declaration is not even an executable producer. |
| `UNASSESSABLE` | 366 | An allowed verdict in `addonGradeSchema`'s `z.enum`. |

The real loop is confined to `validateAdmissionIdentity`, lines 1019–1026. Its second tuple elements are exactly five `EVALUATOR_DOMAIN_*_INVALID` codes at lines 1021–1025. Independent syntax-tree inspection found **12 literal-argument calls plus this one loop call** to `requireNonblank`, not the worker table's “22 call sites + ... pair loop.” A syntax-tree reconstruction of direct `new TypedDomainError(...)` constructors and their 13 nonliteral argument sites yields **396 legitimate distinct codes**, all already present in the map. The three values above are the entire excess against that reconstruction. That constructor-form sweep omits the two subclass declarations in F3; including them yields **398 legitimate distinct codes**.

Both new tests obtain their positive-control lists from the implementation itself (`tests/unit/api-operational-error.test.ts:130`, `tests/unit/dev-runner-reconciliation.test.ts:121`). Consequently they affirm these erroneous members too. The six specifically excluded probe/role values really are absent, but that check did not exclude unrelated verdict, decision, and phase literals.

**Required fix:** remove all three values from both domain maps; constrain the evaluator-loop extraction to the actual five tuple pairs; remove the five false citation rows and correct the report/source provenance and counts. Add explicit rejection controls for these non-code values in both formatter tests, independent of the generated positive list. Preserve legitimate codes, public errors, and twin-copy coverage, then file the required evidence at the corrected tip. Removing these three entries alone gives 396 domain entries and 696 output strings. Also restoring F3's two legitimate subclass codes gives **398 domain codes and 698 distinct output strings**; measure the final artifact again rather than copying projected counts blindly.

**STRENGTH:** **entailed** for the non-code syntax, false citations, exact map membership, wrong recognition, and independent set difference. This is a vocabulary/contract defect, **not** a reopened arbitrary-string channel: the current output alphabet is still finite. No external control of a production typed code or production disclosure is established.

## Finding F3 — P2: declared provider subclass codes degrade to the unknown fallback

**File/line:** `apps/api/src/index.ts:942`; twin `apps/runner/src/index.ts:5278`. Omitted declarations: `packages/providers/src/index.ts:62` and `:78`; subtype definitions at `:52` and `:68`.

**Input → wrong outcome:** `ProviderCallFailedError` declares `PROVIDER_CALL_FAILED`, and `ProviderContentUnacceptedError` declares `PROVIDER_CONTENT_UNACCEPTED`, in both their `super(...)` calls and readonly code fields. Passing either existing domain-error subclass to a formatter now yields `UNRECOGNIZED_DOMAIN_ERROR` (runner-prefixed), whereas the old formatter preserved its declared code. Neither code occurs in `KNOWN_DOMAIN_CODES` or the citation artifact. These are real production error types thrown by the provider gateway at `packages/providers/src/index.ts:491` and `:499`.

The class-name map does contain both class names at API `:930`–`:931` and runner `:5266`–`:5267`, but it cannot repair the omission: these objects satisfy `instanceof TypedDomainError`, so the earlier domain lookup returns immediately. This is why a subclass check must cover real constructor declarations as well as inherited lookup semantics. The worker's sweep of `new TypedDomainError` never visits `super(...)` in a subclass.

**Required fix:** add both declared codes to both domain maps with citations to their actual subclass declarations; include subclass/super producers in the membership audit; add legitimate controls using both real provider error classes in the formatter tests. Preserve their diagnostic codes without emitting their raw cause, parse error, or artifact fields. Correct the final counts together with F2 and file refreshed evidence.

**STRENGTH:** **entailed** for declarations, production throws, missing membership, branch precedence, and changed formatter results. Exact propagation of every provider-error instance to a formatter is not asserted: for example, `callSynthesisRole` at runner `:1313`–`:1321` deliberately replaces both types with other typed codes, and cooldown handling consumes some transport failures. Those caller-specific transformations do not make these existing domain-code declarations unknown or satisfy the amendment's preservation requirement.

## Original F1 — closed at both boundaries

The kernel still accepts `code: string` at `packages/kernel/src/index.ts:388`. Both formatters now look up that value in `KNOWN_DOMAIN_DIAGNOSTICS` and return a map-owned literal or the fixed typed fallback. The API wrapper at `:968` returns that result; the runner wrapper at `:5304` adds only `RUNNER_EXECUTION_FAILED:`. Neither changes the thrown object, its code, or its message.

The requested alternate forms were assessed statically:

| Input form | Current result before the runner prefix |
|---|---|
| Exact legitimate known code | Its enumerated diagnostic. |
| Different casing or leading/trailing whitespace | Typed fallback; no case conversion or trimming occurs. |
| Proper prefix of a known code, not independently listed | Typed fallback; lookup is exact, not prefix-based. |
| Ordinary subclass of `TypedDomainError` | Same typed lookup; inheritance supplies no passthrough. |
| Unknown outer typed code with a known code on `cause` | Typed fallback; `cause` is never read. |
| Known outer typed code with an unknown nested cause | The known outer code; no nested text contributes. |
| Plain `Error` carrying a typed error only on `cause` | Ordinary outer-error classification, normally `ERROR`; the nested code is ignored. |

No route to an output outside the literal maps was found in those cases. F2 concerns falsely admitted literals; F3 concerns real subclasses whose declared codes are missing. The ordinary-subclass row describes inherited lookup semantics, not a claim that the map preserves every existing subclass code. The sinks remain the API's 5xx record at `apps/api/src/index.ts:1359` and runner failure recording at `apps/runner/src/index.ts:5331`, followed by persistence at `packages/battery/src/index.ts:434`; neither supplies a substitute alphabet check. STRENGTH: **entailed** from current control flow and constructor semantics. These alternate forms were not executed as additional probes; the permitted unit rerun supplies runtime evidence for the existing known/unknown controls.

## Domain-code audit and eight citation spot-checks

The artifact contains **522 citation rows for 399 unique entries**, exactly matching the source list; there are no duplicate list entries or unmatched citation keys. All entries satisfy the claimed shape. `DIAG_REVIEW_SENTINEL`, `AKIAIOSFODNN7EXAMPLE`, `SYNTHESIZER`, `EVALUATOR`, `ASKER`, and `OPERATOR` are absent from the actual list. F2 identifies five semantically false rows despite those mechanical checks passing.

I independently enumerated constructor argument nodes over 90 tracked TypeScript files in the stated scope, excluding tests, and resolved the seven helper parameters, database constant, settlement ternary, three `readFamily` templates, and structural-ceiling template. The resulting 396-code set has no missing member in the shipped map, but that constructor-form sweep is incomplete for the requested preservation guarantee: the two provider subclass `super(...)` declarations add two missing codes, for a corrected 398-code universe. At `d6d0f69c`, all **419 direct-constructor citation rows** match actual constructor locations and first-argument values. The source-revision qualification in C1 matters for repeating that check.

Eight valid citation checks, in addition to the five false rows examined for F2:

| Code | Citation log line | Actual producer/resolution |
|---|---|---|
| `ABSENT_SIGNAL_HAS_FRESHNESS` | 7 | `packages/battery/decision/src/index.ts:89`: literal constructor code when a non-present signal claims freshness. |
| `RUN_CONTENT_ROLLBACK_INCOMPLETE` | 378 | `packages/db/src/index.ts:1289` at r0/current: literal in the replacement-error builder. Base has the two original constructors instead. |
| `AMENDED_QUERY_REQUIRED` | 18 | `packages/evidence/src/index.ts:63` supplies the second argument to `nonBlank`; `:22` forwards that parameter as the constructor code. |
| `DATABASE_POOL_FAILED` | 133 | Literal constant at `packages/db/src/index.ts:68`; `typedPoolFailure` forwards it at `:611`. Raw detail is confined to the separate message argument. |
| `EVALUATOR_DOMAIN_RUN_ID_INVALID` | 189 | Actual second tuple member at `packages/evaluator/src/index.ts:1021`; destructuring forwards it through `requireNonblank` at `:1026` to the throw at `:1016`. |
| `ADAPTIVE_STOPPING_CONTROLS_INVALID` | 8 | `packages/register/src/algorithm-policy.ts:414` passes the literal family code; `readFamily` appends the fixed `_INVALID` suffix at `:388`. |
| `STRUCTURAL_CEILING_DEPTH_INVALID` | 456 | `depth` belongs to the frozen member list declared at `packages/register/src/index.ts:194`; the loop's fixed template at `:306` produces this code. |
| `SCORECARD_TASK_CLASS_UNRESOLVED` | 403 | The zero-match branch of the ternary at `packages/settlement/src/index.ts:267`, forwarded to the constructor at `:268`. |

STRENGTH: **entailed** for these syntax and argument-flow correspondences and the reconstructed set. This establishes declared-code membership within the specified scope, not exact runtime propagation to a formatter.

## Alphabet and r0 regression review

Fresh extraction confirms **699 distinct outputs currently**, from 215 message literals, 399 domain entries, five overlaps, 20 dependency categories, 43 SQLSTATE categories, 25 distinct class outputs from 32 class keys, and two fallbacks. The arithmetic is accurate for the shipped source; “399 declared domain codes” is inaccurate because of F2/F3. The corrected membership is 398 codes and, with the other maps unchanged, 698 outputs. The runner prefix preserves the count.

The 885 lines before the end marker are byte-identical between copies. All four pre-existing r0 lists/maps are unchanged in value and order. The rework adds the domain map/branch and tests, generalizes the API test's list-reader helper, updates comments, and appends TOOLING-TRAPS. The database implementation and rollback test are unchanged from r0. Existing formatter assertions are retained; the cumulative diff still changes only the two previously authorized `DEPENDENCY_42501` expectations to the SQLSTATE-class category.

Rollback handling retains the exact public code `RUN_CONTENT_ROLLBACK_INCOMPLETE` and message `Run rollback or external content-key cleanup did not complete`. Its four local cause literals distinguish ambiguous commit, rollback failure, key-destroy failure, and both failures. If commit was not attempted and neither cleanup failed, the initiating error is rethrown unchanged. The two cleanup catches discard their caught objects. Three unit cases execute actual failure branches; the fourth checks the category declaration. No new behavioral coverage of the combined-failure arm was introduced. Twin-copy acceptance and the shared-module follow-up remain appropriate. STRENGTH: **entailed** for source/diff equality and the partition; **consistent-with** for the maintenance ruling and current combined-arm reachability limitation.

## Tests, mutation assertions, and custody

Fresh reviewer run on Node **v25.7.0**, with an environment containing only inherited `PATH`, `HOME`, and `TMPDIR`:

`pnpm exec vitest run tests/unit/api-operational-error.test.ts tests/unit/dev-runner-reconciliation.test.ts tests/unit/run-rollback-categories.test.ts --no-cache`

**3 files passed; 17/17 tests passed; exit 0; 2.66 seconds.** Each permitted unit file ran once. No additional runtime probes, mutation executions, integration runs, typechecks, provisioning, servers, or databases were started by this review. STRENGTH: **entailed** by fresh tool output; the tests do not detect F2 or F3.

| Saved gate at `47479453` | Verified artifact contents |
|---|---|
| `r1-11-gates-unit.log` | API 6/6 ×3, runner 7/7 ×3, rollback 4/4 ×3; all nine runs have numeric `EXIT = 0`. |
| `r1-12-gate-s6-integration.log` | 48/48, exit 0; correct head and embedded-PostgreSQL evidence. Inspected header/result and relevant context, not every database-log line. |
| `r1-13-gate-typecheck.log` | Eight `error TS` lines, exit 1; ordered diagnostic bytes equal `02-typecheck-baseline.log`, also exit 1. Baseline-equivalent, not green. |
| `04-red-r1.log` at `d6d0f69c` | 2 failed / 11 passed, exit 1; both failures stop at the unknown sentinel. Correctly labeled uncommitted test edits. |

The typecheck diagnostic-byte SHA-256 is `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120` for both records. STRENGTH: **entailed** for saved contents and fresh comparison; **consistent-with** for historical execution beyond the retained records.

| Mutant / transcript | Actual stopping assertion or surviving behavior | Result |
|---|---|---|
| f / `r1-04-mutant-f-typed-passthrough-api.log` | API test `:119`: Expected `UNRECOGNIZED_DOMAIN_ERROR`; Received `DIAG_REVIEW_SENTINEL`. Twin comparison is skipped. | 1 failed / 5 skipped; exit 1. |
| g / `r1-05-mutant-g-typed-passthrough-runner.log` | Runner test `:111`: Expected `RUNNER_EXECUTION_FAILED:UNRECOGNIZED_DOMAIN_ERROR`; Received `RUNNER_EXECUTION_FAILED:DIAG_REVIEW_SENTINEL`. | 1 failed / 6 skipped; exit 1. |
| a / `r1-06-mutant-a-message-shape-api.log` | API test `:53`: digest-in-message rejection. | 1 failed / 5 skipped; exit 1. |
| d / `r1-07-mutant-d-message-shape-runner.log` | Runner test `:69`: digest-in-message rejection with prefix. | 1 failed / 6 skipped; exit 1. |
| b / `r1-08-mutant-b-categories-collapsed.log` | Rollback test `:128`: Expected `CONTENT_KEY_DESTROY_FAILED`; Received `ROLLBACK_FAILED`. | 1 failed / 3 passed; exit 1. |
| c / `r1-09-mutant-c-neighbour-rename-survives.log` | Consistent boolean/category-key rename; emitted literals unchanged. | 4 passed; exit 0. |
| e / `r1-10-mutant-e-twin-drift.log` | API test `:145`: twin comparison shows the runner's `ZONE_FLUSH_JITTER_INVALID_DRIFTED` literal. | 1 failed / 5 skipped; exit 1. |

All seven transcripts were read in full. Each records the current head/tree, exact old/replacement text, pre/apply/restore occurrence gates, project-local command, numeric exit, matching before/after SHA-256, empty porcelain, and `RESULT: ok`. Six apply one substitution; c applies six with `MUT_EXPECT=6`. Each transcript's target hash independently matches the current source file. **f/g kill for the intended typed-branch reason. Custody is complete at the saved-transcript level.** STRENGTH: **entailed** for these matches and assertion frames; no mutant was rerun.

Fresh supplied stamp-check: **11 r1 records / 0 failures / exit 0**. Whole-directory check: **25 records / 14 historical mismatches / exit 1**, comprising the three base captures, r1 RED, prior reviewer snapshot, and nine r0 records. These should retain their historical stamps. A passing stamp comparator proves record identity, not citation correctness; F2/C1 survive it.

## Evidence corrections C1 and C2

**C1 — wrong producer revision. File/line:** `apps/api/src/index.ts:128` and twin `apps/runner/src/index.ts:4464`; `logs/diag-bounded/r1-03-domain-code-citations.log:2`.

**Input → wrong outcome:** following the stated base revision to cited constructor locations gives different source. For example, the artifact cites `RUNNER_FAILURE_STATE_NOT_RECORDED` at runner `:4885` and `RUN_PRINCIPAL_SESSION_MISMATCH` at API `:1658`/`:1661`; these are r0 locations. Base locations are runner `:4465`, API `:1233`/`:1236`. Base has **420 literal sites + 13 nonliteral sites**; r0 has **419 + 13**, because the rollback rewrite consolidates two constructors into one. All 419 direct rows match r0 exactly. The base and pre-rework trees are not “identical.”

**Required fix:** distinguish the record's filing head from the actual producer-source revision. Either declare `d6d0f69c` for this sweep or regenerate at the claimed revision and update every affected line/count. Removing F2's five false rows leaves 517 rows under the current r0-based enumeration. **STRENGTH: entailed** by syntax-tree counts and Git source comparison. Nonblocking independently of F2; carry it with the required citation repair.

**C2 — stopping-assertion overclaims remain. File/line:** `agent-reports/diag-bounded.md:32` and `:110`–`:111`.

**Input → wrong outcome:** the report says the typed token/SQL assertions are established by f/g, but f/g stop at the earlier sentinel. It also says name-derived rejection is pinned by a/d; those restore only message passthrough and stop at the earlier digest assertion. These transcripts cannot establish execution or mutation sensitivity of the later assertions.

**Required fix:** attribute token/SQL/name rejection to passing complete tests and the static lookup boundary; attribute f/g specifically to sentinel rejection and a/d specifically to digest-message rejection. No additional mutant is required by this review just to correct the prose. **STRENGTH: entailed**, from full transcripts and assertion order. This evidence correction does not invalidate the intended f/g kills.

## Packet audit

**AMENDMENT 1's operative contract — clear.** It explicitly retracts the false type premise, requires a runtime boundary while preserving public errors, grants sufficient files, accepts the twin-copy design, and specifies appropriate known/unknown controls and refreshed gates. The original sentence remains in the historical Outcome paragraph, but the amendment unambiguously supersedes it. No new scope expansion or shared-module prerequisite is needed.

**Fulfillment — charge F2/F3.** The map is finite, but its claimed declared-code membership has both excess values and omissions. The reviewer's seat-claims summary that the bad first extraction was fully discarded must be qualified: the named role values are absent, while three other non-code values remain and two real subclass codes were missed. Correcting packet premises was not an obstacle to repairing either membership error. C1 separately corrects the producer-revision claim.

**The three specifically ordered r1 corrections — carried, with C2's qualification.** Both source comments now name `r0-03-allow-list-citations.log` (API `:555`, runner `:4891`). The worker self-report `:4`–`:6` says seven r0 files and includes TOOLING-TRAPS. The RED narrative now correctly says the digest frame is absent from `03-red.log`; an independent count finds zero lines containing `DEADBEEFCAFEBABE`, and a/d supply the digest frames. The new overclaims identified in C2 still need correction. Literal membership versus propagation and the rollback “neither failed” partition have been explicitly distinguished.

The amended worker packet and dispatch are byte-identical. The provisioning artifact ends with the exact pinned-base `PROVISIONED OK` line and records install/generation exit 0. The rework touches only authorized source/test support and the append-only tooling log; no shared module, dependency, migration, or public error change was introduced. STRENGTH: **entailed** for packet text, comparisons, source scope, and recorded provisioning contents; provisioning itself was not replayed. Whether the two mentioned follow-up tickets were actually filed was not independently checked.

## Landing

**Textually mergeable into pinned dev; CHANGES before landing because of F2/F3.** Fresh `dev` resolution remains `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`, the lane's merge base. An isolated `git merge-tree --write-tree <base> <head>` exited **0** and returned:

`0720d82b2b8cc85051eb62cdcdf7ddc3391d7e09`

This equals the reviewed head tree. The command wrote only to a disposable `GIT_OBJECT_DIRECTORY`, used the original object store as a read-only alternate, and the disposable store was removed. No source Git refs, objects, index, or checkout were changed by the review. `git diff --check <base> <head>` exited 0; the worktree remained clean after the permitted tests and merge check. STRENGTH: **entailed** by fresh results. Textual mergeability does not override the vocabulary defect.

The remaining repair is small and localized to map membership, independent rejection and real-subclass controls, and evidence. The original unbounded branch and r0 rollback diagnosis are successfully addressed; neither should be reopened during the correction. Shared-module extraction remains a follow-up, not a landing condition.

## Not verified

- No fresh integration, typecheck, mutation, provisioning, deployment, or declared Node 22.23.1 run. Saved evidence and the fresh Node v25.7.0 unit run are distinguished above.
- No proof of every producer's runtime propagation, external control of a production typed code, or production disclosure. The constructor/source contract is sufficient for F2/F3's recognition defects.
- No additional dynamic casing/whitespace/prefix/subclass/cause probes; those answers are static. No general guarantee for hostile getters, proxies, modified built-ins, or adversarial in-process mutation.
- No behavioral combined rollback/key-destroy execution; the fourth rollback unit remains a declaration check. No replay of the entire integration transcript line by line.
- No re-creation of every r0 message citation, full-repository review outside the requested producer scope, follow-up ticket creation, actual merge, or changes to source, board, or DECISIONS. Only the two requested reports were authored.

STRENGTH: **undetermined** for the unperformed checks and production claims; these limitations do not weaken the direct evidence for F2/F3.

REWORK: changes — remove three non-code entries, restore the two declared provider subclass codes, repair the evidence, and refresh the required records at the corrected tip.
