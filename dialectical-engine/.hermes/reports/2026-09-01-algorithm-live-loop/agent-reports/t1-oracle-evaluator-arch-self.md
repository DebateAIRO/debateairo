# SELF-REPORT — ARCHITECTURE seat · F-T1-ORACLE-EVALUATOR (V-ruled, D68)

`SKILLS LOADED: heartbeat (Skill tool), heartbeat-protocol router (read as markdown — the loader
resolved DE and I read the file), heartbeat-architecture (read as markdown; the Skill tool
returned "Unknown skill: heartbeat-architecture"), superpowers:using-superpowers (Skill tool),
superpowers:brainstorming (Skill tool), superpowers:writing-plans (Skill tool).`

`comments read through: t1-oracle-loginfp-codex-r3-2026-09-06`

The question, verbatim:

> treat it like a murder case. I want to get a nice report on what can be done better. What we
> must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient.
> How can we turn this into a one prompt machine even better.

---

## The body: what actually died

Three rounds of work on lane/t1-oracle-loginfp, six seat-runs (worker ×3, codex ×3), and the
lane does not land. Every round was competent. Every round was green on every control that
existed when it was written. Every round was refuted within one review by a class of input
nobody had written down.

**Cause of death — there was never a specification, only a sequence of rules.**

- r1's rule: anchor the pattern so the ruled run cannot match inside a longer one.
- r2's rule: branch on what the FIRST operation on the literal is.
- r3's rule: simulate a small grammar, and withhold when the values are unknown and the
  operation is TERMINAL.

Each is an answer. None of them is an answer to a stated question. The question — "what domain
does this declaration DEFINE?" — appears for the first time in r3's own comment block, after
two rounds were already spent, and even there it is stated in prose beside a rule that
contradicts it (position decides). **A rule you can state without stating the decision problem
is a rule you cannot refute in advance, so the reviewer refutes it in arrears, one class per
round, at a full round each.**

Price, from the artifacts: 3 worker rounds, 3 codex verdicts totalling ~90KB of prose
(27,755 + 25,760 + 37,019 bytes), 3 full b14 suites at roughly 48 minutes each (r3's ran
22:45→23:33 by log mtime), 14 mutant transcripts, and a V DECISIONS row. **STRENGTH: entailed**
for the sizes and counts (read from `ls` and the verdicts); **consistent-with** for the suite
duration (inferred from file mtimes, not from a timer in the log).

---

## What repeatedly cost tokens

### 1. The predicate under review lives inside a 1,173-line test file

The scanner is ~250 lines buried in `tests/unit/s1-1-depth-contract.test.ts` (714 lines at
2af816f1, 1,173 at 60641339). Every seat that touches it — the worker three times, codex three
times, me once — must either read the whole file or grep blind for the boundaries. codex's own
method line, repeated verbatim in all three verdicts, is *"extract `type DuplicateKind =`
through the start of `function shippedSourceFiles()`"*. That sentence is a tax, and it was paid
six times.

**Upgrade:** a predicate that is the SUBJECT of review does not live inside a test file. The
repo already has the pattern — `tests/support/t16PolicyScanner.ts`, 121 lines, a pure function
over `(path, source)` pairs, imported by its test. §7 of the plan moves the oracle to it.
**STRENGTH: entailed** (both files read).

### 2. Every reviewer rebuilt the same throwaway harness

codex r1 invented the source-only harness (git blob → `stripTypeScriptTypes` →
`data:text/javascript` import). r2 rebuilt it. r3 rebuilt it. `.hermes/TOOLING-TRAPS.md` now
records it as a good idea, which it is — but it exists ONLY because the scanner is not
importable. Make it a module and the harness collapses to one import line, and Node's native
type stripping means a reviewer can run `node` against the `.ts` module directly.

**This is the same defect as #1, seen from the reviewer's side.** One fix retires both.

### 3. The specification's negative space is prose, and prose has to be re-read

To write this plan I read three verdicts, two versions of the oracle, the ticket, D68, the V row
and the traps append — call it 120KB — in order to recover about 40 lines of actual content:
a list of `(input, evaluated value, expected verdict, finding id)`. That list is what the next
seat needs. It is not what the next seat gets.

**Upgrade — the single highest-leverage change I can name from this ticket:** a verdict that
names counterexamples SHALL also emit them as a fixture at a fixed path, e.g.
`logs/<lane>/counterexamples.tsv` with columns `finding | input | evaluated | expected`. The
next seat imports the corpus instead of re-deriving it from paragraphs, and the corpus becomes
the RED evidence for the next round automatically. **The negative space should be a fixture,
not an essay.**

### 4. I re-evaluated twenty expressions that codex had already evaluated

I did it because the alternative was copying numbers out of prose into a plan that a worker will
implement against — and an unread value is an invented value. Twenty expressions, one node
command, ninety seconds. It confirmed codex exactly. It should not have been necessary: see #3.

---

## What I nearly got wrong

**Near-miss 1 — I nearly planned against a parser that does not exist.** The packet says
*"`typescript` is in the repo's dependencies — say whether it is available to tests and what it
costs"*, which reads as an invitation to use the classic compiler API. Reading
`node_modules/typescript/package.json` took ninety seconds and showed `typescript@7.0.2` — the
native port. Its ROOT export is `lib/version.cjs`, which exports `version` and
`versionMajorMinor` and nothing else. There is **no in-process JS parser**: `dist/ast/` ships a
scanner, the AST types, `is`/`visitor`/`clone`, and a `createSourceFile` that is a node FACTORY,
not a parser; real parsing goes through `dist/api/sync/client.js`, which spawns the native Go
executable. Had I written the plan on the packet's framing, round 1 would have died on
`import ts from "typescript"` returning `{ version }`.

**The lesson generalises: a dependency named in a packet is a claim about a NAME, not about an
API.** Verify the export surface before planning against it. **STRENGTH: entailed.**

**Near-miss 2 — I nearly wrote "TypeScript's scanner solves codex r3 B3" and stopped.** It does
solve the literal cases: I confirmed `/[//]/` lexes as one `RegularExpressionLiteral` and the
`;` in `(";", [0,1,2,3,4,5])` lexes as a `StringLiteral`. But driving that scanner correctly is
its own problem, and eight probe commands found three defects in one sitting:

1. regex-vs-division needs a previous-token rule and `reScanSlashToken`;
2. template substitutions need a brace stack and `reScanTemplateToken`;
3. JSX self-closing `/>` is re-scanned as an unterminated regex — LoginFlow.tsx shows 4 of them
   (lines 184, 201, 250, 278) — and a `}` closing a JSX expression container is
   indistinguishable from one closing a template substitution without JSX context: **2 of the
   232 shipped files do not terminate** under a driver that lacks it
   (`apps/ui/components/EvaluatorDevMenu.tsx`, `apps/ui/components/RecommendedInvestigations.tsx`).

Cost of probing: about fifteen minutes. Cost of not probing: a plan that promises the worker a
lexer that does not exist, and a round 1 that overruns invisibly. **STRENGTH: entailed** — each
number came out of a command, not a guess.

**Near-miss 3 — I nearly let a contradiction through in the control corpus.** The packet's floor
includes r3's negative control `[0,1,2,3,4,5].filter(n => n % 2 === 0)` AND codex r3 B1's
required positive `[0,1,2,3,4,5].filter(n => n > 0)`. Both are `filter` on the same array with
an opaque callback. **No analysis that treats filter callbacks as opaque can satisfy both.** It
is now §9.1 of the plan as an explicit decision row with three dispositions and a
recommendation, rather than a surprise in round 3.

---

## Dead ends — recorded so nobody re-derives them

| Dead end | Why it is dead |
|---|---|
| `typescript/unstable/sync` for parsing | spawns the native Go binary and needs an LSP-shaped snapshot session; kills the one-second pure-function probe harness |
| `resetTokenState(at); scan()` as the revert after a failed regex re-scan | does not advance; use `resetTokenState(at + 1)` and synthesise the `SlashToken` |
| a template-brace stack without JSX context | non-terminating on `.tsx`; two named files |
| "the FIRST operation decides" (r2) | trailing comma, `["slice"]`, `as const`, and a later narrowing all defeat it |
| "unknown AND terminal ⇒ withhold" (r3) | selection happens INSIDE `filter`/`flatMap`/`splice`; position is not evidence |
| an anchored `WHOLE_DOMAIN` regex (r1) | refuted twice: a longer literal can derive the domain, and one reporting window is a truncated line |
| suppression inside a window's predicate | already in TOOLING-TRAPS; `record` only ever ADDS |

---

## Where the packet was unclear, exactly

1. **"worker rounds of at most one file each with RED-first acceptance"** (§8). RED lives in the
   test file; the implementation lives in the module; no round can touch one file. I put both
   readings in the plan rather than guess. The packet should say "one IMPLEMENTATION file per
   round".
2. **"`typescript` is in the repo's dependencies"** (Method). Names a package, not an entry
   point. Cost: four probes. Packets naming a dependency should name the entry point and the
   version.
3. **"the 27 layout classes and eight mutants are the floor"** (§6). Two of those eight (m2
   comment-blanking, m3 unknown-always-terminal) test clauses that a sound design DELETES. A
   floor that mandates mutants for code that must not exist is a contradiction; I resolved it
   by mapping them to m2′/m3′ and saying so. Mutant sets should be specified as **coverage over
   clauses**, never as a list of names.
4. **The §9.1 contradiction was inside the packet's own floor and was not flagged.** That is the
   "verify the allowed list can reach the stated outcome" habit applied to controls rather than
   to file grants.
5. **No probe budget.** The packet says "no code, no suites, read only". I ran eight read-only
   probes — value evaluation, package inspection, corpus greps and lexer measurements — because
   the alternative was inventing numbers for a plan a worker will implement. That tension should
   be settled in the packet text: *"read-only probes are permitted; name them in the handoff"*.
   Otherwise seats either guess or transgress quietly, and both are worse than the transgression
   being licensed.

---

## What we must upgrade — ranked by leverage

1. **Counterexample fixtures, not prose verdicts** (`logs/<lane>/counterexamples.tsv`). Turns a
   90KB re-read into an import, and makes the next round's RED automatic.
2. **A SPECIFICATION ROUND before implementation rounds, on any oracle ticket.** The controls
   ARE the spec. Write them, review them, and only then write the code. This ticket reached that
   shape only after three rounds and a V ruling; it should be the default for anything whose
   output is a verdict.
3. **The reviewed predicate is a module, never a test-file interior.** Repo convention; the
   precedent already exists.
4. **Packets that name a dependency name its entry point and pinned version.**
5. **Mutant sets specified as clause coverage.** "One mutant per clause of the design, named"
   survives a redesign; a list of eight mutant names does not.
6. **An explicit probe licence for planning seats.**

---

## How to make the coding more efficient — the one-prompt machine

The unit that should reach a worker is not "a ticket plus three verdicts". It is:

> a fixture of `(input, evaluated value, expected verdict, finding id)`
> **+** a plan whose sections map one-to-one onto that fixture
> **+** one sentence naming the decision problem and the abstraction that decides it.

Both of the first two now exist for this ticket. Neither existed for any of the three rounds
that failed. The third is the cheapest and the one that would have prevented all of it:

> **Decision problem:** what domain does this declaration DEFINE?
> **Abstraction:** an ORDERED value list plus an element SORT, evaluated through a declared
> grammar, with `undetermined` reported.

Fourteen words of abstraction. Every one of the six blocking findings across three rounds is a
consequence of not having them: B2 needed *ordered*, B1 needed *sort* (and the absence of any
position rule), B3 needed the evaluation to start from tokens rather than text.

**The self-check to institutionalise:** before writing a fix to any classifier, state the
decision problem in one sentence and the abstraction that decides it. If you cannot, you are
about to write a rule, and a rule will be refuted one class at a time, at one round each.

---

## Contract compliance

Wrote exactly the two allowed files:
`agent-reports/t1-oracle-evaluator-plan.md` and `agent-reports/t1-oracle-evaluator-arch-self.md`.
No worktree created, no pnpm, no git mutation, no board or DECISIONS edit, no credential value,
no code written to the repo, no suite run. Probe scripts were written to the session scratchpad
outside the repository. The lane worktree and `node_modules` were read only.

**STRENGTH: entailed** for every measurement attributed to a command in this report and in the
plan; **consistent-with** for effort and duration estimates; **undetermined** for U1–U5 and U7
of the plan's §9.2, which are listed there rather than smoothed.

---

# REVISION 2 — 2026-09-06, after codex PLAN review r1

`SKILLS LOADED (round 2, unchanged): heartbeat (Skill tool) · heartbeat-protocol router (markdown) ·
heartbeat-architecture (markdown; the Skill tool does not know it) · superpowers:using-superpowers ·
superpowers:brainstorming · superpowers:writing-plans (all three by Skill tool).`

`comments read through: t1-oracle-evaluator-plan-codex-r1-2026-09-06`

**Eight blocking findings. I reproduced all eight before revising and argued none of them down.**
That is the honest headline, and the rest of this section is why a plan I believed was careful
was wrong in eight places.

## The new body: my own near-miss, missed

Revision 1's self-report contains this sentence, which I wrote:

> "The lesson generalises: a dependency named in a packet is a claim about a NAME, not about an
> API. Verify the export surface before planning against it."

I verified the export surface. I did not verify the **search path**. I read the root
`package.json`, found `typescript@7.0.2`, established it has no in-process parser, and concluded
the repository had no parser available. It has one: **TypeScript 5.9.3, complete classic API,
at `apps/ui/node_modules/typescript`** — declared in `apps/ui/package.json`, which I had already
opened and read in the same command that showed me the root version. codex found it; I had it on
screen and did not look.

**Cost: the entire lexical architecture of Revision 1** — §1 in full, and B1 and B5 with it.
Two of the eight blocking findings exist only because of that one omission.

**Cause, named:** in a pnpm workspace, "is dependency X available?" is not one question. I asked
it once, at the root, and treated the answer as global. **STRENGTH: entailed** — `require.resolve`
from the root returns 7.0.2's version shim; from `apps/ui` it returns 5.9.3 with
`createSourceFile`, and I measured both this round in a single command.

## The deeper defect: I probed for capability, not for error

Revision 1's self-report is pleased with itself about probing:

> "Cost of probing: about fifteen minutes. Cost of not probing: a plan that promises the worker a
> lexer that does not exist."

I probed, and I still shipped a lexer that does not work. My eight probes all asked **"can the
scanner do X?"** — can it lex a regex, a template, the corpus. Every answer was yes, and every
yes was true. codex's probe asked a different question — **"what does this scanner get WRONG?"** —
and immediately found `if (ready) /[//]/.test(text); const choices = [1,2,3,4,5];` reaching clean
EOF with the array silently gone.

**A capability probe cannot fail in the direction that matters.** My "termination + no
unterminated token + positions advance" gate is a check that cannot fail for the reason it exists
— D56, committed by the person who quoted D56 twice in the same document.

**The rule I would institutionalise from this alone:** every probe states, before it runs, the
observation that would REFUTE the design. If you cannot name one, you are measuring capability
and you will report it as correctness. **STRENGTH: consistent-with** as a generalisation;
**entailed** that this specific probe set had no refuting observation in it.

## Escalating a gap as if it were a contradiction

Revision 1's §9.1 sent V a decision row: r3's negative control `filter(n => n % 2 === 0)` versus
codex's required positive `filter(n => n > 0)`, framed as "no analysis that treats filter
callbacks as opaque can satisfy both".

The premise was mine. Nothing required filter callbacks to be opaque — a bounded interpreter over
finite arrays distinguishes them, which is what codex said and what the revision now does. I took
a hole in my own abstraction, wrapped it in the language of a contract conflict, and sent it
upward with three dispositions and a recommendation.

**It looks like diligence. It is offloading.** The tell is that the "contradiction" dissolved the
moment the abstraction improved — a real requirements contradiction does not. **Charge it to this
seat**, and the check before any future escalation is: *is this a conflict between two
requirements, or between one requirement and my current design?* Only the first goes up.
**STRENGTH: entailed** — codex resolved it without changing either requirement.

## Carrying a "floor" without reading its bytes

The packet said the 27 layout classes are the floor. I carried them, cited their line numbers,
and built §5's whole proof on top of them. Five of them end at:

```
                  {[0, 1, 2, 3, 4, 5].map((slot) => (
```

**There is no callback body in the fixture.** My §5 rule decides on the callback body. The
controls I called the proof of my rule cannot exercise it, and preserving them as negatives would
have carried forward an exemption nothing proves. I read those lines — they are in my Revision-1
transcript — and I read them as "the LoginFlow layouts" rather than as bytes an assertion runs on.

**Rule:** a control carried forward as a floor is read as *what it asserts*, not as *what it is
called*. Cost: B7, and a §5 that could not have worked. **STRENGTH: entailed** (fixture bytes read
at 60641339, lines 1047–1052).

## The universals I asserted, retracted

D67 ADDENDUM's `universal-sweep.sh` lists universally quantified sentences; codex's note is exact —
"text listing does not replace this semantic recheck". I ran the listing and did not run the
recheck. Four retractions, all carried into the plan at §9.9 R2:

| What I asserted | Why it was false |
|---|---|
| "no operation in the grammar turns non-numbers into numbers" | `[0..5].map(n => `${n}`).map(n => n * 1).slice(1)` is `[1,2,3,4,5]`. Both steps were inside my own declared grammar. Numeric coercion, which I never considered |
| "outside the grammar → undetermined → reported" | false under my own transition table: sticky `NOT_NUMBERS` and `subsequenceOf` both **withheld** outside-grammar inputs |
| "measured cost … zero" | M5 counted raw text runs. The evaluator's population is array-literal expressions: **33 candidates in 6 files**, of which **23** sit behind `Object.freeze`. Unmodelled, that is 23 shipped false positives |
| "each mutant maps to exactly one clause" | m4 and m7 are **equivalent** under my own evaluator, and m2/m3 targeted code the design deletes |

Every one of these is a sentence I could have refuted with an example I was capable of
constructing. **STRENGTH: entailed** for all four (values evaluated; census measured this round).

## What repeatedly cost tokens — additions

1. **Resolving a dependency at one point in a workspace.** One command, run from the wrong
   directory, cost a plan round. Upgrade: for any dependency decision in a pnpm workspace,
   resolve from the root **and** from each workspace package, and record the table.
2. **Prose counterexamples, again.** codex's verdict supplied roughly twenty expressions in
   paragraphs; I re-evaluated all of them to get values I could put in a table. This is the
   second round in a row this cost was paid, and Revision 1's self-report already proposed the
   fix (`logs/<lane>/counterexamples.tsv`). It was not adopted between rounds, so it was paid
   twice. **STRENGTH: entailed** — the same work appears in both my transcripts.
3. **A 1,816-line plan is now itself a re-read cost.** Revising in place preserves the record and
   the reviewer's citations, which is right, but the next reader needs the Revision-2 index at
   the top to avoid reading superseded design as current. That index exists; without it the
   in-place convention would have made the third round more expensive than the second.

## What we must upgrade — revised ranking

1. **Counterexample fixtures, not prose verdicts.** Unchanged from Revision 1, now with a price
   attached: paid twice, in consecutive rounds.
2. **Every probe declares its refuting observation before it runs.** This is the one that would
   have prevented B1, and it is cheap.
3. **Dependency resolution is a table over the workspace, not a lookup at the root.**
4. **A floor control is read by its assertion, not by its name.**
5. **Gap versus contradiction, decided before escalation.**
6. **The universal sweep is a semantic recheck, and the listing tool is only its index.** The
   tool lists; the author must then try to refute each sentence. I did the first half.

## One-prompt machine — what this round changes

Revision 1 proposed the handoff unit: a counterexample fixture, plus a plan mapping onto it, plus
one sentence naming the decision problem and its abstraction. That still holds. This round adds
the missing half: **the abstraction sentence must come with the observation that would refute it.**

> **Decision problem:** what domain does this declaration define?
> **Abstraction:** ordered cells, each numeric / non-numeric / unknown, recomputed by every
> operation, over a parsed syntax tree.
> **Refuted by:** any expression whose native value is `[1,2,3,4,5]` that the abstraction
> withholds, or any whose native value is not, that it reports.

That third line is what I did not write in Revision 1. Had I written it, the coercion chain and
the mutating filter were both within reach of ten minutes with `node -e`, because that line tells
you exactly what to go looking for. Eight blocking findings, and the cheapest instrument that
would have found most of them is one sentence stating how to be wrong.

## The semantic recheck, run on my own new text

Having written that the universal sweep must be a semantic recheck and not a listing, I ran it
that way on the Revision-2 blocks before handing off. It found **three** overreaches of my own,
all now corrected in the plan:

1. **"Every row's mutant is non-equivalent"** at the head of the K1–K28 matrix — the exact claim
   codex refuted for m4/m7 one round earlier, restated with 28 rows instead of 12. The predictions
   are reasoning over rule tables, and K11 in the same table is a worked case of that reasoning
   producing an equivalent mutant. Relabelled **consistent-with**, with a row that fails to
   discriminate declared a finding against the matrix rather than a passing mutant.
2. **"exactly one parameter … this alone excludes every receiver-mutating body"** — clause 1 of
   the purity gate excludes receiver access through the third argument. Excluding *mutation*
   comes from clauses 2 and 3 together. The exclusion is the conjunction; I credited one clause
   with the work of three.
3. **"None [of the ten mixed arrays] can yield {1,2,3,4,5}"** — that is a reading of ten
   expressions, not an evaluation of them. Relabelled **consistent-with**; the inventory and the
   counts stay entailed.

I record this because the first one matters more than the other two: **the retraction I had just
written did not stop me from committing the same class of error twenty pages later.** Naming a
defect does not immunise you against it; only the recheck does. **STRENGTH: entailed** — all three
edits are in the plan at §6.7 R2, §3.9 R2 and §6.4 R2.

## Contract compliance, round 2

Wrote the same two allowed files: the plan (revised in place, originals preserved and
banner-marked superseded) and this self-report. No worktree, no pnpm, no install, no git
mutation, no board or DECISIONS edit, no source edit, no credential value, no code written to the
repository. Probe scripts were written to the session scratchpad, outside the repository; the
lane worktree, `node_modules` and `apps/ui/node_modules` were read only. The dependency change
the plan recommends is **not** made here — it is decision row D-R2-1 for the orchestrator.

**STRENGTH: entailed** for every measurement attributed to a command in this report or in the
plan's M6–M10; **consistent-with** for the generalised lessons; **undetermined** for U2–U4, U7 and
U9 of the plan's §9.7 R2, which are listed there rather than smoothed.

---

# REVISION 3 — 2026-09-06, after codex PLAN review r2 · LAST architecture round

`SKILLS LOADED (round 3, unchanged): heartbeat (Skill tool) · heartbeat-protocol router (markdown) ·
heartbeat-architecture (markdown) · superpowers:using-superpowers · superpowers:brainstorming ·
superpowers:writing-plans (Skill tool).`

`comments read through: t1-oracle-evaluator-plan-codex-r2-2026-09-06`

**Six blocking findings, all reproduced before revising, none argued down.** Three architecture
rounds, twenty-one blocking findings in total (8 + 6 on the plan, after three on the code). The
architecture is now sound enough that the reviewer retained it; the defects were all in the
contract I wrote around it.

## The body this round: I contradicted myself in writing, and defended it for a round

R2-B1 is the one that matters. My Revision-2 §3.10 table said a comparison yields `NONNUMBER`, and
that `NONNUMBER` truthiness is `UNKNOWN`. My Revision-2 §3.11 table said
`filter(n => n % 2 === 0)` produces exact cells `[0,2,4]`. **Both are in the same section, eleven
lines apart, and they contradict each other.** Following the rules, that filter is `UNKNOWN` and
reports; the even-filter control — the one I had spent the whole of round 2 arguing did not need to
be retired, and charged myself for having proposed retiring — was unreachable in the design I
shipped to defend it.

**Cause, named:** I wrote the transition table and the worked-example table as two separate
artifacts and never executed one against the other. A worked example is not a check unless
something derives it from the rules. Every row of §3.11 R2 was hand-computed from what I *meant*
the rules to say.

**The cheap instrument I did not use:** take each worked row, and walk it through the table by hand
in the opposite direction — rules first, answer second. Three rows would have exposed it. Cost:
one blocking finding and a round.

## Re-committing a defect while fixing it

R2-B2 is worse than a miss. Revision 1's central error was `NOT_NUMBERS` absorbing through
operations that could still produce numbers. I fixed that, wrote it up as the headline correction,
and in the same table introduced `reduce`, `find`, `at` and indexing as unconditional `NOT_ARRAY` —
**the identical absorption bug under a new state name.** codex's four suffixes all natively return
`[1,2,3,4,5]`; I verified all four.

`reduce` returns its accumulator, which can be an array. `find`/`at`/`[0]` return an element, and an
element can be an array. I classified by *method name* when the return contract depends on
*element contents*. That is the same category error as classifying by *position* — the error this
whole ticket exists to remove — committed a third time, in a third vocabulary.

**Rule I would institutionalise:** when a design has a "provably not X" state, every member of the
list that assigns it must be justified by a *type-level* argument, one at a time, in writing. Not a
list. `includes` earns it (boolean, always). `find` does not. I wrote the list.

## What the honest tally says

| Round | Findings | Class of my error |
|---|---:|---|
| plan r1 | 8 blocking | searched one resolution point; probed for capability, not error; escalated a gap as a contradiction; carried a floor without reading its bytes |
| plan r2 | 6 blocking | table contradicted its own worked rows; absorption re-committed under a new name; ownership walk stopped at an unmodelled call; fixture floor and failure policy demanded incompatible outputs; staged counts wrong; matrix rows equivalent |

The second row is not a different kind of mistake from the first. **Every one of them is "I wrote a
specification and did not execute it against its own examples."** The parser choice — the one thing
the reviewer kept — is the one thing I *measured* rather than reasoned about.

## What repeatedly cost tokens — round 3 additions

1. **Fragment controls that are not source.** I discovered while verifying R2-B4 that **six of six**
   ceiling fragments I sampled fail to parse — including two POSITIVE controls codex's four-fragment
   sample did not reach. The whole carried floor is fragments. Had the plan gone to a worker with
   one `duplicateBoundSites` entry point, that would have surfaced in round 1 as a wall of failures
   with no obvious cause. Cost avoided: probably a full round. Cost paid: two rounds of
   specification churn about failure kinds that a five-minute parse of the existing controls would
   have settled in round 1 of the plan.
2. **Arithmetic asserted instead of derived.** My `24 → 2 → 1` staged counts were simply wrong; the
   right numbers (24, 2, 2 against a green 1, in the sequence I chose) fall straight out of the
   census I had already measured. I wrote them from memory of the census rather than from it.
3. **Reviewer verdicts as prose, for the third consecutive round.** ~20 more expressions in
   paragraphs; ~20 more native evaluations to put them in tables. The
   `logs/<lane>/counterexamples.tsv` proposal from Revision 1 has now gone unadopted through three
   rounds and been paid for three times. **STRENGTH: entailed** — the same re-evaluation appears in
   all three of my transcripts.

## What we must upgrade — final ranking from this seat

1. **A specification's worked examples must be DERIVED from its rules, not written beside them.**
   The single highest-value change for any future contract-shaped ticket. Cheapest form: for each
   worked row, state which rule row decided it — a `reason` column. §8.7 R3 puts exactly that field
   into the evaluated-candidate record, for the same reason.
2. **Counterexample fixtures, not prose verdicts.** Three rounds, three payments.
3. **A "provably not X" state requires a per-member type-level justification, in writing.**
4. **Probes state their refuting observation before running** (from Revision 2; it held up).
5. **Controls carried as a "floor" are parsed/executed once, at plan time, before being promised.**
6. **Dependency resolution is a table over the workspace.**

## The one-prompt machine — what three rounds of plan review actually taught

The handoff unit I proposed after round 1 was: fixture + plan + one sentence naming the decision
problem and its abstraction. After round 2 I added: *and the observation that would refute it*.
After round 3 the missing piece is smaller and duller than either:

> **the specification must be executable against its own examples before it is reviewed.**

Not implemented — *executable*. A rule table plus a worked-example table plus a derivation column
is enough. Twenty-one blocking findings across this ticket, and the majority of the plan-level ones
would have been caught by that one discipline, because they were all internal inconsistencies
rather than facts about the world. The facts about the world — the parser, the census, the parse
diagnostics — I got right whenever I measured them, and wrong whenever I reasoned about them.

## Semantic universal sweep, round 3

Run over the Revision-3 text on the three phrases codex named plus the rest. Full table at §9.14 R3
in the plan. Retracted this round: "every in-grammar pure callback is evaluated exactly" (admission
is not exactness), "covers every clause named in §1–§5 R2" (§6.11 R3 names five uncovered clauses),
"each mutation changes verdict" (§6.10 R3 gives each row one of five observables), and the implied
"28 rows are 28 transcripts" (K23/K24 were one mutation). Two Revision-3 claims were weakened
before handoff rather than after: §5.4 R3's "the completed nine parse" is **consistent-with**, since
I completed them from source that parses but did not parse the completed strings; and §6.11 R3's
per-row discrimination is **consistent-with** with its five gaps named in the same table.

**That last pair is the only part of this round I am satisfied with**: the sweep caught my own text
before a reviewer did, which is the first time in three rounds that has been true.

## What the round-3 sweep caught in my own text

Two corrections, both made before handoff:

1. **§5.4 R3's floor inventory double-counted three controls and routed them to the wrong harness.**
   I wrote "the 8 spellings, the 4 layouts…" as ceiling controls and separately listed "3 bare
   option-domain controls" as domain controls. Counting the actual entries at 60641339 shows the
   three bare option-domain controls **are** two of those eight and one of those four:
   `{[1,2,3,4,5].map((value) => value)}`, `new Set([1,2,3,4,5])`, and the multiline literal. They
   reach the ceiling arm only through the `WHOLE_DOMAIN` clause that §7 removes, so they must assert
   on `domainSites`, not `ceilingSites`. Corrected to 25 ceiling + 3 domain = 28, with no double
   count. **This is the "read the fixture, not its name" lesson from round 2, recurring in round 3
   text I wrote after writing that lesson down** — caught this time by counting rather than reading.
2. **Signed zero was implicit.** codex asked for ToBoolean over NaN *and* signed zero; I had NaN
   covered by the non-finite rule and left `-0` to fall out of `v !== 0`. Now stated explicitly, with
   the measurement (`Boolean(-0)` is `false`, M15).

**STRENGTH: entailed** — the control counts were taken from the oracle blob this round, not from the
block names.

## Contract compliance, round 3

The same two allowed files: the plan (revised in place, Revision-2 text preserved and
banner-marked, terminal `PLAN READY FOR REVIEW` marker restored per the packet audit) and this
self-report. No worktree, no pnpm, no install, no git mutation, no board or DECISIONS edit, no
source edit, no code. The alias dependency is **not** added here — D68 ADDENDUM grants it to the
worker's round 0. Probe scripts live in the session scratchpad, outside the repository; the lane
worktree, `node_modules` and `apps/ui/node_modules` were read only.

**STRENGTH: entailed** for M11–M15 and every measurement attributed to a command; **consistent-with**
for the generalised lessons; **undetermined** for O1–O5 in §9.13 R3, which go to V.

---

# REVISION 4 — 2026-09-06, V-authorised bounded round after codex PLAN r3

`SKILLS LOADED (round 4, unchanged): heartbeat (Skill tool) · heartbeat-protocol router (markdown) ·
heartbeat-architecture (markdown) · superpowers:using-superpowers · superpowers:brainstorming ·
superpowers:writing-plans (Skill tool).`

`comments read through: t1-oracle-evaluator-plan-codex-r3-2026-09-06`

**Five bounded findings, all reproduced before revising.** Twenty blocking plan findings across four
rounds (8 + 6 + 5, plus the r3 code review's 3 that started the ticket). This round exists only
because V authorised it; codex explicitly did not request another.

## The body: I wrote a rule that could not produce my own worked example — again

R3-B1 is R2-B1 wearing different clothes, and I did not see it while writing the fix.

In Revision 3 I built a `Prim` type so that booleans survive until consumed, wrote the worked row
"`str` cells; unary `+` on `str` → exact `num`", and in the same section wrote an abstraction table
that turns every `str` into a payload-free `NONNUMBER` cell. **The next callback's parameter had
nothing to read.** The worked row could not follow from the types on the facing page.

That is the identical defect codex charged as R2-B1 — a transition table that cannot produce its own
worked example — and I committed it **in the section I wrote to repair R2-B1**. My round-3
self-report says, in its own words, that a specification must be executable against its own examples.
I wrote that sentence and then did not do it for the new table.

**The measurement that settles it** is codex's, and I reproduced it: two Set expressions whose
Revision-3 cell lists are *identical* — `NONNUMBER, NONNUMBER, 1,2,3,4,5` — and whose native results
differ, `[2,3,4,5]` and `[1,2,3,4,5]`. Exact deduplication was not a function of the state I had
declared. There was no implementation choice that saved it: equal sentinels give a silent miss,
distinct sentinels give a false positive.

**The repair is smaller than the defect:** stop abstracting. A cell IS a primitive, `Cell → Prim` is
the identity on the six primitive constructors, and numeric classification becomes a function over
cells instead of a state stored in them. Storage and classification were conflated; separating them
made the unary chain exact and Set equality decidable in one edit.

## Second body: the grandparent's kind is not a role

R3-B2. My ownership walk asked "is the candidate the receiver, and is the member's parent a
`CallExpression`?" — and never asked whether the member was that call's **callee**. codex's fixture
passes a method *reference* as an argument:

```ts
const choices = ((method) => Array.from({length: 5}, (_, i) => i + 1))([0,1,2,3,4,5].includes);
```

I verified the AST myself: array `(71,84)`, member `(71,93)`, outer call `(16,94)`,
`call.expression === member` is **false**, the member **is** an argument, and the native value is
`[1,2,3,4,5]`. My rule applied `includes → NOT_ARRAY` to a method that was never invoked, and
withheld a ruled domain.

**Cause, named:** I tested a *shape* (parent kind) where the contract needed a *role* (callee vs
argument). That is the third time in this ticket I have classified by the wrong axis — position, then
method name, now node kind. Each time the fix was to ask what the syntax *does*, not what it *looks
like*.

## What repeatedly cost tokens — round 4 additions

1. **Range shorthand in a derived count.** I wrote "MUTATION rows: 41 (K1–K3, K4, K5, K6, K6b, K7,
   K11–K23, …)" and the ranges silently dropped ids the table carried. Recounting mechanically gave
   **45**. I caught it before filing only because I now recount every derived number — but the cheaper
   fix is structural: **enumerate ids, never write a range in a count you then assert.** The plan now
   enumerates all 45.
2. **Fixing a section without re-reading the section it repairs.** R3-B1 exists because I wrote a new
   `Prim` contract and a new abstraction table in the same section without walking one through the
   other. Two minutes of replay would have caught it; it cost a round.
3. **Reviewer verdicts as prose, fourth consecutive round.** The `counterexamples.tsv` proposal from
   Revision 1 has now gone unadopted through four rounds and been paid four times.

## What I would change about how this seat works

Three plan revisions have each opened with me accepting every finding, and each has introduced at
least one new defect of exactly the class I was repairing. That pattern is the finding:

> **Repairing a contract defect is itself a contract change, and gets no review before it ships.**

The worker loop has RED-first; the architecture loop has nothing equivalent. A plan's "RED" would be:
*before filing, take every worked example in the changed section and derive it from the changed
rules, in writing.* I did that this round for §3.17 R4's six-row table and for §3.18 R4's fixture,
and both are the only parts of this revision I would defend without qualification. I did not do it in
Revision 3, and R3-B1 is what that omission cost.

## Semantic universal sweep, round 4

Full table at §9.17 R4. The two claims that needed work before filing: **"MUTATION rows: 41"** was
wrong and is now an enumeration of 45 with a per-round split that sums; and **"there is no lossy
abstraction step any more"** was too strong — `Cell → Prim` is lossless, but `arr → unknown` on a
callback parameter is a deliberate loss, now stated beside the claim. `Cell → Prim` totality was
checked constructor by constructor rather than asserted.

## What the round-4 sweep caught in my own text

Three corrections, all made before filing — and the first two are the same failure mode this round
charged codex's findings for:

1. **A rule of mine with a counterexample among my own rows.** §1.14 R4 first read "the stub's
   failing set is every row that has at least one operation or wrapper AND expects RULED or OTHER."
   `[1,2,3,4,5].map(n => 0)` — the rule-1 discriminator I added in Revision 2 — has an operation and
   expects RULED, but rule 1 decides it before the walk, so it is GREEN under the stub. My own §4 R2
   refuted my own §1.14 R4. Corrected to a three-clause rule with that exclusion stated and the
   reason given.
2. **A guarantee with an unguarded source.** §3.17 R4 declares `{t:"num"}` cells FINITE and then
   claims `NaN` never arises. Callback results were guarded by the non-finite rule; **literals were
   not** — `[1e400, 1, 2, 3, 4, 5]` parses to `Infinity` and §6.4's eligibility accepted any
   `Number(text)`. One clause added: a numeric literal whose value is not finite yields
   `{t:"unknown"}`.
3. **A derived count written as ranges.** "MUTATION rows: 41" was wrong; the enumeration is 45.

**STRENGTH: entailed** — (1) and (2) are refutations of the written text by other written text and
by the language's own behaviour; (3) was recounted mechanically from the table.

I record these together because they make the round-4 lesson concrete: **every one was found by
deriving a claim from its own rules, and none by re-reading the prose.**

## Contract compliance, round 4

The same two allowed files: the plan (Revision-3 text preserved and banner-marked; terminal marker
updated to the r3 cursor) and this self-report. Scope held to the five items plus the §9.12 Node
fact; nothing else in the plan changed. No worktree, no pnpm, no install, no git mutation, no board
or DECISIONS edit, no source edit, no code. Probe scripts are in the session scratchpad, outside the
repository; the lane worktree, `node_modules` and `apps/ui/node_modules` were read only. The one
compiler invocation was `apps/ui/node_modules/typescript/bin/tsc --noEmit` over a synthetic file in
the scratchpad, to reproduce M18 — no repository file was typechecked.

**Node 22.23.1 UNVERIFIED (V, 2026-09-06): the pinned parser was installed and imported under Node
25.7.0 only.** Every probe in all four of my rounds ran on Node v25.7.0.

**STRENGTH: entailed** for M16–M20 and every measurement attributed to a command; **consistent-with**
for the generalised lessons; **undetermined** for O1b and O3–O6 in §9.16 R4.
