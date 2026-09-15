# T5 EDGES — self-report

Seat T5 · PROGRAMMING loop · Opus 5 · session `opus-t05-w4` · base `86ce04f`.

## r1

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

### The single biggest cost, named: re-deriving the harness

**CAUSE.** Roughly 40% of this seat's budget went to *locating* things, not to
deciding or writing: where τ comes from (`ledger.reduced_judgement`, joined
LATERAL in `materialiseSnapshot`), how a test boots a database
(`tests/support/testDatabase.ts` → embedded-postgres as user `debateai`), how a
fake gateway is shaped (`tests/unit/xrev01-node-review.test.ts:50-59`), what σ
and `agg` actually compute (`packages/published-arithmetic`), which action kind
the ledger recognises (`LEDGER_ACTION_KINDS`), and which columns
`ledger.reduced_judgement` demands. **Every one of those facts was already known
to an earlier lane in this same mission.** T1, T3, T4 and T8 each paid for a
subset. None of it is written down anywhere a seat reads at dispatch.

**PRICE.** ~35 minutes of a ~2 hour packet, and by far the largest share of
tokens: nine exploratory `grep`/`sed` round-trips whose only output was "the
fixture pattern is X".

**UPGRADE — the highest-leverage one-prompt-machine change I found.** A single
page, `.hermes/HARNESS-MAP.md`, append-only like TOOLING-TRAPS, answering
exactly: how do I construct a run · a node · an edge · a τ · a fake provider
gateway that writes real ledger rows · a snapshot that `evaluate` will accept ·
what the arithmetic is. Roughly 60 lines. It would have removed most of that 35
minutes for me and will remove it for every remaining lane. TOOLING-TRAPS is the
proof this format works; it captures what BREAKS but nothing about what to
BUILD, and building is what a PROGRAMMING seat spends its time on.

### What I nearly got wrong — two, both caught, one by a hair

**(1) Two assertions that pinned nothing, passing green at base.** At the RED run
my tests "refuses a review that does not measure EVERY supplied edge" and
"refuses a bearing outside the 0-1 interval" *passed* on the unmodified base.
They passed for the wrong reason: the strict schema rejected the whole unknown
`edge_bearings` key, so the assertion never exercised the rule it names. Had I
read only the red/green counts I would have shipped two decorative assertions
inside an otherwise honest lane. Only building the mutants exposed it — and the
FIRST mutant (M3, drop the `.length(edgeCount)` pin) did **not** kill the test
either, because a second independent guard caught it. It took M3b (drop the
length pin AND soften the zip guard to `?? null`) to go red on exactly the right
assertion.

  **The lesson is sharper than "write mutants":** a test that passes at base is
  not automatically a test of existing behaviour — it can be a test of nothing.
  RED-first tells you which tests fail; it does not tell you which *passes* are
  vacuous. **Every assertion that passes at base needs a mutant before it counts.**
  PRICE: ~12 minutes of mutants, against a probable full review round.

**(2) Precedent nearly bought me the wrong migration.** The T8 B1 catch (narrowing
a DB vocabulary the read path can still return) is the mission's best DB find,
and it pushed me hard toward keeping `EVIDENCE_VERIFIER` as a permanent legacy
member so no read could hand back a value the type refuses. That would have
left the repealed stamp in the vocabulary forever. It was wrong, and stating the
property in one sentence is what showed it: **`strength_source` on a row whose
`strength` is NULL asserts an INTENDED source, never that a measurement
happened** — so renaming those rows fabricates nothing, and only rows already
MEASURED under the retired stamp carry a real number that cannot be relabelled.
Those get a loud preflight. Precedent is a heuristic; it does not survive
contact with a different semantics, and applying it without re-deriving would
have permanently widened a vocabulary this mission exists to narrow.

### The trap the corpus saved me from, and the one it did not

**SAVED.** `tests/architecture/scaffold.test.ts`'s two failures are red at base
AND at HEAD *under identical names*. T1's report (`t01-depth.md:270-271`) records
that a name-level comparison hid **three** T1-owned violations inside those very
rows across two rounds. Because that was written down, I compared PAYLOADS — the
three `obs-capture` dependency edges and three `obs-capture` env reads, matching
T1's recorded base payload item for item, with zero entries naming a file I
touched. **Cost with the warning: 3 minutes. Cost without it: a review round,
twice, as T1 measured.** This is the single clearest evidence in this lane that
the written corpus pays.

**NOT SAVED — and it cost me.** `.hermes/TOOLING-TRAPS.md` records the correct
base-comparison recipe (`git diff > work.patch`, move untracked aside,
`git checkout HEAD -- <dirs>`, restore, prove with `diff -q`). **That recipe is
blocked in this harness**: the permission classifier refuses `git checkout HEAD --`
as destructive. The trap file's remedy is not executable, so I spent ~2 minutes
discovering it and then had to invent a different method — `git show HEAD:<path>`
plus an import-graph argument — which turned out to be cheaper AND non-destructive.
The next seat will pay the same 2 minutes. A trap entry whose cure does not run is
worse than no entry: it spends the reader's time and returns nothing.

### Dead ends — do not re-derive these

- `head -n -1` is a GNU-ism; BSD/macOS answers `illegal line count`. The report
  sha convention (`sed '$d' <file> | shasum -a 256`, verified against T3's
  recorded hash) needs `sed`, not `head`.
- `GraphRepository.materialiseSnapshot` returns `operatorResolutions: []`. It
  reads like a complete `EvaluationSnapshot` and is not — `evaluate` throws
  `OPERATOR_RESOLUTION_MISSING` for any node with incoming arrows until the
  caller overlays the register's resolutions. One 34s run.
- `PropagationOutcome` exposes `strengths`, not `values`. One typecheck cycle.
- A single `$3` bound to both a `uuid` and a `text` column gives
  `42P08 inconsistent types deduced for parameter $3`. One 12s run.
- The `.hermes` kanban CLI is genuinely absent; the file board is the state.

### What the packet got right, and where it was unclear

**Right, and worth copying into every future packet:** naming the sentinel repeal
as a *deliberate ratified* repeal with its superseding authority (S3-1) and its
inversion stated in one clause removed all ambiguity about whether deleting a
green test was allowed. Naming the F23 clause up front made me enumerate the
receipt/JSONB surface *before* coding rather than discovering it in review.
Naming the final≠τ test as "the mission's headline number, flagship care" is why
it got a number-level mutant (M5) rather than a measured-ness-level one.

**Unclear, three places:**

1. **The runner anchor had moved and the packet said so without saying where.**
   "the runner regions the goal cites at 1c9578a have MOVED — re-locate every
   anchor and note drift" is honest but pushes the work down. `index.ts:1679-1693`
   is `2015-2028` at `86ce04f`. The sentinel anchor
   (`dr184-judged-standing.test.ts:85-105`) had NOT moved, which I could only
   learn by checking both. **UPGRADE:** anchors should be cited as
   `symbol + unique substring`, with the line number as a hint, not as the
   identity. A grep for `strengthSource: "EVIDENCE_VERIFIER"` located every site
   in one call and cannot go stale; `1679-1693` was stale within one merge.

2. **`strengthSource` renamed `REVIEWER` does not say whether the stored rows are
   rewritten.** That is the entire migration design, and the goal's five words do
   not settle it. I chose the rewrite (with a loud preflight for the one shape
   that would be a lie) and disclosed the fork. A packet clause of the form
   "vocabulary changes: state whether stored rows are rewritten, refused, or
   retained, and why" would have made this a decision rather than an inference.

3. **The marker position is contradicted between two authorities.**
   `INSTRUCTIONS.md:70` says "your report, marker on line 1". My packet §3 and the
   dispatch harness facts both say marker LAST. I followed the packet (it is law
   for this seat) and boarded the contradiction as F-T5-4. Two seats reading two
   files and producing differently-shaped reports is a pure coordination tax.

### A contract defect that forces a law to be broken

Worker contract §6 **requires** appending to `.hermes/TOOLING-TRAPS.md` any trap
that cost time. My packet's `allowed` list does not include that file, and §4
says the allowed list is exhaustive. **The two obligations are not jointly
satisfiable.** I obeyed the narrower one (the contract bound) and named the traps
here for routing instead — but every seat hits this, and the resolution should be
mechanical: either TOOLING-TRAPS.md joins every worker's allowed list, or §6
changes to "name your traps in your report; the judge appends them". The current
state means the file only grows when a seat quietly crosses its contract.

### Efficiency notes for the next PROGRAMMING seat

- **Enumerate with one grep before editing anything.** `grep -rn strengthSource`
  over `apps packages tests acceptance web scripts` returned all 11 files and 49
  sites in one call; the compiler then forced exactly the completions. Zero late
  finds. This is cheap and it worked — do it first, every time.
- **Let the compiler do the enumeration you cannot grep for.** Renaming the union
  member surfaced all 19 consumer sites as typed errors. Reading them as a
  worklist beat searching for them.
- **The three-run law caught a real thing.** Runs 1 and 3 were set-identical;
  run 2 added one load-coupled flake at host load 10. Two runs would have looked
  clean and hidden a fifth member of the F13/F21/F22/F31 family (boarded here as
  F-T5-3). The law earns its cost.
- **Host contention is a fleet-level cost nobody is accounting.** At dispatch the
  load average was 10.4 on 12 cores, and a batch-suite watcher was polling for a
  quiet host. My lawful zone runs (D13 leaves them free) hold that watcher off.
  Worker zone runs and the orchestrator's quiet-gate are in direct contention and
  neither knows about the other.

### The one change I would make to the machine

Everything above reduces to one shape: **this fleet re-learns the same facts once
per seat.** TOOLING-TRAPS proved that writing a fact down once converts a
review-round cost into a three-minute check (scaffold payloads). The same trick
is unapplied to construction knowledge (how to build a fixture), to anchors
(cite symbols, not line numbers), and to vocabulary changes (state the stored-row
disposition). Three small append-only files — a harness map, a symbol-anchored
index, and a packet clause template — would take one lane to write and would pay
back on every lane after it. That, more than any per-seat improvement, is what
turns this into a one-prompt machine.

---

## r2

Rework round 1 of max 3, against codex r1 (4 blocking, 1 packet finding that was
the orchestrator's). All four verified against the codebase before any edit; all
four were real. I pushed back on none of them, and the reason is worth recording
precisely, because it is the finding of this round.

### The cause of all four: I audited the contract I changed, not the contract's consumers

**CAUSE.** In r1 I ran one `grep -rn strengthSource` and called the class
enumerated. That enumeration was exhaustive for the *vocabulary* rename and it
worked — zero late finds there. But T5 changed a **second** contract, the review
RESPONSE SCHEMA, and I never enumerated *its* consumers. The producers of that
schema are test doubles that return `string`, so the compiler cannot see them and
a symbol grep does not name them.

**PRICE.** B1: 13 runner fixtures dead in a file my 63-file zone never ran. That
is the whole cost of this round, and it was pure omission — nothing about the
production code was wrong.

**The specific self-deception:** I chose my zone by "files I edited plus files
that mention `strengthSource`." `tests/integration/database.test.ts` mentions
neither, and it is the single most important consumer of the runner. I never
asked *who produces the JSON my parser now rejects.*

**UPGRADE — the rule that would have caught it.** When a change narrows a
**parsing contract** (a schema, a parser, a validator), the class to enumerate is
not the callers of the type — it is every **producer of the wire format**,
including fixtures and doubles. The mechanical version, which costs one command:

```
grep -rln '"outcome"' tests/ acceptance/     # every producer of the artifact
```

For a schema change, grep the JSON KEYS, not the TypeScript symbols. A typed
grep is blind to exactly the population that a strict parser will kill.

### Two of the four were things I had already seen and mis-severitied

**B2 was my own F-T5-1... sorry, F-T5-2, filed as non-blocking.** I found it, wrote
it down, declared it in the type, commented it, and shipped it. Codex correctly
ruled it blocking, and the distinction it drew is one I should have drawn myself:
`edges: []` is not a *missing* measurement, it is a **false declaration** — the
call tells the reviewer "this node sources no edges" about a node that sources
one. My r1 framing ("declared, made explicit rather than left as an omission")
made me feel honest about a statement that was still untrue. Candid disclosure of
a lie does not convert it into a limitation.

**PRICE:** ~25 minutes in r2 to do properly what I had rationalised in r1.

**B4 is the mutant lesson from r1, one level up, and I missed it in the same
report where I taught it.** In r1 I wrote that "an assertion that pins the mutant
you were shown is not a pin of the property" — then built M1 against the graph
METHOD and claimed it proved the chain. It proved a component. The composition
root (`edges: authoredNode.sourcedEdges` and the runner's writeback) had **no**
mutant, so removing either would have shipped green. Codex named this the T4-B1
facsimile class, which is exactly right: my chain test hand-assembled the chain it
claimed to observe.

  **The distinction to carry forward: a component mutant and a composition-root
  mutant are different mutants, and only the second one pins wiring.** If the test
  constructs the sequence of calls itself, it can only ever pin the callee. The
  new M6/M7 (transport removed / writeback removed) are the mutants that were
  missing, and both go RED.

**Codex also caught a live defect inside my own fixture** that I had not noticed:
my `reviewAndMeasure` helper labelled every offered edge `polarity: "attack"`,
including the support edge, and stayed green because the scripted gateway ignores
its prompt. A test that mislabels its own inputs and cannot notice is a test that
is not reading its own evidence. The production-seam test now asserts each
measured row carries the bearing scripted for **that edge's own polarity**, which
is what makes the mislabelling impossible to hide.

### What I got right and would repeat

- Verifying every finding before editing. B1's mechanism as codex described it
  (`NODE_REVIEW_SCHEMA_FAILURE`) is not the code that actually surfaces — the
  runner wraps it as `NODE_REVIEW_UNAVAILABLE`. The finding was right and the
  predicted symptom was wrong; running it first is how I know which 13 of the 14
  failures were mine and which one was the boarded base-red.
- Choosing `cannot-assess` as the shared double's default bearing policy rather
  than inventing numbers. Numbers would have moved propagation results inside
  other lanes' fixtures, and I would have been silently editing their assertions
  from inside a shared factory.
- Building the B4 oracle from the run's OWN taus and bearings via the published
  arithmetic instead of hardcoding 0.4375. The production graph is richer than my
  constructed one and lands on 0.3984375; a hardcoded constant would have been
  either wrong or a coupling to `reduceAssessment`'s internals. The oracle also
  survives another lane retuning the reducer.

### Dead ends and traps, this round

- My B2 RED fixture failed for the wrong reason at first: I swapped the node but
  left `readDisclosedNodeIds` returning the OLD node id, so the run refused at the
  disclosure gate before any review. A RED that fires in the wrong place is not
  evidence; I only caught it because the failure message named the wrong
  expectation. Read *which* assertion fired, always — the same trap TOOLING-TRAPS
  records for vitest's deduplicated errors, in a different disguise.
- `expect(...).toBeCloseTo(oracle + delta)` is a cheap, honest way to make a
  passing test print its actual number for the record. It is a probe, not a
  mutant, and it must be reverted like one.

### The one-prompt-machine change this round argues for

r1's self-report asked for a harness map. r2 sharpens it into something smaller
and more mechanical: **the zone must be derived, not chosen.** Every seat picks
its own zone by judgement, and my judgement omitted the repo's most important
runner fixture file. A `zone-for.sh <changed-files>` that emits the test files
which (a) import the changed packages, (b) mention the changed symbols, AND
(c) **produce or consume any wire format the diff touches**, would have printed
`tests/integration/database.test.ts` on line one. The information needed to
compute that is already in the repo; only the habit of computing it is missing.

---

## r3

Rework round 2 of max 3 — the last lawful round. Codex r2: 1 blocking, 4
non-blocking. All verified; all real; I contest none.

### The cause: I treated two awaited writes as one durable fact

**CAUSE.** In r1 I composed `recordNodeReview` then `recordEdgeMeasurements` and
read the sequence as atomic because it was sequential in the source and because
both awaits were on the happy path. They are two transactions. In r2 I *extended
that same shape to a second call site* while fixing a different problem in the
same function — so the round that repaired the catch-up path also doubled the
blast radius of a defect I had not seen.

**Why it was invisible to everything I ran.** Every test I wrote exercised the
success path. RED-before-GREEN proves a feature is absent before it exists; it
says nothing about what happens when step two of a two-step write fails. **No
amount of green tests can find a durability defect that only appears on a partial
failure — you have to inject the failure.** I never asked "what if the second
write throws?", and that question is not answered by any coverage metric.

**What made it unrecoverable rather than merely wrong** — and this is the part I
should have derived myself, because I had already read every fact needed:
`ledger.node_review` is append-only, REVOKEs UPDATE/DELETE, and carries
`UNIQUE (node_id)`; `readUnreviewedNodes` filters on `review.node_id IS NULL`. I
had read all three while implementing B2 in r2 — I even *used* the append-only
property in my reasoning about the ratchet. I never composed them into "therefore
a lone review is a one-way door that also hides the node from every repair path."
**Facts I had already gathered, never combined.**

**PRICE:** one full rework round, and it was the last one available.

**UPGRADE — the question that finds this class.** For any operation that writes
more than one fact, ask: *if write N+1 fails, is the state left behind
(a) correct, (b) retryable, or (c) permanent?* Only (c) is a defect, and (c) is
exactly what append-only plus a uniqueness constraint plus a
"not-yet-done" filter produces. Those three together are a **one-way door**, and
this repo is full of them by design. A checklist item — "list the append-only
tables this operation writes, and say what happens if a later write fails" —
would have caught it before codex did.

### The demonstration was cheaper than the reasoning

Injecting the failure needed **no mocks and no fault-injection library**: the
schema's own one-way ratchet supplies it. Measure the edge first, then compose a
review whose bearing targets that now-MEASURED edge, and the second write refuses
for real. The demo prints the stranded state directly — review committed, 0.75
bearing gone, node no longer selectable, second review refused by UNIQUE.

**The lesson worth carrying: look for a failure the system already produces
before reaching for a mock.** A refusal the schema enforces is more honest
evidence than an injected exception, because it is a failure the production
system can actually have.

### What I did better this round

- Checked the declared architecture edges (`tools/orphan-audit/src/index.ts:20-32`)
  **before** choosing where atomicity would live. `judgement` and `graph` may not
  import each other, so the composition root was the only lawful home — and it is
  also the architecturally correct one. Had I not checked, I would have added a
  package edge and broken `scaffold.test.ts`, converting a two-line fix into
  another round.
- Made the fixed shape the **only expressible** one: the catch-up dependency
  contract now exposes a single composed operation instead of a pair that a
  future maintainer could call separately, plus a source-level pin that the
  runner never calls `recordNodeReview`. A fix that removes the footgun beats a
  fix that documents it — which is exactly what N1 was about, my own r2 comment
  still instructing callers to do the thing my r2 code had outlawed.
- Kept the defect demonstration as a committed test rather than deleting it once
  green. It documents *why* the atomic path exists, which is the thing most
  likely to be lost in a future refactor.

### The N-findings share one root, and it is worth naming

N1 (contract text contradicts the code), N2 (assertion that cannot fail), and
N3 (prose says "preserves", SQL says `strength=NULL`) are all the same failure:
**prose and assertions that were written to describe an intention rather than to
be checked against the behaviour.** N2 is the sharpest — an assertion that
*cannot* fail is worse than no assertion, because it occupies the place where a
real one would go and reads as evidence in a report. My own r1 self-report warned
about exactly this ("every assertion that passes at base needs a mutant"), and I
still shipped one in r2 because I copied the T8 fixture's helper without
comparing it to the production migrator it was imitating.

**Copying a proven pattern does not transfer its guarantees.** T8's `applyOne`
was correct for T8's assertions; it was vacuous for mine, because mine asserted
something about the migration ledger that T8's never touched.

### Efficiency notes

- Three rounds, three distinct classes: r1 missed a **consumer population**
  (wire-format producers), r2 missed a **failure path** (partial write), and both
  were found by a reviewer reading the code rather than running it. Static review
  caught what three green zone runs could not, twice. That is an argument for the
  review seat's existence, and against my instinct to treat a green zone as
  evidence of correctness.
- The rework cost curve was flat: each round was ~60-75 minutes regardless of the
  size of the fix, because the fixed cost is re-verification (three-run zone, D16,
  typecheck, mutants), not the edit. **This argues for spending more before the
  first handoff, not less** — a 10-minute durability checklist would have saved a
  75-minute round.
- The scratchpad byte-backup + `diff -q` restore discipline held across three
  rounds and ~12 mutants with zero contamination. Worth keeping as standard.

---

## r4

Rework round 3 of 3 — the true cap. Codex r3: 1 blocking, 2 non-blocking (both
the orchestrator's). Verified; real; not contested.

### The cause: I wrote a rule in a language that cannot express the rule

**CAUSE.** r3's "source-law pin" was `expect(runner).not.toMatch(/\brecordNodeReview\(/)`.
A regex over source text cannot state a rule about *program structure*. The
reviewer defeated it in one line — `recordNodeReview ({...})`, a space before
the parenthesis — and noted a `.bind()` alias or `j["recordNodeReview"]` does
the same. My rule checked ONE SPELLING of one token; the property I meant was
"this composition is unavailable."

**The tell I ignored.** I wrote the pin, watched it go green, and never asked
what it would take to make it go red. That is the exact failure my own r1
self-report named — *every assertion needs a mutant* — applied to the assertion
I invented to satisfy a reviewer, which is the assertion least likely to get
mutant-checked because it feels like documentation rather than a test.

**UPGRADE.** When the requirement is "X must be impossible," the check must live
in a system that can *decide* it. Ranked by strength:

| mechanism | decides | evadable by |
|---|---|---|
| regex over source | one spelling | whitespace, alias, computed access, comments |
| AST/lint rule | syntax | indirection through another module |
| **type system** | **reachability of a name** | nothing, if the name does not exist |
| deletion of the API | existence | nothing |

I reached for the weakest one available. The strongest one — delete the unsafe
surface — was also the *simplest*, and I did not consider it because I was
thinking "how do I detect the bad pattern" instead of "how do I make the bad
pattern unavailable." **Detection is a weaker goal than impossibility, and it is
usually more work.**

### What actually made this cheap once framed correctly

Removing `JudgementRepository.recordNodeReview` and
`GraphWriter.recordEdgeMeasurements` took minutes. Eleven call sites broke,
every one surfaced by `tsc` as a worklist, and the production packages had ZERO
breakage — because production already went through the composer. **The compiler
enumerated the blast radius for free**, which is the same lever that made the r1
vocabulary rename safe and that I keep re-learning.

The evasion probes became the test. `tests/architecture/t05-half-write-seal.test.ts`
runs `tsc` on the reviewer's own two evasions and asserts they do NOT compile.
A type error IS the assertion — it survives whitespace, aliases, computed
access, and comments by construction, because it is not reading text at all.

### The correction I owe on my own evidence

Codex caught two false claims in my r3 report, and both were mine:

1. I labelled `r3-red-B1-atomicity.log` as RED "because `recordReviewWithMeasurements`
   did not exist." It was not. All three failures died in `authorArtifactOf`
   attempting a forbidden `UPDATE core.node` — a **fixture-setup failure that
   never reached the operation under test**. I then fixed the fixture and never
   re-ran a true RED. I read the failure COUNT and the test NAMES and did not
   read the stack.
2. I presented `r3-red-B1-stranded-halfwrite.log` as RED when its result line
   says `1 passed`. It is a passing characterization test — real evidence of the
   defect's shape, but not a discriminator.

**Both are the same error: treating a red count as a red property.** TOOLING-TRAPS
already records the vitest cousin of this ("read the `❯ file:line` marker; only
that names what fired"), and I still did it — at the top of a report, in a
sentence I wrote myself. **A RED is only evidence if the failure reaches the
assertion you claim it reaches. Read the stack, every time, not the count.**

### The round-language contradiction (codex N2) — mine to own, not the packet's

My r3 report said "round 2 of max 3 — the last lawful round" in the header and
"Rework rounds spent: 2 of 3" in the footer. The coordinator's message had said
"LAST," and I propagated it into a header without checking it against the board,
which said one round remained. A controller reading only the header could have
routed a CHANGES verdict to V and burned the round that actually existed.

**I copied a status claim from a message into a report instead of deriving it
from the board.** Router §2.4 says the board is the state, and I treated a chat
message as the state. The fix is mechanical and I should have applied it from
r1: **round numbers get read from the board ticket, never typed by hand.**

### What three rounds of review actually bought

Each round found a defect a class weaker than the last, and none of them was
findable by running the tests:

- **r1 → r2:** a missing consumer population (wire-format producers). Invisible
  to the compiler and to a symbol grep.
- **r2 → r3:** a failure path (partial write into a one-way door). Invisible to
  every green test, because green tests only walk the happy path.
- **r3 → r4:** a rule expressed in a language too weak to state it. Invisible to
  the test suite *by construction*, since the rule's own test was green.

**Three green zone runs never once discriminated any of them.** Static review by
a second seat found all three by reading. That is the strongest argument in this
lane's record for the reviewer seat, and the strongest argument against my own
instinct to read a green suite as evidence of correctness. A suite proves the
things it checks; it is silent about the things nobody thought to check, and
that silence looks exactly like success.

### The single change I would make to the machine, revised

r1 asked for a harness map; r2 for a derived zone; r3 for a one-way-door
checklist. All three are instances of one thing: **the seat should be asked to
state, before handoff, what would have to be true for its evidence to be
worthless.** For r1 that question surfaces "which producers of this format did I
not run?"; for r2, "what if the second write fails?"; for r3, "what spelling
would slip past this rule?" Every blocker in this lane was one honest answer
away from being caught before dispatch, and none of them needed a tool I did not
already have.
