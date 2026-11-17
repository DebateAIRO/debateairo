/**
 * THE COST READ-OUT: where the money for AI calls went, step by step.
 *
 * Plain words: every charge for an AI call or a web search is one row of the spend ledger (`ledger.model_spend`). This
 * file adds those rows up, for a span of days or for one run, four ways: by the step of the flow that spent them, by
 * the job the model picker chooses a model for, by the model that was called, and by run. It also says how much of
 * the input the vendor had already seen and billed at its cheaper rate, because that is the first number a change to
 * the prompts can move. It only reads. The owner's command `pnpm ops:cost-readout` prints what it builds.
 *
 * A step is named from what the ledger already records about a call. A charge outside a debate is named by its source
 * (the story, a dig's rewrite, a check before Start). A charge inside one is named by the family of its call site
 * (`PANEL`, `JUDGE:review`, `WEB:read1`). The words beside each code are for the reader. A code this file has no
 * words for is printed as it is, so a new kind of call is never hidden and never folded into another line.
 */
import type { Pool } from "pg";
import {
  SEAT_SUFFIX,
  TypedDomainError,
  debateRoleFromCallSiteKey,
  firstCheckerKeyOfBackup,
  isDebateRole
} from "@debateai/kernel";
import { isWebSearchProviderRef } from "./web-charge.js";

/** One group of charges as the database adds them up. Codes, names and counts only: nothing a person or a model wrote. */
export interface CostReadoutGroup {
  readonly spendSource: string;
  readonly modelRole: string | null;
  readonly callSiteKey: string | null;
  readonly providerRef: string;
  readonly maker: string | null;
  readonly modelId: string | null;
  readonly charges: number;
  readonly chargeMicros: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** The input tokens the vendor reported as already seen, over the charges that reported a count at all. */
  readonly cachedInputTokens: number;
  /** How many of the charges came with that report. For the others the count is unknown, which is not zero. */
  readonly cachedReportedCharges: number;
}

export interface CostReadoutRunLine {
  readonly runId: string;
  readonly chargeMicros: number;
  readonly charges: number;
}

/** The runs of a span of days: how many were charged, what a usual one and a dear one cost, and the dearest. */
export interface CostReadoutRuns {
  readonly count: number;
  readonly medianMicros: number | null;
  readonly ninetiethMicros: number | null;
  readonly dearest: readonly CostReadoutRunLine[];
}

export type CostReadoutScope =
  | Readonly<{ kind: "DAYS"; from: string; to: string }>
  | Readonly<{ kind: "RUN"; runId: string }>;

export interface CostReadoutTotals {
  readonly charges: number;
  readonly chargeMicros: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly cachedReportedCharges: number;
}

/** One printed line: a step, a job or a model, with its code, the words for it when there are any, and its sums. */
export interface CostReadoutLine extends CostReadoutTotals {
  readonly code: string;
  readonly words: string | null;
}

export interface CostReadout {
  readonly scope: CostReadoutScope;
  readonly total: CostReadoutTotals;
  readonly steps: readonly CostReadoutLine[];
  readonly jobs: readonly CostReadoutLine[];
  readonly models: readonly CostReadoutLine[];
  /** Null for one run's read-out: a run is not compared with itself. */
  readonly runs: CostReadoutRuns | null;
}

/** A web search is charged a flat price and has no call site, so it gets a step of its own. */
export const COST_STEP_WEB_SEARCH = "WEB_SEARCH" as const;
/** A charge inside a debate whose call the ledger does not record. Printed, never dropped, so the total still adds up. */
export const COST_STEP_RUN_WITHOUT_CALL = "RUN" as const;
/** A call that is none of the seven jobs: web reading, the story, the checks around a debate. */
export const COST_JOB_NONE = "NO_JOB" as const;

/** A segment that names a part of the flow (`review`, `read1`, `SYNTHESIZER`), not a position in it (`2`, `0->1`). */
const NAMED_SEGMENT = /^[A-Za-z][A-Za-z0-9_-]*$/u;

/**
 * The family of a call site: its key without the indexes that tell one call of a step from the next.
 * `JUDGE:defender:root0:r0:p0` and `JUDGE:defender:root1:r2:p3` are both `JUDGE:defender`. A seat's suffix and a backup
 * checker's suffix are dropped first: a second seat's call and a backup checker's call belong to the same step.
 * A panel key carries its author's own key after the word (`PANEL:JUDGE:critic:...`), so only the word names the step.
 */
export function callSiteFamily(callSiteKey: string): string {
  const key = (firstCheckerKeyOfBackup(callSiteKey) ?? callSiteKey).replace(SEAT_SUFFIX, "");
  const [head = "", second] = key.split(":");
  if (head === "PANEL" || second === undefined || !NAMED_SEGMENT.test(second)) return head;
  return `${head}:${second}`;
}

/**
 * The step a group of charges belongs to. Inside a debate the call site's family is the step. Outside it the source
 * is the step, and the call site adds which part of it was paid for (its writer, its checker); a call site from another
 * family is printed after the source, so nothing is renamed.
 */
export function costStepCode(group: Pick<CostReadoutGroup, "spendSource" | "callSiteKey" | "providerRef">): string {
  if (isWebSearchProviderRef(group.providerRef)) return COST_STEP_WEB_SEARCH;
  const family = group.callSiteKey === null || group.callSiteKey === "" ? null : callSiteFamily(group.callSiteKey);
  if (group.spendSource === "RUN") return family ?? COST_STEP_RUN_WITHOUT_CALL;
  if (family === null) return group.spendSource;
  return family === group.spendSource || family.startsWith(`${group.spendSource}:`) ? family : `${group.spendSource}/${family}`;
}

/** The job a group's calls did: the one the ledger recorded, else the one its call site names, else none of the seven. */
export function costJobCode(group: Pick<CostReadoutGroup, "modelRole" | "callSiteKey">): string {
  if (isDebateRole(group.modelRole)) return group.modelRole;
  return (group.callSiteKey === null ? null : debateRoleFromCallSiteKey(group.callSiteKey)) ?? COST_JOB_NONE;
}

/**
 * What each step is, in the reader's words. One entry for each code the engine produces today; a code that is not
 * here still gets its line, without words.
 */
export const COST_STEP_WORDS: Readonly<Record<string, string>> = Object.freeze({
  "JUDGE": "writing the positions",
  "JUDGE:root": "writing the positions",
  "JUDGE:defender": "points that support a position",
  "JUDGE:critic": "points that attack a position",
  "JUDGE:cross-root": "positions answering each other",
  "PANEL": "grading the points (the panel)",
  "JUDGE:review": "the second AI's check of each point",
  "VERDICT:judge": "the comparing judges",
  "VERDICT:investigate": "looking up a point nobody could assess",
  "STOPPING:round": "deciding whether another round is needed",
  "MAP:gap": "the gap round: points nobody raised",
  "MAP:gap-paths": "the gap round: paths nobody raised",
  "WEB:plan": "planning the web search",
  "WEB:read1": "reading the pages found (reader 1)",
  "WEB:pick": "picking the best pages",
  "WEB:read-top": "reading the best pages again (readers 2 and 3)",
  "WEB_RESEARCHED:read1": "reading a page a person added (reader 1)",
  "WEB_RESEARCHED:read-top": "reading a page a person added (readers 2 and 3)",
  [COST_STEP_WEB_SEARCH]: "web searches, a flat price each",
  "PATH_OUTCOME:WRITER": "writing each path's answer so far",
  "PATH_OUTCOME:CHECKER": "checking each path's answer so far",
  "COMPOSER:SYNTHESIZER": "writing the main answer",
  "POST_COMPOSE_R9:EVALUATOR": "checking the main answer",
  "REPAIR:STRUCTURE": "putting a broken reply back into its form",
  [COST_STEP_RUN_WITHOUT_CALL]: "inside a debate, with no call on record",
  // A call that was sent and never answered is charged under a source of its own, with no call on record.
  "RUN_UNANSWERED": "inside a debate, a call sent and never answered",
  "STORY": "the story",
  "STORY:STORYTELLER": "writing the story",
  "STORY:CHECKER": "checking the story",
  "STORY:CHARTS": "choosing the charts",
  "STORY_UNANSWERED": "the story, a call sent and never answered",
  "PATH_REWRITE": "a dig: rewriting its path",
  "PATH_REWRITE:WRITER": "a dig: rewriting its path",
  "PATH_REWRITE:CHECKER": "a dig: checking the rewrite",
  "PATH_REWRITE:SUGGEST": "a dig: suggesting what to dig next",
  "PATH_CLIMB": "a dig: rewriting the levels above it",
  "PATH_CLIMB:WRITER": "a dig: rewriting the levels above it",
  "PATH_CLIMB:CHECKER": "a dig: checking the rewritten levels above it",
  "ANSWER_UPDATE": "a dig: updating the main answer",
  "ANSWER_UPDATE:ANSWER": "a dig: updating the main answer",
  "ANSWER_UPDATE:ANSWER_ASKED": "a dig: updating the main answer, with the paths its writer asked for",
  "ANSWER_UPDATE:ANSWER_CHECK": "a dig: checking the updated main answer",
  "INVESTIGATION_REPORT": "the final report of an investigation",
  "INVESTIGATION_REPORT:ANSWER": "the final report: writing its answer",
  "INVESTIGATION_REPORT:ANSWER_ASKED": "the final report: writing its answer, with the paths its writer asked for",
  "INVESTIGATION_REPORT:ANSWER_CHECK": "the final report: checking its answer",
  "INVESTIGATION_REPORT:STORY": "the final report: writing its story",
  "INVESTIGATION_REPORT:STORY_CHECK": "the final report: checking its story",
  "CONTRIBUTION_CHECK": "checking a public contribution",
  "CONTRIBUTION_CHECK:CHECKER": "checking a public contribution",
  "PUBLIC_REPORT": "a report asked for on a public debate",
  "PUBLIC_REPORT:ANSWER": "a public debate's report: writing its answer",
  "PUBLIC_REPORT:ANSWER_ASKED": "a public debate's report: writing its answer, with the paths its writer asked for",
  "PUBLIC_REPORT:ANSWER_CHECK": "a public debate's report: checking its answer",
  "PUBLIC_REPORT:STORY": "a public debate's report: writing its story",
  "PUBLIC_REPORT:STORY_CHECK": "a public debate's report: checking its story",
  "SYNTHESIS_CHECK": "the safety check of an answer",
  "LANGUAGE_CHECK": "the language check before a debate",
  "QUESTION_CHECK": "the safety check of a question",
  "ASK_CLARIFY": "the clarifying questions before a debate",
  "PRE_START": "suggesting paths before Start",
  "SUPPORT": "the help chat"
});

/** The seven jobs in the reader's words, and the line for every call that is none of them. */
export const COST_JOB_WORDS: Readonly<Record<string, string>> = Object.freeze({
  POSITION: "writing a position",
  SUPPORT_ATTACK: "writing a point for or against",
  CROSS_EXCHANGE: "answering another position",
  JUDGE: "grading a point",
  REVIEWER: "checking a point as the second AI",
  ANSWER_WRITER: "writing an answer",
  ANSWER_CHECKER: "checking an answer",
  [COST_JOB_NONE]: "none of the seven jobs"
});

function stepWords(code: string): string | null {
  const whole = COST_STEP_WORDS[code];
  if (whole !== undefined) return whole;
  const [source, family] = code.split("/", 2);
  if (family === undefined || source === undefined) return null;
  const sourceWords = COST_STEP_WORDS[source];
  return sourceWords === undefined ? null : `${sourceWords}, at ${COST_STEP_WORDS[family] ?? family}`;
}

const SUMMED = ["charges", "chargeMicros", "inputTokens", "outputTokens", "cachedInputTokens", "cachedReportedCharges"] as const;

function assertCount(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypedDomainError("COST_READOUT_ROW_INVALID", `${name} must be a whole number that is not negative`);
  }
}

function addUp(lines: Iterable<CostReadoutTotals>): CostReadoutTotals {
  const total = { charges: 0, chargeMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cachedReportedCharges: 0 };
  for (const line of lines) for (const field of SUMMED) total[field] += line[field];
  for (const field of SUMMED) assertCount(total[field], field);
  return Object.freeze(total);
}

/** Dearest first; lines of the same cost in the order of their codes, so two read-outs of the same rows print the same. */
function linesBy(
  groups: readonly CostReadoutGroup[],
  codeOf: (group: CostReadoutGroup) => string,
  wordsOf: (code: string, group: CostReadoutGroup) => string | null
): readonly CostReadoutLine[] {
  const byCode = new Map<string, { words: string | null; groups: CostReadoutGroup[] }>();
  for (const group of groups) {
    const code = codeOf(group);
    const known = byCode.get(code);
    if (known === undefined) byCode.set(code, { words: wordsOf(code, group), groups: [group] });
    else known.groups.push(group);
  }
  return Object.freeze([...byCode].map(([code, entry]) => Object.freeze({ code, words: entry.words, ...addUp(entry.groups) }))
    .sort((left, right) => right.chargeMicros - left.chargeMicros || (left.code < right.code ? -1 : left.code > right.code ? 1 : 0)));
}

/** The model a group was charged for: its own id when the call is on record, else the name the charge was booked under. */
function modelCode(group: CostReadoutGroup): string {
  return group.modelId ?? group.providerRef;
}

/** The read-out of a set of groups. Every line is a sum over the groups handed in, so the lines of a table add up to the total. */
export function buildCostReadout(input: Readonly<{
  scope: CostReadoutScope;
  groups: readonly CostReadoutGroup[];
  runs: CostReadoutRuns | null;
}>): CostReadout {
  for (const group of input.groups) {
    for (const field of SUMMED) assertCount(group[field], field);
    if (group.cachedReportedCharges > group.charges) {
      throw new TypedDomainError("COST_READOUT_ROW_INVALID", "More charges report a cached count than there are charges");
    }
  }
  return Object.freeze({
    scope: input.scope,
    total: addUp(input.groups),
    steps: linesBy(input.groups, costStepCode, (code) => stepWords(code)),
    jobs: linesBy(input.groups, costJobCode, (code) => COST_JOB_WORDS[code] ?? null),
    models: linesBy(input.groups, modelCode, (_code, group) => group.maker),
    runs: input.runs
  });
}

const whole = (value: number): string => value.toLocaleString("en-US");
const chargesOf = (value: number): string => `${whole(value)} ${value === 1 ? "charge" : "charges"}`;

/** USD micro-units as dollars: two decimals from a dollar up, four below it, so a cheap step does not print as $0.00. */
export function costReadoutDollars(micros: number): string {
  const dollars = micros / 1_000_000;
  return `$${dollars.toLocaleString("en-US", micros >= 1_000_000 || micros === 0
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function share(part: number, of: number): string {
  return of === 0 ? "-" : `${(part / of * 100).toFixed(1)}%`;
}

const COLUMNS = ["charges", "cost", "share", "input", "seen before", "output"] as const;

function table(title: string, lines: readonly CostReadoutLine[], total: CostReadoutTotals): readonly string[] {
  if (lines.length === 0) return [];
  const names = lines.map((line) => line.words === null ? line.code : `${line.words} [${line.code}]`);
  const cells = lines.map((line) => [
    whole(line.charges), costReadoutDollars(line.chargeMicros), share(line.chargeMicros, total.chargeMicros),
    whole(line.inputTokens), line.cachedReportedCharges === 0 ? "unknown" : whole(line.cachedInputTokens), whole(line.outputTokens)
  ]);
  const nameWidth = Math.max(title.length, ...names.map((name) => name.length));
  const widths = COLUMNS.map((column, index) => Math.max(column.length, ...cells.map((row) => row[index]!.length)));
  const row = (name: string, values: readonly string[]): string =>
    `${name.padEnd(nameWidth)}  ${values.map((value, index) => value.padStart(widths[index]!)).join("  ")}`;
  return ["", row(title, COLUMNS), ...lines.map((_line, index) => row(names[index]!, cells[index]!))];
}

/**
 * The read-out as text, for a terminal. Numbers, codes and model names only. "Seen before" is the input the vendor
 * reported as already seen and billed at its cheaper rate; where no call of a line reported it, the cell says unknown.
 */
export function renderCostReadout(readout: CostReadout): string {
  const { scope, total, runs } = readout;
  const lines: string[] = [scope.kind === "DAYS"
    ? `cost read-out: ${scope.from} to ${scope.to}, by the UTC day of each charge`
    : `cost read-out: run ${scope.runId}, everything charged to it`];
  if (total.charges === 0) return `${[...lines, "no charge on record"].join("\n")}\n`;
  lines.push(
    `total: ${costReadoutDollars(total.chargeMicros)} in ${chargesOf(total.charges)}`,
    `input tokens: ${whole(total.inputTokens)}`,
    total.cachedReportedCharges === 0
      ? "  seen before by the vendor: unknown, no call reported it"
      : `  seen before by the vendor, and billed at its cheaper rate: at least ${whole(total.cachedInputTokens)} (${share(total.cachedInputTokens, total.inputTokens)})`,
    ...(total.cachedReportedCharges === 0 ? [] : [
      `  reported for ${whole(total.cachedReportedCharges)} of the ${chargesOf(total.charges)}; for the rest it is unknown, which is not zero`
    ]),
    `output tokens: ${whole(total.outputTokens)}`
  );
  if (runs !== null) {
    lines.push(`runs with a charge: ${whole(runs.count)} (a run is one debate or one dig)`);
    if (runs.medianMicros !== null && runs.ninetiethMicros !== null) {
      lines.push(`  half of them cost ${costReadoutDollars(runs.medianMicros)} or less; one in ten cost more than ${costReadoutDollars(runs.ninetiethMicros)}`);
    }
  }
  lines.push(
    ...table("by step", readout.steps, total),
    ...table("by job (the seven the model picker chooses for)", readout.jobs, total),
    ...table("by model", readout.models, total)
  );
  if (runs !== null && runs.dearest.length > 0) {
    lines.push("", `the ${String(runs.dearest.length)} dearest runs`,
      ...runs.dearest.map((run) => `  ${run.runId}  ${costReadoutDollars(run.chargeMicros)}  ${chargesOf(run.charges)}`));
  }
  return `${lines.join("\n")}\n`;
}

const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/u;
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** The longest span one read-out covers: a year and a day, so a leap year still fits. */
export const COST_READOUT_MAX_DAYS = 366 as const;
const DAY_MS = 86_400_000;

function dayStart(day: string): number {
  const at = DAY_TEXT.test(day) ? Date.parse(`${day}T00:00:00.000Z`) : Number.NaN;
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== day) {
    throw new TypedDomainError("COST_READOUT_SPAN_INVALID", "A day is written YYYY-MM-DD and must exist");
  }
  return at;
}

/** A span of UTC days, both ends counted. Refused when a day does not exist, the end is before the start, or it is too long. */
export function costReadoutSpan(from: string, to: string): Readonly<{ kind: "DAYS"; from: string; to: string }> {
  const days = (dayStart(to) - dayStart(from)) / DAY_MS + 1;
  if (days < 1 || days > COST_READOUT_MAX_DAYS) {
    throw new TypedDomainError("COST_READOUT_SPAN_INVALID", "A span is one day to 366 days, and ends on or after the day it starts");
  }
  return Object.freeze({ kind: "DAYS", from, to });
}

/** The last `days` UTC days, today included. */
export function costReadoutLastDays(days: number, now: Date): Readonly<{ kind: "DAYS"; from: string; to: string }> {
  if (!Number.isSafeInteger(days) || days < 1 || days > COST_READOUT_MAX_DAYS) {
    throw new TypedDomainError("COST_READOUT_SPAN_INVALID", "A span is one day to 366 days");
  }
  const to = now.toISOString().slice(0, 10);
  return costReadoutSpan(new Date(dayStart(to) - (days - 1) * DAY_MS).toISOString().slice(0, 10), to);
}

type GroupRow = Readonly<{
  spend_source: string; model_role: string | null; call_site_key: string | null; provider_ref: string;
  maker: string | null; model_id: string | null; charges: string; charge_micros: string; input_tokens: string;
  output_tokens: string; cached_input_tokens: string; cached_reported_charges: string;
}>;

function count(text: string | null | undefined, name: string): number {
  const value = Number(text);
  if (text === null || text === undefined || text === "" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypedDomainError("COST_READOUT_ROW_INVALID", `${name} is not a whole number`);
  }
  return value;
}

/** A percentile of whole micro-units comes back with a fraction when it falls between two runs; the nearer whole unit is printed. */
function rounded(text: string | null): number | null {
  if (text === null) return null;
  const value = Math.round(Number(text));
  if (!Number.isSafeInteger(value) || value < 0) throw new TypedDomainError("COST_READOUT_ROW_INVALID", "A run's cost is not a number");
  return value;
}

/**
 * The charges of a selection, added up by everything the read-out groups on.
 *
 * `spend` is the selection. `by_call` adds up the charges of one call first, so a call charged in two rows brings its
 * cached count once. `calls` finds each charged call's record: its job, its call site and its stored reply. It reads
 * the ledger's entries once and matches them by call, never once per charge. A review's call site carries the id of
 * the point it reviewed; the id is replaced by `#`, so a week's reviews are one group and not one per point. A reply's
 * cached count is taken only for a charge booked under the reply's own provider.
 */
function groupsSql(selection: "DAYS" | "RUN"): string {
  return `
WITH spend AS (
  SELECT s.spend_source, s.run_id, s.provider_ref, s.attempt_id, s.charge_micros, s.input_tokens, s.output_tokens
    FROM ledger.model_spend s
   WHERE ${selection === "DAYS" ? "s.charged_on BETWEEN $1::date AND $2::date" : "s.run_id = $1::uuid"}
), by_call AS (
  SELECT spend_source, run_id, provider_ref, attempt_id, count(*) AS charges, sum(charge_micros) AS charge_micros,
         sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens
    FROM spend
   GROUP BY spend_source, run_id, provider_ref, attempt_id
), calls AS (
  SELECT DISTINCT ON (e.attempt_id) e.attempt_id, e.model_role, e.call_site_key, e.raw_artifact_ref
    FROM ledger.ledger_entry e
   WHERE e.action_kind = 'MODEL_CALL'
     AND e.attempt_id IN (SELECT attempt_id FROM spend WHERE attempt_id IS NOT NULL)
   ORDER BY e.attempt_id, e.sequence DESC
)
SELECT b.spend_source, c.model_role,
       regexp_replace(c.call_site_key, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '#', 'gi') AS call_site_key,
       b.provider_ref, a.maker, a.model_id,
       sum(b.charges)::text AS charges, sum(b.charge_micros)::text AS charge_micros,
       sum(b.input_tokens)::text AS input_tokens, sum(b.output_tokens)::text AS output_tokens,
       coalesce(sum(a.cached_input_tokens), 0)::text AS cached_input_tokens,
       coalesce(sum(b.charges) FILTER (WHERE a.cached_input_tokens IS NOT NULL), 0)::text AS cached_reported_charges
  FROM by_call b
  LEFT JOIN calls c ON c.attempt_id = b.attempt_id
  LEFT JOIN ledger.raw_artifact a ON a.raw_artifact_id = c.raw_artifact_ref AND a.provider_ref = b.provider_ref
 GROUP BY 1, 2, 3, 4, 5, 6`;
}

const RUNS_SQL = `
WITH per_run AS (
  SELECT s.run_id, sum(s.charge_micros) AS charge_micros, count(*) AS charges
    FROM ledger.model_spend s
   WHERE s.charged_on BETWEEN $1::date AND $2::date AND s.run_id IS NOT NULL
   GROUP BY s.run_id
)
SELECT (SELECT count(*) FROM per_run)::text AS runs,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY charge_micros::double precision) FROM per_run)::text AS median_micros,
       (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY charge_micros::double precision) FROM per_run)::text AS ninetieth_micros,
       d.run_id::text AS run_id, d.charge_micros::text AS charge_micros, d.charges::text AS charges
  FROM (SELECT 1) one
  LEFT JOIN LATERAL (SELECT * FROM per_run ORDER BY charge_micros DESC, run_id LIMIT $3) d ON true`;

function groupsOf(rows: readonly GroupRow[]): readonly CostReadoutGroup[] {
  return rows.map((row) => Object.freeze({
    spendSource: row.spend_source, modelRole: row.model_role, callSiteKey: row.call_site_key, providerRef: row.provider_ref,
    maker: row.maker, modelId: row.model_id,
    charges: count(row.charges, "charges"), chargeMicros: count(row.charge_micros, "charge_micros"),
    inputTokens: count(row.input_tokens, "input_tokens"), outputTokens: count(row.output_tokens, "output_tokens"),
    cachedInputTokens: count(row.cached_input_tokens, "cached_input_tokens"),
    cachedReportedCharges: count(row.cached_reported_charges, "cached_reported_charges")
  }));
}

/** How many of a span's dearest runs the read-out lists. */
export const COST_READOUT_DEAREST_RUNS = 10 as const;

/** Reads the spend ledger for the read-out. Read-only; the command opens it on a connection that can only read. */
export class PostgresCostReadoutReader {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  /** Every charge whose day falls in the span, and the span's runs. */
  async readDays(span: Readonly<{ from: string; to: string }>): Promise<CostReadout> {
    const scope = costReadoutSpan(span.from, span.to);
    const groups = await this.pool.query<GroupRow>(groupsSql("DAYS"), [scope.from, scope.to]);
    const runs = await this.pool.query<{
      runs: string; median_micros: string | null; ninetieth_micros: string | null;
      run_id: string | null; charge_micros: string | null; charges: string | null;
    }>(RUNS_SQL, [scope.from, scope.to, COST_READOUT_DEAREST_RUNS]);
    const first = runs.rows[0];
    return buildCostReadout({
      scope,
      groups: groupsOf(groups.rows),
      runs: Object.freeze({
        count: count(first?.runs, "runs"),
        medianMicros: rounded(first?.median_micros ?? null),
        ninetiethMicros: rounded(first?.ninetieth_micros ?? null),
        dearest: Object.freeze(runs.rows.filter((row) => row.run_id !== null).map((row) => Object.freeze({
          runId: row.run_id!, chargeMicros: count(row.charge_micros, "charge_micros"), charges: count(row.charges, "charges")
        })))
      })
    });
  }

  /** Everything charged to one run, on whatever day. Null when nothing was. */
  async readRun(runId: string): Promise<CostReadout | null> {
    if (!UUID_TEXT.test(runId)) throw new TypedDomainError("COST_READOUT_RUN_INVALID", "A run is named by its id");
    const groups = groupsOf((await this.pool.query<GroupRow>(groupsSql("RUN"), [runId])).rows);
    return groups.length === 0 ? null : buildCostReadout({ scope: Object.freeze({ kind: "RUN", runId: runId.toLowerCase() }), groups, runs: null });
  }
}
