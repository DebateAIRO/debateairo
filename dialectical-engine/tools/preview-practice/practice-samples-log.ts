/**
 * Preview practice: the samples log (formats mode), so no finished sample is ever lost.
 *
 * Plain words: as soon as a job finishes, one line about it is added to `samples.jsonl` in the report folder and
 * pushed to the disk. The gates' watch adds one line per call (codes, times and token counts only) and one per stop.
 * The first line says what the run was asked to cover; the last says how it ended. report.json and report.md are built
 * from these lines at the end, and on every other way out too (an interrupt, a second interrupt, a crash), from
 * whatever lines are there. `practice.ts report --out DIR` builds them again from DIR/samples.jsonl.
 *
 * What a line holds is exactly what the report holds: a sample's reply text only when the reply failed its format
 * check (key-shaped strings blanked, at most 64 KiB; practice-redaction.ts), never a request, never a key.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { PreviewGateRemaining } from "@debateai/providers";
import type { PracticeBusyResume, PracticeBusyWait, PracticeFormatsResult, PracticeSample } from "./practice-formats.js";
import { PracticeGateObserver, type PracticeGateName, type PracticeGateStop, type PracticeWireEvent } from "./practice-gate-observer.js";
import type { PracticeLane } from "./practice-lanes.js";
import { formatsReport, type PracticeReport } from "./practice-report.js";

export const PRACTICE_SAMPLES_SCHEMA = "preview-practice-samples-v1" as const;
export const PRACTICE_SAMPLES_FILE = "samples.jsonl" as const;
/** The code of a log that ends without an end line or an abort line (the process was killed outright). */
export const PRACTICE_LOG_HAS_NO_END = "PRACTICE_LOG_HAS_NO_END" as const;

/** A gate's "what is left today" answer as a log line keeps it (money as a nano-USD decimal string). */
export type PracticeRemainingLine = Readonly<{
  state: PreviewGateRemaining["state"];
  windowOpen: boolean;
  remainingNanoUsd: string;
  remainingCalls: number;
  maxConcurrentCalls: number;
  largestReservationNanoUsd: string;
  enabledModels: readonly string[];
}>;

export type PracticeLogLine =
  | Readonly<{ kind: "start"; schema: typeof PRACTICE_SAMPLES_SCHEMA; mode: "formats"; startedAt: string;
    models: readonly string[]; lanes: readonly PracticeLane[]; samples: number; parallel: boolean;
    /** Each model's budget of busy waits (absent in logs written before it existed). */
    busyWaitMs?: number;
    unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>;
    remainingBefore: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | Readonly<{ kind: "wire"; event: PracticeWireEvent }>
  | Readonly<{ kind: "stop"; stop: PracticeGateStop }>
  | Readonly<{ kind: "sample"; sample: PracticeSample }>
  /** A model marked busy for good: its wait budget spent, its remaining jobs skipped. */
  | Readonly<{ kind: "busy"; model: string }>
  /** A busy model parked: it waits, then the same job is tried again. */
  | (Readonly<{ kind: "busy-wait" }> & PracticeBusyWait)
  /** A parked model's wait ended. */
  | (Readonly<{ kind: "resume" }> & PracticeBusyResume)
  | Readonly<{ kind: "end"; finishedAt: string; interrupted: boolean;
    remainingAfter: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | Readonly<{ kind: "abort"; at: string; code: string }>;

export function remainingLine(value: PreviewGateRemaining | null): PracticeRemainingLine | null {
  return value === null ? null : Object.freeze({ state: value.state, windowOpen: value.windowOpen,
    remainingNanoUsd: String(value.remainingNanoUsd), remainingCalls: value.remainingCalls,
    maxConcurrentCalls: value.maxConcurrentCalls, largestReservationNanoUsd: String(value.largestReservationNanoUsd),
    enabledModels: Object.freeze([...value.enabledModels]) });
}

function remainingValue(line: PracticeRemainingLine | null | undefined): PreviewGateRemaining | null {
  return line === null || line === undefined ? null : Object.freeze({ state: line.state, windowOpen: line.windowOpen,
    remainingNanoUsd: BigInt(line.remainingNanoUsd), remainingCalls: line.remainingCalls,
    maxConcurrentCalls: line.maxConcurrentCalls, largestReservationNanoUsd: BigInt(line.largestReservationNanoUsd),
    enabledModels: Object.freeze([...line.enabledModels]) });
}

/** Appends one line at a time and pushes each to the disk before returning. One writer per log. */
export class PracticeSampleLog {
  readonly path: string;
  #fd: number | null;

  private constructor(path: string, fd: number) {
    this.path = path;
    this.#fd = fd;
  }

  /** Opens a NEW log in the folder (made private if missing); a folder that already holds one is refused. */
  static create(directory: string): PracticeSampleLog {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, PRACTICE_SAMPLES_FILE);
    let fd: number;
    try { fd = openSync(path, "ax", 0o600); } catch (error) {
      if ((error as { code?: unknown }).code === "EEXIST") throw new Error("PRACTICE_OUT_ALREADY_HOLDS_SAMPLES");
      throw error;
    }
    return new PracticeSampleLog(path, fd);
  }

  get open(): boolean { return this.#fd !== null; }

  append(line: PracticeLogLine): void {
    if (this.#fd === null) return;
    const text = `${JSON.stringify(line)}\n`;
    writeSync(this.#fd, text);
    fsyncSync(this.#fd);
  }

  close(): void {
    if (this.#fd === null) return;
    const fd = this.#fd;
    this.#fd = null;
    closeSync(fd);
  }
}

/**
 * The log's lines. A last line cut short (the process killed while writing it) is left out; any other line that cannot
 * be read refuses the whole log.
 */
export function parsePracticeSampleLog(text: string): readonly PracticeLogLine[] {
  const raw = text.split("\n");
  if (raw.at(-1) === "") raw.pop();
  const lines: PracticeLogLine[] = [];
  for (const [index, entry] of raw.entries()) {
    let parsed: unknown;
    try { parsed = JSON.parse(entry); } catch {
      if (index === raw.length - 1) break;
      throw new Error("PRACTICE_SAMPLES_LOG_INVALID");
    }
    const kind = typeof parsed === "object" && parsed !== null ? (parsed as { kind?: unknown }).kind : undefined;
    if (!["start", "wire", "stop", "sample", "busy", "busy-wait", "resume", "end", "abort"].includes(String(kind))) throw new Error("PRACTICE_SAMPLES_LOG_INVALID");
    lines.push(parsed as PracticeLogLine);
  }
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.schema !== PRACTICE_SAMPLES_SCHEMA) throw new Error("PRACTICE_SAMPLES_LOG_INVALID");
  return Object.freeze(lines);
}

export function readPracticeSampleLog(directory: string): readonly PracticeLogLine[] {
  const path = join(directory, PRACTICE_SAMPLES_FILE);
  if (!existsSync(path)) throw new Error("PRACTICE_SAMPLES_LOG_MISSING");
  return parsePracticeSampleLog(readFileSync(path, "utf8"));
}

/**
 * The report, built from the log's lines alone. A log with an end line gives the run's own verdict; one with an abort
 * line, or with neither (killed outright), gives ABORTED (exit 50) with every other rule that applied listed after it.
 * `abort` names the abort when the caller is writing it now (its line may not be on the disk).
 */
export function practiceReportFromLog(lines: readonly PracticeLogLine[], abort: Readonly<{ code: string; at: Date }> | null = null): PracticeReport {
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.kind !== "start") throw new Error("PRACTICE_SAMPLES_LOG_INVALID");
  const end = lines.find((line) => line.kind === "end");
  const abortLine = lines.find((line) => line.kind === "abort");
  const played = lines.flatMap((line): ({ event: PracticeWireEvent } | { stop: PracticeGateStop })[] =>
    line.kind === "wire" ? [{ event: line.event }] : line.kind === "stop" ? [{ stop: line.stop }] : []);
  const observer = PracticeGateObserver.replay(played, { unsentStreakAtStart: start.unsentStreakAtStart });
  const samples = lines.flatMap((line) => line.kind === "sample" ? [line.sample] : []);
  const busy = [...new Set(lines.flatMap((line) => line.kind === "busy" ? [line.model] : []))];
  const result: PracticeFormatsResult = Object.freeze({ samples: Object.freeze(samples), models: start.models, lanes: start.lanes,
    busyModels: Object.freeze(busy) });
  const abortCode = abort?.code ?? (abortLine?.kind === "abort" ? abortLine.code : end === undefined ? PRACTICE_LOG_HAS_NO_END : null);
  const finishedAt = end?.kind === "end" ? new Date(end.finishedAt)
    : abort !== null ? abort.at : abortLine?.kind === "abort" ? new Date(abortLine.at) : new Date();
  const after = end?.kind === "end" ? end.remainingAfter : null;
  const report = formatsReport({ result, observer, startedAt: new Date(start.startedAt), finishedAt,
    interrupted: end?.kind === "end" ? end.interrupted : false, aborted: abortCode,
    remaining: {
      deepinfra: { before: remainingValue(start.remainingBefore.deepinfra), after: remainingValue(after?.deepinfra) },
      anthropic: { before: remainingValue(start.remainingBefore.anthropic), after: remainingValue(after?.anthropic) }
    } });
  return Object.freeze({ ...report, plannedSamples: start.models.length * start.lanes.length * start.samples,
    parallel: start.parallel, busyByModel: practiceBusyByModel(lines) });
}

export type PracticeBusySummary = Readonly<{
  /** Times the model was parked busy. */
  waits: number;
  /** The waits it was given, added up. */
  totalWaitMs: number;
  /** After its last wait a job of it went through (not skipped, not refused). */
  recovered: boolean;
  /** Its wait budget ran out: its remaining jobs were skipped. */
  gaveUp: boolean;
}>;

/** Per model that was ever parked busy: its waits, their total, and whether it came back. In the log's order. */
export function practiceBusyByModel(lines: readonly PracticeLogLine[]): Readonly<Record<string, PracticeBusySummary>> {
  const out: Record<string, PracticeBusySummary> = {};
  const models = [...new Set(lines.flatMap((line) => line.kind === "busy-wait" ? [line.model] : []))];
  for (const model of models) {
    const lastWait = lines.reduce((at, line, index) => line.kind === "busy-wait" && line.model === model ? index : at, -1);
    const waits = lines.filter((line) => line.kind === "busy-wait" && line.model === model) as readonly PracticeBusyWait[];
    const gaveUp = lines.some((line) => line.kind === "busy" && line.model === model);
    const recovered = !gaveUp && lines.slice(lastWait + 1).some((line) => line.kind === "sample" && line.sample.model === model
      && !["SKIPPED_GATE_STOPPED", "SKIPPED_MODEL_BUSY", "UNBILLED_REFUSED"].includes(line.sample.status));
    out[model] = Object.freeze({ waits: waits.length, totalWaitMs: waits.reduce((sum, wait) => sum + wait.waitMs, 0), recovered, gaveUp });
  }
  return Object.freeze(out);
}
