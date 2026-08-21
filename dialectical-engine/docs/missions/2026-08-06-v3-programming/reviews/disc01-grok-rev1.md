# DISC-01 dual-diamond review — Grok lens (rev1)

**Ticket:** `t_1589a6cc` · **Board:** `debateai-v3`  
**Reviewer:** Grok (independent dual-diamond lens; DR-171 authorizing seat that granted the plan with ten binding conditions)  
**Date:** 2026-08-14  
**Ground truth (read in order):** `reviews/dr181-architecture-plan.md` · `reviews/dr181-grok-verdict.md` (binding conditions 1–10) · ledger **DR-181** / **DR-182** · `goal-packets/DISC-01-codex-goal.md` · `handoffs/DISC-01-codex-handoff.md`  
**Mode:** real tree read-only for product code; sole real-tree write is this file. DR-163 clone `/private/tmp/disc01-grok-clone` (via `cp -Rc` of parent root) used for inventory/static reads only; deleted after. Standing stack untouched. No product/stack runs (OBJECTIVE). Did not read or coordinate with the Opus lens. No commits/pushes/merges.

## Verdict

**BLOCKING**

All ten Grok authorization conditions are implemented on the discovery / runner / DDL / tripwire / harness surfaces under DR-182 law (including **Grok's** claim-time gap-death mechanism, not architect-(a) DR-174 courtesy hold). D1 is closed; the second panel-size refusal is dead; identity CHECK + write-side land together; tripwire dominance holds for M∈{1,2,3} at depths 1–5; the mono band step is **RULED** (DR-133 ladder ordinal, not an invented number).

The gate that fails this lens is **suite shrink**: the rewrite of `tests/render/ux01-new-debate-form.test.tsx` (18 → 3 tests) dropped at least one **load-bearing non-apparatus** assertion — the PROV-01 pin that a user-edited risk tier is wired as `tier_source: "ASKER"` / `tier_provenance_ref: "asker:ui-selection"` through `buildNewDebateAskConfig` — without re-pinning it. Under the DISC-01 dual-diamond objective that alone is BLOCKING. Residual product notes (product API ask-time re-probe seam) are secondary and do not by themselves overturn the condition table.

---

## Ground truth and delta surface

**Parent git root:** `/Users/vladmihaimiron/Documents/DebateAIRO`  
**Base:** `2fea51b` — `DR-182: discovery value rows ruled (Grok's gap-death mechanism wins) + DISC-01 cut`  
**Working tree:** uncommitted DISC-01 implementation on top of that base (handoff workspace was non-git scratch; work landed in the user root).

**Tracked `git diff --stat 2fea51b -- DebateAI-V3`:** 55 files, **+948 / −1525**.

**Untracked product surfaces in the same delta (must be treated as shipped):**

| Path | Role |
|---|---|
| `acceptance/discovery.ts` | `probeProvider` / `discoverPanel` / `resolveFreshDiscovery` |
| `migrations/0022_dr181_discovery.sql` | `core.provider_probe` + `run_panel_count_identity` |
| `tests/support/discoveredPanel.ts` | fixtures |
| `tests/unit/dr181-discovery.test.ts` | T1/T2/T3/T5 unit pins |
| `tests/unit/dr181-ceiling.test.ts` | T7/T8/T9 |

**Production / policy surfaces (representative):**

| Path | Role |
|---|---|
| `acceptance/model-shim.ts` | D1 handshake + CLI-reported model id |
| `acceptance/run-acceptance.ts` | `Promise.allSettled` boot; `--agent-count` retired |
| `acceptance/main.ts` | claim-time probe + ask-time freshness re-probe; `claimMs` floor |
| `apps/runner/src/index.ts` | claim gap-death; mono marks/disclosure; `applySingleLineageBandCap` |
| `apps/api/src/index.ts` / `main.ts` | admission from discovered panel; structural ceiling |
| `packages/db/src/index.ts` | write-side `jsonb_array_length` for `agent_count` |
| `packages/register/src/index.ts` | `computeStructuralCeilingBasis` + `readPanelDiscoveryPolicy` |
| `packages/critique/src/index.ts` | mono serves; `applyCriticUnavailableCap` |
| `apps/v2-ui/app/new/defaults.tsx` | M-apparatus derivation **deleted** |
| `acceptance/seed-register.ts` | `panelDiscoveryPolicy` 600_000 / 1 attempt (DR-182) |

**Handoff-reported suite:** root **581** / acceptance **41** (OBJECTIVE: no re-run by this seat; counts taken as claimed and cross-checked statically below).

---

## Binding conditions checklist

Law for open rows: **DR-182 supersedes** condition-1 / condition-10 "park VROW" language. Freshness, mono serve, high-stakes band cap, tripwire keep, no `/new` widget, and **Grok gap-death** are RULED. Judgment below uses that bar.

| # | Topic | Judgment | Evidence |
|---|---|---|---|
| GT | Delta is DISC-01 surface vs `2fea51b` | **PASS** | 55 tracked files + untracked discovery/migration/tests; inventory matches handoff change list |
| BC1 / DR-182 values | Ruled VROW packet (not invented) | **PASS** | `probe_freshness_ms: 600_000`, `probe_max_attempts: 1` seeded `acceptance/seed-register.ts:189-195` with `acceptance:DR-182:V-approved`; mono marks+disclosure runner `:1544-1568`; high-stakes no refuse `critique/src/index.ts:332-339`; tripwire keep `register/src/index.ts:166-196`; no `/new` "models found" strip (`ux01` pageSource pin + defaults kill); gap-death Grok path runner `:840-894` |
| BC2 / D1 | Model-shim hardcoded id **dead**; handshake-reported ids only | **PASS** | Pre: `ACCEPTANCE_MODEL = "gpt-5.6-sol"`. Post: `acceptance/model-shim.ts` — **no** `ACCEPTANCE_MODEL`; `parseCodexCompletion` `:45-69` requires exactly one CLI-reported `model` else `CODEX_CLI_MODEL_UNRESOLVED`; `startModelShim` `:86` `invokeCli(...)` then `model: handshake.model` `:96`. Fixture CLI may emit `gpt-5.6-sol` as **report**, not as adapter literal |
| BC3 / VROW-5 | `RUN_MAKER_CONFIGURATION_MISMATCH` not a panel-size refuse; **Grok** gap-death | **PASS** | Symbol **CLEAN** in shipped `apps`/`packages`/`acceptance`. Claim path `:840-894`: providerRef map (not count/`slice`); optional **one** `claimTimeProbe` (no cooldown hold); ABSENT → `provider_probe` record; shrink `configuredMakers`; empty → `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` `:889-893` (loud typed); remainder serves with `CLAIM_PANEL_REVISED:…` disclosure `:1560-1580`. **Not** DR-174 10-minute claim hold |
| BC4 / T4 | Identity CHECK + write-side in **one** delta; no independent `agentCount` input | **PASS** | Migration `0022_dr181_discovery.sql:24-31` `run_panel_count_identity` CHECK `agent_count = jsonb_array_length(discovered_panel)` (`NOT VALID` = legacy rows; new rows enforced). Write: `packages/db/src/index.ts:349-355` binds `jsonb_array_length($12::jsonb)` — **no** `input.agentCount`. `StartRunInput` `:205` is `discoveredPanel` only. `AskRequestSchema` has **no** `agent_count`. Wire/UI/API/v2-ui free of asker `agentCount` input |
| BC5 / T7·T8·T9 | Tripwire pins; independent ceiling dominance; M-apparatus absent | **PASS** | Formula `computeStructuralCeilingBasis` `register/src/index.ts:167-196`. T7/T8: `tests/unit/dr181-ceiling.test.ts:15-47` enumerates M=1..8 × d=1..5 against plan builders; pins `RUNNER_*` exports. T9: same file `:60-74` + this seat's shipped-source sweep **CLEAN** for `DR159_RATIFIED_MAKER_COUNT`, `assertRatifiedMakerCount`, `RUN_MAKER_COUNT_EXCEEDS_RATIFIED_ENVELOPE`, `TEST_ONLY_UNRATIFIED_MAKER_COUNT_BYPASS`, `deriveRatifiedMakerMaximum`, `RUN_MAKER_CONFIGURATION_MISMATCH`, `runCostEnvelopeSelection`, … — sole remaining count-ish string is acceptance **report** `FAIR_DEBATE_MAKER_COUNT_UNSATISFIED` (`fair-debate.ts:71`, plan RECORD-ONLY) |
| BC6 | Harness touch-list re-pinned **in this delta** | **PASS** | Diff removes `--agent-count` / `agent_count: 2` from `xrev01-depth1-proof.ts`, `panel01-depth1-proof.ts`, `ceremony.test.ts`, `run-acceptance.test.ts`, `run-acceptance.ts` supportedArguments; README prose re-written for discovery/DR-182 |
| BC7 | `claimMs` floor holds | **PASS** | Runner still calls `assertClaimCoversCall` `apps/runner/src/index.ts:724-735` with deadline + optional hold terms. Acceptance: `claimMs: longestDeadline * maximumRunAttempts + cooldownMs * maxCooldownHoldsPerRun` `acceptance/main.ts:245-260` where `maximumRunAttempts` is the **computed structural ceiling** at depth 5 × configured panel — dominates plan §2.3 / `assertClaimCoversCall` required bound |
| BC8 | No keys, no evaluator, no Hatchet parity theatre | **PASS** | No key material; discovery uses CLI handshake only; `apps/runner/src/main.ts` not expanded into Hatchet claim-probe parity theatre (plan §6 non-goal) |
| BC9 | ASK-01 rev2 not widened; R2/`deriveRatifiedMakerMaximum` removed with M-kill | **PASS** | `defaults.tsx` is session/risk/ask-wire only; `deriveRatifiedMakerMaximum` **absent** from shipped source (T9) |
| BC10 / DR-182 gap | No architect-(a) claim hold; no pure die-loud on partial loss | **PASS** | Partial loss serves (`database.test.ts:1369-1401`); empty dies loud (`:1405-1431`); no claim-time cooldown sleep on the gap path |
| Band-cap value | RULED ordinal, not invented number | **PASS** | Cap is **step one lower on existing `bandOrder`**: `applySingleLineageBandCap` `apps/runner/src/index.ts:610-620`; seed `wayOfKnowingCeiling.bandOrder = ["CAPPED","FULL"]` `seed-register.ts:146-158` with `sourceRef: acceptance:DR-133:V-approved`. Ledger DR-133: wayOfKnowingCeiling default **FULL**, reasoning cut → **CAPPED**. `applyCriticUnavailableCap` only sets `confidenceBandCapRequired` — no new numeric. Handoff "FULL→CAPPED" is the ruled adjacent step |
| Suite 589→581 | Every removed test justified; no load-bearing non-apparatus loss | **FAIL** | See § Suite shrink audit — **PROV-01 pin lost** |
| F1 | New tests drive shipped paths; no theatre | **PASS** | `dr181-discovery` / `dr181-ceiling` / claim-gap integration: no `expect(true)`, no `.skip`; discovery spawns real fixture CLIs; ceiling calls `computeStructuralCeilingBasis` + runner plan builders; T4 hits real PG CHECK |

---

## Binding conditions — detailed evidence

### BC2 — D1 dead (handshake-reported ids only)

```text
acceptance/model-shim.ts:45-69  parseCodexCompletion → unique CLI model or CODEX_CLI_MODEL_UNRESOLVED
:72-78  adapter buildArguments: ["exec","--json",prompt] — no model= literal
:86-96  startModelShim: invokeCli handshake; handle.model = handshake.model
```

Repo-wide `ACCEPTANCE_MODEL` remains only in **prior review prose**, not shipped TS.

### BC3 — Gap-death is Grok/DR-182 (not DR-174 courtesy)

```text
apps/runner/src/index.ts:833-894
  configuredByProviderRef = Map(providerRef → maker)
  for member of run.discoveredPanel:
    missing gateway → ABSENT CLAIM_GATEWAY_UNRESOLVED
    else claimTimeProbe once → ABSENT or HEALTHY (model identity change → ABSENT)
    ABSENT → ProviderProbeRepository.record(...) + absentAtClaim; continue
  if configuredMakers.length === 0 → RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM
acceptance/main.ts:329-342  production claimTimeProbe: one relay probe, no hold/wait
:1544-1580 mono/multi disclosure CLAIM_PANEL_REVISED + MONO_LINEAGE_DEPTH_NOT_EXPANDED
```

`RUN_MAKER_CONFIGURATION_MISMATCH` and count-`slice` are gone from shipped source.

### BC4 — Identity CHECK + write-side together

```text
migrations/0022_dr181_discovery.sql:27-31
  CHECK (jsonb_typeof(discovered_panel)='array'
     AND agent_count = jsonb_array_length(discovered_panel)) NOT VALID

packages/db/src/index.ts:347-355
  INSERT … agent_count, discovered_panel
  VALUES (…, jsonb_array_length($12::jsonb), $12::jsonb, …)
```

No independent `agentCount` on `StartRunInput` or `AskRequestSchema`.

### BC5 — Tripwire arithmetic (independent recompute)

Engine facts pinned by exports (`RUNNER_BRANCHING_FACTOR=2`, `RUNNER_COMPOSITION_SEGMENT_CAP=2`, `RUNNER_FIXED_ORGANS_PER_COMPOSITION=4`, `RUNNER_MAX_RECOMPOSE=2`) and organ/death bounds A=3, holds=2, final_retry=1.

Independent worst case (matches plan §3.2 and shipped formula):

\[
\begin{align*}
\mathrm{authored}(1,d) &= 1,\quad \mathrm{reviews}=0 \\
\mathrm{authored}(M,d) &= M(2^{d+1}-1)+M(M-1)\ (M\ge 2),\ \mathrm{reviews}=\mathrm{authored} \\
\mathrm{ceiling} &= 3(\mathrm{authored}+\mathrm{reviews})+3\cdot 8+2
\end{align*}
\]

| M | d=1 | d=2 | d=3 | d=4 | d=5 |
|---:|---:|---:|---:|---:|---:|
| 1 | 29 | 29 | 29 | 29 | 29 |
| 2 | 74 | 122 | 218 | 410 | 794 |
| 3 | 116 | 188 | 332 | 620 | 1196 |

Shipped `computeStructuralCeilingBasis` produces the same integers; T7 requires `max_model_attempts ≥ independentWorstCase` and `≥ 2·authored` for M=1..8 × d=1..5. **Dominance holds** (equality to independent worst case, strictly above `2·authored` for multi-maker).

### BC7 — claimMs floor

```text
acceptance/main.ts:245-260
  maximumRunAttempts = computeStructuralCeilingBasis({ panelSize: providers.length, depth: 5, … }).max_model_attempts
  claimMs = longestDeadline * maximumRunAttempts
           + cooldownMs * maxCooldownHoldsPerRun

apps/runner/src/index.ts:724-735
  assertClaimCoversCall({ claimMs, deadlineMs: longestDeadline, marginMs, cooldownMs, maxCooldownHoldsPerRun })
```

For the acceptance organ deadlines (judge 180s) and death policy (600_000 × 2 holds), claim duration is far above the single-call hold floor in `packages/battery/src/index.ts:226-230`.

### Band-cap provenance (emphasized OBJECTIVE check)

| Claim | Finding |
|---|---|
| Cap **value** invented? | **No.** Ordinal step on DR-133 `bandOrder` |
| Mechanism | `applySingleLineageBandCap(candidate, bandCeiling)` → `bandOrder[index-1]` when `index ≥ 1`, else loud `CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED` |
| Ruled row | `wayOfKnowingCeiling` / `acceptance:DR-133:V-approved`; ledger DR-133 text: default FULL, reasoning cut → CAPPED |
| `applyCriticUnavailableCap` | Marks + `confidenceBandCapRequired` only (`critique/src/index.ts:342-356`); does not mint a band label |

---

## Suite shrink audit (589 → 581)

Handoff claims root **589 → 581** (−8). Static `it(`/`test(` inventory on `tests/` (including `it.each` expansion for the new N-generic discovery cases) shows a net drop concentrated in:

| Removed test (name) | Apparatus-death justification? |
|---|---|
| `grok01-envelope-derivation.test.ts` — recomputes depths 1..5 from topology… | **Yes** — envelope derivation module deleted |
| ux01 — caps configured makers at the ratified guard… | **Yes** — M-guard / `deriveRatifiedMakerMaximum` retired |
| ux01 — M7 refuses non-Set-A envelope ceiling | **Yes** — Set A / runCostEnvelope table retired |
| ux01 — B2 absent provider set vs risk floor | **Yes / re-pinned** — risk floor retained via `deriveRiskTierDefault` test |
| ux01 — B2/B5 absent risk floor / envelope fabrication | **Yes** — envelope path dead; risk absence still throws in `deriveRiskTierDefault` |
| ux01 — MUTATION decision_owner / action_owner | **Re-pinned** — `deriveSessionAskDefaults` in new test 3 |
| ux01 — MUTATION as_of refreshes untouched machine time | **Re-pinned** — `asOfWasEdited: false` → submitTime ISO in new test 1 |
| ux01 — DR-180 machine controls / Advanced collapsed-submit / ASK-01 ratified=2 live regression | **Yes** — Advanced / ratified panel apparatus |
| ux01 — B5 field-local absence of agent/envelope | **Yes** — fields retired |
| ux01 — R3 Options aria-controls | Soft; Options still present for labeled non-carried V2 knobs — a11y pin weakened (**advisory**) |
| ux01 — DR-166-A two tokens through real page | Weakened to single-session `deriveSessionAskDefaults` (**advisory**) |
| ux01 — B6 preserve edited as_of | Live page hardcodes `asOfWasEdited: false` (`page.tsx:125`); edit-preserve path unused on Start — not load-bearing for current product law ("refreshed when Start is clicked") |
| ux01 — **PROV-01 mutation-proof: user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT** | **NO — load-bearing non-apparatus pin LOST** |
| ux01 — MUTATION decision_scope: keeps V | Soft loss of explicit `DECISION_SCOPE_DEFAULT` pin (**advisory**; constant still `personal` + DR-166 comment) |
| pol01 — absent UI policy vs present NULL (runCostEnvelopeFromDeployment) | **Yes** — envelope UI derivation retired |
| v2ui-data-layer — three deployment envelope projection/selection/fail-loud tests | **Yes** — `runCostEnvelopeSelection.ts` deleted |

### BLOCKING detail — PROV-01 pin

Production path still implements the provenance law:

```text
apps/v2-ui/app/new/defaults.tsx:68-69
  tier_source: riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT"
  tier_provenance_ref: riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor"
apps/v2-ui/app/new/page.tsx:176-178  select onChange → setRiskTierWasEdited(true)
:126  riskTierWasEdited passed into buildNewDebateAskConfig
```

But after the ux01 rewrite, **no test** drives `riskTierWasEdited: true` through `buildNewDebateAskConfig` and asserts `tier_source === "ASKER"`. Remaining suite mentions of `tier_source: "ASKER"` are fixture literals on other paths (API/contract), not this derivation. That is exactly a load-bearing non-apparatus mutation pin killed as collateral of apparatus cleanup — **BLOCKING** under the DISC-01 review objective.

### F1 sweep (new / heavily changed)

| File | Theatre markers | Drives shipped path? |
|---|---|---|
| `tests/unit/dr181-discovery.test.ts` | none | Yes — real `discoverPanel` / `resolveFreshDiscovery` / `parseCodexCompletion` |
| `tests/unit/dr181-ceiling.test.ts` | none | Yes — `computeStructuralCeilingBasis` + runner plan exports; T9 reads shipped source |
| `tests/integration/database.test.ts` T4 + claim-gap | none | Yes — real embedded PG identity CHECK + runner claim probe |
| `tests/render/ux01-new-debate-form.test.tsx` | none | Partially — config/defaults/pageSource; **missing PROV-01 edit path** |

---

## Residual notes (non-gating alone; recorded for the other lens / rework)

1. **Product API ask-time re-probe seam.** `acceptance/main.ts:369-404` re-probes stale providers and records ABSENT. `apps/api/src/main.ts:43-57` only **filters** latest HEALTHY rows inside `probeFreshnessMs` — no re-probe, no ABSENT append. Under plan §1.3 / DR-182, a stale-only inventory can refuse with empty panel without the mandated one attempt. Plan §6 forbids Hatchet parity theatre; still a composition hole if the Hatchet API is expected to own discovery. **Advisory relative to BC table; fix when product API is claimed complete.**
2. **`claimTimeProbe` optional.** Runner skips re-probe when unset (`:845`). Acceptance wires it; `apps/runner/src/main.ts` does not (non-goal parity).
3. **`run_panel_count_identity` NOT VALID.** New inserts enforced; pre-migration rows not rewritten. Honest deploy choice (handoff review focus) — not a BC fail.
4. **T9 test symbol list** omits `RUN_MAKER_CONFIGURATION_MISMATCH` / `runCostEnvelopeSelection`; this seat's independent sweep still CLEAN.

---

## Required rework to lift BLOCKING

Re-pin **at least** the PROV-01 mutation on the real shipped function (recommended minimal):

```ts
// tests/render/ux01-new-debate-form.test.tsx (or unit sibling)
expect(buildNewDebateAskConfig({
  …, riskTier: "high-stakes", riskTierWasEdited: true, asOfWasEdited: false
}, submitTime)).toMatchObject({
  risk_tier: "high-stakes",
  tier_source: "ASKER",
  tier_provenance_ref: "asker:ui-selection"
});
expect(buildNewDebateAskConfig({
  …, riskTierWasEdited: false
}, submitTime)).toMatchObject({
  tier_source: "MACHINE_DEFAULT",
  tier_provenance_ref: "machine:deployment-floor"
});
```

Optional hygiene (not required to clear this seat once PROV-01 is back): decision_scope default pin; product API resolveFreshDiscovery wiring.

---

## Summary table (emphasized OBJECTIVE checks)

| Emphasized check | Result |
|---|---|
| (1) D1 hardcoded id dead; handshake ids only | **PASS** |
| (2) No `RUN_MAKER_CONFIGURATION_MISMATCH` panel refuse; Grok gap-death (instant re-probe, ABSENT, shrink+disclose, serve remainder, empty=loud) | **PASS** |
| (3) Identity CHECK + write-side one delta; no independent agentCount input | **PASS** |
| (4) Tripwire T7/T8/T9; independent M=1/2/3 dominance | **PASS** |
| (5) Harness touch-list re-pinned this delta | **PASS** |
| (6) claimMs floor | **PASS** |
| (7) M-apparatus symbol sweep of shipped source | **PASS** |
| (8) Mono band-cap RULED (DR-133 ordinal), not invented | **PASS** |
| Suite shrink load-bearing pins | **FAIL** (PROV-01) |
| F1 new tests | **PASS** |

VERDICT: BLOCKING
