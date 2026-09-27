import { z } from "zod";
import type { DiscoveredPanelMember } from "@debateai/db";
import { TypedDomainError, type DebateRole, type ModelStrength } from "@debateai/kernel";
import { providerTargetPrice, type ProviderDiscoveryTarget } from "@debateai/providers";
import type { ModelScorecardReadResult } from "@debateai/register";
import type { ReachableTarget, RoleAssignment, TargetPrice } from "@debateai/scorecard";

/**
 * A20 — WHAT ASK ADMISSION HANDS THE MODEL PICKER, stated once.
 *
 * The picker (`@debateai/scorecard` `pickRoleAssignment`) is pure; everything
 * it needs from THIS deployment is built here from facts admission already
 * holds, and nothing here decides a seat:
 *
 *  - REACHABLE TARGETS in today's order — the plan roster's members first, in
 *    roster order (what the roster filter seats today), then every other
 *    healthy discovered target in discovery order — so a role the scorecard
 *    does not cover falls back to the model today's roster would seat (debate
 *    roles; the answer roles keep their sealed refs);
 *  - SEAT DEMAND — how many debaters the plan seats (its roster's LENGTH,
 *    capped by the distinct makers reachable) and a seat per debater in every
 *    debate role; one each for the two answer roles;
 *  - EXPECTED CALLS per role — read off the structural basis admission already
 *    computed (`computeStructuralCeilingBasis`), one call per call site, on the
 *    PLANNED tree. When the picker seats fewer debaters than planned, admission
 *    re-sizes the run ceiling to the smaller admitted tree, but the estimate (and
 *    any step-down it caused) stays on the planned, larger tree: it over-estimates
 *    on purpose, in the safe direction;
 *  - the configured PRICES (keyed by provider ref), and each target's declared
 *    thinking levels and context window, from PROVIDER_DISCOVERY_TARGETS_JSON.
 *
 * With no VALID scorecard none of this runs: admission keeps the plan roster
 * filter byte for byte (`evaluateAskAdmission` in ./index.ts).
 */

/** An engine fault, not an ask refusal: the admitted basis or the picker broke a promise. */
export const ASK_MODEL_ASSIGNMENT_INVALID = "ASK_MODEL_ASSIGNMENT_INVALID" as const;

/**
 * The two picker refusals as the ASKER reads them: constant sentences. The
 * picker's own detail can carry the per-run ceiling — a capacity oracle (I6) —
 * so it reaches only the operator's log.
 */
export const ASK_MODEL_REFUSALS = Object.freeze({
  BUDGET_TOO_SMALL: Object.freeze({
    code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL",
    message: "Even the Economy model strength costs more than one debate may spend here; a smaller tree depth costs less"
  }),
  NO_REACHABLE_CANDIDATE: Object.freeze({
    code: "ASK_MODEL_CANDIDATE_UNAVAILABLE",
    message: "No model is reachable right now for one of this debate's jobs"
  })
});

export interface AskTargetFacts {
  readonly thinkingLevels: readonly string[];
  readonly contextWindowTokens: number | null;
  readonly price: TargetPrice | null;
}

export interface AskModelPickerSettings {
  /** Read once at boot: the sealed row (hosted) or the bundled file (local). */
  readonly scorecard: ModelScorecardReadResult;
  readonly mode: "HOSTED" | "LOCAL";
  /** Keyed by provider ref. A discovered target without an entry declares no level, no window, no price. */
  readonly targetFacts: ReadonlyMap<string, AskTargetFacts>;
  /** Hosted only; local mode has no money ceiling. */
  readonly perRunCeilingMicros: number | null;
  /** Operator lines (stderr in production): picker notes, estimates, refusal details. */
  readonly log?: (line: string) => void;
}

export interface AdmittedModelAssignment {
  readonly assignment: RoleAssignment;
  readonly appliedStrength: ModelStrength;
  readonly steppedDown: boolean;
}

const NO_LEVELS: readonly string[] = Object.freeze([]);

export function askTargetFacts(targets: readonly ProviderDiscoveryTarget[]): ReadonlyMap<string, AskTargetFacts> {
  return new Map(targets.map((target) => {
    const price = providerTargetPrice(target);
    return [target.providerRef, Object.freeze({
      thinkingLevels: Object.freeze([...(target.thinkingLevels ?? NO_LEVELS)]),
      contextWindowTokens: target.contextWindowTokens ?? null,
      price: price === null ? null : Object.freeze({
        inputMicrosPerMTok: price.inputMicrosPerMillionTokens,
        outputMicrosPerMTok: price.outputMicrosPerMillionTokens
      })
    })] as const;
  }));
}

/** The configured prices, keyed by provider ref; a target without a price is absent. */
export function targetPricesOf(facts: ReadonlyMap<string, AskTargetFacts>): ReadonlyMap<string, TargetPrice> {
  return new Map([...facts].flatMap(([providerRef, fact]) => fact.price === null ? [] : [[providerRef, fact.price] as const]));
}

export function askModelPickerSettings(input: Readonly<{
  scorecard: ModelScorecardReadResult;
  deploymentMode: "hosted" | "local";
  targets: readonly ProviderDiscoveryTarget[];
  perRunCeilingMicros: number | null;
  log?: (line: string) => void;
}>): AskModelPickerSettings {
  const hosted = input.deploymentMode === "hosted";
  // Carry 11 (A20.1 review M1): hosted always runs under sealed cost envelopes. A
  // missing or non-positive ceiling here would switch off the picker's step-down
  // and its BUDGET_TOO_SMALL refusal without a word, so boot refuses it instead.
  const ceiling = input.perRunCeilingMicros;
  if (hosted && (ceiling === null || !Number.isSafeInteger(ceiling) || ceiling < 1)) {
    throw new TypeError("ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED");
  }
  return Object.freeze({
    scorecard: input.scorecard,
    mode: hosted ? "HOSTED" : "LOCAL",
    targetFacts: askTargetFacts(input.targets),
    perRunCeilingMicros: hosted ? input.perRunCeilingMicros : null,
    ...(input.log === undefined ? {} : { log: input.log })
  });
}

/** The one start-up line saying which scorecard this deployment runs. Never the refusal's detail. */
export function describeModelScorecard(
  result: ModelScorecardReadResult,
  deploymentMode: "hosted" | "local"
): string {
  const source = deploymentMode === "hosted" ? "register" : "bundled-file";
  if (result.state === "VALID") {
    return `MODEL_SCORECARD state=VALID scorecard_version=${result.scorecard.scorecardVersion} source=${source}`;
  }
  if (result.state === "REFUSED") {
    return `MODEL_SCORECARD state=REFUSED reason=${result.reason} source=${source} (asks keep the plan rosters)`;
  }
  return `MODEL_SCORECARD state=ABSENT source=${source} (asks keep the plan rosters)`;
}

/**
 * Today's order: the first discovered target serving each roster id, in roster
 * order (exactly what the roster filter seats), then every other healthy
 * target in discovery order.
 */
export function reachableInTodaysOrder(
  discovered: readonly DiscoveredPanelMember[],
  rosterModelIds: readonly string[],
  facts: ReadonlyMap<string, AskTargetFacts>
): readonly ReachableTarget[] {
  const rosterFirst = rosterModelIds.flatMap((modelId) => {
    const member = discovered.find((candidate) => candidate.model_id === modelId);
    return member === undefined ? [] : [member];
  });
  const seated = new Set(rosterFirst.map((member) => member.provider_ref));
  const ordered = [...rosterFirst, ...discovered.filter((member) => !seated.has(member.provider_ref))];
  return Object.freeze(ordered.map((member) => {
    const fact = facts.get(member.provider_ref);
    return Object.freeze({
      providerRef: member.provider_ref,
      maker: member.maker,
      modelId: member.model_id,
      thinkingLevels: fact?.thinkingLevels ?? NO_LEVELS,
      contextWindowTokens: fact?.contextWindowTokens ?? null
    });
  }));
}

/** The plan decides how many debaters; the reachable makers bound it. */
export function debaterSeatCount(reachable: readonly ReachableTarget[], planSeats: number): number {
  return Math.min(planSeats, new Set(reachable.map((target) => target.maker)).size);
}

/** A seat per debater in every debate role (none of them at one debater); one per answer role. */
export function seatDemandForDebaters(debaters: number): Readonly<Record<DebateRole, number>> {
  // Carry 11 (A20.1 review M2): "no debaters, but a writer and a checker" is not a
  // debate. Admission refuses zero reachable makers before it gets here; this
  // mirrors the basis schema's positive `panel_size`.
  if (!Number.isSafeInteger(debaters) || debaters < 1) {
    throw new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, "The seat demand needs at least one debater");
  }
  const perDebater = debaters >= 2 ? debaters : 0;
  return Object.freeze({
    POSITION: debaters,
    SUPPORT_ATTACK: perDebater,
    CROSS_EXCHANGE: perDebater,
    JUDGE: perDebater,
    REVIEWER: perDebater,
    ANSWER_WRITER: 1,
    ANSWER_CHECKER: 1
  });
}

const admittedStructureSchema = z.object({
  panel_size: z.number().int().positive(),
  call_sites: z.object({
    author: z.number().int().nonnegative(),
    panel: z.number().int().nonnegative(),
    reviewer: z.number().int().nonnegative(),
    serve: z.number().int().nonnegative()
  }),
  serve_leg: z.object({ synthesis_loop_sites: z.number().int().nonnegative() })
});

const SYNTHESIS_ROLES = Object.freeze(["ANSWER_WRITER", "ANSWER_CHECKER"] as const);

/**
 * Expected calls per role, one per call site, from the basis admission pinned.
 * Mapping (panelSize = debaters):
 *   POSITION       = panelSize
 *   CROSS_EXCHANGE = panelSize × (panelSize − 1), 0 at one debater
 *   SUPPORT_ATTACK = call_sites.author − POSITION − CROSS_EXCHANGE
 *   JUDGE          = call_sites.panel
 *   REVIEWER       = call_sites.reviewer
 *   ANSWER_WRITER  = ANSWER_CHECKER = serve_leg.synthesis_loop_sites ÷ 2
 *                    (SERVE_LEG requires the two round bounds to be equal)
 */
export function expectedCallsByRoleFromBasis(
  basis: Readonly<Record<string, unknown>>
): Readonly<Record<DebateRole, number>> {
  const parsed = admittedStructureSchema.safeParse(basis);
  if (!parsed.success) {
    throw new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, "The admitted structural basis carries no call-site split");
  }
  const { panel_size: panelSize, call_sites: sites, serve_leg: serveLeg } = parsed.data;
  const crossExchange = panelSize >= 2 ? panelSize * (panelSize - 1) : 0;
  const supportAttack = sites.author - panelSize - crossExchange;
  const perSynthesisRole = serveLeg.synthesis_loop_sites / SYNTHESIS_ROLES.length;
  if (supportAttack < 0 || !Number.isInteger(perSynthesisRole)) {
    throw new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, "The admitted structural basis does not split into roles");
  }
  return Object.freeze({
    POSITION: panelSize,
    SUPPORT_ATTACK: supportAttack,
    CROSS_EXCHANGE: crossExchange,
    JUDGE: sites.panel,
    REVIEWER: sites.reviewer,
    ANSWER_WRITER: perSynthesisRole,
    ANSWER_CHECKER: perSynthesisRole
  });
}
