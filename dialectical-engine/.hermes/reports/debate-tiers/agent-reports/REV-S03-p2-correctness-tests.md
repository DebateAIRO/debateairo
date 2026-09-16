# Self-report — seat `REV-S03-p2-correctness-tests` (mission `debate-tiers`, slice S03, REV pass 2)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: `REV-S03-p2-correctness-tests` · ticket `t_ab69627a` · review head `d35a9634` · verdict **REWORK**
(1 blocking, 8 non-blocking). Wall clock CLAIM→handoff ≈ **28 min**. Context consumed ≈ **225k tokens**.

---

## 1. The body: what the defect was, and why it survived two seats and a re-verification

The blocking finding (B1) is not a coding error. It is a **coverage hole with a false certificate on
top of it**.

- FIX-S03-p1-F2 edited `tests/unit/s7-authorization.test.ts` and `tests/unit/contract.test.ts`.
- Those two files are in `s03-product-files.txt` — the slice wrote them.
- **No S03 command of record runs either one.** Not C1–C4, not the §5 integrated 17-file list.
- The FIX seat had a private "route pins" command and ran it 3× (41/41) **at its lane commit**.
- The pass-2 re-verification at `d35a9634` ran six things; the route pins were not among them.
- The packet then stated, as fact, "the route pins … hold at d35a9634".
- They do not: 52 governed policy rows against 50 contract routes, RED.

**Cause, named:** a slice's verification list is assembled from the *cluster map*, which is built from
the files the PLAN allocated to clusters. A FIX node can lawfully edit files outside every cluster
column — and when it does, those files enter the slice's surface **without entering any command**.
The gate is derived from the plan, not from the diff. That is the murder weapon, and it is generic:
it will happen again on any slice whose FIX reaches outside the cluster columns.

**Aggravating factor:** the false certificate was inherited, not invented. The orchestrator measured
41/41 honestly — at `b678f336`, on the lane. The number was then carried across a merge boundary into
a sentence about a different head. Nobody lied; a measurement was **reused past its scope**.

**The second body:** because the length assertion at `s7-authorization.test.ts:151` throws first, the
route-drift detector at `:153` is never reached. I proved with a mutant that changing S03's own route
from `auth: "user"` to `auth: "operator"` produces a failure message **byte-identical** to the
unmutated one. So the head under review carries a *disarmed guard on the very route this slice added*,
and the disarming is invisible because the suite was already failing for an unrelated reason.

---

## 2. What I nearly got wrong (three near-misses, all mine)

**2.1 I nearly recorded four refutations that never ran.** My first mutant script set
`REPL="python3 $OUT/repl.py"` and then called `$REPL …`. **zsh does not word-split unquoted parameter
expansions** (bash does). The whole string became the command name, every substitution failed, and
every mutant "passed" — because the tree was never mutated. The log read like four clean refutations.
I caught it only because `heartbeat-reviewer` §2 says *distrust green*, and a mutant that changes
nothing and breaks nothing is the greenest thing there is. **Price: ~6 min, one wasted run.** Had I
not re-read the log line by line, this artifact would have claimed mutant coverage it did not have —
a fabrication finding against me.

**2.2 I nearly filed "the packet is not frozen" as a finding.** I ran
`git ls-tree -r --name-only e56063c5 -- dialectical-engine/.hermes/planning/…` and got 0 files, and
concluded the packets were untracked and the "frozen at e56063c5" claim unverifiable. **The packet
warns about this exact trap in its own §1** (`git diff/log/ls-tree -- <pathspec>` from inside
`dialectical-engine/` — a git-root-relative spelling returns EMPTY and reads as unchanged). I read
that warning, then walked into it 40 minutes later. Re-measured CWD-relative: the packet is tracked,
blob `73b78fe1…`, identical across all three freeze commits. **Price: ~4 min.** A false finding
against the orchestrator would have cost a great deal more.

**2.3 `tail -25` hid the head of the freeze diff** and removed the three packet rows from view,
which is what made 2.2 look plausible. Two independent tooling errors agreeing with each other is the
most dangerous shape there is.

**2.4 The `$path` trap.** My promoted runner did `for path in $copied; do rm -f …; done`. In zsh
`path` is tied to `PATH`, so the first iteration blanked PATH and `rm`, `wc` and `tr` became "command
not found" — **the cleanup script silently failed to clean up**, leaving my fixtures in the worktree
while printing a success line. Caught by checking porcelain independently instead of trusting the
script's own report. **Price: ~7 min and four re-runs.** The fixed script carries the reason in a
comment so the next seat does not rediscover it.

**All four are the same species: a shell that fails quietly.** Three of my four near-misses this pass
were zsh semantics, not TypeScript.

---

## 3. What repeatedly cost tokens

| Cost | Amount | Cause | Fix |
|---|---|---|---|
| Reading `diff-cc014550..cd043907.patch` in full | ~14k tokens | It is the only way to review a fix, and it is right that I read it | none — this is the job |
| Re-running the four gates | 137s for the 17-file run alone; ~5 min total | Correct: the reviewer re-measures | run them **in parallel with static reading**, as I did; do not idle |
| The wasted mutant run | ~6 min, ~4k tokens | zsh word-splitting | a shared, tested probe harness (§5) |
| Re-deriving the relay capture seam | ~5k tokens | Every relay probe needs the same `testOnlyCommand` + argv-capture envelope; pass-1 me wrote one, pass-2 me wrote it again from scratch | promote the *harness*, not just the probe |
| Chasing the `ls-tree` empty result | ~4 min | pathspec trap the packet named | a one-line helper (`msdiff`) in TOOLING-TRAPS that always spells pathspecs correctly |

**The largest avoidable cost this pass was not tokens — it was four shell re-runs.** Every one was a
silent failure, and every one was caught only by an independent check.

---

## 4. Where the packet fought me, exactly

1. **Charge 4's constant is wrong by 6×** — "12 rows were added beside S03's row by other branches";
   measured, **2**. This is filed as N8, but the reason it matters for *process* is that the sentence
   framed a large benign growth. That framing is precisely what makes a lens skip re-running the pin.
   **A wrong constant did not merely misinform; it pointed away from the defect.**
2. **Charge 4 asserts an outcome instead of commanding a measurement.** "the route pins … hold at
   d35a9634" tells the lens the answer. Had it read *"run the route pins at d35a9634 and report"*, the
   defect would have been found by all three lenses in the first five minutes. **A packet should
   assign measurements, never their results** — the results are the seat's output, not its input.
3. **The `allowed` list is under `.worktrees/all`, while the standing laws say never to open
   `.worktrees/all`.** Every input path the packet names is also there. I read the conflict as: the
   blindness law governs *reading the code under review* (which I did only in my own worktree), and
   the packet's explicit `allowed` list governs *where my outputs go*. That reading should be stated
   in COMMON rather than left to each seat to resolve privately.
4. **Charge 3 asks me to check "the route pins hold under a route-drift mutant" without telling me the
   baseline is RED.** A drift mutant against a failing suite is meaningless — I had to first prove
   (mutant E) what the RED was, then repair it temporarily, then drift. That is the right answer, but
   the charge assumed a green baseline that the packet never measured.

---

## 5. What to upgrade — in priority order

**5.1 Derive the verification list from the DIFF, not from the plan.** The one-line rule: *every file
the slice changes must appear in at least one command of record.* This is mechanically checkable —
`git diff --name-only <base>..<head>` intersected against the union of the cluster commands plus §5 —
and it would have caught B1 before a single reviewer was dispatched. Make it part of `packet-check`
and print the uncovered set in the review package. **This is the single highest-value change here.**

**5.2 A measurement may not outlive its head.** Every number in a package must carry `(value, command,
commit)`. The p2 README already does this for its own runs — that was pass-1 N5 being taken, and it
worked. The failure was a number *inherited from a ticket comment at another commit* and restated
without its commit. Extend the rule: **a number quoted from a board comment carries the commit that
comment measured at, or it is not quoted.**

**5.3 Packets assign measurements, not outcomes.** Replace every "X holds at Y" in a charge with "run
X at Y and report". Cheap, mechanical, and it converts the packet from a claim the lens might trust
into a task the lens must perform.

**5.4 Promote harnesses, not just probes.** Three seats have now independently rewritten the same
Claude/Grok argv-capture envelope. A `probes/_harness/cli-relay-argv.ts` exporting
`startWithCapturedArgv(relay, options)` would have saved me ~5k tokens and pass-1 me the same. The
same holds for `repl.py` (content-matched single-match replacement) — every mutant script in this
mission re-implements it.

**5.5 A `TOOLING-TRAPS` entry for zsh.** Three of my four near-misses were zsh: no word-splitting on
unquoted parameters; `path` is tied to `PATH`; a nested script's PATH is not the parent's. These cost
more than any TypeScript question this pass. The entry should be one screen, with the three lines
that bite.

**5.6 Toward the one-prompt machine.** The packet is already close to a self-contained prompt — I did
not need to ask a single question. What still leaks is **trust**: the packet hands the lens conclusions
("holds", "12 rows"), and a blind lens has no way to know which sentences were measured at its own head
and which were inherited. If every factual sentence in a packet were tagged with the command and
commit that produced it, a lens could mechanically re-verify the packet's own claims as step zero —
and B1 would have been a five-minute finding instead of a forty-minute one. **The machine becomes
one-prompt when the prompt can be audited by the agent receiving it.**

---

## 6. Dead ends — do not re-derive these

- **`readDeployment` does not gate on session.** It takes `session` and ignores it; the operator
  restriction on `GET /v1/deployment` lives entirely in the route policy. So the user-gated
  `/v1/plan-tiers` calling it is not an authorization hole. (It *is* a coupling — N3.) Verified at
  `apps/api/src/index.ts:1483-1488`; do not re-open it as a security question on correctness grounds.
- **`tiers-s02-rosters` case 6 is sound and final.** Pass 1 proved the `apps/ui` negative fires
  (mutant M3); pass 2 re-confirmed the two-file inventory at `d35a9634`. Stop probing it.
- **The alias path was not broken by the fix.** `CLAUDE_MODEL_ALIAS_PATTERN` and its refusal are
  untouched; a hyphenated alias still throws `CLAUDE_CLI_MODEL_ALIAS_INVALID` (P2). The new refusal
  code `CLAUDE_CLI_MODEL_INVALID` is a *separate* code on a *separate* branch (P3).
- **`PLAN_TIER_ROSTERS` still deep-equals `config/models.yaml`** (X5), and the API still uses the
  constant only for pre-existing admission (`:1272`, `:1279`), which is why the two-file selection pin
  is unchanged. Not a regression; do not file it.
- **The 500-envelope change (`message` → `correlation_id`) in `tests/unit/api.test.ts` is NOT S03's.**
  It is the observability branch's, it is covered (29/29), and `merge-delta-commits.txt` attributes it.
  I expect at least one lens to file it; it should be rejected.

---

## 7. The one thing I would change about my own conduct

I ran the four gate commands **first**, in the background, and did static analysis while they ran —
that was right, and it is why a 28-minute pass included a 137-second suite run three layers deep.

What I would change: **I checked the shell scripts' self-reported success before checking the world.**
Every one of my four failures announced success. The discipline that saved me each time was the same
one sentence from `verification-before-completion` — *evidence before assertions* — applied to my own
tools rather than to the code under review. Next pass, every script I write prints a fact I can verify
**independently of the script** (porcelain from a separate call, a sha256 I compute myself), and I
check that first, before reading a single line of its output.
