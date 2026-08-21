# ASK-01 Grok rev1 — dual-diamond independent review (DR-180)

**Ticket:** `t_2eb80121` · **Lens:** Grok · **Role:** read-only peer reviewer  
**Delta base:** `884230c` (GROK-01) at parent root `/Users/vladmihaimiron/Documents/DebateAIRO`  
**Worked in:** DR-163 clone `/private/tmp/ask01-grok-clone` (mutations only); real tree product sources untouched  
**Inputs:** `goal-packets/ASK-01-codex-goal.md`, `handoffs/ASK-01-codex-handoff.md`, ledger DR-180  
**Does not read:** Opus / peer verdicts

## Scope judged

Shipped product paths in `git diff 884230c`:

| Path | Role |
|---|---|
| `apps/v2-ui/app/new/defaults.tsx` | lawful maker-count derivation + ask config / provenance |
| `apps/v2-ui/app/new/page.tsx` | `/new` surface (Advanced removal; DR-166-C) |
| `tests/render/ux01-new-debate-form.test.tsx` | render + mutation pins |
| `tests/unit/v2ui-pages.test.ts` | source contract for controls / disclosure |
| `decisions-ledger.md` | DR-180 row (already dirty at claim; not product) |

`git diff 884230c --exit-code` on `apps/runner/src/index.ts`, `packages/kernel/src/index.ts`, `acceptance/seed-register.ts`: **clean** (M-guard / seed / contract vocabulary untouched — matches FORBIDDEN).

---

## Decision table

| Axis | Result | One-line basis |
|---|---|---|
| (1) Panel size = min(configured, ratified); same basis as M-guard | **PASS** | `Math.min(makers.length, deriveRatifiedMakerMaximum)` from `runCostEnvelope` Set-A inverse; mutations kill configured-only and hardcode-2 |
| (2) Advanced gone; DR-166-C intact | **PASS** | no `Advanced` / `machineOwnedAskFields` on `/new`; risk/budget/depth/Start remain; re-add → red |
| (3) Five machine values + provenance | **PASS** | still computed/submitted; PROV-01 `tier_source` path byte-stable; owners from `session.asker_id` |
| (4) Suite 591→587 audit | **FAIL** | net −4 explained; **DR-166-A dual-token load-bearing value assertions removed without equal-or-stronger page-path replacement** |
| (5) F1 + no new literals | **PASS** | new pins drive shipped `derive*` / real page; no panel-size literal / Advanced reintroduction in production |

**Overall:** any gating axis fail → BLOCKING.

---

## Axis (1) — lawful panel derivation + same ratified basis

### Production formula (file:line)

```135:138:apps/v2-ui/app/new/defaults.tsx
  const lawfulMakerCount = Math.min(makers.length, ratifiedMaximum.maximum);
  return Object.freeze({
    agentCount: String(lawfulMakerCount),
    agentCountProvenance: `configuredProviderSet@${deployment.register.register_version}:${providerSetRow.source_ref} (${makers.join(", ")}); capped by ${ratifiedMaximum.provenance} (M=${ratifiedMaximum.maximum})`
```

- Configured side: distinct makers from `configuredProviderSet` (`defaults.tsx:92–133`).
- Ratified side: `deriveRatifiedMakerMaximum` (`defaults.tsx:46–90`) reads register row `runCostEnvelope`, recovers `M` by inverting the Set-A attempt formula (`ratifiedEnvelopeAttempts`, `defaults.tsx:39–44`: `(authoredNodeCalls * 2 + 4) * 3`).
- Arithmetic check against seeded ceilings: depth-2 M=2 → **108**; depth-2 M=3 → **174** (matches `acceptance/seed-register.ts` members and the fixture-ratified-3 pin).

**Not a fixed panel-size literal:** no `lawfulMakerCount = 2` / `agentCount: "2"` assign in production defaults.

### Same-source trace (derivation ↔ M-guard)

| Path | What it reads | Where |
|---|---|---|
| Ask derivation | `deployment.register.rows[row_key=runCostEnvelope]` → inverse Set-A → `maximum` | `defaults.tsx:46–90, 134–135` |
| M-guard | module constant `DR159_RATIFIED_MAKER_COUNT = 2` | `apps/runner/src/index.ts:430–442`; enforced at `index.ts:838` via `assertRatifiedMakerCount` |

They do **not** share a single importable symbol. They share the **DR-159 ratification basis** named by the guard itself:

```430:441:apps/runner/src/index.ts
const DR159_RATIFIED_MAKER_COUNT = 2;
/** PANEL-01/DR-159: the ratified envelope arithmetic is valid for at most M=2. */
export function assertRatifiedMakerCount(effectiveMakerCount: number): void {
  ...
      `DR-159 ratified the run-cost envelope for M=${DR159_RATIFIED_MAKER_COUNT}; received M=${effectiveMakerCount}`
```

The envelope ceilings in the register **are** that ratified arithmetic for M=2 (seed `max_model_attempts: 108` at depth 2, etc.). ASK-01 is **forbidden** to change the M-guard; deriving M from the envelope (instead of hardcoding 2 on the ask side) is the DR-180-lawful path and preserves DR-162-A zero-UI-change when the envelope is re-seeded.

**Residual (non-blocking under ticket FORBIDDEN):** a future M=3 envelope re-seed without also lifting `DR159_RATIFIED_MAKER_COUNT` would make the UI send 3 while the runner still refuses — full-stack M=3 is V/ratification work, not ASK-01.

**Note:** “configured-and-healthy” in the packet is implemented as **configured distinct makers only** (no health filter on the deployment row). No separate health signal is consulted on this path.

### Clone mutations (must go red)

| Mutation | Pin | Result |
|---|---|---|
| (i) configured-count-only (`agentCount = makers.length`, no min) | `ASK-01 live regression` | **RED** — `agent_count` Expected `2` / Received `3` |
| (ii) hardcode `lawfulMakerCount = 2` | `ASK-01 RED + mutations` fixture-ratified-3 | **RED** — Expected `"3"` / Received `"2"` |

Receipts (scratch): `ask01-mut-configured-only-live.log`, `ask01-mut-hardcode-2.log`.  
Clean restore green: 16 passed | 1 skipped (`ask01-green-ux01.log`).

**Axis (1) PASS.**

---

## Axis (2) — Advanced removed; DR-166-C intact

### Production

- `page.tsx` greps clean for `Advanced`, `machineOwnedAskFields`, `MachineOwnedAskFields` (post-diff).
- Advanced disclosure + `MachineOwnedAskFields` block removed (`git diff 884230c` on `page.tsx`); `advancedOpen` state deleted.
- `MachineOwnedAskFields` / `MachineDefaultHint` removed from `defaults.tsx` (component was the Advanced body).
- DR-166-C surface remains: topic (`page.tsx:191`), risk (`214`), budget (`239`), tree depth (`258`), Start (`410`).

### Clone mutation

Re-inserted Advanced button + `id="machineOwnedAskFields"`:

- render pin **RED**: `expected ... not to contain 'Advanced'` (`DR-180 + MUTATION disclosure`)
- source contract **RED**: `v2ui-pages` `DR-180 computes every machine value without rendering the retired disclosure`

Receipt: `ask01-mut-disclosure.log`.

**Axis (2) PASS.**

---

## Axis (3) — five machine values + honest provenance

Still **computed** on the page (state + effects), **not rendered** as controls, **submitted** via `buildNewDebateAskConfig`:

| Field | Compute | Persist |
|---|---|---|
| `agent_count` | `deriveAgentCountDefault` → `setAgentCount` (`page.tsx:81–82`) | `buildNewDebateAskConfig` → `agent_count` (`defaults.tsx:189`) |
| `as_of` | `deriveSessionAskDefaults` / submit-time refresh (`page.tsx:106–110, 154–155`) | `as_of` ISO (`defaults.tsx:193`) |
| `decision_owner` | `session.asker_id` (`defaults.tsx:19`, `page.tsx:107`) | `decision_owner` (`defaults.tsx:190`) |
| `action_owner` | `session.asker_id` (`defaults.tsx:20`, `page.tsx:108`) | `action_owner` (`defaults.tsx:191`) |
| `decision_scope` | `DECISION_SCOPE_DEFAULT` / session defaults (`defaults.tsx:21`, `page.tsx:109`) | `decision_scope` (`defaults.tsx:192`) |

**PROV-01** path untouched:

```185:186:apps/v2-ui/app/new/defaults.tsx
    tier_source: defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT",
    tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor",
```

Confirming tests: `PROV-01 mutation-proof…`, `DR-166-B + MUTATION collapsed-submit…` (MACHINE_DEFAULT on bare Start), unit `MUTATION decision_owner` / `action_owner`.

**DR-166-A** derivation still asker-relative at the function boundary (`deriveSessionAskDefaults` → `session.asker_id`). Collapsed-submit still pins alpha owners on the real form submit. **However** the dual-token *page* pin no longer proves distinct owners (see axis 4) — that is a test-strength defect, not a production provenance rewrite.

**Axis (3) PASS** (production path).

---

## Axis (4) — suite shrink 591 → 587 audit

### Arithmetic reconciliation

| Source | Figure |
|---|---|
| GROK-01 handoff / progress | **591 passed** \| 1 skipped |
| ASK-01 handoff JSON | `numTotalTests: 588`, `numPassedTests: 587`, `numPendingTests: 1` |
| OBJECTIVE | audit shrink **591 → 587** |

**591 − 4 = 587.** Total collected if skip/pending counted: 592 → 588. Handoff “588 total / 587 passed / 1 pending” is consistent with “591→587 passed”; the pending row is the opt-in live-stack `it.runIf` (not a failure).

### Net −4 is entirely from `tests/unit/v2ui-pages.test.ts` expansion

| Change | Δ tests |
|---|---|
| `it.each(REQUIRED_ASK_FIELDS)` 7 cases → `it.each(USER_ASK_FIELDS)` 2 cases | **−5** |
| New `DR-180 computes every machine value without rendering the retired disclosure` | **+1** |
| **v2ui net** | **−4** |
| `ux01-new-debate-form.test.tsx` `it`/`it.runIf` count | **0** (17→17; content replaced) |

### Deleted / replaced cases (exact)

**A. `v2ui-pages` — five machine control-binding cases removed from `it.each`**

Was: bind `value={state}` + write handler for `agent_count`, `decision_owner`, `action_owner`, `decision_scope`, `as_of`.  
Replacement: `MACHINE_ASK_FIELDS` still required in `ready` block; new DR-180 source contract forbids Advanced / `machineOwnedAskFields` / `MachineOwnedAskFields` while requiring state names; collapsed-submit asserts all five keys on `createDebate`.  
**Equal-or-stronger for DR-180 intent (machine-derived, not user-filled). OK.**

**B. `B1/B3 + MUTATION agent_count` → `ASK-01 RED + mutations…`**

Was: configured makers alone (3 providers → `"3"`).  
Now: min-cap at ratified 2 + fixture envelope 174 → `"3"`.  
**Stronger. OK.**

**C. `B4/DR-166-B expanded` (Advanced reveals prefilled fields) — deleted**

Superseded by DR-180 (disclosure must not exist). Replaced by `DR-180 + MUTATION disclosure`.  
**OK under DR-180 supersession of DR-166-B.**

**D. `DR-166-B + MUTATION visible-by-default` → `DR-180 + MUTATION disclosure`**

Was: Advanced present but collapsed. Now: Advanced must never appear; DR-166-C ids present.  
**Stronger. OK.**

**E. `keeps all five machine-owned controls editable` → `… values out of the real rendered form`**

Inverted for DR-180.  
**Stronger for the new law. OK.**

**F. Added `ASK-01 live regression` (configured=3 / ratified=2 bare Start → accept)**

**New load-bearing pin for the live defect. OK.**

**G. `DR-166-A + MUT-I: two tokens derive two different owner defaults through the real page` — WEAKENED (BLOCKING)**

| Before (`884230c`) | After (ASK-01) |
|---|---|
| Asserted alpha HTML inputs `value="asker:test-user-alpha"` and beta `…beta` for `decisionOwner` / `actionOwner` | Only asserts `readSession` called with both tokens |
| Cross-exclusion of the other asker value | Only asserts owner control **ids absent** from HTML |
| Title claimed distinct defaults **through the real page** | Same title; body no longer proves distinct derived/submitted owners |

Remaining coverage:

- Unit: `MUTATION decision_owner` / `action_owner` on `deriveSessionAskDefaults` (function boundary only).
- Single-token collapsed-submit pins alpha owners on submit.
- **No dual-submit** that asserts `createDebate` config carries different `decision_owner` / `action_owner` for two tokens.

Handoff claim *“two session tokens still derive distinct asker-relative owner values while neither value renders as a control”* is **stronger than the surviving test**. Under DR-180 the DOM value pins are obsolete, but the equal-or-stronger replacement is dual bare-Start submit (or equivalent page-path observation of derived state), not a pure absence check.

**Axis (4) FAIL — load-bearing DR-166-A dual-token page assertion removed without equal-or-stronger replacement.**

---

## Axis (5) — F1 sweep + no new production literals

### New / changed tests drive shipped code

| Test | Entry point |
|---|---|
| `ASK-01 RED + mutations` | real `deriveAgentCountDefault(deployment)` + expanded + fixture envelope |
| `ASK-01 live regression` | real `/new` page import → submit → `createDebate` mock (acceptance stub for runner refusal) |
| `DR-180 + MUTATION disclosure` | `renderRealNewDebatePage()` on real `page.tsx` |
| `DR-180 computes…` (v2ui source) | reads shipped `page.tsx` / `defaults.tsx` source |
| PROV-01 / collapsed-submit | real page submit + `buildNewDebateAskConfig` path |

Expected values in pins follow calls into the unit under test (not a re-implementation of Set-A inside the test body). Fixture ceiling `174` matches the production formula for M=3 depth-2; base fixture ceiling was corrected **66 → 108** so the envelope encodes M=2 under the same formula the derivation inverts (pre-ASK-01 fixture was arithmetic-incoherent with M=2 Set-A).

Mild test-side stub: live regression mocks runner with `agent_count > 2` rather than importing `assertRatifiedMakerCount` — acceptable as an acceptance stub; production under test is still the UI derivation.

### Production literals / Advanced reintroduction

- No `Advanced` / `MachineOwnedAskFields` in production `page.tsx` / `defaults.tsx`.
- No hardcoded panel-size assign (`lawfulMakerCount = 2` absent).
- Formula constants `SET_A_HEADROOM_MULTIPLIER = 3` and `HEALTHY_FIXED_MODEL_CALLS = 4` are Set-A arithmetic, not panel size.

**Axis (5) PASS.**

---

## Forbidden-surface check

| Surface | Delta vs `884230c` |
|---|---|
| M-guard (`assertRatifiedMakerCount` / `DR159_RATIFIED_MAKER_COUNT`) | unchanged |
| M=3 seed / register seed | unchanged |
| Contract vocabulary / kernel | unchanged |
| Standing stack | not controlled by this review |

---

## Required rework (for BLOCKING)

1. **Restore equal-or-stronger DR-166-A dual-token page proof** without reintroducing Advanced controls — e.g. two bare-Start submits under two auth tokens asserting `createDebate` config `decision_owner` / `action_owner` equal the respective `session.asker_id`, and still assert machine control ids are absent.
2. Align handoff prose with the actual assertions after rework.

Optional (non-blocking residual): document that M-guard remains a DR-159 literal until a future ratification ticket unifies it with the envelope inverse (out of ASK-01 FORBIDDEN scope).

---

## Clone hygiene

Mutations and focused vitest runs performed only under `/private/tmp/ask01-grok-clone`. Real-tree product sources left read-only. Clone removed after review write.

VERDICT: BLOCKING
