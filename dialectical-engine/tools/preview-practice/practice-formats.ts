/**
 * Preview practice, mode "formats": every model asked to do every job a few times, each reply checked by the
 * engine's own format check.
 *
 * Plain words: for each of the five models and each job (lane), the real prompt is built from synthetic practice
 * material and sent N times (default 2, the two practice questions taken in turn) through exactly the gateway the
 * runner uses on the preview (the guarded fetch over the gate's own protocol, the preview call policy, the model's
 * reviewed controls, effort "high" where the model has it). Each reply is checked by that job's real check. Nothing is
 * stored anywhere but in memory, the samples log (practice-samples-log.ts) and the report.
 *
 * Order (practice-concurrency.ts): by default the models work at the same time, each on its own jobs one after another
 * (one call in flight per model, a small jittered gap between its calls), within each gate's limit of calls at once and
 * the overall limit. With `parallel: false` (the command's --sequential) calls go one at a time with a polite gap, the
 * models taking turns, one job each (round-robin by model), the Anthropic model between the DeepInfra ones. Either way
 * each model's own jobs keep their order (job by job, the samples of a job together).
 *
 * Thinking levels (spec 2026-10-12 §4.8, `levels`): a model in the plan does each job once per run, its runs taking
 * turns per job (practice-levels.ts) and one after another, never at once, each with a config naming only that run's
 * level. A busy model parks all its runs. A model not in the plan runs as before and its samples carry no level fields.
 *
 * A busy model: when a job's call ends in the vendor's refusal, not billed (the call and its one resend, the gate's
 * PROVIDER_REFUSED_UNBILLED, or the model is cooling off as MODEL_COOLING), only that model is parked: it waits out its
 * cool-off (the gate's retry_after when it named one, else 60 s doubling up to 600 s, up to a quarter longer) while the
 * other models go on, then the SAME job is tried again. Each model has a budget of such waits (`busyWaitMs`, the
 * command's --busy-wait-minutes, default 30; 0 is the old rule). Only when its budget is spent is the model marked busy
 * and its remaining jobs skipped (SKIPPED_MODEL_BUSY). Busy-ness is read by
 * the runner's own predicate (providerCallEndedVendorRefusedUnbilled) on the job's gateway, as the runner's sit-out
 * book reads it on a member's gateway (apps/runner/src/run-sit-out.ts). The other models, on the same gate too, go
 * on. The gate's own refusals (too many calls in flight, vendor not reached) are the gate's, not the model's: they
 * never mark a model busy. The practice's gate brake (practice-gate-observer.ts) stays the safety net.
 */
import { randomUUID } from "node:crypto";
import {
  OpenAICompatibleProviderGateway,
  parseProviderDiscoveryTargets,
  previewModelRow,
  previewRunnerPolicy,
  previewTargetGatewayControls,
  previewTargetJsonRow,
  PREVIEW_REVIEWED_PROVIDER_REFS,
  providerCallEndedVendorRefusedUnbilled,
  providerTargetGatewayControls,
  withPreviewProviderCallPolicy,
  createPreviewGuardedFetch,
  type PreviewBudgetPorts,
  type PreviewEffort,
  type PreviewFinalWriterTierUnread,
  type PreviewGateRemaining,
  type PreviewProviderName,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget,
  type ProviderGateway,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import type { StoryPack } from "@debateai/story";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import { DEVELOPMENT_ORGAN_COST_BOUNDS } from "../../apps/runner/src/dev-deployment-register.js";
import { limitPort, PracticeSemaphore, runModelQueues, type PracticePreparedJob } from "./practice-concurrency.js";
import type { PracticeGateName, PracticeGateObserver, PracticeUnbilledKind, PracticeWireEvent } from "./practice-gate-observer.js";
import {
  issueListFromParseError,
  practiceFinishReasonOf,
  practiceJsonRepairOf,
  practiceReplyFormOf,
  recheckReply,
  replyContentOf,
  runPracticeLane,
  type PracticeLane,
  type PracticeLaneBounds
} from "./practice-lanes.js";
import { practiceLevelConfig, practiceLevelJobs, practiceRunOfJob, type PracticeLevelJob, type PracticeLevelPlan } from "./practice-levels.js";
import { PRACTICE_QUESTIONS } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";
import { practiceStorySampleOf, type PracticeStorySample, type PracticeStoryV4Settings } from "./practice-story-length.js";
import { practiceCallFacts, practiceRepairKindOf, type PracticeRepairKind, type PracticeReplyForm } from "./practice-verdict.js";

/**
 * REPAIRED (owner ruling 2026-10-12, "Fixed slips = warning"): every call of the job ended with an accepted reply, and
 * at least one of them only on its second try, after its first reply failed its format or content check.
 */
export type PracticeSampleStatus =
  | "PARSED" | "REPAIRED" | "PARSE_FAILED" | "SCHEMA_FAILED" | "UNPARSED" | "POST_CHECK_FAILED"
  | "CALL_FAILED" | "UNBILLED_REFUSED" | "VENDOR_ERROR_UNBILLED" | "SKIPPED_GATE_STOPPED" | "SKIPPED_MODEL_BUSY";

export type PracticeAttempt = Readonly<{
  callSiteKey: string;
  outcome: ProviderLedgerInput["outcome"];
  parseStatus: RawArtifactInput["parseStatus"] | null;
  latencyMs: number;
  /** Information only: for an accepted reply, the tolerant repair it needed (`practiceJsonRepairOf`); absent in older logs. */
  jsonRepair?: string | null;
  /**
   * Patch follow-up (owner design, 2026-10-12): what this try sent, read from its own prompt (`practiceReplyFormOf`):
   * ORIGINAL, PATCH (the short follow-up) or FULL (the full re-ask). Null when no prompt was recorded for it (refused
   * before it was sent); absent in older logs.
   */
  replyForm?: PracticeReplyForm | null;
  /**
   * Length guidance LG-B (pre-flight PF-B4.3): the bound this try asked for (its stored metadata's token_ceiling) and the
   * thinking level it ran at (its ledger row's; DEFAULT_ONLY for a model's own default); null when not recorded; absent
   * in older logs. The LG-B proof reads them (a final writer's first try asks its row's own maximum).
   */
  tokenCeiling?: number | null;
  thinkingLevel?: string | null;
}>;

export type PracticeSample = Readonly<{
  model: string;
  providerRef: string;
  gate: PracticeGateName;
  lane: PracticeLane;
  sample: number;
  questionId: string;
  status: PracticeSampleStatus;
  /** Wall time of the whole job (includes the policy's 60-second wait when a call was refused as busy). */
  latencyMs: number;
  attempts: readonly PracticeAttempt[];
  inputTokens: number | null;
  outputTokens: number | null;
  /**
   * The part of `inputTokens` the vendor read from its prompt cache, over the job's calls that reported it (null when
   * none did; absent in older logs).
   */
  cachedInputTokens?: number | null;
  costNanoUsd: string | null;
  unbilledRefusals: number;
  /**
   * For a REPAIRED job: how its slip was fixed (`PracticeRepairKind`: PATCH, FULL or RESEND), the first repaired call's;
   * null otherwise, and for a repaired call whose accepted try's form is not known; absent in older logs.
   */
  repairKind?: PracticeRepairKind | null;
  /** Length guidance (LG-D): a STORYTELLER job's story facts (counts only); absent on every other job and in older logs. */
  story?: PracticeStorySample;
  /** For a reply that failed its format check: what the check said, as `code@path`, and the re-check of the stored text. */
  issues: readonly string[];
  recheckIssues: readonly string[];
  errorCode: string | null;
  /** Only for a non-PARSED reply: the reply text, key-shaped strings blanked, at most 64 KiB. */
  replyText: string | null;
  detail: string | null;
  /**
   * Spec 2026-10-12 §4.8, only in a `--levels` run (absent otherwise and in older logs): the run ("high#1") and level
   * the job was asked at, its thinking tokens as the vendor reported them (null when none did), whether any reply of
   * it stopped at max_tokens, and its accepted answer (key-shaped strings blanked, at most 64 KiB; null without one).
   */
  levelRun?: string;
  thinkingLevel?: PreviewEffort;
  reasoningTokens?: number | null;
  cutOff?: boolean;
  answerText?: string | null;
}>;

/** What one job's gateway recorded in memory: its stored replies, its ledger rows, and each try's reply form. */
export type PracticeSink = { artifacts: RawArtifactInput[]; ledger: ProviderLedgerInput[]; forms: Map<string, PracticeReplyForm | null> };

/** The gateway one target uses, built exactly as the runner builds it on the preview, but recording in memory. */
function recordingGateway(input: Readonly<{
  target: ProviderDiscoveryTarget;
  config: PreviewProviderTestConfig;
  guardedFetch: typeof fetch;
  sink: PracticeSink;
  sleep?: (milliseconds: number) => Promise<void>;
  gateRemaining?: Readonly<Partial<Record<PreviewProviderName, () => Promise<PreviewGateRemaining>>>>;
  onFinalWriterTierUnread?: (event: PreviewFinalWriterTierUnread) => void;
}>): ProviderGateway {
  const http = new OpenAICompatibleProviderGateway({
    fetchImplementation: input.guardedFetch,
    endpoint: input.target.baseUrl,
    model: input.target.model,
    maker: input.target.maker,
    ...providerTargetGatewayControls(input.target),
    ...previewTargetGatewayControls(input.config, input.target),
    assertNoOpenWriteTransaction: () => undefined,
    persistRawArtifact: async (artifact) => { input.sink.artifacts.push(artifact); return artifact.artifactId; },
    appendLedgerEntry: async (entry) => { input.sink.ledger.push(entry); return randomUUID(); },
    // As the runner's gateway records each attempt's prompt (ledger.call_prompt), but only its form is kept here.
    persistCallPrompt: async (prompt) => { input.sink.forms.set(prompt.attemptId, practiceReplyFormOf(prompt.messages)); }
  });
  return withPreviewProviderCallPolicy(http, input.config, input.target, { ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
    ...(input.gateRemaining === undefined ? {} : { gateRemaining: input.gateRemaining }),
    ...(input.onFinalWriterTierUnread === undefined ? {} : { onFinalWriterTierUnread: input.onFinalWriterTierUnread }) });
}

/**
 * One job's gateway (formats: a job; openings: one call of a step), recording in memory, and watched as the runner's
 * sit-out book watches a member's (apps/runner/src/run-sit-out.ts): `endedBusy()` says whether a call through it ended in
 * the vendor's refusal, not billed (providerCallEndedVendorRefusedUnbilled). A caller that swallows its calls' failures
 * (the story writer) cannot say it itself.
 */
export function practiceJobGateway(input: Readonly<{
  target: ProviderDiscoveryTarget;
  config: PreviewProviderTestConfig;
  guardedFetch: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  gateRemaining?: Readonly<Partial<Record<PreviewProviderName, () => Promise<PreviewGateRemaining>>>>;
  onFinalWriterTierUnread?: (event: PreviewFinalWriterTierUnread) => void;
}>): Readonly<{ gateway: ProviderGateway; sink: PracticeSink; endedBusy: () => boolean }> {
  const sink: PracticeSink = { artifacts: [], ledger: [], forms: new Map<string, PracticeReplyForm | null>() };
  const recording = recordingGateway({ target: input.target, config: input.config, guardedFetch: input.guardedFetch, sink,
    ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
    ...(input.gateRemaining === undefined ? {} : { gateRemaining: input.gateRemaining }),
    ...(input.onFinalWriterTierUnread === undefined ? {} : { onFinalWriterTierUnread: input.onFinalWriterTierUnread }) });
  let endedBusy = false;
  const gateway: ProviderGateway = Object.freeze({
    call: async (request: Parameters<ProviderGateway["call"]>[0]) => {
      try {
        return await recording.call(request);
      } catch (error) {
        if (providerCallEndedVendorRefusedUnbilled(error)) endedBusy = true;
        throw error;
      }
    }
  });
  return Object.freeze({ gateway, sink, endedBusy: () => endedBusy });
}

/** Each try of a job, in order, from what its gateway recorded (`PracticeAttempt`). */
export function practiceAttemptsOf(sink: PracticeSink): readonly PracticeAttempt[] {
  return Object.freeze(sink.ledger.map((entry): PracticeAttempt => {
    const artifact = sink.artifacts.find((candidate) => candidate.attemptId === entry.attemptId) ?? null;
    const ceiling = artifact?.metadata.token_ceiling;
    return Object.freeze({ callSiteKey: entry.callSiteKey, outcome: entry.outcome, parseStatus: artifact?.parseStatus ?? null,
      latencyMs: entry.finishedAt.getTime() - entry.startedAt.getTime(),
      jsonRepair: artifact === null || entry.outcome !== "OK" ? null
        // Engine redesign R3: formats mode runs no map; a map reply read here would be read by engine 1's readings (a MAP:check reply as UNMAPPED).
        : practiceJsonRepairOf(replyContentOf(artifact.rawText), practiceFinishReasonOf(artifact.metadata), entry.callSiteKey),
      replyForm: sink.forms.get(entry.attemptId) ?? null,
      tokenCeiling: typeof ceiling === "number" && Number.isSafeInteger(ceiling) ? ceiling : null,
      thinkingLevel: entry.thinkingLevel ?? null });
  }));
}

/**
 * A job's tokens, summed over its own model's gate calls (`wire`: the gate watch's events since the job began, for that
 * model only), and their cost at the model's preview price. Each count is null when no call reported it. The cost is
 * priced POST by POST at each POST's own tier, then summed: a final writer's output is not clamped at the standard
 * bound, and several POSTs' output is never clamped together (Task 6 review, Minor 1).
 */
export function practiceWireUsage(model: string, wire: readonly PracticeWireEvent[]): Readonly<{
  inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; cachedInputTokens: number | null;
  costNanoUsd: string | null;
}> {
  const total = (pick: (event: PracticeWireEvent) => number | null | undefined) => wire.reduce<number | null>((sum, event) => {
    const value = pick(event);
    return value === null || value === undefined ? sum : (sum ?? 0) + value;
  }, null);
  const inputTokens = total((event) => event.inputTokens);
  const outputTokens = total((event) => event.outputTokens);
  const row = previewModelRow(model);
  return Object.freeze({ inputTokens, outputTokens, reasoningTokens: total((event) => event.reasoningTokens),
    cachedInputTokens: total((event) => event.cachedInputTokens),
    costNanoUsd: row === undefined || inputTokens === null || outputTokens === null ? null
      : String(wire.reduce((sum, event) => sum + previewCallNanoUsd(row, BigInt(event.inputTokens ?? 0), event.outputTokens ?? 0,
        event.callTier ?? "STANDARD"), 0n)) });
}

/** A model's budget of busy waits as used so far: the time, the waits, the waits in a row. */
export type PracticeWaitBudget = { usedMs: number; waits: number; inARow: number };

/**
 * The next wait of a model whose job just ended busy, or null when its budget (`budgetMs`) is spent or the gate does not
 * serve the model (its last busy-kind event is NOT_SERVED: waiting cannot change that, so it sits out at once, the budget
 * untouched). The reason and the gate's own retry_after are read from the job's last busy event (`wire`); the wait is
 * `practiceBusyWaitMs`, cut to what is left of the budget. The budget is updated (time used, waits, waits in a row).
 */
export function practiceNextBusyWait(budget: PracticeWaitBudget, budgetMs: number, wire: readonly PracticeWireEvent[],
  random?: () => number): Readonly<{ waitMs: number; reason: "VENDOR_REFUSED" | "MODEL_COOLING"; retryAfterSeconds: number | null }> | null {
  if (budget.usedMs >= budgetMs) return null;
  const busyEvent = [...wire].reverse().find((event) => event.unbilledKind === "VENDOR_REFUSED"
    || event.unbilledKind === "MODEL_COOLING" || event.unbilledKind === "NOT_SERVED");
  if (busyEvent?.unbilledKind === "NOT_SERVED") return null;
  const reason = busyEvent?.unbilledKind === "MODEL_COOLING" ? "MODEL_COOLING" : "VENDOR_REFUSED";
  const retryAfterSeconds = reason === "MODEL_COOLING" ? busyEvent?.retryAfterSeconds ?? null : null;
  const waitMs = Math.min(budgetMs - budget.usedMs,
    practiceBusyWaitMs({ retryAfterSeconds, waitsInARow: budget.inARow, ...(random === undefined ? {} : { random }) }));
  budget.usedMs += waitMs;
  budget.waits += 1;
  budget.inARow += 1;
  return Object.freeze({ waitMs, reason, retryAfterSeconds });
}

/**
 * The ports a run's calls go through: each call takes a place at its gate (the gate's limit), then one overall, always
 * in that order, before the brake looks at it.
 */
export function practiceLimitedPorts(ports: PreviewBudgetPorts, limits: Readonly<{
  gateLimits?: Readonly<Partial<Record<PracticeGateName, number>>>; maxInFlight?: number;
}> = {}): PreviewBudgetPorts {
  const overall = new PracticeSemaphore(limits.maxInFlight ?? PRACTICE_FORMATS_DEFAULTS.maxInFlight);
  return Object.fromEntries(Object.entries(ports).map(([provider, port]) => {
    const gate: PracticeGateName = provider === "anthropic" ? "anthropic" : "deepinfra";
    const perGate = new PracticeSemaphore(limits.gateLimits?.[gate] ?? PRACTICE_FORMATS_DEFAULTS.gateLimits[gate]);
    return [provider, port === undefined ? port : limitPort(port, [perGate, overall])];
  })) as PreviewBudgetPorts;
}

/** The code a skipped job of a busy model carries. Nothing was sent. */
export const PRACTICE_MODEL_BUSY = "PRACTICE_MODEL_BUSY" as const;

export function gateOf(model: string): PracticeGateName {
  return previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra";
}

export function errorCodeOf(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
    if (error instanceof Error) return error.name;
  }
  return "UNKNOWN";
}

export type PracticeFormatsResult = Readonly<{
  samples: readonly PracticeSample[];
  /** Models (by id) the run was asked to cover. */
  models: readonly string[];
  lanes: readonly PracticeLane[];
  /** Models marked busy (a call ended refused as busy): their remaining jobs were skipped. In the order marked. */
  busyModels: readonly string[];
}>;

/**
 * The turn order of the models: the gates' model lists merged one by one (the first target's gate first), so the
 * Anthropic model sits between the DeepInfra ones. Each gate's models keep their declared order.
 */
export function practiceTurnOrder(targets: readonly ProviderDiscoveryTarget[]): readonly ProviderDiscoveryTarget[] {
  const byGate = new Map<PracticeGateName, ProviderDiscoveryTarget[]>();
  for (const target of targets) {
    const gate = gateOf(target.model);
    byGate.set(gate, [...(byGate.get(gate) ?? []), target]);
  }
  const lists = [...byGate.values()];
  const order: ProviderDiscoveryTarget[] = [];
  for (let index = 0; order.length < targets.length; index += 1) {
    for (const list of lists) if (index < list.length) order.push(list[index]!);
  }
  return Object.freeze(order);
}

/**
 * The formats mode's defaults for calls at once: each gate's when root's status does not name the gate's
 * max_concurrent_calls, and all together (one per model for the five models; the relay must accept a few more
 * connections, README S-4).
 */
export const PRACTICE_FORMATS_DEFAULTS: Readonly<{ gateLimits: Readonly<Record<PracticeGateName, number>>; maxInFlight: number }> =
  Object.freeze({ gateLimits: Object.freeze({ deepinfra: 4, anthropic: 1 }), maxInFlight: 5 });

/** The first wait of a busy model without the gate's retry_after; each wait in a row doubles it, up to the most. */
const BUSY_WAIT_FIRST_MS = 60_000;
const BUSY_WAIT_MOST_MS = 600_000;

/**
 * How long a busy model waits before its job is tried again: the gate's retry_after when it named one (never less),
 * else 60 s doubling with each wait in a row (60, 120, 240, 480), at most 600 s: the gate's own cool-off steps (owner,
 * 2026-10-12). Never shorter than that, and up to a quarter longer (so the models'
 * retries do not line up).
 */
export function practiceBusyWaitMs(input: Readonly<{ retryAfterSeconds: number | null; waitsInARow: number; random?: () => number }>): number {
  const spread = 1 + 0.25 * Math.min(1, Math.max(0, (input.random ?? Math.random)()));
  if (input.retryAfterSeconds !== null) return Math.round(input.retryAfterSeconds * 1_000 * spread);
  const base = Math.min(BUSY_WAIT_MOST_MS, BUSY_WAIT_FIRST_MS * 2 ** Math.max(0, input.waitsInARow));
  return Math.min(BUSY_WAIT_MOST_MS, Math.round(base * spread));
}

/** A busy model parked: what samples.jsonl keeps of it. */
export type PracticeBusyWait = Readonly<{
  model: string; lane: PracticeLane; sample: number;
  /** This model's waits so far, this one included. */
  wait: number;
  waitMs: number;
  reason: Extract<PracticeUnbilledKind, "VENDOR_REFUSED" | "MODEL_COOLING">;
  retryAfterSeconds: number | null;
}>;
/** A parked model's wait ended (cancelled: the operator's interrupt or a gate stop cut it short or ends the run). */
export type PracticeBusyResume = Readonly<{ model: string; lane: PracticeLane; sample: number; waitedMs: number; cancelled: boolean }>;

export async function runPracticeFormats(input: Readonly<{
  config: PreviewProviderTestConfig;
  /** One target per model (the first declared target of each model). */
  targets: readonly ProviderDiscoveryTarget[];
  ports: PreviewBudgetPorts;
  observer: PracticeGateObserver;
  lanes: readonly PracticeLane[];
  samples: number;
  gapMs: number;
  pack: StoryPack;
  bounds: PracticeLaneBounds;
  /** `--story-length` (LG-D, R1d): the story jobs are asked as engine 2's story, with these targets and settings. */
  storyLength?: PracticeStoryV4Settings;
  /** Test seam for the gap and the preview policy's resend wait. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** One content-free progress line per job. */
  progress?: (line: string) => void;
  /** Set to stop between jobs (the operator's interrupt). */
  shouldStop?: () => boolean;
  /** Models at once (default false: one call at a time, the old order). */
  parallel?: boolean;
  /** Each gate's calls at once (default PRACTICE_FORMATS_DEFAULTS.gateLimits). */
  gateLimits?: Readonly<Partial<Record<PracticeGateName, number>>>;
  /** Calls at once in all (default PRACTICE_FORMATS_DEFAULTS.maxInFlight). */
  maxInFlight?: number;
  /** Test seam for the jittered gap. */
  random?: () => number;
  /** Told each finished (or skipped) job at once: the samples log. */
  onSample?: (sample: PracticeSample) => void;
  /** Told each model marked busy at once (its wait budget spent: the rest of its jobs are skipped). */
  onBusy?: (model: string) => void;
  /** Each model's budget of busy waits, in ms (default 0: a busy model's remaining jobs are skipped at once). */
  busyWaitMs?: number;
  /** Told each time a busy model is parked, and when its wait ends. */
  onBusyWait?: (wait: PracticeBusyWait) => void;
  onResume?: (resume: PracticeBusyResume) => void;
  /** Aborted by the operator's interrupt: cuts the busy waits short. */
  stopSignal?: AbortSignal;
  /** Spec 2026-10-12 §4.8 (`--levels`): each listed model's runs; a model not listed runs once, as without it. */
  levels?: PracticeLevelPlan;
  /** Each gate's read-only `/remaining` (pre-flight PF-B2.3): the final writers' tier when the gate serves it; absent: STANDARD. */
  gateRemaining?: Readonly<Partial<Record<PreviewProviderName, () => Promise<PreviewGateRemaining>>>>;
  /** Task 4 review fix 1: told once per gate and reason when a final writer is sent as STANDARD (one function per run). */
  onFinalWriterTierUnread?: (event: PreviewFinalWriterTierUnread) => void;
}>): Promise<PracticeFormatsResult> {
  const budgetMs = input.busyWaitMs ?? 0;
  // Each model's waits: the time used of its budget, its waits so far and in a row, and the wait it is parked in.
  type WaitState = { usedMs: number; waits: number; inARow: number; parked: { lane: PracticeLane; sample: number; since: number } | null };
  const waiting = new Map<string, WaitState>();
  const waitState = (model: string): WaitState => {
    const known = waiting.get(model);
    if (known !== undefined) return known;
    const fresh: WaitState = { usedMs: 0, waits: 0, inARow: 0, parked: null };
    waiting.set(model, fresh);
    return fresh;
  };
  // Each call takes a place at its gate, then one overall (always in that order), before the brake looks at it.
  const guardedFetch = createPreviewGuardedFetch(practiceLimitedPorts(input.ports, {
    ...(input.gateLimits === undefined ? {} : { gateLimits: input.gateLimits }),
    ...(input.maxInFlight === undefined ? {} : { maxInFlight: input.maxInFlight }) }));
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const samples: PracticeSample[] = [];
  const busy: string[] = [];
  const record = (sample: PracticeSample) => { samples.push(sample); input.onSample?.(sample); };
  const order = practiceTurnOrder(input.targets);
  // Spec 2026-10-12 §4.8: with --levels each job is asked once per run of a model, its runs one after another (so one
  // model never has two calls at once, and the per-model slice of the gate's events below stays this job's own).
  const jobs = practiceLevelJobs(input.lanes, input.samples, input.levels);
  const prepare = (target: ProviderDiscoveryTarget, job: PracticeLevelJob): PracticePreparedJob => {
    const run = practiceRunOfJob(input.levels, target.model, job);
    // A slot this model has no run for (it has fewer runs than the longest plan): nothing to do, nothing recorded.
    if (run === null) return null;
    const { lane, sample } = job;
    const gate = gateOf(target.model);
    const question = PRACTICE_QUESTIONS[(sample - 1) % PRACTICE_QUESTIONS.length]!;
    const base = { model: target.model, providerRef: target.providerRef, gate, lane, sample, questionId: question.id,
      ...(run === undefined ? {} : { levelRun: run.run, thinkingLevel: run.level }) };
    const state = waitState(target.model);
    // Spec 2026-10-12 §4.8 (final review fix 5): with --levels every line about this job names its run ("high#2").
    const runTag = run === undefined ? "" : ` ${run.run}`;
    if (state.parked !== null) {
      const cancelled = input.observer.stopped(gate) !== null || input.shouldStop?.() === true;
      input.onResume?.(Object.freeze({ model: target.model, lane, sample, cancelled,
        waitedMs: Math.round(performance.now() - state.parked.since) }));
      if (!cancelled) input.progress?.(`${target.model} ${lane} #${String(sample)}${runTag}: trying again after its wait`);
      state.parked = null;
    }
    const skipped = (status: "SKIPPED_GATE_STOPPED" | "SKIPPED_MODEL_BUSY", errorCode: string) => {
      record(Object.freeze({ ...base, status, latencyMs: 0, attempts: [],
        inputTokens: null, outputTokens: null, cachedInputTokens: null, costNanoUsd: null, repairKind: null, unbilledRefusals: 0, issues: [], recheckIssues: [],
        errorCode, replyText: null, detail: null, ...(run === undefined ? {} : { reasoningTokens: null, cutOff: false, answerText: null }) }));
      return null;
    };
    if (input.observer.stopped(gate) !== null || input.shouldStop?.() === true) {
      return skipped("SKIPPED_GATE_STOPPED", input.observer.stopped(gate)?.reason ?? "PRACTICE_INTERRUPTED");
    }
    if (busy.includes(target.model)) return skipped("SKIPPED_MODEL_BUSY", PRACTICE_MODEL_BUSY);
    return async () => {
      // The job's gateway, watched as the runner's sit-out book watches a member's (the story writer swallows its
      // calls' failures, so the job's own outcome cannot say it). Spec 2026-10-12 §4.8: a `--levels` run's job is asked
      // with a config naming only that run's level.
      const job = practiceJobGateway({ target, config: run === undefined ? input.config : practiceLevelConfig(input.config, run), guardedFetch,
        ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
        ...(input.gateRemaining === undefined ? {} : { gateRemaining: input.gateRemaining }),
        ...(input.onFinalWriterTierUnread === undefined ? {} : { onFinalWriterTierUnread: input.onFinalWriterTierUnread }) });
      const { gateway, sink } = job;
      const eventsBefore = input.observer.events.length;
      const started = performance.now();
      let errorCode: string | null = null;
      let postCheckError: string | null = null;
      let detail: string | null = null;
      try {
        const outcome = await runPracticeLane({ lane, question, gateway, providerRef: target.providerRef, maker: target.maker,
          bounds: input.bounds, pack: input.pack, runId: randomUUID(), workItemId: randomUUID(), sample,
          ...(input.storyLength === undefined ? {} : { storyLength: input.storyLength }) });
        postCheckError = outcome.postCheckError;
        detail = outcome.detail;
      } catch (error) {
        errorCode = errorCodeOf(error);
      }
      const latencyMs = Math.round(performance.now() - started);
      // This model's own calls only: with the models at once, the others' calls land in between.
      const wire = input.observer.events.slice(eventsBefore).filter((event) => event.model === target.model);
      const unbilled = wire.filter((event) => event.outcome === "UNBILLED").length;
      const errorUnbilled = wire.filter((event) => event.unbilledKind === "VENDOR_ERROR_UNBILLED").length;
      const { inputTokens, outputTokens, cachedInputTokens, costNanoUsd } = practiceWireUsage(target.model, wire);
      const attempts = practiceAttemptsOf(sink);
      // The real model's artifacts only (the story jobs' local stand-in records none).
      const failed = [...sink.artifacts].reverse().find((artifact) => artifact.parseStatus !== "PARSED") ?? null;
      const last = sink.artifacts.at(-1) ?? null;
      // Length guidance (LG-D): a story job's own words per field and its unreadable replies (the real model's only); a
      // PATCH try is told by its recorded form and skipped (PF-D8.12).
      const story = lane === "STORYTELLER"
        ? practiceStorySampleOf(sink.artifacts.map((artifact) => ({ rawText: artifact.rawText, parseStatus: artifact.parseStatus,
          replyForm: sink.forms.get(artifact.attemptId) ?? null })), input.storyLength?.lengthGuidance ?? null)
        : undefined;
      // Owner ruling 2026-10-12 ("Fixed slips = warning"): a slip the same call's second try fixed is REPAIRED; a call
      // that never got an accepted reply keeps the refused reply's status.
      const triesOfJob = [...new Set(attempts.map((attempt) => attempt.callSiteKey))]
        .map((key) => attempts.filter((attempt) => attempt.callSiteKey === key));
      const callsOfJob = triesOfJob.map((tries) => practiceCallFacts(tries));
      const repairKind = triesOfJob.map((tries) => practiceRepairKindOf(tries)).find((kind) => kind !== null) ?? null;
      let status: PracticeSampleStatus;
      if (last !== null && last.parseStatus !== "PARSED") status = last.parseStatus;
      else if (failed !== null && callsOfJob.some((call) => call.unrecovered)) status = failed.parseStatus;
      else if (postCheckError !== null) status = "POST_CHECK_FAILED";
      else if (failed !== null && errorCode === null) status = "REPAIRED";
      else if (failed !== null) status = failed.parseStatus;
      else if (last !== null && errorCode === null) status = "PARSED";
      // The vendor answered with an error it did not bill and that is not "busy" (e.g. Anthropic's 400): a failed call.
      else if (errorUnbilled > 0 && last === null) status = "VENDOR_ERROR_UNBILLED";
      else if (unbilled > 0 && last === null) status = "UNBILLED_REFUSED";
      else if (last !== null && errorCode !== null) status = "POST_CHECK_FAILED";
      else status = "CALL_FAILED";
      // The slip itself for diagnosis: the FIRST refused reply (a refused patch reply after it carries only the members
      // it was asked for, and the full re-ask's reply comes after that).
      const problem = sink.artifacts.find((artifact) => artifact.parseStatus !== "PARSED") ?? null;
      const content = problem === null ? null : replyContentOf(problem.rawText);
      const issues = problem === null ? [] : issueListFromParseError(problem.parseError ?? null);
      // Engine redesign R3: formats mode runs no map; a map reply read here would be read by engine 1's readings (a MAP:check reply as UNMAPPED).
      const recheck = problem === null || content === null ? [] : recheckReply(attempts.find((attempt) => attempt.parseStatus !== "PARSED")?.callSiteKey
        ?? attempts[0]?.callSiteKey ?? "UNMAPPED", content).issues;
      // A call ended in the vendor's refusal, not billed: while its budget lasts, the model is parked and the SAME job is
      // tried again after its wait (this attempt is not a sample; the busy-wait line keeps it, the wire lines its calls).
      const endedBusy = job.endedBusy();
      const next = endedBusy ? practiceNextBusyWait(state, budgetMs, wire, input.random) : null;
      if (next !== null) {
        const { waitMs, reason, retryAfterSeconds } = next;
        state.parked = { lane, sample, since: performance.now() };
        input.onBusyWait?.(Object.freeze({ model: target.model, lane, sample, wait: state.waits, waitMs, reason, retryAfterSeconds }));
        input.progress?.(`${target.model} is busy (refused, not billed): waiting ${String(Math.round(waitMs / 1_000))}s, then ${lane} #${String(sample)}${runTag} again`);
        return { retryAfterMs: waitMs };
      }
      if (!endedBusy) state.inARow = 0;
      // Its budget spent: the model sits out the rest (marked before the sample is told).
      const markedBusy = endedBusy && !busy.includes(target.model);
      if (markedBusy) busy.push(target.model);
      record(Object.freeze({
        ...base, status, latencyMs, attempts: Object.freeze(attempts), inputTokens, outputTokens, cachedInputTokens, costNanoUsd,
        unbilledRefusals: unbilled, repairKind: status === "REPAIRED" ? repairKind : null, issues, recheckIssues: recheck,
        errorCode: postCheckError ?? errorCode,
        replyText: content === null ? null : reportableReplyText(content),
        detail,
        ...(run === undefined ? {} : levelFacts(wire, sink)),
        ...(story === undefined ? {} : { story })
      }));
      if (markedBusy) {
        input.onBusy?.(target.model);
        input.progress?.(`${target.model} is busy (refused, not billed): its remaining jobs are skipped`);
      }
      input.progress?.(`${target.model} ${lane} #${String(sample)}${runTag}: ${status} ${String(latencyMs)}ms`);
      return undefined;
    };
  };
  await runModelQueues({ models: order, jobs, parallel: input.parallel === true, gapMs: input.gapMs, prepare, sleep,
    ...(input.random === undefined ? {} : { random: input.random }),
    ...(input.stopSignal === undefined ? {} : { signal: input.stopSignal }) });
  return Object.freeze({ samples: Object.freeze(samples), models: Object.freeze(input.targets.map((target) => target.model)),
    lanes: Object.freeze([...input.lanes]), busyModels: Object.freeze([...busy]) });
}

/**
 * The preview's declared targets (the runner's PROVIDER_DISCOVERY_TARGETS_JSON), read against the reviewed provider
 * list as the runner reads them: each reviewed ref's maker and adapter from its preview model row.
 */
export function practiceDeclaredTargets(targetsJson: string): readonly ProviderDiscoveryTarget[] {
  const configured = PREVIEW_REVIEWED_PROVIDER_REFS.map((providerRef) => {
    const row = previewModelRow(previewTargetJsonRow(providerRef).model)!;
    return { providerRef, maker: row.maker, adapterKind: row.adapterKind };
  });
  return parseProviderDiscoveryTargets(targetsJson, configured);
}

/** The preview's call policy over the development organ bounds, as the practice uses it (the judge, composer, evaluator bounds). */
export function practiceRunnerPolicy(previewConfig: PreviewProviderTestConfig): ReturnType<typeof previewRunnerPolicy> {
  return previewRunnerPolicy({
    bounds: DEVELOPMENT_ORGAN_COST_BOUNDS.organs,
    synthesisRolePolicy: { synthesizerBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.COMPOSER,
      evaluatorBound: DEVELOPMENT_ORGAN_COST_BOUNDS.organs.CONFORMANCE }
  }, previewConfig);
}

/**
 * Spec 2026-10-12 §4.8: what a `--levels` job adds: its thinking tokens (summed over its calls that reported them), cut
 * off (any reply stopped at max_tokens), and its last accepted answer, through the same blanking and cut as replyText.
 */
function levelFacts(wire: readonly PracticeWireEvent[], sink: Readonly<{ artifacts: readonly RawArtifactInput[]; ledger: readonly ProviderLedgerInput[] }>):
  Readonly<{ reasoningTokens: number | null; cutOff: boolean; answerText: string | null }> {
  const accepted = [...sink.artifacts].reverse().find((artifact) => artifact.parseStatus === "PARSED"
    && sink.ledger.some((entry) => entry.attemptId === artifact.attemptId && entry.outcome === "OK")) ?? null;
  return Object.freeze({
    reasoningTokens: wire.reduce<number | null>((sum, event) => event.reasoningTokens === null ? sum : (sum ?? 0) + event.reasoningTokens, null),
    cutOff: sink.artifacts.some((artifact) => ["length", "max_tokens"].includes(practiceFinishReasonOf(artifact.metadata) ?? "")),
    answerText: accepted === null ? null : reportableReplyText(replyContentOf(accepted.rawText))
  });
}

/** One target per reviewed model: the first declared target of each model, in declaration order. */
export function onePerModel(targets: readonly ProviderDiscoveryTarget[], models: readonly string[]): readonly ProviderDiscoveryTarget[] {
  const picked: ProviderDiscoveryTarget[] = [];
  for (const target of targets) {
    if (models.includes(target.model) && !picked.some((chosen) => chosen.model === target.model)) picked.push(target);
  }
  return Object.freeze(picked);
}
