# Self-report — seat REV-S02-p2-correctness-tests · node REV(S02) pass 2, lens correctness/tests · ticket `t_1a0293cc` · 2026-09-12

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Wall clock 13:12 → 13:38 EEST (~26 min). Nothing was blocked; nothing was retried for a harness
reason. This is the cheapest REV pass this mission has run, and §1 says why — so that the reason is
copied forward rather than re-discovered.

---

## 1. What made this pass cheap, and must be kept

**CAUSE: the packet stamped a CONCRETE `<previous>..<latest>` freeze pair and named the trap in the
same sentence.** At pass 1 the same line pointed at a COMMON.md row that carried no pair for S02 and
omitted the cwd-relative-pathspec trap; I burned a round trip on an empty `git ls-tree` and nearly
dated a pre-existing failure on a git artefact instead of on evidence (pass-1 N7, `t_512afe29`).
At pass 2 the command ran first time. **Price of the pass-1 version: one wrong round trip plus the
mutant (M13) I had to invent to recover. Price of the pass-2 version: zero.** Keep the rule: *a packet
never points at a row; it stamps the value at write time.*

**CAUSE: the review package was a DELTA, not a re-issue.** `S02-p2/README.md` carried the range, the
three FIX handoffs, the re-verification and — the load-bearing part — *every promoted probe with the
outcome it PRODUCES at this head, explicitly separated from what its header predicted*. That one
sentence saved me from mis-reading my own pass-1 slice probe: it fails at this head (`1 failed |
6 passed`), and the failure is my own case that pinned the pre-fix `TypeError`. Without the README's
warning I would have spent a cycle deciding whether a red probe was a regression. **Upgrade to make
permanent: a promoted probe's expected outcome belongs in the PACKAGE at the current head, never only
in the probe's own header — headers go stale one commit later and the fleet keeps quoting them.**

**CAUSE: the three FIX seats each shipped a class sweep with member-by-member outcomes.** I could
check them mechanically instead of reconstructing them. Every one of the seven B1 members was
re-measurable in two commands.

---

## 2. What cost tokens, and the fix

**(a) The cluster commands are not in this pass's package.** They live in `S02-p1/cluster-map-PLAN-section-5.md`,
reachable only through a parenthetical in the p2 README ("the pass-1 package holds everything
unchanged (the cluster map, …)"). Charge 2(5) says "every cluster command three times" without naming
one. **Price: two file reads and a grep (~4k tokens) to recover four command lines that fit in four
lines of the packet.** *Upgrade: a REV packet's charge that says "run every cluster command" must
carry the commands verbatim. They are four lines. They are also the thing most likely to be mistyped.*

**(b) The "fourth pair" pointer is a name that exists nowhere.** Charge 2(1) said to run "the fourth
pair **the probe's header names**"; the header (mine, from pass 1) says only "the fourth suite" and
names no file. I recovered the two files from my own pass-1 artifact and the F1 handoff. **Price: two
reads (~3k tokens).** This is my defect, inherited by the packet. *Upgrade, and it is mechanical: a
packet-check rule — if a packet says "the X that Y names", grep Y for the name before dispatch.* I
repaired the artifact end: the promoted strict detector now names both files, the command and the
measured outcome.

**(c) Reading the two other lenses' pass-1 artifacts to recover two mutants (product M6, M14).**
Necessary and correctly authorised, but the mutant definitions are three lines of code buried in
900 lines of prose across two files. **Price: ~12k tokens of reading for six lines of mutant.**
*Upgrade with real leverage: every REV lens should promote its mutants as a RUNNABLE script under
`probes/`, not as table rows in prose. The next pass then runs `zsh probes/<seat>--mutants.sh` and the
whole refutation matrix reproduces in one command.* I did this for mine
(`REV-S02-p2-correctness-tests--mutant-r2-alias-evasion.sh`); pass 1's product and correctness matrices
are still prose, and that is why re-running them costs a read instead of a run.

**(d) Nothing else.** No harness failure, no flake, no port collision, no `pkill`, no restore that
did not come back byte-equal on the first try.

---

## 3. What I NEARLY got wrong

**I nearly reported the alias gap (N1) as BLOCKING.** Charge 4 says "a FIX that closed the sample and
not the class is a B", and my first reading was that M20/M21 are the same class as pass-1 N1. They are
not: the ticketed class was *line-locality*, and M9b/M15/M6 prove line-locality is gone. M20/M21
survive through a different mechanism — the remedy's new binding to the literal token
`PLAN_TIER_ROSTERS`. Calling that "the class still open" would have spent a whole pass-3 FIX+REV cycle
on a mis-tiering. **The discipline that saved it: re-read the ticket's own words for the class before
deciding whether a survivor is inside it.** I recommend that sentence go into `heartbeat-reviewer` §5,
because "is this survivor in the ticketed class or is it a new one?" is the single question that
decides whether a mission runs another pass.

**I nearly let the F1 fix pass on the authors' parameters.** Both guards were green, both had pinning
tests, both mutants (M22/M23) went red when reverted — that is already more evidence than most fixes
carry. The refutation duty is what produced the only genuinely new thing in this pass: F1 answers one
question ("is 0061 applied?") with **two different oracles** — `information_schema` for the column,
`pg_get_functiondef` text-matching for the function. Nobody had built the states where they disagree,
because the migration moves both at once. Building them found the silent tier drop that is now V's row.
**Rule worth promoting: when a fix introduces a capability CHECK, the review's job is to find the state
where the check and the capability disagree — not to re-run the check.**

---

## 4. Dead ends, so nobody re-derives them

1. **The obs-capture registry is not a refusal-code vocabulary.** `ASK_PLAN_TIER_INVALID` is
   unregistered; so are four sibling ask-path codes. ARCH-REV(S02) p1 measured this
   (`reviews/ARCH-REV-S02-p1.md:334-343`) and I re-confirmed by grep. **Do not open this again.**
2. **`packages/db/src/schema.ts` is not a production read path.** It declares `plan_tier` but is
   imported by nine test files and nothing else, so no production SELECT can inherit the column. I
   checked because a drizzle `select()` would expand to all columns and would have been an eighth
   member of B1's class. It is not one.
3. **Cell B of my half-applied probe (column dropped, 0061 function kept) is unreachable.**
   `migrate()` only applies forward and the repo has no down-migration, so "partial rollback" is not a
   state any supported operation produces. It errors with `RUN_CONTENT_ROLLBACK_INCOMPLETE`; that is a
   curiosity, not a defect, and I did not price it.
4. **The `evaluator-database` re-fixture is not vacuous a second time.** `resolvedPanel` is
   initialised to `[]` at `tests/integration/evaluator-database.test.ts:1353`, which looks like the
   same vacuity trap B2 was about — but the surrounding case cannot reach its assertion unless
   admission succeeded, which requires a complete roster, which requires the panel to be non-empty.
   The two-cell mutant proves the sensitivity directly. A one-line `expect(resolvedPanel.length)
   .toBeGreaterThan(0)` would make it local instead of inferred; that is a nicety, not a finding.

---

## 5. How to make this more of a one-prompt machine

Three changes, in the order I would make them.

1. **Promote matrices as scripts, not as tables.** (§2c.) Every mutant a lens runs should leave a
   runnable cell behind. The mission already promotes probes; mutants are the half that is still
   prose, and they are the expensive half to reconstruct. Measured effect on this pass: the mutants I
   could RUN (the security lens's two-cell evaluator probe) cost one command; the mutants I had to
   READ cost ~12k tokens and a judgement call about what the author meant.
2. **Make the packet's charges self-contained at the command level.** Every charge that says "run X"
   carries X verbatim; every charge that says "the N that M names" is packet-checked by grepping M.
   Both of this pass's costs (§2a, §2b) are exactly this rule not being enforced, and both are
   mechanical to enforce in `packet-check.sh`.
3. **Give every green marker a full acceptance condition.** `t_35e0669f` — my pass-1 detector printed
   "B1 ABSENT" on `hits == 0` alone and would have called a 46/76 run green. A FIX seat caught it, not
   me. The general rule is the one `heartbeat-protocol` §3.6 already states for suites (`passed/total`,
   every failure named) and it should bind **scripts** too: a probe's exit status must assert the
   whole shape it claims — rc, file count, test count, and the specific signal — or exit INCONCLUSIVE.
   I rebuilt mine that way (`…-pre-0061-schema-strict.sh`), and the three-state exit (0 / 1 / 2) is
   what makes it safe for the orchestrator to quote.

**Where THIS packet fought me:** only §2a and §2b, and both are shortfalls of *inclusion*, not of
correctness — every constant in it held under re-measurement, which is not something I could write
about the pass-1 packet. The parenthetical at line 10 that explains the pathspec trap is the single
best line in any packet I have read on this mission: it names the trap, the wrong spelling, the
symptom ("returns an EMPTY diff that reads as unchanged") and the fix, in one sentence, at the point
of use. That shape should be the template for every trap the fleet keeps re-hitting.

**One recurring cost nobody owns yet:** the promoted-probe directory is SHARED across blind lenses, so
`ls`-ing it while promoting my own files printed the sibling lens's filenames — the same disclosure I
had to record at pass 1. Blindness survives it (I opened nothing, and §8's predictions were written
first), but it is a structural leak that a per-seat subdirectory would close for free.
