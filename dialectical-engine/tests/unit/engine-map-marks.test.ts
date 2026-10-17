// tests/unit/engine-map-marks.test.ts
import { describe, expect, it } from "vitest";
import { CONDITION_MARKS, DEBATE_SHAPE_MARKS } from "@debateai/kernel";
import { MAP_MARKS } from "@debateai/map";
import { assertRequiredConditionMarkRecords, type ConditionMarkRecord } from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

const CHECK_MARKS = ["MAP_CHECK_UNAVAILABLE", "MAP_ANSWER_REPLACED", "MAP_ANSWER_DROPPED", "MAP_ANSWER_KEPT_UNCHECKED"] as const;
const record = (mark: ConditionMarkRecord["mark"]): ConditionMarkRecord => Object.freeze({ mark, scope: "answer", subjectRef: "run-1",
  reason: `${mark}:CHECK`, liftPath: null, servedRootRule: null, affectedNodeIds: ["node-0"] });

/** Engine redesign R3 (spec §5.5): the answer check's four answer-scope marks. */
describe("the answer check's marks", () => {
  it("follow CHOOSE_QUOTA_FILLED in the kernel list and in the debate shape's list, never in the DR-176 tail", () => {
    const at = CONDITION_MARKS.indexOf("CHOOSE_QUOTA_FILLED");
    expect(CONDITION_MARKS.slice(at + 1, at + 5)).toEqual([...CHECK_MARKS]);
    const shapeAt = DEBATE_SHAPE_MARKS.indexOf("CHOOSE_QUOTA_FILLED");
    expect(DEBATE_SHAPE_MARKS.slice(shapeAt + 1, shapeAt + 5)).toEqual([...CHECK_MARKS]);
    expect(CONDITION_MARKS.slice(-4)).toEqual(["HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"]);
    expect(MAP_MARKS.slice(-4)).toEqual([...CHECK_MARKS]);
  });

  it("each needs its typed record, both ways", () => {
    for (const mark of CHECK_MARKS) {
      expect(() => assertRequiredConditionMarkRecords([mark], [])).toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" }));
      expect(() => assertRequiredConditionMarkRecords([mark], [record(mark)])).not.toThrow();
    }
  });

  it("each has its own plain label with no internals, no digits and no grading words", () => {
    const labels = CHECK_MARKS.map((mark) => conditionMarkLabel(mark));
    expect(new Set(labels).size).toBe(4);
    for (const label of labels) expect(label).not.toMatch(/\d|grade|score|judg|threshold|panel|dispersion|leverage|node|MAP_|check_id/iu);
    for (const mark of CHECK_MARKS) expect(CONDITION_MARKS.filter((other) => conditionMarkLabel(other) === conditionMarkLabel(mark))).toEqual([mark]);
  });
});
