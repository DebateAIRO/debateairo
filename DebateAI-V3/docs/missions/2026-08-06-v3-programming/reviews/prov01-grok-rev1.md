# PROV-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_779f40b3` · **Board:** `debateai-v3`  
**Title:** [Codex] PROV-01 · The persisted tier_source must not claim ASKER for a machine-derived default (contract member needed)  
**Reviewer:** Grok (independent read-only dual-diamond lens; DR-153)  
**Date:** 2026-08-13  
**Inputs:** ticket body (`hermes kanban --board debateai-v3 show t_779f40b3`), `goal-packets/PROV-01-codex-goal.md`, `handoffs/PROV-01-codex-handoff.md`; judged from **shipped source + re-run checks**, not handoff trust alone.  
**Mode:** READ-AND-RUN. Product / test / migration sources not edited. Sole workspace write is this review. Did **not** read any peer (Opus) PROV-01 verdict.

## Verdict

**APPROVED**

All six OBJECTIVE axes **PASS**. The ask path no longer lies about who chose the risk tier: untouched deployment-floor prefill ships and persists as `MACHINE_DEFAULT` / `machine:deployment-floor`; a real select edit ships as `ASKER` / `asker:ui-selection`; policy escalation still replaces source with `DEPLOYMENT_POLICY` when the floor raises; honesty surfaces name the new supplier in plain words; contract regeneration is byte-stable; architecture is green; DB CHECK admits the new member.

Advisories below are non-gating. None substitutes for a failed axis.

---

## Decision table (six axes)

| # | Axis | Result | Source / test proof |
|---|---|---|---|
| **1** | New contract `tier_source` member + provenance-ref convention | **PASS** | Kernel mints `MACHINE_DEFAULT` once: `TIER_SOURCES = ["ASKER", "MACHINE_DEFAULT", "DEPLOYMENT_POLICY"]` (`packages/kernel/src/index.ts:105–106`). Contract `TierSourceSchema = z.enum(TIER_SOURCES)`; ask input `AskTierSourceSchema = z.enum(["ASKER", "MACHINE_DEFAULT"])` (`packages/contract/src/index.ts:5–6,110–111`). Provenance convention: `machine:deployment-floor` on untouched path (`defaults.tsx:128–129`). Unit: `TierSourceSchema.options` equality + `AskRequestSchema.parse(… MACHINE_DEFAULT …)` (`tests/unit/contract.test.ts:43–59`); kernel list pin (`tests/unit/budget-s09.test.ts:104–105`). |
| **2** | Form sends `MACHINE_DEFAULT` only when user did **not** touch tier; `ASKER` only on real edit — from real form state, never guessed | **PASS** | Real React state `riskTierWasEdited` starts `false` (`page.tsx:58`); select `onChange` sets it `true` (`page.tsx:228–230`); submit passes the flag into `buildNewDebateAskConfig` (`page.tsx:178`). Derivation is a pure ternary on that flag (`defaults.tsx:128–129`) — no value-equality guess. Browser client validates explicit source (`apps/v2-ui/lib/api.ts:269–282`). Render: collapsed untouched submit expects `MACHINE_DEFAULT` / `machine:deployment-floor` (`ux01-new-debate-form.test.tsx:326–342`); edited path expects `ASKER` (`…:354–375`). |
| **3** | Engine accepts/persists with **no behaviour change beyond provenance** (escalation identical) | **PASS** | Admission calls `resolveRisk(ask.risk_tier, ask.tier_source, ask.tier_provenance_ref)` (`apps/api/src/index.ts:308`). Composition root (`apps/api/src/main.ts:33–46`) still runs pure `resolveEffectiveRiskTier` (rank raise only); when result is `DEPLOYMENT_POLICY`, that wins unchanged; otherwise submitted `tierSource` is preserved (so `MACHINE_DEFAULT` survives). Pure resolver still raises parent→run→deployment and never lowers (`packages/register/src/index.ts:400–415`; pin in `budget-s09.test.ts:108–122`). Unit: `preserves MACHINE_DEFAULT provenance through admission without changing the effective tier` (`api.test.ts:68–91`). DB round-trip of `MACHINE_DEFAULT` / `machine:deployment-floor` (`database.test.ts:502–515`). |
| **4** | Honesty surfaces render it in plain words | **PASS** | Exhaustive switch: `case "MACHINE_DEFAULT": return "machine default from the deployment floor"` (`apps/v2-ui/lib/v3/labels.ts:3–8`). Drawer line: `Risk tier {…} · {riskTierSourceLabel(answer.tier_source)} · {answer.tier_provenance_ref}` (`AnswerHonestyDrawer.tsx:86`). Unit: all three suppliers named (`v2ui-data-layer.test.ts:409–412`). |
| **5** | Contract regeneration zero-drift, architecture green, DB vocabulary constraints | **PASS** | This seat: `pnpm run generate:contract` then `cmp before.sha after.sha` → exit 0; hashes identical to handoff (`client.ts` `3070f4a8…`, `field-inventory.json` `7ae750c4…`, `openapi.json` `b0a975fe…`). Architecture: `pnpm vitest run tests/architecture` → **14 files / 50 passed**. Migration `0020_prov01_machine_default.sql` replay-safe `DROP CONSTRAINT IF EXISTS` + CHECK `IN ('ASKER', 'MACHINE_DEFAULT', 'DEPLOYMENT_POLICY')`; architecture pin (`s09-contract.test.ts:12–16`). Embedded PostgreSQL: **37/37** including MACHINE_DEFAULT insert/return. |
| **6** | Two-direction mutation claims (untouched→ASKER red; edited→MACHINE_DEFAULT red) | **PASS** | Untouched kill: `DR-166-B + MUTATION collapsed-submit` requires `tier_source: "MACHINE_DEFAULT"` and `tier_provenance_ref: "machine:deployment-floor"` on real page submit (`ux01-…:339–342`) — shipping ASKER fails that MatchObject. Edited kill: `PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT` drives real select `onChange` to `casual`, re-renders, submits, expects ASKER / `asker:ui-selection` **and** `not.toMatchObject({ tier_source: "MACHINE_DEFAULT" })` (`ux01-…:354–375`). This seat re-ran both green inside the focused suite (**110 passed | 1 skipped**). DR-163: no production mutation re-injected; inverted assertions are the kill. |

**Overall:** **APPROVED** (consistent with six PASS axes).

---

## Grounding (defect / packet)

**Defect (UX-01 confirming diamond):** form now defaults `riskTier` to the deployment floor (honest UI hint), but the ask POSTED `tier_source: "ASKER"` / `tier_provenance_ref: "asker:ui-selection"`. The **persisted record claimed the user chose a value the machine chose** — DR-115 at the provenance layer. Contract ask vocabulary admitted only `"ASKER"` on this path, so the fix is a **contract member**, not a UI-only patch.

**DELIVERS (packet):**

1. `MACHINE_DEFAULT` member + provenance-ref convention  
2. Form sends it from real touched state; ASKER only on real edit  
3. Engine accepts/persists; escalation behaviour identical beyond provenance  
4. Honesty surfaces plain words  
5. generate:contract zero-drift; architecture green; migration if DB constrains  
6. Mutation-proof both directions  

Shipped disposition matches: first-pass Codex implementation on shared `dev` workdir; ticket status `review`; `READY FOR PEER REVIEW — PROV-01` at 2026-08-13 15:28.

---

## Axis (1) — contract member + provenance-ref

### Production

```105:106:packages/kernel/src/index.ts
export const TIER_SOURCES = ["ASKER", "MACHINE_DEFAULT", "DEPLOYMENT_POLICY"] as const;
export type TierSource = typeof TIER_SOURCES[number];
```

```5:6:packages/contract/src/index.ts
export const TierSourceSchema = z.enum(TIER_SOURCES);
export const AskTierSourceSchema = z.enum(["ASKER", "MACHINE_DEFAULT"]);
```

Ask wire field: `tier_source: AskTierSourceSchema` (DEPLOYMENT_POLICY is an answer/run outcome of policy, not an ask submission). Provenance string convention on the machine path is `machine:deployment-floor` (paired with ASKER's existing `asker:ui-selection`).

### Evidence this seat

- `tests/unit/contract.test.ts` — MACHINE_DEFAULT parse + full `TierSourceSchema.options`  
- `tests/unit/budget-s09.test.ts` — kernel `TIER_SOURCES` triple  

---

## Axis (2) — form touched-state honesty

### Production path

1. `useState(false)` for `riskTierWasEdited` (`page.tsx:58`).  
2. Deployment floor prefill mutates only `riskTier` value, **not** the edited flag (`page.tsx:97–99`).  
3. User `select` change: `setRiskTier` + `setRiskTierWasEdited(true)` (`page.tsx:228–230`).  
4. `buildNewDebateAskConfig` ternary (`defaults.tsx:128–129`):

```128:129:apps/v2-ui/app/new/defaults.tsx
    tier_source: defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT",
    tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor",
```

5. `createDebate` refuses unknown sources; forwards explicit fields without inventing (`api.ts:269–282`).

Distinction is **boolean form state**, not “value equals floor” inference — re-selecting the floor value after a touch still correctly marks ASKER.

### Evidence this seat

- Untouched collapsed submit: `tier_source: "MACHINE_DEFAULT"`  
- Edited select → submit: `tier_source: "ASKER"`  

---

## Axis (3) — engine admission / persistence / escalation

### Escalation algorithm unchanged

`resolveEffectiveRiskTier` still:

- requires non-empty provenance  
- ranks asker vs policy (parent → run → deployment)  
- **raises only**, never lowers  
- returns `DEPLOYMENT_POLICY` when policy rank > asker rank; otherwise effective tier = asker tier with source labeled `"ASKER"` inside the pure function  

Composition root then **preserves submitted source when policy did not raise**:

```33:46:apps/api/src/main.ts
  resolveRisk(askerRiskTier: RiskTier, askerTierSource: AskRequest["tier_source"], askerProvenanceRef: string) {
    const resolved = resolveEffectiveRiskTier({ /* … */ });
    return resolved.tierSource === "DEPLOYMENT_POLICY"
      ? resolved
      : { ...resolved, tierSource: askerTierSource };
  }
```

So a machine-defaulted floor at the same effective tier keeps `MACHINE_DEFAULT`; a raised ask becomes `DEPLOYMENT_POLICY` exactly as before. Effective tier selection is not re-derived from the new vocabulary member.

### Evidence this seat

- `api.test.ts` admission preserves MACHINE_DEFAULT + effective `standard`  
- `budget-s09` raise/never-lower pins still green  
- DB insert/return of MACHINE_DEFAULT + DEPLOYMENT_POLICY + ASKER (`database.test.ts`)  

---

## Axis (4) — honesty surfaces

```3:8:apps/v2-ui/lib/v3/labels.ts
export function riskTierSourceLabel(source: Answer["tier_source"]): string {
  switch (source) {
    case "ASKER": return "chosen by the asker";
    case "MACHINE_DEFAULT": return "machine default from the deployment floor";
    case "DEPLOYMENT_POLICY": return "raised by deployment policy";
  }
}
```

Drawer composes label + raw provenance ref (DR-115: both human phrase and machine ref). Switch is exhaustive over the answer-side `TierSource` vocabulary (TypeScript exhaustiveness).

---

## Axis (5) — gates / migration

| Gate | This seat observation |
|---|---|
| `pnpm run generate:contract` zero-drift | `cmp before.sha after.sha` exit 0; three SHA-256s match handoff |
| `pnpm vitest run tests/architecture` | 14 files, **50 passed** |
| Migration `0020_prov01_machine_default.sql` | `DROP CONSTRAINT IF EXISTS run_tier_source_check` + CHECK includes MACHINE_DEFAULT; architecture test pins content |
| Focused PROV-01 suites | **7 files, 110 passed, 1 skipped** (live UX01 opt-in) |
| Embedded PostgreSQL | **37 passed** (MACHINE_DEFAULT round-trip included) |

Generator inventory records routes/fields rather than enum values — regenerating after the enum change is still byte-stable, as handoff claimed and this seat reconfirmed.

---

## Axis (6) — two-direction mutation

| Direction | If product inverted… | Test that goes red |
|---|---|---|
| Untouched prefill wrongly sent as ASKER | `toMatchObject({ tier_source: "MACHINE_DEFAULT", tier_provenance_ref: "machine:deployment-floor" })` fails | `DR-166-B + MUTATION collapsed-submit` |
| User edit wrongly sent as MACHINE_DEFAULT | `toMatchObject({ tier_source: "ASKER", … })` fails **and** explicit `not.toMatchObject({ tier_source: "MACHINE_DEFAULT" })` fails | `PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT` |

Both cases exercise the **real** `/new` page module (import + render harness + form submit → `createDebate` mock), not a re-implemented config builder. This review did not rewrite production to force RED (DR-163); the inverted assertions are the durable kill.

---

## Re-run evidence (this seat)

Scratch: `{SCRATCH}` = `/var/folders/h7/4hdbz7s15hjbyj6scmk_nx3r0000gn/T/grok-goal-cc69776725a4/implementer`

### Focused (`prov01-focused.log`)

```text
pnpm vitest run tests/unit/contract.test.ts tests/unit/budget-s09.test.ts \
  tests/unit/api.test.ts tests/unit/v2ui-data-layer.test.ts \
  tests/unit/pol01-policy.test.ts tests/render/ux01-new-debate-form.test.tsx \
  tests/architecture/s09-contract.test.ts

Test Files  7 passed (7)
Tests       110 passed | 1 skipped (111)
Duration    1.89s
```

Named PROV-01-relevant cases observed green include:

- `declares POST /v1/asks…` (MACHINE_DEFAULT admit)  
- `names asker choice, machine prefill, and policy escalation as distinct tier suppliers`  
- `preserves MACHINE_DEFAULT provenance through admission without changing the effective tier`  
- `renders every tier supplier in plain words`  
- `builds the ask strictly from user-supplied fields…` (MACHINE_DEFAULT forward)  
- `DR-166-B + MUTATION collapsed-submit` (untouched MACHINE_DEFAULT)  
- `PROV-01 mutation-proof: a user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT`  
- `PROV-01 extends the frozen run vocabulary for an honestly recorded machine default`  

### Contract + architecture (`prov01-contract-arch-combined.log`)

```text
$ pnpm run generate:contract  # exit 0
cmp before.sha after.sha: exit 0
3070f4a80167f6ffb2a2f7af360a2f66f968a59de6d827c49eaaeb91c3b7046d  packages/contract/generated/client.ts
7ae750c4e30d54723856ae911c992cf29cbe45e1eb6e2a33ce1c5ae1e81157bf  packages/contract/generated/field-inventory.json
b0a975fee99502956ae48c207477a667f7e91d1df5e5a1f2affd7e9a6882aab0  packages/contract/generated/openapi.json

$ pnpm vitest run tests/architecture
Test Files  14 passed (14)
Tests       50 passed (50)
Duration    2.71s
```

### Database (`prov01-db.log`)

```text
$ pnpm vitest run tests/integration/database.test.ts
Test Files  1 passed (1)
Tests       37 passed (37)
Duration    2.87s
```

---

## Advisories (non-blocking)

### A1 — pure resolver vocabulary still labels non-escalated as `"ASKER"`

`resolveEffectiveRiskTier` return type is `"ASKER" | "DEPLOYMENT_POLICY"` (`packages/register/src/index.ts:378`). Non-escalated path always sets `tierSource: "ASKER"` internally; `apps/api/src/main.ts` rewrites to the submitted source. Correct for PROV-01 behaviour, but the pure function’s label is no longer a complete picture of non-policy suppliers. Future callers that bypass the composition root could re-lie. Optional follow-up: widen the pure return type or stop assigning a supplier inside the pure raise algorithm.

### A2 — legacy `web/app/new/page.tsx` still hardcodes ASKER

The S14 native UI path still posts `tier_source: "ASKER"` / `asker:ui-selection`. PROV-01 inventory and the living V2 workspace surface are `apps/v2-ui`. Out of ticket scope; not a FAIL of the six axes as written.

### A3 — shared dirty `dev` workdir

Handoff notes substantial pre-existing uncommitted work co-located with PROV-01 hunks. This review judged PROV-01 identifiers and behaviours (listed inventory), not the entire dirty tree as one claim.

---

## Disposition

| Field | Value |
|---|---|
| Overall | **APPROVED** |
| Axes | 6 / 6 **PASS** |
| Peer diamond | Opus lens not read (spine §7) |
| Product edits by this seat | none |
| Artifact | `docs/missions/2026-08-06-v3-programming/reviews/prov01-grok-rev1.md` |

**READY FOR PEER REVIEW consolidation / Hermes stage gate** — Grok PROV-01 rev1 complete.
