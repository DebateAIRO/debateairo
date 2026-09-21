# F-T1-ORACLE-EVALUATOR — THE CORRECTED MUTATION MANIFEST

Filed by the WORKER in **round 1**, against **real parser output**, per D68 ADDENDUM 3.
**REWORK 1 of 3** after codex r1 (**GATE CLOSED**, B1–B7). Codex re-asks the gate at review;
**GATE OPEN is the condition for round 2.**

```
base            : 0c4c34dfe3da6ade18301200368222311abf0529 (round-0 tip)
working dir     : /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t1-oracle-evaluator/dialectical-engine
supersedes      : plan §6.13 R4's table, and this manifest's own pre-rework revision
harness         : .../tools/mutate.sh v3 (trap-restore on every exit path, nonzero exit on any
                  inconsistent gate, RESULT line, MUT_EXPECT declared multiplicity)
comments read through: t1-oracle-evaluator-r1-2026-09-06
```

**NAMED FACT (D68 ADDENDUM 2), carried verbatim:**

> Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node 25.7.0 only.

## Conventions — read before any row

- **Every row's fixture is given as COMPLETE SOURCE in Part 2's canonical inventory.** There is no
  `const choices = <expr>;` shorthand, no `[0..5]` range shorthand and no receiverless suffix
  anywhere in this filing. Where a row needs a *declaration* rather than an expression, the
  inventory gives the declaration; where it needs a shipped assertion, the inventory names it.
- **Observables:** `VERDICT` (candidate verdict / cells) · `ADDRESS` · `CARDINALITY` ·
  `DIAGNOSTIC` · `SITES`.
- **Restoration obligation, identical for every MUTATION row and for the survival row m6**, stated
  once: *applied and restored individually through `mutate.sh` v3, which gates pre-count `0` →
  applied count (`MUT_EXPECT` where a multiplicity is declared) → restored `0`, records the
  target's sha256 before and after, restores on every exit path including error and interrupt,
  exits nonzero on any inconsistent gate, and emits one `RESULT` line.* Those counts are
  **custody, never an outcome**.
- A mutation's evidence is its **declared observable**, never a nonzero exit.
- **The two recorded work limits** (the plan leaves both to the worker to pick and record):
  **node budget = 64**, **recursion depth limit = 32**, per callback invocation. Exhaustion of
  either yields `unknown` for that cell.
  **Counter semantics:** the budget counts every node reachable from the admitted callback's
  **body node inclusive** by `ts.forEachChild` recursion — not tokens, not characters, not
  statements. **Depth semantics:** the body node is depth 0 and each `forEachChild` level adds 1;
  the measured depth is the maximum.

---

## Part 1 — repairs

### R-B1 · K31 — a fixture INSIDE the callback grammar (codex r1 B1)

**The defect.** The pre-rework fixture was
`[0,1,2,3,4,5].map(n => [n, …70 n elements…][0]).slice(1)`. It contains an **array literal** and an
**element access**, both excluded by §3.9 R2 clause 3. The unchanged purity gate rejects the
callback outright, so the result is `UNDETERMINED` whatever the node budget is: raising the budget
alone could never deliver the promised `RULED`. My "only the node budget can reject this input" was
false, and the 73-node/depth-2 measurement described the tree without establishing grammar
admission. Codex is right on every point.

**The replacement — `n` plus a balanced sum of 32 literal zeroes**, measured
(`32-B1-K31-fixture.log`):

| property | value |
|---|---|
| parse diagnostics | **0** |
| counted nodes (body inclusive, `forEachChild`) | **128** — exceeds the 64 budget |
| max depth (body = 0) | **11** — below the 32 limit |
| node kinds present | `Identifier` 1 · `NumericLiteral` 32 · `BinaryExpression` 32 · `ParenthesizedExpression` 31 · `PlusToken` 32 |
| out-of-grammar kinds | **none** — no call, member access, assignment, `this`, object or array literal |
| purity gate §3.9 clauses | 1 parameter ✔ · single expression body ✔ · in-grammar ✔ · not async/generator ✔ |
| native value | `[1,2,3,4,5]` |

*(`ts.SyntaxKind[9]` prints as `FirstLiteralToken`, which is the same kind value as
`NumericLiteral`; verified `ts.SyntaxKind.NumericLiteral === ts.SyntaxKind.FirstLiteralToken` in
`33-B2-B3-B4-measurements.log`. It is a numeric literal, not an out-of-grammar node.)*

**Both limits are replayed, not just the evaluator:** the baseline is `UNDETERMINED` because the
**counter** exhausts (128 > 64) while the callback is otherwise admissible, and the budget-only
mutant is `RULED` because the same callback then evaluates to identity. The depth limit cannot
reject it (11 < 32), so the row discriminates the node budget and nothing else. The grammar was
**not** enlarged to rescue the fixture. **STRENGTH: entailed** for every measured number and for
grammar admission under the written contract; **consistent-with** for the predicted verdicts, which
replay rules not yet implemented.

### R-B2 · K43 — a candidate that fails rule 1, with a known receiver (codex r1 B2)

**The defect.** `const choices = [[1,2,3,4,5]].at(0);` discovers the **inner** numeric array, whose
own distinct set is exactly `{1,2,3,4,5}`. **Rule 1 decides it `RULED` before the ownership walk
reaches `at`**, so the declared `RULED → OTHER` discriminator would in fact have been
`RULED → RULED`. The row could not fail.

**The replacement:** `const choices = [0,1,2,3,4,5].map(n => "x").at(0);`, measured
(`33-B2-B3-B4-measurements.log`): 0 diagnostics; exactly one discovered candidate,
`[0,1,2,3,4,5]` at **`(16,29)`**; its distinct set is `{0,1,2,3,4,5}`, **≠ the ruled set, so rule 1
does not fire**; the receiver cells after `map` are six **known `str`** cells `"x"`.
Baseline `UNDETERMINED` under §3.15's conservative element-return contract; unconditional
`NOT_ARRAY` yields `OTHER`. **The row asserts the receiver cells as well as the verdict**, so
another `UNKNOWN`-producing rule cannot stand in for the target rule.

### R-B3 · K10 — a fixture whose baseline and mutant differ (codex r1 B3)

**The defect.** On `[...new Set([0,1,2,3,4,5].map(n => n || 1))].slice(1)` the baseline is `OTHER`
(`[2,3,4,5]`), and under a boolean-returning `||` the cells are known `true` values which R4
**retains and deduplicates**: `Set` gives `[true]`, `slice(1)` gives `[]` — also `OTHER`. A boolean
cell is not automatically unknown, so the promised `UNDETERMINED` contradicted R4 and baseline and
mutant were the same verdict.

**The replacement:** `const choices = [0,1,2,3,4,5].map(n => n || 1);` — one candidate at
`(16,29)`, 0 diagnostics.

| | cells | distinct set | verdict |
|---|---|---|---|
| baseline | `[1,1,2,3,4,5]` | `{1,2,3,4,5}` | **RULED** |
| mutant | `[true,true,true,true,true,true]` | `{true}` | **OTHER** |

**The exact edit:** in §3.13 R3's logical-operator rule, `||` returns
`{ t:"bool", v: ToBoolean(left) ? ToBoolean(left) : ToBoolean(right) }` — i.e. the **boolean result
of the operation** — instead of returning the selected operand `Prim` unchanged. **The row asserts
the cells as well as the verdict.** K10 remains a different operator mutation from K49 (`??`).

### R-B4 · K9 — restored as a separate mutation; the equivalence claim was false (codex r1 B4)

**The defect, and it was mine.** I demoted K9 to a control on the ground that it was "an equivalent
mutant of K48's rule over K35's fixture". That is wrong twice over:

1. **K9 and K48 are distinguished by the very fixture I cited.** On
   `const choices = [0,1,2,3,4,5].filter(n => n);` the baseline is `[1,2,3,4,5]` → `RULED`. K9
   (numeric **`+0`** truthy) retains `+0`, giving `[0,1,2,3,4,5]` → **`OTHER`**: it kills the test.
   K48 changes **negative zero alone**, and this fixture contains **no** `-0`, so K48 leaves it
   **`RULED`**: it does not. Measured in `33-B2-B3-B4-measurements.log`.
2. **K35 is an assertion, not a mutant.** Sharing a source rule or a test with a control proves
   nothing about behavioural equivalence.

**Disposition: K9 is RESTORED as a separate MUTATION** (zero truthiness), K48 keeps the signed-zero
discriminator, and K35 remains the standing control. **The false-equivalence instruction is removed
from this manifest and from the self-report**, and the inventories are recomputed in Part 4.
This is a repair, not a deliberate coverage omission. **STRENGTH: entailed.**

### Carried repairs from the pre-rework filing (unchanged, and cleared by codex)

- **C1 · K16** — mutant verdict corrected to `UNDETERMINED → OTHER`: under "unmodelled method →
  identity", the receiver after `.slice(1,4)` is `[1,2,3]`, and identity on `[1,2,3]` is `[1,2,3]`,
  a decided non-ruled value.
- **C2 · K21** — the edit names both halves: delete `AsExpression` from the transparent-wrapper set
  so the walk **stops**, and the candidate then takes the walk's **`UNKNOWN` fallback**.
  **Correction (codex r1):** my aside that the inner untransformed `[0,1,2,3,4,5]` would be `RULED`
  is **false** — its distinct set is `{0,1,2,3,4,5}`, so it is `OTHER`. The row's
  `RULED → UNDETERMINED` direction is unaffected.
- **C5 · K45** — bound to one literal source with measured discovery offsets `(64,77)`. Round 2
  measures the rejected-call span **from these bytes**, not from M17's other source.

---

## Part 2 — the CANONICAL SOURCE INVENTORY (codex r1 B5)

**Every row below gives complete, parseable source.** Ranges are expanded, receivers are present,
declarations are distinguished from expressions. Where a row's observable is a shipped assertion
rather than a fixture, the assertion is named instead.

**The two shared shipped assertions**, named once and referenced by K3, K4, K5, K29, K30 and m6:

- **`SHIPPED-A`** = `depthBoundSitesInShippedCode()` in
  `tests/unit/s1-1-depth-contract.test.ts`, asserted by the instance
  *"keeps the owning declaration as the only depth-bound site in shipped code"*.
- **`SHIPPED-B`** = `duplicateBoundSitesInShippedCode()`, asserted by the instance
  *"leaves no duplicate definition of the ruled ceiling anywhere in shipped code"*.

| # | Canonical source (complete) |
|---|---|
| K1 | `const choices = [1,2,3,4,5].map(n => 0);` |
| K2 | `const choices = [...new Set([0,1,2,3,4,5].map(n => n \|\| 1))].slice(1);` |
| K3 | SHIPPED-A |
| K4 | SHIPPED-A |
| K5 | SHIPPED-A |
| K6 | ``const choices = [0,1,2,3,4,5].map(n => `${n}`).map(n => n * 1).slice(1);`` |
| K6b | ``const choices = [0,1,2,3,4,5].map(n => `${n}`).map(n => +n).slice(1);`` |
| K7 | `const choices = [0,1,2,3,4,5].filter((n, i) => 0);` |
| **K9** | `const choices = [0,1,2,3,4,5].filter(n => n);` |
| K8 | `const choices = [0,1,2,3,4,5].filter(n => n % 2 === 0);` |
| K10 | `const choices = [0,1,2,3,4,5].map(n => n \|\| 1);` |
| K11 | `const choices = [0,1,2,3,4,5].flatMap(n => [n]);` |
| K12 | `const choices = [0,1,2,3,4,5].splice(1);` |
| K13 | `const choices = [0,1,2,3,4,5].slice(1);` |
| K14 | `const choices = [0,1,2,3,4,5].reverse().slice(0,-1);` |
| K15 | `const choices = [0,1,2,3,4,5,10].sort().slice(1,-1);` |
| K16 | `const choices = [0,1,2,3,4,5].slice(1,4).concat(4,5);` |
| K17 | `const choices = [...[0,1,2,3,4,5],6].slice(1);` |
| K18 | **declaration fixture:** `const [, ...choices] = [0,1,2,3,4,5];` |
| K19 | **declaration fixture:** `const [choices] = [[0,1,2,3,4,5].slice(1)];` |
| K20 | `const choices = [0,1,2,3,4,5]["slice"](0,4);` |
| K21 | `const choices = ([0,1,2,3,4,5] as const).slice(1);` |
| K22 | `const choices = Array.from(new Set([0,1,2,3,4,5].map(n => n \|\| 1))).slice(1);` |
| K23 | the corpus parse gate — instance *"parses every shipped file with no syntactic diagnostic"* |
| K25 | fixture **A1**, instance *"addresses 'A1 — ASI: the owning statement begins…'"*: `const marker = 0\nconst choices = [1,2,3,4,5]\n` |
| K26 | fixture **A3**, instance *"addresses 'A3 — two arrays on one line…'"*: `const a = [1,2,3,4,5]; const b = [1,2,3,4,5];` — offsets `(10,21)` and `(33,44)` |
| K27 | the truncated-prefix block — the five donor prefixes (Part 2b) **and** the synthetic case |
| K28 | `const sentinel = "s";\nconst choices = [0, sentinel, 2, 3, 4, 5];` |
| K29 | `const choices = [0,1,2,3,4,5].reduce((a, n) => n ? a.concat(n) : a, []);` |
| K30 | SHIPPED-A **and** SHIPPED-B, with `data-capped={expansionDepth < 6}` planted in `apps/ui/components/LoginFlow.tsx`; **record the actual insertion line in the transcript** |
| **K31** | `const choices = [0,1,2,3,4,5].map(n => n + (((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))) + ((((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0))) + (((0 + 0) + (0 + 0)) + ((0 + 0) + (0 + 0)))))).slice(1);` — **241 bytes**, 128 counted nodes, depth 11 |
| K32 | `const choices = [0,1,2,3,4,5].filter(n => { if (n > 9) return true; return n > 0; });` |
| K33 | `const choices = [0,1,2,3,4,5].slice(1,2,3);` |
| K36 | `const choices = [0,1,2,3,4,5].map(n => n === 0 ? 1 : n);` |
| K38 | `const choices = [].concat(1,2,3,4,5);` |
| K39 | `const slots = (";", [0,1,2,3,4,5]);` |
| K40 | **declaration fixture:** `const [choices] = [[0,1,2,3,4,5].slice(1)];` |
| K41 | `const choices = new Set([0,1,2,3,4,5]).slice(1);` |
| K42 | `const choices = [0,1,2,3,4,5].reduce((a, n) => n ? a.concat(n) : a, []);` |
| **K43** | `const choices = [0,1,2,3,4,5].map(n => "x").at(0);` — candidate `(16,29)`, distinct set `{0,1,2,3,4,5}` (rule 1 does not fire), receiver cells six known `str` |
| K44 | `const choices = [0,1,2,3,4,5].foo;` **paired with** `const length = [0,1,2,3,4,5].length;` (stays `OTHER` both ways) |
| K45 | `const choices = ((method) => Array.from({length:5},(_,i)=>i+1))([0,1,2,3,4,5].includes);` — candidate `(64,77)` |
| K46 | ``const choices = [0,1,2,3,4,5].map(n => `${n}`).map(n => +n).slice(1);`` |
| **K47** | `const choices = [...new Set([0,0,1,2,3,4,5].map(n => n === 0 ? "s" : n))].slice(1);` — the SAME-sentinel source, with the sentinel **duplicated** so the dedupe of a non-numeric cell is observable |
| K48 | `const choices = [-0,1,2,3,4,5].filter(n => n);` |
| K49 | `const choices = [0,1,2,3,4,5].map(n => (n === 0 ? null : n) ?? 1);` |
| K50 | `const choices = [0,1,2,3,4,5].join("").split("").map(n => +n).slice(1);` |
| K51 | **declaration fixture:** `const [head, ...choices] = [0,1,2,3,4,5];` |
| m6 | SHIPPED-A, with LoginFlow's run extended to `0..6`; **record the actual edited line** |

### Part 2b — K27's five donor prefixes, byte-exact

Imported from the donor at `60641339b983365952dd6cd61ed2f379aef6dc8a`,
`tests/unit/s1-1-depth-contract.test.ts` **lines 1048–1052** (the `it.each([` opens at 1047; the five
literal rows themselves are 1048–1052 — corrected per codex r1b F4, verified by `grep -n`), wrapping
and comment bytes preserved
(the 18-space indent, the `/* first slot */` block comment, the `// first slot` line comment and the
newline positions are all load-bearing). Each asserts **failed parse**, **zero discovery
candidates**, and **exactly one narrowed `INCONCLUSIVE`** carrying path, line and message. Measured
in `31-B6-measurements.log`: each fails with exactly **one** diagnostic, `"Expression expected."`.

| layout | **source bytes (decoded)** | serialized-literal length | first diagnostic line |
|---|---:|---:|---:|
| the real six-slot login array | **53** | 55 | 1 |
| the real login array, wrapped after the sentinel | **71** | 74 | 2 |
| the real login array, block comment after the sentinel | **70** | 72 | 1 |
| the real login array, commented AND wrapped | **88** | 91 | 2 |
| the real login array, line comment after the sentinel | **85** | 88 | 2 |

> **CORRECTED (codex r1b F4).** The pre-rework table published **55, 74, 72, 91, 88** as "bytes".
> Those are **serialized-string lengths** — the JSON representation, counting the two quotation marks
> and writing each newline as the two characters `\n` — not the bytes handed to the parser. The
> **decoded source lengths are 53, 71, 70, 88, 85**, measured by reading the five `planted` literals
> out of the committed test, `json.loads`-ing each and taking `len(decoded.encode("utf-8"))`
> (`47-F4-lengths-and-range.log`, probe command recorded in that log). The cause was a probe that
> printed `JSON.stringify(src).length`. **The rule: a length is only evidence when the record says
> which representation was measured** — decoded source or serialized literal.

### Part 2c — the control-only fixtures, each isolated

K7c and K7d must each violate **exactly one** purity clause, with every other clause satisfied, or
they do not isolate what they claim.

> **CORRECTED (codex r1b B5-R).** The pre-rework K7d,
> `map(n => { let m = 0; m = n; return m; })`, was labelled "clauses 2 + 3 only" in this very table
> while the sentence above claimed isolation — a contradiction inside one section, and the table was
> the honest half. That fixture fails **clause 2** (its body is neither a single expression nor
> exactly `{ return e; }`) *and* **clause 3** (assignment). Removing assignment rejection would still
> leave the body-shape gate rejecting the callback, so the control could stay `UNDETERMINED` **without
> ever testing assignment rejection** — it isolated nothing.
>
> **The replacement, measured** (`48-B5R-F3R-measurements.log`;
> probe `node scratchpad/r2.cjs <worktree>`, typescript-classic 5.9.3, Node v25.7.0):
> `const choices = [0,1,2,3,4,5].map(n => (n = n));`
>
> | property | value |
> |---|---|
> | parse diagnostics | **0** |
> | clause 1 — exactly one plain identifier parameter | **SATISFIED** (`params = 1`) |
> | clause 2 — single expression body | **SATISFIED** (body is not a block) |
> | clause 4 — not `async`, not a generator | **SATISFIED** |
> | **clause 3 — no assignment** | **VIOLATED — and it is the only violation** |
> | callback body node kinds | `ParenthesizedExpression` 1 · `BinaryExpression` 1 · `Identifier` 2 · `FirstAssignment` 1 |
> | counted nodes / depth | **5 / 2** — far inside the 64-node and 32-depth limits, so no work-limit confound can produce the control's result |
> | discovery | one candidate, `[0,1,2,3,4,5]` at **`(16,29)`** |
> | rule 1 | distinct set `{0,1,2,3,4,5}` ≠ ruled set, so **rule 1 does not fire** |
> | native value | `[0,1,2,3,4,5]` |
>
> **Intended control result: `UNDETERMINED`**, and now *because assignment rejection fired* —
> clauses 1, 2 and 4 are all satisfied, so nothing else in the purity gate can produce it. K7d stays
> **control-only**; K7b keeps the combined-effect case. The evaluator grammar is not loosened.

| # | Canonical source | Clause violated |
|---|---|---|
| K7b | `const choices = [0,1,2,3,4,5].map(n => n === 5 ? 6 : n).filter((n, i, a) => { a[5] = 5; return n > 0; });` | clauses 1 + 2 + 3 (three parameters, assignment, element access) |
| K7c | `const choices = [0,1,2,3,4,5].map(async n => n);` | **clause 4 only** — `async`; one plain parameter, single-expression body, in-grammar |
| K7d | `const choices = [0,1,2,3,4,5].map(n => (n = n));` | **clause 3 ONLY** — an assignment inside an otherwise admitted callback |
| K9-ctl | *(withdrawn — K9 is a MUTATION again; see R-B4)* | — |
| K20b | `const choices = [0,1,2,3,4,5]["slice"](1);` | none (expected `RULED`) |
| K34 | `const choices = ((x) => x.slice(1))([0,1,2,3,4,5]);` | none (expected `UNDETERMINED`) |
| K35 | `const choices = [0,1,2,3,4,5].filter(n => n);` | none (expected `RULED`) |
| K37 | `const choices = [0,1,2,3,4,5].map(n => n * n / n).filter(n => n);` | none (expected `UNDETERMINED`; `0*0/0` is `NaN`, non-finite → `unknown`) |

**K7c and K7d name the same test-visible fixture class as K7b but are separate instances**; K35 and
K9's fixture are the same source string, and that is now recorded as a *shared fixture between a
control and a mutation*, not as evidence of equivalence.

---

## Part 3 — the manifest

Every MUTATION row inherits the restoration obligation from Conventions. Sources are in Part 2.

| # | Precise rule edit | Obs. | Baseline | Mutant | Round |
|---|---|---|---|---|---|
| K1 | delete §3.2's rule-1 precedence check | SITES | 1 | 0 | 3 |
| K2 | `new Set(x)` → identity (no dedupe) | VERDICT | OTHER | RULED | 3 |
| K3 | `Object.freeze(x)` → `UNKNOWN` | SITES | 1 | 24 | 3 |
| K4 | `includes` → `UNKNOWN` | SITES | 1 | 2 | 3 |
| K5 | JSX-body callback → `unknown` cells | SITES | 1 | 2 | 3 |
| K6 | arithmetic with a `str` operand → exact JS coercion | VERDICT | UNDETERMINED | RULED | 3 |
| K6b | unary `+` on a `str` cell → `unknown` | VERDICT | RULED | UNDETERMINED | 3 |
| K7 | relax **only** §3.9 clause 1 (parameter count) | VERDICT | UNDETERMINED | OTHER | 3 |
| K8 | disable filter-predicate evaluation → `UNKNOWN` | VERDICT | OTHER | UNDETERMINED | 3 |
| **K9** | **numeric `+0` is truthy** in `ToBoolean` (signed zero untouched) | VERDICT | RULED | **OTHER** | 3 |
| **K10** | `\|\|` returns the **boolean result** of the operation instead of the selected operand `Prim` | VERDICT | RULED, cells `[1,1,2,3,4,5]` | OTHER, cells `[true×6]` | 3 |
| K11 | delete the `flatMap` row (→ `UNKNOWN`) | VERDICT | OTHER | UNDETERMINED | 3 |
| K12 | `splice` returns the RETAINED cells | VERDICT | RULED | OTHER | 3 |
| K13 | delete the `slice` row → fallback `UNKNOWN` (not identity) | VERDICT | RULED | UNDETERMINED | 3 |
| K14 | `reverse` → no-op | VERDICT | RULED | OTHER | 3 |
| K15 | `sort()` ordered numerically | VERDICT | OTHER | RULED | 3 |
| K16 | unmodelled method → identity on its receiver | VERDICT | UNDETERMINED | OTHER | 3 |
| K17 | spread with siblings → identity on the inner array | VERDICT | OTHER | RULED | 3 |
| K18 | rest offset counts BINDINGS, not positions | VERDICT | RULED | OTHER | 3 |
| K19 | non-rest binding → no candidate value | VERDICT | RULED | OTHER | 3 |
| K20 | delete `ElementAccess`-with-`StringLiteral` recognition | VERDICT | OTHER | UNDETERMINED | 3 |
| K21 | delete `AsExpression` from the transparent-wrapper set; the walk **stops** and the candidate takes the `UNKNOWN` **fallback** | VERDICT | RULED | UNDETERMINED | 3 |
| K22 | `Array.from` → `UNKNOWN` | VERDICT | OTHER | UNDETERMINED | 3 |
| **K23** | `.tsx` → `ScriptKind.TS` | DIAGNOSTIC | 0 failures | **57 named `.tsx` files — RUN** | **1 ✅** |
| **K25** | replace the parent-statement walk with the r3 punctuation walk | ADDRESS | `statementLine` 2 | **1 — RUN** | **1 ✅** |
| K26 | key DOMAIN sites by `line:kind` instead of `start:end` | CARDINALITY | 2 sites | 1 | 3 |
| **K27** | `domainSites` on a failed parse returns `[]` | SITES | 1 `INCONCLUSIVE` | **0 — RUN** | **1 ✅** |
| K28 | admit mixed arrays as candidates, non-numeric → `unknown` cells | CARDINALITY | 0 candidates | 1, UNDETERMINED | 2 |
| K29 | global `UNKNOWN → OTHER` | SITES | 1 | 0 | 3 |
| K30 | plant `data-capped={expansionDepth < 6}` in `LoginFlow.tsx` | SITES | 1 | 2, naming the planted site | 3 |
| **K31** | raise the **node budget** from **64** to unbounded (depth limit **32** unchanged) | VERDICT | UNDETERMINED (128 counted nodes > 64) | RULED | 3 |
| K32 | accept a block body with statements before the `return`, **evaluating only the final `return`** | VERDICT | UNDETERMINED | RULED | 3 |
| K33 | ignore `slice` arguments after the second | VERDICT | UNDETERMINED | OTHER | 3 |
| K36 | evaluate both conditional branches, join to `unknown` when they differ | VERDICT | RULED | UNDETERMINED | 3 |
| K38 | admit empty array literals as candidates | CARDINALITY | 0 candidates | 1, UNDETERMINED | 2 |
| K39 | delete the comma-operator row | VERDICT | OTHER | UNDETERMINED | 3 |
| K40 | a nested array element is a payload-free non-numeric cell | VERDICT | RULED | OTHER | 3 |
| K41 | ignore `coll` and apply array methods to a `Set` | VERDICT | UNDETERMINED | RULED | 3 |
| K42 | `reduce` → `NOT_ARRAY` | VERDICT | UNDETERMINED | OTHER | 3 |
| **K43** | `at`/`find` → `NOT_ARRAY` unconditionally | VERDICT | UNDETERMINED (known `str` cells, rule 1 does not fire) | OTHER | 3 |
| K44 | any non-call member → `NOT_ARRAY` | VERDICT | UNDETERMINED | OTHER | 3 |
| K45 | drop condition 3 (`call.expression === member`) from §3.18 R4 | VERDICT | UNDETERMINED | OTHER | 3 |
| K46 | abstract `str`/`bool` cells to a payload-free non-numeric cell | VERDICT | RULED | UNDETERMINED | 3 |
| **K47** | dedupe only `num` cells in `new Set`, leaving others distinct | VERDICT | RULED | **OTHER** | 3 |
| K48 | treat **`-0` alone** as truthy | VERDICT | RULED | OTHER | 3 |
| K49 | `??` returns the left `Prim` even when it is `null` | VERDICT | RULED | OTHER | 3 |
| K50 | an operation over `NOT_ARRAY` returns `NOT_ARRAY` unchanged | VERDICT | UNDETERMINED | OTHER | 3 |
| K51 | classify only the first binding instead of any-`RULED` aggregation | VERDICT | RULED | OTHER | 3 |

**K47's direction is corrected**, like K16's, and for the same kind of reason: on the SAME-sentinel
source with the sentinel duplicated, the baseline dedupes the two `"s"` cells and yields
`[1,2,3,4,5]` → **RULED**, while the mutant leaves them distinct and yields `["s",1,2,3,4,5]`,
which carries a `NONNUMBER` cell → **OTHER**. The pre-rework `OTHER → RULED` was not reachable on
any SAME-sentinel source: where every cell is numeric the mutant's edit has no effect at all
(measured, `34-K47-binding.log`). **STRENGTH: entailed** for both native evaluations.

**Control-only rows: K7b, K7c, K7d, K20b, K34, K35, K37** — sources and isolated clauses in
Part 2c, plus the `[0,1,2,3,4,5].length` pairing asserted inside K44's row.
**MERGED: 1** (K24 → K23).
**SURVIVAL: 1** — **m6**: extend LoginFlow's run to `0..6`; observable SITES; baseline **1**;
mutant **1 — expected to SURVIVE, exit 0**; round 3; **the same restoration obligation as every
kill-expected mutation**, with the actual edited line recorded.

---

## Part 4 — the recount, from the repaired enumeration

**MUTATION rows: 48**, enumerated —
K1, K2, K3, K4, K5, K6, K6b, K7, K8, **K9**, K10, K11, K12, K13, K14, K15, K16, K17, K18, K19, K20,
K21, K22, K23, K25, K26, K27, K28, K29, K30, K31, K32, K33, K36, K38, K39, K40, K41, K42, K43, K44,
K45, K46, K47, K48, K49, K50, K51.

**By first usable round:** round 1 → **3** (K23, K25, K27, all RUN) · round 2 → **2** (K28, K38) ·
round 3 → **43**. 3 + 2 + 43 = **48**.

**CONTROL-ONLY: 7** — K7b, K7c, K7d, K20b, K34, K35, K37.
**MERGED: 1** (K24 → K23). **SURVIVAL: 1** (m6).

**Total transcripts to file: 48 mutations + 1 survival = 49.**

These figures are **recounted from the table above**, not carried from codex's conditional
arithmetic; they agree with it. *(Counted mechanically — see `35-manifest-recount.log`.)*

---

## Part 5 — what round 1 discharged

| # | Transcript | Gates | Declared observable, OBSERVED |
|---|---|---|---|
| K23 | `r1/14-K23-transcript.log` (v2, clean gates) | pre 0 · applied 1 · restored 0 · HASHES MATCH · porcelain `[]` | DIAGNOSTIC — **57** distinct complete `.tsx` paths, distribution **48 `'>' expected.` · 7 `Type expected.` · 2 `Property assignment expected.`**; every path a member of the enumerated 232-file corpus. Recounted from the raw transcript into `r1/30-K23-diagnostics-RECOUNTED.txt` |
| K25 | `r1/15-K25-transcript.log` (v2, clean gates) | as above | ADDRESS — A1's `statementLine` **2 → 1**, `start`/`end`/`elementLine` unchanged |
| K27 | `r1/16-K27-transcript.log` (v2) + re-run under v3 | as above | SITES — **1 `INCONCLUSIVE` → 0** |

**The 47 figure in the pre-rework filing was wrong and is withdrawn.** Its cause was a derived file
built with the character class `[a-z0-9/_.-]`, which excludes `[`, `]` and uppercase letters: paths
such as `apps/ui/app/debate/[id]/DebatePageClient.tsx` matched from the middle, leaving fragments
like `lient.tsx`, and `sort -u` then collapsed distinct files. **The raw transcripts always
contained the correct observable**; only my derivation was defective. The defective file carries a
SUPERSEDED banner and the raw logs are unmodified.

Round-0's M-C does **not** replace K23: M-C moved one hand-written TSX fixture; K23 moves the corpus
gate over 232 real files and names 57.

---

## Part 6 — standing obligations

- **Display/identity assertions are compulsory.** Every address fixture asserts exact `start`,
  `end`, `elementLine`, `statementLine`; A3 asserts cardinality 2 with distinct spans.
- **The round-2 stub contract:** operations and wrappers yield `UNKNOWN`, **rule-1 precedence
  retained**. Its failing set is every row that is not decided by rule 1, has at least one operation
  or wrapper, and expects `RULED` or `OTHER` — the five named semantic RED rows. **K50 is GREEN
  under the stub**, so four O1 stub failures must not be demanded.
- K48–K51 and the control-only rows are written **before** any transfer rule exists (§6.15 R4).
- **Round 2 must measure** K45's rejected-call span from K45's own canonical bytes, and record the
  final shipped population for K3's `24`.

**STRENGTH: entailed** for every measured value cited (K23's recounted 57 and its distribution;
K31's 128 nodes / depth 11 / 0 diagnostics / in-grammar kinds; K43's `(16,29)` and non-ruled distinct
set; K10's baseline and mutant cells; K9-vs-K48 on the shared fixture; K47's two native evaluations;
K45's `(64,77)`; the five prefixes' byte counts and diagnostic lines; the recount);
**consistent-with** for each unrun baseline→mutant prediction, which replays a written rule that does
not yet exist in code; **undetermined** for K45's consumed span and for every future execution.

---

## Part 7 — ROUND-2 EXECUTION (appended 2026-09-07; no row above is rewritten)

`comments read through: t1-oracle-evaluator-r1c-2026-09-07`

Round-2 base **90cf5089**; evaluator tip **23ec6717**. The gate was OPEN when this round began.

### The two round-2 mutations, RUN

| # | Precise rule edit as executed | Gates (v3, `MUT_EXPECT=1`) | Declared observable, OBSERVED |
|---|---|---|---|
| **K28** | in `candidatesOf`'s discovery predicate, `node.elements.length > 0 && node.elements.every(isNumericElement)` → `node.elements.length >= 1` (admits MIXED arrays) | pre 0 · applied 1 · restored 0 · HASHES MATCH · porcelain `[]` · `RESULT: ok` | CARDINALITY — baseline `[]` → mutant **`[ 'UNDETERMINED' ]`**, one evaluated candidate at `(38,63)` on `const sentinel = "s";\nconst choices = [0, sentinel, 2, 3, 4, 5];` |
| **K38** | same predicate → `node.elements.every((element) => isNumericElement(element))` (drops the length gate; `[].every(...)` is vacuously true, so EMPTY literals are admitted) | pre 0 · applied 1 · restored 0 · HASHES MATCH · porcelain `[]` · `RESULT: ok` | CARDINALITY — baseline `[]` → mutant **`[ 'UNDETERMINED' ]`**, one evaluated candidate at `(16,18)` on `const choices = [].concat(1,2,3,4,5);` |

Transcripts: `r2/09-K28-transcript-v3-final.log`, `r2/10-K38-transcript-v3-final.log`.
Both assert the **verdict list** before the cardinality, so the failure message carries the observable
the rows are bound to rather than a bare count.

*Custody note:* `mutate.sh` v3 **appends** to its out-log. `r2/07-K28-transcript-v3.log` therefore holds
two transcripts — a first attempt correctly refused at the pre-gate (my NEW token was a substring of
OLD, so `GATE pre = 1`), then the valid run. The `-final` logs above are single, clean transcripts.

### The remaining obligation, recounted

3 discharged in round 1 (K23, K25, K27) + 2 discharged here (K28, K38) = **5 of 48**.
**Round 3 owes 43 mutation transcripts + m6 = 44.** Never "42": that figure predates K9's restoration.

### What round 2 asserted, and what stays for round 3

Asserted this round: the two recorded work limits (**node budget 64**, **depth limit 32**,
body-inclusive `forEachChild`); the four purity clauses reported independently, with **K7d's real
assignment-rejection** carrying candidate identity `(16,29)` and a reason matching `/assignment/i`;
K45 from its **own bytes** — literal `(64,77)`, outer call textually `(16,87)`, consumed span `87`; the
computed-member twin's call textually `(16,90)`, consumed span `90`; **M17's `(16,94)` is not
inherited**; the three bare DOMAIN controls now carry **RULED** evaluated-candidate assertions while
their site emission stays on the old emitter.

Still round 3's: shipped DOMAIN emission and the `WHOLE_DOMAIN` fallback removal; A3/A9 emitted
cardinality and displayed site text/line; **K3's emitted count of 24, to be remeasured at the emission
stage**; K30 and m6's LoginFlow target, with the actual edited line recorded.

---

## Part 8 — CONTRACT AMENDMENT A1, and the round-2 rework (appended 2026-09-07)

`comments read through: t1-oracle-evaluator-r2-2026-09-07`

### AMENDMENT A1 — terminal consumption of a decided scalar (codex r2 F1)

**This is a contract amendment, not a deviation.** §3.15 R3 says a chain that *ends* at `NOT_ARRAY`
is `OTHER`, and that any further operation over `NOT_ARRAY` is `UNKNOWN`. It never said what happens
when a decided scalar is consumed by an enclosing **boolean operator** rather than bound directly.
The shipped condition

```ts
if (error.serverCode === "API_UPSTREAM_UNREACHABLE" || [502, 503, 504].includes(error.status)) {
```

(`apps/ui/lib/v3/tokenUnlock.ts:36`) therefore fell through `includes → NOT_ARRAY` to the enclosing
`||`, matched no walk row, and hit the fallback **"unmodelled owner" → UNDETERMINED**, so the plan's
predicted zero-DOMAIN shipped population was not achieved.

**The amendment, stated narrowly.** The chain **ends with the value it already has** — and therefore
`OTHER` for a `NOT_ARRAY` — when **both**:

  (a) the current value is already `NOT_ARRAY` — a **decided scalar**, never `UNKNOWN`, never `EXACT`; **and**
  (b) the enclosing node consumes it in a position that **cannot yield an array**: an operand of
      `&&`, `||` or `??`; the operand of a unary `!`; or the condition of `if` / `while` / `do` /
      `for` / a conditional expression.

**It is not a blanket `NOT_ARRAY` exemption, and it does not stop at an arbitrary scalar prefix.**
Everything else over `NOT_ARRAY` remains `UNKNOWN` — member access, calls, `new Set`, `Array.from`,
spreads, array elements and bindings — and that is asserted, not asserted-about:

| control | source | verdict |
|---|---|---|
| **positive** | `if (a \|\| [502,503,504].includes(s)) { }` | **OTHER**, `NOT_ARRAY`, reason *terminal consumption* |
| **conservative** | `const choices = new Set([0,1,2,3,4,5].join(""));` | **UNDETERMINED** — a Set over a string is an array of characters |
| **conservative** | `const choices = [0,1,2,3,4,5].join("").split("");` | **UNDETERMINED** — a member over a scalar can still yield an array |
| **conservative (K50)** | `const choices = [0,1,2,3,4,5].join("").split("").map(n => +n).slice(1);` | **UNDETERMINED** — retained unchanged |

**Measured effect on the shipped population** (`r2/25-F1-shipped-population.log`, the oracle's exact
roots/extensions/exclusions): **232/232 files parsed, 59 `.tsx`, 33 candidates, 33 OTHER, 0
UNDETERMINED.** The `tokenUnlock.ts:36` candidate is now `OTHER`; no candidate is exempted by path.
The plan's predicted zero-DOMAIN population is restored, so round 3's **total 1** and the **K3/K4/K5
models (24 / 2 / 2)** rest on a reconciled contract. **Those remain future emission predictions and
must still be remeasured at the round-3 emission stage.**

**STRENGTH: entailed** for the fresh corpus counts and for each control's measured verdict;
**consistent-with** for the conditional round-3 emission totals; future implementation **undetermined**.

### The eleven evaluator repairs, and where each is asserted

| # | Repair | Asserted by |
|---|---|---|
| B1 | initialiser / rest / optional / pattern parameters rejected in every callback operation, with an attributable reason | two rows: default-initialiser and rest-parameter, each asserting the reason |
| B2 | flatMap through the same purity gate, with its declared array-shape exception | async-rejection, untaken-branch-assignment rejection, and the admitted return-only block |
| B3 | positive grammar admission; undeclared syntax rejects the whole operation even in an untaken branch | `++n` and `void n` rows, each asserting the named operator |
| B4 | limits measured on the ORIGINAL body (body = 0, forEachChild), flatMap included | five rows: 66/11 rejects · 64/9 admits · 34 depth rejects · 28 depth admits · flatMap 129/12 rejects |
| B5 | `ToBoolean(jsx) = true`; `null`/`undefined` string rendering | payload-level rows: six `{t:"num",v:1}`; six `{t:"str",v:"null"}`; six `{t:"str",v:"undefined"}` |
| B6 | `splice()` removes nothing | the zero-argument case after a ruled derivation, contrasted with `splice(1)` |
| B7 | nested and defaulted binding forms rejected to UNKNOWN before classification | three rows, each asserting the reason |
| B8 | both consumed boundaries move to the consumed owner | K45 `(16,87)` and its twin `(16,90)`, plus a wrapper and a binding |
| B9 | exact sibling spreads folded in order | ruled `[...[1,2,3], ...[4,5]]`, decided-negative `[...[0,1,2], ...[3,4,5]]`, unmodelled-sibling negative |
| B10 | receiver-state continuation before freeze identity | freeze-over-scalar UNDETERMINED vs freeze-over-exact RULED |
| B11 | complete source, identity, full Cell payloads, Value kind, both boundaries, reasons | the rows above, plus K43's **known-receiver prefix** check (six `{t:"str",v:"x"}`) |

### Round-2 mutation execution, re-run on the reworked tip

K28 and K38 re-run under `mutate.sh` v3 with `MUT_EXPECT=1` after the rework: both `RESULT: ok`
(pre 0 · applied 1 · restored 0 · HASHES MATCH · porcelain `[]`), both showing the declared
observable **baseline `[]` → `[ 'UNDETERMINED' ]`** (`r2/26-K28-v3-rework.log`, `r2/27-K38-v3-rework.log`).

**5 of 48 mutations discharged. Round 3 owes 43 mutations + m6 = 44 transcripts.**

---

## Part 9 — AMENDMENT A1, REVISED (appended 2026-09-07, after codex r2b R1)

`comments read through: t1-oracle-evaluator-r2b-2026-09-07`

### A1 as filed in Part 8 was UNSOUND and is superseded

Part 8's version fired whenever a decided scalar was **an operand of `&&`/`||`/`??` or of `!`**. Its
premise — that such a position "cannot yield an array" — is false. **`NOT_ARRAY` decides the
OPERAND's type; it never decides the enclosing OPERATOR's result.** A logical operator may return
*the other* operand, and that operand may be an array:

| counterexample | why the old A1 was wrong |
|---|---|
| `([0,1,2,3,4,5].join("") \|\| "").split("").map(n => +n).slice(1)` | the `\|\|` yields `""`… or the string `"012345"`; `.split("")` then derives `[1,2,3,4,5]`. Inserting `\|\|` must not hide the continuation that K50 reports |
| `[0,1,2,3,4,5].includes(7) \|\| Array.from({length:5},(_,i)=>i+1)` | the operator itself yields the array, with no later member |
| `[0,1,2,3,4,5].includes(0) && Array.from(…)` · `[0,1,2,3,4,5].at(99) ?? Array.from(…)` | the same, for the other two operators |
| `f(![0,1,2,3,4,5].includes(0))` | `!` produces a boolean that still flows into `f`; deciding the intermediate does not decide `f`'s result |

### The sound replacement — a PROVED condition context

A1 now fires only when **both**:

  (a) the value is already `NOT_ARRAY` — a decided scalar, never `UNKNOWN`, never `EXACT`; **and**
  (b) the value is **provably discarded** because it sits in a **condition slot**: the condition of
      an `if` / `while` / `do` / `for` statement, or the condition operand of a conditional
      expression `c ? a : b`.

The candidate need not be the condition node itself. Logical operators, unary `!` and parentheses are
traversed **upward** to the outermost node of that envelope, and A1 fires only if **that** node is in
a condition slot. If the envelope's value is instead used — by a declaration, a call, a member access
or any other owner — **A1 does not fire and the walk continues**, which over a decided scalar yields
`UNKNOWN` (§3.15 R3).

**Counter-controls asserted, not asserted-about:** all seven counterexamples above report
`UNDETERMINED`; the shipped `if (a || [502,503,504].includes(s))` still terminates as `OTHER`; a
**paired control differing from K50 only by the `||` wrapper** is asserted, which the Part 8 controls
did not supply. Filed in the attack checklist (`r2/36-attack-checklist.log`) and in the boundary
sweep.

### Census remeasured under the sound rule

`r2/37-census-after-R1.log`: **232/232 files parsed, 59 `.tsx`, 33 candidates, 33 OTHER, 0
UNDETERMINED, 23 freeze-identity candidates.** `tokenUnlock.ts:36` is `OTHER` because it genuinely is
an `if` condition; `LoginFlow.tsx:252` is `OTHER` with six JSX cells. No path exemption.

**These remain the current evaluator population, not observed emitted sites.** The zero-DOMAIN
conclusion and the 1 / 24 / 2 / 2 models stay **conditional** and must be remeasured at round 3's
emission stage. **STRENGTH: entailed** for the census; **consistent-with** for the conditional
emission totals.

### R2 — sibling operands are now evaluated, not pattern-matched

`valueOfExpression` obtains each sibling's value under the bounded admitted grammar (array literals
with nested spreads, parentheses, `as`/`satisfies`, `new Set`, `Array.from`, `Object.freeze`, and
modelled member invocations), stopping at that operand; exact array **or set** cells fold in order and
the enclosing spread result is `coll: "array"`. An unmodelled sibling still yields `UNKNOWN`.

### Coverage added this round

- **A boundary sweep of every §3 R4 rule** — 32 rules, each with one admitted-boundary and one
  rejected-boundary assertion **derived from the spec text**, never from evaluator output.
- **The reviewer's entire attack list re-run as a checklist** — 38 classes from r1, r1b, r2 and r2b,
  filed as class · input · spec-expected · observed · STRENGTH, **38/38 match**.
- **A complete evaluated-record table** whose identity, lines and both consumed boundaries are derived
  from the source text, asserting the whole `Value` and every `Cell` payload.
- **Work-limit pairs for map AND flatMap**, expression and return-only bodies, asserted at the
  operation prefix, with the boundaries located by this test file's own independent walker.

**Two spec-silent points, stated rather than smoothed:** the consumed span when rule 1 fires (the plan
assigns none; resolved to the literal's own span by codex r2 B8's "preserve rule-1's early stop"), and
whether an **EXACT** array in a condition slot terminates (A1 requires `NOT_ARRAY`, so it stays
`UNDETERMINED`; the plan does not decide it).


---

## Part 10 — round-3 execution columns (Codex, D69)

Append-only execution columns keyed to the existing Part 3 IDs. Earlier rows, predictions and historical discharges are unchanged. STRENGTH: entailed for the measured executions below; [aggregate evidence](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/84-mutation-summary.json). Baseline semantic observations come from [33-canonical-baseline.log](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/33-canonical-baseline.log); every row has an independent restored semantic run. Custody is separate from the declared observable. K3 and K22 declare two replacement anchors; all other rows declare one.

| ID | v3 transcript / observed record | Declared observable, baseline → mutant | cmd_exit | Custody; hashes; porcelain | Restored semantics | STRENGTH |
|---|---|---|---|---|---|---|
| K1 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/40-K1-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/40-K1-outcome.json) | SITES 1 → 0 | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/40-K1-restored.log) | entailed |
| K2 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/41-K2-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/41-K2-outcome.json) | VERDICT OTHER → RULED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/41-K2-restored.log) | entailed |
| K3 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/42-K3-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/42-K3-outcome.json) | SITES 1 → 24 | 1 | 0/2/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/42-K3-restored.log) | entailed |
| K4 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/43-K4-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/43-K4-outcome.json) | SITES 1 → 2 | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/43-K4-restored.log) | entailed |
| K5 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/44-K5-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/44-K5-outcome.json) | SITES 1 → 2 | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/44-K5-restored.log) | entailed |
| K6 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/45-K6-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/45-K6-outcome.json) | VERDICT UNDETERMINED → RULED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/45-K6-restored.log) | entailed |
| K6b | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/46-K6b-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/46-K6b-outcome.json) | VERDICT RULED → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/46-K6b-restored.log) | entailed |
| K7 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/47-K7-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/47-K7-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/47-K7-restored.log) | entailed |
| K8 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/48-K8-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/48-K8-outcome.json) | VERDICT OTHER → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/48-K8-restored.log) | entailed |
| K9 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/49-K9-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/49-K9-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/49-K9-restored.log) | entailed |
| K10 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/50-K10-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/50-K10-outcome.json) | VERDICT RULED → OTHER; num[1,1,2,3,4,5] → bool[true,true,true,true,true,true] | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/50-K10-restored.log) | entailed |
| K11 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/51-K11-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/51-K11-outcome.json) | VERDICT OTHER → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/51-K11-restored.log) | entailed |
| K12 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/52-K12-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/52-K12-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/52-K12-restored.log) | entailed |
| K13 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/53-K13-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/53-K13-outcome.json) | VERDICT RULED → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/53-K13-restored.log) | entailed |
| K14 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/54-K14-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/54-K14-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/54-K14-restored.log) | entailed |
| K15 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/55-K15-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/55-K15-outcome.json) | VERDICT OTHER → RULED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/55-K15-restored.log) | entailed |
| K16 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/56-K16-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/56-K16-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/56-K16-restored.log) | entailed |
| K17 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/57-K17-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/57-K17-outcome.json) | VERDICT OTHER → RULED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/57-K17-restored.log) | entailed |
| K18 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/58-K18-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/58-K18-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/58-K18-restored.log) | entailed |
| K19 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/59-K19-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/59-K19-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/59-K19-restored.log) | entailed |
| K20 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/60-K20-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/60-K20-outcome.json) | VERDICT OTHER → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/60-K20-restored.log) | entailed |
| K21 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/61-K21-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/61-K21-outcome.json) | VERDICT RULED → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/61-K21-restored.log) | entailed |
| K22 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/62-K22-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/62-K22-outcome.json) | VERDICT OTHER → UNDETERMINED | 1 | 0/2/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/62-K22-restored.log) | entailed |
| K26 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/63-K26-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/63-K26-outcome.json) | CARDINALITY 2 → 1 | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/63-K26-restored.log) | entailed |
| K29 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/64-K29-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/64-K29-outcome.json) | SITES 1 → 0 | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/64-K29-restored.log) | entailed |
| K30 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/65-K30-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/65-K30-outcome.json) | SITES 1 → 2; actual plant line 251, emitted comparison `expansionDepth < 6` | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/65-K30-restored.log) | entailed |
| K31 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/66-K31-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/66-K31-outcome.json) | VERDICT UNDETERMINED → RULED; body 128 nodes/depth 11; node limit 64→Infinity, depth limit stays 32 | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/66-K31-restored.log) | entailed |
| K32 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/67-K32-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/67-K32-outcome.json) | VERDICT UNDETERMINED → RULED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/67-K32-restored.log) | entailed |
| K33 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/68-K33-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/68-K33-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/68-K33-restored.log) | entailed |
| K36 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/69-K36-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/69-K36-outcome.json) | VERDICT RULED → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/69-K36-restored.log) | entailed |
| K39 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/70-K39-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/70-K39-outcome.json) | VERDICT OTHER → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/70-K39-restored.log) | entailed |
| K40 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/71-K40-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/71-K40-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/71-K40-restored.log) | entailed |
| K41 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/72-K41-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/72-K41-outcome.json) | VERDICT UNDETERMINED → RULED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/72-K41-restored.log) | entailed |
| K42 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/73-K42-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/73-K42-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/73-K42-restored.log) | entailed |
| K43 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/74-K43-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/74-K43-outcome.json) | VERDICT UNDETERMINED → OTHER; receiver remains six known str("x") cells | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/74-K43-restored.log) | entailed |
| K44 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/75-K44-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/75-K44-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/75-K44-restored.log) | entailed |
| K45 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/76-K45-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/76-K45-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/76-K45-restored.log) | entailed |
| K46 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/77-K46-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/77-K46-outcome.json) | VERDICT RULED → UNDETERMINED | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/77-K46-restored.log) | entailed |
| K47 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/78-K47-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/78-K47-outcome.json) | VERDICT RULED → OTHER; exact same-sentinel source preserved; mutant cells ["s",1,2,3,4,5] | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/78-K47-restored.log) | entailed |
| K48 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/79-K48-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/79-K48-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/79-K48-restored.log) | entailed |
| K49 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/80-K49-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/80-K49-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/80-K49-restored.log) | entailed |
| K50 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/81-K50-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/81-K50-outcome.json) | VERDICT UNDETERMINED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/81-K50-restored.log) | entailed |
| K51 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/82-K51-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/82-K51-outcome.json) | VERDICT RULED → OTHER | 1 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/82-K51-restored.log) | entailed |
| m6 | [raw](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/83-m6-v3.log) · [observed](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/83-m6-outcome.json) | SITES 1 → 1; actual 0–6 run line 252; expected survival | 0 | 0/1/0; match; empty | [exit 0; baseline restored](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/83-m6-restored.log) | entailed |

K23/K25/K27/K28/K38 retain their five historical discharges. These 44 new transcripts cover 43 kill-expected mutations and 1 expected survival; all 44 restored semantic runs passed. K30’s initial evidence-checker expectation conflated conjunct text with the inserted attribute; the original single v3 transcript stands, with the correction and separate assertions in [38-K30-evidence-correction.md](/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t1-oracle-evaluator/r3/38-K30-evidence-correction.md). STRENGTH: entailed.
