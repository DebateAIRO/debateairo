/**
 * Preview practice: the report (report.json for machines and reviewers, report.md for people) and its verdict.
 *
 * Plain words: the report holds codes, counts, times, tokens and money, and, only for a reply that failed its format
 * check, the reply text (our own practice content, key-shaped strings blanked, at most 64 KiB). It is written to a
 * folder OUTSIDE the repository (the tool refuses a folder inside it).
 */
import { mkdirSync, realpathSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { PracticeDebateResult, PracticeLanguageFollowUpRow, PracticeRepairRow, PracticeUnrepairedRow } from "./practice-debate.js";
import type { PracticeFormatsResult, PracticeSample } from "./practice-formats.js";
import { practiceStopIsPause, type PracticeGateName, type PracticeGateObserver, type PracticeGateSummary } from "./practice-gate-observer.js";
import {
  practiceDebateLanguageLines,
  practiceLanguageLines,
  type PracticeDebateLanguageBlock,
  type PracticeLanguageCaseRecord,
  type PracticeLanguageNotRun
} from "./practice-language.js";
import { practiceInvestigationLines, type PracticeInvestigationBlock } from "./practice-investigations.js";
import { practiceJudgeOrderLines } from "./practice-judge-order.js";
import { practiceJudgesLines, type PracticeJudgesBlocks } from "./practice-judges.js";
import { practiceLengthBlockLines, type PracticeLengthBlock } from "./practice-length.js";
import { practiceParallelLines, type PracticeParallelBlock } from "./practice-parallel.js";
import { practicePinsNotHeld, practiceWriterPinsLines, type PracticeWriterPinsBlock } from "./practice-pins.js";
import { practiceShapeLines, type PracticeShapeBlock } from "./practice-shape.js";
import { practiceStoryLengthFromSamples, practiceStoryLengthLines, type PracticeStoryJsonBreakRow, type PracticeStoryLengthRow } from "./practice-story-length.js";
import { practiceStoryEngineLines, type PracticeStoryBackupRow, type PracticeStoryReadyRate, type PracticeStoryRoundRow } from "./practice-story-rounds.js";
import { practiceLengthLines, practiceTokenLines, type PracticeLengthRow, type PracticeTokenRow } from "./practice-tokens.js";
import {
  latencySummary,
  percentile,
  practiceCallFacts,
  practiceModelCalls,
  practiceRepairKindsByModel,
  practiceSlipRateExceeded,
  practiceStructureRescuesShown,
  practiceVerdict,
  type PracticeBusyModelRun,
  type PracticeModelCalls,
  type PracticeRepairKinds,
  type PracticeStructureRescues,
  type PracticeVerdictResult
} from "./practice-verdict.js";

export const PRACTICE_REPORT_SCHEMA = "preview-practice-report-v1" as const;
export const GATES: readonly PracticeGateName[] = ["deepinfra", "anthropic"];

/** The default report folder: a fresh folder under the system temp folder. */
export function defaultReportDirectory(mode: string, now: Date = new Date()): string {
  return join(tmpdir(), `debateai-practice-${mode}-${now.toISOString().replace(/[:.]/gu, "-")}`);
}

/** Refuses a folder inside the repository (the report can hold model text; it never belongs in git). */
export function assertOutsideRepository(directory: string, repositoryRoot: string): string {
  const target = resolve(directory);
  const root = existsSync(repositoryRoot) ? realpathSync(repositoryRoot) : resolve(repositoryRoot);
  let real = target;
  // The folder may not exist yet: resolve its nearest existing parent.
  let probe = target;
  while (!existsSync(probe)) {
    const parent = resolve(probe, "..");
    if (parent === probe) break;
    probe = parent;
  }
  if (existsSync(probe)) real = join(realpathSync(probe), target.slice(probe.length));
  if (real === root || real.startsWith(root + sep)) throw new Error("PRACTICE_REPORT_INSIDE_REPOSITORY");
  return target;
}

type GateBlock = Readonly<{
  observed: PracticeGateSummary;
  wireLatencyMs: ReturnType<typeof latencySummary>;
  remainingBefore: Readonly<{ state: string; windowOpen: boolean; remainingUsd: string; remainingCalls: number }> | null;
  remainingAfter: Readonly<{ state: string; windowOpen: boolean; remainingUsd: string; remainingCalls: number }> | null;
  spentUsdByRemaining: string | null;
}>;

export function usd(nano: bigint): string {
  const sign = nano < 0n ? "-" : "";
  const abs = nano < 0n ? -nano : nano;
  return `${sign}${String(abs / 1_000_000_000n)}.${String(abs % 1_000_000_000n).padStart(9, "0")}`;
}

/**
 * What a gate spent by its own count: its remaining money before the run less after it, or null without both. It
 * includes any live-site spend in the same window: a check, never the source of the cost figures. Formats and openings
 * report it the same way.
 */
export function spentUsdByRemaining(beforeNanoUsd: bigint | null, afterNanoUsd: bigint | null): string | null {
  return beforeNanoUsd === null || afterNanoUsd === null ? null : usd(beforeNanoUsd - afterNanoUsd);
}

function gateBlock(observer: PracticeGateObserver, gate: PracticeGateName,
  remaining?: Readonly<{ before: import("@debateai/providers").PreviewGateRemaining | null; after: import("@debateai/providers").PreviewGateRemaining | null }>): GateBlock {
  const view = (value: import("@debateai/providers").PreviewGateRemaining | null | undefined) => value === null || value === undefined ? null
    : Object.freeze({ state: value.state, windowOpen: value.windowOpen, remainingUsd: usd(value.remainingNanoUsd), remainingCalls: value.remainingCalls });
  const before = remaining?.before ?? null;
  const after = remaining?.after ?? null;
  return Object.freeze({
    observed: observer.summary(gate),
    wireLatencyMs: latencySummary(observer.events.filter((event) => event.gate === gate && event.outcome !== "STOPPED").map((event) => event.latencyMs)),
    remainingBefore: view(before),
    remainingAfter: view(after),
    spentUsdByRemaining: spentUsdByRemaining(before?.remainingNanoUsd ?? null, after?.remainingNanoUsd ?? null)
  });
}

export function p90ByModel(rows: readonly Readonly<{ model: string; latencies: readonly number[] }>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const model of new Set(rows.map((row) => row.model))) {
    const all = rows.filter((row) => row.model === model).flatMap((row) => [...row.latencies]);
    const p90 = latencySummary(all).p90;
    if (p90 !== null) out[model] = p90;
  }
  return out;
}

export function gateHalted(observer: PracticeGateObserver, after: Readonly<Record<PracticeGateName, unknown>> | null): boolean {
  const refused = GATES.some((gate) => observer.summary(gate).gateRefused > 0 || observer.summary(gate).vendorError > 0);
  const notActive = after === null ? false : GATES.some((gate) => {
    const value = after[gate] as { state?: string } | null;
    return value !== null && value !== undefined && value.state !== "active";
  });
  return refused || notActive;
}

/** The brake stopped a gate for a refusal, a vendor error or an unreadable answer (not the operator, not its own pauses). */
export function gateStopped(observer: PracticeGateObserver): boolean {
  return GATES.some((gate) => {
    const stop = observer.stopped(gate);
    return stop !== null && !/^OPERATOR_/u.test(stop.reason) && !practiceStopIsPause(stop);
  });
}

/** The gates the practice paused itself for connection failures in a row, as `gate:reason`. */
export function gatePauses(observer: PracticeGateObserver): readonly string[] {
  return GATES.flatMap((gate) => {
    const stop = observer.stopped(gate);
    return practiceStopIsPause(stop) ? [`${gate}:${stop!.reason}`] : [];
  });
}

export type PracticeReport = Readonly<Record<string, unknown> & { verdict: PracticeVerdictResult["verdict"]; exitCode: number; reasons: readonly string[] }>;

/**
 * Owner ruling 2026-10-12 ("Fixed slips = warning"): per AI, its answered calls, its slips (first reply refused by its
 * check), those the same call's later try fixed, those never fixed, whether its slip rate is over the rule
 * (`practiceSlipRateExceeded`), and, as information only, the tolerant repairs its accepted replies needed, by code.
 * Patch follow-up (owner design, 2026-10-12), information only: the fixed ones split by how they were fixed
 * (`PracticeRepairKinds`: by the short patch follow-up, by the full re-ask, otherwise).
 */
export type PracticeSlipBlock = PracticeModelCalls & PracticeRepairKinds
  & Readonly<{ slipRateExceeded: boolean; jsonRepairs: Readonly<Record<string, number>> }>;

const NO_REPAIRS: PracticeRepairKinds = Object.freeze({ repairedByPatch: 0, repairedByFullAsk: 0, repairedOtherwise: 0 });

function slipBlocks(calls: Readonly<Record<string, PracticeModelCalls>>, repairs: readonly Readonly<{ model: string; repair: string }>[],
  kinds: Readonly<Record<string, PracticeRepairKinds>>): Readonly<Record<string, PracticeSlipBlock>> {
  const models = [...new Set([...Object.keys(calls), ...repairs.map((entry) => entry.model)])].sort();
  return Object.freeze(Object.fromEntries(models.map((model) => {
    const mine = calls[model] ?? { answered: 0, slips: 0, repaired: 0, unrecovered: 0 };
    const jsonRepairs: Record<string, number> = {};
    for (const entry of repairs) if (entry.model === model) jsonRepairs[entry.repair] = (jsonRepairs[entry.repair] ?? 0) + 1;
    return [model, Object.freeze({ ...mine, ...(kinds[model] ?? NO_REPAIRS), slipRateExceeded: practiceSlipRateExceeded(mine),
      jsonRepairs: Object.freeze(jsonRepairs) })];
  })));
}

/** The repaired calls of every AI by how they were fixed, added up (the report's totals). */
function repairTotals(kinds: Readonly<Record<string, PracticeRepairKinds>>): Readonly<{
  formatRepairedByPatch: number; formatRepairedByFullAsk: number; formatRepairedOtherwise: number;
}> {
  const all = Object.values(kinds);
  return Object.freeze({
    formatRepairedByPatch: all.reduce((sum, mine) => sum + mine.repairedByPatch, 0),
    formatRepairedByFullAsk: all.reduce((sum, mine) => sum + mine.repairedByFullAsk, 0),
    formatRepairedOtherwise: all.reduce((sum, mine) => sum + mine.repairedOtherwise, 0)
  });
}

/**
 * Per AI, its prompt cache as the vendors reported it (information only), from the gates' answers the observer saw:
 * the calls the vendor answered, their input tokens (as the engine counts them, the cached part included), the part
 * read from the vendor's cache, the calls whose answer reported a cached count at all, and the cached share of the
 * input (null with no input tokens).
 */
export type PracticeCacheBlock = Readonly<{
  calls: number; inputTokens: number; cachedInputTokens: number; callsReportingCache: number; cachedShare: number | null;
}>;

export function cacheByModel(observer: PracticeGateObserver): Readonly<Record<string, PracticeCacheBlock>> {
  const out: Record<string, { calls: number; inputTokens: number; cachedInputTokens: number; callsReportingCache: number }> = {};
  for (const event of observer.events) {
    if (event.outcome !== "VENDOR_OK") continue;
    const mine = out[event.model] ??= { calls: 0, inputTokens: 0, cachedInputTokens: 0, callsReportingCache: 0 };
    mine.calls += 1;
    mine.inputTokens += event.inputTokens ?? 0;
    if (event.cachedInputTokens !== undefined) {
      mine.cachedInputTokens += event.cachedInputTokens;
      mine.callsReportingCache += 1;
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).map(([model, mine]) =>
    [model, Object.freeze({ ...mine,
      cachedShare: mine.inputTokens === 0 ? null : Math.round((mine.cachedInputTokens / mine.inputTokens) * 1_000) / 1_000 })])));
}

/**
 * Spec 2026-10-12 §4.8: one model's one level run, as the levels table shows it. `jobs` counts every job of the run,
 * `answered` those not skipped; `firstTry` the PARSED ones, `repaired` the REPAIRED ones (fixed by the same call's
 * later try); of the rest, `formatFailed` those whose reply had the wrong format or content for good (PARSE_FAILED,
 * SCHEMA_FAILED, UNPARSED, POST_CHECK_FAILED) and `callFailed` those whose call itself failed (CALL_FAILED,
 * UNBILLED_REFUSED, VENDOR_ERROR_UNBILLED), so a level's format trouble is not mixed with a vendor's bad hour (final
 * review fix 3); `cutOff` the jobs with a reply stopped at max_tokens. Thinking,
 * time and cost are over the answered jobs (medians and p90 by nearest rank; null with nothing to measure).
 * `slipsOverBar`: the run's own slips over the practice rule (slips > max(1, floor(answered calls / 10))).
 */
export type PracticeLevelRunBlock = Readonly<{
  jobs: number; answered: number; firstTry: number; repaired: number; formatFailed: number; callFailed: number; cutOff: number;
  reasoningMedian: number | null; reasoningTotal: number | null; latencyMedianMs: number | null; latencyP90Ms: number | null;
  costPerJobUsd: string | null; costTotalUsd: string; slipsOverBar: boolean;
}>;

/** A job's reply in the wrong format or content for good, and a job whose call itself failed (final review fix 3). */
const LEVEL_FORMAT_FAILED: ReadonlySet<string> = new Set(["PARSE_FAILED", "SCHEMA_FAILED", "UNPARSED", "POST_CHECK_FAILED"]);
const LEVEL_CALL_FAILED: ReadonlySet<string> = new Set(["CALL_FAILED", "UNBILLED_REFUSED", "VENDOR_ERROR_UNBILLED"]);

/** Spec 2026-10-12 §4.8: model -> run -> its block, runs in the order they first appear (the plan's order); null without level runs. */
export function levelsBlock(samples: readonly PracticeSample[]): Readonly<Record<string, Readonly<Record<string, PracticeLevelRunBlock>>>> | null {
  const levelled = samples.filter((sample) => sample.levelRun !== undefined);
  if (levelled.length === 0) return null;
  const out: Record<string, Record<string, PracticeLevelRunBlock>> = {};
  for (const model of new Set(levelled.map((sample) => sample.model))) {
    const mine = levelled.filter((sample) => sample.model === model);
    out[model] = {};
    for (const run of new Set(mine.map((sample) => sample.levelRun!))) {
      const jobs = mine.filter((sample) => sample.levelRun === run);
      const answered = jobs.filter((sample) => sample.status !== "SKIPPED_GATE_STOPPED" && sample.status !== "SKIPPED_MODEL_BUSY");
      const thinking = answered.flatMap((sample) => typeof sample.reasoningTokens === "number" ? [sample.reasoningTokens] : []);
      const latencies = answered.map((sample) => sample.latencyMs);
      const cost = answered.reduce((sum, sample) => sum + BigInt(sample.costNanoUsd ?? "0"), 0n);
      const calls = practiceModelCalls(answered.flatMap((sample) => [...new Set(sample.attempts.map((attempt) => attempt.callSiteKey))]
        .map((key) => ({ model, tries: sample.attempts.filter((attempt) => attempt.callSiteKey === key) }))))[model];
      const firstTry = answered.filter((sample) => sample.status === "PARSED").length;
      const repaired = answered.filter((sample) => sample.status === "REPAIRED").length;
      out[model][run] = Object.freeze({
        jobs: jobs.length, answered: answered.length, firstTry, repaired,
        formatFailed: answered.filter((sample) => LEVEL_FORMAT_FAILED.has(sample.status)).length,
        callFailed: answered.filter((sample) => LEVEL_CALL_FAILED.has(sample.status)).length,
        cutOff: jobs.filter((sample) => sample.cutOff === true).length,
        reasoningMedian: percentile(thinking, 50), reasoningTotal: thinking.length === 0 ? null : thinking.reduce((sum, value) => sum + value, 0),
        latencyMedianMs: percentile(latencies, 50), latencyP90Ms: percentile(latencies, 90),
        costPerJobUsd: answered.length === 0 ? null : usd(cost / BigInt(answered.length)), costTotalUsd: usd(cost),
        slipsOverBar: calls === undefined ? false : practiceSlipRateExceeded(calls)
      });
    }
    Object.freeze(out[model]);
  }
  return Object.freeze(out);
}

/**
 * Spec 2026-10-12 §6 (the noise band): for a model with a level run twice (`<level>#1` and `<level>#2`, the first such
 * level), the gaps between the two runs, as one line under its rows; null when it has none.
 */
function chanceBandLine(model: string, runs: Readonly<Record<string, PracticeLevelRunBlock>>): string | null {
  const level = Object.keys(runs).find((run) => run.endsWith("#1") && Object.hasOwn(runs, run.replace(/#1$/u, "#2")));
  if (level === undefined) return null;
  const [one, two] = [runs[level]!, runs[level.replace(/#1$/u, "#2")]!];
  const gap = (a: number | null, b: number | null, show: (value: number) => string) => a === null || b === null ? "-" : show(Math.abs(a - b));
  const nano = (value: string | null) => value === null ? null : Number(value.replace(".", ""));
  return `${model} chance band (${level} vs ${level.replace(/#1$/u, "#2")}): first try ±${String(Math.abs(one.firstTry - two.firstTry))}, `
    + `thinking median ±${gap(one.reasoningMedian, two.reasoningMedian, String)}, `
    + `time median ±${gap(one.latencyMedianMs, two.latencyMedianMs, (value) => `${(value / 1_000).toFixed(1)} s`)}, `
    + `cost per job ±${gap(nano(one.costPerJobUsd), nano(two.costPerJobUsd), (value) => `$${usd(BigInt(value))}`)}`;
}

export function formatsReport(input: Readonly<{
  result: PracticeFormatsResult;
  observer: PracticeGateObserver;
  remaining: Readonly<Record<PracticeGateName, Readonly<{ before: import("@debateai/providers").PreviewGateRemaining | null; after: import("@debateai/providers").PreviewGateRemaining | null }>>>;
  startedAt: Date;
  finishedAt: Date;
  /** The operator interrupted once: the calls in flight finished, the rest were skipped (NOT_PROVEN). */
  interrupted: boolean;
  /** The practice did not reach its end (a second interrupt, a crash midway): the code (ABORTED). */
  aborted?: string | null;
}>): PracticeReport {
  const samples = input.result.samples;
  const formatStatuses = new Set(["PARSE_FAILED", "SCHEMA_FAILED", "UNPARSED", "POST_CHECK_FAILED"]);
  // Owner ruling 2026-10-12 ("Fixed slips = warning"): each job's calls by call-site key, each with all its tries.
  const callsOf = (sample: PracticeSample) => [...new Set(sample.attempts.map((attempt) => attempt.callSiteKey))]
    .map((key) => Object.freeze({ model: sample.model, tries: sample.attempts.filter((attempt) => attempt.callSiteKey === key) }));
  const calls = samples.flatMap(callsOf);
  const callsByModel = practiceModelCalls(calls);
  const repairKinds = practiceRepairKindsByModel(calls);
  // A failure: a call that never got an accepted reply after a refused one (at least one for a job whose status is still
  // a format status, as every such job of a log written before the REPAIRED status is), or a reply the runner's own
  // reading refused after the check.
  const formatFailures = samples.reduce((sum, sample) => sum + Math.max(
    callsOf(sample).filter((call) => practiceCallFacts(call.tries).unrecovered).length,
    sample.status === "PARSE_FAILED" || sample.status === "SCHEMA_FAILED" || sample.status === "UNPARSED" ? 1 : 0)
    + (sample.status === "POST_CHECK_FAILED" ? 1 : 0), 0);
  // Owner ruling 2026-10-12 ("Keep GLM, it sits out"): what each busy model answered (jobs with an accepted reply) and skipped.
  const busyRuns: Record<string, PracticeBusyModelRun> = {};
  for (const model of input.result.busyModels) {
    const mine = samples.filter((sample) => sample.model === model);
    const answered = mine.filter((sample) => sample.attempts.some((attempt) => attempt.outcome === "OK")).length;
    busyRuns[model] = Object.freeze({ answered, skipped: mine.length - answered });
  }
  const jsonRepairs = samples.flatMap((sample) => sample.attempts.flatMap((attempt) =>
    typeof attempt.jsonRepair === "string" ? [{ model: sample.model, repair: attempt.jsonRepair }] : []));
  // A vendor error that was not billed and is not "busy" (PROVIDER_ERROR_UNBILLED, e.g. Anthropic's 400) is a failed call.
  const failedCalls = samples.filter((sample) => sample.status === "CALL_FAILED" || sample.status === "VENDOR_ERROR_UNBILLED").length;
  const exercised = new Set(samples.filter((sample) => sample.status !== "SKIPPED_GATE_STOPPED" && sample.status !== "UNBILLED_REFUSED"
    && sample.status !== "SKIPPED_MODEL_BUSY").map((sample) => sample.model));
  const verdict = practiceVerdict({
    harnessError: null,
    completed: true,
    interrupted: input.interrupted,
    aborted: input.aborted ?? null,
    servedAnswer: null,
    storyOutcome: null,
    formatFailures,
    callsByModel,
    busyRuns,
    failedCalls,
    gateHalted: gateHalted(input.observer, { deepinfra: input.remaining.deepinfra.after, anthropic: input.remaining.anthropic.after }),
    gateStopped: gateStopped(input.observer),
    gatePauses: gatePauses(input.observer),
    notExercisedModels: input.result.models.filter((model) => !exercised.has(model)),
    busyModels: input.result.busyModels,
    unbilledRefusals: GATES.reduce((sum, gate) => sum + input.observer.summary(gate).unbilled, 0),
    p90ByModel: p90ByModel(samples.filter((sample) => sample.status !== "SKIPPED_GATE_STOPPED" && sample.status !== "SKIPPED_MODEL_BUSY")
      .map((sample) => ({ model: sample.model, latencies: sample.attempts.map((attempt) => attempt.latencyMs) })))
  });
  const byModelAndLane = input.result.models.flatMap((model) => input.result.lanes.map((lane) => {
    const mine = samples.filter((sample) => sample.model === model && sample.lane === lane);
    const statuses: Record<string, number> = {};
    for (const sample of mine) statuses[sample.status] = (statuses[sample.status] ?? 0) + 1;
    const cost = mine.reduce((sum, sample) => sum + BigInt(sample.costNanoUsd ?? "0"), 0n);
    return Object.freeze({ model, lane, samples: mine.length, statuses, latencyMs: latencySummary(mine.map((sample) => sample.latencyMs)),
      inputTokens: mine.reduce((sum, sample) => sum + (sample.inputTokens ?? 0), 0),
      cachedInputTokens: mine.reduce((sum, sample) => sum + (sample.cachedInputTokens ?? 0), 0),
      outputTokens: mine.reduce((sum, sample) => sum + (sample.outputTokens ?? 0), 0),
      costUsd: usd(cost), unbilledRefusals: mine.reduce((sum, sample) => sum + sample.unbilledRefusals, 0) });
  }));
  const levels = levelsBlock(samples);
  return Object.freeze({
    schema: PRACTICE_REPORT_SCHEMA, mode: "formats", ...verdict,
    startedAt: input.startedAt.toISOString(), finishedAt: input.finishedAt.toISOString(),
    wallSeconds: Math.round((input.finishedAt.getTime() - input.startedAt.getTime()) / 1000),
    models: input.result.models, lanes: input.result.lanes, busyModels: input.result.busyModels,
    slipsByModel: slipBlocks(callsByModel, jsonRepairs, repairKinds),
    cacheByModel: cacheByModel(input.observer),
    byModelAndLane,
    // Spec 2026-10-12 §4.8: only in a --levels run.
    ...(levels === null ? {} : { levels }),
    gates: Object.fromEntries(GATES.map((gate) => [gate, gateBlock(input.observer, gate, input.remaining[gate])])),
    totals: Object.freeze({
      samples: samples.length,
      costUsd: usd(samples.reduce((sum, sample) => sum + BigInt(sample.costNanoUsd ?? "0"), 0n)),
      formatFailures, failedCalls,
      formatRepaired: Object.values(callsByModel).reduce((sum, mine) => sum + mine.repaired, 0),
      ...repairTotals(repairKinds),
      jsonRepairs: jsonRepairs.length
    }),
    // Length guidance (LG-D): the story jobs' words per field and unreadable replies (absent without a story job).
    ...(practiceStoryLengthFromSamples(samples) ?? {}),
    failures: samples.filter((sample) => formatStatuses.has(sample.status) || sample.status === "CALL_FAILED"
      || sample.status === "VENDOR_ERROR_UNBILLED"
      || sample.attempts.some((attempt) => attempt.parseStatus !== null && attempt.parseStatus !== "PARSED"))
      .map((sample: PracticeSample) => sample)
  });
}

export function debateReport(input: Readonly<{
  result: PracticeDebateResult;
  observer: PracticeGateObserver;
  startedAt: Date;
  finishedAt: Date;
}>): PracticeReport {
  const r = input.result;
  // The members the runner made sit out for being busy during the debate (their last call ended in the vendor's refusal),
  // beside those that sat out at the ask: not exercised to the end, so NOT_PROVEN, never FAIL on their own.
  const satOutAtAsk = new Set(r.admission.satOut.map((entry) => entry.model));
  const busyDuringRun = input.observer.modelsEndingBusy().filter((model) => !satOutAtAsk.has(model));
  // Owner ruling 2026-10-12 ("Keep GLM, it sits out"): a member that sat out after at least one accepted answer is a warning.
  const busyRuns = Object.fromEntries(busyDuringRun.map((model) => [model, Object.freeze({
    answered: r.answersByModel?.[model]?.answered ?? 0, skipped: r.answersByModel?.[model]?.unanswered ?? 0 })]));
  const verdict = practiceVerdict({
    harnessError: null,
    completed: r.admission.admitted && r.run.workItemOutcome === "COMPLETED",
    servedAnswer: r.run.answer?.served ?? false,
    storyOutcome: r.run.story?.outcome ?? "MISSING",
    formatFailures: r.formatFailures,
    callsByModel: r.callsByModel ?? {},
    busyRuns,
    failedCalls: r.failedCalls,
    gateHalted: gateHalted(input.observer, { deepinfra: r.remaining.deepinfra.after, anthropic: r.remaining.anthropic.after }),
    gateStopped: gateStopped(input.observer),
    gatePauses: gatePauses(input.observer),
    notExercisedModels: r.admission.satOut.map((entry) => entry.model),
    busyModels: busyDuringRun,
    shapeNotExercised: r.shape === undefined || r.shape.notExercised === null ? [] : [r.shape.notExercised],
    pinsNotHeld: r.writerPins === undefined ? [] : practicePinsNotHeld(r.writerPins),
    unbilledRefusals: GATES.reduce((sum, gate) => sum + input.observer.summary(gate).unbilled, 0),
    p90ByModel: Object.fromEntries(Object.entries(r.byModelAndSite.reduce<Record<string, number>>((acc, row) => {
      if (row.latencyMs.p90 !== null) acc[row.model] = Math.max(acc[row.model] ?? 0, row.latencyMs.p90);
      return acc;
    }, {})))
  });
  const extra = r.admission.admitted ? [] : [`ADMISSION_REFUSED:${r.admission.refusalCode ?? "UNKNOWN"}`];
  return Object.freeze({
    schema: PRACTICE_REPORT_SCHEMA, mode: "debate", ...verdict, reasons: Object.freeze([...extra, ...verdict.reasons]),
    startedAt: input.startedAt.toISOString(), finishedAt: input.finishedAt.toISOString(),
    wallSeconds: Math.round((input.finishedAt.getTime() - input.startedAt.getTime()) / 1000),
    time: Object.freeze({ admissionSeconds: Math.round(r.seconds.admission), debateSeconds: Math.round(r.seconds.debate) }),
    register: r.register,
    // Hosted mode only: the room or the daily guard, billing (register / practice), the ceilings, the settings set aside.
    ...(r.deployment === undefined ? {} : { deployment: r.deployment }),
    // Engine row (R1d): the engine the run was admitted with, from its own receipt (absent when it could not be read).
    ask: Object.freeze({ questionId: r.questionId, depth: r.depth, planTier: "premium",
      ...(r.storyEngine === undefined ? {} : { engine: Object.freeze({ engine: r.storyEngine.engine }) }) }),
    // Debate shape: only when the debate ran with a debate-shape row; absent otherwise, so today's report keeps its keys.
    ...(r.shape === undefined ? {} : { shape: r.shape }),
    // INTERFACE §15.4 (R3): the answer check and the map's fallbacks, top-level for the proof's jq lines.
    ...(r.shape === undefined ? {} : { mapFallbacks: r.shape.mapFallbacks, ...(r.shape.answerCheck === null ? {} : { answerCheck: r.shape.answerCheck }) }),
    // Length guidance: only when the debate ran with a length row; absent otherwise (today's keys).
    ...(r.length === undefined ? {} : { length: r.length }),
    // Question language: only when the debate ran with a debate-shape row; absent otherwise (today's keys).
    ...(r.language === undefined ? {} : { language: r.language }),
    // R2 (E12, E13): the "cannot assess" reviews and the investigations; absent only when the debate was never admitted.
    ...(r.investigations === undefined ? {} : { investigations: r.investigations }),
    // Engine redesign R2 (B11): the four members, only when the debate ran on engine 2; absent otherwise (today's keys).
    ...(r.judges === undefined ? {} : r.judges),
    admission: r.admission,
    busyDuringRun,
    slipsByModel: slipBlocks(r.callsByModel ?? {}, r.jsonRepairs ?? [], r.repairKindsByModel ?? {}),
    cacheByModel: cacheByModel(input.observer),
    run: r.run,
    probes: r.probes,
    // Parallel AI calls: the setting, each gate's slots at the start, how many calls really went at once, the waits.
    ...(r.parallel === undefined ? {} : { parallel: r.parallel }),
    byModelAndSite: r.byModelAndSite,
    // Pinned final writers (R1d): absent without a pin, so today's report keeps its keys.
    ...(r.writerPins === undefined ? {} : { writerPins: r.writerPins }),
    // Length guidance (LG-D): the story's words per field and its unreadable replies (absent when they could not be read).
    ...(r.storyLength === undefined ? {} : {
      storyLengthByField: r.storyLength.storyLengthByField, storyJsonBreaks: r.storyLength.storyJsonBreaks
    }),
    // Engine row (R1d): the story's rounds, backups and outcomes (absent when they could not be read).
    ...(r.storyEngine === undefined ? {} : {
      storyRounds: r.storyEngine.storyRounds, storyBackups: r.storyEngine.storyBackups, storyReadyRate: r.storyEngine.storyReadyRate
    }),
    gates: Object.fromEntries(GATES.map((gate) => [gate, gateBlock(input.observer, gate, r.remaining[gate])])),
    totals: Object.freeze({
      calls: r.byModelAndSite.reduce((sum, row) => sum + row.calls, 0),
      costUsd: usd(r.byModelAndSite.reduce((sum, row) => sum + BigInt(row.costNanoUsd), 0n)),
      formatFailures: r.formatFailures, failedCalls: r.failedCalls, refusedCalls: r.refusedCalls,
      formatRepaired: Object.values(r.callsByModel ?? {}).reduce((sum, mine) => sum + mine.repaired, 0),
      ...repairTotals(r.repairKindsByModel ?? {}),
      jsonRepairs: (r.jsonRepairs ?? []).length
    }),
    failures: r.failures,
    // LG-A (L34): repairs by kind (counts) and the replies code could not repair (each with a short sample, json only).
    repairsByKind: r.repairsByKind ?? [],
    unrepaired: r.unrepaired ?? [],
    // The stray-letter rule (PR #194): every admitted debate's language refusals, so an empty list is a measured none.
    ...(r.languageFollowUps === undefined ? {} : { languageFollowUps: r.languageFollowUps }),
    // Refused-repair salvage: the structure rescues (counts only); absent when there was none (today's keys).
    ...(practiceStructureRescuesShown(r.structureRescues) ? { structureRescues: r.structureRescues } : {}),
    // Length guidance L27 (LG-B): tokens and words per AI and step (information only).
    tokensByModelAndStep: r.tokensByModelAndStep ?? [],
    lengthByModelAndStep: r.lengthByModelAndStep ?? []
  });
}

/** A practice that did not reach its end and has no samples log (debate mode): the verdict ABORTED and the gates' counts. */
export function abortedReport(mode: string, code: string, startedAt: Date, observer: PracticeGateObserver | null): PracticeReport {
  const verdict = practiceVerdict({ harnessError: null, aborted: code, completed: false, servedAnswer: null, storyOutcome: null,
    formatFailures: 0, failedCalls: 0, gateHalted: false, gateStopped: observer === null ? false : gateStopped(observer),
    gatePauses: observer === null ? [] : gatePauses(observer), notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {} });
  return Object.freeze({ schema: PRACTICE_REPORT_SCHEMA, mode, ...verdict, startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    ...(observer === null ? {} : { gates: Object.fromEntries(GATES.map((gate) => [gate, gateBlock(observer, gate)])) }) });
}

export function harnessErrorReport(mode: string, code: string, startedAt: Date, observer: PracticeGateObserver | null): PracticeReport {
  const verdict = practiceVerdict({ harnessError: code, completed: false, servedAnswer: null, storyOutcome: null, formatFailures: 0,
    failedCalls: 0, gateHalted: false, gateStopped: false, notExercisedModels: [], unbilledRefusals: 0, p90ByModel: {} });
  return Object.freeze({ schema: PRACTICE_REPORT_SCHEMA, mode, ...verdict, startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    ...(observer === null ? {} : { gates: Object.fromEntries(GATES.map((gate) => [gate, observer.summary(gate)])) }) });
}

/** The short, content-free summary a person reads first. No reply text, ever. */
export function reportMarkdown(report: PracticeReport): string {
  // An openings --dry run says so in its title: its costs are the price list's estimate for the script's made-up tokens.
  const dry = report.dry === true ? ", dry: scripted answers, nothing spent" : "";
  const lines = [`# Preview practice (${String(report.mode)}${dry}): ${report.verdict}`, "",
    `Exit code ${String(report.exitCode)}. Started ${String(report.startedAt)}, finished ${String(report.finishedAt)}.`, ""];
  if (report.reasons.length > 0) {
    lines.push("Why:", "", ...report.reasons.map((reason) => `- ${reason}`), "");
  }
  const deployment = report.deployment as PracticeDebateResult["deployment"] | undefined;
  if (deployment !== undefined) {
    const dollars = (micros: number | null | undefined) => micros === null || micros === undefined ? "none" : `$${(micros / 1_000_000).toFixed(2)}`;
    lines.push("Hosted mode:", "",
      `- the ask went through ${deployment.room ? "the room (the site's day, the waiting line)" : "the daily guard"}`,
      `- billing: ${deployment.billingInRegister} in the register, kept off in the practice (no plan wall, no charge scope)`,
      `- ceilings: per debate ${dollars(deployment.ceilings?.perRunCeilingMicros)}, per day ${dollars(deployment.ceilings?.dailyCeilingMicros)}`
        + ` (this practice's own spend only), per story ${dollars(deployment.ceilings?.perStoryCeilingMicros)}`,
      `- server-only settings set aside unread: ${deployment.setAsideSettings.length === 0 ? "none" : deployment.setAsideSettings.join(", ")}`, "");
  }
  const totals = report.totals as Record<string, unknown> | undefined;
  if (totals !== undefined) lines.push("Totals:", "", ...Object.entries(totals).map(([key, value]) => `- ${key}: ${String(value)}`), "");
  const shape = typeof report.shape === "object" && report.shape !== null ? report.shape as PracticeShapeBlock : undefined;
  if (shape !== undefined) lines.push(...practiceShapeLines(shape));
  // Length guidance: where the numbers came from and what the run was admitted with (codes and numbers only).
  const lengthBlock = report.mode === "debate" && typeof report.length === "object" && report.length !== null
    ? report.length as PracticeLengthBlock : undefined;
  if (lengthBlock !== undefined) lines.push(...practiceLengthBlockLines(lengthBlock));
  const language = report.mode === "debate" && typeof report.language === "object" && report.language !== null
    ? report.language as PracticeDebateLanguageBlock : undefined;
  if (language !== undefined) lines.push(...practiceDebateLanguageLines(language));
  const investigations = report.mode === "debate" && typeof report.investigations === "object" && report.investigations !== null
    ? report.investigations as PracticeInvestigationBlock : undefined;
  if (investigations !== undefined) lines.push(...practiceInvestigationLines(investigations, usd));
  // Engine redesign R2 (B11): the comparing judges' block, only when the report has it (engine 2).
  if (report.mode === "debate" && Array.isArray(report.judgeVotes)) {
    lines.push(...practiceJudgesLines({
      judgeVotes: report.judgeVotes as PracticeJudgesBlocks["judgeVotes"],
      labels: (report.labels ?? null) as PracticeJudgesBlocks["labels"],
      judgesSeconds: typeof report.judgesSeconds === "number" ? report.judgesSeconds : null,
      conditionalWinner: typeof report.conditionalWinner === "boolean" ? report.conditionalWinner : null
    }));
  }
  if (report.mode === "language" && Array.isArray(report.cases)) {
    lines.push(...practiceLanguageLines(report.cases as readonly PracticeLanguageCaseRecord[],
      Array.isArray(report.notRun) ? report.notRun as readonly PracticeLanguageNotRun[] : []));
  }
  // R2b (D3): the judges' order table.
  if (report.mode === "judge-order") lines.push(...practiceJudgeOrderLines(report));
  const gates = report.gates as Record<string, GateBlock> | undefined;
  if (gates !== undefined) {
    lines.push("Gates:", "");
    for (const [gate, block] of Object.entries(gates)) {
      const observed = (block.observed ?? block) as PracticeGateSummary;
      lines.push(`- ${gate}: ${String(observed.calls)} calls, ${String(observed.unbilled)} refused, not billed (vendor busy `
        + `${String(observed.vendorRefused)}, cooling off ${String(observed.modelCooling)}, `
        + `not served ${String(observed.notServed ?? 0)}, `
        + `not reached ${String(observed.notReached)}, `
        + `vendor error not billed ${String(observed.vendorErrorUnbilled ?? 0)}), `
        + (observed.bookedMax ? `${String(observed.bookedMax)} booked at their maximum (sent, then timed out or cut off; `
          + "the gate charged each its full reservation and kept going), " : "")
        + `longest not-reached run ${String(observed.longestNotReachedRun)} (streak at start `
        + `${observed.unsentStreakAtStart === null ? "unknown" : String(observed.unsentStreakAtStart)}), `
        + `stopped: ${observed.stop === null ? "no" : observed.stop.reason}`
        + (block.spentUsdByRemaining === undefined || block.spentUsdByRemaining === null ? "" : `, spent by the gate's count $${block.spentUsdByRemaining}`));
    }
    lines.push("");
  }
  const busy = report.busyByModel as Record<string, { waits: number; totalWaitMs: number; recovered: boolean; gaveUp: boolean }> | undefined;
  if (busy !== undefined && Object.keys(busy).length > 0) {
    lines.push("Busy models (refused as too busy, not billed, then waited and tried again):", "");
    for (const [model, entry] of Object.entries(busy)) {
      lines.push(`- ${model}: ${String(entry.waits)} wait(s), ${String(Math.round(entry.totalWaitMs / 1_000))} s in all, `
        + `recovered: ${entry.recovered ? "yes" : "no"}${entry.gaveUp ? " (its wait budget ran out; its remaining jobs were skipped)" : ""}`);
    }
    lines.push("");
  }
  const slips = report.slipsByModel as Readonly<Record<string, PracticeSlipBlock>> | undefined;
  if (slips !== undefined && Object.keys(slips).length > 0) {
    lines.push("Format slips per AI (a slip the same call's later try fixed is a warning, however it was fixed; more than 1 slip "
      + "in 10 answered calls, and more than one slip, fails; how the slips were fixed and the tolerant repairs are information only):", "");
    for (const [model, entry] of Object.entries(slips)) {
      lines.push(`- ${model}: ${String(entry.answered)} answered calls, ${String(entry.slips)} slipped on the first try, `
        + `${String(entry.repaired)} fixed by the same call (by patch ${String(entry.repairedByPatch ?? 0)}, `
        + `by full re-ask ${String(entry.repairedByFullAsk ?? 0)}, otherwise ${String(entry.repairedOtherwise ?? 0)}), `
        + `${String(entry.unrecovered)} never fixed`
        + `${entry.slipRateExceeded ? " (over the slip rule)" : ""}; tolerant repairs ${JSON.stringify(entry.jsonRepairs)}`);
    }
    lines.push("");
  }
  const repairs = report.repairsByKind as readonly PracticeRepairRow[] | undefined;
  if (repairs !== undefined && repairs.length > 0) {
    lines.push("Repairs made in code (LG-A; information only, never a slip):", "", "| model | step | repair | count |", "|---|---|---|---|");
    for (const row of repairs) lines.push(`| ${row.model} | ${row.step} | ${row.kind} | ${String(row.count)} |`);
    lines.push("");
  }
  const rescues = report.structureRescues as PracticeStructureRescues | undefined;
  if (practiceStructureRescuesShown(rescues)) {
    lines.push(`Structure rescues: in code ${String(rescues.inCode)}, by short follow-up ${String(rescues.byPatch)}, `
      + `by full re-ask ${String(rescues.byFullAsk)}`, "");
  }
  const unrepaired = report.unrepaired as readonly PracticeUnrepairedRow[] | undefined;
  if (unrepaired !== undefined && unrepaired.length > 0) {
    lines.push("Replies code could not repair (codes only; the samples are in report.json):", "");
    for (const row of unrepaired) {
      lines.push(`- ${row.model} · ${row.step} · ${row.failureClass} · ${row.code}@${row.path} · next: ${row.followUp}`
        + `${row.recovered ? " · recovered" : " · not recovered"}`);
    }
    lines.push("");
  }
  const languageFollowUps = report.languageFollowUps as readonly PracticeLanguageFollowUpRow[] | undefined;
  if (languageFollowUps !== undefined && languageFollowUps.length === 0) {
    lines.push("Reply-language refusals: none (no reply was refused for its language or script).", "");
  } else if (languageFollowUps !== undefined) {
    lines.push("Reply-language refusals (text in another language or script, such as Chinese letters in an English reply; "
      + "information only):", "", "| model | step | code | refused | short follow-ups | follow-ups accepted |", "|---|---|---|---|---|---|");
    for (const row of languageFollowUps) {
      lines.push(`| ${row.model} | ${row.step} | ${row.code} | ${String(row.refused)} | ${String(row.followUps)} | ${String(row.accepted)} |`);
    }
    lines.push("");
  }
  if (report.mode === "debate" && typeof report.writerPins === "object" && report.writerPins !== null) {
    lines.push(...practiceWriterPinsLines(report.writerPins as PracticeWriterPinsBlock));
  }
  const askEngine = report.mode === "debate" && typeof report.ask === "object" && report.ask !== null
    ? (report.ask as { engine?: { engine: 1 | 2 } }).engine : undefined;
  if (askEngine !== undefined && Array.isArray(report.storyRounds) && Array.isArray(report.storyBackups)
    && typeof report.storyReadyRate === "object" && report.storyReadyRate !== null) {
    lines.push(...practiceStoryEngineLines({ engine: askEngine.engine,
      storyRounds: report.storyRounds as readonly PracticeStoryRoundRow[],
      storyBackups: report.storyBackups as readonly PracticeStoryBackupRow[],
      storyReadyRate: report.storyReadyRate as PracticeStoryReadyRate }));
  }
  if (Array.isArray(report.storyLengthByField) && Array.isArray(report.storyJsonBreaks)) {
    lines.push(...practiceStoryLengthLines({
      storyLengthByField: report.storyLengthByField as readonly PracticeStoryLengthRow[],
      storyJsonBreaks: report.storyJsonBreaks as readonly PracticeStoryJsonBreakRow[]
    }));
  }
  const byArm = report.byArm as readonly Readonly<{ arm: string; questions: number; calls: number; costUsd: string; wallSeconds: number;
    unavailable: number; statuses: Record<string, number>; marks: Record<string, number>; notes: Record<string, number> }>[] | undefined;
  if (byArm !== undefined && byArm.length > 0) {
    lines.push("Openings per arm (counts, cost and time only; T today's opening, A snowball, B blind lists, C angle map):", "",
      // R3 final wave P18 (Task 17a Minor): this table's count is of the questions ATTEMPTED (a refused one included); the
      // wording N table below counts those that RAN, beside the refused ones. Each header says which.
      "| arm | questions attempted | calls | statuses | cost $ | time s | map unavailable | marks | notes |", "|---|---|---|---|---|---|---|---|---|");
    for (const row of byArm) {
      lines.push(`| ${row.arm} | ${String(row.questions)} | ${String(row.calls)} | ${JSON.stringify(row.statuses)} | ${row.costUsd} | `
        + `${String(row.wallSeconds)} | ${String(row.unavailable)} | ${JSON.stringify(row.marks)} | ${JSON.stringify(row.notes)} |`);
    }
    lines.push("");
  }
  // Ruling R3-T17a.4 (N3): each arm that ended on a practice refusal, with the refusal's code (the run reads NOT_PROVEN).
  const armsRefused = report.armsRefused as readonly Readonly<{ arm: string; questionId: string; code: string }>[] | undefined;
  if (armsRefused !== undefined && armsRefused.length > 0) {
    lines.push("Refused arms (each ended on a practice refusal, with no map; the run is NOT_PROVEN):", "",
      ...armsRefused.map((refused) => `- ${refused.arm}, ${refused.questionId}: ${refused.code}`), "");
  }
  // Task 17a (D5): wording N's counts per arm (the answers word for word are in report.json `wording`). A refused arm keeps
  // its row (N2), and each arm's seats per question are shown (N4), so a seat lost in C2 shows in C2N.
  const wordingTotals = report.wordingTotals as readonly Readonly<{ arm: string; questions: number; refused: number; seats: readonly number[];
    checked: number; rejected: number; notAnAnswer: number; addedFact: number; noCost: number; premiseExempt: number;
    assumptions: readonly number[] }>[] | undefined;
  if (wordingTotals !== undefined && wordingTotals.length > 0) {
    lines.push("Wording N (D5; counts only, the debated answers word for word are in report.json `wording`; C2 the sealed wording, C2N wording N):", "",
      "| arm | questions ran | refused | seats | checked | rejected | not an answer | adding a fact | no cost named | premise exempt | assumptions per answer (mean) |",
      "|---|---|---|---|---|---|---|---|---|---|---|");
    for (const row of wordingTotals) {
      const mean = row.assumptions.length === 0 ? "none" : (row.assumptions.reduce((sum, n) => sum + n, 0) / row.assumptions.length).toFixed(1);
      const seats = row.seats.length === 0 ? "none" : row.seats.join(", ");
      lines.push(`| ${row.arm} | ${String(row.questions)} | ${String(row.refused)} | ${seats} | ${String(row.checked)} | ${String(row.rejected)} | `
        + `${String(row.notAnAnswer)} | ${String(row.addedFact)} | ${String(row.noCost)} | ${String(row.premiseExempt)} | ${mean} |`);
    }
    lines.push("");
  }
  // Debate mode only: the formats report's own `parallel` is a yes/no (models at once, practice-samples-log.ts).
  const parallel = typeof report.parallel === "object" && report.parallel !== null ? report.parallel as PracticeParallelBlock : undefined;
  if (parallel !== undefined) lines.push(...practiceParallelLines(parallel));
  const cache = report.cacheByModel as Readonly<Record<string, PracticeCacheBlock>> | undefined;
  if (cache !== undefined && Object.keys(cache).length > 0) {
    lines.push("Prompt cache per AI (as the vendors reported it; information only):", "");
    for (const [model, entry] of Object.entries(cache)) {
      lines.push(`- ${model}: ${String(entry.calls)} answered calls, ${String(entry.inputTokens)} input tokens, `
        + `${String(entry.cachedInputTokens)} read from the cache`
        + (entry.cachedShare === null ? "" : ` (${(entry.cachedShare * 100).toFixed(1)}%)`)
        + (entry.callsReportingCache === entry.calls ? "" : `; ${String(entry.calls - entry.callsReportingCache)} call(s) reported no cache count`));
    }
    lines.push("");
  }
  const tokens = report.tokensByModelAndStep as readonly PracticeTokenRow[] | undefined;
  if (tokens !== undefined) lines.push(...practiceTokenLines(tokens));
  const words = report.lengthByModelAndStep as readonly PracticeLengthRow[] | undefined;
  if (words !== undefined) lines.push(...practiceLengthLines(words));
  const rows = (report.byModelAndSite ?? report.byModelAndLane) as readonly Record<string, unknown>[] | undefined;
  if (rows !== undefined && rows.length > 0) {
    lines.push("| model | step | calls | outcomes / statuses | format | p50 s | p90 s | max s |", "|---|---|---|---|---|---|---|---|");
    for (const row of rows) {
      const latency = row.latencyMs as { p50: number | null; p90: number | null; max: number | null };
      const s = (value: number | null) => value === null ? "-" : (value / 1000).toFixed(1);
      lines.push(`| ${String(row.model)} | ${String(row.site ?? row.lane)} | ${String(row.calls ?? row.samples)} | `
        + `${JSON.stringify(row.outcomes ?? row.statuses)} | ${JSON.stringify(row.parse ?? "")} | ${s(latency.p50)} | ${s(latency.p90)} | ${s(latency.max)} |`);
    }
    lines.push("");
  }
  const levels = report.levels as Readonly<Record<string, Readonly<Record<string, PracticeLevelRunBlock>>>> | undefined;
  if (levels !== undefined) {
    // "answered / jobs" shows the skipped jobs (a busy model's); "over bar" is the run's own slip bar, information only:
    // the verdict's slip rule still pools all of a model's runs (practice-verdict.ts).
    lines.push("Thinking levels (spec 2026-10-12 §4.8; the chance band is the gap between two runs of the same level; "
      + "\"over bar\": this run alone has more than 1 slip in 10 answered calls, for the comparison only, the verdict counts "
      + "all of a model's runs together):", "",
      "| model | run | answered / jobs | first try | repaired | format failed | call failed | cut off | thinking median | "
        + "thinking total | time median / p90 | cost per job | cost total | over bar |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    const bands: string[] = [];
    for (const [model, runs] of Object.entries(levels)) {
      const s = (value: number | null) => value === null ? "-" : (value / 1000).toFixed(1);
      for (const [run, entry] of Object.entries(runs)) {
        lines.push(`| ${model} | ${run} | ${String(entry.answered)}/${String(entry.jobs)} | ${String(entry.firstTry)} | ${String(entry.repaired)} | `
          + `${String(entry.formatFailed)} | ${String(entry.callFailed)} | `
          + `${String(entry.cutOff)} | ${entry.reasoningMedian === null ? "-" : String(entry.reasoningMedian)} | `
          + `${entry.reasoningTotal === null ? "-" : String(entry.reasoningTotal)} | `
          + `${s(entry.latencyMedianMs)} / ${s(entry.latencyP90Ms)} s | ${entry.costPerJobUsd === null ? "-" : `$${entry.costPerJobUsd}`} | `
          + `$${entry.costTotalUsd} | ${entry.slipsOverBar ? "yes" : "no"} |`);
      }
      const band = chanceBandLine(model, runs);
      if (band !== null) bands.push(band);
    }
    lines.push("", ...bands.map((band) => `- ${band}`), ...(bands.length === 0 ? [] : [""]));
  }
  const failures = report.failures as readonly unknown[] | undefined;
  // Openings keep reply text in "failures" only for a call whose format never passed; the formats wording is unchanged.
  // The language mode keeps no "failures" (a planner's failed call is its case's planner status and code); nor does
  // judge-order (a reading that did not come back is its ask's status and code).
  if (report.mode !== "language" && report.mode !== "judge-order") lines.push(report.mode === "openings"
    ? `Wrong-format or failed calls: ${String(failures?.length ?? 0)} (the exact problems are in report.json; `
      + "reply text only for calls whose format never passed)."
    : `Wrong-format replies, fixed by their call or not: ${String(failures?.length ?? 0)} (their text and the exact problems are in report.json, "failures").`, "");
  return lines.join("\n");
}

export function writeReport(directory: string, report: PracticeReport): Readonly<{ json: string; markdown: string }> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const json = join(directory, "report.json");
  const markdown = join(directory, "report.md");
  writeFileSync(json, `${JSON.stringify(report, (_key, value: unknown) => (typeof value === "bigint" ? String(value) : value), 2)}\n`, { mode: 0o600 });
  writeFileSync(markdown, reportMarkdown(report), { mode: 0o600 });
  return Object.freeze({ json, markdown });
}
