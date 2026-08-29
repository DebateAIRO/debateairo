# ARCH-01 — S02-C5 correction round · ticket `t_d33dd7d6`

## Why this round exists

A defect was found in `S02/PLAN.md` **after** the acceptance-command thread closed. V's Row 6
standing consequence covers exactly this: *the rework cap is a default, not an absolute; a defect
found AFTER a thread closes may earn an extra round, but the Router still may not author the fix.*
So this round is legitimate, and the fix is yours — not mine, and not the coding seat's.

**Scope: `S02/PLAN.md` step S02-C5-1 and its cluster row only.** Plus a `DECISIONS.md` append.
No product code. No test files. No other slice. The S02 coding seat is parked and resumable; do
not touch its worktree.

## The defect — measured by the S02-CODE seat with hostile controls, re-verified by the Router

S02-C5's acceptance is a bare recursive grep for forbidden mutation imports:

    grep -rn "PublicationControl\|regenerateNode\|unlinkMemory\|recordInvestigation\|ChallengePopover\|InvestigationDrawer" apps/ui/app/public/debate/

The PLAN's convention reads **any nonzero exit as PASS** ("no match = the desired state").

**(a) rc conflation.** Clean-and-empty is `rc=1`. **Missing scan root is `rc=2`.** Both are
nonzero, so both read as PASS. Seat measured both arms: at the worktree `rc=1`; the identical
grep run from `/tmp`, where the relative scan root does not exist, prints `No such file or
directory` and returns `rc=2`. A renamed or vanished directory therefore passes.

**(b) The substantive one — it is vacuous TODAY, not merely fragile later.** At base commit the
command already PASSES while `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx` — the
file the PLAN mandates, and the only file that could carry a forbidden import — **does not
exist**. Seat measured: `test -d apps/ui/app/public/debate` → `rc=0`; `PublicDebatePageClient.tsx`
absent; grep → `rc=1` → PASS. **A component that lands in any other directory is silently
accepted and never scanned.** The scan root is not tied to the artifact the step exists to police.

## Why the coding seat correctly did NOT fix this itself

The obvious fix — assert the mandated file exists, then scan — makes C5 **RED until S02
implements it**, converting it from VERIFICATION-ONLY to FEATURE-ASSERTION. Row 7 authorizes a
worker to correct a demonstrably factual PLAN error in place but **explicitly excludes acceptance
CATEGORY changes**. The seat stopped at the boundary and asked. That was correct.

Note the two defects have different remedies: (a) can be fixed without touching the category;
(b) cannot. **Deciding whether S02-C5 should remain VERIFICATION-ONLY or become a
FEATURE-ASSERTION is the actual question of this round, and it is yours.** Do not treat the seat's
proposed shape as the answer — it is a proposal, and it was not authorized to weigh the category.

## What the Router will not prescribe

Not which shape the fix takes. Options exist that keep the category (bind the scan root's
existence without binding the artifact's) and options that change it (assert the artifact, scan
it). Argue the choice; do not just implement one.

## The question that outlives S02

You wrote the **exclusive-provenance invariant** in an earlier round: a PASS must trace, through
every transformation, to the one fact it claims, such that no other state of the world can produce
it. S02-C5 fails it plainly — the PASS is produced by *an empty directory*, by *a missing
directory*, and by *a correct implementation*, indistinguishably. Three world-states, one signal.

So: **is a whole CLASS of this mission's acceptances anchored to a scan ROOT rather than to the
ARTIFACT?** Confirm rather than assume whether S01, S03 and S04 carry the same shape. If they do,
say so and name the sites; the Router will ticket them. If they do not, say that too, with what
you checked — a clean report that names its method is worth more than silence.

## Router defect, disclosed

The S02 dispatch packet granted Row 7 authority in one paragraph and instructed "C5 is
VERIFICATION-ONLY and must STAY green, so do not fix it" in another. That contradiction is mine.
The intake contradiction-check exists to catch it and did not. It cost one seat cycle. The resume
packet will drop that instruction.
