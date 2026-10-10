/**
 * The private preview's start-of-debate money check (owner's rule: never stop a debate half-way;
 * estimate before it starts).
 *
 * Plain words: before a preview debate is created, the app works out the most model calls it can
 * make (every call site with its repeat attempts, the answer loop, the story with the storyteller's
 * one repair, the runner's health checks each time it picks the debate up, this ask's own health
 * checks, and the one retry of a call the gate proved unbilled), prices every call as the most it
 * can cost (its input at the largest body the gate accepts, its output at the max_tokens it sends,
 * at the dearest model the debate may use), adds 15%, adds what the gate may hold at once for calls
 * in flight, and holds back the same figure for every earlier preview debate that has not finished
 * (a debate still writing its story: the story's calls). One ask at a time is estimated and started
 * (the admission lock), so two asks never both count the same money.
 * Then it asks the gate what is left of today's team money and calls.
 * - Too little money or too few calls left: the existing daily refusal ("today's limit is used up"),
 *   retry at the gate's reset (midnight in Bucharest).
 * - The gate cannot be asked, is halted, not yet active, closed for today, does not serve one of the
 *   debate's models, or the settings are faulty: an existing "a model is not available right now"
 *   refusal, retry in about a minute.
 * Either way the debate is not started at all.
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

/**
 * THE INPUT SIDE OF EVERY CALL (review finding 1, 2026-10-10). No per-call-type cap on a prompt's
 * size exists in the engine's code: the story material budget bounds the material only, not the
 * instruction and frame around it, and nothing bounds a judge's or a writer's prompt below the
 * packet cap. The one hard ceiling is the guarded fetch's: a body above 256 KiB is refused before
 * it is sent, and the gate reserves (body bytes + 2048) x the input price, so a call's input is at
 * most that many tokens (a token is at least one byte). Every call's input is priced there.
 */
export const PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL = previewChargedInputTokens(PREVIEW_REQUEST_BODY_MAX_BYTES);
/**
 * A health check's body is the fixed one-line probe (provider-probe.ts: model, max_tokens, the
 * effort switch where the row has one, one short message), well under 1 KiB for every reviewed
 * model id; priced at 1 KiB plus the gate's 2048-token allowance.
 */
const PREVIEW_PROBE_BODY_MAX_BYTES = 1024;
export const PREVIEW_ESTIMATE_PROBE_INPUT_TOKENS = previewChargedInputTokens(PREVIEW_PROBE_BODY_MAX_BYTES);
/** The estimate's margin on calls and money: x 1.15. */
export const PREVIEW_ESTIMATE_MARGIN_NUMERATOR = 115n;
export const PREVIEW_ESTIMATE_MARGIN_DENOMINATOR = 100n;
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
 * length-retry ceiling; the story checker at its ceiling.
 */
export type PreviewCallOutputTokens = Readonly<{ debate: number; storyteller: number; storytellerRetry: number; storyChecker: number }>;

/** What admission needs to ask the gate(s); built once at boot from the preview config and the register. */
export type PreviewBudgetGateSettings = Readonly<{
  /** One read-only remaining port per gate. */
  remaining: Readonly<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>>;
  /** The register's role models (answer writer and checker, storyteller and story checker), as model ids. */
  roleModelIds: readonly string[];
  /** The same roles as provider refs; the runner health-checks those not on the panel at every pickup. */
  roleProviderRefs: readonly string[];
  /** Rounds the verdict story may run: per round the storyteller twice (one repair) and the story checker once. */
  storyRounds: number;
  /** The max_tokens of each kind of call (see PreviewCallOutputTokens). */
  callOutputTokens: PreviewCallOutputTokens;
  /** Targets the API health-checks at ask time, paid through the gate even when the ask is refused. */
  askProbeTargets: number;
  /** register runDeathPolicy.max_cooldown_holds_per_run: a debate is picked up at most 1 + this many times by cooldown. */
  maxCooldownHoldsPerRun: number;
  /** Earlier preview debates that have not finished (see PREVIEW_UNFINISHED_RUNS_SQL). */
  readUnfinishedRuns: () => Promise<readonly PreviewUnfinishedRun[]>;
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
export function previewCallNanoUsd(row: PreviewModelRow, inputTokens: bigint, outputTokens: number): bigint {
  return inputTokens * row.inputNanoUsdPerToken + BigInt(Math.min(outputTokens, row.outputBound)) * row.outputNanoUsdPerToken;
}
/** The dearest of `rows` for one call of this shape. */
function dearestCallNanoUsd(rows: readonly PreviewModelRow[], inputTokens: bigint, outputTokens: number): bigint {
  return rows.reduce((most, row) => {
    const price = previewCallNanoUsd(row, inputTokens, outputTokens);
    return price > most ? price : most;
  }, 0n);
}

const withMargin = (value: bigint): bigint =>
  (value * PREVIEW_ESTIMATE_MARGIN_NUMERATOR + PREVIEW_ESTIMATE_MARGIN_DENOMINATOR - 1n) / PREVIEW_ESTIMATE_MARGIN_DENOMINATOR;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
const wholeNumber = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The upper bound on one debate's calls, by part; `total` is what the gate's call count must allow. */
export type PreviewExpectedCalls = Readonly<{
  debate: number; story: number; probes: number; askProbes: number; unbilledRetries: number; total: number;
}>;

/**
 * The most calls one debate can make, from the basis admission resolved:
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
  let sites = 0;
  try {
    sites = Object.values(expectedCallsByRoleFromBasis(input.basis)).reduce((sum, calls) => sum + calls, 0);
  } catch {
    sites = 0;
  }
  const ceiling = positiveInteger(input.basis.max_model_attempts) ? input.basis.max_model_attempts : 0;
  const debate = Math.max(sites, ceiling);
  if (debate < 1) throw new TypeError("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
  const holdCap = wholeNumber(input.basis.hold_cap) ? input.basis.hold_cap : input.maxCooldownHoldsPerRun;
  const panelRefs = new Set(input.panel.map((member) => member.provider_ref));
  const offPanelRoles = new Set(input.roleProviderRefs.filter((ref) => !panelRefs.has(ref)));
  const probes = (1 + holdCap + PREVIEW_ESTIMATE_RESTART_PICKUPS) * (input.panel.length + offPanelRoles.size);
  const story = 3 * input.storyRounds;
  const unbilledRetries = debate + input.storyRounds;
  return Object.freeze({ debate, story, probes, askProbes, unbilledRetries, total: debate + story + probes + askProbes + unbilledRetries });
}

/**
 * Pure: the money one debate's calls can cost on one gate whose models are `rows`, before the
 * margin. Every call is priced at the dearest of `rows` for its own shape: input at
 * PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL (probes at PREVIEW_ESTIMATE_PROBE_INPUT_TOKENS), output at
 * the max_tokens that call sends, clamped to the row's bound. Unbilled retries cost nothing.
 * `storyOnly` prices a debate whose answer is served and whose story is still being written.
 */
export function previewDebateNanoUsd(rows: readonly PreviewModelRow[], calls: PreviewExpectedCalls, storyRounds: number,
  output: PreviewCallOutputTokens, storyOnly = false): bigint {
  if (rows.length === 0) throw new TypeError("PREVIEW_GATE_HAS_NO_MODEL");
  const input = PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL;
  const storyRound = dearestCallNanoUsd(rows, input, output.storyteller) + dearestCallNanoUsd(rows, input, output.storytellerRetry)
    + dearestCallNanoUsd(rows, input, output.storyChecker);
  const story = BigInt(storyRounds) * storyRound;
  if (storyOnly) return story;
  return BigInt(calls.debate) * dearestCallNanoUsd(rows, input, output.debate) + story
    + BigInt(calls.probes + calls.askProbes) * dearestCallNanoUsd(rows, PREVIEW_ESTIMATE_PROBE_INPUT_TOKENS, PREVIEW_GLM_GENERATION_TOKEN_FLOOR);
}

/** One gate's share of a debate. Conservative: EVERY call is put on EVERY gate the debate uses. */
export type PreviewGateNeed = Readonly<{
  gate: PreviewGateKey;
  /** Every model of the debate on this gate (panel and roles); each must be enabled there. */
  modelIds: readonly string[];
  /** The dearest of them for one debate call; each call is priced at the dearest for its own shape. */
  dearestModelId: string;
  /** The upper bound on the debate's calls, before the margin. */
  expectedCalls: number;
  /** ceil(expectedCalls x 1.15): what the gate's call count must still allow, before calls in flight. */
  callsWithMargin: number;
  /** ceil(previewDebateNanoUsd x 1.15), before the gate's in-flight holds. */
  callsNanoUsd: bigint;
}>;

type PreviewPricing = Readonly<{ storyRounds: number; callOutputTokens: PreviewCallOutputTokens }>;

function gateNeeds(models: ReadonlyMap<PreviewGateKey, readonly PreviewModelRow[]>, calls: PreviewExpectedCalls,
  pricing: PreviewPricing, storyOnly = false): readonly PreviewGateNeed[] {
  const expectedCalls = storyOnly ? calls.story + pricing.storyRounds : calls.total;
  return Object.freeze([...models].map(([gate, rows]) => {
    const debateCall = (row: PreviewModelRow) => previewCallNanoUsd(row, PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL, pricing.callOutputTokens.debate);
    const dearest = rows.reduce((best, row) => debateCall(row) > debateCall(best) ? row : best);
    return Object.freeze({
      gate, modelIds: Object.freeze([...new Set(rows.map((row) => row.model))]), dearestModelId: dearest.model,
      expectedCalls, callsWithMargin: Number(withMargin(BigInt(expectedCalls))),
      callsNanoUsd: withMargin(previewDebateNanoUsd(rows, calls, pricing.storyRounds, pricing.callOutputTokens, storyOnly))
    });
  }));
}

/** The estimate's inputs besides the debate itself: the register's roles, story and bounds. */
export type PreviewEstimateSettings = Readonly<{
  roleModelIds: readonly string[];
  roleProviderRefs: readonly string[];
  storyRounds: number;
  callOutputTokens: PreviewCallOutputTokens;
  maxCooldownHoldsPerRun: number;
  askProbeTargets?: number;
}>;

/** Pure: what a NEW debate needs of each gate. Throws for a model the preview does not review. */
export function estimatePreviewGateNeeds(input: PreviewEstimateSettings & Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
}>): readonly PreviewGateNeed[] {
  if (input.panel.length === 0) throw new TypeError("PREVIEW_PANEL_EMPTY");
  const expected = previewExpectedCalls(input);
  const byGate = new Map<PreviewGateKey, PreviewModelRow[]>();
  for (const model of new Set([...input.panel.map((member) => member.model_id), ...input.roleModelIds])) {
    const row = previewModelRow(model);
    const gate = previewGateKeyOf(model);
    if (row === undefined || gate === undefined) throw new TypeError("PREVIEW_MODEL_UNREVIEWED");
    byGate.set(gate, [...(byGate.get(gate) ?? []), row]);
  }
  return gateNeeds(byGate, expected, input);
}

/**
 * Pure: what an UNFINISHED earlier debate is still held for, per gate. Still debating: its whole
 * estimate again, ask-time probes aside (over-counting what it already spent, which the gate's
 * remaining figure also reflects; that is the careful side). Only writing its story: the story's
 * calls. A model off the reviewed rows (an older run) is priced at the dearest row on the DeepInfra
 * gate, the only gate today.
 */
export function estimateUnfinishedRunHolds(run: PreviewUnfinishedRun, settings: PreviewEstimateSettings): readonly PreviewGateNeed[] {
  const expected = previewExpectedCalls({ ...settings, askProbeTargets: 0, basis: run.basis, panel: run.panel });
  const debateCall = (row: PreviewModelRow) => previewCallNanoUsd(row, PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL, settings.callOutputTokens.debate);
  const dearestRow = PREVIEW_MODEL_ROWS.reduce((best, row) => debateCall(row) > debateCall(best) ? row : best);
  const byGate = new Map<PreviewGateKey, PreviewModelRow[]>();
  for (const model of new Set([...run.panel.map((member) => member.model_id), ...settings.roleModelIds])) {
    const row = previewModelRow(model) ?? dearestRow;
    const gate = previewGateKeyOf(row.model) ?? "deepinfra";
    byGate.set(gate, [...(byGate.get(gate) ?? []), row]);
  }
  return gateNeeds(byGate, expected, settings, run.phase === "STORY");
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
    needs = estimatePreviewGateNeeds({ ...input, ...gate! });
    const unfinished = await gate!.readUnfinishedRuns();
    if (unfinished.length > PREVIEW_UNFINISHED_RUNS_MAX) throw new TypeError("PREVIEW_UNFINISHED_RUNS_TOO_MANY");
    held = new Map();
    for (const run of unfinished) {
      for (const hold of estimateUnfinishedRunHolds(run, gate!)) {
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
 * `askProbeTargets` is the number of declared targets the API health-checks at ask time.
 */
export async function readPreviewBudgetGateSettings(
  pool: Pool,
  registerVersion: number,
  config: PreviewProviderTestConfig,
  askProbeTargets: number
): Promise<PreviewBudgetGateSettings> {
  if (!wholeNumber(askProbeTargets)) throw new TypeError("PREVIEW_ASK_PROBE_TARGETS_INVALID");
  const roles = await readSynthesisRoleControls(pool, registerVersion);
  const story = await readStoryPolicyFromRegister(pool, registerVersion);
  const structural = await readStructuralCeilingPolicyInputs(pool, registerVersion);
  const organCeilings = await readOrganTokenCeilings(pool, registerVersion);
  const refs = [roles.synthesizerRoleRef, roles.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])];
  const port = createPreviewRemainingRpcPort(config);
  const storyRounds = story === null ? 0 : story.loopMaxRounds;
  return Object.freeze({
    remaining: Object.freeze({ deepinfra: (signal?: AbortSignal) => port.remaining(signal) }),
    roleModelIds: Object.freeze(refs.map((ref) => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`)),
    roleProviderRefs: Object.freeze([...new Set(refs)]),
    storyRounds,
    callOutputTokens: previewCallOutputTokens(config, {
      debate: [...organCeilings, roles.synthesizerBound.tokenCeiling, roles.evaluatorBound.tokenCeiling],
      story: story === null ? null : { storyteller: story.storytellerBound.tokenCeiling, checker: story.checkerBound.tokenCeiling }
    }),
    askProbeTargets,
    maxCooldownHoldsPerRun: structural.maxCooldownHoldsPerRun,
    readUnfinishedRuns: async () => {
      const result = await pool.query<{ envelope_basis: unknown; discovered_panel: unknown; phase: unknown }>(
        PREVIEW_UNFINISHED_RUNS_SQL, [storyRounds > 0, PREVIEW_STORY_HOLD_WINDOW_SECONDS]);
      return Object.freeze(result.rows.map(unfinishedRunFrom));
    },
    openAdmissionLock: () => createPreviewAdmissionLock(pool)
  });
}
