# ARCH-FIX-S03 pass 3 — self-report · mission `debate-tiers`, slice S03, node ARCH-FIX(S03), ticket `t_06759d41`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: ARCH-FIX-S03 (claude-opus-5, the ARCH-S03 session resumed a second time — same context across
passes 1, 2 and 3). **Pass 3 of 3, the last: a REWORK here becomes a V row.** Lane `9a000c37`,
0 dirty at start and at end; no git write, no product file touched, no provider or stack call.
PLAN.md 1203 → **1239** lines; DECISIONS.md 497 → **570**; `surfaces.mjs` re-issued.
Runners: `scratchpad/seats/ARCH-S03/v04-p3-verify`, `surfaces.mjs`(+`.log`), `c-base-rev3`(+`.log`),
`trace2-rev3.log`, `p3-dropped-rerun.log`.

**B1-p2 was correct. I contested nothing.** Reproduced against the lane before touching the plan.

---

## 1. The body: the detector I built to close a finding was itself the next finding

Pass 1's B2 was *"three cluster surfaces omit files their own steps edit"*. I closed it by replacing a
hand-written table with a derivation, `surfaces.mjs`, and I wrote into the plan: *"a column that
disagrees with it is the defect, not the script."*

**The script had the same defect as the table it replaced.** Its marker-walk stopped at the first
non-backticked token after `Create:`/`Modify:`, so S10's Files line —

```
Files — Modify: `package.json` (the repository root's), `tests/architecture/dev-deployment-register.test.ts`.
```

— gave up at the parenthetical and never saw the second path. The file was therefore **written by S10
(C1), broken by S21 (C3), and owned by neither**; and the disjointness check reported `none` *because
the file was absent from the set it was checking*.

That is the exact shape of B2 one level deeper, and the reviewer had predicted it at pass 1:
*"whoever checks the cluster table will check disjointness (which holds) and not completeness (which
does not)."* I read that prediction, agreed with it in writing, and then built a completeness-blind
checker anyway.

**Cause, stated plainly:** I built a checker that answers the question I was asked (*are surfaces
disjoint?*) and never the question that makes the answer mean anything (*did you see everything?*).
**A guarantee is only as wide as its denominator, and mine printed no denominator.**

**Price:** one full REV pass, this rework (~45 min, ~120k tokens), and — had it survived — a C3 seat
that could not make its own command green inside its own file contract.

## 2. What this pass cost, and where

**(1) Building the completeness checker twice. ~25k tokens.**
My first path predicate was "has a dot or a slash". It flagged **80** tokens: `yaml@2.9.0`,
`gpt-5.6-luna`, `rosters!.free`, `/^[A-Z][A-Z0-9_]*$/u`, `…/paas/v4//chat/completions`. About 70 were
phantoms. A checker that cries wolf 70 times is worse than none — it trains its reader to skip the
output, which is precisely how the original defect survived a human review of the same table.
`TOOLING-TRAPS.md:214` is *"Validate a checker on known-GOOD input, not only known-bad"*. I re-derived
it instead of reading it, for the second pass running (pass 2's over-inclusive surface script was the
first).

> **Upgrade:** the traps file has ~100 headings; the five or six that fire on *every* seat should be in
> `COMMON.md`. This one would have saved a build-measure-rebuild cycle twice in two passes.

**(2) The line-count constraint. ~15k tokens, and worth every token.**
Charge 2 froze `:98-362` because BUILD(C1) and BUILD(C2) were dispatched against Revision 2 anchors
*while I worked*. Editing S1 and S10 inside a frozen range meant re-punctuating within their own line
counts, and my first S1 rewrite overran by one line — caught by an assertion I wrote into the edit
script rather than by me. Then the `Revision 3` header, which the packet also requires, pushed S1 from
98 to **117** and broke the constraint from above. The fix was to compress the Revision 2 block by
exactly the 19 lines Revision 3 added, keeping the header's total height constant.

> **This is the most interesting thing in this pass and it is a process finding, not a plan finding:**
> the packet asked for two things that conflict — *"a `Revision 3` line under the title"* and *"S1
> unchanged"*. Any line added above S1 moves S1. Nothing flagged it; I discovered it by measuring after
> the edit. **A packet that freezes line anchors must say what happens to the header**, or say
> "anchors are content-addressed" and let seats add lines freely.

**(3) Re-running everything, three times over three passes.** Four cluster commands, `trace2.mjs`,
`surfaces.mjs`, the reviewer's `p2-dropped-paths.mjs`. All deterministic, all judgement-free.

## 3. What I nearly got wrong

1. **I nearly moved only the C3 column.** The reviewer's §6 spells out why that fails — the plan makes
   the script authoritative, so the next run drops the file again and the fix *silently reverts*. It is
   also the first thing the reviewer said it would check. Without that paragraph I would have shipped a
   fix with a half-life of one script run.
2. **I nearly left S10 writing the file "as well".** Adding it to C3 and leaving it in C1's Files line
   reads as harmless — both clusters run the suite. It is the single-writer rule broken, and the
   derivation would then report a genuine CLASH. The resolution needed a place for S10's ordering case
   to go, and the answer (`tier01-roster.test.ts`, already C1's through S9) was only obvious after I
   looked at what C1 already owned.
3. **I nearly reported "the assertion surfaced no new declared writes" without listing the ten.** The
   reviewer predicted the assertion would disagree with its hand classification *somewhere* and said the
   disagreement was "worth reading rather than suppressing". Ten candidates surfaced; I judged all ten
   citations. Reporting the ten and the judgement is the difference between a check and a claim.

## 4. Dead ends

- **Exporting `isExactProviderRuntimeRefresh` to make the N1-p2 case convenient.** It widens a module's
  public surface to suit a test. The module exports exactly three things (`:29`, `:73`, `:409`) and the
  assembler is the seam.
- **Adding a source-text case to each CLI's own suite.** Three more files enter C3's surface, one of
  them (`dev-auth-data-plane.test.ts`) in no cluster's command. One case in a file C3 already owns
  covers all four.
- **A global citation allow-list.** It lets a path that is a citation in one step be waved through where
  it is a write in another. The table is step-keyed for that reason.

## 5. Where THIS packet was unclear — exactly

- **Charge 2 and the output spec conflict** (§2.2 above). The `Revision 3` line under the title cannot
  coexist with "S1 unchanged" unless something above S1 shrinks. I made the header a fixed-height
  region; the packet should say so, or drop line anchors in favour of content anchors.
- **Charge 2 says S18 "moved by the number of lines you added".** S18 did **not** move (363 before and
  after) because every line I added landed in S21 (:462+) and §2. The charge assumes additions are
  contiguous with the frozen range. Reported as measured, not as predicted.
- **Charge 3(d) asks me to "say what S10 does instead"** — the single most useful sentence in the
  packet, because it is the question whose absence would have produced a two-writer fix.
- **Charge 7 says "report every path the assertion classifies, do not suppress a disagreement".** That
  is the right instruction and it should be standing, not per-pass.

## 6. Toward the one-prompt machine — what this pass adds

1. **Every check prints its denominator.** "None" is not a result; "0 of 123, and here is how 123 was
   counted" is. This is the single transferable lesson of three passes: B2 (a table that omitted),
   B1-p2 (a script that omitted), and both reported clean.
2. **Validate a checker on known-good input before quoting its verdict** — and put that rule where seats
   read it, not in a 3,000-line archive. Two passes, two unvalidated checkers, both mine.
3. **Ship a detector with every finding, and make the FIX seat re-run it.** The reviewer handed over
   `p2-dropped-paths.mjs`; folding it in took ten minutes and it is now the assertion that makes the
   plan's own guarantee true. Pass 2's B2 arrived as prose and cost an hour and a recurrence.
4. **A finding's fix must be re-run through the finding's own detector before handoff.** I did this at
   pass 2 (it caught S21's missing `Files` entries) and at pass 3 (the reviewer's probe now reports the
   B1-p2 path as no longer dropped). It is the cheapest guard against a rework-of-a-rework that exists.
5. **When a packet freezes anchors, freeze the header too.** Otherwise the required revision note is the
   thing that breaks the constraint.

## 7. What went right

- **The reviewer's §6 was a repair manual, not a complaint.** Four numbered remedies, the reason a fold
  would not work, and a recommendation on the single-writer question. I implemented it nearly verbatim
  and spent my own thinking on the parts it left open (where S10's case goes; how to classify 10
  candidates; how to keep the header height constant).
- **Scoping the rework to C3 let BUILD(C1) and BUILD(C2) run while I worked.** That is the graph paying
  off: a blocking finding in one cluster did not stop two others.
- **Resuming the same session for all three passes.** Every measurement from passes 1 and 2 was still in
  context; this pass re-measured only what the finding touched.
