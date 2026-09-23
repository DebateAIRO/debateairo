# S07 self-report — worker seat `opus-s07-w7`, filing r5 (rework 3 of 3)

## The doubt I filed against myself was the most useful thing I wrote

In r4 I wrote that the retained request carrier was "an argument I made in my own
favour" and asked a reviewer to push on it. It was. The SPEC never asked for the
request to be persisted, and the column could not have proved "as sent" because
the same in-memory object fed the packet and the row. I had reasoned from a
premise I wanted rather than one I had checked — and I noticed the shape of it
without following it to the conclusion.

The lesson is narrower than "be careful". **When I catch myself constructing an
argument for keeping something, that is the moment to test the argument, not to
file it with a flag on it.** Flagging it was better than hiding it, and worse
than resolving it. I had the evidence to resolve it: I knew `raw_text` was the
response and `input_hash` was null when encrypted — I never asked the next
question, which was whether the SPEC wanted the body at all.

## R5M2 survived twice, and both times my test was the problem

The round-binding mutant survived the first campaign because I had written no arm
for it. I added one — and it survived again, because the arm was refused by the
*work-item* binding before it ever reached the round guard. **A test that passes
for the wrong reason is worse than a missing test**: it would have let that guard
rot while reporting green forever. Only the mutant distinguished them; nothing in
the passing output did.

That is the fourth time this lane a gate has been more right than I was (the
dirty-tree abort, R4M1's plaintext write, and twice here). I have stopped reading
a surviving mutant as an inconvenience.

## What I did well, and it is narrow

- I accepted all seven blocking findings across three reviews without arguing one
  down, including two that invalidated designs I had just defended.
- Every disclosure this lane adds now crosses the persistence boundary and is
  asserted there.
- I disclosed the scope extension to a pre-existing refusal path (J26 b) and the
  two-commit rounds rather than letting a reviewer find them.

## For V, since no lawful round remains

Four V-rows are drafted in the report with decision, recommendation and default:
the round guard's narrow reachability, the reader's `[]` for a non-owner, the
in-place rewriting of migration 0057, and the multi-commit rounds against D27.
Each has a default that ships if V says nothing; none of them is load-bearing for
the DoD.

**The one I would most want a second opinion on** is V-S07-1. The round binding
is a string check over a call-site convention the runner owns, and serve does not
parse it structurally. It is a second lock behind a sound one, so I let it stand
— but if the call-site format ever changes, that check degrades to always-true
and only a mutant would notice. A typed shared vocabulary would close it.

## Rounds

Rework rounds spent: **3 of 3**. There is no lawful round after this filing.

---

# T9B self-report — the murder case, r1 (BLOCKED at STEP 0)

`SKILLS LOADED: heartbeat, heartbeat-protocol, heartbeat-worker, superpowers:using-superpowers,
superpowers:test-driven-development, superpowers:systematic-debugging,
superpowers:verification-before-completion`

Filed 2026-09-03. Wall clock: about 55 minutes, of which ~8 were protocol reading, ~20 the
merge and its resolution, ~15 the measurement and class sweep, ~12 the filing. Zero product
lines written, by contract.

## The cause, named

**A lane parked on a V decision keeps accruing merge debt at the rate the other lanes ship.**
S07 stopped at `9a3a5f60` on 2026-09-02 and waited for a ruling. In that window seven lanes
merged. The ruling arrived and authorised a *narrow* correction — bind role as a predicate —
but the lane it authorised could no longer be reached without first crossing an interface
collision nobody had priced, between two lanes that had each already passed review.

Nothing here was anyone's carelessness. T9 retired the conformance gate because goal-v4 248-262
told it to. S08 built the band basis on the conformance-verified set because goal-v4 told it to.
Both were reviewed and both are right. The defect is that **no seat owned the pair**, and the
collision surfaced in the one place where nobody was looking for a design question: a merge
resolution assigned to a worker with a two-item charge.

## What this cost, and what it would have cost later

The block cost this round — call it 55 minutes and zero progress on B1/B2.

The alternative was worse and was genuinely available: the six conflicts auto-resolve to
something plausible, and the three count pins in particular resolve *cleanly to a wrong number*
if you add the comments up instead of counting the array. I nearly filed 33. Had I resolved
those three by trusting the comments, and had I ported S08's arms "mechanically", the lane
would have merged green with L200 quietly rewritten and F-T9B-1 shipped — a confidence band
computed over citations that failed tracing, in a system whose Scope law forbids exactly that.

That is the shape this mission keeps paying for: **the merge is where two correct things become
one wrong thing, and it is the least supervised step in the loop.**

## What I nearly got wrong

1. **My own counter was a D56 instance.** My first extractor used `[A-Z0-9-]+` and silently
   dropped four underscore marks, returning 33 — which *matched integration's pin exactly* and
   would have looked like confirmation. A wrong tool agreeing with a wrong comment is the most
   convincing failure mode there is. What caught it was that 33 also had to equal HEAD's 36
   minus something, and it did not. I then did what D56 asks and fed the counter a file with one
   mark removed to watch it change, and a file with no array to watch it refuse.
2. **I nearly asserted that 8 of the 9 chain arms port cleanly.** They look like they do. I had
   not compiled a single one. That sentence is now `CANNOT-ASSESS` in the filing, which is the
   only honest form D51 leaves available.
3. **I nearly wrote "15 across four campaigns" for the record correction**, because the packet
   said the 15 stand and 19 − 4 = 15 is arithmetically clean. Then I counted the actual files:
   30 transcripts, 24 mutants, 6 neighbours. Nineteen is not derivable from the artifacts at
   all. Writing a clean number I could not derive would have been D34's defect wearing D51's
   clothes.

## What repeatedly costs tokens here, from this seat's evening

- **Reading a ruling's summary instead of the artifact.** Codex scoped B2's D42 defect to the
  R5 campaign. Running the mission's own index tool took 20 seconds and showed all 30
  transcripts share it. Every time this mission has re-derived a claim from a tool instead of a
  narrative, the narrative was narrower than the truth.
- **`git merge` resolving by position.** The three count-pin conflicts are the cheapest possible
  illustration: both sides are exact pins, both are correct, and the merged answer is neither.
  There is no automation that gets this right, and no gate that catches it — the tests would
  have gone red, but only if someone ran them, and the lane could not run them because it did
  not compile.
- **Evidence taken at a tip that cannot be the final tip.** I ran two gates and stopped. The
  temptation to "get the RED arms written while the decision is pending" is strong and it is
  always wasted: D27, D41 and D53 are three separate rulings about the same lost work.

## What to upgrade

1. **Price the merge before authorising the lane.** The T9B packet was drafted in advance —
   correctly, to save time — and it declared a base tip that was already 4 lanes stale when
   written and 7 when dispatched. A packet that names a stale base should carry a *merge
   feasibility line*: does the integration tip typecheck against this lane's HEAD? That is one
   `git merge --no-commit` and one `typecheck` — under two minutes — and it would have converted
   this entire round into a V DECISIONS row written a day earlier.
2. **A cross-lane interface gate.** T9 changed `ServeGateDependencies` — a type five test files
   and the runner depend on. Nothing in the harness notices when one lane deletes an interface
   member another lane's landed tests use, until a human merges. A cheap gate: for each open
   lane, `git merge --no-commit integration && pnpm run typecheck`, nightly, reporting only the
   pairs that fail. It would have named T9×S08 on 2026-09-02.
3. **Make "admissible" a defined term.** My packet asked me to correct a count to "what the
   admissible evidence supports" while D42 was ruled *after* the evidence in question. Two
   defensible answers, zero written adjudication, and a worker with no authority to choose. Any
   ruling that changes an evidence contract should say, in the ruling, what it does to records
   already filed.
4. **The stop condition worked, and it should be reused verbatim.** The dispatch said "a genuine
   conflict with a landed assertion is a finding you file and stop on", and it said "a clean
   auto-merge is the case to CHECK, not the case to wave through". Both were load-bearing. The
   second is the one I would put in every merge packet from now on: it is the sentence that
   stopped me from trusting three green-looking hunks.

## Toward the one-prompt machine

The single highest-leverage change is item 2, because it converts the most expensive failure in
this mission — a design collision discovered during a merge, by a seat chartered for something
else — into a nightly report that names the pair while both seats are still live and still hold
their context. Everything else this evening was a seat correctly refusing to guess. That part
of the machine already works; what it lacks is anything that looks ACROSS lanes before they
touch.

Second: the packet drafted in advance is a genuinely good invention that saved real time, and it
has exactly one flaw — every constant in it decays while it waits. A staged packet should carry
its constants as *re-derivable commands* rather than literals, in the same way D53 ruled for
citations. `git rev-parse lane/s07` outlives a night; `9a3a5f60` did not.

---

# T9B self-report, part 2 — after the ruling

Wall clock for this half: about 70 minutes. Five commits, one blocked item, three mutants
that changed my mind about my own code.

## The one that matters: a mutant refuted my fix, and I nearly never ran it

I wrote the role predicate as `derive the expected key → require equality → resolve the
ledger entry by the derived key`. Three negative arms went RED then GREEN. It looked done.

Then B1M1 neutralised the equality check and **survived**. Every arm I had written was
already refused one line later by the ledger lookup, because that lookup resolves by the
*derived* key — so equality was decorative against everything I had built to test it. I had
written a check, watched tests pass around it, and never once asked what input would make
it fire alone.

The input exists and is not exotic: one artifact recorded at BOTH role call sites, which
the pre-existing wrong-round fixture in the same file already constructs. Added as arm 4,
B1M1 dies on it.

**I would have shipped a decorative guard with four green arms and a clean campaign** if I
had skipped that mutant, or if I had written the campaign to confirm rather than to refute.
D37 says the mutant you expect to be redundant is the one carrying information; that is now
a thing I have been taught rather than a thing I had read.

## The second one: I reproduced the exact defect I was sent to fix

Codex B2's whole finding was that R5M1/R5M2 died of the wrong cause — 42P18 and 23514
instead of the binding assertion. I rebuilt **my** arms on an activation-free run so guard
removal would resolve. Then B1M2 and B1M3 died on `WAIT_DRAIN_REQUIRED`, because the
*older* arms they kill still ran on `createRun`'s full battery. I had fixed the instance
and not the class, in the very lane whose charge was that distinction.

Worse, the tooling said it was fine: `mutant-index.py` reported the campaign **CLEAN**,
because it classifies "assertion frame present" versus "threw before any assertion". A
wrong-cause death that still lands inside an `expect` is, to that tool, a clean kill.

**Naming this precisely, because it is a gap in a mission tool, not in a seat:** D42 is
mechanised, D43 is not. `mutate.sh` proves custody; `mutant-index.py` proves form; nothing
proves *credit*. The only thing that caught it was reading the kill line. A cheap upgrade:
let the manifest carry the expected killing assertion (`<name> KILLED <file>:<line>`) and
have the index compare the observed `❯` frame against it. That is a twenty-line change and
it converts D43 from a discipline into a gate.

## What I nearly got wrong, second half

- **I nearly implemented the ordered guard and moved on.** It typechecks, it is four lines,
  and it does what the ruling says. Running the suite first is the only reason I know it
  breaks the frozen goal's own DoD row. "I read the diff and it follows" would have shipped
  a goal violation with a ruling to point at.
- **I nearly reported the guard collision as an argument** — quoting the goal text and the
  prose claim about four crash classes. Applying it and filing the two verbatim failures is
  a different quality of finding, and it cost about four minutes.
- **I let `git apply` fail silently.** I piped it through `head -5` and read `rc=0` from the
  pipe, not from git; the patch had failed atomically on three already-staged files and I
  briefly believed a merge had been restored that had not. `${PIPESTATUS[0]}`, or no pipe.
  This is the same shape as everything else on this list: I checked a thing that could not
  report the failure I cared about.

## What repeatedly costs tokens

- **Fixture archaeology.** Roughly a third of this half went into learning why a terminal
  write trips a trigger, which fixtures avoid it, and that the successful callers all pass
  `batteryRows: []`. None of that is written down anywhere; it is recoverable only by
  grepping other tests and reading a migration. A one-paragraph note beside
  `persistTerminalRun` — *"a run with battery activations cannot take a TERMINAL progress
  event until they are drained; negative arms want `batteryRows: []`"* — would have saved it,
  and would have saved R5M2 before me.
- **Re-deriving the same six merge conflicts.** The saved patch did pay off, but only after
  I wasted a cycle trying to replay it into a live merge. A patch is the wrong artifact for
  restoring a merge; the right one is the resolved blob per conflicted path, or simply
  committing the merge when it is made.

## Toward the one-prompt machine

Sharpening what I said in part 1, now that I have been through the other side:

1. **The cross-lane interface gate is still the biggest win**, and this half is more
   evidence: `ServeGateDependencies` changed under five files and nobody knew until a human
   merged. Nightly `merge --no-commit integration && typecheck` per open lane, reporting
   only failing pairs.
2. **Mechanise D43** (above). Every other evidence ruling in this mission got a tool; the
   one about *credit* did not, and it is the one that has now failed twice in the same lane.
3. **A ruling that touches a frozen artifact should say so in the ruling.** The guard I was
   ordered to add re-terminalises a gate the goal explicitly re-routes. That is legitimately
   V's to override — but it arrived as a small local instruction, and a seat implementing it
   literally would have violated the goal while believing it was obeying authority. A single
   line — "this overrides goal lines 255-268" — makes the override auditable and costs
   nothing.
4. **The stop-then-resume loop worked, and it was cheap.** Blocking cost 55 minutes and
   returned a finding V confirmed was worth having. Resuming cost 70 and delivered three of
   four items. The expensive path was never the stop; it was the two places I almost did not
   stop, and both were caught by a mutant rather than by judgement.

---

# T9B self-report, part 3 — implementing the purpose instead of the mechanism

## What the ruling correction actually taught

The coordinator's own account — a mechanism borrowed from integration's vocabulary,
recorded beside a purpose that was correct — is the same failure shape this mission has
been naming all evening, one level up. D51 says generate the causal claim. This was a
*prescriptive* claim with the same defect: `componentsOnly` was true of the tree the
sentence came from and not of the tree it was aimed at.

The practical lesson for a worker seat is narrower and worth stating: **when a ruling names
both a purpose and a mechanism, the purpose is the part that binds.** I implemented the
mechanism literally, measured it, and it broke the goal. Implementing the purpose took
one line and broke nothing the goal protects. Had I treated "returns componentsOnly" as
the requirement rather than as one way to reach "must not be counted into the band", I
would have shipped a goal violation with a ruling to point at — and the ruling's author
has now said plainly that would have been their error propagating through me, not mine.
That does not make it cheaper. A seat that implements prescriptions literally is a seat
that launders upstream mistakes into code.

## What I got wrong in this segment, and how it surfaced

**I predicted one collision and there were three.** I reasoned that option 2 would break
the `t09-synthesis` arm, and it did. I did not check `serve-s05`, where a helper called
`unsatisfied(objection)` hardcoded `citationTracing: false` and two arms then asserted
SERVED — one of them literally named `servedDespiteUntracedCitation`. A cluster run found
them; my reasoning did not. **I had run the two files I expected to be affected and called
it verified.** Running the whole cluster costs eight seconds.

That is the same error as the merge: I searched by named lead rather than by risk class.
The class here was "every arm that drives the loop to an objection", and it had three
members across three files. Router §2.2 says sweep the class; I swept the ones I predicted.

**A helper that hardcodes a criterion is a fixture trap.** `unsatisfied(objection)` read as
generic and was used as generic, so a semantic change to one criterion silently changed the
meaning of every arm that used it. It is parameterised now. Worth generalising: a test
helper that fixes a value its callers do not name will mislead exactly when that value
starts to matter.

**I wrote a vacuous assertion and caught it only on re-read.** `expect(run).rejects.not
.toMatchObject({ terminal: "COMPONENTS_ONLY" })` cannot fail — a thrown `TypedDomainError`
has no `terminal` field, so it passes whatever the chain does. It went green and looked
like coverage. Replaced with an assertion on the crash-class enumeration, which can. This
is the third D56 instance I have produced in one lane: the mark counter, the equality
predicate, and this. **The pattern in all three is the same — I wrote the check against the
world where the code is right, and never against the world where it is wrong.**

**A shell helper nearly corrupted the campaign.** Re-running the mutants through a function
with an unquoted `$4` word-split `-t producer` into vitest's file-filter list. Vitest found
no test files, exited 1, and every mutant scored KILLED — including both neighbours, which
must survive. `mutant-index` refused on the manifest and that is the only reason I looked.
**Without the expected manifest that campaign would have read as a perfect 6/6 sweep.**
D50 exists because v1 ignored the manifest argument; this is the first time in my run that
the manifest actually earned its keep, and it earned it against me.

## What to upgrade, sharpened

1. **Mechanise D43** — still the top item, and this segment adds evidence. `mutant-index`
   already refuses on the *outcome*; extend the manifest to `<name> KILLED <file>:<line>`
   and compare the observed `❯` frame. Every wrong-cause death this lane produced would
   have been caught by that one field.
2. **A cluster is the unit of verification, not a file.** Cheap rule with teeth: when a
   change alters a shared predicate, run every file that imports the module, not the files
   you predicted. I would have found `serve-s05` in eight seconds instead of after a
   three-run gate.
3. **Rulings should separate PURPOSE from MECHANISM explicitly.** The correction proves the
   distinction is load-bearing and that it is not always visible in the prose. If a ruling
   named its purpose in one line and its suggested mechanism in another, marked as
   suggested, a seat could implement the first and cost the second when it does not fit.
4. **Say which tree a prescription was derived from.** "The same protection integration
   gets from `conformance.every`" was a true sentence about a tree this lane had already
   left. One clause — "checked against integration at 19bbb4c4" — makes the staleness
   visible at the point of use, exactly as D53 does for citations.

## Toward the one-prompt machine

Unchanged headline: the cross-lane interface gate. But this segment adds a second, cheaper
one — **the expected manifest is the only mechanism in this mission that has ever caught me
mid-error rather than after it.** Gate records prove what ran; stamp-check proves when;
cite-check proves where. The manifest is the only one that encodes what I *expected* before
I looked, so it is the only one that can disagree with me. Whatever else a future mission
keeps, it should keep the habit of writing the expected result down first — for suites and
for gates too, not only for mutants.

---

# T9B self-report, part 4 — three mechanisms for one purpose

## The shape of this lane, now that it is finished

One purpose survived unchanged from the first ruling to the last: *a run whose citation
tracing failed must not have its citations counted into the confidence band.* Three
mechanisms were proposed for it and two were wrong, both in the same direction — they
invented a way to END the answer, when the frozen goal is explicit that this run serves.

I implemented all three. That is not waste; it is the only reason the first two were shown
wrong rather than argued about. But the cost is real: two full RED/GREEN cycles, two mutant
campaigns, and three passes over the same three test files. **What would have collapsed it
to one pass is a single question asked before writing any code: what does the frozen goal
say happens to THIS run?** I asked it after implementing mechanism one, and again after
mechanism two. The goal text was two commands away the whole time.

## What I got right, and it was cheap

Restoring both test files to their landed form at `6a0491f0` *before* re-checking each arm,
rather than editing my own edits forward. It took one `git checkout` and it immediately
proved the t09 arm needed nothing at all — it passes verbatim under the ruled behaviour. Had
I patched forward I would have carried my option-2 wording into a world where it was false,
and called it a restoration. **When a ruling reverses, go back to the artifact, not to your
diff.**

## What I got wrong

**I asserted by awaiting, and the mutants told me.** My first version of the ruled arm did
`const result = await runServeGateChain(...)` then asserted on `result`. Under the two
mutants that matter the chain throws, so the test died with no assertion frame at all —
`mutant-index` classified both as `THREW`. The property is "this does not end the answer", so
the *refusal* has to be the assertion failure; `.resolves.toMatchObject` makes it one. This
is D43 arriving in a form I had not met: not a wrong-cause death, but a right-cause death
with no assertion to credit it to.

**I read a tooling failure as a result, twice.** Two mutant batches reported every mutant
KILLED — neighbours included, which is impossible by construction. Both times the transcript
said `No test files found, exiting with code 1`, and both times I had to be told by the
expected manifest rather than noticing. The root cause took embarrassingly long to find and
is worth writing down plainly: **this shell is zsh, and zsh does not word-split unquoted
parameter expansions.** `$U` holding three paths, and earlier `$4` holding `… -t producer`,
each arrived as a single argument. In bash both would have split. Every mutation command in
this mission that interpolates a variable is exposed to this.

**I nearly shipped a vacuous assertion for the third time in one lane.** "The basis contains
no untraced citation" against a basis the chain never computes is trivially true. The
contrast pair — same nodes, same segments, evaluator satisfied, both citations present —
is what makes it falsifiable. I now think the honest general rule is: *an assertion about
something being absent needs a sibling showing it can be present.*

## What repeatedly cost tokens, final tally

- **Prescriptions checked against the wrong tree.** Twice from upstream, and the fix is the
  same as D53's for citations: say which tree a claim was derived from. "The same protection
  integration gets from `conformance.every`" and "S08's empty-basis throw fires" were both
  true sentences about trees this lane had already left.
- **The downgrade limb's two-segment precondition**, which nobody knew was in scope until
  the ruled mechanism routed a new case into it. Fixture archaeology again: the constraint
  is real, undocumented outside the code, and the third lane-hour I have spent on
  "why does this fixture die".
- **Re-running campaigns after every commit** because transcripts must stamp the filed tip.
  Eight mutants re-run twice. A cheap fix exists: run the campaign once, last, after the
  final commit — which requires knowing you are done, which is exactly what three rulings
  denied me.

## Toward the one-prompt machine — the three that would have paid here

1. **A ruling states its PURPOSE and marks its MECHANISM as suggested.** Two of three
   mechanisms in this lane were wrong and the purpose never changed. A seat told "achieve X;
   consider Y" checks Y against the goal and costs it when it does not fit. A seat told "do
   Y" implements Y and launders the error into code.
2. **Mechanise D43's credit field.** `mutant-index` already refuses on outcome; extend the
   manifest to `<name> KILLED <file>:<line>` and compare the observed frame. It would have
   caught the wrong-cause deaths in B1M2/B1M3 *and* flagged the two `THREW` classifications
   as uncredited, both of which I found only by reading transcripts.
3. **Assume zsh in every mission tool.** `mutate.sh` takes its command as `"$@"`, which is
   correct — the danger is entirely on the calling side. A one-line note in the tool header
   ("callers: pass command words literally; zsh will not split a variable for you") would
   have saved two false campaigns tonight, and the same trap is already recorded in
   TOOLING-TRAPS for `awk`, `rg` and `timeout` — it belongs beside them.

---

# T9B self-report, part 5 — four mechanisms, one outcome, and the day the specification stopped

## The change that ended the loop

The coordinator stopped naming mechanisms and named the OUTCOME. That single change closed a
lane that four specified mechanisms had not. I want to be precise about why, because it is
not "the seat knows better" — it is that **the outcome was checkable against the frozen goal
and every mechanism had to be checked against the tree**, and the tree is what the
specifier could not see from where they sat.

Four mechanisms, four collisions: a fifth crash class (broke the goal's enumeration), a hard
refusal (broke "serves regardless"), a null band (V wanted a value), a downgrade limb
(inherited a two-segment precondition). The outcome — *serve, mark, floor the band, leave the
label alone* — was achievable every time and never changed.

## What I got wrong this round

**I spliced a patch into the wrong function.** My anchored edit for the ceiling block matched
a comment in `createEnvelopeExhaustedResult` and I inserted the chain's band logic into the
envelope path, leaving the real one duplicated below. Typecheck caught it in seconds, but only
because the leftover referenced a nullable. Index-based splicing over a 3,000-line file is
the wrong tool; I reverted and redid it with `assert s.count(old) == 1` on every anchor, which
is what I should have written the first time. **An anchor that is not proven unique is not an
anchor — I built a tool for exactly this (`cite-check`) and then did it by hand without one.**

**My own flag was under-stated, and the reviewer used my own fixture to show it.** I wrote
that production was consistent because the synthesizer is asked for two segments when the
cited nodes rest on reasoning alone. The fixture I had just written cites a LOOKED_UP node.
I had the counterexample in my hands and described it as compliance. This is the same failure
as reasoning about one tree and asserting about another, in miniature and entirely mine.

**N1 is the third D56 instance in my own tooling.** My `it(` counter matched the retired
assertion's name quoted inside the retirement comment I had written, reporting 20 for a file
vitest counts as 22 — and I had used that same fragile shape to report "was 20 before the
retirement", a number no suite ever produced because the file did not compile at that tip.
The rule I should have been applying all along: **when a runner reports a count, the runner
is the source; a regex over source is an estimate wearing a number's clothes.**

## What the mutants earned this round

Three new ones, and each was worth its runtime:
- **F1M4** turns the floor back into an absence — V's explicitly rejected option. Without it
  nothing in the suite would notice a regression to the mechanism V declined.
- **F1M5** collapses the two causes back together and the one-segment run crashes again.
- **F1M6** drops the two-segment precondition, which is the only thing proving the regression
  arm is not decorative — that arm passed the moment I wrote it, and a test that has never
  failed has not been shown to work.

That last one is the general lesson I would put in the closure notes: **a regression arm
written for behaviour that already holds needs a mutant more than a new arm does**, because
nothing else in the process ever shows it can fail.

## What this lane cost, honestly

Nine hours of seat time across two sessions, ten commits, five rulings, four superseded
mechanisms, three false campaigns caught by an expected manifest, and three D56 instances in
my own tooling. The product change that V actually wanted is about forty lines.

The ratio is not damning, but it is worth stating plainly: **almost none of the cost was in
writing the code. It was in discovering what the code had to do, and every discovery came
from running something rather than reading something.** The role predicate, the wrong-cause
mutant deaths, the decorative equality check, the zsh word-splitting, the envelope-path
splice, the two-segment precondition — every one surfaced from execution. Not one came from
review of a diff, mine or anyone's.

## Toward the one-prompt machine — final

1. **Specify outcomes; suggest mechanisms.** Proven four times in one lane.
2. **Mechanise D43's credit field** — `<name> KILLED <file>:<line>` in the manifest. It is the
   only evidence rule in this mission with no tool behind it, and it failed twice here.
3. **Every count in a filing carries the command that produced it.** Not "20 arms" but the
   invocation and its output. Two of my three counting errors would have been impossible.
4. **A cross-lane interface gate**, nightly, per open lane. Still the largest single win: this
   whole lane began because `ServeGateDependencies` changed under five files and nobody knew
   until a human merged seven lanes at once.
5. **Assume zsh in tool headers.** `mutate.sh` is correct; its callers are not, and the trap
   silently reports a perfect campaign.

---

# T9B self-report, part 6 — rework 1: the record that named the wrong decision

## The defect in one line, and why my own tests let it through

I pinned the band and not the record. `confidenceBand: CEILING_BAND` passed; the ceiling
record sitting beside it said `DEFAULT_CEILING` / `retain-band` for a band that had been
lowered, and nothing asserted on it. **A partial pin is how a wrong value ships past a green
suite** — the assertion was true and the thing it was standing in for was false.

The fix in the test is the general lesson: when a function returns a composite, pin the
composite. I now assert label, liftPath, basis, registerRowKey, registerVersion and sourceRef,
not one field of six.

## What I actually got wrong upstream of that

I wrote `const floor = input.row.value.defaultCeiling` and then used the row's `bandOrder[0]`
for the band. **Those two lines read from different entries and I never noticed**, because
each was individually defensible: the floor band should come from `bandOrder`, and a ceiling
record should come from a ceiling entry. Composing two correct reads into one incoherent
record is a shape I had not met before, and the tell is available in hindsight — the record's
`ceilingBand` field was the one thing I ignored, and ignoring a field that exists to say which
band an entry produces is exactly how you end up describing a different decision.

## The D56 instance I caught this time

Restoring the two validations, I wrote `if (!bandOrder.includes(floorEntry.ceilingBand))` —
then realised the entry had just been *selected* by `ceilingBand === bandOrder[0]`, so the
check could never fail. I removed it and said why at the site. Four D56 instances in this
lane: the mark counter, the equality predicate, the `rejects.not` on a thrown error, and this
one. **The first three shipped and were found by mutants or reviewers; this is the first I
caught while writing it.** The habit that caught it was mechanical, not clever — I had just
finished writing "construct the input that should make it fail" into a test comment, and then
tried to construct one for the line above.

## The scope call, and why I am confident in it

Both entries on the shipped row misdescribe an empty basis, and no selection over them can be
truthful about the *reason*, because each entry carries one label for both its trigger and its
outcome. Curing that needs a new row entry. I checked the blast radius rather than guessing:
two schemas and two seeders, and — decisively — **the mission's own slice map assigns every
new sealed row and schema to S01/T16.** That is not a judgement call about size; it is written
ownership. Filed as F-T9B-3.

What I did instead is the part that was mine: remove the outright contradiction, make the lift
path truthful, validate what the route had been skipping, fail closed where the row cannot
describe the decision, and name the residue in the code at the site so the next reader does
not have to rediscover it.

I also measured the thing that made "optional field" plausible — the acceptance harness never
fails citation tracing, so it never reaches this route — rather than asserting it, because
"this path is unreachable over there" is exactly the kind of causal claim D51 exists for.

## What this round cost, and the pattern across six

Rework 1 was cheap: one RED, one mechanism, two mutants, a sweep. That is what a finding looks
like when the reviewer hands over the row contents and the exact mismatch. Compare the four
mechanism rounds, where the specification moved each time.

Across the whole lane the ratio is stable and worth stating once more for the closure notes:
**every defect that reached review was a claim I had not executed.** The record mismatch was
visible in the row the whole time; I read the row's shape, not its values. `cite-check` exists
because a citation must be proven to resolve; there is no equivalent for "this record
describes the decision it sits next to", and that is what a whole-record pin is.

## Toward the one-prompt machine — the one this round adds

**Pin composites whole.** Every partial pin in this lane hid something: the band without its
record, the count without its command, the mutant outcome without its killing frame. A cheap
lint would be worth more than another tool: a test that asserts one field of a returned object
is a smell, and the reviewer who reads it should ask what the other five say. Three of the
five findings against this lane would have been impossible under that rule.

---

# T9B self-report, part 7 — two record corrections, and the one I should have known

## N2 is the finding I am least comfortable with

Not because it was hard — the transcript was recoverable and the repair took minutes — but
because **I had seen the rule applied twice on this mission and still broke it.** T3C moved 22
superseded records into a directory rather than deleting them; S08 kept its whole pre-merge
set; the orchestrator preserved a void suite run under a name saying why. I read all three in
DECISIONS while orienting, and then deleted an obsolete transcript because it no longer fit
the current glob.

The reasoning that produced it was locally correct and globally wrong: F1M3's target no longer
exists, so keeping it in the manifest would have made the index unreproducible. Removing it
from the *campaign* was right. **I treated "not a member of the current campaign" as "not
evidence", and those are different things** — my own filing still credits F1M3 for an
eight-mutant campaign, and under D24/D42 the raw transcript is the only admissible record of
that claim. The fix is not a rule I lacked; it is one I applied to the wrong noun.

The general form, for the closure notes: **a record's membership in a current index and its
status as evidence are independent.** Superseding an index entry is a bookkeeping act;
destroying the artifact behind it is an evidence act, and only the second is irreversible.

## N1 is the same shape as three earlier misses

I swept for the vocabulary of the superseded mechanism (`unbanded`, `no band claimed`) rather
than for its *claims*. Every phrase I searched for was one I had personally written, so the
sweep could only find the mechanism where I had described it in the words I happened to use
that day — and the three survivors described it in other words: "refuses loudly", "T13's own
honest downgrade", and four bullets that were simply still in the present tense.

This is the fourth time in this lane that a check of mine could not fail for the reason it
existed, and the pattern is now unmistakable enough to state as a rule: **when I write the
thing being checked and also the check, the check inherits my blind spot.** The mark counter,
the equality predicate, the `rejects.not` matcher, and now the sweep pattern. The three that
were caught were caught by something I did not write — a mutant, a reviewer, a manifest.

What I did differently this time, and would keep: I ran the sweep, then **read every hit and
decided each one individually** rather than editing them all. That is how `serve/index.ts:834`
survived correctly — it names "T13's honest downgrade" in a sentence that is still true,
because that limb still governs a verified reasoning-only set. A blanket replace would have
made a correct comment wrong, which is the failure mode a sweep invites.

## What I would tell the next seat about this lane

Six rounds, five rulings, four superseded mechanisms, twelve commits, and the product change
is about sixty lines. Almost none of the cost was writing code. It was:

- discovering what the code had to do (four mechanisms, each refuted by running it);
- proving the tests could fail (four D56 instances, three found by others);
- and keeping the record honest while the mechanism moved underneath it (two N-findings, both
  record-only, both mine).

The third category is the one I underestimated at the start. **A filing that tracks a moving
mechanism decays faster than the code does**, because the code is re-run every round and the
prose is not. Nothing in this harness re-executes a paragraph. The tools this mission built —
`stamp-check`, `cite-check`, `mutant-index`, the expected manifest — all exist because someone
learned that same lesson about a different kind of claim, and the gap that remains is exactly
the one N1 fell into: **there is still no mechanism that fails when a filing describes
behaviour the tree no longer has.**

If I could add one thing to this mission's toolbox it would be that: a check that extracts the
behavioural claims from a filing and requires each to name a test or a log line that currently
passes. Every N-finding against this lane, and most of the prose defects in DECISIONS, would
have been caught by it.

---

# T9B self-report, part 8 — the merge that found what two reviews did not

## The finding, and why it took a merge to surface

T9 retired the protected-core guard because goal 248–251 says to. S09/T17B added a restatement
condition to the envelope catch because their own boundary analysis said to. Both lanes were
reviewed, both passed, both merged. **Neither review could see the collision, because neither
lane's tests exercised the other's path** — my F4 arm lives in `database.test.ts` and did not
exist on integration; their catch-site change did not exist on my lane.

This is the third time this mission that a merge has been where two correct things became one
wrong thing, and the second time in this lane. The first was T9 × S08 on `ServeGateDependencies`.
The pattern is now well enough evidenced to state without hedging: **the merge is the least
supervised step in the loop and it is where the expensive defects live.** Every other step has
a gate; the merge has a human and a positional algorithm.

## What the two cautions bought

Both were worth their line. The one that mattered was "overlap is not the measure": the file
that would have bitten me is `tests/support/discoveredPanel.ts`, which I do not edit and which
would not appear in any overlap list — and `fixtureStructuralCeiling`, which **both** of my new
database fixtures call, gained required members. I was covered only because I called the helper
instead of hand-building the basis object, which was luck dressed as judgement: I wrote those
fixtures three rounds ago without thinking about who else owned the shape.

The second caution — a shared reader gaining a required row — sent me to
`readEnvelopeFormulaInputs`, where my first grep of both seeders returned **zero** and I nearly
filed an unseeded-row defect. The row is seeded, under a different key set in
`algorithm-policy.ts`. **An empty search result is not a finding**, which is the exact lesson
the coordinator recorded about their own B1 error a round earlier, and I nearly repeated it
within the hour of reading it. What stopped me was going to the reader's definition and
following it to its row key rather than trusting my own grep pattern — the same discipline that
saved the N1 sweep.

## The judgement I am least sure of

I resolved the conflict as **theirs** and committed the merge, leaving the lane tip red on one
landed assertion. The alternative was to abort the merge and report, leaving the lane clean but
23 commits behind and the collision undemonstrated.

I chose the red tip because the failure IS the evidence, and because a merge that has to happen
anyway is better recorded than deferred. But it means the lane gating the closing run is
currently failing a test, and if the judge would rather have had a clean tip and a written
finding, that was available and I did not take it. Recording the choice rather than presenting
it as obvious.

## What I did not do, and why that is the whole point

Two edits would have made this green in under a minute: delete my F4 arm, or drop S09's clause.
The first is forbidden outright. The second is subtler and more tempting — S09's line looks
local, my lane owns the goal clause it contradicts, and I could have written a plausible commit
message. **It would still have been me deciding a frozen-goal question on behalf of two lanes
and a V ruling, in a merge commit.** The rule that stopped me is the one my dispatch opened
with, and it has now paid twice in this lane.

I did spend the effort to make the finding decidable rather than merely reported: the cause is
isolated to one clause by a custody-clean mutant transcript, both resolutions are costed, and I
named the thing I would want checked before choosing option 2 — that the
`PROTECTED-CORE-GUARD-RETIRED` mark would then be minted by no production route at all. A
finding that hands over a decision should hand over its consequences too.

## The one process change I would make from this round

**Re-derive fixtures, not just files, when merging.** My read-point audit worked, but I built it
ad hoc from two cautions I was handed. The mechanical version is cheap: for each test helper my
lane calls, diff it across the incoming range and check whether its shape changed. That is a
`git diff <base>..<incoming> -- $(grep -l "$(my imported helpers)" tests/support/)` away, and it
is the only step in tonight's audit that found a real coupling rather than confirming an absence.

---

# T9B self-report, part 9 — the false blocker, and what a deletion costs in a merge

## I filed a blocking finding against two other lanes for a defect I had introduced

That is the worst error of this lane, and it is worth being exact about its anatomy rather
than apologising for it.

I resolved a real conflict as "theirs", wrote *"my lane had no competing change"*, and did not
check. I had a competing change: **a deletion**, made three rounds earlier as F4's own charge.
Then, when the F4 test failed, I traced the failure honestly, isolated the cause to one clause
with a custody-clean mutant, quoted the frozen goal correctly, searched DECISIONS for a
reconciling ruling, found none — and concluded that two landed lanes contradicted each other.
**Every step after the merge was rigorous. The error was one step before, and rigour downstream
of a wrong premise produces a confident wrong answer faster.**

## Why a deletion is the dangerous kind of merge change

Every other change announces itself. An addition or an edit appears in the conflict hunk on
your side, so "take theirs" visibly discards something and you feel the loss. **A deletion's
evidence is absence.** The conflict showed me integration's block, which was correct and
deliberate on its own terms — T17B really did rewrite it — and *nothing on screen represented
the line I had removed*. There was no half of the hunk that looked wrong, because my half was
the older text plus one missing line, and missing lines do not render.

The rule I now hold: **"take theirs" is only safe after reading your own diff over the same
region.** Not your memory of it, and not the conflict hunk, which shows your side's TEXT and
not your side's INTENT. One command would have caught it:
`git diff <merge-base>..<my-tip> -- <file>`. I ran that command in this very session — to build
the read-point audit — and never pointed it at the file I was resolving.

## The check that was almost the second error

Sweeping for other reinstated deletions, my first pass reported **11**. Ten were artifacts:
short generic lines like `providerRef: primaryMaker.providerRef,` matched anywhere in a
4,000-line file by a substring test with a 25-character floor. Had I filed from that output I
would have replaced one false finding with eleven.

What saved it was counting the *named symbols* per tip instead — `conformanceBound` 4/3/5/2
identical at both tips, `protectedCoreVerified` 0 at both — and then diffing my tip against the
merged tip restricted to those symbols, which returns exactly one line. **A sweep that cannot
distinguish a match at the deleted site from a match anywhere is not a sweep**, and it is the
fifth check of mine in this lane that could not fail for the reason it existed. The difference
this time is that I distrusted my own output before it reached a filing.

## What the coordinator got right that I want recorded

Three facts from the trees, not from reasoning: pre-existing at baseline, zero at my tip, one
after my merge. That is D51 applied to a *diagnosis* rather than to a claim — and it took about
three `git show | grep -c` calls. I had every one of those commands available and reached for
narrative instead: I read the conflict, read the goal, read the rulings, and built an argument.
**The argument was well-evidenced and the evidence was all downstream of the mistake.**

## For the closure notes

Both of this lane's expensive defects were merges, and they were opposite failures:
- **T9 × S08** — a *clean auto-merge* that needed checking, caught because the tree stopped
  compiling.
- **T9 × T17B** — a *real conflict* resolved without checking my own side, caught only because
  a landed integration test failed and someone read the blobs.

The pair completes a rule that neither half states alone: **a merge is not a decision about the
incoming change; it is a decision about the pair.** Both halves need reading, and the half you
wrote is the one you will skip, because you believe you remember it. A pre-merge step of
`git diff <base>..<mine> -- <each conflicted file>`, printed and read, would have prevented
tonight's and cost seconds. I would put that in the merge instructions above everything else I
have suggested this lane.
