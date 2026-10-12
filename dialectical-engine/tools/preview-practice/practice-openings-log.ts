/**
 * Preview practice, mode "openings": openings.jsonl, so no finished reply is ever lost, and the report built from it.
 *
 * Plain words: the moment a call finishes, one line about it goes to openings.jsonl and is pushed to the disk: which
 * arm and question, which step, which AI and maker, exactly what it could see (BLIND, or the ids it was shown), its
 * place in the plan, its times, tokens, cost, format check and how it was fixed, and its reply (key-shaped strings
 * blanked, at most 64 KiB). After each arm of each question one line holds the map that came out (or the positions
 * count for today's opening). The gates' watch adds one line per gate call. report.json and report.md are built from
 * these lines at the end and on every other way out. They hold counts, cost, time, slips, fallbacks and notes only:
 * the comparison of the openings is the owners' own method, outside this repository.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapMarkRecord, MapNoteRecord, MapResult, MapStep } from "@debateai/map";
import type { PracticeAttempt } from "./practice-formats.js";
import type { PracticeGateName } from "./practice-gate-observer.js";
import type { OpeningsArm, OpeningsQuestionDigest } from "./practice-openings-questions.js";
import { GATES, gateHalted, gatePauses, gateStopped, p90ByModel, PRACTICE_REPORT_SCHEMA, usd, type PracticeReport } from "./practice-report.js";
import { redactKeyShapes, reportableReplyText } from "./practice-redaction.js";
import {
  isPracticeLogCommonLine,
  parseJsonlLines,
  PracticeJsonlWriter,
  practiceLogEnding,
  type PracticeLogCommonLine,
  type PracticeRemainingLine
} from "./practice-samples-log.js";
import { practiceModelCalls, practiceRepairKindsByModel, practiceVerdict, type PracticeReplyForm } from "./practice-verdict.js";

export const OPENINGS_SCHEMA = "preview-practice-openings-v1" as const;
export const OPENINGS_FILE = "openings.jsonl" as const;
const OPENINGS_LINE_KINDS: readonly string[] = ["start", "wire", "stop", "call", "arm", "busy", "busy-wait", "end", "abort"];

/** A map step, or POSITION: today's opening (arm T), one full position per AI. */
export type OpeningsStep = MapStep | "POSITION";

/**
 * ACCEPTED: the first reply passed. REPAIRED: a later try of the same call fixed a slip (a warning). FORMAT_FAILED: no
 * accepted reply after the tries, because of its format (FAIL). CALL_FAILED: any other failure. BUSY: the call ended in
 * the vendor's unbilled refusal and the model's wait budget is spent. SKIPPED_*: nothing was sent.
 */
export type OpeningsCallStatus = "ACCEPTED" | "REPAIRED" | "FORMAT_FAILED" | "CALL_FAILED" | "BUSY" | "SKIPPED_MODEL_BUSY" | "SKIPPED_STOPPED";

export type OpeningsCall = Readonly<{
  arm: OpeningsArm;
  questionId: string;
  step: OpeningsStep;
  callSiteKey: string;
  aiRef: string;
  model: string;
  maker: string;
  gate: PracticeGateName;
  /** BLIND, or the ids of exactly what it was shown. */
  shown: "BLIND" | readonly string[];
  /** Its plan position within the arm. */
  order: number;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  costNanoUsd: string | null;
  status: OpeningsCallStatus;
  errorCode: string | null;
  attempts: readonly PracticeAttempt[];
  /** The accepted try's form: ORIGINAL, PATCH (the short follow-up) or FULL (the full re-ask); null without one. */
  replyForm: PracticeReplyForm | null;
  /** The last reply's text (accepted or refused), key-shaped strings blanked, at most 64 KiB; null when none came. */
  replyText: string | null;
}>;

/**
 * The practice's own note on an arm (ruling T11-m1): a gate stopped, or the operator interrupted, while the arm ran;
 * `detail` names the stops (`gate:reason`). Its calls behind the stopped gate were not sent: they are not the models'
 * own fallbacks. The run starts nothing after it.
 */
export type OpeningsStopNote = Readonly<{ note: "STOPPED"; step: OpeningsStep | "MAP"; detail: string }>;
export type OpeningsArmNote = MapNoteRecord | OpeningsStopNote;

export type OpeningsArmLine = Readonly<{
  arm: OpeningsArm;
  questionId: string;
  startedAt: string;
  finishedAt: string;
  /** MAP or UNAVAILABLE (arms A, B, C); POSITIONS (arm T). */
  outcome: "MAP" | "UNAVAILABLE" | "POSITIONS";
  /** Arm T: positions written. */
  positions: number;
  marks: readonly MapMarkRecord[];
  notes: readonly OpeningsArmNote[];
  /** The map without its call records (each call has its own line). */
  map: Omit<MapResult, "calls"> | null;
}>;

export type OpeningsBusyWait = Readonly<{
  model: string; arm: OpeningsArm; questionId: string; callSiteKey: string;
  /** This model's waits so far, this one included. */
  wait: number;
  waitMs: number;
  reason: "VENDOR_REFUSED" | "MODEL_COOLING";
  retryAfterSeconds: number | null;
}>;

export type OpeningsLogLine =
  | Readonly<{ kind: "start"; schema: typeof OPENINGS_SCHEMA; mode: "openings"; dry: boolean; startedAt: string;
    models: readonly string[]; questions: readonly string[];
    /** Each asked question's id and the digest of its question line: a later rewording shows across runs. */
    questionDigests: readonly OpeningsQuestionDigest[]; arms: readonly OpeningsArm[]; busyWaitMs: number;
    unsentStreakAtStart: Readonly<Record<PracticeGateName, number>>;
    remainingBefore: Readonly<Record<PracticeGateName, PracticeRemainingLine | null>> }>
  | PracticeLogCommonLine
  | Readonly<{ kind: "call"; call: OpeningsCall }>
  | Readonly<{ kind: "arm"; arm: OpeningsArmLine }>
  | (Readonly<{ kind: "busy-wait" }> & OpeningsBusyWait);

/**
 * Every string value inside a model-written structure, key-shape redacted (no cap: a map is short, and every field the
 * model wrote is held to the same rule as a reply). Object keys and non-string values are left as they are.
 */
function redactedStrings<T>(value: T): T {
  if (typeof value === "string") return redactKeyShapes(value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => redactedStrings(item)) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactedStrings(item)])) as T;
  }
  return value;
}

/**
 * The line as it is written, whatever the caller passed, with the rules every report uses: a call's reply text is
 * redacted and capped (key-shaped strings blanked, at most 64 KiB), and an arm line's map has every string key-shape
 * redacted (the map is model-written). Applying it twice changes nothing.
 */
function redactedForLog(line: OpeningsLogLine): OpeningsLogLine {
  if (line.kind === "call" && line.call.replyText !== null) {
    return { kind: "call", call: { ...line.call, replyText: reportableReplyText(line.call.replyText) } };
  }
  if (line.kind === "arm" && line.arm.map !== null) {
    return { kind: "arm", arm: { ...line.arm, map: redactedStrings(line.arm.map) } };
  }
  return line;
}

/** Appends one line at a time and pushes each to the disk before returning. One writer per log. */
export class OpeningsLog {
  readonly path: string;
  readonly #writer: PracticeJsonlWriter;

  private constructor(writer: PracticeJsonlWriter) {
    this.path = writer.path;
    this.#writer = writer;
  }

  /** Opens a NEW log in the folder (made private if missing); a folder that already holds one is refused. */
  static create(directory: string): OpeningsLog {
    return new OpeningsLog(PracticeJsonlWriter.create(directory, OPENINGS_FILE, "PRACTICE_OUT_ALREADY_HOLDS_OPENINGS"));
  }

  append(line: OpeningsLogLine): void { this.#writer.append(redactedForLog(line)); }

  close(): void { this.#writer.close(); }
}

/** The log's lines. A last line cut short is left out; any other unreadable line refuses the whole log. */
export function parseOpeningsLog(text: string): readonly OpeningsLogLine[] {
  const lines = parseJsonlLines<OpeningsLogLine>(text, OPENINGS_LINE_KINDS, "PRACTICE_OPENINGS_LOG_INVALID");
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.kind !== "start" || start.schema !== OPENINGS_SCHEMA) throw new Error("PRACTICE_OPENINGS_LOG_INVALID");
  return Object.freeze(lines);
}

export function readOpeningsLog(directory: string): readonly OpeningsLogLine[] {
  const path = join(directory, OPENINGS_FILE);
  if (!existsSync(path)) throw new Error("PRACTICE_OPENINGS_LOG_MISSING");
  return parseOpeningsLog(readFileSync(path, "utf8"));
}

function openingsCount(values: readonly string[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return Object.freeze(out);
}

const openingsAnswered = (call: OpeningsCall): boolean => call.status === "ACCEPTED" || call.status === "REPAIRED";

/** A call the report lists as wrong-format: it failed, or one of its tries came back with a reply that failed its check. */
const openingsWrongFormat = (call: OpeningsCall): boolean => call.status === "FORMAT_FAILED" || call.status === "CALL_FAILED"
  || call.attempts.some((attempt) => attempt.parseStatus !== null && attempt.parseStatus !== "PARSED");

/**
 * The report from the log alone, with the tool's own verdict (practice-verdict.ts): a log with an end line gives the
 * run's own verdict; one with an abort line, or neither, gives ABORTED with every other rule listed after it.
 */
export function openingsReportFromLog(lines: readonly OpeningsLogLine[], abort: Readonly<{ code: string; at: Date }> | null = null): PracticeReport {
  const start = lines.find((line) => line.kind === "start");
  if (start === undefined || start.kind !== "start") throw new Error("PRACTICE_OPENINGS_LOG_INVALID");
  const ending = practiceLogEnding(lines.filter(isPracticeLogCommonLine), start.unsentStreakAtStart, abort);
  const after = ending.after;
  const calls = lines.flatMap((line) => (line.kind === "call" ? [line.call] : []));
  const armLines = lines.flatMap((line) => (line.kind === "arm" ? [line.arm] : []));
  const busy = ending.busy;
  const tries = calls.filter((call) => call.attempts.length > 0).map((call) => Object.freeze({ model: call.model, tries: call.attempts }));
  const callsByModel = practiceModelCalls(tries);
  const busyRuns = Object.fromEntries(busy.map((model) => {
    const mine = calls.filter((call) => call.model === model);
    const answered = mine.filter(openingsAnswered).length;
    return [model, Object.freeze({ answered, skipped: mine.length - answered })];
  }));
  const answeredModels = new Set(calls.filter(openingsAnswered).map((call) => call.model));
  const formatFailures = calls.filter((call) => call.status === "FORMAT_FAILED").length;
  const failedCalls = calls.filter((call) => call.status === "CALL_FAILED").length;
  const verdict = practiceVerdict({
    harnessError: null,
    completed: true,
    interrupted: ending.interrupted,
    aborted: ending.abortCode,
    servedAnswer: null,
    storyOutcome: null,
    formatFailures,
    callsByModel,
    busyRuns,
    failedCalls,
    gateHalted: gateHalted(ending.observer, after),
    gateStopped: gateStopped(ending.observer),
    gatePauses: gatePauses(ending.observer),
    notExercisedModels: start.models.filter((model) => !answeredModels.has(model) && !busy.includes(model)),
    busyModels: busy,
    unbilledRefusals: GATES.reduce((sum, gate) => sum + ending.observer.summary(gate).unbilled, 0),
    p90ByModel: p90ByModel(calls.map((call) => ({ model: call.model, latencies: call.attempts.map((attempt) => attempt.latencyMs) })))
  });
  const nano = (rows: readonly OpeningsCall[]) => rows.reduce((sum, call) => sum + BigInt(call.costNanoUsd ?? "0"), 0n);
  const tokens = (rows: readonly OpeningsCall[], pick: (call: OpeningsCall) => number | null) =>
    rows.reduce((sum, call) => sum + (pick(call) ?? 0), 0);
  const byArm = start.arms.map((arm) => {
    const mine = calls.filter((call) => call.arm === arm);
    const ownLines = armLines.filter((line) => line.arm === arm);
    return Object.freeze({
      arm,
      questions: ownLines.length,
      calls: mine.length,
      statuses: openingsCount(mine.map((call) => call.status)),
      byStep: openingsCount(mine.map((call) => call.step)),
      inputTokens: tokens(mine, (call) => call.inputTokens),
      outputTokens: tokens(mine, (call) => call.outputTokens),
      reasoningTokens: tokens(mine, (call) => call.reasoningTokens),
      costUsd: usd(nano(mine)),
      wallSeconds: Math.round(ownLines.reduce((sum, line) => sum + (Date.parse(line.finishedAt) - Date.parse(line.startedAt)), 0) / 1_000),
      unavailable: ownLines.filter((line) => line.outcome === "UNAVAILABLE").length,
      marks: openingsCount(ownLines.flatMap((line) => line.marks.map((mark) => mark.mark))),
      notes: openingsCount(ownLines.flatMap((line) => line.notes.map((note) => note.note)))
    });
  });
  return Object.freeze({
    schema: PRACTICE_REPORT_SCHEMA, mode: "openings", dry: start.dry, ...verdict,
    startedAt: start.startedAt, finishedAt: ending.finishedAt.toISOString(),
    wallSeconds: Math.round((ending.finishedAt.getTime() - Date.parse(start.startedAt)) / 1_000),
    models: start.models, questions: start.questions, questionDigests: start.questionDigests, arms: start.arms, busyModels: busy,
    callsByModel, repairKindsByModel: practiceRepairKindsByModel(tries),
    byArm,
    gates: Object.fromEntries(GATES.map((gate) => [gate, Object.freeze({ observed: ending.observer.summary(gate),
      remainingBefore: start.remainingBefore[gate], remainingAfter: after?.[gate] ?? null })])),
    totals: Object.freeze({
      calls: calls.length,
      costUsd: usd(nano(calls)),
      formatFailures,
      failedCalls,
      formatRepaired: Object.values(callsByModel).reduce((sum, mine) => sum + mine.repaired, 0),
      marks: armLines.reduce((sum, line) => sum + line.marks.length, 0),
      notes: armLines.reduce((sum, line) => sum + line.notes.length, 0)
    }),
    // The formats report's rule: a call that failed, or one of whose tries came back with a reply that failed its check
    // (fixed or not). Its reply text is kept only for a format failure, redacted again here (the lines may be in memory).
    failures: calls.filter(openingsWrongFormat).map((call) => call.status === "FORMAT_FAILED"
      ? { ...call, replyText: call.replyText === null ? null : reportableReplyText(call.replyText) }
      : { ...call, replyText: null })
  });
}
