import { describe, expect, it } from "vitest";
import { WEB_LOOK_BACK_MONTHS, lookBackWindow, perplexityAfterDateFilter } from "../../packages/evidence/src/window.js";

// W1-2 (plan 2026-10-30, design §3.1): how far back a search looks is set by the planner's pace word (fast topics 12
// months, normal ones 3 years, slow ones no limit); the date filter value is worked out by code from the run's date.

describe("the look-back window", () => {
  const asOf = new Date("2026-10-30T15:00:00Z");

  it("pins the owner's three windows", () => {
    expect(WEB_LOOK_BACK_MONTHS).toEqual({ FAST: 12, NORMAL: 36, SLOW: null });
    expect(Object.isFrozen(WEB_LOOK_BACK_MONTHS)).toBe(true);
  });

  it.each([
    ["FAST", 12, "2025-10-30"],
    ["NORMAL", 36, "2023-10-30"],
    ["SLOW", null, null]
  ] as const)("%s looks back %s months, from %s", (pace, months, afterDate) => {
    expect(lookBackWindow(pace, asOf)).toEqual({ pace, months, afterDate });
  });

  it("works in UTC and keeps the day inside the month", () => {
    expect(lookBackWindow("FAST", new Date("2028-02-29T00:30:00Z")).afterDate).toBe("2027-02-28");
    expect(lookBackWindow("NORMAL", new Date("2026-03-31T23:59:59Z")).afterDate).toBe("2023-03-31");
    expect(lookBackWindow("FAST", new Date("2026-01-01T00:00:00Z")).afterDate).toBe("2025-01-01");
  });

  it("writes the date the way Perplexity's date filter reads it", () => {
    expect(perplexityAfterDateFilter("2025-10-30")).toBe("10/30/2025");
    expect(perplexityAfterDateFilter("2027-02-08")).toBe("02/08/2027");
    expect(() => perplexityAfterDateFilter("30/10/2025")).toThrowError(expect.objectContaining({ code: "WEB_WINDOW_DATE_INVALID" }));
  });

  it("refuses an unknown pace word or a broken run date", () => {
    expect(() => lookBackWindow("QUICK" as never, asOf)).toThrowError(expect.objectContaining({ code: "WEB_PACE_INVALID" }));
    expect(() => lookBackWindow("FAST", new Date("not a date"))).toThrowError(expect.objectContaining({ code: "WEB_WINDOW_DATE_INVALID" }));
  });
});
