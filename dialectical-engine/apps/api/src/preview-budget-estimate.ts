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
 * Today there is ONE gate (the config's `budget_socket`), serving every reviewed DeepInfra row.
 * Each row maps to its gate by `previewGateKeyOf`; a later per-provider socket map adds keys there
 * and one port per key in `PreviewBudgetGateSettings.remaining`, without changing the estimate.
 */
import { TypedDomainError } from "@debateai/kernel";
import {
  createPreviewRemainingRpcPort,
  previewModelRow,
  previewModelRowForRef,
  type PreviewGateRemaining,
  type PreviewModelRow,
  type PreviewProviderTestConfig
} from "@debateai/providers";
import { readStoryPolicyFromRegister, readSynthesisRoleControls } from "@debateai/register";
import type { Pool } from "pg";
import { expectedCallsByRoleFromBasis } from "./ask-model-picker.js";

/** The gates the preview has; today only the DeepInfra gate on `budget_socket`. */
export type PreviewGateKey = "deepinfra";

/** Average call the estimate assumes (input and output tokens). */
export const PREVIEW_ESTIMATE_INPUT_TOKENS_PER_CALL = 4_000n;
export const PREVIEW_ESTIMATE_OUTPUT_TOKENS_PER_CALL = 1_200n;
/** The margin on the calls' cost: x 115 / 100, rounded up. */
export const PREVIEW_ESTIMATE_MARGIN_NUMERATOR = 115n;
export const PREVIEW_ESTIMATE_MARGIN_DENOMINATOR = 100n;

/** What admission needs to ask the gate(s); built once at boot from the preview config and the register. */
export type PreviewBudgetGateSettings = Readonly<{
  /** One read-only remaining port per gate. */
  remaining: Readonly<Record<PreviewGateKey, (signal?: AbortSignal) => Promise<PreviewGateRemaining>>>;
  /** The register's role models (answer writer and checker, storyteller and story checker), as model ids. */
  roleModelIds: readonly string[];
  /** Calls the verdict story may make after the answer (both story roles, every round). */
  storyCalls: number;
}>;

/** The gate a reviewed model's calls go through, or undefined for a model the preview never calls. */
export function previewGateKeyOf(model: string): PreviewGateKey | undefined {
  return previewModelRow(model) === undefined ? undefined : "deepinfra";
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
  input: Readonly<{ basis: Readonly<Record<string, unknown>>; panelModelIds: readonly string[] }>
): Promise<void> {
  const refuse = (reason: string): never => {
    throw new TypedDomainError("DAILY_COST_ENVELOPE_REACHED", `Private preview start-of-debate estimate refused: ${reason}`);
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
    if (port === undefined) refuse(`no remaining port for gate ${need.gate}`);
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
  const port = createPreviewRemainingRpcPort(config);
  return Object.freeze({
    remaining: Object.freeze({ deepinfra: (signal?: AbortSignal) => port.remaining(signal) }),
    roleModelIds: Object.freeze(refs.map((ref) => previewModelRowForRef(ref)?.model ?? `unreviewed-ref:${ref}`)),
    storyCalls: story === null ? 0 : 2 * story.loopMaxRounds
  });
}
