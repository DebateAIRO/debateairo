# UI-01 rework dual-diamond review — Grok lens (rev1)

**Ticket:** `t_5f35d086` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff `handoffs/UI-01-rework-codex-handoff.md`  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev1)  
**Date:** 2026-08-12  
**Packet:** `reviews/UI-01-rework-review-packet.md` (DR-153)  
**Inputs verified against shipped source (not handoff trust):**  
`apps/v2-ui/components/DebateCanvas.tsx`,  
`apps/v2-ui/components/CanvasViewport.tsx`,  
`apps/v2-ui/lib/canvasViewport.ts`,  
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx`,  
`apps/v2-ui/app/globals.css`,  
`apps/v2-ui/lib/v3/adapter.ts` (**binary-safe**),  
`apps/v2-ui/lib/v3/missingCapabilities.ts`,  
`apps/v2-ui/components/{ModelPresentation,NodeDetailDrawer,DebateThread,DebateTree}.tsx`,  
`apps/v2-ui/app/settings/page.tsx`,  
`apps/v2-ui/lib/api.ts` (dead-mutation stubs),  
`tests/unit/v2ui-pages.test.ts` (UI-01 DR-146 ratchets + UI-02a wiring),  
V2 baseline at repo-sibling  
`../apps/dialectical-engine/web/components/{CanvasViewport,DebateCanvas}.tsx`,  
`../apps/dialectical-engine/web/lib/canvasViewport.ts`,  
`../apps/dialectical-engine/web/styles/debate-chrome.css`.

**Mode:** read-only. This seat wrote only this verdict file. No product code edits, no git mutations, no board mutations. Did not read any peer Opus UI-01 rework verdict. Did not re-run orchestrator-green full gates (root/v2-ui `tsc`, 62/439 vitest, acceptance 9/35, architecture). Did not claim browser pixel proof (packet assigns final visual to V under DR-145).

## Verdict

**APPROVED**

The newer-canvas merge is the right shape — byte-identical newer V2 `CanvasViewport` + math, with `DebateCanvas` as that base plus explicit V3 adaptations — and **UI-02a score badges and UI-02b maker tags survive as live per-node render wiring**, not as orphaned tests. Overflow 640px is cited to newer V2 CSS, not invented. Dead V2 mutations are visible, disabled, greyed via global `:disabled`, and titled with the real missing V3 capability. Ratchets would go red on the stated regressions they pin; residual ratchet brittleness is ADVISORY only. Adapter has zero raw control/NUL bytes; the percentage formatter body and live samples match the UI-02a-approved rule.

---

## Decision table (packet Q1–Q6)

| # | Question | Result | Source proof |
|---|---|---|---|
| **1** | UI-02a/UI-02b survive as **rendered** behaviour after the merge? | **PASS** | Client `v3NodesById={v3NodeById}` (`DebatePageClient.tsx:1189`); card `v3Scores` → JSX `<V3ScoreBadges …>` (`DebateCanvas.tsx:238–239,393–394,530–572`); maker `active_generation` → `modelMeta` → modelDot + `model.name` (`:227–228,379–384`); default `"tree"` view mounts `DebateCanvas` (`:321,1180–1201`) |
| **2** | Newer canvas = newer V2 base + V3 additions (not wholesale-old / not wholesale-identical)? | **PASS** | `CanvasViewport.tsx` + `lib/canvasViewport.ts` **byte-identical** to dialectical-engine V2; `DebateCanvas` diffstat **+85/−12** = V3 score/maker props + disabled regen only |
| **3** | Overflow threshold provenance (AC-76 / claimed 640px)? | **PASS** | V2 `debate-chrome.css:410` `@media (max-width: 640px)`; inline hide `:434–436`; overflow show `:459–462`; ported into `globals.css:2782+` with same structure + 920px two-row |
| **4** | Disabled-not-hidden for V2-only mutations? | **PASS** | Regen canvas/thread/tree/drawer; feedback drawer; adaptive approval; settings Save — all `disabled` + `aria-disabled` + `V3_MISSING_CAPABILITIES.*`; no UI `await regenerateNode` / `submitScoringFeedback` / `approveDebateAdaptiveDepth` / `saveSettings(`; global `:disabled { opacity: 0.5 }` |
| **5** | New UI-01 ratchets real (would fail on stated regression)? | **PASS** (with A1 advisory on mount/disabled attribute pin gaps) | `v2ui-pages.test.ts:245–295` five DR-146 cases; each named regression turns a concrete `toContain` / `not.toContain` / CSS regex red |
| **6** | No raw control bytes; frozen formatter untouched? | **PASS** | adapter raw NUL = **0**, C0 excl. TAB/LF/CR = **0**, 2× `\u0000` escapes; `v3ScorePercentage` body + live samples match UI-02a rule (hash slice boundary not independently re-derived; same as prior Grok UI-02a rev2) |

---

### Q1 — Survival of UI-02a / UI-02b as **render** behaviour (primary check)

**Not** “are the tests green.” Trace of what the **merged** `DebateCanvas` actually mounts per node.

#### Prop path (page → canvas → card)

| Step | File:line | What runs |
|---|---|---|
| Build contract map | `DebatePageClient.tsx:652` | `v3NodeById = answer === null ? null : contractNodesById(answer)` |
| Pass into canvas | `:1189` | `v3NodesById={v3NodeById}` |
| Default view mounts canvas | `:321` + `:1180–1201` | `useState<DebateView>("tree")`; branch is thread / split / map / **else `DebateCanvas`** — so default **Tree** is the canvas surface (V2 naming), not `DebateTree.tsx` |
| Viewport wrapper | `DebateCanvas.tsx:141–191` | every layout card sits inside ported `<CanvasViewport>` |
| Forward per card | `:179` | `v3NodesById={v3NodesById}` into `CanvasCard` |

#### Per-node JSX (inside `CanvasCard`)

**Maker (UI-02b):**

```text
generation = node.active_generation
model      = generation ? modelMeta(generation.model_id) : null
```

(`DebateCanvas.tsx:227–228`)

| Card state | Maker render |
|---|---|
| contentful header (done / pending / streaming path) | if `model`: `modelDot` + **`{model.name}`** (`:379–384`) — live |
| empty | if `model`: “`{model.name} conceded`” (`:346–350`) — live |
| abandoned / failed / pure root chrome | no maker line in those branches |
| absent generation | `model === null` → no maker chrome (honest; matches UI-02b null lineage → no badge) |

Adapter fill that feeds this: `adapter.ts:137–139`  
`active_generation: maker_lineage === null ? null : { model_id: maker_lineage.model_id }`.

**Note on packet wording “ModelBadge”:** the **canvas** approved UI-02b path is V2’s `modelMeta` + metaLine (not the `ModelBadge` component). `ModelBadge` remains on `DebateTree.tsx:157` (secondary surface via `ArgumentFocusView`). Primary debate “Tree” view renders **DebateCanvas**, so the live maker tag is the metaLine path — and it is still wired after the merge.

**Scores (UI-02a):**

```text
v3Scores =
  v3NodesById === undefined
    ? null
    : v3ScorePresentation(v3NodeScoreState(node, v3NodesById))
```

(`DebateCanvas.tsx:238–239`)

On the debate page, `v3NodesById` is **never** left `undefined` (only `null` or a `Map`), so every card computes a presentation.

| `v3NodesById` / node case | `v3NodeScoreState` | What mounts |
|---|---|---|
| `null` (no served answer yet) | `ABSENT` / `NO_SERVED_ANSWER` | `V3ScoreBadges` → unavailable pill `NO SCORE YET` (`:540–548`) |
| Map, ROOT_CLAIM | `ABSENT` / `QUESTION_CARD_IS_NOT_A_NODE` | root uses separate chrome (`:323–337`) — no header badges (V2 shape); absence reason still honest in adapter |
| Map, id missing | `ABSENT` / `NODE_ABSENT_FROM_SERVED_ANSWER` | unavailable pill `NO SCORE` |
| Map, present node | `PRESENT` both contract numbers | button of pills `BASE …%` / `FINAL …%` via `badge.pillText`, title = provenance (`:550–571`); formatter only in adapter |

**JSX mount (the merge-hazard question):**

```tsx
{v3Scores ? (
  <V3ScoreBadges node={node} presentation={v3Scores} openNodeDetails={openNodeDetails} />
) : null}
```

at `DebateCanvas.tsx:393–394`, **inside** the same `ScoringErrorBoundary` / `nodeHeader` as V2’s optional scoring badges, on the contentful non-root branch. `V3ScoreBadges` is defined in **this** file (`:530–572`), not on a discarded component.

**Failing case that would reverse Q1:** drop the JSX mount while leaving `function V3ScoreBadges` and tests’ string pins; or stop passing `v3NodesById` from the client; or replace canvas maker line with a hard-coded model string / invent when `active_generation` is null.

**Not claimed:** browser pixel proof of pills/tags. Final visual remains V under DR-145.

---

### Q2 — Is the newer canvas genuinely the newer canvas?

Compared against repo-sibling  
`/Users/vladmihaimiron/Documents/DebateAIRO/apps/dialectical-engine/web`  
(packet’s `apps/dialectical-engine/web`; not vendored under DebateAI-V3 root).

| File | Relation to newer V2 |
|---|---|
| `apps/v2-ui/components/CanvasViewport.tsx` | **`cmp` identical** (642 lines) |
| `apps/v2-ui/lib/canvasViewport.ts` | **`cmp` identical** |
| `apps/v2-ui/components/DebateCanvas.tsx` | Newer V2 base + V3 delta (**+85 / −12**) |

**V3 adaptations in the DebateCanvas delta (named, not wholesale-old):**

1. Imports: `ContractNode`, `v3NodeScoreState` / `v3ScorePresentation`, `V3_MISSING_CAPABILITIES`
2. Prop `v3NodesById` on canvas + card + pass-through
3. `v3Scores` computation + `<V3ScoreBadges>` mount
4. Full `V3ScoreBadges` function body
5. Regenerate: V2 conditional `onRegenNode` click handler → always-visible **disabled** button with capability tooltip

**Not** wholesale-identical (V3 props required). **Not** wholesale-old (viewport is the new gesture/fit implementation, not the pre-DR-146 inline viewport).

---

### Q3 — Overflow threshold provenance (640px)

**Not invented.** Newer V2 source:

`apps/dialectical-engine/web/styles/debate-chrome.css`

| Line | Rule |
|---|---|
| **410** | `@media (max-width: 640px) {` |
| **434–436** | `.debateInlineActions { display: none; }` |
| **459–462** | `.debateOverflow { … display: block; }` |
| **359+** | `@media (max-width: 920px)` two-row identity/control layout |

Ported into `apps/v2-ui/app/globals.css:2736+` (920px) and **`:2782+`** (640px) with the same hide-inline / show-overflow behaviour. Header markup uses `debateTopIdentityRow` / `debateTopControlRow` / `<details className="debateOverflow">` (`DebatePageClient.tsx:950–1054`).

Packet symptom (title crush at 1280px) is a **visual** residual for V’s eye; source wiring for the ruled breakpoints is present.

---

### Q4 — Disabled-not-hidden (real capability names)

Shared vocabulary (`missingCapabilities.ts:7–12`):

| Key | Tooltip text |
|---|---|
| `nodeRegeneration` | “V3 exposes no node-regeneration resource.” |
| `scoringFeedback` | “V3 exposes no scoring-feedback resource.” |
| `settingsWrite` | “V3 exposes no settings-write resource; deployment configuration is register-governed.” |
| `adaptiveDepthApproval` | “V3 exposes no adaptive-depth approval resource.” |

| Mutation | Visible control | Disabled UX | No dialog / no fake success on click path |
|---|---|---|---|
| Regenerate | Canvas `:440–448`, Thread, Tree, Drawer `:259–267` | `disabled` + `aria-disabled` + title capability | no `await regenerateNode(` in those components; API stub rejects if ever called (`api.ts:192–194`) |
| Scoring feedback | Drawer up/down `:443–462` | same | no `onClick={() => onSubmit(...)}`; no `submitScoringFeedback` call sites in UI |
| Adaptive-depth approval | `DebatePageClient.tsx:1636–1644`, `:1673–1684` | same + muted message | no `approveDebateAdaptiveDepthExpansion(` in client |
| Settings write | `settings/page.tsx:175–183` “Save changes” | same | no `saveSettings(` |

Greying: `globals.css` global `:disabled { opacity: 0.5; cursor: not-allowed; }` and `.btn:disabled` same opacity — visible affordances stay in layout and dim.

**Residual (ADVISORY, not blocking):** `DebatePageClient.tsx:1251–1253` still wires `onQueued={() => showToast("Regeneration queued")}` into the drawer, but the drawer **never invokes** `onQueued` (prop only destructured). Dead success-toast prop, not a user-reachable fake-success click path while regen stays disabled.

---

### Q5 — Ratchet quality

Suite: `tests/unit/v2ui-pages.test.ts` describe **“UI-01 DR-146 rework…”** (`:245–295`).

| Ratchet | Behaviour that turns it red | Real? |
|---|---|---|
| CanvasViewport + score/maker wiring | Drop `CanvasViewport` import/wrapper; drop `v3ScorePresentation(v3NodeScoreState(node, v3NodesById))`; drop `function V3ScoreBadges`; drop `modelMeta(generation.model_id)` / `{model.name}`; drop client `v3NodesById={v3NodeById}` | **Yes** for those pins |
| 640px overflow | Remove identity/control rows, overflow `<details>`, or break CSS so 640px no longer hides `.debateInlineActions` / shows `.debateOverflow`; or drop 920px two-row | **Yes** (CSS multi-line regex) |
| Regen disabled-not-hidden | Hide “Regenerate”, drop capability constant, or reintroduce `await regenerateNode(` | **Yes** for those; see A1 on `disabled` attr |
| Feedback / adaptive | Drop capability pins; restore `onSubmit("up"|"down")` or `approveDebateAdaptiveDepthExpansion(` / `submitScoringFeedback(` | **Yes** |
| Settings Save | Remove “Save changes” or capability title; reintroduce `saveSettings(` | **Yes** |

Prior UI-02a source ratchets in the same file (badge body, drawer projection, NUL escapes) remain and still fail their named drifts.

#### A1 — ADVISORY: ratchet does not pin every last render attribute

The DR-146 canvas ratchet pins **computation + function definition + maker strings**, not the literal JSX token `<V3ScoreBadges`. A hostile edit that kept the function and `v3Scores` assignment but removed the mount could, in principle, keep that one test green (tsc unused-locals depending on config). **Shipped source still mounts the component** (`:393–394`); this is fence strength, not a live survival failure. Likewise regen ratchets do not require the `disabled` attribute token — only presence of label + capability + no await call.

**Failing case that would re-open Q5 as BLOCKING:** a ratchet that can stay green while the described product behaviour is gone on the real path (not observed on shipped tree).

---

### Q6 — Control bytes + frozen formatter

**Binary-safe adapter inspection** (`apps/v2-ui/lib/v3/adapter.ts`):

| Check | Observed |
|---|---|
| raw `0x00` count | **0** |
| other C0 controls excl. TAB/LF/CR | **0** |
| escaped `\u0000` in source | **2** (identity-key join only) |
| `file(1)` | UTF-8 text (plain-grep safe) |

**Formatter** `v3ScorePercentage` (`adapter.ts:308–319`): still `value * 100` → nearest 0.01 pp → strip trailing zeroes → exact vs `≈` with recorded probability in detail. Live import this review:

| Input | text |
|---|---|
| `0.98` | `98%` |
| `0.88` | `88%` |
| `0.41000000000000003` | `≈41%` |
| `0.3333333333333333` | `≈33.33%` |
| `0` / `1` | `0%` / `100%` |

Author frozen hash `59049c36…a48a4` was **not** re-derived to a particular extraction boundary (same limit recorded in `ui02a-grok-rev2.md`); body + samples match the approved rule and the rework tree does not touch `adapter.ts` for this ticket. Card path still consumes only preformatted `badge.pillText` (no local `* 100` / `toFixed` in `V3ScoreBadges`).

---

## BLOCKING findings

None.

## ADVISORY findings

1. **A1 — Ratchet mount/`disabled` pin gaps** — `v2ui-pages.test.ts:254–278` (see Q5). Shipped render path is live; strengthen later if hostile-edit resistance is required.
2. **A2 — Dead `onQueued` success toast prop** — `DebatePageClient.tsx:1251–1253` still names “Regeneration queued” while drawer never calls it. Not user-reachable with disabled regen; tidy to avoid future re-wiring accidents.
3. **A3 — Visual gate not exercised here** — title readability at 1280px, overflow open at phone width, canvas pan/zoom feel, greyed control pixels → **V / DR-145** (packet).

---

## Independence / scope

- Read-only dual-diamond Grok lens; only this verdict file written under `reviews/`.
- Peer Opus / other-lens UI-01 rework verdict **not** read.
- Full orchestrator gate suite **not** re-run as substitute for render-path proof; orchestrator numbers treated as reported context only.
- No browser screenshots; no claim of pixel-complete visual sign-off.
