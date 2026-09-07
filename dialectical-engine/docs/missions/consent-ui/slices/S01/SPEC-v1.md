# S01 — Cookie consent: bar (10a), preferences card (10b), persistence, Settings re-entry · SPEC v1 (FROZEN 2026-09-06 by REQ-01)

**Frozen at creation.** No seat edits this file, REQ-01 included. A correction is
`SPEC-v2.md` carrying a supersession header; this file stays. Scope changes are ratified
by V, never absorbed silently.

## Purpose (≤5 lines)

A first-time visitor is asked, once, what may be stored in their browser, on whatever page
they arrive at, and the answer is remembered until they clear site data. They may accept
everything, take essentials only, or open a per-category card and choose. The same card is
reachable afterwards from Settings → Privacy. Nothing is loaded or unloaded on the choice
today (intake C10) — the decision is recorded honestly and gates nothing yet.

## Design of record (artboards, extract paths, the sentences that bind)

- **10a — the bar** and **10b — the card**: `docs/missions/consent-ui/design/turn-10-cookie-consent.html`
  (10a at lines 11-44, 10b at lines 101-134). Bottom-anchored bezel bar; `Choose what to
  store` expands the per-category panel with essential locked on; both follow the mode toggle.
- **Every string, the both-mode token map, and the three categories**:
  `docs/missions/consent-ui/design/design-data.js` (`tokensFor` 3-13, `tint` 22-25, `okC` 28,
  `mkCat` 42-48, `cookieCats` 87-91).
- **The two sentences that bind beyond geometry.** The TURN 10 intro
  (`turn-10-cookie-consent.html:8`): *"Shown once, on first visit, over the landing page…
  Both states follow the mode toggle."* — narrowed by V-7's default to an app-wide mount
  (intake C9). And the 10b lede promises `Settings → Privacy`, which is why R18 exists
  (intake C5 / row V-4); shipping the sentence without the surface would be a false promise.
- **`Privacy notice` (10b footer, `turn-10-cookie-consent.html:127`) opens the S02 modal in
  read-only mode.** The interface S01 requires of it is stated verbatim in **S01-R20** and is
  reproduced sentence for sentence in `slices/S02/SPEC.md` **S02-R14**. Neither slice may
  change it alone.

## Requirements

Each requirement is `statement · source · verification hook`. A hook names what a test or a
V step **observes**; where jsdom cannot observe a thing, the hook says so and hands it to V
rather than pretending.

### Storage and decision state

**S01-R01 — The stored decision is one `localStorage` key, `debateai.consent`, holding one
JSON object with exactly these five members and no others:**

```json
{"v":1,"essential":true,"quality":true,"analytics":false,"decidedAt":"2026-09-06T18:02:11.123Z"}
```

`v` is the integer schema version and is `1` for this slice. `essential` is always `true`
and is stored explicitly, never omitted. `quality` and `analytics` are booleans. `decidedAt`
is the UTC ISO-8601 string produced by `new Date().toISOString()` and records when THIS
stored decision was taken — a later re-save overwrites it.
· **Source:** COMMON §8 (the `debateai.` prefix; `debateai.mode` at `apps/ui/app/layout.tsx:39`
is the existing member of that namespace); intake C9/C10; REQ-01 decision.
· **Hook:** a jsdom test writes each decision path and asserts
`JSON.parse(localStorage.getItem("debateai.consent"))` deep-equals the expected object with
`decidedAt` matched by `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/`, and asserts
`Object.keys(...).sort()` equals `["analytics","decidedAt","essential","quality","v"]`.

**S01-R02 — A stored value whose `v` is not `1` is treated as no decision: the bar shows,
and the next decision overwrites the key. No migration code is written.**
· **Source:** REQ-01 decision. There is no v0 to migrate from, so a migration path would be
untested code for a case that cannot occur; and re-asking on a schema change is the
conservative reading of consent. The rejected alternative (silently carry the booleans
forward) is recorded in DECISIONS.
· **Hook:** jsdom test seeds `{"v":0,"essential":true,"quality":true,"analytics":true,"decidedAt":"…"}`,
mounts, and asserts the bar is in the document.

**S01-R03 — A value that is absent, unparseable, not an object, or missing any of the five
members is treated as no decision, and no read or write ever throws.** Every
`localStorage` access is wrapped in `try/catch` (the precedent is `ModeToggle.tsx:23-27` and
`layout.tsx:39-42`). If a **read** throws or returns nothing, the bar shows. If a **write**
throws, the surface still closes and the decision lives in React state for the lifetime of
that page — the visitor is never trapped by a storage failure — and the bar returns on the
next full page load.
· **Source:** REQ-01 decision; the house `try/catch` precedent above.
· **Hook:** jsdom tests for each of `null`, `"not json"`, `"[]"`, `'{"v":1}'` assert the bar
renders; a test that replaces `localStorage.setItem` with a throwing stub asserts that
clicking `Accept all` removes the bar and raises no error.

**S01-R04 — Each control writes exactly this:**

| Control | Where | `essential` | `quality` | `analytics` |
|---|---|---|---|---|
| `Accept all` | bar | `true` | `true` | `true` |
| `Essential only` | bar | `true` | `false` | `false` |
| `Essential only` | card (both entry points) | `true` | `false` | `false` |
| `Save choices` | card | `true` | current toggle | current toggle |

Every write sets `v` to `1` and `decidedAt` to the moment of the click. `Essential only`
produces the identical object from the bar and from the card.
· **Source:** design 10a/10b footers; REQ-01 decision.
· **Hook:** four jsdom cases, one per row, each asserting the parsed object per R01.

**S01-R05 — Clearing site data restores the first-visit state.** Removing
`debateai.consent` and reloading shows the bar again.
· **Source:** intake C9; row V-7 default.
· **Hook:** V acceptance steps 4-5; in jsdom, `localStorage.clear()` then remount asserts the
bar renders.

### Mount, first paint, and layering

**S01-R06 — The server renders nothing for this surface, and the decision is read only
after mount.** The component's first render returns `null`; a `useEffect` reads storage and
only then may the bar render. **No pre-paint inline `<script>` is added.**
· **Source:** REQ-01 decision. The neighbouring precedent invites the opposite mistake: the
mode guard at `apps/ui/app/layout.tsx:36-42` DOES run a blocking pre-paint script, because a
wrong *theme* flashes visibly. A consent bar that is briefly *absent* is invisible, so
consent needs the opposite treatment — render nothing until an effect has read storage, so a
returning visitor never sees the bar flash and the server/client markup cannot disagree.
· **Hook:** `renderToStaticMarkup` of the component emits the empty string; a jsdom test
asserts the bar is absent on the first render pass and present after effects flush; and
`tests/unit/t9-mode-tokens.test.ts:502-503` continues to pass, since `layout.tsx` gains no
second storage reader.

**S01-R07 — The surface mounts once, in `apps/ui/app/layout.tsx`, as a sibling placed AFTER
`{children}` inside `<div className="appShell">`, and shows on every route.**
`<TopBar />` must remain the immediately adjacent first child of `<div className="appShell">`.
· **Source:** intake C9 / row V-7 default (app-wide, not landing-only, because signed-in
users never see `/`); and the hard constraint at `tests/render/t3-library.test.tsx:236`,
which asserts `layoutSource` matches `/<div className="appShell">\s*<TopBar \/>/` — mounting
between them fails that test.
· **Hook:** `tests/render/t3-library.test.tsx:231-237` stays green; a source-text assertion
that `layout.tsx` contains the mount after `{children}`; V acceptance step 12 opens
`/`, `/sign-up` and `/settings` and sees the bar on each.

**S01-R08 — Stacking is by five new tokens with these exact values, chosen against the
measured ladder.** The bar sits above the top bar and the token dock but below the drawer,
so an open drawer is never covered by a consent bar; the two consent dialogs sit above the
existing modal band and below the toast ceiling; the policy modal sits above the preferences
card because it opens from it.

| Token | Value | Applies to | Sits between |
|---|---|---|---|
| `--z-consent-bar` | `45` | the 10a bar | `.tokenDock` 40 and `.drawerScrim` 54 |
| `--z-consent-scrim` | `75` | 10b scrim | `.modalScrim` 70 and the policy scrim |
| `--z-consent-card` | `76` | 10b card | — |
| `--z-policy-scrim` | `77` | 10c scrim (S02 consumes) | — |
| `--z-policy-card` | `78` | 10c card (S02 consumes) | below `.toast` 80 |

Measured ladder, all in `apps/ui/app/globals.css`: `--z-canvas-sticky: 4` / `--z-zoom-cluster: 5`
(`:78`), `.topBar` 30 (`:318`), `.debateTopBar` 30 (`:1639`), `.debateOverflowMenu` 35
(`:1765`), `.tokenDock` 40 (`:3401`), `.drawerScrim` 54 (`:2648`), `.drawer` 55 (`:2658`),
`.popScrim` 60 (`:3178`), `.popAnchor` 61 (`:3183`), `.modalScrim` 70 (`:3265`), `.toast` 80
(`:3343`).
· **Source:** REQ-01 decision on the measured ladder above.
· **Hook:** the five tokens appear in `:root` and in the test's `MODE_INDEPENDENT` map with
these exact string values (R21); the CSS rules reference them via `var()`; V acceptance
step 13 opens a debate route, opens the node drawer, and observes the drawer above the bar.

### The bar (10a)

**S01-R09 — Geometry, quantified.** Fixed to the viewport, `left: 22px; right: 22px;
bottom: calc(22px + var(--safe-b))`. Outer bezel: `background: var(--shell)`, `1px solid
var(--line-strong)`, `border-radius: var(--r-panel)` (16px), `padding: 7px`, `box-shadow:
var(--shadow-pop)`. Inner core: `background: var(--core)`, `1px solid var(--line)`,
`border-radius: 10px`, `padding: 17px 20px 16px`, `overflow: hidden`, `position: relative`.
Gold tab: `position: absolute; top: 0; left: 20px; width: 52px; height: 4px; border-radius:
var(--r-tab); background: var(--gold)`. Copy block and button group are a row with `gap:
24px`, `align-items: center`; the buttons sit in a row with `gap: 9px` and do not wrap
(`white-space: nowrap`). The body paragraph keeps `max-width: 560px`.
· **Source:** `turn-10-cookie-consent.html:26-40`, read literally; `--safe-b` is the existing
mode-independent token for the iOS home-indicator inset.
· **Hook:** V acceptance steps 1-2 in both modes; jsdom asserts the element structure and the
class names, not the computed pixels (jsdom computes no layout — stated plainly).

**S01-R10 — Below 720px viewport width the bar stacks: the button group moves under the copy
block.** At `max-width: 719.98px`: the inner core becomes `flex-direction: column;
align-items: stretch; gap: 14px`; the button group becomes a row with `flex-wrap: wrap` where
each button is `flex: 1 1 auto; min-width: 0` and `white-space: nowrap` is kept; the bar's
insets drop from 22px to 12px on all three sides.
· **Source:** REQ-01 decision. **720 is derived, not chosen by convention:** the three button
labels at the designed 11.5-12px/600-700 measure about 118px + 155px + 100px, plus two 9px
gaps = ~391px; a readable copy column needs ~260px; the row gap is 24px and the core's
horizontal padding is 40px — 391 + 260 + 24 + 40 = 715px, so the designed row stops fitting
just under 720. It also sits below the 768px tablet-portrait width, so tablets keep the
designed layout.
· **Hook:** V acceptance step 14 narrows the window below 720 and observes the stack; the CSS
media query is a source-text assertion.

**S01-R11 — Copy is byte-exact from the design (see §Copy).** The eyebrow, the Fraunces
title, the body paragraph and the three button labels.
· **Source:** `turn-10-cookie-consent.html:31,33,34,37,38,39`.
· **Hook:** jsdom `textContent` equality against the strings in §Copy.

**S01-R12 — The bar is a labelled region, is in the natural tab order, and traps no focus.**
`role="region"` with `aria-label="Cookie consent"`. Tab order within the bar follows DOM
order: `Essential only`, `Choose what to store`, `Accept all`. Focus is never forced into the
bar and never trapped there — the visitor must be able to read the page before deciding.
· **Source:** REQ-01 decision; a consent bar that traps focus makes the page unusable.
· **Hook:** jsdom asserts the role and label and the order of focusable descendants; V
acceptance step 15 tabs from the page into the bar and back out.

**S01-R13 — The bar offers no dismissal that is not a decision.** There is no close control,
Esc does nothing to it, and it does not hide on scroll, navigation or outside click. It
leaves only by `Accept all`, `Essential only`, or a `Save choices` / `Essential only` taken
in the card.
· **Source:** the design gives 10a three buttons and no close affordance
(`turn-10-cookie-consent.html:37-39`); row V-7 default ("shows … until they choose").
`Essential only` is the one-click way out, so nothing is coerced.
· **Hook:** jsdom presses Escape with the bar showing and asserts the bar is still in the
document and nothing was written to storage; V acceptance step 16.

### The preferences card (10b)

**S01-R14 — The card opens as a centred modal dialog over the shared scrim, and the bar is
not rendered while it is open.** `--scrim` covers the viewport; the card is centred; on close
without a decision from the FIRST-VISIT entry the bar returns; from the SETTINGS entry
nothing returns.
· **Source:** REQ-01 decision. The packet offered three presentations — replace the bar,
centre it on the 10c scrim, or grow it in place. **The Settings re-entry (R18) eliminates the
other two:** there is no bar in Settings to replace or to grow from, so those choices would
require a second layout for the same card. One presentation serves both entry points. The
design shows 10b as a standalone artboard with no surrounding context, so it does not
contradict this; 10c's artboard shows a scrim because it is a modal
(`turn-10-cookie-consent.html:49`). Recorded as contested row Q7-02.
· **Hook:** jsdom asserts that with the card open the bar is absent and the scrim present;
that Esc from the first-visit entry restores the bar and writes nothing; that Esc from the
Settings entry leaves storage unchanged. V acceptance steps 6 and 11.

**S01-R15 — Card geometry.** `width: min(520px, calc(100vw - 32px))`; outer bezel
`background: var(--shell)`, `padding: 7px`, `border-radius: 18px`; inner core `background:
var(--core)`, `1px solid var(--line)`, `border-radius: 12px`, `padding: 22px 24px 20px`,
`position: relative`, `overflow: hidden`; the same 52×4 gold tab at `left: 24px`; category
rows `padding: 14px 0` separated by `1px solid var(--line)`; the toggle is 38×22 with a 16px
knob and `padding: 2px`. `max-height: 92vh` with the category list scrolling if the viewport
is shorter.
· **Source:** `turn-10-cookie-consent.html:103-131`; the 520 and 38×22 are the artboard's own
numbers; `min(520px, 100vw - 32px)` and `max-height: 92vh` are REQ-01's responsive rule.
· **Hook:** V acceptance steps 6 and 14; source-text assertion of the width rule.

**S01-R16 — The three categories render verbatim from `cookieCats`, in that order, each with
name, tag pill, description and mono detail line** (see §Copy for all twelve strings).
· **Source:** `design-data.js:87-91`.
· **Hook:** jsdom asserts the three names in order and each of the twelve strings by
`textContent` equality.

**S01-R17 — Toggle semantics.** Each category row carries one control with
`role="switch"` and `aria-checked`. **Essential** is `aria-checked="true"`,
`aria-disabled="true"`, `cursor: not-allowed`, and neither click nor keyboard changes it.
**Model quality telemetry** defaults ON and **Product analytics** defaults OFF whenever the
card opens with no stored decision. When the card opens from Settings, or re-opens with a
stored decision present, both reflect the stored booleans. Both operable toggles respond to
click, `Space` and `Enter` while focused.
· **Source:** `design-data.js:88-90` — the `on`/`locked` arguments of `mkCat` are
`(true,true)`, `(true,false)`, `(false,false)`; `mkCat`'s `cursor` is `not-allowed` when
locked (`design-data.js:47`).
· **Hook:** jsdom asserts the three `aria-checked` values on a fresh open; asserts clicking
and pressing Space on the Essential switch leaves `aria-checked="true"`; asserts Space
toggles each of the other two; asserts a seeded decision of
`{"v":1,"essential":true,"quality":false,"analytics":true,…}` opens the card with
`aria-checked` false/true respectively.

**S01-R18 — The card is a modal dialog with a focus trap, and it has no `×`.**
`role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the `Cookie preferences`
title element. Initial focus goes to the first operable toggle (Model quality telemetry). Tab
and Shift+Tab cycle within the card. Esc and a backdrop click both close it per R14. Focus
returns to the control that opened it — `Choose what to store` on the bar, or
`Cookie preferences` in Settings. The design gives 10b no close glyph
(`turn-10-cookie-consent.html:126-131`), so none is added; `Essential only` is a visible exit
from the first-visit entry, and Esc or a backdrop click is the exit that changes nothing.
· **Source:** design as cited; REQ-01 decision on the omitted `×` (contested row Q7-03).
· **Hook:** jsdom asserts the three ARIA attributes, the initially focused element, that Tab
from the last focusable returns to the first, and that focus returns to the opener on close.

**S01-R19 — Footer actions.** `Privacy notice` (an underlined text button on the left),
`Essential only`, `Save choices` (primary). `Essential only` and `Save choices` each write per
R04 and close the card and the bar together.
· **Source:** `turn-10-cookie-consent.html:127,129,130`.
· **Hook:** two jsdom cases asserting the written object and that neither the card nor the bar
remains in the document.

**S01-R20 — `Privacy notice` opens the S02 policy modal in read-only mode, over the card,
and closing it returns to the card with every toggle and the stored decision unchanged.**

> `PrivacyPolicyModal` is a client component at `apps/ui/components/consent/PrivacyPolicyModal.tsx`
> whose props are exactly `{ open: boolean; mode: "read" | "consent"; onClose: () => void;
> onAcknowledge?: () => void }`. It renders `null` when `open` is `false`. It owns no consent
> state and reads or writes no storage. It calls `onAcknowledge` only from the `I have read it`
> button and only when `mode` is `"consent"`. When `mode` is `"read"` it renders no
> `I have read it` button, applies no scroll-to-end gate, and never calls `onAcknowledge`.

S01 consumes this component and does not edit it. **This paragraph is reproduced verbatim as
S02-R14 and neither slice may change it alone.**
· **Source:** intake C8; the packet's cross-slice interface charge; REQ-01 decision.
· **Hook:** a jsdom test opens the card, clicks `Privacy notice`, asserts the policy dialog is
present with no `I have read it` button, closes it, and asserts `localStorage.getItem("debateai.consent")`
is unchanged and the three `aria-checked` values are unchanged. V acceptance step 17.

### Settings re-entry

**S01-R21 — `apps/ui/app/settings/page.tsx` gains one `Privacy` panel containing one button,
`Cookie preferences`, which opens the same card pre-filled from storage.** The panel follows
the page's existing vocabulary (`.setSectionHead` / `.setSectionTitle` / `.setSectionHint` /
`.setBtn`, as used by `SessionControls` at `apps/ui/components/SessionControls.tsx:166-171`).
Saving from here writes per R04 and rewrites `decidedAt`.
· **Source:** intake C5 / row V-4 default; the 10b lede's promise `Settings → Privacy`.
· **Hook:** a jsdom render of the panel asserts the button exists and opens the dialog with
`aria-checked` reflecting a seeded stored decision. V acceptance steps 9-10.

**S01-R22 — Settings is auth-gated today, and this slice does not change that.** The page is
`<AuthGate>{() => <AccountSettingsScreen />}</AuthGate>` (`apps/ui/app/settings/page.tsx:37-39`);
`AuthGate` redirects an unauthenticated visitor with `window.location.replace("/login")`
(`apps/ui/components/AuthGate.tsx:21-23`). **An anonymous visitor therefore never reaches the
Privacy panel** — they are sent to `/login`. Their route to the card remains the bar itself,
which is app-wide. No un-gated re-entry point is added by this slice.
· **Source:** measured at the two citations above.
· **Hook:** stated fact, verified by reading those lines; V acceptance step 10 is performed
signed in, and step 10b signed out observes the redirect.

### Honesty, tokens, modes

**S01-R23 — Storing a preference loads nothing, unloads nothing, and gates nothing today.**
No script, request, pixel or feature is conditioned on `quality` or `analytics`. The slice
adds no analytics consumer and no placeholder that pretends to be one. A future consumer will
read the stored decision; until then the record is a record.
· **Source:** intake C10, resolved; COMMON §36 standing V honesty law.
· **Hook:** a grep-shaped assertion that no file added by this slice references an analytics
or telemetry SDK, plus the absence of any conditional load keyed on the stored booleans.

**S01-R24 — S01 is the sole writer of the two `globals.css` token blocks and of
`tests/unit/t9-mode-tokens.test.ts`, and adds exactly these ten tokens** (values comma-tight,
byte-identical in CSS and in the test maps — `TERRACOTTA` and `CHAMBER` are compared raw at
`tests/unit/t9-mode-tokens.test.ts:380,383`):

| Token | Terracotta | Chamber | Map |
|---|---|---|---|
| `--ok-soft` | `rgba(62,122,78,.28)` | `rgba(134,181,141,.35)` | TERRACOTTA + CHAMBER |
| `--ok-edge` | `rgba(62,122,78,.55)` | `rgba(134,181,141,.55)` | TERRACOTTA + CHAMBER |
| `--muted-bg` | `rgba(110,103,92,.1)` | `rgba(156,144,122,.14)` | TERRACOTTA + CHAMBER |
| `--muted-border` | `rgba(110,103,92,.4)` | `rgba(156,144,122,.5)` | TERRACOTTA + CHAMBER |
| `--scrim` | `rgba(10,8,6,.42)` | same | MODE_INDEPENDENT |
| `--z-consent-bar` | `45` | same | MODE_INDEPENDENT |
| `--z-consent-scrim` | `75` | same | MODE_INDEPENDENT |
| `--z-consent-card` | `76` | same | MODE_INDEPENDENT |
| `--z-policy-scrim` | `77` | same | MODE_INDEPENDENT |
| `--z-policy-card` | `78` | same | MODE_INDEPENDENT |

Derivations: `--ok-soft` and `--ok-edge` are the design's `tint(okC, .28|.35)` and
`tint(okC, .55)` over `okC` = `#3E7A4E` / `#86B58D` (`design-data.js:22-28,44-45`), used for
the locked toggle track and the accent border of every check square and toggle edge.
`--muted-bg` / `--muted-border` are `tint(tA.mute, .1|.14)` and `tint(tA.mute, .4|.5)` — the
Product analytics tag pill, the one category whose `tagC` has no existing `-bg`/`-border`
pair. The other two tag pills reuse the existing `--ok-bg`/`--ok-border` and
`--gold-bg`/`--gold-border`. `--scrim` is the 10c overlay `rgba(10,8,6,.42)`
(`turn-10-cookie-consent.html:49`), named by COMMON §7.
**Why sole-writer, mechanically:** `tests/unit/t9-mode-tokens.test.ts:380-383` asserts exact
set equality between the tokens declared in `:root` and `Object.keys(TERRACOTTA) ∪
Object.keys(MODE_INDEPENDENT)`, and between the chamber block and `Object.keys(CHAMBER)`. Any
token added without the matching map entry fails the suite, and two lanes editing the same two
files would conflict on every addition. **S02 adds no token and edits neither file** — the five
policy-modal tokens it consumes are declared here.
· **Source:** COMMON §7; the set-equality assertion measured at the citation above.
· **Hook — the DELTA, never the absolute.** `tests/unit/t9-mode-tokens.test.ts` is **RED at
base**: `BASELINE.md` records exit 1, `Tests 2 failed | 6 passed (8)`, with two pre-existing
failures owned by another mission — the ModeToggle label test (it expects `☀ Terracotta`;
`apps/ui/components/ModeToggle.tsx:41` renders `☀`/`☾`), and the colour-literal test with
exactly ONE hit, `.drawerScrim[data-drawer-scrim] { background: color-mix(in srgb, #0a0806
32%, transparent); }` in `globals.css`. After the token additions: **"declares the complete
inventory and the same mode-bearing key set in both modes" must be GREEN** — it is green at
base and it is the assertion the ten new tokens can break — and the failure set must remain
exactly those two. A third failing test, or a second entry in the literal hit list, is this
slice's. Never report this suite as "green".

**S01-R25 — Every colour in every file this slice adds is a `var(--token)` reference; no
`#hex`, `rgb(`, `rgba(` or `oklch(` literal appears in `apps/ui/app/globals.css` outside the
two token blocks, nor anywhere in `apps/ui/app/layout.tsx`.** New rules go in ONE delimited
block `/* === consent-ui S01 === */ … /* === end consent-ui S01 === */` appended at the end
of `globals.css`.
· **Source:** COMMON §7 colour-literal gate, measured at `tests/unit/t9-mode-tokens.test.ts:541-560`,
whose scan covers exactly `globals.css`, `layout.tsx`, `ModeToggle.tsx`, `debatePresentation.ts`
(`:546`). Components under `apps/ui/components/consent/` are NOT scanned — the rule is imposed
here by the design-system law, not by that test.
· **Hook:** the literal-scan test's hit list stays **exactly the one pinned line**
(`.drawerScrim[data-drawer-scrim]`, whose line number shifts as this slice appends its CSS
block); a second hit is this slice's finding. The test is red at base and is reported as a
hit-list delta, never as "green". Plus a source-text assertion over the slice's own new files
for the same pattern, since the shipped test does not scan them.

**S01-R26 — Both surfaces follow the mode toggle live.** Flipping Terracotta ↔ Chamber with
the bar showing, or with the card open, restyles it without a reload and without closing it.
· **Source:** `turn-10-cookie-consent.html:8` — "Both states follow the mode toggle."
· **Hook:** V acceptance steps 2 and 6 are each performed in both modes, and step 18 flips the
mode with the card open.

**S01-R27 — Motion respects `prefers-reduced-motion`.** If the card or bar animates in, the
slice adds its own `@media (prefers-reduced-motion: reduce)` block disabling that animation.
There is no global reduced-motion reset in this codebase — the four existing blocks
(`globals.css:269,3663,4681,5244`) are each scoped to their own component, and neither
`.modalCard`'s `de-popin` nor `.drawer`'s `de-slidein` is covered by any of them.
· **Source:** measured at the four citations above; house convention is a scoped block.
· **Hook:** source-text assertion that the slice's CSS block contains a
`prefers-reduced-motion` rule naming its own selectors, or contains no animation at all.

**S01-R29 — The one surface the bar deliberately overlays is the debate route's token dock,
and doing so blocks no control.** `.tokenDock` is `position: fixed; right: 18px; bottom: 18px;
z-index: 40` (`apps/ui/app/globals.css:3396-3403`), rendered only on the owner debate view
(`apps/ui/app/debate/[id]/DebatePageClient.tsx:1525-1529`), and it contains exactly one
non-interactive status pill — `{actionToken ? "🔓 Signed in" : "Session required"}` — inside
an `aria-live="polite"` span. The consent bar at `--z-consent-bar: 45` therefore covers a
status indicator, never a control, and only until the visitor decides. **No route-aware
bottom offset is added to the bar**, and the dock is not moved.
· **Source:** measured at the two citations above; the alternative — teaching a
layout-level component which route it is on so it can dodge the dock — trades a temporary
overlap of a status pill for permanent route coupling in the root layout.
· **Hook:** V acceptance step 13 also confirms that with the bar showing on an owner debate
route, every bar button is clickable and no interactive control is unreachable; a jsdom
assertion that the bar's CSS carries no route-conditional offset.

## States and transitions

| From | Event | To | Storage write |
|---|---|---|---|
| *mount* | effect reads a valid v1 decision | Silent | none |
| *mount* | effect reads nothing / invalid / throws | Bar | none |
| Bar | `Accept all` | Silent | R04 row 1 |
| Bar | `Essential only` | Silent | R04 row 2 |
| Bar | `Choose what to store` | Card (first-visit) | none |
| Bar | Esc, scroll, navigation, outside click | Bar (unchanged) | none |
| Card (first-visit) | `Save choices` | Silent | R04 row 4 |
| Card (first-visit) | `Essential only` | Silent | R04 row 3 |
| Card (first-visit) | Esc / backdrop | Bar | none |
| Card (either) | `Privacy notice` | Policy modal (`mode="read"`) over the card | none |
| Policy modal (read) | Esc / backdrop / `×` / `Close` | the card it came from, unchanged | none |
| Silent, in Settings | `Cookie preferences` | Card (settings), pre-filled | none |
| Card (settings) | `Save choices` / `Essential only` | Silent | R04 row 4 / row 3 |
| Card (settings) | Esc / backdrop | Silent | none |

"Silent" = neither bar nor card is rendered anywhere in the app.

## Storage / data contract

Key `debateai.consent`, one JSON object, schema `v: 1`, members `v`, `essential`, `quality`,
`analytics`, `decidedAt` (R01). Read once after mount; written only by the four controls in
R04. Version mismatch re-asks (R02); corruption re-asks (R03); clearing site data re-asks
(R05). Categories map to the design's three: `essential` ← Essential (locked true),
`quality` ← Model quality telemetry (default true), `analytics` ← Product analytics (default
false). Nothing reads these booleans in the product today (R23).

## Copy — verbatim

**Bar (10a)** — `turn-10-cookie-consent.html:31,33,34,37,38,39`:

- eyebrow: `YOUR DATA, ON THE RECORD`
- title: `We store only what keeps the bench running — unless you say otherwise.`
- body: `Essential cookies hold your session, MFA state and device record. Analytics and model-quality telemetry are optional and never sold. You can change this any time in Settings.`
- buttons, in DOM order: `Essential only` · `Choose what to store` · `Accept all`

**Card (10b)** — `turn-10-cookie-consent.html:106,107,108,127,129,130`:

- eyebrow: `CHOOSE WHAT TO STORE`
- title: `Cookie preferences`
- lede: `Asked once. Revisit any time from Settings → Privacy.`
- footer: `Privacy notice` · `Essential only` · `Save choices`

**Categories** — `design-data.js:88-90`, in this order:

| Name | Tag | Description | Mono detail line |
|---|---|---|---|
| `Essential` | `ALWAYS ON` | `Session, MFA state and the device record that lets you spot a login you do not recognise.` | `de_session · de_mfa · de_device — 30 days` |
| `Model quality telemetry` | `OPTIONAL` | `Which arguments you challenge or flag, used to tune judge panels. Never tied to your debates’ text.` | `de_quality — 90 days · first-party` |
| `Product analytics` | `OPTIONAL` | `Aggregate page and feature usage. No cross-site tracking, no advertising, never sold.` | `de_analytics — 90 days · first-party` |

Note the U+2019 right single quotation mark in `debates’ text` (`design-data.js:89` encodes it
as `’`) and the U+00B7 middle dots and U+2014 em dashes in the detail lines. The em dash
in the bar title is U+2014. `Settings → Privacy` uses U+2192.

**Settings panel** — REQ-01, following the page's existing vocabulary: section title
`Privacy`, hint `Choose what this browser stores. Asked once; change it here any time.`,
button `Cookie preferences`.

> **⚠ The three mono detail lines name five cookies that do not exist in this product.**
> `grep` for `de_session|de_mfa|de_device|de_quality|de_analytics` over `apps packages tests
> migrations` returns zero hits; the product sets exactly two cookies,
> `__Host-debateai-session` (`apps/api/src/index.ts:169`) and `__Host-debateai-csrf`
> (`apps/api/src/index.ts:170`). This SPEC pins the strings **verbatim**, as the packet
> requires, and pins them as data in ONE exported constant (R28) so that either V ruling is a
> one-line data edit rather than a component change. Routed as contested row **Q7-01**; V's
> ruling supersedes this paragraph.

**S01-R28 — The three category records live in one exported constant,
`COOKIE_CATEGORIES`, in `apps/ui/lib/consent.ts`**, each `{ id, name, tag, description,
detail, locked, defaultOn }`, and the components render from it. No copy string is inlined in
a component.
· **Source:** REQ-01 decision; the containment requirement above.
· **Hook:** source-text assertion that the twelve strings appear once each, in
`apps/ui/lib/consent.ts`, and that no component file contains any of them.

## Token mapping (element → tokens)

| Element | Tokens |
|---|---|
| bar bezel / card bezel | `--shell`, `--line-strong`, `--r-panel`, `--shadow-pop` |
| bar core / card core | `--core`, `--line` |
| gold tab (both) | `--gold`, `--r-tab` |
| eyebrow (both) | `--gold`, `--font-mono` |
| title (both) | `--ink`, `--font-display` |
| body / lede / descriptions | `--text-2`, `--font-sans` |
| mono detail lines | `--muted`, `--font-mono` |
| ghost buttons (`Essential only`, `Choose what to store`) | `--line-strong`, `--muted` / `--ink`, `--r-pill` |
| primary buttons (`Accept all`, `Save choices`) | `--ink` background, `--bg` text, `--r-pill` |
| `Privacy notice` link | `--muted`, underline |
| tag pill — Essential | `--ok-bg`, `--ok-border`, `--ok-dot` |
| tag pill — Model quality telemetry | `--gold-bg`, `--gold-border`, `--gold` |
| tag pill — Product analytics | `--muted-bg` (new), `--muted-border` (new), `--muted` |
| toggle track ON | `--ok-dot` background, `--ok-edge` (new) border |
| toggle track ON + locked | `--ok-soft` (new) background, `--ok-edge` (new) border |
| toggle track OFF | `--shell` background, `--line-strong` border |
| toggle knob | `--core` when on, `--muted` when off, `--shadow-thumb`, `--r-dot` |
| card scrim | `--scrim` (new), `--z-consent-scrim` (new) |
| bar / card layer | `--z-consent-bar` / `--z-consent-card` (new) |
| Settings panel | the page's existing `.set*` vocabulary |

New tokens and their both-mode values are pinned in R24. Contrast of `--muted` on
`--muted-bg` over `--core`, in both modes, is checked with the repo's contrast helper
(`tests/support/contrast.ts`, loaded at `tests/unit/t9-mode-tokens.test.ts:306-309`) against
the 4.5:1 threshold. **UNVERIFIED by REQ-01** — I did not run the helper; the slice measures
it and records the number.

## Accessibility and keyboard

- **Bar:** `role="region"`, `aria-label="Cookie consent"`, natural tab order, no focus trap,
  no Esc dismissal (R12, R13).
- **Card:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the title, initial
  focus on the first operable toggle, Tab cycles within, Esc and backdrop close per R14,
  focus returns to the opener (R18).
- **Toggles:** `role="switch"` + `aria-checked`; Essential also `aria-disabled="true"` and
  unresponsive to click, Space and Enter; the other two respond to click, Space and Enter
  (R17).
- **Focus visibility:** every control shows a visible focus ring using `--focus`.
- **Net-new machinery, stated plainly:** this codebase has **no** focus trap, **no**
  Esc-to-close, **no** focus restore and **no** body scroll lock anywhere. Verified by grep
  over `apps/ui/**/*.ts,*.tsx`: `createPortal` 0 hits, `Escape` 0 hits, `focusTrap` 0 hits,
  `.focus()` 0 hits, `document.body` 0 hits, `addEventListener("keydown"` 0 hits. All seven
  existing overlays (e.g. `apps/ui/components/GuideModal.tsx:32-45`) declare `aria-modal`
  without implementing modal semantics. S01 is building this machinery from scratch; ARCH
  should place it where S02 can consume the same helper.

## V acceptance (numbered browser steps · expected observation · mode)

Run at `https://localhost:3000` in a browser V opens. Steps 1-18 are run once in **Terracotta**
and once in **Chamber** unless a step names a mode. To clear storage: DevTools → Application →
Local storage → delete `debateai.consent`, then reload.

1. Clear `debateai.consent`, open `https://localhost:3000/`. → The bar appears anchored to the
   bottom, gold tab at its top-left, with the eyebrow `YOUR DATA, ON THE RECORD` and three
   buttons. No flash of the bar before the page paints.
2. Read the bar in the current mode. → Copy matches §Copy exactly; colours follow the mode.
3. Click `Accept all`. → The bar disappears. In DevTools,
   `debateai.consent` = `{"v":1,"essential":true,"quality":true,"analytics":true,"decidedAt":"…Z"}`.
4. Reload the page. → No bar.
5. Delete `debateai.consent`, reload. → The bar is back.
6. Click `Choose what to store`. → The bar is replaced by a centred card over a dim scrim,
   headed `Cookie preferences`. Essential is on and refuses to change; Model quality telemetry
   is ON; Product analytics is OFF.
7. Turn Product analytics ON, turn Model quality telemetry OFF, click `Save choices`. → Card
   and bar both close; stored value is `"quality":false,"analytics":true`.
8. Delete the key, reload, click `Choose what to store`, then `Essential only` in the card. →
   Stored value is `"quality":false,"analytics":false`. Repeat from the bar's own
   `Essential only`: the identical object is stored.
9. Signed in, open `https://localhost:3000/settings`. → A `Privacy` section with one button,
   `Cookie preferences`.
10. Click it. → The same card opens, pre-filled from the stored decision. Change one toggle,
    `Save choices`. → Stored value updates and `decidedAt` moves forward.
    **10b.** Signed out, open `/settings`. → Redirected to `/login`; no Privacy panel is
    reachable anonymously (R22).
11. Open the card from the bar and press `Esc`. → The card closes and the **bar returns**;
    storage is untouched. Open it from Settings and press `Esc`. → The card closes, nothing
    returns, storage is untouched.
12. With the key cleared, visit `/`, `/sign-up`, and `/settings`. → The bar is present on each.
13. With the key cleared, open a debate route and open the node detail drawer. → The drawer
    renders **above** the consent bar; the bar is not covering the drawer.
14. Narrow the window below 720px. → The three buttons move under the copy block; nothing
    overlaps and no horizontal scrollbar appears.
15. With the bar showing, press Tab repeatedly from the top of the page. → Focus reaches the
    three bar buttons in the order `Essential only`, `Choose what to store`, `Accept all`, each
    with a visible ring, and Tab continues past the bar — focus is not trapped.
16. With the bar showing, press `Esc`. → The bar stays; nothing is written.
17. Open the card, click `Privacy notice`. → The policy modal opens over the card in read-only
    form, with **no** `I have read it` button. Close it. → The card is unchanged, every toggle
    is as it was, and `debateai.consent` is unchanged.
18. With the card open, click the top-bar mode toggle. → The card restyles to the other mode
    live, stays open, and keeps its toggle states.

## Tests to update and why

| Test | Why this slice touches it |
|---|---|
| `tests/unit/t9-mode-tokens.test.ts` | **Must** be updated in the same change as the token additions: `:380-383` asserts exact set equality between the `:root` / chamber declarations and `Object.keys(TERRACOTTA ∪ MODE_INDEPENDENT)` / `Object.keys(CHAMBER)`. The ten new tokens of R24 go into the maps with byte-identical, comma-tight values. S01 is the sole writer of this file. |
| `tests/render/t3-library.test.tsx` | `:231-237` asserts `layout.tsx` matches `/<div className="appShell">\s*<TopBar \/>/`. It encodes the OLD single-mount shape. It must stay GREEN, not change — R07 mounts after `{children}` precisely so it does. Named here so no seat "fixes" it. Also `:244` asserts zero `[data-landing-section]` on the signed-in route: **the consent surface must not carry that attribute.** |
| `tests/render/t9-landing.test.tsx` | `:121-125` asserts the exact ordered list of `[data-landing-section]` elements. Same constraint: the consent surface carries no such attribute. It renders `<TopBar/>` + the page by hand and never mounts the root layout, so the new banner is invisible to it. |
| New: `tests/render/consent-*.test.tsx` | Every jsdom hook named in R01-R28. **Must clear `debateai.consent` in `beforeEach` and `afterEach`** — `vitest.config.ts:19` sets `fileParallelism: false`, so a leaked key persists into later files in the same worker, and `tests/render/auth-flow-integration.test.tsx` clears no storage of its own. Precedent for the hooks: `tests/render/t1-canvas.test.tsx:105-133`. |

**Baseline that is already red — inherit, do not claim.** The authority is
`docs/missions/consent-ui/BASELINE.md`, measured in both clean lanes; read it before
reporting any suite. `pnpm typecheck` is red by 8 diagnostics in `tests/unit/s14-ui.test.ts`
(another mission's pin); assert the delta, and run `pnpm run generate:contract` first.
**`tests/unit/t9-mode-tokens.test.ts` is itself red at base** — exit 1,
`Tests 2 failed | 6 passed (8)` — so the file this slice must edit cannot be reported as
green; its gate is the delta stated in S01-R24.
`tests/render/auth-flow-integration.test.tsx` is GREEN at base (exit 0, `Tests 17 passed (17)`)
and S01 does not touch it.
`tests/architecture/auth-front-door-parity.test.ts` is red at base: REQ-01 measured
`pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts` on 2026-09-06 →
exit 1, `Tests 2 failed (2)`, both ENOENT on `web/package.json` and `web/components/LoginFlow.tsx`
(`web/` holds one tracked file, `web/next.config.mjs`). S01 does not touch it and must not
claim it green.

## Out of scope

No analytics, telemetry or tag-manager integration of any kind (R23) · no server-side consent
record and no change to any request (`packages/contract/src/client.ts:215-220` is untouched) ·
no cookie deletion or blocking behaviour · no consent versioning UI beyond the `v` field · no
change to the sign-up card, the privacy-policy modal's internals, or `SignUpFlow.tsx` (S02
owns those) · no renaming of the product's real cookies · no change to `apps/api/**`,
`packages/**`, `migrations/**`, or any auth flow.

## Parallel-safety (file surface; single-writer rule)

**S01 owns and is the only writer of:**
`apps/ui/components/consent/CookieConsent.tsx`, `.../CookiePreferencesCard.tsx` and any other
new file under `apps/ui/components/consent/` except `PrivacyPolicyModal.tsx` ·
`apps/ui/lib/consent.ts` · the ONE delimited block `/* === consent-ui S01 === */ … /* === end
consent-ui S01 === */` appended at the end of `apps/ui/app/globals.css` · **both token blocks
in `globals.css`** (`:root` 5-97 and `html[data-mode="chamber"]` 99-158) · **`tests/unit/t9-mode-tokens.test.ts`**
· ONE mount line in `apps/ui/app/layout.tsx`, placed after `{children}` · ONE panel in
`apps/ui/app/settings/page.tsx` · its own new tests under `tests/render/`.

**S01 reads but never edits:** `apps/ui/components/consent/PrivacyPolicyModal.tsx` (S02 owns
it; S01 consumes the R20 interface) · `apps/ui/components/SignUpFlow.tsx` ·
`apps/ui/lib/privacyPolicy.ts`.

**The only file both slices write is `apps/ui/app/globals.css`, in two separate delimited
blocks appended at the end** — S01's block, then S02's `/* === consent-ui S02 === */`. The
token blocks are S01's alone, so token additions never conflict. S01's lane must land its
token block before S02's CSS can be verified; ARCH owns that sequencing.

## Traceability (R-id → PLAN steps: filled by ARCH)

See `PLAN.md` §SPEC trace. Every `S01-Rnn` above has a row there; the step column is empty
until the architecture seat fills it.
