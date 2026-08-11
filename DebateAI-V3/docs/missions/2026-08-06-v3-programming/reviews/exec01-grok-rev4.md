# EXEC-01 dual-diamond review — Grok lens (rev4)

**Ticket:** `t_6fae713b` · **Author:** Codex (gpt-5.6-sol)  
**Reviewer:** Grok (independent read-only dual-diamond lens, rev4)  
**Date:** 2026-08-11  
**Packet:** `reviews/EXEC-01-rev4-review-packet.md`  
**Directive (defect definition only):** `reviews/EXEC-01-rev4-directive.md`  
**Inputs verified against shipped source (not handoff trust):** pure selection module, `/new` wiring, adapter floor projection, register escalation, API resolve path, new unit coverage, page source test, rework contract test, handoff advisory disposition.

**Mode:** read-only. This seat wrote only this verdict file. No product code edits, no git mutations, no board mutations. Did not read any Opus rev4 verdict. Did not re-litigate R1–R3. Did not re-run orchestrator-green gates.

## Verdict

**APPROVED**

The rev4 blocking defect is closed in shipped product code: `/new` selects run-cost envelope members by the **policy-effective** tier after deployment-floor escalation, not by the asker's raw pick. The pure rule matches the engine's escalate-never-lower ranking for the same floor input, including absent floor, floor ranking below the asker, equal floor, and multi-member misleading sub-floor cases. Residual notes below are **ADVISORY** only (ORDER / floor-source drift hazards and incomplete cross-module test coupling). They do not re-open the orchestrator-verified casual→standard refusal.

---

## Decision questions (packet)

| # | Question | Result | Source proof |
|---|---|---|---|
| **1** | Form effective tier agrees with engine/API, incl. absent / malformed / below-asker floor? | **CLOSED** (pure rule + wiring) | UI pure `effectiveRunCostEnvelopeRiskTier` / `selectRunCostEnvelopeMembers`; page call sites; register `resolveEffectiveRiskTier`; API `resolveRisk` → envelope on `effectiveRiskTier`; adapter floor projection |
| **2** | New test fails on divergence (not only pin today's values)? | **PARTIAL GREEN** | Behavioral RED for the rev3 asker-only bug and sub-floor lie; does **not** couple to engine `resolveEffectiveRiskTier` — see A1 |
| **3** | Escalation / tier ORDER duplicated vs shared? | **ADVISORY** | UI local `RISK_TIER_ORDER` copy; kernel owns `RISK_TIERS` — see A2 |
| **4** | Rev3 advisories fixed or honestly recorded (not silent)? | **HONEST** | Handoff Rev-4 advisory disposition names all four; none silent |

### Q1 — Blocking defect closed?

**Rev3 defect (orchestrator-live):** page filtered `member.riskTier === riskTier` (asker pick). Casual + deployment floor `standard` → empty members → Start disabled while API accepted the same ask (HTTP 202).

**Shipped rev4 path:**

1. **Adapter** (`apps/v2-ui/lib/v3/adapter.ts` ~527–540) projects `deploymentRiskTier` from register row `riskTier`, or `null` if the row is absent; non-enum values throw `RISK_TIER_POLICY_INVALID` (same code family as the engine).
2. **Pure selection** (`apps/v2-ui/lib/runCostEnvelopeSelection.ts:7–30`):

```7:30:apps/v2-ui/lib/runCostEnvelopeSelection.ts
export function effectiveRunCostEnvelopeRiskTier(
  askerRiskTier: RunCostEnvelopeRiskTier,
  deploymentFloorRiskTier: RunCostEnvelopeRiskTier | null
): RunCostEnvelopeRiskTier {
  if (deploymentFloorRiskTier === null) return askerRiskTier;
  return RISK_TIER_ORDER.indexOf(deploymentFloorRiskTier) > RISK_TIER_ORDER.indexOf(askerRiskTier)
    ? deploymentFloorRiskTier
    : askerRiskTier;
}

export function selectRunCostEnvelopeMembers(
  members: readonly RunCostEnvelopeMember[],
  askerRiskTier: string,
  deploymentFloorRiskTier: RunCostEnvelopeRiskTier | null
): readonly RunCostEnvelopeMember[] {
  if (!RISK_TIER_ORDER.includes(askerRiskTier as RunCostEnvelopeRiskTier)) return [];
  const effectiveRiskTier = effectiveRunCostEnvelopeRiskTier(
    askerRiskTier as RunCostEnvelopeRiskTier,
    deploymentFloorRiskTier
  );
  return members.filter((member) => member.riskTier === effectiveRiskTier);
}
```

3. **Page** (`apps/v2-ui/app/new/page.tsx:68–80`) uses that selector in both the depth-normalization effect and the render/ready path — no surviving inline `member.riskTier === riskTier` asker filter.
4. **Engine** (`packages/register/src/index.ts:356–365`): `policyRank > askerRank` → policy tier; otherwise asker. Absent policy → rank `-1` → asker. Never lowers.
5. **API** (`apps/api/src/index.ts:254–259`; composition `apps/api/src/main.ts:30–39`): `resolveRisk` → `resolveEnvelopeBasis({ riskTier: risk.effectiveRiskTier })`.

**Edge cases (same floor input into both pure rules):**

| Floor case | UI pure | Engine `resolveEffectiveRiskTier` | Agree? |
|---|---|---|---|
| Absent / `null` | asker | asker (`policy === null`) | Yes |
| Malformed enum | Adapter throws `RISK_TIER_POLICY_INVALID` before selection; engine throws same code on invalid policy value | Yes (loud refuse) |
| Floor ranks **below** asker (e.g. asker `high-stakes`, floor `casual`) | asker | asker | Yes |
| Floor equal | asker | asker | Yes |
| Floor above (e.g. casual + standard) | floor | floor | Yes |
| Misleading sub-floor member present | only effective-tier members | envelope match on effective tier | Yes |

**Floor input source note (not the pure rule):** UI reads the sealed register `riskTier` row from `readDeployment`; live API `resolveRisk` feeds `environment.DEPLOYMENT_RISK_TIER`. Acceptance seed rows `riskTier: "standard"` (`acceptance/seed-register.ts:71`) and the standing env are the same class of floor the orchestrator used. Dual **source** of the floor value is ADVISORY-A3, not a re-open of the selection bug.

**Failing case that would re-open Q1:** re-introduce page filtering by asker `riskTier` only, or change pure escalation to always use the asker — the form again refuses lawful escalated casual asks while the API returns 202.

### Q2 — Does the new test fail on divergence?

**Shipped coverage** (`tests/unit/v2ui-data-layer.test.ts:456–466`):

- Drives **shipped** `selectRunCostEnvelopeMembers` / `selectRunCostEnvelopeMember` (real entry points, imported from `runCostEnvelopeSelection.js`).
- Escalated-casual fixture: only standard depth-1 / 9-attempt member + asker `casual` + floor `standard` → must select that member (empty array fails).
- Misleading sub-floor: casual depth-1 / 3-attempt beside standard → must return **only** the standard member (AC-76 spend-lie class).

That is a genuine RED→GREEN for the **UI selection seam** that caused rev3 (handoff even records the pre-fix empty-array failure). Page wiring is additionally ratcheted by source text (`tests/unit/v2ui-pages.test.ts:62–67` requires both selector names).

**What it does not do:** it does not import `@debateai/register`'s `resolveEffectiveRiskTier` or kernel `RISK_TIERS`. Independent mutation of the engine rule/order while leaving the UI pin intact would still pass this suite. So it is stronger than “freeze a page literal,” but it is still a **UI-side behavioral pin**, not a single shared-contract oracle across UI↔engine. See A1.

### Q3 — ORDER once or twice?

| Location | Definition |
|---|---|
| `packages/kernel/src/index.ts:99` | `RISK_TIERS = ["casual", "standard", "high-stakes"]` — engine authority |
| `apps/v2-ui/lib/runCostEnvelopeSelection.ts:5` | local `RISK_TIER_ORDER` with the **same sequence**, no import of kernel/register |
| `apps/v2-ui/lib/api.ts:253` | `Set` for ask-field validation only (membership, not rank) |

Escalation **logic** is mirrored (index compare, never lower). Ranking **vocabulary order** is a second copy. Values match today; a future kernel reorder or insert without updating the UI copy is exactly the drift class this ticket keeps rediscovering → A2 (ADVISORY, not blocking of today's closure).

### Q4 — Rev3 advisories: fixed or recorded?

| Advisory (packet / directive) | Disposition | Evidence |
|---|---|---|
| Page behaviour still asserted on source text | **PARTLY FIXED + recorded** | Selection extracted to pure `lib/` with behavioral tests; page suite still source-wires selectors (`v2ui-pages.test.ts:62–67`). Handoff Rev-4 disposition: “remaining page source test checks only that the page wires both selectors.” |
| Contract test asserts `main.ts` does NOT contain `claimNext(` | **RECORDED (not fixed)** | Still `tests/unit/exec01-rework-contract.test.ts:20`. Handoff: left unchanged (narrow rework; would punish future reaper). |
| Non-typed rejections leave no trace | **RECORDED (not fixed)** | Still `acceptance/main.ts:71–75` maps non-domain → `UNEXPECTED_ERROR`; stderr branches do not carry the composed reason / original message. Handoff: “Untyped rejection trace loss… remain recorded advisories.” |
| Adapter reduces `depth_params` to `depth` | **RECORDED (not fixed)** | Adapter projects `depthParams?.depth` only; ask posts `{ depth }` (`api.ts:279`). Handoff: richer ruled member may be offered then refused at submit — recorded, not silent. |

Silence: **none** on the four packet advisories.

---

## Findings

### BLOCKING

None.

### ADVISORY

#### A1 — Selection tests pin UI pure functions, not a shared engine oracle

- **Where:** `tests/unit/v2ui-data-layer.test.ts:456–466`; contrast `packages/register/src/index.ts:339–371` and engine tests in `tests/unit/budget-s09.test.ts:109–138`.
- **Law / scenario:** Packet Q2 asks whether the suite would catch future UI↔engine drift. Today's tests fail hard if the UI reverts to asker-only selection or includes sub-floor members under an escalated floor. They do not fail if only the engine side changes.
- **Failing case (theoretical):** reorder kernel `RISK_TIERS` or flip engine escalate condition while leaving UI `RISK_TIER_ORDER` and the pinned fixture expectations alone → engine accepts/refuses differently; UI suite stays green.
- **Disposition:** ADVISORY. Sufficient for the rev4 defect (UI selection). Strengthening would call `resolveEffectiveRiskTier` (or share one order table) inside the same assertion.

#### A2 — Tier ORDER is duplicated in the UI pure module

- **Where:** `apps/v2-ui/lib/runCostEnvelopeSelection.ts:5` vs `packages/kernel/src/index.ts:99`.
- **Law / scenario:** Packet Q3 — a second copy of ranking order is a drift hazard of the class this ticket rediscovers.
- **Failing case:** insert or reorder a tier in kernel without updating `RISK_TIER_ORDER` → rank comparisons diverge.
- **Disposition:** ADVISORY. Values match today; logic matches. Prefer importing `RISK_TIERS` from kernel (or a single shared pure helper) in a later slice.

#### A3 — Floor **value** sources differ (register row vs env), even though the pure rule agrees

- **Where:** UI `runCostEnvelopeFromDeployment` → register `riskTier` row; API composition `apps/api/src/main.ts:37` → `environment.DEPLOYMENT_RISK_TIER`.
- **Law / scenario:** If ops/env and sealed register diverge, form and API re-split on effective tier even with correct pure functions.
- **Failing case:** register row `standard`, env `high-stakes` (or row absent while env set) → UI escalates (or not) on a different floor than submit.
- **Disposition:** ADVISORY / pre-existing composition seam. Acceptance seed and standing deployment are aligned; not the rev3 page filter bug.

#### A4 — Edge cases of the pure rule are only partially fixture-covered

- **Where:** only escalated-casual + misleading sub-floor at `v2ui-data-layer.test.ts:456–466`.
- **Law / scenario:** Code handles null floor and below-asker floor correctly; tests do not pin those rows.
- **Failing case:** a future edit that treats null floor as a hard refuse, or always takes the floor even when lower, could slip without a RED on those edges (escalated-casual fixture still green).
- **Disposition:** ADVISORY test-coverage depth. Product logic for those edges is present and matches the engine.

---

## R1–R3 (not re-litigated)

Per packet: Opus rev3 already verified R1/R2/R3 closed with no false factual claim. This seat treated them as **closed** and judged only the rev4 effective-tier delta. No re-proof of error-cause persistence, register-derived envelope projection (R2 base), or process-death stall declaration.

---

## Scope / seat hygiene

- **Wrote only:** `docs/missions/2026-08-06-v3-programming/reviews/exec01-grok-rev4.md`
- **Did not mutate:** product paths, tests, handoff, board, git history
- **Did not read:** any Opus rev4 dual-diamond verdict
- **Did not re-run:** root/v2-ui tsc, vitest, architecture, or source audits (orchestrator already greenlit rev4; packet forbids re-run)

## Comments / handoff cursor

Author rev4 claims (pure module, page wiring, escalated-casual + misleading-member tests, advisory disposition) verified in source as above. Handoff treated as hypothesis; proof is file:line behavior, not narrative trust.
