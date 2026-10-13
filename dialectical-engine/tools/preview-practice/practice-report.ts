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
import type { PracticeDebateResult } from "./practice-debate.js";
import type { PracticeFormatsResult, PracticeSample } from "./practice-formats.js";
import { practiceStopIsPause, type PracticeGateName, type PracticeGateObserver, type PracticeGateSummary } from "./practice-gate-observer.js";
import {
  latencySummary,
  percentile,
  practiceCallFacts,
  practiceModelCalls,
  practiceRepairKindsByModel,
  practiceSlipRateExceeded,
  practiceVerdict,
  type PracticeBusyModelRun,
  type PracticeModelCalls,
  type PracticeRepairKinds,
  type PracticeVerdictResult
} from "./practice-verdict.js";

export const PRACTICE_REPORT_SCHEMA = "preview-practice-report-v1" as const;
const GATES: readonly PracticeGateName[] = ["deepinfra", "anthropic"];

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

function usd(nano: bigint): string {
  const sign = nano < 0n ? "-" : "";
  const abs = nano < 0n ? -nano : nano;
  return `${sign}${String(abs / 1_000_000_000n)}.${String(abs % 1_000_000_000n).padStart(9, "0")}`;
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
    // Includes any live-site spend in the same window: a check, never the source of the cost figures.
    spentUsdByRemaining: before === null || after === null ? null : usd(before.remainingNanoUsd - after.remainingNanoUsd)
  });
}

function p90ByModel(rows: readonly Readonly<{ model: string; latencies: readonly number[] }>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const model of new Set(rows.map((row) => row.model))) {
    const all = rows.filter((row) => row.model === model).flatMap((row) => [...row.latencies]);
    const p90 = latencySummary(all).p90;
    if (p90 !== null) out[model] = p90;
  }
  return out;
}

function gateHalted(observer: PracticeGateObserver, after: Readonly<Record<PracticeGateName, unknown>> | null): boolean {
  const refused = GATES.some((gate) => observer.summary(gate).gateRefused > 0 || observer.summary(gate).vendorError > 0);
  const notActive = after === null ? false : GATES.some((gate) => {
    const value = after[gate] as { state?: string } | null;
    return value !== null && value !== undefined && value.state !== "active";
  });
  return refused || notActive;
}

/** The brake stopped a gate for a refusal, a vendor error or an unreadable answer (not the operator, not its own pauses). */
function gateStopped(observer: PracticeGateObserver): boolean {
  return GATES.some((gate) => {
    const stop = observer.stopped(gate);
    return stop !== null && !/^OPERATOR_/u.test(stop.reason) && !practiceStopIsPause(stop);
  });
}

/** The gates the practice paused itself for connection failures in a row, as `gate:reason`. */
function gatePauses(observer: PracticeGateObserver): readonly string[] {
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
    ask: Object.freeze({ questionId: r.questionId, depth: r.depth, planTier: "premium" }),
    admission: r.admission,
    busyDuringRun,
    slipsByModel: slipBlocks(r.callsByModel ?? {}, r.jsonRepairs ?? [], r.repairKindsByModel ?? {}),
    cacheByModel: cacheByModel(input.observer),
    run: r.run,
    probes: r.probes,
    byModelAndSite: r.byModelAndSite,
    gates: Object.fromEntries(GATES.map((gate) => [gate, gateBlock(input.observer, gate, r.remaining[gate])])),
    totals: Object.freeze({
      calls: r.byModelAndSite.reduce((sum, row) => sum + row.calls, 0),
      costUsd: usd(r.byModelAndSite.reduce((sum, row) => sum + BigInt(row.costNanoUsd), 0n)),
      formatFailures: r.formatFailures, failedCalls: r.failedCalls, refusedCalls: r.refusedCalls,
      formatRepaired: Object.values(r.callsByModel ?? {}).reduce((sum, mine) => sum + mine.repaired, 0),
      ...repairTotals(r.repairKindsByModel ?? {}),
      jsonRepairs: (r.jsonRepairs ?? []).length
    }),
    failures: r.failures
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
  const lines = [`# Preview practice (${String(report.mode)}): ${report.verdict}`, "",
    `Exit code ${String(report.exitCode)}. Started ${String(report.startedAt)}, finished ${String(report.finishedAt)}.`, ""];
  if (report.reasons.length > 0) {
    lines.push("Why:", "", ...report.reasons.map((reason) => `- ${reason}`), "");
  }
  const totals = report.totals as Record<string, unknown> | undefined;
  if (totals !== undefined) lines.push("Totals:", "", ...Object.entries(totals).map(([key, value]) => `- ${key}: ${String(value)}`), "");
  const gates = report.gates as Record<string, GateBlock> | undefined;
  if (gates !== undefined) {
    lines.push("Gates:", "");
    for (const [gate, block] of Object.entries(gates)) {
      const observed = (block.observed ?? block) as PracticeGateSummary;
      lines.push(`- ${gate}: ${String(observed.calls)} calls, ${String(observed.unbilled)} refused, not billed (vendor busy `
        + `${String(observed.vendorRefused)}, cooling off ${String(observed.modelCooling)}, not reached ${String(observed.notReached)}, `
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
  lines.push(`Wrong-format replies, fixed by their call or not: ${String(failures?.length ?? 0)} (their text and the exact problems are in report.json, "failures").`, "");
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
