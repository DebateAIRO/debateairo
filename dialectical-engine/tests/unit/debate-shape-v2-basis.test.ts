/**
 * V4 start step, Task 13 (spec 2026-11-03 §5): the structural ceiling mints a v2 receipt (DR-185-shape-v2) and the strict
 * receipt parser reads it beside v1. A v2 debate's author sites are its map, its nodes and every path's answer so far
 * (decided 3 Nov: they stay author sites; the runner books them as the debate's own calls, so the answer's reserve is
 * the serve leg's, whole); it has no cross-exchange sites; its graders and reviewers sit on every node. A receipt whose
 * numbers its own sizes do not give is refused, never priced.
 */
import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import {
  computeStructuralCeilingBasis, debateShapePolicyStartValues, resolveDebateShape, resolveDebateShapeV2, webSitesOf,
  type DebateShapeV2Input, type StructuralCeilingInput
} from "@debateai/register";

const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const POLICY = debateShapePolicyStartValues();
const S = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
const plusMenu: DebateShapeV2Input = resolveDebateShapeV2(POLICY, "plus", { ...S, paths: 5, pathsSource: "MENU" }, 4);
const v2 = (changes: Partial<StructuralCeilingInput> = {}) =>
  computeStructuralCeilingBasis({ ...TERMS, panelSize: 4, depth: 1, shapeV2: plusMenu, ...changes });
const refusalOf = (basis: unknown): string => {
  try {
    parseCostEnvelopeBasis(basis);
  } catch (error) {
    return (error as Error).message;
  }
  return "accepted";
};

describe("the ceiling mints shape receipt v2", () => {
  it("counts every path's root, points and answer so far as author sites, with no cross exchange", () => {
    expect(v2()).toMatchObject({ formula_version: "DR-185-shape-v2", max_model_attempts: 531,
      call_sites: { author: 47, panel: 75, reviewer: 25, serve: 6 }, shape: { version: 2, nodes: 25, path_outcome_sites: 20 } });
    expect((v2().per_site_attempts as Record<string, unknown>).cross_exchange_site).toBeUndefined();
    expect(v2({ shapeV2: { ...plusMenu, pathsSource: "RUN_BUILT", runListWriters: 4 } }).max_model_attempts).toBe(555);
  });

  it("adds every path's web pack", () => {
    // Task 91k (owner 9 Nov): 2 more reader-1 calls a path, 10 calls x 3 attempts over the 696 before.
    expect(v2({ web: webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" }) }).max_model_attempts).toBe(726);
  });

  it("refuses both shapes at once, and a v2 shape with the backup provision", () => {
    const v1 = resolveDebateShape({ policy: POLICY, plan: "plus", makers: 4, settings: S })!;
    expect(() => v2({ shape: v1 })).toThrow(expect.objectContaining({ code: "STRUCTURAL_CEILING_SHAPE_INVALID" }));
    expect(() => v2({ backupSequencesProvisioned: 1 })).toThrow(expect.objectContaining({ code: "STRUCTURAL_CEILING_SHAPE_INVALID" }));
  });
});

describe("the strict parser reads v2 beside v1", () => {
  const web = v2({ web: webSitesOf({ kind: "PATHS", depth: "QUICK", paths: 5, origin: "START" }) });

  it("reads the v2 sizes, never as a v1 shape, and the web part of either version", () => {
    const parsed = parseCostEnvelopeBasis(web);
    expect(parsed.shapeV2).toEqual(plusMenu);
    expect("shape" in parsed).toBe(false);
    expect(parsed.web).toMatchObject({ kind: "PATHS", packs: 5, packReadsPerCall: 5 });
    expect(parsed.serveReserveAttempts).toBe(18);
  });

  it("refuses a v2 receipt its own sizes do not give", () => {
    const shape = web.shape as Record<string, unknown>;
    const callSites = web.call_sites as Record<string, unknown>;
    expect(refusalOf({ ...web, shape: { ...shape, nodes: 26 } })).toContain("shape sites");
    expect(refusalOf({ ...web, formula_version: "DR-185-shape-v1" })).toContain("formula");
    expect(refusalOf({ ...web, call_sites: { ...callSites, author: 46 } })).toContain("author sites");
  });
});
