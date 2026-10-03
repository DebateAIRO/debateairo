/**
 * Paid plans S2 — the owners' plan-cap rule (spec §2.6 item 6; owner decision
 * §1.10: Free → ECONOMY, every paid plan → BEST), checked in code. With billing on
 * a scorecard that breaks it is REFUSED, never silently overridden, so the public
 * scorecard always says what the site does. Local mode and billing off keep today.
 */
import { describe, expect, it } from "vitest";
import type { ModelStrength } from "@debateai/kernel";
import { SCORECARD_PLAN_CAPS_INVALID, planCapsFollowPaidSiteRule } from "@debateai/scorecard";
import { askModelPickerSettings } from "@debateai/api";
import { testCandidate, testEntry, testScorecard } from "../support/scorecardFixtures.js";

type Caps = Readonly<{ free?: ModelStrength; premium?: ModelStrength }>;

const scorecardWith = (planStrengthCaps: Caps) =>
  testScorecard([testCandidate("only", "OpenAI")], { JUDGE: [testEntry("only", 90, 1)] }, { planStrengthCaps });

const settingsFor = (caps: Caps, deploymentMode: "hosted" | "local", billingEnabled: boolean) => () => askModelPickerSettings({
  scorecard: Object.freeze({ state: "VALID" as const, scorecard: scorecardWith(caps), sourceRef: "test:s2-caps" }),
  deploymentMode,
  targets: [],
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
