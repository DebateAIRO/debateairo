# UI-01 rework (DR-146 + DR-160) — Opus 5 lens, rev 3

**Ticket:** `t_5f35d086` · **Directive:** `reviews/UI-01-rework-rev3-directive.md` ·
**Prior:** `reviews/ui01-rework-opus-rev2.md` · **Handoff:**
`handoffs/UI-01-rework-codex-handoff.md` · dual diamond (DR-153); V's visual
verdict is the final gate (DR-145).

## VERDICT: CHANGES REQUESTED — one blocking, and it is four lines

**B4 is CLOSED.** The rev2 phone regression is dead in the live product. At
640px with a normal-length question — the exact case that lost Settings,
Replay, Honesty and How-it-works in rev2 — all six actions are now reachable
in an engaged overflow, with no horizontal document scroll. I re-ran the
original repro and it no longer reproduces.

**B5 is CLOSED for the arithmetic.** The measurement and observation seams are
genuinely ratcheted now: five mutations applied to the real
`debateHeaderOverflow.ts` — including the shrunk-rect regression itself — each
go RED against the real enforced suite, restored md5-identical.

**B6 (new, BLOCKING) — the *wiring* seam is still unratcheted.** The four
mutations rev2 named are killed only when they are introduced into the
extracted library. Introduced at the call site in `DebatePageClient.tsx` —
which is where rev2 introduced them and where the live defect was
reproduced — **four one-token mutations survive 38/38 green**, three of them
reproducing rev1/rev2's proven defects:

- `setHeaderActionsCollapsed(false)` — the bar never collapses at any width.
  This is rev2's MUT-E, the one my prior instance applied live and got the
  crushed 282px-of-880 title back at 1280px with the suite green.
- `titleIntrinsicWidth: 0 * debateHeaderElementIntrinsicWidth(titleMeasure)` —
  rev2's MUT-G verbatim, relocated by one token.
- `measure: () => {}` — rev2's MUT-H effect: observers wired, never re-decides
  after first paint.
- `availableWidth: 1e9` — never collapses.

The directive's Done-when is "B5's four mutations each killed by a named
enforced assertion". Three of the four are not. The fix is four `toContain`
lines in a test that already contains six of them, needs no design number and
no V input.

**Everything else lands.** A8, A9 and A11 are folded (A9 with one row still
over-claiming, folded into B6). Nothing that was right regressed: viewport
byte-identity holds, the canvas merge shape is unchanged, the adapter is
control-byte clean and untouched by rev3.

---

## Environment note — read before weighing the live evidence

The standing stack was up and real for the whole live phase: Next dev on
`:3000` → the repo's own acceptance API (`acceptance/run-acceptance.ts --token
v-dev --serve`, pid 1014) on `127.0.0.1:8790` → the standing Postgres on
`55432`. Unlike rev2, the DB was **not** empty: `GET /v1/answers` returned one
real row, `1ec56376-604b-4d64-92bd-405fd32b5e7e` — *"What is the strongest
case for adopting a four-day workweek at a software company?"* (82 chars,
526px natural). Every byte the browser rendered travelled the real contract
client → real V3 adapter → real components, from a real DB row. No fixture
upstream was needed and nothing was written anywhere.

**Disclosed method.** B4 needs three question lengths and the DB has one
question. Rather than stand up a fixture upstream in place of V's API, I
substituted the *question string only*, in the live DOM, by setting
`textContent` on `.debateTopTitle` and its `.debateTopTitleMeasure` mirror and
dispatching `resize`. The measurement effect then re-ran against the real DOM,
real CSS, real fonts and real action widths — only the 30–145 characters a
user types were mine. Each row below reports the `titleNeeded` it actually
measured, so every row is self-consistent.

**Two environment facts the orchestrator needs.**

1. Other lanes were editing the shared tree throughout. Fast Refresh rebuilt
   the app three times mid-sweep. The two files under test
   (`DebatePageClient.tsx` 14:53:45, `debateHeaderOverflow.ts` 14:54:28) were
   stable before my first probe (14:55:43) and md5-identical at the end, so
   the live evidence is sound — but the tree is not quiet.
2. **The standing stack broke at ~12:03 UTC, mid-review, and it is not
   UI-01's doing.** Another lane regenerated `packages/contract`; the running
   API (booted before that) serves
   `condition_mark_records[].served_root_rule` values the freshly compiled UI
   schema now rejects, so `/debate/<id>` renders `INVALID_RESPONSE`. Proven by
   parsing the API's own live response with the current `AnswerSchema`:
   `invalid_value … expected "first-configured-provider"` on eight records.
   **The API must be restarted before V's visual gate**, or V will see an
   error page and blame UI-01.

All live numbers below were captured *before* that break.

---

## B4 — CLOSED. Verified by re-running the exact repro that found it.

Two things changed and both matter. `globals.css:2859-2866` restores V2's two
missing phone rules (`.debateInlineActions{display:none}` +
`.debateOverflow{position:relative;display:block;width:44px}`), so the 3-column
`grid-template-columns: minmax(0,1fr) 44px 44px` at `:2854-2858` again gets the
row it was written for. And `debateHeaderOverflow.ts:41-43` measures
`Math.max(scrollWidth, rect.width)` instead of the post-squeeze rect, so an
over-full action row is now detectable at all.

There is also a third piece the handoff does not name, and it is the neat one:
`globals.css:1116-1121` turns the collapsed `.debateInlineActions` into
`position:absolute; width:max-content; visibility:hidden; pointer-events:none`
— the same max-content mirror the title already had. The collapsed state
therefore keeps measuring the *expanded* need, so the decision cannot
oscillate. I confirmed the mirror reports 449px at 1000px collapsed and the
in-flow row reports the same 449px at 1280/1920 expanded.

**Live, post-hydration, real debate, real stack:**

| viewport | question | `data-actions-collapsed` | `.debateInlineActions` | `.debateOverflow` | actions reachable | `document.scrollWidth` |
|---|---|---|---|---|---|---|
| 640 | **short, 193px** — *the rev2 repro* | `"false"` | `display:none` | `block` | **6/6 SELF** in open menu, x 401→623 | 640 |
| 640 | real, 526px | `"true"` | `display:none` | `block` | 6/6 SELF, x 401→623 | 640 |
| 420 | short, 193px | `"true"` | `display:none` | `block` | 6/6 SELF, x 181→403 | 420 |
| 641 | short | `"true"` | absolute/hidden/`pointer-events:none` | `block` | mirror not hit-testable; summary SELF | 641 |
| 660 | short | `"false"` | `flex` | `none` | **6/6 SELF inline**, x 324→628 | 660 |
| 1000 | short | `"true"` | hidden mirror | `block` | 6/6 SELF in menu | 1000 |
| 1280 | long, 917px | `"true"` | hidden mirror | `block` | 6/6 in menu; title 520px | 1280 |
| 1920 | short / 526px | `"false"` | `flex` | `none` | 6/6 SELF inline | 1920 |
| 1920 | long, 917px | `"true"` | hidden mirror | `block` | title 520px (the V2 cap — A7) | 1920 |

Compare the first row with rev2's: same viewport, same question length,
`collapsed:"false"` in both — but rev2 had `.debateOverflow{display:none}` and
laid Replay/Honesty/How-it-works/Settings out at x 420→620 in a 420px window,
`elementFromPoint` → `OUTSIDE-VIEWPORT`. Rev3 hides the inline row and shows
the `⋯`. **Nothing is off-screen at any width I tested**, and
`document.documentElement.scrollWidth` equals the viewport width in every row.

Two notes on the hit-testing, because they cut the other way. My first probe
scored an element `SELF` when `elementFromPoint` returned an *ancestor*; that
is a false pass, and I re-ran every reachability claim above with the strict
test (`el === t || el.contains(t)`). Under the strict test the collapsed
inline mirror correctly reports `NOT-SELF` / `OUTSIDE-VIEWPORT` — it is
`visibility:hidden` and `pointer-events:none`, so it is inert, not a phantom
target.

**1280px, both directions of the DR-160 rule, on real content:**

| 1280px case | collapsed | title shown / needed | truncated |
|---|---|---|---|
| short question, no completion chip | **`"false"`** — 6/6 actions inline | 198 / 193 | no |
| long question, no completion chip | **`"true"`** | 520 / 917 | yes (the 520 cap) |

That is the criterion the directive asked for: title full width when room
exists, collapse when not, decided by content at one fixed viewport.

---

## B5 — CLOSED for the measurement. Five mutations, real files, real command.

`npx vitest run tests/unit/v2ui-pages.test.ts`, each mutation applied to the
real file, restored afterwards, md5 verified against baseline (all four files
match at the end: `4febd48a…`, `4189eb4b…`, `4c518c17…`, `41de3010…`).

| mutation | applied at | enforced suite | the assertion that kills it |
|---|---|---|---|
| baseline | — | **38 passed (38)** | — |
| **MUT-E** `neededWidth = 0 * (…)` | `debateHeaderOverflow.ts:62` | **RED** — 2 failed \| 36 passed | `v2ui-pages.test.ts:339` exact `{neededWidth:628, availableWidth:420, collapse:true}`, plus `:357` |
| **MUT-G** title intrinsic × 0 | `debateHeaderOverflow.ts:52` | **RED** — 1 \| 37 | `:356` (880px title at 1280px must collapse) |
| **MUT-F** `neededWidth = 1e9 + …` | `debateHeaderOverflow.ts:62` | **RED** — 2 \| 36 | `:339` and `:357` (193px title at 1280px must *not* collapse) |
| **MUT-H** drop the observe loop + resize listener | `debateHeaderOverflow.ts:75-76` | **RED** — 1 \| 37 | `:386-392` (all three targets observed, listener callable, cleanup disconnects) |
| **B4-lib** restore the shrunk-rect read (`return element.getBoundingClientRect().width`) | `debateHeaderOverflow.ts:42` | **RED** — 1 \| 37 | `:319-323` (`{scrollWidth:252, rect:44}` must measure 252) |

The worker's named killers are accurate for these. `:339`'s exact-object
assertion is the right shape — it pins the arithmetic, not just its sign.

---

## B6 — BLOCKING: the same four mutations survive at the wiring seam

The rev2 directive asked for the measurement seam to be tested behaviourally
**and the wiring ratcheted**. The first half is done. The second is six
`toContain` strings (`:299-304`) that happen not to cover the four lines that
matter. Same command, same suite, same session:

| mutation | applied at | enforced suite |
|---|---|---|
| `setHeaderActionsCollapsed(false)` — **a crowded bar stops collapsing, at every width** | `DebatePageClient.tsx:790` | **GREEN — 38 passed (38)** |
| `titleIntrinsicWidth: 0 * debateHeaderElementIntrinsicWidth(titleMeasure)` — rev2's MUT-G, one token moved | `DebatePageClient.tsx:784` | **GREEN — 38/38** |
| `measure: () => {}` — observers wired, never re-decides after first paint | `DebatePageClient.tsx:799` | **GREEN — 38/38** |
| `availableWidth: 1e9` — never collapses | `DebatePageClient.tsx:778` | **GREEN — 38/38** |

Why this is not pedantry. The first row is verbatim the sentence the rev2
directive used to define the requirement — *"an enforced test that fails when a
crowded bar stops collapsing"* — and it is still false. My prior instance
applied that exact behaviour live and reproduced rev1's B3 defect (title 282px
of 880 needed at 1280px, overflow inert) with the suite green; the code path is
unchanged, so the live consequence is unchanged. The second row is rev2's
MUT-G at the same element, in the same file, differing only in which
expression reads the mirror. The third silently freezes the decision at first
paint, which a phone rotation or a late-arriving completion chip then makes
visible.

`grep` over `tests/`, `acceptance/` and `apps/v2-ui/` confirms **nothing
anywhere** asserts `setHeaderActionsCollapsed(fit.collapse)`,
`availableWidth: header.clientWidth`, `titleIntrinsicWidth:
debateHeaderElementIntrinsicWidth(titleMeasure)` or `measure: measureHeaderFit`.

**Fix — four lines, in the test that already has six of this shape**
(`tests/unit/v2ui-pages.test.ts:299-304`):

```ts
expect(client).toContain("availableWidth: header.clientWidth,");
expect(client).toContain("titleIntrinsicWidth: debateHeaderElementIntrinsicWidth(titleMeasure),");
expect(client).toContain("setHeaderActionsCollapsed(fit.collapse);");
expect(client).toContain("measure: measureHeaderFit");
```

Each kills exactly one row above; state which in the handoff. The stronger
option, if the worker prefers it, is to extract the DOM read into a pure
`readDebateHeaderGeometry(elements, styles)` in `debateHeaderOverflow.ts` and
assert it with stub elements — that kills all four behaviourally rather than
lexically. Either is same-file, same-session, no design number needed.

**A9 is folded but one row inherits this.** The corrected acceptance table's
*"Ratchets prevent silent render/action regressions … MUT-E/G/F/H individually
made enforced Vitest RED … GREEN"* is true only for mutations introduced into
`debateHeaderOverflow.ts`. The mutation-killer table's MUT-G row has the same
gap. Both need the qualifier, or the four assertions that make them true.

---

## Folded advisories — verified

- **A8 — folded.** At 640px the `Approve selected expansions` button
  (x 393→572, y 262→292) and its `.adaptiveDepthActionMessage`
  (x 22→229, y 306→320) no longer share a line box: overlap `false`. The
  compact strip is `flex-wrap: wrap`, `height: auto` (measured 101.7px), and
  the rule is ratcheted at `v2ui-pages.test.ts:436`.
- **A9 — folded, with the B6 exception above.** The table now states plainly
  that rev2's phone-overflow and DR-160 ratchet claims were false, and marks
  the browser proof `HONESTLY PENDING` rather than inventing it. That was the
  right call, and this review supplies the missing capture.
- **A11 — folded.** `v2ui-pages.test.ts:422` anchors the compact branch on
  `data-scoring-insights-compact="true"` (`DebatePageClient.tsx:1177`), not on
  indentation inside a JSX ternary.

## Nothing previously right regressed

1. `apps/v2-ui/components/CanvasViewport.tsx` and `lib/canvasViewport.ts` are
   still **byte-identical** (`diff` exit 0) to
   `apps/dialectical-engine/web`'s.
2. `DebateCanvas.tsx` against V2's is still **85 added / 16 removed** — the
   same shape rev2 verified; rev3's A4 fold did not eat anything else.
3. **Adapter control bytes: 0** over all 25,492 bytes of `lib/v3/adapter.ts`.
4. **Frozen formatter untouched.** `lib/v3/adapter.ts` mtime 11:11:39, before
   the entire rev3 edit window (13:59–14:54).
5. Badges, maker tags and the disabled-not-hidden affordances: the enforced
   render-site assertions that pin them (`:283-292`, `:395-418`) are green at
   baseline and were verified live in rev2; rev3 does not touch those render
   sites. I could not re-photograph them after the contract drift broke the
   page (environment note 2).

## ADVISORY

- **A12 — the ≤640px fallback overrides the content-aware rule, and the
  handoff says otherwise.** Measured: 640px + a 193px question gives
  `data-actions-collapsed="false"` while `.debateInlineActions` is
  `display:none` and the `⋯` is shown. That is the right *behaviour* — it is
  V2's, and it is what a phone needs — but the handoff's *"preserves DR-160's
  content-aware rule at all widths and restores the V2 phone fallback"* is
  self-contradictory as written. Below 641px the actions are collapsed by
  breakpoint, not by content; the title dimension stays content-aware. Correct
  the sentence, or let V rule on it.
- **A13 — the "intrinsic phone geometry" row does not model the phone DOM.**
  `v2ui-pages.test.ts:325-337` passes `controlIntrinsicWidths: [300, 44, 252]`
  for a 420px stacked header — i.e. inline actions *displayed*. In the real
  ≤640px DOM they are `display:none` and the effect's own `isDisplayed` filter
  drops them (measured: `controlChildren` = segment, topSwitch, then
  `display:none`). The row is a sound arithmetic pin and I am not asking for it
  to change; the *name* implies a fidelity it does not have, and the actual
  phone protection is the CSS rule pinned at `:308`. A comment would do.
- **A14 — A7 restated with rev3 numbers, still V's call.** At 1920px a 917px
  title now collapses the bar (rev2: it did not) and still renders 520px,
  because `.debateTopTitle{max-width:520px}` is a faithful V2 port
  (`debate-chrome.css:58`). Collapsing buys the title nothing there. Whether
  to lift the cap remains V's ruling, not this lane's.
- **A15 — for V's eye, so the `⋯` is not read as a bug.** The standing debate
  carries a `completion.humanReason` chip ("Served downgraded", 154px
  intrinsic). With it present the bar collapses at 1280px for *every* question
  length, including an 11-character one — because the fixed chrome alone needs
  1248px. This is honest, not a stuck breakpoint: expanded, that chip is
  truncated to 108px; collapsed, it gets its full 154px. Hide the chip and the
  same 1280px viewport keeps the actions inline (measured). Content-awareness
  is intact; this debate simply has more chrome than 1280px holds.
- **A16 — environment, not this lane.** See environment note 2: the acceptance
  API needs a restart before V's visual gate, or `/debate/<id>` shows
  `INVALID_RESPONSE` from another lane's contract regeneration.

## Re-review scope

B6 only, and only in `tests/unit/v2ui-pages.test.ts` (plus the two handoff
rows). B4 is closed, B5's measurement half is closed, A8/A9/A11 are folded, and
the merge shape and V3 additions are unregressed. Once those four assertions
exist and each names its mutation, I have nothing else blocking and this goes
to V's eye.

---

*Method note: every "live" claim is post-hydration DOM read from a real
browser at the stated viewport against the standing stack and a real DB row,
with the question string substituted in-DOM as disclosed above; every
"mutation" claim is the real `npx vitest run tests/unit/v2ui-pages.test.ts`
against the real file, restored byte-identical afterwards (md5-verified, all
four files). Root typecheck, the full root suite and the acceptance suite were
verified by the orchestrator and were not re-run here. Workspace left as
found: no repo file modified, `.playwright-mcp/` removed, no service touched,
nothing written to the DB.*
