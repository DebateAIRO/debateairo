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
import { latencySummary, practiceVerdict, type PracticeVerdictResult } from "./practice-verdict.js";

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
  // Every attempt counts: a repair that fixed the reply still means the first reply had the wrong format.
  const formatFailures = samples.reduce((sum, sample) => sum + sample.attempts.filter((attempt) =>
    attempt.parseStatus === "PARSE_FAILED" || attempt.parseStatus === "SCHEMA_FAILED" || attempt.parseStatus === "UNPARSED").length
    + (sample.status === "POST_CHECK_FAILED" ? 1 : 0), 0);
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
      outputTokens: mine.reduce((sum, sample) => sum + (sample.outputTokens ?? 0), 0),
      costUsd: usd(cost), unbilledRefusals: mine.reduce((sum, sample) => sum + sample.unbilledRefusals, 0) });
  }));
  return Object.freeze({
    schema: PRACTICE_REPORT_SCHEMA, mode: "formats", ...verdict,
    startedAt: input.startedAt.toISOString(), finishedAt: input.finishedAt.toISOString(),
    wallSeconds: Math.round((input.finishedAt.getTime() - input.startedAt.getTime()) / 1000),
    models: input.result.models, lanes: input.result.lanes, busyModels: input.result.busyModels,
    byModelAndLane,
    gates: Object.fromEntries(GATES.map((gate) => [gate, gateBlock(input.observer, gate, input.remaining[gate])])),
    totals: Object.freeze({
      samples: samples.length,
      costUsd: usd(samples.reduce((sum, sample) => sum + BigInt(sample.costNanoUsd ?? "0"), 0n)),
      formatFailures, failedCalls
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
  const verdict = practiceVerdict({
    harnessError: null,
    completed: r.admission.admitted && r.run.workItemOutcome === "COMPLETED",
    servedAnswer: r.run.answer?.served ?? false,
    storyOutcome: r.run.story?.outcome ?? "MISSING",
    formatFailures: r.formatFailures,
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
    run: r.run,
    probes: r.probes,
    byModelAndSite: r.byModelAndSite,
    gates: Object.fromEntries(GATES.map((gate) => [gate, gateBlock(input.observer, gate, r.remaining[gate])])),
    totals: Object.freeze({
      calls: r.byModelAndSite.reduce((sum, row) => sum + row.calls, 0),
      costUsd: usd(r.byModelAndSite.reduce((sum, row) => sum + BigInt(row.costNanoUsd), 0n)),
      formatFailures: r.formatFailures, failedCalls: r.failedCalls, refusedCalls: r.refusedCalls
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
        + `longest not-reached run ${String(observed.longestNotReachedRun)} (streak at start `
        + `${observed.unsentStreakAtStart === null ? "unknown" : String(observed.unsentStreakAtStart)}), `
        + `stopped: ${observed.stop === null ? "no" : observed.stop.reason}`
        + (block.spentUsdByRemaining === undefined || block.spentUsdByRemaining === null ? "" : `, spent by the gate's count $${block.spentUsdByRemaining}`));
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
  const failures = report.failures as readonly unknown[] | undefined;
  lines.push(`Wrong-format replies: ${String(failures?.length ?? 0)} (their text and the exact problems are in report.json, "failures").`, "");
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
