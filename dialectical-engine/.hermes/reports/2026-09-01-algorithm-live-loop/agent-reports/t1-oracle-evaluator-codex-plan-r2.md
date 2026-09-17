CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r2 — CHANGES · comments read through: t1-oracle-evaluator-plan-r2-2026-09-06

BLOCKING: 6 / FOLLOW-UP: 2.

Reviewed the complete 1,842-line [revised plan](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md), SHA-256 `c00b6a76fd9703a4e91c77d5eb5445db65f9d12981f42d07869d14046616686c`, its 419-line architecture self-report, the complete r1 final verdict, both architecture packets/dispatch material, the ticket, and D67/D68 including the alias grant. The parked lane is `60641339b983365952dd6cd61ed2f379aef6dc8a`. Fresh source-only probes found 232 shipped files, zero byte mismatches against that commit, zero TypeScript 5.9.3 parse diagnostics, and 33 numeric-array candidates in six files. **STRENGTH: entailed.**

The parser choice is sound and the original opaque-filter defect is addressed. The plan still specifies silent misses and acceptance states that cannot hold together. The final architecture round needs the six bounded revisions below; worker implementation should wait. **STRENGTH: consistent-with** for the architectural recommendation; **entailed** for the contradictions identified below. This review evaluates a specification, not an implemented evaluator.

## Disposition of r1 B1–B8

| r1 item | Disposition against the required change | STRENGTH |
|---|---|---|
| B1 — lexical context and conservative failure | Resolved at the architectural level by §1.5–1.7: classic parser, explicit ScriptKind, parent nodes, content fixtures and file-level INCONCLUSIVE; no old-lexer fallback. Fresh probes recover both declarations the driver lost, exclude JSX display text, and find the nested-template array. Failure-policy integration and the proposed RED observation still need R2-B4/B5 below. | entailed for parser observations and specified replacement; consistent-with for future implementation |
| B2 — nonnumeric transitions and total callbacks | Partially resolved: the original string→multiplication chain now reports UNKNOWN and maps recompute cells. Not resolved as a total expression/value contract: booleans are erased before truthiness, and NaN truthiness is wrong. R2-B1. | entailed |
| B3 — opaque filter mutation | Resolved for the reported defect: SUBSEQ is deleted; arbitrary bodies, extra parameters, assignment and async forms go UNKNOWN; evaluation is bounded and does not execute callbacks. The original mutating filter therefore reports. Its proposed mutation control does not discriminate the parameter-count clause; R2-B6. | entailed for the written transition and native value; consistent-with for the stated built-in assumptions |
| B4 — complete expression/binding ownership | Partially resolved: parser nodes, spread siblings, rest elisions, type boundaries and rule-1 precedence are substantial corrections. Unmodelled enclosing calls explicitly stop with a known negative; nested array payloads and collection kinds are not representable in the declared lattice. The new NOT_ARRAY blanket introduces further misses. R2-B2/B3. | entailed for the gaps and specified wrong outcomes |
| B5 — structural addresses and occurrence identity | Resolved as an address design: parent statement, separate element/display lines, start/end identity and separate ceiling deduplication. Fresh ASI/JSX/two-occurrence probes match. A3/A9 site assertions cannot be assigned to the additive candidate-only round, and exact offsets/text still need concrete fixture constants. R2-B5. | entailed for measured addresses and stage mismatch |
| B6 — candidate population and shipped cost | Census corrected and independently reproduced: 33/6, 551 empty, 10 mixed, no rule-1 candidate. The three narrow modelling decisions support an expected zero DOMAIN result. This is not a measured evaluator verdict list, and the staged counts are wrong. R2-B5 and the population section below. | entailed for counts; consistent-with for expected final verdicts; undetermined for implemented output |
| B7 — completed controls and reachable rounds | Not resolved. Completing the nine LoginFlow layouts is correct, but the five deliberately truncated inputs assert DOMAIN instead of INCONCLUSIVE; additional unchanged ceiling fragments also fail parsing. Round 2 already requires the three models deferred to round 3. R2-B4/B5. | entailed |
| B8 — clause/mutant/control discrimination | Partially resolved: rule-1 and Set controls now discriminate, and m6 is correctly a survival check. K7 and the final K11 control remain equivalent under their stated mutations/rules; K20 is underspecified, K24 depends on a rejected recovery tree, and required clauses/m5 are absent. R2-B6. | entailed for the specification mismatches; undetermined for future mutant runs |

## R2-B1 — BLOCKING: the callback value domain cannot implement its own predicate controls

**Section:** §3.8–3.11 R2, especially [plan:830](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:830) and [plan:842](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:842).

**Input → wrong outcome:**

- `[0,1,2,3,4,5].filter(n => n % 2 === 0)` must be OTHER with cells [0,2,4]. The table maps numeric comparisons to NONNUMBER and maps NONNUMBER truthiness to UNKNOWN. Following those rules makes this filter UNKNOWN/report. The positive `filter(n => n > 0)` likewise cannot deliver the promised exact cells. There is no separate concrete boolean result type or predicate evaluator in the revised contract.
- `[0,1,2,3,4,5].map(n => n*n/n).filter(n => n)` natively returns **[1,2,3,4,5]**. The map uses only admitted numeric arithmetic and returns [NaN,1,2,3,4,5]. “Falsy iff n === 0” retains NaN, so the specified final numeric set is not ruled and the candidate is withheld. This counterexample does not need a conditional or a discarded boolean.
- The same information-loss issue reaches conditional conditions, `!`, literal booleans, and short-circuit expressions. Unary numeric coercion is listed in the grammar without its own transfer rule; the native ``map(n => `${n}`).map(n => +n).slice(1)`` also yields the ruled domain.

**Required change:** define a concrete primitive expression-result type (or an equally explicit separate predicate result) that preserves boolean truth values until operators, conditionals and filters consume them. State when results are abstracted into array cells. Define ToBoolean for NaN and signed zero, operand-returning short circuits and branch evaluation, unary coercion, and conservative exhaustion. Numeric non-finite results may instead become UNKNOWN, provided that direction reports. Add exact even/positive-filter controls, the NaN arithmetic chain, boolean/conditional controls, and both unary and binary nonnumeric-coercion controls. Recheck the §3.8 sentence that every admitted callback is evaluated exactly.

**STRENGTH: entailed.** Native results and a direct replay of the specified NaN truthiness rule were measured. The boolean contradiction follows from the stated result and truthiness tables. Whether an implementer would silently invent a richer intermediate type is undetermined.

## R2-B2 — BLOCKING: the new NOT_ARRAY list includes operations that return arrays

**Section:** §3.10 R2 [plan:862](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:862), and the non-call member row at [plan:890](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:890).

**Input → wrong outcome:**

```ts
const choices = [0,1,2,3,4,5]
  .reduce((a, n) => n ? a.concat(n) : a, []);
```

Native result: **[1,2,3,4,5]**. The numeric receiver is an eligible candidate; its callback is outside the grammar, but the unconditional `reduce → NOT_ARRAY` rule withholds it. Array.prototype.reduce returns the accumulator, which can be an array.

Likewise, each of the following suffixes on the same expression natively returns **[1,2,3,4,5]**:

```ts
[0,1,2,3,4,5].map(n => [n+1,n+2,n+3,n+4,n+5]).find(n => true)
[0,1,2,3,4,5].map(n => [n+1,n+2,n+3,n+4,n+5]).at(0)
[0,1,2,3,4,5].map(n => [n+1,n+2,n+3,n+4,n+5])[0]
```

The map is outside the callback grammar and becomes UNKNOWN. The named `find`/`at` rule, or the blanket non-call member rule, then converts that uncertainty into NOT_ARRAY and suppresses the candidate. An array element can itself be an array. This repeats the original absorption error with a different state name.

**Required change:** retain the narrow `includes → boolean` model. Split the operation list by actual return contract and receiver knowledge. Unsupported reduce becomes UNKNOWN; find/at/indexing require known element information or become UNKNOWN. The non-call rule must distinguish `.length` from arbitrary properties/indexes. Define subsequent operations over NOT_ARRAY/UNKNOWN explicitly; known non-array does not mean a later wrapper cannot produce an array. Add these controls and a continuation through an iterable scalar, or conservatively reject that continuation. No source callbacks need to be executed.

**STRENGTH: entailed.** All four native array results were measured; the suppressed outcomes follow directly from the unconditional table entries.

## R2-B3 — BLOCKING: the ownership walk still stops before unmodelled value-producing syntax

**Section:** §3.8 R2 and §3.12 R2 [plan:880](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:880).

**Input → wrong outcome / unresolved outcome:**

```ts
const choices = ((x) => x.slice(1))([0,1,2,3,4,5]);
```

Native result: **[1,2,3,4,5]**. The literal is the argument of an unmodelled call. The explicit stop row preserves [0,1,2,3,4,5] and labels that argument “the declaration's value,” so it withholds. This is within one declaration, not the declared cross-statement discovery exclusion. r1 B4 specifically required an unknown surrounding construct to become UNKNOWN without losing the occurrence.

Two other requirements still lack a representable contract:

- For `const [choices] = [[0,1,2,3,4,5].slice(1)];`, the enclosing-array rule stores the inner array as NONNUMBER, while the next binding rule needs the inner array's cells again. Cell has no nested value payload. The worker must invent retained structure or re-evaluation to make the promised exact result possible.
- Value contains ordered cells but no distinction between Array and Set, although their available methods differ. Full consumption must also cover all argument counts and receiver/callee relationships, rather than merely noticing a member node whose parent happens to be a call. The generic stop row for an unmodelled call currently also defeats the explicit UNKNOWN fallback for unsupported wrapper arities.

**Required change:** make unmodelled enclosing calls UNKNOWN and advance the consumed span to the rejected containing use; preserve rule-1 precedence. Specify the internal ownership result needed for nested array/binding extraction, collection kind, multiple bound outputs and their single candidate verdict, and supported arities/argument roles. Every unsupported suffix/wrapper must either be covered by a documented discovery boundary or report UNKNOWN; an argument value must not stand in for an unknown call result.

Use a compact grammar/transfer table with exact verdict, cells where known, and consumed start/end for the six r1 B4 cases, this unmodelled-call case, unsupported arities, and nested bindings. The old comma-expression punctuation negatives also need a disposition: A8's literal parent is a BinaryExpression, so the present catch-all makes it UNKNOWN; retaining their old no-site expectation requires a comma rule or a declared fixture adaptation. Exact support for arbitrary JavaScript is not requested.

**STRENGTH: entailed** for the native call result, AST parent relationships, stop-rule miss and absence of nested/collection representations; **consistent-with** for the recommended representation change.

## R2-B4 — BLOCKING: parse failure and the carried fixture floor require incompatible outputs

**Section:** §1.7 R2 [plan:424](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:424), §5.3 R2 [plan:1093](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1093), and §8.5's unchanged DEPTH controls.

**Input → wrong outcome:**

Each of the five original LoginFlow prefixes has a syntactic diagnostic under TSX parsing. §1.7 requires a file-level INCONCLUSIVE record; §5.3 explicitly tests `.some(s => s.kind === "DOMAIN_ENUMERATION") === true`. That assertion fails for the specified failure record. Calling the truncated input “UNKNOWN” does not reconcile the two public outcomes.

The problem also reaches the supposedly unchanged ceiling floor. Fresh parser probes reject these existing no-site snippets:

```ts
if (topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN) {
if (depth >= limits.maxDepth) {
maxDepth: 6,
if (!Number.isInteger(depth) || depth < 1) {
```

Their current tests call duplicateBoundSites and expect []. Adding the mandated INCONCLUSIVE result makes them fail. Some positive ceiling fragments are invalid too: a generic nonempty assertion could then pass because of INCONCLUSIVE, without testing the ceiling arm at all.

**Required change:** keep file-level parse failure conservative. Assert exactly one INCONCLUSIVE with path/line/diagnostic for each deliberate truncated fixture, without demanding a fabricated DOMAIN occurrence. Define the public signatures and relationship between `parseModule(path, source)`, `candidatesOf`, `sitesForFile` and `duplicateBoundSites`, including a TSX-aware policy for planted snippets and the path passed by the shipped scanner.

Adapt the legacy fragment controls into valid source while retaining their relevant line/conjunct layout, or test the preserved ceiling predicate through a clearly separate fragment harness. Positive ceiling controls must assert DEPTH_BOUND_LITERAL, not generic nonemptiness; an INCONCLUSIVE must not satisfy them. Keep separate intentionally malformed controls. Enumerate these floor adaptations alongside the nine completed LoginFlow cases. Do not weaken failure reporting just to preserve [] on incomplete snippets.

**STRENGTH: entailed.** Parser diagnostics were measured on all five prefixes and the four displayed negative fragments; the assertion conflict is explicit in the plan and current tests.

## R2-B5 — BLOCKING: the revised round states still cannot all be green as scheduled

**Section:** §8.1–8.5 R2 [plan:1532](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1532), plus A3/A9.

**Input → wrong outcome:**

1. Round 1 adds all §2 fixtures, including A3's two emitted sites and A9's one emitted site, while explicitly retaining the old DOMAIN emitter. The old emitter keys by line:kind and cannot emit A3's two same-line sites. Candidate identity assertions are feasible; the new site cardinality assertion is not.
2. Round 1's deliberately wrong ScriptKind produces a parse diagnostic and a recovered AST array. The new API rejects that parse. Thus “candidatesOf yields 1 instead of 0” is not an observation available through the specified successful-parse candidate contract. The raw recovered tree has one array; that is a different probe. Step 1 also needs enough candidate discovery implemented to run its count fixtures before Step 3.
3. Round 2 requires every §3.11/§3.12 row green, including includes, Object.freeze, and the JSX callback. Round 3 then expects those same models to be missing and implemented one at a time. Both stage descriptions cannot hold.
4. Even if all three models were deliberately absent, the shipped total would be **26 → 3 → 2 → 1**: one ceiling owner plus 23 freeze, one includes and one JSX candidate; then apply freeze, includes, JSX in that order. The specified “after each” counts **24 → 2 → 1** are wrong. **24** is the standalone freeze mutant's total when the other models are already correct.
5. The candidate interface contains neither final verdict/cells nor consumed span, and the API's table/parse-failure return shape is not defined. `candidatesOf(...).verdict` needs an explicit row selection/result type. Round 2's reviewer instruction to reject “block-bodied” callbacks also contradicts the admitted `{ return e; }` form.

**Required change:** preserve the candidate-versus-emission separation, with one explicit stage contract:

- Round 0: execute the dependency/resolution gate in F2 below.
- Round 1: parser and discovery/address records only. Deliberate wrong ScriptKind must fail by named parse diagnostics. Candidate-only A3/A9 checks belong here; site assertions belong to round 3. Give the fixture literals for exact offsets, display text and consumed spans where applicable.
- Round 2: implement the complete corrected evaluator, including freeze/includes/JSX because its existing acceptance rows require them. Define the typed evaluated-candidate result and a deterministic RED state whose failures are semantic assertions, not a missing export/property.
- Round 3: integrate emission and the completed/adapted controls; stage RED with a named emission defect. Check the three models through independent restored mutants: total sites **24**, **2**, **2**, each against the green total **1**. Alternatively, explicitly remove/reassign their round-2 acceptance rows and use the cumulative **26→3→2→1** sequence. Choose one sequence in the plan, rather than leaving this choice to the worker.

Assign every assertion to its first usable round. Keep named selector containment and baseline-relative diagnostics. The ≤1 implementation file plus test co-touch budget is sufficient for the first sequence if the implementation remains one module. A “split if >500 lines” instruction cannot silently introduce a second implementation file in a round; choose the boundary before dispatch if that split is needed.

**STRENGTH: entailed** for the incompatible acceptance rows, old deduplication, parser observation, interface omissions and derived arithmetic; **consistent-with** for feasibility of the corrected one-module sequence. Effort estimates remain undetermined.

## R2-B6 — BLOCKING: the clause matrix still has equivalent controls and missing assignments

**Section:** §6.7 R2 [plan:1237](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1237), §8.4 mutation acceptance.

**Input → wrong outcome:** ten-row spot-check, treating each named mutation literally:

| Row | Check | Result / STRENGTH |
|---|---|---|
| K1 | Remove rule 1; [1..5].map(n=>0) becomes [0,0,0,0,0]. | Discriminates site→no site. Native result entailed; predicted implementation mutation consistent-with. |
| K2 | Ignore Set dedupe before spread/slice(1). Correct result [2,3,4,5]; identity gives [1,2,3,4,5]. | Discriminates. Native values entailed; mutant prediction consistent-with. |
| K7 | Accept multiple parameters, but leave the other purity clauses intact. The named body contains an assignment statement before return and member access. | Still rejected by clauses 2/3; UNKNOWN→UNKNOWN, site→site. Non-discrimination entailed by the rules. |
| K11 | Use the note's final negative: flatMap(n=>n>0 ? [] : [n]). | Native [0], but the grammar admits c ? [e] : [], not c ? [] : [e]. Baseline already UNKNOWN; mutant also UNKNOWN. Non-discrimination entailed. |
| K12 | Return retained rather than removed splice cells. | [1,2,3,4,5] versus [0]; discriminates. Native values entailed; mutant prediction consistent-with. |
| K15 | Numeric rather than string sort before slice(1,-1). | [1,10,2,3,4] versus [1,2,3,4,5]; discriminates. Both values entailed. |
| K17 | Treat a spread with a sibling as identity. | Correct [1,2,3,4,5,6] versus inner-only slice [1,2,3,4,5]; discriminates. Native values entailed; exact mutant prediction consistent-with. |
| K20 | “Drop computed access.” | Deleting recognition reaches the documented UNKNOWN fallback; the positive still reports. An early-stop mutation would differ, but is not the same edit. Gap entailed; actual edit undetermined. |
| K22 | Replace Array.from with UNKNOWN. | Correct [2,3,4,5] negative becomes conservative positive. Native value entailed; mutation prediction consistent-with after the callback contract is repaired. |
| K24 | Reuse TSX→TS mutation and assert one candidate. | A recovered parser tree contains one array and a diagnostic; the proposed failed-parse API does not expose it as a candidate. K23's diagnostic gate is valid; K24 is not a second independent candidate mutation. Entailed. |

K18's elision value [1,2,3,4,5], K19's nested extraction, K25's ASI line 2 and K26's distinct source offsets were also checked; K19 still needs R2-B3's representation. K3's 24 total is a valid standalone counterfactual, not the stage count in §8.4. **STRENGTH: entailed** for those values/addresses/count arithmetic; **consistent-with** for future discrimination.

**Required change:**

- K7: isolate the parameter-count clause with a multi-parameter callback whose remaining body is admitted, e.g. `[0,1,2,3,4,5].filter((n,i) => 0)`: correct UNKNOWN/report; relaxing only the parameter-count gate yields []/no site. Retain the original mutating filter as a separate conservative control, and give full-body consumption/assignment rejection their own precise mutations.
- K11: use the already admitted negative `[0,1,2,3,4,5].flatMap(n => [n])`, or explicitly extend the grammar and repair predicate values before using the opposite conditional shape. Remove the abandoned alternatives from the operative row.
- K20: specify the exact edit and use a negative computed-access control such as `[0,1,2,3,4,5]["slice"](0,4)` to distinguish normal evaluation from fallback UNKNOWN.
- Merge K24 into K23 as a parse-diagnostic check, or define an actual separate candidate-finder mutation on a successful TSX tree. Do not require an array count from a rejected parse.
- Restore an explicit global UNKNOWN→OTHER mutant (the actual m3′ clause), the named m5 LoginFlow ceiling-planting mutation, and rows for omitted contract clauses: work-limit exhaustion, complete callback consumption, unsupported arities, unknown enclosing calls, primitive truthiness/conditional semantics, and empty discovery exclusion separately from mixed discovery. Add exact controls for the corrections in R2-B1/B2/B3.
- Distinguish candidate-verdict/cell assertions, address/cardinality assertions, parse failures, and site outcomes. K25 is a line change, not a verdict change; §8.4 cannot require every row to change verdict. K23/K24 are currently one mutation, so 28 rows are not 28 independent mutation transcripts.

“The table is not claimed complete” at line 1244 does not remove the adjacent universal “cover every clause named in §1–§5 R2.” The latter is still false. Rebuild the clause inventory after the semantic corrections and map each required clause to a precise edit and a discriminating assertion; derive the count from that inventory.

**STRENGTH: entailed** for the identified omissions, equivalences and contradictory universals; **consistent-with** for the replacement discriminators; **undetermined** for executed mutation outcomes.

## Parser choice and reproducible candidate population

The pinned root alias is the right mechanism: it makes test infrastructure own its parser dependency while leaving the root TypeScript 7 toolchain in place. Fresh package-relative resolution gives TypeScript 7.0.2's version shim at the root and TypeScript 5.9.3's createSourceFile in apps/ui. A preliminary direct directory require failed because it did not use package export resolution; the corrected createRequire probe above establishes the actual specifier behavior. No alias is installed in the parked corpus. The UI manifest specifies ^5.6.0; 5.9.3 is its resolved installed/locked version. **STRENGTH: entailed** for these facts; **consistent-with** for the alias recommendation.

The fresh census used the oracle's roots packages/apps/web beneath `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine`, extensions .ts/.tsx/.mts/.mjs, and six skipped directory names. All 232 source byte strings matched 60641339. NumericLiteral.text is normalized by the classic parser: e.g. raw 1_0/0x10/0o10/0b10 yield text 10/16/8/2; use that normalized value plus an explicit unary sign, not Number(raw source with separators). **STRENGTH: entailed.**

| File under the absolute lane's dialectical-engine root | Candidate lines | Count | Expected terminal reason |
|---|---|---:|---|
| apps/ui/app/api/[...path]/route.ts | 8 | 1 | Set of {204,205,304} |
| apps/ui/components/LoginFlow.tsx | 252 | 1 | Complete JSX map, nonnumeric elements |
| apps/ui/lib/totpQr.ts | 15, 16 | 2 | AsExpression then variable declaration; numeric sets {68,69}, {6,28,50} |
| apps/ui/lib/v3/tokenUnlock.ts | 36 | 1 | includes returns boolean |
| packages/evaluator/src/index.ts | 2542, 2569, 2595, 2606, 2669 | 5 | Numeric property values, sets {-1,1} or {0,1} |
| packages/register/src/auth-policy.ts | 590, 592, 612, 615, 616, 617, 618, 619, 620, 651, 652, 653, 654, 655, 657, 660, 670, 671, 672, 673, 674, 675, 677 | 23 | Object.freeze identity, non-ruled numeric sets |
| Total | No literal's distinct set is {1,2,3,4,5} | 33 | Expected 0 DOMAIN |

**STRENGTH: entailed** for the enumerated identities/counts/values; **consistent-with** for the final modeled outcomes. The two totpQr immediate parents are assertions, then declarations; this explains the plan's consumer grouping.

The three decisions are **Object.freeze identity**, **includes returning a non-array boolean**, and **complete JSX map bodies producing nonnumeric elements**. Each is sound for these observed uses under the stated standard-built-in/JSX assumptions. Their narrow soundness does not justify the extended reduce/find/at list. Final zero DOMAIN sites is an honest expected result of the corrected design, not an executed evaluator measurement. A worker must emit and review the exact candidate/verdict/reason/span/site list. The census alone does not establish an overall false-positive rate on unknown future code. **STRENGTH: consistent-with** for expected zero; **undetermined** for future implementation and rate.

The 551 empty and 10 mixed arrays are reproducible discovery exclusions. Mixed/empty/non-literal arrays and cross-statement indirection therefore delimit the claim; “all outside-grammar programs report” remains invalid. The counterfactual “including mixed candidates adds exactly ten sites” needs the actual changed eligibility/abstraction/ownership pipeline, not just ten discovered nodes. K28 can use a deterministic planted mixed fixture until that counterfactual is measured. **STRENGTH: entailed** for the exclusions/counts; **undetermined** for an implemented K28 site list.

## F1 — FOLLOW-UP: the inherited ceiling lexical defect is correctly scoped and documented

**Section:** §7.2 R2 [plan:1396](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1396).

**Input → wrong outcome:** the already validated r1 example, `const a = /[//]/; const depthSchema = z.number()\n  .max(5);`, remains an inherited miss in declarationUnits. §7.2 now records the exact case and preserves existing ceiling predicates/windows apart from removing their DOMAIN fallback and moving code.

**Required change:** no additional evaluator-plan expansion is required for this defect. Carry it as the named separate lexical follow-up and pin ceiling behavior during extraction. The fragment-harness adaptation in R2-B4 must not silently re-lex the ceiling arms.

**STRENGTH: entailed** for the recorded r1 evidence and revised scope text; **consistent-with** for continued deferral. This review did not repeat the r1 extracted-ceiling execution.

## F2 — FOLLOW-UP: round 0 needs an execution gate in the worker dispatch

**Section:** §0.8/§8.1/§9.7 R2 and D68 ADDENDUM.

**Input → wrong outcome:** package/lockfile permission and an install alone do not prove the alias imports under Vitest on the declared Node 22.23.1. The plan leaves those facts undetermined and schedules the engine check in round 1; its grant-refused/U9 text is stale after D68's grant.

**Required change:** the round-0 dispatch must make all of the following green before parser/evaluator implementation relies on it:

1. Exact root alias `"typescript-classic": "npm:typescript@5.9.3"`, expected root importer/lockfile resolution, and a reviewed dependency delta containing no unrelated upgrades; root `typescript` stays 7.0.2.
2. Successful authorized install and package-name import from the test context under **Node 22.23.1**, with Node and pnpm versions recorded. A Node 25 probe is not this gate.
3. A focused, counted Vitest smoke under the repository configuration imports the alias, verifies version/API, parses valid TS and TSX, confirms parent links, and detects a deliberately malformed input through the isolated diagnostic accessor. Exercise normalized numeric text and basic source positions. No relative dependency borrowing.
4. Record the pre-change selected-test and typecheck diagnostic-name baselines; after the alias change there must be no new attributable diagnostics. The historical eight s14-ui diagnostics are a baseline to verify, not an exemption for any eight errors.
5. The dispatch names the exact test-file co-touch/smoke location and absolute working directory/commands. If the exact Node runtime is unavailable, report that gate as unverified and stop dependent rounds.

The §1.7 acceptance snippet's chained `.filter(entry => entry.parsed.ok === false).map(...diagnostics)` does not narrow that nested union. A source-only in-memory TypeScript 5.9.3 check produces TS2339. Use an explicit guard/flatMap/loop with narrowing and require the worker's actual compiler baseline check; do not copy the snippet as certified type-correct.

**STRENGTH: entailed** for the missing executed evidence, stated versions, grant and synthetic TS2339; **consistent-with** for the proposed gate; **undetermined** for alias/Vitest/Node 22 execution. No suite, install or repository typecheck was run in this review.

## Packet audit

- **Clear D-R2-1 authority.** D68 ADDENDUM explicitly grants the root alias, package.json, pnpm-lock.yaml and one install for worker round 0. There is no outstanding permission question for that change. The stale “grant does not exist”/U9 text should be marked superseded in the last revision.
- **Clear the two requested F2 rulings.** LoginFlow is a named temporary mutation target for m5/m6; permanent source edits remain outside this scope. “≤1 implementation file per round, oracle test co-touched” is explicit. Carry the restoration/hash and discriminating-command terms into the worker packet. The missing operative m5 row is R2-B6, not missing authority.
- **Clear completion of the nine historical LoginFlow layouts as a permitted floor correction; charge the remaining incomplete-fragment/failure-kind conflict to the plan.** Preserve their complete wrapping/comment classes and assert deliberate truncation through INCONCLUSIVE.
- **Clear disposition (a).** The even-filter and positive-filter outputs are compatible. The architecture self-report properly charges its earlier “contract contradiction” to its own abstraction; R2-B1 is the remaining mechanism defect.
- **Clear this review's method/write scope.** Only the two named report files were written. No suite, pnpm, application import, source edit, git mutation or credential read was required. The two-output contract does not authorize a third fixture file, so concrete counterexamples and census evidence are included here.
- **Worker packet cleanup:** carry round 0 alongside the three implementation rounds, replace stale round/grant wording in the operative dispatch, provide the exact mutation harness and baseline-log paths, and use the repaired stage/fixture matrix. The plan also lacks its architecture packet's terminal PLAN READY FOR REVIEW/BLOCKED marker; restore the appropriate marker during the required revision. None of these requires asking again for an already granted action.

**STRENGTH: entailed** for packet/decision text, observed artifact state and review actions; **consistent-with** for dispatch cleanup recommendations. Absolute-path lint was not rerun in this review.

## Exact changes for the architecture seat's LAST round

1. Replace the callback-result/truthiness table with a closed primitive-expression contract; add the even-filter and NaN discriminators and defined unary/short-circuit behavior.
2. Remove false unconditional NOT_ARRAY classifications; give reduce, element-returning methods, indexing and later wrappers conservative or exact typed rules.
3. Complete ownership/consumed-span and nested-binding/collection contracts; unknown enclosing calls must report. State arities and the comma-fixture disposition.
4. Unify parse-failure kinds and API signatures; adapt every affected historical fragment control, with positive ceiling checks that cannot pass on INCONCLUSIVE.
5. Choose one coherent four-stage sequence with typed candidate records, round-1 candidate-only addresses, round-2 complete models, round-3 emission/mutations, and correct independently derived counts. Incorporate D68's already granted alias and the round-0 gate.
6. Replace the defective matrix rows, restore global-UNKNOWN and m5 coverage, inventory the omitted clauses, and distinguish mutation outcomes by their actual asserted observable. Update the self-report and perform the semantic universal sweep over the revised text, including “every callback,” “every clause,” “each mutation changes verdict,” and “exact measured rate.”

**STRENGTH: entailed** for traceability of this list to R2-B1–B6. These are specification edits; no implementation is requested from the architecture seat.

## Not verified

**STRENGTH: entailed as review limits.** No evaluator implementation exists in the reviewed lane. No pnpm/install, Vitest suite, repository tsc/typecheck, b14, source-mutating mutant, application import, live service or git mutation was run. The in-memory compiler check covered one synthetic union-narrowing snippet only. Compiler libraries were imported for source parsing; native execution was limited to the explicit finite examples in this report and its supporting probes.

Node 22 execution, root-alias/Vitest resolution, future parseDiagnostics compatibility, actual candidate/verdict/site output, final false-positive rate, mutant transcripts, new suite-name sets, file-size/effort estimates, and complete JavaScript soundness remain **STRENGTH: undetermined**. The packet's static/source-only method does not permit converting those gaps into test-pass claims.

PLAN: changes — retain the classic-parser architecture and correct the six specified semantic, fixture, round-state and mutation-contract defects before dispatching implementation.
