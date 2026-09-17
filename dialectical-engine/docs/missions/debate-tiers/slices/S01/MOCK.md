# MOCK — S01 · the Free/Premium tier selector on `/new`

Node `MOCK(S01)`, pass 1 of 3, ticket `t_54027d98`, seat MOCK-S01, 2026-09-09.
This file is the mock seat's whole output beside the canvas. It pins nothing: `DONE.md`, written by V
at the `DONE(S01)` gate, is the oracle. Every open question below is a yes/no with a recommended
default; the default binds only until V rules.

## The canvas

**https://claude.ai/code/artifact/e08c6b3b-60b1-4e8a-9c15-79ca43a16d22**

Published as an Artifact (the Artifact tool was offered to this seat; the packet's
`design/S01/canvas.html` fallback was not used). Saving is enabled on it — V's edits in the canvas
publish a new version. Contract pinned at `0.1.31`.

**Static mockups, not a clickable prototype.** Nothing on the canvas responds to a click; each of the
six states in `PLAN.md ## Screens` is drawn as its own artboard instead. The `design` skill asks the
requester to choose between the two; no one could be asked this turn (COMMON: zero questions in
chat), so the default was taken and is stated here.

## Artboards — 14

| # | Artboard | Screen (`PLAN.md ## Screens`) | Frame |
|---|---|---|---|
| 1 | `S01-tier-element-closeup-terracotta` (`Main.dc.html`) | the element alone, in its three readings: Free chosen · Premium chosen · neither chosen | 700 × 520 |
| 2 | `S01-tier-element-closeup-chamber` | as 1, Chamber | 700 × 520 |
| 3 | `S01-new-free-collapsed-terracotta` | **screen 1** — Free chosen, OPTIONS collapsed, question empty, `Start run` disabled | 772 × 1010 |
| 4 | `S01-new-free-collapsed-chamber` | screen 1, Chamber | 772 × 1010 |
| 5 | `S01-new-premium-collapsed-terracotta` | **screen 3** — Premium chosen, OPTIONS collapsed, gauges UNLOCKED at the R7 values (Standard / Low / 2 / empty), per the ARCH-REV fold N6 | 772 × 1010 |
| 6 | `S01-new-premium-collapsed-chamber` | screen 3, Chamber | 772 × 1010 |
| 7 | `S01-new-no-tier-terracotta` | **screen 6** — neither tier chosen; today's initial state (risk tier unselected, depth 1, nothing disabled), `Start run` disabled with a question typed | 772 × 1010 |
| 8 | `S01-new-no-tier-chamber` | screen 6, Chamber | 772 × 1010 |
| 9 | `S01-new-free-expanded-terracotta` | **screen 2** — Free chosen, OPTIONS expanded, the five V2 knobs locked at `fixed` / `standard` / 2 / 3 / 800, the `⚙ OPTIONS` toggle itself operable (R5) | 772 × 1500 |
| 10 | `S01-new-free-expanded-chamber` | screen 2, Chamber | 772 × 1500 |
| 11 | `S01-new-premium-moved-terracotta` | **screen 4** — acceptance step 8: High stakes / High / depth 4 / a line in each steering box / Depth of scrutiny moved to Deep | 772 × 1500 |
| 12 | `S01-new-premium-moved-chamber` | screen 4, Chamber | 772 × 1500 |
| 13 | `S01-new-free-again-terracotta` | **screen 5** — acceptance step 9: Free chosen again, every gauge back at the screen-1 values and locked, the question text unchanged | 772 × 1500 |
| 14 | `S01-new-free-again-chamber` | screen 5, Chamber | 772 × 1500 |

Seven sticky notes sit beside the rows: how to read the canvas, the four questions below, the
`premium-moved` / `free-again` pair, the model-id note, and one build note (the `.ndSelect` overlay).

**The app top bar is out of frame.** Each artboard is the `/new` page surface (`.ndScreen`) on the
page ground, 660px column and all. The mode is read from the ground and the artboard name. The 4a
artboard's top bar was not copied, because nothing on it is being designed and every value on the
artboard would then need a Chamber counterpart the design of record does not carry.

## Provenance — every value on the canvas, and where it comes from

Line numbers are `apps/ui/app/globals.css` unless another file is named, at main-tree `e6b24748`
(the nd* block and the token blocks are byte-identical in the lane at `7f89f7b7`). Terracotta value
first, Chamber second.

### The chrome the selector sits in — nothing here is new

| Artboard element | Copies |
|---|---|
| page ground `#F9F6F1` / `#14110E` | `--bg`, `:7` / `:116` |
| screen padding `44px 56px 48px` | `.ndScreen`, `:5906` |
| 660px centred column | `.ndInner`, `:5907` |
| `NEW QUESTION` — mono 9.5/700, letter-spacing .22em, `#A8823E` / `#C8A055` | `.ndEyebrow` `:5909-5916`, `--gold` `:23` / `:131` |
| `What should we debate?` — Fraunces 30/500, ls -.025em, margin `12px 0 0` | `.ndTitle`, `:5917-5923` |
| question bezel — `--shell` `#EFE9E0` / `#221D17`, 1px `--line-strong`, radius 16, padding 7, `--shadow-pop` | `.ndTopicBezel`, `:5926-5933` |
| question core — `--core` `#FDFBF6` / `#181410`, 1px `--line`, radius 10, padding `18px 20px` | `.ndTopicCore`, `:5934-5939` |
| question text — Fraunces 17 / line-height 1.5, min-height 25.5, `--ink`; placeholder `--muted` | `.ndTopic`, `:5940-5956` |
| gauge card — `--core`, 1px `--line`, radius 14, padding `6px 20px`, margin-top 18 | `.ndCard`, `:5958-5964` |
| intro line — 12px, `--text-2`, padding `14px 0`, bottom rule 1px `--line` | `.ndIntro`, `:5965-5972` |
| gauge row — flex, gap 16, padding `17px 0`, bottom rule 1px `--line` | `.ndRow`, `:5980-5986` |
| slider row's 200px label column | `.ndRowSlider .ndRowText`, `:5989` |
| row label — 13.5/700 | `.ndLabel`, `:5990` |
| row hint — 11.5, `--text-2`, margin-top 4 | `.ndHint`, `:5991` |
| pill track — flex gap 2, padding 3, radius 999, 1px `--line-strong`, `--shell` | `.ndSeg`, `:5994-6001` |
| pill, unchosen — padding `4px 12px`, radius 999, 10.5/600, `--muted` | `.ndSegItem`, `:6002-6011` |
| pill, chosen — `--ink` fill, `--bg` text, weight 700 | `.ndSegItem[aria-checked="true"]`, `:6012-6016` |
| slider — 3px track radius 999 `--line-strong`, fill `--pro` `#3F7466` / `#6E9E96`, thumb 14px circle `--ink` with a 2.5px `--bg` ring and `--shadow-thumb` | `.ndSlider*` `:6019-6070`; drawn (rather than a native `input[type=range]`) exactly as the design of record draws it, `docs/missions/ui-overhaul/design/design-document-rendered.html:1010-1014` |
| slider value — mono 11/700, `--pro`, 46px right-aligned | `.ndValue`, `:6071-6078` |
| steering box — margin-top 8, padding `10px 13px`, radius 9, 1px `--line`, `--shell`, 11px / line-height 14, min-height 40; italic placeholder on the annotations box | `.ndSteerInput`, `:6082-6098` |
| provenance line — 10.5, `--muted`, padding `14px 0` | `.ndProvenance`, `:5973-5978` |
| `⚙ OPTIONS` — mono 10/700, ls .12em, `--ink`; 8px caret; 1px `--line` rule filling the row | `.ndOptionsToggle`, `.ndOptionsCaret`, `.ndOptionsRule`, `:6100-6118` |
| OPTIONS panel — `.ndCard` geometry with a **dashed** 1px `--line-strong` border and opacity .88 | `.ndLegacy`, `:6120-6125` |
| OPTIONS notice — 12 italic, `--text-2`, bottom rule | `.ndLegacyNotice`, `:6126-6133` |
| dropdown box — inline-flex gap 10, padding `7px 13px`, radius 9, 1px `--line-strong`, `--shell`, 11.5/600; 8px caret `--muted` | `.ndSelect`, `.ndSelectCaret`, `:6138-6151`, `:6167` |
| `Settings →` link — weight 700, underline, offset 3 | `.ndSettingsLink`, `:6171-6178` |
| actions row — flex, gap 12, margin-top 22 | `.ndActions`, `:6180` |
| `Start run →` — padding `10px 22px`, radius 999, `--ink` fill, `--bg` text, 12.5/700 | `.ndStart`, `:6181-6191` |
| `Cancel` — padding `10px 18px`, radius 999, 1px `--line-strong`, `--muted`, 12/600 | `.ndCancel`, `:6194-6202` |
| `⌃↵ to start` — 10.5, `--muted` | `.ndKeyHint`, `:6204` |
| every string in the card, the panel and the actions | `apps/ui/app/new/page.tsx:180-337` verbatim, except the three lines Q2 proposes |
| the typed question, `Remote work should be the default for knowledge workers.` | `docs/missions/ui-overhaul/design/design-document-rendered.html:983` |
| the steering-presets sample line, `Prefer primary sources` | the field's own placeholder, `apps/ui/app/new/page.tsx:225` |
| Fraunces · Plus Jakarta Sans · JetBrains Mono, with the same fallback stacks | `--font-display` / `--font-sans` / `--font-mono`, `:69-71` |

### The locked treatment

| Artboard element | Copies |
|---|---|
| every locked gauge — `opacity: 0.45; cursor: not-allowed` | `.ndStart:disabled`, `:6193` — the one `nd*` member of the house `:disabled` class. `grep -n ':disabled' apps/ui/app/globals.css` returns 22 lines; the family runs `.45` (`.ndStart`, `.mfaPrimary`, `.mfaActivate`, `.libStart`), `.5` (`.btn`, `.setBtn`, `.supportSend`), `.55` (`.authPrimary`, `.authVerifyEmail`, `.mfaGhost`, `.publicLockedAction`), `.65` (`.policyPrimary`), plus four that set `cursor` only. `.45` is reused because it is the value the `nd*` vocabulary already uses. **Not NEW.** |

### The tier element — what this slice adds

| Artboard element | Copies |
|---|---|
| two-column grid, `gap: 10px`, `margin-top: 20px`, between `.ndTitle` and `.ndTopicBezel` | **NEW** (no grid exists in the `nd*` block). The 20px is `.ndTopicBezel`'s own `margin-top`, `:5927` |
| option card, chosen — `--shell` fill + 1px `--line-strong` | the shell/line-strong pair of `.ndTopicBezel`, `:5928-5929`. **NEW** as a composition (no `nd*` rule puts that pair on a card) |
| option card, unchosen — `--core` fill + 1px `--line` | `.ndCard`, `:5960-5961`. **NEW** as a composition |
| option card radius 12px, padding `13px 14px` | radius = `--r-btn`, `:81`. Padding is **NEW** (no `nd*` rule uses `13px 14px`) |
| the tier name (`Free` / `Premium`) as a pill, chosen and unchosen | `.ndSegItem` + `.ndSegItem[aria-checked="true"]`, `:6002-6016`, verbatim |
| the one-line promise under the name — 11.5, `--text-2` | `.ndHint`, `:5991` |
| the model ids — inline-flex, gap 5, mono 10.5/500, `--text-3` | `.metaLine`, `:1569-1577` |
| the dot before each id — 7px circle | `.modelDot`, `:1579-1585` |
| dot colours `#B4552D` / `#8A63C9` / `#5F6670` | `--m-gpt`, `--m-claude`, `--m-grok`, `:40-41` (identical in both modes, `:146-147`), reached from the id by `modelKey`, `apps/ui/lib/models.ts:25-33` |
| the model ids themselves | SPEC R3 / R11 — `free` = `gpt-5.6-luna`, `claude-sonnet-5`; `premium` = `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6`. From the roster declaration, never a literal in the page |
| the one-line promises, `Every gauge fixed. The question is yours.` / `Every gauge yours to set.` | **NEW** copy — Q6 |
| the Free-state intro line and the two Free-state hints | **NEW** copy — Q2, rows V-17 / V-18 |
| the steering-annotations sample line, `Flag any claim resting on a single source.` | **NEW** sample copy |
| close-up captions (`FREE CHOSEN`, `PREMIUM CHOSEN`, `NEITHER CHOSEN …`) and the close-up heading | `.ndEyebrow` `:5909-5916` and `.ndTitle` `:5917-5923` at 19px. **Mock furniture on artboards 1-2 only — no product surface carries them** |

**`NEW` rows: 9** — the grid, the chosen card, the unchosen card, the card padding, the two promise
lines, the three proposed copy lines counted as one row, the annotations sample line, and the
close-up furniture. Everything else on all fourteen artboards traces to a line above.

## Open questions for V — each a yes/no, each with the default that binds until V rules

**Q1 · row V-9 — does `/new` open with Free already chosen?**
Recommended default: **yes.** Artboards 3-4 draw it; artboards 7-8 draw the alternative (neither
chosen, `Start run` disabled until one is picked). Yes keeps SPEC R2 and R18 as frozen and makes the
locks visible the moment the page opens, so nobody meets a live gauge that goes dead a click later.
A no supersedes R2 and R18 in `DONE.md`, and `ready` (`apps/ui/app/new/page.tsx:104-111`) gains the
tier as one more condition.
*VERDICT Free preselected / CONFIDENCE medium / STRONGEST COUNTER: preselecting a plan for a signed-in
user is the app choosing on their behalf, and row V-6 says there is no entitlement gate — with no
paywall, "neither chosen" costs one click and claims nothing.*

**Q2 · rows V-17 and V-18 — do these three lines change while Free is chosen?**
Recommended default: **yes**, to the wording drawn on the Free artboards. Premium and the no-tier
state keep today's wording, which is true there.

| Where | Today (`page.tsx`) | Proposed, Free only |
|---|---|---|
| `.ndIntro` `:181` | Choose your risk tier, composition budget tier, and depth, then click Start. | Free runs every debate at fixed settings. Type your question and click Start, or choose Premium to set the gauges yourself. |
| risk-tier hint `:186` | How much is riding on the answer · explicit asker selection | How much is riding on the answer · fixed by the Free plan |
| budget-tier hint `:197` | How much work the composition may spend · provisional default, editable | How much work the composition may spend · fixed by the Free plan |

*VERDICT change all three under Free / CONFIDENCE high / STRONGEST COUNTER: three strings that swap on
a tier are three more states to keep true, and the intro sentence is the page's only instruction — if
V would rather have one sentence that is true in both tiers, that is a different (and cheaper) ask,
and the two hints still have to move because "explicit asker selection" contradicts the
`machine:plan-tier-free` the ask will actually carry (SPEC R7).*
The depth hint (`:205`, "How far the debate expands when cross-maker review is available") is left
alone: it describes the mechanism, not who chose the value, so the Free lock does not make it false.

**Q3 · is dimming to `opacity .45` the whole locked treatment?**
Recommended default: **yes** — no padlock glyph, no new colour, no strikethrough, no locked-state
border. The reason a gauge is dead is carried by the copy in Q2, not by new chrome. This is the house
`:disabled` convention reused, so it costs no token and no new rule beyond attaching it to
`.ndSegItem`, `.ndSlider`, `.ndSteerInput` and `.ndSelect`.
*VERDICT dim only / CONFIDENCE medium / STRONGEST COUNTER: nine dimmed gauges at once is a much bigger
dead area than any single disabled button in the app, and acceptance steps 5 and 6 have V clicking
each one to confirm nothing moves — if a reader has to click to find out, the treatment is too quiet.*

**Q4 · do the two options name the raw model ids?**
Recommended default: **yes** — `gpt-5.6-luna`, `claude-sonnet-5` under Free; `gpt-5.6-sol`,
`claude-opus-5`, `grok-4.6` under Premium, in mono, each with its house identity dot. The raw id is
what the run will name in a refusal, and row V-7 records that three of the five are not configured
discovery targets yet.
*VERDICT raw ids / CONFIDENCE high / STRONGEST COUNTER: `ModelPresentation` exists to turn an id into
a friendly name (`Claude`, `GPT`) and every other surface in the app uses it, so raw ids here are the
one place the app talks in identifiers — if V wants the friendly name, the id can move to the title
attribute and the identity dot stays.*

**Q5 · are the tier names just `Free` and `Premium`?**
Recommended default: **yes**, and no visible group label above the pair. `grep` for
`premium|entitlement|subscription|plan_id|paywall|billing` across `apps/ui` returns 0 hits
(`00-intake.md:53`), so there is no house vocabulary to match and the words on the two options are
V's. The radiogroup takes its accessible name from `aria-label="Plan tier"`, which nothing draws.
*VERDICT Free / Premium, no visible label / CONFIDENCE medium / STRONGEST COUNTER: the pair sits
directly under a 30px "What should we debate?" with nothing saying what the two cards are, so a
first-time reader meets two unexplained boxes before the question box — one 13.5/700 `.ndLabel`
reading "Plan tier" would cost 21px of height and settle it.*

**Q6 · do the two one-line promises stay as drawn?**
`Every gauge fixed. The question is yours.` under Free; `Every gauge yours to set.` under Premium.
Recommended default: **yes.** They are the only line on the card that says what choosing does.
*VERDICT keep / CONFIDENCE low / STRONGEST COUNTER: it is invented copy on a slice whose copy is V's,
and the Free line half-repeats the Q2 intro sentence one element below it — deleting both promises
and letting the model ids speak is a legitimate reading of the same card.*

## Notes that are not questions

- **The `⚙ OPTIONS` dropdowns cannot be locked by SPEC R4 alone.** `.ndSelect` draws the box and the
  real `<select>` lies transparently over it at `opacity: 0` (`globals.css:6152-6166`). SPEC R4 puts
  `disabled` on `#depthMode` and `#scrutinyDepth`, i.e. on the invisible element — nothing a reader
  can see would change. Artboards 9-14 draw the dim on the **outer** `.ndSelect` box, which is what
  the built rule has to reach. Raised to the orchestrator as a finding on the `MOCK READY` handoff.
- **Screen 5 is drawn with OPTIONS still expanded**, because screen 4 left it expanded and R5 keeps
  the panel's open/closed state independent of the tier. It shows Depth of scrutiny back at
  `Standard`, which is SPEC R8 applied to the R7 knob list.
- **Screen 3 is drawn at the R7 values unlocked** (Standard / Low / 2 / empty), per the ARCH-REV(S01)
  fold N6 in `DECISIONS.md:183`: with R2 + R8 the only reachable route to Premium is from Free, so
  "at rest as today's page" (risk tier unselected, depth 1) is unreachable there.
- **The render probe** used to measure the real chrome lived in
  `.worktrees/tiers-s01/dialectical-engine/coverage/MOCK-S01/` (gitignored, `.gitignore:5`) and is
  deleted. It rendered `NewDebatePage` with `renderToStaticMarkup` on the
  `tests/render/sup-04-widget.test.tsx` idiom, 1/1 passing, and the geometry in the provenance table
  above was read off that render rather than off the stylesheet alone.
