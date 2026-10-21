/**
 * The private preview's start-of-debate money check (owner's rule, 2026-09-28: never stop a debate
 * half-way; ESTIMATE before it starts, with a tolerance, not a worst case).
 *
 * Plain words: before a preview debate is created, the app works out the model calls it will make
 * (each debate step once, the answer loop, the story with the storyteller's one repair, the runner's
 * health checks each time it picks the debate up, this ask's own health checks, and the one retry of
 * a call the gate proved unbilled), puts each call on the model that makes it (so each gate is
 * charged only for its own models' calls), prices each call at a REALISTIC WORST CASE (owner rulings,
 * 2026-10-10: its prompt at 64 KiB, a story call's at its story size's largest measured request,
 * converted at 3 bytes per token; its answer at the full max_tokens that call asks for; a health
 * check at its fixed one-line prompt) at the row's list price, adds 15%, adds what the gate may hold
 * at once for calls in flight (its concurrency limit x its largest reservation, from the gate's own
 * reply), and holds back the same figure for every earlier preview debate that has not finished (a
 * debate still writing its story: the story's calls). One ask at a time is estimated and started
 * (the admission lock), so two asks never both count the same money. How a call is priced and how
 * the debate's calls are counted is ONE switch (PREVIEW_ESTIMATE_PRICING_MODE: previewEstimatePricer
 * and previewDebateCallCount); the calibrated average and the strict bound stay one constant away.
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
 * One gate per provider (PR B): the DeepInfra gate on the config's `budget_socket`, the Anthropic
 * gate on `anthropic_budget_socket`. Each row maps to its gate by `previewGateKeyOf` (the row's
 * provider); every gate a debate's panel or role models use is asked, each charged only its own
 * models' calls and its own in-flight hold, and unfinished debates are held on each gate they use. A
 * gate the config does not name has no port, so a debate needing it is refused (as unavailable)
 * before it starts.
 */
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import {
  createPreviewRemainingRpcPort,
  lengthRetryTokenCeiling,
  PREVIEW_CALL_TIER_LIMITS,
  PREVIEW_MODEL_ROWS_BY_PROVIDER,
  PREVIEW_PROVIDER_NAMES,
  PREVIEW_GLM_GENERATION_TOKEN_FLOOR,
  PREVIEW_REQUEST_BODY_MAX_BYTES,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  PREVIEW_STRUCTURE_REPAIR_MODEL,
  previewCallBound,
  previewChargedInputTokens,
  previewModelRow,
  previewModelRowForRef,
  previewProviderSocket,
  previewStorytellerOutputCap,
  previewStorytellerTokenCeiling,
  previewTierOutputBound,
  type PreviewCallTier,
  type PreviewGateRemaining,
  type PreviewModelRow,
  type PreviewProviderName,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import {
  lengthGuidanceAllowanceTokens, readStoryPolicyFromRegister, readStructuralCeilingPolicyInputs,
  readSynthesisRoleControls, type DebateShapeCeilingInput, type EngineSettings
} from "@debateai/register";
import type { Pool, PoolClient } from "pg";
import { admittedEngineOf, admittedLengthOf, admittedShapeOf, expectedCallsByRoleFromBasis, mapLengthAllowanceTokens } from "./ask-model-picker.js";

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

/** The gates the preview has: one per reviewed provider. */
export type PreviewGateKey = PreviewProviderName;

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
const PREVIEW_CALIBRATION_MIN_SAMPLES = 20;
/** Only calls recorded within this many days count: older calls ran on older prompts. */
const PREVIEW_CALIBRATION_WINDOW_DAYS = 14;
/**
 * The strict upper bound's input side (STRICT_BOUND mode only, 6f62b6ba3): no per-call-type cap on a
 * prompt's size exists in the engine's code, so the one hard ceiling is the guarded fetch's: a body
 * above 256 KiB (owner ruling, 2026-10-10) is refused before it is sent, and the gate reserves (body bytes + 2048) x the input
 * price. A health check's body is the fixed one-line probe, well under 1 KiB.
 */
export const PREVIEW_STRICT_INPUT_TOKENS_PER_CALL = previewChargedInputTokens(PREVIEW_REQUEST_BODY_MAX_BYTES);
const PREVIEW_PROBE_BODY_MAX_BYTES = 1024;
export const PREVIEW_STRICT_PROBE_INPUT_TOKENS = previewChargedInputTokens(PREVIEW_PROBE_BODY_MAX_BYTES);
/**
 * Owner ruling, 2026-10-10 (evening): the ESTIMATE turns a request's size into tokens at 3 bytes per
 * token, because real text takes more than one byte per token (3 still covers text heavy in Chinese,
 * Japanese or Korean); this is the estimate only, the gate's own reservation keeps one byte = one token.
 * The gate's 2,048 template allowance is added to the bytes first.
 */
const PREVIEW_ESTIMATE_BYTES_PER_TOKEN = 3;
export function previewEstimateInputTokens(requestBytes: number): bigint {
  const perToken = BigInt(PREVIEW_ESTIMATE_BYTES_PER_TOKEN);
  return (previewChargedInputTokens(requestBytes) + perToken - 1n) / perToken;
}
/**
 * The realistic worst case's ordinary prompt (owner ruling, 2026-10-10): 64 KiB, so (65,536 + 2,048) / 3
 * = 22,528 tokens. The largest ordinary request seen on the preview was about 51 KB; the hard cap the
 * guarded fetch and the gate enforce is 256 KiB.
 */
const PREVIEW_REALISTIC_INPUT_BYTES = 64 * 1024;
export const PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL = previewEstimateInputTokens(PREVIEW_REALISTIC_INPUT_BYTES);
/** The ask's story size (composition_budget_tier): how much debate material the verdict story may read. */
export type PreviewStoryTier = "low" | "medium" | "high";
/**
 * The largest story request of each story size, in bytes, measured on 2026-10-10 with the real prompt
 * frame, today's story pack (storyteller instruction 29,514 B, checker 8,193 B), material filled to the
 * size's budget (40,000 / 80,000 / 120,000 B) with dense quoting, and for the checker a 48 KB candidate
 * story; each rounded up to whole KiB. The storyteller's repair is priced like its first attempt.
 */
export const PREVIEW_STORY_REQUEST_BYTES: Readonly<Record<PreviewStoryTier, Readonly<{ storyteller: number; storyChecker: number }>>> = Object.freeze({
  low: Object.freeze({ storyteller: 96 * 1024, storyChecker: 119 * 1024 }),
  medium: Object.freeze({ storyteller: 154 * 1024, storyChecker: 178 * 1024 }),
  high: Object.freeze({ storyteller: 213 * 1024, storyChecker: 237 * 1024 })
});
/** An earlier debate whose story size is unknown is held at the largest (the careful side). */
export const PREVIEW_STORY_TIER_FALLBACK: PreviewStoryTier = "high";
function previewStoryTierOf(value: unknown): PreviewStoryTier {
  return value === "low" || value === "medium" || value === "high" ? value : PREVIEW_STORY_TIER_FALLBACK;
}
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
  /**
   * Side-by-side spec §4 (plan C16): the register version the debate was admitted under (`core.run.register_version`);
   * its roles, story and bounds price its hold (`PreviewBudgetGateSettings.termsForVersion`), never the API's.
   */
  registerVersion: number;
  /** Its ask's story size; absent: held at the largest. */
  storyTier?: PreviewStoryTier;
  /** Spec 2026-10-11: admitted with a rotation pin (its four roles are panel members). */
  rotated?: boolean;
}>;

/**
 * The max_tokens each kind of call sends on the preview, before its row's own bound clamps it:
 * previewCallBound's ceiling (the register's bound, at least the generation floor) for every
 * one-attempt debate call; the storyteller's first attempt at its ceiling and its second at the
 * length-retry ceiling; the story checker at its ceiling. The REALISTIC_WORST_CASE and STRICT_BOUND
 * modes price with it.
 */
export type PreviewCallOutputTokens = Readonly<{
  debate: number; storyteller: number; storytellerRetry: number; storyChecker: number;
  /**
   * Debate shape (spec 2026-10-12 §3.3 step 8): the answer writer's max_tokens when its run's answer length raises it.
   * LG-B (L26): the pricers no longer read it; the writer is a final writer, priced at its row's own maximum.
   */
  answerWriter?: number;
  /** Debate shape (controller ruling X1): the map's merge and choose max_tokens when the run's map step bounds raise them. */
  mapMerge?: number;
  mapChoose?: number;
}>;

/** The register's four roles as model ids; the story pair is null when the register has no story. */
export type PreviewRoleModels = Readonly<{
  answerWriter: string; answerChecker: string; storyteller: string | null; storyChecker: string | null;
}>;
function roleModelList(roles: PreviewRoleModels): readonly string[] {
  return [roles.answerWriter, roles.answerChecker,
    ...(roles.storyteller === null ? [] : [roles.storyteller]), ...(roles.storyChecker === null ? [] : [roles.storyChecker])];
}

/**
 * Side-by-side spec §4 (plan C16): what ONE register version prices a debate with: its roles (as model ids and as the
 * provider refs the runner health-checks off the panel), its story rounds, its calls' max_tokens and its cooldown hold
 * cap. Two releases can run debates side by side, each under its own version; an unfinished debate is held at its own
 * version's terms, the new debate at the API's.
 */
export type PreviewVersionTerms = Readonly<{
  roleModels: PreviewRoleModels;
  /**
   * The same roles as provider refs. Not in the plan's shape: a debate's off-panel health checks follow its own roles,
   * so pricing them from another version's refs would put one version's checks on the other's models.
   */
  roleProviderRefs: readonly string[];
  storyRounds: number;
  callOutputTokens: PreviewCallOutputTokens;
  maxCooldownHoldsPerRun: number;
}>;

/**
 * The kinds of call one debate makes, as the estimate prices them. UNBILLED_RETRY is owner ruling 5's
 * one retry of a call the gate proved unbilled: it counts against the gate's calls and costs nothing.
 * STORY_CHECKER_RETRY (story format robustness, 2026-10-12) is the story checker's one repair try, a
 * billed call like the storyteller's STORYTELLER_RETRY. A debate-shape run (spec 2026-10-12) prices its answer
 * writer's calls as ANSWER_WRITER (at its answer length's writer bound) and the map's one merge and one choose as
 * MAP_MERGE / MAP_CHOOSE (at its map step bounds, controller ruling X1); each is a debate call when no bound raises it.
 * STRUCTURE_REPAIR (LG-A, L32; Task 14 controller ruling, never under-count) is a story try's second POST made as the
 * structure-repair call on the repair model, priced at that call's own ceiling (`structureRepairNanoUsd`).
 * Length guidance LG-B (L26): ANSWER_WRITER (every receipt) and ANSWER_CHECKER are final writers, priced at the row's own
 * maximum output, like the story's four kinds.
 */
export type PreviewCallType = "DEBATE" | "ANSWER_WRITER" | "ANSWER_CHECKER" | "MAP_MERGE" | "MAP_CHOOSE" | "STORYTELLER" | "STORYTELLER_RETRY"
  | "STORY_CHECKER" | "STORY_CHECKER_RETRY" | "STRUCTURE_REPAIR" | "PROBE" | "UNBILLED_RETRY";
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
  /** One read-only remaining port per gate the config names (a gate without a socket has none). */
  remaining: Readonly<Partial<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>>>;
  /** The register's roles (answer writer and checker, storyteller and story checker), as model ids. */
  roleModels: PreviewRoleModels;
  /** The same roles as provider refs; the runner health-checks those not on the panel at every pickup. */
  roleProviderRefs: readonly string[];
  /** Rounds the verdict story may run: per round the storyteller twice and the story checker twice (one repair each). */
  storyRounds: number;
  /** The max_tokens of each kind of call (see PreviewCallOutputTokens). */
  callOutputTokens: PreviewCallOutputTokens;
  /** The models of the targets the API health-checks at ask time, paid through the gate even when the ask is refused. */
  askProbeModelIds: readonly string[];
  /**
   * LG-A (L32; INTERFACE §2.4): the structure-repair model when the declared targets name it (the rule the runner's route
   * follows, `previewStructureRepairRoute`), else null; absent reads as null. Each story try's second POST is counted on it
   * too (only the story's: the other steps' repairs are left to the margin, owner ruling R3).
   */
  structureRepairModel?: string | null;
  /** register runDeathPolicy.max_cooldown_holds_per_run: a debate is picked up at most 1 + this many times by cooldown. */
  maxCooldownHoldsPerRun: number;
  /** Earlier preview debates that have not finished (see PREVIEW_UNFINISHED_RUNS_SQL). */
  readUnfinishedRuns: () => Promise<readonly PreviewUnfinishedRun[]>;
  /**
   * Side-by-side spec §4 (plan C16): one register version's terms, for an unfinished debate admitted under it. Sealed
   * versions never change, so each is read once and kept (the API's own is the fields above). A version that cannot be
   * read rejects, and is not kept; the estimate then prices that one debate at the API's own terms (C16 review,
   * `versionTermsFallback`), so one unreadable version never refuses every preview ask.
   */
  termsForVersion: (version: number) => Promise<PreviewVersionTerms>;
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
  return previewModelRow(model)?.provider;
}

/** The tier of each kind of call (LG-B, L26): the answer's and the story's writers and checkers are final writers. */
const PREVIEW_FINAL_WRITER_CALL_TYPES: ReadonlySet<PreviewCallType> = new Set(["ANSWER_WRITER", "ANSWER_CHECKER", "STORYTELLER",
  "STORYTELLER_RETRY", "STORY_CHECKER", "STORY_CHECKER_RETRY"]);
function previewCallTypeTier(type: PreviewCallType): PreviewCallTier {
  return PREVIEW_FINAL_WRITER_CALL_TYPES.has(type) ? "FINAL_WRITER" : "STANDARD";
}

/** One call at a row's list price: its input at the input price, its output clamped to its tier's bound on the row. */
export function previewCallNanoUsd(row: PreviewModelRow, inputTokens: bigint, outputTokens: number | bigint, tier: PreviewCallTier = "STANDARD"): bigint {
  const output = BigInt(outputTokens);
  const bound = BigInt(previewTierOutputBound(row, tier));
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
  const bucket = previewMeasuredBucketOf(type);
  const sample = bucket === null ? undefined : measured.find((entry) => entry.model === model && entry.bucket === bucket);
  if (sample === undefined || sample.calls < PREVIEW_CALIBRATION_MIN_SAMPLES) {
    return Object.freeze({ inputTokens: PREVIEW_ESTIMATE_DEFAULT_INPUT_TOKENS, outputTokens: PREVIEW_ESTIMATE_DEFAULT_OUTPUT_TOKENS, measured: false });
  }
  const calls = BigInt(sample.calls);
  return Object.freeze({ inputTokens: ceilDiv(sample.inputTokens, calls), outputTokens: ceilDiv(sample.outputTokens, calls), measured: true });
}

/** Where a call's measured usage is recorded: the debate's (the writer and the map are debate calls), the story's, or none. */
function previewMeasuredBucketOf(type: PreviewBilledCallType): PreviewMeasuredBucket | null {
  switch (type) {
    case "DEBATE": case "ANSWER_WRITER": case "ANSWER_CHECKER": case "MAP_MERGE": case "MAP_CHOOSE": return "DEBATE";
    case "STORYTELLER": case "STORYTELLER_RETRY": case "STORY_CHECKER": case "STORY_CHECKER_RETRY": return "STORY";
    // A repair is never averaged: every pricer prices it at its ceiling (`structureRepairNanoUsd`).
    case "STRUCTURE_REPAIR": case "PROBE": return null;
    default: return exhaustive(type);
  }
}

/** The price of one call of `type` on `row`, in nano-USD (never asked for an unbilled retry). */
export type PreviewCallPricer = (row: PreviewModelRow, type: PreviewBilledCallType) => bigint;

/**
 * LG-A (Task 14 controller ruling: the estimate never under-counts) — ONE STRUCTURE-REPAIR CALL AT ITS OWN CEILING: its
 * input at `inputTokens` (the largest body the preview wire accepts, PREVIEW_REQUEST_BODY_MAX_BYTES, in the pricer's own
 * token measure: the repair carries the whole broken reply, so no smaller bound holds) and its output at the row's whole
 * answer cap (the route's token ceiling, `previewStructureRepairRoute`), never the 16,384 of a story checker's retry.
 */
function structureRepairNanoUsd(row: PreviewModelRow, inputTokens: bigint): bigint {
  return previewCallNanoUsd(row, inputTokens, row.outputBound);
}
/** The realistic measure of the repair's input (3 bytes per token), shared by the realistic and calibrated pricers. */
const PREVIEW_REALISTIC_REPAIR_INPUT_TOKENS = previewEstimateInputTokens(PREVIEW_REQUEST_BODY_MAX_BYTES);

/**
 * CALIBRATED_ESTIMATE: the average call of that kind by that model (previewCallAverage) at the row's list price today.
 * The calibrated average ignores a shaped run's writer and map step bounds, and a length receipt's guided allowance
 * (LG-C); switching to it under-prices those calls.
 */
export function calibratedEstimatePricer(measured: PreviewMeasuredCallUsage): PreviewCallPricer {
  return (row, type) => {
    if (type === "STRUCTURE_REPAIR") return structureRepairNanoUsd(row, PREVIEW_REALISTIC_REPAIR_INPUT_TOKENS);
    const average = previewCallAverage(row.model, type, measured);
    return previewCallNanoUsd(row, average.inputTokens, average.outputTokens, previewCallTypeTier(type));
  };
}
/**
 * Every call at its input tokens (`inputTokens` by kind) and the max_tokens that call sends out, clamped to its tier's
 * bound on the row; a health check at its fixed one-line body and the generation floor. Length guidance LG-B (L26, owner
 * answer 7): the answer writer and checker and the story checker ask the row's own maximum (both of the checker's tries);
 * the storyteller its row's allowance (a fast row's own maximum, a slow row's 16,384) and its length retry twice that,
 * held to previewStorytellerOutputCap. A register without a story prices no story output, as before. LG-A's
 * structure-repair call keeps its own ceiling (structureRepairNanoUsd, STANDARD tier: controller ruling PF-B4.15).
 * Final review (2026-10-16, Important 3): on a slow row (GLM, MiMo, Qwen) the call policy now has the answer writer,
 * answer checker and story checker ask 16,384 with their retry held to `outputBound`, as the slow storyteller; this
 * estimate keeps pricing them at the row's own maximum on purpose, a safe over-count (it never prices a call below what
 * it may send).
 */
function sentOutputPricer(inputTokens: Readonly<Record<Exclude<PreviewBilledCallType, "PROBE">, bigint>>,
  output: PreviewCallOutputTokens): PreviewCallPricer {
  const outputOf = (row: PreviewModelRow, type: Exclude<PreviewBilledCallType, "PROBE" | "STRUCTURE_REPAIR">): number => {
    switch (type) {
      case "DEBATE": return output.debate;
      case "MAP_MERGE": return output.mapMerge ?? output.debate;
      case "MAP_CHOOSE": return output.mapChoose ?? output.debate;
      case "ANSWER_WRITER": case "ANSWER_CHECKER": return row.finalWriterOutputBound;
      case "STORYTELLER": return output.storyteller === 0 ? 0 : previewStorytellerTokenCeiling(row);
      case "STORYTELLER_RETRY": return output.storyteller === 0 ? 0
        : Math.min(lengthRetryTokenCeiling(previewStorytellerTokenCeiling(row), 1), previewStorytellerOutputCap(row));
      case "STORY_CHECKER": case "STORY_CHECKER_RETRY": return output.storyChecker === 0 ? 0 : row.finalWriterOutputBound;
      default: return exhaustive(type);
    }
  };
  return (row, type) => type === "PROBE"
    ? previewCallNanoUsd(row, PREVIEW_STRICT_PROBE_INPUT_TOKENS, PREVIEW_GLM_GENERATION_TOKEN_FLOOR)
    : type === "STRUCTURE_REPAIR" ? structureRepairNanoUsd(row, inputTokens.STRUCTURE_REPAIR)
    : previewCallNanoUsd(row, inputTokens[type], outputOf(row, type), previewCallTypeTier(type));
}
const everyCallAt = (tokens: bigint) => ({ DEBATE: tokens, ANSWER_WRITER: tokens, ANSWER_CHECKER: tokens, MAP_MERGE: tokens, MAP_CHOOSE: tokens,
  STORYTELLER: tokens, STORYTELLER_RETRY: tokens, STORY_CHECKER: tokens, STORY_CHECKER_RETRY: tokens, STRUCTURE_REPAIR: tokens });
/**
 * STRICT_BOUND (6f62b6ba3): every call at its most, input at the largest body the gate accepts,
 * output at the max_tokens that call sends, clamped to the row; a health check at its fixed body and
 * the generation floor. LG-B: a final writer's input at the final-writer request cap (1 MiB).
 */
export function strictUpperBoundPricer(output: PreviewCallOutputTokens): PreviewCallPricer {
  // LG-B (L29): a final writer's body may be up to the final-writer request cap.
  const finalWriter = previewChargedInputTokens(PREVIEW_CALL_TIER_LIMITS.FINAL_WRITER.requestBodyMaxBytes);
  return sentOutputPricer({ ...everyCallAt(PREVIEW_STRICT_INPUT_TOKENS_PER_CALL), ANSWER_WRITER: finalWriter, ANSWER_CHECKER: finalWriter,
    STORYTELLER: finalWriter, STORYTELLER_RETRY: finalWriter, STORY_CHECKER: finalWriter, STORY_CHECKER_RETRY: finalWriter }, output);
}
/**
 * REALISTIC_WORST_CASE (owner rulings, 2026-10-10): a debate call's input at a realistic 64 KiB, a
 * story call's (the storyteller, its repair, the story check) at the largest measured request of the
 * ask's story size (PREVIEW_STORY_REQUEST_BYTES), both at 3 bytes per token; its output at the
 * max_tokens that call asks for (clamped to the row); a health check at its fixed body and the
 * generation floor, as in the strict bound.
 */
export function realisticWorstCasePricer(output: PreviewCallOutputTokens, storyTier: PreviewStoryTier = PREVIEW_STORY_TIER_FALLBACK): PreviewCallPricer {
  const story = PREVIEW_STORY_REQUEST_BYTES[previewStoryTierOf(storyTier)];
  const storyteller = previewEstimateInputTokens(story.storyteller);
  const storyChecker = previewEstimateInputTokens(story.storyChecker);
  return sentOutputPricer({ DEBATE: PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, ANSWER_WRITER: PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL,
    ANSWER_CHECKER: PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL,
    MAP_MERGE: PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, MAP_CHOOSE: PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL,
    STORYTELLER: storyteller, STORYTELLER_RETRY: storyteller,
    STORY_CHECKER: storyChecker, STORY_CHECKER_RETRY: storyChecker, STRUCTURE_REPAIR: PREVIEW_REALISTIC_REPAIR_INPUT_TOKENS }, output);
}

export type PreviewPricingMode = "REALISTIC_WORST_CASE" | "CALIBRATED_ESTIMATE" | "STRICT_BOUND";
/**
 * THE ACTIVE PRICING MODE: REALISTIC_WORST_CASE (owner ruling, 2026-10-10, replacing the calibrated
 * average of option 2). Why, in one sentence: an average could let a debate start that then runs out
 * of money half-way, while a realistic worst case per step (64 KiB in, the full answer out) still fits
 * a whole debate in the $10.00 day, so a started debate is not cut off for money.
 * To switch (back to CALIBRATED_ESTIMATE, to STRICT_BOUND, or to a mode added beside these), change
 * this one constant; previewEstimatePricer and previewDebateCallCount follow it, nothing else reads it.
 * The calibrated average ignores a shaped run's writer and map step bounds, and a length receipt's guided allowance
 * (LG-C); switching to it under-prices those calls.
 */
export const PREVIEW_ESTIMATE_PRICING_MODE: PreviewPricingMode = "REALISTIC_WORST_CASE";
/** THE ONE PRICING SWITCH: the pricer for `mode` (default: the active mode above). */
export function previewEstimatePricer(context: Readonly<{ measured: PreviewMeasuredCallUsage; callOutputTokens: PreviewCallOutputTokens;
  storyTier?: PreviewStoryTier }>, mode: PreviewPricingMode = PREVIEW_ESTIMATE_PRICING_MODE): PreviewCallPricer {
  switch (mode) {
    case "REALISTIC_WORST_CASE": return realisticWorstCasePricer(context.callOutputTokens, context.storyTier);
    case "CALIBRATED_ESTIMATE": return calibratedEstimatePricer(context.measured);
    case "STRICT_BOUND": return strictUpperBoundPricer(context.callOutputTokens);
    default: return exhaustive(mode);
  }
}
/**
 * How a debate's own calls are counted: PER_STEP, each call site once (the owner's ruling of
 * 2026-10-10 for the realistic worst case: a repeat attempt is the exception, and the 15% margin and
 * the unbilled retry cover it); BASIS_CEILING, the larger of that and the basis's own
 * max_model_attempts, which counts every repeat attempt every site may make (the earlier modes).
 * A basis without a per-site split is always counted at its ceiling.
 */
export type PreviewDebateCallCount = "PER_STEP" | "BASIS_CEILING";
/** Only the calibrated mode reads the app's recorded usage (so only it can be refused for an unreadable ledger). */
export function previewModeReadsMeasuredUsage(mode: PreviewPricingMode = PREVIEW_ESTIMATE_PRICING_MODE): boolean {
  return mode === "CALIBRATED_ESTIMATE";
}
export function previewDebateCallCount(mode: PreviewPricingMode = PREVIEW_ESTIMATE_PRICING_MODE): PreviewDebateCallCount {
  return mode === "REALISTIC_WORST_CASE" ? "PER_STEP" : "BASIS_CEILING";
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
 * The calls one debate makes, from the basis admission resolved:
 * - debate: PER_STEP (the active mode's count), one call per site (`expectedCallsByRoleFromBasis`);
 *   BASIS_CEILING, the larger of that and the basis's own ceiling `max_model_attempts`, which counts
 *   every repeat attempt per site (a basis without a split is always counted at its ceiling);
 * - story: per round, the storyteller twice and the story checker twice (each one repair try; story format
 *   robustness, 2026-10-12: the checker's second try replaced its unbilled 60-second resend, so the calls are
 *   as many as before and the second one is priced);
 *   an engine-2 receipt counts its rounds twice: the backup storyteller's whole loop (engine redesign R1d);
 * - probes: the runner's paid health checks at every pickup, one per panel member plus one per role
 *   ref not on the panel, times (1 + the hold cap: `hold_cap` on the basis, else the register's,
 *   + PREVIEW_ESTIMATE_RESTART_PICKUPS);
 * - askProbes: the API's health checks of this ask (one per target, the careful side);
 * - unbilledRetries: owner ruling 5's one retry of a call the gate proved unbilled, at most one per
 *   one-attempt call (every debate call; the story's two calls have their own second try instead). It is
 *   counted against the gate's calls; it costs no money (the gate released that call's hold).
 *
 * Not counted, by owner ruling R3 (2026-10-11, "keep each step once"): the runner's final retry after
 * a cooldown at the author and reviewer steps. Since the preview retry fix (option B) that paid try can
 * happen on the preview too (the preview keeps the sealed lifetime bound and one POST per call); it is
 * left to the 15% margin, like a re-claim's repeat attempts. These numbers did not change.
 * Nor, by the same ruling (all-steps format robustness, 2026-10-12), a debate step's one format repair try on the
 * preview (`previewFormatRepairAllowed`, providers/preview-test.ts): a second, billed POST in the same call, sent only
 * after the step's reply failed its check. Like the final retry it is the exception, left to the margin; the gate still
 * reserves each POST at its row's whole bound before sending it, so it can never spend what the gate has not allowed.
 * The same holds for the patch follow-up (owner design, 2026-10-12): that second POST is now usually the SHORT one (the
 * model's own answer back, only the failing members asked for, mostly served from the vendor's prompt cache), and a
 * call whose second POST was a patch may send a third, the full re-ask, within the sealed bound. Each step is still
 * counted once here (owner ruling); the gate's per-POST reservation is unchanged, so no estimate number moved.
 */
export function previewExpectedCalls(input: Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  roleProviderRefs: readonly string[];
  storyRounds: number;
  maxCooldownHoldsPerRun: number;
  askProbeTargets?: number;
  debateCallCount?: PreviewDebateCallCount;
}>): PreviewExpectedCalls {
  if (!wholeNumber(input.storyRounds)) throw new TypeError("PREVIEW_STORY_ROUNDS_INVALID");
  if (!wholeNumber(input.maxCooldownHoldsPerRun)) throw new TypeError("PREVIEW_HOLD_CAP_INVALID");
  const askProbes = input.askProbeTargets ?? 0;
  if (!wholeNumber(askProbes)) throw new TypeError("PREVIEW_ASK_PROBE_TARGETS_INVALID");
  const sites = debateSitesByRole(input.basis);
  const ceiling = positiveInteger(input.basis.max_model_attempts) ? input.basis.max_model_attempts : 0;
  const perStep = (input.debateCallCount ?? previewDebateCallCount()) === "PER_STEP";
  const debate = sites !== null && perStep ? sites.total : Math.max(sites === null ? 0 : sites.total, ceiling);
  if (debate < 1) throw new TypeError("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
  const probes = previewPickups(input.basis, input.maxCooldownHoldsPerRun)
    * (input.panel.length + offPanelRoleRefs(input.panel, input.roleProviderRefs).length);
  const story = 4 * previewStoryRoundsOf(input.basis, input.storyRounds);
  const unbilledRetries = debate;
  return Object.freeze({ debate, story, probes, askProbes, unbilledRetries, total: debate + story + probes + askProbes + unbilledRetries });
}

/** The basis's one-call-per-site split: the panel's calls and the answer writer's and checker's; null without a split. */
function debateSitesByRole(basis: Readonly<Record<string, unknown>>):
  Readonly<{ panel: number; reviewer: number; authored: number; judge: number; answerWriter: number; answerChecker: number; total: number }> | null {
  let byRole: ReturnType<typeof expectedCallsByRoleFromBasis>;
  try {
    byRole = expectedCallsByRoleFromBasis(basis);
  } catch (error) {
    // I1: a debate-shape receipt is never priced as today's (never-under-count): its split must read. Engine redesign
    // R2: nor is an engine-2 receipt (its member present), whatever made its split refuse.
    if (previewShapeOf(basis) !== null || basis.engine !== undefined) throw error;
    return null;
  }
  const total = Object.values(byRole).reduce((sum, calls) => sum + calls, 0);
  if (total < 1) return null;
  return Object.freeze({ panel: total - byRole.ANSWER_WRITER - byRole.ANSWER_CHECKER, reviewer: byRole.REVIEWER,
    // The two parts of the non-review panel sites (panel − reviewer = authored + judge). On a shaped receipt POSITION
    // holds every map site too (answers + map sites) and JUDGE is (J + E) × nodes.
    authored: byRole.POSITION + byRole.SUPPORT_ATTACK + byRole.CROSS_EXCHANGE, judge: byRole.JUDGE,
    answerWriter: byRole.ANSWER_WRITER, answerChecker: byRole.ANSWER_CHECKER, total });
}

/**
 * Pre-flight PF-B35 (never under-count): the share of a shaped run's grading sites one GATE can make. A gate with g
 * panel members carries min(1, g / (J + E)), J the receipt's graders and E its close-call extras.
 * Proof: the receipt prices (J+E)·N grading sites over N nodes; each member grades a node at most once (no panel key is
 * asked twice), so a gate whose g members can sit in at most min(g, J+E) of a node's J+E seats makes at most
 * N·min(g, J+E) grading calls, a share of min(1, g/(J+E)); seat rotation by a per-site hash can put them on every node,
 * so this is the true worst case for every row value the parser allows (graders 1..5, extras 0..4, so J+E ≥ 1).
 * It assumes each route holds at most one judge seat per node.
 */
export function previewShapedGradingShare(input: Readonly<{ gateMembers: number; graders: number; closeCallExtraGraders: number }>):
  Readonly<{ numerator: bigint; denominator: bigint }> {
  const seats = input.graders + input.closeCallExtraGraders;
  if (!Number.isSafeInteger(input.gateMembers) || input.gateMembers < 1 || !Number.isSafeInteger(seats) || seats < 1) {
    throw new TypeError("PREVIEW_SHAPED_GRADING_SHARE_INVALID");
  }
  return Object.freeze({ numerator: BigInt(Math.min(input.gateMembers, seats)), denominator: BigInt(seats) });
}

/**
 * Per gate, the panel member whose realistic debate call costs the most (a model off the reviewed rows
 * is its own gate), in panel order, with how many panel members that gate serves.
 */
function dearestPanelMemberPerGate(panelModels: readonly string[]): readonly Readonly<{ model: string; gateMembers: number }>[] {
  const realisticCall = (model: string): bigint => {
    const row = previewModelRow(model);
    return row === undefined ? 0n : previewCallNanoUsd(row, PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, PREVIEW_GLM_GENERATION_TOKEN_FLOOR);
  };
  const dearest = new Map<string, { model: string; gateMembers: number }>();
  for (const model of panelModels) {
    const gate = previewGateKeyOf(model) ?? `model:${model}`;
    const current = dearest.get(gate);
    if (current === undefined) dearest.set(gate, { model, gateMembers: 1 });
    else dearest.set(gate, { model: realisticCall(model) > realisticCall(current.model) ? model : current.model, gateMembers: current.gateMembers + 1 });
  }
  return Object.freeze([...dearest.values()].map((entry) => Object.freeze(entry)));
}

/**
 * The kinds of call placed on one gate's dearest panel member: the roles a rotated debate places on a panel member
 * (spec 2026-10-11, Part 5; ANSWER is the answer checker, ANSWER_WRITER the writer), and a shaped run's map merge and
 * choose (controller ruling X1: any member may hold that seat).
 */
type PreviewRotatedRoleKind = "ANSWER" | "ANSWER_WRITER" | "MAP_MERGE" | "MAP_CHOOSE" | "STORYTELLER" | "STORY_CHECKER";

/**
 * Spec 2026-10-11 Part 5: of one gate's panel models, the one whose call of this role kind costs the
 * most at `pricer` (ANSWER_CHECKER for the answer checker; ANSWER_WRITER for the writer, controller ruling PF5; both are
 * final writers on every receipt, LG-B; MAP_MERGE / MAP_CHOOSE for the
 * map's two long steps; STORYTELLER + STORYTELLER_RETRY for the storyteller; STORY_CHECKER + STORY_CHECKER_RETRY for
 * the story checker). The first in panel order wins a tie.
 */
function dearestByPricer(pricer: PreviewCallPricer, rowOf: (model: string) => PreviewModelRow) {
  const cost = (model: string, role: PreviewRotatedRoleKind): bigint => {
    const row = rowOf(model);
    switch (role) {
      case "ANSWER": return pricer(row, "ANSWER_CHECKER");
      case "ANSWER_WRITER": case "MAP_MERGE": case "MAP_CHOOSE": return pricer(row, role);
      case "STORYTELLER": return pricer(row, "STORYTELLER") + pricer(row, "STORYTELLER_RETRY");
      case "STORY_CHECKER": return pricer(row, "STORY_CHECKER") + pricer(row, "STORY_CHECKER_RETRY");
      default: return exhaustive(role);
    }
  };
  return (models: readonly string[], role: PreviewRotatedRoleKind): string =>
    models.reduce((best, model) => cost(model, role) > cost(best, role) ? model : best);
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
 * - the storyteller's two attempts and the story checker's two per round on the story roles' models;
 * - the runner's health checks at every pickup on each panel member's model and each off-panel role's
 *   (`roleModelOfRef`), and this ask's own health checks on the models of `askProbeModelIds`;
 * - one unbilled retry per debate call (same split); the story's calls have their second try instead.
 * `storyOnly` keeps only the story's part (a debate whose answer is served and story not yet written).
 * `rotated` (spec 2026-10-11, Part 5): the four roles are panel members, so each role's calls go on
 * every gate that has a panel member, at that gate's `dearestFor` member, and no off-panel role ref
 * is health-checked; without it, today's split exactly.
 * Every receipt: the writer's sites are ANSWER_WRITER calls and the checker's ANSWER_CHECKER calls (LG-B); a debate-shape
 * receipt (spec 2026-10-12, read only through the strict reader, PF7) also takes the map's one merge and one choose
 * (controller ruling X1) out of the panel's even share and charges them, as MAP_MERGE / MAP_CHOOSE, one whole call each
 * on every gate at its dearest panel member
 * (`dearestFor` at that call's price; a shaped receipt requires it): whichever member holds that seat, its gate
 * is never under-charged. Every other map site (the angles, the lists, a list asked again, the gap rounds) stays an
 * evenly shared debate call. Today's receipt: today's shares exactly.
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
  /** LG-A: the structure-repair model (PreviewBudgetGateSettings.structureRepairModel); absent or null counts none. */
  structureRepairModel?: string | null;
  roleModelOfRef?: (ref: string) => string;
  storyOnly?: boolean;
  debateCallCount?: PreviewDebateCallCount;
  /** Spec 2026-10-11 Part 5: a rotated debate; its four roles are panel members, priced per gate at `dearestFor`. */
  rotated?: boolean;
  /**
   * Required with `rotated` or a debate-shape receipt (M2: a shaped run's map merge and choose, X1, are seated at each
   * gate's dearest member at THEIR price, never at a debate call's).
   */
  dearestFor?: (models: readonly string[], role: PreviewRotatedRoleKind) => string;
}>): PreviewCallShares {
  const rotated = input.rotated === true;
  // Debate shape: the writer's sites are priced at the run's writer bound, and the map's merge and choose (one site
  // each, X1) at its map step bounds; today's receipt keeps them all as DEBATE and has no map.
  const shaped = previewShapeOf(input.basis) !== null;
  // Engine redesign R2 (INTERFACE §3.4; spec §10: the estimate stays a ceiling that never under-counts): an engine-2
  // receipt's comparing judges, investigations (at their cap) and answer check are taken out of the even and grading
  // shares below and charged per gate at its dearest panel member: min(g, judges) judge calls (never two judges of one
  // maker, so a gate of g members holds at most g seats), every investigation and the check in full (any member may
  // hold those seats). Engine 1: all three are 0n and every share below is today's.
  const engineSites = previewEngineOf(input.basis)?.sites ?? null;
  const judgeSites = BigInt(engineSites?.comparingJudges ?? 0);
  const investigationSites = BigInt(engineSites?.investigations ?? 0);
  const checkSites = BigInt(engineSites?.answerCheck ?? 0);
  if ((rotated || shaped) && input.dearestFor === undefined) throw new TypeError("PREVIEW_ROTATION_PRICER_MISSING");
  const askProbeModelIds = input.askProbeModelIds ?? [];
  const expected = previewExpectedCalls({ ...input, roleProviderRefs: rotated ? [] : input.roleProviderRefs,
    askProbeTargets: askProbeModelIds.length });
  if (!rotated && input.storyRounds > 0 && (input.roleModels.storyteller === null || input.roleModels.storyChecker === null)) {
    throw new TypeError("PREVIEW_STORY_ROLE_MISSING");
  }
  const sites = debateSitesByRole(input.basis);
  // A panel the run row does not carry (never on a live run) leaves its calls to the answer writer.
  const panelModels = input.panel.length > 0 ? input.panel.map((member) => member.model_id) : [input.roleModels.answerWriter];
  const members = BigInt(panelModels.length);
  const siteCount = BigInt(sites === null ? 1 : sites.total);
  const denominator = members * siteCount;
  const debate = BigInt(expected.debate);
  // A rotated debate: each gate's panel models, in panel order (a model off the reviewed rows is its own gate).
  const panelGates = new Map<string, string[]>();
  for (const model of panelModels) {
    const gate = previewGateKeyOf(model) ?? `model:${model}`;
    panelGates.set(gate, [...(panelGates.get(gate) ?? []), model]);
  }
  const perGate = (role: PreviewRotatedRoleKind): readonly string[] =>
    [...panelGates.values()].map((models) => input.dearestFor!(models, role));
  const shares: PreviewCallShare[] = [];
  const add = (model: string, type: PreviewCallType, numerator: bigint): void => {
    if (numerator > 0n) shares.push(Object.freeze({ model, type, numerator }));
  };
  const addDebate = (model: string, numerator: bigint, type: PreviewCallType = "DEBATE"): void => {
    add(model, type, numerator);
    add(model, "UNBILLED_RETRY", numerator);
  };
  // LG-B (L26): the writer is a final writer on every receipt.
  const writerType: PreviewCallType = "ANSWER_WRITER";
  const mapLongSites = shaped ? 2n : 0n;
  if (input.storyOnly !== true) {
    if (sites === null) {
      for (const model of panelModels) addDebate(model, debate);
    } else {
      if (shaped) {
        // Debate shape (pre-flight PF-B35, PF-B36; the owner's never-under-count rule): A answers, J graders and E
        // close-call extras can be fewer than the M members, and the writer and judge seats rotate, so one member can
        // author or grade far more than 1/M. Each gate, at its dearest panel member: the authored sites (positions,
        // points, replies, cross-replies, every map site but the merge and the choose, priced below) IN FULL, the review
        // leg's rule; and min(1, g / (J + E)) of the grading sites (`previewShapedGradingShare`), rounded up.
        const shape = previewShapeOf(input.basis)!;
        for (const { model, gateMembers } of dearestPanelMemberPerGate(panelModels)) {
          addDebate(model, (BigInt(sites.authored) - mapLongSites - checkSites) * debate * members);
          const grading = previewShapedGradingShare({ gateMembers, graders: shape.graders, closeCallExtraGraders: shape.closeCallExtraGraders });
          addDebate(model, ((BigInt(sites.judge) - judgeSites) * debate * members * grading.numerator + grading.denominator - 1n) / grading.denominator);
        }
      } else {
        // Every panel step but the reviews is shared evenly: each member states one position, authors its own
        // root's tree and its cross-exchanges, and judges every node another maker authored (apps/runner/src/
        // index.ts:5291-5326: the judge seats called per node are all the others, panelCallCap = members - 1).
        for (const model of panelModels) addDebate(model, (BigInt(sites.panel - sites.reviewer) - mapLongSites - judgeSites - checkSites) * debate);
      }
      // A node's ONE review goes to a different maker taken in turn round the debate's seeded circle
      // (selectDifferentMakerReviewer, apps/runner/src/index.ts), even per author over a long debate but
      // not per member in a short one, so one member can still take more than an even share. So each gate
      // is charged, at its dearest panel member,
      // every review its members could take: all of them when it has two or more panel members, else the
      // reviews of the other members' nodes (a member never reviews its own maker's nodes, an even
      // 1/members of them). The careful side: with two gates a review is counted on both.
      for (const { model, gateMembers } of dearestPanelMemberPerGate(panelModels)) {
        addDebate(model, (BigInt(sites.reviewer) - investigationSites) * debate * (gateMembers >= 2 ? members : members - 1n));
      }
      if (engineSites !== null) {
        // R2: the engine's sites on each gate's dearest member (see above): a gate of g members can hold at most
        // min(g, judges) judge seats; any member may take an investigation or the check, so each gate carries them all.
        for (const { model, gateMembers } of dearestPanelMemberPerGate(panelModels)) {
          const seats = BigInt(Math.min(gateMembers, engineSites.comparingJudges));
          addDebate(model, (seats + investigationSites + checkSites) * debate * members);
        }
      }
      if (shaped) {
        // X1: one merge and one choose per run; any member may hold the seat, so every gate carries each whole call.
        for (const type of ["MAP_MERGE", "MAP_CHOOSE"] as const) for (const model of perGate(type)) addDebate(model, debate * members, type);
      }
      if (rotated) {
        // The careful side: every gate carries the writer's and checker's sites at its dearest member (spec Part 5); the
        // writer's member at the writer's own price (PF5), the checker's at the checker's (both final writers, LG-B).
        for (const models of panelGates.values()) {
          addDebate(input.dearestFor!(models, "ANSWER_WRITER"), BigInt(sites.answerWriter) * debate * members, writerType);
          addDebate(input.dearestFor!(models, "ANSWER"), BigInt(sites.answerChecker) * debate * members, "ANSWER_CHECKER");
        }
      } else {
        addDebate(input.roleModels.answerWriter, BigInt(sites.answerWriter) * debate * members, writerType);
        addDebate(input.roleModels.answerChecker, BigInt(sites.answerChecker) * debate * members, "ANSWER_CHECKER");
      }
    }
    const pickups = BigInt(previewPickups(input.basis, input.maxCooldownHoldsPerRun)) * denominator;
    const modelOfRef = input.roleModelOfRef ?? ((ref: string) => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`);
    for (const member of input.panel) add(member.model_id, "PROBE", pickups);
    // A rotated debate's roles are panel members, already health-checked above.
    if (!rotated) for (const ref of offPanelRoleRefs(input.panel, input.roleProviderRefs)) add(modelOfRef(ref), "PROBE", pickups);
    for (const model of askProbeModelIds) add(model, "PROBE", denominator);
  }
  // Engine redesign (R1d decision 7): an engine-2 receipt's story rounds count twice (the backup storyteller's worst case).
  const rounds = BigInt(previewStoryRoundsOf(input.basis, input.storyRounds)) * denominator;
  if (rounds > 0n) {
    const tellers = rotated ? perGate("STORYTELLER") : [input.roleModels.storyteller!];
    const checkers = rotated ? perGate("STORY_CHECKER") : [input.roleModels.storyChecker!];
    for (const model of tellers) {
      add(model, "STORYTELLER", rounds);
      add(model, "STORYTELLER_RETRY", rounds);
    }
    for (const model of checkers) {
      add(model, "STORY_CHECKER", rounds);
      add(model, "STORY_CHECKER_RETRY", rounds);
    }
    // LG-A (L32): a story try's second POST may instead be the structure-repair call on the repair model; it is counted
    // there too, per round and story role, so the repair model's gate is never under-counted (the step's own gate keeps
    // its count: the estimate stays a ceiling). Task 14 controller ruling: as STRUCTURE_REPAIR, at the repair call's own
    // ceiling, never as a story retry (a checker's retry asks half the repair's answer cap). The repair call carries no
    // repair packet of its own, so the preview policy gives it owner ruling 5's one resend after an unbilled refusal: that
    // UNBILLED_RETRY is counted with it, as for every debate call (Task 14 review).
    const repairModel = input.structureRepairModel ?? null;
    if (repairModel !== null) addDebate(repairModel, rounds * BigInt(tellers.length + checkers.length), "STRUCTURE_REPAIR");
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
  structureRepairModel?: string | null;
}>;

/**
 * Pure: what a NEW debate needs of each gate, at `pricer` and `debateCallCount` (defaults: the active
 * mode, with no measured usage). Throws for a model the preview does not review. `rotated` (spec
 * 2026-10-11, Part 5): the roles are panel members, priced on each gate at its dearest member, and the
 * register's role models are not on any gate's model list.
 */
export function estimatePreviewGateNeeds(input: PreviewEstimateSettings & Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  pricer?: PreviewCallPricer;
  debateCallCount?: PreviewDebateCallCount;
  rotated?: boolean;
}>): readonly PreviewGateNeed[] {
  if (input.panel.length === 0) throw new TypeError("PREVIEW_PANEL_EMPTY");
  const reviewedRow = (model: string): PreviewModelRow => {
    const row = previewModelRow(model);
    if (row === undefined || previewGateKeyOf(model) === undefined) throw new TypeError("PREVIEW_MODEL_UNREVIEWED");
    return row;
  };
  const rotated = input.rotated === true;
  const byGate = new Map<PreviewGateKey, string[]>();
  for (const model of new Set([...input.panel.map((member) => member.model_id), ...(rotated ? [] : roleModelList(input.roleModels))])) {
    const gate = previewGateKeyOf(reviewedRow(model).model)!;
    byGate.set(gate, [...(byGate.get(gate) ?? []), model]);
  }
  const pricer = input.pricer
    ?? previewEstimatePricer({ measured: [], callOutputTokens: previewOutputTokensForBasis(input.callOutputTokens, input.basis) });
  return gateNeeds(byGate, previewCallShares({ ...input, dearestFor: dearestByPricer(pricer, reviewedRow) }), reviewedRow, pricer);
}

/**
 * Pure: what an UNFINISHED earlier debate is still held for, per gate. Still debating: its whole
 * estimate again, ask-time probes aside (over-counting what it already spent, which the gate's
 * remaining figure also reflects; that is the careful side). Only writing its story: the story's
 * calls. A model off the reviewed rows (an older run, from before any other provider's gate
 * existed) is priced at the DeepInfra row whose average debate call is dearest, on the DeepInfra gate.
 */
export function estimateUnfinishedRunHolds(run: PreviewUnfinishedRun, settings: PreviewEstimateSettings,
  pricer: PreviewCallPricer = previewEstimatePricer({ measured: [], callOutputTokens: previewOutputTokensForBasis(settings.callOutputTokens, run.basis) }),
  debateCallCount: PreviewDebateCallCount = previewDebateCallCount()): readonly PreviewGateNeed[] {
  const dearestRow = PREVIEW_MODEL_ROWS_BY_PROVIDER.deepinfra.reduce((best, row) => pricer(row, "DEBATE") > pricer(best, "DEBATE") ? row : best);
  const rowOf = (model: string): PreviewModelRow => previewModelRow(model) ?? dearestRow;
  // Spec 2026-10-11 Part 5: a rotated debate is held with the rotated pricing (its roles are panel members).
  const rotated = run.rotated === true;
  const byGate = new Map<PreviewGateKey, string[]>();
  for (const model of new Set([...run.panel.map((member) => member.model_id), ...(rotated ? [] : roleModelList(settings.roleModels))])) {
    const gate = previewGateKeyOf(rowOf(model).model) ?? "deepinfra";
    byGate.set(gate, [...(byGate.get(gate) ?? []), model]);
  }
  const calls = previewCallShares({ ...settings, askProbeModelIds: [], basis: run.basis, panel: run.panel,
    roleModelOfRef: (ref) => previewModelRowForRef(ref)?.model ?? dearestRow.model, storyOnly: run.phase === "STORY", debateCallCount,
    dearestFor: dearestByPricer(pricer, rowOf), ...(rotated ? { rotated: true } : {}) });
  return gateNeeds(byGate, calls, rowOf, pricer);
}

/**
 * The money one gate must still have: the debate's calls plus what it may hold at once for calls in flight. LG-B
 * (deviation 4): a gate whose GO names final-writer slots holds those slots at the largest final-writer worst case and
 * the others at the largest standard one; a gate that names none, exactly as before.
 */
export function previewGateEstimateNanoUsd(need: PreviewGateNeed, remaining: PreviewGateRemaining): bigint {
  const slots = BigInt(remaining.maxConcurrentCalls);
  const finalWriter = BigInt(Math.min(remaining.finalWriterMaxInFlight ?? 0, remaining.maxConcurrentCalls));
  const largest = remaining.largestReservationNanoUsd;
  const finalWriterLargest = remaining.largestFinalWriterReservationNanoUsd ?? 0n;
  return need.callsNanoUsd + (slots - finalWriter) * largest + finalWriter * (finalWriterLargest > largest ? finalWriterLargest : largest);
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

/** The versions this process has already said it priced at the API's own terms (one line per version per process). */
const VERSION_TERMS_FALLBACK_SAID = new Set<number>();
/**
 * Side-by-side C16 review (controller ruling): an unfinished debate whose register version's terms cannot be read is
 * priced at the API's own terms, as every debate was before C16, rather than refusing every preview ask while it is
 * unfinished. Nothing is kept as that version's terms (the next ask reads it again); the operator line is content-free
 * (the version number only) and printed once per version per process.
 */
function versionTermsFallback(gate: PreviewBudgetGateSettings, version: number): PreviewVersionTerms {
  if (!VERSION_TERMS_FALLBACK_SAID.has(version)) {
    VERSION_TERMS_FALLBACK_SAID.add(version);
    console.error(JSON.stringify({ event: "api.preview_estimate.version_terms_fallback", version }));
  }
  return Object.freeze({ roleModels: gate.roleModels, roleProviderRefs: gate.roleProviderRefs, storyRounds: gate.storyRounds,
    callOutputTokens: gate.callOutputTokens, maxCooldownHoldsPerRun: gate.maxCooldownHoldsPerRun });
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
/**
 * Review (2026-10-10): waiting asks must not hold pool connections. Each ask used to take a connection
 * and block in pg_advisory_xact_lock with no timeout, while the holder needed ANOTHER connection from
 * the same pool (the unfinished debates, then the run): about as many waiting asks as the pool has
 * connections froze the whole API. Now the asks of this process queue IN PROCESS first (the preview
 * API is one process), so at most one of them holds a connection for the lock; a wait longer than
 * PREVIEW_ADMISSION_WAIT_MS gives up. The database lock stays (another process) with a lock_timeout
 * backstop. Either failure refuses as "not reachable right now" (retry in a minute), never the
 * daily-limit sentence.
 */
const PREVIEW_ADMISSION_WAIT_MS = 30_000;
const PREVIEW_ADMISSION_LOCK_TIMEOUT = "10s";
type InProcessTurns = { held: boolean; waiting: Array<() => void> };
const IN_PROCESS_TURNS = new WeakMap<object, InProcessTurns>();
/** Waits for this process's turn at `key`; resolves to a release function, or rejects after `waitMs`. */
function inProcessTurn(key: object, waitMs: number): Promise<() => void> {
  let turns = IN_PROCESS_TURNS.get(key);
  if (turns === undefined) { turns = { held: false, waiting: [] }; IN_PROCESS_TURNS.set(key, turns); }
  const queue = turns;
  let done = false;
  const releaseTurn = (): void => {
    if (done) return;
    done = true;
    const next = queue.waiting.shift();
    if (next === undefined) queue.held = false; else next();
  };
  if (!queue.held) {
    queue.held = true;
    return Promise.resolve(releaseTurn);
  }
  return new Promise((resolve, reject) => {
    const grant = (): void => { clearTimeout(timer); resolve(releaseTurn); };
    const timer = setTimeout(() => {
      const index = queue.waiting.indexOf(grant);
      if (index >= 0) queue.waiting.splice(index, 1);
      reject(new TypeError("PREVIEW_ADMISSION_WAIT_EXPIRED"));
    }, waitMs);
    queue.waiting.push(grant);
  });
}
export function createPreviewAdmissionLock(pool: Pick<Pool, "connect">,
  options: Readonly<{ waitMs?: number }> = {}): PreviewAdmissionLock {
  let client: PoolClient | undefined;
  let releaseTurn: (() => void) | undefined;
  let released = false;
  const freeTurn = (): void => {
    const turn = releaseTurn;
    releaseTurn = undefined;
    turn?.();
  };
  const release = async (): Promise<void> => {
    released = true;
    const held = client;
    client = undefined;
    try {
      if (held === undefined) return;
      let broken: Error | undefined;
      try { await held.query("COMMIT"); } catch (error) {
        broken = error instanceof Error ? error : new Error("PREVIEW_ADMISSION_LOCK_RELEASE_FAILED");
      }
      // A connection whose COMMIT failed is destroyed, never reused with the lock possibly held.
      held.release(broken);
    } finally {
      freeTurn();
    }
  };
  return Object.freeze({
    async acquire() {
      if (client !== undefined) return;
      if (released) throw new TypeError("PREVIEW_ADMISSION_LOCK_RELEASED");
      releaseTurn ??= await inProcessTurn(pool, options.waitMs ?? PREVIEW_ADMISSION_WAIT_MS);
      if (released) { freeTurn(); throw new TypeError("PREVIEW_ADMISSION_LOCK_RELEASED"); }
      let connection: PoolClient;
      try {
        connection = await pool.connect();
      } catch (error) {
        freeTurn();
        throw error;
      }
      client = connection;
      try {
        await connection.query("BEGIN");
        await connection.query(`SET LOCAL lock_timeout = '${PREVIEW_ADMISSION_LOCK_TIMEOUT}'`);
        await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [PREVIEW_ADMISSION_LOCK_NAME]);
      } catch (error) {
        client = undefined;
        connection.release(error instanceof Error ? error : new Error("PREVIEW_ADMISSION_LOCK_FAILED"));
        freeTurn();
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
  input: Readonly<{ basis: Readonly<Record<string, unknown>>; panel: readonly PreviewPanelMember[]; storyTier?: PreviewStoryTier;
    /** Spec 2026-10-11 Part 5: the debate has a rotation pick (its roles are panel members). */
    rotated?: boolean }>,
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
    // The active mode prices and counts (the calibrated mode would use the app's own recorded usage);
    // the same pricing and count hold back every unfinished debate, so a new debate and a running
    // one are counted alike.
    const measured = previewModeReadsMeasuredUsage() ? await gate!.readMeasuredCallUsage?.() ?? [] : [];
    // Debate shape: each debate, new or unfinished, is priced at ITS OWN receipt's writer and map step bounds.
    const pricerFor = (storyTier: PreviewStoryTier | undefined, basis: Readonly<Record<string, unknown>>,
      callOutputTokens: PreviewCallOutputTokens) =>
      previewEstimatePricer({ measured, callOutputTokens: previewOutputTokensForBasis(callOutputTokens, basis),
        storyTier: storyTier ?? PREVIEW_STORY_TIER_FALLBACK });
    const debateCallCount = previewDebateCallCount();
    needs = estimatePreviewGateNeeds({ basis: input.basis, panel: input.panel, ...gate!,
      pricer: pricerFor(input.storyTier, input.basis, gate!.callOutputTokens), debateCallCount,
      ...(input.rotated === true ? { rotated: true } : {}) });
    const unfinished = await gate!.readUnfinishedRuns();
    if (unfinished.length > PREVIEW_UNFINISHED_RUNS_MAX) throw new TypeError("PREVIEW_UNFINISHED_RUNS_TOO_MANY");
    held = new Map();
    for (const run of unfinished) {
      // Side-by-side spec §4 (plan C16): an unfinished debate is held at ITS OWN register version's roles, story and
      // bounds (another release may have admitted it); the new debate above keeps the API's. A version whose terms
      // cannot be read is held at the API's own (C16 review), never a refusal of every ask.
      const terms = await gate!.termsForVersion(run.registerVersion)
        .catch(() => versionTermsFallback(gate!, run.registerVersion));
      for (const hold of estimateUnfinishedRunHolds(run, { ...gate!, ...terms },
        pricerFor(run.storyTier, run.basis, terms.callOutputTokens), debateCallCount)) {
        const sum = held.get(hold.gate) ?? { calls: 0, nanoUsd: 0n };
        held.set(hold.gate, { calls: sum.calls + hold.callsWithMargin, nanoUsd: sum.nanoUsd + hold.callsNanoUsd });
      }
    }
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "estimate failed");
  }
  for (const need of needs) {
    const port = gate!.remaining[need.gate];
    if (port === undefined) return unavailable(`no remaining port for gate ${need.gate}`);
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
 * - STORY ($1): no live job, an answer served, no story row yet, and a model call finished within
 *   the last $2 seconds (the story runs after the job is DONE). Side-by-side spec §4 (plan C16): the
 *   API passes true, so each debate's OWN register version decides whether it has a story (a version
 *   without one holds no story calls); `register_version` names it.
 * A debate between its start and its first job is never seen here: the admission lock is held until
 * that job is queued. `rotated` (spec 2026-10-11): the run has a role rotation pin. Plain columns only;
 * never content.
 */
export const PREVIEW_UNFINISHED_RUNS_SQL = `SELECT run.envelope_basis, run.discovered_panel, run.composition_budget_tier,
              run.register_version::integer AS register_version,
              EXISTS (SELECT 1 FROM core.run_role_rotation AS rotation WHERE rotation.run_id = run.run_id) AS rotated,
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

/** One row of PREVIEW_UNFINISHED_RUNS_SQL as the estimate reads it; a malformed row refuses (PREVIEW_UNFINISHED_RUN_UNREADABLE). */
export function previewUnfinishedRunFrom(row: Readonly<{
  envelope_basis: unknown; discovered_panel: unknown; phase?: unknown; composition_budget_tier?: unknown; rotated?: unknown;
  register_version: unknown;
}>): PreviewUnfinishedRun {
  const basis = row.envelope_basis;
  const panel = row.discovered_panel;
  if (typeof basis !== "object" || basis === null || Array.isArray(basis) || !Array.isArray(panel)
    || panel.some((member) => typeof member !== "object" || member === null
      || typeof (member as Record<string, unknown>).provider_ref !== "string"
      || typeof (member as Record<string, unknown>).model_id !== "string")
    || (row.phase !== "DEBATE" && row.phase !== "STORY")
    || (row.rotated !== undefined && typeof row.rotated !== "boolean")
    || !positiveInteger(row.register_version)) {
    throw new TypeError("PREVIEW_UNFINISHED_RUN_UNREADABLE");
  }
  return Object.freeze({
    basis: basis as Readonly<Record<string, unknown>>,
    panel: Object.freeze((panel as Array<Record<string, string>>).map((member) =>
      Object.freeze({ provider_ref: member.provider_ref!, model_id: member.model_id! }))),
    phase: row.phase,
    registerVersion: row.register_version,
    storyTier: previewStoryTierOf(row.composition_budget_tier),
    rotated: row.rotated === true
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
 * of the three organ bounds and the two synthesis bounds), the story checker at its ceiling. The
 * storyteller (story format robustness, 2026-10-12) asks for its row's story allowance
 * (previewStorytellerTokenCeiling), whatever the register seals: this is the largest of them, and the
 * pricer prices every row at its own allowance (slow answer, owner ruling 2026-10-12: 16,384 on MiMo, Qwen
 * and GLM), so each row is priced at exactly what it is sent. Its second attempt is at the length-retry
 * ceiling of the row's own allowance, which the row's bound holds, as the gateway does.
 */
export function previewCallOutputTokens(config: PreviewProviderTestConfig, ceilings: Readonly<{
  debate: readonly number[]; story: Readonly<{ storyteller: number; checker: number }> | null;
}>): PreviewCallOutputTokens {
  if (ceilings.debate.length === 0 || !ceilings.debate.every(positiveInteger)) throw new TypeError("PREVIEW_CALL_CEILINGS_INVALID");
  const sent = (tokenCeiling: number) => previewCallBound({ maxAttempts: 1, tokenCeiling, deadlineMs: 1 }, config).tokenCeiling;
  const storyteller = ceilings.story === null ? 0
    : Math.max(...Object.values(PREVIEW_MODEL_ROWS_BY_PROVIDER).flat().map(previewStorytellerTokenCeiling));
  return Object.freeze({
    debate: Math.max(...ceilings.debate.map(sent)),
    storyteller,
    storytellerRetry: lengthRetryTokenCeiling(storyteller, 1),
    storyChecker: ceilings.story === null ? 0 : sent(ceilings.story.checker)
  });
}

/**
 * Debate shape: the run's frozen sizes, read ONLY through the shared strict reader (`admittedShapeOf`, built on
 * `parseCostEnvelopeBasis`; controller ruling PF7); null for today's receipt, a refusal for a malformed shaped one.
 */
function previewShapeOf(basis: Readonly<Record<string, unknown>>): DebateShapeCeilingInput | null {
  return admittedShapeOf(basis)?.shape ?? null;
}

/**
 * Engine redesign (R1d; R2 B10, INTERFACE §3.4): the run's engine-2 settings from its receipt, read ONLY through the one
 * shared strict reader (`admittedEngineOf`, as `previewShapeOf` reads `admittedShapeOf`); null for a receipt without the
 * member (engine 1). A malformed member, or one without the length member, is refused ("malformed engine member"),
 * never priced as engine 1.
 */
function previewEngineOf(basis: Readonly<Record<string, unknown>>): EngineSettings | null {
  return admittedEngineOf(basis);
}

/**
 * The story rounds a debate is priced at (R1d decision 7). Engine 2: twice the register's rounds, because when the first
 * storyteller's round 1 fails for good the story runs its whole loop once more with a backup storyteller (the worst case,
 * so the ceiling never under-counts). Engine 1: the register's rounds, exactly as today.
 */
function previewStoryRoundsOf(basis: Readonly<Record<string, unknown>>, storyRounds: number): number {
  return previewEngineOf(basis) === null ? storyRounds : 2 * storyRounds;
}

/** Debate shape: the run's answer-writer bound from its receipt (`shape.writer_bound`), or null for today's receipt. */
export function previewShapeWriterBound(basis: Readonly<Record<string, unknown>>): number | null {
  return previewShapeOf(basis)?.writerBound ?? null;
}

/**
 * The debate steps priced as DEBATE calls (the answer writer and checker are final writers, priced at the row's own
 * maximum since LG-B; the map's allowance is priced beside them on a shaped run, `mapLengthAllowanceTokens`; the story's LG-D's).
 */
const PREVIEW_LENGTH_DEBATE_STEPS = Object.freeze(["opening", "pros_cons", "cross_exchange", "judge_panel", "reviewer"] as const);

/** Engine redesign R2 (B10): an engine-2 receipt's comparing judges and investigators, priced as DEBATE calls too. */
const PREVIEW_ENGINE_DEBATE_STEPS = Object.freeze(["comparing_judge", "investigator"] as const);

/**
 * The output tokens one debate is priced at: the gate's, with the answer writer raised to the run's own writer bound
 * and the map's merge and choose to its map step bounds (X1), never below a debate call's. Length guidance (spec
 * 2026-10-15 §3.3, §3.10): with the receipt's `length`, every debate call at the largest guided allowance of its steps, as
 * the runner sends them (the writer and checker need no raise: LG-B prices them at the row's own maximum), and on a
 * shaped run at least a map call's guided allowance (a map runs only with the shape). Today's receipt: `output` itself.
 */
export function previewOutputTokensForBasis(output: PreviewCallOutputTokens, basis: Readonly<Record<string, unknown>>): PreviewCallOutputTokens {
  const shape = previewShapeOf(basis);
  const shaped: PreviewCallOutputTokens = shape === null ? output : Object.freeze({ ...output,
    answerWriter: Math.max(output.debate, shape.writerBound),
    mapMerge: Math.max(output.debate, shape.mapMergeBound), mapChoose: Math.max(output.debate, shape.mapChooseBound) });
  const length = admittedLengthOf(basis);
  if (length === null) return shaped;
  const mapTokens = shape === null ? [] : [mapLengthAllowanceTokens(length, shaped.debate, previewEngineOf(basis) !== null)];
  return Object.freeze({ ...shaped,
    // R2 B10: an engine-2 receipt's judge and investigator calls ask their own steps' allowance (engine 1: none added).
    debate: Math.max(...[...PREVIEW_LENGTH_DEBATE_STEPS, ...(previewEngineOf(basis) === null ? [] : PREVIEW_ENGINE_DEBATE_STEPS)]
      .map((step) => lengthGuidanceAllowanceTokens(length, step, shaped.debate)), ...mapTokens) });
}

/** One read-only /remaining port per gate the config names: DeepInfra's always, Anthropic's when set. */
export function previewRemainingPorts(
  config: PreviewProviderTestConfig
): PreviewBudgetGateSettings["remaining"] {
  const remaining: Partial<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>> = {};
  for (const provider of PREVIEW_PROVIDER_NAMES) {
    const socket = previewProviderSocket(config, provider);
    if (socket === undefined) continue;
    const port = createPreviewRemainingRpcPort({ budget_socket: socket, scope_id: config.scope_id });
    remaining[provider] = (signal?: AbortSignal) => port.remaining(signal);
  }
  return Object.freeze(remaining);
}

/**
 * One register version's terms (PreviewVersionTerms). The role refs are the version's sealed provider refs; one the
 * preview does not review is kept as an unknown id, so pricing refuses (fail closed) rather than guessing a price. The
 * story rows are optional (absent reads as no story); a malformed story family refuses.
 */
async function readPreviewVersionTerms(pool: Pool, registerVersion: number, config: PreviewProviderTestConfig): Promise<PreviewVersionTerms> {
  const roles = await readSynthesisRoleControls(pool, registerVersion);
  const story = await readStoryPolicyFromRegister(pool, registerVersion);
  const structural = await readStructuralCeilingPolicyInputs(pool, registerVersion);
  const organCeilings = await readOrganTokenCeilings(pool, registerVersion);
  const refs = [roles.synthesizerRoleRef, roles.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])];
  const modelOfRef = (ref: string): string => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`;
  return Object.freeze({
    roleModels: Object.freeze({
      answerWriter: modelOfRef(roles.synthesizerRoleRef), answerChecker: modelOfRef(roles.evaluatorRoleRef),
      storyteller: story === null ? null : modelOfRef(story.storytellerRoleRef),
      storyChecker: story === null ? null : modelOfRef(story.storyCheckerRoleRef)
    }),
    roleProviderRefs: Object.freeze([...new Set(refs)]),
    storyRounds: story === null ? 0 : story.loopMaxRounds,
    callOutputTokens: previewCallOutputTokens(config, {
      debate: [...organCeilings, roles.synthesizerBound.tokenCeiling, roles.evaluatorBound.tokenCeiling],
      story: story === null ? null : { storyteller: story.storytellerBound.tokenCeiling, checker: story.checkerBound.tokenCeiling }
    }),
    maxCooldownHoldsPerRun: structural.maxCooldownHoldsPerRun
  });
}

/**
 * Boot: the admission settings for the preview, from its config and the register version in force (its terms, read by
 * `readPreviewVersionTerms`; a version the boot cannot read refuses the boot). `askProbeModelIds` are the models of the
 * declared targets the API health-checks at ask time.
 *
 * Side-by-side spec §4 (plan C16): `termsForVersion` reads another version's terms for an unfinished debate admitted
 * under it, once per version: a sealed version never changes, so the kept terms need no expiry (at most
 * PREVIEW_UNFINISHED_RUNS_MAX versions can be asked for per estimate). A read that fails is not kept, so the next ask
 * reads it again. The API's own version is kept from the boot.
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
  const own = await readPreviewVersionTerms(pool, registerVersion, config);
  const kept = new Map<number, Promise<PreviewVersionTerms>>([[registerVersion, Promise.resolve(own)]]);
  return Object.freeze({
    remaining: previewRemainingPorts(config),
    ...own,
    askProbeModelIds: Object.freeze([...askProbeModelIds]),
    structureRepairModel: askProbeModelIds.includes(PREVIEW_STRUCTURE_REPAIR_MODEL) ? PREVIEW_STRUCTURE_REPAIR_MODEL : null,
    readUnfinishedRuns: async () => {
      const result = await pool.query<{ envelope_basis: unknown; discovered_panel: unknown; phase: unknown; composition_budget_tier: unknown;
        rotated: unknown; register_version: unknown }>(
        PREVIEW_UNFINISHED_RUNS_SQL, [true, PREVIEW_STORY_HOLD_WINDOW_SECONDS]);
      return Object.freeze(result.rows.map(previewUnfinishedRunFrom));
    },
    termsForVersion: (version: number) => {
      if (!positiveInteger(version)) return Promise.reject(new TypeError("PREVIEW_REGISTER_VERSION_INVALID"));
      const known = kept.get(version);
      if (known !== undefined) return known;
      const read = readPreviewVersionTerms(pool, version, config);
      kept.set(version, read);
      read.catch(() => { if (kept.get(version) === read) kept.delete(version); });
      return read;
    },
    readMeasuredCallUsage: async () => {
      const result = await pool.query<{ provider_ref: unknown; spend_source: unknown; calls: unknown; input_tokens: unknown; output_tokens: unknown }>(
        PREVIEW_MEASURED_USAGE_SQL, [[...PREVIEW_REVIEWED_PROVIDER_REFS], PREVIEW_CALIBRATION_WINDOW_DAYS]);
      return previewMeasuredCallUsageFrom(result.rows);
    },
    openAdmissionLock: () => createPreviewAdmissionLock(pool)
  });
}
