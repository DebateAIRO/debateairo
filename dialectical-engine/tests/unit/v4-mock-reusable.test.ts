// V4 start step, Task 57g (the owner's 7 Nov answers: "continue where it broke, and not charge the customer again"; Task 57e's `reusable`,
// renamed `continuable` by Task 57f): the stand-in serves the FAILED run read's `continuable: true` as the API does, on the seeded failed
// question that used some of the quota (a stop of ours, so the API would continue it), and its Continue runs that question again, then it
// finishes; a second press while it runs is CONTINUING too; any other failed run is refused (409 RUN_NOT_CONTINUABLE); everything else is the
// month pause's Continue, unchanged. `failed=RESET` puts the question back as seeded, so the click-test can press it again. server.ts listens
// when it is imported, so its wiring is read as source. Every question here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_STOPS_NOT_OURS } from "@debateai/battery";
import { RunNotContinuedSchema, RunProjectionSchema } from "@debateai/contract";
import { FAILED_DIGS, mockContinueStep, RUN_FAILED_SOME } from "../../tools/v4-mock-api/failed-seed.js";
import { stopIsOurs } from "../../apps/api/src/run-continue.js";
import { contractOrDraft, stripRun } from "../../tools/v4-mock-api/web-draft.js";

const SERVER = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
const README = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/README.md"), "utf8");

describe("the stand-in's FAILED read says whether Continue would continue it (Task 57g)", () => {
  it("the seeded failed question that used some can continue: a stop of ours, read as continuable", () => {
    expect(RUN_FAILED_SOME.continuable).toBe(true);
    expect(RUN_FAILED_SOME.quotaUsed).toBe("SOME");
    // The API continues only a stop of ours (never a spending wall or a step's tries used up).
    expect(RUN_STOPS_NOT_OURS.has(RUN_FAILED_SOME.reason.replace(/^RUNNER_EXECUTION_FAILED:/u, ""))).toBe(false);
    expect(SERVER).toContain("quotaUsed: RUN_FAILED_SOME.quotaUsed, continuable: RUN_FAILED_SOME.continuable");
    // Sent only on a FAILED run, exactly as the API sends it.
    expect(SERVER).toContain('...(state === "FAILED" && run.continuable === true ? { continuable: true } : {})');
    // The old name is gone from the code (comments may still name it).
    expect(SERVER).not.toContain("run.reusable");
    expect(SERVER).not.toContain("reusable?: true");
  });

  it("is the contract's own, so the normal view keeps it; the fallback for an older contract drops it", () => {
    const run = { run_ref: RUN_FAILED_SOME.runRef, question_line: RUN_FAILED_SOME.question, state: "FAILED", terminal_reason: RUN_FAILED_SOME.reason,
      hold_until: null, quota_used: RUN_FAILED_SOME.quotaUsed, continuable: true };
    expect(contractOrDraft(RunProjectionSchema, run, stripRun).body).toEqual(run);
    expect(stripRun(run)).not.toHaveProperty("continuable");
    expect(RunProjectionSchema.safeParse({ ...run, state: "RUNNING", terminal_reason: null, quota_used: undefined }).success).toBe(false);
  });
});

describe("the stand-in's Continue on a failed question (Task 57g)", () => {
  it("continues the failed question that can, answers a second press while it runs, refuses any other failed run, and leaves the rest to the month's", () => {
    expect(mockContinueStep({ failed: true, running: false, continuable: true, continued: false })).toBe("CONTINUE");
    expect(mockContinueStep({ failed: true, running: false, continuable: false, continued: false })).toBe("NOT_CONTINUABLE");
    expect(mockContinueStep({ failed: false, running: true, continuable: false, continued: true })).toBe("AGAIN");
    // Once it finished, as on the API: neither failed nor paused, so the month's Continue answers (409 RUN_NOT_PAUSED).
    expect(mockContinueStep({ failed: false, running: false, continuable: false, continued: true })).toBe("MONTH");
    expect(mockContinueStep({ failed: false, running: true, continuable: false, continued: false })).toBe("MONTH");
  });

  it("the route answers as the API does, and the month pause's Continue is left as it was", () => {
    expect(SERVER).toContain("continueStoppedRun(run)");
    expect(SERVER).toContain('{ error: "RUN_NOT_CONTINUABLE", message: "RUN_NOT_CONTINUABLE" }, C.RunNotContinuedSchema');
    expect(RunNotContinuedSchema.safeParse({ error: "RUN_NOT_CONTINUABLE", message: "RUN_NOT_CONTINUABLE" }).success).toBe(true);
    expect(SERVER).toContain('if (run.monthPaused !== true || stateOf(run) !== "RUNNING") return sendJson(req, res, 409, { error: "RUN_NOT_PAUSED", message: "RUN_NOT_PAUSED" });');
  });

  it("failed=RESET puts the question back as seeded, and the README says so", () => {
    expect(SERVER).toContain('url.searchParams.get("failed")');
    expect(SERVER).toContain("seedFailedSome()");
    expect(README).toContain("`failed=`");
  });
});

/*
 * Independent review of Tasks 57f/57g (wave 16): the stand-in must answer as the API does. The API's one rule (apps/api/src/run-continue.ts
 * failedRunContinuable) continues every failed debate whose stop was ours, and the first failed question's stop (its models gone when it
 * was claimed, RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM) is ours: the API's read says `continuable` and its Continue continues it. So the
 * stand-in's must too (it is also the click-test's only "continuable, nothing used" page: the button and only "Nothing was taken for the
 * failed try."), and the walk's refused press is a debate the API refuses too (the dig an update set aside).
 */
describe("the stand-in reads each seeded failed question as the API's rule does (review)", () => {
  const CHECK = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/check.ts"), "utf8");

  it("the first failed question (its models gone at claim: a stop of ours) reads continuable, with nothing used", () => {
    const reason = /const FAILED_REASON = "([A-Z_:]+)";/u.exec(SERVER)?.[1];
    expect(reason).toBe("RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM");
    expect(stopIsOurs(reason!)).toBe(true);
    expect(SERVER).toMatch(/runRef: RUN_FAILED, seq: 1, failedReason: FAILED_REASON,[^;]*quotaUsed: "NONE",[^;]*continuable: true/su);
  });

  it("failed=RESET puts both failed questions back as seeded; the walk's refused press is a run the API refuses too", () => {
    expect(SERVER).toMatch(/=== "RESET"\) \{\s*seedFailed\(\);\s*seedFailedSome\(\);/u);
    const setAside = FAILED_DIGS.find((dig) => dig.kind === "SET_ASIDE")!;
    expect(stopIsOurs(setAside.reason)).toBe(false);
    expect(CHECK).toContain('FAILED_DIGS.find((dig) => dig.kind === "SET_ASIDE")');
    expect(CHECK).not.toContain("the first failed question cannot continue");
    expect(README).not.toContain("4444 cannot continue");
  });
});
