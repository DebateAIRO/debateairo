# REV(S01) pass 3 — lens **product-truth** · verdict **REWORK** (pass 3 = a V row)

- seat `REV-S01-p3-product-truth` · ticket `t_19085d3f` · slice ticket `t_11abead2` (V's) · mission `debate-tiers`
- head under review **`9ddbb1ef`** (FIX(S01) pass 2), detached READ-ONLY in
  `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-product/dialectical-engine`
  (`git rev-parse --short HEAD` = `9ddbb1ef`, `git status --porcelain` = 0 lines at claim and at handoff)
- base `7f89f7b7` · pass-1 head `f6c147cc` · pass-2 head `53b903d2`
- scope (package `review-packages/S01-p3/README.md` §5): items **2** (the pass-1/2 seam probes in the DOM)
  and **3** (the oracle in the real DOM, both modes). Items 1 and 5 at the test level, and the security
  probes, are the correctness lens's (`t_479e4751`).
- residue NOT re-judged here (README §4): rows V-20…V-24 · product-p2 N2 (hints) · correctness-p2 N4 ·
  security T4 · pass-1 product N3.
- 2026-09-10, 06:45–07:2x EEST.

---

## 1. What I ran, and on what

My own stack, nothing of V's touched. UI dev server from **my** worktree on **:3015**, my stub API on
**:8815**, both background, logging to files, both killed at handoff; the harness Browser pane tab
**tab-9**, created by me and closed by me. `:3000`, `:8790`, `127.0.0.1:55432`, `.local/**` and the
S01/S02 lanes: never opened, never read, never listened on. Listener baseline honoured — `:3000` and
`:8790` had no listener when I started and none that I created when I finished.

Every number below is `getComputedStyle` / `getBoundingClientRect` / `document.elementFromPoint` on the
**rendered DOM with the real compiled CSS** (`/_next/static/css/app/layout.css`, 1421 top-level rules,
1497 leaf rules as the browser parsed them), and every interaction is a **trusted** event injected from
outside the page (`isTrusted: true` recorded at the listener) — never a synthetic `el.click()`.

**Cluster commands, re-run by me** at `9ddbb1ef` (probe `probes/REV-S01-p3-product-truth/clusters.sh`,
worktree from `$WORKTREE`, not hard-coded):

| run | S01-C1 (8 pairs) | S01-C2 (9) | S01-C3 (6) | S01-C4 (11) |
|---|---|---|---|---|
| 1 | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN |
| 2 | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN |
| 3 | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN | CLUSTER_GREEN |

12 cluster runs, all green, every pair matching its declared `passed:failed` (the declared failures are
the pre-existing ones the pairs encode; none is new). Raw logs:
`probes/REV-S01-p3-product-truth/clusters-three-runs.log`.

---

## 2. Scope item 2 — the seam probes now show the OPPOSITE of pass 2 (VERIFIED)

The pass-2 probe `probes/REV-S01-p2-product-truth/seam-lock-mutant.js` could not be re-run verbatim:
it was written against a page that shipped `aria-disabled`, so its mutant **sets** `disabled = true` and
its "revert" **sets `disabled = false`**. At `9ddbb1ef` that revert is the defect — it would leave all
fourteen controls live in the DOM. I inverted it (mutant = remove `disabled`; restore = put it back) and
promoted the inverted probe as `probes/REV-S01-p3-product-truth/seam-lock-p3.js`. See **N1**.

Free chosen, `⚙ OPTIONS` open, Terracotta, all fourteen controls, RED→GREEN→RED:

| | AS-SHIPPED `9ddbb1ef` | MUTANT (`disabled` removed = `53b903d2`) | RESTORED |
|---|---|---|---|
| `nativeDisabled` | `true` ×14 | `false` ×14 | `true` ×14 |
| `aria-disabled` | `null` ×14 | `null` ×14 | `null` ×14 |
| inline lock style | none (only `--nd-pct` / `height`) | none | none |
| `el.focus()` accepted | **0 of 14** | **14 of 14** | 0 of 14 |
| `document.activeElement` after | **unchanged ×14** | changed ×14 | unchanged ×14 |
| focus ring on the box | `none` ×14 | `solid 2px rgb(193,95,60)` on `steeringPresets`, `steeringAnnotations`, `depthMode`, `scrutinyDepth` | `none` ×14 |
| box `opacity` | `0.45` ×14 | `1` ×14 | `0.45` ×14 |
| `cursor` under the pointer | **`not-allowed` ×14** | `pointer` ×12 / `text` ×2 | `not-allowed` ×14 |

`RESTORED` is byte-identical to `AS-SHIPPED` on every field, so the mutant is reverted and the
as-shipped reading reproduces. The three things the package README named are all measured:

**(a) A trusted click on the `Fixed ▾` box under Free** (V's own TEST(S01) step). Terracotta, click at
the box centre, `document.elementFromPoint` = `SELECT#depthMode`:

```
events recorded : [ pointerdown : SELECT (trusted: true) ]      <- and nothing else
activeElement   : BODY  before -> BODY  after                    (unchanged)
.ndSelect outline: none 3px rgb(41,38,31)      select outline: none
.ndSelect opacity: 0.45      visible label: "Fixed"   (picker did not open)
```

No `mousedown`, no `mouseup`, no `click`, no `focus`, no `focusin` — Chrome stops all of them at a
disabled control; only `pointerdown` survives, and it changes nothing. At pass 2 this same click focused
the select and painted `solid 2px rgb(193,95,60)`. **Chamber, same click: zero events of any kind**,
`activeElement` BODY, outline `none 3px rgb(242,234,217)` (i.e. none), opacity `0.45`, label `Fixed`.

**(b) ArrowRight on `#treeDepth` changes nothing.** `el.focus()` is refused (`activeElement` stays
`BODY`), so three trusted `ArrowRight` presses produce **three `keydown`s on BODY and no `input`, no
`change`**; `value` stays `"2"`, `--nd-pct` stays `25%`, the readout stays `2`. At pass 2 the same key
produced `keydown → input(val "3") → change(val "2")` — the control moved and React rolled it back.
**The lock is now in the control, not in a JavaScript rollback.**

**(c) The `:disabled` rules are matched by exactly 14 elements.** `document.querySelectorAll(".ndSegItem:disabled, .ndSlider:disabled, .ndSteerInput:disabled, .ndSelect:has(select:disabled)").length` = **14** with the panel open (**9** with it collapsed, matching M8's "nine on the collapsed screen"), in both modes.

**Extra refutation attempts, all failed to break the lock:**
- *Type-ahead on a locked `<select>`* (the sharpest attack left — it needs no picker). Free, panel open,
  `scrutinyDepth.focus()` refused; trusted `d`, `e`, `ArrowRight`×3 → five `keydown`s landed on the
  previously focused `.ndOptionsToggle`; `scrutinyDepth` stayed `standard`/"Standard" and `depthMode`
  stayed `fixed`/"Fixed". Under **Premium** the identical trusted `d` moved it to `deep`/"Deep" — so the
  key path is real and it is the `disabled` attribute that stops it.
- *Trusted click on a locked pill* (`riskTier-casual`, Free): only `pointerdown`; `riskTier` stayed
  `standard`. *Trusted click + 22 typed characters into `steeringPresets`* (Free): only `pointerdown`;
  the box stayed `""` and nothing leaked into the question box.
- *`product-p2 N1` (the pre-existing `cursor: pointer` winning at the hit point over the two dropdowns)*
  is **FIXED**: `cursorUnderPointer` is `not-allowed` on all fourteen including `depthMode` and
  `scrutinyDepth`, where pass 2 measured `pointer` in all three variants.

**Verdict on scope item 2: every claim holds, measured, in both modes.**

---

## 3. Scope item 3 — the oracle in the real DOM, both modes

### 3.1 M8 — the lock, and "nothing else"

Locked-vs-live is a controlled A/B on the same elements (mutant in, mutant out). I diffed **every**
paint-bearing computed property of all fourteen — `color`, `backgroundColor`, `backgroundImage`,
`borderTop{Color,Width,Style}`, `borderRadius`, `webkitTextFillColor`, `textDecorationLine`, `filter`,
`boxShadow`, `fontWeight`, `accentColor`, `::before`/`::after` `content`, plus the `.ndSelect` box, its
caret, its visible label, and the textareas' `::placeholder` and `resize`.

**Exactly one property differs between disabled and enabled, on four elements:**

```
treeDepth.borderTopColor      : disabled "rgba(118,118,118,0.3)"  vs enabled "rgb(41,38,31)"
branchingWidth.borderTopColor : (same)
concurrency.borderTopColor    : (same)
maxTokens.borderTopColor      : (same)
```

That is Chrome's UA `:disabled` border colour, and it is **invisible**: those elements compute
`border-top-style: none` and `border-top-width: 0px` in both states. Nothing else moves — no glyph, no
colour change, no visible border change. **M8's "and nothing else" holds.**

I also proved *why* it holds rather than trusting the diff. Enumerating the compiled stylesheet, the
whole app has **24** `:disabled` rules, and exactly **two** can match an S01 control:

```
.ndSegItem:disabled, .ndSlider:disabled, .ndSteerInput:disabled, .ndSelect:has(select:disabled)
                                                        -> opacity: 0.45; cursor: not-allowed;
.ndSelect select:disabled                               -> cursor: not-allowed;
```

(`.ndStart:disabled -> opacity: 0.45; cursor: not-allowed` is M11's, and no other rule in the sheet
touches `.ndSegItem` / `.ndSlider` / `.ndSteerInput` / `.ndSelect`.) The sliders are fully author-painted
— `.ndSlider { appearance: none }`, `.ndSlider::-webkit-slider-runnable-track` and
`::-webkit-slider-thumb` are author rules with **no `:disabled` variant** — so the UA paints no disabled
widget of its own. **"The stylesheet's `:disabled` rules the only paint" is confirmed by enumeration,
not by inspection.**

Counts, both modes: **9** dimmed collapsed (+`ndStart` while the question is empty = the 10 of artboard
3) · **14** dimmed with the panel open and the question typed (= the 14 of artboard 13) · **15** with the
panel open and the question empty (14 + `ndStart`). The two dimmed `.ndSelect` **outer** boxes are in the
list, as M8 requires. Never dimmed by the tier: `⚙ OPTIONS` toggle `1`, question box `1`, `Cancel` `1`,
the `Settings →` line `1`, the panel notice line `1`.

### 3.2 M1–M7, M9–M12, M15 — measured, both modes

**M1** `role="radiogroup"`, `aria-label="Plan tier"`, `display: grid`,
`grid-template-columns: 239.5px 239.5px` (= `repeat(2, minmax(0,1fr))`), `gap: 10px`,
`margin-top: 20px`; it sits between the `h1` "What should we debate?" and `.ndTopicBezel`, which keeps
its own `margin-top: 20px`; `.ndTier` bottom ≤ question-box top (above the question box, SPEC step 1). No
visible label above it.

**M2/M3/M4/M5/M6/M7 · Terracotta → Chamber** (every value is the token DONE.md names):

| | Terracotta measured | Chamber measured | token |
|---|---|---|---|
| M2 chosen border | `1px solid rgba(41,38,31,0.2)` | `1px solid rgba(242,234,217,0.18)` | `--line-strong` |
| M2 chosen background | `rgb(239,233,224)` | `rgb(34,29,23)` | `--shell` `#EFE9E0`/`#221D17` |
| M3 unchosen border | `1px solid rgba(41,38,31,0.1)` | `1px solid rgba(242,234,217,0.09)` | `--line` |
| M3 unchosen background | `rgb(253,251,246)` | `rgb(24,20,16)` | `--core` `#FDFBF6`/`#181410` |
| M2/M3 radius · padding · gap · cursor | `12px` · `13px 14px` · `9px` · `pointer` | identical | — |
| M4 pill bg / colour / weight | `rgb(41,38,31)` / `rgb(249,246,241)` / `700` | `rgb(242,234,217)` / `rgb(20,17,14)` / `700` | `--ink` / `--bg` |
| M4 pill padding · radius · size | `4px 12px` · `999px` · `10.5px` | identical | — |
| M5 unchosen pill | `transparent` / `rgb(110,103,92)` / `600` | `transparent` / `rgb(156,144,122)` / `600` | `--muted` |
| M6 promise | `11.5px` / `rgb(85,81,71)` | `11.5px` / `rgb(181,168,143)` | `--text-2` |
| M7 id colour | `rgb(110,103,92)` | `rgb(156,144,122)` | `--text-3` |

**M6 copy, verbatim:** Free `Every gauge fixed. The question is yours.` · Premium
`Every gauge yours to set.` — both present in both chosen states.

**M7** wrapping row `display: flex; flex-wrap: wrap; gap: 10px`; each id `JetBrains Mono` `10.5px`
weight `500`; a `7px × 7px` dot before each. Order and dots, scoped per option (both modes):
Free = `gpt-5.6-luna` `rgb(180,85,45)`, `claude-sonnet-5` `rgb(138,99,201)`;
Premium = `gpt-5.6-sol` `rgb(180,85,45)`, `claude-opus-5` `rgb(138,99,201)`, `grok-4.6` `rgb(95,102,112)`
— `--m-gpt` `#B4552D`, `--m-claude` `#8A63C9`, `--m-grok` `#5F6670`, identical hexes in both modes.
**The M7 correction of 2026-09-10 holds: `white-space: nowrap` on every model-id span, all five, both
modes.**

**M9** Free intro, verbatim:
`Free runs every debate at fixed settings. Type your question and click Start, or choose Premium to set the gauges yourself.`
· risk hint `How much is riding on the answer · fixed by the Free plan` · budget hint
`How much work the composition may spend · fixed by the Free plan` · depth hint
`How far the debate expands when cross-maker review is available`. Premium restores today's wording:
intro `Choose your risk tier, composition budget tier, and depth, then click Start.` · risk
`… · explicit asker selection` · budget `… · provisional default, editable` · depth unchanged. The three
lines swap on every tier change, both modes.

**M10** Free values: Risk `standard`, Budget `low`, Tree depth `2`, both steering boxes `""`, Depth mode
`fixed`, Depth of scrutiny `standard`, Branching `2`, Concurrency `3`, Max tokens `800` — the full SPEC
R7 list, both modes.

**M11** `Start run` `disabled`, `opacity 0.45`, `cursor not-allowed` while the question is empty, in both
tiers; `opacity 1`, `cursor pointer`, not disabled once typed.

**M12** `⚙ OPTIONS` toggle `opacity 1` in Free; the open panel is `.ndCard.ndLegacy` with
`dashed 1px rgba(41,38,31,0.2)` (T) / `dashed 1px rgba(242,234,217,0.18)` (C) = `--line-strong`, and its
notice line is unchanged.

**M15** tier-name pill `"Plus Jakarta Sans"` `10.5px`; ids `"JetBrains Mono"` `10.5px`; promise `11.5px`.
No new font.

### 3.3 SPEC-v2 §2 steps 1–12, both modes

| step | result | evidence |
|---|---|---|
| 1 | PASS | `.ndTier` visible above the question box; one option reads chosen |
| 2 | PASS | `#planTier-free` `aria-checked="true"` on open |
| 3 | PASS | M7 above — the ids are scoped correctly to their own option |
| 4 | PASS | M10 above |
| 5 | PASS | trusted click `Casual` → no change; trusted click `High` → no change; ArrowRight×3 on the depth slider → no change; trusted click + 22 chars into a steering box → `""` |
| 6 | **PASS** | panel opens in Free (`#depthMode` present, 14 locks); **the dropdowns will not open** (§2 (a), both modes) and **the three sliders will not move** (§2 (b) + type-ahead) |
| 7 | PASS | 56 chars typed → text appears; `Start run` `disabled:false`, `opacity 1`; dimmed count drops to exactly **14** |
| 8 | PASS | Premium → `dimCount 0`, `lockMatches 0`; set `high-stakes`, `high`, depth `2→4` (`--nd-pct 75%`, readout `4`), both steering lines typed, `scrutinyDepth → deep`; Depth mode still `fixed`, Branching `2`, Concurrency `3`, Max tokens `800` |
| 9 | PASS | Free again → `standard`/`low`/`2`/`""`/`standard`, knobs `fixed`/`2`/`3`/`800`, **14** locks, Free wording back, panel still open, question text unchanged, `Start run` live |
| 10 | PASS | Premium again → usable, and shows **what step 9 left**, not step 8's (`silentlyRestored: false`) |
| 11 | PASS *(with B1 riding on it)* | `POST /v1/asks` body carries `"plan_tier":"free"`; stub answered `202` and the page advanced to the run view |
| 12 | PASS *(with B1 riding on it)* | `POST /v1/asks` body carries `"plan_tier":"premium"`; `202` |

Three real asks, driven end-to-end in the browser and logged verbatim
(`probes/REV-S01-p3-product-truth/ask-bodies.log`):

```
#1 plan_tier='premium' risk_tier='standard'    tier_source='MACHINE_DEFAULT' tier_provenance_ref='machine:plan-tier-free'
#2 plan_tier='free'    risk_tier='standard'    tier_source='MACHINE_DEFAULT' tier_provenance_ref='machine:plan-tier-free'
#3 plan_tier='premium' risk_tier='high-stakes' tier_source='ASKER'           tier_provenance_ref='asker:ui-selection'
```

Ask #1 is **B1**.

---

## 4. Findings

### B1 (blocking) — a premium ask records, and shows the asker, that its risk tier came from the *free* plan

`apps/ui/app/new/defaults.tsx:74`

```ts
tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:plan-tier-free",
```

At base `7f89f7b7` the same line read `"machine:deployment-floor"` (`git show 7f89f7b7:…/defaults.tsx:72`).
S01 replaced the literal **unconditionally, for both tiers** — the branch is on
`riskTierWasEdited`, not on `planTier`.

**Concrete inputs → wrong outcome.** Open `/new`, choose **Premium**, leave the risk tier alone (it
already reads `Standard`), type a question, press `Start run`. The wire carries (ask #1, verbatim from my
stub's log, a real trusted click in Chrome):

```json
{"plan_tier":"premium", "risk_tier":"standard",
 "tier_source":"MACHINE_DEFAULT", "tier_provenance_ref":"machine:plan-tier-free", …}
```

The ask says its risk tier was set by the **free plan tier** on an ask whose plan tier is **premium**.
Nothing about the free plan applies to that ask.

**It is not only on the wire — the asker reads it.** `apps/ui/components/AnswerHonestyDrawer.tsx:86`
renders `Risk tier {risk_tier} · {riskTierSourceLabel(tier_source)} · {tier_provenance_ref}`, and
`apps/ui/lib/v3/labels.ts:6` maps `MACHINE_DEFAULT` → `machine default from the deployment floor`. I
rendered the drawer rather than reasoning about it
(`probes/REV-S01-p3-product-truth/probe-honesty-provenance.test.tsx`, 1 passed):

```
AT 9ddbb1ef (premium ask, unedited risk tier):
  Risk tier standard · machine default from the deployment floor · machine:plan-tier-free
AT BASE 7f89f7b7 (same ask):
  Risk tier standard · machine default from the deployment floor · machine:deployment-floor
```

So the one provenance sentence in the honesty drawer now **contradicts itself** — "from the deployment
floor" beside "plan-tier-free" — on *every* unedited-risk-tier ask in *both* tiers, and on a premium ask
it additionally names a plan the asker did not choose. At base the two halves agreed. The honesty drawer
is the surface whose whole job is telling the asker where a value came from.

**The class** (bounded by the three real asks above, and by the branch):
every ask with `riskTierWasEdited` falsy — i.e. **all Free asks** (the risk tier cannot be edited under
Free) **and every Premium ask whose asker leaves the risk tier alone**. Truthful only when the asker
edits it (ask #3).

**Why no cluster caught it:** S01's own suite *pins the falsehood*.
`tests/unit/tier01-ask-wire.test.ts:63-68`, in a test named "R7 names the mechanism that set an unedited
risk tier", asserts exactly
`{ planTier: "premium", riskTierWasEdited: false, tierSource: "MACHINE_DEFAULT", tierProvenanceRef: "machine:plan-tier-free" }`.
A reviewer who read the test would nod; only running the product and reading the wire exposes it. This is
also why it survived passes 1 and 2 — both lenses were scoped onto the lock.

**Why blocking.** SPEC-v2 §2 **step 12** instructs V to open the Network tab and *read the request body*
of a Premium ask. `"plan_tier":"premium"` and `"tier_provenance_ref":"machine:plan-tier-free"` sit four
keys apart in the JSON V is told to read. It is a regression from base, it is a falsehood written into a
durable run contract, and it is rendered to the asker.

*VERDICT: blocking / CONFIDENCE: high / STRONGEST COUNTER: no DONE.md M-line and no SPEC-v2 acceptance
step names `tier_provenance_ref`, so a reader could tier this non-blocking and let V rule at TEST(S01).
I reject that: DONE.md is the oracle for the tier ELEMENT, not a licence for the slice to make the page
assert something untrue elsewhere, and step 12 puts the contradiction directly under V's eye. The
narrowest correct fix is one expression — make the literal follow `planTier` (e.g.
`` `machine:plan-tier-${defaults.planTier}` ``) or restore `machine:deployment-floor` for the premium
branch — plus the two pinned rows in `tier01-ask-wire.test.ts`; which of the two is V's call, because it
decides whether `labels.ts:6`'s "from the deployment floor" wording must move too.*

### N1 (non-blocking) — the promoted pass-2 seam probe corrupts the page it is run on at this head

`probes/REV-S01-p2-product-truth/seam-lock-mutant.js:44-47`. Its mutant is
`document.getElementById(id).disabled = true` and its revert is `= false`. That was correct against
`53b903d2` (which shipped `aria-disabled`). At `9ddbb1ef` the mutant is a no-op and **the "revert"
unlocks all fourteen controls** — a lens that obeys the package README's "re-run every promoted probe"
literally ends up measuring an unlocked page and may report the lock broken. The direction of a mutant is
part of the probe, and a promoted probe has no note saying which head it was written against.
Fixed by promoting the inverted `probes/REV-S01-p3-product-truth/seam-lock-p3.js`, whose header states
the head it targets. **Class:** every promoted mutant probe in
`.hermes/reports/debate-tiers/probes/` (25 entries at `probes-p1p2.txt`); I checked the other
product-truth one, `trusted-input-rollback.js` — it only installs a listener and mutates nothing, so it
is safe at any head. The two correctness mutant scripts (`…-mutants-M1-M3.sh`, `…-mutants-M4-M9.sh`) are
the correctness lens's to check.
*VERDICT: promoted probes must carry the head they were written against and be direction-safe /
CONFIDENCE: high / STRONGEST COUNTER: pass-2 N5 already asked for re-pathing, and a careful lens re-reads
the probe before running it — but re-pathing is a stated duty in the README and direction is not, which
is exactly why it is worth a line.*

### N2 (non-blocking, pre-existing, NOT S01's) — the fixed consent bar covers `/new`'s action row

`.consentBar` computes `position: fixed; z-index: 45` and is `132px` tall at a 1440×900 viewport
(`219px` at 529×321); `.appShell` computes `padding-bottom: 0px`, so the page reserves nothing for it.
With the OPTIONS panel open at 1440×900 (`scrollHeight 1487`, max scroll `587`), a pointer click reaches
`Start run` **only at scroll offsets 522–543 — a 22px band out of 588**; outside it the bar is the top
hit element. `⚙ OPTIONS` and `Cancel` are likewise reachable only inside narrow bands.

**Attribution, by revert-mutant:** hiding `.ndTier` (the page as if S01 had not landed) leaves
`Start run`, `Cancel` and `⚙ OPTIONS` each still reachable-at-some-scroll and still only in a band —
`scrollHeight` merely drops `1487 → 1371`. The overlap is the shell/consent surface's, not S01's; S01
only shifts which offsets. At 1280×900 the same mutant made `⚙ OPTIONS` **worse** without S01 (the page
stopped scrolling at all and the toggle sat permanently under the bar), so the slice does not degrade it.
Reported because my contract requires one mount of every surface the slice shares with the app shell, and
because V will meet it at TEST(S01) on a fresh profile where the banner is up: steps 6, 7, 11 and 12 all
need a control inside one of those bands.
*VERDICT: ticket against the consent-ui surface, not S01 / CONFIDENCE: high / STRONGEST COUNTER: V's own
`:3000` profile has almost certainly dismissed the banner, so V may never see it — which is precisely
what would let it ship.*

### N3 (non-blocking) — the package's scope line asks for something its own evidence contradicts

`review-packages/S01-p3/README.md:7` says the pass-2 seam probes "must now show the OPPOSITE of pass 2:
… no focus ring, `document.activeElement` unchanged". Read literally with the probes as promoted, that is
unreachable (N1). The README also states the FIX seat "ran no trusted-browser check — the browser is the
product-truth lens's" (§5), which is right, but it leaves the *inversion* of the promoted probes as
undeclared work for the lens.
*VERDICT: a packet/package defect against the orchestrator, cheap to fix / CONFIDENCE: medium /
STRONGEST COUNTER: "re-pathed to YOUR worktree (they hard-code other worktrees — pass-2 N5)" already warns
the probes need adapting, so a lens is on notice; the defect is that it names only the path hazard.*

**Packet defects:** none in `packets/REV-S01-p3-product-truth.md` itself. Every constant I checked
resolves — the cwd exists and is detached at `9ddbb1ef` with 0 dirty; `7f89f7b7`, `f6c147cc`, `53b903d2`
are the commits named; `DONE.md` is 168 lines with the dated M7 correction at `:129`; SPEC-v2 §2 steps
1–12 are at `:232-266`; row V-24 is at `V-DECISIONS-PACKET.md:65`; the `allowed` list covers every
deliverable the packet demands. N3 is against the *package* README, not the packet.

**The FIX seat's `SKILLS LOADED`:** I did not read `board/FIX-S01-p2.t_62644380.txt`, so I make no finding
about that line — see UNVERIFIED.

---

## 5. What I did NOT verify

- **The FIX seat's `SKILLS LOADED` line against the worker floor.** Checking an author's skills line is a
  reviewer duty (`heartbeat-reviewer` §1). I ran out of scope discipline rather than time: the package
  README pointed me at that comment for the ADDRESSED claims and I worked from the DOM instead. It is the
  correctness lens's item 1; if that lens also skipped it, nobody checked it.
- **Three runs of my own on each cluster in the *lane*.** I re-ran the four cluster commands three times
  in *my* worktree at `9ddbb1ef` (12 green). I did not re-run them in the S01 lane, which is not mine.
- **The `202` status code read directly off the response.** I observed it only as "my stub returned 202
  and the page advanced to the run view"; I did not read the response line in the Network panel.
- **A pixel comparison against the `.dc.html` artboards.** The pane's `zoom` action does not crop
  (`region crop not yet supported in the Browser pane`), so I compared computed values against DONE.md §3
  numerically rather than overlaying images. Every §3 value is covered numerically; artboard *layout*
  beyond M1's geometry is not pixel-diffed.
- **Viewport widths above 529px for trusted clicks.** `resize_window` emulation desynchronises the pane's
  input mapping (a pane click at `(400,492)` landed at client `(1794,2206)` under a 1280×900 emulation),
  so every trusted interaction here was done at the pane's native 529×321 and every wider measurement
  (N2) is `getComputedStyle`/`elementFromPoint` only. The tier grid still resolves to two columns
  (`239.5px 239.5px`) at 529px, so no M-line depended on the width.
- **The native `<select>` picker actually opening.** CDP cannot drive the macOS picker (pass 2 recorded
  the same). I substituted the type-ahead attack, which needs no picker and is strictly harder to survive.
- **That I killed only my own processes.** My instructions were to kill only the PIDs I started. I killed
  my stub by PID (`90154`) but reached for `pkill -f 'server.mjs --dev'` for the UI server instead of its
  PID (`90192`). That pattern matches **any** seat's UI dev server, so if the correctness lens (or any
  other seat) had one running under `--dev` at 07:11 EEST, I killed it. I cannot prove I did not: the
  pane held a `tab-4` on `http://127.0.0.1:8977` that was not mine, and nothing listens on `:8977` now.
  After the kill, `:3000` and `:8790` have no listener (matching the assembly baseline), the CLI bridges
  on `:8791/:8792/:8794` are up, and the database on `127.0.0.1:55432` is up — none of those was touched.
  **If another seat reports its dev server dying around 07:11, that was me.** Recorded as a finding
  against my own conduct, not against the slice.

---

## 6. Verdict

**REWORK — pass 3 of 3.** Everything this pass was scoped to confirm about the *lock* is confirmed: the
ratified native `disabled` holds in the real DOM, in both modes, against trusted pointer, trusted keys and
trusted type-ahead; the fourteen `:disabled` matches are exactly the fourteen; M8's "and nothing else" is
true by enumeration of the compiled sheet; every M-line in DONE.md §3 measures to its stated value in both
modes; SPEC-v2 §2 steps 1–12 all pass. Pass-2's product B1 and N1 are dead.

The REWORK is **B1 alone**, and it is not about the lock: the slice changed one provenance literal for
both tiers, so a Premium ask now records — and shows the asker, in the honesty drawer — that its risk tier
came from the free plan. **Pass 4 does not exist, so this is a V row** (§8).

If V rules the fix in, it is one expression in `apps/ui/app/new/defaults.tsx:74` plus two rows in
`tests/unit/tier01-ask-wire.test.ts:63-68`; N1 and N3 are probe/package hygiene and need no product change;
N2 belongs to the consent-ui surface.

---

## 7. Predictions about the other lens (blindness check)

The correctness/tests lens (`t_479e4751`) had items 1, 2 and 5 at the test level plus the security probes,
and I expect it to return **PASS**. It will confirm all six assigned pass-2 findings ADDRESSED with clean
RED→GREEN, because they were: the native family is back, the render suite pins 6/4/2/2, all four slider
grids and the five roster ids are pinned, and the style contract's new
`expect(declarations(".ndSelect select:disabled")).toBe("cursor: not-allowed;")` line now has something to
match, so the pass-2 "mutants bite backwards" complaint dissolves. Its mutation runs will kill cleanly.
**What I expect it to miss is B1** — and to miss it for a structural reason, not carelessness: it reviews
at the test level, and `tests/unit/tier01-ask-wire.test.ts` is *green and deliberate*, asserting
`machine:plan-tier-free` for premium in a test whose name claims it "names the mechanism". Reading that
file confirms the behaviour; only posting a real premium ask and reading the body refutes it. If that lens
does raise it, I predict it arrives as a naming nit about the test's title rather than as a false statement
in a run contract, and non-blocking. I also predict it will not raise N2 (it runs no browser) and may raise
N1 in the mirrored form — that the p2 seam probe cannot be re-run — since the README pushed both of us at
the same 25 promoted probes. Where we should agree exactly: the count 14, the absence of `aria-disabled`,
and the two `:disabled` rules being the only paint.

---

## 8. For V

```
V-ROW: NEW · S01 · Provenance of an unedited risk tier on a Premium ask
Fact: S01 changed apps/ui/app/new/defaults.tsx:74 from "machine:deployment-floor" (base 7f89f7b7)
to "machine:plan-tier-free" for BOTH tiers — the branch is on riskTierWasEdited, not on planTier.
Measured at 9ddbb1ef with three real browser asks: a Premium ask whose asker never touched the risk
tier posts {"plan_tier":"premium", …, "tier_provenance_ref":"machine:plan-tier-free"}, and the honesty
drawer renders "Risk tier standard · machine default from the deployment floor · machine:plan-tier-free"
(AnswerHonestyDrawer.tsx:86 + labels.ts:6) — the two halves of one sentence contradict each other, in
both tiers, and on Premium the ref names a plan the asker did not choose. tests/unit/tier01-ask-wire.test.ts:63-68
pins this for premium, so every cluster stays green. SPEC-v2 §2 step 12 tells V to read that exact body.
Recommended default: make the ref follow the chosen plan tier — `machine:plan-tier-${planTier}` — and
re-pin the two premium rows in tier01-ask-wire.test.ts. Second option, if the "deployment floor" wording
in labels.ts:6 is load-bearing for the honesty vocabulary: restore "machine:deployment-floor" on the
premium branch and keep "machine:plan-tier-free" only under Free.
Smallest yes/no for V: "When a Premium asker leaves the risk tier alone, should the ask still record
that the free plan set it?"
VERDICT: fix before Done / CONFIDENCE: high / STRONGEST COUNTER: no DONE.md M-line or SPEC acceptance
step names tier_provenance_ref, so this could be deferred to a follow-up slice — at the cost of every
Premium run contract written in the meantime carrying a false provenance that the honesty drawer shows.
```
