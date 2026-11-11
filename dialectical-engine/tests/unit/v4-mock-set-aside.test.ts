// V4 start step, Task 57j (the owner's answer of 7 Nov afternoon, "Continue, they pay the rest"): the stand-in carries a question an update set
// aside that can continue, read as the API's rule reads it (a set-aside continues only where Continue moves it to the current release), with
// nothing used; the failed dig an update set aside stays the one the API would not move. Every text here is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { failedRunContinuable, stopIsSetAside, type RunContinueFacts } from "../../apps/api/src/run-continue.js";
import { FAILED_DIGS, RUN_FAILED_SET_ASIDE, RUN_FAILED_SOME, mockContinueStep } from "../../tools/v4-mock-api/failed-seed.js";

const SERVER = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/server.ts"), "utf8");
const CHECK = readFileSync(resolve(import.meta.dirname, "../../tools/v4-mock-api/check.ts"), "utf8");
const facts = (reason: string): RunContinueFacts => ({ state: "FAILED", terminal_reason: reason, content_live: true, waived: true, settled: false,
  paused: false, reopened: false, failed_continues: 0 });

describe("the stand-in's question an update set aside (Task 57j)", () => {
  it("is a set-aside the API continues where it moves, with nothing used; its own run, seq and words", () => {
    expect(stopIsSetAside(RUN_FAILED_SET_ASIDE.reason)).toBe(true);
    expect(failedRunContinuable(facts(RUN_FAILED_SET_ASIDE.reason), true)).toBe(true);
    expect(RUN_FAILED_SET_ASIDE.continuable).toBe(true);
    expect(RUN_FAILED_SET_ASIDE.quotaUsed).toBe("NONE");
    expect(new Set([RUN_FAILED_SET_ASIDE.runRef, RUN_FAILED_SOME.runRef, ...FAILED_DIGS.map((dig) => dig.runRef)]).size).toBe(FAILED_DIGS.length + 2);
    expect([RUN_FAILED_SOME.seq, ...FAILED_DIGS.map((dig) => dig.seq)]).not.toContain(RUN_FAILED_SET_ASIDE.seq);
    expect(mockContinueStep({ failed: true, running: false, continuable: RUN_FAILED_SET_ASIDE.continuable, continued: false })).toBe("CONTINUE");
  });

  it("is seeded, put back by failed=RESET, and walked by the check; the set-aside dig stays the refused one", () => {
    expect(SERVER).toContain("seedFailedSetAside();");
    expect(SERVER).toMatch(/=== "RESET"\) \{\s*seedFailed\(\);\s*seedFailedSome\(\);\s*seedFailedDigs\(\);\s*\/\/[^\n]*\n\s*seedFailedSetAside\(\);/u);
    expect(SERVER).toContain("continuable: RUN_FAILED_SET_ASIDE.continuable");
    expect(CHECK).toContain('failedSetAside: "46000000-0000-4000-8000-000000000046"');
    const dig = FAILED_DIGS.find((seed) => seed.kind === "SET_ASIDE")!;
    expect(dig.continuable).toBeUndefined();
    expect(failedRunContinuable(facts(dig.reason))).toBe(false);
  });
});
