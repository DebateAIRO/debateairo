# SELF-REPORT — lane/flakes (F-FLAKE-POL03 + F-FLAKE-T9-RESEND) · murder-case format

Seat: heartbeat-worker, Opus 5, one seat, two tickets, one lane.
Lane: `lane/flakes`, base `169941c6f1d9d2e50019550f78cb48d89288c49c`, tip `b1c9ee33e6c5d10359063ce9479ceea512537216`.

---

## The victim

Two tests that pass most of the time and fail on a busy machine, on a mission where
the full suite is the acceptance gate. Between them they had cost the fleet at least
four full-suite re-runs (dev `1d954e88`, dev `70647e7e`, the evaluator tip gate, and
2 of the evaluator seat's 5 runs), each of which is a ~2-hour measurement.

## Cause of death, POL-03

**The stack named the wrong file, and everybody read the stack.**

`packages/db/src/index.ts:611 → :621 → :649` is where the error was TYPED. Where it
ESCAPED is `tests/support/poolFailureChild.ts:47`, which held a rejecting promise
across the two `await`s that make it reject. The ticket, the packet and the finding
all pointed at "the pool lets a termination surface as an unhandled rejection" — a
product hypothesis — because the three frames in the crash are all product frames.
Node's unhandled-rejection report names the CREATOR of the rejected value, never the
holder of the promise, and the holder is the defect every time.

**Upgrade:** when a crash is an unhandled rejection, the first question is not "who
threw" but "who was holding this promise, and across what". That is now in
`.hermes/TOOLING-TRAPS.md`. A grep for `const \w+ = .*\.query\(` not immediately
awaited would have found this in seconds.

## Cause of death, T9

**A three-state classifier wired to a two-state assertion.** The evaluator has said
`T9_TEST_CONTRACT_INCONCLUSIVE` since it was written — a name that says, in words,
that the TEST CONTRACT and not the product came out undecided — and the assertion
under it was `expect(live.classification).toBe(GREEN)`, which turns all three states
into pass/fail. Nothing was broken. The disposition was never written down.

**Upgrade:** when a test computes a classification with more than two values, the
disposition of EVERY value belongs beside the classifier, in the same review. A union
type with three members and one `toBe` is a design smell that a reviewer can grep for:
`grep -n 'Classification =' | ...` then check the arm count against the assertion count.

---

## What repeatedly cost tokens and wall clock

| # | Cost | Cause | Fix |
|---|---|---|---|
| 1 | ~12 min wall, one 10-minute tool timeout, ZERO samples | Applied 16 CPU burners BEFORE `startTestDatabase()`. `initdb` is CPU-bound; the database never came up, so the probe measured nothing. Load average hit 180 on a 12-core box. | Start the database, THEN apply load, and keep load near 1x cores. Recorded as a trap. |
| 2 | ~25 min wall that a better probe would not have spent | First reproduction looped the whole integration FILE: 24 s per sample, of which ~21 s is database start and module import, for a 0.8 s child. | Loop the CHILD against one long-lived database. 30x the sample rate. 30/120 failures appeared inside four minutes. Recorded as a trap. |
| 3 | 2 wasted probes | `grep -rn "x" . --include=*.ts` — zsh expands the unquoted glob and grep never runs. | Quote it. Recorded as a trap. Note the existing traps file already had three zsh entries; this is a fourth face of the same class. |
| 4 | ~100 min of the ~150 min gate budget | `tests/integration/registration-database.test.ts` is a 33-minute file and the packet requires it x3. Two tests in it (S3d B1 at 430 s, T9 at 348 s) are 13 minutes of the 33 by themselves. | Not fixable in this lane. Named below as a fleet-level cost. |

## What I nearly got wrong

1. **I nearly fixed the product.** The packet's own outcome text lists "an idle client's
   'error' event" and "a continuation at :649 not awaited" as candidate causes, and
   `packages/db/src/index.ts:600-660` is in the contract. Rewriting `wrapClientQueries`
   to swallow the rejection would have made the test green, hidden a real caller bug,
   and changed the product's contract for every caller. What stopped it was writing out
   what the code does without the wrapper: the same call site leaks the same rejection
   with pg's raw error. The wrapper adds no escape.

2. **I nearly reported a mutant I could not build.** The correct POL-03 mutant —
   restore the escape — does NOT fail a single unloaded run of the test, because the
   escape is a race that needs load. Reporting "mutant applied, suite red" from one
   lucky run would have been a fabricated pin. The discriminator had to be the loaded
   60-run loop, and the record has to say so.

3. **I nearly widened the threshold.** The one-line "fix" for T9 is `familyPValue > 0.05`.
   The packet forbids it and it is the wrong answer anyway: it would destroy the
   PRODUCT_REPAIR verdict's power in exactly the runs where it matters.

## Dead ends — do not re-derive these

- **Load before database start.** See #1 above. Zero samples, ten minutes.
- **`pkill -f "while :; do"`** does not match bash subshell burners; their `ps` command
  line is the PARENT script's. Track the PIDs and kill by PID, or spawn them from the
  driver so it owns them.
- **`tests/unit/` for a T9 helper.** The contract grants `tests/unit/` only "if you touch
  the product". The cause was the harness, so no product was touched, so no unit test
  was admissible. The T9 cause-text pin had to live inside the T9 block itself — which
  turned out better anyway: placed among the deterministic controls it fails in 55 s
  instead of 350 s, because the controls run before the six live windows.

## Where the packet was unclear, exactly

1. **"the whole file; it is long — say its duration"** does not say what to do when the
   file has a failure that predates the lane. `S3d post-hash main-process secondary RSS
   tripwire stays flat and counts every refusal` fails in all three granted full-suite
   logs, at three different commits. I attributed it from those logs. A whole-file
   BASELINE at the untouched base would have made the attribution mechanical instead of
   inferential; only a typecheck baseline was supplied. **Ask:** when a packet requires a
   whole-file gate on a file with known pre-existing failures, supply that file's baseline
   too, not just typecheck.

2. **"Show the test green x3 in isolation and its behaviour x3 under load (loaded runs may
   legitimately produce the typed skip — show it)"** cannot be discharged by a seat that
   cannot make the skip happen on demand. All six live runs came out GREEN. I showed the
   skip path with a forced-INCONCLUSIVE mutation transcript instead. **Ask:** when the
   evidence you want is a branch that fires stochastically, say that a forced transcript
   is acceptable, or the seat either fabricates or loops until it gets lucky.

3. **"tests/unit/ (a new unit test for the pool failure path if you touch the product)"**
   reads as a grant with a condition attached. I treated the condition as binding and did
   not touch `tests/unit/`. If the intent was "tests/unit/ is yours", say so plainly.

## How to make this more of a one-prompt machine

1. **Give the seat the probe pattern, not just the instruction to reproduce.** "Reproduce
   under load" cost two wrong probe designs. "Start the fixture once, loop the smallest
   unit that contains the race, apply load after startup, report the rate" costs none.
   This belongs in `heartbeat-worker` beside the three-run cluster rule, because the
   three-run rule is what makes a 25%-rate flake look green.

2. **Rate, not verdict, for a flake ticket.** A flake ticket's outcome should be stated as
   a measured RATE before and after (0/40 unloaded, 30/120 loaded, 0/120 loaded after),
   not as "passes three times". Three runs of a 25% flake are green 42% of the time.
   `heartbeat-worker` section 3 says "worst run wins" — for flakes it should say "report
   the rate, and the denominator has to be large enough to see the rate you are claiming
   to have removed".

3. **A gate budget in the packet.** This lane's gates are ~2.5 hours of wall clock for
   ~90 lines of diff. Nothing was wrong with the requirement, but the packet should say
   the expected wall clock so the seat sequences the long runs first and does not
   discover at the end that it has 100 minutes left to spend.

4. **Split the 33-minute file.** `registration-database.test.ts` is 8,382 lines and 69
   tests; S3d-B1 and T9 alone are 13 minutes of its 33. Every lane that touches it pays
   the full 33 minutes x3. That is a fleet-level tax, not a lane problem, and it is the
   single largest lever on this mission's gate cost.

5. **Make "unhandled rejection" a named review lens.** Two of this codebase's own comments
   (`registration-database.test.ts:5966-5970`, about `Pool.connect`'s two call forms
   leaking one unhandled `TypeError` per call) describe the SAME class that killed POL-03.
   The class has bitten this repo at least twice. A one-line grep lens — promises assigned
   to a variable and not awaited in the same statement — would catch both.

## Findings I could not fix, named for tickets

- `tests/integration/registration-database.test.ts:6872` pushes 64 promises into `issued`
  with a 357 ms `await` between each and only awaits them at `:6886`, so the first sits
  ~22 s without a rejection handler. Same class as the POL-03 defect. It is currently
  unreachable because `injectResend` (`:5566-5598`) catches everything and always
  resolves — so the safety rests entirely on that total catch, undocumented. Out of this
  seat's contract (not the evaluator's output, the assertion text, or the INCONCLUSIVE
  disposition).

---

# ADDENDUM — REWORK ROUND 1 (2026-09-08)

## Cause of death, round 1

**I built a disposition on a sentence instead of on a predicate.**

I read `replicatedDirection` as "the directions flipped between replicates", wrote that into the
round-0 report as "a product-side timing leak has one direction", and then let a test row exit 0
whenever that predicate was false. The predicate is a CONJUNCTION — local significance AND sign
agreement in two of three replicates — and `Math.sign(auc - 0.5)` is 0 on a tie, a value no sign
can ever match. Both facts were inside the six lines I had already read and quoted in my own
report. A repeatable arm-dependent spread difference and a real single-replicate effect are both
false under that predicate and neither is noise; round 0 passed both.

**The rule, one sentence:** before a disposition is allowed to turn a failure into a pass,
enumerate every input that reaches it — not the one input that motivated it.

**Why the round-0 evidence did not catch it.** Everything I built pointed at the case I had:
the dev-gate run. The mutant I chose forced the label rather than the inputs, so it proved the
skip WIRING and not the skip POLICY. Codex named that exactly. A forced-label mutant can never
discriminate a policy; only constructed inputs that reach the branch on their own can.

## The near miss that mattered more than the finding

My first measurement-invalid condition was `max intra-slot overshoot > tolerance`. It is the
strictest available summary and it reads that way in review. Measured on the first quiet run:
`measurement_invalid=true`, one warm-up slot at 107.448 ms against five windows at 2.7–8.1 ms.
A condition true of nearly every run would have restored the blanket waiver under a name that
looks like its opposite — and it would have passed review, because the code says "strict".

**What saved it was running the instrument and reading its value on a run I expected to be
clean.** Not reasoning about it. The rate rule that replaced it was then confirmed by a live
run that recorded 1/192 breaches at 118.866 ms and correctly stayed valid.

**Upgrade, and it generalises past this lane:** a guard whose whole job is to be *rarely* true
must be measured on a normal run before it is written up. Its false-positive rate is the
property, not its strictness. That belongs beside the three-run cluster rule in
`heartbeat-worker`: for a guard, report the rate on quiet input, not one observation.

## What this round cost

| item | cost |
|---|---|
| round-1 edits + two iteration runs of the T9 row | ~15 min of edits, 2 × ~6.3 min of feedback |
| gates ×12 + mutants ×3 at the new tip | ~50 min wall clock |
| the whole round | one rework round of the three available; rounds 2 and 3 remain |

The feedback loop was cheap for one specific reason worth keeping: the deterministic controls sit
BEFORE the six live windows, so a wrong assertion fails in ~50 s instead of ~390 s. Both boundary
controls landed first try because their values were derived on paper before the run — AUC exactly
0.5 by symmetry, accuracy exactly 0.75 from three distinct values, p exactly 1/4096 — and the run
confirmed all of them. **Deriving the expected statistic before running the test is what made a
statistical control cheap; guessing and re-running would have cost 6.5 minutes per attempt.**

## Where the amendment was good, and where a packet could still help

Good: it named the file and line of both defects, it named what evidence would settle F1(d)
("a NATURALLY inconclusive evaluator result ... not a forced label"), and it forbade the lazy fix
in advance. That is the difference between a rework round that converges and one that argues.

Still missing, and it cost me the max-vs-rate detour: **nothing in the packet or the protocol says
that a newly introduced guard must be measured for how often it fires on normal input.** I found
it by accident. One line in `heartbeat-worker` would have made it a step instead of luck.

---

# ADDENDUM — REWORK ROUND 2 (2026-09-08)

## Cause of death, round 2

**I defended a waiver twice instead of asking whether the contract wanted one.**

Round 0: skip unconditionally. Round 1: skip when the issuer's own clock says the cadence was not
delivered. Codex killed the second one on a fact I should have found myself — `runWindow` builds
Fastify **in this process** and `injectResend` calls `api.inject` on the **same event loop** as
the issuer's `setTimeout`, so the product can produce the very stalls that would excuse it. I had
even written the independence argument in the test as a comment, which is exactly how a wrong
idea gets protected: it reads like documentation.

**The two specific errors:**
1. I reasoned about ORDER and called it INDEPENDENCE. "The timestamp is taken before the request"
   says nothing when the delay lands *between* one timestamp and the next.
2. I wrote "before any response is scored" while the promise mappers assign `score` inside the
   issuance loop. I did not re-read the loop I had just instrumented.

**The rule, one sentence:** an instrument is independent of X only if X cannot perturb it — name
the shared resource before claiming independence, and in an in-process test the shared resource is
always the event loop.

**The deeper one:** across two rounds I was solving "how do I stop this being a red" rather than
"what does an unresolved result mean". The orchestrator's answer — remove the waiver — was
available in round 0, costs nothing the ticket asked for (the receipt was always the real
improvement), and would have saved two rounds.

## What each round actually bought

| round | what changed | worth keeping? |
|---|---|---|
| 0 | the cause text; the harness fix (cleared first time) | the cause text, yes; the skip, no |
| 1 | endpoint identities; four constructed controls on naturally inconclusive inputs; unresolved-is-red | **all of it except the waiver** — the controls are what caught the waiver-rebuild mutant in round 2 |
| 2 | waiver deleted; diagnostics kept; a mutant that rebuilds the waiver and dies | the ending |

Round 1's controls are the reason round 2 was cheap: the boundary cases already existed, so
deleting the waiver was a small edit plus one changed expectation. **Controls built for a policy
you later abandon are not wasted — they are what makes abandoning it safe.**

## Cost

| item | cost |
|---|---|
| round-2 edits + 2 feedback runs (one caught a stale round-1 fragment in 116 s) | ~20 min |
| gates ×9 + mutants ×4 | ~52 min |
| three rounds total | ~6 h wall clock for a 90-line harness fix and a T9 disposition |

The 116-second failure is worth naming: the controls run before the six live windows, so a wrong
expectation costs two minutes instead of six and a half. That layout decision, made in round 1 for
unrelated reasons, paid for itself in every round after.

## For the one-prompt machine

1. **When a seat proposes converting a failure into a pass, the packet should demand the
   independence argument up front** — "name what could produce this condition other than the
   condition itself" — instead of letting two review rounds discover it. One line in the worker
   contract beside the refutation duty.
2. **In-process test instruments share an event loop with the product.** That is a standing fact
   about this codebase's integration tests, not a discovery about T9. It belongs in
   `.hermes/TOOLING-TRAPS.md` — but the traps file is append-only and I have already appended this
   round's traps; I am naming it here so the orchestrator can decide whether it is a trap entry or
   a contract line.
3. **A number cited in a report must be in the record set.** The 107.448 ms figure was real and I
   could reproduce the log on demand, but it lived in a scratchpad, so to a reviewer it did not
   exist. Cheap fix, and it cost a packet-audit finding: **file the probe, or do not cite it.**
4. **Three rounds on a disposition, one round on the actual bug.** POL-03 — a real race, root-caused
   with a measured 30/120 → 0/120 — cleared on the first review. The T9 work was never about a
   defect; it was about what a test should DO when it cannot decide. That question deserved a
   decision from the orchestrator or V at dispatch, not three worker attempts. **When a ticket's
   outcome is a policy choice rather than a defect, the packet should name the policy or route it
   to a decision seat before a worker starts.**
