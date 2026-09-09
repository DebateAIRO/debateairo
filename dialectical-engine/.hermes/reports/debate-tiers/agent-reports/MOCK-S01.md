# Self-report — seat MOCK-S01, node `MOCK(S01)` pass 1, mission `debate-tiers`, 2026-09-09

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Session `9b3e06e9-75fb-4fd0-8561-04ca8aec6886`. Main tree `e6b24748`, dirty 97 (untouched). Lane
`.worktrees/tiers-s01` at `7f89f7b7`, `git status --porcelain` = 0 before and after. One artifact
published, one MOCK.md written, no product file touched, no git write, no terminal opened.

---

## 1. The single biggest saving, and it generalises: generate the artboards, never paste them

Fourteen artboards were emitted by a 300-line script (`build.mjs`) from one parameterised markup
builder. The 14 `.dc.html` files total **196 KB**; none of those bytes ever entered this transcript.
Hand-authoring them — the obvious reading of "author the design as `.dc.html`" — would have put
roughly 196 KB of inline-styled HTML through the context window twice (once written, once re-read on
every correction), and every correction would have had to be applied fourteen times by hand.

**Upgrade:** make it a line in `heartbeat-mock` §3 — *the artboards are emitted by a script the seat
writes; the seat's transcript carries the script, never the markup.* It is the difference between a
mock seat costing ~10 KB of authored text and ~200 KB, and it is the reason a 14-artboard canvas fit
in one pass with no rework.

The corollary that made it work: **one builder, per-state parameters.** The six screens differ by
nine booleans and values (`tier`, `locked`, `risk`, `budget`, `depth`, `presets`, `annotations`,
`optionsOpen`, `question`). Both modes are the same builder with a different token table. Changing
the frame height of two artboards was a `sed` and a re-run, not fourteen edits.

## 2. What repeatedly cost time: the harness's browser pane and `file://`

This was the largest wall-clock sink of the run, ~6 wasted tool calls, and it will recur for every
seat that ever looks at generated HTML. Measured behaviours, all in this session:

- `navigate` to a `file://` path renders it as a *static snapshot* on a `data:` URL. On the first two
  such tabs `javascript_tool` worked; on a later `file://` tab it refused with *"This tab shows a
  local file, not a web page; page tools can't act on it here."* — and `computer{screenshot}` refused
  with the same message. The difference between the two cases is not visible from the tool result.
- A tab pinned to a local file **cannot** `navigate` to an `http://` URL. You must `tabs_create`.
- Screenshotting a long page after scrolling returns a **uniformly grey image** below roughly the
  first viewport, even though `getBoundingClientRect` says the content is on screen. `scrollIntoView`
  then screenshot is useless. Only a page whose content starts at scroll 0 photographs.

**The working recipe, and it should be a `TOOLING-TRAPS.md` entry verbatim:** serve the directory
over `127.0.0.1` with a backgrounded `python3 -m http.server <port> --bind 127.0.0.1`, `tabs_create`,
then `navigate` to `http://127.0.0.1:<port>/<one-artboard-per-page>.html`. One artboard per HTML file,
scaled with `transform: scale()` to fit 780×700, screenshot at scroll 0. Both `javascript_tool` and
`computer{screenshot}` then behave. Price of not knowing this: about eight minutes and six calls.

## 3. The probe: two runs instead of one, and the cause is a shared stub

`renderToStaticMarkup(<NewDebatePage />)` returned **the empty string** on the first run. Not an
exception — an empty string, which reads as "the page renders nothing" and sends you looking at
`Suspense` and `AuthGate`. The actual cause: `tests/render/stubs/next-navigation.ts` (the repo's
alias target for `next/navigation`, `vitest.config.ts:6`) exports only `usePathname`, `notFound`,
`setPathname` and the call counters. It has **no `useRouter` and no `useSearchParams`**, both of which
`apps/ui/app/new/page.tsx:65-67` calls on its first line of state.

**Upgrade (cheap, repo-wide):** add `useRouter` and `useSearchParams` to that stub. Every render suite
in this repo that touches a client page re-mocks them locally today; one shared fix removes that
from every future seat's first run.

**Upgrade (bigger, and it is the real one):** the three mocks needed to render any signed-in page of
this app to static markup are always the same — `@/components/AuthGate` (call `children(marker)`),
`next/navigation`, `@/lib/api`. That is a 30-line fixture. Shipping it at `tests/render/stubs/` and
naming it in the mock packet template turns "see the real form" from two vitest runs plus a debug
round trip into one import.

## 4. What I nearly got wrong

**I nearly invented a locked-control treatment.** The plan's "what the app lacks" list says
`globals.css` styles `:disabled` for exactly one selector (`PLAN.md:619-620`), which reads as
*there is no convention, design one*. I was one step from drawing a padlock glyph and a strikethrough.
Charge 6 of the packet forced `grep -n ':disabled' apps/ui/app/globals.css` first: **22 lines**, a
clear family at `.45`/`.5`/`.55`/`.65` plus `cursor: not-allowed`, and `.ndStart:disabled`
(`globals.css:6193`) sitting inside the `nd*` vocabulary itself at exactly `.45`. The convention
existed; only its application to `.ndSegItem` / `.ndSlider` / `.ndSteerInput` / `.ndSelect` was
missing. That one grep turned a `NEW` provenance row into a reuse.

**The general lesson, and it is the expensive one:** a plan sentence that says *the app lacks X* is a
claim, and the mock seat must re-measure it before drawing. The plan's sentence was true about
`.ndStart` and false about the class. ARCH-REV caught it as N9 and the packet carried the correction;
without that fold this seat would have shipped an invented token.

**I also nearly mis-scoped the deliverable** — see §6.

## 5. The finding drawing produced that reading could not

SPEC R4 requires the `disabled` attribute on `#depthMode` and `#scrutinyDepth`. Those are the
`<select>` elements inside `.ndSelect`, and `.ndSelect select` is `position: absolute; inset: 0;
opacity: 0` (`globals.css:6152-6166`) — a transparent control lying over a drawn box. **Disabling it
changes nothing anyone can see.** R4 as frozen is satisfiable and still leaves acceptance step 6
("the dropdowns will not open") looking identical to a live control. The locked rule has to reach the
outer `.ndSelect`.

Nobody found this by reading R4, the plan or the review — I found it by having to decide what colour
to paint the box. **That is the argument for the `MOCK → DONE` gate existing at all**, and it is worth
saying in the spine: the mock is not decoration ahead of the build, it is a cheap execution of the
spec against pixels, and it catches the requirements that are true and useless.

## 6. Where THIS packet was unclear, exactly

1. **§3 charge 2: "renders `NewDebateForm` to static markup."** `NewDebateForm` is not exported
   (`apps/ui/app/new/page.tsx:64` — module-local; only the default `NewDebatePage` is exported).
   The packet names an unreachable symbol. Cost: one failed run and one detour into `AuthGate`.
   Fix: name the default export and the AuthGate mock.
2. **Charge 3 versus §5 and the Screens block — the scope contradiction.** Charge 3 lists
   *"(a) Free selected … (b) Premium selected … (c) the no-selection reading … plus a close-up"* —
   three screens. §5 and `PLAN.md ## Screens` name **six**, and `heartbeat-mock` §3 requires one
   artboard per screen and state in both modes. I read the six-screen list as binding, which is
   twelve artboards plus two close-ups. If charge 3 was the real scope, this seat drew more than
   twice what was asked. **One clause fixes it forever:** *"charge 3 names the states with special
   values; the artboard SET is the six of `## Screens`, both modes."*
3. **Charge 3's naming rule versus the canvas helper.** "Name them `S01-new-<state>-<mode>`" cannot
   cover the close-up (it has no state), and the `design` helper requires an entry artboard file
   named `Main.dc.html`. Both are satisfiable — canvas.json carries a cosmetic `title` per artboard —
   but nothing in the packet says the file stem and the displayed name may differ, so a seat that
   takes the naming rule literally will fight the helper.
4. **Nothing anywhere says static-mock or clickable-prototype.** The `design` skill forces the choice
   and requires asking, and COMMON forbids asking. The skill's own fallback ("build static mockups,
   name the choice at handover") resolved it, but the packet should carry the answer: for a `DONE.md`
   oracle, static is right, because `DONE.md` is measured against pixels and states, not behaviour.

## 7. Dead ends, named so nobody re-derives them

- An **unmocked `AuthGate`** renders `Checking session…` and nothing else under
  `renderToStaticMarkup`: `checking` starts `true` (`apps/ui/components/AuthGate.tsx:11`) and server
  rendering never runs the effect that clears it.
- **You cannot get the OPTIONS-expanded state out of the probe.** `optionsOpen` starts `false`
  (`page.tsx:68`) and a static render has no way to set it. Do not build a hook-mocking harness for
  it: the design of record already carries the expanded panel with every value resolved, at
  `docs/missions/ui-overhaul/design/design-document-rendered.html:1023-1099`.
- A **vitest config living outside the repo** works, but emits two warnings every run —
  `Could not resolve 'vitest/config'` and *"ESM syntax in a file loaded as CommonJS"*. Both are
  cosmetic; the run is correct. Do not chase them, and do not move the config into the repo to
  silence them.
- Building the helper's `--artboard` list with an unquoted shell variable inside a
  `cd … && VAR="" && for …` one-liner **silently produces an empty argument list** (the helper then
  reports "need --template, --out, --title and at least one --artboard"). Put the loop in a script
  file and use a real zsh array.
- `computer{action:"zoom"}` reports *"region crop not yet supported in the Browser pane"* and returns
  the full screenshot. Scale the artboard in the page instead.

## 8. How to make this more of a one-prompt machine, in cost order

**a. Ship the render fixture (§3).** Highest return per line of work in this report. Three mocks,
30 lines, once. It converts "see the page you are designing" from a research task into an import,
for every UI seat this repo will ever run.

**b. Put the browser-pane recipe in `TOOLING-TRAPS.md` (§2).** Largest wall-clock sink here, zero
knowledge required to avoid it, and it recurs for every seat that renders anything.

**c. Hand the mock seat a pre-resolved token table.** I re-resolved ~20 tokens × 2 modes by hand out
of `globals.css:5-178` to write literal values into artboards. The orchestrator can emit that table
once per mission with a 30-line script and paste it into the packet. Every UI seat after that reads a
table instead of a stylesheet, and no seat can mis-transcribe a hex.

**d. Measure the render, do not compute it.** `.ndRow { padding: 17px 0 }` does not tell you the row
is **70.5px** tall, that the Tree depth row is **85px** because its hint wraps at a 200px column, or
that the gauge card is **454px**. One `getBoundingClientRect` sweep over the real render replaced a
dozen arithmetic guesses and is the reason every artboard frame came out with 6-8% slack and zero
clipping on the first try. Fold the sweep into the fixture in (a) so it is one call.

**e. Make "generate, never paste" law for mock seats (§1).**

**f. State the artboard set arithmetically in the packet.** "screens × modes + close-ups = N
artboards" as a number the seat can check itself. Charge 3's prose could be read two ways (§6.2); a
number cannot.

**g. One more for the spine:** the mock seat should be told, in one line, that a plan's *"the app
lacks X"* sentence is a claim to re-measure, not a licence to invent (§4). That single habit is what
kept the `NEW` row count at 9 instead of 12 on this canvas.
