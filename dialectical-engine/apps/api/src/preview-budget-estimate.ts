/**
 * The private preview's start-of-debate money check (owner's rule: never stop a debate half-way;
 * estimate before it starts).
 *
 * Plain words: before a preview debate is created, the app works out roughly how many model calls
 * it will make and what they could cost at the dearest model it may use, adds 15%, adds what the
 * gate may hold at once for calls already in flight, and asks the gate what is left of today's
 * team money and calls. If the debate does not fit, or the gate is closed, halted, will not serve
 * one of the debate's models, or cannot be asked, the debate is not started at all.
 *
 * One gate per provider (PR B): the DeepInfra gate on the config's `budget_socket`, the Anthropic
 * gate on `anthropic_budget_socket`. Each row maps to its gate by `previewGateKeyOf` (the row's
 * provider), and every gate a debate's panel or role models use is asked; a gate the config does
 * not name has no port, so a debate needing it is refused before it starts.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  PREVIEW_PROVIDER_NAMES,
  createPreviewRemainingRpcPort,
  previewModelRow,
  previewModelRowForRef,
  previewProviderSocket,
  type PreviewGateRemaining,
  type PreviewModelRow,
  type PreviewProviderName,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { readStoryPolicyFromRegister, readSynthesisRoleControls } from "@debateai/register";
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
export function nextBucharestMidnight(now: Date): Date {
  if (!Number.isFinite(now.getTime())) throw new TypeError("PREVIEW_CLOCK_INVALID");
  const today = bucharestParts(now);
  for (const offsetHours of [2, 3]) {
    const candidate = new Date(Date.UTC(today.year, today.month - 1, today.day + 1) - offsetHours * 3_600_000);
    const local = bucharestParts(candidate);
    if (local.hour === 0 && local.minute === 0 && local.second === 0 && candidate.getTime() > now.getTime()) return candidate;
  }
  throw new TypeError("PREVIEW_BUCHAREST_MIDNIGHT_UNRESOLVED");
}

/**
 * The preview's daily refusal: the product's existing daily code (429, the localized "today's
 * limit is used up" sentence), carrying the gate's own reset instant for `Retry-After`.
 */
export class PreviewDailyLimitRefusal extends TypedDomainError {
  readonly retryAt: Date;
  constructor(message: string, retryAt: Date) {
    super("DAILY_COST_ENVELOPE_REACHED", message);
    this.retryAt = retryAt;
  }
}

/** The gates the preview has: one per reviewed provider. */
export type PreviewGateKey = PreviewProviderName;

/** Average call the estimate assumes (input and output tokens). */
export const PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL = 4_000n;
export const PREVIEW_ESTIMATE_OUTPUT_TOKENS_PER_CALL = 1_200n;
/** The margin on the calls' cost: x 115 / 100, rounded up. */
export const PREVIEW_ESTIMATE_MARGIN_NUMERATOR = 115n;
export const PREVIEW_ESTIMATE_MARGIN_DENOMINATOR = 100n;

/** What admission needs to ask the gate(s); built once at boot from the preview config and the register. */
export type PreviewBudgetGateSettings = Readonly<{
  /** One read-only remaining port per gate the config names (a gate without a socket has none). */
  remaining: Readonly<Partial<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>>>;
  /** The register's role models (answer writer and checker, storyteller and story checker), as model ids. */
  roleModelIds: readonly string[];
  /** Calls the verdict story may make after the answer (both story roles, every round). */
  storyCalls: number;
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

/**
 * The calls one debate is expected to make, from the basis admission resolved: every call site
 * of the argument (positions, support/attack, cross-exchange, judges, reviewers), every round of
 * the answer writer and checker, plus the story's calls. A basis with no call-site split (only
 * fakes) falls back to its `max_model_attempts`, which is never below the site count.
 */
export function previewExpectedCalls(basis: Readonly<Record<string, unknown>>, storyCalls: number): number {
  if (!Number.isSafeInteger(storyCalls) || storyCalls < 0) throw new TypeError("PREVIEW_STORY_CALLS_INVALID");
  let debate: number;
  try {
    debate = Object.values(expectedCallsByRoleFromBasis(basis)).reduce((sum, calls) => sum + calls, 0);
  } catch {
    const attempts = basis.max_model_attempts;
    if (typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 1) {
      throw new TypeError("PREVIEW_BASIS_HAS_NO_CALL_COUNT");
    }
    debate = attempts;
  }
  return debate + storyCalls;
}

/** One gate's share of the debate. Conservative: EVERY expected call is put on EVERY gate the debate uses. */
export type PreviewGateNeed = Readonly<{
  gate: PreviewGateKey;
  /** Every model of the debate on this gate (panel and roles); each must be enabled there. */
  modelIds: readonly string[];
  /** The dearest of them by an average call; every call is priced at it. */
  dearestModelId: string;
  expectedCalls: number;
  /** ceil(expectedCalls x averageCall(dearest) x 115 / 100), before the gate's in-flight holds. */
  callsNanoUsd: bigint;
}>;

/** Pure: what the debate needs of each gate. Throws for a model the preview does not review. */
export function estimatePreviewGateNeeds(input: Readonly<{
  basis: Readonly<Record<string, unknown>>;
  panelModelIds: readonly string[];
  roleModelIds: readonly string[];
  storyCalls: number;
}>): readonly PreviewGateNeed[] {
  if (input.panelModelIds.length === 0) throw new TypeError("PREVIEW_PANEL_EMPTY");
  const expectedCalls = previewExpectedCalls(input.basis, input.storyCalls);
  const byGate = new Map<PreviewGateKey, string[]>();
  for (const model of new Set([...input.panelModelIds, ...input.roleModelIds])) {
    const gate = previewGateKeyOf(model);
    if (gate === undefined) throw new TypeError("PREVIEW_MODEL_UNREVIEWED");
    byGate.set(gate, [...(byGate.get(gate) ?? []), model]);
  }
  return Object.freeze([...byGate].map(([gate, modelIds]) => {
    const dearest = modelIds
      .map((model) => previewModelRow(model)!)
      .reduce((best, row) => previewAverageCallNanoUsd(row) > previewAverageCallNanoUsd(best) ? row : best);
    const raw = BigInt(expectedCalls) * previewAverageCallNanoUsd(dearest) * PREVIEW_ESTIMATE_MARGIN_NUMERATOR;
    const callsNanoUsd = (raw + PREVIEW_ESTIMATE_MARGIN_DENOMINATOR - 1n) / PREVIEW_ESTIMATE_MARGIN_DENOMINATOR;
    return Object.freeze({ gate, modelIds: Object.freeze(modelIds), dearestModelId: dearest.model, expectedCalls, callsNanoUsd });
  }));
}

/** The whole figure one gate must still have: the calls plus what it may hold at once for calls in flight. */
export function previewGateEstimateNanoUsd(need: PreviewGateNeed, remaining: PreviewGateRemaining): bigint {
  return need.callsNanoUsd + BigInt(remaining.maxConcurrentCalls) * remaining.largestReservationNanoUsd;
}

/** Pure: why this gate cannot carry the debate (an internal reason for the operator), or null when it can. */
export function previewGateRefusalReason(need: PreviewGateNeed, remaining: PreviewGateRemaining): string | null {
  if (remaining.state !== "active") return `gate state ${remaining.state}`;
  if (!remaining.windowOpen) return "gate window closed";
  const disabled = need.modelIds.filter((model) => !remaining.enabledModels.includes(model));
  if (disabled.length > 0) return `gate does not serve ${disabled.join(", ")}`;
  if (remaining.remainingCalls < need.expectedCalls) {
    return `gate has ${String(remaining.remainingCalls)} calls left, the debate expects ${String(need.expectedCalls)}`;
  }
  const estimate = previewGateEstimateNanoUsd(need, remaining);
  if (remaining.remainingNanoUsd < estimate) {
    return `gate has ${String(remaining.remainingNanoUsd)} nano-USD left, the debate needs ${String(estimate)}`;
  }
  return null;
}

/**
 * Admission's check, ONLY on the preview: refuses with the existing daily code (429, the plain
 * "today's limit is used up, try tomorrow" sentence) when the debate does not fit, and when the
 * settings are missing or the gate cannot be asked (fail closed). The reason stays in the error's
 * message, which the boundary never shows a caller for this code.
 */
export async function assertPreviewBudgetAdmits(
  gate: PreviewBudgetGateSettings | undefined,
  input: Readonly<{ basis: Readonly<Record<string, unknown>>; panelModelIds: readonly string[] }>,
  clock: () => Date = () => new Date()
): Promise<void> {
  const refuse = (reason: string): never => {
    throw new PreviewDailyLimitRefusal(`Private preview start-of-debate estimate refused: ${reason}`, nextBucharestMidnight(clock()));
  };
  if (gate === undefined) refuse("no gate remaining port");
  let needs: readonly PreviewGateNeed[];
  try {
    needs = estimatePreviewGateNeeds({ ...input, roleModelIds: gate!.roleModelIds, storyCalls: gate!.storyCalls });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "estimate failed");
  }
  for (const need of needs) {
    const port = gate!.remaining[need.gate];
    if (port === undefined) return refuse(`no remaining port for gate ${need.gate}`);
    let remaining: PreviewGateRemaining;
    try {
      remaining = await port();
    } catch (error) {
      return refuse(error instanceof TypedDomainError ? error.code : "gate unreachable");
    }
    const reason = previewGateRefusalReason(need, remaining);
    if (reason !== null) refuse(reason);
  }
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
 * Boot: the admission settings for the preview, from its config and the register version in force.
 * The role refs are the register's sealed provider refs; one the preview does not review is kept as
 * an unknown id, so every ask is refused (fail closed) rather than the boot guessing a price.
 */
export async function readPreviewBudgetGateSettings(
  pool: Pool,
  registerVersion: number,
  config: PreviewProviderTestConfig
): Promise<PreviewBudgetGateSettings> {
  const roles = await readSynthesisRoleControls(pool, registerVersion);
  const story = await readStoryPolicyFromRegister(pool, registerVersion).catch(() => null);
  const refs = [roles.synthesizerRoleRef, roles.evaluatorRoleRef,
    ...(story === null ? [] : [story.storytellerRoleRef, story.storyCheckerRoleRef])];
  return Object.freeze({
    remaining: previewRemainingPorts(config),
    roleModelIds: Object.freeze(refs.map((ref) => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`)),
    storyCalls: story === null ? 0 : 2 * story.loopMaxRounds
  });
}
