# W5 records seat — self-report · 2026-09-05

Answering, verbatim, the question the router §3 and my packet both put to this seat:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

A case file. Causes and prices, not a diary. This seat was cheap — one hour of wall clock,
about 30 tool calls, no suite, no checkout — so its evidence is small but unusually clean:
it is a controlled experiment in what a *records* round costs, and the answer is that almost
all of it was spent on things that had already been said out loud once.

## The body: the same correction had to be written four times, and one of them still is not

The murder here is not a wrong number. It is that **the correction to m2 was written
correctly, in full, on the round-3 filing date, in `w5-dev-reconciliation.md`:288–301 — and
then not propagated.** The seat that wrote it also wrote, in the mission ledger, that it had
propagated it to three records. It had propagated it to one.

That is the whole of F2. A reviewer spent part of a 32-minute review finding it, an
orchestrator spent a dispatch cycle packaging it, and this seat spent an hour applying it.
**Three seats and roughly ninety minutes of fleet time to copy a paragraph that already
existed, verbatim, in the same directory.**

**CAUSE, named exactly:** the round-3 seat wrote a completion claim about a multi-file
action without enumerating the files. "Corrected in three records" is a COUNT, not a LIST.
A count cannot be checked against the filesystem; a list can, in one grep. The claim was
false at the moment it was written and nothing in the harness could see that.

This is the same failure the mission has already charged twice under different names —
orchestrator self-charge #19 (clock times written into three records without reading a
clock) and #16 (constants copied instead of re-read). All three are one rule: **a value or a
claim that was not read at write time was invented at write time.** #19 was about
timestamps. This one is about a completion count. Same shape, third occurrence.

**UPGRADE 1 (highest value in this report, and it is one line of discipline):** a completion
claim about N artifacts must name the N artifacts. Not "corrected in three records" —
"corrected in `a.md`:292, `b.md`:182, `c.md`:104". A reviewer then checks it with `grep -n`
in one call instead of reading three files to discover the absence. **Price of not having
it, measured on this one finding: ~90 minutes of fleet time and one extra dispatch.** Price
of having it: about fifteen words.

## The second body: the packet could not reach its own stated outcome. Again.

My packet's OUTCOME (D58) says every statement codex named is corrected "in each record that
carries it," and names the aggregate claim as a target. Its `allowed` list reaches **neither**
the round-2 resolution ledger (`logs/devsync/`, while the grant says `logs/w5/`) **nor** the
file the aggregate claim lives in (`LEDGER.md`:319).

What makes this one worth dwelling on: **codex wrote the fix into the verdict the packet was
built from.** F2's last paragraph reads "Grant the old ledger if that file is to be edited;
the worker's listed log grant covers only the new round's directory." The packet was written
after that sentence, cites that finding, and did not act on it. The reviewer had already
paid for the discovery; the dispatch dropped it on the floor.

**CAUSE:** the packet's grant was written from the *round's* directory convention
(`logs/w5/` is where this round's logs live) rather than from the *finding's* file list.
Codex's F2 gives three absolute paths. Two of them are outside `logs/w5/`. Nobody diffed the
finding's path list against the grant.

**UPGRADE 2, and it is mechanical:** every packet built from a review verdict must run one
check before dispatch — extract every absolute path the cited findings name, and assert each
one appears in `allowed`, `readonly`, or an explicit "out of scope, and here is why" line.
This is a `grep -o '/Users/[^)]*'` over the verdict section and a set-difference against the
contract. It would have caught P1 and P2 in seconds. The memory rule this mission already
has — *before dispatch, verify the allowed list can reach the stated outcome* — is correct
and was not executed; the reason it was not executed is that it is stated as a judgement
call and not as a command. **Make it a command and it will run.**

**Price, measured:** one extra dispatch cycle for a single append. The first pass shipped at
8 of 9.

**RESOLVED the same day, and the resolution is the part worth keeping.** The orchestrator
accepted the defect as its #31, wrote AMENDMENT 1 into the packet at 20:46 with the dispatch
recorded at `packets/dispatches/w5-records-2.txt`, and the ninth annotation went in against
the granted file. Ticket closes 9/9.

**Two things that worked, and both should be standard.** First, the amendment was written
into the PACKET, not just sent as a message — so this seat could verify the grant against the
artifact before writing, per router §2.4, instead of taking a chat message as authority. A
grant that exists only in a message is not a grant; if the harness had lost the message the
packet would still have been correct. Second, the correction was APPENDED to the packet with
the original defect left in place, which is the same discipline the ticket itself was about.
The orchestrator applied the rule it was being charged under, in the act of being charged.
That is what a self-correcting loop looks like from inside, and it cost one dispatch.

**The residual lesson is unchanged, because the resolution does not undo the cause:** codex
had already written the fix into F2's last paragraph, and the packet was built without
diffing the finding's path list against the grant. Same-day recovery is good; not needing the
recovery is better, and UPGRADE 2 below is the check that gets there.

## What repeatedly cost tokens

Ranked by what I actually spent, largest first.

1. **Reconstructing which line means what, from line numbers alone — roughly a third of this
   seat's reads.** Codex cites `report:388`, `:455`, `:475`, `:537`. Each citation cost a
   `sed -n` window plus an offset calculation to confirm I had the right sentence, and one
   of them (`:475`) points at the paragraph's opening line while the wrong statement is at
   `:480`. **UPGRADE 3:** a finding should cite `path:line` AND quote the fragment it means —
   eight words is enough. `report:480 "spawns a real external CLI"` is unambiguous and
   survives any later edit to the file; `report:475` alone does not, and dies the moment
   anyone appends above it.
2. **The 2.9 MB suite logs.** `20-suite-run1.log` and `27-suite-run2.log` are ~2.9 MB each. I
   needed exactly two things from them: the `commit=` header line and one failing test's
   duration. A naive `cat` would have been catastrophic; `head -12` and a narrow `grep -n`
   cost almost nothing. **This is a trap only because the win is invisible** — nothing warns
   you before you read a 2.9 MB file into context. **UPGRADE 4:** every filed log over ~100 KB
   gets a sibling `NN-name.HEAD.txt` holding its header block (commit, tree, porcelain,
   counts) at file time. The four-count logs (`28-`, `31-`) already do this and they are the
   two cheapest, highest-value artifacts in the whole directory. Generalise them.
3. **`cat -n` on a 31 KB verdict overflowed into a persisted-output file and had to be
   re-approached section by section.** Cost: one wasted call plus a `grep -n '^## '` to get
   the section map. **Cheaper habit, and I should have started here:** map headings first,
   then read only the sections named. I did that for every file after the first.

## What I nearly got wrong

**I nearly "corrected" the 892.** Report `:367` and ledger `:5` say the lane changed 892
paths; codex re-derives 893. The arithmetic looked settleable — 889 lane-only + 5 shared =
894, which matches neither, while codex's 888 + 5 = 893 is internally consistent. It was
tempting to write "corrected: 893" and move on. **I did not, because I cannot run git and
therefore did not measure it.** The two numbers may be two different measures taken at two
different commits; I do not know, and a records seat asserting a git count it never ran is
precisely the failure this whole ticket exists to repair. It is annotated **OPEN** in both
files. Had I "corrected" it, the correction would have been the fourth invented number in
the same class.

**I nearly annotated inline.** The obvious way to correct line 455 is to put a note under
line 455. That would have shifted 300 lines and broken every citation in the verdict, in two
board tickets and in the mission ledger — turning a records fix into a records corruption.
End-of-file blocks keyed by line number cost slightly more to read and break nothing.
**UPGRADE 5: in an append-only records regime, annotations go at end-of-file, keyed by line,
never inline.** Worth writing into the protocol; it is not obvious until you have nearly
done the other thing.

## Dead ends, so nobody re-derives them

- **`logs/w5/` does not contain a round-2 resolution ledger.** `ls logs/w5/ | grep -i ledger`
  returns exactly one file, `30-r3-resolution-ledger.md`. The round-2 one is
  `logs/devsync/31-r2-resolution-ledger.md` — granted append-only by AMENDMENT 1 and now
  annotated. **Only that one file was granted, not `logs/devsync/`**: the round-2 suite logs
  there are still outside contract, which is why the round-2 gate statements remain
  unswept.
- **The aggregate is now four of four, not three.** Main report :288–301, self-report,
  round-3 ledger, round-2 ledger. Do not re-count.
- **The aggregate "three records" claim is not in either agent-report.** A mission-wide
  `grep -rn "three records"` finds it only at `LEDGER.md`:319 and `packets/w5-codex-r2.md`:19,
  plus unrelated uses in `S07-` and `S08-` reports. There is nothing to correct inside the
  granted records; do not re-grep.
- **The Skill tool cannot load `heartbeat-worker` from an Agent seat.** Returns "Unknown
  skill". Read `.claude/skills/heartbeat-worker/SKILL.md` directly. The F-T17T9-3 seat filed
  this as its P7; this is the second occurrence, so it is a harness defect, not a fluke.
- **Round-1 and round-2 gate statements at report `:18`, `:76`, `:88–89`, `:183` cannot be
  swept from this contract.** They describe the `af072205` tip and their run logs are in
  `logs/devsync/`. I checked; do not re-check.

## What we must upgrade — the structural ones

**U1 · Completion claims name their artifacts.** (Detail above.) The single cheapest change
in this report, and it kills a defect class the mission has now charged three times.

**U2 · Packet grants are derived from the finding's paths, not the round's directory.** Make
it an executable pre-dispatch check, not a judgement.

**U3 · Findings quote as well as cite.** `path:line "eight-word fragment"`. Line numbers
alone are a pointer into a mutable file; the fragment is the pointer that survives.

**U4 · Big logs ship a header sibling.** Copy the `28-fourcount` pattern to every log
over ~100 KB.

**U5 · Annotation shape is protocol, not taste.** End-of-file, dated, keyed by line, with
provenance marked per entry: verified-here vs reviewer's-number. I invented this shape in
this seat because nothing specified it. The next records seat should not have to.

**U6 · Provenance labels belong in every corrected record, not just in the report.** Four of
my nine annotations carry numbers I could not reproduce, because my contract has no git. If
the label `[codex]` were not on them, a future reader would take them as this seat's
measurements — which is the exact way the m2 error propagated in the first place. **A
correction with unmarked provenance is a new claim wearing a correction's clothes.**

## How to make this a one-prompt machine — even better

The honest observation from this seat: **a records-only round should not need a seat at all.**
Everything I did was mechanical once codex's verdict existed. What made it need a human-shaped
agent was that the verdict is prose. Three changes turn most of this round into a script.

1. **Give verdicts a machine-readable finding block.** Alongside the prose, each finding
   emits `{id, files:[{path, line, fragment}], wrong, corrected, provenance}`. Then: the
   packet's `allowed` list is *generated* from `files[].path` (U2 becomes structurally
   impossible); the annotations are *rendered* from `wrong`/`corrected`; and the class sweep
   is `grep -F` on `fragment` across the mission. My whole F3 pass — five annotations —
   was a template fill over data codex had already computed. The prose verdict stays; it is
   what a human reads. The block is what the machine reads. **Neither is derived from the
   other by an LLM at dispatch time, which is where this round's two defects entered.**

2. **Make the class sweep automatic and make its result part of the record.** §2.2 says a
   finding is a sample of a class. I found three unnamed members (`:515`, self-report `:275`,
   ledger `:90–91`) with a single `grep -n` alternation across four files — thirty seconds.
   Codex, reading with far more care than I did, named five lines and missed those three,
   because prose review reads for meaning and misses repetition. **Machines find repetition;
   reviewers find meaning. Stop asking the reviewer to do the machine's half.** Emit
   `fragment`, grep it, attach the hit list to the ticket. Then a seat's sweep is checkable
   mechanically instead of taken on trust, which is what §2.2 actually asks for.

3. **Make append-only a verified property, not an instruction.** I proved it with four
   SHA-256 comparisons of `head -n <orig>` against the pre-edit hash — six lines of shell,
   and it converts "I did not rewrite history" from an assertion into evidence. This should
   be a hook on any ticket whose contract says append-only: record the hash at CLAIM, verify
   the prefix at handoff, fail the handoff otherwise. **The reviewer then never has to read
   the old content to know it survived**, which is most of what peer review of a records
   ticket currently costs.

The pattern behind all three: **this round's two real defects (F2's incomplete propagation,
the packet's unreachable grant) were both LOSSES OF INFORMATION IN A HANDOFF BETWEEN SEATS,
not errors of judgement inside a seat.** Codex knew about the old ledger; the packet lost it.
The round-3 seat knew the correction; the propagation lost it. Every seat did its own job
well. A one-prompt machine gets better not by making seats smarter but by making the joints
between them carry structure instead of prose — because prose is where things get dropped,
and a count is prose pretending to be data.

---

# ROUND 2 ADDENDUM — 2026-09-05 · what the review caught, and why it caught it

Round 2 of max 3, after codex W5-RECORDS r1: 1 blocking, 4 follow-ups. Same question, and
the answer got sharper because this round produced a clean specimen of the exact failure the
first round was sent to repair.

## The murder, this time, was mine — and it is the same one

**I corrected a causal clearance and then re-issued it in the correcting sentence.** A3
reclassified the model-shim failure to "intermittent, undiagnosed" and then closed with
"its 'caused by my resolutions? **no**' answer is unaffected." Those cannot both be true. If
the cause is undiagnosed, merge influence is undetermined — and codex r2 had *already* said
so in §Q4: a changed suite load can affect an unchanged timing test, and this merge changed
suite load (two suite-load failures vanished).

**CAUSE, named exactly:** I treated byte-identity of the test file as if it settled
causation. It settles that the test SOURCE did not change. It says nothing about the
conditions the test ran under. **Unchanged input is not unchanged environment**, and I
elided the two in a single word ("unaffected").

**The deeper cause, and this is the one worth carrying:** I was correcting a sentence, so I
inherited its frame. The original row asserted `caused by my resolutions? no`; my correction
adjusted the *cause* column and left the *clearance* column standing because the finding I
was given pointed at the cause column. **I searched by NAMED LEAD instead of by RISK CLASS**
— the precise habit §2.2 exists to prevent, which I had quoted and applied correctly to
three other statements in the same round. Applying a rule to the members you were shown, and
not to the sentence you are writing at that moment, is how the third defect ships.

**Price:** one full rework round, one blocking finding, one dispatch.

## What repeatedly cost tokens, round 2

1. **Three of my own sentences overstated their evidence, in three different directions,**
   and each cost a follow-up: "wrong arithmetic" (the addition was right, the INPUT was
   wrong); "three different questions" (invented a valid reading for a rejected number);
   "it proves the opposite" (turned *failure to establish P* into *proof of not-P*). None was
   a factual error about the artifacts. **All three were errors in the LOGICAL STRENGTH of a
   claim about evidence** — the same class as the m2 error I was dispatched to fix. Writing
   about weak evidence is where over-claiming is easiest, because the sentence is already in
   the register of correction and reads as careful.
2. **My own completion count was uncheckable.** I wrote "9 of 9" and "ten annotations across
   five files" while the housekeeping four lines below still said "exactly four appends," and
   E1 called itself "the ninth of nine." Codex counted eleven correction groups and could not
   reconcile any of it — correctly, because **I never named the unit.** In round 1 I wrote
   UPGRADE 1: *a completion claim about N artifacts must name the N artifacts.* Then I broke
   it in the handoff of the same report. Knowing a rule and executing it are separate events.

## The upgrade this round actually earns

**U7 · Correcting a sentence does not license inheriting its frame.** When superseding a
statement, enumerate every claim the ORIGINAL sentence made — cause, attribution, clearance,
scope — and rule on each one explicitly, including the ones the finding did not name. The
finding is a sample; the sentence is the class. A correction that adjusts one clause and
silently re-issues the others is worse than no correction, because it launders the surviving
claim through a document that now looks reviewed.

**U8 · A count needs a named unit at the moment it is written, not at review.** "9 of 9" cost
a follow-up, and the receipt that fixed it took twenty minutes to build because I had to
reconstruct my own units after the fact. Had the first handoff carried the four-unit table —
source statements, correction groups, open notes, files — the count would have been checkable
in one pass and would never have drifted from the housekeeping line. **The receipt is cheap
when written alongside the work and expensive when reconstructed from it.**

## For the one-prompt machine, one addition to the three in the original

**Claim-strength is a checkable property, and nothing checks it.** Every one of this round's
four findings — B1, N1, N2, and the count — is a mismatch between what evidence supports and
what a sentence asserts. None required re-reading an artifact; codex found all four by
reading my prose against the evidence I had myself cited. That is a mechanical comparison and
it is the highest-yield review pass in this mission: **for each correction, extract (claim,
cited evidence) and ask whether the evidence entails the claim, is consistent with it, or is
silent.** Three of my four defects were "consistent with, asserted as entails."

If the finding blocks in the verdict carried a `strength` field — `entailed` /
`consistent-with` / `undetermined` — a seat would have to classify its own claim before
filing, and "undetermined" would be a legal, cheap answer instead of a confession. **Every
overreach in both rounds happened where the honest answer was "undetermined" and no field
existed to say it in.** That is the structural fix: not more review, but a slot in the record
where uncertainty is a valid value rather than an omission.

---

# ROUND 3 ADDENDUM — 2026-09-06 · the last round, and a correction to my own round-2 rationale

Round 3 of max 3, after codex W5-RECORDS r2: 1 blocking, 3 follow-ups. STRENGTH per D67 on
every claim.

## First, a correction to what I wrote last round — codex is right and I was over-broad

Round 2's addendum claimed: "**Every** overreach in both rounds happened where the honest
answer was 'undetermined' and no field existed to say it in." **That is false, and it
overstated my own diagnosis in exactly the way the diagnosis was about.**

Codex's counterexample is decisive: 889 + 33 + 5 = 927 is **determinately correct**
arithmetic, and my error there was misnaming a census/input defect — no uncertainty was
involved, and no strength field would have caught it. The receipt totals were likewise
checkable once the units were defined; "9 of 9" failed because the unit was **undefined**,
not because the answer was unknown. STRENGTH of the round-2 rationale as written:
**undetermined at best, and asserted as entailed.** I diagnosed three unlike defects with one
cause because the cause I had just found was fresh.

**The corrected reading, narrower and better supported:** the useful convention is
**evidence-to-claim strength**, not assigning uncertainty to every correction. Of the defects
across three rounds, exactly two turned on unstated uncertainty — the merge-influence
clearance in A3 and its survivor at :560–561. The others were a **misnamed defect class**
(census vs arithmetic), an **invented alternative semantics** (927), a **negation overreach**
("proves the opposite"), and an **undefined unit** (9 of 9). Four distinct failure modes,
one of which a strength field addresses.

And codex's second point lands too: **a field alone cannot guarantee detection.** A single
tag on a paragraph mixing observation, hypothesis and clearance repeats the defect. That is
why this round's supersession enumerates its claims in a table, one row per atomic claim,
instead of tagging the paragraph — and why :560–561 needed a *sweep of dependent aggregates*
after the retraction, not just the retraction. Both steps, or the fix leaks.

**"The field would have caught it" was a proposed safeguard presented as a measured result.**
It is not measured. I am restating it as a proposal.

## The murder, third and last body: a retraction that did not sweep its dependents

R2-B1 is the same defect at one remove. Round 2 retracted the model-shim causal clearance at
:515/:517 correctly — and the report's *concluding* sentence at :560–561 still asserted that
every failing name is either baseline-attributed or causally attributed. Under the definition
:561 itself supplies, the timeout no longer qualifies. **I retired a premise and left a
conclusion standing on it.**

**CAUSE:** I swept the class of *sentences that said the thing* (":515 says external CLI,
:517 says none caused") and not the class of *statements that depend on the thing being
true*. A retraction has two blast radii — the wording, and the inferences downstream — and I
have now, three rounds running, swept the first and missed the second.

**PRICE across the mission, measured:** three rework rounds, three dispatch cycles, one
reviewer pass each. Every single round was a *records* round. No implementation was ever in
question, no suite was re-run, and the accepted merge was never reopened.

## What repeatedly cost tokens — the three-round total

**One habit, three rounds, three names.** Round 1: applied §2.2's class sweep to three
statements and not to the sentence I was writing. Round 2: corrected a cause column and
re-issued the clearance column beside it. Round 3: retracted a premise and left its
conclusion. **Every one is "I fixed the instance I was shown and not the class."** That is
the finding this mission has now paid for three times, and the price was not the writing —
it was the review-dispatch-rework cycle, roughly an hour each.

## The upgrade that would actually have ended this at round 1

**U9 · A retraction must enumerate its dependents before it is filed.** When superseding a
statement S, the required output is not "S is corrected" but three lists: (a) the claims S
made, ruled on individually; (b) every sentence that *repeats* S — grep-able, which I did do;
and (c) every sentence whose truth *depends on* S — which needs reading, not grep, and is the
one I skipped three times. A supersession with an empty (c) list should be suspect by
default, not accepted by default.

This is mechanizable further than I first thought. In this mission's records the dependent
statements were all **aggregate or concluding claims** — "none is caused", "no unexplained",
"all attributed", "each attributed". A retraction of any per-item attribution should
automatically pull every universal quantifier in the same document into the review set. That
is a grep for a *shape* (`all|every|none|no unexplained|each`), not for the retracted text —
and running it after round 1's A3 would have surfaced :560–561 immediately.

**Cost of not having it: two of the three rework rounds.** Round 2 existed because A3's own
clearance survived; round 3 existed because :560–561 depended on it. Both are the same
missing step.

## For the one-prompt machine, revised down

I proposed three structural changes in round 1 and a fourth in round 2. Codex has correctly
narrowed the fourth. What survives, in order of measured value:

1. **Machine-readable finding blocks** `{id, files:[{path,line,fragment}], wrong, corrected,
   strength}` — still the highest-value change, because the packet grant would be *generated*
   from `files[].path` and the round-1 grant defect becomes structurally impossible.
2. **U9's dependent sweep**, with the universal-quantifier grep as its cheap mechanical half.
   **This one is new and it is the one that would have saved two rounds.**
3. **Append-only verified by hook** — record the prefix hash at CLAIM, verify at handoff.
   Round 3 also showed the second half of this: publish **complete** digests with their
   capture layer, or the assurance is not reproducible by the reviewer. An abbreviated hash is
   a claim, not evidence.
4. **Strength labels per atomic claim** — retained, but demoted and restated honestly: a
   proposal that addresses two of six observed defects, not a general remedy, and worthless if
   applied per paragraph rather than per claim.

The through-line across all three rounds is unchanged and I will state it once more, because
it is the only thing here that generalizes: **every defect in this ticket was a loss in a
handoff — between seats, between rounds, or between a sentence and the sentence that depends
on it.** None was a failure to find a fact. The facts were all in the directory the whole
time.

---

# W5-RECORDS-R3-N ADDENDUM — 2026-09-06 · the taxonomy corrected to five categories

Round 1 of max 3 on the follow-up ticket. Append-only; `:328–331` stays as written and is
superseded here. STRENGTH per D67 on every claim.

## The count was wrong in the sentence that was correcting a count

**Superseded:** the round-3 addendum's "**Four distinct failure modes**, one of which a
strength field addresses."

**Why it is wrong.** The same sentence describes the uncertainty defects and then excludes
them from its own total. It names two instances that turned on unstated uncertainty (A3's
merge-influence clearance and its survivor at `:560–561`), then counts only the four
categories that follow. **Six instances in five categories, not four.** STRENGTH:
**entailed** — the inconsistency is internal to the paragraph.

| # | category | instances | which |
|---|---|---:|---|
| 1 | **unstated uncertainty** | 2 | A3's merge-influence clearance · its survivor at main report `:560–561` |
| 2 | **misnamed defect class** | 1 | "wrong arithmetic" for a census/input-count error |
| 3 | **invented alternative semantics** | 1 | 927 given a third-question reading nothing establishes |
| 4 | **negation overreach** | 1 | "it proves the opposite" for a failure to establish |
| 5 | **undefined unit** | 1 | "9 of 9" |
| | **totals** | **6 instances · 5 categories** | |

**What this does to the argument it was serving.** The point stands and gets slightly weaker,
which is the honest direction: a strength field addresses **category 1 — two of six
instances**, not the two-of-six-in-four-modes I implied. The other four categories are
defects of *naming, definition and logical form*, and no uncertainty label catches any of
them. STRENGTH: **entailed** for the arithmetic; **undetermined** for whether the field would
have prevented category 1 in practice — that remains a proposal, as codex r2 required me to
say and as I restate here.

## And the shape of this one is the finding

This is the **fourth consecutive round** in which my defect was a count or a claim whose unit
I had not pinned down — "corrected in three records", "9 of 9", "13 appends across 5 records",
and now "four failure modes" inside the very paragraph correcting the taxonomy. STRENGTH:
**entailed** — all four are on the record above.

**CAUSE, and it is not carelessness about arithmetic.** Every one of these numbers was
produced by *summarizing at the end of writing*, from memory of what I had just done, instead
of *counting the artifacts* at the moment of the claim. The rule I wrote in round 1 —
UPGRADE 1, name what you count — turns out to be necessary but not sufficient: I named the
units in round 3's receipt and still miscounted, because I wrote the housekeeping line from
recollection rather than re-deriving it from the receipt I had just published two hundred
lines above.

**U10 · A summary line must be derived from the enumeration it summarizes, in the same pass,
never recalled.** If a report contains both an enumeration and a total, the total is the last
thing written and it is read off the table — mechanically, not from memory. Where the
enumeration is machine-readable, the total should not be typed by hand at all. Measured cost
of not having it across this mission: four rounds, each spending a review cycle on a number
that the report itself already contained the means to compute. STRENGTH: **entailed** for the
four occurrences; **undetermined** for the savings a fix would produce, which is a projection.

**What I will not claim.** That this exhausts the class. Three separate reviews found three
separate count defects after I had already adopted a rule against them, which is evidence that
my own sweep of this class is not reliable. The honest disposition is that counts in my
records should be treated as **checkable, not checked**, until a reviewer or a tool has
recomputed them. STRENGTH: **consistent-with** — an inference from four observations, not a
measurement.

---

# RECORDS-R3-N ROUND 2 ADDENDUM — 2026-09-06 · the fifth instance, and it is the same shape

Round 2 of max 3 on W5-RECORDS-R3-N, after codex records-r3n r1: one blocker, A-B1.
Append-only. STRENGTH per D67 on every claim.

## What was caught

A-B1: I wrote that the records self-report's round-1 state is "unhashed" and that "no digest
for it exists to publish", and labelled it **entailed from the manifest**. The manifest is
bounded evidence. Its silence entails only that **no such tuple is published there**. Whether
a capture was ever taken is **undetermined**, and my belief that I did not take one is
**consistent-with** — an attestation, not a proof. STRENGTH: **entailed** for the mismatch
between the evidence named and the label attached.

## The shape, and why this one is worth more than the fix

The paragraph immediately above the defective one draws exactly the right line for the other
two records: "no separate Layer-2 tuple … is published", "none is invented here". **I made the
correct distinction and then, three lines later, failed to make it again.** The defect was not
ignorance of the rule. It was that I stopped applying it at the boundary of the sentence I had
been asked about.

This is the same failure as round 1's B1 (swept three statements, not the one I was writing),
round 2's (fixed the cause column, re-issued the clearance column), and round 3's (retracted a
premise, left its conclusion). **Fifth instance, one shape: I apply a rule to the members in
front of me and stop at the edge of the finding.** STRENGTH: **entailed** — all five are on
the record.

**A sharper name for it than I have used so far.** I have been calling this "instance instead
of class". That is not quite right, and the imprecision has cost me two rounds. What actually
happens is narrower: **I treat the finding's boundary as the work's boundary.** When a
reviewer names lines 510–517, I correct 510–517 with care and my attention stops at 518 —
even when the identical error sits at 520, and even when I demonstrably know the rule, because
I applied it correctly at 505. The class sweep I keep prescribing addresses *repetition of the
text*; this is *repetition of the reasoning*, which no grep finds.

## What follows for the machine

**U11 · The unit of correction is the reasoning pattern, not the cited span.** After fixing a
cited defect, the required next step is to state the *rule* the fix embodies in one sentence,
then re-read the whole document asking only "where else did I decide this?" — a re-read, not a
search. In this ticket the rule was one sentence long: *absence in bounded evidence is
published-absence, never historical absence.* Applying it to the whole manifest section, which
takes about two minutes, would have caught 510–517 in the previous round.

This is the fourth successive round where the fix was cheap and the *scope of the fix* was the
expensive mistake. STRENGTH: **entailed** for the four occurrences; **undetermined** for
whether U11 prevents the fifth, since no measurement of it exists.

**What I will not claim:** that naming this pattern retires it. I named the class in round 1,
named it more precisely in round 2, adopted U9 and U10 for it, and produced instances four and
five afterwards. The honest disposition is unchanged from the last addendum and now better
evidenced: **my own scoping of a correction should be treated as checkable, not checked.**
STRENGTH: **consistent-with** — an inference from five observations, not a measurement.
