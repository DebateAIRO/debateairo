import { describe, expect, it } from "vitest";

import { CARRY_ON_BUILT } from "../../apps/ui/lib/v4/carryOn.js";

/*
 * V4 start step, Task 56 Step 1 ("Let the AIs carry on to the report"): the pages show the carry-on line and box only
 * when CARRY_ON_BUILT is true (Tasks 61 and 76), so nothing on a page claims the behaviour before it is built. Task 56's
 * Step 2 flips this expectation to true, together with the behaviour itself.
 */

describe("CARRY_ON_BUILT", () => {
  it("stays false until the carry-on behaviour is built", () => {
    expect(CARRY_ON_BUILT).toBe(false);
  });
});
