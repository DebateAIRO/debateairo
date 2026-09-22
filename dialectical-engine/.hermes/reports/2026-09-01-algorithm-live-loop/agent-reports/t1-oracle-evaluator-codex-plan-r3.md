CODEX PLAN REVIEW T1-ORACLE-EVALUATOR r3 — CHANGES · comments read through: t1-oracle-evaluator-plan-r3-2026-09-06

BLOCKING: 5 / FOLLOW-UP: 2.

Read the reviewer packet in full first, then the complete 2,555-line plan, complete 571-line architecture self-report, complete r2 final verdict, architecture packet including AMENDMENT 2, round-3 dispatch, ticket, and applicable D67/D68 decisions. Reviewed plan SHA-256: `837329ed2e500a8a609066220a8e8bf1c4a7875af7cab29e17cf0e5832f3590a`; architecture self-report SHA-256: `8b56a3e573cd9e074e1c3327cfe383c75743c4ed388b9da049abfc8cf4bbca3f`. The parked lane remains `60641339b983365952dd6cd61ed2f379aef6dc8a`, with clean git status. **STRENGTH: entailed.**

The classic-parser architecture remains appropriate. This revision repairs the original boolean/filter contradiction, the NaN miss, the blanket reduce classification, and the independent-mutant arithmetic. It still cannot execute its own string-coercion example or its round-1 contract, and its call-ownership rule still permits a silent miss. Naming five uncovered clauses does not describe the full remaining mutation work. **STRENGTH: consistent-with** for retaining the architecture; **entailed** for the specification defects below. No evaluator implementation or suite outcome is being certified.

## Disposition of R2-B1–B6

| r2 item | r3 disposition | STRENGTH |
|---|---|---|
| R2-B1 — primitive results and truthiness | Partially resolved. Within one callback, comparison booleans survive until consumed; the even filter, positive filter, signed-zero rule and conservative non-finite rule now agree. Across callbacks, strings are still erased, so the promised exact unary-coercion chain is unrepresentable. R3-B1. | entailed |
| R2-B2 — return contracts and continuation | Resolved for the named reduce/find/at/index counterexamples: reduce stays UNKNOWN; an unknown receiver cannot become NOT_ARRAY through element selection; continuation from NOT_ARRAY is explicitly conservative. This clearance assumes the operation was actually invoked, which R3-B2 shows the ownership walk does not establish. Mutation coverage of continuation remains open. | entailed for the written transitions and native examples; consistent-with for implementation |
| R2-B3 — ownership and binding | Partially resolved. The direct unmodelled call reports; nested payloads, collection kinds, multiple-output aggregation and A8's comma rule are now stated. The method-call branch still tests a CallExpression parent without checking that the member is its callee. R3-B2. | entailed |
| R2-B4 — failure API and floor | The ceiling/domain split and one-INCONCLUSIVE policy resolve the conceptual conflict. The declared return type cannot support the new diagnostic assertion, and the floor/migration instructions still disagree. R3-B3/B4. | entailed |
| R2-B5 — reachable stages | The chosen complete-evaluator / independent-mutant sequence is coherent in principle; 24/2/2 against 1 is correct. Required fields are nevertheless absent from round-1 records, the floor is misrouted there, and round 2 overstates its stub's failing set. R3-B3/B4. | entailed for contradictions/counts; consistent-with for the corrected sequence's feasibility |
| R2-B6 — discriminating matrix | K7/K11/K20 are repaired and K24 is correctly merged into K23. K29/K30 are restored. K31–K44 are mostly clause/control descriptions, not complete mutation rows; the operative per-row observable and transcript inventory are still missing. R3-B5. | entailed for artifact contents; undetermined for mutation executions |

## R3-B1 — BLOCKING: primitive values disappear before the next operation needs them

**Section:** [plan §3.13](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1103), its abstraction table at line 1152, the worked chain at line 1168, and [§3.16 Cell](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1216).

**Input → wrong outcome:**

```ts
const choices = [0,1,2,3,4,5]
  .map(n => `${n}`)
  .map(n => +n)
  .slice(1);
```

Native result is `[1,2,3,4,5]`. The first map's `str` results become six `NONNUMBER` cells by the explicit abstraction table. Cell has no string/boolean/null payload. The next callback's parameter therefore has no “cell's own Prim” containing the original string. The worked row's “str cells; unary + on str → exact num” cannot follow from these types. A conservative lift can report UNDETERMINED; it cannot produce the promised exact RULED result. Re-evaluating earlier syntax or privately retaining another value store would invent a contract that is absent from this plan.

The same loss also prevents exact Set deduplication. These complete expressions start from an eligible numeric literal whose own set is not ruled:

```ts
const a = [...new Set([0,6,1,2,3,4,5]
  .map(n => n === 0 ? "a" : n === 6 ? "a" : n))].slice(2);
const b = [...new Set([0,6,1,2,3,4,5]
  .map(n => n === 0 ? "a" : n === 6 ? "b" : n))].slice(2);
```

The native results are respectively `[2,3,4,5]` and `[1,2,3,4,5]`. Their pre-Set Cell lists are identical: two `NONNUMBER` sentinels followed by numbers 1–5. Thus exact deduplication is not a function of the declared state. Treating the two sentinels as equal makes the second expression a silent miss; preserving them as distinct gives the first a false positive. UNKNOWN is a sound alternative when equality is unavailable.

**Required change:** retain the concrete primitive payload needed by subsequent callbacks and equality-sensitive operations, with a total Cell→Prim rule. Keep numeric-domain classification separate from value storage. Define conservative Set behavior for cells whose equality/identity is unavailable, including JSX/nested values. Alternatively, explicitly narrow the affected operations to UNKNOWN and change their exactness assertions, but that would relinquish the exact unary chain the seat chose to promise. Re-derive the unary, binary and Set controls from the corrected representation.

**STRENGTH: entailed** for the native values, identical abstract states and unreachable exact worked row. The sentinel-deduplication miss is conditional on that implementation choice; actual evaluator behavior is **undetermined** because no implementation exists. Retaining primitive payloads is **consistent-with** as the least disruptive repair.

## R3-B2 — BLOCKING: a method reference used as an argument is mistaken for an invocation

**Section:** [§3.16 first-match ownership table](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1235), together with §3.15's `includes → NOT_ARRAY` rule.

**Input → wrong outcome:**

```ts
const choices = ((method) => Array.from({length: 5}, (_, i) => i + 1))([0,1,2,3,4,5].includes);
```

Native result: `[1,2,3,4,5]`. A fresh TS 5.9.3 parse has zero diagnostics and exactly one array literal, at offsets `(71,84)`. Its parent is PropertyAccessExpression `includes`; that member's parent is the outer CallExpression, spanning `(16,94)`. The member **is an argument**, and **is not the callee**. The computed `["includes"]` variant also parses and returns the same native result.

The first matching member row requires only “candidate is the receiver, parent is a CallExpression.” It therefore applies `includes → NOT_ARRAY`, advances through the outer call, and withholds at the declaration. The later unknown-argument row never gets a chance. `includes` was never invoked. This is the receiver/callee distinction R2-B3 explicitly requested, and another way for an unknown containing use to acquire a false known-negative result.

**Required change:** a modelled member invocation requires `call.expression === member`, in addition to `member.expression === currentOwner`, the name check and accepted arguments. A member used as an argument must reach the unknown enclosing-call rule; neither its spelling nor its grandparent's kind proves invocation. Apply the role checks to dotted and computed access. This fixture must produce one UNDETERMINED candidate and one DOMAIN site, with the consumed span covering the rejected outer call; pin the member-role mutation with this fixture.

**STRENGTH: entailed** for the native value, parser relationships and first-match rule's missing condition. The documented path to NOT_ARRAY is entailed under the stated `includes` return rule; if the author intended an additional callee-role guard, it is not present in the specification. Future implementation output remains **undetermined**.

## R3-B3 — BLOCKING: the public types and round-1 record state cannot typecheck together

**Section:** [§1.9 public signatures](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:528), [truncated assertion](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1496), and [§8.7 stage record](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:2168).

**Input → wrong outcome:**

1. `candidatesOf` returns `EvaluatedCandidate[]`, whose `value`, `verdict` and `reason` are required. The next paragraph says round 1 fills every field **except those three**. A source-only in-memory compiler check of that exact return shape produces **TS2739**, naming the three missing properties. Round 1's baseline-relative GREEN cannot hold without a cast, placeholder values or a different stage type that the plan has not specified.
2. `domainSites` returns `DuplicateSite[]`. DuplicateSite has `kind`, `line` and `text`; only the unused extending interface has `diagnostic`. The new assertion `sites[0]?.diagnostic.length` produces **TS2339: Property 'diagnostic' does not exist on type 'DuplicateSite'**. Checking the kinds in an earlier `expect` does not narrow that type. Optional chaining only handles a missing element.
3. Round 2's “every OTHER and RULED row” fails under an “every operation → UNKNOWN” stub is too broad. Bare `[0,1,2,3,4,5]` and `[1,2,3,4,5,6]` have no operation to stub, and remain OTHER; rule-1 candidates remain RULED before the transfer function. A semantic RED is attainable, but that is not its exact failing set.

**Required change:** choose an explicit discovery record and evaluated extension, or fill the required round-1 fields with specified nonsemantic placeholders that round-1 assertions do not treat as evaluated results. Define the discovery/evaluation consumed-span states. Make the site API a discriminated union containing the INCONCLUSIVE fields and narrow it before reading them. Preserve the loop correction in §1.11. For round 2, name deterministic failing rows such as the even filter and `.slice(1)`, and enumerate the stub's actual failures rather than asserting that bare rows fail. No extra implementation file is needed for these repairs.

**STRENGTH: entailed** for the two measured synthetic diagnostics and the no-operation/rule-1 exceptions. These were checks with TS 5.9.3, not the repository's TS 7 typecheck; that worker gate remains **undetermined**. Feasibility of the stage repair is **consistent-with**.

## R3-B4 — BLOCKING: the floor correction did not reach the worker steps, and still omits two controls

**Section:** [§5.4 floor inventory](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1503), [round-1 migration](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:2202), and [round-assignment table](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:2254).

**Input → wrong outcome:** §1.9/§5.4 correctly move the three bare DOMAIN controls out of the ceiling groups. But §8.9 still orders “Migrate the 28 carried ceiling controls to ceilingSites,” with positive kind DEPTH_BOUND_LITERAL, and §8.12 repeats “the 28 ceiling controls.” Extracting the current pure oracle in memory and removing only the two WHOLE_DOMAIN return fallbacks gives `[]` for each of the three bare DOMAIN controls; the old oracle returns DOMAIN_ENUMERATION. Those cannot pass the round-1 ceiling-kind assertions.

Moreover, the supposedly full 25-ceiling inventory omits these two standalone tests:

- [oracle:952](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:952): `does not pair a six with a depth in another conjunct of the same condition` — its fragment ends with an unmatched `{` and must be routed to ceilingSites.
- [oracle:956](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-loginfp/dialectical-engine/tests/unit/s1-1-depth-contract.test.ts:956): `does not manufacture a site when the negative control is collapsed onto one line` — separate from the subsequent `narrows r3` paired assertion.

Counting test instances from the source AST, the ceiling subtotal is **27**: `6 + 3 + 3 + 2 + 3 + 1 + 1 + 1 + 5 + 2`. Adding the three bare DOMAIN tests gives **30**, not 28. This is a count of these ceiling/domain floor tests, not a relabelling of the packet's distinct “27 layout classes.” The selected describe contains **66 test instances** statically: `27 ceiling + 3 bare DOMAIN + 9 derivation + 7 other-domain + 13 index layouts + 4 layout-group tests + 2 shipped assertions + 1 exported-source check`.

**Required change:** synchronize §1.9, §5.4, §8.9 and §8.12 with **27 ceiling + 3 bare DOMAIN**, explicitly including both standalone negatives. Keep the three DOMAIN tests on the old emitter through rounds 1–2, then route them to the new domain emitter in round 3; they can have candidate-only assertions earlier. Preserve the `kindOf` half of the paired narrowing control. Derive future selector counts from the actual test inventory, including smoke and added fixtures. Keep the ceiling harness text-only.

**STRENGTH: entailed** for the source enumeration, omitted tests, extracted predicate results and conflicting current instructions. The extracted probe is not an implemented `ceilingSites` module or a Vitest run. The corrected migration is **consistent-with** as a reachable sequence.

## R3-B5 — BLOCKING: labels and clause names have replaced the missing executable mutation rows

**Section:** [§6.8–6.12 R3](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t1-oracle-evaluator-plan.md:1716) and §8.11's instruction to run K1–K44.

**Input → wrong outcome:** R3 supersedes the old matrix but does not provide a consolidated replacement. K31–K44 are largely names of clauses with a control sketch. Examples:

- K31 names exhaustion and “a callback nested past the budget,” but supplies no mutation or exact expected changed observable; the worker chooses the limits later.
- K32 names complete-body consumption and a statement before return, but supplies neither the statement nor the exact mutation. Accepting a block can still be rejected by another purity clause, precisely K7's previous failure mode.
- K33 names `slice(1,2,3)` and UNKNOWN for unsupported arity, but gives no mutant or baseline→mutant result. A useful choice would be “ignore arguments after the second” and VERDICT `UNDETERMINED → OTHER`, with native cells `[1]` on receiver `[0,1,2,3,4,5]`; the plan does not make that choice.
- K36 names conditional branch evaluation without a concrete expression or mutation. K38 supplies no concrete empty-array fixture/mutant behavior. K39–K44 likewise do not become complete rows merely by naming A8, an operation, or a payload.
- K28 says it uses a deterministic planted mixed fixture but does not supply that operative fixture and its revised result pair. The superseded row still refers to the rejected eleven-site corpus counterfactual.

§6.10 lists five observable categories; it does not assign a category and exact result pair to each scheduled row. Its opening “one of four” is a minor count error, but the absent assignments are substantive. K24 was merged away, K7b/K7c/K7d and K20b have mixed control/mutant status, and K30 is listed again after “K1–K44.” Consequently the plan does not define a unique transcript inventory. Labelling predictions consistent-with does not supply the missing predictions.

**Required change:** provide one operative manifest of retained, replaced, merged and control-only entries. Each scheduled mutation needs a precise rule edit, full fixture or named shipped assertion, actual observable, baseline result, mutant result, first usable round, and restoration obligation. Eliminate equivalent/ambiguous interpretations before promising a transcript count. In particular, state whether “drop slice” means identity or fallback UNKNOWN: the inherited positive `.slice(1)` only discriminates the former by site outcome. Incorporate the corrected primitive/call-role contract and the additional important O1 controls discussed below.

**STRENGTH: entailed** for absent specifications and conflicting inventory text. Non-equivalence of future edits remains **undetermined**. The replacement manifest is **consistent-with** as a bounded repair; this finding does not require implementing the evaluator during planning.

## Requested executions against the rules

These are fresh finite native-value/AST probes plus a replay of the written transfer rules, not executions of a future evaluator. **STRENGTH: entailed** for the measured native values/AST facts; **consistent-with** for correctly implemented transfers except where a contradiction is proved above.

| Requested example | Native / parser observation | r3 rule replay |
|---|---|---|
| even filter | `[0,2,4]` | `%` produces num, comparison produces bool, filter consumes that bool: OTHER, exact cells; repaired |
| positive filter | `[1,2,3,4,5]` | bool predicate retained until selection: RULED; repaired |
| NaN chain | `[1,2,3,4,5]` | first mapped element becomes UNKNOWN; identity predicate on it makes the filter UNKNOWN: UNDETERMINED/report; repaired conservatively |
| signed zero | `Boolean(-0) === false`; `[-0,1,2,3,4,5].filter(n=>n)` is `[1,2,3,4,5]` | `v !== 0` is false for -0: RULED; rule repaired, separate mutant absent |
| unary / binary string coercion | both native results `[1,2,3,4,5]` | binary UNKNOWN can be conservative; unary exactness cannot survive the declared Cell abstraction: R3-B1 |
| A8 comma, inline/wrapped | array parent BinaryExpression in both; spans `(20,33)` and `(23,36)`; statementLine 1 in both, elementLine 1/2 | right operand is transparent; whole index run remains OTHER; no fixture adaptation needed |
| six ceiling fragments | six nonempty parse-diagnostic lists, detailed below | ceilingSites bypasses parsing; domainSites on these same incomplete inputs would yield INCONCLUSIVE |
| direct unknown call | native `[1,2,3,4,5]` | the new unknown-argument row reports, provided the earlier call-role trap in R3-B2 is repaired |
| seven ownership examples | spread-right `[1,2,3,4,5,6]`; spread-left `[1,2,3,4,5]`; Array.from/Set/slice `[2,3,4,5]`; concat, elision, nested extraction and direct unknown call each native `[1,2,3,4,5]` | the intended verdicts OTHER/RULED/OTHER/UNDETERMINED/RULED/RULED/UNDETERMINED now have representations for the supplied numeric cases |

The six exact fragment diagnostics were: `.lte(5),` **TS1109**, leading `.superRefine(...)` **TS1128**, the unrelated conjunction ending `{` **TS1005**, `if (depth >= limits.maxDepth) {` **TS1005**, `maxDepth: 6,` **TS1109**, and the floor-only guard ending `{` **TS1005**. Each diagnostic was on line 1. All five original LoginFlow prefixes produced one TS1109. Reconstructing all nine completed strings using their original wrapping/comments plus the real span body and `))}` produced **nine parses with zero diagnostics**. This establishes parseability of that explicit completion, not their future candidate verdicts. **STRENGTH: entailed.**

Fresh source-only corpus verification used the oracle's packages/apps/web roots, four extensions and six skipped directory names: **232 files, zero byte mismatches with 60641339, zero TS 5.9.3 parse diagnostics, 33 numeric candidates in six files, 551 empty arrays, 10 mixed arrays, and zero rule-1 literals**. Consumer counts remain `23 freeze + 5 property + 2 assertion/declaration + 1 Set + 1 JSX map + 1 includes`. The extracted ceiling-only pipeline yields exactly the owning site at `packages/contract/src/index.ts:112`. Therefore the independent counterfactual totals are `1+23=24`, `1+1=2`, `1+1=2`, against `1+0=1`. **STRENGTH: entailed** for census, ceiling probe and arithmetic; **consistent-with** for the future evaluator's expected zero DOMAIN output; **undetermined** for executed mutant totals.

## Ten-row mutation spot-check and uncovered clauses

For retained identifiers I read the old row together with its R3 replacement. That charitable reconstruction is sufficient to audit these ten entries; it is not a substitute for the operative manifest required by R3-B5.

| Row | Discrimination and observable | Assessment / STRENGTH |
|---|---|---|
| K1 | Remove rule 1; `[1,2,3,4,5].map(n=>0)` ordinarily becomes `[0,0,0,0,0]`. SITES: one→zero. | Discriminates. Native value entailed; mutation prediction consistent-with. |
| K2 | Set→identity before spread/slice: correct `[2,3,4,5]`, mutant `[1,2,3,4,5]`. SITES: zero→one. | Discriminates for these numeric cells. Values entailed; prediction consistent-with. Does not cover R3-B1's nonnumeric equality loss. |
| K7 | Relax only parameter count; `filter((n,i)=>0)` changes UNKNOWN to exact empty array. VERDICT: UNDETERMINED→OTHER. | Repaired, discriminates. Native empty array entailed; prediction consistent-with. |
| K11 | `flatMap(n=>[n])` on 0–5 is exact OTHER; flatMap→UNKNOWN reports. VERDICT: OTHER→UNDETERMINED. | Repaired, discriminates. Native values entailed; prediction consistent-with. |
| K20 | Delete computed-string member recognition; `[0..5]["slice"](0,4)` gives exact `[0,1,2,3]` before the change, fallback UNKNOWN after. VERDICT: OTHER→UNDETERMINED. | Repaired, discriminates. Native value entailed; prediction consistent-with. |
| K23 | TSX→TS changes the syntactic diagnostic gate, not a candidate count from a failed parse. DIAGNOSTIC. | Correct merger of K24. Parser behavior evidenced by the r2 review; current artifact correction entailed. No fresh full TSX-as-TS corpus run here. |
| K25 | Parent-statement walk→old punctuation walk; A1 displays line 2→1. ADDRESS. | Appropriate observable. Fresh structural line 2 entailed; old-walk mutation prediction consistent-with. |
| K26 | Offset key→line:kind key; A3 has offsets `(10,21)` and `(33,44)`, both line 1. CARDINALITY: two sites→one. | Discriminates as round-3 emission test. Offsets entailed; predicted collapse consistent-with. |
| K31 | Budget exhaustion control is described, but mutation and result pair are absent. | Not assessable as a discriminating row. Absence entailed; discrimination undetermined. |
| K33 | Unsupported arity control is named, but no mutated rule/result pair is selected. | Not assessable as supplied. Absence entailed; discrimination undetermined. The concrete repair in R3-B5 would discriminate. |

**Count:** §6.11 explicitly names **five** uncovered clauses. Its numerical area totals sum to **46 clause slots**, but those are not an independent enumerated clause set: Array.from appears under ownership and wrappers, and overlapping rows such as K19/K40 do not establish distinct clauses. In addition, unary-plus coercion has no assigned discriminator distinct from K6's binary-coercion control, and the callee-role condition found in R3-B2 has none. The total number of unsupported contractual clauses cannot honestly be certified as five from this inventory. **STRENGTH: entailed** for the named five, summed slots, duplicate mapping and these two additional absent assignments; **undetermined** for an exhaustive atomic-clause count.

**Disposition of O1:** display/identity separation can remain a named mutation follow-up if exact text, line, offsets and A3 cardinality assertions are compulsory. The four semantic clauses should have discriminating acceptance specified before evaluator code starts, especially NOT_ARRAY continuation and multiple-bound outputs, which guard recurring silent-miss classes. Native values for the first three controls below were freshly checked; the rest-binding value was also measured. The mutation predictions are **STRENGTH: consistent-with**; that these are cheap, bounded contract additions is a recommendation, not a measured effort claim.

| O1 semantic clause | Full control and precise rule mutation | Observable |
|---|---|---|
| signed zero | `const choices = [-0,1,2,3,4,5].filter(n=>n);`; treat negative zero alone as truthy | VERDICT RULED→OTHER |
| nullish coalescing | `const choices = [0,1,2,3,4,5].map(n => (n === 0 ? null : n) ?? 1);`; return the left Prim for `??` even when null | VERDICT RULED→OTHER (mutant contains a nonnumeric cell) |
| NOT_ARRAY continuation | `const choices = [0,1,2,3,4,5].join("").split("").map(n=>+n).slice(1);`; replace the early NOT_ARRAY continuation transition with returning NOT_ARRAY unchanged | VERDICT UNDETERMINED→OTHER; native `[1,2,3,4,5]`, so the absorbing mutation misses |
| multiple bound outputs | `const [head, ...choices] = [0,1,2,3,4,5];`; classify only the first binding instead of the specified any-RULED aggregation | VERDICT RULED→OTHER |

O2's unmeasured mixed-array counterfactual, O3's runtime gate, O4's future false-positive rate and O5's inherited ceiling defect are acceptable as explicitly bounded limits; they do not excuse R3-B1–B5. **STRENGTH: consistent-with** for these dispositions.

## Round feasibility and §9.12 gate

**First thing that cannot go GREEN as written:** round 1's typed candidate construction, after a successful round 0, lacks three required properties (R3-B3). Independently, its diagnostic assertion does not typecheck and its “28 ceiling controls” migration fails three positive controls (R3-B4). These are specification contradictions, not evidence that the one-module file budget is insufficient. **STRENGTH: entailed** for contradictions; **consistent-with** for file-budget sufficiency after correction.

| Round | Reachability after bounded corrections | STRENGTH |
|---|---|---|
| 0 | Gate can establish package resolution and runtime compatibility before parser work. It remains unexecuted; the root alias currently fails package-name resolution with MODULE_NOT_FOUND. | entailed for current resolution; undetermined for Node 22/Vitest/install outcomes |
| 1 | Wrong ScriptKind gives named diagnostic RED; corrected parsing, discovery/address tests and the corrected ceiling floor can become GREEN with a valid stage type. Keep new DOMAIN emission out of this round. | consistent-with |
| 2 | A defined UNKNOWN transfer stub gives semantic RED on named operation rows. Full corrected evaluator can satisfy them in the single support module; B1/B2 must be settled first. Bare rows are not all red under this stub. | entailed for the bare-row exception; consistent-with for feasibility; undetermined for effort |
| 3 | A3's deliberately wrong line key gives a valid emission RED; offset keys repair it. Independent freeze/includes/JSX mutants have the right arithmetic. A completed mutation manifest is necessary before promising its run count. | consistent-with for implementation/mutations; entailed for arithmetic and missing manifest |

§9.12 R3 contains the necessary five classes of execution evidence. **Remove none.** It properly makes exact Node 22.23.1 availability a dependency gate, keeps root TypeScript 7.0.2, demands a reviewed lockfile delta and checks baseline-relative diagnostics. Its incompleteness is deliberately assigned to the orchestrator: it is not yet a runnable dispatch. **STRENGTH: entailed** for plan/decision contents; **consistent-with** for adequacy of those evidence categories.

If V authorizes a corrected worker contract, F2's dispatch should concretize these details:

1. Name the worker's actual absolute checkout and its `dialectical-engine` working directory; do not mutate the parked corpus by inference. Name the root package/lock paths, existing oracle test co-touch, log paths, and mutation harness path. The package.json/pnpm-lock/install grant already exists.
2. Use the existing oracle test as the smoke location, under the selected describe, rather than introduce a second support module whose later migration is unspecified. One possible concrete inventory is five tests: alias/version/API; TS parse with parent/source position; TSX parse with parent links; normalized numeric text and unary sign; malformed parse through the isolated diagnostic accessor. State whether that accessor is initially test-local and moved into the support module in round 1. Record a counted, named resolution failure before installation; avoid treating suite-load failure as a passing smoke.
3. Run and record the existing selected-test and typecheck baselines under Node **22.23.1** and pnpm **11.20.0**, then the authorized alias change/install, the five smoke tests under repository Vitest configuration, the selected regression group and baseline-relative typecheck. The existing group's static count is 66; five added smoke instances would give 71 before other additions, to be confirmed by actual name/count output. Static enumeration is not a suite pass.
4. Review exact alias `typescript-classic: npm:typescript@5.9.3`, root-importer lock resolution and absence of unrelated upgrades. Verify both alias and original `typescript` specifiers from the test context, with no application-relative dependency borrowing. Log process versions for the actual test/compiler invocations, not merely an earlier shell.
5. Stop dependent rounds if the exact runtime or any gate evidence is unavailable. Preserve F2's no-new-attributable-diagnostic requirement by names/codes/paths, not error count. Do not expand an already authorized install into unrelated dependency changes.

**STRENGTH: consistent-with** for these dispatch recommendations; **entailed** for the package versions, current alias absence, Vitest inclusion of the existing test and static baseline count. This is gate advice for a future authorized dispatch, not approval to start implementation under the current plan.

## F1 — FOLLOW-UP: preserve the inherited ceiling defect as a separately scoped limitation

**Section:** §7.2 R2, retained by §7 R3.

**Input → wrong outcome:** `const a = /[//]/; const depthSchema = z.number()\n  .max(5);` gives `[]` in both the extracted current oracle and the in-memory ceiling-only extraction. Removing the regex prefix produces the wrapped DEPTH_BOUND_LITERAL site.

**Required change:** retain this separate follow-up and pin the ceiling predicates/windows during extraction, including the two omitted negative controls in R3-B4. Do not silently feed the new parser into these arms.

**STRENGTH: entailed** for the fresh extracted results and scope; **consistent-with** for continued deferral.

## F2 — FOLLOW-UP: execute the round-0 gate in the worker dispatch

**Section:** §9.12 R3 and D68 ADDENDUM.

**Input → wrong outcome:** the root alias is currently absent, and the source-only probes ran on Node v25.7.0. Neither proves alias resolution in Vitest on Node 22.23.1.

**Required change:** retain every §9.12 evidence requirement and add the concrete dispatch details above. No new permission question is needed for the granted alias/install or temporary mutation targets. This review cannot execute that gate under its static/read-only method.

**STRENGTH: entailed** for present evidence and authority; **undetermined** for future gate results.

## For V — the residual

**Recommended disposition: retain the classic-parser architecture, but do not dispatch evaluator implementation against this r3 contract unchanged.** This review neither requests nor assumes another architecture-seat round. Before implementation, the operative worker contract needs five bounded corrections:

1. Preserve primitive information across array operations, or explicitly use UNKNOWN where the stored abstraction cannot decide; repair exact unary coercion and Set equality together. **STRENGTH: entailed** necessity from R3-B1.
2. Require the member to be the call's callee before applying its named return contract; otherwise consume/report the unknown containing call. **STRENGTH: entailed** necessity from R3-B2.
3. Make discovery/evaluated records and the INCONCLUSIVE union type-valid at their first round; state the actual stub RED set. **STRENGTH: entailed** necessity from R3-B3.
4. Route **27 ceiling controls** and **three bare DOMAIN controls** to their proper harness/stage, preserving both omitted standalone negatives. **STRENGTH: entailed** necessity/counts from R3-B4.
5. Replace mutation labels with the operative rule-edit/control/observable/result manifest. Require the four O1 semantic controls before evaluator implementation; display/identity mutation coverage may remain a named follow-up with exact address/display assertions. **STRENGTH: entailed** for missing manifest, **consistent-with** for this coverage disposition.

The alias grant, temporary LoginFlow target, one implementation module plus oracle test co-touch, and parser choice are cleared. The Node/Vitest/install gate and inherited ceiling limitation remain named follow-ups. Accepting the five O1 omissions alone would not accept the actual residual: R3-B1–B4 are contradictory or unsound executable requirements, and R3-B5 is broader than those five omissions. **STRENGTH: entailed** for authority and residual distinction; **consistent-with** for the recommended disposition.

## Packet audit

- **Clear AMENDMENT 2's authority and architectural disposition.** It retains the classic parser, assigns F2 to the orchestrator, and makes this the architecture seat's last round. The review follows that boundary; it does not send the seat a fourth round.
- **Clear alias permission.** D68 ADDENDUM explicitly grants the pinned root alias, root package.json, pnpm-lock.yaml and one install. The R3 banners supersede the old “grant does not exist” and U9 text. Those old lines are historical, not a reason to ask again.
- **Clear LoginFlow as a temporary mutant target only.** K30 restores m5 and m6 remains an expected survival. Worker dispatch must retain named target, applied/restored evidence, hash restoration and the discriminating command. This review made no mutation.
- **Clear the ≤1-file reading.** The explicit ruling is one implementation file per round plus the oracle test co-touch. Removing the automatic split resolves the boundary issue. The separate round-0 dependency grant governs the package/lock change.
- **Charge the floor, stage and matrix inconsistencies to the plan.** AMENDMENT 2 already requested their correction. The packet's narrow “five uncovered clauses” summary and its 25+3 count are seat claims to verify, not permissions to drop the additional residue; the source contradicts their completeness.
- **Clear this review's write/method scope.** Only the two named review artifacts were written. No suite, pnpm/install, repository typecheck, application import, source mutation, worktree creation, git mutation, board/decision edit, network action or credential read was performed. Probe transformations were in memory. No subagents were used.

**STRENGTH: entailed** for decision/packet text, observed artifact state and review actions; **consistent-with** for dispatch recommendations.

## Not verified

No evaluator exists in the reviewed parked lane. Actual RED/GREEN worker runs, the root alias installation, Vitest resolution, Node 22.23.1 compatibility, repository TypeScript 7 diagnostics, b14 outcomes, mutation transcripts, the completed fixture verdicts, final candidate/value/reason/span/site records, production soundness outside the declared grammar, future parser compatibility, exhaustive clause coverage and effort remain **STRENGTH: undetermined**.

Compiler imports were limited to source parsing, in-memory snippet checks and transpilation of the extracted pure oracle. Finite native examples were evaluated independently of application source. One initial probe had a syntax typo and did not execute; its corrected rerun supplied the results. A synthetic `length` binding initially added an irrelevant compiler diagnostic; renaming it and rerunning isolated the reported TS2339. Neither failed probe is counted as product evidence. **STRENGTH: entailed** as method limits and probe history.

PLAN: changes — retain the parser architecture and require the five bounded semantic, typing, floor and mutation-contract repairs before dispatching evaluator implementation.
