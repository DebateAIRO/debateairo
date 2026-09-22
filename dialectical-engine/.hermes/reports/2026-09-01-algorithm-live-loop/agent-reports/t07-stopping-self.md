# T7 STOPPING — self-report

Seat T7 · PROGRAMMING loop · Opus 5 · session `opus-t07-w5` · base `7433be7`.

## r1

Treat it like a murder case. The body is a lane that landed a fully-proved
algorithm core and could not wire it, and the cause of death was decided by
somebody else's `for` loop three months ago.

### THE CAUSE, named once

**`buildMultiMakerExpansionPlan` is ROOT-MAJOR and the goal is ROUND-MAJOR.**
The plan (`apps/runner/src/index.ts:1165-1197`) loops `rootIndex` OUTER and
`round` INNER, so the emitted `leg.round` sequence for M=2, depth 2 is
`1,1,2,2 | 1,1,2,2` — it RESETS at every root. T7's task text says "After each
round, propagate", and there is no site in the shipped runner where "a round"
has finished. Every downstream symptom in this lane is that one fact:

- the δ stop fired at a fake boundary and cut root 1 off entirely;
- `completedRounds` was a per-root index masquerading as a global round count;
- the depth ceiling fired at `completedRounds 2` in the MIDDLE of the plan.

PRICE: ~55 minutes — one full wiring pass, one integration-suite regression
(green→red on a landed fixture), two heavy-suite base classifications
(~3 min each), one instrumented trace run, and the removal of the wiring I had
just written and committed. Rounds: 0 (caught inside r1). Retries: 2 fix
attempts before I stopped guessing and instrumented.

**WHAT WOULD HAVE PREVENTED IT, exactly**: reading
`buildMultiMakerExpansionPlan`'s loop nesting BEFORE writing the boundary hook.
I read the plan's *consumption* site (the `for (const leg of expansionPlan)`
loop) and inferred the ordering from `activeExpansionRound`'s existence. The
pre-existing code uses that variable only to trigger reviews, where a resetting
round index is harmless — so the variable's presence actively MISLED me into
believing it was a round boundary. Twenty lines up, the producer said otherwise.

### WHAT I NEARLY GOT WRONG, and it would have been the expensive one

I nearly shipped the wiring with the fixture's assertions "adjusted". When the
depth-2 two-maker fixture went red, my first instinct was that its call counts
were now stale and I should update them — I am allowed to edit that file. That
would have been me rewriting ANOTHER lane's envelope-exhaustion proof
(16+16+16=48, zero composer calls) to make my own change look correct, and the
suite would have been green with the proof gone. What stopped it was the base
classification: the test PASSES at `7433be7`. A test that passes at base and
fails at your tip is yours, and you fix the code, not the assertion.

Second near-miss, same family: my first "base" run was not a base run. I ran
`git stash push -u` while my work was already COMMITTED, so `HEAD` was still my
own commit and I nearly classified my own regression as pre-existing. The
tell was printing `HEAD=` in the same command — it said `1b08f7f`, not
`7433be7`. **Every base-classification command must print `git rev-parse HEAD`
in its own output.** Stash is not a time machine when you have committed.

### DEAD ENDS — do not re-derive these

1. **"Pick a δ that never stops."** There is none. The rule is `stop iff
   maxMovement <= δ`, and `movement == 0` satisfies it for every δ ≥ 0. I spent
   real time looking for a non-truncating fixture value before proving the
   quantifier. Any fixture that must not be truncated has to avoid the BOUNDARY,
   not the threshold.
2. **"Compare round 1 against a round-0 baseline."** It reads well and it is
   wrong in the one case that matters: a first round that measured nothing looks
   identical to a first round that converged. Measured: roots at 0.72 before AND
   after round 1, movement exactly 0, purely because no edge beneath them
   carried a magnitude.
3. **"Gate the feature on `stoppingPolicy === undefined`."** That is the silent
   -degradation shape J12 exists to repeal. Rejected on principle before writing
   it; recording it so the next seat does not re-argue it.
4. **`vi.fn(async () => undefined)` as a ledger spy** does not typecheck against
   `mock.calls[0][0].actionKind` — the mock has no parameter type. Declare the
   parameter: `vi.fn(async (_entry: { readonly actionKind: string }) => …)`.
   Cost: one typecheck round-trip.

### WHAT REPEATEDLY COST TOKENS

**Heavy-suite base classification is the single largest line item in this lane**
— roughly 12 minutes of wall clock across four runs of one integration file,
purely to answer "is this red mine?". Three of those four runs told me nothing I
could not have known from a cached artifact.

**UPGRADE (highest value in this report): a per-lane BASE SUITE CACHE.** At
worktree provisioning, the orchestrator runs each lane's declared zone once at
the lane's base commit and writes `logs/<seat>/BASE-<sha>.json` with the failure
MEMBERSHIP set (not counts — D-T0's set-equality law). Every later
classification is then a set difference against a file, at zero suite cost. The
lane worktree already exists, the base is already known, and the run is
embarrassingly parallel with the packet-writing. This mission has now paid for
base classification in T0, T2, T8, TREL, T3, T5 and T7 — seven times for the
same information.

**Second: the packet should carry the RE-LOCATED anchors, not the 1c9578a ones.**
My packet cites `propagation/src/index.ts:613-618` and `:637-644` and then says
"re-locate". At base `7433be7` those are `:563-573` and `:591-599`. Re-locating
cost one file read, which is cheap — but the orchestrator ALREADY knows the base
sha, and a wrong line number that happens to land on real code is a silent
mis-read waiting to happen. Cheap cure: packets quote `file:line @ <base-sha>`
and the orchestrator resolves them at packet-write time.

**Third: `zsh` and `grep --include`.** `grep -rn "x" --include=*.ts .` fails with
`no matches found` under zsh's globbing — the pattern must be quoted
(`--include='*.ts'`). Cost: two dead tool calls at the very start. Appended to
TOOLING-TRAPS.

### HOW TO MAKE THE CODING MORE EFFICIENT

**The single best thing I did was write the exact numbers into the test before
writing a line of implementation.** The RED run reported `19 failed | 1 passed`,
and the ONE pass was my hand-computed arithmetic check (0.5/0.5/0.625/0.625).
That single green line proved my dyadic arithmetic was right before any
implementation existed, so every later failure was unambiguously "feature
missing" and never "my numbers are wrong". Generalise it: **when a DoD demands
exact numeric examples, make the first test a pure arithmetic assertion over the
fixture graph, with no product function in it.** It is a free oracle.

**Use dyadic rationals for every exact-numeric DoD.** Every number in this lane
(0.5, 0.625, 0.125, 0.046875, 0.0029296875) is a power-of-two fraction, so
`toBe` is exact and `toBeCloseTo` never appears. `toBeCloseTo(x, 12)` hides
one-ulp logic errors; `toBe` does not. Choosing τ and edge strengths from
{0.5, 0.25, 0.125, 1/64} costs nothing and buys exactness.

**Build the discriminating fixture, not the demonstrating fixture.** The graph
in this lane (`heavy` moves a root, `light` moves only a non-root behind an
UNKNOWN edge) reads the SAME under J3's reading (b) and the rejected reading (a)
for the all-nodes field — both report 0.125 — and differently for the freeze
quantity — 0.125 vs 0. That one graph is the whole ruling, executable. The
mutant that erases root-scoping fails FIVE assertions on it. A fixture built to
demonstrate the rule would have caught one.

**My own accidental mutant is the best evidence in the lane.** I typed
`leverage < ε ? "CONTINUES" : "CONTINUES"` and, instead of fixing it, RAN it
first. Two assertions failed. It cost 40 seconds and it is the only mutant in
this report I did not have to construct. **When you catch your own typo before
running, run it anyway** — a real bug you did not design is worth more than a
designed one, because you did not choose it to be catchable.

### THE ONE-PROMPT MACHINE

1. **Make the base a cached artifact, not a suite run** (above). Biggest win.
2. **Packets should name the STRUCTURAL assumption the task depends on.** T7's
   task text says "after each round". The packet cited the leverage anchors, the
   ruling, the DoD and the δ/ε provenance — everything except whether the engine
   HAS a round boundary. A one-line "the expansion loop's shape is X" would have
   turned a 55-minute discovery into a 5-minute read. Generalise: for any task
   whose text presumes a control-flow shape (per round, per node, per attempt),
   the packet names the shipped site that realises it, or states that none does.
3. **A lane that finds a structural mismatch should be able to hand back a
   PARTIAL lane without it reading as failure.** I shipped a fully-proved rule
   with no product call site, and the protocol has no vocabulary for that
   between "FULLY DONE" and "BLOCKED". A `READY FOR PEER REVIEW — PARTIAL`
   marker, carrying the named gap, would let the judge rule on the gap instead
   of re-deriving why the lane looks half-finished.
4. **Two thresholds with opposite equality rules must be pinned together.**
   δ stops at equality (`moved > δ`), ε continues at equality (`leverage < ε`).
   I pinned ε's equality because the DoD demanded it, and only found δ's
   equality gap by running the `>=`/`>` mutant — which SURVIVED until I added
   the mirror test. Any spec with a pair of thresholds should have both boundary
   cases in the DoD, not one.
5. **Instrument before the third hypothesis.** I formed two hypotheses about the
   truncation and tested neither cheaply. The `T07_TRACE` env-gated `console.error`
   answered it in one run and printed the exact numbers (0.72 → 0.72,
   `maxRootMovement: 0`) that became the finding. Budget instrumentation as the
   SECOND step, not the fifth.

## r2

A ruling round, and the cheapest round in the lane: J15 answered both blocking
findings and the work was three hours of r1's investigation cashed in at once.
The case-file question this round answers is narrower — **what did r1's
investigation buy, and what did it fail to buy?**

### WHAT THE r1 INVESTIGATION BOUGHT

Everything in r2 was already paid for. J15(a) told me to derive the boundary;
I had already measured *why* the naive one was wrong and had the exact leg
indices (2, 6, 8 vs the derived 7, 11) sitting in a trace log. J15(b) told me to
refuse vacuous stops; I had already measured the vacuity (0.72 → 0.72, zero
measured edges). **r2 cost roughly 35 minutes and zero dead ends.** The r1
decision to STOP and hand up, rather than guess, is the whole reason.

Concretely: r1 removed the hook and shipped red-free. Had r1 instead "fixed" the
fixture to match the truncated expansion, r2 would have started by *un*-breaking
another lane's envelope proof — and nobody would have known to look, because the
suite would have been green.

**The generalisable rule: when a lane's failure is a QUESTION rather than a
defect, the expensive artifact is the measurement, not the code.** Ship the
measurement, hold the code. r1's trace log was worth more than r1's wiring.

### WHAT r1 FAILED TO BUY, and it cost r2 a real gap

I asserted in r1 that the wiring "cannot be made both correct and non-truncating
for this fixture without resolving the spec question." **That was too strong, and
it was wrong in a way I should have caught.** Two independent defects were
tangled together — the wrong boundary (J15(a)) and the vacuous stop (J15(b)) —
and I treated them as one blocker. Fixing only the boundary would have left the
fixture red; fixing only the vacuity would have left root 1 truncated. Because I
never separated them, I concluded neither could be fixed alone and stopped.

That conclusion happened to route correctly (both ARE spec questions), but the
reasoning was luck, not method. **When a symptom has two candidate causes, prove
each one is INDEPENDENTLY insufficient before declaring the whole thing blocked.**
I could have demonstrated that in ten minutes with the trace I already had, and
my r1 handoff would have named two findings as jointly necessary rather than
implying one tangled wall.

PRICE of the omission: none in wall-clock (J15 ruled both anyway), but the r1
report understated how tractable the lane was, which is a cost to the judge's
planning even when it costs no rounds.

### THE NEIGHBOUR MUTANT THAT SHOULD NOT HAVE SURVIVED

M8 dropped the `strength !== null` conjunct from `countMeasuredEdges` and the
suite stayed green — every fixture happened to put a strength on every MEASURED
edge. I had designed M8 as a *neighbour* (expected to survive), and it survived
for the wrong reason: not because the assertions correctly declined to over-reach,
but because no fixture exercised the case at all.

**A neighbour mutant that survives is only evidence if you can say WHY.** I
nearly logged it as a clean neighbour result. The distinction that saved it: a
neighbour survives because the property is genuinely unrelated; a GAP survives
because the property is untested. `MEASURED` with a null magnitude is exactly the
vacuity rule's business — a stamp is not a magnitude — so it was a gap. Pinned;
the mutant now fails. **Add to the refutation checklist: for every surviving
neighbour, state the reason it survived in one sentence. If the sentence is "no
fixture covers that," it is a gap, not a neighbour.**

This is the second time in this lane a mutant found a real hole (M4 in r1 for the
δ equality boundary). Both holes were on BOUNDARY conditions of a threshold, and
both were in the half of a threshold pair that the DoD did not name.

### WHAT I WOULD CHANGE IN THE MACHINE, after two rounds

1. **The base-suite cache** (r1's headline) still stands and is still unbuilt.
   r2 spent ~9 more minutes on three integration runs whose only job was to
   confirm membership against a base I had already measured in r1. Cache the
   base per `(lane, base-sha)` and every round after the first is a set-diff.
2. **A ruling round should carry the RED it expects.** The coordinator's message
   did this — "your broken-fixture trace is the refutation target, RED = the
   mid-plan cutoff, GREEN = fixture green" — and it was the single most useful
   sentence in the round, because it told me the mutant to build before I wrote
   any code. Make it standard: every ruling that reverses a worker's decision
   names the refutation that must demonstrate the reversal.
3. **Threshold pairs get both boundaries in the DoD.** Third time saying it,
   because it cost twice: δ stops at equality, ε continues at equality, and the
   DoD named only ε's. Any spec that ships two comparisons should ship four
   boundary cases.

## r3

Seat `opus-t07-w5b` — a FRESH seat. The r1/r2 seat was killed by the weekly
limit mid-round; its uncommitted work was checkpointed as `c248f7f` by the
orchestrator and handed to me to read critically, keep, fix or discard.

Treat it like a murder case. There is a body this round too, and it is not the
one the packet expected: the inherited fix was **correct and unpinned**, and the
suite was green over the hole.

### THE CAUSE, named once

**A test that hands the disputed value in by hand cannot pin the seam that
produces it.** Codex B1 was about the LIVE CALLER building `rootNodeIds` — the
expansion loop dropping roots that lack judged standing. The inherited round
fixed that line and wrote four B1 tests. Every one of them passed the root scope
in as a literal. So the first thing I did was rebuild codex's exact bug
(`MB1a`: restore `scoredNodeIds.has(root)` at the caller) and run the suite:

```
Tests  37 passed (37)
```

**The whole suite was green with the reported blocking defect back in the
product.** Same class as the r2 self-report's own confession about M8 — an
assertion that pins its demo, not its property — one round later, on the finding
that was supposed to have cured it.

PRICE of finding it: ~4 minutes (one mutant). PRICE of NOT finding it: the round,
and probably the next one, because codex predicted precisely this check ("whether
another lens demanded `rootNodeIds.length === effectiveMakerCount`").

### WHAT THAT SAYS ABOUT THE MACHINE, and it is the main lesson of this round

The refutation duty says *build the mutant your assertion exists to catch*. The
inherited round built mutants for its own new code and none for **the reported
defect itself**. Make it a rule with a name:

> **THE REPORTED-DEFECT MUTANT.** Before a rework round is handed off, the seat
> re-applies the reviewer's exact bug, verbatim, at the exact file and line the
> review named, and shows the suite RED. If the suite stays green, the finding is
> not fixed — it is merely no longer present.

This is mechanically checkable, costs one mutant per blocking finding, and it is
the only evidence that distinguishes "I changed the line the reviewer pointed at"
from "I closed the hole the reviewer found". Two of this lane's three rounds
would have caught a real gap with it.

### THE SECOND LESSON: fix the LAW, not the caller

Once MB1a survived twice (before and after I re-aimed it at the new seam), the
honest conclusion was that no unit test in this repo can observe that closure —
the live boundary runs only under the embedded-postgres harness, and there every
maker root has standing, so no behavioural fixture can tell a narrowed scope from
a whole one. Guarding the one caller that exists today is guarding a habit.

So the law moved into the decision: it is told `expectedRootCount` — the run's
maker count, produced by a function that is **never told which roots have
standing and therefore cannot narrow by it** — and δ-convergence is refused
unless it compared that many. Narrowing anywhere upstream can no longer buy a
stop; it can only fail the gate. That is the difference between a fix and a
cure, and it is worth the extra required field at seven call sites: the field is
REQUIRED, so `tsc` names every caller that has not said what its run expects.

### WHAT I NEARLY GOT WRONG

I nearly reported codex B2 as needing the round-major replan its "required
correction" paragraph demands. J15 ADDENDUM-2 had already NARROWED that ask to
the mark's truth and explicitly declined the replan (it lives as V-T7-r2-1).
Reading the review before the ruling that answered it would have cost a whole
lane's worth of work on a question already settled. **Order of reading matters:
ruling first, then the review it answers.** The packet listed them the other way
round.

### DEAD ENDS — do not re-derive these

- **A live-caller fixture for B1 does not exist and cannot be cheaply built.**
  `closeGlobalRound` is a closure inside `executeWorkItem`; the only harness that
  reaches it is `tests/integration/database.test.ts` with embedded postgres, and
  its two-maker fixture gives BOTH roots standing. A partial-standing variant
  needs a scripted review-exhaustion path plus the 48-attempt envelope
  arithmetic re-derived. Priced at 45–90 minutes with real failure risk; not
  taken. What was taken instead: the semantic invariant + one structural pin,
  both labelled for what they are.
- **The ledger cannot carry the scope.** `appendLedger` has a fixed column set
  (no free-form payload), so "assert the persisted decision named both roots" is
  not available without a schema change — which is a one-way door and out of
  contract. Do not go looking again.

### WHAT REPEATEDLY COST TOKENS THIS ROUND

1. **`buildMultiMakerExpansionPlan(depth, makerCount)` takes DEPTH FIRST.** I
   wrote a generalisation loop over `(M, depth)` pairs and it silently asserted
   about different trees — two false RED failures and a diagnostic run to see it
   (~6 min). Both arguments are small integers, so nothing errors; the plan is
   legal, just not the one you meant. Recorded in TOOLING-TRAPS. **Any two-arg
   function whose parameters are same-typed small integers should take an object.**
2. **zsh word splitting, again.** `Z="a.ts b.ts"; vitest run $Z` → `No test files
   found, exiting with code 1`, three cluster runs in a row, in under a second —
   which reads exactly like a broken zone. The generic trap was already in
   TOOLING-TRAPS and I paid it anyway, because the entry did not carry the fix in
   the form you need at 2am. It now says: use an ARRAY.
3. **Re-deriving the base classification.** Third round in a row this lane has
   spent heavy-suite minutes confirming a base it already measured. r1's proposal
   (cache the base membership per `(lane, base-sha)`) is still unbuilt and is
   still the single best minutes-per-round saving available here. This round I
   read the stored `integration-TRUEbase.log` instead of re-running — which is
   the cache, done by hand, and it worked; make it a rule that the base log is
   the artifact and only the TIP is re-run.

### HOW TO MAKE THIS A ONE-PROMPT MACHINE — this round's additions

1. **Ship the reported-defect mutant as a packet field.** The packet already
   names the RED it expects in prose ("RED = codex's partial-standing M=2 fixture
   at the CALLER seam"). Make it executable: the packet carries the mutant token
   (file, line, before/after text) and the handoff carries its transcript. The
   orchestrator can then verify a rework round mechanically, without reading the
   diff.
2. **A packet that names a seam must name a way to reach it.** This packet asked
   for a fixture "at the CALLER seam" and that seam has no test harness. Either
   the packet says which harness reaches it, or the seat is authorised to say
   "unreachable, here is the invariant instead" without spending a round
   discovering it. I spent ~15 minutes proving unreachability that the
   architecture already knew.
3. **Inherited work needs a provenance line, not just a diff.** `c248f7f` was
   handed over as "read it critically". What made that possible in reasonable
   time was that the previous seat's own RED/GREEN logs were still on disk under
   distinguishable names. Rule: a checkpoint commit is accompanied by the list of
   log paths it produced, and the resuming seat writes its own frames under a
   DIFFERENT prefix (`r3b-` here) so the record never conflates two seats.
4. **Order the packet's reading list by authority, not chronology.** Ruling
   before review, always: a ruling that narrows a review's ask is the only thing
   that stops a seat implementing the review's widest reading.

## r4

Seat `opus-t07-w5b`, same session, final lawful round (3/3).

Treat it like a murder case. The body this round is **a sentence I wrote**, and
the weapon was my own confidence.

### THE CAUSE, named once

In r3 I wrote, in the report headline: *"the law now lives where no caller can
get around it."* The code underneath said:

```ts
readonly expectedRootCount?: number;          // optional
const expectedRootCount = input.expectedRootCount ?? input.rootNodeIds.length;
```

An optional field with a fallback to the caller's own already-narrowed scope.
A direct caller of the exported strict decision could omit the count and get its
narrowed scope handed back as the standard to measure against — which is r1's B1,
verbatim, at the public API. I had moved the law one layer inward and then
described it as if I had closed it.

**The tell was in my own prose.** I made the strongest claim in the report about
the one thing I had deliberately weakened for convenience — I chose optional
"to avoid churn at seven call sites". The rule that falls out:

> **ATTACK YOUR STRONGEST SENTENCE.** Before handoff, take the report's boldest
> claim, write it as a predicate, and build the mutant that violates it. If the
> claim is "no caller can get around it", the mutant is a caller getting around
> it. I built a mutant for the caller I had (MB1a) and none for the sentence.

PRICE: one full rework round — the last lawful one. Cost of the check I skipped:
about four minutes, the same as MB1a.

### THE SECOND CAUSE, and it is the more interesting one

Codex's B2 (the partial-scope arm erasing movement and skipping every guard) was
not a bug I introduced by carelessness. It was **inherited from `c248f7f` and
blessed by my own critical read.** My r3 table says `decideRoundBoundary … KEPT —
the right shape for a root that is present but unscored`.

The shape was wrong, and the reason is structural: it was a **second copy of the
arm ordering**. Two hand-written copies of floor/ceiling/no-previous/no-evidence/
coverage, one of which had its movement fields hard-coded to `null` and `[]`.
A fact can only be erased where it is written down twice.

**What my critical read actually did:** it attacked the checkpoint's *fix for the
finding I was handed* (B1) and accepted the *new code the checkpoint introduced*
(the partial arm) because it "looked like the right shape". Those are different
audits and I only ran one.

> **INHERITED CODE: audit the NEW SURFACE, not just the named fix.** A checkpoint
> that answers finding X almost always adds structure nobody reviewed. List the
> new functions and new branches it introduces and treat each as unreviewed code,
> because it is.

The r4 fix deletes the duplication rather than patching the copy: one validated
`decideWithScope` body, both entry points delegate. That is also why I found the
**floor arm** erasing `movedRootNodeIds` — invisible while there were two copies,
obvious the moment the arms sat in one list beside the ceiling arm that recorded
them. I nearly shipped codex's B2 as a two-line patch to the two offending
fields; that patch would have left the duplication and the floor wrinkle, and the
next reviewer would have found it.

### WHAT WENT RIGHT, and should become fleet law

1. **The reported-defect mutant worked.** MC1 and MC2 are literally codex's two
   bugs restored at the exact lines it named, and both are caught. This is the
   rule I proposed in r3's self-report; it took one round to pay off. It belongs
   beside D24 as a handoff requirement for every rework round.
2. **A REQUIRED field is a worklist.** Making `expectedRootCount` mandatory turned
   `tsc` into the complete list of callers that had never stated their run's maker
   count — 15 of them, found in one command, none by reading. Optional fields with
   sensible defaults are how a law becomes a suggestion. **Prefer a required field
   and a compiler error over a documented convention**, every time.
3. **The compile-time negative fixture is real RED.** `@ts-expect-error` on the
   omission fails `tsc` with TS2578 the moment the field goes optional again. It
   is the only mechanical guard against this exact regression, it costs three
   lines, and it produced a genuine pre-implementation RED frame.

### D24, which came out of my own r3 campaign

My r3 transcripts recorded outcome + file hashes + porcelain, but **not the
mutation itself and not the post-restore token grep**. D24 now requires both
(same class as F-TINT1-10). The r4 harness emits `git diff --unified=2` of the
applied mutation, token greps on both sides, and hashes on both sides.

The lesson is not "write better logs", it is: **the transcript format should be a
committed harness, not a shell function each seat re-invents.** Three seats have
now written three slightly different mutant loggers, and the ruling exists because
the third one was still missing a field. Ship `tools/mutate.sh` and D24 becomes
unbreakable rather than remembered.

### WHAT REPEATEDLY COST TOKENS

1. **Call-site churn from a required field: ~12 minutes across two passes**, and
   my first patch script had a lookahead bug (its 13-line window saw the NEXT
   call's field and skipped three sites). A single `awk` that prints every call
   block missing the field found them in one shot. **Write the detector before
   the patcher** — the detector is also the verification.
2. **Host contention.** Zone runs at load 16–19, one focused integration fixture
   at load 27. The coordinator's "focused/zone only" instruction was right and
   cost nothing this round precisely because I could substitute a single-test
   integration run (`-t "runs a depth-2 two-maker tree"`, 1 passed | 65 skipped)
   for a three-run heavy cluster and still get live-path evidence.
3. **Still no base-suite cache.** Fourth round of saying it. This round I did not
   need it only because I did not re-run the heavy file.

### THE ONE-PROMPT MACHINE — r4's additions

1. **Every rework handoff carries the reported-defect mutant transcript.** Pair it
   with D24 and a rework round becomes mechanically verifiable by the orchestrator
   without reading a diff.
2. **A claim in a report is a testable predicate.** Require that the report's
   headline claim name the mutant that would falsify it. My r3 headline named
   none, and that is exactly where the round failed.
3. **Ship the mutation harness in-repo.** See D24 above.
4. **A finding's fix should reduce the number of places the fact lives.** Both of
   this lane's last two blocking findings were duplication defects — a caller's
   private copy of the root scope (r3), a second copy of the arm ordering (r4).
   Ask of every fix: *does this add a copy or remove one?*

## T7B

V-authorized micro-ticket (V-T7-codex-r3-1), same seat, same session. **Not a
fourth rework round** — the cap stands at 3/3.

Treat it like a murder case. The body is a false record that **my own test
fixture built, handed to the assertion, and the assertion refused to look at.**

### THE CAUSE, named once

My r4 interface-contract test constructs an array of seven arms to check one
biconditional. Arm four is:

```ts
decideRoundBoundary({ ...boundaryInput, measuredEdgeCount: 0 }),   // no evidence
```

`boundaryInput` is the case where root A moves by exactly 1/4 and root B is
uncomparable. So that line *manufactures* codex r3's B1 counterexample — the
exact input, already in my file — and then the test asserts only

```ts
maxRootMovement === null  <=>  comparedRootNodeIds.length === 0
```

which that arm satisfies. The record it returned said A was compared, that the
maximum movement was 0.25, and that no root moved more than δ = 0.01. Two of
those three cannot both be true, and my test walked past it because it was
looking at one field.

**A matrix test that checks one field per row is a coverage illusion.** It
visits states without examining them, and it reads as thorough — seven arms! —
precisely while averting its eyes. The rule:

> **If a fixture is rich enough to discriminate, the assertion must be too.**
> When a test enumerates states, assert the FULL record for each state, or say
> in the test why the other fields are out of scope. "The arm is covered" is not
> the same as "the arm is checked".

Codex predicted this failure exactly, in r2's own PREDICTIONS section: *"at least
one will not inspect the no-evidence arm's separate moved-root list, even though
the fixture already supplies the discriminating movement."* He wrote that before
he found it. I read that prediction and did not act on it.

### THE SECOND CAUSE, which is the one worth fixing in the machine

In r4 I fixed two arms of this exact class — the partial-coverage arm (codex's
finding) and the round-1 floor (which I found myself, because collapsing two
copies into one body put the arms side by side). Finding a second instance should
have been the signal to **enumerate the class**. There are eight arms; listing
and classifying all eight takes four minutes; I did not do it. Codex did, in his
own review, and found the third.

> **After the second instance of a defect class, stop fixing instances and sweep
> the class.** Produce the enumeration as a table in the report — every site, its
> classification, and why the safe ones are safe. Two instances is the threshold,
> not three, because by the third someone else is finding them for you.

This round the packet ordered the sweep (task 5) and it cost four minutes and
found nothing new: one true erasure (fixed), three literal empties that are
*provably* equal to `moved` because they sit where movement is null or where the
arm is only reachable with an empty moved set. That table is what r4 should have
carried.

PRICE of not sweeping in r4: one V-row escalation, one V authorization, one
micro-ticket, one codex re-review — for a one-line change.

### WHAT THE HOST HOLD CHANGED, and an honest limit on this round's RED

The hold ("write the code and the test now, run nothing") forced write → commit →
run, so this round's RED is the **reported-defect mutant** (`T7B-M1`, restoring
`Object.freeze([])`), not a pre-implementation failing run. It is labelled that
way in the report.

Worth stating precisely, because it is the kind of thing that gets glossed: a
mutant-as-RED proves the assertion **catches** the defect; it cannot prove the
assertion was written before its author knew the answer. Here that gap is closed
by provenance rather than by sequence — the expected values (`NO_MEASURED_EDGE`,
`0.25`, `["root:A"]`) are codex's published input, fixed by someone else before I
wrote a line. When a hold forces this order, say which of the two properties your
evidence has.

### WHAT WENT RIGHT

1. **D27 is cheap and it works.** Change, commit once, stamp every gate with
   commit + tree. The gate runner refuses to start on a dirty tree, so a stale-tip
   record cannot be produced by accident rather than merely discouraged. Total
   cost: about ten lines of shell.
2. **The D24 addendum harness paid for itself immediately.** The token is the
   mutation, the three counts are gates; `T7B-M1` came out admissible on the first
   run with no thought spent on the format. This is the argument for shipping the
   harness in-repo: the second seat to use it spends zero minutes on it.
3. **Static checks under a hold are not nothing.** Unable to run anything, I still
   verified the mutant's token pre-count (0) and OLD uniqueness (1) — both pure
   file reads — and grepped for any landed `NO_MEASURED_EDGE` assertion my change
   might break (one exists; its movement is exactly 0, so `moved` is empty there
   and it was unaffected). All three were confirmed by the later runs. **A host
   hold is a reason to choose cheaper evidence, not to stop gathering it.**

### THE ONE-PROMPT MACHINE — T7B's addition

**Make the class sweep a handoff field.** Every finding-fix handoff carries: the
defect class in one sentence, the enumeration of every site in that class, and
each site's classification. The orchestrator can diff that table against the next
reviewer's independent scan. Both of this lane's post-cap findings were third
instances of a class whose first two had already been fixed — the sweep is the
cheapest artifact in this whole protocol and it is the one nobody produces.

## T7 merge (mission 1fad4e16 → lane/t7)

Nine hunks, all additive, all resolved by keeping both sides. The only thing
worth a case file is the one that was **not** additive-looking.

### THE NEAR MISS

Three of the nine conflicts presented as *comment-only* — two lanes each
rewriting a sentence that said "31 → 32". A comment conflict invites a glance and
a pick. But those comments sit directly above **exact count pins**, and the merged
vocabulary is 33, not 32: each lane minted one mark. Resolving the prose and
moving on would have left three landed assertions asserting a number that the
merge itself had falsified — red suite at best, and at worst a reviewer concluding
the merge broke the vocabulary.

> **A comment conflict is a signal that the CODE under it was contested.** Two
> people rewrote the same explanation because the thing it explains changed on
> both sides. Read what the comment describes, not just the comment.

The generalisation that would have caught it without insight: **after resolving a
conflict, grep the tree for every pin on the quantity the conflict was about.** I
did that here and it proved those three were the only stale pins — the two derived
`Set(labels).size === CONDITION_MARKS.length` assertions needed nothing, and the
other `32`s in the suite are argon2 salts and registration slots.

### WHAT I DID RIGHT, and would do again

- **Verified the auto-merges instead of trusting them.** `kernel`,
  `apps/ui/lib/v3/labels.ts` and `web/lib/v3Presentation.ts` merged cleanly and
  were exactly where a silent loss would hurt most (a dropped mid-list mint, a
  missing forced label line, a disturbed DR-176 tail). Git being quiet is not
  evidence. I measured the tail from the array's own bounds rather than eyeballing
  a `tail -4`, which is what caught my first attempt reading the wrong array.
- **Checked the guard-ordering question against both lanes' fixtures** before
  choosing an order, rather than reasoning about which "should" come first. The
  answer (neither fixture can tell) made the choice free, so I spent it on keeping
  both code comments true.
- **Measured the baseline on a detached checkout of the merge target** so the
  D14/D16 pairs and the zone set-equality compare against `1fad4e16` itself
  instead of against a stored log from another tip.

### THE COST, and the one-prompt lesson

The merge took roughly one gate cycle end to end, and the expensive part was not
resolving — it was *proving* the resolutions harmless: a detached baseline
checkout, two `generate:contract` runs, and eight stamped gate logs.

> **Ship the merge-verification recipe with the merge order.** The orchestrator's
> message already named the expected conflict files, which was worth a great deal.
> One step further — naming the baseline commit for every set-equality comparison
> and the pins to re-grep — would make an integration merge a scripted checklist
> rather than a judgement call re-derived per lane. The mark-count pin is the
> obvious first entry: any merge of two lanes that both minted a mark has this
> exact arithmetic waiting in it.
