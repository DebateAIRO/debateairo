/**
 * V4 start step, Task 57a (spec 2026-11-03 §2 items 7 and 8; items wait-d1, journey-f1, wait-f16): the run read's path progress and
 * the carry-on part. While a path debate runs, each path shows one step line and at most 6 quiet dots, then its findings once its own
 * checks are done; the carry-on line says which part is running. The server sends both, so they are the same after a reload and on
 * another device. Every new member is optional and rides only a path debate: an R22 run read and answer keep their bytes. Made-up words.
 */
import { describe, expect, it } from "vitest";
import {
  AnswerSchema, CARRY_ON_PARTS, RUN_PATH_LIMITS, RUN_PATH_POINT_STATES, RUN_PATH_STEPS, RunPathFindingSchema, RunPathProgressSchema,
  RunProjectionSchema
} from "@debateai/contract";
import { branchFixture, branchesFixture } from "../support/branchesFixture.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";

const RUN = { run_ref: "11111111-1111-4111-8111-111111111111", question_line: "Should Romania build new nuclear plants?", state: "RUNNING",
  terminal_reason: null, hold_until: null };
const FINDING = { node_ref: "n-3", text: "Storage adds about a third to the cost.", trust: "SURE_FOR_CASE" };
const PROGRESS = [
  { path_id: "b1", step: "FINDING_SOURCES", points: [], findings: [] },
  { path_id: "b2", step: "ARGUING", points: ["PUT_FORWARD", "BEING_CHECKED", "CHECKED"], findings: [] },
  { path_id: "b3", step: null, points: [], findings: [FINDING] }
];
const looking = (order: number) => branchFixture(order, { state: "LOOKING", outcome: null });
/** b1 and b2 still being looked into, b3 argued with its outcome. */
const BRANCHES = branchesFixture([looking(1), looking(2), branchFixture(3)]);
const TICKED = branchesFixture([looking(1), looking(2), branchFixture(3)], { carry_on_to_report: true });

type Parser = { safeParse(value: unknown): { success: true } | { success: false; error: { issues: readonly { message: string }[] } } };
const messagesOf = (schema: Parser, value: unknown): readonly string[] => {
  const parsed = schema.safeParse(value);
  return parsed.success ? ["accepted"] : parsed.error.issues.map((issue) => issue.message);
};

describe("each path's progress", () => {
  it("names the limits, the steps, the dots' states and the carry-on parts", () => {
    expect(Object.isFrozen(RUN_PATH_LIMITS)).toBe(true);
    expect(RUN_PATH_LIMITS).toEqual({ pointsShownMax: 6, findingsMax: 40, nodeRefMaxChars: 160 });
    expect(RUN_PATH_STEPS).toEqual(["FINDING_SOURCES", "ARGUING", "CHECKING"]);
    expect(RUN_PATH_POINT_STATES).toEqual(["PUT_FORWARD", "BEING_CHECKED", "CHECKED"]);
    expect(CARRY_ON_PARTS).toEqual(["ANSWER", "DIGS", "REPORT"]);
  });

  it("is accepted beside three paths: two being looked into, one argued with its outcome", () => {
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: BRANCHES, path_progress: PROGRESS })).toEqual(["accepted"]);
    for (const entry of PROGRESS) expect(messagesOf(RunPathProgressSchema, entry)).toEqual(["accepted"]);
  });

  it("refuses 7 dots and 41 findings", () => {
    const dots = RunPathProgressSchema.safeParse({ path_id: "b2", step: "ARGUING", points: Array(7).fill("PUT_FORWARD"), findings: [] });
    expect(dots.success).toBe(false);
    expect(dots.error?.issues.map((issue) => [issue.code, issue.path.join(".")])).toEqual([["too_big", "points"]]);
    const findings = RunPathProgressSchema.safeParse({ path_id: "b3", step: null, points: [],
      findings: Array.from({ length: 41 }, (_, index) => ({ ...FINDING, node_ref: `n-${index}` })) });
    expect(findings.success).toBe(false);
    expect(findings.error?.issues.map((issue) => [issue.code, issue.path.join(".")])).toEqual([["too_big", "findings"]]);
    expect(RunPathProgressSchema.safeParse({ path_id: "b2", step: "ARGUING", points: Array(6).fill("CHECKED"), findings: [] }).success).toBe(true);
    expect(RunPathProgressSchema.safeParse({ path_id: "b3", step: null, points: [],
      findings: Array.from({ length: 40 }, (_, index) => ({ ...FINDING, node_ref: `n-${index}` })) }).success).toBe(true);
  });

  it("refuses a step beside findings, and findings and points together", () => {
    expect(messagesOf(RunPathProgressSchema, { path_id: "b3", step: "CHECKING", points: [], findings: [FINDING] }))
      .toEqual(["a path still at work shows no findings"]);
    expect(messagesOf(RunPathProgressSchema, { path_id: "b3", step: null, points: ["CHECKED"], findings: [FINDING] }))
      .toEqual(["a path shows its findings or its points, never both"]);
  });

  it("holds a finding as the answer serves the point: its node, its words and its trust word, nothing else", () => {
    expect(RunPathFindingSchema.safeParse({ ...FINDING, node_ref: "n".repeat(160) }).success).toBe(true);
    expect(RunPathFindingSchema.safeParse({ ...FINDING, node_ref: "n".repeat(161) }).success).toBe(false);
    expect(RunPathFindingSchema.safeParse({ ...FINDING, node_ref: "" }).success).toBe(false);
    expect(RunPathFindingSchema.safeParse({ ...FINDING, text: "" }).success).toBe(false);
    expect(RunPathFindingSchema.safeParse({ ...FINDING, trust: "MAYBE" }).success).toBe(false);
    expect(RunPathFindingSchema.safeParse({ ...FINDING, score: 3 }).success).toBe(false);
    expect(RunPathProgressSchema.safeParse({ ...PROGRESS[0], path_id: "b9" }).success).toBe(false);
    expect(RunPathProgressSchema.safeParse({ ...PROGRESS[0], step: "WRITING" }).success).toBe(false);
    expect(RunPathProgressSchema.safeParse({ ...PROGRESS[0], points: ["UNCHECKED"] }).success).toBe(false);
    expect(RunPathProgressSchema.safeParse({ ...PROGRESS[0], extra: true }).success).toBe(false);
  });
});

describe("the run read's progress and paths", () => {
  it("shows no progress beside paths while the paths are still being chosen, and none without paths is accepted", () => {
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: BRANCHES, path_progress: [] }))
      .toContain("a path debate still choosing its paths has none to show");
    expect(messagesOf(RunProjectionSchema, { ...RUN, path_progress: [] })).toEqual(["accepted"]);
  });

  it("names the same paths in the same order", () => {
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: BRANCHES, path_progress: PROGRESS.slice(0, 2) }))
      .toEqual(["the paths and their progress name the same paths"]);
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: BRANCHES, path_progress: [PROGRESS[1], PROGRESS[0], PROGRESS[2]] }))
      .toEqual(["the paths and their progress name the same paths"]);
  });

  it("holds at most 8 paths' progress", () => {
    const nine = Array.from({ length: 9 }, () => PROGRESS[0]);
    expect(RunProjectionSchema.safeParse({ ...RUN, path_progress: nine }).success).toBe(false);
  });

  it("comes last, after the paths", () => {
    expect(Object.keys(RunProjectionSchema.shape).slice(-3)).toEqual(["branches", "path_progress", "carry_on_part"]);
  });
});

describe("the carry-on part", () => {
  it("rides only a path debate whose box is ticked", () => {
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: TICKED, carry_on_part: "ANSWER" }))
      .toEqual(["only a path debate carries the carry-on part"]);
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: BRANCHES, path_progress: PROGRESS, carry_on_part: "ANSWER" }))
      .toEqual(["the carry-on part needs the box ticked"]);
    expect(messagesOf(RunProjectionSchema, { ...RUN, branches: TICKED, path_progress: PROGRESS, carry_on_part: "ANSWER" })).toEqual(["accepted"]);
    expect(RunProjectionSchema.safeParse({ ...RUN, branches: TICKED, path_progress: PROGRESS, carry_on_part: "STORY" }).success).toBe(false);
  });

  it("rides the answer only when its paths say the box is ticked", () => {
    const answer = buildFairShapedAnswer();
    expect(messagesOf(AnswerSchema, { ...answer, branches: branchesFixture(3), carry_on_part: "DIGS" }))
      .toEqual(["the carry-on part needs the box ticked"]);
    expect(messagesOf(AnswerSchema, { ...answer, carry_on_part: "DIGS" })).toEqual(["the carry-on part needs the box ticked"]);
    expect(messagesOf(AnswerSchema, { ...answer, branches: branchesFixture(3, { carry_on_to_report: true }), carry_on_part: "DIGS" }))
      .toEqual(["accepted"]);
    expect(Object.keys(AnswerSchema.shape).slice(-2)).toEqual(["branches", "carry_on_part"]);
  });
});

/**
 * V4 start step, Task 57b (owner, 4 Nov, card "Carry-on", "Show it from the start"; wait-f16, wait-d1): a debate whose box is ticked
 * shows the carry-on line from the first second. While the AIs are still choosing its paths ("Just answer it", or a list that could not
 * be made) the run read has no paths of its own to show the box, so the server sends the part only for an ask whose box is ticked, and
 * before the paths are named that part is the answer.
 */
describe("the carry-on part while the paths are being chosen (Task 57b)", () => {
  it("rides a ticked debate still choosing its paths: the answer, beside no progress and no paths", () => {
    expect(messagesOf(RunProjectionSchema, { ...RUN, path_progress: [], carry_on_part: "ANSWER" })).toEqual(["accepted"]);
    expect(messagesOf(RunProjectionSchema, { ...RUN, state: "WAITING", waits_until: "2026-11-04T10:00:00.000Z", waits_for: null,
      path_progress: [], carry_on_part: "ANSWER" })).toEqual(["accepted"]);
  });

  it("before its paths are named, only the answer", () => {
    for (const part of ["DIGS", "REPORT"]) {
      expect(messagesOf(RunProjectionSchema, { ...RUN, path_progress: [], carry_on_part: part }))
        .toEqual(["before its paths are named, a carry-on debate is on its answer"]);
    }
    expect(messagesOf(RunProjectionSchema, { ...RUN, path_progress: PROGRESS, carry_on_part: "ANSWER" }))
      .toEqual(["before its paths are named, a carry-on debate is on its answer"]);
  });

  it("a part without progress is one refusal", () => {
    expect(messagesOf(RunProjectionSchema, { ...RUN, carry_on_part: "ANSWER" })).toEqual(["only a path debate carries the carry-on part"]);
  });
});

describe("R22's run reads and answers", () => {
  it("an R22 answer with its purpose lines parses unchanged and carries no carry-on part", () => {
    const answer = { ...buildFairShapedAnswer(), purpose_lines: { answers: [{ question: "Where?", answer: "Romania." }] } };
    const parsed = AnswerSchema.parse(answer);
    expect(parsed).toEqual(answer);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(answer));
    expect(Object.hasOwn(parsed, "carry_on_part")).toBe(false);
  });

  it("an R22 run read parses unchanged with none of the new keys", () => {
    for (const run of [RUN, { ...RUN, state: "WAITING", waits_until: "2026-11-04T10:00:00.000Z", waits_for: null }]) {
      const parsed = RunProjectionSchema.parse(run);
      expect(JSON.stringify(parsed)).toBe(JSON.stringify(run));
      expect(["path_progress", "carry_on_part"].filter((key) => Object.hasOwn(parsed, key))).toEqual([]);
    }
  });
});
