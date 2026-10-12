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

/**
 * The line kinds every practice log keeps the same way (the gates' watch and stops, a model marked busy for good, the
 * end, the abort). The formats log and the openings log read them with the same code (`practiceLogEnding`).
 */
export type PracticeLogCommonLine =
  | Readonly<{ kind: "wire"; event: PracticeWireEvent }>
  | Readonly<{ kind: "stop"; stop: PracticeGateStop }>
  /** A model marked busy for good: its wait budget spent, its remaining jobs skipped. */
  | Readonly<{ kind: "busy"; model: string }>
  | Readonly<{ kind: "end"; finishedAt: string; interrupted: boolean;
    remainingAfter: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | Readonly<{ kind: "abort"; at: string; code: string }>;

const PRACTICE_LOG_COMMON_KINDS: readonly string[] = ["wire", "stop", "busy", "end", "abort"];

export function isPracticeLogCommonLine(line: Readonly<{ kind: string }>): line is PracticeLogCommonLine {
  return PRACTICE_LOG_COMMON_KINDS.includes(line.kind);
}

export type PracticeLogLine =
  | Readonly<{ kind: "start"; schema: typeof PRACTICE_SAMPLES_SCHEMA; mode: "formats"; startedAt: string;
    models: readonly string[]; lanes: readonly PracticeLane[]; samples: number; parallel: boolean;
    /** Each model's budget of busy waits (absent in logs written before it existed). */
    busyWaitMs?: number;
    unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>;
    remainingBefore: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | PracticeLogCommonLine
  | Readonly<{ kind: "sample"; sample: PracticeSample }>
  /** A busy model parked: it waits, then the same job is tried again. */
  | (Readonly<{ kind: "busy-wait" }> & PracticeBusyWait)
  /** A parked model's wait ended. */
  | (Readonly<{ kind: "resume" }> & PracticeBusyResume);

const PRACTICE_SAMPLES_KINDS: readonly string[] = ["start", "wire", "stop", "sample", "busy", "busy-wait", "resume", "end", "abort"];

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

/**
 * Appends one JSON line at a time to a NEW file in a folder (private) and pushes each to the disk before returning. One
 * writer per file. The formats log and the openings log both write this way.
 */
export class PracticeJsonlWriter {
  readonly path: string;
  #fd: number | null;

  private constructor(path: string, fd: number) {
    this.path = path;
    this.#fd = fd;
  }

  /** Opens a NEW file in the folder (made private if missing); a folder that already holds it is refused with `holdsCode`. */
  static create(directory: string, file: string, holdsCode: string): PracticeJsonlWriter {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, file);
    let fd: number;
    try { fd = openSync(path, "ax", 0o600); } catch (error) {
      if ((error as { code?: unknown }).code === "EEXIST") throw new Error(holdsCode);
      throw error;
    }
    return new PracticeJsonlWriter(path, fd);
  }

  get open(): boolean { return this.#fd !== null; }

  append(line: unknown): void {
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
 * The JSON lines of a log's text, in order. A last line cut short (the process killed while writing it) is left out; any
 * other line that cannot be read, or whose kind is not one of `kinds`, refuses the whole text with `invalidCode`.
 */
export function parseJsonlLines<T>(text: string, kinds: readonly string[], invalidCode: string): T[] {
  const raw = text.split("\n");
  if (raw.at(-1) === "") raw.pop();
  const lines: T[] = [];
  for (const [index, entry] of raw.entries()) {
    let parsed: unknown;
    try { parsed = JSON.parse(entry); } catch {
      if (index === raw.length - 1) break;
      throw new Error(invalidCode);
    }
    const kind = typeof parsed === "object" && parsed !== null ? (parsed as { kind?: unknown }).kind : undefined;
    if (!kinds.includes(String(kind))) throw new Error(invalidCode);
    lines.push(parsed as T);
  }
  return lines;
}

/** Appends one line at a time and pushes each to the disk before returning. One writer per log. */
export class PracticeSampleLog {
  readonly path: string;
  readonly #writer: PracticeJsonlWriter;

  private constructor(writer: PracticeJsonlWriter) {
    this.path = writer.path;
    this.#writer = writer;
  }

  /** Opens a NEW log in the folder (made private if missing); a folder that already holds one is refused. */
  static create(directory: string): PracticeSampleLog {
    return new PracticeSampleLog(PracticeJsonlWriter.create(directory, PRACTICE_SAMPLES_FILE, "PRACTICE_OUT_ALREADY_HOLDS_SAMPLES"));
  }

  get open(): boolean { return this.#writer.open; }

  append(line: PracticeLogLine): void { this.#writer.append(line); }

  close(): void { this.#writer.close(); }
}

/**
 * The log's lines. A last line cut short (the process killed while writing it) is left out; any other line that cannot
 * be read refuses the whole log.
 */
export function parsePracticeSampleLog(text: string): readonly PracticeLogLine[] {
  const lines = parseJsonlLines<PracticeLogLine>(text, PRACTICE_SAMPLES_KINDS, "PRACTICE_SAMPLES_LOG_INVALID");
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
 * What a log's end and abort lines say, read the same way by every log's report: the gates' watch replayed from the wire
 * and stop lines, the models marked busy, the abort code (the one the caller names, else the log's own abort line, else
 * PRACTICE_LOG_HAS_NO_END when there is no end line), when the run finished, whether the operator interrupted it, and
 * the gates' counts after it (null without an end line).
 */
export function practiceLogEnding(lines: readonly PracticeLogCommonLine[], unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>,
  abort: Readonly<{ code: string; at: Date }> | null): Readonly<{
    observer: PracticeGateObserver; busy: readonly string[]; abortCode: string | null; finishedAt: Date; interrupted: boolean;
    after: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> | null;
  }> {
  const end = lines.find((line) => line.kind === "end");
  const abortLine = lines.find((line) => line.kind === "abort");
  const played = lines.flatMap((line): ({ event: PracticeWireEvent } | { stop: PracticeGateStop })[] =>
    line.kind === "wire" ? [{ event: line.event }] : line.kind === "stop" ? [{ stop: line.stop }] : []);
  return Object.freeze({
    observer: PracticeGateObserver.replay(played, { unsentStreakAtStart }),
    busy: Object.freeze([...new Set(lines.flatMap((line) => line.kind === "busy" ? [line.model] : []))]),
    abortCode: abort?.code ?? (abortLine?.kind === "abort" ? abortLine.code : end === undefined ? PRACTICE_LOG_HAS_NO_END : null),
    finishedAt: end?.kind === "end" ? new Date(end.finishedAt)
      : abort !== null ? abort.at : abortLine?.kind === "abort" ? new Date(abortLine.at) : new Date(),
    interrupted: end?.kind === "end" ? end.interrupted : false,
    after: end?.kind === "end" ? end.remainingAfter : null
  });
}

/**
 * The report, built from the log's lines alone. A log with an end line gives the run's own verdict; one with an abort
 * line, or with neither (killed outright), gives ABORTED (exit 50) with every other rule that applied listed after it.
 * `abort` names the abort when the caller is writing it now (its line may not be on the disk).
 */
export function practiceReportFromLog(lines: readonly PracticeLogLine[], abort: Readonly<{ code: string; at: Date }> | null = null): PracticeReport {
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.kind !== "start") throw new Error("PRACTICE_SAMPLES_LOG_INVALID");
  const ending = practiceLogEnding(lines.filter(isPracticeLogCommonLine), start.unsentStreakAtStart, abort);
  const samples = lines.flatMap((line) => line.kind === "sample" ? [line.sample] : []);
  const result: PracticeFormatsResult = Object.freeze({ samples: Object.freeze(samples), models: start.models, lanes: start.lanes,
    busyModels: ending.busy });
  const after = ending.after;
  const report = formatsReport({ result, observer: ending.observer, startedAt: new Date(start.startedAt), finishedAt: ending.finishedAt,
    interrupted: ending.interrupted, aborted: ending.abortCode,
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
