import { describe, expect, it } from "vitest";

import { START_STEP_TIMING } from "../../packages/map/src/start-step.js";
import { SHARE_DELTA_SHOW_MS } from "../../apps/ui/lib/v4/money.js";
import { START_PAGE_WAITS } from "../../apps/ui/lib/v4/useStartPaths.js";

/*
 * V4 start step, Task 70 (choose-f10, the owner's 2-second request, owner answer Q8): the start card's page cannot import
 * packages/map, so its waits are constants pinned here. Each is the server's own limit plus 5 seconds, so the page never
 * gives up before the server answers: the give-up (the 215-second line) after the lists stream's whole life, and the merge,
 * late merge, combine and fit after their deadlines. The share change shows for SHARE_DELTA_SHOW_MS (2 s), and "Your paths
 * are ready ↓" for 4 s. The suggestions never go out of date by time (answer Q8), so there is no refresh wait of any kind.
 */
const MARGIN_MS = 5_000;

describe("the start card's waits (Task 70)", () => {
  it("each wait is the server's own limit plus 5 seconds", () => {
    expect(START_PAGE_WAITS.giveUpMs).toBe(START_STEP_TIMING.streamMaxLifeMs + MARGIN_MS);
    expect(START_PAGE_WAITS.mergeMs).toBe(START_STEP_TIMING.mergeDeadlineMs + MARGIN_MS);
    expect(START_PAGE_WAITS.lateMergeMs).toBe(START_STEP_TIMING.lateMergeDeadlineMs + MARGIN_MS);
    expect(START_PAGE_WAITS.combineMs).toBe(START_STEP_TIMING.combineDeadlineMs + MARGIN_MS);
    expect(START_PAGE_WAITS.fitMs).toBe(START_STEP_TIMING.fitDeadlineMs + MARGIN_MS);
    expect(START_PAGE_WAITS).toMatchObject({ giveUpMs: 215_000, mergeMs: 50_000, lateMergeMs: 35_000, combineMs: 20_000, fitMs: 15_000 });
  });

  it("the share change shows for 2 seconds, the one time Task 69 keeps, and the ready note for 4", () => {
    expect(START_PAGE_WAITS.deltaShowMs).toBe(SHARE_DELTA_SHOW_MS);
    expect(START_PAGE_WAITS.deltaShowMs).toBe(2_000);
    expect(START_PAGE_WAITS.readyNoteMs).toBe(4_000);
  });

  it("has no refresh wait (answer Q8: no lifetime) and nothing else", () => {
    expect(Object.keys(START_PAGE_WAITS).sort()).toEqual(
      ["combineMs", "deltaShowMs", "fitMs", "giveUpMs", "lateMergeMs", "mergeMs", "readyNoteMs"]);
    expect(Object.keys(START_PAGE_WAITS).some((key) => /refresh|expir|stale|lifetime/iu.test(key))).toBe(false);
    expect(Object.isFrozen(START_PAGE_WAITS)).toBe(true);
  });
});
