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
import {
  AnswerLengthSchema,
  DepthModeSchema,
  ScrutinySchema,
  type AnswerLength,
  type DepthMode,
  type Scrutiny
} from "@debateai/contract";
import { debateShapeInForce, parseDebateShapePolicy, type DebateShapePolicy } from "@debateai/register";
import { PracticeRefusal } from "./practice-settings.js";

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
