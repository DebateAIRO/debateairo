# F-T1-ORACLE-EVALUATOR — implementation plan · a sound evaluator for the depth oracle's derivation arm

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` (or
> `superpowers:subagent-driven-development`). Steps use checkbox (`- [ ]`) syntax.
> RED before GREEN on every round, rework included (heartbeat §2.5).

**Goal:** decide, for one declaration, whether it DEFINES the ruled option domain 1..5 —
soundly inside a declared grammar, conservatively (report) outside it — with one decision per
occurrence and a lexer that knows what is not syntax.

**Architecture:** replace the DOMAIN arm's text-and-regex pipeline with a three-stage pure
pipeline over a TOKEN STREAM — lex (TypeScript's own scanner, driven by a small bounded
driver) → find array-literal candidates → evaluate each candidate's operation chain over an
ordered abstract domain. The two DEPTH_BOUND_LITERAL arms (`kindOfCeilingLiteral`,
`kindOfExclusiveBound`) and their line/declaration/conjunct windows are NOT touched. The
pipeline moves out of the test file into `tests/support/depthOracle.ts`, a pure module.

**Tech Stack:** TypeScript 7.0.2 (`typescript/unstable/ast`, in-process JS scanner) · Vitest ·
Node (repo `engines.node` = 22.23.1; probes below ran on v25.7.0) · pnpm 11.20.0.

**Spec:** the ticket `board/F-T1-ORACLE-EVALUATOR.md`, `DECISIONS.md` D68, the V-DECISIONS
row "F-T1-ORACLE-LOGINFP — V's ruling (08:03 2026-09-06)", and the three codex verdicts
`logs/t1-oracle-loginfp/codex-r{1,2,3}-verdict.final-snapshot.md`. The verdicts are the
specification's negative space and every section below traces to one of their findings.

**comments read through:** `t1-oracle-loginfp-codex-r3-2026-09-06`

---


---

# REVISION 2 — 2026-09-06, after codex PLAN review r1 (CHANGES: 8 blocking, 2 follow-ups)

`comments read through: t1-oracle-evaluator-plan-codex-r1-2026-09-06`

**The verdict is accepted in full. All eight blocking findings were independently reproduced
before revising** — native evaluation of B2/B3/B4/B8's expressions, a fresh 232-file parse, an
AST census, and structural line/offset checks. Not one of them was argued down.

**The headline change: the plan no longer lexes. It PARSES.** codex's recommendation is
accepted — `typescript@5.9.3`'s classic `createSourceFile`, with the evaluator over syntax
nodes — and the TypeScript 7 `unstable/ast` scanner track from Revision 1 is withdrawn. §0 R2
gives the reasons and the measurements; §1 R2 replaces the lexer with a parser and its
successful-parse contract.

**Revision 2 blocks, by section.** Original text is preserved where it is and banner-marked
`SUPERSEDED`; nothing from Revision 1 was deleted.

| Block | Answers | Replaces |
|---|---|---|
| §0 R2 | lexer/parser choice, dependency grant | §0.3, §0.4, §0.6, M1–M5 framing |
| §1 R2 | B1 | §1.1–§1.4 entirely |
| §2 R2 | B5 | §2 addressing and §2.1 acceptance |
| §3 R2 | B2, B3, B4 | §3.1, §3.3, §3.4, §3.5; adds §3.7 ownership grammar |
| §4 R2 | B8 (rule-1 discriminator) | adds to §4 |
| §5 R2 | B7 (truncated fixtures), B2 (§5's universal) | §5's soundness sentence and its LoginFlow controls |
| §6 R2 | B6 (population), B8 (matrix) | §6.1 floor, §6.2 mutant table |
| §7 R2 | codex §7 note, F1 | §7 export list and the "intact" wording |
| §8 R2 | B7 (round states) | §8 rounds 1–3 acceptance |
| §9 R2 | §9.1 disposition, universals sweep | §9.1, §9.2, §9.3; adds §9.5 |

**New measurements taken for this revision** (read-only; Node v25.7.0; TypeScript 5.9.3 at
`apps/ui/node_modules/typescript`; lane worktree at 60641339, clean):

| # | Measurement | Result | STRENGTH |
|---|---|---|---|
| M6 | `createSourceFile` over the oracle's own 232-file corpus | **232 parsed, 0 parse diagnostics** — codex's count reproduced exactly | entailed |
| M7 | the six B1/B5 inputs, parsed | `<p>[1,2,3,4,5]</p>` yields **0 array candidates**; ASI case's statement line is **2**; JSX-container case's statement line is **1** with the array on line 2; two same-line arrays get **distinct offsets** (10–21, 33–44); the regex-then-declaration and JSX-comment-text cases both **find** the array the R1 scanner driver dropped | entailed |
| M8 | AST census of array literals in the corpus | **33** non-empty numeric-only, **10** mixed, **551** empty. Consumers of the 33: 23 `Object.freeze`, 5 property assignments, 2 variable declarations, 1 `new Set`, 1 `.map` (LoginFlow), 1 `.includes` (tokenUnlock:36) | entailed |
| M9 | distinct value set of each of the 33 | **none is `{1,2,3,4,5}`** — rule 1 fires nowhere in shipped code | entailed |
| M10 | native evaluation of every expression in B2, B3, B4, B6, B8 | every codex value reproduced, including `[0..5].map(n=>`${n}`).map(n=>n*1).slice(1)` → `[1,2,3,4,5]`, the mutating-filter chain → `[1,2,3,4,5]`, `[...new Set([0..5].map(n=>n\|\|1))].slice(1)` → `[2,3,4,5]`, and `[1..5].map(n=>0)` → `[0,0,0,0,0]` | entailed |



---

# REVISION 3 — 2026-09-06, after codex PLAN review r2 (CHANGES: 6 blocking, 2 follow-ups) · LAST architecture round

`comments read through: t1-oracle-evaluator-plan-codex-r2-2026-09-06`

**All six blocking findings accepted and independently reproduced before revising.** The
classic-parser architecture is retained (the reviewer confirms it). This is the last architecture
round; §9.13 R3 lists what remains open for V.

| Block | Answers | Replaces |
|---|---|---|
| §1 R3 | R2-B4 (API + parse-failure kinds) | §1.7 R2's failure policy and acceptance snippet |
| §2 R3 | R2-B5 (A3/A9 stage) | §2.3 R2's round assignment |
| §3 R3 | R2-B1, R2-B2, R2-B3 | §3.8, §3.10, §3.12 R2 |
| §5 R3 | R2-B4 (truncated fixtures + fragment floor) | §5.3 R2's truncated-positive assertion |
| §6 R3 | R2-B6, population note | §6.7 R2's matrix and its universal |
| §7 R3 | R2-B4 (fragment harness), F1 | §7.1 R2's export list |
| §8 R3 | R2-B5 (one four-stage sequence) | §8.1–§8.6 R2 |
| §9 R3 | U9/D-R2-1 superseded, F2 asks, universals sweep, open-for-V | §9.6–§9.9 R2 |

**New measurements for this revision** (read-only, lane at 60641339, TypeScript 5.9.3, Node v25.7.0):

| # | Measurement | Result | STRENGTH |
|---|---|---|---|
| M11 | native values of every R2-B1/B2/B3/B6 expression | all reproduced: `map(n*n/n).filter(n=>n)` → `[1,2,3,4,5]`; `map(`${n}`).map(+n).slice(1)` → `[1,2,3,4,5]`; `reduce((a,n)=>n?a.concat(n):a,[])` → `[1,2,3,4,5]`; `.find(()=>true)` / `.at(0)` / `[0]` after a nested map → `[1,2,3,4,5]`; `((x)=>x.slice(1))([0..5])` → `[1,2,3,4,5]`; `filter((n,i)=>0)` → `[]`; `flatMap(n=>[n])` → `[0,1,2,3,4,5]` | entailed |
| M12 | parse diagnostics on the carried fragment controls | **all five** truncated LoginFlow prefixes: 1 diagnostic each. **Six of six** ceiling fragments I sampled also fail — including two POSITIVE controls, `depth: z.number().int().gte(1).lte(5),` and the `.superRefine(...)` line. The fragment floor is broader than R2-B4 showed | entailed |
| M13 | `A8`'s comma expression | the array literal's parent is a `BinaryExpression` — codex's reading confirmed | entailed |
| M14 | `NumericLiteral.text` normalisation | `1_0`→`10`, `0x10`→`16`, `0o10`→`8`, `0b10`→`2`, `1.5`→`1.5`; the sign is a separate prefix node | entailed |
| M15 | `Boolean(NaN)`, `Boolean(-0)` | both **false** | entailed |



---

# REVISION 4 — 2026-09-06, V-authorised bounded round after codex PLAN r3 (5 blocking)

`comments read through: t1-oracle-evaluator-plan-codex-r3-2026-09-06`

**Scope: the five items in codex's "## For V — the residual", plus the §9.12 Node fact. Nothing
else in the plan changes.** This round exists by V's authority (AMENDMENT 3); codex neither
requested nor assumed it.

All five findings were reproduced before revising, including both compiler diagnostics.

| Block | Item | Replaces |
|---|---|---|
| §1 R4 | 3 — type-valid records and site union; stub RED set | §1.9's `DuplicateSite` return, §1.11's assertion |
| §3 R4 | 1 — primitive payload, total `Cell→Prim`, Set equality · 2 — callee role | §3.13's abstraction table, §3.16's `Cell` and member row |
| §5 R4 | 4 — 27 ceiling + 3 bare DOMAIN, both standalone negatives | §5.4's inventory |
| §6 R4 | 5 — the operative mutation manifest | §6.8–§6.12's rows |
| §8 R4 | 3 + 4 in the worker steps | §8.7, §8.9, §8.10, §8.12 |
| §9 R4 | the Node fact; the residual after this round | §9.12 fact 2 |

**Measurements for this revision** (read-only; lane 60641339; TypeScript 5.9.3; Node v25.7.0):

| # | Measurement | Result | STRENGTH |
|---|---|---|---|
| M16 | codex's Set-sentinel pair | `…n===6?"a":n))].slice(2)` → `[2,3,4,5]`; `…n===6?"b":n))].slice(2)` → `[1,2,3,4,5]`. Identical Revision-3 cell lists, different native results — exact dedupe is **not** a function of the Revision-3 state | entailed |
| M17 | the callee-role fixture | parses with 0 diagnostics; array span **(71,84)**; parent `PropertyAccessExpression` **(71,93)**; grandparent `CallExpression` **(16,94)**; `call.expression === member` is **false**; the member **is** an argument. Native `[1,2,3,4,5]` | entailed |
| M18 | the two type errors, real `tsc` 5.9.3 | `TS2739: … is missing the following properties from type 'EvaluatedCandidate': value, verdict, reason` and `TS2339: Property 'diagnostic' does not exist on type 'DuplicateSite'` | entailed |
| M19 | the two omitted standalone ceiling controls | oracle **952** (`does not pair a six with a depth in another conjunct`) and **956** (`does not manufacture a site when the negative control is collapsed onto one line`). Ceiling subtotal **27**; with the 3 bare DOMAIN controls, **30**; the describe holds **66** instances | entailed |
| M20 | the four O1 controls and the manifest's new fixtures | `[-0,1,2,3,4,5].filter(n=>n)` → `[1,2,3,4,5]`; `map(n => (n===0?null:n) ?? 1)` → `[1,1,2,3,4,5]`; `join("").split("").map(+n).slice(1)` → `[1,2,3,4,5]`; `const [head,...choices] = [0..5]` → `[1,2,3,4,5]`; `[0..5].slice(1,2,3)` → `[1]` | entailed |


## Global constraints

> **REVISION 2 (2026-09-06):** the second bullet ("outside the declared grammar → `undetermined`") is
> **SUPERSEDED** — see §9.9 R2. It was false as written under Revision 1's own transition table.
> The parser replaces the lexer throughout; see §0.7 R2 and §1 R2.

- **Conservative direction is REPORT.** Outside the declared grammar → `undetermined` → a
  site. "A false positive is visible; a miss is not." (packet OUTCOME; D68.)
- **No filename exemption, no path exemption, no depth-token requirement** on the DOMAIN arm
  (codex r1 B1 required fix; r3 lines 1127–1132 pin that the withholding is unreachable for
  depth-bearing candidates).
- **One decision per occurrence**, carried to every reporting window (codex r2 B2, r3 B3).
- **The ceiling arms stay byte-intact** apart from the one clause moved out of them (§7).
- Every claim below carries **STRENGTH: entailed / consistent-with / undetermined** (D67).
- Banned in acceptance criteria: improve, better, robust, handle, appropriate.

---

## 0. Alternatives weighed before committing (`superpowers:brainstorming`)

> **REVISION 2 (2026-09-06):** §0.3 (Option B), §0.4 and §0.6 are **SUPERSEDED** by §0.7–§0.9 R2 at the
> end of this section. M4 is withdrawn as a design input; M5 is narrowed. §0.5 stands.

### 0.1 What I measured before choosing

All five measurements were taken read-only against the lane worktree at 60641339 on
Node v25.7.0. No pnpm, no suite, no git mutation.

| # | Measurement | Result | STRENGTH |
|---|---|---|---|
| M1 | `typescript` version and export map (`node_modules/typescript/package.json`) | 7.0.2; root export is `lib/version.cjs` only; subpaths `./unstable/ast`, `./unstable/ast/scanner`, `./unstable/sync`, `./unstable/async` | entailed |
| M2 | Is there an in-process JS parser? | **No.** `dist/ast/` ships types, `is`, `visitor`, `clone`, `astnav` and a full **scanner**; the only `createSourceFile` is a node FACTORY in `factory.generated.js:3036`, not a parser. Parsing goes through `dist/api/sync/client.js`, which SPAWNS the native Go executable (`#getExePath`, optionalDeps `@typescript/typescript-<platform>`; `@typescript+typescript-darwin-arm64@7.0.2` is present in the pnpm store). | entailed |
| M3 | Is the scanner importable and does it solve the B3 classes? | Yes. `createScanner(...)` from `typescript/unstable/ast` lexes `const marker = /[//]/; const slots = [0, /* c */ 1, 2, 3, 4, 5];` into `RegularExpressionLiteral "/[//]/"`, `SemicolonToken`, then the array — and lexes `const slots = (";", [0,1,2,3,4,5]);` with the `;` as a `StringLiteral`, never a `SemicolonToken`. Both are exactly codex r3 B3's inputs. | entailed |
| M4 | Does a naive scanner driver lex this corpus? | **No.** Over the 232 shipped files: a driver with only a "regex-ok-after" rule leaves LoginFlow.tsx with 4 unterminated `RegularExpressionLiteral "/>"` tokens (JSX self-closing tags at lines 184/201/250/278); adding a one-character revert on unterminated re-scan clears LoginFlow to 0, and **2 of 232 files then fail to terminate** — `apps/ui/components/EvaluatorDevMenu.tsx` and `apps/ui/components/RecommendedInvestigations.tsx`. Cause class: a `}` closing a **JSX expression container** is indistinguishable from a `}` closing a **template substitution** without JSX context. | entailed |
| M5 | How many shipped files spell the ruled run in RAW text, comments included? | **One**: `apps/ui/components/LoginFlow.tsx:252`. (232 files enumerated with the oracle's own roots/extensions/exclusions.) | entailed |

M4 is the single most important number in this plan: **the lexer is the risk, and it is a
measured risk, not a suspected one.** Three distinct driver defects surfaced in one sitting
(regex-vs-division, template substitution, JSX `/>`), two of them non-terminating.

### 0.2 Option A — hand-written evaluator over a hand-written tiny AST

Write our own lexer (strings, templates with nested substitutions, regex literals, comments,
JSX) and our own recursive-descent parser for the declaration grammar.

- **For:** no dependency; termination is structural (always advance ≥1 char); nothing
  "unstable" in the import graph; the whole thing is reviewable in one file.
- **Against:** the hard part of this ticket is the lexer, and M4 shows even Microsoft's
  scanner does not remove it — we would be writing the same three ambiguity rules ourselves,
  with no upstream to point at when codex attacks the string/template/regex edges. Every one
  of the three previous rounds died on hand-rolled text handling.
- **STRENGTH: consistent-with** for the effort estimate; **entailed** that the three
  ambiguities exist in this option too (they are properties of JavaScript, not of a library).

### 0.3 Option B — TypeScript's own scanner + a hand-written parser for the declaration grammar (**RECOMMENDED**)

Use `createScanner` from `typescript/unstable/ast` for tokenisation; drive it with a small,
explicitly-bounded driver (three rules, all named in §1); parse only the declaration grammar
by recursive descent over tokens.

- **For:** string/template/regex tokenisation is upstream's, which is precisely r3 B3's
  requirement, and `reScanSlashToken` is the sanctioned mechanism for regex-vs-division.
  Numeric-literal values, token positions and line numbers come from the scanner, so
  addressing is never derived from punctuation in raw text again (r3 B3). The parser we
  write is tiny because it only has to recognise `[` numbers `]` followed by a member chain.
- **Against:** M2 — no parser upstream, so the driver's context rules are ours; M4 — a wrong
  driver desyncs or loops; `unstable/` carries no compatibility promise across a TypeScript
  bump (the repo pins `7.0.2` exactly, so the exposure is a future dependency bump, not today).
- **STRENGTH: entailed** for the capability claims (M3); **consistent-with** that a correct
  driver is reachable inside one round — the corpus assertion in §1 is what turns that into
  evidence.

### 0.4 Option B′ — TypeScript's real parser via `typescript/unstable/sync`

Rejected. M2: it spawns the native Go binary and speaks an LSP-shaped snapshot protocol.
That puts a platform-specific executable, a subprocess lifecycle and a session cache inside a
Vitest file whose entire value is being a pure function of source text; it destroys the
one-second source-only probe harness that `.hermes/TOOLING-TRAPS.md` says to build every time
for a text-predicate oracle; and it makes the oracle unrunnable wherever the platform binary
is absent. **STRENGTH: entailed** for the mechanism, **consistent-with** for the CI claim.

### 0.5 Option C — keep heuristics, declare the limits (V rejected; recorded so the record shows it was weighed)

V ruled (b) against the orchestrator's recommendation (a). It also fails on r3's own classes,
independently of the ruling, and the failure is structural rather than a matter of adding
cases:

1. **r3's rule is positional; selection is not positional.** r3 withholds when the values
   became unknown and no operation follows (`UNKNOWN_TERMINAL`, oracle line 457). codex r3 B1
   shows selection happening INSIDE the last operation: `[0,1,2,3,4,5].filter(n => n > 0)`,
   `.flatMap(n => n ? [n] : [])`, `.splice(1)` and `[1,2,3,4,5,6].filter(n => n < 6)` each
   evaluate to `[1,2,3,4,5]` — **I re-evaluated all four; all four are `[1,2,3,4,5]`** — and
   r3 returns `[]` for each. No enrichment of a position rule reaches them, because the
   position is the same in the misses and in the hits.
2. **r3 keeps an ordered array but skips the operations that reorder it.** `reverse`/`sort`
   are treated as value-set no-ops (oracle line 448) and then `slice` indexes the unreordered
   array. Measured: `[0,1,2,3,4,5].reverse().slice(0,-1)` is `[5,4,3,2,1]` (ruled) and r3
   returns `[]`; `[0,1,2,3,4,5].reverse().slice(1)` is `[4,3,2,1,0]` (not ruled) and r3
   reports DOMAIN. Default `sort` is STRING order: `[0,1,2,3,4,5,10].sort()` is
   `[0,1,10,2,3,4,5]`. A heuristic that keeps an order it does not maintain is wrong in both
   directions inside its own three-operation grammar.
3. **r3 addresses occurrences by punctuation in raw text.** `before.search(/[;{}][^;{}]*$/)`
   (oracle line 496) treats a `;` inside a string as a statement boundary; `blankComments`
   treats the slashes in `/[//]/` as a comment. Both are refuted by inputs codex supplied and
   I reproduced at the token level (M3).
4. **The empirical rate.** Three rounds; each fixed the reported instance; each was green on
   every prior control; each was refuted by a NEW class within one review. The controls did
   not lose their power — the approach has no boundary a control can pin.

**STRENGTH: entailed** for 1–3 (values re-evaluated; oracle lines read); **consistent-with**
for 4 (a rate over three observations).

### 0.6 Recommendation

**Option B.** Take the token stream from TypeScript's scanner; write the declaration parser
and the evaluator ourselves; make the driver's three context rules explicit, bounded and
asserted over the whole corpus so the lexer cannot fail silently.

---


---

## §0 — REVISION 2 (2026-09-06): the parser, and the dependency it costs

> **REVISION 3:** §0.8's "That grant does not exist" and DECISION ROW D-R2-1 are **SUPERSEDED** —
> D68 ADDENDUM granted the alias. See §9.11 R3.

### 0.7 R2 — the lexer choice, answered

**I accept codex's recommendation: the classic TypeScript parser, and I withdraw Option B.**
Three reasons, in order of weight.

1. **B1 is not a driver bug; it is the category being wrong.** My Revision-1 gate was
   "terminates, no unterminated token, positions advance". codex's probe shows that gate passes
   while the scanner silently *omits an entire later declaration* — `if (ready) /[//]/.test(text);
   const choices = [1,2,3,4,5];` and `const view = <p>// example</p>; const choices =
   [1,2,3,4,5];` both reach clean EOF with the array gone. A lexer cannot certify its own
   context, so no amount of driver work turns "it lexed" into "it lexed correctly". I verified
   the converse directly: parsed with `createSourceFile`, **both** of those inputs yield the
   array (M7), and `<p>[1,2,3,4,5]</p>` yields **none**, which is the correct answer that no
   token-level rule of mine produced.
2. **It removes B5 as well as B1.** Statement ownership, ASI and JSX containers are parser
   facts. Measured (M7): the ASI case's owning statement begins on line 2, which my backward
   token walk gets wrong, and the JSX-container case's owning statement begins on line 1, which
   my walk also gets wrong — in the opposite direction. One dependency change retires two
   blocking findings and the whole class of custom context logic behind them.
3. **It is measured on this corpus, not argued.** M6: 232 files, 232 parsed, **0** parse
   diagnostics, using the oracle's own roots, extensions and exclusions.

**What I got wrong in Revision 1, plainly:** I searched the ROOT `typescript` (7.0.2), found no
in-process parser, and concluded the corpus had no parser available. It has one — TypeScript
5.9.3, complete classic API — and I never looked past the root resolution. That is the same
defect I wrote up in my own self-report as near-miss 1: *a dependency named in a packet is a
claim about a name, not an API*. I applied it to the version and not to the search.
**STRENGTH: entailed.**

### 0.8 R2 — the dependency grant this requires, and what happens if it is refused

The classic parser is **not reachable from the root test context today**:

| Fact | Value | STRENGTH |
|---|---|---|
| root `typescript` resolves to | `node_modules/.pnpm/typescript@7.0.2/…/lib/version.cjs` — version exports only | entailed |
| TypeScript 5.9.3 with `createSourceFile`, `forEachChild`, `SyntaxKind` exists at | `apps/ui/node_modules/typescript` | entailed |
| codex's constraint | do not import into `node_modules/.pnpm`; do not borrow an application package's dependency by relative path | entailed (verdict text) |

So adopting it requires a **root aliased devDependency plus a lockfile update and an install** —
for example `"typescript-classic": "npm:typescript@5.9.3"` in the root `package.json`, imported
as `typescript-classic`. Do not repoint the root `typescript` entry: `pnpm typecheck` runs on
7.0.2 and is not in this ticket's scope.

**That grant does not exist.** This ticket's contract allows the plan, the self-report, the
oracle test file and `tests/support/`. `package.json` and `pnpm-lock.yaml` are in
`forbidden: all_others`, and an install is a mutation.

**DECISION ROW D-R2-1 — for the orchestrator/V, before worker round 1.** Grant
`dialectical-engine/package.json` + `pnpm-lock.yaml` + one `pnpm install` to the worker's round 1,
scoped to adding the aliased `typescript-classic@5.9.3` devDependency and nothing else, with the
lockfile diff reviewed. **If that grant is refused, this ticket is BLOCKED on the lexical
architecture**, and I will not substitute either rejected option: not the TS 7 scanner (B1
refutes it), not a relative-path import into `apps/ui` or `.pnpm` (codex forbids it). I state
that rather than quietly picking the third-best thing.

**STRENGTH: entailed** for the resolution facts and the contract text; **consistent-with** that
an aliased devDependency is the cleanest form of the grant.

### 0.9 R2 — what Revision 1's measurements still prove, and what they do not

| Revision-1 claim | Status after review |
|---|---|
| M1, M2 (TS 7 has no in-process parser; root export is version-only) | **stands**, and codex re-verified it |
| M3 (the TS 7 scanner handles the two B3 literals) | **stands, and is no longer load-bearing** — B1 shows it is not sufficient |
| M4 (2 of 232 files fail a naive driver) | **withdrawn as a design input.** codex marks the exact two-file set `undetermined` because my complete driver was not supplied, and it is moot: the driver is gone |
| M5 (one raw `1,2,3,4,5` run in the corpus) | **narrowed.** It proves only what codex allows it to prove — the raw run occurs at LoginFlow, and no such run occurs in a comment. It does **not** measure the evaluator's candidate population; M8/M9 do. See §6 R2 |
| §0.5's refutation of Option C | **stands**, unaffected |


## 1. Lexical structure first (codex r3 B3)

> **REVISION 2 (2026-09-06):** this entire section — §1.1 through §1.4 — is **SUPERSEDED** by §1 R2 at
> the end of it. `lexModule` and the R-1/R-2/R-3 driver are withdrawn; the design parses (codex B1).

**What the section owes:** strings, template literals and regex literals are not syntax;
occurrence addressing and declaration boundaries come from a token stream; comments handled
once; regex-vs-division stated or bounded; the existing lexer reused or replaced, with reasons.

### 1.1 The token stream

`lexModule(source: string): LexResult` where

```
type LexResult =
  | { ok: true;  tokens: readonly Token[] }
  | { ok: false; reason: "UNTERMINATED" | "NO_PROGRESS"; atOffset: number }

interface Token { kind: SyntaxKind; text: string; start: number; end: number; line: number }
```

Comments and whitespace are TRIVIA and never enter `tokens` — handled once, by the scanner,
by not being tokens. `blankComments` (oracle lines 322–373) is DELETED: nothing needs
blanking when comments are not in the stream. **STRENGTH: entailed** that the scanner skips
trivia when constructed with `skipTrivia = true` (M3's token dumps contain no comment tokens).

### 1.2 The driver's three context rules — all three are measured, none is guessed

TypeScript's scanner is context-free by design; the three re-scan hooks below are the API's
own mechanism for supplying context (`reScanSlashToken`, `reScanTemplateToken` are declared
in `Scanner` in `dist/ast/scanner.d.ts`).

- **R-1 regex vs division.** A `/` is re-scanned with `reScanSlashToken()` **only when the
  previous emitted token cannot end an expression** — start of input, or one of
  `( [ { } ; , : ? = == === ! && || ?? => + - *` and the keywords
  `return typeof case in new delete void instanceof`. Otherwise it stays `SlashToken`.
  *Bound:* if the re-scan yields `isUnterminated()`, the re-scan is REVERTED — the token is a
  `SlashToken` of exactly one character and the scanner is reset to `start + 1`. This is what
  makes JSX `/>` lex (M4: LoginFlow drops from 4 unterminated to 0).
- **R-2 template substitutions.** Maintain a stack; push a marker on `TemplateHead` /
  `TemplateMiddle`, push `"brace"` on `OpenBraceToken`, and on `CloseBraceToken` whose stack
  top is a template marker call `reScanTemplateToken(false)`.
- **R-3 JSX.** M4's two runaway files prove R-2 alone is not enough in `.tsx`: a `}` closing a
  JSX expression container looks identical to a `}` closing a template substitution. The
  driver therefore lexes with `LanguageVariant.JSX` and only applies R-2 when the template
  marker was pushed **at the current brace depth**, and it carries a **monotonic-progress
  guard**: if `getTokenStart()` does not advance between iterations the lexer returns
  `{ ok: false, reason: "NO_PROGRESS" }` instead of looping.

**Failure is loud, and failure is conservative.** `ok: false` for a file means every ruled-run
candidate in that file is reported (never silently dropped). Today's cost of that rule is
zero, because M5 measured exactly one shipped file containing a ruled run, and M4 measured
that file lexing cleanly under R-1+R-2.

**STRENGTH: entailed** for R-1's effect on LoginFlow and for the existence of the two runaway
files. **undetermined** whether R-3 as stated is sufficient for all `.tsx` in this corpus —
that is precisely what the acceptance test below decides, and it is a check that CAN fail
(D56): it fails today, on two named files.

### 1.3 What happens to the existing lexer

| Existing | Disposition | Why |
|---|---|---|
| `blankComments` (322–373) | **DELETE** | comments are trivia; the representation it created is what codex r2 B2 refuted |
| `ruledDomainOccurrences` (478–512), `withheldDomainLines` (515–531), `operationsApplied` (391–429), `derivedDomain` (436–458), `NUMERIC_RUN`, `NARROWS_WITH_A_REST_BINDING`, `COLLAPSES_THE_VALUE_DOMAIN`, `INTEGER_ARGUMENTS` | **REPLACE** | these are the three refuted rounds |
| `declarationUnits` (655–733) | **KEEP, unchanged** | it is the layout-independence machinery for the DEPTH_BOUND_LITERAL arms, which codex confirmed intact and which must stay so. Its own documented limit — a quote-delimited string is closed at a newline, so a regex mis-read desyncs within one line only — is tolerable for evidence that is line/conjunct-local, and is NOT tolerable for addressing, which is why the DOMAIN arm stops using it |
| `kindOfCeilingLiteral` (594–597) | **ONE CLAUSE MOVED OUT** | the `WHOLE_DOMAIN` fallback leaves it; see §7 |
| `kindOfExclusiveBound` (600–604), `kindOf` (555–560), `MENTIONS_A_DEPTH`, `BARE_FIVE`, `SIX_AS_EXCLUSIVE_BOUND` | **KEEP, byte-unchanged** | not implicated by any verdict |

**STRENGTH: entailed** (line numbers read from the blob at 60641339).

### 1.4 Acceptance test — §1

```
it("lexes every shipped file with no unterminated token and no stalled position", () => {
  const failures = shippedSourceFiles()
    .map((absolute) => ({ path: relative(REPOSITORY_ROOT, absolute), result: lexModule(readFileSync(absolute, "utf8")) }))
    .filter((entry) => entry.result.ok === false)
    .map((entry) => `${entry.path}: ${entry.result.reason}@${entry.result.atOffset}`);
  expect(failures).toEqual([]);
});
```

RED today for `apps/ui/components/EvaluatorDevMenu.tsx` and
`apps/ui/components/RecommendedInvestigations.tsx` under a driver without R-3 (M4).

Plus token-level controls, each asserting the token KINDS, not a site:

| Input | Required tokens |
|---|---|
| `const marker = /[//]/; const slots = [0,1,2,3,4,5];` | one `RegularExpressionLiteral`, then a real `SemicolonToken` |
| `const slots = (";", [0,1,2,3,4,5]);` | the `;` is a `StringLiteral`, never a `SemicolonToken` |
| `const slots = (\n  ";", [0,1,2,3,4,5]);` | same token kinds as the line above |
| `` const s = `a;${x}b`; const t = [1,2,3,4,5]; `` | `TemplateHead`, `Identifier`, `TemplateTail`, `SemicolonToken`, then the array |
| `const q = a / b / c;` | two `SlashToken`, no `RegularExpressionLiteral` |
| `<span disabled={busy}\n/>` | no `RegularExpressionLiteral` |

**What this test would NOT catch:** a driver that lexes every file cleanly but assigns wrong
LINE numbers. That is covered by §2's addressing controls, not here.

---


---

## §1 — REVISION 2 (2026-09-06): parse, don't lex (answers B1)

> **REVISION 3:** §1.7's failure policy and its acceptance snippet are **SUPERSEDED** by §1 R3
> (R2-B4: one INCONCLUSIVE kind, a split API, and a snippet that typechecks).

**§1.1–§1.4 of Revision 1 are superseded in full.** `lexModule`, the R-1/R-2/R-3 driver rules,
the unterminated/progress gate and the six token-kind fixtures are withdrawn.

### 1.5 R2 — `parseModule`

```
type ParseResult =
  | { ok: true;  file: SourceFile }
  | { ok: false; diagnostics: readonly { line: number; message: string }[] }

parseModule(path: string, source: string): ParseResult
```

Implementation contract, stated so a reviewer can check it without reading code:

- `createSourceFile(path, source, ScriptTarget.Latest, /* setParentNodes */ true, scriptKind)`.
- `scriptKind` is chosen from the extension: `.tsx` → `ScriptKind.TSX`, `.mjs` → `ScriptKind.JS`,
  `.ts`/`.mts` → `ScriptKind.TS`. **This mapping is load-bearing**: a `.tsx` file parsed as
  `TS` mis-parses its JSX, and round 1's RED fixture is exactly that (see §8 R2).
- `setParentNodes` is `true` because §2 R2's addressing and §3.7 R2's ownership walk both climb
  the parent chain. A parse without it is not usable by this design.
- Syntactic diagnostics are read from the parsed file and reported. This uses the
  `parseDiagnostics` property, which is not part of the documented public surface; it is read
  behind one accessor in the module so a future change touches one line, and the corpus gate
  below is what would notice a change in its behaviour. **STRENGTH: consistent-with** for that
  property's long-term stability; **entailed** that it is populated today (M6 read it over 232
  files and got 0).

### 1.6 R2 — the successful-parse contract

"It parsed" is not the claim. The claim is that each of these constructs is resolved to the
right category, and each row is an assertion, not a description:

| Construct | Required resolution | Fixture (all verified by M7 unless marked) |
|---|---|---|
| control-condition parentheses vs expression parentheses | a regex after `if (…)` is a regex; the following declaration survives | `if (ready) /[//]/.test(text); const choices = [1,2,3,4,5];` → **1** candidate |
| JSX text | never an array candidate | `const view = <p>[1,2,3,4,5]</p>;` → **0** candidates |
| JSX text resembling a comment | does not swallow following code | `const view = <p>// example</p>; const choices = [1,2,3,4,5];` → **1** candidate |
| JSX attributes and expression containers | the container's expression is ordinary code, the tag is not | `const view = <section>{[1,2,3,4,5]}</section>;` → **1** candidate |
| JSX self-closing tag | `/>` is not a regex | LoginFlow.tsx parses with 0 diagnostics (M6) |
| nested templates | a template inside a substitution inside a template does not desync | `` const s = `a${`b${[1,2,3,4,5].length}c`}d`; `` → **1** candidate (fixture to be asserted; not separately measured) |
| the two files that defeated the R1 driver | parse with 0 diagnostics and are inside M6's 232 | `EvaluatorDevMenu.tsx`, `RecommendedInvestigations.tsx` |
| the whole corpus | 232 files, 0 parse diagnostics | M6 |

The last row is **one gate, not the completion signal** — codex's point, taken. Completion is
the whole table plus §2 R2's address fixtures.

### 1.7 R2 — the failure policy, made executable

Revision 1 said a failed file's candidates would all be reported, while `LexResult.ok:false`
carried no candidates to report. That was incoherent. Replaced:

- `parseModule` returning `ok:false` produces **one file-level `INCONCLUSIVE` record**
  carrying the path and the first diagnostic's line and message.
- `depthBoundSitesInShippedCode()` includes `INCONCLUSIVE` records in its output, so the
  shipped-sites assertion — which expects exactly the owning declaration — **fails**, naming
  the file.
- There is no fallback to the old lexer and no acceptance of an old-lexer negative for such a
  file. codex's round-1 instruction, taken literally: an inconclusive result keeps the gate
  **red**.

**Acceptance test — §1 R2:**

```
it("parses every shipped file with no syntactic diagnostic", () => {
  const failures = shippedSourceFiles()
    .map((absolute) => ({ path: relative(REPOSITORY_ROOT, absolute), parsed: parseModule(absolute, readFileSync(absolute, "utf8")) }))
    .filter((entry) => entry.parsed.ok === false)
    .map((entry) => `${entry.path}: ${entry.parsed.diagnostics[0]?.line}: ${entry.parsed.diagnostics[0]?.message}`);
  expect(failures).toEqual([]);
});

it.each(PARSE_CONTEXT_FIXTURES)("resolves $construct to $expected candidates", ({ source, kind, expected }) => {
  expect(candidatesOf(kind, source).length).toBe(expected);
});

it("reports a file whose parse fails, rather than passing it silently", () => {
  const sites = sitesForFile("x.ts", "const a = [1,2,3,4,5");      // deliberately unbalanced
  expect(sites.map((s) => s.kind)).toContain("INCONCLUSIVE");
});
```

`candidatesOf` returns the candidate table of §2 R2, so a fixture asserts a COUNT and, where
the count is 1, its offsets — never merely "no site".

**Note on strict typing (codex's §1 acceptance remark):** `ParseResult` is a discriminated
union, so `entry.parsed.diagnostics` is only reachable after the `ok === false` narrowing shown
above. The Revision-1 example read `result.reason`/`result.atOffset` off an un-narrowed union
and would not have typechecked.

**What this would NOT catch:** a parser that resolves every construct correctly but a candidate
finder that reads the wrong nodes. §2 R2's cardinality and offset assertions cover that.

**STRENGTH: entailed** for every row marked M6/M7; **consistent-with** for the nested-template
row, which is specified here and asserted in round 1 but was not separately measured.


---

## §1 — REVISION 3 (2026-09-06): one set of API signatures, one parse-failure kind (answers R2-B4)

> **REVISION 4:** §1.9's `domainSites` return type and §1.11's diagnostic assertion are
> **SUPERSEDED** by §1 R4 (R3-B3: TS2739 and TS2339, both reproduced).

**§1.7 R2's failure policy and its acceptance snippet are superseded.** Two defects, both codex's:
the snippet does not typecheck, and a single `duplicateBoundSites` cannot both report
`INCONCLUSIVE` for an unparseable fragment and return `[]` for the carried ceiling controls.

### 1.8 R3 — the reason the API must split

M12: **six of six** ceiling fragments I sampled carry a parse diagnostic — including two
POSITIVE controls (`depth: z.number().int().gte(1).lte(5),` and the `.superRefine(…)` line), which
codex's four-fragment sample did not reach. The historical controls are *fragments*, not source.
They are also exactly the arms F1 says must not be re-lexed. So the parser must never see them.

### 1.9 R3 — signatures

```
type SiteKind = "DEPTH_BOUND_LITERAL" | "DOMAIN_ENUMERATION" | "INCONCLUSIVE"

interface DuplicateSite { kind: SiteKind; line: number; text: string }
interface InconclusiveSite extends DuplicateSite { kind: "INCONCLUSIVE"; path: string; diagnostic: string }

parseModule(path: string, source: string): ParseOk | ParseFailed
  ParseOk     = { ok: true;  file: ts.SourceFile }
  ParseFailed = { ok: false; diagnostics: readonly { line: number; message: string }[] }

ceilingSites(source: string): DuplicateSite[]          // TEXT ONLY. declarationUnits + line + conjunct
                                                        // windows, behaviour unchanged. NEVER parses.
domainSites(path: string, source: string): DuplicateSite[]   // PARSER ONLY. [] , DOMAIN sites, or
                                                        // exactly one INCONCLUSIVE when the parse fails.
candidatesOf(path: string, source: string): EvaluatedCandidate[]   // [] when the parse fails
duplicateBoundSites(path: string, source: string): DuplicateSite[] // ceilingSites ∪ domainSites, sorted
```

- **`ceilingSites` is the fragment harness.** The carried CEILING controls assert on it, unchanged
  in text and in expected value: **25** of them — 6 of the 8 "written as" spellings, 3 of the 4
  "laid out as" layouts, the 3 wrapped conjuncts, the 2 unrelated-ceiling negatives, the 3
  exclusive-six layouts, the 5 unrelated-depth negatives, the 2 depth-in-reach controls and the
  "narrows r3 in exactly one place" pair. **The other three are DOMAIN controls that reach the arm
  only through the `WHOLE_DOMAIN` clause §7 removes** — `{[1, 2, 3, 4, 5].map((value) => value)}`
  and `const allowed = new Set([1, 2, 3, 4, 5]);` from the spellings block, and the multiline
  `const allowed = [\n 1,\n 2,\n 3,\n 4,\n 5\n ];` from the layouts block. They assert on
  `domainSites` and they are the three bare option-domain controls. Counted from the oracle at
  60641339, not from the block names. **STRENGTH: entailed.** No fragment is rewritten into valid source, and no ceiling arm is
  re-lexed. This is the F1-compatible reading of codex's "clearly separate fragment harness".
- **Positive ceiling controls assert the KIND**, never non-emptiness:
  `expect(ceilingSites(planted).map(s => s.kind)).toEqual(["DEPTH_BOUND_LITERAL"])`. An
  `INCONCLUSIVE` cannot satisfy that, and `ceilingSites` cannot produce one anyway.
- **`path` is a real parameter.** The shipped scan passes the file's repository-relative path;
  planted DOMAIN controls pass `"planted.tsx"` when the fixture contains JSX and `"planted.ts"`
  otherwise, so `ScriptKind` selection is explicit at every call site rather than inferred.

### 1.10 R3 — parse failure, one kind, conservative

`domainSites` on `ok:false` returns **exactly one** record:

```
{ kind: "INCONCLUSIVE", line: <first diagnostic's line>, text: <first diagnostic's message>,
  path, diagnostic: <same message> }
```

No fabricated `DOMAIN_ENUMERATION`. It fails the shipped assertion by name because that
assertion is an exact-array equality against the single owning-declaration site.

### 1.11 R3 — the acceptance snippet, rewritten to typecheck

codex is right that the Revision-2 snippet produces TS2339: `.filter(...)` does not narrow a
nested union for the subsequent `.map(...)`. Replaced with an explicit loop:

```ts
it("parses every shipped file with no syntactic diagnostic", () => {
  const failures: string[] = [];
  for (const absolute of shippedSourceFiles()) {
    const path = relative(REPOSITORY_ROOT, absolute).split(sep).join("/");
    const parsed = parseModule(path, readFileSync(absolute, "utf8"));
    if (parsed.ok) continue;
    const first = parsed.diagnostics[0];
    failures.push(`${path}: ${first ? `${first.line}: ${first.message}` : "no diagnostic"}`);
  }
  expect(failures).toEqual([]);
});
```

`parsed.diagnostics[0]` is `| undefined` under `noUncheckedIndexedAccess`, which this repo sets;
the guard is not decoration. The worker runs `pnpm typecheck` against the recorded baseline
rather than trusting this snippet — codex's instruction, taken.

**STRENGTH: entailed** for M12's six diagnostics and for the TS2339 diagnosis (codex measured it;
the repo's `noUncheckedIndexedAccess` and `strict` are read from `tsconfig.json`);
**consistent-with** that the split API is the least-change way to satisfy R2-B4 and F1 together.


---

## §1 — REVISION 4 (2026-09-06): records and site union that typecheck at their first round (item 3, R3-B3)

**§1.9's `domainSites` return type and §1.11's diagnostic assertion are superseded.** M18 reproduced
both errors with real `tsc` 5.9.3: `TS2739` names `value, verdict, reason` as missing, and `TS2339`
says `diagnostic` does not exist on `DuplicateSite`. Both are entailed by my own declarations —
I declared three required fields and then said round 1 omits them, and I declared `diagnostic` only
on an interface `domainSites` does not return.

### 1.12 R4 — two records, one extension

```ts
interface DiscoveredCandidate {          // complete after ROUND 1
  readonly start: number; readonly end: number;
  readonly elementLine: number; readonly statementLine: number;
}
interface EvaluatedCandidate extends DiscoveredCandidate {   // complete after ROUND 2
  readonly consumedStart: number; readonly consumedEnd: number;
  readonly value: Value;
  readonly verdict: "RULED" | "OTHER" | "UNDETERMINED";
  readonly reason: string;
}

candidatesOf(path: string, source: string): DiscoveredCandidate[]
evaluatedCandidatesOf(path: string, source: string): EvaluatedCandidate[]
```

**Consumed-span states, stated:** the span is produced by the ownership walk, which is evaluation,
not discovery. It therefore belongs to `EvaluatedCandidate` and is absent in round 1 — no
placeholder, no cast. A round-1 assertion cannot read a field that does not exist on the type it
receives, so no round-1 test can mistake a placeholder for a result. This is the alternative codex
offered, chosen over nonsemantic placeholders because a placeholder is a value a later reader can
believe.

Both functions return `[]` when the parse fails; the failure is reported by `domainSites`.

### 1.13 R4 — the site type is a discriminated union

```ts
type Site =
  | { readonly kind: "DEPTH_BOUND_LITERAL" | "DOMAIN_ENUMERATION"; readonly line: number; readonly text: string }
  | { readonly kind: "INCONCLUSIVE"; readonly line: number; readonly text: string;
      readonly path: string; readonly diagnostic: string }

ceilingSites(source: string): Site[]                          // never yields INCONCLUSIVE
domainSites(path: string, source: string): Site[]
duplicateBoundSites(path: string, source: string): Site[]
```

`InconclusiveSite` as a separate unused interface is deleted. Every read of `path` or `diagnostic`
narrows on `kind` first:

```ts
const [site] = domainSites("planted.tsx", planted);
if (site?.kind !== "INCONCLUSIVE") throw new Error(`expected INCONCLUSIVE, got ${site?.kind ?? "none"}`);
expect(domainSites("planted.tsx", planted)).toHaveLength(1);
expect(site.path).toBe("planted.tsx");
expect(site.line).toBeGreaterThan(0);
expect(site.diagnostic.length).toBeGreaterThan(0);
```

The `throw` narrows for the rest of the block; an `expect` does not narrow a TypeScript union, which
is the mistake in the Revision-3 snippet. §1.11's loop correction is preserved unchanged.

### 1.14 R4 — the round-2 stub's ACTUAL failing set

Revision 3 claimed "every `OTHER` and `RULED` row" fails under an "every operation → `UNKNOWN`"
stub. codex is right that this is too broad, and the exceptions follow from my own rules:

- a candidate with **no operation and no wrapper** never reaches the transfer function — bare
  `[0,1,2,3,4,5]` and bare `[1,2,3,4,5,6]` stay `OTHER` and are **GREEN under the stub**;
- a **rule-1** candidate is decided before the walk — the three bare DOMAIN controls and
  `[1,2,3,4,5].map(n => 0)` stay `RULED` and are **GREEN under the stub**.

**The stub's failing set is: every row that (a) is not decided by rule 1, (b) has at least one
operation or wrapper, and (c) expects `RULED` or `OTHER`.**

Clause (a) is not decoration: `[1,2,3,4,5].map(n => 0)` has an operation and expects `RULED`, yet
rule 1 decides it before the walk, so it is GREEN under the stub. Without (a) this very sentence
would be refuted by a row in the plan's own §4 R2. Rows expecting `UNDETERMINED` — `reduce`, the
unknown enclosing call — are GREEN under the stub too, which is why (c) is stated positively. Named deterministic members, asserted by the round-2 RED step:
`[0,1,2,3,4,5].slice(1)` (expects RULED) · `[0,1,2,3,4,5].filter(n => n % 2 === 0)` (expects OTHER,
cells `[0,2,4]`) · `[0,1,2,3,4,5].reverse().slice(1)` (OTHER) ·
`Array.from(new Set([0,1,2,3,4,5].map(n => n || 1))).slice(1)` (OTHER) ·
`[1,2,3,4,5,6].slice(0,-1)` (RULED). Named GREEN under the same stub: the two bare rows above and
the three rule-1 controls.

**STRENGTH: entailed** for M18's two diagnostics and for the stub exceptions (they follow from
§3.2's rule-1 precedence and from a candidate with no operations never entering the transfer);
**consistent-with** that the two-record split removes every placeholder question.

## 2. One occurrence, one decision (codex r2 B2, r3 B3)

> **REVISION 2 (2026-09-06):** the backward-token-walk addressing and §2.1's acceptance are
> **SUPERSEDED** by §2 R2 at the end of this section (codex B5: ASI and JSX containers).

**The structural change:** the DOMAIN arm stops being a predicate applied in three windows and
becomes an EMITTER. A `DOMAIN_ENUMERATION` site is produced by, and only by, the evaluator,
from a candidate. There is therefore no merge-point suppression, no `withheldDomainLines`, no
second representation, and no possibility of two windows disagreeing — the class of defect
`.hermes/TOOLING-TRAPS.md` records as "a multi-window scanner cannot carry SUPPRESSION inside
a window's predicate" is removed rather than managed.

**Addressing, from tokens only:**

- `firstLine` = the line of the first token of the enclosing statement, found by walking
  BACKWARDS over tokens to the nearest `SemicolonToken` / `OpenBraceToken` / `CloseBraceToken`
  at or below the candidate's bracket depth, then forward one token. A `;` inside a string is
  a `StringLiteral` token and can never be that boundary — which is r3 B3's exact defect.
- `lastLine` = the line of the candidate's own `CloseBracketToken`.
- The emitted site's line is `firstLine`. One candidate, one site, one line.

### 2.1 Acceptance test — §2

```
it.each([
  { layout: "inline",  planted: 'const slots = (";", [0, 1, 2, 3, 4, 5]);' },
  { layout: "wrapped", planted: 'const slots = (\n  ";", [0, 1, 2, 3, 4, 5]);' }
])("addresses a declaration whose string holds a semicolon at its real first line — $layout",
  ({ planted }) => { expect(duplicateBoundSites(planted)).toEqual([]); });

it("does not report through a regex literal that contains slashes", () => {
  expect(duplicateBoundSites("const marker = /[//]/; const slots = [0, 1, 2, 3, 4, 5];")).toEqual([]);
});
```

and the r3 "equivalent layouts must agree" property, extended so it asserts the site LINE as
well as the verdict:

```
it.each(LAYOUT_GROUPS)("gives equivalent layouts the same verdict AND the same relative line — $group",
  ({ layouts, expected }) => {
    const seen = layouts.map((planted) => {
      const sites = duplicateBoundSites(planted).filter((s) => s.kind === "DOMAIN_ENUMERATION");
      return { reported: sites.length > 0, line: sites[0]?.line ?? null };
    });
    expect(seen.map((s) => s.reported)).toEqual(layouts.map(() => expected));
    expect(new Set(seen.map((s) => s.line)).size).toBe(1);   // one address, not one verdict per window
  });
```

**What this would NOT catch:** a declaration split across a `}` that belongs to an object
literal inside the same statement. Named as a residual in §9.

**STRENGTH: entailed** that r3 returns the two `(";", …)` results codex records (its
`statementStart` regex is at oracle line 496 and matches raw text). **consistent-with** that
removing the merge point removes the whole class rather than one member.

---


---

## §2 — REVISION 2 (2026-09-06): structural addressing and occurrence identity (answers B5)

> **REVISION 3:** A3 and A9 were scheduled as SITE assertions in round 1, which the old emitter
> cannot satisfy. Round assignment **SUPERSEDED** by §2 R3 (R2-B5).

**§2's backward token walk and §2.1's acceptance are superseded.** Tokenising punctuation
correctly does not implement ASI, and it gets JSX containers wrong in the other direction.
Measured (M7): for `const marker = 0␊const choices = [1,2,3,4,5]` the owning statement begins on
line **2** (my walk said 1); for `const view = <section>{␊  [1,2,3,4,5]␊}</section>;` it begins on
line **1** (my walk said 2).

### 2.2 R2 — identity is an offset pair; the line is only a display

```
interface Candidate {
  readonly start: number;        // node.getStart(sourceFile) — IDENTITY
  readonly end: number;          // node.getEnd()             — IDENTITY
  readonly elementLine: number;  // line of `start`
  readonly statementLine: number;// line of the owning statement's first token — DISPLAY
  readonly values: readonly Cell[];
}
```

- **Owning statement**: from the candidate node, climb `node.parent` until `ts.isStatement(n)`.
  That is a parser fact and needs no punctuation rule. Where no statement encloses the node
  (a candidate in a top-level expression position that the parser does not wrap), the owning
  container is the nearest node with a parent of `SourceFile`, and the fixture asserts it.
- **Occurrence identity** is `(start, end)`. Two candidates on one physical line are two
  candidates — M7 measured distinct offsets 10–21 and 33–44 for `const a = [1,2,3,4,5]; const b = [1,2,3,4,5];`.
- **DOMAIN sites are keyed by `start:end`, not by `line:kind`.** The Revision-1 plan kept the
  inherited `line:kind` map, which would collapse those two. The DEPTH_BOUND_LITERAL arms keep
  their existing `line:kind` map, **in a separate structure** — codex's "keep ceiling-arm
  deduplication separate", taken.
- The emitted site's reported `line` is `statementLine`; its `text` is the owning statement's
  first line, trimmed. Display and identity never share a field.

### 2.3 R2 — acceptance, asserting addresses rather than emptiness

Every row asserts exact cardinality and, for each candidate, `(statementLine, elementLine,
start, end)`. `toEqual([])` is no longer accepted as an addressing assertion anywhere.

| # | Input | Required |
|---|---|---|
| A1 | `const marker = 0␊const choices = [1,2,3,4,5]␊` (ASI) | 1 candidate, `statementLine` **2**, `elementLine` 2 |
| A2 | `const view = <section>{␊  [1,2,3,4,5]␊}</section>;` | 1 candidate, `statementLine` **1**, `elementLine` **2** |
| A3 | `const a = [1,2,3,4,5]; const b = [1,2,3,4,5];` | **2** candidates, distinct `(start,end)`, both `statementLine` 1; **2** sites, not 1 |
| A4 | `` const s = `x${[1,2,3,4,5].length}y`; `` | 1 candidate, `statementLine` 1 |
| A5 | `const o = { a: [1,2,3,4,5] };` | 1 candidate, `statementLine` **1** — the object-literal closer residual of Revision 1 is retired, not carried |
| A6 | `const slots = [0, /* c */ 1, 2, 3, 4, 5];` | 1 candidate, values `[0,1,2,3,4,5]` — comments are trivia to the parser |
| A7 | `const marker = /[//]/; const choices = [1,2,3,4,5];` | 1 candidate; the regex is not a candidate |
| A8 | `const slots = (";", [0,1,2,3,4,5]);` inline **and** wrapped after `(` | 1 candidate each, identical `statementLine` **1**, identical values |
| A9 | `const a = [1,2,3,4,5]; const b = [0,1,2,3,4,5];` | 2 candidates; **1** site (a positive beside a withheld candidate) |
| A10 | `const m = { [1]: "x" };` and `const v = a[1];` | **0** candidates — computed indexing and computed property names are not array expressions |
| A11 | `type T = [1,2,3,4,5];` | **0** candidates — a tuple TYPE is not an expression |

A10 and A11 are codex's "candidate syntax must distinguish expression arrays from computed
indexing and type syntax"; the parser distinguishes them by node kind, which a `[`-numerics-`]`
token pattern cannot.

**What this would NOT catch:** a correct address attached to a wrong verdict. §3 R2 covers that.

**STRENGTH: entailed** for A1, A2, A3 (measured, M7); **consistent-with** for A4–A11, which
follow from node kinds and are asserted rather than measured here.


---

## §2 — REVISION 3 (2026-09-06): A3 and A9 are candidate assertions in round 1 (answers R2-B5.1)

§2.2 R2's design is unchanged. What changes is the round assignment: A3 ("two arrays on one line")
and A9 ("a positive beside a withheld candidate") were written as **site** assertions and placed in
round 1, which still runs the old `line:kind` emitter. The old emitter cannot produce A3's two
same-line sites, so that acceptance row could not go green where it was scheduled.

**Split, per fixture:**

| Fixture | Round 1 asserts (candidates) | Round 3 asserts (sites) |
|---|---|---|
| A3 `const a = [1,2,3,4,5]; const b = [1,2,3,4,5];` | 2 candidates, `(start,end)` = `(10,21)` and `(33,44)`, both `statementLine` 1 | 2 `DOMAIN_ENUMERATION` sites |
| A9 `const a = [1,2,3,4,5]; const b = [0,1,2,3,4,5];` | 2 candidates, distinct spans | 1 site |
| A1, A2, A4–A8, A10, A11 | candidate count, `statementLine`, `elementLine`, `(start,end)` | — |

The offsets `(10,21)` and `(33,44)` are the measured values (M7), given here as fixture constants
so the worker asserts a literal rather than recomputing one — codex's "give the fixture literals".

**A8's disposition is a rule, not a fixture adaptation** — see §3.16 R3's comma-operator row. The
historical `(";", [0,1,2,3,4,5])` negatives keep their expected value.

**STRENGTH: entailed** for the offsets (measured) and for the old emitter's key shape (read at
60641339).

## 3. The declared grammar and its abstract domain

> **REVISION 2 (2026-09-06):** §3.1, §3.3, §3.4 and §3.5 are **SUPERSEDED** by §3 R2 at the end of this
> section (codex B2, B3, B4). §3.2 stands but gains a precedence statement in §3.12 R2; §3.6's rows
> still hold and are re-assigned to round 2 by §8.5 R2.

### 3.1 The abstract domain

```
type Values =
  | { sort: "NUMBERS";      known: readonly number[] }          // exact, ORDERED
  | { sort: "NUMBERS";      subsequenceOf: readonly number[] }  // order-preserving subsequence, length unknown
  | { sort: "NOT_NUMBERS" }                                     // provably not a numeric enumeration
  | { sort: "UNKNOWN" }                                         // nothing known
```

Order is carried explicitly because `slice` selects by POSITION — codex r3 B2's whole finding.
`sort: "NOT_NUMBERS"` is carried explicitly because that, and nothing else, is what makes
LoginFlow negative (§5).

**The verdict:**

| Values | Verdict | Reported? |
|---|---|---|
| `known` whose DISTINCT values are exactly `{1,2,3,4,5}` | `RULED` | yes |
| `known` otherwise | `OTHER` | no |
| `subsequenceOf b` where `{1,2,3,4,5} ⊆ distinct(b)` | `UNDETERMINED` | yes |
| `subsequenceOf b` where `{1,2,3,4,5} ⊄ distinct(b)` | `OTHER` | no |
| `NOT_NUMBERS` | `OTHER` | no |
| `UNKNOWN` | `UNDETERMINED` | yes |

Set equality, not list equality, is the ruled criterion. codex r3 B2 requires
`[0,1,2,3,4,5].reverse().slice(0,-1)` = `[5,4,3,2,1]` to be a DOMAIN, and r3 B1 records that a
terminal `.map(n => n || 1)` yielding `[1,1,2,3,4,5]` "produces the distinct value domain
1..5". Both are set-equality judgements. **STRENGTH: entailed** (both sentences are in the r3
verdict; both values re-evaluated).

### 3.2 Rule 1 first: the literal IS the domain

If a candidate's own element list has distinct values exactly `{1,2,3,4,5}`, the verdict is
`RULED` and the chain is never consulted. This is what the three bare option-domain controls
rest on, it is r3's own rule 1, and it is what stops §5's non-numeric rule from ever deleting
them. Only a DIFFERENT literal reaches §3.3.

### 3.3 Operations, by NAME, in ORDER

| Operation | On `known` | On `subsequenceOf b` | On `NOT_NUMBERS` | On `UNKNOWN` |
|---|---|---|---|---|
| `slice(a?, b?)`, integer literals incl. negatives | real `Array.prototype.slice` | `UNKNOWN` (positions unknown) | `NOT_NUMBERS` | `UNKNOWN` |
| `slice` with any non-integer-literal argument | `UNKNOWN` | `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| `reverse()` | reversed list | `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| `sort()` no argument | sorted by **String(a) < String(b)** — JS default | `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| `sort(cmp)` | `UNKNOWN` | `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| `splice(a?, b?)`, integer literals | the REMOVED elements, per `Array.prototype.splice` | `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| `map(cb)` | per §3.4 | `subsequenceOf` mapped, or `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| `filter(cb)` | §3.4 boolean → exact subsequence; else `subsequenceOf known` | `subsequenceOf b` | `NOT_NUMBERS` | `UNKNOWN` |
| `flatMap(cb)` | §3.4 declared shape → exact; else `UNKNOWN` | `UNKNOWN` | `NOT_NUMBERS` | `UNKNOWN` |
| any other name | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` |

`sort()`'s string ordering is modelled exactly, not approximated: codex r3 B2 supplies
`[0,1,2,3,4,5,10].sort()` and I re-evaluated it to `[0,1,10,2,3,4,5]`.

**Syntactic tolerance, all read from tokens rather than characters:** trailing comma before
`]`; `as const` and `as <Type>`; parentheses around the literal or the chain; computed member
access `["slice"]` (a `[` `StringLiteral` `]` sequence); a chain spread over any number of
lines. None of these change what the declaration defines, which is why r2's
"read one character after the run" rule failed on all of them (codex r2 B1).

### 3.4 The callback mini-evaluator — ONE component, THREE uses

`evalCallback(param, body, value) -> { number } | { boolean } | NOT_A_NUMBER | UNKNOWN`, over a
declared expression grammar: integer literals, the parameter identifier, `+ - * / %`,
comparisons `> >= < <= === !== == !=`, `|| && !`, parentheses, and the conditional `c ? a : b`.
A body that is a JSX element or fragment, a string literal or a template literal is
`NOT_A_NUMBER`. Anything else is `UNKNOWN`. Both `n => e` and `n => { return e; }` forms.

- `map` — evaluate per element. All numbers → `known`. All `NOT_A_NUMBER` → `NOT_NUMBERS`.
  Any `UNKNOWN` → `UNKNOWN`.
- `filter` — evaluate per element as a boolean → exact subsequence. Any `UNKNOWN` →
  `subsequenceOf` the input.
- `flatMap` — declared shapes `[e]`, `[]`, `c ? [e] : []` only → exact list; else `UNKNOWN`.

This is what resolves the one genuine contradiction between the r3 control corpus and codex
r3 B1 — see §9.1.

### 3.5 Wrapping and binding

| Form | Rule |
|---|---|
| `new Set(x)` | dedupe, first-occurrence order. `NOT_NUMBERS` stays `NOT_NUMBERS` |
| `new Map(x)` | `UNKNOWN` (entries, not values) |
| `[...x]` | `x` unchanged |
| `const [a, b, ...rest] = x` | `rest` = `x` after the first `k` elements, `k` = bindings before the rest. Computed, not assumed |
| `const [a, b] = x` | no candidate declaration (nothing is bound to a domain) |

r3's `NARROWS_WITH_A_REST_BINDING` regex reported on ANY rest binding in the statement;
computing the offset instead makes `const [a, ...rest] = [1,2,3,4,5,6];` (`rest` = `[2,3,4,5,6]`)
correctly negative. That is a new control, not a regression.

### 3.6 Acceptance test — §3

Every row is an assertion; the "Actual" column was produced by evaluating the expression on
Node v25.7.0, not by reading it off the verdicts.

**Must be REPORTED** (each `const choices = <expr>;`):

| Expression | Actual | Rule that reports it | Verdict source |
|---|---|---|---|
| `[0,1,2,3,4,5].slice(1)` | `[1,2,3,4,5]` | slice on known | r1 B1 |
| `[1,2,3,4,5,6].slice(0,-1)` | `[1,2,3,4,5]` | slice on known | r1 B1 |
| `const [unused, ...choices] = [0,1,2,3,4,5]` | `[1,2,3,4,5]` | §3.5 rest offset | r1 B1 |
| `[0,1,2,3,4,5,].slice(1)` | `[1,2,3,4,5]` | trailing comma is a token | r2 B1 |
| `[0,1,2,3,4,5].map(n => n).slice(1)` | `[1,2,3,4,5]` | map identity → known | r2 B1 |
| `[0,1,2,3,4,5].map(n => { return n; }).slice(1)` | `[1,2,3,4,5]` | block-body callback | r2 B1 |
| `new Set([0,1,2,3,4,5].map(n => n || 1))` | `[1,2,3,4,5]` | callback numeric + Set dedupe | r2 B1 |
| `[0,1,2,3,4,5]["slice"](1)` | `[1,2,3,4,5]` | computed member | r2 B1 |
| `([0,1,2,3,4,5] as const).slice(1)` | `[1,2,3,4,5]` | assertion skipped | r2 B1 |
| `[0,1,2,3,4,5].filter(n => n > 0)` | `[1,2,3,4,5]` | filter predicate evaluated | **r3 B1** |
| `[0,1,2,3,4,5].flatMap(n => n ? [n] : [])` | `[1,2,3,4,5]` | flatMap declared shape | **r3 B1** |
| `[0,1,2,3,4,5].splice(1)` | `[1,2,3,4,5]` | splice returns removed | **r3 B1** |
| `[1,2,3,4,5,6].filter(n => n < 6)` | `[1,2,3,4,5]` | filter predicate evaluated | **r3 B1** |
| `[0,1,2,3,4,5].map(n => n || 1)` | `[1,1,2,3,4,5]` | distinct set is ruled | **r3 B1** |
| `[0,1,2,3,4,5].reverse().slice(0,-1)` | `[5,4,3,2,1]` | order tracked through reverse | **r3 B2** |
| `[1,2,3,4,5,0].sort().slice(1)` | `[1,2,3,4,5]` | string sort modelled | **r3 B2** |
| `[0,1,2,3,4,5].filter(unknownPredicate)` | — | `subsequenceOf [0..5]` ⊇ ruled | conservatism |

**Must NOT be reported:**

| Expression | Actual | Rule that withholds it | Verdict source |
|---|---|---|---|
| `[0,1,2,3,4,5].reverse()` | `[5,4,3,2,1,0]` | known, set `{0..5}` | r2 B1 |
| `[0,1,2,3,4,5].slice()` | `[0,1,2,3,4,5]` | known | r2 B1 |
| `[0,1,2,3,4,5].slice(0,4)` | `[0,1,2,3]` | known | r2 B1 |
| `[0,1,2,3,4,5].sort()` | `[0,1,2,3,4,5]` | known | r2 B1 |
| `[1,2,3,4,5,6]` bare | `[1,2,3,4,5,6]` | known, six-page list | r2 B1 / packet §4 |
| `[0,1,2,3,4,5]` bare | `[0,1,2,3,4,5]` | known index run | the reported defect |
| `[0,1,2,3,4,5].map(n => n).reverse()` | `[5,4,3,2,1,0]` | known | **r3 B1** |
| `[0,1,2,3,4,5].map(n => n).slice()` | `[0,1,2,3,4,5]` | known | **r3 B1** |
| `[0,1,2,3,4,5].map(n => n).slice(0,0)` | `[]` | known, empty | **r3 B1** |
| `[0,1,2,3,4,5].reverse().slice(1)` | `[4,3,2,1,0]` | order tracked | **r3 B2** |
| `[1,2,3,4,5,0].sort().slice(0,-1)` | `[0,1,2,3,4]` | string sort modelled | **r3 B2** |
| `[0,1,2,3,4,5,10].sort().slice(1,-1)` | `[1,10,2,3,4]` | string sort modelled | **r3 B2** |
| `const [a, ...rest] = [1,2,3,4,5,6];` | `[2,3,4,5,6]` | rest offset computed | new |

**What §3's tests would NOT catch:** a chain whose receiver is not a literal at all
(`const base = [0,1,2,3,4,5]; const choices = base.slice(1);`). That is the pre-existing
cross-statement indirection limit, unchanged by this ticket, and it is declared in §9.

**STRENGTH: entailed** for every "Actual" (evaluated, Node v25.7.0) and for every "Verdict
source" (read from the verdict files). **consistent-with** that the rules above produce those
verdicts — that is what the tests decide.

---


---

## §3 — REVISION 2 (2026-09-06): a total lattice, a purity gate, and an ownership grammar (answers B2, B3, B4)

> **REVISION 3:** §3.8's lattice, §3.10's result table and §3.12's walk are **SUPERSEDED** by §3 R3.
> The table contradicted §3.11's own worked rows (R2-B1); NOT_ARRAY absorbed (R2-B2); the walk
> stopped before unmodelled calls (R2-B3).

**§3.1's `Values`, §3.3's operation table, §3.4's callback rules and §3.5's wrapping rules are
superseded.** Three defects, each reproduced natively before rewriting:

- **B2** — `[0,1,2,3,4,5].map(n => `${n}`).map(n => n * 1).slice(1)` is `[1,2,3,4,5]`. Revision 1
  made the first map `NOT_NUMBERS` and kept that state through everything after, so it withheld
  a ruled domain. My §5 sentence "no operation in the grammar turns non-numbers into numbers"
  was **false**, and numeric coercion is the counterexample.
- **B3** — `[0,1,2,3,4,5].map(n => n === 5 ? 6 : n).filter((n, i, a) => { a[5] = 5; return n > 0; })`
  is `[1,2,3,4,5]`. Revision 1's `subsequenceOf [0,1,2,3,4,6]` withheld it, because the callback's
  third parameter is the receiver and an earlier call mutated a later element.
- **B4** — six ownership cases, all evaluated: `[...[0,1,2,3,4,5],6].slice(1)` → `[1,2,3,4,5,6]`,
  `[0,...[0,1,2,3,4,5]].slice(2)` → `[1,2,3,4,5]`, `Array.from(new Set([0..5].map(n=>n||1))).slice(1)`
  → `[2,3,4,5]`, `[0..5].slice(1,4).concat(4,5)` → `[1,2,3,4,5]`, `const [, ...choices] = [0..5]`
  → `[1,2,3,4,5]`, `const [choices] = [[0..5].slice(1)]` → `[1,2,3,4,5]`.

### 3.8 R2 — the lattice

```
type Cell  = { n: number } | "NONNUMBER" | "UNKNOWN"

type Value =
  | { kind: "EXACT";     cells: readonly Cell[] }   // ordered, length known
  | { kind: "NOT_ARRAY" }                            // provably not an array
  | { kind: "UNKNOWN" }
```

`SUBSEQ` from Revision 1 **is deleted**. It existed to carry an opaque `filter`, and B3 proves an
opaque callback licenses no fact about the pre-call values at all. Every in-grammar pure
callback is evaluated exactly, so nothing needs the state. One fewer state, one fewer defect.

**Element sort is a property of each CELL and is recomputed by every operation.** It is never a
flag on the whole value, which is what made Revision 1 absorb incorrectly.

**Verdict:**

| Value | Verdict | Reported? |
|---|---|---|
| `EXACT`, all cells numeric, distinct set `{1,2,3,4,5}` | `RULED` | yes |
| `EXACT`, all cells numeric, any other distinct set | `OTHER` | no |
| `EXACT`, ≥1 `NONNUMBER` cell, **no** `UNKNOWN` cell | `OTHER` | no |
| `EXACT`, ≥1 `UNKNOWN` cell | `UNDETERMINED` | yes |
| `NOT_ARRAY` | `OTHER` | no |
| `UNKNOWN` | `UNDETERMINED` | yes |

### 3.9 R2 — the purity gate on callbacks (answers B3)

A callback is **eligible for exact evaluation** only if all of:

1. exactly **one** parameter, a plain identifier — this excludes `(n, i, a)`, and so excludes
   receiver access through the callback's third argument, which is B3's counterexample. It does
   not by itself exclude mutation: that comes from conditions 2 and 3 together, which admit no
   assignment, no call and no member access. The exclusion is the conjunction, not clause 1;
2. body is a single expression, or `{ return <expr>; }` and nothing else;
3. the expression is inside the §3.10 grammar — no calls, no assignments, no `await`, no
   `yield`, no member access, no `this`, no template *tagged* forms, no object/array literals
   except the `flatMap` shapes named below;
4. not `async`, not a generator.

**Anything else → `UNKNOWN` for the whole operation result.** Never a subsequence, never a
retained sort. The purity assumptions are stated rather than assumed: the evaluator does not
execute source, it evaluates the syntax tree over the finite known cells, with a node-count and
recursion-depth limit whose exhaustion yields `UNKNOWN`.

**Built-in binding assumption, stated:** the grammar assumes `Array.prototype` methods,
`Object.freeze`, `Array.from`, `Set` and `Map` have their standard behaviour. The corpus is
application source that does not patch them; that is an assumption, not a proof.
**STRENGTH: consistent-with.**

### 3.10 R2 — the callback expression grammar, total over its result space (answers B2)

Grammar: integer and decimal numeric literals, string literals, template literals with
in-grammar substitutions, `true`/`false`/`null`/`undefined`, the parameter identifier,
parenthesisation, unary `- + !`, binary `+ - * / %`, comparisons `< <= > >= === !== == !=`,
logical `&& || ??`, and the conditional `c ? a : b`.

Total result space, per cell — this is what Revision 1 left open:

| Situation | Result cell |
|---|---|
| expression evaluates to a number | `{ n }` |
| expression evaluates to a string, boolean, `null` or `undefined` | `NONNUMBER` |
| an operand cell is `NONNUMBER` and the operator is arithmetic (`+ - * / %`) or a comparison | **`UNKNOWN`** — the concrete string/boolean was discarded upstream, so its coercion is not decidable here. **This is the B2 fix**: the second `map(n => n * 1)` in the coercion chain yields `UNKNOWN`, not `NONNUMBER`, so the chain reports |
| an operand cell is `UNKNOWN` | `UNKNOWN` |
| `&&`, `\|\|`, `??` | the **operand value**, not a boolean — `n \|\| 1` on `{n:0}` is `{n:1}`; on a `NONNUMBER` cell it is `UNKNOWN` |
| `!x`, and any comparison over numeric cells | `NONNUMBER` (a boolean) |
| anything outside the grammar | `UNKNOWN` |

**Truthiness is defined, not assumed** (codex's `filter(n => n)`, native `[1,2,3,4,5]`): for
`{ n }`, falsy iff `n === 0`; for `NONNUMBER` and `UNKNOWN`, the predicate is `UNKNOWN`.

**Per-operation result sort is recomputed, never inherited:**

| Operation | Result |
|---|---|
| `map(cb)` eligible | cells = `cb` per cell, each independently `{n}` / `NONNUMBER` / `UNKNOWN` |
| `map(cb)` ineligible | `UNKNOWN` |
| `filter(cb)` eligible | cells whose predicate is truthy; any `UNKNOWN` predicate → `UNKNOWN` |
| `filter(cb)` ineligible | `UNKNOWN` |
| `flatMap(cb)` eligible, body `[e]` / `[]` / `c ? [e] : []` | concatenation, evaluated |
| `flatMap` otherwise | `UNKNOWN` |
| `slice(a?,b?)` integer literals | `Array.prototype.slice` over cells |
| `slice` other arities/arguments | `UNKNOWN` |
| `splice(a?,b?)` integer literals | the **removed** cells |
| `reverse()` | reversed cells |
| `sort()` no argument | sorted by `String(cell)`; any non-numeric cell → `UNKNOWN` |
| `sort(cmp)` | `UNKNOWN` |
| `concat(...)`, `flat(...)`, `fill(...)`, `with(...)`, `toSorted(...)`, `toReversed(...)` | `UNKNOWN` — modelled as unsupported, so B4's `concat(4,5)` reports |
| `includes`, `indexOf`, `lastIndexOf`, `join`, `some`, `every`, `find`, `findIndex`, `at`, `length`, `forEach`, `reduce` | `NOT_ARRAY` — the declaration binds a boolean/number/string, not a domain. **This is B6's `[502,503,504].includes(error.status)` fix** |
| any other member name | `UNKNOWN` |

`NOT_ARRAY` is a *result-kind* judgement about a named built-in, not a statement about position
or terminality.

### 3.11 R2 — worked check against every counterexample

| Input | Native | Revised path | Verdict |
|---|---|---|---|
| `map(`${n}`).map(n*1).slice(1)` | `[1,2,3,4,5]` | cells → `NONNUMBER`; arithmetic on `NONNUMBER` → `UNKNOWN` | **UNDETERMINED → reported** ✓ |
| `map(n===5?6:n).filter((n,i,a)=>{…})` | `[1,2,3,4,5]` | filter callback has 3 params → ineligible → `UNKNOWN` | **UNDETERMINED → reported** ✓ |
| `filter(n => n)` | `[1,2,3,4,5]` | truthiness defined; `0` falsy | `EXACT [1,2,3,4,5]` → **RULED** ✓ |
| `filter(n => n > 0)` | `[1,2,3,4,5]` | evaluated | **RULED** ✓ |
| `filter(n => n % 2 === 0)` | `[0,2,4]` | evaluated | **OTHER** ✓ — the r3 negative control is **retained, not retired** |
| `[502,503,504].includes(x)` | `true` | `NOT_ARRAY` | **OTHER** ✓ |
| `map(slot => (<span/>))` | JSX array | ineligible body (JSX is outside the grammar) → … see §5 R2 | **OTHER**, by the §5 R2 rule |

### 3.12 R2 — expression ownership and binding (answers B4)

From the candidate node, climb `parent` and apply the FIRST matching rule; the walk records a
**consumed span** so a reviewer can see exactly which syntax the verdict covers.

| Parent shape | Rule |
|---|---|
| `ParenthesizedExpression` | transparent; continue |
| `AsExpression`, `SatisfiesExpression` | transparent; continue. The type is a parser boundary — no identifier skipping |
| `PropertyAccessExpression`/`ElementAccessExpression` (candidate is `.expression`) whose parent is a `CallExpression` | apply §3.10; continue from the call |
| same, **not** followed by a call (`.length`) | §3.10's `NOT_ARRAY` row |
| `NewExpression` `new Set(x)` / `new Map(x)` , candidate is the sole argument | `Set` → dedupe, first-occurrence order; `Map` → `UNKNOWN` |
| `CallExpression` `Array.from(x)` , sole argument | identity over the iterable's ordered cells |
| `CallExpression` `Object.freeze(x)` , sole argument | **identity.** Required: M8 measured **23** of the corpus's 33 candidates behind it; unmodelled, each becomes `UNKNOWN` and reports |
| `SpreadElement` inside an `ArrayLiteralExpression` | the OWNER becomes the **enclosing array**. Its other elements are folded in order: numeric literals and spreads of `EXACT` values compute exactly; any other sibling → `UNKNOWN`. **Kills B4 rows 1 and 2** |
| `ArrayLiteralExpression`, candidate a plain (non-spread) element | the owner is the enclosing array; the candidate is one cell of it, and a cell holding an array is `NONNUMBER` unless a binding extracts it (next row) |
| `VariableDeclaration` with `ArrayBindingPattern` | positions are counted over **all** elements including `OmittedExpression` elisions; `...rest` binds from its own index. **Kills B4 row 5.** A non-rest binding at index *i* binds cell *i* — if that cell is itself an array value, evaluation continues into it. **Kills B4 row 6** |
| `VariableDeclaration` with an identifier, `PropertyAssignment`, `ReturnStatement`, `JsxExpression`, argument position of an unmodelled call | evaluation **stops**; the value as computed is the declaration's value |
| anything else | `UNKNOWN` — the containing use is unsupported, the candidate is **not lost**, and it reports |

**Rule-1 precedence, stated:** if the candidate's own cells are all numeric with distinct set
`{1,2,3,4,5}`, the verdict is `RULED` immediately, before any ownership walk. So
`const [a,b] = [1,2,3,4,5];` reports, which B4 required.

**Acceptance test — §3 R2:** every row of §3.11 and §3.12, plus §3.6's original table
(unchanged rows still hold), each asserting the verdict and, for `EXACT`, the computed cells.
Rest-binding rows are asserted as declarations, not wrapped in another `const` — codex's note on
§3's acceptance.

**What this would NOT catch:** a built-in that has been monkey-patched in the file under scan;
and a coercion that is decidable in principle but which the grammar answers `UNKNOWN` — that
direction reports, so it is visible.

**STRENGTH: entailed** for every native value in §3.11 and §3.12 (evaluated, M10) and for the
23-candidate `Object.freeze` count (M8); **consistent-with** that the rule table produces those
verdicts — the tests decide that.


---

## §3 — REVISION 3 (2026-09-06): a primitive contract, a return-contract split, and a total ownership walk (answers R2-B1, R2-B2, R2-B3)

> **REVISION 4:** §3.13's abstraction table, §3.16's `Cell` and its member-invocation row are
> **SUPERSEDED** by §3 R4 (R3-B1: primitives were erased before the next callback; R3-B2: a member
> used as an ARGUMENT was treated as an invocation).

**§3.8's `Cell`/`Value`, §3.10's result table and §3.12's ownership walk are superseded.** Three
defects, each reproduced (M11) before rewriting:

- **R2-B1** — my own table said a comparison yields `NONNUMBER` and `NONNUMBER` truthiness is
  `UNKNOWN`. Following it, `filter(n => n % 2 === 0)` is `UNKNOWN`, contradicting §3.11's row
  claiming exact cells `[0,2,4]`. **The plan contradicted itself**, and the even-filter control I
  spent a whole round defending was unreachable. Also `[0..5].map(n => n*n/n).filter(n => n)` is
  natively `[1,2,3,4,5]`; "falsy iff `n === 0`" retains `NaN` (M15: `Boolean(NaN)` is `false`).
- **R2-B2** — `reduce`, `find`, `at` and indexing were listed as unconditionally `NOT_ARRAY`. All
  four of codex's suffixes natively return `[1,2,3,4,5]`. That is the Revision-1 absorption bug
  under a new state name; I re-committed it while fixing it.
- **R2-B3** — `((x) => x.slice(1))([0,1,2,3,4,5])` is natively `[1,2,3,4,5]`; my "evaluation stops,
  the value as computed is the declaration's value" row withheld it. An argument value stood in
  for an unknown call result.

### 3.13 R3 — the primitive expression contract

Callback evaluation produces a `Prim`, and only the abstraction step turns a `Prim` into a cell.
Booleans stay booleans until an operator, a conditional or a filter consumes them.

```
type Prim =
  | { t: "num";  v: number }      // v is FINITE — see the non-finite rule
  | { t: "str";  v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" } | { t: "undef" }
  | { t: "jsx" }                  // a JSX element or fragment
  | { t: "unknown" }
```

| Construct | Result |
|---|---|
| numeric literal | `num` with `NumericLiteral.text` as the value (M14: the parser normalises `1_0`→`10`, `0x10`→`16`, `0o10`→`8`, `0b10`→`2`); a unary `+`/`-` prefix is applied by the unary rule below |
| string / template literal (in-grammar substitutions) | `str`, evaluated |
| `true` / `false` | `bool` · `null` → `null` · `undefined` → `undef` |
| JSX element / fragment | `jsx` |
| the parameter identifier | the cell's own `Prim` |
| **any numeric result that is not finite** (`NaN`, `±Infinity`) | **`unknown`** — codex's permitted direction, and it reports |
| binary `+` | both `num` → `num`; either `str` → `str` (concatenation, exact); any `unknown` → `unknown`; any other combination → `unknown` |
| binary `- * / %` | both `num` → exact, then the non-finite rule; anything else → `unknown` |
| comparisons `< <= > >= === !== == !=` | both `num`, or both `str` → **`bool`**, exact. Mixed or `unknown` → `unknown` |
| `!x` | `bool` = `!ToBoolean(x)`; `unknown` in → `unknown` |
| unary `+x` | `num` → itself; `str` → `Number(v)` then the non-finite rule; `bool` → 0/1; `null` → 0; `undef` → `unknown` (`NaN`); `jsx`/`unknown` → `unknown` |
| unary `-x` | as `+x`, negated |
| `a && b`, `a \|\| b` | `ToBoolean(a)`; `unknown` → `unknown`; otherwise the **operand** `Prim`, not a boolean |
| `a ?? b` | `a` unless `null`/`undef`, then `b`; `unknown` → `unknown` |
| `c ? a : b` | `ToBoolean(c)`; `unknown` → `unknown`; otherwise evaluate **only the taken branch** |
| anything outside this grammar | `unknown` |

**`ToBoolean`**: `num` → `v !== 0`, so **signed zero is falsy** (`-0 !== 0` is `false`; M15 confirms
`Boolean(-0)` is `false`); `NaN` never reaches this rule because the non-finite rule turned it into
`unknown`, which is the answer codex permitted;
`str` → `v.length > 0`; `bool` → `v`; `null`/`undef` → `false`; `jsx` → `true`;
`unknown` → **unknown**, which propagates.

**Work limits:** a node budget and a recursion depth per callback invocation. Exhaustion yields
`unknown` for that cell. Stated because codex asked for "conservative exhaustion"; the numbers are
the worker's to pick and to record in the module.

**Abstraction into cells** — the one place `Prim` becomes a cell:

| `Prim` | Cell |
|---|---|
| `num` | `{ n: v }` |
| `str`, `bool`, `null`, `undef`, `jsx` | `NONNUMBER` |
| `unknown` | `UNKNOWN` |

**Recheck of the §3.8 R2 sentence "every in-grammar pure callback is evaluated exactly":**
false as written, and **retracted**. Correct statement: *every callback admitted by the purity gate
is evaluated over the grammar above, and any construct or value it cannot decide yields `unknown`
for that cell, which reports.* Admission is not exactness.

### 3.14 R3 — worked check, R2-B1's inputs

| Input | Native | Path | Verdict |
|---|---|---|---|
| `filter(n => n % 2 === 0)` | `[0,2,4]` | `n % 2` → `num`; `=== 0` → `bool`; ToBoolean exact | cells `[0,2,4]` → **OTHER** ✓ |
| `filter(n => n > 0)` | `[1,2,3,4,5]` | comparison → `bool`, exact | **RULED** ✓ |
| `filter(n => n)` | `[1,2,3,4,5]` | ToBoolean(`num`), `0` falsy | **RULED** ✓ |
| `map(n => n*n/n)` then `.filter(n => n)` | `[1,2,3,4,5]` | cell 0 is `0*0/0` = `NaN` → non-finite → `unknown` → predicate `unknown` → filter `UNKNOWN` | **UNDETERMINED → reported** ✓ |
| ``map(n => `${n}`).map(n => +n).slice(1)`` | `[1,2,3,4,5]` | `str` cells; unary `+` on `str` → exact `num`; slice exact | **RULED → reported** ✓ |
| ``map(n => `${n}`).map(n => n * 1).slice(1)`` | `[1,2,3,4,5]` | `*` with a `str` operand → `unknown` | **UNDETERMINED → reported** ✓ |
| `map(n => n === 0)` | booleans | comparison → `bool` → `NONNUMBER` cells | **OTHER** |

The unary and binary coercion cases now differ — exact for `+x`, conservative for `x * 1` — and
both directions are correct, because one is decidable over a known `str` and the other is a
deliberate declared bound. Both are controls.

### 3.15 R3 — operations, split by actual return contract (answers R2-B2)

`NOT_ARRAY` is retained only where the return type is fixed regardless of element contents.

| Method | Returns | Rule |
|---|---|---|
| `includes`, `some`, `every` | boolean | `NOT_ARRAY` |
| `indexOf`, `lastIndexOf`, `findIndex`, `length` (property) | number | `NOT_ARRAY` |
| `join` | string | `NOT_ARRAY` |
| `forEach` | undefined | `NOT_ARRAY` |
| `find`, `findLast`, `at`, `pop`, `shift`, and numeric index access `x[0]` | **an element** | `NOT_ARRAY` **only if every cell is a known number**; if any cell is `NONNUMBER` or `UNKNOWN` → **`UNKNOWN`**, because an element may itself be an array |
| `reduce`, `reduceRight` | the accumulator — anything | **`UNKNOWN`**, always |
| `slice`, `splice`, `reverse`, `sort`, `map`, `filter`, `flatMap` | array | as §3.10 R2, with the arities below |
| `concat`, `flat`, `fill`, `with`, `toSorted`, `toReversed`, `copyWithin` | array | `UNKNOWN` (declared unsupported) |
| non-call member access other than `length` — a named property or a computed index | anything | **`UNKNOWN`**, never `NOT_ARRAY` |
| any other name | — | `UNKNOWN` |

**Continuation over `NOT_ARRAY` and `UNKNOWN`** — codex's "known non-array does not mean a later
wrapper cannot produce an array":

- a chain that **ends** at `NOT_ARRAY` → `OTHER` (the declaration binds a scalar);
- **any** further operation, member access or wrapper applied to a `NOT_ARRAY` value → `UNKNOWN`
  (`new Set(someString)` is an array of characters; `String.prototype` methods are not modelled);
- any operation over `UNKNOWN` → `UNKNOWN`.

**Arities.** Each modelled method declares its accepted argument shape: `slice(0..2 integer
literals)`, `splice(0..2 integer literals)`, `reverse()`, `sort()` — zero arguments,
`map`/`filter`/`flatMap`(exactly one eligible callback). **Any other argument count, a spread
argument, or a second argument to `map`/`filter` → `UNKNOWN`.**

**Worked check, R2-B2's inputs** (all native `[1,2,3,4,5]`, M11): `reduce(…)` → `UNKNOWN` → reports
✓; `map(n => [n+1,…]).find(() => true)` → the map's callback body is an array literal, outside the
grammar → cells `UNKNOWN` → `find` sees a non-numeric cell → `UNKNOWN` → reports ✓; `.at(0)` and
`[0]` likewise ✓.

### 3.16 R3 — ownership, made total (answers R2-B3)

**`Value` gains a collection kind and cells gain a nested payload:**

```
type Cell  = { n: number } | "NONNUMBER" | "UNKNOWN" | { arr: Value }
type Value =
  | { kind: "EXACT"; coll: "array" | "set"; cells: readonly Cell[] }
  | { kind: "NOT_ARRAY" } | { kind: "UNKNOWN" }
```

`{ arr }` is what `const [choices] = [[0,1,2,3,4,5].slice(1)];` needs and what Revision 2 could not
represent. `coll` distinguishes a `Set` from an array: array methods over `coll: "set"` → `UNKNOWN`;
`has`/`size` → `NOT_ARRAY`; spread and `Array.from` convert back to `coll: "array"`.
A `{ arr }` cell is `NONNUMBER` for the purpose of the numeric verdict, and is only opened by a
binding or by an element-returning operation.

**The walk**, from the candidate node, first match wins, each row advancing a **consumed span**
`(start,end)` reported with the verdict:

| Parent | Rule | Span |
|---|---|---|
| `ParenthesizedExpression`, `AsExpression`, `SatisfiesExpression` | transparent | extend |
| `BinaryExpression` with `CommaToken` | candidate is the RIGHT operand → transparent; candidate is the LEFT operand → its value is discarded → `OTHER` | extend |
| `PropertyAccess`/`ElementAccess` where the candidate is the receiver, parent is a `CallExpression` | §3.15, with arity check | extend through the call |
| same, not followed by a call | §3.15's `length`/other-member rows | extend |
| `NewExpression` `new Set(x)` / `new Map(x)`, sole argument | `Set` → dedupe, `coll:"set"`; `Map` → `UNKNOWN` | extend |
| `CallExpression` `Array.from(x)` / `Object.freeze(x)`, sole argument | `Array.from` → `coll:"array"`; `Object.freeze` → identity | extend |
| `SpreadElement` in an `ArrayLiteralExpression` | owner becomes the enclosing array; siblings folded in order; a sibling that is not a numeric literal or an `EXACT` spread → `UNKNOWN` | extend to the enclosing array |
| `ArrayLiteralExpression`, candidate a plain element | the candidate becomes an `{ arr }` cell of the enclosing array | extend |
| `VariableDeclaration` with `ArrayBindingPattern` | positions counted over ALL elements including `OmittedExpression`; `...rest` binds from its index; a non-rest binding binds that cell, opening `{ arr }` | extend to the declaration |
| `VariableDeclaration` with an identifier, `PropertyAssignment`, `ReturnStatement`, `JsxExpression` | evaluation **stops**; the computed value is the bound value | extend |
| **any other `CallExpression` where the candidate is an ARGUMENT** | **`UNKNOWN`** — the call result is not the argument. Span advances to the whole rejected call | extend to the call |
| anything else | `UNKNOWN` | extend to the rejected parent |

**Multiple bound outputs, one candidate, one verdict.** `const [a, ...rest] = <candidate>` binds
two names from one occurrence. Rule: `RULED` if ANY bound output's value is the ruled domain;
otherwise `UNDETERMINED` if any is `UNKNOWN`; otherwise `OTHER`. Stated because codex asked, and
because leaving it implicit invites two sites for one occurrence.

**Rule-1 precedence is unchanged and checked first**, before the walk.

**Worked check, the seven ownership cases** (natives from M10/M11):

| Input | Native | Verdict | Span ends at |
|---|---|---|---|
| `[...[0,1,2,3,4,5],6].slice(1)` | `[1,2,3,4,5,6]` | **OTHER** (siblings folded) | the `.slice(1)` call |
| `[0,...[0,1,2,3,4,5]].slice(2)` | `[1,2,3,4,5]` | **RULED** | the `.slice(2)` call |
| `Array.from(new Set([0..5].map(n=>n\|\|1))).slice(1)` | `[2,3,4,5]` | **OTHER** | the `.slice(1)` call |
| `[0..5].slice(1,4).concat(4,5)` | `[1,2,3,4,5]` | **UNDETERMINED** (concat unsupported) | the `.concat` call |
| `const [, ...choices] = [0..5];` | `[1,2,3,4,5]` | **RULED** | the declaration |
| `const [choices] = [[0..5].slice(1)];` | `[1,2,3,4,5]` | **RULED** (`{arr}` opened by the binding) | the declaration |
| `((x) => x.slice(1))([0..5])` | `[1,2,3,4,5]` | **UNDETERMINED** (unmodelled call) | the whole call expression |

**What §3 R3 would NOT catch:** a monkey-patched built-in in the file under scan; a coercion the
grammar answers `unknown` though it is decidable in principle — that direction reports.

**STRENGTH: entailed** for every native value (M10, M11) and for the parser facts (M13, M14);
**consistent-with** that the tables above produce the listed verdicts — the round-2 assertions
decide that, and R2-B1 is the standing proof that a table of mine can contradict its own worked rows.


---

## §3 — REVISION 4 (2026-09-06): cells keep their primitive, and a member must be the callee (items 1 and 2)

**§3.13's abstraction table, §3.16's `Cell` and §3.16's member-invocation row are superseded.**

### 3.17 R4 — cells ARE primitives (item 1, R3-B1)

The Revision-3 defect: a `str` result was abstracted to a payload-free `NONNUMBER` cell, so the
next callback's parameter had nothing to read. My own worked row — "`str` cells; unary `+` on `str`
→ exact `num`" — could not follow from my own types. And M16 proves the same loss makes exact `Set`
dedupe impossible: codex's two sentinel expressions have **identical** Revision-3 cell lists and
different native results, `[2,3,4,5]` and `[1,2,3,4,5]`.

**Storage and classification are now separate things.**

**Numeric literals are finite or they are unknown.** §6.4's eligibility accepted any
`Number(NumericLiteral.text)`; a literal such as `1e400` evaluates to `Infinity`, which would put a
non-finite value into a `num` cell and break the guarantee below. Corrected: **a numeric literal
whose value is not finite yields `{t:"unknown"}`**, so a `num` cell is finite whatever its origin —
literal, callback result, or permutation.

```ts
type Cell =
  | { t: "num";  v: number }        // FINITE — from the literal rule above and the non-finite rule
  | { t: "str";  v: string }
  | { t: "bool"; v: boolean }
  | { t: "null" } | { t: "undef" }
  | { t: "jsx" }                    // no value identity available
  | { t: "arr";  value: Value }     // a nested array, payload retained
  | { t: "unknown" }
```

**`Cell → Prim` is total and is the identity on the six primitive constructors.** A callback's
parameter receives its cell's own `Prim`: `num`/`str`/`bool`/`null`/`undef`/`unknown` pass through
unchanged, `jsx` passes through as `jsx`, and `{t:"arr"}` lifts to `{t:"unknown"}` (an array
parameter is outside §3.13's expression grammar in any case). `Prim → Cell` is the identity on the
same constructors. **There is no lossy abstraction step any more, so there is nothing to invent and
nothing to re-derive.**

**Numeric classification is a function OVER cells, never a stored state:**

```
numericVerdict(cells) =
  any cell is {t:"unknown"}                     → UNDETERMINED
  every cell is {t:"num"} and distinct set = {1,2,3,4,5} → RULED
  every cell is {t:"num"}                        → OTHER
  otherwise (a non-numeric cell, none unknown)   → OTHER
```

`{t:"jsx"}` and `{t:"arr"}` are non-numeric, so LoginFlow's verdict is unchanged and still derived
from the callback's value sort — §5.2 R2 is untouched by this repair.

**`new Set(x)` — equality, and where it is unavailable.** Dedupe uses **SameValueZero**, so `+0` and
`-0` are one element and `NaN` never arises (the non-finite rule turned it into `unknown`). It is
decidable when **every** cell is `num`, `str`, `bool`, `null` or `undef`. **If any cell is `jsx`,
`arr` or `unknown`, `new Set(...)` yields `UNKNOWN`** — object identity is not available to this
abstraction, and codex's alternative of guessing is what produces either a silent miss or a false
positive.

**Executed against its own rule** (each row replayed through §3.13 + §3.17 R4 before filing):

| Input | Native | Cells before `Set` | Result | Verdict |
|---|---|---|---|---|
| `[...new Set([0,6,1,2,3,4,5].map(n => n===0?"a":n===6?"a":n))].slice(2)` | `[2,3,4,5]` | `str"a", str"a", 1,2,3,4,5` | dedupe → `str"a",1,2,3,4,5`; `.slice(2)` → `2,3,4,5` | **OTHER** ✓ |
| `[...new Set([0,6,1,2,3,4,5].map(n => n===0?"a":n===6?"b":n))].slice(2)` | `[1,2,3,4,5]` | `str"a", str"b", 1,2,3,4,5` | dedupe keeps both; `.slice(2)` → `1,2,3,4,5` | **RULED** ✓ |
| ``[0..5].map(n => `${n}`).map(n => +n).slice(1)`` | `[1,2,3,4,5]` | `str"0".."5"` | unary `+` reads `v` → exact `num`; `.slice(1)` | **RULED** ✓ |
| ``[0..5].map(n => `${n}`).map(n => n * 1).slice(1)`` | `[1,2,3,4,5]` | `str` | `*` with a `str` operand → `unknown` | **UNDETERMINED → reports** ✓ |
| `[0..5].map(slot => (<span/>))` | JSX | `jsx ×6` | non-numeric, none unknown | **OTHER** ✓ |
| `new Set([0..5].map(n => n \|\| 1))` | `[1,2,3,4,5]` | `num` only | dedupe decidable | **RULED** ✓ |

The unary chain is now exact because the string is still there to read; the binary chain stays
conservative because JS's `"0" * 1` coercion is deliberately not modelled. Both directions are
controls (K6, K6b in §6 R4).

### 3.18 R4 — a modelled member invocation requires the member to be the CALLEE (item 2, R3-B2)

The Revision-3 member row asked only that the candidate be the receiver and the member's parent be
a `CallExpression`. M17 shows that is not invocation:
`((method) => Array.from({length: 5}, (_, i) => i + 1))([0,1,2,3,4,5].includes)` parses cleanly; the
array is at `(71,84)`; its parent is the `PropertyAccessExpression` `…​.includes` at `(71,93)`; the
grandparent is a `CallExpression` at `(16,94)` — and `call.expression === member` is **false**,
because the member is an **argument**. `includes` is never invoked; the native value is
`[1,2,3,4,5]`.

**Replacement row.** A modelled member invocation requires ALL of:

1. `member.expression === currentOwner` — the candidate is the receiver;
2. `member.parent` is a `CallExpression` — call it `call`;
3. **`call.expression === member`** — the member is the CALLEE;
4. the method name is modelled, and the arguments match its declared arity (§3.15 R3).

Applies identically to `PropertyAccessExpression` and to computed `ElementAccessExpression`. If (3)
fails, the member is not an invocation: the walk falls through to the **unknown enclosing call**
row — `UNKNOWN`, with the consumed span advanced to the whole rejected call. Neither the member's
spelling nor its grandparent's kind proves invocation.

**Executed against its own rule:** the fixture above yields **one candidate**, verdict
**UNDETERMINED**, consumed span **(16,94)**, and therefore **one `DOMAIN_ENUMERATION` site**. Its
computed twin `[0,1,2,3,4,5]["includes"]` takes the same path. Pinned by mutation **K45** (§6 R4).

**STRENGTH: entailed** for M16, M17 and every native value above; **consistent-with** that the
replacement rules produce the listed verdicts — each row above was replayed by hand through the
rules before filing, which is the check whose absence produced R2-B1 and R3-B1.

## 4. The ruled domain

> **REVISION 2 (2026-09-06):** this section stands; §4 R2 at the end of it adds the control that makes
> rule 1 discriminable (codex B8).

A declaration DEFINES the ruled domain when its computed distinct value set is exactly
`{1,2,3,4,5}` — wherever it sits, however it is wrapped, whatever is done to it afterwards
when the literal itself already spells it (§3.2). `[1,2,3,4,5,6]` bare is NOT one: it is a
six-page list. `[1,2,3,4,5,6].slice(0,-1)` IS one.

**Acceptance test — §4:** the three bare option-domain controls from 60641339 kept verbatim
(`{[1, 2, 3, 4, 5].map((value) => value)}`, `const allowed = new Set([1, 2, 3, 4, 5]);`, and
the multiline `const allowed = [\n 1,\n 2,\n 3,\n 4,\n 5\n ];`), plus the r3 "equivalent
layouts" group `the ruled domain written bare` (5 layouts, all `true`) and
`a bare six-page list left as 1..6` (3 layouts, all `false`), unchanged.

**STRENGTH: entailed** (controls read from the blob at 60641339, lines 818–828, 978–1000,
1026–1035, 1068–1126).

---


---

## §4 — REVISION 2 (2026-09-06): rule 1 needs its own discriminator (answers B8's m4 point)

§4's controls stand. What does not stand is the claim that they exercise **rule 1**. codex is
right: with the Revision-2 exact evaluator in place, `[1,2,3,4,5].map(v => v)`,
`new Set([1,2,3,4,5])` and the bare multiline literal are all recognised as `RULED` by ordinary
evaluation, so deleting rule 1 leaves them green and m4 is equivalent.

**Added control, which only rule 1 can satisfy:**

```
it("reports a literal that spells the ruled domain even when the chain destroys it", () => {
  expect(duplicateBoundSites("const choices = [1, 2, 3, 4, 5].map(n => 0);")
    .map((s) => s.kind)).toEqual(["DOMAIN_ENUMERATION"]);
});
```

`[1,2,3,4,5].map(n => 0)` evaluates to `[0,0,0,0,0]` (M10). Ordinary evaluation therefore says
`OTHER`; only rule 1's precedence reports it. This is the discriminator for mutant m4 in
§6 R2's matrix.

**Corpus note:** M9 measured that **no** shipped candidate has distinct set `{1,2,3,4,5}`, so
rule 1 fires nowhere in shipped code today. It is exercised only by controls — which is exactly
why it needs one that discriminates.

**STRENGTH: entailed** (value evaluated; census measured).

## 5. dev's LoginFlow six login slots — a MODELLED case

> **REVISION 2 (2026-09-06):** the soundness sentence ("no operation in the grammar turns non-numbers
> into numbers") is **RETRACTED**, and the five inherited "real LoginFlow" controls are **SUPERSEDED**
> — they contain no callback body. See §5 R2 at the end of this section (codex B2, B7).

`apps/ui/components/LoginFlow.tsx:252` — `{[0, 1, 2, 3, 4, 5].map((slot) => (<span … />))}`,
six boxes for a six-digit code, in a file with no depth token.

**The rule that makes it negative, exactly:**

1. Its literal is `[0,1,2,3,4,5]`; distinct set `{0,1,2,3,4,5}` ≠ `{1,2,3,4,5}`, so §3.2 does
   not fire and the chain is evaluated.
2. The single operation is `map` with the callback `(slot) => (<span … />)`. Its body is a
   parenthesised JSX element, so `evalCallback` returns `NOT_A_NUMBER` for every element
   (§3.4).
3. `map` with an all-`NOT_A_NUMBER` callback yields `{ sort: "NOT_NUMBERS" }` (§3.3).
4. No operation follows. `NOT_NUMBERS` → `OTHER` → not reported (§3.1).

The rule is "an array whose elements are provably not numbers is not an enumeration of a
numeric domain". It is sound because no operation in the grammar turns non-numbers into
numbers, and any unmodelled operation lands in `UNKNOWN`, which REPORTS. It names no file, no
path and no shape exemption; it inspects the callback's value sort. **Position is nowhere in
it** — which is the whole difference from r3, whose rule was "unknown AND terminal".

**The same rule keeps `new Set([0,1,2,3,4,5].map(n => n || 1))` positive:** the callback body
`n || 1` is inside the declared expression grammar, so `evalCallback` returns a NUMBER per
element (`0→1`, `1→1`, `2→2`, `3→3`, `4→4`, `5→5`); `map` therefore yields
`known = [1,1,2,3,4,5]`; `new Set` dedupes to `[1,2,3,4,5]`; distinct set is the ruled domain;
`RULED`; reported. The two cases are separated by ONE query — what sort of value does the
callback produce — evaluated by the same component, in both directions. I re-evaluated both:
`[0,1,2,3,4,5].map(n => n || 1)` is `[1,1,2,3,4,5]` and `[...new Set(...)]` is `[1,2,3,4,5]`.

**Acceptance test — §5:**

```
it("keeps the owning declaration as the only depth-bound site in shipped code", () => {
  expect(depthBoundSitesInShippedCode()).toEqual([
    "packages/contract/src/index.ts:112 [DEPTH_BOUND_LITERAL] export const EXPANSION_DEPTH_MAX = 5;"
  ]);
});

it.each([
  { pair: "JSX callback",     planted: "const slots   = [0, 1, 2, 3, 4, 5].map((slot) => (<span key={slot} />));", reported: false },
  { pair: "numeric callback", planted: "const choices = new Set([0, 1, 2, 3, 4, 5].map(n => n || 1));",            reported: true  },
  { pair: "string callback",  planted: 'const labels  = [0, 1, 2, 3, 4, 5].map((n) => `slot ${n}`);',              reported: false },
  { pair: "unknown callback", planted: "const values  = [0, 1, 2, 3, 4, 5].map((n) => lookup(n));",                reported: true  }
])("decides a map by what its callback yields, not by its position — $pair", ({ planted, reported }) => {
  expect(duplicateBoundSites(planted).some((s) => s.kind === "DOMAIN_ENUMERATION")).toBe(reported);
});
```

plus the five real-LoginFlow layouts from 60641339 (lines 1047–1051: plain, wrapped, block
comment, commented AND wrapped, line comment), all negative.

**What this would NOT catch:** a callback that returns a number written in a form outside the
declared expression grammar — it lands in `UNKNOWN` and REPORTS, which is a false positive,
not a miss.

**STRENGTH: entailed** for the LoginFlow source text (read at 60641339) and for both evaluated
values. **consistent-with** that step 2 classifies `(<span … />)` as JSX: it depends on the
token stream of a `.tsx` file, which §1's corpus assertion is what establishes.

---


---

## §5 — REVISION 2 (2026-09-06): the truncated fixtures, and the universal I got wrong (answers B7, B2)

> **REVISION 3:** §5.3's second item — the truncated prefixes asserting a DOMAIN site — is
> **SUPERSEDED** by §5 R3. All five carry a parse diagnostic; they assert INCONCLUSIVE.

### 5.1 R2 — retraction

Revision 1's §5 asserted: *"It is sound because no operation in the grammar turns non-numbers
into numbers."* **That sentence is retracted.** B2's coercion chain
`[0,1,2,3,4,5].map(n => `${n}`).map(n => n * 1).slice(1)` evaluates to `[1,2,3,4,5]` (M10), and
both steps were inside my declared grammar. The replacement rule is §3.10 R2's: a `NONNUMBER`
cell entering an arithmetic operator yields `UNKNOWN`, which reports. LoginFlow stays negative
for a narrower and correct reason, below.

### 5.2 R2 — the rule that makes LoginFlow negative, restated

1. Candidate `[0,1,2,3,4,5]`; distinct set `{0,…,5}` ≠ `{1,…,5}`, so rule 1 does not fire.
2. One operation, `map`, with callback `(slot) => (<span … />)`. The body is a JSX element,
   outside §3.10's grammar, so the callback is **ineligible** and — under §3.10 R2's table —
   `map` with an ineligible callback yields **`UNKNOWN`**, which REPORTS.
3. Therefore an extra rule is required, and it is narrow: **a callback whose body is
   syntactically a JSX element or JSX fragment yields `NONNUMBER` for every cell.** A JSX
   element is never a number; this is a syntactic judgement about the body's node kind, not an
   evaluation.
4. `map` then yields `EXACT` with all cells `NONNUMBER` and none `UNKNOWN` → `OTHER` → withheld.
5. Because sort is recomputed per operation (§3.8 R2), a subsequent `map(n => n * 1)` over
   those cells would be `UNKNOWN` and report — so this rule cannot absorb the way Revision 1's
   `NOT_NUMBERS` did. That is the B2 fix and the LoginFlow rule living together.

The same rule extended, and no further: a body that is a **string literal or template literal**
also yields `NONNUMBER` cells. Anything else ineligible stays `UNKNOWN`.

**The proof that `new Set([0..5].map(n => n || 1))` stays positive** is unchanged and still
holds: `n || 1` is in-grammar, `||` returns the operand value, cells are `[1,1,2,3,4,5]`, `Set`
dedupes to `[1,2,3,4,5]`, distinct set is ruled, `RULED`, reported.

### 5.3 R2 — the truncated LoginFlow fixtures (answers B7)

codex is right and this is the finding I am least comfortable with, because I carried the
fixtures forward as a "floor" without reading what they contain. The five r3 controls at oracle
lines 1047–1052 and the first four entries of the `an index run left whole` layout group all end
at:

```
                  {[0, 1, 2, 3, 4, 5].map((slot) => (
```

There is **no callback body in the fixture**. Under §5.2 R2 the body is what decides, so these
inputs are unsupported, and the honest verdict for them is `UNKNOWN` → **report**. Keeping them
as negatives would carry forward an exemption nothing proves.

**Declared floor adaptation** — the packet's "the 27 layout classes are the floor" is adapted
here, deliberately and visibly:

1. **Completed fixtures.** Each of the five layouts, and the four group entries, is completed
   with LoginFlow's real callback body from lines 252–261 —
   `<span className="authCodeBox" key={slot} data-filled={…} data-next={…}>{code[slot] ?? ""}</span>))}`
   — preserving each variant's own wrapping and comment placement. These stay **negative**, and
   now for a reason the fixture actually contains.
2. **Separate truncated controls.** The five original prefixes are kept, as their own block,
   asserting they **report**:

```
it.each(TRUNCATED_LOGINFLOW_PREFIXES)("reports a truncated declaration whose callback body is absent — $layout",
  ({ planted }) => {
    expect(duplicateBoundSites(planted).some((s) => s.kind === "DOMAIN_ENUMERATION")).toBe(true);
  });
```

   This converts an unproved exemption into a proved conservative behaviour, and it pins the
   direction: an oracle that cannot see the body must not withhold.
3. **The shipped file is the real gate.** `depthBoundSitesInShippedCode()` reads
   `apps/ui/components/LoginFlow.tsx` whole, so the complete callback is exercised against the
   actual bytes regardless of any planted fixture.

**Acceptance test — §5 R2:** §5's four callback pairs (unchanged), the nine completed layouts
(negative), the five truncated prefixes (positive), and the shipped-sites assertion.

**STRENGTH: entailed** for the fixture bytes (read at 60641339, lines 1047–1052 and 1068–1080)
and for the LoginFlow callback body (read at 60641339, lines 252–261).


---

## §5 — REVISION 3 (2026-09-06): truncated fixtures assert INCONCLUSIVE (answers R2-B4)

> **REVISION 4:** §5.4's inventory is **SUPERSEDED** by §5 R4 — 27 ceiling + 3 bare DOMAIN, with
> the two standalone negatives at oracle 952 and 956 that Revision 3 omitted.

**§5.3 R3 supersedes §5.3 R2's second item.** I asserted that the five truncated LoginFlow
prefixes must **report a DOMAIN site**. They cannot: M12 measures a parse diagnostic on all five,
so §1.10 R3's failure policy produces exactly one `INCONCLUSIVE` for each. Two public outcomes for
one input; calling the input "UNKNOWN" reconciled nothing. codex is right.

**Corrected disposition, three blocks:**

1. **The nine completed layouts** — the five "real LoginFlow" controls and the four group entries,
   each completed with the real callback body from `LoginFlow.tsx:252–261` and keeping its own
   wrapping and comment placement. These parse, and they assert **no DOMAIN site**.
2. **The five truncated prefixes**, kept verbatim as their own block, asserting the failure record
   exactly — not a DOMAIN site, and not emptiness:

```ts
it.each(TRUNCATED_LOGINFLOW_PREFIXES)("returns one INCONCLUSIVE for a deliberately truncated fixture — $layout",
  ({ planted }) => {
    const sites = domainSites("planted.tsx", planted);
    expect(sites.map((s) => s.kind)).toEqual(["INCONCLUSIVE"]);
    expect(sites[0]).toMatchObject({ path: "planted.tsx" });
    expect(typeof sites[0]?.line).toBe("number");
    expect(sites[0]?.diagnostic.length).toBeGreaterThan(0);
  });
```

3. **The whole shipped file** remains the real gate: `duplicateBoundSites` over the actual bytes of
   `apps/ui/components/LoginFlow.tsx`, which parses (M6) and contains the complete callback.

### 5.4 R3 — the full floor-adaptation inventory

Enumerated here, as codex required, so no adaptation is discovered during implementation:

| Carried control block | Count | Adaptation |
|---|---:|---|
| ceiling spellings, layouts, wrapped conjuncts, unrelated-ceiling negatives, exclusive-six layouts, unrelated-depth negatives, depth-in-reach, "narrows r3 in exactly one place" | 6 + 3 + 3 + 2 + 3 + 5 + 2 + 1 = **25** | **assert on `ceilingSites`** (§1.9 R3). Text unchanged, expected values unchanged. Positive ones assert `["DEPTH_BOUND_LITERAL"]`, not non-emptiness |
| "real LoginFlow" layouts + the `index run left whole` group's first four entries | 9 | **completed** with the real callback body; still negative |
| the same five prefixes, kept truncated | 5 | **new block**, assert exactly one `INCONCLUSIVE` |
| the 3 bare option-domain controls (moved out of the two ceiling blocks — §1.9 R3), derivation positives, other-domain negatives, layout-agreement groups | 3 + 9 + 7 + 4 | assert on `domainSites` / `duplicateBoundSites`; all are valid source and parse. The 3 + 25 above account for all 28 carried entries with no double count |
| `A8` comma-expression negatives | 2 | **no adaptation** — §3.16 R3's comma row keeps them negative |

**STRENGTH: entailed** for M12's five diagnostics and for each block's membership (counted from the
oracle at 60641339); **consistent-with** that the completed nine parse — they are completed from
source that does parse (M6), and round 3 asserts it.


---

## §5 — REVISION 4 (2026-09-06): 27 ceiling + 3 bare DOMAIN, both standalone negatives included (item 4)

**§5.4 R3's inventory is superseded.** My Revision-3 correction fixed the 8/4 double count and then
undercounted the standalone tests: I folded `narrows r3 in exactly one place` in as one and missed
two more. M19 locates them at oracle **952** and **956**:

- `does not pair a six with a depth in another conjunct of the same condition` — its fragment ends
  with an unmatched `{`, so it must go to `ceilingSites`;
- `does not manufacture a site when the negative control is collapsed onto one line` — separate
  from the `narrows r3` paired assertion that follows it.

### 5.5 R4 — the corrected inventory

**Ceiling controls: 27** — `6 + 3 + 3 + 2 + 3 + 1 + 1 + 1 + 5 + 2`

| Group | Count | Harness |
|---|---:|---|
| "written as" spellings, minus the 2 bare DOMAIN ones | 6 | `ceilingSites` |
| "laid out as" layouts, minus the 1 bare DOMAIN one | 3 | `ceilingSites` |
| wrapped conjuncts | 3 | `ceilingSites` |
| unrelated-ceiling negatives | 2 | `ceilingSites` |
| exclusive-six layouts | 3 | `ceilingSites` |
| **oracle:952** `does not pair a six with a depth in another conjunct` | **1** | `ceilingSites` |
| **oracle:956** `does not manufacture a site when the negative control is collapsed onto one line` | **1** | `ceilingSites` |
| `narrows r3 in exactly one place` — **both halves**, the `kindOf` assertion preserved | 1 | `ceilingSites` + `kindOf` |
| unrelated-depth negatives | 5 | `ceilingSites` |
| depth-in-reach controls | 2 | `ceilingSites` |

**Bare DOMAIN controls: 3** — `{[1, 2, 3, 4, 5].map((value) => value)}`,
`const allowed = new Set([1, 2, 3, 4, 5]);`, and the multiline `const allowed = [\n 1,…5\n ];`.

**27 + 3 = 30.** The remaining instances in the selected describe are 9 derivation positives,
7 other-domain negatives, 13 index-run layouts, 4 layout-group tests, 2 shipped assertions and
1 exported-source check: **66 total**, matching codex's static count.

### 5.6 R4 — where the three bare DOMAIN controls live, by round

They are **not** ceiling controls and cannot pass a `DEPTH_BOUND_LITERAL` assertion: extracting the
current oracle and removing only the two `WHOLE_DOMAIN` fallbacks returns `[]` for all three.

| Round | The three bare DOMAIN controls |
|---|---|
| 1 | remain on the **old emitter**, asserting `duplicateBoundSites(...)` yields a `DOMAIN_ENUMERATION` exactly as today. May additionally carry candidate-only assertions (`candidatesOf` finds one candidate with the ruled distinct set) |
| 2 | unchanged on the old emitter; their `evaluatedCandidatesOf` verdict is asserted as `RULED` (rule 1, so GREEN under the round-2 stub — §1.14 R4) |
| 3 | routed to the new emitter: `domainSites` yields one `DOMAIN_ENUMERATION` each |

The `WHOLE_DOMAIN` fallback is removed in **round 3**, in the same step that routes them — not in
round 1. Revision 3 placed the removal in round 2, which would have left them failing for a round.

**STRENGTH: entailed** for M19's two omitted tests, the 27/3/66 counts, and the extracted-oracle
result for the three controls (codex measured it; the counts I recounted from the blob this round).

## 6. Controls and mutants

> **REVISION 2 (2026-09-06):** §6.1's floor and §6.2's twelve-mutant table are **SUPERSEDED** by
> §6 R2 at the end of this section (codex B6, B8). m4 and m7 were equivalent; the population was unmeasured.

### 6.1 The control corpus

The floor is the 27 layout classes and the three bare option-domain controls at 60641339,
carried forward unchanged except where §9.1's decision row applies. Added on top:

| New class | From | Direction |
|---|---|---|
| terminal selection: `filter`, `flatMap`, `splice`, suffix-sentinel filter | r3 B1 | positive |
| continuation that provably cannot select: `map(id).reverse()`, `.slice()`, `.slice(0,0)` | r3 B1 | negative |
| permutation THEN slice, four cases | r3 B2 | two positive, two negative |
| default `sort` is STRING order (`[0,1,2,3,4,5,10]`) | r3 B2 | negative |
| literal punctuation: `;` `{` `}` inside `'…'`, `"…"`, `` `…` `` — 9 combinations, inline and wrapped | r3 B3 | negative, and identically addressed |
| a regex literal containing slashes before a declaration | r3 B3 | negative |
| nested-array form `const slots = [";", [0,1,2,3,4,5]];` and its wrapped form | r3 B3 | negative |
| map-callback value sort, four pairs | §5 | mixed |
| rest binding with a non-ruled remainder | §3.5 | negative |
| whole-corpus lexability | §1.4 | must be empty |

### 6.2 Mutants — each maps to exactly one clause of the design

| Mutant | Clause it mutates | Controls that must die |
|---|---|---|
| m1 report every candidate | §3.1 verdict table | all §3.6 negatives, the shipped-sites assertion |
| **m2′** scan raw text instead of the token stream (replaces r3's m2, whose target `blankComments` no longer exists) | §1.1 | the literal-punctuation and regex classes |
| **m3′** treat `UNKNOWN` as `OTHER` (withhold) (replaces r3's m3, whose terminal rule no longer exists) | §3.1 | filter/flatMap/unknown-callback positives |
| m4 drop rule 1 (literal-is-the-domain) | §3.2 | the three bare option-domain controls |
| m5 plant a real depth bound in LoginFlow | the DEPTH arm, untouched | the two shipped assertions |
| m6 extend the LoginFlow run to `0..6` | candidate finding | none — must stay GREEN, exit 0 |
| m7 ignore the collapsing wrapper (`new Set` no-op) | §3.5 | `new Set([0..5].map(n => n || 1))` |
| m8 drop the slice simulation | §3.3 | every slice-derived spelling |
| **m9** model `sort()` as numeric | §3.3 | `[0,1,2,3,4,5,10].sort().slice(1,-1)` |
| **m10** treat a `NOT_A_NUMBER` callback as `UNKNOWN` | §3.4 | the shipped-sites assertion (LoginFlow reports) |
| **m11** treat `reverse`/`sort` as value-set no-ops (restore r3's rule) | §3.3 | all four r3 B2 cases |
| **m12** empty the regex-ok-after set | §1.2 R-1 | the regex companion control |

Every mutant runs under the selector `-t "the depth bound has a single source"`, and per
`.hermes/TOOLING-TRAPS.md` the selector MUST be verified GREEN at the un-mutated tip before
the first mutant is built — the file carries a pre-existing J10 `ENOENT` that makes a
whole-file exit code prove nothing in either direction.

**STRENGTH: entailed** for the trap and for the r3 mutant set (read from the r3 verdict's
mutation-audit table). **consistent-with** that each new mutant kills exactly the listed
controls — the transcripts decide that.

---


---

## §6 — REVISION 2 (2026-09-06): the real candidate population, and a clause matrix (answers B6, B8)

> **REVISION 3:** §6.7's matrix and its "covers every clause" universal are **SUPERSEDED** by §6 R3
> (R2-B6: K7/K11/K20 equivalent, K24 not a mutation, clauses missing).

### 6.3 R2 — retraction of "zero cost"

Revision 1 used M5 — one raw `1,2,3,4,5` text run in the corpus — as evidence that the evaluator
adds no shipped false positives. **That is retracted.** M5 measures raw text runs; the evaluator's
population is *numeric array literal expressions*, which is a different and much larger set.
codex is right, and the correct number was one AST census away.

### 6.4 R2 — candidate eligibility, stated

A **candidate** is an `ArrayLiteralExpression` with ≥1 element, **all** of whose elements are
numeric literals, optionally prefixed by unary `+`/`-`. Element value is `Number(text)`;
separators, decimals, hex/octal/binary are accepted and keep their numeric value.

**Declared discovery exclusions** — these are exclusions from *finding*, not judgements of
soundness, and each names its miss class:

| Excluded | Count in corpus (M8) | Miss class |
|---|---|---|
| empty array literals `[]` | **551** | a domain built by `[].concat(…)` or similar is invisible |
| mixed arrays (≥1 numeric **and** ≥1 non-numeric element) | **10** | a domain assembled from a non-literal element, e.g. `[0, x, 2, 3, 4, 5]`, is invisible |
| computed indexing `a[1]`, computed property names `{ [1]: … }`, tuple **types** `type T = [1,2,3,4,5]` | — | none; these are not array expressions |
| cross-statement indirection (`const base = […]; const c = base.slice(1);`) | — | U6, unchanged and unclosed |

The 10 mixed arrays were inventoried individually: SQL parameter lists in
`packages/critique`, `packages/evaluator` (×3), `packages/ledger` (×2), `packages/settlement`,
`["ENVELOPE_CONSUMED", 0]` in `packages/db`, `[null, 480, 240, 120, 60, 24]` in
`packages/serve/src/synthesis.ts:96`, and `[0, Object.freeze({…})]` in `apps/runner`. By
inspection none of the ten can yield `{1,2,3,4,5}` — **STRENGTH: consistent-with**, since that is a
reading of ten expressions, not an evaluation of them; the inventory and the counts below are
entailed. Including them instead would make each an `UNKNOWN`-cell candidate and add
**10** false-positive sites; excluding them adds **0**. The exclusion is declared here rather
than discovered in round 3. **STRENGTH: entailed** for the inventory and both counts.

### 6.5 R2 — the exact expected outcome on shipped code

M8/M9 enumerate the full population: **33 candidates in 6 files**, and **none** has distinct set
`{1,2,3,4,5}`.

| Consumer | Candidates | Verdict under §3 R2 | Reason | Site? |
|---|---:|---|---|---|
| `Object.freeze([...])` (`packages/register/src/auth-policy.ts`) | **23** | `OTHER` | freeze modelled as identity; distinct sets are `{96,98}`, `{103}`, `{2178,2521,2528}`, … | no |
| property assignment (`packages/evaluator/src/index.ts` ×5) | **5** | `OTHER` | `EXACT`, sets `{-1,1}` / `{0,1}` | no |
| variable declaration (`apps/ui/lib/totpQr.ts` ×2) | **2** | `OTHER` | `EXACT`, sets `{68,69}`, `{6,28,50}` | no |
| `new Set([204,205,304])` (`apps/ui/app/api/[...path]/route.ts:8`) | **1** | `OTHER` | dedupe, set `{204,205,304}` | no |
| `.map` with a JSX callback (`LoginFlow.tsx:252`) | **1** | `OTHER` | §5.2 R2 | no |
| `.includes` (`apps/ui/lib/v3/tokenUnlock.ts:36`) | **1** | `OTHER` | `NOT_ARRAY` | no |
| **total** | **33** | | | **0 DOMAIN sites** |

So the shipped-sites assertion stays as it is — **and it now depends on three modelling
decisions that were not in Revision 1 at all**: `Object.freeze` as identity (23 candidates),
`includes` as `NOT_ARRAY` (1), and the JSX-callback rule (1). Without the first, 23 shipped
false positives; without the second, 1; without the third, 1. That is the measurement B6 asked
for, and the incremental-cost claim is now attached to the design that will actually run.

**Narrowed claims, per codex:** M5 proves only that the raw run occurs at LoginFlow, that no
such run occurs in a comment in this corpus, and that neither M4 file contains one. The
evaluator's false-positive rate on *future* code remains **undetermined**.

### 6.6 R2 — floor adaptation, declared

- The 27 layout classes and the three bare option-domain controls are carried, **except** the
  nine truncated-callback fixtures adapted in §5.3 R2 (completed, plus five new truncated
  positives).
- The r3 negative `filter(n => n % 2 === 0)` is **retained**, not retired — §9 R2.
- The eight r3 mutants are **not** carried literally: m2 and m3 target `blankComments` and the
  terminal rule, neither of which exists after this revision, and m4 and m7 are equivalent under
  the new evaluator (B8). The matrix below replaces the list.

### 6.7 R2 — clause → mutant → discriminating control

Each row's mutant is *intended* to be non-equivalent — the named control's verdict is predicted to
change under it. That prediction is **consistent-with**, not entailed: it is derived by reasoning
over the rule tables, and K11 below is a worked case where exactly that reasoning produced an
EQUIVALENT mutant. The transcripts decide each row, and a row whose control does not change
verdict is a finding against this matrix, not a passing mutant.
**Twelve is not a ceiling and this table is not claimed complete** — it is claimed to cover
every clause named in §1–§5 R2, and the worker adds a row for any clause added in
implementation.

| # | Clause | Mutant | Discriminating control | Control's verdict, unmutated → mutated |
|---|---|---|---|---|
| K1 | rule-1 precedence (§3.12) | drop rule 1 | `[1,2,3,4,5].map(n => 0)` | site → no site |
| K2 | `Set` dedupe (§3.12) | `new Set(x)` → identity | `[...new Set([0..5].map(n=>n\|\|1))].slice(1)` (native `[2,3,4,5]`) | no site → site |
| K3 | `Object.freeze` identity | freeze → `UNKNOWN` | shipped-sites assertion | 1 site → 24 sites |
| K4 | `includes` → `NOT_ARRAY` | `includes` → `UNKNOWN` | `[502,503,504].includes(x)` + shipped-sites | no site → site |
| K5 | JSX-callback → `NONNUMBER` (§5.2) | JSX body → `UNKNOWN` | shipped-sites assertion; completed LoginFlow layouts | no site → site |
| K6 | coercion → `UNKNOWN` (§3.10) | `NONNUMBER` operand → `NONNUMBER` result | `map(`${n}`).map(n*1).slice(1)` | site → no site |
| K7 | callback purity gate (§3.9) | accept multi-parameter callbacks as pure | B3's mutating-filter chain | site → no site |
| K8 | filter predicate evaluation | evaluated filter → `UNKNOWN` | `filter(n => n % 2 === 0)` | no site → site |
| K9 | truthiness of `0` | `0` truthy | `filter(n => n)` | site → no site |
| K10 | `\|\|` returns the operand | `\|\|` returns a boolean | `new Set([0..5].map(n => n \|\| 1))` | site → no site |
| K11 | `flatMap` declared shapes | `flatMap` → `UNKNOWN` | `flatMap(n => n ? [n] : [])` | site → site **(equivalent — excluded)**; use instead: `flatMap(n => [n])` on `[1,2,3,4,5,6]` … see note |
| K12 | `splice` returns the removed cells | `splice` returns the retained cells | `[0..5].splice(1)` | site → no site |
| K13 | `slice` over cells | drop `slice` | `[0..5].slice(1)` | site → no site |
| K14 | order through `reverse` | `reverse` → no-op | `[0..5].reverse().slice(0,-1)` | site → no site |
| K15 | `sort` is string-ordered | `sort` numeric | `[0,1,2,3,4,5,10].sort().slice(1,-1)` | no site → site |
| K16 | unmodelled method → `UNKNOWN` | unmodelled → identity | `[0..5].slice(1,4).concat(4,5)` | site → no site |
| K17 | sibling-spread ownership (§3.12) | spread treated as identity | `[...[0,1,2,3,4,5],6].slice(1)` (native `[1,2,3,4,5,6]`) | no site → site |
| K18 | rest-binding offset incl. elisions | count bindings, not positions | `const [, ...choices] = [0..5];` | site → no site |
| K19 | nested binding extraction | non-rest binding → no candidate | `const [choices] = [[0..5].slice(1)];` | site → no site |
| K20 | computed member access `["slice"]` | drop computed access | `[0..5]["slice"](1)` | site → no site |
| K21 | `as` boundary transparency | stop at `AsExpression` | `([0..5] as const).slice(1)` | site → no site |
| K22 | `Array.from` wrapper | `Array.from` → `UNKNOWN` | `Array.from(new Set([0..5].map(n=>n\|\|1))).slice(1)` (native `[2,3,4,5]`) | no site → site |
| K23 | ScriptKind mapping (§1.5) | parse `.tsx` as `TS` | corpus parse gate + `<p>[1,2,3,4,5]</p>` | 0 failures → parse diagnostics |
| K24 | JSX text is not code (§1.6) | — covered by K23 | `<p>[1,2,3,4,5]</p>` yields 0 candidates | 0 candidates → 1 |
| K25 | statement-line addressing (§2.2) | replace the parent walk with the R1 punctuation walk | ASI fixture A1 | line 2 → line 1 |
| K26 | occurrence identity is offsets (§2.2) | key DOMAIN sites by `line:kind` | fixture A3 | 2 sites → 1 site |
| K27 | parse-failure policy (§1.7) | `ok:false` → return no sites | the unbalanced-source fixture | `INCONCLUSIVE` → silent pass |
| K28 | mixed/empty discovery exclusion (§6.4) | include mixed arrays as `UNKNOWN`-cell candidates | shipped-sites assertion | 1 site → 11 sites |
| — | **neighbour negative, expected to SURVIVE** | m6: extend LoginFlow's run to `0..6` | selector | **exit 0, no failure** — this is a survival check, not a kill, and §8 R2 states it separately |

**Note on K11.** `flatMap(n => n ? [n] : [])` over `[0..5]` and a `flatMap → UNKNOWN` mutation
both produce a site, so it does not discriminate. The discriminating control is
`[1,2,3,4,5,6].flatMap(n => n < 6 ? [n] : [])` — exact evaluation gives `[1,2,3,4,5]` (a site);
mutating `flatMap` to `UNKNOWN` also gives a site. Both directions report, so the clause is
discriminated instead by its **negative**: `[0,1,2,3,4,5].flatMap(n => n > 0 ? [] : [n])`
evaluates to `[0]` → no site unmutated; `UNKNOWN` under the mutant → site. That is the row the
worker builds; it is written out here rather than left as "add a mutant".

**Harness discipline, unchanged and re-stated:** the selector must be verified GREEN at the
un-mutated tip before the first mutant (the file carries an inherited J10 `ENOENT`), and a
mutation harness's `0/1/0` applied/restored counts are **custody evidence, not test outcomes** —
codex's B8 note, taken.

**STRENGTH: entailed** for every native value cited (M10) and for the corpus counts (M8/M9);
**consistent-with** that each mutant is non-equivalent — the transcripts decide that, and K11
shows the check is real because it caught one that was not.


---

## §6 — REVISION 3 (2026-09-06): a clause inventory, and a matrix without equivalent rows (answers R2-B6)

> **REVISION 4:** §6.8–§6.12 are **SUPERSEDED** by §6 R4's operative manifest (R3-B5). The
> "five uncovered clauses" count is withdrawn.

**§6.7 R2's matrix and its universal are superseded.** codex's ten-row spot-check found K7, K11,
K20 and K24 defective, and I verified all four natively (M11). The universal beside the table —
"covers every clause named in §1–§5 R2" — was false, and the "not claimed complete" sentence next
to it did not remove it. **Both are retracted.**

### 6.8 R3 — the corrections to named rows

| Row | Defect | Replacement |
|---|---|---|
| K7 | mutating only the parameter-count clause leaves clauses 2/3 rejecting the body anyway: `UNKNOWN → UNKNOWN`, site → site | control `[0,1,2,3,4,5].filter((n,i) => 0)` — native `[]` (M11). Baseline: two parameters → ineligible → `UNKNOWN` → site. Relax **only** the parameter-count gate: predicate `0` is falsy for every cell → `EXACT []` → `OTHER` → no site. **Discriminates.** The original mutating-filter chain is retained as a separate conservative control (K7b), and full-body/assignment rejection get their own rows K7c/K7d |
| K11 | `flatMap(n => n>0 ? [] : [n])` is not admitted by the grammar (`c ? [e] : []` is), so baseline and mutant are both `UNKNOWN` | control `[0,1,2,3,4,5].flatMap(n => [n])` — native `[0,1,2,3,4,5]` (M11). Baseline `EXACT [0..5]` → `OTHER`, no site; `flatMap → UNKNOWN` → site. **Discriminates.** The abandoned alternatives are removed from the row |
| K20 | "drop computed access" falls through to the documented `UNKNOWN` and the positive still reports | exact edit: **delete the `ElementAccess`-with-`StringLiteral` branch from §3.16 R3's walk**. Control `[0,1,2,3,4,5]["slice"](0,4)` — native `[0,1,2,3]` (M11) → `OTHER`, no site. After the edit it is an unmodelled non-call member → `UNKNOWN` → site. **Discriminates**, and the positive `["slice"](1)` is kept as K20b |
| K24 | a rejected parse exposes no candidates, so this is not a second mutation | **merged into K23** as one parse-diagnostic check. 28 rows were never 28 transcripts |

### 6.9 R3 — restored and added rows

Restored: **K29** global `UNKNOWN → OTHER` (the actual r3 m3′ clause; killed by every
`UNDETERMINED` positive, e.g. `reduce(...)` and the unmodelled call) and **K30** the m5 LoginFlow
ceiling-planting mutation (`data-capped={expansionDepth < 6}` in the named temporary target; kills
the two shipped assertions with `LoginFlow:251 [DEPTH_BOUND_LITERAL]`).

Added for clauses that had no row: **K31** work-limit exhaustion → `unknown` (control: a callback
nested past the budget) · **K32** complete-body consumption (a callback with a statement before
`return`) · **K33** unsupported arity (`slice(1,2,3)`) · **K34** unknown enclosing call
(`((x)=>x.slice(1))([0..5])`) · **K35** primitive truthiness (`filter(n => n)`) · **K36**
conditional branch evaluation · **K37** non-finite → `unknown` (`map(n => n*n/n).filter(n => n)`) ·
**K38** empty-array discovery exclusion, **separate from** K28's mixed-array exclusion · **K39**
comma-operator rule (A8) · **K40** nested `{arr}` binding payload · **K41** collection kind
(array method on a `Set`) · **K42** `reduce → UNKNOWN` · **K43** `find`/`at` element-kind gate ·
**K44** `.length` versus arbitrary member.

### 6.10 R3 — every row declares its asserted observable

codex is right that "each mutation changes verdict" is false as a blanket rule: K25 changes a
**line**, K23 changes a **parse diagnostic**, K26 changes **cardinality**. Each row therefore
carries one of four observables, and the round-3 acceptance asserts the row's own observable, not
a verdict:

`VERDICT` (candidate verdict or cells) · `ADDRESS` (line/offset/span) · `CARDINALITY` (candidate or
site count) · `DIAGNOSTIC` (parse outcome) · `SITES` (the emitted list).

### 6.11 R3 — the clause inventory, with its gaps named

The count is derived from the inventory, not asserted:

| Contract area | Clauses | Rows | Unassigned |
|---|---:|---|---|
| §1 R3 parse and failure | 3 (ScriptKind, diagnostic gate, INCONCLUSIVE policy) | K23, K27 | ScriptKind and the diagnostic gate share one mutation — declared, not hidden |
| §2 R3 addressing | 3 (statement walk, offset identity, display/identity separation) | K25, K26 | display/identity separation has **no** discriminating mutation; named as a gap |
| §3.13 primitives | 7 | K31, K35, K36, K37, plus K6 (coercion) | signed-zero and `??` have **no** rows; named as gaps |
| §3.15 operations | 9 | K12–K16, K42, K43, K44, K33 | `NOT_ARRAY` continuation has **no** row; named as a gap |
| §3.16 ownership | 10 | K17–K20, K34, K39, K40, K41, K21, K22 | multiple-bound-output verdict has **no** row; named as a gap |
| §3.9 purity gate | 4 | K7, K7b, K7c, K7d | — |
| §3.2 rule 1 | 1 | K1 | — |
| discovery | 2 | K28, K38 | — |
| wrappers | 3 | K2, K3, K22 | — |
| the JSX/includes models | 2 | K4, K5 | — |
| global fallback | 1 | K29 | — |
| ceiling arms | 1 | K30 | — |

**Five clauses have no discriminating mutation and are named above rather than covered.** They go
to V with §9.13 R3 as the residue of this round. **The table is not complete, and this time the
sentence beside it does not claim otherwise.**

### 6.12 R3 — population note

codex's "including mixed candidates adds exactly ten sites" caution is accepted: that counterfactual
needs the changed eligibility, abstraction and ownership pipeline, not ten discovered nodes.
**K28 uses a deterministic planted mixed fixture**, and §6.4's ten-site figure is restated as
**undetermined** until a worker measures it.

**STRENGTH: entailed** for the four native replacement values (M11) and for the four defective rows;
**consistent-with** for each replacement's predicted discrimination; **undetermined** for every
mutant transcript.


---

## §6 — REVISION 4 (2026-09-06): the operative mutation manifest (item 5, R3-B5)

**§6.8–§6.12 R3 are superseded by the single manifest below.** codex is right that K31–K44 were
clause names with control sketches, that §6.10 assigned categories without assigning them to rows,
and that "K1–K44" plus a separately listed K30 does not define a transcript inventory. Labelling a
prediction `consistent-with` does not supply it.

**Reading the manifest.** `MUTATION` rows are transcripts. `CONTROL-ONLY` rows are assertions with
no mutation of their own. `MERGED` rows are gone and say where. Observables:
`VERDICT` (candidate verdict/cells) · `ADDRESS` · `CARDINALITY` · `DIAGNOSTIC` · `SITES`.
Every mutation is applied and restored individually through the mission harness with
pre/applied/restored `0/1/0`, before/after hashes and a final empty porcelain; **those counts are
custody, never an outcome**. Fixtures are `const choices = <expr>;` unless a shipped assertion is
named.

### 6.13 R4 — the manifest

| # | Status | Precise rule edit | Fixture / named assertion | Obs. | Baseline | Mutant | Round |
|---|---|---|---|---|---|---|---|
| K1 | retained | delete §3.2's rule-1 precedence check | `[1,2,3,4,5].map(n => 0)` (native `[0,0,0,0,0]`) | SITES | 1 | 0 | 3 |
| K2 | retained | `new Set(x)` → identity (no dedupe) | `[...new Set([0..5].map(n=>n\|\|1))].slice(1)` (native `[2,3,4,5]`) | VERDICT | OTHER | RULED | 3 |
| K3 | retained | `Object.freeze(x)` → `UNKNOWN` | shipped assertion `depthBoundSitesInShippedCode()` | SITES | 1 | 24 | 3 |
| K4 | retained | `includes` → `UNKNOWN` | shipped assertion | SITES | 1 | 2 | 3 |
| K5 | retained | JSX-body callback → `unknown` cells | shipped assertion | SITES | 1 | 2 | 3 |
| K6 | retained | arithmetic with a `str` operand → exact JS coercion | ``map(n=>`${n}`).map(n=>n*1).slice(1)`` (native `[1,2,3,4,5]`) | VERDICT | UNDETERMINED | RULED | 3 |
| **K6b** | **new** (R3 gap: unary had no distinct discriminator) | unary `+` on a `str` cell → `unknown` | ``map(n=>`${n}`).map(n=>+n).slice(1)`` (native `[1,2,3,4,5]`) | VERDICT | RULED | UNDETERMINED | 3 |
| K7 | replaced | relax **only** §3.9 clause 1 (parameter count); clauses 2–4 intact | `[0..5].filter((n,i) => 0)` (native `[]`) | VERDICT | UNDETERMINED | OTHER | 3 |
| K7b | control-only | — | the R2-B3 mutating filter `map(n=>n===5?6:n).filter((n,i,a)=>{a[5]=5;return n>0;})` | VERDICT | UNDETERMINED | — | 2 |
| K11 | replaced | delete the `flatMap` row (→ `UNKNOWN`) | `[0..5].flatMap(n => [n])` (native `[0,1,2,3,4,5]`) | VERDICT | OTHER | UNDETERMINED | 3 |
| K12 | retained | `splice` returns the RETAINED cells | `[0..5].splice(1)` (native removed `[1,2,3,4,5]`, retained `[0]`) | VERDICT | RULED | OTHER | 3 |
| K13 | retained, **disambiguated** | delete the `slice` row so it falls to **fallback `UNKNOWN`** (NOT identity) | `[0..5].slice(1)` | VERDICT | RULED | UNDETERMINED | 3 |
| K14 | retained | `reverse` → no-op | `[0..5].reverse().slice(0,-1)` (native `[5,4,3,2,1]`) | VERDICT | RULED | OTHER | 3 |
| K15 | retained | `sort()` ordered numerically | `[0,1,2,3,4,5,10].sort().slice(1,-1)` (native `[1,10,2,3,4]`) | VERDICT | OTHER | RULED | 3 |
| K16 | retained | unmodelled method → identity | `[0..5].slice(1,4).concat(4,5)` (native `[1,2,3,4,5]`) | VERDICT | UNDETERMINED | RULED | 3 |
| K17 | retained | spread with siblings → identity on the inner array | `[...[0,1,2,3,4,5],6].slice(1)` (native `[1,2,3,4,5,6]`) | VERDICT | OTHER | RULED | 3 |
| K18 | retained | rest offset counts BINDINGS, not positions | `const [, ...choices] = [0..5];` (native `[1,2,3,4,5]`) | VERDICT | RULED | OTHER | 3 |
| K19 | retained | non-rest binding → no candidate value | `const [choices] = [[0..5].slice(1)];` (native `[1,2,3,4,5]`) | VERDICT | RULED | OTHER | 3 |
| K20 | replaced | delete the `ElementAccess`-with-`StringLiteral` recognition | `[0..5]["slice"](0,4)` (native `[0,1,2,3]`) | VERDICT | OTHER | UNDETERMINED | 3 |
| K20b | control-only | — | `[0..5]["slice"](1)` | VERDICT | RULED | — | 2 |
| K21 | retained | stop the walk at `AsExpression` | `([0..5] as const).slice(1)` | VERDICT | RULED | UNDETERMINED | 3 |
| K22 | retained | `Array.from` → `UNKNOWN` | `Array.from(new Set([0..5].map(n=>n\|\|1))).slice(1)` (native `[2,3,4,5]`) | VERDICT | OTHER | UNDETERMINED | 3 |
| K23 | retained (**K24 merged in**) | `.tsx` → `ScriptKind.TS` | the corpus parse gate | DIAGNOSTIC | 0 failures | ≥1, named | 1 |
| K25 | retained | replace the parent-statement walk with the r3 punctuation walk | fixture A1 (ASI) | ADDRESS | `statementLine` 2 | 1 | 1 |
| K26 | retained | key DOMAIN sites by `line:kind` instead of `start:end` | fixture A3, offsets `(10,21)`/`(33,44)` | CARDINALITY | 2 sites | 1 | 3 |
| K27 | retained | `domainSites` on a failed parse returns `[]` | the truncated-prefix block | SITES | 1 `INCONCLUSIVE` | 0 | 1 |
| K28 | replaced | admit mixed arrays as candidates, non-numeric elements → `unknown` cells | planted `const choices = [0, sentinel, 2, 3, 4, 5];` | CARDINALITY | 0 candidates | 1, UNDETERMINED | 2 |
| K29 | retained | global `UNKNOWN → OTHER` | `[0..5].reduce((a,n)=>n?a.concat(n):a,[])` (native `[1,2,3,4,5]`) | SITES | 1 | 0 | 3 |
| K30 | retained (m5) | plant `data-capped={expansionDepth < 6}` in `LoginFlow.tsx` | the two shipped assertions | SITES | 1 | 2, naming `LoginFlow:251 [DEPTH_BOUND_LITERAL]` | 3 |
| K31 | replaced | raise the §3.9 node budget from **64** to unbounded | `map(n => n` + 40 × `+1-1` + `).slice(1)` — over 64 expression nodes | VERDICT | UNDETERMINED | RULED | 3 |
| K32 | replaced | accept a block body with statements before the `return`, evaluating only the final `return` | `filter(n => { if (n > 9) return true; return n > 0; })` — no assignment, call or member access, so no other purity clause independently rejects it | VERDICT | UNDETERMINED | RULED | 3 |
| K33 | replaced | ignore `slice` arguments after the second | `[0..5].slice(1,2,3)` (native `[1]`) | VERDICT | UNDETERMINED | OTHER | 3 |
| K36 | replaced | evaluate both conditional branches and join to `unknown` when they differ | `map(n => n === 0 ? 1 : n)` (native `[1,1,2,3,4,5]`) | VERDICT | RULED | UNDETERMINED | 3 |
| K38 | replaced | admit empty array literals as candidates | `const choices = [].concat(1,2,3,4,5);` (native `[1,2,3,4,5]`) | CARDINALITY | 0 candidates | 1, UNDETERMINED | 2 |
| K39 | replaced | delete the comma-operator row | `const slots = (";", [0,1,2,3,4,5]);` | VERDICT | OTHER | UNDETERMINED | 3 |
| K40 | replaced | a nested array element is a payload-free non-numeric cell | `const [choices] = [[0..5].slice(1)];` | VERDICT | RULED | OTHER | 3 |
| K41 | replaced | ignore `coll` and apply array methods to a `Set` | `const choices = new Set([0..5]).slice(1);` | VERDICT | UNDETERMINED | RULED | 3 |
| K42 | replaced | `reduce` → `NOT_ARRAY` | `[0..5].reduce((a,n)=>n?a.concat(n):a,[])` | VERDICT | UNDETERMINED | OTHER | 3 |
| K43 | replaced | `at`/`find` → `NOT_ARRAY` unconditionally | `map(n=>[n+1,n+2,n+3,n+4,n+5]).at(0)` (native `[1,2,3,4,5]`) | VERDICT | UNDETERMINED | OTHER | 3 |
| K44 | replaced | any non-call member → `NOT_ARRAY` | `const choices = [0..5].foo;` (paired with `[0..5].length`, which stays OTHER both ways) | VERDICT | UNDETERMINED | OTHER | 3 |
| **K45** | **new** (R3-B2) | drop condition 3, `call.expression === member`, from §3.18 R4 | `((method) => Array.from({length:5},(_,i)=>i+1))([0..5].includes)` (native `[1,2,3,4,5]`; spans M17) | VERDICT | UNDETERMINED, span `(16,94)` | OTHER | 3 |
| **K46** | **new** (R3-B1) | abstract `str`/`bool` cells to a payload-free non-numeric cell | ``map(n=>`${n}`).map(n=>+n).slice(1)`` | VERDICT | RULED | UNDETERMINED | 3 |
| **K47** | **new** (R3-B1) | dedupe only `num` cells in `new Set`, leaving others distinct | the SAME-sentinel expression (native `[2,3,4,5]`) | VERDICT | OTHER | RULED | 3 |
| **K48** | **new** (O1) | treat `-0` alone as truthy | `[-0,1,2,3,4,5].filter(n=>n)` (native `[1,2,3,4,5]`) | VERDICT | RULED | OTHER | 3 |
| **K49** | **new** (O1) | `??` returns the left `Prim` even when it is `null` | `map(n => (n === 0 ? null : n) ?? 1)` (native `[1,1,2,3,4,5]`) | VERDICT | RULED | OTHER | 3 |
| **K50** | **new** (O1) | an operation over `NOT_ARRAY` returns `NOT_ARRAY` unchanged | `join("").split("").map(n=>+n).slice(1)` (native `[1,2,3,4,5]`) | VERDICT | UNDETERMINED | OTHER | 3 |
| **K51** | **new** (O1) | classify only the first binding instead of the any-`RULED` aggregation | `const [head, ...choices] = [0..5];` (native `[1,2,3,4,5]`) | VERDICT | RULED | OTHER | 3 |
| K24 | **merged** | — | see K23 | — | — | — | — |
| K34 | control-only | — | `((x)=>x.slice(1))([0..5])` — the direct unknown call | VERDICT | UNDETERMINED | — | 2 |
| K35 | control-only | — | `filter(n => n)` (native `[1,2,3,4,5]`) | VERDICT | RULED | — | 2 |
| K37 | control-only | — | `map(n => n*n/n).filter(n => n)` (native `[1,2,3,4,5]`) | VERDICT | UNDETERMINED | — | 2 |
| K7c/K7d | control-only | — | an `async` callback; a callback containing an assignment | VERDICT | UNDETERMINED each | — | 2 |
| m6 | **survival** | extend LoginFlow's run to `0..6` | the selector | SITES | 1 | **1 — expected to SURVIVE, exit 0** | 3 |

### 6.14 R4 — the derived transcript inventory

**MUTATION rows: 45**, enumerated rather than described —
K1, K2, K3, K4, K5, K6, K6b, K7, K11, K12, K13, K14, K15, K16, K17, K18, K19, K20, K21, K22, K23,
K25, K26, K27, K28, K29, K30, K31, K32, K33, K36, K38, K39, K40, K41, K42, K43, K44, K45, K46, K47,
K48, K49, K50, K51.

By first usable round: **round 1 → 3** (K23, K25, K27) · **round 2 → 2** (K28, K38) ·
**round 3 → 40** (the remaining ids). 3 + 2 + 40 = 45.

**CONTROL-ONLY: 7** — K7b, K7c, K7d, K20b, K34, K35, K37 — plus the `[0..5].length` pairing asserted
inside K44's row. **MERGED: 1** (K24 → K23). **SURVIVAL: 1** (m6, expected exit 0).

**Total transcripts to file: 45 mutations + 1 survival = 46.** §8.11 R3's "run K1–K44" and its
implied 44 are superseded by this enumeration.

*(I first wrote 41 here and recounted from the table before filing: the range shorthand
"K11–K23" silently dropped ids the table actually carries. The enumeration above replaces the
shorthand for that reason.)*

### 6.15 R4 — the four O1 semantic controls come BEFORE evaluator implementation

K48–K51 are written as failing assertions in **round 2's RED step**, before any transfer rule is
implemented, per codex's "specified before evaluator code starts". Their mutations run in round 3.
**Display/identity separation remains a named follow-up**, and its price is compulsory exact
assertions rather than a mutation: every address fixture asserts exact `text`, `line`, `start`,
`end`, and A3 asserts cardinality 2 — already required by §2 R3 and §2.3 R2.

### 6.16 R4 — retractions carried

§6.11 R3's "five uncovered clauses" is **withdrawn as a count**. codex is right that the 46 summed
slots were not an enumerated atomic clause set (Array.from appears twice; K19/K40 overlap), and that
unary coercion and the callee role had no discriminators — both now have rows (K6b, K45). The honest
statement is: **the manifest above is the coverage; anything not in it is not covered, and no total
of uncovered clauses is certified.**

**STRENGTH: entailed** for every native value in the fixture column (M10, M11, M20 and this round's
probes) and for the four defective r3 rows; **consistent-with** for each baseline→mutant prediction —
they are replays of the written rules, and R2-B1/R3-B1 are the standing proof that such a replay can
be wrong; **undetermined** for every transcript until it is run.

## 7. Module boundary

> **REVISION 2 (2026-09-06):** the export list and the word "byte-intact" are **SUPERSEDED** by §7 R2 at
> the end of this section (codex §7 note, F1). The module boundary itself stands.

**Where it lives:** a new pure module `dialectical-engine/tests/support/depthOracle.ts`,
exporting `lexModule`, `duplicateBoundSites`, `DuplicateSite`, `DuplicateKind` and the
evaluator's types. No filesystem access, no imports from the application.

**Why there:**

- The precedent is in the repo: `tests/support/t16PolicyScanner.ts` (121 lines) is a pure
  function over `(path, source)` pairs so the same code runs against the real surface and
  against planted controls. Same shape, same reason.
- The oracle scans `packages/`, `apps/`, `web/` — `tests/` is not a scanned root, so the
  module's own `[1, 2, 3, 4, 5]` constants and control strings cannot make it self-trip.
  **Verify this in round 1**: it is the difference between a working oracle and one that
  reports itself.
- `tsconfig.json` `include` carries `tests/**/*.ts`, so `pnpm typecheck` (`tsc --noEmit`)
  covers the new module. (`exclude` lists `web` and `apps/ui`; it does not exclude `tests`.)
- It retires the trap the lane recorded: with a real module, a source-only probe harness is
  `import { duplicateBoundSites } from "…/tests/support/depthOracle.ts"` instead of
  "extract the block from a git blob and strip its types in memory". Codex gets a one-second
  attack surface without reconstructing anything.

**Size:** target 350–450 lines including the doc comments the reviewer needs. If it passes
~500, split the callback mini-evaluator into `tests/support/depthOracleCallback.ts` rather
than growing one file.

**What stays in `tests/unit/s1-1-depth-contract.test.ts`:** `REPOSITORY_ROOT`,
`SHIPPED_ROOTS`, `SKIPPED_DIRECTORIES`, `SHIPPED_EXTENSIONS`, `shippedSourceFiles`,
`depthBoundSitesInShippedCode`, `duplicateBoundSitesInShippedCode`, `OWNING_DECLARATION`, and
every `describe`/`it`.

**How the arm is replaced without touching the other two:**

- `MENTIONS_A_DEPTH`, `BARE_FIVE`, `SIX_AS_EXCLUSIVE_BOUND`, `kindOfExclusiveBound`,
  `declarationUnits` move to the module **byte-identical**.
- `kindOfCeilingLiteral` loses ONE clause — its `WHOLE_DOMAIN` fallback — because DOMAIN sites
  now come from the evaluator. `kindOf` loses the same clause and becomes a pure ceiling
  predicate. `WHOLE_DOMAIN` itself is deleted.
- The three windows keep their current shape; only `DEPTH_BOUND_LITERAL` flows through them.
  `record`'s `withheld` parameter is removed.
- **Named divergence, asserted rather than left silent:** r3 matched `WHOLE_DOMAIN` against
  raw physical lines INCLUDING comment text, so a domain enumeration written inside a comment
  reported. It will not any more, because comments are trivia. Measured cost on today's
  corpus: **zero** — a raw-text grep of all 232 shipped files, comments included, for the
  `WHOLE_DOMAIN` pattern returns exactly one line, `apps/ui/components/LoginFlow.tsx:252`.
  A control asserts the new behaviour directly, in the style of r3's "narrows r3 in exactly
  one place".

**Acceptance test — §7:**

```
it("keeps the ceiling arms unchanged where the domain arm is replaced", () => {
  expect(kindOf("  const ready = topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX && riskTier.length > 0;"))
    .toBe("DEPTH_BOUND_LITERAL");
  expect(duplicateBoundSites("  const ready = topic.trim().length > 6 && depth >= EXPANSION_DEPTH_MIN && depth <= EXPANSION_DEPTH_MAX && riskTier.length > 0;"))
    .toEqual([]);
});

it("does not read a domain enumeration written inside a comment as a definition", () => {
  expect(duplicateBoundSites("// const allowed = [1, 2, 3, 4, 5];")).toEqual([]);
});

it("does not scan the test-support tree", () => {
  expect(shippedSourceFiles().some((p) => p.includes("/tests/"))).toBe(false);
});
```

plus the eight `detects a duplicate written as …` controls, the four layout controls, the
three wrapped-conjunct controls, the two unrelated-ceiling negatives, the three exclusive-six
layouts, the five unrelated-depth negatives, and the two "still catches a longer run when a
depth token is in reach" controls — all carried forward from 60641339 unchanged.

**STRENGTH: entailed** for the tsconfig, the precedent file, the scan roots and the corpus
grep. **consistent-with** for the 350–450 line estimate.

---


---

## §7 — REVISION 2 (2026-09-06): exports, and what "intact" is allowed to mean (answers codex §7, F1)

> **REVISION 3:** the export list and the ">500 lines, split" instruction are **SUPERSEDED** by §7 R3.

### 7.1 R2 — the export list was incomplete

The `narrows r3 in exactly one place` control asserts on `kindOf` directly, and Revision 1's
declared export list omitted it. codex replayed that control in isolation and confirmed the
behaviour it pins (`kindOf` → `DEPTH_BOUND_LITERAL`, `duplicateBoundSites` → `[]`). The module
therefore exports, deliberately and as a named test surface:

`parseModule` · `candidatesOf` · `duplicateBoundSites` · `kindOf` · `kindOfCeilingLiteral` ·
`kindOfExclusiveBound` · `declarationUnits` · the types.

`kindOf`, `kindOfCeilingLiteral`, `kindOfExclusiveBound` and `declarationUnits` are exported
**for the controls that pin them**, not because the pipeline needs them externally. That is a
deliberate test hook and is labelled as one in the module.

### 7.2 R2 — "intact" narrowed (F1)

Revision 1 said the ceiling arms are "byte-intact" and codex accepted the scope but not the
word. Narrowed: **their runtime predicates and windows are unchanged apart from removing the
`WHOLE_DOMAIN` fallback and moving the code**, and their existing controls and diagnostic
baseline are preserved. That is preservation of behaviour, not a claim of soundness.

The concrete inherited limitation, recorded here for the separate follow-up rather than argued
away — codex's F1 input:

```ts
const a = /[//]/; const depthSchema = z.number()
  .max(5);
```

The current extracted oracle returns `[]` for this; removing the regex prefix makes it report
the wrapped depth ceiling. `declarationUnits` mis-reads the regex as a string. **The new parser
is NOT fed into these arms in this ticket** — doing so would change their behaviour as an
unreviewed side effect of extracting the module, which is precisely what F1 warns against. The
input above becomes the first fixture of the follow-up ticket.

**U5 is restated accordingly:** it is not "a limitation that might exist"; it is this input.
**STRENGTH: entailed** (codex ran both scanner outputs; the scope text is the packet's).


---

## §7 — REVISION 3 (2026-09-06): the export list follows the split API (answers R2-B4, F1)

§7.1 R2's export list is superseded by §1.9 R3's signatures. The module exports:

`parseModule` · `candidatesOf` · `domainSites` · `ceilingSites` · `duplicateBoundSites` ·
`kindOf` · `kindOfCeilingLiteral` · `kindOfExclusiveBound` · `declarationUnits` · the types.

`ceilingSites` is the **fragment harness** R2-B4 asked for, and it is the F1-safe one: it is the
existing text pipeline, it never calls `parseModule`, and no ceiling arm is re-lexed as a side
effect of the extraction. The four lower-level ceiling exports remain deliberate test hooks for the
controls that pin them.

**One module, no split.** §7's "split if it passes ~500 lines" is **withdrawn**: codex is right
that a size rule cannot silently introduce a second implementation file inside a round whose budget
is one. The evaluator is one module at whatever size it lands; if a split is ever wanted it is a
separate ticket with its own boundary decision.

**STRENGTH: entailed** for the F1 scope text and the round budget; **consistent-with** that one
module is the right boundary at the size this now implies.

## 8. Worker rounds

> **REVISION 2 (2026-09-06):** all three rounds are **SUPERSEDED** by §8 R2 at the end of this section
> (codex B7: the round-2 GREEN/RED sets could not hold). A round 0 dependency gate is added.

Each round delivers ONE implementation file. The oracle test file is co-touched in every
round because that is where RED lives, and the ticket contract grants both
(`tests/unit/s1-1-depth-contract.test.ts`, `tests/support/`). **If the orchestrator meant one
file TOTAL per round**, the alternative is: R1 becomes test-file-only, with all new controls
written against the current in-file scanner, and the module lands in R2 — at the cost that
R1's RED cannot be attributed per-clause, since a missing import fails the whole file at load.
Say which reading governs before dispatch; the plan is executable under either.

### Round 1 — the lexer

**Files:** create `tests/support/depthOracle.ts` · modify `tests/unit/s1-1-depth-contract.test.ts`

- [ ] **Step 1 — RED.** Add §1.4's whole-corpus lexability assertion and the six token-kind
      controls. Run `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source"`.
      Expected: FAIL, `Cannot find module '../support/depthOracle.js'`.
- [ ] **Step 2.** Create the module with `lexModule` only: `createScanner` from
      `typescript/unstable/ast`, R-1/R-2/R-3 from §1.2, the progress guard, `LexResult`.
- [ ] **Step 3 — RED, for the right reason.** Same command. Expected: the six token-kind
      controls PASS; the corpus assertion FAILS naming the files that do not lex. Record the
      list verbatim — M4 predicts `apps/ui/components/EvaluatorDevMenu.tsx` and
      `apps/ui/components/RecommendedInvestigations.tsx` if R-3 is incomplete.
- [ ] **Step 4.** Finish R-3 until the corpus assertion is empty.
- [ ] **Step 5 — GREEN.** Same command, plus `pnpm typecheck`.
- [ ] **Step 6.** Confirm `shippedSourceFiles()` does not reach `tests/` (§7's third test).
- [ ] **Step 7.** Commit.

**Codex review must check:** that the corpus assertion CAN fail (ask for the round's own
Step-3 transcript, not an argument); that R-1's revert cannot loop; that the driver's three
rules are stated in the module, not only in this plan; that no DOMAIN behaviour changed yet.

**Expected suite state at the end of round 1:** the DOMAIN arm is still r3's, so every
pre-existing control stays as it is. No new RED is left behind.

### Round 2 — candidates and addressing

**Files:** modify `tests/support/depthOracle.ts` · modify `tests/unit/s1-1-depth-contract.test.ts`

- [ ] **Step 1 — RED.** Add §2.1's addressing controls, the nine literal-punctuation
      combinations inline and wrapped, the two nested-array forms, and the extended
      equivalent-layouts property that asserts one address per group. Expected: FAIL on the
      punctuation and regex classes (codex r3 B3's measured behaviour).
- [ ] **Step 2.** Add token-level candidate finding: `[` numeric literals `]` spans, the
      backward walk to the statement's first token, `firstLine` / `lastLine`.
- [ ] **Step 3.** Route `DOMAIN_ENUMERATION` emission through candidates; delete
      `blankComments`, `ruledDomainOccurrences`, `withheldDomainLines`, `NUMERIC_RUN` and
      `record`'s `withheld` parameter; drop the `WHOLE_DOMAIN` clause from
      `kindOf`/`kindOfCeilingLiteral`. Verdict is a stub: rule 1 (§3.2) if the literal is the
      domain, otherwise `UNDETERMINED` → report.
- [ ] **Step 4 — declared partial RED.** Expected GREEN: §2.1, the punctuation and regex
      classes, the layout-agreement groups for `bare` and `six-page`, all DEPTH-arm controls,
      §7's comment control. Expected RED, named in the commit message: the shipped-sites
      assertion (LoginFlow now reports under the stub), the `index run left whole` group, and
      every §3.6 negative. **Enumerate them; a round that ends with an unenumerated red is a
      round that ends unreviewed.**
- [ ] **Step 5.** `pnpm typecheck`. Commit.

**Codex review must check:** that exactly one decision exists per candidate and no window can
add a second; that `firstLine` never comes from raw-text punctuation; that the declared RED
set matches the transcript exactly; that the DEPTH arms' controls are all still green.

### Round 3 — the evaluator

**Files:** modify `tests/support/depthOracle.ts` · modify `tests/unit/s1-1-depth-contract.test.ts`

- [ ] **Step 1 — RED.** Add every §3.6 row, §5's four callback pairs and the five real
      LoginFlow layouts. Expected: FAIL on all §3.6 negatives and on the shipped-sites
      assertion (the stub reports everything).
- [ ] **Step 2.** Implement §3.1's `Values`, §3.3's operation table, §3.4's callback
      mini-evaluator, §3.5's wrapping and binding rules.
- [ ] **Step 3 — GREEN.** `pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source"`,
      then the same command three times (cluster runs), then `pnpm typecheck`.
- [ ] **Step 4.** Verify the selector is green at the un-mutated tip; then run m1–m12 through
      the mission's mutate harness at its ABSOLUTE path, each with the selector, recording
      pre/applied/restored `0/1/0` and the failing set per mutant.
- [ ] **Step 5.** b14 full suite; report `passed/total`, distinct failures, suite-load, skips
      and unhandled, and the name-set difference against `33-r2-b14-full-suite.log` /
      `58-r3-b14-full-suite.log`.
- [ ] **Step 6.** Commit.

**Codex review must check:** every §3.6 row against an independently evaluated value; that
`sort()` is string-ordered; that the LoginFlow verdict is derived from the callback's value
sort and not from position or terminality; that m10 (JSX callback treated as unknown) makes
LoginFlow report; that no mutant transcript rests on a whole-file exit code.

### Day-scale, said plainly

- Round 2 and round 3's operation table are day-scale: the rules are enumerated above and the
  controls already exist.
- **Round 1 is the round that can overrun.** M4 is a measured failure on 2 of 232 files, and
  the cause — JSX brace context — is the one part of the driver I have not solved and am not
  claiming to have solved. Budget it as the longest round and treat "the corpus assertion is
  empty" as its only completion signal.
- **Round 3's callback classification is the second risk.** Nothing here is hard; there is
  simply more of it than a single reviewer pass usually absorbs, and it is where a rework
  round is most likely to be spent.
- The mutant set (12) and b14 (~50 minutes, from the lane's own logs) are the fixed tail cost
  and should be scheduled, not discovered.

---


---

## §8 — REVISION 2 (2026-09-06): round states that can actually hold (answers B7)

> **REVISION 3:** all rounds are **SUPERSEDED** by §8 R3 (R2-B5). The 24 → 2 → 1 staged counts were
> arithmetically wrong; one sequence is now chosen rather than left to the worker.

**§8's three rounds are superseded.** Two defects, both codex's and both real: round 2's
expected-GREEN list contained assertions that the round-2 stub necessarily fails, and round 1's
RED rested on a missing module plus an assumed historical driver result rather than on a
specified defect.

### 8.1 R2 — round 0: the dependency grant

Not a worker round. D-R2-1 (§0.8 R2) must be answered before round 1: the root aliased
`typescript-classic@5.9.3` devDependency, its lockfile entry, and one install. **If refused, the
ticket is BLOCKED**, not re-planned around.

### 8.2 R2 — round 1: the parser and the candidate table

**File:** create `tests/support/depthOracle.ts` (+ the oracle test file, which carries RED).

- [ ] **Step 1 — RED, from a specified defect, not a missing file.** Add §1 R2's parse-context
      fixtures and §2 R2's address fixtures A1–A11, and implement `parseModule` **with the
      ScriptKind mapping deliberately wrong** (`.tsx` parsed as `ScriptKind.TS`). Run the
      selector. Expected FAIL, named: the corpus parse gate reports diagnostics in `.tsx` files,
      and `<p>[1,2,3,4,5]</p>` yields 1 candidate instead of 0. This is clause K23/K24's defect
      staged deliberately, so RED is attributable.
- [ ] **Step 2.** Correct the ScriptKind mapping. Expected: corpus gate empty (M6 predicts
      232/232, 0 diagnostics), all parse-context fixtures green.
- [ ] **Step 3.** Implement `candidatesOf` — eligibility (§6.4 R2), values, offsets,
      `statementLine` by parent walk. Expected: A1–A11 green, including A1's line 2 and A2's
      line 1.
- [ ] **Step 4 — GREEN** for §1 R2 and §2 R2 only. `pnpm typecheck` reported **relative to the
      recorded baseline** — 8 diagnostics, all in s14-ui, per logs 02/07/25/46 — not as an
      absolute zero.
- [ ] **Step 5.** Assert the selector's own containment: the selector must run a known number of
      tests, so a narrowed selector cannot pass by omission.
- [ ] **Step 6.** Commit.

**Round 1 changes no DOMAIN verdict.** The old arm is still in use; the new module is additive.
There is no partial red to declare.

**Codex review must check:** that Step 1's RED transcript exists and names K23/K24's defect;
that no address is derived from punctuation; that the parse-failure path produces
`INCONCLUSIVE` and not silence; that the dependency is imported by its aliased name, not by a
relative path into `apps/ui` or `.pnpm`.

### 8.3 R2 — round 2: verdicts over the candidate table

**File:** modify `tests/support/depthOracle.ts` (+ the test file).

Round 2 asserts on **`candidatesOf`**, not on `duplicateBoundSites`. That is the fix for B7:
the Revision-1 round-2 stub necessarily reported every non-rule-1 candidate, so every
site-level negative I listed as GREEN was impossible. Candidate-level assertions do not depend
on the emitter being finished.

- [ ] **Step 1 — RED.** Add §3 R2's verdict rows as assertions on `candidatesOf(...).verdict`
      and `.cells`: the §3.11 R2 worked table, §3.12 R2's ownership rows, §3.6's original rows.
      Expected FAIL: `verdict` is not yet computed.
- [ ] **Step 2.** Implement §3.8–§3.10 R2 (lattice, purity gate, callback grammar) and
      §3.12 R2 (ownership walk with consumed spans).
- [ ] **Step 3 — GREEN** for every candidate-level assertion. The site-level suite is untouched
      and still uses the old arm, so nothing there changes and nothing is left red.
- [ ] **Step 4.** `pnpm typecheck` baseline-relative. Commit.

**Codex review must check:** the callback purity gate rejects multi-parameter, block-bodied,
async and call-containing callbacks; that `NONNUMBER` never survives an arithmetic operation as
`NONNUMBER`; that `NOT_ARRAY` is assigned by built-in name and not by position; that every
ownership row has a consumed span.

### 8.4 R2 — round 3: emission, LoginFlow, mutants

**File:** modify `tests/support/depthOracle.ts` (+ the test file).

- [ ] **Step 1 — RED.** Switch `DOMAIN_ENUMERATION` emission to the candidate table; delete
      `blankComments`, `ruledDomainOccurrences`, `withheldDomainLines`, `NUMERIC_RUN`, the
      `WHOLE_DOMAIN` clause and `record`'s `withheld` parameter. Add §5 R2's completed LoginFlow
      layouts, the five truncated positives, §4 R2's rule-1 discriminator, and the §6.5 R2
      shipped expectation. Expected FAIL, enumerated: whichever of the three modelling
      decisions (freeze, includes, JSX callback) is not yet implemented — round 3 stages them
      one at a time so each failure is attributable.
- [ ] **Step 2.** Implement the three, in that order, recording the shipped site count after
      each: 24 → 2 → 1 (the owning declaration alone). M8/M9 predict those numbers exactly;
      a mismatch is a finding, not a surprise.
- [ ] **Step 3 — GREEN.** Selector ×3 (cluster runs), `pnpm typecheck` baseline-relative.
- [ ] **Step 4.** Verify the selector GREEN at the un-mutated tip; then run K1–K28 through the
      mission harness at its ABSOLUTE path, each with the selector. Record per mutant: the
      failing test-name set, and the `0/1/0` applied/restored counts **as custody, separately
      from outcomes**. Run m6 separately and assert it **survives** (exit 0).
- [ ] **Step 5.** b14 full suite; report `passed/total`, distinct failures, suite-load, skips,
      unhandled, and the name-set difference against `58-r3-b14-full-suite.log`.
- [ ] **Step 6.** Commit.

**Codex review must check:** the three staged shipped counts (24/2/1) against the transcript;
that every §6.7 R2 row's control changed verdict under its mutant; that K11's flatMap row uses
the negative control, not the equivalent one; that m6 is reported as a survival.

### 8.5 R2 — acceptance rows are assigned to exactly one round

| Acceptance block | Round |
|---|---|
| corpus parse gate, parse-context fixtures, parse-failure `INCONCLUSIVE` | 1 |
| address fixtures A1–A11, cardinality, offsets | 1 |
| candidate-level verdicts: §3.11, §3.12, §3.6 rows | 2 |
| site emission, §4 R2 rule-1 discriminator, §5 R2 LoginFlow (completed + truncated), shipped-sites | 3 |
| DEPTH-arm controls (8 spellings, 4 layouts, 3 conjuncts, 2 unrelated, 3 exclusive-six, 5 unrelated-depth, 2 depth-in-reach, §7's three) | present and green in **every** round; they are the regression floor |
| K1–K28 mutants, m6 survival, b14 | 3 |

### 8.6 R2 — day-scale, restated

Round 1 is no longer the risk: the parser is a dependency, not a component, and M6/M7 already
measured its behaviour on this corpus. **Round 2 is now the long round** — the lattice, the
purity gate, the total callback grammar and the ownership walk are all in it. Round 3 is
mechanical apart from the mutant matrix, which is 28 transcripts plus b14 and should be
scheduled as the fixed tail. The dependency grant (round 0) is a hard gate and, if it is going
to be refused, that should be known before round 1 rather than after.


---

## §8 — REVISION 3 (2026-09-06): one four-stage sequence, chosen (answers R2-B5)

> **REVISION 4:** §8.7's record, §8.9's "28 ceiling controls", §8.10's stub claim and §8.12's
> table are **SUPERSEDED** by §8 R4 (R3-B3, R3-B4).

**§8.1–§8.6 R2 are superseded.** codex offered two sequences and told me to choose one rather than
leave it to the worker. **I choose the first: independent restored mutants, with the complete
evaluator in round 2.** The cumulative `26 → 3 → 2 → 1` alternative is not used, and my Revision-2
`24 → 2 → 1` was arithmetically wrong — 24 is the standalone freeze counterfactual, not a stage.

### 8.7 R3 — the typed records the stages trade in

```
interface EvaluatedCandidate {
  readonly start: number; readonly end: number;          // identity
  readonly elementLine: number; readonly statementLine: number;
  readonly consumedStart: number; readonly consumedEnd: number;   // §3.16 R3 span
  readonly value: Value;                                  // §3.16 R3
  readonly verdict: "RULED" | "OTHER" | "UNDETERMINED";
  readonly reason: string;                                // the rule row that decided it
}
```

`candidatesOf` returns `EvaluatedCandidate[]`, empty when the parse fails. Round 1 fills every
field except `value`, `verdict` and `reason`; round 2 fills those. There is no round in which a
test reads a property that does not exist.

### 8.8 R3 — round 0: the dependency and resolution gate

D68 ADDENDUM grants the alias, `package.json`, `pnpm-lock.yaml` and one install. The orchestrator
writes the execution gate (F2); §9.12 R3 lists what this plan needs it to prove.

### 8.9 R3 — round 1: parser, discovery, addresses

**File:** create `tests/support/depthOracle.ts` (+ the oracle test file).

- [ ] **RED, by named parse diagnostics.** Implement `parseModule` with the ScriptKind mapping
      deliberately wrong (`.tsx` → `ScriptKind.TS`) and run the corpus parse gate. Expected FAIL:
      the gate lists `.tsx` files with their diagnostics. **The RED observation is the diagnostic
      list, not a candidate count** — a rejected parse exposes no candidates (R2-B5.2).
- [ ] Correct the mapping. Expected: 232/232, 0 diagnostics (M6).
- [ ] Implement `candidatesOf`'s discovery and address fields, and `domainSites`' `INCONCLUSIVE`
      path. Assert §1 R3's parse-context fixtures, §2 R3's A1–A11 **candidate** rows with their
      literal offsets, and the truncated-fixture `INCONCLUSIVE` block.
- [ ] Migrate the 28 carried ceiling controls to `ceilingSites` (§5.4 R3), positives asserting
      `["DEPTH_BOUND_LITERAL"]`.
- [ ] **GREEN** for §1 R3 and §2 R3 candidate rows. `pnpm typecheck`, baseline-relative. Selector
      containment asserted by count. Commit.

Round 1 changes no DOMAIN verdict: the old emitter still runs. Nothing is left red.

### 8.10 R3 — round 2: the complete evaluator

**File:** modify `tests/support/depthOracle.ts` (+ the test file).

- [ ] **RED, semantic.** Add every §3.14, §3.15 and §3.16 R3 row plus §3.6's original rows as
      assertions on `candidatesOf(...).verdict` / `.value.cells` / `.consumedStart|End`.
      Implement the transfer function as a deliberate stub in which **every operation yields
      `UNKNOWN`**. Expected FAIL: every `OTHER` and `RULED` row, by wrong verdict — a semantic
      failure, not a missing property.
- [ ] Implement §3.13 primitives, §3.9's purity gate, §3.15's operation split and §3.16's walk —
      **including `Object.freeze`, `includes` and the JSX-callback model**, because this round's
      acceptance rows require all three.
- [ ] **GREEN** for every candidate-level row. The site suite still uses the old emitter and is
      untouched. `pnpm typecheck`. Commit.

**Reviewer note corrected:** round 2 rejects callbacks with a **statement other than a single
`return`**; the admitted `{ return e; }` form is eligible. Revision 2's "block-bodied" wording
contradicted §3.9 and is withdrawn.

### 8.11 R3 — round 3: emission, controls, mutations

**File:** modify `tests/support/depthOracle.ts` (+ the test file).

- [ ] **RED, by a named emission defect.** Wire `domainSites` to the candidate table but key the
      site map by `line:kind`. Expected FAIL: A3 emits 1 site where 2 are asserted (§2 R3's
      round-3 row). Then correct the key to `start:end`.
- [ ] Add §4 R2's rule-1 discriminator, §5 R3's nine completed layouts, and the shipped-sites
      assertion. Expected GREEN total: **1** site — the owning declaration (M8/M9: no shipped
      candidate has the ruled distinct set).
- [ ] **The three models are checked by three independent restored mutants**, each against the
      green total of 1: `Object.freeze → UNKNOWN` gives **24**; `includes → UNKNOWN` gives **2**;
      the JSX-callback model removed gives **2**. Each mutant is applied and restored on its own.
- [ ] Selector ×3, `pnpm typecheck` baseline-relative.
- [ ] Run K1–K44 with the selector, each asserting **its own declared observable** (§6.10 R3).
      Run K30 (m5) against the named temporary LoginFlow target with restoration and hash
      evidence. Run m6 separately and assert it **survives** (exit 0).
- [ ] b14; report `passed/total`, distinct failures, suite-load, skips, unhandled, and the name-set
      difference against `58-r3-b14-full-suite.log`. Commit.

### 8.12 R3 — where every acceptance row first runs

| Block | Round |
|---|---|
| corpus parse gate, parse-context fixtures, truncated `INCONCLUSIVE` | 1 |
| A1–A11 candidate rows, offsets, spans | 1 |
| the 28 ceiling controls on `ceilingSites` | 1, and green in every later round |
| §3.14/§3.15/§3.16 R3 and §3.6 rows, as candidate verdicts | 2 |
| A3/A9 **site** rows, rule-1 discriminator, nine completed layouts, shipped-sites | 3 |
| K1–K44, K30/m5, m6 survival, b14 | 3 |

### 8.13 R3 — day-scale

Round 2 is the long round and now contains strictly more than in Revision 2 — the primitive
contract, the operation split and the ownership walk with spans. Round 1 is short. Round 3 is
mechanical apart from ~44 mutant transcripts plus b14, which is the fixed tail. Round 0 is a hard
gate; if its Node 22.23.1 leg cannot be executed, dependent rounds stop rather than proceed on a
Node 25 probe.

**STRENGTH: entailed** for the 24/2/2-against-1 arithmetic (derived from M8/M9's census) and for
the round-2 stub's RED being semantic; **consistent-with** for the sequencing being executable;
**undetermined** for effort.


---

## §8 — REVISION 4 (2026-09-06): the stage records and the floor, corrected in the worker steps (items 3 and 4)

**§8.7's single record, §8.9's "28 ceiling controls", §8.10's stub claim and §8.12's table are
superseded.** codex is right that the floor correction reached §1.9 and §5.4 but never reached the
steps a worker executes.

### 8.14 R4 — §8.7's record, replaced

`EvaluatedCandidate` with three required fields cannot be constructed in round 1 — M18 reproduces
`TS2739` naming `value, verdict, reason`. §1.12 R4's two-record split replaces it:
round 1 produces `DiscoveredCandidate` (four fields, all filled); round 2 produces
`EvaluatedCandidate` (adds the span, value, verdict and reason). **No placeholder is introduced, so
no round-1 assertion can read one as a result.**

### 8.15 R4 — round 1, corrected steps

- [ ] **RED by named parse diagnostics** — unchanged from §8.9 R3 (wrong `ScriptKind`), and it is
      mutation **K23**.
- [ ] Correct the mapping; corpus gate 232/232, 0 diagnostics.
- [ ] Implement `candidatesOf` returning `DiscoveredCandidate[]`, `domainSites`' `INCONCLUSIVE`
      path, and `ceilingSites`.
- [ ] Assert §1 R3's parse-context fixtures; §2 R3's A1–A11 **candidate** rows with literal offsets;
      the truncated-prefix block using §1.13 R4's narrowing form.
- [ ] **Migrate the 27 ceiling controls to `ceilingSites`** — including oracle **952** and **956** —
      positives asserting `["DEPTH_BOUND_LITERAL"]`, and preserving the `kindOf` half of the
      `narrows r3` pair. **The three bare DOMAIN controls stay on the old emitter** and are NOT
      migrated (§5.6 R4); the `WHOLE_DOMAIN` fallback is not removed in this round.
- [ ] **GREEN.** `pnpm typecheck` baseline-relative. Selector containment asserted by count: the
      describe holds **66** instances today; report the actual name/count output rather than the
      static figure.
- [ ] Commit.

### 8.16 R4 — round 2, corrected steps

- [ ] **RED, semantic, with the failing set NAMED** — §1.14 R4. The stub is "every operation and
      wrapper yields `UNKNOWN`". Assert as RED: `[0..5].slice(1)`, `filter(n => n % 2 === 0)`,
      `[0..5].reverse().slice(1)`, `Array.from(new Set([0..5].map(n=>n||1))).slice(1)`,
      `[1,2,3,4,5,6].slice(0,-1)`. Assert as GREEN under the same stub: bare `[0..5]`, bare
      `[1,2,3,4,5,6]`, and the three rule-1 controls.
- [ ] Write the **four O1 controls K48–K51** as assertions in this step, before any transfer rule
      exists (§6.15 R4), together with control-only K7b, K7c, K7d, K20b, K34, K35, K37.
- [ ] Implement §3.13 primitives, §3.17 R4's cells, §3.9's purity gate, §3.15's operation split,
      §3.16 + §3.18 R4's walk — including `Object.freeze`, `includes` and the JSX model.
- [ ] **GREEN** for every candidate-level row. Mutations **K28** and **K38** are first usable here.
- [ ] `pnpm typecheck`. Commit.

### 8.17 R4 — round 3, corrected steps

- [ ] **RED by a named emission defect** — key sites by `line:kind`; fixture A3 emits 1 where 2 are
      asserted. That is mutation **K26**'s edit, staged.
- [ ] Correct the key to `start:end`. **Remove the `WHOLE_DOMAIN` fallback and route the three bare
      DOMAIN controls to `domainSites`** (§5.6 R4) — this round, not earlier.
- [ ] Add the rule-1 discriminator, §5 R3's nine completed layouts, and the shipped-sites assertion.
      Expected GREEN total: **1**.
- [ ] The three models by independent restored mutants against that 1: **24**, **2**, **2**.
- [ ] Selector ×3; `pnpm typecheck` baseline-relative.
- [ ] Run the **40** round-3 mutations of §6.14 R4, each asserting its own declared observable, plus
      the m6 survival. K30 uses the named temporary LoginFlow target with applied/restored `0/1/0`,
      before/after hashes and a final empty porcelain.
- [ ] b14; report `passed/total`, distinct failures, suite-load, skips, unhandled, and the name-set
      difference against `58-r3-b14-full-suite.log`. Commit.

### 8.18 R4 — where every acceptance row first runs, corrected

| Block | Round |
|---|---|
| corpus parse gate, parse-context fixtures, truncated `INCONCLUSIVE` | 1 |
| A1–A11 **candidate** rows, offsets | 1 |
| **27** ceiling controls on `ceilingSites`, both standalone negatives, the `kindOf` half | 1, green in every later round |
| the **3** bare DOMAIN controls, on the OLD emitter | 1 and 2 |
| §3.14/§3.15/§3.16/§3.17/§3.18 R4 rows and §3.6 rows, as candidate verdicts | 2 |
| O1 controls K48–K51 and the control-only entries | 2 |
| the 3 bare DOMAIN controls, on `domainSites` | 3 |
| A3/A9 **site** rows, rule-1 discriminator, nine completed layouts, shipped-sites | 3 |
| the 40 round-3 mutations, m6 survival, b14 | 3 |

**STRENGTH: entailed** for M18's diagnostic, M19's counts and the 66 static instance count;
**consistent-with** that the corrected stages are reachable.

## 9. STRENGTH, unknowns, and the decision this plan cannot make

> **REVISION 2 (2026-09-06):** §9.1, §9.2 and §9.3 are **SUPERSEDED** by §9 R2 at the end of this
> section. §9.1 is closed on disposition (a); §9.4's trace stands and is extended by §9.10 R2.

### 9.1 DECISION ROW — a contradiction between the r3 control corpus and codex r3 B1

The r3 oracle asserts, as a NEGATIVE control (blob 60641339, line 1032):

```
{ spelling: "values unknown, nothing downstream", planted: "const slots = [0, 1, 2, 3, 4, 5].filter(n => n % 2 === 0);" }
```

codex r3 B1 requires, as a POSITIVE:

```
const choices = [0,1,2,3,4,5].filter(n => n > 0);
```

Both are `filter` on `[0,1,2,3,4,5]` with a callback. The first evaluates to `[0,2,4]`, the
second to `[1,2,3,4,5]`. **No analysis that treats filter callbacks as opaque can satisfy
both.** Three dispositions:

- **(a) — RECOMMENDED, and what this plan implements.** Evaluate declared callback
  expressions per element (§3.4). Both controls hold, in their existing polarity, with no
  false positive. Cost: the mini-evaluator, roughly 60–90 lines, shared by `map`, `filter` and
  `flatMap`.
- **(b)** Treat every filter callback as opaque, report conservatively, and RETIRE the r3
  negative control. Cheaper by the mini-evaluator; measured cost on today's corpus is zero
  (M5), but it accepts a permanent false-positive class.
- **(c)** Keep the r3 control and withhold on an opaque filter. **Unsound** — it is exactly
  the miss codex r3 B1 blocks. Recorded to be refused, not weighed.

**This is a contract choice, not a mechanism choice** (heartbeat-architecture §3: contradictions
between requirements go up, they are never quietly reinterpreted). The plan proceeds on (a);
if the reviewer or V prefers (b), only §3.4 and one control change.

**STRENGTH: entailed** that the two requirements conflict (both texts read; both values
evaluated). **consistent-with** the line estimate for (a).

### 9.2 Open unknowns, listed rather than smoothed

| # | Unknown | STRENGTH |
|---|---|---|
| U1 | Whether R-3 as stated makes all 232 files lex. Two files fail today under R-1+R-2. | **undetermined** |
| U2 | Whether `typescript/unstable/ast` resolves inside Vitest as it does under bare Node. The subpath, the files and the `#enums/*` internal map were all verified present, and the repo's own resolver is Vite's, not Node's. | **consistent-with** |
| U3 | Whether `typescript@7.0.2`'s `unstable/` surface survives a future TypeScript bump. No compatibility promise is given; the repo pins the exact version. | **undetermined** |
| U4 | Whether Node 22.23.1 (the repo's declared engine) behaves as Node v25.7.0 did in every probe above. Not tested; codex r3 recorded the same gap. | **undetermined** |
| U5 | `declarationUnits`' inherited limitation — a quote-delimited string closed at a newline can mis-read a regex — still applies to the DEPTH_BOUND_LITERAL arms after this ticket. It is not implicated by any current finding, and re-lexing those arms is not in this ticket's budget. Proposed as a separate follow-up. | **undetermined** |
| U6 | Cross-statement indirection (`const base = […]; const choices = base.slice(1);`) remains outside the grammar and therefore invisible. It was outside r3's too. Declaring it is the point; closing it is not this ticket. | **entailed** that it is out of scope |
| U7 | Whether the `filter`/`map`/`flatMap` callback grammar of §3.4 is wide enough that its `UNKNOWN` fallback never fires on shipped code. Cost today is zero (M5), but that is a property of today's corpus. | **consistent-with** |

### 9.3 Refutation table (heartbeat-architecture §3)

| Section | A concrete failure its acceptance test CATCHES | A failure it does NOT catch |
|---|---|---|
| §1 | a `;` inside a string read as a statement boundary; a regex swallowing a declaration; a driver that loops | wrong line numbers on tokens that lex correctly |
| §2 | two windows disagreeing about one occurrence; a wrapped layout addressed differently from its inline twin | a `}` from an object literal inside the same statement taken as the statement start |
| §3 | every one of codex r3 B1's and B2's measured counterexamples, in both directions; numeric-vs-string `sort` | a chain whose receiver is an identifier, not a literal (U6) |
| §4 | narrowing rule 1 so a bare `[1,2,3,4,5]` stops reporting | a ruled domain assembled across two statements |
| §5 | LoginFlow reporting; a numeric callback wrongly withheld | a numeric callback written outside §3.4's grammar — reports, so visible |
| §6 | a clause implemented but never exercised (each mutant maps to one clause) | that the clause SET is sufficient — B1/B2 are the standing proof it can be incomplete |
| §7 | a ceiling arm changed while the domain arm was replaced; the module scanning itself | a behaviour change in `declarationUnits` that no current control covers (U5) |

### 9.4 SPEC ↔ PLAN trace

| Requirement (packet / D68 / verdict) | Section |
|---|---|
| lexical structure first; strings/templates/regexes are not syntax (r3 B3) | §1 |
| regex-vs-division stated or bounded | §1.2 R-1 |
| existing lexer reused or replaced, with reasons | §1.3 |
| one occurrence, one decision, source correspondence to every window (r2 B2, r3 B3) | §2 |
| declared grammar with real semantics; ordering; terminal selection (r2 B1, r3 B1, r3 B2) | §3 |
| the abstract domain and the rule for every operator | §3.1, §3.3 |
| outside the grammar → undetermined → reported | §3.1, §1.2 |
| the ruled domain reported wherever it sits; `[1..6]` bare is not; `[1..6].slice(0,-1)` is | §4, §3.2 |
| LoginFlow as a MODELLED case, with the proof that `n => n \|\| 1` inside `new Set` stays positive | §5 |
| 27 layout classes + 3 bare controls + 8 mutants as the floor; r3's new classes added | §6 |
| module boundary, size, how the arm is replaced without touching the other two | §7 |
| rounds of ≤ 1 file, RED-first, what each codex review checks, what is day-scale | §8 |
| STRENGTH on every claim; unknowns listed, not smoothed (D67) | throughout, §9.2 |

---


---

## §9 — REVISION 2 (2026-09-06): the disposition, the unknowns, and the universal-claims sweep

> **REVISION 3:** U9 is **SUPERSEDED** (the grant exists). §9 R3 adds the F2 asks, the open-for-V
> residue, and the semantic sweep codex required.

### 9.6 R2 — §9.1's decision row, closed

**Disposition (a) is taken, with B2's and B3's corrections, and the even-filter negative control
is RETAINED.** codex is right that the two filter callbacks are not logically contradictory: a
bounded interpreter over syntax and finite input arrays distinguishes them —
`n => n % 2 === 0` gives `[0,2,4]` and `n => n > 0` gives `[1,2,3,4,5]` (M10). Revision 1 framed
this as a contract choice requiring V; it was not. It was a gap in my own abstraction, and
naming it a contradiction was the more comfortable of the two readings. **Charge that to this
seat.**

What (a) additionally requires, which Revision 1 did not have:

- the purity gate (§3.9 R2) — an *unsupported* callback becomes `UNKNOWN`, never a subsequence
  and never an assumed-pure evaluation;
- explicit work limits — node count and recursion depth, whose exhaustion yields `UNKNOWN`;
- no execution of source callbacks, ever: the interpreter walks syntax over known cells.

**STRENGTH: entailed** for both evaluated values; **consistent-with** for the implementation
recommendation. The Revision-1 "60–90 lines" estimate is **withdrawn** as unverified.

### 9.7 R2 — unknowns, replacing §9.2

| # | Unknown | STRENGTH |
|---|---|---|
| U1 R2 | **Closed.** Superseded: the lexer is gone. M6 measured 232/232 parsed, 0 diagnostics | entailed |
| U2 R2 | Whether the aliased dependency resolves under Vitest as it does under bare Node. codex did not run Vitest, as directed; neither did I | **undetermined** |
| U3 R2 | Whether TypeScript 5.9.3's `parseDiagnostics` property and node shapes survive a future bump. Isolated behind the module; the parse gate and the address fixtures are the dependency-update gates | **undetermined** |
| U4 R2 | Node 22.23.1 behaviour. All probes ran on v25.7.0; codex found no Node 22 runtime installed locally. Round 1 must run its import/parse fixtures under the declared engine before round 2 depends on it | **undetermined** |
| U5 R2 | The inherited `declarationUnits` regex/string desync, now a concrete input (§7.2 R2) rather than a suspicion | entailed that it exists; **undetermined** in extent |
| U6 R2 | Cross-statement indirection: an explicit **discovery exclusion** (§6.4 R2), not "reported" | entailed as scope |
| U7 R2 | The evaluator's false-positive rate on code not yet written. Today's rate is measured and exact (§6.5 R2); the general rate is not | **undetermined** |
| U8 R2 | Whether the callback grammar's `UNKNOWN` fallback fires on future shipped code. It fires on none of today's 33 candidates | **consistent-with** |
| U9 R2 | Whether D-R2-1 will be granted. If not, the ticket is blocked on the lexical architecture | **undetermined** |

### 9.8 R2 — refutation table, replacing §9.3

| Section | A concrete failure its acceptance CATCHES | A failure it does NOT catch |
|---|---|---|
| §1 R2 | a `.tsx` parsed as TS; JSX text read as an array; a parse failure passing silently | a parser that is correct but a candidate finder reading the wrong nodes |
| §2 R2 | ASI mis-addressing; a JSX container mis-addressing; two same-line candidates collapsing to one | a correct address on a wrong verdict |
| §3 R2 | the coercion chain; the receiver-mutating filter; all six ownership cases; string-vs-numeric `sort` | a monkey-patched built-in in the file under scan |
| §4 R2 | rule 1 deleted (`[1..5].map(n => 0)`) | a ruled domain assembled across statements (U6 R2) |
| §5 R2 | LoginFlow reporting; a truncated callback silently withheld | a numeric callback outside the grammar — reports, so visible |
| §6 R2 | `Object.freeze`, `includes` or the JSX rule dropped — each moves the shipped count by a measured amount | that the clause set is complete; K11 is the standing proof this table can be wrong |
| §7 R2 | a ceiling arm changed while the DOMAIN arm was replaced; the module scanning itself | the F1 regex/wrapped-ceiling input, deliberately deferred |
| §8 R2 | a round whose RED is unattributable; a selector narrowed by omission | a mutant that is equivalent for a reason the matrix did not anticipate |

### 9.9 R2 — universal-claims sweep (D67 ADDENDUM), the four codex named

| Universal, as written in Revision 1 | Status |
|---|---|
| "no operation in the grammar turns non-numbers into numbers" (§5) | **RETRACTED.** Refuted by B2's coercion chain, evaluated. Replaced by §3.10 R2's rule: a `NONNUMBER` cell entering arithmetic yields `UNKNOWN` |
| "outside the grammar → undetermined → reported" (Global constraints, §1.2, §3.1) | **RETRACTED as stated**, because Revision 1's sticky `NOT_NUMBERS` and `SUBSEQ` both withheld outside-grammar inputs. Restated two-sidedly: *a candidate whose value is not fully determined by the declared grammar is `UNDETERMINED` and reports; only a candidate proven `NOT_ARRAY`, or proven to hold no `UNKNOWN` cell and a non-ruled set, withholds.* Each side is pinned — K6/K7/K16 the reporting side, K3/K4/K5 the withholding side |
| "measured cost … zero" (§1.2, §7, §9.1(b)) | **RETRACTED.** M5 measured the wrong population. Replaced by §6.5 R2's exact 33-candidate table and the three modelling decisions it depends on. The narrow M5 claims codex allows are kept and labelled |
| "each mutant maps to exactly one clause" / twelve mutants (§6.2) | **RETRACTED.** m4 and m7 were equivalent; m2/m3 targeted deleted code. Replaced by §6.7 R2's K1–K28 matrix, which is explicitly **not** claimed complete |

Three further universals from Revision 1, swept because they depended on retracted premises:

- §2's "the class of defect … is removed rather than managed" — **holds**, but for a different
  reason than Revision 1 gave: it is removed by structural addressing (§2.2 R2), not by deleting
  the merge point alone. Deleting the merge point was necessary and not sufficient.
- §1.2's "today's cost of that rule is zero, because M5 measured exactly one shipped file
  containing a ruled run" — **retracted** with the lexer.
- §7's "cost on today's corpus: zero" for the comment-coverage divergence — **holds**, and is
  one of the narrow claims M5 does prove: the raw grep over all 232 files, comments included,
  returns one line. **STRENGTH: entailed.**

### 9.10 R2 — SPEC ↔ PLAN trace, additions

| Requirement (codex plan review r1) | Section |
|---|---|
| B1 lexical context architecture + successful-token contract + conservative failure | §1 R2 (1.5–1.7) |
| B2 non-sticky sort, total callback results, truthiness, coercion, joins | §3 R2 (3.8, 3.10), §5.1 R2 |
| B3 purity gate; opaque effects → UNKNOWN | §3 R2 (3.9) |
| B4 ownership/binding grammar, consumed spans, rule-1 precedence | §3 R2 (3.12) |
| B5 structural addressing, occurrence identity, exact fixtures | §2 R2 (2.2, 2.3) |
| B6 candidate eligibility, population inventory, exact site list, `includes` | §6 R2 (6.4, 6.5) |
| B7 completed LoginFlow fixtures, floor adaptation, round states | §5 R2 (5.3), §8 R2 |
| B8 clause → non-equivalent mutant → discriminating control | §6 R2 (6.7) |
| F1 inherited ceiling-lexer limit, concretely | §7 R2 (7.2) |
| §9.1 disposition (a) with corrections | §9 R2 (9.6) |
| universals carried into the self-report | §9 R2 (9.9) + self-report |


---

## §9 — REVISION 3 (2026-09-06): grant closed, universals swept, and what goes to V

> **REVISION 4:** §9.12's fact 2 is **SUPERSEDED** by §9.15 R4 — the gate runs under Node 25.7.0
> with "Node 22.23.1 UNVERIFIED" carried as a named fact (D68 ADDENDUM 2).

### 9.11 R3 — D-R2-1 is granted; the stale text is superseded

**§0.8 R2's "That grant does not exist" and "DECISION ROW D-R2-1", and U9 R2, are SUPERSEDED.**
D68 ADDENDUM (09:36 2026-09-06) grants the worker's round 0 exactly one change:
`"typescript-classic": "npm:typescript@5.9.3"` at the root, its lockfile entry, one install, with
the lockfile delta reviewed by codex before merge (D9 ADDENDUM). Root `typescript` stays 7.0.2.
Forbidden mechanisms are unchanged: the TS 7 scanner, and any relative import into `apps/ui` or
`.pnpm`. There is no outstanding permission question. **STRENGTH: entailed** (decision text read).

### 9.12 R3 — what this plan needs F2's round-0 gate to prove

F2 is the orchestrator's to write; these are the five facts the plan depends on, so that a failure
stops rounds 1–3 rather than surfacing inside them:

1. the exact alias resolves from the **root test context** by package name, with root `typescript`
   still 7.0.2 and a reviewed dependency delta containing no unrelated upgrades;
2. an authorised install and a package-name import under **Node 22.23.1**, with Node and pnpm
   versions recorded — a Node 25 probe does not discharge this;
3. a counted Vitest smoke under the repository configuration that imports the alias, checks
   `ts.version`, parses valid TS **and** TSX, confirms `parent` links are set, reads
   `NumericLiteral.text` normalisation (M14), checks a source position, and detects a deliberately
   malformed input through the isolated diagnostic accessor;
4. pre-change selected-test and typecheck diagnostic-name baselines recorded, and no new
   attributable diagnostic after the alias change — the historical eight s14-ui diagnostics are a
   baseline to verify, never an exemption for any eight;
5. the dispatch names the smoke's exact file location, absolute working directory and commands; if
   the declared Node runtime is unavailable, the gate is reported **unverified** and dependent
   rounds stop.

### 9.13 R3 — what remains OPEN after this round, for V

The architecture rounds are exhausted. These are the residues, stated rather than closed:

| # | Open item | Why it is not closed here |
|---|---|---|
| O1 | Five contract clauses have **no discriminating mutation** (§6.11 R3): display/identity separation, signed zero, `??`, `NOT_ARRAY` continuation, multiple-bound-output verdict | each needs a mutation whose observable I could not name without inventing an implementation edit; codex's standard is a precise edit, not a plausible one |
| O2 | The mixed-array counterfactual "adds exactly ten sites" | needs the changed pipeline measured, not ten discovered nodes (codex); K28 uses a planted fixture meanwhile |
| O3 | Alias resolution under Vitest, and everything under Node 22.23.1 | executable only in round 0; no architecture round may run it |
| O4 | The evaluator's false-positive rate on code not yet written | today's population is exact (33 candidates, 0 expected DOMAIN); the general rate is not a plan-provable quantity |
| O5 | F1's inherited `declarationUnits` regex defect | deliberately deferred; the ceiling arms are pinned during extraction by §1.9 R3's `ceilingSites` |

### 9.14 R3 — semantic universal sweep over the revised text

Run as a recheck, not a listing, on the three phrases codex named and on the rest of the Revision-3
text.

| Universal | Verdict |
|---|---|
| "every in-grammar pure callback is evaluated exactly" (§3.8 R2) | **RETRACTED** in §3.13 R3. Admission is not exactness: an admitted callback yields `unknown` for any value it cannot decide |
| "every callback" — anywhere it implies totality of evaluation | replaced by: *every admitted callback is evaluated over the §3.13 R3 grammar; anything undecided is `unknown`, which reports* |
| "cover every clause named in §1–§5 R2" (§6.7 R2) | **RETRACTED.** §6.11 R3 is an inventory with **five named gaps** |
| "each mutation changes verdict" (§8.4 R2) | **RETRACTED.** §6.10 R3 gives each row one of five observables; K25 changes a line, K23 a diagnostic, K26 a cardinality |
| "exact measured rate" / "measured cost … zero" | already retracted in §9.9 R2; §6.12 R3 further downgrades the ten-site counterfactual to **undetermined** |
| "outside the grammar → undetermined → reports" | still two-sided as restated in §9.9 R2, and R2-B2 showed my `NOT_ARRAY` list violated it again. §3.15 R3's continuation rule is the repair; the claim holds only with that rule attached |
| "no operation turns non-numbers into numbers" | retracted in §5.1 R2; §3.13 R3's unary `+x` on a `str` is a modelled case that **does** produce a number, exactly, which is why it is a control |
| "the plan contradicted itself" (§3 R3's own R2-B1 note) | not a universal; kept |
| "28 rows are 28 transcripts" (implied by §8.4 R2) | **RETRACTED**: K23/K24 were one mutation; the row count is now derived from §6.11 R3's inventory, and rows are not transcripts |

**Two claims in the Revision-3 text were weakened by this sweep before handoff:** §5.4 R3's
"the completed nine parse" is labelled **consistent-with** rather than entailed (they are completed
from source that parses, but the completed strings themselves were not parsed this round), and
§6.11 R3's per-row discrimination is **consistent-with**, with the five gaps named in the same
table rather than in a footnote.

**STRENGTH: entailed** for each retraction's cause (all measured this round or in r2's verdict);
**consistent-with** for the replacements.


---

## §9 — REVISION 4 (2026-09-06): the Node fact, and the residual after this round

### 9.15 R4 — §9.12 fact 2, corrected (D68 ADDENDUM 2)

**§9.12 R3's fact 2 is superseded.** It required an install and import "under **Node 22.23.1**". V
accepted the round-0 gate under the runtime this machine has, and made the shortfall a named
carried fact. The replacement, in D68 ADDENDUM 2's own words:

> **Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under
> Node 25.7.0 only.**

Fact 2 now reads: *an authorised install and a package-name import from the test context, with the
Node and pnpm versions actually used recorded verbatim in the transcript.* The versions used by every
probe in this plan are **Node v25.7.0** and **pnpm 11.20.0**; the repository's `engines.node` is
`22.23.1`. **No seat may describe the gate as discharged for 22.23.1**, and the sentence above is
carried in the round-0 packet, in every dependent round's packet and in every review packet for this
lane. Facts 1, 3, 4 and 5 of §9.12 R3 are unchanged — codex asked that none be removed.

The corresponding line in §8.13 R3 ("if its Node 22.23.1 leg cannot be executed, dependent rounds
stop") is narrowed: dependent rounds stop if the gate's **other** evidence is unavailable; the
runtime shortfall itself is accepted and carried, not a stop condition.

**STRENGTH: entailed** (D68 ADDENDUM 2 read; the probe versions are the ones this session ran).

### 9.16 R4 — the residual after this round

The five bounded items are answered: §3.17 R4 (primitive payload, total `Cell→Prim`, Set equality),
§3.18 R4 (callee role), §1.12–§1.14 R4 (type-valid records, site union, named stub RED set),
§5.5–§5.6 R4 + §8.15–§8.18 R4 (27 + 3, both standalone negatives, routed by round), and §6.13 R4
(the operative manifest, 45 mutations + 1 survival). What remains is unchanged from §9.13 R3 except
where this round moved it:

| # | Item | Status after Revision 4 |
|---|---|---|
| O1 | four semantic clauses without discriminators | **closed** — K48–K51, written in round 2 before implementation |
| O1b | display/identity separation | **named follow-up**, with compulsory exact `text`/`line`/`start`/`end` and A3 cardinality assertions |
| O2 | the mixed-array counterfactual | **closed as a claim** — K28 uses a planted fixture; the corpus counterfactual is withdrawn |
| O3 | alias resolution under Vitest; Node 22.23.1 | **carried**, per §9.15 R4. The alias is currently absent and resolves `MODULE_NOT_FOUND` |
| O4 | false-positive rate on future code | **carried** — not a plan-provable quantity |
| O5 | F1's inherited `declarationUnits` regex defect | **carried** as a separate follow-up; ceiling arms pinned by `ceilingSites` |
| O6 | **new** — no total of uncovered contract clauses is certified | §6.16 R4: the manifest is the coverage; the "five uncovered clauses" count is withdrawn |

**STRENGTH: entailed** for what each item's disposition rests on; **undetermined** for O3–O6.

### 9.17 R4 — semantic universal sweep over the Revision-4 text

| Universal | Verdict |
|---|---|
| "`Cell → Prim` is total" | holds by construction — the six primitive constructors are identity, `jsx` maps to itself, `arr` maps to `unknown`; every constructor has a case |
| "there is no lossy abstraction step any more" | holds for `Cell`↔`Prim`; it does **not** mean the evaluator is lossless — `arr → unknown` on a callback parameter is a deliberate loss, and it reports |
| "every mutation is applied and restored individually" | a procedure requirement, and m6 is the one row whose expected outcome is survival |
| "the manifest above is the coverage" | intended two-sidedly and stated so in §6.16 R4: nothing outside it is covered, and no total of what is outside is claimed |
| "MUTATION rows: 45" | **recounted from the table before filing**; the first draft said 41 because a range shorthand dropped ids. Now enumerated, not described |
| "27 + 3 = 30" and "66 instances" | recounted from the oracle blob this round (M19) |
| "every row that has at least one operation or wrapper AND expects RULED or OTHER" (§1.14 R4) | the stub's failing set, stated as a rule with named members rather than as "every OTHER and RULED row" — the Revision-3 overstatement codex charged |

**STRENGTH: entailed** for the two recounts; **consistent-with** for the rest.

## Appendix — commands

```
# from <worktree>/dialectical-engine
pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source"
pnpm typecheck                       # tsc --noEmit; covers tests/**/*.ts
pnpm exec vitest run                 # b14 full suite
# mutants: <MISSION DIR>/tools/mutate.sh — MISSION-relative, and it runs its
# discriminating command from the LANE ROOT, so wrap it:
#   bash -c 'cd dialectical-engine && pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "…"'
# (both traps are recorded in dialectical-engine/.hermes/TOOLING-TRAPS.md)
```

### Appendix — REVISION 2 (2026-09-06)

```
# round 0 (needs decision row D-R2-1 — see §0.8 R2): add to dialectical-engine/package.json
#   "devDependencies": { "typescript-classic": "npm:typescript@5.9.3", … }
# then one `pnpm install`, lockfile diff reviewed. The module imports `typescript-classic`.
# NEVER: a relative path into apps/ui/node_modules, or any path under node_modules/.pnpm.

pnpm exec vitest run tests/unit/s1-1-depth-contract.test.ts -t "the depth bound has a single source"
pnpm typecheck        # report DELTA against the recorded 8-diagnostic s14-ui baseline, not an absolute
pnpm exec vitest run  # b14
# mutants K1–K28 + the m6 survival check: <MISSION DIR>/tools/mutate.sh (absolute; runs from the LANE ROOT)
```

**STRENGTH: entailed** that the root `typescript` specifier resolves to 7.0.2's version shim and
therefore cannot serve this design; **consistent-with** that an aliased devDependency is the
cleanest grant shape.

---

**Architecture rounds: 3 of 3, plus one V-authorised bounded round (AMENDMENT 3).** The residual
after Revision 4 is at §9.16 R4; the plan's disposition is V's.

`comments read through: t1-oracle-evaluator-plan-codex-r3-2026-09-06`

PLAN READY FOR REVIEW
