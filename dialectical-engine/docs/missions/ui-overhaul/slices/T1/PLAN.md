# PLAN — T1 Debate view — tree canvas

**Goal:** TURN 1 approved canvas: modes, bezel cards, stance tabs, synthesis.

**Spec:** `slices/T1/SPEC.md` v2

**Status:** ARCHITECTURE FILLED (ARCH-01, 2026-08-31). WHAT/acceptance columns
are Requirements' and unchanged; `HOW` blocks and commands are Architecture's.

**Architecture references:** `docs/missions/ui-overhaul/architecture/` —
`component-map.md` (T1 row), `token-inventory.md` (stance + gold),
`ADR-002-mode-mechanism.md`, `ADR-005-contrast-pins.md`,
`ADR-006-ui-test-contract.md`, `test-migration.md`, `dispatch-order.md`.

**Gated on T9-C3.** C2 and C3 both write `DebateCanvas.tsx` and are serialised
in numeric order.

**Already true in the shipped code — do not rebuild:** the literal strings
`Thread`, `Split`, `Tree`, `Map` (`DebatePageClient.tsx`, in
`div.debateTopControlRow > div.segment`); `Show set-aside paths` and
`↻ Regenerate` (`DebateCanvas.tsx`); the connector `<path stroke={c.color}>`
inside `svg.canvasLinks`; and `ROLE_PALETTES` in
`apps/ui/lib/debatePresentation.ts`, which already resolves pro/con to
`var(--pro-line)` / `var(--con-line)`. T1 is a token redefinition plus card
anatomy — not new rendering machinery.

## Quantifiability law

Same as T9/PLAN.md (literal strings/controls/markers in every acceptance cell;
one verification command per cluster; no bare `Assert`).

## Clusters

### T1-C1 — Chrome + views + mode

**Proves:** R1, R7

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C1-1 | R1 | Thread/Split/Tree/Map controls exist | Assert labels `Thread`, `Split`, `Tree`, `Map` present on owner debate canvas |
| T1-C1-2 | R1 | Activating each changes measurable view marker | Click each control; assert view marker/data-attribute differs per selection |
| T1-C1-3 | R7 | Mode toggle switches Terracotta/Chamber marker | Assert before/after mode marker differs after toggle |

**HOW (ARCH).**

- **Modify** `apps/ui/app/debate/[id]/DebatePageClient.tsx`: mount
  `<ModeToggle />` inside `<div className="debateTopControlRow">` as a
  **sibling of** the `{hasTree ? … : null}` conditional, never inside it. The
  view `segment` renders only when a tree exists; a toggle placed inside it
  vanishes on a debate that is still generating — and T1's own acceptance opens
  a debate that may be mid-generation. This is the second and last mount point
  in the mission (`ADR-002`).
- The four view labels already exist verbatim and each `<button>` already
  carries `aria-pressed={view === "…"}`. `T1-C1-2`'s "measurable view marker"
  is that existing `aria-pressed` attribute — assert it moves across the four
  buttons as `setView` is called. No new attribute is needed.
- `T1-C1-3`'s mode marker is `document.documentElement.dataset.mode`, read via
  `getPropertyValue` off the real stylesheet (`ADR-006`) — **not**
  `getComputedStyle(el).backgroundColor`, which returns transparent in this
  repo's jsdom for any `var()`-valued property.
- **Create** `tests/render/t1-canvas.test.tsx` with three `describe` blocks —
  `chrome and views` (C1), `card anatomy` (C2), `set-aside and synthesis` (C3).

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t1-canvas.test.tsx tests/render/load01-debate-page.test.tsx tests/render/bug02-debate-effects.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts
```

`pol01-policy` reads `DebatePageClient.tsx` as source text and
`pda-s02-affordance-drift` slices it with `between(startAnchor, endAnchor)` —
both READ the file this cluster WRITES, and anchor-based slicing is the classic
stale-anchor break.

### T1-C2 — Card anatomy + stance + connectors

**Proves:** R2, R3, R4

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C2-1 | R2 | Cards expose double-bezel + stance-tab markers ARCH documents | Assert bezel marker and stance-tab class/token present on ≥1 PRO and ≥1 CON card |
| T1-C2-2 | R3 | Card shows BASE and FINAL and Details control | Assert `BASE`, `FINAL`, and `Details ▸` (or ARCH-pinned Details control) on a card |
| T1-C2-3 | R3 | Owner card shows Regenerate control | Assert `↻ Regenerate` present on owner canvas card |
| T1-C2-4 | R4 | Connector elements carry stance color token/class | Assert PRO vs CON connector tokens/classes differ |

**HOW (ARCH).**

- **Modify** `apps/ui/components/DebateCanvas.tsx` card branch. The double
  bezel is two nested wrappers carrying
  `data-bezel="shell"` (outer, `background: var(--shell)`) and
  `data-bezel="core"` (inner, `background: var(--core)`), with
  `border-radius: var(--r-card)` and `box-shadow: var(--shadow-card)`.
- Stance tab: a 3px strip at the top of the card, `border-radius: var(--r-tab)`
  (`0 0 5px 5px`, the design's exact value, 15 occurrences in the export),
  `background: var(--pro-line)` / `var(--con-line)` / `var(--reasoning-line)`.
  The card root and the tab both carry
  `data-stance="pro" | "con" | "reasoning" | "root"` — that attribute is what
  makes `T1-C2-1`'s "≥1 PRO and ≥1 CON" a DOM query rather than a text search.
- **`--reasoning` is NOT gold in Terracotta.** The design's
  `accentsFor(false).reasoning` is `#3D5A80`, a slate blue; only
  `accentsFor(true).reasoning` is gold. The design's closing note *"gold is
  reserved for reasoning & verdict"* describes Chamber. A coder who reads only
  that sentence will paint light-mode REASONING chips gold and be wrong.
- Connectors: `apps/ui/lib/debatePresentation.ts` already sets
  `color: pal.line` per role. Add `stance` to the `Connector` type and emit
  `data-connector-stance={c.stance}` on the `<path>` in `svg.canvasLinks`.
  `T1-C2-4` then asserts the two `data-connector-stance` values resolve to
  different `--*-line` tokens — checkable in `renderToStaticMarkup` output with
  no browser.

  ```ts
  // apps/ui/lib/debatePresentation.ts
  export type Connector = {
    id: string; d: string; color: string; width: number; dash: string;
    opacity: number; stance: "pro" | "con" | "pov";   // ADDED
  };
  ```
- Card anatomy (`T1-C2-2`, `T1-C2-3`): type chip, model line, `BASE`/`FINAL`
  percents, `↻ Regenerate` (owner only, already conditioned on `publicMode`),
  and the Details control. Details opens T5 — its accessible name is
  `Details` and it carries the `▸` glyph as decoration, so assertions match
  `Details` and not the glyph.
- The compact review mark on the card face is `data-review="agreed" |
  "disputed" | "absent"` plus its coloured dot — the FULL
  `REVIEW AGREED BY:` line lives in the T5 drawer. This closes T1 SPEC OQ-1
  (`architecture/open-questions.md` Q-11).

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t1-canvas.test.tsx tests/render/ui02e-debate-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/unit/pol01-policy.test.ts
```

### T1-C3 — Set-aside + synthesis + publicMode

**Proves:** R5, R6, R8

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C3-1 | R5 | `Show set-aside paths` toggles visibility on a set-aside fixture | Required fixture: debate with ≥1 set-aside path; assert visible path/card count changes after toggle |
| T1-C3-2 | R6 | Synthesis/verdict strip labels present | Required fixture: debate with synthesis/verdict data; assert `↑ STRONGEST PRO` or `VERDICT` (or SPEC binding synthesis labels) present |
| T1-C3-3 | R8 | publicMode canvas locks Regenerate mutate path | Assert `↻ Regenerate` absent or disabled on publicMode mount; contrast threshold ARCH pins met |

**HOW (ARCH).**

- `Show set-aside paths` already exists in `DebateCanvas.tsx` and already drives
  `isSetAsidePath(node)` and `data-set-aside`. `T1-C3-1`'s required fixture is a
  tree with ≥1 set-aside path; the count assertion is on
  `[data-set-aside="true"]` node count before vs after the toggle. Re-skin only.
- **Modify** `apps/ui/components/SynthesisPanel.tsx` for the T1-S6 strip:
  `↑ STRONGEST PRO`, `↓ STRONGEST CON`, `VERDICT`, `Leans`. Gold
  (`var(--gold-text)`, not `var(--gold)`) is the verdict treatment — the
  text-role token, because gold-on-shell at the raw design hex measures
  2.94 : 1 and is not legible text (`ADR-005`).
- `T1-C3-3` publicMode: `↻ Regenerate` is already suppressed under
  `publicMode` in the shipped component. The assertion is that it is absent OR
  carries `data-public-locked="true"` — and the contrast half is the token
  floors from `ADR-005`, already proven by T9-C3-5, asserted here against the
  canvas's own text/surface pairs.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/t1-canvas.test.tsx tests/render/pda-s02-public-tree.test.tsx
```

### T1-C4 — Render-pin migration

**Proves:** R9

| Step | SPEC | WHAT | Acceptance |
|---|---|---|---|
| T1-C4-1 | R9 | ARCH names canvas/debate pins under `tests/render/` (incl. `ui02e-debate-canvas`) | Named list in DECISIONS or PLAN appendix |
| T1-C4-2 | R9 | Named tests pass against NEW UI (three runs) | Three-run vitest on the named `tests/render/**` files |

**HOW (ARCH) — the named pin files, `6 of 6`, from `architecture/test-migration.md`.**

| File | Class | What moves |
|---|---|---|
| `tests/render/ui02e-debate-canvas.test.tsx` | **RETARGET** | pins OLD card copy: `BASE 62%`, `FINAL 41%`, and the meta line `3 claims across 1 levels · 1 judged · 1 standing on their arguments · 1 set aside`. Update to the TURN 1 anatomy; add `data-bezel` / `data-stance` / `data-connector-stance` |
| `tests/render/ui02d-model-identity.test.tsx` | KEEP | asserts the `modelDot` class across 7 components — class name frozen (`ADR-006`) |
| `tests/render/bug02-debate-effects.test.tsx` | KEEP | error taxonomy and streamed-claim survival |
| `tests/render/load01-debate-page.test.tsx` | KEEP | progress semantics + `progressStrip` / `progressTrack` / `progressFillIndeterminate` — class names frozen |
| `tests/unit/pol01-policy.test.ts` | **RETARGET** | reads `DebatePageClient.tsx`, `DebateTree.tsx`, `NodeDetailDrawer.tsx`, `AuthGate.tsx` as source — 7 source reads across T1/T5's most-edited files. Highest-risk file in the mission |
| `tests/unit/pda-s02-affordance-drift.test.ts` | **RETARGET** | `between(start,end)` anchor slicing over `DebatePageClient.tsx` |

`ui02d`, `bug02` and `load01` are KEEP **because** class names are not renamed.
A cluster that believes it must rename one files a finding; it does not rename
and repair the test in the same breath, because that is how an assertion gets
rewritten to match the bug.

**Cluster verification command:** run three times, worst run is the verdict.

```
pnpm exec vitest run tests/render/ui02e-debate-canvas.test.tsx tests/render/ui02d-model-identity.test.tsx tests/render/bug02-debate-effects.test.tsx tests/render/load01-debate-page.test.tsx tests/unit/pol01-policy.test.ts tests/unit/pda-s02-affordance-drift.test.ts
```

## SPEC ↔ PLAN trace (both directions)

| SPEC | Covered by | | Step | Traces to |
|---|---|---|---|---|
| R1 | T1-C1-1, T1-C1-2 | | T1-C1-1 | R1 |
| R2 | T1-C2-1 | | T1-C1-2 | R1 |
| R3 | T1-C2-2, T1-C2-3 | | T1-C1-3 | R7 |
| R4 | T1-C2-4 | | T1-C2-1 | R2 |
| R5 | T1-C3-1 | | T1-C2-2 | R3 |
| R6 | T1-C3-2 | | T1-C2-3 | R3 |
| R7 | T1-C1-3 | | T1-C2-4 | R4 |
| R8 | T1-C3-3 | | T1-C3-1 | R5 |
| R9 | T1-C4-1, T1-C4-2 | | T1-C3-2 | R6 |
| | | | T1-C3-3 | R8 |
| | | | T1-C4-* | R9 |

9 of 9 requirements covered; 12 of 12 steps trace.

## Refutation (ARCH)

| Cluster | Mutant its command detects | Mutant it does NOT detect |
|---|---|---|
| T1-C1 | a view button that no longer moves `aria-pressed`; the toggle placed inside `{hasTree ? …}` so it disappears mid-generation; `pol01`/`affordance-drift` anchors broken by the JSX edit | a view button whose `aria-pressed` moves but which renders the WRONG view — the marker and the rendered subtree are asserted separately, not cross-checked |
| T1-C2 | a single-layer card (no `data-bezel="core"`); a stance tab with no colour token; both connector classes resolving to the same token; light-mode REASONING painted gold | a stance tab whose colour token is right but whose *position* is wrong (bottom instead of top) — no step asserts geometry |
| T1-C3 | a set-aside toggle that changes nothing; a synthesis strip missing its labels; `↻ Regenerate` actionable in publicMode | a set-aside toggle that changes the count in the WRONG direction — the assertion is `before ≠ after`, deliberately, because the fixture's direction is not fixed |
| T1-C4 | any of the six standing files going red from the T1 diff | a standing file already red before T1 |
