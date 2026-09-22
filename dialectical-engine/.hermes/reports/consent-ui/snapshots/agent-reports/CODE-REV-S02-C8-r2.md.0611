# CODE-REV-S02-C8-r2 — self-report (mission `consent-ui`, slice S02, cluster C8, review round 2 of max 3)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer,
superpowers:verification-before-completion, superpowers:systematic-debugging,
superpowers:receiving-code-review`

All six loaded in THIS session (COMMON §10.9), in that order, before any probe.
`receiving-code-review` is loaded because COMMON §10.39 binds it on any seat whose packet carries a
prior verdict's numbered findings as requirements — mine carries my own r1 B1/N1/N2 — and because
the author offered a REFINEMENT of my r1 root cause, which is a partial contest and had to be
verified rather than accepted (it survived: §2 below).
*predecessor session (CODE-REV-S02-C8 r1) loaded:* using-superpowers, heartbeat-protocol,
heartbeat-reviewer, verification-before-completion, systematic-debugging.

Seat CODE-REV-S02-C8-R2 · Opus 5 · fresh blind session · review ticket `t_117e6627` · work under
review `t_ee948194`, commit `0dc569e9` on `slice/consent-s02-css`, parent `a035f814` · worktree
`.worktrees/rev-s02-c8-r2/dialectical-engine`, detached at `0dc569e9`, `git status --porcelain`
**0 entries at CLAIM and at handoff** · `pnpm run generate:contract` exit 0 ·
**verdict: PASS with two non-blocking findings.**

> *treat it like a murder case. I want to get a nice report on what can be done better. What we must
> upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we
> turn this into a one prompt machine even better.*

---

## 1. Named causes, each with its price

### C1 — A promoted probe kit is a SNAPSHOT of a tree, and two of its ten mutants silently stopped applying (~14 min, one near-miss verdict)

My r1 ten-mutant battery is promoted at
`.hermes/reports/consent-ui/probes/code-rev-s02-c8-r1-rev-c8-mutants.sh`. Re-run at `0dc569e9`
it reported:

```
ANCHOR NOT UNIQUE (0) for '.authCard {\n  position: relative;'
M4 transform on .authCard (S02-S65) | MUTANT NOT APPLIED (anchor)
ANCHOR NOT UNIQUE (6) for '  background: var(--gold);'
M10 colour literal inside the block | MUTANT NOT APPLIED (anchor)
```

Eight of ten landed and were caught. **The two that did not are the two whose anchors were never
valid against this file**: `.authCard {` is followed by `width: 540px;` (`globals.css:721-722`), and
`  background: var(--gold);` occurs **six** times in `globals.css`. The r1 verdict's table records
M4 and M10 as CAUGHT — that claim rests on a version of the script that is not the promoted one.

**Price:** ~14 min to notice, diagnose and rebuild both mutants with correct anchors (R9 and R10 in
my r2 battery — both CAUGHT, so the r1 *conclusion* survives; only its *provenance* was broken).
**The near-miss is the interesting part:** the script prints `MUTANT NOT APPLIED` and keeps going
with exit 0. A reviewer skimming for `CAUGHT` sees eight and moves on. **A promotion step that does
not re-run the kit against the tree it is promoted from cannot tell a passing mutant from an
unapplied one.**

**Upgrade (one line of shell):** every mutant runner ends with
`echo "applied=$applied/$total"; [ "$applied" -eq "$total" ] || exit 3`. An unapplied mutant becomes
a non-zero exit instead of a line in the middle of a long capture. Second upgrade: COMMON §10.35
already says a promoted kit takes its lane from `argv`; it should also say **the promoting seat
re-runs the kit once from the probes directory and pastes the exit code**, which is what would have
caught this at r1 promotion time for the cost of one command.

### C2 — The extra edit that discharges a class can quietly trade precision for readability (~20 min to price, one N-finding)

The rework implemented my r1 "remedy 5" (make the ladder execute). Doing so it rewrote S02-S64's
*pinned* assertion from "filter the exact float, then format" to "format with `toFixed(2)`, then
parse the string, then filter". That is a real weakening: a true ratio in `[4.495, 4.5)` now formats
to `"4.50"` and escapes the `< 4.5` filter.

I did not stop at "that looks risky". I enumerated every ratio reachable from any declarable alpha
(`composite()` rounds each channel, so the ratio is a step function — 613 distinct values in
Terracotta, 643 in Chamber) and then swept 200,000 alphas comparing the two forms:

```
Terracotta blind window [4.495,4.5): (none reachable)
Chamber    blind window: alpha in [0.478366, 0.480487] -> true ratio 4.498360 -> formats "4.50"
alphas where the REPORTED ARRAY differs: 424 / 200000   e.g. alpha 0.47837 before=[Terracotta+Chamber] after=[Terracotta]
alphas where the ASSERTION FLIPS fail->pass:  0 — NONE
```

**So it misreports, and can never mis-verdict.** That is exactly the difference between a B and an N,
and it is only knowable by measurement. **Price: ~20 min.** Worth every minute: without the sweep I
would have had to write either "possible weakening, unquantified" (useless to the author) or
"blocking" (wrong, and a round of nobody's time).

**The general lesson, and it is the same one this whole cluster keeps teaching:** *a guard that
compares a FORMATTED number instead of the number it measured has silently changed its own
threshold.* B1 was a formatted number that disagreed with the arithmetic; N1 here is a formatted
number standing in for the comparison. Same family, two rounds running.

### C3 — A `path:line` measured mid-round and reported as the final state (~4 min, one N-finding)

The handoff's N2 section reads `copies of the gate-hint comment: 1 at globals.css:7583`. At
`0dc569e9` it is at **`:7586`**; `:7583` is the `a035f814` number, and the three-line difference is
the B1 comment edit the same commit made *above* it. The seat almost certainly ran the grep after
N2 and before B1. COMMON §10.24's 2026-09-07 addendum names this exactly — never lift a `path:line`
from captured output, because the number describes whatever tree produced it.

**Price to me: ~4 min** (one `grep -n` at HEAD and one at `a035f814`). **Price if unchecked: the
next seat that opens `:7583` lands three lines inside the `.70` comment.** The self-report's
postscript says "every other number in mine is pasted beside its output" — this one was, just from
the wrong tree, which is the harder version of the same defect and the reason it survived a seat
that spent the whole round on precisely this class.

### C4 — The forbidden count prediction survived two packets and one acknowledgement (~0 min to find, 1 round of class-life)

COMMON §10.42 forbids a packet predicting a count over the seat's tests. The rework packet §2.4 said
"the count rises by one — you say what moved"; the seat filed it as P1; the orchestrator
acknowledged it in the handoff-consumed comment. **My own round-2 packet §4 then says "the cluster
command ×3 … the count rises by one (9)"** — the same violation, in the packet written after the
acknowledgement, now carrying the answer as well as the prediction. Cost this round: nothing (I
measured 8 → 9 myself). Cost as a class: it is the third packet in a row to state it.

**Upgrade:** §10.42 is a rule nobody can enforce by reading, because the sentence looks helpful. Make
it mechanical — a pre-dispatch grep over every packet for `count rises|count goes|Tests [0-9]+ passed`
outside a fenced block, exactly like the ADR-number grep in §10.23.

---

## 2. What I nearly got wrong

1. **I nearly accepted the author's root-cause refinement without running it.** They said my
   `Math.round(96.5)=97` vs `Math.floor(96.5)=96` named the outcome but not the mechanism, and that
   the mechanism is the *spelling* of `1 − α`. That is a partial contest of my own r1 analysis, and
   the comfortable move is to nod. Ran it instead:
   `1 - 0.7 = 0.30000000000000004` → `0.7*38 + (1-0.7)*233 = 96.5` (an exact tie, `round` → 97);
   `0.7*38 + 0.30*233 = 96.49999999999999` (`round` → 96 = `floor` → 96). And at `.65`, both
   spellings give `106.25` → 106, which is *why* the pinned rung reproduced for everyone.
   **The refinement is correct and strictly deeper than mine.** Recorded because a reviewer who
   waves through a refinement of their own finding is reviewing their own homework backwards.
2. **I nearly reported the prefix-byte figure as a contradiction between three seats.** The
   orchestrator says 164,624, the author and my own r1 say 164,623. Both are right: 164,623 is
   `head -n 7222` (the last line that existed at base `511d30b6`) and 164,624 is `head -n 7223`
   (which includes the blank separator line the *append itself* introduced). I measured both cuts at
   all three commits before writing a word. **A "disagreement" between two measurements that never
   named their cut is not a disagreement.**
3. **I nearly FILED a wrong finding — the one thing a reviewer must not do.** Having found the stale
   `globals.css:7583`, I swept the handoff's other citations and drafted
   "`SignUpFlow.tsx:206`/`:217` are also off by one — the `<input>` opens at `:205`/`:216`". It was
   already written into the verdict file. Then I ran the grep I should have run first:
   `grep -n 'className="consentBox"' apps/ui/components/SignUpFlow.tsx` → `206`, `217`. **The seat
   cites each control at the line carrying its className, consistently across both components, and
   my "correction" was the error.** Withdrawn in the verdict *in the open*, with the command, rather
   than deleted quietly. The lesson is unpleasant and exact: **once you have found one member of a
   class, the next candidate looks like a member before you measure it.** A confirmed finding raises,
   not lowers, the evidentiary bar for the next one in the same sweep.
4. **I nearly counted duplicate top-level selectors with a parser that includes the preceding
   comment in the prelude** — which would have reported "0 duplicates" for the wrong reason
   (two identical selectors with different comments above them compare unequal). Caught it because
   my rule count (45) did not decompose the way the at-rules said it should; fell back to the r1
   `css-structure.mjs`, which strips preludes properly and reports `duplicate top-level selectors:
   (none)` over 44 rules.

---

## 3. Dead ends — do not re-derive these

1. **Do not try to make the S02-S64 ladder tolerant with `toBeCloseTo`.** The author records the
   same dead end from the other side. `toBeCloseTo(5.54, 2)` passes iff `|x − 5.54| < 0.005` and the
   value is `5.5450` — 0.00005 from its own boundary. The string form (`toFixed(2)`) is the right
   pin for the *narrated* rungs; the fix for my N1 is to keep the strings for the rungs and compare
   the raw float only in the `< 4.5` gate.
2. **Do not scan the two S02 components for focusable elements with `<(button|input)\b[^>]*>`.** The
   author's dead end, re-confirmed: arrow functions in props end the `[^>]*` run mid-tag. I derived
   the inventory with a line-oriented `grep -nE '<button|<a[ >]|<input|<select|<textarea|tabIndex|href='`
   plus a second pass for `className`, which is what a reviewer should use — it over-includes
   (`.authVerifyEmail`, `.authPrimary`, the three `<input>`s, the footer `<Link>`), and
   over-inclusion is the safe direction for an inventory.
3. **Do not use `git diff -- dialectical-engine/<path>` from inside the lane.** The git root is one
   level above the package; from `<lane>/dialectical-engine` the pathspec resolves relative to cwd,
   matches nothing, and `git diff … | grep '^@@'` prints **nothing at all** — which reads exactly
   like "no hunks", i.e. like a clean file. Cost me one silent empty capture before I noticed the
   `git diff --name-status` form (no pathspec) had printed the prefixed names a moment earlier. This
   is the pathspec sibling of the `git show <sha>:<path>` trap the author appended to TOOLING-TRAPS,
   and it fails the *same* way: a true-looking empty answer.

---

## 4. Upgrades — how this becomes more of a one-prompt machine

1. **Promotion must be a re-run, not a copy** (C1). One line in COMMON §10.26: the promoting seat
   executes the kit once from the probes directory against the reviewed commit and pastes the exit
   code beside the file list. Everything else in §10.35 already assumes the kit is runnable; nothing
   yet proves it.
2. **Mutant runners exit non-zero on an unapplied mutant** (C1). `applied != total` is a broken
   probe, not a result. This is the mutant-battery form of §10.16's satisfiability rule, and it is
   three lines of shell.
3. **A packet's `path:line` citations get a machine check, not a promise** (C3, §10.24). The
   orchestrator already runs `grep -n` to produce them; have the same script re-run every
   `path:line` in a packet at dispatch and refuse to dispatch on a miss. The failure mode is
   silent-and-plausible in every direction — past the end of a file, three lines inside a comment,
   a different tree — and no reader can spot it.
4. **`comments read through` needs a command** (the author's own postscript, and I second it with
   evidence). It is the one figure in a heartbeat handoff with no output pasted beside it, and it
   has now been wrong once in this cluster. Either `hermes kanban comment` prints `comments: <n>` on
   a successful post, or COMMON requires the cursor be pasted as command output. **The side effect
   the author names is the real prize:** a *measured* cursor forces a re-read of the thread tail, and
   that is how they found the orchestrator comment posted after their CLAIM.
5. **Reviewers should be told, in the packet, which of their own r1 remedies were BINDING and which
   were ADVISORY, and asked to rule on each.** My r2 packet did this for the three findings but was
   silent on remedy 5 until §4's last bullet; the author had to re-derive the precedence from COMMON
   §10.22 + §10.27 and filed it as packet defect P3. One line — "remedy 5: in scope" — costs nothing
   and removes a re-derivation from a coding seat's critical path.

---

## 5. Where THIS packet fought me

- **§4 says "the rule at block `:7614-7617`".** Those are **file** lines; block-relative the same
  selectors are `391-394`. This is my own r1 packet defect P1 (mixed citation origins) recurring in
  the packet written to consume my r1 verdict. Cost: one `awk` to disambiguate.
- **§4 says "four `:focus-visible` rules with `var(--focus)`".** It is **one** grouped rule with four
  selectors (`awk … | grep -c '{'` → 1). The distinction matters because my r1 N1 marked the
  *grouping* ADVISORY and the *outcome* BINDING, so a reviewer counting rules could file a false
  deviation.
- **§4 repeats the forbidden count prediction** (C4).
- **§4 orders "the three RED-at-base stylesheet suites" without naming them.** They are in the r1
  verdict and in BASELINE.md; naming them in the packet would have saved a cross-read.
- **What the packet got RIGHT and should be copied:** it named the exact reproduction to run
  ("opacity .70 in scratch → the test prints 5.54"), the exact negative control ("the case RED with
  the rule deleted in scratch"), and it pre-measured the byte figure *and said which cut it used*.
  Three orders that are impossible to satisfy by reading.

---

## 6. Evidence index (everything here is re-runnable; lane comes from `argv`)

| what | where |
|---|---|
| cluster command ×3, bash arm + inline arm | `probes/code-rev-s02-c8-r2-cluster.sh <lane>` → `…-cluster.out` |
| B1 reproduced: declared α moved across four rungs, threshold → 99 so the array prints | `probes/code-rev-s02-c8-r2-alpha-ladder.sh <lane> <scratch>` → `…-alpha-ladder.out` |
| the `1 − α` tie, checked independently | `probes/code-rev-s02-c8-r2-tie.mjs` → `…-tie.out` |
| 11 round-2 mutants (10 CATCH + 1 must-NOT-catch) | `probes/code-rev-s02-c8-r2-mutants.sh <lane> <scratch>` → `…-mutants.out` |
| the r1 ten-mutant battery re-run (and C1's two unapplied anchors) | `…-r1-mutants-rerun.out` |
| N1 RED frame with the rule deleted | `…-N1-red-frame.out` |
| N1 discharged by the probe that proved it | `probes/code-rev-s02-c8-r1-focus-coverage.mjs <lane>` → `…-focus-coverage-rerun.out` |
| B1 discharged by the probe that proved it | `probes/code-rev-s02-c8-r1-contrast-ladder.mjs <lane>` → `…-r1-contrast-probes-rerun.out` |
| N2 duplicate-comment scan, markers, colour-literal scan, at-rule counts | `probes/code-rev-s02-c8-r2-block-audit.mjs <lane>` → `…-block-audit.out` |
| the precision sweep behind N1 (613/643 reachable ratios; 424 misreports; 0 flips) | `probes/code-rev-s02-c8-r2-precision.mjs` + `…-precision2.mjs` → `…-precision.out` |
| prefix bytes, both cuts, at three commits | `…-prefix-bytes.out` |
| per-case assertion counts before/after; zero removed assertions | `…-case-diff.out` |
| all standing gates at HEAD | `probes/code-rev-s02-c8-r1-rev-c8-gates.sh <lane> <label>` → `…-gates.out` |
| S01/S02 overlap, token audit, motion coverage | `…-structure-tokens-overlap.out` |
| every packet constant checked at `a035f814` | `…-packet-review.out` |
| the two out-of-block bare buttons on the same surface | `…-class-sweep-beyond-block.out` |

`git status --porcelain` = **0 entries** at handoff; both product files `diff -q`-identical to their
pre-mutant `cp` snapshots; `.review-scratch/` deleted.

---

## 7. Postscript — the cheapest finding in this round cost twenty minutes, and that is correct

N1 (the `toFixed`-before-compare weakening) is three words of remedy. Finding it took a 200,000-step
sweep, because the honest question was not "is this sloppy?" but "**name an input where it is
wrong**", and then "**can that input ever flip the verdict?**". The answers were *yes* (424 alphas)
and *no* (0 flips) — and those two answers are what turns a vague misgiving into a non-blocking
finding with a one-line fix instead of a blocking one that costs a round.

The fleet's expensive mistakes in this cluster have all been the same shape: **a number that was
typed where it should have been executed** (`5.61`), **a number that was measured in the wrong tree**
(`:7583`, `164,567`), **a number predicted instead of counted** (`the count rises by one`), and now
**a number formatted before it was compared**. Four instances, one class. Every mechanical upgrade in
§4 is a way of attaching a command to a figure, and that is the single highest-leverage change
available to this harness right now — higher than any prompt engineering, because it converts a
discipline that four capable seats have each failed once into something the tooling cannot get wrong.
