import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, MODEL_STRENGTHS, THINKING_LEVEL_DEFAULT_ONLY, type DebateRole } from "@debateai/kernel";
import {
  RoleAssignmentSchema,
  pickRoleAssignment,
  type PickerInput,
  type PickerOutcome,
  type PickerSettings,
  type ReachableTarget,
  type RoleSeat,
  type Scorecard,
  type ScorecardCandidate,
  type ScorecardRoleEntry,
  type SeatCandidate,
  type TargetPrice,
  type Tier
} from "@debateai/scorecard";
import { roleNumbers, targetFor, testCandidate, testEntry, testScorecard } from "../support/scorecardFixtures.js";

/** mulberry32: a seeded 32-bit generator, written here so the property run needs no dependency. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;
const between = (random: Random, low: number, high: number): number => low + Math.floor(random() * (high - low + 1));
const chance = (random: Random, probability: number): boolean => random() < probability;
function oneOf<T>(random: Random, values: readonly T[]): T {
  const value = values[between(random, 0, values.length - 1)];
  if (value === undefined) throw new Error("oneOf needs a non-empty list");
  return value;
}

const MAKERS = ["OpenAI", "Anthropic", "Google", "xAI", "Z.AI"] as const;
const LEVELS = [THINKING_LEVEL_DEFAULT_ONLY, "low", "high"] as const;
const TIER_DRAW: readonly Tier[] = ["TOP", "TOP", "TOP", "GOOD_VALUE", "GOOD_VALUE", "GOOD_VALUE", "AVOID", "UNTESTED"];
const SHARES = [0, 0.1, 0.2, 0.25, 0.5] as const;
const TOLERANCES = [0, 0.25, 1] as const;
const PLAN_TIERS_OR_NONE = ["free", "premium", null] as const;

/** One generated case. The ORDER of random draws is part of the seed's meaning: do not reorder. */
function generatedInput(seed: number): PickerInput {
  const random = mulberry32(seed);
  const candidates: ScorecardCandidate[] = [];
  const reachable: ReachableTarget[] = [];
  const prices = new Map<string, TargetPrice>();
  const makerCount = between(random, 1, MAKERS.length);
  for (const maker of MAKERS.slice(0, makerCount)) {
    const count = between(random, 1, 3);
    for (let index = 0; index < count; index += 1) {
      const thinkingLevel = oneOf(random, LEVELS);
      const subscriptionOnly = chance(random, 0.2);
      const narrowWindow = chance(random, 0.2);
      const candidate = testCandidate(`${maker.replace(/[^A-Za-z]/gu, "").toLowerCase()}-${String(index)}`, maker, {
        thinkingLevel,
        routes: subscriptionOnly ? [{ kind: "SUBSCRIPTION", tool: "pi" }] : [{ kind: "API" }],
        ...(narrowWindow ? { contextWindowTokens: 16_000 } : {})
      });
      candidates.push(candidate);
      if (chance(random, 0.85)) {
        const target = targetFor(candidate);
        reachable.push(target);
        prices.set(target.providerRef, {
          inputMicrosPerMTok: between(random, 0, 20) * 100_000,
          outputMicrosPerMTok: between(random, 0, 20) * 100_000
        });
      }
    }
  }
  const roles: Partial<Record<DebateRole, ScorecardRoleEntry[]>> = {};
  for (const role of DEBATE_ROLES) {
    const entries: ScorecardRoleEntry[] = [];
    for (const candidate of candidates) {
      if (!chance(random, 0.8)) continue;
      const quality = between(random, 0, 100);
      const seconds = between(random, 1, 60);
      const tier = oneOf(random, TIER_DRAW);
      const inputTokens = between(random, 1, 30) * 1000;
      entries.push(testEntry(candidate.candidateId, quality, seconds, { tier, inputTokens }));
    }
    roles[role] = entries;
  }
  const settings: Partial<PickerSettings> = {
    balancedMargin: between(random, 0, 10),
    diversityShare: oneOf(random, SHARES),
    runnerUpCostTolerance: oneOf(random, TOLERANCES),
    defaultStrength: oneOf(random, MODEL_STRENGTHS),
    planStrengthCaps: chance(random, 0.5) ? { free: "BALANCED" } : {}
  };
  const scorecard = chance(random, 0.1) ? null : testScorecard(candidates, roles, settings);
  const positions = between(random, 1, 4);
  const panel = Math.max(2, positions);
  const mode = chance(random, 0.5) ? "HOSTED" : "LOCAL";
  const strength = chance(random, 0.25) ? null : oneOf(random, MODEL_STRENGTHS);
  const planTier = oneOf(random, PLAN_TIERS_OR_NONE);
  const expectedCallsByRole = roleNumbers(Object.fromEntries(DEBATE_ROLES.map((role) => [role, between(random, 0, 40)])));
  const perRunCeilingMicros = chance(random, 0.5) ? null : between(random, 0, 200) * 1000;
  return {
    scorecard,
    mode,
    strength,
    planTier,
    reachable,
    seatDemand: roleNumbers({
      POSITION: positions, SUPPORT_ATTACK: positions, CROSS_EXCHANGE: positions,
      JUDGE: panel, REVIEWER: panel, ANSWER_WRITER: 1, ANSWER_CHECKER: 1
    }),
    expectedCallsByRole,
    perRunCeilingMicros,
    prices
  };
}

function reversedLists(scorecard: Scorecard): Scorecard {
  return {
    ...scorecard,
    candidates: [...scorecard.candidates].reverse(),
    roles: Object.fromEntries(DEBATE_ROLES.map((role) => [role, [...scorecard.roles[role]].reverse()])) as Scorecard["roles"]
  };
}

const membersOf = (seat: RoleSeat): SeatCandidate[] => (seat.runnerUp === null ? [seat.main] : [seat.main, seat.runnerUp]);

/** Every law an ASSIGNED outcome must keep, named when broken. */
function violationsOf(input: PickerInput, outcome: Extract<PickerOutcome, { state: "ASSIGNED" }>): string[] {
  const found: string[] = [];
  const { roles } = outcome.assignment;
  if (!RoleAssignmentSchema.safeParse(outcome.assignment).success) found.push("RoleAssignmentSchema refuses the assignment");
  if (outcome.assignment.strength !== outcome.appliedStrength) found.push("assignment.strength is not appliedStrength");
  // POSITION seats never share a maker, mains and runner-ups alike (R5).
  const positionMakers = roles.POSITION.map((seat) => new Set(membersOf(seat).map((member) => member.maker)));
  positionMakers.forEach((makers, left) => positionMakers.forEach((other, right) => {
    if (left < right && [...makers].some((maker) => other.has(maker))) found.push(`POSITION seats ${String(left)} and ${String(right)} share a maker`);
  }));
  // No route twice in a role; a runner-up is never on its main's route.
  for (const role of DEBATE_ROLES) {
    const routes = roles[role].flatMap((seat) => membersOf(seat).map((member) => member.providerRef));
    if (new Set(routes).size !== routes.length) found.push(`${role} seats a route twice`);
  }
  // CROSS_EXCHANGE is POSITION's seats (R5).
  if (roles.CROSS_EXCHANGE.length > 0 && JSON.stringify(roles.CROSS_EXCHANGE) !== JSON.stringify(roles.POSITION)) {
    found.push("CROSS_EXCHANGE is not POSITION's seats");
  }
  // Every author maker meets a judge and a reviewer of another maker (no self-grading, reviewer ≠ author).
  const authorMakers = new Set([...roles.POSITION, ...roles.SUPPORT_ATTACK].flatMap((seat) => membersOf(seat).map((member) => member.maker)));
  if (new Set(input.reachable.map((target) => target.maker)).size >= 2) {
    for (const role of ["JUDGE", "REVIEWER"] as const) {
      for (const author of authorMakers) {
        if (!roles[role].some((seat) => seat.main.maker !== author)) found.push(`${role} has no seat of a maker other than ${author}`);
      }
    }
  }
  for (const role of DEBATE_ROLES) {
    for (const seat of roles[role]) {
      for (const member of membersOf(seat)) {
        const target = input.reachable.find((candidate) => candidate.providerRef === member.providerRef);
        if (target === undefined || target.maker !== member.maker || target.modelId !== member.modelId
          || (member.thinkingLevel !== THINKING_LEVEL_DEFAULT_ONLY && !target.thinkingLevels.includes(member.thinkingLevel))) {
          found.push(`${role} seats ${member.providerRef}, which is not reachable as recorded`);
        }
        if (seat.source !== "SCORECARD" || input.scorecard === null) continue;
        if (role === "CROSS_EXCHANGE") {
          // R5 (fix round 1): CROSS_EXCHANGE mirrors POSITION, but a candidate with its OWN
          // CROSS_EXCHANGE entry must still clear that entry's tier and window — a missing
          // entry stands in on the POSITION entry (F28) and is not itself a violation here.
          const crossEntry = input.scorecard.roles.CROSS_EXCHANGE.find((listed) => listed.candidateId === member.candidateId);
          if (crossEntry === undefined) continue;
          if (crossEntry.tier === "AVOID" || crossEntry.tier === "UNTESTED") {
            found.push(`CROSS_EXCHANGE seats ${crossEntry.tier} ${String(member.candidateId)} on its own cross-exchange entry`);
          }
          const crossCandidate = input.scorecard.candidates.find((listed) => listed.candidateId === member.candidateId);
          const crossWindows = [crossCandidate?.contextWindowTokens ?? null, target?.contextWindowTokens ?? null]
            .filter((size): size is number => size !== null);
          const crossTokens = crossEntry.typicalCall.inputTokens + crossEntry.typicalCall.outputTokens + (crossEntry.typicalCall.thinkingTokens ?? 0);
          if (crossWindows.length > 0 && crossTokens > Math.min(...crossWindows)) {
            found.push(`CROSS_EXCHANGE seats ${String(member.candidateId)} past its own cross-exchange context window`);
          }
          continue;
        }
        const candidate = input.scorecard.candidates.find((listed) => listed.candidateId === member.candidateId);
        const entry = input.scorecard.roles[role].find((listed) => listed.candidateId === member.candidateId);
        if (candidate === undefined || entry === undefined) {
          found.push(`${role} seats ${String(member.candidateId)}, which has no entry for the role`);
          continue;
        }
        if (entry.tier === "AVOID" || entry.tier === "UNTESTED") found.push(`${role} seats ${entry.tier} ${entry.candidateId}`);
        if (input.mode === "HOSTED" && !candidate.accessRoutes.some((route) => route.kind === "API")) {
          found.push(`HOSTED seats subscription-only ${candidate.candidateId}`);
        }
        const windows = [candidate.contextWindowTokens, target?.contextWindowTokens ?? null].filter((size): size is number => size !== null);
        const typicalCallTokens = entry.typicalCall.inputTokens + entry.typicalCall.outputTokens + (entry.typicalCall.thinkingTokens ?? 0);
        if (windows.length > 0 && typicalCallTokens > Math.min(...windows)) {
          found.push(`${role} seats ${candidate.candidateId} past its context window`);
        }
      }
    }
  }
  if (input.mode === "HOSTED" && input.planTier !== null && input.scorecard !== null) {
    const cap = input.scorecard.pickerSettings.planStrengthCaps[input.planTier];
    if (cap !== undefined && MODEL_STRENGTHS.indexOf(outcome.appliedStrength) > MODEL_STRENGTHS.indexOf(cap)) {
      found.push(`plan ${input.planTier} is capped at ${cap} but ran at ${outcome.appliedStrength}`);
    }
  }
  if (input.mode === "HOSTED" && input.perRunCeilingMicros !== null && outcome.estimate.moneyMicros !== null
    && outcome.estimate.moneyMicros > input.perRunCeilingMicros) {
    found.push("assigned over the per-run ceiling");
  }
  if (outcome.steppedDown && (input.mode !== "HOSTED" || input.perRunCeilingMicros === null)) found.push("stepped down without a hosted ceiling");
  return found;
}

describe("pickRoleAssignment — property: 400 seeded inputs", () => {
  it("never breaks a fairness rule, is deterministic, and reaches every branch it claims to", () => {
    const failures: string[] = [];
    const seen = { assigned: 0, scorecardSeat: 0, runnerUp: 0, fallbackSeat: 0, multiPosition: 0, budget: 0 };
    for (let seed = 1; seed <= 400; seed += 1) {
      const input = generatedInput(seed);
      const outcome = pickRoleAssignment(input);
      if (JSON.stringify(pickRoleAssignment(input)) !== JSON.stringify(outcome)) failures.push(`seed ${String(seed)}: not deterministic`);
      if (input.scorecard !== null
        && JSON.stringify(pickRoleAssignment({ ...input, scorecard: reversedLists(input.scorecard) })) !== JSON.stringify(outcome)) {
        failures.push(`seed ${String(seed)}: depends on the scorecard's list order`);
      }
      if (outcome.state === "REFUSED") {
        if (outcome.reason === "NO_REACHABLE_CANDIDATE" && input.reachable.length > 0) {
          failures.push(`seed ${String(seed)}: NO_REACHABLE_CANDIDATE with ${String(input.reachable.length)} reachable targets`);
        }
        if (outcome.reason === "BUDGET_TOO_SMALL") {
          seen.budget += 1;
          if (input.mode !== "HOSTED" || input.perRunCeilingMicros === null) failures.push(`seed ${String(seed)}: BUDGET_TOO_SMALL without a hosted ceiling`);
        }
        continue;
      }
      seen.assigned += 1;
      if (outcome.steppedDown) seen.budget += 1;
      failures.push(...violationsOf(input, outcome).map((violation) => `seed ${String(seed)}: ${violation}`));
      const seats = DEBATE_ROLES.flatMap((role) => outcome.assignment.roles[role]);
      if (seats.some((seat) => seat.source === "SCORECARD")) seen.scorecardSeat += 1;
      if (seats.some((seat) => seat.runnerUp !== null)) seen.runnerUp += 1;
      if (seats.some((seat) => seat.source === "FALLBACK")) seen.fallbackSeat += 1;
      if (outcome.assignment.roles.POSITION.length >= 2) seen.multiPosition += 1;
    }
    expect(failures).toEqual([]);
    // Non-vacuity: measured on this generator (fix round 1, CROSS_EXCHANGE eligibility) at
    // 356 / 313 / 117 / 229 / 152 / 43; floors sit well below.
    expect(seen.assigned).toBeGreaterThanOrEqual(300);
    expect(seen.scorecardSeat).toBeGreaterThanOrEqual(250);
    expect(seen.runnerUp).toBeGreaterThanOrEqual(80);
    expect(seen.fallbackSeat).toBeGreaterThanOrEqual(150);
    expect(seen.multiPosition).toBeGreaterThanOrEqual(120);
    expect(seen.budget).toBeGreaterThanOrEqual(20);
  });
});
