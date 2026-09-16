import { describe, expect, it } from "vitest";
import { PlanTierRostersSchema } from "@debateai/contract";
const FAKE = "FAKEKEY-rev-s03-p3-security-DO-NOT-USE";
describe("S8 — what a parse failure can carry into the merge's captureHandled sink", () => {
  it("compares the whole-row parse (pre-F1) with the projected parse (post-F1)", () => {
    const row = {
      kind: "PLAN_TIER_ROSTERS",
      free: ["gpt-5.6-luna"], premium: ["gpt-5.6-sol"],
      authorization_header: `Bearer ${FAKE}`,
      provider_targets: [{ key: FAKE }]
    };
    const whole = PlanTierRostersSchema.safeParse(row);
    const projected = PlanTierRostersSchema.safeParse({ free: row.free, premium: row.premium });
    // eslint-disable-next-line no-console
    console.log(`S8_WHOLE_ROW_SUCCESS=${whole.success}`);
    // eslint-disable-next-line no-console
    console.log(`S8_WHOLE_ROW_ERROR=${whole.success ? "n/a" : JSON.stringify(whole.error.issues)}`);
    // eslint-disable-next-line no-console
    console.log(`S8_PROJECTED_SUCCESS=${projected.success}`);
    // eslint-disable-next-line no-console
    console.log(`S8_WHOLE_ROW_ERROR_CARRIES_KEY_NAMES=${!whole.success && JSON.stringify(whole.error.issues).includes("authorization_header")}`);
    // eslint-disable-next-line no-console
    console.log(`S8_WHOLE_ROW_ERROR_CARRIES_KEY_VALUE=${!whole.success && JSON.stringify(whole.error.issues).includes(FAKE)}`);
    expect(projected.success).toBe(true);
  });
});
