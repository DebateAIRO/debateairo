# DISC-01 dual-diamond review — Grok lens P8 confirm (rev2)

**Ticket:** `t_1589a6cc` · **Board:** `debateai-v3`  
**Reviewer:** Grok (same seat that BLOCKED rev1 on lost PROV-01 pin)  
**Date:** 2026-08-14  
**Confirming:** `reviews/disc01-grok-rev1.md` sole BLOCKING gate (suite shrink dropped PROV-01) against rev2 surface claimed in `handoffs/DISC-01-codex-handoff.md` R3  
**Mode:** real tree read-only for product code; sole real-tree write is this file. DR-163 clone `/private/tmp/disc01-grok-confirm-clone` via `cp -Rc` of parent root `/Users/vladmihaimiron/Documents/DebateAIRO`; all product mutations and named-test runs inside the clone only; clone deleted after. Standing stack (PG `55432` PID 32921 / API `8790–8792` PID 32907) untouched before and after. Did not coordinate with the Opus lens. No commits/pushes/merges.

## Method

1. Read rev1 verdict + updated handoff R3 claims.
2. Inventory `git diff 2fea51b -- DebateAI-V3` at parent git root (56 tracked files, **+1198 / −1402**; untracked discovery/migration/tests still part of the shipped surface).
3. Clone parent root → `/private/tmp/disc01-grok-confirm-clone`; hash-identity of product files real vs clone before mutation (`defaults.tsx` md5 `7ced8e1ccf9c3177b6ac97516d2db43f`; ux01 test md5 `daff43a4431eefc52352f664ada8e3c0`).
4. In clone: prove shipped PROV-01 ternary + named test GREEN; invert ternary; named test RED; restore + re-GREEN; prove real-tree hash unchanged.
5. Static re-audit of the ten Grok authorization conditions + band-cap RULED ordinal + no new invented literals + harness touch-list completion on the rev2 delta.

## Rev1 finding under confirmation

Rev1 **VERDICT: BLOCKING** solely because the ux01 rewrite dropped the load-bearing non-apparatus pin:

> PROV-01 mutation-proof: user-edited risk tier is sent as ASKER, never MACHINE_DEFAULT

Production still had the correct ternary; no test drove `riskTierWasEdited: true` through the shipped page / `buildNewDebateAskConfig`. Required rework: re-pin both branches of that ternary on the real shipped function.

Handoff R3 claims:

> PROV-01: untouched risk submits `MACHINE_DEFAULT`; an edited risk submits `ASKER`. An always-machine mutation failed.

## PROV-01 finding — **CLOSED**

### Shipped function (real tree / clone identity)

```text
apps/v2-ui/app/new/defaults.tsx:68-69
  tier_source: defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT"
  tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor"

apps/v2-ui/app/new/page.tsx:50   riskTierWasEdited state defaults false
:126  riskTierWasEdited passed into buildNewDebateAskConfig
:176-178  risk select onChange → setRiskTierWasEdited(true)
```

### Named test pin (rev2)

`tests/render/ux01-new-debate-form.test.tsx` — `it("PROV-01 keeps untouched risk machine-defaulted and edited risk asker-owned through the real page")`:

- Untouched submit through real page → `tier_source: "MACHINE_DEFAULT"`, `tier_provenance_ref: "machine:deployment-floor"`.
- Risk select `onChange` → re-render → submit → `risk_tier: "casual"`, `tier_source: "ASKER"`, `tier_provenance_ref: "asker:ui-selection"`.

Drives the real page import + `createDebate` mock call payload, not a re-implemented oracle.

### GREEN (clone only)

```text
$ pnpm vitest run tests/render/ux01-new-debate-form.test.tsx -t "PROV-01"
 ✓ … PROV-01 keeps untouched risk machine-defaulted and edited risk asker-owned through the real page 120ms
 Test Files  1 passed (1)
      Tests  1 passed | 5 skipped (6)
```

### Killing mutation RED (clone only)

Inverted shipped ternary in clone `defaults.tsx`:

```ts
// MUTATED (clone only)
tier_source: defaults.riskTierWasEdited ? "MACHINE_DEFAULT" : "ASKER",
tier_provenance_ref: defaults.riskTierWasEdited ? "machine:deployment-floor" : "asker:ui-selection",
```

```text
FAIL … PROV-01 keeps untouched risk machine-defaulted and edited risk asker-owned through the real page
- Expected
+ Received
  {
-   "tier_provenance_ref": "machine:deployment-floor",
-   "tier_source": "MACHINE_DEFAULT",
+   "tier_provenance_ref": "asker:ui-selection",
+   "tier_source": "ASKER",
  }
 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
```

Untouched default path flips to ASKER/asker:ui-selection — exactly the inverted pair. The pin kills the ternary inversion.

### Restore

- Restored `defaults.tsx` from real tree; md5 back to `7ced8e1ccf9c3177b6ac97516d2db43f`.
- Post-restore PROV-01 re-run GREEN (113ms).
- Real tree md5 unchanged (`REAL_TREE_UNTOUCHED`).

## Ten authorization conditions — rev2 re-check

Law unchanged: DR-182 supersedes park-VROW language. Judgment uses that bar on `git diff 2fea51b` (parent root).

| # | Topic | Judgment | Evidence on rev2 |
|---|---|---|---|
| GT | Delta is DISC-01 surface vs `2fea51b` | **PASS** | 56 tracked files + untracked `acceptance/discovery.ts`, `migrations/0022_dr181_discovery.sql`, `tests/unit/dr181-*.test.ts`, `tests/support/discoveredPanel.ts`, `acceptance/mono-panel.test.ts` |
| BC1 / DR-182 values | Ruled VROW packet (not invented) | **PASS** | `panelDiscoveryPolicy` seeded `probe_freshness_ms: 600_000`, `probe_max_attempts: 1`, `sourceRef: acceptance:DR-182:V-approved` (`seed-register.ts:9,189-195`); mono marks+disclosure runner `:1517-1563`; high-stakes no refuse `critique/src/index.ts:332-339`; tripwire formula `computeStructuralCeilingBasis` register `:167-196`; no `/new` agent-count (v2-ui CLEAN); gap-death Grok path runner `:840-894` |
| BC2 / D1 | Model-shim hardcoded id dead; handshake-reported ids only | **PASS** | No `ACCEPTANCE_MODEL` in `acceptance/model-shim.ts`. `parseCodexCompletion` / `CODEX_CLI_MODEL_UNRESOLVED` on non-unique model; `startModelShim` sets `model: handshake.model` (`:173`) |
| BC3 / VROW-5 | No `RUN_MAKER_CONFIGURATION_MISMATCH` panel refuse; **Grok** gap-death | **PASS** | Symbol CLEAN in shipped `apps`/`packages`/`acceptance`. Claim path providerRef map → optional one `claimTimeProbe` → ABSENT record → shrink → empty `RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM` → remainder `CLAIM_PANEL_REVISED:…` disclosure. Not DR-174 claim hold |
| BC4 / T4 | Identity CHECK + write-side one delta; no independent `agentCount` input | **PASS** | Migration `0022_dr181_discovery.sql:27-31` `run_panel_count_identity` CHECK `agent_count = jsonb_array_length(discovered_panel)` NOT VALID. Write `packages/db/src/index.ts:354` binds `jsonb_array_length($12::jsonb)`. `StartRunInput` has `discoveredPanel` only (`:205`). `AskRequestSchema` has **no** `agent_count`. v2-ui CLEAN of agentCount input |
| BC5 / T7·T8·T9 | Tripwire pins; independent ceiling dominance; M-apparatus absent | **PASS** | `tests/unit/dr181-ceiling.test.ts` T7/T8 enumerate M×d + pin runner exports; T9 scans retired symbols (only present as denied strings in the test). Shipped-source sweep CLEAN for `deriveRatifiedMakerMaximum`, `RUN_MAKER_CONFIGURATION_MISMATCH`, `runCostEnvelopeSelection`, … |
| BC6 | Harness touch-list re-pinned **in this delta** | **PASS** | Base `2fea51b` still had `--agent-count` / `agent_count: 2` in `xrev01-depth1-proof.ts`, `panel01-depth1-proof.ts`, `ceremony.test.ts`, `run-acceptance.test.ts`, `run-acceptance.ts`. Working tree of those five files is **CLEAN** of `agent-count` / `agent_count` CLI/wire. README rewritten for discovery/DR-182 |
| BC7 | `claimMs` floor holds | **PASS** | Acceptance `claimMs: longestDeadline * maximumRunAttempts + cooldownMs * maxCooldownHoldsPerRun` with `maximumRunAttempts` from structural ceiling at depth 5 (`main.ts:221-227`). Runner still calls `assertClaimCoversCall` (`index.ts:724-725`) |
| BC8 | No keys, no evaluator, no Hatchet parity theatre | **PASS** | No key material in delta; discovery uses CLI handshake; runner `main.ts` not expanded into claim-probe parity theatre |
| BC9 | ASK-01 not widened; R2/`deriveRatifiedMakerMaximum` removed | **PASS** | `defaults.tsx` is session/risk/ask-wire only; `deriveRatifiedMakerMaximum` absent from shipped TS |
| BC10 / DR-182 gap | No architect-(a) claim hold; partial loss serves | **PASS** | Partial-loss path continues with shrunk panel + disclosure; empty dies loud (`RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM`); no claim-time cooldown sleep on the gap path |
| Band-cap value | RULED ordinal, not invented number | **PASS** | `applySingleLineageBandCap` returns `bandOrder[candidateIndex - 1]` (`runner:609-620`). Seed `bandOrder: ["CAPPED","FULL"]` with `acceptance:DR-133:V-approved`. `applyCriticUnavailableCap` only sets marks + `confidenceBandCapRequired` — no new band label mint |
| Suite shrink / PROV-01 | Load-bearing non-apparatus pin restored | **PASS** | Named PROV-01 test present; GREEN + killing ternary inversion RED (this seat) |
| No new invented literals | Probe/band/ceiling values ruled | **PASS** | Freshness `600_000` / attempts `1` carry `acceptance:DR-182:V-approved`; band step is DR-133 ordinal; organ bounds remain 3/3 and death policy 600_000×2 from prior rulings — no new numeric band or probe literal minted in the mono-cap path |

## Residual notes (non-gating; same class as rev1)

1. Product API ask-time re-probe seam (`apps/api` filters HEALTHY within freshness; acceptance re-probes stale) remains advisory relative to the BC table.
2. `claimTimeProbe` optional on the runner settings object; acceptance wires it; production runner main still does not (plan non-goal parity).
3. `run_panel_count_identity` NOT VALID for legacy rows — honest deploy choice; new inserts enforced.
4. Rev1 soft/advisory suite losses (aria, dual-token) are re-pinned in rev2 per handoff R3; this seat re-proved only its own BLOCKING gate (PROV-01) by mutation. Dual-token / B6 / aria were not re-mutated here.

## Stack / isolation receipts

| Check | Result |
|---|---|
| Standing stack PIDs before | postgres `55432` PID 32921; node `8790–8792` PID 32907 |
| Standing stack PIDs after | same PIDs (no restart) |
| Product mutations | clone only |
| Real-tree product hash | unchanged through mutation/restore |
| Real-tree writes | this confirm file only |

## Summary

| Gate | Result |
|---|---|
| Rev1 sole BLOCKING (PROV-01 pin lost) | **CLOSED** — named test on real page path; killing ternary inversion goes RED |
| Ten BCs + band-cap RULED + harness touch-list + no invented literals | **HOLD** on rev2 delta |
| Isolation / no stack control | **HOLD** |

VERDICT: APPROVED
