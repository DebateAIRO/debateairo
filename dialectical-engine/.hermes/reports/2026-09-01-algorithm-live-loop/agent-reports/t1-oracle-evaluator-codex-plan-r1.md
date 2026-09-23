CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r1 — CHANGES · comments read through: t1-oracle-evaluator-plan-2026-09-06

BLOCKING: 8 / FOLLOW-UP: 2.

Reviewed the 846-line [plan](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md), SHA-256 `f00f20862f07ebbbe33bfa6989833f8e475be5baa5bff305c0f26f0a49a3fdd8`, and its architecture self-report, against the packets, D68, the ticket, prior verdicts, and parked corpus at `60641339b983365952dd6cd61ed2f379aef6dc8a`. **STRENGTH: entailed.** No evaluator implementation exists to test. “Wrong outcome” below means a consequence of a specified rule, or an explicitly identified gap; it does not claim execution of future code.

The ordered values, explicit uncertainty, pure module, and single DOMAIN emitter are useful foundations. The stated rules still permit silent misses, and several acceptance requirements cannot hold together. Worker round 1 should wait for a revised plan. **STRENGTH: entailed** for the contradictions below; **consistent-with** for the architectural assessment.

## B1 — BLOCKING: successful lexing is not evidence of correct lexical context

**Section:** §1.2–§1.4, §8 round 1; [plan:172](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:172).

**Input → wrong outcome:**

```tsx
if (ready) /[//]/.test(text); const choices = [1,2,3,4,5];
const view = <p>// example</p>; const choices = [1,2,3,4,5];
const view = <p>[1,2,3,4,5]</p>;
```

These are independent inputs. A source-only probe of the installed TS 7 scanner with R-1's exact previous-token set and JSX variant returned successful EOF for the first two while omitting the entire later declaration. After the control-condition `CloseParenToken`, R-1 leaves the regex slash as division; its interior `//` becomes trivia. In the second input, ordinary `scan()` treats JSX text as a comment. The third instead exposes the display text as numeric-array tokens. None needs a template stack, so R-2 or the proposed brace-depth adjustment cannot repair these examples.

`LanguageVariant.JSX` is not a JSX mode stack. The installed implementation recognizes `</` in ordinary scanning at scanner.js:1597, but has a separate `scanJsxToken` implementation at :1968 for JSX children. R-3 never specifies when to use that mode. An unterminated-regex revert also cannot reject a *terminated but incorrectly selected* regex. Checking termination and monotonically increasing positions will accept a scanner that silently skips code.

**Required change:** choose a context-aware lexical/parser architecture and specify its successful-token contract, including control-condition versus expression parentheses, JSX tags/attributes/text/expression containers, nested templates, and balanced transitions. Add the first two inputs with assertions that the later array is present, and the third with an assertion that JSX text is not an array candidate. Include nested template/JSX fixtures and the two named shipped files. Treat corpus termination as one gate, not the only completion signal.

Specify an executable failure policy too. `LexResult.ok:false` currently contains no tokens, yet §1.2 promises to find/report every candidate in that file without defining how. A bounded file-level inconclusive diagnostic that fails the oracle is acceptable; silently returning old-lexer negatives is not. A fallback must preserve the conservative direction even when candidate enumeration itself is unavailable.

**STRENGTH: entailed** for the probe results and missing JSX transitions; **undetermined** for the historical M4 driver's exact two-file failure set, because its complete driver is not supplied. R-3 as written is insufficient independently of that historical count.

## B2 — BLOCKING: NOT_NUMBERS is incorrectly absorbing across value-producing callbacks

**Section:** §3.1, §3.3–§3.4, §5's soundness claim; [plan:340](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:340).

**Input → wrong outcome:**

```ts
const choices = [0,1,2,3,4,5]
  .map(n => `${n}`)
  .map(n => n * 1)
  .slice(1);
```

Native evaluation yields **[1,2,3,4,5]**. The initial literal does not trigger rule 1. The first map yields NOT_NUMBERS; §3.3 keeps that state through the second map and slice, so §3.1 withholds. This directly refutes §5's assertion that no operation in the grammar turns nonnumbers into numbers. Both template-return classification and multiplication are declared.

The same table also keeps NOT_NUMBERS through `map(lookup)` or an unsupported flatMap callback. Thus “outside the callback grammar → UNKNOWN → report” is false after a nonnumeric prefix, even if coercions are excluded from exact evaluation.

The callback result space is not total: map's outcomes omit all-booleans and mixed number/boolean/nonnumeric results; filter specifies boolean evaluation but omits JavaScript truthiness for `filter(n => n)`. That input yields [1,2,3,4,5]. The grammar includes `||`/`&&`, whose results are operand values, not necessarily booleans.

**Required change:** distinguish “all current elements are nonnumeric” from “later results cannot be numeric.” Preserve that fact only through proven element-preserving/selecting operations. Re-evaluate map/flatMap output sort independently of input sort; use UNKNOWN where concrete string/boolean information has been discarded. Define joins for every callback result combination, truthiness, short-circuit operand semantics, numeric coercion/unsupported cases, and full-body consumption. Add the coercion chain and a nonnumeric→opaque callback control. Keeping complete terminal JSX maps negative remains valid.

**STRENGTH: entailed.** The concrete array was evaluated; the withholding follows directly from the written transition table. The missing callback branches are static specification gaps.

## B3 — BLOCKING: an opaque filter is not necessarily a subsequence of the pre-call values

**Section:** §3.1, §3.3 filter, §3.4; [plan:349](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:349).

**Input → wrong outcome:**

```ts
const choices = [0,1,2,3,4,5]
  .map(n => n === 5 ? 6 : n)
  .filter((n, i, a) => { a[5] = 5; return n > 0; });
```

Native evaluation yields **[1,2,3,4,5]**. Before filter the exact list is [0,1,2,3,4,6]. The callback is outside §3.4; the table yields `subsequenceOf [0,1,2,3,4,6]`, whose missing 5 causes OTHER and withholding. JavaScript passes the receiver as the callback's third argument; an earlier invocation can change a later value before filter reads it.

This also applies to retaining `subsequenceOf b` through another opaque filter, and defeats blanket preservation of NOT_NUMBERS through such a filter. It does not rely on prototype replacement or application indirection.

**Required change:** use the subsequence abstraction only for callbacks proven unable to mutate the receiver or otherwise invalidate the retained values. Arbitrary/unsupported callback bodies go to UNKNOWN, not a pre-call subsequence. State the purity and built-in-binding assumptions of the exact grammar, and add the input above as a conservative positive. Unsupported async callbacks, extra parameters, block statements, or assignments must not be silently treated as a recognized pure expression.

**STRENGTH: entailed.** Native values and the specified subset verdict establish a silent miss on an expressly conservative fallback.

## B4 — BLOCKING: the grammar does not define complete expression ownership and wrapper/binding composition

**Section:** §2, §3.3–§3.5, §8 round-2 candidate finding; [plan:356](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:356).

**Input → wrong outcome / unresolved outcome:**

| Input expression or declaration | Native result | Gap in the plan |
|---|---|---|
| `[...[0,1,2,3,4,5],6].slice(1)` | [1,2,3,4,5,6] | Applying the outer slice to the inner candidate alone incorrectly reports RULED. The sole spread rule covers only `[...x]`. |
| `[0,...[0,1,2,3,4,5]].slice(2)` | [1,2,3,4,5] | Ignoring the sibling zero gives [2,3,4,5] and a miss. |
| `Array.from(new Set([0,1,2,3,4,5].map(n=>n||1))).slice(1)` | [2,3,4,5] | No Array.from rule or enclosing-call boundary is defined. A member-name fallback alone does not recognize an unknown parent call. |
| `[0,1,2,3,4,5].slice(1,4).concat(4,5)` | [1,2,3,4,5] | Correct conservative result is UNKNOWN/report for unmodelled concat; stopping at the understood prefix misses it. |
| `const [, ...choices] = [0,1,2,3,4,5];` | [1,2,3,4,5] | An elision consumes one position while introducing zero bindings. “k = bindings before rest” is insufficient. |
| `const [choices] = [[0,1,2,3,4,5].slice(1)];` | choices = [1,2,3,4,5] | “No rest → no candidate declaration; nothing is bound to a domain” is false for nested binding values. |

The first two predicted wrong classifications depend on a worker treating sibling-bearing spread as the documented identity wrapper; they are not measurements of nonexistent code. Declaring those forms unsupported is sound **only if the entire containing use is recognized as unsupported and reports**.

Likewise, the “no candidate declaration” row must not defeat rule 1 for `const [a,b] = [1,2,3,4,5];`. Candidate syntax must distinguish expression arrays from computed indexing and type syntax; a pattern `[` numeric tokens `]` is not that distinction. Collection kind and ordered values also need separate treatment: Set iteration, array methods, Array.from, spread, and rest cannot be flattened into one unordered wrapper list.

**Required change:** provide a closed expression/binding grammar with parse-result and consumed-span contracts. Define which parent operations act on which value, where evaluation stops, rule-1 precedence, and how unknown surrounding constructs become UNKNOWN without losing the occurrence. Give positive/negative or explicit conservative expectations for sibling spread, nested Set/Array.from, concat, computed access, parenthesized/as-const forms, rest elisions, and nested/no-rest bindings. Full `as <Type>` handling needs a type boundary, not identifier skipping. Reject unsupported arities/suffixes as unknown rather than accepting a prefix.

**STRENGTH: entailed** for native results and missing/overbroad rules; **consistent-with** for the illustrated future implementation failures. This finding requires specification, not unlimited language support.

## B5 — BLOCKING: token punctuation still does not identify the enclosing statement or occurrence

**Section:** §2.1 and the emission/addressing boundary; [plan:251](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:251).

**Input → wrong outcome:**

```ts
const marker = 0
const choices = [1,2,3,4,5]
```

There is no semicolon or brace before the second statement. The prescribed backward walk addresses its candidate at line **1**, although the enclosing statement begins on line **2**. Tokenizing punctuation correctly does not implement automatic semicolon insertion.

```tsx
const view = <section>{
  [1,2,3,4,5]
}</section>;
```

The JSX opening brace becomes the nearest boundary, yielding line **2**; the plan's stated enclosing-statement policy requires line **1**. Template heads contain `${` within a template token and therefore use a different path through that same boundary rule. Object-literal closers are already admitted as a residual; that residual conflicts with the section's addressing promise rather than being outside JavaScript statements.

The acceptance examples returning [] test no address at all. The layout property accepts an identically wrong line and observes only `sites[0]`; it cannot detect duplicate emission. The inherited `line:kind` map would also collapse two candidates on one line if retained for DOMAIN.

**Required change:** define and obtain the owning statement/container structurally, or explicitly revise the address policy to candidate offsets/lines. Carry a stable occurrence identity such as start/end offsets separately from display line; keep ceiling-arm deduplication separate. Assert exact positive addresses, text/spans, and cardinality for ASI, object expressions, JSX containers, template substitutions, comments/newlines inside arrays, two occurrences on one line, and a positive beside a withheld candidate. A declaration-level display address must not become an occurrence-level deduplication key.

**STRENGTH: entailed** for the ASI and assertion defects. Independent TS 5.9.3 parsing confirmed statement lines 2 and 1 for the two examples, and distinct offsets for two same-line arrays. Removing the old suppression mechanism remains a sound direction, not a completed addressing proof.

## B6 — BLOCKING: the “zero cost” measurement uses the old candidate population

**Section:** M5, §1.2, §3.3 fallback, §7, §9.1(b)/U7; [plan:57](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:57).

**Input → wrong outcome:** M5 finds one raw `1,2,3,4,5` run and is reused as evidence that an evaluator over numeric array candidates adds no shipped false positives. The populations differ.

Fresh enumeration using the oracle's roots/extensions/exclusions found **232 files**, **0 byte mismatches** against 60641339, and exactly the claimed raw match, **LoginFlow.tsx:252**. An independent AST census found **33 nonempty numeric-only array expressions in 6 files**, counting signed numeric literals, separators and decimals. All 232 files parsed without TS 5.9.3 parse diagnostics. Empty arrays were deliberately excluded from that census.

In [tokenUnlock.ts:36](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/apps/ui/lib/v3/tokenUnlock.ts:36), `[502, 503, 504].includes(error.status)` is a numeric-array member chain. Under §3.3's “any other name” rule it becomes UNKNOWN/report. Its native result is boolean, so this is a false-positive site, independent of the filter decision. Object.freeze-wrapped evidence arrays in auth-policy.ts introduce further unknown-wrapper questions; I do not assign them a speculative final site count.

Retaining an unstated “must contain the literal ruled run” gate would evade that example but miss supported arithmetic derivations such as `[2,3,4,5,6].map(n => n - 1)`. M5 cannot justify both candidate policies.

**Required change:** state candidate eligibility, including empty/mixed arrays and numeric syntax; distinguish discovery exclusions from unsupported evaluation. Inventory that population, then measure exact candidate/verdict/reason/site lists for the selected design. Either model proven nonnumeric uses such as includes, or explicitly account for their conservative sites and revise the shipped acceptance expectation through the ticket's decision process. Do not describe the broader rate as zero before that measurement.

Clear only the narrow claims M5 proves: the raw run occurs at LoginFlow, the existing corpus has no such run in a comment, and no such raw run is present in either named M4 failure file. The incremental cost of making **just filter** opaque can be zero within the old one-run population; the total proposed evaluator's rate is not thereby established. Keep U6 as an explicit cross-statement discovery exclusion rather than saying all outside-grammar programs are reported.

**STRENGTH: entailed** for the fresh counts, source and table consequence; **undetermined** for the final evaluator's complete false-positive rate. The AST census is an independent read-only probe, not execution of a proposed candidate finder.

## B7 — BLOCKING: the promised acceptance and round states are mutually inconsistent

**Section:** §5 acceptance, §6.1 floor, §8; [plan:514](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:514).

**Input → wrong outcome:** the five “real LoginFlow” controls at oracle lines 1048–1052 end with:

```text
{[0, 1, 2, 3, 4, 5].map((slot) => (
```

They do not contain a JSX callback body. The layout group's first four entries repeat the same truncation. Completing that exact prefix with `<span />` is negative; completing it with `slot || 1` is positive. A evaluator that knows only the prefix cannot prove NOT_A_NUMBER. §5 requires these incomplete inputs to remain negative while §3.4 requires unsupported bodies to become UNKNOWN/report. The actual full LoginFlow callback is at lines 252–261 and contains a span; its suitability is not in dispute.

Round 2's stub reports every non-rule-1 candidate, but its expected-GREEN list includes §2.1's bare 0..5 negatives, punctuation/regex negatives, and the six-page negative group. Those all report under the stub. It also names “every §3.6 negative” as round-2 RED although round 3 is where the complete §3.6 rows are first added. Round 1 asks for a specific corpus failure after an incompletely specified driver has been written; the historical two-file result is not a deterministic staged mutation.

**Required change:** complete the five callback fixtures and four group entries while preserving their wrapping/comment variation, and add separate truncated-input conservative controls. Declare this necessary floor adaptation explicitly. Replace round-2 predictions with an exact list generated from the defined stub, or give round 2 a different explicitly specified minimal evaluator that makes its claimed GREENs possible. Assign each acceptance row to its first round once. Make round-1 RED arise from a specified defective transition/fixture, not solely a missing module or an assumed historical driver failure. Pin the suite selector's containment and use baseline-relative typecheck accounting.

**STRENGTH: entailed.** The fixture bytes, shared prefix, stub definition, and expected lists conflict directly. The current extracted oracle was probed on that prefix and returned [], confirming that preserving it unchanged would carry forward an unproved exemption.

## B8 — BLOCKING: twelve mutants neither cover every clause nor discriminate their claimed clauses

**Section:** §6.2 and §8 round-3 mutation gate; [plan:547](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:547).

**Input → wrong outcome:**

- **m7 is equivalent for its claimed killing control.** The callback produces [1,1,2,3,4,5]. With Set it becomes [1,2,3,4,5]. Both have the same distinct set, so ignoring Set still reports RULED. A discriminating control is `[...new Set([0,1,2,3,4,5].map(n=>n||1))].slice(1)`: correct [2,3,4,5] is negative; ignored dedupe gives [1,2,3,4,5], positive.
- **m4's three claimed killers all survive.** Without rule 1, the new exact evaluator still recognizes the identity map, bare Set and bare literal as RULED. Add `[1,2,3,4,5].map(n=>0)`, which must report solely because the literal itself spells the domain.
- **m3′ does not kill evaluated filter/flatMap positives.** Those remain known. Even `filter(unknownPredicate)` enters subsequenceOf, not the UNKNOWN variant named in m3′. Its killing set must refer to actual uncertainty transitions.
- **m6 is a negative neighbour control, not a killing mutation.** Its expected exit 0 is correctly named in §6.2; §8 must distinguish its outcome from any blanket death requirement. Mutation harness 0/1/0 change/restoration counts are not test exit codes.

No discriminating mutants are assigned to rest offset, splice return semantics, filter predicate semantics/purity, flatMap shape, JSX/template context transitions, occurrence cardinality/addressing, computed access, or assertion boundaries. m1 “report everything” cannot establish those individual clauses.

**Required change:** build a clause→non-equivalent mutant→exact discriminating control matrix after correcting B1–B7. Remap m4/m7 as above; derive m3′'s actual failing set; cover the unassigned clauses and explicitly separate m6's expected-survival check. Keep a green unmutated selector and restoration evidence. Do not preserve twelve as a ceiling or claim completeness from twelve names.

**STRENGTH: entailed** for m4/m7's equivalence under the specified evaluator, the native dedupe results, and the unassigned clauses; **undetermined** for any future mutant transcript or complete killing set.

## Answers on design choice, dependency and section acceptance

**§9.1 disposition: take (a), with B2/B3's corrections.** The pure expressions `n => n % 2 === 0` and `n => n > 0` evaluate to [0,2,4] and [1,2,3,4,5]. They are distinguishable with a bounded interpreter over syntax and finite input arrays. There is no need to retire the even-filter negative to repair the two demonstrated abstraction defects. Unsupported callbacks must become UNKNOWN without a false purity assumption. State recursion/work limits with conservative exhaustion; do not execute source callbacks. **STRENGTH: entailed** for those values and finite, loop-free expression evaluation; **consistent-with** for the implementation recommendation. The 60–90-line estimate is not verified.

**Lexer dependency recommendation:** prefer an explicitly declared/pinned classic TypeScript parser dependency plus the small evaluator over its syntax nodes. The local UI package already locks TypeScript **5.9.3**, and its installed `createSourceFile` parsed the entire 232-file corpus in-process in the read-only probe. This is an available alternative the plan's TS-7-only search did not evaluate. Do not ship imports into `node_modules/.pnpm` or borrow an application package's dependency by relative path; a root test dependency/alias needs the corresponding package/lockfile grant.

If the scope retains TS 7, its `typescript/unstable/ast` import and `createScanner` function work under bare Node **25.7.0**, freshly verified. Root `typescript` has version exports and no scanner. A stable-API `ts.createScanner` is therefore **not a drop-in alternative through the root's existing TS 7 dependency**. A classic scanner has less import-surface uncertainty, but the same parser-context obligation; changing scanners alone does not fix B1/B5. A supported parser is the stronger reduction in custom context logic.

The package export map and Vitest config are consistent with resolution of the unstable subpath, but I did not run Vitest, as directed. Require round-1 import/token tests under the declared **Node 22.23.1** and installed Vitest before evaluator work depends on it. No Node 22 runtime was found in the inspected local runtime locations; no install was attempted. Exact TS 7 pinning limits accidental drift today; it promises nothing about a future bump. Isolate the dependency behind the module and make import, token/context, parse-diagnostic and address fixtures dependency-update gates. **STRENGTH: entailed** for installed exports, versions, lockfile and parser probe; **consistent-with** for Vitest compatibility and the recommendation; **undetermined** for Node 22 execution and future API stability.

**Round-1 fallback:** do not finish the new lexical gate by scanning the two M4 files with the old lexer and accepting their negative verdicts. Either resolve the context/parser choice, or return an explicit bounded inconclusive result that keeps the gate red. Leaving the old DOMAIN arm in use until the staged replacement is intentional; declaring the *new* lexer complete despite incomplete lexical coverage is not. **STRENGTH: entailed** as a consequence of the stated conservative gate.

| Section | Is its acceptance concrete and discriminating as written? |
|---|---|
| §1 | Six token examples and the corpus failure list are executable, but clean EOF does not prove token correctness; B1 supplies missing discriminators. The union-property accesses in the example also need narrowing before reading reason/offset under strict typecheck. |
| §2 | No: [] observes no address; first-result/equal-line checks observe neither correct offsets nor per-occurrence cardinality. B5. |
| §3 | The listed exact-value rows are concrete (rest-declaration rows must be treated as declarations, not wrapped in another const). They do not cover the table's state transitions or the missing callback/wrapper branches. B2–B4. |
| §4 | Existing verdict controls are concrete. They no longer independently exercise rule 1; add m4's discriminator. B8. |
| §5 | The complete callback pairs and shipped-source check are concrete; the inherited truncated “real” fixtures are incompatible with the new proof. B7. |
| §6 | No: equivalent/non-discriminating mutations and incomplete clause mapping. B8. |
| §7 | The comment and scan-root controls are concrete. The crowded-conjunct control was independently replayed: kindOf reports DEPTH_BOUND_LITERAL while duplicateBoundSites returns []. The module boundary must expose that predicate for this control or retain a deliberate test hook; the declared export list currently omits kindOf. Preserve existing DEPTH controls and diagnostic baseline. |
| §8 | No: round-2 GREEN/RED sets and the historical round-1 failure assumption are inconsistent with the proposed stages. B7. |

**STRENGTH: entailed** for the assertion/round inspection and the isolated §7 replay. These are static acceptance assessments, not fresh suite results.

## F1 — FOLLOW-UP: retaining the old ceiling lexer is acceptable scope, with a concrete inherited limit

**Section:** §1.3, §7, U5; existing oracle declarationUnits:655.

**Input → wrong outcome:**

```ts
const a = /[//]/; const depthSchema = z.number()
  .max(5);
```

The current source-only extracted oracle returns []; removing the regex prefix reports the wrapped depth ceiling. This is a concrete inherited limitation, not a claim that those arms are globally sound.

**Required change:** keep the ceiling-literal and exclusive-bound runtime predicates/windows unchanged in this ticket, apart from removing their DOMAIN fallback and moving code as specified. Record this input for the separate lexical follow-up and narrow “intact” to preservation of their existing behavior/controls. Do not feed a new lexer into these arms as an unreviewed consequence of extracting the module. The packet explicitly scopes the new semantics to DOMAIN; fixing this inherited example need not block that scope.

**STRENGTH: entailed** for both fresh scanner outputs and the scope text; **consistent-with** for the decision to defer the independent repair.

## Packet audit

**F2 — FOLLOW-UP: correct the inherited floor/round wording and future mutation grants.**

**Section:** [architecture packet](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t1-oracle-evaluator-arch.md), its filed dispatch, and the ticket's future worker contract.

**Input → wrong outcome:** demanding unchanged historical controls and mutant mechanisms alongside a real evaluator can require an obsolete exemption or an equivalent mutation. Requiring m5/m6 against LoginFlow while carrying forward the ticket's readonly LoginFlow grant strands a future worker. “≤1 file each” also conflicts with one implementation file plus its RED tests.

**Required change / dispositions:**

- **Charge the original §9.1 mechanism/floor conflict; clear the current resolution to (a).** The two expected filter outputs are not logically contradictory; requiring both while prescribing opaque filter interpretation is. The reviewer packet correctly sends the choice for assessment, and (a) resolves it.
- **Charge literal preservation of eight old mutation mechanisms; clear permission to remap by clause.** m2′/m3′ are reasonable remappings, but B8 shows that m4/m7 need remapping too. “One mutant per clause” is not met by the twelve-row table.
- **Charge the additional truncated-LoginFlow floor conflict** exposed in B7. Preserve complete layout/comment classes, not an unsupported-body negative.
- **Clear this architecture seat's and this review's two-file write grants.** Neither requires source mutation. Before worker dispatch, grant implementation plus the oracle test explicitly. The current reviewer packet already describes one implementation file with test co-touching, so no further permission question is needed to interpret that reading.
- **Require named temporary LoginFlow mutation authority before m5/m6**, separate from permanent edit scope, with restoration/hash checks. The architecture packet's no-code grant is not itself permission for a later worker to edit LoginFlow. Any classic-parser dependency selection similarly needs package/lockfile scope added before that work is dispatched.
- **Clear absolute-path lint:** the architecture packet, its actual dispatch, and this reviewer packet passed the current mission packet-lint together, exit 0. The reviewer packet expressly permits source-only probes; no probe-authority defect remains in this review.

**STRENGTH: entailed** for packet wording, grants, floor contradictions and fresh lint. These charges concern the orchestrator's next dispatch; they do not authorize edits outside this review's two output files.

## Exact revision requested from the architecture seat

The blocking revision consists of B1–B8, with no worker implementation requested yet:

1. Replace/specify the lexical context architecture and a conservative failure result, with token-content fixtures beyond termination.
2. Correct nonnumeric transitions and make callback results/truthiness total.
3. Restrict subsequence facts to proven pure callbacks; make opaque effects UNKNOWN.
4. Define candidate/expression/binding ownership and complete-consumption fallback, including the listed wrapper cases.
5. Define structural addressing and occurrence identity with exact positive cardinality/address fixtures.
6. Recompute the candidate population and cost claims; reconcile the shipped assertion with unsupported uses.
7. Complete the truncated LoginFlow controls and repair round-by-round acceptance states.
8. Replace equivalent mutants and supply a clause-complete discriminating matrix.

Carry the same corrections into the self-report and universal claims, especially “no operation turns nonnumbers into numbers,” “outside grammar always reports,” “zero cost,” and the mutant completeness claim. The mission universal-sweep was run on the plan; text listing does not replace this semantic recheck. F1 remains follow-up; F2 belongs in the orchestrator's amended dispatch. **STRENGTH: entailed** for the required changes' trace to the eight findings.

## Not verified

**STRENGTH: entailed as review limits.** No pnpm, Vitest suite, tsc, application imports, live service, dependency installation, source-mutating mutant, git mutation, or new implementation was run. Source-only probes imported compiler/scanner modules, parsed source, evaluated the explicit finite array examples, and extracted the existing pure oracle in memory. Twenty selected native expression probes and separate structural/lexer probes were used; they are not exhaustive JavaScript validation.

The exact future evaluator, final false-positive site list, Vitest subpath import, Node 22 behavior, TS bump compatibility, worker RED/GREEN transcripts, mutant executions, b14, and effort/line-count estimates remain **STRENGTH: undetermined**. M4's historical driver was not reproduced exactly; the fresh scanner counterexamples do not depend on its template implementation. The independently available classic parser's 232-file parse result does not certify semantic evaluation or typechecking.

The reviewed plan hash and source hash identify the inputs. The parked source tree was clean on entry; the 232 shipped-file bytes matched the pinned commit. Only the two requested reviewer report files are written. No board, DECISIONS, packet, lane source or git metadata is changed.

PLAN: changes — revise the eight specified semantic, lexical and acceptance defects before dispatching worker round 1.
