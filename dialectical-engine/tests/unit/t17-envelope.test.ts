import { describe, expect, it } from "vitest";
import {
  buildCrossRootExchangePlan,
  buildMultiMakerExpansionPlan
} from "@debateai/runner";
import { computeStructuralCeilingBasis } from "@debateai/register";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

/**
 * T17 — the cost envelope for the LIVE topology (goal-v4 285-295, F36).
 *
 * `DR-184-v2` counted two model sites per node and no synthesis loop. Three
 * legs of the shipped engine are missing from it, and each one is a MEASURED
 * call site, not an estimate:
 *
 *  1. PANEL. `runNodePanel` (apps/runner/src/index.ts:1797) hands every
 *     configured maker to `runJudgePanel`, which skips the author
 *     (PRODUCER_GRADING_FORBIDDEN, packages/judgement/src/s04.ts:233) and calls
 *     the rest — `panelSize - 1` model calls for EVERY materialized node, roots
 *     (:2105) and children/exchange nodes (:2299) alike. v2 counts none.
 *  2. COOLDOWN SITES. `withCooldownRetry` (apps/runner/src/index.ts:250) spends
 *     `baseMaxAttempts` and THEN, on transport exhaustion, a whole second
 *     sequence of `baseMaxAttempts + finalRetryAttempts` (:288-299, :336). The
 *     worst case at an author or reviewer site is therefore
 *     `2 * judgeMaxAttempts + finalRetryAttempts`, not `judge + final`.
 *  3. SERVE LEG. T9 replaces the composition organs (COMPOSER + per-segment
 *     CONFORMANCE + post-compose R9) with the synthesizer/evaluator loop: one
 *     SYNTHESIZER call and one EVALUATOR call per round
 *     (packages/serve/src/synthesis.ts `runSynthesisLoop`). The two chains are
 *     mutually exclusive, so the serve leg is the MAXIMUM of the two — never
 *     their sum, which would be slack in both worlds.
 *
 * Every policy number below comes from T16's sealed `envelopeFormulaInputs`
 * row (packages/register/src/algorithm-policy.ts:241). Nothing here invents one.
 */

/** The sealed `envelopeFormulaInputs` row's values, as T16 seeds them. */
const SEALED = Object.freeze({
  branchingFactor: 2,
  compositionSegmentCap: 2,
  fixedOrgansPerComposition: 4,
  maxRecompose: 2,
  reviewerCallsPerNode: 1,
  synthesizerMaxRounds: 3,
  evaluatorMaxRounds: 3,
  /**
   * The row NAMES the panel basis and its own zod literal
   * (packages/register/src/algorithm-policy.ts:331) is the loud stop for any
   * other one, so the formula derives (M-1) from a sealed name, not a guess.
   */
  panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE" as const
});

/** The ruled per-organ attempt bounds the acceptance register seeds. */
const BOUNDS = Object.freeze({
  judgeMaxAttempts: 3,
  organMaxAttempts: 3,
  finalRetryAttempts: 1,
  maxCooldownHoldsPerRun: 2
});

function ceilingInput(panelSize: number, depth: number) {
  const { panelCallsPerNodeBasis: _basis, ...formulaTerms } = SEALED;
  return { panelSize, depth, ...BOUNDS, ...formulaTerms };
}

type SiteKind = "AUTHOR" | "PANEL" | "REVIEW" | "SERVE";

/**
 * An INDEPENDENT enumeration of the maximum path: it builds the actual call
 * sites the runner opens, one row each, and reads the worst case off each row.
 * It shares no arithmetic with the closed form under test — it walks the
 * runner's OWN exported plans and counts.
 */
function enumerateMaximumPathSites(
  panelSize: number,
  depth: number
): readonly { readonly kind: SiteKind; readonly worstCaseAttempts: number }[] {
  const sites: { kind: SiteKind; worstCaseAttempts: number }[] = [];
  const materializedNodeIds: string[] = [];
  if (panelSize === 1) {
    // S2-2: the walking-skeleton literal is reachable at M=1 only — one node.
    materializedNodeIds.push("root:0");
  } else {
    for (let rootIndex = 0; rootIndex < panelSize; rootIndex += 1) {
      materializedNodeIds.push(`root:${rootIndex}`);
    }
    for (const leg of buildMultiMakerExpansionPlan(depth, panelSize)) {
      materializedNodeIds.push(`child:${leg.childIndex}`);
    }
    for (const leg of buildCrossRootExchangePlan(panelSize)) {
      materializedNodeIds.push(`exchange:${leg.authorRootIndex}->${leg.targetRootIndex}`);
    }
  }
  // withCooldownRetry: base attempts, then base + final on the second sequence.
  const cooldownSite = 2 * BOUNDS.judgeMaxAttempts + BOUNDS.finalRetryAttempts;
  for (const _nodeId of materializedNodeIds) {
    sites.push({ kind: "AUTHOR", worstCaseAttempts: cooldownSite });
    if (panelSize === 1) continue;
    // runJudgePanel calls every non-author member once; no cooldown wrapper.
    for (let member = 1; member < panelSize; member += 1) {
      sites.push({ kind: "PANEL", worstCaseAttempts: BOUNDS.judgeMaxAttempts });
    }
    for (let visit = 0; visit < SEALED.reviewerCallsPerNode; visit += 1) {
      sites.push({ kind: "REVIEW", worstCaseAttempts: cooldownSite });
    }
  }
  const compositionSites = SEALED.maxRecompose * SEALED.fixedOrgansPerComposition;
  const synthesisLoopSites = SEALED.synthesizerMaxRounds + SEALED.evaluatorMaxRounds;
  for (let site = 0; site < Math.max(compositionSites, synthesisLoopSites); site += 1) {
    sites.push({ kind: "SERVE", worstCaseAttempts: BOUNDS.organMaxAttempts });
  }
  return Object.freeze(sites);
}

function enumerateMaximumPathAttempts(panelSize: number, depth: number): number {
  return enumerateMaximumPathSites(panelSize, depth)
    .reduce((total, site) => total + site.worstCaseAttempts, 0);
}

describe("T17 · the ceiling covers the live topology's maximum path", () => {
  /**
   * F36's undercount, stated ARITHMETICALLY: at M=2, depth=1 the live engine
   * opens 8 author sites, 8 panel sites and 8 reviewer sites, and the maximum
   * path spends 160 attempts. DR-184-v2 minted 88 on the same topology — this
   * is the number the lane exists to repeal, named so the pin cannot silently
   * drift back to it.
   */
  it("is not the DR-184-v2 undercount: M=2 depth=1 needs 160 attempts, not 88", () => {
    const DR_184_V2_UNDERCOUNT = 88;
    expect(enumerateMaximumPathAttempts(2, 1)).toBe(160);
    expect(computeStructuralCeilingBasis(ceilingInput(2, 1)).max_model_attempts).toBe(160);
    expect(computeStructuralCeilingBasis(ceilingInput(2, 1)).max_model_attempts)
      .toBeGreaterThan(DR_184_V2_UNDERCOUNT);
  });

  it("refuses an omitted term loudly instead of minting a NaN ceiling", () => {
    const { reviewerCallsPerNode: _omitted, ...withoutReviewerTerm } = ceilingInput(2, 1);
    expect(() => computeStructuralCeilingBasis(withoutReviewerTerm as never))
      .toThrowError(expect.objectContaining({
        name: "TypedDomainError",
        code: "STRUCTURAL_CEILING_REVIEWERCALLSPERNODE_INVALID"
      }));
  });

  it("covers the independently enumerated maximum path for M=1..8, depth=1..5", () => {
    for (let panelSize = 1; panelSize <= 8; panelSize += 1) {
      for (let depth = 1; depth <= 5; depth += 1) {
        const basis = computeStructuralCeilingBasis(ceilingInput(panelSize, depth));
        expect({
          panelSize,
          depth,
          covers: basis.max_model_attempts >= enumerateMaximumPathAttempts(panelSize, depth)
        }).toEqual({ panelSize, depth, covers: true });
      }
    }
  });

  it("EQUALS the enumerated maximum path — the ceiling is tight, not merely large", () => {
    for (let panelSize = 1; panelSize <= 8; panelSize += 1) {
      for (let depth = 1; depth <= 5; depth += 1) {
        expect(computeStructuralCeilingBasis(ceilingInput(panelSize, depth)).max_model_attempts)
          .toBe(enumerateMaximumPathAttempts(panelSize, depth));
      }
    }
  });

  it("pins the recomputed grid and the bumped formula version", () => {
    const expected = [
      [31, 31, 31, 31, 31],
      [160, 296, 568, 1112, 2200],
      [324, 564, 1044, 2004, 3924],
      [576, 944, 1680, 3152, 6096]
    ];
    for (let panelSize = 1; panelSize <= 4; panelSize += 1) {
      for (let depth = 1; depth <= 5; depth += 1) {
        const basis = computeStructuralCeilingBasis(ceilingInput(panelSize, depth));
        expect(basis.max_model_attempts).toBe(expected[panelSize - 1]![depth - 1]);
        expect(basis.formula_version).toBe("DR-184-v3");
      }
    }
  });

  it("discloses the four call-site legs on the receipt, panel attempts included", () => {
    const basis = computeStructuralCeilingBasis(ceilingInput(2, 1));
    // M=2, depth=1: 2 roots + 4 expansion children + 2 exchange nodes = 8 nodes.
    expect(basis.call_sites).toEqual({ author: 8, panel: 8, reviewer: 8, serve: 8 });
    expect(basis.serve_leg).toEqual({
      composition_sites: 8,
      synthesis_loop_sites: 6,
      selected: "COMPOSITION"
    });
    expect(basis.per_site_attempts).toEqual({ judge: 3, organ: 3, panel_member: 3, cooldown_site: 7 });
  });

  it("selects the synthesis loop once T9's retirement leaves fewer composition organs", () => {
    // After T9 the composition organs are retired; the loop is the only serve
    // chain left, and the leg must follow it rather than a dead constant.
    const basis = computeStructuralCeilingBasis({
      ...ceilingInput(2, 1),
      maxRecompose: 1,
      fixedOrgansPerComposition: 1
    });
    expect(basis.serve_leg).toEqual({
      composition_sites: 1,
      synthesis_loop_sites: 6,
      selected: "SYNTHESIS_LOOP"
    });
    expect(basis.call_sites).toEqual({ author: 8, panel: 8, reviewer: 8, serve: 6 });
  });

});

describe("T17 · the receipt that carries the basis", () => {
  it("round-trips the recomputed basis through the run-head schema", () => {
    const basis = computeStructuralCeilingBasis(ceilingInput(2, 1));
    expect(parseCostEnvelopeBasis(basis)).toMatchObject({
      maxModelAttempts: 160,
      panelSize: 2,
      depth: 1
    });
  });

  it("refuses a stale DR-184-v2 basis loudly rather than enforcing an undercount", () => {
    expect(() => parseCostEnvelopeBasis({
      kind: "COMPUTED_STRUCTURAL_CEILING",
      max_model_attempts: 88,
      panel_size: 2,
      depth: 1,
      per_site_attempts: { judge: 3, organ: 3 },
      hold_cap: 2,
      final_retry_attempts: 1,
      formula_version: "DR-184-v2",
      bounds_source_ref: "engine-exports+register"
    })).toThrow("The run head has no valid register-supplied cost-envelope basis");
  });
});

describe("T17 · an over-bound input still refuses loudly at admission", () => {
  const ask: AskRequest = {
    question_line: "What follows from this evidence?",
    risk_tier: "standard",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "test-layer scope",
    as_of: "2026-08-07T00:00:00.000Z",
    steering_presets: [],
    steering_annotations: []
  };

  function settings(override: Partial<RunCreationSettings> = {}): RunCreationSettings {
    return {
      strangerSampleRate: 0,
      registerVersion: 1,
      batteryVersion: "battery:test",
      settlementWatchHandle: "watch:test",
      resolveDiscoveredPanel: async () => fixtureDiscoveredPanel(2),
      resolveEnvelopeBasis: async (input) => computeStructuralCeilingBasis({
        ...ceilingInput(input.panelSize, Number(input.depthParams.depth))
      }),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
        effectiveRiskTier,
        tierSource,
        tierProvenanceRef
      }),
      ...override
    };
  }

  it("admits a lawful ask and pins the basis it admits it with", async () => {
    await expect(evaluateAskAdmission(settings(), ask)).resolves.toMatchObject({
      envelopeBasis: { max_model_attempts: 160, formula_version: "DR-184-v3" }
    });
  });

  it.each([
    { member: "depth", value: 0, code: "STRUCTURAL_CEILING_DEPTH_INVALID" },
    { member: "synthesizerMaxRounds", value: 0, code: "STRUCTURAL_CEILING_SYNTHESIZERMAXROUNDS_INVALID" },
    { member: "evaluatorMaxRounds", value: 1.5, code: "STRUCTURAL_CEILING_EVALUATORMAXROUNDS_INVALID" },
    { member: "reviewerCallsPerNode", value: -1, code: "STRUCTURAL_CEILING_REVIEWERCALLSPERNODE_INVALID" }
  ])("refuses $member=$value at admission as a typed AskRefusal", async ({ member, value, code }) => {
    await expect(evaluateAskAdmission(settings({
      resolveEnvelopeBasis: async (input) => computeStructuralCeilingBasis({
        ...ceilingInput(input.panelSize, Number(input.depthParams.depth)),
        [member]: value
      } as never)
    }), ask)).rejects.toMatchObject({ name: "AskRefusal", code });
  });
});
