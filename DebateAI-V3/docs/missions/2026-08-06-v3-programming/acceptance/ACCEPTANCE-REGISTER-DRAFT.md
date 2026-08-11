# Acceptance run — register value-set DRAFT for V's approval (DR-126 pass)

**Nothing here is seeded until you approve.** Per AC-76 I cannot invent
register values; this is a *proposal* you rule. Approve as-is, or edit any
value and I seed what you rule. Two kinds of row below:

- **[OPERATIONAL]** — engine parameters (token ceilings, deadlines, budget
  sizes, contract hashes, epsilon). I propose sane real values; a rubber-stamp
  is fine.
- **[SUBSTANTIVE]** — genuine rulings about *how the engine judges* (risk tier,
  way-of-knowing band caps, claim-type composition). Please actually look.

Register version for this run: **`1`** (the bootstrap pins already live here).
Every row's `source_ref` will read `acceptance:DR-133:V-approved` once you sign.

---

## SUBSTANTIVE rows (your real calls)

### 1. `deployment risk tier` — how hard the engine works
Proposed: **`standard`** (casual = samplable/light; high-stakes = always-CROSS,
maximal). `standard` gives a full debate without the heaviest fan-out.
→ **Your call: casual / standard / high-stakes?**

### 2. `claimTypeCompositionMap` (DR-128) — how an unknown claim composes
Proposed minimal real map (one entry, evidence-aware, steelman-fidelity
weighted):
```json
{ "kind": "CLAIM_TYPE_COMPOSITION_MAP", "entries": {
  "unknown": { "branch": "EVIDENCE_AWARE", "clarityDecayPerAmbiguity": 0.1,
    "terms": [{ "metric": "steelman_fidelity", "coefficient": 1 }], "caps": [],
    "uncertaintyLadder": [{ "atMost": 1, "label": "PROVISIONAL" }] } } }
```
→ **Approve, or adjust the metric/decay/ladder label?**

### 3. `wayOfKnowingCeiling` (DR-086) — way-of-knowing caps the confidence band
Proposed: a reasoning-only debate is ceiling-capped below a looked-up/measured
one.
```json
{ "bandOrder": ["CAPPED", "FULL"],
  "ceilingLabels": ["DEFAULT_CEILING", "REASONING_CEILING"],
  "defaultCeiling": { "label": "DEFAULT_CEILING", "ceilingBand": "FULL", "liftPath": "retain-band" },
  "cuts": [{ "minimumShares": { "REASONING": 0.5 }, "label": "REASONING_CEILING",
             "ceilingBand": "CAPPED", "liftPath": "gather-evidence-to-lift" }] }
```
→ **Approve, or change the cut (e.g. the 0.5 reasoning-share threshold)?**

---

## OPERATIONAL rows (propose → you rubber-stamp)

| Row key | Proposed value | Note |
|---|---|---|
| `runCostEnvelope` | judge/composer/conformance each: maxAttempts 3, tokenCeiling 2048, deadlineMs 60000, per depth×tier | CLI calls are slower than vLLM — generous deadlines |
| `compositionBundleBudget.{low,medium,high}` | 10k / 20k / 30k bytes | serve composition budget (DR-078) |
| `convergenceEpsilon` | 0.001 | H8 stop epsilon |
| `convergenceStopDefaults` | one consolidated typed row (DR-107) | your DR-023 values; propose minimal stop set |
| `livenessPolicy` (standard) | reviewAfterMs 7d, retireAfterMs 180d | staleness windows |
| contract hashes (judge/composer/conformance/propagation/serve) | sha256 of each organ's ruled contract text | computed, not invented — real hashes of the shipped contracts |

---

## Model transport (NQ-1, your choice)

**CLI-relay shim** — a small local server exposing OpenAI-compatible
`/chat/completions`, relaying each call to the **codex CLI (GPT-5.6 Sol)**.
Real model, real output, no API key, no per-call cost beyond your existing auth.
Lineage recorded as the true maker (**OpenAI**), never "shim" — DR-115-legal
(a real call's artifact, not a fabricated double). Endpoint:
`http://localhost:<port>/v1`, model `gpt-5.6-sol`, maker `OpenAI`.

*First debate = single judge (codex/GPT). A codex+claude judge panel is a clean
follow-up (the panel code exists, unit-tested, but is a later-slice attachment
— not needed to render a full debate).*

---

## Dispatch (Hatchet/Docker is deferred — DR-121)

A supervised **one-shot acceptance ceremony** (`acceptance/run-acceptance.ts`):
boots the API against a durable local Postgres, creates a run through the real
`POST /v1/asks`, then drives the **already-tested** `WalkingSkeletonRunner
.execute()` path with the real (shim) provider — an acceptance *mechanism*, not
the deferred production runner. The UI then reads the persisted answer and
renders the debate. Recorded as DR-133.

---

## What I need from you to proceed

1. **Approve / edit the 3 substantive rows** (risk tier, composition map, band
   ceiling) and rubber-stamp the operational table.
2. **Confirm the codex-CLI shim** as the model transport (or name a different
   one).
3. Then I: seed the approved register (DR-133), build the shim + ceremony, run
   it, and put a real debate in your UI at :3000. Expect one or two iterations
   — the strict judge parser will *reject* malformed model output (correctly,
   not fabricate), so the first calls may need prompt-shape tuning.
