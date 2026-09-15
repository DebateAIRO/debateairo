CODEX REVIEW DIAG-BOUNDED r1c — APPROVE · comments read through: diag-bounded-r1c-2026-09-07

Counts: **0 must-fix findings; F2/F3 closed; C1/C2 carried; 1 nonblocking qualification about expected-list provenance.** No residual requiring V's decision. The independent producer reconstruction contains exactly the 398 codes admitted by both maps. The fresh permitted unit run passed 19/19. The isolated merge into pinned dev succeeds.

Reviewed clean branch `lane/diag-bounded`, base/dev `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`, prior tip `474794537c7709e26bbae49cdb5f2ccba7913bcc`, round-2 tip `d797d8052c10bd095373f238d4c456064be77fe1`. Three commits above base; seven cumulative changed files, five in round 2. Source paths below are relative to the lane's `dialectical-engine/`; report, packet, and log paths are relative to the mission directory. Source lines are at the reviewed tip unless explicitly labeled base. STRENGTH: **entailed** by fresh Git reads.

Patch identity, calculated using `git diff --no-ext-diff --no-textconv --binary --full-index <from> <tip>`:

| Patch | Bytes | SHA-256 |
|---|---:|---|
| Base → round-2 tip | 141,725 | `ea6777dbd5a2c6e1829e214fb49e064dc6ea42f2e23f158ca32f94f734a7a8ea` |
| Prior tip → round-2 tip | 48,510 | `ee8da3e5cd2e76e38ab4c6b17481621c0bef5fae0cd057ae6ce899bbdb19bde4` |

STRENGTH: **entailed**, freshly generated and hashed in memory.

## F2 — closed: the three non-code values are refused

**File/line:** domain declarations at `apps/api/src/index.ts:176` and `apps/runner/src/index.ts:4512`; lookup boundaries at API `:973` and runner `:5309`; explicit rejection controls at `tests/unit/api-operational-error.test.ts:776` and `tests/unit/dev-runner-reconciliation.test.ts:139`.

**Input → formerly wrong outcome → current outcome:** a `TypedDomainError` carrying `MATCHED_EXISTING`, `PROWESS_RANK`, or `UNASSESSABLE` formerly retained that non-code value. Each is now absent from both domain maps and selects `UNRECOGNIZED_DOMAIN_ERROR`, with the runner's fixed prefix. All three rejection controls execute in the fresh passing tests.

The evaluator resolution now agrees with the actual syntax: 12 literal-argument calls to `requireNonblank`, plus one call inside the five-pair loop in `validateAdmissionIdentity`, base `packages/evaluator/src/index.ts:1019–1026`. The five false citation rows are gone. The three excluded values remain mentioned in explanatory comments and negative tests; those mentions are not map members or citation rows.

**Required fix:** none remaining for F2. The map repair, explicit controls, corrected enumeration, and refreshed evidence satisfy the requested repair. **STRENGTH: entailed** by source, independent set differences, fresh unit execution, and the saved h stopping assertion.

## F3 — closed: both real provider subclasses retain their codes

**File/line:** API entries `apps/api/src/index.ts:426` and `:428`; runner entries `apps/runner/src/index.ts:4762` and `:4764`; declarations at `packages/providers/src/index.ts:52`/`:62` and `:68`/`:78`; real-class controls in `tests/unit/api-operational-error.test.ts:790` and `tests/unit/dev-runner-reconciliation.test.ts:160`.

**Input → formerly wrong outcome → current outcome:** real `ProviderCallFailedError` and `ProviderContentUnacceptedError` instances formerly reached the typed branch and degraded to the unknown fallback. They now return `PROVIDER_CALL_FAILED` and `PROVIDER_CONTENT_UNACCEPTED`, respectively, with the fixed runner prefix where appropriate. The typed branch still returns a map-owned value. The cause, parse-error message, artifact reference, and ledger reference do not contribute to it.

The fresh unit run executes both real subclasses in each formatter. The independent syntax-tree sweep finds exactly these two direct subclasses in the stated producer scope, and reads their code arguments from `super(...)`. Their production throws at providers `:491` and `:499` remain unchanged. No public error code, message, or provider constructor was edited.

**Required fix:** none remaining for F3. **STRENGTH: entailed** for declarations, lookup behavior, exact controls, and source preservation. Runtime propagation of every provider failure to these formatters is not established or needed for the declared-code preservation finding; some callers replace or consume these errors.

## Independent membership reconstruction and citation checks

I parsed the 90 tracked TypeScript files in the stated scope at base `d5b4f7f5`, using the installed `typescript-classic` syntax-tree API. The expected arrays, implementation maps, and citation keys were comparison targets only; none supplied the reconstructed code values.

The reconstruction found 420 literal-argument constructor sites, yielding 315 distinct literal codes; 13 nonliteral constructor sites; and two subclass `super(...)` code declarations. I resolved the nonliteral sites through their actual argument positions, the enclosing evaluator loop, the database constant initializer, both settlement conditional branches, the three `readFamily` template suffixes and five family arguments, and the 14 frozen structural-ceiling members. Those resolutions contribute 98 citation rows. Thus **420 + 2 + 98 = 520 rows, for 398 distinct declared codes**. The helper call counts are 2 `parseContent`, 2 `callSynthesisRole`, 7 `runnerStage`, 12 direct `requireNonblank` plus five loop pairs, 18 `nonBlank`, 12 `requiredText`, and 8 `requireNonBlank`. An identifier-use check found no aliased `TypedDomainError` import or unclassified reference form in that scope.

| Comparison against independently reconstructed set | Members | Missing | Excess |
|---|---:|---:|---:|
| API domain map | 398 | 0 | 0 |
| Runner domain map | 398 | 0 | 0 |
| Committed `EXPECTED_DOMAIN_CODES` | 398 | 0 | 0 |
| Domain citation keys | 398 | 0 | 0 |

All three arrays contain 398 distinct elements, without duplicates. Every one of the 420 direct-constructor citation rows matches the base code, path, and constructor line; both subclass rows match their `super` locations. The cumulative patch changes no producer vocabulary: its database rewrite consolidates two occurrences of the same rollback code into one. The declared-code set therefore remains applicable to this tip. STRENGTH: **entailed** for the scoped reconstruction and comparisons, not a claim of complete runtime propagation.

The following ten admitted-code checks include all eight prior valid spot-checks and both subclass codes. Citation line numbers refer to `logs/diag-bounded/r2-03-domain-code-citations.log`; producer lines refer to the explicitly named base revision.

| Code | Citation line | Independently checked declaration or resolution |
|---|---:|---|
| `ABSENT_SIGNAL_HAS_FRESHNESS` | 15 | Battery decision `packages/battery/decision/src/index.ts:89`, literal first constructor argument. |
| `RUN_CONTENT_ROLLBACK_INCOMPLETE` | 384–385 | Base database constructors at `packages/db/src/index.ts:1273` and `:1294`; both declare the same code. |
| `AMENDED_QUERY_REQUIRED` | 26 | Evidence `:63`, second argument to `nonBlank`, forwarded at `:22`. |
| `DATABASE_POOL_FAILED` | 141 | Database constant initializer `:68`, forwarded at `:611`. |
| `EVALUATOR_DOMAIN_RUN_ID_INVALID` | 197 | Evaluator tuple `:1021`, inside the actual loop ending at `:1026`, forwarded at `:1016`. |
| `ADAPTIVE_STOPPING_CONTROLS_INVALID` | 16 | Register algorithm policy family argument `:414`, `_INVALID` template at `:388`. |
| `STRUCTURAL_CEILING_DEPTH_INVALID` | 463 | Register member declaration starts at `:194`, `depth` at `:195`, fixed template at `:306`. |
| `SCORECARD_TASK_CLASS_UNRESOLVED` | 410 | Settlement conditional branch `:267`, forwarded at `:268`. |
| `PROVIDER_CALL_FAILED` | 355 | Provider subclass at `:52`, literal `super` argument at `:62`. |
| `PROVIDER_CONTENT_UNACCEPTED` | 357 | Provider subclass at `:68`, literal `super` argument at `:78`. |

The three former false members were also checked against their original source rows:

| Excluded value | Actual evaluator syntax at base | Current result |
|---|---|---|
| `MATCHED_EXISTING` | Decision-membership arrays at `:1317` and `:1594`. | No producer citation row or map entry; both formatter controls reject it. |
| `PROWESS_RANK` | Phase tuple type at `:2334` and returned phase tuple at `:2699`. | No producer citation row or map entry; both formatter controls reject it. |
| `UNASSESSABLE` | Verdict enum at `:366`. | No producer citation row or map entry; both formatter controls reject it. |

STRENGTH: **entailed** for all thirteen checks. No array elsewhere in the evaluator was used to resolve the five-pair loop.

## Expected lists — accepted, with a provenance qualification

**File/line:** `tests/unit/api-operational-error.test.ts:23`, `:33`, `:435`, `:728`, `:784`; runner source reader `tests/unit/dev-runner-reconciliation.test.ts:23`, comparisons `:153` and `:197`; worker provenance claim at `agent-reports/diag-bounded-self.md:296`.

The test expectation no longer comes from the implementation at test execution. The API test evaluates committed arrays. The runner reads those same arrays from the API test's source text, avoiding a test-module import. Each compares sorted lists and then exercises its own formatter against the expected values. Sorted array equality checks both missing and extra extracted members and preserves duplicate counts.

For the declarations actually committed, I separately parsed the array initializers as syntax-tree values and compared them with the runner's source-text extraction: **exact equality for all 398 domain codes and all 215 message constants**. Thus the runner and API have equivalent membership expectations at this tip; they exercise different formatter functions. The message expectation also matches all 215 r0 message-citation keys and the unchanged message map.

**Qualification:** independently stored is not independently derived. The worker says the expectation was generated from producer citations, and the map has the same extraction provenance. One faulty extractor could put the same wrong value into citations, expected list, and map, leaving the equality assertions green. The worker self-report acknowledges that the r2 sweep is still one extractor. No saved second derivation by the worker is established. The separate syntax-tree reconstruction in this review supplies that differently derived check for the domain set.

**Input → possible overclaim:** jointly regenerating an erroneous snapshot and map can preserve equality; passing snapshot tests alone would not prove that all members are declared codes. **Required fix:** no landing change. Describe these as committed membership snapshots that detect subsequent drift, and retain a separate producer audit when refreshing them. Their text readers assume the current uppercase, double-quoted literal declaration syntax; they are not general TypeScript evaluators. **STRENGTH: entailed** for the present equivalence and shared provenance; **consistent-with** for accepting this design under AMENDMENT 2, which explicitly permits a committed expected list. This qualification does not reopen the repaired F2 membership defect.

## C1/C2 and mutation evidence

**C1 — carried.** Both source comments now distinguish the filing tip from producer-source revision, and name `r2-03-domain-code-citations.log`. The artifact names base `d5b4f7f5`, and the independently checked rows actually belong to it. Besides the ten positive checks above, `RUNNER_FAILURE_STATE_NOT_RECORDED` now cites base runner `:4465` (citation line 381), and `RUN_PRINCIPAL_SESSION_MISMATCH` cites base API `:1233`/`:1236` (lines 403–404). The 420 direct rows, 520 total rows, and 398 unique codes agree with independent enumeration. The historical r1 artifact appropriately retains its old contents; it is superseded, not restamped. STRENGTH: **entailed**.

**C2 — carried for the charged attribution.** `agent-reports/diag-bounded.md:78` now assigns f/g to sentinel rejection and a/d to digest-message rejection, and assigns token/SQL/name properties to complete passing tests and the static boundary. Read the same report's shorthand h/i rows at `:90–91` narrowly: h demonstrates `MATCHED_EXISTING`, and i demonstrates the runner's `PROVIDER_CALL_FAILED` control. Neither transcript establishes later iterations or the other subclass. Those additional cases are established by the complete passing tests. STRENGTH: **entailed** for corrected prose, assertion order, and the following saved frames.

| Mutant / saved transcript | Intended assertion actually reached | Saved result |
|---|---|---|
| f / `r2-04-mutant-f-typed-passthrough-api.log` | API `:761`: sentinel must select typed fallback. | 1 failed / 6 skipped; exit 1. |
| g / `r2-05-mutant-g-typed-passthrough-runner.log` | Runner `:128`: prefixed sentinel must select typed fallback. | 1 failed / 7 skipped; exit 1. |
| a / `r2-06-mutant-a-message-shape-api.log` | API `:693`: digest-message rejection. | 1 failed / 6 skipped; exit 1. |
| d / `r2-07-mutant-d-message-shape-runner.log` | Runner `:86`: digest-message rejection. | 1 failed / 7 skipped; exit 1. |
| e / `r2-08-mutant-e-twin-drift.log` | API `:824`: twin comparison detects the drifted message literal. | 1 failed / 6 skipped; exit 1. |
| h / `r2-09-mutant-h-noncode-readmitted.log` | API `:778`: `MATCHED_EXISTING` must select typed fallback. | 1 failed / 6 skipped; exit 1. |
| i / `r2-10-mutant-i-subclass-code-dropped.log` | Runner `:170`: real provider-call subclass must retain its code. | 1 failed / 7 skipped; exit 1. |
| b / `r1-08-mutant-b-categories-collapsed.log` | Rollback `:128`: key-destroy failure must have its distinct category. | 1 failed / 3 passed; exit 1. |
| c / `r1-09-mutant-c-neighbour-rename-survives.log` | Consistent six-occurrence identifier/key rename leaves emitted vocabulary unchanged. | 4 passed; exit 0. |

All nine transcripts were read in full. The seven r2 transcripts stamp the reviewed tip/tree; b/c stamp their historical r1 tip/tree. All record the exact substitution, pre/apply/restore gates, project-local command, numeric exit, matching before/after hashes, empty porcelain, and `RESULT: ok`. Each recorded target hash independently matches the present source file. h also removes `MAKER_INVENTORY_UNSATISFIED`, but its actual stopping frame is the intended non-code rejection, before membership equality. i stops at the intended real-subclass control. These mutants do not themselves demonstrate execution of the later set-equality assertions.

**b/c reuse is valid under the packet's unchanged-target exception.** Database source and rollback test are byte-identical across r0, r1, and this tip. Current source SHA-256 is `61d74d704a4ea87b6f4f0d4b69d35637582d0d6859181f47cff77c226961eced`; rollback test SHA-256 is `0d94fe447aeb0a76b4e20fce1f57863e6876e664929a05de01c207ca4fd0359f`. STRENGTH: **entailed** for transcript contents and byte comparisons; **consistent-with** for historical execution and the expectation that rerunning b/c would reproduce it. No mutant was rerun by this reviewer.

## Alphabet, regression scope, and gates

Fresh syntax-tree extraction measures **698 distinct output strings**: 398 domain codes and 215 message constants with five overlaps, plus 20 dependency outputs, 43 SQLSTATE-class outputs, 25 class outputs from 32 keys, and two fallbacks. The fixed runner prefix preserves cardinality. The 916 lines before the end marker are byte-identical between copies. All four r0 message/dependency/SQLSTATE/class lists remain unchanged in value and order. STRENGTH: **entailed**.

F1 remains closed: API `:973` and runner `:5309` perform exact lookup and return a declared literal or fixed typed fallback. API `:1000` forwards that result; runner `:5336` adds only its fixed prefix. The API operational record at `:1390` and runner terminal-failure recording at `:5362` continue to receive those bounded outputs. The rollback source/test is unchanged from the accepted r0/r1 review; public code/message preservation and its existing failure partition stand. Round 2 replaces source-derived positive expectations with explicit snapshots, adds the required negative and subclass controls, and appends 15 TOOLING-TRAPS lines. Removed size-only/source-driven assertions are replaced with stronger equality assertions; existing plain-error and twin controls remain. STRENGTH: **entailed** for source/diff facts. No new combined-cleanup behavioral coverage is asserted.

Fresh reviewer command, run once per permitted unit file, on Node **v25.7.0**, with only inherited `PATH`, `HOME`, and `TMPDIR` passed to the child environment:

`pnpm exec vitest run tests/unit/api-operational-error.test.ts tests/unit/dev-runner-reconciliation.test.ts tests/unit/run-rollback-categories.test.ts --no-cache`

**3 files passed; API 7/7, runner 8/8, rollback 4/4; 19/19 total; exit 0; 2.73 seconds.** STRENGTH: **entailed** by fresh tool output.

| Saved gate at `d797d805` | Artifact result checked |
|---|---|
| `r2-11-gates-unit.log` | API 7/7 ×3, runner 8/8 ×3, rollback 4/4 ×3; nine explicit numeric `EXIT = 0` records. |
| `r2-12-gate-s6-integration.log` | 48/48, exit 0; embedded-PostgreSQL startup and final result inspected. |
| `r2-13-gate-typecheck.log` | Eight inherited `error TS` diagnostics, exit 1; ordered diagnostic bytes equal base `02-typecheck-baseline.log`, also exit 1. |
| `05-red-r2.log`, historical `47479453` plus labeled test edits | 4 failed / 11 passed, exit 1: F2 and F3 frames in each formatter. |

The typecheck diagnostic SHA-256 is `50151cc3292b79e4a1dcfd8342d5db0473bbaadb4a6d4963a2d4146121ea3120` for both files. This is baseline-equivalent, not a green typecheck. STRENGTH: **entailed** for saved results and fresh byte comparison; **consistent-with** for their historical execution. The unit gate's unpiped capture method is stated in its header; the reviewer can verify numeric exits, not reconstruct the original shell process from that header alone.

Fresh supplied `stamp-check.sh`: r2 prefix **11 records / 0 failures / exit 0**. Whole directory: **38 records / 27 historical mismatches / exit 1**. The historical records comprise three base captures, two later RED captures, two prior reviewer snapshots, nine r0 records, and eleven r1 records. Their historical stamps should remain. STRENGTH: **entailed** for fresh comparator output and record grouping.

## Packet audit

**AMENDMENT 2 — clear; required repair fulfilled.** It identifies the exact F2 extraction mistake and F3 omitted producer form, accepts a committed expected list, requires explicit negative and real-subclass controls, and orders refreshed gates and f/g/e mutants. Each is present at the required tip. a/d were additionally rerun; h/i were added. b/c are properly cited under the unchanged-target exception. The expected-list provenance qualification above prevents treating the snapshot as a second derivation; it does not add a new landing prerequisite beyond the amendment.

C1's revision correction and C2's specified stopping-assertion correction are carried. The prior three evidence corrections also remain carried: source comments name `r0-03-allow-list-citations.log` (API `:586`, runner `:4922`), the self-report counts seven r0 files including TOOLING-TRAPS, and the RED narrative attributes the digest frame to the relevant mutants. The admission vocabulary is explicitly distinguished from runtime propagation, and the rollback neither-failed case remains rethrow of the initiating error.

The amended worker packet and dispatch are byte-identical. The provisioning artifact ends with the exact pinned-base `PROVISIONED OK` line and records install/generation exit 0. The round-2 commit precedes the saved r2 gate/mutant timestamps. All cumulative source/test changes stay within the granted seven paths; no dependency, shared module, migration, or unrelated source edit appears. Twin-copy acceptance and the shared-module follow-up remain appropriate. STRENGTH: **entailed** for the packet, scope, and artifact facts; **consistent-with** for the landing/design judgment. Provisioning and follow-up ticket filing were not replayed or independently established beyond the stated artifacts.

## Landing

**Mergeable into pinned dev; approve landing of `d797d8052c10bd095373f238d4c456064be77fe1`.** Fresh `dev` still resolves to `d5b4f7f568aceec55a9cfca72b62473e7ee26c19`, also the merge base. Isolated `git merge-tree --write-tree <base> <tip>` exited **0** and returned:

`b5500995e0816b5b2de9dbe15277dae29942d1d4`

This equals the reviewed head tree. The command used a disposable `GIT_OBJECT_DIRECTORY`, with the repository's object store as a read-only alternate; the temporary directory was removed. No actual merge or checkout/ref mutation was performed. `git diff --check <base> <tip>` exited 0, and the lane remained clean after the permitted tests and merge calculation. STRENGTH: **entailed** by fresh checks. Acceptance relies on the tested tip and pinned base, not an unexamined future dev revision.

## Not verified

- No fresh integration, typecheck, mutation, provisioning, deployment, or declared Node 22.23.1 execution; saved evidence and the Node v25.7.0 unit rerun are distinguished above.
- No proof of every producer's runtime propagation, external control of a production typed code, or production disclosure. This is declared-membership and diagnostic-boundary verification.
- No second worker extraction implementation was supplied or rerun. The independent domain reconstruction was performed by this reviewer. The message list was compared with its citations and existing map, without independently recreating every message producer citation.
- No general correctness guarantee for the source-text list readers under arbitrary future syntax changes, hostile getters/proxies, modified built-ins, or adversarial in-process mutation.
- No additional dynamic casing/whitespace/cause probes, behavioral combined rollback/key-destroy execution, or line-by-line replay of the entire integration log.
- No broad repository scan, follow-up issue creation, board/DECISIONS edit, push, or actual merge. Only the two requested reviewer reports were authored.

STRENGTH: **undetermined** for unperformed checks and production claims. These limits do not leave F2 or F3 unresolved.

REWORK: approve — both membership defects are fixed, the independent producer audit matches all 398 admitted codes, and the reviewed tip is mergeable into pinned dev with the required evidence carried.
