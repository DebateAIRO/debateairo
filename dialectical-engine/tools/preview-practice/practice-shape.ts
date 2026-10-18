/**
 * Preview practice, mode "debate": the new debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md
 * §5 "Practice"; plan 2026-10-12-debate-shape-phase2d).
 *
 * Plain words: the shape is switched on by one register row, debateShapePolicy, and the live preview has none. So a
 * practice debate runs today's shape unless it is asked for the new one:
 *  - `--shape-policy FILE`: the row from FILE, checked by the register's own parser, is put into the practice's
 *    THROWAWAY register only (practice-register-import.ts publishPracticeOverrideVersion, one version with any
 *    `--length-policy` row); the export file is only read and the live register is never reached;
 *  - `--depth-mode`, `--scrutiny`, `--answer-length`: the practice ask's settings, as the /new page sends them.
 * The four flags are debate-only; a refused value is never repeated, a refused file is named only by where it is wrong.
 */
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import {
  AnswerLengthSchema,
  DepthModeSchema,
  ScrutinySchema,
  type AnswerLength,
  type DepthMode,
  type Scrutiny
} from "@debateai/contract";
import { debateShapeInForce, parseDebateShapePolicy, type DebateShapeCeilingInput, type DebateShapePolicy } from "@debateai/register";
import {
  MAP_MARKS, MAP_OPPOSITE_SEPARATORS, MAP_OPPOSITE_TEMPLATES, mapAnswersArgued, readMapChoiceForRun, readMapItemsForRun
} from "@debateai/map";
import { structureRepairOriginalKey } from "@debateai/providers";
import { PracticeRefusal } from "./practice-settings.js";
import { PRACTICE_MAP_STEPS, practiceMapStepOf, type PracticeMapStep } from "./practice-lanes.js";

export const PRACTICE_SHAPE_FLAGS = Object.freeze(["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"] as const);

/** The practice ask's settings, as given on the command line (a missing one is the site's default). */
export type PracticeShapeAsk = Readonly<{ depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength }>;
/** `policy`: the row --shape-policy puts into the throwaway register (null: none given). */
export type PracticeShapeOverride = Readonly<{ policy: DebateShapePolicy | null; ask: PracticeShapeAsk }>;

const POLICY_INVALID_PREFIX = "DEBATE_SHAPE_POLICY_INVALID:";

/** The file's text, read and checked by the register's own parser. A refusal names only the place that is wrong. */
function parsePracticeShapePolicyText(text: string): DebateShapePolicy {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", "$"); }
  let policy: DebateShapePolicy;
  try {
    policy = parseDebateShapePolicy(value);
  } catch (error) {
    const path = error instanceof TypeError && error.message.startsWith(POLICY_INVALID_PREFIX)
      ? error.message.slice(POLICY_INVALID_PREFIX.length) : "$";
    throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", path);
  }
  // P2b's rollback member: a row switched off is read as no row, so it could never run the new shape.
  if (!debateShapeInForce(policy)) throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_INVALID", "enabled");
  return policy;
}

/** One of a setting's fixed values; anything else is refused with the flag and its list, never the value typed. */
function oneOf<T extends string>(options: readonly T[], text: string, flag: string, list: string): T {
  if (!(options as readonly string[]).includes(text)) throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${flag} (${list})`);
  return text as T;
}

/**
 * The debate-shape flags of a command line: null when none is given (today's debate command, unchanged). Any of them
 * outside debate mode is refused. Read before anything starts, so a bad file or value can never start a paid run.
 */
export function practiceShapeOverrideFromArgs(mode: string, flags: ReadonlyMap<string, string>,
  read: (path: string) => string = (path) => readFileSync(path, "utf8")): PracticeShapeOverride | null {
  const given = PRACTICE_SHAPE_FLAGS.filter((flag) => flags.has(flag));
  if (given.length === 0) return null;
  if (mode !== "debate") throw new PracticeRefusal("PRACTICE_FLAG_VALUE_INVALID", `${given[0]!} (debate mode only)`);
  const path = flags.get("--shape-policy");
  let policy: DebateShapePolicy | null = null;
  if (path !== undefined) {
    let text: string;
    try { text = read(path); } catch { throw new PracticeRefusal("PRACTICE_SHAPE_POLICY_UNREADABLE"); }
    policy = parsePracticeShapePolicyText(text);
  }
  const ask: { depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength } = {};
  const depthMode = flags.get("--depth-mode");
  if (depthMode !== undefined) ask.depthMode = oneOf(DepthModeSchema.options, depthMode, "--depth-mode", "fixed or adaptive");
  const scrutiny = flags.get("--scrutiny");
  if (scrutiny !== undefined) ask.scrutiny = oneOf(ScrutinySchema.options, scrutiny, "--scrutiny", "standard, deep or exhaustive");
  const answerLength = flags.get("--answer-length");
  if (answerLength !== undefined) {
    ask.answerLength = oneOf(AnswerLengthSchema.options, answerLength, "--answer-length", "short, standard or detailed");
  }
  return Object.freeze({ policy, ask: Object.freeze(ask) });
}

/* ------------------------------------------------------------------ what the run did (report.json `shape`) */

/** FLAG: the row came from --shape-policy. REGISTER: the imported register held its own row. */
export type PracticeShapeSource = "FLAG" | "REGISTER";

/** The sizes the run was admitted with, frozen on its money receipt (envelope_basis.shape, P2a). */
export type PracticeShapeSizes = Readonly<{
  plan: string; depthMode: string; scrutiny: string; answerLength: string;
  mapAIs: number; answers: number; graders: number; pointsPerAnswer: number; deeperTopPoints: number; gapRounds: number;
  closeCallExtraGraders: number; opening: string;
}>;

/** What the practice read from the throwaway database after the debate (no model text). */
export type PracticeShapeFacts = Readonly<{
  /** core.run.depth_params as the ask path stored it. */
  storedDepthParams: Readonly<Record<string, unknown>> | null;
  sizes: PracticeShapeSizes | null;
  /**
   * Every condition mark on the served answer's latest version, by code (serve.condition_mark). Pre-flight PF-D13: a new
   * answer version copies its marks, so the marks are counted on one version only.
   */
  marks: Readonly<Record<string, number>>;
  /**
   * The map's stored choice (P2b): its opening (MAP, or TODAYS_OPENING when the map fell back; pre-flight PF-D12), how
   * many answers the run planned to argue and how many points were raised but not debated. Null: no map was stored.
   */
  choice: Readonly<{ opening: string; answers: number; alsoRaised: number }> | null;
  /** The run's map calls in ledger order, every try. */
  mapCallSiteKeys: readonly string[];
  /** Engine 2 (R3): the answer check's codes (core.map_answer_check), null without one (engine 1). */
  answerCheckCodes: readonly string[] | null;
  /** Engine 2 (R3, D1): how many answers the checker exempted from the third test (its own null); null without a check. */
  checkPremiseExempt: number | null;
  /** Engine 2 (R3, D1): the chooser's assumptions per debated answer (counts only), in root order; null without a check. */
  assumptionsPerAnswer: readonly number[] | null;
  /**
   * Engine 2 (R3; carried from Tasks 7 and 8, PF-R33.13): how many answers the run DEBATED that are the code's TEMPLATE
   * fill (`practiceTemplateFillsDebated`); absent without a check (engine 1) or a stored choice.
   */
  templateFillsDebated?: number;
}>;

/**
 * What the debate-shape row did in the version the debate ran on: ADDED (the export had none), REPLACED (the export's
 * own was superseded), UNCHANGED (`--register-next` only: the code's next version carries the export's row byte for byte).
 */
export type PracticeShapeRowChange = "ADDED" | "REPLACED" | "UNCHANGED";

export type PracticeShapeBlock = Readonly<{
  source: PracticeShapeSource;
  /** The throwaway register version the debate ran on. */
  registerVersion: string;
  /** FLAG only: ADDED, REPLACED or UNCHANGED; null for REGISTER. */
  row: PracticeShapeRowChange | null;
  /** The three settings as given on the command line (null: the site's default). */
  asked: Readonly<{ depthMode: string | null; scrutiny: string | null; answerLength: string | null }>;
  storedDepthParams: Readonly<Record<string, unknown>> | null;
  sizes: PracticeShapeSizes | null;
  /**
   * The opening used: the receipt's; TODAYS_OPENING when the map was unavailable or gave fewer than two answers to argue
   * (ruling C-TWO, controller ruling D-NOTARGUED); null when nothing ran or no map was stored.
   */
  opening: string | null;
  /** The map's marks (spec §1.2) found on the answer, with how often. */
  mapMarks: Readonly<Record<string, number>>;
  chosenAnswers: number | null;
  alsoRaised: number | null;
  /** PANEL-CLOSE-CALL-EXTENDED marks: one per node (point) whose close call called for extra graders (P2b; kept when one then failed). */
  panelCloseCallExtensions: number;
  /** SCRUTINY-EXTENDED marks: one per scrutinised node, i.e. the points scrutiny examined further (P2b), not extra exchanges. */
  scrutinyExtensions: number;
  mapCallsByStep: Readonly<Record<PracticeMapStep, number>>;
  /** Engine 2 (R3, INTERFACE §15.4, D1): the answer check, counted from its stored codes; null without a check (engine 1). */
  answerCheck: PracticeAnswerCheckBlock | null;
  /** R3 (INTERFACE §15.4): whether the merge and the choose fell back in this debate (0 or 1 each). */
  mapFallbacks: PracticeMapFallbacks;
  /** Why the new shape did not run (the verdict's SHAPE_NOT_EXERCISED reason); null when it ran or nothing was admitted. */
  notExercised: string | null;
}>;

/**
 * P2b's map choice as the practice counts it (structurally P2b's `MapChoiceRecord`, packages/map/src/repository.ts).
 * Engine 2 (R3): an answer may carry the chooser's `assumptions` (Task 11's `MapChoiceAnswerRecord.assumptions?`); its
 * `statement` and `filled` are read only to count the code's own TEMPLATE fills (`practiceTemplateFillsDebated`).
 */
export type PracticeMapChoice = Readonly<{ opening: string;
  answers: readonly Readonly<{ assumptions?: readonly unknown[] | undefined; statement?: string; filled?: boolean }>[];
  alsoRaised: readonly unknown[] }>;
export type PracticeMapReaders = Readonly<{
  choice(runId: string): Promise<PracticeMapChoice | null>;
  items(runId: string): Promise<readonly unknown[]>;
}>;

/** The ONE place the practice calls P2b's map readers (decrypted with the run's key, which lives only in this process). */
export function practiceMapReaders(pool: Pool): PracticeMapReaders {
  return Object.freeze({
    choice: (runId: string) => readMapChoiceForRun(pool, runId),
    items: (runId: string) => readMapItemsForRun(pool, runId)
  });
}

/**
 * INTERFACE §15.4 (R3) and D1: the answer check, counted from its stored codes (core.map_answer_check) and the answer's
 * marks. Each of the three tests is counted on its own (an outcome names each failed test: `NOT_AN_ANSWER+NO_COST`);
 * `premiseExempt` is how many answers the checker itself exempted from the third test (its `null`), and
 * `assumptionsPerAnswer` one count per debated answer, in root order. Counts of the checker's and the chooser's verdicts
 * only: code judges none (G1). `premiseExempt` / `assumptionsPerAnswer` null: not read.
 * Carried into Task 17 (each present only when the caller read it): `emptyReasons`, the check's refused empty reasons
 * (`practiceCheckEmptyReasons`, Task 4), and `templateFillsDebated`, the code's TEMPLATE fills the run debated
 * (`practiceTemplateFillsDebated`, Tasks 7 and 8).
 */
export type PracticeAnswerCheckBlock = Readonly<{ checked: number; rejected: number; notAnAnswer: number; addedFact: number; noCost: number;
  premiseExempt: number | null; replaced: number; dropped: number; keptUnchecked: number; unavailable: number;
  assumptionsPerAnswer: readonly number[] | null; emptyReasons?: number; templateFillsDebated?: number }>;
export function practiceAnswerCheckBlock(codes: readonly string[] | null, marks: Readonly<Record<string, number>>,
  read: Readonly<{ premiseExempt: number | null; assumptionsPerAnswer: readonly number[] | null; emptyReasons?: number;
    templateFillsDebated?: number }>): PracticeAnswerCheckBlock | null {
  if (codes === null) return null;
  const tests = (code: string): readonly string[] => (code.split(":")[1] ?? "").split(">")[0]!.split("+");
  const action = (code: string) => code.split(">")[1] ?? null;
  const failing = (test: string) => codes.filter((code) => tests(code).includes(test)).length;
  return Object.freeze({
    checked: codes.filter((code) => !tests(code).includes("UNCHECKED")).length,
    rejected: codes.filter((code) => !tests(code).includes("UNCHECKED") && !tests(code).includes("PASSED")).length,
    notAnAnswer: failing("NOT_AN_ANSWER"),
    addedFact: failing("ADDED_FACT"),
    noCost: failing("NO_COST"),
    premiseExempt: read.premiseExempt,
    replaced: codes.filter((code) => /^c[1-4]$/u.test(action(code) ?? "")).length,
    dropped: codes.filter((code) => action(code) === "DROPPED").length,
    keptUnchecked: codes.filter((code) => action(code) === "KEPT").length,
    unavailable: marks.MAP_CHECK_UNAVAILABLE ?? 0,
    assumptionsPerAnswer: read.assumptionsPerAnswer === null ? null : Object.freeze([...read.assumptionsPerAnswer]),
    ...(read.emptyReasons === undefined ? {} : { emptyReasons: read.emptyReasons }),
    ...(read.templateFillsDebated === undefined ? {} : { templateFillsDebated: read.templateFillsDebated })
  });
}

/** INTERFACE §15.4 (R3): whether the merge and the choose fell back in this debate (0 or 1 each); rates are read over runs. */
export type PracticeMapFallbacks = Readonly<{ merge: number; choose: number }>;
export function practiceMapFallbacks(marks: Readonly<Record<string, number>>): PracticeMapFallbacks {
  return Object.freeze({ merge: Math.min(1, marks.MAP_MERGE_FALLBACK ?? 0), choose: Math.min(1, marks.MAP_CHOOSE_FALLBACK ?? 0) });
}

/** A refused try of the answer check, as the debate's call analysis lists it (`PracticeFailure`'s codes, no model text). */
export type PracticeCheckFailure = Readonly<{ callSiteKey: string; issues: readonly string[]; recheckIssues: readonly string[] }>;
/** An empty (or blank) check reason, as engine 2's check schema refuses it (`min(1)` after trimming): at `checks.<n>.reason`. */
const EMPTY_CHECK_REASON = /^too_small@checks\.\d+\.reason$/u;
/**
 * Carried from Task 4 (PF-R3-2.13): how many empty reasons (`"reason": ""`) the checker wrote, counted over every refused
 * try of `MAP:check` (its structure-repair tries included, LG-A), from the try's own stored issues, else its re-check.
 * A refused empty reason is re-asked, so this counts the slips, never an outcome. Codes only.
 */
export function practiceCheckEmptyReasons(failures: readonly PracticeCheckFailure[]): number {
  return failures.filter((failure) => structureRepairOriginalKey(failure.callSiteKey) === "MAP:check")
    .reduce((sum, failure) => sum + (failure.issues.length > 0 ? failure.issues : failure.recheckIssues)
      .filter((issue) => EMPTY_CHECK_REASON.test(issue)).length, 0);
}

/**
 * Carried from Tasks 7 and 8 (PF-R33.13): how many answers the run DEBATED that are the code's last-resort TEMPLATE fill
 * (ANSWERS_FILLED, detail TEMPLATE): a filled answer whose words are the code-owned template of a site locale
 * (`MAP_OPPOSITE_TEMPLATES`: its `lead` and separator before an answer, or its `empty` text alone). Fills DEBATED, not
 * fills MADE: the mark's detail is not stored (core.map_choice keeps the codes, serve.condition_mark `ANSWERS_FILLED:CHOOSE`),
 * and a TEMPLATE fill the check replaced holds the candidate's words with `filled: false`, so it is not counted here while
 * its ANSWERS_FILLED mark stays. Code recognising its own text: no judgment (G1).
 */
export function practiceTemplateFillsDebated(answers: PracticeMapChoice["answers"]): number {
  const templates = Object.entries(MAP_OPPOSITE_TEMPLATES).map(([locale, template]) => Object.freeze({ empty: template.empty,
    lead: `${template.lead}${Object.hasOwn(MAP_OPPOSITE_SEPARATORS, locale) ? MAP_OPPOSITE_SEPARATORS[locale]! : ": "}` }));
  return answers.filter((answer) => answer.filled === true && typeof answer.statement === "string"
    && templates.some((template) => answer.statement === template.empty || answer.statement!.startsWith(template.lead))).length;
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}

function sizesOf(shape: DebateShapeCeilingInput): PracticeShapeSizes {
  return Object.freeze({
    plan: shape.plan, depthMode: shape.depthMode, scrutiny: shape.scrutiny, answerLength: shape.answerLength,
    mapAIs: shape.mapAIs, answers: shape.answers, graders: shape.graders, pointsPerAnswer: shape.pointsPerAnswer,
    deeperTopPoints: shape.deeperTopPoints, gapRounds: shape.gapRounds, closeCallExtraGraders: shape.closeCallExtraGraders,
    opening: shape.opening
  });
}

/** Reads what the run did, from the throwaway database, before it is deleted. Codes and counts only. */
export async function readPracticeShapeFacts(pool: Pick<Pool, "query">, runId: string, answerId: string | null,
  readers: PracticeMapReaders): Promise<PracticeShapeFacts> {
  const run = (await pool.query<{ depth_params: unknown; envelope_basis: unknown }>(
    "SELECT depth_params, envelope_basis FROM core.run WHERE run_id=$1", [runId])).rows[0];
  const shape = run === undefined ? undefined : parseCostEnvelopeBasis(run.envelope_basis).shape;
  // Pre-flight PF-D13: serve.condition_mark is keyed by (answer_id, answer_version) (migrations/0006_s05.sql) and a new
  // answer version copies its marks, so only the answer's latest version in serve.answer is counted.
  const marks = answerId === null ? [] : (await pool.query<{ mark: string; n: number }>(
    `SELECT mark, count(*)::int AS n FROM serve.condition_mark
      WHERE answer_id=$1 AND answer_version = (SELECT max(answer_version) FROM serve.answer WHERE answer_id=$1)
      GROUP BY mark ORDER BY mark`, [answerId])).rows;
  const keys = (await pool.query<{ call_site_key: string }>(
    `SELECT call_site_key FROM ledger.ledger_entry
      WHERE run_id=$1 AND action_kind='MODEL_CALL' AND call_site_key LIKE 'MAP:%' ORDER BY sequence`, [runId])).rows;
  const choice = await readers.choice(runId);
  // Engine 2 (R3, INTERFACE §15.4, D1): the check's stored codes and the premise-exempt ids the checker answered null for
  // (both codes only, core.map_answer_check), and, only when a check row exists, the assumptions per debated answer.
  const checkRow = (await pool.query<{ answer_check: string[]; premise_exempt: string[] }>(
    "SELECT answer_check, premise_exempt FROM core.map_answer_check WHERE run_id=$1", [runId])).rows[0];
  return Object.freeze({
    storedDepthParams: recordOf(run?.depth_params),
    sizes: shape === undefined ? null : sizesOf(shape),
    marks: Object.freeze(Object.fromEntries(marks.map((row) => [row.mark, row.n]))),
    choice: choice === null ? null
      : Object.freeze({ opening: choice.opening, answers: choice.answers.length, alsoRaised: choice.alsoRaised.length }),
    mapCallSiteKeys: Object.freeze(keys.map((row) => row.call_site_key)),
    answerCheckCodes: checkRow === undefined ? null : Object.freeze([...checkRow.answer_check]),
    checkPremiseExempt: checkRow === undefined ? null : checkRow.premise_exempt.length,
    assumptionsPerAnswer: checkRow === undefined || choice === null ? null
      : Object.freeze(choice.answers.map((answer) => answer.assumptions?.length ?? 0)),
    // Carried from Tasks 7 and 8: engine 2 only (a check row), from the stored choice the practice already read.
    ...(checkRow === undefined || choice === null ? {} : { templateFillsDebated: practiceTemplateFillsDebated(choice.answers) })
  });
}

const MAP_UNAVAILABLE = "MAP_UNAVAILABLE_TODAYS_OPENING";

/** The report's block. `facts` null: nothing was admitted (or, with `unreadable`, the facts could not be read). Pure. */
export function practiceShapeBlock(input: Readonly<{
  source: PracticeShapeSource; registerVersion: string; row: PracticeShapeRowChange | null; asked: PracticeShapeAsk;
  facts: PracticeShapeFacts | null; unreadable?: string;
  /** Carried from Task 4: the check's refused empty reasons (`practiceCheckEmptyReasons`); shown only with a check. */
  checkEmptyReasons?: number;
}>): PracticeShapeBlock {
  const facts = input.facts;
  const marks = facts?.marks ?? {};
  const byStep: Record<PracticeMapStep, number> = { angles: 0, list: 0, merge: 0, gap: 0, choose: 0, check: 0 };
  for (const key of facts?.mapCallSiteKeys ?? []) {
    const step = practiceMapStepOf(key);
    if (step !== null) byStep[step] += 1;
  }
  // Pre-flight PF-D12: a fallen-back map still stores its choice, with the opening TODAYS_OPENING and no answers; the
  // stored opening says so even when no answer was served to carry the mark.
  const mapUnavailable = (marks[MAP_UNAVAILABLE] ?? 0) > 0 || facts?.choice?.opening === "TODAYS_OPENING";
  // Ruling C-TWO (controller ruling D-NOTARGUED, pre-flight PF-D11): fewer than two of the map's answers, so the run argued
  // today's opening. No mark records it; the stored choice keeps exactly the answers the run planned to argue.
  const notArgued = !mapUnavailable && facts !== null && facts.choice !== null && !mapAnswersArgued(facts.choice.answers);
  const notExercised = input.unreadable !== undefined ? `FACTS_UNREADABLE:${input.unreadable}`
    : facts === null ? null
      : facts.sizes === null ? "NO_SHAPE_ON_RECEIPT"
        : mapUnavailable ? MAP_UNAVAILABLE
          : facts.choice === null ? "NO_MAP_STORED"
            : notArgued ? "MAP_ANSWERS_NOT_ARGUED" : null;
  return Object.freeze({
    source: input.source,
    registerVersion: input.registerVersion,
    row: input.row,
    asked: Object.freeze({ depthMode: input.asked.depthMode ?? null, scrutiny: input.asked.scrutiny ?? null,
      answerLength: input.asked.answerLength ?? null }),
    storedDepthParams: facts?.storedDepthParams ?? null,
    sizes: facts?.sizes ?? null,
    opening: facts === null ? null : mapUnavailable || notArgued ? "TODAYS_OPENING"
      : facts.choice === null ? null : facts.sizes?.opening ?? null,
    mapMarks: Object.freeze(Object.fromEntries(Object.entries(marks).filter(([code]) => (MAP_MARKS as readonly string[]).includes(code)))),
    chosenAnswers: facts?.choice?.answers ?? null,
    alsoRaised: facts?.choice?.alsoRaised ?? null,
    panelCloseCallExtensions: marks["PANEL-CLOSE-CALL-EXTENDED"] ?? 0,
    scrutinyExtensions: marks["SCRUTINY-EXTENDED"] ?? 0,
    mapCallsByStep: Object.freeze(byStep),
    answerCheck: practiceAnswerCheckBlock(facts?.answerCheckCodes ?? null, marks, { premiseExempt: facts?.checkPremiseExempt ?? null,
      assumptionsPerAnswer: facts?.assumptionsPerAnswer ?? null,
      ...(input.checkEmptyReasons === undefined ? {} : { emptyReasons: input.checkEmptyReasons }),
      ...(facts?.templateFillsDebated === undefined ? {} : { templateFillsDebated: facts.templateFillsDebated }) }),
    mapFallbacks: practiceMapFallbacks(marks),
    notExercised
  });
}

/** The report.md paragraph: counts and codes, never model text. */
export function practiceShapeLines(block: PracticeShapeBlock): readonly string[] {
  const where = block.source === "FLAG"
    ? `from --shape-policy, in this throwaway register only: version ${block.registerVersion}, row ${block.row === null ? "added" : block.row.toLowerCase()}`
    : `from the imported register's own row, version ${block.registerVersion}`;
  const asked = `depth mode ${block.asked.depthMode ?? "default"}, scrutiny ${block.asked.scrutiny ?? "default"}, `
    + `answer length ${block.asked.answerLength ?? "default"}`;
  const sizes = block.sizes === null ? "none (the run was not admitted with the shape)"
    : `plan ${block.sizes.plan}, ${String(block.sizes.mapAIs)} map AIs, up to ${String(block.sizes.answers)} answers, `
      + `${String(block.sizes.graders)} graders (+${String(block.sizes.closeCallExtraGraders)} on a close call), `
      + `${String(block.sizes.pointsPerAnswer)} points per answer, ${block.sizes.depthMode}, scrutiny ${block.sizes.scrutiny}, `
      + `answer length ${block.sizes.answerLength}`;
  const steps = PRACTICE_MAP_STEPS.map((step) => `${step} ${String(block.mapCallsByStep[step])}`).join(", ");
  const marks = Object.entries(block.mapMarks);
  const counted = (value: number | null) => (value === null ? "none stored" : String(value));
  return [`Debate shape (${where}):`, "",
    `- asked: ${asked}; stored: ${block.storedDepthParams === null ? "nothing" : JSON.stringify(block.storedDepthParams)}`,
    `- sizes on the run's receipt: ${sizes}`,
    `- opening used: ${block.opening ?? "none"}`,
    `- map calls (every try, as the ledger recorded them): ${steps}`,
    ...(block.answerCheck === null ? [] : [(() => {
      const check = block.answerCheck;
      const per = check.assumptionsPerAnswer;
      const assumptions = per === null ? "unread" : per.length === 0 ? "none debated"
        : `${per.join(", ")} (mean ${(per.reduce((sum, n) => sum + n, 0) / per.length).toFixed(1)}, max ${String(Math.max(...per))})`;
      // Carried from Tasks 4, 7 and 8: each only when it was read.
      const carried = [
        ...(check.emptyReasons === undefined ? [] : [`${String(check.emptyReasons)} empty ${check.emptyReasons === 1 ? "reason" : "reasons"} refused`]),
        ...(check.templateFillsDebated === undefined ? []
          : [`${String(check.templateFillsDebated)} template ${check.templateFillsDebated === 1 ? "fill" : "fills"} debated`])
      ];
      return `- answer check: ${String(check.checked)} checked, ${String(check.rejected)} rejected (${String(check.notAnAnswer)} not an answer, `
        + `${String(check.addedFact)} adding a fact, ${String(check.noCost)} with no cost named), `
        + `${check.premiseExempt === null ? "unread" : String(check.premiseExempt)} exempt as premise challenges; `
        + `${String(check.replaced)} replaced, ${String(check.dropped)} dropped, ${String(check.keptUnchecked)} kept, `
        + `${String(check.unavailable)} unavailable; assumptions per answer ${assumptions}`
        + carried.map((part) => `; ${part}`).join("");
    })()]),
    `- map fallbacks: merge ${String(block.mapFallbacks.merge)}, choose ${String(block.mapFallbacks.choose)}`,
    `- chosen answers: ${counted(block.chosenAnswers)}; also raised, not debated: ${counted(block.alsoRaised)}`,
    `- map marks: ${marks.length === 0 ? "none" : marks.map(([mark, n]) => `${mark} x${String(n)}`).join(", ")}`,
    `- points whose close call called for extra graders: ${String(block.panelCloseCallExtensions)}; points scrutinised further: ${String(block.scrutinyExtensions)}`,
    ...(block.notExercised === null ? [] : [`- the new shape was not exercised: ${block.notExercised}`]),
    ""];
}

/** The map as transcript.json holds it (`structure.map`): P2b's choice and every map item, decrypted. */
export async function readPracticeMap(readers: PracticeMapReaders, runId: string): Promise<Readonly<{
  choice: PracticeMapChoice | null; items: readonly unknown[];
}>> {
  return Object.freeze({ choice: await readers.choice(runId), items: await readers.items(runId) });
}
