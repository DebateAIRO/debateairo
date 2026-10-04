/**
 * Paid plans S2 — the owners' plan-cap rule (spec §2.6 item 6; owner decision
 * §1.10: Free → ECONOMY, every paid plan → BEST), checked in code. With billing on
 * a scorecard that breaks it is REFUSED, never silently overridden, so the public
 * scorecard always says what the site does. Local mode and billing off keep today.
 */
import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, type ModelStrength } from "@debateai/kernel";
import { SCORECARD_PLAN_CAPS_INVALID, planCapsFollowPaidSiteRule, type PickerSettings } from "@debateai/scorecard";
import { askModelPickerSettings } from "@debateai/api";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { testCandidate, testEntry, testScorecard } from "../support/scorecardFixtures.js";

type Caps = Readonly<{ free?: ModelStrength; premium?: ModelStrength }>;

// Paid plans S4b: Free caps that follow the owners' Free rule (EXAMPLE values: every role's Free
// money cap equal to the fixture's Economy cap of 50), so only the plan caps decide here.
const FREE_CAPS_FOLLOWING_THE_RULE = Object.fromEntries(DEBATE_ROLES.map((role) => [role, { moneyMicrosPerCall: 50 }])) as
  NonNullable<PickerSettings["freeCap"]>;

// Paid plans P4-E: the one candidate is a Free-plan model, declared and scored for both answer jobs,
// so with billing on a Free ask can seat them and only the plan caps decide here.
const FREE_MODEL = PLAN_TIER_ROSTERS.free[0]!;
const scorecardWith = (planStrengthCaps: Caps) => testScorecard(
  [testCandidate("only", "OpenAI", { modelId: FREE_MODEL })],
  { JUDGE: [testEntry("only", 90, 1)], ANSWER_WRITER: [testEntry("only", 90, 1)], ANSWER_CHECKER: [testEntry("only", 90, 1)] },
  { planStrengthCaps, freeCap: FREE_CAPS_FOLLOWING_THE_RULE }
);

const settingsFor = (caps: Caps, deploymentMode: "hosted" | "local", billingEnabled: boolean) => () => askModelPickerSettings({
  scorecard: Object.freeze({ state: "VALID" as const, scorecard: scorecardWith(caps), sourceRef: "test:s2-caps" }),
  deploymentMode,
  targets: [{ providerRef: "provider:only", maker: "OpenAI", baseUrl: "https://api.only-vendor-fixture.com/v1", model: FREE_MODEL }],
  perRunCeilingMicros: deploymentMode === "hosted" ? 250_000 : null,
  callTokenCeilings: { judge: 2048, synthesizer: 2048, evaluator: 2048 },
  billingEnabled
});

const BREAKING: readonly (readonly [Caps])[] = [[{ free: "BALANCED" }], [{}], [{ premium: "BEST" }], [{ free: "ECONOMY", premium: "BALANCED" }]];

describe("planCapsFollowPaidSiteRule", () => {
  it.each(BREAKING)("%o breaks the rule", (caps) => {
    expect(planCapsFollowPaidSiteRule(caps)).toBe(false);
  });

  it.each([[{ free: "ECONOMY" }], [{ free: "ECONOMY", premium: "BEST" }]] as const)("%o follows it", (caps) => {
    expect(planCapsFollowPaidSiteRule(caps)).toBe(true);
  });
});

describe("the hosted API's boot refuses a scorecard that breaks the rule, with billing on only", () => {
  it.each(BREAKING)("refuses %o hosted with billing on", (caps) => {
    expect(settingsFor(caps, "hosted", true)).toThrow(SCORECARD_PLAN_CAPS_INVALID);
  });

  it("accepts { free: ECONOMY } hosted with billing on, and a Free ask then gets ECONOMY (S2's integration row)", () => {
    expect(settingsFor({ free: "ECONOMY" }, "hosted", true)().mode).toBe("HOSTED");
  });

  it.each(BREAKING)("keeps accepting %o with billing off, and in local mode", (caps) => {
    expect(settingsFor(caps, "hosted", false)().mode).toBe("HOSTED");
    expect(settingsFor(caps, "local", true)().mode).toBe("LOCAL");
  });
});
