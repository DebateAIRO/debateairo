# CODE-S02-C8-REWORK-R1 — self-report (mission `consent-ui`, slice S02, cluster C8, rework round 1 of max 3)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-worker, superpowers:receiving-code-review, superpowers:test-driven-development, superpowers:systematic-debugging, superpowers:verification-before-completion`

(All seven loaded in THIS session, in that order, before any edit — COMMON §10.9. The round-0
session's loads are not mine to claim; `predecessor session loaded: using-superpowers,
heartbeat-protocol, heartbeat-worker, test-driven-development, verification-before-completion,
systematic-debugging` per its own handoff.)

Seat CODE-S02-C8-REWORK-R1 · Opus 5 · fresh session · ticket `t_ee948194` · lane
`.worktrees/consent-s02-css/dialectical-engine` on `slice/consent-s02-css` · base `a035f814`
(never amended) · **new commit `0dc569e9`** · `git status --porcelain` 0 entries at CLAIM and at
handoff · `comments read through: all`.

**Verdict on the three findings: B1 CONFIRMED and fixed (plus its remedy 5, the class fix), N1
CONFIRMED and fixed, N2 CONFIRMED and fixed. I contest nothing. One refinement to B1's root
cause is recorded below — the reviewer's conclusion is right, the mechanism is one layer deeper
than stated, and the deeper layer is the part that generalises.**

---

## 1. Named causes, each with its price

### C1 — The wrong number was produced by re-typing an expression instead of running it (~12 min this round; one full review round to catch)

Round 0 stated `.70 → 5.61` in a shipped comment and filed F1 asking two correct mission
documents to be changed to match. The suite's own model prints `5.54`.

The reviewer root-caused it to `Math.round(96.5) = 97` vs `Math.floor(96.5) = 96` and concluded
"the author's *rounded* row is the floored value". **That conclusion is right about the outcome
and one layer short of the mechanism, and the missing layer is why it happened at all:**

```
0.70*38 + (1-0.70)*233  ->  96.5                 Math.round -> 97   ratio 5.5450  "5.54"
0.70*38 +   0.30 *233   ->  96.49999999999999    Math.round -> 96   ratio 5.6077  "5.61"
```

`1 - 0.70` is `0.30000000000000004` in IEEE-754. The rung is an exact tie, and the *spelling of
the complement* decides which side of it you land on. Round 0's "rounded" row was therefore not
the shipped model rounded — it was a **hand re-derivation** with the literal `.30`, which is a
different computation that happens to coincide with the floored one. That is why "rounded" and
"floored" printed the same four significant figures.

**The tell needed no arithmetic at all: `Math.round(x) === Math.floor(x)` for every `x` that is
not a tie. A three-model table whose first two rows are identical is a table where one row was
not computed by the model it names.** Round 0 had that table in front of it and read it as
corroboration.

**Price:** one blocking finding, one review round, ~12 minutes here to reproduce and root-cause.
**Upgrade:** re-derive by RUNNING the shipped expression, never by retyping it; and when a
rounded and a floored variant agree, stop — you are on a tie, and the pre-rounding channel is the
number to print.

### C2 — A measured ladder written as prose beside an executable assertion (the reason this was worth a round)

Nothing executed the unpinned rungs. `.65` was asserted, so `.65` was right; `.60` and `.70` were
narrated in two comments and in `PLAN.md`, and a wrong one survived a green suite, a self-report,
and a handoff. The reviewer's remedy 5 is the actual fix and I implemented it: `ratiosAt(α)` now
**asserts every rung the prose narrates**, in both modes, as the exact strings the failure prints.

The proof that this is not decoration: mutating `composite()`'s `Math.round` → `Math.floor` — the
literal B1 bug — now turns the suite RED (`expected [ 'Terracotta 4.11', 'Chamber 6.33' ] to
deeply equal [ 'Terracotta 4.13', 'Chamber 6.29' ]`). Before this round that mutation was
invisible outside the pinned rung.

**Upgrade, stated as a law:** *a derivation written as prose beside an executable assertion is
unexecuted prose.* Assert every rung you narrate, or narrate none of them.

### C3 — The repo's shared focus ring is class-keyed, so a new block's bare `<button>`s inherit nothing (N1)

`globals.css:488-495` covers `.btn, .iconBtn, .modeToggle, .input, input, textarea, select, a`.
Four of this block's six focusable controls are bare `<button>`s and matched **no** rule in the
whole stylesheet — class-level or element-level. Nothing in the diff is wrong; the defect is an
**absence**, and it only exists if you enumerate the block's focusable controls and ask which
rule in the *whole* file matches each. Round 0 (and, the reviewer predicted, any parallel lens)
did not.

**This is a standing class for every future block in this file**, not a one-off: any new
component built from bare `<button>`s repeats it. **Upgrade: the S02-S65c assertion I added is
reusable as-is — enumerate the block's focusable inventory, then require a `:focus-visible` rule
INSIDE the block referencing `var(--focus)` for each, in BOTH directions.** Cheaper still would
be widening `:488-495` to `button:focus-visible`, which is one line and outside every slice's
contract — a repo-wide ticket, not a slice's.

### C4 — TDD-removal residue that the file's own contract is structurally blind to (N2)

Round 0 removed a rule to obtain a genuine RED frame, then re-inserted rule *and* comment above
the original comment, which was never removed. The contract calls `stripComments()` before every
assertion — correct for CSS semantics, and therefore **blind to comment duplication by
construction**. No mutant could have caught it. It is caught by *counting*, which is what the
reviewer did.

**Upgrade:** in any suite that strips a syntactic class before asserting, add one assertion over
the stripped class itself. `expect(new Set(comments).size).toBe(comments.length)` is four lines.
I did **not** add it — it is outside this round's charge (see §5 R1), and it is the right first
line of the next round that touches this file.

---

## 2. What I nearly got wrong

1. **I nearly treated the packet's allowed-list parenthetical as forbidding remedy 5.** §1 grants
   the test file "(the `.70` figure at `:297`, the counts at `:51-52`, one new focus-treatment
   case)" — three edits, and the ladder assertions are a fourth. Skipping it would have fixed the
   INSTANCE (`5.61` → `5.54`) and left the CLASS (an unexecuted ladder) intact, which is the exact
   §2.2 failure the protocol calls the most expensive thing in the harness. COMMON §10.27 settles
   it — "change what the class requires; list every other line you touched and why" — and the
   verdict's own remedy header marks all five items `BINDING (measured: …)`. **Declared in §5 D1
   rather than absorbed silently.**
2. **I nearly pinned the ladder with `toBeCloseTo(5.54, 2)`.** That passes only if
   `|received − 5.54| < 0.005`, and the received value is **5.5450** — the assertion would have sat
   within 0.00005 of its own tolerance boundary, i.e. a coin-flip pinned by nothing. Used the
   suite's own `toFixed(2)` strings instead, which is also exactly what the prose states.
3. **I nearly reported a neighbour-mutant as "not caught" without proving it landed.** The check
   printed `landed: 20` for `grep -c '  font-size: 13px;'` — nineteen unrelated rules already
   declared it. Re-measured as a delta (19 → 20) before believing the GREEN. A mutant that did not
   land turns a neighbour check into a false clean bill.
4. **I nearly published a byte figure of 0.** `git show 511d30b6:apps/ui/app/globals.css` fails
   here — the git root is one level above the package — and `| wc -c` on the empty stream prints
   `0`, which reads exactly like a measurement. The correct path is
   `511d30b6:dialectical-engine/apps/ui/app/globals.css`. **This is very likely the family that
   produced round 0's phantom `164,567`.**

---

## 3. Dead ends — do not re-derive these

1. **Deriving the focusable inventory by scanning the JSX from the test.** The obvious regex
   (`/<(button|input)\b[^>]*>/`) cannot work on these two components: their props carry arrow
   functions, and `=>` terminates the `[^>]*` run mid-tag, so the match ends before `className`.
   A correct JSX-aware parser is far more new-defect surface than a rework round should add. The
   inventory is a transcribed constant with each control's `file:line` beside it, and the case
   asserts in **both** directions so it cannot drift silently. Recorded as residual R2.
2. **Running a probe from `.hermes/reports/…/probes/`.** Already in TOOLING-TRAPS at `:1570` and
   again near the tail. The three probes I re-ran are plain `.mjs` taking the lane from `argv`, so
   `node <abs-path> "$PWD"` works and needs no path grant. Only `.test.tsx` probes have the problem.
3. **`git checkout -- <path>` to undo a mutant.** COMMON §10.44. With uncommitted cluster work in
   the file it wipes the work and `git status --porcelain` then reads clean. Every mutant here was
   snapshotted and restored with `cp` and proved with `diff -q`; the porcelain line after each
   restore correctly showed my *own* uncommitted rework, which is the point — a clean porcelain at
   that moment would have been the alarm.

---

## 4. Upgrades — how this becomes more of a one-prompt machine

1. **Ship the "prose figure vs executed figure" check as a standing arm.** Every number a comment
   states about a computation the same file performs is either asserted or deleted. This is
   COMMON §10.28 (self-describing counts) generalised from *counts over the file* to *derivations
   about the code*, and B1 is the measured price of the gap. It is mechanical: grep the block's
   comments for `\d+\.\d+` and require each to appear in an assertion in the same file.
2. **`git show` in this repo needs the package prefix — put it in COMMON, not only in TRAPS.**
   Three separate figures in this mission are `git show`-derived byte counts. One wrong path
   yields `0` and no error. COMMON already says "the git root is one level UP"; it should also
   carry the literal working form
   (`git show <sha>:dialectical-engine/<path>`) and the rule *assert the capture is non-empty
   before comparing it*.
3. **Rework packets should name the verdict's remedy items they are NOT ordering.** This packet
   ordered B1 remedies 1-4 and was silent on remedy 5, which the verdict calls "the class fix, and
   the reason this is worth a round". Silence forced me to re-derive the packet-vs-verdict
   precedence from COMMON §10.22 and §10.27. One line — "remedy 5 is in scope / is deferred to
   ticket X" — removes the whole question.
4. **A packet that predicts a test count re-introduces the thing COMMON §10.42 forbids.** §2.4
   says "the count rises by one — you say what moved". The two halves contradict; §10.42 says the
   prediction should not be there at all. (It happened to be right: 8 → 9, one new `it()`.)
5. **Blind-lens predictions are worth more than they cost.** The reviewer predicted a parallel
   lens would accept `5.61`, miss N2 "by any lens that reads the diff rather than counting", and
   miss N1 "entirely, because it is an ABSENCE". Those three sentences told me exactly which
   verification each finding needed — execute an unpinned rung, count instead of read, enumerate
   instead of diff. **Make the predictions section mandatory in every verdict; it is the cheapest
   dispatch instruction in the harness.**

---

## 5. Declared deviations and residuals

- **D1 — one edit beyond the packet's allowed-list parenthetical, declared under COMMON §10.27.**
  The packet grants the test file for the `.70` figure, the `:51-52` counts, and one focus case. I
  also implemented the verdict's **B1 remedy 5**: extracted `ratiosAt(α)` and asserted all three
  narrated rungs (`.60`, `.65`, `.70`, both modes), plus the `.65`-is-smallest property. Every
  other line I touched, and why: the S02-S64 comment (it stated `.70 -> 5.61` and, after remedy 5,
  its closing sentence "the arithmetic is executed, not asserted" became false); the
  `globals.css:7575` comment's closing sentence, same reason. No file outside the two allowed
  product files was written; nothing above the S02 opening marker changed.
- **R1 — the comment-duplication assertion is NOT added.** N2's ADVISORY addition
  (`expect(new Set(comments).size).toBe(comments.length)`) would have caught the defect inside the
  cycle that created it. It is outside this round's charge and I did not add it. It should be the
  first line of the next lawful edit to this suite.
- **R2 — the focusable inventory is a constant, not a derivation.** A SEVENTH focusable control
  added to either S02 surface is caught by review, not by S02-S65c. The both-directions assertion
  means the list cannot go stale against the *stylesheet*; it can go stale against the
  *components*. See §3 dead end 1 for why a JSX scan was rejected.
- **R3 — `.policyPrimary` is rendered TWICE** (`PrivacyPolicyModal.tsx:259` gated "I have read
  it", `:271` the read-only "Close") and both now receive the ring. Noted because the round-0
  contrast work modelled only the disabled instance.
- **R4 — the repo-wide fix for C3 is one line in a file no slice may touch.** Widening
  `globals.css:488-495` to include `button:focus-visible` would retire this class for every future
  block. It belongs on a repo ticket beside `A11Y-OVERLAYS` (`t_8962842f`), not in a slice.
- **P1 — packet defect (COMMON §10.42):** §2.4 predicts "the count rises by one". Measured: it
  did, 8 → 9. The prediction should not be in a packet regardless of being right.
- **P2 — packet defect (minor):** §2.1(d) cites the byte figure as "the reviewer measured 164,623
  == 164,623" and renders it as "164,623 == 164,623" via a line that reads `(the reviewer measured
  164,623 == 164,623)` — correct — but §1 does not grant the round-0 self-report as a readable
  path even though §2.1(c)/(d) require retracting and correcting figures stated in it. Reading it
  was necessary and is read-only; flagged so the next packet grants it explicitly.

---

## 6. Evidence index (everything in this report is re-runnable)

| what | where |
|---|---|
| the four-rung α ladder that reproduced 5.54 before any edit | `scratchpad/CODE-S02-C8-REWORK-R1-r1/ladder.sh <lane>` |
| the 5-catch / 3-neighbour mutant battery | `…/mutants.sh <lane>` |
| markers, prefix bytes three ways, S02-S60 scans, at-rule counts | `…/block-discipline.sh <lane>` |
| cluster ×3 (bash arm), guard satisfiability both ways, all standing gates | `…/gates.sh <lane>` |
| the four stylesheet suites WITHOUT the block | `…/noblock.sh <lane>` |
| N1 discharged | `node .hermes/reports/consent-ui/probes/code-rev-s02-c8-r1-focus-coverage.mjs <lane>` |
| B1 discharged | `node .hermes/reports/consent-ui/probes/code-rev-s02-c8-r1-contrast-ladder.mjs <lane>` |
| motion coverage unmoved | `node .hermes/reports/consent-ui/probes/code-rev-s02-c8-r1-css-structure.mjs <lane>` |

Traps appended to `.hermes/TOOLING-TRAPS.md` (2267 → 2303 lines, append only, prior bytes intact):
the `1 - α` tie, `git show` needing the package prefix, and `grep -c` after a mutant counting the
whole file.

---

## 7. Postscript — I committed the same class I was sent to fix, in my own handoff

My handoff's closing line read `comments read through: all (7 on t_ee948194 …)`. **The ticket carries 10.** I counted from the thread I had read rather than running a count. That is B1's class exactly: a number stated as measured that the seat's own command contradicts. Corrected in its own comment on the ticket, with the enumeration pasted.

**This is the most useful thing in this report.** I spent the whole round on the proposition that a figure not produced by a command is a guess, wrote it into two files, appended it to TOOLING-TRAPS, and then emitted one in the handoff — inside the closing boilerplate, which is the one place nobody treats as a measurement. Round 0 did the same with `164,567`, also in a summary line, also true-in-property and false-in-figure.

**The cause is structural, not personal: the `comments read through: <n>` cursor is the only figure in a heartbeat handoff with no command attached to it.** Every other number in mine is pasted beside its output. This one is a ritual, so it gets typed.

**Upgrade, and it is one line of tooling:** have `hermes kanban comment` accept `--read-through auto`, or have the CLI print `comments: <n>` on every successful post so the seat's next line is a transcription. Failing that, COMMON should require the cursor to be pasted as command output like every other count:

    $ hermes kanban --board <b> show <t> --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["comments"]))'
    10

A side effect worth having: I discovered comment 8 (an orchestrator note posted after my CLAIM) only while counting. A cursor that is *measured* forces a re-read of the tail; a cursor that is *asserted* does not.
