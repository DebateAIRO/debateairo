/**
 * A21 — the pinned role assignment as the served answer carries it: every role
 * in the kernel's order, with makers, model ids, thinking levels and backups,
 * and never a provider route or a candidate id. Owner decision O1: the honesty
 * drawer shows visitors only a plain list of model names per job; this full
 * detail is for the JSON export and audit.
 */
import { describe, expect, it, vi } from "vitest";
import { AnswerModelAssignmentSchema } from "@debateai/contract";
import { projectModelAssignment } from "@debateai/serve";
import { EXPECTED_ANSWER_MODEL_ASSIGNMENT, PINNED_ROLE_ASSIGNMENT } from "../support/roleAssignmentFixture.js";

const RUN_ID = "00000000-0000-4000-8000-00000000a211";
const PINNED_ROW = Object.freeze({ assignment: PINNED_ROLE_ASSIGNMENT, strength: "BALANCED", stepped_down: true });

describe("A21 · the pinned assignment on the served answer", () => {
  it("projects nothing for a run that pinned nothing", () => {
    expect(projectModelAssignment(null, RUN_ID)).toBeUndefined();
  });

  it("projects every role in the kernel's order, with makers, model ids, levels and backups", () => {
    const projected = projectModelAssignment(PINNED_ROW, RUN_ID);
    expect(projected).toEqual(EXPECTED_ANSWER_MODEL_ASSIGNMENT);
    expect(AnswerModelAssignmentSchema.parse(projected)).toEqual(EXPECTED_ANSWER_MODEL_ASSIGNMENT);
  });

  it("never carries a provider route or a candidate id to the page", () => {
    const text = JSON.stringify(projectModelAssignment(PINNED_ROW, RUN_ID));
    expect(text).not.toContain("provider:test-layer");
    expect(text).not.toContain("@high");
  });

  // Fix round 1 (I1): an optional field never fails an answer. A pinned row
  // that does not parse is omitted WHOLE (never shown half) and reported by
  // name on one operator line that carries the run id and no row content.
  it("omits a pinned row that does not parse, and reports it by name with no row content", () => {
    const operatorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      for (const row of [
        { assignment: { roles: {} }, strength: "BALANCED", stepped_down: false },
        { assignment: PINNED_ROLE_ASSIGNMENT, strength: "TURBO", stepped_down: false },
        { assignment: PINNED_ROLE_ASSIGNMENT, strength: "BALANCED", stepped_down: "yes" }
      ]) {
        operatorLog.mockClear();
        expect(projectModelAssignment(row, RUN_ID)).toBeUndefined();
        expect(operatorLog.mock.calls).toEqual([[`[ANSWER_MODEL_ASSIGNMENT_INVALID] run=${RUN_ID}`]]);
      }
      operatorLog.mockClear();
      projectModelAssignment(PINNED_ROW, RUN_ID);
      projectModelAssignment(null, RUN_ID);
      expect(operatorLog).not.toHaveBeenCalled();
    } finally {
      operatorLog.mockRestore();
    }
  });
});
