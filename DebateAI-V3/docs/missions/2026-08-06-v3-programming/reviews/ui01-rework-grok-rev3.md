# UI-01 rework dual-diamond review — Grok lens (rev3)

**Ticket:** `t_5f35d086` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff `handoffs/UI-01-rework-codex-handoff.md`  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev3)  
**Date:** 2026-08-12  
**Contracts read in full before judging (not handoff alone):**  
- `reviews/UI-01-rework-rev3-directive.md` (B1/B2 closed; B4 phone regression + B5 hollow DR-160 ratchet)  
- `reviews/ui01-rework-opus-rev2.md` (Opus CHANGES REQUESTED; live DOM + live mutation evidence for B4/B5)  
- Prior Grok format reference: `reviews/ui01-rework-grok-rev2.md`  
**Handoff treated as hypothesis:** `handoffs/UI-01-rework-codex-handoff.md` (rev3 claims; not sole proof)

**Inputs verified against shipped source (not handoff trust):**  
`apps/v2-ui/app/globals.css` (phone `@media (max-width: 640px)` block + collapsed overflow CSS),  
`apps/v2-ui/lib/debateHeaderOverflow.ts` (intrinsic width, full geometry measure, observer adapter),  
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` (measurement + `observeDebateHeaderFit` wiring),  
`tests/unit/v2ui-pages.test.ts` (enforced B4/B5/MUT-E/G/F/H killers),  
`vitest.config.ts` (root include remains `tests/**/*.test.ts`).

**Mode:** read-only product tree. This seat wrote only this verdict file plus local scratch mutation probes (md5-restored after each). No product code edits left in tree, no git mutations, no board mutations. **No live browser DOM** in this environment (same honest limit the handoff records). B4 “real phone widths with a NORMAL question” is judged from restored phone CSS + intrinsic measurement + enforced phone geometry, not from inventing pixels.

## Verdict

**APPROVED**

Rev3 **closes both remaining Opus rev2 blockers** under the contracts above. B1 and B2 remain closed (spot-checked; not re-litigated).

| Blocker | Result | One-line proof |
|---|---|---|
| **B4** phone clip of top-bar actions with NORMAL title | **PASS** | Phone block restores `.debateInlineActions{display:none}` + `.debateOverflow{display:block}`; measurement uses `scrollWidth` (not post-squeeze rect); enforced 420px/NORMAL geometry → `{needed:628, collapse:true}` |
| **B5** hollow DR-160 ratchet (MUT-E/G/F/H survived) | **PASS** | Enforced suite executes production `measureDebateHeaderCollapse` / `observeDebateHeaderFit`; independent live mutations all **KILLED**; baseline **38/38** green |
| **B1** / **B2** (rev2 closed) | **PASS (spot)** | Compact adaptive mount + disabled Approve still present; MUT-A/B/C use-site assertions still in enforced suite |

Residual notes below are **ADVISORY only**. Visual final remains V’s eye under DR-145.

---

## B4 — Phone-width top-bar actions no longer clip with a NORMAL question — **PASS**

### What rev2 found (Opus)

At ≤~640px with a short/normal question (`"Should the test question stand?"`, ~193px natural title), four of five top-bar actions laid out **outside the viewport**, overflow stayed `display:none`, `data-actions-collapsed` stayed `"false"`. Two causes:

1. Ported phone CSS kept `grid-template-columns: minmax(0,1fr) 44px 44px` but **dropped** V2’s `.debateInlineActions{display:none}` and `.debateOverflow{display:block}`.
2. Measurement used `getBoundingClientRect().width` on already-shrunk flex/grid children, so need could never exceed allotment (needed ≡ available while true content scrollWidth was ~612px).

Long questions collapsed by accident; normal ones lost Settings / Replay / Honesty / How-it-works.

### What rev3 ships

1. **Phone CSS restore** — `apps/v2-ui/app/globals.css` `@media (max-width: 640px)`:

```css
.debateInlineActions {
  display: none;
}
.debateOverflow {
  position: relative;
  display: block;
  width: 44px;
}
```

Grid three-column phone layout remains (`minmax(0,1fr) 44px 44px`). With the two rules restored, the third column is the overflow affordance, not a 44px funnel for the full inline action row. **User-visible clip at phone is closed by CSS even if `data-actions-collapsed` were false.**

2. **Intrinsic need measurement** — `lib/debateHeaderOverflow.ts`:

```ts
export function debateHeaderElementIntrinsicWidth(element: IntrinsicWidthElement): number {
  return Math.max(element.scrollWidth, element.getBoundingClientRect().width);
}
```

`measureDebateHeaderCollapse` builds complete identity + control need (title intrinsic, claim/identity fixed widths, control intrinsic widths, gaps, padding; stacked vs row), then decides `neededWidth > availableWidth`. Client maps live DOM through that helper:

- `titleIntrinsicWidth: debateHeaderElementIntrinsicWidth(titleMeasure)`
- `controlIntrinsicWidths: controlChildren.map(debateHeaderElementIntrinsicWidth)`
- `availableWidth: header.clientWidth`

3. **Enforced phone geometry with NORMAL title** — test title  
   `kills B4 shrunk-rect regression and MUT-E neededWidth=0 through intrinsic phone geometry`:

   - `debateHeaderElementIntrinsicWidth({ scrollWidth: 252, rect: 44 }) === 252` (not 44)
   - Geometry: available **420**, layout **stacked**, title **193** (NORMAL), controls **[300, 44, 252]**
   - Arithmetic: claim 265 · identity 317 · controls 612 · needed **628** → `collapse: true`
   - Exact expect: `{ neededWidth: 628, availableWidth: 420, collapse: true }`

   That is the Opus live failure shape (420px viewport, short title, ~612px true control content) as an executable gate on the production measure function.

4. **Wiring pin** — same suite’s DR-160 source test requires the phone media block to contain both hide/show rules, and requires client use of `measureDebateHeaderCollapse` + `debateHeaderElementIntrinsicWidth` + `observeDebateHeaderFit({ targets: [header, titleMeasure, inlineActions] })`.

### Env limit

No connected browser here. Dual-diamond does **not** invent live hit-tests. Source + enforced geometry are sufficient for the B4 contract as written; Hermes/V should still eyeball normal and long titles at 640px under DR-145.

**Failing case that would reopen B4:** drop the phone hide/show pair while also reverting to rect-only measurement; or change the phone geometry expect so a shrunk-rect path (needed ≤ available at 420 with 252 of true action content) stays green.

---

## Intrinsic measurement vs post-squeeze rect — **PASS**

| Question | Answer | Proof |
|---|---|---|
| Does need-measurement read **intrinsic** content width? | **Yes** | `debateHeaderElementIntrinsicWidth` = `Math.max(scrollWidth, rect.width)` |
| Is post-squeeze rect still the sole signal? | **No** | Rect is fallback only; scrollWidth 252 wins over rect 44 in the enforced probe |
| Is complete identity/control need built before compare? | **Yes** | `measureDebateHeaderCollapse` sums title + fixed chrome + control intrinsics + gaps + padding, then compares to `availableWidth` |
| Client still sum shrunk child rects inline? | **No** | `DebatePageClient` delegates to the adapter with intrinsic-mapped children |

This is the structural fix Opus required so action overflow is detectable when flex/grid has already crushed children.

---

## B5 — MUT-E / MUT-G / MUT-F / MUT-H each killed by named enforced assertions — **PASS**

### What rev2 found (Opus)

The enforced test titled like a DR-160 behaviour ratchet only unit-called the three-line predicate `shouldCollapseDebateHeaderActions`. Four production mutations kept the predicate, `ResizeObserver` symbols, and `data-actions-collapsed` attribute, and the suite stayed **35/35 green**. MUT-E applied live reproduced the crushed long title at 1280px.

### What rev3 ships (named enforced tests)

| Mutation | Enforced test title | What the assertion executes |
|---|---|---|
| **MUT-E** `neededWidth = 0 * (…)` | `kills B4 shrunk-rect regression and MUT-E neededWidth=0 through intrinsic phone geometry` | Real `measureDebateHeaderCollapse` on 420px/NORMAL phone geometry must return `{ neededWidth: 628, …, collapse: true }` |
| **MUT-G** title intrinsic × 0 | `kills MUT-G title width x0 and MUT-F always-collapse through the measurement path` | Crowded title 880 at 1280 must `collapse === true` |
| **MUT-F** always collapse / neededWidth huge | same test (paired) | Normal title 193 at 1280 must `collapse === false` |
| **MUT-H** observers + resize listener removed | `kills MUT-H observer and resize-listener removal through the observation seam` | Real `observeDebateHeaderFit` must observe all three targets, attach a callable resize listener, and clean up |

Predicate boundary remains as a **supporting** pin only (`keeps the ruled predicate boundary exact`) and is **not** presented as the DR-160 measurement/wiring ratchet — matching the rev3 directive.

### Independent kill evidence (this session)

Baseline (unmutated product tree):

```text
$ pnpm vitest run tests/unit/v2ui-pages.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests  38 passed (38)
```

Each mutation applied in-place to `apps/v2-ui/lib/debateHeaderOverflow.ts`, suite re-run, file restored (md5 match verified after the set):

| Mutation applied | Suite result | Killing assertion / test |
|---|---|---|
| **MUT-E** `neededWidth: 0 * (contentWidth + padding)` | **2 failed / 36 passed** → **KILLED** | `kills B4 … MUT-E …` (needed 0 vs 628; collapse false) **and** crowded-title row of MUT-G/F test |
| **MUT-G** `0 * geometry.titleIntrinsicWidth` in claim width | **1 failed / 37 passed** → **KILLED** | `kills MUT-G title width x0 and MUT-F always-collapse…` (880px title stays expanded) |
| **MUT-F** `collapse: true` always | **1 failed / 37 passed** → **KILLED** | same test, normal-title expansion row (193px must stay expanded) |
| **MUT-F** alt Opus form `neededWidth: 1e9 + …` | **2 failed / 36 passed** → **KILLED** | phone exact `{neededWidth:628}` **and** normal-title expansion |
| **MUT-H** no `observe` / no resize listener | **1 failed / 37 passed** → **KILLED** | `kills MUT-H observer…` (`observed` stays `[]`) |

Post-restore baseline re-green: **38 passed (38)**. Working tree md5 for the three ship files matches pre-probe baseline.

This is **not** handoff trust: the same real `pnpm vitest run tests/unit/v2ui-pages.test.ts` against the real module, restored after each.

**Failing case that would reopen B5:** delete or weaken the measure/observe tests so only the pure predicate remains; or keep string `toContain("measureDebateHeaderCollapse")` without executing the adapter on mutant geometry.

---

## Spot-check — B1/B2 stay closed; A8/A9/A11 fold context — **PASS (advisory residual only)**

| Item | Rev3 status |
|---|---|
| **B1** compact `AdaptiveDepthDryRunPanel` + disabled Approve + visible reason | Still enforced: compact region via `data-scoring-insights-compact="true"`; unavailable button block pins `disabled` / `aria-disabled` / capability / `adaptiveDepthActionMessage` |
| **B2** MUT-A/B/C use-site killers | Still in enforced suite (nodeHeader badges/meta; Regenerate button blocks with no `onClick`) |
| **A8** Approve overlaps reason at ≤640px | Folded in CSS: `.scoringInsightsPanelCompact > .progressStrip { height: auto; flex-wrap: wrap; … }` under 640px; enforced by regex in the same disabled/adaptive test |
| **A9** handoff AC over-claims | Handoff table now separates rev2 false phone/ratchet claims from rev3 code/test proof and **HONESTLY PENDING** browser row — matches directive |
| **A11** whitespace-fragile ternary anchor | Compact region now anchors on stable `data-scoring-insights-compact="true"` |
| **A7** 520px title cap | Still V’s call at visual gate (not reopened here) |
| **A10** non-UUID API crash | Still out of lane (POL-02) |
| Live browser for rev3 B4/A8 | **Honestly pending** Hermes/V — dual-diamond does not fake it |

---

## Decision table (rev3 blockers only)

| # | Question | Result | Concrete proof |
|---|---|---|---|
| **B4** | Dead at real phone widths with a NORMAL-length question? | **PASS** | Phone CSS hide/show restored (`globals.css` 640px block); intrinsic phone geometry enforced (193 title → needed 628 vs 420 → collapse); no live DOM this seat — visual residual for Hermes/V |
| **Measurement** | Reads intrinsic content width, not post-squeeze rect? | **PASS** | `debateHeaderElementIntrinsicWidth` prefers `scrollWidth`; client maps children through it; probe 252 vs 44 |
| **MUT-E** | Killed by named enforced assertion? | **PASS / KILLED** | `kills B4 … MUT-E …` → 2 failed when `neededWidth × 0` |
| **MUT-G** | Killed by named enforced assertion? | **PASS / KILLED** | `kills MUT-G … MUT-F …` crowded title row → 1 failed when title × 0 |
| **MUT-F** | Killed by named enforced assertion? | **PASS / KILLED** | same test normal-title row (and/or phone exact need for 1e9 form) |
| **MUT-H** | Killed by named enforced assertion? | **PASS / KILLED** | `kills MUT-H observer…` → 1 failed when observes nothing |
| **Baseline** | Unmutated enforced suite green? | **PASS** | 38/38 before and after mutation probes |

---

## Contract compliance

- Rev3 directive, Opus rev2, and Codex handoff **read end-to-end**; handoff used only as hypothesis.
- B1/B2 not re-opened; A7/A10 left to their recorded owners.
- Independent mutation kills + baseline green required; both obtained with real vitest and md5-verified restores.
- No product fixes from this seat; no board/ticket mutations.
- Dual diamond approval only → still goes to **V’s eye** (DR-145) for live phone/desktop pixels.

**Top line again: APPROVED.**
