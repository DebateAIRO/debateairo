import { describe, expect, it } from "vitest";
import {
  SYNTHESIS_ROLES,
  buildCrossRootExchangePlan,
  buildMultiMakerExpansionPlan
} from "@debateai/runner";
import { SERVE_LEG, computeStructuralCeilingBasis } from "@debateai/register";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { evaluateAskAdmission, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";

/**
 * T17 — the cost envelope for the LIVE topology (goal-v4 285-295, F36).
 *
 * `DR-184-v2` counted no panel leg and billed the serve leg per recompose
 * round. Two legs of the shipped engine were wrong, and BOTH were established
 * by MEASUREMENT against a real ledger, not by reading call sites:
 *
 *  1. PANEL — the one real undercount. `runNodePanel`
 *     (apps/runner/src/index.ts:1797) hands every configured maker to
 *     `runJudgePanel`, which skips the author (PRODUCER_GRADING_FORBIDDEN,
 *     packages/judgement/src/s04.ts:233) and calls the rest — `panelSize - 1`
 *     model calls for EVERY materialized node, roots (:2105) and
 *     children/exchange nodes (:2299) alike. v2 counted this leg at ZERO.
 *  2. SERVE — an OVER-count, twice over. v2 billed
 *     `maxRecompose * ENGINE_FIXED_ORGANS_PER_COMPOSITION`, i.e. a post-compose
 *     R9 in every round, where the chain ran R9 once after the loop: SEVEN
 *     sites, not eight. F-T17T9-3 then removed the remaining seven: T9 retired
 *     that chain entirely, and the shipped runner opens one site per synthesis
 *     role per round — SIX at the sealed bound, measured from a real ledger.
 *
 * PER-SITE ATTEMPTS ARE NOT A CORRECTION — v2 had them right. A cooldown-wrapped
 * site spends `judgeMaxAttempts + finalRetryAttempts`, NOT two fresh sequences:
 * `withCooldownRetry` runs two sequences but `createPostgresProviderGateway`
 * (apps/runner/src/index.ts:3565-3577) counts attempts CUMULATIVELY per
 * call-site key and passes `remaining = maxAttempts - consumed`, so the second
 * sequence gets only the final retry. An earlier draft of this file asserted
 * `2 * judgeMaxAttempts + finalRetryAttempts` and called it a second
 * undercount; the ledger measured 4 where that predicted 7, and the claim is
 * RETRACTED. Mutant M2b keeps it retracted.
 *
 * The serve chains were mutually exclusive, and while both existed the leg was
 * the MAXIMUM of the two. T9 retired the composition organs, so there is no
 * longer an arm to select between: the leg IS the synthesizer/evaluator loop.
 * V ruled on 2026-09-05 to seal that true number (106 at M=2, depth=1) rather
 * than keep the retired arm's 109 as padding, so the ceiling below is EXACTLY
 * the enumerated maximum path and not a cover over it (F-T17T9-3).
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
  panelCallsPerNodeBasis: "PANEL_SIZE_MINUS_ONE" as const,
  /** T17/B2: the sealed maximum depth admission refuses above. */
  maxDepth: 5
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
  /**
   * Attempts are counted CUMULATIVELY per call-site key, so a cooldown-wrapped
   * site's two sequences share ONE allowance — never two fresh ones.
   * Measured at 4 in tests/integration/t17-envelope-ledger.test.ts.
   */
  const cooldownSite = BOUNDS.judgeMaxAttempts + BOUNDS.finalRetryAttempts;
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
  /**
   * The serve leg is WALKED, not multiplied: the shipped runner opens ONE call
   * site per synthesis role per round — `synthesize` (apps/runner/src/index.ts
   * :4076) and `evaluate` (:4154), each keyed by `request.round`. The ROLES are
   * enumerated from the runner's own exported set rather than summed from the
   * row's two round bounds, which is what keeps this a CHECK on the formula
   * instead of a restatement of it: `SERVE_LEG.sites` is never called here.
   *
   * Before T9 this walked the composition chain — composer + one conformance
   * per segment inside each recompose round, then ONE post-compose organ after
   * the loop — and that chain bound the leg at SEVEN sites. The runner wires
   * none of those organs now (`conformance: []` at :1083) and mints no
   * `COMPOSER:`/`CONFORMANCE:` call-site key, so the walk follows the roles.
   */
  const serveSiteKeys: string[] = [];
  for (let round = 1; round <= SEALED.evaluatorMaxRounds; round += 1) {
    for (const role of SYNTHESIS_ROLES) serveSiteKeys.push(`${role}:${round}`);
  }
  for (let site = 0; site < serveSiteKeys.length; site += 1) {
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
   * path spends 106 attempts, measured from a real ledger. DR-184-v2 minted 88
   * on the same topology. The gap is corrections in opposite directions:
   * +24 for the panel leg v2 counted at zero (8 sites x 3 attempts), -3 for the
   * post-compose organ v2 billed once per recompose round instead of once per
   * run, and -3 more once T9's retirement left the six-site synthesis loop as
   * the whole serve leg. v2's per-site attempt terms were right throughout.
   */
  it("is not the DR-184-v2 undercount: M=2 depth=1 needs 106 attempts, not 88", () => {
    const DR_184_V2_UNDERCOUNT = 88;
    expect(enumerateMaximumPathAttempts(2, 1)).toBe(106);
    expect(computeStructuralCeilingBasis(ceilingInput(2, 1)).max_model_attempts).toBe(106);
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
      [22, 22, 22, 22, 22],
      [106, 194, 370, 722, 1426],
      [228, 396, 732, 1404, 2748],
      [426, 698, 1242, 2330, 4506]
    ];
    for (let panelSize = 1; panelSize <= 4; panelSize += 1) {
      for (let depth = 1; depth <= 5; depth += 1) {
        const basis = computeStructuralCeilingBasis(ceilingInput(panelSize, depth));
        expect(basis.max_model_attempts).toBe(expected[panelSize - 1]![depth - 1]);
        expect(basis.formula_version).toBe("DR-184-v4");
      }
    }
  });

  it("discloses the four call-site legs on the receipt, panel attempts included", () => {
    const basis = computeStructuralCeilingBasis(ceilingInput(2, 1));
    // M=2, depth=1: 2 roots + 4 expansion children + 2 exchange nodes = 8 nodes.
    expect(basis.call_sites).toEqual({ author: 8, panel: 8, reviewer: 8, serve: 6 });
    expect(basis.serve_leg).toEqual({
      synthesis_loop_sites: 6,
      selected: "SYNTHESIS_LOOP"
    });
    expect(basis.per_site_attempts).toEqual({ judge: 3, organ: 3, panel_member: 3, cooldown_site: 4 });
  });

  /**
   * F-T17T9-3 replaced the test that stood here. It used to prove the leg would
   * SWITCH to the synthesis loop once a shrunken composition arm fell below it
   * — `maxRecompose: 1` giving 4 < 6 — which only ever pinned the `max()` that
   * no longer exists. The property that replaces it is stronger and lives in
   * "the serve rule has ONE home" below: no declared composition size moves the
   * leg at all, including one LARGER than the loop.
   */

  it("refuses a sealed composition shape it has never measured", () => {
    // The sealed row's `fixedOrgansPerComposition` must stay coherent with the
    // decomposition (1 composer + segmentCap conformance + 1 post-compose), or
    // the formula is costing a topology nobody counted.
    expect(() => computeStructuralCeilingBasis({
      ...ceilingInput(2, 1),
      fixedOrgansPerComposition: 5
    })).toThrowError(expect.objectContaining({
      name: "TypedDomainError",
      code: "STRUCTURAL_CEILING_COMPOSITION_SHAPE_INCOHERENT"
    }));
  });

});

describe("T17 · the receipt that carries the basis", () => {
  it("round-trips the recomputed basis through the run-head schema", () => {
    const basis = computeStructuralCeilingBasis(ceilingInput(2, 1));
    expect(parseCostEnvelopeBasis(basis)).toMatchObject({
      maxModelAttempts: 106,
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

  /**
   * The v2 fixture above is refused for SEVERAL reasons at once, so on its own
   * it pins only "some field is missing" — it survives a schema that quietly
   * re-admits an incomplete `per_site_attempts`. Each disclosure field is
   * therefore pinned INDIVIDUALLY: drop exactly one from an otherwise valid
   * v4 basis and the run head must still refuse. The list below is ALL EIGHT
   * members v4 requires beyond v2 (2 under per_site_attempts, 4 call_sites,
   * 2 serve_leg) — a partial matrix lets any omitted member be weakened to
   * `.optional()` with every case still green (codex r1 B3). It was eleven
   * until F-T17T9-3 retired the composition arm's three fields from the
   * receipt; they are not weakened but ABSENT, and the strict schema now
   * refuses a receipt that carries them (see "the serve rule has ONE home").
   */
  it.each([
    "per_site_attempts.panel_member",
    "per_site_attempts.cooldown_site",
    "call_sites.author",
    "call_sites.panel",
    "call_sites.reviewer",
    "call_sites.serve",
    "serve_leg.synthesis_loop_sites",
    "serve_leg.selected"
  ])("refuses a basis missing %s", (dottedPath) => {
    const basis = structuredClone(
      computeStructuralCeilingBasis(ceilingInput(2, 1)) as Record<string, Record<string, unknown>>
    );
    const [group, field] = dottedPath.split(".") as [string, string];
    delete basis[group]![field];
    expect(() => parseCostEnvelopeBasis(basis))
      .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
  });
});

describe("T17 · the receipt may not be self-contradictory (S09B)", () => {
  function basis(): Record<string, Record<string, unknown>> {
    return structuredClone(
      computeStructuralCeilingBasis(ceilingInput(2, 1)) as Record<string, Record<string, unknown>>
    );
  }

  /**
   * S09B's defect, and what survives F-T17T9-3.
   *
   * The serve leg is disclosed TWICE — as the billed count (`call_sites.serve`)
   * and as the arm it was read from (`serve_leg`) — and nothing made them agree,
   * so a basis could bill a count its own disclosed leg did not support. That
   * check REMAINS and is pinned here on the sentence it produces, not merely on
   * the fact that something refused.
   *
   * The OTHER two guards S09B/T17B added — the larger-arm check and the tie
   * policy — are GONE, and deliberately so. Both existed to police a CHOICE
   * between two serve arms. T9 retired the composition chain and V ruled the
   * true number sealed, so there is one arm, no choice, and nothing to police:
   * a receipt cannot name the smaller arm because there is no larger one, and a
   * tie cannot arise between one thing. What replaced them is stricter, not
   * looser — the retired arm can no longer appear on a receipt AT ALL, which
   * the strict schema refuses outright (see "the serve rule has ONE home").
   */
  it("refuses a serve call-site count that disagrees with the disclosed leg", () => {
    const wire = basis();
    wire.call_sites!.serve = 7;
    expect(() => parseCostEnvelopeBasis(wire))
      .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
  });

  /**
   * WHICH check refused is part of the assertion. Without the message, a mutant
   * that deletes this guard is credited to whatever else happens to refuse —
   * which is exactly how the first S09B hole survived review.
   */
  it("names the COUNT disagreement, so the check stays killable", () => {
    const wire = basis();
    wire.call_sites!.serve = 7;
    expect(() => parseCostEnvelopeBasis(wire))
      .toThrow("serve call sites 7 disagree with the SYNTHESIS_LOOP arm 6");
  });

  /**
   * The NEIGHBOUR this guard must NOT catch: the basis the constructor actually
   * mints. If this ever refuses, the guard is over-tight and every legitimate
   * receipt has been made unparseable.
   */
  it("accepts the basis the constructor mints, unaltered", () => {
    expect(parseCostEnvelopeBasis(basis())).toMatchObject({ panelSize: 2, maxModelAttempts: 106 });
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
      envelopeBasis: { max_model_attempts: 106, formula_version: "DR-184-v4" }
    });
  });

  /**
   * B2 — the DoD's actual clause. The cases below it are malformed inputs
   * (zero, fractional, negative); NONE of them is OVER-BOUND, i.e. above a
   * sealed maximum. `packages/contract` accepts `depth_params` as an arbitrary
   * record, so before this lane an ask with depth 6 minted a POSITIVE depth-6
   * ceiling, passed admission, and only stopped later in the runner
   * (`resolveExpansionDepth`) or when the stored basis was parsed — after the
   * asker had been admitted. Admission must refuse it, on the 422 face.
   */
  it.each([6, 7, 42])("refuses an OVER-BOUND depth of %i at admission, above the sealed maximum", async (depth) => {
    await expect(evaluateAskAdmission(settings(), { ...ask, depth_params: { depth } }))
      .rejects.toMatchObject({
        name: "AskRefusal",
        code: "STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM"
      });
  });

  it("still admits the sealed maximum depth itself — the bound is inclusive", async () => {
    await expect(evaluateAskAdmission(settings(), { ...ask, depth_params: { depth: 5 } }))
      .resolves.toMatchObject({ envelopeBasis: { depth: 5, formula_version: "DR-184-v4" } });
  });

  it("reads the bound from the SEALED row, not from a constant in the formula", () => {
    // A deployment that seals a smaller maximum refuses at that smaller value.
    expect(() => computeStructuralCeilingBasis({ ...ceilingInput(2, 3), maxDepth: 2 }))
      .toThrowError(expect.objectContaining({
        name: "TypedDomainError",
        code: "STRUCTURAL_CEILING_DEPTH_ABOVE_SEALED_MAXIMUM"
      }));
    expect(computeStructuralCeilingBasis({ ...ceilingInput(2, 3), maxDepth: 3 }).depth).toBe(3);
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

/**
 * F-T17T9-3 — THE SERVE RULE IS STATED ONCE.
 *
 * PROPERTY. The serve leg is the shipped synthesis loop — one call site per
 * synthesis role per round, at the sealed loop bound — and the run head's
 * parser DERIVES that rule from the register's own exported `SERVE_LEG` rather
 * than restating it. A basis the constructor could not have minted therefore
 * cannot parse, and the two cannot be changed apart.
 *
 * Before this lane the constructor said `serveSites = max(composition, synthesis)`
 * and `selected = composition >= synthesis ? COMPOSITION : SYNTHESIS_LOOP`, and
 * `parseCostEnvelopeBasis` said the SAME two things again, independently and on
 * purpose. That is why re-deriving the row was impossible one file at a time:
 * the parser refused every basis the corrected constructor would mint
 * (logs/t17t9-3/04-budget-parser-rejection.log). One rule, one home, both read it.
 */
describe("F-T17T9-3 · the serve rule has ONE home", () => {
  it("bills one serve site per synthesis role per round, from the register's own rule", () => {
    expect(SERVE_LEG.chain).toBe("SYNTHESIS_LOOP");
    // Not a typed 6: the rule is applied to the sealed row's own round bounds.
    expect(SERVE_LEG.sites(SEALED)).toBe(SEALED.synthesizerMaxRounds + SEALED.evaluatorMaxRounds);
    const basis = computeStructuralCeilingBasis(ceilingInput(2, 1));
    expect(basis.call_sites).toEqual({ author: 8, panel: 8, reviewer: 8, serve: SERVE_LEG.sites(SEALED) });
    expect(basis.serve_leg).toEqual({
      synthesis_loop_sites: SERVE_LEG.sites(SEALED),
      selected: SERVE_LEG.chain
    });
  });

  it("bills the loop even when the row still declares a LARGER retired composition topology", () => {
    // maxRecompose 2 x (1 composer + 2 conformance) + 1 post-compose = 7 > 6.
    // Pre-T9 that arm won and the ceiling was 109. The chain is retired: it wins
    // nothing now, and no declared composition size can move the serve leg.
    for (const maxRecompose of [1, 2, 5]) {
      const basis = computeStructuralCeilingBasis({ ...ceilingInput(2, 1), maxRecompose });
      expect(basis).toMatchObject({
        call_sites: { serve: SERVE_LEG.sites(SEALED) },
        serve_leg: { selected: SERVE_LEG.chain }
      });
    }
  });

  it("refuses a receipt that re-introduces the retired composition arm", () => {
    const wire = structuredClone(
      computeStructuralCeilingBasis(ceilingInput(2, 1)) as Record<string, Record<string, unknown>>
    );
    wire.serve_leg!.composition_sites = 7;
    expect(() => parseCostEnvelopeBasis(wire))
      .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
  });

  it("refuses a receipt naming the retired chain, however arithmetically consistent", () => {
    const wire = structuredClone(
      computeStructuralCeilingBasis(ceilingInput(2, 1)) as Record<string, Record<string, unknown>>
    );
    wire.serve_leg!.selected = "COMPOSITION";
    expect(() => parseCostEnvelopeBasis(wire))
      .toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_UNRESOLVED" }));
  });

  /**
   * The row carries the loop bound ONCE PER ROLE, but the runner has ONE bound
   * (`evaluatorLoopMaxRounds`) and TWO roles. A row sealing 5 synthesizer rounds
   * and 1 evaluator round still SUMS to six and would mint an identical ceiling
   * while describing a runner that cannot exist — the exact class of defect this
   * lane repeals. The rule refuses it instead of summing it.
   */
  it("refuses per-role round bounds that disagree, rather than summing them to the same six", () => {
    expect(() => SERVE_LEG.sites({ synthesizerMaxRounds: 5, evaluatorMaxRounds: 1 }))
      .toThrowError(expect.objectContaining({
        name: "TypedDomainError",
        code: "STRUCTURAL_CEILING_SYNTHESIS_ROUNDS_INCOHERENT"
      }));
    // …and it reaches the constructor, so no such basis can be minted at all.
    expect(() => computeStructuralCeilingBasis({
      ...ceilingInput(2, 1), synthesizerMaxRounds: 5, evaluatorMaxRounds: 1
    })).toThrowError(expect.objectContaining({
      code: "STRUCTURAL_CEILING_SYNTHESIS_ROUNDS_INCOHERENT"
    }));
    // THE NEIGHBOUR it must NOT catch: equal bounds at another value are lawful.
    expect(SERVE_LEG.sites({ synthesizerMaxRounds: 4, evaluatorMaxRounds: 4 })).toBe(8);
  });

  /**
   * THE ANTI-DRIFT PIN. The parser must READ `SERVE_LEG`, not copy it. If the
   * parser held its own literal, mutating the register's constant would leave
   * this green — so this asserts the parser's accepted chain IS the register's
   * value, which a divergent parser cannot satisfy.
   */
  it("accepts exactly the chain the register names, so the two cannot drift apart", () => {
    const basis = computeStructuralCeilingBasis(ceilingInput(2, 1));
    expect(parseCostEnvelopeBasis(basis).serveLeg)
      .toEqual({ synthesisLoopSites: SERVE_LEG.sites(SEALED), selected: SERVE_LEG.chain });
  });
});
