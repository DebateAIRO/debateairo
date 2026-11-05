/**
 * Preview practice, mode "openings": openings.jsonl, so no finished reply is ever lost, and the report built from it.
 *
 * Plain words: the moment a call finishes, one line about it goes to openings.jsonl and is pushed to the disk: which
 * arm and question, which step, which AI and maker, exactly what it could see (BLIND, or the ids it was shown), its
 * place in the plan, its times, tokens, cost, format check and how it was fixed, and its reply (key-shaped strings
 * blanked, at most 64 KiB). After each arm of each question one line holds the map that came out (or the positions
 * count for today's opening). The gates' watch adds one line per gate call. report.json and report.md are built from
 * these lines at the end and on every other way out. They hold counts, cost, time, slips, fallbacks and notes only:
 * the comparison of the openings is the owners' own method, outside this repository. Arm S (V4 start step, Task 91) adds
 * one START_CARD line per question and plan (the card's wait, never a cost), and report.json its `startStep` block. Arm Q
 * (Task 91c) adds one CLARIFY_TIME line per question (the clarifying call's time and NONE's code, never a word or a cost),
 * and report.json its `clarify` block.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MapMarkRecord, MapNoteRecord, MapResult, MapStep } from "@debateai/map";
import { previewModelRow } from "@debateai/providers";
import { START_SEAT_SPEED_ORDER, startModelOfSeat } from "../../apps/api/src/start-step/seats.js";
import { practiceWireUsage, type PracticeAttempt } from "./practice-formats.js";
import type { PracticeGateName, PracticeWireEvent } from "./practice-gate-observer.js";
import { practiceWordingRows, practiceWordingTotals } from "./practice-map-wording.js";
import { OPENINGS_START_PLANS, type OpeningsArm, type OpeningsQuestionDigest, type OpeningsStartPlan } from "./practice-openings-questions.js";
import {
  GATES,
  gateHalted,
  gatePauses,
  gateStopped,
  p90ByModel,
  PRACTICE_REPORT_SCHEMA,
  spentUsdByRemaining,
  usd,
  type PracticeReport
} from "./practice-report.js";
import { redactKeyShapes, reportableReplyText } from "./practice-redaction.js";
import {
  isPracticeLogCommonLine,
  parseJsonlLines,
  PracticeJsonlWriter,
  practiceLogEnding,
  type PracticeLogCommonLine,
  type PracticeRemainingLine
} from "./practice-samples-log.js";
import {
  clarifySummary,
  clarifyWaitProposal,
  latencySummary,
  percentile,
  practiceModelCalls,
  practiceRepairKindsByModel,
  practiceVerdict,
  type PracticeReplyForm
} from "./practice-verdict.js";

export const OPENINGS_SCHEMA = "preview-practice-openings-v1" as const;
export const OPENINGS_FILE = "openings.jsonl" as const;
const OPENINGS_LINE_KINDS: readonly string[] = ["start", "wire", "stop", "call", "arm", "busy", "busy-wait", "end", "abort", "START_CARD",
  "CLARIFY_TIME"];

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
  /**
   * An answered call: the reply the gateway accepted (after a patch follow-up, the merged whole reply, not the patch
   * fragment). Otherwise the last reply's text. Key-shaped strings blanked, at most 64 KiB; null when none came.
   */
  replyText: string | null;
  /** Arm S only (Task 91): the plan whose card the call was made for. Absent on every other arm's call, as before. */
  plan?: OpeningsStartPlan;
}>;

/**
 * V4 start step, Task 91 (arm S): one card of the step before Start, written once every call it asked has ended.
 *  - cardMs: from the planner's start to the end of the first merge (the moment the card shows); with no list by the
 *    cut, to the moment the step ended without one;
 *  - listsIn: the lists in by the cut (0: no card was shown); late: the lists after it;
 *  - seatMs: each list seat in seat order, by its seat ref (the model, with "#2" on a company's second seat), with its
 *    list's time from asked to answered (null: it gave no list).
 * It never holds a cost: the card's calls carry it (`OpeningsCall.plan`), and report.json sums it per plan.
 */
export type OpeningsStartCardLine = Readonly<{
  kind: "START_CARD";
  plan: OpeningsStartPlan;
  questionId: string;
  cardMs: number;
  listsIn: number;
  late: number;
  seatMs: readonly Readonly<{ model: string; ms: number | null }>[];
}>;

/**
 * V4 start step, Task 91c (arm Q): one reading of the clarifying call of step 1's Next, written once it has ended.
 *  - ms: from the reading's start to the step's answer, as the page waits for it (the step's one retry and its bound included);
 *  - source: AI (the page gets questions) or NONE (it gets none); code: NONE's code from the step itself (DEADLINE, TRANSPORT,
 *    UNREADABLE, ...), null with AI.
 * Exactly these five fields: never a word of the question or the reply, never a cost (the gate's wire lines carry the money).
 */
export type OpeningsClarifyLine = Readonly<{ kind: "CLARIFY_TIME"; questionId: string; ms: number; source: "AI" | "NONE"; code: string | null }>;

/**
 * The practice's own note on an arm (ruling T11-m1): a gate stopped, or the operator interrupted, while the arm ran;
 * `detail` names the stops (`gate:reason`). Its calls behind the stopped gate were not sent: they are not the models'
 * own fallbacks. The run starts nothing after it.
 */
export type OpeningsStopNote = Readonly<{ note: "STOPPED"; step: OpeningsStep | "MAP"; detail: string }>;
/**
 * Ruling R3-T17a.2: a practice refusal inside the map's caller (the engine seal missing, wording N's base moved) ends the
 * arm loudly: no map, and this note names the refusal's code. Never a silent map fallback.
 */
export type OpeningsRefusedNote = Readonly<{ note: "PRACTICE_REFUSED"; step: "MAP"; detail: string }>;
export type OpeningsArmNote = MapNoteRecord | OpeningsStopNote | OpeningsRefusedNote;

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
  /** Arms C2 and C2N only (Task 17a): the seats the arm started with, so a seat that went busy in C2 shows in C2N. */
  seats?: number;
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
  | (Readonly<{ kind: "busy-wait" }> & OpeningsBusyWait)
  | OpeningsStartCardLine
  | OpeningsClarifyLine;

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
 * One plan's cards (Task 91, arm S), over the cards that were shown (a list in by the cut): the card's wait at the
 * typical card (p50), the slow end (p90, max), the model whose seats were slowest there (the highest p50 list time; a
 * tie goes to the later model in today's speed order) and the lists in by the cut (p50). All null with no card shown.
 */
export type OpeningsStartPlanSummary = Readonly<{ p50Ms: number | null; p90Ms: number | null; maxMs: number | null;
  slowestSeatModel: string | null; listsInP50: number | null }>;
/** Per plan, and each model's p50 list time over every card (a "#2" seat's time counts for its model). */
export type OpeningsStartSummary = Readonly<Record<OpeningsStartPlan, OpeningsStartPlanSummary>>
  & Readonly<{ seatP50Ms: Readonly<Record<string, number>> }>;

/** Each model's list times in these cards, a "#2" seat's under its model; a seat with no list has none. */
function startSeatTimes(lines: readonly OpeningsStartCardLine[]): ReadonlyMap<string, readonly number[]> {
  const times = new Map<string, number[]>();
  for (const seat of lines.flatMap((line) => line.seatMs)) {
    if (seat.ms === null) continue;
    const model = startModelOfSeat(seat.model);
    times.set(model, [...(times.get(model) ?? []), seat.ms]);
  }
  return times;
}

/** A model's place in today's speed order; a model it does not name comes after every one it names. */
const startSpeedRank = (model: string): number => {
  const at = START_SEAT_SPEED_ORDER.indexOf(model);
  return at < 0 ? START_SEAT_SPEED_ORDER.length : at;
};

/** The start step's figures from its START_CARD lines (nearest-rank percentiles, as every practice report's). */
export function startStepSummary(lines: readonly OpeningsStartCardLine[]): OpeningsStartSummary {
  const ofPlan = (plan: OpeningsStartPlan): OpeningsStartPlanSummary => {
    const shown = lines.filter((line) => line.plan === plan && line.listsIn > 0);
    const wait = latencySummary(shown.map((line) => line.cardMs));
    const slowest = [...startSeatTimes(shown)].map(([model, times]) => [model, percentile(times, 50)!] as const)
      .reduce<readonly [string, number] | null>((worst, one) => (worst === null || one[1] > worst[1]
        || (one[1] === worst[1] && startSpeedRank(one[0]) > startSpeedRank(worst[0])) ? one : worst), null);
    return Object.freeze({ p50Ms: wait.p50, p90Ms: wait.p90, maxMs: wait.max, slowestSeatModel: slowest?.[0] ?? null,
      listsInP50: percentile(shown.map((line) => line.listsIn), 50) });
  };
  const plans = Object.fromEntries(OPENINGS_START_PLANS.map((plan) => [plan, ofPlan(plan)])) as Record<OpeningsStartPlan, OpeningsStartPlanSummary>;
  return Object.freeze({ ...plans,
    seatP50Ms: Object.freeze(Object.fromEntries([...startSeatTimes(lines)].map(([model, times]) => [model, percentile(times, 50)!]))) });
}

/**
 * The list seats' order the times suggest (a proposed START_SEAT_SPEED_ORDER, plan Task 91 Step 4; never applied by
 * code): the timed models by p50 list time, fastest first, a tie in today's order; then every model of today's order
 * that has no time, in that order.
 */
export function startSeatOrderOf(summary: Pick<OpeningsStartSummary, "seatP50Ms">): readonly string[] {
  const timed = Object.keys(summary.seatP50Ms).sort((a, b) => summary.seatP50Ms[a]! - summary.seatP50Ms[b]!
    || startSpeedRank(a) - startSpeedRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return Object.freeze([...timed, ...START_SEAT_SPEED_ORDER.filter((model) => !timed.includes(model))]);
}

/** Arm S's wall time: each card's calls from the first one's start to the last one's end, added up. */
function openingsStartWallSeconds(calls: readonly OpeningsCall[]): number {
  const spans = new Map<string, { from: number; to: number }>();
  for (const call of calls) {
    const key = `${call.questionId}|${call.plan ?? ""}`;
    const span = spans.get(key) ?? { from: Date.parse(call.startedAt), to: Date.parse(call.finishedAt) };
    spans.set(key, { from: Math.min(span.from, Date.parse(call.startedAt)), to: Math.max(span.to, Date.parse(call.finishedAt)) });
  }
  return Math.round([...spans.values()].reduce((sum, span) => sum + (span.to - span.from), 0) / 1_000);
}

/**
 * Review (Task 91 Step 4; decision record: "only one or two companies' lists may be in" at the first card): the companies
 * whose lists were in by the cut on one card, sorted. Every list is asked at the same moment and taken in as it arrives,
 * so the `listsIn` seats with the shortest list times are the ones in by the cut (a tie in seat order; a seat with no
 * list has no time). A "#2" seat is its company's, so a company counts once.
 */
function startCompaniesInByCut(card: OpeningsStartCardLine, makerOf: (model: string) => string): readonly string[] {
  const timed = card.seatMs.flatMap((seat, at) => (seat.ms === null ? [] : [{ model: startModelOfSeat(seat.model), ms: seat.ms, at }]));
  const inByCut = timed.sort((a, b) => a.ms - b.ms || a.at - b.at).slice(0, card.listsIn);
  return [...new Set(inByCut.map((seat) => makerOf(seat.model)))].sort();
}

/** report.json's `startStep` (arm S): the summary, the seat order it suggests, the card lines and the cost of each plan. */
function openingsStartStepBlock(cards: readonly OpeningsStartCardLine[], calls: readonly OpeningsCall[],
  nano: (rows: readonly OpeningsCall[]) => bigint) {
  const summary = startStepSummary(cards);
  const perPlan = <T>(pick: (plan: OpeningsStartPlan) => T): Readonly<Record<OpeningsStartPlan, T>> =>
    Object.freeze(Object.fromEntries(OPENINGS_START_PLANS.map((plan) => [plan, pick(plan)])) as Record<OpeningsStartPlan, T>);
  // A model's company as its calls name it, else as the reviewed preview rows do, else the model itself.
  const makers = new Map(calls.map((call) => [call.model, call.maker] as const));
  const makerOf = (model: string): string => makers.get(model) ?? previewModelRow(model)?.maker ?? model;
  return Object.freeze({ summary, seatOrder: startSeatOrderOf(summary),
    cardsByPlan: perPlan((plan) => cards.filter((card) => card.plan === plan).length),
    // Per plan, over the shown cards: how many companies had a list in by the cut (p50), and on how many cards each did.
    companiesInByPlan: perPlan((plan) => {
      const each = cards.filter((card) => card.plan === plan && card.listsIn > 0).map((card) => startCompaniesInByCut(card, makerOf));
      const cardsOf = openingsCount(each.flat());
      return Object.freeze({ p50: percentile(each.map((companies) => companies.length), 50),
        cards: Object.freeze(Object.fromEntries(Object.keys(cardsOf).sort().map((maker) => [maker, cardsOf[maker]!]))) });
    }),
    costUsdByPlan: perPlan((plan) => usd(nano(calls.filter((call) => call.plan === plan)))) });
}

/**
 * report.json's `clarify` (arm Q, Task 91c): the readings, their summary, the three values they propose (clarifyWaitProposal; the
 * owner applies them, never code), the NONE readings by code, and the arm's money in a run of arm Q alone, where every gate line is
 * its own (each priced as the call lines are, from the gate's own usage). Beside other arms the gate lines are shared: null.
 */
function openingsClarifyBlock(times: readonly OpeningsClarifyLine[], ownWire: readonly PracticeWireEvent[] | null) {
  const summary = clarifySummary(times);
  return Object.freeze({ readings: times.length, summary, proposal: clarifyWaitProposal(summary),
    noneCodes: openingsCount(times.flatMap((line) => (line.source === "NONE" ? [line.code ?? "UNKNOWN"] : []))),
    costUsd: ownWire === null ? null
      : usd(ownWire.reduce((sum, event) => sum + BigInt(practiceWireUsage(event.model, [event]).costNanoUsd ?? "0"), 0n)) });
}

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
  // Task 91 (arm S): the start step's cards; one with no list by the cut was not shown (NOT_PROVEN, START_NO_CARD).
  const cards = lines.flatMap((line) => (line.kind === "START_CARD" ? [line] : []));
  // Task 91c (arm Q): the clarifying call's readings. Arm Q asks only the clarifying call's own model, so a run of arm Q alone
  // leaves none of the other arms' AIs "not exercised", has no per-arm row, and owns every gate line.
  const clarifyTimes = lines.flatMap((line) => (line.kind === "CLARIFY_TIME" ? [line] : []));
  const callArms = start.arms.filter((arm) => arm !== "Q");
  const busy = ending.busy;
  const tries = calls.filter((call) => call.attempts.length > 0).map((call) => Object.freeze({ model: call.model, tries: call.attempts }));
  const callsByModel = practiceModelCalls(tries);
  const busyRuns = Object.fromEntries(busy.map((model) => {
    const mine = calls.filter((call) => call.model === model);
    const answered = mine.filter(openingsAnswered).length;
    return [model, Object.freeze({ answered, skipped: mine.length - answered })];
  }));
  const answeredModels = new Set(calls.filter(openingsAnswered).map((call) => call.model));
  // Ruling R3-T17a.4: an arm that ended on a practice refusal (its PRACTICE_REFUSED note) makes the run NOT_PROVEN.
  const armsRefused = armLines.flatMap((line) => line.notes.flatMap((note) => (note.note === "PRACTICE_REFUSED"
    ? [Object.freeze({ arm: line.arm, questionId: line.questionId, code: note.detail })] : [])));
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
    notExercisedModels: callArms.length === 0 ? [] : start.models.filter((model) => !answeredModels.has(model) && !busy.includes(model)),
    busyModels: busy,
    armsRefused: armsRefused.map((refused) => `${refused.arm}:${refused.questionId}:${refused.code}`),
    startNoCard: cards.filter((card) => card.listsIn === 0).map((card) => `${card.plan}:${card.questionId}`),
    clarifyNone: clarifyTimes.filter((line) => line.source === "NONE").map((line) => `${line.questionId}:${line.code ?? "UNKNOWN"}`),
    unbilledRefusals: GATES.reduce((sum, gate) => sum + ending.observer.summary(gate).unbilled, 0),
    p90ByModel: p90ByModel(calls.map((call) => ({ model: call.model, latencies: call.attempts.map((attempt) => attempt.latencyMs) })))
  });
  const nanoOf = (line: PracticeRemainingLine | null | undefined): bigint | null =>
    line === null || line === undefined ? null : BigInt(line.remainingNanoUsd);
  const nano = (rows: readonly OpeningsCall[]) => rows.reduce((sum, call) => sum + BigInt(call.costNanoUsd ?? "0"), 0n);
  const tokens = (rows: readonly OpeningsCall[], pick: (call: OpeningsCall) => number | null) =>
    rows.reduce((sum, call) => sum + (pick(call) ?? 0), 0);
  const byArm = callArms.map((arm) => {
    const mine = calls.filter((call) => call.arm === arm);
    const ownLines = armLines.filter((line) => line.arm === arm);
    // Arm S writes card lines, not arm lines: its questions are its cards' questions, its time its cards' calls'.
    const startArm = arm === "S";
    return Object.freeze({
      arm,
      questions: startArm ? new Set(cards.map((card) => card.questionId)).size : ownLines.length,
      calls: mine.length,
      statuses: openingsCount(mine.map((call) => call.status)),
      byStep: openingsCount(mine.map((call) => call.step)),
      inputTokens: tokens(mine, (call) => call.inputTokens),
      outputTokens: tokens(mine, (call) => call.outputTokens),
      reasoningTokens: tokens(mine, (call) => call.reasoningTokens),
      costUsd: usd(nano(mine)),
      wallSeconds: startArm ? openingsStartWallSeconds(mine)
        : Math.round(ownLines.reduce((sum, line) => sum + (Date.parse(line.finishedAt) - Date.parse(line.startedAt)), 0) / 1_000),
      unavailable: ownLines.filter((line) => line.outcome === "UNAVAILABLE").length,
      marks: openingsCount(ownLines.flatMap((line) => line.marks.map((mark) => mark.mark))),
      notes: openingsCount(ownLines.flatMap((line) => line.notes.map((note) => note.note)))
    });
  });
  const wording = practiceWordingRows(armLines);
  return Object.freeze({
    schema: PRACTICE_REPORT_SCHEMA, mode: "openings", dry: start.dry, ...verdict,
    startedAt: start.startedAt, finishedAt: ending.finishedAt.toISOString(),
    wallSeconds: Math.round((ending.finishedAt.getTime() - Date.parse(start.startedAt)) / 1_000),
    models: start.models, questions: start.questions, questionDigests: start.questionDigests, arms: start.arms, busyModels: busy,
    callsByModel, repairKindsByModel: practiceRepairKindsByModel(tries),
    byArm,
    // Ruling R3-T17a.4 (N3): each refused arm with its refusal's code (report.md lists them under the per-arm table).
    ...(armsRefused.length === 0 ? {} : { armsRefused }),
    // Task 17a (D5): wording N's comparison, only when an engine-2 arm ran (the debated answers word for word are for the
    // owner's reading; report.md prints counts only).
    ...(wording.length === 0 ? {} : { wording, wordingTotals: practiceWordingTotals(wording) }),
    // Task 91 (arm S), only when it ran: the waits per plan, each model's list time, the seat order they suggest, and the
    // cost per plan (here and in the call lines only; a card line never holds one).
    ...(cards.length === 0 ? {} : { startStep: openingsStartStepBlock(cards, calls.filter((call) => call.arm === "S"), nano) }),
    // Task 91c (arm Q), only when it ran: the clarifying call's times, the three values they propose, and (arm Q alone) its money.
    ...(clarifyTimes.length === 0 ? {} : { clarify: openingsClarifyBlock(clarifyTimes,
      callArms.length === 0 ? lines.flatMap((line) => (line.kind === "wire" ? [line.event] : [])) : null) }),
    gates: Object.fromEntries(GATES.map((gate) => [gate, Object.freeze({ observed: ending.observer.summary(gate),
      remainingBefore: start.remainingBefore[gate], remainingAfter: after?.[gate] ?? null,
      // The formats report's own check (report.md prints it per gate): the gate's count before less after.
      spentUsdByRemaining: spentUsdByRemaining(nanoOf(start.remainingBefore[gate]), nanoOf(after?.[gate])) })])),
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
