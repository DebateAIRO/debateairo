READY FOR PEER REVIEW · comments read through: v-rulings-2026-09-03

# SELF-REPORT — cont-t14-w1-fixed-grader · BUILD(CONT-T14) · W1 (V-S11-GRADER)

commit=39b2b46dbbab93b007b96f5ab875463f547685f2 · base=a87dc60b2cd861dc781c6334aa11c2252eb8761c
branch=mission/2026-09-16-algorithm-live-loop-continuation · model=claude-opus-5 · pass 1 of 3

Answering V verbatim: *"treat it like a murder case. I want to get a nice report on what can be done
better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more
efficient. How can we turn this into a one prompt machine even better."*

---

## 1. The murder: what actually killed the old grader logic

The corpse was not a bug. Every line of the complement ranking was correct code, carefully argued,
with a doc comment explaining the ranking and a test pinning each tier. It was killed by a PREMISE
that nobody had ever stated as a premise: *a candidate's own identity must be excluded from
grading*. That premise entered through the goal's matrix text ("2 graders that are never the
candidate"), was never separated from the numbers next to it, and then generated three rounds of
increasingly sophisticated work — exclusion, exhaustion, repeat-before-candidate, the reserved
disjoint pool (F-S11-5) — all solving a problem this architecture does not have.

**The cause, stated once:** an unexamined premise inherited from spec PROSE produced real
engineering, and the engineering's quality made the premise harder to see, not easier. The
complement ranking's own doc comment even confessed the damage ("Preferring the complement makes
grader identity a function of the arm, which is a CONFOUND") and then routed around it with a
comparability verdict instead of treating the confession as a refutation of the premise.

**What to upgrade:** when a module documents a defect it is deliberately NOT fixing, that comment
should generate a ticket automatically, not a workaround. `assessComparability` existed only to
detect damage that the seating logic was choosing to cause. A seat writing "this does not fix X"
has found X; the note is evidence, not absolution.

## 2. What repeatedly cost tokens, priced

| # | Cost | What | Price |
|---|---|---|---|
| 1 | **Largest** | Every out-of-band file restore (`cp backup orig`) made the harness echo the restored 1089-line file back into context: ~150 visible lines + "1004 lines truncated" notice, FOUR times during the mutant campaign. | ~4 × 8–10 KB of pure re-read, for information I already had. Easily the biggest single waste of the task. |
| 2 | High | Reading both surfaces in full: `eval-harness.ts` (1089 lines) + `t15-eval-harness.test.ts` (899 lines). Unavoidable and correct — the change touched 12 of ~20 exported symbols — but it is 2/3 of the task's input. | ~25 KB, justified. |
| 3 | Medium | Three of my own expectations were wrong on first GREEN (mark sets), costing two extra suite runs + two correction edits. Cause: I predicted the mark set from the RULE instead of measuring the FIXTURE. The sealed three put claude-cli in C1's evaluator seat and C2/C3's synthesizer seat, so `GRADER-SHARES-CANDIDATE-FAMILY` and `GRADER-IS-CANDIDATE-SYNTHESIZER` fire and `MODEL-IDENTITY-UNKNOWN` does NOT. | 2 runs, ~3 KB. |
| 4 | Low | The sandbox refused two `bash` heredocs as "too complex to verify" (a multi-file `sed -n` loop and a `cat >> file <<EOF`). Fell back to `Write`/`Edit`. | 2 calls. |
| 5 | Low | `git status --porcelain` from `dialectical-engine/` prints paths as `dialectical-engine/...` (repo-root-relative) — harmless here, but it is the same shape as the recorded pathspec trap and costs a double-take every time. | seconds |

**Fix for #1, and it is the cheapest win available:** restore mutants with a command whose output
the harness does not echo, or better, give seats a `mutate --revert` that reports only the checksum.
A byte-identical restore is a NO-OP for the reader; echoing the whole file to prove it is like
reprinting a book to prove it was put back on the shelf. Four restores in one task is normal for
the refutation duty, so this tax is paid by every worker seat, every time.

## 3. What I nearly got wrong (the near-miss that matters)

**`gradersPerCell`: 2 → 1 is an INFERENCE, not a quotation, and it is the one judgment a reviewer
should attack first.** The ticket says "take ONE configured grader and use it for every arm" — that
is unambiguous about grader IDENTITY across arms, and silent about how many SEATS a cell gets. Two
readings survive it:

- **(a)** one identity, one seat per cell → 15 grader calls (what I shipped);
- **(b)** one identity, still two seats per cell → 30 grader calls, both seats the same model.

I chose (a) on one decisive piece of evidence: the brief's Step 2 says *"the projection printed
before the approval gate reflects the NEW call count"*. Under (b) the count does not change at all,
and that sentence would be empty. Reading (b) also resurrects `GRADER-REPEATS-IDENTITY` on every
single cell, marking the ruling's own blessed configuration as degraded, which cannot be right.
**If V meant (b), one constant changes and the tests follow; nothing structural is wrong.** I am
flagging it here rather than burying it because it is the only place where I supplied a number V
did not.

Second near-miss: I almost kept `BLIND-GRADING-DEGRADED` alive "to be safe". That would have shipped
a mark literally named DEGRADED firing on the exact configuration V just legitimised — a false alarm
to V is worse than a missing mark, because it teaches the reader to ignore marks.

## 4. Dead ends, recorded so nobody re-derives them

- **Making the non-commensurability mark fire on `!comparability.comparable`** (the old rule). It
  cannot work: a single-arm deployment is "not a comparison" while still having one grader on every
  arm, so the mark would fire on a healthy deployment. The mark must key on *did one grader cover
  every arm*, and the "single arm" case must be carried by the VERDICT's reason string alone.
- **Resolving the fixed grader inside `assignBlindGraders`.** It produces identical behaviour today
  and is strictly worse: a later edit could reintroduce candidate-dependence without changing any
  signature. Resolving it at run level, in a function that takes NO candidate, makes "fixed across
  arms" structural rather than incidental — and it is what made mutant m1 (a second grader for one
  arm) an obviously artificial edit rather than a plausible one.
- **Renaming `gradersPerCell`.** Tempting for clarity; it would have dragged `eval-harness-cli.ts`
  (outside my write surface) into the diff for zero behavioural gain.

## 5. Where the packet was unclear or wrong

1. **PACKET DEFECT (real, would have produced a false green).** The verification line says
   "`pnpm run typecheck` gains no diagnostic". That command is `tsc --noEmit` on the ROOT tsconfig,
   whose `include` list does not contain `acceptance/` — the very directory holding the module I was
   charged to change. `TOOLING-TRAPS.md:1239` records this exactly. Taken as written, the typecheck
   gate would have been blind to 100% of my product diff. I ran `pnpm exec tsc --noEmit -p
   acceptance/tsconfig.json` as well; both are 0 errors at base and at tip. **Every future packet
   touching `acceptance/` must name BOTH projects.**
2. **Ambiguity, not defect:** "zero graders → the non-commensurability mark and a refusal to
   project (rejected)". "Project" is overloaded in this module — the call-count projection is
   printed on EVERY path by design (the DoD row), so it cannot mean that. I read it as "refuses to
   project a ranking/verdict onto the roles", which is what the harness does: it refuses, emits the
   mark, and the table renders no mean. If the intent was the call-count projection, the DoD row and
   this boundary contradict each other and V has to settle it.
3. **Under-specified:** the packet names the mutants but not their revert discipline. `TOOLING-TRAPS
   .md:4854` ("revert from a byte-identical BACKUP, never by reverse substitution") is the rule I
   followed; it should be in the packet's verification block, not discoverable only by reading traps.
4. **Everything the packet ASSERTED was true:** base commit `a87dc60b`, the DECISIONS range
   2828–2862, `node_modules/.bin/vitest`, `packages/contract/generated/`, the read-surface greps.
   No constant had to be disputed. That is worth saying, because it is not always the case.

## 6. How to make this more of a one-prompt machine

1. **Give the packet a MEASUREMENT BLOCK instead of prose predictions.** Three of my five wasted
   runs came from predicting fixture-dependent values (which marks fire for which arm). A packet
   that says "run this one command and paste the mark set BEFORE you write an expectation" would
   have removed all three. The rule generalises: *never write an expected value for a derived
   collection until you have printed the actual one on the base.*
2. **Ship a `who-reads-this-string` tool.** I ran 17 greps by hand and hand-summarised them into a
   per-file table. It is the same script every time: literal → `grep -rn` over four globs → group by
   file → "these files are now in your gate". Ten lines of shell, run once per literal, would make
   the binding step mechanical instead of a source of hand-rolled variation. It would also have
   answered the new-emission limb (`FIXED GRADER:` joins `emitted` and `table`) without me
   reasoning about which collections are pinned with `toEqual`.
3. **Make "one gate script, one log per run" the harness's job, not the seat's.** I wrote a 40-line
   zsh runner (refuses to overwrite a log, greps the summary lines, flags `No test files found` as
   BROKEN) before doing any work. Every worker seat writes that script again. It belongs in
   `tools/`, parameterised by the cluster command.
4. **Put the ruling's TEXT in the packet, not its citation.** I spent a read on `DECISIONS.md`
   2828–2862 to learn what V actually said. The ticket paraphrased it; the paraphrase was faithful,
   but I could not know that without the original. For a ticket whose whole content is "implement
   this ruling", inlining the ruling's 10 decisive lines is cheaper than the round trip and removes
   the risk of implementing a paraphrase.
5. **Separate SPEC-QUOTED constants from RULING-OVERRIDDEN ones in the code itself.**
   `EVAL_HARNESS_MATRIX` held four numbers that looked equally frozen; one of them was V's to move
   and three were not. A reader could not tell which without the doc comment. A shape like
   `{ fromGoal: {...}, fromRuling: {...} }` would make the override visible at the call site — and
   would have made this entire ticket a one-line diff plus its disclosure.

## 7. Findings raised for tickets (§3.2 — every finding gets one)

- **F-W1-1 (out of contract, not fixed here).** No register row nominates a grader identity. The
  harness must therefore CHOOSE one (`resolveFixedGrader`: sorted-first configured ref). That choice
  is deterministic and candidate-independent, but it is a harness policy standing in for a
  deployment decision. A sealed `graderRoleRef` belongs in the register (S01/T16's surface,
  explicitly forbidden to me). Until it exists, a deployment cannot say which of its identities it
  wants grading, and the answer changes if it adds an alphabetically earlier ref.
  File: `acceptance/eval-harness.ts:423-437` (`resolveFixedGrader`).
- **F-W1-2 (minor).** `assignBlindGraders` validates `gradersPerCell` through the shared
  `requirePositiveInteger`, so a zero raises `EVAL_PROJECTION_INPUT_INVALID` — a projection code
  from a seating function. Loud and correct, but the code name misdescribes the site.
  File: `acceptance/eval-harness.ts:458`.
- **F-W1-3 (documentation drift, not fixed here).** `acceptance/README.md` and the S11 slice files
  were not read and may still describe the two-grader matrix and the four-identity requirement.
  Outside my contract; needs a sweep before S11 closes.

## 8. Honest limits of this report

No provider call was made and none was authorized (V-S11-3). Everything above rests on fakes, the
printed projection, and the unit suite; nothing here is evidence about a live grading run. The
integration and acceptance suites run on this host (DR-121) but were not part of this cluster's
command, so I make no claim about them.
