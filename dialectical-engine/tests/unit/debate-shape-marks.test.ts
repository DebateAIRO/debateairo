import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS } from "@debateai/map";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

// Pre-flight PF-B47: every record names a node, because `ServeRepository.persist` refuses an empty list
// (CONDITION_MARK_AFFECTED_NODES_REQUIRED). An answer-scope map record carries the SERVED ROOT's node id (as the runner's
// `mapConditionRecords(result, runId, servedRootNodeId)` writes it, Task 12); a node-scope extension record names its node.
const record = (mark: ConditionMarkRecord["mark"], scope: "answer" | "node"): ConditionMarkRecord => Object.freeze({
  mark, scope, subjectRef: scope === "node" ? "node-0" : "run-1", reason: `${mark}:TEST`, liftPath: null, servedRootRule: null,
  affectedNodeIds: ["node-0"] });

describe("the debate shape's condition marks", () => {
  it("sit in the kernel list right after the panel marks, never in the DR-176 tail", () => {
    const at = CONDITION_MARKS.indexOf("PANEL-DEGRADED-SINGLE-VOICE");
    expect(CONDITION_MARKS.slice(at + 1, at + 1 + DEBATE_SHAPE_MARKS.length)).toEqual([...DEBATE_SHAPE_MARKS]);
    expect(CONDITION_MARKS.slice(-4)).toEqual(["HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"]);
    expect(CONDITION_MARKS).toHaveLength(54); // + R3's four answer-check marks (engine redesign spec §5.5)
  });

  it("names every map mark the map package mints", () => {
    for (const mark of MAP_MARKS) expect(DEBATE_SHAPE_MARKS).toContain(mark);
  });

  // TypedDomainError carries its code on `.code`, not in the message (the repo idiom, as in serve-s05.test.ts).
  it("each requires its typed record, both ways", () => {
    for (const mark of DEBATE_SHAPE_MARKS) {
      expect(() => assertRequiredConditionMarkRecords([mark], []))
        .toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" }));
      expect(() => assertRequiredConditionMarkRecords([], [record(mark, "answer")]))
        .toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_WITHOUT_MARK" }));
      expect(() => assertRequiredConditionMarkRecords([mark], [record(mark, mark.includes("EXTENDED") ? "node" : "answer")])).not.toThrow();
    }
  });

  it("has a distinct plain label with no internals and no grading or judging words", () => {
    const labels = DEBATE_SHAPE_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(new Set(labels).size).toBe(labels.length);
    // Ruling PF-B9: user-facing mark labels never speak of grading, scores, judges, thresholds or panels.
    for (const label of labels) expect(label).not.toMatch(/\d|grade|score|judg|threshold|panel|dispersion|leverage|node|MAP_/iu);
    // Distinct from every other mark's label too, so the page never names two marks alike.
    for (const mark of DEBATE_SHAPE_MARKS) {
      expect(CONDITION_MARKS.filter((other) => conditionMarkLabel(other) === conditionMarkLabel(mark))).toEqual([mark]);
    }
  });
});
