CODEX REVIEW T1-ORACLE-EVALUATOR r2 — CHANGES · comments read through: t1-oracle-evaluator-r2-2026-09-07

BLOCKING: 11 / FOLLOW-UP: 2.

Reviewed clean tip **23ec6717b32b6fc9509b573da32bd5dda9e5d7f8**, against base **90cf50891d8a60bfb36d51651eb49de528834889**. The diff is exactly the two advertised files: evaluator +722 lines, test +205. LoginFlow and the dependency files are unchanged. **STRENGTH: entailed.**

The named regression verdicts work, but the implemented evaluator is not the complete R4 contract. Fresh source-only probes reproduce both missed ruled domains and wrong positive verdicts. **B1–B11 are round-2 defects.** F1 is a newly exposed conflict between the plan's ownership fallback and its shipped-population prediction, to resolve before round-3 emission; F2 narrows an attribution claim. These are bounded implementation/contract corrections, not a request to restart the parser architecture.

Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

## B1 — BLOCKING: parameter-name checking admits default and rest parameters

**File/line:** [depthOracle.ts:319](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:319) and [depthOracle.ts:541](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:541).

**Input → wrong outcome:**

    const choices = [0,1,2,3,4,5].map(n=>n===0?undefined:n).map((n=1)=>n);

One candidate, literal (16,29), returns **OTHER**, with cells `[undef,1,2,3,4,5]`. The default parameter replaces undefined with 1 in JavaScript, so the defined domain is 1..5. The evaluator ignores that initialization. Similarly:

    const choices = [0,1,2,3,4,5].filter((...n) => n);

returns **RULED** with [1,2,3,4,5], although a rest parameter receives an array of callback arguments and is truthy for all six elements. Checking only `isIdentifier(first.name)` does not establish that the parameter is a plain identifier.

**Required fix:** reject initializers/rest and other unsupported parameter syntax under clause 1 in every callback operation; return whole-operation UNKNOWN with an attributable reason. Exact default/rest modelling is unnecessary. Add both discriminators, keeping K7's parameter-count mutation independent.

**STRENGTH: entailed** for fresh evaluator results and the unmodelled parameter semantics; native fixture callbacks were not executed.

## B2 — BLOCKING: flatMap bypasses the purity contract and rejects an admitted block form

**File/line:** [depthOracle.ts:537](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:537), [depthOracle.ts:622](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:622) and [depthOracle.ts:640](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:640).

**Input → wrong outcome:**

    const choices = [0,1,2,3,4,5].flatMap(async n => n ? [n] : []);

returns **RULED** [1,2,3,4,5], instead of clause-4 UNKNOWN. An async callback produces promises; it does not produce those numeric cells.

    const choices = [0,1,2,3,4,5].flatMap(n => true ? [n] : [(n = 1)]);

returns **OTHER**, although assignment anywhere in the callback expression violates clause 3. Only the taken branch is checked. Conversely:

    const choices = [0,1,2,3,4,5].flatMap(n => { return n ? [n] : []; });

returns **UNDETERMINED**, despite the expressly admitted return-only block and flatMap shape; expected RULED.

**Required fix:** give flatMap the same parameter, exact-body, whole-expression purity and async/generator checks as map/filter, with its narrowly declared array-shape exception. Admission examines the whole syntax; evaluation then visits only the selected branch. Preserve parentheses and the return-only block. Report its rejection reason too. Apply the shared work limits as specified in B4.

**STRENGTH: entailed**, from all three direct source-only executions and the separate flatMap path.

## B3 — BLOCKING: the purported closed grammar is a partial blacklist

**File/line:** [depthOracle.ts:274](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:274) and [depthOracle.ts:337](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:337).

**Input → wrong outcome:**

    const choices = [0,1,2,3,4,5].map(n => true ? n : ++n);
    const choices = [0,1,2,3,4,5].map(n => true ? n : void n);

Each independent source returns **OTHER**, with the original 0..5 cells. Neither increment nor `void` belongs to §3.13's closed expression grammar. The visitor rejects selected node kinds but admits every other kind/operator by default; evalPrim never sees the untaken expression.

**Required fix:** implement positive admission of the declared expression forms/operators, including the explicit atomic JSX treatment and flatMap exceptions. Keep unsupported syntax UNKNOWN for the whole operation even when it is in an untaken branch. This does not require evaluating both branches and must not become K36's deliberately wrong branch-join rule.

**STRENGTH: entailed** for the accepted syntax, observed OTHER results and mismatch with §3.9 clause 3.

## B4 — BLOCKING: the recorded work limits are not enforced on the recorded body

**File/line:** [depthOracle.ts:326](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:326), [depthOracle.ts:341](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:341), [depthOracle.ts:538](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:538); [manifest:31](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-manifest.md:31).

**Input → wrong outcome:** the following admitted return-only callback has **66 body-inclusive nodes / depth 11**, but returns RULED instead of budget-exhausted UNDETERMINED:

    const choices = [0,1,2,3,4,5].map(n => { return n + ((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))); }).slice(1);

The expression-only counterpart is **64 / 9** and correctly fits. admitCallback measures the extracted return expression, omitting the Block and ReturnStatement. A return-only callback containing 32 parentheses around n likewise measures **35 / 34** from the actual callback body but is accepted after measuring only the expression at depth 32.

FlatMap does not measure its body at all: wrapping K31's 128-node expression in `[...]` gives **129 / 12** and still returns RULED; `[32-parenthesized n]` is accepted at depth 33. Exact source generators and observations are in the companion self-review.

**Required fix:** count from the original callback body node, using the agreed body=0 forEachChild semantics, before interpreting the extracted expression. Apply both limits to flatMap as well. Assert admitted 64/32 boundaries and independently exhausted node/depth cases, including return-only blocks; K31 alone cannot establish these boundaries.

**STRENGTH: entailed**, from independent AST counts and direct results. This is a counter-semantics defect, not a request to change the agreed limits.

## B5 — BLOCKING: two explicit Prim transfer cases are missing

**File/line:** [depthOracle.ts:354](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:354) and [depthOracle.ts:451](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:451); [plan:1251](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1251).

**Input → wrong outcome:**

    const choices = [0,1,2,3,4,5].map(n => (<span/>)).map(n => n ? 1 : 0);

returns six unknown cells / UNDETERMINED. The declared ToBoolean(jsx) is true, so expected cells are six numeric 1s / OTHER.

    const choices = [0,1,2,3,4,5].map(n => "" + null);
    const choices = [0,1,2,3,4,5].map(n => undefined + "");

Each independent source returns six unknown cells / UNDETERMINED. The exact string-concatenation rule requires six `str("null")` or `str("undefined")` cells / OTHER. The renderer handles only str/num/bool.

**Required fix:** implement JSX truthiness and null/undefined string rendering, retaining conservative treatment of unknown or unavailable object coercions. Pin the actual primitive payloads, not just their tags.

**STRENGTH: entailed** for the fresh outputs and explicit table mismatches. These are excess reports, not demonstrated misses.

## B6 — BLOCKING: zero-argument splice returns the wrong cells

**File/line:** [depthOracle.ts:599](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:599), especially lines 606–609.

**Input → wrong outcome:**

    const choices = [0,1,2,3,4,5].slice(1).splice();

returns **RULED** [1,2,3,4,5]. A zero-argument splice removes nothing and returns []; expected **OTHER / EXACT []**. The implementation treats omitted start as 0 and omitted deleteCount as the whole length, conflating splice() with splice(0).

**Required fix:** distinguish zero, one and two arguments. Preserve the existing removed-elements rule for splice(start), and test the zero-argument case after a ruled derivation so the error changes the verdict.

**STRENGTH: entailed** for the code path, direct result and zero-argument return contract.

## B7 — BLOCKING: binding syntax is silently ignored, producing missed domains

**File/line:** [depthOracle.ts:787](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:787).

**Input → wrong outcome:**

    const [[head, ...choices]] = [[0,1,2,3,4,5]];
    const [...[head, ...choices]] = [0,1,2,3,4,5];

Each independent source returns **OTHER** with the untransformed 0..5 cells. In each, choices binds [1,2,3,4,5]. bindingValue neither interprets nor rejects a nested binding name.

    const [choices = Array.from({length:5}, (_,i)=>i+1)] = [0,1,2,3,4,5].map(n=>undefined);

returns **OTHER** with one undef cell, ignoring the default initializer that constructs the ruled domain.

**Required fix:** conservatively reject unsupported nested/default binding forms before classifying outputs, or explicitly model them. Rejecting them to UNKNOWN is sufficient within this bounded grammar. Preserve the already working elision offsets, nested array payload extraction into a plain name, and any-RULED aggregation.

**STRENGTH: entailed** for fresh results and the ignored binding fields. These are within-declaration misses, not the declared cross-statement discovery exclusion.

## B8 — BLOCKING: consumedStart never moves to the consumed owner

**File/line:** [depthOracle.ts:647](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:647), [depthOracle.ts:867](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:867); [s1-1-depth-contract.test.ts:632](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:632).

**Input → wrong outcome:** canonical K45 correctly returns UNDETERMINED but reports **consumed (64,87)**. The rejected outer call is **(16,87)**. The computed-member twin similarly reports **(64,90)**, instead of (16,90). The literal identity remains (64,77) in both.

Fresh AST inspection confirms receiver=true, callee=false, argument=true. The callee guard is correct. The defect is that every evaluated record unconditionally sets consumedStart to candidate.start; K45's test explicitly asserts the wrong 64. Wrappers, Array.from/Set, enclosing arrays and binding declarations have the same left-boundary problem.

**Required fix:** carry both consumed boundaries through ownership transitions. Use the actual consumed node's start/end, including the whole rejected call. Keep literal start/end unchanged for occurrence identity and preserve rule-1's early stop. Assert both boundaries on both K45 forms and on representative wrappers/bindings.

**STRENGTH: entailed** for exact AST/evaluator measurements and the incorrect test. Displayed sites are round 3; these evaluated-record spans are expressly round 2.

## B9 — BLOCKING: an exact sibling spread is always rejected

**File/line:** [depthOracle.ts:736](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:736), specifically line 745; [plan:1372](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1372).

**Input → wrong outcome:**

    const choices = [...[0,1,2,3,4,5], ...[6]].slice(1);

The two candidates, (20,33) and (38,41), both become **UNDETERMINED**. Both spread operands have exact numeric values; the declared ordered sibling-fold rule yields [1,2,3,4,5,6] / OTHER. The code rejects every sibling SpreadElement without considering its operand.

**Required fix:** fold sibling spreads whose values are exact under the admitted grammar, in order, with collection conversion as declared. Retain UNKNOWN for an unmodelled sibling. Add a decided negative and a ruled sibling-spread case; numeric scalar siblings alone do not cover this row.

**STRENGTH: entailed** for the two outputs and the explicit exact-spread rule. This is conservative over-reporting inside promised grammar.

## B10 — BLOCKING: Object.freeze bypasses NOT_ARRAY continuation

**File/line:** [depthOracle.ts:731](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:731); [plan:1330](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1330).

**Input → wrong outcome:**

    const choices = Object.freeze([0,1,2,3,4,5].join(""));

returns **NOT_ARRAY / OTHER**, whereas §3.15 explicitly sends any further operation/member/wrapper over NOT_ARRAY to UNKNOWN. The freeze branch preserves the scalar state without the guard used for Array.from, Set and members.

**Required fix:** apply the receiver-state continuation rule before freeze identity; identity applies to exact values. If a narrower, more precise freeze exception is intended, it needs an explicit contract amendment rather than an unreported deviation.

**STRENGTH: entailed** for the direct output and written-contract mismatch. The native result here is a string, so this particular deviation is semantically conservative in the opposite, more precise direction; it is not evidence of a native array miss.

## B11 — BLOCKING: the committed assertions do not cover the required round-2 rows

**File/line:** [s1-1-depth-contract.test.ts:504](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:504), [s1-1-depth-contract.test.ts:608](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:608); [plan:2756](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:2756) and [manifest:83](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-manifest.md:83).

**Input → wrong outcome:** K43's test asserts literal offsets and final UNDETERMINED only. It never asserts the promised six known `str("x")` receiver cells. An earlier map failure could satisfy it; the stub transcript actually shows K43 green. The manifest explicitly requires the known-receiver assertion to prevent that confound.

More broadly, the 32 added instances do not instantiate all §3.6/§3.14–§3.18 rows. There are no persistent candidate-level controls for default sort order, the flatMap worked rows, exact sibling spread composition, the Set-sentinel contrast, freeze/includes/JSX in their modelled contexts, or the independent depth boundary. Several controls assert only verdict when the stage contract calls for cells and consumed boundaries. Consequently the selected group is green while B1–B10 remain.

**Required fix:** add the required table-driven candidate assertions and the above discriminators, using complete source, discovery identity, full Cell payloads, whole Value kind, both consumed boundaries and reasons where required. Add an observable known-receiver check for K43 (a prefix evaluation or a trace/assertion of the receiver stage). Keep all seven controls and O1 cases written first; do not wait for round-3 mutation work to supply missing round-2 semantic coverage.

**STRENGTH: entailed** for the test inventory, K43 omission, stub observation and stage assignment. Passing the current 32 additions does not establish complete evaluator coverage.

## F1 — FOLLOW-UP / round-3 prerequisite: the shipped population is not the predicted one

**File/line:** [tokenUnlock.ts:36](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/apps/ui/lib/v3/tokenUnlock.ts:36), [depthOracle.ts:777](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/support/depthOracle.ts:777), [plan:1908](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1908).

**Input → wrong outcome:** the exact shipped condition is:

    if (error.serverCode === "API_UPSTREAM_UNREACHABLE" || [502, 503, 504].includes(error.status)) {

A fresh scan of the oracle's exact roots/extensions/exclusions parsed **232/232 files**, including **59 TSX**, and evaluated **33 candidates**: **32 OTHER, 1 UNDETERMINED**. The exceptional candidate is tokenUnlock.ts:36, literal **(1900,1915)**, reason **"unmodelled owner"**. Includes first produces NOT_ARRAY, then the enclosing binary OR hits the fallback. Even the simpler complete source `if ([502,503,504].includes(status)) {}` becomes UNKNOWN at IfStatement.

LoginFlow itself is correctly OTHER with six JSX cells, literal (10807,10825), line 252. The 23 freeze candidates are OTHER. Thus the predicted zero-DOMAIN population is not achieved.

**Required fix / stage:** explicitly reconcile the plan's terminal/ownership contract with its shipped prediction before round-3 dispatch relies on total 1 or K4. The present fallback follows §3.16 literally, so I do **not** charge this as an invented round-2 implementation deviation. It exposes a specification/composition gap that the assertion coverage in B11 should have made visible. A narrowly defined consumption/context rule needs positive and conservative counter-controls; do not restore blanket NOT_ARRAY absorption or stop at arbitrary scalar prefixes. Retain K50 and unknown enclosing-call controls, and do not exempt tokenUnlock by path.

With current evaluation and the planned reporting predicate, emission would add this DOMAIN site: expected total **2**, freeze mutation **25**, includes mutation **2 → 2** (non-discriminating), JSX mutation **3**, rather than 1/24/2/2. Those are conditional emission predictions, not observed site outputs. Remeasure all three models at actual emission.

**STRENGTH: entailed** for the fresh corpus counts and current fallback; **consistent-with** for the conditional future emitted counts; future implementation **undetermined**.

## F2 — FOLLOW-UP: narrow the POL-03 causal claim

**File/line:** [worker report:1444](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator.md:1444), [worker self-report:1051](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-self.md:1051), [21-r2-reconciliation.log:24](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/21-r2-reconciliation.log:24).

**Input → wrong outcome:** zero textual references and an unchanged database package are promoted to **"mechanically unreachable from this diff" / entailed**; the self-report calls a zero grep result decisive. This excludes neither timing/resource effects during a full-suite run nor an unobserved indirect dependency. The actual failed assertion is a **child-process exit code 1 versus 0**, not an event count ([pol03-pool-resilience.test.ts:27](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/integration/pol03-pool-resilience.test.ts:27)).

**Required fix:** state the observed direct-import/diff facts as entailed; retain **consistent-with context sensitivity / exact cause undetermined / may recur** for attribution. Remove the general zero-grep causal rule and name the failed exit-code assertion precisely. The recorded isolation experiment already exists: [20-pol03-attribution.log:15](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/20-pol03-attribution.log:15) gives the command, same tip, three named passing instances and exit 0. An additional isolation run is not necessary to support that bounded classification in this review. The supplied record is condensed, not a full raw Vitest transcript; I did not independently rerun it.

**STRENGTH: entailed** for artifact contents and the missing causal implication; **consistent-with** for context sensitivity. No definite root cause or causal exclusion is established.

## What the source-only checks clear

The companion [self-review](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-codex-r2-self.md) records the instrument and reproduction inputs. It transpiles only the unchanged evaluator module in memory, then passes fixture strings to its parser/evaluator. It does not execute fixture callbacks or import the suite.

- **57 expanded worked/negative-space cases** from §3.6 and the R1–R3 counterexample classes returned the expected current-contract verdicts. This includes ordered reverse/sort then slice, terminal filter/flatMap/splice, even predicates, non-finite propagation, unary versus binary string conversion, rest elisions, nested payload extraction, comma roles, unknown enclosing calls, and both Set sentinel outcomes. This clearance concerns those verdicts; B8 still invalidates some consumed spans.
- **40 manifest source rows** in Part 2, excluding shipped/address/diagnostic rows and using the first source of paired K44, were parsed and evaluated directly. Their baseline verdict lists match the manifest, including empty lists for K28/K38. This is not 40 mutation runs.
- Separate checks confirmed positive-zero/negative-zero equality in Set; typed distinctions between string "1"/number 1, false/0, null/undefined; and UNKNOWN for JSX/nested-array identity. Primitive payloads survive across callbacks. Rule 1 wins before a map-to-zero suffix.
- Independent map/filter probes give attributable clause-1, clause-2, assignment-clause-3, async-clause-4 and generator-clause-4 reasons. K7d's exact canonical source returns (16,29), line fields 1/1, UNKNOWN/UNDETERMINED, with assignment in the reason. This clears those actual paths, not the flatMap/shared-admission holes.
- Dotted and computed K45 both satisfy receiver=true, callee=false, argument=true. Their actual outer-call ends are 87 and 90. The invocation guard is correct; consumedStart is not.

**STRENGTH: entailed** for these direct observations. Universal soundness beyond the exercised grammar/input classes remains unproved.

## Stub RED and the controls-first assertions

[05-stub-RED.log:51](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/05-stub-RED.log:51) shows all **five named failures by wrong verdict**: two expected RULED, three expected OTHER. The detailed failure section deduplicates identical assertions, but the five verbose names and their arrow messages are distinct observations. No missing API or parse failure explains them.

The stub group is **90 selected = 17 failed + 73 passed**, with 13 unrelated skips. Two failures are inherited; the other **15** include verdict, exact-value, reason and span assertions. K7d fails its **assignment reason**, K10 fails the **EXACT value** requirement, and K45/twin fail consumedEnd. Thus "15 semantic failures" is accurate; it must not be restated as "15 wrong-verdict failures." Bare 0–5/1–6, rule-1 controls and expected-UNKNOWN controls have the predicted green results.

| Control | What the committed assertion establishes | Disposition |
|---|---|---|
| K48, K49, K50, K51 | Canonical complete source; exactly one candidate via evaluateOne; RULED/RULED/UNDETERMINED/RULED | Required control instances exist before transfer rules in the stub record. |
| K7b, K7c | Canonical combined-effect and async-only sources; one candidate; UNDETERMINED | Present; final verdict alone is not proof of the rejecting clause. |
| K7d | Exact (16,29), both line fields 1, UNKNOWN value, UNDETERMINED and /assignment/i | Cleared, including actual rejection after implementation. |
| K20b, K34, K35, K37 | Canonical sources; one candidate; RULED/UNDETERMINED/RULED/UNDETERMINED | Present; additional stage-wide cell/span coverage is B11. |
| K10 | Exact numeric [1,1,2,3,4,5] and RULED | Baseline cleared. Future mutant evidence must show boolean payloads, not only "bool" tags. |
| K43 | Literal identity and UNDETERMINED, without known receiver cells | B11: manifest binding incomplete. |
| K45/twin | Literal identity, textual outer-call slices, right ends and UNDETERMINED | B8: first test pins wrong consumedStart, twin does not assert it. |

Evidence: [s1-1-depth-contract.test.ts:565](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:565), [s1-1-depth-contract.test.ts:579](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:579), [s1-1-depth-contract.test.ts:592](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:592), [s1-1-depth-contract.test.ts:602](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:602), and [05-stub-RED.log:76](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/05-stub-RED.log:76). **STRENGTH: entailed** for source assertions and recorded order/results; the uncommitted stub's entire historical byte state is not independently authenticated by that log.

## K28/K38, custody and the transcript recount

[09-K28-transcript-v3-final.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/09-K28-transcript-v3-final.log:1) and [10-K38-transcript-v3-final.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/10-K38-transcript-v3-final.log:1) each contain one clean v3 transcript at 23ec6717:

- declared `MUT_EXPECT=1`; pre/applied/restored token counts **0/1/0**;
- one named selected mutant failure, **received ['UNDETERMINED'] versus expected []**;
- command exit **1**, final **RESULT: ok**, empty porcelain;
- before/after module SHA-256 **d55203475b2c02fc4f5cf0bdafb02a900f1731a4f977762dc76a619c265b0f6d**, also equal to the current file.

The current source-only baseline is [] for each. Raw AST spans for the excluded arrays are **K28 (38,63)** and **K38 (16,18)**. The selected closing gate also records both canonical assertions passing after restoration.

**Clear the two mutation obligations and the combined baseline → mutant → restoration evidence, with an exact custody qualification:** the individual v3 logs run the mutant command only. Their "pre/restored 0" fields count mutation tokens, not evaluator results. They do not each contain three semantic test executions or print mutant candidate offsets. Baseline/restored semantics are supported by identical restored source, the closing gate and the fresh deterministic baseline probes; the mutant verdict list is directly printed. **STRENGTH: entailed** for those artifacts and source identity; historical execution beyond the recorded output is not inferred.

The manifest's actual observable column for K28/K38 is **CARDINALITY**, qualified by the UNDETERMINED verdict, not simply VERDICT. Reordering assertions captured that qualifier and was useful; the packet/self-report's claim that the column itself binds VERDICT should be corrected. No rerun is needed solely for that wording.

Mechanical recount of the operative table gives **48 distinct mutation IDs**. With K23/K25/K27 already discharged and K28/K38 cleared here: **5 of 48 discharged; 43 mutations + m6 = 44 remain**. The seven controls and K24 merge are not additional mutation transcripts. **STRENGTH: entailed.**

## Gate reconciliation and F2-R2 / F3-R2

The preconditions record [01-preconditions.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/01-preconditions.log:1) identifies clean base 90cf5089, the existing setup outputs and no provisioning. The raw selected/smoke/compiler evidence agrees:

| Evidence | Selected / passed / failed | Other-describe skips |
|---|---:|---:|
| [02-baseline-selected.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/02-baseline-selected.log:1) | 60 / 58 / 2 | 13 |
| [05-stub-RED.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/05-stub-RED.log:1) | 90 / 73 / 17 | 13 |
| [06-evaluator-first-run.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/06-evaluator-first-run.log:1) | 90 / 88 / 2 | 13 |
| [13-gate-selected.log:1](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/13-gate-selected.log:1) | 92 / 90 / 2 | 13 |

Independent name comparison: **32 added, zero removed**. Thirty evaluator/control instances precede the later two K28/K38 baselines. Smoke is separately 5/5 before and after. All eight complete compiler diagnostic lines match exactly: s14-ui lines 19, 131, 137, 208, 209, 239 and twice 241. These are recorded gate results, not fresh suite/compiler runs.

I ran the seat's **fourcount5.py** directly, without status-stealing pipelines, on the four named known-good logs and the new round-2 log. All returned **0**. Independent extraction also matched verbose failure identities to detailed FAIL identities in all five logs.

| Raw run | Test failures / load / skips / unhandled | Passed / total | Failed files / total |
|---|---|---|---|
| [Parent](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/w5/27-suite-run2.log:47684) | 80 / 1 / absent / 1 | 2338 / 2418 | 34 / 260 |
| [Round 0](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r0/25-full-suite-tip.log:47859) | 82 / 1 / absent / 1 | 2341 / 2423 | 35 / 261 |
| [Round 1 pre-rework](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r1/21-full-suite-tip.log:47781) | 81 / 1 / absent / 1 | 2363 / 2444 | 35 / 261 |
| [Round 1 rework](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r1/43-rework-full-suite.log:47819) | 81 / 1 / absent / 1 | 2371 / 2452 | 35 / 261 |
| [15-full-suite-r2.log:47873](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r2/15-full-suite-r2.log:47873) | 82 / 1 / absent / 1 | 2402 / 2484 | 36 / 261 |

"Absent" means no skipped summary category, printed as None by fourcount5; the arithmetic uses zero. The one load-only file is s14-ui throughout. Round 2 has 35 files owning failing tests plus that load-only file.

**2452 + 32 = 2484; 2371 + 32 − 1 = 2402; 81 + 1 = 82; 35 + 1 = 36.** POL-03 is the only appeared full test name versus r1 rework, with zero disappeared. Versus parent, POL-03 and the named S5 password-to-TOTP/Argon2 instance appear, with zero disappearances. The r0-only absent registration name is specifically **"S3d rework4 labels the shallow register handoff by the successor address arm"**; other S3d-named tests still fail, so "registration S3d absent" must not be read as all S3d tests. J10 remains outside the selected describe. **STRENGTH: entailed** for identities, raw summaries and arithmetic; F2 governs causal attribution.

**F2-R2: CLOSED for the specified checker defects.** Fresh runs reproduced all four known-good exits and the 13 malformed/inconsistent categories of the filed 17-case matrix. I additionally tested leading separator, doubled separator and a standalone nonnumeric Errors value. Duplicate categories, empty segments, no-category summaries and bare Errors all exit 2; arithmetic mismatches exit 4; failed-file identity mismatch exits 5. All **21 direct checker invocations** (five good + sixteen negative) returned their expected exit. This does not certify arbitrary future Vitest formats.

**F3-R2: CLOSED for the named historical corrections.** [worker report:544](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator.md:544) withdraws the actual "Any lane … will see both" instruction. [worker self-report:490](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-self.md:490) fixes the fourth 42 in place; the other three count corrections are at self-report 474, 568 and 602. The donor range and PlusToken corrections are present. [worker self-report:894](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-self.md:894) explicitly withdraws replacing reading with grep. The broader-search record flags 17 entries, and the contextual reread accounts for all 17 as sixteen correction/donor-context entries plus the fourth stale 42. I checked the named surviving text and its corrections. I do not infer a universal absence of every possible prose overclaim; F2 is a new counterexample to that broader conclusion.

**STRENGTH: entailed** for the current corrections, instrument executions and records; the worker's claimed whole-record reading process itself is not independently observable.

## Round-3 dispatch contents

Round 3 should follow a reviewed round-2 repair, not absorb B1–B11 into an "emission-only" handoff. The coordinator's concrete dispatch should contain the following in addition to §8.17 R4 and the gated manifest:

1. **Pin the repaired tip and evidence.** Name the absolute lane working directory, the two source files, new reports and a new evidence directory. Preserve parser/dependency pins, the shared diagnostic accessor and the 27 ceiling controls. Carry the exact Node sentence above. Require the corrected worked-row/identity/cell/span assertions and the independent purity/budget discriminators to be green before emission.
2. **Resolve F1 explicitly.** Include tokenUnlock's actual condition as a complete source control, define the permitted consumption-context rule or obtain the necessary bounded specification decision, and rerun the source-only candidate census. Neither the old §6.5 zero nor this review's conditional 2 is a substitute for the final measurement. Preserve K50 and unknown-call conservatism.
3. **Stage the emission RED.** Wire candidate verdicts into domainSites with the deliberately wrong line:kind key; A3 must show **two literal identities but one emitted site**. Correct to start:end, then assert A3/A9 cardinality, exact displayed text and statement line. K45/twin must cover the whole rejected call in evaluated spans before their emitted records are checked. Preserve one occurrence/one decision across display windows.
4. **Remove both operative WHOLE_DOMAIN fallbacks and migrate all three bare controls.** Route them to domainSites; preserve the 27 malformed ceiling fragments on the text-only ceiling harness and the kindOf half of the special ceiling pair. Do not remove ceiling behavior while removing DOMAIN fallback. Replace the old local shipped alias with the complete composition. Keep failed parses at exactly one narrowed INCONCLUSIVE.
5. **Complete the LoginFlow modelled cases.** Use the nine complete layouts, with the actual JSX body, rather than turning the five intentionally truncated donor prefixes into positive modules. Those five remain failed-parse/zero-discovery/one-INCONCLUSIVE controls. Assert the shipped LoginFlow candidate's JSX cells/OTHER without a filename exemption; retain positive derivations from both 0–5 and 1–6.
6. **Remeasure the model mutants at emission.** Establish the actual shipped baseline and owning declaration. Independently apply/restore freeze, includes and JSX model removals. K3's **24** is a prediction to remeasure; K4 must demonstrably discriminate after F1 is resolved. Record complete path/line/kind/text output, not only a total.
7. **File the remaining 44 transcripts.** Use the corrected manifest: **43 distinct kill-expected mutations plus m6 survival**, retaining the five already discharged records. Each uses the canonical source and declared observable, v3, multiplicity where applicable, commands, full mutant output, cmd_exit, RESULT, pre/applied/restored counts, hashes and porcelain. Record semantic baseline/restoration evidence explicitly where possible; never relabel token counts as semantic results. K31 must isolate node budget with depth fixed; K43 must establish known receiver cells; K10 must show boolean values; K47 must retain duplicated same-sentinel bytes.
8. **Grant the production mutation target explicitly.** The next packet must authorize temporary edits to **/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine/apps/ui/components/LoginFlow.tsx** for K30 and m6 only, despite its round-2 read-only status. K30 plants data-capped={expansionDepth < 6}; m6 extends the actual 0–5 run to 0–6 and must **survive with exit 0**. Record each actual edited line, independent 0/1/0 restoration, matching hashes and final empty porcelain; make no permanent production edit.
9. **Name the closing gates and comparisons.** Capture current baselines; run smoke separately, the exact selected describe ×3, compiler diagnostics by full identity, and the planned full suite. Compare to this round's raw **82/1/None/1, 2402/2484, 36/261**, plus the r1/parent records above. Use validated fourcount5 plus independent names/file arithmetic. Treat POL-03 as may recur / cause undetermined, not an automatic exemption. Report actual instance growth; do not carry 92 as a fixed future population.

**STRENGTH: entailed** for inherited stage/grant/manifest obligations and the review's measured prerequisites; **consistent-with** for dispatch sequencing and unrun emission predictions.

## Packet audit

**CLEAR as the round-2 executable dispatch**, with the F1 specification conflict now newly exposed. The [worker packet](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t1-oracle-evaluator-worker-r2.md:1) and its [dispatch copy](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/dispatches/t1-oracle-evaluator-worker-r2-1.txt:1) include all nine r1c points and governing amendments: clean base 90cf5089, source grants, 60 selected plus separate smoke, semantic stub outcomes, seven controls/K7d reason, 64/32 body semantics, own-byte K45 measurements, v3 mutations, remaining 43+m6, and the exact carried Node sentence. **The full-suite decision is explicit: required at close.** The actual full-suite record exists at the advertised tip.

No missing permission explains the incomplete evaluator or omitted semantic assertions. LoginFlow was correctly left unchanged. Historical correction duties explicitly require in-place withdrawal; they do not require extra approval merely because the general reports grant says append. The coordinator must provide the temporary LoginFlow mutation grant in round 3.

**Charge the implementation/completion claims, not the presence of the nine-point instructions.** The worker's "complete declared evaluator," body-inclusive limits and full span claims exceed the code. The copied K28/K38 observable description should say CARDINALITY with an UNDETERMINED qualifier. The shipped zero/24/2/2 assumptions need F1's explicit reconciliation. POL-03's bounded attribution is earned; categorical causal non-reachability is not.

**STRENGTH: entailed** for packet contents, supplied artifacts and implementation contradictions; **consistent-with** for the review disposition.

## Not verified

No suite, typecheck, package installation, git mutation, live database experiment, native fixture callback execution, push or merge was performed in this review. No Node 22.23.1 verification occurred. Source-only probes ran on **Node v25.7.0 / typescript-classic 5.9.3**; transpiling the analyzer in memory is not a compiler gate. Worktree porcelain remained empty.

The reported 57 worked-case passes and 40 manifest-baseline probes are bounded observations, not a proof of every JavaScript expression or every mutation's discrimination. The historical stub's full source bytes, independent raw isolation transcript for POL-03, future emission display, K3's final emitted count, and future mutation restoration are unverified. Built-in-binding assumptions and declared empty/mixed/cross-statement discovery limits remain as specified.

Only the two requested review files are outputs. **STRENGTH: entailed** for this review's scope; unexecuted behavior **undetermined**.

## PREDICTIONS

1. Unchanged code will keep returning OTHER for B1's default-parameter chain and B7's nested/default bindings, and RULED for B2's async flatMap and B6's empty splice result. **STRENGTH: entailed** for deterministic repetitions on unchanged inputs/runtime.
2. Correctly asserting K45's consumedStart=16 will fail the current tests/code; its correct callee-role check alone will not fix the span. **STRENGTH: entailed.**
3. Emission using the current evaluated verdicts will report tokenUnlock in addition to the owning ceiling, and changing includes to UNKNOWN will not discriminate K4. **STRENGTH: consistent-with**, conditional on the planned emitter; current candidate UNDETERMINED is **entailed**.
4. Repairing only named happy-path fixtures will leave the other admission/ownership holes open. Regression coverage must include unsupported syntax and boundary pairs, as in B1–B11. **STRENGTH: consistent-with** as a development-risk prediction, not a claim about a future patch.
5. Re-running fourcount5 on the same five good logs and sixteen negative inputs will preserve the observed exits. POL-03's recurrence or root cause cannot be predicted from those counts. **STRENGTH: entailed** for the deterministic checker; **undetermined** for future POL-03 behavior.

ROUND 2: changes — repair the eleven round-2 defects and carry the explicit corpus/attribution qualifications before dispatching emission.
