/**
 * A21 — the pinned role assignment as the honesty drawer reads it: every role
 * in the kernel's order, with makers, model ids, thinking levels and backups,
 * and never a provider route or a candidate id.
 */
import { describe, expect, it } from "vitest";
import { AnswerModelAssignmentSchema } from "@debateai/contract";
import { projectModelAssignment } from "@debateai/serve";
import { EXPECTED_ANSWER_MODEL_ASSIGNMENT, PINNED_ROLE_ASSIGNMENT } from "../support/roleAssignmentFixture.js";

const PINNED_ROW = Object.freeze({ assignment: PINNED_ROLE_ASSIGNMENT, strength: "BALANCED", stepped_down: true });

describe("A21 · the pinned assignment on the served answer", () => {
  it("projects nothing for a run that pinned nothing", () => {
    expect(projectModelAssignment(null)).toBeUndefined();
  });

  it("projects every role in the kernel's order, with makers, model ids, levels and backups", () => {
    const projected = projectModelAssignment(PINNED_ROW);
    expect(projected).toEqual(EXPECTED_ANSWER_MODEL_ASSIGNMENT);
    expect(AnswerModelAssignmentSchema.parse(projected)).toEqual(EXPECTED_ANSWER_MODEL_ASSIGNMENT);
  });

  it("never carries a provider route or a candidate id to the page", () => {
    const text = JSON.stringify(projectModelAssignment(PINNED_ROW));
    expect(text).not.toContain("provider:test-layer");
    expect(text).not.toContain("@high");
  });

  it("refuses a pinned row that does not parse, by name", () => {
    for (const row of [
      { assignment: { roles: {} }, strength: "BALANCED", stepped_down: false },
      { assignment: PINNED_ROLE_ASSIGNMENT, strength: "TURBO", stepped_down: false },
      { assignment: PINNED_ROLE_ASSIGNMENT, strength: "BALANCED", stepped_down: "yes" }
    ]) {
      expect(() => projectModelAssignment(row))
        .toThrowError(expect.objectContaining({ code: "ANSWER_MODEL_ASSIGNMENT_INVALID" }));
    }
  });
});
