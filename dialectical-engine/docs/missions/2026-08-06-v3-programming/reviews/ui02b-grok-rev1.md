# UI-02b dual-diamond review — Grok lens (rev1)

**Ticket:** `t_35a2b742` (`review`) · **Board:** `debateai-v3`  
**Author claims (hypothesis only):** Codex handoff / packet “What the author says it did”  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev1)  
**Date:** 2026-08-12  
**Packet:** `reviews/UI-02b-review-packet.md`  
**Inputs verified against shipped source (not handoff trust):**  
`packages/contract/src/index.ts` (`MakerLineageSchema` / `NodeSchema`),  
`packages/serve/src/index.ts` (`projectNodeMakerLineage`, `readNodesForRun` join),  
`migrations/0000_s00.sql` (`ledger.raw_artifact` PK + column nullability),  
`packages/judgement/src/index.ts` + `apps/runner/src/index.ts` (provenance write path),  
`apps/v2-ui/lib/v3/adapter.ts` (**`grep -a`**, raw NUL = 0),  
`apps/v2-ui/lib/types.ts` (`Generation` / `GenerationPresentation` / `DebateNode`),  
`apps/v2-ui/lib/v3/liveEvents.ts`,  
`apps/v2-ui/components/{ModelPresentation,DebateCanvas,DebateThread,DebateSplit,DebateMap,DebateOutline,DebateTree,NodeDetailDrawer}.tsx`,  
`apps/v2-ui/lib/debatePresentation.ts`,  
`apps/v2-ui/app/debate/[id]/DebatePageClient.tsx` (which surfaces mount),  
`tests/unit/{s14-ui,contract,v2ui-data-layer}.test.ts`,  
`tests/support/v2uiFixtures.ts`,  
`tests/integration/database.test.ts` (maker_lineage expectation),  
`apps/api/src/index.ts` (`AnswerSchema` / `NodeSchema` parse on serve).

**Mode:** read-only. This seat wrote only this verdict file. No product code edits, no git mutations, no board mutations. Did not read any peer Opus UI-02b verdict. Did not re-run orchestrator-green gates (root/v2-ui `tsc`, full vitest counts, architecture, source audit).

## Verdict

**APPROVED**

DR-115 holds on the shipped path: maker identity is relayed only from a complete ledger join, never invented from a model-id string, and any missing required join member collapses to typed `null`. The V2 seam is type-honest (`GenerationPresentation`, no cast) and the primary DebatePageClient surfaces read only `model_id` (or optional-chain `.argument`). Required `maker_lineage` is produced by the sole production Node projector, enforced by contract parse, and covered in fixtures/tests. The ledger join is PK-equality (no fan-out) inside the single `readNodesForRun` query. Behavioural unit + adapter + integration expectations would go red if the resolver started guessing. Residual notes below are **ADVISORY** only.

---

## Decision table (packet Q1–Q5)

| # | Question | Result | Source proof |
|---|---|---|---|
| **1** | DR-115: no false maker; null on ANY missing required member; UI distinguishes unrecorded vs recorded-as-X | **PASS** | `projectNodeMakerLineage` `packages/serve/src/index.ts:107–127`; live import: any of maker/model_id/provider/provider_ref null → `null`; complete identity relayed exactly incl. `model_version: null`; adapter `adapter.ts:137–139` null vs `{ model_id }`; ModelBadge/ModelMetaLine only when generation present |
| **2** | V2 seam: model-id-only presentation type-honest; consumers safe on reduced shape | **PASS** | `GenerationPresentation` `types.ts:31–32`; `DebateNode.active_generation` is that type (`types.ts:86`); adapter assigns `{ model_id }` with **no** `as` (`adapter.ts:137–139`); consumers named below |
| **3** | Required `maker_lineage`: all construction sites + pre-change answers | **PASS** | Sole production builder `readNodesForRun` → `projectNodeMakerLineage(row)` (`serve/index.ts:1664`); API `AnswerSchema`/`NodeSchema` parse (`api/index.ts:122,150,179`); fixtures + contract/s14 tests supply field; pre-change rows re-projected on read via LEFT JOIN (no migration) |
| **4** | Ledger join key unique / no fan-out / not N+1 for the join | **PASS** | `LEFT JOIN ledger.raw_artifact ON artifact.raw_artifact_id = node.provenance_ref` (`serve/index.ts:1602–1603`); `raw_artifact_id uuid PRIMARY KEY` (`migrations/0000_s00.sql:140`); one query for all run nodes; staleness `Promise.all` per node is pre-existing, not introduced by this join |
| **5** | Tests behavioural; would fail if resolver guessed | **PASS** | `s14-ui.test.ts:160–173` exact `toEqual(recorded)` + null when maker/model_id/provider_ref missing; `v2ui-data-layer.test.ts:130–144` only recorded model_id + typed absence; `contract.test.ts:57–93` required field + empty maker rejected; integration `database.test.ts:833–839` exact identity from real projection |

---

### Q1 — DR-115 resolver (false attribution is the failure mode)

**Shipped function** (`packages/serve/src/index.ts:107–127`):

```ts
export function projectNodeMakerLineage(recorded: {
  readonly maker: string | null;
  readonly model_id: string | null;
  readonly model_version: string | null;
  readonly provider: string | null;
  readonly provider_ref: string | null;
}): Node["maker_lineage"] {
  if (
    recorded.maker === null ||
    recorded.model_id === null ||
    recorded.provider === null ||
    recorded.provider_ref === null
  ) return null;
  return {
    maker: recorded.maker,
    model_id: recorded.model_id,
    model_version: recorded.model_version,
    provider: recorded.provider,
    provider_ref: recorded.provider_ref
  };
}
```

| Probe (live import of shipped export) | Result |
|---|---|
| complete identity (`model_version: null` allowed) | exact relay |
| `maker` / `model_id` / `provider` / `provider_ref` null | `null` each |
| all five null (join miss) | `null` |
| invent-from-string path | **absent** — no parse of `model_id` into maker/provider |

**Partial ledger row:** on a successful join, schema requires `maker`, `model_id`, `provider`, `provider_ref` NOT NULL (`migrations/0000_s00.sql:143–146`); only `model_version` is nullable and is allowed through as null (matches `MakerLineageSchema`). Application still null-gates the four required members independently of SQL.

**Provenance write path (who is “recorded”):** JUDGE response sets `provenanceRef: response.rawArtifactRef` (`packages/judgement/src/index.ts:128`); runner writes that onto `core.node.provenance_ref` (`apps/runner/src/index.ts:384`, counter path `:496`). Join therefore attributes the node to the raw artifact of the call that authored the claim text — including `JUDGE:critic` counter-positions.

**UI distinction:**  
- unrecorded → `maker_lineage === null` → `active_generation: null` → no ModelBadge/ModelMetaLine  
- recorded-as-X → `active_generation: { model_id }` → badge paints that recorded model id  

Root synthetic card stays `active_generation: null` (`adapter.ts:198–199`) — not a false maker.

**Failing case that would re-open Q1:** returning a non-null lineage when any of maker/model_id/provider/provider_ref is null; or synthesizing maker/provider from the model-id string.

### Q2 — V2 `active_generation` seam

**Binary-safe adapter inspection (packet requirement):**

| Check | Observed |
|---|---|
| `grep -a -n active_generation apps/v2-ui/lib/v3/adapter.ts` | lines 136–139 (tree nodes), 198–199 (root) |
| raw NUL byte count | **0** |
| `file(1)` | UTF-8 text (plain-grep safe) |
| cast on the model-id fill | **none** — plain object literal |

**Type honesty:**

- `Generation` still requires `role`, `argument`, `worker_id`, `created_at` (`types.ts:10–24`).
- `GenerationPresentation = Pick<Generation, "model_id"> & Partial<Omit<Generation, "model_id">>` (`types.ts:31–32`).
- `DebateNode.active_generation: GenerationPresentation | null` (`types.ts:86`).
- Adapter supplies `{ model_id: contractNode.maker_lineage.model_id }` — assignable without lying to the type system.

**Consumers checked (primary DebatePageClient mounts):**

| Surface | File | Reads of reduced shape |
|---|---|---|
| DebateCanvas | `DebateCanvas.tsx:238–239,431–437` | `model_id` via `modelMeta`; `.argument` only under `generation?.argument ?` |
| DebateThread | `DebateThread.tsx:125–126,206–212` | same pattern |
| DebateSplit | `DebateSplit.tsx:67,134–136,282,324–329` | optional-chain `.argument` |
| DebateMap | `DebateMap.tsx:98` | `model_id` only |
| NodeDetailDrawer | `NodeDetailDrawer.tsx:126,227,252–259` | `ModelMetaLine(model_id)`; argument optional with “No argument text yet.” |
| debatePresentation status | `debatePresentation.ts:120` | optional `.argument`; V3 nodes carry `claim` so status is not forced empty |

**Secondary surfaces (not mounted by `DebatePageClient`):**  
`DebateTree.tsx:179–180` renders `{generation.role}` and a worker badge when `generation` is truthy — with model-id-only shape that yields empty badges (React renders `undefined` as nothing). `DebateOutline.tsx` optional-chains argument. Not false maker attribution; see A2.

**Live stream path (out of settled maker_lineage):** `liveEvents.ts:215–217` builds a full `Generation` with `model_id: "streaming"` while text is streaming — separate from the UI-02b fill of settled answers.

**ModelPresentation.tsx:** unchanged consumer of `modelId` string only (author claim holds for presentation components).

### Q3 — Required `maker_lineage` construction sites

| Site | Status |
|---|---|
| Production Node build | only `ServeRepository.readNodesForRun` (`serve/index.ts:1664`) |
| Wire enforcement | `NodeSchema.maker_lineage: MakerLineageSchema.nullable()` required key (`contract/index.ts:278`); `AnswerSchema.nodes: z.array(NodeSchema)`; API parses answers/nodes (`api/index.ts:122,150,179`) |
| Test fixtures | `v2uiFixtures.ts:44–50` recorded + `:68` null; `s14-ui.test.ts:62` null; `contract.test.ts:71–93` admits + rejects omission/empty maker |
| Live/stream projection | does **not** construct contract `Node` — builds V2 `DebateNode` from events (`liveEvents.ts`) |
| Replay / pre-change answers | projection recomputes on read via LEFT JOIN; missing artifact → null lineage (no DB migration) |

**Breaking change honesty:** any producer of contract `Node` must supply the field (or explicit null). In this monorepo the sole production producer does. Omission fails `NodeSchema.parse` (unit-proven).

### Q4 — Ledger left join

```sql
FROM core.node AS node
LEFT JOIN ledger.raw_artifact AS artifact
  ON artifact.raw_artifact_id = node.provenance_ref
```

- **Key:** `node.provenance_ref` (uuid, nullable) = `ledger.raw_artifact.raw_artifact_id` (**PRIMARY KEY**).
- **Fan-out:** impossible under PK join; one artifact row max per node.
- **N+1 for maker fields:** no — all artifact columns selected in the single run-scoped query (`serve/index.ts:1581–1619`). Per-node work after the query is `#liveness.readSubjectStaleness` (pre-existing pattern, not introduced by maker join).

### Q5 — Tests that can fail if the resolver guesses

| Test | Behaviour that goes RED under guessing |
|---|---|
| `s14-ui.test.ts:169` | `toEqual(recorded)` — field invention/mutation fails |
| `s14-ui.test.ts:170–172` | partial null → must be `null` (maker/model_id/provider_ref); inventing from remaining fields fails |
| `v2ui-data-layer.test.ts:142–144` | position only `{ model_id: "gpt-5" }`; defeater stays null; inventing ids or filling root fails |
| `contract.test.ts:91–93` | omitted `maker_lineage` throws; empty `maker` throws |
| `database.test.ts:833–839` | end-to-end projection identity must match ledger-recorded tuple |

Independent live import of `projectNodeMakerLineage` reproduced the null-any-missing gate including `provider: null` (covered by source gate; unit names three of four — see A1).

Targeted vitest this seat (not orchestrator gate re-run): `s14-ui` + `contract` + `v2ui-data-layer` → **3 files / 63 tests passed**.

---

## BLOCKING

_None._

---

## ADVISORY

### A1 — Unit test does not name `provider: null` (gate is present)

**Where:** `tests/unit/s14-ui.test.ts:170–172` asserts maker / model_id / provider_ref null → null; does **not** assert `provider: null`.  
**Law / scenario:** mission defect class “checks that cannot fail for the reason their author believed” — if someone deleted only the `recorded.provider === null` arm, current unit suite stays green.  
**Mitigation already shipped:** source still gates provider (`serve/index.ts:117`); live import this review returned null for provider-null.  
**Failing case to add:** `expect(projectNodeMakerLineage({ ...recorded, provider: null })).toBeNull()`.

### A2 — Secondary `DebateTree` role/worker badges empty on model-id-only generation

**Where:** `apps/v2-ui/components/DebateTree.tsx:179–180`  
**Scenario:** if `ArgumentFocusView` / `DebateTree` is fed a V3-projected node with `{ model_id }` only, empty role/worker badge spans render (not a fabricated role string — React drops `undefined` children). Primary DebatePageClient surfaces (Canvas/Thread/Split/Map/Drawer) do not paint `generation.role`.  
**Not DR-115 false maker** — cosmetic secondary-surface residue.

### A3 — Empty-string identity members pass the resolver, fail the schema

**Where:** `projectNodeMakerLineage` null-gates only `=== null`, not `""` (live probe: `maker: ""` returns an object with empty maker).  
**Boundary:** `MakerLineageSchema` / `NodeSchema` reject `maker: ""` (`min(1)`; unit `contract.test.ts:93`); API parse fail-closes rather than serving a confident badge. Ledger insert columns are NOT NULL without length checks (`migrations/0000_s00.sql:143–146`).  
**Scenario:** corrupted empty-string ledger row would 500 at serve parse instead of silent wrong attribution — fail-closed for honesty, noisy for availability. Defense-in-depth could treat blank strings as unresolved inside the projector.

---

## Author-claim cross-check (hypothesis → source)

| Claim | Verified? |
|---|---|
| `NodeSchema` requires `maker_lineage` nullable | **Yes** `contract/index.ts:278` |
| Join + project complete identity; null if any required member unresolved; never guess from model-id string | **Yes** Q1 |
| Adapter fills model-id-only presentation; no invented role/argument/worker/created_at; `active_generation_id` null | **Yes** `adapter.ts:136–139` |
| V2 presentation components unchanged | **Yes** for `ModelPresentation.tsx`; types widened via `GenerationPresentation` (necessary seam, not a surface redesign) |
| Additive node field; no migration; no package-edge change needed; projector has production caller | **Yes** (join-on-read; `readNodesForRun` caller) |

---

**Comments read through:** review packet only (independent lens; peer verdict unread).  
**READY FOR PEER REVIEW** — Grok UI-02b rev1 verdict filed.
