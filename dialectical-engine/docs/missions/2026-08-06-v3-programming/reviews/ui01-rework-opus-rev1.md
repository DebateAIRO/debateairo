# UI-01 rework (DR-146) — Opus 5 lens, rev 1

**Ticket:** `t_5f35d086` · **Packet:** `reviews/UI-01-rework-review-packet.md` ·
**Handoff:** `handoffs/UI-01-rework-codex-handoff.md` · dual diamond (DR-153),
V's visual verdict is the final gate (DR-145).

## VERDICT: CHANGES REQUESTED

Three BLOCKING. The headline fear of this packet — that the newer-canvas merge
silently dropped UI-02a's badges or UI-02b's maker tags — **did not happen**: I
verified both render in the live merged canvas at 1280px, from V3 data, with
real values and real provenance. The merge is honest and its shape is exactly
right.

What is wrong is elsewhere: one of the four DR-146 dead actions is **hidden,
not disabled** (its component never mounts in V3), the overflow menu does not
engage at the width V named, and the new "enforced ratchets" survive every
regression they claim to prevent — I proved that by mutation, not by reading.

---

## What I verified live (stack up, `:3000`, token `v-dev`, debate `0b53e130`)

Method: browser at 1280×800, `localStorage["debateai:user-dev-token"]="v-dev"`,
Tree view, DOM measured directly. SSR HTML alone is useless here (the page
returns the auth gate), so every "renders" claim below is post-hydration DOM.

**UI-02a score badges — RENDER.** Per node, from V3's own numbers:

| node | badges | tooltip (truncated) |
|---|---|---|
| `d372077f` | `BASE 98%`, `FINAL 98%` | `Base score 98% (exact percentage restatement) · base-probability · produced by judgement:acceptance · source dd0b7284… · replay judgement:a4f04461…` |
| `0942e2a8` | `BASE 88%`, `FINAL 88%` | `Final strength 88% … · propagated-probability · produced by propagation:acceptance · … · replay replay:0b53e130…` |

Both carry `data-v3-score`, both open the drawer. The root card has none — that
is V2's own root branch, which never had a `nodeHeader`; correct.

**UI-02b maker tags — RENDER.** `d372077f` → `metaLine` "GPT" + `modelDot`;
`0942e2a8` → "Claude" + `modelDot`. Sourced through
`modelMeta(generation.model_id)` at `DebateCanvas.tsx:228`, rendered at
`:379-384`.

**The badges are not in a dead branch.** `V3ScoreBadges` sits at
`DebateCanvas.tsx:393-395`, inside `ScoringErrorBoundary` as a **sibling** of
the V2 `scoring ? … : scoringError ? …` chain, gated only on `v3Scores`
(`:238-239`, non-null whenever `v3NodesById !== undefined`). It does not depend
on V2 scoring existing — which is why it renders in V3, where V2 scoring never
does.

**The ported viewport works.** Live: zoom-in `1.0000 → 1.1000`; Fit →
`0.7484` / `data-fit-policy="overview-auto"`; 1:1 → `1.0000`; all four
`.canvasZoomButton`s pass `elementFromPoint` hit-testing (nothing occludes
them); `data-viewport-ready="true"`.

**Three of four dead actions are correctly disabled-not-hidden.** Live DOM:

| control | `disabled` | `aria-disabled` | `title` |
|---|---|---|---|
| Regenerate (canvas card) | ✅ | ✅ | `V3 exposes no node-regeneration resource.` |
| Regenerate (drawer, ×2 sites) | ✅ | ✅ | same |
| `UP` / `DOWN` (drawer) | ✅ | ✅ | `V3 exposes no scoring-feedback resource.` |
| `Save changes` (`/settings`) | ✅ | ✅ | `V3 exposes no settings-write resource; deployment configuration is register-governed.` |

DR-115 holds: `UP`/`DOWN` render bare when no summary exists (`upLabel =
summary ? \`UP ${summary.up}\` : "UP"`), never a fabricated `0`. No toast, no
dialog, no refusal call path. The tooltip strings are **true**: they are the
verbatim reasons `apps/v2-ui/lib/api.ts:189/192-194` gives for why those
helpers reject — not invented copy.

---

## BLOCKING

### B1 — Adaptive-depth approval is HIDDEN, not disabled. DR-146(3) unmet for one of the four named mutations.

`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx:938`

```ts
const scoringInsightsExpandable = scoringState.status === "loaded" && scoringByNodeId.size > 0;
```

`:1062` branches on it. `AdaptiveDepthDryRunPanel` — the only mount site of the
disabled `Approve selected expansions` button (`:1099-1102`, panel body
`:1672-1684`) — lives **inside the `true` branch**. The `false` branch
(`:1106-1122`) renders a compact `<section>` with no adaptive-depth panel at
all.

`scoringInsightsExpandable` can never be true in V3:
`apps/v2-ui/lib/api.ts:167-169` — `getDebateScoring` always resolves
`scoringUnavailable(id)`, whose `status` is `"unavailable"`
(`lib/v3/adapter.ts:492-500`); `DebatePageClient.tsx:386` maps that to
`status: "unavailable"`, and `scoringByNodeId.size` is `0`.

Live confirmation on the standing debate, after force-opening every `<details>`
on the page:

```json
{"compact":true,"expandable":false,"adaptiveState":"unavailable",
 "adaptivePanel":false,"anyApprove":0}
```

Zero buttons matching `/Approve/` exist in the document. V ruled the four
V2-only mutations "VISIBLE but VISIBLY DISABLED". This one is invisible. The
rework converted an unreachable *enabled* control into an unreachable
*disabled* control — the user-visible outcome is unchanged.

The handoff's AC table nonetheless reports `Dead mutations disabled-not-hidden
… adaptive approval … GREEN`, and the source ratchets agree with it, because
both test source text in a component that never mounts.

**Concrete failing case:** open any V3 debate → expand "Scoring insights" →
there is nothing to expand, and no greyed approval affordance anywhere on the
page. **Fix:** mount the adaptive-depth panel (or at minimum its disabled
approval affordance) outside the `scoringInsightsExpandable` gate, and pin it
with an assertion that fails when it is unmounted.

### B2 — The new enforced ratchets cannot fail for their stated reasons. Proven by mutation.

The `*.source-test.mjs` contracts do assert `disabled` — but **no gate runs
them.** `vitest.config.ts` includes only `tests/**/*.test.ts`;
`apps/v2-ui/package.json` `"test": "node scripts/run-node-tests.mjs"` points at
a file that does not exist (`apps/v2-ui/scripts/` is absent — the handoff
concedes this). The worker ran them by hand once. `tests/unit/v2ui-pages.test.ts`
says so in its own header comment (`:6-10`). So the **enforced** surface is
`tests/unit/v2ui-pages.test.ts` alone — and there the word `disabled` appears
**only in three test titles**, never in an assertion (`grep -c disabled` → 3,
all `it("…")` strings, lines 273 / 281 / 290).

I applied three regressions to `DebateCanvas.tsx` in memory and re-evaluated
every enforced canvas assertion from both `describe` blocks
(`tests/unit/v2ui-pages.test.ts:152-208` and `:245-295`). Probe:
`scratchpad/ratchet-probe.mjs`. Result:

```
BASELINE (unmutated):                       ALL ENFORCED CANVAS RATCHETS STILL PASS
MUT-A: V3ScoreBadges never rendered:        ALL ENFORCED CANVAS RATCHETS STILL PASS
MUT-B: Regenerate re-enabled with onClick:  ALL ENFORCED CANVAS RATCHETS STILL PASS
MUT-C: maker meta line deleted from header: ALL ENFORCED CANVAS RATCHETS STILL PASS
```

- **MUT-A** deletes `{v3Scores ? (<V3ScoreBadges … />) : null}` at
  `DebateCanvas.tsx:393-395`. The badges are then declared, computed and never
  rendered. `:249` asserts `toContain("function V3ScoreBadges")` — a
  **declaration**, not a render site. This is verbatim the outcome the packet
  was written to catch: *"old code paths retained but unreachable."*
- **MUT-B** replaces `disabled` / `aria-disabled` with
  `onClick={() => regenerateNode(node.id, "tok")}`, keeping the tooltip. The
  test named *"keeps node regeneration visible but **disabled** everywhere"*
  (`:273-279`) passes: it checks only for the strings `Regenerate`,
  `V3_MISSING_CAPABILITIES.nodeRegeneration`, and the absence of the literal
  `await regenerateNode(` — which an un-awaited call sidesteps.
- **MUT-C** deletes the maker `metaLine` from the node header
  (`DebateCanvas.tsx:379-384`). `:250-251` asserts `toContain("{model.name}")`,
  which still matches the *empty-state* branch at `:346-351`. Maker tags gone,
  ratchet green.

The same shape holds for B1 (`toContain("V3_MISSING_CAPABILITIES.adaptiveDepthApproval")`
in a component that never mounts) and for settings (`:290-294` asserts the
string `Save changes` and the capability constant, never `disabled`).

**Fix:** assert the JSX **use sites**, not the declarations, and assert
`disabled` where "disabled" is the claim. E.g. slice the `nodeHeader` region
and require `<V3ScoreBadges`; require the regenerate button's attribute block
to contain `disabled` and `aria-disabled="true"` adjacent to its `title`.

### B3 — The overflow menu never engages at the width V named; the handoff reports that criterion GREEN.

Provenance first, because this part is clean: the 640px threshold is **real and
correctly cited**. `apps/dialectical-engine/web/styles/debate-chrome.css:410`
declares `@media (max-width: 640px)`; `.debateInlineActions { display: none }`
at `:434-436`; `.debateOverflow { display: block; width: 44px }` at `:459-463`.
The 920px two-row transition at `:359+` is likewise real and faithfully ported
(`apps/v2-ui/app/globals.css:2736-2760`, `:2782-2830`). **AC-76 is satisfied —
the number was read, not invented.**

The problem is what that threshold does at V's stated failure width. Measured
live on the standing debate:

| viewport | `.debateTopTitle` width / needed | `.debateInlineActions` | `.debateOverflow` | top-bar |
|---|---|---|---|---|
| **1280px** | **159px / 526px** | `flex` (all 7 actions, 449px) | **`none`** | 1 row, 60px |
| 900px | 518px / 526px | `flex`, labels hidden | `none` | 2 rows, 115px |
| 620px | 377px / 526px | `none` | `block`, menu opens with all 6 | 2 rows, 115px |

At 1280px the control row consumes 759px of 1280 (`segment` 196 + `topSwitch`
98 + `debateInlineActions` 449), leaving the identity row 459px, of which the
title gets 159. DR-146(2) reads: *"add a responsive OVERFLOW MENU collapsing
less-used top-bar controls below a width threshold **so the question stays
readable**… Today at 1280px the debate title is crushed to 34px."* The named
width is unchanged in kind: 34px → 159px of the 526px the question needs, still
an ellipsis after roughly a quarter of the sentence. The mechanism V ruled —
the overflow — is `display:none` there. The question is readable at **900px**
and unreadable at **1280px**; V is likely to notice that inversion.

The handoff records this criterion as `Overflow protects title … GREEN by
source/type/build; visual verdict pending`, and *Questions for V* says "No new
design question." That is the wrong disposition. The worker was in a genuine
bind — AC-76 forbids inventing a threshold, and V2's own chrome has no
collapse above 920px — and the lawful move under AC-76/DR-039 is to **stop
loudly and ask**, not to ship the named failing case with a GREEN mark.

**What must change:** either V authorizes a threshold/behaviour above 920px
(a new decision, with provenance waived by ruling), or the handoff drops the
GREEN claim and carries an explicit Question for V stating that porting V2's
behaviour exactly leaves the 1280px title at 159/526px. The **code** here is
defensible; the **claim** is not.

---

## What passed, stated for the record

1. **The merge is the right shape.** `apps/v2-ui/components/CanvasViewport.tsx`
   and `apps/v2-ui/lib/canvasViewport.ts` are **byte-identical** (`diff` exit 0)
   to `apps/dialectical-engine/web`'s. `DebateCanvas.tsx` is the newer V2's 530
   lines **plus 73 lines of V3 additions** and nothing else: the `v3NodesById`
   prop (`:71-78`, `:91`, `:179`, `:203`, `:216`), the `v3Scores` projection
   (`:235-239`), the `V3ScoreBadges` render site (`:393-395`) and component
   (`:530-573`), and the disabled regenerate (`:440-448`). Neither
   wholesale-identical nor wholesale-old.
2. **It really is the newer canvas.** HEAD's v2-ui canvas differed from
   `apps/dialectical-engine/web`'s by 187 changed lines (the older snapshot V
   copied); the working-tree file differs only by the V3 additions above.
3. **Nothing from UI-02a/UI-02b was dropped.** `git diff HEAD` on
   `DebateCanvas.tsx` shows exactly three changes: outer wrapper → `<CanvasViewport>`,
   `data-node-id` added, regenerate disabled. Every UI-02a/02b line survives
   untouched.
4. **CSS port is complete.** Every class `CanvasViewport` uses is defined
   (`globals.css:1343-1446`, matching `apps/dialectical-engine/web/styles/canvas.css:1-130`),
   including the landscape-collision block at `:2933-2948`. All six custom
   properties it depends on (`--z-canvas-sticky`, `--z-zoom-cluster`,
   `--zoom-cluster-offset-b`, `--zoom-cluster-w`, `--dock-w`, `--dock-offset-b`)
   are declared. `canvasZoomFit`/`canvasZoomOne` are unstyled in v2-ui — they
   are unstyled in V2 too.
5. **No raw control bytes.** Byte scan of `apps/v2-ui/lib/v3/adapter.ts`: 0
   bytes in the control range, 2 occurrences of the six-character escape sequence backslash-u-0-0-0-0.
   The enforced two-sided ratchet (`v2ui-pages.test.ts:204-207`) is intact.
6. **Frozen formatter untouched by this lane.** `v3ScorePercentage` and
   `v3NodeScoreDetails` belong to UI-02a rev-2 (DR-154(4)); the adapter hunks in
   the shared dirty worktree are that lane's and POL-01's
   (`shouldClearStoredTokenAfterUnlockFailure`), correctly disclaimed in the
   handoff. The UI-02a `describe` block edits in `v2ui-pages.test.ts` are
   UI-02a's own rev-2, **not** a weakening by this rework.
7. **Scoring status was relocated, not deleted** — moved out of `topSwitch`
   into both scoring-insights variants (`DebatePageClient.tsx:1068-1073`,
   `:1115-1120`), both live.

## ADVISORY

- **A1** `apps/v2-ui/package.json` `"test": "node scripts/run-node-tests.mjs"`
  → the script does not exist. This is the root cause of B2's blind spot: it is
  why the only `disabled` assertions in the repo
  (`components/scoringFeedbackControls.source-test.mjs:26-31`,
  `lib/adaptiveDepthDryRun.source-test.mjs:124-128`) are unenforced. Worth
  fixing alongside B2 rather than duplicating those assertions into vitest.
- **A2** `apps/v2-ui/lib/api.test.mjs:65-81` still asserts
  `submitScoringFeedback` POSTs with a bearer token — flatly contradicted by
  `lib/api.ts:183-190`, which rejects. Dormant (same missing runner),
  pre-existing, but it now documents behaviour that no longer exists.
- **A3** `components/DebateTree.tsx:174-192`: Regenerate now renders
  unconditionally, including for **abandoned** nodes and with no token — the
  previous gate was `token && !isAbandonedNode(node)`. "Visible but disabled"
  arguably justifies it, but V2 never showed a regenerate affordance on a
  stopped path. The surrounding toolbar block also lost its indentation in the
  same hunk. `onQueued` / `onAuthRejected` are now threaded but never called in
  that file.
- **A4** `DebateCanvas.tsx:58,95,186,221` — `onRegenNode` is still declared,
  destructured and passed down, but no longer read anywhere. Harmless, but it
  is the kind of live-looking dead wire this packet asked to be alert to.
- **A5** `data-node-id` on `.nodeWrap` (`DebateCanvas.tsx:290`) is an addition
  beyond the V2 base that the handoff's adaptation list does not name. Trivial,
  but the packet asked that every adaptation be named.
- **A6** In the `unavailable` branch of `AdaptiveDepthDryRunPanel`
  (`DebatePageClient.tsx:1633-1646`) the reason is carried only by the tooltip,
  with no visible `.adaptiveDepthActionMessage` — unlike the data branch at
  `:1682-1684`. Moot until B1 is fixed, but worth aligning then.

## Re-review scope

B1 and B2 are code/test changes and re-reviewable here. B3 needs V's word
before a worker touches it — recommend the orchestrator route the 1280px
measurement to V as a question rather than sending it back to Codex to guess a
number.
