# UI-01 rework (DR-146 + DR-160) — Opus 5 lens, rev 2

**Ticket:** `t_5f35d086` · **Packet:** `reviews/UI-01-rework-review-packet.md` ·
**Directive:** `reviews/UI-01-rework-rev2-directive.md` (+ DR-160 addendum) ·
**Prior:** `reviews/ui01-rework-opus-rev1.md` · **Handoff:**
`handoffs/UI-01-rework-codex-handoff.md` · dual diamond (DR-153); V's visual
verdict is the final gate (DR-145).

## VERDICT: CHANGES REQUESTED

**B1 is CLOSED and B2 is CLOSED** — both verified by the methods that found
them, not by reading the claims. The adaptive-depth approval is now genuinely
reachable in V3's live DOM, greyed, with a truthful tooltip AND visible reason.
All three rev1 mutations (MUT-A/B/C) now go RED against the *real* enforced
suite; so do two more I invented to probe the same class.

**B3/DR-160 is NOT closed.** Two findings, both established live:

- **B4 (new, and a rev2 REGRESSION):** at ≤ ~640px with a normal-length
  question, **four of the five top-bar actions render outside the viewport and
  are clipped away**, and the overflow menu never engages. Rev2 deleted V2's
  phone-collapse rules and replaced them with a measurement that *structurally
  cannot* see an over-full action row. rev1 did not have this bug; V2 does not
  have it.
- **B5:** the DR-160 ratchet is hollow in exactly the way rev1's B2 ratchets
  were. The enforced test named *"kills DR-160 MUT-D: a crowded bar stops
  collapsing"* exercises only a three-line pure predicate. I made the crowded
  bar stop collapsing — for real, live, at 1280px, reproducing rev1's original
  defect — and the enforced suite stayed **35/35 green**.

The content-aware idea is right and its title dimension is genuinely
implemented: same 1280px viewport, long question → collapses; short question →
does not. That part I can attest to.

---

## Environment note (read this before weighing the live evidence)

The stack did **not** survive the session break, and it could not be fully
rebooted: `serve.answer` in the standing acceptance DB (`acceptance/.pgdata`,
port 55432) holds **0 rows** — the ceremony that produced V's browsable
debates has since been reset, and re-running it is blocked on the claude CLI's
OAuth, which is V's alone (PAUSED-STATE UPDATE 4 §1). `/debate/0b53e130`
therefore renders `SERVER_FAILURE`, not a debate.

So I did what the handoff could not: I booted the real acceptance API against
the real standing DB (confirmed it serves, and confirmed it is empty), then
drove the UI from the repo's **own contract-valid fixture**
(`tests/support/v2uiFixtures.ts::buildFairShapedAnswer`, `AnswerSchema.parse`d)
served on `127.0.0.1:8790` in place of the upstream. Every byte the browser
rendered still travelled the real contract client → real V3 adapter → real
components; only the upstream row is a fixture. Two questions were served to
separate the variables: `short` = "Should the test question stand?" (193px
natural), `long` = a 137-character question (880px natural). Nothing was
written anywhere; the fixture upstream and the API were both stopped, and the
workspace was left as found (`.playwright-mcp/` removed, no stray files, all
mutated files restored byte-identical — md5 verified).

---

## B1 — CLOSED. The approval is reachable, visible, disabled and honest.

`DebatePageClient.tsx:1184-1206` — the compact `<section>` that V3 actually
renders now mounts `<AdaptiveDepthDryRunPanel enabled={true} …>` at
`:1201-1204`. The panel's `unavailable` branch (`:1714-1733`) carries the
button at `:1719-1727` and, folding **A6**, a visible
`.adaptiveDepthActionMessage` reason at `:1728-1730` rather than a tooltip
alone.

The path is unconditionally reachable in V3: `api.ts:171-173`
(`getDebateAdaptiveDepthDryRun` always resolves `adaptiveDepthUnavailable`) →
`adapter.ts:502` → `DebatePageClient.tsx:258-269` maps it to
`status: "unavailable"`. No dependence on V2 scoring.

**Live DOM, 1280×800, all `<details>` force-opened** (rev1 counted **zero**
Approve buttons here):

```json
{"approveCount":1,
 "text":"Approve selected expansions",
 "disabled":true,"ariaDisabled":"true","onclick":false,
 "title":"V3 exposes no adaptive-depth approval resource.",
 "display":"flex","visibility":"visible","opacity":"0.5",
 "rect":{"w":179,"h":31,"top":97,"left":638},
 "inViewport":true,"hitTest":"SELF",
 "siblingMessage":"V3 exposes no adaptive-depth approval resource."}
```

`hitTest: "SELF"` means nothing occludes it. The tooltip is **true**, not
invented copy: it is verbatim the reason `api.ts:180` gives when
`approveDebateAdaptiveDepthExpansion` rejects, sourced from the single
vocabulary in `lib/v3/missingCapabilities.ts:11`.

Enforced coverage is real: `tests/unit/v2ui-pages.test.ts:337-347` slices the
*unavailable branch* and pins the button block. Deleting the compact mount
(`MUT-B1`) goes RED; re-enabling the button while keeping its tooltip
(`MUT-I`) goes RED.

## B2 — CLOSED. The three named mutations now die against the enforced suite.

I did not re-implement the assertions this time. I mutated the **real files in
place** and ran the **real command**
(`npx vitest run tests/unit/v2ui-pages.test.ts`), restoring after each and
verifying every file back to its baseline md5:

| mutation | rev1 | rev2 |
|---|---|---|
| **MUT-A** delete the `<V3ScoreBadges>` JSX render site | GREEN (survived) | **RED** — 1 failed \| 34 passed |
| **MUT-B** re-enable Regenerate, keep the truthful tooltip | GREEN (survived) | **RED** — 1 failed \| 34 passed |
| **MUT-C** delete the maker meta line from the node header | GREEN (survived) | **RED** — 1 failed \| 34 passed |
| **MUT-B1** unmount the compact adaptive panel | n/a | **RED** |
| **MUT-I** un-disable the Approve button, keep its tooltip | n/a | **RED** |
| baseline (unmutated) | — | 35 passed (35) |

The assertions earn it. `:278-283` slices the contentful `.nodeHeader` region
and requires `<V3ScoreBadges` **with** `presentation={v3Scores}` — a render
site, not `function V3ScoreBadges`. `:284-287` requires the `metaLine` /
`modelDot` / `{model.name}` triple *inside that same region*, so the
empty-state occurrence rev1 exploited can no longer satisfy it. `:308-320`
extracts every rendered `<button>` block containing `Regenerate` in four files
and requires `disabled`, `aria-disabled="true"`, the capability constant, and
the **absence of `onClick=`** — which is what closes rev1's un-awaited-call
escape. The same button-block treatment now pins feedback (`:322-331`),
adaptive approval (`:337-347`) and settings save (`:350-357`).

**Also confirmed:** the load-bearing assertions live in the ENFORCED root
suite, not in the dormant `*.source-test.mjs` files, per the directive. A1/A2
were correctly recorded for HYG-01 rather than fixed here.

---

## BLOCKING

### B4 — At ≤ ~640px, four of five top-bar actions are clipped off-screen and the overflow never engages. This is a rev2 regression.

**Live, `/debate/short` (a 193px question) at 640×800 and 420×800:**

| viewport | `data-actions-collapsed` | `.debateOverflow` | actions laid out **outside** the viewport |
|---|---|---|---|
| 640px | `"false"` | `display:none` | Replay, Honesty, How-it-works, Settings |
| 420px | `"false"` | `display:none` | Replay, Honesty, How-it-works, Settings |

At 420px the four controls occupy x **420→620** in a 420px-wide window;
`document.documentElement.scrollWidth` is **420**, so they are not scrollable
to — `.debateView { overflow: hidden }` (`globals.css:1006`) simply clips them.
`elementFromPoint` on each returns `OUTSIDE-VIEWPORT`. Only `← Library`
survives. The screenshot at 640px shows the bar ending in a lone `←` with no
`⋯` anywhere. (Evidence PNG:
`…/scratchpad/ui01-rev2-short-title-640px-clipped-actions.png`.)

**Two causes, both in rev2's own diff.**

1. *The ported phone block lost the two rules that did the work.*
   `apps/v2-ui/app/globals.css:2840-2944` is V2's `@media (max-width: 640px)`
   block — it keeps `.debateTopControlRow { grid-template-columns: minmax(0,
   1fr) 44px 44px }` (`:2854-2858`) but contains **no `.debateInlineActions`
   rule and no `.debateOverflow` rule at all**. V2's own block has both:
   `.debateInlineActions { display: none }`
   (`apps/dialectical-engine/web/styles/debate-chrome.css:434-436`) and
   `.debateOverflow { display: block; width: 44px }` (`:459-463`). That grid
   was written *on the assumption the inline actions are hidden* — three
   columns for segment / topSwitch / overflow. Rev2 left the inline actions
   visible, so they land in the third 44px column with 252px of content. The
   handoff states this deletion plainly ("fixed 640px collapse removed while
   its phone layout remains", handoff line 46); what it did not check is that
   the phone layout **depended on** the collapse.

2. *The measurement cannot detect an over-full action row — by construction.*
   `DebatePageClient.tsx:760-763` measures each child with
   `getBoundingClientRect().width`, i.e. the **already-shrunk laid-out width**,
   and `:783-788` sums those into `controlsNeededWidth`. A flex/grid child
   squeezed to 44px reports 44px of *need*. Recomputing the effect's own
   arithmetic in the page at 420px:

   ```json
   {"display":"grid",
    "perControlChild":[{"cls":"segment","rectW":300,"scrollW":298},
                       {"cls":"topSwitch","rectW":44,"scrollW":44},
                       {"cls":"debateInlineActions","rectW":44,"scrollW":252}],
    "controlsNeeded":404,"pad":16,
    "neededWidth":420,"availableWidth":420,"decision":false,
    "ACTUAL_controls_scrollWidth":612}
   ```

   `neededWidth` computes to **exactly** `availableWidth` — it always will,
   because a shrunk box can never report more space than it was given. The
   title escapes this only because it has a dedicated max-content mirror
   (`.debateTopTitleMeasure`, `globals.css:1054-1060`, `position:absolute;
   width:max-content`). The actions have no such mirror.

**The tell:** the *same page at the same 640px* with the **long** question
collapses correctly (`collapsed:"true"`, `ofDisplay:"block"`, zero off-screen
actions). The phone case is covered only by the accident of a long question.
A user asking a short question loses Settings, Replay, Honesty and How-it-works
entirely.

**Fix direction (not a design number — no new value needed):** give
`.debateInlineActions` the same max-content mirror treatment the title has (or
measure `scrollWidth` / a cloned max-content probe rather than the shrunk
rect), so `neededWidth` reflects what the controls *need* rather than what
they were *allotted*. Restoring V2's two `@media (max-width: 640px)` rules
would also close the user-visible hole, but it re-introduces the fixed
breakpoint DR-160 rejected — the measurement fix is the one that honours the
ruling.

### B5 — The DR-160 ratchet does not fail when a crowded bar stops collapsing. Proven live and by mutation.

The addendum is explicit: *"an enforced test that fails when a crowded bar
stops collapsing."* `tests/unit/v2ui-pages.test.ts:302-306` is titled exactly
that, but its body is:

```ts
expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 34 })).toBe(true);
expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 159 })).toBe(true);
expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 526 })).toBe(false);
```

— three calls into `lib/debateHeaderOverflow.ts:7-9`, whose entire body is
`return _fit.neededWidth > _fit.availableWidth;`. It pins a two-token
comparison. Everything that decides whether a real bar collapses — the
measurement at `DebatePageClient.tsx:766-799` and the observer wiring at
`:802-807` — is covered only by `toContain` string presence (`:289-301`).

Four mutations, each run against the real enforced suite:

| mutation (all keep the predicate, the `ResizeObserver` and the data attribute) | enforced suite |
|---|---|
| **MUT-E** `neededWidth = 0 * (contentNeededWidth + headerPadding)` — *the bar never collapses at any width* | **GREEN, 35/35** |
| **MUT-G** `0 * titleMeasure.getBoundingClientRect().width` — *collapse stops being content-aware in the title* | **GREEN, 35/35** |
| **MUT-H** drop all three `observer.observe(…)` calls and the `resize` listener — *never re-decides after first paint* | **GREEN, 35/35** |
| **MUT-F** `neededWidth = 1e9 + …` — *collapses at every width, forever* | **GREEN, 35/35** |
| MUT-D `return false;` in the pure predicate | RED |

MUT-E is not a hypothetical. I applied it, let the dev server recompile, and
reloaded `/debate/long` at **1280×800**:

```json
{"vw":1280,"collapsed":"false","ofDisplay":"none",
 "titleShown":282,"titleNeeded":880}
```

That is rev1's B3 defect back in the product — the question crushed to a third
of what it needs, the overflow inert — while `pnpm vitest run
tests/unit/v2ui-pages.test.ts` reports **35 passed (35)**. The handoff's
mutation table row *"DR-160 MUT-D: crowded bar stops collapsing → Executes
`shouldCollapseDebateHeaderActions` for needed 526 versus available 34, 159,
526"* is the same overstatement rev1 flagged: the assertion kills a mutation
of the *predicate*, and is described as killing a mutation of the *behaviour*.

**Fix direction:** the decision is only as good as its inputs, so the ratchet
has to reach the inputs. Extract the measurement into a pure function over
injected geometry (child widths, gaps, padding, display mode) — the same seam
`shouldCollapseDebateHeaderActions` already occupies — and assert the 420px
case from B4 among its rows. Then MUT-E, MUT-G and B4's shrunk-rect reading
all have something to fail. State which mutation each new row kills.

---

## What passed, stated for the record

1. **Nothing that was right in rev1 regressed.**
   `apps/v2-ui/components/CanvasViewport.tsx` and
   `apps/v2-ui/lib/canvasViewport.ts` are still **byte-identical** (`diff` exit
   0) to `apps/dialectical-engine/web`'s.
2. **`DebateCanvas.tsx` is still the newer V2 base + V3 additions only.**
   Against V2's file: 85 added lines (all V3 — the `v3NodesById` prop, the
   `v3Scores` projection, the `<V3ScoreBadges>` render site and component, the
   disabled regenerate) and 16 removed — which are *exactly* the V2
   `onRegenNode` prop, its threading and its live Regenerate button, i.e. the
   **A4 fold**, replaced in place by the disabled affordance. No other
   subtraction.
3. **Badges and maker tags still render live** (1280px, post-hydration):
   `BASE 62%` / `FINAL 41%` and `BASE 55%` / `FINAL 55%`, each with the full
   provenance tooltip ("… (exact percentage restatement) · strength · produced
   by judgement · source …"), plus the maker `metaLine` "GPT" with its
   `modelDot`. `data-viewport-ready="true"`, four `.canvasZoomButton`s.
4. **Regenerate is still disabled-not-hidden live**: both canvas sites
   `disabled=true`, `aria-disabled="true"`, title `V3 exposes no
   node-regeneration resource.`
5. **No control bytes in the adapter.** Byte scan of `lib/v3/adapter.ts`: 0
   bytes in the control range; the escaped delimiter survives at `:630`. The
   two-sided enforced ratchet (`v2ui-pages.test.ts:219-222`) is intact.
6. **Frozen formatter untouched by rev2.** `lib/v3/adapter.ts` is not in the
   rev2 change set and its mtime (11:11) predates the entire rev2 edit window
   (12:45–13:31); DR-154(4)'s `v3ScorePercentage` / `v3NodeScoreDetails`
   remain UI-02a's.
7. **The collapse really is content-aware in the title dimension** — the core
   of DR-160, and it works:

   | page | viewport | title needs | collapsed | overflow | title shown |
   |---|---|---|---|---|---|
   | `long` | 1280 | 880px | **true** | `block` | **520px** (rev1: 159px) |
   | `short` | 1280 | 193px | **false** | `none` | 282px, not truncated |
   | `long` | 640 | 880px | **true** | `block` | full-width row |
   | `short` | 640 | 193px | false | `none` | not truncated — but see **B4** |

   Same width, opposite outcomes, decided by the question. That is not a
   breakpoint in disguise.
8. **The overflow menu is usable when it engages.** Opened at 1280px: five
   items, each 222×44, all inside the viewport, all `elementFromPoint` →
   `SELF`. The hidden inline actions are `visibility:hidden`, so they are **not
   focusable** — no duplicate tab stops, no phantom targets.
9. **A3 folded:** `DebateTree.tsx:179` restores the `token &&
   !isAbandonedNode(node)` gate; the button is `disabled` /
   `aria-disabled="true"` with the truthful title. **A5 recorded** in the
   handoff's adaptation list. **A6 folded** (see B1).

## ADVISORY

- **A7 — for V's eye, not a code defect.** Collapse saturates against V2's own
  cap. `.debateTopTitle { max-width: 520px }` is a faithful port
  (`debate-chrome.css:58`), so a long question shows 520px of the 880px it
  needs whether the bar is collapsed (1280px) or not (1920px, measured:
  `collapsed:"false"`, `titleShown:520`, `truncated:true`). DR-160 says
  collapse "whenever the title lacks the room it needs"; above ~1280px the
  title lacks it and the bar does *not* collapse — because collapsing would
  not help. The 34px → 159px → **520px** progression V asked for is real; the
  remaining truncation is the ported cap. If V wants the full question on
  desktop, that is a separate ruling on the 520px cap.
- **A8** At ≤640px the `Approve selected expansions` button overlaps the
  adjacent `.adaptiveDepthActionMessage` copy inside `.progressStrip` (visible
  in the evidence screenshot). Cosmetic, same lane, cheap.
- **A9** The handoff's acceptance table still over-claims one row: *"Overflow
  protects the title … GREEN by code/test/build; fresh browser capture
  unavailable"*. B4 is a browser-visible regression at phone widths, and the
  mutation table's DR-160 row describes a predicate mutation as a behaviour
  mutation (B5). The table was honestly corrected for B1/B3's rev1 history —
  this row needs the same treatment. Everything else in the table matches what
  I measured.
- **A10 — out of lane, worth a ticket.** The acceptance API crashes the whole
  process on a non-UUID answer id: `GET /v1/answers/0b53e130` → PG `invalid
  input syntax for type uuid` → unhandled → `ERR_HTTP_HEADERS_SENT` and exit.
  Reproduced twice while booting the read-only API. Pre-existing, not UI-01's.
- **A11** `tests/unit/v2ui-pages.test.ts:335` anchors the compact-branch region
  on the literal `") : (\n          <section"` — exact indentation inside a
  JSX ternary. It will break on a reformat rather than on a regression. The
  `region()` helper does fail loudly, so this is a maintenance note, not a
  soundness one.

## Re-review scope

B4 and B5 are both code/test changes in files this lane already owns, and both
are re-reviewable here — no new design number is needed for either (B4's fix
is a measurement fix; B5's is a test-seam fix). Everything else in the packet
is settled: B1 and B2 are closed, the merge shape and the V3 additions are
sound, and the title dimension of DR-160 is implemented as ruled.

---

*Method note: every "live" claim above is post-hydration DOM read from a real
browser at the stated viewport; every "mutation" claim is the real
`npx vitest run tests/unit/v2ui-pages.test.ts` against the real file, restored
byte-identical afterwards (md5-verified). Root typecheck and the root suite
were re-run by the orchestrator and were not re-run here.*
