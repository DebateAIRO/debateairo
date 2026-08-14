import { describe, expect, it } from "vitest";
import { BATTERY_ROW_IDS } from "@debateai/battery";
import {
  BATTERY_BUDGET_CONTRACTS,
  compareConvergence,
  decideBudgetPressure,
  decideRowBudgetOutcome,
  parseCostEnvelopeBasis
} from "@debateai/budget";
import { TIER_SOURCES } from "@debateai/kernel";
import { resolveEffectiveRiskTier } from "@debateai/register";
import { fixtureStructuralCeiling } from "../support/discoveredPanel.js";

const testLayerEnvelope = fixtureStructuralCeiling(2);

describe("S09 / DR-108 — the ratified 71-row budget split", () => {
  it("classifies exactly Q27 and Q49 as enrichment and every other row as correctness", () => {
    expect(BATTERY_BUDGET_CONTRACTS).toHaveLength(71);
    expect(BATTERY_BUDGET_CONTRACTS.map((row) => row.batteryRowId)).toEqual(BATTERY_ROW_IDS);
    expect(BATTERY_BUDGET_CONTRACTS.filter((row) => row.budgetClass === "ENRICHMENT").map((row) => row.batteryRowId))
      .toEqual(["Q27", "Q49"]);
    expect(BATTERY_BUDGET_CONTRACTS.filter((row) => row.budgetClass === "CORRECTNESS")).toHaveLength(69);
    expect(BATTERY_BUDGET_CONTRACTS.find((row) => row.batteryRowId === "R9")?.skipPolicy)
      .toBe("PROTECTED_CORE_REFUSES_SKIP");
  });

  it("skips enrichment first, refuses protected-core skips, then emits a typed hard stop", () => {
    const basis = parseCostEnvelopeBasis(testLayerEnvelope);
    expect(decideRowBudgetOutcome("Q27", true)).toEqual({
      kind: "SKIPPED",
      outcome: "SKIPPED_BY_BUDGET",
      conditionMark: "SKIPPED-BY-BUDGET"
    });
    expect(decideRowBudgetOutcome("R9", true)).toEqual({
      kind: "REFUSED",
      outcome: "REFUSED",
      reason: "PROTECTED_CORE_REFUSES_SKIP"
    });

    expect(decideBudgetPressure({
      basis,
      consumedModelAttempts: basis.maxModelAttempts,
      pendingRows: [
        { batteryRowId: "Q27", affectedNodeIds: ["node:test:q27"] },
        { batteryRowId: "Q49", affectedNodeIds: ["node:test:q49"] },
        { batteryRowId: "R9", affectedNodeIds: ["node:test:r9"] }
      ],
      verifiedNodeIds: ["node:test:verified"]
    })).toEqual({
      kind: "HARD_STOP",
      state: "EXHAUSTED",
      consumedModelAttempts: basis.maxModelAttempts,
      enrichmentSkips: [
        {
          batteryRowId: "Q27",
          outcome: "SKIPPED_BY_BUDGET",
          conditionMark: "SKIPPED-BY-BUDGET",
          affectedNodeIds: ["node:test:q27"]
        },
        {
          batteryRowId: "Q49",
          outcome: "SKIPPED_BY_BUDGET",
          conditionMark: "SKIPPED-BY-BUDGET",
          affectedNodeIds: ["node:test:q49"]
        }
      ],
      protectedCoreRefusals: [{
        batteryRowId: "R9",
        outcome: "REFUSED",
        reason: "PROTECTED_CORE_REFUSES_SKIP",
        affectedNodeIds: ["node:test:r9"]
      }],
      terminal: {
        conditionMark: "ENVELOPE_EXHAUSTED",
        servedNodeIds: ["node:test:verified"]
      }
    });
  });

  it("keeps a run within its pinned basis before the attempt ledger reaches the limit", () => {
    const basis = parseCostEnvelopeBasis(testLayerEnvelope);
    expect(decideBudgetPressure({
      basis,
      consumedModelAttempts: basis.maxModelAttempts - 1,
      pendingRows: [],
      verifiedNodeIds: []
    })).toEqual({
      kind: "WITHIN_ENVELOPE",
      state: "WITHIN",
      consumedModelAttempts: basis.maxModelAttempts - 1
    });
  });
});

describe("S09 / DR-094 — ruled tier authority", () => {
  it("names asker choice, machine prefill, and policy escalation as distinct tier suppliers", () => {
    expect(TIER_SOURCES).toEqual(["ASKER", "MACHINE_DEFAULT", "DEPLOYMENT_POLICY"]);
  });

  it("resolves policy parent -> run -> deployment, raises, and never lowers", () => {
    expect(resolveEffectiveRiskTier({
      askerTier: "casual",
      askerProvenanceRef: "asker:test",
      policyLevels: {
        parent: { riskTier: "standard" },
        run: { riskTier: "high-stakes" },
        deployment: { riskTier: "high-stakes" }
      }
    })).toEqual({
      effectiveRiskTier: "standard",
      tierSource: "DEPLOYMENT_POLICY",
      tierProvenanceRef: "asker:test",
      policySuppliedBy: "parent"
    });

    expect(resolveEffectiveRiskTier({
      askerTier: "high-stakes",
      askerProvenanceRef: "asker:test",
      policyLevels: {
        parent: {},
        run: {},
        deployment: { riskTier: "casual" }
      }
    })).toEqual({
      effectiveRiskTier: "high-stakes",
      tierSource: "ASKER",
      tierProvenanceRef: "asker:test",
      policySuppliedBy: null
    });
  });
});

describe("S09 / FX-HR-H8 — convergence comparisons", () => {
  const current = Object.freeze({
    semanticsRef: "semantics:test",
    topologyRef: "topology:test",
    evidenceTopologyRef: "evidence:test",
    strengths: { "node:test": 0.7 }
  });

  it("returns typed non-comparison reasons instead of comparing incompatible rounds", () => {
    expect(compareConvergence({ previous: null, current, epsilon: 0.1 })).toEqual({
      kind: "NOT_COMPARABLE",
      reason: "FIRST_EVALUATION"
    });
    expect(compareConvergence({
      previous: { ...current, semanticsRef: "semantics:older" },
      current,
      epsilon: 0.1
    })).toEqual({ kind: "NOT_COMPARABLE", reason: "SEMANTICS_CHANGED" });
    expect(compareConvergence({
      previous: { ...current, evidenceTopologyRef: "evidence:older" },
      current,
      epsilon: 0.1
    })).toEqual({ kind: "NOT_COMPARABLE", reason: "TOPOLOGY_CHANGED" });
    expect(compareConvergence({
      previous: { ...current, strengths: null },
      current,
      epsilon: 0.1
    })).toEqual({ kind: "NOT_COMPARABLE", reason: "STRENGTHS_UNAVAILABLE" });
  });

  it("uses the supplied register epsilon without embedding a production default", () => {
    const result = compareConvergence({
      previous: { ...current, strengths: { "node:test": 0.65 } },
      current,
      epsilon: 0.1
    });
    expect(result).toMatchObject({ kind: "COMPARABLE", converged: true });
    expect(result.kind === "COMPARABLE" ? result.maxDelta : Number.NaN).toBeCloseTo(0.05);
  });
});
