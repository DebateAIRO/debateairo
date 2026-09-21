# SELF-REPORT — REQ-REV-03 · mission `free-public-debates` · node REQ-REV, pass 3 (cap)

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REQ-REV-03, grok-4.6, same CLI session as p1/p2 (`01a0bfd1-bd51-74e0-889e-755d7371a709`) resumed under caffeinate. Wall clock CLAIM to verdict: ~15 minutes. Skills actually loaded this pass: using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion, receiving-code-review, systematic-debugging.

---

## 1. The body: cause, not symptom

**CAUSE of the blocking finding: a walk was extended by inserting new steps, and the later step's arithmetic was not re-derived.** 3b/3c add a second published Free debate so V can prove V-10 on the other route. Step 11's total was rewritten to "plus 1 because free_run2 is still public". Step 4, which now runs *after* 3c, was left at "plus 1". The class is the same as pass-1 B3 (an expected number the preceding steps have already made false). The checker pins 3b, 3c, 11b by body text and does not pin any `total`. So the one number V will actually compare is the one assertion that can silently rot.

**CAUSE of the remaining token leak: charge 3's product read is the right job, and it is still cheaper than re-reading SPEC-v3.** `git show db4758da:…/index.ts` + `grep AnswerSchema.parse(` is one command and decides P-B2's table. I still read 485 lines of SPEC-v3 because the walk bug is not in §1. A pass-3 packet that said "diff SPEC-v2 SPEC-v3 and walk every changed numbered step as a stranger" would have found B1-p3 in five minutes without the union file or the intake.

**The checker upgrade from p2 worked.** N3-p2 was "R-26 PASSES". This checker FAILs an R-26 mutant. That is the one-prompt move from last pass, delivered. It still does not pin walk arithmetic.

**Lane vs mission-home line numbers.** SPEC pins `db4758da` send site `:1115` for `GET /v1/runs/{id}/answer`. Mission-home `integration/all` has that parse at `:1101`. A seat that greps the packet cwd instead of `git show db4758da` will say the table is stale. The SPEC named the commit. Charge 3 named the command. Follow the command.

## 2. What I nearly got wrong

1. **I nearly PASSed.** P-B2/S-N7/C-B1 are closed as definitions. The checker is green. R-26 dies. The temptation is "pass 3, fold the rest". Step 4 is the step a stranger cannot mark done. That was the p1 blocking class. Calling it N because the fix is one word ("plus 2") would have shipped an acceptance V fails in person. Price avoided: V's veto on a green slice.

2. **I nearly used `git -C …/fpd-s01/dialectical-engine`. ** COMMON's lane row includes the inner `dialectical-engine`. This packet's `git -C …/fpd-s01 show db4758da:dialectical-engine/…` is the one that runs. FIX-03 burned one command on the mix. I copied the packet's command.

3. **I nearly filed PLAN.md:316 as blocking.** C2-S3.3 still scans email. The v3 trace row *says* that step does not execute the snapshot builder and opens a FIX-A step. Stale body, named. Coder follows SPEC-v3. Charge 5: coder-closable is N.

## 3. Dead ends — do not re-derive

- `AnswerSchema.parse(` count on mission-home index.ts is 2, same as the lane, at different line numbers. Do not "fix" the SPEC's `:1115` from the packet cwd. It is the lane commit.
- UNION.md in full. The three assigned rows are the job. The rest is "named, not fixed" and DECISIONS §29 already lists the knock-ons. I used the three rows + P-B2's file:line (`index.ts:996-1008`) to know which handler to show.
- Re-running spec-v2-check.sh. spec-v3-check.sh carries those assertions forward. One checker.

## 4. Where THIS packet was unclear — exactly

- **Charge 1 `git diff 5ffdfa13..22d115bc` from mission home.** It runs and is the right floor. It includes PLAN.md and PROGRESS.md. The scoped job is SPEC-v3 + the three findings. I used the diff to see they did not touch C2-S3.3's body.
- **Charge 2 "a COPY's worth of attacks from your probe directory".** spec-v3-check.sh computes `REPO` from `HERE`. Copying the script into `probes/REQ-REV-03/` breaks the repo-facts block. I ran the checker in place (it only prints stdout; it does not tee into itself) and wrote mutants + output under the probe dir. The packet should say: mutants live in probes/; invoke the checker with `$1=$mutant` from slices/S01.
- **Charge 3 "handlers whose path contains /answer".** That also matches `/answers` and the POST investigation/unlink routes. The predicate (`AnswerSchema.parse`) is the filter; the path glob is not. I grepped parse sites first, then confirmed the extras do not parse AnswerSchema. Packets should say "send sites of AnswerSchema.parse, then the /answers family for exclusions".

## 5. Upgrades, ranked by tokens saved

1. **Walk arithmetic as a checker assertion.** After inserting 3b/3c, `total` at step 4 must equal `published free debates still in the list`. One Python count over the walk would have FAILed SPEC-v3 the way R-26 now fails. *Saves:* this B1-p3 V row, or V failing the walk.
2. **Pass-3 packet = (1) diff old SPEC new SPEC (2) walk every changed numbered step (3) run the handed-forward checker on the new file and on one mutant per assigned finding.** I did extra union/intake/PLAN reading the floor demanded. *Saves:* ~8 minutes and a 50-row UNION.
3. **Pin send sites to a commit, as SPEC-v3 already does, and make the checker `git show` that commit** instead of grepping packet-cwd `index.ts`. Mission-home `:1101` vs lane `:1115` is a false stale-cite waiting to happen. *Saves:* a pass that "corrects" a correct line.
4. **Keep the R-26 assertion.** It worked. Do not drop it on the next SPEC version.

## 6. Price of this pass

- Wall clock: ~15 minutes.
- Tokens: SPEC-v3 once, the two answer handlers at `db4758da`, the checker + three mutants. The walk re-read found B1-p3; the checker did not.
- Retries: zero on the checker; one on `git -C` path (used the packet's form first, it ran).
- Pass 3 cap: the blocking finding is a V row with a one-sentence default (step 4 total plus 2, or move 3b/3c after step 4). P-B2's definition is buildable. S-N7 and the C-B1 oracle are buildable. FIX-A can code against SPEC-v3 today if V takes the default.

The one-prompt machine, this pass: a checker that fails walk totals the way it now fails extra R-ids, and a packet that says "diff the SPEC, walk the changed steps, run the checker". Everything else was already in the freeze.
