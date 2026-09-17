# F-T17T9-3 — SELF-REPORT (binding)

Answering, verbatim, the question the packet carries:

> "treat it like a murder case. I want to get a nice report on what can be done better.
> What we must upgrade. what repeatedly costed us tokens. how we can make the coding more
> efficient. How can we turn this into a one prompt machine even better."

`comments read through: t17t9-3-dispatch-2026-09-05`

---

## The body: a ticket that could not be built, and nobody checked before dispatching it

The victim is a whole seat-run. The cause of death is a **contract drawn around a producer
without its parser**. `computeStructuralCeilingBasis` decides how the serve leg is counted;
`parseCostEnvelopeBasis` in a different package re-derives that same decision from the
persisted receipt and refuses anything that disagrees. Deliberately — the code says so in a
comment. The ticket asked me to change the first. The contract granted the first. The second
was never listed, and without it the first cannot move a millimetre.

**This was knowable before dispatch, in one grep.** `grep -rn "SYNTHESIS_LOOP" packages/`
returns the parser on line 2 of its output. The packet's own "Where the row lives" section is
an *enumeration* — D61, nine files, carefully built — and it enumerated every file that
**reads the row** while missing the one file that **re-derives the row's consequences**.
That is the lesson in one line: **enumerate by INVARIANT, not by symbol.** Grepping for
`envelopeFormulaInputs` finds the readers. It does not find the code that independently
re-computes `max(compositionSites, synthesisLoopSites)` without ever naming the row.

Price: one full seat-run — provisioning, RED, derivation, impact analysis, records —
producing a decision packet instead of a patch. Not wasted (the derivation and the two
blockers are real deliverables), but not the patch that was asked for.

## What I nearly got wrong

**I nearly shipped `maxRecompose: 1`.** It is the one value that makes the existing `max()`
select the synthesis arm, drops the ceiling to 106, keeps the parser happy, keeps
`apps/api/src/main.ts` untouched, and turns the suite green. I had it worked out and it was
sitting there as "the elegant in-contract solution" for a couple of minutes. It is a lie: zero
composition rounds run, and 1 was chosen for its effect on an inequality, not for its truth.
It is the *identical* move the seat that filed this ticket refused — "I could have made this
green in thirty seconds by editing two numbers" — and I would have made it in a different
place with a better story. **The number that makes the comparison come out right is the number
you must distrust most.** What saved me was the OUTCOME's phrase "not typed to fit the test"
being specific enough to recognise myself in.

**I nearly blocked on reasoning alone.** I had the parser's source and could see the guards.
Writing the 30-line probe that actually feeds the re-derived basis to `parseCostEnvelopeBasis`
took maybe four minutes and turned "I believe this is blocked" into a verbatim refusal message
with two named guards. A block backed by an error string is a decision V can act on; a block
backed by my reading of a file is a thing V has to re-verify. **Blocks need evidence exactly
as much as greens do** — and the harness culture is much better at demanding it for greens.

## What repeatedly cost tokens

1. **Deliberating a design across many turns instead of writing the probe.** I spent
   substantially more context re-reading the OUTCOME, V's row, and the ticket trying to decide
   whether the ceiling should end at 106 or 109 than I spent proving the block. Two probes
   totalling ~60 lines answered more than all that re-reading. **When a design question turns
   on a property of a concrete artefact, measure the artefact.** `heartbeat-worker` §3 already
   says this ("Measure before you speculate"); I read it, then did the opposite for a while.
2. **Reading long prose records to extract three numbers.** The codex r2 report is 132 lines
   and is excellent, but I needed four facts from it (106, the 6-site table, `runSynthesisLoop`
   makes one call per role per round, the 109 basis comes from `computeStructuralCeilingBasis:305`).
   The mission has no machine-readable place for established facts, so every seat re-reads
   narrative to recover them.
3. **zsh eating `--include=*.ts`.** One wasted call, recorded as a trap. Small, but it is the
   third shell-dialect trap in that file; the class is not being fixed, only logged.
4. **Discovering the toolchain by failure.** `Skill(heartbeat-worker)` → `Unknown skill`. The
   repo's skills are not registered for an Agent-tool seat. Recoverable in one call, but every
   seat pays it.

## What we must upgrade

**1. A packet's `allowed` list must be validated against the outcome by a probe, not by an
author's reading.** The dispatch told me "if the outcome needs a file the contract does not
grant, say so and BLOCK rather than reach" — which is correct, and I did it — but it puts the
whole cost of a mis-drawn contract onto the seat, after provisioning. The orchestrator can run
the same check in a fraction of the time: for the function the ticket changes, grep for other
call sites that **re-derive its invariants** (validators, parsers, `superRefine`, second models
in tests), and either grant them or state why they are unaffected. The memory note
"outcome-needs-contract-reach" already records that six packet defects in one lane were this
same habit. This is the seventh. **The habit has not been converted into a mechanical step.**

**2. Name the invariant-restatement pairs in the repo.** This codebase deliberately builds
second models: the enumeration in `t17-envelope.test.ts` restates the ceiling; the budget
parser restates the constructor; `assert_required_rows` restates the row manifest. That
discipline is a strength — it is why the F36 undercount was caught. But nothing lists the
pairs, so every seat rediscovers them, and a contract drawn around one half of a pair is
silently unbuildable. A short `docs/` table — "constructor X ↔ validator Y ↔ second model Z,
change together" — would have made this ticket dispatchable correctly on the first try.

**3. Evidence bars must be reachable on the tree they are demanded of.** The packet demands
"Typecheck 0". The tree it names cannot produce it: 8 inherited `s14-ui` errors, which W5's
own report records twice as identical to dev's baseline. A seat facing an unreachable bar
either misreports, or burns a round arguing. **Write bars as differentials** — "exactly W5's
8 inherited errors and no others" — which is both reachable and strictly stronger, because it
catches a 9th error that "exit 1, pre-existing" would hide.

**4. When V's ruling and the packet's OUTCOME disagree, the packet must say which governs.**
V wrote "the 109 ceiling stays a conservative bound". The packet wrote that the row describes
six sites — which yields 106. The ceiling is a function of the serve leg; both cannot hold.
I can derive both numbers and did, but I cannot rule. A packet that restates a V ruling in its
own words should quote the ruling verbatim beside the restatement, so the seat can see the
seam. Restating a ruling silently is how a ruling gets edited by paraphrase.

**5. Stop describing a class by naming three members.** The ticket says
"`fixedOrgansPerComposition`, `compositionSegmentCap`, `maxRecompose`, … describe the retired
architecture". One of those three is live: `compositionSegmentCap` still caps the synthesizer's
segment array. A seat sweeping "the retired terms" by that list deletes a shipping bound. Per
§2.2 the remedy is shaped by the class: **name the class by its USE ("terms only the retired
composition organs read"), then enumerate by grepping the use** — never hand-list members.

## How to make the coding more efficient

- **Probe before design, always, when the design turns on someone else's code.** The two
  probes here (feed the new value to the validator; import the real constant and compute) are
  a reusable pattern, not a one-off. They belong in the worker floor as a named move:
  *build the artefact your change would produce, feed it to every consumer, read the refusals.*
- **Provision in the background from the first minute.** `pnpm install` ran while I read the
  packet's history. That is free parallelism and it cost nothing to arrange; it should be the
  first tool call of every worker seat, before any reading.
- **Reproduce the RED before understanding the fix, not after.** I did, and it paid twice: it
  proved the environment, and its diagnostic line handed me the measured 106 / 6-site / 18-attempt
  ground truth that every later step compared against.

## How this becomes a one-prompt machine

The gap between "V says re-derive the sealed row" and a landed patch is currently four
human-shaped decisions. Three of them are mechanisable:

1. **Which files must change together?** → mechanisable. A pre-dispatch pass that, for every
   function in `allowed`, greps for validators/parsers/second models that restate its
   invariants and adds them or justifies their absence. **This single step would have made
   this ticket buildable.**
2. **Is the evidence bar reachable on this tree?** → mechanisable. Run the bar's commands on
   the base tip before writing the packet; any that fail become differentials against the
   recorded parent baseline. Cheap: one typecheck.
3. **Does the packet's OUTCOME match V's ruling?** → mechanisable as a *diff*: paste V's row
   verbatim beside the packet's restatement and require a human to confirm the seam. Not
   auto-resolvable, but auto-*surfaceable*.
4. **What should the sealed row mean after T9?** → not mechanisable. This is V's, correctly.

The machine gets closer to one prompt not by making seats smarter but by **spending thirty
seconds of orchestrator time on three greps and one typecheck before dispatch**. This run cost
a full seat because none of the three was run. The ticket was well-researched, the history was
excellent, the RED was precisely located, the outcome was clearly stated — and it was still
unbuildable, for a reason a single grep would have surfaced.

## Dead ends — do not re-derive these

- **`maxRecompose: 1` to flip the `max()`.** Arithmetically the only in-contract path to 106
  (composition sites are `{4,7,10,…}` for the shipping segment cap of 2; only 4 is under 6).
  It is dishonest. Refused. Do not rediscover it as clever.
- **Reporting `composition_sites: 0` for a retired chain.** The receipt schema requires a
  positive integer; "retired" is inexpressible in the receipt shape. This is itself evidence
  that the parser is inside the change.
- **Expecting a new migration.** The row's *value* lives in no migration —
  `0050` declares only the key, family and source_ref, and the value is minted by the seeder.
  The `migrations/ (NEW file only)` grant is dead weight unless the ruling ref changes.
- **Expecting `apps/api/src/main.ts` to be avoidable if the row's key set changes.** It passes
  the envelope fields by name, so while it is readonly the key set is frozen and the two
  genuinely-retired terms cannot leave the row.
- **Editing the t17 expectation at `:633` to the observed six keys.** It would go green and
  leave block (3) of the same test still asserting `observed === 109` beside a `observed === 106`
  four lines earlier. The file has two stale blocks, not one.

## Where the packet was unclear, exactly

- **Line 22** ("if the row lives in a migration, a NEW migration supersedes it") — the row's
  value does not live in a migration. The instruction reads as a fact about this row and is not
  one; it cost me a detour into `0050` to establish.
- **Line 20** ("The ceiling stays a bound that covers the true maximum (106)") vs **V's row**
  ("The 109 ceiling stays a conservative bound"). The packet's "if the re-derivation changes
  the ceiling, show old and new" implies the ceiling may move; V's text says it does not.
  Unresolvable by me.
- **Line 46** ("Typecheck 0") — unreachable on the named tree; see above.
- **Line 32** ("The serve leg whose sites you are describing is `apps/runner/src/index.ts`") —
  accurate and genuinely useful; the runner's own comment at `:1162-1172` names both the defect
  and the correct derivation. **This was the single most valuable line in the packet.** More
  packets should point at the comment that already knows the answer.
- **Line 57** (`.hermes/TOOLING-TRAPS.md (append-only)`) — relative path, the exact ambiguity
  codex t17t9 r2 asked future packets to fix. It recurred in the very next packet.

---
---

# ROUND 2 ADDENDUM (after AMENDMENT 1 — V ruled: seal 106)

`comments read through: t17t9-3-amendment1-2026-09-05`

The round-1 verdict held: the contract could not reach the outcome, the orchestrator recorded
it as defect #24, and the grant was extended. Everything below is new evidence from actually
building the thing.

## The autopsy stands, and the amendment confirms the cause of death

Round 1's finding was "the grant enumerated files by the row's NAME and never asked what
CONSUMES the basis." The amendment adopted that as orchestrator defect #24 and, notably, the
corrected grant was produced by asking exactly that question — it listed thirteen consumers,
and **it was right about all of them**. The fix took one round once the question was asked.

**What the corrected packet got right, and why it is worth copying.** It handed me the consumer
list "so you do not have to find them". I checked it rather than trusting it, and the check was
cheap because the list was concrete: four of the thirteen needed no change, and I could say WHY
in one line each (six of them only pass a ceiling NUMBER through a shared fixture, so fixing the
fixture once fixed all six). **A packet that names candidates and invites falsification is
far cheaper to verify than one that names conclusions.**

## What I nearly got wrong in round 2

**I nearly reported "pro01 and xrev01 are mine."** They failed in my first post-change unit run,
in files I had touched via the shared fixture, with an error (`UNEXPECTED_CLIENT_QUERY`) that
looked exactly like a fixture-shape break. The obvious story — I changed `fixtureStructuralCeiling`,
six suites consume it, two broke — was wrong. Stashing the tree and re-running on the clean base
took under two minutes and showed both failing there, with `dr184` passing. **That same run also
told me the OPPOSITE about the third failure**: `dr184` was genuinely mine, a fourth grid row I
had missed while patching the M=2 row. One measurement, two corrections, in both directions.
Without it I would have shipped a report that misattributed one failure as inherited and two as
mine. **The baseline run is not a formality — it is the only thing that can tell those apart,
and it is cheap enough that there is no excuse for reasoning instead.**

**I nearly left `void compositionSites;` in the constructor.** Suppressing an unused variable is
what you write when you have not decided whether the thing is still needed. The honest version
deletes the variable and keeps only the coherence check that actually uses its parts, with a
comment saying the topology is declared and billed nowhere. A `void` statement is a decision
deferred into the source, and this ticket exists because a decision was deferred into a sealed row.

## What repeatedly cost tokens — round 2

1. **Grid pins duplicated across two files.** The same 4×5 ceiling matrix is pinned in
   `t17-envelope.test.ts` and `dr184-review-resilience.test.ts`. I patched one row of one, then
   one row of the other, then had to go back for the remaining three rows. **The cost was not the
   edit, it was the extra suite run to discover the miss.** A grid pinned twice is a grid that
   will be updated once. If it must exist twice, the second should import the first.
2. **Believing an artefact did not exist because the packet pointed at its summary.** I planned
   my whole attribution strategy around re-deriving a baseline that had already been filed. The
   cost was one stash-and-rerun cycle (cheap, and it paid for itself) plus a wrong recommendation
   I had to retract in this very report. **Before proposing that something be built, `ls` the
   directory where it would already live.**
3. **Discovering pins by running the suite instead of by grepping first.** I did grep — that is
   how I found the thirteen consumers — but I grepped for `109|composition_sites|COMPOSITION|serve: 7`
   and not for the grid's OTHER rows (`25`, `231`, `429`), because I was thinking about the M=2
   case the ticket is about. **Grep for the SHAPE of the pin (a 4×5 literal matrix), not for the
   value you happen to care about.**
4. **`mutate.sh` requires a clean tree,** so all four mutants had to wait for the commit. Sensible,
   but it means mutation custody cannot interleave with development — worth knowing when planning
   a lane's order, and it is not stated in the packet's evidence list.
5. **The full suite is the long pole.** Every other gate in this lane runs in seconds to a minute;
   b14 dominates. Anything that lets a seat know earlier whether b14 will be clean — e.g. a
   recorded parent baseline the seat can diff against instead of re-deriving attribution — is
   worth more than any other speed-up here.

## What we must upgrade — round 2

**1. The parent's failing-name baseline EXISTS and is not discoverable. Fix the pointer, not the
data.** I wrote in an earlier draft of this report that W5's "102 failing names" were "not in a
form I can diff against", and that a committed baseline file would be the single
highest-leverage change for this mission. **That was wrong, and I am correcting it rather than
leaving it, because a confident wrong recommendation is worse than none.** W5 filed exactly the
artefact I asked for: `logs/w5/31-fourcount-run2.log` carries the four-count for the reconciled
tip (80 failures · 1 suite-load · 0 skips · 1 unhandled · passed 2338 / total 2418), and
`logs/w5/27-suite-run2.log` carries all 80 names in a greppable form, with
`logs/w5/32-partition-run2.log` giving the APPEARED/VANISHED partition against the pre-merge run.

I found it by listing `logs/` late in the lane, not from any pointer. **The packet sent me to
`agent-reports/w5-dev-reconciliation.md` — the PROSE — and never to the machine-readable logs
beside it.** So I spent the lane believing I had to re-derive attribution, and I did re-derive
part of it (the stash-and-rerun in §4, which was still worth doing — it caught a failure that
WAS mine). The upgrade is therefore one line in a packet, not a new artefact:

> attribute against `logs/w5/31-fourcount-run2.log` (the four-count) and
> `logs/w5/27-suite-run2.log` (the 80 names); diff with `comm -13`.

**The general lesson is sharper than the original one.** When a mission produces evidence
in both prose and data, the packet must point at the DATA. Prose is what a reader trusts; data
is what a seat can diff. Pointing only at the prose makes every downstream seat re-measure
something already measured — and, worse, makes a seat like me conclude the measurement does not
exist and propose building it again.

**2. Duplicated invariants need a declared pair, not a discovered one.** Round 1's lesson was
that a producer and its parser must be granted together. Round 2 showed the deeper version:
they were duplicated **deliberately and correctly** — an independent check on a persisted claim
is good design — but nothing recorded that they were a pair. The fix I shipped keeps the
independence and removes the restatement (the parser reads the rule and still checks the
receipt against it). **The general pattern is worth naming in the codebase: "independent check,
shared rule" beats "independent check, duplicated rule", and the duplication is invisible until
someone tries to change one side.**

**3. A pin that exists in two files should be imported, not retyped.** Same lesson as #2, one
level down, and the concrete instance is the 4×5 grid.

**4. `formula_version` earns its keep — use it deliberately.** Bumping `DR-184-v3` → `v4` is what
makes a stale stored receipt legible instead of merely invalid. Two out-of-contract files
(`acceptance/panel01-depth1-proof.ts:37`, `acceptance/xrev01-depth1-proof.ts:37`) still name v3 in
prose; I did not reach for them and report them instead. **A version string that appears in prose
in ungranted files is a version string that will go stale** — either it belongs in one exported
constant those files import, or the comments should not name it.

## How this becomes a one-prompt machine — the round-2 answer

Round 1 named three mechanisable pre-dispatch checks. Round 2 confirms the first one is decisive
and adds a fourth:

1. **For every function in `allowed`, grep for validators/parsers/second models that re-derive its
   invariants, and grant them.** Confirmed: this was the whole of round 1's cost, and the amended
   packet that did it produced a buildable ticket on the first try.
2. **Run the evidence bar's commands on the base tip before writing the packet.** Confirmed by P3:
   "Typecheck 0" was unreachable; "exactly W5's 8" is reachable AND stronger.
3. **Paste V's ruling verbatim beside the packet's restatement.** Confirmed by P4: V's "109 stays"
   and the packet's "six sites" could not both hold, and V had to rule again to resolve it. Note
   the resolution *changed the answer* — V chose to seal 106 and withdrew the register sentence.
   That is a decision the seat could not have made and should never have guessed.
4. **NEW — point every b14 packet at the parent's four-count and failing-name LOGS by path,**
   not at the report that summarises them. The artefact already exists
   (`logs/w5/31-fourcount-run2.log`, `logs/w5/27-suite-run2.log`); only the pointer is missing.
   This is mechanisable: the orchestrator knows which parent run a lane is measured against.

The gap left after those four is exactly the part that should stay human: what a sealed number
should MEAN. V spent one decision on it — pad or seal — and that decision is the only thing in
this ticket that a machine had no business making.

## Dead ends — round 2

- **Keeping the composition arm on the receipt "for auditability".** Tempting, and wrong: a
  receipt saying `composition_sites: 7` for a run that opened zero of them is a false statement
  about that run, and V ruled no padding remains. Removing the fields is also what makes the
  strict schema refuse a re-introduced arm (mutant M2) — the honest choice was also the
  better-defended one.
- **Putting `SERVE_LEG` in a new shared package.** `@debateai/budget` already depends on
  `@debateai/register`, so a third package would have added two package edges for one constant
  and given the architecture audit something new to learn. Check the existing dependency
  direction before inventing a home for a shared rule.
- **Trying to make M4 prove single-sourcing.** A parser holding a copy that currently agrees is
  behaviourally identical to one that reads. M4 proves the value FLOWS (the parser's message
  carried the mutated string); it cannot prove no copy exists. Said plainly in the report rather
  than dressed up.

## Where AMENDMENT 1 was unclear, exactly

Very little — it is the clearest packet I have been given in this mission. Two things:

- **"every test whose ONLY change is the pinned site count / selected arm / ceiling"** was the
  right scope for eight of the nine files, but `tests/unit/t17-envelope.test.ts` needed a
  STRUCTURAL change too (the receipt lost three fields, so the eleven-member matrix became eight
  and three cross-field guard tests became one). That file was already fully granted by the
  original packet, so nothing blocked — but a reviewer reading only the amendment's sentence
  would expect a smaller diff there. **When a receipt's SHAPE changes, say so; "pins" undersells it.**
- **"tools/mutate.sh v2 now accepts `/`"** — useful, and in the event no mutant needed one. Worth
  saying in the report so the reviewer does not look for a hand-run gate sequence that isn't there.

## The b14 flake, and the cheapest way to tell a flake from a regression

b14 came back with one failing name the parent did not have:
`registration-database … S3d rework3 B1/B3 probes deep-queue slack`. The tempting moves were
both wrong — call it a flake because it "looks unrelated", or re-run the whole suite and hope.

**What actually settles it costs one suite file.** Re-run that file alone on the same tip. It
passed, and a *different* member of the same file failed instead — one that IS in the parent's
80. So the file has at least two load-sensitive members, and which one fails depends on machine
load rather than on the tip. That is a positive result, not an absence of evidence, and it took
one command against the ~20 minutes a second b14 would have cost.

**The generalisable rule: to distinguish a flake from a regression, shrink the concurrency, not
the code.** Re-running the same scope proves nothing; running the suspect file alone changes the
one variable that matters. The corroborating detail was in the four-count all along — 19 of my
20 unhandled errors were `AUTH_MAIL_BUSY` from the same mail queue, so the "extra" failure and
the "extra" unhandled errors were one contention event counted twice, in two different columns.
**When two of the four counts move together, look for one cause, not two.**

## One more thing I nearly shipped: an unpinned guard

`SERVE_LEG.sites` refuses mismatched per-role round bounds. I wrote that guard as part of the
rule and only noticed afterwards that no test would fail if someone deleted it. I had already
started b14. The options were to leave it (a guard no mutant can kill is a guard that will be
deleted silently — the exact §2 failure), delete it (losing the thing that stops the row
describing a runner that cannot exist), or stop b14 and pin it. I stopped b14, pinned it,
proved the pin with a mutant that kills exactly that one assertion, and re-ran b14 once on the
final tip.

**The lesson is about ORDER, not diligence.** `mutate.sh` requires a clean tree, so mutation
custody can only run after the commit — which means the "is every new guard killable?" question
naturally arrives *after* you have started the expensive gate. **Ask it before the commit:
list every branch you added and name the mutant for each.** It is a two-minute checklist that
would have saved a full suite run here, and it belongs in the worker floor beside the RED-first
rule.

---
---

# ROUND 3 ADDENDUM (after codex r1 CHANGES — B1, B2)

`comments read through: t17t9-3-codex-r1-2026-09-05`

## The murder I actually committed: a conclusion that outran its evidence

Round 2's worst line was mine: *"one contention event counted twice, in two different columns."*
It was tidy, it was plausible, and **it was not measured**. The log I cited had no wall-clock
timestamps and no correlation ids; the `count=19` aggregate I leaned on was on a fixture clock
frozen at 2026-08-19; and the parent had **zero** such rejections rather than fewer. The reviewer
refused it on exactly those grounds and he was right.

What makes this worth writing down is not that I was wrong about the *conclusion*. When I finally
instrumented it, the rejections and the test failure **are** one episode. **I was wrong about the
direction, and I would never have found that by defending my answer.** I had it as "the test
failed, so its promises were abandoned, so they rejected." The truth is the reverse: the 18-second
waiter deadlines expire first, the queue empties because the waiters splice *themselves* out, the
grant records never arrive, and the gate then times out 62 seconds later. The b14 occupancy line —
`{"inFlight":0,"activeSends":0,"queued":0}` — was sitting in my own log the whole time saying so,
and I read it as "the queue drained" instead of "the queue rejected itself empty."

**A right answer reached by a wrong mechanism is not a right answer; it is a coincidence that will
mislead the next person.** The instrumentation cost about forty minutes and produced a stronger
result than the claim it replaced.

## What actually cleared B1, and what it cost

Two things, and only the second is decisive:

1. **The mechanism, read from source.** `registration.ts:1073` reads an 18 000 ms wall-clock
   deadline; `:1094` rejects on it; `runDeepRoute` only awaits those promises after several gates.
   That chain is *readable* — it needed no experiment, and I should have read it in round 2 instead
   of inferring a story from a log.
2. **Parent parity under identical conditions.** Identical instrumented harness in both trees
   (same sha256), the same env-gated 1500 ms deadline override, run on the tip and on a scratch
   checkout of `2af816f1`. Result: 32 rejections and 64 unhandled on **both**, same promise labels,
   same ordering, a 62.011 s vs 62.007 s gap to the gate failure. That is what turns "not mine"
   from an assertion into a measurement.

**Price of skipping it in round 2:** one full review round for the whole lane.

**The technique worth keeping:** to attribute a failure between two trees, *make the harness
identical in both and induce the mechanism deterministically*. I did not need to reproduce the load
episode — I needed to show the phenomenon is a property of the parent's harness. Shrinking a
deadline is far cheaper and far more repeatable than trying to recreate machine contention, and it
answers the actual question. Round 2's instinct — "re-run it in isolation and see" — cannot answer
it at all, because absence under different conditions is not evidence.

## The first experiment failed, and that was the useful one

My first induction forced the `waitFor` gate to throw directly. It reproduced the b14 *label*
perfectly and produced **zero** rejections — and the occupancy at the throw was
`inFlight:32, queued:32`, nothing like b14's zeros. **That mismatch is what corrected me.** Had it
"worked", I would have shipped the backwards mechanism with a green-looking transcript attached.

**Lesson: when an induced reproduction matches the symptom but not the surrounding state, the
state is telling you the mechanism is wrong.** I nearly discarded the occupancy mismatch as noise.

## What we must upgrade

**1. Separate the two columns of the four-count when attributing.** My "NO UNEXPLAINED NAME"
sentence was true — of the *names*. I let it sit next to the unhandled-error count and read as
covering both. The gate has four columns and each needs its own attribution sentence; a single
"explained" verdict spanning columns is how an unexamined column gets waved through. Worth making
explicit in the four-count template, not just in a seat's prose.

**2. An unhandled-rejection column needs correlation to be attributable at all.** Vitest prints
these blocks without timestamps or ids, and attributes them all to whichever test was running last
— which is misleading when the promises were created much earlier. Any suite that abandons promises
by design will produce an unattributable column forever. **A permanent, cheap fix would be a
harness-level unhandled-rejection recorder** (wall clock + creation site) in the shared test setup
— roughly the twenty lines I wrote as throwaway instrumentation. That is the upgrade I would spend
the next hour on.

**3. Byte-identical harness + scratch parent checkout should be a standard move, not an invention.**
It took me one `git worktree add`, one install, one `generate:contract` (which I forgot first time
and lost a run to) and a patch script applied to both trees. Worth a mission tool —
`tools/parent-compare.sh <commit> <test-file> <env...>` — because *every* b14 attribution question
has this shape, and each seat currently improvises it.

**4. Consumer lists need a mechanical derivation, not a hand-written one.** B2 exists because
AMENDMENT 1's list omitted one file, and the orchestrator charged that to himself (#27). Both my
round-1 finding and this one are the same defect: a list of consumers assembled by reading rather
than by grepping the invariant. **A receipt shape is greppable** — `serve_leg`, `COMPUTED_STRUCTURAL_CEILING`,
`selected: "COMPOSITION"` would have found S06 instantly. I grepped for `109|composition_sites|COMPOSITION|serve: 7`
in round 2 and **still missed it**, because I scoped the grep to the amendment's file list instead
of running it across the tree. *Trusting a provided list narrowed my own search* — that is the
sharpest thing I learned this round, and it is the exact inverse of the lesson I wrote in round 2
about the baseline logs.

## Dead ends — round 3

- **Forcing the `waitFor` gate to throw.** Reproduces the label, not the mechanism; zero rejections.
- **Re-running b14 on the final tip.** AMENDMENT 2 says keep the literal 80/1/0/20; re-running
  replaces the record the reviewer asked to preserve. The right move is to bound the delta
  mechanically (comment-only + one added passing test) rather than re-measure.
- **Expecting the parent scratch checkout to run after `pnpm install` alone.** It needs
  `generate:contract` too, or every import of `@debateai/contract` fails to resolve. Cost: one run.

## Where the packet was unclear — round 3

Almost nowhere; AMENDMENT 2 is the tightest of the three. It named the blocking finding, quoted the
standard, granted exactly the instrumentation needed, pre-identified the parent artefacts by path,
and told me what would count as a *negative* result ("if your evidence shows the rejections are NOT
load, say so — that is a finding"). **That last clause is the single most useful sentence in any of
the three packets**: it made an honest null result safe to report, which is the condition under
which a seat will actually go looking. More packets should say it.

---
---

# B1 EVIDENCE ROUND ADDENDUM (V-authorised, 2026-09-05) — result INCONCLUSIVE

`comments read through: t17t9-3-codex-r2-2026-09-05`

## The thing I got wrong twice, in opposite directions

Round 2: I asserted a cause with no timing data. Round 3: I built an experiment, got a clean-looking
parity table, and asserted the cause again — and the experiment **did not do what I said it did**. My
1500 ms override never touched the registration targets at all; it only moved the shared default, so
the dummies died first and the gate I needed became unreachable. The 28.1-second creation→rejection
figures were sitting in my own logs saying "these expired on a 28 s timer, not your 1.5 s one," and I
did not read them. The reviewer parsed my raw logs more carefully than I did.

**The lesson is not "instrument more". It is: after an experiment, check that the mechanism you
intended is the mechanism that fired.** A probe that produces the expected *symptom* through an
unintended *path* is worse than no probe, because it comes with a table that looks like proof. Both
times, the correction was available in data I already had.

## What I would tell the next seat about this specific question

The honest result is INCONCLUSIVE, and I want to be clear that this is a real outcome and not a
failure to try. Four completed runs, two matched pairs, complete custody, complete unhandled
accounting — and no failing episode on either tree. The reviewer's decision rule names this case
explicitly, and AMENDMENT 3's "if your evidence shows it is NOT load, say so — that is a finding"
plus its time box are what made it safe to stop rather than keep torturing the machine for a result.

**The most useful thing this round produced is not the verdict — it is a number.** The suite passes
with its slowest marker reservation at 16.85–17.29 s against an 18 000 ms deadline: a **4–6 % margin**
in an idle run. That is the real story. A test that reserves 96 permits behind a wall-clock deadline
and clears it by a second is not a test that *sometimes flakes under load*; it is a test that is
*always one scheduling hiccup from failing*, and b14 is what that looks like when the hiccup lands.
Measured on the parent as well as the tip, so it is inherited. **A follow-up ticket to widen that
margin — or to drive the deadline from the fixture clock rather than the wall clock — would remove
this whole class of question permanently**, which is worth far more than settling one episode's
attribution.

## What repeatedly cost tokens — this round

1. **Calibrating contention blind.** Three attempts: loadavg 85, then 188, then 8. I had no cheap
   probe of "how much load moves the marker latency", so I guessed levels and each guess cost ~10
   minutes of wall clock. **The cheap thing I should have built first is a latency-vs-load curve** —
   the probe already reports marker settle times, so three short runs at three load levels would have
   told me where the 18 s cliff is, instead of bisecting blind with full test runs.
2. **Burners plus concurrent suites is multiplicative, not additive.** Four vitest suites each spawn
   workers and an embedded postgres; adding 12 CPU burners took loadavg from ~8 to 188. Load
   generators that themselves spawn processes cannot be combined with a fixed burner count and stay
   predictable.
3. **A `nohup`'d script under a background tool call looked finished when it was mid-lead.** I read
   an empty `.jsonl` as "the run died" and nearly re-launched a duplicate. Checking for the *process*
   before concluding cost one call and saved a wasted run.
4. **Forgetting `generate:contract` on the scratch parent** (again — I recorded this exact trap in
   round 3 and still repeated it in round 4's setup, catching it only via the resolve error). A trap
   I wrote down did not stop me repeating it, which says the trap file is not where I look when
   provisioning. **Provisioning should be one script, not a remembered checklist.**

## What we must upgrade

**1. A test whose margin is 4–6 % of a wall-clock deadline should say so out loud.** Nothing in the
suite reports how close it came. Had this test asserted its own headroom — `expect(slowestMarker).toBeLessThan(deadline * 0.8)`
— b14's episode would have arrived as a clear "margin exceeded" instead of an unattributable
`S3D_R3_WAIT_TIMEOUT` plus 19 orphan rejections, and none of rounds 2–4 would have been needed.
**Timing-sensitive tests should assert their headroom, not just their outcome.**

**2. Unhandled rejections need identity at the harness level, permanently.** This round's probe
labelled all four roles and produced a complete accounting trivially. The same ~40 lines in the shared
test setup would make every future unhandled column attributable on the first run. I recommended this
in round 2 as well; this round is the proof it works.

**3. The mission needs `tools/parent-compare.sh`.** I have now built parent-comparison scaffolding
three times by hand — worktree, install, generate:contract, apply identical patch, hash both, run,
revert, prune. Every b14 attribution question has this exact shape.

**4. Do not run timing-sensitive suites from a synced folder.** OneDrive/FileProvider held a core at
100 % and pushed loadavg past 100 while reindexing my own test churn. For a suite with a one-second
margin that is not background noise, it is a confound — and it is invisible in any log we keep.

## Dead ends — this round

- **CPU burners as a contention model for this suite.** Too coarse; the load either fails to move the
  needle or prevents the test from starting. Suite concurrency is closer to the real mechanism but, at
  the levels reachable here, too weak.
- **Trying to reproduce b14's exact episode.** Codex said it plainly and he is right: exact
  reproduction is neither required nor possible. I still spent two attempts effectively chasing it.
- **Reading a parity table as proof without re-deriving the path.** Round 3's whole result.
