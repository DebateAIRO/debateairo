import { describe, expect, it } from "vitest";

import { CARRY_ON_BUILT } from "../../apps/ui/lib/v4/carryOn.js";

/*
 * V4 start step, Task 56 ("Let the AIs carry on to the report"): the pages show the carry-on line and box only when
 * CARRY_ON_BUILT is true (Tasks 61 and 76). Step 1 kept it false until the behaviour was built; Steps 2-5 build it (the API's
 * carry-on tick, the runner's DUE mark) and flip it, together.
 */

describe("CARRY_ON_BUILT", () => {
  it("is true now that the carry-on behaviour is built", () => {
    expect(CARRY_ON_BUILT).toBe(true);
  });
});
