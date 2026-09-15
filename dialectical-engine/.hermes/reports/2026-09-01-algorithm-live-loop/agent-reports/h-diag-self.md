# H-DIAG — self-report (case file)

Seat `lane/h-diag`, ticket `F-SEALEDROWS-H`, one round, no rework. Wall clock ~25 minutes,
five gate-run measurements, four of them vitest runs of ~25s each.

## The cause that nearly cost the round, and the check that caught it

**I nearly shipped a single-cause diagnosis of a two-cause failure.** Everything lined up for
it: the packet gave one hypothesis, the hypothesis was correct, the persisted receipt confirmed
it in one measurement, and the git archaeology confirmed it in another. I had a clean verdict
and a fix to hand to the next lane.

Two things stopped me.

First, **I checked whether T11 was actually in the T0 baseline instead of assuming the ticket's
"stable-red since T0" meant one continuous cause.** It was not — T11 landed 2026-09-01, the
baseline is 2026-08-28. One `git merge-base --is-ancestor` call. That single fact broke the
story: at T0 the binary derivation was still in place, so the label assertion would have PASSED,
so the T0 redness had a different cause. The ticket, the packet and my own draft all read
"stable-red since T0" as "red for this reason since T0". It is red **by name** since T0. D60 is
written about exactly this — rigour downstream of a false branch point produces a confident
wrong answer faster — and the mission had already paid for that lesson once.

Second, **I ran the candidate fix in a scratch copy instead of merely proposing it.** That is
what turned an inference into a measurement: the test still fails ~80 lines later on
`staleness_state: ARCHIVED_REVIVED` vs `UNDER_REVIEW`. Cost: one 22-second run. Value: a fix
lane that would otherwise have edited two lines, re-run, found it still red, and burned a round
discovering what one probe showed.

**The general lesson, and I think it is the most valuable thing in this report:** *a diagnosis
that stops at the first failed assertion has diagnosed the assertion, not the test.* Vitest
aborts a test at the first failing `expect`. Every long integration test is therefore a **stack**
of potential causes, and the record only ever shows the top one. Nothing in our process forces
anyone to look underneath. The b11 and b12 suite logs, the T0 baseline table, and the ticket all
faithfully record one failure — and all three are showing the top of a stack of at least two.

**Concrete upgrade:** when a diagnosis lane's deliverable is "what does the fix lane need",
applying the candidate fix in a scratch copy and re-running should be a **required step**, not a
nicety. It is one run. It converts "here is the fix" into "here is the fix and here is what is
still red after it". I would put it in the worker contract next to the refutation duty — call it
the **exhaustion duty**: you have not diagnosed a test until a run with your fix applied gets
past your failure.

## What repeatedly cost tokens

1. **`grep --include=*.ts` fails under this zsh** — `no matches found` before grep ever runs.
   Cost three wasted calls before I switched to `--exclude-dir`. Now appended to TOOLING-TRAPS.md.
2. **The mission directory is not in the lane worktree.** It exists only in the main checkout
   (untracked). The packet's `allowed` list is written relative
   (`dialectical-engine/.hermes/reports/…`), which reads as lane-relative and is not. D41(b)
   already ruled that packets state the absolute mission path; this packet's contract block does
   not. One `ls` to discover, but it is the same defect D41 was written to close.
3. **Finding the label code took four searches** because the mark string, the constant name
   (`LABEL_BASIS_INCOMPLETE_MARK`), the trigger (`BASIS_INCOMPLETE`) and the function
   (`deriveVerdictLabel`) are four different tokens across three packages. A one-line pointer in
   the ticket ("the ladder is `deriveVerdictLabel`, packages/serve/src/index.ts") would have
   saved all four.

## Packet defects (reported in the handoff, recorded here)

- **The provider-call reading is wrong.** The packet says the 3 calls are "one author call plus
  a two-member panel". They are judge + SYNTHESIZER + EVALUATOR, stated in a comment in the test
  itself at :3866-3869, and there is one judge and one panel voice. Had I taken it at face value
  I would have gone looking for why a two-member panel produced no dispersion — a real
  investigation into a thing that never happened. This is the D52 hazard in packet form: an
  evidence claim that manufactures the suspicion it exists to remove.
- **The hypothesis says margin ABSENT *or* disagreement ABSENT.** Measured: both. The distinction
  matters, because "either limb" invites a fix lane to argue rung 0 over-fires; "both limbs"
  closes that argument completely.
- **The contract block quotes relative paths** (see above).

The packet was otherwise excellent, and one thing in it deserves copying: it named the
hypothesis and then said *"a hypothesis to TEST, not to assume"*, and made the deliverable the
discrimination rather than the conclusion. That framing is why I looked for falsifiers instead
of confirmations, and four of them are in the report.

## Dead ends — do not re-derive

- **There is no filed raw T0 suite log.** `logs/` has only `t00-codex-r{1,2,3}.log`;
  `t00-baseline.md` has the failure table with names but no assertion text. Do not go looking
  for the T0 assertion detail; it was never captured. This is a gap worth closing — D60 already
  ruled "capture-before-destroy applies to a tool's OUTPUT", and a stable-red table that records
  names without the assertion behind them is the same class of loss.
- **`git log -S 'verdict_state: "SUPPORTED"'` on the test path returns exactly one commit**, the
  2026-08-17 tree reorganization, which is a path artifact, not the origin. The real origin needs
  a pickaxe on the test NAME (`f59aaf5c`, the original V3 build).

## How this becomes a one-prompt machine

1. **Make the exhaustion duty a step, not a virtue** (above). One run, and it is the difference
   between a fix lane converging in one round and three.
2. **Record the assertion, not only the name, in the stable-red authority.** The D15 classifier
   (D60) keys on the full name, which is right for set equality — but the authority table should
   carry the failing assertion's `file:line` and its diff alongside. Two of my three most useful
   facts came from re-deriving something a 2026-09-01 log could have carried. The classifier
   already parses the suite output where both live.
3. **Add "is the cause I found in the tree the baseline was taken from?" to the diagnosis
   skeleton.** It is one `git merge-base --is-ancestor` and it is the check that decides whether
   you are looking at one cause or several. It would have caught this one before the report, not
   during it.
4. **Scratch-copy instrumentation should be a mission tool, not a per-seat improvisation.** I
   wrote two wrapper scripts (`copy → patch → run → delete → trap cleanup`) that any diagnosis
   lane needs and that are easy to get subtly wrong — a missing `trap` leaves a stray test file
   in a worktree another seat is measuring. They are retained under `logs/h-diag/` and would
   generalize to `tools/probe-run.sh <file> <python-patch> <-t filter>` in about twenty lines.
   D45's argument applies exactly: I specified a record in prose three times before shipping the
   thing that produces one.

## What I did NOT do, by contract

No product or test file edited. No fix applied. No push, no merge, no board write, no
DECISIONS edit. No credential read, minted or passed. The suite was never run whole and never by
cluster — only `-t "claims, judges through the HTTP gateway"`, four times. Final tree state:
porcelain empty, HEAD `7dda3cc0`, zero mode changes.

---

# H-DIAG — self-report, F-H-2 (case file)

Same seat, second diagnosis, one round, no rework. Six gate-runs; ~30 minutes wall clock, of
which **two runs and roughly eight minutes were mine to waste** — see below.

## The finding, and why it was cheap when the first one was expensive

F-H-2 took a third of the effort of F-H-1 and produced a harder result: a dated commit, a
four-line hunk, and a predicate that answers the same question two ways twenty lines apart in
one method. The difference was **method order**. On F-H-1 I read code first and measured second.
Here I measured first — `recordQuery` returned `0` — and that single number collapsed the search
space before I had read anything. Everything after it was confirmation.

**The generalizable move: instrument the RETURN VALUE of the call the test ignores.** The test
calls `await liveness.recordQuery(…)` and discards the result. That discarded `0` was the whole
diagnosis. A test that ignores a return value is hiding the cheapest possible evidence, and the
first probe on any "the effect did not happen" bug should be *did the call claim to do
anything?* — before any reasoning about why the effect is absent.

## Two errors of mine, both caught by tooling rather than by me

**1. I ran two background gate-runs in the same worktree, writing the same log.** I launched an
instrumented run, noticed the wrapper was missing the F-H-1 label fix, patched it, and relaunched
to the same output path while the first was still running. Both vitest processes then shared a
worktree, each creating and deleting its own scratch file. The log I read was coherent and wrong:
it showed the first run's assertion, so my patch looked ineffective when it had applied correctly.
I was one step from re-patching code that was already right.

**What caught it was `gate-run.sh`'s `CLEAN-STATE: CHANGED — this measurement is suspect`.** Each
run saw the other's scratch file in porcelain. That is D45 and D49 earning their cost precisely
as written — the porcelain bracket exists so that a measurement taken against a shifted tree is
visible rather than invisible, and it was. **Price: two wasted runs, ~8 minutes, and very nearly
a wrong conclusion about my own tooling.** Filed in TOOLING-TRAPS.md, with the corrupted record
retained rather than deleted (D60's capture-before-destroy).

**2. My first probe was inserted below the first failing assertion, so it never ran.** Zero probe
lines. Vitest aborts at the first failed `expect`, and F-H-1's stale expectation at `:3908` was
stopping execution ~80 lines above my probe at `:3990`. Obvious in hindsight, and it is exactly
the same structural fact I had *already written up* in the F-H-1 report — "a diagnosis that stops
at the first failed assertion has diagnosed the assertion, not the test" — applied to the product
and not to my own instrument. **I knew the rule and did not transfer it.** Cheap to catch because
I counted probe lines (`grep -c "FH2|"` → 0) rather than reading the log and assuming; that count
is now a habit worth naming: **assert your instrument fired before you interpret its silence.**

## What the packet got right, and it is worth copying

The orchestrator admitted all four F-H-1 packet defects, granted the file it had forgotten, and
— the part that mattered — **added a third verdict class before I asked for one.** STALE TEST vs
PRODUCT DEFECT is a binary that would have forced this diagnosis into the wrong box if the
answer had been "never implemented". Offering UNIMPLEMENTED EXPECTATION as a named option made
the archaeology a real question rather than a formality, and it is why I went looking for the
window in which the assertion was satisfiable instead of stopping at "it is red and the product
looks wrong". The answer turned out to be neither of the first two classes on first inspection
and then, on measurement, decisively the second — but I would not have measured for it without
the third option on the table.

**Generalize it:** a diagnosis packet should always offer the "the feature was never built"
class. Its absence biases every diagnosis toward blaming whichever of code-or-test changed most
recently.

## What repeatedly cost tokens, across both diagnoses

1. **`git log -S` on a path returns the tree-reorganization commit, not the origin.** Hit twice —
   once per diagnosis, on two different symbols. Both times the real origin needed a pickaxe with
   no path filter, or on a distinctive symbol rather than a file. A one-line note in the mission
   tooling would have saved the second occurrence; I did not file it after the first, which is my
   error and the same "residual dropped on the floor" the router's §2.2 is about. Filed now.
2. **Locating a symbol across a package boundary.** F-H-1 cost four searches for the label
   ladder; F-H-2 cost three for the ownership predicate. Both times the chain was
   `TS call site → SQL function name → migration file`. A `tools/` symbol index, or simply the
   habit of grepping `migrations/` and `packages/` in the same call, removes it.
3. **Nothing else.** The second diagnosis was fast because the first had already paid for the
   scratch-copy harness. That is the strongest argument for turning it into a mission tool.

## How this becomes a one-prompt machine — sharpened by the second run

1. **`tools/probe-run.sh` should exist.** I have now written the copy→patch→run→delete→trap
   wrapper three times, and got it wrong once (the missing upstream fix) and dangerously once
   (the shared log). Every diagnosis lane needs it, it is ~25 lines, and each hand-rolled copy is
   a chance to corrupt a measurement. It should take the file, a patch spec, and a `-t` filter,
   refuse to run if another instance holds the worktree, and auto-version its output path. That
   last rule alone would have prevented my worst error today. This is D45's lesson a third time:
   ship the thing that produces the record, do not describe it.
2. **Make "did the call return what you think?" step one of any absent-effect diagnosis.** It is
   one probe and it collapsed this entire investigation.
3. **The exhaustion duty from my F-H-1 report is now doubly earned.** Applying the candidate fix
   in a scratch copy is what found F-H-2 at all; and F-H-2's own report has to carry the same
   caution again, because everything past `:3990` is still unmeasured. A test with N stacked
   causes needs N diagnoses, and only the exhaustion probe reveals N.
4. **A "chore: checkpoint" commit changed product behaviour.** `2d1f86b8` — the commit that broke
   this — is titled "checkpoint all local mission artifacts and in-flight tree" and describes no
   behaviour change. It replaced two inlined `NOT EXISTS` clauses with a same-named helper
   carrying an extra precondition. **A commit whose message claims no behaviour change is the
   least-reviewed place a behaviour change can hide.** If the fleet adopts one rule from this
   diagnosis, it should be that bulk checkpoint commits get the same diff review as feature
   commits, or are forbidden from touching `packages/`.

## What I did NOT do, by contract

No product or test file edited; no fix applied, on either ticket. No push, merge, board write or
DECISIONS edit. No credential touched. Suite never run whole or by cluster — only
`-t "claims, judges through the HTTP gateway"`, nine times across both diagnoses. TOOLING-TRAPS.md
was appended to (newly granted), never rewritten: byte count checked before and after each
append, three traps added. Final tree: porcelain empty, HEAD `7dda3cc0`, no scratch files.
