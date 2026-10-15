import { describe, expect, it } from "vitest";
import { MAP_FIXED_ANGLE_KINDS, MAP_LEANS, MAP_LIMITS, MAP_MARKS, MAP_NOTES, MAP_STEPS } from "@debateai/map";
import { auditArchitecture, auditEdgeManifest } from "../../tools/orphan-audit/src/index.js";

describe("map package: the shared vocabulary (spec 2026-10-12 §1)", () => {
  it("names the three fixed angle kinds and the three leans", () => {
    expect([...MAP_FIXED_ANGLE_KINDS]).toEqual(["OPPOSITE_CASE", "ASKER_WORRY", "PRACTICAL"]);
    expect([...MAP_LEANS]).toEqual(["for_some_answer", "against_some_answer", "context"]);
  });

  it("keeps the spec's lengths and counts", () => {
    expect(MAP_LIMITS.claimMaxChars).toBe(240);
    expect(MAP_LIMITS.whyMaxChars).toBe(240);
    expect([MAP_LIMITS.anglesMin, MAP_LIMITS.anglesMax]).toEqual([4, 7]);
    expect([MAP_LIMITS.specificAnglesMin, MAP_LIMITS.specificAnglesMax]).toEqual([1, 4]);
    expect([MAP_LIMITS.listPointsMin, MAP_LIMITS.listPointsMax]).toEqual([3, 8]);
    expect([MAP_LIMITS.listAnswersMin, MAP_LIMITS.listAnswersMax]).toEqual([1, 3]);
    expect(MAP_LIMITS.framingChallengesMax).toBe(3);
    expect([MAP_LIMITS.chooseDistinctAnswersMin, MAP_LIMITS.chooseAnswersMax]).toEqual([2, 4]);
    expect(MAP_LIMITS.gapRoundNewPointsToContinue).toBe(2);
    expect(Object.isFrozen(MAP_LIMITS)).toBe(true);
  });

  it("lists exactly the spec's marks, the notes and the steps", () => {
    expect([...MAP_MARKS]).toEqual(["MAP_ANGLES_FALLBACK", "MAP_MERGE_FALLBACK", "MAP_CHOOSE_FALLBACK",
      "MAP_UNAVAILABLE_TODAYS_OPENING", "ANSWERS_FILLED", "CHOOSE_QUOTA_FILLED"]);
    expect([...MAP_NOTES]).toEqual(["LIST_REASSIGNED", "LIST_DROPPED", "MERGE_ITEMS_KEPT", "GAP_SKIPPED", "GAP_STOPPED", "MAP_STOPPED",
      "LANGUAGE_PLANNER_DISAGREES", "INTERNAL_WORDS_SKIPPED"]);
    expect([...MAP_STEPS]).toEqual(["ANGLES", "LIST", "SNOWBALL", "MERGE", "GAP", "CHOOSE"]);
  });

  it("is a declared dependency-edge row that depends on kernel, providers and db only", async () => {
    // The audit checks only the rows it declares, so a missing row could not fail the violation filter alone: the
    // row count (36 -> 37) and the package's own manifest read pin that the row exists and what it names.
    const manifest = await auditEdgeManifest("map", "packages/map");
    expect(manifest.violations).toEqual([]);
    expect([...manifest.dependencies].sort()).toEqual(["db", "kernel", "providers"]);
    const report = await auditArchitecture();
    expect(report.edgeRowsChecked).toBe(37);
    expect(report.violations.filter((violation) => violation.startsWith("map "))).toEqual([]);
  });
});
