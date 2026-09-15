# t17t9 — self-report (WORKER seat, round 1)

Measured tree: `d08ee9283244dcfb76d68820360810c7749940d6`, worktree
`.worktrees/lane-t17t9/dialectical-engine`, branch `lane/t17t9`. Every number below comes from a
gate record under `logs/t17t9/`; nothing here is recalled.

## 1. The cause, stated as a cause and not as a symptom

The symptom was "the acceptance entry point forgot a line". That is not the cause.

The cause is that **`WalkingSkeletonSettings` lets a field be a RUNTIME obligation and an OPTIONAL
type at the same time.** The runner refuses a work item over five settings fields
(`panelPolicy`, `scoringOperator`, `stoppingPolicy`, `verdictLabelPolicy`, `synthesisRolePolicy`).
All five are declared with `?`. So "this deployment cannot run without it" is enforced at claim
time, in production, and nowhere at build time. Every deployment path is therefore a place the
obligation can be dropped, and dropping it is invisible until a live run refuses.

The second half of the cause is why no test caught it. `tests/architecture/t09-synthesis-entrypoint.test.ts`
exists **specifically** to prevent this, was written after board F33, and its own header says the
right thing: *"no unit test that builds its own settings object can see this defect, because
supplying the setting is precisely what such a test does."* It then checks `apps/runner/src/main.ts`
BY NAME and never mentions `acceptance/main.ts`. A guard written against the named lead rather
than the risk class — the exact habit router §2.2 names. The guard for F33 existed, passed, and
was blind to F33's twin.

## 2. Prices

| Item | Price |
|---|---|
| The defect in the tree | 6 tests across 4 suites red; the acceptance harness could not complete ANY run reaching a served answer — the demonstration run itself |
| My RED capture | 4 gate-runs, ~80 s wall clock. Cheap and worth every second: it is what let me say later, with evidence, which failures moved and which did not |
| Dead end: mutating a seeded register row | 1 gate-run (~25 s) + one rebuild of the test. See §4 |
| The class experiment (make the field required) | 1 typecheck gate-run (~60 s). Returned the complete blast radius in one shot — 4 errors, 3 files. The cheapest thing I did all round |
| Discovering the T17 arithmetic is stale | 1 gate-run. Would have been invisible for another round if I had stopped at "the claim gate now passes" |

## 3. What I nearly got wrong — three, and the third is the serious one

**(a) I nearly reported "the six tests turn green".** After the fix, the claim-time gate passed and
`T17B` went green. The pull to write "instance closed" was strong, and the packet's own text
("the six tests turn green for the right reason") invited it. Running them said otherwise: five of
six still fail, for reasons downstream of my change and outside my contract. Had I asserted the
packet's expected outcome instead of measuring it, the orchestrator would have merged a lane whose
headline claim was false, and found out at the demonstration run.

**(b) I nearly recorded a false trap.** Two `sed -n "${n},+30p"` calls failed with
`sed: 1: ",+30p": invalid command code ,`. I was one keystroke from writing "BSD sed does not
support the `addr,+N` form" into the shared traps file. I tested it first: BSD sed supports it
fine; both failures were an empty `$n` from a grep that found nothing. A false trap in a shared
file is worse than no trap — it teaches every later seat to avoid a working construct.

**(c) The serious one: I nearly edited T17's expected numbers.** With the family supplied, the T17
maximum-path test reaches its assertions and fails on the serve leg:

```
- expected: COMPOSER:1=3, COMPOSER:2=3, CONFORMANCE:1:0=3, CONFORMANCE:1:1=3,
            CONFORMANCE:2:0=3, CONFORMANCE:2:1=3, POST_COMPOSE_R9:2=3   (7 sites)
+ observed: COMPOSER:SYNTHESIZER:INITIAL:1=3, POST_COMPOSE_R9:EVALUATOR:1=3  (2 sites)
```

The file is in my contract. Changing `expect(observed).toBe(109)` to `toBe(94)` would have made the
suite green in about thirty seconds. It would also have destroyed the test's actual subject. That
test asserts two different things: that the ceiling COVERS the observed attempts, and that the
ceiling is **TIGHT** — `expect(ceiling).toBe(109)` next to `expect(observed).toBe(109)`. T9 retired
the composer and conformance organs and replaced them with a two-call synthesis loop, so observed
drops to ~94 while the formula still returns 109. Tightness is now FALSE, and the sealed
`envelopeFormulaInputs` row describes a serve chain that no longer exists. That is a register value
question and V's to rule, not a number for me to update. **Editing it would have converted a live
cost-ceiling divergence into a green suite** — the precise failure the mission's evidence laws
exist to stop. I left it red and filed it.

## 4. Dead ends, so nobody re-derives them

1. **Do not simulate a bad register row by `UPDATE`.** `register.register_row` is append-only;
   `core.reject_mutation()` raises `append-only or immutable table register_row rejects UPDATE`.
   Worse, my `UPDATE` was in a `try` and its restore in the `finally`, so vitest reported the
   RESTORE line and the test looked like broken teardown.
2. **Nor by pre-inserting the bad row before seeding.** `seedAcceptanceRegister` re-reads every row
   it wrote and throws `ACCEPTANCE_REGISTER_CONFLICT:<rowKey>`.
3. What works: a second embedded database, rows INSERTed directly with one `sourceRef` swapped,
   never calling the deployment's seeder — the seeder's absence is exactly what the scenario models.

Both (1) and (2) are the system working correctly. Between them, the only way this deployment can
meet a foreign row is a register written by something other than its own seeder. Recorded in
`TOOLING-TRAPS.md`.

## 5. Where the packet was unclear or wrong — exactly

**(a) The packet's expected outcome is not reachable inside the packet's contract.** Outcome 2 says
the six tests turn green. Measured: only `T17B` does. `mono-panel` needs its sealed role refs to
name its ONE configured relay; `panel-multi-maker` and `ceremony` need their provider doubles to
answer the EVALUATOR call. All three files are `forbidden` for me. This is D61's shape a second
time: a duty stated in the packet that the contract cannot reach. D61 fixed the case where the
missing file is the one the seat must WRITE; this is the case where the missing files are the ones
the seat's fix BREAKS FORWARD. **Suggested addition to D61: a packet that names expected test
outcomes must grant every file those tests live in, or state which failures the seat is expected to
hand back.**

**(b) The citations were accurate** — `index.ts:1219`, `dev-runner-policy.ts:276-282`,
`main.ts:138`, `acceptance/main.ts:457`, `seed-register.ts:88-98`, `index.ts:2216` all resolved as
written. The re-derivation against the post-sealedrows tree was done properly and it saved me time.
Worth saying, because packet-defect notes only ever record the misses.

**(c) A counting discrepancy, minor.** The packet body says "the fourth instance in this mission of
one shape"; the dispatch message says the fifth. I verified the class HAS five members (five gated
fields) and that exactly ONE was unsupplied at this tree; I did not verify how many past instances
were paid for, so I use neither number as a fact.

**(d) The worktree's protocol copy is older than the main checkout's.**
`.claude/skills/heartbeat-protocol/SKILL.md` at `d08ee928` lacks §2.2's "fix the CLASS, not the
instance" and §3b's `SKILLS LOADED` gate; the main checkout has both. I obeyed the newer superset.
A seat that resolves the engine root by walking up from its worktree — which is what the loader
tells you to do — gets the older law without being told. **The loader should compare the two and
say so, rather than leaving it to the seat to notice.**

## 6. What to upgrade — the one-prompt-machine answer

1. **Make the runtime obligation a type obligation.** Measured cost of making
   `synthesisRolePolicy` required: 4 errors, 3 files, and ZERO errors in `index.ts` itself — the
   internal `=== undefined` guards compile unchanged against a required field (verified against a
   standalone probe before touching the repo). This is a half-hour of fixture work that ends the
   class permanently. Every hour after this that the class costs is a choice.
2. **Derive guards from the runner, never from a name.** `tests/unit/deployment-register-family-wiring.test.ts`
   (this lane) parses the runner's own refusal gates and checks BOTH entry points against the set it
   derives. A family added tomorrow is covered the moment its gate lands. It costs 5 s per run.
   Generalise the pattern: any check written against ONE named site is an instance guard wearing a
   class guard's clothes.
3. **A derived check that derives nothing must fail.** My guard asserts its derived set has ≥5
   members before checking anything. Without that, a changed gate shape silently turns the whole
   test into a no-op that reports green — D41's "an empty result is not a pass", applied to
   derivations rather than to globs.
4. **When a test cannot reach its assertions, its assertions are UNVERIFIED, not passing.** The T17
   serve-leg expectations went stale the day T9 landed and nobody could see it, because the run died
   at a gate 100 lines earlier. Whenever a fix makes a long-dead test executable again, expect a
   second, older failure behind it, and budget for it. This is D62's lesson one layer up: a failure
   with a known cause can be hiding a second cause that the known one masks.
5. **Capture RED per suite before touching anything.** Four gate-runs, ~80 s. It is what made
   "which failures moved" a measurement instead of an argument.

---

# t17t9 — self-report addendum (REWORK ROUND 1, codex r1: 1 BLOCKING / 3 FOLLOW-UP)

## 7. The blocking finding was right, and it is the most instructive thing in this lane

I taught the T17 provider double to answer the EVALUATOR call and returned `satisfied: true`
unconditionally. `runSynthesisLoop` breaks the moment a verdict is satisfied, so the loop exited in
round 1 — and I then read the resulting ledger as **the maximum path**. It was a one-round path. I
reported 94 observed against a 109 ceiling and called the ceiling 16% loose. The real maximum is
**106** (88 pre-serve + 6 role sites × 3 attempts), so the ceiling is about **3% conservative**.

**The cause is not carelessness about the double. It is that I measured an artifact and did not
check that the artifact was the thing I named.** §3 of my contract says measure before you
speculate, and I did measure — the ledger, honestly, with a gate record. What I skipped is the step
after: asking whether the run I measured is the run the test claims to be about. A measurement of
the wrong scenario is not weaker evidence than prose; it is more dangerous, because it arrives with
a gate record attached and everybody downstream treats it as settled. My own r1 report even printed
`COMPOSER:SYNTHESIZER:INITIAL:1` and `POST_COMPOSE_R9:EVALUATOR:1` — round 1 twice, no round 2 or 3,
in a test whose name is "maximum path". The evidence that the number was wrong was inside the
number I published.

**Price:** the wrong figure propagated. The orchestrator carried 94 into the V register and into a
status to V; both needed correcting on the record. That is the expensive kind of error — not one
that fails a gate, but one that passes every gate and travels.

**What I changed so it cannot recur silently:** the double now derives its verdict from the round in
the packet the runner actually sent, and throws `T17_EVALUATOR_ROUND_UNREADABLE` rather than
defaulting; the fixture's `evaluatorLoopMaxRounds` and the double's acceptance round are ONE
constant; and the test now ASSERTS six role sites and 106 observed attempts before it reaches the
stale serve-topology expectation. A future one-round regression fails an assertion instead of
producing a plausible smaller number.

**The general rule I would put in the spine:** *a fixture that drives a bounded loop must assert it
reached the bound, in the same test that reads any cost off it.* Coverage numbers taken from a loop
that exited early are indistinguishable from correct ones by inspection.

## 8. What I nearly got wrong in this round

**I nearly accepted the review's arithmetic without deriving it.** Codex said 106. I could have
written 106 down — it came from a reviewer who had been right about the blocking finding. Instead I
read `runSynthesisLoop`, confirmed the break condition and the INITIAL/RETRY staging, found
`PRE_SERVE_ATTEMPTS = 88` in the fixture, derived 88 + 6×3 = 106 myself, and only then ran the test
and got 106 off the ledger. Agreeing with a correct reviewer for the wrong reason still leaves the
number unverified — and it was my unverified number that caused this round.

## 9. Dead end retired, and one ambiguity I resolved by hand

The r1 provenance check threw `ACCEPTANCE_SYNTHESIS_ROLE_PROVENANCE_INVALID` — a per-family error
name for a check that was about to become deployment-wide. Renaming it to
`ACCEPTANCE_ALGORITHM_PROVENANCE_INVALID:<family>:<rows>` while extending it to all five families
cost nothing here, but it is worth noting that the ONE-family name was itself a symptom of fixing
the instance: I named the error after the ticket rather than after the invariant.

**Ambiguity, disclosed rather than absorbed:** my contract lists
`dialectical-engine/.hermes/TOOLING-TRAPS.md` as a relative path, and there are two copies — the
lane worktree's (at base, 211 lines) and the main checkout's (the live shared file other lanes have
been appending to, 1294 lines when I read it). I appended to the **main checkout's**, because that
is where the other seats' entries live and D61's point is that seats write their own traps into the
shared file. The consequence, which the orchestrator needs to know rather than discover: **my two
traps are NOT in the lane branch and will not arrive with this merge.**

## 10. Additional upgrade, from this round specifically

6. **Close a class with the type system when the type system can express it.** My r1 reasoning for
   shipping a text guard instead of the compile error was sound as far as it went — the four repair
   sites were outside my contract and I will not hand back a non-compiling tree. But I framed the
   derived guard as the closure and it is not one; codex was right to say so. Measured this round:
   with the contract widened, the type change plus its four repairs took one edit pass, typechecked
   clean first time, and changed **no** behaviour in any of the three repaired fixtures (8/8, 1
   passed + 1 pre-existing failure, and the runtime-refusal test still green through a deliberate
   cast). **The whole closure cost less than the round spent arguing about the guard.** When a
   packet's contract blocks a class closure, the right move is to measure the exact price and ask
   for the widening in the same handoff — not to ship the strongest thing the contract allows and
   describe it as sufficient.
7. **Four of the five gated fields are still optional.** `panelPolicy`, `scoringOperator`,
   `stoppingPolicy` and `verdictLabelPolicy` all remain `?` while the runner refuses over them.
   `verdictLabelPolicy` is the sharpest of these: like `synthesisRolePolicy` it gates
   unconditionally, at every maker count. The same one-character change plus its repairs closes each.
   Until then the derived guard is what stands in for them, and it matches source text.
