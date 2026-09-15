# demo-path — self-report (round 1)

A case file on one lane: two test-only defects, four files, two commits, no rework round used.
Base `7e8f1e51` → filed tip `193509a1`. Wall clock about 47 minutes end to end; 45 vitest runs
totalling 432 seconds of suite time across 51 filed records. Nothing here is a diary entry — every
price below is something the next seat can avoid paying.

## The one thing that mattered most

**A mutant caught my repair being green and pinning nothing, and nothing else would have.**

I added the EVALUATOR discriminator to `ceremony.test.ts`, the suite went from 1-failed to 2-passed
three times running, typecheck was clean, and by every rule in the packet I was done. Then I ran
the mutant that deliberately breaks the discriminator — and ceremony stayed at **2 passed**. The
classification I had just written was doing nothing: the call fell through to the `GENERAL`
fallback, which served the evaluator entry out of the head of the queue regardless.

That is this ticket's own subject happening to the ticket's own fix. F-SEALEDROWS-B exists because
a fake answering a question nobody asks makes a test green for an unrelated reason. My repair
would have shipped a test that was green for an unrelated reason — the queue position, not the
protocol match — and the next protocol move would have found it again, with my name on the
"already fixed" ticket.

**Price of catching it: about six minutes** (one mutant run, one two-line fix, one re-run, one
commit). **Price of not catching it: the whole ticket, re-opened later, plus the credibility of the
"closed" mark.** The refutation duty is not overhead on this mission; on this lane it was the only
thing between a real fix and a decorative one.

Generalised, because it is not about doubles: **when your change is a DISCRIMINATOR, the mutant
that matters breaks the discriminator, not the thing it selects.** I would have gone home on M2
(break the response shape — killed all three suites instantly, very satisfying) and never learned
that half my change was inert.

## Causes, not symptoms

**Cause 1 — the acceptance provider doubles are three hand-written re-implementations of one
protocol, and the protocol lives somewhere else.** Each double restated the runner's prompts as
string fragments (`"conforms,findings"`, `"{pass}"`, `"served_number_refs"`) and the runner's
response shapes as object literals. When T9 changed the protocol at `c1d8e09d`, nothing connected
the two, so three fixtures went quietly stale in three different ways. The repair that actually
closes the class is not "update the three copies" — that is what would drift again — it is deriving
the fixture from the shipped constants: the discriminator IS `EVALUATOR_CONTRACT_TEXT`, the
response goes through `evaluatorVerdictSchema.parse`. Both now fail loudly and by name on the next
protocol move.

**Cause 2 — a fixture law enforced in one direction is not enforced.** `ceremony.test.ts` carried
an explicit, well-written rule ("never GUESS ACROSS CLASSES") with a comment explaining the round it
had already cost. The rule was applied to RECOGNISED requests only. An unrecognised one still took
`pending[0]`. That asymmetry is the entire mechanism by which the evaluator call was answered out of
a retired-conformance queue — the law was written down and half-implemented, which reads exactly
like a law that is implemented.

**Cause 3 — the fixture's roster and its sealed roles were two independent statements of one fact.**
`mono-panel` relayed `acceptance:codex-cli` in one place and inherited a default that sealed
`acceptance:claude-cli` somewhere else entirely. Nothing made them agree. They are now one constant
that feeds both, so the defect is no longer expressible in that file. This is the same shape as
F-T17-T9 itself (a field one deployment supplies and another does not) and the same cure: make the
two statements one statement.

## What repeatedly cost tokens, with prices

| What | Price | Cure |
|---|---|---|
| **A terminal reason that names the last frame, not the cause.** `ANSWER_PERSIST_FAILED` is what ceremony and mono-panel report for anything that goes wrong three layers earlier. It told me nothing about the evaluator. | ~4 min to instrument the double, run, read, revert | `panel-multi-maker` already solves this: its double records unclassified bodies and its failure message prints them. That RED named its own cause in one line and cost me nothing. Give the other two doubles the same recorder. |
| **Reading code to answer a question a run could answer.** I spent several minutes tracing whether `EvaluatorRequest` could contain `restatement_text` or `served_number_refs` to predict ceremony's classifier. One instrumented run answered it exactly, including a fact I had NOT predicted — that the retired entries were never consumed at all. | ~6 min of reading, superseded | Instrument first when the question is "what does this actually receive". The DIAG record is now filed and the next seat does not need to re-derive it. |
| **Mutant transcripts taken before the last fix.** Eight of mine stamped the first commit; the mutant-driven fix moved the tip and `stamp-check.sh` correctly called all eight STALE. | ~3 min to re-run the campaign | Run the campaign LAST, after the final commit — or accept that a surviving mutant means the campaign restarts. D41's rule applies to mutant transcripts, not only gate records. |
| **`pnpm lint` short-circuiting.** Its architecture half is red at integration, so the source half never runs and its result is invisible. | ~2 min | Already in TOOLING-TRAPS from lane W3 r2. I read the file before starting, which is why I ran `audit:source` separately without losing time to it. **The trap file paid for itself on this lane.** |

## What I nearly got wrong

1. **I nearly shipped the inert discriminator.** Covered above. The gap between "three green runs"
   and "actually pinned" was invisible from inside the green.
2. **I nearly reported ceremony's root cause from a code read.** My inference was correct in
   outline and incomplete in substance: I predicted the FIFO would serve a retired conformance
   entry; the run showed the queue was already EMPTY on the critic provider and the retired entries
   sat unconsumed on the primary. Had I written the code-read version, the report would have
   contained a plausible, confident, wrong sentence.
3. **I nearly rewrote `mono-panel`'s double as a classifier.** It is the outlier of the three and
   the change is obvious. It is also a fixture redesign nobody asked for, and worker contract §4
   says don't. I named it as F-DEMOPATH-A instead. I still think that was right, but I want it on
   the record that the honest reason to leave it is the contract, not that the double is fine — it
   is not fine, and M3 surviving there says so in public.
4. **I nearly claimed the two audit failures were "obviously not mine"** on the strength of the diff
   touching no product file. That is a sound argument and it is still an argument. Running both
   audits at the base commit and diffing the output blocks byte-for-byte took four minutes and
   converts it into a record.

## Dead ends — do not re-derive these

- **Do not configure a second maker relay to satisfy `mono-panel`'s default evaluator ref.** It
  makes the run multi-lineage and destroys the `SINGLE-LINEAGE` / `CRITIQUE-UNAVAILABLE` /
  `CAPPED` assertions that are the file's entire subject. The env override is the designed hook and
  `tests/integration/t16-algorithm-register.test.ts:528-539` already uses the identical
  save/set/restore pattern with the identical value.
- **`seedAcceptanceRegister(pool)` takes no role-refs argument.** It calls
  `resolveAcceptanceSynthesisRoleRefs()` with no arguments, which reads `process.env`. There is no
  cleaner injection point without editing `seed-register.ts`, which was not granted — and the
  environment hook exists precisely so it does not need to be.
- **The evaluator call does NOT go to the synthesizer's provider.** In any fixture with two
  configured families it lands on the SECOND family's provider — the critic double in `ceremony`,
  the second double in `panel-multi-maker`. I scripted ceremony's evaluator answer on the right
  provider first time only because the DIAG run told me; the natural guess (put it with the
  composer's responses) is wrong and would have failed with the same opaque `ANSWER_PERSIST_FAILED`.
- **`tools/mutate.sh` cannot touch an untracked file** — dirty-tree gate first, `git checkout --`
  restore second. Commit before mutating.
- **`stamp-check.sh` takes a PREFIX.** A quoted glob matches nothing and the tool refuses loudly
  (correctly — an empty result is not a pass), but the refusal reads like a broken record set rather
  than a wrong argument. Two invocations lost. The unquoted-glob variant is already in
  TOOLING-TRAPS; the quoted one fails differently and just as confusingly.

## Where the packet was unclear, exactly

The packet was the best I have worked from in this mission. Three specifics, in descending order of
cost:

1. **`.hermes/TOOLING-TRAPS.md` is granted by RELATIVE path and two copies exist** — 1386 lines live
   in the main checkout, 211 lines at base in the lane worktree. D61 fixed the GRANT and not the
   PATH, and lane/t17t9 reported the identical ambiguity one dispatch earlier. I resolved it the
   same way (the shared file) and disclosed it, which means two consecutive lanes have now spent
   thought on the same sentence. **Fix: the packet states the absolute path, the way D41(b) already
   requires for mission evidence.** Cost here: about two minutes and a paragraph of disclosure.
2. **"180-second per-test timeouts" is not what the repo says** — both vitest configs say
   `testTimeout: 120_000`. Harmless (these suites finish in ~20s) but it is a constant in a packet
   that is a defect under worker contract §1, and I am obliged to say so rather than absorb it.
3. **The ticket said the mono-panel double "needs extending".** It needed shortening — six responses
   to four. That is a mechanism hint in a packet that otherwise scrupulously states outcomes (D58),
   and it pointed the wrong way. I ignored it and measured instead, so it cost nothing, but a seat
   that trusted it would have added entries and then wondered why the fourth call never arrived.

**The thing the packet did that I want repeated in every packet:** it named the RED it expected, by
error code, per suite, and told me to capture it before touching anything. All three REDs matched
its description exactly. That single paragraph is why this lane spent no time deciding whether the
defect was real.

## Toward the one-prompt machine

Three changes, each mechanical, each drawn from something that actually happened here.

**1. Make the fixture derive from the contract, and make that a rule rather than a habit.** Every
test double in this repo that restates a shipped prompt or shipped schema as a literal is a future
F-SEALEDROWS-B. The pattern that closes it is three lines — import the constant, match on it,
validate the response with the shipped parser — and it converts a silent drift into a named failure
at import time. A standing check could find the candidates mechanically: any test file containing a
string literal that is also a substring of an exported prompt constant is either derived from it or
drifting from it. That check would have fired the day `c1d8e09d` landed.

**2. Require the discriminator mutant, not just the behaviour mutant.** The mission's refutation
duty says "build the mutant that assertion exists to catch". For any change that ROUTES — a
classifier, a discriminator, a dispatch table, a guard's predicate — that instruction is
ambiguous, and the natural reading (break the thing being routed) is the one that misses. Amending
§2 to say **"if your change decides WHICH branch runs, mutate the decision as well as the branch"**
would have made my ceremony hole a required check rather than a lucky one. I estimate this is
cheap to comply with and catches a class the current wording lets through.

**3. Every provider double records what it could not answer, and every fixture failure prints it.**
`panel-multi-maker`'s RED named its own cause in one line, verbatim, at zero cost to me.
`ceremony`'s and `mono-panel`'s cost an instrumentation round each. The difference is about eight
lines of fixture code. Across a mission where the acceptance doubles are on the demonstration
path and three lanes have now debugged them, that is the highest-leverage eight lines available.

**And one habit, which is the same one the sealedrows seat ended on and I now have my own reason
for:** the sealedrows seat declined to write these fakes because it could not exercise them, and
called that the harder call. It was the right call, and this round is the proof — an unexercised
fake would have been written, looked correct, and been wrong in a way only a run reveals. Two
lanes reached the same conclusion from opposite sides: **do not ship a fixture you have not
watched fail.**
