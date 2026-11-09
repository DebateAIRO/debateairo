import { describe, expect, it } from "vitest";
import { ASK_CLARIFY_MODEL_SETTINGS } from "../../apps/api/src/ask-clarify.js";
import {
  ASK_CLARIFY_PAGE_WAIT_MS,
  ASK_CLARIFY_STILL_MS,
  ASK_CLARIFY_USUAL_TOP_MS,
  CLARIFY_ARRIVE_GAP_MS,
  CLARIFY_HELD_ROWS,
  CLARIFY_REVEAL_GAP_MS,
  clarifyArrivalDelays,
  clarifyWaitLineAt
} from "../../apps/ui/lib/v4/clarifyWait.js";

/*
 * V4 start step, Task 76h (ask-d3, read-f23; the owner's cards "As picked, on measured time" and "Add these as extra moves",
 * 4 Nov night): the clarifying call's wait, in plain numbers. "Analyzing your question…" first, "Still analyzing. Your words
 * are still here." from about 6 s, and "This is taking longer than usual. You can wait, or try again." only past the MEASURED
 * usual time (none yet: Task 91c's sitting measures it), never before the 6-second line. Two held rows; the questions that take
 * them are revealed top first 0.15 s apart, each later one slides in 0.12 s after the one before.
 */
describe("the clarifying call's wait lines (ask-d3)", () => {
  it("analyzing first, then from 6 s the still line, which stays while no usual time is measured", () => {
    expect(ASK_CLARIFY_STILL_MS).toBe(6_000);
    expect(clarifyWaitLineAt(0, null)).toBe("ANALYZING");
    expect(clarifyWaitLineAt(5_999, null)).toBe("ANALYZING");
    expect(clarifyWaitLineAt(6_000, null)).toBe("STILL");
    expect(clarifyWaitLineAt(600_000, null)).toBe("STILL");
  });

  it("the longer line only past the measured usual time, and never before the still line", () => {
    expect(clarifyWaitLineAt(7_000, 7_000)).toBe("STILL");
    expect(clarifyWaitLineAt(7_001, 7_000)).toBe("LONGER");
    expect(clarifyWaitLineAt(5_500, 5_000)).toBe("ANALYZING");
    expect(clarifyWaitLineAt(6_000, 5_000)).toBe("STILL");
    expect(clarifyWaitLineAt(6_500, 5_000)).toBe("LONGER");
  });

  it("no usual time is measured yet (Task 91c's sitting), so the longer line never shows today", () => {
    expect(ASK_CLARIFY_USUAL_TOP_MS).toBeNull();
  });

  it("the page's wait is the API's own bound plus 2 seconds, so the server always answers first", () => {
    expect(ASK_CLARIFY_PAGE_WAIT_MS).toBe(ASK_CLARIFY_MODEL_SETTINGS.timeoutMs + 2_000);
    expect(ASK_CLARIFY_PAGE_WAIT_MS).toBe(10_000);
  });
});

describe("the questions' arrival (read-f23, ask-d3)", () => {
  it("two held rows; the first questions take them top first 0.15 s apart, each later one slides in 0.12 s after the one before", () => {
    expect(CLARIFY_HELD_ROWS).toBe(2);
    expect(CLARIFY_REVEAL_GAP_MS).toBe(150);
    expect(CLARIFY_ARRIVE_GAP_MS).toBe(120);
    expect(clarifyArrivalDelays(4)).toEqual([
      { delayMs: 0, held: true }, { delayMs: 150, held: true }, { delayMs: 270, held: false }, { delayMs: 390, held: false }
    ]);
  });

  it("fewer questions than held rows take only the first rows; none takes none", () => {
    expect(clarifyArrivalDelays(1)).toEqual([{ delayMs: 0, held: true }]);
    expect(clarifyArrivalDelays(0)).toEqual([]);
  });
});
