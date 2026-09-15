# F-T1-ORACLE-LOGINFP — SELF-REPORT (worker seat, Opus 5, 2026-09-05)

Answering the router §3 question verbatim:

> treat it like a murder case. I want to get a nice report on what can be done
> better. What we must upgrade. what repeatedly costed us tokens. how we can
> make the coding more efficient. How can we turn this into a one prompt machine
> even better.

---

## 1. The body: what actually killed it

`WHOLE_DOMAIN` was unanchored at both ends. `/\b1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\b/`
matches the ruled domain, and it also matches the **middle** of any longer numeric run
that contains those digits in order. `[0, 1, 2, 3, 4, 5]` — six 0-based boxes for a
six-digit login code — contains it. So did nothing else in 232 shipped files, which is
why it looked like a one-file accident rather than a predicate defect.

**The cause is not the regex. The cause is where the negative controls were not.**

That file is unusually disciplined about refutation: the exclusive-`6` arm carries four
negative controls, two of them asserting both operand orders because `&&` commutes, and
a fifth assertion exists purely to pin the one place the oracle narrows r3. The
DOMAIN_ENUMERATION arm carried **zero**. Every control on that arm was positive — "this
spelling must fire". Nothing anywhere asked "what must this arm *not* claim?"

And the arm was the one with the widest window by design. The file's own header says the
oracle "inverts the burden" and takes maximum breadth deliberately, because enumerating
spellings is unwinnable. That is a good decision, but maximum breadth has exactly one
failure mode — false positives — and the arm built for maximum breadth was the arm with
no false-positive control. The defect landed precisely where the discipline stopped.

**Upgrade 1 — an arm with no negative control is an unfinished arm.** Not a review
checklist item: a rule with the same standing as RED-before-GREEN. Where a predicate is
written broad on purpose, the control that bounds it is written in the same commit.

---

## 2. The packet defect, priced

The packet's OUTCOME told me to justify the change "by the shape it now excludes (a
0-based index array with **no depth token in reach**) and the shape it must keep (the
ruled domain's literal values **near a depth token**)."

Implemented literally, that is a depth-token requirement on the DOMAIN_ENUMERATION arm.
Two independent things are wrong with it.

**It was already forbidden.** The confirming review the packet cites — codex W5 r2 F1 —
says in its own Required-fix sentence: *do not "merely require a depth-named variable:
that last shortcut would lose the existing bare option-domain controls."* Three positive
controls in that file (`array option domain`, `set option domain`, `multiline domain
enumeration`) carry no depth token at all. A depth-token rule deletes all three.

**And it could never have fired.** Measured, not reasoned: the ruled domain's own run
always contains a bare `5`, and `kindOfCeilingLiteral` tests `MENTIONS_A_DEPTH &&
BARE_FIVE` **first** and returns. So any candidate that spells the run *and* mentions a
depth is claimed by the ceiling-literal arm before the domain arm is consulted. A
depth-token disjunct on the domain arm is unreachable — a check that cannot fire for the
reason it exists, which is D56 arriving inside the fix for a different D56.

**Price.** ~15 minutes reconciling the packet against the review, plus one 8-line
measurement to prove unreachability. **Price avoided: one full rework round** — either
shipping dead code, or shipping a regression that deleted three controls, both of which
codex blocks on sight.

**Root cause of the packet defect:** the packet cited the review's *verdict* (F1
confirmed the false positive) and its *file:line*, but not the review's *mechanism
constraints*, which were three sentences later in the same paragraph. The seat is then
one click away from a design the reviewer has already rejected in writing.

**Upgrade 2 — a packet that cites a confirming review carries that review's forbidden
mechanisms inline, verbatim.** The verdict without its constraints is an invitation to
re-derive a rejected design.

**Upgrade 3 — and this is the sharper one — D58 says the orchestrator states the OUTCOME
and the seat chooses the MECHANISM.** This packet did state the outcome, and then
prescribed a mechanism in a parenthetical. A suggested mechanism inside an outcome packet
does not read as a suggestion; it reads as an instruction with the orchestrator's
authority behind it. **State the outcome and the forbidden mechanisms. Never a preferred
one.** If the orchestrator has a mechanism in mind, that belongs in the ticket as a
question, not in the packet as a gloss.

---

## 3. Dead ends — recorded so nobody walks them again

| Dead end | Why it is dead |
|---|---|
| Require a depth token in reach on the domain arm | Unreachable (proved above), and explicitly forbidden by codex W5 r2 F1. |
| Exempt `LoginFlow.tsx` by path or filename | Forbidden by the packet and by codex. Also weaker than the shape rule: mutant m2 plants a real `expansionDepth < 6` **into LoginFlow.tsx itself** and the oracle still catches it at line 251. A path exemption would have gone blind there. |
| Fix `kindOfCeilingLiteral` only | Looks right — that is the function the failure came through. But `WHOLE_DOMAIN` is read by **two** predicates, and `kindOf` (r3's retained one) has the identical defect. Fixing the call site fixes the instance and leaves the class. Cost of noticing: one grep. Cost of not noticing: a second finding in review. |
| Guard the raw line only | The `0-based origin, wrapped` control fails under a line-only rule: the DECLARATION window joins the wrapped array back into one unit, so the subsequence reappears there. I nearly reasoned "it fired on a raw line, so guard the raw line". The wrapped control caught me, and I only wrote it because the file's own layout discipline made it obvious that one was owed. |

---

## 4. What repeatedly cost tokens

**4.1 A 714-line test file with no map.** I read it in four slices to find a one-line
regex. About 40% of that file is doc-comment, and the comments are genuinely load-bearing
— they carry the r1/r2/r3 argument history that stops a seat re-litigating a settled
window. The problem is not their length, it is that there is no index. A six-line map at
the top ("predicates ~L246 · units ~L300 · scan ~L440 · controls ~L500+") would have made
this one `sed`. **Upgrade 4: any file over ~400 lines that a seat is dispatched to modify
gets a heading map, and the packet cites the heading, not just the file.**

**4.2 Mission rulings that are not greppable by their own number.** My packet cited D58,
D61, D66, D24, D18, D9-ADDENDUM. `grep '^## D66'` returns nothing — D66 is a **bold
paragraph inside D64's section**, and D58 is inside a dated heading. The natural
conclusion from an empty grep is "the packet cites a ruling that does not exist", which
is a packet defect I was one step from filing falsely. Cost: three extra greps and a
wrong belief I had to walk back. **Upgrade 5: one heading per ruling, `## D<n> — …`, no
exceptions.** This is a two-minute fix to a file that every seat greps.

**4.3 Hunting `tools/mutate.sh`.** The packet writes it repo-relative; it lives in the
mission directory and is in no tree. Cost: one repo-wide `find`. D64 ADDENDUM already
requires absolute paths for `packets/ dispatches/ agent-reports/ logs/ board/` — `tools/`
is the same class and was simply not on the list. **Upgrade 6: add `tools/` to
`packet-lint.sh`'s absolute-path rule.** One line, closes the whole class.

**4.4 The 47-minute full suite.** Unavoidable and correctly mandated, but it is the
largest wall-clock item in every lane, every round. I ran it in the background and did
the attribution baselines and the write-up during it, so its cost here was ~0 marginal
tokens and ~0 marginal wall clock. **That is the pattern worth institutionalising: launch
the long gate the moment the tree is committed and clean, then do the paperwork inside
its shadow.** A packet could simply say so.

---

## 5. What I nearly got wrong — the dangerous one is third

1. Nearly implemented the packet's parenthetical verbatim. One round.
2. Nearly fixed one call site instead of the shared constant. One review finding.
3. **Nearly built the mutant transcripts against the whole file's exit code.** The oracle
   file is *already red* on this tree — a pre-existing J10 `ENOENT` on `web/package.json`
   — so every mutant in it exits 1 whether or not the assertions can see the mutation.
   `mutate.sh` faithfully records `EXIT = 1`, the transcript passes all of its own gates,
   and a reviewer reads "the mutant died". It would have been a **convincing artifact that
   proved nothing in either direction.** I caught it only because I checked whether the
   discriminating command was green at the un-mutated tip before building the first
   mutant, and it was not — I had to narrow it to `-t "the depth bound has a single
   source"` to get a command that can actually discriminate.

   This is the worst failure mode in the harness, because the other two produce something
   that *looks* wrong to a reviewer and this one produces something that looks right.

   **Upgrade 7 — `mutate.sh` should refuse a discriminating command that already fails at
   the un-mutated tip**, exactly as D24 ADDENDUM-2 made it refuse a dirty tree. Same
   shape of gate, same one-line cost: run the command once before mutating, abort if it
   is not green. The tool currently records `EXIT` without knowing whether `EXIT` carries
   information. That is D56 living inside the instrument we use to prove D56 has been
   fixed.

---

## 6. How to make this more of a one-prompt machine

**What already worked, and should be the template.** This lane ran end to end with no
question back to the orchestrator, and three packet properties are why:

- the defect was named to `file:line`, not described;
- the confirming review was on disk and reachable by absolute path, so I could check the
  packet against it instead of trusting it;
- the OUTCOME arrived with its **refutation already chosen** — "m1 re-loosen the lexer,
  m2 plant a real exclusive-six bound" — so the shape of the proof was not a design
  decision I had to make and defend.

That third one is the most under-rated. Most of a worker's uncertainty is not "what do I
change" but "what will count as proof". A packet that names the mutants removes an entire
negotiation.

**What to add to the template:**

1. **The forbidden-mechanism list, quoted from the review.** (§2)
2. **Absolute paths for every tool, not just every record.** (§4.3)
3. **The parent baselines, named by path.** My attribution was mechanical only because
   W5's two run logs, integration's b13 log and dev's `14-attrib-DEV-baseline.log` were
   all on disk in predictable places. I verified my extraction method by reproducing W5's
   published counts (81/80 test failures, 1 suite-load) from their raw logs before I
   trusted it on my own — that check is cheap and should be standard, because an
   attribution built with an unvalidated parser is a fabrication with a table around it.
4. **"Launch the long gate first, write the report inside its shadow."** (§4.4)
5. **One heading per ruling.** (§4.2)

**The honest limit.** A one-prompt machine needs the packet to be *checkable*, not merely
complete. Everything in my packet that was verifiable I verified — the base commit, the
contract hash (`842c6c4e…`, matched), the worktree, the file:line, the four cited rulings
— and one thing that was **not** verifiable was the thing that was wrong: a parenthetical
design hint, which no lint can catch and no hash can confirm. The systemic answer is not
to write better hints. It is to **stop putting hints in outcome packets**, so that
everything a packet asserts is something a seat can check against the tree or the record.

---

## 7. Shortfalls, disclosed

- **Three-run law:** satisfied for the oracle cluster (three runs, all `49 passed | 1
  failed (50)`, identical failing name). The full `pnpm test` was run **once**, as the
  packet directs ("then ONE `pnpm test`"); that is the packet's instruction, not a
  shortfall I chose, but it means the b14 four-count rests on a single run and any
  measured flake in it is un-cross-checked. W5 disclosed the same limit from the other
  side (two runs, not three, at ~47 minutes each) and identified one measured flake,
  `acceptance/model-shim.test.ts › propagates a CLI deadline as HTTP 504 without fallback
  text`, red 1 of 2. If my single run differs from W5's worst run by exactly that name,
  it is that flake and not my diff.
- **Commit trailer:** the harness default asks for a `Co-Authored-By: Claude Fable 5.1`
  trailer. I omitted it. No commit on this branch or in this mission carries one, and
  this seat is Opus 5, not Fable — stamping another model's name on a commit a reviewer
  will read is a fabrication in exactly the register §2.6 forbids. Disclosed rather than
  done silently.
- I did not fix the pre-existing J10 `ENOENT`. It is `tools/orphan-audit` + `web/`, both
  outside my contract, and codex W5 r2 Q3 already attributes it to dev. Named, not
  touched.

---

# ROUND 2 — after codex r1 CHANGES (B1, B2). Same question, answered again.

Round 1 was wrong in two ways that a reviewer found and I did not. Both were reachable from
evidence I already had on screen. That is the finding worth the tokens, so it goes first.

## R2.1 — I mistook an INVENTORY for a SPECIFICATION (cause of B1)

I swept 232 shipped files, found exactly one member of the class, and wrote the rule from it.
The sweep answered *"what longer runs exist in this tree today?"* I then used it to answer
*"what should the predicate do?"* — a different question, and the one that mattered.

Nothing in a census of current occurrences can tell you what a detector must do about
declarations nobody has written yet. codex produced three in a minute:
`[0,1,2,3,4,5].slice(1)`, `[1,2,3,4,5,6].slice(0,-1)`, `const [unused, ...choices] = […]`.
Each evaluates to exactly the ruled domain. My round-1 claim — *"a longer run is necessarily a
different domain"* — was not a cautious generalisation, it was false, and one minute of trying
to break it would have shown that.

**The tell I ignored:** I wrote the sentence "the literal's values decide the domain" without
ever evaluating a literal. The file I was editing warns about exactly this in its own header —
*"Enumerating spellings is unwinnable — the author's imagination is the coverage limit"* — and
I read that paragraph twice while working.

**Upgrade 8 — a measurement of the tree is never evidence about the predicate.** When a fix
changes a rule, the required evidence is adversarial (try to defeat the new rule), not
inventorial (count what the old rule hit). My §3 "class sweep" looked rigorous and was
answering the wrong question at length, which is worse than not doing it: it produced
confidence without coverage.

## R2.2 — I had the disproof of my own architecture in hand and did not read it (cause of B2)

`record()` is six lines and I read them in round 1:

```ts
const record = (kind, line, text) => { if (kind === null) return; … }
```

It only ever ADDS. A window that returns `null` cannot retract a site another window already
committed. That single fact makes a per-candidate predicate structurally unable to carry an
exclusion, because one of the three windows is a *truncated physical line*. Everything in B2
follows from six lines I had already looked at.

Instead I wrote a control for wrapping — and picked the wrong wrapping. I wrote "one value per
line", which mirrors the multiline control already in the file. But that layout never puts the
complete run on any single line, so the line window never sees it and the control cannot fail.
The wrapping that breaks the rule is the one that keeps `1, 2, 3, 4, 5` intact on one line and
moves the sentinel `0,` to the previous one — the layout I did not write.

**Upgrade 9 — when a rule depends on context, the control that matters is the one that REMOVES
the context.** Not "the same thing wrapped somehow" — specifically: put the deciding token on
another line, in another window, out of reach. I wrote a control that could not fail for the
reason it existed, which is D56, and I wrote it inside the fix for a D56.

## R2.3 — What the two have in common, and it is not carelessness

Both failures share one shape: **I validated the fix against the instance I was shown, and
called it a class.** Round 1's report even claims the class sweep as a §2.2 remedy. The packet
named LoginFlow; my rule excluded LoginFlow-shaped things; my controls were LoginFlow variants;
my mutants re-loosened the guard I had just written. Every artifact pointed at the same example.

The worker contract warns about this in one sentence — *"An assertion that pins the mutant you
were shown is not a pin of the property"* — and I quoted the refutation duty in my round-1
report while doing exactly what it forbids. Reading the rule is not applying it.

**What would have caught it, concretely and cheaply:** codex's own method, which took me eleven
minutes to build in round 2 — extract the scanner from the test blob, strip types in memory, run
both the old and the new scanner over candidate strings. No Vitest, no git, no mutation, ~1 s per
run. With that harness the round-1 rule could have been attacked from a blank page in the time
it takes to run the suite once. **Upgrade 10: ship this harness as a mission tool.** Any oracle
whose predicate is a pure function of source text should be attackable without the test runner,
and the diff between the OLD and NEW predicate on arbitrary input is the single most informative
artifact in either round. It is what codex used to find both blockers, and it is what I used to
fix them; it should not be re-derived by each seat.

## R2.4 — Price of the round

One full rework round: ~2 h 40 m wall clock, of which ~50 min was one b14 that told me nothing
new (79 → the same accounting), plus a second ~50 min b14 in this round. **Two of the ~5 hours
this ticket has cost are full-suite runs whose only job is to confirm that a change to one test
file did not disturb 2 400 other assertions.** The scanner harness answers the actual question
— did the predicate change behaviour on shipped code — in about a second (§R2.3), and log 24
does exactly that across all 232 files at both parents and both tips. The full suite is still
owed for the four-count gate, but it should not be the instrument anyone waits on to learn
whether a scanner fix worked.

## R2.5 — What I got right, and would repeat

Refusing the packet's "near a depth token" mechanism was upheld (N3, charged to the
orchestrator), and refusing it cost ~15 minutes against a round. The rule that produced it:
**check the packet against the artefact it cites, not just against the tree.** The forbidding
sentence was in the confirmation the packet itself pointed to. Every packet cites something;
reading the citation is the cheapest review available and it is the seat's own defence.

I also want to name the thing that made round 2 fast: codex's finding was *reproducible*. It
gave inputs, expected outputs, the exact file:line, and the method. I reproduced both blockers
in eleven minutes and never had to ask what was meant. **A review that hands over its
reproduction is worth several that hand over a verdict** — the difference showed up as maybe
three hours saved in a five-hour ticket.

## R2.6 — Corrections to my own round-1 record (N1, N2), stated plainly

- **"m4 kills exactly them and nothing else" — withdrawn.** m4's selector was
  `-t "still catches a longer run when a depth token is in reach"`, so its run was
  `2 failed | 48 skipped (50)`. It shows the two selected assertions detect a weakened
  `BARE_FIVE`. It says nothing whatever about the 48 assertions it did not run. I wrote a
  claim about the whole file from a command that had executed two cases — the same
  instance-for-class error as R2.1, in the evidence rather than the code.
- **"tree clean before and after" for round-1 b14 — withdrawn as recorded custody.** That log
  carries `porcelain BEFORE: []` and no after-stamp. The tree *was* clean afterwards, and later
  logs show it, but that is a later observation, not custody at the moment of the run. Round-2's
  b14 and cluster logs carry both stamps and per-run commit/tree/sha lines. **No historical log
  has been rewritten.**
- **My round-1 import list for `registration.test.ts` was incomplete** and I presented it as
  complete. It also imports `apps/api/src/registration.js`, `apps/api/src/mail-channel.js`,
  `packages/crypto`, `packages/db/src/schema.js` and `@debateai/api`. The conclusion is
  unchanged — none of them is the file I edited — but "I grepped for one name" is not an
  import-graph proof and I should not have written it as one.
- **The sendmail classification is PROVISIONAL**, not "measured load-dependent flake". The
  fixture is a local `/bin/sh` script (`capture-sendmail`) with a `timeoutMs: 1_000` deadline;
  the failure was at 1011 ms; `vitest.config.ts` sets `fileParallelism: false`, so suite-wide
  parallel contention cannot be assumed from run length. Intermittence is established; the cause
  is not. I also should not have proposed merging its remedy with W5's model-shim: that one is
  also a local fake CLI, and "both expose deadlines" is not a shared cause.

**Upgrade 11 — the general form of all four: an evidence sentence must not be broader than the
command that produced it.** Every one of these was a true observation widened by one clause.
The fix is mechanical: when writing an evidence claim, name the command beside it; if the
command's scope is narrower than the sentence, the sentence is wrong.

---

# ROUND 3 — the last authorized round, after codex r2 CHANGES (B1, B2)

Three rounds, three mechanisms, one defect. The mechanisms failed in a pattern, and the
pattern is the finding.

## R3.1 — The pattern: I kept answering a cheaper question than the one asked

| round | the question my mechanism actually answered | how it died |
|---|---|---|
| 1 | *Is the literal run bounded?* | a longer literal can still DERIVE 1..5 |
| 2 | *What is the FIRST operation applied to the literal?* | a trailing comma, `["slice"]`, `as const`, a later `.slice` behind a `.map`, a `.map` inside `new Set` |
| 3 | *What domain does the DECLARATION define?* | — |

Each round I picked the question I could answer with the tool already in my hand — a regex,
then a suffix test — instead of the question the outcome names. AMENDMENT 1 had already
written the right question down: *"reports a site for every ordinary single-declaration
spelling that DERIVES the ruled option domain."* **Derives.** I read that sentence at the
start of round 2 and still built a suffix matcher, because a suffix matcher was one line and
a simulator was fifty.

**Upgrade 12 — when the outcome contains a verb like DERIVES, EVALUATES, RESOLVES or
PRODUCES, the mechanism has to model the verb.** A predicate over surface syntax cannot
answer a question about a value, and no amount of adding cases to it will. The tell is
concrete and checkable: if a reviewer can defeat the rule by rewriting the same expression
without changing what it computes, the rule is matching the wrong thing. That test would
have failed round 1 and round 2 in under a minute each.

## R3.2 — What round 3 does differently, and why it should hold

It stops classifying syntax and starts simulating the declaration over a **deliberately tiny
closed grammar** — `slice` with integer-literal arguments, `reverse`/`sort` as permutations —
with three outcomes instead of two: the value set is *known and is* the domain, known and is
*some other* domain, or *unknown*. Unknown then splits by POSITION, which is the part round 2
had no way to express: unknown values that something downstream can still select from report;
unknown values with nothing after them are withheld. LoginFlow is the second case — a terminal
`.map` into JSX — and every one of codex's five misses is the first.

**The grammar being small is the design, not a shortcut.** Anything unmodelled lands in
unknown, and unknown is withheld only where nothing can act on the values. So the failure mode
of an unlisted operation is a false positive, which is loud and costs one visible diff, never a
miss on a derived domain. Round 2 claimed that inversion and did not have it: its
`!after.startsWith(".")` branch made unlisted SYNTAX permissive, which is the opposite.

## R3.3 — The B2 fix is four lines and I should have seen it in round 2

Round 2 classified each occurrence twice, in two representations — raw source, where a comment
interrupts the numeric run, and the lexer's comment-stripped text, where it does not — and
merged two contradictory verdicts into one line set. I wrote in the round-2 report that layouts
now agreed **"by construction"**. They did not; they agreed because I had not written a case
where the two representations differ, and a comment is the most ordinary thing that makes them
differ.

The fix is to blank comments **to spaces, in place**, so offsets and newlines survive: one
representation, one verdict, and a source offset still addresses the real file. That also
removes the second classification pass entirely — the declaration's start line now comes from
the same occurrence rather than from a re-scan of normalised text.

**Upgrade 13 — "by construction" is a claim about a proof, and I owed one.** I used it to mean
"I cannot presently think of a counterexample". If a property really holds by construction
there is a single place in the code you can point at that makes it impossible to violate; if
you cannot point at that place, say "not observed to fail" and list what you tried. Three of my
most expensive sentences across three rounds were confident phrasings of an untested claim:
"a longer run is necessarily a different domain", "kills exactly them and nothing else", and
"equivalent layouts agree by construction".

## R3.4 — Prices, all three rounds

| | wall clock | what it bought |
|---|---|---|
| round 1 | ~2 h 40 m | a rule that removed the reported instance and lost a class |
| round 2 | ~2 h 40 m | the right ARCHITECTURE (verdict at the merge point), the wrong classifier |
| round 3 | ~2 h 20 m | the right question, with each half pinned by its own mutant |
| of which full suites | ~2 h 30 m total | four b14 runs, one per round plus round 1's |

**The single largest avoidable cost across the ticket is that I ran a 50-minute full suite in
every round to learn something a one-second scanner run already told me.** The full suite is
owed once, for the four-count gate, at the end. It was never the instrument that could find
B1 or B2 — codex found both without running it, and so did I in round 3, in the first eleven
minutes.

**Upgrade 14 — order the gates by what can actually falsify the change.** For a scanner fix
that is: source-only counterexamples → controls → mutants → typecheck → one full suite. I ran
the suite second in rounds 1 and 2, which is why each round's error survived until a reviewer
read the code.

## R3.5 — What reviewing did that I could not

Codex found, in three rounds, eleven counterexamples I did not think of, and every one was
produced by the same move: **take my rule's own justification and construct the input it
excludes.** My rule said "a longer run is a different domain" → `.slice(1)`. My rule said
"the first operation decides" → `.map(n => n).slice(1)`. My rule said "comments don't matter" →
a comment inside the run.

That move is mechanisable and it is not expensive. I now think the right worker discipline is:
**after writing the justification comment, read it back as an adversary and write one input per
clause.** Round 3's comment has five clauses and I wrote a control for each, which is why the
mutants map one-to-one onto them. That should have been round 1's discipline.

The other thing worth naming: codex's reviews got cheaper for me each round because they
carried reproductions — inputs, expected outputs, the method. Round 3's B1 and B2 took eleven
minutes to reproduce and confirm. **A review that hands over its reproduction converts a round
of argument into a round of work.**

## R3.6 — Custody, corrected again (R2-N1), and the lesson under it

Round 2's report said porcelain was `[]` "before and after every gate, mutant and suite run".
Three cluster logs record `[ M dialectical-engine/tests/unit/s1-1-depth-contract.test.ts ]` at
both ends: they were stamped runs of a MODIFIED working tree — valid evidence, described
wrongly. Round-2 b14 really was clean, and my blanket sentence diluted the one artifact that
had the custody I was claiming for all of them.

This is the third instance of the same class in three rounds (m4's "nothing else", the round-1
after-porcelain, now this). The class: **a summary sentence written across a set of artifacts
that do not share the property.** The mechanical fix I have adopted for round 3 is to build the
custody table by READING each log's header rather than by describing what I intended them to
have — which is how I found that logs 40–43 have no custody header at all and that 46 is bare
`tsc` output. Round 3 states custody per artifact, and where a run was against a modified
working tree it says so on that row.

**Upgrade 15 — never summarise custody across artifacts. Emit it per artifact, generated from
the artifacts.** A table that is written by hand is a claim; a table generated from the logs is
evidence. Mine is now generated.

## R3.7 — Still open, honestly

- The simulator models `slice`, `reverse` and `sort` and nothing else. `concat`, `flat`,
  `fill`, `splice`, spread composition and computed narrowing all land in unknown. Where they
  sit before another operation or inside a collapsing wrapper they report (safe); where they
  are terminal they are withheld, and a *terminal* operation that nonetheless yields exactly
  1..5 would be missed. I could not construct one — a terminal operation's result is the
  declaration's value, so producing 1..5 from a longer literal needs a selection, and a
  selection is modelled or unknown-with-continuation — but I have not proved it and I am not
  going to claim it.
- Comment blanking shares the existing lexer's regex-literal exposure: `//` inside a regex
  literal would be read as a line comment. The pre-existing lexer has the same limitation and
  documents it; I did not widen it, and I did not fix it either.
- The intermittent sendmail timeout (R1-N1) and the inherited J10 `ENOENT` are both still
  open and both outside this contract.

---

# APPEND 2026-09-06 · T1-ORACLE-LOGINFP-R3-N round 1 of max 3 · records only

Everything above is unedited. The lane is parked at `60641339` under D68; this append changes no
code, no log and no packet. Answering the router §3 question once more, for the records round.

## S1 — The stale sentence, corrected (N1)

Round 3's §R3.6 says I built the custody table "by READING each log's header … which is how I
found that **logs 40–43** have no custody header at all". That was true when I wrote it and
false by the time I filed it: I regenerated 41, 42 and 43 **with** explicit method/tip/timestamp
headers later in the same round, and did not go back to the sentence that described them.

Corrected: **only 40 and 46 lack a custody header.** 41–43 (and 49) carry
`source-only scanner harness … scanner read from IMMUTABLE git blobs; "round 3" = committed tip
60641339…` plus a generation timestamp.
**STRENGTH: entailed** — the four headers are readable in the filed logs.

## S2 — The cause, which is not "I forgot"

The self-report sentence and the artifacts it describes were **written at different times, and
nothing re-checked the sentence when the artifacts changed.** I regenerated the logs precisely
because their provenance was ambiguous — a good move — and the act of improving them invalidated
a claim I had already written about them, three hundred lines earlier in a different file.

This is the fourth instance in this ticket of one class, and the class is now sharp enough to
name properly: **every one of my record defects has been a sentence that was true about an
earlier state of the evidence.**

| # | sentence | true of | false by |
|---|---|---|---|
| 1 | "m4 kills exactly them and nothing else" | the mutant I imagined | the selector I actually ran |
| 2 | round-1 b14 "tree clean before and after" | the tree I observed later | the log I actually captured |
| 3 | round-2 "porcelain [] before and after every run" | b14 | the three cluster runs |
| 4 | "logs 40–43 have no custody header" | the logs before I improved them | the logs I filed |

Round 3's Upgrade 15 said "never summarise custody across artifacts; generate it". I did
generate it — and the generator had a silent `else` branch that mislabelled log 40 as a working
tree, which is defect #5 of the same class, now one level down in the tool. **A generated
summary is not a true summary; it is a summary whose classifier you now also have to audit.**
**STRENGTH: entailed** for the five sentences and the generator branch; **consistent-with** for
this account of why each was written.

## S3 — What to upgrade, and it is not "be more careful"

**Upgrade 16 — a record's claims about its own artifacts must be regenerated at file time, not
written at observation time.** Every one of the five was a hand-written sentence about a set of
files. The fix is not vigilance, it is ordering: the last action before filing is to re-derive
every artifact-describing sentence from the artifacts as they then exist. Three of the five
would have died at that step; the other two need Upgrade 17.

**Upgrade 17 — a classifier that summarises evidence must fail loudly on the unrecognised
case.** My custody generator had `else → "working tree, pre-commit"`. It should have had
`else → "UNCLASSIFIED — read this log by hand"`. A default that guesses is how a tool launders a
gap into a confident row. This is D56 in a reporting tool rather than a test, and it is cheap to
prevent: no default branch may emit a *specific* claim.

**Upgrade 18 — the universal sweep should run on the records BEFORE the reviewer sees them, and
its output should be filed.** D67 ADDENDUM built `tools/universal-sweep.sh` for exactly this. I
ran it this round and it took nine seconds to list 51 + 66 universals and surface the four that
stood on retracted premises. Had I run it at the end of round 3 it would have surfaced m2's
"exactly the five" and the 36/37 count before codex did. **A nine-second tool that catches two
of a round's four record defects should be a gate, not an option.**

## S4 — On D68, honestly

V ruled to build a real evaluator rather than land round 3, and parked this lane as the control
corpus. I think that is the right call and I want to record why, because it is the most useful
thing in this file for whoever writes the evaluator.

**Three rounds each produced a mechanism that fixed the reported instance and left a soundness
hole a reviewer could name in one sitting.** Not three different mistakes — one mistake, three
times: each round I substituted a question I could answer with the tool in my hand for the
question the outcome named. Round 3's own §R3.1 says this, and then round 3's mechanism *still*
had B1, B2 and B3 in it, which is the strongest available evidence that recognising the pattern
is not the same as escaping it. **Naming your own failure mode does not fix it if the next step
is still cheaper than the correct one.**

What actually changed the outcome was V spending the ticket differently — not a fourth heuristic
round but a different KIND of artifact, planned by an architecture seat and reviewed before any
worker round. **STRENGTH: consistent-with** — three rounds of heuristics failing is evidence that
heuristics were the wrong shape here; it is not proof that the evaluator succeeds.

For the evaluator seat, the durable assets from these three rounds are:

1. **27 classified layout/derivation classes** (`40-`, `49-`) with the base oracle's verdict
   beside each — a ready-made differential corpus. **entailed** as recorded results.
2. **Eight mutants** with their complete selected failing sets, four mapping one-to-one onto
   clauses of an argument. **entailed** within their selector.
3. **The real LoginFlow source under six layouts** (`41-`), which is the one shape that must be
   modelled rather than excluded — D68 says so explicitly.
4. **The three sentences that were false**, above, which are worth more than the corpus: they
   are what a heuristic sounds like from the inside when it is about to be refuted.

**The one thing I would tell that seat:** the outcome sentence contains the verb *derives*. Every
round that did not model a value failed. If the evaluator cannot say what an expression evaluates
to, it will fail the same way, and the counterexample will again take a reviewer one sitting.

## S5 — Claim-strength index for this self-report (N2, D67)

| claim | STRENGTH |
|---|---|
| the five stale sentences and their corrections (S1, S2) | **entailed** — each readable in the filed artifacts |
| the account of *why* each was written | **consistent-with** — my reconstruction, not a recorded result |
| Upgrades 12–18 as remedies | **undetermined** — proposals; none has been run as a gate and shown to prevent the class |
| "every one of my record defects has been a sentence true of an earlier state" | **entailed** for the five listed; **undetermined** as a claim about defects not yet found |
| round-by-round wall-clock prices (R3.4) | **consistent-with** — session timing, not instrumented |
| "the full suite was never the instrument that could find B1 or B2" | **entailed** — both were found source-only, by codex and again by me |
| D68 being the right call | **consistent-with** — see S4 |
| the four durable assets for the evaluator seat | **entailed** as recorded artifacts; their usefulness is **undetermined** until the evaluator uses them |
| everything in the earlier round-1/2/3 sections of this file | governed by the report's §B index and the retractions in §R2.6, §R3.6 and S1 above |

**READY FOR PEER REVIEW** · `comments read through: t1-oracle-loginfp-codex-r3-2026-09-06`
Records only. Append only. Lane untouched at `60641339`.

---

# APPEND 2026-09-06 (2) · T1-ORACLE-LOGINFP-R3-N round 2 of max 3 · after codex records-r3n r1

Everything above, including APPEND (1), is **unedited**. Dispositions supersede; sentences are
preserved. Lane parked at `60641339`. `comments read through: records-r3n-codex-r1-2026-09-06`.

`DISPOSITION` = what happened to the claim. `STRENGTH` = how well the evidence for that
disposition is supported. Separate axes.

## T1 — B-B1 in this file: the bound I wrote as open was already closed

§R3.7 (:473) says the simulator "models `slice`, `reverse` and `sort` and nothing else … a
*terminal* operation that nonetheless yields exactly 1..5 from a longer literal would be missed.
I could not construct one … and I am not going to claim it."

> **DISPOSITION: REFUTED.** A terminal `.filter(n => n > 0)` on `[0,1,2,3,4,5]` is exactly that
> operation. So are `.flatMap(n => n ? [n] : [])`, `.splice(1)`, and `.filter(n => n < 6)` on
> `[1,2,3,4,5,6]`. All four evaluate to `[1,2,3,4,5]`; I re-derived the values directly.
> The companion sentence in the main report — "an unlisted operation costs a false positive,
> never a miss" — is **REFUTED** with them.

**STRENGTH: entailed** for the four values and for the recorded round-3 outputs (inherited from
codex r3 B1, not re-executed by me).

**What is actually interesting here, and it is not the missing filter.** I wrote "I could not
construct one" as though the search had been mine to make. It had already been made, and the
answer was in the file I was quoting three lines earlier. **The failure was not imagination; it
was that I labelled a question open without checking whether the evidence I was citing had
closed it.** That is the same shape as the round-1 packet defect I got right — where reading the
cited artifact was the cheap defence — used in reverse and against myself.
**STRENGTH: consistent-with** — this is my account, not a recorded result.

The regex-exposure sentence at §R3.7's third bullet is likewise **SUPERSEDED**: the lexer
limitation is inherited (stands), but round 3 gave it a **new role** in withholding, which is a
new observable use and a round-2-to-round-3 regression. "Not widened" was true of the lexer and
false of the system. **STRENGTH: entailed** for the distinction as recorded in codex r3 B3.

## T2 — The five-case taxonomy, corrected into three classes (B-B2)

§S2's table called all five "a sentence that was true about an earlier state of the evidence"
and labelled that **entailed** at :593. **Only one of the five is demonstrably that.** The other
four fail in different ways, and collapsing them flattered the story: "true earlier" is a gentler
account than "asserted without support", and I applied it to cases that were the latter.

> **DISPOSITION of the original claim at :514 and :593: REFUTED as stated; replaced by the
> three-class taxonomy below.**

| # | sentence | corrected class | why | STRENGTH |
|---|---|---|---|---|
| 1 | "m4 kills exactly them and nothing else" | **unsupported assertion** | never true of anything; the selector ran two cases and I wrote a claim about fifty | **entailed** — the transcript records the selector and `2 failed \| 48 skipped` |
| 2 | round-1 b14 "tree clean before and after" | **unsupported assertion** | the "after" half was never captured; a later observation of a different moment is not the missing stamp | **entailed** — the log has `porcelain BEFORE` and no after |
| 3 | round-2 "porcelain `[]` before and after every run" | **scope generalization** | true of b14, asserted over the cluster artifacts, which record `[ M …test.ts ]` | **entailed** — both artifacts readable |
| 4 | "logs 40–43 have no custody header" | **temporal staleness** | genuinely true when written; falsified by my own regeneration of 41–43 later in the same round | **entailed** for both states — the pre-regeneration state is evidenced by the sentence's own round-3 context and by 41–43's regeneration timestamps |
| 5 | the generator's `else` branch mislabelled log 40 | **unsupported assertion about an unfiled tool** | the bad row is recorded; the code path that produced it is not | **undetermined** for the branch; **entailed** for the wrong row |

So: **one temporal staleness, one scope generalization, three unsupported assertions** — and the
third of those is about a tool nobody can inspect. The unifying sentence I now believe is
narrower and less comfortable: **every one of my record defects was a sentence whose scope
exceeded the command or artifact behind it.** That covers all five without pretending they were
once true. **STRENGTH: entailed** for the five classifications; **consistent-with** for the
unifying sentence as a generalization over them.

## T3 — B-B2's remaining self-report members, labelled atomically

**T3.1 — :595, "the full suite was never the instrument that could find B1 or B2".**

> **DISPOSITION: REPLACED** by a bounded observation. Discovery by one method does not establish
> another method's inability.

Bounded replacement: *the recorded full-suite runs (round-1, round-2 and round-3 b14) did not
expose B1 or B2; both were found by source-only scanning, by codex and independently by me.*
**STRENGTH: entailed** for what those runs did and did not report. Whether some full-suite
configuration could have exposed them is **undetermined** — I never designed one to try.

**T3.2 — :598, the catch-all row.** "Everything in the earlier round-1/2/3 sections … governed
by the report's §B index" delegated claims that the report's index does not cover, and left
independent claims here unlabelled.

> **DISPOSITION: REPLACED** by the explicit mapping below. No row delegates.

| claim in this file | STRENGTH |
|---|---|
| :63 "Price avoided: one full rework round" (refusing the packet's depth-token mechanism) | **consistent-with** — codex W5 r2 F1 forbade that mechanism and codex r1 upheld the refusal, so a round would plausibly have been spent; the counterfactual itself is **undetermined** |
| the ~15-minute cost of that reconciliation, and all round-by-round wall-clock figures | **consistent-with** — session timing, not instrumented |
| **Upgrades 1–7** (negative controls per arm; packets carrying forbidden mechanisms; outcome-vs-mechanism; heading maps; one heading per ruling; `tools/` in packet-lint; `mutate.sh` refusing an already-red command) | **undetermined** as remedies — none has been adopted and measured. The *observations* behind 5 and 6 are **entailed** (the grep behaviour and the lint rule are checkable); the observation behind 7 is **entailed** (round 1's near-miss is recorded) |
| **Upgrades 8–11** (inventory is not specification; controls that remove context; ship the scanner harness; evidence sentence not broader than its command) | **undetermined** as remedies. Upgrade 11's observation is **entailed** — it is the class T2 now restates more precisely |
| **Upgrades 12–18** | **undetermined** as remedies, as already stated at :592 — unchanged |
| the four "durable assets" for the evaluator seat (§S4) | **entailed** as recorded artifacts; their usefulness **undetermined** until used |
| "D68 is the right call" | **consistent-with** — three heuristic rounds failing is evidence heuristics were the wrong shape; it is not proof the evaluator succeeds |
| §S2's account of *why* each sentence was written | **consistent-with** — reconstruction |

**T3.3 — :528, the generator branch.** **DISPOSITION: label corrected from entailed to
undetermined.** Identical to the main report's F.2: the wrong row is recorded, the code path is
not, and the script is unfiled. I labelled it entailed while conceding in the same sentence that
it could not be inspected.

## T4 — Sweep of the FULL self-report, including both appends

APPEND (1) swept the prefix through :485 and reported 66. That boundary excluded the append it
was written in — the same defect it was correcting, one level up.

| scope | matching lines |
|---|---|
| whole self-report as it now stands | **87** |
| of those, inside APPEND (1) (lines > 485) | **21** |

**STRENGTH: entailed** for the counts, reproduced against codex's independently obtained 87.
Grep line counts, not sentence counts, not semantic coverage.

Of the 21 append-internal universals, five are corrected by T1–T3 above (:473's bound, :514 and
:593's taxonomy claim, :595's impossibility claim, :528's branch label); the rest are scoped to a
named artifact or sit inside quoted historical sentences and carry that sentence's disposition.
**STRENGTH: consistent-with** for this partition — my reading, not a mechanical result.

## T5 — What this round actually taught me, since that is the question

Round 1 of this records ticket corrected four summaries and then **committed two fresh defects of
the same family inside the correction**: it labelled an already-refuted claim "undetermined", and
it swept only the prefix, excluding its own new text. The instrument I proposed as the remedy
(Upgrade 18, run the sweep) I then ran against the wrong boundary.

**Upgrade 19 — a correction is a record, and must be audited by the rule it is enforcing, on
itself, before filing.** Concretely: sweep the file *including* the append; re-read every
disposition against the artifact it cites; and check whether the evidence you are citing already
answers the question you are about to call open. All three failures in APPEND (1) fail that
single check.
**STRENGTH: undetermined** as a remedy — proposed, not yet run as a gate.

**And the one that is not a process rule.** Across three code rounds and now two records rounds,
the recurring move is the same: **I write the strongest sentence the evidence permits, and then
one clause further.** "Never a miss" instead of "no miss found". "Nothing else" instead of "of
the two selected". "By construction" instead of "not observed to fail". "Nothing pushed" instead
of "no push by me, tree clean at every observation". The extra clause is free to write and
expensive to withdraw — five reviewer findings across this ticket were that clause and nothing
else. The discipline that would have prevented all five is one question per sentence: **what
command or artifact would have to exist for this to be true, and do I have it?**
**STRENGTH: entailed** for the five instances; **consistent-with** as a characterization of my
drafting.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r1-2026-09-06`
Records only. Append only. Lane untouched at `60641339`.

---

# APPEND 2026-09-06 (3) · self-audit of APPEND (2), before filing

Upgrade 19, applied to APPEND (2). Two defects found, both of classes APPEND (2) had just
documented. Originals preserved.

**AU.3 — T5's "five reviewer findings … were that clause and nothing else" over-describes its
fifth member.** Findings 1–4 are single over-broad clauses. **B-B2 is not**: it names six
distinct members (log 40's execution method, the unfiled generator branch, "nothing pushed", the
five-case taxonomy, the full-suite impossibility claim, and the unlabelled catch-all). Calling it
"that clause and nothing else" is itself an extra clause — the exact move the sentence describes,
inside the sentence describing it.

> **DISPOSITION: REPLACED.** Accurate version: *four of the five reviewer findings were a single
> over-broad clause; the fifth, B-B2, was six distinct claim/evidence mismatches of the same
> family.* **STRENGTH: entailed** — the members are enumerable in the verdict's own table.

**AU.4 — T4's sweep counts excluded the append containing them.** T4 reports **87**, measured
before APPEND (2). Including APPEND (2) the self-report's count is **111**.

> **DISPOSITION: T4's "87" is SUPERSEDED as a description of this record**; it stands as a
> measurement of the prefix through :485.

| boundary | matching lines |
|---|---|
| prefix through :485 (before APPEND 1) | 66 |
| prefix through :601 (before APPEND 2) | 87 |
| prefix through :744 (before this append) | **111** |

**STRENGTH: entailed** for the three counts, each tied to a named boundary.

**AU.5 — the finding I did not expect, and would keep.** I wrote T5 ("I write the strongest
sentence the evidence permits, and then one clause further") and then, in the same append, wrote
two more such sentences. Naming a failure mode does not suspend it; that is the same result round
3 produced for the code, where §R3.1 correctly diagnosed the pattern and the round-3 mechanism
still carried B1, B2 and B3.

The generalisation worth carrying out of this ticket is therefore **not** a better resolution but
a placement rule: **every claim of the form "all / every / never / nothing else / as it now
stands" must be either (a) tied to a named, stable boundary, or (b) emitted by a tool at file
time.** Prose cannot hold it, and five rounds of evidence say so — three code rounds and two
records rounds, each of which corrected the previous round's over-broad sentence with a new one.
**STRENGTH: entailed** for the five rounds' pattern as recorded; **undetermined** for the rule as
a remedy, which has not been run as a gate.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r1-2026-09-06`

---

# APPEND 2026-09-06 (4) · T1-ORACLE-LOGINFP-R3-N round 3 of 3, the last

Everything above, including APPENDs (1)–(3), is **unedited**. Lane parked at `60641339`.
`comments read through: records-r3n-codex-r2-2026-09-06`. Rows 4–7 of B-R2-B1 are self-report
side and are done one at a time; each fix states the rule it embodies (D67 ADDENDUM 3).

## W1. B-R2-B1, rows 4–7

**W1.4 — row 4 (:653). m4's "never true of anything".**

T2's row 1 classified `"m4 kills exactly them and nothing else"` as an **unsupported assertion**
— correct — and then justified it with *"never true of anything"*. That justification is itself
an unsupported universal. m4's selector ran **2 cases and skipped 48**; a selector that never
executed the 48 cannot establish how they would have behaved, in either direction.

> **DISPOSITION: the class stands as UNSUPPORTED ASSERTION; the "never true of anything"
> justification is WITHDRAWN.** Replacement: *the claimed exclusivity was not established by the
> selected run — the run executed two of fifty cases, and the sentence spoke for all fifty.*
> **STRENGTH: entailed** — the selector at log `11-…:12` and `2 failed | 48 skipped` at `:95`.

> **RULE — correcting an over-broad claim must not be done with a second over-broad claim; the
> honest word for "the run did not show it" is *unsupported*, never *false*.**

**W1.5 — row 5 (:654). "The after half was never captured."**

Two claims again, one observable:

| clause | STRENGTH |
|---|---|
| round-1 b14's log contains `porcelain BEFORE` and no after-stamp | **entailed** — the inspected log |
| no such capture existed anywhere | **undetermined** — I inspected one file; absence there is not absence everywhere |
| *my attestation:* I took no after-stamp for that run | **consistent-with** the log's contents; an author statement, labelled as such |

> **RULE — absence in the inspected artifact is entailed; absence everywhere is undetermined; and
> an author's attestation is a third claim with its own label.**

**W1.6 — row 4 of the taxonomy (:644, :656, :663). The sentence cannot witness its own past.**

T2 called `"logs 40–43 have no custody header"` **temporal staleness** and labelled the whole
five-row set **entailed**, on the strength of (a) my own earlier sentence and (b) the current
regeneration timestamps in 41–43. Neither works. **A sentence under audit is not evidence of its
own earlier accuracy**, and a later timestamp does not reveal what bytes a file held before it.

> **DISPOSITION: row 4 is downgraded to CONSISTENT-WITH temporal staleness.**
> **Entailed:** logs 41–43 *now* carry method/tip/timestamp headers; log 40 and 46 do not.
> **Undetermined:** what 41–43 contained earlier, and therefore whether the sentence was ever
> true. No separately preserved earlier artifact exists to settle it.
>
> **The aggregate at :663 is corrected accordingly.** Honest accounting of the five:
> **one case consistent-with temporal staleness (row 4)** · **one documented scope generalization
> (row 3 — both artifacts readable, entailed)** · **three unsupported assertions (rows 1, 2, 5)**,
> **with row 5's generator branch itself undetermined.** The former "**entailed** for the five
> classifications" is withdrawn: only rows 2 and 3 are entailed as classified.

> **RULE — a record cannot certify its own history; where no independent earlier artifact was
> preserved, the strongest available label is consistent-with.**

**W1.7 — row 7 (:197–205, :310–314; mapping :684–693). Two unlabelled independent claims.**

| claim | atomic label |
|---|---|
| :204–205 *"If my single run differs from W5's worst run by exactly that name, it is that flake and not my diff"* | **UNDETERMINED as causal exclusion.** Name-set equality cannot establish that my diff did not cause it. What is supported: the name is W5's recorded flake, and `registration.test.ts` has no import path to the file I changed — **consistent-with** non-causation, no stronger |
| :313–314 *"maybe three hours saved in a five-hour ticket"* | **UNDETERMINED.** A counterfactual; no un-reproduced arm exists to measure against. The measured part — round 2's blockers were reproduced in ~11 minutes — is **consistent-with** session timing, not instrumented |

> **RULE — recorded equality is not causal exclusion, and elapsed time is not a measured
> counterfactual; both get their own label rather than riding on a neighbouring measurement.**

## W2. B-R2-B2, self-report side

**W2.1 — AU.4's prose attached 87 to the wrong boundary.** It said the superseded **87** "stands
as a measurement of the prefix through **:485**". :485 is **66**. **87 is the prefix through
:601** — which the table three lines below AU.4 already stated correctly.

> **DISPOSITION: CORRECTED — 87 → prefix through :601.** Retained unchanged: **66 → :485** and
> **111 → :744**. Complete file at the time of this append: **:792 → 118**.
> **STRENGTH: entailed** — recomputed with the tool's own expression; all eight boundary values
> reproduce codex's independently obtained table.

Naming a boundary did not stop me copying the wrong one into the prose beside it. That is worth
saying plainly: the boundary discipline fixed the *table* and left the *sentence*.

**W2.2 — the "four of the five" aggregate, enumerated.** AU.3 asserted it without identities.
Enumerated, and the count itself was wrong: these are **five corrected claims across four
reviewer findings**, not five findings.

| # | claim | reviewer finding | shape |
|---|---|---|---|
| 1 | "m4 kills exactly them and nothing else" | **R1-N2** | single over-broad clause |
| 2 | round-1 b14 "tree clean before and after" | **R1-N2** | single over-broad clause |
| 3 | round-2 "porcelain `[]` before and after every run" | **R2-N1** | single over-broad clause |
| 4 | "never a miss on a derived domain" / the terminal counterexample called undetermined | **B-B1** | single over-broad clause |
| 5 | the strength index certifying inferences | **B-B2** | **six** distinct claim/evidence mismatches |

> **DISPOSITION: "four of the five reviewer findings" is WITHDRAWN as miscounted and REPLACED by
> the table above.** **STRENGTH: entailed** for each row's finding ID and source; **consistent-with**
> for the grouping into "single clause" versus "family", which is my classification across four
> verdicts and is not a set any single verdict defines.

**W2.3 — the inevitability claim, narrowed.** See the report's §K: *any write invalidates
verification of the previous complete-file state, whether or not the count changes.* The count can
survive the write; the receipt cannot. **STRENGTH: entailed** — the control reproduces.

## W3. D67 ADDENDUM 3 — the re-read, and what it caught

**W3.1 — the find that justifies the instruction.** Re-reading §R3.2 I found the refuted sentence
a **second** time, at **:387–388**:

> "So the failure mode of an unlisted operation is a false positive, which is loud and costs one
> visible diff, **never a miss on a derived domain**."

APPEND (2)'s T1 retired the bound at :473 and the companion at :623 and **missed this one**, because
the phrase is split across a line break and `grep -n` matches lines, not sentences. A search would
not have found it; reading it did.

> **DISPOSITION: :387–388 is REFUTED**, on the same evidence as E.1 — terminal `.filter(n => n > 0)`
> on `[0,1,2,3,4,5]` yields `[1,2,3,4,5]`, and `flatMap`, `splice` and the suffix-sentinel filter
> do the same. **STRENGTH: entailed** for the four values.

> **RULE — a claim recurs in prose, not in tokens; the sweep is a lead, and the re-read is the
> check.** This is now demonstrated rather than argued: three appends of grep-driven correction
> left the sentence standing, and one re-read removed it.

**W3.2 — the other places I decided the same things.**

| where | the same decision | disposition |
|---|---|---|
| :327 "No historical log has been rewritten" | absence-everywhere, as in W1.5 | **entailed** that I rewrote none; **undetermined** as a property of the files' history |
| :325–326 "The tree *was* clean afterwards, and later logs show it" | an attestation about an uncaptured state, as in W1.5 | **consistent-with**; the missing stamp is not recovered by a later observation |
| :63, :300 (~2 h 40 m), :303–306, :313–314, :151–152 ("~0 marginal tokens and ~0 marginal wall clock") | the price/counterfactual family, as in W1.7 | all **undetermined** as counterfactuals; session timing **consistent-with** |
| :242 "This is the worst failure mode in the harness" | a superlative ranking over cases I did not enumerate | **undetermined** |
| :288 "Every artifact pointed at the same example" | universal over my round-1 artifacts | **entailed** for the four named there; **consistent-with** as stated |
| :180 "Everything in my packet that was verifiable I verified" | completeness about my own checking | **consistent-with** — no independent list of verifiable items exists |
| :387–388, :473, :623 | the refuted "never a miss" family | all three now **REFUTED**; :387–388 by this append |

**STRENGTH: entailed** for each quoted location; **consistent-with** for the judgement that these
are one recurring decision.

## W4. The last thing worth recording

Five rounds — three on code, two on records — and the same sentence-shape survived every one of
them. It survived a reviewer naming it, my own upgrade rules describing it, a tool built to list
it, and three appends written to remove it. It was finally removed by reading the file.

**The durable conclusion is not a better rule; it is a placement.** Every universal I wrote was
cheap to write and expensive to withdraw, and every mechanism I proposed to catch them was itself
a claim I then had to weaken. So the record I would hand forward is: **the sweep finds candidates,
the boundary table fixes numbers, and neither substitutes for one full re-read by the author
before filing** — which is what D67 ADDENDUM 3 requires and what this round demonstrates, because
the only defect the three mechanised passes missed is the one the re-read caught.
**STRENGTH: entailed** for the five rounds' pattern as recorded here; **undetermined** as a
prediction about whether the re-read would keep catching them.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r2-2026-09-06`
Records only. Append only. Lane untouched at `60641339`.

---

# APPEND 2026-09-06 (5) · T1-ORACLE-LOGINFP-R3-N round 4 (V-authorised) · after codex records-r3n r3

Everything above, including APPENDs (1)–(4), is **unedited**. Lane parked at `60641339`.
`comments read through: records-r3n-codex-r3-2026-09-06`. Each fix states its rule (D67 ADD 3).

## X1. B-R3-B1, the three rows

**X1.1 — :922. My own conduct, labelled entailed.** W3.2's first row reads *"**entailed** that I
rewrote none"*. Same correction as the report's §M, and the same self-inflicted irony: W1.5,
eleven sections earlier, is the rule this breaks.

> **DISPOSITION: RELABELLED.** *I rewrote no historical log* is an **attestation**,
> **consistent-with** every inspected artifact and contradicted by none. **Entailed** covers only
> the logs' present contents and the byte comparisons recorded (the two prefix digests, the
> observed mtimes). Activity outside those observations is **undetermined**.

> **RULE — the author is not an instrument; a statement about one's own past actions is an
> attestation, never entailed conduct.**

**X1.2 — :848 vs :811. The exclusive aggregate contradicted my own row 1.**

W1.6 closed with *"only rows 2 and 3 are entailed as classified"*. But W1.4 at :811 had already
established row 1's **classification** as an unsupported assertion, and established it from the
recorded selector — that is entailed. The aggregate erased a label I had just argued for.

> **DISPOSITION: the exclusive aggregate is WITHDRAWN.** Replaced by class and evidence strength
> enumerated **separately, per row**, which is what the collapse was hiding:

| row | claim | class | strength OF THE CLASSIFICATION | strength on "was it ever true" |
|---|---|---|---|---|
| 1 | m4 "kills exactly them and nothing else" | unsupported assertion | **entailed** — selector at log `11-…:12`, `2 failed \| 48 skipped` at `:95`: 2 of 50 cases ran | **undetermined** — the 48 skipped outcomes are unknown |
| 2 | round-1 b14 "tree clean before and after" | unsupported assertion | **entailed** — the inspected log has `porcelain BEFORE` and no after-stamp | **undetermined** — whether a capture existed elsewhere |
| 3 | round-2 "porcelain `[]` before and after every run" | scope generalization | **entailed** — b14 and the three cluster logs are both readable | **entailed false as generalized** — the cluster logs record `[ M …test.ts ]` |
| 4 | "logs 40–43 have no custody header" | temporal staleness | **consistent-with** — no preserved earlier artifact | **undetermined** — earlier bytes unrecoverable |
| 5 | the generator's `else` branch | unsupported assertion about an unfiled tool | **entailed** that the emitted row is wrong | **undetermined** — the code path that produced it |

> **RULE — when rows carry different strengths, enumerate them; an aggregate across a mixed set
> silently demotes whichever member was strongest.**

**X1.3 — :287–288. An unlabelled comparative ranking.**

*"the diff between the OLD and NEW predicate on arbitrary input is the single most informative
artifact in either round."*

> **DISPOSITION: labelled — UNDETERMINED as a comparative fact.** It ranks one artifact above every
> other in two rounds; I never enumerated the comparison set or scored it. It is author opinion.
> What is **entailed** and worth keeping is the bounded fact underneath: *codex used that
> differential to find both round-2 blockers, and I used it to fix them* — recorded in the r1/r2
> verdicts and in logs `40-`/`49-`. Upgrade 10 remains a **proposed remedy (undetermined)**; that
> label was never a label for this ranking.

> **RULE — a superlative is a claim about a set; without the set enumerated it is undetermined,
> and the same rule applies wherever the ranking appears.**

## X2. B-R3-B2 — the sweep listed it; I failed to dispose of it

W3.1 said the phrase *"is split across a line break and `grep -n` matches lines, not sentences. A
search would not have found it; reading it did."* W4 built on that: *"the only defect the three
mechanised passes missed is the one the re-read caught."*

**Both are refuted, and I checked rather than took it on trust.** `tools/universal-sweep.sh`
matches the word `never`; line 387 ends "… never a"; the tool emits it — in the whole-file sweep
**and in the :601 prefix sweep I myself filed in round 2.**

> **DISPOSITION at :910–912 — the REFUTED disposition of the sentence at :387–388 STANDS,
> unchanged**, on the four fresh array values.
> **DISPOSITION at :906–907, :915–916 and :944 — the search-incapacity diagnosis is REFUTED and
> WITHDRAWN.** Narrowed replacement: *a literal single-line search for the phrase `never a miss`
> omits that occurrence; the mandated word-level sweep does not. The sweep listed the candidate
> in round 2 and I did not dispose of it.*
> **Attestation:** re-reading is what prompted me to act on it. **Consistent-with**; which action
> caused the correction, and what I attended to in round 2, are **undetermined**.

This is the more useful finding than the one I claimed. I had written that the mechanised pass
failed and the human pass succeeded. The truth is that **the mechanised pass succeeded and I
ignored its output** — twice, since the same line appeared in the round-2 sweep I filed. A tool
that lists correctly and an author who does not read the list produce exactly the same artifact
as a tool that misses, which is why I mistook one for the other.

> **RULE — before blaming an instrument, run it; recall and disposition are different failures
> and only one of them was mine to fix here.**

## X3. B-R3-N1 — five address corrections, and three source verdicts

**X3.1 — the addresses.** W3.2's mapping asserted locations from memory. Re-derived, each quotation
re-read at its corrected line before writing this:

| quotation | I cited | actual |
|---|---|---|
| "~2 h 40 m" (R2.4 opening) | :300 | **:293** |
| "~0 marginal tokens and ~0 marginal wall clock" | :151–152 | **:123–124** |
| "This is the worst failure mode in the harness" | :242 | **:144–145** |
| "Every artifact pointed at the same example" | :288 | **:275** (enumeration :272–275) |
| "Everything in my packet that was verifiable I verified" | :180 | **:186–187** |

Every disposition in that table is unchanged; only the addresses were wrong.
**STRENGTH: entailed** — each line re-read in this round.

**X3.2 — the aggregate that let five wrong addresses through.** W3.2 closed *"**STRENGTH:
entailed** for each quoted location"*.

> **DISPOSITION: WITHDRAWN.** The quoted **text** is entailed — every quotation is verbatim. The
> **addresses** were asserted without re-derivation, and five of six were wrong. Addresses are
> entailed only where re-checked, which is now true of all of them.

**X3.3 — three source verdicts, not four.** W2.2 said its grouping spans "four verdicts". The four
finding IDs resolve to **three**: `R1-N2` → the oracle lane's codex r1 verdict; `R2-N1` → the
oracle lane's codex r2 verdict; `B-B1` **and** `B-B2` → both in the records-r3n codex r1 verdict.

> **DISPOSITION: CORRECTED — five corrected claims across four reviewer findings, drawn from
> THREE source verdicts.** **STRENGTH: entailed** — finding-ID membership checked in each snapshot.
> I have not identified a fourth verdict contributing to that enumeration, so the count is
> corrected rather than defended.

> **RULE — a count of sources is itself a citation and gets derived, not estimated; "four
> findings" and "four verdicts" are different quantities and I conflated them.**

## X4. D67 ADDENDUM 3 — re-read once more

| where | the same decision | disposition |
|---|---|---|
| :313 "A review that hands over its reproduction **is worth several** that hand over a verdict" | an unlabelled comparative ranking, the X1.3 class — **found by re-reading, not named in any verdict** | **UNDETERMINED** as a comparative fact; the bounded part (round-2's blockers reproduced in ~11 min) is **consistent-with** session timing |
| :325–326 "The tree *was* clean afterwards, and later logs show it" | conduct/state attestation, the X1.1 class | already **consistent-with** — stands |
| :930 "entailed for each quoted location" | the unchecked aggregate, the X3.2 class | **WITHDRAWN** in X3.2 |
| :907, :915–916, :944 | the refuted search diagnosis, the X2 class | **WITHDRAWN** in X2 |
| :144–145 "worst failure mode in the harness" | superlative, the X1.3 class | already **undetermined** at :925 — stands, with its address corrected in X3.1 |
| :186–187 "Everything in my packet that was verifiable I verified" | completeness about my own checking | already **consistent-with** — stands, address corrected |

**STRENGTH: entailed** for each location, re-read at its line this round; **consistent-with** for
the judgement that these are one recurring decision.

## X5. What the fourth round actually settled

I spent three rounds arguing that a human re-read catches what tools miss, and built the claim
into the closing paragraph of the last append. The reviewer then ran the tool and showed it had
listed the line **in the run I filed myself**. So the honest version of this ticket's lesson is
the opposite of the one I kept writing:

**The instruments worked. The dispositions did not.** The sweep listed line 387 in round 2; the
boundary table was right while the prose beside it was wrong; the custody generator emitted rows I
did not audit; the mutants recorded exactly what they killed while my prose widened it. In every
case the artifact was correct and the sentence I wrote about the artifact was not.

That reframes every upgrade I proposed. Upgrades 16–19 were all *more instrumentation*, and
instrumentation was never the gap. The gap is the step between a tool's output and the sentence
that reports it — and nothing I have proposed across five rounds addresses that step, because I
kept diagnosing it as a recall problem.
**STRENGTH: entailed** for the four instances above, each recorded; **consistent-with** for the
reframing drawn from them; **undetermined** as a prediction about what would prevent the next one.

**REWORK READY FOR REVIEW** · `comments read through: records-r3n-codex-r3-2026-09-06`
Records only. Append only. Lane untouched at `60641339`.
