// V4 start step, Task 57e (the owner's 6 Nov rule: "re-use what we already paid for"): the stand-in API serves the FAILED run read's
// `reusable: true` as the API does, so the page's "What already ran is kept for your next try, so asking again will not charge it twice."
// (the review session's words) has a case on the click-test: the seeded failed question that used some of the quota kept its paths; the
// first seeded failed question (its models gone at claim, never begun) kept nothing. In the contract, so the normal view keeps it; an
// older contract's fallback drops it with the other new parts. Every question here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RunProjectionSchema } from "@debateai/contract";
import { RUN_FAILED_SOME } from "../../tools/v4-mock-api/failed-seed.js";
import { contractOrDraft, stripRun } from "../../tools/v4-mock-api/web-draft.js";

const SERVER = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");

describe("the stand-in's FAILED read says whether what ran is kept (Task 57e)", () => {
  it("the seeded failed question that used some kept its paths for Ask again; the first one kept nothing", () => {
    expect(RUN_FAILED_SOME.reusable).toBe(true);
    expect(SERVER).toContain("quotaUsed: RUN_FAILED_SOME.quotaUsed, reusable: RUN_FAILED_SOME.reusable");
    // Sent only on a FAILED run, exactly as the API sends it.
    expect(SERVER).toContain('...(state === "FAILED" && run.reusable === true ? { reusable: true } : {})');
  });

  it("is the contract's own, so the normal view keeps it; the fallback for an older contract drops it", () => {
    const run = { run_ref: RUN_FAILED_SOME.runRef, question_line: RUN_FAILED_SOME.question, state: "FAILED", terminal_reason: RUN_FAILED_SOME.reason,
      hold_until: null, quota_used: RUN_FAILED_SOME.quotaUsed, reusable: true };
    expect(contractOrDraft(RunProjectionSchema, run, stripRun).body).toEqual(run);
    expect(stripRun(run)).not.toHaveProperty("reusable");
    expect(RunProjectionSchema.safeParse({ ...run, state: "RUNNING", terminal_reason: null, quota_used: undefined }).success).toBe(false);
  });
});
