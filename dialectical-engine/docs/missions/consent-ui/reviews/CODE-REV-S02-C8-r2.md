# CODE-REV-S02-C8 — blind per-cluster review, round 2 (mission `consent-ui`, slice S02, cluster C8)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer,
superpowers:verification-before-completion, superpowers:systematic-debugging,
superpowers:receiving-code-review`

(All six loaded in THIS session, in that order, before any probe — COMMON §10.9.
`receiving-code-review` is loaded per COMMON §10.39 — my packet carries my own r1 findings as this
round's requirements — and because the author offered a REFINEMENT of my r1 root cause, which is a
partial contest and had to be verified rather than accepted. *predecessor session (r1) loaded:*
using-superpowers, heartbeat-protocol, heartbeat-reviewer, verification-before-completion,
systematic-debugging.)

**Verdict: PASS**

Seat CODE-REV-S02-C8-R2 · Opus 5 · fresh blind session · round 2 of max 3 · review ticket
`t_117e6627` · work under review `t_ee948194`, commit `0dc569e9` on `slice/consent-s02-css`, parent
`a035f814` · worktree `.worktrees/rev-s02-c8-r2/dialectical-engine`, detached at `0dc569e9`,
`git status --porcelain` **0 entries at CLAIM and at handoff** · `pnpm run generate:contract` exit 0
· `comments read through: all 12 on t_ee948194` (measured, not estimated:
`hermes kanban --board consent-ui show t_ee948194 --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["ticket"]["comments"]))'` → `12`; comment 12 is the
orchestrator's `rework handoff consumed 03:09`, read in full — it carries no charge for this round
and names this review ticket).

**B1, N1 and N2 are all discharged, each proved by the probe that raised it (COMMON §10.10). Two new
non-blocking findings (N1r2, N2r2), neither of which can change a verdict of any test. The extra
edit — the executing contrast ladder, my r1 "remedy 5" — is ACCEPTED.** Nothing above the block's
opening marker moved by a byte, no existing case lost an assertion, and the eight standing gates all
read their baseline value.

---

## 1. Packet review (`heartbeat-reviewer` §1)

### 1a. The packet that dispatched the work — `CODE-S02-C8-REWORK-R1.md` (snapshot `snapshots/packets/CODE-S02-C8-REWORK-R1.md.at-dispatch`)

**Every constant checked against the artifact it quotes, at `a035f814`** (capture:
`probes/code-rev-s02-c8-r2-packet-review.out`):

| packet claim | measured at `a035f814` | verdict |
|---|---|---|
| `globals.css:7575` is the `.70` comment figure | `   7.17, .70 -> 5.61 / 8.09. It is the smallest step clearing 4.5:1 …` | **correct** |
| test `:297` is the `.70` figure | `    // 4.79 / 7.17, \`.70\` -> 5.61 / 8.09. \`.65\` is the smallest …` | **correct** |
| test `:51-52` are the at-rule counts | `Measured in this file: the only at-rules present are` / `` `@keyframes` (7) and `@media` (18). `` | **correct** |
| `globals.css:7600-7604` is the orphaned comment | the five gate-hint lines, verbatim | **correct** |
| `.consentPolicyLink:7304 · .policyClose:7409 · .policyPill:7448 · .policyPrimary:7560` | all four are the rule-opening lines | **correct** |
| `SPEC.md:612` = `\| focus rings \| --focus \|`; `:637` = "Focus rings visible on every control, in both modes." | byte-identical | **correct** |
| `PLAN.md §Cluster S02-C8 (:1173-1272)` | `:1173` = `### Cluster S02-C8 — the CSS block and the style contract` | **correct** |
| base `a035f814`, never amended | tree `da500bf0…` intact, and it is `HEAD^` | **correct** |

**The author's three packet defects, ruled:**

- **P1 (§2.4 predicts "the count rises by one") — UPHELD.** COMMON §10.42 forbids exactly this. It
  was right (I measured 8 → 9 independently), which is not a defence. **See N2r2: my own round-2
  packet repeats it.**
- **P2 (§1's `allowed` list does not grant the round-0 self-report as readable, while §2.1(c)/(d)
  require correcting figures stated in it) — UPHELD.** A mandatory duty whose input is outside
  `allowed` is `heartbeat-reviewer` §1's named defect class. The read was read-only and necessary.
- **P3 (the packet is silent on the verdict's B1 remedy 5) — UPHELD, and it is the most expensive of
  the three.** My r1 verdict called remedy 5 "the class fix, and the reason this is worth a round";
  the packet's `allowed` parenthetical lists three test edits and not the fourth. The author had to
  re-derive precedence from COMMON §10.22 + §10.27 on the critical path. One line — "remedy 5: in
  scope" — removes it.

### 1b. My own round-2 packet — reviewed, because nobody else does (three defects, none costly)

- **"the rule at block `:7614-7617`"** — those are **file** lines (`sed -n '7614,7617p'` → the four
  selectors). Block-relative they are `391-394`. Mixed citation origin: my own r1 packet defect P1,
  recurring in the packet written to consume my r1 verdict.
- **"four `:focus-visible` rules with `var(--focus)`"** — it is **one** grouped rule with four
  selectors (`awk 'NR>=7605 && NR<=7622' … | grep -c '{'` → **1**). My r1 N1 marked the *grouping*
  ADVISORY and the *outcome* BINDING, so a reviewer counting rules could file a false deviation.
- **"the count rises by one (9)"** — the §10.42 violation the author already filed and the
  orchestrator already acknowledged, repeated in the next packet. **N2r2 below.**

### 1c. The author's `SKILLS LOADED` against the worker floor — COMPLIANT

Declared: `using-superpowers, heartbeat-protocol, heartbeat-worker, receiving-code-review,
test-driven-development, systematic-debugging, verification-before-completion` — seven, i.e. the
worker floor (`test-driven-development`, `verification-before-completion`, `systematic-debugging`,
`receiving-code-review` on rework) plus the router and Superpowers entry point, with the
predecessor's loads cited on a separate line in COMMON §10.9's exact form. The orchestrator's
transcript body-grep reads 7/7 (`t_ee948194` comment 11). **Compliant.**

### 1d. Boundaries — clean

```
git rev-list --count a035f814..0dc569e9   -> 1
git diff --name-status a035f814..HEAD     -> M dialectical-engine/apps/ui/app/globals.css
                                             M dialectical-engine/tests/unit/consent-s02-style-contract.test.ts
git diff --stat                           -> 2 files changed, 139 insertions(+), 32 deletions(-)
docs/ files touched                       -> 0
```

Both files are in the packet's `allowed` list. `a035f814` is `HEAD^` and its tree is unchanged
(`da500bf037ea4fde52c53f795b3539a5de562aca`) — **not amended**. No component, no token block, no
mission document, no push, no merge.

### 1e. Self-report bar — MET, and its §7 is the best thing in this cluster's paper trail

`agent-reports/CODE-S02-C8-rework-r1.md`, 241 lines: four named causes with prices, four
near-misses, three dead ends, five upgrades, six declared deviations/residuals, a re-runnable
evidence index. Its postscript reports the author's own `comments read through` slip (see §3) and
extracts from it the correct structural cause — *the cursor is the one figure in a heartbeat handoff
with no command attached to it*. That is a case file, not a diary.

---

## 2. The three findings, judged — each discharged, each by the probe that raised it

### B1 — DISCHARGED (all four members of the class)

**(1) The number, reproduced with the shipped model before believing anything.** I moved the
stylesheet's *declared* alpha and its matching `expectDecl` together across four rungs, raised the
pinned threshold `4.5 → 99` so the assertion prints its received array, and neutralised the new
hard-coded rungs so they could not mask the print. Script arm under `/bin/bash`; both files
snapshotted and restored with `cp`, proved with `diff -q`
(`probes/code-rev-s02-c8-r2-alpha-ladder.sh`):

```
### alpha=.60  css-hits=1 test-hits=1 threshold99-hits=1  css-now=[1]
   → expected [ 'Terracotta 4.13', 'Chamber 6.29' ] to deeply equal []
### alpha=.65  css-hits=1 test-hits=1 threshold99-hits=1  css-now=[1]
   → expected [ 'Terracotta 4.79', 'Chamber 7.17' ] to deeply equal []
### alpha=.70  css-hits=1 test-hits=1 threshold99-hits=1  css-now=[1]
   → expected [ 'Terracotta 5.54', 'Chamber 8.09' ] to deeply equal []
### alpha=.75  css-hits=1 test-hits=1 threshold99-hits=1  css-now=[1]
   → expected [ 'Terracotta 6.50', 'Chamber 9.19' ] to deeply equal []
RESTORED-OK
porcelain: []
```

**At α = .70 the shipped model prints `Terracotta 5.54`.** My independent r1 probe re-run at
`0dc569e9` agrees (`code-rev-s02-c8-r1-contrast-ladder.mjs`, WCAG 2.x luminance from the spec, eight
compositing models, tokens read out of the shipped stylesheet):

```
A round-channel, label & face over --shell (author/test model)
    T@0.60=4.13  C@0.60=6.29  T@0.65=4.79  C@0.65=7.17  T@0.70=5.54  C@0.70=8.09
Models printing Terracotta 5.54 (±0.005) at alpha .70:
  A round-channel, label & face over --shell (author/test model) -> 5.5450
```

`globals.css:7575` and the S02-S64 comment now read `.70 -> 5.54 / 8.09`. Every remaining `5.61` in
the two files (`globals.css:7578`, test `:152`, `:160`, `:332`) is inside a sentence that
*explains* why 5.61 was wrong. **Correct.**

**The author's root-cause refinement — verified, and it is deeper than mine.** My r1 traced it to
`Math.round(96.5)=97` vs `Math.floor(96.5)=96`; they say the mechanism is that the rung is an exact
TIE and the *spelling* of `1 − α` picks the side. Run independently
(`probes/code-rev-s02-c8-r2-tie.mjs`):

```
1 - 0.7                       = 0.30000000000000004
0.7*38 + (1-0.7)*233          = 96.5               -> Math.round = 97  Math.floor = 96
0.7*38 +   0.30 *233          = 96.49999999999999  -> Math.round = 96  Math.floor = 96
is the shipped sum an exact tie (x*2 is an odd integer)?  true
Math.round(x) === Math.floor(x) for the hand-typed value?  true
0.65 shipped = 106.25 round 106 | hand .35 = 106.25 round 106 -> same channel? true
```

**Their account is correct.** The round-0 "rounded" row was not the shipped model rounded — it was a
hand re-derivation whose `(1 − α)` fell on the other side of a tie, which is why it agreed with the
floored row to the last digit; and the `.65` rung is not a tie under either spelling, which is
exactly why the pinned rung reproduced for everyone and the error survived. **ACCEPTED as a
refinement, not a contest.**

**(2) The retraction, and the docs.** `t_ee948194` comment 8, author `CODE-S02-C8-REWORK-R1`, its own
comment immediately before the handoff, titled `RETRACTION — F1 … is WITHDRAWN. Do not action it.`
The commit touches **0** files under `docs/`. In the MAIN tree, `S02/PLAN.md:1250` reads
`` `.70` gives **5.54 / 8.09** `` and `S02/DECISIONS.md:109` reads `` `.70` → 5.54 / 8.09 ``;
`grep -rn '5\.61' docs/missions/consent-ui/slices/S02/` → **none**. mtimes are `2026-09-06 22:51:53`
(PLAN) and `2026-09-07 02:23:05` (DECISIONS), both **before** the rework CLAIM at 02:47. **The two
correct documents were not edited.**

**(3) The at-rule counts at test `:51-52` — DELETED, not corrected.** The replacement prose says the
counts are deliberately not written here and cites COMMON §10.28. My r1 remedy 3 offered either
form and §10.28 prefers deletion. For the record, measured today:
`@keyframes` **9** and `@media` **19** in the file; **2** and **1** of those are this block's.
**Correct, and the stronger of the two remedies.**

**(4) The byte figure — both cuts measured, both properties true.** The "disagreement" between the
orchestrator's 164,624 and the author's / my r1's 164,623 is a difference of *cut*, not of fact:

```
head -n 7222 : HEAD=164623 (290e01c7f8409de8)  a035f814=164623 (290e01c7f8409de8)  511d30b6=164623 (290e01c7f8409de8)
head -n 7223 : HEAD=164624 (42a3cb387145f0e9)  a035f814=164624 (42a3cb387145f0e9)  511d30b6=164623 (290e01c7f8409de8)
```

`head -n 7222` is the last line that existed at base; `head -n 7223` additionally includes the blank
separator line the *append itself* introduced. **What I measure: everything strictly above the
opening marker at `:7224` — lines 1..7223 — is 164,624 bytes at `a035f814` AND at `0dc569e9`, and
`diff -q` reports the two IDENTICAL.** Independently, the hunk headers say the same thing:

```
git diff -U0 a035f814..HEAD -- apps/ui/app/globals.css  ->  @@ -7575,3 +7575,6 @@   @@ -7600,5 +7603,18 @@
git diff -U0 511d30b6..HEAD -- apps/ui/app/globals.css  ->  @@ -7222,0 +7223,421 @@      (a pure append)
```

Lowest line the rework touches: **7575**, i.e. 351 lines below the marker.

### N1 — DISCHARGED

The rule is at `globals.css:7614-7620` (selectors `:7614-7617`), inside the block:

```
.consentPolicyLink:focus-visible,
.policyClose:focus-visible,
.policyPill:focus-visible,
.policyPrimary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

**The probe that raised N1, re-run at `0dc569e9` (COMMON §10.10)** — `class-rule=NONE` is gone from
every row, and the rule count rose 21 → 22:

```
:focus rules in globals.css: 22
.consentBox          input[type=checkbox]   class-rule=.consentBox:focus-visible   element-rule=.btn…, input:focus-visible, …
.consentPolicyLink   button                 class-rule=.consentPolicyLink:focus-visible, .policyClose:focus-visible, .policyPill:focus-visible, .policyPrimary:focus-visible   element-rule=NONE
.policyClose         button                 class-rule=(the same grouped rule)   element-rule=NONE
.policyPill          button                 class-rule=(the same grouped rule)   element-rule=NONE
.policyPrimary       button                 class-rule=(the same grouped rule)   element-rule=NONE
.policyBody          div[tabindex=0]        class-rule=.policyBody:focus-visible  element-rule=NONE
```

**The new case is RED with the rule deleted in scratch, naming exactly the four** (`cp` snapshot,
`cp` restore, `diff -q`, porcelain empty after — `probes/code-rev-s02-c8-r2-N1-red-frame.out`):

```
 FAIL  tests/unit/consent-s02-style-contract.test.ts > S02-C8 consent-ui style contract > S02-S65c · every focusable control the block styles carries a `--focus` ring inside the block
AssertionError: expected [ '.consentPolicyLink', …(3) ] to deeply equal []
- []
+ [ ".consentPolicyLink", ".policyClose", ".policyPill", ".policyPrimary" ]
 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
RESTORED-OK
porcelain: []
```

**The sweep is complete for what the block styles, and I derived the inventory independently** rather
than reading their table. Line-oriented scan over both surfaces
(`grep -nE '<button|<a[ >]|<input|<select|<textarea|tabIndex|href='`, then a second pass for
`className` — the author's dead end 1 is real, a `<tag[^>]*>` regex dies on the arrow functions in
these props):

| control | element | site | treated at `0dc569e9` by |
|---|---|---|---|
| `.consentBox` ×2 | `input[type=checkbox]` | `SignUpFlow.tsx:205, :216` | block `.consentBox:focus-visible` (`:7287`) **and** the repo's `input:focus-visible` |
| `.consentPolicyLink` | bare `<button>` | `SignUpFlow.tsx:234` | the new grouped rule |
| `.policyClose` | bare `<button>` | `PrivacyPolicyModal.tsx:180` | the new grouped rule |
| `.policyBody` | `div[tabIndex=0]` | `PrivacyPolicyModal.tsx:195` | block `.policyBody:focus-visible` (`:7436`, inset `-2px`) |
| `.policyPill` ×8 | bare `<button>` | `PrivacyPolicyModal.tsx:198` | the new grouped rule |
| `.policyPrimary` ×2 | bare `<button>` | `PrivacyPolicyModal.tsx:259, :271` | the new grouped rule |

Six classes, fifteen rendered nodes, **none bare**. `--focus` is a base token declared in both token
blocks (`:46`, `:135`); S02 declares none, so no new S01 dependency was introduced.

**The class beyond the block, measured — and it is why residual R3/R4 is right.** The repo's shared
rule is `.btn, .iconBtn, .modeToggle, .input, input, textarea, select, a` (`globals.css:488-495`) —
**`button` is not in it.** The *same sign-up surface* renders two more bare buttons that the block
does not style: `.authVerifyEmail` (`SignUpFlow.tsx:141`) and `.authPrimary` (`:240`), and
`grep -n '\.authVerifyEmail[^a-zA-Z-]*:focus'` / `'\.authPrimary…'` → **class-level `:focus` rule:
NONE** for both. They are above the marker and outside every slice's contract, so C8 correctly did
not touch them — and they are the measured proof that the residual is the right remedy (§4).

### N2 — DISCHARGED

`probes/code-rev-s02-c8-r2-block-audit.mjs` (comments extracted with a `/\*…\*/` scan over the raw
block, normalised on whitespace):

```
comments in block: 15   DUPLICATED (normalised): 0
gate-hint comment copies in the FILE: 1 at lines 7586
   line 7591: .policyGateHint {
```

One copy, and the rule it documents opens five lines below it. At `a035f814` there were two (`:7583`
and `:7600`); the orphan is gone. **Correct.** (The handoff's line number for the survivor is stale —
**N1r2** below.)

---

## 3. New non-blocking findings — each demands a fix; the tier sets WHEN, never WHETHER

### N1r2 — the extra edit made S02-S64's PINNED assertion compare a 2-dp string instead of the ratio it measured; measured, it misreports at 424 of 200,000 alphas and can never flip the verdict

**File:line.** `tests/unit/consent-s02-style-contract.test.ts:349-352`.

**Concrete inputs → wrong outcome.** Before this commit the pinned gate was
`measured.filter(([, ratio]) => ratio < 4.5).map(…toFixed(2))` — *filter the exact float, then
format*. After it is
`ratiosAt(alpha).filter((entry) => Number.parseFloat(entry.split(" ")[1]!) < 4.5)` — *format with
`toFixed(2)`, parse the string, then filter*. A true ratio in `[4.495, 4.5)` therefore formats to
`"4.50"`, parses to `4.5`, and escapes a `< 4.5` filter. Set
`.policyPrimary:disabled { opacity: .4784 }`: Chamber's true ratio is **4.498360** — a genuine
WCAG AA failure — and the assertion does **not** list Chamber among the failures. The pre-rework
form did.

**Evidence** (`probes/code-rev-s02-c8-r2-precision.mjs` + `…-precision2.mjs`; `composite()` rounds
each channel, so the ratio is a step function of α and every reachable value can be enumerated):

```
Terracotta: distinct reachable ratios over alpha in (0,1] = 613
   ratios in the BLIND WINDOW [4.495, 4.5): (none reachable)
Chamber: distinct reachable ratios over alpha in (0,1] = 643
   ratios in the BLIND WINDOW [4.495, 4.5):
      alpha ~ 0.47837  true ratio 4.498360  formats "4.50"
blind-window alpha interval: [0.478366, 0.480487]  width 2.121e-3
alpha 0.4784: Chamber true 4.498360 -> "4.50"  flaggedBEFORE=true  flaggedAFTER=false

EXHAUSTIVE alpha sweep (200k steps):
  alphas where the REPORTED ARRAY differs: 424 / 200000   e.g. alpha 0.47837 before=[Terracotta+Chamber] after=[Terracotta]
  alphas where the ASSERTION FLIPS fail->pass (before non-empty, after empty): 0 — NONE
```

**Why N and not B:** across the whole alpha domain there is **no** input where the assertion passes
that the pre-rework form would have failed. Chamber only enters the window near its own 4.5
crossing, where Terracotta is 2.93 and fails hard in both forms. The guard's *verdict* is
unweakened; its *reported failure set* is wrong on a 2.1e-3-wide band of α.

**CLASS: a guard that compares a FORMATTED number instead of the number it measured has silently
moved its own threshold.** This is the same family as B1 (a formatted number that disagreed with the
arithmetic), one commit later. Swept over the file: the only other formatted-then-compared site is
`:365` (`ratiosAt(0.6).some(… < 4.5)`), whose ratio is 4.13 and 0.37 from the boundary — unaffected
today, same shape.

**Remedy: ADVISORY** (the class binds; the wording does not). Compare the number, format only for the
message — e.g. have `ratiosAt` return `Array<[string, number]>`, filter on the number and `.map` to
the string, which is precisely the shape the code had before the refactor and keeps the printed rungs
identical.

### N2r2 — one `path:line` measured mid-round and reported as the final state, in the handoff of the round whose whole subject was that class

**File:line.** `t_ee948194` comment 9 (`REWORK READY FOR REVIEW`), §5 N2: `copies of the gate-hint
comment: 1   at globals.css:7583`.

**Concrete inputs → wrong outcome.** Open `globals.css:7583` at `0dc569e9`: it is the third line of
the `.70` contrast comment, not the gate-hint comment. The gate-hint comment is at **`:7586`**.

**Evidence:**

```
$ grep -n 'The reason the button is disabled reaches assistive technology' apps/ui/app/globals.css     # 0dc569e9
7586:/* The reason the button is disabled reaches assistive technology through `aria-describedby`
$ git show a035f814:…/globals.css | grep -n 'The reason the button is disabled …'
7583: … 7600: …
```

`:7583` is the `a035f814` number: the same commit's B1 edit added three lines above it. The stated
*relationship* ("the line 5 below it: `.policyGateHint {`") is true at both numbers, which is what let
it pass unnoticed. **CLASS: COMMON §10.24's 2026-09-07 addendum** — a `path:line` lifted from output
produced by a different tree.

**Class sweep — every other line citation in the handoff, checked, and this is the ONLY member:**
`:7614-7617` (the new rule) ✓ · `:7224`/`:7643` (markers) ✓ · `:488-495` (the shared ring) ✓ ·
`:46`/`:135` (`--focus` in both token blocks) ✓ · `:7287`/`:7436` (the two existing rings) ✓ ·
`PrivacyPolicyModal.tsx:180, :195, :198, :259, :271` ✓ · `SignUpFlow.tsx:206, :217, :234` ✓ —
**I drafted these last three as off-by-one and re-measured before filing: `grep -n
'className="consentBox"' apps/ui/components/SignUpFlow.tsx` → `206`, `217`, and `:234` is the
`.consentPolicyLink` line. The seat cites each control at the line carrying its className, which is
correct and consistent. My draft finding was wrong and is withdrawn here rather than filed.**

**Remedy: BINDING (measured: the two greps above) — restate `:7583` as `:7586` on the ticket. One
number, nothing in either shipped file changes.**

**Not a finding, recorded:** the handoff's `comments read through: all (7 …)` was wrong (the ticket
carried 10). The author found it themselves, corrected it in its own comment with the enumeration
pasted, and named the structural cause. That is the discipline working, and it is already discharged
— I do not re-file a defect its author retracted on the record. Their proposed upgrade (have the CLI
print `comments: <n>`, or require the cursor be pasted as command output) is **right**, and I second
it in my self-report §4.4.

---

## 4. The extra edit, and the two residuals — ruled

### The executing ladder ("remedy 5") — **ACCEPTED**

`ratiosAt(α)` extracted; `.60`, `.65` and `.70` asserted in both modes; the "`.65` is the smallest
step" claim asserted as a property. Judged on its merits:

- **It was ordered in substance.** My r1 B1 remedy header marks all five items
  `BINDING (measured: the four-run α ladder …)` and calls remedy 5 "the class fix, and the reason
  this is worth a round". COMMON §10.22 makes the *class* bind regardless of the remedy's wording,
  and §10.27 says the ripple a class forces is DECLARED, not forbidden. The author declared it under
  §10.27 in the handoff §3 and in self-report §5 D1, listing every other line touched (the two
  closing sentences that said the arithmetic was "executed, not asserted" — false once it is
  asserted) and why. **Exactly the required form.**
- **It stays inside the granted surface.** Same test file, no new file, nothing above the marker.
- **It works.** Mutating the pinned figure back to the shipped-round-0 value, and mutating the model
  itself, both go RED (`probes/code-rev-s02-c8-r2-mutants.out`):

  ```
  R1 ladder .70 expected 5.54 -> 5.61                         | expect=CATCH got=CAUGHT | Tests 1 failed | 8 passed (9)
  R2 composite Math.round -> Math.floor (the literal B1 bug)  | expect=CATCH got=CAUGHT | Tests 1 failed | 8 passed (9)
  ```

  **Before this edit, `Math.round → Math.floor` was invisible outside the pinned rung.** That is
  precisely the class B1 belonged to, and it is now executed.
- **It weakened one thing, measurably and harmlessly** — N1r2. That is a finding against the edit,
  not a reason to reject it: the edit converts an unexecuted derivation into eight executed
  assertions and loses 2 decimal places of reporting precision on a band of α that can never flip a
  verdict.

**Ruling: ACCEPTED. The class fix was in scope, correctly declared, and it discriminates; N1r2 is the
one line of polish it still owes.**

### Residual R1 (the duplicate-comment assertion) — **RIGHT, and I proved the mechanism**

The author says `stripComments()` runs before every assertion, so the contract is blind to comment
duplication *by construction* and no mutant can catch this class. **Verified by mutant R8:** I
re-inserted a duplicate of the gate-hint comment into the block and ran the suite —

```
R8 RE-DUPLICATE the gate-hint comment | expect=NOT-caught got=NOT-caught | Tests 9 passed (9)
```

**The suite does not notice.** N2 could recur tomorrow and every gate would stay green. Their
proposed one-liner (`expect(new Set(comments).size).toBe(comments.length)` over the raw block) is the
correct remedy and should be the first line of the next lawful edit to this suite. **Ticket it.**

### Residual R3/R4 (widen `globals.css:488-495` to `button:focus-visible` repo-wide) — **RIGHT, and it has live members today**

The shared rule names four *elements* (`input, textarea, select, a`) and three classes; `button` is
absent. Measured above: `.authVerifyEmail` and `.authPrimary` — on the **same sign-up card** this
slice ships — have no `:focus-visible` rule anywhere in `globals.css`. They are above the marker and
outside every slice's contract, so C8 was right to leave them and right to solve N1 inside its own
block. **The one-line widening retires the class for every future block and for those two controls
now; it belongs on a repo ticket beside `A11Y-OVERLAYS` (`t_8962842f`).** (Their R2 — the focusable
inventory is a transcribed constant, so a *seventh* control is caught by review rather than by the
case — is also correctly stated; the case's both-directions assertion is the right mitigation, proved
by mutant R7 below.)

---

## 5. What I verified, and how — every charge with its measurement

### 5.1 The cluster command ×3, from a `.sh` under `/bin/bash` AND inline (COMMON §10.16, §10.34, §10.40)

`run()` transcribed VERBATIM from `PLAN.md:1377-1387`; lane from `argv`
(`probes/code-rev-s02-c8-r2-cluster.sh`).

| run | commit | script arm (`/bin/bash`) | inline arm (tool zsh) |
|---|---|---|---|
| 1 | `0dc569e9` | `vt=0 guard=0 VERDICT=0` · `Tests 9 passed (9)` · `Test Files 1 passed (1)` | identical |
| 2 | `0dc569e9` | identical | identical |
| 3 | `0dc569e9` | identical | identical |

**Worst of six runs: `VERDICT=0 · Tests 9 passed (9) · Test Files 1 passed (1)`.** What moved,
measured not predicted: `Tests 8 passed (8)` → `Tests 9 passed (9)`; `Test Files` unchanged at 1.

### 5.2 Standing gates, as DELTAS against `BASELINE.md` (`probes/code-rev-s02-c8-r2-gates.out`)

| gate | baseline pin | measured at `0dc569e9` | delta |
|---|---|---|---|
| `pnpm typecheck` | exit 1, 8 diagnostics, all `tests/unit/s14-ui.test.ts` | exit 1, **8**, **outside-pin 0** (all eight printed verbatim in the capture) | **none** |
| `cd apps/ui && npx tsc --noEmit -p tsconfig.json` (§10.30) | exit 0 | **exit 0**, no output | none |
| `t9-mode-tokens` | `2 failed \| 6 passed (8)`, hit list 1 | `2 failed \| 6 passed (8)`, **hit-list count 1**, the element being `…/globals.css:6096:background: color-mix(in srgb, #0a0806 32%, transparent);` — line number unmoved | none |
| `pda-s03-keyboard-accessibility` | `2 failed \| 3 passed (5)` | identical, **same 2 names** | none |
| `v2ui-pages` | `5 failed \| 36 passed (41)` | identical, **same 5 names** | none |
| `role-token-map` | `3 failed \| 46 passed (49)` | identical, **same 3 names** | none |
| `auth-flow-integration` | 18 on this lane | **`18 passed (18)`** | none |
| `v2ui-node-runner` | `2 passed (2)` | **`2 passed (2)`** | none |

All three RED-at-base stylesheet suites are identical to the pin **by failure-name set**, not merely
by count. The rework's CSS addition adds no t9 hit.

### 5.3 Block discipline at `0dc569e9` (`probes/code-rev-s02-c8-r2-block-audit.out`)

```
markers: open occurrences=1 close occurrences=1
after the closing marker: "\n"
colour literals in block (raw text, comments included): 0 []
token declarations in block: 0
var(--focus) references in block: 3     :focus-visible selector lines in block: 6
@keyframes in the WHOLE file: 9   @media: 19     (of which the block's: 2 and 1)
```

Independently, `code-rev-s02-c8-r1-css-structure.mjs`: **45 rules (44 top-level), duplicate top-level
selectors: (none)**; motion unmoved — animated `[".policyScrim",".policyBezel"]`, neutralised
`[".policyScrim",".policyBezel"]`, **UNCOVERED `[]`**, selectors with `transition:` **`[]`**.
Token audit: 23 distinct references, **UNDECLARED-ANYWHERE (none)**, `--focus` `base=YES`.

### 5.4 No existing case weakened (`probes/code-rev-s02-c8-r2-case-diff.out`)

Per-case `expect`/`expectDecl` counts, `a035f814` → `0dc569e9`: S02-S59 4→4 · S02-S60 2→2 ·
S02-S61 18→18 · S02-S62 24→24 · S02-S63 3→3 · **S02-S64 6→10** · S02-S65 2→2 · S02-S65b 4→4 ·
**S02-S65c (new) 3**. `git diff a035f814..HEAD | grep -E '^-.*\bexpect(Decl)?\('` → **empty: not one
assertion was removed.**

### 5.5 Eleven mutants of mine (`probes/code-rev-s02-c8-r2-mutants.sh`; `cp` snapshot → uniqueness-checked anchor → run → `cp` restore → `diff -q`)

| # | mutant | expected | result |
|---|---|---|---|
| R1 | ladder `.70` expected `5.54` → `5.61` | CATCH | **CAUGHT** |
| R2 | `composite()` `Math.round` → `Math.floor` (the literal B1 bug) | CATCH | **CAUGHT** |
| R3 | **delete the four-selector focus rule** (the N1 discharge) | CATCH | **CAUGHT**, naming exactly the four |
| R4 | the new ring `var(--focus)` → `var(--accent)` | CATCH | **CAUGHT** |
| R5 | `.policyBody` ring `var(--focus)` → `var(--accent)` | CATCH | **CAUGHT** |
| R6 | `.consentBox` ring `var(--focus)` → `var(--accent)` | CATCH | **CAUGHT** |
| R7 | a ring for a NON-focusable selector (`.policyTab`) | CATCH (drift, other direction) | **CAUGHT** |
| R9 | `transform: translateZ(0)` on `.authCard` (S02-S65) | CATCH | **CAUGHT** |
| R10 | a `#hex` literal inside the block (S02-S60) | CATCH | **CAUGHT** — `expected [ '#A8823E' ] to deeply equal []` |
| R11 | declared alpha `.65` → `.60` | CATCH | **CAUGHT** |
| R8 | re-duplicate the gate-hint comment | **NOT** catch (residual R1's class) | **NOT caught** — `Tests 9 passed (9)` |

**11 applied, 11 landed, 10 caught, 1 correctly not caught, 11 restored by `cp` + `diff -q`,
`porcelain: []` after the battery.** My r1 ten-mutant battery re-run at `0dc569e9`: 8 landed,
**8 caught**; M4 and M10 did not apply because their promoted anchors were stale — see §7, it is a
defect in my own promoted kit, not in this work, and R9/R10 above are their corrected replacements.

### 5.6 S01/S02 selector overlap for the C9 merge — still EMPTY

Measured against `.worktrees/consent-s01/dialectical-engine/apps/ui/app/globals.css` (read only):

```
== S01 block: 372 lines, 50 rules, 33 class tokens
== S02 block: 420 lines, 45 rules, 34 class tokens
== SHARED class tokens  : []
== SHARED full selectors: []
== SHARED @keyframes names: []
```

The four new selectors are `consentPolicyLink`, `policyClose`, `policyPill`, `policyPrimary` — none
of them is in S01's 33 class tokens. **The rework adds no merge surface.**

---

## 6. What I did NOT verify

- **Rendered geometry, and whether either surface repaints on the mode toggle.** jsdom computes no
  layout. Every claim above is about stylesheet TEXT plus computed-style reads. V's acceptance
  steps 1-2, 5, 13, 14 remain the only test of the ring's *appearance* — in particular, that
  `outline-offset: 2px` on the eight jump pills does not visually collide inside their 8px flex gap.
  **I flag it as the one thing worth a human eye in the dev stack.**
- **A real browser's `:focus-visible` heuristic.** I proved the RULE matches the four selectors; I
  did not confirm that Chrome/Safari enter `:focus-visible` for a *mouse* click on a bare `<button>`
  (they generally do not — which is the intended behaviour, but it is unmeasured here).
- **`prefers-reduced-motion: reduce` as an OS setting.** Coverage proved by parse and by mutants R1/R2
  of the r1 battery; the setting was not toggled.
- **The C9 merge.** Measured as disjoint; not performed.
- **The author's own mutant battery and their `.sh` probes.** I built my own eleven rather than
  re-running theirs, per `heartbeat-reviewer` §2.
- **`.hermes/TOOLING-TRAPS.md` "prior bytes intact".** The three new traps are present at `:2269+`
  and the file is 2,306 lines today; I have no pre-append snapshot, so "append only" is the author's
  claim, not my measurement.

---

## 7. A defect in my OWN round-1 probe kit, declared

`probes/code-rev-s02-c8-r1-rev-c8-mutants.sh`, re-run at `0dc569e9`, printed
`ANCHOR NOT UNIQUE (0)` for M4 and `ANCHOR NOT UNIQUE (6)` for M10 and skipped both. Those two
anchors are not valid against this file in *any* commit of this branch (`.authCard {` is followed by
`width: 540px;`; `  background: var(--gold);` occurs six times). My r1 table records both as CAUGHT.
**The conclusion survives** — R9 and R10 above are the same two mutations with correct anchors and
both are caught — **but the promoted kit's provenance for those rows did not.** Recorded here so the
next lens does not treat that kit's M4/M10 rows as evidence, with the mechanical fix in my
self-report §1/§4.2: a mutant runner must exit non-zero when `applied != total`.

---

## 8. Predictions (falsifiable evidence that blindness held)

A parallel lens on this rework will, I expect, confirm B1's number, N2's deletion and the focus rule
easily — all three are single greps — and will report the round-2 count as `Tests 9 passed (9)`.
**I predict it will NOT find N1r2**, because the refactor reads as a pure extraction: the `< 4.5`
literal is still there, the printed rungs are unchanged, and every mutant anyone would think to write
still fails. Seeing it requires asking what `toFixed(2)` does to the *comparison* rather than to the
*message*, and then — the harder half — enumerating the reachable ratios to find out whether the
window is inhabited at all. I also predict a lens that *does* notice it will file it as **blocking**
without the 200,000-alpha sweep, and that would be wrong: there are 0 alphas where the verdict flips,
and I have given the command. **I predict N2r2 will be missed entirely**, since `:7583` is a
plausible number three lines from a true one and the sentence around it is correct; and I predict
nobody else re-runs my r1 mutant kit, so §7 will be unique to this verdict. I further predict that a
lens which *does* look at the handoff's citations will file `SignUpFlow.tsx:206/:217` as off-by-one —
I drafted exactly that and withdrew it after `grep -n 'className="consentBox"'` returned `206, 217`;
the seat cites the className line, not the tag-opening line, consistently across both components.
Conversely, if a lens
files the *deleted* at-rule counts at test `:51-52` as an information loss, or the four-selector
grouping as a deviation from "four rules", I believe both are wrong — COMMON §10.28 prefers the
deletion and my r1 N1 marked the grouping ADVISORY; I have given the measurement for both.

**Round 2 of 3. This PASS closes the cluster's review track.** N1r2 and N2r2 are one line of test
code and three restated numbers on the ticket; neither is worth a round, and per
`heartbeat-reviewer` §3 both are ticketed here for the orchestrator to route the same day.

`comments read through: all 12 on t_ee948194` (measured with
`show … --json | len(comments)` → 12, enumerated in the probe kit), `2 on t_117e6627` — my own CLAIM
and the orchestrator's dispatch note.
