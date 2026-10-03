/**
 * Paid plans Part 3b, Task S4b (final review P3-I2; the owner's ruling of 3 October 2026) —
 * FREE'S OWN STRICT COST CAP, AND FREE'S BACKUPS FROM THE FREE ROSTER.
 *
 * "Free gets almost the cheapest models … we just have a little more leverage to select better,
 * more expensive models for Economy, where in Free we are kind of strict." On a site that sells
 * plans (hosted, billing on):
 *   - a Free ask's ECONOMY pick, per role, is the best-quality eligible candidate under FREE'S own
 *     per-role money cap (`pickerSettings.freeCap`), at or below that role's Economy cap; paid
 *     Economy keeps the scorecard's meaning (the best under the Economy cap);
 *   - a Free ask seats, and falls back to, models of the Free roster only;
 *   - publish and boot refuse a scorecard whose Free cap for a role is missing or above that role's
 *     Economy cap (SCORECARD_FREE_CAPS_INVALID, content-free).
 * Billing off and local mode: nothing changes.
 *
 * The cap figures here are EXAMPLE values: the real caps are the owner's, set at `scorecard:approve`.
 */
import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, type DebateRole, type ModelStrength } from "@debateai/kernel";
import {
  SCORECARD_FREE_CAPS_INVALID,
  SCORECARD_PLAN_CAPS_INVALID,
  firstCallPlanModels,
  freeCapsFollowPaidSiteRule,
  pickRoleAssignment,
  type PickerInput,
  type PickerSettings,
  type RoleSeat,
  type Scorecard
} from "@debateai/scorecard";
import {
  askModelPickerSettings,
  evaluateAskAdmission,
  reachableInTodaysOrder,
  type AskModelPickerSettings,
  type AskTargetFacts,
  type RunCreationSettings
} from "@debateai/api";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import { computeStructuralCeilingBasis } from "@debateai/register";
import {
  assignedOutcome,
  economyCaps,
  roleNumbers,
  targetFor,
  testCandidate,
  testEntry,
  testPickerInput,
  testPrice,
  testScorecard
} from "../support/scorecardFixtures.js";

/** EXAMPLE caps (micros per call), not production numbers. */
const EXAMPLE_ECONOMY_CAP_MICROS = 300;
const EXAMPLE_FREE_CAP_MICROS = 150;

const freeCaps = (micros: number | null, overrides: Partial<Record<DebateRole, number | null>> = {}): NonNullable<PickerSettings["freeCap"]> =>
  Object.fromEntries(DEBATE_ROLES.map((role) => [
    role, { moneyMicrosPerCall: role in overrides ? overrides[role] ?? null : micros }
  ])) as NonNullable<PickerSettings["freeCap"]>;

const everyRole = (micros: number | null): PickerSettings["economyCap"] =>
  economyCaps(Object.fromEntries(DEBATE_ROLES.map((role) => [role, { moneyMicrosPerCall: micros, secondsPerCall: micros }])));

// One role (the answer writer), four candidates of four makers; one call of each costs exactly its price.
const cheap = testCandidate("cheap", "Google");
const mid = testCandidate("mid", "Anthropic");
const good = testCandidate("good", "OpenAI");
const top = testCandidate("top", "xAI");
const CAST = [cheap, mid, good, top];
const WRITER_ENTRIES = [testEntry("cheap", 70, 30), testEntry("mid", 85, 100), testEntry("good", 92, 250), testEntry("top", 96, 600)];
const PRICES = new Map([
  ["provider:cheap", testPrice(30)], ["provider:mid", testPrice(100)], ["provider:good", testPrice(250)], ["provider:top", testPrice(600)]
]);

function writerScorecard(settings: Partial<PickerSettings> = {}): Scorecard {
  return testScorecard(CAST, { ANSWER_WRITER: WRITER_ENTRIES }, {
    diversityShare: 0,
    planStrengthCaps: { free: "ECONOMY" },
    economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS),
    freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS),
    ...settings
  });
}

function writerPick(overrides: Partial<PickerInput>, scorecard: Scorecard = writerScorecard()) {
  return assignedOutcome(pickRoleAssignment(testPickerInput({
    scorecard,
    reachable: CAST.map((candidate) => targetFor(candidate)),
    seatDemand: roleNumbers({ ANSWER_WRITER: 1 }),
    mode: "HOSTED",
    prices: PRICES,
    ...overrides
  })));
}

const writerMain = (outcome: ReturnType<typeof writerPick>): string | null =>
  outcome.assignment.roles.ANSWER_WRITER[0]?.main.candidateId ?? null;

describe("S4b · a Free ask on a site that sells plans takes Free's own, stricter cap", () => {
  it("seats the best candidate under Free's cap: not the cheapest, and not Economy's pick under its looser cap", () => {
    const free = writerPick({ planTier: "free", plansSold: true, strength: "BEST" });
    expect(free.appliedStrength).toBe("ECONOMY");
    expect(writerMain(free)).toBe("mid");
    expect(writerMain(free)).not.toBe("cheap");
    expect(free.notes).toContain("FREE_CAPS");
    expect(free.notes).toContain("PLAN_CAP:free:BEST->ECONOMY");
  });

  it("keeps a paid Economy ask on the scorecard's own Economy pick (the best under the Economy cap)", () => {
    const paid = writerPick({ planTier: "premium", plansSold: true, strength: "ECONOMY" });
    expect(writerMain(paid)).toBe("good");
    expect(paid.notes).not.toContain("FREE_CAPS");
  });

  it("changes nothing with billing off: a Free ask keeps Economy's pick, as before", () => {
    const off = writerPick({ planTier: "free", plansSold: false, strength: "ECONOMY" });
    expect(writerMain(off)).toBe("good");
    expect(off.notes).not.toContain("FREE_CAPS");
    const unsaid = writerPick({ planTier: "free", strength: "ECONOMY" });
    expect(writerMain(unsaid)).toBe("good");
  });

  it("changes nothing in local mode, where the Economy rule reads seconds", () => {
    const local = writerPick({ mode: "LOCAL", planTier: "free", plansSold: true, strength: "ECONOMY", prices: new Map() });
    expect(writerMain(local)).toBe("good");
    expect(local.notes).not.toContain("FREE_CAPS");
  });

  it("seats the cheapest when nothing is under Free's cap, and says so", () => {
    const strict = writerPick({ planTier: "free", plansSold: true }, writerScorecard({ freeCap: freeCaps(10) }));
    expect(writerMain(strict)).toBe("cheap");
    expect(strict.notes).toContain("ECONOMY_CAP_UNMET:ANSWER_WRITER");
  });

  it("is never looser than Economy, even on an unchecked scorecard (Free above Economy, Free unset, Economy unset)", () => {
    // Free above Economy (Part 3b re-review M-1): a cap of 700 reaches `top` (600), as a paid Economy cap
    // of 700 shows, so only the clamp to Economy's 300 keeps the Free ask on `good` (250).
    const aboveEconomy = 700;
    expect(writerMain(writerPick({ planTier: "premium", plansSold: true, strength: "ECONOMY" }, writerScorecard({ economyCap: everyRole(aboveEconomy) })))).toBe("top");
    expect(writerMain(writerPick({ planTier: "free", plansSold: true }, writerScorecard({ freeCap: freeCaps(aboveEconomy) })))).toBe("good");
    expect(writerMain(writerPick({ planTier: "free", plansSold: true }, writerScorecard({ freeCap: freeCaps(null) })))).toBe("good");
    expect(writerMain(writerPick({ planTier: "free", plansSold: true }, writerScorecard({ freeCap: undefined })))).toBe("good");
    expect(writerMain(writerPick({ planTier: "free", plansSold: true }, writerScorecard({ economyCap: everyRole(null) })))).toBe("cheap");
  });
});

describe("S4b fix round 1 · a Free answer writer or checker takes no FALLBACK seat on a site that sells plans", () => {
  // The scorecard scores the four candidates in ONE answer role only: the other answer role has no
  // eligible candidate. A FALLBACK answer seat would hand that role to the register's own answer
  // models (pre-flight ruling F18), which no plan roster bounds — so a Free ask is refused instead.
  const scoredIn = (role: "ANSWER_WRITER" | "ANSWER_CHECKER"): Scorecard => testScorecard(CAST, { [role]: WRITER_ENTRIES }, {
    diversityShare: 0,
    planStrengthCaps: { free: "ECONOMY" },
    economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS),
    freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS)
  });
  const answerPick = (overrides: Partial<PickerInput>, scorecard: Scorecard) => pickRoleAssignment(testPickerInput({
    scorecard,
    reachable: CAST.map((candidate) => targetFor(candidate)),
    seatDemand: roleNumbers({ ANSWER_WRITER: 1, ANSWER_CHECKER: 1 }),
    mode: "HOSTED",
    prices: PRICES,
    ...overrides
  }));

  it.each([
    ["ANSWER_WRITER", "ANSWER_CHECKER"],
    ["ANSWER_CHECKER", "ANSWER_WRITER"]
  ] as const)("refuses a Free ask NO_REACHABLE_CANDIDATE when no scored reachable model can take its %s", (unscored, scored) => {
    const outcome = answerPick({ planTier: "free", plansSold: true }, scoredIn(scored));
    expect(outcome).toMatchObject({ state: "REFUSED", reason: "NO_REACHABLE_CANDIDATE" });
    if (outcome.state === "REFUSED") expect(outcome.detail).toContain(unscored);
  });

  it.each([
    ["billing off (plansSold false)", { planTier: "free" as const, plansSold: false }],
    ["billing off (plansSold absent)", { planTier: "free" as const }],
    ["a paid ask", { planTier: "premium" as const, plansSold: true, strength: "ECONOMY" as const }],
    ["local mode", { mode: "LOCAL" as const, planTier: "free" as const, plansSold: true, prices: new Map() }]
  ])("keeps the FALLBACK answer seat for %s, as before", (_name, overrides) => {
    for (const scored of ["ANSWER_WRITER", "ANSWER_CHECKER"] as const) {
      const outcome = assignedOutcome(answerPick(overrides, scoredIn(scored)));
      const unscored = scored === "ANSWER_WRITER" ? "ANSWER_CHECKER" : "ANSWER_WRITER";
      expect(outcome.assignment.roles[unscored].map((seat) => seat.source)).toEqual(["FALLBACK"]);
      expect(outcome.assignment.roles[scored].map((seat) => seat.source)).toEqual(["SCORECARD"]);
      expect(outcome.notes).toContain(`ROLE_FALLBACK:${unscored}:NO_ELIGIBLE_CANDIDATE`);
    }
  });

  it("keeps a Free ask's debate roles on their FALLBACK seats: only the answer roles are held to the scorecard", () => {
    const outcome = assignedOutcome(pickRoleAssignment(testPickerInput({
      scorecard: writerScorecard(),
      reachable: CAST.map((candidate) => targetFor(candidate)),
      seatDemand: roleNumbers({ JUDGE: 1, ANSWER_WRITER: 1 }),
      mode: "HOSTED",
      prices: PRICES,
      planTier: "free",
      plansSold: true
    })));
    expect(outcome.assignment.roles.JUDGE.map((seat) => seat.source)).toEqual(["FALLBACK"]);
    expect(outcome.assignment.roles.ANSWER_WRITER.map((seat) => seat.source)).toEqual(["SCORECARD"]);
  });
});

describe("S4b · freeCapsFollowPaidSiteRule: every role's Free cap is set and at or below its Economy cap", () => {
  const settingsWith = (freeCap: PickerSettings["freeCap"], economyCap = everyRole(EXAMPLE_ECONOMY_CAP_MICROS)) =>
    ({ freeCap, economyCap });

  it.each([
    ["no Free caps at all", settingsWith(undefined)],
    ["one role without a Free cap", settingsWith(freeCaps(EXAMPLE_FREE_CAP_MICROS, { JUDGE: null }))],
    ["one role's Free cap above its Economy cap", settingsWith(freeCaps(EXAMPLE_FREE_CAP_MICROS, { REVIEWER: EXAMPLE_ECONOMY_CAP_MICROS + 1 }))],
    ["a role whose Economy cap is unset (Economy seats the cheapest there)", settingsWith(
      freeCaps(EXAMPLE_FREE_CAP_MICROS),
      economyCaps({ ...everyRole(EXAMPLE_ECONOMY_CAP_MICROS), POSITION: { moneyMicrosPerCall: null, secondsPerCall: 20 } })
    )]
  ])("refuses %s", (_name, settings) => {
    expect(freeCapsFollowPaidSiteRule(settings)).toBe(false);
  });

  it.each([
    ["Free below Economy everywhere", settingsWith(freeCaps(EXAMPLE_FREE_CAP_MICROS))],
    ["Free equal to Economy", settingsWith(freeCaps(EXAMPLE_ECONOMY_CAP_MICROS))],
    ["a Free cap of zero", settingsWith(freeCaps(0))]
  ])("accepts %s", (_name, settings) => {
    expect(freeCapsFollowPaidSiteRule(settings)).toBe(true);
  });
});

describe("S4b · the hosted API's boot refuses a Free cap that is missing or above Economy's, with billing on only", () => {
  const scorecardWith = (settings: Partial<PickerSettings>): Scorecard => testScorecard(
    [testCandidate("only", "OpenAI")], { JUDGE: [testEntry("only", 90, 1)] },
    { planStrengthCaps: { free: "ECONOMY" }, economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS), ...settings }
  );
  const boot = (settings: Partial<PickerSettings>, deploymentMode: "hosted" | "local", billingEnabled: boolean) => () => askModelPickerSettings({
    scorecard: Object.freeze({ state: "VALID" as const, scorecard: scorecardWith(settings), sourceRef: "test:s4b" }),
    deploymentMode,
    targets: [],
    perRunCeilingMicros: deploymentMode === "hosted" ? 250_000 : null,
    callTokenCeilings: { judge: 2048, synthesizer: 2048, evaluator: 2048 },
    billingEnabled
  });

  it.each([
    ["missing", {}],
    ["missing for one role", { freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS, { ANSWER_CHECKER: null }) }],
    ["above Economy's for one role", { freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS, { POSITION: EXAMPLE_ECONOMY_CAP_MICROS + 1 }) }]
  ] as const)("refuses a Free cap %s, by a content-free code", (_name, settings) => {
    expect(boot(settings, "hosted", true)).toThrowError(new TypeError(SCORECARD_FREE_CAPS_INVALID));
  });

  it("asks the plan-cap rule first", () => {
    expect(boot({ planStrengthCaps: { free: "BALANCED" } }, "hosted", true)).toThrow(SCORECARD_PLAN_CAPS_INVALID);
  });

  it("accepts Free caps at or below Economy's, and tells the picker the site sells plans", () => {
    const settings = boot({ freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS) }, "hosted", true)();
    expect(settings.plansSold).toBe(true);
  });

  it("keeps accepting a scorecard without Free caps with billing off, and in local mode, selling no plans", () => {
    expect(boot({}, "hosted", false)().plansSold).toBe(false);
    expect(boot({}, "local", true)().plansSold).toBe(false);
  });
});

function member(providerRef: string, maker: string, modelId: string): DiscoveredPanelMember {
  return Object.freeze({
    provider_ref: providerRef, maker, model_id: modelId,
    probe_evidence_ref: `probe:${providerRef}`, probed_at: "2026-10-03T00:00:00.000Z"
  });
}

const [FREE_OPENAI, FREE_ANTHROPIC] = PLAN_TIER_ROSTERS.free;
const [PAID_OPENAI, PAID_ANTHROPIC] = PLAN_TIER_ROSTERS.premium;
/** Both Free-roster models, two premium-roster models and one model on no roster; premium first in discovery. */
const PANEL: readonly DiscoveredPanelMember[] = Object.freeze([
  member("provider:s4b:paid-openai", "OpenAI", PAID_OPENAI!),
  member("provider:s4b:paid-anthropic", "Anthropic", PAID_ANTHROPIC!),
  member("provider:s4b:google", "Google", "gemini-3.8-flash"),
  member("provider:s4b:free-openai", "OpenAI", FREE_OPENAI!),
  member("provider:s4b:free-anthropic", "Anthropic", FREE_ANTHROPIC!)
]);

describe("S4b · reachableInTodaysOrder can keep a plan to its own roster", () => {
  it("keeps only the roster's models, roster order first, and changes nothing without the option", () => {
    const facts = new Map<string, AskTargetFacts>();
    expect(reachableInTodaysOrder(PANEL, PLAN_TIER_ROSTERS.free, facts, true).map((target) => target.modelId))
      .toEqual([FREE_OPENAI, FREE_ANTHROPIC]);
    expect(reachableInTodaysOrder(PANEL, PLAN_TIER_ROSTERS.free, facts).map((target) => target.modelId))
      .toEqual([FREE_OPENAI, FREE_ANTHROPIC, PAID_OPENAI, PAID_ANTHROPIC, "gemini-3.8-flash"]);
  });
});

describe("S4b · a Free ask's seats and fallbacks come only from the Free roster (admission, real picker)", () => {
  const CEILING_TERMS = Object.freeze({
    judgeMaxAttempts: 3, organMaxAttempts: 3, maxRecompose: 1, maxCooldownHoldsPerRun: 1, finalRetryAttempts: 1,
    branchingFactor: 2, compositionSegmentCap: 4, fixedOrgansPerComposition: 6, reviewerCallsPerNode: 1,
    synthesizerMaxRounds: 3, evaluatorMaxRounds: 3, maxDepth: 5
  });
  const SITE_CEILING_MICROS = 50_000_000;

  function ask(planTier: AskRequest["plan_tier"], modelStrength?: ModelStrength): AskRequest {
    return {
      question_line: "Which models should a Free debate get?",
      risk_tier: "casual",
      tier_source: "ASKER",
      tier_provenance_ref: "asker:test",
      composition_budget_tier: "low",
      depth_params: { depth: 1 },
      decision_scope: "s4b admission test",
      as_of: "2026-10-03T00:00:00.000Z",
      steering_presets: [],
      plan_tier: planTier,
      steering_annotations: [],
      ...(modelStrength === undefined ? {} : { model_strength: modelStrength })
    };
  }

  function settingsWith(modelPicker: AskModelPickerSettings, panel: readonly DiscoveredPanelMember[] = PANEL): RunCreationSettings {
    return {
      strangerSampleRate: 0,
      registerVersion: 1,
      batteryVersion: "battery:s4b",
      settlementWatchHandle: "watch:s4b",
      resolveDiscoveredPanel: async () => panel,
      resolveEnvelopeBasis: async ({ depthParams, panelSize, backupSequencesProvisioned }) => computeStructuralCeilingBasis({
        ...CEILING_TERMS, panelSize, depth: Number(depthParams.depth), backupSequencesProvisioned
      }),
      resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef }),
      modelPicker
    };
  }

  // The scorecard scores only the premium-roster models and the model on no roster, in every role:
  // for a Free ask held to the Free roster no role has an eligible candidate, so every role falls back.
  const scored = PANEL.filter((entry) => !PLAN_TIER_ROSTERS.free.includes(entry.model_id));
  const candidates = scored.map((entry) => testCandidate(entry.model_id, entry.maker, { modelId: entry.model_id }));
  const SCORECARD = testScorecard(candidates, Object.fromEntries(DEBATE_ROLES.map((role) => [
    role, candidates.map((candidate, index) => testEntry(candidate.candidateId, 95 - index, 10))
  ])), {
    diversityShare: 0.2,
    planStrengthCaps: { free: "ECONOMY" },
    economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS),
    freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS)
  });

  // S4b fix round 1: the same scorecard, which also scores both Free-roster models in the two answer
  // roles (and in no debate role).
  const freeCandidates = PANEL.filter((entry) => PLAN_TIER_ROSTERS.free.includes(entry.model_id))
    .map((entry) => testCandidate(entry.model_id, entry.maker, { modelId: entry.model_id }));
  const SCORECARD_WITH_FREE_ANSWERS = testScorecard([...candidates, ...freeCandidates], Object.fromEntries(DEBATE_ROLES.map((role) => [
    role, [
      ...candidates.map((candidate, index) => testEntry(candidate.candidateId, 95 - index, 10)),
      ...(role === "ANSWER_WRITER" || role === "ANSWER_CHECKER"
        ? freeCandidates.map((candidate, index) => testEntry(candidate.candidateId, 80 - index, 10))
        : [])
    ]
  ])), {
    diversityShare: 0.2,
    planStrengthCaps: { free: "ECONOMY" },
    economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS),
    freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS)
  });

  // Part 3b re-review M-3: SCORECARD, which also scores the Free roster's first model as the best answer
  // writer of all (quality 99; in no other role). Only a Free ask is kept to its roster.
  const freeWriter = freeCandidates.filter((candidate) => candidate.modelId === FREE_OPENAI);
  const SCORECARD_WITH_FREE_BEST_WRITER = testScorecard([...candidates, ...freeWriter], Object.fromEntries(DEBATE_ROLES.map((role) => [
    role, [
      ...candidates.map((candidate, index) => testEntry(candidate.candidateId, 95 - index, 10)),
      ...(role === "ANSWER_WRITER" ? freeWriter.map((candidate) => testEntry(candidate.candidateId, 99, 10)) : [])
    ]
  ])), {
    diversityShare: 0.2,
    planStrengthCaps: { free: "ECONOMY" },
    economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS),
    freeCap: freeCaps(EXAMPLE_FREE_CAP_MICROS)
  });

  function hostedPicker(plansSold: boolean, scorecard: Scorecard = SCORECARD): AskModelPickerSettings {
    return Object.freeze({
      scorecard: Object.freeze({ state: "VALID" as const, scorecard, sourceRef: "test:s4b" }),
      mode: "HOSTED" as const,
      targetFacts: new Map<string, AskTargetFacts>(PANEL.map((entry) => [entry.provider_ref, Object.freeze({
        thinkingLevels: Object.freeze([]), contextWindowTokens: null,
        price: Object.freeze({ inputMicrosPerMTok: 1_000, outputMicrosPerMTok: 1_000 })
      })])),
      perRunCeilingMicros: SITE_CEILING_MICROS,
      moneyPolicy: Object.freeze({ perRunCeilingMicros: SITE_CEILING_MICROS }),
      runMaximumMicros: SITE_CEILING_MICROS,
      answerTokenCeilings: roleNumbers({}, 2048),
      plansSold
    });
  }

  const seatedModels = (roles: Readonly<Record<string, readonly RoleSeat[]>>): string[] => Object.values(roles)
    .flatMap((seats) => seats.flatMap((seat) => [seat.main.modelId, ...(seat.runnerUp === null ? [] : [seat.runnerUp.modelId])]));

  it("with billing on, a Free ask whose debate roles fall back seats Free-roster models only, and scored Free-roster answer models", async () => {
    const admitted = await evaluateAskAdmission(settingsWith(hostedPicker(true, SCORECARD_WITH_FREE_ANSWERS)), ask("free", "BEST"));
    const assignment = admitted.modelAssignment!.assignment;
    const models = seatedModels(assignment.roles);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((model) => PLAN_TIER_ROSTERS.free.includes(model))).toBe(true);
    expect(admitted.discoveredPanel.map((entry) => entry.model_id)).toEqual([FREE_OPENAI, FREE_ANTHROPIC]);
    for (const role of ["POSITION", "SUPPORT_ATTACK", "CROSS_EXCHANGE", "JUDGE", "REVIEWER"] as const) {
      expect(assignment.roles[role].every((seat) => seat.source === "FALLBACK")).toBe(true);
    }
    for (const role of ["ANSWER_WRITER", "ANSWER_CHECKER"] as const) {
      expect(assignment.roles[role].map((seat) => seat.source)).toEqual(["SCORECARD"]);
    }
  });

  it("with billing on, a Free ask whose answer roles no scored Free-roster model can take is refused, never handed to the register's answer models", async () => {
    await expect(evaluateAskAdmission(settingsWith(hostedPicker(true)), ask("free", "BEST")))
      .rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
  });

  it("with billing on, a paid ask still seats the scored models", async () => {
    const admitted = await evaluateAskAdmission(settingsWith(hostedPicker(true)), ask("premium", "ECONOMY"));
    expect(seatedModels(admitted.modelAssignment!.assignment.roles)).toContain(PAID_OPENAI);
  });

  // Part 3b re-review M-3: with a scorecard in force every paid plan seats from every configured model
  // (spec S2). Cut to the premium roster, the paid ask's writer would be a premium model, and its debaters
  // would lose the model on no roster.
  it("with billing on, a paid ask is not kept to its own roster: a Free-roster model the scorecard ranks best writes its answer, and the model on no roster debates", async () => {
    const admitted = await evaluateAskAdmission(settingsWith(hostedPicker(true, SCORECARD_WITH_FREE_BEST_WRITER)), ask("premium", "ECONOMY"));
    expect({
      writer: admitted.modelAssignment!.assignment.roles.ANSWER_WRITER.map((seat) => [seat.source, seat.main.modelId]),
      debaters: admitted.discoveredPanel.map((entry) => entry.model_id)
    }).toEqual({
      writer: [["SCORECARD", FREE_OPENAI]],
      debaters: [PAID_OPENAI, PAID_ANTHROPIC, "gemini-3.8-flash"]
    });
  });

  it("with billing off nothing changes: the same Free ask is seated from every reachable model, as before", async () => {
    const admitted = await evaluateAskAdmission(settingsWith(hostedPicker(false)), ask("free", "BEST"));
    expect(seatedModels(admitted.modelAssignment!.assignment.roles).some((model) => !PLAN_TIER_ROSTERS.free.includes(model))).toBe(true);
  });

  describe("the A5 seam (S4a judge's carry (a1)): a Free person whose room is too small for every strength", () => {
    // Every role scores Free-roster A (quality 85, 100 micros a call), Free-roster B (quality 92, 250
    // micros) and a premium-roster model that would beat both (quality 99, 50 micros). Free's cap is
    // 150, Economy's 300: Free's own pick is A where Economy's looser cap would take B, and the
    // premium model is out of a Free seat by the roster.
    const FREE_A = FREE_OPENAI!;
    const FREE_B = FREE_ANTHROPIC!;
    const MICROS_PER_CALL = new Map<string, number>([[FREE_A, 100], [FREE_B, 250], [PAID_OPENAI!, 50]]);
    const a5Candidates = PANEL.filter((entry) => MICROS_PER_CALL.has(entry.model_id))
      .map((entry) => testCandidate(entry.model_id, entry.maker, { modelId: entry.model_id }));
    const QUALITY = new Map<string, number>([[FREE_A, 85], [FREE_B, 92], [PAID_OPENAI!, 99]]);
    const a5Scorecard = (freeCapMicros: number): Scorecard => testScorecard(a5Candidates, Object.fromEntries(DEBATE_ROLES.map((role) => [
      role, a5Candidates.map((candidate) => testEntry(candidate.candidateId, QUALITY.get(candidate.modelId)!, 10))
    ])), {
      diversityShare: 0.2,
      planStrengthCaps: { free: "ECONOMY" },
      economyCap: everyRole(EXAMPLE_ECONOMY_CAP_MICROS),
      freeCap: freeCaps(freeCapMicros)
    });
    const a5Picker = (scorecard: Scorecard, log: (line: string) => void): AskModelPickerSettings => Object.freeze({
      ...hostedPicker(true, scorecard),
      // One testEntry call is 1000 input tokens: `micros * 1000` per million tokens costs `micros` a call.
      targetFacts: new Map<string, AskTargetFacts>(PANEL.map((entry) => [entry.provider_ref, Object.freeze({
        thinkingLevels: Object.freeze([]), contextWindowTokens: null,
        price: Object.freeze({ inputMicrosPerMTok: (MICROS_PER_CALL.get(entry.model_id) ?? 1) * 1000, outputMicrosPerMTok: 0 })
      })])),
      log
    });
    const AT = new Date("2026-10-03T12:00:00.000Z");
    // A person room of 10 micros: no strength fits it.
    const TINY_ROOM = Object.freeze({
      uses: Object.freeze([Object.freeze({
        scope: "PERSON_DAY" as const, limitMicros: 10, usedMicros: 0,
        resetsAt: new Date("2026-10-04T00:00:00.000Z"), closeBasisPoints: 9_500
      })]),
      at: AT
    });

    it("starts through A5 on Free's own pick under Free's cap, seated from the Free roster only", async () => {
      const lines: string[] = [];
      const admitted = await evaluateAskAdmission(settingsWith(a5Picker(a5Scorecard(EXAMPLE_FREE_CAP_MICROS), (line) => lines.push(line))), ask("free", "BEST"), TINY_ROOM);
      expect(admitted.personRoomTight).toBe(true);
      expect(lines).toContain("MODEL_PICKER note PERSON_ROOM_BELOW_ECONOMY");
      expect(lines).toContain("MODEL_PICKER note FREE_CAPS");
      const assignment = admitted.modelAssignment!.assignment;
      expect(assignment.strength).toBe("ECONOMY");
      expect(assignment.roles.ANSWER_WRITER.map((seat) => [seat.source, seat.main.modelId])).toEqual([["SCORECARD", FREE_A]]);
      const models = seatedModels(assignment.roles);
      expect(models.every((model) => PLAN_TIER_ROSTERS.free.includes(model))).toBe(true);
      expect(models).not.toContain(PAID_OPENAI);
    });

    it("(control) with Free's cap at Economy's, the same Free ask's writer is Economy's looser pick, B", async () => {
      const admitted = await evaluateAskAdmission(settingsWith(a5Picker(a5Scorecard(EXAMPLE_ECONOMY_CAP_MICROS), () => undefined)), ask("free", "BEST"), TINY_ROOM);
      expect(admitted.personRoomTight).toBe(true);
      expect(admitted.modelAssignment!.assignment.roles.ANSWER_WRITER[0]?.main.modelId).toBe(FREE_B);
    });
  });

  it("with billing on and no Free-roster model reachable, the Free ask takes the existing no-model path", async () => {
    const premiumOnly = PANEL.filter((entry) => !PLAN_TIER_ROSTERS.free.includes(entry.model_id));
    await expect(evaluateAskAdmission(settingsWith(hostedPicker(true), premiumOnly), ask("free")))
      .rejects.toMatchObject({ code: "ASK_MODEL_CANDIDATE_UNAVAILABLE" });
  });
});

describe("S4b · the boot's one-call check prices Free on its own roster when the site sells plans", () => {
  const models = ["off-roster-model", FREE_ANTHROPIC!, PAID_OPENAI!, FREE_OPENAI!];

  it("keeps a plan named in ownRosterOnly to its configured roster members", () => {
    const lists = firstCallPlanModels({ scorecardInForce: true, rosters: PLAN_TIER_ROSTERS, models, ownRosterOnly: ["free"] });
    expect(lists.free).toEqual([FREE_OPENAI, FREE_ANTHROPIC]);
    expect(lists.premium).toEqual([PAID_OPENAI, "off-roster-model", FREE_ANTHROPIC, FREE_OPENAI]);
  });

  it("changes nothing without it, or without a scorecard", () => {
    expect(firstCallPlanModels({ scorecardInForce: true, rosters: PLAN_TIER_ROSTERS, models }).free)
      .toEqual([FREE_OPENAI, FREE_ANTHROPIC, "off-roster-model", PAID_OPENAI]);
    expect(firstCallPlanModels({ scorecardInForce: false, rosters: PLAN_TIER_ROSTERS, models, ownRosterOnly: ["free"] }))
      .toBe(PLAN_TIER_ROSTERS);
  });
});
