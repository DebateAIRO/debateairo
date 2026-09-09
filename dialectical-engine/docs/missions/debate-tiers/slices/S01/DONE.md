# DONE — S01 · The Free/Premium selector on `/new`

**V's definition of done, verbatim** (2026-09-10 00:04 EEST, in chat, at the `DONE(S01)` gate, answering
the canvas https://claude.ai/code/artifact/e08c6b3b-60b1-4e8a-9c15-79ca43a16d22):

> well, I love it the way it is. go forward with implementation

"It" is the canvas exactly as `MOCK(S01)` published it: read back with the Artifact tool at 00:06
(0 comments, 0 edits since the publish) and extracted byte for byte into
`docs/missions/debate-tiers/design/S01/` (its `README.md` maps file → artboard → screen). Every value
below is copied from those artboards; the orchestrator transcribed and judged nothing. This file is
the oracle `REV(S01)`'s product-truth lens measures against and the source of the assertions
`S01-44` writes (one per M-line in §3).

## 1. The six questions the canvas asked — V's yes answers all six as drawn

| Q (`MOCK.md`) | Drawn default | V's answer | Binds |
|---|---|---|---|
| Q1 · row V-9 — `/new` opens with Free chosen | yes (artboards 3–4) | **yes** | SPEC-v2 R2 and R18 stand as frozen. Artboards 7–8 and the third close-up reading ("neither chosen") are **not product states**; recorded in §2 so nobody builds them. S01-24's contingency is not triggered. |
| Q2 · rows V-17, V-18 — three lines change while Free is chosen | yes, to the wording on the Free artboards | **yes** | M9 |
| Q3 — the lock is `opacity .45` + `cursor: not-allowed`, nothing else | yes | **yes** | M8 |
| Q4 — the options name the raw model ids with the house identity dot | yes | **yes** | M7 |
| Q5 — the names are `Free` and `Premium`, no visible group label | yes (`aria-label="Plan tier"` on the group, drawn nowhere) | **yes** | M1, M4, M5 |
| Q6 — the two one-line promises as drawn | yes | **yes** | M6 |

**Supersessions (S01-45): none.** Q1's yes keeps R2/R18; the three Q2 strings are named by no SPEC-v2
requirement (`grep` of `SPEC-v2.md` for "Choose your risk tier", "explicit asker selection",
"provisional default": 0 hits, 2026-09-10); no measurement in §3 contradicts a requirement.

## 2. Screens and states — the artboard, the browser steps in both modes, what is on screen

Precondition as SPEC-v2 §2: the main https stack on `:3000` serves the merge candidate, V is signed
in. Terracotta first, then switch with the `☾` / `☀` button in the top bar and repeat against the
Chamber artboard. The typed question on every "typed" artboard is
`Remote work should be the default for knowledge workers.`; the steering lines are
`Prefer primary sources` (presets) and `Flag any claim resting on a single source.` (annotations).
The app top bar is out of frame on every artboard (the frame is the `/new` page surface).

### State 1 — Free chosen, OPTIONS collapsed, question empty · artboards 3 (T) / 4 (C)
1. Open `/new`.
2. Compare with `S01-new-free-collapsed-terracotta.dc.html`: the selector sits between
   "What should we debate?" and the question bezel (M1). Free reads chosen (M2, M4), Premium
   unchosen (M3, M5). Free names `gpt-5.6-luna`, `claude-sonnet-5`; Premium names `gpt-5.6-sol`,
   `claude-opus-5`, `grok-4.6` (M7). The promises read as M6. The intro line and the two hints carry
   the Free wording (M9). Risk tier **Standard**, Composition budget tier **Low**, Tree depth **2**,
   both steering boxes empty (M10). The six pills, the depth slider and the two boxes are dimmed
   (M8 — nine locks on this screen). `Start run` is dimmed because the question is empty (M11).
   `⚙ OPTIONS` is at full opacity (M12).
3. Switch to Chamber; compare with `S01-new-free-collapsed-chamber.dc.html` (the same, in the
   Chamber values of §3).

### State 2 — Free chosen, OPTIONS expanded · artboards 9 (T) / 10 (C)
1. From state 1, click `⚙ OPTIONS`. It opens (R5).
2. Compare with `S01-new-free-expanded-terracotta.dc.html`: the panel is today's (dashed border,
   its notice line unchanged). Depth mode **Fixed**, Depth of scrutiny **Standard**, Branching width
   **2**, Concurrency **3**, Max tokens **800** (M10); the two dropdown boxes and the three sliders are
   dimmed in addition to state 1's nine (M8 — fourteen locks). The `Settings →` line is unchanged.
3. Switch to Chamber; compare with `S01-new-free-expanded-chamber.dc.html`.

### State 3 — Premium chosen, OPTIONS collapsed · artboards 5 (T) / 6 (C)
1. From state 1 (collapsed), click **Premium**.
2. Compare with `S01-new-premium-collapsed-terracotta.dc.html`: Premium reads chosen (M2, M4), Free
   unchosen (M3, M5). Nothing is dimmed (`opacity .45` occurs 0 times on this artboard except
   `Start run` while the question is empty, M11). The gauges show what Free left — Standard / Low /
   2 / empty — at full opacity. The intro line and the two hints are today's wording (M9's
   Premium column).
3. Switch to Chamber; compare with `S01-new-premium-collapsed-chamber.dc.html`.

### State 4 — Premium chosen, OPTIONS expanded, gauges moved (SPEC step 8) · artboards 11 (T) / 12 (C)
1. From state 3, type the question; click `⚙ OPTIONS`; click **High stakes**; click **High**; drag
   Tree depth to **4**; type the two steering lines; set Depth of scrutiny to **Deep**.
2. Compare with `S01-new-premium-moved-terracotta.dc.html`: every value as set, nothing dimmed,
   `Start run` at full opacity, Depth mode still **Fixed**, Branching width **2**, Concurrency **3**,
   Max tokens **800**.
3. Switch to Chamber; compare with `S01-new-premium-moved-chamber.dc.html`.

### State 5 — Free chosen again after state 4 (SPEC step 9) · artboards 13 (T) / 14 (C)
1. From state 4, click **Free**.
2. Compare with `S01-new-free-again-terracotta.dc.html`: the question text is unchanged; the
   OPTIONS panel is still open; Risk tier **Standard**, budget **Low**, depth **2**, both boxes empty,
   Depth of scrutiny back to **Standard**, the other knobs at Fixed / 2 / 3 / 800; all fourteen locks
   dimmed (M8); the Free wording is back (M9); `Start run` at full opacity (the question is typed).
3. Switch to Chamber; compare with `S01-new-free-again-chamber.dc.html`.

### State 6 — no tier chosen · artboards 7 (T) / 8 (C) — NOT a product state
Drawn as the row V-9 alternative reading (today's initial page with `Start run` disabled until a
tier is picked). V's yes takes Q1 as drawn on artboards 3–4, so this state is never reachable in the
product. The third reading on the close-up artboards ("NEITHER CHOSEN — THE ROW V-9 ALTERNATIVE") and
the close-up captions are mock furniture, not product copy (`MOCK.md` § "The tier element").

### Steps with no artboard — SPEC-v2 §2 as frozen
Steps 5–6 (nothing moves under Free), 10 (Premium again shows what step 9 left; step 8's values are
not restored), 11–12 (the `POST /v1/asks` body carries `"plan_tier":"free"` / `"premium"`, `202`)
have no artboard and stand exactly as SPEC-v2 §2 writes them.

## 3. Measurements — one line each; `S01-44` writes one assertion per line

Terracotta value / Chamber value, then the token that value is (checked against
`apps/ui/app/globals.css` `:5-113` and `:115-178` at `7f89f7b7`, 2026-09-10 — every hex on every
artboard is in those two blocks). Artboard line references are `S01-new-free-collapsed-terracotta.dc.html`
unless named; the close-ups carry the same element without the page.

- **M1 · the group.** `role="radiogroup"` `aria-label="Plan tier"`; `display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 20px` (line 24), placed
  between the `h1` "What should we debate?" (line 23) and the question bezel, which keeps its own
  `margin-top: 20px` (line 47). No visible label above it.
- **M2 · the chosen option.** `border: 1px solid` `--line-strong` (`rgba(41,38,31,.20)` /
  `rgba(242,234,217,.18)`); `background` `--shell` (`#EFE9E0` / `#221D17`); `border-radius: 12px`;
  `padding: 13px 14px`; a column with `gap: 9px`; `cursor: pointer`.
- **M3 · the unchosen option.** `border: 1px solid` `--line` (`rgba(41,38,31,.10)` /
  `rgba(242,234,217,.09)`); `background` `--core` (`#FDFBF6` / `#181410`); radius, padding, gap and
  cursor as M2.
- **M4 · the tier name, chosen.** A pill: `padding: 4px 12px; border-radius: 999px;
  font-size: 10.5px; font-weight: 700`; `background` `--ink` (`#29261F` / `#F2EAD9`); `color` `--bg`
  (`#F9F6F1` / `#14110E`) — the `.ndSegItem[aria-checked="true"]` look.
- **M5 · the tier name, unchosen.** The same pill at `font-weight: 600; background: transparent`;
  `color` `--muted` (`#6E675C` / `#9C907A`).
- **M6 · the promise.** `font-size: 11.5px`; `color` `--text-2` (`#555147` / `#B5A88F`). Text under
  Free: `Every gauge fixed. The question is yours.` Under Premium: `Every gauge yours to set.`
  Present in both chosen states.
- **M7 · the model ids.** A wrapping row (`display: flex; flex-wrap: wrap; gap: 10px`); each id
  `display: inline-flex; align-items: center; gap: 5px; font-family: 'JetBrains Mono', ui-monospace,
  monospace; font-size: 10.5px; font-weight: 500`; `color` `--text-3` (`#6E675C` / `#9C907A`). Before
  each id a `7px × 7px` circle: `--m-gpt` `#B4552D` for `gpt-5.6-luna` and `gpt-5.6-sol`, `--m-claude`
  `#8A63C9` for `claude-sonnet-5` and `claude-opus-5`, `--m-grok` `#5F6670` for `grok-4.6` (the three
  hexes are identical in both modes). Order: Free = `gpt-5.6-luna`, `claude-sonnet-5`; Premium =
  `gpt-5.6-sol`, `claude-opus-5`, `grok-4.6`. The ids come from `PLAN_TIER_ROSTERS` (SPEC R3/R11),
  never from a literal in the page.
- **M8 · the lock.** `opacity: 0.45; cursor: not-allowed` on each locked control and nothing else —
  no glyph, no colour change, no border change. Locked while Free is chosen: the six pills of Risk
  tier and Composition budget tier, the Tree depth slider, both steering boxes (nine on the
  collapsed screen: artboard 3 has exactly 10 occurrences of `opacity: 0.45`, the tenth being
  `Start run` under M11), plus the two `.ndSelect` **outer** boxes and the three OPTIONS sliders when
  the panel is open (fourteen: artboard 13 has exactly 14 occurrences, its `Start run` being live).
  Never dimmed by the tier: the `⚙ OPTIONS` toggle, the question box, `Cancel`, the `Settings →` line.
- **M9 · the three Free-state lines** (Premium keeps today's `page.tsx` wording):
  intro `Free runs every debate at fixed settings. Type your question and click Start, or choose
  Premium to set the gauges yourself.` · risk hint `How much is riding on the answer · fixed by the
  Free plan` · budget hint `How much work the composition may spend · fixed by the Free plan`. The
  depth hint (`How far the debate expands when cross-maker review is available`) is the same in
  both tiers.
- **M10 · the Free values.** Risk tier **Standard**; Composition budget tier **Low**; Tree depth
  **2**; both steering boxes empty; Depth mode **Fixed**; Depth of scrutiny **Standard**; Branching
  width **2**; Concurrency **3**; Max tokens **800** (the SPEC R7 list).
- **M11 · `Start run`.** Dimmed (`opacity: 0.45; cursor: not-allowed`) only while the question is
  empty, in both tiers — today's rule (SPEC R18); at full opacity on every "typed" artboard.
- **M12 · `⚙ OPTIONS`.** The toggle at full opacity in Free (artboards 9, 13); the open panel keeps
  today's dashed 1px `--line-strong` border and its notice line.
- **M13 · no new colour.** Every hex on all fourteen artboards is one of the tokens named in M2–M7
  or in `MOCK.md` § "Provenance" (the chrome). `C4` adds no token (`S01-42`'s first sentence).
- **M14 · the chrome.** Eyebrow, title, bezel, question core, gauge card, rows, pills, sliders,
  steering boxes, provenance line, OPTIONS toggle and panel, actions row: unchanged from today, per
  the `MOCK.md` § "Provenance" table (each row names the `globals.css` line it copies).
- **M15 · type.** The tier-name pill in the page sans (`Plus Jakarta Sans` stack) at 10.5px; the
  ids in `JetBrains Mono` at 10.5px; the promise in the page sans at 11.5px. No new font.

## 4. Acceptance

SPEC-v2 §2 steps 1–12, once in Terracotta and once in Chamber, each step also compared with the
state's artboard per §2 above. QA is V personally (`S01-46`); no seat marks this done.

## 5. What the artboards do not draw

Hover, focus ring, keyboard movement between the two options, and any transition: nothing is drawn,
so the built control carries SPEC R1's attribute contract (`SegmentedRow`'s `role="radio"`,
`aria-checked`, `data-field`, `data-value`) and the page's existing focus treatment, and animates
nothing. The `title` attribute, tooltips and a padlock glyph are absent on every artboard.
