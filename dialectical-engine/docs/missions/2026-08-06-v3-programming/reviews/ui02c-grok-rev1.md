# UI-02c dual-diamond review — Grok lens (rev1)

**Ticket:** `t_0829cf81` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff `handoffs/UI-02c-codex-handoff.md` / goal packet `goal-packets/UI-02c-codex-goal.md`  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev1)  
**Date:** 2026-08-12  
**Inputs verified against shipped source (not handoff trust):**  
`packages/contract/src/index.ts` (`MakerLineageSchema` — `maker`/`model_id`/`transport`/`provider_ref`),  
`packages/serve/src/index.ts` (`projectNodeMakerLineage` maps ledger `provider` → served `transport`; drops `model_version`),  
`apps/v2-ui/lib/v3/adapter.ts` (**`grep -a`**, raw NUL = 0; carries `maker` on node + `active_generation`),  
`apps/v2-ui/lib/types.ts` (`GenerationPresentation.maker`, `DebateNode.maker`),  
`apps/v2-ui/components/ModelPresentation.tsx` (`ModelBadge` / `ModelMetaLine` / `modelColor` — maker-keyed identity + typed absence),  
`apps/v2-ui/components/{DebateCanvas,DebateTree,DebateThread,DebateOutline,DebateSplit,DebateMap,NodeDetailDrawer}.tsx`,  
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` (primary surface mounts),  
`apps/v2-ui/lib/debateStatusPresentation.source-test.mjs` (UI-02c structural ratchet — scope noted below),  
`tests/unit/{s14-ui,contract,v2ui-data-layer}.test.ts`,  
`tests/support/v2uiFixtures.ts`,  
`tests/integration/database.test.ts` (served lineage pins).

**Mode:** read-only product tree (only this verdict file written). Temporary A5 mutation of `packages/serve/src/index.ts` was applied, observed RED, and **fully restored** before finish (diff vs pre-mutation backup: match). No git mutations, no board mutations. Did not read any peer Opus UI-02c verdict.

## Verdict

**APPROVED**

Findings **A1**, **A2**, and **A5** are **closed** on shipped source. The house (`maker_lineage.maker`) is no longer discarded at the V3→V2 adapter: it flows into V2’s existing `ModelBadge` / `ModelMetaLine` / `modelColor` vocabulary on every node card that paints model identity, **including `DebateTree`/`ArgumentNodeCard`**. Unresolved maker renders visible typed absence (`House unavailable`, `data-maker-absence="true"`), consistent with scoring-pill “unavailable” style rather than silence. Served lineage names are honest (`transport`, no redundant `model_version`); integration and unit pins match. The `provider: null` resolver guard has a behavioural assertion that this seat re-verified under mutation (delete guard → RED with `{ transport: null }`; restore → GREEN). Equal `model_id` with distinct makers can no longer read as mono-model: colour and label identity key on maker when recorded. Residual notes below are **ADVISORY** only.

---

## Decision table (A1 / A2 / A5 + mono-model)

| # | Finding | Result | Source proof |
|---|---|---|---|
| **A1** | HOUSE visible per node in V2 vocabulary; typed absence when unresolved | **PASS (closed)** | Serve projects `maker` (`serve/index.ts:120–125`); adapter assigns `active_generation.maker` + `node.maker` (`adapter.ts:137–143`); **each** consumer that paints model identity passes `maker={…}` into `ModelMetaLine`/`ModelBadge` (line table below); null maker → `"House unavailable"` + `data-maker-absence="true"` (`ModelPresentation.tsx:23–25,39–42`) |
| **A2** | Misleading served names renamed honestly; pins updated | **PASS (closed)** | `MakerLineageSchema` is `{ maker, model_id, transport, provider_ref }` strict (`contract/index.ts:262–267`); projector maps ledger `provider` → `transport`, omits `model_version` (`serve/index.ts:120–125`); contract rejects legacy `provider` member (`contract.test.ts:93–96`); integration pin `database.test.ts:857–861` expects `transport: "openai-compatible-http"` |
| **A5** | Behavioural case for provider-null; red-under-mutation | **PASS (closed)** | Unit asserts `projectNodeMakerLineage({ ...recorded, provider: null }).toBeNull()` (`s14-ui.test.ts:179`). This seat deleted only `recorded.provider === null \|\|`; focused test **failed** with received `{ transport: null, ... }`; restore → **passed**. Logs under reviewer scratch. |
| **Mono** | Two-maker same model_id no longer mono-model-readable | **PASS** | Identity key `maker ?? modelId` (`ModelPresentation.tsx:20,31`); Tree colour `generation.maker ?? generation.model_id` (`DebateTree.tsx:116`); label `` `${maker} · ${modelId}` `` when maker recorded. Ceremony probe (shared `test-layer/model`, makers OpenAI vs Anthropic): distinct colour keys + labels. `grep -a` adapter: maker carried; **0** raw NUL bytes. |

---

### A1 — HOUSE visible + typed absence

**Serve → contract (already resolved identity, now honestly shaped):**

```ts
// packages/serve/src/index.ts:107–126
export function projectNodeMakerLineage(recorded: { ... }): Node["maker_lineage"] {
  if (
    recorded.maker === null ||
    recorded.model_id === null ||
    recorded.provider === null ||
    recorded.provider_ref === null
  ) return null;
  return {
    maker: recorded.maker,
    model_id: recorded.model_id,
    transport: recorded.provider,
    provider_ref: recorded.provider_ref
  };
}
```

**Adapter no longer keeps only `model_id`:**

```ts
// apps/v2-ui/lib/v3/adapter.ts:137–143
active_generation: contractNode.maker_lineage === null
  ? null
  : {
      model_id: contractNode.maker_lineage.model_id,
      maker: contractNode.maker_lineage.maker
    },
maker: contractNode.maker_lineage?.maker ?? null,
```

| Stage | Recorded maker | Unresolved join (`maker_lineage === null`) |
|---|---|---|
| Contract | non-null `maker` string | `maker_lineage: null` |
| Adapter `active_generation` | `{ model_id, maker }` | `null` |
| Adapter `node.maker` | recorded string | **`null`** (typed absence, not `undefined`) |
| `ModelMetaLine` / `ModelBadge` | `` `${maker} · ${model…}` `` | **`House unavailable`** + `data-maker-absence="true"` |
| Colour identity | `modelColor(maker)` | `modelColor("maker-absent")` when both absent |

#### Consumer line audit (shipped — not ratchet trust)

Primary `DebatePageClient` mounts: **Thread, Split, Map, Canvas** (not Tree/Outline). Tree remains a first-class V2 card (`ArgumentNodeCard` / `ArgumentFocusView`) and was audited because the ticket/handoff lists it.

| Surface | Call site (exact) | Maker prop? | Colour key |
|---|---|---|---|
| **DebateTree** `ArgumentNodeCard` | L152: `<ModelBadge modelId={generation?.model_id ?? null} maker={node.maker} />` | **YES** `maker={node.maker}` | L116: `modelColorStyle(generation.maker ?? generation.model_id)` — **maker first** |
| DebateTree gate | L151: `{generation \|\| node.maker !== undefined ? (` | mounts badge when `maker: null` | — |
| DebateCanvas | L343, L375: `ModelMetaLine … maker={node.maker}` | YES | via helper |
| DebateThread | L179: `ModelMetaLine … maker={node.maker}` | YES | via helper |
| DebateOutline | L63: `ModelMetaLine … maker={node.maker}` | YES | via helper |
| DebateSplit | L126 `maker={focus.maker}`; L301 `maker={node.maker}` | YES | via helper |
| DebateMap | L163–165: `ModelMetaLine` + `maker={readoutNode.maker}` | YES | via helper |
| NodeDetailDrawer (node body) | L202, L290: `maker={node.maker}` | YES | via helper |

**DebateTree A1 is closed on source.** Claims that Tree omits `maker=` or keys colour only on `model_id` do **not** match the file on disk:

```ts
// apps/v2-ui/components/DebateTree.tsx:116
const modelStyle = generation ? modelColorStyle(generation.maker ?? generation.model_id) : undefined;
// apps/v2-ui/components/DebateTree.tsx:151–152
{generation || node.maker !== undefined ? (
  <ModelBadge modelId={generation?.model_id ?? null} maker={node.maker} />
) : null}
```

With V3 projection (`active_generation.maker` set when lineage present; `node.maker` always `string | null` for V3 nodes):

- recorded house → badge text `` `${maker} · ${modelId}` ``, colour hash on maker  
- `maker: null` (typed absence) → gate still true (`null !== undefined`) → badge text **`House unavailable`**, `data-maker-absence="true"`

**Scoring-pill consistency:** sibling surfaces use visible copy such as `Scoring unavailable` / `scoreBadge unavailable` rather than blank. Maker absence mirrors that pattern with `House unavailable` and an explicit absence data attribute — not empty DOM silence.

**Data-layer behavioural pin:** `v2ui-data-layer.test.ts` expects position `{ model_id: "gpt-5", maker: "OpenAI" }` / `position.maker === "OpenAI"`, and defeater `active_generation: null` + `maker: null` under fixture null lineage.

#### Source ratchet — scope honesty (review correction)

`debateStatusPresentation.source-test.mjs` UI-02c test asserts:

- adapter `maker: contractNode.maker_lineage?.maker ?? null`
- helper `House unavailable` + `modelColor(identity)`
- **`maker=` only for** `DebateCanvas`, `DebateThread`, `DebateOutline`, `DebateSplit`, `DebateMap` (ModelMetaLine cards)

It **deliberately omits `DebateTree`** (which uses `ModelBadge`, not `ModelMetaLine`). Treating the ratchet alone as proof of Tree was an earlier overclaim in this review; **Tree A1 is proven by direct source audit of L116/L151–152**, not by the ratchet. Ratchet result this seat: **3/3 pass** (valid for the five cards it names).

**Failing case that would re-open A1:** adapter dropping `maker` again; a node card rendering model identity without `maker=`; or `maker === null` painting blank text instead of typed absence.

### A2 — honest wire names

| Prior misleading name | Shipped served name | Evidence |
|---|---|---|
| `provider` (hardcoded transport literal `"openai-compatible-http"`) | **`transport`** | schema + projector map + integration pin |
| `model_version` (byte-identical to `model_id` or null) | **dropped from served lineage** | return object has four fields only; unit expects no `model_version` |

- Ledger/resolver **input** still uses raw columns `provider` / `model_version` (honest for the write path); only the **served** projection renames/drops.
- `MakerLineageSchema` is `.strict()` — legacy `provider` member throws (`contract.test.ts:93–96`).
- Integration pin (`database.test.ts:857–861`):

```ts
expect(projection?.nodes[0]?.maker_lineage).toEqual({
  maker: "test-layer",
  model_id: "test-layer/model",
  transport: "openai-compatible-http",
  provider_ref: "provider:test-layer"
});
```

**Failing case that would re-open A2:** reintroducing served `provider` or `model_version` without schema + pin honesty, or renaming without updating the integration expectation.

### A5 — provider-null mutation hole closed

**Unit gate (shipped):** `s14-ui.test.ts:179`  
`expect(projectNodeMakerLineage({ ...recorded, provider: null })).toBeNull()`  
alongside maker / model_id / provider_ref null arms.

**Independent re-verification this seat (do not trust worker claim alone):**

| Step | Action | Observation |
|---|---|---|
| 1 | Delete only `recorded.provider === null \|\|` from `projectNodeMakerLineage` | Mutation applied |
| 2 | `pnpm vitest run tests/unit/s14-ui.test.ts -t 'relays a complete ledger identity…'` | **RED** — `expected null`, received `{ maker, model_id, provider_ref, transport: null }` |
| 3 | Restore guard from pre-mutation backup | `diff` match vs backup |
| 4 | Re-run same focused test | **GREEN** — 1 passed \| 13 skipped |

This matches the mission defect class: without the assertion, deleting the guard left a projection that would fail `MakerLineageSchema` at the API boundary (`transport` must be `min(1)` string, not null). The behavioural case now fails for the reason its author intended.

### Mono-model / ceremony two-maker regression

**Pre-UI-02c failure mode:** both acceptance doubles answer `model_id: "test-layer/model"`; adapter kept only `model_id` → identical badges/colours → “mono-model?” false read.

**Post-UI-02c (including Tree):**

| Signal | OpenAI node | Anthropic node |
|---|---|---|
| `model_id` | `test-layer/model` | `test-layer/model` |
| `maker` (adapter + badge prop) | OpenAI | Anthropic |
| Label (`ModelBadge` / `ModelMetaLine`) | `OpenAI · test-layer/model` | `Anthropic · test-layer/model` |
| Colour key (shared helper / Tree L116) | hash(`OpenAI`) | hash(`Anthropic`) |

Independent probe this seat (shipped `modelColor` body + Tree colour key + badge label rules):

```text
keys: OpenAI vs Anthropic (distinct)
colors: #7a4d1d vs #8062b5 (distinct)
labels: "OpenAI · test-layer/model" vs "Anthropic · test-layer/model" (distinct)
typed absence label: "House unavailable"
Tree L152 contains maker={node.maker}: true
Tree L116 maker-first color: true
```

**Binary-safe adapter inspection (packet / plan requirement):**

| Check | Observed |
|---|---|
| `grep -a -n` maker / active_generation on `adapter.ts` | lines 136–143 (tree nodes), 202–203 (root) |
| raw NUL byte count | **0** |
| `file(1)` | UTF-8 text (tool may mis-tag language; content is plain TS) |

---

## BLOCKING

_None._

---

## ADVISORY

### A1 — Source ratchet does not pin DebateTree `maker=`

**Where:** `debateStatusPresentation.source-test.mjs:50` card list is Canvas/Thread/Outline/Split/Map only.  
**Fact:** Tree **does** pass `maker={node.maker}` (L152) and maker-first colour (L116); the ratchet simply does not assert it.  
**Harder ratchet (optional):** add DebateTree/`ModelBadge` + `maker=` (and optionally maker-first `modelColorStyle`) to the structural test so a future deletion cannot silence Tree without CI.

### A2 — No dedicated two-node same-`model_id` fixture through adapter→presentation

**Where:** fixtures supply one recorded maker (`OpenAI` / `gpt-5`) and one null lineage; no single test object with two nodes sharing `model_id` and differing makers.  
**Mitigation:** presentation identity rules + per-node maker pins + Tree maker-first colour make mono-model re-introduction fail when makers are carried.  
**Harder ratchet (optional):** fixture with two makers, same `model_id`, asserting distinct projected labels/identity keys.

### A3 — History/compare `ModelMetaLine`/`ModelBadge` calls without `maker`

**Where:** `NodeDetailDrawer.tsx` L297/L323 and `DebateTree.tsx` L215 still render generation-history badges as model-id-only (legacy V2 full `Generation` rows).  
**Not a DR-115 false house** — those paths never had maker_lineage; primary V3 node cards do. Cosmetic asymmetry only.

### A4 — Empty-string identity members still pass the null-gate (carried from UI-02b)

**Where:** `projectNodeMakerLineage` still null-gates only `=== null`, not `""`. Schema rejects empty `maker` at parse.  
**Out of UI-02c scope**; fail-closed at API parse remains.

---

## Author-claim cross-check (hypothesis → source)

| Claim | Verified? |
|---|---|
| Adapter carries `maker_lineage.maker` alongside `model_id` | **Yes** `adapter.ts:140–143` |
| Every V2 card uses existing ModelBadge/ModelMetaLine/modelColor; colour keyed by maker when recorded | **Yes** — line audit above, **including Tree L116/L152** |
| Typed absence `House unavailable` / `data-maker-absence` when maker null | **Yes** ModelPresentation; Tree gate mounts on `maker: null` |
| Served lineage `{ maker, model_id, transport, provider_ref }`; ledger `provider`→`transport`; no served `model_version` | **Yes** contract + serve + pins |
| Strict schema rejects legacy `provider` member | **Yes** contract.test.ts |
| A5: provider null → typed absence; guard deletion fails with `transport: null` | **Yes** — re-run this seat |
| No maker inferred from model-id string; no fabricated runtime values | **Yes** projector is pure field map + null gate |
| `grep -a` adapter clean (no NUL corruption) | **Yes** 0 NUL bytes |
| UI-02c source ratchet proves all cards incl. Tree | **No — ratchet omits Tree**; Tree proven by source audit separately |

---

## Corroborating runs this seat (not full orchestrator re-cert)

```text
# A5 mutation RED (guard deleted)
pnpm vitest run tests/unit/s14-ui.test.ts -t 'relays a complete ledger identity…'
→ 1 failed; received { transport: null, … }

# A5 GREEN (guard restored; tree matches pre-mutation backup)
→ 1 passed | 13 skipped

# Focused suites
pnpm vitest run tests/unit/contract.test.ts tests/unit/s14-ui.test.ts tests/unit/v2ui-data-layer.test.ts
→ Test Files  3 passed · Tests  64 passed

# UI structural ratchet (five ModelMetaLine cards — not Tree)
node --test apps/v2-ui/lib/debateStatusPresentation.source-test.mjs
→ tests 3 · pass 3 · fail 0

# Tree + mono-model structural probe (this seat)
→ distinct keys/colors/labels for OpenAI vs Anthropic @ same model_id
→ Tree L152 maker={node.maker}; L116 maker-first color
→ typed absence label "House unavailable"
```

Full root/acceptance/typecheck/architecture gates were claimed green by the worker handoff; this seat did not re-run the full orchestrator matrix. Source trace + independent A5 mutation proof + Tree line audit hold without that re-run.

---

**Comments read through:** ticket body + worker claim + READY FOR PEER REVIEW comment; goal packet; Codex handoff. Peer Opus unread.  
**READY FOR PEER REVIEW** — Grok UI-02c rev1 verdict filed (evidence tightened after adversarial panel: Tree A1 confirmed closed on source; ratchet scope de-overclaimed).
