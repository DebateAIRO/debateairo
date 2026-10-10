/**
 * The private preview's start-of-debate money check (owner's rule: never stop a debate half-way;
 * estimate before it starts).
 *
 * Plain words: before a preview debate is created, the app works out the most model calls it can
 * make (every call site with its repeat attempts, the answer loop, the story with the storyteller's
 * one repair, and the runner's health checks each time it picks the debate up), prices every call
 * at the dearest model the debate may use, adds 15%, adds what the gate may hold at once for calls
 * in flight, and holds back the same figure for every earlier preview debate that has not finished.
 * Then it asks the gate what is left of today's team money and calls.
 * - Too little money or too few calls left: the existing daily refusal ("today's limit is used up"),
 *   retry at the gate's reset (midnight in Bucharest).
 * - The gate cannot be asked, is halted, not yet active, closed for today, does not serve one of the
 *   debate's models, or the settings are faulty: an existing "a model is not available right now"
 *   refusal, retry in about a minute.
 * Either way the debate is not started at all.
 *
 * One gate per provider (PR B and C): the DeepInfra gate on the config's `budget_socket`, the
 * Anthropic gate on `anthropic_budget_socket`, the Google gate on `google_budget_socket`. Each row
 * maps to its gate by `previewGateKeyOf` (the row's provider); every gate a debate's panel or role
 * models use is asked, and unfinished debates are held on each gate they use. A gate the config
 * does not name has no port, so a debate needing it is refused (as unavailable) before it starts.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  PREVIEW_PROVIDER_NAMES,
  createPreviewRemainingRpcPort,
  PREVIEW_MODEL_ROWS_BY_PROVIDER,
  previewModelRow,
  previewModelRowForRef,
  previewProviderSocket,
  type PreviewGateRemaining,
  type PreviewModelRow,
  type PreviewProviderName,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { readStoryPolicyFromRegister, readStructuralCeilingPolicyInputs, readSynthesisRoleControls } from "@debateai/register";
import type { Pool } from "pg";
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

/** The gates the preview has: one per reviewed provider. */
export type PreviewGateKey = PreviewProviderName;

/** The per-call average the owner's estimate uses: 4,000 input and 1,200 output tokens. */
export const PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL = 4_000n;
export const PREVIEW_ESTIMATE_OUTPUT_TOKENS_PER_CALL = 1_200n;
/** The owner's margin on the estimate: x 1.15 (calls and money). */
export const PREVIEW_ESTIMATE_MARGIN_NUMERATOR = 115n;
export const PREVIEW_ESTIMATE_MARGIN_DENOMINATOR = 100n;
/** More unfinished preview debates than this is itself a fault: refused as unavailable. */
const PREVIEW_UNFINISHED_RUNS_MAX = 64;

/** A panel member as admission and the run row hold it. */
export type PreviewPanelMember = Readonly<{ provider_ref: string; model_id: string }>;
/** An earlier preview debate that has not finished: its admitted basis and panel. */
export type PreviewUnfinishedRun = Readonly<{ basis: Readonly<Record<string, unknown>>; panel: readonly PreviewPanelMember[] }>;

/** What admission needs to ask the gate(s); built once at boot from the preview config and the register. */
export type PreviewBudgetGateSettings = Readonly<{
  /** One read-only remaining port per gate the config names (a gate without a socket has none). */
  remaining: Readonly<Partial<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>>>;
  /** The register's role models (answer writer and checker, storyteller and story checker), as model ids. */
  roleModelIds: readonly string[];
  /** The same roles as provider refs; the runner health-checks those not on the panel at every pickup. */
  roleProviderRefs: readonly string[];
  /** Calls the verdict story may make: per round, the storyteller twice (one repair) and the story checker once. */
  storyCalls: number;
  /** register runDeathPolicy.max_cooldown_holds_per_run: a debate is picked up at most 1 + this many times. */
  maxCooldownHoldsPerRun: number;
  /** Earlier preview debates that have not finished (a READY or CLAIMED job and no FAILED one). */
  readUnfinishedRuns: () => Promise<readonly PreviewUnfinishedRun[]>;
}>;

/** The gate a reviewed model's calls go through, or undefined for a model the preview never calls. */
export function previewGateKeyOf(model: string): PreviewGateKey | undefined {
  return previewModelRow(model)?.provider;
}

/** One average call at a row's list price, in nano-USD. */
export function previewAverageCallNanoUsd(row: PreviewModelRow): bigint {
  return PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL * row.inputNanoUsdPerToken
    + PREVIEW_ESTIMATE_OUTPUT_TOKENS_PER_CALL * row.outputNanoUsdPerToken;
}

const withMargin = (value: bigint): bigint =>
  (value * PREVIEW_ESTIMATE_MARGIN_NUMERATOR + PREVIEW_ESTIMATE_MARGIN_DENOMINATOR - 1n) / PREVIEW_ESTIMATE_MARGIN_DENOMINATOR;
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

/** The upper bound on one debate's calls, by part. */
export type PreviewExpectedCalls = Readonly<{ debate: number; story: number; probes: number; total: number }>;

/**
 * The most calls one debate can make, from the basis admission resolved:
 * - debate: the larger of one call per site (`expectedCallsByRoleFromBasis`) and the basis's own
 *   ceiling `max_model_attempts`, which counts every repeat attempt per site;
 * - story: `storyCalls` (the storyteller's repair included);
 * - probes: the runner's paid health checks at every pickup, one per panel member plus one per role
 *   ref not on the panel, times (1 + the hold cap: `hold_cap` on the basis, else the register's).
 */
export function previewExpectedCalls(input: Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  roleProviderRefs: readonly string[];
  storyCalls: number;
  maxCooldownHoldsPerRun: number;
}>): PreviewExpectedCalls {
  if (!Number.isSafeInteger(input.storyCalls) || input.storyCalls < 0) throw new TypeError("PREVIEW_STORY_CALLS_INVALID");
  if (!Number.isSafeInteger(input.maxCooldownHoldsPerRun) || input.maxCooldownHoldsPerRun < 0) throw new TypeError("PREVIEW_HOLD_CAP_INVALID");
  let sites = 0;
  try {
    sites = Object.values(expectedCallsByRoleFromBasis(input.basis)).reduce((sum, calls) => sum + calls, 0);
  } catch {
    sites = 0;
  }
  const ceiling = positiveInteger(input.basis.max_model_attempts) ? input.basis.max_model_attempts : 0;
  const debate = Math.max(sites, ceiling);
  if (debate < 1) throw new TypeError("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
  const holdCap = typeof input.basis.hold_cap === "number" && Number.isSafeInteger(input.basis.hold_cap) && input.basis.hold_cap >= 0
    ? input.basis.hold_cap : input.maxCooldownHoldsPerRun;
  const panelRefs = new Set(input.panel.map((member) => member.provider_ref));
  const offPanelRoles = new Set(input.roleProviderRefs.filter((ref) => !panelRefs.has(ref)));
  const probes = (1 + holdCap) * (input.panel.length + offPanelRoles.size);
  return Object.freeze({ debate, story: input.storyCalls, probes, total: debate + input.storyCalls + probes });
}

/** One gate's share of a debate. Conservative: EVERY call is put on EVERY gate the debate uses. */
export type PreviewGateNeed = Readonly<{
  gate: PreviewGateKey;
  /** Every model of the debate on this gate (panel and roles); each must be enabled there. */
  modelIds: readonly string[];
  /** The dearest of them by an average call; every call is priced at it. */
  dearestModelId: string;
  /** The upper bound on the debate's calls, before the margin. */
  expectedCalls: number;
  /** ceil(expectedCalls x 1.15): what the gate's call count must still allow, before calls in flight. */
  callsWithMargin: number;
  /** ceil(expectedCalls x averageCall(dearest) x 1.15), before the gate's in-flight holds. */
  callsNanoUsd: bigint;
}>;

function gateNeeds(models: ReadonlyMap<PreviewGateKey, readonly PreviewModelRow[]>, expectedCalls: number): readonly PreviewGateNeed[] {
  const calls = BigInt(expectedCalls);
  return Object.freeze([...models].map(([gate, rows]) => {
    const dearest = rows.reduce((best, row) => previewAverageCallNanoUsd(row) > previewAverageCallNanoUsd(best) ? row : best);
    return Object.freeze({
      gate, modelIds: Object.freeze([...new Set(rows.map((row) => row.model))]), dearestModelId: dearest.model,
      expectedCalls, callsWithMargin: Number(withMargin(calls)), callsNanoUsd: withMargin(calls * previewAverageCallNanoUsd(dearest))
    });
  }));
}

/** Pure: what a NEW debate needs of each gate. Throws for a model the preview does not review. */
export function estimatePreviewGateNeeds(input: Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panel: readonly PreviewPanelMember[];
  roleModelIds: readonly string[];
  roleProviderRefs: readonly string[];
  storyCalls: number;
  maxCooldownHoldsPerRun: number;
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
  return gateNeeds(byGate, expected.total);
}

/**
 * Pure: what an UNFINISHED earlier debate is still held for, per gate: its whole estimate again
 * (over-counting what it already spent, which the gate's remaining figure also reflects; that is
 * the careful side). A model off the reviewed rows (an older run, from before any other provider's
 * gate existed) is priced at the dearest DeepInfra row, on the DeepInfra gate.
 */
export function estimateUnfinishedRunHolds(run: PreviewUnfinishedRun, settings: Pick<PreviewBudgetGateSettings,
  "roleModelIds" | "roleProviderRefs" | "storyCalls" | "maxCooldownHoldsPerRun">): readonly PreviewGateNeed[] {
  const expected = previewExpectedCalls({ ...settings, basis: run.basis, panel: run.panel });
  // A model off the reviewed rows predates the per-provider gates, so it ran on the DeepInfra gate:
  // price it at that gate's dearest row (never move its hold onto another provider's gate).
  const dearestRow = PREVIEW_MODEL_ROWS_BY_PROVIDER.deepinfra
    .reduce((best, row) => previewAverageCallNanoUsd(row) > previewAverageCallNanoUsd(best) ? row : best);
  const byGate = new Map<PreviewGateKey, PreviewModelRow[]>();
  for (const model of new Set([...run.panel.map((member) => member.model_id), ...settings.roleModelIds])) {
    const row = previewModelRow(model) ?? dearestRow;
    const gate = previewGateKeyOf(row.model) ?? "deepinfra";
    byGate.set(gate, [...(byGate.get(gate) ?? []), row]);
  }
  return gateNeeds(byGate, expected.total);
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
 * Admission's check, ONLY on the preview. A money or call shortfall refuses with the existing daily
 * code and the gate's Bucharest-midnight reset; anything that makes the gate unusable right now
 * (unreachable, halted, not active, closed, a model not enabled, missing or faulty settings)
 * refuses with the existing "model not available right now" code and a one-minute retry.
 */
export async function assertPreviewBudgetAdmits(
  gate: PreviewBudgetGateSettings | undefined,
  input: Readonly<{ basis: Readonly<Record<string, unknown>>; panel: readonly PreviewPanelMember[] }>,
  clock: () => Date = () => new Date()
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
  let needs: readonly PreviewGateNeed[];
  let held: Map<PreviewGateKey, PreviewGateHeld>;
  try {
    needs = estimatePreviewGateNeeds({ ...input, roleModelIds: gate!.roleModelIds, roleProviderRefs: gate!.roleProviderRefs,
      storyCalls: gate!.storyCalls, maxCooldownHoldsPerRun: gate!.maxCooldownHoldsPerRun });
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

/** One read-only /remaining port per gate the config names: DeepInfra's always, Anthropic's and Google's when set. */
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
 * The unfinished preview debates, for the estimate: every run with a job still READY or CLAIMED
 * and no FAILED job, whatever day it was admitted (a debate that crosses midnight spends from the
 * new day's pot). Plain columns only (`envelope_basis`, `discovered_panel`); never content.
 */
export const PREVIEW_UNFINISHED_RUNS_SQL = `SELECT run.envelope_basis, run.discovered_panel
       FROM core.run AS run
       WHERE EXISTS (SELECT 1 FROM core.work_item AS work
                     WHERE work.run_id = run.run_id AND work.state IN ('READY', 'CLAIMED'))
         AND NOT EXISTS (SELECT 1 FROM core.work_item AS work
                         WHERE work.run_id = run.run_id AND work.state = 'FAILED')
       LIMIT ${String(PREVIEW_UNFINISHED_RUNS_MAX + 1)}` as const;

function unfinishedRunFrom(row: Readonly<{ envelope_basis: unknown; discovered_panel: unknown }>): PreviewUnfinishedRun {
  const basis = row.envelope_basis;
  const panel = row.discovered_panel;
  if (typeof basis !== "object" || basis === null || Array.isArray(basis) || !Array.isArray(panel)
    || panel.some((member) => typeof member !== "object" || member === null
      || typeof (member as Record<string, unknown>).provider_ref !== "string"
      || typeof (member as Record<string, unknown>).model_id !== "string")) {
    throw new TypeError("PREVIEW_UNFINISHED_RUN_UNREADABLE");
  }
  return Object.freeze({
    basis: basis as Readonly<Record<string, unknown>>,
    panel: Object.freeze((panel as Array<Record<string, string>>).map((member) =>
      Object.freeze({ provider_ref: member.provider_ref!, model_id: member.model_id! })))
  });
}

/**
 * Boot: the admission settings for the preview, from its config and the register version in force.
 * The role refs are the register's sealed provider refs; one the preview does not review is kept as
 * an unknown id, so every ask is refused (fail closed) rather than the boot guessing a price. The
 * story rows are optional (absent reads as no story); a malformed story family refuses the boot.
 */
export async function readPreviewBudgetGateSettings(
  pool: Pool,
  registerVersion: number,
  config: PreviewProviderTestConfig
): Promise<PreviewBudgetGateSettings> {
  const roles = await readSynthesisRoleControls(pool, registerVersion);
  const story = await readStoryPolicyFromRegister(pool, registerVersion);
  const structural = await readStructuralCeilingPolicyInputs(pool, registerVersion);
  const refs = [roles.synthesizerRoleRef, roles.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])];
  return Object.freeze({
    remaining: previewRemainingPorts(config),
    roleModelIds: Object.freeze(refs.map((ref) => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`)),
    roleProviderRefs: Object.freeze([...new Set(refs)]),
    // Per round: the storyteller (the preview allows it one repair, so two attempts) and the checker.
    storyCalls: story === null ? 0 : 3 * story.loopMaxRounds,
    maxCooldownHoldsPerRun: structural.maxCooldownHoldsPerRun,
    readUnfinishedRuns: async () => {
      const result = await pool.query<{ envelope_basis: unknown; discovered_panel: unknown }>(PREVIEW_UNFINISHED_RUNS_SQL);
      return Object.freeze(result.rows.map(unfinishedRunFrom));
    }
  });
}
