/**
 * V4 start step, Task 12 (spec 2026-11-03 §4.3, §5): shape receipt v2 (DR-185-shape-v2). A chosen path is its own root,
 * argued for and against, so the debate counts one position per path and no cross replies; the map before Start is
 * not the run's (a menu's lists were written before Start), except when the run builds its own list (RUN_BUILT, an old
 * page's ask); Free and a dig have no gap round; each path has its answer so far (2 calls a round, 2 rounds paid, 1 Free).
 * R22.1's v1 schema refuses a v2 receipt, so an older runner never claims a v2 run.
 */
import { describe, expect, it } from "vitest";
import {
  DEBATE_SHAPE_V2_FORMULA_VERSION, assertDebateShapeV2Input, debateShapePolicyStartValues, debateShapeReceiptSchema, debateShapeReceiptV2,
  debateShapeReceiptV2Schema, debateShapeSiteCountsV2, debateShapeV2OfReceipt, isShapeReceiptV2, resolveDebateShapeV2, type DebateShapeV2Input
} from "@debateai/register";

const POLICY = debateShapePolicyStartValues();
const S = { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const;
const refusalOf = (shape: DebateShapeV2Input, panel: number): string | null => {
  try {
    assertDebateShapeV2Input(shape, panel);
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  return null;
};

describe("shape receipt v2", () => {
  const plusMenu = resolveDebateShapeV2(POLICY, "plus", { ...S, paths: 5, pathsSource: "MENU" }, 4);

  it("resolves a plan's sizes for its chosen paths", () => {
    expect(DEBATE_SHAPE_V2_FORMULA_VERSION).toBe("DR-185-shape-v2");
    expect(plusMenu).toMatchObject({ paths: 5, pathsSource: "MENU", runListWriters: 0, graders: 3, pointsPerPath: 4, deeperTopPoints: 2, gapRounds: 2,
      closeCallExtraGraders: 0, writerBound: 12_288, mapMergeBound: 32_768 });
    expect(resolveDebateShapeV2(POLICY, "free", { ...S, paths: 3, pathsSource: "RUN_BUILT" }, 2))
      .toMatchObject({ runListWriters: 3, graders: 1, gapRounds: 0, pointsPerPath: 3 });
    expect(resolveDebateShapeV2(POLICY, "plus", { ...S, paths: 2, pathsSource: "DIG_PICKS" }, 4).gapRounds).toBe(0);
  });

  it("refuses too few makers, paths outside 1 to 8, and settings the plan does not allow", () => {
    expect(() => resolveDebateShapeV2(POLICY, "plus", { ...S, paths: 5, pathsSource: "MENU" }, 1)).toThrow("DEBATE_SHAPE_MAKERS_INVALID");
    for (const paths of [0, 9]) expect(() => resolveDebateShapeV2(POLICY, "plus", { ...S, paths, pathsSource: "MENU" }, 4)).toThrow("DEBATE_SHAPE_PATHS_INVALID");
    expect(() => resolveDebateShapeV2(POLICY, "free", { ...S, depthMode: "fixed", paths: 3, pathsSource: "MENU" }, 2))
      .toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:depthMode");
    expect(() => resolveDebateShapeV2(POLICY, "free", { ...S, scrutiny: "deep", paths: 3, pathsSource: "MENU" }, 2))
      .toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:scrutiny");
  });

  it("counts one root per path, its points, the deeper rounds and each path's answer so far", () => {
    expect(debateShapeSiteCountsV2(plusMenu, 1)).toEqual({ mapSites: 2, positionNodes: 5, pointNodes: 20, deeperNodes: 0, scrutinyNodes: 0,
      nodes: 25, pathOutcomeSites: 20 });
    expect(debateShapeSiteCountsV2(plusMenu, 2).nodes).toBe(45);
    expect(debateShapeSiteCountsV2({ ...plusMenu, pathsSource: "RUN_BUILT", runListWriters: 4 }, 1).mapSites).toBe(8);
    const free = resolveDebateShapeV2(POLICY, "free", { ...S, paths: 3, pathsSource: "MENU" }, 2);
    expect(debateShapeSiteCountsV2(free, 1)).toMatchObject({ mapSites: 0, pathOutcomeSites: 6 });
  });

  it("refuses a shape that does not fit its panel or its own rules; paths are not bounded by the panel", () => {
    for (const [shape, panel] of [
      [{ ...plusMenu, graders: 3 }, 2], [plusMenu, 1], [{ ...plusMenu, graders: 3, closeCallExtraGraders: 1 }, 4],
      [{ ...plusMenu, pathsSource: "RUN_BUILT", runListWriters: 0 }, 4], [{ ...plusMenu, runListWriters: 2 }, 4],
      [{ ...plusMenu, plan: "free", gapRounds: 1 }, 4], [{ ...plusMenu, pathsSource: "DIG_PICKS", gapRounds: 1 }, 4],
      [{ ...plusMenu, scrutiny: "deep", scrutinyRoundsPerPoint: 0, scrutinyPointsPerDebate: 0 }, 4]
    ] as const) {
      expect(refusalOf(shape as DebateShapeV2Input, panel), JSON.stringify(shape).slice(0, 80)).toBe("STRUCTURAL_CEILING_SHAPE_INVALID");
    }
    expect(refusalOf({ ...plusMenu, paths: 8, graders: 1 }, 2)).toBeNull();
  });

  it("mints a strict receipt that reads back to the same sizes, and R22.1's schema refuses it", () => {
    const receipt = debateShapeReceiptV2(plusMenu, debateShapeSiteCountsV2(plusMenu, 1), 0);
    expect(Object.keys(receipt)).toEqual(["version", "plan", "depth_mode", "scrutiny", "answer_length", "paths", "paths_source", "run_list_writers",
      "graders", "points_per_path", "deeper_top_points", "gap_rounds", "close_call_extra_graders", "scrutiny_rounds_per_point",
      "scrutiny_points_per_debate", "scrutiny_leverage_min", "scrutiny_weak_below", "answer_words", "writer_bound", "map_sites", "nodes",
      "path_outcome_sites", "backup_sequences", "map_merge_bound"]);
    expect(debateShapeV2OfReceipt(receipt)).toEqual(plusMenu);
    expect(debateShapeReceiptV2Schema.safeParse(receipt).success).toBe(true);
    expect(debateShapeReceiptV2Schema.safeParse({ ...receipt, backup_sequences: 1 }).success).toBe(false);
    expect(debateShapeReceiptSchema.safeParse(receipt).success).toBe(false);
    expect(isShapeReceiptV2({ formula_version: "DR-185-shape-v2", shape: receipt })).toBe(true);
    expect(isShapeReceiptV2({ formula_version: "DR-185-shape-v1", shape: receipt })).toBe(false);
  });
});
