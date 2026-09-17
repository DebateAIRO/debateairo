# REV(S01) pass 1 — lens **product-truth** · seat `REV-S01-p1-product-truth` · ticket `t_8ea6c036`

**Verdict: REWORK** (1 blocking, 4 non-blocking). Pass 1 of 3.

- slice head under review: `f6c147cc` (`slice/tiers-s01`) · base `7f89f7b7` · my worktree
  `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-product/dialectical-engine`,
  detached, **0 dirty at entry and 0 dirty at exit**, no git write of any kind.
- oracle: `docs/missions/debate-tiers/slices/S01/DONE.md:1-167` (byte-identical to the package copy —
  `diff` reports no difference) + the 14 artboards + `SPEC-v2.md:232-268`.
- blind: I read no other lens's output and no packet but my own.

---

## 1. The packet (reviewed first — a defect here is against the orchestrator)

Every quoted constant checks out against its source, measured by me:

| packet claim | measured | result |
|---|---|---|
| base `7f89f7b7`, head `f6c147cc` | `git rev-parse --short HEAD` = `f6c147cc`; `git diff 7f89f7b7..f6c147cc` resolves | OK |
| `DONE.md:1-167` | `wc -l` = 167 | OK |
| `design/S01/README.md:1-33` | `wc -l` = 33 | OK |
| `SPEC-v2.md:232-268` = §2 steps 1–12 | `:232` = `## 2. Acceptance`, `:269` = `## 3. Out of scope` | OK |
| "the 14 artboards + canvas.json" | `ls docs/missions/debate-tiers/design/S01/*.dc.html` = 14 | OK |
| package `oracle/DONE.md` = the mission copy | `diff` — identical | OK |
| the five BUILD seats' `SKILLS LOADED` vs the worker floor | all five name `using-superpowers`, `heartbeat-protocol`, `heartbeat-worker`, `test-driven-development`, `verification-before-completion`, `systematic-debugging` | OK, no shortfall |

Oracle-internal arithmetic re-counted rather than trusted: DONE.md M8 claims "artboard 3 has exactly
10 occurrences of `opacity: 0.45`" and "artboard 13 has exactly 14". Measured across all 14 artboards:
ab3/ab4 = 10, ab13/ab14 = 14, ab9/ab10 = 15, premium boards = 0, no-tier boards = 1. **The oracle's
arithmetic is correct**, and the rendered page reproduces every one of those counts (§3).

One packet defect — **N4** below.

## 2. What I ran (my own fixtures, not the author's)

**Every cluster command re-run by me, three times, in my own worktree**, with a runner I transcribed
myself from `cluster-map-PLAN-section-4.md:19-28` (the shared runner is not tracked in git, so I
could not reuse the file — I rewrote it). Every suite returned the identical pair in all three runs;
worst run wins:

```
run 1  03:47:17 → 03:48:16   HEAD=f6c147cc dirty=0   generate:contract rc=0 dirty-after=0
run 2  03:48:16 → 03:49:07   HEAD=f6c147cc dirty=0   generate:contract rc=0 dirty-after=0
run 3  03:49:07 → 03:49:56   HEAD=f6c147cc dirty=0   generate:contract rc=0 dirty-after=0

S01-C1  CLUSTER_GREEN ×3   contract 8/0 · api 25/0 · load01-live-proof 1/0 · s7-authorization 31/0 ·
                           evaluator-database 21/0 · tier01-roster 1/0 ·
                           s7-authorization-contract 5/1 · s8-publication-contract 4/1
S01-C2  CLUSTER_GREEN ×3   tier01-ask-wire 3/0 · v2ui-data-layer 57/0 · pol01-policy 8/0 ·
                           s14-contract 2/3 · prov01-honesty-drawer 1/0 · bug02-debate-effects 4/0 ·
                           evaluator-dev-menu-controls 1/0 · s10-erasure-ui 3/0 · v2ui-ownership 3/0
S01-C3  CLUSTER_GREEN ×3   tier01-new-plan-tier 21/0 · v2ui-pages 36/5 · ux01-new-debate-form 1/7 ·
                           sup-04-widget 8/0 · sup-04-mounts 0/2 · evaluator-dev-menu-ui 2/0
S01-C4  CLUSTER_GREEN ×3   tier01-style-contract 8/0 · t9-mode-tokens 7/2 · consent-bar 7/0 ·
                           consent-s02-style-contract 10/0 · consent-card 11/0 · consent-cross-slice 7/0 ·
                           consent-guards 7/0 · consent-policy-link 14/0 · t3-library 11/4 ·
                           role-token-map 46/3 · pda-s03-keyboard-accessibility 3/2
```

Every non-zero `failed` count above is a pre-existing base failure carried by `BASELINE.md`, not this
diff; no suite moved between base and head other than the three the clusters predicted.

**My own dev stack** (background, log files, killed by PID at handoff; nothing on V's desktop):
a stub API I wrote on **:8850** (`GET /v1/session` → 200 `SessionSchema`; `POST /v1/asks` → 202
`AskAcceptedSchema`; every request line and body logged verbatim) and the UI dev server from **my**
worktree on **:8851**. I never touched `:3000`, `:8790`, `127.0.0.1:55432`, `.local/**` or the lanes.
Browser: my own tab in the harness pane, closed at handoff.

## 3. The oracle, measured against the rendered DOM with the real compiled CSS — both modes

All fifteen M-lines measured by `getComputedStyle` / `getBoundingClientRect` on the running page, once
in Terracotta and once in Chamber. **M1–M9, M11–M15 match the oracle exactly in both modes.** Spot
values (T / C):

- **M1** `role="radiogroup"`, `aria-label="Plan tier"`, `display:grid`, two equal columns from
  `repeat(2,minmax(0,1fr))`, `gap:10px`, `margin-top:20px`, no visible label above; DOM order
  `H1.ndTitle → DIV.ndTier → DIV.ndTopicBezel`; **h1→tier gap 20px, tier→bezel gap 20px**, bezel keeps
  its own `margin-top:20px`, h1 `margin:12px 0 0` / `font-size:30px` — the artboard's geometry to the pixel.
- **M2/M3** chosen `rgba(41,38,31,0.2)` on `rgb(239,233,224)` / `rgba(242,234,217,0.18)` on `rgb(34,29,23)`;
  unchosen `rgba(41,38,31,0.1)` on `rgb(253,251,246)` / `rgba(242,234,217,0.09)` on `rgb(24,20,16)`;
  radius 12px, padding `13px 14px`, `row-gap:9px`, `cursor:pointer` — `--line-strong`/`--shell` and
  `--line`/`--core` in both modes.
- **M4/M5** pill `4px 12px`, radius 999px, 10.5px; chosen 700 on `--ink` in `--bg`; unchosen 600,
  transparent, `--muted`. **M6** 11.5px `--text-2`, both promise strings verbatim.
- **M7** row `flex/wrap/gap:10px`; each id `inline-flex`, `gap:5px`, JetBrains Mono 10.5px/500,
  `--text-3`; dots 7×7 `rgb(180,85,45)` / `rgb(138,99,201)` / `rgb(95,102,112)` = `--m-gpt` / `--m-claude`
  / `--m-grok`, identical in both modes; order `gpt-5.6-luna, claude-sonnet-5` and
  `gpt-5.6-sol, claude-opus-5, grok-4.6`, sourced from `PLAN_TIER_ROSTERS`, no literal in the page.
- **M8** the lock is `opacity:0.45` + `cursor:not-allowed` and nothing else. Counts reproduced exactly:
  **collapsed Free 10** (6 pills + depth slider + 2 steering boxes + `Start run`), **expanded Free 15**
  (those 14 + `Start run`), **Free-again-with-question 14**, **Premium 0**, in both modes. `⚙ OPTIONS`,
  the question box and `Cancel` are never dimmed (measured `opacity:1`).
- **M9** all three Free strings verbatim; the depth hint identical in both tiers. **M10** Standard / Low /
  2 / empty boxes / Fixed / Standard / 2 / 3 — **and see B1 for the ninth value**.
- **M11** `Start run` dimmed only while the question is empty, both tiers. **M12** toggle `opacity:1`;
  panel border `dashed 1px --line-strong`; the notice line unchanged.
- **M13** no colour literal anywhere in the S01 CSS block (`grep` of the block for `#`/`rgb`/`hsl` = 0 hits);
  still exactly one `:root {` and one `html[data-mode="chamber"] {`. **M14** the `globals.css` diff is a
  single purely-additive hunk (`@@ -6205,6 +6205,70 @@`); no chrome rule modified. **M15** pill and
  promise in Plus Jakarta Sans (10.5 / 11.5px), ids in JetBrains Mono 10.5px; no new font.

### SPEC-v2 §2 steps 1–12 — run twice, Terracotta and Chamber

1–4 pass (selector above the question box, Free chosen, the five ids, Standard/Low/2/empty).
**5** pass — clicking `Casual`, clicking `High`, and clicking into and typing in a steering box move
nothing (also verified against a programmatic `.click()`, which the disabled controls refuse).
**6** pass — the panel opens in Free; both dropdowns and all three sliders are locked.
**7** pass. **8** pass — Premium unlocks all fourteen; every value settable. **9** pass — Free restores
Standard/Low/2/empty/Standard and re-locks; the question text survives. **10** pass — Premium again shows
what step 9 left; step 8's values are **not** restored.
**11/12** pass, verbatim from my stub's log — five asks posted, **five `202`**:

```
plan_tier":"free"     … "tier_source":"MACHINE_DEFAULT","tier_provenance_ref":"machine:plan-tier-free"
plan_tier":"premium"  … "tier_source":"MACHINE_DEFAULT","tier_provenance_ref":"machine:plan-tier-free"
plan_tier":"premium"  … "tier_source":"ASKER","tier_provenance_ref":"asker:ui-selection"
```

---

## 4. Findings

### B1 (blocking) · `Max tokens` displays a value the control does not hold, and its only assertion is green solely in jsdom

`apps/ui/app/new/page.tsx:390-396` declares `min={128} max={4000} step={128}` on `#maxTokens`, while
`page.tsx:91` (`useState(800)`) and `page.tsx:129` (`setMaxTokens(800)` on choosing Free) set the value
to **800**. 800 is not on that step grid (`128 + n·128`), so the browser clamps the control to **768**.

Measured in Chrome on the running page, in the state the oracle draws (Free, panel open, untouched):

```
readout on screen : 800          ← what M10 and artboards 9/11/13 require
input.value       : 768          ← what the control actually holds
value attribute   : 800          --nd-pct: 17.355%   (the filled track is drawn for 800,
                                                      the native thumb sits at 768)
```

The declared maximum is unreachable too: driving the slider to `4000` yields **3968**. So the control
can never hold either the value the page prints or the maximum it advertises.

Why three green runs missed it — `tests/render/tier01-new-plan-tier.test.tsx:346` asserts
`document.querySelector<HTMLInputElement>('#maxTokens')?.value` `.toBe("800")`. I replayed that exact
scenario (`:324` set 4000 under Premium → choose Free → read the value) in a real browser and in jsdom:

```
jsdom 30.0.1   min=128 step=128 value=800  -> "800"     ; after setting 4000 -> "4000"
Chrome (page)  same control                -> "768"     ; after setting 4000 -> "3968"
jsdom & Chrome treeDepth (min=1 step=1)    -> "2"  / "2"   (agree — only the off-grid control diverges)
```

The assertion therefore cannot fail in the harness it runs in, and it is the *only* evidence behind
oracle line M10's ninth value. That is what makes this blocking rather than cosmetic: M10 is
unbacked, and the suite will stay green through any future change to this control.

**Class swept mechanically** — every `SliderRow` on `/new`, and `SliderRow` is used nowhere else in
`apps/ui`: `treeDepth` (1–5, step 1, value 2) reachable · `branchingWidth` (1–4, step 1, value 2)
reachable · `concurrency` (1–6, step 1, value 3) reachable · **`maxTokens` (128–4000, step 128, value 800)
— the single member, with two unreachable values (800 and 4000)**.

Note on scope: the control's `min/max/step` and the `800` initial state are older than this slice. What
S01 newly does is make `800` a *contractual* Free-plan value (`page.tsx:129`), enshrine it as oracle
line M10, and assert it with a test that cannot go red. The remedy is S01's either way: align the grid
(`step={128}` with a value on it, or `step={1}`/an explicit `800` stop), or assert the readout the
oracle actually specifies — and in both cases the assertion must be shown RED first.
`VERDICT keep blocking / CONFIDENCE high / STRONGEST COUNTER: no numbered acceptance step fails, the
on-screen number matches the artboard, and the value is never sent to the API — on that reading this
is an N. I keep it blocking because the slice's evidence for an oracle line is an artifact of the test
environment, which is exactly what REV(S) exists to catch.`

### N1 · the model ids can break mid-token; the artboards' `white-space: nowrap` was not transcribed

`apps/ui/app/globals.css` `.ndTierModel` (the S01 block) sets `display/align-items/gap/font-family/
font-size/font-weight/color` but **not** `white-space`. Every model-id span on every artboard carries
`white-space: nowrap` — 5 occurrences on each of the 12 page artboards, 15 on each close-up. DONE.md M7
transcribed the other seven declarations and omitted this one, so the build satisfies M7 as written
while diverging from the artboard it was copied from.

It is not theoretical. At an option width of **135px** (reached at a ~320px viewport), `claude-sonnet-5`
wraps onto two lines — measured height **27px** against 14px for every other id. RED → GREEN → RED,
proven with a temporary in-browser mutant that added exactly the missing declaration and nothing else:

```
before          claude-sonnet-5 h=27   (others 14)
+ .ndTierModel{white-space:nowrap}     claude-sonnet-5 h=14   (all 14)
mutant removed  claude-sonnet-5 h=27   (reproduced)
```

The mutant was removed in the same evaluation; no file was touched. **Class:** one declaration, one
rule, all five ids in both tiers and both modes.

### N2 · Premium promises "Every gauge yours to set." over five gauges the same panel says are not sent — V-ROW

`page.tsx:44` gives Premium the promise **"Every gauge yours to set."** (M6, V's Q6 yes). S01 then makes
the five `⚙ OPTIONS` controls tier-conditional (`page.tsx:356, 365, 376, 386, 397`), so 5 of the 14 locks
V accepted sit on Depth mode, Depth of scrutiny, Branching width, Concurrency and Max tokens. The
unchanged notice directly above them (`page.tsx:346-349`, M12) reads:

> Depth mode, depth of scrutiny, branching width, concurrency, and max tokens are V2 controls the V3 run
> contract has no slot for — they are not sent.

My five captured ask bodies confirm it: `depth_params` carries only `{"depth":n}` and none of the five
appears. So those five locks gate controls that have no effect in **either** tier — the Free/Premium
distinction on them is decorative, and Premium's promise is broader than what Premium delivers. Both
sentences are on screen together, so nothing is concealed; the question is whether V wants a tier
difference advertised on inert controls.

`V-ROW: NEW · S01 · Premium's promise vs the five unsent V2 knobs · Recommended default: leave the copy
and the locks exactly as V accepted them, and re-scope when the V3 contract gains slots for these five.
Smallest yes/no for V: "Is it right that choosing Premium unlocks five gauges the run contract never
sends?" · VERDICT defer to V / CONFIDENCE medium / STRONGEST COUNTER: V saw the expanded artboards (9-14)
with these controls drawn locked and said "I love it the way it is", so the arrangement is already
accepted; the notice keeps it honest.`

### N3 · S01 adds the reason for the lock and simultaneously removes the only route to it for keyboard users

M9 is S01's explanation of the lock — `· fixed by the Free plan` on the Risk tier and Composition budget
hints. It lands in `.ndHint` (`page.tsx:449`), which carries **no** `aria-describedby`; the group is
associated only with its label (`aria-labelledby={field-label}`, `page.tsx:451`). At the same time S01
puts `disabled` on the radios themselves, so under Free **all nine collapsed-state locks leave the tab
order** (measured: every `.ndSegItem`, `.ndSlider` and `.ndSteerInput` is `disabled` and untabbable; the
tab order runs `planTier-free → planTier-premium → topic → ndOptionsToggle → ndCancel`).

A keyboard or screen-reader user under Free therefore never reaches Risk tier or Composition budget tier
at all, and never encounters the sentence S01 wrote to explain why. Before S01 those radios were
focusable. The explanation is delivered to sighted users only.

Any remedy must stay invisible — DONE.md §5 records that the `title` attribute, tooltips and a padlock
glyph are absent from every artboard — so the shape is programmatic association of the existing hint
(e.g. `aria-describedby` from the group to the `.ndHint` node), not a new affordance. **Class:** every
`SegmentedRow`/`SliderRow`/steering box on `/new` whose hint carries information (9 collapsed + 5 panel);
S01 changed the text of two of them.
`VERDICT non-blocking / CONFIDENCE medium / STRONGEST COUNTER: DONE.md §5 hands keyboard behaviour to
"the page's existing focus treatment", and the missing aria-describedby is app-wide and older than S01 —
on that reading S01 only inherited it. It is listed because S01 authored the sentence that is now unreachable.`

### N4 (packet defect, against the orchestrator) · the packet forbids the file COMMON orders me to write

`COMMON.md:25` binds every seat: "A contested product question is a `V-ROW: NEW · …` block in the slice's
`DECISIONS.md`, written by ANY seat". My packet's `allowed` list is declared exhaustive and names four
paths, none of which is `DECISIONS.md`; `forbidden` then says "everything else — in particular the slice's
files". The two instructions cannot both be obeyed, and N2 is exactly the case COMMON legislates for.
I obeyed the packet (`allowed` is the narrower, seat-specific instruction) and wrote the V-ROW block into
this review instead. **The orchestrator must transcribe N2's block into `slices/S01/DECISIONS.md` and
number it**, or a genuine V question is lost. Cost of the ambiguity: one review cycle per review seat
that hits a contested product question.
`VERDICT non-blocking / CONFIDENCE high / STRONGEST COUNTER: one could read COMMON §4 as itself extending
every packet's allowed list; if that is the intent, say so in COMMON and in the packet template, because
"exhaustive" currently reads as absolute.`

---

## 5. Residues confirmed (already routed — evidence added, not new findings)

- **V-14 is no longer a prediction.** SPEC-v2 warned that `MACHINE_DEFAULT` renders through
  `riskTierSourceLabel` (`apps/ui/lib/v3/labels.ts:6`) as the fixed phrase "machine default from the
  deployment floor". Four of my five asks carry `tier_source: MACHINE_DEFAULT` with
  `tier_provenance_ref: machine:plan-tier-free`, so `AnswerHonestyDrawer.tsx:86` will render
  **`Risk tier standard · machine default from the deployment floor · machine:plan-tier-free`** — a
  sentence that names two different sources for one value. Every default-path ask this slice produces
  now feeds it. Out of S01's scope by SPEC §3; V-14 should be treated as live, not hypothetical.
  (Computed from source — I could not mount the drawer, see UNVERIFIED.)
- **`machine:plan-tier-free` on a Premium ask is SPEC-sanctioned, not a defect.** Ask #26/#52 show
  `plan_tier: premium` beside `tier_provenance_ref: machine:plan-tier-free`. SPEC-v2 R7 rules this
  deliberately — "the rule is on the mechanism, not on the tier" — and `/new` always opens Free, so an
  untouched value did come from the Free lock. Recorded so V sees the shape; I do not re-litigate a
  frozen SPEC decision.
- **V-7.** The page names `gpt-5.6-luna`, `claude-sonnet-5` and `grok-4.6`, none of which is a configured
  discovery target today. SPEC §2 step 12 already says both tiers run the same fleet until S02 "and that
  is correct here". It remains the single largest untruth on the screen and must not reach real users
  before S02 lands.
- **`LibraryComposer` is not regressed by S01.** Its tier-less `createDebate` (`LibraryComposer.tsx:29-31`)
  throws on the *risk_tier* guard at `apps/ui/lib/api.ts:373-374`, which is unchanged and runs **before**
  the new `plan_tier` guard at `:375-376`; same throw, same `catch {}`, same `/new?topic=` fallback as at
  base. **Class swept:** `createDebate` (`api.ts:400`) is the only production producer of an ask body in
  the repo — every other `/v1/asks` hit is a test, the API route, the proxy or the generated OpenAPI —
  so the newly-required `plan_tier` has exactly one writer and it always sets it.
- **Cross-surface mounts.** At 1440×900 the consent bar (`.consentBar`, `position:fixed`, `z-index:45`)
  is a bottom bar and overlaps **nothing** in S01's surface (`bar × tier`, `bar × bezel`, `bar × toggle`,
  `bar × Start run` all null); the support widget likewise. The app top bar and `ModeToggle` drive both
  modes correctly and the mode survives navigation.
- **Keyboard, per DONE.md §5.** Both tier options are tab stops (`tabIndex 0` each) rather than a roving
  radiogroup, matching the app's existing `SegmentedRow` pattern, which is what §5 instructs. Not a finding.

## 6. UNVERIFIED

- **No pixel-level image comparison against the artboards.** The harness pane's own viewport is 529×321
  and larger sizes are scaled to fit, so screenshots are not a faithful pixel source; I measured every
  M-line by computed style and `getBoundingClientRect` geometry instead, which is what the packet's
  verification line asks for. Pixel diffing is V's at the test point.
- **The real API was never exercised.** All five `202`s came from my own stub on :8850. The product API's
  handling of `plan_tier` is covered by `tests/unit/api.test.ts` 25/25, which I re-ran three times, but I
  did not post an ask to `:8790` or to any live fleet.
- **The honesty drawer was not mounted.** My stub serves no debate, so the V-14 string above is computed
  from `AnswerHonestyDrawer.tsx:86` + `labels.ts:6` + my captured `tier_source`/`tier_provenance_ref`, not
  observed on screen.
- **Real trusted-input coverage is partial.** Synthetic `computer` clicks did not reach the page until I
  fronted my tab, and after fronting, the pane's scaled coordinate frame made ref-clicks land off-target.
  I validated that untrusted `.click()` genuinely drives this React page (it opens the OPTIONS panel and
  is refused by every disabled control) and drove the state machine that way. Steps 5 and 6 were also
  exercised with real trusted clicks; the rest were `.click()`.
- Touch, RTL, print, reduced-motion and viewports above 1440 were not exercised.

## 7. Predictions about the other two lenses (falsifiable — written before seeing anything of theirs)

I expect **correctness/tests** to re-run the same four clusters and find them green, and to land on the
`modelColor`/`modelIdentity` duplication that ARCH flagged as an explicit probe (`page.tsx:65-70`
re-deriving a maker family that `apps/ui/lib/models.ts` already carries as `modelMeta(modelId).dot`) —
a finding I judged out of my lens. I predict that lens will *not* catch B1, because B1 is invisible to
anything that runs in jsdom and it requires replaying the suite's own scenario in a browser; if it does
catch it, it will arrive as "the render suite asserts a DOM value" rather than as a product-truth defect.
I expect **security/data-safety** to report that the Free lock is client-side only — the ask carries
whatever the DOM holds, `evaluateAskAdmission` never reads `plan_tier`, and a user who strips the
`disabled` attributes can post any gauge values with `plan_tier: free` (I reproduced exactly that by
setting values through the native setter on disabled inputs, and React accepted them) — and to route it
to S02 rather than block, since SPEC §3 puts fleet enforcement out of scope. I also expect that lens to
raise the required-`plan_tier` contract break as a compatibility question and, like me, to find only one
production writer. I predict **neither** lens files N1 (it needs a sub-360px viewport nobody thinks to try)
or N3, and that at least one of them files the `machine:plan-tier-free`-on-Premium string as a defect
without finding SPEC-v2 R7's explicit ruling that it is intended — that is the trap in this slice.

---

Probes kept: `.hermes/reports/debate-tiers/probes/REV-S01-p1-product-truth/`.
Self-report: `.hermes/reports/debate-tiers/agent-reports/REV-S01-p1-product-truth.md`.
