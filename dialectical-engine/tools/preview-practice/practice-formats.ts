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
 * A busy model: when a job's call ends in the vendor's refusal, not billed (the call and its one resend, the gate's
 * PROVIDER_REFUSED_UNBILLED, or the model is cooling off as MODEL_COOLING), only that model is parked: it waits out its
 * cool-off (the gate's retry_after when it named one, else 120 s doubling up to 600 s, up to a quarter longer) while the
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
  previewModelRow,
  previewTargetGatewayControls,
  providerCallEndedVendorRefusedUnbilled,
  providerTargetGatewayControls,
  withPreviewProviderCallPolicy,
  createPreviewGuardedFetch,
  type PreviewBudgetPorts,
  type PreviewProviderTestConfig,
  type ProviderDiscoveryTarget,
  type ProviderGateway,
  type ProviderLedgerInput,
  type RawArtifactInput
} from "@debateai/providers";
import type { StoryPack } from "@debateai/story";
import { previewCallNanoUsd } from "../../apps/api/src/preview-budget-estimate.js";
import { limitPort, PracticeSemaphore, runModelQueues, type PracticePreparedJob } from "./practice-concurrency.js";
import type { PracticeGateName, PracticeGateObserver, PracticeUnbilledKind } from "./practice-gate-observer.js";
import {
  issueListFromParseError,
  recheckReply,
  replyContentOf,
  runPracticeLane,
  type PracticeLane,
  type PracticeLaneBounds
} from "./practice-lanes.js";
import { PRACTICE_QUESTIONS } from "./practice-questions.js";
import { reportableReplyText } from "./practice-redaction.js";

export type PracticeSampleStatus =
  | "PARSED" | "PARSE_FAILED" | "SCHEMA_FAILED" | "UNPARSED" | "POST_CHECK_FAILED"
  | "CALL_FAILED" | "UNBILLED_REFUSED" | "VENDOR_ERROR_UNBILLED" | "SKIPPED_GATE_STOPPED" | "SKIPPED_MODEL_BUSY";

export type PracticeAttempt = Readonly<{
  callSiteKey: string;
  outcome: ProviderLedgerInput["outcome"];
  parseStatus: RawArtifactInput["parseStatus"] | null;
  latencyMs: number;
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
  costNanoUsd: string | null;
  unbilledRefusals: number;
  /** For a reply that failed its format check: what the check said, as `code@path`, and the re-check of the stored text. */
  issues: readonly string[];
  recheckIssues: readonly string[];
  errorCode: string | null;
  /** Only for a non-PARSED reply: the reply text, key-shaped strings blanked, at most 64 KiB. */
  replyText: string | null;
  detail: string | null;
}>;

/** The gateway one target uses, built exactly as the runner builds it on the preview, but recording in memory. */
function recordingGateway(input: Readonly<{
  target: ProviderDiscoveryTarget;
  config: PreviewProviderTestConfig;
  guardedFetch: typeof fetch;
  sink: { artifacts: RawArtifactInput[]; ledger: ProviderLedgerInput[] };
  sleep?: (milliseconds: number) => Promise<void>;
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
    appendLedgerEntry: async (entry) => { input.sink.ledger.push(entry); return randomUUID(); }
  });
  return withPreviewProviderCallPolicy(http, input.config, input.target, input.sleep === undefined ? {} : { sleep: input.sleep });
}

/** The code a skipped job of a busy model carries. Nothing was sent. */
export const PRACTICE_MODEL_BUSY = "PRACTICE_MODEL_BUSY" as const;

function gateOf(model: string): PracticeGateName {
  return previewModelRow(model)?.provider === "anthropic" ? "anthropic" : "deepinfra";
}

function errorCodeOf(error: unknown): string {
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
const BUSY_WAIT_FIRST_MS = 120_000;
const BUSY_WAIT_MOST_MS = 600_000;

/**
 * How long a busy model waits before its job is tried again: the gate's retry_after when it named one, else 120 s
 * doubling with each wait in a row, at most 600 s. Never shorter than that, and up to a quarter longer (so the models'
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
  const overall = new PracticeSemaphore(input.maxInFlight ?? PRACTICE_FORMATS_DEFAULTS.maxInFlight);
  const limited = Object.fromEntries(Object.entries(input.ports).map(([provider, port]) => {
    const gate: PracticeGateName = provider === "anthropic" ? "anthropic" : "deepinfra";
    const perGate = new PracticeSemaphore(input.gateLimits?.[gate] ?? PRACTICE_FORMATS_DEFAULTS.gateLimits[gate]);
    return [provider, port === undefined ? port : limitPort(port, [perGate, overall])];
  })) as PreviewBudgetPorts;
  const guardedFetch = createPreviewGuardedFetch(limited);
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const samples: PracticeSample[] = [];
  const busy: string[] = [];
  const record = (sample: PracticeSample) => { samples.push(sample); input.onSample?.(sample); };
  const order = practiceTurnOrder(input.targets);
  const jobs = input.lanes.flatMap((lane) => Array.from({ length: input.samples }, (_unused, index) => ({ lane, sample: index + 1 })));
  const prepare = (target: ProviderDiscoveryTarget, job: Readonly<{ lane: PracticeLane; sample: number }>): PracticePreparedJob => {
    const { lane, sample } = job;
    const gate = gateOf(target.model);
    const question = PRACTICE_QUESTIONS[(sample - 1) % PRACTICE_QUESTIONS.length]!;
    const base = { model: target.model, providerRef: target.providerRef, gate, lane, sample, questionId: question.id };
    const state = waitState(target.model);
    if (state.parked !== null) {
      const cancelled = input.observer.stopped(gate) !== null || input.shouldStop?.() === true;
      input.onResume?.(Object.freeze({ model: target.model, lane, sample, cancelled,
        waitedMs: Math.round(performance.now() - state.parked.since) }));
      if (!cancelled) input.progress?.(`${target.model} ${lane} #${String(sample)}: trying again after its wait`);
      state.parked = null;
    }
    const skipped = (status: "SKIPPED_GATE_STOPPED" | "SKIPPED_MODEL_BUSY", errorCode: string) => {
      record(Object.freeze({ ...base, status, latencyMs: 0, attempts: [],
        inputTokens: null, outputTokens: null, costNanoUsd: null, unbilledRefusals: 0, issues: [], recheckIssues: [],
        errorCode, replyText: null, detail: null }));
      return null;
    };
    if (input.observer.stopped(gate) !== null || input.shouldStop?.() === true) {
      return skipped("SKIPPED_GATE_STOPPED", input.observer.stopped(gate)?.reason ?? "PRACTICE_INTERRUPTED");
    }
    if (busy.includes(target.model)) return skipped("SKIPPED_MODEL_BUSY", PRACTICE_MODEL_BUSY);
    return async () => {
      const sink = { artifacts: [] as RawArtifactInput[], ledger: [] as ProviderLedgerInput[] };
      const recording = recordingGateway({ target, config: input.config, guardedFetch, sink,
        ...(input.sleep === undefined ? {} : { sleep: input.sleep }) });
      // The job's gateway, watched as the runner's sit-out book watches a member's (the story writer swallows its
      // calls' failures, so the job's own outcome cannot say it).
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
      const eventsBefore = input.observer.events.length;
      const started = performance.now();
      let errorCode: string | null = null;
      let postCheckError: string | null = null;
      let detail: string | null = null;
      try {
        const outcome = await runPracticeLane({ lane, question, gateway, providerRef: target.providerRef, maker: target.maker,
          bounds: input.bounds, pack: input.pack, runId: randomUUID(), workItemId: randomUUID(), sample });
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
      const inputTokens = wire.reduce<number | null>((sum, event) => event.inputTokens === null ? sum : (sum ?? 0) + event.inputTokens, null);
      const outputTokens = wire.reduce<number | null>((sum, event) => event.outputTokens === null ? sum : (sum ?? 0) + event.outputTokens, null);
      const row = previewModelRow(target.model);
      const costNanoUsd = row === undefined || inputTokens === null || outputTokens === null ? null
        : String(previewCallNanoUsd(row, BigInt(inputTokens), outputTokens));
      const attempts = sink.ledger.map((entry): PracticeAttempt => {
        const artifact = sink.artifacts.find((candidate) => candidate.attemptId === entry.attemptId) ?? null;
        return Object.freeze({ callSiteKey: entry.callSiteKey, outcome: entry.outcome, parseStatus: artifact?.parseStatus ?? null,
          latencyMs: entry.finishedAt.getTime() - entry.startedAt.getTime() });
      });
      // The real model's artifacts only (the story jobs' local stand-in records none).
      const failed = [...sink.artifacts].reverse().find((artifact) => artifact.parseStatus !== "PARSED") ?? null;
      const last = sink.artifacts.at(-1) ?? null;
      let status: PracticeSampleStatus;
      if (last !== null && last.parseStatus !== "PARSED") status = last.parseStatus;
      else if (failed !== null) status = failed.parseStatus; // a repair fixed it, but the first reply had the wrong format
      else if (postCheckError !== null) status = "POST_CHECK_FAILED";
      else if (last !== null && errorCode === null) status = "PARSED";
      // The vendor answered with an error it did not bill and that is not "busy" (e.g. Anthropic's 400): a failed call.
      else if (errorUnbilled > 0 && last === null) status = "VENDOR_ERROR_UNBILLED";
      else if (unbilled > 0 && last === null) status = "UNBILLED_REFUSED";
      else if (last !== null && errorCode !== null) status = "POST_CHECK_FAILED";
      else status = "CALL_FAILED";
      const problem = failed ?? null;
      const content = problem === null ? null : replyContentOf(problem.rawText);
      const issues = problem === null ? [] : issueListFromParseError(problem.parseError ?? null);
      const recheck = problem === null || content === null ? [] : recheckReply(attempts.find((attempt) => attempt.parseStatus !== "PARSED")?.callSiteKey
        ?? attempts[0]?.callSiteKey ?? "UNMAPPED", content).issues;
      // A call ended in the vendor's refusal, not billed: while its budget lasts, the model is parked and the SAME job is
      // tried again after its wait (this attempt is not a sample; the busy-wait line keeps it, the wire lines its calls).
      if (endedBusy && state.usedMs < budgetMs) {
        const busyEvent = [...wire].reverse().find((event) => event.unbilledKind === "VENDOR_REFUSED" || event.unbilledKind === "MODEL_COOLING");
        const reason = busyEvent?.unbilledKind === "MODEL_COOLING" ? "MODEL_COOLING" : "VENDOR_REFUSED";
        const retryAfterSeconds = reason === "MODEL_COOLING" ? busyEvent?.retryAfterSeconds ?? null : null;
        const waitMs = Math.min(budgetMs - state.usedMs,
          practiceBusyWaitMs({ retryAfterSeconds, waitsInARow: state.inARow, ...(input.random === undefined ? {} : { random: input.random }) }));
        state.usedMs += waitMs;
        state.waits += 1;
        state.inARow += 1;
        state.parked = { lane, sample, since: performance.now() };
        input.onBusyWait?.(Object.freeze({ model: target.model, lane, sample, wait: state.waits, waitMs, reason, retryAfterSeconds }));
        input.progress?.(`${target.model} is busy (refused, not billed): waiting ${String(Math.round(waitMs / 1_000))}s, then ${lane} #${String(sample)} again`);
        return { retryAfterMs: waitMs };
      }
      if (!endedBusy) state.inARow = 0;
      // Its budget spent: the model sits out the rest (marked before the sample is told).
      const markedBusy = endedBusy && !busy.includes(target.model);
      if (markedBusy) busy.push(target.model);
      record(Object.freeze({
        ...base, status, latencyMs, attempts: Object.freeze(attempts), inputTokens, outputTokens, costNanoUsd,
        unbilledRefusals: unbilled, issues, recheckIssues: recheck,
        errorCode: postCheckError ?? errorCode,
        replyText: content === null ? null : reportableReplyText(content),
        detail
      }));
      if (markedBusy) {
        input.onBusy?.(target.model);
        input.progress?.(`${target.model} is busy (refused, not billed): its remaining jobs are skipped`);
      }
      input.progress?.(`${target.model} ${lane} #${String(sample)}: ${status} ${String(latencyMs)}ms`);
      return undefined;
    };
  };
  await runModelQueues({ models: order, jobs, parallel: input.parallel === true, gapMs: input.gapMs, prepare, sleep,
    ...(input.random === undefined ? {} : { random: input.random }),
    ...(input.stopSignal === undefined ? {} : { signal: input.stopSignal }) });
  return Object.freeze({ samples: Object.freeze(samples), models: Object.freeze(input.targets.map((target) => target.model)),
    lanes: Object.freeze([...input.lanes]), busyModels: Object.freeze([...busy]) });
}

/** One target per reviewed model: the first declared target of each model, in declaration order. */
export function onePerModel(targets: readonly ProviderDiscoveryTarget[], models: readonly string[]): readonly ProviderDiscoveryTarget[] {
  const picked: ProviderDiscoveryTarget[] = [];
  for (const target of targets) {
    if (models.includes(target.model) && !picked.some((chosen) => chosen.model === target.model)) picked.push(target);
  }
  return Object.freeze(picked);
}
