# UI-02d dual-diamond review — Grok lens (rev1)

**Ticket:** `t_94ac4a9d` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff `handoffs/UI-02d-codex-handoff.md` / goal packet `goal-packets/UI-02d-codex-goal.md`  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev1)  
**Date:** 2026-08-13  
**Scope law:** DR-165(2) (exact model id SHOW) + UI-02c advisories A-4 / A-5 / A-7 terminal pins; DR-115 (verbatim recorded id, never inferred from family hash); DR-153 dual diamond.

**Inputs verified against shipped source (not handoff trust):**  
`apps/v2-ui/lib/makerIdentity.ts` (`makerIdentityLabel` pure seam),  
`apps/v2-ui/lib/models.ts` (`modelMeta` / family name only — never rewrites the recorded id),  
`apps/v2-ui/components/ModelPresentation.tsx` (`ModelMetaLine` / `ModelBadge` + absence `aria-label`),  
`apps/v2-ui/components/{DebateTree,DebateThread,DebateOutline,DebateSplit,DebateMap,NodeDetailDrawer}.tsx` (eight primary maker call sites),  
`tests/render/ui02d-model-identity.test.tsx` (six real-render surface pins + accessible absence),  
`tests/unit/v2ui-pages.test.ts` (per-function render ratchet + eight-call-site source floor),  
`tests/unit/v2ui-data-layer.test.ts` (typed absence equality + two-house pure seam),  
`apps/v2-ui/lib/v3/adapter.ts` (`v3ScorePercentage` frozen formatter — attribution only),  
root `vitest.config.ts` `include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]`.

**Mode:** read-only product tree except temporary mutation probes (exact-id drop, tree maker drop, adversarial `{label.text}` transplant, both absence `aria-label` removals). Each mutation was applied alone, observed RED, and **fully restored**; post-restore focused suite **100/100 GREEN**. No git mutations, no board mutations. Did **not** read any peer Opus UI-02d verdict.

## Verdict

**APPROVED**

All six packet / DR-165(2) gates pass on shipped source plus independent mutation / collection evidence re-run this seat. Rendered card text carries **house · friendly family · VERBATIM recorded `model_id`** through the single `makerIdentityLabel` seam (example `OpenAI · GPT · gpt-5.6-sol`); the six previously-unpinned maker surfaces are pinned with real-render killers plus an eight-call-site source floor; the render ratchet is scoped per function body so a cross-function transplant fails; both shared absence pills expose `aria-label`; `vitest list` enumerates all seven UI-02d render tests under the root include; typed absence (`maker === null` → `{ text: "House unavailable", absence: true }`) and the frozen `v3ScorePercentage` formatter were not rewritten for this ticket. Residual notes below are **ADVISORY** only.

---

## Decision table (six gates)

| # | Gate | Result | Source / mutation proof |
|---|---|---|---|
| **1** | Rendered card text = house · family · **VERBATIM** `model_id` via single `makerIdentityLabel` seam (DR-165(2) / DR-115) | **PASS** | Seam appends recorded `modelId` bytes (`[modelName, modelId]` when friendly ≠ id; `[modelId]` when equal — no de-dup rewrite of a distinct id). Probe: `makerIdentityLabel({ maker: "OpenAI", modelId: "gpt-5.6-sol" })` → `"OpenAI · GPT · gpt-5.6-sol"`. Real-render suite asserts that exact string + `data-maker="OpenAI"` on tree/thread/outline/split/map/drawer. Mutation drop of verbatim id from composition → **6 failed / 1 passed** (all six surfaces received `OpenAI · GPT` only). Seam does not call `modelKey` / invent id from family hash. |
| **2** | Six surfaces (tree/thread/outline/split/map/drawer; 8 call sites) pinned — drop `maker={…}` goes RED | **PASS** | Real-render: six named tests in `ui02d-model-identity.test.tsx` invoke real components and require identity text + `data-maker`. Source floor: `v2ui-pages.test.ts` UI-02d describe pins exact JSX strings with counts 1/1/1/2/1/2. This seat: drop tree `maker={node.maker}` → named tree render **RED** (no `OpenAI · GPT · gpt-5.6-sol`) **and** eight-site source pin **RED**. Shipped call sites audited: Tree L152, Thread L179, Outline L63, Split L126+L301, Map L165, Drawer L202+L290. |
| **3** | Render ratchet scoped per function — adversarial transplant fails | **PASS** | `routes ModelMetaLine and ModelBadge through makerIdentityLabel` slices `ModelMetaLine` body vs `ModelBadge` body and requires **exactly one** `makerIdentityLabel({ maker, modelId })` and **exactly one** `{label.text}` **per function**. This seat: duplicate `{label.text}` inside `ModelMetaLine` only → **RED** `ModelMetaLine: expected length 1 but got 2` (global count of 3 would not kill a global-only ratchet the same way). |
| **4** | `aria-label` present on the absence pill | **PASS** | Both `ModelMetaLine` and `ModelBadge` set `aria-label={label.absence ? "No recorded house is available for this argument." : undefined}` alongside matching `title`. Render test requires two accessible-name matches + two visible `House unavailable`. Source pin in `styles typed absence…`. This seat: remove both `aria-label` lines → render **RED** (`match` null on aria-label) **and** source pin **RED**. |
| **5** | `vitest list` collection proof (mission: three dead runners) | **PASS** | Root config includes `tests/**/*.test.tsx`. This seat: `pnpm vitest list tests/render/ui02d-model-identity.test.tsx` enumerates all **seven** tests by name (six surface pins + accessible absence). File is under the enforced include; not a dead runner. |
| **6** | Typed absence + frozen formatter untouched | **PASS** | Domain seam still: `if (maker === null) return { text: "House unavailable", absence: true };` — pure equality pin green in `v2ui-data-layer.test.ts`. UI-02d inventory does **not** claim `adapter.ts` / `v3ScorePercentage`; product edits claimed are `makerIdentity.ts` (exact-id extension), two `aria-label` attrs on `ModelPresentation.tsx`, and tests/artifacts only. Surface components unchanged (props pre-existed; now pinned). |

---

### Gate 1 — exact model id SHOW (DR-165(2))

**Single composition seam (shipped):**

```ts
// apps/v2-ui/lib/makerIdentity.ts
export function makerIdentityLabel({ maker, modelId }): MakerIdentityLabel {
  if (maker === null) return { text: "House unavailable", absence: true };
  const modelName = modelId === null ? null : modelMeta(modelId).name;
  const modelIdentity = modelId === null
    ? []
    : modelName === modelId
      ? [modelId]
      : [modelName, modelId];
  if (maker === undefined) return { text: modelIdentity.join(" · "), absence: false };
  return {
    text: [maker, ...modelIdentity].join(" · "),
    absence: false
  };
}
```

| Input | Observed label text |
|---|---|
| `{ maker: "OpenAI", modelId: "gpt-5.6-sol" }` | `OpenAI · GPT · gpt-5.6-sol` |
| `{ maker: "Anthropic", modelId: "claude-sonnet-4" }` | `Anthropic · Claude · claude-sonnet-4` |
| `{ maker: "Anthropic", modelId: "claude-opus-4" }` | `Anthropic · Claude · claude-opus-4` |
| `{ maker: "OpenAI", modelId: "fable-special" }` (unknown family) | `OpenAI · fable-special` (id not duplicated when friendly name ≡ id) |
| `{ maker: null, modelId: "gpt-5.6-sol" }` | `House unavailable` / `absence: true` |
| Custom id `my-custom-sol-variant` | appears **verbatim** in text — never rewritten from family hash |

**DR-115:** family comes from `modelMeta(modelId).name` (display vocabulary keyed by the **recorded** id). The recorded `model_id` string is appended as-is; the seam never invents or substitutes an id from the family key. Both shared renderers call only this seam and paint `{label.text}`.

**Real-render pin:** fixture `MODEL_ID = "gpt-5.6-sol"`, `IDENTITY = "OpenAI · GPT · gpt-5.6-sol"` asserted on every of the six surfaces.

**Mutation this seat (exact-id removal from composition):** 6 failed / 1 passed — every surface received `OpenAI · GPT` instead of the triple; absence test still green.

### Gate 2 — six surfaces / eight call sites

| Surface | Call site(s) | Render pin | Source pin |
|---|---|---|---|
| **DebateTree** | L152 `ModelBadge … maker={node.maker}` | `pins the tree maker prop…` | exact `toContain` string |
| **DebateThread** | L179 `ModelMetaLine … maker={node.maker}` | named thread render | exact string |
| **DebateOutline** | L63 `ModelMetaLine … maker={node.maker}` | named outline render | exact string |
| **DebateSplit** | L126 `focus.maker`; L301 `node.maker` | focused-card render | regex count `2` |
| **DebateMap** | L165 `readoutNode.maker` | readout render | multiline match |
| **NodeDetailDrawer** | L202 + L290 `node.maker` | identity line render | regex count `2` |

Primary surfaces were **not** product-edited for UI-02d — correct `maker=` props already existed (UI-02c) and are now **mutation-killed**. Canvas remains covered by prior UI-02c / UI-01 pins (out of this ticket’s “remaining six”).

**Mutation this seat (tree only):** drop `maker={node.maker}` → tree render RED + eight-site source RED (2 failed).

### Gate 3 — per-function ratchet

```ts
// tests/unit/v2ui-pages.test.ts — UI-02c B1 (scoped for UI-02d A-5)
const metaLine = region(presentation, "export function ModelMetaLine", "export function ModelBadge");
const badge = presentation.slice(presentation.indexOf("export function ModelBadge"));
for (const [name, renderer] of [["ModelMetaLine", metaLine], ["ModelBadge", badge]] as const) {
  expect(renderer.match(/makerIdentityLabel\(\{ maker, modelId \}\)/g), name).toHaveLength(1);
  expect(renderer.match(/\{label\.text\}/g), name).toHaveLength(1);
}
```

**Mutation this seat (transplant / duplicate `{label.text}` into MetaLine only):**  
`ModelMetaLine: expected length 1 but got 2` — RED. A global-only count of occurrences would still see ≥2 and could miss a one-sided transplant; the per-function region is what kills it.

### Gate 4 — absence `aria-label`

Both shared pills (shipped):

```ts
title={label.absence ? "No recorded house is available for this argument." : undefined}
aria-label={label.absence ? "No recorded house is available for this argument." : undefined}
```

Render: two `>House unavailable</span>`, two matching `aria-label="…"`, no `modelDot` under absence.  
**Mutation this seat:** remove both `aria-label` attributes → render RED on aria-label match (`Target cannot be null or undefined`) + source pin RED on `toContain('aria-label={label.absence…')`.

### Gate 5 — collection

```text
$ pnpm vitest list tests/render/ui02d-model-identity.test.tsx
tests/render/ui02d-model-identity.test.tsx > … > pins the tree maker prop through the rendered card
tests/render/ui02d-model-identity.test.tsx > … > pins the thread maker prop through the rendered card
tests/render/ui02d-model-identity.test.tsx > … > pins the outline maker prop through the rendered card
tests/render/ui02d-model-identity.test.tsx > … > pins the split maker prop through the rendered focused card
tests/render/ui02d-model-identity.test.tsx > … > pins the map maker prop through the rendered readout
tests/render/ui02d-model-identity.test.tsx > … > pins the drawer maker prop through the rendered identity line
tests/render/ui02d-model-identity.test.tsx > … > keeps typed absence visible and gives both shared pills an accessible name
```

Root `vitest.config.ts` include: `tests/**/*.test.ts` + `tests/**/*.test.tsx` — file is collected.

### Gate 6 — typed absence + frozen formatter

| Check | Observation |
|---|---|
| Seam absence branch | `maker === null` → exact `{ text: "House unavailable", absence: true }` |
| Pure pin | `v2ui-data-layer.test.ts` equality still green |
| Absence ignores modelId when house missing | probe: `{ maker: null, modelId: "gpt-5.6-sol" }` still absence |
| UI-02d product inventory | `makerIdentity.ts`, two `aria-label`s on `ModelPresentation.tsx`, tests + durable docs only |
| Six surface components | **no** product edits (pins only) |
| `v3ScorePercentage` | lives in `adapter.ts`; not in UI-02d claimed files; formatter body not part of this ticket’s delta |

---

## BLOCKING

_None._

---

## ADVISORY

### A1 — Pure seam lacks a dedicated triple-shape unit (house · family · exact id)

**Where:** `v2ui-data-layer.test.ts` pins two-house distinctness and exact absence equality, but does not assert the string `OpenAI · GPT · gpt-5.6-sol` at the pure function.  
**Mitigation:** the six real-render tests drive the shipped seam end-to-end with that exact fixture and kill exact-id removal.  
**Harder ratchet (optional):** one pure unit `expect(makerIdentityLabel({ maker: "OpenAI", modelId: "gpt-5.6-sol" })).toEqual({ text: "OpenAI · GPT · gpt-5.6-sol", absence: false })`.

### A2 — Drawer has a third `maker={` (XREV reviewer lineage)

**Where:** `NodeDetailDrawer.tsx` also passes `maker={v3.review?.reviewer_lineage.maker ?? null}` (reviewer chip). UI-02d’s source floor correctly pins **two** primary `ModelMetaLine … maker={node.maker}` sites; the XREV site is owned by XREV-01.  
**Not a hole in UI-02d** — attribution only so dual-diamond seats do not double-count.

### A3 — Shared dirty tree (UI-02c / LOAD-01 / XREV-01 / format.ts)

**Fact:** working tree is heavily dirty beyond UI-02d. This review attributes only the UI-02d inventory and does not treat unrelated dirt as this ticket’s credit or defect. `format.ts` status-label edits and other adapter/label work are **out of ticket**.

### A4 — History / generation-compare badges still model-id-only

**Where:** carried from UI-02c advisory A3 — generation-history rows without maker_lineage. Not DR-165(2) card SHOW scope; primary V3 node cards are covered.

---

## Author-claim cross-check (hypothesis → source)

| Claim | Verified? |
|---|---|
| `makerIdentityLabel` remains single seam; text is house · family · exact recorded model id | **Yes** — source + probe + six renders |
| Does not infer/rewrite recorded id; unknown-family de-dup when name ≡ id | **Yes** — `[modelName, modelId]` vs `[modelId]` branch |
| Six surfaces / eight call sites pinned (render + source) | **Yes** — suite + line audit + tree mutation |
| Ratchet scoped per function; transplant RED | **Yes** — this seat mutation |
| Absence pills keep visible text + title; gain `aria-label` | **Yes** — source + render + mutation |
| Typed absence unchanged at domain seam | **Yes** — equality pin + probe |
| Frozen formatter / NUL ratchets not edited for UI-02d | **Yes** — inventory + attribution |
| `vitest list` enumerates seven new render tests | **Yes** — this seat |
| Focused GREEN 3 files / 100 tests | **Yes** — this seat re-run 100/100 after restore |

---

## Corroborating runs this seat

```text
# Collection
pnpm vitest list tests/render/ui02d-model-identity.test.tsx
→ 7 tests enumerated

# Focused GREEN (post-restore)
pnpm vitest run tests/render/ui02d-model-identity.test.tsx \
  tests/unit/v2ui-pages.test.ts tests/unit/v2ui-data-layer.test.ts
→ Test Files  3 passed · Tests  100 passed

# MUT exact-id drop from makerIdentityLabel
→ 6 failed | 1 passed (surfaces missing · gpt-5.6-sol); restored

# MUT drop tree maker={node.maker}
→ 2 failed (named tree render + 8-site source); restored

# MUT duplicate {label.text} inside ModelMetaLine only
→ 1 failed: ModelMetaLine expected length 1 but got 2; restored

# MUT remove both absence aria-label attributes
→ 2 failed (render aria match + source toContain); restored

# Pure seam probe (tsx)
→ "OpenAI · GPT · gpt-5.6-sol"; absence exact; custom id verbatim
```

Full root/acceptance/typecheck/architecture matrix was claimed green by the worker handoff; this seat re-ran focused suites + independent mutations + collection rather than the full orchestrator matrix. Source trace + mutations hold without that re-run.

---

**Comments read through:** ticket body + DR-165(2) scope amendment + Codex READY FOR PEER REVIEW claim; goal packet; Codex handoff. Peer Opus unread.  
**READY FOR PEER REVIEW** — Grok UI-02d rev1 verdict filed (**APPROVED**).
