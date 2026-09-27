import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DEBATE_ROLES,
  MODEL_STRENGTHS,
  THINKING_LEVEL_DEFAULT_ONLY,
  type DebateRole,
  type ModelStrength
} from "@debateai/kernel";
import type { PickerSettings, Scorecard, ScorecardCandidate, ScorecardRoleEntry } from "./schema.js";
import { estimateRunCost, typicalCallMicros } from "./estimate.js";

/**
 * THE PER-ROLE PICKER (model-scorecard design §2.4-§2.6; owner rulings R2, R3, R5, R7).
 *
 * Pure: no clock, no randomness, no I/O. The same input always gives the same outcome, and the
 * order of the scorecard's own lists never matters — every choice is a sort on quality, cost and
 * candidateId. The one order that DOES matter is `reachable`: FALLBACK seats reproduce today's
 * roster from it, so the caller passes today's discovery order.
 *
 * Notes are machine codes, one per fact, for the log and the honesty drawer:
 *   SCORECARD_ABSENT                          no scorecard: every role is today's roster
 *   PLAN_CAP:<plan>:<asked>-><applied>        the hosted plan capped the strength
 *   STEPPED_DOWN:<from>-><to>                 the money estimate was over the per-run ceiling
 *   ROLE_FALLBACK:<role>:NO_ELIGIBLE_CANDIDATE | MAKER_COVERAGE
 *   SEATS_SHORT:<role>:<filled>/<asked>       fewer eligible makers or routes than seats
 *   CONTEXT_WINDOW_SKIP:<role>:<candidateId>  the role's typical call (input + output + thinking) does not fit the window
 *   ECONOMY_CAP_UNMET:<role>                  nothing was under the cap; the cheapest sits
 *   PRICE_UNUSABLE:<providerRef>              a hosted route without a usable price
 *   ESTIMATE_UNAVAILABLE                      a called seat has no typical call or no price
 */

export type ReachableTarget = Readonly<{
  providerRef: string;
  maker: string;
  modelId: string;
  thinkingLevels: readonly string[];
  contextWindowTokens: number | null;
}>;

/** One target's operator-configured price. `PickerInput.prices` is keyed by `providerRef`. */
export type TargetPrice = Readonly<{ inputMicrosPerMTok: number; outputMicrosPerMTok: number }>;

export type SeatCandidate = Readonly<{
  /** null on a FALLBACK seat: today's roster member, not a scorecard candidate. */
  candidateId: string | null;
  providerRef: string;
  maker: string;
  modelId: string;
  thinkingLevel: string;
}>;

export type RoleSeat = Readonly<{
  seatIndex: number;
  main: SeatCandidate;
  /** R3: serves `diversityShare` of the seat's calls, and is the seat's backup (R4). */
  runnerUp: SeatCandidate | null;
  diversityShare: number;
  source: "SCORECARD" | "FALLBACK";
}>;

export type RoleAssignment = Readonly<{
  scorecardVersion: number | null;
  strength: ModelStrength;
  roles: Readonly<Record<DebateRole, readonly RoleSeat[]>>;
}>;

export type CostEstimate = Readonly<{
  mode: "HOSTED" | "LOCAL";
  moneyMicros: number | null;
  seconds: number | null;
}>;

export type PickerInput = Readonly<{
  scorecard: Scorecard | null;
  mode: "HOSTED" | "LOCAL";
  strength: ModelStrength | null;
  planTier: "free" | "premium" | null;
  /** Healthy targets in today's discovery order; FALLBACK seats keep this order. */
  reachable: readonly ReachableTarget[];
  seatDemand: Readonly<Record<DebateRole, number>>;
  expectedCallsByRole: Readonly<Record<DebateRole, number>>;
  perRunCeilingMicros: number | null;
  prices: ReadonlyMap<string, TargetPrice>;
}>;

export type PickerOutcome =
  | Readonly<{
    state: "ASSIGNED";
    assignment: RoleAssignment;
    appliedStrength: ModelStrength;
    steppedDown: boolean;
    estimate: CostEstimate;
    notes: readonly string[];
  }>
  | Readonly<{ state: "REFUSED"; reason: "BUDGET_TOO_SMALL" | "NO_REACHABLE_CANDIDATE"; detail: string }>;

const seatCandidateSchema = z.object({
  candidateId: z.string().min(1).nullable(),
  providerRef: z.string().min(1),
  maker: z.string().min(1),
  modelId: z.string().min(1),
  thinkingLevel: z.string().min(1)
}).strict();

const roleSeatSchema = z.object({
  seatIndex: z.number().int().min(0),
  main: seatCandidateSchema,
  runnerUp: seatCandidateSchema.nullable(),
  diversityShare: z.number().min(0).max(0.5),
  source: z.enum(["SCORECARD", "FALLBACK"])
}).strict();

/**
 * The pinned shape (`core.run_role_assignment.assignment`, migration 0072) and its read-back
 * door. Closed at every level, like the envelope basis: a pinned value that does not parse is a
 * corrupt row, never a newer one. Beyond the shape it re-checks the laws the picker keeps, so a
 * hand-built or tampered assignment can neither be pinned nor read back: seat indexes 0..n-1;
 * FALLBACK seats name no candidate and no runner-up; SCORECARD seats name theirs; no share
 * without a runner-up; no route twice in a role (so a runner-up is never on its main's route);
 * POSITION seats never share a maker, runner-ups included; CROSS_EXCHANGE is POSITION's seats
 * (R5); the answer writer and checker are single seats.
 */
export const RoleAssignmentSchema = z.object({
  scorecardVersion: z.number().int().min(1).nullable(),
  strength: z.enum(MODEL_STRENGTHS),
  roles: z.record(z.enum(DEBATE_ROLES), z.array(roleSeatSchema))
}).strict().superRefine((assignment, context) => {
  const fail = (message: string): void => {
    context.addIssue({ code: "custom", message });
  };
  for (const role of DEBATE_ROLES) {
    const seats = assignment.roles[role];
    seats.forEach((seat, index) => {
      if (seat.seatIndex !== index) fail(`${role} seat ${String(index)} carries seatIndex ${String(seat.seatIndex)}`);
      if (seat.source === "FALLBACK" && (seat.main.candidateId !== null || seat.runnerUp !== null)) {
        fail(`${role} seat ${String(index)}: a FALLBACK seat names no candidate and no runner-up`);
      }
      if (seat.source === "SCORECARD" && (seat.main.candidateId === null || seat.runnerUp?.candidateId === null)) {
        fail(`${role} seat ${String(index)}: a SCORECARD seat names its candidates`);
      }
      if (seat.runnerUp === null && seat.diversityShare !== 0) fail(`${role} seat ${String(index)}: no runner-up, so no share`);
    });
    const routes = seats.flatMap((seat) => (seat.runnerUp === null
      ? [seat.main.providerRef]
      : [seat.main.providerRef, seat.runnerUp.providerRef]));
    if (new Set(routes).size !== routes.length) fail(`${role} seats one route twice`);
  }
  const positionMakers = assignment.roles.POSITION.map((seat) => new Set(seat.runnerUp === null
    ? [seat.main.maker]
    : [seat.main.maker, seat.runnerUp.maker]));
  positionMakers.forEach((makers, left) => {
    positionMakers.slice(left + 1).forEach((other, offset) => {
      if ([...makers].some((maker) => other.has(maker))) {
        fail(`POSITION seats ${String(left)} and ${String(left + 1 + offset)} share a maker`);
      }
    });
  });
  const crossExchange = assignment.roles.CROSS_EXCHANGE;
  if (crossExchange.length > 0 && JSON.stringify(crossExchange) !== JSON.stringify(assignment.roles.POSITION)) {
    fail("CROSS_EXCHANGE seats are POSITION's seats (ruling R5)");
  }
  for (const role of ["ANSWER_WRITER", "ANSWER_CHECKER"] as const) {
    if (assignment.roles[role].length > 1) fail(`${role} is a single seat`);
  }
});

/** One eligible candidate for one role, with its cost per typical call (micros HOSTED, seconds LOCAL). */
type Ranked = Readonly<{ candidateId: string; candidate: SeatCandidate; quality: number; cost: number }>;

type SeatRule = Readonly<{
  /** POSITION: no two seats share a maker, mains and runner-ups alike. */
  distinctMakers: boolean;
  /** Lower is preferred; the strength rule then picks within the lowest class. */
  penalty: (entry: Ranked, chosen: readonly Ranked[]) => number;
  /** JUDGE and REVIEWER: every author maker must meet a seat of another maker, or the role falls back. */
  coverage: ReadonlySet<string> | null;
  /** PANEL: first target of each maker. SINGLE: first target, preferring another maker than avoidMaker. */
  fallback: Readonly<{ kind: "PANEL" | "SINGLE"; avoidMaker: string | null }>;
}>;

function pickerCompareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pickerCompareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** R2 order for BEST and ECONOMY: higher quality, then lower cost, then candidateId. */
function byQualityThenCost(left: Ranked, right: Ranked): number {
  return pickerCompareNumbers(right.quality, left.quality)
    || pickerCompareNumbers(left.cost, right.cost)
    || pickerCompareIds(left.candidateId, right.candidateId);
}

/** R2 order for BALANCED: lower cost, then candidateId. */
function byCostThenId(left: Ranked, right: Ranked): number {
  return pickerCompareNumbers(left.cost, right.cost) || pickerCompareIds(left.candidateId, right.candidateId);
}

function strengthIndex(strength: ModelStrength): number {
  return MODEL_STRENGTHS.indexOf(strength);
}

/**
 * R2, applied to one pool.
 *   BEST     the highest quality.
 *   BALANCED the cheapest whose quality is at least the pool's best minus `balancedMargin`.
 *   ECONOMY  the highest quality whose cost per call is at or under the role's cap — or the
 *            cheapest, when no cap is set or nothing meets it.
 */
function pickByStrength(pool: readonly Ranked[], strength: ModelStrength, settings: PickerSettings, cap: number | null): Ranked | null {
  if (pool.length === 0) return null;
  if (strength === "BEST") return [...pool].sort(byQualityThenCost)[0] ?? null;
  if (strength === "BALANCED") {
    const best = Math.max(...pool.map((entry) => entry.quality));
    return pool.filter((entry) => entry.quality >= best - settings.balancedMargin).sort(byCostThenId)[0] ?? null;
  }
  const underCap = cap === null ? [] : pool.filter((entry) => entry.cost <= cap);
  return (underCap.length > 0 ? [...underCap].sort(byQualityThenCost) : [...pool].sort(byCostThenId))[0] ?? null;
}

function matchTarget(reachable: readonly ReachableTarget[], candidate: ScorecardCandidate): ReachableTarget | null {
  return reachable.find((target) => target.maker === candidate.maker
    && target.modelId === candidate.modelId
    && (candidate.thinkingLevel === THINKING_LEVEL_DEFAULT_ONLY || target.thinkingLevels.includes(candidate.thinkingLevel))) ?? null;
}

/**
 * R1 applied to a typical call (pre-flight ruling F29): the gateway refuses a prompt when the prompt
 * PLUS the answer bound exceeds the window, so the picker counts the typical call's input, output
 * and thinking tokens together. Comparing the input alone would seat a candidate the gateway then
 * refuses on every call (PROVIDER_CONTEXT_WINDOW_EXCEEDED is not a backup trigger).
 */
function typicalCallWindowTokens(typicalCall: ScorecardRoleEntry["typicalCall"]): number {
  return typicalCall.inputTokens + typicalCall.outputTokens + (typicalCall.thinkingTokens ?? 0);
}

function smallestWindow(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
}

function seatCandidateFrom(candidate: ScorecardCandidate, target: ReachableTarget): SeatCandidate {
  return Object.freeze({
    candidateId: candidate.candidateId,
    providerRef: target.providerRef,
    maker: target.maker,
    modelId: target.modelId,
    thinkingLevel: candidate.thinkingLevel
  });
}

function fallbackCandidateFrom(target: ReachableTarget): SeatCandidate {
  return Object.freeze({
    candidateId: null,
    providerRef: target.providerRef,
    maker: target.maker,
    modelId: target.modelId,
    thinkingLevel: THINKING_LEVEL_DEFAULT_ONLY
  });
}

function seatDemandOf(input: PickerInput, role: DebateRole): number {
  const demand = input.seatDemand[role];
  return Number.isSafeInteger(demand) && demand > 0 ? demand : 0;
}

/**
 * Every scorecard candidate that may sit in `role`: listed for it, not AVOID or UNTESTED,
 * reachable at its own thinking level, on an API route in HOSTED mode (relays never run
 * hosted), and whose typical call (input + output + thinking tokens) fits the smaller of its own
 * and its route's window.
 * Entries are walked in candidateId order so the notes do not depend on the file's order.
 */
function eligiblePool(input: PickerInput, scorecard: Scorecard, role: DebateRole, notes: string[]): Ranked[] {
  const candidates = new Map(scorecard.candidates.map((candidate) => [candidate.candidateId, candidate] as const));
  const entries = [...scorecard.roles[role]].sort((left, right) => pickerCompareIds(left.candidateId, right.candidateId));
  const pool: Ranked[] = [];
  for (const entry of entries) {
    if (entry.tier === "AVOID" || entry.tier === "UNTESTED") continue;
    const candidate = candidates.get(entry.candidateId);
    if (candidate === undefined) continue;
    if (input.mode === "HOSTED" && !candidate.accessRoutes.some((route) => route.kind === "API")) continue;
    const target = matchTarget(input.reachable, candidate);
    if (target === null) continue;
    const contextWindow = smallestWindow(candidate.contextWindowTokens, target.contextWindowTokens);
    if (contextWindow !== null && typicalCallWindowTokens(entry.typicalCall) > contextWindow) {
      notes.push(`CONTEXT_WINDOW_SKIP:${role}:${candidate.candidateId}`);
      continue;
    }
    let cost = entry.typicalCall.seconds;
    if (input.mode === "HOSTED") {
      const price = input.prices.get(target.providerRef);
      const micros = price === undefined ? null : typicalCallMicros(entry.typicalCall, price);
      if (micros === null) notes.push(`PRICE_UNUSABLE:${target.providerRef}`);
      cost = micros ?? Number.POSITIVE_INFINITY;
    }
    pool.push(Object.freeze({ candidateId: candidate.candidateId, candidate: seatCandidateFrom(candidate, target), quality: entry.quality.score, cost }));
  }
  return pool;
}

/** Seat by seat: never a route twice; the lowest penalty class first; then the strength rule. */
function chooseMains(
  pool: readonly Ranked[],
  count: number,
  strength: ModelStrength,
  settings: PickerSettings,
  cap: number | null,
  rule: SeatRule
): Ranked[] {
  const chosen: Ranked[] = [];
  while (chosen.length < count) {
    const open = pool.filter((entry) => !chosen.some((seat) => seat.candidate.providerRef === entry.candidate.providerRef)
      && !(rule.distinctMakers && chosen.some((seat) => seat.candidate.maker === entry.candidate.maker)));
    if (open.length === 0) break;
    const penalties = open.map((entry) => rule.penalty(entry, chosen));
    const lowest = Math.min(...penalties);
    const pick = pickByStrength(open.filter((_entry, index) => penalties[index] === lowest), strength, settings, cap);
    if (pick === null) break;
    chosen.push(pick);
  }
  return chosen;
}

/**
 * R3: the best other candidate whose quality is at least the main's minus `balancedMargin` and
 * whose cost is at most the main's × (1 + `runnerUpCostTolerance`), on an unused route and not
 * of a blocked maker; another maker than the main's is preferred.
 */
function chooseRunnerUp(
  main: Ranked,
  pool: readonly Ranked[],
  usedRoutes: ReadonlySet<string>,
  blockedMakers: ReadonlySet<string>,
  settings: PickerSettings
): Ranked | null {
  const costCeiling = main.cost * (1 + settings.runnerUpCostTolerance);
  const qualifying = pool.filter((entry) => !usedRoutes.has(entry.candidate.providerRef)
    && !blockedMakers.has(entry.candidate.maker)
    && entry.quality >= main.quality - settings.balancedMargin
    && entry.cost <= costCeiling);
  const otherMaker = qualifying.filter((entry) => entry.candidate.maker !== main.candidate.maker);
  return [...(otherMaker.length > 0 ? otherMaker : qualifying)].sort(byQualityThenCost)[0] ?? null;
}

function fallbackSeats(reachable: readonly ReachableTarget[], count: number, fallback: SeatRule["fallback"]): readonly RoleSeat[] {
  const targets: ReachableTarget[] = [];
  if (fallback.kind === "PANEL") {
    for (const target of reachable) {
      if (targets.length >= count) break;
      if (!targets.some((seated) => seated.maker === target.maker)) targets.push(target);
    }
  } else if (count > 0) {
    const chosen = reachable.find((target) => fallback.avoidMaker !== null && target.maker !== fallback.avoidMaker) ?? reachable[0];
    if (chosen !== undefined) targets.push(chosen);
  }
  return Object.freeze(targets.map((target, seatIndex) => Object.freeze({
    seatIndex,
    main: fallbackCandidateFrom(target),
    runnerUp: null,
    diversityShare: 0,
    source: "FALLBACK" as const
  })));
}

function makersOf(seats: readonly RoleSeat[]): Set<string> {
  return new Set(seats.flatMap((seat) => (seat.runnerUp === null ? [seat.main.maker] : [seat.main.maker, seat.runnerUp.maker])));
}

function coversAuthorMakers(makers: readonly string[], authors: ReadonlySet<string>): boolean {
  return [...authors].every((author) => makers.some((maker) => maker !== author));
}

function assignAtStrength(input: PickerInput, strength: ModelStrength): Readonly<{ assignment: RoleAssignment; notes: readonly string[] }> {
  const notes: string[] = [];
  const scorecard = input.scorecard;
  const fill = (role: DebateRole, count: number, rule: SeatRule): readonly RoleSeat[] => {
    if (count === 0) return Object.freeze([]);
    if (scorecard === null) return fallbackSeats(input.reachable, count, rule.fallback);
    const settings = scorecard.pickerSettings;
    const economyCap = settings.economyCap[role];
    const cap = input.mode === "HOSTED" ? economyCap.moneyMicrosPerCall : economyCap.secondsPerCall;
    const pool = eligiblePool(input, scorecard, role, notes);
    const mains = chooseMains(pool, count, strength, settings, cap, rule);
    if (mains.length === 0) {
      notes.push(`ROLE_FALLBACK:${role}:NO_ELIGIBLE_CANDIDATE`);
      return fallbackSeats(input.reachable, count, rule.fallback);
    }
    if (rule.coverage !== null && !coversAuthorMakers(mains.map((main) => main.candidate.maker), rule.coverage)) {
      notes.push(`ROLE_FALLBACK:${role}:MAKER_COVERAGE`);
      return fallbackSeats(input.reachable, count, rule.fallback);
    }
    if (mains.length < count) notes.push(`SEATS_SHORT:${role}:${String(mains.length)}/${String(count)}`);
    if (strength === "ECONOMY" && cap !== null && mains.some((main) => main.cost > cap)) notes.push(`ECONOMY_CAP_UNMET:${role}`);
    const usedRoutes = new Set(mains.map((main) => main.candidate.providerRef));
    const runnerUps: (Ranked | null)[] = [];
    mains.forEach((main, index) => {
      // POSITION: another seat's maker — its main, or a runner-up already chosen — is blocked.
      const blocked = new Set<string>();
      if (rule.distinctMakers) {
        mains.forEach((other, otherIndex) => {
          if (otherIndex !== index) blocked.add(other.candidate.maker);
        });
        runnerUps.forEach((other) => {
          if (other !== null) blocked.add(other.candidate.maker);
        });
      }
      const runnerUp = chooseRunnerUp(main, pool, usedRoutes, blocked, settings);
      if (runnerUp !== null) usedRoutes.add(runnerUp.candidate.providerRef);
      runnerUps.push(runnerUp);
    });
    return Object.freeze(mains.map((main, seatIndex) => {
      const runnerUp = runnerUps[seatIndex] ?? null;
      return Object.freeze({
        seatIndex,
        main: main.candidate,
        runnerUp: runnerUp === null ? null : runnerUp.candidate,
        diversityShare: runnerUp === null ? 0 : settings.diversityShare,
        source: "SCORECARD" as const
      });
    }));
  };

  const noPenalty = (): number => 0;
  const newMakerFirst = (entry: Ranked, chosen: readonly Ranked[]): number =>
    (chosen.some((seat) => seat.candidate.maker === entry.candidate.maker) ? 1 : 0);
  const panelFallback = Object.freeze({ kind: "PANEL" as const, avoidMaker: null });

  const position = fill("POSITION", seatDemandOf(input, "POSITION"), {
    distinctMakers: true, penalty: noPenalty, coverage: null, fallback: panelFallback
  });
  const supportAttack = fill("SUPPORT_ATTACK", seatDemandOf(input, "SUPPORT_ATTACK"), {
    distinctMakers: false, penalty: newMakerFirst, coverage: null, fallback: panelFallback
  });
  const debating = makersOf(position);
  const authors = makersOf([...position, ...supportAttack]);
  const coverage = new Set(input.reachable.map((target) => target.maker)).size >= 2 && authors.size > 0 ? authors : null;
  // R5: judges come preferably from makers not seated in POSITION, then from makers not yet judging.
  const judge = fill("JUDGE", seatDemandOf(input, "JUDGE"), {
    distinctMakers: false,
    penalty: (entry, chosen) => (debating.has(entry.candidate.maker) ? 2 : 0) + newMakerFirst(entry, chosen),
    coverage,
    fallback: panelFallback
  });
  const reviewer = fill("REVIEWER", seatDemandOf(input, "REVIEWER"), {
    distinctMakers: false, penalty: newMakerFirst, coverage, fallback: panelFallback
  });
  const answerWriter = fill("ANSWER_WRITER", Math.min(1, seatDemandOf(input, "ANSWER_WRITER")), {
    distinctMakers: false, penalty: noPenalty, coverage: null, fallback: { kind: "SINGLE", avoidMaker: null }
  });
  // The checker checks the writer's answer: another maker is preferred, as today's default
  // synthesis refs are two makers (dev-deployment-register.ts deriveSynthesisRoleRefs).
  const writerMaker = answerWriter[0]?.main.maker ?? null;
  const answerChecker = fill("ANSWER_CHECKER", Math.min(1, seatDemandOf(input, "ANSWER_CHECKER")), {
    distinctMakers: false,
    penalty: (entry) => (entry.candidate.maker === writerMaker ? 1 : 0),
    coverage: null,
    fallback: { kind: "SINGLE", avoidMaker: writerMaker }
  });
  const roles: Record<DebateRole, readonly RoleSeat[]> = {
    POSITION: position,
    SUPPORT_ATTACK: supportAttack,
    // R5: the member who wrote a POSITION also writes its cross-exchange.
    CROSS_EXCHANGE: seatDemandOf(input, "CROSS_EXCHANGE") > 0 ? position : Object.freeze([]),
    JUDGE: judge,
    REVIEWER: reviewer,
    ANSWER_WRITER: answerWriter,
    ANSWER_CHECKER: answerChecker
  };
  const assignment: RoleAssignment = Object.freeze({
    scorecardVersion: scorecard?.scorecardVersion ?? null,
    strength,
    roles: Object.freeze(roles)
  });
  return Object.freeze({ assignment, notes });
}

function refusePick(reason: "BUDGET_TOO_SMALL" | "NO_REACHABLE_CANDIDATE", detail: string): PickerOutcome {
  return Object.freeze({ state: "REFUSED" as const, reason, detail });
}

/**
 * Fills every seat. The strength is the asker's, else the scorecard's default, else BALANCED;
 * a HOSTED plan cap lowers it. With a HOSTED per-run ceiling and a known money estimate, the
 * strength steps down one notch at a time until the estimate fits, and the ask is refused
 * BUDGET_TOO_SMALL when even ECONOMY does not fit.
 */
export function pickRoleAssignment(input: PickerInput): PickerOutcome {
  const notes: string[] = input.scorecard === null ? ["SCORECARD_ABSENT"] : [];
  let strength: ModelStrength = input.strength ?? input.scorecard?.pickerSettings.defaultStrength ?? "BALANCED";
  const planCap = input.mode === "HOSTED" && input.planTier !== null && input.scorecard !== null
    ? input.scorecard.pickerSettings.planStrengthCaps[input.planTier]
    : undefined;
  if (planCap !== undefined && strengthIndex(strength) > strengthIndex(planCap)) {
    notes.push(`PLAN_CAP:${String(input.planTier)}:${strength}->${planCap}`);
    strength = planCap;
  }
  const ceiling = input.mode === "HOSTED" ? input.perRunCeilingMicros : null;
  let steppedDown = false;
  for (;;) {
    const attempt = assignAtStrength(input, strength);
    const unfilled = DEBATE_ROLES.find((role) => role !== "CROSS_EXCHANGE"
      && seatDemandOf(input, role) > 0
      && attempt.assignment.roles[role].length === 0);
    if (unfilled !== undefined) return refusePick("NO_REACHABLE_CANDIDATE", `no reachable model can take a ${unfilled} seat`);
    const estimate = estimateRunCost({
      assignment: attempt.assignment,
      expectedCallsByRole: input.expectedCallsByRole,
      scorecard: input.scorecard,
      prices: input.prices,
      mode: input.mode
    });
    if (ceiling === null || estimate.moneyMicros === null || estimate.moneyMicros <= ceiling) {
      const primary = input.mode === "HOSTED" ? estimate.moneyMicros : estimate.seconds;
      return Object.freeze({
        state: "ASSIGNED" as const,
        assignment: attempt.assignment,
        appliedStrength: strength,
        steppedDown,
        estimate,
        notes: Object.freeze([...new Set([...notes, ...attempt.notes, ...(primary === null ? ["ESTIMATE_UNAVAILABLE"] : [])])])
      });
    }
    const lower = MODEL_STRENGTHS[strengthIndex(strength) - 1];
    if (lower === undefined) {
      return refusePick(
        "BUDGET_TOO_SMALL",
        `even ${strength} is estimated at ${String(estimate.moneyMicros)} micros, over the per-run ceiling of ${String(ceiling)} micros`
      );
    }
    notes.push(`STEPPED_DOWN:${strength}->${lower}`);
    strength = lower;
    steppedDown = true;
  }
}

/**
 * R3's deterministic share: with `period = Math.round(1 / diversityShare)`, the runner-up takes
 * the calls whose ordinal is `period - 1` modulo `period` (share 0.2: one call in five).
 * Maker-blind: a REVIEWER or JUDGE caller re-checks the returned candidate's maker against the
 * author's, and uses `backupFor` when it collides.
 */
export function selectSeatCandidate(seat: RoleSeat, ordinal: number): Readonly<{ candidate: SeatCandidate; via: "MAIN" | "RUNNER_UP" }> {
  if (seat.runnerUp !== null && seat.diversityShare > 0) {
    const period = Math.round(1 / seat.diversityShare);
    if (ordinal % period === period - 1) return Object.freeze({ candidate: seat.runnerUp, via: "RUNNER_UP" as const });
  }
  return Object.freeze({ candidate: seat.main, via: "MAIN" as const });
}

/**
 * The ordinal for a role called once per run (ANSWER_WRITER, ANSWER_CHECKER), so a whole
 * debate uses one of the two: the first 48 bits of sha256(runId), a non-negative safe integer.
 */
export function diversityOrdinalForRun(runId: string): number {
  return createHash("sha256").update(runId, "utf8").digest().readUIntBE(0, 6);
}

/** R3/R4: the runner-up is the main's backup, and the main is the runner-up's. */
export function backupFor(seat: RoleSeat, used: "MAIN" | "RUNNER_UP"): SeatCandidate | null {
  return used === "MAIN" ? seat.runnerUp : seat.main;
}
