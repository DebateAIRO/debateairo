# [unassigned] F-SAFEGUARD-MOVED-WITHOUT-ITS-TESTS · a bulk checkpoint relocated three safeguards and left their contract tests behind, and two of those tests then rotted into passing regardless of the code

```yaml
state:
  ticket: F-SAFEGUARD-MOVED-WITHOUT-ITS-TESTS
  risk_tier: high
  status: queued
  owner: { agent: claude, session: tbd }
  contract: { allowed: [], readonly: [], forbidden: all_others, human_review: no }
  authority_epoch: 1
  rework_round: 0
  escalation_target: v_packet
```

Filed 2026-09-19 by the orchestrator, from the fix-the-tests round (V: *"please fix the tests"*). The
evidence below is the fixing seat's own, quoted rather than summarised, because the value is in the
detail.

> On 2026-08-28, commit **`2d1f86b8`** — *"chore: checkpoint all local mission artifacts and in-flight
> tree"*, a bulk checkpoint spanning migrations 0040–0049 plus "the in-flight test and app-code state
> across missions" — moved three safeguards out of application code and into the database, correctly and
> for a stated reason (DEV-11E items 3 and 4: the restricted `debateai_runtime` principal is deliberately
> denied `UPDATE` on `core.run` and `SELECT` on the private erasure carriers, so the inline forms could
> not survive): the **fixed-order run lock** `ORDER BY run_id FOR UPDATE` became the `SECURITY DEFINER`
> capability `core.lock_owned_live_runs`, the **completed-tombstone filter** on
> `serve.private_run_erasure_tombstone` became the `SECURITY DEFINER` predicate
> `core.run_private_content_is_live`, and in the same commit the **DR-128 loud register read**
> `readClaimTypeCompositionMap` moved out of `apps/runner/src/main.ts` into the
> `readDevelopmentRunnerPolicy` loader that `main.ts` calls. Four contract tests that grep the shipped
> source for those literals should have moved in that same commit and did not —
> `tests/architecture/s7-authorization-contract.test.ts:98`, `tests/architecture/s13-contract.test.ts:69`,
> `tests/architecture/s10-carrier-erasure-red.test.ts:94` and
> `tests/architecture/s04-contract.test.ts:36` — while a fifth,
> `tests/architecture/s6-content-encryption-contract.test.ts:261-265`, *was* updated and now positively
> **requires** the new call form and **forbids** the old inline `ORDER BY run_id FOR UPDATE` by regex, so
> for roughly three weeks the suite asserted both sides of the same move and the four stragglers were
> recorded as owned reds rather than as stale tests. Worse than the four visible reds are the two checks
> that rotted into passing regardless of the code, because `String.prototype.indexOf` returns `-1` for a
> literal that no longer exists and `-1` is less than every real index:
> `s7-authorization-contract.test.ts:73` and the `candidateLock` probe in the same file's
> `evaluateCandidate` block were both green while asserting nothing whatsoever about the product — they
> are now real indices with explicit `> -1` guards, and mutant M4 (replacing the candidate lock with a
> plain `SELECT`) confirms they bite. The generalisable rule: **a commit that relocates a safeguard must
> carry the tests that guard it, and an ordering assertion built on `indexOf` must assert `> -1` on every
> index it compares, or it degrades silently into a tautology the moment its needle moves.**

**Why this is filed `high` although every row is now green.** Two of the four reds cost this project three
weeks of carrying them as "owned" in every gate's four-count — a red that is really a stale test poisons
the one instrument the mission uses to tell regression from noise. And the two silent ones are worse in
kind: a check that cannot fail is indistinguishable from a check that passes, so the suite reported
protection it was not providing. STRENGTH: entailed.

**Charge, two parts.**
1. **The class sweep is under way** — every `indexOf`-based ordering assertion in `tests/` and
   `acceptance/` classified GUARDED / VACUOUS-CAPABLE / NOT-AN-ORDERING-ASSERTION, each claimed member
   proved by a mutant that removes the needle and shows the assertion still passing. Fold its result here
   when it lands.
2. **The process half, which no sweep fixes.** A bulk "checkpoint" commit is where this got in: it mixed
   migrations, application code and in-flight test state across several missions, so nothing about it
   invited the question "which tests guard what this moved?". Decide a rule and record it — at minimum,
   that a change relocating a safeguard names the safeguard and its guarding tests in the commit message,
   and that "checkpoint" commits never carry product moves.

---

## ADDENDUM 2026-09-20 — the class sweep landed, and it found a third family underneath

**The sweep charged in part 1 is done.** Over 478 files and 449 raw `indexOf`/`lastIndexOf` occurrences
it classified **149 ordering-assertion candidates**: **123 GUARDED**, **10 VACUOUS-CAPABLE** (23
suspected, 13 withdrawn on evidence), **3 not ordering assertions**. All ten are repaired, each proved
first by making the needle unfindable in the TEST and showing the assertion still green, then proved to
bite by a mutant against the PRODUCT. The ten: `s7-authorization-contract:105, 143, 163, 164`;
`register-support-publication:193`; `s9-dev-token-retirement-contract:67`; `sup-06-no-zone-limiter:55`;
`graceful-shutdown:117, 165, 269`.

The refinement worth keeping: **which operand is dangerous depends on the matcher**, because −1 is less
than every real index but not less than itself — `toBeLessThan` is unsafe on the left,
`toBeGreaterThan` on the right, and both `…OrEqual` forms on either side.

**The member that justifies sweeping a class rather than patching its samples:**
`tests/architecture/s7-authorization-contract.test.ts:164` needed no mutant — **it was vacuous live**.
Its `contradictionLock` probes the literal `ORDER BY run_id FOR UPDATE` that commit `2d1f86b8` retired,
so it evaluates `expect(-1).toBeLessThan(1904)` and has passed every run since August. It is the THIRD
site of the same DEV-11E(4) lock move; rounds 1 and 2 repaired `recordQuestionAndMatch` and
`#evaluateCandidate` and never looked at `observeAnswerContradiction`. STRENGTH: entailed.

## A third family, found one layer up: an assertion behind a failing assertion never runs

`tests/architecture/s14-contract.test.ts` died at its import check on line 14, so its SECOND assertion —
`not.toContain("export type DebateDetail")` — **never executed against a file that declares exactly that
at line 714**. Two dead assertions in one test, only one of them visible as a red row.

**This one is not sweepable statically, and it recurs.** The same shape appeared twice more in the same
48 hours: `registration-database.test.ts` failed at `:2988` in the contended gate and at `:2991` in the
quiet one — a different assertion, invisible until the first stopped failing; and any of the ten
repaired ordering assertions could have been masking a neighbour.

**The rule: a red test measures only up to its first failing assertion. Everything after it is
UNMEASURED, not passing.** Two consequences that bind this project's gate discipline:
1. A four-count is a lower bound on the number of real problems, never an upper one. Fixing a red row
   legitimately produces new red rows in the same test, and that is the mask lifting, not a regression.
2. When a whole class of failures clears — as ~99 storage rows did at D78 — every row that remains must
   be RE-READ rather than re-counted, and so must every row that newly appears inside an already-red
   test.

**Charge for the process half, revised.** Beyond the commit-message rule already charged above: make
"re-run the affected file after every red row you close, and expect new rows" the fix loop's default,
and state in any gate record whether a count is a first measurement or one taken after a masking
failure was removed.

## ADDENDUM 2 (2026-09-20) — a fourth family, and it is worse than the one this ticket was opened for

Merge `690ebe14` resolved a conflict in `tests/architecture/s8-publication-contract.test.ts` by taking
one side whole and **discarding 10 of 10 lines of the other** — five of them live assertions. What was
lost were the STRUCTURAL laws of the public answer disclosure: that it appears **exactly once**, and
**after the card list**. What survived is a presence check, so a page printing the warning five times
above the list satisfied the suite completely. The database seat's merge sweep found it; the contract
seat restored it. STRENGTH: entailed.

**Why this shape is worse than the one at the top of this ticket, in the restoring seat's own words:**

> a moved safeguard leaves a red test behind as evidence while a discarded assertion leaves nothing —
> the file still exists, still passes, still looks maintained.

It also had no independent guard. The only other test covering the property,
`tests/render/t3-library.test.tsx`, was itself red — because the SAME merge dropped the
`data-library-row` attribute it selects on. So for weeks the law was guarded by one red test and
nothing else.

**The restoration is the method, not the paste.** Both original anchors (`published.items.map` and
`</article>`) no longer exist — the rows moved into `DebatesBuffer.tsx` and the page now composes
`<PublicDebatesBuffer />` inside a list container. Pasting the discarded lines back would have produced
two `-1` indices and a comparison that passes on anything: **this ticket's own round-3 defect, reinstated
by the act of fixing it.** The laws were restated against what exists now, every index pinned `> -1`, and
both proved by product mutants — emitting the disclosure twice reddens it, moving it above the list
reddens it.

**One control catches this family and the one above it:**

> a diff touching a test file may not be resolved by taking one side whole; the discarded assertions
> must be enumerated and each one re-applied or explicitly retired with a reason.

**Charge, added to the two above.** Apply that control to the other one-side-whole resolutions the merge
sweep found, not only to the one that happened to surface: the sweep named 16 genuine discards, 5 live
in the V3 tree. Each live one needs the same treatment — enumerate what the discarded side asserted or
implemented, and re-apply or retire it with a reason on the record.

## ADDENDUM 3 (2026-09-20) — a fifth family: a test that asserts more than it checks, caught only because its mutant failed to fire

While restoring the canvas independence pill, the website seat wrote a test asserting that a card with
no sources stays silent. **It passed — for the wrong reason.** The fixture carried no independence
record at all, so the assertion resolved through the helper's `!independence` arm and never reached the
`<= 0` boundary it claimed to be checking. The seat caught it only because **the mutant written for that
boundary failed to redden the test**, and it then added a fixture carrying a record of zero sources —
the one shape that exercises the arm — after which the mutant bites. In its words: *"a test asserting
more than it checks is the same dishonesty as a weakened one."* STRENGTH: entailed.

**This is the family the other four cannot be swept for**, because nothing about the source text is
wrong: the assertion is well formed, the fixture is valid, the test is green, and only the mutant
distinguishes "this passes because the product is right" from "this passes because the test never
reached the product". **The control is the one this project already has and must keep paying for: one
mutant per assertion, aimed at the specific arm the assertion names — and a mutant that does NOT redden
its test is a finding about the test, not a failed experiment.**

## The counting fact this round established, which outlives every individual fix

Of the losses recovered on 2026-09-19/20, **the two found last — the drawer's empty state and the canvas
independence pill — failed no test and appeared in no gate.** They were found by reading the discarded
sides of two merges. Every other loss this mission has chased was caught because something happened to
be pinned. In the seat's words: *"There is no reason to think these were the last two."*

So the gate's number is bounded in a way worth stating plainly wherever it is quoted:

- A four-count counts **failures**, and a deleted behaviour whose guard was deleted with it produces no
  failure. It is invisible to every gate this project runs.
- The only systematic instrument that finds that class is the merge-discard sweep begun here
  (`16 conflicted merges · 5,505 (merge, file) pairs · 16 genuine one-side discards, 5 live`), and it
  has been run once, by one seat, for one shape of loss.

**Charge, added:** finish the sweep across the five live discards (already charged in ADDENDUM 2), and
record in the mission's gate discipline that **a green gate is evidence about the code the tests reach,
and says nothing about code whose tests were deleted.**
