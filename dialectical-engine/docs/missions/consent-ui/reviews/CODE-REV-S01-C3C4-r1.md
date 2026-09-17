# CODE-REV-S01-C3C4 — round 1 verdict (mission `consent-ui`, slice S01, clusters C3 + C4)

`SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:verification-before-completion, superpowers:systematic-debugging, superpowers:receiving-code-review`

All six loaded in THIS session with the Skill tool, in that order, before any judgement
(COMMON §10.9). Reviewer floor (`heartbeat-protocol` §1) is `verification-before-completion`
and `receiving-code-review`; both are present. No skill is named that I did not load.

**Seat:** CODE-REV-S01-C3C4 · **ticket:** `t_efab9b5f` · **work under review:** `t_14e117ec`,
seat CODE-S01-C3C4, commits `b21fe942` (C2 follow-up), `7131d61d` (C3 bar), `9dd8042e` (C4
card) on `slice/consent-s01`.
**Worktree:** `.worktrees/rev-s01-c3c4/dialectical-engine`, detached at `9dd8042e`,
`git status --porcelain` = 0 entries at CLAIM. `pnpm run generate:contract` run first, exit 0.
**Round 1 of max 3.**

# Verdict: PASS

Every acceptance the packet names is met and I could not refute the author's claims: the
clusters are green on the worst of six runs, the copy is byte-exact, the behaviour survives
mutation, and nothing outside the `allowed` surface was touched. The eight N-findings below
are real and each demands a fix; none of them makes this element wrong today, so none blocks.
This is not "pass with concerns" — the concerns are numbered N-findings with tickets
(`heartbeat-reviewer` §3/§4).

---

## 1. Packet review (`heartbeat-reviewer` §1 — filed against the orchestrator, not the author)

The dispatch packet `.hermes/planning/consent-ui/packets/CODE-S01-C3C4.md` is byte-identical
to its snapshot `snapshots/packets/CODE-S01-C3C4.md.at-dispatch` (`diff` → no output), so the
seat read these words. Base commit `87b50e1e` verified as the parent of `b21fe942`.

**P1 (packet defect — a mandatory deliverable outside `allowed`).** §2 orders "new tokens go
inside the two existing token blocks AND into `tests/unit/t9-mode-tokens.test.ts`'s maps",
while §1's `forbidden` list names `tests/unit/t9-mode-tokens.test.ts` and "both token blocks".
A cluster that needed one new token would have had to choose which half of its own packet to
break. **It did not bite** — measured: `git diff 87b50e1e..9dd8042e -- apps/ui/app/globals.css
| grep -E '^[+-]\s+--[a-z]'` returns nothing, so C3/C4 declared zero tokens and consumed C1's
ten. Remedy: **ADVISORY** — reconcile the two lists in the next packet of this shape.

**P2 (stale count, confirms author concern 5).** §2 gate (3) says "the colour-literal hit list
is exactly the one pinned line and **the other six tests are green**". Measured at HEAD:

```
 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
```

t9 carries **9** tests since C1, so it is the other **seven**. `BASELINE.md`'s 2026-09-06
23:50 addendum already records 9 and is correct; the packet was cut against the older base row
and never re-issued. Remedy: **ADVISORY** — packets point at `BASELINE.md` rather than
restating its numbers.

**P3 (stale line citation — COMMON §10.24's class, in its worst form).** The packet's C2
follow-up section, and my own review packet §4, cite the SPEC R04 row-3 pin at
`tests/render/consent-storage.test.tsx:170`. At the reviewed HEAD that call is at **`:203`**
(`const essentialFromCard = decisionFor("essential-only", { quality: true, analytics: true });`);
line 170 is `expect(readConsent(), "clearing site data restores the first-visit state")`. The
number was correct before `b21fe942` inserted 33 lines above it — i.e. **the commit under
review moved the line the packet cites**. Remedy: **ADVISORY** — a citation into a file the
reviewed commit edits is stale by construction; cite `path:<line>@<commit>` or the anchor text.

**P4 (a remedy ordered as BINDING without being measured — COMMON §10.22).** The C2 follow-up
section orders the overload `decisionFor(c: "accept-all" | "essential-only"): ConsentDecision`.
Measured: that literal form makes the SPEC-pinning call at `consent-storage.test.tsx:203` a
compile error —

```
.review-scratch/sig-probe-raw.ts(8,41): error TS2345: Argument of type '"essential-only"' is not assignable to parameter of type '"save-choices"'.
```

— so obeying the packet literally would have deleted a frozen-SPEC assertion. The author's
deviation is correct (see §4). Remedy: **ADVISORY** — a signature dictated in a packet is
compiled against the repo before it is written down.

**P5 (PLAN defect — confirms author concern 1; a PLAN correction IS needed).**
`slices/S01/PLAN.md:341` (`S01-S18 · accept`) requires "the S01 block contains **exactly one**
`bottom:` declaration for `.consentBar`", while `PLAN.md:332` (`S01-S17 · test`) requires the
`@media (max-width: 719.98px)` rule to "drop the three insets to 12px" — which is a second
`bottom:` for `.consentBar`. The two serve frozen requirements **R29** and **R10**
respectively, so neither may be dropped; as written they are unsatisfiable together.
Remedy: **BINDING (measured: mutants B and O below prove the author's replacement form
discriminates in both directions)** — `S01-S18`'s `accept` clause is corrected to *"exactly one
UNCONDITIONAL `bottom:` for `.consentBar`, and every `bottom:` on `.consentBar` anywhere
matches `^calc\(\d+px \+ var\(--safe-b\)\)$`"*, which is what shipped. The edit is
line-count-preserving (`c` hunk, COMMON §10.31) and belongs on docs residue ticket
`t_38c6bbf2`. **Class:** a step's `accept` must never state a COUNT over an artifact a later
step in the SAME cluster writes into — the sibling of COMMON §10.28.

**Author's `SKILLS LOADED` vs the worker floor:** all seven present
(`using-superpowers, heartbeat-protocol, heartbeat-worker, test-driven-development,
verification-before-completion, systematic-debugging, receiving-code-review`), with an
explicit, unprompted declaration that the last two were loaded late. That is COMMON §10.9's
honest form; **no finding.** Self-report at
`.hermes/reports/consent-ui/agent-reports/CODE-S01-C3C4.md` (193 lines) meets the bar: named
causes, priced in minutes, dead ends, "what I nearly got wrong", four packet-unclarity
sections each with a location. Eight TOOLING-TRAPS entries appended under one dated heading.

---

## 2. What I verified, and how

Every command below was run by me, in my own detached worktree, at `9dd8042e`.

### 2.1 The three cluster commands, ×3 from a `.sh` under `/bin/bash` AND ×3 inline

Extracted verbatim out of `PLAN.md`'s fenced blocks by script (never retyped) into
`cmd-c2.sh` / `cmd-c3.sh` / `cmd-c4.sh`. The tool shell's `grep` is **ugrep 7.8.4**; a script
gets the system `grep`. Both agree on every run — every guard term here is ASCII-anchored, so
COMMON §10.16's glyph trap does not fire.

```
########## SCRIPT RUN 1 ##########
S01-C2 verdict=0   summary:      Tests  6 passed (6)  files: Test Files  1 passed (1)   ADR Status:Proposed lines: 1, debateai.consent mentions: 4   tsc ran: 1 exit 1, diagnostics outside the pin: 0
S01-C3 verdict=0   summary:      Tests  6 passed (6)  files: Test Files  1 passed (1)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
S01-C4 verdict=0   summary:      Tests  9 passed (9)  files: Test Files  1 passed (1)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
```

Runs 2 and 3 (script) and runs 1–3 (inline) are byte-identical to the above.
**Worst of six runs, per cluster:**

| cluster | worst verdict | worst suite | script 3/3 | inline 3/3 |
|---|---|---|---|---|
| `CMD-C2` | **0** | `Tests 6 passed (6)`, `Test Files 1 passed (1)` | 0,0,0 | 0,0,0 |
| `CMD-C3` | **0** | `Tests 6 passed (6)`, `Test Files 1 passed (1)` | 0,0,0 | 0,0,0 |
| `CMD-C4` | **0** | `Tests 9 passed (9)`, `Test Files 1 passed (1)` | 0,0,0 | 0,0,0 |

The author's claim (C2 6/6, C3 6/6, C4 9/9, verdict 0) is **confirmed**.

### 2.2 Standing gates, reported as deltas (COMMON §10.20)

- `pnpm exec vitest run tests/unit/t9-mode-tokens.test.ts` → exit 1,
  `Tests 2 failed | 7 passed (9)`. Both failures by name are the pinned pre-existing pair
  (`renders one accessible toggle…`, `leaves no mode-inert colour literal…`). Hit list is
  **exactly one element**:
  `…/apps/ui/app/globals.css:6112:background: color-mix(in srgb, #0a0806 32%, transparent);`
- `pnpm exec vitest run tests/render/auth-flow-integration.test.tsx` → exit 0,
  `Tests 17 passed (17)`.
- `pnpm typecheck` → exit 1, **8** diagnostics, **0 outside** the `tests/unit/s14-ui.test.ts`
  pin (`grep -E 'error TS' | grep -vc 's14-ui'` → 0).
- `cd apps/ui && npx tsc --noEmit -p tsconfig.json` → **exit 0, 0 diagnostics**, and
  `--listFiles` proves membership: both `components/consent/CookieBar.tsx` and
  `components/consent/CookiePreferencesCard.tsx` are in the project's file set.

### 2.3 Surface discipline

`git diff 87b50e1e..9dd8042e --name-only` = 8 files, every one inside the packet's `allowed`
list (C3's three, C4's two new + the shared stylesheet, and the C2 follow-up's three). No file
from COMMON §3's no-touch surface; `grep -nE 'register\(|adult_affirmed'` over the whole range
returns nothing, so the registration request shape is untouched.

`globals.css` discipline: **one** hunk, `@@ -7236,3 +7236,340 @@`, **zero** lines removed
(`grep -cE '^-[^-]'` → 0), opening marker at **`:7240`** with the file's previous last rule
intact at `:7236-7238`. Exactly one `/* === consent-ui S01 === */` and one
`/* === end consent-ui S01 === */`, and the block is the last thing in the file. The author's
claim is confirmed line for line.

**"Five other stylesheet-reading suites identical with/without the block"** — verified by
swapping `globals.css` to `87b50e1e` and back (a git write I fully reverted; porcelain shows
only my own `.review-scratch/`):

| suite | with the S01 block | without it |
|---|---|---|
| `tests/unit/pda-s03-keyboard-accessibility.test.ts` | `2 failed \| 3 passed (5)` | `2 failed \| 3 passed (5)` |
| `tests/unit/v2ui-pages.test.ts` | `5 failed \| 36 passed (41)` | `5 failed \| 36 passed (41)` |
| `tests/architecture/role-token-map.test.ts` | `3 failed \| 46 passed (49)` | `3 failed \| 46 passed (49)` |
| `tests/render/t3-library.test.tsx` | `4 failed \| 11 passed (15)` | `4 failed \| 11 passed (15)` |
| `tests/unit/v2ui-node-runner.test.ts` | `2 passed (2)` | — (matches BASELINE) |

Identical. The block causes none of it. Note for the orchestrator: three of those four RED
suites are **not in `BASELINE.md`** — inherited, but unpinned (see N-findings).

### 2.4 Design fidelity — my own extraction, my own render, codepoint for codepoint

I did not read the author's fixtures. I extracted every visible string of artboards 10a and
10b **mechanically** from `design/turn-10-cookie-consent.html` and `design/design-data.js`
(`code-rev-s01-c3c4-r1-extract-design-strings.mjs`), then mounted both components in my own
jsdom probe and compared the rendered text nodes, in DOM order, by codepoint.

```
 ✓ REV C3 — the bar (10a) … renders exactly the design's strings, in the design's DOM order, codepoint for codepoint
 ✓ REV C3 … is a labelled region, is not a dialog, and pulls no focus
 ✓ REV C3 … offers no dismissal that is not a decision
 ✓ REV C3 … hands the clicked element to onChoose so focus can be returned in C6
 ✓ REV C4 — the preferences card (10b) … renders exactly the design's chrome + category strings, in DOM order, codepoint for codepoint
 ✓ REV C4 … COOKIE_CATEGORIES itself equals design-data.js cookieCats, string for string
 ✓ REV C4 … locks Essential against click, Space and Enter — asserted after EVERY activation
 ✓ REV C4 … the two operable switches answer click AND Space (and Enter)
 ✓ REV C4 … a seeded decision is reflected on open, from either entry point
 ✓ REV C4 … Save choices emits the CURRENT toggles once; Essential only emits row 3
 ✓ REV C4 … is a dialog named by its own visible title, and adds no keydown handler of its own
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

**DESIGN-STRING MISMATCHES FOUND: 0** — 24 strings compared (6 bar: eyebrow, title, body and
the three buttons in the design's DOM order · 6 card chrome: eyebrow, title, lede,
`Privacy notice` · `Essential only` · `Save choices` · 12 category strings), including
U+2014 in the bar title, U+2192 in the lede and U+2019 in the quality description. No close
glyph in any of six spellings on either surface. `COOKIE_CATEGORIES` itself deep-equals
`cookieCats`.

The behavioural charges are all discharged **by run-time probe, not by reading**: the bar is a
`role="region"` named `Cookie consent`, is not a dialog, holds exactly three focusable
descendants in DOM order, never moves focus, survives Escape on the document AND on itself
while invoking no callback and writing nothing; `onChoose` receives the clicked button so C6
can return focus. The card is `role="dialog" aria-modal="true"` labelled by its own visible
title, its Essential switch is `aria-disabled` (not `disabled`, so still focusable) and does
not move on click, Space, Enter or `Spacebar`; the other two answer click **and** Space **and**
Enter; a seeded `{quality:false, analytics:true}` is reflected on open; `Save choices` emits
the current toggles exactly once and `Essential only` emits row 3 without also saving; neither
component reaches `localStorage`. The card adds **no keydown handler of its own** beyond the
switch's JSX `onKeyDown` — no `addEventListener`, no `.focus()`, no quoted `Escape`, and no
`document` reference in the source; Escape dispatched at the card is inert, which is correct
because the Esc stack arrives in C6 via `modalSemantics.ts`.

### 2.5 Mutation — 15 mutants of my own, planted with a unique-anchor checker

Each mutant is an exact literal replacement whose planter **exits 2 unless the anchor occurs
exactly once**, so the author's own trap (a `perl -0pi` mutant that silently never applied)
cannot happen here. Every mutant reverted with `git checkout HEAD --`; tracked-dirty count
printed as 0 after each.

| # | mutant | caught by |
|---|---|---|
| B | a second, unconditional `bottom: 88px` on `.consentBar` | author `consent-bar` **FAIL** |
| C | revert the `const id` narrowing (the live `TS7053`) | `apps/ui` tsc **FAIL** |
| D | ignore `initial`, open at `false/false` | author `consent-card` + my probe **FAIL** |
| E | em dash → hyphen in the bar title | author + mine **FAIL** |
| F | drop the `Essential only` button | author + mine **FAIL** |
| F2 | move `Essential only` after `Accept all` | author + mine **FAIL** |
| G | add a `×` close control to the bar | author + mine **FAIL** |
| H | inline a category description in the card | author + mine **FAIL** |
| I | `Save choices` swaps quality/analytics | author **FAIL** (my probe missed it — my fixture was symmetric; the author's is not) |
| J | drop `aria-labelledby` | author + mine **FAIL** |
| N | switch stops answering Space | author + mine **FAIL** |
| K | a colour literal inside the S01 block | author bar+card **FAIL**, `CMD` terms **FAIL(hits=2)** |
| L | a second delimited S01 block | author bar+card **FAIL**, `CMD` terms **FAIL(blocks=2)** |
| M | the 719.98px media query neutralised | author `consent-bar` **FAIL** |
| O | a route-conditional `.debateRoute .consentBar` offset | author `consent-bar` **FAIL** |

**Three mutants SURVIVED — and I proved all three are EQUIVALENT, not holes.** `A` (drop
`flip`'s `category.locked` guard), `A3` (the same edit) and `A2` (make `stateOf` read
`toggles[id] ?? true`) each leave every suite green, because the lock has **two redundant
enforcement points**: `stateOf` hard-codes `true` for `essential`, and `flip` returns early.
Breaking either alone changes nothing observable. `A4`, which breaks **both**, is caught:

```
 FAIL  tests/render/consent-card.test.tsx > S01-C4 … > locks Essential against click, Space and Enter alike
      Tests  1 failed | 8 passed (9)
```

**Author concern 4 is discharged in full**: all three of the properties that were
green-while-wrong (the locked switch, the unanchored `/bottom:/`, the live `TS7053`) now fail
against my independently-authored mutants.

**The harness-trap question, answered:** no false conclusion survived into the shipped tests.
My 15 mutants were built from the SPEC and the design without reading the author's harness,
planted with a unique-anchor guard, and every observable one was caught. The author's two
harness bugs (`perl -0pi` silent no-op; unanchored `s///` patching 4,000 lines above the
block) cost them time and one near-miss conclusion, and both are recorded in TOOLING-TRAPS
with the generalised class. Neither reached the tests.

### 2.6 The C2 follow-up (`b21fe942`) — the round-1 reviewer's probe, re-run at HEAD

`probes/code-rev-s01-c1c2-r1-spec-properties.test.tsx`, unmodified except for the import depth:

```
P1 readConsent() -> null
P2 decidedAt="yesterday" -> null      P2 decidedAt="" -> null
P2 decidedAt="1788723500905" -> null  P2 decidedAt="2026-13-45T99:99:99Z" -> null
 ✓ P1: a SIXTH member in a stored record
 ✓ P2: decidedAt present as a string but NOT an ISO-8601 UTC instant
 ✓ P3 (control): all five members but essential:false
 × P4: `Save choices` invoked with no toggles silently writes false/false
 ✓ P5  ✓ P6  ✓ P7
      Tests  1 failed | 6 passed (7)
```

**P1 and P2 now pass** (was `3 failed | 4 passed (7)` at `87b50e1e`). **P4 is `TYPE-LEVEL —
cannot pass`**: vitest transpiles `.tsx` without typechecking, so the call still executes.
That is the remedy working as designed, not the remedy failing.

**The type-level discharge, measured by me.** My own `sig-probe.ts` under a scratch tsconfig:

```
# with the shipped overloads, the @ts-expect-error on decisionFor("save-choices") is SATISFIED:
exit=0
# with the directive removed, the raw diagnostic:
.review-scratch/sig-probe-raw.ts(16,39): error TS2345: Argument of type '"save-choices"' is not assignable to parameter of type '"accept-all" | "essential-only"'.
```

and the three lawful forms — `decisionFor("essential-only", {…})`, `decisionFor("essential-only")`,
`decisionFor("save-choices", {…})` — all compile. The author's transcript is reproduced exactly.

**The signature deviation: ACCEPTED.** Measured. Applying the packet's literal first overload
to `apps/ui/lib/consent.ts` and re-running:

```
.review-scratch/sig-probe-raw.ts(8,41): error TS2345: Argument of type '"essential-only"' is not assignable to parameter of type '"save-choices"'.
```

— i.e. it breaks `consent-storage.test.tsx:203`, the R04 row-3 pin that `Essential only`
produces the identical object from the bar **and from the card** (the entry point that HAS
toggles). The shipped form is a strict superset: it admits every call the packet's overloads
admit, and the ruling's operative clause — `decisionFor("save-choices")` must not compile —
holds. The deviation preserves a frozen-SPEC assertion the packet's wording would have
deleted. **ACCEPTED.** Correction to the author's own account: the diagnostic is **TS2345**,
not `TS2554`, and the call is at `:203`, not `:170` (see N8).

---

## 3. Findings

Every finding names its CLASS and marks its remedy `BINDING (measured: …)` or `ADVISORY`
(COMMON §10.22). **No blocking findings (B) were found.**

### N1 — the card's `Save choices` ships the BAR's horizontal padding (design fidelity)
`apps/ui/app/globals.css:7338-7348` (`.consentPrimary`, `padding: 10px 19px` at `:7347`).
One `.consentPrimary` serves both surfaces, but the artboard draws them differently —
extracted mechanically from `design/turn-10-cookie-consent.html`:

```
Accept all       padding=10px 19px  border=NONE      (10a, line 39)
Save choices     padding=10px 18px  border=NONE      (10b, line 130)
I have read it   padding=10px 18px  border=NONE      (10c, line 94)
```

**Concrete outcome:** the card's primary button renders 2px wider than the design on every
viewport, in both modes. **CLASS:** one class serving two artboards silently adopts the first
artboard's values for the second; every shared class must be diffed against *each* artboard
that uses it. Neither SPEC R09 nor R15 pins the button paddings, so no test in this mission
can ever catch this — V would see it only by eye.
**Remedy: BINDING (measured: the extraction above, `code-rev-s01-c3c4-r1-extract-design-strings.mjs`
generalised to the `padding:`/`border:` pairs).** Add a `.consentCardFooter .consentPrimary
{ padding: 10px 18px; }` rule inside the S01 block, and add the two paddings to
`consent-card.test.tsx`'s `expectDeclarations` list so the value is pinned.

### N2 — both primaries carry a 1px border the design does not draw (design fidelity)
`apps/ui/app/globals.css:7340` — `border: 1px solid var(--ink)`. No design primary has a
border (table in N1). With `* { box-sizing: border-box }` at `:176-177` and `width: auto`, the
used size is content + padding + border, so the shipped primary is **2px taller and 2px wider**
than the artboard's. It also breaks a deliberate design equality: the design's ghost pills are
`padding: 9px 15px` **+ 1px border** = 10px of effective edge, and the design's primary is
`padding: 10px` **+ 0 border** = 10px — equal heights by construction. Shipped, the primary
has 11px and stands 2px proud of the pills beside it in the same `align-items: center` row.
**CLASS:** adding a border "for symmetry" to a design that achieved symmetry by *omitting* one.
**Remedy: BINDING (measured: the design extraction; the box model is arithmetic over
`globals.css:176-177`, `:7340`, `:7347` and design lines 37-39).** Drop the declaration, or
replace it with `border: 1px solid transparent` if a transparent edge is wanted for hover
states; pin `border` in the card/bar declaration lists either way.

### N3 — the 10b knob's shadow is 1px blurrier than the design
`apps/ui/app/globals.css:7518` uses `var(--shadow-thumb)` = `0 1px 4px rgba(0,0,0,.3)`
(`:55`); the design's knob is `box-shadow:0 1px 3px rgba(0,0,0,.3)`
(`turn-10-cookie-consent.html:121`). **CLASS:** reusing an existing token because its *shape*
matches without diffing its *value*. **Remedy caveat, measured:** `--shadow-thumb` may **not**
be re-valued — it is consumed by `.ndSlider::-webkit-slider-thumb` and `::-moz-range-thumb` at
`globals.css:5106` and `:5115`, another mission's surface, and S01 owns the token blocks.
**Remedy: BINDING (measured: `code-rev-s01-c3c4-r1-token-value-diff.py`, which prints this as
the one mismatch among the tokens S01 itself declares).** Declare a new token
(e.g. `--shadow-knob: 0 1px 3px rgba(0,0,0,.3)`) inside both token blocks, register it in
`tests/unit/t9-mode-tokens.test.ts`'s maps comma-tight, and point `.consentKnob` at it. Note
this crosses into the token-block surface, which the packet's §1 forbids to C3/C4 — route it
to whichever cluster next holds the token blocks (see P1).

### N4 — the design's motion on `Accept all` is not shipped, and the handoff makes the omission permanent
The artboard gives the bar's primary `transition:transform .5s cubic-bezier(.34,1.56,.64,1)`
and a hover `transform:scale(1.04)` (`turn-10-cookie-consent.html:39`). Measured: the S01
block (`globals.css:7240-7575`) contains **no `transition`, no `animation` and no `:hover`
rule at all**. SPEC **S01-R27** explicitly permits this — "…or contains no animation at all"
— so shipping zero motion is lawful. The finding is that the author's handoff converts a
silent omission into guidance for a later cluster ("C7's S01-S43 is satisfied by its first
branch and needs no reduced-motion rule"), which makes it permanent without a ruling.
**CLASS:** an unshipped design affordance that becomes policy through a handoff sentence.
**Remedy: ADVISORY** — one V/orchestrator ruling: ship the hover transition (and then C7 owns
a `prefers-reduced-motion` block), or record in `DECISIONS.md` that 10a's hover motion is
dropped and why. Either way it stops being an accident.

### N5 — two tag-pill families are computed one way and the third another
The design builds every pill from `mkCat`'s `tagBg = tint(tagC, dark?.14:.1)` and
`tagBorder = tint(tagC, dark?.5:.4)` (`design-data.js:42-48`) — an alpha tint over the card
core. Measured token values:

```
MISMATCH --ok-bg        light #E6ECE2  want rgba(62,122,78,0.1)     chamber #2A2E24  want rgba(134,181,141,0.14)
MISMATCH --ok-border    light #ADC5AF  want rgba(62,122,78,0.4)     chamber #4F654F  want rgba(134,181,141,0.5)
MISMATCH --gold-bg      light #F3ECE0  want rgba(168,130,62,0.1)    chamber #342A1B  want rgba(200,160,85,0.14)
MISMATCH --gold-border  light #D9C8A9  want rgba(168,130,62,0.4)    chamber #705A33  want rgba(200,160,85,0.5)
ok       --muted-bg     rgba(110,103,92,.1)  | rgba(156,144,122,.14)
ok       --muted-border rgba(110,103,92,.4)  | rgba(156,144,122,.5)
```

All four mismatching tokens are **pre-existing** (`2b670d30:apps/ui/app/globals.css:29,120` and
`:22,114`) and COMMON §7 itself sanctions reusing them ("`--gold-bg`/`--gold-border` exist for
tag pills"), so this is not the author's invention. The consequence is that the Essential and
Model-quality pills render at opaque approximations while the Product-analytics pill (C1's own
`--muted-bg`/`--muted-border`, which DO follow the formula) renders at the design's alpha —
three pills side by side, two colour systems. **CLASS:** a token map that says "an existing
token exists" without saying "and its value equals the design's".
**Remedy: ADVISORY** — the orchestrator either records in COMMON §7 that the four pre-existing
tokens are accepted as-is for these pills, or S01 declares tinted variants like it did for
`--muted-*`. A decision, not a repair.

### N6 — `initial` is read once, and nothing says so where C5/C6 will read it
`apps/ui/components/consent/CookiePreferencesCard.tsx:64-67` — `useState<ConsentToggles>({
quality: initial.quality, analytics: initial.analytics })`. The initialiser runs at mount only.
Measured (`code-rev-s01-c3c4-r1-stale-initial.test.tsx`):

```
after re-render with a DIFFERENT initial -> ["true","true","false"]
AssertionError: second open, same mounted instance: expected [ 'true', 'true', 'false' ] to deeply equal [ 'true', 'false', 'true' ]
 ✓ a remount DOES pick the new initial up (the shape C5 must use)
```

**Concrete failure the downstream clusters can walk into:** `CookieConsent` (C5) renders the
card once and toggles its visibility, or re-renders it with a fresh `initial` after a save
without unmounting. The visitor saves `{quality:false, analytics:true}`, reopens from
Settings → Privacy, sees the OLD `{quality:true, analytics:false}`, presses `Save choices`, and
a consent record **the visitor never chose** is written. That is the same class as the N2
defect this very follow-up commit fixed — a silent, type-legal write of a consent value nobody
picked. The prop's own doc says "as the card opens" (`:41`), which is the right contract but
does not tell the consumer that a re-render is not an open.
**CLASS:** a prop read once by an initialiser must say so at the prop, and the constraint must
be pinned in the cluster that mounts the component.
**Remedy: BINDING (measured: the probe above, copied to
`.hermes/reports/consent-ui/probes/code-rev-s01-c3c4-r1-stale-initial.test.tsx`).** In C4's own
surface: extend the `initial` JSDoc to "read once, by the mount; the caller mounts the card
fresh for each open — a re-render with a new `initial` is ignored." In C5/C6: the card is
mounted conditionally (or carries a `key` that changes per open), and that cluster's suite runs
this probe.

### N7 — the N2 remedy has no regression guard, because `tests/**/*.tsx` is typechecked by nothing
Measured. Deleting **both** overloads from `apps/ui/lib/consent.ts:176-180` — a complete
regression of the fix this commit exists to deliver — leaves every gate in the repo green:

```
apps/ui tsc exit=0
root typecheck, diagnostics outside the pin: 0
C2+C4 suites exit=0   Tests  15 passed (15)
```

Root cause, measured with `--listFiles`: root `tsconfig.json` `include` is `tests/**/*.ts`
(not `.tsx`) and `exclude`s `apps/ui`; `apps/ui/tsconfig.json` is rooted at `apps/ui`. So:

```
apps/ui/components/consent/CookieBar.tsx              apps/ui:1  root:0
apps/ui/components/consent/CookiePreferencesCard.tsx  apps/ui:1  root:0
apps/ui/lib/consent.ts                                apps/ui:1  root:0
tests/render/consent-bar.test.tsx                     apps/ui:0  root:0
tests/render/consent-card.test.tsx                    apps/ui:0  root:0
tests/render/consent-storage.test.tsx                 apps/ui:0  root:0
```

**All three of this mission's `.tsx` tests are typechecked by no project.** COMMON §10.30 was
written to close exactly this class ("never sees a created component **or a `.tsx` test**") and
its `apps/ui` arm closes the component half only — which is why the real call site in
`CookiePreferencesCard.tsx` IS protected while the remedy itself is not.
**CLASS:** a remedy whose only witness is the compiler needs a compiler-visible pin, and a
project that does not include a file cannot pin anything in it.
**Remedy: BINDING (measured).** Two parts, both measured by me:
1. Place a pin in a file the `apps/ui` project covers — `// @ts-expect-error` immediately above
   a `decisionFor("save-choices")` call. Removing the overloads then yields
   `error TS2578: Unused '@ts-expect-error' directive.` (measured against my own `sig-probe.ts`),
   so the regression fails a gate that already runs.
2. Orchestrator-level: add `"tests/**/*.tsx"` to the root `tsconfig.json` `include`, measure the
   resulting diagnostic count once, and pin it in `BASELINE.md` as a new row. Outside this
   cluster's surface, so it is a ticket, not an edit.

### N8 — two verbatim slips in the author's handoff (`heartbeat-protocol` §2.6)
(a) The literal-signature break is reported as `TS2554`; measured it is
`TS2345: Argument of type '"essential-only"' is not assignable to parameter of type '"save-choices"'.`
(b) The R04 row-3 pin is cited at `consent-storage.test.tsx:170`; at HEAD it is `:203`, moved
by the same commit's own +33 lines. Neither changes a conclusion, and the author's *proof*
transcript for the operative clause is exact. **CLASS:** an error code and a line number
presented as measurements are measurements. **Remedy: ADVISORY** — correct both in the rework
comment or the next handoff; cite lines into a file the commit edits as `path:line@commit`.

### N9 — three RED-at-base suites this slice's stylesheet reaches are not in `BASELINE.md`
`tests/unit/pda-s03-keyboard-accessibility.test.ts` (`2 failed | 3 passed (5)`),
`tests/unit/v2ui-pages.test.ts` (`5 failed | 36 passed (41)`) and
`tests/architecture/role-token-map.test.ts` (`3 failed | 46 passed (49)`) all read
`globals.css`, which S01 is the sole writer of, and none is pinned. I proved they are
byte-identical with and without the S01 block (§2.3), so nothing is wrong today — but COMMON
§10.14's own class ("a baseline covers every file a plan CONSTRAINS, not only every file it
CHANGES") applies: the next S01 cluster that touches the stylesheet has no pin to assert a
delta against. **CLASS:** the constrained-file set is larger than the changed-file set.
**Remedy: BINDING (measured: the with/without table in §2.3, saved as
`code-rev-s01-c3c4-r1-other-suites-{with,without}-block.out`)** — add the three rows to
`BASELINE.md` with their named failing tests before cluster C5 is dispatched.

---

## 4. What I did NOT verify

- **Every rendered pixel.** jsdom computes no layout: the 22px/12px insets, the 7px bezel, the
  52×4 tab, the 560px copy column, the 520px card, the 92vh cap, the 38×22 toggle, whether the
  bar actually stacks below 720px, whether `cursor: not-allowed` is perceptible, whether the
  focus ring is visible, and whether either surface follows the mode toggle live. All V's,
  acceptance steps 1-2, 6, 13, 14, 15, 18. My N1/N2/N3 geometry findings are diffs of the
  DECLARED values against the design's declared values — arithmetic, not rendering.
- **Both modes as rendered.** I diffed the chamber token VALUES; I did not render in chamber.
- **Screen-reader announcement** of the dialog. Nobody has verified this; S01-S24's own
  refutation row says so.
- **The 720px derivation as a measurement.** I checked the arithmetic is restated identically
  in the stylesheet, the test and SPEC R10; I did not measure a real browser's text metrics.
- **`onDismiss`**, deliberately unwired here — its behaviour is C6's.
- **Cross-mission regressions beyond the ten suites** I ran.
- **`reviews/CODE-REV-S01-C1C2-r1.md`** — a prior lens's conclusions, unread by rule
  (COMMON §10.26). I judged the C2 follow-up from the packet's charge and the probe file only.

---

## 5. Predictions (falsifiable evidence that blindness held)

I expect the other lens on this work to converge with me on the cluster numbers (they are
deterministic) and on the C2 follow-up's ACCEPTED status, because the compiler transcript is
unambiguous once you run it. **Where I expect them to differ:**

1. **I predict they did not find N1 or N2** — the `10px 19px` vs `10px 18px` split and the
   added border. Both require extracting the design's `padding:`/`border:` pairs per artboard
   and noticing that ONE CSS class serves TWO of them; a reviewer who checks "R09's numbers
   appear as written" (which they do) and moves on will pass over it. This is the finding I
   would check first if I were them.
2. **I predict they reported the surviving locked-switch mutant as a HOLE**, if they planted
   it at all. It is the intuitive read and it is wrong; only the double mutant `A4`
   distinguishes "untested" from "defended twice". If their verdict carries a B-finding about
   the Essential lock, ask them for the `A4` run.
3. **I predict they did not measure N7** — that deleting both overloads leaves every gate
   green. Discovering it requires regressing the fix and re-running the gates, which feels
   perverse right after confirming the fix works. It is the most consequential thing I found.
4. **I predict they treated `--shadow-thumb` as correct** because it is an existing token with
   the right shape, and did not diff its value against `turn-10:121`.
5. **I expect agreement on P5** (the S01-S17/S01-S18 contradiction) — the author declared it
   loudly, so both lenses were pointed at it. If they call it non-blocking too, the PLAN
   correction is safe to make.
6. **I predict a difference on N6.** A reviewer reading `initial`'s doc ("as the card opens")
   will read the contract as satisfied and not probe a re-render. I only found it by rendering
   the same root twice.

If a later lens produces a B-finding I marked N, the disagreement worth resolving first is
whether "no gate can see this regress" (N7) should block. I judged not, because the code is
correct today and the missing guard is a mission-level tsconfig fix outside this cluster's
surface — but I state it so the orchestrator can overrule me on the record.

---

## 6. Housekeeping

- Scratch: `/private/tmp/.../scratchpad/CODE-REV-S01-C3C4-r1/` (per COMMON §10.11) and
  `.worktrees/rev-s01-c3c4/dialectical-engine/.review-scratch/`, deleted before handoff.
- Probe kit copied to `.hermes/reports/consent-ui/probes/code-rev-s01-c3c4-r1-*` (19 files)
  **before** this verdict, per COMMON §10.26.
- Git writes: only in-scratch probes, each reverted with `git checkout HEAD -- <path>`;
  `git status --porcelain` is empty at handoff.
- I edited nothing under review, marked nothing Done, dispatched no subagent.

`comments read through: 4` (on `t_14e117ec`) · `comments read through: 2` (on `t_efab9b5f`)
