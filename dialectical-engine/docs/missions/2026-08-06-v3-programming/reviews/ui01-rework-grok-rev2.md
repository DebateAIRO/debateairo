# UI-01 rework dual-diamond review — Grok lens (rev2)

**Ticket:** `t_5f35d086` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff `handoffs/UI-01-rework-codex-handoff.md`  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev2)  
**Date:** 2026-08-12  
**Contracts read in full before judging (not handoff alone):**  
- `reviews/UI-01-rework-review-packet.md` (DR-153 dual diamond; V visual is final under DR-145)  
- `reviews/UI-01-rework-rev2-directive.md` **including ADDENDUM DR-160** (content-aware collapse; no fixed breakpoint)  
**Blocker text cross-check:** `ui01-rework-opus-rev1.md` (B1–B3 as found by live DOM + mutation) and this seat’s `ui01-rework-grok-rev1.md` (rev1 APPROVED; Opus found what static review missed).

**Inputs verified against shipped source (not handoff trust):**  
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx`,  
`apps/v2-ui/lib/debateHeaderOverflow.ts`,  
`apps/v2-ui/app/globals.css`,  
`apps/v2-ui/components/DebateCanvas.tsx`,  
`apps/v2-ui/components/{DebateTree,DebateThread,NodeDetailDrawer}.tsx`,  
`apps/v2-ui/lib/api.ts`,  
`apps/v2-ui/lib/v3/{adapter,missingCapabilities}.ts`,  
`apps/v2-ui/app/settings/page.tsx`,  
`tests/unit/v2ui-pages.test.ts`,  
`vitest.config.ts` (`include: ["tests/**/*.test.ts"]`).

**Mode:** read-only product tree. This seat wrote only this verdict file plus local scratch mutation probes. No product code edits, no git mutations, no board mutations. Did not re-run the full orchestrator matrix. **No live browser DOM** in this environment (same honest limit the handoff records); B1 rests on unambiguous V3 compact-branch mount + disabled Approve block source proof, plus enforced suite assertions that kill an unmount mutation.

## Verdict

**APPROVED**

Rev2 **closes all three Opus rev1 blockers** under the contracts above:

| Blocker | Result | One-line proof |
|---|---|---|
| **B1** adaptive-depth Approve hidden | **PASS** | Compact V3 scoring branch mounts `AdaptiveDepthDryRunPanel`; unavailable state paints disabled Approve + visible capability copy |
| **B2** enforced ratchets could not fail | **PASS** | MUT-A/B/C assertions live in `tests/unit/v2ui-pages.test.ts` (root vitest include); independent in-memory mutants all **KILLED** |
| **B3** / **DR-160** overflow | **PASS** | Collapse is `neededWidth > availableWidth` (no breakpoint rule); wired via `useLayoutEffect` + `ResizeObserver`; MUT-D progression enforced |

Prior rev1 merge goods (UI-02a badges, UI-02b maker tags, canvas/viewport shape, adapter cleanliness) remain intact under source spot-check. Advisories A3–A6 are folded or recorded; A1/A2 remain HYG-01. Residual notes below are **ADVISORY only**.

---

## B1 — Adaptive-depth Approve reachable and greyed on V3 path — **PASS**

### What rev1 found (Opus)

`scoringInsightsExpandable` required V2 scoring `loaded` with `>0` nodes. V3’s `getDebateScoring` always resolves `scoringUnavailable`, so the only mount of disabled “Approve selected expansions” sat in a **dead expandable branch**. Live DOM: **zero** `/Approve/` buttons.

### What rev2 ships

1. **V3 still never expands scoring insights** (correct typed absence):

   - `api.ts:167–168` — `getDebateScoring` → `Promise.resolve(scoringUnavailable(id))`
   - `DebatePageClient.tsx:1013` — `scoringInsightsExpandable = scoringState.status === "loaded" && scoringByNodeId.size > 0`  
     With status `"unavailable"` and empty index, this stays **false**.

2. **Compact branch always mounts the panel when expandable is false** (the V3 steady path):

   - `:1184–1205` — `else` of `scoringInsightsExpandable` renders  
     `section.scoringInsightsPanelCompact` with `data-scoring-insights-compact="true"`  
     **and** `<AdaptiveDepthDryRunPanel enabled={true} state={adaptiveDepthDryRunState} />` at `:1201–1204`.

3. **Adaptive dry-run is also typed absence**, so the panel’s **unavailable** branch is V3 steady state after the microtask resolve:

   - `api.ts:171–172` — `getDebateAdaptiveDepthDryRun` → `adaptiveDepthUnavailable(id)`
   - `:412–418` loads that into state via `adaptiveDepthDryRunStateFromPayload` → `status: "unavailable"`
   - `AdaptiveDepthDryRunPanel` unavailable branch `:1714–1731`:

```tsx
<button
  type="button"
  className="btn btnDark"
  disabled
  aria-disabled="true"
  title={V3_MISSING_CAPABILITIES.adaptiveDepthApproval}
>
  Approve selected expansions
</button>
<span className="progressCount adaptiveDepthActionMessage">
  {V3_MISSING_CAPABILITIES.adaptiveDepthApproval}
</span>
```

Capability string (`missingCapabilities.ts:11`):  
`"V3 exposes no adaptive-depth approval resource."` — real missing capability, not a generic “unavailable”, not a fake refusal dialog. **A6 folded:** reason is **visible copy**, not tooltip-only.

4. **Enforced suite pins reachability**, not only definition:

   - `tests/unit/v2ui-pages.test.ts:335–345` slices the **compact** `) : ( <section …` region and requires `<AdaptiveDepthDryRunPanel` + `enabled={true}`; then slices the panel’s unavailable branch and requires the disabled Approve button block + `adaptiveDepthActionMessage` + no `await approveDebateAdaptiveDepthExpansion(`.

5. **Independent unmount mutant:** removing only the compact mount leaves the function definition and expandable-branch mount; the compact-region assertion fails → **KILLED** (see mutation table).

### Env limit

No connected browser here. Opus rev1’s zero-`/Approve/` live failure is closed **by source path**: the V3 compact branch is the always-taken branch, and that branch now mounts the greyed control. Hermes/V may still eyeball the live surface under DR-145; that is visual final gate, not a reopening of this dual-diamond blocker on source evidence.

**Failing case that would reopen B1:** drop compact `<AdaptiveDepthDryRunPanel …/>` while leaving the function and/or expandable-only mount; or paint Approve only when `status === "loaded"` with plan items (V3 never loads a plan).

---

## B2 — Enforced ratchets kill MUT-A / MUT-B / MUT-C — **PASS**

### What rev1 found (Opus)

Load-bearing `disabled` assertions lived only in `*.source-test.mjs` files **no gate runs**. Root vitest includes `tests/**/*.test.ts` only (`vitest.config.ts:5`). v2-ui `package.json` still points at missing `scripts/run-node-tests.mjs` (A1 / HYG-01 — still true; **not fixed here**, correctly). In the enforced suite, three Opus mutants **all stayed green**.

### What rev2 ships (assertions in the suite that runs)

| Mutation | Enforced test | Asserts the **use site** |
|---|---|---|
| **MUT-A** delete `<V3ScoreBadges>` JSX (keep `function V3ScoreBadges`) | `v2ui-pages.test.ts:278–282` | Slices contentful `.nodeHeader` through `{independencePill ? (`; requires `"<V3ScoreBadges"` + `presentation={v3Scores}` |
| **MUT-B** re-enable Regenerate, keep tooltip | `:308–319` | Every `<button>…Regenerate` block in canvas/thread/tree/drawer must match `\bdisabled\b`, `aria-disabled="true"`, `V3_MISSING_CAPABILITIES.nodeRegeneration`, and **no** `onClick=`; no `await regenerateNode(` |
| **MUT-C** delete maker meta line from contentful header | `:284–287` | Same contentful header slice requires conditional `metaLine` + `modelDot` + `{model.name}` |

Declaration-only pin still exists at `:273` (`toContain("function V3ScoreBadges")`) but is **no longer the sole fence** — MUT-A’s render-site slice is the load-bearing killer.

### Independent kill evidence (this session)

Baseline enforced suite:

```text
$ pnpm vitest run tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests  35 passed (35)
```

In-memory mutants against the **same assertion helpers** the enforced suite uses (working tree untouched):

```text
MUT-A delete V3ScoreBadges render: baseline=true mutant=false => KILLED
MUT-B re-enable Regenerate, keep tooltip: baseline=true mutant=false => KILLED
MUT-C delete maker meta line: baseline=true mutant=false => KILLED
B1 unmount compact adaptive panel: baseline=true mutant=false => KILLED
DR-160 crowded bar returns expanded (always false): baseline=true mutant=false => KILLED
DR-160 inverted comparison: baseline=true mutant=false => KILLED
```

MUT-A specifically keeps `function V3ScoreBadges` and still fails the nodeHeader render-site check — the exact rev1 loophole.

**Failing case that would reopen B2:** move these pins back into unrun `*.source-test.mjs` only; or re-widen MUT-A to declaration-only; or assert regen “disabled” only via test title without inspecting the button attribute block.

---

## B3 / DR-160 — Content-aware collapse + MUT-D — **PASS**

### Ruling (ADDENDUM; not re-litigated)

DR-160: overflow engages **whenever the title lacks the room it needs, at any width** — not a fixed 640/920/1440 breakpoint. AC-76: the rule **is** the ruled value; cite DR-160. Enforced test must fail when a crowded bar stops collapsing.

### What rev2 ships

1. **Pure decision** — `lib/debateHeaderOverflow.ts:7–8`:

```ts
export function shouldCollapseDebateHeaderActions(_fit: DebateHeaderFit): boolean {
  return _fit.neededWidth > _fit.availableWidth;
}
```

No magic pixel threshold in this module. Independent cases: needed 526 vs available 34 → collapse; vs 159 → collapse; vs 526 → expand; any-width crowding (`201 > 200`) → collapse.

2. **Measurement wiring** — `DebatePageClient.tsx:748–811` `useLayoutEffect`:

   - Off-layout title measure span (`debateTopTitleMeasure`, CSS `:1054–1060` absolute / `visibility: hidden` / `width: max-content`)
   - Sums title natural width + fixed claim/identity chrome + control-row chrome + header padding → `neededWidth`
   - Compares to `header.clientWidth` via `shouldCollapseDebateHeaderActions`
   - Re-runs on `ResizeObserver` (header, title measure, inline actions) + `window.resize`
   - Sets `data-actions-collapsed={…}` on the debate root (`:1022`)

3. **CSS is state-driven, not breakpoint-selected for overflow:**

   - Default: `.debateOverflow { display: none }` (`globals.css:1112–1114`)
   - Collapsed: `[data-actions-collapsed="true"]` hides `.debateInlineActions` and shows `.debateOverflow` (`:1116–1127`)
   - Remaining `@media (max-width: 640px)` / `920px` blocks adjust phone chrome (padding, brand text, two-row bar) — they **do not** set overflow visibility or `data-actions-collapsed`. Fixed **640px overflow collapse is gone** as the DR-160 rule.

4. **Enforced tests:**

   - `:289–300` — pins import/use of `shouldCollapseDebateHeaderActions`, `ResizeObserver(measureHeaderFit)`, `data-actions-collapsed`, state-driven CSS hide/show, and residual phone 920px two-row layout
   - `:302–306` **MUT-D** — executes the real imported pure function:

```ts
expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 34 })).toBe(true);
expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 159 })).toBe(true);
expect(shouldCollapseDebateHeaderActions({ neededWidth: 526, availableWidth: 526 })).toBe(false);
```

Returning expanded for either crowded case **fails**. That is the 34 → 159 → full progression DR-160 ordered, as an executable gate.

### Env limit

Full browser resize at 1280px was not re-driven here. Per review plan, pure decision + wiring pins are the honest bar without a browser; MUT-D fails when the decision stops collapsing a crowded bar. Live “title gets its room” pixels remain V’s DR-145 eye.

**Failing case that would reopen B3:** restore a sole `@media (max-width: Npx)` as the collapse rule; hard-code `shouldCollapse…` to `false` / invert the comparison; drop `ResizeObserver` / `data-actions-collapsed` wiring while leaving the pure helper green only in isolation (wiring test would still catch the drop).

---

## Spot-check — rev1 merge goods not silently broken — **PASS (advisory residual only)**

| Good | Rev2 status |
|---|---|
| UI-02a `<V3ScoreBadges … presentation={v3Scores}>` in contentful header | Still at `DebateCanvas.tsx:389–391`; MUT-A now fences the mount |
| UI-02b maker `modelDot` + `{model.name}` | Still at `:376–379`; MUT-C fences the branch |
| `v3NodesById` client → canvas | Still wired; canvas props/score path unchanged for B1/B3 work |
| `onRegenNode` dead prop (A4) | **Gone** from `DebateCanvas` |
| A3 DebateTree regen on abandoned/token-less | Gated again: `token && !isAbandonedNode(node)` (`DebateTree.tsx:179–190`) |
| A5 `data-node-id` | Present (`DebateCanvas.tsx:286`); intentional V3 inspection hook — recorded |
| Adapter raw NUL / control bytes | **0** raw NUL in `adapter.ts` this session |
| A1 dead v2-ui test runner / A2 stale api.test.mjs | Still HYG-01; assertions that matter are in root vitest, not the dead runner |

---

## Advisories (not gates)

| ID | Status |
|---|---|
| **A1** dead `apps/v2-ui` `scripts/run-node-tests.mjs` | Recorded for HYG-01 — not fixed in UI-01 |
| **A2** stale dormant `lib/api.test.mjs` | Recorded for HYG-01 |
| **A3** DebateTree regen visibility | Folded (token + non-abandoned) |
| **A4** dead `onRegenNode` on canvas | Folded (removed) |
| **A5** name `data-node-id` in adaptation list | Recorded; attribute still present |
| **A6** visible adaptive reason | Folded (`adaptiveDepthActionMessage` prints capability) |

**ADVISORY (ratchet class, not B2 reopen):** MUT-D and the DR-160 wiring test are complementary — one executes the pure function, the other pins measurement/CSS strings. A hostile edit that keeps both strings and the pure helper but breaks DOM measurement arithmetic inside `measureHeaderFit` would need browser or a richer unit with mocked geometry to catch. That is the same class of residual fence strength noted in rev1 for other source ratchets; it does **not** restore a fixed breakpoint or leave crowded-bar collapse untested at the decision layer DR-160 named.

**ADVISORY:** No live-DOM re-proof of Approve count or title width at 1280px in this seat. Source + enforced suite + independent mutants are sufficient for dual-diamond rev2 under the written plan; V still owns visual final (DR-145).

---

## Decision table (rev2 blockers only)

| # | Question | Result | Concrete proof |
|---|---|---|---|
| **B1** | Panel reachable and greyed on V3 compact path? | **PASS** | Compact mount `:1201–1204`; unavailable Approve `:1719–1730`; scoring/adaptive API always unavailable; enforced compact slice `:335–345` |
| **B2** | Each enforced assertion kills its named mutation? | **PASS** | MUT-A/B/C in `v2ui-pages.test.ts:278–319`; suite is root vitest `tests/**/*.test.ts`; independent mutants KILLED |
| **B3** | Content-aware collapse at any width + test fails if crowded stops collapsing? | **PASS** | `debateHeaderOverflow.ts` needed>available; measure+ResizeObserver `:748–811`; CSS via `data-actions-collapsed`; MUT-D `:302–306` |

---

## Contract compliance

- Review packet + rev2 directive **including DR-160 addendum** read end-to-end and used as the judgment contract.
- Handoff treated as hypothesis; verdict re-derived from source + enforced suite + independent mutation probes.
- No product fixes, no gate rewrites, no board/ticket mutations from this seat.
- Dual diamond approval only → still goes to **V’s eye** (DR-145), not “done.”

**Top line again: APPROVED.**
