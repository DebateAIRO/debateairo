import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";
import type { Scorecard, ScorecardRoleEntry } from "./schema.js";
import type { CostEstimate, RoleAssignment, SeatCandidate, TargetPrice } from "./picker.js";

const TOKENS_PER_MILLION = 1_000_000n;

function ceilMicrosPerMillion(tokens: number, microsPerMillionTokens: number): number | null {
  if (!Number.isSafeInteger(tokens) || tokens < 0 || !Number.isSafeInteger(microsPerMillionTokens) || microsPerMillionTokens < 0) {
    return null;
  }
  const micros = Number((BigInt(tokens) * BigInt(microsPerMillionTokens) + TOKENS_PER_MILLION - 1n) / TOKENS_PER_MILLION);
  return Number.isSafeInteger(micros) ? micros : null;
}

/**
 * One typical call's price in micros, computed the way @debateai/budget charges a completed
 * call (`chargeMicrosForUsage`, packages/budget/src/cost-envelope.ts): each side rounded UP
 * to a whole micro on its own, thinking tokens billed as output (the OpenAI-compatible vendors
 * bill reasoning tokens as completion tokens). null when a count or a price is not a
 * non-negative safe integer. tests/unit/scorecard-estimate.test.ts pins it against
 * chargeMicrosForUsage itself.
 */
export function typicalCallMicros(typicalCall: ScorecardRoleEntry["typicalCall"], price: TargetPrice): number | null {
  const input = ceilMicrosPerMillion(typicalCall.inputTokens, price.inputMicrosPerMTok);
  const output = ceilMicrosPerMillion(typicalCall.outputTokens + (typicalCall.thinkingTokens ?? 0), price.outputMicrosPerMTok);
  return input === null || output === null ? null : input + output;
}

function roleEntryFor(scorecard: Scorecard | null, role: DebateRole, candidateId: string | null): ScorecardRoleEntry | null {
  if (scorecard === null || candidateId === null) return null;
  return scorecard.roles[role].find((entry) => entry.candidateId === candidateId) ?? null;
}

/**
 * The entry a seated call is priced from. CROSS_EXCHANGE seats are POSITION's seats (R5), so a
 * CROSS_EXCHANGE call whose candidate has no CROSS_EXCHANGE entry is priced from its POSITION entry
 * (pre-flight fix F28): one missing entry must not turn the whole estimate null and disable the
 * hosted step-down.
 */
function seatEntryFor(scorecard: Scorecard | null, role: DebateRole, candidateId: string | null): ScorecardRoleEntry | null {
  const entry = roleEntryFor(scorecard, role, candidateId);
  if (entry !== null || role !== "CROSS_EXCHANGE") return entry;
  return roleEntryFor(scorecard, "POSITION", candidateId);
}

/**
 * Design §2.6: the expected cost of a run before it starts. For every role that is called,
 * its expected calls are shared equally among its seats, and each seat's calls are shared
 * between the main and the runner-up by `diversityShare`. HOSTED money = calls × the typical
 * call × the operator-configured price of the seated route; seconds use `typicalCall.seconds`
 * in both modes. A called seat without a scorecard entry (a FALLBACK seat) or, in HOSTED, without
 * a usable price makes that total null: the picker then cannot step down, and says so. A
 * CROSS_EXCHANGE call falls back to the candidate's POSITION entry (`seatEntryFor`). Totals
 * are rounded UP.
 */
export function estimateRunCost(input: Readonly<{
  assignment: RoleAssignment;
  expectedCallsByRole: Readonly<Record<DebateRole, number>>;
  scorecard: Scorecard | null;
  prices: ReadonlyMap<string, TargetPrice>;
  mode: "HOSTED" | "LOCAL";
}>): CostEstimate {
  let money: number | null = input.mode === "HOSTED" ? 0 : null;
  let seconds: number | null = 0;
  for (const role of DEBATE_ROLES) {
    const calls = input.expectedCallsByRole[role];
    const seats = input.assignment.roles[role];
    if (!(calls > 0) || seats.length === 0) continue;
    const callsPerSeat = calls / seats.length;
    for (const seat of seats) {
      const members: readonly Readonly<{ candidate: SeatCandidate; weight: number }>[] = seat.runnerUp === null
        ? [{ candidate: seat.main, weight: 1 }]
        : [{ candidate: seat.main, weight: 1 - seat.diversityShare }, { candidate: seat.runnerUp, weight: seat.diversityShare }];
      for (const member of members) {
        if (member.weight === 0) continue;
        const calledTimes = callsPerSeat * member.weight;
        const entry = seatEntryFor(input.scorecard, role, member.candidate.candidateId);
        if (entry === null) {
          money = null;
          seconds = null;
          continue;
        }
        if (seconds !== null) seconds += calledTimes * entry.typicalCall.seconds;
        if (money !== null) {
          const price = input.prices.get(member.candidate.providerRef);
          const perCall = price === undefined ? null : typicalCallMicros(entry.typicalCall, price);
          money = perCall === null ? null : money + calledTimes * perCall;
        }
      }
    }
  }
  return Object.freeze({
    mode: input.mode,
    moneyMicros: money === null ? null : Math.ceil(money),
    seconds: seconds === null ? null : Math.ceil(seconds)
  });
}
