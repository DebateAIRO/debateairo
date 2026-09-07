# CODE-REV-S02-C9 — round 1 verdict (blind code review, Claude Opus 5)

**SKILLS LOADED:** `superpowers:using-superpowers`, `heartbeat-protocol`, `heartbeat-reviewer`,
`superpowers:verification-before-completion`, `superpowers:systematic-debugging`,
`superpowers:receiving-code-review`

**Work under review:** seat `CODE-S02-C9`, ticket `t_d36df457`, commit `2127c4ad` on
`slice/consent-s02` (base `19cc8e77`, the S02-S66 merge of `slice/consent-s01` @ `4ddc350c` after the
C8 sub-lane merge `e8bf0658`). Its dispatching packet `CODE-S02-C9.md` is under review too.
**My worktree:** `.worktrees/rev-s02-c9/dialectical-engine`, detached @ `2127c4ad`,
`git status --porcelain` = 0 at CLAIM and 0 after every one of eighteen mutant restores.
**Round 1 of max 3.** **comments read through: 6** (`t_d36df457`) / **2** (`t_f55ce0ad`).

---

# Verdict: **REWORK**

**1 blocking finding · 5 non-blocking · 5 packet findings.**

**Read this before the finding list, because it decides how the rework is routed.** The commit's
three files are, as far as I can measure, correct: purely additive except one sanctioned relaxation,
RED-first proven against every mutant the packet names *and* against four of my own, zero product
files touched, and every number in the author's handoff reproduced in my worktree in both shells,
three runs each. **B1 is not caused by this diff and is not fixable inside CODE-S02-C9's `allowed`
list.** It is a product defect in the cross-slice composition that C9 — *the integration cluster* — 
exists to establish and that no command C9 was given can see. The verdict is REWORK rather than PASS
because `heartbeat-reviewer` §4 forbids "pass with concerns" and a blocking finding cannot ride on a
PASS; a PASS here sends the slice to the Grok "fully done" gate and then to V with a reachable
`Escape` defect on the page the slice ships. **Whether the rework lands on this seat, a new coding
cluster, or a V row is the orchestrator's routing call, not mine.**

---

## B1 (BLOCKING) — on `/sign-up`, one `Escape` closes the cookie card UNDERNEATH and leaves the privacy policy open

**Files.** `apps/ui/components/consent/modalSemantics.ts:105-127` (`topmostSurface()`) ·
`apps/ui/app/globals.css:93-94` (`--z-consent-card: 76`, `--z-policy-card: 78`) ·
`apps/ui/app/layout.tsx:46-49` (`<CookieConsent />` after `{children}`) ·
`apps/ui/app/sign-up/page.tsx:4` · `apps/ui/components/SignUpFlow.tsx:340` (the modal is rendered
INLINE, no portal).

**CLASS (this is what binds).** *One ordering of the same surface stack is expressed twice — by
DOCUMENT POSITION for interaction and by `--z-*` for paint — and nothing asserts the two rankings
agree. No test in this mission mounts both slices' surfaces in one document, so the disagreement is
unobservable to every existing suite.*

**Concrete inputs → wrong outcome.** A first-time visitor opens `https://localhost:3000/sign-up`
(the cookie bar shows because no decision is stored; `CookieConsent` has no route gating). They click
**Choose what to store** → the preferences card opens. They then click the privacy checkbox row →
the privacy policy opens **over** the card (`--z-policy-card: 78` > `--z-consent-card: 76`). They
press **Escape**. → **The preferences card closes, discarding the category choices they were making,
the cookie bar flashes back underneath, and the policy they are actually looking at stays open with
focus still trapped inside it.** A second Escape is needed to leave the policy.

**Root cause, measured, not inferred.** `topmostSurface()` ranks by `compareDocumentPosition` —
its own comment says "among unrelated surfaces the later one in document order is on top". On
`/sign-up`, `SignUpFlow` (and its inline `PrivacyPolicyModal`) sits inside `{children}`, and
`<CookieConsent />` is mounted **after** `{children}` — so the cookie card is later in document order
while the policy is higher in z. **S01's own pair agrees** (its policy is rendered after its card, so
both orders point the same way), which is exactly why every existing test passes.

**Evidence — my own fixture, not the author's tests.**
`.hermes/reports/consent-ui/probes/code-rev-s02-c9-r1-crossslice.probe.test.tsx`, run through a
scratchpad `--config` I own, three runs, identical each time, zero files created in the lane:

```
P4 01 card opened:           openSurfaceCount=1 dialogs=1 card=true  policyBezel=false :: ["consentCard|labelledby=_r_2_"]
P4 02 sign-up policy opened: openSurfaceCount=2 dialogs=2 card=true  policyBezel=true  :: ["policyBezel|labelledby=policy-modal-title","consentCard|labelledby=_r_2_"]
P4 03 after ONE Escape:      openSurfaceCount=1 dialogs=1 card=false policyBezel=true  :: ["policyBezel|labelledby=policy-modal-title"]
P4 04 after a second Escape: openSurfaceCount=0 dialogs=0 card=false policyBezel=false :: []
P6 after ONE Escape (policy opened FIRST): card=false policyBezel=true
P7 after the wrong close: policyOpen=true cookieBarBack=true activeElement=policyClose
```

**P6 is the root-cause control**: opening the two surfaces in the REVERSE order gives the same
result, which refutes "the stack is LIFO and the card was registered last" and confirms the winner is
decided by document order alone. **P7** records what the visitor is left with.

**Note what is NOT broken.** Exactly ONE surface consumes the event (`openSurfaceCount` 2 → 1), so
REQ-REV-01 B3's "no other surface acts on the same event" holds. What fails is the other half of
COMMON §10.7: *"the topmost open surface consumes Esc."* The packet's own §4 charge — "the Esc stack
with the cookie card open and the policy opened from `Privacy notice` (S01-S40) still closes only the
policy" — **passes** (my P2). The defect is on the entry point the charge did not name: the policy
opened from the SIGN-UP row.

**REMEDY.**
- **BINDING (measured):** a test that mounts `<SignUpFlow/>` then `<CookieConsent/>` in one document
  — the order `layout.tsx:46-49` uses — opens the card, opens the sign-up policy, presses `Escape`
  once, and asserts `expect(card()).not.toBeNull()`. **That assertion is RED at `2127c4ad`** (it is
  the assertion my P4 originally carried; verbatim failure:
  `AssertionError: the cookie card is the one left: expected null not to be null`). The fix must make
  it GREEN without regressing P2. Oracle file and runner are promoted at
  `probes/code-rev-s02-c9-r1-crossslice.probe.test.tsx` / `-probe-runner.config.ts`; re-run them
  against the fix (COMMON §10.10).
- **ADVISORY (I did not implement or run any of these):** rank `topmostSurface()` by the effective
  `--z-*` instead of document position; or render the sign-up policy after `<CookieConsent />`; or
  portal it. *One measured data point in favour of the first:* z-ranking gives the SAME answer as
  today for S01's pair (policy 78 > card 76), so it is not obviously a regression there — but I have
  not run it and the seven overlays of `A11Y-OVERLAYS` (`t_8962842f`) may depend on the current rule.

**VERDICT / CONFIDENCE / STRONGEST COUNTER**
**VERDICT:** blocking for the slice's "UI element fully done" gate; not a defect of this commit.
**CONFIDENCE: high** — reproduced three times, mechanism traced to four cited lines, and confirmed by
a control that discriminates document order from open order.
**STRONGEST COUNTER:** *"Both surfaces open at once is a corner case, and one extra Escape is a
cosmetic annoyance — this is an N."* I do not accept it, for two measured reasons: (1) `/sign-up` is
the one page where both surfaces are designed to coexist, and the cookie bar is shown to exactly the
population that also sees the sign-up form — first-time visitors; (2) the surface that closes is the
one holding **unsaved consent choices**, and this is a consent mission whose standing law is that a
UI never misrepresents what it stored. The honest counter I cannot refute is the ROUTING one: this
belongs to whoever owns `modalSemantics.ts`/`layout.tsx`, and CODE-S02-C9 was forbidden to touch
either.

---

## Non-blocking findings — each is a ticket, and the tier sets WHEN, never WHETHER

### N1 — a relaxed assertion left under a title that still states the old, stronger property
`tests/render/consent-bar.test.tsx:229` — the case is titled
`ships R09's geometry inside ONE delimited S01 block at the end of globals.css` while `:240-258` now
assert "…or S02's ONE delimited block and then nothing". **CLASS:** *a test NAME that no longer
describes its assertion, in a repository where BASELINE and several verdicts gate on test names.*
The author raised this themselves (F3) and deliberately did not rename it; I confirm the fact and the
reasoning. **REMEDY: ADVISORY** — the rename moves a gated name, so it is a decision for whoever owns
`BASELINE.md`, taken together with N2. Concrete inputs → wrong outcome: a future seat greps for the
end-of-file property, finds this title, and believes it is still enforced.

### N2 — the duplicate-comment assertion lives in a case about block delimitation
`tests/unit/consent-s02-style-contract.test.ts:344-357` — `expect(new Set(comments).size)…` is the
first assertion of `S02-S59 · appends exactly one delimited S02 block and ends the file with it`.
Comment uniqueness is not block delimitation. **Same CLASS as N1.** It is where the packet ordered it
("the FIRST line of that suite's next lawful edit" — an ambiguity the author flagged as D2 and
resolved by satisfying both readings). **REMEDY: ADVISORY** — either rename the case or give the
assertion its own `it()`; the second is cleaner and adds a test count, which COMMON §10.42 says is
the author's to measure, not a packet's to predict.

### N3 — S02's marker strings are now hard-coded in two test files with no shared source
`tests/render/consent-bar.test.tsx:245-246` (`S02_OPEN` / `S02_CLOSE`) duplicate the constants
`tests/unit/consent-s02-style-contract.test.ts` owns. **CLASS:** *a load-bearing constant duplicated
across a slice boundary.* Concrete inputs → wrong outcome: S02 renames its markers, its own suite is
updated, and S01's case fails with a message about S02's block — a failure in the wrong slice's file.
**REMEDY: ADVISORY** — export both marker strings from one module (`tests/support/` already exists for
exactly this) and import them in both files.

### N4 — the relaxed assertion no longer catches S02's block NESTED INSIDE S01's; only the S02 suite does
`tests/render/consent-bar.test.tsx:244-258`. **Measured (my mutant GX3, S02's whole block moved
between S01's open and close markers):**
```
GX3 | exit=1 |  Tests  1 failed | 15 passed (16)
 FAIL  tests/unit/consent-s02-style-contract.test.ts > … > S02-S59 · appends exactly one delimited S02 block and ends the file with it
  AssertionError: expected '/* === end consent-ui S01 === */' to be ''
   -> consent-bar.test.tsx PASSES on this mutant.
```
**CLASS:** *a property whose enforcement silently migrated to another file.* The pair still covers it
in the merged lane, and on `slice/consent-s01` alone the S02 block does not exist so the old strict
branch applies — so this is genuinely non-blocking. But `consent-bar.test.tsx` no longer pins
"S01's block is at the end" on its own, and its new comment does not say which file now does.
**REMEDY: ADVISORY** — one sentence in the comment naming
`tests/unit/consent-s02-style-contract.test.ts`'s `after.trim() === ""` as the co-owner of the
property. Related, and worth a line: my G1/G2/G3/GX1/GX2 mutants all go RED correctly and G4 (a rule
added INSIDE S02's block) correctly stays green, so the relaxation is otherwise tight.

### N5 — PLAN residue on the C9 step (confirming the author's F1/F2; already ticketed `t_4f97ca86`)
`slices/S02/PLAN.md:1413-1416` — both `run_c9` merge arms are unsatisfiable as written; measured in my
worktree, three runs, two shells: `--scrim:=1 (expect 2)  S02markers=1 (expect 2)`, so `run_c9 AS
WRITTEN VERDICT=1` forever. `slices/S02/PLAN.md:1296-1301` still says "all eight S02 test files plus
`auth-flow-integration`" and pins `Test Files 9 passed (9)` while the cluster row (`:1477`) and the
chain rule (`:1439`) say TEN. And `slices/S02/PLAN.md:1279-1280` orders the seat to record the merge
"in `PROGRESS.md`'s handoff", a file the packet forbids. **CLASS:** *a PLAN sentence that a later
correction contradicts without deleting.* **REMEDY: ADVISORY** — already routed; I add only the third
item (`PROGRESS.md`), which I did not see on the ticket.

---

## Packet review — findings against the orchestrator, not the author

### P1 — `CODE-S02-C9.md` §2 states a wrong constant **with a fabricated-looking reason**, corrected 15 lines lower
§2: *"the two merge arms `--scrim:` count = 2 … after the merge S01's two token blocks each declare
`--scrim:` once"*. **Measured:** `--scrim` is declared **once**, in `:root` only
(`globals.css:65`); the `html[data-mode="chamber"]` block does not declare it, because it is
mode-independent. `grep -c -- '--scrim:' apps/ui/app/globals.css` = **1**. The "MEASURED TRUTH" block
at the bottom of the same packet says so. A seat reading top-down transcribes the wrong constant AND
its false justification before reaching the correction. **CLASS:** *a corrected constant left standing
beside its own refutation.* **REMEDY: BINDING (measured: the grep above)** — delete the superseded
constant and its reason from §2, and move the MEASURED TRUTH block ABOVE the reading list. The author
independently reached the same conclusion from the other side (their D4).

### P2 — "the sixteen consent files" is a set named in prose (confirming the author's D1)
`ls tests/render/consent-*.test.tsx tests/unit/consent-*.test.ts` = **14**. The pinned
`1 failed | 178 passed (179)` reproduces only with `auth-flow-integration` + `v2ui-node-runner`
added. Both the author and I had to derive the set. **CLASS:** COMMON §10.10's counting rule, one
level up — *a packet names a SET by the command that produces it, never by a prose name.*
**REMEDY: BINDING (measured: the `ls` above returns 14, not 16)** — state COMMON §10.10 for sets, and
add the set to `BASELINE.md` (the author's F4, still open).

### P3 — the packet overrides a PLAN sentence without quoting it
§1 forbids `PROGRESS.md` while `PLAN.md:1279-1280` orders the seat to write its handoff there. The
packet's redirect ("on the ticket") is correct, but a seat obeying the PLAN literally writes a
forbidden file. **CLASS:** *a silent override.* **REMEDY: ADVISORY** — when a packet overrides a PLAN
sentence, it quotes the sentence it is overriding.

### P4 — MY packet (`CODE-REV-S02-C9-R1.md` §2) points at the wrong tool for its own charge
It offers `tests/support/tokenContract.ts`'s `styledDocument()` for "render the component in jsdom
yourself". The function exists (`:34`) and is fine for reading the stylesheet, but it builds its **own
detached JSDOM**, so it cannot host a React mount — the charge's actual requirement. I used the
ambient `// @vitest-environment jsdom` document instead. **CLASS:** *a cited helper that serves half
the charge.* **REMEDY: ADVISORY** — say "`styledDocument()` for the stylesheet arm; the ambient jsdom
document for the render arm".

### P5 — MY packet §4 gives me the author's claimed figures BEFORE I measure
That anchors a seat whose whole value is blindness. I mitigated it by transcribing `run`/`run_c9`
from the PLAN's fenced blocks and running everything before comparing, so the agreement below is
meaningful — but the mitigation was mine to invent. **CLASS:** *anchoring a blind lens by
construction.* **REMEDY: ADVISORY** — put the author's claimed figures in an appendix the seat is told
to open only after its own table exists.

**Packet items that are CORRECT and should be copied:** every one of the three "Orchestrator
addition" blocks reproduced (`4ddc350c`, `19cc8e77`, `e8bf0658`, `--scrim:=1`, `markers=1`,
`1 failed | 178 passed (179)` at base, t9's nine tests, typecheck 8 in `s14-ui`, apps/ui exit 0), the
review package is exactly the 428 lines claimed, and naming each pin's mutant *and its expected
direction* is the single reason this review is independent rather than a re-read of the author's
evidence.

---

## What I verified, and HOW — verbatim

### V1 · Boundaries — three test files, zero product files
```
git rev-list --count 19cc8e77..2127c4ad          -> 1
git log --merges --oneline 19cc8e77..2127c4ad    -> (0 lines)
git show --name-only --format='' HEAD            -> dialectical-engine/tests/render/consent-bar.test.tsx
                                                    dialectical-engine/tests/render/consent-signup-modal.test.tsx
                                                    dialectical-engine/tests/unit/consent-s02-style-contract.test.ts
git diff --name-only 19cc8e77 HEAD | grep -v '^dialectical-engine/tests/'   -> (none outside tests/)
```
Product identity proved by BLOB HASH, not by `git diff --quiet` (which exits 0 on a path that does
not exist — see my TOOLING-TRAPS append):
```
SignUpFlow.tsx            374f8002… == 374f8002…  SAME
globals.css               252393b8… == 252393b8…  SAME
PrivacyPolicyModal.tsx    a7845276… == a7845276…  SAME
modalSemantics.ts         8febb7a5… == 8febb7a5…  SAME
privacyPolicy.ts          d1b5f2a4… == d1b5f2a4…  SAME
```
`PROGRESS.md` / `PLAN.md` are **untracked in the lane** (`git ls-files docs/missions/consent-ui` = 0),
so no commit could carry them; main-tree mtimes are `PLAN.md` Sep 6 22:51, `SPEC.md` Sep 6 19:09,
`DECISIONS.md` Sep 7 02:23 — all before the C9 dispatch (04:04) — and `PROGRESS.md` Sep 7 04:32,
which is the orchestrator's own "HANDOFF CONSUMED" minute. Consistent with the author's claim.

### V2 · No existing assertion weakened — every deleted line, all three files
```
consent-bar.test.tsx:         -    expect(css.trimEnd().endsWith(CLOSE_MARKER), "the S01 block is the last block in the file").toBe(
                              -      true
                              -    );
consent-signup-modal.test.tsx: (no deletions — purely additive)
consent-s02-style-contract.ts: only the ratiosAt refactor (10 lines), each replaced by an
                               equivalent-or-STRICTER form (see V6)
```
`it()` titles at base vs HEAD: the fourteen existing titles are byte-identical; two are added.

### V3 · `run_c9` ×3 in BOTH shells, transcribed verbatim from `PLAN.md:1376-1418`, commit column
ARM A — `.sh` under `/bin/bash`, `grep (BSD grep, GNU compatible) 2.6.0-FreeBSD`:
```
--- run 1 | commit 2127c4ad | porcelain 0 ---
S02-C9 | vt=0 guard=0 VERDICT=0 |       Tests  105 passed (105) |  Test Files  10 passed (10)
S02-C9 | mergeArms: --scrim:=1 (expect 2)  S02markers=1 (expect 2)
S02-C9 | run_c9 AS WRITTEN VERDICT=1
S02-C9 | PROPERTY: scrim=1(>=1) S01open=1/1 S01end=1/1 S02open=1/1 S02end=1/1 S01endBeforeS02open=OK linesAfterS02end=0 (file 8036 lines) | PROPERTY_VERDICT=0
   (runs 2 and 3 identical, line for line)
```
ARM B — inline in the tool's zsh 5.9 with `${=FILES}`, `ugrep 7.8.4`: identical on all three runs.

| run | commit | vitest half | Tests | Test Files | `run_c9` AS WRITTEN | PROPERTY |
|---|---|---|---|---|---|---|
| 1 | `2127c4ad` | vt=0 guard=0 | 105 passed (105) | 10 passed (10) | **VERDICT=1 (RED)** | VERDICT=0 |
| 2 | `2127c4ad` | vt=0 guard=0 | 105 passed (105) | 10 passed (10) | **VERDICT=1 (RED)** | VERDICT=0 |
| 3 | `2127c4ad` | vt=0 guard=0 | 105 passed (105) | 10 passed (10) | **VERDICT=1 (RED)** | VERDICT=0 |

**The property, stated in my own words as the packet requires:** *the merged `globals.css` carries
`--scrim:` at least once; S01's opening and closing markers appear exactly once each; S02's opening
and closing markers appear exactly once each; S01's closing marker precedes S02's opening marker; and
no line follows S02's closing marker.* Measured true at `2127c4ad` — markers at `7244 / 7615 / 7617 /
8036`, file 8036 lines, and the bytes after S02's end marker are exactly `'\n'`.

### V4 · The sixteen-file set ×3 — set stated by the command that produces it
```
SET (counted, not named): 16 files  [the 14 consent-* files + auth-flow-integration + v2ui-node-runner]
### run 1 | commit 2127c4ad | porcelain 0 | exit=0    Test Files  16 passed (16)   Tests  181 passed (181)
### run 2 | commit 2127c4ad | porcelain 0 | exit=0    Test Files  16 passed (16)   Tests  181 passed (181)
### run 3 | commit 2127c4ad | porcelain 0 | exit=0    Test Files  16 passed (16)   Tests  181 passed (181)
```

### V5 · The standing gates, as DELTAS
- `pnpm run generate:contract` exit 0, tree stayed clean (porcelain 0 after).
- **root `pnpm typecheck`**: exit 1, **8 diagnostics, 0 outside `tests/unit/s14-ui.test.ts`** — the
  BASELINE shape exactly (2×TS2307, 2×TS18046, 2×TS2339, 2×TS7006). **Delta: none.**
- **apps/ui project typecheck** (COMMON §10.30): `npx tsc --noEmit -p tsconfig.json` → **exit 0**.
- **`t9-mode-tokens`**: exit 1, `Tests  2 failed | 7 passed (9)` — nine here because the S01 merge
  brought C1's ninth test. The two failures are the two PRE-EXISTING ones by name (the `☀ Terracotta`
  toggle label; the colour-literal gate). Hit list = **exactly one** element:
  `…/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);`
  (the path prefix is my worktree's; the line number `6116` matches the author's). **Delta: none.**
- `v2ui-node-runner` `Tests 2 passed (2)` · `auth-flow-integration` `Tests 18 passed (18)`.
- The five RED-at-base suites, **by name**, all unchanged: `auth-front-door-parity` 2 failed (2) ·
  `pda-s03-keyboard-accessibility` 2 failed | 3 passed (5) · `v2ui-pages` 5 failed | 36 passed (41) ·
  `role-token-map` 3 failed | 46 passed (49) · `t3-library` 4 failed | 11 passed (15).

### V6 · Mutants — eighteen planted, eighteen restored (`cp` snapshot → `cp` restore → `diff -q`, never `git checkout --`)
Unmutated baselines: `consent-signup-modal` 16/16 · `consent-bar` + `style-contract` 16/16 ·
`style-contract` alone 9/9.

**The three the packet names (each REDs exactly its own pin):**

| mutant | site | result |
|---|---|---|
| **R9** `input.focus()` → `if (event.target === input) input.focus()` | `SignUpFlow.tsx:134` | `2 failed | 14 passed (16)` — both new focus-return arms |
| **M11** the whole `queueMicrotask` block deleted | `SignUpFlow.tsx:150-153` | `1 failed | 15 passed (16)` — the tracker pin only |
| **R1** `if (event.target !== input) input.click()` → `input.click()` | `SignUpFlow.tsx:128` | `1 failed | 15 passed (16)` — the re-entrancy pin only |

Verbatim, R9:
```
 FAIL  tests/render/consent-signup-modal.test.tsx > … > opens the policy from the row's text, leaving box and mirror false
AssertionError: constant (5): focus returns to the privacy input from the text entry point: expected <input id="signup-email" …(6)></input> to be <input class="consentBox" …(4)></input>
```

**Four mutants of my OWN, derived from the SPEC property (the packet's examples: flip a default,
check the box on close):**

| my mutant | result | what it establishes |
|---|---|---|
| `input.focus()` removed entirely | `6 failed | 10 passed (16)` | the two NEW arms **plus** the four existing square-route cases — so the new arms genuinely extend coverage to the two entry points that had none |
| `closePolicy` → `setPrivacyAccepted(true)` ("check the box on close") | `5 failed | 11 passed (16)` | the existing mirror arms catch it |
| `event.preventDefault()` dropped | `1 failed | 15 passed (16)` | caught, and only by the square case — correct, the other entries never toggle natively |
| `queueMicrotask` block KEPT but its body neutered | `1 failed | 15 passed (16)` | **stronger than the author measured**: the tracker pin catches the resync being *neutered*, not merely deleted |

**Stylesheet mutants (10) — the relaxed S01-C3 assertion and the duplicate-comment assertion:**
G1 (stray rule after S02's close) RED in BOTH suites · G2 (stray rule between the blocks) RED in
consent-bar · G3 (a second S02 block) RED, 8 failed · **G4 (a rule added INSIDE S02's block) GREEN —
correct, S01's case has no business asserting S02's contents** · GX1 (S02's close marker deleted) RED
`exactly one S02 block is closed after S01's: expected +0 to be 1` · GX2 (a second S01 block) RED
`exactly one S01 block is opened: expected 2 to be 1` · GX3 → **N4** · MDUP RED
`no comment is duplicated inside the S02 block: expected 15 to be 16` · MCMT (comment TEXT changed,
not duplicated) GREEN — correct · **MNOCMT (all comments stripped) RED
`the S02 block is commented at all: expected 0 to be greater than 0`** — my own probe that the
`> 0` satisfiability arm is not vacuous.
I counted the S02 block's comments independently: **15 comments, 15 unique** — matching the author.

**Test mutant M-STR** (`failingAt` reverted to the pre-repair `format → parseFloat → filter` shape):
```
 FAIL  … > S02-S64 · the disabled `I have read it` clears 4.5:1 in both modes, computed here
AssertionError: a true ratio in [4.495, 4.5) is REPORTED as failing: expected [ 'Terracotta 2.93' ] to deeply equal [ 'Terracotta 2.93', 'Chamber 4.50' ]
```
So the blind-window assertion genuinely discriminates number-comparison from string-comparison.

### V7 · The contrast ladder, re-derived INDEPENDENTLY (my own Python, from the stylesheet's tokens)
```
alpha=0.4784: Terracotta 2.93 (true 2.927853) | Chamber 4.50 (true 4.498360)
alpha=0.6   : Terracotta 4.13 (true 4.132822) | Chamber 6.29 (true 6.285906)
alpha=0.65  : Terracotta 4.79 (true 4.789079) | Chamber 7.17 (true 7.166211)
alpha=0.7   : Terracotta 5.54 (true 5.544954) | Chamber 8.09 (true 8.094198)
declared .policyPrimary:disabled opacity = .65
```
Every rung the suite asserts reproduces. **The `.70` tie is real and the suite's comment is accurate
to the digit:** `0.70*38 + (1-0.70)*233` is exactly `96.5` → `Math.round` → 97 → `5.5450` → `"5.54"`;
hand-spelled `0.70*38 + 0.30*233` is `96.49999999999999` → 96 → `5.6077` → `"5.61"`. **I nearly filed
a false B here** — my first pass used Python's `round()`, which is banker's rounding, and produced
`5.61`, the exact number a previous review found written wrongly in prose. Recorded in TOOLING-TRAPS.

### V8 · Cross-slice integration, statically
```
S01 block selectors: 45   S02 block selectors: 45
SHARED SELECTOR SET (expect EMPTY): EMPTY                <- re-measured at the merged head
declarations of --ok-edge = 2 · --scrim = 1 · --z-policy-scrim = 1 · --z-policy-card = 1
tokens DECLARED inside the S02 block: []   inside the S01 block: []      (COMMON §10.8 holds)
colour literals inside the S01 block: NONE   inside the S02 block: NONE
```
And dynamically (my fixture, three runs): **P1** both slices' surfaces coexist · **P2** the packet's
named Esc case (card + `Privacy notice` policy) closes ONLY the policy · **P3** the S01 card asks for
READ mode (a `Close`, no `I have read it`) while the sign-up card asks for CONSENT mode
(`I have read it` present, no bare `Close`) · **P5** the merged sheet parses and carries rules for
`.consentBar`, `.consentCard`, `.policyScrim`, `.consentGroup`, `.consentBox`, `.consentPolicyLink`.
**P4/P6/P7 are B1.**

### V9 · S02-S69 — the author's `UNVERIFIED — dev stack not serving this branch` is CORRECT
Independently confirmed, read-only; I started, stopped and pointed nothing:
```
lsof -nP -iTCP:3000 -sTCP:LISTEN   -> node pid 5436
lsof -a -p 5436 -d cwd             -> /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine   (the MAIN tree)
curl -sk https://localhost:3000/sign-up  -> http=200, 19432 bytes
   consentGroup 0 · privacy-accepted 0 · consentRow 0 · policyScrim 0 · adult-affirmed 1 (pre-mission)
apps/ui/.next in this lane -> does not exist
positive control: grep -c 'consentGroup' apps/ui/components/SignUpFlow.tsx -> 1   (so the 0s are not a bad needle)
```
**No evidence any seat started or stopped a dev-stack process.** The listener is the main tree's,
i.e. V's. **For V's test point:** S02-S69's three commands remain unrun; when the stack is pointed at
this branch, note that step 1's `test ! -d apps/ui/.next && echo GONE` is vacuously satisfiable here
(the lane has no `.next` at all), which the author correctly refused to report alone.

### V10 · The author's `SKILLS LOADED` against the worker floor
Declared seven: `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`,
`test-driven-development`, `verification-before-completion`, `systematic-debugging`,
`receiving-code-review`. The `heartbeat-protocol` §1 worker floor is met, and COMMON §10.39 (a seat
discharging a prior verdict's findings loads `receiving-code-review`) is satisfied — this packet
carries `CODE-REV-S02-C7 r1` N1/N2/N6 and `CODE-REV-S02-C8 r2` N1r2 as requirements. **I verified the
DECLARATION, not the transcript** — the transcript grep is the orchestrator's check and its exit note
records `SKILLS body grep 7/7`. The author's cursor-correction addendum (`comments read through: 2`
→ `4`, with the three-second race between the dispatch comment and their CLAIM named as the cause) is
the correct handling of COMMON §10.29's known side effect.

### V11 · The author's own packet defects and unexpected findings — one line each, as charged
**D1** (sixteen-file set named in prose) — **TRUE**, my P2; `ls` returns 14. **D2** ("as the FIRST
line" ambiguous) — **TRUE**, and satisfying both readings was the right call; see N2.
**D3** (the gate list reads as a contradiction) — **TRUE**, wording only, not ticketable beyond a
packet edit. **D4** (every MEASURED TRUTH constant reproduced; the block belongs above the reading
list) — **TRUE and reproduced by me, nine for nine**; it is my P1's remedy.
**F1** (`run_c9`'s arms unsatisfiable) — **TRUE**, measured; ticketed `t_4f97ca86`.
**F2** (`PLAN.md:1296-1301` says 9 files, the cluster row says 10) — **TRUE**; my N5.
**F3** (the case title after the relaxation) — **TRUE**; my N1, and I agree with not renaming it now.
**F4** (no BASELINE pin for the sixteen-file set) — **TRUE**; my P2's second half.
**F5** (TOOLING-TRAPS appended, 2438 → 2463, cross-referenced to `:2306`) — **TRUE**; the entry is at
`:2440` and it is what let me build my own runner in one attempt.

---

## What I did NOT verify — so the next lens knows the gaps

1. **Anything in a real browser.** No dev stack serves this branch (V9). Every finding here, B1
   included, is measured in jsdom; B1's *mechanism* (document order vs `--z-*`) is browser-independent
   and cited at four source lines, but the visual claim "the policy paints above the card" is read
   from the declared z-indices, not seen.
2. **The author's transcript.** I checked their `SKILLS LOADED` declaration only (V10).
3. **The other twelve consent test files' internal quality.** I ran them (V4: 181/181) and mutated
   only the three the commit touches plus their two subjects.
4. **`t9-mode-tokens`'s set-equality arm against a token ADDITION.** The commit adds no token and the
   suite is green on that arm; I did not plant a token-addition mutant.
5. **`prefers-reduced-motion`, the scroll gate, the 720px/680/92vh geometry, the 17px squares, the
   eight scrolling pills, narrow viewports, and the live mode flip with the modal open** — the PLAN
   itself assigns all of these to V.
6. **Whether B1 also affects the seven pre-existing overlays** (`A11Y-OVERLAYS`, `t_8962842f`). They
   have no focus trap or Esc at all, so they cannot be in the stack — but I did not measure them, and
   any z-ranking remedy must.
7. **Concurrency.** `fileParallelism: false`; I ran nothing in parallel against the lane.

---

## Predictions — what I expect the other lenses got wrong

`CODE-CROSS-01` (`t_c1068d6f`) runs on this same head. I had no contact with it and read nothing of
it. **I predict it PASSED the commit**, and I predict it did *not* find B1 — because B1 is invisible
to every path that starts from the diff, the author's evidence, or `run_c9`. It is reachable only by
writing a fixture that mounts BOTH slices in the order `layout.tsx:46-49` composes them, and the
mount order is load-bearing: compose them the other way round and the defect disappears, so even a
lens that built a cross-slice fixture had a coin-flip on seeing it. **The second thing I expect a
parallel lens to have missed is N4** — the GX3 nesting mutant needs someone to ask "what does the
relaxed assertion *stop* catching", and the obvious mutants (G1/G2/G3) all still go red, which reads
as "the relaxation is tight" and stops the search. **What I would check first if I were reviewing my
own verdict:** whether B1's ADVISORY z-ranking remedy breaks S01's `consent-policy-link.test.tsx`
Esc-stack cases — I measured that z-ranking gives the same answer for S01's pair (78 > 76) but I did
not run it, and that is the one place my confidence is medium rather than high. **What I most expect
to be told I got wrong:** the REWORK verdict itself, on the ground that the commit is clean and the
defect predates it. I would accept a re-tier to "PASS on the commit, B1 ticketed against the slice"
if the orchestrator rules that the cluster's verdict tracks the diff rather than the cluster's claim
— but not a tier below blocking for the slice's Grok/V gate.

---

**comments read through: 6** (`t_d36df457`), **2** (`t_f55ce0ad`).
**Probe kit (COMMON §10.26/§10.35, lane from `argv`/`$LANE`, zero `.worktrees` literals):**
`.hermes/reports/consent-ui/probes/code-rev-s02-c9-r1-*` — 24 files: `run_c9.sh`, `gates.sh`,
`sixteen.sh`, `mutate.sh`, the cross-slice probe + its runner config, and eighteen mutation scripts.
**Self-report:** `.hermes/reports/consent-ui/agent-reports/CODE-REV-S02-C9-r1.md`.
**Tree at exit:** `2127c4ad`, `git status --porcelain` = 0, no `.review-scratch/` created, no
`tests/probes/` created, no product file edited, no git write of any kind.
