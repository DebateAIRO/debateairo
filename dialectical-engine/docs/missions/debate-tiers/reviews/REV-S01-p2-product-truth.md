# REV(S01) pass 2 — lens **product-truth** · seat `REV-S01-p2-product-truth` · ticket `t_4fcba563`

**Verdict: REWORK** (1 blocking, 3 non-blocking). Pass 2 of 3.

- slice head under review: `53b903d2` (= `f6c147cc` + F2 `f9b40d0f` + F1 `53b903d2`) · base `7f89f7b7` ·
  my worktree `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-product/dialectical-engine`,
  detached, **0 dirty at entry and 0 dirty at exit**, no git write of any kind.
- oracle: `docs/missions/debate-tiers/slices/S01/DONE.md:1-168` (with the dated M7 correction) + the 14
  artboards + `SPEC-v2.md:232-266`.
- blind: I read no other lens's output and no packet but my own. I read the pass-1 product-truth review
  (my own lens's prior pass, named by the package) and the two FIX seats' READY comments.
- scope (package README §3–§6): the seam (a)(b)(d) in the real DOM in both modes · pass-1 B1 and product
  N1 in the browser · SPEC-v2 §2 steps 1–12 in both modes.

---

## 1. The packet (reviewed first — a defect here is against the orchestrator)

Every quoted constant re-measured by me against its source. **No packet or package defect found.**

| packet / package claim | measured by me | result |
|---|---|---|
| head `53b903d2`, F2 `f9b40d0f`, pass-1 head `f6c147cc`, base `7f89f7b7` | `git rev-parse --short HEAD` = `53b903d2`; `git log --oneline -3` matches `commits.txt` | OK |
| `DONE.md:1-168` | `wc -l` = 168 (167 at pass 1 + the M7 correction line) | OK |
| `design/S01/README.md:1-33`; "the 14 artboards" | `wc -l` = 33; `ls *.dc.html` = 14 | OK |
| `SPEC-v2.md:232-266` = §2 steps 1–12 | `:232` = `## 2. Acceptance…`, `:266` = the last line of step 12, `:268` = `## 3. Out of scope` | OK |
| `globals.css:6264-6267` = the four `:disabled` lock selectors | `sed -n 6264,6267p` = `.ndSegItem:disabled,` / `.ndSlider:disabled,` / `.ndSteerInput:disabled,` / `.ndSelect:has(select:disabled) {` | OK |
| `globals.css:6262` = `white-space: nowrap` (F2) | `sed -n 6262p` = `  white-space: nowrap;` | OK |
| "Four files, +148/−66"; "436 lines" | `diffstat.txt` = 4 files, +148/−66; `wc -l` patch = 436 | OK |
| "`probes-p1.txt`, 17 entries" | `grep -c .` = 17 | OK |
| the orchestrator's `reverify-53b903d2` pairs (render 22/0, style 8/0) | my own three runs return exactly those pairs | OK |

**The FIX seats' `SKILLS LOADED` vs the worker floor.** Both name `using-superpowers`,
`heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, `verification-before-completion`,
`systematic-debugging` and `receiving-code-review` — floor complete. The orchestrator's own CONSUMED
comments already record the honest shortfall (both seats read the lane's stale pre-v4.0.0
`.codex/skills/heartbeat-protocol/SKILL.md`; ticketed `t_e74b5bf1`, class fixed in `79fb2183`). I
confirm the shortfall is disclosed, not concealed; it costs a line, not a pass. Not a finding of mine.

**Credit where it is due:** the seam I rule on below was found and ticketed by the orchestrator itself
(`t_0b2afbff`, class fixed in `ce7677ba`) and handed to me as a named probe. My job was to price it.

## 2. What I ran (my own fixtures, not the author's)

**Every cluster command re-run by me, three times, in my own worktree**, with the runner transcribed
from `cluster-map-PLAN-section-4.md:19-28` and the pairs restated as the package states them
(`tier01-new-plan-tier` 22/0, `tier01-style-contract` 8/0). Worst run wins; all three identical.

```
run 1  05:26:37 → 05:27:28   HEAD=53b903d2 dirty=0   generate:contract rc=0 dirty-after=0
run 2  05:27:28 → 05:28:19   HEAD=53b903d2 dirty=0   generate:contract rc=0 dirty-after=0
run 3  05:28:20 → 05:29:11   HEAD=53b903d2 dirty=0   generate:contract rc=0 dirty-after=0

S01-C1  CLUSTER_GREEN ×3   contract 8/0 · api 25/0 · load01-live-proof 1/0 · s7-authorization 31/0 ·
                           evaluator-database 21/0 · tier01-roster 1/0 ·
                           s7-authorization-contract 5/1 · s8-publication-contract 4/1
S01-C2  CLUSTER_GREEN ×3   tier01-ask-wire 3/0 · v2ui-data-layer 57/0 · pol01-policy 8/0 ·
                           s14-contract 2/3 · prov01-honesty-drawer 1/0 · bug02-debate-effects 4/0 ·
                           evaluator-dev-menu-controls 1/0 · s10-erasure-ui 3/0 · v2ui-ownership 3/0
S01-C3  CLUSTER_GREEN ×3   tier01-new-plan-tier 22/0 · v2ui-pages 36/5 · ux01-new-debate-form 1/7 ·
                           sup-04-widget 8/0 · sup-04-mounts 0/2 · evaluator-dev-menu-ui 2/0
S01-C4  CLUSTER_GREEN ×3   tier01-style-contract 8/0 · t9-mode-tokens 7/2 · consent-bar 7/0 ·
                           consent-s02-style-contract 10/0 · consent-card 11/0 · consent-cross-slice 7/0 ·
                           consent-guards 7/0 · consent-policy-link 14/0 · t3-library 11/4 ·
                           role-token-map 46/3 · pda-s03-keyboard-accessibility 3/2
```

12 cluster verdicts, **12 GREEN / 0 RED / 0 BROKEN**. Every non-zero `failed` is a pre-existing base
failure carried by `BASELINE.md`; no suite moved between the pass-1 head and this one.

**My own dev stack** (background, log files, killed by PID at handoff; nothing on V's desktop): a stub
API I wrote on **:8811** (`GET /v1/session` → 200 `SessionSchema`; `POST /v1/asks` → 202
`AskAcceptedSchema`; every request line and body logged verbatim) and the UI dev server from **my**
worktree on **:8812**. `:3000`, `:8790`, `127.0.0.1:55432`, `.local/**` and both lanes untouched — no
process listened on `:3000` or `:8790` at entry or at exit. Browser: my own tab in the harness pane,
closed at handoff.

## 3. The scoped items, ruled

### 3.1 Pass-1 **B1** (`t_1bf44393`) — **FIXED**, and the class is swept

`page.tsx:395` `step={128}` → `step={32}`. Measured in Chrome on the running page, in the state the
oracle draws (Free, panel open, untouched):

```
readout on screen : 800     input.value : 800     value attr : 800     --nd-pct : 17.355371900826448%
(value − min) % step = (800 − 128) % 32 = 0        (max − min) % step = (4000 − 128) % 32 = 0
Premium, driven to the ends:  4000 -> 4000 (readout 4000, --nd-pct 100%) · 128 -> 128 · 800 -> 800
```

Pass 1 measured 768 and 3968 for the same two inputs. **Class swept mechanically — all four
`SliderRow`s on `/new`, value and max both on grid:** `treeDepth` 1–5/1, value 2 · `branchingWidth`
1–4/1, value 2 · `concurrency` 1–6/1, value 3 · `maxTokens` 128–4000/**32**, value 800. No member
off-grid. DONE.md M10's ninth value is now backed by a control that can hold it.

### 3.2 Pass-1 product **N1** (`t_8f4927d4`) — **FIXED**

`globals.css:6262` adds `white-space: nowrap` to `.ndTierModel`. Measured in the real DOM, both modes,
at the option width pass 1 named:

```
option width 135px (viewport 368)   every one of the five ids: white-space "nowrap", height 14px
  gpt-5.6-luna 88 · claude-sonnet-5 107 · gpt-5.6-sol 81 · claude-opus-5 94 · grok-4.6 62
pass 1, same width:                 claude-sonnet-5 height 27px (wrapped), others 14px
```

I also checked what `nowrap` costs, since it replaces wrapping with overflow: at 135px the longest id
(107px) still fits the 133px content box, the option's `scrollWidth === clientWidth`, and the document
does not scroll horizontally (`documentElement.scrollWidth 368 === innerWidth 368`). Squeezing the grid
below ~135px per option with a temporary style mutant does push `scrollWidth` past `clientWidth`, but
that width is below the narrowest viewport this harness can produce and `nowrap` is what all 14
artboards carry. Not a finding.

### 3.3 Pass-1 product **N3** (`t_7f4df45a`) — mechanism delivered, content not (see **N2** below)

All fourteen locked controls are now focusable and carry an `aria-describedby` that resolves to a real
`.ndHint` node — measured, all fourteen, both modes. That is the remedy shape N3 asked for, and it
stayed invisible (no glyph, no `title`, no tooltip), which DONE.md §5 requires. What it delivers is
ruled in **N2** and **N3** below.

### 3.4 **The seam** (package README §3) — ruled in **B1** and **N1** below

## 4. The oracle, measured against the rendered DOM with the real compiled CSS — both modes

All fifteen M-lines re-measured by `getComputedStyle` / `getBoundingClientRect` on the running page,
once in Terracotta and once in Chamber. **M1–M7 and M9–M15 match the oracle exactly in both modes.**
Spot values (T / C):

- **M1** `role="radiogroup"`, `aria-label="Plan tier"`, `display:grid`, `325px 325px` from
  `repeat(2,minmax(0,1fr))`, `gap:10px`, `margin-top:20px`; `.ndTier` precedes `.ndTopicBezel` in DOM order.
- **M2/M3** chosen `rgba(41,38,31,0.2)` on `rgb(239,233,224)` / `rgba(242,234,217,0.18)` on
  `rgb(34,29,23)`; unchosen `rgba(41,38,31,0.1)` on `rgb(253,251,246)` / `rgba(242,234,217,0.09)` on
  `rgb(24,20,16)`; radius 12px, padding `13px 14px`, `row-gap:9px`, `cursor:pointer`.
- **M4/M5** pill 10.5px; chosen 700 on `rgb(41,38,31)` in `rgb(249,246,241)` / `rgb(242,234,217)` in
  `rgb(20,17,14)`; unchosen 600, transparent, `rgb(110,103,92)` / `rgb(156,144,122)`.
- **M6** 11.5px, `rgb(85,81,71)` / `rgb(181,168,143)`, both promise strings verbatim.
- **M7** JetBrains Mono 10.5px/500, `rgb(110,103,92)` / `rgb(156,144,122)`; dots `#B4552D` / `#8A63C9` /
  `#5F6670`, identical in both modes; order `gpt-5.6-luna, claude-sonnet-5` and `gpt-5.6-sol,
  claude-opus-5, grok-4.6`, from `PLAN_TIER_ROSTERS`. **M7 correction: `white-space: nowrap` on all five.**
- **M8** the counts reproduce exactly, both modes: **collapsed Free 10** · **expanded Free 15** ·
  **Free-again-with-question 14** · **Premium 0** · **Premium expanded 0**. Each of the fourteen carries
  `opacity: 0.45` and `cursor: not-allowed` **on the element itself**. What that paint no longer
  survives is **B1**; where the cursor does not reach the pointer is **N1**.
- **M9** all three Free strings verbatim; the depth hint identical in both tiers. **M10** Standard /
  Low / 2 / empty / Fixed / Standard / 2 / 3 / **800**. **M11** `Start run` dimmed only while the
  question is empty. **M12** toggle `opacity: 1`.
- **M13** no colour literal anywhere in the S01 CSS block (0 hits for `#`/`rgb(`/`rgba(`/`hsl(` outside
  `var(--…)`); still exactly one `:root {` and one `html[data-mode="chamber"] {`. The FIX adds no token
  and no hex — `FREE_LOCK_STYLE` (`page.tsx:46`) is `opacity` + `cursor` only. **M14** the `globals.css`
  diff from the pass-1 head is a single `+1` line inside `.ndTierModel`; no chrome rule touched.
  **M15** pill and promise in Plus Jakarta Sans (10.5 / 11.5px), ids in JetBrains Mono 10.5px; no new font.

### SPEC-v2 §2 steps 1–12 — run twice, Terracotta and Chamber

1–4 **pass** (selector above the question box, Free chosen, the five ids, Standard / Low / 2 / empty;
collapsed dimmed count 10). **5 pass** — clicking `Casual` and `High` moves nothing; typing into a
steering box types nothing (end state `""`). **6 FAILS — see B1**: the panel opens and the three
sliders do not move, but the two dropdowns are live native controls. **7 pass** — 56 characters typed
with real trusted keys; `Start run` becomes available. **8 pass** — Premium unlocks all fourteen
(dimmed count 0); risk `high-stakes`, budget `high`, Tree depth driven to **4** with the same trusted
arrow keys that Free rolls back, both steering lines typed, Depth of scrutiny set to `deep`.
**9 pass** — Free restores Standard / Low / 2 / empty / Standard and re-locks (dimmed 14, `Start run`
live); the question text survives unchanged. **10 pass** — Premium again shows what step 9 left; step
8's values are **not** restored. **11/12 pass**, verbatim from my stub's log — two asks, both accepted
(the page routed to `/debate/run-33` and `/debate/run-20`, i.e. `AskAcceptedSchema` validated the 202):

```
plan_tier=free     risk_tier=standard  budget=low  depth={'depth': 2}
                   tier_source=MACHINE_DEFAULT  prov=machine:plan-tier-free
plan_tier=premium  risk_tier=standard  budget=low  depth={'depth': 2}
                   tier_source=MACHINE_DEFAULT  prov=machine:plan-tier-free
```

(The `machine:plan-tier-free` on the Premium ask is SPEC-v2 R7 by design — pass 1 established it and
row V-21 carries the disagreement. I do not re-litigate a frozen SPEC decision.)

**Cross-surface mount** (whole-slice duty), at 1440×900 with `localStorage["debateai.consent"]` cleared
so the bar actually renders: `.consentBar` `position:fixed`, `z-index:45`, `22,746 1396×132`; the
support widget `position:fixed`, `z-index:6`, `1062,840 360×42`. Overlap with `.ndTier`, `.ndTopicBezel`,
`.ndOptionsToggle`, `.ndStart` and the first `.ndSelect`: **none** at the top-of-page scroll. The tier
control renders identically with the bar up (chosen `planTier-free`, dimmed 15). The mode toggle drives
both modes and the mode survives navigation. Not a finding.

---

## 5. Findings

### B1 (blocking) · The Free lock is no longer a lock: the two `⚙ OPTIONS` dropdowns are live controls that answer a click, and every locked control now visibly responds to focus

`apps/ui/app/new/page.tsx:500-517` (`SelectRow`) replaced the native `disabled` with
`aria-disabled={disabled}` plus a guarded `onChange`, and moved the paint to an inline
`FREE_LOCK_STYLE` on the **outer** `.ndSelect` span (`page.tsx:46`, `:500`). The `<select>` itself is
untouched by the lock — and `apps/ui/app/globals.css:6150-6160` makes it an
`position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer` overlay covering the
whole box. **So the element the pointer reaches at the centre of the "locked" dropdown is a live
`<select>`.** Measured on the running page, Free chosen, panel open:

```
hit test at the box centre    depthMode      -> SELECT#depthMode      (topmost)
                              scrutinyDepth  -> SELECT#scrutinyDepth  (topmost)
select.disabled                              -> false        aria-disabled -> "true"
pointer-events                               -> auto         tabIndex      -> 0
```

A **real trusted left-click** at viewport (449,160) — the centre of the dimmed `Fixed ▾` box:

```
mousedown  target depthMode  isTrusted true   clientX 449  clientY 160
focus      target depthMode  isTrusted true
click      target depthMode  isTrusted true   clientX 449  clientY 160
document.activeElement            -> depthMode
.ndSelect computed outline        -> solid 2px rgb(193,95,60)   = --focus #C15F3C  (Terracotta)
                                  -> solid 2px rgb(200,131,79)  = --focus #C8834F  (Chamber)
```

The ring is visible in the screenshot taken immediately after that click. It is painted by the
pre-existing `globals.css:6162` `.ndSelect:focus-within { outline: 2px solid var(--focus); }`, which at
the pass-1 head could never fire, because a `disabled` select cannot be focused.

**RED → GREEN → RED, with the pass-1 lock restored as a temporary in-DOM mutant** (no file touched;
`probes/REV-S01-p2-product-truth/seam-lock-mutant.js`), over eight sampled controls covering all four
families:

```
                                   focusAccepted     .ndSelect focus ring
53b903d2 as shipped                true  (8 of 8)    solid 2px rgb(193,95,60)
mutant: native `disabled` restored false (8 of 8)    none
mutant removed (reproduce)         true  (8 of 8)    solid 2px rgb(193,95,60)
```

The same is true of the other twelve locks through the keyboard. A **trusted** `ArrowRight` on the
locked Tree depth slider, three presses (`probes/…/trusted-input-rollback.js`):

```
keydown treeDepth trusted:true val:"2"  |  input treeDepth trusted:true val:"3"  |  change … val:"2"
keydown treeDepth trusted:true val:"2"  |  input treeDepth trusted:true val:"3"  |  change … val:"2"
keydown treeDepth trusted:true val:"2"  |  input treeDepth trusted:true val:"3"  |  change … val:"2"
```

The control **moves to 3 on every press** and React's controlled-input restore puts it back. A trusted
`p` on the locked steering box lands as `input` with `target.value === "p"`, restored to `""`. Under
Premium the identical keys take Tree depth to **4** and it stays — the guard is the only thing holding
the Free lock.

**Why this is blocking, in three sentences.** (1) `SPEC-v2.md:250-251` step 6 is frozen acceptance text
V runs personally: *"Try each control inside it — the dropdowns will not open and the three sliders
will not move."* A non-disabled, hit-testable, focusable `<select>` opens its picker on the mousedown I
measured; I could not photograph the macOS picker (see UNVERIFIED) but I measured the click it answers.
(2) `DONE.md:130-136` **M8** is V's Q3 yes: *"`opacity: 0.45; cursor: not-allowed` on each locked
control **and nothing else** — no glyph, no colour change, no border change."* A 2px solid `--focus`
ring on click and on Tab is a visible response the pass-1 lock could not produce, in both modes.
(3) `slices/S01/DECISIONS.md:217` (the C3 ∥ C4 class-vocabulary ruling) states the locks **are**
`.ndSegItem:disabled`, `.ndSlider:disabled`, `.ndSteerInput:disabled`, `.ndSelect:has(select:disabled)`,
"no page-side hook needed". At `53b903d2` those four selectors (`globals.css:6264-6267`) match nothing
on the page — dead CSS — while `tests/unit/tier01-style-contract.test.ts:163` still pins them
(`expect(declarations(lockSelector)).toBe("opacity: 0.45; cursor: not-allowed;")`), so the suite
asserts a rule the product never reaches and would stay green if the S01 lock block were deleted.

And the design of record is explicit about the mechanism this replaced. `DECISIONS.md:194`
(**MOCK F1 → the C4 BUILD packet, the locked treatment**) reads: *"`.ndSelect` draws the visible box
while the native `<select>` lies over it at `opacity: 0` … SPEC R4's `disabled` on `#depthMode` /
`#scrutinyDepth` lands on the invisible element. The built rule reaches the OUTER box … so the dim the
canvas draws (artboards 9-14) is what renders … **Acceptance step 6 is passed by looking only when the
box dims.**"* The mock seat identified this exact overlay, and its remedy was to make the DIM reach the
outer box **while `disabled` stayed on the select**. F1 kept the dim and dropped the `disabled` — the
half that made step 6 true rather than merely look true.

**Class named, and swept.** The class is *every control S01 locks by tier*: 6 `.ndSegItem` + 4
`.ndSlider` + 2 `.ndSteerInput` + 2 `.ndSelect select` = **14 of 14 members**, all converted from
native `disabled` to `aria-disabled` + guard + inline paint, all fourteen measured above in both modes.
Ten of the fourteen (`.ndSegItem`, `.ndSlider`, `.ndSteerInput`) carry the inline paint on the element
the pointer hits and keep `cursor: not-allowed`; the two `.ndSelect select` members do not (**N1**).
The remedy must fix the class, not the two dropdowns: either restore native `disabled` (which also
un-does the N3 remedy, so pair it with `aria-describedby` on the row's group rather than the control),
or keep `aria-disabled` and make the lock complete — `pointer-events: none` on the overlay select, a
suppressed focus ring on `[aria-disabled="true"]`, and the stylesheet block re-keyed to
`[aria-disabled="true"]` so `DECISIONS.md` and the style contract describe what actually paints.
Whichever is chosen, the assertion must be shown RED first.

`VERDICT keep blocking / CONFIDENCE high / STRONGEST COUNTER: the NET outcome of every numbered step
is still right — nothing moves, nothing is typed, the dimmed counts are the oracle's 10 / 15 / 14 / 0
in both modes, and the wire carries the right tier. On that reading the only true failure is step 6's
literal "will not open", and I did not photograph the picker. I keep it blocking because M8's "and
nothing else" is a V answer, the ring is measured and new, and the slice's own DECISIONS ruling about
what paints the lock is now false while a green test asserts the dead rule.`

### N1 · M8's `cursor: not-allowed` never reaches the pointer on the two locked dropdowns — and it did not at pass 1 either

`globals.css:6160` gives `.ndSelect select` `cursor: pointer`, and the select covers the whole box, so
the cursor a user sees over a **locked** dropdown is the "clickable" hand:

```
elementFromPoint(centre) -> SELECT#depthMode      computed cursor "pointer"   (T and C)
elementFromPoint(centre) -> SELECT#scrutinyDepth  computed cursor "pointer"   (T and C)
the other twelve locks                             computed cursor "not-allowed"
```

**This is NOT caused by the FIX.** The native-`disabled` mutant returns `pointer` for the same two
controls, so it was equally true at `f6c147cc`. It is nevertheless a divergence from DONE.md M8 on a
lock S01 authored, and it is a miss by **my own lens at pass 1**, which reported M8 as matching because
it read `getComputedStyle` on the element it believed was locked rather than on the element the pointer
actually hits. Remedy is one declaration on the overlay under the lock. **Class:** the two `.ndSelect`
members; the other twelve paint on the hit element and are correct.
`VERDICT non-blocking / CONFIDENCE high / STRONGEST COUNTER: it predates S01's diff, so a strict
"what did this slice change" reading puts it in repo residue. It is listed here because S01 wrote the
M8 lock and this is the one place M8 does not reach the user.`

### N2 · The lock now has a keyboard route to an explanation that, for twelve of the fourteen controls, explains nothing

Pass-1 N3 was that S01 *"adds the reason for the lock and simultaneously removes the only route to
it"*. F1 added the route to all fourteen. The reason exists on two. Measured `aria-describedby` targets,
Free chosen, panel open:

```
riskTier-hint          "How much is riding on the answer · fixed by the Free plan"        <- explains
budgetTier-hint        "How much work the composition may spend · fixed by the Free plan" <- explains
treeDepth-hint         "How far the debate expands when cross-maker review is available"
steeringPresets-hint   "One per line"
steeringAnnotations-hint "Free text · logged verbatim, one per line"
depthMode-hint         "Selection strategy"
scrutinyDepth-hint     "Site default expansion budget"
branchingWidth-hint    "Pro + con children per claim"
concurrency-hint       "Models running in parallel"
maxTokens-hint         "Per generated argument"
```

So a screen-reader user under Free meets twelve controls announced as unavailable
(`aria-disabled="true"`) whose description never says why, and two that do. M9 is the sentence S01
wrote for this purpose and it is attached to two hints only. **Class:** the fourteen locked controls;
2 carry the reason, 12 do not. Remedy stays invisible per DONE.md §5 — extend M9's `· fixed by the Free
plan` to the hints of the other locked rows while Free is chosen, or point every locked control's
`aria-describedby` at one shared Free-lock sentence in addition to its own hint.
`VERDICT non-blocking / CONFIDENCE medium / STRONGEST COUNTER: M9 is a V-approved string set and V
approved exactly three Free-state lines; adding "· fixed by the Free plan" to eight more hints changes
copy V did not see, so the honest route may be the shared-sentence form rather than editing M9's text.`

### N3 · Under Free the keyboard path to `Start run` grew from one intervening stop to fifteen — a trade V never saw

Measured tab order on `/new`, Free chosen, panel open, at `53b903d2`: **20 tab stops**, of which
**14 are the locked controls**:

```
planTier-free → planTier-premium → topic → riskTier-casual → riskTier-standard → riskTier-high-stakes
→ budgetTier-low → budgetTier-medium → budgetTier-high → treeDepth → steeringPresets
→ steeringAnnotations → ndOptionsToggle → depthMode → scrutinyDepth → branchingWidth → concurrency
→ maxTokens → ndSettingsLink → ndCancel        (Start run joins once the question is typed)
```

Pass 1 measured, at `f6c147cc`: `planTier-free → planTier-premium → topic → ndOptionsToggle →
ndCancel`. A Free user driving the page from the keyboard now traverses fourteen controls that do
nothing to reach the button that starts the run. DONE.md draws no keyboard behaviour and §5 hands it
to *"the page's existing focus treatment"* — and the existing treatment for a locked control in this
app **was** native `disabled`. This is a real product change made to satisfy a non-blocking finding,
and it is a question for V rather than for a seat. **Class:** the fourteen locked controls under Free;
zero under Premium (where the stops are the point).
`VERDICT non-blocking, and a V row / CONFIDENCE medium / STRONGEST COUNTER: keeping disabled controls
focusable-and-described is the standard ARIA treatment and is precisely what pass-1 N3 asked for;
removing them from the tab order is what created N3 in the first place. The cost is real either way,
so V should pick which cost the Free tier pays.`

---

## 6. UNVERIFIED

- **I did not observe the native `<select>` picker opening.** The macOS picker is an OS widget that
  does not appear in a CDP screenshot, and CDP key events do not drive it (a trusted `ArrowDown` then
  `Return` on the focused select produced two `keydown`s and **no** `change`). B1 therefore rests on
  what I did measure — the trusted `mousedown → focus → click`, `select.disabled === false`, the hit
  test, and the `--focus` ring, each contrasted against the native-`disabled` mutant — plus the UA rule
  that a non-disabled, hit-testable `<select>` opens on click, which is **inferred, not observed**.
  This is the one step of B1 V should confirm by hand at the test point: open `/new`, leave Free
  chosen, click `⚙ OPTIONS`, click `Fixed ▾`.
- **No pixel-level image comparison against the artboards.** The pane rescales (measured transform:
  viewport = screenshot × 0.662), so screenshots are not a faithful pixel source. Every M-line was
  measured by computed style and `getBoundingClientRect`, which is what the packet's verification line
  asks for. Pixel diffing is V's at the test point.
- **The real API was never exercised.** Both 202s came from my stub on `:8811`; I posted nothing to
  `:8790` or any live fleet.
- **A real pointer DRAG of a locked slider was not performed** (the pane's coordinate frame makes a
  reliable drag path expensive). Arrow-key movement is measured above; whether the thumb visibly
  fights the user under a sustained drag is unverified, and it is the one place B1's rollback could
  become visible rather than merely present.
- **The honesty drawer was not mounted** (my stub serves no debate), and touch, RTL, print,
  reduced-motion and viewports above 1440 were not exercised.

## 7. Predictions about the other lens (falsifiable — written before seeing anything of theirs)

The other pass-2 lens is correctness/tests, and it holds seam items (c) and (d). I predict it lands
(c) squarely — `tier01-style-contract.test.ts:163` asserting `globals.css:6264-6267`, a lock block the
page no longer reaches — and files it as a test-validity finding rather than a product one; if we both
file it, the union should read them as one class with two faces, mine being that `DECISIONS.md` now
describes a mechanism that does not exist. I predict it does **not** file my B1: its instrument is
jsdom, where `aria-disabled` is an attribute like any other, the render suite's rewritten S01-27/28
assert exactly the attributes F1 wrote, and nothing in jsdom distinguishes a focusable select from a
disabled one on click — B1 needs a trusted mousedown in a real browser and a mutant to contrast
against. I predict it confirms B1-as-fixed arithmetically and finds, as I did, that all four sliders
are on grid. On (d) I expect it to verify the fourteen `aria-describedby` targets *resolve* and to stop
there, because "resolves to a node" is testable and "the node explains the lock" is not — so I expect
my N2 to be unique to this lens. I also predict it re-runs the security lens's probes clean, since the
FIX touches no API surface, and that the only thing it says about the tab order is that fourteen
controls now have `tabIndex >= 0`, asserted as a property rather than priced as the ergonomic trade in
my N3. Finally, I predict neither of us files N1 as a *new* defect, because the mutant that proves it
pre-existing is the same mutant that would otherwise make it look like a regression.

---

## 8. For V — rows the orchestrator transcribes and numbers

`V-ROW: NEW · S01 · The Free tier's keyboard cost after the N3 remedy · Recommended default: keep the
fourteen locked controls focusable and described (the ARIA treatment pass-1 N3 asked for) and accept
that a Free user tabs past fourteen inert controls to reach Start run; revisit only if V dislikes it on
the real page. Smallest yes/no for V: "Under Free, should the keyboard skip the locked gauges entirely
the way it did before, even though that also hides the reason they are locked?" · VERDICT defer to V /
CONFIDENCE medium / STRONGEST COUNTER: DONE.md draws no keyboard behaviour at all and §5 delegates it
to "the page's existing focus treatment", which was native disabled — so the honest reading is that V
has never been asked this question and the artboards cannot answer it.`

`V-ROW: NEW · S01 · Whether the Free lock may be enforced by JavaScript rather than by the control ·
Recommended default: the lock must be refused by the control itself (native disabled, or
pointer-events plus a suppressed focus ring), not rolled back after the fact — a locked control that
accepts the interaction and undoes it is a different promise from one that cannot be operated.
Smallest yes/no for V: "Is it acceptable that a Free user can click and type into a locked gauge and
have the app silently undo it, as long as nothing ends up changed?" · VERDICT recommend no /
CONFIDENCE high / STRONGEST COUNTER: the end state is identical, no wrong value can reach the ask, and
the aria-disabled pattern is what made the lock's reason reachable to screen readers at all — so the
rollback may be the price of the accessibility V's reviewers demanded.`

---

Probes kept: `.hermes/reports/debate-tiers/probes/REV-S01-p2-product-truth/`
(`seam-lock-mutant.js`, `trusted-input-rollback.js`, `clusters.sh`, `clusters-three-runs.log`,
`stub-api.mjs`, `ask-bodies.log`).
Self-report: `.hermes/reports/debate-tiers/agent-reports/REV-S01-p2-product-truth.md`.
