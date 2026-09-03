# ADR-002 — Mode switching: `html[data-mode]`, `localStorage`, blocking head script

**Status:** ACCEPTED (ARCH-01, 2026-08-31) · mission-local
**Slices affected:** all eight (T1 R7 · T3 R8 · T4 R6 · T5 R8 · T6 R6 · T7 R1 · T8 R7 · T9 R3)

## Decision

### The marker

`document.documentElement` carries `data-mode`, whose only two values are
`terracotta` and `chamber`. **Absence of the attribute means Terracotta**,
because `:root` declares the Terracotta values unconditionally and the Chamber
block is a strictly additive override. Server-rendered HTML therefore ships with
no attribute and is already correct for the default mode; there is no
"unstyled" state.

```css
:root { --bg:#F9F6F1; … }                     /* Terracotta */
html[data-mode="chamber"] { --bg:#14110E; … } /* Chamber     */
```

`html[data-mode="terracotta"]` is not a selector; it exists only as an explicit
attribute value so that a user who has chosen light is not re-flipped by any
future `prefers-color-scheme` rule.

### Persistence

`localStorage`, key `debateai.mode`, values `terracotta` | `chamber`.

T9's `DECISIONS.md` (2026-08-31, Requirements) recorded: *"Persist
Terracotta/Chamber for the browser session when cheap; not a design-mandated
floor. Beyond-session = ARCH."* ARCH rules **beyond-session**, for a mechanical
reason rather than a preference: the no-flash script below must read the stored
value **synchronously, before first paint**, and `localStorage` is the only
synchronous durable store available in that position. `sessionStorage` would
satisfy the recorded floor at identical cost and identical code, so choosing the
durable one costs nothing and is strictly better for a returning reader. No
cookie is introduced — a cookie would put mode into the request and into the
server render, which is a larger change than this mission's bounds.

### SSR-flash avoidance

One inline script in `<head>`, rendered by `apps/ui/app/layout.tsx` via
`<script dangerouslySetInnerHTML>` placed BEFORE `{children}`, so it executes
before the first paint:

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      __html:
        "try{var m=localStorage.getItem('debateai.mode');" +
        "if(m==='chamber'||m==='terracotta')document.documentElement.dataset.mode=m;}catch(e){}"
    }}
  />
</head>
```

The `try/catch` is required, not defensive padding: `localStorage` throws on
access in Safari private mode and under a blocked-storage policy, and an
uncaught throw here runs before React and blanks the document.

`apps/ui/app/layout.tsx` **already** carries `suppressHydrationWarning` on both
`<html>` and `<body>`, which is exactly the attribute this pattern needs and is
already present — no change to those props.

### The control

`apps/ui/components/ModeToggle.tsx` — NEW, client component.

```tsx
"use client";
import type { JSX } from "react";

export type Mode = "terracotta" | "chamber";
export function ModeToggle(): JSX.Element;
```

**The `import type { JSX } from "react"` line is part of the contract, not
boilerplate.** React 19 removed the GLOBAL `JSX` namespace; it lives at
`React.JSX` and is re-exported from `react`. Installed here: `@types/react`
**19.2.18**. Without that import, `JSX.Element` is `error TS2503: Cannot find
namespace 'JSX'` — see the changelog below, where this ADR's own earlier text
caused exactly that failure.

- Renders a single `<button type="button" className="modeToggle"
  data-mode-toggle aria-pressed={mode === "chamber"}>` whose label is
  `☾ Chamber` when Terracotta is active and `☀ Terracotta` when Chamber is
  active, with `aria-label="Switch to Chamber mode"` / `"Switch to Terracotta
  mode"` so the accessible name never depends on a glyph.
- Reads its initial state from `document.documentElement.dataset.mode` in a
  `useEffect`, never from `localStorage` directly — the head script is the
  single reader of storage, so the two can never disagree.
- On click: flips `document.documentElement.dataset.mode`, writes
  `localStorage.setItem("debateai.mode", next)` inside `try/catch`, and sets
  local state.

### Where it mounts — the complete enumeration

**AMENDED 2026-08-31 (AM5): the number is THREE, not two — correct conclusion.**
**RE-AMENDED 2026-09-01 (AM6/N1): the REASON given for it was false.**

AM5 wrote that anonymous `/` *"renders `LandingPage`, which does **not** render
`TopBar`."* That is wrong. `apps/ui/app/layout.tsx:44` renders `<TopBar />`
inside `.appShell` on **every** route, above `{children}`, and `TopBar` returns
`null` for `/debate/*` and `/public/debate/*` only (`TopBar.tsx:57`). The route
split changes what `{children}` is; it does not remove the bar above it.

The count of three survives — but only because of the **suppression rule below**,
which this amendment introduces. Until that rule lands, the anonymous landing
carries two headers and, after T3-C1, two mode controls. Found by the T9-C1
blind review (`t_4487f9b1`, N1 + the B1 root cause), which was invited by the
line beneath this table and answered the mirror case: not a missing mount, but a
listed mount whose *covers* column was wrong.

A seat that finds a **fourth** has found a route the map missed and must say so.

| Mount | File | Covers |
|---|---|---|
| Anonymous landing | `apps/ui/components/landing/LandingChrome.tsx` — created and mounted by **T9-C1** (dispatch row 2), whose chrome copy is T9-C2's | `/` **logged out only** (T9 R3) |
| Global chrome | `apps/ui/components/TopBar.tsx` — in `topBarActions`, and in the `authTopBar` branch | `/` **signed in only** (T3) — true only once T3-C1 lands the suppression rule below; `TopBar` renders on anonymous `/` at HEAD · `/new` (T4), `/settings` (T6), `/admin/workers` (T7 fleet), `/login` `/sign-up` `/verify-email` `/enroll-mfa` (T7, T8) |
| Debate chrome | `apps/ui/app/debate/[id]/DebatePageClient.tsx` — inside `<div className="debateTopControlRow">`, as a **sibling of** the `{hasTree ? …}` conditional, never inside it | `/debate/[id]` (T1, T5 drawer) and `/public/debate/[id]` (T3 3b, T5 public) |

The "sibling of, never inside" is load-bearing: the `segment` view group is
rendered only `{hasTree ? … : null}`, so a toggle placed inside it disappears
whenever `tree` is null.

> **RATIONALE CORRECTED 2026-09-01 (AM12b/item 10, from `t_7fd7c80c`).** This
> paragraph used to justify the placement with *"a debate whose tree has not
> been built yet — and T1's own acceptance opens a debate that may still be
> generating."* **That case is unreachable.** Every owner producer emits a
> skeleton tree, and the truly-pending owner path early-returns a chromeless
> loading screen before this chrome renders at all. Measured: the only product
> site that produces `tree: null` is
> `apps/ui/app/public/debate/[id]/PublicDebatePageClient.tsx:46` —
> `tree_included === true ? detail : { ...detail, tree: null }`, i.e. **a
> published debate whose snapshot omits the tree.**
>
> **The placement is unchanged and still correct** — the reviewer's M2 mutant
> fires — but for the public-debate reason, not the mid-generation one. So the
> real requirement is sharper than the old wording: on `/public/debate/[id]`
> with a tree-less snapshot, the reader must still be able to switch modes.
> T5's public-drawer and T3's 3b work both land on that surface, and both
> inherit this constraint.
>
> **Third recurrence of right-decision-wrong-reason**, a pattern this ADR's own
> AM6 changelog named. The decision survived every time; the stated reason did
> not, and a reason nobody can reach is a reason nobody can check. The standing
> correction is the one AM6 produced and I keep re-learning: **a claim about
> runtime behaviour must be read out of the file that produces it**, and for
> "case X can happen" that means naming the site that produces X. Anchor on the class name
`debateTopControlRow`, not on a line number; the file is 1958 lines and every
cluster in T1/T3/T5 edits it.

`TopBar` returns `null` for `/debate/*` and `/public/debate/*`
(`TopBar.tsx:57`), which is why the debate chrome needs its own mount. The
anonymous landing needs its own for a different reason, stated correctly this
time: `TopBar` **does** render there, and must be suppressed.

> **CORRECTED 2026-09-01 (AM7/charge 2, from blocking finding B1 on
> `t_9d3f1f2d`).** This paragraph used to end: *"Three is the exact number, and
> each of the three is pinned by a different cluster's acceptance — `T9-C1-3`
> (landing), `T3-C1-3` (signed-in library), and T1's debate-chrome row."*
> **False, because the table has three MOUNTS but four CODE SITES.** The
> Global-chrome row is two of them — `topBarActions` **and** the `authTopBar`
> branch — and only `topBarActions` was pinned. The reviewer deleted the
> `authTopBar` mount alone and the canonical row-3 command returned
> `12 files passed / 92 tests passed`: not caught. SPEC T8 R7 (*"Mode toggle on
> auth shell"*) could therefore be unsatisfied and invisible. Counted over the
> Writes column of all 32 rows, **T3-C1 is the only cluster that writes
> `TopBar.tsx`**, so no later cluster could have closed it — `T7-C1-2` (row 25)
> and `T8-C4-1` (row 32) assert the control but own neither the file nor the
> fix. Same class as the `T9-C1-3` defect a round was already paid for: I wrote
> a mount enumeration and then claimed pin coverage over it without counting the
> code sites the enumeration collapses.

**Pin coverage, corrected and counted — three mounts, four code sites:**

| # | Mount | Code site | Pinned by |
|---|---|---|---|
| 1 | Anonymous landing | `LandingChrome.tsx` | `T9-C1-3`, scoped to `[data-landing-section="chrome"]` |
| 2 | Global chrome | `TopBar.tsx` → `topBarActions` | `T3-C1-3` |
| 3 | Global chrome | `TopBar.tsx` → `authTopBar` branch | **`T3-C1-5`** — added by the AM7 rework: `setPathname("/login")`, render `<TopBar />`, assert `.authTopBar [data-mode-toggle]` is non-null with accessible name matching `/Switch to (Chamber\|Terracotta) mode/` and carrying no `aria-disabled` (exemption #3's constraint) |
| 4 | Debate chrome | `DebatePageClient.tsx` → `debateTopControlRow` | T1's debate-chrome row |

Both `TopBar` code sites are pinned by **T3-C1**, not by different clusters —
they have to be, because T3-C1 is that file's only writer in the whole order.

### The `/` chrome adjudication (AM6/N1) — one route, two specified chromes

`/` is the only path in the product that serves two entirely different
**specified** chromes:

| | Specified chrome | Wordmark | Actions |
|---|---|---|---|
| anonymous `/` | SPEC T9 **T9-S1** | `DebateAI` | `Method` · `Transcripts` · `Pricing` · `Start a debate` · ☾ |
| signed-in `/` | SPEC T3 **T3-S1** | `Dialectical Engine` / `dezbatere.ro` | `Library` · `+ New debate` · asker chip · ☾ · settings |

Today both would render, stacked. That is not "one extra toggle"; it is a second
header with a **different product name** on the screen whose SPEC names the
first one, plus `+ New debate` and `⚙ Settings` — affordances a logged-out
visitor cannot use, competing with T9 R5's `Start a debate` return-path CTA,
which is the one thing that screen is supposed to make people click.

**DECISION: on anonymous `/`, `TopBar` does not render. The landing's own chrome
is the only chrome, and `LandingChrome`'s ☾ is the only mode control.**

Three grounds, in the order they bind:

1. **Design.** The TURN 9 artboard (`design-document-text.txt`, "9e Original —
   Terracotta · Chamber, *the pre-decision Editorial Luxury landing, full page*")
   opens with `DebateAI / Method / Transcripts / Pricing / Start a round →`.
   There is no application bar above it. The artboard is the full page.
2. **SPEC T9 States 1**, verbatim: *"Anonymous `/`: landing (T9-S1…S6) **is the
   document**."* A second chrome the landing does not own is not part of that
   document.
3. **T3-S1 is not dropped, it is scoped.** The signed-in library keeps `TopBar`
   exactly as it is — `SCREEN_TITLES["/"] = "Library"` already produces T3-S1's
   title, and `BrandMark` already produces its wordmark and domain. T3-C1's
   contracted ☾-in-`topBarActions` mount stands unchanged.

The two rejected alternatives, and why:

- **Suppress the landing's toggle instead.** Refused: T9-S1 names the toggle as
  part of the landing chrome and T9 R3 requires it *on the landing*, so this
  deletes a SPEC requirement to preserve an unspecified bar. It also leaves both
  headers on screen, fixing the symptom the review reported and not the defect
  it found.
- **Accept both.** Refused on ground 1: two wordmarks, one of which is the wrong
  product name for that screen.

### How the suppression is implemented — and the cost, stated

`TopBar` is a client component; the session cookie is `__Host-`-prefixed and
HttpOnly, so **`TopBar` cannot know whether the visitor is signed in**, and
`layout.tsx` (a server component, which can read the cookie) cannot know the
pathname. Neither mount point has both halves of the predicate. The one place
that has both is the CSS, because the server has already decided which document
it rendered:

```css
/* `/` serves two different specified chromes (ADR-002 §"The `/` chrome
   adjudication"). When the landing is the document, the layout's global bar
   must not render above it. */
.appShell:has([data-landing-section]) > .topBar { display: none; }
```

- No session logic in any component, no new cookie, and no flash: the rule
  applies at first paint, so the bar is never painted and then removed.
- `display: none` removes the bar from the accessibility tree and the tab order,
  not just from view — suppression, not concealment.
- It keys on `[data-landing-section]`, the harness convention published in
  `dispatch-order.md` §"Landing query convention (AM6)". **That attribute is
  therefore load-bearing product markup, not test scaffolding**, and a seat that
  drops it silently restores the duplicate header.

**Owner: T3-C1 (dispatch row 3)**, whose write surface gains
`apps/ui/app/globals.css` for this one rule with the token blocks forbidden as
for every non-T9-C3 cluster. T3-C1 is the cluster that makes the defect visible
(it adds the second toggle) and the first cluster after HEAD that can legally
take a CSS write; T9-C1's rework is scoped and adding to it mid-flight is the
skew the orchestrator sequenced this amendment to avoid.

**The honest cost, twice over.** First: between HEAD (`3aefb2d`) and row 3 the
anonymous landing ships with a duplicate header. That window is two clusters
wide, it is a visual defect and not a correctness or security one, and it is
named here rather than discovered, and **it is now closed** — T3-C1 landed at
`af50e34`.

Second: `display: none` leaves `TopBar`'s markup in the anonymous HTML.
**MEASURED 2026-09-01 (AM7/charge 4, from N6) on the real anonymous document at
`af50e34`, replacing this ADR's earlier estimate of "three dead `<Link>`s":**

| Suppressed but present in the anonymous HTML | Source |
|---|---|
| **4** dead links — `/` (BrandMark's home link, `TopBar.tsx:18`), `/login`, `/new`, `/settings` | the `topBar` branch |
| a **second** `[data-mode-toggle]` — the first is `LandingChrome`'s | T3-C1's `topBarActions` mount |
| the `ASKER` chip text | `TopBar.tsx:89` |

The estimate was wrong in the direction that flatters the decision — it
undercounted the links by one and omitted both the duplicate toggle and the chip
— so it is replaced by the count rather than nudged. **All of it sits inside
`display: none`**, which removes it from the accessibility tree and the tab
order: no duplicate control is reachable, nothing is announced, nothing is
tabbable, so there is no live defect. That is precisely why AM6 specified
suppression and not `visibility: hidden`, and the reviewer's M7 mutant confirms
the distinction is genuinely protected (`display:none` → `visibility:hidden`
goes RED). The structurally clean fix is for the layout to stop mounting
chrome the route owns, which means moving `<TopBar />` into each route and
re-laying-out `.topBar` (it is `flex: 0 0 60px` as a direct child of
`.appShell`, so it cannot simply move inside `{children}`). That touches every
route and `globals.css`'s layout rules; it is a refactor, not a cluster, and it
is **routed as an open question rather than absorbed**.

### Two absence-clause pins constrain HOW the mount is written (AM5)

The persistence mechanism is `localStorage`, and two standing tests forbid that
identifier in files this ADR tells clusters to edit. Both are quoted with their
constraints in `dispatch-order.md` §"Two negative-clause traps"; the rule for
this ADR is one sentence:

> **Every mount is `<ModeToggle />` and nothing else.** All storage access lives
> inside `apps/ui/components/ModeToggle.tsx`. No mount site may read or write
> `localStorage` inline.

`tests/unit/pol01-policy.test.ts:92` asserts
`not.toMatch(/…|localStorage/)` over `DebatePageClient.tsx` — this ADR's debate
chrome mount. `tests/architecture/auth-front-door-parity.test.ts:80` asserts the
same over `LoginFlow.tsx` and `SignUpFlow.tsx`, which is why the auth screens
take their toggle from the `TopBar` row above and never grow one of their own.
Neither test may be edited to accommodate a mount: they are the security
properties the mount must not break.

The drawer (T5) does not mount its own toggle: `NodeDetailDrawer` renders
inside the debate document, so the debate-chrome toggle already switches it.
T5 R8 is satisfied by the drawer's tokens responding, which is what its
acceptance measures.

## Why not `class="dark"` or `prefers-color-scheme`

- A class collides with the 4080-line stylesheet's existing class namespace and
  cannot be asserted with `getPropertyValue` on the root without also asserting
  class membership; `data-mode` is a single attribute with two legal values and
  reads back cleanly in jsdom (`ADR-006`).
- `prefers-color-scheme` alone cannot satisfy R3 on any slice: the SPECs require
  a *control that switches*, and V's acceptance step is "click the mode toggle".
  A media query is not a control. It is deliberately NOT added as a default
  either — doing so would make the SSR default depend on the reader's OS and
  break the "absence means Terracotta" invariant that removes the flash.

## Refutation

The acceptance that catches a broken mode switch: read
`getComputedStyle(document.documentElement).getPropertyValue('--bg')`, set
`data-mode="chamber"`, read again, assert the two differ AND that each equals
its inventory value. It **catches**: a Chamber block that was never written; a
Chamber block written under the wrong selector; a token declared in one block
and not the other. It does **not** catch: a component that hard-codes a colour
and therefore ignores both blocks — that is the separate concern of ADR-001's
colour-literal sweep (three scoped oracles since AM1), and the two acceptances
must both exist because neither implies the other.

---

## Changelog

### 2026-08-31 — AM2/A: the published contract did not compile (trigger: `t_4ccac5c4`, blind review of Wave 0, verdict 20:57)

**What was wrong.** This ADR published the contract line

```
export function ModeToggle(): JSX.Element;
```

with no `JSX` import. The Wave-0 worker implemented it faithfully, character for
character. The result does not compile:

```
$ pnpm exec tsc --noEmit -p apps/ui/tsconfig.json
apps/ui/components/ModeToggle.tsx(7,31): error TS2503: Cannot find namespace 'JSX'.
```

`@types/react` 19.2.18 is installed, and **React 19 removed the global `JSX`
namespace** (it moved under `React.JSX`). `apps/ui/next.config.mjs` sets
`typescript.ignoreBuildErrors: false`, so `next build` is red on the same line.
The finding is filed against BOTH the code and this ADR; **the ADR is the source
of the wrong type** and the worker is not at fault.

**Why no gate caught it** — see `ADR-006` §"Compile-gate law". The root
`tsconfig.json` excludes `apps/ui`, so the mission's `pnpm run typecheck` never
opened the file.

**The fix, and why this form over the alternatives.** All three candidates were
compiled against the installed 19.2.18 types before this ADR was amended, in an
isolated probe that was first shown to FAIL on the broken form (`TS2503`) so a
green result would mean something:

| Form | Compiles on 19.2.18 | Chosen? |
|---|---|---|
| `import type { JSX } from "react"` + `(): JSX.Element` | yes | **YES** |
| `import * as React` + `(): React.JSX.Element` | yes | no — adds a namespace import to a component that needs no other React namespace member |
| no return annotation, `export function ModeToggle() {` | yes | no — infers correctly, but this ADR publishes a *contract* that other clusters quote; an inferred type is not quotable |

The chosen form is also the one that survives a downgrade: `@types/react`
18.3+ exports the same `JSX` namespace from `react`, so the line is correct on
both major versions, whereas the bare global was only ever correct on 18.

**Standing rule this produces.** Any type expression this or any other ADR
publishes as a contract MUST have been compiled under the workspace tsconfig
before publication. A contract that does not compile is not a contract; it is a
defect with authority, and it propagates to every seat that obeys it.

### 2026-08-31 — AM5/A: the mount enumeration still described the pre-split landing (trigger: T9-C1 codex seat, secondary finding on `t_4487f9b1`, 23:07)

**What was wrong.** The table said *"Exactly two mount points"* and listed
anonymous `/` under the `TopBar` row. `ADR-003` splits `/` so that the logged-out
document renders `LandingPage`, and `LandingPage` does not render `TopBar`. The
row therefore claimed coverage of a surface it could not reach — and SPEC T9 R3
names that exact surface. AM2/D had already added the `LandingChrome` mount and
pinned it (`T9-C1-3`); this table was the stale half of the same fix, and
`slices/T9/DECISIONS.md` was written from it.

**Fixed:** three rows, each with a cluster that pins it. The count sentence now
says three, and the two-is-exact argument is replaced with the reason each of
the three exists.

**Second half of the same amendment.** The sweep in `dispatch-order.md` §AM5
found that this ADR's `localStorage` persistence collides with two standing
absence-clause pins covering `DebatePageClient.tsx`, `LoginFlow.tsx` and
`SignUpFlow.tsx` — files this ADR sends clusters into. The constraint is stated
above rather than left to be discovered by whichever seat goes red first. Note
what this was NOT fixed by: no reordering of clusters helps, because the break
is caused by *adding* code, not by *changing* copy, and every order contains the
addition.


### 2026-09-01 — AM6/N1: the "does not render TopBar" premise was false, and it hid a product defect (trigger: T9-C1 blind review, `t_4487f9b1` verdict 00:26, finding N1 and the B1 root cause)

**What was wrong.** AM5's amendment note and `slices/T9/DECISIONS.md:45` both
asserted that logged-out `/` *"does not render `TopBar`"*. `layout.tsx:44`
renders it on every route; `TopBar` nulls only for `/debate/*` and
`/public/debate/*`. I corrected this table's *conclusion* in AM5 (three mounts,
not two) using a *reason* I had not checked, and the reason is the thing later
work leans on.

**What the false premise cost.** It is the root cause of the review's blocking
finding B1: `T9-C1-3`'s pin queried the whole anonymous document for
`[data-mode-toggle]`, which is sound only if nothing else on that document
mounts one. From dispatch row 3 onward `TopBar` does. The reviewer proved it by
simulating T3-C1's contracted mount and deleting T9-C1's own — `5 passed (5)`,
all green, with the SPEC T9 R3 control absent from the surface R3 names. The pin
AM2/D added *specifically* to stop that outcome had stopped discriminating.

**The transferable lesson, and it is not "check your facts".** AM2/A produced the
rule *a type expression must be compiled before it is published*. The same rule
generalises and I had not generalised it: **a claim about runtime composition
must be read out of the composing file before it is published.** One `sed -n` on
`layout.tsx` would have settled it. I asserted it from the shape of the route
split instead, and three documents inherited it.

**Fixed here:** the premise, the mount table's `Covers` column, the `/` chrome
adjudication and its suppression rule, with the implementation cost stated
rather than smoothed over.
### 2026-09-01 — AM7: a pin-coverage claim that counted mounts instead of code sites (trigger: T3-C1 blind review, `t_9d3f1f2d` verdict 02:04, B1 and N6)

**What was wrong (charge 2).** This ADR's mount table has three rows and I wrote
that *"each of the three is pinned by a different cluster's acceptance"*. The
Global-chrome row is **two code sites**, `topBarActions` and the `authTopBar`
branch, and only the first was pinned. Deleting the `authTopBar` mount alone
left the canonical row-3 command at `12 files / 92 tests` green, with SPEC T8 R7
unsatisfied and nothing anywhere to say so.

**Why it mattered more than the count suggests.** `T3-C1` is the only row of 32
that writes `TopBar.tsx`. A gap here is not "close it later" — it is "close it by
a seat with no write access to the subject". Corrected above into a
four-row, code-site-level table, with `T3-C1-5` published in `dispatch-order.md`
so the rework packet has a cell to quote.

**What was wrong (charge 4).** §"the honest cost" estimated *"three dead
`<Link>`s"*. Measured on the real anonymous document: **four** links (I forgot
`BrandMark`'s own `/`), plus a second `[data-mode-toggle]`, plus the `ASKER`
chip. Every item is inside `display: none` and therefore out of the a11y tree
and tab order, so the conclusion is unchanged — but the estimate erred toward
making my own decision look cheaper than it is, which is the direction an
estimate must never err in. Replaced with the count.

**The pattern across AM5 → AM7, since this is now three.** AM5: asserted a
rendering fact without reading `layout.tsx`. AM6: published a compile gate
without running it as published. AM7: published pin coverage without counting
the code sites, and a cost without counting the affordances. All three are one
act — **stating a number or a fact in the voice of a measurement without taking
the measurement** — and all three were caught downstream. The ADR-006 rule now
reads for facts and counts as well as commands: if it is published as measured,
it must have been measured, and the measurement pasted.
