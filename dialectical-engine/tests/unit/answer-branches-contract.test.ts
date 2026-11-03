/**
 * V4 start step, Task 16 (spec 2026-11-03 §2.7, §2.8): Answer.branches, the run read's paths and the public snapshot's.
 * An R22 answer carries no `branches` key. Paths are b1..bN in their order; a path being looked into has no outcome;
 * an argued or failed one's state follows its outcome; "+ N more" lists each item once; the person's own words carry
 * no title. The public snapshot never carries "more", the point-of-view line, the carry-on box, the evidence ids or the
 * root's node id.
 */
import { describe, expect, it } from "vitest";
import {
  AnswerBranchesSchema, AnswerSchema, PublicBranchesSchema, PublicDebateSchema, RunProjectionSchema, publicBranchesOf
} from "@debateai/contract";
import { branchFixture, branchesFixture, outcomeFixture } from "../support/branchesFixture.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const RUN = { run_ref: "11111111-1111-4111-8111-111111111111", question_line: "Should Romania build new nuclear plants?", state: "RUNNING",
  terminal_reason: null, hold_until: null };
const THREE = [branchFixture(1, { state: "LOOKING", outcome: null }), branchFixture(2), branchFixture(3, { state: "FAILED", outcome: outcomeFixture("FAILED") })];
const messageOf = (value: unknown): string => {
  const parsed = AnswerBranchesSchema.safeParse(value);
  return parsed.success ? "accepted" : parsed.error.issues.map((issue) => issue.message).join("; ");
};

describe("Answer.branches", () => {
  it("is absent on an R22 answer and accepted with paths being looked into, argued and failed", () => {
    expect(Object.hasOwn(buildFairShapedAnswer(), "branches")).toBe(false);
    const branches = branchesFixture(THREE);
    expect(AnswerSchema.safeParse({ ...buildFairShapedAnswer(), branches }).success).toBe(true);
  });

  it("refuses paths out of order, an outcome while looking, a state its outcome does not give, a repeated more item and a titled own view", () => {
    const branches = branchesFixture(THREE);
    expect(messageOf({ ...branches, paths: [branchFixture(2), branchFixture(1)] })).toContain("paths are numbered b1..bN in their order");
    expect(messageOf({ ...branches, paths: [{ ...branchFixture(1), state: "LOOKING" }] })).toContain("a path still being looked into has no outcome");
    expect(messageOf({ ...branches, paths: [{ ...branchFixture(1), state: "FAILED" }] })).toContain("a path's state follows its outcome");
    const more = { more_id: "more-kp02", title: "Storage", question: "Where does the waste go?", is_new: false };
    expect(messageOf({ ...branches, more: [more, more] })).toContain("each more item is listed once");
    expect(messageOf({ ...branches, paths: [{ ...branchFixture(1), viewpoints: [{ title: "Mine", question: "My view?", own: true }] }] }))
      .toContain("the person's own words carry no title");
  });

  it("rides the run read, with or without paths", () => {
    expect(RunProjectionSchema.safeParse(RUN).success).toBe(true);
    expect(RunProjectionSchema.safeParse({ ...RUN, branches: branchesFixture(THREE) }).success).toBe(true);
  });
});

describe("the public snapshot's paths", () => {
  it("keeps only what a reader may see", () => {
    const branches = branchesFixture(THREE, { carry_on_to_report: true,
      more: [{ more_id: "more-kp04", title: "Storage", question: "Where does the waste go?", is_new: true }] });
    const shown = publicBranchesOf(branches);
    expect(Object.keys(shown)).toEqual(["source", "width", "paths", "also_raised", "main_trust"]);
    expect(Object.keys(shown.paths[0]!)).toEqual(["path_id", "order", "title", "question", "author", "viewpoints", "state", "outcome"]);
    expect(Object.keys(shown.paths[1]!.viewpoints[0]!)).toEqual(["title", "question", "own"]);
    expect(Object.keys(shown.paths[1]!.outcome!)).toEqual(["state", "text", "what_changed", "trust"]);
    expect(shown.paths.some((path) => Object.hasOwn(path, "root_node_id"))).toBe(false);
    expect(PublicBranchesSchema.safeParse(shown).success).toBe(true);
    expect(PublicDebateSchema.shape.branches.safeParse(shown).success).toBe(true);
  });
});
