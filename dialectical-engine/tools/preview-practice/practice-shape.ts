/**
 * Preview practice, mode "debate": the new debate shape (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md
 * §5 "Practice"; plan 2026-10-12-debate-shape-phase2d).
 *
 * Plain words: the shape is switched on by one register row, debateShapePolicy, and the live preview has none. So a
 * practice debate runs today's shape unless it is asked for the new one:
 *  - `--shape-policy FILE`: the row from FILE, checked by the register's own parser, is put into the practice's
 *    THROWAWAY register only (practice-register-import.ts publishPracticeShapeVersion); the export file is only read
 *    and the live register is never reached;
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
import { MAP_MARKS, mapAnswersArgued, readMapChoiceForRun, readMapItemsForRun } from "@debateai/map";
import { PracticeRefusal } from "./practice-settings.js";
import { PRACTICE_MAP_STEPS, practiceMapStepOf, type PracticeMapStep } from "./practice-lanes.js";

export const PRACTICE_SHAPE_FLAGS = Object.freeze(["--shape-policy", "--depth-mode", "--scrutiny", "--answer-length"] as const);

/** The practice ask's settings, as given on the command line (a missing one is the site's default). */
export type PracticeShapeAsk = Readonly<{ depthMode?: DepthMode; scrutiny?: Scrutiny; answerLength?: AnswerLength }>;
/** `policy`: the row --shape-policy puts into the throwaway register (null: none given). */
export type PracticeShapeOverride = Readonly<{ policy: DebateShapePolicy | null; ask: PracticeShapeAsk }>;

const POLICY_INVALID_PREFIX = "DEBATE_SHAPE_POLICY_INVALID:";

/** The file's text, read and checked by the register's own parser. A refusal names only the place that is wrong. */
export function parsePracticeShapePolicyText(text: string): DebateShapePolicy {
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
}>;

export type PracticeShapeBlock = Readonly<{
  source: PracticeShapeSource;
  /** The throwaway register version the debate ran on. */
  registerVersion: string;
  /** FLAG only: ADDED or REPLACED; null for REGISTER. */
  row: "ADDED" | "REPLACED" | null;
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
  /** Why the new shape did not run (the verdict's SHAPE_NOT_EXERCISED reason); null when it ran or nothing was admitted. */
  notExercised: string | null;
}>;

/** P2b's map choice as the practice counts it (structurally P2b's `MapChoiceRecord`, packages/map/src/repository.ts). */
export type PracticeMapChoice = Readonly<{ opening: string; answers: readonly unknown[]; alsoRaised: readonly unknown[] }>;
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
  return Object.freeze({
    storedDepthParams: recordOf(run?.depth_params),
    sizes: shape === undefined ? null : sizesOf(shape),
    marks: Object.freeze(Object.fromEntries(marks.map((row) => [row.mark, row.n]))),
    choice: choice === null ? null
      : Object.freeze({ opening: choice.opening, answers: choice.answers.length, alsoRaised: choice.alsoRaised.length }),
    mapCallSiteKeys: Object.freeze(keys.map((row) => row.call_site_key))
  });
}

const MAP_UNAVAILABLE = "MAP_UNAVAILABLE_TODAYS_OPENING";

/** The report's block. `facts` null: nothing was admitted (or, with `unreadable`, the facts could not be read). Pure. */
export function practiceShapeBlock(input: Readonly<{
  source: PracticeShapeSource; registerVersion: string; row: "ADDED" | "REPLACED" | null; asked: PracticeShapeAsk;
  facts: PracticeShapeFacts | null; unreadable?: string;
}>): PracticeShapeBlock {
  const facts = input.facts;
  const marks = facts?.marks ?? {};
  const byStep: Record<PracticeMapStep, number> = { angles: 0, list: 0, merge: 0, gap: 0, choose: 0 };
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
    notExercised
  });
}

/** The report.md paragraph: counts and codes, never model text. */
export function practiceShapeLines(block: PracticeShapeBlock): readonly string[] {
  const where = block.source === "FLAG"
    ? `from --shape-policy, in this throwaway register only: version ${block.registerVersion}, row ${block.row === "REPLACED" ? "replaced" : "added"}`
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
    `- chosen answers: ${counted(block.chosenAnswers)}; also raised, not debated: ${counted(block.alsoRaised)}`,
    `- map marks: ${marks.length === 0 ? "none" : marks.map(([mark, n]) => `${mark} x${String(n)}`).join(", ")}`,
    `- points whose close call called for extra graders: ${String(block.panelCloseCallExtensions)}; points scrutinised further: ${String(block.scrutinyExtensions)}`,
    ...(block.notExercised === null ? [] : [`- the new shape was not exercised: ${block.notExercised}`]),
    ""];
}
