# S09 SELF-REPORT — T17 cost envelope for the live topology, seat opus-s09-w9

Micro-ticket S09B (judge-authorized; rework rounds exhausted at r3) · lane `lane/s09` · base
`e040b1ee` · filed tip `265581b2` · tree `adbf8382`.

---

## Three rounds, three versions of the same mistake

r1: I read `withCooldownRetry`, saw two `attempt()` calls, and costed the site at
`2*judge + final`. r2: the ledger measured 4, and I retracted it. r3: the review found I had done
the identical thing one line below — `maxRecompose * ENGINE_FIXED_ORGANS_PER_COMPOSITION`, a
constant multiplied by rounds that nobody had counted. The chain runs composer and conformance
inside the recompose loop and post-compose R9 **once after it**; multiplying bills an R9 per
round. Measured: seven serve sites, not eight.

So the lane's actual finding is not "v2 undercounted". **v2 was wrong in both directions**: it
counted the panel leg at zero (+24 at M=2/d=1) and over-billed the serve leg by one per-run
organ (−3). Its per-site attempt terms were right all along. M=2/depth=1: 88 → 109, and the
maximum-path run spends exactly 109.

## What I actually did wrong, twice

Both errors have one shape: **I costed a call site by reading the code that calls it, and stopped
before the code that bounds it.** For the cooldown term I never followed the `attempt` callback
into the gateway that implements it. For the serve term I never followed
`fixedOrgansPerComposition` into the loop it was multiplied by. Both times my "independent"
enumerator copied the same expression, so it agreed; both times the mutation campaign was a clean
sheet, because mutants test whether assertions pin the code, not whether the code matches the
world.

r2 taught me the lesson and I wrote it up as F-S09-7 — and then shipped a fixture that gave
COMPOSE, CONFORMANCE and R9 a **failure budget of zero** while its own header said "every site".
I had the right principle in the report and a counterexample to it in the same commit. That is
the part I would most want to have caught myself: after writing "measure the thing", I did not
go back and ask which namespaces my measurement could not reach.

The mechanical guard I would keep: before calling a run maximal, enumerate the namespaces it can
reach and show each one's failure budget. It is one table, and it would have caught this in r2.

## What r3 changed

- The composition term is decomposed as `maxRecompose*(1 + compositionSegmentCap) + 1`, with a
  loud `STRUCTURAL_CEILING_COMPOSITION_SHAPE_INCOHERENT` stop if the sealed row disagrees, and
  the receipt discloses both halves so the split is auditable.
- The ledger test drives every reachable namespace to its last allowed attempt and forces both
  composition rounds by returning a valid-but-false conformance verdict in round 1. It asserts
  each serve call-site count by key. `POST_COMPOSE_R9:2` — keyed by the last round — is itself
  the evidence that R9 follows the loop.
- The unit enumerator now walks the chain's sites instead of copying the formula's arithmetic.
- M7 and M8 guard the two halves of the serve correction, as M2b guards the retracted cooldown
  expression.
- N1: the test header stated the retracted `2*judge + final` and called it a second undercount —
  the opposite of the gateway, the formula, D35 and M2b. Swept.

## The one thing I did not decide

F-S09-8. The ceiling is now exactly the measured maximum, and the envelope is exclusive on both
sides, so a maximum-path run is allowed every attempt, completes, and then stands EXHAUSTED at
the terminal. A ceiling equal to the measured maximum cannot also leave a maximum-path run
WITHIN. Three options exist and each changes a ruled quantity or a shipped comparison, so I
measured it, asserted the measured EXHAUSTED rather than asserting it away, and handed the
choice up rather than quietly adding headroom.

## Suites

Cluster ×3 at the filed tip: `2 failed | 91 passed (93)`, worst = best, both failures in the b8
authority's stable-red set with an identical base↔HEAD signature. Root typecheck exit 0.
Campaign re-run at the r3 tip: 9 CAUGHT, neighbour NOT CAUGHT, exit 0, final tree = filed tree.
Stale-stamp check re-run in D27 ADDENDUM-2's corrected form against the lane's own tip.

## S09B — the finding I filed and declined to decide had teeth I had not looked for

r3 measured that a maximum-path run reports EXHAUSTED at exactly the ceiling, filed it as
F-S09-8, listed three options and handed the choice up. That was right as far as it went. What I
did not do was follow the consequence one call further: the runner does not merely RECORD that
state — `apps/runner/src/index.ts:3267-3274` replaces the served answer with the envelope
terminal. So the behaviour I described as "reports that it ran out" was actually "loses the
answer it just served". I had the line in front of me in r1 when I first read the serve chain.

That is the third instance of one habit: I read the site and stop before the code that acts on
it. Cooldown term — read the retry helper, not the gateway that bounds it. Serve term — read the
constant, not the loop it is multiplied by. F-S09-8 — read the reporter, not the caller that
destroys an answer on its verdict. Each time the correction came from someone else asking for a
measurement I had not taken.

J28 settles it: reporting follows permission, WITHIN at `consumed <= max`. Applied; both sides of
the boundary pinned; M9 keeps the old comparison rejected; the integration test asserts the
answer row survives with the chain's own DOWNGRADED terminal. V-S09-8 remains V's.

The receipt-coherence item is smaller but has the same signature as r1's B3: I added two new
disclosure members in r3 and did not extend the matrix that exists to protect exactly those. The
new refinement caught both of my own shared fixtures the moment it was written — they declared
`call_sites.serve: 8` against a `composition_sites: 7` arm. My fixtures were the contradictory
form the check exists to reject.

## And one I caught myself, which is the point

I ran the unit zone and the mutation campaign at the same time in the same worktree. The
campaign edits source in place, so the zone read mutated files and reported six new failures.
For a moment they looked like a real regression from the J28 change — five of them were in my
own new tests. What settled it was the token: the zone log contained
`STRUCTURAL_CEILING_REVIEWERCALLSPERNODE_INVALID_MUT4`, and `_MUT4` is a string that exists
nowhere except mutant M4's replacement text. That is the whole value of D24's rule that a
mutant's token be printed verbatim — it makes contamination self-identifying.

I kept the contaminated log as `.CONTAMINATED.superseded` rather than deleting it, and re-ran
the zone solo against a tree I verified clean first. Filed as F-S09-9 with the fleet consequence:
D24 ADDENDUM-2 stops a campaign starting on a dirty tree but does not stop a campaign from
dirtying the tree beneath a concurrent reader.

## Process

I stated three times in this session that a background run had finished before I had read it.
No unverified number reached the report — I marked the affected rows PENDING until the log was
readable — but it is the same class as calling a partial read "measured", and it is the habit I
am least comfortable with in my own transcript.

---

# T17B SELF-REPORT — seat opus-s09-w9b, the refused-attempt boundary and the receipt invariant

V-authorized post-cap correction (V-S09-CODEX-S09B-1 + S09B-2, 2026-09-03) · lane `lane/s09` ·
merged base `19bbb4c4` · filed tip `55354f4f` · tree `a36d473a` · rework round 0/3 · one session.

Treat it as a murder case. Below are the causes, the prices, and the things I nearly got wrong.

## The one that was mine and was a contract violation

**I edited the main checkout instead of the lane worktree.** Applying the
`evaluateRunPressure` passthrough, I called Edit on
`…/V5/dialectical-engine/packages/budget/src/index.ts` — the repository root — instead of
`…/V5/.worktrees/lane-s09/dialectical-engine/packages/budget/src/index.ts`. The main checkout is
not in my `allowed` list. I caught it on the next command, reverted with `git checkout --`, and
verified the main checkout's porcelain matched its session-start snapshot exactly (three
entries, unchanged). No damage; the file there was an older pre-S09 version, which is itself how
I noticed.

CAUSE, and it is not carelessness in the usual sense: **the two paths differ by one interior
segment.** Every read I had done used the worktree path, and the edit tool call is where the
prefix has to be retyped. A lane worktree nested under the repo it shadows makes the wrong path
a plausible-looking string rather than an obviously wrong one.

CHEAPEST FIX AVAILABLE: a `PreToolUse` hook that refuses Edit/Write on a path under the
repository root when the session's ticket names a worktree. The harness cannot currently fail on
this — nothing does — and it is the same silent shape as D53's stale citation. **Price this
time: ~2 minutes. Price if a gate had run in between: an entire measurement invalidated, and
possibly attributed to the wrong tree.** I am recording it because it nearly cost nothing and
could easily cost a round.

## What I nearly got wrong, and caught

**1. I nearly shipped "two independent checks" where one could not be killed.** The review asked
for `serve === max(arms)` AND `selected === tie policy`. I worked out the algebra before writing
the tests: with the landed count check live, the three guards **overlap — any two imply the
third**, so no input makes exactly one fire. A test asserting only "it threw" would be satisfied
by either new guard alone, and a mutant deleting one would stay green. **That is precisely the
defect I was sent to fix, one level up:** my own packet listed one check, the seat built one, and
a receipt still parsed. I would have reproduced it in the test layer.

The fix was to make each guard's firing OBSERVABLE — the refusal now names which check refused —
and then assert the message. M4 proves it: disabling the larger-arm guard fails **only** the
smaller-arm test, and it can only do that because the assertion names that guard's message.

**2. I nearly reported eight pre-existing failures when there are seven.** The first full-zone
gate reported 8; both JSON zone runs reported 7. The extra was
`registration.test.ts > S3c B4 … isolated production RSS curve`, an RSS measurement in a spawned
child — load-sensitive, 58/58 on three isolated runs, importing nothing I touched. Had I quoted
the first number as the floor, the set-equality comparison would have looked wrong later and
someone would have spent a round on it.

**3. I printed `EXIT=0` for a check that had just failed.** `cite-check.py … | tail -25` gives
**tail's** exit status, not the checker's. The output on screen said
`1 anchor(s) do NOT uniquely identify a site` while my own echo said `EXIT=0`. I re-ran without
the pipe to get the true code. This is D56 wearing my clothes: **the mechanism could not report
"no" through the pipeline I had wrapped it in.** Any seat citing an exit code from a piped
command is citing the pipe.

## What the tools caught that I did not

`cite-check.py` found a real defect of mine: I added `pendingModelAttempts?: number;` to **two**
interfaces, so my anchor matched two sites and identified nothing — the exact D55 disease. The
tool paid for itself on first use, in the same lane that ruled it.

Mutant **M6** was the one I expected to be redundant (D37, again confirmed). Disabling the
*landed* count check left all 38 tests green: my new guard had made a landed guard both redundant
and unkillable. **Adding a check silently removed another check's pin.** I would not have found
that by reading; only by mutating the code I did not write.

## Dead ends, so nobody re-derives them

- **Do not look for an input that isolates the larger-arm check.** It does not exist while the
  landed count check is live: if the tie policy holds, the selected arm IS the larger arm, so the
  count check forces `serve` to it. I proved this algebraically before writing a test, which is
  the only reason it cost minutes instead of a round of failed mutants.
- **Do not try to reach the refusal boundary by shrinking the run.** The boundary needs
  `consumed == max` *with a serve call still pending*. The clean handle is the receipt: pin
  `max_model_attempts = 88`, the pre-serve consumption, which is also the DR-184-v2 undercount
  this file already proves the topology breaches. The scenario is the reviewer's own — a receipt
  that undercounts a leg — rather than an invented one.
- **`git merge-tree --write-tree --name-only` prints only the tree hash when there is no
  conflict.** It is not silence-on-error; it means clean. Confirm by comparing that hash to the
  real merge's tree, which is what I did (`ad6f5423`, identical).

## What cost the most, measured

**The integration test is ~90–120 s per run and I ran it fourteen times** (post-merge baseline,
repair, RED, GREEN, three mutants, two cluster sets of three, plus re-runs). That is the single
largest wall-clock item in this seat by a wide margin — roughly 25 minutes of the session inside
one file's `beforeAll` spinning up embedded Postgres.

THE UPGRADE: this suite pays the full database + run cost to reach a decision that happens in
**one branch**. The refusal path could be reached far more cheaply by a runner-level test with a
stubbed budget repository — but the finding explicitly required the **persisted** outcome through
the runner wrapper, and it was right to: the defect was that no record was written. **The lesson
is not "use a cheaper test"; it is that this repo has no middle rung** between an in-memory unit
test and a full embedded-Postgres debate. A harness that boots the DB once per FILE and exposes a
`runToServeGate(basis)` helper would have turned fourteen 100-second runs into fourteen 5-second
ones. That is the highest-value tooling investment I can name from this seat.

## Where the packet was unclear — nowhere, and that is worth saying

Every constant verified: lane tip, integration tip, 39 commits behind, the seven merged lanes,
both findings' locations. The packet also told me the auto-merge was "the case to CHECK, not to
wave through" — **and that instruction is the only reason the T7 breakage was found before the
gates.** A clean merge with zero overlapping files still broke the lane's only integration test,
through a newly-required settings field on a shared runner. No tool in the harness fails on that
shape. If one sentence from this packet becomes standing law, it should be that one.

## For the one-prompt machine

1. **A guard that cannot say WHY it refused cannot be pinned.** Collapsing every schema failure
   into one message made two guards indistinguishable to tests and to mutants. Naming the failing
   check cost four lines and converted an unpinnable guard into a killable one. This generalises
   past this lane: *the granularity of your error surface is the ceiling on the granularity of
   your mutants.*
2. **Merging integration means running the merged lane's own suite, not resolving conflicts.**
   Textual conflict is the cheap failure; a required-settings coupling is the expensive one, and
   only execution finds it.
3. **Do the algebra on your guards before writing their tests.** Ten minutes of "can any input
   make exactly this one fire?" told me the assertion had to be on the message, not the throw. A
   test written before that analysis would have passed, looked complete, and pinned nothing.
4. **Never read an exit code through a pipe.** Add it to the traps file; it is one character of
   difference between a checker that refused and a checker that appeared to pass.
