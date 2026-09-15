# S11 self-report — the case file

Seat: worker S11 (T15 eval harness + T15b preparation), filing r5 = second merge-in after PASS.
Filed tip `33fc01de`. Wall clock: r1 26 min, r2 ~35 min, r3 ~40 min, r4 ~20 min.
No provider call, no credential touched, in any round.

The question this answers: what must we upgrade, what repeatedly cost tokens, how does this
become a better one-prompt machine.

---

## 1 · The most expensive thing I did, and it was not a bug

**I wrote a complete 262-line test file against an unmeasured assumption, then had to rewrite it.**
Price: the whole first authoring pass, roughly a third of my token spend before the first GREEN.

The assumption was that the deployment has enough provider identities to satisfy the goal's
matrix. It does not: `acceptance/seed-register.ts:41-45` seals three, a candidate config consumes
two, and the goal wants two graders that are neither. I discovered this only when I sat down to
compute what `assignBlindGraders` should return and found the expected array had one element.

The worker contract already says this — §3, "measure before you speculate", with a lens that
burned a third of its budget on four speculative mutants. **I read that sentence and then did the
thing it forbids anyway**, because the number I needed felt like background knowledge rather than
a measurement. It is not background knowledge. It is a row in a seeding file.

**The upgrade, stated so it is mechanical rather than exhortative.** The packet already names the
frozen SPEC. Add to the worker packet a required step between "read the SPEC" and "write the RED
test": *list every quantity the task text asserts about the world, and print each one from the
artifact that owns it before the first test line is typed.* For T15 that list is four numbers —
5 debates, 3 configs, 2 rounds, 2 graders — and each one has an owner in the tree: recorded
answers in `serve.answer`, provider identities in the seeding module, the loop bound in a T16
row. Three greps. Every one of them would have changed the test file I wrote.

Note what this bought once I did it: the single most valuable output of this lane is not the
harness, it is the measured fact that the matrix cannot run on this deployment. That fact was
one grep away from the start and I found it late.

## 2 · What I nearly got wrong, and what caught it

**Nearly shipped: an assertion class that matches prose instead of contract.** My first GREEN
attempt used `toThrowError(/EVAL_CANDIDATE_CONFIGS_INSUFFICIENT/)`. Vitest matches that against
the error MESSAGE, and my codes live on `error.code`. Three tests failed. The trap is that this
class fails in the *safe* direction only by luck: had any refusal message happened to contain its
own code as prose, the test would have passed while pinning nothing. I swept the class — no
`toThrowError` remains in the file — and then deliberately built mutant **m9**, which rewords a
refusal message, to prove the suite is now indifferent to prose. It survived, as designed. Price:
~2 minutes. Value: the neighbour mutant is now real evidence rather than a formality.

**Nearly shipped: a table assertion that could not see the defect it was written for.** Mutant m8
made the score column render `NaN` and the suite stayed green, because the row still said
`UNGRADED` in a *different* column and I had asserted `row.toContain("UNGRADED")`. This is the
§2 warning in its exact form — an assertion that pins the neighbourhood of a property rather than
the property. The cure was to pin the whole rendered row, which is also the honest choice: the
row is the artifact V reads. Price: ~4 minutes plus a full campaign re-run at the new tip.

**This is the argument for the refutation duty in one paragraph.** Both near-misses were in tests
that were GREEN, in a file where every test passed, with a clean typecheck. Nothing except a
mutant could have found either.

## 3 · The dead end nobody should re-derive

**Do not try to make the harness build T9's synthesizer/evaluator requests.** I considered it for
about a minute: T9 is unmerged, its module is absent from every checkout this lane can run in,
and having the request shapes in front of me made copying them feel efficient. It is a trap with
three separate exits — the packet forbids copying, an eval that grades a local replica grades
code that never ships, and `lane/s07` was still taking review rounds while I worked (its tip
moved to `9a3a5f60` on an r5 commit). The right shape is a narrow port plus a LIVE resolution
(`await import("@debateai/serve")` and a function check) that returns null when the surface is
absent, and a loud refusal on null. Mutant m6 proves the refusal fires.

Corollary worth keeping: the adapter is *deliberately unwritten* and throws a named error. A seat
that finds `EVAL_SYNTHESIS_ADAPTER_UNWRITTEN` has not found a bug; it has found the seam waiting
for T9's merged signatures.

## 4 · Tooling that cost me a whole campaign

**zsh does not word-split unquoted parameters — fourth recorded bite, first in this shape.** I
built the discriminating command in a variable and passed it as `$T`; zsh handed the entire string
to `mutate.sh` as ONE argument, `vitest` was never found, and all eight transcripts recorded
`EXIT = 127`.

**The part that matters is what happened next: `tools/mutant-index.sh` reported `TALLY:
transcripts=8 exit-nonzero(killed)=8 exit-zero(survived)=0`.** A perfect campaign. Every gate in
`mutate.sh` passed — pre-count 0, applied 1, restored 0, hashes match, porcelain empty — because
every gate is about the MUTATION, and the mutation was flawless. Nothing in the tooling could tell
"the mutant died" from "the command does not exist". I caught it by reading `EXIT = 127` in the
index, not by any check.

This is the S07 trap already in `TOOLING-TRAPS.md` — *a gate that cannot tell "violated" from "my
measurement is broken"* — recurring in the index rather than in the harness. **Second occurrence
of the class, so D28 says enumerate and publish rather than fix the instance.** The mechanical
cure is one line in `tools/mutant-index.sh`: exit 127 (and 126) is `MEASUREMENT-BROKEN`, never a
kill, and the TALLY refuses to print while any transcript carries one. Filed as F-S11-3. Price:
one full campaign, ~3 minutes, and it would have been a false evidence claim in my report if the
index had rendered 127 as anything less legible.

## 5 · What the mission tooling got RIGHT, and why it should spread

Three tools did work I would otherwise have done by hand and done worse:

- `gate-run.sh` made "is this measurement trustworthy" a *read*, not an argument. Every record
  carries its own commit, tree, before/after porcelain and the command's own exit. I never once
  had to reason about whether a gate was taken on a dirty tree.
- `stamp-check.sh` caught something real: three of my records could not stamp the filed tip
  because two are BASELINE records and one is a derived index. Renaming them out of the gate glob
  took thirty seconds and the resulting evidence set is honest in a way I would not have thought
  to make it. **Suggested upgrade:** the comparator should know about baseline records natively —
  a `base-` prefix convention, or a second argument naming the commit a glob is expected to bind —
  so a seat is not left inventing a filename convention under time pressure. I invented one; the
  next seat will invent a different one.
- `mutate.sh`'s dirty-tree abort (D24 ADDENDUM-2) is the reason I committed before mutating rather
  than after, which is also why the m8 fix has its own honest commit instead of being folded in.

## 6 · Where the packet was unclear, exactly

The packet was accurate — every constant it quoted verified — and its §5 addendum was **materially
correct**: without the merge order I would have graded a four-lane-old entry point. Two places
cost thought:

1. **§2 item 3, "The comparison table is produced from recorded runs."** This reads as though
   recorded runs already contain gradeable synthesis output. They cannot: T9 has never executed
   anywhere, so the grading IS the spend. I spent real time deciding whether I was missing a
   fixture source before concluding the sentence means "the table is rendered from run records
   rather than invented". **Upgrade:** when a DoD row depends on an artifact that does not exist
   yet, the packet should say which lane creates it and when.
2. **The BLOCKED instruction versus the build instruction.** "Build the harness and print the
   count" and "if a DoD row cannot close without a live call, write BLOCKED and stop" are both
   right and they collide, because a row (`table produced`, with grades) genuinely needs the run.
   Read literally, "and stop" could mean *do not build*. I read it as *build everything buildable,
   file BLOCKED on the rows that need V*, which is the reading that serves V. **Upgrade, one
   sentence in the packet template:** *"BLOCKED is a per-ROW verdict on a completed filing, never
   an instruction to stop building; file everything the lane can close and name the rows it
   cannot."*

## 7 · The one-prompt machine — three changes I would make

1. **A quantity manifest in every worker packet.** §1's whole cost was an unmeasured number. Not
   "measure first" as advice, but a table the packet ships with the SPEC — quantity, owning
   artifact, the command that prints it — that the seat fills in *before* the RED test and pastes
   into the report. It is cheap to write, mechanical to check, and it front-loads exactly the
   discovery that is most expensive to make late. In this lane it would have surfaced the blocking
   finding in the first two minutes instead of the twentieth.

2. **Every counting tool must have a MEASUREMENT-BROKEN outcome.** §4 generalises past mutants.
   `mutant-index.sh` classifies into killed/survived; a suite parser classifies into pass/fail; a
   stamp comparator into stamped/stale. Every one of them has a third state it currently folds
   into one of the two, and the fold is always toward "everything is fine". The rule: **a
   classifier with two buckets is lying about the third.** Make it print the third and refuse to
   summarise while it is non-empty.

3. **Spend gates should be built the way this one was, and the pattern should be named.** The
   valuable property is not the flag; it is the ORDER — print the projection first, run every
   check that can refuse while everything is still free, and put the approval gate last,
   immediately before the first call. That makes "did this refusal leave spend behind it" a
   structural question with a structural answer, and it is asserted with an exact empty call log
   rather than a count comparison. Any future lane with an important-operation gate should be
   handed this order in its packet rather than deriving it. The mutant that proves it is one line
   (`if (!approved)` → `if (false)`), and it should ship with the pattern.

## 8 · Ledger

| item | price |
|---|---|
| test file written against an unmeasured provider count, then rewritten | ~1/3 of pre-GREEN tokens; the lane's key finding delayed ~18 min |
| `toThrowError(/CODE/)` matching prose not contract | ~2 min, 3 red tests, one class swept |
| mutant m8 survived a too-loose row assertion | ~4 min + full campaign re-run |
| zsh word-splitting killed the whole first campaign; index called it 8/8 killed | ~3 min + 8 void transcripts |
| stamp-check flagged 3 records; 2 were legitimately baseline-bound | ~1 min, and the evidence set improved |
| **rework rounds spent** | **0 of 3** |


---

# r2 addendum — what the V ruling taught, and what the mutants caught

## 9 · Routing the ambiguity was worth more than resolving it would have been

In r1 I implemented the strict reading of "never the candidate", made the shortfall a loud
refusal, and **routed the ambiguity to V instead of ruling it**. V rejected both framings the
orchestrator offered — including its recommendation — and returned a third answer that neither
of us had proposed: degrade, run, and disclose.

The lesson is not "escalate more". It is **what to escalate**. What I routed was not "which of
these two options do you want"; it was the *fact* that the goal text admitted two readings with
different consequences, with the measured cost of each. That is what let V answer outside both
options. Had I quietly picked the strict reading and shipped a refusal, the harness would have
been correct against my reading of one sentence and wrong against the policy V actually holds —
and nothing in any gate would have caught it, because a refusal that never runs passes every
test you write for it.

**The generalisable form:** when a task text admits two readings, do not escalate the choice.
Escalate the READING, with the measured consequence of each, and implement the one that fails
loudly rather than the one that proceeds quietly — a loud wrong answer is cheap to correct, and
this one cost a single round.

## 10 · The mutant found the centre of the ruling unasserted

Mutant m10 moved the empty-pool guard from `=== 0` to `< 2`. The suite stayed green. That meant
**nothing pinned what happens when exactly one identity is sealed** — which is the literal
headline of V's ruling: "if only one model is available, the whole debate runs on that one
model." I had written the degradation ladder, reasoned about the one-model case in comments, and
built no test for it.

Note *how* it went missing. I tested the boundaries I found interesting — four identities
(clean), three (the deployment's real state), two (both refs are candidates). One identity is
the *degenerate* case, and degenerate cases feel like they cannot carry information. Here it was
the case the ruling was actually about. Price: one campaign re-run, roughly four minutes.

**The upgrade, and it is cheap:** when a ruling arrives, extract its scenarios into test names
BEFORE writing the implementation. V's ruling contains three named scenarios in plain prose —
one model available; a cost ceiling putting the same cheap model in several seats; the best
grader being the same AI that produced the work. Each is a test. I derived my tests from the
code I was writing instead, and got the ones the code made salient.

## 11 · The three new rulings, applied — and one of them found a defect in my own filing

- **D51 (generate the causal claim).** My r1 lint classification asserted "no workspace manifest
  changed, therefore the violation is not mine". True, but *narrated*. r2 generates it: the
  filed record runs the two git commands and shows `1 file changed, 2 insertions(+), 1
  deletion(-)` on the root manifest alone. Same for the campaign: which assertion killed which
  mutant is now extracted from the transcripts' own failure lines
  (`r2-mutant-assertion-credit.txt`) rather than written from memory of what I expected.
- **D53/D55 (cite the search, not the number).** My r1 report cited six `file:line` anchors. Two
  of those files have since been touched. Every citation in r2 is an anchor proven UNIQUE:
  11 anchors, 11 unique, exit 0.
- **D56 (a check that cannot fail is not a check).** I fed `cite-check.py` a deliberate bad case
  — an absent anchor and an anchor matching 30 sites — **before** filing the good run, and kept
  the failing record as evidence. This is the same lesson my own m8 taught in r1 from the other
  direction, and m10 taught again in r2.

## 12 · A convention I invented twice, which means it should be in the tooling

`stamp-check.sh` flags any record in its glob that does not stamp the filed tip. Three kinds of
file legitimately do not: a BASELINE record binds the pre-change tip it measured, a DERIVED index
is computed from records rather than being one, and an INPUT file (an anchors list, an expected
manifest) is what a check consumes. In r1 I invented a `base-` / `index-` prefix under time
pressure; in r2 I invented `input-` the same way.

Two rounds, two inventions, and the next seat will invent a third spelling. **The comparator
should know these categories natively** — either by convention baked into the tool, or by a
second argument naming the tip a glob is expected to bind. Until then every seat's evidence
directory is organised differently, which is exactly the readability problem D44 was ruled to
fix.

## 13 · Ledger, r2

| item | price |
|---|---|
| two test fixtures that derived configs from the 4-identity deployment and graded them against the 3-identity pool — a deployment that does not exist | ~3 min, 2 red tests, caught on the first GREEN attempt |
| a stale index expectation (`refusalIndex` 8) after the new mark added a line | ~1 min; the mark firing on four identities was itself the finding |
| mutant m10: the one-identity case, the centre of the ruling, unasserted | ~4 min + full campaign re-run |
| renaming three check INPUTS out of the gate glob | ~1 min, and the second time I have invented this convention |
| **rework rounds spent** | **1 of 3** |


---

# r3 addendum — three blocking findings, and the shape of what I keep getting wrong

## 14 · The defect had ONE shape and I fixed it in one place

r2 fixed the grader-pool refusal. r3's B1 was the *same defect* — a capacity shortfall treated as
a hard precondition — sitting one function upstream, where it pre-empted the fix I had just made.
The reviewer's phrase is the whole lesson: the corrected logic "is never consulted."

Router §2.2 already names this: **a reported finding is a SAMPLE of a class, never the whole
class.** I even wrote a class sweep in the r2 report — a seven-row table of every refusal, with a
disposition each. It listed `EVAL_CANDIDATE_CONFIGS_INSUFFICIENT` and correctly identified it as
the member most likely to need the same treatment. **And then I filed it as a question for V
instead of fixing it.**

So the sweep worked and the disposition was wrong, which is a more interesting failure than
missing it. What I got wrong was the *authority question*, not the *engineering question*: I
treated "V ruled on the grader pool" as scoping the ruling to the grader pool, when V's text said
"also for other places where this rule is in place." **A ruling's scope is stated in the ruling,
not inferred from the ticket it arrived on.** The coordinator made the same inference, which is
why it is worth stating as a rule rather than a resolution: when a ruling contains a
generalisation clause, the sweep's members are IN scope by default, and it is narrowing that
needs justification.

Price: one full round. Cheapest possible correction, but it was avoidable at the moment I wrote
that table.

## 15 · Two of the three blockers were "the artifact says more than it knows"

B2 and B3 are the same failure wearing different clothes, and neither is a bug in the usual
sense — the code did what I wrote, and what I wrote overclaimed.

- **B2:** I detected non-commensurability, emitted a mark for it, and *then rendered a pooled
  mean anyway*. I had genuinely thought disclosure was sufficient. The reviewer's sentence is the
  correction and it should be a standing rule: **a warning discloses invalid comparability; it
  does not restore it.** If a number cannot support the inference a reader will draw from it,
  the remedy is to not render the number.
- **B3:** I printed `same-model yes/no` computed from *provider-ref* equality, and asserted
  seats were "fresh instances", with no data behind either. V's ruling asked for exactly those
  two facts to be recorded — and I recorded the *words* rather than the facts. The tell: I wrote
  "fresh instances" into a disclosure string because V's ruling used that phrase, without asking
  what in my code observed it. Nothing did.

**The generalisable check, which I would put in a packet:** for every fact an artifact states,
name the value it was computed from and the line that computed it. If the answer is "the ruling
said so", the artifact is quoting policy as though it were measurement. Provider identity, maker
family, exact model, and session freshness are four facts; I had two and printed four.

## 16 · The fixture that taught me the actual design

My first "shared panel" test fixture failed, and I nearly patched the expectation. Diagnosing it
instead produced the most useful thing in this round: arms drawn from all four identities put a
grader into an arm's *evaluator* seat, which removed it from that arm's panel and split the
panels apart. **Comparability requires the arm refs and the grader panel to be disjoint.**

That is not a test detail — it is the concrete instruction a deployment needs in order to get a
valid T15b comparison at all, and it is now filed as F-S11-5. I would not have found it by
reasoning; I found it because a fixture disagreed with me and I asked why instead of editing it.

## 17 · What the tooling caught that I did not

`mutate.sh` aborted m12: my NEW token already occurred twice in the file, so the mutation would
have edited two sites and credited a kill to whichever assertion happened to fail. `GATE pre = 2
… ABORT`, tree left clean. That is the second time this round a gate caught something my own
reading had passed over — the first being the reproduction in §1, which showed the throw was
upstream of where I had been looking.

**Both were cheap because they were mechanical.** The pattern across all three rounds is
consistent: my prose is where the defects live, and the tools that generate rather than accept
prose are what find them. D51 named this for the mission; my r1 lint classification, my r2
"fresh instances" disclosure, and my r3 tree hash (written as `b2f0e0b8…` from nothing, caught by
me at filing) are three instances of it in one seat.

## 18 · Ledger, r3

| item | price |
|---|---|
| B1 routed to V instead of closed — the sweep found it, the disposition was wrong | one full round |
| B2/B3: artifact stated facts it had no data for | in the same round; ~15 min to represent them honestly |
| "shared panel" fixture wrong — arms and panel must be disjoint | ~6 min, and produced F-S11-5 |
| four stale fixtures after the mark set grew | ~5 min |
| m12's token already present twice — gate aborted, re-run with a marked token | ~2 min, gate working |
| a tree hash written before it was read | caught at filing, 0 cost — but it is the D51 class again |
| **rework rounds spent** | **2 of 3** |


---

# r4 addendum — the credit lesson, and what a clean merge does not prove

## 19 · A green campaign that credits the wrong assertion is the most expensive kind of evidence

The judge checked my assertion-credit artifact rather than my summary of it, and found two things
I had asserted without checking: the count was 81, not 82 (one line is the survivor sentinel),
and **four of the credits were not credits at all**. The projection-order test hard-coded the
refusal's index, so any mutant that changed the *number* of emitted marks failed it — m14, m17,
m18 and m19 appeared under that test without it discriminating their mutation in any way. My
"m17 is killed by 18 assertions" was the same error amplified: I read a long credit list as a
strong pin when most of it was one brittle index firing.

**Why this is worse than a miscount.** The whole point of D43's credit rule is to answer "what
would have caught this?" A credit list that includes tests which merely count lines answers that
question wrongly, and it answers it *confidently*, in an artifact that was mechanically derived
and therefore looks unimpeachable. `mutant-index.py` said CLEAN and was right — every transcript
was well-formed, every gate green, every outcome matched my manifest. **Form was perfect and
credit was wrong, and no tool in the mission can tell those apart.**

That is now three cases in one evening (S07 twice, T17B once, mine four) and it is the finding I
would most want inherited. The mechanical rule that would have caught mine: **a credit is only a
credit if the test's assertion mentions something the mutation changed.** A test that asserts an
*index* or a *count* can be moved by any mutation anywhere upstream of it, so it should never
appear in a credit list. That is checkable — compare the mutated token against the failing test's
assertion text — and it is the natural next feature of the credit extractor rather than a habit
to remember.

**I fixed the cause rather than the artifact.** The test now pins the refusal as the LAST emitted
line, which is the property it was always reaching for and which no unrelated mark can move. The
four false credits cannot be minted again.

## 20 · The merge, and why "no overlapping files" is not the check

Integration `19bbb4c4` auto-merged into the lane with zero conflicts and zero overlap with my
four files. The coordinator's warning was that T17B had exactly that shape and still broke a
suite through a settings coupling — so overlap is not the measure.

What I actually checked, rather than inferring from the file list:
- **the incoming diff against my read surface** — `acceptance/seed-register.ts` and
  `acceptance/runtime-policy.ts` are the two modules my CLI reads through, and neither is in the
  merge. That is a fact about the diff, not an assumption about scope.
- **the build inputs** — no `pnpm-lock.yaml` and no `packages/contract/src` change, so no
  reinstall and no contract regeneration were owed.
- **the settings surface specifically** — the merge adds `PROVIDER_PROBE_TIMEOUT_MS` to the
  runner environment schema. It carries a default, which is the difference between this and the
  T17B shape, and I looked at the default rather than assuming one.
- **a wider suite than my own cluster**, because a settings coupling is invisible to a cluster
  that does not read settings. My four-file cluster passing proves nothing about it.

The reusable form: after a clean merge, the question is not "did files collide" but **"did
anything I READ change, and did any shared configuration gain a required knob."** Both are
answerable from the diff in about a minute.

## 21 · Ledger, r4

| item | price |
|---|---|
| four false mutant credits + a miscount, in a mechanically derived artifact | caught by the judge, not by me or any tool; cause fixed in one test |
| two stale policy comments + a dangling `applyApprovalGate` reference | ~5 min; the dangling name was found while fixing the two I was given |
| merge-in of 21 commits, no conflicts, coupling checked rather than assumed | ~15 min including the wider sweep |
| my own lint-classification record contradicted its own command output, two adjacent lines | caught at filing, regenerated — D51 class, inside a record written to satisfy D51 |
| one sweep failure was NOT stable-red and needed solo discrimination | ~4 min; b11 showed it PASSING, so the assumption "these look pre-existing" would have been wrong |
| **rework rounds spent** | **2 of 3** (r4 is a merge-in, not a rework round) |


## 22 · r5 — the merge whose surface really did touch mine, and what made it cheap

T17B changed all three modules my CLI reads through. That is the first merge in this lane where
the coupling was real rather than hypothetical, and it took about fifteen minutes because the r4
round had already turned "check the merge" into four mechanical questions. I read the incoming
diff against my two read points BEFORE merging — `readSynthesisRoleControls` untouched, the organ
cost-bound schema untouched, `AcceptanceRuntimePolicy` additive — so by the time the merge ran I
knew what to expect and what would falsify it.

**Typecheck is the underrated part of that check.** My CLI destructures `policy.bounds.JUDGE` and
calls `readSynthesisRoleControls` directly, so a renamed or removed member is a compile error, not
a runtime surprise at the first approved run. Reading the diff told me the shape was safe; EXIT 0
proved it. Neither alone would have been enough: the diff read could have missed a transitive
rename, and a green typecheck says nothing about a row that must now be seeded.

**Which is exactly what I did find, and it is the residue worth carrying.** `readAcceptanceRuntimePolicy`
now also reads `envelopeFormulaInputs`, so my preflight silently gained a required register row.
Nothing breaks, nothing fails to compile, and no test covers it because no test has a database.
It would have surfaced at the first V-approved run as a preflight refusal nobody expected. Filed
as F-S11-6. **The general shape: a shared reader gaining a dependency is invisible to every gate a
lane runs, because the gate exercises the shape and not the data.**

**The vanished flake was the round's quiet reward.** The RSS-curve name I solo-discriminated in r4
passed here, on the same host, under a LARGER sweep. I had called it memory pressure on the
strength of two solo runs and D30's measured 247–252 MiB against a 256 MiB seal; this is a second
independent observation agreeing with that call. Worth noting because the tempting move in r4 was
to lump it in with the thirteen and write "all pre-existing" — b11 showed it PASSING, which is the
only reason I looked. **A classification is only as good as the record you compare against, and
"these all look familiar" is not a comparison.**

## 23 · Ledger, r5

| item | price |
|---|---|
| merge of 13 commits across my exact read surface, checked before and after | ~15 min; zero conflicts, zero new failures |
| wider sweep + set-comparison against both r4 and b11 | ~6 min; 0 new, 1 vanished, 0 unexplained |
| F-S11-6 found: a shared reader gained a required register row, invisible to every gate | found by reading the diff, not by any check |
| **rework rounds spent** | **2 of 3** (r4 and r5 are merge-ins, not rework rounds) |
