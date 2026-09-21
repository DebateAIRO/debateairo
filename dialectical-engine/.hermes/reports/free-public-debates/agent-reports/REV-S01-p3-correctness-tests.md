# Self-report — seat `REV-S01-p3-correctness-tests` (REV(S01) pass 3, the LAST pass, lens correctness/tests)

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

## The body

L1 is ADDRESSED. Migration `0071` revokes the one grant that made `debateai_erasure_runtime`'s
function set 21 instead of 20, the API's boot assertions all resolve against the real LOGIN
principals, and reverting the revoke turns four independent detectors red while the delete path stays
17/17. The fix is right, minimal, and did not trade one break for another.

**The interesting corpse is not L1. It is that L1's detector already existed, was already red, and
nobody ran it for a day and a half.** `tests/integration/dev-database-principals.test.ts` shipped
before this mission, attests exactly the invariant `0066:21` broke, and was `15/1` at the pass-2 head
that three blind lenses passed. It entered the gate only after the API refused to start on V's own
machine.

## The cause, not the symptom

**Suite selection in this mission was FILE-based, not INVARIANT-based.** Every list I was ever given
— PLAN §6, the pass-1 package, the pass-2 package — was built from suites that touch the slice's
files. `dev-database-principals.test.ts` names no S01 file, so no file-based rule could ever pick it.
But a `GRANT` in a migration is not a file-local fact: it edits a global privilege set whose only
detectors are the principal-attestation suites. **The rule that would have caught it is one line: a
slice that adds a `GRANT`/`REVOKE` statement runs every suite that attests a role's privilege set.**
I ran the sweep this pass and it is 12 suites, ~11 minutes.

**My own share of it.** I ran 37 mutants across passes 1 and 2 and every one of them mutated a
function *body*, a guard, or a projection. I never once mutated a `GRANT` line — including at pass 1,
when I had `0066` open and quoted `:12` from it. A mutation campaign that only mutates logic cannot
see a privilege defect. The upgrade is mechanical: **the mutant set must include every `GRANT`,
`REVOKE` and `SECURITY DEFINER` line a migration adds.**

## What repeatedly cost tokens

| cost | wall-clock | cause | fix |
|---|---|---|---|
| The charge-6 class sweep | ~45 min of compute, 12 suites | Each attestation suite boots its own embedded Postgres. Unavoidable once; wasteful every pass. | One `tests/architecture` suite that reads the migrated privilege catalogue once and attests every role's exact set would replace most of it, and would have failed on `0066` the day it landed. |
| `registration-database.test.ts` ran 28 minutes and never produced a summary; I killed it | ~30 min | Argon2-at-production-cost inside an integration suite, on a machine already saturated by embedded Postgres instances. | It is reported UNVERIFIED with its reason. A suite that cannot finish in a review budget needs either a cost parameter for tests or an explicit "slow" tier the packet can exclude by name. |
| Attributing two sweep failures | ~12 min, 6 runs | `s7-authorization-database` (a `pg_stat_activity` lock-waiter poll) and `session-database` (`UNEXPECTED_RISK_SIGNAL_FAILURE`) both fail deterministically at head — and both fail identically with migrations 0066–0071 held out, so they are the **base's**, not this slice's. The intake baseline table never listed them, so there was no frame to compare against. | The baseline table must cover every suite a later pass might run, or the packet must say "unlisted suite ⇒ attribute by measurement". I had to invent the held-out-migrations experiment to get an answer. |
| Not paid: re-reading `product-since-p2.diff` | — | 3 files, +92/−2. I read the head. | — |

## What I nearly got wrong

1. **I nearly reported the two sweep failures as slice regressions.** They fail at head, alone,
   twice. The only honest way to attribute them without a git write was to hold the slice's six
   migrations out of `migrations/` and re-run — identical failures. Two false blocking findings on
   the last lawful pass would have become V rows for nothing.
2. **I nearly accepted the slice's own regression test as covering "the API would boot".** It covers
   the six assertions of `main.ts`'s boot `Promise.all` exactly — and stops there. `main.ts:573-576`
   runs `assertSupportDatabaseRole` twice and `assertSupportKeyCoverage` inside
   `startup.run("support-attestation")`, which is also the boot path. My probe adds them; they pass.
   Had the slice broken the support role instead of the erasure role, the new regression test would
   have been green and the API still would not start.
3. **I nearly trusted "the delete needs the predicate".** It does not: the predicate is called inside
   the `SECURITY DEFINER` body of `core.prepare_private_run_erasure`, so revoking the principal's
   direct EXECUTE cannot close the path — and the revert mutant confirms the C4 suite is 17/17 either
   way. The FIX seat got this right; I checked it rather than assuming it.

## Dead ends — do not re-derive these

- `production-database-principals` (32/32), `support-config-principals` (8/8),
  `s6-content-encryption-database` (48/48), `dev-deployment-register` (16/16), `support-shred`
  (20/20), `register-support-publication` integration (25/25), `sup-01-boundary` (11/11),
  `p2-auth-risk-database` (5/5), `p2-recovery-start-database` (2/2) are all green at `86b391a0`.
  The attestation class has exactly one member the slice ever turned red, and it is now in the gate.
- `s7-authorization-database` 11/12 and `session-database` 10/11 are the **base's** failures,
  measured with and without the slice's migrations. Do not re-attribute them to S01.
- The erasure principal's executable-function count is 20 at head, and the bound predicate is not
  among them. Do not re-measure.

## Where this packet fought me

1. **Charge 1 says "every one `apps/api/src/main.ts` runs in its start-up `Promise.all`".** That is a
   narrower set than "the API would boot", which the same charge uses as the ADDRESSED bar. Two role
   assertions run at `:573-576`, outside the `Promise.all`, on the same boot path. I measured both
   readings. The charge should name the boot path, not one statement.
2. **Charge 6 asks me to name every suite that "migrates the whole migrations directory under the
   real roles" and was not in the slice list.** "Under the real roles" has no mechanical test: 84
   files call `migrate(`, and role usage ranges from `SET ROLE` to a provisioned LOGIN catalogue. I
   defined the class as *migrates **and** attests a role's privileges* (via a boot assertion helper,
   `has_function_privilege`, or a principal provisioner) and named the 12 members. A packet that
   wants a mechanical sweep should give the grep.
3. **Packet line 8 is right this time** — "comment cursor at dispatch: 1 comment" matched the ticket.
   The defect I filed at passes 1 and 2 is fixed.
4. **No stack, no container** was clear and I obeyed it; the whole pass ran in-process.

## Upgrades, ranked by tokens saved

1. **A slice that adds a `GRANT` or `REVOKE` runs the privilege-attestation suites.** One rule in the
   PLAN's verification list. It would have cost nothing and saved the entire live FIX node, this
   whole pass, and V's failed launch.
2. **The mutant set includes every `GRANT`/`REVOKE`/`SECURITY DEFINER` line a migration adds.** My 37
   mutants across two passes never touched one. This is the gap that let a privilege defect survive
   a three-lens PASS.
3. **`run-suites.sh`: `0 passed && 0 failed`, or any skipped test, ⇒ `BROKEN`.** Third pass, third
   time I have raised it; it is now in packets as prose instead of in the file as an `if`. The
   `NO_SUMMARY` line in my own sweep is the same shape.
4. **The baseline table covers every suite, or the packet says "unlisted ⇒ attribute by
   measurement".** Two suites cost me 12 minutes and an invented experiment because no frame existed.
5. **A slow tier for suites that cannot finish in a review budget**, named in the packet, so a seat
   does not burn 30 minutes discovering it.

## Toward the one-prompt machine

Across three passes this lens produced four blocking findings, two non-blocking ones, and confirmed
one live fix — and the single most expensive defect of the mission, the one that actually stopped the
product, was invisible to every one of them because it lived in a `GRANT` line and every list, every
trace row and every mutant was about logic. The loop is now good at asking "does this code do what
the requirement says?". It is not yet asking "what global facts did this migration change, and who
attests them?". Those two questions, both mechanical, both greppable, are the remaining distance. Add
them to the PLAN's verification list and to the mutant set, and the review seat has nothing left to
discover by intuition.
