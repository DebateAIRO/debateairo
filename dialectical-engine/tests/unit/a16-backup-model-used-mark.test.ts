import { describe, expect, it } from "vitest";
import { CONDITION_MARKS } from "@debateai/kernel";
import { ConditionMarkRecordSchema, ConditionMarkSchema } from "@debateai/contract";
import {
  BACKUP_MODEL_USED_MARK,
  DEGRADED_DIVERSITY_MARK,
  assertRequiredConditionMarkRecords,
  type ConditionMarkRecord
} from "@debateai/serve";
import { conditionMarkLabel } from "../../apps/ui/lib/v3/labels.js";

const RECORD: ConditionMarkRecord = {
  mark: "BACKUP-MODEL-USED",
  scope: "answer",
  subjectRef: "POSITION#0",
  reason: "POSITION seat 0 moved from provider:a to its runner-up provider:c (TRANSPORT_FAILURE) at JUDGE:seat:main",
  liftPath: "Ask again when the main model for this role is reachable",
  servedRootRule: null,
  affectedNodeIds: ["00000000-0000-4000-8000-000000000001"],
  callSiteKey: null
};

describe("A16 · R6 — the BACKUP-MODEL-USED mark", () => {
  it("is minted right after DEGRADED-DIVERSITY, never at the positional tail", () => {
    expect(BACKUP_MODEL_USED_MARK).toBe("BACKUP-MODEL-USED");
    expect(CONDITION_MARKS.indexOf(BACKUP_MODEL_USED_MARK))
      .toBe(CONDITION_MARKS.indexOf(DEGRADED_DIVERSITY_MARK) + 1);
    expect(CONDITION_MARKS.slice(-4)).toEqual([
      "HIDDEN-UNJUDGEABLE", "DERIVED-STANDING-UNREVIEWED", "HIDDEN-LOW-SCORE", "UNAUTHORED-BRANCH-HALTED"
    ]);
    expect(CONDITION_MARKS).toHaveLength(38);
  });

  it("is accepted by the wire schema and has its own plain-words label", () => {
    expect(ConditionMarkSchema.parse("BACKUP-MODEL-USED")).toBe("BACKUP-MODEL-USED");
    const label = conditionMarkLabel("BACKUP-MODEL-USED");
    expect(label.trim().length).toBeGreaterThan(0);
    expect(CONDITION_MARKS.filter((mark) => conditionMarkLabel(mark) === label)).toEqual(["BACKUP-MODEL-USED"]);
  });

  it("is a two-way required record: no mark without a record, no record without the mark", () => {
    expect(() => assertRequiredConditionMarkRecords(["BACKUP-MODEL-USED"], []))
      .toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_REQUIRED" }));
    expect(() => assertRequiredConditionMarkRecords([], [RECORD]))
      .toThrowError(expect.objectContaining({ code: "CONDITION_MARK_RECORD_WITHOUT_MARK" }));
    expect(() => assertRequiredConditionMarkRecords(["BACKUP-MODEL-USED"], [RECORD])).not.toThrow();
  });

  it("rides the answer projection with a NULL call-site key (0025 allows a key only on the unjudged/halted classes)", () => {
    expect(ConditionMarkRecordSchema.parse({
      mark: RECORD.mark, scope: RECORD.scope, subject_ref: RECORD.subjectRef, reason: RECORD.reason,
      lift_path: RECORD.liftPath, served_root_rule: null, call_site_key: null,
      affected_node_ids: RECORD.affectedNodeIds
    })).toMatchObject({ mark: "BACKUP-MODEL-USED", call_site_key: null });
  });
});
