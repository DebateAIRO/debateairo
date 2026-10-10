/**
 * The private preview's start-of-debate money check (owner's rule, 2026-09-28: never stop a debate
 * half-way; ESTIMATE before it starts, with a tolerance, not a worst case).
 *
 * Plain words: before a preview debate is created, the app works out the model calls it will make
 * (every call site with the repeat attempts the basis allows, the answer loop, the story with the
 * storyteller's one repair, the runner's health checks each time it picks the debate up, this ask's
 * own health checks, and the one retry of a call the gate proved unbilled), puts each call on the
 * model that makes it (so each gate is charged only for its own models' calls), prices each call at
 * an AVERAGE call of that kind by that model (4,000 tokens in and 1,200 out until the app has
 * measured at least 20 of its own such calls, then the measured average) at the row's list price
 * today, adds 15%, adds what the gate may hold at once for calls in flight (its concurrency limit x
 * its largest reservation), and holds back the same figure for every earlier preview debate that has
 * not finished (a debate still writing its story: the story's calls). One ask at a time is estimated
 * and started (the admission lock), so two asks never both count the same money. How a call is
 * priced is ONE switch (previewEstimatePricer, PREVIEW_ESTIMATE_PRICING_MODE).
 * Then it asks the gate what is left of today's team money and calls.
 * - Too little money or too few calls left: the existing daily refusal ("today's limit is used up"),
 *   retry at the gate's reset (midnight in Bucharest).
 * - The gate cannot be asked, is halted, not yet active, closed for today, does not serve one of the
 *   debate's models, or the settings are faulty: an existing "a model is not available right now"
 *   refusal, retry in about a minute.
 * Either way the debate is not started at all. (A preview ask cannot wait in the waiting line yet:
 * the line, its waker and its start check exist only with the hosted room, `askRoomComposition` in
 * apps/api/src/main.ts, which the preview, in local mode, never builds.)
 *
 * Today there is ONE gate (the config's `budget_socket`), serving every reviewed DeepInfra row.
 * Each row maps to its gate by `previewGateKeyOf`; a later per-provider socket map adds keys there
 * and one port per key in `PreviewBudgetGateSettings.remaining`, without changing the estimate.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  createPreviewRemainingRpcPort,
  lengthRetryTokenCeiling,
  PREVIEW_GLM_GENERATION_TOKEN_FLOOR,
  PREVIEW_MODEL_ROWS,
  PREVIEW_REQUEST_BODY_MAX_BYTES,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  previewCallBound,
  previewChargedInputTokens,
  previewModelRow,
  previewModelRowForRef,
  type PreviewGateRemaining,
  type PreviewModelRow,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { readStoryPolicyFromRegister, readStructuralCeilingPolicyInputs, readSynthesisRoleControls } from "@debateai/register";
import type { Pool, PoolClient } from "pg";
import { expectedCallsByRoleFromBasis } from "./ask-model-picker.js";

/**
 * The next midnight in Europe/Bucharest after `now` (DST-aware): the instant the gate's day, and so
 * its pot and call count, resets. Romania changes clocks at 03:00/04:00 local time, never at
 * midnight, so every local midnight exists exactly once; the offset (+02:00 or +03:00) is the one
 * in force AT that midnight, found by checking which candidate formats back to 00:00 local.
 */
const BUCHAREST_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});
function bucharestParts(instant: Date): Readonly<Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>> {
  const parts = Object.fromEntries(BUCHAREST_PARTS.formatToParts(instant)
    .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}
const BUCHAREST_WINTER_OFFSET_HOURS = 2;
const BUCHAREST_SUMMER_OFFSET_HOURS = 3;
const BUCHAREST_UTC_OFFSET_HOURS: readonly number[] = Object.freeze([BUCHAREST_WINTER_OFFSET_HOURS, BUCHAREST_SUMMER_OFFSET_HOURS]);
export function nextBucharestMidnight(now: Date): Date {
  if (!Number.isFinite(now.getTime())) throw new TypeError("PREVIEW_CLOCK_INVALID");
  const today = bucharestParts(now);
  // Bucharest is UTC+2 in winter and UTC+3 in summer: tomorrow's local midnight is one of the two.
  for (const offsetHours of BUCHAREST_UTC_OFFSET_HOURS) {
    const candidate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1) - offsetHours * 3_600_000);
    const local = bucharestParts(candidate);
    if (local.hour === 0 && local.minute === 0 && local.second === 0 && candidate.getTime() > now.getTime()) return candidate;
  }
  throw new TypeError("PREVIEW_BUCHAREST_MIDNIGHT_UNRESOLVED");
}

/**
 * The preview's daily refusal: the product's existing daily code (429, the localized "today's
 * limit is used up" sentence), carrying the gate's own reset instant for `Retry-After`. Used only
 * when money or calls fall short.
 */
export class PreviewDailyLimitRefusal extends TypedDomainError {
  readonly retryAt: Date;
  constructor(message: string, retryAt: Date) {
    super("DAILY_COST_ENVELOPE_REACHED", message);
    this.retryAt = retryAt;
  }
}

/** How long a "not available right now" refusal asks the caller to wait. */
const PREVIEW_UNAVAILABLE_RETRY_MS = 60_000;
/**
 * The existing ask refusal whose localized sentence says a model the debate needs cannot be
 * reached right now, retry later (apps/ui requestFailure MODEL_UNAVAILABLE). Its public message is
 * this fixed sentence; the internal reason goes only to the operator log.
 */
export const PREVIEW_UNAVAILABLE_CODE = "ASK_MODEL_CANDIDATE_UNAVAILABLE" as const;
const PREVIEW_UNAVAILABLE_MESSAGE = "A model this debate needs cannot be reached right now. Please try again in a minute.";
export class PreviewGateUnavailableRefusal extends TypedDomainError {
  readonly retryAt: Date;
  constructor(retryAt: Date) {
    super(PREVIEW_UNAVAILABLE_CODE, PREVIEW_UNAVAILABLE_MESSAGE);
    this.retryAt = retryAt;
  }
}

/** The gates the preview has; today only the DeepInfra gate on `budget_socket`. */
export type PreviewGateKey = "deepinfra";

/** The estimate's margin on calls and money: x 1.15 (the owner's rule, 2026-09-28). */
export const PREVIEW_ESTIMATE_MARGIN_NUMERATOR = 115n;
export const PREVIEW_ESTIMATE_MARGIN_DENOMINATOR = 100n;
/**
 * The calibrated estimate's starting point: one call takes in 4,000 tokens and gives back 1,200, for
 * every kind of call and every model, until the app has measured enough of its own calls.
 */
export const PREVIEW_ESTIMATE_DEFAULT_INPUT_TOKENS = 4_000n;
export const PREVIEW_ESTIMATE_DEFAULT_OUTPUT_TOKENS = 1_200n;
/**
 * A measured average replaces the default once the app has recorded at least this many calls of
 * that kind by that model within the window. 20 keeps one unusually long or short call from moving
 * the average much (one outlier shifts it by at most 1/20), and is reached after a few debates.
 */
export const PREVIEW_CALIBRATION_MIN_SAMPLES = 20;
/** Only calls recorded within this many days count: older calls ran on older prompts. */
export const PREVIEW_CALIBRATION_WINDOW_DAYS = 14;
/**
 * The strict upper bound's input side (STRICT_BOUND mode only, 6f62b6ba3): no per-call-type cap on a
 * prompt's size exists in the engine's code, so the one hard ceiling is the guarded fetch's: a body
 * above 256 KiB is refused before it is sent, and the gate reserves (body bytes + 2048) x the input
 * price. A health check's body is the fixed one-line probe, well under 1 KiB.
 */
export const PREVIEW_STRICT_INPUT_TOKENS_PER_CALL = previewChargedInputTokens(PREVIEW_REQUEST_BODY_MAX_BYTES);
const PREVIEW_PROBE_BODY_MAX_BYTES = 1024;
export const PREVIEW_STRICT_PROBE_INPUT_TOKENS = previewChargedInputTokens(PREVIEW_PROBE_BODY_MAX_BYTES);
/**
 * Review finding 3: a runner restart (a crash, a deploy) after the claim lapses re-claims the debate
 * and health-checks its whole panel again; nothing in the engine bounds how often that happens. The
 * estimate allows this many such re-claims per debate on top of the cooldown pickups.
 */
const PREVIEW_ESTIMATE_RESTART_PICKUPS = 2;
/** More unfinished preview debates than this is itself a fault: refused as unavailable. */
const PREVIEW_UNFINISHED_RUNS_MAX = 64;
/**
 * Review finding 4: a debate whose answer is served but whose story is not yet written is still
 * spending (the story runs after the work item is DONE). It is held while its latest model call
 * finished within this window: longer than any gap between two calls of a live story (one call's
 * deadline plus the unbilled retry's cooldown), so a story that died without a row stops holding.
 */
const PREVIEW_STORY_HOLD_WINDOW_SECONDS = 3600;

/** A panel member as admission and the run row hold it. */
export type PreviewPanelMember = Readonly<{ provider_ref: string; model_id: string }>;
/**
 * An earlier preview debate that has not finished: its admitted basis and panel, and whether it is
 * still debating (a READY or CLAIMED job) or only writing its story (answer served, no story yet).
 */
export type PreviewUnfinishedRun = Readonly<{
  basis: Readonly<Record<string, unknown>>; panel: readonly PreviewPanelMember[]; phase?: "DEBATE" | "STORY";
}>;

/**
 * The max_tokens each kind of call sends on the preview, before its row's own bound clamps it:
 * previewCallBound's ceiling (the register's bound, at least the generation floor) for every
 * one-attempt debate call; the storyteller's first attempt at its ceiling and its second at the
 * length-retry ceiling; the story checker at its ceiling. Only the STRICT_BOUND mode prices with it.
 */
export type PreviewCallOutputTokens = Readonly<{ debate: number; storyteller: number; storytellerRetry: number; storyChecker: number }>;

/** The register's four roles as model ids; the story pair is null when the register has no story. */
export type PreviewRoleModels = Readonly<{
  answerWriter: string; answerChecker: string; storyteller: string | null; storyChecker: string | null;
}>;
function roleModelList(roles: PreviewRoleModels): readonly string[] {
  return [roles.answerWriter, roles.answerChecker,
    ...(roles.storyteller === null ? [] : [roles.storyteller]), ...(roles.storyChecker === null ? [] : [roles.storyChecker])];
}

/**
 * The kinds of call one debate makes, as the estimate prices them. UNBILLED_RETRY is owner ruling 5's
 * one retry of a call the gate proved unbilled: it counts against the gate's calls and costs nothing.
 */
export type PreviewCallType = "DEBATE" | "STORYTELLER" | "STORYTELLER_RETRY" | "STORY_CHECKER" | "PROBE" | "UNBILLED_RETRY";
export type PreviewBilledCallType = Exclude<PreviewCallType, "UNBILLED_RETRY">;

/**
 * The app's own recorded usage of recent preview calls (ledger.model_spend), per model and kind:
 * DEBATE from the debate's charges (spend_source RUN), STORY from the story's (spend_source STORY).
 * Health checks are never recorded there and always use the default.
 */
export type PreviewMeasuredBucket = "DEBATE" | "STORY";
export type PreviewMeasuredCallUsage = readonly Readonly<{
  model: string; bucket: PreviewMeasuredBucket; calls: number; inputTokens: bigint; outputTokens: bigint;
}>[];

/** What admission needs to ask the gate(s); built once at boot from the preview config and the register. */
export type PreviewBudgetGateSettings = Readonly<{
  /** One read-only remaining port per gate. */
  remaining: Readonly<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>>;
  /** The register's roles (answer writer and checker, storyteller and story checker), as model ids. */
  roleModels: PreviewRoleModels;
  /** The same roles as provider refs; the runner health-checks those not on the panel at every pickup. */
  roleProviderRefs: readonly string[];
  /** Rounds the verdict story may run: per round the storyteller twice (one repair) and the story checker once. */
  storyRounds: number;
  /** The max_tokens of each kind of call (see PreviewCallOutputTokens). */
  callOutputTokens: PreviewCallOutputTokens;
  /** The models of the targets the API health-checks at ask time, paid through the gate even when the ask is refused. */
  askProbeModelIds: readonly string[];
  /** register runDeathPolicy.max_cooldown_holds_per_run: a debate is picked up at most 1 + this many times by cooldown. */
  maxCooldownHoldsPerRun: number;
  /** Earlier preview debates that have not finished (see PREVIEW_UNFINISHED_RUNS_SQL). */
  readUnfinishedRuns: () => Promise<readonly PreviewUnfinishedRun[]>;
  /** The app's recorded usage of recent preview calls (see PREVIEW_MEASURED_USAGE_SQL); absent: the defaults. */
  readMeasuredCallUsage?: () => Promise<PreviewMeasuredCallUsage>;
  /**
   * Review finding 2: the preview's one admission lock. Taken before the estimate reads the gate and
   * the unfinished debates, released by submit once the new debate's job is queued, so a second ask
   * estimates only after the first debate is held. Absent in pure tests.
   */
  openAdmissionLock?: () => PreviewAdmissionLock;
}>;

/** The gate a reviewed model's calls go through, or undefined for a model the preview never calls. */
export function previewGateKeyOf(model: string): PreviewGateKey | undefined {
  return previewModelRow(model) === undefined ? undefined : "deepinfra";
}

/** One call at a row's list price: its input at the input price, its output clamped to the row's own bound. */
export function previewCallNanoUsd(row: PreviewModelRow, inputTokens: bigint, outputTokens: number | bigint): bigint {
  const output = BigInt(outputTokens);
  const bound = BigInt(row.outputBound);
  return inputTokens * row.inputNanoUsdPerToken + (output < bound ? output : bound) * row.outputNanoUsdPerToken;
}

const ceilDiv = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator - 1n) / denominator;
const withMargin = (value: bigint): bigint => ceilDiv(value * PREVIEW_ESTIMATE_MARGIN_NUMERATOR, PREVIEW_ESTIMATE_MARGIN_DENOMINATOR);
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const wholeNumber = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * The average tokens of one call of `type` by `model`: the app's own measured average (rounded up)
 * once it has PREVIEW_CALIBRATION_MIN_SAMPLES such calls, else the default 4,000 in / 1,200 out.
 */
export function previewCallAverage(model: string, type: PreviewBilledCallType, measured: PreviewMeasuredCallUsage):
  Readonly<{ inputTokens: bigint; outputTokens: bigint; measured: boolean }> {
  const bucket: PreviewMeasuredBucket | null = type === "DEBATE" ? "DEBATE" : type === "PROBE" ? null : "STORY";
  const sample = bucket === null ? undefined : measured.find((entry) => entry.model === model && entry.bucket === bucket);
  if (sample === undefined || sample.calls < PREVIEW_CALIBRATION_MIN_SAMPLES) {
    return Object.freeze({ inputTokens: PREVIEW_ESTIMATE_DEFAULT_INPUT_TOKENS, outputTokens: PREVIEW_ESTIMATE_DEFAULT_OUTPUT_TOKENS, measured: false });
  }
  const calls = BigInt(sample.calls);
  return Object.freeze({ inputTokens: ceilDiv(sample.inputTokens, calls), outputTokens: ceilDiv(sample.outputTokens, calls), measured: true });
}

/** The price of one call of `type` on `row`, in nano-USD (never asked for an unbilled retry). */
export type PreviewCallPricer = (row: PreviewModelRow, type: PreviewBilledCallType) => bigint;

/** CALIBRATED_ESTIMATE: the average call of that kind by that model (previewCallAverage) at the row's list price today. */
export function calibratedEstimatePricer(measured: PreviewMeasuredCallUsage): PreviewCallPricer {
  return (row, type) => {
    const average = previewCallAverage(row.model, type, measured);
    return previewCallNanoUsd(row, average.inputTokens, average.outputTokens);
  };
}
/**
 * STRICT_BOUND (6f62b6ba3): every call at its most, input at the largest body the gate accepts,
 * output at the max_tokens that call sends, clamped to the row; a health check at its fixed body and
 * the generation floor.
 */
export function strictUpperBoundPricer(output: PreviewCallOutputTokens): PreviewCallPricer {
  const sent: Readonly<Record<Exclude<PreviewBilledCallType, "PROBE">, number>> = {
    DEBATE: output.debate, STORYTELLER: output.storyteller, STORYTELLER_RETRY: output.storytellerRetry, STORY_CHECKER: output.storyChecker
  };
  return (row, type) => type === "PROBE"
    ? previewCallNanoUsd(row, PREVIEW_STRICT_PROBE_INPUT_TOKENS, PREVIEW_GLM_GENERATION_TOKEN_FLOOR)
    : previewCallNanoUsd(row, PREVIEW_STRICT_INPUT_TOKENS_PER_CALL, sent[type]);
}

export type PreviewPricingMode = "CALIBRATED_ESTIMATE" | "STRICT_BOUND";
/**
 * THE ACTIVE PRICING MODE: CALIBRATED_ESTIMATE. The owner's own rule (2026-09-28) is an ESTIMATE with
 * a tolerance, not a worst case, and the owner chose it again on 2026-10-10 (option 2): the strict
 * bound priced a free debate at about $13 and a premium one at about $98 while real ones cost under a
 * cent, so nothing fit the $4 day. To switch (for example back to STRICT_BOUND, or to a measured-cap
 * mode added beside these two), change this one constant; nothing else reads the mode.
 */
export const PREVIEW_ESTIMATE_PRICING_MODE: PreviewPricingMode = "CALIBRATED_ESTIMATE";
/** THE ONE PRICING SWITCH: the pricer for `mode` (default: the active mode above). */
export function previewEstimatePricer(context: Readonly<{ measured: PreviewMeasuredCallUsage; callOutputTokens: PreviewCallOutputTokens }>,
  mode: PreviewPricingMode = PREVIEW_ESTIMATE_PRICING_MODE): PreviewCallPricer {
  switch (mode) {
    case "CALIBRATED_ESTIMATE": return calibratedEstimatePricer(context.measured);
    case "STRICT_BOUND": return strictUpperBoundPricer(context.callOutputTokens);
  }
}

/** The calls of one debate, by part; `total` is what the gate's call count must allow (before the margin). */
export type PreviewExpectedCalls = Readonly<{
  debate: number; story: number; probes: number; askProbes: number; unbilledRetries: number; total: number;
}>;

/** How many times the runner picks a debate up (each time health-checking its panel and off-panel roles). */
function previewPickups(basis: Readonly<Record<string, unknown>>, maxCooldownHoldsPerRun: number): number {
  const holdCap = wholeNumber(basis.hold_cap) ? basis.hold_cap : maxCooldownHoldsPerRun;
  return 1 + holdCap + PREVIEW_ESTIMATE_RESTART_PICKUPS;
}
function offPanelRoleRefs(panel: readonly PreviewPanelMember[], roleProviderRefs: readonly string[]): readonly string[] {
  const panelRefs = new Set(panel.map((member) => member.provider_ref));
  return [...new Set(roleProviderRefs.filter((ref) => !panelRefs.has(ref)))];
}

/**
 * The calls one debate makes, from the basis admission resolved (the count is the one the estimate
 * had before option 2; only the pricing changed):
 * - debate: the larger of one call per site (`expectedCallsByRoleFromBasis`) and the basis's own
 *   ceiling `max_model_attempts`, which counts every repeat attempt per site;
 * - story: per round, the storyteller twice and the story checker once;
 * - probes: the runner's paid health checks at every pickup, one per panel member plus one per role
 *   ref not on the panel, times (1 + the hold cap: `hold_cap` on the basis, else the register's,
 *   + PREVIEW_ESTIMATE_RESTART_PICKUPS);
 * - askProbes: the API's health checks of this ask (one per target, the careful side);
 * - unbilledRetries: owner ruling 5's one retry of a call the gate proved unbilled, at most one per
 *   one-attempt call (every debate call and every story check). It is counted against the gate's
 *   calls; it costs no money (the gate released that call's hold).
 */
export function previewExpectedCalls(input: Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  roleProviderRefs: readonly string[];
  storyRounds: number;
  maxCooldownHoldsPerRun: number;
  askProbeTargets?: number;
}>): PreviewExpectedCalls {
  if (!wholeNumber(input.storyRounds)) throw new TypeError("PREVIEW_STORY_ROUNDS_INVALID");
  if (!wholeNumber(input.maxCooldownHoldsPerRun)) throw new TypeError("PREVIEW_HOLD_CAP_INVALID");
  const askProbes = input.askProbeTargets ?? 0;
  if (!wholeNumber(askProbes)) throw new TypeError("PREVIEW_ASK_PROBE_TARGETS_INVALID");
  const sites = debateSitesByRole(input.basis);
  const ceiling = positiveInteger(input.basis.max_model_attempts) ? input.basis.max_model_attempts : 0;
  const debate = Math.max(sites === null ? 0 : sites.total, ceiling);
  if (debate < 1) throw new TypeError("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
  const probes = previewPickups(input.basis, input.maxCooldownHoldsPerRun)
    * (input.panel.length + offPanelRoleRefs(input.panel, input.roleProviderRefs).length);
  const story = 3 * input.storyRounds;
  const unbilledRetries = debate + input.storyRounds;
  return Object.freeze({ debate, story, probes, askProbes, unbilledRetries, total: debate + story + probes + askProbes + unbilledRetries });
}

/** The basis's one-call-per-site split: the panel's calls and the answer writer's and checker's; null without a split. */
function debateSitesByRole(basis: Readonly<Record<string, unknown>>):
  Readonly<{ panel: number; answerWriter: number; answerChecker: number; total: number }> | null {
  let byRole: ReturnType<typeof expectedCallsByRoleFromBasis>;
  try {
    byRole = expectedCallsByRoleFromBasis(basis);
  } catch {
    return null;
  }
  const total = Object.values(byRole).reduce((sum, calls) => sum + calls, 0);
  if (total < 1) return null;
  return Object.freeze({ panel: total - byRole.ANSWER_WRITER - byRole.ANSWER_CHECKER,
    answerWriter: byRole.ANSWER_WRITER, answerChecker: byRole.ANSWER_CHECKER, total });
}

/** One part of a debate's calls: `numerator / denominator` calls of one kind by one model. */
export type PreviewCallShare = Readonly<{ model: string; type: PreviewCallType; numerator: bigint }>;
export type PreviewCallShares = Readonly<{ denominator: bigint; shares: readonly PreviewCallShare[] }>;

/**
 * Pure: WHO MAKES WHICH CALL (per-gate shares). The debate's calls (previewExpectedCalls), each put on
 * the model that makes it, so each gate is charged only for its own models' calls:
 * - the panel's sites (positions, support and attack, cross-exchanges, judges, reviewers) shared
 *   evenly by the panel's members; the answer writer's and checker's sites on those roles' models;
 *   the repeat attempts the basis's ceiling adds over one call per site in the same proportions
 *   (a basis without a split puts every debate call on the panel);
 * - the storyteller's two attempts and the story check per round on the story roles' models;
 * - the runner's health checks at every pickup on each panel member's model and each off-panel role's
 *   (`roleModelOfRef`), and this ask's own health checks on the models of `askProbeModelIds`;
 * - one unbilled retry per debate call (same split) and per story check.
 * `storyOnly` keeps only the story's part (a debate whose answer is served and story not yet written).
 * Fractions are kept exact: every numerator is over the one `denominator`.
 */
export function previewCallShares(input: Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  roleModels: PreviewRoleModels;
  roleProviderRefs: readonly string[];
  storyRounds: number;
  maxCooldownHoldsPerRun: number;
  askProbeModelIds?: readonly string[];
  roleModelOfRef?: (ref: string) => string;
  storyOnly?: boolean;
}>): PreviewCallShares {
  const askProbeModelIds = input.askProbeModelIds ?? [];
  const expected = previewExpectedCalls({ ...input, askProbeTargets: askProbeModelIds.length });
  if (input.storyRounds > 0 && (input.roleModels.storyteller === null || input.roleModels.storyChecker === null)) {
    throw new TypeError("PREVIEW_STORY_ROLE_MISSING");
  }
  const sites = debateSitesByRole(input.basis);
  // A panel the run row does not carry (never on a live run) leaves its calls to the answer writer.
  const panelModels = input.panel.length > 0 ? input.panel.map((member) => member.model_id) : [input.roleModels.answerWriter];
  const members = BigInt(panelModels.length);
  const siteCount = BigInt(sites === null ? 1 : sites.total);
  const denominator = members * siteCount;
  const debate = BigInt(expected.debate);
  const shares: PreviewCallShare[] = [];
  const add = (model: string, type: PreviewCallType, numerator: bigint): void => {
    if (numerator > 0n) shares.push(Object.freeze({ model, type, numerator }));
  };
  const addDebate = (model: string, numerator: bigint): void => {
    add(model, "DEBATE", numerator);
    add(model, "UNBILLED_RETRY", numerator);
  };
  if (input.storyOnly !== true) {
    if (sites === null) {
      for (const model of panelModels) addDebate(model, debate);
    } else {
      for (const model of panelModels) addDebate(model, BigInt(sites.panel) * debate);
      addDebate(input.roleModels.answerWriter, BigInt(sites.answerWriter) * debate * members);
      addDebate(input.roleModels.answerChecker, BigInt(sites.answerChecker) * debate * members);
    }
    const pickups = BigInt(previewPickups(input.basis, input.maxCooldownHoldsPerRun)) * denominator;
    const modelOfRef = input.roleModelOfRef ?? ((ref: string) => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`);
    for (const member of input.panel) add(member.model_id, "PROBE", pickups);
    for (const ref of offPanelRoleRefs(input.panel, input.roleProviderRefs)) add(modelOfRef(ref), "PROBE", pickups);
    for (const model of askProbeModelIds) add(model, "PROBE", denominator);
  }
  const rounds = BigInt(input.storyRounds) * denominator;
  if (rounds > 0n) {
    add(input.roleModels.storyteller!, "STORYTELLER", rounds);
    add(input.roleModels.storyteller!, "STORYTELLER_RETRY", rounds);
    add(input.roleModels.storyChecker!, "STORY_CHECKER", rounds);
    add(input.roleModels.storyChecker!, "UNBILLED_RETRY", rounds);
  }
  return Object.freeze({ denominator, shares: Object.freeze(shares) });
}

/** One gate's share of a debate: only the calls its own models make. */
export type PreviewGateNeed = Readonly<{
  gate: PreviewGateKey;
  /** Every model of the debate on this gate (panel and roles); each must be enabled there. */
  modelIds: readonly string[];
  /** The debate's calls through this gate, before the margin (rounded up). */
  expectedCalls: number;
  /** ceil(expectedCalls x 1.15): what the gate's call count must still allow, before calls in flight. */
  callsWithMargin: number;
  /** ceil(the gate's calls at the active pricing x 1.15), before the gate's in-flight holds. */
  callsNanoUsd: bigint;
}>;

/**
 * Groups `shares` by gate and prices them. `rowOf` resolves a model to its reviewed row (a new debate
 * throws for an unreviewed one; an older unfinished debate falls back to the dearest row). Only the
 * gates in `gateModels` are returned; shares on any other gate (an ask-time health check of a target
 * the debate does not use) are left out.
 */
function gateNeeds(gateModels: ReadonlyMap<PreviewGateKey, readonly string[]>, calls: PreviewCallShares,
  rowOf: (model: string) => PreviewModelRow, pricer: PreviewCallPricer): readonly PreviewGateNeed[] {
  return Object.freeze([...gateModels].map(([gate, modelIds]) => {
    let callNumerator = 0n;
    let moneyNumerator = 0n;
    for (const share of calls.shares) {
      const row = rowOf(share.model);
      if ((previewGateKeyOf(row.model) ?? "deepinfra") !== gate) continue;
      callNumerator += share.numerator;
      if (share.type !== "UNBILLED_RETRY") moneyNumerator += share.numerator * pricer(row, share.type);
    }
    const expectedCalls = Number(ceilDiv(callNumerator, calls.denominator));
    return Object.freeze({
      gate, modelIds: Object.freeze([...new Set(modelIds)]), expectedCalls,
      callsWithMargin: Number(withMargin(BigInt(expectedCalls))),
      callsNanoUsd: withMargin(ceilDiv(moneyNumerator, calls.denominator))
    });
  }));
}

/** The estimate's inputs besides the debate itself: the register's roles, story and bounds. */
export type PreviewEstimateSettings = Readonly<{
  roleModels: PreviewRoleModels;
  roleProviderRefs: readonly string[];
  storyRounds: number;
  callOutputTokens: PreviewCallOutputTokens;
  maxCooldownHoldsPerRun: number;
  askProbeModelIds?: readonly string[];
}>;

/**
 * Pure: what a NEW debate needs of each gate, at `pricer` (default: the active mode with no measured
 * usage, so the default averages). Throws for a model the preview does not review.
 */
export function estimatePreviewGateNeeds(input: PreviewEstimateSettings & Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  pricer?: PreviewCallPricer;
}>): readonly PreviewGateNeed[] {
  if (input.panel.length === 0) throw new TypeError("PREVIEW_PANEL_EMPTY");
  const reviewedRow = (model: string): PreviewModelRow => {
    const row = previewModelRow(model);
    if (row === undefined || previewGateKeyOf(model) === undefined) throw new TypeError("PREVIEW_MODEL_UNREVIEWED");
    return row;
  };
  const byGate = new Map<PreviewGateKey, string[]>();
  for (const model of new Set([...input.panel.map((member) => member.model_id), ...roleModelList(input.roleModels)])) {
    const gate = previewGateKeyOf(reviewedRow(model).model)!;
    byGate.set(gate, [...(byGate.get(gate) ?? []), model]);
  }
  const pricer = input.pricer ?? previewEstimatePricer({ measured: [], callOutputTokens: input.callOutputTokens });
  return gateNeeds(byGate, previewCallShares(input), reviewedRow, pricer);
}

/**
 * Pure: what an UNFINISHED earlier debate is still held for, per gate. Still debating: its whole
 * estimate again, ask-time probes aside (over-counting what it already spent, which the gate's
 * remaining figure also reflects; that is the careful side). Only writing its story: the story's
 * calls. A model off the reviewed rows (an older run) is priced at the row whose average debate call
 * is dearest, on the DeepInfra gate, the only gate today.
 */
export function estimateUnfinishedRunHolds(run: PreviewUnfinishedRun, settings: PreviewEstimateSettings,
  pricer: PreviewCallPricer = previewEstimatePricer({ measured: [], callOutputTokens: settings.callOutputTokens })): readonly PreviewGateNeed[] {
  const dearestRow = PREVIEW_MODEL_ROWS.reduce((best, row) => pricer(row, "DEBATE") > pricer(best, "DEBATE") ? row : best);
  const rowOf = (model: string): PreviewModelRow => previewModelRow(model) ?? dearestRow;
  const byGate = new Map<PreviewGateKey, string[]>();
  for (const model of new Set([...run.panel.map((member) => member.model_id), ...roleModelList(settings.roleModels)])) {
    const gate = previewGateKeyOf(rowOf(model).model) ?? "deepinfra";
    byGate.set(gate, [...(byGate.get(gate) ?? []), model]);
  }
  const calls = previewCallShares({ ...settings, askProbeModelIds: [], basis: run.basis, panel: run.panel,
    roleModelOfRef: (ref) => previewModelRowForRef(ref)?.model ?? dearestRow.model, storyOnly: run.phase === "STORY" });
  return gateNeeds(byGate, calls, rowOf, pricer);
}

/** The money one gate must still have: the debate's calls plus what it may hold at once for calls in flight. */
export function previewGateEstimateNanoUsd(need: PreviewGateNeed, remaining: PreviewGateRemaining): bigint {
  return need.callsNanoUsd + BigInt(remaining.maxConcurrentCalls) * remaining.largestReservationNanoUsd;
}
/** The calls one gate must still allow: the debate's calls with margin plus one per call in flight. */
export function previewGateEstimateCalls(need: PreviewGateNeed, remaining: PreviewGateRemaining): number {
  return need.callsWithMargin + remaining.maxConcurrentCalls;
}

/** What earlier unfinished debates hold on one gate. */
export type PreviewGateHeld = Readonly<{ calls: number; nanoUsd: bigint }>;

/**
 * Pure: why this gate cannot carry the debate, or null when it can. `unavailable` reasons mean
 * "try again shortly"; `shortfall` means today's money or calls are used up.
 */
export function previewGateRefusal(
  need: PreviewGateNeed, remaining: PreviewGateRemaining, held: PreviewGateHeld = { calls: 0, nanoUsd: 0n }
): Readonly<{ kind: "unavailable" | "shortfall"; reason: string }> | null {
  if (remaining.state !== "active") return { kind: "unavailable", reason: `gate state ${remaining.state}` };
  if (!remaining.windowOpen) return { kind: "unavailable", reason: "gate window closed" };
  const disabled = need.modelIds.filter((model) => !remaining.enabledModels.includes(model));
  if (disabled.length > 0) return { kind: "unavailable", reason: `gate does not serve ${disabled.join(", ")}` };
  const calls = previewGateEstimateCalls(need, remaining);
  if (remaining.remainingCalls - held.calls < calls) {
    return { kind: "shortfall", reason: `gate has ${String(remaining.remainingCalls)} calls left, ${String(held.calls)} held by unfinished debates, the debate needs ${String(calls)}` };
  }
  const estimate = previewGateEstimateNanoUsd(need, remaining);
  if (remaining.remainingNanoUsd - held.nanoUsd < estimate) {
    return { kind: "shortfall", reason: `gate has ${String(remaining.remainingNanoUsd)} nano-USD left, ${String(held.nanoUsd)} held by unfinished debates, the debate needs ${String(estimate)}` };
  }
  return null;
}
/** Kept for callers of the earlier shape: the reason text, or null. */
export function previewGateRefusalReason(need: PreviewGateNeed, remaining: PreviewGateRemaining, held?: PreviewGateHeld): string | null {
  return previewGateRefusal(need, remaining, held)?.reason ?? null;
}

function logRefusal(kind: "unavailable" | "shortfall", reason: string): void {
  // Operator-only and content-free: a fixed event, the kind and the internal reason (gate state,
  // model ids, counts). Never the question, the asker or a key.
  console.error(JSON.stringify({ event: "preview.estimate.refused", kind, reason }));
}

/**
 * Review finding 2: the preview's ONE admission lock, a transaction-scoped Postgres advisory lock on
 * a dedicated connection. `acquire` opens a transaction and takes the lock (waiting for any other
 * ask that holds it); `release` ends the transaction, which releases it, and returns the connection.
 * Both are idempotent and `release` never throws, so it is safe in every `finally`.
 */
export type PreviewAdmissionLock = Readonly<{ acquire(): Promise<void>; release(): Promise<void> }>;
export const PREVIEW_ADMISSION_LOCK_NAME = "debateai.preview.admission" as const;
export function createPreviewAdmissionLock(pool: Pick<Pool, "connect">): PreviewAdmissionLock {
  let client: PoolClient | undefined;
  let released = false;
  const release = async (): Promise<void> => {
    released = true;
    const held = client;
    client = undefined;
    if (held === undefined) return;
    let broken: Error | undefined;
    try { await held.query("COMMIT"); } catch (error) {
      broken = error instanceof Error ? error : new Error("PREVIEW_ADMISSION_LOCK_RELEASE_FAILED");
    }
    // A connection whose COMMIT failed is destroyed, never reused with the lock possibly held.
    held.release(broken);
  };
  return Object.freeze({
    async acquire() {
      if (client !== undefined) return;
      if (released) throw new TypeError("PREVIEW_ADMISSION_LOCK_RELEASED");
      const connection = await pool.connect();
      client = connection;
      try {
        await connection.query("BEGIN");
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [PREVIEW_ADMISSION_LOCK_NAME]);
      } catch (error) {
        client = undefined;
        connection.release(error instanceof Error ? error : new Error("PREVIEW_ADMISSION_LOCK_FAILED"));
        throw error;
      }
    },
    release
  });
}

/**
 * Admission's check, ONLY on the preview. A money or call shortfall refuses with the existing daily
 * code and the gate's Bucharest-midnight reset; anything that makes the gate unusable right now
 * (unreachable, halted, not active, closed, a model not enabled, missing or faulty settings, the
 * admission lock not obtainable) refuses with the existing "model not available right now" code and
 * a one-minute retry. With `lock`, the lock is taken FIRST, before the unfinished debates and the gate
 * are read; the caller releases it once the new debate is queued (or refused).
 */
export async function assertPreviewBudgetAdmits(
  gate: PreviewBudgetGateSettings | undefined,
  input: Readonly<{ basis: Readonly<Record<string, unknown>>; panel: readonly PreviewPanelMember[] }>,
  clock: () => Date = () => new Date(),
  lock?: PreviewAdmissionLock
): Promise<void> {
  const unavailable = (reason: string): never => {
    logRefusal("unavailable", reason);
    throw new PreviewGateUnavailableRefusal(new Date(clock().getTime() + PREVIEW_UNAVAILABLE_RETRY_MS));
  };
  const shortfall = (reason: string): never => {
    logRefusal("shortfall", reason);
    throw new PreviewDailyLimitRefusal(`Private preview start-of-debate estimate refused: ${reason}`, nextBucharestMidnight(clock()));
  };
  if (gate === undefined) unavailable("no gate settings");
  try {
    await lock?.acquire();
  } catch {
    return unavailable("admission lock unavailable");
  }
  let needs: readonly PreviewGateNeed[];
  let held: Map<PreviewGateKey, PreviewGateHeld>;
  try {
    // The app's own recorded usage calibrates the averages; the same pricing holds back every
    // unfinished debate, so a new debate and a running one are counted alike.
    const measured = await gate!.readMeasuredCallUsage?.() ?? [];
    const pricer = previewEstimatePricer({ measured, callOutputTokens: gate!.callOutputTokens });
    needs = estimatePreviewGateNeeds({ ...input, ...gate!, pricer });
    const unfinished = await gate!.readUnfinishedRuns();
    if (unfinished.length > PREVIEW_UNFINISHED_RUNS_MAX) throw new TypeError("PREVIEW_UNFINISHED_RUNS_TOO_MANY");
    held = new Map();
    for (const run of unfinished) {
      for (const hold of estimateUnfinishedRunHolds(run, gate!, pricer)) {
        const sum = held.get(hold.gate) ?? { calls: 0, nanoUsd: 0n };
        held.set(hold.gate, { calls: sum.calls + hold.callsWithMargin, nanoUsd: sum.nanoUsd + hold.callsNanoUsd });
      }
    }
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "estimate failed");
  }
  for (const need of needs) {
    const port = gate!.remaining[need.gate];
    if (port === undefined) unavailable(`no remaining port for gate ${need.gate}`);
    let remaining: PreviewGateRemaining;
    try {
      remaining = await port();
    } catch (error) {
      return unavailable(error instanceof TypedDomainError ? error.code : "gate unreachable");
    }
    const refusal = previewGateRefusal(need, remaining, held.get(need.gate));
    if (refusal !== null) (refusal.kind === "shortfall" ? shortfall : unavailable)(refusal.reason);
  }
}

/**
 * The unfinished preview debates, for the estimate, whatever day each was admitted (a debate that
 * crosses midnight spends from the new day's pot), none with a FAILED job:
 * - DEBATE: a job still READY or CLAIMED;
 * - STORY ($1, true when the register has a story): no live job, an answer served, no story row
 *   yet, and a model call finished within the last $2 seconds (the story runs after the job is DONE).
 * A debate between its start and its first job is never seen here: the admission lock is held until
 * that job is queued. Plain columns only; never content.
 */
export const PREVIEW_UNFINISHED_RUNS_SQL = `SELECT run.envelope_basis, run.discovered_panel,
              CASE WHEN EXISTS (SELECT 1 FROM core.work_item AS work
                                WHERE work.run_id = run.run_id AND work.state IN ('READY', 'CLAIMED'))
                   THEN 'DEBATE' ELSE 'STORY' END AS phase
       FROM core.run AS run
       WHERE NOT EXISTS (SELECT 1 FROM core.work_item AS work
                         WHERE work.run_id = run.run_id AND work.state = 'FAILED')
         AND (EXISTS (SELECT 1 FROM core.work_item AS work
                      WHERE work.run_id = run.run_id AND work.state IN ('READY', 'CLAIMED'))
              OR ($1::boolean
                  AND EXISTS (SELECT 1 FROM serve.answer AS answer WHERE answer.run_id = run.run_id)
                  AND NOT EXISTS (SELECT 1 FROM serve.answer_story AS story WHERE story.run_id = run.run_id)
                  AND EXISTS (SELECT 1 FROM ledger.ledger_entry AS entry
                              WHERE entry.run_id = run.run_id AND entry.action_kind = 'MODEL_CALL'
                                AND entry.finished_at > clock_timestamp() - make_interval(secs => $2::integer))))
       LIMIT ${String(PREVIEW_UNFINISHED_RUNS_MAX + 1)}` as const;

function unfinishedRunFrom(row: Readonly<{ envelope_basis: unknown; discovered_panel: unknown; phase?: unknown }>): PreviewUnfinishedRun {
  const basis = row.envelope_basis;
  const panel = row.discovered_panel;
  if (typeof basis !== "object" || basis === null || Array.isArray(basis) || !Array.isArray(panel)
    || panel.some((member) => typeof member !== "object" || member === null
      || typeof (member as Record<string, unknown>).provider_ref !== "string"
      || typeof (member as Record<string, unknown>).model_id !== "string")
    || (row.phase !== "DEBATE" && row.phase !== "STORY")) {
    throw new TypeError("PREVIEW_UNFINISHED_RUN_UNREADABLE");
  }
  return Object.freeze({
    basis: basis as Readonly<Record<string, unknown>>,
    panel: Object.freeze((panel as Array<Record<string, string>>).map((member) =>
      Object.freeze({ provider_ref: member.provider_ref!, model_id: member.model_id! }))),
    phase: row.phase
  });
}

/**
 * The app's own recorded usage of recent preview calls, for the calibrated averages: the model-spend
 * ledger's charges by the reviewed preview refs within the last $2 days, summed per ref and kind
 * (spend_source RUN: a debate call; STORY: a story call). $1 is PREVIEW_REVIEWED_PROVIDER_REFS.
 * Counts and token sums only; never content.
 * Today the preview runs in local mode, where the runner builds no spend seam
 * (apps/runner/src/main.ts: costEnvelopePolicy is read only when hosted), so this reads no rows and
 * the defaults apply; the averages calibrate themselves once preview calls are recorded there.
 */
export const PREVIEW_MEASURED_USAGE_SQL = `SELECT spend.provider_ref, spend.spend_source, count(*)::integer AS calls,
              sum(spend.input_tokens)::text AS input_tokens, sum(spend.output_tokens)::text AS output_tokens
       FROM ledger.model_spend AS spend
       WHERE spend.spend_source IN ('RUN', 'STORY')
         AND spend.provider_ref = ANY($1::text[])
         AND spend.recorded_at > clock_timestamp() - make_interval(days => $2::integer)
       GROUP BY spend.provider_ref, spend.spend_source` as const;

/** Pure: the measured usage per model and kind from PREVIEW_MEASURED_USAGE_SQL's rows (refs of one model added together). */
export function previewMeasuredCallUsageFrom(rows: readonly Readonly<{
  provider_ref: unknown; spend_source: unknown; calls: unknown; input_tokens: unknown; output_tokens: unknown;
}>[]): PreviewMeasuredCallUsage {
  const sums = new Map<string, { model: string; bucket: PreviewMeasuredBucket; calls: number; inputTokens: bigint; outputTokens: bigint }>();
  const tokens = (value: unknown): bigint => {
    if (typeof value !== "string" || !/^\d{1,18}$/u.test(value)) throw new TypeError("PREVIEW_MEASURED_USAGE_UNREADABLE");
    return BigInt(value);
  };
  for (const row of rows) {
    const model = previewModelRowForRef(row.provider_ref)?.model;
    const bucket = row.spend_source === "RUN" ? "DEBATE" : row.spend_source === "STORY" ? "STORY" : undefined;
    if (model === undefined || bucket === undefined || !positiveInteger(row.calls)) throw new TypeError("PREVIEW_MEASURED_USAGE_UNREADABLE");
    const key = `${model}\u0000${bucket}`;
    const sum = sums.get(key) ?? { model, bucket, calls: 0, inputTokens: 0n, outputTokens: 0n };
    sums.set(key, { model, bucket, calls: sum.calls + row.calls,
      inputTokens: sum.inputTokens + tokens(row.input_tokens), outputTokens: sum.outputTokens + tokens(row.output_tokens) });
  }
  return Object.freeze([...sums.values()].map((sum) => Object.freeze(sum)));
}

const ORGAN_BOUNDS_ROW = "acceptanceOrganCostBounds";
const ORGANS = Object.freeze(["JUDGE", "COMPOSER", "CONFORMANCE"]);
/** The ceilings of the three organ bounds in the register (judge, composer, conformance). */
async function readOrganTokenCeilings(pool: Pool, registerVersion: number): Promise<readonly number[]> {
  const result = await pool.query<{ value_json: unknown }>(
    `SELECT value_json FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, ORGAN_BOUNDS_ROW]
  );
  const organs = (result.rows[0]?.value_json as { organs?: Record<string, { tokenCeiling?: unknown } | undefined> } | undefined)?.organs;
  const ceilings = ORGANS.map((organ) => organs?.[organ]?.tokenCeiling);
  if (!ceilings.every(positiveInteger)) throw new TypeError("PREVIEW_ORGAN_BOUNDS_UNRESOLVED");
  return Object.freeze(ceilings as number[]);
}

/**
 * Pure: the max_tokens each kind of call sends on the preview, from the register's token ceilings:
 * previewCallBound's ceiling (never below the generation floor) for every debate call (the largest
 * of the three organ bounds and the two synthesis bounds), the storyteller's first attempt at its
 * ceiling and its second at the length-retry ceiling, the story checker at its ceiling.
 */
export function previewCallOutputTokens(config: PreviewProviderTestConfig, ceilings: Readonly<{
  debate: readonly number[]; story: Readonly<{ storyteller: number; checker: number }> | null;
}>): PreviewCallOutputTokens {
  if (ceilings.debate.length === 0 || !ceilings.debate.every(positiveInteger)) throw new TypeError("PREVIEW_CALL_CEILINGS_INVALID");
  const sent = (tokenCeiling: number) => previewCallBound({ maxAttempts: 1, tokenCeiling, deadlineMs: 1 }, config).tokenCeiling;
  const storyteller = ceilings.story === null ? 0 : sent(ceilings.story.storyteller);
  return Object.freeze({
    debate: Math.max(...ceilings.debate.map(sent)),
    storyteller,
    storytellerRetry: lengthRetryTokenCeiling(storyteller, 1),
    storyChecker: ceilings.story === null ? 0 : sent(ceilings.story.checker)
  });
}

/**
 * Boot: the admission settings for the preview, from its config and the register version in force.
 * The role refs are the register's sealed provider refs; one the preview does not review is kept as
 * an unknown id, so every ask is refused (fail closed) rather than the boot guessing a price. The
 * story rows are optional (absent reads as no story); a malformed story family refuses the boot.
 * `askProbeModelIds` are the models of the declared targets the API health-checks at ask time.
 */
export async function readPreviewBudgetGateSettings(
  pool: Pool,
  registerVersion: number,
  config: PreviewProviderTestConfig,
  askProbeModelIds: readonly string[]
): Promise<PreviewBudgetGateSettings> {
  if (!Array.isArray(askProbeModelIds) || askProbeModelIds.some((model) => typeof model !== "string")) {
    throw new TypeError("PREVIEW_ASK_PROBE_TARGETS_INVALID");
  }
  const roles = await readSynthesisRoleControls(pool, registerVersion);
  const story = await readStoryPolicyFromRegister(pool, registerVersion);
  const structural = await readStructuralCeilingPolicyInputs(pool, registerVersion);
  const organCeilings = await readOrganTokenCeilings(pool, registerVersion);
  const refs = [roles.synthesizerRoleRef, roles.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])];
  const port = createPreviewRemainingRpcPort(config);
  const storyRounds = story === null ? 0 : story.loopMaxRounds;
  const modelOfRef = (ref: string): string => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`;
  return Object.freeze({
    remaining: Object.freeze({ deepinfra: (signal?: AbortSignal) => port.remaining(signal) }),
    roleModels: Object.freeze({
      answerWriter: modelOfRef(roles.synthesizerRoleRef), answerChecker: modelOfRef(roles.evaluatorRoleRef),
      storyteller: story === null ? null : modelOfRef(story.storytellerRoleRef),
      storyChecker: story === null ? null : modelOfRef(story.storyCheckerRoleRef)
    }),
    roleProviderRefs: Object.freeze([...new Set(refs)]),
    storyRounds,
    callOutputTokens: previewCallOutputTokens(config, {
      debate: [...organCeilings, roles.synthesizerBound.tokenCeiling, roles.evaluatorBound.tokenCeiling],
      story: story === null ? null : { storyteller: story.storytellerBound.tokenCeiling, checker: story.checkerBound.tokenCeiling }
    }),
    askProbeModelIds: Object.freeze([...askProbeModelIds]),
    maxCooldownHoldsPerRun: structural.maxCooldownHoldsPerRun,
    readUnfinishedRuns: async () => {
      const result = await pool.query<{ envelope_basis: unknown; discovered_panel: unknown; phase: unknown }>(
        PREVIEW_UNFINISHED_RUNS_SQL, [storyRounds > 0, PREVIEW_STORY_HOLD_WINDOW_SECONDS]);
      return Object.freeze(result.rows.map(unfinishedRunFrom));
    },
    readMeasuredCallUsage: async () => {
      const result = await pool.query<{ provider_ref: unknown; spend_source: unknown; calls: unknown; input_tokens: unknown; output_tokens: unknown }>(
        PREVIEW_MEASURED_USAGE_SQL, [[...PREVIEW_REVIEWED_PROVIDER_REFS], PREVIEW_CALIBRATION_WINDOW_DAYS]);
      return previewMeasuredCallUsageFrom(result.rows);
    },
    openAdmissionLock: () => createPreviewAdmissionLock(pool)
  });
}
