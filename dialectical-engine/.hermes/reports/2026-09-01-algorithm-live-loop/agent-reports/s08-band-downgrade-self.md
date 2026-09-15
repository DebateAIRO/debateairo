# SELF-REPORT — S08 (T12 band over cited nodes + T13 honest downgrade), seat opus-s08-w8

A case file, not a diary. Causes, prices, near-misses, dead ends, and the exact
places the packet left me guessing.

---

## 1. The one decision the packet handed me, and how I made it

The packet said, in as many words: *"T10 replaced the SELECTION, not this node
set: decide and document whether the cited set now comes from the
conformance-verified citations rather than this builder."*

The goal's own T12 sentence asserts that `buildFixedSingleRootServeNodes` "T10
replaces". **That premise is false at e040b1ee.** T10 replaced
`selectServedRootByStrength` — which root gets served. The builder still exists
(`apps/runner/src/index.ts:1292`), is still called on the production path
(`:2724`), and still returns exactly one node by a typed invariant it names
itself (`FIXED_SINGLE_ROOT_SERVE_VIOLATED`, DR-159 B2-A).

So the "one-node basis" the goal wants removed has two possible removals:

- **(a) engine-level** — the basis stops reading the serve set and reads the
  cited set. The forced 0/1 disappears from the *engine*; production shares stay
  0/1 until the served node set widens, because the composer may only cite
  `"primary"`.
- **(b) product-level** — widen the served node set so the composer can cite
  more than the root.

I took (a) and refused (b) in-lane. (b) means editing the composer prompt, the
`node_refs` mapping, `availableNodes`, and breaking DR-159 B2-A's "exactly one
served root" invariant. That is a product change to the composition seam — T9's
surface, explicitly *"not yours"* in my contract — and it needs a ruling, not a
worker's judgement. I filed it as F-S08-1 with the precise shape of the change
so the ruling can be made on facts rather than on a re-derivation.

The price of (a) alone: the DoD's headline sentence ("0/1 shares are no longer
STRUCTURALLY FORCED by a one-node basis") is true of the engine and **not yet
true of a production run**. I would rather say that in the report than let the
sentence pass as fully discharged. It is the single most important thing a
reviewer should check me on.

## 2. The near-miss that would have made the whole lane cosmetic

My first sketch of the T12 RED was "two load-bearing nodes with different ways
of knowing". It fails as a RED: the baseline *already* counts every load-bearing
node, so mixed load-bearing ways are already fractional at the baseline. The
test would have been green on both sides and I would have shipped a rewrite that
proved nothing.

The fix was to notice what actually distinguishes the two sets in both
directions, and to write one test per direction:

- a **cited** node the serve set never marked load-bearing (baseline drops it),
- a **load-bearing** node the statement never cites (baseline counts it).

Cost: about twenty minutes of thinking before a line of test code, and it is the
reason the campaign has real mutants instead of demo mutants.

## 3. `[].every(...)` — the bug I nearly shipped

Moving the downgrade predicate to `citedNodes.every(...)` silently changes the
empty case. `[].every(...)` is `true`, so a statement citing nothing would have
**downgraded itself on a vacuous truth**, then reached `deriveBandCeiling` and
thrown `BAND_CEILING_BASIS_EMPTY` — a loud stop, but from the wrong limb, after
the form decision had already been taken on nothing.

I caught it while writing the property sentence for T13, not while writing code.
The stop (`SERVED_STATEMENT_CITES_NO_VERIFIED_NODE`) is mutant m4.

Before adding it I measured the blast radius rather than guessing (contract §3):
every composer fixture in the corpus carries at least one segment with
`node_refs: ["primary"]` — **11** occurrences in
`tests/integration/database.test.ts` and 3 in `acceptance/**`
(corrected in r3, codex r2 N3: this said 10, and the count was recalled rather
than generated — the exact defect D34 names),
so the stop fires on zero existing runs. The live exposure is a composer that
returns *every* segment with empty `node_refs` — `node_refs` is
`z.array(z.string().trim().min(1))`, so the schema permits it. Disclosed in the
report as the one behaviour change with live reach.

## 4. Two things I deliberately did NOT fix

- **Q51's locator limb still reads the load-bearing set.** After this change the
  answer's *form* and *confidence* read the cited set while the locator
  provenance check reads the serve set. That divergence is real and I can argue
  it should close. But the goal's S08 text changes the basis and the downgrade,
  full stop, and widening a *blocking* gate is a behaviour change nobody asked
  for. F-S08-2, named with the line, not fixed.
- **The RAN bucket.** Board F5 routed T4's structurally-dead RAN arm into exactly
  the span I rewrote, with a do-not-tidy guard. It survives, with the reason in a
  comment at the site, and mutant m5 fails if a future seat deletes it. This is
  the one part of my charge that reached me through the board rather than through
  my packet — see §6.

## 5. Dead ends

- **`git checkout <sha> -- path` for the base zone run.** I did not use it: the
  recorded trap says it *stages*, and D24 ADDENDUM-2 is a whole ruling about a
  restore destroying a round's work. I committed first, then `git checkout
  e040b1ee` (whole-tree, detached), ran the base zone, and returned to
  `lane/s08`. My new test file is *tracked* in the commit, so the base checkout
  removes it automatically and the base failure set is not polluted by my own
  RED. That worked first time and cost nothing.
- **`npx vitest run $CLUSTER`.** Three cluster runs produced "No test files
  found" and three EXIT=1 lines that looked exactly like a real failure. Cause:
  the shell here is **zsh**, which does not word-split unquoted parameter
  expansions, so ten filenames arrived as one argument. Cost ~4 minutes and one
  wasted 3-run cluster. New trap, see §7.

## 6. Where the packet left me guessing — exact spots

1. **My packet does not carry board F5 or board F30, and both are routed to it
   by name.** F5 (`status: ready (consumed at S08 dispatch)`) says the S08 packet
   carries T6's do-not-tidy guard; DECISIONS J4 routes it here explicitly. F30
   (`status: ready (consumed at S08 dispatch)`) says *"the S08/T12 dispatch packet
   carries an explicit input — consume T3's recorded degraded-panel step-down in
   the band computation (FULL→CAPPED per T16's mapping); test the degraded path
   end-to-end"*. Neither sentence appears in `packets/s08-band-downgrade.md`.
   I found them by reading the board on my own initiative.
   - F5 I absorbed anyway: it is a *don't* and it costs nothing to honour.
   - F30 I did **not** implement. It is an added behaviour with its own tests, it
     interacts with a step-down consumer T6 already built on a different
     predicate (`servedCandidateConfidenceBand`, runner `:3110-3132`), and doing
     it unasked is exactly the fan-out the contract's §4 forbids. Named as a
     packet defect with a proposed disposition; it needs the orchestrator to
     re-dispatch it, not a worker's initiative.
2. **"BOTH segments synthesizer-written"** (T13). At the serve gate, both
   segments *are* the composer's text (`segments[0].text`, `segments[1].text`) —
   nothing engine-written can reach them. I asserted the composed texts survive
   verbatim into `answerForm`. If the phrase was meant to demand a *distinct
   synthesizer role* (T16 seals `synthesizerRoleRef`), that lives on T9's path,
   which the packet tells me to write against the current seam and leave alone.
   Read the second way, my assertion is necessary but not sufficient, and I
   cannot close it from here. Flagged so a reviewer can rule rather than assume.
3. **"label + band still shown"** (T13). "Band" is in the serve gate's result and
   I assert it. "Label" is not — it is attached in the runner
   (`answerCarriesLabel`, `:3352`, which already includes `DOWNGRADED`). I read
   the predicate and confirmed it holds; I could not assert it without either
   exporting an inline expression or a database run I was told not to start.
   Stated as read-not-asserted rather than quietly counted as covered.

## 7. Trap for `.hermes/TOOLING-TRAPS.md` — NOT appended, and why

**zsh does not word-split unquoted parameter expansions.** `FILES="a.ts b.ts";
vitest run $FILES` passes ONE argument. Vitest answers "No test files found" and
exits 1 — a false failure that reads like a real one. Use `${=FILES}`, an array,
or literal arguments.

I did not append it. `TOOLING-TRAPS.md` sits at
`dialectical-engine/.hermes/TOOLING-TRAPS.md`, which is **not** on my ticket's
`allowed` list (lane worktree · two agent-reports · `logs/s08/**`), and contract
§4 says the list is exhaustive. It was also already modified by another session
at my session start, so an append is a live conflict as well as an out-of-surface
edit. Two rules pointing the same way; the orchestrator should carry it across.

## 8. What a reviewer should attack first

1. §1 — is (a) enough for T12's DoD, or does the lane owe (b)? That is a ruling.
2. `citedNodes` excludes `NOT_SAMPLED` segments' citations. That is *my* reading
   of the goal's parenthesis "(conformance-verified set)". A reader who takes
   "conformance-verified" to mean only "the run reached the passing gate" would
   count them. My reading is the strictly more honest one — an unchecked citation
   cannot lift a confidence band — but it is a reading, it is mutant m2, and it
   is not free: it is the reason `strangerSampleRate` now has reach into the band.
3. The empty-cited stop (§3) — a new loud stop on a live path, blast radius
   measured at zero fixtures but non-zero in principle.

---

# SELF-REPORT ADDENDUM — S08 r2 (rework 1/3): board F30

The orchestrator accepted the packet defect as its own and re-dispatched F30 as
rework 1/3. What follows is the case file for that round only.

## 9. The decision this round turned on: whose degraded panel?

F30 says "consume T3's recorded degraded-panel step-down in the band
computation". It does not say *which* record, and the answer is not obvious,
because the function I was extending already contains a counter-example.

`servedCandidateConfidenceBand` had two arms. The mono-lineage cap is
answer-scope. The disputed-review arm is **run-scope**: *any* disputed node in
the run steps the band. So "follow the local precedent" gives run-scope, and
"follow the answer-scope pattern" gives served-root-scope. They disagree.

I chose **served-root-scope**, on these grounds:

- The band is the answer's confidence in the *served position*. J16(a) already
  ruled that answer-scope quantities are read from the served root, and T11
  takes its dispersion from exactly that node (`servedRootJudgement.panelDispersion`).
  A band read from a different node than the label is read from would be two
  answer-scope quantities with two different subjects.
- T3 records the degradation **per node**, with `affectedNodeIds: [subjectRef]`.
  A panel that degraded on a node which never reached the answer is disclosed on
  that node and is true there; restating it as the served claim's confidence
  would overstate what happened.
- The two arms mean different things, and I wrote that difference into the code
  rather than leaving the inconsistency to be discovered: a dispute is a
  *declared disagreement about content* (wherever declared); a degraded panel is
  a fact about *how one node's judgement was assessed*.

**I am not certain this is right**, and it is the first thing a reviewer should
attack. The opposite choice — run-scope — downgrades more often, and for an
honesty mechanism "downgrade more when unsure" is a defensible tiebreak. What I
would not accept is leaving it implicit: the choice is pinned by a test ("leaves
the band alone when the degraded panel belongs to a node that is not the served
root") and by mutant f1, so overturning it is a one-line change with a test that
says exactly what changed.

## 10. Why the end-to-end leg is written where it is

F30 asks for an end-to-end test. Three homes were possible:

- **`tests/integration/database.test.ts`** — the sibling arm (T6's disputed
  band) is pinned there with `executeResil01Scenario`, so it was the natural
  home. I started building it and stopped: producing a degraded panel needs the
  secondary maker's *assessment* responses to fail to parse in the right queue
  order, and a fixture I could not execute (embedded postgres, under the
  coordinator's warning of a concurrent full batch suite) would either fail in
  the judge's D15 batch or pass vacuously. Shipping an unexecuted new fixture
  into a shared gate is worse than not writing it.
- **`acceptance/panel-multi-maker.test.ts` confirm-item 5** — T3's own test, the
  one F30 cites, which *already* drives a degraded panel correctly via
  `failAssessCalls(true)` and already reads the sealed row into `controls`. My
  addition is one `GET /v1/runs/:id/answer` and three assertions on top of a
  mechanism that test already proves. Near-zero fixture risk.
- Doing nothing and reporting the gap. Rejected: F30 asks for the test.

I took the second. Its execution routes to the W12 flagship ceremony under J18,
which I state in the report rather than implying the assertion has run. The
honest status is: **written, typechecked, not executed by me.**

## 11. Near-misses this round — all three caught by the harness's own gates

1. **An ambiguous mutant.** `fires: steppedDown !== null,` occurs twice (my arm
   and the dispute arm), and the harness counts *substrings*, so the 4-space
   version is also a substring of the 8-space one. The campaign aborted with
   "the OLD text occurs 2 times" instead of silently mutating the wrong arm and
   reporting a kill that belonged to somebody else's code. Fixed by making the
   OLD span two lines.
2. **A buggy neighbour mutant.** My first `n2` rewrote `.some(...)` to
   `0 < ...filter(...)` and I dropped the `.length` — comparing `0 < [array]`,
   which is always false. It went RED, the harness aborted on "did not
   discriminate as designed", and I fixed the *mutant*, not the test. Without the
   neighbour check I would have had no signal at all; without the abort I might
   have "explained" a RED neighbour as a test being over-tight.
3. **A blind spot I could not close, so I proved it instead.** No assertion of
   mine can tell "step down exactly one place" from "step down to the floor",
   because T16's sealed vocabulary has **two** members (`CAPPED`, `FULL`) and
   both readings land on `CAPPED`. Rather than claim coverage I do not have, I
   built mutant `b1-blind-spot-double-step` — a genuine double-step — and
   recorded that it passes. The blind spot is now evidence, not a footnote.
   (The mono-maker cap does not share it: it walks `bandOrder` by index, so
   mutant m7 catches the same class there.)

## 12. What I did not do, again

- No push, no merge, no board or DECISIONS edit.
- No zone run this round: the coordinator's message says focused runs only while
  a full batch suite runs on the integration worktree, and D13 exists precisely
  because concurrent heavy suites manufacture failures that belong to nobody. I
  compared the r2 cluster's three failures against r1's **base** failure set by
  name AND by failure payload instead — the scaffold pair's payloads are
  byte-identical at base and at the r2 tip, so the cause did not change under my
  new export.
- I still did not touch `TOOLING-TRAPS.md`; the coordinator appended the zsh trap.
  Second trap from this round, for whoever owns that file: **a substring-counting
  mutant gate treats a 4-space match as occurring inside an 8-space match** —
  count with the surrounding line, not the fragment.

---

# SELF-REPORT ADDENDUM — S08 r3 (rework 2/3): codex r2

## 13. The finding I should have caught myself

B1 is the one that stings. In r1 I **read** board F33 — "production entry point
never loads `panelPolicy`" — and quoted it in my own rulings section. In r2 I
then wrote that `main.ts` and the dev policy "already load and pass" that family.
Nobody misled me; I had the fact and asserted its opposite one round later.

The mechanism, as far as I can reconstruct it: in r2 I was answering the
question "does packet step 3 trigger?", and the honest answer to *that* question
is no — I read no NEW register family. I then reached for a reason and wrote a
sentence about the entry point that felt adjacent and was not checked. It is
D34's shape exactly: a claim about an artifact I did not generate from the
artifact. The check that would have caught it costs one grep
(`grep -n panelPolicy apps/runner/src/main.ts` → nothing).

What makes it worse than a slip is what it was load-bearing for. My reachability
test proves a **static call graph**. Paired with a false sentence about the entry
point, the filing reads as though F30 executes in production today. It does not:
on this base an M>=2 run stops at `PANEL_WEIGHTING_UNRESOLVED` before the arm.
The reviewer's prediction section says this plainly and it is correct.

The fix I made is not only the correction — it is moving the caveat **into the
test's own name and comment**, so the next reader of the test cannot inherit the
overclaim from a report they may not read.

## 14. B2 — and the mutants I had to build twice

The reviewer's B2 was right and my own §2 duty should have caught it: I asserted
`bandCeiling.label` and called it "the label". It is the **ceiling's** name. The
verdict label does not exist anywhere in `runServeGateChain`'s return value, so
no assertion on that value could ever have seen a label regression. J25 says the
same thing: I was inspecting a producer's return value and calling it a
disclosure.

The instructive part came after. I wrote two mutants at the label boundary — drop
DOWNGRADED from the runner's attachment predicate, drop it from serve's
persistence predicate — and both went RED, which looked like success. Reading the
kill lines showed they died on `ANSWER_PERSIST_FAILED` and
`VERDICT_LABEL_BASIS_UNRESOLVED`: **the run stops loudly**, so the pre-existing
`result.kind === "COMPLETED"` assertion killed them. My new assertions were still
unpinned, and the campaign would have reported "boundary covered".

> **CORRECTED IN r4 — the clause "the pre-existing `result.kind === \"COMPLETED\"`
> assertion killed them" is FALSE, and it is left standing above with this
> correction beside it rather than quietly rewritten.** No assertion killed them.
> The throw propagates out of `executeWorkItem` at the `await` on
> `tests/integration/database.test.ts:4413`, so the completion `expect` on the
> following line never runs at all. The conclusion the paragraph draws from it —
> that l1/l2 did not pin my new rows, which is why l3 and l4 exist — is
> unaffected. Cause per mutant, from the tool's raw output: report §13.4; how I
> came to write it: §17 below.

That is precisely §2's warning in reverse: not an assertion that pins only its
demo mutant, but a mutant that exercises only somebody else's assertion. So I
built the two that isolate my rows — corrupt the persisted label VALUE
(`CONTESTED` → `SUPPORTED`), and skip the mono cap so the persisted BAND is
wrong — each leaving everything else intact. Both die on exactly one of my
assertions and nothing else. Those are the pins; l1/l2 are evidence about the
boundary's loudness, and the report says which is which.

## 15. On F-S08-5, which I had filed as an accepted limit

I filed the two-band blind spot as a finding and proved it with a surviving
mutant, which felt like the honest move. The reviewer pointed out it was
**cheaply closable** — the helper takes a generic `Record`, so a test-layer
three-band map separates one step from a floor collapse without touching the
sealed vocabulary. That is obviously right in hindsight.

The lesson I want recorded: proving a gap is not the same as closing it, and
"honestly documented limitation" is a comfortable place to stop. I stopped there
because I was thinking about the *production* vocabulary as fixed — which it is —
without noticing the seam I had myself designed to be generic. When a limitation
is stated in terms of a value I control in tests, the next question is always
whether the test can supply a different value.

## 16. What r3 did not change

No push, no merge, no board or DECISIONS edit, no `main.ts`. The T3C dependency
is stated, not taken: J20/J22 give that composition to another lane, and the
temptation to "just add three lines to main.ts so my arm really runs" is exactly
the contract-bound edit §4 forbids — and it would have made the pairing gate
untestable by hiding the dependency instead of naming it.

Third trap for whoever owns `TOOLING-TRAPS.md` (I still may not write it):
**the mission's own stamp comparator will flag its own output** if you write the
comparator's log inside the glob prefix you are checking. Write it outside the
prefix; D41's own record notes the same effect on lane T3C.

---

# SELF-REPORT ADDENDUM — S08 r4 (rework 3/3): the evidence moves to the tool

## 17. The claim I got wrong, and how I got it wrong

In r3 I wrote that mutants l1 and l2 were "caught by the pre-existing
`result.kind === "COMPLETED"` assertion". The orchestrator repeated it, the
reviewer rejected it, and the reviewer is right.

What actually happens: the mutation makes `executeWorkItem` **throw**. The error
propagates out of the `await` on `tests/integration/database.test.ts:4413`, and
**no assertion is evaluated** — not the completion one, not mine. I had the raw
output in front of me; the stack trace names `runnerStage` and
`WalkingSkeletonRunner.execute` and then the test's line 4413, with no `expect`
frame anywhere. I read "the test failed, and there is a completion assertion near
the top of the test" and wrote a sentence about a mechanism I had inferred rather
than read.

It is the same shape as B1 two rounds ago and the same shape D34 names: a claim
about an artifact I did not generate from the artifact. What is uncomfortable is
that I made it **in the paragraph where I was congratulating myself for reading
the kill lines carefully**. I did read them well enough to notice l1/l2 were not
pinning my rows — which is why l3 and l4 exist — and then narrated the reason
wrongly in the same breath.

The correction is now in three places: §13.4 states each cause from the raw
output, §12.2 is corrected in place rather than quietly rewritten, and the r4
index generates the distinction (`ASSERTION FAILED` vs `EXECUTION THREW before
any assertion ran`) mechanically for all 21 mutants, so the next reader does not
depend on my prose for it.

## 18. What using the tool actually exposed

The point of `tools/mutate.sh` is the authorship boundary, and I expected the
re-run to be a formality. It was not — the tool's contract is stricter than my
harness's in two ways I had not noticed:

1. **My gates were substring gates; the tool's are line gates.** `grep -cF` with
   a multi-line NEW treats each line as its own pattern, so five of my tokens
   would have tripped `pre = 0` against text already in the file. My own harness
   counted the whole multi-line token as one substring and passed. Neither is
   wrong, but the tool's reading is the stricter one, and it forced me to state
   each mutation as a single line — which, having done it, reads better: one
   line changed, one line quoted in the transcript.
2. **`\Q` does not stop perl interpolating `$`.** f6's OLD was a template
   literal full of `${…}`, and under the tool it would have silently failed to
   match. My harness used a literal Python `str.replace`, so the problem could
   not arise and I never learned it existed.

I fitted the tokens to the tool in both cases, as instructed, and said so at the
top of §13.2 rather than burying it. The temptation to "just add a `-F`-safe
mode to mutate.sh" was real and would have been exactly wrong: the tool is the
fleet's comparator now, and a seat that edits the comparator to fit its own
evidence has un-moved the boundary the tool exists to move.

## 19. What r4 did not change

No product code. Same tip, same tree, same diff as r3 — verified by running the
D41 comparator against both prefixes (r3: 26 records, r4: 22, zero failures in
each) and by an empty porcelain in every one of the 21 transcripts.

All evidence went to the mission directory. I had already been writing there, but
the instruction to prove it with `ls` rather than with a hash is a good one and
worth stating as a general lesson: **a content check answers "is this the right
bytes", never "will these bytes still exist next week".** The lane worktree's
`logs/` is gitignored and dies with the worktree; D41(b) exists because a seat
lost 22 records that way.

Fourth trap for whoever owns `TOOLING-TRAPS.md` (I still may not write it):
`grep -cF "$MULTILINE"` counts LINES matching ANY line of the pattern, not
occurrences of the whole block — a multi-line token can therefore "already be
present" in a file that does not contain it.

---

# SELF-REPORT ADDENDUM — integration merge (post-verdict, not a rework round)

## 20. The thing that made this merge easy was the thing that could have made it dangerous

All three overlapping files auto-merged with no conflict markers. That is the
outcome most likely to be waved through, and it is exactly where a semantic
break hides: git compares text, and "different lines" is not "different
meaning". T7's incoming diff to `apps/runner/src/index.ts` is 435 lines and
lands close to where I inserted the F30 arm.

So I did not treat silence as an answer. I grepped the **incoming** diff for
every identifier my change defines or depends on — `node_refs`,
`buildFixedSingleRootServeNodes`, `answerCarriesLabel`,
`servedCandidateConfidenceBand`, `applySingleLineageBandCap`,
`verdictLabelBasis`, `servedNodes` — and it names none of them. That is a
positive statement about what T7 did not touch, and it is checkable, unlike "the
merge looked fine".

The one real interaction was in the test file, and it was not in my region
either: T7 provisions `stoppingPolicy` into `runnerSettings()`, which makes its
stopping rule LIVE in every fixture — including the all-reasoned TERM-01 run my
persisted-tuple assertions ride on.

> **CORRECTED after the merge review — "live in every fixture, including
> TERM-01" is FALSE, and it is left standing above with its correction beside it
> rather than quietly rewritten.** TERM-01 goes through `createRunnerWork`
> (`database.test.ts:319-325`) → `createRun` with the default `agentCount = 1`
> (`:205-208`); the runner leaves `expansionPlan = []` when
> `effectiveMakerCount <= 1` (`apps/runner/src/index.ts:2926-2928`) and calls
> `closeGlobalRound` (`:2950`) only from inside the expansion loop (`:3067`), so
> the boundary never fires. It is a MONO-MAKER run. My three runs still prove the
> persisted tuple is unchanged under the merged configuration; they do not prove
> a stopping-boundary interaction, and I asserted a mechanism I had not traced.
> See report §14.2. δ=0 and ε=0 are documented as wide of the
fixtures' arithmetic, but "documented as harmless" is a claim about intent, not
about my fixture. That question belongs to the runner, so I ran it rather than
reasoned about it: 3/3 green, `CONTESTED` and the capped band and the
`REASONING: 1` basis unchanged. If it had shifted, the honest move would have
been a finding, not a quiet re-baselining of my expected values — the standing
rule cuts both ways, and adjusting MY assertion to match a landed lane's new
behaviour would be the same sin as weakening theirs.

## 21. Why I re-ran the whole campaign rather than citing the reviewed one

The 21 transcripts the judge accepted bind `e60e0296`. After the merge the tip
is `f3c7f74f`, the files moved by hundreds of lines, and two of my OLD literals
sit within a few lines of T7's insertions. Citing the old transcripts would have
been a claim about a tree that no longer exists — the same class of gap D27 and
D41 exist to close. Re-running cost about six minutes and answers the question
the merge actually raises: **do the pins still hold against the landed code?**
Every OLD still applied, and `tools/mutant-index.sh` reads the same 19/2 out of
the new transcripts without my help.

## 22. The comment the judge asked for, and why it was worth asking

`state !== "NOT_SAMPLED"` is correct because of a guard thirty lines above it,
not by its own terms. I knew that when I wrote it — it is why I chose the
predicate — but I recorded the reasoning in the report and not in the code, and
the report is not what the next person edits. A predicate whose correctness lives
in another function's early return is exactly the shape that survives review and
then breaks two refactors later, when someone moves the guard for an unrelated
reason and nothing complains. The comment now names the guard at the predicate.

Nothing else changed: no logic, no assertion, no landed lane's test.
