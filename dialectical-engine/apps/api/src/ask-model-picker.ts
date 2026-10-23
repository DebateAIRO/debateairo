import type { Pool } from "pg";
import { z } from "zod";
import { mostOneRunMaySpendMicros, parseCostEnvelopeBasis, type CostEnvelopeBasis } from "@debateai/budget";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import type { DiscoveredPanelMember } from "@debateai/db";
import {
  LENGTH_ALLOWANCE_LIMITS, TypedDomainError, answerRoomTokens, guidedAllowanceTokens, type DebateRole, type LengthGuidanceStep,
  type ModelStrength
} from "@debateai/kernel";
import { mapEngineLargestReplyWordsCeiling, mapLargestReplyWordsCeiling } from "@debateai/map";
import { providerTargetPrice, type ProviderDiscoveryTarget } from "@debateai/providers";
import {
  answerJobTokenCeilings,
  BUNDLED_MODEL_SCORECARD_SOURCE_REF,
  DEBATE_SHAPE_FORMULA_VERSION,
  debateShapeSiteCounts,
  engineOfRun,
  lengthGuidanceAllowanceTokens,
  readBundledModelScorecard,
  readEngineVersion,
  readModelScorecard,
  type DebateShapeCeilingInput,
  type DebateShapePolicy,
  type DebateShapeSiteCounts,
  type EngineSettings,
  type LengthGuidance,
  type LengthGuidancePolicy,
  type ModelScorecardReadResult
} from "@debateai/register";
import {
  freeAnswerJobsFollowPaidSiteRule,
  freeCapsFollowPaidSiteRule,
  planCapsFollowPaidSiteRule,
  SCORECARD_FREE_ANSWER_UNSCORED,
  SCORECARD_FREE_CAPS_INVALID,
  SCORECARD_PLAN_CAPS_INVALID,
  type ReachableTarget,
  type RoleAssignment,
  type TargetPrice
} from "@debateai/scorecard";

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
 *    roles; an answer role the scorecard does not cover keeps the register's
 *    sealed refs — except as below). Paid plans S4b: on a site that sells plans
 *    (`plansSold`) a FREE ask's reachable targets are the Free roster's models
 *    only, so its seats, runner-ups and debate-role fallbacks all come from the
 *    Free roster (the owner's ruling of 3 October 2026); its ANSWER_WRITER and
 *    ANSWER_CHECKER take no fallback at all (the sealed refs are bound to no
 *    roster): a scored Free-roster model, or the ask is refused
 *    ASK_MODEL_CANDIDATE_UNAVAILABLE (S4b fix round 1);
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
 *
 * A21.3 fix rounds 1-2: BUDGET_TOO_SMALL says only what the picker established:
 * the debate's ESTIMATED cost — a deliberate over-estimate on the planned tree,
 * at the Economy strength (the best models under a cost cap, not the cheapest) —
 * is over the hosted per-run limit. It names no remedy (a Free asker cannot
 * change the tree depth) and no figure. The UI's banner clause
 * (apps/ui/lib/v3/requestFailure.ts, MODEL_BUDGET_TOO_SMALL) is a separate,
 * visitor-facing text that happens to read the same today.
 */
export const ASK_MODEL_REFUSALS = Object.freeze({
  BUDGET_TOO_SMALL: Object.freeze({
    code: "ASK_MODEL_STRENGTH_BUDGET_TOO_SMALL",
    message: "This debate would cost more than this site allows for one debate"
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

/**
 * Final review I3 — the sealed per-call answer bounds (`CallBound.tokenCeiling`)
 * the debate jobs' calls use, read once at boot (`readCallTokenCeilings` in
 * @debateai/register). The gateway's window wall adds the call's bound to its
 * prompt, so the picker adds each role's own.
 */
export interface CallTokenCeilings {
  /** Every debate call — positions, arguments, exchanges, the panel and reviews — runs under the JUDGE bound. */
  readonly judge: number;
  /** The answer writer's call: the SYNTHESIZER bound. */
  readonly synthesizer: number;
  /** The answer checker's call: the EVALUATOR bound. */
  readonly evaluator: number;
}

/** I3: each debate job's own answer bound, or a boot refusal when a bound would bound nothing. */
export function answerTokenCeilingsByRole(ceilings: CallTokenCeilings): Readonly<Record<DebateRole, number>> {
  for (const bound of [ceilings.judge, ceilings.synthesizer, ceilings.evaluator]) {
    if (!Number.isSafeInteger(bound) || bound < 1) throw new TypeError("ASK_MODEL_PICKER_CALL_TOKEN_CEILINGS_INVALID");
  }
  return Object.freeze({
    POSITION: ceilings.judge,
    SUPPORT_ATTACK: ceilings.judge,
    CROSS_EXCHANGE: ceilings.judge,
    JUDGE: ceilings.judge,
    REVIEWER: ceilings.judge,
    ANSWER_WRITER: ceilings.synthesizer,
    ANSWER_CHECKER: ceilings.evaluator
  });
}

/**
 * Debate shape (spec 2026-10-12 §3.3 step 8): the answer writer's call bound becomes max(sealed bound, the run's
 * answer length's writer bound), so the picker seats only writers whose window holds the longer answer. The map's
 * merge and choose calls are made by debaters (counted under POSITION, `expectedCallsByRoleFromBasis`) at the
 * receipt's map step bounds (ruling X1), so POSITION's bound becomes max(sealed bound, merge bound, choose bound):
 * a debater whose window cannot hold a merge would be refused by the gateway's window wall part-way through the
 * debate. Length guidance (spec 2026-10-15 §3.3): with the receipt's `length` member each role is then raised to the
 * allowance the runner sends it (`lengthGuidanceAllowanceTokens`), and on a shaped run POSITION also to the map's
 * (`mapLengthAllowanceTokens`). A receipt with neither member keeps the sealed table (the same object).
 * Engine redesign R2 (B10): with an engine-2 receipt JUDGE also holds the comparing judge's allowance and REVIEWER the
 * investigator's (the steps those calls are sent at).
 */
export function answerTokenCeilingsForBasis(
  ceilings: Readonly<Record<DebateRole, number>>,
  basis: Readonly<Record<string, unknown>>
): Readonly<Record<DebateRole, number>> {
  const shaped = admittedShapeOf(basis);
  const length = admittedLengthOf(basis);
  if (shaped === null && length === null) return ceilings;
  const withShape: Readonly<Record<DebateRole, number>> = shaped === null ? ceilings : {
    ...ceilings,
    POSITION: Math.max(ceilings.POSITION, shaped.shape.mapMergeBound, shaped.shape.mapChooseBound),
    ANSWER_WRITER: Math.max(ceilings.ANSWER_WRITER, shaped.shape.writerBound)
  };
  // Length guidance (spec 2026-10-15 §3.3): each role at the allowance the runner sends it (never below the row above).
  if (length === null) return Object.freeze({ ...withShape });
  const guided = Object.fromEntries((Object.keys(ROLE_LENGTH_STEPS) as DebateRole[]).map((role) =>
    [role, lengthGuidanceAllowanceTokens(length, ROLE_LENGTH_STEPS[role], withShape[role])])) as Record<DebateRole, number>;
  // A shaped run's map calls are made by debaters (POSITION): they ask the map's own allowance (Task 14, `guidedMapBound`).
  // Engine redesign R2 (B10): an engine-2 receipt's comparing judges are JUDGE calls and its investigations REVIEWER
  // calls (`expectedCallsByRoleFromBasis`), each at its own step's allowance (engine 1: today's table).
  const engine = admittedEngineOf(basis);
  const withEngine: Record<DebateRole, number> = engine === null ? guided : { ...guided,
    JUDGE: Math.max(guided.JUDGE, lengthGuidanceAllowanceTokens(length, "comparing_judge", withShape.JUDGE)),
    REVIEWER: Math.max(guided.REVIEWER, lengthGuidanceAllowanceTokens(length, "investigator", withShape.REVIEWER)) };
  return Object.freeze(shaped === null ? withEngine
    : { ...withEngine, POSITION: Math.max(withEngine.POSITION, mapLengthAllowanceTokens(length, withShape.POSITION, engine !== null)) });
}

/**
 * Length guidance (spec 2026-10-15 §3.3, §3.10): the most a map call asks with the row, from `todayTokens` (the bound it
 * is raised from): the map's thinking room + the runaway answer room of the largest reply any map contract can hold
 * (`mapLargestReplyWordsCeiling`), never below `todayTokens`, as the runner's `guidedMapBound` raises each map call. Shared
 * by the picker and the preview estimate. Engine redesign R3 (`engine`): under engine 2 a map call may be the answer
 * check, whose reasons are guided by `checkReason`; the largest of every engine-2 map contract's ceiling is priced
 * (`mapEngineLargestReplyWordsCeiling`), so the estimate never under-counts (spec §10). Engine 1: as before.
 */
export function mapLengthAllowanceTokens(length: LengthGuidance, todayTokens: number, engine = false): number {
  const targets = { targets: length.map, charactersPerWord: length.charactersPerWord };
  return guidedAllowanceTokens({ todayTokens, thinkingRoomTokens: length.thinkingRoom.map,
    answerRoomTokens: answerRoomTokens(engine ? mapEngineLargestReplyWordsCeiling(targets) : mapLargestReplyWordsCeiling(targets),
      length.runawayMultiplier, length.tokensPerWord),
    capTokens: LENGTH_ALLOWANCE_LIMITS.capTokens });
}

/** S2: the sealed money terms the picker's limits are cut from — the API's `CostEnvelopeGuard` policy. */
export type AskMoneyPolicy = Readonly<{
  perRunCeilingMicros: number;
  serveReserveBasisPoints?: number;
  serveOverrunBasisPoints?: number;
  perStoryCeilingMicros?: number;
  perStoryOverrunBasisPoints?: number;
}>;

export interface AskModelPickerSettings {
  /** Read once at boot: the sealed row (hosted) or the bundled file (local). */
  readonly scorecard: ModelScorecardReadResult;
  readonly mode: "HOSTED" | "LOCAL";
  /** Keyed by provider ref. A discovered target without an entry declares no level, no window, no price. */
  readonly targetFacts: ReadonlyMap<string, AskTargetFacts>;
  /** Hosted only; local mode has no money ceiling. */
  readonly perRunCeilingMicros: number | null;
  /** S2 (hosted): the money terms the picker's limits are cut from; absent = the per-run ceiling alone. */
  readonly moneyPolicy?: AskMoneyPolicy | null;
  /** S2 (hosted): the most one run may spend (`mostOneRunMaySpendMicros`), what an estimate the picker cannot make counts as. */
  readonly runMaximumMicros?: number | null;
  /** Final review I3: each debate job's sealed answer bound, which the picker adds to a typical call's input. */
  readonly answerTokenCeilings: Readonly<Record<DebateRole, number>>;
  /**
   * Paid plans S4b: the site sells plans (hosted, billing on). Only then is a Free ask held to Free's
   * own caps and to the Free roster; absent or false (billing off, local mode), nothing changes.
   */
  readonly plansSold?: boolean;
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

/**
 * Carry 16 (A20.3 review m4): THE one test of a hosted per-run money ceiling —
 * a positive safe integer of micros. The boot guard below and ask admission
 * (`evaluateAskAdmission` in ./index.ts) both ask it; each keeps its own failure.
 */
export function isUsablePerRunCeiling(micros: number | null): micros is number {
  return micros !== null && Number.isSafeInteger(micros) && micros >= 1;
}

export function askModelPickerSettings(input: Readonly<{
  scorecard: ModelScorecardReadResult;
  deploymentMode: "hosted" | "local";
  targets: readonly ProviderDiscoveryTarget[];
  perRunCeilingMicros: number | null;
  /** Final review I3: read once at boot, in both modes — the picker runs in both. */
  callTokenCeilings: CallTokenCeilings;
  /** S2 (hosted): the sealed money terms the picker's limits are cut from — B6b's `costEnvelopeRows.guardPolicy`. */
  moneyPolicy?: AskMoneyPolicy | null;
  /** S2 (hosted): billing is on — the site sells plans, so the scorecard must follow the owners' plan-cap rule. */
  billingEnabled?: boolean;
  /**
   * Debate shape (P2b Task 6, pre-flight PF-B22): the row IN FORCE (`debateShapeInForce`; absent or disabled = none).
   * Only the Free answer-job check reads it.
   */
  debateShapePolicy?: DebateShapePolicy | null;
  /** Length guidance (spec 2026-10-15 §3.10): the row, or null; only the Free answer-job check reads it. */
  lengthGuidancePolicy?: LengthGuidancePolicy | null;
  log?: (line: string) => void;
}>): AskModelPickerSettings {
  const hosted = input.deploymentMode === "hosted";
  // Carry 11 (A20.1 review M1): hosted always runs under sealed cost envelopes. A
  // missing or non-positive ceiling here would switch off the picker's step-down
  // and its BUDGET_TOO_SMALL refusal without a word, so boot refuses it instead.
  if (hosted && !isUsablePerRunCeiling(input.perRunCeilingMicros)) {
    throw new TypeError("ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED");
  }
  // Paid plans S2 (spec §2.6 item 6): the backstop of the publish-time check. A
  // hosted site that sells plans never boots with a scorecard that caps Free above
  // ECONOMY or a paid plan below BEST; refused, never overridden (the public
  // scorecard must say what the site does). Local mode and billing off: no plans, no rule.
  if (hosted && input.billingEnabled === true && input.scorecard.state === "VALID"
    && !planCapsFollowPaidSiteRule(input.scorecard.scorecard.pickerSettings.planStrengthCaps)) {
    throw new TypeError(SCORECARD_PLAN_CAPS_INVALID);
  }
  // Paid plans S4b (final review P3-I2): the same backstop for Free's own caps —
  // every role's Free money cap set, and at or below that role's Economy cap.
  if (hosted && input.billingEnabled === true && input.scorecard.state === "VALID"
    && !freeCapsFollowPaidSiteRule(input.scorecard.scorecard.pickerSettings)) {
    throw new TypeError(SCORECARD_FREE_CAPS_INVALID);
  }
  const moneyPolicy = !hosted ? null : input.moneyPolicy ?? Object.freeze({ perRunCeilingMicros: input.perRunCeilingMicros as number });
  if (moneyPolicy !== null && moneyPolicy.perRunCeilingMicros !== input.perRunCeilingMicros) {
    // One ceiling, two spellings: the boot passes the same policy both ways, so a mismatch is a composition defect.
    throw new TypeError("ASK_MODEL_PICKER_MONEY_POLICY_MISMATCH");
  }
  const answerTokenCeilings = answerTokenCeilingsByRole(input.callTokenCeilings);
  // Debate shape (P2b Task 6, pre-flight PF-B22): with a row in force a Free `detailed` answer asks the writer for up to
  // the row's largest writer bound, and Free's writer has no fallback; with the length row, the writer and the checker
  // ask up to the largest guided allowance any plan and answer length can ask (spec 2026-10-15 §3.10). Only this check
  // reads the two rows: `answerTokenCeilings` (the settings the picker seats with) keep the sealed bounds; a run's own
  // bounds come from its receipt (`answerTokenCeilingsForBasis`).
  const freeAnswerCeilings = answerJobTokenCeilings(
    { writer: answerTokenCeilings.ANSWER_WRITER, checker: answerTokenCeilings.ANSWER_CHECKER },
    input.debateShapePolicy ?? null, input.lengthGuidancePolicy ?? null);
  // Paid plans P4-E (Part 3b re-review M-4; ruling C4): the backstop of the publish-time
  // check. With billing on a Free ask's answer writer and checker take a scored Free-roster
  // model or none, so a scorecard under which no declared Free-roster model can take one of
  // them would refuse every Free question; boot refuses it instead, by the picker's own
  // eligibility over the declared targets and the sealed answer bounds.
  if (hosted && input.billingEnabled === true && input.scorecard.state === "VALID"
    && !freeAnswerJobsFollowPaidSiteRule({
      scorecard: input.scorecard.scorecard,
      targets: input.targets,
      freeRosterModelIds: PLAN_TIER_ROSTERS.free,
      answerTokenCeilingByRole: freeAnswerCeilings
    })) {
    throw new TypeError(SCORECARD_FREE_ANSWER_UNSCORED);
  }
  return Object.freeze({
    scorecard: input.scorecard,
    mode: hosted ? "HOSTED" : "LOCAL",
    targetFacts: askTargetFacts(input.targets),
    perRunCeilingMicros: hosted ? input.perRunCeilingMicros : null,
    moneyPolicy,
    runMaximumMicros: moneyPolicy === null ? null : mostOneRunMaySpendMicros(moneyPolicy),
    answerTokenCeilings,
    plansSold: hosted && input.billingEnabled === true,
    ...(input.log === undefined ? {} : { log: input.log })
  });
}

/**
 * The ledger composeAskModelPicker runs its two stages under: the boot's own (`Pick<BootCustody, "run" | "runSync">`
 * fits), or the admission loader's stage (side-by-side spec §13), whose `runSync` answers a promise.
 */
export type AskModelPickerBoot = Readonly<{
  run<T>(stage: string, operation: () => Promise<T>): Promise<T>;
  runSync<T>(stage: string, decision: () => T): T | Promise<T>;
}>;

/**
 * A20 / final review I5 — THE API'S TWO MODEL-PICKER BOOT STAGES, as one
 * function the boot ledger runs and a test can drive without Postgres.
 *
 *  - "model-scorecard": the scorecard in force, read once. Hosted: the sealed
 *    `modelScorecard` row at REGISTER_VERSION. Local: the bundled public file
 *    (scorecards/current.json). ABSENT or REFUSED never stops the boot — asks
 *    keep the plan rosters — and one line says which (`describeModelScorecard`).
 *    An engine version that cannot be read (ENGINE_VERSION_UNRESOLVED) does stop
 *    it, as this stage.
 *  - "model-picker": the per-role picker settings, asked only when that
 *    scorecard is VALID. Hosted: the per-run ceiling is the sealed cost
 *    envelope's, and a boot without a positive one is refused
 *    (ASK_MODEL_PICKER_PER_RUN_CEILING_REQUIRED). That is a synchronous decision,
 *    so it runs under the ledger's `runSync` (DL7-F7). The targets are the
 *    DECLARED ones: levels, windows and prices, no credential. The sealed
 *    answer bounds (final review I3) were read by their own earlier stage.
 *
 * `boot` is the API boot's own ledger (`installBootCustody`), so a failure in
 * either stage closes everything the boot holds and names the stage, exactly as
 * when these stages were written out in apps/api/src/main.ts. Side-by-side spec
 * §13: the per-version admission loader (./admission-settings.ts) hands its own
 * stage for both, which runs a decision through the ledger's awaited `run`, so
 * `runSync` may answer a promise. The two file locations default to the
 * engine's own manifest and bundled scorecard; only a test passes others.
 */
export async function composeAskModelPicker(input: Readonly<{
  boot: AskModelPickerBoot;
  pool: Pool;
  deploymentMode: "hosted" | "local";
  registerVersion: number;
  targets: readonly ProviderDiscoveryTarget[];
  perRunCeilingMicros: number | null;
  callTokenCeilings: CallTokenCeilings;
  /** S2 (hosted): the sealed money terms — passed to `askModelPickerSettings`. */
  moneyPolicy?: AskMoneyPolicy | null;
  /** S2 (hosted): billing is on — the plan-cap rule is checked at this stage. */
  billingEnabled?: boolean;
  /** Debate shape (P2b Task 6): the row in force, handed to `askModelPickerSettings`'s Free answer-job check. */
  debateShapePolicy?: DebateShapePolicy | null;
  /** Length guidance (spec 2026-10-15 §3.10): the row, or null; handed to `askModelPickerSettings`'s Free answer-job check. */
  lengthGuidancePolicy?: LengthGuidancePolicy | null;
  log: (line: string) => void;
  engineManifest?: URL;
  bundledScorecard?: URL;
}>): Promise<AskModelPickerSettings> {
  const modelScorecard = await input.boot.run("model-scorecard", async () => {
    const engineVersion = await readEngineVersion(input.engineManifest);
    return input.deploymentMode === "hosted"
      ? readModelScorecard(input.pool, input.registerVersion, engineVersion)
      : readBundledModelScorecard(engineVersion, input.bundledScorecard);
  });
  input.log(describeModelScorecard(modelScorecard, input.deploymentMode));
  return input.boot.runSync("model-picker", () => askModelPickerSettings({
    scorecard: modelScorecard,
    deploymentMode: input.deploymentMode,
    targets: input.targets,
    perRunCeilingMicros: input.perRunCeilingMicros,
    ...(input.moneyPolicy === undefined ? {} : { moneyPolicy: input.moneyPolicy }),
    ...(input.billingEnabled === undefined ? {} : { billingEnabled: input.billingEnabled }),
    ...(input.debateShapePolicy === undefined ? {} : { debateShapePolicy: input.debateShapePolicy }),
    ...(input.lengthGuidancePolicy === undefined ? {} : { lengthGuidancePolicy: input.lengthGuidancePolicy }),
    callTokenCeilings: input.callTokenCeilings,
    log: input.log
  }));
}

/**
 * The one start-up line saying which scorecard this deployment runs. Never the
 * refusal's detail, never the sourceRef's text (it can carry operator words).
 *
 * A20.4 review M1: a VALID scorecard's `source=` names what was READ, from its
 * sourceRef, not what the mode should have read; when the two differ the line
 * says so in plain words. ABSENT and REFUSED carry no sourceRef, so they name
 * where this mode looked.
 */
export function describeModelScorecard(
  result: ModelScorecardReadResult,
  deploymentMode: "hosted" | "local"
): string {
  const source = deploymentMode === "hosted" ? "register" : "bundled-file";
  if (result.state === "VALID") {
    const read = result.sourceRef === BUNDLED_MODEL_SCORECARD_SOURCE_REF ? "bundled-file" : "register";
    const wrongSource = read === source ? ""
      : ` (wrong source: ${deploymentMode} mode reads ${source === "register" ? "the register" : "the bundled file"})`;
    return `MODEL_SCORECARD state=VALID scorecard_version=${result.scorecard.scorecardVersion} source=${read}${wrongSource}`;
  }
  if (result.state === "REFUSED") {
    return `MODEL_SCORECARD state=REFUSED reason=${result.reason} source=${source} (asks keep the plan rosters)`;
  }
  return `MODEL_SCORECARD state=ABSENT source=${source} (asks keep the plan rosters)`;
}

/**
 * Today's order: the first discovered target serving each roster id, in roster
 * order (exactly what the roster filter seats), then every other healthy
 * target in discovery order. Paid plans S4b: with `rosterOnly`, only the
 * targets serving a roster model, in that same order — a Free ask on a site
 * that sells plans is seated, backed up and fallen back from its roster alone.
 */
export function reachableInTodaysOrder(
  discovered: readonly DiscoveredPanelMember[],
  rosterModelIds: readonly string[],
  facts: ReadonlyMap<string, AskTargetFacts>,
  rosterOnly = false
): readonly ReachableTarget[] {
  const rosterFirst = rosterModelIds.flatMap((modelId) => {
    const member = discovered.find((candidate) => candidate.model_id === modelId);
    return member === undefined ? [] : [member];
  });
  const seated = new Set(rosterFirst.map((member) => member.provider_ref));
  const ordered = [...rosterFirst, ...discovered.filter((member) => !seated.has(member.provider_ref))]
    .filter((member) => !rosterOnly || rosterModelIds.includes(member.model_id));
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

/** The strict reader's own refusal code (`parseCostEnvelopeBasis`); any other error is not a receipt refusal. */
const COST_ENVELOPE_UNRESOLVED = "RUN_COST_ENVELOPE_UNRESOLVED" as const;

function malformedDebateShape(reason: string): TypedDomainError {
  return new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, `The admitted structural basis carries a malformed debate shape: ${reason}`);
}

/**
 * Debate shape (spec 2026-10-12 §3.6, PF7): the run's shaped receipt, read ONLY through the strict receipt parser
 * (`parseCostEnvelopeBasis`), never through a loose reader of this module's own. A receipt is shaped when it carries
 * a shape member OR names the shape formula, so a shape-formula receipt with its member missing is refused by the
 * parser, never priced as today's. A basis with neither is today's receipt (null). The parser's reason is kept.
 * The ONE shared reader (PF7): the picker and the preview estimate (`preview-budget-estimate.ts`) both read through it.
 */
export function admittedShapeOf(basis: Readonly<Record<string, unknown>>): Readonly<{
  shape: DebateShapeCeilingInput;
  counts: DebateShapeSiteCounts;
}> | null {
  if (basis.shape === undefined && basis.formula_version !== DEBATE_SHAPE_FORMULA_VERSION) return null;
  let parsed: CostEnvelopeBasis;
  try {
    parsed = parseCostEnvelopeBasis(basis);
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === COST_ENVELOPE_UNRESOLVED) throw malformedDebateShape(error.message);
    throw error;
  }
  const shape = parsed.shape;
  if (shape === undefined) throw malformedDebateShape("the receipt carries no shape member");
  return Object.freeze({ shape, counts: debateShapeSiteCounts(shape, parsed.depth) });
}

function malformedEngine(reason: string): TypedDomainError {
  return new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, `The admitted structural basis carries a malformed engine member: ${reason}`);
}

/**
 * Engine redesign R2 (INTERFACE §3.4): the run's engine-2 settings, read ONLY through the strict receipt parser
 * (`parseCostEnvelopeBasis`, as `admittedShapeOf`, PF7) and the one engine reader (`engineOfRun`). A receipt without
 * the `engine` member is engine 1 (null): today's split, byte for byte. A receipt whose member the parser refuses is
 * refused, never priced as engine 1. The ONE shared reader: the picker and the preview estimate both read through it.
 */
export function admittedEngineOf(basis: Readonly<Record<string, unknown>>): EngineSettings | null {
  if (basis.engine === undefined) return null;
  let parsed: CostEnvelopeBasis;
  try {
    parsed = parseCostEnvelopeBasis(basis);
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === COST_ENVELOPE_UNRESOLVED) throw malformedEngine(error.message);
    throw error;
  }
  const engine = engineOfRun(parsed);
  if (engine.engine !== 2) throw malformedEngine("the receipt carries no engine member");
  return engine;
}

function malformedLengthGuidance(reason: string): TypedDomainError {
  return new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, `The admitted structural basis carries malformed length guidance: ${reason}`);
}

/**
 * Length guidance (spec 2026-10-15 §3.1, §3.10): the run's frozen numbers, read ONLY through the strict receipt parser,
 * as `admittedShapeOf` reads the shape; null for a receipt without the member. Shared by the picker and the preview estimate.
 */
export function admittedLengthOf(basis: Readonly<Record<string, unknown>>): LengthGuidance | null {
  if (basis.length === undefined) return null;
  let parsed: CostEnvelopeBasis;
  try {
    parsed = parseCostEnvelopeBasis(basis);
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === COST_ENVELOPE_UNRESOLVED) throw malformedLengthGuidance(error.message);
    throw error;
  }
  return parsed.length ?? null;
}

/** Which length step each picker role's calls are (the map's calls are POSITION's: their allowance is LG-C2's, Task 14). */
const ROLE_LENGTH_STEPS = Object.freeze({
  POSITION: "opening", SUPPORT_ATTACK: "pros_cons", CROSS_EXCHANGE: "cross_exchange", JUDGE: "judge_panel",
  REVIEWER: "reviewer", ANSWER_WRITER: "answer_writer", ANSWER_CHECKER: "answer_checker"
} as const satisfies Readonly<Record<DebateRole, LengthGuidanceStep>>);

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
 * With a shape receipt (debate shape): POSITION = answers + map sites (the debaters also write the map),
 * CROSS_EXCHANGE = cross_nodes; SUPPORT_ATTACK is the rest of the author sites, as before.
 * With an engine-2 receipt (engine redesign R2, INTERFACE §3.4): JUDGE also counts the comparing judges, REVIEWER the
 * investigations at their cap (they stand in for the review a point lacked), POSITION the map's answer check (map
 * sites are the debaters'); `sites` is frozen on the receipt at admission (R1d).
 */
export function expectedCallsByRoleFromBasis(
  basis: Readonly<Record<string, unknown>>
): Readonly<Record<DebateRole, number>> {
  const parsed = admittedStructureSchema.safeParse(basis);
  if (!parsed.success) {
    throw new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, "The admitted structural basis carries no call-site split");
  }
  const { panel_size: panelSize, call_sites: sites, serve_leg: serveLeg } = parsed.data;
  const shaped = admittedShapeOf(basis);
  const engineSites = admittedEngineOf(basis)?.sites ?? null;
  const positions = shaped === null ? panelSize : shaped.shape.answers + shaped.counts.mapSites;
  const crossExchange = shaped !== null ? shaped.counts.crossNodes : panelSize >= 2 ? panelSize * (panelSize - 1) : 0;
  const supportAttack = sites.author - positions - crossExchange;
  const perSynthesisRole = serveLeg.synthesis_loop_sites / SYNTHESIS_ROLES.length;
  if (supportAttack < 0 || !Number.isInteger(perSynthesisRole)) {
    throw new TypedDomainError(ASK_MODEL_ASSIGNMENT_INVALID, "The admitted structural basis does not split into roles");
  }
  return Object.freeze({
    POSITION: positions + (engineSites?.answerCheck ?? 0),
    SUPPORT_ATTACK: supportAttack,
    CROSS_EXCHANGE: crossExchange,
    JUDGE: sites.panel + (engineSites?.comparingJudges ?? 0),
    REVIEWER: sites.reviewer + (engineSites?.investigations ?? 0),
    ANSWER_WRITER: perSynthesisRole,
    ANSWER_CHECKER: perSynthesisRole
  });
}
